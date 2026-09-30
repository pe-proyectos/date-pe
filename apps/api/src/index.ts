import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { env } from './env.js';
import { runMigrations } from './migrate.js';
import { startRealtime } from './lib/realtime.js';
import { tenantPlugin } from './plugins/tenant.js';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { publicRoutes } from './routes/public.js';
import { bookingRoutes } from './routes/bookings.js';
import { adminRoutes } from './routes/admin.js';
import { adminExtraRoutes } from './routes/admin-extra.js';
import { searchRoutes } from './routes/search.js';
import { blogRoutes } from './routes/blog.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { platformRoutes } from './routes/platform.js';
import { paymentRoutes } from './routes/payments.js';
import { uploadRoutes } from './routes/uploads.js';
import { wsRoutes } from './routes/ws.js';
import { billingRoutes } from './routes/billing.js';
import { opsRoutes } from './routes/ops.js';
import { clientRoutes } from './routes/client.js';
import { teamRoutes } from './routes/team.js';
import { queueRoutes } from './routes/queue.js';
import { posRoutes } from './routes/pos.js';
import { financeRoutes } from './routes/finance.js';
import { crmRoutes } from './routes/crm.js';
import { tenantSlugByDomain } from './lib/domains.js';
import { startScheduler } from './lib/scheduler.js';

async function main() {
  const app = Fastify({ logger: { level: env.nodeEnv === 'production' ? 'info' : 'debug' } });

  // CORS: refleja orígenes de date.pe y sus subdominios (+ localhost/lvh.me en dev)
  await app.register(cors, {
    credentials: true,
    // El panel de cada barbería vive en su subdominio y edita con PATCH, PUT y DELETE
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl / same-origin
      try {
        const host = new URL(origin).hostname;
        const base = env.baseDomain;
        const ok =
          host === base ||
          host.endsWith(`.${base}`) ||
          host === 'localhost' ||
          host.endsWith('.localhost') ||
          host.endsWith('.lvh.me') ||
          host === 'lvh.me';
        if (ok) return cb(null, true);
        // Dominios propios de las barberías
        tenantSlugByDomain(host).then((slug) => cb(null, !!slug), () => cb(null, false));
      } catch {
        cb(null, false);
      }
    },
  });

  // JSON tolerante: un POST/DELETE sin cuerpo no es un error.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body.trim() : '';
    if (!text) return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch (err) {
      (err as Error & { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  await app.register(websocket);
  await app.register(authPlugin);
  await app.register(tenantPlugin);

  // Todas las rutas viven bajo /api
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(publicRoutes);
      await api.register(bookingRoutes);
      await api.register(adminRoutes);
      await api.register(adminExtraRoutes);
      await api.register(searchRoutes);
      await api.register(blogRoutes);
      await api.register(onboardingRoutes);
      await api.register(platformRoutes);
      await api.register(paymentRoutes);
      await api.register(uploadRoutes);
      await api.register(wsRoutes);
      await api.register(billingRoutes);
      await api.register(opsRoutes);
      await api.register(clientRoutes);
      await api.register(teamRoutes);
      await api.register(queueRoutes);
      await api.register(posRoutes);
      await api.register(financeRoutes);
      await api.register(crmRoutes);
    },
    { prefix: '/api' },
  );

  // Migraciones + realtime al arrancar
  await runMigrations();
  app.log.info('Esquema aplicado');
  await startRealtime();
  app.log.info('Realtime (LISTEN/NOTIFY) activo');
  startScheduler((msg, err) => app.log.error({ err }, msg));

  await app.listen({ port: env.port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error('Fallo al iniciar la API:', err);
  process.exit(1);
});
