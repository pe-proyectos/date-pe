import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { withTenant } from '../db.js';
import { emitAvailabilityChange } from '../lib/realtime.js';
import { sendEmail, bookingConfirmationHtml } from '../lib/email.js';
import { quote } from '../lib/pricing.js';

const createSchema = z.object({
  serviceId: z.string().uuid(),
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
    const tenantName = request.tenant.name;

    try {
      const result = await withTenant(tenantId, async (sql) => {
        const svc = await sql<{ name: string; duration_min: number; buffer_min: number }>(
          'SELECT name, duration_min, buffer_min FROM services WHERE id = $1 AND is_active',
          [b.serviceId],
        );
        if (svc.rows.length === 0) throw new HttpError(404, 'servicio_no_encontrado');
        const service = svc.rows[0];

        const staff = await sql<{ name: string }>('SELECT name FROM staff WHERE id = $1 AND is_bookable', [b.staffId]);
        if (staff.rows.length === 0) throw new HttpError(404, 'barbero_no_disponible');

        const start = DateTime.fromISO(b.startsAt);
        if (!start.isValid) throw new HttpError(400, 'fecha_invalida');
        if (start < DateTime.now()) throw new HttpError(400, 'fecha_pasada');
        const end = start.plus({ minutes: service.duration_min + (service.buffer_min ?? 0) });

        const clash = await sql(
          `SELECT 1 FROM appointments
            WHERE staff_id = $1 AND status <> 'cancelled'
              AND starts_at < $3 AND ends_at > $2 LIMIT 1`,
          [b.staffId, start.toUTC().toISO(), end.toUTC().toISO()],
        );
        if (clash.rows.length > 0) throw new HttpError(409, 'slot_ocupado');

        const q = await quote(sql, {
          serviceId: b.serviceId,
          staffId: b.staffId,
          promoCode: b.promoCode || null,
          giftCardCode: b.giftCardCode || null,
        });
        if (!q) throw new HttpError(404, 'servicio_no_encontrado');
        if (q.promo && !q.promo.valid) throw new HttpError(400, 'promo_invalida');
        if (q.giftCard && !q.giftCard.valid) throw new HttpError(400, 'gift_card_invalida');

        const client = await sql<{ id: string }>(
          `INSERT INTO clients (tenant_id, phone, name, email)
             VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3)
           ON CONFLICT (tenant_id, phone)
             DO UPDATE SET name = COALESCE(EXCLUDED.name, clients.name),
                           email = COALESCE(EXCLUDED.email, clients.email)
           RETURNING id`,
          [b.client.phone, b.client.name, b.client.email ?? null],
        );

        const status = q.depositCents > 0 ? 'pending' : 'confirmed';
        const appt = await sql<{ id: string }>(
          `INSERT INTO appointments
             (tenant_id, location_id, staff_id, client_id, starts_at, ends_at, status, price_cents,
              list_price_cents, discount_cents, promo_code, gift_card_code, note)
           VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
            q.promo?.valid ? q.promo.code : null,
            q.giftCard?.valid ? q.giftCard.code : null,
            b.note ?? null,
          ],
        );
        const appointmentId = appt.rows[0].id;

        await sql(
          `INSERT INTO appointment_services (appointment_id, tenant_id, service_id, price_cents, duration_min)
           VALUES ($1, current_setting('app.tenant_id')::uuid, $2, $3, $4)`,
          [appointmentId, b.serviceId, q.finalCents, service.duration_min],
        );

        if (q.promo?.valid) {
          await sql('UPDATE promotions SET used_count = used_count + 1 WHERE upper(code) = $1', [q.promo.code]);
        }
        if (q.giftCard?.valid && q.giftCard.appliedCents > 0) {
          await sql('UPDATE gift_cards SET balance_cents = balance_cents - $2 WHERE upper(code) = $1', [
            q.giftCard.code,
            q.giftCard.appliedCents,
          ]);
        }

        return {
          appointmentId,
          status,
          serviceName: service.name,
          staffName: staff.rows[0].name,
          locationId: b.locationId ?? null,
          clientEmail: b.client.email ?? null,
          clientName: b.client.name,
          whenText: start.setZone('America/Lima').setLocale('es').toFormat("cccc d 'de' LLLL, HH:mm"),
          quote: q,
        };
      });

      await emitAvailabilityChange(tenantId, result.locationId);
      if (result.clientEmail && result.status === 'confirmed') {
        void sendEmail({
          to: result.clientEmail,
          subject: `Reserva confirmada en ${tenantName}`,
          html: bookingConfirmationHtml({
            tenantName,
            clientName: result.clientName,
            serviceName: result.serviceName,
            staffName: result.staffName,
            whenText: result.whenText,
          }),
        });
      }

      return reply.code(201).send({
        ok: true,
        appointmentId: result.appointmentId,
        status: result.status,
        finalCents: result.quote.finalCents,
        depositCents: result.quote.depositCents,
        discountCents: result.quote.discountCents,
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
      const res = await sql<{ location_id: string | null }>(
        `UPDATE appointments a SET status = 'cancelled'
           FROM clients c
          WHERE a.id = $1 AND a.client_id = c.id
            AND regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE '%' || right(regexp_replace($2, '[^0-9]', '', 'g'), 9)
            AND a.status IN ('pending','confirmed')
        RETURNING a.location_id`,
        [id, phone],
      );
      return res.rows[0] ?? null;
    });
    if (!out) return reply.code(404).send({ error: 'reserva_no_encontrada' });
    await emitAvailabilityChange(tenantId, out.location_id);
    return { ok: true };
  });
};
