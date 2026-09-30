'use client';

import { useState } from 'react';
import { Check, ChevronDown, MapPin, Store } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { haptic } from '@/lib/haptics';
import { useAdmin, type Sede } from './api';

/** Sedes del panel. `multi` solo es true con dos o más sedes activas. */
export function useSede() {
  const { location = null, locations = [], setLocation = () => {} } = useAdmin();
  const multi = locations.length > 1;
  const current: Sede | null = locations.find((l) => l.id === location) ?? null;
  return { location: multi ? location : null, locations, setLocation, multi, current };
}

/** Selector de sede para la cabecera del panel (escritorio y teléfono). */
export function SedeSwitcher({ compact = false }: { compact?: boolean }) {
  const { multi, locations, current, setLocation, location } = useSede();
  const [open, setOpen] = useState(false);
  if (!multi) return null;
  const label = current?.name ?? 'Todas las sedes';
  return (
    <>
      <button
        type="button"
        onClick={() => { haptic.tap(); setOpen(true); }}
        className={
          compact
            ? 'flex min-h-10 min-w-0 max-w-[46vw] items-center gap-1.5 rounded-full bg-field px-3 text-[14px] font-medium active:bg-line'
            : 'flex w-full min-w-0 items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-[14px] hover:border-line-2'
        }
        aria-label={`Sede: ${label}. Cambiar sede`}
      >
        <MapPin size={16} strokeWidth={1.75} className="shrink-0 text-mute" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown size={16} strokeWidth={1.75} className="shrink-0 text-mute" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Elige la sede">
        <p className="-mt-1 mb-3 text-[14px] text-mute">La agenda, la fila, la caja y los reportes muestran solo lo de esa sede.</p>
        <ul className="-mx-2">
          {[{ id: null as string | null, name: 'Todas las sedes', district: 'Vista general y comparación' }, ...locations].map((l) => {
            const on = (l.id ?? null) === (location ?? null);
            return (
              <li key={l.id ?? 'todas'}>
                <button
                  type="button"
                  onClick={() => { haptic.tap(); setLocation(l.id); setOpen(false); }}
                  className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left active:bg-field"
                  aria-pressed={on}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-ink text-white' : 'bg-field'}`}>
                    {l.id ? <MapPin size={19} strokeWidth={1.75} /> : <Store size={19} strokeWidth={1.75} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px]">{l.name}</span>
                    {l.district && <span className="block truncate text-[13px] text-mute">{l.district}</span>}
                  </span>
                  {on && <Check size={18} strokeWidth={2} />}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}

/**
 * Para secciones que viven en un local físico (caja, fila): con varias sedes y la vista
 * "todas", pide elegir una. Devuelve null cuando ya hay sede (o hay una sola).
 */
export function SedeGate({ what }: { what: string }) {
  const { multi, location, locations, setLocation } = useSede();
  if (!multi || location) return null;
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-field"><MapPin size={22} strokeWidth={1.75} /></span>
      <h2 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">¿En qué sede estás?</h2>
      <p className="mt-1.5 text-[15px] text-mute">Cada sede tiene su {what}. Elige una; el panel la recuerda en este dispositivo.</p>
      <div className="mt-6 grid gap-2">
        {locations.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => { haptic.tap(); setLocation(l.id); }}
            className="flex min-h-14 items-center gap-3 rounded-xl border border-line px-4 text-left hover:border-ink active:bg-field"
          >
            <MapPin size={18} strokeWidth={1.75} className="shrink-0 text-mute" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-medium">{l.name}</span>
              {l.address && <span className="block truncate text-[13px] text-mute">{l.address}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
