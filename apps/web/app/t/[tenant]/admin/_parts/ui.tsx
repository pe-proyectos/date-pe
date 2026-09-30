'use client';

import { createContext, useContext } from 'react';
import { Loader2 } from 'lucide-react';
import { Sheet } from '@/components/Sheet';

/* ------------------------------ Sesión del panel: rol y funciones ------------------------------ */

export type Role = 'owner' | 'manager' | 'cashier' | 'staff';
export type Features = Record<string, boolean>;
export interface PanelMe { id: string; name: string; email: string; role: Role; staffId: string | null }
export interface PanelInfo {
  me: PanelMe | null;
  features: Features;
  pushPublicKey: string | null;
  /** Actualiza las funciones activas (el menú se ajusta al instante). */
  setFeatures: (f: Features) => void;
}

export const PanelContext = createContext<PanelInfo | null>(null);

/** Rol y funciones del usuario del panel. Sin proveedor se comporta como dueño con todo activo. */
export function usePanel(): PanelInfo {
  return useContext(PanelContext) ?? { me: null, features: {}, pushPublicKey: null, setFeatures: () => {} };
}

/** Una función está activa salvo que la barbería la haya apagado. */
export const featureOn = (f: Features, key: string) => f[key] !== false;

/** Dueño o encargado: pueden configurar la barbería. */
export const canManage = (role: Role | null | undefined) => !role || role === 'owner' || role === 'manager';

export const ROLE_LABEL: Record<Role, string> = { owner: 'Dueño', manager: 'Encargado', cashier: 'Caja', staff: 'Barbero' };

/**
 * Cierra una hoja y luego navega a otra sección por hash (ej. "caja?cita=...").
 * Espera a que la hoja retire su entrada del historial para no deshacer la navegación.
 */
export function goHashAfterClose(close: () => void, hash: string) {
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', fire);
    setTimeout(() => { window.location.hash = hash; }, 0);
  };
  window.addEventListener('popstate', fire);
  close();
  setTimeout(fire, 400);
}

/** Selector segmentado en píldoras (una opción activa). */
export function Segmented<T extends string>({ value, onChange, options, label, className = '' }: { value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[]; label: string; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`} role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`min-h-11 rounded-full px-4 text-[15px] transition-colors ${value === v ? 'bg-ink text-white' : 'bg-field text-ink hover:bg-line'}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.035em]">{title}</h1>
        {sub && <p className="mt-1 text-[15px] text-mute">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Btn({
  children, onClick, variant = 'primary', type = 'button', disabled, busy, className = '',
}: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  type?: 'button' | 'submit'; disabled?: boolean; busy?: boolean; className?: string;
}) {
  const styles = {
    primary: 'bg-ink text-white hover:bg-ink-2',
    secondary: 'border border-line bg-white hover:border-ink',
    ghost: 'hover:bg-field',
    danger: 'text-red hover:bg-red-tint',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy} className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}>
      {busy && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, label, states }: { checked: boolean; onChange: (v: boolean) => void; label: string; states?: [string, string] }) {
  const btn = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={states ? `${label}: ${checked ? states[0] : states[1]}` : label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-ink' : 'bg-line-2'}`}
    >
      <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
  if (!states) return btn;
  // Estado visible junto al interruptor: se lee sin tener que adivinar qué controla
  return (
    // En el teléfono el estado va debajo del interruptor para no robarle ancho al contenido
    <span className="inline-flex shrink-0 flex-col-reverse items-center gap-1 sm:flex-row sm:gap-2">
      <span className={`text-[12px] sm:w-[4.5rem] sm:text-right sm:text-[13px] ${checked ? 'text-ink' : 'text-soft'}`} aria-hidden>{checked ? states[0] : states[1]}</span>
      {btn}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px] font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[13px] text-soft">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-xl border border-line-2 bg-white px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-ink';

export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} footer={footer}>
      {children}
    </Sheet>
  );
}

export function Empty({ icon: Icon, title, body, action }: { icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start rounded-xl border border-dashed border-line-2 p-8">
      <Icon size={26} strokeWidth={1.5} className="text-soft" />
      <p className="mt-4 text-[17px] font-medium tracking-[-0.02em]">{title}</p>
      {body && <p className="mt-1 max-w-md text-[15px] text-mute">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-field" />)}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    pending: ['Pendiente de adelanto', 'bg-[#fff4e0] text-[#8a5300]'],
    confirmed: ['Confirmada', 'bg-[#e8eefb] text-[#1d3f94]'],
    completed: ['Completada', 'bg-ok-tint text-ok'],
    no_show: ['No asistió', 'bg-red-tint text-red-deep'],
    cancelled: ['Cancelada', 'bg-field text-mute'],
  };
  const [label, cls] = map[status] ?? [status, 'bg-field text-mute'];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium ${cls}`}>{label}</span>;
}
