'use client';

import { createContext, useContext } from 'react';
import { API_BASE_CLIENT } from '@/lib/config';

export interface Sede { id: string; name: string; district?: string | null; address?: string | null }

export interface AdminCtx {
  tenant: string;
  token: string;
  logout: () => void;
  /** Sede elegida en el panel (null = todas, o barbería de una sola sede) */
  location?: string | null;
  locations?: Sede[];
  setLocation?: (id: string | null) => void;
}

export const AdminContext = createContext<AdminCtx | null>(null);

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('AdminContext missing');
  return ctx;
}

/** Cliente de API del panel: agrega tenant y sesión, y cierra sesión en 401. */
export function useApi() {
  const { tenant, token, logout, location } = useAdmin();
  return async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await fetch(`${API_BASE_CLIENT}/api${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        'X-Tenant-Slug': tenant,
        Authorization: `Bearer ${token}`,
        // Con varias sedes, cada pedido va filtrado por la sede elegida
        ...(location ? { 'X-Location-Id': location } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    // Solo se cierra sesión si la sesión venció o no es de esta barbería; un "sin permiso"
    // o una función apagada se muestran como error sin echar al usuario.
    const code = (data as { error?: string }).error;
    if (res.status === 401 || (res.status === 403 && (code === 'sin_acceso_al_tenant' || code === 'no_autenticado'))) {
      logout();
      throw new Error('no_autenticado');
    }
    if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? 'error'), { status: res.status, data });
    return data as T;
  };
}

export const soles = (c: number | string | null | undefined) => `S/ ${(Number(c ?? 0) / 100).toFixed(2)}`;
export const solesShort = (c: number) => {
  const v = c / 100;
  return v >= 1000 ? `S/ ${(v / 1000).toFixed(1)}k` : `S/ ${Math.round(v)}`;
};
