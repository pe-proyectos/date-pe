import Link from 'next/link';
import type { Metadata } from 'next';
import { SearchX, Sunrise, Sun, Moon } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SearchBar } from '@/components/SearchBar';
import { NearMeButton } from '@/components/NearMeButton';
import { SearchResults, type GeoResult } from '@/components/SearchResults';
import { Toaster } from '@/components/Toaster';
import { DISTRICTS } from '@/lib/districts';

interface Props {
  searchParams: Promise<{ district?: string; service?: string; date?: string; from?: string; lat?: string; lng?: string }>;
}

const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v?: string) => !!v && /^\d{2}:\d{2}$/.test(v);

/** Fecha YYYY-MM-DD en Lima (UTC-5 fijo) desplazada n días. */
function limaDate(offsetDays = 0): string {
  return new Date(Date.now() - 5 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
}
function limaWeekday(): number {
  return new Date(Date.now() - 5 * 3600_000).getUTCDay();
}

const TIMES = [
  { from: '09:00', label: 'Mañana', icon: Sunrise },
  { from: '13:00', label: 'Tarde', icon: Sun },
  { from: '18:00', label: 'Noche', icon: Moon },
] as const;

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
  // "¿Cuándo?": con día (y hora opcional) la API agrega los próximos horarios libres
  const date = isDate(p.date) ? p.date! : isTime(p.from) ? limaDate() : undefined;
  const from = date && isTime(p.from) ? p.from : undefined;
  if (date) qs.set('date', date);
  if (from) qs.set('from', from);

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

  const today = limaDate();
  const tomorrow = limaDate(1);
  const saturday = limaDate((6 - limaWeekday() + 7) % 7);
  const dayChips = [
    { date: today, label: 'Hoy' },
    { date: tomorrow, label: 'Mañana' },
    ...(saturday !== today && saturday !== tomorrow ? [{ date: saturday, label: 'Este sábado' }] : []),
  ];
  const hrefWith = (next: { date?: string; from?: string }) => {
    const q = new URLSearchParams();
    if (p.district) q.set('district', p.district);
    if (p.service) q.set('service', p.service);
    if (user) {
      q.set('lat', String(user.lat));
      q.set('lng', String(user.lng));
    }
    if (next.date) q.set('date', next.date);
    if (next.date && next.from) q.set('from', next.from);
    return `/search${q.toString() ? `?${q}` : ''}`;
  };
  const chipCls = (on: boolean) =>
    `inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-4 text-[15px] transition-colors ${on ? 'bg-ink text-white' : 'bg-field text-ink hover:bg-line'}`;
  const whenLabel = date
    ? `${dayChips.find((d) => d.date === date)?.label.toLowerCase() ?? new Date(`${date}T12:00:00-05:00`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' })}${from ? ` desde las ${from}` : ''}`
    : null;

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
          <SearchBar compact initial={{ district: p.district, service: p.service, date }} />
        </div>

        {/* Atajos de día y hora: muestran los horarios libres de cada barbería */}
        <div className="no-scrollbar -mx-5 mt-5 flex items-center gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0">
          <div className="flex gap-2" role="group" aria-label="Día">
            {dayChips.map((d) => {
              const on = date === d.date;
              return (
                <Link key={d.label} href={hrefWith(on ? {} : { date: d.date, from })} aria-pressed={on} className={chipCls(on)} scroll={false}>
                  {d.label}
                </Link>
              );
            })}
          </div>
          <span className="mx-1 h-6 w-px shrink-0 bg-line" aria-hidden />
          <div className="flex gap-2" role="group" aria-label="Hora">
            {TIMES.map((t) => {
              const on = from === t.from;
              const Icon = t.icon;
              return (
                <Link
                  key={t.from}
                  href={hrefWith(on ? { date } : { date: date ?? today, from: t.from })}
                  aria-pressed={on}
                  aria-label={`${t.label}, desde las ${t.from}`}
                  className={chipCls(on)}
                  scroll={false}
                >
                  <Icon size={16} strokeWidth={1.75} /> {t.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-[clamp(1.75rem,3vw,2.5rem)] font-semibold tracking-[-0.035em]">{heading}</h1>
            {p.service && <span className="text-[15px] text-mute">con {p.service.toLowerCase()}</span>}
            {whenLabel && <span className="text-[15px] text-mute">con horario {whenLabel}</span>}
          </div>
          <NearMeButton params={{ district: p.district, service: p.service, date, from, lat: p.lat, lng: p.lng }} active={!!user} />
        </div>

        {results.length > 0 && <SearchResults results={results} user={user} date={date ?? null} />}

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
