import { VoxelModel } from '../voxel/VoxelModel';
import { reduceColors, rgbToHex } from '../palette/color';

/**
 * Brücken zu bild- und mesh-basierten KI-Modellen:
 *
 *  - `voxelizeTriangles`: Dreiecksnetz (z.B. aus einem Text-zu-3D-Modell oder
 *    einer OBJ-Datei) → Voxelmodell
 *  - `imageToVoxels`: Pixelbild (z.B. aus Stable Diffusion oder ein Sprite) →
 *    extrudiertes/aufgeblasenes Voxelmodell
 *
 * Beide begrenzen die Palette, damit das Ergebnis Pixel-Art-tauglich bleibt.
 */

export interface TriangleMesh {
  /** Dreiecke: je 9 Zahlen (3 Eckpunkte). */
  positions: number[];
  /** Optionale Farbe je Eckpunkt (0..1, je 9 Zahlen pro Dreieck). */
  colors?: number[];
}

export function voxelizeTriangles(mesh: TriangleMesh, targetSize: number, maxColors = 32, defaultColor = '#b0b0b8'): VoxelModel {
  const p = mesh.positions;
  if (p.length < 9) throw new Error('Mesh enthält keine Dreiecke');
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]);
    minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1]);
    minZ = Math.min(minZ, p[i + 2]); maxZ = Math.max(maxZ, p[i + 2]);
  }
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  const s = (targetSize - 1) / extent;
  const cells = new Map<string, { r: number; g: number; b: number; n: number }>();
  const add = (x: number, y: number, z: number, r: number, g: number, b: number) => {
    const k = `${x},${y},${z}`;
    const c = cells.get(k);
    if (c) {
      c.r += r; c.g += g; c.b += b; c.n++;
    } else cells.set(k, { r, g, b, n: 1 });
  };
  const def = parseInt(defaultColor.slice(1), 16);
  const dr = ((def >> 16) & 255) / 255, dg = ((def >> 8) & 255) / 255, db = (def & 255) / 255;
  for (let t = 0; t < p.length; t += 9) {
    const a = [(p[t] - minX) * s, (p[t + 1] - minY) * s, (p[t + 2] - minZ) * s];
    const b = [(p[t + 3] - minX) * s, (p[t + 4] - minY) * s, (p[t + 5] - minZ) * s];
    const c = [(p[t + 6] - minX) * s, (p[t + 7] - minY) * s, (p[t + 8] - minZ) * s];
    const len = Math.max(dist(a, b), dist(b, c), dist(a, c));
    const n = Math.max(1, Math.ceil(len * 2));
    const col = mesh.colors;
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        const x = Math.round(a[0] * w + b[0] * u + c[0] * v);
        const y = Math.round(a[1] * w + b[1] * u + c[1] * v);
        const z = Math.round(a[2] * w + b[2] * u + c[2] * v);
        if (col) {
          add(x, y, z, col[t] * w + col[t + 3] * u + col[t + 6] * v, col[t + 1] * w + col[t + 4] * u + col[t + 7] * v, col[t + 2] * w + col[t + 5] * u + col[t + 8] * v);
        } else add(x, y, z, dr, dg, db);
      }
  }
  return finish(cells, maxColors, 'Voxelisiertes Mesh');
}

export interface ImageVoxelOptions {
  /** Dicke-Modus: flach extrudiert oder "aufgeblasen" (Kissenform). */
  mode: 'flat' | 'inflate';
  depth: number;
  alphaThreshold?: number;
  maxColors?: number;
  /** Hintergrund per Eckfarbe entfernen, wenn das Bild keinen Alphakanal nutzt. */
  keyBackground?: boolean;
}

/** RGBA-Pixel (Zeilen von oben) → Voxelmodell, Front zeigt nach +z. */
export function imageToVoxels(data: Uint8Array | Uint8ClampedArray, w: number, h: number, opts: ImageVoxelOptions): VoxelModel {
  const thr = opts.alphaThreshold ?? 128;
  const solid = new Uint8Array(w * h);
  let usesAlpha = false;
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] < 250) usesAlpha = true;
  const key = !usesAlpha && opts.keyBackground !== false ? [data[0], data[1], data[2]] : null;
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    const isKey = key && Math.abs(r - key[0]) + Math.abs(g - key[1]) + Math.abs(b - key[2]) < 40;
    solid[i] = a >= thr && !isKey ? 1 : 0;
  }
  // Abstand zum Rand (für "aufgeblasene" Formen), 2-Pass-Chamfer
  const distMap = new Float32Array(w * h).fill(1e9);
  for (let i = 0; i < w * h; i++) if (!solid[i]) distMap[i] = 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : distMap[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (solid[i]) distMap[i] = Math.min(distMap[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (solid[i]) distMap[i] = Math.min(distMap[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4);
  }
  const cells = new Map<string, { r: number; g: number; b: number; n: number }>();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!solid[i]) continue;
      const t = opts.mode === 'flat' ? Math.floor(opts.depth / 2) : Math.min(opts.depth, Math.round(Math.sqrt(distMap[i]) * 1.3));
      const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
      for (let z = -t; z <= t; z++) cells.set(`${x - Math.floor(w / 2)},${h - 1 - y},${z}`, { r, g, b, n: 1 });
    }
  return finish(cells, opts.maxColors ?? 32, 'Bild');
}

function finish(cells: Map<string, { r: number; g: number; b: number; n: number }>, maxColors: number, layerName: string): VoxelModel {
  const hexes = new Map<string, string>();
  const weights = new Map<string, number>();
  for (const [k, c] of cells) {
    const hex = rgbToHex([(c.r / c.n) * 255, (c.g / c.n) * 255, (c.b / c.n) * 255]);
    hexes.set(k, hex);
    weights.set(hex, (weights.get(hex) ?? 0) + 1);
  }
  const mapping = reduceColors([...weights.keys()], maxColors, weights);
  const model = new VoxelModel();
  model.layers[0].name = layerName;
  for (const [k, hex] of hexes) {
    const [x, y, z] = k.split(',').map(Number);
    model.set(x, y, z, model.colorIndex(mapping.get(hex) ?? hex), 'diffuse', 0);
  }
  model.normalizePosition();
  return model;
}

function dist(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Minimaler OBJ-Parser (v, v mit Farbe, f mit beliebig vielen Ecken). */
export function parseObj(text: string): TriangleMesh {
  const verts: number[][] = [];
  const vcols: (number[] | null)[] = [];
  const positions: number[] = [];
  const colors: number[] = [];
  let hasColors = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const n = line.slice(2).trim().split(/\s+/).map(Number);
      verts.push([n[0], n[1], n[2]]);
      if (n.length >= 6) {
        vcols.push([n[3], n[4], n[5]]);
        hasColors = true;
      } else vcols.push(null);
    } else if (line.startsWith('f ')) {
      const idx = line.slice(2).trim().split(/\s+/).map((t) => {
        const i = parseInt(t.split('/')[0], 10);
        return i < 0 ? verts.length + i : i - 1;
      });
      for (let k = 1; k < idx.length - 1; k++) {
        for (const vi of [idx[0], idx[k], idx[k + 1]]) {
          const v = verts[vi];
          if (!v) continue;
          positions.push(v[0], v[1], v[2]);
          const c = vcols[vi] ?? [0.7, 0.7, 0.72];
          colors.push(c[0], c[1], c[2]);
        }
      }
    }
  }
  return { positions, colors: hasColors ? colors : undefined };
}
