import type { IndexedImage, SpriteDoc } from './types';
import { hexToRgb, nearestColor } from '../palette/color';

/**
 * Hilfsfunktionen für indizierte Pixelbilder (0 = transparent).
 * Werden von Generatoren, Editor und Exportern gemeinsam genutzt.
 */

export function createImage(w: number, h: number): IndexedImage {
  return { w, h, data: new Uint8Array(w * h) };
}

export function cloneImage(img: IndexedImage): IndexedImage {
  return { w: img.w, h: img.h, data: new Uint8Array(img.data) };
}

export const getPx = (img: IndexedImage, x: number, y: number) => (x < 0 || y < 0 || x >= img.w || y >= img.h ? 0 : img.data[y * img.w + x]);

export function setPx(img: IndexedImage, x: number, y: number, v: number): void {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  img.data[y * img.w + x] = v;
}

/** Bresenham-Linie. */
export function drawLine(img: IndexedImage, x0: number, y0: number, x1: number, y1: number, v: number, plot = setPx): void {
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(img, x0, y0, v);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

export function drawRect(img: IndexedImage, x0: number, y0: number, x1: number, y1: number, v: number, filled = false): void {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  for (let y = ay; y <= by; y++)
    for (let x = ax; x <= bx; x++) if (filled || x === ax || x === bx || y === ay || y === by) setPx(img, x, y, v);
}

export function fillCircle(img: IndexedImage, cx: number, cy: number, r: number, v: number): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) setPx(img, x, y, v);
}

/** Flutfüllung (4er-Nachbarschaft). */
export function floodFill(img: IndexedImage, x: number, y: number, v: number): void {
  const target = getPx(img, x, y);
  if (target === v || x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    if (getPx(img, cx, cy) !== target || cx < 0 || cy < 0 || cx >= img.w || cy >= img.h) continue;
    img.data[cy * img.w + cx] = v;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}

/** Verschiebt den Bildinhalt (mit Umlauf, optional). */
export function shiftImage(img: IndexedImage, dx: number, dy: number, wrap = false): IndexedImage {
  const out = createImage(img.w, img.h);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      let nx = x + dx, ny = y + dy;
      if (wrap) { nx = (nx % img.w + img.w) % img.w; ny = (ny % img.h + img.h) % img.h; }
      setPx(out, nx, ny, img.data[y * img.w + x]);
    }
  return out;
}

export function flipH(img: IndexedImage): IndexedImage {
  const out = createImage(img.w, img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) out.data[y * img.w + (img.w - 1 - x)] = img.data[y * img.w + x];
  return out;
}

/** Kopiert `src` an Position (ox, oy) in `dst` (transparente Pixel bleiben). */
export function blit(dst: IndexedImage, src: IndexedImage, ox: number, oy: number, opaqueOnly = true): void {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const v = src.data[y * src.w + x];
      if (opaqueOnly && !v) continue;
      setPx(dst, ox + x, oy + y, v);
    }
}

/** Indiziertes Bild → RGBA (für Canvas/PNG). */
export function toRGBA(img: IndexedImage, palette: string[]): Uint8ClampedArray {
  const lut = palette.map(hexToRgb);
  const out = new Uint8ClampedArray(img.w * img.h * 4);
  for (let i = 0; i < img.data.length; i++) {
    const v = img.data[i];
    if (!v) continue;
    const c = lut[v - 1] ?? [255, 0, 255];
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** RGBA → indiziert (Farben werden auf die Palette abgebildet bzw. ergänzt). */
export function fromRGBA(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, palette: string[], extend = true, maxColors = 255): IndexedImage {
  const img = createImage(w, h);
  const cache = new Map<string, number>();
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    const hex = '#' + [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]].map((c) => c.toString(16).padStart(2, '0')).join('');
    let idx = cache.get(hex);
    if (idx === undefined) {
      let pi = palette.indexOf(hex);
      if (pi < 0) {
        if (extend && palette.length < maxColors) {
          palette.push(hex);
          pi = palette.length - 1;
        } else pi = palette.indexOf(nearestColor(hex, palette));
      }
      idx = pi + 1;
      cache.set(hex, idx);
    }
    img.data[i] = idx;
  }
  return img;
}

/** Hex-Pixel (null = transparent) → indiziert mit gegebener Palette. */
export function indexFromHex(pixels: (string | null)[], w: number, h: number, palette: string[]): IndexedImage {
  const img = createImage(w, h);
  const map = new Map<string, number>();
  palette.forEach((c, i) => map.set(c, i + 1));
  for (let i = 0; i < pixels.length; i++) {
    const c = pixels[i];
    if (!c) continue;
    let idx = map.get(c);
    if (!idx) {
      idx = palette.indexOf(nearestColor(c, palette)) + 1;
      map.set(c, idx);
    }
    img.data[i] = idx;
  }
  return img;
}

/** Zählt die tatsächlich genutzten Farben eines Dokuments. */
export function usedColors(doc: SpriteDoc): Set<number> {
  const used = new Set<number>();
  for (const a of doc.animations) for (const f of a.frames) for (const v of f.data) if (v) used.add(v);
  return used;
}
