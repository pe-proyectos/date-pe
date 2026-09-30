import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { admin } from '../db.js';
import { verifyPassword, otpCode } from '../lib/crypto.js';
import { setSessionCookie, type AuthUser } from '../plugins/auth.js';

// Store en memoria para OTP de clientes (MVP; en prod: Redis/DB con expiración).
const otpStore = new Map<string, { code: string; exp: number }>();

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Login del panel (dueño/staff de la barbería)
  const loginBody = z.object({ email: z.string().email(), password: z.string().min(6) });
  app.post('/auth/login', async (request, reply) => {
    const b = loginBody.parse(request.body);
    const { rows } = await admin<{ id: string; password_hash: string | null; is_platform_admin: boolean }>(
      'SELECT id, password_hash, is_platform_admin FROM users WHERE email = $1',
      [b.email],
    );
    const user = rows[0];
    if (!user || !verifyPassword(b.password, user.password_hash)) {
      return reply.code(401).send({ error: 'credenciales_invalidas' });
    }
    // Si el login viene del panel de una barbería, la sesión es para esa barbería.
    const mem = request.tenant
      ? await admin<{ tenant_id: string; role: string; staff_id: string | null }>(
          'SELECT tenant_id, role, staff_id FROM memberships WHERE user_id = $1 AND tenant_id = $2',
          [user.id, request.tenant.id],
        )
      : await admin<{ tenant_id: string; role: string; staff_id: string | null }>(
          'SELECT tenant_id, role, staff_id FROM memberships WHERE user_id = $1 ORDER BY created_at LIMIT 1',
          [user.id],
        );
    if (request.tenant && mem.rows.length === 0 && !user.is_platform_admin) {
      return reply.code(401).send({ error: 'credenciales_invalidas' });
    }
    const payload: AuthUser = {
      sub: user.id,
      tenantId: mem.rows[0]?.tenant_id ?? null,
      role: mem.rows[0]?.role ?? null,
      staffId: mem.rows[0]?.staff_id ?? null,
      isPlatformAdmin: user.is_platform_admin,
    };
    const token = app.jwt.sign(payload, { expiresIn: '30d' });
    setSessionCookie(reply, token);
    return { ok: true, token, user: payload };
  });

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request) => ({ user: request.user }));

  app.post('/auth/logout', async (_request, reply) => {
    reply.clearCookie('datepe_session', { path: '/' });
    return { ok: true };
  });

  // OTP de cliente por WhatsApp (MVP: se registra en log; integrar Twilio/Meta luego)
  const otpReq = z.object({ phone: z.string().min(6) });
  app.post('/auth/otp/request', async (request) => {
    const { phone } = otpReq.parse(request.body);
    const code = otpCode();
    otpStore.set(phone, { code, exp: Date.now() + 5 * 60_000 });
    // TODO: enviar por WhatsApp (Twilio/Meta). Por ahora log en dev.
    request.log.info({ phone, code }, 'OTP generado (enviar por WhatsApp)');
    return { ok: true, sent: true };
  });

  const otpVerify = z.object({ phone: z.string().min(6), code: z.string().length(6) });
  app.post('/auth/otp/verify', async (request, reply) => {
    const { phone, code } = otpVerify.parse(request.body);
    const entry = otpStore.get(phone);
    if (!entry || entry.exp < Date.now() || entry.code !== code) {
      return reply.code(400).send({ error: 'otp_invalido' });
    }
    otpStore.delete(phone);
    return { ok: true, verified: true };
  });
};
