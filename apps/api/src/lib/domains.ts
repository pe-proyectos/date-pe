import { promises as fs } from 'node:fs';
import { resolve4 } from 'node:dns/promises';
import { join } from 'node:path';
import { admin } from '../db.js';
import { env } from '../env.js';

// Dominio propio por barbería (barberiajuana.com). La API escribe una ruta en el
// proveedor de archivos de Traefik (Coolify) y Traefik emite el certificado solo.
const DOMAIN_RE = /^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;

export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

function routeFile(tenantId: string) {
  return join(env.traefikDynamicDir, `datepe-domain-${tenantId}.yml`);
}

async function writeRoute(tenantId: string, domain: string) {
  const name = `datepe-dom-${tenantId.slice(0, 8)}`;
  const yml = `# Generado por date.pe: dominio propio de una barbería. No editar a mano.
http:
  routers:
    ${name}:
      entryPoints: [https]
      rule: "Host(\`${domain}\`)"
      service: datepe-web@docker
      priority: 20
      tls:
        certResolver: letsencrypt
    ${name}-http:
      entryPoints: [http]
      rule: "Host(\`${domain}\`)"
      service: datepe-web@docker
      priority: 20
`;
  await fs.mkdir(env.traefikDynamicDir, { recursive: true });
  await fs.writeFile(routeFile(tenantId), yml, 'utf8');
}

async function removeRoute(tenantId: string) {
  await fs.rm(routeFile(tenantId), { force: true });
}

/** ¿El dominio apunta a este servidor? */
export async function checkDns(domain: string): Promise<{ ok: boolean; found: string[] }> {
  try {
    const found = await resolve4(domain);
    return { ok: found.includes(env.serverIp), found };
  } catch {
    return { ok: false, found: [] };
  }
}

export async function setCustomDomain(tenantId: string, raw: string | null): Promise<{ ok: true; domain: string | null; status: string | null; dns?: { ok: boolean; found: string[] } } | { ok: false; error: string }> {
  if (!raw) {
    await admin('UPDATE tenants SET custom_domain = NULL, domain_status = NULL, updated_at = now() WHERE id = $1', [tenantId]);
    await removeRoute(tenantId);
    return { ok: true, domain: null, status: null };
  }
  const domain = normalizeDomain(raw);
  if (!DOMAIN_RE.test(domain)) return { ok: false, error: 'dominio_invalido' };
  if (domain === env.baseDomain || domain.endsWith(`.${env.baseDomain}`)) return { ok: false, error: 'dominio_reservado' };
  const taken = await admin('SELECT 1 FROM tenants WHERE custom_domain = $1 AND id <> $2', [domain, tenantId]);
  if (taken.rows.length > 0) return { ok: false, error: 'dominio_en_uso' };

  const dns = await checkDns(domain);
  const status = dns.ok ? 'active' : 'pending';
  await admin('UPDATE tenants SET custom_domain = $2, domain_status = $3, updated_at = now() WHERE id = $1', [tenantId, domain, status]);
  // La ruta (y el certificado) solo cuando el DNS ya apunta: así no gastamos intentos
  // de Let's Encrypt. El planificador revisa los pendientes cada 5 minutos.
  try {
    if (dns.ok) await writeRoute(tenantId, domain);
    else await removeRoute(tenantId);
  } catch (err) {
    console.error('[dominios] no se pudo escribir la ruta', err);
    await admin("UPDATE tenants SET domain_status = 'error' WHERE id = $1", [tenantId]);
    return { ok: true, domain, status: 'error', dns };
  }
  return { ok: true, domain, status, dns };
}

/** Revisa el DNS de nuevo y actualiza el estado. */
export async function refreshDomain(tenantId: string) {
  const t = await admin<{ custom_domain: string | null }>('SELECT custom_domain FROM tenants WHERE id = $1', [tenantId]);
  const domain = t.rows[0]?.custom_domain;
  if (!domain) return { domain: null, status: null, dns: { ok: false, found: [] as string[] } };
  const dns = await checkDns(domain);
  const status = dns.ok ? 'active' : 'pending';
  await admin('UPDATE tenants SET domain_status = $2 WHERE id = $1', [tenantId, status]);
  if (dns.ok) await writeRoute(tenantId, domain).catch((err) => console.error('[dominios] no se pudo escribir la ruta', err));
  return { domain, status, dns };
}

/** Revisa todos los dominios pendientes (lo llama el planificador). */
export async function refreshPendingDomains() {
  const { rows } = await admin<{ id: string }>("SELECT id FROM tenants WHERE custom_domain IS NOT NULL AND domain_status IS DISTINCT FROM 'active'");
  for (const r of rows) await refreshDomain(r.id);
}

// Dominios activos, para CORS y para resolver el tenant por Host
let domainCache: { map: Map<string, string>; exp: number } | null = null;
export async function tenantSlugByDomain(host: string): Promise<string | null> {
  if (!domainCache || domainCache.exp < Date.now()) {
    const { rows } = await admin<{ custom_domain: string; slug: string }>('SELECT custom_domain, slug FROM tenants WHERE custom_domain IS NOT NULL');
    domainCache = { map: new Map(rows.map((r) => [r.custom_domain, r.slug])), exp: Date.now() + 30_000 };
  }
  return domainCache.map.get(host.toLowerCase().replace(/^www\./, '')) ?? null;
}
