'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { haptic } from '@/lib/haptics';

/**
 * Jalar hacia abajo para actualizar, solo con la página instalada como app:
 * en el navegador el celular ya trae su propio gesto.
 */
export function PullRefresh({ onRefresh }: { onRefresh: () => Promise<unknown> | void }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;
    let current = 0;
    let armed = false;
    const down = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 && !document.querySelector('[role="dialog"]') ? e.touches[0].clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      current = dy > 0 ? Math.min(dy * 0.5, 96) : 0;
      if (current >= 64 && !armed) { armed = true; haptic.tap(); }
      if (current < 64) armed = false;
      setPull(current);
    };
    const up = async () => {
      if (start.current === null) return;
      start.current = null;
      if (current >= 64) {
        setBusy(true);
        setPull(56);
        try { await cb.current(); } finally { setBusy(false); }
      }
      current = 0;
      armed = false;
      setPull(0);
    };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up);
    window.addEventListener('touchcancel', up);
    return () => {
      window.removeEventListener('touchstart', down);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
      window.removeEventListener('touchcancel', up);
    };
  }, []);

  if (!pull && !busy) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center" style={{ transform: `translateY(calc(env(safe-area-inset-top) + ${pull - 40}px))`, transition: start.current === null ? 'transform 240ms ease' : 'none' }}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.18)]" style={{ background: 'var(--s-bg, #fff)', color: 'var(--s-ink, #111)', opacity: Math.min(1, pull / 64) }}>
        <RotateCw size={18} strokeWidth={2} className={busy ? 'animate-spin' : ''} style={busy ? undefined : { transform: `rotate(${pull * 4}deg)` }} />
      </span>
    </div>
  );
}
