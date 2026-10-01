'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Plus, Search, X, ChevronDown, ChevronRight } from 'lucide-react';
import { soles, type TenantSite } from '@/lib/api';
import { ReservarLink } from './sede';
import { SiteSheet } from '../_site/SiteSheet';
import { NextSlot } from '../_site/NextSlot';

type Service = TenantSite['services'][number];

const PREVIEW = 6;
const SEARCH_FROM = 9;
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slugify = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'otros';

/**
 * Carta de servicios que escala: categorías con barra fija que sigue el scroll,
 * buscador cuando hay muchos, y "Ver los N servicios" en categorías largas.
 */
export function ServiceMenu({ services, available, leader = false, limit, tenant, tz = 'America/Lima' }: { services: Service[]; available: boolean; leader?: boolean; limit?: number; tenant?: string; tz?: string }) {
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

  // En el celular, tocar un servicio abre su detalle en una hoja (como en una app)
  const [detail, setDetail] = useState<Service | null>(null);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const openDetail = mobile ? (sv: Service) => setDetail(sv) : undefined;
  const sheet = (
    <SiteSheet open={!!detail} onClose={() => setDetail(null)} title={detail?.category ?? 'Servicio'} footer={detail && available ? <ReservarLink servicio={detail.id} className="s-btn w-full">Reservar este servicio</ReservarLink> : undefined}>
      {detail && (
        <div className="pb-2">
          {detail.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={detail.photo_url} alt="" className="s-radius mb-5 aspect-[16/10] w-full object-cover" />
          )}
          <p className="s-display text-[40px]">{detail.name}</p>
          {detail.description && <p className="s-mute mt-3 text-[17px] leading-relaxed">{detail.description}.</p>}
          <dl className="s-surface s-radius mt-6 grid grid-cols-2">
            <div className="p-4">
              <dt className="s-mute text-[13px]">Precio</dt>
              <dd className="s-display tnum mt-1 text-[30px]">{soles(detail.price_cents).replace('.00', '')}</dd>
            </div>
            <div className="s-line border-l p-4">
              <dt className="s-mute text-[13px]">Duración</dt>
              <dd className="s-display tnum mt-1 text-[30px]">{detail.duration_min} min</dd>
            </div>
          </dl>
          {addons.length > 0 && <p className="s-mute mt-4 text-[14px]">Puedes sumar {addons.slice(0, 2).map((a) => a.name.toLowerCase()).join(' o ')} al reservar.</p>}
          {available && tenant && (
            <p className="mt-5 text-[15px]"><NextSlot tenant={tenant} serviceId={detail.id} tz={tz} /></p>
          )}
        </div>
      )}
    </SiteSheet>
  );

  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(groups[0]?.id ?? '');
  const chipsBox = useRef<HTMLDivElement>(null);
  const lock = useRef(0);

  const showSearch = main.length >= SEARCH_FROM;
  // Cartas grandes: una categoría a la vez (pestañas) y en dos columnas en escritorio
  const tabs = main.length > 12 && groups.length > 2;
  const showChips = groups.length > 1 && !q;
  const query = norm(q.trim());
  const results = query
    ? main.filter((s) => norm(`${s.name} ${s.description ?? ''} ${s.category ?? ''}`).includes(query))
    : [];

  // La categoría activa sigue al scroll
  useEffect(() => {
    if (!showChips || tabs) return;
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
  }, [groups, showChips, tabs]);

  // Mantiene visible el chip activo dentro de su propia barra
  useEffect(() => {
    const box = chipsBox.current;
    const el = box?.querySelector<HTMLElement>(`[data-cat="${active}"]`);
    if (box && el) box.scrollTo({ left: el.offsetLeft - 20, behavior: 'smooth' });
  }, [active]);

  const goTo = (id: string) => {
    if (tabs) {
      setActive(id);
      return;
    }
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

  // Adelanto en el inicio: los primeros servicios, sin buscador ni categorías
  if (limit) {
    return (
      <>
        <ul className="mt-2">
          {main.slice(0, limit).map((s) => (
            <Row key={s.id} s={s} available={available} leader={leader} onOpen={openDetail} />
          ))}
        </ul>
        {sheet}
      </>
    );
  }

  return (
    <div>
      {showSearch && (
        <label className="relative mt-8 flex max-w-xl items-center">
          <Search size={18} strokeWidth={1.75} className="s-mute pointer-events-none absolute left-4" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Buscar entre ${main.length} servicios`}
            aria-label="Buscar servicio"
            enterKeyHint="search"
            className="s-surface h-12 w-full min-w-0 rounded-full border border-transparent pl-11 pr-12 text-[16px] outline-none placeholder:text-[var(--s-mute)] focus:border-[var(--s-ink)] [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Borrar búsqueda" className="s-mute absolute right-1 flex h-10 w-10 items-center justify-center rounded-full">
              <X size={18} strokeWidth={1.75} />
            </button>
          )}
        </label>
      )}

      {showChips && (
        <nav aria-label="Categorías de servicios" className={`s-bg z-20 -mx-5 mt-6 md:mx-0 ${tabs ? '' : 'sticky top-[calc(4rem+env(safe-area-inset-top))] md:top-[calc(72px+env(safe-area-inset-top))]'}`}>
          <div ref={chipsBox} className="s-no-scrollbar flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 py-3 md:px-0">
            {groups.map((g) => {
              const on = g.id === active;
              return (
                <button key={g.id} type="button" role={tabs ? 'tab' : undefined} aria-selected={tabs ? on : undefined} aria-current={on ? 'true' : undefined} data-cat={g.id} onClick={() => goTo(g.id)} className="s-chip shrink-0 snap-start">
                  {g.name}
                  <span className="tnum text-[13px] opacity-60">{g.items.length}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {query ? (
        <div className="mt-6">
          <p className="s-mute text-[14px]" aria-live="polite">
            {results.length === 0 ? `No encontramos servicios para "${q.trim()}".` : `${results.length} ${results.length === 1 ? 'servicio' : 'servicios'}`}
          </p>
          <ul className="mt-2">
            {results.map((s) => (
              <Row key={s.id} s={s} available={available} leader={leader} showCategory={groups.length > 1} onOpen={openDetail} />
            ))}
          </ul>
        </div>
      ) : (
        <div className={groups.length > 1 && main.length > 8 ? '' : 'md:columns-1'}>
          {(tabs ? groups.filter((g) => g.id === active) : groups).map((g) => {
            const expanded = open.has(g.id) || tabs;
            const items = expanded ? g.items : g.items.slice(0, PREVIEW);
            return (
              <section key={g.id} id={g.id} aria-label={g.name} className={groups.length > 1 ? 'scroll-mt-40 pt-10' : 'pt-4'}>
                {groups.length > 1 && (
                  <h3 className="s-display flex items-baseline gap-3 text-[28px] md:text-[34px]">
                    {g.name}
                    <span className="tnum s-mute font-sans text-[14px] font-normal normal-case tracking-normal">{g.items.length}</span>
                  </h3>
                )}
                <ul className={`${groups.length > 1 ? 'mt-3' : ''} ${tabs ? 'lg:grid lg:grid-cols-2 lg:gap-x-12 [&>li:last-child]:border-b lg:[&>li:nth-last-child(2):nth-child(odd)]:border-0' : ''}`}>
                  {items.map((s) => (
                    <Row key={s.id} s={s} available={available} leader={leader} onOpen={openDetail} />
                  ))}
                </ul>
                {!tabs && g.items.length > PREVIEW && (
                  <button type="button" onClick={() => toggle(g.id)} aria-expanded={expanded} className="s-btn-ghost mt-4 !min-h-[44px] !text-[15px]">
                    {expanded ? 'Ver menos' : `Ver los ${g.items.length} servicios`}
                    <ChevronDown size={16} strokeWidth={1.75} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}

      {addons.length > 0 && !query && (
        <div className="s-surface s-radius mt-12 p-6 md:p-8">
          <p className="s-eyebrow">Complementos</p>
          <p className="s-mute mt-1 text-[15px]">Agrégalos a tu servicio al reservar.</p>
          <ul className="mt-4 grid gap-x-10 md:grid-cols-2">
            {addons.map((x) => (
              <li key={x.id} className="s-line flex items-baseline justify-between gap-3 border-b py-3 text-[15px] last:border-0 md:[&:nth-last-child(2)]:border-0">
                <span className="flex min-w-0 items-start gap-2">
                  <Plus size={15} strokeWidth={1.75} className="s-mute mt-0.5 shrink-0" />
                  <span>{x.name}</span>
                </span>
                <span className="tnum s-mute shrink-0">
                  +{soles(x.price_cents)}, {x.duration_min} min
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sheet}
    </div>
  );
}

function Row({ s, available, leader, showCategory, onOpen }: { s: Service; available: boolean; leader: boolean; showCategory?: boolean; onOpen?: (s: Service) => void }) {
  const body = (
    <>
      {s.photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.photo_url} alt="" width={72} height={72} loading="lazy" decoding="async" className="s-radius h-[72px] w-[72px] shrink-0 object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline">
          <span className="s-svc min-w-0">{s.name}</span>
          {leader && <span className="s-leader hidden sm:block" aria-hidden />}
          <span className={`flex-1 ${leader ? 'sm:hidden' : ''}`} />
          <span className="tnum shrink-0 pl-3 text-[18px] font-semibold md:text-[19px]">{soles(s.price_cents)}</span>
        </div>
        {showCategory && s.category && <div className="s-mute text-[13px]">{s.category}</div>}
        <div className="mt-1 flex items-start justify-between gap-4">
          <p className="s-mute min-w-0 text-[15px] leading-snug">
            {s.description && <span className="line-clamp-2">{s.description}</span>}
            <span className="mt-1 inline-flex items-center gap-1 text-[14px]">
              <Clock size={13} strokeWidth={1.75} /> {s.duration_min} min
            </span>
          </p>
          {available && (
            <span className="s-line hidden shrink-0 rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors group-hover:border-transparent group-hover:bg-[var(--accent)] group-hover:text-[var(--on-accent)] lg:inline-flex">
              Reservar
            </span>
          )}
          <ChevronRight size={18} strokeWidth={1.6} className="s-mute mt-0.5 shrink-0 lg:hidden" aria-hidden />
        </div>
      </div>
    </>
  );
  return (
    <li className="s-line border-b last:border-0">
      {available ? (
        <ReservarLink
          servicio={s.id}
          className="s-cell group -mx-3 flex items-start gap-4 rounded-xl px-3 py-5 lg:mx-0 lg:px-0"
          onClick={onOpen ? (e) => { e.preventDefault(); onOpen(s); } : undefined}
        >
          {body}
        </ReservarLink>
      ) : (
        <button type="button" onClick={() => onOpen?.(s)} className="flex w-full items-start gap-4 py-5 text-left">{body}</button>
      )}
    </li>
  );
}
