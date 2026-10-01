import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { tenantFromHost, slugFromCustomHost } from '@/lib/host';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host') ?? '';
  const slug = tenantFromHost(host) ?? (await slugFromCustomHost(host));
  if (slug) {
    const base = `https://${host.split(':')[0]}`;
    return {
      rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/caja', '/staff', '/cita', '/mi-cuenta', '/turno'] }],
      sitemap: `${base}/sitemap.xml`,
      host: base,
    };
  }
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/superadmin', '/t/*/admin'] }],
    sitemap: 'https://date.pe/sitemap.xml',
    host: 'https://date.pe',
  };
}
