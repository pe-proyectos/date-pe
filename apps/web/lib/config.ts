// Base de la API. En server usamos la URL interna; en cliente la pública.
export const API_BASE_SERVER = process.env.API_BASE ?? 'http://localhost:3001';
export const API_BASE_CLIENT = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';
export const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'date.pe';
export const IS_DEV = process.env.NODE_ENV !== 'production';

// URL pública del sitio de un tenant (subdominio).
export function tenantUrl(slug: string, path = ''): string {
  if (IS_DEV) return `http://${slug}.lvh.me:3000${path}`;
  return `https://${slug}.${BASE_DOMAIN}${path}`;
}
