import { spawn } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform, type Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import { admin } from '../db.js';
import { env } from '../env.js';
import { alert } from './alerts.js';

// Respaldo diario de la base: pg_dump en formato comprimido, cifrado con AES-256-GCM
// (la llave BACKUP_KEY vive solo en .env) y subido a R2 bajo backups/. Se guardan
// 30 días (y al menos los 7 últimos). Cada respaldo se restaura en una base de prueba
// para comprobar que sirve de verdad.
const PREFIX = 'backups/';
const MAGIC = Buffer.from('DPBK1\n');
const KEEP_DAYS = 30;
const KEEP_MIN = 7;
const CHECK_DB = 'datepe_restore_check';
const CHECK_TABLES = ['tenants', 'users', 'clients', 'appointments', 'sales', 'queue_tickets'];

const s3 =
  env.r2Endpoint && env.r2AccessKeyId
    ? new S3Client({ region: 'auto', endpoint: env.r2Endpoint, credentials: { accessKeyId: env.r2AccessKeyId, secretAccessKey: env.r2SecretAccessKey } })
    : null;

function backupKey(): Buffer {
  const raw = env.backupKey;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.alloc(0);
  if (key.length !== 32) throw new Error('BACKUP_KEY falta o no tiene 64 caracteres hexadecimales');
  return key;
}

export function backupsConfigured(): boolean {
  return !!s3 && /^[0-9a-f]{64}$/i.test(env.backupKey);
}

function dbUrl(name?: string) {
  const u = new URL(env.databaseUrl);
  if (name) u.pathname = `/${name}`;
  return u.toString();
}

function run(cmd: string, args: string[], opts: { stdout?: NodeJS.WritableStream } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', opts.stdout ? 'pipe' : 'ignore', 'pipe'] });
    let err = '';
    p.stderr?.on('data', (d) => (err += d.toString()));
    if (opts.stdout && p.stdout) p.stdout.pipe(opts.stdout);
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} salió con código ${code}: ${err.slice(-800)}`))));
  });
}

async function tableCounts(url: string): Promise<Record<string, number>> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const out: Record<string, number> = {};
    for (const t of CHECK_TABLES) out[t] = Number((await c.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n);
    return out;
  } finally {
    await c.end();
  }
}

/** Cifra src en dst: MAGIC + iv(12) + datos + tag(16). Devuelve el sha256 del archivo cifrado. */
async function encryptFile(src: string, dst: string): Promise<string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', backupKey(), iv);
  const hash = createHash('sha256');
  const out = createWriteStream(dst);
  const tee = new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      cb(null, chunk);
    },
    flush(cb) {
      const tag = cipher.getAuthTag();
      hash.update(tag);
      this.push(tag);
      cb();
    },
  });
  hash.update(MAGIC);
  hash.update(iv);
  out.write(MAGIC);
  out.write(iv);
  await pipeline(createReadStream(src), cipher, tee, out);
  return hash.digest('hex');
}

export async function decryptFile(src: string, dst: string): Promise<void> {
  const { size } = await stat(src);
  const fh = await open(src, 'r');
  const head = Buffer.alloc(MAGIC.length + 12);
  const tag = Buffer.alloc(16);
  await fh.read(head, 0, head.length, 0);
  await fh.read(tag, 0, 16, size - 16);
  await fh.close();
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('El archivo no es un respaldo de date.pe');
  const decipher = createDecipheriv('aes-256-gcm', backupKey(), head.subarray(MAGIC.length));
  decipher.setAuthTag(tag);
  await pipeline(createReadStream(src, { start: head.length, end: size - 17 }), decipher, createWriteStream(dst));
}

export async function downloadBackup(objectKey: string, dst: string): Promise<void> {
  if (!s3) throw new Error('r2_no_configurado');
  const out = await s3.send(new GetObjectCommand({ Bucket: env.r2Bucket, Key: objectKey }));
  await pipeline(out.Body as Readable, createWriteStream(dst));
}

export async function listBackups(): Promise<Array<{ key: string; size: number; at: Date }>> {
  if (!s3) return [];
  const items: Array<{ key: string; size: number; at: Date }> = [];
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: env.r2Bucket, Prefix: PREFIX, ContinuationToken: token }));
    for (const o of r.Contents ?? []) if (o.Key && o.LastModified) items.push({ key: o.Key, size: o.Size ?? 0, at: o.LastModified });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** Restaura un volcado en la base de prueba y compara el conteo de filas. */
async function verifyDump(dumpFile: string, expected: Record<string, number>): Promise<string> {
  const c = new pg.Client({ connectionString: dbUrl('postgres') });
  await c.connect();
  try {
    await c.query(`DROP DATABASE IF EXISTS ${CHECK_DB} WITH (FORCE)`);
    await c.query(`CREATE DATABASE ${CHECK_DB}`);
  } finally {
    await c.end();
  }
  try {
    await run('pg_restore', ['--no-owner', '--no-acl', '--exit-on-error', '-d', dbUrl(CHECK_DB), dumpFile]);
    const got = await tableCounts(dbUrl(CHECK_DB));
    const off = CHECK_TABLES.filter((t) => Math.abs(got[t] - expected[t]) > Math.max(5, expected[t] * 0.01));
    if (off.length) throw new Error(`Faltan filas al restaurar: ${off.map((t) => `${t} ${got[t]} de ${expected[t]}`).join(', ')}`);
    return CHECK_TABLES.map((t) => `${t} ${got[t]}`).join(', ');
  } finally {
    const c2 = new pg.Client({ connectionString: dbUrl('postgres') });
    await c2.connect();
    await c2.query(`DROP DATABASE IF EXISTS ${CHECK_DB} WITH (FORCE)`).catch(() => {});
    await c2.end();
  }
}

let running = false;

export async function runBackup(opts: { reason?: string } = {}): Promise<{ id: number; ok: boolean; error?: string }> {
  if (running) return { id: 0, ok: false, error: 'ya_en_curso' };
  const { rows } = await admin<{ id: number }>('INSERT INTO platform_backups (status) VALUES ($1) RETURNING id', ['running']);
  const id = rows[0].id;
  running = true;
  const dir = await mkdtemp(join(tmpdir(), 'datepe-bk-'));
  try {
    if (!s3) throw new Error('R2 no está configurado');
    backupKey();
    const expected = await tableCounts(dbUrl());
    const dump = join(dir, 'datepe.dump');
    const enc = join(dir, 'datepe.dump.enc');
    await run('pg_dump', ['-Fc', '-Z', '6', '--no-owner', '-f', dump, dbUrl()]);
    const verifyNote = await verifyDump(dump, expected);
    const sha256 = await encryptFile(dump, enc);
    // Ida y vuelta: lo que se sube tiene que descifrarse idéntico al volcado
    const back = join(dir, 'roundtrip.dump');
    await decryptFile(enc, back);
    if ((await fileHash(back)) !== (await fileHash(dump))) throw new Error('El respaldo cifrado no se descifra igual al original');
    const { size } = await stat(enc);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const objectKey = `${PREFIX}datepe-${stamp}-${randomBytes(12).toString('hex')}.dump.enc`;
    await s3.send(new PutObjectCommand({ Bucket: env.r2Bucket, Key: objectKey, Body: createReadStream(enc), ContentLength: size, ContentType: 'application/octet-stream' }));
    await admin(
      `UPDATE platform_backups SET status = 'ok', object_key = $2, size_bytes = $3, sha256 = $4, verified_at = now(), verify_note = $5, finished_at = now() WHERE id = $1`,
      [id, objectKey, size, sha256, `Restaurado en prueba${opts.reason === 'manual' ? ' (manual)' : ''}: ${verifyNote}`],
    );
    await pruneBackups().catch((err) => alert('respaldo-limpieza', 'no se pudieron borrar respaldos viejos', err, 'warn'));
    return { id, ok: true };
  } catch (err) {
    const msg = (err as Error).message;
    await admin(`UPDATE platform_backups SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`, [id, msg.slice(0, 2000)]);
    await alert('respaldo', 'el respaldo de la base de datos falló', err);
    return { id, ok: false, error: msg };
  } finally {
    running = false;
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function pruneBackups() {
  if (!s3) return;
  const all = await listBackups();
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  const old = all.slice(KEEP_MIN).filter((o) => o.at.getTime() < cutoff);
  for (const o of old) {
    await s3.send(new DeleteObjectCommand({ Bucket: env.r2Bucket, Key: o.key }));
    await admin('UPDATE platform_backups SET deleted_at = now() WHERE object_key = $1', [o.key]);
  }
}

/**
 * Cada pasada del planificador: un respaldo al día desde las 3 am de Lima.
 * Si el último respaldo bueno tiene más de 26 horas, avisa.
 */
export async function backupPass() {
  if (!backupsConfigured()) return;
  // Un respaldo que quedó a medias (reinicio del servidor) cuenta como fallido
  await admin(`UPDATE platform_backups SET status = 'failed', error = 'interrumpido', finished_at = now() WHERE status = 'running' AND started_at < now() - interval '1 hour'`);
  const { rows } = await admin<{ last_ok: Date | null; today: boolean }>(
    `SELECT max(started_at) FILTER (WHERE status = 'ok') AS last_ok,
            bool_or((started_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date AND status <> 'failed') AS today
       FROM platform_backups`,
  );
  const hourLima = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hourCycle: 'h23' }));
  const { rows: fails } = await admin<{ n: number }>(
    `SELECT count(*)::int AS n FROM platform_backups WHERE status = 'failed' AND (started_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date`,
  );
  // Hasta 3 intentos por día si falla
  if (hourLima >= 3 && !rows[0]?.today && (fails[0]?.n ?? 0) < 3) await runBackup();
  const last = rows[0]?.last_ok;
  if (last && Date.now() - new Date(last).getTime() > 26 * 3_600_000) {
    await alert('respaldo-viejo', 'no hay un respaldo nuevo hace más de un día', `Último respaldo bueno: ${new Date(last).toISOString()}`);
  }
}

async function fileHash(path: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest('hex');
}
