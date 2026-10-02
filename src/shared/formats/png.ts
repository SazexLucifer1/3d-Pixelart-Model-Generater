/**
 * Minimaler PNG-Decoder (8 Bit, nicht-interlaced; Graustufen, RGB, RGBA,
 * Palette). Wird im Backend benutzt, um Bilder von Bild-KIs (z.B. Stable
 * Diffusion) ohne zusätzliche Abhängigkeiten in Voxel umzuwandeln.
 * Die Dekompression (zlib) wird als Funktion übergeben (Node: inflateSync).
 */
export interface DecodedImage {
  width: number;
  height: number;
  data: Uint8Array; // RGBA
}

export function decodePng(bytes: Uint8Array, inflate: (data: Uint8Array) => Uint8Array): DecodedImage {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!sig.every((b, i) => bytes[i] === b)) throw new Error('Keine PNG-Datei');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 8;
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (o < bytes.length) {
    const len = dv.getUint32(o);
    const t = String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7]);
    const d = bytes.subarray(o + 8, o + 8 + len);
    if (t === 'IHDR') {
      width = dv.getUint32(o + 8);
      height = dv.getUint32(o + 12);
      depth = d[8];
      type = d[9];
      interlace = d[12];
    } else if (t === 'PLTE') palette = d;
    else if (t === 'tRNS') trns = d;
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    o += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error('Nur 8-Bit-PNGs ohne Interlacing werden unterstützt');
  const channels = type === 0 ? 1 : type === 2 ? 3 : type === 3 ? 1 : type === 4 ? 2 : 4;
  const total = idat.reduce((n, c) => n + c.length, 0);
  const joined = new Uint8Array(total);
  let p = 0;
  for (const c of idat) {
    joined.set(c, p);
    p += c.length;
  }
  const raw = inflate(joined);
  const stride = width * channels;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = v & 255;
    }
  }
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    let r: number, g: number, b: number, a = 255;
    if (type === 0) r = g = b = pixels[s];
    else if (type === 4) { r = g = b = pixels[s]; a = pixels[s + 1]; }
    else if (type === 3) {
      const idx = pixels[s];
      r = palette![idx * 3]; g = palette![idx * 3 + 1]; b = palette![idx * 3 + 2];
      a = trns && idx < trns.length ? trns[idx] : 255;
    } else {
      r = pixels[s]; g = pixels[s + 1]; b = pixels[s + 2];
      if (type === 6) a = pixels[s + 3];
    }
    out.set([r, g, b, a], i * 4);
  }
  return { width, height, data: out };
}

/** Nearest-Neighbor-Verkleinerung (für Pixel-Art-Raster). */
export function resizeNearest(img: DecodedImage, maxSize: number): DecodedImage {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x + 0.5) / scale));
      const sy = Math.min(img.height - 1, Math.floor((y + 0.5) / scale));
      out.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (y * w + x) * 4);
    }
  return { width: w, height: h, data: out };
}
