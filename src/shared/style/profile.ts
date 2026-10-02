import type { StyleId } from '../palette/styles';
import { STYLE_PRESETS, GAMEBOY_PALETTE } from '../palette/styles';
import { hexToHsl, hslToHex, nearestColor } from '../palette/color';

/**
 * ============================================================================
 *  Art-Style-Profile & Style Lock
 * ============================================================================
 *
 * Ein Stilprofil beschreibt den Kunststil eines Spielprojekts – einmal
 * definiert, gilt es für alle zukünftigen Generierungen (2D und 3D):
 *
 *  - Farben       Palette (frei/gesperrt), Farbstimmung, Schatten-/Lichtton
 *  - Pixel-Stil   Sprite-/Tile-Größen, Outline, Schattierungsstufen, Licht
 *  - Design       Proportionen, Perspektive, Detailgrad, Thema
 *
 * Es gibt KEINE vorgefertigten Assets: Das Profil enthält nur Parameter
 * (und optional eine aus eigenen Assets/Referenzen gelernte Palette).
 */

export type Proportions = 'chibi' | 'jrpg' | 'heroic';
export type ViewMode = 'topdown' | 'side' | 'iso' | 'front';
export type OutlineMode = 'black' | 'dark' | 'colored' | 'none';
export type ShadowTone = 'warm' | 'cool' | 'neutral';
export type HighlightTone = 'gold' | 'white' | 'neutral';
export type LightDirection = 'top-left' | 'top-right' | 'top' | 'front';

export interface StyleProfile {
  id: string;
  name: string;
  /** Freitext-Beschreibung, aus der das Profil abgeleitet wurde. */
  description: string;
  /** Basis-Stil (Farbbehandlung, 3D-Rendering). */
  baseStyle: StyleId;

  palette: {
    /** Gesperrt = jede Generierung wird exakt auf diese Farben abgebildet. */
    locked: boolean;
    colors: string[];
    maxColors: number;
  };
  color: {
    saturation: number; // Multiplikator
    brightness: number; // Multiplikator
    /** Farbstich (z.B. dunkle Grüntöne): Farbton + Stärke 0..1 */
    tint: { hue: number; amount: number } | null;
    shadowTone: ShadowTone;
    highlightTone: HighlightTone;
  };
  pixel: {
    characterSize: number; // 16 | 32 | 64 | 128 | individuell
    tileSize: number;
    itemSize: number;
    /** Pixel pro Voxel (0 = automatisch). */
    pixelsPerVoxel: number;
    outline: OutlineMode;
    outlineColor: string;
    /** Schattierungsstufen pro Farbe (2 = hart, 3 = klassisch, 4 = weich). */
    shadingLevels: 2 | 3 | 4;
    castShadows: boolean;
    /** Innenlinien an Tiefenkanten (Arm vor Körper usw.). */
    innerLines: boolean;
    dithering: boolean;
    lightDirection: LightDirection;
  };
  design: {
    proportions: Proportions;
    view: ViewMode;
    directions: 1 | 4 | 8;
    detail: 1 | 2 | 3;
    theme: string[];
  };
  /** Style Lock aktiv: alle Generierungen übernehmen das Profil automatisch. */
  styleLock: boolean;
  /** Analysierte Referenzen (nur Kennzahlen + Paletten, keine Bilder). */
  references: ReferenceSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceSummary {
  name: string;
  palette: string[];
  width: number;
  height: number;
  pixelScale: number;
  hasOutline: boolean;
  outlineColor?: string;
  lightDirection: LightDirection;
  shadingLevels: number;
  saturation: number;
  brightness: number;
}

export function newId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Standardprofil (entspricht den Beispielwerten aus der Anforderung). */
export function createProfile(partial: Partial<StyleProfile> = {}): StyleProfile {
  const now = new Date().toISOString();
  return {
    id: newId('style'),
    name: 'Fantasy RPG',
    description: '',
    baseStyle: 'fantasy',
    palette: { locked: false, colors: [], maxColors: 32 },
    color: { saturation: 1, brightness: 1, tint: null, shadowTone: 'cool', highlightTone: 'neutral' },
    pixel: {
      characterSize: 32, tileSize: 16, itemSize: 16, pixelsPerVoxel: 0, outline: 'black', outlineColor: '#141018',
      shadingLevels: 3, castShadows: true, innerLines: true, dithering: false, lightDirection: 'top-left',
    },
    design: { proportions: 'chibi', view: 'topdown', directions: 4, detail: 2, theme: ['fantasy'] },
    styleLock: true,
    references: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** Vorlagen für neue Profile (nur Parameter – keine Assets). */
export const PROFILE_TEMPLATES: { name: string; text: string }[] = [
  { name: 'Fantasy RPG', text: 'Fantasy RPG, dunkle Grüntöne, warme Schatten, goldene Highlights, 32x32 Charaktere, schwarze Outlines, harte Schatten, keine Verläufe, JRPG Proportionen, mittelalterliche Fantasy' },
  { name: 'Retro Gameboy', text: 'Retro Gameboy Stil, 16x16 Charaktere, 4 Farben, harte Schatten, Seitenansicht' },
  { name: 'Cute Pixel', text: 'Cute Pixel, Pastellfarben, Chibi Proportionen, 32x32, dunkle farbige Outlines, weiche Schatten' },
  { name: 'Dark Fantasy', text: 'Dark Fantasy, düstere entsättigte Farben, kalte Schatten, 64x64 detaillierte Pixel Art, heroische Proportionen, schwarze Outlines' },
  { name: 'Sci-Fi', text: 'Sci-Fi, kühle Metalltöne, Neon Highlights, 32x32, isometrische Ansicht, dunkle Outlines' },
  { name: 'Indie 128', text: 'Moderne Indie Pixel Art, 128x128, keine Outlines, 4 Schattierungsstufen, heroische Proportionen, Seitenansicht' },
];

// ----------------------------------------------------------------------------
//  Profil aus Freitext ableiten (regelbasiert; das Backend kann ein LLM nutzen)
// ----------------------------------------------------------------------------

const norm = (t: string) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

const HUES: Record<string, number> = {
  rot: 0, red: 0, orange: 28, gelb: 50, yellow: 50, gold: 45, gruen: 120, green: 120, tuerkis: 170, teal: 170, cyan: 185,
  blau: 220, blue: 220, lila: 275, violett: 275, purple: 275, pink: 325, rosa: 325, braun: 28, brown: 28,
};

/**
 * Wandelt eine Stilbeschreibung in Profilwerte um, z.B.
 * „dunkle Grüntöne, warme Schatten, goldene Highlights, 32x32 Charaktere,
 *  schwarze Outlines, harte Schatten, keine Verläufe, JRPG Proportionen“.
 */
export function parseStyleText(text: string, base: StyleProfile = createProfile()): { profile: StyleProfile; notes: string[] } {
  const t = norm(text);
  const p: StyleProfile = structuredClone(base);
  const notes: string[] = [];
  p.description = text;

  // Basis-Stil
  const styles: [RegExp, StyleId][] = [
    [/game ?boy|gb-stil/, 'gameboy'], [/sci-?fi|cyber|futur|weltraum|space/, 'scifi'], [/dark fantasy|duester|grimdark|gothic|horror/, 'dark'],
    [/cute|niedlich|suess|kawaii|pastell/, 'cute'], [/mittelalter|medieval/, 'medieval'], [/fantasy|jrpg|rpg/, 'fantasy'],
  ];
  for (const [re, id] of styles) if (re.test(t)) { p.baseStyle = id; notes.push(`Basis-Stil: ${STYLE_PRESETS[id].name}`); break; }
  if (p.baseStyle === 'gameboy') {
    p.palette = { locked: true, colors: [...GAMEBOY_PALETTE], maxColors: 4 };
    p.pixel.outline = 'colored';
    p.pixel.outlineColor = GAMEBOY_PALETTE[0];
    notes.push('Palette: 4 Game-Boy-Grüntöne (gesperrt)');
  }

  // Größen ("32x32 Charaktere", "16x16 Tiles")
  for (const m of t.matchAll(/(\d{2,3})\s*[x×]\s*\d{2,3}\s*(pixel\s*)?([a-z]*)/g)) {
    const n = Number(m[1]);
    const what = m[3];
    if (/tile|kachel|boden/.test(what)) p.pixel.tileSize = n;
    else if (/item|icon|gegenst/.test(what)) p.pixel.itemSize = n;
    else {
      p.pixel.characterSize = n;
      if (!/tile/.test(t)) p.pixel.tileSize = n <= 16 ? 16 : n >= 64 ? 32 : 16;
      p.pixel.itemSize = Math.max(16, Math.round(n / 2));
    }
    notes.push(`Größe ${n}×${n} für ${what || 'Charaktere'}`);
  }

  // Outline
  if (/keine? (outline|kontur)|ohne (outline|kontur)|no outline/.test(t)) p.pixel.outline = 'none';
  else if (/schwarze? (outline|kontur)|black outline/.test(t)) { p.pixel.outline = 'black'; p.pixel.outlineColor = '#0e0b12'; }
  else if (/farbige|selektive|selective|colou?red outline|dunkle farbige/.test(t)) p.pixel.outline = 'dark';
  else if (/dunkle (outline|kontur)|dark outline/.test(t)) p.pixel.outline = 'dark';
  if (/outline|kontur/.test(t)) notes.push(`Outline: ${p.pixel.outline}`);

  // Schattierung
  if (/harte? schatten|hard shad|keine verlaeufe|no gradient|flach|flat/.test(t)) { p.pixel.shadingLevels = /flach|flat/.test(t) ? 2 : 3; p.pixel.dithering = false; notes.push('Harte Schatten, keine Verläufe'); }
  if (/weiche? schatten|soft shad|4 (schattierungs)?stufen/.test(t)) p.pixel.shadingLevels = 4;
  if (/dither/.test(t)) p.pixel.dithering = !/kein|ohne|no /.test(t.slice(Math.max(0, t.indexOf('dither') - 8), t.indexOf('dither')));
  if (/ohne schattenwurf|keine schlagschatten|no cast/.test(t)) p.pixel.castShadows = false;

  // Licht- und Schattentöne
  if (/warme? schatten|warm shadow/.test(t)) { p.color.shadowTone = 'warm'; notes.push('Warme Schatten'); }
  if (/kalte?|kuehle? schatten|cool shadow|cold shadow/.test(t)) { p.color.shadowTone = 'cool'; notes.push('Kühle Schatten'); }
  if (/gold(ene)? (highlight|lichter|akzent)|golden highlight/.test(t)) { p.color.highlightTone = 'gold'; notes.push('Goldene Highlights'); }
  if (/weisse? (highlight|lichter)/.test(t)) p.color.highlightTone = 'white';
  if (/licht von rechts|light from (the )?right/.test(t)) p.pixel.lightDirection = 'top-right';
  if (/licht von links|light from (the )?left/.test(t)) p.pixel.lightDirection = 'top-left';
  if (/licht von oben|top light/.test(t)) p.pixel.lightDirection = 'top';

  // Farbstimmung
  const tintMatch = t.match(/(dunkle|helle|satte|warme|kalte)?\s*(rot|orange|gelb|gold|gruen|tuerkis|blau|lila|violett|pink|rosa|braun)(toene|tone|en toenen)/);
  if (tintMatch) {
    p.color.tint = { hue: HUES[tintMatch[2]], amount: 0.12 };
    if (tintMatch[1] === 'dunkle') p.color.brightness = 0.88;
    if (tintMatch[1] === 'helle') p.color.brightness = 1.08;
    notes.push(`Farbstimmung: ${tintMatch[0]}`);
  }
  if (/entsaettigt|desaturated|gedeckt|muted/.test(t)) p.color.saturation = 0.72;
  if (/kraeftig|saturated|leuchtend|vibrant|satte/.test(t)) p.color.saturation = 1.15;
  if (/pastell|pastel/.test(t)) { p.color.saturation = 0.75; p.color.brightness = 1.1; }
  if (/duester|dunkel(e)? farben|dark colou?rs/.test(t)) p.color.brightness = 0.82;
  const nColors = t.match(/(\d{1,3})\s*farben|(\d{1,3})\s*colou?rs/);
  if (nColors) { p.palette.maxColors = Number(nColors[1] ?? nColors[2]); notes.push(`Max. ${p.palette.maxColors} Farben`); }

  // Design
  if (/chibi|grosser kopf|super deformed/.test(t)) p.design.proportions = 'chibi';
  else if (/jrpg[ -]?(charakter)?proportion|jrpg proportions/.test(t)) p.design.proportions = 'jrpg';
  else if (/heroisch|heroic|realistisch|realistic|schlank/.test(t)) p.design.proportions = 'heroic';
  if (/proportion/.test(t)) notes.push(`Proportionen: ${p.design.proportions}`);
  if (/isometr/.test(t)) p.design.view = 'iso';
  else if (/seitenansicht|side ?view|platformer|plattformer|sidescroller/.test(t)) p.design.view = 'side';
  else if (/top[- ]?down|draufsicht|3\/4|vogelperspektive/.test(t)) p.design.view = 'topdown';
  else if (/frontal|frontansicht/.test(t)) p.design.view = 'front';
  if (/8 richtungen|8 directions/.test(t)) p.design.directions = 8;
  if (/detailliert|detailed|hoher detailgrad/.test(t)) p.design.detail = 3;
  if (/minimalistisch|simpel|simple|niedriger detailgrad/.test(t)) p.design.detail = 1;
  const themes = ['mittelalter', 'fantasy', 'sci-fi', 'steampunk', 'horror', 'western', 'pirat', 'ninja', 'cyberpunk', 'post-apokalypse'];
  p.design.theme = themes.filter((th) => t.includes(th));

  if (p.pixel.characterSize >= 128 && !p.pixel.pixelsPerVoxel) notes.push('128er Sprites: 2 Pixel pro Voxel');
  p.updatedAt = new Date().toISOString();
  return { profile: p, notes };
}

// ----------------------------------------------------------------------------
//  Farbanwendung (gemeinsam für 2D und 3D)
// ----------------------------------------------------------------------------

/** Wendet Farbstimmung des Profils auf eine Grundfarbe an. */
export function applyColorMood(hex: string, p: StyleProfile): string {
  let [h, s, l] = hexToHsl(hex);
  s = Math.min(1, s * p.color.saturation);
  l = Math.max(0, Math.min(1, l * p.color.brightness));
  if (p.color.tint) {
    const d = ((p.color.tint.hue - h + 540) % 360) - 180;
    h += d * p.color.tint.amount;
  }
  return hslToHex([h, s, l]);
}

const SHADOW_HUE: Record<ShadowTone, number | null> = { warm: 15, cool: 250, neutral: null };
const LIGHT_HUE: Record<HighlightTone, number | null> = { gold: 48, white: null, neutral: 55 };

/**
 * Erzeugt eine Farbrampe [dunkelster … hellster] für eine Grundfarbe gemäß
 * Profil (Hue-Shifting: Schatten warm/kalt, Lichter golden …).
 */
export function colorRamp(hex: string, p: StyleProfile, levels = p.pixel.shadingLevels): string[] {
  const [h, s, l] = hexToHsl(hex);
  const shift = (target: number | null, amount: number) => (target === null ? h : h + (((target - h + 540) % 360) - 180) * amount);
  const make = (dl: number, hueTarget: number | null, hueAmt: number, ds: number) =>
    hslToHex([shift(hueTarget, hueAmt), Math.max(0, Math.min(1, s * ds)), Math.max(0.02, Math.min(0.97, l + dl))]);
  const shadow = (k: number) => make(-0.16 * k * (0.5 + l), SHADOW_HUE[p.color.shadowTone], 0.12 * k, 1 + 0.08 * k);
  const light = (k: number) =>
    p.color.highlightTone === 'white' ? make(0.12 * k * (1.2 - l), null, 0, 1 - 0.25 * k) : make(0.11 * k * (1.2 - l), LIGHT_HUE[p.color.highlightTone], 0.1 * k, 1 - 0.05 * k);
  switch (levels) {
    case 2:
      return [shadow(1), hex];
    case 4:
      return [shadow(2), shadow(1), hex, light(1)];
    default:
      return [shadow(1), hex, light(1)];
  }
}

/** Bildet eine Farbe auf die gesperrte Profilpalette ab (Style Lock). */
export function lockColor(hex: string, p: StyleProfile): string {
  if (p.palette.locked && p.palette.colors.length) return nearestColor(hex, p.palette.colors);
  return hex;
}

/** Größe des Voxelmodells für eine Sprite-Größe (1 Voxel ≈ 1 Pixel). */
export function modelHeightForSprite(spriteSize: number, p: StyleProfile): { height: number; ppv: number } {
  const ppv = p.pixel.pixelsPerVoxel || (spriteSize >= 128 ? 2 : 1);
  const margin = spriteSize <= 16 ? 2 : spriteSize <= 32 ? 4 : 6;
  return { height: Math.max(10, Math.floor((spriteSize - margin) / ppv)), ppv };
}
