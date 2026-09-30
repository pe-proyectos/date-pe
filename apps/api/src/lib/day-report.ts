import { withTenant } from '../db.js';

// Cierre del día en una sola consulta lógica: lo que entró por cada medio, lo que
// hizo y se lleva cada barbero, la caja, las citas, la fila y lo que quedó sin cobrar.
export const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  deposit: 'Adelantos en línea',
  gift_card: 'Gift cards',
  package: 'Paquetes',
  points: 'Puntos',
};

export interface DayReport {
  date: string;
  totals: { ventas: number; total_cents: number; tips_cents: number; discount_cents: number; ticket_promedio_cents: number; servicios_cents: number; productos_cents: number };
  byMethod: Array<{ method: string; cents: number; ventas: number }>;
  byStaff: Array<{ staff_id: string; name: string; clientes: number; servicios_cents: number; productos_cents: number; comision_cents: number; tips_cents: number; a_entregar_cents: number }>;
  cash: { sessions: number; opening_cents: number; cash_sales_cents: number; ins_cents: number; outs_cents: number; expected_cents: number; counted_cents: number | null; difference_cents: number | null; open: boolean };
  appointments: { total: number; completed: number; no_show: number; cancelled: number; pending: number };
  queue: { atendidos: number; no_vinieron: number; espera_promedio_min: number; max_en_fila: number };
  expenses_cents: number;
  topServices: Array<{ name: string; n: number; cents: number }>;
  uncharged: Array<{ kind: 'ticket' | 'appointment'; id: string; name: string | null; staff: string | null; at: string }>;
  /** Solo con varias sedes y sin sede elegida: cómo le fue a cada una */
  byLocation: Array<{ location_id: string; name: string; ventas: number; total_cents: number; tips_cents: number; cash_open: boolean; atendidos_fila: number; citas_completadas: number }>;
}

export async function dayReport(tenantId: string, day: string, loc: string | null = null): Promise<DayReport> {
  return withTenant(tenantId, async (sql) => {
    // $1 = día, $2 = sede (null = todas)
    const onDay = `(s.created_at AT TIME ZONE 'America/Lima')::date = $1::date AND ($2::uuid IS NULL OR s.location_id = $2)`;
    const P = [day, loc];
    const [totals, byMethod, byStaff, cash, appts, queue, expenses, top, unchargedT, unchargedA] = await Promise.all([
      sql(
        `SELECT count(*)::int AS ventas, COALESCE(sum(total_cents), 0)::int AS total_cents, COALESCE(sum(tip_cents), 0)::int AS tips_cents,
                COALESCE(sum(discount_cents), 0)::int AS discount_cents, COALESCE(round(avg(total_cents - tip_cents)), 0)::int AS ticket_promedio_cents,
                COALESCE((SELECT sum(si.total_cents) FROM sale_items si JOIN sales s2 ON s2.id = si.sale_id WHERE si.kind = 'service' AND s2.status = 'paid' AND (s2.created_at AT TIME ZONE 'America/Lima')::date = $1::date AND ($2::uuid IS NULL OR s2.location_id = $2)), 0)::int AS servicios_cents,
                COALESCE((SELECT sum(si.total_cents) FROM sale_items si JOIN sales s2 ON s2.id = si.sale_id WHERE si.kind = 'product' AND s2.status = 'paid' AND (s2.created_at AT TIME ZONE 'America/Lima')::date = $1::date AND ($2::uuid IS NULL OR s2.location_id = $2)), 0)::int AS productos_cents
           FROM sales s WHERE s.status = 'paid' AND ${onDay}`,
        P,
      ),
      sql(
        `SELECT sp.method, COALESCE(sum(sp.amount_cents), 0)::int AS cents, count(DISTINCT s.id)::int AS ventas
           FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id WHERE s.status = 'paid' AND ${onDay}
          GROUP BY sp.method ORDER BY cents DESC`,
        P,
      ),
      sql(
        `SELECT st.id AS staff_id, st.name,
                COALESCE(agg.clientes, 0)::int AS clientes, COALESCE(agg.servicios, 0)::int AS servicios_cents,
                COALESCE(agg.productos, 0)::int AS productos_cents, COALESCE(agg.comision, 0)::int AS comision_cents,
                (SELECT COALESCE(sum(s2.tip_cents), 0) FROM sales s2 WHERE s2.staff_id = st.id AND s2.status = 'paid' AND (s2.created_at AT TIME ZONE 'America/Lima')::date = $1::date AND ($2::uuid IS NULL OR s2.location_id = $2))::int AS tips_cents
           FROM staff st
           LEFT JOIN LATERAL (
             SELECT count(DISTINCT s.id) FILTER (WHERE si.kind = 'service') AS clientes,
                    sum(si.total_cents) FILTER (WHERE si.kind = 'service') AS servicios,
                    sum(si.total_cents) FILTER (WHERE si.kind = 'product') AS productos,
                    sum(si.commission_cents) AS comision
               FROM sale_items si JOIN sales s ON s.id = si.sale_id
              WHERE si.staff_id = st.id AND s.status = 'paid' AND ${onDay}
           ) agg ON true
          ORDER BY servicios_cents DESC, st.name`,
        P,
      ),
      sql(
        `SELECT count(*)::int AS sessions, COALESCE(sum(cs.opening_cents), 0)::int AS opening_cents,
                COALESCE(sum((SELECT sum(sp.amount_cents) FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id WHERE s.session_id = cs.id AND s.status = 'paid' AND sp.method = 'cash')), 0)::int AS cash_sales_cents,
                COALESCE(sum((SELECT sum(amount_cents) FROM cash_movements m WHERE m.session_id = cs.id AND m.kind = 'in')), 0)::int AS ins_cents,
                COALESCE(sum((SELECT sum(amount_cents) FROM cash_movements m WHERE m.session_id = cs.id AND m.kind = 'out')), 0)::int
                  + COALESCE(sum((SELECT sum(amount_cents) FROM expenses e WHERE e.session_id = cs.id AND e.method = 'cash')), 0)::int AS outs_cents,
                sum(cs.counted_cents)::int AS counted_cents, sum(cs.difference_cents)::int AS difference_cents,
                bool_or(cs.status = 'open') AS open
           FROM cash_sessions cs WHERE (cs.opened_at AT TIME ZONE 'America/Lima')::date = $1::date AND ($2::uuid IS NULL OR cs.location_id = $2)`,
        P,
      ),
      sql(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'completed')::int AS completed, count(*) FILTER (WHERE status = 'no_show')::int AS no_show,
                count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled, count(*) FILTER (WHERE status IN ('pending','confirmed'))::int AS pending
           FROM appointments WHERE (starts_at AT TIME ZONE 'America/Lima')::date = $1::date AND ($2::uuid IS NULL OR location_id = $2)`,
        P,
      ),
      sql(
        `SELECT count(*) FILTER (WHERE status = 'done')::int AS atendidos, count(*) FILTER (WHERE status = 'no_show')::int AS no_vinieron,
                COALESCE(round(avg(EXTRACT(EPOCH FROM COALESCE(started_at, called_at) - created_at) / 60) FILTER (WHERE COALESCE(started_at, called_at) IS NOT NULL)), 0)::int AS espera_promedio_min,
                count(*)::int AS max_en_fila
           FROM queue_tickets WHERE day = $1::date AND ($2::uuid IS NULL OR location_id = $2)`,
        P,
      ),
      sql('SELECT COALESCE(sum(amount_cents), 0)::int AS c FROM expenses WHERE spent_on = $1::date AND ($2::uuid IS NULL OR location_id = $2)', P),
      sql(
        `SELECT si.name, count(*)::int AS n, COALESCE(sum(si.total_cents), 0)::int AS cents FROM sale_items si JOIN sales s ON s.id = si.sale_id
          WHERE si.kind = 'service' AND s.status = 'paid' AND ${onDay} GROUP BY si.name ORDER BY n DESC LIMIT 5`,
        P,
      ),
      sql(
        `SELECT q.id, q.name, st.name AS staff, q.finished_at AS at FROM queue_tickets q LEFT JOIN staff st ON st.id = q.served_by
          WHERE q.day = $1::date AND q.status = 'done' AND q.sale_id IS NULL AND ($2::uuid IS NULL OR q.location_id = $2) ORDER BY q.finished_at`,
        P,
      ),
      sql(
        `SELECT a.id, c.name, st.name AS staff, a.starts_at AS at FROM appointments a LEFT JOIN clients c ON c.id = a.client_id LEFT JOIN staff st ON st.id = a.staff_id
          WHERE (a.starts_at AT TIME ZONE 'America/Lima')::date = $1::date AND a.status = 'completed' AND ($2::uuid IS NULL OR a.location_id = $2)
            AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.appointment_id = a.id AND s.status = 'paid') ORDER BY a.starts_at`,
        P,
      ),
    ]);
    // Con varias sedes y vista "todas": una fila por sede
    const byLocation = loc
      ? []
      : ((
          await sql(
            `SELECT l.id AS location_id, l.name,
                    count(s.id) FILTER (WHERE s.status = 'paid')::int AS ventas,
                    COALESCE(sum(s.total_cents) FILTER (WHERE s.status = 'paid'), 0)::int AS total_cents,
                    COALESCE(sum(s.tip_cents) FILTER (WHERE s.status = 'paid'), 0)::int AS tips_cents,
                    EXISTS (SELECT 1 FROM cash_sessions cs WHERE cs.location_id = l.id AND cs.status = 'open') AS cash_open,
                    (SELECT count(*) FROM queue_tickets q WHERE q.location_id = l.id AND q.day = $1::date AND q.status = 'done')::int AS atendidos_fila,
                    (SELECT count(*) FROM appointments a WHERE a.location_id = l.id AND (a.starts_at AT TIME ZONE 'America/Lima')::date = $1::date AND a.status = 'completed')::int AS citas_completadas
               FROM locations l LEFT JOIN sales s ON s.location_id = l.id AND (s.created_at AT TIME ZONE 'America/Lima')::date = $1::date
              WHERE l.is_active
              GROUP BY l.id, l.name, l.created_at ORDER BY l.created_at`,
            [day],
          )
        ).rows as DayReport['byLocation']);
    const c = cash.rows[0] as DayReport['cash'] & { open: boolean | null };
    return {
      date: day,
      byLocation: byLocation.length > 1 ? byLocation : [],
      totals: totals.rows[0] as DayReport['totals'],
      byMethod: byMethod.rows as DayReport['byMethod'],
      byStaff: (byStaff.rows as Array<Omit<DayReport['byStaff'][number], 'a_entregar_cents'>>).map((r) => ({ ...r, a_entregar_cents: r.comision_cents + r.tips_cents })),
      cash: { ...c, open: !!c.open, expected_cents: c.opening_cents + c.cash_sales_cents + c.ins_cents - c.outs_cents },
      appointments: appts.rows[0] as DayReport['appointments'],
      queue: queue.rows[0] as DayReport['queue'],
      expenses_cents: expenses.rows[0].c,
      topServices: top.rows as DayReport['topServices'],
      uncharged: [
        ...(unchargedT.rows as Array<{ id: string; name: string | null; staff: string | null; at: Date }>).map((r) => ({ kind: 'ticket' as const, id: r.id, name: r.name, staff: r.staff, at: new Date(r.at).toISOString() })),
        ...(unchargedA.rows as Array<{ id: string; name: string | null; staff: string | null; at: Date }>).map((r) => ({ kind: 'appointment' as const, id: r.id, name: r.name, staff: r.staff, at: new Date(r.at).toISOString() })),
      ],
    };
  });
}
