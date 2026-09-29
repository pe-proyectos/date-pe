import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withTenant, adminPool } from '../db.js';
import { env } from '../env.js';
import { createIntent, culqiCharge, paypalCapture, type Provider } from '../lib/payments.js';
import { emitAvailabilityChange } from '../lib/realtime.js';
import { sendEmail, bookingConfirmationHtml } from '../lib/email.js';

// Marca un pago como capturado y confirma la cita (contexto de webhook: admin pool).
async function confirmCaptured(paymentId: string, providerRef?: string): Promise<void> {
  const client = await adminPool.connect();
  try {
    await client.query('BEGIN');
    const pay = await client.query<{ tenant_id: string; appointment_id: string | null }>(
      `UPDATE payments SET status='captured', provider_ref = COALESCE($2, provider_ref)
        WHERE id=$1 AND status <> 'captured' RETURNING tenant_id, appointment_id`,
      [paymentId, providerRef ?? null],
    );
    if (pay.rows.length === 0) {
      await client.query('ROLLBACK');
      return;
    }
    const { tenant_id, appointment_id } = pay.rows[0];
    let locationId: string | null = null;
    let emailInfo: { email: string; tenant: string; client: string; service: string; staff: string; when: string } | null = null;
    if (appointment_id) {
      const upd = await client.query<{ location_id: string | null }>(
        "UPDATE appointments SET status='confirmed' WHERE id=$1 AND status='pending' RETURNING location_id",
        [appointment_id],
      );
      locationId = upd.rows[0]?.location_id ?? null;
      const det = await client.query(
        `SELECT c.email, c.name AS client_name, t.name AS tenant_name, s.name AS staff_name,
                a.starts_at, sv.name AS service_name
           FROM appointments a
           JOIN tenants t ON t.id = a.tenant_id
           LEFT JOIN clients c ON c.id = a.client_id
           LEFT JOIN staff s ON s.id = a.staff_id
           LEFT JOIN appointment_services aps ON aps.appointment_id = a.id
           LEFT JOIN services sv ON sv.id = aps.service_id
          WHERE a.id = $1 LIMIT 1`,
        [appointment_id],
      );
      const r = det.rows[0];
      if (r?.email) {
        emailInfo = {
          email: r.email,
          tenant: r.tenant_name,
          client: r.client_name ?? 'Cliente',
          service: r.service_name ?? 'Servicio',
          staff: r.staff_name ?? '',
          when: new Date(r.starts_at).toLocaleString('es-PE', { timeZone: 'America/Lima' }),
        };
      }
    }
    await client.query('COMMIT');
    await emitAvailabilityChange(tenant_id, locationId);
    if (emailInfo) {
      void sendEmail({
        to: emailInfo.email,
        subject: `Reserva confirmada — ${emailInfo.tenant}`,
        html: bookingConfirmationHtml({
          tenantName: emailInfo.tenant,
          clientName: emailInfo.client,
          serviceName: emailInfo.service,
          staffName: emailInfo.staff,
          whenText: emailInfo.when,
        }),
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export const paymentRoutes: FastifyPluginAsync = async (app) => {
  // Crear intención de pago (seña) para una cita
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
      const settings = await sql<{ deposit_percent: number; require_deposit: boolean }>(
        'SELECT deposit_percent, require_deposit FROM tenant_settings',
      );
      const pct = settings.rows[0]?.require_deposit ? settings.rows[0].deposit_percent : 0;
      const amount = Math.max(0, Math.round((appt.rows[0].price_cents * pct) / 100));
      const pay = await sql<{ id: string }>(
        `INSERT INTO payments (tenant_id, appointment_id, kind, method, amount_cents, status, provider)
         VALUES (current_setting('app.tenant_id')::uuid, $1, 'deposit', $2, $3, 'pending', $4)
         RETURNING id`,
        [b.appointmentId, b.provider === 'culqi' ? 'card' : b.provider === 'paypal' ? 'card' : 'yape', amount, b.provider],
      );
      return { paymentId: pay.rows[0].id, amount, email: appt.rows[0].email ?? undefined };
    });

    if (!prepared) return reply.code(404).send({ error: 'cita_no_encontrada' });
    if (prepared.amount === 0) {
      // Sin seña requerida: confirmamos directo.
      await confirmCaptured(prepared.paymentId);
      return { ok: true, noDeposit: true, paymentId: prepared.paymentId };
    }

    const provider = b.provider as Provider;
    const intent = await createIntent(provider, {
      amountCents: prepared.amount,
      description: `Seña reserva ${request.tenant.name}`,
      email: prepared.email,
      externalReference: prepared.paymentId,
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
  const culqiBody = z.object({ paymentId: z.string().uuid(), token: z.string(), email: z.string().email() });
  app.post('/payments/culqi/charge', async (request, reply) => {
    const b = culqiBody.parse(request.body);
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
    }
    if (!orderId || !paymentId) return reply.code(404).send({ error: 'orden_no_encontrada' });
    const ok = await paypalCapture(orderId);
    if (!ok) return reply.code(402).send({ error: 'captura_fallida' });
    await confirmCaptured(paymentId);
    return { ok: true };
  });

  // MercadoPago: webhook de notificación
  app.post('/payments/webhook/mercadopago', async (request, reply) => {
    const q = request.query as { type?: string; 'data.id'?: string };
    const body = (request.body ?? {}) as { type?: string; data?: { id?: string } };
    const type = q.type ?? body.type;
    const paymentId = q['data.id'] ?? body.data?.id;
    if (type !== 'payment' || !paymentId) return reply.send({ ok: true });
    try {
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${env.mercadopagoAccessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { status: string; external_reference: string };
        if (data.status === 'approved' && data.external_reference) {
          await confirmCaptured(data.external_reference, String(paymentId));
        }
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

  app.get('/payments/:id/status', async (request) => {
    const id = (request.params as { id: string }).id;
    const { rows } = await adminPool.query('SELECT id, status, amount_cents, provider FROM payments WHERE id=$1', [id]);
    return rows[0] ?? { error: 'no_encontrado' };
  });
};
