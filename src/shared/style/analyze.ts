import type { LightDirection, ReferenceSummary, StyleProfile } from './profile';
import { hexToHsl, luminance, reduceColors, rgbToHex } from '../palette/color';
import type { SpriteDoc } from '../sprite/types';

/**
 * ============================================================================
 *  Stil-Analyse (Referenzsystem & Bibliotheks-Lernen)
 * ============================================================================
 *
 * Analysiert hochgeladene Referenzbilder bzw. vorhandene eigene Assets und
 * leitet daraus Stilparameter ab: Pixelskalierung, Palette, Outline,
 * Schattierungsstufen, Lichtrichtung, Sättigung/Helligkeit, Größe.
 * Die Bilder selbst werden nicht als Assets weiterverwendet.
 */

export interface AnalysisResult extends ReferenceSummary {
  /** Bild in nativer Pixelauflösung (RGBA). */
  native: { w: number; h: number; data: Uint8ClampedArray };
  notes: string[];
}

const keyOf = (d: ArrayLike<number>, i: number) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];

/** Erkennt den Hochskalierungsfaktor (z.B. 4 → jedes Pixel ist 4×4 groß). */
export function detectPixelScale(data: ArrayLike<number>, w: number, h: number): number {
  const runs = new Map<number, number>();
  const addRuns = (get: (k: number) => number, len: number) => {
    let run = 1;
    for (let k = 1; k <= len; k++) {
      if (k < len && get(k) === get(k - 1)) run++;
      else {
        runs.set(run, (runs.get(run) ?? 0) + 1);
        run = 1;
      }
    }
  };
  const step = Math.max(1, Math.floor(h / 64));
  for (let y = 0; y < h; y += step) addRuns((x) => keyOf(data, (y * w + x) * 4) + (data[(y * w + x) * 4 + 3] < 128 ? 1 << 25 : 0), w);
  for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 64))) addRuns((y) => keyOf(data, (y * w + x) * 4) + (data[(y * w + x) * 4 + 3] < 128 ? 1 << 25 : 0), h);
  let total = 0;
  for (const n of runs.values()) total += n;
  let best = 1;
  for (let s = 2; s <= 16; s++) {
    let ok = 0;
    for (const [len, n] of runs) if (len % s === 0) ok += n;
    if (ok / total > 0.9) best = s;
  }
  return best;
}

export function analyzeImage(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, name = 'Referenz'): AnalysisResult {
  const notes: string[] = [];
  const scale = detectPixelScale(rgba, w, h);
  const nw = Math.max(1, Math.round(w / scale)), nh = Math.max(1, Math.round(h / scale));
  const native = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, Math.floor((x + 0.5) * scale)), sy = Math.min(h - 1, Math.floor((y + 0.5) * scale));
      native.set(rgba.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), (y * nw + x) * 4);
    }
  notes.push(scale > 1 ? `Pixelskalierung ${scale}× erkannt → native Größe ${nw}×${nh}` : `Native Größe ${nw}×${nh}`);

  // Hintergrund: Alphakanal oder einfarbige Ecken
  let usesAlpha = false;
  for (let i = 3; i < native.length; i += 4) if (native[i] < 250) { usesAlpha = true; break; }
  const bgKey = usesAlpha ? -1 : keyOf(native, 0);
  const opaque = (i: number) => (usesAlpha ? native[i * 4 + 3] >= 128 : keyOf(native, i * 4) !== bgKey);
  if (!usesAlpha) notes.push('Kein Alphakanal – Eckfarbe als Hintergrund angenommen');

  // Palette
  const counts = new Map<string, number>();
  let minX = nw, minY = nh, maxX = 0, maxY = 0;
  for (let i = 0; i < nw * nh; i++) {
    if (!opaque(i)) continue;
    const hex = rgbToHex([native[i * 4], native[i * 4 + 1], native[i * 4 + 2]]);
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
    const x = i % nw, y = Math.floor(i / nw);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  let palette = [...counts.keys()];
  if (palette.length > 48) {
    const map = reduceColors(palette, 32, counts);
    palette = [...new Set(map.values())];
    notes.push(`${counts.size} Farben auf 32 reduziert`);
  }
  palette.sort((a, b) => luminance(a) - luminance(b));

  // Outline: Randpixel der Silhouette
  const border = new Map<string, number>();
  let borderN = 0, darkN = 0;
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++) {
      const i = y * nw + x;
      if (!opaque(i)) continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx < 0 || ny < 0 || nx >= nw || ny >= nh || !opaque(ny * nw + nx);
      });
      if (!edge) continue;
      const hex = rgbToHex([native[i * 4], native[i * 4 + 1], native[i * 4 + 2]]);
      border.set(hex, (border.get(hex) ?? 0) + 1);
      borderN++;
      if (luminance(hex) < 0.22) darkN++;
    }
  const hasOutline = borderN > 0 && darkN / borderN > 0.6;
  const outlineColor = hasOutline ? [...border.entries()].sort((a, b) => b[1] - a[1])[0][0] : undefined;
  notes.push(hasOutline ? `Dunkle Outline erkannt (${outlineColor})` : 'Keine durchgehende Outline');

  // Schattierungsstufen: je Farbtongruppe Anzahl Helligkeitsstufen
  const groups = new Map<number, Set<number>>();
  for (const c of palette) {
    const [hh, ss, ll] = hexToHsl(c);
    if (ll < 0.12 || ss < 0.1) continue;
    const g = Math.round(hh / 30) % 12;
    if (!groups.has(g)) groups.set(g, new Set());
    groups.get(g)!.add(Math.round(ll * 10));
  }
  const levelCounts = [...groups.values()].map((s) => s.size).sort((a, b) => a - b);
  const shadingLevels = Math.max(2, Math.min(4, levelCounts[Math.floor(levelCounts.length / 2)] ?? 3));
  notes.push(`${shadingLevels} Schattierungsstufen je Farbe`);

  // Lichtrichtung: Helligkeit links/rechts im Objekt
  let lSum = 0, lN = 0, rSum = 0, rN = 0, tSum = 0, tN = 0, bSum = 0, bN = 0;
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
  let satSum = 0, lightSum = 0, n = 0;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const i = y * nw + x;
      if (!opaque(i)) continue;
      const hex = rgbToHex([native[i * 4], native[i * 4 + 1], native[i * 4 + 2]]);
      const lum = luminance(hex);
      if (x < midX) { lSum += lum; lN++; } else { rSum += lum; rN++; }
      if (y < midY) { tSum += lum; tN++; } else { bSum += lum; bN++; }
      const [, s2, l2] = hexToHsl(hex);
      satSum += s2;
      lightSum += l2;
      n++;
    }
  const lr = lN && rN ? lSum / lN - rSum / rN : 0;
  const tb = tN && bN ? tSum / tN - bSum / bN : 0;
  const lightDirection: LightDirection = Math.abs(lr) < 0.02 ? (tb > 0 ? 'top' : 'front') : lr > 0 ? 'top-left' : 'top-right';
  notes.push(`Licht vermutlich von ${({ 'top-left': 'oben links', 'top-right': 'oben rechts', top: 'oben', front: 'vorne' } as const)[lightDirection]}`);
  const saturation = n ? satSum / n : 0.5;
  const brightness = n ? lightSum / n : 0.5;

  return {
    name,
    palette,
    width: nw,
    height: nh,
    pixelScale: scale,
    hasOutline,
    outlineColor,
    lightDirection,
    shadingLevels,
    saturation,
    brightness,
    native: { w: nw, h: nh, data: native },
    notes,
  };
}

const SIZES = [16, 24, 32, 48, 64, 96, 128];

/** Überträgt die Analyse einer Referenz auf ein Stilprofil. */
export function applyReference(profile: StyleProfile, ref: ReferenceSummary, opts: { palette?: boolean; size?: boolean } = {}): StyleProfile {
  const p = structuredClone(profile);
  if (opts.palette !== false && ref.palette.length) {
    p.palette = { locked: true, colors: [...new Set([...ref.palette, ...(ref.outlineColor ? [ref.outlineColor] : [])])].slice(0, 255), maxColors: Math.max(4, ref.palette.length) };
  }
  p.pixel.outline = ref.hasOutline ? (ref.outlineColor && luminance(ref.outlineColor) < 0.08 ? 'black' : 'dark') : 'none';
  if (ref.outlineColor) p.pixel.outlineColor = ref.outlineColor;
  p.pixel.shadingLevels = Math.max(2, Math.min(4, ref.shadingLevels)) as 2 | 3 | 4;
  p.pixel.lightDirection = ref.lightDirection;
  if (opts.size !== false) {
    const m = Math.max(ref.width, ref.height);
    p.pixel.characterSize = SIZES.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a), 32);
  }
  p.color.saturation = Math.max(0.5, Math.min(1.4, ref.saturation / 0.55));
  p.color.brightness = Math.max(0.6, Math.min(1.3, ref.brightness / 0.48));
  p.references = [...p.references.filter((r) => r.name !== ref.name), stripNative(ref)];
  p.updatedAt = new Date().toISOString();
  return p;
}

function stripNative(r: ReferenceSummary & { native?: unknown; notes?: unknown }): ReferenceSummary {
  const { native: _n, notes: _no, ...rest } = r as AnalysisResult;
  void _n;
  void _no;
  return rest;
}

/**
 * Lernt aus vorhandenen eigenen Assets: gemeinsame Palette (gewichtet nach
 * Nutzung) – Grundlage für die Konsistenz neuer Generierungen.
 */
export function learnPaletteFromDocs(docs: SpriteDoc[], maxColors: number): { colors: string[]; notes: string[] } {
  const counts = new Map<string, number>();
  for (const d of docs)
    for (const a of d.animations)
      for (const f of a.frames.slice(0, 2))
        for (const v of f.data) if (v) counts.set(d.palette[v - 1], (counts.get(d.palette[v - 1]) ?? 0) + 1);
  let colors = [...counts.keys()];
  if (colors.length > maxColors) {
    const map = reduceColors(colors, maxColors, counts);
    colors = [...new Set(map.values())];
  }
  colors.sort((a, b) => luminance(a) - luminance(b));
  return { colors, notes: [`${docs.length} Assets analysiert`, `${counts.size} Farben → ${colors.length} Projektfarben`] };
}
