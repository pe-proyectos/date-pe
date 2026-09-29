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
    limit: z.coerce.number().int().min(1).max(50).default(20),
  });

  app.get('/search', async (request) => {
    const p = query.parse(request.query);
    return withPublicRead(async (sql) => {
      const { rows } = await sql(
        `SELECT
            t.slug, t.name,
            l.id AS location_id, l.name AS location_name, l.district, l.province, l.lat, l.lng,
            b.logo_url, b.cover_url, b.tagline,
            (SELECT min(price_cents) FROM services s WHERE s.tenant_id = t.id AND s.is_active) AS desde_cents,
            (SELECT round(avg(rating_avg),2) FROM staff st WHERE st.tenant_id = t.id AND st.rating_count > 0) AS rating,
            (SELECT count(*) FROM staff st WHERE st.tenant_id = t.id AND st.is_bookable) AS barberos
         FROM locations l
         JOIN tenants t ON t.id = l.tenant_id AND t.status IN ('trial','active')
         LEFT JOIN tenant_branding b ON b.tenant_id = t.id
        WHERE l.is_active
          AND ($1::text IS NULL OR l.district ILIKE '%'||$1||'%' OR l.province ILIKE '%'||$1||'%')
          AND ($2::text IS NULL OR EXISTS (
                SELECT 1 FROM services s WHERE s.tenant_id = t.id AND s.is_active AND s.name ILIKE '%'||$2||'%'))
          AND ($3::text IS NULL OR t.name ILIKE '%'||$3||'%' OR l.district ILIKE '%'||$3||'%')
        ORDER BY rating DESC NULLS LAST, barberos DESC
        LIMIT $4`,
        [p.district ?? null, p.service ?? null, p.q ?? null, p.limit],
      );
      return { results: rows };
    });
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
