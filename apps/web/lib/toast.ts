'use client';

import { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

let toasts: Toast[] = [];
const listeners = new Set<(t: Toast[]) => void>();
let nextId = 1;

function emit() {
  for (const l of listeners) l([...toasts]);
}

function push(type: ToastType, message: string, ms = 3500) {
  const id = nextId++;
  toasts = [...toasts, { id, type, message }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, ms);
}

export const toast = {
  success: (m: string) => push('success', m),
  error: (m: string) => push('error', m),
  info: (m: string) => push('info', m),
};

export function useToasts(): Toast[] {
  const [state, setState] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}
