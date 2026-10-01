import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SedeProvider } from '../_parts/sede';
import { SiteHeader } from '../_site/SiteHeader';
import { SiteFooter } from '../_site/blocks';
import { AppTabBar } from '../_site/AppTabBar';
import { PageTransition } from '../_site/PageTransition';
import { Track } from '../_site/Track';
import { AppInstall } from '../_site/AppInstall';
import { INSTALL_CAPTURE } from '@/lib/install';
import { getSite, derive } from '../_site/data';
import { fontVars } from '../_site/fonts';
import { themeVars } from '../_site/theme';
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

export { moodViewport as generateViewport } from '../_site/viewport';

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
    { href: '/mi-cuenta', label: 'Mi cuenta' },
  ];
  return (
    <div className={`site min-h-screen ${fontVars}`} data-mood={d.mood.id} style={themeVars(d.theme) as React.CSSProperties}>
      <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE }} />
      <Track slug={tenant} />
      <SedeProvider slug={tenant} locations={d.publicLocations}>
        <SiteHeader name={site.tenant.name} logo={site.branding?.logo_url ?? null} initial={d.initial} nav={d.nav} available={d.available} photoHero={d.photoHero} slug={tenant} />
        <PageTransition>
          {children}
          <SiteFooter d={d} />
        </PageTransition>
        <AppTabBar slug={tenant} nav={d.nav} extra={extra} available={d.available} teamLabel={d.solo ? 'Barbero' : 'Equipo'} whatsapp={d.whatsapp} maps={d.loc ? d.mapsFor(d.loc) : null} />
        <AppInstall slug={tenant} shop={site.tenant.name} logo={site.branding?.logo_url ?? null} />
      </SedeProvider>
    </div>
  );
}
