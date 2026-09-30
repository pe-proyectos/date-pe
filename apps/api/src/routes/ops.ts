import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withTenant, admin } from '../db.js';
import { emitAvailabilityChange } from '../lib/realtime.js';
import { issueReceipt } from '../lib/sunat.js';
import { setCustomDomain, refreshDomain } from '../lib/domains.js';
import { env } from '../env.js';

function tid(request: FastifyRequest): string {
  if (!request.tenant) throw new Error('tenant_no_resuelto');
  return request.tenant.id;
}

// Operación del día a día: bloqueos, sedes, lista de espera, comprobantes y dominio.
export const opsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireTenant);

  // ------------------------- BLOQUEOS Y VACACIONES -------------------------
  app.get('/admin/time-off', async (request) => {
    const q = z.object({ from: z.string().optional(), to: z.string().optional() }).parse(request.query);
    return withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        `SELECT e.id, e.staff_id, s.name AS staff_name, e.starts_at, e.ends_at, e.reason
           FROM schedule_exceptions e JOIN staff s ON s.id = e.staff_id
          WHERE e.ends_at > COALESCE($1::timestamptz, now()) AND ($2::timestamptz IS NULL OR e.starts_at < $2)
          ORDER BY e.starts_at LIMIT 300`,
        [q.from ?? null, q.to ?? null],
      );
      return { timeOff: rows };
    });
  });

  const timeOffBody = z.object({
    staffIds: z.array(z.string().uuid()).min(1),
    startsAt: z.string(),
    endsAt: z.string(),
    reason: z.string().max(120).optional(),
  });
  app.post('/admin/time-off', async (request, reply) => {
    const b = timeOffBody.parse(request.body);
    if (new Date(b.endsAt) <= new Date(b.startsAt)) return reply.code(400).send({ error: 'rango_invalido' });
    const out = await withTenant(tid(request), async (sql) => {
      for (const staffId of b.staffIds) {
        await sql(
          `INSERT INTO schedule_exceptions (tenant_id, staff_id, starts_at, ends_at, reason)
           VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4)`,
          [staffId, b.startsAt, b.endsAt, b.reason ?? null],
        );
      }
      // Citas ya agendadas dentro del bloqueo: el dueño decide qué hacer con ellas
      const { rows } = await sql(
        `SELECT a.id, a.starts_at, c.name AS client_name, s.name AS staff_name
           FROM appointments a LEFT JOIN clients c ON c.id = a.client_id LEFT JOIN staff s ON s.id = a.staff_id
          WHERE a.staff_id = ANY($1) AND a.status IN ('pending','confirmed') AND a.starts_at < $3 AND a.ends_at > $2
          ORDER BY a.starts_at`,
        [b.staffIds, b.startsAt, b.endsAt],
      );
      return { conflicts: rows };
    });
    await emitAvailabilityChange(tid(request));
    return reply.code(201).send({ ok: true, ...out });
  });

  app.delete('/admin/time-off/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    await withTenant(tid(request), (sql) => sql('DELETE FROM schedule_exceptions WHERE id = $1', [id]));
    await emitAvailabilityChange(tid(request));
    return { ok: true };
  });

  // --------------------------------- SEDES ---------------------------------
  app.get('/admin/locations', async (request) =>
    withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        `SELECT l.id, l.name, l.address, l.district, l.province, l.phone, l.is_active, l.lat, l.lng,
                (SELECT count(*) FROM staff s WHERE s.location_id = l.id)::int AS barberos
           FROM locations l ORDER BY l.created_at`,
      );
      return { locations: rows };
    }),
  );

  const locationBody = z.object({
    name: z.string().min(1).max(80),
    address: z.string().max(200).nullable().optional(),
    district: z.string().max(60).nullable().optional(),
    province: z.string().max(60).nullable().optional(),
    phone: z.string().max(30).nullable().optional(),
    isActive: z.boolean().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
  });

  // district_id enlaza la sede con la página SEO del distrito y con el buscador
  async function districtId(district?: string | null) {
    if (!district) return null;
    const r = await admin<{ id: number }>('SELECT id FROM geo_districts WHERE lower(district) = lower($1) LIMIT 1', [district]);
    return r.rows[0]?.id ?? null;
  }

  /**
   * Al pasar a tener varias sedes, lo que no tenía sede (fila, citas, ventas, caja,
   * gastos) queda en la sede original para que cada sede vea solo lo suyo.
   */
  async function adoptOrphans(sql: import('../db.js').Sql) {
    const locs = await sql<{ id: string }>('SELECT id FROM locations WHERE is_active ORDER BY created_at');
    if (locs.rows.length < 2) return;
    const first = locs.rows[0].id;
    for (const t of ['queue_tickets', 'appointments', 'sales', 'cash_sessions', 'expenses']) {
      await sql(`UPDATE ${t} SET location_id = $1 WHERE location_id IS NULL`, [first]);
    }
  }

  app.post('/admin/locations', async (request, reply) => {
    const b = locationBody.parse(request.body);
    const did = await districtId(b.district);
    const out = await withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        `INSERT INTO locations (tenant_id, name, address, district, province, phone, is_active, district_id, lat, lng)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [b.name, b.address ?? null, b.district ?? null, b.province ?? 'Lima', b.phone ?? null, b.isActive ?? true, did, b.lat ?? null, b.lng ?? null],
      );
      await adoptOrphans(sql);
      return rows[0];
    });
    return reply.code(201).send(out);
  });

  app.patch('/admin/locations/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = locationBody.partial().parse(request.body);
    const did = b.district !== undefined ? await districtId(b.district) : undefined;
    await withTenant(tid(request), async (sql) => {
      await sql(
        `UPDATE locations SET
           name = COALESCE($2, name),
           address = CASE WHEN $12 THEN $3 ELSE address END,
           district = CASE WHEN $8 THEN $4 ELSE district END,
           province = COALESCE($5, province),
           phone = CASE WHEN $13 THEN $6 ELSE phone END,
           is_active = COALESCE($7, is_active),
           district_id = CASE WHEN $8 THEN $9::int ELSE district_id END,
           lat = COALESCE($10, lat), lng = COALESCE($11, lng)
         WHERE id = $1`,
        [id, b.name ?? null, b.address ?? null, b.district ?? null, b.province ?? null, b.phone ?? null, b.isActive ?? null, did !== undefined, did ?? null, b.lat ?? null, b.lng ?? null, b.address !== undefined, b.phone !== undefined],
      );
      if (b.isActive) await adoptOrphans(sql);
    });
    await emitAvailabilityChange(tid(request));
    return { ok: true };
  });

  app.delete('/admin/locations/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const out = await withTenant(tid(request), async (sql) => {
      const n = await sql<{ n: number }>('SELECT count(*)::int AS n FROM locations');
      if ((n.rows[0]?.n ?? 0) <= 1) return { error: 'ultima_sede' };
      await sql('DELETE FROM locations WHERE id = $1', [id]);
      return { ok: true };
    });
    if ('error' in out) return reply.code(409).send(out);
    await emitAvailabilityChange(tid(request));
    return out;
  });

  // ----------------------------- LISTA DE ESPERA -----------------------------
  app.get('/admin/waitlist', async (request) =>
    withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        `SELECT w.id, w.day::text AS day, w.name, w.phone, w.email, w.notified_at, w.booked, w.created_at,
                sv.name AS service_name, s.name AS staff_name
           FROM waitlist w LEFT JOIN services sv ON sv.id = w.service_id LEFT JOIN staff s ON s.id = w.staff_id
          WHERE w.day >= (now() AT TIME ZONE 'America/Lima')::date
          ORDER BY w.day, w.created_at`,
      );
      return { waitlist: rows };
    }),
  );
  app.delete('/admin/waitlist/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    await withTenant(tid(request), (sql) => sql('DELETE FROM waitlist WHERE id = $1', [id]));
    return { ok: true };
  });

  // ------------------------------ COMPROBANTES ------------------------------
  const receiptBody = z.object({
    kind: z.enum(['boleta', 'factura']).default('boleta'),
    docType: z.enum(['1', '6', '-']).default('-'),
    doc: z.string().max(15).optional(),
    name: z.string().max(200).optional(),
    address: z.string().max(300).optional(),
    email: z.string().email().optional(),
  });
  app.post('/admin/appointments/:id/receipt', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const b = receiptBody.parse(request.body);
    const out = await withTenant(tid(request), (sql) => issueReceipt(sql, { appointmentId: id, ...b }));
    if (!out.ok) return reply.code(400).send({ error: out.error });
    return reply.code(201).send(out);
  });

  app.get('/admin/receipts', async (request) =>
    withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        `SELECT r.id, r.kind, r.serie, r.numero, r.customer_name, r.customer_doc, r.total_cents, r.status, r.pdf_url, r.sunat_message, r.created_at,
                a.starts_at
           FROM receipts r LEFT JOIN appointments a ON a.id = r.appointment_id
          WHERE r.numero > 0 ORDER BY r.created_at DESC LIMIT 200`,
      );
      return { receipts: rows };
    }),
  );

  // ------------------------------ DOMINIO PROPIO ------------------------------
  app.get('/admin/domain', async (request) => {
    const r = await refreshDomain(tid(request));
    return { ...r, serverIp: env.serverIp };
  });
  app.put('/admin/domain', async (request, reply) => {
    const b = z.object({ domain: z.string().max(253).nullable() }).parse(request.body);
    const r = await setCustomDomain(tid(request), b.domain);
    if (!r.ok) return reply.code(400).send({ error: r.error });
    return { ...r, serverIp: env.serverIp };
  });
};
