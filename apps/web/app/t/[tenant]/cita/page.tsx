import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { apiFetch, type TenantSite } from '@/lib/api';
import { CitaClient } from './_parts/CitaClient';

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
    title: { absolute: site ? `Mi reserva | ${site.tenant.name}` : 'Mi reserva' },
    // Página personal (enlace con token): no debe indexarse
    robots: { index: false, follow: false },
  };
}

export default async function CitaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) notFound();
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[60vh] items-center justify-center" aria-busy>
          <Loader2 className="animate-spin text-soft" size={28} strokeWidth={1.75} />
        </main>
      }
    >
      <CitaClient site={site} tenant={tenant} />
    </Suspense>
  );
}
