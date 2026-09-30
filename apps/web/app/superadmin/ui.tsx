'use client';

import type { LucideIcon } from 'lucide-react';

export type Tone = 'ok' | 'warn' | 'bad' | 'mute';
export const TONES: Record<Tone, string> = {
  ok: 'bg-ok-tint text-ok',
  warn: 'bg-[#fff4e0] text-[#8a5300]',
  bad: 'bg-red-tint text-red-deep',
  mute: 'bg-field text-mute',
};

export function Pill({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium ${TONES[tone]}`}>{label}</span>;
}

/** Tiempo relativo en palabras: "hace 5 min", "hace 2 h", "hace 3 días". */
export function ago(iso: string | null | undefined) {
  if (!iso) return 'nunca';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

/** Minutos transcurridos desde una fecha ISO (Infinity si no hay fecha). */
export const minutesSince = (iso: string | null | undefined) => (iso ? (Date.now() - new Date(iso).getTime()) / 60000 : Infinity);

/** Fecha y hora en Lima. */
export function fechaHora(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d
    .toLocaleString('es-PE', { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
    .replace('.', '');
}

/** Fecha corta en Lima. */
export function fechaCorta(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric', timeZone: 'America/Lima' }).replace('.', '');
}

export function Card({ title, icon: Icon, right, children, className = '' }: { title: string; icon: LucideIcon; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-line p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2 text-[16px] font-semibold tracking-[-0.02em]">
          <Icon size={18} strokeWidth={1.75} className="shrink-0 text-soft" />
          <span className="truncate">{title}</span>
        </h3>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
