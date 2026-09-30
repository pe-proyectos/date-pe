import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminPool } from '../db.js';
import { hashPassword } from '../lib/crypto.js';

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
         (SELECT count(*) FROM clients) AS clientes`,
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
      `SELECT t.id, t.slug, t.name, t.status, t.plan, t.created_at,
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
        'INSERT INTO tenants (slug, name, status, plan) VALUES ($1,$2,$3,$4) RETURNING id',
        [b.slug, b.shopName, b.status ?? 'trial', 'suite'],
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
};
