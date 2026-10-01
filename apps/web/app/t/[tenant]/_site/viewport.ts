import type { Viewport } from 'next';
import { getSite } from './data';
import { resolveTheme } from './theme';

/** La barra de estado del teléfono toma el color de fondo del ambiente. */
export async function moodViewport({ params }: { params: Promise<{ tenant: string }> }): Promise<Viewport> {
  const { tenant } = await params;
  const site = await getSite(tenant);
  const t = resolveTheme(site?.branding?.site_theme, site?.branding?.color_primary);
  return { themeColor: t.mood.bg, width: 'device-width', initialScale: 1, viewportFit: 'cover' };
}
