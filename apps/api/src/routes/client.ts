import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { DateTime } from 'luxon';
import { withTenant, admin } from '../db.js';
import { computeSlots } from '../lib/availability.js';
import { emitAvailabilityChange } from '../lib/realtime.js';
import { notifyOwnerChange, processWaitlist, sendBookingConfirmation, tenantUrl } from '../lib/notify.js';
import { requestCode, checkCode } from '../lib/verify.js';
import { sendEmail, layout } from '../lib/email.js';
import { hashPassword } from '../lib/crypto.js';
import { env } from '../env.js';

const digits = (v: string) => v.replace(/\D/g, '').slice(-9);

// Rutas del cliente final (sin cuenta): gestionar su reserva, lista de espera,
// verificación por correo. Y la recuperación de contraseña del panel.
export const clientRoutes: FastifyPluginAsync = async (app) => {
  // Busca la cita por enlace (t) o por id + celular
  async function findAppt(tenantId: string, ref: { t?: string; id?: string; phone?: string }) {
    return withTenant(tenantId, async (sql) => {
      const byToken = !!ref.t;
      if (!byToken && (!ref.id || !ref.phone || digits(ref.phone).length < 6)) return null;
      const { rows } = await sql<Record<string, unknown> & { starts_at: Date; status: string; cancel_window_hours: number; allow_client_reschedule: boolean }>(
        `SELECT a.id, a.status, a.starts_at, a.ends_at, a.price_cents, a.staff_id, a.location_id, a.manage_token,
                c.name AS client_name, c.phone AS client_phone, c.referral_code,
                s.name AS staff_name, l.name AS location_name, l.address,
                (SELECT aps.service_id FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id
                  WHERE aps.appointment_id = a.id AND NOT sv.is_addon LIMIT 1) AS service_id,
                (SELECT array_agg(aps.service_id) FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id
                  WHERE aps.appointment_id = a.id AND sv.is_addon) AS addon_ids,
                (SELECT string_agg(sv.name, ' + ' ORDER BY sv.is_addon, sv.name) FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id
                  WHERE aps.appointment_id = a.id) AS service_name,
                (SELECT COALESCE(sum(amount_cents), 0) FROM payments p WHERE p.appointment_id = a.id AND p.status = 'captured')::int AS paid_cents,
                (SELECT count(*) FROM reviews r WHERE r.appointment_id = a.id)::int AS reviewed,
                ts.cancel_window_hours, ts.allow_client_reschedule, ts.referral_enabled, ts.referral_discount_percent
           FROM appointments a
           JOIN clients c ON c.id = a.client_id
           LEFT JOIN staff s ON s.id = a.staff_id
           LEFT JOIN locations l ON l.id = a.location_id
           CROSS JOIN tenant_settings ts
          WHERE ${byToken ? 'a.manage_token = $1' : "a.id::text LIKE lower($1) || '%' AND regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE '%' || $2"}
          LIMIT 1`,
        byToken ? [ref.t] : [ref.id, digits(ref.phone!)],
      );
      return rows[0] ?? null;
    });
  }

  function rules(a: { status: string; starts_at: Date; cancel_window_hours: unknown; allow_client_reschedule: unknown }) {
    const hoursLeft = (new Date(a.starts_at).getTime() - Date.now()) / 36e5;
    const open = ['pending', 'confirmed'].includes(a.status) && hoursLeft > 0;
    const inWindow = hoursLeft >= Number(a.cancel_window_hours ?? 0);
    return { canCancel: open && inWindow, canReschedule: open && inWindow && !!a.allow_client_reschedule, hoursLeft };
  }

  // id: el UUID completo o su código corto de 8 caracteres (el que va en el correo)
  const refQuery = z.object({ t: z.string().min(16).max(64).optional(), id: z.string().regex(/^[0-9a-fA-F-]{8,36}$/).optional(), phone: z.string().optional() });

  app.get('/public/booking', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const q = refQuery.parse(request.query);
    const a = await findAppt(request.tenant.id, q);
    if (!a) return reply.code(404).send({ error: 'reserva_no_encontrada' });
    const r = rules(a);
    const { client_phone, cancel_window_hours, allow_client_reschedule, ...rest } = a;
    return {
      booking: {
        ...rest,
        phone_hint: typeof client_phone === 'string' ? `*** *** ${client_phone.replace(/\D/g, '').slice(-3)}` : null,
        cancel_window_hours,
        can_cancel: r.canCancel,
        can_reschedule: r.canReschedule,
      },
    };
  });

  const actionBody = refQuery.extend({ reason: z.string().max(200).optional() });
  app.post('/public/booking/cancel', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const b = actionBody.parse(request.body);
    const tenantId = request.tenant.id;
    const a = await findAppt(tenantId, b);
    if (!a) return reply.code(404).send({ error: 'reserva_no_encontrada' });
    if (!rules(a).canCancel) return reply.code(409).send({ error: 'fuera_de_plazo', hours: a.cancel_window_hours });
    await withTenant(tenantId, (sql) =>
      sql("UPDATE appointments SET status = 'cancelled', note = COALESCE(note || ' | ', '') || $2 WHERE id = $1", [a.id, `Cancelada por el cliente${b.reason ? `: ${b.reason}` : ''}`]),
    );
    await emitAvailabilityChange(tenantId, (a.location_id as string) ?? null);
    void notifyOwnerChange(a.id as string, 'cancelled');
    void processWaitlist(tenantId, a.starts_at);
    return { ok: true };
  });

  // Horarios libres para reprogramar (mismo servicio y extras; barbero opcional)
  app.get('/public/booking/slots', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const q = refQuery.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), staffId: z.string().uuid().optional() }).parse(request.query);
    const tenantId = request.tenant.id;
    const a = await findAppt(tenantId, q);
    if (!a) return reply.code(404).send({ error: 'reserva_no_encontrada' });
    const duration = Math.round((new Date(a.ends_at as Date).getTime() - new Date(a.starts_at).getTime()) / 60000);
    return withTenant(tenantId, async (sql) => {
      const st = (await sql<{ timezone: string; slot_interval_min: number }>('SELECT timezone, slot_interval_min FROM tenant_settings')).rows[0];
      const slots = await computeSlots(sql, {
        tenantId,
        locationId: (a.location_id as string) ?? null,
        staffId: q.staffId ?? null,
        date: q.date,
        durationMin: duration,
        timezone: st?.timezone ?? 'America/Lima',
        slotIntervalMin: st?.slot_interval_min ?? 15,
        excludeAppointmentId: a.id as string,
      });
      return { date: q.date, slots };
    });
  });

  const rescheduleBody = refQuery.extend({ startsAt: z.string(), staffId: z.string().uuid().optional() });
  app.post('/public/booking/reschedule', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const b = rescheduleBody.parse(request.body);
    const tenantId = request.tenant.id;
    const a = await findAppt(tenantId, b);
    if (!a) return reply.code(404).send({ error: 'reserva_no_encontrada' });
    if (!rules(a).canReschedule) return reply.code(409).send({ error: 'fuera_de_plazo', hours: a.cancel_window_hours });
    const start = DateTime.fromISO(b.startsAt);
    if (!start.isValid || start < DateTime.now()) return reply.code(400).send({ error: 'fecha_invalida' });
    const duration = Math.round((new Date(a.ends_at as Date).getTime() - new Date(a.starts_at).getTime()) / 60000);
    const staffId = b.staffId ?? (a.staff_id as string);
    const result = await withTenant(tenantId, async (sql) => {
      const st = (await sql<{ timezone: string; slot_interval_min: number }>('SELECT timezone, slot_interval_min FROM tenant_settings')).rows[0];
      const tz = st?.timezone ?? 'America/Lima';
      // Solo se acepta una hora que el cálculo de disponibilidad ofrecería
      const slots = await computeSlots(sql, {
        tenantId,
        locationId: (a.location_id as string) ?? null,
        staffId,
        date: start.setZone(tz).toISODate()!,
        durationMin: duration,
        timezone: tz,
        slotIntervalMin: st?.slot_interval_min ?? 15,
        excludeAppointmentId: a.id as string,
      });
      const ok = slots.some((s) => s.staffId === staffId && DateTime.fromISO(s.start).toMillis() === start.toMillis());
      if (!ok) return { error: 'slot_ocupado' as const };
      await sql(
        `UPDATE appointments SET starts_at = $2, ends_at = $3, staff_id = $4, reminder_24h_at = NULL, reminder_2h_at = NULL,
                note = COALESCE(note || ' | ', '') || 'Reprogramada por el cliente'
          WHERE id = $1`,
        [a.id, start.toUTC().toISO(), start.plus({ minutes: duration }).toUTC().toISO(), staffId],
      );
      return { ok: true as const };
    });
    if ('error' in result) return reply.code(409).send(result);
    await emitAvailabilityChange(tenantId, (a.location_id as string) ?? null);
    void notifyOwnerChange(a.id as string, 'rescheduled');
    void sendBookingConfirmation(a.id as string);
    void processWaitlist(tenantId, a.starts_at);
    return { ok: true };
  });

  // Lista de espera: "avísame si se libera un horario ese día"
  const waitBody = z.object({
    serviceId: z.string().uuid().optional(),
    staffId: z.string().uuid().optional(),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    name: z.string().min(1).max(80),
    phone: z.string().min(6).max(20),
    email: z.string().email(),
  });
  app.post('/public/waitlist', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const b = waitBody.parse(request.body);
    const today = DateTime.now().setZone('America/Lima').toISODate()!;
    if (b.day < today) return reply.code(400).send({ error: 'fecha_pasada' });
    await withTenant(request.tenant.id, async (sql) => {
      const dup = await sql(
        `SELECT 1 FROM waitlist WHERE day = $1 AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || $2 AND NOT booked`,
        [b.day, digits(b.phone)],
      );
      if (dup.rows.length) return;
      await sql(
        `INSERT INTO waitlist (tenant_id, service_id, staff_id, day, name, phone, email)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6)`,
        [b.serviceId ?? null, b.staffId ?? null, b.day, b.name, b.phone, b.email],
      );
    });
    return reply.code(201).send({ ok: true });
  });

  // Verificación del cliente por correo
  app.post('/public/verify/request', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const { email } = z.object({ email: z.string().email() }).parse(request.body);
    const r = await requestCode(request.tenant.id, request.tenant.name, email);
    if (!r.ok) return reply.code(r.error === 'espera_un_minuto' ? 429 : 502).send({ error: r.error });
    return { ok: true };
  });
  app.post('/public/verify/check', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const b = z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/) }).parse(request.body);
    const ok = await checkCode(request.tenant.id, b.email, b.code);
    if (!ok) return reply.code(400).send({ error: 'codigo_incorrecto' });
    return { ok: true };
  });

  // ------------------------ Recuperar contraseña del panel ------------------------
  const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');
  app.post('/auth/password/forgot', async (request) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body);
    const u = await admin<{ id: string; name: string | null; is_platform_admin: boolean }>('SELECT id, name, is_platform_admin FROM users WHERE lower(email) = lower($1)', [email]);
    const user = u.rows[0];
    // Siempre la misma respuesta: no revelamos si el correo existe
    if (user) {
      const recent = await admin("SELECT 1 FROM password_resets WHERE user_id = $1 AND created_at > now() - interval '1 minute'", [user.id]);
      if (recent.rows.length === 0) {
        const token = randomBytes(24).toString('hex');
        const slug = request.tenant?.slug ?? null;
        await admin(`INSERT INTO password_resets (token_hash, user_id, tenant_slug, expires_at) VALUES ($1, $2, $3, now() + interval '1 hour')`, [tokenHash(token), user.id, slug]);
        const url = slug ? tenantUrl(slug, `/admin/restablecer?token=${token}`) : `${env.appPublicUrl}/ingresar/restablecer?token=${token}`;
        void sendEmail({
          to: email,
          subject: 'Crea una nueva contraseña para date.pe',
          html: layout({
            brand: 'date.pe',
            title: 'Crea una nueva contraseña',
            intro: `Hola ${user.name ?? ''}, recibimos un pedido para cambiar la contraseña de tu panel. El enlace vence en 1 hora.`,
            cta: { label: 'Crear nueva contraseña', href: url },
            foot: 'Si no lo pediste, ignora este correo: tu contraseña sigue igual.',
          }),
        });
      }
    }
    return { ok: true };
  });

  app.post('/auth/password/reset', async (request, reply) => {
    const b = z.object({ token: z.string().length(48), password: z.string().min(8).max(200) }).parse(request.body);
    const r = await admin<{ user_id: string }>(
      `UPDATE password_resets SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
      [tokenHash(b.token)],
    );
    if (r.rows.length === 0) return reply.code(400).send({ error: 'enlace_vencido' });
    await admin('UPDATE users SET password_hash = $2 WHERE id = $1', [r.rows[0].user_id, hashPassword(b.password)]);
    await admin('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [r.rows[0].user_id]);
    return { ok: true };
  });
};
