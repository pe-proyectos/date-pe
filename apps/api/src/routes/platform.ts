import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminPool } from '../db.js';
import { hashPassword } from '../lib/crypto.js';
import { createInvoice, markInvoicePaid, TRIAL_DAYS } from '../lib/billing.js';
import { setCustomDomain } from '../lib/domains.js';

// Panel superadmin de date.pe (plataforma). Todo cross-tenant vía adminPool.
export const platformRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requirePlatformAdmin);

  // Telemetría global
  app.get('/platform/overview', async () => {
    const totals = await adminPool.query(
      `SELECT
         (SELECT count(*) FROM tenants) AS tenants,
         (SELECT count(*) FROM tenants WHERE status='active') AS activos,
         (SELECT count(*) FROM tenants WHERE status='trial') AS trials,
         (SELECT count(*) FROM appointments) AS citas_total,
         (SELECT count(*) FROM appointments WHERE created_at > now() - interval '7 days') AS citas_7d,
         (SELECT count(*) FROM appointments WHERE status='no_show') AS no_shows,
         (SELECT COALESCE(sum(amount_cents),0) FROM payments WHERE status='captured') AS senas_cents,
         (SELECT count(*) FROM clients) AS clientes,
         (SELECT count(*) FROM tenants WHERE status='suspended') AS suspendidas,
         (SELECT COALESCE(sum(monthly_price_cents),0) FROM tenants WHERE NOT is_demo AND status='active' AND paid_until > now()) AS mrr_cents,
         (SELECT COALESCE(sum(amount_cents),0) FROM subscription_invoices WHERE status='paid' AND paid_at > date_trunc('month', now())) AS cobrado_mes_cents`,
    );
    // Nuevas barberías por día (14d)
    const signups = await adminPool.query(
      `SELECT to_char((created_at AT TIME ZONE 'America/Lima')::date,'YYYY-MM-DD') AS dia, count(*)::int AS n
         FROM tenants WHERE created_at > now() - interval '15 days'
        GROUP BY 1 ORDER BY 1`,
    );
    // Citas por día (14d)
    const bookings = await adminPool.query(
      `SELECT to_char((created_at AT TIME ZONE 'America/Lima')::date,'YYYY-MM-DD') AS dia, count(*)::int AS n
         FROM appointments WHERE created_at > now() - interval '15 days'
        GROUP BY 1 ORDER BY 1`,
    );
    return { totals: totals.rows[0], signups: signups.rows, bookings: bookings.rows };
  });

  // Listado de barberías con stats
  app.get('/platform/tenants', async () => {
    const { rows } = await adminPool.query(
      `SELECT t.id, t.slug, t.name, t.status, t.plan, t.created_at, t.is_demo, t.trial_ends_at, t.paid_until,
              t.custom_domain, t.domain_status, t.monthly_price_cents,
              (SELECT count(*) FROM staff s WHERE s.tenant_id=t.id) AS barberos,
              (SELECT count(*) FROM appointments a WHERE a.tenant_id=t.id) AS citas,
              (SELECT count(*) FROM appointments a WHERE a.tenant_id=t.id AND a.status='no_show') AS no_shows,
              (SELECT COALESCE(sum(amount_cents),0) FROM payments p WHERE p.tenant_id=t.id AND p.status='captured') AS senas_cents,
              (SELECT max(a.created_at) FROM appointments a WHERE a.tenant_id=t.id) AS ultima_cita
         FROM tenants t ORDER BY t.created_at DESC`,
    );
    return { tenants: rows };
  });

  // Detalle de una barbería
  app.get('/platform/tenants/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const t = await adminPool.query('SELECT id, slug, name, status, plan, custom_domain, created_at FROM tenants WHERE id=$1', [id]);
    if (t.rows.length === 0) return reply.code(404).send({ error: 'no_encontrada' });
    const stats = await adminPool.query(
      `SELECT
         (SELECT count(*) FROM staff WHERE tenant_id=$1) AS barberos,
         (SELECT count(*) FROM services WHERE tenant_id=$1) AS servicios,
         (SELECT count(*) FROM clients WHERE tenant_id=$1) AS clientes,
         (SELECT count(*) FROM appointments WHERE tenant_id=$1) AS citas,
         (SELECT count(*) FROM appointments WHERE tenant_id=$1 AND status='completed') AS completadas,
         (SELECT count(*) FROM appointments WHERE tenant_id=$1 AND status='no_show') AS no_shows,
         (SELECT COALESCE(sum(amount_cents),0) FROM payments WHERE tenant_id=$1 AND status='captured') AS senas_cents`,
      [id],
    );
    return { tenant: t.rows[0], stats: stats.rows[0] };
  });

  // Alta de barbería (crea tenant + dueño)
  const createBody = z.object({
    shopName: z.string().min(2),
    slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
    owner: z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8) }),
    status: z.enum(['trial', 'active']).optional(),
  });
  app.post('/platform/tenants', async (request, reply) => {
    const b = createBody.parse(request.body);
    const client = await adminPool.connect();
    try {
      await client.query('BEGIN');
      const exists = await client.query('SELECT 1 FROM tenants WHERE slug=$1', [b.slug]);
      if (exists.rows.length > 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'slug_en_uso' });
      }
      const t = await client.query<{ id: string }>(
        `INSERT INTO tenants (slug, name, status, plan, trial_ends_at) VALUES ($1,$2,$3,$4, now() + make_interval(days => $5)) RETURNING id`,
        [b.slug, b.shopName, b.status ?? 'trial', 'suite', TRIAL_DAYS],
      );
      const tenantId = t.rows[0].id;
      await client.query('INSERT INTO tenant_settings (tenant_id) VALUES ($1)', [tenantId]);
      await client.query('INSERT INTO tenant_branding (tenant_id, tagline) VALUES ($1,$2)', [tenantId, `Reserva en ${b.shopName}`]);
      const u = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3)
         ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
        [b.owner.email, hashPassword(b.owner.password), b.owner.name],
      );
      await client.query("INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING", [u.rows[0].id, tenantId]);
      await client.query('COMMIT');
      return reply.code(201).send({ ok: true, tenantId, slug: b.slug });
    } catch (err) {
      await client.query('ROLLBACK');
      request.log.error(err);
      return reply.code(500).send({ error: 'error_creando' });
    } finally {
      client.release();
    }
  });

  // Cambiar estado (activar / suspender)
  app.patch('/platform/tenants/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = z.object({ status: z.enum(['trial', 'active', 'suspended', 'cancelled']) }).parse(request.body);
    await adminPool.query('UPDATE tenants SET status=$2, updated_at=now() WHERE id=$1', [id, b.status]);
    return { ok: true };
  });

  // Extender la prueba N días (desde hoy o desde el fin actual, lo que sea mayor)
  app.post('/platform/tenants/:id/extend-trial', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = z.object({ days: z.number().int().min(1).max(90) }).parse(request.body);
    await adminPool.query(
      `UPDATE tenants SET trial_ends_at = GREATEST(now(), COALESCE(trial_ends_at, now())) + make_interval(days => $2),
              status = CASE WHEN status = 'suspended' AND paid_until IS NULL THEN 'trial' WHEN status = 'suspended' THEN 'active' ELSE status END,
              updated_at = now()
        WHERE id = $1`,
      [id, b.days],
    );
    return { ok: true };
  });

  // Registrar un pago recibido fuera de la web (transferencia, Yape directo)
  app.post('/platform/tenants/:id/mark-paid', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = z.object({ months: z.number().int().min(1).max(24), note: z.string().max(80).optional() }).parse(request.body);
    const inv = await createInvoice(id, b.months, 'manual');
    await markInvoicePaid(inv.id, b.note ?? 'manual', 'manual');
    return { ok: true };
  });

  // Precio mensual especial para una barbería
  app.patch('/platform/tenants/:id/price', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = z.object({ monthlyPriceCents: z.number().int().min(0).max(100000) }).parse(request.body);
    await adminPool.query('UPDATE tenants SET monthly_price_cents = $2 WHERE id = $1', [id, b.monthlyPriceCents]);
    return { ok: true };
  });

  // Dominio propio (también disponible para el dueño desde su panel)
  app.put('/platform/tenants/:id/domain', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const b = z.object({ domain: z.string().max(253).nullable() }).parse(request.body);
    const r = await setCustomDomain(id, b.domain);
    if (!r.ok) return reply.code(400).send({ error: r.error });
    return r;
  });

  // Cobros recientes de toda la plataforma
  app.get('/platform/invoices', async () => {
    const { rows } = await adminPool.query(
      `SELECT i.id, i.amount_cents, i.months, i.status, i.provider, i.paid_at, i.created_at, t.name AS tenant_name, t.slug
         FROM subscription_invoices i JOIN tenants t ON t.id = i.tenant_id
        WHERE i.status = 'paid' ORDER BY i.paid_at DESC LIMIT 50`,
    );
    return { invoices: rows };
  });
};
