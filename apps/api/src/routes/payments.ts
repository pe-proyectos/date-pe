import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withTenant, adminPool } from '../db.js';
import { env } from '../env.js';
import { culqiCharge, paypalCapture, mercadopagoPayment } from '../lib/payments.js';
import { markInvoicePaid } from '../lib/billing.js';
import { sendBookingConfirmation, notifyOwnerNewBooking, sendDepositRejected } from '../lib/notify.js';
import { presignReceipt, getObject, r2Configured } from '../lib/r2.js';
import { deliverGiftCard } from '../lib/gifts.js';
import { emitAvailabilityChange } from '../lib/realtime.js';

// Marca un pago como recibido y confirma la cita o entrega la compra (admin pool).
async function confirmCaptured(paymentId: string, providerRef?: string, opts: { notifyOwner?: boolean } = {}): Promise<void> {
  const client = await adminPool.connect();
  try {
    await client.query('BEGIN');
    const pay = await client.query<{ tenant_id: string; appointment_id: string | null; purpose: string; purpose_ref: string | null; client_id: string | null }>(
      `UPDATE payments SET status='captured', provider_ref = COALESCE($2, provider_ref), reviewed_at = now()
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
      if (opts.notifyOwner !== false) void notifyOwnerNewBooking(confirmedAppt);
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
  // Culqi: cobro de la suscripción de date.pe con el token de Culqi.js
  const culqiBody = z.object({ invoiceId: z.string().uuid().optional(), token: z.string(), email: z.string().email() });
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
    // Los clientes de las barberías pagan directo a la barbería: aquí solo se cobra la suscripción de date.pe
    return reply.code(410).send({ error: 'pagos_directos' });
  });

  // PayPal: capturar la orden de la suscripción de date.pe al volver del checkout
  const ppBody = z.object({ orderId: z.string() });
  app.post('/payments/paypal/capture', async (request, reply) => {
    const { orderId } = ppBody.parse(request.body);
    const inv = await adminPool.query<{ id: string }>('SELECT id FROM subscription_invoices WHERE provider_ref=$1', [orderId]);
    if (!inv.rows[0]) return reply.code(404).send({ error: 'orden_no_encontrada' });
    const ok = await paypalCapture(orderId);
    if (!ok) return reply.code(402).send({ error: 'captura_fallida' });
    await markInvoicePaid(inv.rows[0].id, orderId, 'paypal');
    return { ok: true, subscription: true };
  });

  // MercadoPago: webhook de notificación
  app.post('/payments/webhook/mercadopago', async (request, reply) => {
    const q = request.query as { type?: string; topic?: string; 'data.id'?: string; id?: string };
    const body = (request.body ?? {}) as { type?: string; data?: { id?: string } };
    const type = q.type ?? q.topic ?? body.type;
    const mpId = q['data.id'] ?? body.data?.id ?? q.id;
    if (type !== 'payment' || !mpId) return reply.send({ ok: true });
    try {
      // Solo la suscripción de date.pe pasa por MercadoPago
      const data = await mercadopagoPayment(String(mpId), null);
      if (data?.status === 'approved' && data.external_reference?.startsWith('sub:')) {
        await markInvoicePaid(data.external_reference.slice(4), String(mpId), 'mercadopago');
      }
    } catch (err) {
      request.log.error(err);
    }
    return reply.send({ ok: true });
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

  // ===================== Pagos directos a la barbería =====================
  // El cliente paga por Yape o Plin al número de la barbería y sube la captura.
  const receiptHits = new Map<string, { n: number; t: number }>();
  app.post('/public/uploads/receipt', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    if (!r2Configured()) return reply.code(503).send({ error: 'subidas_no_disponibles' });
    const ip = String(request.headers['cf-connecting-ip'] ?? '') || String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || request.ip;
    const now = Date.now();
    const h = receiptHits.get(ip);
    if (!h || now - h.t > 3_600_000) receiptHits.set(ip, { n: 1, t: now });
    else if (++h.n > 15) return reply.code(429).send({ error: 'demasiados_intentos' });
    if (receiptHits.size > 5000) receiptHits.clear();
    const { contentType } = z.object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) }).parse(request.body);
    return presignReceipt(request.tenant.id, contentType);
  });

  app.register(async (panel) => {
    panel.addHook('preHandler', app.requireTenant);

    // Pagos por confirmar: adelantos de reservas y compras de gift cards o paquetes
    panel.get('/admin/payments/pending', async (request) => {
      return withTenant(request.tenant!.id, async (sql) => {
        const { rows } = await sql(
          `SELECT p.id, p.amount_cents, p.method, p.purpose, p.created_at, p.appointment_id,
                  c.name AS client_name, c.phone AS client_phone,
                  a.starts_at, st.name AS staff_name,
                  (SELECT string_agg(sv.name, ' + ' ORDER BY sv.is_addon) FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id WHERE aps.appointment_id = a.id) AS services,
                  CASE p.purpose WHEN 'package' THEN (SELECT name FROM packages WHERE id = p.purpose_ref)
                                 WHEN 'gift_card' THEN (SELECT 'Gift card para ' || recipient_name FROM gift_cards WHERE id = p.purpose_ref) END AS detail
             FROM payments p
             LEFT JOIN clients c ON c.id = p.client_id
             LEFT JOIN appointments a ON a.id = p.appointment_id
             LEFT JOIN staff st ON st.id = a.staff_id
            WHERE p.provider = 'directo' AND p.status = 'pending' AND (p.appointment_id IS NULL OR a.status = 'pending')
            ORDER BY p.created_at`,
        );
        return { payments: rows };
      });
    });

    // La captura se ve solo desde el panel de esa barbería
    panel.get('/admin/payments/:id/receipt', async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const row = await withTenant(request.tenant!.id, (sql) => sql<{ receipt_key: string | null }>('SELECT receipt_key FROM payments WHERE id = $1', [id]));
      const key = row.rows[0]?.receipt_key;
      if (!key) return reply.code(404).send({ error: 'sin_captura' });
      let obj;
      try { obj = await getObject(key); } catch { return reply.code(404).send({ error: 'sin_captura' }); }
      reply.header('Content-Type', obj.contentType ?? 'image/jpeg');
      reply.header('Cache-Control', 'private, max-age=3600');
      return reply.send(obj.body);
    });

    panel.post('/admin/payments/:id/confirm', async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const row = await withTenant(request.tenant!.id, (sql) => sql<{ status: string }>("SELECT status FROM payments WHERE id = $1 AND provider = 'directo'", [id]));
      if (!row.rows[0]) return reply.code(404).send({ error: 'pago_no_encontrado' });
      if (row.rows[0].status !== 'pending') return reply.code(409).send({ error: 'pago_ya_revisado' });
      await confirmCaptured(id, `confirmado:${request.user.sub}`, { notifyOwner: false });
      return { ok: true };
    });

    panel.post('/admin/payments/:id/reject', async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const { reason } = z.object({ reason: z.string().trim().max(200).optional() }).parse(request.body ?? {});
      const tenantId = request.tenant!.id;
      const out = await withTenant(tenantId, async (sql) => {
        const p = await sql<{ appointment_id: string | null }>(
          "UPDATE payments SET status = 'failed', reviewed_at = now(), review_note = $2 WHERE id = $1 AND provider = 'directo' AND status = 'pending' RETURNING appointment_id",
          [id, reason || null],
        );
        if (!p.rows[0]) return null;
        let loc: string | null = null;
        const apptId = p.rows[0].appointment_id;
        if (apptId) {
          const a = await sql<{ location_id: string | null }>(
            "UPDATE appointments SET status = 'cancelled', note = COALESCE(note || ' | ', '') || $2 WHERE id = $1 AND status = 'pending' RETURNING location_id",
            [apptId, `Adelanto no confirmado${reason ? `: ${reason}` : ''}`],
          );
          loc = a.rows[0]?.location_id ?? null;
        }
        return { apptId, loc };
      });
      if (!out) return reply.code(409).send({ error: 'pago_ya_revisado' });
      if (out.apptId) {
        await emitAvailabilityChange(tenantId, out.loc);
        void sendDepositRejected(out.apptId, reason || null);
      }
      return { ok: true };
    });
  });
};
