'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';

/** Fecha YYYY-MM-DD en la zona de la barbería, sumando días. */
function isoDay(tz: string, plus = 0) {
  return new Date(Date.now() + plus * 86_400_000).toLocaleDateString('en-CA', { timeZone: tz });
}

/**
 * "Próximo horario libre: hoy 16:30". Busca hoy y, si no hay, los próximos días.
 * Lleva directo a reservar ese día con el servicio más pedido.
 */
export function NextSlot({ tenant, serviceId, tz, light = false, staffId, label = 'Próximo horario libre' }: { tenant: string; serviceId: string; tz: string; light?: boolean; staffId?: string; label?: string }) {
  const [slot, setSlot] = useState<{ start: string; day: number; date: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      for (let d = 0; d < 4; d++) {
        const date = isoDay(tz, d);
        try {
          const r = await fetch(`${API_BASE_CLIENT}/api/public/availability?date=${date}&serviceId=${serviceId}${staffId ? `&staffId=${staffId}` : ''}`, { headers: { 'X-Tenant-Slug': tenant } });
          if (!r.ok) return;
          const j = (await r.json()) as { slots?: Array<{ start: string }> };
          const next = (j.slots ?? []).map((s) => s.start).filter((s) => new Date(s).getTime() > Date.now() + 10 * 60_000).sort()[0];
          if (next) {
            if (alive) setSlot({ start: next, day: d, date });
            return;
          }
        } catch {
          return;
        }
      }
    })();
    return () => { alive = false; };
  }, [tenant, serviceId, tz, staffId]);

  if (!slot) return null;
  const time = new Date(slot.start).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
  const when = slot.day === 0 ? 'hoy' : slot.day === 1 ? 'mañana' : new Date(slot.start).toLocaleDateString('es-PE', { weekday: 'long', timeZone: tz });
  return (
    <Link
      href={`/reservar?servicio=${serviceId}&fecha=${slot.date}${staffId ? `&barbero=${staffId}` : ''}`}
      className={`inline-flex items-center gap-2 font-semibold underline-offset-4 hover:underline ${light ? 'text-white' : ''}`}
    >
      <CalendarClock size={16} strokeWidth={1.75} />
      <span className="tnum">{label}: {when} {time}</span>
    </Link>
  );
}
