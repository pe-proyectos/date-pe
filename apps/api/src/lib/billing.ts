import { admin, adminPool } from '../db.js';
import { env } from '../env.js';
import { sendEmail, layout } from './email.js';
import { ownerEmails, tenantUrl } from './notify.js';

// Suscripción de cada barbería a date.pe: prueba acordada y luego el precio mensual acordado con cada una.
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 3;

export interface BillingState {
  status: string;
  isDemo: boolean;
  trialEndsAt: string | null;
  paidUntil: string | null;
  /** Hasta cuándo puede usar date.pe sin pagar de nuevo */
  activeUntil: string | null;
  daysLeft: number | null;
  monthlyPriceCents: number;
  /** Mostrar aviso de pago en el panel */
  needsPayment: boolean;
  suspended: boolean;
}

export async function billingState(tenantId: string): Promise<BillingState | null> {
  const { rows } = await admin<{ status: string; is_demo: boolean; trial_ends_at: Date | null; paid_until: Date | null; monthly_price_cents: number }>(
    'SELECT status, is_demo, trial_ends_at, paid_until, monthly_price_cents FROM tenants WHERE id = $1',
    [tenantId],
  );
  const t = rows[0];
  if (!t) return null;
  const ends = [t.trial_ends_at, t.paid_until].filter(Boolean).map((d) => (d as Date).getTime());
  const activeUntil = ends.length ? new Date(Math.max(...ends)) : null;
  const daysLeft = activeUntil ? Math.ceil((activeUntil.getTime() - Date.now()) / 864e5) : null;
  return {
    status: t.status,
    isDemo: t.is_demo,
    trialEndsAt: t.trial_ends_at?.toISOString() ?? null,
    paidUntil: t.paid_until?.toISOString() ?? null,
    activeUntil: activeUntil?.toISOString() ?? null,
    daysLeft,
    monthlyPriceCents: t.monthly_price_cents,
    needsPayment: !t.is_demo && t.monthly_price_cents > 0 && (t.status === 'suspended' || (daysLeft !== null && daysLeft <= 5)),
    suspended: t.status === 'suspended',
  };
}

export async function createInvoice(tenantId: string, months: number, provider: string) {
  const t = await admin<{ monthly_price_cents: number }>('SELECT monthly_price_cents FROM tenants WHERE id = $1', [tenantId]);
  const amount = (t.rows[0]?.monthly_price_cents ?? 5000) * months;
  const { rows } = await admin<{ id: string; amount_cents: number }>(
    `INSERT INTO subscription_invoices (tenant_id, amount_cents, months, provider) VALUES ($1, $2, $3, $4) RETURNING id, amount_cents`,
    [tenantId, amount, months, provider],
  );
  return rows[0];
}

/** Marca un cobro como pagado y extiende el acceso de la barbería. Idempotente. */
export async function markInvoicePaid(invoiceId: string, providerRef?: string | null, provider?: string): Promise<boolean> {
  const client = await adminPool.connect();
  let info: { tenant_id: string; name: string; slug: string; period_end: Date; amount_cents: number; months: number } | null = null;
  try {
    await client.query('BEGIN');
    const inv = await client.query<{ tenant_id: string; months: number; amount_cents: number }>(
      `UPDATE subscription_invoices SET status = 'paid', paid_at = now(), provider_ref = COALESCE($2, provider_ref), provider = COALESCE($3, provider)
        WHERE id = $1 AND status = 'pending' RETURNING tenant_id, months, amount_cents`,
      [invoiceId, providerRef ?? null, provider ?? null],
    );
    if (inv.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    const { tenant_id, months, amount_cents } = inv.rows[0];
    // El nuevo periodo empieza donde termina el acceso actual (prueba o pago), o hoy si ya venció
    const t = await client.query<{ name: string; slug: string; period_start: Date; period_end: Date }>(
      `WITH cur AS (
         SELECT GREATEST(now(), COALESCE(paid_until, '-infinity'), COALESCE(trial_ends_at, '-infinity')) AS start FROM tenants WHERE id = $1
       )
       UPDATE tenants SET paid_until = cur.start + make_interval(months => $2), status = 'active', updated_at = now()
         FROM cur WHERE id = $1
       RETURNING name, slug, cur.start AS period_start, paid_until AS period_end`,
      [tenant_id, months],
    );
    await client.query('UPDATE subscription_invoices SET period_start = $2, period_end = $3 WHERE id = $1', [
      invoiceId,
      t.rows[0].period_start,
      t.rows[0].period_end,
    ]);
    await client.query('COMMIT');
    info = { tenant_id, name: t.rows[0].name, slug: t.rows[0].slug, period_end: t.rows[0].period_end, amount_cents, months };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  if (info) {
    const to = await ownerEmails(info.tenant_id);
    if (to.length) {
      void sendEmail({
        to: to.join(','),
        subject: `Pago recibido: date.pe para ${info.name}`,
        html: layout({
          brand: 'date.pe',
          title: 'Gracias, recibimos tu pago',
          intro: `Tu barbería ${info.name} sigue activa. Este es el detalle:`,
          rows: [
            ['Monto', `S/ ${(info.amount_cents / 100).toFixed(2)}`],
            ['Meses', String(info.months)],
            ['Activa hasta', info.period_end.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' })],
          ],
          cta: { label: 'Abrir mi panel', href: tenantUrl(info.slug, '/admin') },
          foot: 'date.pe, agenda y reservas para barberías',
        }),
      });
    }
  }
  return true;
}

export async function emailBillingNotice(tenantId: string, kind: 'ending' | 'suspended', daysLeft?: number) {
  const t = await admin<{ name: string; slug: string; status: string }>('SELECT name, slug, status FROM tenants WHERE id = $1', [tenantId]);
  const tenant = t.rows[0];
  if (!tenant) return;
  const to = await ownerEmails(tenantId);
  if (to.length === 0) return;
  const trial = tenant.status === 'trial';
  const title =
    kind === 'suspended'
      ? 'Tu página de reservas está en pausa'
      : trial
        ? `Tu prueba termina en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`
        : `Tu plan vence en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`;
  const intro =
    kind === 'suspended'
      ? `No recibimos el pago de ${tenant.name}, así que tus clientes no pueden reservar por ahora. Tus datos están guardados: paga tu plan desde el panel y todo vuelve a funcionar al instante.`
      : `Para que tus clientes sigan reservando en ${tenant.name}, paga tu plan desde el panel. Toma un minuto.`;
  await sendEmail({
    to: to.join(','),
    subject: kind === 'suspended' ? `Reservas en pausa: ${tenant.name}` : `${title}: ${tenant.name}`,
    html: layout({
      brand: 'date.pe',
      title,
      intro,
      cta: { label: 'Pagar ahora', href: tenantUrl(tenant.slug, '/admin#facturacion') },
      foot: 'date.pe, agenda y reservas para barberías',
    }),
  });
}

export const billingReturnUrls = (slug: string) => ({
  success: tenantUrl(slug, '/admin?pago=ok#facturacion'),
  failure: tenantUrl(slug, '/admin?pago=error#facturacion'),
  webhook: `${env.appPublicUrl}/api/payments/webhook/mercadopago`,
});
