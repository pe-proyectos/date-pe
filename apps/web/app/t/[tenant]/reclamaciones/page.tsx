import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { apiFetch, type TenantSite } from '@/lib/api';
import { onColor } from '@/lib/color';
import { LibroReclamaciones } from '@/components/LibroReclamaciones';

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
  const title = `Libro de Reclamaciones | ${name}`;
  return {
    title: { absolute: title },
    description: `Libro de Reclamaciones virtual de ${name}. Registra un reclamo o una queja y recibe la constancia en tu correo.`,
    alternates: { canonical: `https://${tenant}.date.pe/reclamaciones` },
  };
}

export default async function TenantReclamaciones({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  const name = site?.tenant.name ?? 'la barbería';
  const accent = site?.branding?.color_primary ?? '#0a0a0a';

  return (
    <div className="min-h-dvh bg-white">
      <header className="pt-safe border-b border-line print:hidden">
        <div className="mx-auto flex h-16 max-w-[760px] items-center justify-between gap-3 px-5 md:px-8">
          <Link href="/" className="flex min-h-[44px] min-w-0 items-center gap-2.5 text-[15px] text-mute hover:text-ink">
            <ArrowLeft size={18} strokeWidth={1.75} className="shrink-0" />
            {site?.branding?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={site.branding.logo_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
            ) : site ? (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold" style={{ background: accent, color: onColor(accent) }}>
                {site.tenant.name.replace(/^Barber[ií]a\s+/i, '').charAt(0)}
              </span>
            ) : null}
            <span className="truncate font-medium text-ink">{site?.tenant.name ?? 'Volver'}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-5 pb-20 pt-8 md:px-8 md:pt-12 print:max-w-none print:p-0">
        <div className="print:hidden">
          <h1 className="text-[clamp(2rem,6vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.035em]">Libro de Reclamaciones</h1>
          <p className="mt-3 text-[17px] text-mute">
            Conforme al Código de Protección y Defensa del Consumidor, {name} pone a tu disposición este Libro de Reclamaciones virtual.
          </p>
        </div>
        <div className="mt-8 print:mt-0">
          <LibroReclamaciones tenantSlug={tenant} accent={accent} />
        </div>
      </main>

      <footer className="border-t border-line print:hidden">
        <div className="mx-auto flex max-w-[760px] flex-wrap gap-x-6 gap-y-2 px-5 py-8 text-[14px] text-soft md:px-8">
          <a href="https://date.pe/privacidad" className="hover:text-ink">Privacidad</a>
          <a href="https://date.pe/terminos" className="hover:text-ink">Términos</a>
        </div>
      </footer>
    </div>
  );
}
