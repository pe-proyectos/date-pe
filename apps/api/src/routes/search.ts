import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withPublicRead } from '../db.js';
import { admin, withTenant } from '../db.js';
import { computeSlots } from '../lib/availability.js';

// Buscador estilo vuelos/buses: pocos parámetros (dónde / qué / cuándo).
export const searchRoutes: FastifyPluginAsync = async (app) => {
  const query = z.object({
    district: z.string().optional(), // slug o nombre
    service: z.string().optional(), // texto libre
    q: z.string().optional(),
    // "Cerca de mí": ordena por distancia (km, fórmula del haversine)
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    // "¿Cuándo?": día (YYYY-MM-DD) y hora mínima opcional (HH:MM) en hora de Lima
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    from: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  });

  app.get('/search', async (request) => {
    const p = query.parse(request.query);
    return withPublicRead(async (sql) => {
      const { rows } = await sql(
        `SELECT
            t.id AS tenant_id, t.slug, t.name, t.is_demo,
            l.id AS location_id, l.name AS location_name, l.district, l.province, l.lat, l.lng,
            b.logo_url, b.cover_url, b.tagline,
            (SELECT min(price_cents) FROM services s WHERE s.tenant_id = t.id AND s.is_active AND NOT s.is_addon) AS desde_cents,
            (SELECT round(avg(rating_avg),2) FROM staff st WHERE st.tenant_id = t.id AND st.rating_count > 0) AS rating,
            (SELECT count(*) FROM staff st WHERE st.tenant_id = t.id AND st.is_bookable) AS barberos,
            CASE WHEN $5::float8 IS NULL OR l.lat IS NULL THEN NULL ELSE round((6371 * 2 * asin(sqrt(
              power(sin(radians(l.lat - $5) / 2), 2) + cos(radians($5)) * cos(radians(l.lat)) * power(sin(radians(l.lng - $6) / 2), 2)
            )))::numeric, 1) END AS distance_km
         FROM locations l
         JOIN tenants t ON t.id = l.tenant_id AND t.status IN ('trial','active')
         LEFT JOIN tenant_branding b ON b.tenant_id = t.id
        WHERE l.is_active
          AND ($1::text IS NULL OR l.district ILIKE '%'||$1||'%' OR l.province ILIKE '%'||$1||'%')
          AND ($2::text IS NULL OR EXISTS (
                SELECT 1 FROM services s WHERE s.tenant_id = t.id AND s.is_active AND (s.name ILIKE '%'||$2||'%' OR $2 ILIKE '%'||s.name||'%')))
          AND ($3::text IS NULL OR t.name ILIKE '%'||$3||'%' OR l.district ILIKE '%'||$3||'%')
        ORDER BY CASE WHEN $5::float8 IS NULL THEN 0 ELSE 1 END, distance_km ASC NULLS LAST, t.is_demo ASC, rating DESC NULLS LAST, barberos DESC
        LIMIT $4`,
        [p.district ?? null, p.service ?? null, p.q ?? null, p.limit, p.lat ?? null, p.lng ?? null],
      );
      if (!p.date) return { results: rows.map(({ tenant_id, ...r }: Record<string, unknown>) => (void tenant_id, r)) };
      // Disponibilidad real: próximos horarios libres de cada barbería ese día
      const withSlots = await Promise.all(
        rows.map(async (r: Record<string, unknown>) => {
          const slots = await withTenant(r.tenant_id as string, async (tsql) => {
            const svc = await tsql<{ id: string; duration_min: number; buffer_min: number }>(
              `SELECT id, duration_min, buffer_min FROM services WHERE is_active AND NOT is_addon
                 AND ($1::text IS NULL OR name ILIKE '%' || $1 || '%' OR $1 ILIKE '%' || name || '%')
                ORDER BY sort_order, price_cents LIMIT 1`,
              [p.service ?? null],
            );
            if (!svc.rows[0]) return [];
            const all = await computeSlots(tsql, {
              tenantId: r.tenant_id as string,
              locationId: r.location_id as string,
              date: p.date!,
              durationMin: svc.rows[0].duration_min + (svc.rows[0].buffer_min ?? 0),
              timezone: 'America/Lima',
              slotIntervalMin: 15,
            });
            const minTime = p.from ? new Date(`${p.date}T${p.from}:00-05:00`).getTime() : 0;
            return all.filter((s) => new Date(s.start).getTime() >= minTime).slice(0, 4).map((s) => s.start);
          });
          const { tenant_id, ...rest } = r;
          void tenant_id;
          return { ...rest, next_slots: slots };
        }),
      );
      // Primero las que tienen horario, luego las llenas
      withSlots.sort((a, b) => Number(b.next_slots.length > 0) - Number(a.next_slots.length > 0));
      return { results: withSlots, date: p.date };
    });
  });

  // Distrito más cercano a unas coordenadas (para "cerca de mí")
  app.get('/geo/nearest', async (request) => {
    const q = z.object({ lat: z.coerce.number(), lng: z.coerce.number() }).parse(request.query);
    const { rows } = await admin(
      `SELECT slug, province, district, lat, lng FROM geo_districts WHERE lat IS NOT NULL
        ORDER BY power(lat - $1, 2) + power((lng - $2) * cos(radians($1)), 2) LIMIT 1`,
      [q.lat, q.lng],
    );
    return { district: rows[0] ?? null };
  });

  // Autocomplete de distritos (para la barra)
  app.get('/geo/districts', async (request) => {
    const q = (request.query as { q?: string }).q ?? '';
    const { rows } = await admin(
      `SELECT slug, province, district, lat, lng FROM geo_districts
        WHERE ($1 = '' OR district ILIKE '%'||$1||'%' OR province ILIKE '%'||$1||'%')
        ORDER BY district LIMIT 20`,
      [q],
    );
    return { districts: rows };
  });
};
