import type { VoxelModel } from '../voxel/VoxelModel';
import { packKey } from '../voxel/VoxelModel';
import type { Voxel } from '../voxel/types';
import type { StyleProfile, ViewMode } from '../style/profile';
import { colorRamp, lockColor } from '../style/profile';
import { shade, nearestColor, mix } from '../palette/color';

/**
 * ============================================================================
 *  Voxel → Pixel-Rasterizer (2D-Pixel-Art-Generator)
 * ============================================================================
 *
 * Rendert ein Voxelmodell pixelgenau in ein kleines Bild (16×16 … 128×128):
 *  - orthografische Projektion (Front, Seite, 3/4-Top-Down, Isometrisch)
 *  - Raycasting pro Pixel (exakt, deterministisch, ohne WebGL → läuft auch
 *    im Backend und in Tests)
 *  - harte, gestufte Schattierung über Farbrampen des Stilprofils
 *    (Hue-Shifting, warme/kalte Schatten, goldene Highlights)
 *  - Schlagschatten, Innenlinien an Tiefenkanten, 1-px-Outline
 *  - Style Lock: Farben werden auf die gesperrte Projektpalette abgebildet
 *
 * Da Kamera, Licht, Skalierung und Anker pro Asset fix sind, sehen alle
 * Frames und Richtungen garantiert gleich aus (gleiche Perspektive,
 * Proportionen, Palette, Outline, Beleuchtung).
 */

export type Vec3 = [number, number, number];

export interface RasterOptions {
  width: number;
  height: number;
  /** Pixel pro Voxel. */
  ppv: number;
  view: ViewMode;
  /** Drehung des Modells um die Hochachse (Blickrichtung), Grad. */
  yaw: number;
  /** Weltpunkt, der auf `anchor` abgebildet wird (Modellmitte am Boden). */
  origin: Vec3;
  /** Pixelposition des Ursprungs (x, y – y nach unten). */
  anchor: [number, number];
  profile: StyleProfile;
  /** Outline überspringen (z.B. für Tiles). */
  noOutline?: boolean;
}

export interface RasterResult {
  width: number;
  height: number;
  /** Hex-Farbe je Pixel oder null (transparent). */
  pixels: (string | null)[];
  depth: Float32Array;
}

// ------------------------------------------------------------- Kamera

export interface CameraBasis {
  R: Vec3; // rechts
  U: Vec3; // oben
  D: Vec3; // Blickrichtung (in die Szene)
  C: Vec3; // zur Kamera
}

const VIEW_ANGLES: Record<ViewMode, { elev: number; az: number }> = {
  front: { elev: 0, az: 0 },
  side: { elev: 0, az: 0 },
  topdown: { elev: 22, az: 0 },
  iso: { elev: 26.565, az: 45 },
};

export function cameraBasis(view: ViewMode): CameraBasis {
  const { elev, az } = VIEW_ANGLES[view];
  const e = (elev * Math.PI) / 180, a = (az * Math.PI) / 180;
  const C: Vec3 = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
  const D: Vec3 = [-C[0], -C[1], -C[2]];
  const R: Vec3 = [Math.cos(a), 0, -Math.sin(a)];
  const U = cross(R, D);
  return { R, U, D, C };
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Lichtrichtung (zum Licht hin) in Weltkoordinaten. */
export function lightVector(profile: StyleProfile, cam: CameraBasis): Vec3 {
  const side = profile.pixel.lightDirection === 'top-left' ? -0.6 : profile.pixel.lightDirection === 'top-right' ? 0.6 : 0;
  const up = profile.pixel.lightDirection === 'front' ? 0.4 : 1;
  return norm([cam.R[0] * side + cam.C[0] * 0.55, up + cam.C[1] * 0.2, cam.R[2] * side + cam.C[2] * 0.55]);
}

function rotY(p: Vec3, deg: number, c: Vec3): Vec3 {
  if (!deg) return p;
  const r = (deg * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
  const x = p[0] - c[0], z = p[2] - c[2];
  return [x * cs + z * sn + c[0], p[1], -x * sn + z * cs + c[2]];
}

/** Projiziert einen Weltpunkt (nach Gier-Drehung) auf Bildschirmkoordinaten relativ zum Ursprung (in Voxeln). */
export function projectPoint(p: Vec3, yaw: number, origin: Vec3, cam: CameraBasis): [number, number] {
  const q = rotY(p, yaw, origin);
  const d: Vec3 = [q[0] - origin[0], q[1] - origin[1], q[2] - origin[2]];
  return [dot(d, cam.R), dot(d, cam.U)];
}

// ------------------------------------------------------------- Raycasting

interface Hit {
  v: Voxel;
  n: Vec3; // Flächennormale im Modellraum
  t: number;
  /** Getroffenes Glas vor dem eigentlichen Voxel (durchscheinend). */
  glass?: Voxel;
}

class VoxelGrid {
  min: Vec3;
  max: Vec3;
  constructor(readonly model: VoxelModel) {
    const b = model.bounds() ?? { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
    this.min = [b.minX - 0.5, b.minY - 0.5, b.minZ - 0.5];
    this.max = [b.maxX + 0.5, b.maxY + 0.5, b.maxZ + 0.5];
    this.hidden = new Set(model.layers.filter((l) => !l.visible).map((l) => l.id));
  }
  hidden: Set<number>;
  get(x: number, y: number, z: number): Voxel | undefined {
    const v = this.model.getByKey(packKey(x, y, z));
    return v && !this.hidden.has(v.l) ? v : undefined;
  }

  /** Amanatides-Woo-DDA durch das Voxelgitter. */
  cast(o: Vec3, d: Vec3, maxT = 1e4, skipFirst = false, seeThroughGlass = false): Hit | null {
    let glassHit: Hit | null = null;
    // Schnitt mit der Bounding-Box
    let t0 = 0, t1 = maxT;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < this.min[i] || o[i] > this.max[i]) return null;
        continue;
      }
      let a = (this.min[i] - o[i]) / d[i], b = (this.max[i] - o[i]) / d[i];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
    const p: Vec3 = [o[0] + d[0] * (t0 + 1e-6), o[1] + d[1] * (t0 + 1e-6), o[2] + d[2] * (t0 + 1e-6)];
    const cell: Vec3 = [Math.floor(p[0] + 0.5), Math.floor(p[1] + 0.5), Math.floor(p[2] + 0.5)];
    const step: Vec3 = [Math.sign(d[0]), Math.sign(d[1]), Math.sign(d[2])];
    const tDelta: Vec3 = [Math.abs(1 / d[0]), Math.abs(1 / d[1]), Math.abs(1 / d[2])];
    const tMax: Vec3 = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      if (step[i] === 0) tMax[i] = Infinity;
      else {
        const boundary = cell[i] + (step[i] > 0 ? 0.5 : -0.5);
        tMax[i] = t0 + (boundary - p[i]) / d[i];
      }
    }
    // Eintrittsnormale = Achse mit größtem Eintrittsparameter
    let n: Vec3 = [0, 0, 0];
    {
      let best = -Infinity, axis = 0;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(d[i]) < 1e-9) continue;
        const a = ((d[i] > 0 ? this.min[i] : this.max[i]) - o[i]) / d[i];
        if (a > best) { best = a; axis = i; }
      }
      n[axis] = -step[axis];
    }
    let t = t0;
    let first = true;
    for (let guard = 0; guard < 2048; guard++) {
      if (!(skipFirst && first)) {
        const v = this.get(cell[0], cell[1], cell[2]);
        if (v) {
          if (!seeThroughGlass || v.m !== 'glass') return glassHit ? { v, n, t, glass: glassHit.v } : { v, n, t };
          glassHit ??= { v, n, t };
        }
      }
      first = false;
      let axis = 0;
      if (tMax[1] < tMax[axis]) axis = 1;
      if (tMax[2] < tMax[axis]) axis = 2;
      t = tMax[axis];
      if (t > t1) return glassHit;
      cell[axis] += step[axis];
      tMax[axis] += tDelta[axis];
      n = [0, 0, 0];
      n[axis] = -step[axis];
    }
    return glassHit;
  }
}

// ------------------------------------------------------------- Rendern

export function rasterize(model: VoxelModel, o: RasterOptions): RasterResult {
  const { width: w, height: h, ppv, yaw, origin, anchor, profile } = o;
  const cam = cameraBasis(o.view);
  const L = lightVector(profile, cam);
  const grid = new VoxelGrid(model);
  const pixels: (string | null)[] = new Array(w * h).fill(null);
  const depth = new Float32Array(w * h).fill(Infinity);
  const levels = profile.pixel.shadingLevels;
  const ramps = new Map<number, string[]>();
  const rampOf = (c: number) => {
    let r = ramps.get(c);
    if (!r) {
      r = colorRamp(model.palette[c] ?? '#ff00ff', profile, levels).map((x) => lockColor(x, profile));
      ramps.set(c, r);
    }
    return r;
  };
  // Licht und Strahl in Modellkoordinaten (Gegendrehung um die Hochachse)
  const Lm = rotY(L, -yaw, [0, 0, 0]);
  const Dm = rotY(cam.D, -yaw, [0, 0, 0]);
  const far = 4096;
  // Supersampling, wenn ein Pixel mehrere Voxel abdeckt (kleine Sprites)
  const ss = ppv < 0.99 ? Math.min(3, Math.ceil(1 / ppv)) : 1;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const votes = new Map<string, number>();
      let bestDepth = Infinity;
      let opaque = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const fx = (px + (sx + 0.5) / ss - anchor[0]) / ppv;
          const fy = (anchor[1] - (py + (sy + 0.5) / ss)) / ppv;
          const world: Vec3 = [
            origin[0] + cam.R[0] * fx + cam.U[0] * fy - cam.D[0] * far,
            origin[1] + cam.R[1] * fx + cam.U[1] * fy - cam.D[1] * far,
            origin[2] + cam.R[2] * fx + cam.U[2] * fy - cam.D[2] * far,
          ];
          const ro = rotY(world, -yaw, origin);
          const hit = grid.cast(ro, Dm, 1e4, false, true);
          if (!hit) continue;
          opaque++;
          const color = shadeHit(hit, ro, Dm, Lm, grid, profile, rampOf, levels);
          votes.set(color, (votes.get(color) ?? 0) + 1);
          bestDepth = Math.min(bestDepth, hit.t);
        }
      if (opaque * 2 < ss * ss || !votes.size) continue;
      let best = '', bestN = -1;
      for (const [c, n] of votes) if (n > bestN) { best = c; bestN = n; }
      pixels[py * w + px] = best;
      depth[py * w + px] = bestDepth;
    }
  }

  // Innenlinien: Pixel hinter einer deutlich näheren Kante abdunkeln
  if (profile.pixel.innerLines && profile.pixel.outline !== 'none') {
    const thr = Math.max(2.5, 2.5 / Math.max(ppv, 0.5));
    const out = [...pixels];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!pixels[i]) continue;
        for (const [dx, dy] of [[-1, 0], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0) continue;
          const j = ny * w + nx;
          if (pixels[j] && depth[j] < depth[i] - thr) {
            out[i] = lockColor(shade(pixels[i]!, -0.42), profile);
            break;
          }
        }
      }
    for (let i = 0; i < out.length; i++) pixels[i] = out[i];
  }

  if (!o.noOutline) applyOutline(pixels, w, h, profile);
  return { width: w, height: h, pixels, depth };
}

function shadeHit(hit: Hit, ro: Vec3, d: Vec3, L: Vec3, grid: VoxelGrid, profile: StyleProfile, rampOf: (c: number) => string[], levels: number): string {
  if (hit.glass) {
    // Inhalt hinter Glas: Innenfarbe leicht mit der Glasfarbe mischen
    const inner = shadeHit({ ...hit, glass: undefined }, ro, d, L, grid, profile, rampOf, levels);
    const g = rampOf(hit.glass.c);
    return lockColor(mix(inner, g[g.length - 1], 0.3), profile);
  }
  const ramp = rampOf(hit.v.c);
  if (hit.v.m === 'emissive') return ramp[ramp.length - 1];
  let l = dot(hit.n, L);
  // Schlagschatten: Strahl Richtung Licht
  if (profile.pixel.castShadows && l > 0) {
    const p: Vec3 = [ro[0] + d[0] * hit.t + hit.n[0] * 0.01, ro[1] + d[1] * hit.t + hit.n[1] * 0.01, ro[2] + d[2] * hit.t + hit.n[2] * 0.01];
    const start: Vec3 = [p[0] + L[0] * 0.02, p[1] + L[1] * 0.02, p[2] + L[2] * 0.02];
    const occ = grid.cast(start, L, 200, true);
    if (occ && occ.v !== hit.v) l = Math.min(l, 0.05);
  }
  let idx: number;
  if (levels === 2) idx = l > 0.25 ? 1 : 0;
  else if (levels === 4) idx = l > 0.8 ? 3 : l > 0.35 ? 2 : l > -0.1 ? 1 : 0;
  else idx = l > 0.8 ? 2 : l > 0.2 ? 1 : 0;
  if (hit.v.m === 'metal' && idx === levels - 2 && l > 0.6) idx = levels - 1;
  return ramp[Math.min(ramp.length - 1, idx)];
}

/** 1-px-Outline um die Silhouette (schwarz, dunkel-selektiv oder farbig). */
export function applyOutline(pixels: (string | null)[], w: number, h: number, profile: StyleProfile): void {
  const mode = profile.pixel.outline;
  if (mode === 'none') return;
  const add: [number, string][] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (pixels[i]) continue;
      let neighbor: string | null = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const c = pixels[ny * w + nx];
        if (c) { neighbor = c; break; }
      }
      if (!neighbor) continue;
      const color = mode === 'dark' ? shade(neighbor, -0.7) : profile.pixel.outlineColor;
      add.push([i, profile.palette.locked && profile.palette.colors.length ? nearestColor(color, profile.palette.colors) : color]);
    }
  for (const [i, c] of add) pixels[i] = c;
}

// ------------------------------------------------------------- Rahmung

/**
 * Bestimmt Anker und Skalierung so, dass das Modell (in allen Richtungen)
 * ins Sprite passt – mit den Füßen am unteren Rand. Wird pro Asset einmal
 * berechnet und dann für alle Frames gespeichert (Style Lock).
 */
export function computeFraming(model: VoxelModel, view: ViewMode, yaws: number[], width: number, height: number, ppv: number, margin = 1): { anchor: [number, number]; origin: Vec3; fits: number } {
  const b = model.bounds() ?? { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
  const origin: Vec3 = [Math.round((b.minX + b.maxX) / 2), b.minY - 0.5, Math.round((b.minZ + b.maxZ) / 2)];
  const cam = cameraBasis(view);
  let minSx = Infinity, maxSx = -Infinity, minSy = Infinity, maxSy = -Infinity;
  for (const yaw of yaws)
    for (const x of [b.minX - 0.5, b.maxX + 0.5])
      for (const y of [b.minY - 0.5, b.maxY + 0.5])
        for (const z of [b.minZ - 0.5, b.maxZ + 0.5]) {
          const [sx, sy] = projectPoint([x, y, z], yaw, origin, cam);
          minSx = Math.min(minSx, sx); maxSx = Math.max(maxSx, sx);
          minSy = Math.min(minSy, sy); maxSy = Math.max(maxSy, sy);
        }
  const needW = (maxSx - minSx) * ppv + margin * 2, needH = (maxSy - minSy) * ppv + margin * 2;
  const fits = Math.min(1, width / needW, height / needH);
  // Pixelzentren auf Voxelzentren legen (x.5-Anker) → knackscharfe Pixel
  const ax = Math.round(width / 2 - ((minSx + maxSx) / 2) * ppv) + (ppv % 2 === 1 ? 0.5 : 0);
  const ay = Math.round(height - margin + minSy * ppv);
  return { anchor: [ax, ay], origin, fits };
}
