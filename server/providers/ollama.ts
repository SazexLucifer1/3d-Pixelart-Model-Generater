import type { GenerationRequest, PromptInterpreter, SceneBlueprint } from '../../src/shared/ai/types';
import { BLUEPRINT_JSON_SCHEMA, SYSTEM_PROMPT, fromLlmJson, userMessage } from './blueprintSchema';

/**
 * Prompt-Interpretation mit einem lokalen LLM über Ollama
 * (https://ollama.com, native /api/chat-Schnittstelle mit JSON-Schema-Format).
 *
 * Aktivierung: OLLAMA_URL (z.B. http://localhost:11434) und OLLAMA_MODEL
 * (z.B. "llama3.1" oder "qwen2.5") setzen. Läuft komplett offline.
 */
export class OllamaInterpreter implements PromptInterpreter {
  readonly id = 'ollama';
  readonly name = 'Lokales LLM (Ollama)';

  static isConfigured(): boolean {
    return !!process.env.OLLAMA_URL;
  }

  static async isReachable(): Promise<boolean> {
    if (!OllamaInterpreter.isConfigured()) return false;
    try {
      const res = await fetch(`${process.env.OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async interpret(request: GenerationRequest): Promise<SceneBlueprint> {
    const res = await fetch(`${process.env.OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL ?? 'llama3.1',
        stream: false,
        format: BLUEPRINT_JSON_SCHEMA,
        options: { temperature: 0.4 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage(request.prompt, request.size, request.detail, request.style) },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Ollama-Fehler ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { message?: { content?: string } };
    const blueprint = fromLlmJson(data.message?.content ?? '');
    blueprint.notes = [`Interpretiert von lokalem Modell ${process.env.OLLAMA_MODEL ?? 'llama3.1'}`, ...(blueprint.notes ?? [])];
    return blueprint;
  }
}
