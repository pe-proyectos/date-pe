import { API_BASE_CLIENT } from './config';

export type UploadFolder = 'staff' | 'services' | 'branding' | 'gallery' | 'clients' | 'products' | 'receipts' | 'expenses' | 'tv';

/** Reduce la foto en el propio celular (máx. 1600 px, WebP) antes de subirla: sube rápido con datos móviles. */
async function compress(file: File, maxSide = 1600): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 600_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.84));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

// Sube una imagen (o un PDF de comprobante) a R2 vía URL prefirmada y devuelve la URL pública (r2.date.pe).
export async function uploadImage(file: File, folder: UploadFolder, headers: Record<string, string>): Promise<string> {
  const body = file.type === 'application/pdf' ? file : await compress(file);
  const contentType = body instanceof File ? body.type : 'image/webp';
  const presign = await fetch(`${API_BASE_CLIENT}/api/admin/uploads/presign`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ folder, contentType }),
  });
  if (!presign.ok) throw new Error('No se pudo preparar la subida');
  const { uploadUrl, publicUrl } = await presign.json();

  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body });
  if (!put.ok) throw new Error('No se pudo subir el archivo');
  return publicUrl;
}
