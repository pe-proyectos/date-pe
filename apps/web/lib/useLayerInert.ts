'use client';

import { useEffect } from 'react';

let openLayers = 0;

/**
 * Mientras haya una capa abierta (hoja o visor), el resto de la página queda inerte:
 * ni el foco ni los toques llegan a la cabecera o a las barras fijas de abajo.
 */
export function useLayerInert(open: boolean) {
  useEffect(() => {
    if (!open) return;
    openLayers += 1;
    const apply = () => {
      for (const el of Array.from(document.body.children)) {
        if (el instanceof HTMLElement && !el.hasAttribute('data-layer')) el.inert = openLayers > 0;
      }
    };
    // Espera a que el portal esté en el DOM antes de marcar a sus hermanos.
    const id = requestAnimationFrame(apply);
    return () => {
      cancelAnimationFrame(id);
      openLayers -= 1;
      if (openLayers === 0) for (const el of Array.from(document.body.children)) if (el instanceof HTMLElement) el.inert = false;
    };
  }, [open]);
}
