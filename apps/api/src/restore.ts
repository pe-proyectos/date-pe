// Restaurar un respaldo de la base desde R2.
//
//   pnpm --filter @datepe/api restore list
//   pnpm --filter @datepe/api restore latest --file /tmp/datepe.dump      (solo descarga y descifra)
//   pnpm --filter @datepe/api restore latest --into datepe_restaurada       (restaura en otra base)
//   pnpm --filter @datepe/api restore <clave> --into datepe --i-know-this-replaces-production
//
// Necesita en el entorno: BACKUP_KEY, R2_* y DATABASE_URL (usuario dueño de la base).
import { spawn } from 'node:child_process';
import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { env } from './env.js';
import { decryptFile, downloadBackup, listBackups } from './lib/backup.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} salió con código ${code}`))));
  });
}

async function main() {
  const which = process.argv[2];
  const all = await listBackups();
  if (!which || which === 'list') {
    for (const b of all) console.log(`${b.at.toISOString()}  ${(b.size / 1e6).toFixed(1)} MB  ${b.key}`);
    if (!all.length) console.log('No hay respaldos en R2.');
    return;
  }
  const key = which === 'latest' ? all[0]?.key : which;
  if (!key) throw new Error('No hay respaldos para restaurar');
  const file = arg('--file');
  const into = arg('--into');
  if (!file && !into) throw new Error('Indica --file <ruta> o --into <base>');

  const dir = await mkdtemp(join(tmpdir(), 'datepe-restore-'));
  try {
    console.log(`Descargando ${key}`);
    await downloadBackup(key, join(dir, 'enc'));
    await decryptFile(join(dir, 'enc'), join(dir, 'dump'));
    console.log('Descifrado y verificado (AES-256-GCM).');
    if (file) {
      await copyFile(join(dir, 'dump'), file);
      console.log(`Volcado guardado en ${file}. Restaurar con: pg_restore --no-owner -d <url> ${file}`);
    }
    if (into) {
      const current = new URL(env.databaseUrl).pathname.slice(1);
      if (into === current && !process.argv.includes('--i-know-this-replaces-production')) {
        throw new Error(`"${into}" es la base en uso. Restaura en otra base o agrega --i-know-this-replaces-production`);
      }
      const u = new URL(env.databaseUrl);
      u.pathname = '/postgres';
      const c = new pg.Client({ connectionString: u.toString() });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS "${into.replace(/"/g, '')}" WITH (FORCE)`);
      await c.query(`CREATE DATABASE "${into.replace(/"/g, '')}"`);
      await c.end();
      u.pathname = `/${into}`;
      await run('pg_restore', ['--no-owner', '--exit-on-error', '-d', u.toString(), join(dir, 'dump')]);
      console.log(`Listo: restaurado en la base "${into}".`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error((err as Error).message);
    process.exit(1);
  },
);
