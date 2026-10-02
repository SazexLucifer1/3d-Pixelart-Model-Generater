import { hexToHsl, hslToHex, nearestColor, luminance } from './color';

/**
 * Stil-Presets und Farbpaletten.
 *
 * Ein Stil beeinflusst drei Ebenen:
 *  1. Generierung  – Farbtransformation, Schattierungsstärke, Detail-Vorlieben
 *  2. Palette      – maximale Farbanzahl bzw. feste Palette
 *  3. Rendering    – Pixelgröße, Outline, Posterize, Licht, Hintergrund
 */

export type StyleId = 'fantasy' | 'scifi' | 'medieval' | 'dark' | 'cute' | 'gameboy';

export interface RenderSettings {
  /** Downscale-Faktor des Pixel-Renderings (1 = volle Auflösung). */
  pixelScale: number;
  /** Anzahl Helligkeitsstufen pro Kanal (0 = aus). */
  posterize: number;
  /** Dunkle Kontur an Tiefenkanten. */
  outline: boolean;
  outlineColor: string;
  /** Hintergrund (oben/unten für Verlauf). */
  bgTop: string;
  bgBottom: string;
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  /** Erzwingt eine 4-Farben-Palette im Post-Processing (Gameboy). */
  paletteLock?: string[];
  /** Weiche Schatten aus. Harte Schatten wirken "pixeliger". */
  shadows: boolean;
}

export interface StylePreset {
  id: StyleId;
  name: string;
  description: string;
  /** Farbtransformation, die beim Generieren angewendet wird. */
  hueShift: number;
  satMul: number;
  lightMul: number;
  lightAdd: number;
  /** Standard-Maximalanzahl Farben bei Palette "Stil". */
  maxColors: number;
  /** Feste Palette, auf die gemappt wird (überschreibt Paletten-Auswahl). */
  forcedPalette?: string[];
  render: RenderSettings;
}

export const GAMEBOY_PALETTE = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'];

const BASE_RENDER: RenderSettings = {
  pixelScale: 3,
  posterize: 0,
  outline: true,
  outlineColor: '#141018',
  bgTop: '#2b2d42',
  bgBottom: '#141522',
  sunColor: '#fff2d6',
  sunIntensity: 2.2,
  ambientColor: '#8a9cc8',
  ambientIntensity: 1.1,
  shadows: true,
};

export const STYLE_PRESETS: Record<StyleId, StylePreset> = {
  fantasy: {
    id: 'fantasy',
    name: 'Fantasy RPG',
    description: 'Kräftige, warme Farben wie in klassischen 16-Bit JRPGs.',
    hueShift: 0, satMul: 1.1, lightMul: 1, lightAdd: 0.02,
    maxColors: 32,
    render: { ...BASE_RENDER },
  },
  scifi: {
    id: 'scifi',
    name: 'Sci-Fi',
    description: 'Kühle Metalltöne, leuchtende Cyan/Magenta-Akzente.',
    hueShift: -8, satMul: 0.9, lightMul: 1, lightAdd: 0,
    maxColors: 28,
    render: { ...BASE_RENDER, bgTop: '#0b1a2e', bgBottom: '#05070f', sunColor: '#d6ecff', ambientColor: '#4a6aa8', outlineColor: '#050a14' },
  },
  medieval: {
    id: 'medieval',
    name: 'Medieval',
    description: 'Erdige, leicht entsättigte Holz- und Steintöne.',
    hueShift: 4, satMul: 0.78, lightMul: 0.96, lightAdd: 0,
    maxColors: 24,
    render: { ...BASE_RENDER, bgTop: '#3a3530', bgBottom: '#1c1916', sunColor: '#ffe7c0', ambientColor: '#9a8a7a' },
  },
  dark: {
    id: 'dark',
    name: 'Dark Fantasy',
    description: 'Düster, entsättigt, violette Schatten, glühende Akzente.',
    hueShift: 10, satMul: 0.7, lightMul: 0.72, lightAdd: -0.02,
    maxColors: 20,
    render: { ...BASE_RENDER, bgTop: '#1a1024', bgBottom: '#07040b', sunColor: '#c8b8ff', sunIntensity: 1.7, ambientColor: '#5a3a7a', ambientIntensity: 0.9 },
  },
  cute: {
    id: 'cute',
    name: 'Cute Pixel',
    description: 'Pastellfarben, weiche Kontraste, freundlich.',
    hueShift: 0, satMul: 0.85, lightMul: 1.05, lightAdd: 0.1,
    maxColors: 24,
    render: { ...BASE_RENDER, bgTop: '#ffd6e8', bgBottom: '#c8e6ff', outlineColor: '#5a3a5a', sunColor: '#fff8ee', ambientColor: '#ffe0f0', ambientIntensity: 1.4 },
  },
  gameboy: {
    id: 'gameboy',
    name: 'Retro Gameboy',
    description: 'Vier Grüntöne wie auf dem originalen Game Boy.',
    hueShift: 0, satMul: 1, lightMul: 1, lightAdd: 0,
    maxColors: 4,
    forcedPalette: GAMEBOY_PALETTE,
    render: {
      ...BASE_RENDER, pixelScale: 4, outline: true, outlineColor: '#0f380f',
      bgTop: '#9bbc0f', bgBottom: '#8bac0f', paletteLock: GAMEBOY_PALETTE, shadows: true,
    },
  },
};

export const STYLE_LIST = Object.values(STYLE_PRESETS);

// ----------------------------------------------------------------- Paletten

export type PaletteId = 'style' | 'pico8' | 'sweetie16' | 'endesga32' | 'gameboy' | 'free';

export interface PaletteDef {
  id: PaletteId;
  name: string;
  colors?: string[];
}

export const PALETTES: Record<PaletteId, PaletteDef> = {
  style: { id: 'style', name: 'Stil-Palette (automatisch begrenzt)' },
  free: { id: 'free', name: 'Frei (unbegrenzt)' },
  pico8: {
    id: 'pico8', name: 'PICO-8 (16)',
    colors: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
  },
  sweetie16: {
    id: 'sweetie16', name: 'Sweetie 16',
    colors: ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'],
  },
  endesga32: {
    id: 'endesga32', name: 'Endesga 32',
    colors: ['#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633', '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e', '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466', '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569'],
  },
  gameboy: { id: 'gameboy', name: 'Game Boy (4)', colors: GAMEBOY_PALETTE },
};

export const PALETTE_LIST = Object.values(PALETTES);

/** Wendet die Farbtransformation eines Stils auf eine Farbe an. */
export function applyStyleColor(hex: string, style: StylePreset): string {
  const [h, s, l] = hexToHsl(hex);
  let nh = h + style.hueShift;
  let ns = Math.min(1, s * style.satMul);
  let nl = Math.max(0, Math.min(1, l * style.lightMul + style.lightAdd));
  if (style.id === 'dark') {
    // Dunkle Töne Richtung Violett ziehen
    nh = h + (nl < 0.35 ? 18 : 6);
  }
  if (style.id === 'cute') {
    ns = Math.min(ns, 0.75);
    nl = Math.max(nl, 0.32);
  }
  return hslToHex([nh, ns, nl]);
}

/** Bildet eine Farbe auf eine feste Palette ab (Gameboy: nach Helligkeit). */
export function mapToPalette(hex: string, palette: string[], byLuminance = false): string {
  if (!byLuminance) return nearestColor(hex, palette);
  const sorted = [...palette].sort((a, b) => luminance(a) - luminance(b));
  const lum = luminance(hex);
  const idx = Math.min(sorted.length - 1, Math.floor(lum * sorted.length * 1.05));
  return sorted[idx];
}
