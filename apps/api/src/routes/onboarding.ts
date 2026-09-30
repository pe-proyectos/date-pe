import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminPool } from '../db.js';
import { hashPassword } from '../lib/crypto.js';

// Alta de barbería (date.pe/join): crea tenant + dueño + settings/branding.
export const onboardingRoutes: FastifyPluginAsync = async (app) => {
  const body = z.object({
    shopName: z.string().min(2),
    slug: z
      .string()
      .min(2)
      .max(40)
      .regex(/^[a-z0-9-]+$/, 'solo minúsculas, números y guiones'),
    owner: z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
    }),
  });

  // ¿Está libre el subdominio?
  const RESERVED = new Set(['www', 'api', 'r2', 'admin', 'panel', 'app', 'mail', 'blog', 'static', 'cdn', 'superadmin']);
  app.get('/onboarding/slug', async (request) => {
    const slug = String((request.query as { slug?: string }).slug ?? '').toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(slug) || RESERVED.has(slug)) return { slug, available: false, reason: 'invalido' };
    const { rows } = await adminPool.query('SELECT 1 FROM tenants WHERE slug = $1', [slug]);
    return { slug, available: rows.length === 0 };
  });

  app.post('/onboarding', async (request, reply) => {
    const b = body.parse(request.body);
    if (RESERVED.has(b.slug)) return reply.code(409).send({ error: 'slug_en_uso' });
    const client = await adminPool.connect();
    try {
      await client.query('BEGIN');

      const exists = await client.query('SELECT 1 FROM tenants WHERE slug = $1', [b.slug]);
      if (exists.rows.length > 0) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'slug_en_uso' });
      }

      const tenant = await client.query<{ id: string }>(
        "INSERT INTO tenants (slug, name, status, plan, trial_ends_at) VALUES ($1, $2, 'trial', 'suite', now() + interval '14 days') RETURNING id",
        [b.slug, b.shopName],
      );
      const tenantId = tenant.rows[0].id;

      await client.query('INSERT INTO tenant_settings (tenant_id) VALUES ($1)', [tenantId]);
      await client.query(
        'INSERT INTO tenant_branding (tenant_id, tagline) VALUES ($1, $2)',
        [tenantId, `Reserva tu cita en ${b.shopName}`],
      );

      const user = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [b.owner.email, hashPassword(b.owner.password), b.owner.name],
      );
      await client.query(
        "INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING",
        [user.rows[0].id, tenantId],
      );

      await client.query('COMMIT');
      return reply.code(201).send({
        ok: true,
        tenantId,
        slug: b.slug,
        url: `https://${b.slug}.${process.env.APP_BASE_DOMAIN ?? 'date.pe'}`,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      request.log.error(err);
      return reply.code(500).send({ error: 'error_creando_barberia' });
    } finally {
      client.release();
    }
  });
};
