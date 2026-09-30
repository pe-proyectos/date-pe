import { NextResponse, type NextRequest } from 'next/server';
import { isPlatformHost, slugFromCustomHost, tenantFromHost } from '@/lib/host';

/**
 * Reescribe las visitas de una barbería a /t/<slug>/... manteniendo la URL visible:
 * - subdominio: barberiajuana.date.pe
 * - dominio propio: barberiajuana.com (se resuelve con la API y se guarda 60 s)
 * El slug también viaja en la cabecera x-tenant-slug para los componentes de servidor.
 */
export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const url = req.nextUrl;

  let tenant = tenantFromHost(host);
  if (!tenant && !isPlatformHost(host)) tenant = await slugFromCustomHost(host);

  // Nadie de afuera debe poder fijar esta cabecera
  const reqHeaders = new Headers(req.headers);
  reqHeaders.delete('x-tenant-slug');

  // Sin barbería => sitio principal date.pe (landing, search, blog, join).
  // Un dominio propio desconocido cae aquí y muestra lo que corresponda (o la página 404).
  if (!tenant) return NextResponse.next({ request: { headers: reqHeaders } });

  reqHeaders.set('x-tenant-slug', tenant);

  if (url.pathname.startsWith('/t/')) return NextResponse.next({ request: { headers: reqHeaders } });

  const rewritten = new URL(`/t/${tenant}${url.pathname === '/' ? '' : url.pathname}`, req.url);
  rewritten.search = url.search;
  const res = NextResponse.rewrite(rewritten, { request: { headers: reqHeaders } });
  res.headers.set('x-tenant-slug', tenant);
  return res;
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf|txt|xml|webmanifest|js|pdf)).*)'],
};
