import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiFetch, soles, type TenantSite } from '@/lib/api';

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
  if (!site) return { title: 'Barbería' };
  return {
    title: `${site.tenant.name} — Reserva online`,
    description: site.branding?.tagline ?? `Reserva tu cita en ${site.tenant.name}.`,
  };
}

export default async function TenantHome({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) notFound();

  const primary = site.branding?.color_primary ?? '#0f172a';

  return (
    <main style={{ ['--brand' as string]: primary }}>
      {/* Hero con branding del tenant (white-label) */}
      <section className="relative text-white" style={{ backgroundColor: primary }}>
        {site.branding?.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={site.branding.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        )}
        <div className="relative mx-auto max-w-4xl px-6 py-20">
          {site.branding?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.branding.logo_url} alt={site.tenant.name} className="mb-4 h-16 w-16 rounded-full object-cover" />
          )}
          <h1 className="text-4xl font-bold md:text-5xl">{site.tenant.name}</h1>
          {site.branding?.tagline && <p className="mt-3 text-lg text-white/80">{site.branding.tagline}</p>}
          <Link
            href="/reservar"
            className="mt-8 inline-block rounded-xl bg-white px-8 py-3 font-semibold text-slate-900 hover:bg-slate-200"
          >
            Reservar cita
          </Link>
        </div>
      </section>

      {/* Servicios */}
      <section className="mx-auto max-w-4xl px-6 py-14">
        <h2 className="text-2xl font-bold">Servicios</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {site.services.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-5">
              <div>
                <h3 className="font-semibold">{s.name}</h3>
                {s.description && <p className="text-sm text-slate-500">{s.description}</p>}
                <p className="mt-1 text-xs text-slate-400">{s.duration_min} min</p>
              </div>
              <span className="text-lg font-bold">{soles(s.price_cents)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Barberos */}
      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-4xl px-6 py-14">
          <h2 className="text-2xl font-bold">Nuestro equipo</h2>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {site.staff.map((b) => (
              <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                <div className="mx-auto mb-3 h-20 w-20 overflow-hidden rounded-full bg-slate-200">
                  {b.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.photo_url} alt={b.name} className="h-full w-full object-cover" />
                  )}
                </div>
                <h3 className="font-semibold">{b.name}</h3>
                {b.bio && <p className="text-xs text-slate-500">{b.bio}</p>}
                {b.rating_count > 0 && <p className="mt-1 text-xs text-amber-600">★ {b.rating_avg}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="text-white" style={{ backgroundColor: primary }}>
        <div className="mx-auto max-w-4xl px-6 py-14 text-center">
          <h2 className="text-2xl font-bold">¿Listo para tu corte?</h2>
          <Link
            href="/reservar"
            className="mt-6 inline-block rounded-xl bg-white px-8 py-3 font-semibold text-slate-900 hover:bg-slate-200"
          >
            Reservar ahora
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-4xl px-6 py-8 text-center text-xs text-slate-400">
        {site.tenant.name} · Reservas con date.pe
      </footer>
    </main>
  );
}
