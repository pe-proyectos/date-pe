import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withPublicRead } from '../db.js';
import { admin } from '../db.js';

// Buscador estilo vuelos/buses: pocos parámetros (dónde / qué / cuándo).
export const searchRoutes: FastifyPluginAsync = async (app) => {
  const query = z.object({
    district: z.string().optional(), // slug o nombre
    service: z.string().optional(), // texto libre
    q: z.string().optional(),
    // "Cerca de mí": ordena por distancia (km, fórmula del haversine)
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  });

  app.get('/search', async (request) => {
    const p = query.parse(request.query);
    return withPublicRead(async (sql) => {
      const { rows } = await sql(
        `SELECT
            t.slug, t.name, t.is_demo,
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
      return { results: rows };
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
