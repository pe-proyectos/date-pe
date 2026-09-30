import { statfs } from 'node:fs/promises';
import { admin } from '../db.js';
import { env } from '../env.js';
import { sendEmail, layout } from './email.js';

// Alertas de la plataforma: se guardan siempre y se mandan por correo al equipo
// de date.pe, como máximo una vez cada 30 minutos por tipo para no llenar la bandeja.
const THROTTLE_MS = 30 * 60_000;
const lastSent = new Map<string, number>();

export async function platformEmails(): Promise<string[]> {
  if (env.platformNotifyEmail) return env.platformNotifyEmail.split(',').map((e) => e.trim()).filter(Boolean);
  const { rows } = await admin<{ email: string }>('SELECT email FROM users WHERE is_platform_admin');
  return rows.map((r) => r.email);
}

export async function alert(kind: string, message: string, detail?: unknown, level: 'info' | 'warn' | 'error' = 'error') {
  const text = detail instanceof Error ? `${detail.message}\n${detail.stack ?? ''}` : detail == null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail);
  const now = Date.now();
  const shouldEmail = level !== 'info' && now - (lastSent.get(kind) ?? 0) > THROTTLE_MS;
  if (shouldEmail) lastSent.set(kind, now);
  try {
    await admin('INSERT INTO platform_alerts (kind, level, message, detail, emailed) VALUES ($1, $2, $3, $4, $5)', [kind, level, message, text?.slice(0, 4000) ?? null, shouldEmail]);
  } catch {
    // sin base de datos igual intentamos avisar por correo
  }
  if (!shouldEmail) return;
  try {
    const html = layout({
      brand: 'date.pe',
      title: level === 'warn' ? `Atención: ${message}` : `Falla: ${message}`,
      intro: (text ?? 'Sin más detalle.').slice(0, 1500),
      cta: { label: 'Ver estado de la plataforma', href: `${env.appPublicUrl}/superadmin#estado` },
      foot: 'Aviso automático de date.pe. Si se repite, no te llegará otro correo del mismo tipo por 30 minutos.',
    });
    for (const to of await platformEmails()) await sendEmail({ to, subject: `[date.pe] ${level === 'warn' ? 'Atención' : 'Falla'}: ${message}`, html });
  } catch {
    // nada más que hacer
  }
}

export async function setState(key: string, value: unknown) {
  await admin(
    `INSERT INTO platform_state (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value ?? {})],
  );
}

export async function getState<T = Record<string, unknown>>(key: string): Promise<{ value: T; updated_at: Date } | null> {
  const { rows } = await admin<{ value: T; updated_at: Date }>('SELECT value, updated_at FROM platform_state WHERE key = $1', [key]);
  return rows[0] ?? null;
}

/** Espacio libre del disco donde vive el servidor (el contenedor ve el disco del host). */
export async function diskUsage(path = '/'): Promise<{ totalGb: number; freeGb: number; usedPct: number } | null> {
  try {
    const s = await statfs(path);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { totalGb: +(total / 1e9).toFixed(1), freeGb: +(free / 1e9).toFixed(1), usedPct: Math.round(((total - free) / total) * 100) };
  } catch {
    return null;
  }
}

/** Revisión cada 5 minutos: disco y que el vigía siga vivo. */
export async function resourcesPass() {
  const w = await getState('watchdog');
  if (w && Date.now() - new Date(w.updated_at).getTime() > 10 * 60_000) {
    await alert('vigia', 'el vigía de date.pe dejó de revisar', 'El contenedor datepe-watchdog no reporta hace más de 10 minutos. Revisa con: docker compose ps', 'warn');
  }
  const d = await diskUsage();
  if (d && d.usedPct >= 90) {
    await alert('disco', `el disco del servidor está al ${d.usedPct}%`, `Quedan ${d.freeGb} GB libres de ${d.totalGb} GB. Si se llena, la base de datos deja de guardar citas y ventas.`, d.usedPct >= 95 ? 'error' : 'warn');
  }
}
