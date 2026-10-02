import type { GenerationRequest, GenerationResult, GeneratorInfo } from '../../shared/ai/types';
import { createProceduralGenerator } from '../../shared/ai/generators';

/**
 * Client-seitiger Zugang zur KI-Generierung.
 *
 * 1. Bevorzugt das Node-Backend (`/api/generate`), wo auch LLM-/Bild-KI-
 *    Anbindungen mit API-Keys laufen.
 * 2. Ist das Backend nicht erreichbar, wird der prozedurale Generator direkt
 *    im Browser ausgeführt – die App funktioniert also auch rein statisch.
 */

const local = createProceduralGenerator();
let backendAvailable: boolean | null = null;
let backendFailedAt = 0;
/** Nach einem Fehlschlag wird das Backend erst nach dieser Zeit erneut versucht. */
const RETRY_MS = 15_000;

function markOffline(): void {
  backendAvailable = false;
  backendFailedAt = Date.now();
}

export async function listGenerators(): Promise<{ generators: GeneratorInfo[]; backend: boolean }> {
  try {
    const res = await fetch('/api/generators', { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { generators: GeneratorInfo[] };
    backendAvailable = true;
    return { generators: data.generators, backend: true };
  } catch {
    markOffline();
    return { generators: [{ id: local.id, name: `${local.name} – im Browser`, description: local.description, available: true }], backend: false };
  }
}

export async function generate(request: GenerationRequest): Promise<GenerationResult> {
  if (backendAvailable !== false || Date.now() - backendFailedAt > RETRY_MS) {
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (res.ok) {
        backendAvailable = true;
        return (await res.json()) as GenerationResult;
      }
      const err = await res.json().catch(() => ({ error: res.statusText }));
      // Server erreichbar, aber Fehler → anzeigen statt stillschweigend lokal
      if (res.status !== 404 && res.status !== 502 && res.status !== 504) throw new Error(err.error ?? `Serverfehler ${res.status}`);
      markOffline();
    } catch (e) {
      if (e instanceof Error && !/fetch|network|Failed|404|502|504/i.test(e.message)) throw e;
      markOffline();
    }
  }
  // Fallback: lokal im Browser (Web-Thread blockiert nur kurz, < 200 ms)
  const result = await local.generate(request);
  result.generator = 'procedural (Browser)';
  return result;
}
