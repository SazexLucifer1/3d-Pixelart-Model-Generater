import type { BuildContext } from '../context';
import type { Vec3 } from '../Sculptor';
import { NAMED_COLORS as C, shade, mix } from '../../../palette/color';

/**
 * Kreaturen: Drache, Vierbeiner (Tierbibliothek), Vögel, Schleime.
 * Alle Kreaturen schauen in Richtung +z.
 */

// ============================================================================
//  Drache
// ============================================================================

export function buildDragon(ctx: BuildContext): void {
  const { s, r, col, has } = ctx;
  const body = col('body', '#c0392b');
  const belly = col('belly', mix(body, '#f2d37a', 0.55));
  const wing = col('wings', mix(shade(body, -0.1), belly, 0.4));
  const horn = col('horn', '#efe3c4');
  const eye = col('eyes', '#ffd23a');
  const spike = col('spikes', shade(body, -0.4));
  const fire = has('fire');

  const cy = r(9); // Körpermitte
  const rx = r(5), ry = r(4.5), rz = r(7.5);

  // Körper mit hellerem Bauch
  s.layer('Körper', 'body');
  s.ellipsoid(0, cy, 0, rx, ry, rz, body, { noise: 0.06 });
  s.recolorWhere((_x, y, z) => y <= cy - r(2) && z > -rz + 2, belly);
  // Rückenstacheln
  for (let z = -rz + 2; z <= rz - 1; z += Math.max(2, r(2.5))) s.cone(0, cy + ry, z, Math.max(0.5, r(0.8)), Math.max(2, r(2.5)), spike);

  // Beine mit Krallen
  const legs: [string, string, number, number][] = [
    ['Bein vorne rechts', 'leg_fr', 1, 1], ['Bein vorne links', 'leg_fl', -1, 1],
    ['Bein hinten rechts', 'leg_br', 1, -1], ['Bein hinten links', 'leg_bl', -1, -1],
  ];
  for (const [name, role, sx, sz] of legs) {
    s.layer(name, role);
    const x = sx * r(4), z = sz * r(4.5);
    s.cylinder(x, 0, z, Math.max(1, r(1.7)), cy, body, { noise: 0.05 }, Math.max(1, r(2.2)));
    s.box(x - 1, 0, z + Math.max(1, r(1.5)), x + 1, 0, z + Math.max(1, r(1.5)) + 1, horn); // Krallen
  }

  // Hals + Kopf
  s.layer('Kopf & Hals', 'head');
  const neck: Vec3[] = [[0, cy + r(2), rz - r(1.5)], [0, cy + r(6), rz + r(1)], [0, cy + r(9), rz + r(3)]];
  s.tube(neck, [r(2.8), r(2.3), r(2)], body, { noise: 0.05 });
  const hy = cy + r(9), hz = rz + r(4);
  s.box(-r(3), hy - r(1), hz - r(2), r(3), hy + r(3), hz + r(3), body, { noise: 0.05 }); // Schädel
  s.box(-r(2), hy - r(1), hz + r(3), r(2), hy + r(1.5), hz + r(7), body, { noise: 0.05 }); // Schnauze
  s.box(-r(2), hy - r(1), hz + r(3), r(2), hy - r(1), hz + r(7), belly); // Unterkiefer
  if (s.detail >= 2) {
    // Zähne
    s.mirrored((side) => s.set(side * r(2), hy - r(1) - 1, hz + r(6), '#ffffff'));
    // Nüstern
    s.mirrored((side) => s.set(side * r(1), hy + r(1.5), hz + r(7), shade(body, -0.5)));
  }
  s.mirrored((side) => {
    s.box(side * r(3), hy + r(1), hz + r(1), side * r(3), hy + r(1.8), hz + r(2), eye, { m: 'emissive', e: 0.7 });
    // Hörner nach hinten
    s.tube([[side * r(2), hy + r(3), hz - r(1)], [side * r(3), hy + r(5), hz - r(4)], [side * r(3.5), hy + r(6), hz - r(7)]], [Math.max(0.8, r(1)), Math.max(0.6, r(0.7)), 0.3], horn);
  });
  if (fire) {
    s.layer('Feueratem', 'flame');
    for (let i = 0; i < r(8); i++) {
      const rad = 0.8 + i * 0.35;
      const c = i < r(2) ? '#fff2a0' : i < r(5) ? '#ffa020' : '#e8401a';
      s.sphere(0, hy + Math.round(i * 0.1), hz + r(8) + i, rad, c, { m: 'emissive', e: 1 });
    }
  }

  // Schwanz
  s.layer('Schwanz', 'tail');
  const tail: Vec3[] = [[0, cy, -rz + 1], [0, cy - r(2), -rz - r(4)], [r(1), cy - r(3), -rz - r(8)], [r(3), cy - r(2), -rz - r(11)], [r(5), cy, -rz - r(12)]];
  s.tube(tail, [r(3), r(2.2), r(1.5), r(1), 0.5], body, { noise: 0.05 });
  const tip = tail[tail.length - 1];
  s.triangle([tip[0], tip[1] + 1, tip[2]], [tip[0] + r(2), tip[1] + r(3), tip[2] - r(1)], [tip[0] + r(2), tip[1] - r(1), tip[2] - r(2)], spike);

  // Flügel
  if (!has('no_wings')) {
    s.mirrored((side) => {
      s.layer(side === 1 ? 'Flügel rechts' : 'Flügel links', side === 1 ? 'wing_right' : 'wing_left');
      batWing(ctx, side, { x0: r(3), y0: cy + r(4), z0: r(1), span: r(14), rise: r(12), membrane: wing, bone: shade(body, -0.25), claw: horn });
    });
  }
}

/**
 * Planarer Fledermausflügel (Drachen, Dämonen): Vorderkante steigt an,
 * die Hinterkante bildet zwischen den "Fingern" Bögen. Gezeichnet in einer
 * nahezu senkrechten Ebene → saubere Pixel-Silhouette aus allen Blickwinkeln.
 */
export function batWing(
  ctx: BuildContext,
  side: 1 | -1,
  o: { x0: number; y0: number; z0: number; span: number; rise: number; membrane: string; bone: string; claw?: string; fingers?: number },
): void {
  const { s, r } = ctx;
  const fingers = o.fingers ?? 3;
  const top = (t: number) => o.y0 + Math.round(Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) * o.rise);
  const bottom = (t: number) => {
    const ft = (t * fingers) % 1;
    return o.y0 - r(1) + Math.round(t * o.rise * 0.45) + Math.round(Math.sin(ft * Math.PI) * Math.max(1, o.rise * 0.35) * Math.min(1, t * 2));
  };
  const zAt = (t: number) => o.z0 - Math.round(t * r(3));
  for (let u = 0; u <= o.span; u++) {
    const t = u / o.span;
    const x = side * (o.x0 + u);
    const yt = top(t), yb = Math.min(yt - 1, bottom(t));
    for (let y = yb; y < yt; y++) s.set(x, y, zAt(t), o.membrane);
    s.set(x, yt, zAt(t), o.bone);
  }
  // Finger-Knochen vom Handgelenk zu den Spitzen der Hinterkante
  const tw = 0.42;
  const wrist: Vec3 = [side * (o.x0 + Math.round(tw * o.span)), top(tw), zAt(tw)];
  for (let k = 1; k <= fingers; k++) {
    const t = k / fingers;
    s.line(wrist, [side * (o.x0 + Math.round(t * o.span)), bottom(t), zAt(t)], o.bone);
  }
  if (o.claw) s.set(wrist[0], wrist[1] + 1, wrist[2], o.claw);
}

// ============================================================================
//  Vierbeiner-Bibliothek
// ============================================================================

interface Species {
  body: string;
  belly?: string;
  legLen: number;
  bodyR: [number, number, number];
  head: [number, number, number]; // halbe Kopfmaße
  snout: number; // Schnauzenlänge
  ears: 'pointy' | 'floppy' | 'round' | 'long' | 'none';
  tail: 'long' | 'bushy' | 'short' | 'curly' | 'hair' | 'none';
  neck: number;
  mane?: string;
  horn?: 'unicorn' | 'cow' | 'antlers';
  spots?: string;
  fluffy?: boolean;
  nose?: string;
}

export const SPECIES: Record<string, Species> = {
  cat: { body: '#e8964a', belly: '#f6e2c8', legLen: 4, bodyR: [3, 3, 5.5], head: [4, 3.5, 3.5], snout: 1, ears: 'pointy', tail: 'long', neck: 1, nose: '#e87aa0' },
  dog: { body: '#a8703a', belly: '#e8d0a8', legLen: 5, bodyR: [3.2, 3.2, 6], head: [3.5, 3.5, 3.5], snout: 3, ears: 'floppy', tail: 'short', neck: 1.5, nose: '#2a2228' },
  wolf: { body: '#7c838e', belly: '#d8dce0', legLen: 6, bodyR: [3.2, 3.4, 7], head: [3.2, 3.2, 3.5], snout: 4, ears: 'pointy', tail: 'bushy', neck: 2, nose: '#2a2228' },
  fox: { body: '#e06a2a', belly: '#fff4e8', legLen: 4, bodyR: [2.8, 2.8, 6], head: [3.5, 3, 3], snout: 3, ears: 'pointy', tail: 'bushy', neck: 1, nose: '#2a2228' },
  horse: { body: '#8a5530', legLen: 10, bodyR: [3.5, 4, 8], head: [2.5, 3, 4], snout: 4, ears: 'pointy', tail: 'hair', neck: 6, mane: '#3a2418', nose: '#3a2418' },
  unicorn: { body: '#f4f0fa', legLen: 10, bodyR: [3.5, 4, 8], head: [2.5, 3, 4], snout: 4, ears: 'pointy', tail: 'hair', neck: 6, mane: '#e070c8', horn: 'unicorn', nose: '#d8b8c8' },
  pig: { body: '#f0a0b0', legLen: 3, bodyR: [4.5, 4, 6], head: [3.5, 3.5, 3], snout: 1.5, ears: 'floppy', tail: 'curly', neck: 0, nose: '#e07a90' },
  cow: { body: '#f2f0ea', legLen: 6, bodyR: [4.5, 4.5, 8], head: [3, 3.5, 3.5], snout: 2, ears: 'round', tail: 'hair', neck: 1, spots: '#2a2a2e', horn: 'cow', nose: '#f0a0b0' },
  bear: { body: '#6a4228', belly: '#8a5a38', legLen: 4, bodyR: [5, 5, 7], head: [4, 4, 3.5], snout: 2, ears: 'round', tail: 'short', neck: 0.5, nose: '#1a1418' },
  rabbit: { body: '#f2ece4', legLen: 2, bodyR: [3, 3, 4], head: [3, 3, 3], snout: 0.5, ears: 'long', tail: 'short', neck: 0, nose: '#f08aa0' },
  sheep: { body: '#f4f2ec', legLen: 4, bodyR: [4.5, 4, 6], head: [2.5, 3, 3], snout: 1.5, ears: 'floppy', tail: 'short', neck: 1, fluffy: true, nose: '#2a2428' },
  deer: { body: '#a86a3a', belly: '#f0dcc0', legLen: 9, bodyR: [3, 3.5, 6.5], head: [2.5, 3, 3.5], snout: 3, ears: 'pointy', tail: 'short', neck: 5, horn: 'antlers', nose: '#2a2228' },
  lion: { body: '#d8a44a', belly: '#f0d8a0', legLen: 6, bodyR: [3.8, 3.8, 7], head: [4, 4, 3.5], snout: 2, ears: 'round', tail: 'long', neck: 1.5, mane: '#8a4a1a', nose: '#5a3020' },
};

export function buildQuadruped(ctx: BuildContext): void {
  const { s, r, col } = ctx;
  const sp = SPECIES[ctx.spec.variant ?? 'cat'] ?? SPECIES.cat;
  const body = col('body', sp.body);
  const belly = col('belly', sp.belly ?? body);
  const accent = col('accent', sp.mane ?? shade(body, -0.3));
  const eyeCol = col('eyes', '#1e1a24');
  const noise = sp.fluffy ? 0.12 : 0.05;

  const legLen = r(sp.legLen);
  const [brx, bry, brz] = sp.bodyR.map((v) => Math.max(1, r(v)));
  const cy = legLen + bry - 1;

  s.layer('Körper', 'body');
  s.ellipsoid(0, cy, 0, brx, bry, brz, body, { noise });
  if (sp.belly) s.recolorWhere((_x, y) => y <= cy - Math.max(1, r(1.5)), belly);
  if (sp.spots) {
    s.recolorWhere((x, y, z) => ((Math.floor(x / 3) * 7 + Math.floor(y / 3) * 13 + Math.floor(z / 3) * 5) % 4 === 0), sp.spots);
  }

  // Beine
  const legs: [string, string, number, number][] = [
    ['Bein vorne rechts', 'leg_fr', 1, 1], ['Bein vorne links', 'leg_fl', -1, 1],
    ['Bein hinten rechts', 'leg_br', 1, -1], ['Bein hinten links', 'leg_bl', -1, -1],
  ];
  const legR = Math.max(1, r(1.2));
  for (const [name, role, sx, sz] of legs) {
    s.layer(name, role);
    const x = sx * Math.max(1, brx - legR);
    const z = sz * Math.max(1, brz - legR - 1);
    s.box(x - (legR > 1 ? 1 : 0), 0, z - (legR > 1 ? 1 : 0), x + (legR > 1 ? 1 : 0), cy - 1, z + (legR > 1 ? 1 : 0), sp.fluffy ? '#3a3236' : body);
    s.box(x - (legR > 1 ? 1 : 0), 0, z - (legR > 1 ? 1 : 0), x + (legR > 1 ? 1 : 0), 0, z + (legR > 1 ? 1 : 0), shade(sp.fluffy ? '#3a3236' : body, -0.35));
  }

  // Kopf
  s.layer('Kopf', 'head');
  const [hx, hy, hz] = sp.head.map((v) => Math.max(1, r(v)));
  const neck = r(sp.neck);
  const headY = cy + bry - 1 + neck;
  const headZ = brz + Math.round(hz * 0.6);
  if (neck > 0) s.tube([[0, cy + 1, brz - 2], [0, headY - 1, headZ - 1]], [Math.max(1.2, r(2)), Math.max(1, r(1.6))], body, { noise });
  const headCol = sp.fluffy ? '#3a3236' : body;
  s.box(-hx, headY - hy, headZ - hz, hx, headY + hy, headZ + hz, headCol, { noise: 0.03 });
  const snout = r(sp.snout);
  if (snout > 0) {
    s.box(-Math.max(1, hx - r(1.5)), headY - hy, headZ + hz, Math.max(1, hx - r(1.5)), headY - hy + Math.max(1, r(2)), headZ + hz + snout, sp.belly ? belly : shade(headCol, 0.15));
    s.box(-1, headY - hy + Math.max(1, r(2)), headZ + hz + snout, 0, headY - hy + Math.max(1, r(2)), headZ + hz + snout, sp.nose ?? '#2a2228');
  }
  // Augen
  s.mirrored((side) => {
    const ex = side * Math.max(1, hx - r(1.5));
    s.box(ex, headY + 1, headZ + hz, ex, headY + 1 + (r(1) > 1 ? 1 : 0), headZ + hz, eyeCol);
    if (s.detail >= 2) s.set(ex, headY + 2 + (r(1) > 1 ? 1 : 0), headZ + hz, '#ffffff', { paintOnly: true });
  });
  // Ohren
  s.mirrored((side) => {
    const ex = side * Math.max(1, hx - 1);
    const top = headY + hy;
    switch (sp.ears) {
      case 'pointy':
        s.cone(ex, top + 1, headZ - 1, Math.max(0.6, r(1.2)), Math.max(2, r(3)), headCol);
        break;
      case 'floppy':
        s.box(side * (hx + 1), headY - r(2), headZ - 1, side * (hx + 1), headY + hy, headZ + 1, shade(headCol, -0.25));
        break;
      case 'round':
        s.sphere(ex, top + 1, headZ - 1, Math.max(1, r(1.3)), headCol);
        break;
      case 'long':
        s.box(side * Math.max(1, hx - 2), top + 1, headZ - 1, side * Math.max(1, hx - 1), top + r(7), headZ, headCol);
        s.box(side * Math.max(1, hx - 2), top + 2, headZ + 1, side * Math.max(1, hx - 2), top + r(6), headZ + 1, '#f4b0c0');
        break;
    }
  });
  if (sp.mane && sp.neck > 2) {
    s.layer('Mähne', 'head');
    s.tube([[0, cy + bry, brz - 3], [0, headY + hy, headZ - hz]], [Math.max(1, r(1.2)), Math.max(1, r(1.2))], accent, { noise: 0.08 });
  } else if (sp.mane) {
    s.layer('Mähne', 'head');
    s.ellipsoid(0, headY, headZ - hz, hx + r(2), hy + r(2), Math.max(1, r(2)), accent, { noise: 0.1 });
  }
  if (sp.horn === 'unicorn') s.line([0, headY + hy, headZ + hz - 1], [0, headY + hy + r(6), headZ + hz + r(1)], col('horn', C.gold), 0, { m: 'metal' });
  if (sp.horn === 'cow') s.mirrored((side) => s.line([side * hx, headY + hy, headZ], [side * (hx + r(2)), headY + hy + r(2), headZ], '#efe6d0'));
  if (sp.horn === 'antlers') {
    s.mirrored((side) => {
      const a: Vec3 = [side * (hx - 1), headY + hy, headZ - 1];
      const b: Vec3 = [side * (hx + r(2)), headY + hy + r(5), headZ - r(2)];
      s.line(a, b, '#d8c09a');
      s.line([side * (hx + r(1)), headY + hy + r(3), headZ - 1], [side * (hx + r(1)), headY + hy + r(6), headZ + 1], '#d8c09a');
    });
  }

  // Schwanz
  if (sp.tail !== 'none') {
    s.layer('Schwanz', 'tail');
    const base: Vec3 = [0, cy + Math.round(bry / 2), -brz];
    switch (sp.tail) {
      case 'long':
        s.tube([base, [0, cy + r(3), -brz - r(3)], [0, cy + r(7), -brz - r(4)]], [Math.max(0.6, r(0.9)), Math.max(0.6, r(0.8)), 0.6], body);
        break;
      case 'bushy':
        s.tube([base, [0, cy, -brz - r(4)], [0, cy - r(1), -brz - r(7)]], [r(1.2), r(2), r(1.5)], body, { noise: 0.1 });
        s.sphere(0, cy - r(1), -brz - r(7), Math.max(1, r(1.3)), '#fff4e8');
        break;
      case 'short':
        s.sphere(0, cy + Math.round(bry / 2), -brz - 1, Math.max(1, r(1.2)), sp.fluffy ? body : shade(body, 0.1));
        break;
      case 'curly':
        s.tube([base, [r(1), cy + r(2), -brz - r(1)], [0, cy + r(3), -brz - r(2)], [-r(1), cy + r(2), -brz - r(1)]], [0.6], body);
        break;
      case 'hair':
        s.tube([base, [0, cy - r(2), -brz - r(2)], [0, r(3), -brz - r(3)]], [r(1.2), r(1.4), r(1)], accent, { noise: 0.1 });
        break;
    }
  }
}

// ============================================================================
//  Vögel
// ============================================================================

export function buildBird(ctx: BuildContext): void {
  const { s, r, col, spec } = ctx;
  const variant = spec.variant ?? 'bird';
  const phoenix = variant === 'phoenix';
  const body = col('body', phoenix ? '#e8501a' : variant === 'owl' ? '#8a6a4a' : variant === 'chicken' ? '#f4f0e8' : '#4a8ae0');
  const belly = col('belly', phoenix ? '#ffc040' : shade(body, 0.35));
  const beak = col('beak', '#f2b030');
  const glow = phoenix ? { m: 'emissive' as const, e: 0.6 } : {};

  const legH = r(4);
  const cy = legH + r(5);
  s.layer('Beine', 'legs');
  s.mirrored((side) => {
    s.box(side * r(2), 0, 0, side * r(2), legH, 0, beak);
    s.box(side * r(2), 0, 0, side * r(2), 0, 2, beak);
  });
  s.layer('Körper', 'body');
  s.ellipsoid(0, cy, 0, r(5), r(5.5), r(6), body, { noise: 0.06, ...glow });
  s.recolorWhere((_x, y, z) => z > 1 && y < cy + 1, belly);
  s.layer('Kopf', 'head');
  const hy = cy + r(7);
  s.sphere(0, hy, r(2), r(4), body, glow);
  for (let i = 0; i < r(3); i++) s.box(-Math.max(0, 1 - i), hy - 1, r(6) + i, Math.max(0, 1 - i), hy, r(6) + i, beak);
  s.mirrored((side) => {
    const big = variant === 'owl';
    s.box(side * r(2), hy + 1, r(5), side * (r(2) + (big ? 1 : 0)), hy + 1 + (big ? 1 : 0), r(5), big ? '#f8e040' : '#1e1a24');
  });
  if (variant === 'chicken') s.box(0, hy + r(4), 0, 0, hy + r(5.5), r(3), '#e0282a');
  if (variant === 'owl') s.mirrored((side) => s.cone(side * r(3), hy + r(3), r(1), 0.8, r(3), body));
  if (phoenix) {
    s.layer('Flammenkrone', 'flame');
    for (let i = 0; i < 3; i++) s.line([0, hy + r(3), r(1) - i * 2], [0, hy + r(7) - i, -r(2) - i * 2], '#ffd040', 0, { m: 'emissive', e: 1 });
  }
  s.mirrored((side) => {
    s.layer(side === 1 ? 'Flügel rechts' : 'Flügel links', side === 1 ? 'wing_right' : 'wing_left');
    const wing = shade(body, -0.2);
    if (phoenix || ctx.has('wings_spread')) {
      s.triangle([side * r(4), cy + r(2), 0], [side * r(16), cy + r(9), -r(2)], [side * r(10), cy - r(2), -r(4)], wing, glow);
    } else {
      s.ellipsoid(side * r(5), cy, -r(1), 1, r(4), r(5), wing, { noise: 0.05 });
    }
  });
  s.layer('Schwanzfedern', 'tail');
  s.triangle([0, cy, -r(5)], [-r(3), cy - r(2), -r(11)], [r(3), cy - r(2), -r(11)], phoenix ? '#ffb020' : shade(body, -0.25), glow);
}

// ============================================================================
//  Schleim
// ============================================================================

export function buildSlime(ctx: BuildContext): void {
  const { s, r, col } = ctx;
  const body = col('body', '#4ac86a');
  const rx = r(9), ry = r(7);
  s.layer('Schleim', 'body');
  for (let y = 0; y <= ry * 1.6; y++) {
    const t = y / (ry * 1.6);
    const rad = rx * Math.sqrt(Math.max(0, 1 - t * t)) * (y < 2 ? 0.92 : 1);
    s.disc('y', 0, 0, 0, y, rad, body, { m: 'glass' });
  }
  // Kern
  s.sphere(0, r(4), 0, Math.max(1, r(2.5)), shade(body, -0.35));
  // Glanzlicht
  s.box(-r(4), r(9), r(4), -r(3), r(10), r(5), '#ffffff', { paintOnly: true });
  // Gesicht
  s.layer('Gesicht', 'head');
  const fz = Math.round(rx * 0.85);
  s.mirrored((side) => s.box(side * r(3), r(5), fz, side * r(3), r(6.5), fz + 1, '#1e1a24'));
  s.box(-1, r(3.5), fz + 1, 1, r(3.5), fz + 1, '#1e1a24');
  if (ctx.has('crown')) {
    s.layer('Krone', 'accessory');
    const y0 = Math.round(ry * 1.6);
    s.shell(-r(3), y0, -r(3), r(3), y0 + 1, r(3), C.gold, { m: 'metal' });
    for (const [x, z] of [[-r(3), 0], [r(3), 0], [0, r(3)], [0, -r(3)]]) s.set(x, y0 + 2, z, C.gold, { m: 'metal' });
  }
}
