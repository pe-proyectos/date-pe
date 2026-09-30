import Link from 'next/link';
import type { Metadata } from 'next';
import { SearchX } from 'lucide-react';
import { apiFetch, type SearchResult } from '@/lib/api';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ShopCard } from '@/components/ShopCard';
import { SearchBar } from '@/components/SearchBar';
import { DISTRICTS } from '@/lib/districts';

interface Props {
  searchParams: Promise<{ district?: string; service?: string; date?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const p = await searchParams;
  const what = p.service ? `${p.service} ` : '';
  const where = p.district ? ` en ${p.district}` : ' en Lima';
  return {
    title: `Barberías${where}${what ? ` para ${what.trim().toLowerCase()}` : ''}`,
    description: `Reserva ${what.toLowerCase() || 'tu corte '}en barberías${where}. Elige barbero y hora, y paga el adelanto con Yape.`,
    alternates: { canonical: 'https://date.pe/search' },
    robots: p.district || p.service ? { index: false, follow: true } : undefined,
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const p = await searchParams;
  const qs = new URLSearchParams();
  if (p.district) qs.set('district', p.district);
  if (p.service) qs.set('service', p.service);

  let results: SearchResult[] = [];
  let failed = false;
  try {
    results = (await apiFetch<{ results: SearchResult[] }>(`/api/search?${qs.toString()}`)).results;
  } catch {
    failed = true;
  }

  const heading = [
    results.length === 1 ? '1 barbería' : `${results.length} barberías`,
    p.district ? `en ${p.district}` : 'en Lima',
  ].join(' ');

  return (
    <>
      <Header />
      <main className="mx-auto min-h-[70vh] max-w-[1280px] px-5 pb-24 pt-6 md:px-8">
        <div className="max-w-[860px]">
          <SearchBar compact initial={{ district: p.district, service: p.service, date: p.date }} />
        </div>

        <div className="mt-10 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-[-0.035em]">{heading}</h1>
          {p.service && <span className="text-[15px] text-mute">con {p.service.toLowerCase()}</span>}
        </div>

        {results.length > 0 && (
          <div className="mt-8 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {results.map((r, i) => (
              <div key={r.location_id} data-reveal>
                <ShopCard r={r} />
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && (
          <div className="mt-10 max-w-xl">
            <SearchX size={32} strokeWidth={1.5} className="text-soft" />
            <p className="mt-4 text-[19px] font-medium tracking-[-0.02em]">
              {failed ? 'No pudimos cargar los resultados.' : `Todavía no hay barberías ${p.district ? `en ${p.district}` : 'con esos filtros'}.`}
            </p>
            <p className="mt-2 text-[16px] text-mute">
              {failed ? 'Intenta de nuevo en unos segundos.' : 'Prueba un distrito cercano o quita el filtro de servicio.'}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {DISTRICTS.filter((d) => d.name !== p.district).slice(0, 8).map((d) => (
                <Link key={d.slug} href={`/search?district=${encodeURIComponent(d.name)}`} className="rounded-full border border-line px-4 py-2 text-[14px] hover:border-ink">
                  {d.name}
                </Link>
              ))}
            </div>
            <p className="mt-10 text-[15px] text-mute">
              ¿Tienes una barbería en la zona?{' '}
              <Link href="/join" className="font-medium text-ink underline">Regístrala</Link>
            </p>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
