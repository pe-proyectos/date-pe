import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db.js';

const TODAY = "(now() AT TIME ZONE 'America/Lima')::date";

function tid(request: FastifyRequest): string {
  if (!request.tenant) throw new Error('tenant_no_resuelto');
  return request.tenant.id;
}

/** Celular a +51XXXXXXXXX. Acepta 9 dígitos, 51 + 9, 0051 + 9 o un número internacional con +. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let d = s.replace(/\D/g, '');
  if (d.startsWith('0051')) d = d.slice(2);
  if (d.length === 9) return `+51${d}`;
  if (d.length === 11 && d.startsWith('51')) return `+${d}`;
  if (s.startsWith('+') && d.length >= 10 && d.length <= 15) return `+${d}`;
  return null;
}

const row = z.object({
  name: z.string().trim().max(120).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().trim().max(160).optional().nullable(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  tags: z.array(z.string().trim().max(30)).max(10).optional(),
  visits: z.number().int().min(0).max(100000).optional().nullable(),
  lastVisit: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Herramientas de arranque: traer clientes de otro sistema y la guía de primeros pasos.
export const setupRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireTenant);

  app.post('/admin/clients/import', async (request) => {
    const b = z
      .object({
        rows: z.array(row).min(1).max(2000),
        marketingOptIn: z.boolean().default(false),
        dryRun: z.boolean().default(false),
      })
      .parse(request.body);

    const skipped: Array<{ row: number; reason: 'sin_celular' | 'celular_invalido' | 'repetido_en_archivo'; value?: string }> = [];
    const byPhone = new Map<string, z.infer<typeof row> & { phone: string; idx: number }>();
    b.rows.forEach((r, i) => {
      if (!r.phone) return skipped.push({ row: i + 1, reason: 'sin_celular' });
      const phone = normalizePhone(r.phone);
      if (!phone) return skipped.push({ row: i + 1, reason: 'celular_invalido', value: r.phone });
      const email = r.email && EMAIL_RE.test(r.email) ? r.email.toLowerCase() : null;
      const prev = byPhone.get(phone);
      if (prev) {
        skipped.push({ row: i + 1, reason: 'repetido_en_archivo', value: r.phone });
        // Completa lo que le faltaba a la primera aparición
        prev.name ||= r.name;
        prev.email ||= email;
        prev.birthday ||= r.birthday;
        prev.visits = Math.max(prev.visits ?? 0, r.visits ?? 0) || prev.visits;
        if (r.lastVisit && (!prev.lastVisit || r.lastVisit > prev.lastVisit)) prev.lastVisit = r.lastVisit;
        return;
      }
      byPhone.set(phone, { ...r, email, phone, idx: i + 1 });
    });

    return withTenant(tid(request), async (sql) => {
      const phones = [...byPhone.keys()];
      const existing = await sql<{ id: string; key: string }>(
        `SELECT id, right(regexp_replace(phone, '[^0-9]', '', 'g'), 9) AS key FROM clients
          WHERE right(regexp_replace(phone, '[^0-9]', '', 'g'), 9) = ANY($1::text[])`,
        [phones.map((p) => p.replace(/\D/g, '').slice(-9))],
      );
      const found = new Map(existing.rows.map((r) => [r.key, r.id]));
      let created = 0;
      let updated = 0;
      if (!b.dryRun) {
        for (const r of byPhone.values()) {
          const id = found.get(r.phone.replace(/\D/g, '').slice(-9));
          const birthday = r.birthday && !Number.isNaN(Date.parse(r.birthday)) ? r.birthday : null;
          const last = r.lastVisit && !Number.isNaN(Date.parse(r.lastVisit)) && r.lastVisit <= new Date().toISOString().slice(0, 10) ? r.lastVisit : null;
          if (id) {
            // Solo completa datos vacíos: nunca pisa lo que la barbería ya tenía
            await sql(
              `UPDATE clients SET name = COALESCE(NULLIF(name, ''), $2), email = COALESCE(email, $3), birthday = COALESCE(birthday, $4::date),
                      notes = CASE WHEN $5::text IS NULL OR notes ILIKE '%' || $5 || '%' THEN notes ELSE concat_ws(E'\n', notes, $5) END,
                      tags = (SELECT array(SELECT DISTINCT unnest(tags || $6::text[]))),
                      import_visits = GREATEST(COALESCE(import_visits, 0), COALESCE($7, 0)),
                      import_last_visit = GREATEST(import_last_visit, $8::date), imported_at = now()
                WHERE id = $1`,
              [id, r.name || null, r.email, birthday, r.notes || null, r.tags ?? [], r.visits ?? null, last],
            );
            updated++;
          } else {
            await sql(
              `INSERT INTO clients (tenant_id, phone, name, email, birthday, notes, tags, marketing_opt_in, import_visits, import_last_visit, imported_at)
               VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4::date, $5, $6, $7, $8, $9::date, now())`,
              [r.phone, r.name || null, r.email, birthday, r.notes || null, r.tags ?? [], b.marketingOptIn, r.visits ?? null, last],
            );
            created++;
          }
        }
      } else {
        for (const p of phones) (found.has(p.replace(/\D/g, '').slice(-9)) ? updated++ : created++);
      }
      return { total: b.rows.length, created, updated, skipped, dryRun: b.dryRun };
    });
  });

  // ---------------------- Varias sedes: cómo va cada una ahora ----------------------
  app.get('/admin/locations/overview', async (request) =>
    withTenant(tid(request), async (sql) => {
      const { rows } = await sql(
        `SELECT l.id, l.name, l.district,
                (SELECT count(*) FROM sales s WHERE s.location_id = l.id AND s.status = 'paid' AND (s.created_at AT TIME ZONE 'America/Lima')::date = ${TODAY})::int AS ventas,
                (SELECT COALESCE(sum(total_cents), 0) FROM sales s WHERE s.location_id = l.id AND s.status = 'paid' AND (s.created_at AT TIME ZONE 'America/Lima')::date = ${TODAY})::int AS total_cents,
                (SELECT count(*) FROM queue_tickets q WHERE q.location_id = l.id AND q.day = ${TODAY} AND q.status = 'waiting')::int AS en_fila,
                (SELECT count(*) FROM queue_tickets q WHERE q.location_id = l.id AND q.day = ${TODAY} AND q.status IN ('called','serving'))::int AS atendiendo,
                (SELECT count(*) FROM appointments a WHERE a.location_id = l.id AND (a.starts_at AT TIME ZONE 'America/Lima')::date = ${TODAY} AND a.status IN ('pending','confirmed') AND a.starts_at > now())::int AS citas_pendientes,
                (SELECT count(*) FROM appointments a WHERE a.location_id = l.id AND (a.starts_at AT TIME ZONE 'America/Lima')::date = ${TODAY} AND a.status = 'completed')::int AS citas_completadas,
                (SELECT count(DISTINCT ss.staff_id) FROM staff_schedules ss JOIN staff st ON st.id = ss.staff_id
                  WHERE st.is_bookable AND COALESCE(ss.location_id, st.location_id) = l.id
                    AND ss.day_of_week = EXTRACT(DOW FROM now() AT TIME ZONE 'America/Lima')
                    AND (now() AT TIME ZONE 'America/Lima')::time BETWEEN ss.start_time AND ss.end_time)::int AS barberos_ahora,
                EXISTS (SELECT 1 FROM cash_sessions cs WHERE cs.location_id = l.id AND cs.status = 'open') AS caja_abierta
           FROM locations l WHERE l.is_active ORDER BY l.created_at`,
      );
      return { locations: rows };
    }),
  );

  // ---------------------- Guía de primeros pasos ----------------------
  app.get('/admin/setup', async (request) =>
    withTenant(tid(request), async (sql) => {
      const { rows } = await sql<Record<string, number | boolean | string | null> & { setup_state: Record<string, boolean> }>(
        `SELECT
           (SELECT logo_url IS NOT NULL FROM tenant_branding) AS logo,
           (SELECT count(*) FROM services WHERE is_active)::int AS services,
           (SELECT count(*) FROM staff)::int AS staff,
           (SELECT count(*) FROM staff WHERE photo_url IS NOT NULL)::int AS staff_photos,
           (SELECT count(*) FROM staff_schedules)::int AS schedules,
           (SELECT count(*) FROM locations WHERE is_active AND address IS NOT NULL AND address <> '')::int AS located,
           (SELECT count(*) FROM clients)::int AS clients,
           (SELECT count(*) FROM memberships m WHERE m.tenant_id = current_setting('app.tenant_id')::uuid)::int AS members,
           (SELECT count(*) FROM team_invites i WHERE i.tenant_id = current_setting('app.tenant_id')::uuid)::int AS invites,
           (SELECT count(*) FROM appointments WHERE source = 'online')::int AS online_bookings,
           (SELECT sunat_ruc IS NOT NULL AND sunat_ruc <> '' AND sunat_razon_social IS NOT NULL FROM tenant_settings) AS legal,
           (SELECT setup_state FROM tenant_settings) AS setup_state`,
      );
      const r = rows[0];
      const st = (r.setup_state ?? {}) as Record<string, boolean>;
      const steps = [
        { id: 'branding', title: 'Sube tu logo', body: 'Tu página, tus correos y la TV se ven con tu marca.', done: !!r.logo, href: '#ajustes', action: 'Ir a Ajustes' },
        { id: 'services', title: 'Agrega tus servicios', body: 'Con precio y duración. Así la agenda calcula los horarios libres.', done: Number(r.services) > 0, href: '#servicios', action: 'Agregar servicios' },
        { id: 'staff', title: 'Agrega a tu equipo', body: 'Cada barbero con foto. Los clientes reservan con quien prefieren.', done: Number(r.staff) > 0, href: '#equipo', action: 'Agregar barberos' },
        { id: 'schedules', title: 'Define los horarios', body: 'Qué días y a qué hora atiende cada barbero.', done: Number(r.schedules) > 0, href: '#horarios', action: 'Poner horarios' },
        { id: 'location', title: 'Confirma la dirección', body: 'Aparece en tu página, en los recordatorios y en el buscador de date.pe.', done: Number(r.located) > 0, href: '#ajustes', action: 'Revisar sede' },
        { id: 'legal', title: 'Completa tus datos legales', body: 'Razón social y RUC para tu Libro de Reclamaciones, que la ley exige.', done: !!r.legal, href: '#ajustes?legales', action: 'Completar datos' },
        { id: 'clients', title: 'Trae a tus clientes', body: 'Sube tu Excel o la exportación de tu sistema anterior. Nada se duplica.', done: Number(r.clients) > 0 || !!st.clients, href: '#clientes?importar', action: 'Importar clientes', optional: true },
        { id: 'team', title: 'Invita a tu equipo', body: 'Cada barbero ve su día y cobra desde su celular.', done: Number(r.members) > 1 || Number(r.invites) > 0 || !!st.team, href: '#accesos', action: 'Invitar', optional: true },
        { id: 'share', title: 'Comparte tu link de reservas', body: 'En tu Instagram, WhatsApp y Google. Es tu recepcionista 24 horas.', done: Number(r.online_bookings) > 0 || !!st.share, href: '#difusion', action: 'Compartir link' },
      ];
      const required = steps.filter((s) => !s.optional);
      return {
        steps,
        done: steps.filter((s) => s.done).length,
        total: steps.length,
        complete: required.every((s) => s.done),
        dismissed: !!st.dismissed,
      };
    }),
  );

  app.patch('/admin/setup', async (request) => {
    const b = z.object({ share: z.boolean().optional(), clients: z.boolean().optional(), team: z.boolean().optional(), dismissed: z.boolean().optional() }).parse(request.body);
    await withTenant(tid(request), (sql) => sql(`UPDATE tenant_settings SET setup_state = setup_state || $1::jsonb`, [JSON.stringify(b)]));
    return { ok: true };
  });
};
