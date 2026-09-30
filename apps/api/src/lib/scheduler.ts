import { admin, adminPool } from '../db.js';
import { apptInfo, sendReminder, sendReviewRequest, sendRebookReminder, once } from './notify.js';
import { emailBillingNotice, GRACE_DAYS } from './billing.js';
import { refreshPendingDomains } from './domains.js';

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
      WHERE NOT is_demo AND status IN ('trial','active')
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
      WHERE NOT is_demo AND status IN ('trial','active')
        AND GREATEST(COALESCE(trial_ends_at,'-infinity'), COALESCE(paid_until,'-infinity')) < now() - make_interval(days => $1)
      RETURNING id`,
    [GRACE_DAYS],
  );
  for (const { id } of suspended.rows) {
    if (await once(`billing-suspended:${id}:${new Date().toISOString().slice(0, 10)}`, id)) await emailBillingNotice(id, 'suspended');
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
}
