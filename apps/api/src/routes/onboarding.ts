import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { adminPool, admin } from '../db.js';
import { env } from '../env.js';
import { platformEmails } from '../lib/alerts.js';
import { sendEmail, layout } from '../lib/email.js';
import { tenantUrl } from '../lib/notify.js';

// Alta de barberías por solicitud: la barbería llena el formulario en date.pe/join,
// el equipo de date.pe la contacta, acuerdan el plan y recién ahí se crea la cuenta.
export const RESERVED = new Set(['www', 'api', 'r2', 'admin', 'panel', 'app', 'mail', 'blog', 'static', 'cdn', 'superadmin', 'join', 'soporte', 'ayuda', 'status']);
const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');

export const OPTIONS = {
  locations: ['1', '2-3', '4-10', '10+'],
  staff: ['0-5', '5-15', '15-30', '30+'],
  dailyClients: ['1-10', '10-30', '30-60', '60-100', '100+'],
  yearsOpen: ['Por abrir', 'Menos de 1 año', '1 a 3 años', '3 a 10 años', 'Más de 10 años'],
};


export const onboardingRoutes: FastifyPluginAsync = async (app) => {
  // ¿Está libre el subdominio?
  app.get('/onboarding/slug', async (request) => {
    const slug = String((request.query as { slug?: string }).slug ?? '').toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(slug) || RESERVED.has(slug)) return { slug, available: false, reason: 'invalido' };
    const { rows } = await adminPool.query(
      `SELECT 1 FROM tenants WHERE slug = $1
       UNION ALL SELECT 1 FROM shop_applications WHERE desired_slug = $1 AND status IN ('new','contacted','negotiating')`,
      [slug],
    );
    return { slug, available: rows.length === 0 };
  });

  app.get('/onboarding/options', async () => OPTIONS);

  // El alta directa ya no existe: todo entra como solicitud
  app.post('/onboarding', async (_request, reply) => reply.code(410).send({ error: 'usa_la_solicitud', url: '/join' }));

  const applyBody = z.object({
    shopName: z.string().trim().min(2).max(80),
    desiredSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/).optional().or(z.literal('')),
    ownerName: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(120),
    phone: z.string().trim().min(6).max(20),
    role: z.string().max(40).optional(),
    district: z.string().max(60).optional(),
    city: z.string().max(60).default('Lima'),
    address: z.string().max(200).optional(),
    locationsCount: z.enum(OPTIONS.locations as [string, ...string[]]),
    staffSize: z.enum(OPTIONS.staff as [string, ...string[]]),
    dailyClients: z.enum(OPTIONS.dailyClients as [string, ...string[]]),
    yearsOpen: z.string().max(40).optional(),
    services: z.array(z.string().max(40)).max(20).default([]),
    currentBooking: z.array(z.string().max(40)).max(10).default([]),
    currentSoftware: z.string().max(80).optional(),
    interests: z.array(z.string().max(40)).max(20).default([]),
    paymentMethods: z.array(z.string().max(30)).max(10).default([]),
    instagram: z.string().max(120).optional(),
    website: z.string().max(200).optional(),
    heardFrom: z.string().max(80).optional(),
    contactPref: z.enum(['whatsapp', 'llamada', 'correo']).default('whatsapp'),
    contactTime: z.string().max(40).optional(),
    comments: z.string().max(1500).optional(),
    acceptTerms: z.literal(true),
    // Trampa para bots: los humanos no ven este campo
    company: z.string().max(0).optional(),
  });

  app.post('/onboarding/apply', async (request, reply) => {
    const parsed = applyBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos', detail: parsed.error.flatten() });
    const b = parsed.data;
    const ip = (request.headers['cf-connecting-ip'] as string) || (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || request.ip;
    const recent = await admin<{ n: number }>("SELECT count(*)::int AS n FROM shop_applications WHERE source_ip = $1 AND created_at > now() - interval '1 hour'", [ip]);
    if ((recent.rows[0]?.n ?? 0) >= 5) return reply.code(429).send({ error: 'demasiadas_solicitudes' });
    // Una solicitud abierta por correo: se actualiza en vez de duplicar
    const open = await admin<{ id: string }>("SELECT id FROM shop_applications WHERE lower(email) = lower($1) AND status IN ('new','contacted','negotiating') LIMIT 1", [b.email]);
    const slug = b.desiredSlug && !RESERVED.has(b.desiredSlug) ? b.desiredSlug : null;
    const values = [
      b.shopName, slug, b.ownerName, b.email.toLowerCase(), b.phone, b.role ?? null, b.district ?? null, b.city, b.address ?? null,
      b.locationsCount, b.staffSize, b.dailyClients, b.yearsOpen ?? null, b.services, b.currentBooking, b.currentSoftware ?? null,
      b.interests, b.paymentMethods, b.instagram ?? null, b.website ?? null, b.heardFrom ?? null, b.contactPref, b.contactTime ?? null,
      b.comments ?? null, ip,
    ];
    let id: string;
    if (open.rows[0]) {
      id = open.rows[0].id;
      await admin(
        `UPDATE shop_applications SET shop_name=$1, desired_slug=$2, owner_name=$3, email=$4, phone=$5, role=$6, district=$7, city=$8, address=$9,
           locations_count=$10, staff_size=$11, daily_clients=$12, years_open=$13, services=$14, current_booking=$15, current_software=$16,
           interests=$17, payment_methods=$18, instagram=$19, website=$20, heard_from=$21, contact_pref=$22, contact_time=$23, comments=$24,
           source_ip=$25, updated_at=now() WHERE id = $26`,
        [...values, id],
      );
    } else {
      const r = await admin<{ id: string }>(
        `INSERT INTO shop_applications (shop_name, desired_slug, owner_name, email, phone, role, district, city, address, locations_count, staff_size,
           daily_clients, years_open, services, current_booking, current_software, interests, payment_methods, instagram, website, heard_from,
           contact_pref, contact_time, comments, source_ip)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING id`,
        values,
      );
      id = r.rows[0].id;
    }

    const first = b.ownerName.split(' ')[0];
    void sendEmail({
      to: b.email,
      subject: `Recibimos la solicitud de ${b.shopName}`,
      html: layout({
        brand: 'date.pe',
        title: `Gracias, ${first}`,
        intro: `Recibimos la solicitud de ${b.shopName}. Te vamos a contactar por ${b.contactPref === 'correo' ? 'correo' : b.contactPref === 'llamada' ? 'teléfono' : 'WhatsApp'} en menos de 24 horas hábiles para mostrarte el sistema con tu información y armar el plan que le queda a tu barbería.`,
        rows: [
          ['Barbería', b.shopName],
          ['Personal', `${b.staffSize} personas`],
          ['Locales', b.locationsCount],
          ['Clientes al día', b.dailyClients],
        ],
        cta: { label: 'Ver una barbería de ejemplo', href: 'https://barberiajuana.date.pe' },
        foot: 'date.pe, agenda y reservas para barberías',
      }),
    });
    const team = await platformEmails();
    if (team.length) {
      void sendEmail({
        to: team.join(','),
        replyTo: b.email,
        subject: `Nueva solicitud: ${b.shopName} (${b.staffSize} personas, ${b.locationsCount} locales)`,
        html: layout({
          brand: 'date.pe',
          title: 'Nueva solicitud de barbería',
          intro: `${b.ownerName} quiere date.pe para ${b.shopName}. Prefiere que lo contacten por ${b.contactPref}${b.contactTime ? ` en la ${b.contactTime}` : ''}.`,
          rows: [
            ['Celular', b.phone],
            ['Correo', b.email],
            ['Distrito', [b.district, b.city].filter(Boolean).join(', ')],
            ['Personal', b.staffSize],
            ['Locales', b.locationsCount],
            ['Clientes al día', b.dailyClients],
            ['Hoy reserva por', b.currentBooking.join(', ') || 'No indicó'],
            ['Le interesa', b.interests.join(', ') || 'No indicó'],
          ],
          cta: { label: 'Abrir en el superadmin', href: `${env.appPublicUrl}/superadmin#solicitudes` },
          foot: 'Solicitud recibida en date.pe/join',
        }),
      });
    }
    return reply.code(201).send({ ok: true, id, updated: !!open.rows[0] });
  });

  // ============================ Superadmin ============================
  app.register(async (platform) => {
    platform.addHook('preHandler', app.requirePlatformAdmin);

    platform.get('/platform/applications', async (request) => {
      const q = z.object({ status: z.string().optional() }).parse(request.query);
      const { rows } = await admin(
        `SELECT a.*, t.slug AS tenant_slug FROM shop_applications a LEFT JOIN tenants t ON t.id = a.tenant_id
          WHERE ($1::text IS NULL OR a.status = $1) ORDER BY (a.status IN ('approved','rejected')), a.created_at DESC LIMIT 300`,
        [q.status ?? null],
      );
      const counts = await admin<{ status: string; n: number }>(`SELECT status, count(*)::int AS n FROM shop_applications GROUP BY status`);
      return { applications: rows, counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])) };
    });

    platform.patch('/platform/applications/:id', async (request) => {
      const id = (request.params as { id: string }).id;
      const b = z
        .object({
          status: z.enum(['new', 'contacted', 'negotiating', 'rejected']).optional(),
          internalNotes: z.string().max(4000).optional(),
          agreedPriceCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
        })
        .parse(request.body);
      await admin(
        `UPDATE shop_applications SET
           status = COALESCE($2, status),
           internal_notes = COALESCE($3, internal_notes),
           agreed_price_cents = CASE WHEN $5 THEN $4::int ELSE agreed_price_cents END,
           contacted_at = CASE WHEN $2 IN ('contacted','negotiating') AND contacted_at IS NULL THEN now() ELSE contacted_at END,
           decided_at = CASE WHEN $2 = 'rejected' THEN now() ELSE decided_at END,
           updated_at = now()
         WHERE id = $1`,
        [id, b.status ?? null, b.internalNotes ?? null, b.agreedPriceCents ?? null, b.agreedPriceCents !== undefined],
      );
      return { ok: true };
    });

    // Aprobar: crea la barbería con el plan acordado y envía el acceso al dueño
    platform.post('/platform/applications/:id/approve', async (request, reply) => {
      const id = (request.params as { id: string }).id;
      const b = z
        .object({
          slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/),
          monthlyPriceCents: z.number().int().min(0).max(1_000_000),
          trialDays: z.number().int().min(0).max(120).default(14),
          paidMonths: z.number().int().min(0).max(24).default(0),
          sendEmail: z.boolean().default(true),
        })
        .parse(request.body);
      if (RESERVED.has(b.slug)) return reply.code(409).send({ error: 'slug_reservado' });
      const appRow = await admin<{ shop_name: string; owner_name: string; email: string; phone: string; district: string | null; city: string; address: string | null; status: string; instagram: string | null }>(
        'SELECT shop_name, owner_name, email, phone, district, city, address, status, instagram FROM shop_applications WHERE id = $1',
        [id],
      );
      const a = appRow.rows[0];
      if (!a) return reply.code(404).send({ error: 'no_encontrada' });
      if (a.status === 'approved') return reply.code(409).send({ error: 'ya_aprobada' });
      const client = await adminPool.connect();
      let tenantId: string;
      let token: string | null = null;
      try {
        await client.query('BEGIN');
        const taken = await client.query('SELECT 1 FROM tenants WHERE slug = $1', [b.slug]);
        if (taken.rows.length) {
          await client.query('ROLLBACK');
          return reply.code(409).send({ error: 'slug_en_uso' });
        }
        const t = await client.query<{ id: string }>(
          `INSERT INTO tenants (slug, name, status, plan, monthly_price_cents, trial_ends_at, paid_until)
           VALUES ($1, $2, CASE WHEN $5 > 0 THEN 'active' ELSE 'trial' END, 'suite', $3, now() + make_interval(days => $4),
                   CASE WHEN $5 > 0 THEN now() + make_interval(months => $5) ELSE NULL END) RETURNING id`,
          [b.slug, a.shop_name, b.monthlyPriceCents, b.trialDays, b.paidMonths],
        );
        tenantId = t.rows[0].id;
        await client.query('INSERT INTO tenant_settings (tenant_id, notify_owner_email) VALUES ($1, $2)', [tenantId, a.email]);
        await client.query(`INSERT INTO tenant_branding (tenant_id, tagline, whatsapp, instagram) VALUES ($1, $2, $3, $4)`, [
          tenantId,
          `Reserva tu cita en ${a.shop_name}`,
          a.phone,
          a.instagram,
        ]);
        const did = a.district ? (await client.query<{ id: number }>('SELECT id FROM geo_districts WHERE lower(district) = lower($1) LIMIT 1', [a.district])).rows[0]?.id ?? null : null;
        await client.query(`INSERT INTO locations (tenant_id, name, address, district, province, district_id) VALUES ($1, $2, $3, $4, $5, $6)`, [
          tenantId,
          a.district ? `Sede ${a.district}` : 'Sede principal',
          a.address,
          a.district,
          a.city,
          did,
        ]);
        const u = await client.query<{ id: string; password_hash: string | null }>(
          `INSERT INTO users (email, name) VALUES (lower($1), $2) ON CONFLICT (email) DO UPDATE SET name = COALESCE(users.name, EXCLUDED.name) RETURNING id, password_hash`,
          [a.email, a.owner_name],
        );
        await client.query("INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner') ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = 'owner'", [u.rows[0].id, tenantId]);
        // Enlace para crear su contraseña (vale 7 días)
        token = randomBytes(24).toString('hex');
        await client.query(`INSERT INTO password_resets (token_hash, user_id, tenant_slug, expires_at) VALUES ($1, $2, $3, now() + interval '7 days')`, [tokenHash(token), u.rows[0].id, b.slug]);
        await client.query(
          `UPDATE shop_applications SET status = 'approved', tenant_id = $2, agreed_price_cents = $3, decided_at = now(), updated_at = now() WHERE id = $1`,
          [id, tenantId, b.monthlyPriceCents],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        request.log.error(err);
        return reply.code(500).send({ error: 'error_creando' });
      } finally {
        client.release();
      }
      const accessUrl = tenantUrl(b.slug, `/admin/restablecer?token=${token}`);
      if (b.sendEmail) {
        void sendEmail({
          to: a.email,
          subject: `${a.shop_name} ya está en date.pe`,
          html: layout({
            brand: 'date.pe',
            title: `Bienvenido, ${a.owner_name.split(' ')[0]}`,
            intro: `Tu barbería ya tiene su página y su panel. Crea tu contraseña con el botón (el enlace vale 7 días) y empieza agregando a tu equipo, tus servicios y tus horarios. Cualquier duda, respóndenos este correo.`,
            rows: [
              ['Tu página', `${b.slug}.date.pe`],
              ['Tu panel', `${b.slug}.date.pe/admin`],
              ['Usuario', a.email],
            ],
            cta: { label: 'Crear mi contraseña', href: accessUrl },
            foot: 'date.pe, agenda y reservas para barberías',
          }),
        });
      }
      return reply.code(201).send({ ok: true, tenantId: tenantId!, slug: b.slug, accessUrl });
    });

    platform.post('/platform/applications/:id/reject', async (request) => {
      const id = (request.params as { id: string }).id;
      const b = z.object({ reason: z.string().max(500).optional(), notify: z.boolean().default(false) }).parse(request.body ?? {});
      const r = await admin<{ email: string; owner_name: string; shop_name: string }>(
        `UPDATE shop_applications SET status = 'rejected', decided_at = now(), updated_at = now(),
                internal_notes = COALESCE(internal_notes || E'\n', '') || COALESCE('Rechazada: ' || $2, 'Rechazada')
          WHERE id = $1 RETURNING email, owner_name, shop_name`,
        [id, b.reason ?? null],
      );
      if (b.notify && r.rows[0]) {
        void sendEmail({
          to: r.rows[0].email,
          subject: `Sobre tu solicitud para ${r.rows[0].shop_name}`,
          html: layout({
            brand: 'date.pe',
            title: 'Gracias por tu interés',
            intro: `Hola ${r.rows[0].owner_name.split(' ')[0]}, por ahora no podemos activar date.pe para ${r.rows[0].shop_name}.${b.reason ? ` ${b.reason}` : ''} Te escribiremos si esto cambia.`,
            foot: 'date.pe',
          }),
        });
      }
      return { ok: true };
    });
  });
};
