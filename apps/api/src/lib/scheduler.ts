import { admin, adminPool } from '../db.js';
import { dayReport, METHOD_LABEL, type DayReport } from './day-report.js';
import { apptInfo, sendReminder, sendReviewRequest, sendRebookReminder, once } from './notify.js';
import { emailBillingNotice, GRACE_DAYS } from './billing.js';
import { refreshPendingDomains } from './domains.js';
import { deliverGiftCard } from './gifts.js';
import { sendEmail, layout } from './email.js';
import { tenantUrl, ownerEmails } from './notify.js';
import { callNext } from '../routes/queue.js';
import { emitTenantEvent } from './realtime.js';
import { pushToTicket } from './push.js';

// Planificador en proceso: cada 5 minutos envía recordatorios, pide reseñas,
// invita a volver y administra la suscripción. Un advisory lock evita que dos
// instancias hagan el mismo trabajo.
const EVERY_MS = 5 * 60_000;
const LOCK_ID = 7_310_451;

async function remindersPass() {
  // 24 horas antes (solo si la reserva se hizo con al menos 20 horas de anticipación)
  const r24 = await admin<{ id: string }>(
    `UPDATE appointments a SET reminder_24h_at = now()
       FROM tenant_settings ts
      WHERE ts.tenant_id = a.tenant_id AND ts.reminders_enabled
        AND a.status = 'confirmed' AND a.reminder_24h_at IS NULL
        AND a.starts_at BETWEEN now() + interval '3 hours' AND now() + interval '24 hours'
        AND a.created_at <= a.starts_at - interval '20 hours'
      RETURNING a.id`,
  );
  for (const { id } of r24.rows) {
    const a = await apptInfo(id);
    if (a) await sendReminder(a, '24h');
  }
  // 2 horas antes
  const r2 = await admin<{ id: string }>(
    `UPDATE appointments a SET reminder_2h_at = now()
       FROM tenant_settings ts
      WHERE ts.tenant_id = a.tenant_id AND ts.reminders_enabled
        AND a.status = 'confirmed' AND a.reminder_2h_at IS NULL
        AND a.starts_at BETWEEN now() AND now() + interval '2 hours'
        AND a.created_at <= a.starts_at - interval '3 hours'
      RETURNING a.id`,
  );
  for (const { id } of r2.rows) {
    const a = await apptInfo(id);
    if (a) await sendReminder(a, '2h');
  }
}

async function reviewsPass() {
  const { rows } = await admin<{ id: string }>(
    `UPDATE appointments a SET review_requested_at = now()
       FROM tenant_settings ts
      WHERE ts.tenant_id = a.tenant_id AND ts.review_requests_enabled
        AND a.status IN ('confirmed','completed') AND a.review_requested_at IS NULL
        AND a.ends_at BETWEEN now() - interval '3 days' AND now() - interval '1 hour'
        AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.appointment_id = a.id)
      RETURNING a.id`,
  );
  for (const { id } of rows) {
    const a = await apptInfo(id);
    if (a) await sendReviewRequest(a);
  }
}

async function rebookPass() {
  // Última visita completada hace N días y sin otra cita posterior
  const { rows } = await admin<{ id: string }>(
    `UPDATE appointments a SET rebook_sent_at = now()
       FROM tenant_settings ts
      WHERE ts.tenant_id = a.tenant_id AND ts.rebook_days > 0
        AND a.status = 'completed' AND a.rebook_sent_at IS NULL AND a.client_id IS NOT NULL
        AND a.starts_at BETWEEN now() - make_interval(days => ts.rebook_days + 7) AND now() - make_interval(days => ts.rebook_days)
        AND NOT EXISTS (
          SELECT 1 FROM appointments b
           WHERE b.client_id = a.client_id AND b.id <> a.id AND b.starts_at > a.starts_at AND b.status <> 'cancelled'
        )
      RETURNING a.id`,
  );
  for (const { id } of rows) {
    const a = await apptInfo(id);
    if (a) await sendRebookReminder(a);
  }
}

async function billingPass() {
  // Aviso 3 días y 1 día antes de que termine la prueba o el mes pagado
  const ending = await admin<{ id: string; ends: Date; days: number }>(
    `SELECT id, GREATEST(COALESCE(trial_ends_at,'-infinity'), COALESCE(paid_until,'-infinity')) AS ends,
            CEIL(EXTRACT(EPOCH FROM GREATEST(COALESCE(trial_ends_at,'-infinity'), COALESCE(paid_until,'-infinity')) - now()) / 86400)::int AS days
       FROM tenants
      WHERE NOT is_demo AND monthly_price_cents > 0 AND status IN ('trial','active')
        AND GREATEST(COALESCE(trial_ends_at,'-infinity'), COALESCE(paid_until,'-infinity')) BETWEEN now() AND now() + interval '3 days'`,
  );
  for (const t of ending.rows) {
    const bucket = t.days <= 1 ? 1 : 3;
    if (await once(`billing-ending:${t.id}:${t.ends.toISOString().slice(0, 10)}:${bucket}`, t.id)) {
      await emailBillingNotice(t.id, 'ending', Math.max(1, t.days));
    }
  }
  // Suspender tras el periodo de gracia
  const suspended = await admin<{ id: string }>(
    `UPDATE tenants SET status = 'suspended', updated_at = now()
      WHERE NOT is_demo AND monthly_price_cents > 0 AND status IN ('trial','active')
        AND GREATEST(COALESCE(trial_ends_at,'-infinity'), COALESCE(paid_until,'-infinity')) < now() - make_interval(days => $1)
      RETURNING id`,
    [GRACE_DAYS],
  );
  for (const { id } of suspended.rows) {
    if (await once(`billing-suspended:${id}:${new Date().toISOString().slice(0, 10)}`, id)) await emailBillingNotice(id, 'suspended');
  }
}

// Cumpleaños y clientes que no vuelven: correo con un código de descuento único
async function marketingPass() {
  const hourLima = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: '2-digit', hour12: false }));
  if (hourLima < 9 || hourLima > 20) return; // solo en horario razonable
  const { rows: tenants } = await admin<{ id: string; name: string; slug: string; cfg: Record<string, unknown>; features: Record<string, unknown> }>(
    `SELECT t.id, t.name, t.slug, ts.marketing_config AS cfg, ts.features FROM tenants t JOIN tenant_settings ts ON ts.tenant_id = t.id
      WHERE t.status IN ('trial','active')`,
  );
  for (const t of tenants) {
    if (t.features.marketing === false) continue;
    const cfg = { birthdayEnabled: true, birthdayDiscountPercent: 20, winbackEnabled: true, winbackDays: 45, winbackDiscountPercent: 15, membershipRenewReminder: true, ...t.cfg } as {
      birthdayEnabled: boolean; birthdayDiscountPercent: number; winbackEnabled: boolean; winbackDays: number; winbackDiscountPercent: number; membershipRenewReminder: boolean;
    };
    const year = new Date().getFullYear();
    if (cfg.birthdayEnabled) {
      const bdays = await admin<{ id: string; name: string | null; email: string }>(
        `SELECT id, name, email FROM clients WHERE tenant_id = $1 AND email IS NOT NULL AND marketing_opt_in AND NOT blocked AND birthday IS NOT NULL
           AND to_char(birthday, 'MM-DD') = to_char(now() AT TIME ZONE 'America/Lima', 'MM-DD')`,
        [t.id],
      );
      for (const c of bdays.rows) {
        if (!(await once(`bday:${c.id}:${year}`, t.id))) continue;
        const code = `CUMPLE${c.id.slice(0, 4).toUpperCase()}${String(year).slice(2)}`;
        await admin(
          `INSERT INTO promotions (tenant_id, code, kind, value, expires_at, max_uses) VALUES ($1, $2, 'percent', $3, now() + interval '15 days', 1) ON CONFLICT (tenant_id, code) DO NOTHING`,
          [t.id, code, cfg.birthdayDiscountPercent],
        );
        await sendEmail({
          to: c.email,
          fromName: t.name,
          subject: `Feliz cumpleaños, ${(c.name ?? '').split(' ')[0]}. Tu regalo en ${t.name}`,
          html: layout({
            brand: t.name,
            title: `Feliz cumpleaños${c.name ? `, ${c.name.split(' ')[0]}` : ''}`,
            intro: `Para celebrarlo, tienes ${cfg.birthdayDiscountPercent}% de descuento en tu próximo corte. Vale por 15 días.`,
            rows: [['Tu código', code]],
            cta: { label: 'Reservar con mi regalo', href: tenantUrl(t.slug, `/reservar?codigo=${code}`) },
          }),
        });
      }
    }
    if (cfg.winbackEnabled && cfg.winbackDays > 0) {
      const lost = await admin<{ id: string; name: string | null; email: string }>(
        `SELECT c.id, c.name, c.email FROM clients c
          WHERE c.tenant_id = $1 AND c.email IS NOT NULL AND c.marketing_opt_in AND NOT c.blocked
            AND (SELECT max(starts_at) FROM appointments a WHERE a.client_id = c.id AND a.status = 'completed') BETWEEN now() - make_interval(days => $2 + 7) AND now() - make_interval(days => $2)
            AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.client_id = c.id AND a.starts_at > now() AND a.status IN ('pending','confirmed'))
          LIMIT 50`,
        [t.id, cfg.winbackDays],
      );
      for (const c of lost.rows) {
        if (!(await once(`winback:${c.id}:${new Date().toISOString().slice(0, 7)}`, t.id))) continue;
        const code = `VUELVE${c.id.slice(0, 4).toUpperCase()}`;
        await admin(
          `INSERT INTO promotions (tenant_id, code, kind, value, expires_at, max_uses) VALUES ($1, $2, 'percent', $3, now() + interval '21 days', 1)
           ON CONFLICT (tenant_id, code) DO UPDATE SET expires_at = EXCLUDED.expires_at, used_count = 0, active = true`,
          [t.id, code, cfg.winbackDiscountPercent],
        );
        await sendEmail({
          to: c.email,
          fromName: t.name,
          subject: `Te extrañamos en ${t.name}`,
          html: layout({
            brand: t.name,
            title: 'Hace tiempo que no te vemos',
            intro: `Hola ${(c.name ?? '').split(' ')[0]}, tu corte ya debe estar pidiendo retoque. Vuelve con ${cfg.winbackDiscountPercent}% de descuento durante las próximas 3 semanas.`,
            rows: [['Tu código', code]],
            cta: { label: 'Reservar ahora', href: tenantUrl(t.slug, `/reservar?codigo=${code}`) },
          }),
        });
      }
    }
    if (cfg.membershipRenewReminder) {
      const ending = await admin<{ id: string; name: string; client_name: string | null; email: string | null }>(
        `UPDATE client_memberships cm SET renew_reminded_at = now() FROM clients c
          WHERE cm.client_id = c.id AND cm.tenant_id = $1 AND cm.renew_reminded_at IS NULL AND cm.ends_at BETWEEN now() AND now() + interval '3 days'
          RETURNING cm.id, cm.name, c.name AS client_name, c.email`,
        [t.id],
      );
      for (const m of ending.rows) {
        if (!m.email) continue;
        await sendEmail({
          to: m.email,
          fromName: t.name,
          subject: `Tu ${m.name} vence en 3 días`,
          html: layout({
            brand: t.name,
            title: 'Renueva tu membresía',
            intro: `Hola ${(m.client_name ?? '').split(' ')[0]}, tu ${m.name} vence pronto. Renuévala en tu próxima visita para no perder tus beneficios.`,
            cta: { label: 'Reservar mi próxima cita', href: tenantUrl(t.slug, '/reservar') },
          }),
        });
      }
    }
  }
}

// Gift cards programadas para una fecha y limpieza de la fila del día anterior
async function giftsAndQueuePass() {
  const due = await admin<{ id: string }>("SELECT id FROM gift_cards WHERE paid AND delivered_at IS NULL AND deliver_at IS NOT NULL AND deliver_at <= now() LIMIT 50");
  for (const g of due.rows) await deliverGiftCard(g.id);
  await admin(`UPDATE queue_tickets SET status = 'no_show' WHERE status IN ('waiting','called') AND day < (now() AT TIME ZONE 'America/Lima')::date`);
}

// Resumen del día al dueño por correo (una vez, al cerrar)
async function dailySummaryPass() {
  const hourLima = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: '2-digit', hour12: false }));
  if (hourLima < 21) return;
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const { rows } = await admin<{ id: string; name: string; slug: string; features: Record<string, unknown> }>(
    `SELECT t.id, t.name, t.slug, ts.features FROM tenants t JOIN tenant_settings ts ON ts.tenant_id = t.id WHERE t.status IN ('trial','active')`,
  );
  for (const t of rows) {
    if (t.features.daily_summary === false) continue;
    const r = (await dayReport(t.id, day)) as DayReport;
    if (r.totals.ventas === 0 && r.appointments.total === 0 && r.queue.atendidos === 0) continue;
    if (!(await once(`daily:${t.id}:${day}`, t.id))) continue;
    const to = await ownerEmails(t.id);
    if (!to.length) continue;
    const money = (c: number) => `S/ ${(c / 100).toFixed(2)}`;
    await sendEmail({
      to: to.join(','),
      subject: `Tu día en ${t.name}: ${money(r.totals.total_cents)}`,
      html: layout({
        brand: 'date.pe',
        title: `Cierre del día: ${money(r.totals.total_cents)}`,
        intro: `${r.totals.ventas} ${r.totals.ventas === 1 ? 'venta' : 'ventas'}, ${r.queue.atendidos} atendidos sin cita y ${r.appointments.completed} citas completadas.${r.uncharged.length ? ` Quedaron ${r.uncharged.length} atenciones sin cobrar.` : ''}`,
        rows: [
          ...r.byMethod.map((m) => [METHOD_LABEL[m.method] ?? m.method, money(m.cents)] as [string, string]),
          ['Propinas', money(r.totals.tips_cents)],
          ...r.byStaff.filter((st) => st.servicios_cents > 0 || st.tips_cents > 0).map((st) => [`Para ${st.name}`, money(st.a_entregar_cents)] as [string, string]),
        ],
        cta: { label: 'Ver el cierre completo', href: tenantUrl(t.slug, '/admin#caja') },
        foot: 'Resumen automático de date.pe. Puedes apagarlo en Funciones.',
      }),
    });
  }
}

async function housekeeping() {
  await admin(`DELETE FROM otp_codes WHERE expires_at < now() - interval '1 day'`);
  await admin(`DELETE FROM password_resets WHERE expires_at < now() - interval '7 days'`);
}

export async function runSchedulerOnce(log: (msg: string, err?: unknown) => void = console.log) {
  const client = await adminPool.connect();
  try {
    const got = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_ID]);
    if (!got.rows[0]?.ok) return;
    try {
      for (const [name, fn] of [
        ['recordatorios', remindersPass],
        ['reseñas', reviewsPass],
        ['volver', rebookPass],
        ['suscripciones', billingPass],
        ['limpieza', housekeeping],
        ['dominios', refreshPendingDomains],
        ['marketing', marketingPass],
        ['regalos y fila', giftsAndQueuePass],
        ['resumen del día', dailySummaryPass],
      ] as const) {
        try {
          await fn();
        } catch (err) {
          log(`[planificador] fallo en ${name}`, err);
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

export function startScheduler(log: (msg: string, err?: unknown) => void) {
  setTimeout(() => void runSchedulerOnce(log), 20_000);
  setInterval(() => void runSchedulerOnce(log), EVERY_MS);
  // La fila necesita reaccionar rápido: cada minuto
  setInterval(() => void queuePass().catch((err) => log('[planificador] fallo en la fila', err)), 60_000);
}

/**
 * "No vino" automático. A la mitad del tiempo se vuelve a llamar (TV y celular);
 * al cumplirse, el turno pasa a "no vino" y se llama al siguiente para ese barbero.
 */
async function queuePass() {
  const { rows: recall } = await admin<{ id: string; tenant_id: string; number: number; name: string; staff: string | null }>(
    `UPDATE queue_tickets q SET recalled_at = now()
       FROM tenant_settings ts
      WHERE ts.tenant_id = q.tenant_id AND COALESCE((ts.queue_config->>'autoNoShow')::boolean, true)
        AND q.status = 'called' AND q.recalled_at IS NULL
        AND q.called_at < now() - make_interval(secs => COALESCE((ts.queue_config->>'noShowMinutes')::int, 10) * 30)
      RETURNING q.id, q.tenant_id, q.number, q.name, (SELECT name FROM staff WHERE id = q.served_by) AS staff`,
  );
  for (const r of recall) {
    const first = (r.name ?? '').split(' ')[0];
    await emitTenantEvent(r.tenant_id, 'queue_changed', { announce: { number: r.number, name: first, staff: r.staff ?? '' } });
    void pushToTicket(r.id, { title: `Te estamos llamando, ${first}`, body: `Turno ${r.number}. ${r.staff ?? 'Tu barbero'} te espera. Si no llegas, pasamos al siguiente.`, urgent: true, tag: 'turno', url: '/turno' });
  }
  const { rows: gone } = await admin<{ tenant_id: string; served_by: string | null }>(
    `UPDATE queue_tickets q SET status = 'no_show', finished_at = now()
       FROM tenant_settings ts
      WHERE ts.tenant_id = q.tenant_id AND COALESCE((ts.queue_config->>'autoNoShow')::boolean, true)
        AND q.status = 'called'
        AND q.called_at < now() - make_interval(mins => COALESCE((ts.queue_config->>'noShowMinutes')::int, 10))
      RETURNING q.tenant_id, q.served_by`,
  );
  for (const g of gone) {
    const next = g.served_by ? await callNext(g.tenant_id, g.served_by) : null;
    if (!next) await emitTenantEvent(g.tenant_id, 'queue_changed');
  }
}
