import { env } from '../env.js';

export type Provider = 'mercadopago' | 'paypal' | 'culqi';

export interface IntentInput {
  amountCents: number; // en céntimos de sol (PEN)
  description: string;
  email?: string;
  externalReference: string; // paymentId
}

export interface IntentResult {
  provider: Provider;
  redirectUrl?: string; // MP init_point / PayPal approve
  providerRef?: string; // preference id / order id
  clientConfig?: Record<string, unknown>; // Culqi: public key + monto para Culqi.js
  devSimulated?: boolean;
}

const soles = (cents: number) => cents / 100;

// --------------------------- MercadoPago ---------------------------
async function mercadopagoIntent(input: IntentInput): Promise<IntentResult> {
  if (!env.mercadopagoAccessToken) return { provider: 'mercadopago', devSimulated: true };
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.mercadopagoAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [
        {
          title: input.description,
          quantity: 1,
          currency_id: 'PEN',
          unit_price: soles(input.amountCents),
        },
      ],
      external_reference: input.externalReference,
      payer: input.email ? { email: input.email } : undefined,
      back_urls: {
        success: `${env.appPublicUrl}/pago/ok`,
        failure: `${env.appPublicUrl}/pago/error`,
        pending: `${env.appPublicUrl}/pago/pendiente`,
      },
      auto_return: 'approved',
      notification_url: `${env.appPublicUrl}/api/payments/webhook/mercadopago`,
    }),
  });
  if (!res.ok) throw new Error(`mercadopago ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id: string; init_point: string };
  return { provider: 'mercadopago', redirectUrl: data.init_point, providerRef: data.id };
}

// ------------------------------ PayPal -----------------------------
function paypalBase() {
  return env.paypalEnv === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

async function paypalToken(): Promise<string> {
  const creds = Buffer.from(`${env.paypalClientId}:${env.paypalClientSecret}`).toString('base64');
  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`paypal token ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function paypalIntent(input: IntentInput): Promise<IntentResult> {
  if (!env.paypalClientId || !env.paypalClientSecret) return { provider: 'paypal', devSimulated: true };
  const token = await paypalToken();
  // PayPal Perú liquida en USD; el monto es referencial de la seña.
  const res = await fetch(`${paypalBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          custom_id: input.externalReference,
          description: input.description,
          amount: { currency_code: 'USD', value: soles(input.amountCents).toFixed(2) },
        },
      ],
      application_context: {
        return_url: `${env.appPublicUrl}/pago/ok`,
        cancel_url: `${env.appPublicUrl}/pago/error`,
      },
    }),
  });
  if (!res.ok) throw new Error(`paypal order ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id: string; links: Array<{ rel: string; href: string }> };
  const approve = data.links.find((l) => l.rel === 'approve')?.href;
  return { provider: 'paypal', redirectUrl: approve, providerRef: data.id };
}

export async function paypalCapture(orderId: string): Promise<boolean> {
  if (!env.paypalClientId) return false;
  const token = await paypalToken();
  const res = await fetch(`${paypalBase()}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { status: string };
  return data.status === 'COMPLETED';
}

// ------------------------------- Culqi ------------------------------
// Culqi tokeniza la tarjeta/Yape en el frontend (Culqi.js). Aquí solo
// devolvemos la llave pública y luego cobramos con el token recibido.
function culqiIntent(input: IntentInput): IntentResult {
  if (!env.culqiSecretKey || !env.culqiPublicKey) return { provider: 'culqi', devSimulated: true };
  return {
    provider: 'culqi',
    clientConfig: { publicKey: env.culqiPublicKey, amountCents: input.amountCents, currency: 'PEN' },
  };
}

export async function culqiCharge(params: {
  token: string;
  amountCents: number;
  email: string;
}): Promise<{ ok: boolean; ref?: string }> {
  if (!env.culqiSecretKey) return { ok: false };
  const res = await fetch('https://api.culqi.com/v2/charges', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.culqiSecretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: params.amountCents, // Culqi usa céntimos
      currency_code: 'PEN',
      email: params.email,
      source_id: params.token,
    }),
  });
  if (!res.ok) return { ok: false };
  const data = (await res.json()) as { id: string };
  return { ok: true, ref: data.id };
}

// ----------------------------- Dispatcher ---------------------------
export async function createIntent(provider: Provider, input: IntentInput): Promise<IntentResult> {
  switch (provider) {
    case 'mercadopago':
      return mercadopagoIntent(input);
    case 'paypal':
      return paypalIntent(input);
    case 'culqi':
      return culqiIntent(input);
    default:
      throw new Error('proveedor_no_soportado');
  }
}
