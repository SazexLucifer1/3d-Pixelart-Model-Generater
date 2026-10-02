import { VoxelModel, type SerializedModel } from '../voxel/VoxelModel';
import type { AnimationClip } from '../animation/types';
import type { GenerationRequest, SceneBlueprint } from '../ai/types';

/**
 * Eigenes Projektformat (.voxproj.json).
 *
 * Enthält alles, um ein Projekt später vollständig editierbar wieder zu
 * öffnen: Voxel, Palette, Ebenen, Animationen sowie die Generierungs-
 * parameter (Prompt, Stil, Seed …), damit Ergebnisse reproduzierbar sind.
 */
export const PROJECT_FORMAT = 'voxel-forge-project';
export const PROJECT_VERSION = 1;

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  model: SerializedModel;
  animations: AnimationClip[];
  generation?: {
    prompt: string;
    request?: GenerationRequest;
    blueprint?: SceneBlueprint;
    seed?: number;
    generator?: string;
  };
  /** Freie Editor-Einstellungen (Kamera, Render-Stil …). */
  editor?: Record<string, unknown>;
}

export function createProject(
  model: VoxelModel,
  opts: { name?: string; prompt?: string; animations?: AnimationClip[]; request?: GenerationRequest; blueprint?: SceneBlueprint; seed?: number; generator?: string; editor?: Record<string, unknown>; createdAt?: string },
): ProjectFile {
  const now = new Date().toISOString();
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: opts.name ?? 'Unbenannt',
    createdAt: opts.createdAt ?? now,
    updatedAt: now,
    model: model.toJSON(),
    animations: opts.animations ?? [],
    generation: opts.prompt !== undefined ? { prompt: opts.prompt, request: opts.request, blueprint: opts.blueprint, seed: opts.seed, generator: opts.generator } : undefined,
    editor: opts.editor,
  };
}

/** Liest und validiert eine Projektdatei. Wirft bei ungültigem Inhalt. */
export function parseProject(json: unknown): { project: ProjectFile; model: VoxelModel } {
  const p = (typeof json === 'string' ? JSON.parse(json) : json) as Partial<ProjectFile>;
  if (!p || p.format !== PROJECT_FORMAT) throw new Error('Keine gültige Voxel-Forge-Projektdatei');
  if (!p.model || !Array.isArray(p.model.voxels) || !Array.isArray(p.model.palette)) throw new Error('Projektdatei enthält kein Voxelmodell');
  if ((p.version ?? 0) > PROJECT_VERSION) throw new Error(`Projektversion ${p.version} wird nicht unterstützt`);
  const project: ProjectFile = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: p.name ?? 'Unbenannt',
    createdAt: p.createdAt ?? new Date().toISOString(),
    updatedAt: p.updatedAt ?? new Date().toISOString(),
    model: p.model,
    animations: Array.isArray(p.animations) ? p.animations : [],
    generation: p.generation,
    editor: p.editor,
  };
  return { project, model: VoxelModel.fromJSON(p.model) };
}
