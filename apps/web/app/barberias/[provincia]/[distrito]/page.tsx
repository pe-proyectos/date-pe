import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiFetch, type SearchResult } from '@/lib/api';
import { DISTRICTS, findDistrict } from '@/lib/districts';
import { Header, Footer } from '@/components/site';
import { ShopCard } from '@/components/ShopCard';
import { SearchBar } from '@/components/SearchBar';

export const revalidate = 3600;

export function generateStaticParams() {
  return DISTRICTS.map((d) => ({ provincia: d.province, distrito: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ provincia: string; distrito: string }> }): Promise<Metadata> {
  const { provincia, distrito } = await params;
  const d = findDistrict(provincia, distrito);
  if (!d) return { title: 'Barberías' };
  const title = `Barberías en ${d.name}, ${d.provinceName} — Reserva online`;
  const description = `Las mejores barberías en ${d.name}. Reserva tu corte online, elige barbero y horario, paga tu seña con Yape. Rápido y sin llamadas.`;
  const url = `https://date.pe/barberias/${d.province}/${d.slug}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, images: ['/brand/og.png'] } };
}

export default async function DistrictPage({ params }: { params: Promise<{ provincia: string; distrito: string }> }) {
  const { provincia, distrito } = await params;
  const d = findDistrict(provincia, distrito);
  if (!d) notFound();

  let results: SearchResult[] = [];
  try {
    const data = await apiFetch<{ results: SearchResult[] }>(`/api/search?district=${encodeURIComponent(d.name)}`, { revalidate: 3600 });
    results = data.results;
  } catch { results = []; }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Barberías en ${d.name}`,
    description: `Directorio de barberías en ${d.name}, ${d.provinceName}.`,
    url: `https://date.pe/barberias/${d.province}/${d.slug}`,
    hasPart: results.map((r) => ({
      '@type': 'HairSalon',
      name: r.name,
      address: { '@type': 'PostalAddress', addressLocality: r.district ?? d.name, addressRegion: d.provinceName, addressCountry: 'PE' },
      ...(r.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: r.rating } } : {}),
    })),
  };

  return (
    <>
      <Header />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="relative overflow-hidden">
        <div className="mesh-light absolute inset-0 -z-10" />
        <div className="mx-auto max-w-6xl px-6 pb-8 pt-14">
          <nav className="mb-4 text-sm text-slate-500">
            <Link href="/" className="hover:text-slate-900">Inicio</Link> ·{' '}
            <Link href="/search" className="hover:text-slate-900">Barberías</Link> · <span className="text-slate-900">{d.name}</span>
          </nav>
          <h1 className="max-w-3xl text-4xl font-bold md:text-5xl">
            Barberías en <span className="text-gradient">{d.name}</span>
          </h1>
          <p className="mt-3 max-w-xl text-lg text-slate-600">
            Reserva tu corte en {d.name} en segundos. Elige barbero, horario y paga tu seña con Yape.
          </p>
          <div className="mt-8 max-w-3xl"><SearchBar compact /></div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <h2 className="mb-6 text-xl font-bold">{results.length} barbería{results.length === 1 ? '' : 's'} en {d.name}</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {results.map((r) => <ShopCard key={r.location_id} r={r} />)}
        </div>
        {results.length === 0 && (
          <div className="glass rounded-3xl p-10 text-center">
            <p className="text-slate-600">Aún no hay barberías registradas en {d.name}.</p>
            <Link href="/join" className="btn-primary mt-4 inline-block rounded-xl px-6 py-3 font-semibold">¿Tienes una? Regístrala</Link>
          </div>
        )}

        {/* Enlaces a otros distritos (interlinking SEO) */}
        <div className="mt-14">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Otras zonas</h3>
          <div className="flex flex-wrap gap-2">
            {DISTRICTS.filter((x) => x.slug !== d.slug).slice(0, 12).map((x) => (
              <Link key={x.slug} href={`/barberias/${x.province}/${x.slug}`} className="rounded-full glass px-4 py-1.5 text-sm hover:text-brand">
                {x.name}
              </Link>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </>
  );
}
