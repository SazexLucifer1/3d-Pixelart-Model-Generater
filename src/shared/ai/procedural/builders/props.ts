import type { BuildContext } from '../context';
import { hash3 } from '../Sculptor';
import { NAMED_COLORS as C, shade } from '../../../palette/color';
import { batWing } from './creatures';

/**
 * Requisiten für komplette Spiele: Items & Quest-Items, Möbel & Deko,
 * Bauwerke, Landschaftselemente und Kleintiere. Alles prozedural.
 * Front = +z.
 */

const WOOD = '#8a5a34';
const WOOD_D = '#5e3a22';
const STONE = '#8c8c94';
const IRON = '#9aa4b0';

// ============================================================================
//  Items & Quest-Items
// ============================================================================

export function buildItem(ctx: BuildContext): void {
  const { s, r, col, spec, has } = ctx;
  const v = spec.variant ?? 'gem';
  const metal = col('metal', IRON);
  const accent = col('accent', C.gold);
  const glow = has('glow') || has('magic');
  switch (v) {
    case 'helmet': {
      s.layer('Helm', 'body');
      const R = r(8);
      for (let y = 0; y <= R; y++) s.disc('y', 0, r(2), 0, y, Math.sqrt(Math.max(0, R * R - y * y)), metal, { m: 'metal', noise: 0.04 });
      s.cylinder(0, r(2), 0, R + 0.6, 1, shade(metal, -0.2), { m: 'metal' });
      for (let x = -R + 2; x <= R - 2; x++) s.remove(x, r(2) + r(3), R);
      s.box(-R + 2, r(2) + r(3), R - 1, R - 2, r(2) + r(3), R - 1, '#1a1420');
      s.box(0, r(2) + r(4), R, 0, r(2) + R, R, shade(metal, -0.25), { m: 'metal' });
      if (has('plume') || s.detail >= 2) { s.layer('Helmbusch', 'accessory'); s.box(0, r(2) + R + 1, -R + 2, 0, r(2) + R + r(3), R - 2, col('plume', '#c8323c')); }
      if (has('horns')) s.mirrored((side) => s.tube([[side * R, r(2) + r(4), 0], [side * (R + r(3)), r(2) + r(7), 0], [side * (R + r(3)), r(2) + r(11), -1]], [1.2, 0.9, 0.4], '#efe3c4'));
      return;
    }
    case 'armor': {
      s.layer('Rüstung', 'body');
      const W = r(7), D = r(3.5), H = r(14);
      for (let y = 0; y < H; y++) {
        const t = y / H;
        const w = Math.round(W * (0.75 + 0.25 * t));
        s.box(-w, y, -D, w, y, D, metal, { m: 'metal', noise: 0.04 });
      }
      for (let x = -r(2); x <= r(2); x++) for (let y = H - r(3); y < H; y++) for (let z = -D + 1; z <= D - 1; z++) s.remove(x, y, z);
      s.mirrored((side) => s.ellipsoid(side * (W + 1), H - r(2), 0, r(2.5), r(2), D + 1, shade(metal, 0.1), { m: 'metal' }));
      s.box(-W, r(3), D, W, r(4), D, col('belt', '#5a3a24'));
      s.set(0, r(3.5), D + 1, accent, { m: 'metal' });
      s.box(0, r(5), D, 0, H - r(4), D, shade(metal, -0.25), { m: 'metal' });
      return;
    }
    case 'pickaxe':
    case 'shovel': {
      s.layer('Stiel', 'grip');
      s.box(0, 0, 0, 0, r(20), 0, col('grip', WOOD), { noise: 0.1 });
      s.layer('Kopf', 'blade');
      if (v === 'pickaxe') {
        for (let i = -r(8); i <= r(8); i++) s.set(i, r(20) - Math.round((i * i) / Math.max(1, r(14))), 0, metal, { m: 'metal' });
        s.box(-1, r(19), 0, 1, r(21), 0, shade(metal, -0.2), { m: 'metal' });
      } else {
        s.box(-r(3), 0, 0, r(3), r(6), 0, metal, { m: 'metal' });
        s.box(-r(2), r(19), 0, r(2), r(20), 0, col('grip', WOOD));
      }
      return;
    }
    case 'key': {
      s.layer('Schlüssel', 'body');
      const k = col('metal', C.gold);
      const R = r(4);
      for (let a = 0; a < 40; a++) {
        const t = (a / 40) * Math.PI * 2;
        s.set(Math.round(Math.cos(t) * R), r(18) + Math.round(Math.sin(t) * R), 0, k, { m: 'metal' });
      }
      s.box(0, r(2), 0, 0, r(18) - R, 0, k, { m: 'metal' });
      s.box(1, r(2), 0, r(3), r(3), 0, k, { m: 'metal' });
      s.box(1, r(5), 0, r(2), r(6), 0, k, { m: 'metal' });
      if (glow) s.set(0, r(18), 0, col('gem', '#40d0ff'), { m: 'emissive', e: 1 });
      return;
    }
    case 'scroll': {
      s.layer('Schriftrolle', 'body');
      const paper = col('paper', '#ead7a8');
      s.cylinder(-r(8), r(3), 0, r(2.5), r(16), paper, { noise: 0.05 }, r(2.5), 'x');
      s.disc('x', -r(8), r(3), 0, -1, r(3), shade(paper, -0.25));
      s.disc('x', -r(8), r(3), 0, r(16), r(3), shade(paper, -0.25));
      s.cylinder(-r(1), r(3), 0, r(2.8), r(2), col('ribbon', '#c8323c'), {}, r(2.8), 'x');
      return;
    }
    case 'book': {
      s.layer('Buch', 'body');
      const cover = col('cover', '#7a2a3a');
      s.box(-r(7), 0, -r(5), r(7), r(3), r(5), cover);
      s.box(-r(6), 1, -r(4), r(7), r(2), r(5), '#f2e8d0');
      s.box(-r(7), 0, -r(5), -r(7), r(3), r(5), shade(cover, -0.25));
      s.box(-r(2), r(3), -r(2), r(2), r(3), r(2), accent, glow ? { m: 'emissive', e: 0.8 } : { m: 'metal' });
      return;
    }
    case 'coin': {
      s.layer('Münzen', 'body');
      const g = col('metal', C.gold);
      for (let i = 0; i < 5; i++) s.cylinder((i % 2) * r(2) - r(1), i, (i % 3) - 1, r(5), 1, i % 2 ? shade(g, 0.15) : g, { m: 'metal' });
      s.cylinder(0, 5, 0, r(6), 1, g, { m: 'metal' }, r(6), 'y');
      s.disc('z', 0, r(9), 0, 0, r(7), g, { m: 'metal' });
      s.disc('z', 0, r(9), 0, 1, r(5), shade(g, 0.2), { m: 'metal' });
      return;
    }
    case 'ring': {
      s.layer('Ring', 'body');
      const g = col('metal', C.gold);
      for (let a = 0; a < 48; a++) {
        const t = (a / 48) * Math.PI * 2;
        s.sphere(Math.cos(t) * r(5), r(6) + Math.sin(t) * r(5), 0, 0.8, g, { m: 'metal' });
      }
      s.sphere(0, r(12), 0, r(2), col('gem', '#e02848'), { m: 'emissive', e: 0.7 });
      return;
    }
    case 'bag': {
      s.layer('Beutel', 'body');
      const cloth = col('cloth', '#8a6a44');
      s.ellipsoid(0, r(6), 0, r(7), r(6), r(6), cloth, { noise: 0.08 });
      s.cylinder(0, r(11), 0, r(2.5), r(4), cloth, {}, r(3.5));
      s.cylinder(0, r(12), 0, r(3), 1, col('rope', '#c8a050'));
      return;
    }
    default: {
      // Edelstein (Quest-Item)
      s.layer('Edelstein', 'body');
      const g = col('gem', '#40d0ff');
      const R = r(7);
      for (let y = -R; y <= R; y++) {
        const rr = (R - Math.abs(y)) * (y > 0 ? 0.9 : 1);
        s.disc('y', 0, R, 0, y, rr, y > 0 ? shade(g, 0.2) : g, { m: 'emissive', e: 0.6 });
      }
    }
  }
}

// ============================================================================
//  Möbel & Dekoration
// ============================================================================

export function buildFurniture(ctx: BuildContext): void {
  const { s, r, col, spec } = ctx;
  const v = spec.variant ?? 'barrel';
  const wood = col('wood', WOOD);
  switch (v) {
    case 'crate': {
      s.layer('Kiste', 'body');
      const W = r(8);
      s.box(-W, 0, -W, W, W * 2 - 1, W, wood, { noise: 0.12 });
      for (const f of [-W, W]) {
        s.box(f, 0, -W, f, W * 2 - 1, -W, WOOD_D);
        s.box(f, 0, W, f, W * 2 - 1, W, WOOD_D);
      }
      s.box(-W, W * 2 - 1, -W, W, W * 2 - 1, -W, WOOD_D);
      s.box(-W, W * 2 - 1, W, W, W * 2 - 1, W, WOOD_D);
      s.box(-W, 0, W, W, 0, W, WOOD_D);
      for (let i = -W; i <= W; i++) s.set(i, Math.round(((i + W) / (2 * W)) * (W * 2 - 1)), W, WOOD_D);
      return;
    }
    case 'table': {
      s.layer('Tisch', 'body');
      s.box(-r(10), r(8), -r(6), r(10), r(9), r(6), wood, { noise: 0.1 });
      for (const [x, z] of [[-r(9), -r(5)], [r(9), -r(5)], [-r(9), r(5)], [r(9), r(5)]]) s.box(x, 0, z, x, r(7), z, WOOD_D);
      return;
    }
    case 'chair': {
      s.layer('Stuhl', 'body');
      s.box(-r(4), r(6), -r(4), r(4), r(6), r(4), wood);
      for (const [x, z] of [[-r(4), -r(4)], [r(4), -r(4)], [-r(4), r(4)], [r(4), r(4)]]) s.box(x, 0, z, x, r(5), z, WOOD_D);
      s.box(-r(4), r(7), -r(4), r(4), r(15), -r(4), wood);
      return;
    }
    case 'bed': {
      s.layer('Bett', 'body');
      s.box(-r(6), 0, -r(10), r(6), r(4), r(10), wood);
      s.box(-r(6), r(4), -r(10), r(6), r(10), -r(10), WOOD_D);
      s.box(-r(5), r(5), -r(9), r(5), r(6), r(9), '#eceae0');
      s.box(-r(5), r(7), -r(9), r(5), r(7), -r(6), '#ffffff');
      s.box(-r(6), r(6), -r(3), r(6), r(7), r(10), col('blanket', '#3a62c8'), { noise: 0.05 });
      return;
    }
    case 'torch': {
      s.layer('Halter', 'body');
      s.box(0, 0, 0, 0, r(14), 0, WOOD_D);
      s.cylinder(0, r(14), 0, r(1.5), r(2), IRON, { m: 'metal' });
      s.layer('Flamme', 'flame');
      for (let y = 0; y < r(6); y++) {
        const rr = r(2) * (1 - y / r(6)) + 0.4;
        s.disc('y', 0, r(16), 0, y, rr, y < r(2) ? '#fff6b0' : y < r(4) ? '#ffb02a' : '#f0501e', { m: 'emissive', e: 1 });
      }
      return;
    }
    case 'door': {
      s.layer('Rahmen', 'structure');
      const W = r(5), Ht = r(14);
      s.box(-W - 2, 0, 0, -W - 1, Ht + 2, 0, STONE, { noise: 0.15 });
      s.box(W + 1, 0, 0, W + 2, Ht + 2, 0, STONE, { noise: 0.15 });
      s.box(-W - 2, Ht + 1, 0, W + 2, Ht + 3, 0, STONE, { noise: 0.15 });
      s.layer('Tür', 'door');
      s.box(-W, 0, 0, W, Ht, 0, wood, { noise: 0.1 });
      for (let x = -W; x <= W; x += 2) s.box(x, 0, 1, x, Ht, 1, x % 4 === 0 ? WOOD_D : wood);
      s.box(-W, r(3), 1, W, r(3), 1, IRON, { m: 'metal' });
      s.box(-W, Ht - r(3), 1, W, Ht - r(3), 1, IRON, { m: 'metal' });
      s.set(W - 1, Math.round(Ht / 2), 2, C.gold, { m: 'metal' });
      return;
    }
    case 'fence': {
      s.layer('Zaun', 'body');
      for (let x = -r(10); x <= r(10); x += r(5)) s.box(x, 0, 0, x, r(10), 0, wood);
      s.box(-r(10), r(4), 0, r(10), r(4), 0, WOOD_D);
      s.box(-r(10), r(8), 0, r(10), r(8), 0, WOOD_D);
      return;
    }
    case 'bookshelf': {
      s.layer('Regal', 'body');
      s.shell(-r(8), 0, -r(3), r(8), r(20), r(3), wood);
      s.box(-r(8), 0, -r(3), r(8), r(20), -r(3), WOOD_D);
      const colors = ['#7a2a3a', '#2a4a7a', '#3e6a32', '#8a6a2a', '#5a3a6a'];
      for (let shelf = 0; shelf < 4; shelf++) {
        const y0 = 1 + shelf * r(5);
        s.box(-r(8), y0 - 1, -r(3), r(8), y0 - 1, r(3), wood);
        for (let x = -r(7); x <= r(7); x++) s.box(x, y0, -r(2), x, y0 + r(3) - (hash3(x, shelf, 0, 1) > 0.6 ? 1 : 0), r(2), colors[Math.floor(hash3(x, shelf, 1, 2) * colors.length)]);
      }
      return;
    }
    case 'sign': {
      s.layer('Schild', 'body');
      s.box(0, 0, 0, 0, r(12), 0, WOOD_D);
      s.box(-r(6), r(8), 1, r(6), r(13), 1, wood, { noise: 0.1 });
      s.box(-r(4), r(10), 2, r(4), r(10), 2, WOOD_D);
      s.box(-r(3), r(11.5), 2, r(3), r(11.5), 2, WOOD_D);
      return;
    }
    case 'anvil': {
      s.layer('Amboss', 'body');
      s.box(-r(3), 0, -r(3), r(3), r(4), r(3), '#4a4e57');
      s.box(-r(6), r(5), -r(3), r(6), r(8), r(3), '#5a5e68', { m: 'metal' });
      s.box(r(6), r(6), -r(1), r(9), r(8), r(1), '#5a5e68', { m: 'metal' });
      return;
    }
    default: {
      // Fass
      s.layer('Fass', 'body');
      const H = r(14);
      for (let y = 0; y < H; y++) {
        const t = y / (H - 1);
        const rr = r(5) + Math.sin(t * Math.PI) * r(1.3);
        s.disc('y', 0, 0, 0, y, rr, Math.floor((y * 7) / H) % 2 ? wood : shade(wood, -0.08), { noise: 0.08 });
      }
      for (const y of [r(2), H - r(3)]) s.cylinder(0, y, 0, r(5) + 0.9, 1, IRON, { m: 'metal' });
      s.disc('y', 0, H - 1, 0, 0, r(4.5), WOOD_D);
    }
  }
}

// ============================================================================
//  Bauwerke
// ============================================================================

export function buildStructure(ctx: BuildContext): void {
  const { s, r, col, spec, has } = ctx;
  const v = spec.variant ?? 'well';
  switch (v) {
    case 'bridge': {
      const L = r(18), W = r(5);
      s.layer('Pfeiler', 'structure');
      for (const x of [-L, -Math.round(L / 3), Math.round(L / 3), L]) s.box(x - 1, 0, -W, x, r(6), W, STONE, { noise: 0.15 });
      s.layer('Planken', 'body');
      for (let x = -L - 1; x <= L + 1; x++) {
        const arch = Math.round(Math.sin(((x + L) / (2 * L)) * Math.PI) * r(2));
        s.box(x, r(7) + arch, -W, x, r(7) + arch, W, x % 2 ? col('wood', WOOD) : shade(col('wood', WOOD), -0.1));
        if (x % r(4) === 0) s.mirrored((side) => s.box(x, r(8) + arch, side * W, x, r(11) + arch, side * W, WOOD_D));
        s.mirrored((side) => s.set(x, r(11) + arch, side * W, WOOD_D));
      }
      if (has('water') || s.detail >= 2) {
        s.layer('Wasser', 'water');
        s.box(-L - 2, 0, -W - 3, L + 2, 0, W + 3, '#2c5aa0', { m: 'glass' });
        s.recolorWhere((x, y, z) => y === 0 && (x + z) % 3 === 0, '#5f9ad8');
      }
      return;
    }
    case 'windmill': {
      s.layer('Mühle', 'structure');
      const R = r(5), H = r(16);
      s.cylinder(0, 0, 0, R + 1, H, col('walls', '#eadcc0'), { noise: 0.06 }, R - 1);
      s.box(-1, 0, R, 1, r(4), R, WOOD_D);
      s.box(-1, r(9), R - 1, 0, r(10), R - 1, '#9cd0f0', { m: 'glass' });
      s.layer('Dach', 'roof');
      s.cone(0, H, 0, R + 1, r(6), col('roof', '#a8463a'), { noise: 0.1 });
      s.layer('Flügel', 'blades');
      const hub: [number, number, number] = [0, H - 1, R + 2];
      s.sphere(hub[0], hub[1], hub[2], 1, WOOD_D);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let i = 1; i <= r(11); i++) {
          s.set(hub[0] + dx * i, hub[1] + dy * i, hub[2], WOOD_D);
          if (i > r(3)) for (let w = 1; w <= r(2.5); w++) s.set(hub[0] + dx * i + dy * w, hub[1] + dy * i - dx * w, hub[2], '#e8e0d0');
        }
      }
      return;
    }
    case 'tent': {
      s.layer('Zelt', 'body');
      const L = r(9), H = r(9);
      for (let y = 0; y <= H; y++) {
        const w = Math.round(r(8) * (1 - y / H));
        s.box(-w, y, -L, -w, y, L, col('cloth', '#c8a050'));
        s.box(w, y, -L, w, y, L, col('cloth', '#c8a050'));
      }
      s.box(0, H, -L - 1, 0, H, L + 1, WOOD_D);
      return;
    }
    case 'ruins': {
      s.layer('Ruine', 'structure');
      for (const [x, z, h] of [[-r(8), -r(6), 14], [r(8), -r(6), 9], [-r(8), r(6), 6], [r(4), r(6), 11]] as const) {
        s.box(x - r(1.5), 0, z - r(1.5), x + r(1.5), r(h), z + r(1.5), STONE, { noise: 0.2 });
      }
      s.box(-r(8), 0, -r(6), r(8), r(5), -r(6), STONE, { noise: 0.2 });
      s.box(-r(8), r(14), -r(6), 0, r(15), -r(6) + 1, STONE, { noise: 0.15 });
      ruin(ctx, 0.5);
      return;
    }
    default: {
      // Brunnen
      s.layer('Brunnen', 'structure');
      const R = r(5);
      for (let y = 0; y < r(4); y++) {
        const rr = (R + 0.4) ** 2, ri = (R - 1.2) ** 2;
        for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
          const d = x * x + z * z;
          if (d <= rr && d >= ri) s.set(x, y, z, STONE, { noise: 0.2 });
        }
      }
      s.layer('Wasser', 'water');
      s.disc('y', 0, r(2), 0, 0, R - 1.5, '#2c5aa0', { m: 'glass' });
      s.disc('y', 0, r(2), 0, 0, R - 3, '#3f7cc4', { m: 'glass' });
      s.layer('Dach', 'roof');
      s.mirrored((side) => s.box(side * R, r(4), 0, side * R, r(11), 0, WOOD_D));
      for (let k = 0; k <= r(3); k++) s.box(-R - 1 + k, r(11) + k, -r(3) + k, R + 1 - k, r(11) + k, r(3) - k, col('roof', '#a8463a'));
      s.box(-R, r(9), 0, R, r(9), 0, WOOD);
    }
  }
}

/** Zerfall: obere Teile ausdünnen, Brocken entfernen, Moos ergänzen. */
export function ruin(ctx: BuildContext, strength = 0.45): void {
  const { s } = ctx;
  const b = s.model.bounds();
  if (!b) return;
  const H = b.maxY - b.minY + 1;
  // Dächer sind bei Ruinen eingestürzt (nur Reste bleiben)
  const roofLayers = new Set(s.model.layers.filter((l) => l.role === 'roof' || l.role === 'flag').map((l) => l.id));
  for (const v of [...s.model.values()]) if (roofLayers.has(v.l) && hash3(v.x >> 1, v.y >> 1, v.z >> 1, 31) < 0.88) s.model.remove(v.x, v.y, v.z);
  for (const v of [...s.model.values()]) {
    const t = (v.y - b.minY) / H;
    const n = hash3(Math.floor(v.x / 2), Math.floor(v.y / 2), Math.floor(v.z / 2), 77);
    if (t > 0.25 && n < strength * t) s.model.remove(v.x, v.y, v.z);
  }
  // Moos auf freiliegenden Oberseiten
  const moss = ctx.col('moss', '#5a9a3a');
  for (const v of [...s.model.values()]) {
    if (s.model.has(v.x, v.y + 1, v.z)) continue;
    if (hash3(v.x >> 1, v.y, v.z >> 1, 5) > 0.68) s.model.setVoxel({ ...v, c: s.model.colorIndex(hash3(v.x, v.z, 1, 9) > 0.5 ? moss : shade(moss, -0.2)) });
  }
}

// ============================================================================
//  Landschaft
// ============================================================================

export function buildTerrain(ctx: BuildContext): void {
  const { s, r, col, spec, has } = ctx;
  const v = spec.variant ?? 'mountain';
  const rock = col('stone', '#7c7f8a');
  switch (v) {
    case 'cave': {
      s.layer('Fels', 'body');
      s.ellipsoid(0, 0, 0, r(11), r(11), r(9), rock, { noise: 0.22 });
      s.layer('Eingang', 'detail');
      for (let y = 0; y < r(7); y++) for (let x = -r(3.5); x <= r(3.5); x++) {
        if ((x * x) / (r(3.5) ** 2) + (y * y) / (r(7) ** 2) > 1) continue;
        for (let z = 0; z <= r(10); z++) s.remove(x, y, z);
      }
      s.box(-r(3), 0, -r(2), r(3), r(5), -r(2), '#14121a');
      if (has('moss') || s.detail >= 2) s.recolorWhere((x, y, z) => !s.has(x, y + 1, z) && hash3(x, y, z, 3) > 0.55, '#5a9a3a', false);
      return;
    }
    case 'pond': {
      s.layer('Ufer', 'base');
      s.disc('y', 0, 0, 0, 0, r(11), col('shore', '#5aa03c'));
      s.disc('y', 0, 0, 0, 0, r(9), '#8a8a92');
      s.layer('Wasser', 'water');
      s.disc('y', 0, 0, 0, 0, r(8), '#2c5aa0', { m: 'glass' });
      s.disc('y', 0, 0, 0, 0, r(5), '#3f7cc4', { m: 'glass' });
      s.layer('Schilf', 'leaves');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r(9.5)), z = Math.round(Math.sin(a) * r(9.5));
        s.box(x, 1, z, x, r(4) + (i % 2), z, '#4a8a32');
        s.set(x, r(4) + (i % 2) + 1, z, '#7a4a28');
      }
      return;
    }
    case 'hill': {
      s.layer('Hügel', 'body');
      s.ellipsoid(0, 0, 0, r(12), r(7), r(10), col('grass', '#58993c'), { noise: 0.1 });
      s.recolorWhere((_x, y) => y <= 1, '#6a4428');
      return;
    }
    default: {
      // Berg
      s.layer('Berg', 'body');
      const H = r(22);
      for (let y = 0; y < H; y++) {
        const t = y / H;
        const rr = r(13) * (1 - t) ** 0.9;
        for (let x = -Math.ceil(rr); x <= Math.ceil(rr); x++)
          for (let z = -Math.ceil(rr); z <= Math.ceil(rr); z++) {
            const n = hash3(Math.floor(x / 2), y >> 1, Math.floor(z / 2), 4) * 2.5;
            if (x * x + z * z <= (rr + n - 1) ** 2) s.set(x, y, z, t > 0.7 ? '#eef4fa' : t > 0.62 && hash3(x, y, z, 1) > 0.5 ? '#eef4fa' : rock, { noise: 0.15 });
          }
      }
      s.recolorWhere((_x, y) => y < 2, '#4a7a32');
    }
  }
}

// ============================================================================
//  Kleintiere / Monster
// ============================================================================

export function buildCritter(ctx: BuildContext): void {
  const { s, r, col, spec } = ctx;
  const v = spec.variant ?? 'bat';
  if (v === 'spider') {
    const body = col('body', '#2a2430');
    s.layer('Körper', 'body');
    s.ellipsoid(0, r(5), -r(3), r(5), r(4), r(5), body, { noise: 0.06 });
    s.layer('Kopf', 'head');
    s.ellipsoid(0, r(4), r(3), r(3), r(2.5), r(3), shade(body, 0.1));
    s.mirrored((side) => s.box(side * 1, r(5), r(5.5), side * 1, r(5), r(5.5), '#ff3030', { m: 'emissive', e: 1 }));
    for (let i = 0; i < 4; i++) {
      const z = r(2) - i * r(2);
      s.mirrored((side) => {
        s.layer(i % 2 ? (side === 1 ? 'Bein vorne rechts' : 'Bein vorne links') : side === 1 ? 'Bein hinten rechts' : 'Bein hinten links', i % 2 ? (side === 1 ? 'leg_fr' : 'leg_fl') : side === 1 ? 'leg_br' : 'leg_bl');
        s.line([side * r(3), r(5), z], [side * r(8), r(8), z + side * 0], body);
        s.line([side * r(8), r(8), z], [side * r(11), 0, z - r(1)], body);
      });
    }
    return;
  }
  // Fledermaus
  const body = col('body', '#4a3a5a');
  s.layer('Körper', 'body');
  s.ellipsoid(0, r(10), 0, r(3), r(4), r(3), body);
  s.layer('Kopf', 'head');
  s.sphere(0, r(15), 0, r(3), body);
  s.mirrored((side) => {
    s.cone(side * r(2), r(17), 0, r(1), r(3), body);
    s.set(side * r(1), r(15), r(3), '#ffd23a', { m: 'emissive', e: 1 });
  });
  s.mirrored((side) => {
    s.layer(side === 1 ? 'Flügel rechts' : 'Flügel links', side === 1 ? 'wing_right' : 'wing_left');
    batWing(ctx, side, { x0: r(2), y0: r(9), z0: 0, span: r(10), rise: r(5), membrane: shade(body, -0.15), bone: shade(body, -0.35), fingers: 3 });
  });
}
