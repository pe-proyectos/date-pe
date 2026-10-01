'use client';

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { TenantSite } from '@/lib/api';
import { useSede } from '../_parts/sede';
import { Card } from '../_parts/TeamSection';

type Staff = TenantSite['staff'][number];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Todo el equipo en grilla. Con equipos grandes: buscador, filtro por especialidad y por sede. */
export function TeamDirectory({ staff, available }: { staff: Staff[]; available: boolean }) {
  const { locations, multi, sede, setSede } = useSede();
  const [q, setQ] = useState('');
  const [spec, setSpec] = useState<string | null>(null);
  const specs = useMemo(() => {
    const count = new Map<string, number>();
    for (const b of staff) for (const s of b.specialties ?? []) if (s) count.set(s, (count.get(s) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).slice(0, 10);
  }, [staff]);
  const big = staff.length > 6;
  const query = norm(q.trim());
  const list = staff.filter(
    (b) =>
      (!sede || !b.location_id || b.location_id === sede) &&
      (!spec || (b.specialties ?? []).includes(spec)) &&
      (!query || norm(`${b.name} ${b.bio ?? ''} ${(b.specialties ?? []).join(' ')}`).includes(query)),
  );

  return (
    <div>
      {(big || specs.length > 2 || multi) && (
        <div className="mb-10 space-y-4">
          {big && (
            <label className="relative flex max-w-xl items-center">
              <Search size={18} strokeWidth={1.75} className="s-mute pointer-events-none absolute left-4" />
              <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Buscar por nombre o especialidad" aria-label="Buscar barbero" className="s-surface h-12 w-full rounded-full border border-transparent pl-11 pr-12 text-[16px] outline-none placeholder:text-[var(--s-mute)] focus:border-[var(--s-ink)] [&::-webkit-search-cancel-button]:hidden" />
              {q && <button type="button" onClick={() => setQ('')} aria-label="Borrar" className="s-mute absolute right-1 flex h-10 w-10 items-center justify-center"><X size={18} strokeWidth={1.75} /></button>}
            </label>
          )}
          {multi && (
            <div className="s-no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
              <button type="button" aria-pressed={sede === null} onClick={() => setSede(null)} className="s-chip shrink-0">Todas las sedes</button>
              {locations.map((l) => <button key={l.id} type="button" aria-pressed={sede === l.id} onClick={() => setSede(l.id)} className="s-chip shrink-0">{l.name}</button>)}
            </div>
          )}
          {specs.length > 2 && (
            <div className="s-no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
              <button type="button" aria-pressed={spec === null} onClick={() => setSpec(null)} className="s-chip shrink-0">Todas las especialidades</button>
              {specs.map((s) => <button key={s} type="button" aria-pressed={spec === s} onClick={() => setSpec(spec === s ? null : s)} className="s-chip shrink-0">{s}</button>)}
            </div>
          )}
        </div>
      )}
      <p className="s-mute mb-6 text-[15px]" aria-live="polite">{list.length === 0 ? 'Nadie coincide con tu búsqueda.' : `${list.length} ${list.length === 1 ? 'barbero' : 'barberos'}`}</p>
      <div className={`grid grid-cols-2 gap-x-4 gap-y-10 md:gap-x-6 ${list.length <= 2 ? '' : list.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-3 lg:grid-cols-4'}`}>
        {list.map((b) => (
          <div key={b.id}>
            <Card b={b} available={available} sede={sede} locations={multi ? locations : null} chips={3} large={list.length <= 2} profiles />
            {b.bio && <p className="s-mute mt-3 line-clamp-3 text-[15px] leading-relaxed md:hidden">{b.bio}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
