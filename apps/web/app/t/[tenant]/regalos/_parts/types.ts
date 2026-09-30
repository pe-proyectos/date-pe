export interface ShopPackage {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  uses: number;
  service_ids: string[] | null;
  valid_days: number | null;
}

export interface Shop {
  packages: ShopPackage[];
  services: Array<{ id: string; name: string; price_cents: number }>;
  giftCards: { amounts: number[]; min: number; max: number } | null;
}

export type Provider = 'mercadopago' | 'culqi' | 'paypal';

/** Precio normal de los usos del paquete, con el servicio más barato que cubre (para no exagerar el ahorro). */
export function packageSavings(p: ShopPackage, services: Shop['services']): { regular: number; savings: number; covered: string[] } {
  const ids = p.service_ids ?? [];
  const covered = ids.length ? services.filter((s) => ids.includes(s.id)) : [];
  const unit = covered.length ? Math.min(...covered.map((s) => s.price_cents)) : 0;
  const regular = unit * p.uses;
  return { regular, savings: Math.max(0, regular - p.price_cents), covered: covered.map((s) => s.name) };
}
