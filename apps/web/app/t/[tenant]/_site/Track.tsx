'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { API_BASE_CLIENT } from '@/lib/config';

function visitorId() {
  try {
    let v = localStorage.getItem('datepe_v');
    if (!v) {
      v = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      localStorage.setItem('datepe_v', v);
    }
    return v;
  } catch {
    return undefined;
  }
}

export function track(slug: string, kind: 'view' | 'book_click' | 'book_start', path: string) {
  const body = JSON.stringify({ kind, path, ref: document.referrer || undefined, host: location.hostname, visitor: visitorId() });
  const url = `${API_BASE_CLIENT}/api/public/track?tenant=${encodeURIComponent(slug)}`;
  try {
    if (navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain' }))) return;
  } catch { /* sigue con fetch */ }
  fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, keepalive: true, mode: 'no-cors' }).catch(() => {});
}

/**
 * Cuenta visitas a la página de la barbería y los toques en "Reservar". Anónimo: sin
 * cookies ni datos personales, solo un id al azar guardado en este navegador.
 */
export function Track({ slug, kind = 'view' }: { slug: string; kind?: 'view' | 'book_start' }) {
  const raw = usePathname() ?? '/';
  const path = raw.replace(new RegExp(`^/t/${slug}(?=/|$)`), '') || '/';
  const last = useRef('');

  useEffect(() => {
    if (last.current === path) return;
    last.current = path;
    track(slug, kind, path);
  }, [slug, kind, path]);

  useEffect(() => {
    if (kind !== 'view') return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a');
      if (a?.getAttribute('href')?.startsWith('/reservar')) track(slug, 'book_click', path);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [slug, kind, path]);

  return null;
}
