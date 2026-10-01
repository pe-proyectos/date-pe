import webpush from 'web-push';
import { admin } from '../db.js';
import { env } from '../env.js';

// Notificaciones push web (celular y escritorio) para dueños, barberos y clientes en la fila.
const enabled = !!(env.vapidPublicKey && env.vapidPrivateKey);
if (enabled) webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);

export const pushEnabled = () => enabled;

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** Vibración y sonido fuertes (turno llamado) */
  urgent?: boolean;
  /** Ícono de la notificación (logo de la barbería) */
  icon?: string | null;
}

async function sendTo(rows: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>, payload: PushPayload) {
  if (!enabled) return;
  const body = JSON.stringify(payload);
  await Promise.all(
    rows.map(async (r) => {
      try {
        await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, body, { TTL: 600, urgency: payload.urgent ? 'high' : 'normal' });
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // Suscripción vencida o revocada: se borra
        if (code === 404 || code === 410) await admin('DELETE FROM push_subscriptions WHERE id = $1', [r.id]);
      }
    }),
  );
}

export async function pushToTicket(ticketId: string, payload: PushPayload) {
  const { rows } = await admin<{ id: string; endpoint: string; p256dh: string; auth: string }>('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE ticket_id = $1', [ticketId]);
  await sendTo(rows, payload);
}

export async function pushToClient(clientId: string | null, payload: PushPayload) {
  if (!clientId) return;
  const { rows } = await admin<{ id: string; endpoint: string; p256dh: string; auth: string }>('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE client_id = $1', [clientId]);
  await sendTo(rows, payload);
}

/** Este celular recibe los avisos de un cliente (sin borrar si también sigue un turno o es del equipo). */
export async function saveClientSubscription(p: { tenantId: string; clientId: string; endpoint: string; p256dh: string; auth: string }) {
  await admin(
    `INSERT INTO push_subscriptions (tenant_id, client_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, client_id = EXCLUDED.client_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [p.tenantId, p.clientId, p.endpoint, p.p256dh, p.auth],
  );
}

export async function pushToUsers(tenantId: string, filter: { roles?: string[]; staffId?: string | null }, payload: PushPayload) {
  const { rows } = await admin<{ id: string; endpoint: string; p256dh: string; auth: string }>(
    `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps JOIN memberships m ON m.user_id = ps.user_id AND m.tenant_id = ps.tenant_id
      WHERE ps.tenant_id = $1 AND ps.user_id IS NOT NULL
        AND ($2::text[] IS NULL OR m.role = ANY($2))
        AND ($3::uuid IS NULL OR m.staff_id = $3 OR m.role IN ('owner','manager'))`,
    [tenantId, filter.roles ?? null, filter.staffId ?? null],
  );
  await sendTo(rows, payload);
}

export async function saveSubscription(p: { tenantId: string; userId?: string | null; ticketId?: string | null; endpoint: string; p256dh: string; auth: string }) {
  await admin(
    `INSERT INTO push_subscriptions (tenant_id, user_id, ticket_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (endpoint) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, user_id = EXCLUDED.user_id, ticket_id = EXCLUDED.ticket_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [p.tenantId, p.userId ?? null, p.ticketId ?? null, p.endpoint, p.p256dh, p.auth],
  );
}
