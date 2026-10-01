import { getSite } from './data';
import { fontVars } from './fonts';
import { resolveTheme, flowVars } from './theme';
import { FlowTheme } from './FlowTheme';
import { Track } from './Track';
import './site.css';

/** Envuelve una página de flujo con el ambiente de la barbería (colores y letras). */
export async function FlowShell({ tenant, children, start = false }: { tenant: string; children: React.ReactNode; start?: boolean }) {
  const site = await getSite(tenant);
  const r = resolveTheme(site?.branding?.site_theme, site?.branding?.color_primary);
  const vars = flowVars(r);
  return (
    <div className={`s-flow min-h-dvh ${fontVars}`} data-mood={r.mood.id} style={{ ...(vars as React.CSSProperties), background: r.mood.bg, color: r.mood.ink }}>
      <FlowTheme vars={vars} bg={r.mood.bg} />
      {start && <Track slug={tenant} kind="book_start" />}
      {children}
    </div>
  );
}
