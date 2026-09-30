import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { withTenant } from '../db.js';

function tid(request: FastifyRequest): string {
  if (!request.tenant) throw new Error('tenant_no_resuelto');
  return request.tenant.id;
}

const code = (prefix: string) => `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`;

export const adminExtraRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireTenant);

  // ----------------------------- RESUMEN DEL DÍA -----------------------------
  app.get('/admin/overview', async (request) =>
    withTenant(tid(request), async (sql) => {
      const tz = (await sql<{ timezone: string }>('SELECT timezone FROM tenant_settings')).rows[0]?.timezone ?? 'America/Lima';
      const today = await sql(
        `SELECT
           count(*) FILTER (WHERE status <> 'cancelled') AS citas_hoy,
           count(*) FILTER (WHERE status = 'pending') AS pendientes_hoy,
           COALESCE(sum(price_cents) FILTER (WHERE status IN ('confirmed','completed')), 0) AS ingresos_hoy
         FROM appointments
        WHERE (starts_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date`,
        [tz],
      );
      const week = await sql(
        `SELECT COALESCE(sum(price_cents) FILTER (WHERE status IN ('confirmed','completed')), 0) AS ingresos_semana,
                count(*) FILTER (WHERE status <> 'cancelled') AS citas_semana
           FROM appointments WHERE starts_at >= date_trunc('week', now())`,
      );
      const next = await sql(
        `SELECT a.starts_at, c.name AS client_name, s.name AS staff_name
           FROM appointments a LEFT JOIN clients c ON c.id = a.client_id LEFT JOIN staff s ON s.id = a.staff_id
          WHERE a.starts_at > now() AND a.status IN ('pending','confirmed')
          ORDER BY a.starts_at LIMIT 5`,
      );
      return { today: today.rows[0], week: week.rows[0], upcoming: next.rows };
    }),
  );

  // ----------------------------- PROMOCIONES -----------------------------
  app.get('/admin/promotions', async (request) =>
    withTenant(tid(request), async (sql) => ({
      promotions: (await sql('SELECT id, code, kind, value, active, expires_at, max_uses, used_count, created_at FROM promotions ORDER BY created_at DESC')).rows,
    })),
  );
  const promoBody = z.object({
    code: z.string().min(3).max(24).regex(/^[A-Za-z0-9-]+$/).optional(),
    kind: z.enum(['percent', 'fixed']),
    value: z.number().int().min(1),
    expiresAt: z.string().nullable().optional(),
    maxUses: z.number().int().min(1).nullable().optional(),
    active: z.boolean().optional(),
  });
  app.post('/admin/promotions', async (request, reply) => {
    const b = promoBody.parse(request.body);
    if (b.kind === 'percent' && b.value > 100) return reply.code(400).send({ error: 'porcentaje_invalido' });
    try {
      const row = await withTenant(tid(request), async (sql) =>
        (
          await sql(
            `INSERT INTO promotions (tenant_id, code, kind, value, expires_at, max_uses, active)
             VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, COALESCE($6, true)) RETURNING id, code`,
            [(b.code ?? code('PROMO')).toUpperCase(), b.kind, b.value, b.expiresAt ?? null, b.maxUses ?? null, b.active ?? null],
          )
        ).rows[0],
      );
      return reply.code(201).send(row);
    } catch {
      return reply.code(409).send({ error: 'codigo_en_uso' });
    }
  });
  app.patch('/admin/promotions/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = z.object({ active: z.boolean() }).parse(request.body);
    await withTenant(tid(request), (sql) => sql('UPDATE promotions SET active = $2 WHERE id = $1', [id, b.active]));
    return { ok: true };
  });
  app.delete('/admin/promotions/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    await withTenant(tid(request), (sql) => sql('DELETE FROM promotions WHERE id = $1', [id]));
    return { ok: true };
  });

  // ----------------------------- GIFT CARDS -----------------------------
  app.get('/admin/gift-cards', async (request) =>
    withTenant(tid(request), async (sql) => ({
      giftCards: (await sql('SELECT id, code, initial_cents, balance_cents, active, created_at FROM gift_cards ORDER BY created_at DESC')).rows,
    })),
  );
  app.post('/admin/gift-cards', async (request, reply) => {
    const b = z.object({ amountCents: z.number().int().min(500).max(500000) }).parse(request.body);
    const row = await withTenant(tid(request), async (sql) =>
      (
        await sql(
          `INSERT INTO gift_cards (tenant_id, code, initial_cents, balance_cents)
           VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $2) RETURNING id, code, balance_cents`,
          [code('GIFT'), b.amountCents],
        )
      ).rows[0],
    );
    return reply.code(201).send(row);
  });
  app.patch('/admin/gift-cards/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = z.object({ active: z.boolean() }).parse(request.body);
    await withTenant(tid(request), (sql) => sql('UPDATE gift_cards SET active = $2 WHERE id = $1', [id, b.active]));
    return { ok: true };
  });

  // ----------------------------- MEMBRESÍAS -----------------------------
  app.get('/admin/memberships', async (request) =>
    withTenant(tid(request), async (sql) => ({
      plans: (await sql('SELECT id, name, description, price_cents, period, perks, active, sort_order FROM membership_plans ORDER BY sort_order, price_cents')).rows,
    })),
  );
  const planBody = z.object({
    name: z.string().min(2).max(60),
    description: z.string().max(240).nullable().optional(),
    priceCents: z.number().int().min(100),
    period: z.enum(['month', 'year']).default('month'),
    perks: z.string().max(400).nullable().optional(),
    active: z.boolean().optional(),
  });
  app.post('/admin/memberships', async (request, reply) => {
    const b = planBody.parse(request.body);
    const row = await withTenant(tid(request), async (sql) =>
      (
        await sql(
          `INSERT INTO membership_plans (tenant_id, name, description, price_cents, period, perks, active)
           VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, COALESCE($6, true)) RETURNING id`,
          [b.name, b.description ?? null, b.priceCents, b.period, b.perks ?? null, b.active ?? null],
        )
      ).rows[0],
    );
    return reply.code(201).send(row);
  });
  app.patch('/admin/memberships/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = planBody.partial().parse(request.body);
    await withTenant(tid(request), (sql) =>
      sql(
        `UPDATE membership_plans SET name = COALESCE($2, name), description = COALESCE($3, description),
           price_cents = COALESCE($4, price_cents), period = COALESCE($5, period), perks = COALESCE($6, perks), active = COALESCE($7, active)
         WHERE id = $1`,
        [id, b.name ?? null, b.description ?? null, b.priceCents ?? null, b.period ?? null, b.perks ?? null, b.active ?? null],
      ),
    );
    return { ok: true };
  });
  app.delete('/admin/memberships/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    await withTenant(tid(request), (sql) => sql('DELETE FROM membership_plans WHERE id = $1', [id]));
    return { ok: true };
  });

  // ----------------------------- CLIENTES -----------------------------
  app.get('/admin/clients', async (request) => {
    const q = (request.query as { q?: string }).q ?? '';
    return withTenant(tid(request), async (sql) => ({
      clients: (
        await sql(
          `SELECT c.id, c.name, c.phone, c.email, c.loyalty_points, c.created_at,
                  count(a.*) FILTER (WHERE a.status IN ('confirmed','completed')) AS visitas,
                  count(a.*) FILTER (WHERE a.status = 'no_show') AS ausencias,
                  COALESCE(sum(a.price_cents) FILTER (WHERE a.status = 'completed'), 0) AS gastado_cents,
                  max(a.starts_at) AS ultima_cita
             FROM clients c LEFT JOIN appointments a ON a.client_id = c.id
            WHERE ($1 = '' OR c.name ILIKE '%'||$1||'%' OR c.phone ILIKE '%'||$1||'%')
            GROUP BY c.id ORDER BY ultima_cita DESC NULLS LAST LIMIT 200`,
          [q],
        )
      ).rows,
    }));
  });
  app.patch('/admin/clients/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = z.object({ notes: z.string().max(1000).optional(), loyaltyPoints: z.number().int().min(0).optional() }).parse(request.body);
    await withTenant(tid(request), (sql) =>
      sql('UPDATE clients SET notes = COALESCE($2, notes), loyalty_points = COALESCE($3, loyalty_points) WHERE id = $1', [
        id,
        b.notes ?? null,
        b.loyaltyPoints ?? null,
      ]),
    );
    return { ok: true };
  });

  // ----------------------------- RESEÑAS -----------------------------
  app.get('/admin/reviews', async (request) =>
    withTenant(tid(request), async (sql) => ({
      reviews: (
        await sql(
          `SELECT r.id, r.stars, r.comment, r.reply, r.is_published, r.created_at, s.name AS staff_name, c.name AS client_name
             FROM reviews r
             LEFT JOIN staff s ON s.id = r.staff_id
             LEFT JOIN appointments a ON a.id = r.appointment_id
             LEFT JOIN clients c ON c.id = a.client_id
            ORDER BY r.created_at DESC LIMIT 200`,
        )
      ).rows,
    })),
  );
  app.patch('/admin/reviews/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = z.object({ reply: z.string().max(800).nullable().optional(), isPublished: z.boolean().optional() }).parse(request.body);
    await withTenant(tid(request), (sql) =>
      sql('UPDATE reviews SET reply = COALESCE($2, reply), is_published = COALESCE($3, is_published) WHERE id = $1', [
        id,
        b.reply ?? null,
        b.isPublished ?? null,
      ]),
    );
    return { ok: true };
  });

  // ----------------------------- AJUSTES -----------------------------
  app.get('/admin/settings', async (request) =>
    withTenant(tid(request), async (sql) => (await sql('SELECT * FROM tenant_settings')).rows[0] ?? null),
  );
  const settingsBody = z.object({
    depositPercent: z.number().int().min(0).max(100).optional(),
    requireDeposit: z.boolean().optional(),
    cancelWindowHours: z.number().int().min(0).max(168).optional(),
    slotIntervalMin: z.number().int().refine((v) => [5, 10, 15, 20, 30, 60].includes(v)).optional(),
    loyaltyPointsPerVisit: z.number().int().min(0).max(1000).optional(),
  });
  app.put('/admin/settings', async (request) => {
    const b = settingsBody.parse(request.body);
    await withTenant(tid(request), (sql) =>
      sql(
        `UPDATE tenant_settings SET
           deposit_percent = COALESCE($1, deposit_percent), require_deposit = COALESCE($2, require_deposit),
           cancel_window_hours = COALESCE($3, cancel_window_hours), slot_interval_min = COALESCE($4, slot_interval_min),
           loyalty_points_per_visit = COALESCE($5, loyalty_points_per_visit), updated_at = now()`,
        [b.depositPercent ?? null, b.requireDeposit ?? null, b.cancelWindowHours ?? null, b.slotIntervalMin ?? null, b.loyaltyPointsPerVisit ?? null],
      ),
    );
    return { ok: true };
  });

  // ----------------------------- REPORTES -----------------------------
  app.get('/admin/reports/detail', async (request) => {
    const q = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }).parse(request.query);
    return withTenant(tid(request), async (sql) => {
      const tz = (await sql<{ timezone: string }>('SELECT timezone FROM tenant_settings')).rows[0]?.timezone ?? 'America/Lima';
      const [daily, byService, byStaff, totals] = await Promise.all([
        sql(
          `SELECT to_char(d, 'YYYY-MM-DD') AS dia,
                  COALESCE(sum(a.price_cents) FILTER (WHERE a.status IN ('confirmed','completed')), 0)::int AS ingresos_cents,
                  count(a.id) FILTER (WHERE a.status <> 'cancelled')::int AS citas
             FROM generate_series((now() AT TIME ZONE $2)::date - ($1::int - 1), (now() AT TIME ZONE $2)::date, interval '1 day') d
             LEFT JOIN appointments a ON (a.starts_at AT TIME ZONE $2)::date = d::date
            GROUP BY d ORDER BY d`,
          [q.days, tz],
        ),
        sql(
          `SELECT sv.name, count(*)::int AS citas, COALESCE(sum(a.price_cents), 0)::int AS ingresos_cents
             FROM appointments a JOIN appointment_services aps ON aps.appointment_id = a.id JOIN services sv ON sv.id = aps.service_id
            WHERE a.status IN ('confirmed','completed') AND a.starts_at >= now() - ($1 || ' days')::interval
            GROUP BY sv.name ORDER BY ingresos_cents DESC`,
          [q.days],
        ),
        sql(
          `SELECT s.name, count(a.id) FILTER (WHERE a.status IN ('confirmed','completed'))::int AS citas,
                  COALESCE(sum(a.price_cents) FILTER (WHERE a.status IN ('confirmed','completed')), 0)::int AS ingresos_cents,
                  count(a.id) FILTER (WHERE a.status = 'no_show')::int AS ausencias
             FROM staff s LEFT JOIN appointments a ON a.staff_id = s.id AND a.starts_at >= now() - ($1 || ' days')::interval
            GROUP BY s.id, s.name ORDER BY ingresos_cents DESC`,
          [q.days],
        ),
        sql(
          `SELECT count(*) FILTER (WHERE status IN ('confirmed','completed'))::int AS citas,
                  count(*) FILTER (WHERE status = 'no_show')::int AS ausencias,
                  count(*) FILTER (WHERE status = 'cancelled')::int AS canceladas,
                  COALESCE(sum(price_cents) FILTER (WHERE status IN ('confirmed','completed')), 0)::int AS ingresos_cents,
                  COALESCE(sum(discount_cents) FILTER (WHERE status IN ('confirmed','completed')), 0)::int AS descuentos_cents
             FROM appointments WHERE starts_at >= now() - ($1 || ' days')::interval`,
          [q.days],
        ),
      ]);
      return { days: q.days, daily: daily.rows, byService: byService.rows, byStaff: byStaff.rows, totals: totals.rows[0] };
    });
  });
};
