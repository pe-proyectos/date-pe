import Link from 'next/link';
import type { Metadata } from 'next';
import { SearchX } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SearchBar } from '@/components/SearchBar';
import { NearMeButton } from '@/components/NearMeButton';
import { SearchResults, type GeoResult } from '@/components/SearchResults';
import { Toaster } from '@/components/Toaster';
import { DISTRICTS } from '@/lib/districts';

interface Props {
  searchParams: Promise<{ district?: string; service?: string; date?: string; lat?: string; lng?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const p = await searchParams;
  const what = p.service ? `${p.service} ` : '';
  const where = p.district ? ` en ${p.district}` : p.lat && p.lng ? ' cerca de ti' : ' en Lima';
  return {
    title: `Barberías${where}${what ? ` para ${what.trim().toLowerCase()}` : ''}`,
    description: `Reserva ${what.toLowerCase() || 'tu corte '}en barberías${where}. Elige barbero y hora, y paga el adelanto con Yape.`,
    alternates: { canonical: 'https://date.pe/search' },
    robots: p.district || p.service || p.lat ? { index: false, follow: true } : undefined,
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const p = await searchParams;
  const qs = new URLSearchParams();
  if (p.district) qs.set('district', p.district);
  if (p.service) qs.set('service', p.service);

  // Ubicación del cliente ("Cerca de mí"): la API ordena por distancia y agrega distance_km
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  const user =
    p.lat && p.lng && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  if (user) {
    qs.set('lat', String(user.lat));
    qs.set('lng', String(user.lng));
  }

  let results: GeoResult[] = [];
  let failed = false;
  try {
    results = (await apiFetch<{ results: GeoResult[] }>(`/api/search?${qs.toString()}`)).results;
  } catch {
    failed = true;
  }

  const heading = [
    results.length === 1 ? '1 barbería' : `${results.length} barberías`,
    p.district ? `en ${p.district}` : user ? 'cerca de ti' : 'en Lima',
  ].join(' ');

  return (
    <>
      <Header />
      <Toaster />
      <main className="mx-auto min-h-[70vh] max-w-[1280px] px-5 pb-32 pt-6 md:px-8 lg:pb-24">
        <div className="max-w-[860px]">
          <SearchBar compact initial={{ district: p.district, service: p.service, date: p.date }} />
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-[-0.035em]">{heading}</h1>
            {p.service && <span className="text-[15px] text-mute">con {p.service.toLowerCase()}</span>}
          </div>
          <NearMeButton params={{ district: p.district, service: p.service, date: p.date, lat: p.lat, lng: p.lng }} active={!!user} />
        </div>

        {results.length > 0 && <SearchResults results={results} user={user} />}

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
