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
  const title = `${site.tenant.name} — Reserva online`;
  const description = site.branding?.tagline ?? `Reserva tu cita en ${site.tenant.name} en segundos.`;
  return { title, description, openGraph: { title, description, images: site.branding?.cover_url ? [site.branding.cover_url] : ['/brand/og.png'] } };
}

export default async function TenantHome({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const site = await getSite(tenant);
  if (!site) notFound();

  const primary = site.branding?.color_primary ?? '#6366f1';
  const loc = site.locations[0];
  const rating = site.rating?.avg;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HairSalon',
    name: site.tenant.name,
    description: site.branding?.tagline ?? undefined,
    image: site.branding?.cover_url ?? site.branding?.logo_url ?? undefined,
    url: `https://${tenant}.date.pe`,
    telephone: loc?.phone ?? undefined,
    address: loc ? { '@type': 'PostalAddress', streetAddress: loc.address ?? undefined, addressLocality: loc.district ?? undefined, addressRegion: loc.province ?? undefined, addressCountry: 'PE' } : undefined,
    ...(rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating, reviewCount: site.rating?.count } } : {}),
    priceRange: 'S/',
  };

  return (
    <main style={{ ['--brand' as string]: primary }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero */}
      <section className="relative overflow-hidden text-white" style={{ backgroundColor: primary }}>
        {site.branding?.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={site.branding.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
        )}
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent, ${primary})` }} />
        <div className="relative mx-auto max-w-5xl px-6 py-24">
          {site.branding?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={site.branding.logo_url} alt={site.tenant.name} className="mb-5 h-20 w-20 rounded-2xl object-cover shadow-xl ring-1 ring-white/20" />
          )}
          <h1 className="text-4xl font-bold md:text-6xl">{site.tenant.name}</h1>
          {site.branding?.tagline && <p className="mt-3 max-w-xl text-lg text-white/80">{site.branding.tagline}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-white/80">
            {rating && <span className="rounded-full bg-white/15 px-3 py-1">★ {rating} ({site.rating?.count})</span>}
            {loc && <span>📍 {loc.district}{loc.address ? ` · ${loc.address}` : ''}</span>}
          </div>
          <Link href="/reservar" className="mt-8 inline-flex rounded-2xl bg-white px-8 py-3.5 font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5">
            Reservar cita →
          </Link>
        </div>
      </section>

      {/* Servicios */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-bold">Servicios</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {site.services.map((s) => (
            <div key={s.id} className="glass card-hover flex items-center justify-between rounded-2xl p-5">
              <div>
                <h3 className="font-semibold">{s.name}</h3>
                {s.description && <p className="text-sm text-slate-500">{s.description}</p>}
                <p className="mt-1 text-xs text-slate-400">{s.duration_min} min</p>
              </div>
              <span className="text-lg font-bold" style={{ color: primary }}>{soles(s.price_cents)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Equipo */}
      <section className="border-t border-slate-100 bg-slate-50/60">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-bold">Nuestro equipo</h2>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {site.staff.map((b) => (
              <div key={b.id} className="glass rounded-2xl p-5 text-center">
                <div className="mx-auto mb-3 h-24 w-24 overflow-hidden rounded-full bg-slate-200 ring-2 ring-white">
                  {b.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.photo_url} alt={b.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center font-display text-2xl font-bold text-slate-400">{b.name.charAt(0)}</div>
                  )}
                </div>
                <h3 className="font-semibold">{b.name}</h3>
                {b.specialties && b.specialties.length > 0 && <p className="text-xs text-slate-500">{b.specialties.join(' · ')}</p>}
                {b.rating_count > 0 && <p className="mt-1 text-xs text-amber-600">★ {b.rating_avg}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reseñas */}
      {site.reviews && site.reviews.length > 0 && (
        <section className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-bold">Lo que dicen los clientes</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {site.reviews.map((r, i) => (
              <div key={i} className="glass rounded-2xl p-5">
                <div className="text-amber-500">{'★'.repeat(r.stars)}<span className="text-slate-200">{'★'.repeat(5 - r.stars)}</span></div>
                <p className="mt-2 text-sm text-slate-600">“{r.comment}”</p>
                {r.staff_name && <p className="mt-2 text-xs text-slate-400">con {r.staff_name}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA final */}
      <section className="text-white" style={{ backgroundColor: primary }}>
        <div className="mx-auto max-w-5xl px-6 py-16 text-center">
          <h2 className="text-3xl font-bold">¿Listo para tu corte?</h2>
          <Link href="/reservar" className="mt-6 inline-block rounded-2xl bg-white px-8 py-3.5 font-semibold text-slate-900 hover:-translate-y-0.5">
            Reservar ahora
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-6 py-8 text-center text-xs text-slate-400">
        {site.tenant.name} · Reservas con <a href="https://date.pe" className="hover:text-slate-600">date.pe</a>
      </footer>

      {/* Barra fija de reserva (móvil) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/reservar" className="block rounded-xl py-3 text-center font-semibold text-white" style={{ backgroundColor: primary }}>
          Reservar cita
        </Link>
      </div>

      {/* WhatsApp de contacto */}
      {site.branding?.whatsapp && (
        <a
          href={`https://wa.me/${site.branding.whatsapp.replace(/[^0-9]/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-20 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 md:bottom-5"
          aria-label="WhatsApp"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.03c-.24.68-1.4 1.3-1.94 1.35-.5.05-1.13.07-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-2.99 0-1.42.75-2.12 1.01-2.41.26-.29.57-.36.76-.36.19 0 .38.002.55.01.18.008.41-.067.64.49.24.57.81 1.97.88 2.11.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.19-.28.37-.23.62-.14.25.09 1.61.76 1.89.9.28.14.46.21.53.33.07.12.07.68-.17 1.36Z"/></svg>
        </a>
      )}
    </main>
  );
}
