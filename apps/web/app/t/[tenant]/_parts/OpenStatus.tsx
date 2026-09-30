'use client';

import { useEffect, useState } from 'react';
import { openState, type HourRow, type OpenState } from './hours';

/** "Abierto ahora, cierra a las 20:00", recalculado cada minuto con la hora de la barbería. */
export function OpenStatus({ hours, tz, initial, className = '', light = false }: { hours: HourRow[]; tz: string; initial: OpenState | null; className?: string; light?: boolean }) {
  const [s, setS] = useState(initial);

  useEffect(() => {
    const tick = () => setS(openState(hours, tz));
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [hours, tz]);

  if (!s) return null;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${s.open ? (light ? 'bg-[#4ade80]' : 'bg-ok') : 'bg-line-2'}`} aria-hidden />
      <span className={`tnum ${light ? (s.open ? 'font-medium text-white' : 'text-white/75') : s.open ? 'font-medium text-ok' : 'opacity-70'}`} suppressHydrationWarning>
        {s.label}
      </span>
    </span>
  );
}
