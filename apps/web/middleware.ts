import { NextResponse, type NextRequest } from 'next/server';

const BASE = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'date.pe';

// Extrae el subdominio del tenant a partir del Host.
function tenantOf(host: string): string | null {
  const clean = host.split(':')[0].toLowerCase();
  if (clean === BASE || clean === `www.${BASE}`) return null;
  if (clean.endsWith(`.${BASE}`)) {
    const sub = clean.slice(0, -(BASE.length + 1)).split('.')[0];
    if (!sub || ['www', 'api', 'r2'].includes(sub)) return null;
    return sub;
  }
  // dev
  if (clean.endsWith('.lvh.me')) return clean.split('.')[0];
  if (clean.endsWith('.localhost')) return clean.split('.')[0];
  return null;
}

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const tenant = tenantOf(host);
  const url = req.nextUrl;

  // Sin subdominio => sitio principal date.pe (landing, search, blog, join)
  if (!tenant) return NextResponse.next();

  // Con subdominio => reescribe a /t/<tenant>/... manteniendo la URL visible
  if (url.pathname.startsWith('/t/')) return NextResponse.next();
  const rewritten = new URL(`/t/${tenant}${url.pathname}`, req.url);
  rewritten.search = url.search;
  const res = NextResponse.rewrite(rewritten);
  res.headers.set('x-tenant-slug', tenant);
  return res;
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf|txt|xml|webmanifest)).*)'],
};
