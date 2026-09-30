import { headers } from 'next/headers';
import { tenantFromHost } from '@/lib/host';
import { apiFetch, type TenantSite } from '@/lib/api';

export const dynamic = 'force-dynamic';

const POLE_ICONS = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

/** Manifiesto instalable: date.pe o, en un subdominio, la barbería con su nombre y color. */
export async function GET() {
  const host = (await headers()).get('host') ?? '';
  const slug = tenantFromHost(host);

  let manifest: Record<string, unknown> = {
    name: 'date.pe',
    short_name: 'date.pe',
    description: 'Reserva tu barbería en Lima en un minuto.',
    lang: 'es-PE',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: POLE_ICONS,
  };

  if (slug) {
    try {
      const site = await apiFetch<TenantSite>('/api/public/site', { tenantSlug: slug });
      const name = site.tenant.name;
      manifest = {
        ...manifest,
        name,
        short_name: name.replace(/^Barber[ií]a\s+/i, '').slice(0, 12) || name.slice(0, 12),
        description: site.branding?.tagline ?? `Reserva en ${name}`,
        id: `/${slug}`,
        icons: site.branding?.logo_url
          ? [{ src: site.branding.logo_url, sizes: 'any', type: 'image/png' }, ...POLE_ICONS]
          : POLE_ICONS,
        shortcuts: [{ name: 'Reservar', url: '/reservar' }],
      };
    } catch {
      /* se usa el manifiesto de date.pe */
    }
  } else {
    manifest.shortcuts = [
      { name: 'Buscar barberías', url: '/search' },
      { name: 'Ingresar a mi panel', url: '/ingresar' },
    ];
  }

  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
