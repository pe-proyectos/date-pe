import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';

export interface AuthUser {
  sub: string; // user id
  tenantId: string | null;
  role: string | null;
  /** Barbero vinculado a la cuenta (rol staff) */
  staffId?: string | null;
  isPlatformAdmin: boolean;
}

// Qué puede tocar cada rol del equipo. El dueño y el superadmin pueden todo.
type Rule = [method: string, pattern: RegExp];
const ANY = '*';
const COMMON: Rule[] = [
  [ANY, /^\/api\/admin\/me(\/|$)/],
  [ANY, /^\/api\/admin\/push(\/|$)/],
  [ANY, /^\/api\/admin\/queue(\/|$)/],
  [ANY, /^\/api\/admin\/music(\/|$)/],
  ['POST', /^\/api\/admin\/uploads\/presign$/],
  ['GET', /^\/api\/admin\/(staff|services|products|locations|features|time-off)(\?|$)/],
  ['GET', /^\/api\/admin\/appointments(\?|$)/],
  ['PATCH', /^\/api\/admin\/appointments\/[^/]+$/],
  ['GET', /^\/api\/admin\/clients(\/[^/]+)?(\?|$)/],
  ['POST', /^\/api\/admin\/clients\/[^/]+\/(photos|notes)$/],
  ['POST', /^\/api\/admin\/appointments$/],
];
const ROLE_RULES: Record<string, Rule[]> = {
  manager: [[ANY, /^\/api\/admin\/(?!billing|domain)/]],
  cashier: [
    ...COMMON,
    [ANY, /^\/api\/admin\/(pos|sales|cash)(\/|\?|$)/],
    ['GET', /^\/api\/admin\/(overview|packages|rewards|gift-cards|memberships|promotions)(\?|$)/],
    [ANY, /^\/api\/admin\/clients(\/|$)/],
    ['POST', /^\/api\/admin\/expenses$/],
  ],
  staff: [...COMMON, ['POST', /^\/api\/admin\/(pos\/checkout|sales)$/], ['GET', /^\/api\/admin\/pos\/(state|catalog)(\?|$)/]],
};

export function roleAllows(role: string | null | undefined, method: string, url: string): boolean {
  if (!role || role === 'owner') return true;
  const rules = ROLE_RULES[role];
  if (!rules) return false;
  const path = url.split('#')[0];
  return rules.some(([m, re]) => (m === ANY || m === method) && re.test(path));
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
      if (!roleAllows(user.role, request.method, request.url)) {
        return reply.code(403).send({ error: 'sin_permiso', role: user.role });
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
