'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, UsersRound } from 'lucide-react';
import { API_BASE_CLIENT } from '@/lib/config';

interface QueueState { open: boolean; opensAt: string | null; waitingCount: number; estimatedWaitMin: number | null }

/** "¿Sin cita? Saca tu turno": cuántas personas esperan ahora, se actualiza cada 30 segundos. */
export function QueueCard({ tenant, accent, onAccent }: { tenant: string; accent: string; onAccent: string }) {
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
    <Link href="/fila" className="group flex items-center gap-4 rounded-xl border border-line p-4 transition-colors hover:border-ink">
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: accent, color: onAccent }}>
        <UsersRound size={20} strokeWidth={1.75} />
        {q?.open && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-ok" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium tracking-[-0.01em]">¿Sin cita? Saca tu turno</span>
        <span className="tnum block text-[14px] text-mute" aria-live="polite">{status}</span>
      </span>
      <ChevronRight size={18} strokeWidth={1.75} className="nudge-x shrink-0 text-mute" />
    </Link>
  );
}
