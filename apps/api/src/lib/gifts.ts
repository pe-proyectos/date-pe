import { admin } from '../db.js';
import { sendEmail, layout } from './email.js';
import { tenantUrl } from './notify.js';

// Envía la gift card a quien la recibe (ahora, o en la fecha elegida por el comprador).
export async function deliverGiftCard(id: string) {
  const { rows } = await admin<{ id: string; code: string; initial_cents: number; buyer_name: string | null; buyer_email: string | null; recipient_name: string | null; recipient_email: string | null; message: string | null; deliver_at: Date | null; tenant_name: string; slug: string }>(
    `SELECT g.id, g.code, g.initial_cents, g.buyer_name, g.buyer_email, g.recipient_name, g.recipient_email, g.message, g.deliver_at, t.name AS tenant_name, t.slug
       FROM gift_cards g JOIN tenants t ON t.id = g.tenant_id WHERE g.id = $1 AND g.paid AND g.delivered_at IS NULL`,
    [id],
  );
  const g = rows[0];
  if (!g || !g.recipient_email) return;
  if (g.deliver_at && g.deliver_at.getTime() > Date.now()) return; // la entrega el planificador
  const amount = `S/ ${(g.initial_cents / 100).toFixed(2)}`;
  await sendEmail({
    to: g.recipient_email,
    fromName: g.tenant_name,
    replyTo: g.buyer_email ?? undefined,
    subject: `${g.buyer_name ?? 'Alguien'} te regaló ${amount} en ${g.tenant_name}`,
    html: layout({
      brand: g.tenant_name,
      title: `Tienes un regalo de ${amount}`,
      intro: `${g.recipient_name ? `Hola ${g.recipient_name}, ` : ''}${g.buyer_name ?? 'Alguien'} te regaló una gift card para ${g.tenant_name}.${g.message ? ` Te dejó este mensaje: "${g.message}"` : ''} Usa el código al reservar o muéstralo en caja.`,
      rows: [['Código', g.code], ['Saldo', amount]],
      cta: { label: 'Reservar mi cita', href: tenantUrl(g.slug, `/reservar?gift=${g.code}`) },
    }),
  });
  await admin('UPDATE gift_cards SET delivered_at = now() WHERE id = $1', [id]);
  if (g.buyer_email && g.buyer_email !== g.recipient_email) {
    void sendEmail({
      to: g.buyer_email,
      fromName: g.tenant_name,
      subject: `Tu gift card para ${g.recipient_name ?? 'tu regalo'} ya fue entregada`,
      html: layout({ brand: g.tenant_name, title: 'Regalo entregado', intro: `Le enviamos la gift card de ${amount} a ${g.recipient_email}. Gracias por tu compra.` }),
    });
  }
}
