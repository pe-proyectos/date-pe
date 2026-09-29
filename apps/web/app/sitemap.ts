import type { MetadataRoute } from 'next';
import { DISTRICTS } from '@/lib/districts';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://date.pe';
  const now = new Date();
  const staticRoutes = ['', '/search', '/blog', '/join'].map((p) => ({
    url: `${base}${p}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: p === '' ? 1 : 0.8,
  }));
  const districtRoutes = DISTRICTS.map((d) => ({
    url: `${base}/barberias/${d.province}/${d.slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));
  return [...staticRoutes, ...districtRoutes];
}
