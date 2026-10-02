import type { BuildContext } from '../context';
import { NAMED_COLORS as C, shade, mix } from '../../../palette/color';
import { batWing } from './creatures';

/**
 * Humanoide Figuren im Chibi-/JRPG-Stil (großer Kopf, kurze Beine).
 *
 * Referenzmaße (bei Höhe 24):
 *   Beine   y 0..5    Torso y 6..12    Kopf y 13..22   Haare bis y 23
 * +z ist vorne (Gesicht), +x ist die rechte Hand der Figur (Waffenhand).
 *
 * Varianten: warrior, knight, mage, archer, rogue, king, villager,
 *            skeleton, robot, zombie
 * Merkmale:  sword, axe, hammer, spear, staff, bow, shield, cape, helmet,
 *            hat, crown, beard, horns, wings, tail, elf_ears, robe, armor
 */
export function buildHumanoid(ctx: BuildContext): void {
  const { s, r, col, has, spec } = ctx;
  const variant = spec.variant ?? 'warrior';
  const isSkeleton = variant === 'skeleton';
  const isRobot = variant === 'robot';
  const detail = s.detail;

  // ---------------------------------------------------------------- Farben
  const skin = col('skin', isSkeleton ? C.bone : variant === 'zombie' ? '#7fa65a' : isRobot ? C.silver : C.skin);
  const hair = col('hair', variant === 'mage' ? '#d8d8e0' : '#6b3f22');
  const armor = col('armor', isRobot ? '#8c96a8' : variant === 'mage' ? '#3d4fb0' : '#9aa4b2');
  const cloth = col('cloth', variant === 'mage' ? shade(armor, -0.25) : '#4a4058');
  const boots = col('boots', '#5a3a24');
  const cape = col('cape', '#a8283a');
  const metal = col('metal', '#c9d3dd');
  const accent = col('accent', C.gold);
  const eyes = col('eyes', isRobot ? '#4fe8ff' : '#2a2238');
  const gem = col('gem', '#3fd0ff');

  // ---------------------------------------------------------------- Maße
  const legTop = r(5);
  const torsoTop = r(12);
  const headBottom = torsoTop + 1;
  const headTop = r(22);
  const hw = r(5); // halbe Kopfbreite
  const hd = r(4); // halbe Kopftiefe
  const tw = r(4); // halbe Torsobreite
  const td = Math.max(1, r(2)); // halbe Torsotiefe
  const armIn = tw + 1;
  const armOut = tw + Math.max(1, r(2));
  const legIn = Math.max(1, r(1));
  const legOut = Math.max(legIn + 1, r(3));
  const robe = has('robe') || variant === 'mage';

  // ---------------------------------------------------------------- Beine
  if (!robe) {
    s.mirrored((side) => {
      s.layer(side === 1 ? 'Bein rechts' : 'Bein links', side === 1 ? 'leg_right' : 'leg_left');
      const x0 = side * legIn, x1 = side * legOut;
      if (isSkeleton) {
        const x = side * Math.round((legIn + legOut) / 2);
        s.box(x, 0, 0, x, legTop, 0, skin);
        s.box(x, 0, 0, x, 0, 1, skin);
        return;
      }
      s.box(x0, 0, -1, x1, legTop, 1, cloth);
      s.box(x0, 0, -1, x1, Math.max(1, r(2)), Math.max(1, r(2)), boots);
      if (has('armor') || variant === 'knight') s.box(x0, r(3), 1, x1, legTop - 1, 1, metal);
    });
  }

  // ---------------------------------------------------------------- Torso
  s.layer('Körper', 'body');
  if (isSkeleton) {
    s.box(0, legTop, 0, 0, torsoTop, 0, skin); // Wirbelsäule
    for (let y = legTop + 2; y <= torsoTop; y += 2) s.shell(-tw + 1, y, -td, tw - 1, y, td, skin);
    s.box(-tw + 1, legTop + 1, -1, tw - 1, legTop + 1, 1, skin); // Becken
  } else if (robe) {
    for (let y = 0; y <= torsoTop; y++) {
      const t = (torsoTop - y) / torsoTop;
      const w = tw + Math.round(t * r(2));
      const d = td + Math.round(t * r(1.5));
      s.box(-w, y, -d, w, y, d, y < r(6) ? cloth : armor, { noise: 0.06 });
    }
    // Saum und Gürtel
    s.box(-tw - r(2), 0, -td - r(1.5), tw + r(2), 0, td + r(1.5), accent);
    s.box(-tw, r(7), -td, tw, r(7), td, accent);
  } else {
    s.box(-tw, legTop + 1, -td, tw, torsoTop, td, isRobot ? armor : armor, { noise: 0.05 });
    // Gürtel mit Schnalle
    s.box(-tw, legTop + 1, -td, tw, legTop + 1, td, shade(boots, -0.1));
    s.set(0, legTop + 1, td, accent, { m: 'metal' });
    if (detail >= 2 && !isRobot) {
      // Kragen / Brustdetail
      s.box(-1, torsoTop, td, 1, torsoTop, td, shade(armor, 0.25));
      s.box(0, legTop + 2, td, 0, torsoTop - 1, td, shade(armor, -0.2));
    }
    if (isRobot) {
      s.box(-r(2), r(8), td, r(2), r(10), td, '#20303a');
      s.box(-1, r(9), td, 1, r(9), td, gem, { m: 'emissive', e: 1 });
    }
  }

  // ---------------------------------------------------------------- Arme
  s.mirrored((side) => {
    s.layer(side === 1 ? 'Arm rechts' : 'Arm links', side === 1 ? 'arm_right' : 'arm_left');
    const x0 = side * armIn, x1 = side * armOut;
    const handTop = legTop + 1;
    if (isSkeleton) {
      const x = side * armIn;
      s.box(x, handTop - 1, 0, x, torsoTop, 0, skin);
      return;
    }
    s.box(x0, handTop + 1, -1, x1, torsoTop, 1, robe ? armor : isRobot ? shade(armor, -0.15) : armor);
    s.box(x0, handTop - 1, -1, x1, handTop, 1, skin); // Hände
    if (has('armor') || variant === 'knight' || variant === 'warrior') {
      // Schulterpanzer
      s.box(side * (tw), torsoTop - 1, -td, side * (armOut + 1), torsoTop + 1, td, metal, { m: 'metal' });
    }
  });

  // ---------------------------------------------------------------- Kopf
  s.layer('Kopf', 'head');
  s.box(-hw, headBottom, -hd, hw, headTop, hd, skin);
  // Gesicht auf der Vorderseite (z = hd)
  const eyeY = headBottom + r(3.5);
  const eyeX0 = Math.max(1, r(2)), eyeX1 = Math.max(eyeX0, r(3));
  const eyeH = Math.max(1, r(1.5));
  if (isSkeleton) {
    s.mirrored((side) => {
      s.box(side * eyeX0, eyeY, hd, side * (eyeX1 + 1), eyeY + eyeH, hd, '#1a1420');
      s.set(side * eyeX0, eyeY, hd, '#ff3838', { m: 'emissive', e: 1 });
    });
    s.box(-2, headBottom + 1, hd, 2, headBottom + 1, hd, '#1a1420');
  } else if (isRobot) {
    s.box(-hw + 1, eyeY, hd, hw - 1, eyeY + eyeH, hd, eyes, { m: 'emissive', e: 1 });
  } else {
    s.mirrored((side) => {
      s.box(side * eyeX0, eyeY, hd, side * eyeX1, eyeY + eyeH, hd, eyes);
      if (detail >= 2 && eyeH >= 1) s.set(side * eyeX1, eyeY + eyeH, hd, '#ffffff');
      if (variant !== 'knight' && ctx.style.id === 'cute') s.set(side * (eyeX1 + 1), eyeY - 1, hd, '#f08aa0');
    });
    if (detail >= 2) s.set(0, headBottom + Math.max(1, r(1.5)), hd, mix(skin, '#4a2030', 0.55));
  }

  // ------------------------------------------------- Kopfbedeckung / Haare
  const helmet = has('helmet') || variant === 'knight';
  s.layer('Haare & Helm', 'head');
  if (helmet) {
    // Topfhelm: umschließt den Kopf, Sehschlitz vorne
    s.box(-hw - 1, headBottom, -hd - 1, hw + 1, headTop + 1, hd + 1, metal, { m: 'metal', noise: 0.04 });
    if (variant === 'knight' || has('full_helmet')) {
      s.box(-hw + 1, eyeY, hd + 1, hw - 1, eyeY, hd + 1, '#1a1420');
      s.box(0, headBottom + 1, hd + 1, 0, eyeY - 1, hd + 1, shade(metal, -0.25));
    } else {
      // Offener Helm: Gesicht freilegen
      for (let x = -hw + 1; x <= hw - 1; x++) for (let y = headBottom; y <= eyeY + eyeH + 1; y++) s.remove(x, y, hd + 1);
      s.box(0, eyeY - 1, hd + 1, 0, eyeY + eyeH + 1, hd + 1, shade(metal, -0.2), { m: 'metal' });
    }
    // Helmbusch
    if (detail >= 2) s.box(0, headTop + 2, -hd, 0, headTop + 2 + r(2), hd - 1, cape);
  } else if (!isSkeleton && !isRobot && !has('bald')) {
    s.box(-hw - 1, headTop - r(2), -hd - 1, hw + 1, headTop + 1, hd + 1, hair, { noise: 0.06 });
    s.box(-hw - 1, headBottom + r(1), -hd - 1, hw + 1, headTop, -hd - 1, hair, { noise: 0.06 }); // hinten
    s.mirrored((side) => s.box(side * (hw + 1), eyeY + eyeH, -hd - 1, side * (hw + 1), headTop, hd - 1, hair));
    // Pony mit gezackter Kante
    for (let x = -hw; x <= hw; x++) {
      const drop = (x + hw) % 3 === 0 ? 1 : 0;
      s.box(x, headTop - r(2) - drop, hd + 1, x, headTop, hd + 1, hair);
    }
    if (has('long_hair')) s.box(-hw - 1, torsoTop - r(3), -hd - 1, hw + 1, headBottom, -hd, hair);
  }
  if (isRobot) {
    s.box(0, headTop + 1, 0, 0, headTop + r(3), 0, metal, { m: 'metal' });
    s.set(0, headTop + r(3) + 1, 0, '#ff4060', { m: 'emissive', e: 1 });
  }

  // ---------------------------------------------------------------- Hut
  if (has('hat')) {
    s.layer('Hut', 'head');
    const hatCol = col('hat', variant === 'mage' ? armor : '#5a3a24');
    const brimY = headTop + 1;
    s.cylinder(0, brimY, 0, hw + 2.5, 1, hatCol);
    const h = r(10);
    for (let i = 0; i < h; i++) {
      const rr = (hw - 0.5) * (1 - i / h);
      // leicht nach hinten geknickte Spitze
      const bend = i > h * 0.6 ? -Math.round((i - h * 0.6) * 0.7) : 0;
      s.disc('y', 0, brimY + 1, bend, i, Math.max(0, rr), hatCol, { noise: 0.05 });
    }
    s.cylinder(0, brimY + 1, 0, hw - 0.3, 1, accent);
  }

  // ---------------------------------------------------------------- Krone
  if (has('crown')) {
    s.layer('Krone', 'head');
    const y0 = (helmet ? headTop + 2 : headTop + 2);
    s.shell(-r(4), y0, -r(4), r(4), y0 + 1, r(4), accent, { m: 'metal' });
    for (const [x, z] of [[-r(4), -r(4)], [r(4), -r(4)], [-r(4), r(4)], [r(4), r(4)], [0, r(4)], [0, -r(4)]]) s.set(x, y0 + 2, z, accent, { m: 'metal' });
    s.set(0, y0 + 1, r(4) + 1, '#e0284a');
  }

  // ---------------------------------------------------------------- Bart
  if (has('beard')) {
    s.layer('Bart', 'head');
    const beard = col('beard', hair);
    for (let y = headBottom - r(3); y <= eyeY - 2; y++) {
      const w = Math.max(1, Math.round(r(4) * (1 - (eyeY - 2 - y) / (r(6) + 2))));
      s.box(-w, y, hd + 1, w, y, hd + 1, beard, { noise: 0.05 });
    }
    s.box(-r(4), eyeY - 2, hd + 1, r(4), eyeY - 2, hd + 1, beard);
  }

  // ---------------------------------------------------------------- Ohren / Hörner
  if (has('elf_ears')) {
    s.layer('Kopf', 'head');
    s.mirrored((side) => s.line([side * (hw + 1), eyeY, 0], [side * (hw + r(3)), eyeY + r(2), -1], skin));
  }
  if (has('horns')) {
    s.layer('Hörner', 'head');
    const horn = col('horn', '#e8dcc0');
    s.mirrored((side) =>
      s.tube([[side * (hw - 1), headTop, 0], [side * (hw + r(2)), headTop + r(2), -1], [side * (hw + r(2)), headTop + r(5), -r(2)]], [1, 0.8, 0.3], horn),
    );
  }

  // ---------------------------------------------------------------- Umhang
  if (has('cape')) {
    s.layer('Umhang', 'cape');
    const z = -td - 1;
    for (let y = 1; y <= torsoTop; y++) {
      const flare = Math.round(((torsoTop - y) / torsoTop) * r(2));
      s.box(-tw - flare, y, z - (y < torsoTop / 2 ? 1 : 0), tw + flare, y, z, cape, { noise: 0.05 });
    }
    s.box(-tw - 1, torsoTop, -td - 1, tw + 1, torsoTop + 1, td, cape); // Kragen
    if (detail >= 2) s.mirrored((side) => s.set(side * (tw - 1), torsoTop, td + 1, accent, { m: 'metal' }));
  }

  // ---------------------------------------------------------------- Flügel
  if (has('wings')) {
    const wingCol = col('wings', variant === 'skeleton' || ctx.style.id === 'dark' ? '#3a2a48' : '#f4f0ff');
    s.mirrored((side) => {
      s.layer(side === 1 ? 'Flügel rechts' : 'Flügel links', side === 1 ? 'wing_right' : 'wing_left');
      batWing(ctx, side, { x0: 1, y0: torsoTop - r(3), z0: -td - 2, span: r(10), rise: r(8), membrane: wingCol, bone: shade(wingCol, -0.25), fingers: 3 });
    });
  }

  // ---------------------------------------------------------------- Schwanz
  if (has('tail')) {
    s.layer('Schwanz', 'tail');
    const tc = col('tail', variant === 'zombie' ? skin : '#7a2a3a');
    s.tube([[0, legTop + 1, -td - 1], [0, r(3), -td - r(4)], [0, r(5), -td - r(7)]], [1, 0.8, 0.5], tc);
  }

  // ---------------------------------------------------------------- Ausrüstung
  const handY = legTop; // Höhe der Hand
  // Waffen werden seitlich neben der Hand gehalten, leicht nach vorne versetzt
  const handX = armOut + 1;
  const front = 1;

  if (has('sword')) {
    s.layer('Schwert', 'weapon');
    const bladeLen = r(11);
    const bw = ctx.u >= 1.6 ? 1 : 0;
    s.box(handX, handY - 2, front, handX, handY + 1, front, '#5a3424'); // Griff
    s.set(handX, handY - 3, front, accent, { m: 'metal' }); // Knauf
    s.box(handX - 1 - bw, handY + 2, front, handX + 1 + bw, handY + 2, front, accent, { m: 'metal' }); // Parierstange
    s.box(handX, handY + 3, front, handX + bw, handY + 2 + bladeLen, front, metal, { m: 'metal' });
    s.set(handX, handY + 3 + bladeLen, front, shade(metal, 0.3), { m: 'metal' });
    if (detail >= 2) s.box(handX, handY + 4, front, handX, handY + bladeLen, front, shade(metal, 0.25), { m: 'metal' });
  }
  if (has('axe')) {
    s.layer('Axt', 'weapon');
    s.box(handX, handY - 2, front, handX, handY + r(10), front, '#6a4428');
    s.box(handX, handY + r(6), front + 1, handX, handY + r(10), front + r(3), metal, { m: 'metal' });
    s.box(handX, handY + r(5), front + r(3), handX, handY + r(11), front + r(3), shade(metal, 0.2), { m: 'metal' });
  }
  if (has('hammer')) {
    s.layer('Hammer', 'weapon');
    s.box(handX, handY - 2, front, handX, handY + r(9), front, '#6a4428');
    s.box(handX - 1, handY + r(8), front - r(2), handX + 1, handY + r(11), front + r(2), metal, { m: 'metal', noise: 0.05 });
  }
  if (has('spear')) {
    s.layer('Speer', 'weapon');
    s.box(handX, 0, front, handX, handY + r(16), front, '#6a4428');
    s.box(handX, handY + r(17), front, handX, handY + r(19), front, metal, { m: 'metal' });
    s.box(handX - 1, handY + r(17), front, handX + 1, handY + r(17), front, metal, { m: 'metal' });
  }
  if (has('staff')) {
    s.layer('Stab', 'weapon');
    const x = handX;
    s.box(x, 0, front, x, headTop, front, '#7a5030', { noise: 0.08 });
    s.sphere(x, headTop + 2, front, Math.max(1, r(1.6)), gem, { m: 'emissive', e: 1 });
    if (detail >= 2) s.mirrored((side) => s.set(x + side, headTop + 1, front, accent, { m: 'metal' }));
  }
  if (has('wand')) {
    s.layer('Zauberstab', 'weapon');
    s.box(handX, handY - 1, front, handX, handY + r(5), front, '#5a3424');
    s.set(handX, handY + r(5) + 1, front, gem, { m: 'emissive', e: 1 });
  }
  if (has('bow')) {
    s.layer('Bogen', 'shield');
    const x = -handX;
    const half = r(8);
    for (let i = -half; i <= half; i++) {
      const t = i / half;
      s.set(x, handY + i, front + Math.round((1 - t * t) * r(2.5)), '#7a5030');
    }
    s.box(x, handY - half, front - 1, x, handY + half, front - 1, '#e8e0d0');
  }
  if (has('shield')) {
    s.layer('Schild', 'shield');
    const shieldCol = col('shield', shade(cape, -0.05));
    const x = -(armOut + 1);
    const top = torsoTop - 1, bottom = Math.max(1, legTop - r(2));
    const hz = Math.max(2, r(3));
    for (let y = bottom; y <= top; y++) {
      const shrink = y < bottom + r(2) ? bottom + r(2) - y : 0;
      s.box(x, y, -hz + shrink, x, y, hz - shrink, shieldCol, { m: 'diffuse' });
    }
    // Rand und Emblem
    s.box(x - 1, top, -hz, x - 1, top, hz, metal, { m: 'metal' });
    s.box(x - 1, bottom + r(2), -hz, x - 1, top, -hz, metal, { m: 'metal' });
    s.box(x - 1, bottom + r(2), hz, x - 1, top, hz, metal, { m: 'metal' });
    const mid = Math.round((top + bottom) / 2);
    s.box(x - 1, mid - r(2), 0, x - 1, mid + r(2), 0, accent, { m: 'metal' });
    s.box(x - 1, mid, -r(1.5), x - 1, mid, r(1.5), accent, { m: 'metal' });
  }
}
