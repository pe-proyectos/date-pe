'use client';

import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Navigation, MapPin } from 'lucide-react';
import type { MapPalette } from './theme';

export interface MapPoint { lat: number; lng: number; name: string; href?: string }

/**
 * Mapa vectorial (OpenFreeMap) pintado con la paleta del ambiente y un marcador con la
 * marca de la barbería. Se carga solo cuando entra en pantalla y no secuestra el scroll.
 */
export function SiteMap({ points, palette, accent, onAccent, logo, initial, className = '', zoom = 15.6 }: { points: MapPoint[]; palette: MapPalette; accent: string; onAccent: string; logo: string | null; initial: string; className?: string; zoom?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !box.current || !points.length) return;
    let map: import('maplibre-gl').Map | null = null;
    let cancelled = false;
    // Sin WebGL (algunos teléfonos viejos o modo ahorro) el mapa no puede dibujarse
    const gl = (() => {
      try {
        const c = document.createElement('canvas');
        return !!(c.getContext('webgl2') || c.getContext('webgl'));
      } catch {
        return false;
      }
    })();
    if (!gl) {
      setFailed(true);
      return;
    }
    // Solo cuenta como falla si el estilo del mapa nunca llegó a cargar (no por mosaicos lentos)
    let styled = false;
    const timeout = setTimeout(() => {
      if (!cancelled && !styled) setFailed(true);
    }, 15000);
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !box.current) return;
      map = new maplibregl.Map({
        container: box.current,
        style: 'https://tiles.openfreemap.org/styles/positron',
        center: [points[0].lng, points[0].lat],
        zoom,
        attributionControl: { compact: true },
        cooperativeGestures: true,
        pitch: 0,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('error', (e) => { if (!styled && /style|webgl|context/i.test(String(e?.error?.message ?? ''))) setFailed(true); });
      map.on('style.load', () => {
        styled = true;
        const m = map!;
        for (const l of m.getStyle().layers ?? []) {
          const id = l.id;
          try {
            if (l.type === 'background') m.setPaintProperty(id, 'background-color', palette.land);
            else if (l.type === 'fill') {
              if (/water/.test(id)) m.setPaintProperty(id, 'fill-color', palette.water);
              else if (/park|wood|grass|landcover/.test(id)) m.setPaintProperty(id, 'fill-color', palette.park);
              else if (/building/.test(id)) { m.setPaintProperty(id, 'fill-color', palette.building); m.setPaintProperty(id, 'fill-outline-color', palette.casing); }
              else if (/residential|landuse/.test(id)) m.setPaintProperty(id, 'fill-color', palette.land);
            } else if (l.type === 'line') {
              if (/water/.test(id)) m.setPaintProperty(id, 'line-color', palette.water);
              else if (/casing/.test(id)) m.setPaintProperty(id, 'line-color', palette.casing);
              else if (/motorway|major|trunk|primary/.test(id)) m.setPaintProperty(id, 'line-color', palette.roadMajor);
              else if (/highway|road|path|minor|street|pier/.test(id)) m.setPaintProperty(id, 'line-color', palette.road);
              else if (/rail|transit/.test(id)) m.setPaintProperty(id, 'line-color', palette.casing);
              else if (/boundary/.test(id)) m.setLayoutProperty(id, 'visibility', 'none');
            } else if (l.type === 'symbol') {
              if (/shield|airport/.test(id)) { m.setLayoutProperty(id, 'visibility', 'none'); continue; }
              m.setPaintProperty(id, 'text-color', palette.label);
              m.setPaintProperty(id, 'text-halo-color', palette.halo);
              m.setPaintProperty(id, 'text-halo-width', 1.4);
            }
          } catch { /* capa sin esa propiedad */ }
        }
        for (const p of points) {
          const el = document.createElement('div');
          el.className = 's-pin';
          el.innerHTML = `<span class="s-pin-pulse" style="background:${accent}"></span><span class="s-pin-dot" style="background:${accent};color:${onAccent}">${logo ? `<img src="${logo}" alt="" />` : `<b>${initial}</b>`}</span><span class="s-pin-label">${p.name.replace(/[<>&]/g, '')}</span>`;
          if (p.href) {
            el.style.cursor = 'pointer';
            el.addEventListener('click', () => window.open(p.href, '_blank', 'noopener'));
          }
          new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(m);
        }
        if (points.length > 1) {
          const b = new maplibregl.LngLatBounds();
          points.forEach((p) => b.extend([p.lng, p.lat]));
          m.fitBounds(b, { padding: 90, maxZoom: 15, duration: 0 });
        }
        setReady(true);
        clearTimeout(timeout);
      });
    })().catch(() => setFailed(true));
    return () => { cancelled = true; clearTimeout(timeout); map?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const first = points[0];
  return (
    <div className={`s-radius relative overflow-hidden ${className}`} style={{ background: palette.land }}>
      <div ref={box} className="absolute inset-0" aria-label="Mapa de ubicación" role="region" />
      {!ready && !failed && <div className="pointer-events-none absolute inset-0 animate-pulse" style={{ background: palette.land }} aria-hidden />}
      {failed && first && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center" style={{ color: palette.label }}>
          <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: accent, color: onAccent }}>
            <MapPin size={24} strokeWidth={1.75} />
          </span>
          <p className="s-display text-[26px]" style={{ color: 'var(--s-ink)' }}>{first.name}</p>
          {first.href && (
            <a href={first.href} target="_blank" rel="noopener noreferrer" className="s-btn !min-h-[46px] !text-[15px]">
              <Navigation size={17} strokeWidth={1.75} /> Abrir en Google Maps
            </a>
          )}
        </div>
      )}
    </div>
  );
}
