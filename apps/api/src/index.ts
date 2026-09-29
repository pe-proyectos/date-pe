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
import { searchRoutes } from './routes/search.js';
import { blogRoutes } from './routes/blog.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { wsRoutes } from './routes/ws.js';

async function main() {
  const app = Fastify({ logger: { level: env.nodeEnv === 'production' ? 'info' : 'debug' } });

  // CORS: refleja orígenes de date.pe y sus subdominios (+ localhost/lvh.me en dev)
  await app.register(cors, {
    credentials: true,
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
        cb(null, ok);
      } catch {
        cb(null, false);
      }
    },
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
      await api.register(searchRoutes);
      await api.register(blogRoutes);
      await api.register(onboardingRoutes);
      await api.register(wsRoutes);
    },
    { prefix: '/api' },
  );

  // Migraciones + realtime al arrancar
  await runMigrations();
  app.log.info('✔ Esquema aplicado');
  await startRealtime();
  app.log.info('✔ Realtime (LISTEN/NOTIFY) activo');

  await app.listen({ port: env.port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error('Fallo al iniciar la API:', err);
  process.exit(1);
});
