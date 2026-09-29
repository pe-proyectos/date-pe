import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { admin } from '../db.js';
import { env } from '../env.js';

export interface TenantContext {
  id: string;
  slug: string;
  name: string;
  status: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    tenant: TenantContext | null;
  }
}

// Cache pequeño slug->tenant (TTL corto) para no pegar a la DB en cada request.
const cache = new Map<string, { tenant: TenantContext | null; exp: number }>();
const TTL_MS = 30_000;

function subdomainFromHost(host: string | undefined): string | null {
  if (!host) return null;
  const clean = host.split(':')[0].toLowerCase();
  const base = env.baseDomain.toLowerCase();
  // dev: soporta lvh.me / localhost
  if (clean === base || clean === `www.${base}`) return null;
  if (clean.endsWith(`.${base}`)) {
    const sub = clean.slice(0, -1 * (base.length + 1));
    if (!sub || sub === 'www' || sub === 'api' || sub === 'r2') return null;
    // solo primer nivel (barberiajuana.date.pe)
    return sub.split('.')[0];
  }
  // dev con lvh.me: barberiajuana.lvh.me
  if (clean.endsWith('.lvh.me')) return clean.split('.')[0];
  if (clean.endsWith('.localhost')) return clean.split('.')[0];
  return null;
}

async function resolveSlug(slug: string): Promise<TenantContext | null> {
  const cached = cache.get(slug);
  if (cached && cached.exp > Date.now()) return cached.tenant;
  const { rows } = await admin<TenantContext & { id: string }>(
    'SELECT id, slug, name, status FROM tenants WHERE slug = $1',
    [slug],
  );
  const tenant = rows[0] ?? null;
  cache.set(slug, { tenant, exp: Date.now() + TTL_MS });
  return tenant;
}

export function tenantSlugOf(request: FastifyRequest): string | null {
  // Prioridad: header inyectado por el proxy, luego query (dev), luego Host.
  const headerSlug = request.headers['x-tenant-slug'];
  if (typeof headerSlug === 'string' && headerSlug) return headerSlug;
  const headerHost = request.headers['x-tenant-host'];
  if (typeof headerHost === 'string' && headerHost) {
    const s = subdomainFromHost(headerHost);
    if (s) return s;
  }
  const q = (request.query as Record<string, unknown> | undefined)?.tenant;
  if (typeof q === 'string' && q) return q;
  return subdomainFromHost(request.headers.host);
}

const plugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('tenant', null);
  app.addHook('onRequest', async (request) => {
    const slug = tenantSlugOf(request);
    request.tenant = slug ? await resolveSlug(slug) : null;
  });
};

export const tenantPlugin = fp(plugin, { name: 'tenant' });
