import { API_BASE_SERVER } from './config';

interface Opts {
  tenantSlug?: string;
  token?: string;
  method?: string;
  body?: unknown;
  cache?: RequestCache;
  revalidate?: number;
}

// Fetch a la API desde componentes de servidor.
export async function apiFetch<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.tenantSlug) headers['X-Tenant-Slug'] = opts.tenantSlug;
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const res = await fetch(`${API_BASE_SERVER}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: opts.cache ?? 'no-store',
    next: opts.revalidate ? { revalidate: opts.revalidate } : undefined,
  });
  if (!res.ok) throw new Error(`API ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export interface TenantSite {
  tenant: { slug: string; name: string };
  branding: {
    logo_url: string | null;
    cover_url: string | null;
    color_primary: string;
    color_secondary: string;
    tagline: string | null;
    about: string | null;
    instagram: string | null;
    whatsapp: string | null;
  } | null;
  settings: { timezone: string; slot_interval_min: number; deposit_percent: number; require_deposit: boolean } | null;
  locations: Array<{ id: string; name: string; address: string | null; district: string | null; province: string | null; phone: string | null }>;
  staff: Array<{ id: string; name: string; photo_url: string | null; bio: string | null; specialties: string[] | null; rating_avg: string; rating_count: number }>;
  services: Array<{ id: string; category: string | null; name: string; description: string | null; photo_url: string | null; duration_min: number; price_cents: number }>;
}

export interface SearchResult {
  slug: string;
  name: string;
  location_id: string;
  location_name: string;
  district: string | null;
  province: string | null;
  logo_url: string | null;
  cover_url: string | null;
  tagline: string | null;
  desde_cents: number | null;
  rating: string | null;
  barberos: string;
}

export const soles = (cents: number | null) =>
  cents == null ? '—' : `S/ ${(cents / 100).toFixed(2)}`;
