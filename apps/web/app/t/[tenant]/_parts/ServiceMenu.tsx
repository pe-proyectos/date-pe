'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Plus, Search, X, ChevronDown } from 'lucide-react';
import { soles, type TenantSite } from '@/lib/api';
import { ReservarLink } from './sede';

type Service = TenantSite['services'][number];

const PREVIEW = 6;
const SEARCH_FROM = 9;
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slugify = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'otros';

/**
 * Carta de servicios que escala: categorías con barra fija que sigue el scroll,
 * buscador cuando hay muchos, y "Ver los N servicios" en categorías largas.
 */
export function ServiceMenu({ services, available, accent, onAccent }: { services: Service[]; available: boolean; accent: string; onAccent: string }) {
  const main = useMemo(() => services.filter((s) => !s.is_addon), [services]);
  const addons = useMemo(() => services.filter((s) => s.is_addon), [services]);

  const groups = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const s of main) {
      const k = s.category?.trim() || 'Otros';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    const list = [...map.entries()].map(([name, items]) => ({ name, id: `cat-${slugify(name)}`, items }));
    // "Otros" siempre al final
    return [...list.filter((g) => g.name !== 'Otros'), ...list.filter((g) => g.name === 'Otros')];
  }, [main]);

  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(groups[0]?.id ?? '');
  const chipsBox = useRef<HTMLDivElement>(null);
  const lock = useRef(0);

  const showSearch = main.length >= SEARCH_FROM;
  const showChips = groups.length > 1 && !q;
  const query = norm(q.trim());
  const results = query
    ? main.filter((s) => norm(`${s.name} ${s.description ?? ''} ${s.category ?? ''}`).includes(query))
    : [];

  // La categoría activa sigue al scroll
  useEffect(() => {
    if (!showChips) return;
    const visible = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        if (Date.now() < lock.current) return;
        const first = groups.find((g) => visible.get(g.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-140px 0px -55% 0px' },
    );
    for (const g of groups) {
      const el = document.getElementById(g.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [groups, showChips]);

  // Mantiene visible el chip activo dentro de su propia barra
  useEffect(() => {
    const box = chipsBox.current;
    const el = box?.querySelector<HTMLElement>(`[data-cat="${active}"]`);
    if (box && el) box.scrollTo({ left: el.offsetLeft - 20, behavior: 'smooth' });
  }, [active]);

  const goTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    lock.current = Date.now() + 800;
    const bar = chipsBox.current?.parentElement;
    const offset = bar ? (parseFloat(getComputedStyle(bar).top) || 64) + bar.offsetHeight + 8 : 140;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
  };

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      {showSearch && (
        <label className="relative mt-5 flex items-center">
          <Search size={18} strokeWidth={1.75} className="pointer-events-none absolute left-4 text-soft" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Buscar entre ${main.length} servicios`}
            aria-label="Buscar servicio"
            enterKeyHint="search"
            className="h-12 w-full min-w-0 rounded-full bg-field pl-11 pr-12 text-[16px] outline-none placeholder:text-soft focus:bg-white focus:ring-2 focus:ring-ink [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Borrar búsqueda" className="absolute right-1 flex h-10 w-10 items-center justify-center rounded-full text-mute hover:text-ink">
              <X size={18} strokeWidth={1.75} />
            </button>
          )}
        </label>
      )}

      {showChips && (
        <nav aria-label="Categorías de servicios" className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-20 -mx-5 mt-4 border-b border-line bg-white md:mx-0">
          <div ref={chipsBox} className="no-scrollbar flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 py-3 md:px-0">
            {groups.map((g) => {
              const on = g.id === active;
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-current={on ? 'true' : undefined}
                  data-cat={g.id}
                  onClick={() => goTo(g.id)}
                  className={`flex h-10 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[15px] font-medium transition-colors ${on ? 'bg-ink text-white' : 'bg-field text-ink hover:bg-line'}`}
                >
                  {g.name}
                  <span className={`tnum text-[13px] ${on ? 'text-white/70' : 'text-soft'}`}>{g.items.length}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {query ? (
        <div className="mt-4">
          <p className="text-[14px] text-mute" aria-live="polite">
            {results.length === 0 ? `No encontramos servicios para "${q.trim()}".` : `${results.length} ${results.length === 1 ? 'servicio' : 'servicios'}`}
          </p>
          <ul className="mt-1">
            {results.map((s) => (
              <Row key={s.id} s={s} available={available} accent={accent} onAccent={onAccent} showCategory={groups.length > 1} />
            ))}
          </ul>
        </div>
      ) : (
        groups.map((g) => {
          const expanded = open.has(g.id);
          const items = expanded ? g.items : g.items.slice(0, PREVIEW);
          return (
            <section key={g.id} id={g.id} aria-label={g.name} className={groups.length > 1 ? 'pt-6' : 'pt-2'}>
              {groups.length > 1 && (
                <h3 className="flex items-baseline gap-2 text-[19px] font-semibold tracking-[-0.02em]">
                  {g.name}
                  <span className="tnum text-[14px] font-normal text-soft">{g.items.length}</span>
                </h3>
              )}
              <ul className={groups.length > 1 ? 'mt-1' : ''}>
                {items.map((s) => (
                  <Row key={s.id} s={s} available={available} accent={accent} onAccent={onAccent} />
                ))}
              </ul>
              {g.items.length > PREVIEW && (
                <button
                  type="button"
                  onClick={() => toggle(g.id)}
                  aria-expanded={expanded}
                  className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-line px-5 text-[15px] font-medium transition-colors hover:border-ink"
                >
                  {expanded ? 'Ver menos' : `Ver los ${g.items.length} servicios`}
                  <ChevronDown size={16} strokeWidth={1.75} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
              )}
            </section>
          );
        })
      )}

      {addons.length > 0 && !query && (
        <div className="mt-8 rounded-xl bg-field p-5">
          <h3 className="text-[15px] font-semibold">Complementos</h3>
          <p className="mt-0.5 text-[14px] text-mute">Agrégalos a tu servicio al reservar.</p>
          <ul className="mt-3 divide-y divide-line">
            {addons.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-4 py-2.5 text-[15px]">
                <span className="flex min-w-0 items-center gap-2">
                  <Plus size={15} strokeWidth={1.75} className="shrink-0 text-mute" />
                  <span className="truncate">{x.name}</span>
                </span>
                <span className="tnum shrink-0 text-mute">
                  +{soles(x.price_cents)}, +{x.duration_min} min
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ s, available, accent, onAccent, showCategory }: { s: Service; available: boolean; accent: string; onAccent: string; showCategory?: boolean }) {
  const body = (
    <>
      {s.photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.photo_url} alt="" width={64} height={64} loading="lazy" decoding="async" className="h-16 w-16 shrink-0 rounded-lg bg-field object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[17px] font-medium leading-snug tracking-[-0.01em]">{s.name}</div>
        {showCategory && s.category && <div className="text-[13px] text-soft">{s.category}</div>}
        {s.description && <p className="mt-0.5 line-clamp-2 text-[15px] leading-snug text-mute">{s.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[14px]">
          <span className="tnum font-medium text-ink">{soles(s.price_cents)}</span>
          <span className="flex items-center gap-1 text-soft">
            <Clock size={14} strokeWidth={1.75} /> {s.duration_min} min
          </span>
        </div>
      </div>
      {available && (
        <span
          className="flex h-10 shrink-0 items-center rounded-full border border-line px-4 text-[14px] font-medium transition-colors group-hover:border-transparent group-hover:bg-[var(--accent)] group-hover:text-[var(--on-accent)]"
          style={{ ['--accent' as string]: accent, ['--on-accent' as string]: onAccent }}
        >
          Reservar
        </span>
      )}
    </>
  );
  return (
    <li className="border-b border-line last:border-0">
      {available ? (
        <ReservarLink servicio={s.id} className="group flex items-center gap-4 py-4">
          {body}
        </ReservarLink>
      ) : (
        <div className="flex items-center gap-4 py-4">{body}</div>
      )}
    </li>
  );
}
