import type { Metadata } from 'next';
import { apiFetch, type TenantSite } from '@/lib/api';
import { FilaClient } from './_parts/FilaClient';

async function getSite(tenant: string): Promise<TenantSite | null> {
  try {
    return await apiFetch<TenantSite>('/api/public/site', { tenantSlug: tenant });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }): Promise<Metadata> {
  const { tenant } = await params;
  const site = await getSite(tenant);
  const name = site?.tenant.name ?? 'Barbería';
  const title = `Saca tu turno | ${name}`;
  const description = `Fila virtual de ${name}: saca tu turno desde el celular y te avisamos cuando te toque.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `https://${tenant}.date.pe/fila` },
    openGraph: { title, description, url: `https://${tenant}.date.pe/fila`, images: [site?.branding?.cover_url ?? '/img/og.jpg'] },
    appleWebApp: { capable: true, title: name, statusBarStyle: 'default' },
  };
}

export default async function FilaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  return <FilaClient tenant={tenant} logoUrl={site?.branding?.logo_url ?? null} coverUrl={site?.branding?.cover_url ?? null} />;
}
