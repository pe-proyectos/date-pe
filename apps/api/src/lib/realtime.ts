import type { WebSocket } from '@fastify/websocket';
import pg from 'pg';
import { env } from '../env.js';

// Registro en memoria de suscriptores WS por canal.
// canal = `t:<tenantId>` o `t:<tenantId>:l:<locationId>`
const channels = new Map<string, Set<WebSocket>>();

export function subscribe(channel: string, ws: WebSocket): void {
  let set = channels.get(channel);
  if (!set) {
    set = new Set();
    channels.set(channel, set);
  }
  set.add(ws);
  ws.on('close', () => {
    set!.delete(ws);
    if (set!.size === 0) channels.delete(channel);
  });
}

function send(channel: string, data: unknown): void {
  const set = channels.get(channel);
  if (!set) return;
  const msg = JSON.stringify(data);
  for (const ws of set) {
    try {
      ws.send(msg);
    } catch {
      /* ignore */
    }
  }
}

/** Difunde un cambio de disponibilidad al tenant y (si aplica) al local. */
function broadcastAvailability(tenantId: string, locationId?: string | null): void {
  const payload = { type: 'availability_changed', tenantId, locationId: locationId ?? null };
  send(`t:${tenantId}`, payload);
  if (locationId) send(`t:${tenantId}:l:${locationId}`, payload);
}

/** Eventos en vivo del local: fila, música, caja, pantalla de TV. */
function broadcastEvent(tenantId: string, type: string, data: unknown): void {
  send(`t:${tenantId}`, { type, tenantId, data });
}

// LISTEN/NOTIFY para funcionar entre procesos (varios workers de la API).
const listener = new pg.Client({ connectionString: env.databaseUrl });
let listenerReady = false;

export async function startRealtime(): Promise<void> {
  await listener.connect();
  await listener.query('LISTEN availability_changed');
  await listener.query('LISTEN tenant_event');
  listener.on('notification', (msg) => {
    if (!msg.payload) return;
    if (msg.channel === 'tenant_event') {
      try {
        const e = JSON.parse(msg.payload);
        broadcastEvent(e.tenantId, e.type, e.data ?? null);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const { tenantId, locationId } = JSON.parse(msg.payload);
      broadcastAvailability(tenantId, locationId);
    } catch {
      /* ignore */
    }
  });
  listenerReady = true;
}

/** Emite un cambio de disponibilidad (via NOTIFY -> todos los procesos). */
export async function emitAvailabilityChange(
  tenantId: string,
  locationId?: string | null,
): Promise<void> {
  const payload = JSON.stringify({ tenantId, locationId: locationId ?? null });
  if (listenerReady) {
    await listener.query('SELECT pg_notify($1, $2)', ['availability_changed', payload]);
  } else {
    broadcastAvailability(tenantId, locationId);
  }
}

/** Avisa a todas las pantallas del local (TV, tickets, panel) que algo cambió. */
export async function emitTenantEvent(tenantId: string, type: string, data?: unknown): Promise<void> {
  const payload = JSON.stringify({ tenantId, type, data: data ?? null });
  if (listenerReady && payload.length < 7900) {
    await listener.query('SELECT pg_notify($1, $2)', ['tenant_event', payload]);
  } else {
    broadcastEvent(tenantId, type, data ?? null);
  }
}
