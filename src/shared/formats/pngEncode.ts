import { zlibSync } from 'fflate';
import type { IndexedImage } from '../sprite/types';
import { hexToRgb } from '../palette/color';

/**
 * PNG-Encoder ohne Canvas (läuft in Browser und Node).
 * Indizierte PNGs (Farbtyp 3) erhalten die Palette exakt – ideal für
 * Pixel-Art: Index 0 ist transparent (tRNS), Engines und Aseprite lesen die
 * Farben unverändert.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array, crc = 0xffffffff): number {
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function ihdr(w: number, h: number, colorType: number): Uint8Array {
  const d = new Uint8Array(13);
  const dv = new DataView(d.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  d[8] = 8;
  d[9] = colorType;
  return d;
}

/** Indiziertes Bild → PNG (Farbtyp 3, 8 Bit, Index 0 transparent). */
export function encodeIndexedPng(img: IndexedImage, palette: string[]): Uint8Array {
  const n = Math.min(256, palette.length + 1);
  const plte = new Uint8Array(n * 3);
  const trns = new Uint8Array(n).fill(255);
  trns[0] = 0;
  palette.slice(0, 255).forEach((c, i) => plte.set(hexToRgb(c), (i + 1) * 3));
  const raw = new Uint8Array(img.h * (img.w + 1));
  for (let y = 0; y < img.h; y++) raw.set(img.data.subarray(y * img.w, (y + 1) * img.w), y * (img.w + 1) + 1);
  return concat([SIGNATURE, chunk('IHDR', ihdr(img.w, img.h, 3)), chunk('PLTE', plte), chunk('tRNS', trns), chunk('IDAT', zlibSync(raw, { level: 9 })), chunk('IEND', new Uint8Array())]);
}

/** RGBA → PNG (Farbtyp 6). */
export function encodeRgbaPng(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): Uint8Array {
  const raw = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  return concat([SIGNATURE, chunk('IHDR', ihdr(w, h, 6)), chunk('IDAT', zlibSync(raw, { level: 9 })), chunk('IEND', new Uint8Array())]);
}
