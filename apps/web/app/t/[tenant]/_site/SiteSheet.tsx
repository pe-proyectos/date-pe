'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { useBackClose } from '@/lib/useBackClose';

/**
 * Hoja inferior con el ambiente de la barbería (colores y letras de la página).
 * Se arrastra hacia abajo para cerrar y el gesto "atrás" del teléfono también la cierra.
 * Se monta dentro de .site para heredar el tema.
 */
export function SiteSheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const close = useBackClose(open, onClose);
  const router = useRouter();
  const [host, setHost] = useState<Element | null>(null);
  const [dragY, setDragY] = useState(0);
  const start = useRef<{ y: number; t: number } | null>(null);

  useEffect(() => setHost(document.querySelector('.site') ?? document.body), []);

  useEffect(() => {
    if (!open) {
      setDragY(0);
      return;
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [open, close]);

  if (!open || !host) return null;

  const onDown = (e: React.PointerEvent) => {
    start.current = { y: e.clientY, t: Date.now() };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (start.current) setDragY(Math.max(0, e.clientY - start.current.y));
  };
  const onUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dy = e.clientY - start.current.y;
    const v = dy / Math.max(1, Date.now() - start.current.t);
    start.current = null;
    if (dy > 100 || v > 0.6) close();
    else setDragY(0);
  };

  // Un enlace dentro de la hoja: primero se cierra (eso vuelve atrás en el historial)
  // y recién después se navega; si no, el "atrás" cancelaría la navegación.
  const onClickCapture = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a');
    const href = a?.getAttribute('href');
    if (!a || !href || !href.startsWith('/') || a.target === '_blank' || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    close();
    setTimeout(() => router.push(href), 180);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal aria-label={title ?? 'Detalle'} onClickCapture={onClickCapture}>
      <div className="s-fade-in absolute inset-0 bg-black/45" onClick={close} style={{ opacity: dragY ? Math.max(0.2, 1 - dragY / 400) : undefined }} />
      <div
        className="s-sheet-up s-bg absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col rounded-t-[26px] shadow-[0_-12px_40px_rgba(0,0,0,0.25)] md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[26px]"
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: start.current ? 'none' : 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className="shrink-0 cursor-grab touch-none select-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="mx-auto mt-2.5 h-1.5 w-11 rounded-full" style={{ background: 'var(--s-line)' }} aria-hidden />
          <div className="flex min-h-12 items-center justify-between gap-3 px-5 pt-1">
            {title ? <p className="s-eyebrow">{title}</p> : <span />}
            <button type="button" onClick={close} className="s-surface -mr-1 flex h-10 w-10 items-center justify-center rounded-full" aria-label="Cerrar">
              <X size={19} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div className="overscroll-contain flex-1 overflow-y-auto px-5 pb-5 pt-1">{children}</div>
        {footer && <div className="s-line pb-safe shrink-0 border-t px-5 pt-3 [padding-bottom:max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    host,
  );
}
