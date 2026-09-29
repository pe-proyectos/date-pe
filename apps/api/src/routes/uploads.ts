import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { presignUpload, r2Configured } from '../lib/r2.js';

// Subidas a R2 (r2.date.pe) por URL prefirmada. El navegador sube directo a R2.
export const uploadRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireTenant);

  const body = z.object({
    folder: z.enum(['staff', 'services', 'branding']),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  });

  app.post('/admin/uploads/presign', async (request, reply) => {
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
};
