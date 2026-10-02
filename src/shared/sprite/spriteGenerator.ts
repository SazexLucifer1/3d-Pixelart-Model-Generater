import { VoxelModel } from '../voxel/VoxelModel';
import type { StyleProfile } from '../style/profile';
import { modelHeightForSprite } from '../style/profile';
import { rasterize, computeFraming } from './rasterizer';
import { DIRECTION_YAW, directionsFor, type Direction, type SpriteAnimation, type SpriteDoc, type SpriteRenderSettings } from './types';
import { indexFromHex } from './indexed';
import { animationsFor, buildAnimationModels, type AnimDef } from '../animation/library';
import { nearestColor, reduceColors } from '../palette/color';
import type { GenerationRequest, GenerationResult, SceneBlueprint } from '../ai/types';
import { buildFromBlueprint } from '../ai/generators';
import { analyzePrompt } from '../ai/interpreter/RuleBasedInterpreter';

/**
 * ============================================================================
 *  Sprite- & Sprite-Sheet-Generator
 * ============================================================================
 *
 * Ablauf: Text → (KI) Voxelmodell in Sprite-Auflösung (1 Voxel ≈ 1 Pixel)
 *         → Posen je Animation → Rasterizer je Richtung und Frame
 *         → indizierte Frames mit gemeinsamer, gesperrter Palette.
 *
 * Alles wird aus EINEM Basismodell mit EINEM Satz Render-Einstellungen
 * erzeugt (gespeichert in `doc.source`). Neue Animationen für einen
 * bestehenden Charakter nutzen dieselbe Quelle → keine zufälligen
 * Veränderungen an Farben, Kleidung, Körperform oder Pixelgröße.
 */

export interface SpriteAnimRequest {
  id: string;
  frames: number;
  fps: number;
}

export interface SpriteRenderOptions {
  width: number;
  height: number;
  profile: StyleProfile;
  directions: Direction[];
  /** Leere Liste = statisches Sprite ("default"). */
  animations: SpriteAnimRequest[];
}

export const STATIC_ANIM = 'default';

/** Liefert die Animationsdefinitionen, die für ein Modell möglich sind. */
export function availableAnimations(model: VoxelModel, archetype: string): AnimDef[] {
  // Gleiche ID kann bei Objekten mehrfach vorkommen (Tür / Deckel) → erste gewinnt
  const seen = new Set<string>();
  return animationsFor(model, archetype).filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)));
}

/** Rendert ein komplettes Sprite-Dokument aus einem Voxelmodell. */
export function renderSpriteDoc(model: VoxelModel, archetype: string, opts: SpriteRenderOptions, render?: SpriteRenderSettings, fixedPalette?: string[]): SpriteDoc {
  const { profile } = opts;
  const ppv = render?.ppv ?? modelHeightForSprite(opts.height, profile).ppv;
  const view = render?.view ?? profile.design.view;
  const yaws = opts.directions.map((d) => DIRECTION_YAW[d]);
  const framing = render ?? (() => {
    const f = computeFraming(model, view, yaws, opts.width, opts.height, ppv);
    return { view, ppv, anchor: f.anchor, origin: f.origin, profileId: profile.id } satisfies SpriteRenderSettings;
  })();

  const defs = availableAnimations(model, archetype);
  const jobs = opts.animations.length ? opts.animations : [{ id: STATIC_ANIM, frames: 1, fps: 1 }];
  const raw: { name: string; dir: Direction; fps: number; loop: boolean; frames: (string | null)[][] }[] = [];
  for (const job of jobs) {
    const def = defs.find((d) => d.id === job.id);
    const models = def ? buildAnimationModels(model, def, job.frames) : [model];
    for (const dir of opts.directions) {
      raw.push({
        name: job.id,
        dir,
        fps: job.fps,
        loop: def?.loop ?? true,
        frames: models.map((m) =>
          rasterize(m, { width: opts.width, height: opts.height, ppv, view, yaw: DIRECTION_YAW[dir], origin: framing.origin, anchor: framing.anchor, profile }).pixels,
        ),
      });
    }
  }
  // Feste Palette (bestehendes Asset): jede Farbe auf die vorhandene Palette abbilden → keine neuen Farben
  const palette = fixedPalette ? { colors: fixedPalette } : buildPalette(raw.flatMap((r) => r.frames), profile);
  const animations: SpriteAnimation[] = raw.map((r) => ({
    id: `${r.name}_${r.dir}_${Math.random().toString(36).slice(2, 6)}`,
    name: r.name,
    direction: opts.directions.length > 1 ? r.dir : 'none',
    fps: r.fps,
    loop: r.loop,
    frames: r.frames.map((px) => indexFromHex(px, opts.width, opts.height, palette.colors)),
  }));
  return {
    width: opts.width,
    height: opts.height,
    palette: palette.colors,
    animations,
    source: { model: model.toJSON(), archetype, render: framing },
  };
}

/**
 * Gemeinsame Palette für ALLE Frames eines Assets. Bei gesperrter
 * Projektpalette sind die Farben bereits identisch; sonst wird – über alle
 * Frames gemeinsam – auf die maximale Farbanzahl reduziert.
 */
function buildPalette(frames: (string | null)[][], profile: StyleProfile): { colors: string[] } {
  const counts = new Map<string, number>();
  for (const f of frames) for (const c of f) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  let colors = [...counts.keys()];
  if (!(profile.palette.locked && profile.palette.colors.length)) {
    const max = Math.max(4, Math.min(255, profile.palette.maxColors));
    if (colors.length > max) {
      const reduced = [...new Set(reduceColors(colors, max, counts).values())];
      // Jede Originalfarbe auf die NÄCHSTE Palettenfarbe abbilden – exakt wie
      // beim späteren Nachrendern mit fester Palette (addAnimationsToDoc).
      // So erzeugt dieselbe Pose immer pixelgenau dieselben Indizes.
      const mapping = new Map(colors.map((c) => [c, nearestColor(c, reduced)]));
      for (const f of frames) for (let i = 0; i < f.length; i++) if (f[i]) f[i] = mapping.get(f[i]!)!;
      colors = [...new Set(mapping.values())];
    }
  }
  // Stabile Reihenfolge: dunkel → hell (übersichtliche Palette im Editor)
  colors.sort((a, b) => lum(a) - lum(b));
  return { colors };
}
const lum = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
};

/**
 * Fügt einem bestehenden Sprite neue Animationen hinzu – mit identischer
 * Quelle, Rahmung und EXAKT derselben Palette (Style Lock für Animationen):
 * Es kommen keine neuen Farben hinzu.
 */
export function addAnimationsToDoc(doc: SpriteDoc, animations: SpriteAnimRequest[], profile: StyleProfile, directions?: Direction[]): SpriteDoc {
  if (!doc.source) throw new Error('Dieses Sprite hat kein Quellmodell – neue Animationen können nur für generierte Sprites erzeugt werden.');
  const model = VoxelModel.fromJSON(doc.source.model);
  const dirs = directions ?? ([...new Set(doc.animations.map((a) => a.direction))].filter((d) => d !== 'none') as Direction[]);
  const fresh = renderSpriteDoc(model, doc.source.archetype, { width: doc.width, height: doc.height, profile, directions: dirs.length ? dirs : ['down'], animations }, doc.source.render, doc.palette);
  const newAnims = fresh.animations.map((a) => ({ ...a, direction: dirs.length ? a.direction : ('none' as Direction) }));
  const replaced = new Set(newAnims.map((a) => `${a.name}|${a.direction}`));
  return { ...doc, animations: [...doc.animations.filter((a) => !replaced.has(`${a.name}|${a.direction}`)), ...newAnims] };
}

// ---------------------------------------------------------------------------
//  Kompletter Ablauf: Prompt → Voxelmodell → Sprite
// ---------------------------------------------------------------------------

export interface SpriteFromPromptOptions {
  prompt: string;
  size: number;
  profile: StyleProfile;
  directions?: Direction[];
  animations: SpriteAnimRequest[];
  seed?: number;
  /** Optional: Blueprint von einem LLM. */
  blueprint?: SceneBlueprint;
}

export interface SpriteGenerationResult {
  doc: SpriteDoc;
  generation: GenerationResult;
  request: GenerationRequest;
}

/** Erzeugt das Voxelmodell in Sprite-Auflösung (ohne Diorama-Sockel). */
export function voxelForSprite(opts: SpriteFromPromptOptions, heightOverride?: number): { result: GenerationResult; request: GenerationRequest } {
  const { height } = modelHeightForSprite(opts.size, opts.profile);
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const request: GenerationRequest = {
    prompt: opts.prompt, style: opts.profile.baseStyle, size: heightOverride ?? height, palette: 'style',
    detail: opts.profile.design.detail, seed, profile: opts.profile,
  };
  const bp = opts.blueprint ?? analyzePrompt(request);
  const blueprint: SceneBlueprint = { ...bp, base: 'none' };
  return { result: buildFromBlueprint(blueprint, request, seed, opts.blueprint ? 'llm' : 'procedural'), request };
}

export function spriteFromPrompt(opts: SpriteFromPromptOptions): SpriteGenerationResult {
  let { result, request } = voxelForSprite(opts);
  let model = VoxelModel.fromJSON(result.model);
  const archetype = result.blueprint.objects[0]?.archetype ?? 'custom';
  const directions = opts.directions ?? directionsFor(opts.profile.design.directions, opts.profile.design.view);
  const { ppv } = modelHeightForSprite(opts.size, opts.profile);
  // Passt das Modell nicht ins Sprite (z.B. breiter Drache), kleiner neu bauen
  for (let attempt = 0; attempt < 3; attempt++) {
    const f = computeFraming(model, opts.profile.design.view, directions.map((d) => DIRECTION_YAW[d]), opts.size, opts.size, ppv);
    if (f.fits >= 0.999) break;
    ({ result, request } = voxelForSprite({ ...opts, seed: request.seed }, Math.max(6, Math.floor(request.size * f.fits * 0.97))));
    model = VoxelModel.fromJSON(result.model);
  }
  const doc = renderSpriteDoc(model, archetype, { width: opts.size, height: opts.size, profile: opts.profile, directions, animations: opts.animations });
  doc.source!.blueprint = result.blueprint;
  doc.source!.seed = result.seed;
  return { doc, generation: result, request };
}
