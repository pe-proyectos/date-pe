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

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  baseDomain: process.env.APP_BASE_DOMAIN ?? 'date.pe',
  databaseUrl: req('DATABASE_URL', 'postgres://datepe:datepe@localhost:5432/datepe'),
  databaseAppUrl: req('DATABASE_APP_URL', 'postgres://datepe_app:datepe_app@localhost:5432/datepe'),
  jwtSecret: req('JWT_SECRET', 'dev-secret-change-me'),
  cookieDomain: process.env.COOKIE_DOMAIN ?? '.date.pe',
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? 'date.pe <no-reply@date.pe>',
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL ?? 'https://r2.date.pe',
  r2Endpoint: process.env.R2_S3_ENDPOINT ?? '',
  r2Bucket: process.env.R2_BUCKET ?? 'datepe',
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
};
