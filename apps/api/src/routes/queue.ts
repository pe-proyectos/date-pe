import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { withTenant, admin, type Sql } from '../db.js';
import { tenantConfig, FeatureOff, type TenantConfig } from '../lib/features.js';
import { emitTenantEvent } from '../lib/realtime.js';
import { pushToTicket, pushToUsers, saveSubscription, pushEnabled } from '../lib/push.js';
import { env } from '../env.js';
import { searchTracks, resolveTrack, youtubeSearchEnabled, type Track } from '../lib/youtube.js';

// Fila virtual (QR en la puerta), pantalla de TV y música a pedido.
// Todo en hora de Lima; cada cambio se difunde por WebSocket al instante.
const TODAY = "(now() AT TIME ZONE 'America/Lima')::date";
const firstName = (n: string | null) => (n ?? '').trim().split(/\s+/)[0] || 'Cliente';

function tenantOf(request: FastifyRequest) {
  if (!request.tenant) throw Object.assign(new Error('tenant_no_encontrado'), { statusCode: 404 });
  return request.tenant;
}

function handleErr(err: unknown, reply: FastifyReply) {
  if (err instanceof FeatureOff) return reply.code(403).send({ error: 'funcion_desactivada', feature: err.feature });
  throw err;
}

interface TicketRow {
  id: string;
  number: number;
  name: string;
  status: string;
  staff_id: string | null;
  served_by: string | null;
  service_id: string | null;
  service_name: string | null;
  duration_min: number | null;
  staff_name: string | null;
  served_by_name: string | null;
  sort_at: Date;
  called_at: Date | null;
  started_at: Date | null;
  delays: number;
}

async function todayTickets(sql: Sql, statuses = ['waiting', 'called', 'serving']): Promise<TicketRow[]> {
  const { rows } = await sql<TicketRow>(
    `SELECT q.id, q.number, q.name, q.status, q.staff_id, q.served_by, q.service_id, sv.name AS service_name, sv.duration_min,
            s.name AS staff_name, sb.name AS served_by_name, q.sort_at, q.called_at, q.started_at, q.delays
       FROM queue_tickets q
       LEFT JOIN services sv ON sv.id = q.service_id
       LEFT JOIN staff s ON s.id = q.staff_id
       LEFT JOIN staff sb ON sb.id = q.served_by
      WHERE q.day = ${TODAY} AND q.status = ANY($1)
      ORDER BY q.sort_at`,
    [statuses],
  );
  return rows;
}

/** Barberos que atienden ahora (o, antes de abrir, los que atienden hoy) para estimar la espera. */
async function activeBarbers(sql: Sql): Promise<number> {
  const { rows } = await sql<{ now: number; today: number }>(
    `SELECT count(DISTINCT ss.staff_id) FILTER (WHERE (now() AT TIME ZONE 'America/Lima')::time BETWEEN ss.start_time AND ss.end_time)::int AS now,
            count(DISTINCT ss.staff_id)::int AS today
       FROM staff_schedules ss JOIN staff s ON s.id = ss.staff_id
      WHERE s.is_bookable AND ss.day_of_week = EXTRACT(DOW FROM now() AT TIME ZONE 'America/Lima')`,
  );
  return rows[0]?.now || rows[0]?.today || 0;
}

/** Abierta si alguien atiende ahora, o si falta poco para abrir (turno anticipado). */
async function isOpen(sql: Sql, earlyMinutes = 60): Promise<boolean> {
  const { rows } = await sql<{ total: number; open: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE ss.day_of_week = EXTRACT(DOW FROM now() AT TIME ZONE 'America/Lima')
              AND (now() AT TIME ZONE 'America/Lima')::time BETWEEN ss.start_time - make_interval(mins => $1) AND ss.end_time - interval '15 minutes')::int AS open
       FROM staff_schedules ss JOIN staff s ON s.id = ss.staff_id WHERE s.is_bookable`,
    [earlyMinutes],
  );
  if ((rows[0]?.total ?? 0) === 0) return true;
  return (rows[0]?.open ?? 0) > 0;
}

/**
 * Posición y espera estimada de cada ticket en espera. Quien pidió un barbero
 * solo avanza con ese barbero; el resto, con cualquiera.
 */
function estimate(tickets: TicketRow[], barbers: number, fallback: number) {
  const waiting = tickets.filter((t) => t.status === 'waiting');
  const busy = tickets.filter((t) => t.status === 'serving' || t.status === 'called');
  const lanes = Math.max(1, barbers);
  // Minutos que le faltan a cada barbero ocupado
  const remainingNow = busy.reduce((sum, t) => {
    const dur = t.duration_min ?? fallback;
    const started = t.started_at ?? t.called_at;
    const elapsed = started ? (Date.now() - new Date(started).getTime()) / 60000 : 0;
    return sum + Math.max(3, dur - elapsed);
  }, 0);
  const out = new Map<string, { position: number; ahead: number; etaMin: number }>();
  waiting.forEach((t, i) => {
    // Quienes van delante y compiten por el mismo barbero (o por cualquiera)
    const before = waiting.slice(0, i).filter((o) => !t.staff_id || !o.staff_id || o.staff_id === t.staff_id);
    const aheadMinutes = before.reduce((s, o) => s + (o.duration_min ?? fallback), 0);
    const lanesFor = t.staff_id ? 1 : lanes;
    const eta = remainingNow / lanes + aheadMinutes / lanesFor;
    out.set(t.id, { position: i + 1, ahead: before.length, etaMin: Math.max(0, Math.round(eta)) });
  });
  return out;
}

async function publicState(sql: Sql, cfg: TenantConfig) {
  const [tickets, barbers, open, appts, songs, branding, staff, services] = await Promise.all([
    todayTickets(sql),
    activeBarbers(sql),
    isOpen(sql, cfg.queue.earlyMinutes),
    cfg.tv.showAppointments
      ? sql(
          `SELECT a.starts_at, c.name AS client_name, s.name AS staff_name FROM appointments a
             LEFT JOIN clients c ON c.id = a.client_id LEFT JOIN staff s ON s.id = a.staff_id
            WHERE a.status = 'confirmed' AND a.starts_at BETWEEN now() - interval '15 minutes' AND now() + interval '3 hours'
            ORDER BY a.starts_at LIMIT 6`,
        )
      : Promise.resolve({ rows: [] }),
    cfg.features.music ? musicState(sql) : Promise.resolve(null),
    sql('SELECT logo_url, cover_url, color_primary, tagline, instagram FROM tenant_branding'),
    sql('SELECT id, name, photo_url FROM staff WHERE is_bookable ORDER BY sort_order, name'),
    sql('SELECT id, name, duration_min, price_cents FROM services WHERE is_active AND NOT is_addon ORDER BY sort_order, name'),
  ]);
  const opens = await sql<{ opens: string | null }>(
    `SELECT to_char(min(ss.start_time), 'HH24:MI') AS opens FROM staff_schedules ss JOIN staff s ON s.id = ss.staff_id
      WHERE s.is_bookable AND ss.day_of_week = EXTRACT(DOW FROM now() AT TIME ZONE 'America/Lima') AND ss.start_time > (now() AT TIME ZONE 'America/Lima')::time`,
  );
  const est = estimate(tickets, barbers, cfg.queue.fallbackMinutes);
  const waiting = tickets.filter((t) => t.status === 'waiting');
  const nextEta = Math.round(
    (waiting.reduce((s, t) => s + (t.duration_min ?? cfg.queue.fallbackMinutes), 0) + tickets.filter((t) => t.status !== 'waiting').length * (cfg.queue.fallbackMinutes / 2)) /
      Math.max(1, barbers),
  );
  return {
    open,
    pushPublicKey: pushEnabled() ? env.vapidPublicKey : null,
    opensAt: opens.rows[0]?.opens ?? null,
    features: { queue: cfg.features.queue, music: cfg.features.music, booking: cfg.features.booking },
    tv: cfg.tv,
    queueConfig: { allowStaffChoice: cfg.queue.allowStaffChoice, askPhone: cfg.queue.askPhone, welcome: cfg.queue.welcome, closedMessage: cfg.queue.closedMessage, maxWaiting: cfg.queue.maxWaiting },
    musicConfig: { volume: cfg.music.volume, allowVotes: cfg.music.allowVotes, requireTicket: cfg.music.requireTicket, maxDurationMin: cfg.music.maxDurationMin, searchEnabled: youtubeSearchEnabled() },
    branding: branding.rows[0] ?? null,
    staff: staff.rows,
    services: services.rows,
    barbersNow: barbers,
    waitingCount: waiting.length,
    estimatedWaitMin: nextEta,
    serving: tickets
      .filter((t) => t.status !== 'waiting')
      .map((t) => ({ id: t.id, number: t.number, name: firstName(t.name), status: t.status, staff: t.served_by_name ?? t.staff_name, calledAt: t.called_at })),
    waiting: waiting.map((t) => ({ id: t.id, number: t.number, name: firstName(t.name), service: t.service_name, staff: t.staff_name, etaMin: est.get(t.id)?.etaMin ?? null })),
    appointments: (appts.rows as Array<{ starts_at: Date; client_name: string | null; staff_name: string | null }>).map((a) => ({ at: a.starts_at, name: firstName(a.client_name), staff: a.staff_name })),
    music: songs,
  };
}

// ------------------------------- Música -------------------------------
async function musicState(sql: Sql) {
  const { rows } = await sql<{ id: string; video_id: string; title: string; channel: string | null; thumbnail: string | null; duration_s: number | null; status: string; votes: number; requested_by: string; started_at: Date | null }>(
    `SELECT id, video_id, title, channel, thumbnail, duration_s, status, votes, requested_by, started_at FROM song_requests
      WHERE status IN ('queued','playing') AND created_at > now() - interval '18 hours'
      ORDER BY (status = 'playing') DESC, votes DESC, created_at`,
  );
  return { nowPlaying: rows.find((r) => r.status === 'playing') ?? null, upNext: rows.filter((r) => r.status === 'queued').map((r) => ({ ...r, requested_by: firstName(r.requested_by) })) };
}

interface TicketLite { id: string; name: string; status: string; number: number; day: string; staff_id: string | null; service_id: string | null; delays: number }
async function ticketByToken(sql: Sql, token: string): Promise<TicketLite | null> {
  const { rows } = await sql<{ id: string; name: string; status: string; number: number; day: string; staff_id: string | null; service_id: string | null; delays: number }>(
    `SELECT id, name, status, number, day::text, staff_id, service_id, delays FROM queue_tickets WHERE token = $1`,
    [token],
  );
  return rows[0] ?? null;
}

export const queueRoutes: FastifyPluginAsync = async (app) => {
  // ============================ Público: TV, QR y ticket ============================
  app.get('/public/queue', async (request, reply) => {
    const t = tenantOf(request);
    return withTenant(t.id, async (sql) => {
      const cfg = await tenantConfig(sql);
      if (!cfg.features.queue && !cfg.features.tv) return reply.code(403).send({ error: 'funcion_desactivada' });
      return { tenant: { name: t.name, slug: t.slug }, ...(await publicState(sql, cfg)) };
    });
  });

  const joinBody = z.object({
    name: z.string().trim().min(1).max(40),
    phone: z.string().max(20).optional(),
    email: z.string().email().optional(),
    serviceId: z.string().uuid().optional(),
    staffId: z.string().uuid().optional(),
  });
  app.post('/public/queue/join', async (request, reply) => {
    const t = tenantOf(request);
    const b = joinBody.parse(request.body);
    try {
      const out = await withTenant(t.id, async (sql) => {
        const cfg = await tenantConfig(sql);
        if (!cfg.features.queue) throw new FeatureOff('queue');
        if (!(await isOpen(sql, cfg.queue.earlyMinutes))) return { error: 'cerrado', message: cfg.queue.closedMessage };
        const waiting = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM queue_tickets WHERE day = ${TODAY} AND status = 'waiting'`);
        if ((waiting.rows[0]?.n ?? 0) >= cfg.queue.maxWaiting) return { error: 'fila_llena' };
        if (cfg.queue.askPhone && !b.phone) return { error: 'falta_celular' };
        // Mismo celular hoy: devolvemos su ticket en vez de duplicar
        if (b.phone) {
          const dup = await sql<{ token: string; number: number }>(
            `SELECT token, number FROM queue_tickets WHERE day = ${TODAY} AND status IN ('waiting','called','serving')
               AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || right(regexp_replace($1, '[^0-9]', '', 'g'), 9)`,
            [b.phone],
          );
          if (dup.rows[0]) return { token: dup.rows[0].token, number: dup.rows[0].number, existing: true };
        }
        const client = b.phone
          ? (
              await sql<{ id: string }>(
                `SELECT id FROM clients WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || right(regexp_replace($1, '[^0-9]', '', 'g'), 9) LIMIT 1`,
                [b.phone],
              )
            ).rows[0]
          : null;
        // Número del día: se reinicia cada mañana
        await sql("SELECT pg_advisory_xact_lock(hashtext(current_setting('app.tenant_id') || 'queue'))");
        const n = await sql<{ n: number }>(`SELECT COALESCE(max(number), 0) + 1 AS n FROM queue_tickets WHERE day = ${TODAY}`);
        const { rows } = await sql<{ token: string; number: number }>(
          `INSERT INTO queue_tickets (tenant_id, day, number, name, phone, email, service_id, staff_id, source, client_id)
           VALUES (current_setting('app.tenant_id')::uuid, ${TODAY}, $1, $2, $3, $4, $5, $6, 'qr', $7) RETURNING token, number`,
          [n.rows[0].n, b.name, b.phone ?? null, b.email ?? null, b.serviceId ?? null, cfg.queue.allowStaffChoice ? (b.staffId ?? null) : null, client?.id ?? null],
        );
        return rows[0];
      });
      if ('error' in out) return reply.code(409).send(out);
      await emitTenantEvent(t.id, 'queue_changed');
      void pushToUsers(t.id, { roles: ['owner', 'manager', 'cashier'], staffId: b.staffId ?? null }, { title: `Turno ${out.number}: ${firstName(b.name)}`, body: 'Se sumó a la fila virtual', url: '/admin#fila', tag: 'fila' });
      return reply.code(201).send(out);
    } catch (err) {
      return handleErr(err, reply);
    }
  });

  app.get('/public/queue/ticket', async (request, reply) => {
    const t = tenantOf(request);
    const { token } = z.object({ token: z.string().min(16).max(64) }).parse(request.query);
    return withTenant(t.id, async (sql) => {
      const ticket = await ticketByToken(sql, token);
      if (!ticket) return reply.code(404).send({ error: 'ticket_no_encontrado' });
      const cfg = await tenantConfig(sql);
      const tickets = await todayTickets(sql, ['waiting', 'called', 'serving', 'done']);
      const est = estimate(tickets, await activeBarbers(sql), cfg.queue.fallbackMinutes);
      const me = tickets.find((x) => x.id === ticket.id);
      const mySongs = cfg.features.music
        ? (await sql('SELECT id, title, status FROM song_requests WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 3', [ticket.id])).rows
        : [];
      return {
        ticket: {
          number: ticket.number,
          name: firstName(ticket.name),
          status: ticket.status,
          day: ticket.day,
          service: me?.service_name ?? null,
          staff: me?.staff_name ?? null,
          servedBy: me?.served_by_name ?? null,
          position: est.get(ticket.id)?.position ?? null,
          ahead: est.get(ticket.id)?.ahead ?? null,
          etaMin: est.get(ticket.id)?.etaMin ?? null,
          canDelay: ticket.status === 'waiting' && ticket.delays < 2,
        },
        songs: mySongs,
        tenant: { name: t.name, slug: t.slug },
        ...(await publicState(sql, cfg)),
      };
    });
  });

  app.post('/public/queue/ticket/cancel', async (request, reply) => {
    const t = tenantOf(request);
    const { token } = z.object({ token: z.string() }).parse(request.body);
    const r = await withTenant(t.id, (sql) => sql("UPDATE queue_tickets SET status = 'cancelled' WHERE token = $1 AND status IN ('waiting','called') RETURNING id", [token]));
    if (!r.rows.length) return reply.code(404).send({ error: 'ticket_no_encontrado' });
    await emitTenantEvent(t.id, 'queue_changed');
    return { ok: true };
  });

  // "Me demoro unos minutos": deja pasar a los dos siguientes, sin perder el turno
  app.post('/public/queue/ticket/delay', async (request, reply) => {
    const t = tenantOf(request);
    const { token } = z.object({ token: z.string() }).parse(request.body);
    const out = await withTenant(t.id, async (sql) => {
      const me = await ticketByToken(sql, token);
      if (!me || me.status !== 'waiting' || me.delays >= 2) return { error: 'no_se_puede' };
      const behind = await sql<{ sort_at: Date }>(
        `SELECT sort_at FROM queue_tickets WHERE day = ${TODAY} AND status = 'waiting' AND sort_at > (SELECT sort_at FROM queue_tickets WHERE id = $1)
          ORDER BY sort_at LIMIT 2`,
        [me.id],
      );
      const last = behind.rows[behind.rows.length - 1];
      if (!last) return { error: 'eres_el_ultimo' };
      await sql("UPDATE queue_tickets SET sort_at = $2::timestamptz + interval '1 millisecond', delays = delays + 1, near_notified_at = NULL WHERE id = $1", [me.id, last.sort_at]);
      return { ok: true };
    });
    if ('error' in out) return reply.code(409).send(out);
    await emitTenantEvent(t.id, 'queue_changed');
    return out;
  });

  app.post('/public/queue/ticket/push', async (request, reply) => {
    const t = tenantOf(request);
    const b = z.object({ token: z.string(), subscription: z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }) }).parse(request.body);
    const ticket = await withTenant(t.id, (sql) => ticketByToken(sql, b.token));
    if (!ticket) return reply.code(404).send({ error: 'ticket_no_encontrado' });
    await saveSubscription({ tenantId: t.id, ticketId: ticket.id, endpoint: b.subscription.endpoint, p256dh: b.subscription.keys.p256dh, auth: b.subscription.keys.auth });
    return { ok: true };
  });

  // ============================ Música (público) ============================
  app.get('/public/music/search', async (request, reply) => {
    const t = tenantOf(request);
    const { q } = z.object({ q: z.string().trim().min(2).max(80) }).parse(request.query);
    const cfg = await withTenant(t.id, (sql) => tenantConfig(sql));
    if (!cfg.features.music) return reply.code(403).send({ error: 'funcion_desactivada' });
    // Un enlace pegado se resuelve directo, con o sin clave de YouTube
    const direct = await resolveTrack(q);
    if (direct) return { tracks: [direct], searchEnabled: youtubeSearchEnabled() };
    const tracks = await searchTracks(q);
    const blocked = cfg.music.blockedWords.map((w) => w.toLowerCase()).filter(Boolean);
    return {
      tracks: tracks.filter((tr) => (tr.durationS ?? 0) <= cfg.music.maxDurationMin * 60 && !blocked.some((w) => tr.title.toLowerCase().includes(w))),
      searchEnabled: youtubeSearchEnabled(),
    };
  });

  const requestBody = z.object({ token: z.string().optional(), name: z.string().max(40).optional(), videoId: z.string().optional(), query: z.string().max(200).optional() });
  app.post('/public/music/request', async (request, reply) => {
    const t = tenantOf(request);
    const b = requestBody.parse(request.body);
    const out = await withTenant(t.id, async (sql) => {
      const cfg = await tenantConfig(sql);
      if (!cfg.features.music) return { error: 'funcion_desactivada' };
      let ticket: TicketLite | null = null;
      if (b.token) ticket = await ticketByToken(sql, b.token);
      if (cfg.music.requireTicket && (!ticket || !['waiting', 'called', 'serving'].includes(ticket.status))) return { error: 'solo_con_turno' };
      const track: Track | null = await resolveTrack(b.videoId ?? b.query ?? '');
      if (!track) return { error: 'cancion_no_encontrada' };
      if (track.durationS && track.durationS > cfg.music.maxDurationMin * 60) return { error: 'cancion_muy_larga', max: cfg.music.maxDurationMin };
      const blocked = cfg.music.blockedWords.map((w) => w.toLowerCase()).filter(Boolean);
      if (blocked.some((w) => track.title.toLowerCase().includes(w))) return { error: 'cancion_no_permitida' };
      const q = await sql<{ n: number; dup: number; mine: number }>(
        `SELECT count(*)::int AS n,
                count(*) FILTER (WHERE video_id = $1)::int AS dup,
                count(*) FILTER (WHERE ticket_id = $2)::int AS mine
           FROM song_requests WHERE status IN ('queued','playing') AND created_at > now() - interval '18 hours'`,
        [track.videoId, ticket?.id ?? null],
      );
      if (q.rows[0].dup > 0) return { error: 'ya_esta_en_la_lista' };
      if (q.rows[0].n >= cfg.music.maxQueue) return { error: 'lista_llena' };
      if (ticket && q.rows[0].mine >= cfg.music.perTicket) return { error: 'ya_pediste', max: cfg.music.perTicket };
      const { rows } = await sql(
        `INSERT INTO song_requests (tenant_id, ticket_id, requested_by, video_id, title, channel, thumbnail, duration_s)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [ticket?.id ?? null, ticket?.name ?? b.name ?? 'Cliente', track.videoId, track.title.slice(0, 200), track.channel, track.thumbnail, track.durationS],
      );
      return { ok: true, id: rows[0].id, title: track.title };
    });
    if ('error' in out) return reply.code(out.error === 'funcion_desactivada' ? 403 : 409).send(out);
    await emitTenantEvent(t.id, 'music_changed');
    return reply.code(201).send(out);
  });

  app.post('/public/music/vote', async (request, reply) => {
    const t = tenantOf(request);
    const b = z.object({ songId: z.string().uuid(), voter: z.string().min(8).max(64) }).parse(request.body);
    const out = await withTenant(t.id, async (sql) => {
      const cfg = await tenantConfig(sql);
      if (!cfg.features.music || !cfg.music.allowVotes) return { error: 'funcion_desactivada' };
      const ins = await sql(`INSERT INTO song_votes (song_id, tenant_id, voter) VALUES ($1, current_setting('app.tenant_id')::uuid, $2) ON CONFLICT DO NOTHING RETURNING 1`, [b.songId, b.voter]);
      if (!ins.rows.length) return { error: 'ya_votaste' };
      await sql("UPDATE song_requests SET votes = votes + 1 WHERE id = $1 AND status = 'queued'", [b.songId]);
      return { ok: true };
    });
    if ('error' in out) return reply.code(409).send(out);
    await emitTenantEvent(t.id, 'music_changed');
    return out;
  });

  // La TV avisa que terminó una canción (o que no se pudo reproducir) y pide la siguiente
  app.post('/public/music/tv/advance', async (request, reply) => {
    const t = tenantOf(request);
    const b = z.object({ key: z.string().min(16), finishedId: z.string().uuid().optional(), failed: z.boolean().optional() }).parse(request.body);
    const out = await withTenant(t.id, async (sql) => {
      const k = await sql<{ tv_key: string }>('SELECT tv_key FROM tenant_settings');
      if (k.rows[0]?.tv_key !== b.key) return { error: 'llave_invalida' };
      if (b.finishedId) {
        await sql(`UPDATE song_requests SET status = $2, played_at = now() WHERE id = $1 AND status IN ('playing','queued')`, [b.finishedId, b.failed ? 'skipped' : 'played']);
      }
      const playing = await sql<{ id: string }>("SELECT id FROM song_requests WHERE status = 'playing' AND created_at > now() - interval '18 hours' LIMIT 1");
      if (playing.rows.length) return { ok: true };
      await sql(
        `UPDATE song_requests SET status = 'playing', started_at = now()
          WHERE id = (SELECT id FROM song_requests WHERE status = 'queued' AND created_at > now() - interval '18 hours' ORDER BY votes DESC, created_at LIMIT 1)`,
      );
      return { ok: true };
    });
    if ('error' in out) return reply.code(403).send(out);
    await emitTenantEvent(t.id, 'music_changed');
    return out;
  });

  // ============================ Panel: fila y música ============================
  app.register(async (panel) => {
    panel.addHook('preHandler', app.requireTenant);

    panel.get('/admin/queue', async (request) => {
      const t = tenantOf(request);
      return withTenant(t.id, async (sql) => {
        const cfg = await tenantConfig(sql);
        const { rows } = await sql(
          `SELECT q.id, q.number, q.name, q.phone, q.email, q.status, q.staff_id, q.served_by, q.service_id, q.source, q.delays,
                  q.created_at, q.called_at, q.started_at, q.finished_at, q.client_id, q.sale_id,
                  sv.name AS service_name, sv.price_cents, s.name AS staff_name, sb.name AS served_by_name
             FROM queue_tickets q LEFT JOIN services sv ON sv.id = q.service_id LEFT JOIN staff s ON s.id = q.staff_id LEFT JOIN staff sb ON sb.id = q.served_by
            WHERE q.day = ${TODAY} ORDER BY (q.status IN ('done','cancelled','no_show')), q.sort_at`,
        );
        const key = await sql<{ tv_key: string }>('SELECT tv_key FROM tenant_settings');
        const stats = await sql(
          `SELECT count(*) FILTER (WHERE status = 'done')::int AS atendidos,
                  count(*) FILTER (WHERE status = 'no_show')::int AS no_vinieron,
                  COALESCE(round(avg(EXTRACT(EPOCH FROM started_at - created_at) / 60) FILTER (WHERE started_at IS NOT NULL)), 0)::int AS espera_promedio_min
             FROM queue_tickets WHERE day = ${TODAY}`,
        );
        return { tickets: rows, tvKey: key.rows[0]?.tv_key, features: cfg.features, stats: stats.rows[0], estimatedWaitMin: (await publicState(sql, cfg)).estimatedWaitMin };
      });
    });

    // Recepción agrega a alguien que llegó sin celular
    panel.post('/admin/queue', async (request, reply) => {
      const t = tenantOf(request);
      const b = joinBody.parse(request.body);
      const out = await withTenant(t.id, async (sql) => {
        await sql("SELECT pg_advisory_xact_lock(hashtext(current_setting('app.tenant_id') || 'queue'))");
        const n = await sql<{ n: number }>(`SELECT COALESCE(max(number), 0) + 1 AS n FROM queue_tickets WHERE day = ${TODAY}`);
        const { rows } = await sql<{ id: string; number: number; token: string }>(
          `INSERT INTO queue_tickets (tenant_id, day, number, name, phone, service_id, staff_id, source)
           VALUES (current_setting('app.tenant_id')::uuid, ${TODAY}, $1, $2, $3, $4, $5, 'front') RETURNING id, number, token`,
          [n.rows[0].n, b.name, b.phone ?? null, b.serviceId ?? null, b.staffId ?? null],
        );
        return rows[0];
      });
      await emitTenantEvent(t.id, 'queue_changed');
      return reply.code(201).send(out);
    });

    // Llamar al siguiente: el primero que espera a este barbero o a cualquiera
    panel.post('/admin/queue/next', async (request, reply) => {
      const t = tenantOf(request);
      const b = z.object({ staffId: z.string().uuid().optional() }).parse(request.body ?? {});
      const staffId = b.staffId ?? request.user.staffId ?? null;
      if (!staffId) return reply.code(400).send({ error: 'elige_el_barbero' });
      const out = await withTenant(t.id, async (sql) => {
        const next = await sql<{ id: string; number: number; name: string }>(
          `UPDATE queue_tickets SET status = 'called', served_by = $1, called_at = now()
            WHERE id = (SELECT id FROM queue_tickets WHERE day = ${TODAY} AND status = 'waiting' AND (staff_id IS NULL OR staff_id = $1)
                        ORDER BY sort_at LIMIT 1 FOR UPDATE SKIP LOCKED)
            RETURNING id, number, name`,
          [staffId],
        );
        const staff = await sql<{ name: string }>('SELECT name FROM staff WHERE id = $1', [staffId]);
        return next.rows[0] ? { ...next.rows[0], staffName: staff.rows[0]?.name ?? '' } : null;
      });
      if (!out) return reply.code(404).send({ error: 'nadie_esperando' });
      // La TV anuncia con voz y el celular del cliente vibra
      await emitTenantEvent(t.id, 'queue_changed', { announce: { number: out.number, name: firstName(out.name), staff: out.staffName } });
      void pushToTicket(out.id, { title: `Te toca, ${firstName(out.name)}`, body: `${out.staffName} te espera. Turno ${out.number}.`, urgent: true, tag: 'turno', url: '/turno' });
      void notifyNearTickets(t.id);
      return out;
    });

    panel.post('/admin/queue/:id/recall', async (request, reply) => {
      const t = tenantOf(request);
      const id = (request.params as { id: string }).id;
      const r = await withTenant(t.id, (sql) =>
        sql<{ number: number; name: string; staff: string | null }>(
          `SELECT q.number, q.name, s.name AS staff FROM queue_tickets q LEFT JOIN staff s ON s.id = q.served_by WHERE q.id = $1 AND q.status = 'called'`,
          [id],
        ),
      );
      const row = r.rows[0];
      if (!row) return reply.code(404).send({ error: 'ticket_no_encontrado' });
      await emitTenantEvent(t.id, 'queue_changed', { announce: { number: row.number, name: firstName(row.name), staff: row.staff ?? '' } });
      void pushToTicket(id, { title: `Te estamos llamando, ${firstName(row.name)}`, body: `Turno ${row.number}. ${row.staff ?? 'Tu barbero'} te espera.`, urgent: true, tag: 'turno', url: '/turno' });
      return { ok: true };
    });

    panel.patch('/admin/queue/:id', async (request) => {
      const t = tenantOf(request);
      const id = (request.params as { id: string }).id;
      const b = z.object({ status: z.enum(['waiting', 'called', 'serving', 'done', 'cancelled', 'no_show']).optional(), staffId: z.string().uuid().nullable().optional(), servedBy: z.string().uuid().optional() }).parse(request.body);
      await withTenant(t.id, (sql) =>
        sql(
          `UPDATE queue_tickets SET
             status = COALESCE($2, status),
             staff_id = CASE WHEN $4 THEN $3::uuid ELSE staff_id END,
             served_by = COALESCE($5, served_by),
             started_at = CASE WHEN $2 = 'serving' THEN now() ELSE started_at END,
             finished_at = CASE WHEN $2 IN ('done','no_show','cancelled') THEN now() ELSE finished_at END,
             called_at = CASE WHEN $2 = 'waiting' THEN NULL WHEN $2 = 'called' THEN now() ELSE called_at END
           WHERE id = $1`,
          [id, b.status ?? null, b.staffId ?? null, b.staffId !== undefined, b.servedBy ?? null],
        ),
      );
      await emitTenantEvent(t.id, 'queue_changed');
      if (b.status === 'done' || b.status === 'no_show' || b.status === 'cancelled') void notifyNearTickets(t.id);
      return { ok: true };
    });

    panel.get('/admin/music', async (request) => {
      const t = tenantOf(request);
      return withTenant(t.id, async (sql) => {
        const state = await musicState(sql);
        const played = await sql(`SELECT id, title, requested_by, status, played_at FROM song_requests WHERE status IN ('played','skipped','rejected') AND created_at > now() - interval '18 hours' ORDER BY played_at DESC NULLS LAST LIMIT 20`);
        return { ...state, history: played.rows };
      });
    });
    panel.post('/admin/music/:id/skip', async (request) => {
      const t = tenantOf(request);
      const id = (request.params as { id: string }).id;
      await withTenant(t.id, (sql) => sql("UPDATE song_requests SET status = CASE WHEN status = 'playing' THEN 'skipped' ELSE 'rejected' END, played_at = now() WHERE id = $1", [id]));
      await emitTenantEvent(t.id, 'music_changed', { skipped: id });
      return { ok: true };
    });
    panel.post('/admin/music/clear', async (request) => {
      const t = tenantOf(request);
      await withTenant(t.id, (sql) => sql("UPDATE song_requests SET status = 'rejected', played_at = now() WHERE status = 'queued'"));
      await emitTenantEvent(t.id, 'music_changed');
      return { ok: true };
    });
    // El dueño también puede poner una canción (sin turno)
    panel.post('/admin/music', async (request, reply) => {
      const t = tenantOf(request);
      const b = z.object({ query: z.string().min(2).max(200) }).parse(request.body);
      const track = await resolveTrack(b.query);
      if (!track) return reply.code(404).send({ error: 'cancion_no_encontrada' });
      await withTenant(t.id, (sql) =>
        sql(
          `INSERT INTO song_requests (tenant_id, requested_by, video_id, title, channel, thumbnail, duration_s, votes)
           VALUES (current_setting('app.tenant_id')::uuid, 'La barbería', $1, $2, $3, $4, $5, 1000)`,
          [track.videoId, track.title.slice(0, 200), track.channel, track.thumbnail, track.durationS],
        ),
      );
      await emitTenantEvent(t.id, 'music_changed');
      return reply.code(201).send({ ok: true });
    });

    panel.post('/admin/tv/rotate-key', async (request) => {
      const t = tenantOf(request);
      const r = await withTenant(t.id, (sql) => sql<{ tv_key: string }>("UPDATE tenant_settings SET tv_key = replace(gen_random_uuid()::text, '-', '') RETURNING tv_key"));
      return { tvKey: r.rows[0].tv_key };
    });
  });
};

/** Avisa "te toca pronto" a quienes quedaron en los dos primeros lugares. */
export async function notifyNearTickets(tenantId: string) {
  const { rows } = await admin<{ id: string; name: string; number: number }>(
    `UPDATE queue_tickets SET near_notified_at = now()
      WHERE id IN (SELECT id FROM queue_tickets WHERE tenant_id = $1 AND day = ${TODAY} AND status = 'waiting' ORDER BY sort_at LIMIT 2)
        AND near_notified_at IS NULL
      RETURNING id, name, number`,
    [tenantId],
  );
  for (const r of rows) void pushToTicket(r.id, { title: `Ya casi te toca, ${firstName(r.name)}`, body: `Turno ${r.number}: acércate al local.`, tag: 'turno', url: '/turno' });
}
