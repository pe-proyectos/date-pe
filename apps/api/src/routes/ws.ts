import type { FastifyPluginAsync } from 'fastify';
import { subscribe } from '../lib/realtime.js';
import { admin } from '../db.js';

// WebSocket de disponibilidad en tiempo real.
// El cliente de reserva se suscribe a los cambios de su tenant/local.
export const wsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/ws', { websocket: true }, async (socket, request) => {
    const q = request.query as { tenant?: string; location?: string };
    let tenantId: string | null = request.tenant?.id ?? null;

    // permite pasar ?tenant=slug explícito (para clientes fuera del subdominio)
    if (!tenantId && q.tenant) {
      const { rows } = await admin<{ id: string }>('SELECT id FROM tenants WHERE slug = $1', [q.tenant]);
      tenantId = rows[0]?.id ?? null;
    }
    if (!tenantId) {
      socket.send(JSON.stringify({ type: 'error', error: 'tenant_no_resuelto' }));
      socket.close();
      return;
    }

    subscribe(`t:${tenantId}`, socket);
    if (q.location) subscribe(`t:${tenantId}:l:${q.location}`, socket);
    socket.send(JSON.stringify({ type: 'subscribed', tenantId, location: q.location ?? null }));
  });
};
