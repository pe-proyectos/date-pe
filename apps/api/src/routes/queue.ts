import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { withTenant, admin, type Sql } from '../db.js';
import { tenantConfig, FeatureOff, type TenantConfig } from '../lib/features.js';
import { emitTenantEvent, emitAvailabilityChange } from '../lib/realtime.js';
import { pushToTicket, pushToUsers, saveSubscription, pushEnabled } from '../lib/push.js';
import { env } from '../env.js';

// Fila virtual (QR en la puerta) y pantalla de TV.
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
/** Citas con reserva que se están atendiendo ahora: ese barbero no está libre para la fila. */
async function appointmentsNow(sql: Sql) {
  const { rows } = await sql<{ staff_id: string; ends_at: Date; client_name: string | null }>(
    `SELECT a.staff_id, a.ends_at, c.name AS client_name FROM appointments a LEFT JOIN clients c ON c.id = a.client_id
      WHERE a.status IN ('confirmed','completed') AND a.staff_id IS NOT NULL AND now() BETWEEN a.starts_at AND a.ends_at`,
  );
  return rows;
}

/** Barberos de turno ahora (fuera de bloqueos): los que pueden atender a la fila. */
async function staffOnShift(sql: Sql): Promise<string[]> {
  const { rows } = await sql<{ staff_id: string }>(
    `SELECT DISTINCT ss.staff_id FROM staff_schedules ss JOIN staff s ON s.id = ss.staff_id
      WHERE s.is_bookable AND ss.day_of_week = EXTRACT(DOW FROM now() AT TIME ZONE 'America/Lima')
        AND (now() AT TIME ZONE 'America/Lima')::time BETWEEN ss.start_time AND ss.end_time
        AND NOT EXISTS (SELECT 1 FROM schedule_exceptions e WHERE e.staff_id = ss.staff_id AND now() BETWEEN e.starts_at AND e.ends_at)`,
  );
  return rows.map((r) => r.staff_id);
}

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
 * Espera estimada simulando la atención: cada barbero de turno queda libre cuando
 * termina su cliente actual; cada persona en la fila pasa con el primero que se
 * desocupa (o con el que pidió). Devuelve la espera de cada ticket y la de alguien
 * que se anote ahora.
 */
function estimate(tickets: TicketRow[], staffOnShift: string[], fallback: number, apptsNow: Array<{ staff_id: string; ends_at: Date }> = []) {
  const waiting = tickets.filter((t) => t.status === 'waiting');
  const busy = tickets.filter((t) => t.status === 'serving' || t.status === 'called');
  // Minutos que le faltan a cada barbero; los libres están en 0
  const lanes = new Map<string, number>();
  for (const id of staffOnShift) lanes.set(id, 0);
  for (const a of apptsNow) if (lanes.has(a.staff_id)) lanes.set(a.staff_id, Math.max(0, (new Date(a.ends_at).getTime() - Date.now()) / 60000));
  for (const t of busy) {
    const dur = t.duration_min ?? fallback;
    const started = t.started_at ?? t.called_at;
    const elapsed = started ? (Date.now() - new Date(started).getTime()) / 60000 : 0;
    const lane = t.served_by ?? `busy-${t.id}`;
    lanes.set(lane, Math.max(lanes.get(lane) ?? 0, Math.max(3, dur - elapsed)));
  }
  if (lanes.size === 0) lanes.set('any', 0);
  const out = new Map<string, { position: number; ahead: number; etaMin: number }>();
  waiting.forEach((t, i) => {
    // Con barbero pedido espera a ese; si no, al primero que se libere
    let laneId = t.staff_id && lanes.has(t.staff_id) ? t.staff_id : '';
    if (!laneId) laneId = [...lanes.entries()].sort((a, b) => a[1] - b[1])[0][0];
    const eta = lanes.get(laneId) ?? 0;
    const ahead = waiting.slice(0, i).filter((o) => !t.staff_id || !o.staff_id || o.staff_id === t.staff_id).length;
    out.set(t.id, { position: i + 1, ahead, etaMin: Math.round(eta) });
    lanes.set(laneId, eta + (t.duration_min ?? fallback));
  });
  const nextEta = Math.round(Math.min(...lanes.values()));
  return { perTicket: out, nextEta };
}

async function publicState(sql: Sql, cfg: TenantConfig) {
  const [tickets, barbers, open, appts, branding, staff, services] = await Promise.all([
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
    sql('SELECT logo_url, cover_url, color_primary, tagline, instagram FROM tenant_branding'),
    sql('SELECT id, name, photo_url FROM staff WHERE is_bookable ORDER BY sort_order, name'),
    sql('SELECT id, name, duration_min, price_cents FROM services WHERE is_active AND NOT is_addon ORDER BY sort_order, name'),
  ]);
  const onShift = await staffOnShift(sql);
  const apptsNowRows = await appointmentsNow(sql);
  const opens = await sql<{ opens: string | null }>(
    `SELECT to_char(min(ss.start_time), 'HH24:MI') AS opens FROM staff_schedules ss JOIN staff s ON s.id = ss.staff_id
      WHERE s.is_bookable AND ss.day_of_week = EXTRACT(DOW FROM now() AT TIME ZONE 'America/Lima') AND ss.start_time > (now() AT TIME ZONE 'America/Lima')::time`,
  );
  const sim = estimate(tickets, onShift, cfg.queue.fallbackMinutes, apptsNowRows);
  const est = sim.perTicket;
  const waiting = tickets.filter((t) => t.status === 'waiting');
  const nextEta = sim.nextEta;
  return {
    open,
    pushPublicKey: pushEnabled() ? env.vapidPublicKey : null,
    opensAt: opens.rows[0]?.opens ?? null,
    features: { queue: cfg.features.queue, booking: cfg.features.booking },
    tv: cfg.tv,
    queueConfig: { allowStaffChoice: cfg.queue.allowStaffChoice, askPhone: cfg.queue.askPhone, welcome: cfg.queue.welcome, closedMessage: cfg.queue.closedMessage, maxWaiting: cfg.queue.maxWaiting },
    branding: branding.rows[0] ?? null,
    staff: staff.rows,
    staffOnShift: onShift,
    // Barberos atendiendo una cita con reserva en este momento
    withAppointment: apptsNowRows.map((a) => ({ staffId: a.staff_id, until: a.ends_at, name: firstName(a.client_name) })),
    services: services.rows,
    barbersNow: barbers,
    waitingCount: waiting.length,
    estimatedWaitMin: nextEta,
    serving: tickets
      .filter((t) => t.status !== 'waiting')
      .map((t) => ({ id: t.id, number: t.number, name: firstName(t.name), status: t.status, staff: t.served_by_name ?? t.staff_name, calledAt: t.called_at })),
    waiting: waiting.map((t) => ({ id: t.id, number: t.number, name: firstName(t.name), service: t.service_name, staff: t.staff_name, etaMin: est.get(t.id)?.etaMin ?? null })),
    appointments: (appts.rows as Array<{ starts_at: Date; client_name: string | null; staff_name: string | null }>).map((a) => ({ at: a.starts_at, name: firstName(a.client_name), staff: a.staff_name })),
  };
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
      const est = estimate(tickets, await staffOnShift(sql), cfg.queue.fallbackMinutes, await appointmentsNow(sql)).perTicket;
      const me = tickets.find((x) => x.id === ticket.id);
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

  // ============================ Panel: fila ============================
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
      const out = await callNext(t.id, staffId);
      if (!out) return reply.code(404).send({ error: 'nadie_esperando' });
      return out;
    });

    // "Terminé": cierra lo que el barbero está atendiendo (turno o cita), lo deja listo
    // para cobrar y, si se pide, llama al siguiente de la fila. Todo en un toque.
    panel.post('/admin/queue/finish', async (request, reply) => {
      const t = tenantOf(request);
      const b = z.object({ staffId: z.string().uuid().optional(), callNext: z.boolean().default(true) }).parse(request.body ?? {});
      const staffId = b.staffId ?? request.user.staffId ?? null;
      if (!staffId) return reply.code(400).send({ error: 'elige_el_barbero' });
      if (request.user.role === 'staff' && request.user.staffId && staffId !== request.user.staffId) return reply.code(403).send({ error: 'sin_permiso' });
      const finished = await withTenant(t.id, async (sql) => {
        const tk = await sql<{ id: string; name: string; number: number; client_id: string | null }>(
          `UPDATE queue_tickets SET status = 'done', finished_at = now(), started_at = COALESCE(started_at, called_at)
            WHERE id = (SELECT id FROM queue_tickets WHERE day = ${TODAY} AND served_by = $1 AND status IN ('called','serving') ORDER BY called_at DESC LIMIT 1)
            RETURNING id, name, number, client_id`,
          [staffId],
        );
        if (tk.rows[0]) return { kind: 'ticket' as const, id: tk.rows[0].id, name: firstName(tk.rows[0].name), number: tk.rows[0].number };
        // Cita en curso (o que empezó hace poco) de este barbero
        const ap = await sql<{ id: string; client_name: string | null }>(
          `UPDATE appointments a SET status = 'completed'
             FROM (SELECT a2.id FROM appointments a2 WHERE a2.staff_id = $1 AND a2.status = 'confirmed'
                     AND a2.starts_at <= now() + interval '10 minutes' AND a2.ends_at >= now() - interval '90 minutes'
                   ORDER BY a2.starts_at LIMIT 1) x
            WHERE a.id = x.id
           RETURNING a.id, (SELECT name FROM clients c WHERE c.id = a.client_id) AS client_name`,
          [staffId],
        );
        if (!ap.rows[0]) return null;
        // Puntos de la visita (una sola vez)
        await sql(
          `UPDATE clients c SET loyalty_points = c.loyalty_points + COALESCE((SELECT loyalty_points_per_visit FROM tenant_settings LIMIT 1), 10)
             FROM appointments a WHERE a.id = $1 AND a.client_id = c.id AND a.points_awarded = false`,
          [ap.rows[0].id],
        );
        await sql('UPDATE appointments SET points_awarded = true WHERE id = $1', [ap.rows[0].id]);
        return { kind: 'appointment' as const, id: ap.rows[0].id, name: firstName(ap.rows[0].client_name), number: null };
      });
      const charge = finished ? await withTenant(t.id, (sql) => expressCharge(sql, finished.kind === 'ticket' ? { ticketId: finished.id } : { appointmentId: finished.id })) : null;
      const next = b.callNext ? await callNext(t.id, staffId) : null;
      if (finished && !next) await emitTenantEvent(t.id, 'queue_changed');
      if (finished?.kind === 'appointment') await emitAvailabilityChange(t.id);
      if (!finished && !next) return reply.code(404).send({ error: 'nada_que_cerrar' });
      return { finished, charge, next };
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

/** Llama al siguiente para un barbero: el primero que lo espera a él o a cualquiera. */
export async function callNext(tenantId: string, staffId: string) {
  const out = await withTenant(tenantId, async (sql) => {
    const next = await sql<{ id: string; number: number; name: string }>(
      `UPDATE queue_tickets SET status = 'called', served_by = $1, called_at = now(), recalled_at = NULL
        WHERE id = (SELECT id FROM queue_tickets WHERE day = ${TODAY} AND status = 'waiting' AND (staff_id IS NULL OR staff_id = $1)
                    ORDER BY sort_at LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING id, number, name`,
      [staffId],
    );
    const staff = await sql<{ name: string }>('SELECT name FROM staff WHERE id = $1', [staffId]);
    return next.rows[0] ? { ...next.rows[0], name: firstName(next.rows[0].name), staffName: staff.rows[0]?.name ?? '' } : null;
  });
  if (!out) return null;
  // La TV anuncia con voz y el celular del cliente vibra
  await emitTenantEvent(tenantId, 'queue_changed', { announce: { number: out.number, name: out.name, staff: out.staffName } });
  void pushToTicket(out.id, { title: `Te toca, ${out.name}`, body: `${out.staffName} te espera. Turno ${out.number}.`, urgent: true, tag: 'turno', url: '/turno' });
  void notifyNearTickets(tenantId);
  return out;
}

/**
 * Lo que hay que cobrar por un turno o una cita, calculado igual que la caja:
 * servicios con su precio (y el del barbero), descuento de la reserva y adelanto ya pagado.
 */
export async function expressCharge(sql: Sql, ref: { ticketId?: string; appointmentId?: string }) {
  if (ref.appointmentId) {
    const a = await sql<{ id: string; staff_id: string | null; client_id: string | null; discount_cents: number; client_name: string | null; paid: boolean }>(
      `SELECT a.id, a.staff_id, a.client_id, a.discount_cents, c.name AS client_name,
              EXISTS (SELECT 1 FROM sales s WHERE s.appointment_id = a.id AND s.status = 'paid') AS paid
         FROM appointments a LEFT JOIN clients c ON c.id = a.client_id WHERE a.id = $1`,
      [ref.appointmentId],
    );
    const row = a.rows[0];
    if (!row || row.paid) return null;
    const lines = (
      await sql<{ service_id: string; name: string; price_cents: number }>(
        `SELECT aps.service_id, sv.name, aps.price_cents FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id WHERE aps.appointment_id = $1 ORDER BY sv.is_addon`,
        [row.id],
      )
    ).rows;
    const deposit = (await sql<{ d: number }>(`SELECT COALESCE(sum(amount_cents), 0)::int AS d FROM payments WHERE appointment_id = $1 AND status = 'captured'`, [row.id])).rows[0].d;
    const subtotal = lines.reduce((s2, l) => s2 + l.price_cents, 0);
    const total = Math.max(0, subtotal - (row.discount_cents ?? 0));
    return { appointmentId: row.id, ticketId: null, staffId: row.staff_id, clientId: row.client_id, clientName: firstName(row.client_name), items: lines.map((l) => ({ serviceId: l.service_id, name: l.name, priceCents: l.price_cents })), discountCents: row.discount_cents ?? 0, totalCents: total, depositCents: Math.min(deposit, total), dueCents: Math.max(0, total - deposit) };
  }
  if (ref.ticketId) {
    const tk = await sql<{ id: string; name: string; served_by: string | null; service_id: string | null; client_id: string | null; sale_id: string | null }>(
      'SELECT id, name, served_by, service_id, client_id, sale_id FROM queue_tickets WHERE id = $1',
      [ref.ticketId],
    );
    const row = tk.rows[0];
    if (!row || row.sale_id) return null;
    if (!row.service_id) return { appointmentId: null, ticketId: row.id, staffId: row.served_by, clientId: row.client_id, clientName: firstName(row.name), items: [], discountCents: 0, totalCents: 0, depositCents: 0, dueCents: 0, needsService: true };
    const sv = await sql<{ name: string; price_cents: number }>('SELECT name, price_cents FROM services WHERE id = $1', [row.service_id]);
    const ov = row.served_by ? await sql<{ price_cents: number | null }>('SELECT price_cents FROM service_staff WHERE service_id = $1 AND staff_id = $2', [row.service_id, row.served_by]) : { rows: [] as Array<{ price_cents: number | null }> };
    const price = ov.rows[0]?.price_cents ?? sv.rows[0]?.price_cents ?? 0;
    return { appointmentId: null, ticketId: row.id, staffId: row.served_by, clientId: row.client_id, clientName: firstName(row.name), items: [{ serviceId: row.service_id, name: sv.rows[0]?.name ?? 'Servicio', priceCents: price }], discountCents: 0, totalCents: price, depositCents: 0, dueCents: price };
  }
  return null;
}
