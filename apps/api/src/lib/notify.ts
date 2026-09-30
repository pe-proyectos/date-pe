import { admin } from '../db.js';
import { env } from '../env.js';
import { sendEmail, layout } from './email.js';

// Avisos por correo de la operación diaria. Corre con el pool admin (cross-tenant)
// porque se dispara desde webhooks, el planificador y rutas públicas.

export function tenantUrl(slug: string, path = '/', customDomain?: string | null, domainActive?: boolean) {
  const host = customDomain && domainActive ? customDomain : `${slug}.${env.baseDomain}`;
  return `https://${host}${path}`;
}

export function whenText(d: Date | string) {
  const t = new Date(d).toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Registra un aviso una sola vez; devuelve true si es la primera. */
export async function once(key: string, tenantId: string | null): Promise<boolean> {
  const r = await admin('INSERT INTO notification_log (key, tenant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING key', [key, tenantId]);
  return r.rows.length > 0;
}

export interface ApptInfo {
  id: string;
  tenant_id: string;
  tenant_name: string;
  slug: string;
  custom_domain: string | null;
  domain_status: string | null;
  starts_at: Date;
  ends_at: Date;
  status: string;
  price_cents: number;
  manage_token: string;
  client_id: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_referral_code: string | null;
  staff_name: string | null;
  service_name: string | null;
  whatsapp: string | null;
  address: string | null;
}

export async function apptInfo(id: string): Promise<ApptInfo | null> {
  const { rows } = await admin<ApptInfo>(
    `SELECT a.id, a.tenant_id, t.name AS tenant_name, t.slug, t.custom_domain, t.domain_status,
            a.starts_at, a.ends_at, a.status, a.price_cents, a.manage_token,
            c.id AS client_id, c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
            c.referral_code AS client_referral_code, s.name AS staff_name,
            (SELECT string_agg(sv.name, ' + ' ORDER BY sv.is_addon, sv.name)
               FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id
              WHERE aps.appointment_id = a.id) AS service_name,
            b.whatsapp, l.address
       FROM appointments a
       JOIN tenants t ON t.id = a.tenant_id
       LEFT JOIN clients c ON c.id = a.client_id
       LEFT JOIN staff s ON s.id = a.staff_id
       LEFT JOIN tenant_branding b ON b.tenant_id = a.tenant_id
       LEFT JOIN locations l ON l.id = a.location_id
      WHERE a.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

const manageUrl = (a: ApptInfo) => tenantUrl(a.slug, `/cita?t=${a.manage_token}`, a.custom_domain, a.domain_status === 'active');
const siteUrl = (a: ApptInfo, path = '/') => tenantUrl(a.slug, path, a.custom_domain, a.domain_status === 'active');

function apptRows(a: ApptInfo): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ['Servicio', a.service_name ?? 'Servicio'],
    ['Barbero', a.staff_name ?? 'Por asignar'],
    ['Cuándo', whenText(a.starts_at)],
    ['Código de reserva', a.id.slice(0, 8).toUpperCase()],
  ];
  if (a.address) rows.push(['Dónde', a.address]);
  return rows;
}

/** Correos de los dueños y del aviso configurado. */
export async function ownerEmails(tenantId: string): Promise<string[]> {
  const { rows } = await admin<{ email: string }>(
    `SELECT notify_owner_email AS email FROM tenant_settings WHERE tenant_id = $1 AND notify_owner_email IS NOT NULL AND notify_owner_email <> ''
     UNION
     SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = $1 AND m.role IN ('owner','manager')`,
    [tenantId],
  );
  return [...new Set(rows.map((r) => r.email))];
}

export async function sendBookingConfirmation(id: string) {
  const a = await apptInfo(id);
  if (!a?.client_email) return;
  const invite = a.client_referral_code
    ? ` Invita a un amigo con tu código ${a.client_referral_code}: él tiene descuento en su primera cita y tú sumas puntos.`
    : '';
  await sendEmail({
    to: a.client_email,
    fromName: a.tenant_name,
    subject: `Reserva confirmada en ${a.tenant_name}`,
    html: layout({
      brand: a.tenant_name,
      title: 'Tu cita está confirmada',
      intro: `Hola ${a.client_name ?? ''}, te esperamos. Si necesitas cambiar la hora o cancelar, hazlo desde el botón.${invite}`,
      rows: apptRows(a),
      cta: { label: 'Ver o cambiar mi reserva', href: manageUrl(a) },
    }),
  });
}

export async function notifyOwnerNewBooking(id: string) {
  const a = await apptInfo(id);
  if (!a) return;
  const to = await ownerEmails(a.tenant_id);
  if (to.length === 0) return;
  await sendEmail({
    to: to.join(','),
    subject: `Nueva reserva: ${a.client_name ?? 'Cliente'}, ${whenText(a.starts_at)}`,
    html: layout({
      brand: 'date.pe',
      title: 'Tienes una nueva reserva',
      intro: `${a.client_name ?? 'Un cliente'} reservó en ${a.tenant_name}.`,
      rows: [...apptRows(a), ['Celular', a.client_phone ?? '']],
      cta: { label: 'Abrir la agenda', href: siteUrl(a, '/admin#agenda') },
    }),
  });
}

export async function notifyOwnerChange(id: string, kind: 'cancelled' | 'rescheduled') {
  const a = await apptInfo(id);
  if (!a) return;
  const to = await ownerEmails(a.tenant_id);
  if (to.length === 0) return;
  const title = kind === 'cancelled' ? 'Un cliente canceló su cita' : 'Un cliente cambió la hora de su cita';
  await sendEmail({
    to: to.join(','),
    subject: `${kind === 'cancelled' ? 'Cita cancelada' : 'Cita reprogramada'}: ${a.client_name ?? 'Cliente'}`,
    html: layout({
      brand: 'date.pe',
      title,
      intro: `${a.client_name ?? 'El cliente'} lo hizo desde su enlace de reserva.`,
      rows: apptRows(a),
      cta: { label: 'Abrir la agenda', href: siteUrl(a, '/admin#agenda') },
    }),
  });
}

export async function sendReminder(a: ApptInfo, when: '24h' | '2h') {
  if (!a.client_email) return;
  await sendEmail({
    to: a.client_email,
    fromName: a.tenant_name,
    subject: when === '24h' ? `Mañana tienes cita en ${a.tenant_name}` : `Tu cita en ${a.tenant_name} es en 2 horas`,
    html: layout({
      brand: a.tenant_name,
      title: when === '24h' ? 'Te esperamos mañana' : 'Tu cita es en 2 horas',
      intro: `Hola ${a.client_name ?? ''}, te recordamos tu reserva. Si no puedes llegar, avísanos cambiando la hora o cancelando: así otro cliente puede usar ese horario.`,
      rows: apptRows(a),
      cta: { label: 'Ver o cambiar mi reserva', href: manageUrl(a) },
    }),
  });
}

export async function sendReviewRequest(a: ApptInfo) {
  if (!a.client_email || !a.client_phone) return;
  const phone = a.client_phone.replace(/\D/g, '').slice(-9);
  await sendEmail({
    to: a.client_email,
    fromName: a.tenant_name,
    subject: `¿Qué tal tu corte en ${a.tenant_name}?`,
    html: layout({
      brand: a.tenant_name,
      title: '¿Cómo te fue?',
      intro: `Gracias por venir, ${a.client_name ?? ''}. Tu opinión ayuda a ${a.staff_name ?? 'tu barbero'} y a otros clientes a elegir. Te toma 30 segundos.`,
      cta: { label: 'Dejar mi opinión', href: siteUrl(a, `/resena?cita=${a.id}&tel=${phone}`) },
    }),
  });
}

export async function sendRebookReminder(a: ApptInfo) {
  if (!a.client_email) return;
  await sendEmail({
    to: a.client_email,
    fromName: a.tenant_name,
    subject: `¿Toca corte? Reserva en ${a.tenant_name}`,
    html: layout({
      brand: a.tenant_name,
      title: 'Ya van unas semanas',
      intro: `Hola ${a.client_name ?? ''}, tu último corte con ${a.staff_name ?? 'nosotros'} fue hace unas semanas. Reserva tu próxima cita en un minuto.`,
      cta: { label: 'Reservar de nuevo', href: siteUrl(a, '/reservar') },
    }),
  });
}

/** Si se libera un horario, avisa a la lista de espera de ese día. */
export async function processWaitlist(tenantId: string, startsAt: Date | string) {
  const day = new Date(startsAt).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const t = await admin<{ name: string; slug: string; custom_domain: string | null; domain_status: string | null }>(
    'SELECT name, slug, custom_domain, domain_status FROM tenants WHERE id = $1',
    [tenantId],
  );
  const tenant = t.rows[0];
  if (!tenant) return;
  const { rows } = await admin<{ id: string; name: string; email: string | null; service_id: string | null; staff_id: string | null }>(
    `UPDATE waitlist SET notified_at = now()
      WHERE id IN (SELECT id FROM waitlist WHERE tenant_id = $1 AND day = $2 AND notified_at IS NULL AND NOT booked ORDER BY created_at LIMIT 5)
      RETURNING id, name, email, service_id, staff_id`,
    [tenantId, day],
  );
  for (const w of rows) {
    if (!w.email) continue;
    const q = new URLSearchParams({ fecha: day });
    if (w.service_id) q.set('servicio', w.service_id);
    if (w.staff_id) q.set('barbero', w.staff_id);
    const dayText = new Date(`${day}T12:00:00-05:00`).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima' });
    await sendEmail({
      to: w.email,
      fromName: tenant.name,
      subject: `Se liberó un horario en ${tenant.name}`,
      html: layout({
        brand: tenant.name,
        title: 'Se liberó un horario',
        intro: `Hola ${w.name}, alguien canceló su cita del ${dayText}. Los horarios se toman rápido: reserva ahora si te sirve.`,
        cta: { label: 'Ver horarios libres', href: tenantUrl(tenant.slug, `/reservar?${q}`, tenant.custom_domain, tenant.domain_status === 'active') },
      }),
    });
  }
}
