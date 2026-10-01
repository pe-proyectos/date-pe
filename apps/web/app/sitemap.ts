import type { MetadataRoute } from 'next';
import { DISTRICTS } from '@/lib/districts';
import { headers } from 'next/headers';
import { API_BASE_SERVER } from '@/lib/config';
import { tenantFromHost, slugFromCustomHost } from '@/lib/host';
import { getSite, derive } from './t/[tenant]/_site/data';

export const revalidate = 3600;

/** Sitio de una barbería (subdominio o dominio propio): sus secciones y cada perfil. */
async function tenantSitemap(slug: string, base: string): Promise<MetadataRoute.Sitemap> {
  const site = await getSite(slug);
  if (!site || site.tenant.is_demo) return [];
  const d = derive(site, slug);
  const now = new Date();
  const paths = [
    { p: '', f: 'weekly' as const, pr: 1 },
    ...d.nav.map((n) => ({ p: n.href, f: 'weekly' as const, pr: 0.8 })),
    ...(d.solo ? [] : site.staff.map((b) => ({ p: `/equipo/${b.id}`, f: 'monthly' as const, pr: 0.6 }))),
    ...(d.available ? [{ p: '/reservar', f: 'daily' as const, pr: 0.9 }] : []),
    ...(d.showGifts ? [{ p: '/regalos', f: 'monthly' as const, pr: 0.4 }] : []),
  ];
  return paths.map((x) => ({ url: `${base}${x.p}`, lastModified: now, changeFrequency: x.f, priority: x.pr }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('host') ?? '';
  const slug = tenantFromHost(host) ?? (await slugFromCustomHost(host));
  if (slug) return tenantSitemap(slug, `https://${host.split(':')[0]}`);

  const base = 'https://date.pe';
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/search`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/join`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/reclamaciones`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terminos`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacidad`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
  const districtRoutes: MetadataRoute.Sitemap = DISTRICTS.map((d) => ({
    url: `${base}/barberias/${d.province}/${d.slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  let postRoutes: MetadataRoute.Sitemap = [];
  let shopRoutes: MetadataRoute.Sitemap = [];
  try {
    const [blog, shops] = await Promise.all([
      fetch(`${API_BASE_SERVER}/api/blog`, { next: { revalidate: 3600 } }).then((r) => r.json()),
      fetch(`${API_BASE_SERVER}/api/search?limit=50`, { next: { revalidate: 3600 } }).then((r) => r.json()),
    ]);
    postRoutes = (blog.posts ?? []).map((p: { slug: string; published_at: string }) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: new Date(p.published_at),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    }));
    shopRoutes = (shops.results ?? [])
      .filter((s: { is_demo?: boolean }) => !s.is_demo)
      .map((s: { slug: string }) => ({ url: `https://${s.slug}.date.pe`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.7 }));
  } catch {
    /* la API puede no estar disponible en build */
  }

  return [...staticRoutes, ...districtRoutes, ...postRoutes, ...shopRoutes];
}
