import { cache } from 'react';
import { apiFetch, type TenantSite } from '@/lib/api';
import { resolveTheme, MAP_PALETTES } from './theme';
import { openState, weekTable, nowIn } from '../_parts/hours';
import type { PublicLocation } from '../_parts/sede';

/** El sitio de la barbería, pedido una sola vez por visita (layout y página lo comparten). */
export const getSite = cache(async (tenant: string): Promise<TenantSite | null> => {
  try {
    return await apiFetch<TenantSite>('/api/public/site', { tenantSlug: tenant });
  } catch {
    return null;
  }
});

/** "Barranco", "Barranco y Miraflores", "Barranco, Miraflores y 2 más". */
export function listDistricts(names: string[]) {
  const u = [...new Set(names.filter(Boolean))];
  if (u.length <= 1) return u[0] ?? '';
  if (u.length === 2) return `${u[0]} y ${u[1]}`;
  if (u.length === 3) return `${u[0]}, ${u[1]} y ${u[2]}`;
  return `${u[0]}, ${u[1]} y ${u.length - 2} más`;
}

/** "Barbería Juana" se muestra como "Barbería" chico y "Juana" en grande. */
export function splitName(name: string): { prefix: string | null; main: string } {
  const m = name.match(/^(barber[ií]a|barbershop|barber shop|peluquer[ií]a)\s+(.+)$/i);
  return m ? { prefix: m[1], main: m[2] } : { prefix: null, main: name };
}

/** Todo lo que las páginas de la barbería calculan a partir del sitio. */
export function derive(site: TenantSite, tenant: string) {
  const theme = resolveTheme(site.branding?.site_theme, site.branding?.color_primary);
  const loc = site.locations[0];
  const rating = site.rating?.avg ? Number(site.rating.avg) : null;
  const reviewCount = Number(site.rating?.count ?? 0);
  const mainServices = site.services.filter((s) => !s.is_addon);
  const available = site.tenant.available !== false;
  const multiLoc = site.locations.length >= 2;
  const mapsFor = (l: TenantSite['locations'][number]) =>
    l.lat != null && l.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${site.tenant.name} ${[l.address ?? l.name, l.district].filter(Boolean).join(', ')}`)}`;
  const publicLocations: PublicLocation[] = site.locations.map((l) => ({ id: l.id, name: l.name, address: l.address, district: l.district, maps: mapsFor(l) }));
  const from = mainServices.length ? Math.min(...mainServices.map((s) => s.price_cents)) : null;
  const tz = site.settings?.timezone || 'America/Lima';
  const hours = site.hours ?? [];
  const status = openState(hours, tz);
  const week = weekTable(hours);
  const todayDow = nowIn(tz).dow;
  const todayRow = week.find((d) => d.dow === todayDow);
  const features = site.features ?? {};
  const showQueue = available && !!features.queue;
  const showGifts = available && !!(features.giftcards_online || features.packages);
  const gallery = (site.branding?.gallery ?? []).filter((g) => g?.url);
  const galleryPhotos = gallery.map((g, i) => ({ src: g.url, alt: g.caption || `Foto ${i + 1} de ${site.tenant.name}`, staffId: g.staffId ?? null }));
  const cover = site.branding?.cover_url ?? galleryPhotos[0]?.src ?? null;
  const photoHero = theme.hero === 'imagen' && !!cover;
  const closingImage = galleryPhotos.find((g) => g.src !== cover)?.src ?? cover;
  const whatsapp = site.branding?.whatsapp ? `https://wa.me/${site.branding.whatsapp.replace(/[^0-9]/g, '')}` : null;
  const ig = site.branding?.instagram?.trim();
  const instagram = ig ? (/^https?:\/\//i.test(ig) ? ig : `https://instagram.com/${ig.replace(/^@/, '').replace(/^(www\.)?instagram\.com\//i, '')}`) : null;
  const { prefix, main } = splitName(site.tenant.name);
  const initial = main.charAt(0).toUpperCase();
  const place = multiLoc
    ? `${site.locations.length} sedes en ${listDistricts(site.locations.map((l) => l.district ?? l.name))}`
    : [...new Set([loc?.district, loc?.province ?? 'Lima'].filter(Boolean))].join(', ');
  const solo = site.staff.length === 1;
  const reviews = site.reviews ?? [];
  const mapPoints = site.locations.filter((l) => l.lat != null && l.lng != null).map((l) => ({ lat: l.lat as number, lng: l.lng as number, name: multiLoc ? l.name : site.tenant.name, href: mapsFor(l) }));
  const mapPalette = MAP_PALETTES[theme.mood.id];

  const nav = [
    { href: '/servicios', label: 'Servicios' },
    { href: '/equipo', label: solo ? 'Barbero' : 'Equipo' },
    ...(galleryPhotos.length ? [{ href: '/trabajos', label: 'Trabajos' }] : []),
    ...(reviewCount > 0 ? [{ href: '/opiniones', label: 'Opiniones' }] : []),
    { href: '/visitanos', label: multiLoc ? 'Sedes' : 'Visítanos' },
  ];

  return {
    tenant, site, theme, mood: theme.mood, loc, rating, reviewCount, mainServices, available, multiLoc, mapsFor, publicLocations, from, tz, hours,
    status, week, todayDow, todayRow, features, showQueue, showGifts, galleryPhotos, cover, photoHero, closingImage, whatsapp, instagram,
    prefix, main, initial, place, solo, reviews, nav, mapPoints, mapPalette,
    telHref: (p: string) => `tel:${p.replace(/[^0-9+]/g, '')}`,
    staffIn: (id: string) => site.staff.filter((b) => !b.location_id || b.location_id === id).length,
  };
}

export type SiteData = ReturnType<typeof derive>;
