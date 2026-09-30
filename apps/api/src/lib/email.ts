import { Resend } from 'resend';
import { env } from '../env.js';

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  /** Nombre visible del remitente (la barbería); el correo sale de date.pe */
  fromName?: string;
  replyTo?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY no configurada; email omitido:', opts.subject);
    return { ok: false, error: 'resend_not_configured' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: opts.fromName ? `${opts.fromName.replace(/[<>"]/g, '')} <${fromAddress()}>` : env.emailFrom,
      to: opts.to,
      replyTo: opts.replyTo,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function fromAddress() {
  const m = env.emailFrom.match(/<([^>]+)>/);
  return m ? m[1] : env.emailFrom;
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function bookingConfirmationHtml(p: {
  tenantName: string;
  clientName: string;
  serviceName: string;
  staffName: string;
  whenText: string;
}): string {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:10px 0;color:#5f5f66;font-size:14px;border-bottom:1px solid #e6e6e9">${k}</td><td style="padding:10px 0;text-align:right;font-size:14px;color:#0a0a0a;border-bottom:1px solid #e6e6e9">${esc(v)}</td></tr>`;
  return `
  <div style="background:#f4f4f5;padding:32px 16px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
      <p style="margin:0 0 4px;font-size:14px;color:#5f5f66">${esc(p.tenantName)}</p>
      <h1 style="margin:0 0 16px;font-size:24px;letter-spacing:-0.02em;color:#0a0a0a">Tu cita está confirmada</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#27272a">Hola ${esc(p.clientName)}, te esperamos. Estos son los datos de tu reserva:</p>
      <table style="width:100%;border-collapse:collapse">
        ${row('Servicio', p.serviceName)}
        ${row('Barbero', p.staffName)}
        ${row('Cuándo', p.whenText)}
      </table>
      <p style="margin:24px 0 0;font-size:13px;color:#71717a">Reserva hecha con date.pe</p>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Plantilla base: tarjeta blanca sobre gris, un botón negro, sin adornos
// ---------------------------------------------------------------------------
export function layout(p: { brand: string; title: string; intro: string; rows?: Array<[string, string]>; cta?: { label: string; href: string }; secondary?: { label: string; href: string }; foot?: string }): string {
  const rows = (p.rows ?? [])
    .map(([k, v]) => `<tr><td style="padding:10px 0;color:#5f5f66;font-size:14px;border-bottom:1px solid #e6e6e9">${esc(k)}</td><td style="padding:10px 0;text-align:right;font-size:14px;color:#0a0a0a;border-bottom:1px solid #e6e6e9">${esc(v)}</td></tr>`)
    .join('');
  const cta = p.cta
    ? `<p style="margin:28px 0 0"><a href="${esc(p.cta.href)}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 22px;border-radius:999px">${esc(p.cta.label)}</a></p>`
    : '';
  const secondary = p.secondary
    ? `<p style="margin:14px 0 0;font-size:14px"><a href="${esc(p.secondary.href)}" style="color:#0a0a0a">${esc(p.secondary.label)}</a></p>`
    : '';
  return `
  <div style="background:#f4f4f5;padding:32px 16px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
      <p style="margin:0 0 4px;font-size:14px;color:#5f5f66">${esc(p.brand)}</p>
      <h1 style="margin:0 0 16px;font-size:24px;letter-spacing:-0.02em;color:#0a0a0a">${esc(p.title)}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#27272a">${esc(p.intro).replace(/\n/g, '<br>')}</p>
      ${rows ? `<table style="width:100%;border-collapse:collapse">${rows}</table>` : ''}
      ${cta}${secondary}
      <p style="margin:28px 0 0;font-size:13px;color:#71717a">${esc(p.foot ?? 'Reserva hecha con date.pe')}</p>
    </div>
  </div>`;
}
