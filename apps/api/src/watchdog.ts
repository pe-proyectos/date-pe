// Vigía: proceso aparte (contenedor datepe-watchdog) que cada minuto revisa que
// date.pe responda como lo ve un cliente. Si algo falla 3 veces seguidas avisa por
// correo; cuando vuelve, avisa cuánto tiempo estuvo caído. Una vez por hora revisa
// que el certificado HTTPS no esté por vencer.
import tls from 'node:tls';
import { env } from './env.js';
import { alert, setState } from './lib/alerts.js';

const EVERY_MS = 60_000;
const FAILS_TO_ALERT = 3;
const base = env.baseDomain;

interface Check {
  id: string;
  label: string;
  url: string;
  ok: (res: Response, body: string) => boolean;
}

const CHECKS: Check[] = [
  {
    id: 'api',
    label: 'API y base de datos',
    url: `https://${base}/api/health`,
    ok: (r, b) => {
      if (!r.ok) return false;
      try {
        const j = JSON.parse(b) as { db?: boolean; scheduler?: string };
        return j.db === true && j.scheduler !== 'stale';
      } catch {
        return false;
      }
    },
  },
  { id: 'web', label: `Página principal ${base}`, url: `https://${base}/`, ok: (r) => r.ok },
  { id: 'tenant', label: 'Página de una barbería', url: `https://barberiajuana.${base}/`, ok: (r) => r.ok },
];

const state = new Map<string, { fails: number; downSince: number | null; lastError: string | null; lastOkAt: number | null; ms: number | null }>();

async function probe(c: Check) {
  const s = state.get(c.id) ?? { fails: 0, downSince: null, lastError: null, lastOkAt: null, ms: null };
  const t0 = Date.now();
  let error: string | null = null;
  try {
    const res = await fetch(c.url, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'datepe-watchdog' }, redirect: 'manual' });
    const body = await res.text();
    if (!c.ok(res, body)) error = `respondió ${res.status}${c.id === 'api' ? `: ${body.slice(0, 200)}` : ''}`;
  } catch (err) {
    error = (err as Error).name === 'TimeoutError' ? 'no respondió en 15 segundos' : (err as Error).message;
  }
  s.ms = Date.now() - t0;
  if (error) {
    s.fails += 1;
    s.lastError = error;
    if (s.fails === FAILS_TO_ALERT) {
      s.downSince = Date.now() - (FAILS_TO_ALERT - 1) * EVERY_MS;
      await alert(`caida:${c.id}`, `${c.label} está caído`, `${c.url}\n${error}\nLleva ${FAILS_TO_ALERT} revisiones seguidas fallando.`);
    }
  } else {
    if (s.downSince) {
      const min = Math.max(1, Math.round((Date.now() - s.downSince) / 60_000));
      await alert(`vuelve:${c.id}`, `${c.label} volvió`, `Estuvo caído unos ${min} minutos. Último error: ${s.lastError ?? 'sin detalle'}`, 'warn');
    }
    s.fails = 0;
    s.downSince = null;
    s.lastOkAt = Date.now();
  }
  state.set(c.id, s);
}

function certDaysLeft(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port: 443, servername: host, timeout: 10_000 }, () => {
      const cert = sock.getPeerCertificate();
      sock.end();
      if (!cert?.valid_to) return reject(new Error('sin certificado'));
      resolve(Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000));
    });
    sock.on('error', reject);
    sock.on('timeout', () => {
      sock.destroy();
      reject(new Error('tiempo agotado'));
    });
  });
}

let lastCertCheck = 0;
const certs: Record<string, number | null> = {};

async function tick() {
  await Promise.all(CHECKS.map(probe));
  if (Date.now() - lastCertCheck > 3_600_000) {
    lastCertCheck = Date.now();
    for (const host of [base, `barberiajuana.${base}`]) {
      try {
        const days = await certDaysLeft(host);
        certs[host] = days;
        if (days < 14) await alert(`cert:${host}`, `el certificado HTTPS de ${host} vence en ${days} días`, 'Traefik debería renovarlo solo. Si no lo hace, revisa el proxy de Coolify.', days < 5 ? 'error' : 'warn');
      } catch {
        certs[host] = null;
      }
    }
  }
  const checks = CHECKS.map((c) => {
    const s = state.get(c.id)!;
    return { id: c.id, label: c.label, url: c.url, up: s.fails === 0, fails: s.fails, error: s.fails ? s.lastError : null, ms: s.ms, lastOkAt: s.lastOkAt ? new Date(s.lastOkAt).toISOString() : null, downSince: s.downSince ? new Date(s.downSince).toISOString() : null };
  });
  await setState('watchdog', { at: new Date().toISOString(), checks, certs }).catch(() => {});
}

console.log(`[vigía] revisando ${CHECKS.length} direcciones cada ${EVERY_MS / 1000} s`);
setTimeout(() => void tick(), 30_000);
setInterval(() => void tick().catch((err) => console.error('[vigía]', err)), EVERY_MS);
