import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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
  const safeFolder = ['staff', 'services', 'branding'].includes(params.folder) ? params.folder : 'misc';
  const key = `tenants/${params.tenantId}/${safeFolder}/${randomUUID()}.${ext}`;
  const cmd = new PutObjectCommand({ Bucket: env.r2Bucket, Key: key, ContentType: params.contentType });
  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: 300 });
  return { uploadUrl, publicUrl: `${env.r2PublicBaseUrl}/${key}`, key };
}
