import type { Metadata } from 'next';
import { apiFetch, type SearchResult } from '@/lib/api';
import { Header, Footer } from '@/components/site';
import { ShopCard } from '@/components/ShopCard';
import { SearchBar } from '@/components/SearchBar';
import Link from 'next/link';

interface Props {
  searchParams: Promise<{ district?: string; service?: string; date?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const p = await searchParams;
  const where = p.district ? ` en ${p.district}` : '';
  return {
    title: `Barberías${where}`,
    description: `Reserva las mejores barberías${where}. Elige barbero, horario y paga tu seña con Yape.`,
    alternates: { canonical: 'https://date.pe/search' },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const p = await searchParams;
  const qs = new URLSearchParams();
  if (p.district) qs.set('district', p.district);
  if (p.service) qs.set('service', p.service);

  let results: SearchResult[] = [];
  try {
    const data = await apiFetch<{ results: SearchResult[] }>(`/api/search?${qs.toString()}`);
    results = data.results;
  } catch { results = []; }

  return (
    <>
      <Header />
      <section className="relative overflow-hidden">
        <div className="mesh-light absolute inset-0 -z-10" />
        <div className="mx-auto max-w-6xl px-6 pb-6 pt-12">
          <h1 className="text-3xl font-bold md:text-4xl">
            {results.length} barbería{results.length === 1 ? '' : 's'}
            {p.district ? <> en <span className="text-gradient">{p.district}</span></> : ''}
          </h1>
          <div className="mt-6 max-w-3xl"><SearchBar compact /></div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-5 md:grid-cols-3">
          {results.map((r) => <ShopCard key={r.location_id} r={r} />)}
        </div>
        {results.length === 0 && (
          <div className="glass rounded-3xl p-12 text-center">
            <p className="text-lg text-slate-600">No encontramos barberías con esos filtros.</p>
            <p className="mt-1 text-sm text-slate-400">Prueba otra zona o servicio.</p>
            <Link href="/" className="btn-primary mt-6 inline-block rounded-xl px-6 py-3 font-semibold">Volver al inicio</Link>
          </div>
        )}
      </section>
      <Footer />
    </>
  );
}
