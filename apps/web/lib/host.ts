const BASE = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'date.pe';

function cleanHost(host: string): string {
  return host.split(':')[0].trim().toLowerCase().replace(/\.$/, '');
}

/** Subdominio de barbería a partir del Host (null = sitio principal o dominio propio). */
export function tenantFromHost(host: string): string | null {
  const clean = cleanHost(host);
  if (clean === BASE || clean === `www.${BASE}`) return null;
  if (clean.endsWith(`.${BASE}`)) {
    const sub = clean.slice(0, -(BASE.length + 1)).split('.')[0];
    if (!sub || ['www', 'api', 'r2'].includes(sub)) return null;
    return sub;
  }
  if (clean.endsWith('.lvh.me') || clean.endsWith('.localhost')) return clean.split('.')[0];
  return null;
}

/**
 * true si el Host es de date.pe (principal, www, subdominios) o de desarrollo.
 * También cuenta como propio un host sin punto (nombre de contenedor) o una IP:
 * así los chequeos de salud internos no consultan a la API.
 */
export function isPlatformHost(host: string): boolean {
  const clean = cleanHost(host);
  if (!clean) return true;
  if (clean === BASE || clean.endsWith(`.${BASE}`)) return true;
  if (clean === 'localhost' || clean.endsWith('.localhost')) return true;
  if (clean === 'lvh.me' || clean.endsWith('.lvh.me')) return true;
  if (!clean.includes('.')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(clean) || clean.startsWith('[')) return true;
  return false;
}

const TTL_MS = 60_000;
const cache = new Map<string, { slug: string | null; exp: number }>();

/**
 * Barbería dueña de un dominio propio (ej. barberiajuana.com), o null.
 * Usa solo fetch para funcionar en el runtime edge del middleware. Guarda el
 * resultado (también el negativo) unos 60 segundos en memoria.
 */
export async function slugFromCustomHost(host: string): Promise<string | null> {
  const clean = cleanHost(host);
  if (isPlatformHost(clean)) return null;
  const now = Date.now();
  const hit = cache.get(clean);
  if (hit && hit.exp > now) return hit.slug;

  const api = process.env.API_BASE ?? 'http://datepe-api:3001';
  let slug: string | null = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${api}/api/public/resolve-host?host=${encodeURIComponent(clean)}`, {
      signal: ctrl.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (res.ok) {
      const d = (await res.json()) as { slug?: string | null };
      slug = typeof d.slug === 'string' && d.slug ? d.slug : null;
    }
  } catch {
    // Si la API no responde, no se guarda: se reintenta en la próxima visita
    return hit?.slug ?? null;
  }

  if (cache.size > 500) cache.clear();
  cache.set(clean, { slug, exp: now + TTL_MS });
  return slug;
}
