import type { BuildContext } from '../context';
import { hash3 } from '../Sculptor';
import { shade } from '../../../palette/color';
import { ruin } from './props';

/**
 * Gebäude: Haus/Hütte, Turm, Burg.
 * Die Vorderseite (Tür) zeigt nach +z.
 */

const WOOD = '#8a5a34';
const STONE = '#8c8c94';

/** Moos- und Schnee-Auflage auf Dachflächen. */
function decorateRoof(ctx: BuildContext, isRoof: (x: number, y: number, z: number) => boolean): void {
  const { s, has, col } = ctx;
  if (has('moss')) {
    const moss = col('moss', '#5a9a3a');
    s.layer('Moos', 'decoration');
    s.recolorWhere(
      (x, y, z) => isRoof(x, y, z) && hash3(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2), 7) > 0.42,
      (x, y, z) => (hash3(x, y, z, 3) > 0.5 ? moss : shade(moss, -0.2)),
      false,
    );
  }
  if (has('snow')) {
    s.recolorWhere((x, y, z) => isRoof(x, y, z) && !s.has(x, y + 1, z), '#f4f8ff', false);
  }
}

// ============================================================================
//  Haus / Hütte
// ============================================================================

export function buildHouse(ctx: BuildContext): void {
  const { s, r, col, has, spec, blueprint } = ctx;
  const variant = spec.variant ?? 'hut';
  const stoneHouse = variant === 'stone';
  const cottage = variant === 'cottage';
  const wall = col('walls', stoneHouse ? STONE : cottage ? '#eadcc0' : WOOD);
  const wallDark = shade(wall, -0.22);
  const frame = col('frame', '#5a3820');
  const roof = col('roof', variant === 'hut' ? '#c49a4a' : stoneHouse ? '#4e5668' : '#a8463a');
  const door = col('door', '#6a3e22');
  const night = blueprint.mood === 'night' || has('glow');
  const windowCol = night ? '#ffc858' : col('window', '#9cd0f0');
  const windowOpts = night ? { m: 'emissive' as const, e: 0.9 } : { m: 'glass' as const };

  const W = r(8), D = r(7), wallH = Math.max(4, r(9));

  // Fundament
  s.layer('Fundament', 'structure');
  s.box(-W - 1, 0, -D - 1, W + 1, 0, D + 1, STONE, { noise: 0.15 });

  // Wände
  s.layer('Wände', 'structure');
  for (let y = 1; y <= wallH; y++) {
    const c = variant === 'hut' ? (y % 2 === 0 ? wall : wallDark) : wall;
    s.shell(-W, y, -D, W, y, D, c, { noise: stoneHouse ? 0.18 : 0.08 });
  }
  if (variant === 'hut') {
    // Überstehende Balkenenden an den Ecken (Blockhaus)
    for (let y = 1; y <= wallH; y += 2)
      for (const [x, z] of [[-W - 1, -D], [W + 1, -D], [-W - 1, D], [W + 1, D], [-W, -D - 1], [W, -D - 1], [-W, D + 1], [W, D + 1]]) s.set(x, y, z, wallDark);
  } else if (cottage) {
    // Fachwerk
    for (const x of [-W, 0, W]) s.box(x, 1, D, x, wallH, D, frame);
    for (const x of [-W, 0, W]) s.box(x, 1, -D, x, wallH, -D, frame);
    for (const z of [-D, 0, D]) s.mirrored((side) => s.box(side * W, 1, z, side * W, wallH, z, frame));
    s.shell(-W, wallH, -D, W, wallH, D, frame);
    s.shell(-W, Math.round(wallH / 2), -D, W, Math.round(wallH / 2), D, frame);
  }
  // Boden innen
  s.box(-W + 1, 1, -D + 1, W - 1, 1, D - 1, shade(WOOD, -0.1));
  // Inneren Raum freihalten (Fußboden bleibt)
  // Tür (vorne, mittig)
  s.layer('Tür & Fenster', 'detail');
  const doorW = Math.max(1, r(1.2));
  const doorH = Math.max(3, r(5));
  s.box(-doorW, 1, D, doorW, doorH, D, door);
  s.box(-doorW - 1, doorH + 1, D, doorW + 1, doorH + 1, D, frame);
  s.set(doorW, Math.round(doorH / 2) + 1, D + 1, '#e3b23c', { m: 'metal' });
  // Fenster
  const win = (x: number, z: number, axis: 'x' | 'z') => {
    const wy = Math.round(wallH * 0.45) + 1;
    const ws = Math.max(1, r(1.2));
    for (let a = -ws; a <= ws - 1; a++) {
      for (let b = 0; b < ws * 2; b++) {
        if (axis === 'z') s.set(x + a, wy + b, z, windowCol, windowOpts);
        else s.set(x, wy + b, z + a, windowCol, windowOpts);
      }
    }
    // Rahmen + Sprossen
    if (axis === 'z') {
      s.box(x - ws - 1, wy - 1, z, x + ws, wy - 1, z + (s.detail >= 2 ? 1 : 0), frame);
      s.box(x - ws - 1, wy + ws * 2, z, x + ws, wy + ws * 2, z, frame);
    } else {
      s.box(x, wy - 1, z - ws - 1, x + (s.detail >= 2 ? Math.sign(x) : 0), wy - 1, z + ws, frame);
      s.box(x, wy + ws * 2, z - ws - 1, x, wy + ws * 2, z + ws, frame);
    }
  };
  if (W >= 5) {
    win(-Math.round(W * 0.6), D, 'z');
    win(Math.round(W * 0.6), D, 'z');
  }
  win(W, 0, 'x');
  win(-W, 0, 'x');
  win(0, -D, 'z');

  // Satteldach (First entlang x)
  s.layer('Dach', 'roof');
  const roofTop = wallH + 1;
  let k = 0;
  for (; D + 1 - k >= 0; k++) {
    const y = roofTop + k;
    const zz = D + 1 - k;
    for (let x = -W - 1; x <= W + 1; x++) {
      s.set(x, y, zz, roof, { noise: 0.14 });
      s.set(x, y, -zz, roof, { noise: 0.14 });
      if (zz > 0) {
        s.set(x, y, zz - 1, shade(roof, -0.12), { noise: 0.1 });
        s.set(x, y, -zz + 1, shade(roof, -0.12), { noise: 0.1 });
      }
    }
    // Giebelwände
    if (zz - 1 > 0) s.mirrored((side) => s.box(side * W, y, -zz + 1, side * W, y, zz - 1, cottage ? '#eadcc0' : wallDark));
  }
  const ridgeY = roofTop + k - 1;
  s.box(-W - 1, ridgeY, 0, W + 1, ridgeY, 0, shade(roof, -0.3));
  decorateRoof(ctx, (_x, y, z) => y >= roofTop && Math.abs(z) >= D + 1 - (y - roofTop) - 1);

  // Schornstein
  if (has('chimney') || s.detail >= 2) {
    s.layer('Schornstein', 'structure');
    const cx = Math.round(W * 0.55), cz = -Math.round(D * 0.4);
    s.box(cx - 1, roofTop, cz - 1, cx, ridgeY + Math.max(2, r(2)), cz, STONE, { noise: 0.18 });
    if (has('smoke')) {
      s.layer('Rauch', 'smoke');
      for (let i = 0; i < 3; i++) s.sphere(cx + i, ridgeY + r(4) + i * 2, cz - i, 0.8 + i * 0.4, '#c8c8d0');
    }
  }

  // Details (Detailgrad 3): Blumenkästen, Laterne, Fass
  if (s.detail >= 3 || has('lantern')) {
    s.layer('Laterne', 'light');
    s.set(doorW + 2, doorH, D + 1, '#2a2228');
    s.set(doorW + 2, doorH - 1, D + 1, '#ffd060', { m: 'emissive', e: 1 });
  }
  if (s.detail >= 3) {
    s.layer('Deko', 'decoration');
    for (const x of [-Math.round(W * 0.6), Math.round(W * 0.6)]) {
      const wy = Math.round(wallH * 0.45);
      s.box(x - 1, wy, D + 1, x + 1, wy, D + 1, WOOD);
      s.set(x - 1, wy + 1, D + 1, '#e04870');
      s.set(x + 1, wy + 1, D + 1, '#f0d040');
      s.set(x, wy + 1, D + 1, '#4a9e3f');
    }
    s.cylinder(-W - 2, 1, D - 1, 1, 3, '#7a4a28', { noise: 0.1 });
  }
  if (has('ruined')) ruin(ctx, 0.4);
}

// ============================================================================
//  Turm
// ============================================================================

export function buildTower(ctx: BuildContext): void {
  const { s, r, col, has, blueprint, spec } = ctx;
  const wizard = spec.variant === 'wizard';
  const stone = col('walls', STONE);
  const roof = col('roof', wizard ? '#5a3a9a' : '#3e4a6a');
  const R = Math.max(3, r(4.5));
  const h = r(16);
  const glow = blueprint.mood === 'night' || wizard;

  s.layer('Turm', 'structure');
  s.cylinder(0, 0, 0, R + 1, 2, stone, { noise: 0.2 });
  for (let y = 2; y < h; y++) {
    const rr = (R + 0.4) ** 2, ri = (R - 0.6) ** 2;
    for (let x = -R; x <= R; x++)
      for (let z = -R; z <= R; z++) {
        const d = x * x + z * z;
        if (d <= rr && d >= ri) s.set(x, y, z, stone, { noise: 0.2 });
      }
  }
  // Zinnen / Kragen
  s.cylinder(0, h, 0, R + 1, 1, shade(stone, -0.1), { noise: 0.1 });
  // Fenster
  s.layer('Fenster', 'detail');
  for (let y = r(5); y < h - 2; y += r(5)) {
    for (const [x, z] of [[0, R], [R, 0], [-R, 0], [0, -R]]) {
      s.box(x, y, z, x, y + 1, z, glow ? '#ffc858' : '#20202a', glow ? { m: 'emissive', e: 0.9 } : {});
    }
  }
  s.box(-1, 2, R, 1, r(4), R, '#5a3820'); // Tür
  // Kegeldach
  s.layer('Dach', 'roof');
  s.cone(0, h + 1, 0, R + 2, r(9), roof, { noise: 0.1 });
  decorateRoof(ctx, (_x, y) => y > h);
  if (has('flag') || s.detail >= 2) {
    s.layer('Flagge', 'flag');
    const top = h + 1 + r(9);
    s.box(0, top, 0, 0, top + r(3), 0, '#3a3036');
    s.box(1, top + r(1.5), 0, r(3), top + r(3), 0, col('flag', '#d03040'));
  }
  if (wizard) {
    s.layer('Kristall', 'light');
    s.set(0, h + 1 + r(9) + 1, 0, '#a070ff', { m: 'emissive', e: 1 });
  }
  if (has('ruined')) ruin(ctx, 0.45);
}

// ============================================================================
//  Burg
// ============================================================================

export function buildCastle(ctx: BuildContext): void {
  const { s, r, col, blueprint } = ctx;
  const stone = col('walls', STONE);
  const roof = col('roof', '#3a5a9a');
  const flag = col('flag', '#d03040');
  const S = r(11); // halbe Seitenlänge
  const wallH = r(7);
  const glow = blueprint.mood === 'night';

  s.layer('Mauern', 'structure');
  s.box(-S - 1, 0, -S - 1, S + 1, 0, S + 1, shade(stone, -0.15), { noise: 0.15 });
  for (let y = 1; y <= wallH; y++) s.shell(-S, y, -S, S, y, S, stone, { noise: 0.18 });
  // Wehrgang innen
  s.shell(-S + 1, wallH, -S + 1, S - 1, wallH, S - 1, shade(stone, -0.1));
  // Zinnen
  for (let i = -S; i <= S; i += 2) {
    s.set(i, wallH + 1, S, stone);
    s.set(i, wallH + 1, -S, stone);
    s.set(S, wallH + 1, i, stone);
    s.set(-S, wallH + 1, i, stone);
  }
  // Tor
  const gw = Math.max(1, r(2)), gh = Math.max(3, r(5));
  for (let x = -gw; x <= gw; x++) for (let y = 1; y <= gh; y++) s.remove(x, y, S);
  s.box(-gw, 1, S - 1, gw, gh, S - 1, '#5a3820');
  s.box(-gw - 1, gh + 1, S + 1, gw + 1, gh + 1, S + 1, shade(stone, -0.25));

  // Ecktürme
  const TR = Math.max(2, r(3));
  const th = r(12);
  for (const [cx, cz] of [[-S, -S], [S, -S], [-S, S], [S, S]]) {
    s.layer('Türme', 'structure');
    s.cylinder(cx, 0, cz, TR, th, stone, { noise: 0.18 });
    s.cylinder(cx, th, cz, TR + 1, 1, shade(stone, -0.1));
    s.set(cx + Math.sign(cx) * 0, Math.round(th * 0.6), cz + Math.sign(cz) * TR, glow ? '#ffc858' : '#20202a', glow ? { m: 'emissive', e: 0.9 } : {});
    s.layer('Dächer', 'roof');
    s.cone(cx, th + 1, cz, TR + 1, r(6), roof, { noise: 0.08 });
  }
  // Bergfried
  s.layer('Bergfried', 'structure');
  const K = Math.max(2, r(4.5));
  const kh = r(16);
  s.box(-K, 1, -K - 2, K, kh, K - 2, stone, { noise: 0.18 });
  for (let y = r(5); y < kh - 1; y += r(4)) {
    s.box(-1, y, K - 1, 1, y + 1, K - 1, glow ? '#ffc858' : '#20202a', glow ? { m: 'emissive', e: 0.9 } : {});
  }
  s.layer('Dächer', 'roof');
  for (let k = 0; K + 1 - k >= 0; k++) s.box(-K - 1 + k, kh + 1 + k, -K - 3 + k, K + 1 - k, kh + 1 + k, K - 1 - k, roof, { noise: 0.08 });
  decorateRoof(ctx, (_x, y) => y > wallH + 1);
  // Fahne
  s.layer('Fahnen', 'flag');
  const fy = kh + K + 2;
  s.box(0, fy, -2, 0, fy + r(4), -2, '#3a3036');
  s.box(1, fy + r(2), -2, r(4), fy + r(4), -2, flag);
  if (ctx.has('ruined')) ruin(ctx, 0.55);
}
