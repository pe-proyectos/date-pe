import { env } from '../env.js';

// WhatsApp Cloud API de Meta. Lista para conectar: sin WHATSAPP_TOKEN y
// WHATSAPP_PHONE_ID no envía nada y los avisos siguen por correo y push.
export const whatsappEnabled = () => !!(env.whatsappToken && env.whatsappPhoneId);

/** Celular peruano a formato internacional sin "+" (51987654321). */
export function waNumber(phone: string): string | null {
  const d = phone.replace(/\D/g, '');
  if (d.length === 9) return `51${d}`;
  if (d.length === 11 && d.startsWith('51')) return d;
  return d.length >= 10 ? d : null;
}

/** Envía una plantilla aprobada en Meta (los mensajes iniciados por el negocio exigen plantilla). */
export async function sendTemplate(phone: string, template: string, params: string[], lang = 'es'): Promise<boolean> {
  if (!whatsappEnabled()) return false;
  const to = waNumber(phone);
  if (!to) return false;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${env.whatsappPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.whatsappToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: template, language: { code: lang }, components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Código de acceso por WhatsApp con la plantilla de autenticación (cuerpo y botón "Copiar código"). */
export async function sendCode(phone: string, code: string): Promise<boolean> {
  if (!whatsappEnabled()) return false;
  const to = waNumber(phone);
  if (!to) return false;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${env.whatsappPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.whatsappToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: env.whatsappOtpTemplate,
          language: { code: 'es' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
          ],
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
