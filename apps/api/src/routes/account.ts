import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { withTenant } from '../db.js';
import { env } from '../env.js';
import { requestCode, checkCode } from '../lib/verify.js';
import { pushEnabled, saveClientSubscription } from '../lib/push.js';
import { tenantConfig } from '../lib/features.js';

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

/** Quién entra: un correo o "p:" + 9 dígitos de celular. Devuelve el filtro de clients para ese dato. */
const clientWhere = (id: string): [string, string] =>
  id.startsWith('p:') ? ["right(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = $1", id.slice(2)] : ['lower(email) = $1', id];

/**
 * El cliente entra con su celular, su correo o su documento (DNI o carné de extranjería).
 * Por ahora el código siempre va al correo que dejó al reservar; cuando haya SMS o WhatsApp
 * se le podrá preguntar por dónde lo quiere recibir.
 */
type Login = { kind: 'email' | 'phone' | 'doc'; value: string };
function parseLogin(raw: string): Login | null {
  const v = raw.trim();
  if (v.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? { kind: 'email', value: v.toLowerCase() } : null;
  const digits = v.replace(/[\s-]/g, '').replace(/^\+?51(?=9\d{8}$)/, '');
  if (/^9\d{8}$/.test(digits)) return { kind: 'phone', value: digits };
  const doc = v.replace(/[\s.-]/g, '').toUpperCase();
  if (/^(\d{8}|[A-Z0-9]{9,12})$/.test(doc)) return { kind: 'doc', value: doc };
  return null;
}
const loginBody = z.object({ login: z.string().max(160) });

/** Correo al que se manda el código (el del cliente que reservó con ese celular o documento). */
async function emailFor(tenantId: string, l: Login): Promise<string | null> {
  if (l.kind === 'email') return l.value;
  const where = l.kind === 'phone' ? "right(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = $1" : 'upper(doc_number) = $1';
  const r = await withTenant(tenantId, (sql) =>
    sql<{ email: string }>(`SELECT lower(email) AS email FROM clients WHERE ${where} AND email IS NOT NULL AND email <> '' ORDER BY created_at DESC LIMIT 1`, [l.value]),
  );
  return r.rows[0]?.email ?? null;
}
const mask = (e: string) => e.replace(/^(.)(.*)(.@.*)$/, (_m, a: string, mid: string, b: string) => `${a}${'*'.repeat(Math.min(6, Math.max(2, mid.length)))}${b}`);

// Códigos por IP: máximo 6 por hora
const codeHits = new Map<string, { n: number; t: number }>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  const h = codeHits.get(ip);
  if (!h || now - h.t > 3_600_000) {
    codeHits.set(ip, { n: 1, t: now });
    if (codeHits.size > 5000) codeHits.clear();
    return false;
  }
  return ++h.n > 6;
}

export const accountRoutes: FastifyPluginAsync = async (app) => {
  // Avisos en el celular del cliente: con el enlace de su cita o con su cuenta
  app.get('/public/push/key', async () => ({ key: pushEnabled() ? env.vapidPublicKey : null }));

  app.post('/public/push/client', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const tenantId = request.tenant.id;
    const b = z
      .object({ manageToken: z.string().max(80).optional(), subscription: z.object({ endpoint: z.string().url().max(800), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }) })
      .parse(request.body);
    const who = readToken(request);
    const clientId = await withTenant(tenantId, async (sql) => {
      if (b.manageToken) {
        const r = await sql<{ client_id: string | null }>('SELECT client_id FROM appointments WHERE manage_token = $1', [b.manageToken]);
        return r.rows[0]?.client_id ?? null;
      }
      if (who) {
        const [where, v] = clientWhere(who.email);
        const r = await sql<{ id: string }>(`SELECT id FROM clients WHERE ${where} ORDER BY created_at LIMIT 1`, [v]);
        return r.rows[0]?.id ?? null;
      }
      return null;
    });
    if (!clientId) return reply.code(404).send({ error: 'cliente_no_encontrado' });
    await saveClientSubscription({ tenantId, clientId, endpoint: b.subscription.endpoint, p256dh: b.subscription.keys.p256dh, auth: b.subscription.keys.auth });
    return { ok: true };
  });

  // Canales para recibir el código. Hoy solo correo; luego SMS y WhatsApp.
  app.get('/public/account/options', async () => ({ channels: ['email'] }));

  app.post('/public/account/code', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const l = parseLogin(loginBody.parse(request.body).login);
    if (!l) return reply.code(400).send({ error: 'dato_invalido' });
    if (tooMany(String(request.headers['cf-connecting-ip'] ?? '') || String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || request.ip)) return reply.code(429).send({ error: 'demasiados_intentos' });
    const email = await emailFor(request.tenant.id, l);
    if (!email) return reply.code(404).send({ error: 'sin_correo' });
    const r = await requestCode(request.tenant.id, request.tenant.name, email, 'cuenta');
    if (!r.ok && r.error !== 'espera_un_minuto') return reply.code(502).send({ error: r.error });
    return { ok: true, channel: 'email', sentTo: mask(email), recent: r.error === 'espera_un_minuto' };
  });

  app.post('/public/account/verify', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const b = z.object({ login: z.string().max(160), code: z.string().trim().regex(/^\d{6}$/) }).parse(request.body);
    const l = parseLogin(b.login);
    const email = l ? await emailFor(request.tenant.id, l) : null;
    if (!email || !(await checkCode(request.tenant.id, email, b.code))) return reply.code(400).send({ error: 'codigo_incorrecto' });
    return { token: issue(request.tenant.id, email) };
  });

  app.get('/public/account', async (request, reply) => {
    const who = readToken(request);
    if (!who) return reply.code(401).send({ error: 'sesion_vencida' });
    return withTenant(who.tenantId, async (sql) => {
      const [where, v] = clientWhere(who.email);
      const clients = await sql<{ id: string; name: string | null; phone: string; loyalty_points: number; referral_code: string | null }>(
        `SELECT id, name, phone, loyalty_points, referral_code FROM clients WHERE ${where} ORDER BY created_at`,
        [v],
      );
      const login = who.email.startsWith('p:') ? who.email.slice(2).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : who.email;
      const ids = clients.rows.map((c) => c.id);
      const cfg = await tenantConfig(sql);
      const forSale = cfg.features.packages ? (await sql<{ n: number }>('SELECT count(*)::int AS n FROM packages WHERE active AND sell_online')).rows[0].n : 0;
      if (!ids.length) return { email: login, name: null, points: 0, upcoming: [], past: [], packages: [], memberships: [], rewards: [], referralCode: null, packagesForSale: forSale };
      const apptCols = `a.id, a.starts_at, a.status, a.price_cents, a.manage_token, a.staff_id, st.name AS staff_name, st.photo_url AS staff_photo,
                        (SELECT string_agg(sv.name, ', ' ORDER BY sv.is_addon) FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id WHERE aps.appointment_id = a.id) AS services,
                        (SELECT aps.service_id FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id WHERE aps.appointment_id = a.id AND NOT sv.is_addon LIMIT 1) AS service_id,
                        (SELECT name FROM locations l WHERE l.id = a.location_id) AS location_name`;
      const [upcoming, past, packages, memberships, rewards] = await Promise.all([
        sql(`SELECT ${apptCols},
                    (a.starts_at > now() + make_interval(hours => COALESCE(ts.cancel_window_hours, 0))) AS can_cancel,
                    (a.starts_at > now() + make_interval(hours => COALESCE(ts.cancel_window_hours, 0)) AND COALESCE(ts.allow_client_reschedule, false)) AS can_reschedule,
                    COALESCE(ts.cancel_window_hours, 0) AS cancel_window_hours
               FROM appointments a LEFT JOIN staff st ON st.id = a.staff_id LEFT JOIN tenant_settings ts ON ts.tenant_id = a.tenant_id WHERE a.client_id = ANY($1) AND a.starts_at > now() - interval '1 hour' AND a.status IN ('pending','confirmed') ORDER BY a.starts_at LIMIT 10`, [ids]),
        sql(`SELECT ${apptCols} FROM appointments a LEFT JOIN staff st ON st.id = a.staff_id WHERE a.client_id = ANY($1) AND (a.starts_at < now() OR a.status IN ('completed','no_show','cancelled')) ORDER BY a.starts_at DESC LIMIT 20`, [ids]),
        sql(`SELECT id, name, uses_left, uses_total, expires_at FROM client_packages WHERE client_id = ANY($1) AND uses_left > 0 AND (expires_at IS NULL OR expires_at > now()) ORDER BY expires_at NULLS LAST`, [ids]),
        sql(`SELECT id, name, ends_at FROM client_memberships WHERE client_id = ANY($1) AND ends_at > now() ORDER BY ends_at`, [ids]),
        sql(`SELECT id, name, points_cost FROM rewards WHERE active ORDER BY points_cost`),
      ]);
      const points = clients.rows.reduce((a, c) => a + (c.loyalty_points ?? 0), 0);
      return {
        email: login,
        name: clients.rows.find((c) => c.name)?.name ?? null,
        points,
        referralCode: clients.rows.find((c) => c.referral_code)?.referral_code ?? null,
        upcoming: upcoming.rows,
        past: past.rows,
        packages: packages.rows,
        memberships: memberships.rows,
        rewards: rewards.rows.map((r: Record<string, unknown>) => ({ ...r, available: points >= Number(r.points_cost) })),
        packagesForSale: forSale,
      };
    });
  });
};
