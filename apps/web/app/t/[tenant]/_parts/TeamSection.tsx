'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Star, Search, X, ChevronLeft, ChevronRight, UsersRound } from 'lucide-react';
import type { TenantSite } from '@/lib/api';
import { Sheet } from '@/components/Sheet';
import { useSede, reservarHref, type PublicLocation } from './sede';

type Staff = TenantSite['staff'][number];

const SMALL = 4;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const worksIn = (b: Staff, sede: string | null) => !sede || !b.location_id || b.location_id === sede;

/**
 * Equipo: grilla limpia para equipos chicos; carrusel con "Ver todo el equipo"
 * (buscador y filtro por sede) cuando son muchos.
 */
export function TeamSection({ staff, available }: { staff: Staff[]; available: boolean }) {
  const { locations, multi, sede, setSede } = useSede();
  const [sheet, setSheet] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => staff.filter((b) => worksIn(b, sede)), [staff, sede]);
  const sedeName = locations.find((l) => l.id === sede)?.name;
  const big = shown.length > SMALL;

  const nudge = (dir: 1 | -1) => {
    const box = scroller.current;
    if (box) box.scrollBy({ left: dir * box.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section id="equipo" className="scroll-mt-24 border-b border-line py-10">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[26px] font-semibold tracking-[-0.03em]">Equipo</h2>
          <p className="mt-0.5 text-[15px] text-mute">
            {shown.length} {shown.length === 1 ? 'barbero' : 'barberos'}
            {sedeName ? ` en ${sedeName}` : multi ? ` en ${locations.length} sedes` : ''}
          </p>
        </div>
        {big && (
          <div className="hidden shrink-0 gap-2 md:flex">
            <button type="button" onClick={() => nudge(-1)} aria-label="Anteriores" className="flex h-10 w-10 items-center justify-center rounded-full border border-line hover:border-ink">
              <ChevronLeft size={18} strokeWidth={1.75} />
            </button>
            <button type="button" onClick={() => nudge(1)} aria-label="Siguientes" className="flex h-10 w-10 items-center justify-center rounded-full border border-line hover:border-ink">
              <ChevronRight size={18} strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="mt-6 rounded-xl bg-field p-6 text-center">
          <UsersRound size={22} strokeWidth={1.75} className="mx-auto text-mute" />
          <p className="mt-2 text-[15px] text-mute">Aún no hay barberos publicados en {sedeName ?? 'esta sede'}.</p>
          <button type="button" onClick={() => setSede(null)} className="mt-4 inline-flex min-h-[44px] items-center rounded-full border border-line bg-white px-5 text-[15px] font-medium hover:border-ink">
            Ver todas las sedes
          </button>
        </div>
      ) : big ? (
        <>
          <div ref={scroller} className="no-scrollbar -mx-5 mt-6 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:scroll-px-0 md:px-0">
            {shown.map((b) => (
              <div key={b.id} className="w-[44%] min-w-[148px] max-w-[220px] shrink-0 snap-start sm:w-[30%]">
                <Card b={b} available={available} sede={sede} locations={multi ? locations : null} chips={2} />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border border-ink px-6 text-[15px] font-medium transition-colors hover:bg-ink hover:text-white sm:w-auto"
          >
            <UsersRound size={17} strokeWidth={1.75} /> Ver todo el equipo ({staff.length})
          </button>
        </>
      ) : (
        <div className={`mt-6 grid grid-cols-2 gap-x-4 gap-y-6 ${shown.length === 3 ? 'sm:grid-cols-3' : shown.length === 4 ? 'sm:grid-cols-4' : ''}`}>
          {shown.map((b) => (
            <Card key={b.id} b={b} available={available} sede={sede} locations={multi ? locations : null} chips={3} />
          ))}
        </div>
      )}

      {big && <TeamSheet open={sheet} onClose={() => setSheet(false)} staff={staff} available={available} />}
    </section>
  );
}

function TeamSheet({ open, onClose, staff, available }: { open: boolean; onClose: () => void; staff: Staff[]; available: boolean }) {
  const { locations, multi, sede } = useSede();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string | null>(sede);
  const [wasOpen, setWasOpen] = useState(open);
  // Al abrir parte de la sede elegida en la página
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFilter(sede);
      setQ('');
    }
  }

  const query = norm(q.trim());
  const list = staff.filter(
    (b) => worksIn(b, filter) && (!query || norm(`${b.name} ${b.bio ?? ''} ${(b.specialties ?? []).join(' ')}`).includes(query)),
  );

  return (
    <Sheet open={open} onClose={onClose} title={`Equipo (${staff.length})`} full>
      <label className="relative flex items-center">
        <Search size={18} strokeWidth={1.75} className="pointer-events-none absolute left-4 text-soft" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o especialidad"
          aria-label="Buscar barbero"
          enterKeyHint="search"
          className="h-12 w-full min-w-0 rounded-full bg-field pl-11 pr-12 text-[16px] outline-none placeholder:text-soft focus:bg-white focus:ring-2 focus:ring-ink [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label="Borrar búsqueda" className="absolute right-1 flex h-10 w-10 items-center justify-center rounded-full text-mute hover:text-ink">
            <X size={18} strokeWidth={1.75} />
          </button>
        )}
      </label>

      {multi && (
        <div className="no-scrollbar -mx-5 mt-3 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 md:-mx-6 md:scroll-px-6 md:px-6">
          {[{ id: null as string | null, name: 'Todas' }, ...locations].map((l) => {
            const on = filter === l.id;
            return (
              <button
                key={l.id ?? 'all'}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(l.id)}
                className={`flex h-10 shrink-0 snap-start items-center whitespace-nowrap rounded-full px-4 text-[14px] font-medium transition-colors ${on ? 'bg-ink text-white' : 'bg-field hover:bg-line'}`}
              >
                {l.name}
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-[14px] text-mute" aria-live="polite">
        {list.length === 0 ? 'Nadie coincide con tu búsqueda.' : `${list.length} ${list.length === 1 ? 'barbero' : 'barberos'}`}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-6">
        {list.map((b) => (
          <Card key={b.id} b={b} available={available} sede={filter} locations={multi ? locations : null} chips={3} />
        ))}
      </div>
    </Sheet>
  );
}

function Card({ b, available, sede, locations, chips }: { b: Staff; available: boolean; sede: string | null; locations: PublicLocation[] | null; chips: number }) {
  const where = locations ? (b.location_id ? locations.find((l) => l.id === b.location_id)?.name : 'Todas las sedes') : null;
  const href = reservarHref({ barbero: b.id, sede: b.location_id ?? sede });
  const specialties = (b.specialties ?? []).filter(Boolean);
  const inner = (
    <>
      <div className="zoom-media aspect-square rounded-xl bg-field">
        {b.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.photo_url} alt={b.name} width={320} height={320} loading="lazy" decoding="async" className="h-full w-full rounded-xl object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl font-semibold text-line-2">{b.name.charAt(0)}</div>
        )}
      </div>
      <div className="mt-3 flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-[16px] font-medium">{b.name}</span>
        {b.rating_count > 0 && (
          <span className="tnum flex shrink-0 items-center gap-1 text-[14px]">
            <Star size={13} strokeWidth={0} className="fill-ink" /> {Number(b.rating_avg).toFixed(1)}
            <span className="text-soft">({b.rating_count})</span>
          </span>
        )}
      </div>
      {where && <p className="truncate text-[13px] text-soft">{where}</p>}
      {specialties.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {specialties.slice(0, chips).map((t) => (
            <span key={t} className="rounded-full bg-field px-2.5 py-1 text-[12px] font-medium text-ink-2">
              {t}
            </span>
          ))}
          {specialties.length > chips && <span className="px-1 py-1 text-[12px] text-soft">+{specialties.length - chips}</span>}
        </div>
      ) : (
        b.bio && <p className="mt-1 line-clamp-2 text-[14px] text-mute">{b.bio}</p>
      )}
    </>
  );
  return available ? (
    <Link href={href} className="group block min-w-0" aria-label={`Reservar con ${b.name}`}>
      {inner}
    </Link>
  ) : (
    <div className="min-w-0">{inner}</div>
  );
}
