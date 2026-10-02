import type { BuildContext } from '../context';
import type { PrimitiveSpec } from '../../types';
import { NAMED_COLORS as C, shade } from '../../../palette/color';

/**
 * Gegenstände & Fahrzeuge: Truhe, einzelne Waffen, Trank, Raumschiff,
 * sowie der "custom"-Builder für freie Primitive (z.B. vom LLM).
 */

// ============================================================================
//  Schatztruhe
// ============================================================================

export function buildChest(ctx: BuildContext): void {
  const { s, r, col, has } = ctx;
  const wood = col('wood', '#8a5a34');
  const metal = col('metal', C.gold);
  const W = r(8), D = r(5), h = r(6);
  const open = has('open') || has('gold');
  s.layer('Truhe', 'body');
  s.box(-W, 0, -D, W, h, D, wood, { noise: 0.12 });
  if (open) for (let x = -W + 1; x <= W - 1; x++) for (let z = -D + 1; z <= D - 1; z++) s.remove(x, h, z);
  // Beschläge
  for (const x of [-W + 1, W - 1]) s.shell(x, 0, -D, x, h, D, metal, { m: 'metal' });
  s.box(-W, 0, -D, W, 0, D, shade(wood, -0.25));
  s.layer('Deckel', 'lid');
  if (open) {
    // Aufgeklappter Deckel hinten
    s.box(-W, h + 1, -D - 1, W, h + r(5), -D - 1, wood, { noise: 0.12 });
    s.box(-W, h + r(5), -D - 1, W, h + r(5), -D, shade(wood, 0.1));
    s.layer('Gold', 'treasure');
    for (let x = -W + 1; x <= W - 1; x++)
      for (let z = -D + 1; z <= D - 1; z++) {
        const top = h - 1 + ((x * 7 + z * 3) % 3 === 0 ? 1 : 0);
        s.box(x, h - 2, z, x, top, z, (x + z) % 2 ? '#f2c53d' : '#e0a028', { m: 'metal' });
      }
    s.set(1, h + 1, 0, '#e02848');
    s.set(-2, h, 1, '#38c8f0');
  } else {
    for (let y = 0; y < r(3); y++) {
      const rr = D - Math.round((y / r(3)) ** 2 * D * 0.5);
      s.box(-W, h + 1 + y, -rr, W, h + 1 + y, rr, wood, { noise: 0.12 });
    }
    for (const x of [-W + 1, W - 1]) s.recolorWhere((xx, y) => xx === x && y > h, metal);
  }
  s.layer('Schloss', 'detail');
  s.box(-1, h - 1, D + 1, 1, h + 1, D + 1, metal, { m: 'metal' });
  s.set(0, h - 1, D + 1, '#2a2228');
}

// ============================================================================
//  Einzelne Waffe (Ausstellungsstück)
// ============================================================================

export function buildWeapon(ctx: BuildContext): void {
  const { s, r, col, spec } = ctx;
  const variant = spec.variant ?? 'sword';
  const metal = col('metal', '#ccd6e0');
  const accent = col('accent', C.gold);
  const grip = col('grip', '#5a3424');
  const gem = col('gem', '#e02848');
  const glow = ctx.has('glow') || ctx.has('magic');
  const bladeOpts = glow ? { m: 'emissive' as const, e: 0.6 } : { m: 'metal' as const };
  const H = ctx.H;

  if (variant === 'sword') {
    s.layer('Griff', 'grip');
    s.box(0, 0, 0, 0, r(4), 0, grip);
    s.sphere(0, 0, 0, Math.max(0.8, r(0.9)), accent, { m: 'metal' });
    s.layer('Parierstange', 'guard');
    s.box(-r(4), r(5), 0, r(4), r(5) + (r(1) > 1 ? 1 : 0), 0, accent, { m: 'metal' });
    s.set(0, r(5), 1, gem, { m: 'emissive', e: 0.6 });
    s.layer('Klinge', 'blade');
    const bw = Math.max(1, r(1.3));
    const top = H - 1;
    for (let y = r(6); y <= top; y++) {
      const w = y > top - bw * 2 ? Math.max(0, bw - Math.ceil((y - (top - bw * 2)) / 2)) : bw;
      s.box(-w, y, 0, w, y, 0, y % 4 === 0 ? shade(metal, 0.15) : metal, bladeOpts);
    }
    s.box(0, r(7), 1, 0, top - bw * 2, 1, shade(metal, -0.2), bladeOpts); // Hohlkehle
    return;
  }
  if (variant === 'axe') {
    s.layer('Stiel', 'grip');
    s.box(0, 0, 0, 0, H - 2, 0, grip, { noise: 0.1 });
    s.layer('Axtblatt', 'blade');
    for (let y = 0; y < r(9); y++) {
      const t = Math.abs(y - r(4.5)) / r(4.5);
      const len = Math.round(r(6) * (1 - t * 0.5));
      s.box(1, H - r(10) + y, 0, len, H - r(10) + y, 0, metal, bladeOpts);
    }
    return;
  }
  if (variant === 'staff') {
    s.layer('Stab', 'grip');
    s.box(0, 0, 0, 0, H - r(5), 0, grip, { noise: 0.12 });
    s.layer('Kristall', 'gem');
    s.sphere(0, H - r(3), 0, r(2.2), col('gem', '#40d0ff'), { m: 'emissive', e: 1 });
    s.mirrored((side) => s.line([0, H - r(6), 0], [side * r(2), H - r(3), 0], accent, 0, { m: 'metal' }));
    return;
  }
  if (variant === 'shield') {
    s.layer('Schild', 'body');
    const W = r(8);
    for (let y = 0; y <= H - 2; y++) {
      const t = y / (H - 2);
      const w = t < 0.35 ? Math.round(W * Math.sqrt(t / 0.35)) : W;
      s.box(-w, y, 0, w, y, 0, col('shield', '#2a4ab0'), { noise: 0.05 });
      if (w > 0) {
        s.set(-w, y, 1, metal, { m: 'metal' });
        s.set(w, y, 1, metal, { m: 'metal' });
      }
    }
    s.box(-W, H - 2, 1, W, H - 2, 1, metal, { m: 'metal' });
    s.layer('Wappen', 'detail');
    s.box(0, r(5), 1, 0, H - r(5), 1, accent, { m: 'metal' });
    s.box(-r(4), H - r(9), 1, r(4), H - r(9), 1, accent, { m: 'metal' });
    return;
  }
  if (variant === 'bow') {
    s.layer('Bogen', 'body');
    const half = Math.round(H / 2) - 1;
    for (let i = -half; i <= half; i++) {
      const t = i / half;
      s.set(0, half + i + 1, Math.round((1 - t * t) * r(5)), grip);
    }
    s.box(0, 1, 0, 0, half * 2 + 1, 0, '#e8e0d0');
    return;
  }
  // Hammer
  s.layer('Stiel', 'grip');
  s.box(0, 0, 0, 0, H - r(5), 0, grip, { noise: 0.1 });
  s.layer('Kopf', 'blade');
  s.box(-r(5), H - r(6), -r(2.5), r(5), H - 1, r(2.5), metal, { m: 'metal', noise: 0.08 });
}

// ============================================================================
//  Trank
// ============================================================================

export function buildPotion(ctx: BuildContext): void {
  const { s, r, col } = ctx;
  const liquid = col('liquid', '#e0285a');
  s.layer('Flasche', 'body');
  const R = r(7);
  for (let y = 0; y <= R * 2; y++) {
    const t = (y - R) / R;
    s.disc('y', 0, 0, 0, y, R * Math.sqrt(Math.max(0, 1 - t * t)), '#cfe8f4', { m: 'glass' });
  }
  s.cylinder(0, R * 2, 0, r(2), r(4), '#cfe8f4', { m: 'glass' });
  s.layer('Flüssigkeit', 'liquid');
  for (let y = 1; y <= Math.round(R * 1.2); y++) {
    const t = (y - R) / R;
    s.disc('y', 0, 0, 0, y, (R - 1) * Math.sqrt(Math.max(0, 1 - t * t)), liquid, { m: 'emissive', e: 0.5 });
  }
  s.layer('Korken', 'detail');
  s.cylinder(0, R * 2 + r(4), 0, r(2) - 0.2, r(2), '#a87a4a');
}

// ============================================================================
//  Raumschiff
// ============================================================================

export function buildSpaceship(ctx: BuildContext): void {
  const { s, r, col } = ctx;
  const hull = col('hull', '#c8d0dc');
  const accent = col('accent', '#d83a4a');
  const glow = col('glow', '#40d8ff');
  const L = r(14);
  const cy = r(6);
  s.layer('Rumpf', 'body');
  s.ellipsoid(0, cy, 0, r(4), r(3.5), L, hull, { m: 'metal', noise: 0.05 });
  s.recolorWhere((_x, y, z) => y === cy && z > -L + 2, accent);
  s.layer('Cockpit', 'detail');
  s.ellipsoid(0, cy + r(3), r(5), r(2.5), r(2), r(4), '#2a4a7a', { m: 'glass' });
  s.layer('Flügel', 'wings');
  s.mirrored((side) => {
    s.triangle([side * r(3), cy, r(4)], [side * r(15), cy - r(1), -r(8)], [side * r(3), cy, -r(10)], hull, { m: 'metal' });
    s.line([side * r(14), cy - r(1), -r(7)], [side * r(14), cy - r(1), -r(10)], accent);
    s.cylinder(side * r(14), cy - r(1), -r(10), Math.max(0.8, r(1)), r(10), shade(hull, -0.2), {}, Math.max(0.8, r(1)), 'z');
  });
  s.layer('Leitwerk', 'wings');
  s.triangle([0, cy + r(3), -r(6)], [0, cy + r(9), -L - r(1)], [0, cy + r(3), -L + 1], hull, { m: 'metal' });
  s.layer('Triebwerke', 'engine');
  s.mirrored((side) => {
    s.cylinder(side * r(2.5), cy - r(1), -L - r(1), r(1.8), r(4), shade(hull, -0.35), {}, r(1.8), 'z');
    s.disc('z', side * r(2.5), cy - r(1), -L - r(1), -1, r(1.3), glow, { m: 'emissive', e: 1 });
  });
  s.layer('Landebeine', 'legs');
  for (const [x, z] of [[-r(3), r(6)], [r(3), r(6)], [0, -r(8)]]) s.box(x, 0, z, x, cy - r(3), z, '#4a4e57');
}

// ============================================================================
//  Freie Primitive (LLM / Custom)
// ============================================================================

export function buildCustom(ctx: BuildContext): void {
  const { s, H } = ctx;
  const prims: PrimitiveSpec[] = ctx.spec.primitives ?? [];
  for (const p of prims) {
    s.layer(p.part || 'Form', 'custom');
    const [ax, ay, az] = p.at.map((v) => v * H);
    const [w, h, d] = p.size.map((v) => Math.max(0.5, v * H));
    const opts = { m: p.material ?? 'diffuse', noise: 0.05 } as const;
    switch (p.shape) {
      case 'box':
        s.box(ax - w / 2, ay - h / 2, az - d / 2, ax + w / 2 - 1, ay + h / 2 - 1, az + d / 2 - 1, p.color, opts);
        break;
      case 'sphere':
        s.ellipsoid(ax, ay, az, w / 2, h / 2, d / 2, p.color, opts);
        break;
      case 'cylinder':
        s.cylinder(ax, ay, az, w / 2, Math.round(h), p.color, opts);
        break;
      case 'cone':
        s.cone(ax, ay, az, w / 2, Math.round(h), p.color, opts);
        break;
    }
  }
}
