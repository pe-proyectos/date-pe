'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, UsersRound } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';

interface QueueState { open: boolean; opensAt: string | null; waitingCount: number; estimatedWaitMin: number | null }

/** "¿Sin cita? Saca tu turno": cuántas personas esperan ahora, se actualiza cada 30 segundos. */
export function QueueCard({ tenant }: { tenant: string }) {
  const [q, setQ] = useState<QueueState | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`${API_BASE_CLIENT}/api/public/queue`, { headers: { 'X-Tenant-Slug': tenant } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: QueueState | null) => {
          if (alive && d) setQ({ open: !!d.open, opensAt: d.opensAt ?? null, waitingCount: Number(d.waitingCount ?? 0), estimatedWaitMin: d.estimatedWaitMin ?? null });
        })
        .catch(() => {});
    load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [tenant]);

  let status = 'Mira cuántos hay antes que tú y te avisamos cuando te toque.';
  if (q && !q.open) status = q.opensAt ? `La fila abre a las ${q.opensAt}.` : 'La fila está cerrada por ahora.';
  else if (q && q.waitingCount === 0) status = 'No hay nadie esperando. Te atienden al llegar.';
  else if (q) {
    const people = q.waitingCount === 1 ? '1 persona esperando' : `${q.waitingCount} personas esperando`;
    status = q.estimatedWaitMin ? `${people}, unos ${q.estimatedWaitMin} min.` : `${people}.`;
  }

  return (
    <Link href="/fila" className="s-surface s-radius group flex h-full flex-col justify-between gap-8 p-6 md:p-8">
      <div className="flex items-center justify-between gap-3">
        <span className="s-eyebrow">Sin cita</span>
        {q?.open && (
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#16a34a] opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#16a34a]" />
            </span>
            En vivo
          </span>
        )}
      </div>
      <div>
        <p className="s-display text-[34px] md:text-[40px]">Saca tu turno</p>
        <p className="tnum s-mute mt-2 text-[16px]" aria-live="polite">{status}</p>
      </div>
      <span className="flex items-center gap-2 text-[15px] font-semibold">
        <UsersRound size={18} strokeWidth={1.75} /> Entrar a la fila virtual
        <ChevronRight size={18} strokeWidth={1.75} className="nudge-x" />
      </span>
    </Link>
  );
}
