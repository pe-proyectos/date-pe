import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';

export interface AuthUser {
  sub: string; // user id
  tenantId: string | null;
  role: string | null;
  isPlatformAdmin: boolean;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: env.jwtSecret,
    cookie: { cookieName: 'datepe_session', signed: false },
  });

  // Verifica sesión y (opcional) que pertenezca al tenant del Host.
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'no_autenticado' });
    }
  });

  app.decorate('requirePlatformAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'no_autenticado' });
    }
    if (!request.user.isPlatformAdmin) return reply.code(403).send({ error: 'solo_superadmin' });
  });

  app.decorate(
    'requireTenant',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'no_autenticado' });
      }
      const user = request.user;
      if (user.isPlatformAdmin) return;
      if (!request.tenant) return reply.code(400).send({ error: 'tenant_no_resuelto' });
      if (user.tenantId !== request.tenant.id) {
        return reply.code(403).send({ error: 'sin_acceso_al_tenant' });
      }
    },
  );
};

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireTenant: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePlatformAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie('datepe_session', token, {
    domain: env.cookieDomain,
    path: '/',
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'none',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export const authPlugin = fp(plugin, { name: 'auth' });
