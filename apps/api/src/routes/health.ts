import type { FastifyPluginAsync } from 'fastify';
import { adminPool } from '../db.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    let db = false;
    let schedulerAgoSec: number | null = null;
    try {
      const { rows } = await adminPool.query<{ ago: number | null }>(
        `SELECT EXTRACT(EPOCH FROM now() - (SELECT updated_at FROM platform_state WHERE key = 'scheduler'))::int AS ago`,
      );
      db = true;
      schedulerAgoSec = rows[0]?.ago ?? null;
    } catch {
      db = false;
    }
    // El planificador corre cada 5 minutos; más de 15 sin correr es una falla
    const scheduler = schedulerAgoSec == null ? 'unknown' : schedulerAgoSec < 900 ? 'ok' : 'stale';
    return { ok: db && scheduler !== 'stale', db, scheduler, ts: new Date().toISOString() };
  });
};
