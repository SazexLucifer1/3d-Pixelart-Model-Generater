import { hash3 } from '../ai/procedural/Sculptor';
import type { StyleProfile } from '../style/profile';
import { applyColorMood, lockColor, modelHeightForSprite } from '../style/profile';
import type { IndexedImage, SpriteDoc, SpriteRegion } from './types';
import { indexFromHex } from './indexed';
import { rasterize, computeFraming } from './rasterizer';
import { reduceColors, shade } from '../palette/color';
import { buildScene } from '../ai/procedural/SceneBuilder';
import type { ObjectSpec } from '../ai/types';

/**
 * ============================================================================
 *  Tile- & Karten-Generator
 * ============================================================================
 *
 * Erzeugt prozedural (ohne vorgefertigte Assets):
 *  - nahtlos kachelbare Boden-Tiles (Gras, Erde, Sand, Stein, Wasser …)
 *  - 16 Übergangs-Tiles je Terrainpaar (Ecken-Wang-Set → Godot-Terrain-Autotiling)
 *  - animierte Tiles (Wasser, Lava)
 *  - Dekorations-Tiles (Bäume, Büsche, Felsen, Blumen … aus der Voxelbibliothek)
 * Alle Farben laufen durch das Stilprofil (Farbstimmung + Palettensperre).
 */

export type TerrainId = 'grass' | 'dirt' | 'sand' | 'stone' | 'cobble' | 'water' | 'lava' | 'snow' | 'wood' | 'brick' | 'dungeon' | 'swamp';

interface TerrainDef {
  name: string;
  /** Farbrampe dunkel → hell (4 Stufen). */
  ramp: [string, string, string, string];
  animated?: boolean;
}

export const TERRAINS: Record<TerrainId, TerrainDef> = {
  grass: { name: 'Gras', ramp: ['#2f5e2a', '#3f7a32', '#58993c', '#7cbb4c'] },
  dirt: { name: 'Erde', ramp: ['#4a2f1e', '#6a442a', '#87593a', '#a5754d'] },
  sand: { name: 'Sand', ramp: ['#a8844e', '#c9a466', '#dfc282', '#efdba6'] },
  stone: { name: 'Stein', ramp: ['#3f4048', '#5c5e68', '#7c7f8a', '#a1a4ae'] },
  cobble: { name: 'Pflaster', ramp: ['#3a3634', '#5a5450', '#7a726a', '#9a9086'] },
  water: { name: 'Wasser', ramp: ['#1f3f7a', '#2c5aa0', '#3f7cc4', '#8cc6ec'], animated: true },
  lava: { name: 'Lava', ramp: ['#5a1010', '#b8301a', '#ee7220', '#ffd24a'], animated: true },
  snow: { name: 'Schnee', ramp: ['#9aacc4', '#c4d2e2', '#e2ebf4', '#ffffff'] },
  wood: { name: 'Holzboden', ramp: ['#4a2c1a', '#6e4428', '#8c5a36', '#a87448'] },
  brick: { name: 'Ziegel', ramp: ['#4a2a28', '#7a3a30', '#9c4c3c', '#b8644c'] },
  dungeon: { name: 'Kerkerboden', ramp: ['#24222a', '#3a3742', '#4e4b58', '#6a6676'] },
  swamp: { name: 'Sumpf', ramp: ['#24301e', '#3a4a26', '#4e5e30', '#6a7a3e'] },
};

// ----------------------------------------------------------- Rausch-Helfer

const wrap = (v: number, p: number) => ((v % p) + p) % p;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Periodisches Value-Noise (kachelbar mit Periode `size`). */
function pnoise(x: number, y: number, cell: number, size: number, seed: number): number {
  const period = Math.max(1, Math.round(size / cell));
  const gx = x / cell, gy = y / cell;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = smooth(gx - x0), fy = smooth(gy - y0);
  const h = (ix: number, iy: number) => hash3(wrap(ix, period), wrap(iy, period), 0, seed);
  const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * fx;
  const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * fx;
  return a + (b - a) * fy;
}

/** Periodisches Voronoi: Abstand zum nächsten und zweitnächsten Punkt. */
function voronoi(x: number, y: number, size: number, points: [number, number][]): [number, number, number] {
  let d1 = Infinity, d2 = Infinity, id = 0;
  points.forEach(([px, py], i) => {
    let dx = Math.abs(x - px), dy = Math.abs(y - py);
    dx = Math.min(dx, size - dx);
    dy = Math.min(dy, size - dy);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < d1) { d2 = d1; d1 = d; id = i; } else if (d < d2) d2 = d;
  });
  return [d1, d2, id];
}

// ------------------------------------------------------------- Muster

/** Liefert den Rampenindex (0..3) eines Pixels im Terrain-Muster. */
function terrainLevel(t: TerrainId, x: number, y: number, size: number, seed: number, frame = 0, frames = 1): number {
  const n1 = pnoise(x, y, size / 2, size, seed);
  const n2 = pnoise(x, y, size / 4, size, seed + 7);
  const r = hash3(x, y, 0, seed + 99);
  const base = n1 * 0.6 + n2 * 0.4;
  switch (t) {
    case 'grass': {
      let lv = base > 0.62 ? 3 : base > 0.42 ? 2 : 1;
      // Grashalme: kurze dunkle/helle Striche
      if (r > 0.9) lv = 0;
      else if (r > 0.82 && hash3(x, y + 1, 0, seed + 99) <= 0.9) lv = 3;
      return lv;
    }
    case 'dirt':
    case 'swamp': {
      let lv = base > 0.6 ? 2 : base > 0.35 ? 1 : 0;
      if (r > 0.93) lv = 3;
      if (t === 'swamp' && pnoise(x, y, size / 2, size, seed + 3) > 0.68) lv = 0;
      return lv;
    }
    case 'sand': {
      const ripple = Math.sin(((x + y * 0.5 + n1 * 6) / size) * Math.PI * 2 * 2);
      let lv = ripple > 0.85 ? 1 : base > 0.55 ? 3 : 2;
      if (r > 0.95) lv = 1;
      return lv;
    }
    case 'snow':
      return r > 0.97 ? 3 : base > 0.6 ? 3 : base > 0.3 ? 2 : 1;
    case 'water':
    case 'lava': {
      const ph = (frame / Math.max(1, frames)) * Math.PI * 2;
      const k = (Math.PI * 2) / size;
      const w = Math.sin(x * k * 2 + Math.sin(y * k * 1) * 1.5 + ph) + Math.sin(y * k * 2 - ph + n1 * 2);
      return w > 1.4 ? 3 : w > 0.6 ? 2 : w > -0.6 ? 1 : 0;
    }
    case 'wood': {
      const plank = Math.max(4, Math.round(size / 4));
      if (y % plank === 0) return 0;
      const offset = Math.floor(y / plank) % 2 ? size / 2 : 0;
      if (wrap(x + offset, size) === 0 && y % plank !== 0) return 0;
      const grain = Math.sin((x / size) * Math.PI * 8 + Math.floor(y / plank) * 1.7 + n2 * 3);
      return grain > 0.7 ? 3 : grain > -0.4 ? 2 : 1;
    }
    case 'brick': {
      const bh = Math.max(4, Math.round(size / 4)), bw = bh * 2;
      const row = Math.floor(y / bh);
      const xx = wrap(x + (row % 2 ? bw / 2 : 0), size);
      if (y % bh === 0 || xx % bw === 0) return 0;
      if (y % bh === 1 || xx % bw === 1) return 3;
      return base > 0.5 ? 2 : 1;
    }
    default: {
      // Stein / Pflaster / Kerker: Voronoi-Zellen mit Fugen
      const count = t === 'dungeon' ? 4 : t === 'cobble' ? 6 : 5;
      const pts: [number, number][] = [];
      for (let i = 0; i < count; i++) pts.push([hash3(i, 1, 2, seed) * size, hash3(i, 3, 4, seed) * size]);
      if (t === 'dungeon') {
        const s = size / 2;
        if (x % s === 0 || y % s === 0) return 0;
        if (x % s === 1 || y % s === 1) return 3;
        return r > 0.96 ? 0 : base > 0.55 ? 2 : 1;
      }
      const [d1, d2] = voronoi(x + 0.5, y + 0.5, size, pts);
      if (d2 - d1 < 1.1) return 0;
      if (d2 - d1 < 2.2 && hash3(x, y, 5, seed) > 0.5) return 3;
      return base > 0.55 ? 2 : 1;
    }
  }
}

// ------------------------------------------------------------- Tiles

export type HexTile = (string | null)[];

function rampFor(t: TerrainId, profile: StyleProfile): string[] {
  return TERRAINS[t].ramp.map((c) => lockColor(applyColorMood(c, profile), profile));
}

export function baseTile(t: TerrainId, size: number, profile: StyleProfile, seed: number, frame = 0, frames = 1): HexTile {
  const ramp = rampFor(t, profile);
  const out: HexTile = new Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out[y * size + x] = ramp[terrainLevel(t, x, y, size, seed, frame, frames)];
  // Kleine Details (nur Gras): einzelne Blumen
  if (t === 'grass' && seed % 3 === 2) {
    const fx = Math.floor(hash3(1, 2, 3, seed) * (size - 2)) + 1, fy = Math.floor(hash3(4, 5, 6, seed) * (size - 2)) + 1;
    out[fy * size + fx] = lockColor(applyColorMood('#f0d040', profile), profile);
    out[(fy + 1) * size + fx] = ramp[0];
  }
  return out;
}

/**
 * Übergangs-Tile (Ecken-Wang): corners = [oben-links, oben-rechts, unten-links,
 * unten-rechts], 1 = Terrain A, 0 = Terrain B. Die Grenze wird innen
 * organisch verformt, an den Tile-Kanten aber exakt durch die Ecken
 * bestimmt → nahtlos zwischen benachbarten Tiles.
 */
export function transitionTile(a: TerrainId, b: TerrainId, corners: [number, number, number, number], size: number, profile: StyleProfile, seed: number): HexTile {
  const ta = baseTile(a, size, profile, seed);
  const tb = baseTile(b, size, profile, seed + 1);
  const rampA = rampFor(a, profile);
  const [tl, tr, bl, br] = corners;
  const mask = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      const top = tl + (tr - tl) * u, bottom = bl + (br - bl) * u;
      const m = top + (bottom - top) * v;
      const bump = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
      const n = (pnoise(x, y, size / 4, size, seed + 31) - 0.5) * 0.7 * bump;
      mask[y * size + x] = m + n;
    }
  const out: HexTile = new Array(size * size);
  for (let i = 0; i < size * size; i++) out[i] = mask[i] > 0.5 ? ta[i] : tb[i];
  // Kante: A-Pixel neben B dunkler (Rand), B-Pixel neben A mit Schattenkante
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (mask[i] <= 0.5) continue;
      const below = y + 1 < size ? mask[i + size] : 1;
      const left = x > 0 ? mask[i - 1] : 1, right = x + 1 < size ? mask[i + 1] : 1, above = y > 0 ? mask[i - size] : 1;
      if (below <= 0.5) out[i] = rampA[0];
      else if (left <= 0.5 || right <= 0.5 || above <= 0.5) out[i] = rampA[1];
    }
  return out;
}

/** Alle 16 Ecken-Kombinationen (Index = tl*8 + tr*4 + bl*2 + br). */
export const WANG_CORNERS: [number, number, number, number][] = Array.from({ length: 16 }, (_, i) => [(i >> 3) & 1, (i >> 2) & 1, (i >> 1) & 1, i & 1]);

// ------------------------------------------------------------- Dekoration

export interface DecoSpec {
  name: string;
  spec: Omit<ObjectSpec, 'placement' | 'scale' | 'colors'> & { colors?: Record<string, string> };
  /** Größe in Tiles. */
  tilesW: number;
  tilesH: number;
}

/** Rendert ein Objekt der Voxelbibliothek als Pixel-Sprite (z.B. Baum-Deko). */
export function renderObjectSprite(spec: DecoSpec['spec'], w: number, h: number, profile: StyleProfile, seed: number, view = profile.design.view): HexTile {
  const { height, ppv } = modelHeightForSprite(Math.min(w * 1.6, h), profile);
  let size = Math.max(6, Math.min(height, h - 2));
  for (let attempt = 0; attempt < 4; attempt++) {
    const model = buildScene(
      { title: spec.archetype, style: profile.baseStyle, base: 'none', notes: [], objects: [{ ...spec, colors: spec.colors ?? {}, scale: 1, placement: 'center' }], proportions: profile.design.proportions },
      { prompt: spec.archetype, style: profile.baseStyle, size, palette: 'style', detail: profile.design.detail, seed, profile },
      seed,
    );
    const f = computeFraming(model, view, [0], w, h, ppv);
    if (f.fits < 0.999 && attempt < 3) {
      size = Math.max(5, Math.floor(size * f.fits * 0.95));
      continue;
    }
    return rasterize(model, { width: w, height: h, ppv, view, yaw: 0, origin: f.origin, anchor: f.anchor, profile }).pixels;
  }
  return new Array(w * h).fill(null);
}

/** Kleine 2D-Blumengruppe (zu klein für Voxel). */
function flowerTile(size: number, profile: StyleProfile, seed: number): HexTile {
  const out: HexTile = new Array(size * size).fill(null);
  const cols = ['#f0d040', '#e04870', '#f4f4f4', '#8a6ae0'].map((c) => lockColor(applyColorMood(c, profile), profile));
  const stem = lockColor(applyColorMood('#3f7a32', profile), profile);
  const n = Math.max(2, Math.round(size / 6));
  for (let i = 0; i < n; i++) {
    const x = 1 + Math.floor(hash3(i, 0, 1, seed) * (size - 3)), y = Math.floor(size * 0.35 + hash3(i, 2, 3, seed) * size * 0.5);
    const c = cols[Math.floor(hash3(i, 4, 5, seed) * cols.length)];
    out[y * size + x] = c;
    if (x > 0) out[y * size + x - 1] = shade(c, -0.25);
    if (x + 1 < size) out[y * size + x + 1] = shade(c, -0.25);
    if (y > 0) out[(y - 1) * size + x] = shade(c, -0.25);
    for (let k = 1; k <= 2 && y + k < size; k++) out[(y + k) * size + x] = stem;
  }
  return out;
}

// ------------------------------------------------------------- Biome / Kits

export interface MapKit {
  name: string;
  terrains: TerrainId[];
  /** Übergangspaare [obenliegend, darunter]. */
  transitions: [TerrainId, TerrainId][];
  decos: (DecoSpec | 'flowers')[];
}

const deco = (name: string, archetype: ObjectSpec['archetype'], variant: string | undefined, tilesW: number, tilesH: number, features: string[] = []): DecoSpec => ({ name, tilesW, tilesH, spec: { archetype, variant, features, label: name } });

export const BIOMES: Record<string, MapKit> = {
  forest: {
    name: 'Wald', terrains: ['grass', 'dirt', 'water'], transitions: [['grass', 'dirt'], ['grass', 'water']],
    decos: [deco('Eiche', 'tree', 'oak', 2, 2), deco('Tanne', 'tree', 'pine', 2, 2), deco('Busch', 'tree', 'bush', 1, 1), deco('Felsen', 'rock', undefined, 1, 1, ['moss']), deco('Pilz', 'mushroom', undefined, 1, 1), 'flowers'],
  },
  meadow: {
    name: 'Wiese', terrains: ['grass', 'dirt', 'sand'], transitions: [['grass', 'dirt'], ['grass', 'sand']],
    decos: [deco('Baum', 'tree', 'oak', 2, 2), deco('Busch', 'tree', 'bush', 1, 1), deco('Felsen', 'rock', undefined, 1, 1), 'flowers'],
  },
  desert: {
    name: 'Wüste', terrains: ['sand', 'stone', 'water'], transitions: [['sand', 'stone'], ['sand', 'water']],
    decos: [deco('Palme', 'tree', 'palm', 2, 2), deco('Felsen', 'rock', undefined, 1, 1), deco('Toter Baum', 'tree', 'dead', 2, 2)],
  },
  winter: {
    name: 'Winter', terrains: ['snow', 'stone', 'water'], transitions: [['snow', 'stone'], ['snow', 'water']],
    decos: [deco('Tanne', 'tree', 'pine', 2, 2, ['snow']), deco('Felsen', 'rock', undefined, 1, 1), deco('Kristall', 'crystal', undefined, 1, 1)],
  },
  coast: {
    name: 'Küste', terrains: ['sand', 'water', 'grass'], transitions: [['sand', 'water'], ['grass', 'sand']],
    decos: [deco('Palme', 'tree', 'palm', 2, 2), deco('Felsen', 'rock', undefined, 1, 1), deco('Truhe', 'chest', undefined, 1, 1)],
  },
  swamp: {
    name: 'Sumpf', terrains: ['swamp', 'water', 'dirt'], transitions: [['swamp', 'water'], ['swamp', 'dirt']],
    decos: [deco('Toter Baum', 'tree', 'dead', 2, 2), deco('Pilz', 'mushroom', undefined, 1, 1, ['glow']), deco('Felsen', 'rock', undefined, 1, 1, ['moss'])],
  },
  dungeon: {
    name: 'Kerker', terrains: ['dungeon', 'brick', 'lava'], transitions: [['dungeon', 'lava']],
    decos: [deco('Truhe', 'chest', undefined, 1, 1), deco('Fass', 'furniture', 'barrel', 1, 1), deco('Kiste', 'furniture', 'crate', 1, 1), deco('Fackel', 'furniture', 'torch', 1, 1), deco('Kristall', 'crystal', undefined, 1, 1)],
  },
  town: {
    name: 'Dorf', terrains: ['cobble', 'grass', 'dirt'], transitions: [['grass', 'cobble'], ['grass', 'dirt']],
    decos: [deco('Fass', 'furniture', 'barrel', 1, 1), deco('Kiste', 'furniture', 'crate', 1, 1), deco('Baum', 'tree', 'oak', 2, 2), deco('Brunnen', 'structure', 'well', 2, 2), 'flowers'],
  },
  volcano: {
    name: 'Vulkan', terrains: ['stone', 'lava', 'dirt'], transitions: [['stone', 'lava']],
    decos: [deco('Felsen', 'rock', undefined, 1, 1), deco('Kristall', 'crystal', undefined, 1, 1), deco('Toter Baum', 'tree', 'dead', 2, 2)],
  },
};

/** Wählt Biome und Terrains anhand des Prompts. */
export function kitFromPrompt(prompt: string): MapKit {
  const t = prompt.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  const pick: [RegExp, string][] = [
    [/kerker|dungeon|verlies|katakomb|gruft/, 'dungeon'], [/vulkan|lava|volcan/, 'volcano'], [/sumpf|moor|swamp|marsh/, 'swamp'],
    [/schnee|winter|eis|snow|ice|frost/, 'winter'], [/wueste|desert|oase/, 'desert'], [/strand|kueste|beach|coast|meer|see|insel/, 'coast'],
    [/dorf|stadt|town|village|markt/, 'town'], [/wald|forest|woods|hain/, 'forest'], [/wiese|meadow|feld|ebene|plains/, 'meadow'],
  ];
  const biome = pick.find(([re]) => re.test(t))?.[1] ?? 'meadow';
  const kit = structuredClone(BIOMES[biome]);
  // Explizit genannte Terrains ergänzen ("Gras Tiles", "Sand Tiles" …)
  const words: [RegExp, TerrainId][] = [
    [/gras|grass/, 'grass'], [/erde|dirt|boden/, 'dirt'], [/sand/, 'sand'], [/stein|stone|fels/, 'stone'], [/pflaster|cobble|strasse|weg|road|path/, 'cobble'],
    [/wasser|water|fluss|river/, 'water'], [/lava/, 'lava'], [/schnee|snow/, 'snow'], [/holz|wood|planke/, 'wood'], [/ziegel|brick|mauer|wand/, 'brick'], [/kerker|dungeon/, 'dungeon'], [/sumpf|swamp/, 'swamp'],
  ];
  const explicit = words.filter(([re]) => re.test(t)).map(([, id]) => id);
  if (/tile|kachel|boden|textur/.test(t) && explicit.length) {
    for (const id of explicit) if (!kit.terrains.includes(id)) kit.terrains.push(id);
    if (/uebergang|transition/.test(t) && explicit.length >= 2) kit.transitions.unshift([explicit[0], explicit[1]]);
  }
  kit.terrains = kit.terrains.slice(0, 6);
  return kit;
}

// ------------------------------------------------------------- Tileset

export function generateTileset(kit: MapKit, tileSize: number, profile: StyleProfile, seed = 1): SpriteDoc {
  const ts = tileSize;
  const cols = 8;
  const regions: SpriteRegion[] = [];
  const tiles: { region: SpriteRegion; px: HexTile; w: number; h: number }[] = [];
  const terrains = [...kit.terrains];
  const terrainIndex = (t: TerrainId) => terrains.indexOf(t);
  let row = 0;

  // Basis-Tiles: je Terrain 3 Varianten (animierte: 4 Frames nebeneinander)
  const animated: TerrainId[] = [];
  for (const t of terrains) {
    if (TERRAINS[t].animated) { animated.push(t); continue; }
  }
  let col = 0;
  for (const t of terrains.filter((x) => !TERRAINS[x].animated)) {
    for (let v = 0; v < 3; v++) {
      if (col >= cols) { col = 0; row++; }
      const region: SpriteRegion = { name: `${TERRAINS[t].name} ${v + 1}`, x: col * ts, y: row * ts, w: ts, h: ts, kind: 'tile', corners: [terrainIndex(t), terrainIndex(t), terrainIndex(t), terrainIndex(t)], terrain: terrainIndex(t) };
      tiles.push({ region, px: baseTile(t, ts, profile, seed + v * 13 + terrainIndex(t) * 101), w: ts, h: ts });
      col++;
    }
  }
  row++;
  // Animierte Terrains: Zeile mit 4 Frames
  for (const t of animated) {
    const region: SpriteRegion = { name: `${TERRAINS[t].name} (animiert)`, x: 0, y: row * ts, w: ts, h: ts, kind: 'animated', frames: 4, corners: [terrainIndex(t), terrainIndex(t), terrainIndex(t), terrainIndex(t)], terrain: terrainIndex(t) };
    for (let f = 0; f < 4; f++) tiles.push({ region: f === 0 ? region : { ...region, name: `${region.name} F${f + 1}`, x: f * ts, kind: 'animated', corners: undefined, frames: undefined }, px: baseTile(t, ts, profile, seed + terrainIndex(t) * 101, f, 4), w: ts, h: ts });
    row++;
  }
  // Übergänge: 16 Tiles (2 Zeilen à 8) je Paar
  for (const [a, b] of kit.transitions) {
    if (!terrains.includes(a) || !terrains.includes(b)) continue;
    WANG_CORNERS.forEach((c, i) => {
      if (i === 0 || i === 15) return; // reine Tiles existieren schon
      const k = i - 1;
      const region: SpriteRegion = {
        name: `${TERRAINS[a].name}→${TERRAINS[b].name} ${i}`, x: (k % cols) * ts, y: (row + Math.floor(k / cols)) * ts, w: ts, h: ts, kind: 'transition',
        corners: c.map((bit) => (bit ? terrainIndex(a) : terrainIndex(b))) as [number, number, number, number],
      };
      tiles.push({ region, px: transitionTile(a, b, c, ts, profile, seed + 7), w: ts, h: ts });
    });
    row += 2;
  }
  // Dekoration
  col = 0;
  let rowHeight = 1;
  kit.decos.forEach((d, i) => {
    const w = d === 'flowers' ? 1 : d.tilesW, h = d === 'flowers' ? 1 : d.tilesH;
    if (col + w > cols) { col = 0; row += rowHeight; rowHeight = 1; }
    const region: SpriteRegion = { name: d === 'flowers' ? 'Blumen' : d.name, x: col * ts, y: row * ts, w: w * ts, h: h * ts, kind: 'deco' };
    const px = d === 'flowers' ? flowerTile(ts, profile, seed + i) : renderObjectSprite(d.spec, w * ts, h * ts, profile, seed + i * 17);
    tiles.push({ region, px, w: w * ts, h: h * ts });
    col += w;
    rowHeight = Math.max(rowHeight, h);
  });
  row += rowHeight;

  const W = cols * ts, H = row * ts;
  const sheet: (string | null)[] = new Array(W * H).fill(null);
  for (const t of tiles) {
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
      const c = t.px[y * t.w + x];
      if (c) sheet[(t.region.y + y) * W + t.region.x + x] = c;
    }
    if (t.region.corners || t.region.kind === 'deco' || (t.region.kind === 'animated' && t.region.frames)) regions.push(t.region);
  }
  // Gemeinsame Palette
  const counts = new Map<string, number>();
  for (const c of sheet) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  let palette = [...counts.keys()];
  if (!(profile.palette.locked && profile.palette.colors.length)) {
    const max = Math.max(16, Math.min(255, profile.palette.maxColors + 16));
    if (palette.length > max) {
      const map = reduceColors(palette, max, counts);
      for (let i = 0; i < sheet.length; i++) if (sheet[i]) sheet[i] = map.get(sheet[i]!) ?? sheet[i];
      palette = [...new Set(map.values())];
    }
  }
  const img: IndexedImage = indexFromHex(sheet, W, H, palette);
  return {
    width: W,
    height: H,
    palette,
    animations: [{ id: 'atlas', name: 'tileset', direction: 'none', fps: 4, loop: true, frames: [img] }],
    atlas: { tileSize: ts, regions, terrains: terrains.map((t) => ({ name: TERRAINS[t].name, color: TERRAINS[t].ramp[2] })) },
  };
}

