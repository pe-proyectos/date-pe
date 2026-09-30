import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db.js';

// Gastos, ganancia real del mes, liquidación del equipo y exportación para el contador.
function tid(request: FastifyRequest): string {
  if (!request.tenant) throw new Error('tenant_no_resuelto');
  return request.tenant.id;
}

export const EXPENSE_CATEGORIES = ['Alquiler', 'Insumos', 'Productos para venta', 'Luz, agua e internet', 'Sueldos', 'Publicidad', 'Mantenimiento', 'Impuestos', 'Otros'];

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const soles = (c: number | null | undefined) => ((c ?? 0) / 100).toFixed(2);

export const financeRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireTenant);

  // ------------------------------ Gastos ------------------------------
  app.get('/admin/expenses', async (request) => {
    const q = z.object({ from: z.string().optional(), to: z.string().optional() }).parse(request.query);
    return withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        `SELECT e.id, e.spent_on::text AS spent_on, e.category, e.amount_cents, e.method, e.note, e.receipt_url, e.created_at, u.name AS created_by_name
           FROM expenses e LEFT JOIN users u ON u.id = e.created_by
          WHERE ($1::date IS NULL OR e.spent_on >= $1) AND ($2::date IS NULL OR e.spent_on <= $2)
          ORDER BY e.spent_on DESC, e.created_at DESC LIMIT 500`,
        [q.from ?? null, q.to ?? null],
      );
      return { expenses: rows, categories: EXPENSE_CATEGORIES };
    });
  });
  const expenseBody = z.object({
    spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    category: z.string().min(1).max(60),
    amountCents: z.number().int().min(1),
    method: z.enum(['cash', 'yape', 'plin', 'card', 'transfer']).optional(),
    note: z.string().max(200).optional(),
    receiptUrl: z.string().max(500).optional(),
    fromCash: z.boolean().optional(), // pagado con el efectivo de la caja abierta
  });
  app.post('/admin/expenses', async (request, reply) => {
    const b = expenseBody.parse(request.body);
    const out = await withTenant(tid(request), async (sql) => {
      const session = b.fromCash ? (await sql<{ id: string }>("SELECT id FROM cash_sessions WHERE status = 'open' LIMIT 1")).rows[0]?.id ?? null : null;
      const r = await sql(
        `INSERT INTO expenses (tenant_id, spent_on, category, amount_cents, method, note, receipt_url, session_id, created_by)
         VALUES (current_setting('app.tenant_id')::uuid, COALESCE($1::date, (now() AT TIME ZONE 'America/Lima')::date), $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [b.spentOn ?? null, b.category, b.amountCents, b.fromCash ? 'cash' : (b.method ?? null), b.note ?? null, b.receiptUrl ?? null, session, request.user.sub],
      );
      return r.rows[0];
    });
    return reply.code(201).send(out);
  });
  app.patch('/admin/expenses/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = expenseBody.partial().parse(request.body);
    await withTenant(tid(request), (sql) =>
      sql(
        `UPDATE expenses SET spent_on = COALESCE($2::date, spent_on), category = COALESCE($3, category), amount_cents = COALESCE($4, amount_cents),
                method = COALESCE($5, method), note = COALESCE($6, note), receipt_url = COALESCE($7, receipt_url) WHERE id = $1`,
        [id, b.spentOn ?? null, b.category ?? null, b.amountCents ?? null, b.method ?? null, b.note ?? null, b.receiptUrl ?? null],
      ),
    );
    return { ok: true };
  });
  app.delete('/admin/expenses/:id', async (request) => {
    await withTenant(tid(request), (sql) => sql('DELETE FROM expenses WHERE id = $1', [(request.params as { id: string }).id]));
    return { ok: true };
  });

  // ------------------------------ Ganancia real ------------------------------
  app.get('/admin/finance/profit', async (request) => {
    const q = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(request.query);
    return withTenant(tid(request), async (sql) => {
      const range = `(s.created_at AT TIME ZONE 'America/Lima')::date BETWEEN $1 AND $2`;
      const [income, cogs, expenses, byCategory, payouts, monthly] = await Promise.all([
        sql(
          `SELECT COALESCE(sum(s.total_cents - s.tip_cents), 0)::int AS ventas_cents, COALESCE(sum(s.tip_cents), 0)::int AS propinas_cents,
                  COALESCE(sum(si_c.comm), 0)::int AS comisiones_cents
             FROM sales s LEFT JOIN LATERAL (SELECT sum(commission_cents) AS comm FROM sale_items WHERE sale_id = s.id) si_c ON true
            WHERE s.status = 'paid' AND ${range}`,
          [q.from, q.to],
        ),
        sql(
          `SELECT COALESCE(sum(si.qty * p.cost_cents), 0)::int AS costo_productos_cents
             FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.ref_id
            WHERE si.kind = 'product' AND s.status = 'paid' AND ${range}`,
          [q.from, q.to],
        ),
        sql('SELECT COALESCE(sum(amount_cents), 0)::int AS gastos_cents FROM expenses WHERE spent_on BETWEEN $1 AND $2', [q.from, q.to]),
        sql('SELECT category, COALESCE(sum(amount_cents), 0)::int AS cents FROM expenses WHERE spent_on BETWEEN $1 AND $2 GROUP BY category ORDER BY cents DESC', [q.from, q.to]),
        sql('SELECT COALESCE(sum(total_cents), 0)::int AS pagado_equipo_cents FROM staff_payouts WHERE paid_at::date BETWEEN $1 AND $2', [q.from, q.to]),
        sql(
          `SELECT to_char(m, 'YYYY-MM') AS mes,
                  COALESCE((SELECT sum(total_cents - tip_cents) FROM sales s WHERE s.status = 'paid' AND date_trunc('month', s.created_at AT TIME ZONE 'America/Lima') = m), 0)::int AS ventas_cents,
                  COALESCE((SELECT sum(amount_cents) FROM expenses e WHERE date_trunc('month', e.spent_on) = m), 0)::int AS gastos_cents,
                  COALESCE((SELECT sum(si.commission_cents) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.status = 'paid' AND date_trunc('month', s.created_at AT TIME ZONE 'America/Lima') = m), 0)::int AS comisiones_cents,
                  COALESCE((SELECT sum(si.qty * p.cost_cents) FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.ref_id WHERE si.kind = 'product' AND s.status = 'paid' AND date_trunc('month', s.created_at AT TIME ZONE 'America/Lima') = m), 0)::int AS costo_cents
             FROM generate_series(date_trunc('month', $1::date) - interval '5 months', date_trunc('month', $1::date), interval '1 month') m ORDER BY m`,
          [q.to],
        ),
      ]);
      const i = income.rows[0];
      const utilidad = i.ventas_cents - i.comisiones_cents - cogs.rows[0].costo_productos_cents - expenses.rows[0].gastos_cents;
      return {
        from: q.from,
        to: q.to,
        ventasCents: i.ventas_cents,
        propinasCents: i.propinas_cents,
        comisionesCents: i.comisiones_cents,
        costoProductosCents: cogs.rows[0].costo_productos_cents,
        gastosCents: expenses.rows[0].gastos_cents,
        utilidadCents: utilidad,
        margen: i.ventas_cents > 0 ? Math.round((utilidad / i.ventas_cents) * 100) : 0,
        pagadoEquipoCents: payouts.rows[0].pagado_equipo_cents,
        gastosPorCategoria: byCategory.rows,
        mensual: monthly.rows.map((m: Record<string, number>) => ({ ...m, utilidad_cents: m.ventas_cents - m.gastos_cents - m.comisiones_cents - m.costo_cents })),
      };
    });
  });

  // ------------------------------ Liquidación del equipo ------------------------------
  // Comisiones + propinas - adelantos de lo aún no pagado
  app.get('/admin/payroll', async (request) => {
    const q = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(request.query);
    return withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        `SELECT st.id AS staff_id, st.name, st.photo_url, st.commission_percent,
                COALESCE(agg.services_cents, 0)::int AS services_cents,
                COALESCE(agg.commission_cents, 0)::int AS commission_cents,
                COALESCE(agg.product_commission_cents, 0)::int AS product_commission_cents,
                COALESCE(agg.clientes, 0)::int AS clientes,
                (SELECT COALESCE(sum(s2.tip_cents), 0) FROM sales s2 WHERE s2.staff_id = st.id AND s2.status = 'paid'
                   AND (s2.created_at AT TIME ZONE 'America/Lima')::date BETWEEN $1 AND $2)::int AS tips_cents,
                (SELECT COALESCE(sum(a.amount_cents), 0) FROM staff_advances a WHERE a.staff_id = st.id AND a.payout_id IS NULL)::int AS advances_cents,
                (SELECT max(p.period_end)::text FROM staff_payouts p WHERE p.staff_id = st.id) AS last_paid_until
           FROM staff st
           LEFT JOIN LATERAL (
             SELECT sum(si.total_cents) FILTER (WHERE si.kind = 'service') AS services_cents,
                    sum(si.commission_cents) FILTER (WHERE si.kind = 'service') AS commission_cents,
                    sum(si.commission_cents) FILTER (WHERE si.kind = 'product') AS product_commission_cents,
                    count(DISTINCT s.id) FILTER (WHERE si.kind = 'service') AS clientes
               FROM sale_items si JOIN sales s ON s.id = si.sale_id
              WHERE si.staff_id = st.id AND s.status = 'paid' AND (s.created_at AT TIME ZONE 'America/Lima')::date BETWEEN $1 AND $2
           ) agg ON true
          ORDER BY st.name`,
        [q.from, q.to],
      );
      const staff = rows.map((r: Record<string, number>) => ({ ...r, total_cents: r.commission_cents + r.product_commission_cents + r.tips_cents - r.advances_cents }));
      const history = await sql(
        `SELECT p.id, p.staff_id, st.name, p.period_start::text, p.period_end::text, p.total_cents, p.method, p.paid_at, p.note
           FROM staff_payouts p JOIN staff st ON st.id = p.staff_id ORDER BY p.paid_at DESC LIMIT 50`,
      );
      return { from: q.from, to: q.to, staff, history: history.rows };
    });
  });

  app.post('/admin/payroll/pay', async (request, reply) => {
    const b = z
      .object({ staffId: z.string().uuid(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), method: z.enum(['cash', 'yape', 'plin', 'transfer']).default('cash'), note: z.string().max(200).optional(), fromCash: z.boolean().optional() })
      .parse(request.body);
    const out = await withTenant(tid(request), async (sql) => {
      const calc = await sql<{ services: number; commission: number; product_commission: number; tips: number; advances: number }>(
        `SELECT COALESCE(sum(si.total_cents) FILTER (WHERE si.kind = 'service'), 0)::int AS services,
                COALESCE(sum(si.commission_cents) FILTER (WHERE si.kind = 'service'), 0)::int AS commission,
                COALESCE(sum(si.commission_cents) FILTER (WHERE si.kind = 'product'), 0)::int AS product_commission,
                (SELECT COALESCE(sum(tip_cents), 0) FROM sales WHERE staff_id = $1 AND status = 'paid' AND (created_at AT TIME ZONE 'America/Lima')::date BETWEEN $2 AND $3)::int AS tips,
                (SELECT COALESCE(sum(amount_cents), 0) FROM staff_advances WHERE staff_id = $1 AND payout_id IS NULL)::int AS advances
           FROM sale_items si JOIN sales s ON s.id = si.sale_id
          WHERE si.staff_id = $1 AND s.status = 'paid' AND (s.created_at AT TIME ZONE 'America/Lima')::date BETWEEN $2 AND $3`,
        [b.staffId, b.from, b.to],
      );
      const c = calc.rows[0];
      const total = c.commission + c.product_commission + c.tips - c.advances;
      const p = await sql<{ id: string }>(
        `INSERT INTO staff_payouts (tenant_id, staff_id, period_start, period_end, services_cents, commission_cents, product_commission_cents, tips_cents, advances_cents, total_cents, method, note, created_by)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [b.staffId, b.from, b.to, c.services, c.commission, c.product_commission, c.tips, c.advances, total, b.method, b.note ?? null, request.user.sub],
      );
      await sql('UPDATE staff_advances SET payout_id = $2 WHERE staff_id = $1 AND payout_id IS NULL', [b.staffId, p.rows[0].id]);
      // Si se paga con el efectivo de la caja, queda como salida de caja
      if (b.fromCash && b.method === 'cash' && total > 0) {
        const s = await sql<{ id: string }>("SELECT id FROM cash_sessions WHERE status = 'open' LIMIT 1");
        if (s.rows[0]) {
          const name = await sql<{ name: string }>('SELECT name FROM staff WHERE id = $1', [b.staffId]);
          await sql(`INSERT INTO cash_movements (tenant_id, session_id, kind, amount_cents, reason, created_by) VALUES (current_setting('app.tenant_id')::uuid, $1, 'out', $2, $3, $4)`, [
            s.rows[0].id,
            total,
            `Pago a ${name.rows[0]?.name ?? 'barbero'}`,
            request.user.sub,
          ]);
        }
      }
      return { payoutId: p.rows[0].id, total, ...c };
    });
    return reply.code(201).send(out);
  });

  app.get('/admin/payroll/advances', async (request) =>
    withTenant(tid(request), async (sql) => ({
      advances: (
        await sql(
          `SELECT a.id, a.staff_id, st.name, a.amount_cents, a.note, a.given_on::text, a.payout_id FROM staff_advances a JOIN staff st ON st.id = a.staff_id
            ORDER BY a.given_on DESC, a.created_at DESC LIMIT 100`,
        )
      ).rows,
    })),
  );
  app.post('/admin/payroll/advances', async (request, reply) => {
    const b = z.object({ staffId: z.string().uuid(), amountCents: z.number().int().min(1), note: z.string().max(120).optional(), fromCash: z.boolean().optional() }).parse(request.body);
    await withTenant(tid(request), async (sql) => {
      await sql(`INSERT INTO staff_advances (tenant_id, staff_id, amount_cents, note) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3)`, [b.staffId, b.amountCents, b.note ?? null]);
      if (b.fromCash) {
        const s = await sql<{ id: string }>("SELECT id FROM cash_sessions WHERE status = 'open' LIMIT 1");
        const name = await sql<{ name: string }>('SELECT name FROM staff WHERE id = $1', [b.staffId]);
        if (s.rows[0]) {
          await sql(`INSERT INTO cash_movements (tenant_id, session_id, kind, amount_cents, reason, created_by) VALUES (current_setting('app.tenant_id')::uuid, $1, 'out', $2, $3, $4)`, [
            s.rows[0].id,
            b.amountCents,
            `Adelanto a ${name.rows[0]?.name ?? 'barbero'}`,
            request.user.sub,
          ]);
        }
      }
    });
    return reply.code(201).send({ ok: true });
  });
  app.delete('/admin/payroll/advances/:id', async (request) => {
    await withTenant(tid(request), (sql) => sql('DELETE FROM staff_advances WHERE id = $1 AND payout_id IS NULL', [(request.params as { id: string }).id]));
    return { ok: true };
  });

  // ------------------------------ Exportación para el contador ------------------------------
  // CSV con separador ";" (Excel en español lo abre directo)
  app.get('/admin/export/:kind', async (request, reply) => {
    const kind = (request.params as { kind: string }).kind;
    const q = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(request.query);
    const rows = await withTenant(tid(request), async (sql) => {
      if (kind === 'ventas') {
        const r = await sql(
          `SELECT s.number, to_char(s.created_at AT TIME ZONE 'America/Lima', 'YYYY-MM-DD HH24:MI') AS fecha, s.status, c.name AS cliente, st.name AS barbero,
                  s.subtotal_cents, s.discount_cents, s.tip_cents, s.total_cents, s.receipt_number, s.receipt_url,
                  (SELECT string_agg(si.name || ' x' || si.qty, ' | ') FROM sale_items si WHERE si.sale_id = s.id) AS detalle,
                  (SELECT string_agg(sp.method || ' ' || (sp.amount_cents / 100.0)::numeric(10,2), ' | ') FROM sale_payments sp WHERE sp.sale_id = s.id) AS pagos
             FROM sales s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN staff st ON st.id = s.staff_id
            WHERE (s.created_at AT TIME ZONE 'America/Lima')::date BETWEEN $1 AND $2 ORDER BY s.created_at`,
          [q.from, q.to],
        );
        return [
          ['N', 'Fecha', 'Estado', 'Cliente', 'Barbero', 'Subtotal', 'Descuento', 'Propina', 'Total', 'N comprobante', 'Comprobante (archivo)', 'Detalle', 'Pagos'],
          ...r.rows.map((x: Record<string, unknown>) => [x.number, x.fecha, x.status === 'paid' ? 'Pagada' : 'Anulada', x.cliente, x.barbero, soles(x.subtotal_cents as number), soles(x.discount_cents as number), soles(x.tip_cents as number), soles(x.total_cents as number), x.receipt_number, x.receipt_url, x.detalle, x.pagos]),
        ];
      }
      if (kind === 'gastos') {
        const r = await sql(`SELECT spent_on::text, category, amount_cents, method, note, receipt_url FROM expenses WHERE spent_on BETWEEN $1 AND $2 ORDER BY spent_on`, [q.from, q.to]);
        return [['Fecha', 'Categoría', 'Monto', 'Medio', 'Nota', 'Comprobante (archivo)'], ...r.rows.map((x: Record<string, unknown>) => [x.spent_on, x.category, soles(x.amount_cents as number), x.method, x.note, x.receipt_url])];
      }
      if (kind === 'equipo') {
        const r = await sql(
          `SELECT st.name, p.period_start::text, p.period_end::text, p.services_cents, p.commission_cents, p.product_commission_cents, p.tips_cents, p.advances_cents, p.total_cents, p.method,
                  to_char(p.paid_at AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS pagado
             FROM staff_payouts p JOIN staff st ON st.id = p.staff_id WHERE p.paid_at::date BETWEEN $1 AND $2 ORDER BY p.paid_at`,
          [q.from, q.to],
        );
        return [
          ['Barbero', 'Desde', 'Hasta', 'Servicios', 'Comisión', 'Comisión productos', 'Propinas', 'Adelantos', 'Total pagado', 'Medio', 'Fecha de pago'],
          ...r.rows.map((x: Record<string, unknown>) => [x.name, x.period_start, x.period_end, soles(x.services_cents as number), soles(x.commission_cents as number), soles(x.product_commission_cents as number), soles(x.tips_cents as number), soles(x.advances_cents as number), soles(x.total_cents as number), x.method, x.pagado]),
        ];
      }
      return null;
    });
    if (!rows) return reply.code(404).send({ error: 'exportacion_no_existe' });
    const csv = '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\n');
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${kind}-${q.from}-a-${q.to}.csv"`)
      .send(csv);
  });
};
