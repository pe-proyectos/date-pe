import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { admin, withTenant, withPublicRead } from '../db.js';
import { createComplaint, providerInfo, sendComplaintResponse } from '../lib/complaints.js';

// Libro de Reclamaciones: público en cada barbería ({slug}.date.pe/reclamaciones)
// y en date.pe/reclamaciones para la plataforma. El dueño responde desde el panel.

const hits = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

const body = z
  .object({
    kind: z.enum(['reclamo', 'queja']),
    consumerName: z.string().trim().min(3).max(120),
    docType: z.enum(['DNI', 'CE', 'Pasaporte', 'RUC']),
    docNumber: z.string().trim().min(6).max(20),
    address: z.string().trim().max(200).optional().nullable(),
    phone: z.string().trim().max(20).optional().nullable(),
    email: z.string().trim().email().max(160),
    isMinor: z.boolean().default(false),
    guardianName: z.string().trim().max(120).optional().nullable(),
    itemType: z.enum(['servicio', 'producto']),
    amountCents: z.number().int().min(0).max(100_000_000).optional().nullable(),
    itemDescription: z.string().trim().min(2).max(300),
    detail: z.string().trim().min(10).max(3000),
    request: z.string().trim().min(3).max(1500),
    locationId: z.string().uuid().optional().nullable(),
    acceptTruth: z.literal(true),
  })
  .refine((b) => !b.isMinor || (b.guardianName && b.guardianName.length >= 3), { path: ['guardianName'], message: 'Falta el nombre del padre, madre o apoderado' })
  .refine((b) => b.docType !== 'DNI' || /^\d{8}$/.test(b.docNumber), { path: ['docNumber'], message: 'El DNI tiene 8 dígitos' })
  .refine((b) => b.docType !== 'RUC' || /^\d{11}$/.test(b.docNumber), { path: ['docNumber'], message: 'El RUC tiene 11 dígitos' });

const COLS = `id, code, kind, status, consumer_name, consumer_doc_type, consumer_doc_number, consumer_address, consumer_phone, consumer_email,
  is_minor, guardian_name, item_type, item_amount_cents, item_description, detail, request, response, responded_at, due_at, created_at,
  (SELECT name FROM locations l WHERE l.id = complaints.location_id) AS location_name`;

function tid(request: FastifyRequest): string {
  if (!request.tenant) throw new Error('tenant_no_resuelto');
  return request.tenant.id;
}

export const complaintRoutes: FastifyPluginAsync = async (app) => {
  // Datos del proveedor para la cabecera de la hoja
  app.get('/public/complaints/info', async (request) => {
    const tenantId = request.tenant?.id ?? null;
    const provider = await providerInfo(tenantId);
    const locations = tenantId
      ? await withPublicRead(async (sql) => (await sql('SELECT id, name, address, district FROM locations WHERE tenant_id = $1 AND is_active ORDER BY name', [tenantId])).rows)
      : [];
    return { provider, locations, platform: !tenantId };
  });

  app.post('/public/complaints', async (request, reply) => {
    const ip = (request.headers['cf-connecting-ip'] as string) || request.ip;
    if (tooMany(ip)) return reply.code(429).send({ error: 'demasiados_intentos' });
    const parsed = body.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos', detail: parsed.error.flatten() });
    const { acceptTruth: _ok, ...b } = parsed.data;
    const out = await createComplaint(request.tenant?.id ?? null, b, ip);
    return reply.code(201).send({ code: out.code, dueAt: out.dueAt, createdAt: out.createdAt });
  });

  // Panel de la barbería (dueño y encargado)
  app.get('/admin/complaints', { preHandler: app.requireTenant }, async (request) =>
    withTenant(tid(request), async (sql) => {
      const [list, provider] = await Promise.all([sql(`SELECT ${COLS} FROM complaints ORDER BY status = 'open' DESC, created_at DESC LIMIT 500`), providerInfo(tid(request))]);
      return { complaints: list.rows, provider, open: list.rows.filter((r) => r.status === 'open').length };
    }),
  );

  app.post('/admin/complaints/:id/respond', { preHandler: app.requireTenant }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { response } = z.object({ response: z.string().trim().min(10).max(5000) }).parse(request.body);
    const userId = (request.user as { sub?: string } | undefined)?.sub ?? null;
    const ok = await withTenant(tid(request), async (sql) => {
      const r = await sql(`UPDATE complaints SET status = 'answered', response = $2, responded_at = now(), responded_by = $3 WHERE id = $1 AND status = 'open' RETURNING id`, [id, response, userId]);
      return r.rowCount === 1;
    });
    if (!ok) return reply.code(409).send({ error: 'ya_respondido' });
    await sendComplaintResponse(id);
    return { ok: true };
  });

  // Libro de la propia plataforma (superadmin)
  app.get('/platform/complaints', { preHandler: app.requirePlatformAdmin }, async () => {
    const { rows } = await admin(`SELECT ${COLS} FROM complaints WHERE tenant_id IS NULL ORDER BY status = 'open' DESC, created_at DESC LIMIT 500`);
    return { complaints: rows, provider: await providerInfo(null) };
  });

  app.post('/platform/complaints/:id/respond', { preHandler: app.requirePlatformAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { response } = z.object({ response: z.string().trim().min(10).max(5000) }).parse(request.body);
    const r = await admin(`UPDATE complaints SET status = 'answered', response = $2, responded_at = now() WHERE id = $1 AND tenant_id IS NULL AND status = 'open' RETURNING id`, [id, response]);
    if (r.rowCount !== 1) return reply.code(409).send({ error: 'ya_respondido' });
    await sendComplaintResponse(id);
    return { ok: true };
  });
};
