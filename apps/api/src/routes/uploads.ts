import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presignUpload, r2Configured, getObject } from '../lib/r2.js';

// Subidas a R2 (r2.date.pe) por URL prefirmada. El navegador sube directo a R2.
export const uploadRoutes: FastifyPluginAsync = async (app) => {
  // Archivos públicos del bucket: date.pe/api/media/<key>. Las llaves son únicas (uuid),
  // así que se cachean para siempre en el navegador y en Cloudflare.
  app.get('/media/*', async (request, reply) => {
    const key = (request.params as { '*': string })['*'];
    if (!/^tenants\/[0-9a-f-]{36}\/[a-z]+\/[0-9a-f-]{36}\.(jpg|png|webp|avif|pdf)$/.test(key)) return reply.code(404).send({ error: 'no_encontrado' });
    try {
      const obj = await getObject(key);
      reply.header('Content-Type', obj.contentType).header('Cache-Control', 'public, max-age=31536000, immutable');
      if (obj.length) reply.header('Content-Length', obj.length);
      if (obj.etag) reply.header('ETag', obj.etag);
      return reply.send(obj.body);
    } catch {
      return reply.code(404).send({ error: 'no_encontrado' });
    }
  });

  app.register(async (panel) => {
  panel.addHook('preHandler', app.requireTenant);

  const body = z.object({
    folder: z.enum(['staff', 'services', 'branding', 'gallery', 'clients', 'products', 'receipts', 'expenses', 'tv']),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf']),
  });

  panel.post('/admin/uploads/presign', async (request, reply) => {
    if (!r2Configured()) return reply.code(503).send({ error: 'r2_no_configurado' });
    if (!request.tenant) return reply.code(400).send({ error: 'tenant_no_resuelto' });
    const b = body.parse(request.body);
    try {
      const out = await presignUpload({ tenantId: request.tenant.id, folder: b.folder, contentType: b.contentType });
      return out;
    } catch (err) {
      request.log.error(err);
      return reply.code(400).send({ error: (err as Error).message });
    }
  });
  });
};
