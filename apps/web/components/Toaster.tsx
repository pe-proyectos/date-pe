'use client';

import { useToasts } from '@/lib/toast';

export function Toaster() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`fade-up pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg backdrop-blur ${
            t.type === 'success' ? 'bg-emerald-500/95' : t.type === 'error' ? 'bg-red-500/95' : 'bg-slate-800/95'
          }`}
        >
          <span>
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}
          </span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
