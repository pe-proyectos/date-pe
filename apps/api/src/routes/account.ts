import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { withTenant } from '../db.js';
import { env } from '../env.js';
import { requestCode, checkCode } from '../lib/verify.js';

// Cuenta del cliente en cada barbería: entra con un código al correo y ve sus citas,
// puntos, paquetes y membresías, y repite su último corte en un toque.
const TTL = 60 * 86_400_000;
const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (body: string) => createHmac('sha256', `${env.jwtSecret}|cliente`).update(body).digest('base64url');

function issue(tenantId: string, email: string) {
  const body = b64(JSON.stringify({ t: tenantId, e: email, x: Date.now() + TTL }));
  return `${body}.${sign(body)}`;
}

function readToken(request: FastifyRequest): { tenantId: string; email: string } | null {
  const raw = String(request.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as { t: string; e: string; x: number };
    if (p.x < Date.now() || p.t !== request.tenant?.id) return null;
    return { tenantId: p.t, email: p.e };
  } catch {
    return null;
  }
}

export const accountRoutes: FastifyPluginAsync = async (app) => {
  app.post('/public/account/code', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const { email } = z.object({ email: z.string().trim().email().max(160) }).parse(request.body);
    const r = await requestCode(request.tenant.id, request.tenant.name, email.toLowerCase(), 'cuenta');
    if (!r.ok) return reply.code(r.error === 'espera_un_minuto' ? 429 : 502).send({ error: r.error });
    return { ok: true };
  });

  app.post('/public/account/verify', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const b = z.object({ email: z.string().trim().email().max(160), code: z.string().trim().regex(/^\d{6}$/) }).parse(request.body);
    const email = b.email.toLowerCase();
    if (!(await checkCode(request.tenant.id, email, b.code))) return reply.code(400).send({ error: 'codigo_incorrecto' });
    return { token: issue(request.tenant.id, email) };
  });

  app.get('/public/account', async (request, reply) => {
    const who = readToken(request);
    if (!who) return reply.code(401).send({ error: 'sesion_vencida' });
    return withTenant(who.tenantId, async (sql) => {
      const clients = await sql<{ id: string; name: string | null; phone: string; loyalty_points: number; referral_code: string | null }>(
        'SELECT id, name, phone, loyalty_points, referral_code FROM clients WHERE lower(email) = $1 ORDER BY created_at',
        [who.email],
      );
      const ids = clients.rows.map((c) => c.id);
      if (!ids.length) return { email: who.email, name: null, points: 0, upcoming: [], past: [], packages: [], memberships: [], rewards: [], referralCode: null };
      const apptCols = `a.id, a.starts_at, a.status, a.price_cents, a.manage_token, a.staff_id, st.name AS staff_name, st.photo_url AS staff_photo,
                        (SELECT string_agg(sv.name, ', ' ORDER BY sv.is_addon) FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id WHERE aps.appointment_id = a.id) AS services,
                        (SELECT aps.service_id FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id WHERE aps.appointment_id = a.id AND NOT sv.is_addon LIMIT 1) AS service_id,
                        (SELECT name FROM locations l WHERE l.id = a.location_id) AS location_name`;
      const [upcoming, past, packages, memberships, rewards] = await Promise.all([
        sql(`SELECT ${apptCols} FROM appointments a LEFT JOIN staff st ON st.id = a.staff_id WHERE a.client_id = ANY($1) AND a.starts_at > now() - interval '1 hour' AND a.status IN ('pending','confirmed') ORDER BY a.starts_at LIMIT 10`, [ids]),
        sql(`SELECT ${apptCols} FROM appointments a LEFT JOIN staff st ON st.id = a.staff_id WHERE a.client_id = ANY($1) AND (a.starts_at < now() OR a.status IN ('completed','no_show','cancelled')) ORDER BY a.starts_at DESC LIMIT 20`, [ids]),
        sql(`SELECT id, name, uses_left, uses_total, expires_at FROM client_packages WHERE client_id = ANY($1) AND uses_left > 0 AND (expires_at IS NULL OR expires_at > now()) ORDER BY expires_at NULLS LAST`, [ids]),
        sql(`SELECT id, name, ends_at FROM client_memberships WHERE client_id = ANY($1) AND ends_at > now() ORDER BY ends_at`, [ids]),
        sql(`SELECT id, name, points_cost FROM rewards WHERE active ORDER BY points_cost`),
      ]);
      const points = clients.rows.reduce((a, c) => a + (c.loyalty_points ?? 0), 0);
      return {
        email: who.email,
        name: clients.rows.find((c) => c.name)?.name ?? null,
        points,
        referralCode: clients.rows.find((c) => c.referral_code)?.referral_code ?? null,
        upcoming: upcoming.rows,
        past: past.rows,
        packages: packages.rows,
        memberships: memberships.rows,
        rewards: rewards.rows.map((r: Record<string, unknown>) => ({ ...r, available: points >= Number(r.points_cost) })),
      };
    });
  });
};
