import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withTenant, adminPool } from '../db.js';
import { env } from '../env.js';
import { createIntent, culqiCharge, paypalCapture, mercadopagoPayment, type Provider } from '../lib/payments.js';
import { markInvoicePaid } from '../lib/billing.js';
import { sendBookingConfirmation, notifyOwnerNewBooking } from '../lib/notify.js';
import { deliverGiftCard } from '../lib/gifts.js';
import { emitAvailabilityChange } from '../lib/realtime.js';

// Marca un pago como capturado y confirma la cita (contexto de webhook: admin pool).
async function confirmCaptured(paymentId: string, providerRef?: string): Promise<void> {
  const client = await adminPool.connect();
  try {
    await client.query('BEGIN');
    const pay = await client.query<{ tenant_id: string; appointment_id: string | null; purpose: string; purpose_ref: string | null; client_id: string | null }>(
      `UPDATE payments SET status='captured', provider_ref = COALESCE($2, provider_ref)
        WHERE id=$1 AND status <> 'captured' RETURNING tenant_id, appointment_id, purpose, purpose_ref, client_id`,
      [paymentId, providerRef ?? null],
    );
    if (pay.rows.length === 0) {
      await client.query('ROLLBACK');
      return;
    }
    const { tenant_id, appointment_id, purpose, purpose_ref, client_id } = pay.rows[0];
    // Compras en línea: gift card o paquete
    let giftToDeliver: string | null = null;
    if (purpose === 'gift_card' && purpose_ref) {
      await client.query('UPDATE gift_cards SET paid = true, active = true WHERE id = $1', [purpose_ref]);
      giftToDeliver = purpose_ref;
    } else if (purpose === 'package' && purpose_ref && client_id) {
      await client.query(
        `INSERT INTO client_packages (tenant_id, client_id, package_id, name, service_ids, uses_total, uses_left, expires_at)
         SELECT tenant_id, $2, id, name, service_ids, uses, uses, now() + make_interval(days => valid_days) FROM packages WHERE id = $1`,
        [purpose_ref, client_id],
      );
    }
    let locationId: string | null = null;
    let confirmedAppt: string | null = null;
    if (appointment_id) {
      const upd = await client.query<{ location_id: string | null }>(
        "UPDATE appointments SET status='confirmed' WHERE id=$1 AND status='pending' RETURNING location_id",
        [appointment_id],
      );
      locationId = upd.rows[0]?.location_id ?? null;
      if (upd.rows.length > 0) confirmedAppt = appointment_id;
    }
    await client.query('COMMIT');
    await emitAvailabilityChange(tenant_id, locationId);
    if (confirmedAppt) {
      void sendBookingConfirmation(confirmedAppt);
      void notifyOwnerNewBooking(confirmedAppt);
    }
    if (giftToDeliver) void deliverGiftCard(giftToDeliver);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export const paymentRoutes: FastifyPluginAsync = async (app) => {
  // Crear intención de pago (adelanto) para una cita
  const intentBody = z.object({
    appointmentId: z.string().uuid(),
    provider: z.enum(['mercadopago', 'paypal', 'culqi']),
  });

  app.post('/payments/intent', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const b = intentBody.parse(request.body);
    const tenantId = request.tenant.id;

    const prepared = await withTenant(tenantId, async (sql) => {
      const appt = await sql<{ price_cents: number; email: string | null }>(
        `SELECT a.price_cents, c.email
           FROM appointments a LEFT JOIN clients c ON c.id = a.client_id
          WHERE a.id = $1`,
        [b.appointmentId],
      );
      if (appt.rows.length === 0) return null;
      const settings = await sql<{ deposit_percent: number; require_deposit: boolean; mp_access_token: string | null }>(
        'SELECT deposit_percent, require_deposit, mp_access_token FROM tenant_settings',
      );
      const pct = settings.rows[0]?.require_deposit ? settings.rows[0].deposit_percent : 0;
      const amount = Math.max(0, Math.round((appt.rows[0].price_cents * pct) / 100));
      const pay = await sql<{ id: string }>(
        `INSERT INTO payments (tenant_id, appointment_id, kind, method, amount_cents, status, provider)
         VALUES (current_setting('app.tenant_id')::uuid, $1, 'deposit', $2, $3, 'pending', $4)
         RETURNING id`,
        [b.appointmentId, b.provider === 'culqi' ? 'card' : b.provider === 'paypal' ? 'card' : 'yape', amount, b.provider],
      );
      return { paymentId: pay.rows[0].id, amount, email: appt.rows[0].email ?? undefined, mpToken: settings.rows[0]?.mp_access_token ?? null };
    });

    if (!prepared) return reply.code(404).send({ error: 'cita_no_encontrada' });
    if (prepared.amount === 0) {
      // Sin adelanto requerida: confirmamos directo.
      await confirmCaptured(prepared.paymentId);
      return { ok: true, noDeposit: true, paymentId: prepared.paymentId };
    }

    const provider = b.provider as Provider;
    const intent = await createIntent(provider, {
      amountCents: prepared.amount,
      description: `Adelanto reserva ${request.tenant.name}`,
      email: prepared.email,
      externalReference: prepared.paymentId,
      mpAccessToken: provider === 'mercadopago' ? prepared.mpToken : null,
      tenantSlug: request.tenant.slug,
    });

    // Guarda ref de la pasarela
    if (intent.providerRef) {
      await adminPool.query('UPDATE payments SET provider_ref=$2 WHERE id=$1', [prepared.paymentId, intent.providerRef]);
    }

    // Modo dev sin llaves: se puede confirmar simulando
    if (intent.devSimulated) {
      return {
        ok: true,
        paymentId: prepared.paymentId,
        provider,
        amountCents: prepared.amount,
        devSimulated: true,
        devConfirmUrl: `/api/payments/${prepared.paymentId}/dev-confirm`,
      };
    }

    return {
      ok: true,
      paymentId: prepared.paymentId,
      provider,
      amountCents: prepared.amount,
      redirectUrl: intent.redirectUrl,
      clientConfig: intent.clientConfig,
    };
  });

  // Culqi: cobro con el token generado por Culqi.js en el frontend
  const culqiBody = z.object({ paymentId: z.string().uuid().optional(), invoiceId: z.string().uuid().optional(), token: z.string(), email: z.string().email() });
  app.post('/payments/culqi/charge', async (request, reply) => {
    const b = culqiBody.parse(request.body);
    if (b.invoiceId) {
      const inv = await adminPool.query<{ amount_cents: number }>("SELECT amount_cents FROM subscription_invoices WHERE id=$1 AND status='pending'", [b.invoiceId]);
      if (inv.rows.length === 0) return reply.code(404).send({ error: 'cobro_no_encontrado' });
      const r = await culqiCharge({ token: b.token, amountCents: inv.rows[0].amount_cents, email: b.email });
      if (!r.ok) return reply.code(402).send({ error: 'pago_rechazado' });
      await markInvoicePaid(b.invoiceId, r.ref, 'culqi');
      return { ok: true };
    }
    if (!b.paymentId) return reply.code(400).send({ error: 'falta_pago' });
    const pay = await adminPool.query<{ amount_cents: number }>('SELECT amount_cents FROM payments WHERE id=$1', [b.paymentId]);
    if (pay.rows.length === 0) return reply.code(404).send({ error: 'pago_no_encontrado' });
    const result = await culqiCharge({ token: b.token, amountCents: pay.rows[0].amount_cents, email: b.email });
    if (!result.ok) return reply.code(402).send({ error: 'pago_rechazado' });
    await confirmCaptured(b.paymentId, result.ref);
    return { ok: true };
  });

  // PayPal: capturar la orden al volver del checkout (por paymentId u orderId)
  const ppBody = z.object({ paymentId: z.string().uuid().optional(), orderId: z.string().optional() });
  app.post('/payments/paypal/capture', async (request, reply) => {
    const b = ppBody.parse(request.body);
    let paymentId = b.paymentId;
    let orderId = b.orderId;
    if (!orderId && paymentId) {
      const pay = await adminPool.query<{ provider_ref: string | null }>('SELECT provider_ref FROM payments WHERE id=$1', [paymentId]);
      orderId = pay.rows[0]?.provider_ref ?? undefined;
    }
    if (!paymentId && orderId) {
      const pay = await adminPool.query<{ id: string }>('SELECT id FROM payments WHERE provider_ref=$1', [orderId]);
      paymentId = pay.rows[0]?.id;
      if (!paymentId) {
        const inv = await adminPool.query<{ id: string }>('SELECT id FROM subscription_invoices WHERE provider_ref=$1', [orderId]);
        if (inv.rows[0]) {
          const ok = await paypalCapture(orderId);
          if (!ok) return reply.code(402).send({ error: 'captura_fallida' });
          await markInvoicePaid(inv.rows[0].id, orderId, 'paypal');
          return { ok: true, subscription: true };
        }
      }
    }
    if (!orderId || !paymentId) return reply.code(404).send({ error: 'orden_no_encontrada' });
    const ok = await paypalCapture(orderId);
    if (!ok) return reply.code(402).send({ error: 'captura_fallida' });
    await confirmCaptured(paymentId);
    return { ok: true };
  });

  // MercadoPago: webhook de notificación
  app.post('/payments/webhook/mercadopago', async (request, reply) => {
    const q = request.query as { type?: string; topic?: string; 'data.id'?: string; id?: string; tenant?: string };
    const body = (request.body ?? {}) as { type?: string; data?: { id?: string } };
    const type = q.type ?? q.topic ?? body.type;
    const mpId = q['data.id'] ?? body.data?.id ?? q.id;
    if (type !== 'payment' || !mpId) return reply.send({ ok: true });
    try {
      // Si la barbería cobra con su propia cuenta, consultamos con su token
      let token: string | null = null;
      if (q.tenant) {
        const t = await adminPool.query<{ mp_access_token: string | null }>(
          'SELECT ts.mp_access_token FROM tenant_settings ts JOIN tenants t ON t.id = ts.tenant_id WHERE t.slug = $1',
          [q.tenant],
        );
        token = t.rows[0]?.mp_access_token ?? null;
      }
      const data = await mercadopagoPayment(String(mpId), token);
      if (data?.status === 'approved' && data.external_reference) {
        if (data.external_reference.startsWith('sub:')) await markInvoicePaid(data.external_reference.slice(4), String(mpId), 'mercadopago');
        else await confirmCaptured(data.external_reference, String(mpId));
      }
    } catch (err) {
      request.log.error(err);
    }
    return reply.send({ ok: true });
  });

  // Dev: confirmar pago simulado (solo si PAYMENTS_DEV_MODE)
  app.post('/payments/:id/dev-confirm', async (request, reply) => {
    if (!env.paymentsDevMode) return reply.code(403).send({ error: 'dev_mode_off' });
    const id = (request.params as { id: string }).id;
    await confirmCaptured(id, 'dev-simulated');
    return { ok: true, devSimulated: true };
  });

  // Dev: confirmar un cobro de suscripción simulado
  app.post('/billing/:id/dev-confirm', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!env.paymentsDevMode) return reply.code(403).send({ error: 'dev_mode_off' });
    const id = (request.params as { id: string }).id;
    // Solo el dueño de esa barbería (o el superadmin) puede simular su pago
    const inv = await adminPool.query<{ tenant_id: string }>('SELECT tenant_id FROM subscription_invoices WHERE id = $1', [id]);
    if (!inv.rows[0]) return reply.code(404).send({ error: 'cobro_no_encontrado' });
    if (!request.user.isPlatformAdmin && request.user.tenantId !== inv.rows[0].tenant_id) return reply.code(403).send({ error: 'sin_acceso' });
    const ok = await markInvoicePaid(id, 'dev-simulated');
    return ok ? { ok: true, devSimulated: true } : reply.code(404).send({ error: 'cobro_no_encontrado' });
  });

  app.get('/payments/:id/status', async (request) => {
    const id = (request.params as { id: string }).id;
    const { rows } = await adminPool.query('SELECT id, status, amount_cents, provider FROM payments WHERE id=$1', [id]);
    return rows[0] ?? { error: 'no_encontrado' };
  });
};
