import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { withTenant, admin, type Sql } from '../db.js';
import { tenantConfig } from '../lib/features.js';
import { createIntent, type Provider } from '../lib/payments.js';
import { sendEmail, layout, esc } from '../lib/email.js';
import { tenantUrl } from '../lib/notify.js';

// Ficha del cliente, paquetes, premios por puntos, membresías, gift cards en
// línea y campañas de marketing.
function tid(request: FastifyRequest): string {
  if (!request.tenant) throw new Error('tenant_no_resuelto');
  return request.tenant.id;
}
const digits = (v: string) => v.replace(/\D/g, '').slice(-9);

/** Lo que el cliente tiene a favor: puntos, paquetes, membresía, premios canjeables. */
export async function clientWallet(sql: Sql, clientId: string) {
  const [c, packages, memberships, rewards] = await Promise.all([
    sql<{ loyalty_points: number; referral_code: string | null }>('SELECT loyalty_points, referral_code FROM clients WHERE id = $1', [clientId]),
    sql(
      `SELECT id, name, uses_total, uses_left, expires_at, service_ids FROM client_packages
        WHERE client_id = $1 AND uses_left > 0 AND (expires_at IS NULL OR expires_at > now()) ORDER BY expires_at NULLS LAST`,
      [clientId],
    ),
    sql(
      `SELECT cm.id, cm.name, cm.ends_at, mp.discount_percent, mp.included_uses FROM client_memberships cm LEFT JOIN membership_plans mp ON mp.id = cm.plan_id
        WHERE cm.client_id = $1 AND cm.ends_at > now() ORDER BY cm.ends_at DESC`,
      [clientId],
    ),
    sql('SELECT id, name, points_cost, kind, value, ref_id FROM rewards WHERE active ORDER BY points_cost'),
  ]);
  const points = c.rows[0]?.loyalty_points ?? 0;
  return {
    points,
    referralCode: c.rows[0]?.referral_code ?? null,
    packages: packages.rows,
    memberships: memberships.rows,
    rewards: rewards.rows.map((r: Record<string, unknown>) => ({ ...r, available: points >= (r.points_cost as number) })),
  };
}

/** Clientes de un segmento de marketing (siempre con correo y aceptando avisos). */
async function segmentClients(sql: Sql, seg: { type: string; days?: number; serviceId?: string; staffId?: string; tag?: string }) {
  const base = `c.email IS NOT NULL AND c.marketing_opt_in AND NOT c.blocked`;
  // Incluye la última visita traída del sistema anterior al importar
  const lastVisit = `GREATEST((SELECT max(a.starts_at) FROM appointments a WHERE a.client_id = c.id AND a.status = 'completed'), (c.import_last_visit::timestamp AT TIME ZONE 'America/Lima'))`;
  let where = base;
  const params: unknown[] = [];
  if (seg.type === 'inactive') {
    params.push(seg.days ?? 45);
    where += ` AND ${lastVisit} < now() - make_interval(days => $${params.length})`;
  } else if (seg.type === 'new') {
    params.push(seg.days ?? 30);
    where += ` AND c.created_at > now() - make_interval(days => $${params.length})`;
  } else if (seg.type === 'service' && seg.serviceId) {
    params.push(seg.serviceId);
    where += ` AND EXISTS (SELECT 1 FROM appointment_services aps JOIN appointments a ON a.id = aps.appointment_id WHERE a.client_id = c.id AND aps.service_id = $${params.length})`;
  } else if (seg.type === 'staff' && seg.staffId) {
    params.push(seg.staffId);
    where += ` AND EXISTS (SELECT 1 FROM appointments a WHERE a.client_id = c.id AND a.staff_id = $${params.length} AND a.status = 'completed')`;
  } else if (seg.type === 'tag' && seg.tag) {
    params.push(seg.tag);
    where += ` AND $${params.length} = ANY(c.tags)`;
  } else if (seg.type === 'vip') {
    where += ` AND (SELECT count(*) FROM appointments a WHERE a.client_id = c.id AND a.status = 'completed') + COALESCE(c.import_visits, 0) >= 5`;
  }
  const { rows } = await sql<{ id: string; name: string | null; email: string; unsubscribe_token: string }>(`SELECT c.id, c.name, c.email, c.unsubscribe_token FROM clients c WHERE ${where} ORDER BY c.created_at`, params);
  return rows;
}

export const crmRoutes: FastifyPluginAsync = async (app) => {
  // ============================ Público ============================
  // Monedero del cliente desde su enlace de reserva
  app.get('/public/wallet', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const { t } = z.object({ t: z.string().min(16).max(64) }).parse(request.query);
    return withTenant(request.tenant.id, async (sql) => {
      const a = await sql<{ client_id: string }>('SELECT client_id FROM appointments WHERE manage_token = $1', [t]);
      if (!a.rows[0]?.client_id) return reply.code(404).send({ error: 'no_encontrado' });
      return clientWallet(sql, a.rows[0].client_id);
    });
  });

  // Catálogo público: paquetes y gift cards que se pueden comprar en línea
  app.get('/public/shop', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    if (['suspended', 'cancelled'].includes(request.tenant.status)) return { packages: [], services: [], giftCards: null, available: false };
    return withTenant(request.tenant.id, async (sql) => {
      const cfg = await tenantConfig(sql);
      const packages = cfg.features.packages ? (await sql('SELECT id, name, description, price_cents, uses, service_ids, valid_days FROM packages WHERE active AND sell_online ORDER BY sort_order, price_cents')).rows : [];
      const services = (await sql('SELECT id, name, price_cents FROM services WHERE is_active AND NOT is_addon')).rows;
      return { packages, services, giftCards: cfg.features.giftcards_online ? { amounts: [3000, 5000, 8000, 10000, 15000], min: 1000, max: 50000 } : null };
    });
  });

  const buyBody = z.object({
    kind: z.enum(['gift_card', 'package']),
    packageId: z.string().uuid().optional(),
    amountCents: z.number().int().min(1000).max(50000).optional(),
    provider: z.enum(['mercadopago', 'paypal', 'culqi']),
    buyer: z.object({ name: z.string().min(1).max(80), email: z.string().email(), phone: z.string().min(6).max(20) }),
    recipient: z.object({ name: z.string().min(1).max(80), email: z.string().email().optional(), message: z.string().max(300).optional() }).optional(),
    deliverAt: z.string().optional(),
  });
  app.post('/public/shop/buy', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const b = buyBody.parse(request.body);
    const tenant = request.tenant;
    const prepared = await withTenant(tenant.id, async (sql) => {
      const cfg = await tenantConfig(sql);
      const client = await sql<{ id: string }>(
        `INSERT INTO clients (tenant_id, phone, name, email) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3)
         ON CONFLICT (tenant_id, phone) DO UPDATE SET email = COALESCE(EXCLUDED.email, clients.email), name = COALESCE(clients.name, EXCLUDED.name) RETURNING id`,
        [b.buyer.phone, b.buyer.name, b.buyer.email],
      );
      let amount = 0;
      let purposeRef: string;
      let description: string;
      if (b.kind === 'gift_card') {
        if (!cfg.features.giftcards_online || !b.amountCents) return { error: 'no_disponible' };
        amount = b.amountCents;
        const code = `GIFT-${randomBytes(3).toString('hex').toUpperCase()}`;
        const g = await sql<{ id: string }>(
          `INSERT INTO gift_cards (tenant_id, code, initial_cents, balance_cents, active, source, buyer_name, buyer_email, recipient_name, recipient_email, message, paid, deliver_at)
           VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $2, false, 'online', $3, $4, $5, $6, $7, false, $8) RETURNING id`,
          [code, amount, b.buyer.name, b.buyer.email, b.recipient?.name ?? b.buyer.name, b.recipient?.email ?? b.buyer.email, b.recipient?.message ?? null, b.deliverAt ?? null],
        );
        purposeRef = g.rows[0].id;
        description = `Gift card ${tenant.name}`;
      } else {
        if (!cfg.features.packages || !b.packageId) return { error: 'no_disponible' };
        const p = await sql<{ id: string; name: string; price_cents: number }>('SELECT id, name, price_cents FROM packages WHERE id = $1 AND active AND sell_online', [b.packageId]);
        if (!p.rows[0]) return { error: 'paquete_no_encontrado' };
        amount = p.rows[0].price_cents;
        purposeRef = p.rows[0].id;
        description = `${p.rows[0].name}, ${tenant.name}`;
      }
      const mp = await sql<{ mp_access_token: string | null }>('SELECT mp_access_token FROM tenant_settings');
      const pay = await sql<{ id: string }>(
        `INSERT INTO payments (tenant_id, kind, method, amount_cents, status, provider, purpose, purpose_ref, client_id)
         VALUES (current_setting('app.tenant_id')::uuid, 'full', $1, $2, 'pending', $3, $4, $5, $6) RETURNING id`,
        [b.provider === 'mercadopago' ? 'yape' : 'card', amount, b.provider, b.kind, purposeRef, client.rows[0].id],
      );
      return { paymentId: pay.rows[0].id, amount, description, mpToken: mp.rows[0]?.mp_access_token ?? null };
    });
    if ('error' in prepared) return reply.code(409).send(prepared);
    const intent = await createIntent(b.provider as Provider, {
      amountCents: prepared.amount,
      description: prepared.description,
      email: b.buyer.email,
      externalReference: prepared.paymentId,
      mpAccessToken: b.provider === 'mercadopago' ? prepared.mpToken : null,
      tenantSlug: tenant.slug,
      returnUrls: { success: tenantUrl(tenant.slug, '/regalos?pago=ok'), failure: tenantUrl(tenant.slug, '/regalos?pago=error') },
    });
    return {
      ok: true,
      paymentId: prepared.paymentId,
      amountCents: prepared.amount,
      redirectUrl: intent.redirectUrl,
      clientConfig: intent.clientConfig,
      devSimulated: intent.devSimulated ?? false,
      devConfirmUrl: intent.devSimulated ? `/api/payments/${prepared.paymentId}/dev-confirm` : undefined,
    };
  });

  // Darse de baja de los correos de marketing (enlace en cada campaña)
  app.post('/public/unsubscribe', async (request, reply) => {
    if (!request.tenant) return reply.code(404).send({ error: 'tenant_no_encontrado' });
    const parsed = z.object({ token: z.string().min(16).max(64) }).safeParse(request.body);
    if (!parsed.success) return reply.code(404).send({ error: 'no_encontrado' });
    const { token } = parsed.data;
    const r = await withTenant(request.tenant.id, (sql) => sql('UPDATE clients SET marketing_opt_in = false WHERE unsubscribe_token = $1 RETURNING id', [token]));
    if (!r.rows.length) return reply.code(404).send({ error: 'no_encontrado' });
    return { ok: true };
  });

  // ============================ Panel ============================
  app.register(async (panel) => {
    panel.addHook('preHandler', app.requireTenant);

    // Ficha completa del cliente
    panel.get('/admin/clients/:id', async (request, reply) => {
      const id = (request.params as { id: string }).id;
      if (!z.string().uuid().safeParse(id).success) return reply.code(404).send({ error: 'no_encontrado' });
      return withTenant(tid(request), async (sql) => {
        const c = await sql(
          `SELECT c.*, (SELECT count(*) FROM appointments a WHERE a.client_id = c.id AND a.status = 'completed')::int AS visitas,
                  (SELECT count(*) FROM appointments a WHERE a.client_id = c.id AND a.status = 'no_show')::int AS ausencias,
                  (SELECT COALESCE(sum(total_cents - tip_cents), 0) FROM sales s WHERE s.client_id = c.id AND s.status = 'paid')::int AS gastado_pos_cents,
                  (SELECT COALESCE(sum(price_cents), 0) FROM appointments a WHERE a.client_id = c.id AND a.status = 'completed')::int AS gastado_citas_cents,
                  (SELECT st.name FROM appointments a JOIN staff st ON st.id = a.staff_id WHERE a.client_id = c.id AND a.status = 'completed'
                    GROUP BY st.name ORDER BY count(*) DESC LIMIT 1) AS barbero_favorito,
                  (SELECT round(avg(EXTRACT(EPOCH FROM d) / 86400)) FROM (SELECT starts_at - lag(starts_at) OVER (ORDER BY starts_at) AS d FROM appointments a WHERE a.client_id = c.id AND a.status = 'completed') x)::int AS cada_cuantos_dias
             FROM clients c WHERE c.id = $1`,
          [id],
        );
        if (!c.rows[0]) return reply.code(404).send({ error: 'no_encontrado' });
        const { unsubscribe_token, ...client } = c.rows[0] as Record<string, unknown>;
        void unsubscribe_token;
        const [history, photos, wallet, sales] = await Promise.all([
          sql(
            `SELECT a.id, a.starts_at, a.status, a.price_cents, st.name AS staff_name,
                    (SELECT string_agg(sv.name, ' + ' ORDER BY sv.is_addon) FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id WHERE aps.appointment_id = a.id) AS service_name,
                    (SELECT stars FROM reviews r WHERE r.appointment_id = a.id) AS stars
               FROM appointments a LEFT JOIN staff st ON st.id = a.staff_id WHERE a.client_id = $1 ORDER BY a.starts_at DESC LIMIT 50`,
            [id],
          ),
          sql('SELECT p.id, p.url, p.caption, p.created_at, st.name AS staff_name FROM client_photos p LEFT JOIN staff st ON st.id = p.staff_id WHERE p.client_id = $1 ORDER BY p.created_at DESC', [id]),
          clientWallet(sql, id),
          sql(
            `SELECT s.id, s.number, s.created_at, s.total_cents, s.status, (SELECT string_agg(si.name, ', ') FROM sale_items si WHERE si.sale_id = s.id) AS items
               FROM sales s WHERE s.client_id = $1 ORDER BY s.created_at DESC LIMIT 30`,
            [id],
          ),
        ]);
        return { client, history: history.rows, photos: photos.rows, wallet, sales: sales.rows };
      });
    });

    panel.patch('/admin/clients/:id/profile', async (request) => {
      const id = (request.params as { id: string }).id;
      const b = z
        .object({
          name: z.string().max(80).optional(),
          email: z.string().email().or(z.literal('')).optional(),
          birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional(),
          tags: z.array(z.string().max(30)).max(20).optional(),
          preferences: z.string().max(500).optional(),
          allergies: z.string().max(200).optional(),
          notes: z.string().max(2000).optional(),
          marketingOptIn: z.boolean().optional(),
          blocked: z.boolean().optional(),
        })
        .parse(request.body);
      const cols: Record<string, string> = { name: 'name', email: 'email', birthday: 'birthday', tags: 'tags', preferences: 'preferences', allergies: 'allergies', notes: 'notes', marketingOptIn: 'marketing_opt_in', blocked: 'blocked' };
      const sets: string[] = [];
      const vals: unknown[] = [id];
      for (const [k, col] of Object.entries(cols)) {
        const v = (b as Record<string, unknown>)[k];
        if (v === undefined) continue;
        vals.push(v === '' ? null : v);
        sets.push(`${col} = $${vals.length}`);
      }
      if (sets.length) await withTenant(tid(request), (sql) => sql(`UPDATE clients SET ${sets.join(', ')} WHERE id = $1`, vals));
      return { ok: true };
    });

    panel.post('/admin/clients/:id/photos', async (request, reply) => {
      const id = (request.params as { id: string }).id;
      const b = z.object({ url: z.string().max(500), caption: z.string().max(120).optional(), appointmentId: z.string().uuid().optional() }).parse(request.body);
      const out = await withTenant(tid(request), (sql) =>
        sql(
          `INSERT INTO client_photos (tenant_id, client_id, url, caption, staff_id, appointment_id) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5) RETURNING id`,
          [id, b.url, b.caption ?? null, request.user.staffId ?? null, b.appointmentId ?? null],
        ),
      );
      return reply.code(201).send(out.rows[0]);
    });
    panel.delete('/admin/clients/:id/photos/:photoId', async (request) => {
      const p = request.params as { id: string; photoId: string };
      await withTenant(tid(request), (sql) => sql('DELETE FROM client_photos WHERE id = $1 AND client_id = $2', [p.photoId, p.id]));
      return { ok: true };
    });

    panel.get('/admin/clients/:id/wallet', async (request) => withTenant(tid(request), (sql) => clientWallet(sql, (request.params as { id: string }).id)));

    // Buscar cliente para la caja por nombre o celular
    panel.get('/admin/clients/search', async (request) => {
      const { q } = z.object({ q: z.string().trim().min(2).max(40) }).parse(request.query);
      return withTenant(tid(request), async (sql) => ({
        clients: (
          await sql(
            `SELECT id, name, phone, email, loyalty_points FROM clients
              WHERE name ILIKE '%' || $1 || '%' OR regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || $2 || '%'
              ORDER BY name LIMIT 10`,
            [q, digits(q) || '---'],
          )
        ).rows,
      }));
    });

    // ------------------------------ Paquetes ------------------------------
    panel.get('/admin/packages', async (request) =>
      withTenant(tid(request), async (sql) => ({
        packages: (await sql(`SELECT p.*, (SELECT count(*) FROM client_packages cp WHERE cp.package_id = p.id)::int AS vendidos FROM packages p ORDER BY p.active DESC, p.sort_order, p.price_cents`)).rows,
        sold: (
          await sql(
            `SELECT cp.id, cp.name, cp.uses_total, cp.uses_left, cp.expires_at, cp.created_at, c.name AS client_name, c.phone AS client_phone
               FROM client_packages cp JOIN clients c ON c.id = cp.client_id WHERE cp.uses_left > 0 AND (cp.expires_at IS NULL OR cp.expires_at > now())
              ORDER BY cp.created_at DESC LIMIT 100`,
          )
        ).rows,
      })),
    );
    const packageBody = z.object({
      name: z.string().min(1).max(80),
      description: z.string().max(300).nullable().optional(),
      priceCents: z.number().int().min(0),
      uses: z.number().int().min(1).max(100),
      serviceIds: z.array(z.string().uuid()).optional(),
      validDays: z.number().int().min(1).max(1095).optional(),
      sellOnline: z.boolean().optional(),
      active: z.boolean().optional(),
    });
    panel.post('/admin/packages', async (request, reply) => {
      const b = packageBody.parse(request.body);
      const r = await withTenant(tid(request), (sql) =>
        sql(
          `INSERT INTO packages (tenant_id, name, description, price_cents, uses, service_ids, valid_days, sell_online, active)
           VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [b.name, b.description ?? null, b.priceCents, b.uses, b.serviceIds ?? [], b.validDays ?? 180, b.sellOnline ?? true, b.active ?? true],
        ),
      );
      return reply.code(201).send(r.rows[0]);
    });
    panel.patch('/admin/packages/:id', async (request) => {
      const id = (request.params as { id: string }).id;
      const b = packageBody.partial().parse(request.body);
      await withTenant(tid(request), (sql) =>
        sql(
          `UPDATE packages SET name = COALESCE($2, name), description = COALESCE($3, description), price_cents = COALESCE($4, price_cents), uses = COALESCE($5, uses),
                  service_ids = COALESCE($6, service_ids), valid_days = COALESCE($7, valid_days), sell_online = COALESCE($8, sell_online), active = COALESCE($9, active) WHERE id = $1`,
          [id, b.name ?? null, b.description ?? null, b.priceCents ?? null, b.uses ?? null, b.serviceIds ?? null, b.validDays ?? null, b.sellOnline ?? null, b.active ?? null],
        ),
      );
      return { ok: true };
    });

    // ------------------------------ Premios por puntos ------------------------------
    panel.get('/admin/rewards', async (request) =>
      withTenant(tid(request), async (sql) => ({
        rewards: (await sql(`SELECT r.*, (SELECT count(*) FROM reward_redemptions x WHERE x.reward_id = r.id)::int AS canjes FROM rewards r ORDER BY r.active DESC, r.points_cost`)).rows,
        recent: (await sql(`SELECT x.name, x.points, x.created_at, c.name AS client_name FROM reward_redemptions x JOIN clients c ON c.id = x.client_id ORDER BY x.created_at DESC LIMIT 30`)).rows,
      })),
    );
    const rewardBody = z.object({
      name: z.string().min(1).max(80),
      pointsCost: z.number().int().min(1).max(100000),
      kind: z.enum(['free_service', 'discount_fixed', 'discount_percent', 'product']),
      value: z.number().int().min(0).optional(),
      refId: z.string().uuid().nullable().optional(),
      active: z.boolean().optional(),
    });
    panel.post('/admin/rewards', async (request, reply) => {
      const b = rewardBody.parse(request.body);
      const r = await withTenant(tid(request), (sql) =>
        sql(
          `INSERT INTO rewards (tenant_id, name, points_cost, kind, value, ref_id, active) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6) RETURNING id`,
          [b.name, b.pointsCost, b.kind, b.value ?? 0, b.refId ?? null, b.active ?? true],
        ),
      );
      return reply.code(201).send(r.rows[0]);
    });
    panel.patch('/admin/rewards/:id', async (request) => {
      const id = (request.params as { id: string }).id;
      const b = rewardBody.partial().parse(request.body);
      await withTenant(tid(request), (sql) =>
        sql(
          `UPDATE rewards SET name = COALESCE($2, name), points_cost = COALESCE($3, points_cost), kind = COALESCE($4, kind), value = COALESCE($5, value),
                  ref_id = COALESCE($6, ref_id), active = COALESCE($7, active) WHERE id = $1`,
          [id, b.name ?? null, b.pointsCost ?? null, b.kind ?? null, b.value ?? null, b.refId ?? null, b.active ?? null],
        ),
      );
      return { ok: true };
    });

    // Membresías vendidas (activas y por vencer)
    panel.get('/admin/memberships/sold', async (request) =>
      withTenant(tid(request), async (sql) => ({
        memberships: (
          await sql(
            `SELECT cm.id, cm.name, cm.starts_at, cm.ends_at, c.name AS client_name, c.phone AS client_phone, c.id AS client_id
               FROM client_memberships cm JOIN clients c ON c.id = cm.client_id WHERE cm.ends_at > now() - interval '15 days' ORDER BY cm.ends_at`,
          )
        ).rows,
      })),
    );

    // ------------------------------ Campañas ------------------------------
    const segmentSchema = z.object({ type: z.enum(['all', 'inactive', 'new', 'service', 'staff', 'tag', 'vip']), days: z.number().int().min(1).max(730).optional(), serviceId: z.string().uuid().optional(), staffId: z.string().uuid().optional(), tag: z.string().max(30).optional() });
    panel.post('/admin/campaigns/preview', async (request) => {
      const seg = segmentSchema.parse(request.body);
      const list = await withTenant(tid(request), (sql) => segmentClients(sql, seg));
      return { count: list.length, sample: list.slice(0, 5).map((c) => c.name) };
    });
    panel.get('/admin/campaigns', async (request) => withTenant(tid(request), async (sql) => ({ campaigns: (await sql('SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 50')).rows })));
    const campaignBody = z.object({
      name: z.string().min(1).max(80),
      segment: segmentSchema,
      subject: z.string().min(1).max(120),
      body: z.string().min(1).max(3000),
      discountPercent: z.number().int().min(0).max(100).optional(), // genera un código de promoción automático
      validDays: z.number().int().min(1).max(90).optional(),
    });
    panel.post('/admin/campaigns/send', async (request, reply) => {
      const b = campaignBody.parse(request.body);
      const t = request.tenant!;
      const out = await withTenant(t.id, async (sql) => {
        const list = await segmentClients(sql, b.segment);
        if (list.length === 0) return { error: 'segmento_vacio' };
        let code: string | null = null;
        if (b.discountPercent) {
          code = `${b.name.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 8) || 'PROMO'}${Math.floor(10 + Math.random() * 89)}`;
          await sql(
            `INSERT INTO promotions (tenant_id, code, kind, value, expires_at) VALUES (current_setting('app.tenant_id')::uuid, $1, 'percent', $2, now() + make_interval(days => $3))
             ON CONFLICT (tenant_id, code) DO NOTHING`,
            [code, b.discountPercent, b.validDays ?? 30],
          );
        }
        const c = await sql<{ id: string }>(
          `INSERT INTO campaigns (tenant_id, name, segment, subject, body, promo_code, status) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, 'sending') RETURNING id`,
          [b.name, JSON.stringify(b.segment), b.subject, b.body, code],
        );
        return { campaignId: c.rows[0].id, list, code };
      });
      if ('error' in out) return reply.code(409).send(out);
      // Envío en segundo plano, de a poco para cuidar la reputación del dominio
      void (async () => {
        let sent = 0;
        for (const client of out.list) {
          const first = (client.name ?? '').split(' ')[0];
          const body = b.body.replace(/\{nombre\}/gi, first || 'hola');
          const r = await sendEmail({
            to: client.email,
            fromName: t.name,
            subject: b.subject.replace(/\{nombre\}/gi, first),
            html: layout({
              brand: t.name,
              title: b.subject.replace(/\{nombre\}/gi, first),
              intro: body,
              rows: out.code ? [['Tu código', out.code], ['Descuento', `${b.discountPercent}%`]] : undefined,
              cta: { label: 'Reservar ahora', href: tenantUrl(t.slug, `/reservar${out.code ? `?codigo=${out.code}` : ''}`) },
              secondary: { label: 'No quiero recibir más correos', href: tenantUrl(t.slug, `/baja?t=${client.unsubscribe_token}`) },
              foot: `Recibes este correo porque eres cliente de ${esc(t.name)}.`,
            }),
          });
          if (r.ok) {
            sent++;
            await admin('INSERT INTO campaign_sends (campaign_id, tenant_id, client_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [out.campaignId, t.id, client.id]);
          }
          await new Promise((res) => setTimeout(res, 250));
        }
        await admin("UPDATE campaigns SET status = 'sent', sent_count = $2, sent_at = now() WHERE id = $1", [out.campaignId, sent]);
      })();
      return reply.code(202).send({ ok: true, campaignId: out.campaignId, recipients: out.list.length, promoCode: out.code });
    });

    // Tarjetas de regalo compradas en línea (para el panel)
    panel.get('/admin/gift-cards/online', async (request) =>
      withTenant(tid(request), async (sql) => ({
        giftCards: (
          await sql(
            `SELECT id, code, initial_cents, balance_cents, active, source, buyer_name, recipient_name, recipient_email, paid, deliver_at, delivered_at, created_at
               FROM gift_cards WHERE source IN ('online','pos') ORDER BY created_at DESC LIMIT 100`,
          )
        ).rows,
      })),
    );
  });
};
