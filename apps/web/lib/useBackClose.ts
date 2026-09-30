'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Integra una capa (hoja, visor, buscador) con el historial del navegador:
 * al abrir agrega una entrada; el gesto o botón "atrás" la cierra.
 * Devuelve `close()` para cerrar desde la UI manteniendo el historial en orden.
 */
export function useBackClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = Math.random().toString(36).slice(2);
    idRef.current = id;
    window.history.pushState({ ...(window.history.state ?? {}), __layer: id }, '');
    const onPop = () => {
      if (idRef.current !== id) return;
      idRef.current = null;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Si se cerró desde la UI, retiramos nuestra entrada del historial.
      if (idRef.current === id && window.history.state?.__layer === id) {
        idRef.current = null;
        window.history.back();
      }
    };
  }, [open]);

  return useCallback(() => {
    if (idRef.current && window.history.state?.__layer === idRef.current) {
      window.history.back(); // dispara popstate, que llama a onClose
    } else {
      onCloseRef.current();
    }
  }, []);
}
