import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { withTenant, admin } from '../db.js';
import { hashPassword } from '../lib/crypto.js';
import { sendEmail, layout } from '../lib/email.js';
import { tenantUrl } from '../lib/notify.js';
import { tenantConfig, FEATURE_DEFAULTS, TV_DEFAULTS, QUEUE_DEFAULTS, MUSIC_DEFAULTS, POS_DEFAULTS, MARKETING_DEFAULTS } from '../lib/features.js';
import { emitTenantEvent } from '../lib/realtime.js';
import { saveSubscription, pushEnabled } from '../lib/push.js';
import { env } from '../env.js';
import { setSessionCookie, type AuthUser } from '../plugins/auth.js';

const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');
function tenantOf(request: FastifyRequest) {
  if (!request.tenant) throw new Error('tenant_no_resuelto');
  return request.tenant;
}

const ROLE_LABEL: Record<string, string> = { manager: 'encargado', cashier: 'caja', staff: 'barbero' };

// Equipo con cuentas propias, funciones activables y configuración del local.
export const teamRoutes: FastifyPluginAsync = async (app) => {
  // ------------------------------ Aceptar invitación (público) ------------------------------
  app.get('/team/invite', async (request, reply) => {
    const { token } = z.object({ token: z.string().length(48) }).parse(request.query);
    const { rows } = await admin<{ email: string; role: string; tenant_name: string; slug: string; staff_name: string | null; has_account: boolean }>(
      `SELECT i.email, i.role, t.name AS tenant_name, t.slug, s.name AS staff_name,
              EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(i.email) AND u.password_hash IS NOT NULL) AS has_account
         FROM team_invites i JOIN tenants t ON t.id = i.tenant_id LEFT JOIN staff s ON s.id = i.staff_id
        WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.expires_at > now()`,
      [tokenHash(token)],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'invitacion_vencida' });
    return { invite: rows[0] };
  });

  app.post('/team/invite/accept', async (request, reply) => {
    const b = z.object({ token: z.string().length(48), name: z.string().min(1).max(80), password: z.string().min(8).max(200) }).parse(request.body);
    const inv = await admin<{ tenant_id: string; email: string; role: string; staff_id: string | null }>(
      `UPDATE team_invites SET accepted_at = now() WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()
       RETURNING tenant_id, email, role, staff_id`,
      [tokenHash(b.token)],
    );
    const i = inv.rows[0];
    if (!i) return reply.code(404).send({ error: 'invitacion_vencida' });
    const u = await admin<{ id: string; is_platform_admin: boolean }>(
      `INSERT INTO users (email, password_hash, name) VALUES (lower($1), $2, $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash), name = COALESCE(users.name, EXCLUDED.name)
       RETURNING id, is_platform_admin`,
      [i.email, hashPassword(b.password), b.name],
    );
    await admin(
      `INSERT INTO memberships (user_id, tenant_id, role, staff_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role, staff_id = EXCLUDED.staff_id`,
      [u.rows[0].id, i.tenant_id, i.role, i.staff_id],
    );
    const payload: AuthUser = { sub: u.rows[0].id, tenantId: i.tenant_id, role: i.role, staffId: i.staff_id, isPlatformAdmin: u.rows[0].is_platform_admin };
    const token = app.jwt.sign(payload, { expiresIn: '30d' });
    setSessionCookie(reply, token);
    return { ok: true, token, user: payload };
  });

  // ------------------------------ Rutas del panel ------------------------------
  app.register(async (panel) => {
    panel.addHook('preHandler', app.requireTenant);

    // Quién soy en esta barbería (el panel adapta menús a mi rol)
    panel.get('/admin/me', async (request) => {
      const t = tenantOf(request);
      const u = await admin<{ name: string | null; email: string }>('SELECT name, email FROM users WHERE id = $1', [request.user.sub]);
      const cfg = await withTenant(t.id, (sql) => tenantConfig(sql));
      return {
        me: { id: request.user.sub, name: u.rows[0]?.name ?? null, email: u.rows[0]?.email ?? null, role: request.user.isPlatformAdmin ? 'owner' : request.user.role, staffId: request.user.staffId ?? null },
        features: cfg.features,
        pushPublicKey: pushEnabled() ? env.vapidPublicKey : null,
      };
    });

    // "Mi día" del barbero: citas de hoy, turno actual de la fila, lo ganado
    panel.get('/admin/me/day', async (request) => {
      const t = tenantOf(request);
      const staffId = request.user.staffId ?? (request.query as { staffId?: string }).staffId ?? null;
      if (!staffId) return { staffId: null, appointments: [], tickets: [], earnings: null };
      return withTenant(t.id, async (sql) => {
        const [appts, tickets, earnings] = await Promise.all([
          sql(
            `SELECT a.id, a.starts_at, a.ends_at, a.status, a.price_cents, c.id AS client_id, c.name AS client_name, c.phone AS client_phone,
                    c.preferences, c.allergies,
                    (SELECT string_agg(sv.name, ' + ' ORDER BY sv.is_addon) FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id WHERE aps.appointment_id = a.id) AS service_name,
                    (SELECT url FROM client_photos p WHERE p.client_id = c.id ORDER BY p.created_at DESC LIMIT 1) AS last_photo
               FROM appointments a LEFT JOIN clients c ON c.id = a.client_id
              WHERE a.staff_id = $1 AND (a.starts_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date
                AND a.status <> 'cancelled'
              ORDER BY a.starts_at`,
            [staffId],
          ),
          sql(
            `SELECT q.id, q.number, q.name, q.status, sv.name AS service_name FROM queue_tickets q LEFT JOIN services sv ON sv.id = q.service_id
              WHERE q.day = (now() AT TIME ZONE 'America/Lima')::date AND q.status IN ('called','serving') AND q.served_by = $1`,
            [staffId],
          ),
          sql(
            `SELECT COALESCE(sum(si.total_cents) FILTER (WHERE si.kind = 'service'), 0)::int AS services_cents,
                    COALESCE(sum(si.commission_cents), 0)::int AS commission_cents,
                    (SELECT COALESCE(sum(s2.tip_cents), 0) FROM sales s2 WHERE s2.staff_id = $1 AND s2.status = 'paid'
                       AND (s2.created_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date)::int AS tips_cents,
                    count(DISTINCT s.id)::int AS clients
               FROM sale_items si JOIN sales s ON s.id = si.sale_id
              WHERE si.staff_id = $1 AND s.status = 'paid' AND (s.created_at AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date`,
            [staffId],
          ),
        ]);
        return { staffId, appointments: appts.rows, tickets: tickets.rows, earnings: earnings.rows[0] };
      });
    });

    // Suscripción push del usuario del panel (nueva reserva, cancelación, cliente en la fila)
    panel.post('/admin/push/subscribe', async (request) => {
      const t = tenantOf(request);
      const b = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }).parse(request.body);
      await saveSubscription({ tenantId: t.id, userId: request.user.sub, endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth });
      return { ok: true };
    });
    panel.post('/admin/push/unsubscribe', async (request) => {
      const b = z.object({ endpoint: z.string() }).parse(request.body);
      await admin('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [b.endpoint, request.user.sub]);
      return { ok: true };
    });

    // ------------------------------ Funciones y configuración ------------------------------
    panel.get('/admin/features', async (request) => {
      const t = tenantOf(request);
      const cfg = await withTenant(t.id, (sql) => tenantConfig(sql));
      const extra = await withTenant(t.id, (sql) => sql<{ google_review_url: string | null }>('SELECT google_review_url FROM tenant_settings'));
      return { ...cfg, googleReviewUrl: extra.rows[0]?.google_review_url ?? null, youtubeSearch: !!env.youtubeApiKey, whatsappReady: !!(env.whatsappToken && env.whatsappPhoneId), pushReady: pushEnabled() };
    });

    const pick = <T extends object>(defaults: T, input: unknown): Partial<T> => {
      const out: Record<string, unknown> = {};
      if (!input || typeof input !== 'object') return out as Partial<T>;
      for (const [k, v] of Object.entries(input)) {
        if (!(k in defaults)) continue;
        const d = (defaults as Record<string, unknown>)[k];
        if (typeof d === typeof v || (Array.isArray(d) && Array.isArray(v))) out[k] = v;
      }
      return out as Partial<T>;
    };

    panel.put('/admin/features', async (request) => {
      const t = tenantOf(request);
      const b = z
        .object({
          features: z.record(z.boolean()).optional(),
          tv: z.record(z.unknown()).optional(),
          queue: z.record(z.unknown()).optional(),
          music: z.record(z.unknown()).optional(),
          pos: z.record(z.unknown()).optional(),
          marketing: z.record(z.unknown()).optional(),
          googleReviewUrl: z.string().url().or(z.literal('')).optional(),
        })
        .parse(request.body);
      await withTenant(t.id, async (sql) => {
        const merge = async (col: string, value: object) => {
          if (Object.keys(value).length) await sql(`UPDATE tenant_settings SET ${col} = ${col} || $1::jsonb, updated_at = now()`, [JSON.stringify(value)]);
        };
        await merge('features', pick(FEATURE_DEFAULTS, b.features));
        await merge('tv_config', pick(TV_DEFAULTS, b.tv));
        await merge('queue_config', pick(QUEUE_DEFAULTS, b.queue));
        await merge('music_config', pick(MUSIC_DEFAULTS, b.music));
        await merge('pos_config', pick(POS_DEFAULTS, b.pos));
        await merge('marketing_config', pick(MARKETING_DEFAULTS, b.marketing));
        if (b.googleReviewUrl !== undefined) await sql('UPDATE tenant_settings SET google_review_url = $1', [b.googleReviewUrl || null]);
      });
      // La TV y los tickets se actualizan al instante
      await emitTenantEvent(t.id, 'config_changed');
      return { ok: true };
    });

    // ------------------------------ Equipo ------------------------------
    panel.get('/admin/team', async (request) => {
      const t = tenantOf(request);
      const members = await admin(
        `SELECT u.id AS user_id, u.name, u.email, m.role, m.staff_id, s.name AS staff_name, m.created_at
           FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN staff s ON s.id = m.staff_id
          WHERE m.tenant_id = $1 ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 WHEN 'cashier' THEN 2 ELSE 3 END, u.name`,
        [t.id],
      );
      const invites = await admin(
        `SELECT i.email, i.role, i.staff_id, s.name AS staff_name, i.expires_at, i.created_at
           FROM team_invites i LEFT JOIN staff s ON s.id = i.staff_id
          WHERE i.tenant_id = $1 AND i.accepted_at IS NULL AND i.expires_at > now() ORDER BY i.created_at DESC`,
        [t.id],
      );
      return { members: members.rows, invites: invites.rows };
    });

    panel.post('/admin/team/invite', async (request, reply) => {
      const t = tenantOf(request);
      const b = z.object({ email: z.string().email(), role: z.enum(['manager', 'cashier', 'staff']), staffId: z.string().uuid().nullable().optional() }).parse(request.body);
      if (b.role === 'staff' && !b.staffId) return reply.code(400).send({ error: 'elige_el_barbero' });
      const already = await admin('SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = $1 AND lower(u.email) = lower($2)', [t.id, b.email]);
      if (already.rows.length) return reply.code(409).send({ error: 'ya_es_parte_del_equipo' });
      const token = randomBytes(24).toString('hex');
      await admin('DELETE FROM team_invites WHERE tenant_id = $1 AND lower(email) = lower($2) AND accepted_at IS NULL', [t.id, b.email]);
      await admin(
        `INSERT INTO team_invites (token_hash, tenant_id, email, role, staff_id, invited_by, expires_at) VALUES ($1, $2, lower($3), $4, $5, $6, now() + interval '7 days')`,
        [tokenHash(token), t.id, b.email, b.role, b.staffId ?? null, request.user.sub],
      );
      const url = tenantUrl(t.slug, `/admin/unirme?token=${token}`);
      const inviter = await admin<{ name: string | null }>('SELECT name FROM users WHERE id = $1', [request.user.sub]);
      await sendEmail({
        to: b.email,
        fromName: t.name,
        subject: `${inviter.rows[0]?.name ?? t.name} te invitó al panel de ${t.name}`,
        html: layout({
          brand: t.name,
          title: `Únete al equipo de ${t.name}`,
          intro: `Te invitaron como ${ROLE_LABEL[b.role]}. Crea tu contraseña y verás tu agenda, tu fila y lo que llevas ganado desde el celular. El enlace vence en 7 días.`,
          cta: { label: 'Aceptar invitación', href: url },
          foot: 'date.pe, agenda y reservas para barberías',
        }),
      });
      return reply.code(201).send({ ok: true, url });
    });

    panel.patch('/admin/team/:userId', async (request, reply) => {
      const t = tenantOf(request);
      const userId = (request.params as { userId: string }).userId;
      const b = z.object({ role: z.enum(['manager', 'cashier', 'staff']).optional(), staffId: z.string().uuid().nullable().optional() }).parse(request.body);
      const cur = await admin<{ role: string }>('SELECT role FROM memberships WHERE user_id = $1 AND tenant_id = $2', [userId, t.id]);
      if (!cur.rows[0]) return reply.code(404).send({ error: 'no_encontrado' });
      if (cur.rows[0].role === 'owner') return reply.code(409).send({ error: 'no_se_puede_cambiar_al_dueno' });
      await admin(
        `UPDATE memberships SET role = COALESCE($3, role), staff_id = CASE WHEN $5 THEN $4::uuid ELSE staff_id END WHERE user_id = $1 AND tenant_id = $2`,
        [userId, t.id, b.role ?? null, b.staffId ?? null, b.staffId !== undefined],
      );
      return { ok: true };
    });

    panel.delete('/admin/team/:userId', async (request, reply) => {
      const t = tenantOf(request);
      const userId = (request.params as { userId: string }).userId;
      if (userId === request.user.sub) return reply.code(409).send({ error: 'no_puedes_quitarte' });
      const r = await admin("DELETE FROM memberships WHERE user_id = $1 AND tenant_id = $2 AND role <> 'owner' RETURNING 1", [userId, t.id]);
      if (!r.rows.length) return reply.code(409).send({ error: 'no_se_puede_quitar' });
      return { ok: true };
    });

    panel.delete('/admin/team/invites/:email', async (request) => {
      const t = tenantOf(request);
      await admin('DELETE FROM team_invites WHERE tenant_id = $1 AND lower(email) = lower($2) AND accepted_at IS NULL', [t.id, (request.params as { email: string }).email]);
      return { ok: true };
    });
  });
};
