import type { StyleProfile } from '../style/profile';
import { applyColorMood, lockColor } from '../style/profile';
import type { SpriteDoc, SpriteRegion } from './types';
import { indexFromHex } from './indexed';
import { renderObjectSprite } from './tiles';
import { shade } from '../palette/color';

/**
 * ============================================================================
 *  UI-Generator
 * ============================================================================
 *
 * Erzeugt ein komplettes UI-Kit als Atlas: 9-Slice-Panel, Inventar-Slot,
 * Buttons (normal/hover/gedrückt), Lebens-/Mana-/Ausdauerleisten und
 * Icons (Herzen, Münze, Edelstein, Stern + Item-Icons aus der Voxelbibliothek).
 */

type Theme = 'wood' | 'stone' | 'metal' | 'parchment' | 'scifi' | 'cute';

const THEMES: Record<Theme, { frame: string; fill: string; accent: string; text: string }> = {
  wood: { frame: '#8a5a34', fill: '#2c2232', accent: '#e3b23c', text: '#f2e8d0' },
  stone: { frame: '#7c7f8a', fill: '#24222a', accent: '#c8a050', text: '#e8e8ec' },
  metal: { frame: '#5a6070', fill: '#16141c', accent: '#b04a5a', text: '#d8dce4' },
  parchment: { frame: '#8a6a44', fill: '#ead7a8', accent: '#7a2a3a', text: '#3a2a1a' },
  scifi: { frame: '#2a4a6a', fill: '#0d1a2a', accent: '#4fd6e8', text: '#c8f4ff' },
  cute: { frame: '#e86fa8', fill: '#fff0f6', accent: '#7ac8f0', text: '#5a3a5a' },
};

export function uiThemeFromPrompt(prompt: string, profile: StyleProfile): Theme {
  const t = prompt.toLowerCase();
  if (/holz|wood/.test(t)) return 'wood';
  if (/stein|stone/.test(t)) return 'stone';
  if (/metall|metal|eisen|stahl/.test(t)) return 'metal';
  if (/pergament|papier|parchment|scroll/.test(t)) return 'parchment';
  if (/sci|futur|tech|neon|holo/.test(t)) return 'scifi';
  if (/cute|niedlich|pastell/.test(t)) return 'cute';
  return ({ fantasy: 'wood', medieval: 'stone', dark: 'metal', scifi: 'scifi', cute: 'cute', gameboy: 'stone' } as const)[profile.baseStyle];
}

type Px = (string | null)[];

function blank(w: number, h: number): Px {
  return new Array(w * h).fill(null);
}

/** Rahmen mit Abschrägung (Licht oben-links, Schatten unten-rechts). */
function framed(w: number, h: number, frame: string, fill: string, border: number, outline: string, opts: { pressed?: boolean; light?: number } = {}): Px {
  const p = blank(w, h);
  const hi = shade(frame, 0.3 + (opts.light ?? 0)), lo = shade(frame, -0.35);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      // abgerundete Ecken
      if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
      let c: string;
      if (edge === 0) c = outline;
      else if (edge <= border) {
        const topLeft = x - 1 < y - 1 ? x <= border : y <= border;
        const bevel = opts.pressed ? !topLeft : topLeft;
        c = edge === 1 ? (bevel ? hi : lo) : shade(frame, opts.light ?? 0);
        if (edge === border) c = lo;
      } else c = fill;
      p[y * w + x] = c;
    }
  return p;
}

function heart(size: number, fillRatio: number, red: string, outline: string, empty: string): Px {
  const p = blank(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // Herzkurve (x² + y² − 1)³ − x²·y³ ≤ 0
      const u = (x + 0.5 - size / 2) / (size * 0.4);
      const v = -(y + 0.5 - size * 0.47) / (size * 0.4);
      if ((u * u + v * v - 1) ** 3 - u * u * v * v * v > 0) continue;
      const filled = (x + 0.5) / size <= fillRatio;
      const light = filled && u < -0.3 && v > 0.2;
      p[y * size + x] = filled ? (light ? shade(red, 0.35) : red) : empty;
    }
  return outlineOf(p, size, size, outline);
}

function outlineOf(p: Px, w: number, h: number, outline: string): Px {
  const out = [...p];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (p[y * w + x]) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < w && ny < h && p[ny * w + nx];
      });
      if (n) out[y * w + x] = outline;
    }
  return out;
}

function polygonIcon(size: number, kind: 'coin' | 'gem' | 'star', color: string, outline: string): Px {
  const p = blank(size, size);
  const c = size / 2, R = size * 0.38;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x + 0.5 - c, v = y + 0.5 - c;
      let inside = false;
      if (kind === 'coin') inside = u * u + v * v <= R * R;
      else if (kind === 'gem') inside = Math.abs(u) / R + Math.abs(v) / (R * 1.15) <= 1;
      else {
        const a = Math.atan2(v, u) + Math.PI / 2, d = Math.hypot(u, v);
        const k = ((((a / (Math.PI * 2)) * 5) % 1) + 1) % 1;
        const tri = Math.abs(1 - 2 * k);
        inside = d <= R * (0.42 + 0.58 * tri);
      }
      if (!inside) continue;
      const light = u + v < -R * 0.4;
      const dark = u + v > R * 0.5;
      p[y * size + x] = light ? shade(color, 0.3) : dark ? shade(color, -0.25) : color;
    }
  if (kind === 'coin') for (let y = Math.round(c - R * 0.45); y <= Math.round(c + R * 0.45); y++) p[y * size + Math.round(c)] = shade(color, -0.3);
  return outlineOf(p, size, size, outline);
}

export function generateUiKit(theme: Theme, profile: StyleProfile, seed = 1): SpriteDoc {
  const th = THEMES[theme];
  const L = (c: string) => lockColor(applyColorMood(c, profile), profile);
  const frame = L(th.frame), fill = L(th.fill), accent = L(th.accent);
  const outline = profile.pixel.outline === 'none' ? L(shade(th.frame, -0.6)) : L(profile.pixel.outlineColor);
  const icon = Math.max(16, profile.pixel.itemSize);
  const items: { name: string; w: number; h: number; px: Px; kind: SpriteRegion['kind']; nineSlice?: [number, number, number, number] }[] = [];
  const b = 3;
  items.push({ name: 'Panel (9-Slice)', w: 48, h: 48, px: framed(48, 48, frame, fill, b, outline), kind: 'ui', nineSlice: [b + 1, b + 1, b + 1, b + 1] });
  items.push({ name: 'Inventar-Slot', w: icon + 6, h: icon + 6, px: framed(icon + 6, icon + 6, shade(frame, -0.1), shade(fill, 0.08), 1, outline, { pressed: true }), kind: 'ui', nineSlice: [2, 2, 2, 2] });
  items.push({ name: 'Button normal', w: 48, h: 16, px: framed(48, 16, frame, L(shade(th.frame, 0.1)), 2, outline), kind: 'ui', nineSlice: [3, 3, 3, 3] });
  items.push({ name: 'Button hover', w: 48, h: 16, px: framed(48, 16, L(shade(th.frame, 0.15)), L(shade(th.frame, 0.25)), 2, outline, { light: 0.1 }), kind: 'ui', nineSlice: [3, 3, 3, 3] });
  items.push({ name: 'Button gedrückt', w: 48, h: 16, px: framed(48, 16, L(shade(th.frame, -0.15)), L(shade(th.frame, -0.05)), 2, outline, { pressed: true }), kind: 'ui', nineSlice: [3, 3, 3, 3] });
  const barFrame = framed(64, 8, frame, L('#14121a'), 1, outline);
  items.push({ name: 'Leiste Rahmen', w: 64, h: 8, px: barFrame, kind: 'ui', nineSlice: [2, 2, 2, 2] });
  for (const [name, c] of [['Leben', '#d83a3a'], ['Mana', '#3a7ad8'], ['Ausdauer', '#4ab83a']] as const) {
    const p = blank(60, 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 60; x++) p[y * 60 + x] = L(y === 0 ? shade(c, 0.3) : y === 3 ? shade(c, -0.3) : c);
    items.push({ name: `Füllung ${name}`, w: 60, h: 4, px: p, kind: 'ui' });
  }
  const red = L('#d83a3a'), empty = L('#3a2a34');
  items.push({ name: 'Herz voll', w: icon, h: icon, px: heart(icon, 1, red, outline, empty), kind: 'icon' });
  items.push({ name: 'Herz halb', w: icon, h: icon, px: heart(icon, 0.5, red, outline, empty), kind: 'icon' });
  items.push({ name: 'Herz leer', w: icon, h: icon, px: heart(icon, 0, red, outline, empty), kind: 'icon' });
  items.push({ name: 'Münze', w: icon, h: icon, px: polygonIcon(icon, 'coin', L('#e3b23c'), outline), kind: 'icon' });
  items.push({ name: 'Edelstein', w: icon, h: icon, px: polygonIcon(icon, 'gem', L('#40c8e0'), outline), kind: 'icon' });
  items.push({ name: 'Stern', w: icon, h: icon, px: polygonIcon(icon, 'star', accent, outline), kind: 'icon' });
  // Item-Icons aus der Voxelbibliothek (frontal)
  const iconProfile: StyleProfile = { ...profile, pixel: { ...profile.pixel, castShadows: false } };
  for (const [name, spec] of [
    ['Schwert', { archetype: 'weapon', variant: 'sword', features: [] }],
    ['Schild', { archetype: 'weapon', variant: 'shield', features: [] }],
    ['Trank', { archetype: 'potion', features: [] }],
    ['Schlüssel', { archetype: 'item', variant: 'key', features: [] }],
  ] as const) {
    items.push({ name, w: icon, h: icon, px: renderObjectSprite({ ...spec, features: [...spec.features] }, icon, icon, iconProfile, seed, 'front'), kind: 'icon' });
  }

  // Regal-Packing in einen Atlas mit 128 px Breite
  const W = 128;
  let x = 0, y = 0, rowH = 0;
  const regions: SpriteRegion[] = [];
  for (const it of items) {
    if (x + it.w > W) { x = 0; y += rowH + 2; rowH = 0; }
    regions.push({ name: it.name, x, y, w: it.w, h: it.h, kind: it.kind, nineSlice: it.nineSlice });
    x += it.w + 2;
    rowH = Math.max(rowH, it.h);
  }
  const H = y + rowH;
  const sheet: Px = new Array(W * H).fill(null);
  items.forEach((it, i) => {
    const r = regions[i];
    for (let yy = 0; yy < it.h; yy++) for (let xx = 0; xx < it.w; xx++) {
      const c = it.px[yy * it.w + xx];
      if (c) sheet[(r.y + yy) * W + r.x + xx] = c;
    }
  });
  const palette = [...new Set(sheet.filter(Boolean) as string[])].map((c) => lockColor(c, profile));
  const uniq = [...new Set(palette)];
  return {
    width: W,
    height: H,
    palette: uniq,
    animations: [{ id: 'atlas', name: 'ui', direction: 'none', fps: 1, loop: false, frames: [indexFromHex(sheet.map((c) => (c ? lockColor(c, profile) : null)), W, H, uniq)] }],
    atlas: { regions },
  };
}

export type { Theme as UiTheme };
