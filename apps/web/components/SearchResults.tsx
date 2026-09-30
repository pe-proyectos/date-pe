'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { List, Map as MapIcon, Navigation, Star } from 'lucide-react';
import { ShopCard } from './ShopCard';
import type { MapPoint } from './SearchMap';
import { soles, type SearchResult } from '@/lib/api';
import { tenantUrl } from '@/lib/config';
import { haptic } from '@/lib/haptics';

// MapLibre pesa: se carga solo en el navegador y aparte del primer render
const SearchMap = dynamic(() => import('./SearchMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-field" />,
});

export type GeoResult = SearchResult & {
  lat?: number | string | null;
  lng?: number | string | null;
  distance_km?: number | string | null;
};

/** "a 350 m" o "a 1,2 km". */
export function distanceLabel(km: number | string | null | undefined): string | null {
  if (km == null || km === '') return null;
  const n = Number(km);
  if (!Number.isFinite(n)) return null;
  if (n < 1) return `a ${Math.max(50, Math.round((n * 1000) / 50) * 50)} m`;
  return `a ${(n < 10 ? n.toFixed(1) : Math.round(n).toString()).replace('.', ',')} km`;
}

/** Precio corto para el marcador: "S/ 25" o "S/ 25.50". */
function pinPrice(cents: number | null): string {
  if (cents == null) return 'Ver';
  const s = Number(cents) / 100;
  return `S/ ${Number.isInteger(s) ? s : s.toFixed(2)}`;
}

export function SearchResults({ results, user }: { results: GeoResult[]; user: { lat: number; lng: number } | null }) {
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [selected, setSelected] = useState<string | null>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());

  const points = useMemo<MapPoint[]>(
    () =>
      results
        .filter((r) => r.lat != null && r.lng != null && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng)))
        .map((r) => ({ id: r.location_id, lat: Number(r.lat), lng: Number(r.lng), label: pinPrice(r.desde_cents), name: r.name })),
    [results],
  );
  const userPoint = useMemo(() => (user ? { lat: user.lat, lng: user.lng } : null), [user?.lat, user?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasMap = points.length > 0;

  const onPin = useCallback(
    (id: string | null) => {
      setSelected(id);
      if (!id) return;
      haptic.select();
      // En escritorio la lista está al lado: lleva la tarjeta a la vista
      if (window.matchMedia('(min-width: 1024px)').matches) {
        cards.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    [],
  );

  const picked = selected ? results.find((r) => r.location_id === selected) ?? null : null;

  return (
    <>
      <div className={`mt-8 ${hasMap ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(380px,42%)] lg:gap-8' : ''}`}>
        <div className={mode === 'map' && hasMap ? 'hidden lg:block' : ''}>
          <div className={`grid gap-x-6 gap-y-10 sm:grid-cols-2 ${hasMap ? 'lg:grid-cols-2' : 'lg:grid-cols-4'}`}>
            {results.map((r) => {
              const on = selected === r.location_id;
              const dist = distanceLabel(r.distance_km);
              return (
                <div
                  key={r.location_id}
                  data-reveal
                  ref={(el) => {
                    if (el) cards.current.set(r.location_id, el);
                    else cards.current.delete(r.location_id);
                  }}
                  onMouseEnter={() => hasMap && setSelected(r.location_id)}
                  onMouseLeave={() => setSelected((s) => (s === r.location_id ? null : s))}
                  className={`rounded-xl transition-shadow duration-300 ${on ? 'ring-2 ring-ink ring-offset-4 ring-offset-white' : ''}`}
                >
                  <ShopCard r={r} />
                  {dist && (
                    <p className="tnum mt-1 flex items-center gap-1.5 text-[14px] text-mute">
                      <Navigation size={13} strokeWidth={1.75} /> {dist}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {hasMap && (
          <div
            className={`${
              mode === 'map'
                ? 'fixed inset-x-0 bottom-0 top-[calc(56px+env(safe-area-inset-top))] z-30 md:top-16'
                : 'hidden'
            } lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-24 lg:z-auto lg:block lg:h-[calc(100dvh-120px)] lg:overflow-hidden lg:rounded-xl lg:border lg:border-line`}
          >
            <SearchMap points={points} selected={selected} onSelect={onPin} user={userPoint} />

            {mode === 'map' && picked && (
              <a
                href={tenantUrl(picked.slug)}
                className="rise-in absolute inset-x-4 bottom-[calc(148px+env(safe-area-inset-bottom))] z-10 flex items-center gap-3 rounded-xl bg-white p-2.5 shadow-pop md:bottom-24 lg:hidden"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-field">
                  {picked.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={picked.cover_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-line-2">{picked.name.charAt(0)}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-medium tracking-[-0.02em]">{picked.name}</span>
                    {picked.rating && (
                      <span className="tnum flex shrink-0 items-center gap-1 text-[14px]">
                        <Star size={13} strokeWidth={0} className="fill-ink" /> {Number(picked.rating).toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[14px] text-mute">
                    {[picked.district ?? picked.location_name, distanceLabel(picked.distance_km)].filter(Boolean).join(', ')}
                  </div>
                  <div className="tnum text-[14px] font-medium">Desde {soles(picked.desde_cents)}</div>
                </div>
              </a>
            )}
          </div>
        )}
      </div>

      {hasMap && (
        <button
          type="button"
          onClick={() => {
            haptic.tap();
            setMode((m) => (m === 'list' ? 'map' : 'list'));
          }}
          className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-40 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-white shadow-pop active:bg-ink-2 md:bottom-8 lg:hidden"
        >
          {mode === 'list' ? (
            <>
              Mapa <MapIcon size={17} strokeWidth={1.75} />
            </>
          ) : (
            <>
              Lista <List size={17} strokeWidth={1.75} />
            </>
          )}
        </button>
      )}
    </>
  );
}
