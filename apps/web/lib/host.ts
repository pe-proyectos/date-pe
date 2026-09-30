const BASE = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'date.pe';

/** Subdominio de barbería a partir del Host (null = sitio principal). */
export function tenantFromHost(host: string): string | null {
  const clean = host.split(':')[0].toLowerCase();
  if (clean === BASE || clean === `www.${BASE}`) return null;
  if (clean.endsWith(`.${BASE}`)) {
    const sub = clean.slice(0, -(BASE.length + 1)).split('.')[0];
    if (!sub || ['www', 'api', 'r2'].includes(sub)) return null;
    return sub;
  }
  if (clean.endsWith('.lvh.me') || clean.endsWith('.localhost')) return clean.split('.')[0];
  return null;
}
