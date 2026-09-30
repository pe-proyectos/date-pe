'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useBackClose } from '@/lib/useBackClose';
import { useLayerInert } from '@/lib/useLayerInert';

export interface LightboxImage { src: string; alt: string }

/**
 * Visor a pantalla completa: pinch y doble toque para ampliar, arrastrar para moverse,
 * deslizar a los lados para cambiar de foto y hacia abajo para cerrar.
 */
export function Lightbox({ images, index, onClose }: { images: LightboxImage[]; index: number | null; onClose: () => void }) {
  const open = index !== null;
  const close = useBackClose(open, onClose);
  useLayerInert(open);
  const [i, setI] = useState(index ?? 0);
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(true);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; s: number; x: number; y: number; cx: number; cy: number; sx: number; sy: number; t: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    if (index !== null) {
      setI(index);
      setT({ s: 1, x: 0, y: 0 });
    }
  }, [index]);

  const go = useCallback(
    (d: number) => {
      setAnimate(true);
      setT({ s: 1, x: 0, y: 0 });
      setI((v) => (v + d + images.length) % images.length);
    },
    [images.length],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, go, close]);

  if (!open || images.length === 0) return null;
  const img = images[i];

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setAnimate(false);
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const [a, b] = pts;
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), s: t.s, x: t.x, y: t.y, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, sx: 0, sy: 0, t: Date.now() };
    } else {
      gesture.current = { dist: 0, s: t.s, x: t.x, y: t.y, cx: 0, cy: 0, sx: e.clientX, sy: e.clientY, t: Date.now() };
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (pts.length === 2 && g.dist) {
      const [a, b] = pts;
      const s = Math.min(4, Math.max(1, (g.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist));
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      setT({ s, x: g.x + (cx - g.cx), y: g.y + (cy - g.cy) });
    } else if (pts.length === 1) {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (t.s > 1) setT({ s: t.s, x: g.x + dx, y: g.y + dy });
      else setT({ s: 1, x: Math.abs(dx) > Math.abs(dy) ? dx : 0, y: Math.abs(dy) > Math.abs(dx) && dy > 0 ? dy : 0 });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    setAnimate(true);
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!g) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    const quick = Date.now() - g.t < 250 && Math.hypot(dx, dy) < 10;
    if (quick && !g.dist) {
      // Doble toque: alterna zoom
      if (Date.now() - lastTap.current < 300) {
        setT(t.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: (window.innerWidth / 2 - e.clientX) * 1.5, y: (window.innerHeight / 2 - e.clientY) * 1.5 });
        lastTap.current = 0;
      } else lastTap.current = Date.now();
      return;
    }
    if (t.s <= 1.02) {
      if (g.dist) return setT({ s: 1, x: 0, y: 0 });
      if (dy > 120 && Math.abs(dy) > Math.abs(dx)) return close();
      if (Math.abs(dx) > 70 && images.length > 1) return go(dx < 0 ? 1 : -1);
      setT({ s: 1, x: 0, y: 0 });
    }
  };

  const fade = t.s === 1 && t.y > 0 ? Math.max(0.3, 1 - t.y / 500) : 1;

  return createPortal(
    <div data-layer className="fixed inset-0 z-[70] select-none" role="dialog" aria-modal aria-label="Fotos">
      <div className="fade-in absolute inset-0 bg-black" style={{ opacity: fade }} />
      <div className="pt-safe absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-2 text-white">
        <button type="button" onClick={close} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur" aria-label="Cerrar">
          <X size={22} strokeWidth={1.75} />
        </button>
        {images.length > 1 && <span className="tnum rounded-full bg-white/10 px-3 py-1.5 text-[14px] backdrop-blur">{i + 1} de {images.length}</span>}
        <span className="w-11" />
      </div>

      <div
        className="absolute inset-0 flex touch-none items-center justify-center"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={img.src}
          src={img.src}
          alt={img.alt}
          draggable={false}
          className="fade-in max-h-full max-w-full object-contain"
          style={{
            transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`,
            transition: animate ? 'transform 280ms var(--ease-out)' : 'none',
          }}
        />
      </div>

      {images.length > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} className="absolute left-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20 md:flex" aria-label="Foto anterior">
            <ChevronLeft size={24} strokeWidth={1.75} />
          </button>
          <button type="button" onClick={() => go(1)} className="absolute right-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20 md:flex" aria-label="Foto siguiente">
            <ChevronRight size={24} strokeWidth={1.75} />
          </button>
        </>
      )}
      <p className="pb-safe absolute inset-x-0 bottom-0 px-6 pt-4 text-center text-[14px] text-white/80">{img.alt}</p>
    </div>,
    document.body,
  );
}
