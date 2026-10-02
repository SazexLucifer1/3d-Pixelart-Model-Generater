import type { IndexedImage, SpriteDoc } from '../../shared/sprite/types';
import { toRGBA } from '../../shared/sprite/indexed';

/**
 * Canvas-Hilfen für indizierte Pixelbilder (Editor, Vorschauen, Thumbnails).
 */

export function imageToCanvas(img: IndexedImage, palette: string[]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.w;
  c.height = img.h;
  const ctx = c.getContext('2d')!;
  ctx.putImageData(new ImageData(toRGBA(img, palette) as Uint8ClampedArray<ArrayBuffer>, img.w, img.h), 0, 0);
  return c;
}

/** Thumbnail (PNG-Data-URL) – erstes Bild der ersten Animation, nearest-skaliert. */
export function docThumbnail(doc: SpriteDoc, size = 72): string {
  const img = doc.animations[0]?.frames[0];
  if (!img) return '';
  const src = imageToCanvas(img, doc.palette);
  const c = document.createElement('canvas');
  const scale = Math.max(1, Math.floor(size / Math.max(img.w, img.h)));
  const fit = Math.min(1, size / (Math.max(img.w, img.h) * scale));
  c.width = Math.max(1, Math.round(img.w * scale * fit));
  c.height = Math.max(1, Math.round(img.h * scale * fit));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
