import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Carga .env desde la raíz del monorepo sin dependencias externas.
const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(here, '../../../.env');

function loadEnvFile(path: string) {
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // sin .env: se usan variables del entorno del sistema
  }
}

loadEnvFile(rootEnv);

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

// En producción el secreto de sesiones es obligatorio y no puede ser el de desarrollo
function jwtSecret(): string {
  const v = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!v || v === 'dev-secret-change-me' || v.length < 32)) {
    throw new Error('JWT_SECRET falta o es inseguro: define uno aleatorio de 32+ caracteres');
  }
  return v || 'dev-secret-change-me';
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  baseDomain: process.env.APP_BASE_DOMAIN ?? 'date.pe',
  databaseUrl: req('DATABASE_URL', 'postgres://datepe:datepe@localhost:5432/datepe'),
  databaseAppUrl: req('DATABASE_APP_URL', 'postgres://datepe_app:datepe_app@localhost:5432/datepe'),
  jwtSecret: jwtSecret(),
  cookieDomain: process.env.COOKIE_DOMAIN ?? '.date.pe',
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? 'date.pe <no-reply@date.pe>',
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL ?? 'https://r2.date.pe',
  r2Endpoint: process.env.R2_S3_ENDPOINT ?? '',
  r2Bucket: process.env.R2_BUCKET ?? 'datepe',
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  // Pagos
  appPublicUrl: process.env.APP_PUBLIC_URL ?? 'http://localhost:3005',
  paymentsDevMode: (process.env.PAYMENTS_DEV_MODE ?? 'true') === 'true',
  culqiPublicKey: process.env.CULQI_PUBLIC_KEY ?? '',
  culqiSecretKey: process.env.CULQI_SECRET_KEY ?? '',
  mercadopagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? '',
  mercadopagoPublicKey: process.env.MERCADOPAGO_PUBLIC_KEY ?? '',
  paypalClientId: process.env.PAYPAL_CLIENT_ID ?? '',
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET ?? '',
  paypalEnv: process.env.PAYPAL_ENV ?? 'sandbox',
  // Dominios propios: carpeta del proveedor de archivos de Traefik e IP pública del servidor
  traefikDynamicDir: process.env.TRAEFIK_DYNAMIC_DIR ?? '/traefik-dynamic',
  serverIp: process.env.SERVER_IP ?? '75.119.145.29',
  // Push, YouTube y WhatsApp (opcionales)
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:hola@date.pe',
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? '',
  whatsappToken: process.env.WHATSAPP_TOKEN ?? '',
  whatsappPhoneId: process.env.WHATSAPP_PHONE_ID ?? '',
  // A quién avisar de nuevas solicitudes de barberías (si está vacío: a los superadmin)
  platformNotifyEmail: process.env.PLATFORM_NOTIFY_EMAIL ?? '',
};
