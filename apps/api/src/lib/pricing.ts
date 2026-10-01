import type { Sql } from '../db.js';

export interface Quote {
  listPriceCents: number;
  promo: { code: string; valid: boolean; reason?: string; discountCents: number; referrerClientId?: string } | null;
  addons: Array<{ id: string; name: string; priceCents: number; durationMin: number }>;
  durationMin: number;
  giftCard: { code: string; valid: boolean; reason?: string; appliedCents: number; balanceCents: number } | null;
  discountCents: number;
  finalCents: number;
  depositCents: number;
  depositPercent: number;
}

/**
 * Cotiza un servicio para el tenant en sesión, aplicando promo y gift card.
 * Corre dentro de withTenant (RLS). No modifica nada.
 */
export async function quote(
  sql: Sql,
  p: {
    serviceId: string;
    addonIds?: string[];
    staffId?: string | null;
    promoCode?: string | null;
    giftCardCode?: string | null;
    /** Celular del cliente: los códigos de amigo solo valen para clientes nuevos */
    phone?: string | null;
  },
): Promise<Quote | null> {
  const svc = await sql<{ price_cents: number; duration_min: number }>(
    'SELECT price_cents, duration_min FROM services WHERE id = $1 AND is_active AND NOT is_addon',
    [p.serviceId],
  );
  if (svc.rows.length === 0) return null;
  let list = svc.rows[0].price_cents;
  let durationMin = svc.rows[0].duration_min;

  // Precio específico del barbero, si existe
  if (p.staffId) {
    const ov = await sql<{ price_cents: number | null; duration_min: number | null }>(
      'SELECT price_cents, duration_min FROM service_staff WHERE service_id = $1 AND staff_id = $2',
      [p.serviceId, p.staffId],
    );
    if (ov.rows[0]?.price_cents != null) list = ov.rows[0].price_cents;
    if (ov.rows[0]?.duration_min != null) durationMin = ov.rows[0].duration_min;
  }

  // Extras (lavado, diseño, cejas...) que se suman al servicio principal
  const addons: Quote['addons'] = [];
  if (p.addonIds?.length) {
    const r = await sql<{ id: string; name: string; price_cents: number; duration_min: number }>(
      'SELECT id, name, price_cents, duration_min FROM services WHERE id = ANY($1) AND is_active AND is_addon',
      [p.addonIds],
    );
    for (const a of r.rows) {
      addons.push({ id: a.id, name: a.name, priceCents: a.price_cents, durationMin: a.duration_min });
      list += a.price_cents;
      durationMin += a.duration_min;
    }
  }

  let remaining = list;
  let promo: Quote['promo'] = null;
  if (p.promoCode) {
    const code = p.promoCode.trim().toUpperCase();
    const r = await sql<{ kind: string; value: number; active: boolean; expires_at: string | null; max_uses: number | null; used_count: number }>(
      'SELECT kind, value, active, expires_at, max_uses, used_count FROM promotions WHERE upper(code) = $1',
      [code],
    );
    const row = r.rows[0];
    if (!row) promo = await referralPromo(sql, code, remaining, p.phone ?? null);
    if (promo) {
      if (promo.valid) remaining -= promo.discountCents;
    } else if (!row) promo = { code, valid: false, reason: 'Código no encontrado', discountCents: 0 };
    else if (!row.active) promo = { code, valid: false, reason: 'Código inactivo', discountCents: 0 };
    else if (row.expires_at && new Date(row.expires_at) < new Date()) promo = { code, valid: false, reason: 'Código vencido', discountCents: 0 };
    else if (row.max_uses != null && row.used_count >= row.max_uses) promo = { code, valid: false, reason: 'Código agotado', discountCents: 0 };
    else {
      const d = row.kind === 'percent' ? Math.round((remaining * Math.min(100, row.value)) / 100) : Math.min(remaining, row.value);
      promo = { code, valid: true, discountCents: d };
      remaining -= d;
    }
  }

  let giftCard: Quote['giftCard'] = null;
  if (p.giftCardCode) {
    const code = p.giftCardCode.trim().toUpperCase();
    const g = await sql<{ balance_cents: number; active: boolean }>(
      'SELECT balance_cents, active FROM gift_cards WHERE upper(code) = $1',
      [code],
    );
    const row = g.rows[0];
    if (!row) giftCard = { code, valid: false, reason: 'Gift card no encontrada', appliedCents: 0, balanceCents: 0 };
    else if (!row.active || row.balance_cents <= 0) giftCard = { code, valid: false, reason: 'Gift card sin saldo', appliedCents: 0, balanceCents: row.balance_cents };
    else {
      const applied = Math.min(remaining, row.balance_cents);
      giftCard = { code, valid: true, appliedCents: applied, balanceCents: row.balance_cents };
      remaining -= applied;
    }
  }

  // Sin número de Yape o Plin configurado no hay a dónde pagar: no se pide adelanto
  const settings = await sql<{ deposit_percent: number; require_deposit: boolean }>(
    "SELECT deposit_percent, (require_deposit AND COALESCE(pay_phone, '') <> '') AS require_deposit FROM tenant_settings",
  );
  const pct = settings.rows[0]?.require_deposit ? settings.rows[0].deposit_percent : 0;
  const deposit = Math.round((remaining * pct) / 100);

  return {
    listPriceCents: list,
    addons,
    durationMin,
    promo,
    giftCard,
    discountCents: list - remaining,
    finalCents: remaining,
    depositCents: deposit,
    depositPercent: pct,
  };
}

const lastDigits = (v: string) => v.replace(/\D/g, '').slice(-9);

/** Código de amigo: descuento para quien llega recomendado por un cliente. */
async function referralPromo(sql: Sql, code: string, amount: number, phone: string | null): Promise<Quote['promo']> {
  const st = await sql<{ referral_enabled: boolean; referral_discount_percent: number }>('SELECT referral_enabled, referral_discount_percent FROM tenant_settings');
  if (!st.rows[0]?.referral_enabled) return null;
  const ref = await sql<{ id: string; phone: string }>('SELECT id, phone FROM clients WHERE upper(referral_code) = $1', [code]);
  const referrer = ref.rows[0];
  if (!referrer) return null;
  if (phone) {
    if (lastDigits(referrer.phone) === lastDigits(phone)) return { code, valid: false, reason: 'No puedes usar tu propio código', discountCents: 0 };
    const prior = await sql(
      `SELECT 1 FROM appointments a JOIN clients c ON c.id = a.client_id
        WHERE regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE '%' || $1 AND a.status <> 'cancelled' LIMIT 1`,
      [lastDigits(phone)],
    );
    if (prior.rows.length > 0) return { code, valid: false, reason: 'El código de amigo es para tu primera visita', discountCents: 0 };
  }
  const pct = st.rows[0].referral_discount_percent;
  return { code, valid: true, discountCents: Math.round((amount * pct) / 100), referrerClientId: referrer.id };
}
