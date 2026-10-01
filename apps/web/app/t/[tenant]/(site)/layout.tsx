import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { SedeProvider } from '../_parts/sede';
import { SiteHeader } from '../_site/SiteHeader';
import { SiteFooter } from '../_site/blocks';
import { AppTabBar } from '../_site/AppTabBar';
import { PageTransition } from '../_site/PageTransition';
import { getSite, derive } from '../_site/data';
import { fontVars } from '../_site/fonts';
import { themeVars, resolveTheme } from '../_site/theme';
import '../_site/site.css';

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }): Promise<Metadata> {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) return {};
  return {
    manifest: '/manifest',
    appleWebApp: { capable: true, title: site.tenant.name, statusBarStyle: 'default' },
    ...(site.branding?.logo_url ? { icons: { icon: site.branding.logo_url, apple: site.branding.logo_url } } : {}),
  };
}

/** La barra de estado del teléfono toma el color de fondo del ambiente. */
export async function generateViewport({ params }: { params: Promise<{ tenant: string }> }): Promise<Viewport> {
  const { tenant } = await params;
  const site = await getSite(tenant);
  const t = resolveTheme(site?.branding?.site_theme, site?.branding?.color_primary);
  return { themeColor: t.mood.bg, width: 'device-width', initialScale: 1, viewportFit: 'cover' };
}

/**
 * Marco de las páginas públicas de la barbería (inicio, servicios, equipo, trabajos,
 * opiniones, visítanos): ambiente, cabecera, pie y, en el celular, la barra de pestañas.
 */
export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) notFound();
  const d = derive(site, tenant);
  const extra = [
    ...(d.available ? [{ href: '/reservar', label: 'Reservar' }] : []),
    ...(d.showQueue ? [{ href: '/fila', label: 'Fila virtual' }] : []),
    ...(d.showGifts ? [{ href: '/regalos', label: 'Regalos' }] : []),
  ];
  return (
    <div className={`site min-h-screen ${fontVars}`} data-mood={d.mood.id} style={themeVars(d.theme) as React.CSSProperties}>
      <SedeProvider slug={tenant} locations={d.publicLocations}>
        <SiteHeader name={site.tenant.name} logo={site.branding?.logo_url ?? null} initial={d.initial} nav={d.nav} available={d.available} photoHero={d.photoHero} slug={tenant} />
        <PageTransition>
          {children}
          <SiteFooter d={d} />
        </PageTransition>
        <AppTabBar slug={tenant} nav={d.nav} extra={extra} available={d.available} teamLabel={d.solo ? 'Barbero' : 'Equipo'} whatsapp={d.whatsapp} maps={d.loc ? d.mapsFor(d.loc) : null} />
      </SedeProvider>
    </div>
  );
}
