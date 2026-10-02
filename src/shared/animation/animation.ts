import { VoxelModel, packKey, voxelEquals } from '../voxel/VoxelModel';
import { MATERIAL_TYPES, type Axis, type Voxel } from '../voxel/types';
import type { AnimationClip, AnimationFrame, AnimationKind } from './types';
import type { ArchetypeId } from '../ai/types';
import { Rng } from '../ai/procedural/Sculptor';

/**
 * Animationssystem.
 *
 * Frames werden aus "Ebenen-Transformationen" berechnet (z.B. "linkes Bein
 * 1 Voxel nach vorne", "Waffe 60° um die Schulter drehen") und anschließend
 * als Differenz zum Basismodell gespeichert. Dadurch sind sie unabhängig
 * davon, wie sie entstanden sind – ein späteres KI-System oder der Nutzer
 * können Frames genauso gut direkt erzeugen/bearbeiten.
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

export interface LayerTransform {
  roles: string[];
  dx?: number;
  dy?: number;
  dz?: number;
  rotate?: { axis: Axis; deg: number; pivot: [number, number, number] };
}

function layerIdsForRoles(model: VoxelModel, roles: string[]): Set<number> {
  return new Set(model.layers.filter((l) => l.role && roles.includes(l.role)).map((l) => l.id));
}

/** Pivot einer Rolle: Mitte oben (z.B. Schulter, Hüfte, Flügelansatz). */
export function rolePivot(model: VoxelModel, roles: string[], where: 'top' | 'center' | 'inner' = 'top'): [number, number, number] | null {
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
  if (where === 'inner') return [Math.abs(minX) < Math.abs(maxX) ? minX : maxX, cy, cz];
  return [cx, maxY, cz];
}

function rotatePoint(p: [number, number, number], axis: Axis, rad: number, pivot: [number, number, number]): [number, number, number] {
  const x = p[0] - pivot[0], y = p[1] - pivot[1], z = p[2] - pivot[2];
  const c = Math.cos(rad), s = Math.sin(rad);
  let nx = x, ny = y, nz = z;
  if (axis === 'x') { ny = y * c - z * s; nz = y * s + z * c; }
  else if (axis === 'y') { nx = x * c + z * s; nz = -x * s + z * c; }
  else { nx = x * c - y * s; ny = x * s + y * c; }
  return [nx + pivot[0], ny + pivot[1], nz + pivot[2]];
}

/** Erzeugt einen Frame aus Ebenen-Transformationen. */
export function makeFrame(base: VoxelModel, transforms: LayerTransform[]): AnimationFrame {
  const m = base.clone();
  const placed: Voxel[] = [];
  const groups = transforms.map((t) => {
    const ids = layerIdsForRoles(base, t.roles);
    const src: Voxel[] = [];
    for (const v of base.values()) if (ids.has(v.l)) src.push(v);
    return { t, src };
  });
  // Zuerst alle bewegten Voxel entfernen, dann neu platzieren.
  for (const { src } of groups) for (const v of src) m.remove(v.x, v.y, v.z);
  for (const { t, src } of groups) {
    const dx = t.dx ?? 0, dy = t.dy ?? 0, dz = t.dz ?? 0;
    if (!t.rotate || t.rotate.deg % 360 === 0) {
      for (const v of src) placed.push({ ...v, x: v.x + dx, y: v.y + dy, z: v.z + dz });
      continue;
    }
    // Rotation per inversem Sampling (lückenlos, harte Pixelkanten)
    const { axis, deg, pivot } = t.rotate;
    const rad = (deg * Math.PI) / 180;
    const map = new Map<number, Voxel>();
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const v of src) {
      map.set(packKey(v.x, v.y, v.z), v);
      const p = rotatePoint([v.x, v.y, v.z], axis, rad, pivot);
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
      minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
    }
    for (let x = Math.floor(minX) - 1; x <= Math.ceil(maxX) + 1; x++)
      for (let y = Math.floor(minY) - 1; y <= Math.ceil(maxY) + 1; y++)
        for (let z = Math.floor(minZ) - 1; z <= Math.ceil(maxZ) + 1; z++) {
          const s = rotatePoint([x, y, z], axis, -rad, pivot);
          const v = map.get(packKey(Math.round(s[0]), Math.round(s[1]), Math.round(s[2])));
          if (v) placed.push({ ...v, x: x + dx, y: y + dy, z: z + dz });
        }
  }
  for (const v of placed) if (v.y >= 0) m.setVoxel(v);
  return diffModels(base, m);
}

// ------------------------------------------------------- Standard-Animationen

const UPPER = ['body', 'head', 'arm_left', 'arm_right', 'weapon', 'shield', 'cape', 'wing_left', 'wing_right', 'tail', 'accessory'];

function clip(kind: AnimationKind, name: string, fps: number, frames: AnimationFrame[]): AnimationClip {
  return { id: `${kind}-${Math.random().toString(36).slice(2, 8)}`, name, kind, fps, loop: true, frames };
}

const hasRole = (m: VoxelModel, role: string) => m.layers.some((l) => l.role === role);

/** Erzeugt passende Standard-Animationen für ein generiertes Modell. */
export function generateAnimations(model: VoxelModel, archetype: ArchetypeId): AnimationClip[] {
  const clips: AnimationClip[] = [];
  const f = (t: LayerTransform[]) => makeFrame(model, t);

  if (archetype === 'humanoid') {
    clips.push(clip('idle', 'Idle (Atmen)', 4, [f([]), f([]), f([{ roles: UPPER, dy: -1 }]), f([{ roles: UPPER, dy: -1 }])]));
    const armL = ['arm_left', 'shield'], armR = ['arm_right', 'weapon'];
    clips.push(
      clip('walk', 'Laufen', 8, [
        f([{ roles: ['leg_left'], dz: 1, dy: 1 }, { roles: ['leg_right'], dz: -1 }, { roles: armL, dz: -1 }, { roles: armR, dz: 1 }]),
        f([{ roles: UPPER, dy: 1 }]),
        f([{ roles: ['leg_right'], dz: 1, dy: 1 }, { roles: ['leg_left'], dz: -1 }, { roles: armR, dz: -1 }, { roles: armL, dz: 1 }]),
        f([{ roles: UPPER, dy: 1 }]),
      ]),
    );
    const pivot = rolePivot(model, ['arm_right']);
    if (pivot && hasRole(model, 'weapon')) {
      const swing = (deg: number, extra: LayerTransform[] = []) => f([{ roles: armR, rotate: { axis: 'x', deg, pivot } }, ...extra]);
      clips.push(clip('attack', 'Angriff', 8, [swing(-60), swing(-140), swing(-30, [{ roles: UPPER.filter((r) => !armR.includes(r)), dz: 1 }]), swing(0)]));
    }
  }

  if (archetype === 'dragon' || archetype === 'quadruped') {
    const pairA = ['leg_fr', 'leg_bl'], pairB = ['leg_fl', 'leg_br'];
    const upper = ['body', 'head', 'tail', 'wing_left', 'wing_right'];
    clips.push(
      clip('walk', 'Laufen', 8, [
        f([{ roles: pairA, dz: 1, dy: 1 }, { roles: pairB, dz: -1 }]),
        f([{ roles: upper, dy: 1 }]),
        f([{ roles: pairB, dz: 1, dy: 1 }, { roles: pairA, dz: -1 }]),
        f([{ roles: upper, dy: 1 }]),
      ]),
    );
    clips.push(clip('idle', 'Idle', 4, [f([]), f([{ roles: ['head'], dy: -1 }, { roles: ['tail'], dx: 1 }]), f([]), f([{ roles: ['tail'], dx: -1 }])]));
  }

  if ((archetype === 'dragon' || archetype === 'bird' || hasRole(model, 'wing_right')) && hasRole(model, 'wing_right')) {
    const pr = rolePivot(model, ['wing_right'], 'inner');
    const pl = rolePivot(model, ['wing_left'], 'inner');
    if (pr && pl) {
      const flap = (deg: number, dy: number) =>
        f([
          { roles: ['wing_right'], dy, rotate: { axis: 'z', deg, pivot: pr } },
          { roles: ['wing_left'], dy, rotate: { axis: 'z', deg: -deg, pivot: pl } },
          { roles: ['body', 'head', 'tail', 'legs', 'leg_fr', 'leg_fl', 'leg_br', 'leg_bl', 'flame'], dy },
        ]);
      clips.push(clip('fly', 'Fliegen (Flügelschlag)', 8, [flap(0, 1), flap(30, 2), flap(0, 1), flap(-30, 0)]));
    }
  }

  if (archetype === 'slime') {
    clips.push(clip('bounce', 'Hüpfen', 6, [f([]), f([{ roles: ['body', 'head', 'accessory'], dy: 1 }]), f([{ roles: ['body', 'head', 'accessory'], dy: 3 }]), f([{ roles: ['body', 'head', 'accessory'], dy: 1 }])]));
  }

  if (hasRole(model, 'flame')) clips.push(flickerClip(model));

  if (hasRole(model, 'smoke')) clips.push(clip('idle', 'Rauch', 4, [0, 1, 2, 3].map((i) => f([{ roles: ['smoke'], dy: i, dx: i % 2 }]))));
  if (hasRole(model, 'flag')) clips.push(clip('idle', 'Fahne weht', 4, [f([]), f([{ roles: ['flag'], dz: 1 }]), f([]), f([{ roles: ['flag'], dz: -1 }])]));
  if (archetype === 'tree' || hasRole(model, 'leaves')) {
    clips.push(clip('idle', 'Wind', 3, [f([]), f([{ roles: ['leaves'], dx: 1 }]), f([]), f([{ roles: ['leaves'], dx: -1 }])]));
  }

  // Einfache Objektbewegungen für Gegenstände
  if (['weapon', 'potion', 'chest', 'crystal', 'spaceship', 'mushroom', 'custom'].includes(archetype)) {
    const all = model.layers.map((l) => l.role ?? '').filter(Boolean);
    const allRoles = [...new Set(all)].filter((r) => r !== 'base');
    clips.push(clip('bounce', 'Schweben', 6, [0, 1, 2, 1].map((dy) => f([{ roles: allRoles, dy }]))));
    clips.push(clip('spin', 'Drehen (90°-Schritte)', 4, [0, 90, 180, 270].map((deg) => f(deg === 0 ? [] : [{ roles: allRoles, rotate: { axis: 'y', deg, pivot: modelCenter(model) } }]))));
  }
  return clips;
}

function modelCenter(m: VoxelModel): [number, number, number] {
  const b = m.bounds();
  if (!b) return [0, 0, 0];
  return [Math.round((b.minX + b.maxX) / 2), 0, Math.round((b.minZ + b.maxZ) / 2)];
}

/** Flackernde Flammen: zufälliges Entfernen/Umfärben der Flammen-Voxel. */
function flickerClip(model: VoxelModel): AnimationClip {
  const ids = layerIdsForRoles(model, ['flame']);
  const flames = [...model.values()].filter((v) => ids.has(v.l));
  const colors = [...new Set(flames.map((v) => v.c))];
  const maxY = Math.max(...flames.map((v) => v.y));
  const minY = Math.min(...flames.map((v) => v.y));
  const frames: AnimationFrame[] = [];
  for (let i = 0; i < 4; i++) {
    const rng = new Rng(1234 + i * 77);
    const m = model.clone();
    for (const v of flames) {
      const t = (v.y - minY) / Math.max(1, maxY - minY);
      if (rng.chance(t * 0.55)) m.remove(v.x, v.y, v.z);
      else if (rng.chance(0.3)) m.setVoxel({ ...v, c: colors[rng.int(0, colors.length - 1)] });
    }
    // Zusätzliche Flammenzunge
    const top = flames.filter((v) => v.y === maxY);
    if (top.length && i % 2 === 0) {
      const v = top[rng.int(0, top.length - 1)];
      m.setVoxel({ ...v, y: v.y + 1 });
    }
    frames.push(diffModels(model, m));
  }
  return clip('flicker', 'Flackern', 8, frames);
}
