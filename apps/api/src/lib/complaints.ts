import { admin, adminPool } from '../db.js';
import { env } from '../env.js';
import { sendEmail, layout } from './email.js';
import { ownerEmails, tenantUrl } from './notify.js';
import { platformEmails } from './alerts.js';

// Libro de Reclamaciones virtual. Plazo de respuesta: 15 días hábiles
// (DS 101-2022-PCM). Se cuentan de lunes a viernes sin feriados nacionales.

function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}

export function peruHolidays(y: number): Set<string> {
  const fixed = ['01-01', '05-01', '06-07', '06-29', '07-23', '07-28', '07-29', '08-06', '08-30', '10-08', '11-01', '12-08', '12-09', '12-25'];
  const set = new Set(fixed.map((md) => `${y}-${md}`));
  const e = easter(y);
  for (const off of [-3, -2]) set.add(new Date(e.getTime() + off * 86_400_000).toISOString().slice(0, 10));
  return set;
}

/** Fecha límite: 15 días hábiles después de hoy (hora de Lima), al final del día. */
export function dueDate(from = new Date(), days = 15): Date {
  const lima = new Date(from.getTime() - 5 * 3_600_000);
  let d = new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate()));
  let left = days;
  while (left > 0) {
    d = new Date(d.getTime() + 86_400_000);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (peruHolidays(d.getUTCFullYear()).has(d.toISOString().slice(0, 10))) continue;
    left--;
  }
  // 23:59 de Lima = 04:59 UTC del día siguiente
  return new Date(d.getTime() + 86_400_000 + 4 * 3_600_000 + 59 * 60_000);
}

export interface Provider {
  tradeName: string;
  legalName: string;
  ruc: string | null;
  address: string | null;
  email: string | null;
}

export async function providerInfo(tenantId: string | null): Promise<Provider> {
  if (!tenantId) {
    return {
      tradeName: 'date.pe',
      legalName: env.platformLegalName || 'date.pe',
      ruc: env.platformRuc || null,
      address: env.platformAddress || null,
      email: (await platformEmails())[0] ?? null,
    };
  }
  const { rows } = await admin<{ name: string; ruc: string | null; razon: string | null; dir: string | null; addr: string | null }>(
    `SELECT t.name, ts.sunat_ruc AS ruc, ts.sunat_razon_social AS razon, ts.sunat_direccion AS dir,
            (SELECT CASE WHEN l.district IS NULL OR l.address ILIKE '%' || l.district || '%' THEN l.address ELSE concat_ws(', ', l.address, l.district) END FROM locations l WHERE l.tenant_id = t.id AND l.is_active ORDER BY l.created_at LIMIT 1) AS addr
       FROM tenants t LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id WHERE t.id = $1`,
    [tenantId],
  );
  const r = rows[0];
  return { tradeName: r?.name ?? '', legalName: r?.razon || r?.name || '', ruc: r?.ruc || null, address: r?.dir || r?.addr || null, email: null };
}

export interface ComplaintInput {
  kind: 'reclamo' | 'queja';
  consumerName: string;
  docType: 'DNI' | 'CE' | 'Pasaporte' | 'RUC';
  docNumber: string;
  address?: string | null;
  phone?: string | null;
  email: string;
  isMinor: boolean;
  guardianName?: string | null;
  itemType: 'servicio' | 'producto';
  amountCents?: number | null;
  itemDescription: string;
  detail: string;
  request: string;
  locationId?: string | null;
}

export async function createComplaint(tenantId: string | null, b: ComplaintInput, ip: string | null) {
  const client = await adminPool.connect();
  try {
    await client.query('BEGIN');
    // Numeración correlativa por libro y año
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`complaints:${tenantId ?? 'platform'}`]);
    const year = Number(new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 4));
    const { rows: n } = await client.query<{ next: number }>(
      `SELECT COALESCE(max(number), 0) + 1 AS next FROM complaints WHERE tenant_id IS NOT DISTINCT FROM $1 AND year = $2`,
      [tenantId, year],
    );
    const number = n[0].next;
    const code = `${year}-${String(number).padStart(6, '0')}`;
    const due = dueDate();
    const { rows } = await client.query<{ id: string; created_at: Date }>(
      `INSERT INTO complaints (tenant_id, location_id, year, number, code, kind, consumer_name, consumer_doc_type, consumer_doc_number,
                               consumer_address, consumer_phone, consumer_email, is_minor, guardian_name, item_type, item_amount_cents,
                               item_description, detail, request, due_at, source_ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id, created_at`,
      [tenantId, b.locationId ?? null, year, number, code, b.kind, b.consumerName, b.docType, b.docNumber, b.address ?? null, b.phone ?? null,
        b.email.toLowerCase(), b.isMinor, b.isMinor ? b.guardianName ?? null : null, b.itemType, b.amountCents ?? null, b.itemDescription, b.detail, b.request, due, ip],
    );
    await client.query('COMMIT');
    const row = { id: rows[0].id, code, dueAt: due, createdAt: rows[0].created_at };
    void notifyComplaint(tenantId, row, b).catch(() => {});
    return row;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const fmtDate = (d: Date) => d.toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDay = (d: Date) => d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long', year: 'numeric' });

async function tenantInfo(tenantId: string | null) {
  if (!tenantId) return null;
  const { rows } = await admin<{ slug: string; custom_domain: string | null; domain_status: string | null }>('SELECT slug, custom_domain, domain_status FROM tenants WHERE id = $1', [tenantId]);
  return rows[0] ?? null;
}

async function notifyComplaint(tenantId: string | null, c: { code: string; dueAt: Date; createdAt: Date }, b: ComplaintInput) {
  const p = await providerInfo(tenantId);
  const kindLabel = b.kind === 'reclamo' ? 'Reclamo' : 'Queja';
  const rows: Array<[string, string]> = [
    ['Hoja', c.code],
    ['Fecha', fmtDate(new Date(c.createdAt))],
    ['Proveedor', p.legalName + (p.ruc ? `, RUC ${p.ruc}` : '')],
    ['Tipo', kindLabel],
    ['Consumidor', b.consumerName],
    ['Documento', `${b.docType} ${b.docNumber}`],
    ...(b.isMinor && b.guardianName ? ([['Padre, madre o apoderado', b.guardianName]] as Array<[string, string]>) : []),
    ['Bien contratado', `${b.itemType === 'servicio' ? 'Servicio' : 'Producto'}: ${b.itemDescription}`],
    ...(b.amountCents ? ([['Monto', `S/ ${(b.amountCents / 100).toFixed(2)}`]] as Array<[string, string]>) : []),
    ['Detalle', b.detail],
    ['Pedido', b.request],
    ['Respuesta a más tardar', fmtDay(c.dueAt)],
  ];
  // Constancia para el consumidor
  await sendEmail({
    to: b.email,
    subject: `Constancia de tu ${kindLabel.toLowerCase()} ${c.code} en ${p.tradeName}`,
    fromName: p.tradeName,
    html: layout({
      brand: p.tradeName,
      title: `Recibimos tu ${kindLabel.toLowerCase()}`,
      intro: `Esta es la copia de tu hoja del Libro de Reclamaciones. ${p.tradeName} tiene hasta el ${fmtDay(c.dueAt)} para responderte a este correo.`,
      rows,
      foot: 'La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante INDECOPI.',
    }),
  });
  // Aviso al dueño (o al equipo de date.pe si es el libro de la plataforma)
  const t = await tenantInfo(tenantId);
  const to = tenantId ? await ownerEmails(tenantId) : await platformEmails();
  const href = t ? tenantUrl(t.slug, '/admin#reclamos', t.custom_domain, t.domain_status === 'active') : `${env.appPublicUrl}/superadmin#reclamos`;
  for (const addr of to) {
    await sendEmail({
      to: addr,
      subject: `Nuevo ${kindLabel.toLowerCase()} en tu Libro de Reclamaciones (${c.code})`,
      html: layout({
        brand: p.tradeName,
        title: `Nuevo ${kindLabel.toLowerCase()}: responde antes del ${fmtDay(c.dueAt)}`,
        intro: `${b.consumerName} dejó un ${kindLabel.toLowerCase()}. La ley te da 15 días hábiles para responder. Puedes hacerlo desde el panel y la respuesta le llega por correo.`,
        rows,
        cta: { label: 'Responder', href },
        foot: 'Aviso de date.pe',
      }),
    });
  }
}

export async function sendComplaintResponse(complaintId: string) {
  const { rows } = await admin<{ tenant_id: string | null; code: string; kind: string; consumer_name: string; consumer_email: string; response: string; detail: string; created_at: Date }>(
    'SELECT tenant_id, code, kind, consumer_name, consumer_email, response, detail, created_at FROM complaints WHERE id = $1',
    [complaintId],
  );
  const c = rows[0];
  if (!c) return;
  const p = await providerInfo(c.tenant_id);
  await sendEmail({
    to: c.consumer_email,
    subject: `Respuesta a tu ${c.kind} ${c.code} en ${p.tradeName}`,
    fromName: p.tradeName,
    html: layout({
      brand: p.tradeName,
      title: `Respuesta a tu ${c.kind}`,
      intro: `Hola ${c.consumer_name.split(' ')[0]}:\n\n${c.response}`,
      rows: [
        ['Hoja', c.code],
        ['Presentado el', fmtDate(new Date(c.created_at))],
        ['Proveedor', p.legalName + (p.ruc ? `, RUC ${p.ruc}` : '')],
      ],
      foot: 'Si no estás conforme con la respuesta, puedes acudir a INDECOPI.',
    }),
  });
}

/** Recordatorio al dueño 3 días hábiles antes del plazo, una sola vez. */
export async function complaintsPass() {
  const { rows } = await admin<{ id: string; tenant_id: string | null; code: string; consumer_name: string; due_at: Date }>(
    `UPDATE complaints SET reminded_at = now()
      WHERE status = 'open' AND reminded_at IS NULL AND due_at < now() + interval '4 days'
      RETURNING id, tenant_id, code, consumer_name, due_at`,
  );
  for (const c of rows) {
    const p = await providerInfo(c.tenant_id);
    const t = await tenantInfo(c.tenant_id);
    const to = c.tenant_id ? await ownerEmails(c.tenant_id) : await platformEmails();
    const href = t ? tenantUrl(t.slug, '/admin#reclamos', t.custom_domain, t.domain_status === 'active') : `${env.appPublicUrl}/superadmin#reclamos`;
    for (const addr of to) {
      await sendEmail({
        to: addr,
        subject: `Falta responder el reclamo ${c.code}: vence el ${fmtDay(new Date(c.due_at))}`,
        html: layout({
          brand: p.tradeName,
          title: 'Tienes un reclamo sin responder',
          intro: `El reclamo ${c.code} de ${c.consumer_name} vence el ${fmtDay(new Date(c.due_at))}. No responder a tiempo puede traer una multa de INDECOPI.`,
          cta: { label: 'Responder ahora', href },
          foot: 'Aviso de date.pe',
        }),
      });
    }
  }
}
