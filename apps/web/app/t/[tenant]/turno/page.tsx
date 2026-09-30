import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Loader2 } from 'lucide-react';
import { apiFetch, type TenantSite } from '@/lib/api';
import { TurnoClient } from './_parts/TurnoClient';

type Site = TenantSite & { googleReviewUrl?: string | null; features?: Record<string, boolean> };

async function getSite(tenant: string): Promise<Site | null> {
  try {
    return await apiFetch<Site>('/api/public/site', { tenantSlug: tenant });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }): Promise<Metadata> {
  const { tenant } = await params;
  const site = await getSite(tenant);
  return {
    title: { absolute: `Mi turno | ${site?.tenant.name ?? 'Barbería'}` },
    // Enlace personal con token: no se indexa
    robots: { index: false, follow: false },
  };
}

export default async function TurnoPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center" aria-busy>
          <Loader2 className="animate-spin text-soft" size={28} strokeWidth={1.75} />
        </main>
      }
    >
      <TurnoClient
        tenant={tenant}
        whatsapp={site?.branding?.whatsapp ?? null}
        reviewUrl={site?.googleReviewUrl ?? null}
        logoUrl={site?.branding?.logo_url ?? null}
      />
    </Suspense>
  );
}
