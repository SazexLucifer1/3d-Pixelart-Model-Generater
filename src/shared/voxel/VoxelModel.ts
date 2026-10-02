import type { Bounds, Layer, MaterialType, Voxel, VoxelChange } from './types';
import { MATERIAL_TYPES } from './types';

/**
 * Koordinaten werden in einen 30-Bit-Integer gepackt. Jede Achse hat damit
 * einen Wertebereich von -512..511 – mehr als genug für Pixel-Art-Modelle.
 */
const OFFSET = 512;
const MASK = 1023;

export function packKey(x: number, y: number, z: number): number {
  return ((x + OFFSET) << 20) | ((y + OFFSET) << 10) | (z + OFFSET);
}

export function unpackKey(key: number): [number, number, number] {
  return [((key >> 20) & MASK) - OFFSET, ((key >> 10) & MASK) - OFFSET, (key & MASK) - OFFSET];
}

export function inRange(x: number, y: number, z: number): boolean {
  return x >= -OFFSET && x < OFFSET && y >= -OFFSET && y < OFFSET && z >= -OFFSET && z < OFFSET;
}

/** Serialisierte Form eines Modells (kompakt, für Projektdateien). */
export interface SerializedModel {
  palette: string[];
  layers: Layer[];
  /** Voxel als Tupel: [x, y, z, colorIndex, materialIndex, layerId, emission] */
  voxels: number[][];
}

/**
 * Die zentrale, editierbare Voxel-Datenstruktur.
 *
 * - Sparse-Speicherung in einer Map (nur belegte Zellen kosten Speicher)
 * - Palette mit maximal 256 Farben
 * - Ebenen (Layer) mit Sichtbarkeit/Sperre
 * - Änderungsaufzeichnung für Undo/Redo
 * - `version` wird bei jeder Änderung erhöht → Renderer erkennt, wann neu
 *   gebaut werden muss.
 */
export class VoxelModel {
  palette: string[] = [];
  layers: Layer[] = [];
  version = 0;

  private voxels = new Map<number, Voxel>();
  private recording: Map<number, VoxelChange> | null = null;

  constructor(palette?: string[]) {
    if (palette) this.palette = [...palette];
    this.layers = [{ id: 0, name: 'Basis', visible: true, locked: false }];
  }

  // ---------------------------------------------------------------- Zugriff

  get size(): number {
    return this.voxels.size;
  }

  get(x: number, y: number, z: number): Voxel | undefined {
    return this.voxels.get(packKey(x, y, z));
  }

  getByKey(key: number): Voxel | undefined {
    return this.voxels.get(key);
  }

  has(x: number, y: number, z: number): boolean {
    return this.voxels.has(packKey(x, y, z));
  }

  hasKey(key: number): boolean {
    return this.voxels.has(key);
  }

  values(): IterableIterator<Voxel> {
    return this.voxels.values();
  }

  keys(): IterableIterator<number> {
    return this.voxels.keys();
  }

  entries(): IterableIterator<[number, Voxel]> {
    return this.voxels.entries();
  }

  // ----------------------------------------------------------- Mutationen

  /** Setzt (oder überschreibt) einen Voxel. */
  set(x: number, y: number, z: number, c: number, m: MaterialType = 'diffuse', l = 0, e?: number): void {
    if (!inRange(x, y, z)) return;
    const v: Voxel = { x, y, z, c, m, l };
    if (e !== undefined && e > 0) v.e = e;
    this.setVoxel(v);
  }

  setVoxel(v: Voxel): void {
    if (!inRange(v.x, v.y, v.z)) return;
    const key = packKey(v.x, v.y, v.z);
    const before = this.voxels.get(key) ?? null;
    const after = { ...v };
    this.record(key, before, after);
    this.voxels.set(key, after);
    this.version++;
  }

  remove(x: number, y: number, z: number): boolean {
    return this.removeKey(packKey(x, y, z));
  }

  removeKey(key: number): boolean {
    const before = this.voxels.get(key);
    if (!before) return false;
    this.record(key, before, null);
    this.voxels.delete(key);
    this.version++;
    return true;
  }

  clear(): void {
    for (const key of [...this.voxels.keys()]) this.removeKey(key);
  }

  // --------------------------------------------------- Änderungsaufzeichnung

  /** Startet eine Aufzeichnung aller Voxel-Änderungen (für Undo/Redo). */
  beginRecording(): void {
    this.recording = new Map();
  }

  /** Beendet die Aufzeichnung und liefert die zusammengefassten Änderungen. */
  endRecording(): VoxelChange[] {
    const rec = this.recording;
    this.recording = null;
    if (!rec) return [];
    // Änderungen ohne Netto-Effekt herausfiltern
    return [...rec.values()].filter((ch) => !voxelEquals(ch.before, ch.after));
  }

  get isRecording(): boolean {
    return this.recording !== null;
  }

  private record(key: number, before: Voxel | null, after: Voxel | null): void {
    if (!this.recording) return;
    const existing = this.recording.get(key);
    if (existing) existing.after = after;
    else this.recording.set(key, { key, before, after });
  }

  /** Wendet Änderungen vorwärts (Redo) oder rückwärts (Undo) an. */
  applyChanges(changes: VoxelChange[], reverse = false): void {
    for (const ch of changes) {
      const target = reverse ? ch.before : ch.after;
      if (target) this.setVoxel(target);
      else this.removeKey(ch.key);
    }
  }

  // ---------------------------------------------------------------- Palette

  /** Liefert den Index einer Farbe; fügt sie hinzu, falls nicht vorhanden. */
  colorIndex(hex: string): number {
    const norm = hex.toLowerCase();
    const idx = this.palette.indexOf(norm);
    if (idx >= 0) return idx;
    if (this.palette.length >= 256) {
      // Palette voll – nächste vorhandene Farbe verwenden.
      return nearestPaletteIndex(this.palette, norm);
    }
    this.palette.push(norm);
    return this.palette.length - 1;
  }

  setPaletteColor(index: number, hex: string): void {
    this.palette[index] = hex.toLowerCase();
    this.version++;
  }

  /** Entfernt unbenutzte Palettenfarben und kompaktiert die Indizes. */
  compactPalette(): void {
    const used = new Set<number>();
    for (const v of this.voxels.values()) used.add(v.c);
    const remap = new Map<number, number>();
    const next: string[] = [];
    this.palette.forEach((hex, i) => {
      if (used.has(i)) {
        remap.set(i, next.length);
        next.push(hex);
      }
    });
    for (const v of this.voxels.values()) v.c = remap.get(v.c) ?? 0;
    this.palette = next;
    this.version++;
  }

  /**
   * Bildet alle Palettenfarben über eine Funktion ab und fasst gleiche
   * Ergebnisfarben zusammen (für Stil-Anwendung und Palettenreduktion).
   */
  remapColors(fn: (hex: string, index: number) => string): void {
    const next: string[] = [];
    const indexMap = this.palette.map((hex, i) => {
      const out = fn(hex, i).toLowerCase();
      let j = next.indexOf(out);
      if (j < 0) {
        next.push(out);
        j = next.length - 1;
      }
      return j;
    });
    for (const v of this.voxels.values()) v.c = indexMap[v.c] ?? 0;
    this.palette = next;
    this.version++;
  }

  /** Zählt, wie oft jede Palettenfarbe verwendet wird. */
  colorUsage(): Map<number, number> {
    const m = new Map<number, number>();
    for (const v of this.voxels.values()) m.set(v.c, (m.get(v.c) ?? 0) + 1);
    return m;
  }

  // ----------------------------------------------------------------- Ebenen

  addLayer(name: string, role?: string): Layer {
    const id = this.layers.reduce((mx, l) => Math.max(mx, l.id), -1) + 1;
    const layer: Layer = { id, name, role, visible: true, locked: false };
    this.layers.push(layer);
    this.version++;
    return layer;
  }

  getLayer(id: number): Layer | undefined {
    return this.layers.find((l) => l.id === id);
  }

  findLayerByRole(role: string): Layer | undefined {
    return this.layers.find((l) => l.role === role);
  }

  layerVoxelCount(): Map<number, number> {
    const m = new Map<number, number>();
    for (const v of this.voxels.values()) m.set(v.l, (m.get(v.l) ?? 0) + 1);
    return m;
  }

  isVisible(v: Voxel): boolean {
    const layer = this.getLayer(v.l);
    return layer ? layer.visible : true;
  }

  // -------------------------------------------------------------- Geometrie

  bounds(): Bounds | null {
    if (this.voxels.size === 0) return null;
    const b: Bounds = {
      minX: Infinity, minY: Infinity, minZ: Infinity,
      maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
    };
    for (const v of this.voxels.values()) {
      if (v.x < b.minX) b.minX = v.x;
      if (v.y < b.minY) b.minY = v.y;
      if (v.z < b.minZ) b.minZ = v.z;
      if (v.x > b.maxX) b.maxX = v.x;
      if (v.y > b.maxY) b.maxY = v.y;
      if (v.z > b.maxZ) b.maxZ = v.z;
    }
    return b;
  }

  /** Verschiebt das Modell so, dass es auf y=0 steht und in X/Z zentriert ist. */
  normalizePosition(): void {
    const b = this.bounds();
    if (!b) return;
    const dx = -Math.floor((b.minX + b.maxX) / 2);
    const dy = -b.minY;
    const dz = -Math.floor((b.minZ + b.maxZ) / 2);
    if (dx === 0 && dy === 0 && dz === 0) return;
    const all = [...this.voxels.values()];
    this.voxels.clear();
    for (const v of all) {
      const nv = { ...v, x: v.x + dx, y: v.y + dy, z: v.z + dz };
      this.voxels.set(packKey(nv.x, nv.y, nv.z), nv);
    }
    this.version++;
  }

  // -------------------------------------------------------- Serialisierung

  clone(): VoxelModel {
    const m = new VoxelModel();
    m.palette = [...this.palette];
    m.layers = this.layers.map((l) => ({ ...l }));
    for (const [k, v] of this.voxels) m.voxels.set(k, { ...v });
    m.version = this.version;
    return m;
  }

  toJSON(): SerializedModel {
    const voxels: number[][] = [];
    for (const v of this.voxels.values()) {
      const t = [v.x, v.y, v.z, v.c, MATERIAL_TYPES.indexOf(v.m), v.l];
      if (v.e) t.push(Math.round(v.e * 100) / 100);
      voxels.push(t);
    }
    return { palette: [...this.palette], layers: this.layers.map((l) => ({ ...l })), voxels };
  }

  static fromJSON(data: SerializedModel): VoxelModel {
    const m = new VoxelModel();
    m.palette = (data.palette ?? []).map((c) => c.toLowerCase());
    m.layers = data.layers?.length ? data.layers.map((l) => ({ ...l })) : m.layers;
    for (const t of data.voxels ?? []) {
      const [x, y, z, c, mi, l, e] = t;
      const v: Voxel = { x, y, z, c, m: MATERIAL_TYPES[mi] ?? 'diffuse', l: l ?? 0 };
      if (e) v.e = e;
      m.voxels.set(packKey(x, y, z), v);
    }
    return m;
  }
}

export function voxelEquals(a: Voxel | null, b: Voxel | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x === b.x && a.y === b.y && a.z === b.z && a.c === b.c && a.m === b.m && a.l === b.l && (a.e ?? 0) === (b.e ?? 0);
}

function nearestPaletteIndex(palette: string[], hex: string): number {
  const t = parseInt(hex.slice(1), 16);
  const tr = (t >> 16) & 255, tg = (t >> 8) & 255, tb = t & 255;
  let best = 0;
  let bestD = Infinity;
  palette.forEach((p, i) => {
    const n = parseInt(p.slice(1), 16);
    const d = (((n >> 16) & 255) - tr) ** 2 + (((n >> 8) & 255) - tg) ** 2 + ((n & 255) - tb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
