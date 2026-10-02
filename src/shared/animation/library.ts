import { VoxelModel } from '../voxel/VoxelModel';
import type { Voxel } from '../voxel/types';
import type { AnimationKind } from './types';
import { transformModel, rolePivot, layerIdsForRoles, type LayerTransform, type TransformStep, type Vec3 } from './animation';
import { Rng } from '../ai/procedural/Sculptor';
import { luminance } from '../palette/color';

/**
 * ============================================================================
 *  Pose-Bibliothek
 * ============================================================================
 *
 * Jede Animation ist eine Funktion der normierten Zeit t ∈ [0, 1):
 *   Pose(t) → Ebenen-Transformationen → Frame-Modell.
 * Dadurch ist die Frame-Anzahl frei wählbar (4, 6, 8, 12 …) und alle
 * Frames entstehen aus demselben Basismodell → Farben, Kleidung,
 * Körperform und Pixelgröße bleiben in jedem Frame identisch.
 */

export type AnimGroup = 'Idle' | 'Bewegung' | 'Kampf' | 'Reaktionen' | 'Objekt';

export interface AnimDef {
  id: AnimationKind;
  name: string;
  group: AnimGroup;
  frames: number;
  fps: number;
  loop: boolean;
  build: (rig: Rig, t: number, index: number, count: number) => VoxelModel;
}

// ----------------------------------------------------------------------- Rig

export interface Rig {
  model: VoxelModel;
  roles: Set<string>;
  height: number;
  cx: number;
  cz: number;
  minZ: number;
  maxZ: number;
  pivot(roles: string[], where?: 'top' | 'center' | 'inner' | 'bottom'): Vec3;
  weaponKind: 'melee' | 'bow' | 'staff' | 'none';
  /** Hellste/leuchtende Palettenfarbe (für Effekte, ohne neue Farben einzuführen). */
  effectColor: number;
}

export function makeRig(model: VoxelModel): Rig {
  const b = model.bounds() ?? { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
  const roles = new Set(model.layers.map((l) => l.role).filter(Boolean) as string[]);
  const names = model.layers.map((l) => l.name).join(' ');
  const weaponKind = /Bogen/.test(names) ? 'bow' : /Stab/.test(names) ? 'staff' : roles.has('weapon') ? 'melee' : 'none';
  let effectColor = 0;
  let best = -1;
  for (const v of model.values()) {
    const score = (v.m === 'emissive' ? 2 : 0) + luminance(model.palette[v.c] ?? '#000');
    if (score > best) { best = score; effectColor = v.c; }
  }
  const cache = new Map<string, Vec3>();
  return {
    model, roles, effectColor, weaponKind,
    height: b.maxY - b.minY + 1,
    cx: (b.minX + b.maxX) / 2,
    cz: (b.minZ + b.maxZ) / 2,
    minZ: b.minZ,
    maxZ: b.maxZ,
    pivot(rs, where = 'top') {
      const key = rs.join(',') + where;
      if (!cache.has(key)) cache.set(key, rolePivot(model, rs, where) ?? [(b.minX + b.maxX) / 2, b.maxY / 2, (b.minZ + b.maxZ) / 2]);
      return cache.get(key)!;
    },
  };
}

// ------------------------------------------------------------- Hilfsfunktionen

const TAU = Math.PI * 2;
const sin = (t: number) => Math.sin(TAU * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
/** Stückweise lineare Keyframes: [[t, wert], …] */
function keys(t: number, k: [number, number][]): number {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return lerp(k[i - 1][1], k[i][1], ease((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0])));
  return k[k.length - 1][1];
}
const rot = (axis: 'x' | 'y' | 'z', deg: number, pivot: Vec3): TransformStep => ({ rotate: { axis, deg, pivot } });
const move = (x: number, y: number, z: number): TransformStep => ({ translate: [x, y, z] });

// ------------------------------------------------------------ Humanoide Posen

interface HumanPose {
  legL?: number; legR?: number; // Bein vor (−) / zurück (+), Grad
  armL?: number; armR?: number; // Arm vor/hoch (−) / zurück (+)
  spreadL?: number; spreadR?: number; // Arm seitlich abspreizen
  lean?: number; // Oberkörper vor (+) / zurück (−)
  roll?: number; // seitliche Neigung
  crouch?: number; // Oberkörper absenken (Voxel)
  bob?: number; dx?: number; dz?: number; // ganze Figur verschieben
  fall?: number; // ganze Figur nach hinten kippen (Tod)
  extra?: Voxel[];
}

const UPPER_REST = ['body', 'head', 'cape', 'wing_left', 'wing_right', 'tail', 'accessory'];

function humanFrame(rig: Rig, p: HumanPose): VoxelModel {
  const hipL = rig.pivot(['leg_left']), hipR = rig.pivot(['leg_right']);
  const hip: Vec3 = rig.roles.has('leg_left') ? [rig.cx, Math.max(hipL[1], hipR[1]), rig.cz] : [rig.cx, rig.height * 0.3, rig.cz];
  const shL = rig.pivot(['arm_left']), shR = rig.pivot(['arm_right']);
  const whole: TransformStep[] = [];
  if (p.fall) {
    // Diagonal nach hinten-links fallen → in allen Blickrichtungen gut lesbar
    const c: Vec3 = [rig.cx, 0, rig.cz];
    whole.push(rot('y', 45, c), rot('x', p.fall, [rig.cx, 0, rig.minZ]), rot('y', -45, c));
  }
  if (p.dx || p.bob || p.dz) whole.push(move(p.dx ?? 0, p.bob ?? 0, p.dz ?? 0));
  const upper: TransformStep[] = [];
  if (p.lean) upper.push(rot('x', p.lean, hip));
  if (p.roll) upper.push(rot('z', p.roll, hip));
  if (p.crouch) upper.push(move(0, -p.crouch, 0));
  const arm = (shoulder: Vec3, swing = 0, spread = 0, side: 1 | -1): TransformStep[] => {
    const s: TransformStep[] = [];
    if (swing) s.push(rot('x', swing, shoulder));
    if (spread) s.push(rot('z', spread * side, shoulder));
    return s;
  };
  const t: LayerTransform[] = [
    { roles: ['leg_left'], steps: [...(p.legL ? [rot('x', p.legL, hipL)] : []), ...whole] },
    { roles: ['leg_right'], steps: [...(p.legR ? [rot('x', p.legR, hipR)] : []), ...whole] },
    { roles: UPPER_REST, steps: [...upper, ...whole] },
    { roles: ['arm_left', 'shield'], steps: [...arm(shL, p.armL, p.spreadL, -1), ...upper, ...whole] },
    { roles: ['arm_right', 'weapon'], steps: [...arm(shR, p.armR, p.spreadR, 1), ...upper, ...whole] },
  ];
  return transformModel(rig.model, t, p.extra);
}

/** Magie-Partikel vor den Händen (nutzen eine vorhandene Palettenfarbe). */
function castParticles(rig: Rig, t: number): Voxel[] {
  const sh = rig.pivot(['arm_right']);
  const center: Vec3 = [rig.cx, sh[1] + 1, rig.maxZ + 2];
  const out: Voxel[] = [];
  const r = 1 + t * Math.max(2, rig.height * 0.18);
  const n = 6 + Math.round(t * 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + t * 3;
    out.push({ x: Math.round(center[0] + Math.cos(a) * r), y: Math.round(center[1] + Math.sin(a) * r), z: Math.round(center[2]), c: rig.effectColor, m: 'emissive', l: rig.model.layers[0]?.id ?? 0, e: 1 });
  }
  if (t > 0.3) out.push({ x: Math.round(center[0]), y: Math.round(center[1]), z: Math.round(center[2]), c: rig.effectColor, m: 'emissive', l: rig.model.layers[0]?.id ?? 0, e: 1 });
  return out;
}

const HUMAN_ANIMS: AnimDef[] = [
  {
    id: 'idle', name: 'Idle (Stehen & Atmen)', group: 'Idle', frames: 4, fps: 6, loop: true,
    build: (rig, t) => humanFrame(rig, { crouch: t >= 0.5 ? 1 : 0, armL: 4 * sin(t), armR: -4 * sin(t), spreadL: 3 + 3 * sin(t), spreadR: 3 + 3 * sin(t) }),
  },
  {
    id: 'walk', name: 'Laufen', group: 'Bewegung', frames: 8, fps: 10, loop: true,
    build: (rig, t) => {
      const s = sin(t);
      return humanFrame(rig, { legL: -30 * s, legR: 30 * s, armL: 25 * s, armR: -25 * s, bob: Math.round(1 - Math.abs(s)) });
    },
  },
  {
    id: 'run', name: 'Rennen', group: 'Bewegung', frames: 8, fps: 14, loop: true,
    build: (rig, t) => {
      const s = sin(t);
      return humanFrame(rig, { legL: -50 * s, legR: 50 * s, armL: 45 * s, armR: -45 * s, lean: 12, bob: Math.round(1.6 * (1 - Math.abs(s))) });
    },
  },
  {
    id: 'sneak', name: 'Schleichen', group: 'Bewegung', frames: 6, fps: 8, loop: true,
    build: (rig, t) => {
      const s = sin(t);
      return humanFrame(rig, { legL: -18 * s, legR: 18 * s, armL: -30, armR: -35, lean: 18, crouch: Math.max(1, Math.round(rig.height * 0.06)) });
    },
  },
  {
    id: 'jump', name: 'Springen', group: 'Bewegung', frames: 6, fps: 10, loop: false,
    build: (rig, t) => {
      const air = t > 0.2 && t < 0.8 ? Math.sin(((t - 0.2) / 0.6) * Math.PI) : 0;
      const crouch = t <= 0.2 || t >= 0.8 ? 1 : 0;
      return humanFrame(rig, { bob: Math.round(air * rig.height * 0.3), crouch, legL: -35 * air, legR: -20 * air, armL: -150 * air, armR: -150 * air });
    },
  },
  {
    id: 'attack', name: 'Angriff', group: 'Kampf', frames: 6, fps: 12, loop: false,
    build: (rig, t) => {
      if (rig.weaponKind === 'bow') {
        const draw = keys(t, [[0, 0], [0.4, 1], [0.6, 1], [0.7, 0.3], [1, 0]]);
        return humanFrame(rig, { armL: -90 * Math.min(1, draw * 1.5), armR: -85 * Math.min(1, draw * 1.5), spreadR: -10 * draw, lean: -4 * draw });
      }
      if (rig.weaponKind === 'staff') {
        const arm = keys(t, [[0, 0], [0.35, -150], [0.6, -60], [1, 0]]);
        return humanFrame(rig, { armR: arm, lean: keys(t, [[0, 0], [0.6, 8], [1, 0]]), extra: t > 0.4 && t < 0.9 ? castParticles(rig, (t - 0.4) * 2) : undefined });
      }
      const arm = keys(t, [[0, 0], [0.3, -160], [0.5, -15], [0.75, -10], [1, 0]]);
      return humanFrame(rig, { armR: arm, lean: keys(t, [[0, 0], [0.3, -5], [0.5, 12], [1, 0]]), dz: t > 0.4 && t < 0.85 ? 1 : 0, legL: keys(t, [[0, 0], [0.5, -20], [1, 0]]), legR: keys(t, [[0, 0], [0.5, 15], [1, 0]]) });
    },
  },
  {
    id: 'block', name: 'Blocken', group: 'Kampf', frames: 4, fps: 8, loop: false,
    build: (rig, t) => {
      const k = keys(t, [[0, 0], [0.35, 1], [1, 1]]);
      return humanFrame(rig, { armL: -80 * k, armR: -40 * k, lean: -6 * k, crouch: Math.round(k), dz: -Math.round(k) });
    },
  },
  {
    id: 'dodge', name: 'Ausweichen', group: 'Kampf', frames: 6, fps: 12, loop: false,
    build: (rig, t) => {
      const k = Math.sin(t * Math.PI);
      return humanFrame(rig, { dx: -Math.round(k * Math.max(2, rig.height * 0.15)), roll: 18 * k, crouch: Math.round(k * 2), legL: -15 * k, armL: 30 * k, armR: 30 * k });
    },
  },
  {
    id: 'cast', name: 'Zauber wirken', group: 'Kampf', frames: 8, fps: 10, loop: false,
    build: (rig, t) => {
      const raise = keys(t, [[0, 0], [0.3, 1], [0.8, 1], [1, 0.3]]);
      return humanFrame(rig, { armL: -110 * raise, armR: -110 * raise, spreadL: -8 * raise, spreadR: -8 * raise, lean: -4 * raise, extra: t > 0.15 ? castParticles(rig, Math.min(1, (t - 0.15) / 0.7)) : undefined });
    },
  },
  {
    id: 'hurt', name: 'Schaden erhalten', group: 'Reaktionen', frames: 3, fps: 10, loop: false,
    build: (rig, t) => {
      const k = keys(t, [[0, 0.6], [0.35, 1], [1, 0]]);
      return humanFrame(rig, { lean: -22 * k, dz: -Math.round(k), armL: 25 * k, armR: 25 * k, spreadL: 15 * k, spreadR: 15 * k });
    },
  },
  {
    id: 'death', name: 'Tod', group: 'Reaktionen', frames: 6, fps: 8, loop: false,
    build: (rig, t) => {
      const fall = keys(t, [[0, 0], [0.15, -8], [0.75, -90], [1, -90]]);
      return humanFrame(rig, { fall, armL: keys(t, [[0, 0], [0.5, -60], [1, -150]]), armR: keys(t, [[0, 0], [0.5, -50], [1, -160]]), crouch: t > 0.1 ? 1 : 0 });
    },
  },
  {
    id: 'victory', name: 'Sieg', group: 'Reaktionen', frames: 6, fps: 8, loop: true,
    build: (rig, t) => {
      const up = keys(t, [[0, 0.4], [0.3, 1], [1, 1]]);
      return humanFrame(rig, { armR: -170 * up, armL: -120 * up, spreadL: 25 * up, bob: Math.round(Math.max(0, sin(t)) * 2), legL: -10 * Math.max(0, sin(t)) });
    },
  },
  {
    id: 'interact', name: 'Interaktion', group: 'Reaktionen', frames: 4, fps: 8, loop: false,
    build: (rig, t) => {
      const reach = Math.sin(t * Math.PI);
      return humanFrame(rig, { armR: -80 * reach, lean: 8 * reach, dz: Math.round(reach) });
    },
  },
];

// -------------------------------------------------------------- Kreaturen

interface QuadPose { legA?: number; legB?: number; bob?: number; lean?: number; dz?: number; head?: Vec3; tailX?: number; roll?: number; wing?: number }

function quadFrame(rig: Rig, p: QuadPose): VoxelModel {
  const whole: TransformStep[] = [];
  if (p.roll) whole.push(rot('z', p.roll, [rig.cx + rig.height * 0.3, 0, rig.cz]));
  if (p.bob || p.dz) whole.push(move(0, p.bob ?? 0, p.dz ?? 0));
  const body: TransformStep[] = p.lean ? [rot('x', p.lean, rig.pivot(['body'], 'center'))] : [];
  const wingsR = rig.pivot(['wing_right'], 'inner'), wingsL = rig.pivot(['wing_left'], 'inner');
  return transformModel(rig.model, [
    { roles: ['leg_fr', 'leg_bl'], steps: [...(p.legA ? [rot('x', p.legA, rig.pivot(['leg_fr']))] : []), ...whole] },
    { roles: ['leg_fl', 'leg_br'], steps: [...(p.legB ? [rot('x', p.legB, rig.pivot(['leg_fl']))] : []), ...whole] },
    { roles: ['legs'], steps: whole },
    { roles: ['body', 'accessory'], steps: [...body, ...whole] },
    { roles: ['head', 'flame'], steps: [...body, ...(p.head ? [move(...p.head)] : []), ...whole] },
    { roles: ['tail'], steps: [...body, ...(p.tailX ? [move(p.tailX, 0, 0)] : []), ...whole] },
    { roles: ['wing_right'], steps: [...(p.wing ? [rot('z', p.wing, wingsR)] : []), ...body, ...whole] },
    { roles: ['wing_left'], steps: [...(p.wing ? [rot('z', -p.wing, wingsL)] : []), ...body, ...whole] },
  ]);
}

const QUAD_ANIMS: AnimDef[] = [
  { id: 'idle', name: 'Idle', group: 'Idle', frames: 4, fps: 6, loop: true, build: (rig, t) => quadFrame(rig, { head: [0, t >= 0.5 ? -1 : 0, 0], tailX: Math.round(sin(t)) }) },
  { id: 'walk', name: 'Laufen', group: 'Bewegung', frames: 8, fps: 10, loop: true, build: (rig, t) => quadFrame(rig, { legA: -25 * sin(t), legB: 25 * sin(t), bob: Math.round(1 - Math.abs(sin(t))) }) },
  { id: 'run', name: 'Rennen', group: 'Bewegung', frames: 6, fps: 14, loop: true, build: (rig, t) => quadFrame(rig, { legA: -45 * sin(t), legB: 45 * sin(t), bob: Math.round(1.5 * Math.abs(sin(t))), lean: 6 * sin(t) }) },
  {
    id: 'attack', name: 'Angriff (Biss)', group: 'Kampf', frames: 6, fps: 12, loop: false,
    build: (rig, t) => {
      const k = keys(t, [[0, 0], [0.3, -0.5], [0.55, 1], [1, 0]]);
      return quadFrame(rig, { head: [0, -Math.round(Math.max(0, k)), Math.round(k * 2)], dz: Math.round(Math.max(0, k)), lean: 8 * k });
    },
  },
  { id: 'hurt', name: 'Schaden erhalten', group: 'Reaktionen', frames: 3, fps: 10, loop: false, build: (rig, t) => quadFrame(rig, { dz: -Math.round(keys(t, [[0, 1], [1, 0]])), lean: -10 * keys(t, [[0, 1], [1, 0]]) }) },
  { id: 'death', name: 'Tod', group: 'Reaktionen', frames: 6, fps: 8, loop: false, build: (rig, t) => quadFrame(rig, { roll: keys(t, [[0, 0], [0.7, 85], [1, 90]]), legA: 30 * t, legB: -30 * t }) },
];

const FLY_ANIM: AnimDef = {
  id: 'fly', name: 'Fliegen', group: 'Bewegung', frames: 6, fps: 10, loop: true,
  build: (rig, t) => quadFrame(rig, { wing: 32 * sin(t), bob: 1 + Math.round(sin(t + 0.25)) }),
};

// ------------------------------------------------------------ Schleime & Co.

function removeAbove(rig: Rig, ratio: number): VoxelModel {
  const m = rig.model.clone();
  const limit = rig.height * ratio;
  for (const v of [...m.values()]) if (v.y > limit) m.remove(v.x, v.y, v.z);
  return m;
}
const BLOB = ['body', 'head', 'accessory'];
const SLIME_ANIMS: AnimDef[] = [
  { id: 'idle', name: 'Idle', group: 'Idle', frames: 4, fps: 6, loop: true, build: (rig, t) => transformModel(rig.model, [{ roles: ['head', 'accessory'], dy: t >= 0.5 ? -1 : 0 }]) },
  { id: 'walk', name: 'Hüpfen', group: 'Bewegung', frames: 6, fps: 10, loop: true, build: (rig, t) => transformModel(rig.model, [{ roles: BLOB, dy: Math.round(Math.max(0, Math.sin(t * Math.PI)) * rig.height * 0.25), dz: Math.round(t * 2) }]) },
  { id: 'attack', name: 'Angriff', group: 'Kampf', frames: 5, fps: 12, loop: false, build: (rig, t) => transformModel(rig.model, [{ roles: BLOB, dz: Math.round(Math.sin(t * Math.PI) * 3), dy: Math.round(Math.sin(t * Math.PI) * 2) }]) },
  { id: 'hurt', name: 'Schaden erhalten', group: 'Reaktionen', frames: 3, fps: 10, loop: false, build: (rig, t) => transformModel(rig.model, [{ roles: BLOB, dz: -Math.round(1 - t) }]) },
  { id: 'death', name: 'Zerfließen', group: 'Reaktionen', frames: 6, fps: 8, loop: false, build: (rig, t) => removeAbove(rig, 1 - t * 0.85) },
];

// ----------------------------------------------------------------- Objekte

function flicker(rig: Rig, i: number): VoxelModel {
  const ids = layerIdsForRoles(rig.model, ['flame']);
  const flames = [...rig.model.values()].filter((v) => ids.has(v.l));
  const colors = [...new Set(flames.map((v) => v.c))];
  const maxY = Math.max(...flames.map((v) => v.y)), minY = Math.min(...flames.map((v) => v.y));
  const rng = new Rng(1234 + i * 77);
  const m = rig.model.clone();
  for (const v of flames) {
    const t = (v.y - minY) / Math.max(1, maxY - minY);
    if (rng.chance(t * 0.55)) m.remove(v.x, v.y, v.z);
    else if (rng.chance(0.3)) m.setVoxel({ ...v, c: colors[rng.int(0, colors.length - 1)] });
  }
  const top = flames.filter((v) => v.y === maxY);
  if (top.length && i % 2 === 0) {
    const v = top[rng.int(0, top.length - 1)];
    m.setVoxel({ ...v, y: v.y + 1 });
  }
  return m;
}

/** Wasser: Farben der Wasser-Ebene zyklisch verschieben (Wellenbewegung). */
function waterCycle(rig: Rig, t: number): VoxelModel {
  const ids = layerIdsForRoles(rig.model, ['water']);
  const m = rig.model.clone();
  const cols = [...new Set([...m.values()].filter((v) => ids.has(v.l)).map((v) => v.c))].sort((a, b) => luminance(m.palette[a]) - luminance(m.palette[b]));
  if (cols.length < 2) return m;
  const shift = Math.floor(t * cols.length);
  for (const v of [...m.values()]) {
    if (!ids.has(v.l)) continue;
    const wave = Math.floor((v.x + v.z) / 3) + shift;
    m.setVoxel({ ...v, c: cols[((cols.indexOf(v.c) + (wave % 2)) % cols.length + cols.length) % cols.length] });
  }
  return m;
}

const OBJECT_ANIMS: (AnimDef & { needs?: string })[] = [
  { id: 'flicker', name: 'Feuer', group: 'Objekt', frames: 4, fps: 8, loop: true, needs: 'flame', build: (rig, _t, i) => flicker(rig, i) },
  {
    id: 'open', name: 'Tür öffnen', group: 'Objekt', frames: 6, fps: 10, loop: false, needs: 'door',
    build: (rig, t) => {
      const p = rig.pivot(['door'], 'center');
      const minX = rolePivot(rig.model, ['door'], 'inner') ?? p;
      return transformModel(rig.model, [{ roles: ['door'], rotate: { axis: 'y', deg: -95 * ease(t), pivot: [minX[0] - 0.5, p[1], p[2] - 0.5] } }]);
    },
  },
  {
    id: 'open', name: 'Deckel öffnen', group: 'Objekt', frames: 6, fps: 10, loop: false, needs: 'lid',
    build: (rig, t) => {
      const b = rig.pivot(['lid'], 'bottom');
      return transformModel(rig.model, [{ roles: ['lid'], rotate: { axis: 'x', deg: -75 * ease(t), pivot: [b[0], b[1], rig.minZ] } }]);
    },
  },
  { id: 'machine', name: 'Maschine (Drehung)', group: 'Objekt', frames: 8, fps: 10, loop: true, needs: 'blades', build: (rig, t) => transformModel(rig.model, [{ roles: ['blades'], rotate: { axis: 'z', deg: 90 * t, pivot: rig.pivot(['blades'], 'center') } }]) },
  { id: 'wind', name: 'Wind', group: 'Objekt', frames: 4, fps: 4, loop: true, needs: 'leaves', build: (rig, t) => transformModel(rig.model, [{ roles: ['leaves'], dx: Math.round(sin(t)) }]) },
  { id: 'wave', name: 'Fahne weht', group: 'Objekt', frames: 4, fps: 6, loop: true, needs: 'flag', build: (rig, t) => transformModel(rig.model, [{ roles: ['flag'], dz: Math.round(sin(t)) }]) },
  { id: 'smoke', name: 'Rauch', group: 'Objekt', frames: 6, fps: 6, loop: true, needs: 'smoke', build: (rig, t) => transformModel(rig.model, [{ roles: ['smoke'], dy: Math.round(t * 4), dx: Math.round(sin(t)) }]) },
  { id: 'water', name: 'Wasserbewegung', group: 'Objekt', frames: 4, fps: 4, loop: true, needs: 'water', build: (rig, t) => waterCycle(rig, t) },
];

const ITEM_ANIMS: AnimDef[] = [
  { id: 'bounce', name: 'Schweben', group: 'Objekt', frames: 4, fps: 6, loop: true, build: (rig, t) => transformModel(rig.model, [{ roles: allRoles(rig), dy: Math.round((1 - Math.cos(TAU * t)) ) }]) },
  {
    id: 'spin', name: 'Drehen', group: 'Objekt', frames: 4, fps: 4, loop: true,
    build: (rig, t) => transformModel(rig.model, [{ roles: allRoles(rig), rotate: { axis: 'y', deg: Math.round(t * 4) * 90, pivot: [Math.round(rig.cx), 0, Math.round(rig.cz)] } }]),
  },
];

function allRoles(rig: Rig): string[] {
  return [...rig.roles].filter((r) => r !== 'base');
}

// --------------------------------------------------------------- Auswahl

const CREATURES = new Set(['quadruped', 'dragon']);
const ITEMS = new Set(['weapon', 'potion', 'chest', 'crystal', 'spaceship', 'mushroom', 'custom', 'item']);

/** Alle passenden Animationen für ein Modell (anhand Archetyp und Ebenen-Rollen). */
export function animationsFor(model: VoxelModel, archetype: string): AnimDef[] {
  const roles = new Set(model.layers.map((l) => l.role).filter(Boolean));
  const out: AnimDef[] = [];
  if (archetype === 'humanoid' && (roles.has('leg_left') || roles.has('arm_right'))) out.push(...HUMAN_ANIMS);
  else if (CREATURES.has(archetype) || roles.has('leg_fr')) out.push(...QUAD_ANIMS);
  else if (archetype === 'slime') out.push(...SLIME_ANIMS);
  else if (archetype === 'bird') out.push(QUAD_ANIMS[0], QUAD_ANIMS[4], QUAD_ANIMS[5]);
  if (roles.has('wing_right') && roles.has('wing_left')) out.push(FLY_ANIM);
  for (const a of OBJECT_ANIMS) if (a.needs && roles.has(a.needs)) out.push(a);
  if (ITEMS.has(archetype) && !out.some((a) => a.group !== 'Objekt' || a.id === 'open')) out.push(...ITEM_ANIMS);
  else if (ITEMS.has(archetype)) out.push(ITEM_ANIMS[0]);
  return out;
}

export const ALL_ANIM_DEFS: AnimDef[] = [...HUMAN_ANIMS, FLY_ANIM, ...OBJECT_ANIMS, ...ITEM_ANIMS];

/** Baut die Frame-Modelle einer Animation (Frame-Anzahl frei wählbar). */
export function buildAnimationModels(model: VoxelModel, def: AnimDef, frames: number): VoxelModel[] {
  const rig = makeRig(model);
  const n = Math.max(1, Math.round(frames));
  const out: VoxelModel[] = [];
  for (let i = 0; i < n; i++) {
    // Loops: t läuft bis kurz vor 1 (Frame 0 = Frame n); Einmal-Animationen enden exakt auf t = 1
    const t = def.loop ? i / n : n === 1 ? 0 : i / (n - 1);
    out.push(def.build(rig, t, i, n));
  }
  return out;
}
