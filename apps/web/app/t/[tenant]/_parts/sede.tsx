'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MapPin, Navigation } from 'lucide-react';

export interface PublicLocation {
  id: string;
  name: string;
  address: string | null;
  district: string | null;
  maps: string;
}

interface SedeCtx {
  locations: PublicLocation[];
  multi: boolean;
  sede: string | null;
  setSede: (id: string | null) => void;
}

const Ctx = createContext<SedeCtx>({ locations: [], multi: false, sede: null, setSede: () => {} });

/** Sede elegida por el visitante; se recuerda en este dispositivo. */
export function SedeProvider({ slug, locations, children }: { slug: string; locations: PublicLocation[]; children: React.ReactNode }) {
  const multi = locations.length >= 2;
  const key = `datepe_sede_publica_${slug}`;
  const [sede, setSedeState] = useState<string | null>(null);

  useEffect(() => {
    if (!multi) return;
    try {
      const saved = localStorage.getItem(key);
      if (saved && locations.some((l) => l.id === saved)) setSedeState(saved);
    } catch {}
  }, [key, multi, locations]);

  const setSede = useCallback(
    (id: string | null) => {
      setSedeState(id);
      try {
        if (id) localStorage.setItem(key, id);
        else localStorage.removeItem(key);
      } catch {}
    },
    [key],
  );

  const value = useMemo(() => ({ locations, multi, sede: multi ? sede : null, setSede }), [locations, multi, sede, setSede]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSede = () => useContext(Ctx);

/** Arma el enlace a /reservar con la sede elegida y lo que se quiera preseleccionar. */
export function reservarHref(opts: { sede?: string | null; servicio?: string; barbero?: string }) {
  const q = new URLSearchParams();
  if (opts.servicio) q.set('servicio', opts.servicio);
  if (opts.barbero) q.set('barbero', opts.barbero);
  if (opts.sede) q.set('sede', opts.sede);
  const s = q.toString();
  return s ? `/reservar?${s}` : '/reservar';
}

/** Enlace a reservar que respeta la sede elegida. */
export function ReservarLink({ servicio, barbero, className, style, children, ...rest }: { servicio?: string; barbero?: string; className?: string; style?: React.CSSProperties; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const { sede } = useSede();
  return (
    <Link href={reservarHref({ sede, servicio, barbero })} className={className} style={style} {...rest}>
      {children}
    </Link>
  );
}

/** Selector de sede bajo la portada: filtra el equipo y lleva la sede al reservar. */
export function SedePicker() {
  const { locations, multi, sede, setSede } = useSede();
  const scroller = useRef<HTMLDivElement>(null);
  const current = locations.find((l) => l.id === sede) ?? null;

  useEffect(() => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (box && el) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [sede]);

  if (!multi) return null;
  return (
    <section aria-label="Elige tu sede">
      <p className="s-eyebrow">Elige tu sede</p>
      <div ref={scroller} className="s-no-scrollbar -mx-5 mt-3 flex snap-x snap-mandatory scroll-px-5 gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
        <button type="button" aria-pressed={sede === null} onClick={() => setSede(null)} className="s-chip shrink-0 snap-start">
          Todas
        </button>
        {locations.map((l) => (
          <button key={l.id} type="button" aria-pressed={l.id === sede} onClick={() => setSede(l.id)} className="s-chip shrink-0 snap-start">
            {l.name}
          </button>
        ))}
      </div>
      {current && (
        <div className="s-mute mt-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[14px]">
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin size={15} strokeWidth={1.75} className="shrink-0" />
            <span className="truncate">{[current.address, current.district].filter(Boolean).join(', ') || current.name}</span>
          </span>
          <a href={current.maps} target="_blank" rel="noopener noreferrer" className="s-ink inline-flex min-h-[32px] items-center gap-1.5 font-semibold underline-offset-4 hover:underline">
            <Navigation size={14} strokeWidth={1.75} /> Cómo llegar
          </a>
        </div>
      )}
    </section>
  );
}
