'use client';

import { CircleCheck, CircleAlert, Info } from 'lucide-react';
import { useToasts } from '@/lib/toast';

export function Toaster() {
  const toasts = useToasts();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-5 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-auto md:left-auto md:right-5 md:top-5 md:items-end"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon = t.type === 'success' ? CircleCheck : t.type === 'error' ? CircleAlert : Info;
        return (
          <div
            key={t.id}
            className="rise-in pointer-events-auto flex max-w-sm items-center gap-3 rounded-full bg-ink py-3 pl-4 pr-5 text-[14px] text-white shadow-pop"
          >
            <Icon
              size={18}
              strokeWidth={2}
              className={t.type === 'success' ? 'text-emerald-400' : t.type === 'error' ? 'text-red-400' : 'text-white/70'}
            />
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
