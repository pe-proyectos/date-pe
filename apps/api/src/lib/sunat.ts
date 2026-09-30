import type { Sql } from '../db.js';

// Comprobantes electrónicos (boleta o factura) vía Nubefact, un PSE/OSE autorizado
// por SUNAT. Sin credenciales se registra un comprobante "simulado" para probar.
export interface ReceiptInput {
  appointmentId: string;
  kind: 'boleta' | 'factura';
  docType: '1' | '6' | '-'; // DNI, RUC, sin documento
  doc?: string;
  name?: string;
  address?: string;
  email?: string;
}

interface Settings {
  sunat_enabled: boolean;
  sunat_ruc: string | null;
  sunat_serie_boleta: string;
  sunat_serie_factura: string;
  nubefact_url: string | null;
  nubefact_token: string | null;
}

const IGV = 0.18;
const two = (n: number) => Math.round(n * 100) / 100;

export async function issueReceipt(sql: Sql, input: ReceiptInput): Promise<{ ok: true; receipt: Record<string, unknown> } | { ok: false; error: string }> {
  if (input.kind === 'factura' && (input.docType !== '6' || !/^\d{11}$/.test(input.doc ?? ''))) return { ok: false, error: 'factura_requiere_ruc' };
  if (input.docType === '1' && !/^\d{8}$/.test(input.doc ?? '')) return { ok: false, error: 'dni_invalido' };

  const st = (await sql<Settings>('SELECT sunat_enabled, sunat_ruc, sunat_serie_boleta, sunat_serie_factura, nubefact_url, nubefact_token FROM tenant_settings')).rows[0];
  if (!st) return { ok: false, error: 'sin_configuracion' };

  const appt = (
    await sql<{ price_cents: number; client_name: string | null; client_email: string | null; status: string }>(
      `SELECT a.price_cents, a.status, c.name AS client_name, c.email AS client_email
         FROM appointments a LEFT JOIN clients c ON c.id = a.client_id WHERE a.id = $1`,
      [input.appointmentId],
    )
  ).rows[0];
  if (!appt) return { ok: false, error: 'cita_no_encontrada' };
  if (appt.price_cents <= 0) return { ok: false, error: 'monto_cero' };
  if (!['confirmed', 'completed'].includes(appt.status)) return { ok: false, error: 'cita_no_atendida' };
  const dup = await sql("SELECT 1 FROM receipts WHERE appointment_id = $1 AND status IN ('issued','simulated')", [input.appointmentId]);
  if (dup.rows.length > 0) return { ok: false, error: 'ya_emitido' };

  const lines = (
    await sql<{ name: string; price_cents: number }>(
      `SELECT sv.name, aps.price_cents FROM appointment_services aps JOIN services sv ON sv.id = aps.service_id WHERE aps.appointment_id = $1`,
      [input.appointmentId],
    )
  ).rows;
  // El total cobrado manda (incluye descuentos): prorrateamos si hay varias líneas
  const listSum = lines.reduce((s, l) => s + l.price_cents, 0) || appt.price_cents;
  const items = (lines.length ? lines : [{ name: 'Servicio de barbería', price_cents: appt.price_cents }]).map((l) => {
    const total = two(((l.price_cents / listSum) * appt.price_cents) / 100);
    const valor = two(total / (1 + IGV));
    return { name: l.name, total, valor, igv: two(total - valor) };
  });
  const total = two(appt.price_cents / 100);
  const gravada = two(items.reduce((s, i) => s + i.valor, 0));
  const igv = two(total - gravada);

  const live = !!(st.sunat_enabled && st.nubefact_url && st.nubefact_token);
  // Los de prueba llevan su propia serie para no gastar la numeración real
  const serie = `${live ? '' : 'PRUEBA-'}${input.kind === 'factura' ? st.sunat_serie_factura : st.sunat_serie_boleta}`;
  const next = (await sql<{ n: number }>('SELECT COALESCE(max(numero), 0) + 1 AS n FROM receipts WHERE serie = $1', [serie])).rows[0].n;
  const customerName = input.name?.trim() || appt.client_name || 'Cliente';

  let status: 'issued' | 'simulated' | 'error' = 'simulated';
  let pdfUrl: string | null = null;
  let message: string | null = 'Comprobante de prueba: configura Nubefact para enviarlo a SUNAT.';

  if (live) {
    const now = new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    try {
      const res = await fetch(st.nubefact_url!, {
        method: 'POST',
        headers: { Authorization: `Token token="${st.nubefact_token}"`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operacion: 'generar_comprobante',
          tipo_de_comprobante: input.kind === 'factura' ? 1 : 2,
          serie,
          numero: next,
          sunat_transaction: 1,
          cliente_tipo_de_documento: input.docType,
          cliente_numero_de_documento: input.doc || '-',
          cliente_denominacion: customerName,
          cliente_direccion: input.address ?? '',
          cliente_email: input.email || appt.client_email || '',
          fecha_de_emision: now,
          moneda: 1,
          porcentaje_de_igv: 18.0,
          total_gravada: gravada,
          total_igv: igv,
          total,
          enviar_automaticamente_a_la_sunat: true,
          enviar_automaticamente_al_cliente: !!(input.email || appt.client_email),
          items: items.map((i, k) => ({
            unidad_de_medida: 'ZZ',
            codigo: `S${k + 1}`,
            descripcion: i.name,
            cantidad: 1,
            valor_unitario: i.valor,
            precio_unitario: i.total,
            subtotal: i.valor,
            tipo_de_igv: 1,
            igv: i.igv,
            total: i.total,
            anticipo_regularizacion: false,
          })),
        }),
      });
      const data = (await res.json()) as { enlace_del_pdf?: string; aceptada_por_sunat?: boolean; sunat_description?: string; errors?: string };
      if (!res.ok || data.errors) {
        status = 'error';
        message = data.errors ?? `Nubefact respondió ${res.status}`;
      } else {
        status = 'issued';
        pdfUrl = data.enlace_del_pdf ?? null;
        message = data.sunat_description ?? (data.aceptada_por_sunat ? 'Aceptada por SUNAT' : 'Enviada a SUNAT');
      }
    } catch (err) {
      status = 'error';
      message = (err as Error).message;
    }
  }

  const { rows } = await sql(
    `INSERT INTO receipts (tenant_id, appointment_id, kind, serie, numero, customer_doc_type, customer_doc, customer_name, total_cents, status, pdf_url, sunat_message)
     VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, kind, serie, numero, customer_name, total_cents, status, pdf_url, sunat_message, created_at`,
    [input.appointmentId, input.kind, serie, next, input.docType, input.doc ?? null, customerName, appt.price_cents, status, pdfUrl, message],
  );
  // Un intento fallido no consume el número: se puede reintentar
  if (status === 'error') {
    await sql("UPDATE receipts SET numero = -floor(random() * 1e9)::int WHERE id = $1", [rows[0].id]);
    return { ok: false, error: message ?? 'error_sunat' };
  }
  return { ok: true, receipt: rows[0] };
}
