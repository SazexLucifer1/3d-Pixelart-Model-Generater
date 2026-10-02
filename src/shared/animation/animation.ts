import { VoxelModel, packKey, voxelEquals } from '../voxel/VoxelModel';
import { MATERIAL_TYPES, type Axis, type Voxel } from '../voxel/types';
import type { AnimationClip, AnimationFrame } from './types';
import type { ArchetypeId } from '../ai/types';
import { animationsFor, buildAnimationModels, type AnimDef } from './library';

/**
 * Animationssystem – Kern.
 *
 * Frames entstehen aus Ebenen-Transformationen (Gliedmaßen drehen,
 * Körper neigen, Figur verschieben …) und werden als Differenz zum
 * Basismodell gespeichert ("Veränderungen der Voxel-Struktur").
 * Die Pose-Bibliothek liegt in `library.ts`.
 */

// ------------------------------------------------------------- Frame <-> Modell

export function voxelToTuple(v: Voxel): number[] {
  const t = [v.x, v.y, v.z, v.c, MATERIAL_TYPES.indexOf(v.m), v.l];
  if (v.e) t.push(v.e);
  return t;
}

export function tupleToVoxel(t: number[]): Voxel {
  const v: Voxel = { x: t[0], y: t[1], z: t[2], c: t[3], m: MATERIAL_TYPES[t[4]] ?? 'diffuse', l: t[5] ?? 0 };
  if (t[6]) v.e = t[6];
  return v;
}

/** Wendet einen Frame auf eine Kopie des Basismodells an. */
export function applyFrame(base: VoxelModel, frame: AnimationFrame): VoxelModel {
  const m = base.clone();
  for (const k of frame.remove) m.removeKey(k);
  for (const t of frame.set) m.setVoxel(tupleToVoxel(t));
  return m;
}

/** Berechnet die Differenz zwischen Basismodell und Frame-Modell. */
export function diffModels(base: VoxelModel, frameModel: VoxelModel): AnimationFrame {
  const set: number[][] = [];
  const remove: number[] = [];
  for (const [k, v] of frameModel.entries()) {
    const b = base.getByKey(k);
    if (!b || !voxelEquals(b, v)) set.push(voxelToTuple(v));
  }
  for (const k of base.keys()) if (!frameModel.hasKey(k)) remove.push(k);
  return { set, remove };
}

// ---------------------------------------------------------- Transformationen

export type Vec3 = [number, number, number];

/** Ein Transformationsschritt; Schritte werden nacheinander angewendet. */
export type TransformStep = { rotate: { axis: Axis; deg: number; pivot: Vec3 } } | { translate: Vec3 };

export interface LayerTransform {
  roles: string[];
  /** Kurzform: Verschiebung (wird nach `rotate`/`steps` angewendet). */
  dx?: number;
  dy?: number;
  dz?: number;
  rotate?: { axis: Axis; deg: number; pivot: Vec3 };
  /** Beliebige Schrittfolge, z.B. Arm drehen → Oberkörper neigen → springen. */
  steps?: TransformStep[];
}

export function layerIdsForRoles(model: VoxelModel, roles: string[]): Set<number> {
  return new Set(model.layers.filter((l) => l.role && roles.includes(l.role)).map((l) => l.id));
}

/** Pivot einer Rolle: Mitte oben (Schulter/Hüfte), Mitte, oder Innenkante. */
export function rolePivot(model: VoxelModel, roles: string[], where: 'top' | 'center' | 'inner' | 'bottom' = 'top'): Vec3 | null {
  const ids = layerIdsForRoles(model, roles);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const v of model.values()) {
    if (!ids.has(v.l)) continue;
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
  }
  if (minX === Infinity) return null;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  if (where === 'center') return [cx, cy, cz];
  if (where === 'bottom') return [cx, minY, cz];
  if (where === 'inner') return [Math.abs(minX) < Math.abs(maxX) ? minX : maxX, cy, cz];
  return [cx, maxY, cz];
}

function rotatePoint(p: Vec3, axis: Axis, rad: number, pivot: Vec3): Vec3 {
  const x = p[0] - pivot[0], y = p[1] - pivot[1], z = p[2] - pivot[2];
  const c = Math.cos(rad), s = Math.sin(rad);
  let nx = x, ny = y, nz = z;
  if (axis === 'x') { ny = y * c - z * s; nz = y * s + z * c; }
  else if (axis === 'y') { nx = x * c + z * s; nz = -x * s + z * c; }
  else { nx = x * c - y * s; ny = x * s + y * c; }
  return [nx + pivot[0], ny + pivot[1], nz + pivot[2]];
}

function stepsOf(t: LayerTransform): TransformStep[] {
  const steps: TransformStep[] = [];
  if (t.rotate) steps.push({ rotate: t.rotate });
  if (t.steps) steps.push(...t.steps);
  if (t.dx || t.dy || t.dz) steps.push({ translate: [t.dx ?? 0, t.dy ?? 0, t.dz ?? 0] });
  return steps.filter((s) => ('rotate' in s ? s.rotate.deg % 360 !== 0 : s.translate.some((v) => v !== 0)));
}

function forward(p: Vec3, steps: TransformStep[]): Vec3 {
  let q = p;
  for (const s of steps) q = 'rotate' in s ? rotatePoint(q, s.rotate.axis, (s.rotate.deg * Math.PI) / 180, s.rotate.pivot) : [q[0] + s.translate[0], q[1] + s.translate[1], q[2] + s.translate[2]];
  return q;
}

function inverse(p: Vec3, steps: TransformStep[]): Vec3 {
  let q = p;
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    q = 'rotate' in s ? rotatePoint(q, s.rotate.axis, (-s.rotate.deg * Math.PI) / 180, s.rotate.pivot) : [q[0] - s.translate[0], q[1] - s.translate[1], q[2] - s.translate[2]];
  }
  return q;
}

/**
 * Wendet Ebenen-Transformationen an und liefert das neue Modell.
 * Rotationen nutzen inverses Sampling → lückenlos, harte Pixelkanten.
 * Reihenfolge: zuerst alle bewegten Voxel entfernen, dann Gruppen in
 * Listenreihenfolge platzieren (spätere überdecken frühere).
 */
export function transformModel(base: VoxelModel, transforms: LayerTransform[], extra: Voxel[] = []): VoxelModel {
  const m = base.clone();
  const groups = transforms.map((t) => {
    const ids = layerIdsForRoles(base, t.roles);
    const src: Voxel[] = [];
    for (const v of base.values()) if (ids.has(v.l)) src.push(v);
    return { steps: stepsOf(t), src };
  });
  for (const { src, steps } of groups) if (steps.length) for (const v of src) m.remove(v.x, v.y, v.z);
  const placed: Voxel[] = [];
  for (const { steps, src } of groups) {
    if (!steps.length || !src.length) continue;
    const onlyTranslate = steps.every((s) => 'translate' in s);
    if (onlyTranslate) {
      const d = forward([0, 0, 0], steps);
      for (const v of src) placed.push({ ...v, x: v.x + Math.round(d[0]), y: v.y + Math.round(d[1]), z: v.z + Math.round(d[2]) });
      continue;
    }
    const map = new Map<number, Voxel>();
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const v of src) {
      map.set(packKey(v.x, v.y, v.z), v);
      const p = forward([v.x, v.y, v.z], steps);
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
      minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
    }
    for (let x = Math.floor(minX) - 1; x <= Math.ceil(maxX) + 1; x++)
      for (let y = Math.floor(minY) - 1; y <= Math.ceil(maxY) + 1; y++)
        for (let z = Math.floor(minZ) - 1; z <= Math.ceil(maxZ) + 1; z++) {
          const s = inverse([x, y, z], steps);
          const v = map.get(packKey(Math.round(s[0]), Math.round(s[1]), Math.round(s[2])));
          if (v) placed.push({ ...v, x, y, z });
        }
  }
  for (const v of placed) if (v.y >= 0) m.setVoxel(v);
  for (const v of extra) if (v.y >= 0) m.setVoxel(v);
  return m;
}

/** Erzeugt einen Frame (Differenz) aus Ebenen-Transformationen. */
export function makeFrame(base: VoxelModel, transforms: LayerTransform[]): AnimationFrame {
  return diffModels(base, transformModel(base, transforms));
}

// ------------------------------------------------------- Standard-Animationen

/** Wandelt eine Animationsdefinition in einen 3D-Clip (Frames als Diffs). */
export function clipFromDef(model: VoxelModel, def: AnimDef, frames = def.frames, fps = def.fps): AnimationClip {
  const models = buildAnimationModels(model, def, frames);
  return {
    id: `${def.id}-${Math.random().toString(36).slice(2, 8)}`,
    name: def.name,
    kind: def.id,
    fps,
    loop: def.loop,
    frames: models.map((m) => diffModels(model, m)),
  };
}

/** Erzeugt passende Standard-Animationen für ein generiertes Modell. */
export function generateAnimations(model: VoxelModel, archetype: ArchetypeId | string, ids?: string[]): AnimationClip[] {
  const defs = animationsFor(model, archetype).filter((d) => !ids || ids.includes(d.id));
  return defs.map((d) => clipFromDef(model, d));
}
