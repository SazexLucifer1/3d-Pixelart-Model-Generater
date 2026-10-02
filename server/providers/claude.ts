import Anthropic from '@anthropic-ai/sdk';
import type { GenerationRequest, PromptInterpreter, SceneBlueprint } from '../../src/shared/ai/types';
import { BLUEPRINT_JSON_SCHEMA, SYSTEM_PROMPT, fromLlmJson, userMessage, extractJson } from './blueprintSchema';
import type { StyleProfile } from '../../src/shared/style/profile';

/**
 * Prompt-Interpretation mit Claude (Anthropic API).
 *
 * Aktivierung: Umgebungsvariable ANTHROPIC_API_KEY setzen (oder per
 * `ant auth login` angemeldet sein). Optional: CLAUDE_MODEL.
 *
 * Claude liefert über Structured Outputs garantiert schema-konformes JSON
 * (SceneBlueprint). Bei einer Ablehnung durch Sicherheitsklassifikatoren
 * springt serverseitig automatisch ein Fallback-Modell ein.
 */
export class ClaudeInterpreter implements PromptInterpreter {
  readonly id = 'claude';
  readonly name = 'Claude (Anthropic)';
  private client: Anthropic | null = null;

  static isConfigured(): boolean {
    return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  }

  private getClient(): Anthropic {
    this.client ??= new Anthropic();
    return this.client;
  }

  async interpret(request: GenerationRequest): Promise<SceneBlueprint> {
    const response = await this.getClient().beta.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage(request.prompt, request.size, request.detail, request.style, request.profile) }],
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: BLUEPRINT_JSON_SCHEMA as unknown as Record<string, unknown> },
      },
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('Claude hat die Anfrage abgelehnt. Bitte Beschreibung anpassen.');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error('Claude-Antwort war zu lang (max_tokens erreicht).');
    }
    const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const blueprint = fromLlmJson(text);
    blueprint.notes = [`Interpretiert von ${response.model}`, ...(blueprint.notes ?? [])];
    return blueprint;
  }
}

const STYLE_SCHEMA = {
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

/** Stilbeschreibung → Profilwerte per Claude (Structured Outputs). */
export async function claudeParseStyle(text: string, base: StyleProfile): Promise<{ profile: StyleProfile; notes: string[] }> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: process.env.CLAUDE_MODEL ?? 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: 'You translate a game art style description (German or English) into pixel-art style parameters for a sprite generator. saturation and brightness are multipliers around 1.0 (0.5-1.5). Notes: 3-6 short German sentences explaining the interpretation.',
    messages: [{ role: 'user', content: text }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: STYLE_SCHEMA as unknown as Record<string, unknown> } },
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude hat die Anfrage abgelehnt');
  const out = extractJson(response.content.map((b) => (b.type === 'text' ? b.text : '')).join('')) as Record<string, never>;
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
  return { profile: p, notes: [`Interpretiert von ${response.model}`, ...(out.notes as string[])] };
}
