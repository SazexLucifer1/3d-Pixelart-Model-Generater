import Anthropic from '@anthropic-ai/sdk';
import type { GenerationRequest, PromptInterpreter, SceneBlueprint } from '../../src/shared/ai/types';
import { BLUEPRINT_JSON_SCHEMA, SYSTEM_PROMPT, fromLlmJson, userMessage, extractJson, STYLE_SCHEMA, STYLE_SYSTEM_PROMPT, applyStyleOutput } from './blueprintSchema';
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

/** Stilbeschreibung → Profilwerte per Claude (Structured Outputs). */
export async function claudeParseStyle(text: string, base: StyleProfile): Promise<{ profile: StyleProfile; notes: string[] }> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: process.env.CLAUDE_MODEL ?? 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: STYLE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: text }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: STYLE_SCHEMA as unknown as Record<string, unknown> } },
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude hat die Anfrage abgelehnt');
  const out = extractJson(response.content.map((b) => (b.type === 'text' ? b.text : '')).join('')) as Record<string, unknown>;
  return applyStyleOutput(base, text, out, response.model);
}
