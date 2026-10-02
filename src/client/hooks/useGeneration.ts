import { useEditor, type GenerationHistoryItem } from '../state/editorStore';
import { generate } from '../services/generationService';
import { VoxelModel } from '../../shared/voxel/VoxelModel';
import type { GenerationRequest, GenerationResult } from '../../shared/ai/types';
import { viewportRef } from '../render/viewportRef';
import { thumbnail } from '../services/exporters';
import { saveGenerationHistory } from '../services/persistence';

/**
 * Startet eine Generierung mit den aktuellen Einstellungen und öffnet das
 * Ergebnis direkt im Editor.
 */
export async function runGeneration(overrides: Partial<GenerationRequest> = {}): Promise<void> {
  const s = useEditor.getState();
  if (s.generating) return;
  const prompt = (overrides.prompt ?? s.prompt).trim();
  if (!prompt) {
    s.set({ generationError: 'Bitte zuerst eine Beschreibung eingeben.' });
    return;
  }
  const request: GenerationRequest = {
    prompt,
    style: s.gen.style,
    size: s.gen.size,
    palette: s.gen.palette,
    detail: s.gen.detail,
    seed: s.gen.seed ?? undefined,
    generator: s.gen.generator === 'auto' ? undefined : s.gen.generator,
    ...overrides,
  };
  s.set({ generating: true, generationError: null });
  try {
    const result = await generate(request);
    applyResult(result, request, true);
  } catch (e) {
    useEditor.getState().set({ generationError: e instanceof Error ? e.message : String(e) });
  } finally {
    useEditor.getState().set({ generating: false });
  }
}

/** Übernimmt ein Generierungsergebnis in den Editor. */
export function applyResult(result: GenerationResult, request: GenerationRequest, addToHistory: boolean): void {
  const s = useEditor.getState();
  const model = VoxelModel.fromJSON(result.model);
  s.replaceModel(model, `Generiert: ${result.blueprint.title}`, {
    animations: result.animations,
    blueprint: result.blueprint,
    projectName: result.blueprint.title,
    prompt: request.prompt,
    lastRequest: request,
    lastSeed: result.seed,
  });
  s.setRenderStyle(result.blueprint.style);
  s.set({ colorIndex: 0, activeLayer: s.model.layers[0]?.id ?? 0 });
  const vp = viewportRef.get();
  if (vp) {
    vp.flush();
    vp.frameModel();
  }
  if (!addToHistory) return;
  // Vorschaubild erst nach dem Übernehmen der Render-Einstellungen erzeugen
  setTimeout(() => {
    const v = viewportRef.get();
    let thumb: string | undefined;
    try {
      if (v) {
        v.flush();
        thumb = thumbnail(v);
      }
    } catch {
      thumb = undefined;
    }
    const item: GenerationHistoryItem = { id: `${Date.now()}`, prompt: request.prompt, request, result, thumbnail: thumb, createdAt: Date.now() };
    const hist = [item, ...useEditor.getState().generationHistory].slice(0, 24);
    useEditor.getState().set({ generationHistory: hist });
    saveGenerationHistory(hist);
  }, 60);
}
