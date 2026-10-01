import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { admin, withTenant } from '../db.js';

// Estadísticas de la página de cada barbería: visitas, de dónde llegan y cuántos reservan.
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|monitor|datepe-watchdog/i;
const hits = new Map<string, { n: number; t: number }>();

function sourceOf(ref: string | undefined, host: string | undefined): string {
  if (!ref) return 'directo';
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '');
    if (host && h === host.replace(/^www\./, '')) return 'interno';
    if (/instagram\.com$/.test(h)) return 'instagram';
    if (/facebook\.com$|fb\.me$|messenger\.com$/.test(h)) return 'facebook';
    if (/google\./.test(h)) return 'google';
    if (/wa\.me$|whatsapp\.com$/.test(h)) return 'whatsapp';
    if (/tiktok\.com$/.test(h)) return 'tiktok';
    if (/^date\.pe$|\.date\.pe$/.test(h)) return 'date.pe';
    return 'otros';
  } catch {
    return 'otros';
  }
}

function tid(request: FastifyRequest): string {
  if (!request.tenant) throw new Error('tenant_no_resuelto');
  return request.tenant.id;
}

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  // Llega por sendBeacon como texto plano (Fastify ya lo entrega como string)
  app.post('/public/track', async (request, reply) => {
    if (!request.tenant) return reply.code(204).send();
    const ua = String(request.headers['user-agent'] ?? '');
    if (!ua || BOT.test(ua)) return reply.code(204).send();
    const ip = (request.headers['cf-connecting-ip'] as string) || request.ip;
    const now = Date.now();
    const h = hits.get(ip);
    if (h && now - h.t < 60_000) {
      if (++h.n > 60) return reply.code(204).send();
    } else hits.set(ip, { n: 1, t: now });
    let raw: unknown = request.body;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { return reply.code(204).send(); }
    }
    const b = z
      .object({ kind: z.enum(['view', 'book_click', 'book_start']), path: z.string().max(200).optional(), ref: z.string().max(500).optional(), host: z.string().max(200).optional(), visitor: z.string().regex(/^[a-z0-9]{8,40}$/).optional() })
      .safeParse(raw);
    if (!b.success) return reply.code(204).send();
    const source = sourceOf(b.data.ref, b.data.host);
    await admin(`INSERT INTO site_events (tenant_id, kind, path, source, visitor) VALUES ($1, $2, $3, $4, $5)`, [
      request.tenant.id,
      b.data.kind,
      (b.data.path ?? '/').split('?')[0].slice(0, 120),
      source === 'interno' ? null : source,
      b.data.visitor ?? null,
    ]);
    return reply.code(204).send();
  });

  app.get('/admin/analytics', { preHandler: app.requireTenant }, async (request) => {
    const { days } = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) }).parse(request.query);
    return withTenant(tid(request), async (sql) => {
      const since = `now() - make_interval(days => $1)`;
      const [totals, daily, sources, pages, services, staff, prev] = await Promise.all([
        sql<Record<string, number>>(
          `SELECT
             (SELECT count(*) FROM site_events WHERE kind = 'view' AND created_at > ${since})::int AS views,
             (SELECT count(DISTINCT visitor) FROM site_events WHERE kind = 'view' AND created_at > ${since})::int AS visitors,
             (SELECT count(DISTINCT visitor) FROM site_events WHERE kind = 'book_click' AND created_at > ${since})::int AS book_clicks,
             (SELECT count(DISTINCT visitor) FROM site_events WHERE kind = 'book_start' AND created_at > ${since})::int AS book_starts,
             (SELECT count(*) FROM appointments WHERE source = 'online' AND created_at > ${since} AND status <> 'cancelled')::int AS bookings,
             (SELECT COALESCE(sum(price_cents), 0) FROM appointments WHERE source = 'online' AND created_at > ${since} AND status <> 'cancelled')::int AS booked_cents`,
          [days],
        ),
        sql(
          `SELECT to_char(d, 'YYYY-MM-DD') AS day,
                  (SELECT count(DISTINCT visitor) FROM site_events e WHERE e.kind = 'view' AND (e.created_at AT TIME ZONE 'America/Lima')::date = d)::int AS visitors,
                  (SELECT count(*) FROM appointments a WHERE a.source = 'online' AND a.status <> 'cancelled' AND (a.created_at AT TIME ZONE 'America/Lima')::date = d)::int AS bookings
             FROM generate_series((now() AT TIME ZONE 'America/Lima')::date - ($1::int - 1), (now() AT TIME ZONE 'America/Lima')::date, interval '1 day') AS d`,
          [days],
        ),
        // source nulo = navegación dentro de la página: no cuenta como origen
        sql(`SELECT source, count(DISTINCT visitor)::int AS visitors FROM site_events WHERE kind = 'view' AND source IS NOT NULL AND created_at > ${since} GROUP BY 1 ORDER BY 2 DESC`, [days]),
        sql(
          `SELECT e.path, st.name AS staff_name, count(*)::int AS views FROM site_events e
             LEFT JOIN staff st ON e.path LIKE '/equipo/%' AND st.id::text = substring(e.path FROM 9)
            WHERE e.kind = 'view' AND e.created_at > ${since} GROUP BY e.path, st.name ORDER BY 3 DESC LIMIT 8`,
          [days],
        ),
        sql(
          `SELECT sv.name, count(*)::int AS n FROM appointments a JOIN appointment_services aps ON aps.appointment_id = a.id JOIN services sv ON sv.id = aps.service_id
            WHERE a.created_at > ${since} AND a.status <> 'cancelled' AND NOT sv.is_addon GROUP BY sv.name ORDER BY n DESC LIMIT 6`,
          [days],
        ),
        sql(
          `SELECT st.name, count(*)::int AS n FROM appointments a JOIN staff st ON st.id = a.staff_id
            WHERE a.created_at > ${since} AND a.status <> 'cancelled' GROUP BY st.name ORDER BY n DESC LIMIT 6`,
          [days],
        ),
        sql<{ visitors: number; bookings: number }>(
          `SELECT (SELECT count(DISTINCT visitor) FROM site_events WHERE kind = 'view' AND created_at BETWEEN now() - make_interval(days => $1 * 2) AND now() - make_interval(days => $1))::int AS visitors,
                  (SELECT count(*) FROM appointments WHERE source = 'online' AND status <> 'cancelled' AND created_at BETWEEN now() - make_interval(days => $1 * 2) AND now() - make_interval(days => $1))::int AS bookings`,
          [days],
        ),
      ]);
      return { days, totals: totals.rows[0], previous: prev.rows[0], daily: daily.rows, sources: sources.rows, pages: pages.rows, services: services.rows, staff: staff.rows };
    });
  });
};
