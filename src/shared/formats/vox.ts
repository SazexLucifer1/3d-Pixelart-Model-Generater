import { VoxelModel } from '../voxel/VoxelModel';

/**
 * MagicaVoxel .vox – Lesen & Schreiben (Version 150).
 *
 * Koordinaten: MagicaVoxel ist Z-up. Abbildung: (x, y, z)_app → (x, -z, y)_vox
 * (eine echte Drehung, also keine Spiegelung des Modells).
 * Farbindex i in .vox verweist auf Paletteneintrag i-1 im RGBA-Chunk.
 */

export function writeVox(model: VoxelModel): Uint8Array {
  const b = model.bounds();
  if (!b) throw new Error('Leeres Modell kann nicht exportiert werden');
  const sx = b.maxX - b.minX + 1, sy = b.maxZ - b.minZ + 1, sz = b.maxY - b.minY + 1;
  if (sx > 256 || sy > 256 || sz > 256) throw new Error('VOX unterstützt maximal 256³ Voxel');
  const voxels: number[] = [];
  let count = 0;
  for (const v of model.values()) {
    voxels.push(v.x - b.minX, b.maxZ - v.z, v.y - b.minY, Math.min(255, v.c + 1));
    count++;
  }
  const size = chunk('SIZE', int32s([sx, sy, sz]));
  const xyzi = chunk('XYZI', concat([int32s([count]), Uint8Array.from(voxels)]));
  const rgba = new Uint8Array(256 * 4);
  model.palette.slice(0, 255).forEach((hex, i) => {
    const n = parseInt(hex.slice(1), 16);
    rgba.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255], i * 4);
  });
  const children = concat([size, xyzi, chunk('RGBA', rgba)]);
  const main = concat([ascii('MAIN'), int32s([0, children.length]), children]);
  return concat([ascii('VOX '), int32s([150]), main]);
}

export function readVox(bytes: Uint8Array): VoxelModel {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const id = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (id(0) !== 'VOX ') throw new Error('Keine MagicaVoxel-Datei');
  const models: { size: number[]; voxels: Uint8Array }[] = [];
  let palette: string[] | null = null;
  let pendingSize: number[] = [0, 0, 0];
  let o = 8;
  // MAIN-Chunk überspringen (nur Header), dann Kinder linear lesen
  o += 12;
  while (o + 12 <= bytes.length) {
    const cid = id(o);
    const n = dv.getInt32(o + 4, true);
    const content = o + 12;
    if (cid === 'SIZE') pendingSize = [dv.getInt32(content, true), dv.getInt32(content + 4, true), dv.getInt32(content + 8, true)];
    else if (cid === 'XYZI') {
      const num = dv.getInt32(content, true);
      models.push({ size: pendingSize, voxels: bytes.slice(content + 4, content + 4 + num * 4) });
    } else if (cid === 'RGBA') {
      palette = [];
      for (let i = 0; i < 255; i++) {
        const p = content + i * 4;
        palette.push('#' + [bytes[p], bytes[p + 1], bytes[p + 2]].map((c) => c.toString(16).padStart(2, '0')).join(''));
      }
    }
    o = content + n; // Kind-Chunks folgen direkt (MAIN wurde bereits übersprungen)
  }
  if (!palette) palette = defaultPalette();
  const model = new VoxelModel(palette);
  model.layers = [];
  models.forEach((m, mi) => {
    const layer = model.addLayer(models.length > 1 ? `Modell ${mi + 1}` : 'Import');
    for (let i = 0; i < m.voxels.length; i += 4) {
      const [x, y, z, c] = [m.voxels[i], m.voxels[i + 1], m.voxels[i + 2], m.voxels[i + 3]];
      model.set(x, z, -y, Math.max(0, c - 1), 'diffuse', layer.id);
    }
  });
  if (model.layers.length === 0) model.addLayer('Import');
  model.compactPalette();
  model.normalizePosition();
  return model;
}

/** Einfache Ersatzpalette (Graustufen + Farbkreis), falls keine RGBA-Daten vorhanden. */
function defaultPalette(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 255; i++) {
    const h = (i * 137) % 360, l = 30 + ((i * 7) % 50);
    out.push(hsl(h, 60, l));
  }
  return out;
}

function hsl(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return '#' + [f(0), f(8), f(4)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

function chunk(cid: string, content: Uint8Array): Uint8Array {
  return concat([ascii(cid), int32s([content.length, 0]), content]);
}

function ascii(s: string): Uint8Array {
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function int32s(vals: number[]): Uint8Array {
  const out = new Uint8Array(vals.length * 4);
  const dv = new DataView(out.buffer);
  vals.forEach((v, i) => dv.setInt32(i * 4, v, true));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
