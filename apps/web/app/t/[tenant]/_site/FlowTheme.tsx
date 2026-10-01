'use client';

import { useEffect } from 'react';

/**
 * Lleva los colores del ambiente a <html> mientras se está en la página, para que las
 * hojas y avisos que se montan fuera del contenedor también los usen.
 */
export function FlowTheme({ vars, bg }: { vars: Record<string, string>; bg: string }) {
  useEffect(() => {
    const root = document.documentElement;
    const prev: Record<string, string> = {};
    for (const [k, v] of Object.entries(vars)) {
      prev[k] = root.style.getPropertyValue(k);
      root.style.setProperty(k, v);
    }
    const prevBg = document.body.style.background;
    document.body.style.background = bg;
    return () => {
      for (const k of Object.keys(vars)) {
        if (prev[k]) root.style.setProperty(k, prev[k]);
        else root.style.removeProperty(k);
      }
      document.body.style.background = prevBg;
    };
  }, [vars, bg]);
  return null;
}
