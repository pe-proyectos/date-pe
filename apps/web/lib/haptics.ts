'use client';

/** Vibración corta en teléfonos que la soportan (Android). En iOS y escritorio no hace nada. */
function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate(pattern);
  } catch {
    /* sin soporte */
  }
}

export const haptic = {
  tap: () => vibrate(8),
  select: () => vibrate(12),
  success: () => vibrate([14, 50, 14]),
  error: () => vibrate([30, 60, 30]),
};
