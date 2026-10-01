import type { Metadata } from 'next';
import { apiFetch, type TenantSite } from '@/lib/api';
import { FlowShell, flowMetadata } from '../_site/FlowShell';

export { moodViewport as generateViewport } from '../_site/viewport';

// La página de reserva es de cliente: el título se arma aquí con el nombre de la barbería.
export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }): Promise<Metadata> {
  const { tenant } = await params;
  try {
    const site = await apiFetch<TenantSite>('/api/public/site', { tenantSlug: tenant });
    const title = `Reservar en ${site.tenant.name}`;
    const description = `Elige servicio, barbero y hora en ${site.tenant.name}. Confirmación al instante.`;
    return {
      ...flowMetadata,
      title: { absolute: title },
      description,
      alternates: { canonical: `https://${tenant}.date.pe/reservar` },
      openGraph: { title, description, url: `https://${tenant}.date.pe/reservar`, images: [site.branding?.cover_url ?? '/img/og.jpg'] },
    };
  } catch {
    return { ...flowMetadata, title: 'Reservar' };
  }
}

export default async function ReservarLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return <FlowShell tenant={tenant} start>{children}</FlowShell>;
}
