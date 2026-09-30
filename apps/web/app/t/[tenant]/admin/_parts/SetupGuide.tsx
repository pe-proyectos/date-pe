'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronRight, X, MapPin, Users, ListOrdered, CalendarCheck } from 'lucide-react';
import { useApi, soles } from './api';
import { usePanel, canManage } from './ui';
import { useSede } from './sede';
import { haptic } from '@/lib/haptics';

interface Step { id: string; title: string; body: string; done: boolean; href: string; action: string; optional?: boolean }
interface Setup { steps: Step[]; done: number; total: number; complete: boolean; dismissed: boolean }

/**
 * Guía de primeros pasos para una barbería recién aprobada. Cada paso se marca solo
 * cuando el dato existe (logo, servicios, horarios...). Desaparece al completar lo
 * obligatorio, o si el dueño la oculta.
 */
export function SetupGuide() {
  const api = useApi();
  const { me } = usePanel();
  const [s, setS] = useState<Setup | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!canManage(me?.role)) return;
    api<Setup>('/admin/setup').then(setS).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role]);

  if (!s || hidden || s.dismissed || s.complete) return null;
  const pct = Math.round((s.done / s.total) * 100);
  const next = s.steps.find((x) => !x.done && !x.optional) ?? s.steps.find((x) => !x.done);

  function open(step: Step) {
    haptic.tap();
    // Pasos que no se pueden detectar solos: se marcan al abrirlos
    if (step.id === 'share' || step.id === 'team' || step.id === 'clients') {
      api('/admin/setup', { method: 'PATCH', body: { [step.id]: true } }).catch(() => {});
    }
    window.location.hash = step.href.slice(1);
  }

  function dismiss() {
    haptic.tap();
    setHidden(true);
    api('/admin/setup', { method: 'PATCH', body: { dismissed: true } }).catch(() => {});
  }

  return (
    <section className="mb-8 rounded-xl border border-line p-5 md:p-6" aria-labelledby="setup-title">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="setup-title" className="text-[19px] font-semibold tracking-[-0.02em]">Deja tu barbería lista</h2>
          <p className="mt-0.5 text-[14px] text-mute">
            {s.done} de {s.total} pasos. {next ? `Sigue: ${next.title.toLowerCase()}.` : ''}
          </p>
        </div>
        <button type="button" onClick={dismiss} className="-mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-mute hover:bg-field" aria-label="Ocultar la guía">
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-field" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la configuración">
        <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ul className="-mx-2 mt-4 grid gap-1 md:grid-cols-2">
        {s.steps.map((step) => (
          <li key={step.id} className="min-w-0">
            <button
              type="button"
              onClick={() => open(step)}
              className={`flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-field ${step.id === next?.id ? 'bg-field' : ''}`}
            >
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${step.done ? 'bg-ok text-white' : 'border-[1.5px] border-line-2'}`}>
                {step.done && <Check size={14} strokeWidth={2.5} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[15px] font-medium ${step.done ? 'text-mute line-through decoration-line-2' : ''}`}>
                  {step.title}
                  {step.optional && !step.done && <span className="ml-1.5 text-[12px] font-normal text-soft">opcional</span>}
                </span>
                {!step.done && <span className="block text-[13px] text-mute">{step.body}</span>}
              </span>
              {!step.done && <ChevronRight size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-soft" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface LocRow {
  id: string; name: string; district: string | null; ventas: number; total_cents: number; en_fila: number; atendiendo: number;
  citas_pendientes: number; citas_completadas: number; barberos_ahora: number; caja_abierta: boolean;
}

/** Con varias sedes y la vista "todas": cómo va cada sede ahora mismo, y entrar a una con un toque. */
export function SedesOverview() {
  const api = useApi();
  const { multi, location, setLocation } = useSede();
  const { me } = usePanel();
  const [rows, setRows] = useState<LocRow[] | null>(null);

  useEffect(() => {
    if (!multi || location || !canManage(me?.role)) return;
    api<{ locations: LocRow[] }>('/admin/locations/overview').then((d) => setRows(d.locations)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multi, location, me?.role]);

  if (!multi || location || !rows) return null;
  const best = Math.max(...rows.map((r) => r.total_cents), 1);

  return (
    <section className="mb-10" aria-labelledby="sedes-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="sedes-title" className="text-[19px] font-semibold tracking-[-0.02em]">Tus sedes hoy</h2>
          <p className="text-[14px] text-mute">Toca una sede para ver su agenda, su fila y su caja.</p>
        </div>
        <p className="tnum shrink-0 text-[15px] text-mute">Total {soles(rows.reduce((a, r) => a + r.total_cents, 0))}</p>
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => { haptic.tap(); setLocation(r.id); }}
            className="min-w-0 rounded-xl border border-line p-4 text-left transition-colors hover:border-ink"
          >
            <div className="flex items-center gap-2">
              <MapPin size={16} strokeWidth={1.75} className="shrink-0 text-mute" />
              <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{r.name}</span>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${r.caja_abierta ? 'bg-ok-tint text-ok' : 'bg-field text-mute'}`}>
                {r.caja_abierta ? 'Caja abierta' : 'Caja cerrada'}
              </span>
            </div>
            <p className="tnum mt-3 text-[28px] font-semibold leading-none tracking-[-0.03em]">{soles(r.total_cents)}</p>
            <p className="mt-1 text-[13px] text-mute">{r.ventas === 1 ? '1 venta' : `${r.ventas} ventas`} hoy</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-field">
              <div className="h-full rounded-full bg-ink" style={{ width: `${Math.round((r.total_cents / best) * 100)}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-[13px]">
              <span className="flex min-w-0 items-center gap-1.5 text-mute"><ListOrdered size={14} strokeWidth={1.75} className="shrink-0" /><span className="truncate"><b className="font-medium text-ink">{r.en_fila}</b> en fila</span></span>
              <span className="flex min-w-0 items-center gap-1.5 text-mute"><CalendarCheck size={14} strokeWidth={1.75} className="shrink-0" /><span className="truncate"><b className="font-medium text-ink">{r.citas_pendientes}</b> citas</span></span>
              <span className="flex min-w-0 items-center gap-1.5 text-mute"><Users size={14} strokeWidth={1.75} className="shrink-0" /><span className="truncate"><b className="font-medium text-ink">{r.barberos_ahora}</b> barberos</span></span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
