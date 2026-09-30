import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { withTenant, type Sql } from '../db.js';
import { tenantConfig } from '../lib/features.js';
import { emitTenantEvent, emitAvailabilityChange } from '../lib/realtime.js';
import { notifyNearTickets } from './queue.js';

// Caja del local: cobrar servicios y productos con pago mixto y propinas,
// abrir y cerrar caja, movimientos de efectivo y recibo opcional adjunto.
const TODAY = "(now() AT TIME ZONE 'America/Lima')::date";

function tid(request: FastifyRequest): string {
  if (!request.tenant) throw new Error('tenant_no_resuelto');
  return request.tenant.id;
}

class PosError extends Error {
  constructor(public code: string, public status = 400, public extra: Record<string, unknown> = {}) {
    super(code);
  }
}

async function openSession(sql: Sql, userId: string, openingCents = 0, auto = false) {
  const cur = await sql<{ id: string }>("SELECT id FROM cash_sessions WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1");
  if (cur.rows[0]) return cur.rows[0].id;
  const r = await sql<{ id: string }>(
    `INSERT INTO cash_sessions (tenant_id, opened_by, opening_cents, notes) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3) RETURNING id`,
    [userId, openingCents, auto ? 'Abierta automáticamente con el primer cobro' : null],
  );
  return r.rows[0].id;
}

/** Efectivo que debería haber en la caja: apertura + cobros en efectivo + ingresos - salidas - gastos pagados de la caja. */
async function expectedCash(sql: Sql, sessionId: string) {
  const r = await sql<{ opening: number; cash_sales: number; ins: number; outs: number; expenses: number }>(
    `SELECT cs.opening_cents AS opening,
            COALESCE((SELECT sum(sp.amount_cents) FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
                       WHERE s.session_id = cs.id AND s.status = 'paid' AND sp.method = 'cash'), 0)::int AS cash_sales,
            COALESCE((SELECT sum(amount_cents) FROM cash_movements WHERE session_id = cs.id AND kind = 'in'), 0)::int AS ins,
            COALESCE((SELECT sum(amount_cents) FROM cash_movements WHERE session_id = cs.id AND kind = 'out'), 0)::int AS outs,
            COALESCE((SELECT sum(amount_cents) FROM expenses WHERE session_id = cs.id AND method = 'cash'), 0)::int AS expenses
       FROM cash_sessions cs WHERE cs.id = $1`,
    [sessionId],
  );
  const x = r.rows[0];
  return { ...x, expected: x.opening + x.cash_sales + x.ins - x.outs - x.expenses };
}

async function summary(sql: Sql, where: string, params: unknown[]) {
  const [byMethod, totals, byStaff, byKind] = await Promise.all([
    sql(
      `SELECT sp.method, COALESCE(sum(sp.amount_cents), 0)::int AS cents, count(DISTINCT s.id)::int AS ventas
         FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id WHERE s.status = 'paid' AND ${where} GROUP BY sp.method ORDER BY cents DESC`,
      params,
    ),
    sql(
      `SELECT count(*)::int AS ventas, COALESCE(sum(total_cents), 0)::int AS total_cents, COALESCE(sum(tip_cents), 0)::int AS tips_cents,
              COALESCE(sum(discount_cents), 0)::int AS discount_cents, COALESCE(round(avg(total_cents - tip_cents)), 0)::int AS ticket_promedio_cents,
              count(*) FILTER (WHERE receipt_url IS NOT NULL OR receipt_number IS NOT NULL)::int AS con_recibo
         FROM sales s WHERE s.status = 'paid' AND ${where}`,
      params,
    ),
    sql(
      `SELECT st.id AS staff_id, st.name, COALESCE(sum(si.total_cents) FILTER (WHERE si.kind = 'service'), 0)::int AS servicios_cents,
              COALESCE(sum(si.total_cents) FILTER (WHERE si.kind = 'product'), 0)::int AS productos_cents,
              COALESCE(sum(si.commission_cents), 0)::int AS comision_cents,
              (SELECT COALESCE(sum(s2.tip_cents), 0) FROM sales s2 WHERE s2.staff_id = st.id AND s2.status = 'paid' AND ${where.replace(/\bs\./g, 's2.')})::int AS tips_cents
         FROM staff st LEFT JOIN sale_items si ON si.staff_id = st.id AND si.sale_id IN (SELECT s.id FROM sales s WHERE s.status = 'paid' AND ${where})
        GROUP BY st.id, st.name ORDER BY servicios_cents DESC`,
      params,
    ),
    sql(
      `SELECT si.kind, COALESCE(sum(si.total_cents), 0)::int AS cents FROM sale_items si JOIN sales s ON s.id = si.sale_id
        WHERE s.status = 'paid' AND ${where} GROUP BY si.kind`,
      params,
    ),
  ]);
  return { totals: totals.rows[0], byMethod: byMethod.rows, byStaff: byStaff.rows, byKind: byKind.rows };
}

const itemSchema = z.object({
  kind: z.enum(['service', 'product', 'package', 'gift_card', 'membership', 'other']),
  refId: z.string().uuid().optional(),
  name: z.string().max(120).optional(),
  qty: z.number().int().min(1).max(99).default(1),
  unitCents: z.number().int().min(0).max(10_000_000).optional(), // solo para 'other' y gift_card (monto elegido)
  staffId: z.string().uuid().nullable().optional(),
});
const paymentSchema = z.object({
  method: z.enum(['cash', 'yape', 'plin', 'card', 'transfer', 'gift_card', 'deposit', 'package', 'points']),
  amountCents: z.number().int().min(0),
  reference: z.string().max(80).optional(), // gift card: código; package: client_package_id; points: reward_id
});
const checkoutSchema = z.object({
  appointmentId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  client: z.object({ name: z.string().min(1).max(80), phone: z.string().min(6).max(20), email: z.string().email().optional() }).optional(),
  staffId: z.string().uuid().nullable().optional(),
  items: z.array(itemSchema).min(1).max(40),
  discountCents: z.number().int().min(0).default(0),
  tipCents: z.number().int().min(0).default(0),
  payments: z.array(paymentSchema).min(1).max(6),
  receiptUrl: z.string().max(500).optional(),
  receiptNumber: z.string().max(40).optional(),
  note: z.string().max(300).optional(),
});

export const posRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireTenant);

  // Lo que la caja necesita para cobrar rápido: catálogo y a quién cobrarle ahora
  app.get('/admin/pos/catalog', async (request) =>
    withTenant(tid(request), async (sql) => {
      const [services, products, packages, plans, rewards, staff, pendingAppts, tickets] = await Promise.all([
        sql('SELECT id, name, price_cents, duration_min, is_addon FROM services WHERE is_active ORDER BY is_addon, sort_order, name'),
        sql('SELECT id, name, price_cents, stock, min_stock, category, photo_url FROM products WHERE is_active ORDER BY category NULLS LAST, name'),
        sql('SELECT id, name, price_cents, uses, service_ids, valid_days FROM packages WHERE active ORDER BY sort_order, price_cents'),
        sql("SELECT id, name, price_cents, period FROM membership_plans WHERE active ORDER BY sort_order, price_cents"),
        sql('SELECT id, name, points_cost, kind, value, ref_id FROM rewards WHERE active ORDER BY points_cost'),
        sql(`SELECT id, name, photo_url, commission_percent,
                    (SELECT COALESCE(json_object_agg(ss.service_id, ss.price_cents), '{}'::json) FROM service_staff ss WHERE ss.staff_id = staff.id AND ss.price_cents IS NOT NULL) AS prices
               FROM staff ORDER BY sort_order, name`),
        sql(
          `SELECT a.id, a.starts_at, a.status, a.price_cents, a.staff_id, s.name AS staff_name, a.client_id, c.name AS client_name, c.phone AS client_phone,
                  (SELECT json_agg(json_build_object('service_id', aps.service_id, 'name', sv.name, 'price_cents', aps.price_cents))
                     FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id WHERE aps.appointment_id = a.id) AS services,
                  a.discount_cents,
                  (SELECT COALESCE(sum(amount_cents), 0) FROM payments p WHERE p.appointment_id = a.id AND p.status = 'captured')::int AS deposit_cents
             FROM appointments a LEFT JOIN staff s ON s.id = a.staff_id LEFT JOIN clients c ON c.id = a.client_id
            WHERE (a.starts_at AT TIME ZONE 'America/Lima')::date = ${TODAY} AND a.status IN ('confirmed','pending','completed')
              AND NOT EXISTS (SELECT 1 FROM sales x WHERE x.appointment_id = a.id AND x.status = 'paid')
            ORDER BY a.starts_at`,
        ),
        sql(
          `SELECT q.id, q.number, q.name, q.status, q.served_by, sb.name AS served_by_name, q.service_id, sv.name AS service_name, sv.price_cents, q.client_id
             FROM queue_tickets q LEFT JOIN staff sb ON sb.id = q.served_by LEFT JOIN services sv ON sv.id = q.service_id
            WHERE q.day = ${TODAY} AND q.status IN ('called','serving') AND q.sale_id IS NULL ORDER BY q.called_at`,
        ),
      ]);
      return { services: services.rows, products: products.rows, packages: packages.rows, plans: plans.rows, rewards: rewards.rows, staff: staff.rows, pendingAppointments: pendingAppts.rows, tickets: tickets.rows };
    }),
  );

  app.get('/admin/pos/state', async (request) =>
    withTenant(tid(request), async (sql) => {
      const cfg = await tenantConfig(sql);
      const s = await sql<{ id: string; opened_at: Date; opening_cents: number; opened_by_name: string | null }>(
        `SELECT cs.id, cs.opened_at, cs.opening_cents, u.name AS opened_by_name FROM cash_sessions cs LEFT JOIN users u ON u.id = cs.opened_by
          WHERE cs.status = 'open' ORDER BY cs.opened_at DESC LIMIT 1`,
      );
      const session = s.rows[0] ? { ...s.rows[0], cash: await expectedCash(sql, s.rows[0].id) } : null;
      const today = await summary(sql, `(s.created_at AT TIME ZONE 'America/Lima')::date = ${TODAY}`, []);
      return { session, config: cfg.pos, features: cfg.features, today };
    }),
  );

  app.post('/admin/cash/open', async (request, reply) => {
    const b = z.object({ openingCents: z.number().int().min(0).default(0) }).parse(request.body ?? {});
    const id = await withTenant(tid(request), async (sql) => {
      const cur = await sql("SELECT 1 FROM cash_sessions WHERE status = 'open'");
      if (cur.rows.length) return null;
      return openSession(sql, request.user.sub, b.openingCents);
    });
    if (!id) return reply.code(409).send({ error: 'caja_ya_abierta' });
    await emitTenantEvent(tid(request), 'cash_changed');
    return reply.code(201).send({ ok: true, sessionId: id });
  });

  app.post('/admin/cash/movement', async (request, reply) => {
    const b = z.object({ kind: z.enum(['in', 'out']), amountCents: z.number().int().min(1), reason: z.string().min(1).max(120) }).parse(request.body);
    const ok = await withTenant(tid(request), async (sql) => {
      const cur = await sql<{ id: string }>("SELECT id FROM cash_sessions WHERE status = 'open' LIMIT 1");
      if (!cur.rows[0]) return false;
      await sql(`INSERT INTO cash_movements (tenant_id, session_id, kind, amount_cents, reason, created_by) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5)`, [
        cur.rows[0].id,
        b.kind,
        b.amountCents,
        b.reason,
        request.user.sub,
      ]);
      return true;
    });
    if (!ok) return reply.code(409).send({ error: 'caja_cerrada' });
    await emitTenantEvent(tid(request), 'cash_changed');
    return reply.code(201).send({ ok: true });
  });

  // Cierre con cuadre: lo contado contra lo esperado
  app.post('/admin/cash/close', async (request, reply) => {
    const b = z.object({ countedCents: z.number().int().min(0), notes: z.string().max(300).optional() }).parse(request.body);
    const out = await withTenant(tid(request), async (sql) => {
      const cur = await sql<{ id: string }>("SELECT id FROM cash_sessions WHERE status = 'open' LIMIT 1");
      if (!cur.rows[0]) return null;
      const cash = await expectedCash(sql, cur.rows[0].id);
      await sql(
        `UPDATE cash_sessions SET status = 'closed', closed_at = now(), closed_by = $2, expected_cents = $3::int, counted_cents = $4::int, difference_cents = $4::int - $3::int,
                notes = COALESCE($5, notes) WHERE id = $1`,
        [cur.rows[0].id, request.user.sub, cash.expected, b.countedCents, b.notes ?? null],
      );
      const sum = await summary(sql, 's.session_id = $1', [cur.rows[0].id]);
      return { sessionId: cur.rows[0].id, expected: cash.expected, counted: b.countedCents, difference: b.countedCents - cash.expected, cash, summary: sum };
    });
    if (!out) return reply.code(409).send({ error: 'caja_cerrada' });
    await emitTenantEvent(tid(request), 'cash_changed');
    return out;
  });

  app.get('/admin/cash/sessions', async (request) =>
    withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        `SELECT cs.id, cs.status, cs.opened_at, cs.closed_at, cs.opening_cents, cs.expected_cents, cs.counted_cents, cs.difference_cents, cs.notes,
                uo.name AS opened_by_name, uc.name AS closed_by_name,
                (SELECT COALESCE(sum(total_cents), 0) FROM sales s WHERE s.session_id = cs.id AND s.status = 'paid')::int AS total_cents,
                (SELECT count(*) FROM sales s WHERE s.session_id = cs.id AND s.status = 'paid')::int AS ventas
           FROM cash_sessions cs LEFT JOIN users uo ON uo.id = cs.opened_by LEFT JOIN users uc ON uc.id = cs.closed_by
          ORDER BY cs.opened_at DESC LIMIT 60`,
      );
      return { sessions: rows };
    }),
  );

  // ------------------------------ Cobrar ------------------------------
  app.post('/admin/pos/checkout', async (request, reply) => {
    const b = checkoutSchema.parse(request.body);
    const tenantId = tid(request);
    try {
      const result = await withTenant(tenantId, async (sql) => {
        const cfg = await tenantConfig(sql);
        if (!cfg.features.pos) throw new PosError('funcion_desactivada', 403);
        if (b.tipCents > 0 && !cfg.features.tips) throw new PosError('propinas_desactivadas');

        // Cliente: el de la cita, el elegido, o uno nuevo por celular
        let clientId = b.clientId ?? null;
        let appt: { id: string; client_id: string | null; staff_id: string | null; status: string; deposit_cents: number } | null = null;
        if (b.appointmentId) {
          const a = await sql<{ id: string; client_id: string | null; staff_id: string | null; status: string; deposit_cents: number }>(
            `SELECT a.id, a.client_id, a.staff_id, a.status,
                    (SELECT COALESCE(sum(amount_cents), 0) FROM payments p WHERE p.appointment_id = a.id AND p.status = 'captured')::int AS deposit_cents
               FROM appointments a WHERE a.id = $1`,
            [b.appointmentId],
          );
          appt = a.rows[0] ?? null;
          if (!appt) throw new PosError('cita_no_encontrada', 404);
          const paid = await sql("SELECT 1 FROM sales WHERE appointment_id = $1 AND status = 'paid'", [appt.id]);
          if (paid.rows.length) throw new PosError('cita_ya_cobrada', 409);
          clientId = clientId ?? appt.client_id;
        }
        if (!clientId && b.ticketId) {
          const tk = await sql<{ client_id: string | null }>('SELECT client_id FROM queue_tickets WHERE id = $1', [b.ticketId]);
          clientId = tk.rows[0]?.client_id ?? null;
        }
        if (!clientId && b.client) {
          const c = await sql<{ id: string }>(
            `INSERT INTO clients (tenant_id, phone, name, email) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3)
             ON CONFLICT (tenant_id, phone) DO UPDATE SET name = COALESCE(clients.name, EXCLUDED.name), email = COALESCE(EXCLUDED.email, clients.email) RETURNING id`,
            [b.client.phone, b.client.name, b.client.email ?? null],
          );
          clientId = c.rows[0].id;
        }
        const mainStaff = b.staffId ?? appt?.staff_id ?? null;

        // Precios siempre desde la base de datos
        const staffRows = (await sql<{ id: string; commission_percent: number }>('SELECT id, commission_percent FROM staff')).rows;
        const commissionOf = (id: string | null | undefined) => staffRows.find((s) => s.id === id)?.commission_percent ?? 0;
        interface Line { kind: string; refId: string | null; name: string; qty: number; unit: number; total: number; staffId: string | null; productCommission: number; meta?: Record<string, unknown> }
        const lines: Line[] = [];
        for (const it of b.items) {
          const staffId = it.staffId === undefined ? mainStaff : it.staffId;
          if (it.kind === 'service') {
            const r = await sql<{ name: string; price_cents: number }>('SELECT name, price_cents FROM services WHERE id = $1', [it.refId]);
            if (!r.rows[0]) throw new PosError('servicio_no_encontrado', 404);
            // Precio especial del barbero, si existe
            const ov = staffId ? await sql<{ price_cents: number | null }>('SELECT price_cents FROM service_staff WHERE service_id = $1 AND staff_id = $2', [it.refId, staffId]) : { rows: [] };
            const unit = ov.rows[0]?.price_cents ?? r.rows[0].price_cents;
            lines.push({ kind: 'service', refId: it.refId!, name: r.rows[0].name, qty: it.qty, unit, total: unit * it.qty, staffId, productCommission: 0 });
          } else if (it.kind === 'product') {
            const r = await sql<{ name: string; price_cents: number; stock: number; commission_percent: number }>('SELECT name, price_cents, stock, commission_percent FROM products WHERE id = $1 AND is_active', [it.refId]);
            if (!r.rows[0]) throw new PosError('producto_no_encontrado', 404);
            if (r.rows[0].stock < it.qty) throw new PosError('sin_stock', 409, { product: r.rows[0].name, stock: r.rows[0].stock });
            lines.push({ kind: 'product', refId: it.refId!, name: r.rows[0].name, qty: it.qty, unit: r.rows[0].price_cents, total: r.rows[0].price_cents * it.qty, staffId, productCommission: r.rows[0].commission_percent });
          } else if (it.kind === 'package') {
            const r = await sql<{ name: string; price_cents: number; uses: number; service_ids: string[]; valid_days: number }>('SELECT name, price_cents, uses, service_ids, valid_days FROM packages WHERE id = $1 AND active', [it.refId]);
            if (!r.rows[0]) throw new PosError('paquete_no_encontrado', 404);
            if (!clientId) throw new PosError('paquete_requiere_cliente');
            lines.push({ kind: 'package', refId: it.refId!, name: r.rows[0].name, qty: 1, unit: r.rows[0].price_cents, total: r.rows[0].price_cents, staffId, productCommission: 0, meta: r.rows[0] });
          } else if (it.kind === 'membership') {
            const r = await sql<{ name: string; price_cents: number; period: string }>('SELECT name, price_cents, period FROM membership_plans WHERE id = $1 AND active', [it.refId]);
            if (!r.rows[0]) throw new PosError('membresia_no_encontrada', 404);
            if (!clientId) throw new PosError('membresia_requiere_cliente');
            lines.push({ kind: 'membership', refId: it.refId!, name: r.rows[0].name, qty: 1, unit: r.rows[0].price_cents, total: r.rows[0].price_cents, staffId, productCommission: 0, meta: r.rows[0] });
          } else if (it.kind === 'gift_card') {
            if (!it.unitCents || it.unitCents < 500) throw new PosError('monto_minimo_gift_card');
            lines.push({ kind: 'gift_card', refId: null, name: it.name ?? 'Gift card', qty: 1, unit: it.unitCents, total: it.unitCents, staffId: null, productCommission: 0 });
          } else {
            if (it.unitCents === undefined || !it.name) throw new PosError('item_incompleto');
            lines.push({ kind: 'other', refId: null, name: it.name, qty: it.qty, unit: it.unitCents, total: it.unitCents * it.qty, staffId, productCommission: 0 });
          }
        }
        const subtotal = lines.reduce((s, l) => s + l.total, 0);
        const discount = Math.min(b.discountCents, subtotal);
        const total = subtotal - discount + b.tipCents;

        // Pagos especiales: adelanto ya cobrado, paquete, puntos, gift card
        const payments = [...b.payments];
        if (appt && appt.deposit_cents > 0 && !payments.some((p) => p.method === 'deposit')) {
          payments.unshift({ method: 'deposit', amountCents: Math.min(appt.deposit_cents, total), reference: undefined });
        }
        const paid = payments.reduce((s, p) => s + p.amountCents, 0);
        if (paid !== total) throw new PosError('pagos_no_cuadran', 400, { total, paid });

        for (const p of payments) {
          if (p.method === 'gift_card') {
            const g = await sql<{ id: string }>(
              `UPDATE gift_cards SET balance_cents = balance_cents - $2 WHERE upper(code) = upper($1) AND active AND balance_cents >= $2 RETURNING id`,
              [p.reference ?? '', p.amountCents],
            );
            if (!g.rows[0]) throw new PosError('gift_card_sin_saldo');
          } else if (p.method === 'package') {
            if (!clientId) throw new PosError('paquete_requiere_cliente');
            // Un uso de paquete vale como máximo el servicio más caro que cubre
            const maxService = Math.max(0, ...lines.filter((l) => l.kind === 'service').map((l) => l.unit));
            if (p.amountCents > maxService) throw new PosError('monto_paquete_invalido', 400, { max: maxService });
            const cp = await sql<{ id: string; service_ids: string[] }>(
              `UPDATE client_packages SET uses_left = uses_left - 1
                WHERE id = $1 AND client_id = $2 AND uses_left > 0 AND (expires_at IS NULL OR expires_at > now()) RETURNING id, service_ids`,
              [p.reference ?? '00000000-0000-0000-0000-000000000000', clientId],
            );
            if (!cp.rows[0]) throw new PosError('paquete_sin_usos');
            const allowed = cp.rows[0].service_ids;
            if (allowed.length && !lines.some((l) => l.kind === 'service' && l.refId && allowed.includes(l.refId))) throw new PosError('paquete_no_cubre_servicio');
          } else if (p.method === 'points') {
            if (!clientId) throw new PosError('puntos_requieren_cliente');
            const rw = await sql<{ id: string; name: string; points_cost: number; kind: string; value: number; ref_id: string | null }>('SELECT id, name, points_cost, kind, value, ref_id FROM rewards WHERE id = $1 AND active', [p.reference ?? '00000000-0000-0000-0000-000000000000']);
            if (!rw.rows[0]) throw new PosError('premio_no_encontrado');
            // Lo que vale el premio: el servicio o producto gratis, o el descuento
            const r0 = rw.rows[0];
            const itemValue = r0.ref_id ? Math.max(0, ...lines.filter((l) => l.refId === r0.ref_id).map((l) => l.unit)) : 0;
            const maxValue =
              r0.kind === 'discount_fixed' ? r0.value : r0.kind === 'discount_percent' ? Math.round((subtotal * r0.value) / 100) : itemValue || Math.max(0, ...lines.filter((l) => l.kind === (r0.kind === 'product' ? 'product' : 'service')).map((l) => l.unit));
            if (p.amountCents > maxValue) throw new PosError('monto_premio_invalido', 400, { max: maxValue });
            const c = await sql('UPDATE clients SET loyalty_points = loyalty_points - $2 WHERE id = $1 AND loyalty_points >= $2 RETURNING id', [clientId, rw.rows[0].points_cost]);
            if (!c.rows[0]) throw new PosError('puntos_insuficientes');
            await sql(`INSERT INTO reward_redemptions (tenant_id, client_id, reward_id, name, points) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4)`, [
              clientId,
              rw.rows[0].id,
              rw.rows[0].name,
              rw.rows[0].points_cost,
            ]);
          }
        }

        // Caja abierta (si no hay, se abre sola con el primer cobro)
        const sessionId = cfg.pos.requireSession ? await openSession(sql, request.user.sub, 0, true) : null;
        const number = (await sql<{ n: number }>('SELECT COALESCE(max(number), 0) + 1 AS n FROM sales')).rows[0].n;
        const sale = await sql<{ id: string; created_at: Date }>(
          `INSERT INTO sales (tenant_id, session_id, number, appointment_id, ticket_id, client_id, staff_id, subtotal_cents, discount_cents, tip_cents, total_cents,
                              receipt_url, receipt_number, note, created_by)
           VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id, created_at`,
          [sessionId, number, b.appointmentId ?? null, b.ticketId ?? null, clientId, mainStaff, subtotal, discount, b.tipCents, total, b.receiptUrl ?? null, b.receiptNumber ?? null, b.note ?? null, request.user.sub],
        );
        const saleId = sale.rows[0].id;

        for (const l of lines) {
          // La comisión se calcula sobre lo cobrado (con el descuento prorrateado)
          const net = subtotal > 0 ? Math.round(l.total * (1 - discount / subtotal)) : 0;
          const pct = l.kind === 'service' ? commissionOf(l.staffId) : l.kind === 'product' ? l.productCommission : 0;
          await sql(
            `INSERT INTO sale_items (tenant_id, sale_id, kind, ref_id, name, qty, unit_cents, total_cents, staff_id, commission_cents)
             VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [saleId, l.kind, l.refId, l.name, l.qty, l.unit, l.total, l.staffId, l.staffId ? Math.round((net * pct) / 100) : 0],
          );
          if (l.kind === 'product') {
            await sql('UPDATE products SET stock = stock - $2 WHERE id = $1', [l.refId, l.qty]);
            await sql(`INSERT INTO stock_movements (tenant_id, product_id, delta, reason, sale_id, created_by) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, 'sale', $3, $4)`, [
              l.refId,
              -l.qty,
              saleId,
              request.user.sub,
            ]);
          } else if (l.kind === 'package') {
            const m = l.meta as { uses: number; service_ids: string[]; valid_days: number; name: string };
            await sql(
              `INSERT INTO client_packages (tenant_id, client_id, package_id, name, service_ids, uses_total, uses_left, expires_at, sale_id)
               VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $5, now() + make_interval(days => $6), $7)`,
              [clientId, l.refId, m.name, m.service_ids, m.uses, m.valid_days, saleId],
            );
          } else if (l.kind === 'membership') {
            const m = l.meta as { period: string; name: string };
            await sql(
              `INSERT INTO client_memberships (tenant_id, client_id, plan_id, name, ends_at, sale_id)
               VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, now() + CASE WHEN $4 = 'year' THEN interval '1 year' ELSE interval '1 month' END, $5)`,
              [clientId, l.refId, m.name, m.period, saleId],
            );
          } else if (l.kind === 'gift_card') {
            const code = `GIFT-${randomBytes(3).toString('hex').toUpperCase()}`;
            await sql(`INSERT INTO gift_cards (tenant_id, code, initial_cents, balance_cents, source) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $2, 'pos')`, [code, l.total]);
            l.name = `${l.name} ${code}`;
            await sql("UPDATE sale_items SET name = $2 WHERE sale_id = $1 AND kind = 'gift_card' AND name NOT LIKE '%GIFT-%'", [saleId, l.name]);
          }
        }
        for (const p of payments) {
          await sql(`INSERT INTO sale_payments (tenant_id, sale_id, method, amount_cents, reference) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4)`, [
            saleId,
            p.method,
            p.amountCents,
            p.reference ?? null,
          ]);
        }

        // Cierra el ciclo: cita completada (suma puntos) y turno atendido
        let pointsAwarded = 0;
        if (appt && appt.status !== 'completed') {
          await sql("UPDATE appointments SET status = 'completed' WHERE id = $1", [appt.id]);
        }
        if (clientId && lines.some((l) => l.kind === 'service')) {
          const pts = await sql<{ loyalty_points_per_visit: number }>('SELECT loyalty_points_per_visit FROM tenant_settings');
          const already = appt ? (await sql<{ points_awarded: boolean }>('SELECT points_awarded FROM appointments WHERE id = $1', [appt.id])).rows[0]?.points_awarded : false;
          if (!already) {
            pointsAwarded = pts.rows[0]?.loyalty_points_per_visit ?? 10;
            await sql('UPDATE clients SET loyalty_points = loyalty_points + $2 WHERE id = $1', [clientId, pointsAwarded]);
            if (appt) await sql('UPDATE appointments SET points_awarded = true WHERE id = $1', [appt.id]);
          }
          if (appt) {
            await sql(
              `UPDATE clients c SET loyalty_points = c.loyalty_points + COALESCE((SELECT referral_reward_points FROM tenant_settings LIMIT 1), 50)
                 FROM appointments a WHERE a.id = $1 AND a.referred_by_client_id = c.id AND a.referral_rewarded = false`,
              [appt.id],
            );
            await sql('UPDATE appointments SET referral_rewarded = true WHERE id = $1 AND referred_by_client_id IS NOT NULL', [appt.id]);
          }
        }
        if (b.ticketId) {
          await sql("UPDATE queue_tickets SET status = 'done', finished_at = COALESCE(finished_at, now()), sale_id = $2, client_id = COALESCE(client_id, $3) WHERE id = $1", [
            b.ticketId,
            saleId,
            clientId,
          ]);
        }
        const lowStock = await sql('SELECT id, name, stock, min_stock FROM products WHERE is_active AND stock <= min_stock AND id = ANY($1)', [
          lines.filter((l) => l.kind === 'product').map((l) => l.refId),
        ]);
        const giftCodes = lines.filter((l) => l.kind === 'gift_card').map((l) => (l.name.match(/GIFT-[A-F0-9]{6}/) ?? [''])[0]).filter(Boolean);
        return { saleId, number, total, subtotal, discount, tip: b.tipCents, payments, clientId, pointsAwarded, lowStock: lowStock.rows, giftCodes, createdAt: sale.rows[0].created_at };
      });
      await emitTenantEvent(tenantId, 'sale_created', { number: result.number, total: result.total });
      if (b.ticketId) {
        await emitTenantEvent(tenantId, 'queue_changed');
        void notifyNearTickets(tenantId);
      }
      if (b.appointmentId) await emitAvailabilityChange(tenantId);
      return reply.code(201).send({ ok: true, ...result });
    } catch (err) {
      if (err instanceof PosError) return reply.code(err.status).send({ error: err.code, ...err.extra });
      throw err;
    }
  });

  // Alias corto para el barbero que cobra desde su celular
  app.post('/admin/sales', async (request, reply) => app.inject({ method: 'POST', url: '/api/admin/pos/checkout', headers: request.headers as Record<string, string>, payload: request.body as object }).then((r) => reply.code(r.statusCode).send(r.json())));

  app.get('/admin/sales', async (request) => {
    const q = z.object({ from: z.string().optional(), to: z.string().optional(), staffId: z.string().uuid().optional(), sessionId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(request.query);
    return withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        `SELECT s.id, s.number, s.created_at, s.status, s.subtotal_cents, s.discount_cents, s.tip_cents, s.total_cents, s.receipt_url, s.receipt_number, s.note, s.void_reason,
                s.appointment_id, s.ticket_id, c.name AS client_name, c.phone AS client_phone, st.name AS staff_name, u.name AS created_by_name,
                (SELECT json_agg(json_build_object('kind', si.kind, 'name', si.name, 'qty', si.qty, 'total_cents', si.total_cents, 'staff_id', si.staff_id)) FROM sale_items si WHERE si.sale_id = s.id) AS items,
                (SELECT json_agg(json_build_object('method', sp.method, 'amount_cents', sp.amount_cents, 'reference', sp.reference)) FROM sale_payments sp WHERE sp.sale_id = s.id) AS payments
           FROM sales s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN staff st ON st.id = s.staff_id LEFT JOIN users u ON u.id = s.created_by
          WHERE ($1::timestamptz IS NULL OR s.created_at >= $1) AND ($2::timestamptz IS NULL OR s.created_at < $2)
            AND ($3::uuid IS NULL OR s.staff_id = $3) AND ($4::uuid IS NULL OR s.session_id = $4)
          ORDER BY s.created_at DESC LIMIT $5`,
        [q.from ?? null, q.to ?? null, q.staffId ?? null, q.sessionId ?? null, q.limit],
      );
      return { sales: rows };
    });
  });

  app.get('/admin/sales/summary', async (request) => {
    const q = z.object({ from: z.string(), to: z.string() }).parse(request.query);
    return withTenant(tid(request), (sql) => summary(sql, 's.created_at >= $1 AND s.created_at < $2', [q.from, q.to]));
  });

  // Adjuntar la boleta o factura que la barbería emitió por su cuenta (opcional)
  app.patch('/admin/sales/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = z.object({ receiptUrl: z.string().max(500).nullable().optional(), receiptNumber: z.string().max(40).nullable().optional(), note: z.string().max(300).nullable().optional() }).parse(request.body);
    await withTenant(tid(request), (sql) =>
      sql(
        `UPDATE sales SET receipt_url = CASE WHEN $2 THEN $3 ELSE receipt_url END, receipt_number = CASE WHEN $4 THEN $5 ELSE receipt_number END,
                note = CASE WHEN $6 THEN $7 ELSE note END WHERE id = $1`,
        [id, b.receiptUrl !== undefined, b.receiptUrl ?? null, b.receiptNumber !== undefined, b.receiptNumber ?? null, b.note !== undefined, b.note ?? null],
      ),
    );
    return { ok: true };
  });

  // Anular: devuelve stock y saldo de gift cards
  app.post('/admin/sales/:id/void', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const b = z.object({ reason: z.string().min(2).max(200) }).parse(request.body);
    const ok = await withTenant(tid(request), async (sql) => {
      const s = await sql("UPDATE sales SET status = 'void', void_reason = $2 WHERE id = $1 AND status = 'paid' RETURNING id", [id, b.reason]);
      if (!s.rows.length) return false;
      const items = await sql<{ ref_id: string; qty: number }>("SELECT ref_id, qty FROM sale_items WHERE sale_id = $1 AND kind = 'product'", [id]);
      for (const it of items.rows) {
        await sql('UPDATE products SET stock = stock + $2 WHERE id = $1', [it.ref_id, it.qty]);
        await sql(`INSERT INTO stock_movements (tenant_id, product_id, delta, reason, sale_id, created_by) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, 'void', $3, $4)`, [
          it.ref_id,
          it.qty,
          id,
          request.user.sub,
        ]);
      }
      const gifts = await sql<{ reference: string; amount_cents: number }>("SELECT reference, amount_cents FROM sale_payments WHERE sale_id = $1 AND method = 'gift_card'", [id]);
      for (const g of gifts.rows) await sql('UPDATE gift_cards SET balance_cents = balance_cents + $2 WHERE upper(code) = upper($1)', [g.reference, g.amount_cents]);
      const pk = await sql<{ reference: string }>("SELECT reference FROM sale_payments WHERE sale_id = $1 AND method = 'package'", [id]);
      for (const p of pk.rows) await sql('UPDATE client_packages SET uses_left = uses_left + 1 WHERE id = $1', [p.reference]);
      return true;
    });
    if (!ok) return reply.code(409).send({ error: 'no_se_puede_anular' });
    await emitTenantEvent(tid(request), 'sale_voided');
    return { ok: true };
  });

  // ------------------------------ Productos e inventario ------------------------------
  app.get('/admin/products', async (request) =>
    withTenant(tid(request), async (sql) => ({
      products: (
        await sql(
          `SELECT p.*, (SELECT COALESCE(sum(-delta), 0) FROM stock_movements m WHERE m.product_id = p.id AND m.reason = 'sale' AND m.created_at > now() - interval '30 days')::int AS vendidos_30d
             FROM products p ORDER BY p.is_active DESC, p.category NULLS LAST, p.name`,
        )
      ).rows,
    })),
  );
  const productBody = z.object({
    name: z.string().min(1).max(120),
    sku: z.string().max(40).nullable().optional(),
    category: z.string().max(60).nullable().optional(),
    priceCents: z.number().int().min(0),
    costCents: z.number().int().min(0).optional(),
    stock: z.number().int().optional(),
    minStock: z.number().int().min(0).optional(),
    commissionPercent: z.number().int().min(0).max(100).optional(),
    photoUrl: z.string().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
  });
  app.post('/admin/products', async (request, reply) => {
    const b = productBody.parse(request.body);
    const out = await withTenant(tid(request), async (sql) => {
      const r = await sql<{ id: string }>(
        `INSERT INTO products (tenant_id, name, sku, category, price_cents, cost_cents, stock, min_stock, commission_percent, photo_url, is_active)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [b.name, b.sku ?? null, b.category ?? null, b.priceCents, b.costCents ?? 0, b.stock ?? 0, b.minStock ?? 0, b.commissionPercent ?? 0, b.photoUrl ?? null, b.isActive ?? true],
      );
      if (b.stock) await sql(`INSERT INTO stock_movements (tenant_id, product_id, delta, reason, note, created_by) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, 'purchase', 'Stock inicial', $3)`, [r.rows[0].id, b.stock, request.user.sub]);
      return r.rows[0];
    });
    return reply.code(201).send(out);
  });
  app.patch('/admin/products/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = productBody.partial().omit({ stock: true }).parse(request.body);
    await withTenant(tid(request), (sql) =>
      sql(
        `UPDATE products SET name = COALESCE($2, name), sku = COALESCE($3, sku), category = COALESCE($4, category), price_cents = COALESCE($5, price_cents),
                cost_cents = COALESCE($6, cost_cents), min_stock = COALESCE($7, min_stock), commission_percent = COALESCE($8, commission_percent),
                photo_url = COALESCE($9, photo_url), is_active = COALESCE($10, is_active) WHERE id = $1`,
        [id, b.name ?? null, b.sku ?? null, b.category ?? null, b.priceCents ?? null, b.costCents ?? null, b.minStock ?? null, b.commissionPercent ?? null, b.photoUrl ?? null, b.isActive ?? null],
      ),
    );
    return { ok: true };
  });
  // Entrada de mercadería o ajuste de inventario
  app.post('/admin/products/:id/stock', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const b = z.object({ delta: z.number().int().refine((v) => v !== 0), reason: z.enum(['purchase', 'adjust']), note: z.string().max(120).optional(), costCents: z.number().int().min(0).optional() }).parse(request.body);
    const r = await withTenant(tid(request), async (sql) => {
      const u = await sql<{ stock: number }>('UPDATE products SET stock = stock + $2, cost_cents = COALESCE($3, cost_cents) WHERE id = $1 RETURNING stock', [id, b.delta, b.costCents ?? null]);
      if (!u.rows[0]) return null;
      await sql(`INSERT INTO stock_movements (tenant_id, product_id, delta, reason, note, created_by) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5)`, [id, b.delta, b.reason, b.note ?? null, request.user.sub]);
      return u.rows[0];
    });
    if (!r) return reply.code(404).send({ error: 'producto_no_encontrado' });
    return { ok: true, stock: r.stock };
  });
  app.delete('/admin/products/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    await withTenant(tid(request), (sql) => sql('UPDATE products SET is_active = false WHERE id = $1', [id]));
    return { ok: true };
  });
};
