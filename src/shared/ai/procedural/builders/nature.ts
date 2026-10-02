import type { BuildContext } from '../context';
import { hash3 } from '../Sculptor';
import type { Vec3 } from '../Sculptor';
import { shade } from '../../../palette/color';

/**
 * Natur & Umgebung: Bäume, Felsen, Kristalle, Pilze, Lagerfeuer.
 */

// ============================================================================
//  Baum
// ============================================================================

export function buildTree(ctx: BuildContext): void {
  const { s, r, col, spec, has } = ctx;
  const variant = spec.variant ?? 'oak';
  const trunk = col('trunk', variant === 'birch' ? '#e8e4dc' : '#6e4628');
  const leafDefault: Record<string, string> = {
    oak: '#4a9a3a', bush: '#4a9a3a', pine: '#2e6a3e', autumn: '#d8782a', cherry: '#f4a0c0', dead: '#6e4628', palm: '#5aaa3a', birch: '#7ab84a', magic: '#5ae0c8',
  };
  const leaves = col('leaves', leafDefault[variant] ?? leafDefault.oak);

  if (variant === 'bush') {
    s.layer('Busch', 'leaves');
    for (const [x, z, rad] of [[0, 0, r(6)], [r(4), r(1), r(4.5)], [-r(4), -r(1), r(4.5)]] as const) s.ellipsoid(x, r(3), z, rad, rad * 0.75, rad, leaves, { noise: 0.15 });
    if (has('fruit') || s.detail >= 3) s.recolorWhere((x, y, z) => hash3(x, y, z, 21) > 0.93 && !s.has(x, y + 1, z), col('fruit', '#e03030'));
    return;
  }

  // Stamm mit Wurzeln
  s.layer('Stamm', 'trunk');
  const trunkH = variant === 'pine' ? r(6) : variant === 'palm' ? r(16) : r(11);
  const tr = Math.max(1, r(1.6));
  if (variant === 'palm') {
    const pts: Vec3[] = [[0, 0, 0], [r(1), r(6), 0], [r(3), r(12), 0], [r(4), trunkH, 0]];
    s.tube(pts, [tr, tr * 0.9, tr * 0.8, tr * 0.7], trunk, { noise: 0.15 });
  } else {
    s.cylinder(0, 0, 0, tr + 0.6, trunkH, trunk, { noise: 0.15 }, tr);
    if (variant === 'birch') s.recolorWhere((x, y, z) => hash3(x, y, z, 2) > 0.8, '#2a2a2e');
    s.mirrored((side) => {
      s.line([side * tr, 0, 0], [side * (tr + r(2)), 0, side * r(1)], trunk);
      s.line([0, 0, side * tr], [side * r(1), 0, side * (tr + r(2))], trunk);
    });
  }

  if (variant === 'dead') {
    s.layer('Äste', 'trunk');
    const branches: [Vec3, Vec3][] = [
      [[0, r(7), 0], [r(5), r(12), r(1)]], [[0, r(9), 0], [-r(5), r(14), -r(1)]],
      [[0, r(10), 0], [r(1), r(16), -r(4)]], [[r(3), r(10), 0], [r(6), r(11), r(3)]],
    ];
    for (const [a, b] of branches) s.line(a, b, trunk, 0.5);
    return;
  }

  s.layer('Krone', 'leaves');
  const leafVar = (x: number, y: number, z: number, baseY: number) => {
    const n = hash3(x, y, z, 11);
    const light = y > baseY ? 0.15 : -0.12;
    return n > 0.75 ? shade(leaves, light + 0.12) : n < 0.2 ? shade(leaves, light - 0.15) : shade(leaves, light);
  };

  if (variant === 'pine') {
    const tiers = 4;
    let y = trunkH - r(2);
    for (let t = 0; t < tiers; t++) {
      const rad = r(7) * (1 - t / (tiers + 0.5));
      const h = r(6);
      s.cone(0, y, 0, rad, h, leaves);
      y += Math.round(h * 0.65);
    }
    s.box(0, y, 0, 0, y + 1, 0, leaves);
    s.recolorWhere(() => true, (x, yy, z) => leafVar(x, yy, z, Math.round(y * 0.6)));
    if (has('snow')) s.recolorWhere((x, yy, z) => !s.has(x, yy + 1, z) && hash3(x, yy, z, 4) > 0.3, '#f4f8ff');
    return;
  }

  if (variant === 'palm') {
    const top: Vec3 = [r(4), trunkH + 1, 0];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const mid: Vec3 = [top[0] + Math.cos(a) * r(4), top[1] + r(1.5), top[2] + Math.sin(a) * r(4)];
      const end: Vec3 = [top[0] + Math.cos(a) * r(8), top[1] - r(2), top[2] + Math.sin(a) * r(8)];
      s.line(top, mid, leaves, 0.6);
      s.line(mid, end, leaves, 0.5);
    }
    s.layer('Kokosnüsse', 'decoration');
    s.sphere(top[0] + 1, top[1] - 1, 1, 0.8, '#6a4a2a');
    s.sphere(top[0] - 1, top[1] - 1, -1, 0.8, '#6a4a2a');
    return;
  }

  // Laubbaum: mehrere verrauschte Blattkugeln
  const cy = trunkH + r(3);
  const blobs: [number, number, number, number][] = [
    [0, cy, 0, r(6.5)], [r(4), cy - r(2), r(1), r(4.5)], [-r(4), cy - r(1), -r(1), r(4.5)],
    [r(1), cy + r(3), -r(2), r(4.5)], [-r(1), cy - r(1), r(4), r(4)],
  ];
  for (const [x, y, z, rad] of blobs) {
    const R = Math.ceil(rad);
    for (let dx = -R; dx <= R; dx++)
      for (let dy = -R; dy <= R; dy++)
        for (let dz = -R; dz <= R; dz++) {
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const wobble = (hash3(x + dx, y + dy, z + dz, 5) - 0.5) * 1.6;
          if (d <= rad + wobble * 0.6) s.set(x + dx, y + dy, z + dz, leaves);
        }
  }
  s.recolorWhere(() => true, (x, y, z) => leafVar(x, y, z, cy));
  // Ein paar Äste, die herausschauen
  s.layer('Stamm', 'trunk');
  s.line([0, trunkH - r(2), 0], [r(3), trunkH + r(1), r(2)], trunk);
  s.line([0, trunkH - r(1), 0], [-r(3), trunkH + r(2), -r(1)], trunk);
  // Früchte / Blüten
  if (has('fruit') || variant === 'cherry' || s.detail >= 3) {
    s.layer('Früchte', 'decoration');
    const fruit = col('fruit', variant === 'cherry' ? '#ffffff' : '#e03030');
    s.recolorWhere((x, y, z) => hash3(x, y, z, 21) > 0.94 && !s.has(x, y + 1, z), fruit, false);
  }
  if (has('snow')) s.recolorWhere((x, y, z) => y > trunkH && !s.has(x, y + 1, z) && hash3(x, y, z, 4) > 0.3, '#f4f8ff', false);
}

// ============================================================================
//  Fels
// ============================================================================

export function buildRock(ctx: BuildContext): void {
  const { s, r, col, has } = ctx;
  const stone = col('stone', '#8a8a92');
  s.layer('Fels', 'body');
  s.ellipsoid(0, r(3), 0, r(7), r(5), r(6), stone, { noise: 0.2 });
  s.ellipsoid(r(4), r(2), r(3), r(4), r(3.5), r(4), shade(stone, -0.05), { noise: 0.2 });
  s.ellipsoid(-r(3), r(6), -r(1), r(4), r(3), r(3.5), shade(stone, 0.05), { noise: 0.2 });
  // Abgeflachte Unterseite: alles unter y=0 wird vom Sculptor ignoriert.
  if (has('moss')) {
    s.layer('Moos', 'decoration');
    s.recolorWhere((x, y, z) => !s.has(x, y + 1, z) && hash3(x >> 1, y, z >> 1, 3) > 0.35, '#5a9a3a', false);
  }
}

// ============================================================================
//  Kristall
// ============================================================================

export function buildCrystal(ctx: BuildContext): void {
  const { s, r, col } = ctx;
  const crystal = col('crystal', '#7a5ae8');
  s.layer('Sockel', 'base');
  s.ellipsoid(0, 0, 0, r(7), r(3), r(6), '#5a5660', { noise: 0.2 });
  s.layer('Kristalle', 'crystal');
  const shards: [number, number, number, number, number, number][] = [
    // x, z, radius, height, tiltX, tiltZ
    [0, 0, 2.5, 18, 0, 0], [4, 2, 1.6, 11, 0.35, 0.15], [-4, 1, 1.8, 12, -0.4, 0.1],
    [1, -4, 1.5, 9, 0.1, -0.4], [-2, 4, 1.2, 7, -0.2, 0.4],
  ];
  shards.forEach(([x, z, rad, h, tx, tz], i) => {
    const R = Math.max(0.8, r(rad));
    const height = r(h);
    for (let y = 0; y < height; y++) {
      const t = y / height;
      const rr = t > 0.75 ? R * (1 - (t - 0.75) / 0.25) : R;
      const c = t > 0.85 ? shade(crystal, 0.45) : i % 2 ? shade(crystal, -0.1) : crystal;
      s.disc('y', r(x) + Math.round(tx * y), r(2), r(z) + Math.round(tz * y), y, Math.max(0, rr), c, { m: 'emissive', e: 0.55 });
    }
  });
}

// ============================================================================
//  Pilz
// ============================================================================

export function buildMushroom(ctx: BuildContext): void {
  const { s, r, col, has } = ctx;
  const cap = col('cap', '#d8302e');
  const stem = col('stem', '#efe6d2');
  const dots = col('dots', '#ffffff');
  const glow = has('glow');
  s.layer('Stiel', 'body');
  const stemH = r(10);
  s.cylinder(0, 0, 0, r(4), stemH, stem, { noise: 0.06 }, r(3));
  s.layer('Hut', 'head');
  const capR = r(10);
  const capY = stemH;
  for (let y = 0; y <= r(7); y++) {
    const t = y / r(7);
    const rr = capR * Math.sqrt(Math.max(0, 1 - t * t));
    s.disc('y', 0, capY, 0, y, rr, cap, glow ? { m: 'emissive', e: 0.45 } : { noise: 0.05 });
  }
  // Unterseite (Lamellen)
  s.cylinder(0, capY - 1, 0, capR - 1, 1, shade(stem, -0.2));
  s.recolorWhere((x, y, z) => y > capY && hash3(Math.floor(x / 3), Math.floor(y / 3), Math.floor(z / 3), 13) > 0.72, dots);
  if (has('door') || ctx.spec.variant === 'house') {
    s.layer('Tür & Fenster', 'detail');
    const front = r(3);
    s.box(-1, 0, front + 1, 1, r(5), front + 1, '#6a3e22');
    s.set(1, r(2.5), front + 2, '#e3b23c', { m: 'metal' });
    s.box(r(2), r(7), front, r(2), r(8), front, '#ffc858', { m: 'emissive', e: 0.8 });
  }
}

// ============================================================================
//  Lagerfeuer
// ============================================================================

export function buildCampfire(ctx: BuildContext): void {
  const { s, r } = ctx;
  const R = Math.max(3, r(5));
  // Steinring
  s.layer('Steinring', 'base');
  const steps = Math.max(8, Math.round(R * 4));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = Math.round(Math.cos(a) * R), z = Math.round(Math.sin(a) * R);
    const c = i % 3 === 0 ? '#6e6e78' : i % 3 === 1 ? '#8e8e98' : '#7a7a84';
    s.set(x, 0, z, c);
    if (i % 2 === 0) s.set(x, 1, z, shade(c, 0.1));
  }
  // Glut / Asche
  s.disc('y', 0, 0, 0, 0, R - 1.5, '#3a2a28');
  s.recolorWhere((x, y, z) => y === 0 && x * x + z * z < (R - 2) ** 2 && hash3(x, y, z, 4) > 0.55, '#ff6a1a');
  // Holzscheite (gekreuzt, pyramidenförmig)
  s.layer('Holzscheite', 'body');
  const L = R - 1;
  const logs: [Vec3, Vec3][] = [
    [[-L, 1, -1], [L - 1, Math.max(2, r(3)), 0]], [[L, 1, 1], [-L + 1, Math.max(2, r(3)), 0]],
    [[0, 1, -L], [0, Math.max(2, r(3)), L - 1]], [[-1, 1, L], [1, Math.max(2, r(3)), -L + 1]],
  ];
  for (const [a, b] of logs) s.line(a, b, '#6e4628', ctx.u > 1.4 ? 0.6 : 0);
  // Flammen: Säulen mit zufälliger Höhe → Flammenzungen; innen gelb, außen rot
  s.layer('Flammen', 'flame');
  const fh = Math.max(5, r(10));
  const fr = Math.max(1.5, R - 1.5);
  for (let x = -Math.ceil(fr); x <= Math.ceil(fr); x++)
    for (let z = -Math.ceil(fr); z <= Math.ceil(fr); z++) {
      const d = Math.sqrt(x * x + z * z) / (fr + 0.3);
      if (d > 1) continue;
      const n = hash3(x, 0, z, 31);
      const h = Math.max(1, Math.round(fh * (1 - d * 0.85) * (0.55 + 0.45 * n)));
      for (let y = 0; y < h; y++) {
        const t = y / h;
        const c = d < 0.45 && t < 0.75 ? '#fff6b0' : t > 0.8 || d > 0.8 ? '#f0501e' : '#ffb02a';
        s.set(x, y + 1, z, c, { m: 'emissive', e: 1 });
      }
    }
  // Funken
  if (s.detail >= 2) {
    for (let i = 0; i < s.detail - 1; i++) {
      s.set(s.rng.int(-1, 1), fh + 2 + i * 2, s.rng.int(-1, 1), '#ffd860', { m: 'emissive', e: 1 });
    }
  }
}
