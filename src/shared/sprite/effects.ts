import { Rng } from '../ai/procedural/Sculptor';
import type { StyleProfile } from '../style/profile';
import { applyColorMood, lockColor } from '../style/profile';
import type { SpriteDoc } from './types';
import { indexFromHex } from './indexed';

/**
 * ============================================================================
 *  Effekt-Generator (Zauber, Explosionen, Treffer …)
 * ============================================================================
 *
 * Partikelsimulation in Pixel-Auflösung – jede Animation entsteht neu aus
 * Parametern, nichts wird aus einer Asset-Datenbank geladen. Farben laufen
 * durch das Stilprofil (Farbstimmung + Palettensperre).
 */

export type EffectId = 'fire' | 'fireball' | 'ice' | 'lightning' | 'heal' | 'poison' | 'explosion' | 'smoke' | 'magic' | 'slash' | 'water' | 'shield' | 'dark';

export const EFFECTS: Record<EffectId, { name: string; ramp: string[]; loop: boolean; frames: number; fps: number }> = {
  fire: { name: 'Feuer', ramp: ['#fff6b0', '#ffd040', '#ff8a20', '#e0401a', '#7a1a1a'], loop: true, frames: 8, fps: 12 },
  fireball: { name: 'Feuerball', ramp: ['#ffffff', '#fff2a0', '#ffb030', '#e8501a', '#8a2010'], loop: true, frames: 6, fps: 12 },
  ice: { name: 'Eis', ramp: ['#ffffff', '#d6f4ff', '#8fd8ff', '#4a9ae0', '#2a4a9a'], loop: false, frames: 8, fps: 12 },
  lightning: { name: 'Blitz', ramp: ['#ffffff', '#fffbb0', '#ffe84a', '#a0a0ff', '#4a4ab0'], loop: false, frames: 6, fps: 14 },
  heal: { name: 'Heilung', ramp: ['#ffffff', '#e8ffc0', '#9ff07a', '#3fc860', '#f2d24a'], loop: false, frames: 10, fps: 12 },
  poison: { name: 'Gift', ramp: ['#e8ffb0', '#a8f050', '#6ac83a', '#5a8a2a', '#5a2a7a'], loop: true, frames: 8, fps: 10 },
  explosion: { name: 'Explosion', ramp: ['#ffffff', '#fff2a0', '#ffa020', '#c8401a', '#4a4040'], loop: false, frames: 8, fps: 14 },
  smoke: { name: 'Rauch', ramp: ['#e8e8ec', '#c4c4cc', '#9a9aa6', '#6e6e7a', '#4a4a54'], loop: true, frames: 8, fps: 8 },
  magic: { name: 'Magie', ramp: ['#ffffff', '#f0c0ff', '#c070ff', '#7a3ae0', '#3a1a8a'], loop: true, frames: 8, fps: 12 },
  slash: { name: 'Schwerthieb', ramp: ['#ffffff', '#e8f2ff', '#a8c8f0', '#6a8ac0', '#3a4a7a'], loop: false, frames: 5, fps: 16 },
  water: { name: 'Wasser', ramp: ['#ffffff', '#c8ecff', '#6ab8f0', '#2c6ac0', '#1a3a7a'], loop: false, frames: 8, fps: 12 },
  shield: { name: 'Schutzschild', ramp: ['#ffffff', '#d0f0ff', '#80c8ff', '#4a8ae0', '#2a4aa0'], loop: true, frames: 8, fps: 10 },
  dark: { name: 'Dunkle Magie', ramp: ['#e0c0ff', '#9a4ae0', '#5a1a9a', '#2a0a4a', '#120018'], loop: true, frames: 8, fps: 10 },
};

export function effectFromPrompt(prompt: string): EffectId {
  const t = prompt.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  const table: [RegExp, EffectId][] = [
    [/feuerball|fireball|meteor/, 'fireball'], [/explosion|explod|bombe|detonat|boom/, 'explosion'], [/blitz|donner|lightning|thunder|elektr|strom/, 'lightning'],
    [/eis|frost|ice|kaelte|schnee|frier/, 'ice'], [/heil|heal|segen|bless|holy|heilig|wiederbeleb/, 'heal'], [/gift|poison|saeure|acid|toxi/, 'poison'],
    [/rauch|staub|dust|smoke|nebel|fog/, 'smoke'], [/hieb|slash|schnitt|klinge|schwertschlag|kralle|claw/, 'slash'], [/wasser|water|splash|platsch|welle|wave/, 'water'],
    [/schild|barriere|schutz|shield|barrier|ward/, 'shield'], [/dunkel|schatten|fluch|curse|shadow|nekro|tod/, 'dark'], [/feuer|flamme|fire|flame|brand|inferno|lodern/, 'fire'],
    [/magie|magic|arkan|arcane|portal|teleport|zauber|spell|mana/, 'magic'],
  ];
  return table.find(([re]) => re.test(t))?.[1] ?? 'magic';
}

interface Canvas {
  w: number;
  h: number;
  px: (number | -1)[]; // Rampenindex oder -1
}

function plot(c: Canvas, x: number, y: number, v: number): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = y * c.w + x;
  if (c.px[i] === -1 || v < (c.px[i] as number)) c.px[i] = v; // hellere Werte gewinnen
}
function disc(c: Canvas, cx: number, cy: number, r: number, v: number): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + 0.3) plot(c, x, y, v);
}
function ring(c: Canvas, cx: number, cy: number, r: number, v: number, thick = 1): void {
  for (let a = 0; a < 360; a += 3) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < thick; k++) plot(c, cx + Math.cos(rad) * (r - k), cy + Math.sin(rad) * (r - k), v);
  }
}
function line(c: Canvas, x0: number, y0: number, x1: number, y1: number, v: number): void {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) plot(c, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, v);
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number }

/** Erzeugt einen Effekt als Sprite-Animation. */
export function generateEffect(id: EffectId, size: number, profile: StyleProfile, opts: { frames?: number; fps?: number; seed?: number } = {}): SpriteDoc {
  const def = EFFECTS[id];
  const frames = opts.frames ?? def.frames;
  const rng = new Rng(opts.seed ?? 7);
  const S = size;
  const cx = S / 2, cy = S / 2;
  const ramp = def.ramp.map((c) => lockColor(applyColorMood(c, profile), profile));
  const canvases: Canvas[] = [];
  const parts: Particle[] = [];
  const spawn = (n: number, f: () => Particle) => { for (let i = 0; i < n; i++) parts.push(f()); };
  // Vorlauf für Loops, damit Frame 0 schon "gefüllt" ist
  const warm = def.loop ? frames : 0;
  for (let step = -warm; step < frames; step++) {
    const t = Math.max(0, step) / Math.max(1, frames - 1);
    const c: Canvas = { w: S, h: S, px: new Array(S * S).fill(-1) };
    switch (id) {
      case 'fire':
      case 'fireball': {
        const baseY = id === 'fire' ? S * 0.85 : cy;
        spawn(id === 'fire' ? 5 : 4, () => ({ x: cx + rng.range(-S * 0.18, S * 0.18), y: baseY + rng.range(-1, 1), vx: rng.range(-0.3, 0.3) + (id === 'fireball' ? -S * 0.03 : 0), vy: -rng.range(S * 0.04, S * 0.08), life: 0, max: rng.int(4, 7), size: rng.range(S * 0.06, S * 0.12) }));
        if (id === 'fireball') { disc(c, cx + S * 0.12, cy, S * 0.16, 1); disc(c, cx + S * 0.14, cy, S * 0.09, 0); }
        break;
      }
      case 'smoke':
      case 'poison':
        spawn(2, () => ({ x: cx + rng.range(-S * 0.2, S * 0.2), y: S * 0.85, vx: rng.range(-0.2, 0.2), vy: -rng.range(S * 0.03, S * 0.05), life: 0, max: rng.int(6, 9), size: rng.range(S * 0.06, S * 0.11) }));
        break;
      case 'magic':
      case 'dark': {
        const a = step * 0.9;
        for (let k = 0; k < 3; k++) {
          const ang = a + (k * Math.PI * 2) / 3;
          parts.push({ x: cx + Math.cos(ang) * S * 0.32, y: cy + Math.sin(ang) * S * 0.32, vx: -Math.cos(ang) * S * 0.035, vy: -Math.sin(ang) * S * 0.035, life: 0, max: 6, size: S * 0.05 });
        }
        disc(c, cx, cy, S * (0.08 + 0.03 * Math.sin(step)), id === 'dark' ? 3 : 1);
        break;
      }
      case 'heal':
        if (step < frames * 0.7) spawn(3, () => ({ x: cx + rng.range(-S * 0.3, S * 0.3), y: S * 0.9, vx: 0, vy: -rng.range(S * 0.04, S * 0.07), life: 0, max: rng.int(5, 8), size: 1 }));
        ring(c, cx, S * 0.82, S * 0.35 * Math.min(1, t * 2), 4, 1);
        break;
      case 'ice': {
        const n = 7;
        for (let k = 0; k < n; k++) {
          const ang = (k / n) * Math.PI * 2 + 0.3;
          const len = S * 0.42 * Math.min(1, t * 1.6);
          const fade = t > 0.7 ? 2 : 0;
          line(c, cx, cy, cx + Math.cos(ang) * len, cy + Math.sin(ang) * len, 1 + fade);
          plot(c, cx + Math.cos(ang) * len, cy + Math.sin(ang) * len, 0);
        }
        disc(c, cx, cy, S * 0.1 * (1 - t * 0.5), 0);
        break;
      }
      case 'lightning': {
        const local = new Rng(100 + step);
        let x = cx + local.range(-S * 0.1, S * 0.1), y = 0;
        const bright = step % 2 === 0 ? 0 : 2;
        while (y < S * 0.92) {
          const nx = x + local.range(-S * 0.12, S * 0.12), ny = y + local.range(S * 0.08, S * 0.16);
          line(c, x, y, nx, ny, bright);
          line(c, x + 1, y, nx + 1, ny, bright + 1);
          if (local.chance(0.3)) line(c, nx, ny, nx + local.range(-S * 0.2, S * 0.2), ny + S * 0.12, bright + 2);
          x = nx; y = ny;
        }
        disc(c, x, S * 0.92, S * 0.08 * (1 + (step % 2)), bright);
        break;
      }
      case 'explosion': {
        const r = S * 0.45 * Math.min(1, t * 1.4);
        if (t < 0.5) disc(c, cx, cy, r * 0.8, t < 0.2 ? 0 : 1);
        ring(c, cx, cy, r, t < 0.4 ? 2 : 3, Math.max(1, Math.round(S * 0.06)));
        if (step === 0) spawn(12, () => { const a = rng.range(0, Math.PI * 2), v = rng.range(S * 0.04, S * 0.08); return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 10, size: rng.range(1, S * 0.05) }; });
        break;
      }
      case 'slash': {
        const sweep = Math.min(1, t * 1.6);
        for (let k = 0; k < 40 * sweep; k++) {
          const a = -2.3 + (k / 40) * 2.6;
          const w = Math.max(1, Math.round(S * 0.07 * Math.sin((k / 40) * Math.PI)));
          for (let j = 0; j < w; j++) plot(c, cx + Math.cos(a) * (S * 0.38 - j), cy + Math.sin(a) * (S * 0.38 - j), t > 0.6 ? 2 + j : j === 0 ? 0 : 1);
        }
        break;
      }
      case 'water': {
        const r = S * 0.4 * Math.min(1, t * 1.3);
        ring(c, cx, S * 0.75, r, t > 0.6 ? 3 : 2, 1);
        if (step < 3) spawn(5, () => ({ x: cx + rng.range(-2, 2), y: S * 0.72, vx: rng.range(-S * 0.04, S * 0.04), vy: -rng.range(S * 0.06, S * 0.1), life: 0, max: 8, size: 1 }));
        break;
      }
      case 'shield': {
        const pulse = 0.38 + 0.03 * Math.sin((step / frames) * Math.PI * 2);
        ring(c, cx, cy, S * pulse, 2, 1);
        ring(c, cx, cy, S * pulse - 1, 3, 1);
        for (let k = 0; k < 4; k++) {
          const a = (step / frames) * Math.PI * 2 + (k * Math.PI) / 2;
          plot(c, cx + Math.cos(a) * S * pulse, cy + Math.sin(a) * S * pulse, 0);
        }
        break;
      }
    }
    // Partikel bewegen und zeichnen
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      if (id === 'explosion' || id === 'water') p.vy += S * 0.008;
      p.life++;
      const k = Math.min(4, Math.floor((p.life / p.max) * 5));
      if (p.life > p.max) continue;
      const sz = id === 'smoke' || id === 'poison' ? p.size * (1 + p.life / p.max) : p.size * (1 - (p.life / p.max) * 0.6);
      if (id === 'heal') { plot(c, p.x, p.y, k); plot(c, p.x - 1, p.y, Math.min(4, k + 1)); plot(c, p.x + 1, p.y, Math.min(4, k + 1)); plot(c, p.x, p.y - 1, Math.min(4, k + 1)); plot(c, p.x, p.y + 1, Math.min(4, k + 1)); }
      else if (id === 'poison' && p.life % 3 === 0) ring(c, p.x, p.y, Math.max(1.5, sz), Math.min(4, k + 1), 1);
      else disc(c, p.x, p.y, Math.max(0.6, sz), id === 'smoke' ? Math.min(4, k + 1) : k);
    }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life > parts[i].max) parts.splice(i, 1);
    if (step >= 0) canvases.push(c);
  }
  const palette = [...new Set(ramp)];
  const animFrames = canvases.map((c) => indexFromHex(c.px.map((v) => (v < 0 ? null : ramp[v])), S, S, palette));
  return {
    width: S,
    height: S,
    palette,
    animations: [{ id: `fx_${id}`, name: id, direction: 'none', fps: opts.fps ?? def.fps, loop: def.loop, frames: animFrames }],
  };
}
