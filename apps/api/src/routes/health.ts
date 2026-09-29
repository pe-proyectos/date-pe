import type { FastifyPluginAsync } from 'fastify';
import { adminPool } from '../db.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    let db = false;
    try {
      await adminPool.query('SELECT 1');
      db = true;
    } catch {
      db = false;
    }
    return { ok: true, db, ts: new Date().toISOString() };
  });
};
