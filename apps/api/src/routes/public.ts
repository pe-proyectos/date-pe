import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withTenant, admin } from '../db.js';
import { computeSlots } from '../lib/availability.js';
import { quote } from '../lib/pricing.js';
import { tenantSlugByDomain } from '../lib/domains.js';
import { tenantConfig } from '../lib/features.js';

// Datos públicos de un tenant para su sitio, su flujo de reserva y reseñas.
export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get('/public/site', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const tenantId = request.tenant.id;
    const demo = await admin<{ is_demo: boolean }>('SELECT is_demo FROM tenants WHERE id = $1', [tenantId]);
    return withTenant(tenantId, async (sql) => {
      const [branding, settings, locations, staff, services, reviews, ratingAgg, plans, hours] = await Promise.all([
        sql('SELECT logo_url, cover_url, color_primary, color_secondary, tagline, about, instagram, whatsapp, gallery, show_powered_by FROM tenant_branding'),
        sql(`SELECT timezone, slot_interval_min, deposit_percent, require_deposit, cancel_window_hours, allow_client_reschedule,
                    require_verification, referral_enabled, referral_discount_percent FROM tenant_settings`),
        sql('SELECT id, name, address, district, province, lat, lng, phone FROM locations WHERE is_active ORDER BY name'),
        sql('SELECT id, location_id, name, photo_url, bio, specialties, rating_avg, rating_count FROM staff WHERE is_bookable ORDER BY sort_order, name'),
        sql('SELECT id, category, name, description, photo_url, duration_min, price_cents, is_addon FROM services WHERE is_active ORDER BY is_addon, sort_order, name'),
        sql(
          `SELECT r.stars, r.comment, r.reply, r.created_at, s.name AS staff_name, c.name AS client_name
             FROM reviews r
             LEFT JOIN staff s ON s.id = r.staff_id
             LEFT JOIN appointments a ON a.id = r.appointment_id
             LEFT JOIN clients c ON c.id = a.client_id
            WHERE r.is_published AND r.comment IS NOT NULL
            ORDER BY r.created_at DESC LIMIT 9`,
        ),
        sql<{ avg: string | null; count: string }>('SELECT round(avg(stars),1) AS avg, count(*) AS count FROM reviews WHERE is_published'),
        sql('SELECT id, name, description, price_cents, period, perks FROM membership_plans WHERE active ORDER BY sort_order, price_cents'),
        sql(`SELECT day_of_week, to_char(min(start_time), 'HH24:MI') AS open, to_char(max(end_time), 'HH24:MI') AS close
               FROM staff_schedules ss JOIN staff s ON s.id = ss.staff_id WHERE s.is_bookable
              GROUP BY day_of_week ORDER BY day_of_week`),
      ]);
      const cfg = await tenantConfig(sql);
      const review = await sql<{ google_review_url: string | null }>('SELECT google_review_url FROM tenant_settings');
      return {
        features: cfg.features,
        googleReviewUrl: review.rows[0]?.google_review_url ?? null,
        tenant: {
          slug: request.tenant!.slug,
          name: request.tenant!.name,
          is_demo: demo.rows[0]?.is_demo ?? false,
          // Suscripción vencida: el sitio muestra "no disponible" y no acepta reservas
          available: !['suspended', 'cancelled'].includes(request.tenant!.status),
        },
        branding: branding.rows[0] ?? null,
        settings: settings.rows[0] ?? null,
        locations: locations.rows,
        staff: staff.rows,
        services: services.rows,
        reviews: reviews.rows.map((r: Record<string, unknown>) => ({
          ...r,
          // Solo el nombre de pila del cliente
          client_name: typeof r.client_name === 'string' ? r.client_name.split(' ')[0] : null,
        })),
        rating: ratingAgg.rows[0] ?? { avg: null, count: '0' },
        memberships: plans.rows,
        hours: hours.rows,
      };
    });
  });

  // Dominio propio -> barbería (lo usa el middleware de la web)
  app.get('/public/resolve-host', async (request) => {
    const host = String((request.query as { host?: string }).host ?? '').toLowerCase().split(':')[0];
    const slug = host ? await tenantSlugByDomain(host) : null;
    return { slug };
  });

  // Slots disponibles
  const availabilityQuery = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    serviceId: z.string().uuid(),
    staffId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    addonIds: z.string().optional(), // ids separados por coma
  });

  app.get('/public/availability', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const parsed = availabilityQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'parametros_invalidos', detail: parsed.error.flatten() });
    const { date, serviceId, staffId, locationId } = parsed.data;
    const addonIds = (parsed.data.addonIds ?? '').split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x));
    const tenantId = request.tenant.id;

    return withTenant(tenantId, async (sql) => {
      const svc = await sql<{ duration_min: number; buffer_min: number }>(
        'SELECT duration_min, buffer_min FROM services WHERE id = $1 AND is_active',
        [serviceId],
      );
      if (svc.rows.length === 0) return reply.code(404).send({ error: 'servicio_no_encontrado' });
      const extra = addonIds.length
        ? (await sql<{ m: number }>('SELECT COALESCE(sum(duration_min), 0)::int AS m FROM services WHERE id = ANY($1) AND is_addon AND is_active', [addonIds])).rows[0].m
        : 0;
      const settings = await sql<{ timezone: string; slot_interval_min: number }>('SELECT timezone, slot_interval_min FROM tenant_settings');
      const tz = settings.rows[0]?.timezone ?? 'America/Lima';
      const interval = settings.rows[0]?.slot_interval_min ?? 15;
      const slots = await computeSlots(sql, {
        tenantId,
        locationId: locationId ?? null,
        staffId: staffId ?? null,
        date,
        durationMin: svc.rows[0].duration_min + extra + (svc.rows[0].buffer_min ?? 0),
        durationByStaff: Object.fromEntries(
          (await sql<{ staff_id: string; duration_min: number }>('SELECT staff_id, duration_min FROM service_staff WHERE service_id = $1 AND duration_min IS NOT NULL', [serviceId])).rows.map(
            (r) => [r.staff_id, r.duration_min + extra + (svc.rows[0].buffer_min ?? 0)],
          ),
        ),
        timezone: tz,
        slotIntervalMin: interval,
      });
      return { date, timezone: tz, slots };
    });
  });

  // Cotización con código de promoción y gift card
  const quoteBody = z.object({
    serviceId: z.string().uuid(),
    staffId: z.string().uuid().optional(),
    promoCode: z.string().max(40).optional(),
    giftCardCode: z.string().max(40).optional(),
    addonIds: z.array(z.string().uuid()).max(6).optional(),
    phone: z.string().max(20).optional(),
  });
  app.post('/public/quote', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const b = quoteBody.parse(request.body);
    const q = await withTenant(request.tenant.id, (sql) =>
      quote(sql, {
        serviceId: b.serviceId,
        addonIds: b.addonIds,
        staffId: b.staffId ?? null,
        promoCode: b.promoCode || null,
        giftCardCode: b.giftCardCode || null,
        phone: b.phone || null,
      }),
    );
    if (!q) return reply.code(404).send({ error: 'servicio_no_encontrado' });
    return q;
  });

  // Resumen de una cita (para la página de reseña), verificando el teléfono
  app.get('/public/appointments/:id', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const id = (request.params as { id: string }).id;
    const phone = (request.query as { phone?: string }).phone ?? '';
    if (!z.string().uuid().safeParse(id).success) return reply.code(404).send({ error: 'cita_no_encontrada' });
    const row = await withTenant(request.tenant.id, async (sql) => {
      const { rows } = await sql(
        `SELECT a.id, a.starts_at, a.status, s.name AS staff_name, sv.name AS service_name,
                (SELECT count(*) FROM reviews r WHERE r.appointment_id = a.id) AS reviewed
           FROM appointments a
           JOIN clients c ON c.id = a.client_id
           LEFT JOIN staff s ON s.id = a.staff_id
           LEFT JOIN appointment_services aps ON aps.appointment_id = a.id
           LEFT JOIN services sv ON sv.id = aps.service_id
          WHERE a.id = $1 AND regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE '%' || right(regexp_replace($2, '[^0-9]', '', 'g'), 9)
          LIMIT 1`,
        [id, phone],
      );
      return rows[0] ?? null;
    });
    if (!row || phone.replace(/\D/g, '').length < 6) return reply.code(404).send({ error: 'cita_no_encontrada' });
    return { ...row, reviewed: Number(row.reviewed) > 0 };
  });

  // Enviar reseña verificada (solo quien tuvo la cita)
  const reviewBody = z.object({
    appointmentId: z.string().uuid(),
    phone: z.string().min(6),
    stars: z.number().int().min(1).max(5),
    comment: z.string().max(800).optional(),
  });
  app.post('/public/reviews', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const b = reviewBody.parse(request.body);
    const result = await withTenant(request.tenant.id, async (sql) => {
      const { rows } = await sql<{ id: string; staff_id: string | null; status: string; starts_at: string }>(
        `SELECT a.id, a.staff_id, a.status, a.starts_at
           FROM appointments a JOIN clients c ON c.id = a.client_id
          WHERE a.id = $1 AND regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE '%' || right(regexp_replace($2, '[^0-9]', '', 'g'), 9)`,
        [b.appointmentId, b.phone],
      );
      const appt = rows[0];
      if (!appt) return { error: 'cita_no_encontrada', code: 404 };
      if (!['confirmed', 'completed'].includes(appt.status) || new Date(appt.starts_at) > new Date()) {
        return { error: 'aun_no_puedes_resenar', code: 409 };
      }
      const exists = await sql('SELECT 1 FROM reviews WHERE appointment_id = $1', [appt.id]);
      if (exists.rows.length > 0) return { error: 'ya_resenaste', code: 409 };
      await sql(
        `INSERT INTO reviews (tenant_id, appointment_id, staff_id, stars, comment, is_published)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, true)`,
        [appt.id, appt.staff_id, b.stars, b.comment?.trim() || null],
      );
      if (appt.staff_id) {
        await sql(
          `UPDATE staff SET
             rating_count = (SELECT count(*) FROM reviews WHERE staff_id = $1 AND is_published),
             rating_avg = COALESCE((SELECT round(avg(stars),2) FROM reviews WHERE staff_id = $1 AND is_published), 0)
           WHERE id = $1`,
          [appt.staff_id],
        );
      }
      return { ok: true };
    });
    if ('error' in result) return reply.code(result.code as number).send({ error: result.error });
    return reply.code(201).send(result);
  });
};
