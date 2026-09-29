import { Resend } from 'resend';
import { env } from '../env.js';

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY no configurada; email omitido:', opts.subject);
    return { ok: false, error: 'resend_not_configured' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: env.emailFrom,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function bookingConfirmationHtml(p: {
  tenantName: string;
  clientName: string;
  serviceName: string;
  staffName: string;
  whenText: string;
}): string {
  return `
  <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
    <h2>¡Reserva confirmada en ${p.tenantName}!</h2>
    <p>Hola ${p.clientName}, tu cita quedó registrada:</p>
    <ul>
      <li><b>Servicio:</b> ${p.serviceName}</li>
      <li><b>Barbero:</b> ${p.staffName}</li>
      <li><b>Cuándo:</b> ${p.whenText}</li>
    </ul>
    <p>Te esperamos. — ${p.tenantName}</p>
  </div>`;
}
