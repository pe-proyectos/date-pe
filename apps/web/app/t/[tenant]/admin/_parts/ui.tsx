'use client';

import { useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';

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

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-ink' : 'bg-line-2'}`}
    >
      <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label={title}>
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <div className="drawer-in absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-pop">
        <div className="flex h-16 items-center justify-between border-b border-line px-6">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-field" aria-label="Cerrar">
            <X size={19} strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
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
