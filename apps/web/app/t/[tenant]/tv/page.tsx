import type { Metadata, Viewport } from 'next';
import { apiFetch, type TenantSite } from '@/lib/api';
import { TvClient } from './_parts/TvClient';

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
  return {
    title: { absolute: `Pantalla | ${site?.tenant.name ?? 'Barbería'}` },
    // Pantalla del local: lleva una llave privada en la URL, no se indexa
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function TvPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ k?: string; sede?: string }> }) {
  const { tenant } = await params;
  const { k, sede } = await searchParams;
  return <TvClient tenant={tenant} tvKey={typeof k === 'string' ? k : ''} sede={typeof sede === 'string' && /^[0-9a-f-]{36}$/i.test(sede) ? sede : null} />;
}
