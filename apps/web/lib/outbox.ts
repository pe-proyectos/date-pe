'use client';

// Ventas hechas sin internet. Se guardan en el dispositivo con una referencia única y
// se suben solas cuando vuelve la conexión; el servidor ignora un segundo envío de la
// misma referencia, así nunca se cobra dos veces.

export interface OutboxSale {
  ref: string;
  body: Record<string, unknown>;
  at: string; // hora real del cobro
  label: string; // para mostrar: "Corte, S/ 25.00"
  location: string | null;
  error?: string; // el servidor la rechazó (ej. la cita ya estaba cobrada)
}

const key = (tenant: string) => `datepe_outbox_${tenant}`;
export const OUTBOX_EVENT = 'datepe-outbox';

export function newRef(): string {
  const c = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID().replace(/-/g, '') : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function readOutbox(tenant: string): OutboxSale[] {
  try {
    return JSON.parse(localStorage.getItem(key(tenant)) ?? '[]') as OutboxSale[];
  } catch {
    return [];
  }
}

function write(tenant: string, list: OutboxSale[]) {
  localStorage.setItem(key(tenant), JSON.stringify(list));
  window.dispatchEvent(new Event(OUTBOX_EVENT));
}

export function enqueueSale(tenant: string, sale: OutboxSale) {
  write(tenant, [...readOutbox(tenant).filter((s) => s.ref !== sale.ref), sale]);
}

export function dropSale(tenant: string, ref: string) {
  write(tenant, readOutbox(tenant).filter((s) => s.ref !== ref));
}

/** Sin respuesta del servidor (no un error de negocio). */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return e instanceof TypeError || (e as Error)?.name === 'TypeError' || /failed to fetch|network|load failed/i.test((e as Error)?.message ?? '');
}

let flushing = false;

/**
 * Sube lo pendiente en orden. `post` hace el pedido con la sede de la venta.
 * Devuelve cuántas se subieron; se detiene al primer corte de red.
 */
export async function flushOutbox(
  tenant: string,
  post: (body: Record<string, unknown>, location: string | null) => Promise<unknown>,
): Promise<{ sent: number; failed: number }> {
  if (flushing) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    for (const s of readOutbox(tenant)) {
      if (s.error) continue;
      try {
        await post({ ...s.body, clientRef: s.ref, offlineAt: s.at }, s.location);
        dropSale(tenant, s.ref);
        sent++;
      } catch (e) {
        if (isNetworkError(e)) break;
        // Rechazo del servidor: queda a la vista para revisarla a mano
        write(tenant, readOutbox(tenant).map((x) => (x.ref === s.ref ? { ...x, error: (e as Error).message || 'error' } : x)));
        failed++;
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, failed };
}
