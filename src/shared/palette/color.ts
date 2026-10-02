/**
 * Farb-Hilfsfunktionen (Hex ↔ RGB ↔ HSL, Mischen, Abstände).
 * Rein funktional, ohne Abhängigkeiten.
 */

export type RGB = [number, number, number];
export type HSL = [number, number, number];

export function hexToRgb(hex: string): RGB {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgbToHsl([r, g, b]: RGB): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]: HSL): RGB {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export const hexToHsl = (hex: string) => rgbToHsl(hexToRgb(hex));
export const hslToHex = (hsl: HSL) => rgbToHex(hslToRgb(hsl));

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Pixel-Art-typisches Schattieren: dunklere Töne verschieben den Farbton
 * leicht Richtung Blau/Violett, hellere Richtung Gelb ("Hue Shifting").
 * @param amount -1..1 (negativ = dunkler)
 */
export function shade(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex);
  // Hue-Shift: Schatten kühler, Lichter wärmer
  const target = amount < 0 ? 250 : 55;
  let dh = ((target - h + 540) % 360) - 180;
  dh *= Math.min(0.12, Math.abs(amount) * 0.15);
  const nl = clamp01(l + amount * (amount < 0 ? l * 0.9 : (1 - l) * 0.8));
  const ns = clamp01(s * (amount < 0 ? 1 + Math.abs(amount) * 0.1 : 1 - amount * 0.15));
  return hslToHex([h + dh, ns, nl]);
}

export function mix(a: string, b: string, t: number): string {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  return rgbToHex([ra[0] + (rb[0] - ra[0]) * t, ra[1] + (rb[1] - ra[1]) * t, ra[2] + (rb[2] - ra[2]) * t]);
}

/** Wahrnehmungsnahe Farbdistanz ("redmean"). */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

export function nearestColor(hex: string, palette: string[]): string {
  let best = palette[0];
  let bestD = Infinity;
  for (const p of palette) {
    const d = colorDistance(hex, p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Reduziert eine Farbliste auf maximal `max` Farben, indem iterativ die zwei
 * ähnlichsten Farben verschmolzen werden. Liefert eine Abbildung alt → neu.
 */
export function reduceColors(colors: string[], max: number, weights?: Map<string, number>): Map<string, string> {
  const map = new Map<string, string>();
  const clusters = [...new Set(colors)].map((c) => ({ rep: c, members: [c], w: weights?.get(c) ?? 1 }));
  while (clusters.length > max) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = colorDistance(clusters[i].rep, clusters[j].rep);
        if (d < bd) {
          bd = d; bi = i; bj = j;
        }
      }
    }
    const a = clusters[bi], b = clusters[bj];
    // Der stärker genutzte Repräsentant gewinnt (erhält wichtige Farben).
    const rep = a.w >= b.w ? a.rep : b.rep;
    clusters[bi] = { rep, members: [...a.members, ...b.members], w: a.w + b.w };
    clusters.splice(bj, 1);
  }
  for (const c of clusters) for (const m of c.members) map.set(m, c.rep);
  return map;
}

/** Benannte Grundfarben (für Prompt-Analyse und Builder). */
export const NAMED_COLORS: Record<string, string> = {
  red: '#c8323c',
  darkred: '#7a1f2b',
  orange: '#e8742a',
  yellow: '#f2c53d',
  gold: '#e3b23c',
  green: '#4a9e3f',
  darkgreen: '#2d5e2e',
  lime: '#8fd14f',
  teal: '#2a9d8f',
  cyan: '#4fd6e8',
  blue: '#3a62c8',
  darkblue: '#23306b',
  purple: '#7c3fae',
  pink: '#e86fa8',
  brown: '#8a5a34',
  darkbrown: '#5a3820',
  beige: '#d9b98c',
  white: '#eeeae0',
  gray: '#8a8f98',
  darkgray: '#4a4e57',
  black: '#24222b',
  silver: '#b9c2cc',
  bronze: '#a8703a',
  copper: '#b8673a',
  skin: '#f0c49a',
  skin_dark: '#a8724a',
  bone: '#e8e0c8',
};
