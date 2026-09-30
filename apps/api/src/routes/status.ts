import type { FastifyPluginAsync } from 'fastify';
import { admin } from '../db.js';
import { diskUsage, getState } from '../lib/alerts.js';
import { backupsConfigured, runBackup } from '../lib/backup.js';

// Estado de la plataforma para el superadmin: vigía, respaldos, disco y alertas.
export const statusRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requirePlatformAdmin);

  app.get('/platform/status', async () => {
    const [watchdog, scheduler, backups, alerts, dbSize, disk] = await Promise.all([
      getState('watchdog'),
      getState('scheduler'),
      admin(`SELECT id, status, object_key, size_bytes, error, verify_note, verified_at, started_at, finished_at, deleted_at
               FROM platform_backups ORDER BY started_at DESC LIMIT 40`),
      admin(`SELECT id, kind, level, message, detail, emailed, created_at FROM platform_alerts ORDER BY created_at DESC LIMIT 60`),
      admin<{ size: string }>(`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`),
      diskUsage(),
    ]);
    return {
      watchdog: watchdog ? { ...watchdog.value, updatedAt: watchdog.updated_at } : null,
      schedulerAt: scheduler?.updated_at ?? null,
      backupsConfigured: backupsConfigured(),
      backups: backups.rows,
      alerts: alerts.rows,
      dbSize: dbSize.rows[0]?.size ?? null,
      disk,
    };
  });

  app.post('/platform/backups/run', async (_request, reply) => {
    const out = await runBackup({ reason: 'manual' });
    if (!out.ok) return reply.code(out.error === 'ya_en_curso' ? 409 : 500).send({ error: out.error });
    return out;
  });
};
