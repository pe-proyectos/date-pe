import { getSite } from './data';
import { fontVars } from './fonts';
import { resolveTheme, flowVars } from './theme';
import { FlowTheme } from './FlowTheme';
import { Track } from './Track';
import { AppInstall } from './AppInstall';
import { INSTALL_CAPTURE } from '@/lib/install';
import './site.css';

/** Envuelve una página de flujo con el ambiente de la barbería (colores y letras). */
export async function FlowShell({ tenant, children, start = false }: { tenant: string; children: React.ReactNode; start?: boolean }) {
  const site = await getSite(tenant);
  const r = resolveTheme(site?.branding?.site_theme, site?.branding?.color_primary);
  const vars = flowVars(r);
  return (
    <div className={`s-flow min-h-dvh ${fontVars}`} data-mood={r.mood.id} style={{ ...(vars as React.CSSProperties), background: r.mood.bg, color: r.mood.ink }}>
      <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE }} />
      <FlowTheme vars={vars} bg={r.mood.bg} />
      {start && <Track slug={tenant} kind="book_start" />}
      {children}
      {site && <AppInstall slug={tenant} shop={site.tenant.name} logo={site.branding?.logo_url ?? null} auto={false} />}
    </div>
  );
}

/** Las páginas de flujo también se pueden agregar al inicio (en iPhone, para recibir avisos). */
export const flowMetadata = { manifest: '/manifest', appleWebApp: { capable: true, statusBarStyle: 'default' as const } };
