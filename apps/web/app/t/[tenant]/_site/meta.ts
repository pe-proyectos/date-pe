import type { Metadata } from 'next';
import { getSite } from './data';

/** Título y descripción de cada página interna, con el logo de la barbería como ícono. */
export async function pageMeta(tenant: string, section: string, path: string, description?: (name: string) => string): Promise<Metadata> {
  const site = await getSite(tenant);
  if (!site) return { title: section };
  const name = site.tenant.name;
  const title = `${section} | ${name}`;
  const desc = description ? description(name) : `${section} de ${name}. Reserva tu cita online.`;
  return {
    title: { absolute: title },
    description: desc,
    ...(site.branding?.logo_url ? { icons: { icon: site.branding.logo_url, apple: site.branding.logo_url } } : {}),
    alternates: { canonical: `https://${tenant}.date.pe${path}` },
    openGraph: { title, description: desc, url: `https://${tenant}.date.pe${path}`, images: [site.branding?.cover_url ?? '/img/og.jpg'] },
  };
}
