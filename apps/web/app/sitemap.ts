import type { MetadataRoute } from 'next';
import { DISTRICTS } from '@/lib/districts';
import { API_BASE_SERVER } from '@/lib/config';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://date.pe';
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/search`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/join`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
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
