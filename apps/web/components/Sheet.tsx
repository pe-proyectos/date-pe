'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useBackClose } from '@/lib/useBackClose';
import { useLayerInert } from '@/lib/useLayerInert';

/**
 * Hoja adaptable: en el teléfono es una hoja inferior que se arrastra para cerrar;
 * en escritorio, un panel lateral. El botón o gesto "atrás" del teléfono la cierra.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  full = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** En el teléfono ocupa toda la pantalla (buscador, formularios largos). */
  full?: boolean;
}) {
  const close = useBackClose(open, onClose);
  useLayerInert(open);
  const [dragY, setDragY] = useState(0);
  const start = useRef<{ y: number; t: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) setDragY(0);
  }, [open]);

  if (!open) return null;

  const onDown = (e: React.PointerEvent) => {
    if (full) return;
    start.current = { y: e.clientY, t: Date.now() };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDragY(Math.max(0, e.clientY - start.current.y));
  };
  const onUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dy = e.clientY - start.current.y;
    const v = dy / Math.max(1, Date.now() - start.current.t);
    start.current = null;
    if (dy > 110 || v > 0.6) close();
    else setDragY(0);
  };

  // Se monta en <body> para quedar por encima de cabeceras y barras fijas, sin importar dónde se use.
  return createPortal(
    <div data-layer className="fixed inset-0 z-[60]" role="dialog" aria-modal aria-label={title}>
      <div className="fade-in absolute inset-0 bg-ink/30" onClick={close} style={{ opacity: dragY ? Math.max(0.2, 1 - dragY / 400) : undefined }} />
      <div
        className={`sheet-up absolute inset-x-0 bottom-0 flex flex-col bg-white shadow-pop md:inset-y-0 md:left-auto md:right-0 md:w-full md:max-w-md md:max-h-none md:rounded-none ${
          full ? 'top-0 rounded-none' : 'max-h-[92dvh] rounded-t-[20px]'
        }`}
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: start.current ? 'none' : 'transform 300ms var(--ease-out)' }}
      >
        <div
          className={`shrink-0 select-none ${full ? 'pt-safe' : 'cursor-grab touch-none md:cursor-auto md:touch-auto'}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {!full && <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-2 md:hidden" aria-hidden />}
          <div className="flex h-14 items-center justify-between border-b border-line px-5 md:h-16 md:px-6">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
            <button type="button" onClick={close} className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full hover:bg-field" aria-label="Cerrar">
              <X size={20} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div className="overscroll-contain flex-1 overflow-y-auto px-5 py-5 md:px-6 md:py-6">{children}</div>
        {footer && <div className="pb-safe flex shrink-0 justify-end gap-2 border-t border-line px-5 pt-3 md:px-6 md:pb-4 md:pt-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
