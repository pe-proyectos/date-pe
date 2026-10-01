import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db.js';
import { emitAvailabilityChange } from '../lib/realtime.js';
import { processWaitlist } from '../lib/notify.js';

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
        'SELECT id, location_id, name, photo_url, bio, specialties, is_bookable, rating_avg, rating_count, sort_order, commission_percent FROM staff ORDER BY sort_order, name',
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
    commissionPercent: z.number().int().min(0).max(100).optional(),
  });

  app.post('/admin/staff', async (request, reply) => {
    const b = staffBody.parse(request.body);
    const out = await withTenant(tid(request), async (sql) => {
      const { rows } = await sql<{ id: string }>(
        `INSERT INTO staff (tenant_id, location_id, name, photo_url, bio, specialties, is_bookable, sort_order, commission_percent)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [b.locationId ?? null, b.name, b.photoUrl ?? null, b.bio ?? null, b.specialties ?? [], b.isBookable ?? true, b.sortOrder ?? 0, b.commissionPercent ?? 0],
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
           location_id = CASE WHEN $10 THEN $3::uuid ELSE location_id END,
           photo_url = COALESCE($4, photo_url),
           bio = COALESCE($5, bio),
           specialties = COALESCE($6, specialties),
           is_bookable = COALESCE($7, is_bookable),
           sort_order = COALESCE($8, sort_order),
           commission_percent = COALESCE($9, commission_percent)
         WHERE id = $1 RETURNING id, name, is_bookable`,
        [id, b.name ?? null, b.locationId ?? null, b.photoUrl ?? null, b.bio ?? null, b.specialties ?? null, b.isBookable ?? null, b.sortOrder ?? null, b.commissionPercent ?? null, b.locationId !== undefined],
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
        'SELECT id, category, name, description, photo_url, duration_min, buffer_min, price_cents, is_active, sort_order, is_addon FROM services ORDER BY is_addon, sort_order, name',
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
    isAddon: z.boolean().optional(),
  });

  app.post('/admin/services', async (request, reply) => {
    const b = serviceBody.parse(request.body);
    const out = await withTenant(tid(request), async (sql) => {
      const { rows } = await sql<{ id: string }>(
        `INSERT INTO services (tenant_id, category, name, description, photo_url, duration_min, buffer_min, price_cents, is_active, sort_order, is_addon)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [b.category ?? null, b.name, b.description ?? null, b.photoUrl ?? null, b.durationMin, b.bufferMin ?? 0, b.priceCents, b.isActive ?? true, b.sortOrder ?? 0, b.isAddon ?? false],
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
           sort_order = COALESCE($10, sort_order), is_addon = COALESCE($11, is_addon)
         WHERE id = $1 RETURNING id`,
        [id, b.name ?? null, b.category ?? null, b.description ?? null, b.photoUrl ?? null, b.durationMin ?? null, b.bufferMin ?? null, b.priceCents ?? null, b.isActive ?? null, b.sortOrder ?? null, b.isAddon ?? null],
      );
      return rows[0] ?? { error: 'no_encontrado' };
    });
  });

  // Precio y duración por barbero (el maestro cobra distinto que el aprendiz)
  app.get('/admin/services/:id/staff', async (request) => {
    const id = (request.params as { id: string }).id;
    return withTenant(tid(request), async (sql) => ({
      overrides: (
        await sql(
          `SELECT st.id AS staff_id, st.name, ss.price_cents, ss.duration_min, (ss.staff_id IS NOT NULL) AS custom
             FROM staff st LEFT JOIN service_staff ss ON ss.staff_id = st.id AND ss.service_id = $1 ORDER BY st.sort_order, st.name`,
          [id],
        )
      ).rows,
    }));
  });
  app.put('/admin/services/:id/staff', async (request) => {
    const id = (request.params as { id: string }).id;
    const b = z.object({ overrides: z.array(z.object({ staffId: z.string().uuid(), priceCents: z.number().int().min(0).nullable(), durationMin: z.number().int().min(5).max(480).nullable() })) }).parse(request.body);
    await withTenant(tid(request), async (sql) => {
      for (const o of b.overrides) {
        if (o.priceCents === null && o.durationMin === null) {
          await sql('DELETE FROM service_staff WHERE service_id = $1 AND staff_id = $2', [id, o.staffId]);
        } else {
          await sql(
            `INSERT INTO service_staff (tenant_id, service_id, staff_id, price_cents, duration_min) VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4)
             ON CONFLICT (service_id, staff_id) DO UPDATE SET price_cents = EXCLUDED.price_cents, duration_min = EXCLUDED.duration_min`,
            [id, o.staffId, o.priceCents, o.durationMin],
          );
        }
      }
    });
    await emitAvailabilityChange(tid(request));
    return { ok: true };
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
                c.name AS client_name, c.phone AS client_phone, c.email AS client_email,
                (SELECT string_agg(sv.name, ' + ' ORDER BY sv.is_addon, sv.name) FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id
                  WHERE aps.appointment_id = a.id) AS service_name,
                (SELECT json_build_object('id', r.id, 'kind', r.kind, 'serie', r.serie, 'numero', r.numero, 'status', r.status, 'pdf_url', r.pdf_url)
                   FROM receipts r WHERE r.appointment_id = a.id AND r.status <> 'void' ORDER BY r.created_at DESC LIMIT 1) AS receipt
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
      // Un barbero solo cambia sus propias citas
      if (request.user.role === 'staff') {
        const own = await sql<{ staff_id: string | null }>('SELECT staff_id FROM appointments WHERE id = $1', [id]);
        if (own.rows[0]?.staff_id !== request.user.staffId) return { error: 'sin_permiso' as const };
      }
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
      const prev = await sql<{ starts_at: Date; status: string }>('SELECT starts_at, status FROM appointments WHERE id = $1', [id]);
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
        // Referidos: quien invitó suma puntos cuando su amigo completa la primera visita
        await sql(
          `UPDATE clients c SET loyalty_points = c.loyalty_points + COALESCE((SELECT referral_reward_points FROM tenant_settings LIMIT 1), 50)
             FROM appointments a WHERE a.id = $1 AND a.referred_by_client_id = c.id AND a.referral_rewarded = false`,
          [id],
        );
        await sql('UPDATE appointments SET referral_rewarded = true WHERE id = $1 AND referred_by_client_id IS NOT NULL', [id]);
      }
      const p0 = prev.rows[0];
      // Si se libera un horario (cancelada o movida a otra hora), avisamos a la lista de espera
      const freed = p0 && ((b.status === 'cancelled' && p0.status !== 'cancelled') || (b.startsAt && new Date(b.startsAt).getTime() !== new Date(p0.starts_at).getTime()));
      return { location_id: rows[0]?.location_id ?? null, freedAt: freed ? p0.starts_at : null };
    });
    if ('error' in out) return reply.code(out.error === 'no_encontrado' ? 404 : out.error === 'sin_permiso' ? 403 : 409).send({ error: out.error });
    await emitAvailabilityChange(tid(request), out.location_id);
    if (out.freedAt) void processWaitlist(tid(request), out.freedAt);
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
    showPoweredBy: z.boolean().optional(),
    siteTheme: z
      .object({
        mood: z.enum(['clasica', 'urbana', 'minimal', 'lujo', 'vintage']).optional(),
        hero: z.enum(['imagen', 'tipografia']).optional(),
        headline: z.string().trim().max(80).optional(),
        marquee: z.boolean().optional(),
        since: z.number().int().min(1900).max(2100).nullable().optional(),
        focus: z.number().int().min(0).max(100).optional(),
        signature: z.object({ serviceId: z.string().uuid().optional(), image: z.string().max(500).optional() }).optional(),
      })
      .optional(),
    gallery: z.array(z.object({ url: z.string().max(500), caption: z.string().max(120).optional(), staffId: z.string().uuid().nullable().optional() })).max(60).optional(),
});
  // Solo galería o mención de date.pe: no reescribe la marca
  app.patch('/admin/branding', async (request) => {
    const b = brandingBody.pick({ gallery: true, showPoweredBy: true, siteTheme: true }).parse(request.body);
    return withTenant(tid(request), async (sql) => {
      if (b.gallery !== undefined) await sql('UPDATE tenant_branding SET gallery = $1::jsonb', [JSON.stringify(b.gallery)]);
      if (b.siteTheme !== undefined) await sql('UPDATE tenant_branding SET site_theme = site_theme || $1::jsonb, updated_at = now()', [JSON.stringify(b.siteTheme)]);
      if (b.showPoweredBy !== undefined) await sql('UPDATE tenant_branding SET show_powered_by = $1', [b.showPoweredBy]);
      return (await sql('SELECT * FROM tenant_branding')).rows[0];
    });
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
      // Galería y mención de date.pe: solo si llegan (no se tocan al guardar la marca)
      if (b.gallery !== undefined) await sql('UPDATE tenant_branding SET gallery = $1::jsonb', [JSON.stringify(b.gallery)]);
      if (b.showPoweredBy !== undefined) await sql('UPDATE tenant_branding SET show_powered_by = $1', [b.showPoweredBy]);
      return (await sql('SELECT * FROM tenant_branding')).rows[0] ?? rows[0];
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
