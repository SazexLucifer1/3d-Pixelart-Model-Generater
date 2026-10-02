import type { GenerationRequest, PromptInterpreter, SceneBlueprint } from '../../src/shared/ai/types';
import type { StyleProfile } from '../../src/shared/style/profile';
import { BLUEPRINT_JSON_SCHEMA, SYSTEM_PROMPT, STYLE_SCHEMA, STYLE_SYSTEM_PROMPT, applyStyleOutput, extractJson, fromLlmJson, userMessage } from './blueprintSchema';

/**
 * Prompt-Interpretation mit Google Gemini (Gemini API, REST).
 *
 * Aktivierung: GEMINI_API_KEY (oder GOOGLE_API_KEY) setzen – z.B. in einer
 * .env neben der VoxelForge.exe. Optional: GEMINI_MODEL.
 *
 * Gemini liefert per JSON-Modus + Schema einen SceneBlueprint – dieselbe
 * Pipeline wie bei Claude. Ist das gewünschte Modell nicht (mehr) verfügbar,
 * wird automatisch ein verfügbares Flash-/Pro-Modell gewählt.
 */
const API = process.env.GEMINI_API_URL ?? 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash';

const apiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

/** Einmal ermitteltes, funktionierendes Modell (falls das Standardmodell fehlt). */
let resolvedModel: string | null = null;
/** Merkt sich, ob die API das neue Feld responseJsonSchema versteht. */
let useJsonSchemaField = true;

export function geminiConfigured(): boolean {
  return !!apiKey();
}

class GeminiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Wandelt ein JSON-Schema in das ältere OpenAPI-Schema-Format von Gemini
 * (`responseSchema`) um: ohne additionalProperties, Zahlen-Enums als Text.
 */
function toOpenApiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toOpenApiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'additionalProperties') continue;
    if (k === 'enum' && Array.isArray(v) && v.some((x) => typeof x !== 'string')) continue; // nur String-Enums erlaubt
    out[k] = k === 'properties' ? Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, toOpenApiSchema(pv)])) : toOpenApiSchema(v);
  }
  return out;
}

async function callModel(model: string, system: string, user: string, schema: object, temperature: number): Promise<string> {
  const generationConfig: Record<string, unknown> = { responseMimeType: 'application/json', temperature };
  if (useJsonSchemaField) generationConfig.responseJsonSchema = schema;
  else generationConfig.responseSchema = toOpenApiSchema(schema);
  const res = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (!res.ok) throw new GeminiError(res.status, body.error?.message ?? `HTTP ${res.status}`);
  if (body.promptFeedback?.blockReason) throw new Error(`Gemini hat die Anfrage blockiert (${body.promptFeedback.blockReason})`);
  const cand = body.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error(`Gemini lieferte keine Antwort (${cand?.finishReason ?? 'unbekannt'})`);
  if (cand?.finishReason === 'MAX_TOKENS') throw new Error('Gemini-Antwort war zu lang (MAX_TOKENS)');
  return text;
}

/** Sucht ein verfügbares Textmodell (bevorzugt Flash, sonst Pro). */
async function pickAvailableModel(): Promise<string | null> {
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey() } });
  if (!res.ok) return null;
  const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const names = (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-/.test(n) && !/(image|tts|audio|live|embedding|vision|thinking-exp)/.test(n));
  const rank = (n: string) => (/flash/.test(n) && !/lite/.test(n) ? 0 : /pro/.test(n) ? 1 : 2) * 100 - (parseFloat(n.slice(7)) || 0);
  return names.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/** JSON-Anfrage mit automatischer Modell- und Schema-Anpassung. */
async function geminiJson(system: string, user: string, schema: object, temperature = 0.4): Promise<{ text: string; model: string }> {
  let model = resolvedModel ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await callModel(model, system, user, schema, temperature);
      resolvedModel = model;
      return { text, model };
    } catch (e) {
      if (!(e instanceof GeminiError)) throw e;
      if (e.status === 400 && useJsonSchemaField && /responseJsonSchema|response_json_schema|Unknown name/i.test(e.message)) {
        useJsonSchemaField = false; // ältere API → OpenAPI-Schema verwenden
        continue;
      }
      if (e.status === 404) {
        const alt = await pickAvailableModel();
        if (alt && alt !== model) {
          console.log(`[gemini] Modell "${model}" nicht verfügbar – verwende "${alt}"`);
          model = alt;
          continue;
        }
      }
      if (e.status === 400 && /API key/i.test(e.message)) throw new Error('Gemini-API-Schlüssel ungültig (GEMINI_API_KEY prüfen)');
      if (e.status === 429) throw new Error('Gemini: Kontingent erschöpft oder zu viele Anfragen (429) – kurz warten');
      throw new Error(`Gemini-Fehler ${e.status}: ${e.message}`);
    }
  }
  throw new Error('Gemini: keine passende Modell-/Schema-Kombination gefunden');
}

export class GeminiInterpreter implements PromptInterpreter {
  readonly id = 'gemini';
  readonly name = 'Gemini (Google)';

  async interpret(request: GenerationRequest): Promise<SceneBlueprint> {
    const { text, model } = await geminiJson(SYSTEM_PROMPT, userMessage(request.prompt, request.size, request.detail, request.style, request.profile), BLUEPRINT_JSON_SCHEMA);
    const blueprint = fromLlmJson(text);
    blueprint.notes = [`Interpretiert von ${model}`, ...(blueprint.notes ?? [])];
    return blueprint;
  }
}

/** Stilbeschreibung → Stilprofil per Gemini. */
export async function geminiParseStyle(text: string, base: StyleProfile): Promise<{ profile: StyleProfile; notes: string[] }> {
  const res = await geminiJson(STYLE_SYSTEM_PROMPT, text, STYLE_SCHEMA, 0.2);
  return applyStyleOutput(base, text, extractJson(res.text) as Record<string, unknown>, res.model);
}
