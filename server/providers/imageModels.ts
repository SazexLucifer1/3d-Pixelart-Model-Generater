import { inflateSync } from 'node:zlib';
import type { GenerationRequest, GenerationResult, VoxelGenerator, SceneBlueprint } from '../../src/shared/ai/types';
import { decodePng, resizeNearest } from '../../src/shared/formats/png';
import { imageToVoxels, parseObj, voxelizeTriangles } from '../../src/shared/formats/voxelize';
import { STYLE_PRESETS, PALETTES, applyStyleColor, mapToPalette } from '../../src/shared/palette/styles';
import type { VoxelModel } from '../../src/shared/voxel/VoxelModel';
import { generateAnimations } from '../../src/shared/animation/animation';

/**
 * Generatoren für bild- und mesh-basierte KI-Modelle.
 *
 * 1) StableDiffusionGenerator – Text → Pixel-Art-Sprite (Stable Diffusion,
 *    AUTOMATIC1111/Forge-API) → Hintergrund entfernen → zu 3D "aufblasen".
 *    Aktivierung: SD_API_URL (z.B. http://localhost:7860)
 *
 * 2) MeshApiGenerator – beliebiger Text-zu-3D-Dienst, der ein OBJ liefert
 *    (z.B. ein eigener Wrapper um Shap-E, TripoSR, Hunyuan3D …) →
 *    Voxelisierung. Aktivierung: TEXT_TO_3D_URL (POST {prompt} → OBJ-Text)
 *
 * Beide liefern dasselbe GenerationResult wie der prozedurale Generator.
 */

function styleModel(model: VoxelModel, request: GenerationRequest): SceneBlueprint['style'] {
  const style = request.style === 'auto' ? 'fantasy' : request.style;
  const preset = STYLE_PRESETS[style];
  const fixed = preset.forcedPalette ?? PALETTES[request.palette]?.colors;
  model.remapColors((hex) => (preset.forcedPalette ? hex : applyStyleColor(hex, preset)));
  if (fixed) model.remapColors((hex) => mapToPalette(hex, fixed, style === 'gameboy'));
  return style;
}

export class StableDiffusionGenerator implements VoxelGenerator {
  readonly id = 'stable-diffusion';
  readonly name = 'Stable Diffusion → Voxel';
  readonly description = 'Erzeugt per Stable Diffusion ein Pixel-Art-Sprite und extrudiert es zu einem 3D-Voxelmodell.';

  async isAvailable(): Promise<boolean> {
    return !!process.env.SD_API_URL;
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const t0 = Date.now();
    const seed = request.seed ?? Math.floor(Math.random() * 1e9);
    const res = await fetch(`${process.env.SD_API_URL}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `pixel art sprite, ${request.prompt}, single object, centered, full body, plain white background, 16-bit game asset`,
        negative_prompt: 'blurry, photo, realistic, multiple objects, text, watermark, shadow',
        width: 512,
        height: 512,
        steps: 24,
        seed,
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`Stable-Diffusion-Fehler ${res.status}`);
    const data = (await res.json()) as { images: string[] };
    const png = decodePng(Buffer.from(data.images[0], 'base64'), (d) => inflateSync(d));
    const small = resizeNearest(png, request.size);
    const model = imageToVoxels(small.data, small.width, small.height, { mode: 'inflate', depth: Math.max(2, Math.round(request.size / 8)), maxColors: 24 });
    const style = styleModel(model, request);
    const blueprint: SceneBlueprint = {
      title: request.prompt.slice(0, 48),
      style,
      base: 'none',
      objects: [{ archetype: 'custom', scale: 1, colors: {}, features: [], placement: 'center', label: 'Sprite' }],
      notes: ['Bild per Stable Diffusion erzeugt', `Auf ${small.width}×${small.height} Pixel reduziert und zu 3D aufgeblasen`],
    };
    return { model: model.toJSON(), blueprint, animations: generateAnimations(model, 'custom'), generator: this.id, durationMs: Date.now() - t0, seed };
  }
}

export class MeshApiGenerator implements VoxelGenerator {
  readonly id = 'mesh-api';
  readonly name = 'Text-zu-3D-Modell → Voxel';
  readonly description = 'Ruft einen Text-zu-3D-Dienst auf (OBJ) und voxelisiert das Ergebnis in Pixel-Art-Auflösung.';

  async isAvailable(): Promise<boolean> {
    return !!process.env.TEXT_TO_3D_URL;
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const t0 = Date.now();
    const seed = request.seed ?? Math.floor(Math.random() * 1e9);
    const res = await fetch(process.env.TEXT_TO_3D_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: request.prompt, seed }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`Text-zu-3D-Fehler ${res.status}`);
    const mesh = parseObj(await res.text());
    const model = voxelizeTriangles(mesh, request.size, 24);
    const style = styleModel(model, request);
    const blueprint: SceneBlueprint = {
      title: request.prompt.slice(0, 48),
      style,
      base: 'none',
      objects: [{ archetype: 'custom', scale: 1, colors: {}, features: [], placement: 'center', label: 'Mesh' }],
      notes: ['3D-Mesh vom Text-zu-3D-Dienst', `Voxelisiert auf ${request.size} Voxel Kantenlänge`],
    };
    return { model: model.toJSON(), blueprint, animations: generateAnimations(model, 'custom'), generator: this.id, durationMs: Date.now() - t0, seed };
  }
}
