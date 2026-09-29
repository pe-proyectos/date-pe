import { API_BASE_CLIENT } from './config';

// Sube una imagen a R2 vía URL prefirmada y devuelve la URL pública (r2.date.pe).
export async function uploadImage(
  file: File,
  folder: 'staff' | 'services' | 'branding',
  headers: Record<string, string>,
): Promise<string> {
  const presign = await fetch(`${API_BASE_CLIENT}/api/admin/uploads/presign`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ folder, contentType: file.type }),
  });
  if (!presign.ok) throw new Error('No se pudo preparar la subida');
  const { uploadUrl, publicUrl } = await presign.json();

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!put.ok) throw new Error('No se pudo subir la imagen');
  return publicUrl;
}
