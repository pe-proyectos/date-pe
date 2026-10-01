import { getSite } from '../_site/data';
import { resolveTheme } from '../_site/theme';

/** Manifest para agregar la página de la barbería a la pantalla de inicio como una app. */
export async function GET(_req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/manifest+json' } });
  const t = resolveTheme(site.branding?.site_theme, site.branding?.color_primary);
  const logo = site.branding?.logo_url;
  const ext = logo?.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const type = ({ svg: 'image/svg+xml', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' } as Record<string, string>)[ext] ?? 'image/png';
  const icons = logo
    ? [
        { src: logo, sizes: 'any', type, purpose: 'any' },
        { src: logo, sizes: '512x512', type, purpose: 'maskable' },
      ]
    : [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }];
  const body = {
    name: site.tenant.name,
    short_name: site.tenant.name.replace(/^Barber[ií]a\s+/i, '').slice(0, 12),
    description: site.branding?.tagline ?? `Reserva en ${site.tenant.name}`,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: t.mood.bg,
    theme_color: t.mood.bg,
    lang: 'es-PE',
    icons,
    shortcuts: [
      { name: 'Reservar cita', url: '/reservar' },
      { name: 'Servicios', url: '/servicios' },
      { name: 'Mis citas', url: '/mi-cuenta' },
    ],
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=600' } });
}
