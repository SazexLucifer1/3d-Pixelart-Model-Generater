import { VoxelModel } from '../../voxel/VoxelModel';
import type { MaterialType } from '../../voxel/types';
import { shade } from '../../palette/color';
import type { DetailLevel } from '../types';

/** Deterministischer Zufallsgenerator (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

/** Deterministisches 3D-Hash-Rauschen (0..1) – für Texturvariationen. */
export function hash3(x: number, y: number, z: number, seed = 0): number {
  // Integer-Hash mit Murmur3-Finalizer (gute Durchmischung, keine Streifenmuster)
  let h = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x1b873593);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Optionen beim Setzen von Voxeln. */
export interface PaintOpts {
  /** Material. */
  m?: MaterialType;
  /** Leuchtstärke für emissive Voxel. */
  e?: number;
  /**
   * Texturrauschen 0..1: zufällige Helligkeitsvariation pro Voxel
   * (Holz, Stein, Laub). Wird mit dem Detailgrad skaliert.
   */
  noise?: number;
  /** Nur bereits belegte Voxel umfärben. */
  paintOnly?: boolean;
  /** Nur leere Zellen füllen. */
  fillOnly?: boolean;
}

/**
 * Der Sculptor ist das "Werkzeug", mit dem die prozeduralen Builder Voxel
 * zeichnen. Er kapselt Ebenen, Rauschen, Versatz (Platzierung in der Szene)
 * und Skalierung, damit die Builder lesbar bleiben.
 */
export class Sculptor {
  readonly model: VoxelModel;
  readonly rng: Rng;
  readonly detail: DetailLevel;
  /** Versatz für das aktuell gebaute Objekt (Szenenplatzierung). */
  ox = 0;
  oy = 0;
  oz = 0;
  private layerId = 0;
  private seed: number;
  /** Farben, die besonders wichtig sind (bleiben bei Palettenreduktion erhalten). */
  readonly importantColors = new Set<string>();

  constructor(model: VoxelModel, seed: number, detail: DetailLevel) {
    this.model = model;
    this.rng = new Rng(seed);
    this.seed = seed;
    this.detail = detail;
  }

  /** Wechselt in eine (neue oder vorhandene) Ebene. */
  layer(name: string, role?: string): number {
    let l = this.model.layers.find((x) => x.name === name);
    if (!l) {
      // Die leere Standardebene "Basis" wiederverwenden.
      const base = this.model.layers[0];
      if (this.model.layers.length === 1 && base.name === 'Basis' && this.model.size === 0) {
        base.name = name;
        base.role = role;
        l = base;
      } else {
        l = this.model.addLayer(name, role);
      }
    }
    this.layerId = l.id;
    return l.id;
  }

  get currentLayer(): number {
    return this.layerId;
  }

  /** Setzt einen einzelnen Voxel (Koordinaten relativ zum Objekt-Ursprung). */
  set(x: number, y: number, z: number, color: string, o: PaintOpts = {}): void {
    const wx = Math.round(x) + this.ox;
    const wy = Math.round(y) + this.oy;
    const wz = Math.round(z) + this.oz;
    if (wy < 0) return;
    const exists = this.model.has(wx, wy, wz);
    if (o.paintOnly && !exists) return;
    if (o.fillOnly && exists) return;
    let col = color;
    if (o.noise && this.detail > 1) {
      const n = hash3(wx, wy, wz, this.seed) - 0.5;
      const amt = o.noise * (this.detail === 3 ? 1.2 : 0.8);
      if (Math.abs(n) > 0.22) col = shade(color, n > 0 ? amt * 0.5 : -amt * 0.6);
    }
    if (o.m === 'emissive') this.importantColors.add(col);
    const existing = exists ? this.model.get(wx, wy, wz) : undefined;
    const l = o.paintOnly && existing ? existing.l : this.layerId;
    this.model.set(wx, wy, wz, this.model.colorIndex(col), o.m ?? 'diffuse', l, o.e ?? (o.m === 'emissive' ? 0.9 : undefined));
  }

  remove(x: number, y: number, z: number): void {
    this.model.remove(Math.round(x) + this.ox, Math.round(y) + this.oy, Math.round(z) + this.oz);
  }

  has(x: number, y: number, z: number): boolean {
    return this.model.has(Math.round(x) + this.ox, Math.round(y) + this.oy, Math.round(z) + this.oz);
  }

  /** Gefüllter Quader (inklusive Grenzen, Reihenfolge egal). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, o: PaintOpts = {}): void {
    const [ax, bx] = ordered(x0, x1), [ay, by] = ordered(y0, y1), [az, bz] = ordered(z0, z1);
    for (let x = ax; x <= bx; x++) for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) this.set(x, y, z, color, o);
  }

  /** Hohler Quader (nur Wände, ohne Boden/Decke wenn gewünscht). */
  shell(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, o: PaintOpts = {}): void {
    const [ax, bx] = ordered(x0, x1), [ay, by] = ordered(y0, y1), [az, bz] = ordered(z0, z1);
    for (let x = ax; x <= bx; x++)
      for (let y = ay; y <= by; y++)
        for (let z = az; z <= bz; z++)
          if (x === ax || x === bx || z === az || z === bz) this.set(x, y, z, color, o);
  }

  /** Ellipsoid um (cx, cy, cz) mit Radien rx/ry/rz. */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: string, o: PaintOpts = {}): void {
    const ex = rx + 0.35, ey = ry + 0.35, ez = rz + 0.35;
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const d = ((x - cx) / ex) ** 2 + ((y - cy) / ey) ** 2 + ((z - cz) / ez) ** 2;
          if (d <= 1) this.set(x, y, z, color, o);
        }
  }

  sphere(cx: number, cy: number, cz: number, r: number, color: string, o: PaintOpts = {}): void {
    this.ellipsoid(cx, cy, cz, r, r, r, color, o);
  }

  /**
   * Zylinder entlang einer Achse. Für axis='y' ist (cx, y0, cz) der Mittelpunkt
   * der Grundfläche; r0 → r1 erlaubt Verjüngung.
   */
  cylinder(cx: number, y0: number, cz: number, r0: number, h: number, color: string, o: PaintOpts = {}, r1 = r0, axis: 'x' | 'y' | 'z' = 'y'): void {
    for (let i = 0; i < h; i++) {
      const t = h <= 1 ? 0 : i / (h - 1);
      const r = r0 + (r1 - r0) * t;
      this.disc(axis, cx, y0, cz, i, r, color, o);
    }
  }

  /** Kreisscheibe senkrecht zur Achse. */
  disc(axis: 'x' | 'y' | 'z', cx: number, cy: number, cz: number, offset: number, r: number, color: string, o: PaintOpts = {}): void {
    const rr = (r + 0.4) ** 2;
    const R = Math.ceil(r);
    for (let a = -R; a <= R; a++)
      for (let b = -R; b <= R; b++) {
        if (a * a + b * b > rr) continue;
        if (axis === 'y') this.set(cx + a, cy + offset, cz + b, color, o);
        else if (axis === 'x') this.set(cx + offset, cy + a, cz + b, color, o);
        else this.set(cx + a, cy + b, cz + offset, color, o);
      }
  }

  /** Kegel (spitz zulaufend) entlang +y. */
  cone(cx: number, y0: number, cz: number, r: number, h: number, color: string, o: PaintOpts = {}): void {
    for (let i = 0; i < h; i++) {
      const rr = r * (1 - i / h);
      this.disc('y', cx, y0, cz, i, Math.max(0, rr), color, o);
    }
  }

  /** Linie mit Dicke (Kugeln entlang des Pfads). */
  line(a: Vec3, b: Vec3, color: string, thickness = 0, o: PaintOpts = {}): void {
    const d = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2]));
    const steps = Math.max(1, Math.ceil(d * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      if (thickness <= 0) this.set(p[0], p[1], p[2], color, o);
      else this.sphere(p[0], p[1], p[2], thickness, color, o);
    }
  }

  /**
   * Röhre entlang eines Pfads mit variierendem Radius (Hälse, Schwänze, Äste).
   */
  tube(points: Vec3[], radii: number[], color: string, o: PaintOpts = {}): void {
    for (let s = 0; s < points.length - 1; s++) {
      const a = points[s], b = points[s + 1];
      const ra = radii[Math.min(s, radii.length - 1)], rb = radii[Math.min(s + 1, radii.length - 1)];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const steps = Math.max(1, Math.ceil(d * 1.5));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const r = ra + (rb - ra) * t;
        const p: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        if (r < 0.6) this.set(p[0], p[1], p[2], color, o);
        else this.sphere(p[0], p[1], p[2], r, color, o);
      }
    }
  }

  /** Gefülltes 3D-Dreieck (dünne Membranen, z.B. Flügel, Segel). */
  triangle(a: Vec3, b: Vec3, c: Vec3, color: string, o: PaintOpts = {}): void {
    const len = Math.max(dist(a, b), dist(b, c), dist(a, c));
    const n = Math.max(2, Math.ceil(len * 2));
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        this.set(
          a[0] * w + b[0] * u + c[0] * v,
          a[1] * w + b[1] * u + c[1] * v,
          a[2] * w + b[2] * u + c[2] * v,
          color,
          o,
        );
      }
    }
  }

  /**
   * Färbt alle Voxel der aktuellen Ebene (im Bereich des Objekts) um, für die
   * das Prädikat zutrifft. Koordinaten im Prädikat sind objekt-relativ.
   */
  recolorWhere(pred: (x: number, y: number, z: number) => boolean, color: string | ((x: number, y: number, z: number) => string), layerOnly = true): void {
    for (const v of [...this.model.values()]) {
      if (layerOnly && v.l !== this.layerId) continue;
      const x = v.x - this.ox, y = v.y - this.oy, z = v.z - this.oz;
      if (!pred(x, y, z)) continue;
      const col = typeof color === 'string' ? color : color(x, y, z);
      this.model.setVoxel({ ...v, c: this.model.colorIndex(col) });
    }
  }

  /** Führt eine Zeichenfunktion für beide Seiten (x und -x) aus. */
  mirrored(fn: (side: 1 | -1) => void): void {
    fn(1);
    fn(-1);
  }
}

export type Vec3 = [number, number, number];

function ordered(a: number, b: number): [number, number] {
  return a <= b ? [Math.round(a), Math.round(b)] : [Math.round(b), Math.round(a)];
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
