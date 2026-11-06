// Client-side image compression before upload: phone photos are 3–12 MB; the bucket takes 10 MB
// and underwriters need legibility, not 48 megapixels. Max 2000 px on the long side, JPEG q 0.85.
import { fitScale } from './signature';

export const MAX_IMAGE_SIDE = 2000;
export const JPEG_QUALITY = 0.85;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const isImage = (f: { type: string }): boolean => f.type.startsWith('image/');
export const isPdf = (f: { type: string; name?: string }): boolean =>
  f.type === 'application/pdf' || /\.pdf$/i.test(f.name ?? '');

/** Output name for a compressed photo: keeps the stem, switches the extension to .jpg. */
export function jpegName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '') || 'photo';
  return `${stem}.jpg`;
}

/**
 * Returns a JPEG no larger than MAX_IMAGE_SIDE, or the original when it is already small (and a
 * JPEG/PNG), or when the browser cannot decode it (the server still checks the type).
 */
export async function compressImage(file: File): Promise<File> {
  if (!isImage(file) || file.type === 'image/gif') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const scale = fitScale(bitmap.width, bitmap.height, MAX_IMAGE_SIDE, MAX_IMAGE_SIDE);
  if (
    scale === 1 &&
    file.size < 1.5 * 1024 * 1024 &&
    (file.type === 'image/jpeg' || file.type === 'image/png')
  ) {
    bitmap.close();
    return file;
  }
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  // JPEG has no transparency: paint white first so transparent PNGs do not turn black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob || (blob.size >= file.size && scale === 1)) return file;
  return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: Date.now() });
}
