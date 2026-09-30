import type { Sql } from '../db.js';

export interface Quote {
  listPriceCents: number;
  promo: { code: string; valid: boolean; reason?: string; discountCents: number } | null;
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
  p: { serviceId: string; staffId?: string | null; promoCode?: string | null; giftCardCode?: string | null },
): Promise<Quote | null> {
  const svc = await sql<{ price_cents: number }>(
    'SELECT price_cents FROM services WHERE id = $1 AND is_active',
    [p.serviceId],
  );
  if (svc.rows.length === 0) return null;
  let list = svc.rows[0].price_cents;

  // Precio específico del barbero, si existe
  if (p.staffId) {
    const ov = await sql<{ price_cents: number | null }>(
      'SELECT price_cents FROM service_staff WHERE service_id = $1 AND staff_id = $2',
      [p.serviceId, p.staffId],
    );
    if (ov.rows[0]?.price_cents != null) list = ov.rows[0].price_cents;
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
    if (!row) promo = { code, valid: false, reason: 'Código no encontrado', discountCents: 0 };
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

  const settings = await sql<{ deposit_percent: number; require_deposit: boolean }>(
    'SELECT deposit_percent, require_deposit FROM tenant_settings',
  );
  const pct = settings.rows[0]?.require_deposit ? settings.rows[0].deposit_percent : 0;
  const deposit = Math.round((remaining * pct) / 100);

  return {
    listPriceCents: list,
    promo,
    giftCard,
    discountCents: list - remaining,
    finalCents: remaining,
    depositCents: deposit,
    depositPercent: pct,
  };
}
