import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { withTenant } from '../db.js';
import { emitAvailabilityChange } from '../lib/realtime.js';
import { sendBookingConfirmation, notifyOwnerNewBooking, notifyOwnerChange, processWaitlist } from '../lib/notify.js';
import { isVerified } from '../lib/verify.js';
import { quote } from '../lib/pricing.js';

const createSchema = z.object({
  serviceId: z.string().uuid(),
  addonIds: z.array(z.string().uuid()).max(6).optional(),
  staffId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  startsAt: z.string(),
  promoCode: z.string().max(40).optional(),
  giftCardCode: z.string().max(40).optional(),
  client: z.object({
    phone: z.string().min(6),
    name: z.string().min(1),
    email: z.string().email().optional(),
  }),
  note: z.string().max(500).optional(),
});

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const bookingRoutes: FastifyPluginAsync = async (app) => {
  app.post('/bookings', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos', detail: parsed.error.flatten() });
    const b = parsed.data;
    const tenantId = request.tenant.id;
    if (request.tenant.status === 'suspended' || request.tenant.status === 'cancelled') {
      return reply.code(403).send({ error: 'barberia_no_disponible' });
    }

    try {
      const result = await withTenant(tenantId, async (sql) => {
        const settings = (
          await sql<{ require_verification: boolean }>('SELECT require_verification FROM tenant_settings')
        ).rows[0];
        if (settings?.require_verification) {
          if (!b.client.email || !(await isVerified(tenantId, b.client.email))) throw new HttpError(403, 'verificacion_requerida');
        }

        const svc = await sql<{ name: string; duration_min: number; buffer_min: number }>(
          'SELECT name, duration_min, buffer_min FROM services WHERE id = $1 AND is_active AND NOT is_addon',
          [b.serviceId],
        );
        if (svc.rows.length === 0) throw new HttpError(404, 'servicio_no_encontrado');
        const service = svc.rows[0];

        const staff = await sql<{ name: string }>('SELECT name FROM staff WHERE id = $1 AND is_bookable', [b.staffId]);
        if (staff.rows.length === 0) throw new HttpError(404, 'barbero_no_disponible');

        // Con una sola sede activa, la cita queda asignada a ella
        if (!b.locationId) {
          const locs = await sql<{ id: string }>('SELECT id FROM locations WHERE is_active LIMIT 2');
          if (locs.rows.length === 1) b.locationId = locs.rows[0].id;
        }

        const q = await quote(sql, {
          serviceId: b.serviceId,
          addonIds: b.addonIds,
          staffId: b.staffId,
          promoCode: b.promoCode || null,
          giftCardCode: b.giftCardCode || null,
          phone: b.client.phone,
        });
        if (!q) throw new HttpError(404, 'servicio_no_encontrado');

        const start = DateTime.fromISO(b.startsAt);
        if (!start.isValid) throw new HttpError(400, 'fecha_invalida');
        if (start < DateTime.now()) throw new HttpError(400, 'fecha_pasada');
        const end = start.plus({ minutes: q.durationMin + (service.buffer_min ?? 0) });

        const clash = await sql(
          `SELECT 1 FROM appointments
            WHERE staff_id = $1 AND status <> 'cancelled'
              AND starts_at < $3 AND ends_at > $2
           UNION ALL
           SELECT 1 FROM schedule_exceptions
            WHERE staff_id = $1 AND starts_at < $3 AND ends_at > $2
           LIMIT 1`,
          [b.staffId, start.toUTC().toISO(), end.toUTC().toISO()],
        );
        if (clash.rows.length > 0) throw new HttpError(409, 'slot_ocupado');
        if (q.promo && !q.promo.valid) throw new HttpError(400, 'promo_invalida');
        if (q.giftCard && !q.giftCard.valid) throw new HttpError(400, 'gift_card_invalida');

        const client = await sql<{ id: string; referral_code: string | null }>(
          `INSERT INTO clients (tenant_id, phone, name, email)
             VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3)
           ON CONFLICT (tenant_id, phone)
             DO UPDATE SET name = COALESCE(EXCLUDED.name, clients.name),
                           email = COALESCE(EXCLUDED.email, clients.email)
           RETURNING id, referral_code`,
          [b.client.phone, b.client.name, b.client.email ?? null],
        );
        // Código para invitar amigos: nombre + 4 dígitos (LUIS4821)
        if (!client.rows[0].referral_code) {
          const base = b.client.name.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6) || 'AMIGO';
          for (let i = 0; i < 5; i++) {
            const candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
            const r = await sql('UPDATE clients SET referral_code = $2 WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM clients WHERE referral_code = $2) RETURNING id', [
              client.rows[0].id,
              candidate,
            ]);
            if (r.rows.length) break;
          }
        }

        const status = q.depositCents > 0 ? 'pending' : 'confirmed';
        const appt = await sql<{ id: string }>(
          `INSERT INTO appointments
             (tenant_id, location_id, staff_id, client_id, starts_at, ends_at, status, price_cents,
              list_price_cents, discount_cents, promo_code, gift_card_code, note, referral_code, referred_by_client_id)
           VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING id`,
          [
            b.locationId ?? null,
            b.staffId,
            client.rows[0].id,
            start.toUTC().toISO(),
            end.toUTC().toISO(),
            status,
            q.finalCents,
            q.listPriceCents,
            q.discountCents,
            q.promo?.valid && !q.promo.referrerClientId ? q.promo.code : null,
            q.giftCard?.valid ? q.giftCard.code : null,
            b.note ?? null,
            q.promo?.valid && q.promo.referrerClientId ? q.promo.code : null,
            q.promo?.valid ? (q.promo.referrerClientId ?? null) : null,
          ],
        );
        const appointmentId = appt.rows[0].id;

        // Una línea por servicio (principal + extras) con su precio de lista
        const mainPrice = q.listPriceCents - q.addons.reduce((s, a) => s + a.priceCents, 0);
        await sql(
          `INSERT INTO appointment_services (appointment_id, tenant_id, service_id, price_cents, duration_min)
           VALUES ($1, current_setting('app.tenant_id')::uuid, $2, $3, $4)`,
          [appointmentId, b.serviceId, mainPrice, service.duration_min],
        );
        for (const a of q.addons) {
          await sql(
            `INSERT INTO appointment_services (appointment_id, tenant_id, service_id, price_cents, duration_min)
             VALUES ($1, current_setting('app.tenant_id')::uuid, $2, $3, $4)`,
            [appointmentId, a.id, a.priceCents, a.durationMin],
          );
        }
        // Si estaba en la lista de espera de ese día, ya consiguió su cita
        await sql(
          `UPDATE waitlist SET booked = true
            WHERE day = ($1::timestamptz AT TIME ZONE 'America/Lima')::date
              AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || right(regexp_replace($2, '[^0-9]', '', 'g'), 9)`,
          [start.toUTC().toISO(), b.client.phone],
        );

        if (q.promo?.valid && !q.promo.referrerClientId) {
          await sql('UPDATE promotions SET used_count = used_count + 1 WHERE upper(code) = $1', [q.promo.code]);
        }
        if (q.giftCard?.valid && q.giftCard.appliedCents > 0) {
          await sql('UPDATE gift_cards SET balance_cents = balance_cents - $2 WHERE upper(code) = $1', [
            q.giftCard.code,
            q.giftCard.appliedCents,
          ]);
        }

        const extra = await sql<{ manage_token: string; referral_code: string | null }>(
          'SELECT a.manage_token, c.referral_code FROM appointments a JOIN clients c ON c.id = a.client_id WHERE a.id = $1',
          [appointmentId],
        );
        return {
          appointmentId,
          status,
          locationId: b.locationId ?? null,
          quote: q,
          manageToken: extra.rows[0]?.manage_token ?? null,
          referralCode: extra.rows[0]?.referral_code ?? null,
        };
      });

      await emitAvailabilityChange(tenantId, result.locationId);
      // Con adelanto, los avisos salen cuando se confirma el pago
      if (result.status === 'confirmed') {
        void sendBookingConfirmation(result.appointmentId);
        void notifyOwnerNewBooking(result.appointmentId);
      }

      return reply.code(201).send({
        ok: true,
        appointmentId: result.appointmentId,
        status: result.status,
        finalCents: result.quote.finalCents,
        depositCents: result.quote.depositCents,
        discountCents: result.quote.discountCents,
        manageToken: result.manageToken,
        referralCode: result.referralCode,
      });
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
      request.log.error(err);
      return reply.code(500).send({ error: 'error_interno' });
    }
  });

  // Cancelar (cliente): por id + teléfono
  app.post('/bookings/:id/cancel', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const id = (request.params as { id: string }).id;
    const phone = (request.body as { phone?: string } | undefined)?.phone;
    if (!phone) return reply.code(400).send({ error: 'falta_telefono' });
    const tenantId = request.tenant.id;
    const out = await withTenant(tenantId, async (sql) => {
      const res = await sql<{ id: string; location_id: string | null; starts_at: Date }>(
        `UPDATE appointments a SET status = 'cancelled'
           FROM clients c
          WHERE a.id = $1 AND a.client_id = c.id
            AND regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE '%' || right(regexp_replace($2, '[^0-9]', '', 'g'), 9)
            AND a.status IN ('pending','confirmed')
        RETURNING a.id, a.location_id, a.starts_at`,
        [id, phone],
      );
      return res.rows[0] ?? null;
    });
    if (!out) return reply.code(404).send({ error: 'reserva_no_encontrada' });
    await emitAvailabilityChange(tenantId, out.location_id);
    void notifyOwnerChange(out.id, 'cancelled');
    void processWaitlist(tenantId, out.starts_at);
    return { ok: true };
  });
};
