import Link from 'next/link';
import type { Metadata } from 'next';
import { apiFetch, soles, type SearchResult } from '@/lib/api';
import { tenantUrl } from '@/lib/config';
import { SearchBar } from '@/components/SearchBar';

interface Props {
  searchParams: Promise<{ district?: string; service?: string; date?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const p = await searchParams;
  const where = p.district ? ` en ${p.district}` : '';
  return {
    title: `Barberías${where}`,
    description: `Reserva las mejores barberías${where}. Elige barbero, horario y paga tu seña con Yape.`,
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
  } catch {
    results = [];
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
        ← date.pe
      </Link>
      <div className="my-6">
        <SearchBar compact />
      </div>

      <h1 className="text-2xl font-bold">
        {results.length} barbería{results.length === 1 ? '' : 's'}
        {p.district ? ` en ${p.district}` : ''}
      </h1>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {results.map((r) => (
          <a
            key={r.location_id}
            href={tenantUrl(r.slug)}
            className="block overflow-hidden rounded-2xl border border-slate-200 transition hover:border-slate-400"
          >
            <div className="h-32 bg-slate-100">
              {r.cover_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.cover_url} alt={r.name} className="h-full w-full object-cover" />
              )}
            </div>
            <div className="p-4">
              <h2 className="text-lg font-semibold">{r.name}</h2>
              <p className="text-sm text-slate-500">
                {r.location_name} · {r.district}
              </p>
              {r.tagline && <p className="mt-1 text-sm text-slate-600">{r.tagline}</p>}
              <div className="mt-3 flex items-center gap-4 text-sm">
                <span className="font-semibold">Desde {soles(r.desde_cents)}</span>
                {r.rating && <span className="text-amber-600">★ {r.rating}</span>}
                <span className="text-slate-400">{r.barberos} barberos</span>
              </div>
            </div>
          </a>
        ))}
        {results.length === 0 && (
          <p className="text-slate-500">No encontramos barberías con esos filtros. Prueba otra zona.</p>
        )}
      </div>
    </main>
  );
}
