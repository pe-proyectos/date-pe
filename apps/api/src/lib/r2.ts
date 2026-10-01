import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { env } from '../env.js';

const client =
  env.r2Endpoint && env.r2AccessKeyId
    ? new S3Client({
        region: 'auto',
        endpoint: env.r2Endpoint,
        credentials: { accessKeyId: env.r2AccessKeyId, secretAccessKey: env.r2SecretAccessKey },
      })
    : null;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
};

export function r2Configured(): boolean {
  return client !== null;
}

/** Genera una URL prefirmada para subir un objeto y su URL pública en r2.date.pe. */
export async function presignUpload(params: {
  tenantId: string;
  folder: string; // staff | services | branding
  contentType: string;
}): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  if (!client) throw new Error('r2_no_configurado');
  const ext = EXT[params.contentType];
  if (!ext) throw new Error('tipo_no_permitido');
  const safeFolder = ['staff', 'services', 'branding', 'gallery', 'clients', 'products', 'receipts', 'expenses', 'tv'].includes(params.folder) ? params.folder : 'misc';
  // PDF solo para comprobantes
  if (params.contentType === 'application/pdf' && !['receipts', 'expenses'].includes(safeFolder)) throw new Error('tipo_no_permitido');
  const key = `tenants/${params.tenantId}/${safeFolder}/${randomUUID()}.${ext}`;
  const cmd = new PutObjectCommand({ Bucket: env.r2Bucket, Key: key, ContentType: params.contentType });
  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: 300 });
  return { uploadUrl, publicUrl: `${env.r2PublicBaseUrl}/${key}`, key };
}

/**
 * Captura del pago directo (Yape o Plin) que sube el cliente. Va en una carpeta aparte y
 * con nombre imposible de adivinar; la barbería la ve a través de la API, nunca por un enlace público.
 */
export async function presignReceipt(tenantId: string, contentType: string): Promise<{ uploadUrl: string; key: string }> {
  if (!client) throw new Error('r2_no_configurado');
  const ext = EXT[contentType];
  if (!ext || contentType === 'application/pdf') throw new Error('tipo_no_permitido');
  const key = `pagos/${tenantId}/${randomUUID()}.${ext}`;
  const cmd = new PutObjectCommand({ Bucket: env.r2Bucket, Key: key, ContentType: contentType });
  return { uploadUrl: await getSignedUrl(client, cmd, { expiresIn: 600 }), key };
}

/** Lee un objeto del bucket (para servir archivos mientras r2.date.pe no esté conectado). */
export async function getObject(key: string) {
  if (!client) throw new Error('r2_no_configurado');
  const out = await client.send(new GetObjectCommand({ Bucket: env.r2Bucket, Key: key }));
  return { body: out.Body as NodeJS.ReadableStream, contentType: out.ContentType ?? 'application/octet-stream', length: out.ContentLength, etag: out.ETag };
}
