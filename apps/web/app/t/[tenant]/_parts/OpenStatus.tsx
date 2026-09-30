'use client';

import { useEffect, useState } from 'react';
import { openState, type HourRow, type OpenState } from './hours';

/** "Abierto ahora, cierra a las 20:00", recalculado cada minuto con la hora de la barbería. */
export function OpenStatus({ hours, tz, initial, className = '' }: { hours: HourRow[]; tz: string; initial: OpenState | null; className?: string }) {
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
      <span className={`h-2 w-2 shrink-0 rounded-full ${s.open ? 'bg-ok' : 'bg-line-2'}`} aria-hidden />
      <span className={`tnum ${s.open ? 'font-medium text-ok' : 'text-mute'}`} suppressHydrationWarning>
        {s.label}
      </span>
    </span>
  );
}
