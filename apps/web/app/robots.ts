import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/superadmin', '/t/*/admin'] }],
    sitemap: 'https://date.pe/sitemap.xml',
    host: 'https://date.pe',
  };
}
