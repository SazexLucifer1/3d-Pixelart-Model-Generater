import { VoxelModel, type SerializedModel } from '../voxel/VoxelModel';
import type { StyleProfile } from '../style/profile';
import { modelHeightForSprite } from '../style/profile';
import type { SceneBlueprint } from '../ai/types';
import { serializeSpriteDoc, parseSpriteDoc, type Direction, type SerializedSpriteDoc } from './types';
import { spriteFromPrompt, addAnimationsToDoc, renderSpriteDoc, availableAnimations, type SpriteAnimRequest } from './spriteGenerator';
import { generateTileset, kitFromPrompt } from './tiles';
import { generateEffect, effectFromPrompt, EFFECTS } from './effects';
import { generateUiKit, uiThemeFromPrompt } from './ui';
import { computeFraming } from './rasterizer';
import { DIRECTION_YAW } from './types';

/**
 * Asset-Jobs: einheitliche, serialisierbare Aufträge für alle 2D-Generatoren.
 * Laufen im Web-Worker (Browser), im Backend oder in Tests.
 */
export type AssetJob =
  | { type: 'sprite'; prompt: string; size: number; profile: StyleProfile; directions: Direction[]; animations: SpriteAnimRequest[]; seed?: number; blueprint?: SceneBlueprint; objectAnims?: boolean }
  | { type: 'addAnimations'; doc: SerializedSpriteDoc; animations: SpriteAnimRequest[]; profile: StyleProfile; directions?: Direction[] }
  | { type: 'fromModel'; model: SerializedModel; archetype: string; size: number; profile: StyleProfile; directions: Direction[]; animations: SpriteAnimRequest[] }
  | { type: 'tileset'; prompt: string; tileSize: number; profile: StyleProfile; seed?: number }
  | { type: 'effect'; prompt: string; size: number; profile: StyleProfile; frames?: number; fps?: number; seed?: number }
  | { type: 'ui'; prompt: string; profile: StyleProfile };

export interface JobResult {
  doc: SerializedSpriteDoc;
  name: string;
  archetype?: string;
  blueprint?: SceneBlueprint;
  seed?: number;
  /** Verfügbare Animationen des Modells (für die UI). */
  available?: { id: string; name: string; group: string; frames: number; fps: number }[];
  meta?: Record<string, unknown>;
  notes: string[];
}

function objectAnimRequests(model: VoxelModel, archetype: string): SpriteAnimRequest[] {
  return availableAnimations(model, archetype)
    .filter((d) => d.group === 'Objekt' || !['humanoid', 'quadruped', 'dragon', 'slime', 'bird', 'critter'].includes(archetype))
    .slice(0, 3)
    .map((d) => ({ id: d.id, frames: d.frames, fps: d.fps }));
}

export function runJob(job: AssetJob): JobResult {
  switch (job.type) {
    case 'sprite': {
      const res = spriteFromPrompt({ prompt: job.prompt, size: job.size, profile: job.profile, directions: job.directions, animations: job.animations, seed: job.seed, blueprint: job.blueprint });
      let doc = res.doc;
      const model = VoxelModel.fromJSON(res.generation.model);
      const archetype = res.generation.blueprint.objects[0]?.archetype ?? 'custom';
      // Objekte ohne Charakter-Animationen: passende Objekt-Animationen ergänzen
      if (job.objectAnims && !job.animations.length) {
        const extra = objectAnimRequests(model, archetype);
        if (extra.length) doc = addAnimationsToDoc(doc, extra, job.profile, job.directions);
      }
      return {
        doc: serializeSpriteDoc(doc),
        name: res.generation.blueprint.title,
        archetype,
        blueprint: res.generation.blueprint,
        seed: res.generation.seed,
        available: availableAnimations(model, archetype).map((d) => ({ id: d.id, name: d.name, group: d.group, frames: d.frames, fps: d.fps })),
        notes: res.generation.blueprint.notes,
      };
    }
    case 'addAnimations': {
      const doc = addAnimationsToDoc(parseSpriteDoc(job.doc), job.animations, job.profile, job.directions);
      return { doc: serializeSpriteDoc(doc), name: '', notes: [`${job.animations.length} Animation(en) mit identischer Quelle erzeugt`] };
    }
    case 'fromModel': {
      const model = VoxelModel.fromJSON(job.model);
      const base = modelHeightForSprite(job.size, job.profile).ppv;
      const f = computeFraming(model, job.profile.design.view, job.directions.map((d) => DIRECTION_YAW[d]), job.size, job.size, base);
      const ppv = base * Math.min(1, f.fits);
      const final = renderSpriteDoc(model, job.archetype, { width: job.size, height: job.size, profile: { ...job.profile, pixel: { ...job.profile.pixel, pixelsPerVoxel: ppv } }, directions: job.directions, animations: job.animations });
      return {
        doc: serializeSpriteDoc(final),
        name: '3D-Modell als Sprite',
        archetype: job.archetype,
        available: availableAnimations(model, job.archetype).map((d) => ({ id: d.id, name: d.name, group: d.group, frames: d.frames, fps: d.fps })),
        notes: [f.fits < 1 ? `Modell auf ${Math.round(f.fits * 100)} % verkleinert (${job.size}px)` : `${base} Pixel pro Voxel`],
      };
    }
    case 'tileset': {
      const kit = kitFromPrompt(job.prompt);
      const doc = generateTileset(kit, job.tileSize, job.profile, job.seed ?? 1);
      return { doc: serializeSpriteDoc(doc), name: `${kit.name}-Tileset`, meta: { biome: kit.name, terrains: kit.terrains }, notes: [`Biom: ${kit.name}`, `Terrains: ${kit.terrains.join(', ')}`, `${doc.atlas?.regions.length} Tiles/Objekte`] };
    }
    case 'effect': {
      const id = effectFromPrompt(job.prompt);
      const doc = generateEffect(id, job.size, job.profile, { frames: job.frames, fps: job.fps, seed: job.seed });
      return { doc: serializeSpriteDoc(doc), name: `Effekt: ${EFFECTS[id].name}`, meta: { effect: id }, notes: [`Effekt erkannt: ${EFFECTS[id].name}`] };
    }
    case 'ui': {
      const theme = uiThemeFromPrompt(job.prompt, job.profile);
      const doc = generateUiKit(theme, job.profile);
      return { doc: serializeSpriteDoc(doc), name: `UI-Kit (${theme})`, meta: { theme }, notes: [`Thema: ${theme}`, `${doc.atlas?.regions.length} UI-Elemente`] };
    }
  }
}
