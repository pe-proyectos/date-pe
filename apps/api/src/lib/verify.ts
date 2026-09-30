import { createHash, randomInt } from 'node:crypto';
import { admin } from '../db.js';
import { sendEmail, layout } from './email.js';

// Verificación del cliente con un código de 6 dígitos. Hoy por correo; el canal
// WhatsApp usa la misma tabla cuando se active.
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const keyOf = (tenantId: string, email: string) => `${tenantId}|${email.trim().toLowerCase()}`;

export async function requestCode(tenantId: string, tenantName: string, email: string): Promise<{ ok: boolean; error?: string }> {
  const key = keyOf(tenantId, email);
  // Máximo un código por minuto por correo
  const recent = await admin("SELECT 1 FROM otp_codes WHERE key = $1 AND expires_at > now() + interval '9 minutes'", [key]);
  if (recent.rows.length > 0) return { ok: false, error: 'espera_un_minuto' };
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await admin(
    `INSERT INTO otp_codes (key, code_hash, attempts, expires_at, verified_at) VALUES ($1, $2, 0, now() + interval '10 minutes', NULL)
     ON CONFLICT (key) DO UPDATE SET code_hash = EXCLUDED.code_hash, attempts = 0, expires_at = EXCLUDED.expires_at, verified_at = NULL`,
    [key, hash(code)],
  );
  const r = await sendEmail({
    to: email,
    fromName: tenantName,
    subject: `${code} es tu código para reservar en ${tenantName}`,
    html: layout({
      brand: tenantName,
      title: `Tu código: ${code}`,
      intro: 'Escríbelo en la página de reserva para confirmar que este correo es tuyo. Vence en 10 minutos.',
      foot: 'Si no fuiste tú, ignora este correo.',
    }),
  });
  return r.ok ? { ok: true } : { ok: false, error: 'no_se_pudo_enviar' };
}

export async function checkCode(tenantId: string, email: string, code: string): Promise<boolean> {
  const key = keyOf(tenantId, email);
  const { rows } = await admin<{ code_hash: string; attempts: number }>(
    'UPDATE otp_codes SET attempts = attempts + 1 WHERE key = $1 AND expires_at > now() RETURNING code_hash, attempts',
    [key],
  );
  const row = rows[0];
  if (!row || row.attempts > 5 || row.code_hash !== hash(code.trim())) return false;
  await admin('UPDATE otp_codes SET verified_at = now() WHERE key = $1', [key]);
  return true;
}

export async function isVerified(tenantId: string, email: string): Promise<boolean> {
  const { rows } = await admin("SELECT 1 FROM otp_codes WHERE key = $1 AND verified_at > now() - interval '30 minutes'", [keyOf(tenantId, email)]);
  return rows.length > 0;
}
