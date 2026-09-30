import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { admin } from '../db.js';
import { billingState, createInvoice, billingReturnUrls } from '../lib/billing.js';
import { createIntent, type Provider } from '../lib/payments.js';

function tenantOf(request: FastifyRequest) {
  if (!request.tenant) throw new Error('tenant_no_resuelto');
  return request.tenant;
}

// Suscripción de la barbería a date.pe, vista desde su panel.
export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireTenant);

  app.get('/admin/billing', async (request) => {
    const t = tenantOf(request);
    const [state, invoices] = await Promise.all([
      billingState(t.id),
      admin(
        `SELECT id, amount_cents, months, status, provider, paid_at, period_start, period_end, created_at
           FROM subscription_invoices WHERE tenant_id = $1 AND status <> 'void' ORDER BY created_at DESC LIMIT 24`,
        [t.id],
      ),
    ]);
    return { billing: state, invoices: invoices.rows.filter((i) => i.status === 'paid' || Date.now() - new Date(i.created_at).getTime() < 864e5) };
  });

  const checkoutBody = z.object({
    provider: z.enum(['mercadopago', 'paypal', 'culqi']),
    months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).default(1),
  });
  app.post('/admin/billing/checkout', async (request) => {
    const t = tenantOf(request);
    const b = checkoutBody.parse(request.body);
    const inv = await createInvoice(t.id, b.months, b.provider);
    const intent = await createIntent(b.provider as Provider, {
      amountCents: inv.amount_cents,
      description: `date.pe, plan de ${b.months} ${b.months === 1 ? 'mes' : 'meses'} para ${t.name}`,
      externalReference: `sub:${inv.id}`,
      returnUrls: billingReturnUrls(t.slug),
    });
    if (intent.providerRef) await admin('UPDATE subscription_invoices SET provider_ref = $2 WHERE id = $1', [inv.id, intent.providerRef]);
    return {
      ok: true,
      invoiceId: inv.id,
      amountCents: inv.amount_cents,
      provider: b.provider,
      redirectUrl: intent.redirectUrl,
      clientConfig: intent.clientConfig,
      devSimulated: intent.devSimulated ?? false,
      devConfirmUrl: intent.devSimulated ? `/api/billing/${inv.id}/dev-confirm` : undefined,
    };
  });
};
