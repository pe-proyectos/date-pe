import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Store } from 'lucide-react';
import { apiFetch, type SearchResult } from '@/lib/api';
import { DISTRICTS, DISTRICT_PHOTOS, findDistrict } from '@/lib/districts';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
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
  const title = `Barberías en ${d.name}: reserva online`;
  const description = `Barberías en ${d.name}, ${d.provinceName}. Mira precios en soles, elige barbero y hora, y confirma tu cita pagando el adelanto con Yape.`;
  const url = `https://date.pe/barberias/${d.province}/${d.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, images: [DISTRICT_PHOTOS[d.slug] ?? '/img/og.jpg'] },
  };
}

export default async function DistrictPage({ params }: { params: Promise<{ provincia: string; distrito: string }> }) {
  const { provincia, distrito } = await params;
  const d = findDistrict(provincia, distrito);
  if (!d) notFound();

  let results: SearchResult[] = [];
  try {
    results = (await apiFetch<{ results: SearchResult[] }>(`/api/search?district=${encodeURIComponent(d.name)}`, { revalidate: 3600 })).results;
  } catch {
    results = [];
  }

  const url = `https://date.pe/barberias/${d.province}/${d.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'date.pe', item: 'https://date.pe' },
          { '@type': 'ListItem', position: 2, name: 'Barberías', item: 'https://date.pe/search' },
          { '@type': 'ListItem', position: 3, name: d.name, item: url },
        ],
      },
      {
        '@type': 'CollectionPage',
        name: `Barberías en ${d.name}`,
        url,
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: results.map((r, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            item: {
              '@type': 'HairSalon',
              name: r.name,
              url: `https://${r.slug}.date.pe`,
              address: { '@type': 'PostalAddress', addressLocality: r.district ?? d.name, addressRegion: d.provinceName, addressCountry: 'PE' },
            },
          })),
        },
      },
    ],
  };

  const photo = DISTRICT_PHOTOS[d.slug];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Header />
      <main>
        <section className="mx-auto grid max-w-[1280px] items-end gap-10 px-5 pb-12 pt-8 md:px-8 lg:grid-cols-12">
          <div className={photo ? 'lg:col-span-7' : 'lg:col-span-12'}>
            <nav aria-label="Ruta" className="flex flex-wrap items-center gap-2 text-[14px] text-mute">
              <Link href="/" className="hover:text-ink">date.pe</Link>
              <span aria-hidden className="h-1 w-1 rounded-full bg-line-2" />
              <Link href="/search" className="hover:text-ink">Barberías</Link>
              <span aria-hidden className="h-1 w-1 rounded-full bg-line-2" />
              <span className="text-ink">{d.name}</span>
            </nav>
            <h1 className="mt-5 text-[clamp(2.5rem,5.5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.04em]">
              Barberías en {d.name}
            </h1>
            <p className="mt-5 max-w-[36rem] text-[18px] leading-relaxed text-mute">
              Compara precios en soles, elige a tu barbero y reserva la hora que te queda. Confirmas pagando un adelanto con Yape o Plin.
            </p>
            <div className="mt-8 max-w-[760px]">
              <SearchBar compact initial={{ district: d.name }} />
            </div>
          </div>
          {photo && (
            <div className="hidden lg:col-span-5 lg:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt={d.name} fetchPriority="high" className="aspect-[4/3] w-full rounded-xl object-cover" />
            </div>
          )}
        </section>

        <section className="mx-auto max-w-[1280px] px-5 pb-20 md:px-8">
          <h2 className="border-t border-line pt-10 text-[22px] font-semibold tracking-[-0.03em]">
            {results.length === 1 ? '1 barbería' : `${results.length} barberías`} en {d.name}
          </h2>
          {results.length > 0 ? (
            <div className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {results.map((r) => (
                <div key={r.location_id} data-reveal>
                  <ShopCard r={r} />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-8 flex max-w-xl items-start gap-4">
              <Store size={28} strokeWidth={1.5} className="mt-1 shrink-0 text-soft" />
              <div>
                <p className="text-[18px] font-medium tracking-[-0.02em]">Aún no hay barberías de {d.name} en date.pe.</p>
                <p className="mt-1 text-[16px] text-mute">Si tienes una, créala en minutos y aparece aquí.</p>
                <Link href="/join" className="mt-5 inline-block rounded-full bg-ink px-5 py-3 text-[15px] font-medium text-white">Registra tu barbería</Link>
              </div>
            </div>
          )}

          <div className="mt-20">
            <h3 className="text-[15px] font-medium text-mute">Otros distritos de Lima</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {DISTRICTS.filter((x) => x.slug !== d.slug).map((x) => (
                <Link key={x.slug} href={`/barberias/${x.province}/${x.slug}`} className="rounded-full bg-field px-4 py-2 text-[14px] transition-colors hover:bg-line">
                  {x.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
