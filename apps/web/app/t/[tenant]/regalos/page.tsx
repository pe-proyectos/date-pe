import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { apiFetch, type TenantSite } from '@/lib/api';
import { RegalosClient } from './_parts/RegalosClient';
import type { Shop } from './_parts/types';

async function getSite(tenant: string): Promise<TenantSite | null> {
  try {
    return await apiFetch<TenantSite>('/api/public/site', { tenantSlug: tenant });
  } catch {
    return null;
  }
}

async function getShop(tenant: string): Promise<Shop | null> {
  try {
    return await apiFetch<Shop>('/api/public/shop', { tenantSlug: tenant });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }): Promise<Metadata> {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) return { title: 'Regalos' };
  const title = `Regalos | ${site.tenant.name}`;
  const description = `Regala una gift card o un paquete de cortes en ${site.tenant.name}. Llega por correo, lista para usar al reservar.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `https://${tenant}.date.pe/regalos` },
    openGraph: { title, description, url: `https://${tenant}.date.pe/regalos`, images: [site.branding?.cover_url ?? '/img/og.jpg'] },
  };
}

export default async function RegalosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const [site, shop] = await Promise.all([getSite(tenant), getShop(tenant)]);
  if (!site) notFound();
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[60vh] items-center justify-center" aria-busy>
          <Loader2 className="animate-spin text-soft" size={28} strokeWidth={1.75} />
        </main>
      }
    >
      <RegalosClient tenant={tenant} site={site} shop={shop ?? { packages: [], services: [], giftCards: null }} />
    </Suspense>
  );
}
