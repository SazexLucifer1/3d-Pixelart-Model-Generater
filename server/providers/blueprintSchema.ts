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

The generator has a procedural object library. Prefer library archetypes; add primitives to a library object for extra props.

Subjects that are NOT in the library must still look like what the user asked for – never substitute an unrelated object (e.g. never a crystal for "monkey"):
- Upright creatures (ape, monkey, gorilla, frog-man, lizard-man, bear-man, minotaur, alien …): archetype "humanoid", recolor skin/hair/armor/cloth like fur, scales or skin, add fitting features (tail, horns, elf_ears, wings) and primitives for snouts, ears, manes, beaks. This keeps walk/attack animations working.
- Four-legged animals not listed (e.g. mouse, lizard, turtle, crocodile, elephant, rhino, camel): archetype "quadruped" with the closest variant, matching colors, and primitives for trunks, shells, horns, long snouts.
- Flying creatures: "bird" (or "dragon" for large reptiles); jelly/amorphous creatures: "slime".
- Everything else (vehicles, machines, food, instruments, statues, unusual objects): archetype "custom" with 15–60 primitives that together form a recognizable silhouette. Use several colors (base, shade, accent) and name the parts meaningfully.

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

// ---------------------------------------------------------------------------
//  Stilbeschreibung → Stilprofil (gemeinsam für alle LLMs)
// ---------------------------------------------------------------------------

export const STYLE_SYSTEM_PROMPT =
  'You translate a game art style description (German or English) into pixel-art style parameters for a sprite generator. saturation and brightness are multipliers around 1.0 (0.5-1.5). Notes: 3-6 short German sentences explaining the interpretation.';

export const STYLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['baseStyle', 'characterSize', 'tileSize', 'outline', 'outlineColor', 'shadingLevels', 'shadowTone', 'highlightTone', 'saturation', 'brightness', 'tintHue', 'proportions', 'view', 'directions', 'detail', 'notes'],
  properties: {
    baseStyle: { type: 'string', enum: ['fantasy', 'scifi', 'medieval', 'dark', 'cute', 'gameboy'] },
    characterSize: { type: 'integer' },
    tileSize: { type: 'integer' },
    outline: { type: 'string', enum: ['black', 'dark', 'colored', 'none'] },
    outlineColor: { type: 'string' },
    shadingLevels: { type: 'integer', enum: [2, 3, 4] },
    shadowTone: { type: 'string', enum: ['warm', 'cool', 'neutral'] },
    highlightTone: { type: 'string', enum: ['gold', 'white', 'neutral'] },
    saturation: { type: 'number' },
    brightness: { type: 'number' },
    tintHue: { type: 'integer', description: '-1 for no tint, otherwise hue 0-359 of the dominant color mood' },
    proportions: { type: 'string', enum: ['chibi', 'jrpg', 'heroic'] },
    view: { type: 'string', enum: ['topdown', 'side', 'iso', 'front'] },
    directions: { type: 'integer', enum: [1, 4, 8] },
    detail: { type: 'integer', enum: [1, 2, 3] },
    notes: { type: 'array', items: { type: 'string' } },
  },
} as const;

/** Übernimmt die LLM-Antwort (STYLE_SCHEMA) in eine Kopie des Basisprofils. */
export function applyStyleOutput(base: StyleProfile, text: string, raw: Record<string, unknown>, model: string): { profile: StyleProfile; notes: string[] } {
  const out = raw as Record<string, never>;
  const p: StyleProfile = structuredClone(base);
  p.description = text;
  p.baseStyle = out.baseStyle;
  p.pixel.characterSize = out.characterSize;
  p.pixel.tileSize = out.tileSize;
  p.pixel.outline = out.outline;
  if (/^#[0-9a-f]{6}$/i.test(out.outlineColor)) p.pixel.outlineColor = out.outlineColor;
  p.pixel.shadingLevels = out.shadingLevels;
  p.color.shadowTone = out.shadowTone;
  p.color.highlightTone = out.highlightTone;
  p.color.saturation = Math.max(0.4, Math.min(1.5, out.saturation));
  p.color.brightness = Math.max(0.6, Math.min(1.3, out.brightness));
  p.color.tint = (out.tintHue as number) >= 0 ? { hue: out.tintHue, amount: 0.12 } : null;
  p.design.proportions = out.proportions;
  p.design.view = out.view;
  p.design.directions = out.directions;
  p.design.detail = out.detail;
  return { profile: p, notes: [`Interpretiert von ${model}`, ...((out.notes as string[] | undefined) ?? [])] };
}
