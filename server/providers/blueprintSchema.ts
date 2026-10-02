import { OBJECT_LIBRARY, ARCHETYPE_IDS } from '../../src/shared/ai/procedural/library';
import { STYLE_LIST } from '../../src/shared/palette/styles';
import type { SceneBlueprint, ObjectSpec, PrimitiveSpec } from '../../src/shared/ai/types';
import type { StyleProfile } from '../../src/shared/style/profile';

/**
 * Gemeinsame Bausteine für alle LLM-basierten Interpreter:
 * System-Prompt (beschreibt die Objektbibliothek) und JSON-Schema der
 * erwarteten Antwort. Das LLM liefert einen SceneBlueprint; die Voxel baut
 * weiterhin der prozedurale SceneBuilder → stabile, editierbare Ergebnisse.
 */

const libraryDoc = ARCHETYPE_IDS.filter((id) => id !== 'custom')
  .map((id) => {
    const e = OBJECT_LIBRARY[id];
    return `- ${id} (${e.name})${e.variants ? ` variants: ${e.variants.join(', ')}` : ''}${e.features ? ` | features: ${e.features.join(', ')}` : ''}`;
  })
  .join('\n');

export const SYSTEM_PROMPT = `You convert a user's description (German or English) into a JSON scene blueprint for a 3D voxel pixel-art generator in the style of 16/32-bit JRPG and isometric game assets.

The generator has a procedural object library. Prefer library archetypes; use "custom" with primitives only for things the library cannot express, or add primitives to a library object for extra props.

Library archetypes:
${libraryDoc}
- custom: build from primitives only

Color slots (hex "#rrggbb") per archetype:
- humanoid: skin, hair, armor (torso/robe), cloth (legs), boots, cape, metal (weapon blade), accent (trim/gold), eyes, gem, hat, beard, shield, wings, horn
- dragon: body, belly, wings, horn, eyes, spikes | quadruped/bird/slime: body, belly, accent, eyes, beak
- house/tower/castle: walls, roof, door, window, frame, moss, flag | tree: trunk, leaves, fruit | chest: wood, metal
- mushroom: cap, stem, dots | spaceship: hull, accent, glow | crystal: crystal | rock: stone | weapon: metal, accent, grip, gem | potion: liquid

Rules:
- objects[0] is the main subject (scale 1, placement "center"). Secondary objects use scale 0.3–0.9 and placement left/right/front/back.
- Weapons and clothing mentioned for a character are features of that character, not separate objects.
- Use a limited, harmonious palette; choose colors that fit the requested style.
- style: one of ${STYLE_LIST.map((s) => s.id).join(', ')}. base: diorama ground ("none" for single characters/items unless a ground is described).
- Primitives use coordinates relative to the object height (1.0 = object height). x/z centered at 0, y=0 is the ground, +z is the front. "at" is the center (box/sphere) or base center (cylinder/cone); "size" is [width, height, depth].
- notes: 2–6 short German sentences explaining how you interpreted the prompt.`;

export const BLUEPRINT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'style', 'base', 'mood', 'notes', 'objects'],
  properties: {
    title: { type: 'string' },
    style: { type: 'string', enum: STYLE_LIST.map((s) => s.id) },
    base: { type: 'string', enum: ['none', 'grass', 'stone', 'sand', 'snow', 'dirt'] },
    mood: { type: 'string', enum: ['day', 'night'] },
    notes: { type: 'array', items: { type: 'string' } },
    objects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['archetype', 'variant', 'label', 'scale', 'placement', 'features', 'colors', 'primitives'],
        properties: {
          archetype: { type: 'string', enum: ARCHETYPE_IDS },
          variant: { type: 'string' },
          label: { type: 'string' },
          scale: { type: 'number' },
          placement: { type: 'string', enum: ['center', 'left', 'right', 'front', 'back'] },
          features: { type: 'array', items: { type: 'string' } },
          colors: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['slot', 'hex'],
              properties: { slot: { type: 'string' }, hex: { type: 'string' } },
            },
          },
          primitives: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['shape', 'at', 'size', 'color', 'material', 'part'],
              properties: {
                shape: { type: 'string', enum: ['box', 'sphere', 'cylinder', 'cone'] },
                at: { type: 'array', items: { type: 'number' } },
                size: { type: 'array', items: { type: 'number' } },
                color: { type: 'string' },
                material: { type: 'string', enum: ['diffuse', 'metal', 'emissive', 'glass'] },
                part: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Antwortformat des LLM (Farben als Liste, da JSON-Schema keine freien Maps erlaubt). */
interface LlmObject extends Omit<ObjectSpec, 'colors'> {
  colors: { slot: string; hex: string }[];
}
interface LlmBlueprint extends Omit<SceneBlueprint, 'objects'> {
  objects: LlmObject[];
}

/** Wandelt die LLM-Antwort in einen SceneBlueprint um. */
export function fromLlmJson(text: string): SceneBlueprint {
  const json = extractJson(text) as LlmBlueprint;
  return {
    ...json,
    objects: (json.objects ?? []).map((o) => ({
      ...o,
      variant: o.variant || undefined,
      colors: Object.fromEntries((o.colors ?? []).map((c) => [c.slot, c.hex.toLowerCase()])),
      primitives: (o.primitives ?? [])
        .filter((p) => Array.isArray(p.at) && p.at.length >= 3 && Array.isArray(p.size) && p.size.length >= 3)
        .map((p) => ({ ...p, at: p.at.slice(0, 3), size: p.size.slice(0, 3) }) as PrimitiveSpec),
    })),
  };
}

/** Robust: akzeptiert reines JSON oder JSON in einem Codeblock. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('LLM-Antwort enthält kein JSON');
    return JSON.parse(m[0]);
  }
}

export function userMessage(prompt: string, size: number, detail: number, style: string, profile?: StyleProfile): string {
  const lines = [`Description: ${prompt}`, `Target height: ${size} voxels. Detail level: ${detail}/3. Requested style: ${style === 'auto' ? 'choose the best fitting style' : style}.`];
  if (profile?.styleLock) {
    // Projekt-Stilprofil (Style Lock): Farben und Design müssen dazu passen
    lines.push(`Project art style (must be followed): ${profile.description || profile.name}. Base style: ${profile.baseStyle}. Proportions: ${profile.design.proportions}.`);
    if (profile.palette.locked && profile.palette.colors.length) lines.push(`Use only colors from this project palette: ${profile.palette.colors.join(', ')}.`);
  }
  return lines.join('\n');
}
