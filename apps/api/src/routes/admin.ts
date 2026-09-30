import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db.js';
import { emitAvailabilityChange } from '../lib/realtime.js';

function tid(request: FastifyRequest): string {
  if (!request.tenant) throw new Error('tenant_no_resuelto');
  return request.tenant.id;
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  // Todas las rutas de este plugin exigen sesión + pertenencia al tenant.
  app.addHook('preHandler', app.requireTenant);

  // ----------------------------- STAFF -----------------------------
  app.get('/admin/staff', async (request) =>
    withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        'SELECT id, location_id, name, photo_url, bio, specialties, is_bookable, rating_avg, rating_count, sort_order FROM staff ORDER BY sort_order, name',
      );
      return { staff: rows };
    }),
  );

  const staffBody = z.object({
    name: z.string().min(1),
    locationId: z.string().uuid().nullable().optional(),
    photoUrl: z.string().max(500).nullable().optional(),
    bio: z.string().nullable().optional(),
    specialties: z.array(z.string()).optional(),
    isBookable: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  });

  app.post('/admin/staff', async (request, reply) => {
    const b = staffBody.parse(request.body);
    const out = await withTenant(tid(request), async (sql) => {
      const { rows } = await sql<{ id: string }>(
        `INSERT INTO staff (tenant_id, location_id, name, photo_url, bio, specialties, is_bookable, sort_order)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [b.locationId ?? null, b.name, b.photoUrl ?? null, b.bio ?? null, b.specialties ?? [], b.isBookable ?? true, b.sortOrder ?? 0],
      );
      return rows[0];
    });
    await emitAvailabilityChange(tid(request));
    return reply.code(201).send(out);
  });

  app.patch('/admin/staff/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = staffBody.partial().parse(request.body);
    const out = await withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        `UPDATE staff SET
           name = COALESCE($2, name),
           location_id = COALESCE($3, location_id),
           photo_url = COALESCE($4, photo_url),
           bio = COALESCE($5, bio),
           specialties = COALESCE($6, specialties),
           is_bookable = COALESCE($7, is_bookable),
           sort_order = COALESCE($8, sort_order)
         WHERE id = $1 RETURNING id, name, is_bookable`,
        [id, b.name ?? null, b.locationId ?? null, b.photoUrl ?? null, b.bio ?? null, b.specialties ?? null, b.isBookable ?? null, b.sortOrder ?? null],
      );
      return rows[0];
    });
    await emitAvailabilityChange(tid(request));
    return out;
  });

  app.delete('/admin/staff/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    await withTenant(tid(request), async (sql) => {
      await sql('DELETE FROM staff WHERE id = $1', [id]);
    });
    await emitAvailabilityChange(tid(request));
    return { ok: true };
  });

  // --------------------------- HORARIOS ----------------------------
  app.get('/admin/staff/:id/schedules', async (request) => {
    const id = (request.params as { id: string }).id;
    return withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        'SELECT id, location_id, day_of_week, start_time, end_time FROM staff_schedules WHERE staff_id = $1 ORDER BY day_of_week, start_time',
        [id],
      );
      return { schedules: rows };
    });
  });

  const scheduleReplace = z.object({
    schedules: z.array(
      z.object({
        locationId: z.string().uuid().nullable().optional(),
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    ),
  });

  // Reemplaza el set de turnos de un barbero (usado por el editor de horario)
  app.put('/admin/staff/:id/schedules', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = scheduleReplace.parse(request.body);
    await withTenant(tid(request), async (sql) => {
      await sql('DELETE FROM staff_schedules WHERE staff_id = $1', [id]);
      for (const s of b.schedules) {
        await sql(
          `INSERT INTO staff_schedules (tenant_id, staff_id, location_id, day_of_week, start_time, end_time)
           VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5)`,
          [id, s.locationId ?? null, s.dayOfWeek, s.startTime, s.endTime],
        );
      }
    });
    await emitAvailabilityChange(tid(request));
    return { ok: true };
  });

  // --------------------------- SERVICIOS ---------------------------
  app.get('/admin/services', async (request) =>
    withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        'SELECT id, category, name, description, photo_url, duration_min, buffer_min, price_cents, is_active, sort_order FROM services ORDER BY sort_order, name',
      );
      return { services: rows };
    }),
  );

  const serviceBody = z.object({
    name: z.string().min(1),
    category: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    photoUrl: z.string().max(500).nullable().optional(),
    durationMin: z.number().int().min(5),
    bufferMin: z.number().int().min(0).optional(),
    priceCents: z.number().int().min(0),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  });

  app.post('/admin/services', async (request, reply) => {
    const b = serviceBody.parse(request.body);
    const out = await withTenant(tid(request), async (sql) => {
      const { rows } = await sql<{ id: string }>(
        `INSERT INTO services (tenant_id, category, name, description, photo_url, duration_min, buffer_min, price_cents, is_active, sort_order)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [b.category ?? null, b.name, b.description ?? null, b.photoUrl ?? null, b.durationMin, b.bufferMin ?? 0, b.priceCents, b.isActive ?? true, b.sortOrder ?? 0],
      );
      return rows[0];
    });
    return reply.code(201).send(out);
  });

  app.patch('/admin/services/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = serviceBody.partial().parse(request.body);
    return withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        `UPDATE services SET
           name = COALESCE($2, name), category = COALESCE($3, category),
           description = COALESCE($4, description), photo_url = COALESCE($5, photo_url),
           duration_min = COALESCE($6, duration_min), buffer_min = COALESCE($7, buffer_min),
           price_cents = COALESCE($8, price_cents), is_active = COALESCE($9, is_active),
           sort_order = COALESCE($10, sort_order)
         WHERE id = $1 RETURNING id`,
        [id, b.name ?? null, b.category ?? null, b.description ?? null, b.photoUrl ?? null, b.durationMin ?? null, b.bufferMin ?? null, b.priceCents ?? null, b.isActive ?? null, b.sortOrder ?? null],
      );
      return rows[0] ?? { error: 'no_encontrado' };
    });
  });

  app.delete('/admin/services/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    await withTenant(tid(request), async (sql) => {
      await sql('DELETE FROM services WHERE id = $1', [id]);
    });
    return { ok: true };
  });

  // --------------------------- AGENDA ------------------------------
  // Citas en un rango (para el calendario)
  const rangeQuery = z.object({ from: z.string(), to: z.string(), locationId: z.string().uuid().optional() });
  app.get('/admin/appointments', async (request) => {
    const q = rangeQuery.parse(request.query);
    return withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        `SELECT a.id, a.staff_id, a.location_id, a.starts_at, a.ends_at, a.status, a.price_cents, a.source, a.note,
                c.name AS client_name, c.phone AS client_phone,
                (SELECT sv.name FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id
                  WHERE aps.appointment_id = a.id LIMIT 1) AS service_name
           FROM appointments a
           LEFT JOIN clients c ON c.id = a.client_id
          WHERE a.starts_at < $2 AND a.ends_at > $1
            AND ($3::uuid IS NULL OR a.location_id = $3)
          ORDER BY a.starts_at`,
        [q.from, q.to, q.locationId ?? null],
      );
      return { appointments: rows };
    });
  });

  // Mover/redimensionar (drag & drop) o cambiar estado/barbero
  const updateAppt = z.object({
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    staffId: z.string().uuid().optional(),
    status: z.enum(['pending', 'confirmed', 'completed', 'no_show', 'cancelled']).optional(),
  });
  app.patch('/admin/appointments/:id', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const b = updateAppt.parse(request.body);
    const out = await withTenant(tid(request), async (sql) => {
      // valida solape si se cambia horario/barbero
      if (b.startsAt || b.endsAt || b.staffId) {
        const cur = await sql<{ staff_id: string; starts_at: string; ends_at: string }>(
          'SELECT staff_id, starts_at, ends_at FROM appointments WHERE id = $1',
          [id],
        );
        if (cur.rows.length === 0) return { error: 'no_encontrado' as const };
        const staffId = b.staffId ?? cur.rows[0].staff_id;
        const startsAt = b.startsAt ?? cur.rows[0].starts_at;
        const endsAt = b.endsAt ?? cur.rows[0].ends_at;
        const clash = await sql(
          `SELECT 1 FROM appointments WHERE id <> $1 AND staff_id = $2 AND status <> 'cancelled'
             AND starts_at < $4 AND ends_at > $3 LIMIT 1`,
          [id, staffId, startsAt, endsAt],
        );
        if (clash.rows.length > 0) return { error: 'slot_ocupado' as const };
      }
      const { rows } = await sql<{ location_id: string | null }>(
        `UPDATE appointments SET
           starts_at = COALESCE($2, starts_at), ends_at = COALESCE($3, ends_at),
           staff_id = COALESCE($4, staff_id), status = COALESCE($5, status)
         WHERE id = $1 RETURNING location_id`,
        [id, b.startsAt ?? null, b.endsAt ?? null, b.staffId ?? null, b.status ?? null],
      );
      // Lealtad: puntos al completar la visita (una sola vez por cita)
      if (b.status === 'completed') {
        await sql(
          `UPDATE clients c SET loyalty_points = c.loyalty_points + COALESCE((SELECT loyalty_points_per_visit FROM tenant_settings LIMIT 1), 10)
             FROM appointments a WHERE a.id = $1 AND a.client_id = c.id AND a.points_awarded = false`,
          [id],
        );
        await sql('UPDATE appointments SET points_awarded = true WHERE id = $1', [id]);
      }
      return { location_id: rows[0]?.location_id ?? null };
    });
    if ('error' in out) return reply.code(out.error === 'no_encontrado' ? 404 : 409).send({ error: out.error });
    await emitAvailabilityChange(tid(request), out.location_id);
    return { ok: true };
  });

  // Walk-in / bloqueo manual
  const walkIn = z.object({
    staffId: z.string().uuid(),
    locationId: z.string().uuid().optional(),
    startsAt: z.string(),
    endsAt: z.string(),
    clientName: z.string().optional(),
    status: z.enum(['confirmed', 'completed']).optional(),
  });
  app.post('/admin/appointments', async (request, reply) => {
    const b = walkIn.parse(request.body);
    const out = await withTenant(tid(request), async (sql) => {
      const { rows } = await sql<{ id: string }>(
        `INSERT INTO appointments (tenant_id, location_id, staff_id, starts_at, ends_at, status, source, note)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, 'walk_in', $6) RETURNING id`,
        [b.locationId ?? null, b.staffId, b.startsAt, b.endsAt, b.status ?? 'confirmed', b.clientName ?? null],
      );
      return rows[0];
    });
    await emitAvailabilityChange(tid(request), b.locationId ?? null);
    return reply.code(201).send(out);
  });

  // --------------------------- BRANDING ----------------------------
  app.get('/admin/branding', async (request) =>
    withTenant(tid(request), async (sql) => {
      const { rows } = await sql('SELECT * FROM tenant_branding');
      return rows[0] ?? null;
    }),
  );

  const brandingBody = z.object({
    logoUrl: z.string().max(500).nullable().optional(),
    coverUrl: z.string().max(500).nullable().optional(),
    colorPrimary: z.string().optional(),
    colorSecondary: z.string().optional(),
    tagline: z.string().nullable().optional(),
    about: z.string().nullable().optional(),
    instagram: z.string().nullable().optional(),
    whatsapp: z.string().nullable().optional(),
  });
  app.put('/admin/branding', async (request) => {
    const b = brandingBody.parse(request.body);
    return withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        `INSERT INTO tenant_branding (tenant_id, logo_url, cover_url, color_primary, color_secondary, tagline, about, instagram, whatsapp)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, COALESCE($3,'#111111'), COALESCE($4,'#f5f5f5'), $5, $6, $7, $8)
         ON CONFLICT (tenant_id) DO UPDATE SET
           logo_url = COALESCE(EXCLUDED.logo_url, tenant_branding.logo_url),
           cover_url = COALESCE(EXCLUDED.cover_url, tenant_branding.cover_url),
           color_primary = EXCLUDED.color_primary, color_secondary = EXCLUDED.color_secondary,
           tagline = EXCLUDED.tagline, about = EXCLUDED.about,
           instagram = EXCLUDED.instagram, whatsapp = EXCLUDED.whatsapp,
           updated_at = now()
         RETURNING *`,
        [b.logoUrl ?? null, b.coverUrl ?? null, b.colorPrimary ?? null, b.colorSecondary ?? null, b.tagline ?? null, b.about ?? null, b.instagram ?? null, b.whatsapp ?? null],
      );
      return rows[0];
    });
  });

  // --------------------------- REPORTES ----------------------------
  app.get('/admin/reports/summary', async (request) => {
    const q = z.object({ from: z.string(), to: z.string() }).parse(request.query);
    return withTenant(tid(request), async (sql) => {
      const totals = await sql(
        `SELECT
           count(*) FILTER (WHERE status IN ('confirmed','completed')) AS citas,
           count(*) FILTER (WHERE status = 'no_show') AS no_shows,
           COALESCE(sum(price_cents) FILTER (WHERE status = 'completed'),0) AS ingresos_cents
         FROM appointments WHERE starts_at >= $1 AND starts_at < $2`,
        [q.from, q.to],
      );
      const byStaff = await sql(
        `SELECT s.name, count(a.*) AS citas,
                COALESCE(sum(a.price_cents) FILTER (WHERE a.status='completed'),0) AS ingresos_cents
           FROM staff s LEFT JOIN appointments a
             ON a.staff_id = s.id AND a.starts_at >= $1 AND a.starts_at < $2
          GROUP BY s.id, s.name ORDER BY citas DESC`,
        [q.from, q.to],
      );
      return { totals: totals.rows[0], byStaff: byStaff.rows };
    });
  });
};
