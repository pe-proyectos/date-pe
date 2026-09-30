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

  const solo = shown.length === 1 ? shown[0] : null;
  return (
    <div>
      {multi && (
        <p className="s-mute mt-3 text-[15px]">
          {shown.length} {shown.length === 1 ? 'barbero' : 'barberos'}
          {sedeName ? ` en ${sedeName}` : ` en ${locations.length} sedes`}
        </p>
      )}
      {big && (
        <div className="-mt-12 mb-6 hidden justify-end gap-2 md:flex">
          <button type="button" onClick={() => nudge(-1)} aria-label="Anteriores" className="s-line flex h-11 w-11 items-center justify-center rounded-full border hover:border-[var(--s-ink)]">
            <ChevronLeft size={18} strokeWidth={1.75} />
          </button>
          <button type="button" onClick={() => nudge(1)} aria-label="Siguientes" className="s-line flex h-11 w-11 items-center justify-center rounded-full border hover:border-[var(--s-ink)]">
            <ChevronRight size={18} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="s-surface s-radius mt-8 p-8 text-center">
          <UsersRound size={22} strokeWidth={1.75} className="s-mute mx-auto" />
          <p className="s-mute mt-2 text-[15px]">Aún no hay barberos publicados en {sedeName ?? 'esta sede'}.</p>
          <button type="button" onClick={() => setSede(null)} className="s-btn-ghost mt-4 !min-h-[44px] !text-[15px]">
            Ver todas las sedes
          </button>
        </div>
      ) : solo ? (
        <Solo b={solo} available={available} sede={sede} />
      ) : big ? (
        <>
          <div ref={scroller} className="s-no-scrollbar -mx-5 mt-8 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:scroll-px-0 md:px-0">
            {shown.map((b) => (
              <div key={b.id} className="w-[62%] min-w-[180px] max-w-[280px] shrink-0 snap-start sm:w-[32%] lg:w-[23%]">
                <Card b={b} available={available} sede={sede} locations={multi ? locations : null} chips={2} />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setSheet(true)} className="s-btn-ghost mt-8 w-full sm:w-auto">
            <UsersRound size={17} strokeWidth={1.75} /> Ver todo el equipo ({staff.length})
          </button>
        </>
      ) : (
        <div className={`mt-8 grid grid-cols-2 gap-x-4 gap-y-8 md:gap-x-6 ${shown.length === 3 ? 'md:grid-cols-3' : shown.length >= 4 ? 'md:grid-cols-4' : ''}`}>
          {shown.map((b) => (
            <Card key={b.id} b={b} available={available} sede={sede} locations={multi ? locations : null} chips={3} large={shown.length === 2} />
          ))}
        </div>
      )}

      {big && <TeamSheet open={sheet} onClose={() => setSheet(false)} staff={staff} available={available} />}
    </div>
  );
}

/** Una barbería de un solo barbero: su retrato y su historia, como protagonista. */
function Solo({ b, available, sede }: { b: Staff; available: boolean; sede: string | null }) {
  const specialties = (b.specialties ?? []).filter(Boolean);
  return (
    <div className="mt-8 grid items-center gap-8 md:grid-cols-2 md:gap-14">
      <div className="s-radius s-surface aspect-[4/5] overflow-hidden">
        {b.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.photo_url} alt={b.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="s-display s-mute flex h-full items-center justify-center text-[120px]">{b.name.charAt(0)}</div>
        )}
      </div>
      <div>
        <p className="s-display text-[48px] md:text-[64px]">{b.name}</p>
        {b.rating_count > 0 && (
          <p className="tnum mt-3 flex items-center gap-1.5 text-[16px]">
            <Star size={16} strokeWidth={0} className="fill-current" /> {Number(b.rating_avg).toFixed(1)}
            <span className="s-mute">de {b.rating_count} {b.rating_count === 1 ? 'opinión' : 'opiniones'}</span>
          </p>
        )}
        {b.bio && <p className="s-mute mt-5 max-w-[46ch] text-[18px] leading-relaxed">{b.bio}</p>}
        {specialties.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {specialties.map((t) => <span key={t} className="s-chip !min-h-9 !text-[14px]">{t}</span>)}
          </div>
        )}
        {available && (
          <Link href={reservarHref({ barbero: b.id, sede: b.location_id ?? sede })} className="s-btn mt-8">
            Reservar con {b.name.split(' ')[0]}
          </Link>
        )}
      </div>
    </div>
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

function Card({ b, available, sede, locations, chips, large }: { b: Staff; available: boolean; sede: string | null; locations: PublicLocation[] | null; chips: number; large?: boolean }) {
  const where = locations ? (b.location_id ? locations.find((l) => l.id === b.location_id)?.name : 'Todas las sedes') : null;
  const href = reservarHref({ barbero: b.id, sede: b.location_id ?? sede });
  const specialties = (b.specialties ?? []).filter(Boolean);
  const inner = (
    <>
      <div className={`s-img-zoom s-radius s-surface relative overflow-hidden ${large ? 'aspect-[4/5]' : 'aspect-[3/4]'}`}>
        {b.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.photo_url} alt={b.name} width={480} height={640} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="s-display s-mute flex h-full items-center justify-center text-[72px]">{b.name.charAt(0)}</div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4 text-white">
          <span className={`s-display min-w-0 truncate ${large ? 'text-[34px] md:text-[44px]' : 'text-[26px] md:text-[30px]'}`}>{b.name}</span>
          {b.rating_count > 0 && (
            <span className="tnum flex shrink-0 items-center gap-1 pb-1 text-[14px] font-medium">
              <Star size={13} strokeWidth={0} className="fill-white" /> {Number(b.rating_avg).toFixed(1)}
            </span>
          )}
        </div>
        {available && (
          <span className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-[13px] font-semibold text-black opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            Reservar
          </span>
        )}
      </div>
      {where && <p className="s-mute mt-3 truncate text-[13px]">{where}</p>}
      {specialties.length > 0 ? (
        <div className={`${where ? 'mt-1.5' : 'mt-3'} flex flex-wrap gap-1.5`}>
          {specialties.slice(0, chips).map((t) => (
            <span key={t} className="s-surface rounded-full px-2.5 py-1 text-[12px] font-medium">
              {t}
            </span>
          ))}
          {specialties.length > chips && <span className="s-mute px-1 py-1 text-[12px]">+{specialties.length - chips}</span>}
        </div>
      ) : (
        b.bio && <p className="s-mute mt-2 line-clamp-2 text-[14px]">{b.bio}</p>
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
