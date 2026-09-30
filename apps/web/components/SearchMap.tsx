'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  name: string;
}

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const LIMA: [number, number] = [-77.03, -12.08];

const PILL_BASE =
  'tnum cursor-pointer whitespace-nowrap rounded-full border px-2.5 py-1 text-[13px] font-semibold leading-none shadow-[0_2px_8px_rgb(10_10_10/0.16)] transition-[scale,background-color,color] duration-200 hover:scale-105';
const PILL_IDLE = 'border-ink bg-white text-ink';
const PILL_ON = 'border-ink bg-ink text-white scale-110';

/**
 * Mapa de resultados con MapLibre y el estilo libre de OpenFreeMap (sin clave).
 * Marcadores con el precio "desde"; el seleccionado va en tinta.
 */
export default function SearchMap({
  points,
  selected,
  onSelect,
  user,
}: {
  points: MapPoint[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  user?: { lat: number; lng: number } | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new Map<string, { marker: maplibregl.Marker; wrap: HTMLDivElement; el: HTMLButtonElement }>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Crea el mapa una sola vez
  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
      container: box.current,
      style: STYLE_URL,
      center: user ? [user.lng, user.lat] : LIMA,
      zoom: 12,
      attributionControl: { compact: true },
      cooperativeGestures: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('click', () => onSelectRef.current(null));
    mapRef.current = map;

    // Se ajusta cuando el contenedor cambia de tamaño (vista Mapa / Lista, rotación)
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(box.current);

    const current = markers.current;
    return () => {
      ro.disconnect();
      current.clear();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marcadores y encuadre cuando cambian los resultados
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const { marker } of markers.current.values()) marker.remove();
    markers.current.clear();

    const bounds = new maplibregl.LngLatBounds();
    for (const p of points) {
      // MapLibre mueve el contenedor con transform; el estilo va en el botón interno
      const wrap = document.createElement('div');
      const el = document.createElement('button');
      wrap.appendChild(el);
      el.type = 'button';
      el.className = `${PILL_BASE} ${PILL_IDLE}`;
      el.textContent = p.label;
      el.setAttribute('aria-label', `${p.name}, ${p.label}`);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectRef.current(p.id);
      });
      const marker = new maplibregl.Marker({ element: wrap, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
      markers.current.set(p.id, { marker, wrap, el });
      bounds.extend([p.lng, p.lat]);
    }

    let userMarker: maplibregl.Marker | null = null;
    if (user) {
      const dot = document.createElement('div');
      dot.style.zIndex = '0';
      dot.className = 'h-4 w-4 rounded-full border-[3px] border-white bg-[#1d3f94] shadow-[0_0_0_6px_rgb(29_63_148/0.18)]';
      dot.setAttribute('aria-label', 'Tu ubicación');
      userMarker = new maplibregl.Marker({ element: dot }).setLngLat([user.lng, user.lat]).addTo(map);
      bounds.extend([user.lng, user.lat]);
    }

    if (!bounds.isEmpty()) {
      if (points.length + (user ? 1 : 0) === 1) map.jumpTo({ center: bounds.getCenter(), zoom: 14 });
      else map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 0 });
    }
    return () => {
      userMarker?.remove();
    };
  }, [points, user]);

  // Resalta el marcador seleccionado y lo trae a la vista
  useEffect(() => {
    for (const [id, { el, wrap, marker }] of markers.current) {
      const on = id === selected;
      el.className = `${PILL_BASE} ${on ? PILL_ON : PILL_IDLE}`;
      wrap.style.zIndex = on ? '2' : '1';
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) {
        const map = mapRef.current;
        if (map && !map.getBounds().contains(marker.getLngLat())) map.easeTo({ center: marker.getLngLat(), duration: 400 });
      }
    }
  }, [selected, points]);

  return <div ref={box} className="h-full w-full bg-field" aria-label="Mapa de barberías" role="region" />;
}
