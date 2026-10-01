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

export type SiteMood = 'clasica' | 'urbana' | 'minimal' | 'lujo' | 'vintage';
export interface SiteTheme { mood?: SiteMood; hero?: 'imagen' | 'tipografia'; headline?: string; marquee?: boolean; since?: number | null; /** Punto de foco horizontal de la portada (0 a 100) */ focus?: number; /** Servicio estrella y su foto */ signature?: { serviceId?: string; image?: string } }

export interface TenantSite {
  tenant: { slug: string; name: string; is_demo?: boolean; /** false = suscripción vencida: no acepta reservas. */ available?: boolean };
  branding: {
    logo_url: string | null;
    cover_url: string | null;
    color_primary: string;
    color_secondary: string;
    tagline: string | null;
    about: string | null;
    instagram: string | null;
    whatsapp: string | null;
    /** Fotos del local y de trabajos (la portada va aparte). */
    gallery?: Array<{ url: string; caption?: string | null; staffId?: string | null }> | null;
    /** false = sin la mención "Reservas con date.pe" en el pie. */
    show_powered_by?: boolean | null;
    /** Estilo de la página pública elegido en el panel. */
    site_theme?: SiteTheme | null;
  } | null;
  /** Funciones activas de la barbería (fila, gift cards en línea, paquetes...). */
  features?: Partial<Record<'booking' | 'queue' | 'tv' | 'pos' | 'tips' | 'products' | 'packages' | 'rewards' | 'giftcards_online' | 'memberships_sale' | 'marketing' | 'client_photos' | 'push' | 'whatsapp', boolean>>;
  /** Enlace para dejar reseña en Google Business Profile. */
  googleReviewUrl?: string | null;
  settings: {
    timezone: string;
    slot_interval_min: number;
    deposit_percent: number;
    require_deposit: boolean;
    cancel_window_hours: number;
    allow_client_reschedule?: boolean;
    require_verification?: boolean;
    referral_enabled?: boolean;
    referral_discount_percent?: number;
  } | null;
  locations: Array<{ id: string; name: string; address: string | null; district: string | null; province: string | null; lat: number | null; lng: number | null; phone: string | null }>;
  staff: Array<{ id: string; /** null = atiende en todas las sedes. */ location_id?: string | null; name: string; photo_url: string | null; bio: string | null; specialties: string[] | null; rating_avg: string; rating_count: number }>;
  services: Array<{ id: string; category: string | null; name: string; description: string | null; photo_url: string | null; duration_min: number; price_cents: number; /** Extra que se suma a un servicio principal; no se reserva solo. */ is_addon?: boolean; /** Sedes donde se ofrece (vacío = todas) */ location_ids?: string[] }>;
  reviews?: Array<{ stars: number; comment: string | null; reply: string | null; created_at: string; staff_name: string | null; client_name: string | null }>;
  rating?: { avg: string | null; count: string };
  memberships?: Array<{ id: string; name: string; description: string | null; price_cents: number; period: 'month' | 'year'; perks: string | null }>;
  hours?: Array<{ day_of_week: number; open: string; close: string }>;
  /** Días y horas de cada barbero */
  staffHours?: Array<{ staff_id: string; day_of_week: number; open: string; close: string }>;
  /** Horario de cada sede */
  locationHours?: Array<{ location_id: string; day_of_week: number; open: string; close: string }>;
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
  is_demo?: boolean;
}

export const soles = (cents: number | null | undefined) =>
  cents == null ? '' : `S/ ${(Number(cents) / 100).toFixed(2)}`;
