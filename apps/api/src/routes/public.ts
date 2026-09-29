import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db.js';
import { computeSlots } from '../lib/availability.js';

// Datos públicos de un tenant para su landing/reserva y cálculo de slots.
export const publicRoutes: FastifyPluginAsync = async (app) => {
  // Config + branding del tenant actual (resuelto por Host)
  app.get('/public/site', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const tenantId = request.tenant.id;
    return withTenant(tenantId, async (sql) => {
      const branding = await sql(
        'SELECT logo_url, cover_url, color_primary, color_secondary, tagline, about, instagram, whatsapp FROM tenant_branding',
      );
      const settings = await sql(
        'SELECT timezone, slot_interval_min, deposit_percent, require_deposit, cancel_window_hours FROM tenant_settings',
      );
      const locations = await sql(
        'SELECT id, name, address, district, province, lat, lng, phone FROM locations WHERE is_active ORDER BY name',
      );
      const staff = await sql(
        "SELECT id, name, photo_url, bio, specialties, rating_avg, rating_count FROM staff WHERE is_bookable ORDER BY sort_order, name",
      );
      const services = await sql(
        'SELECT id, category, name, description, photo_url, duration_min, price_cents FROM services WHERE is_active ORDER BY sort_order, name',
      );
      const reviews = await sql(
        `SELECT r.stars, r.comment, r.created_at, s.name AS staff_name
           FROM reviews r LEFT JOIN staff s ON s.id = r.staff_id
          WHERE r.is_published AND r.comment IS NOT NULL
          ORDER BY r.created_at DESC LIMIT 8`,
      );
      const ratingAgg = await sql<{ avg: string | null; count: string }>(
        'SELECT round(avg(stars),1) AS avg, count(*) AS count FROM reviews WHERE is_published',
      );
      return {
        tenant: { slug: request.tenant!.slug, name: request.tenant!.name },
        branding: branding.rows[0] ?? null,
        settings: settings.rows[0] ?? null,
        locations: locations.rows,
        staff: staff.rows,
        services: services.rows,
        reviews: reviews.rows,
        rating: ratingAgg.rows[0] ?? { avg: null, count: '0' },
      };
    });
  });

  // Slots disponibles
  const availabilityQuery = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    serviceId: z.string().uuid(),
    staffId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
  });

  app.get('/public/availability', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const parsed = availabilityQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'parametros_invalidos', detail: parsed.error.flatten() });
    const { date, serviceId, staffId, locationId } = parsed.data;
    const tenantId = request.tenant.id;

    return withTenant(tenantId, async (sql) => {
      const svc = await sql<{ duration_min: number }>(
        'SELECT duration_min FROM services WHERE id = $1 AND is_active',
        [serviceId],
      );
      if (svc.rows.length === 0) return reply.code(404).send({ error: 'servicio_no_encontrado' });
      const settings = await sql<{ timezone: string; slot_interval_min: number }>(
        'SELECT timezone, slot_interval_min FROM tenant_settings',
      );
      const tz = settings.rows[0]?.timezone ?? 'America/Lima';
      const interval = settings.rows[0]?.slot_interval_min ?? 15;
      const slots = await computeSlots(sql, {
        tenantId,
        locationId: locationId ?? null,
        staffId: staffId ?? null,
        date,
        durationMin: svc.rows[0].duration_min,
        timezone: tz,
        slotIntervalMin: interval,
      });
      return { date, timezone: tz, slots };
    });
  });
};
