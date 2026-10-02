import { BlueprintGenerator, GeneratorRegistry, createProceduralGenerator } from '../src/shared/ai/generators';
import { ClaudeInterpreter } from './providers/claude';
import { OllamaInterpreter } from './providers/ollama';
import { MeshApiGenerator, StableDiffusionGenerator } from './providers/imageModels';
import type { PromptInterpreter } from '../src/shared/ai/types';

export interface InterpreterEntry {
  id: string;
  interpreter: PromptInterpreter;
  available: () => Promise<boolean>;
}

/**
 * Hier werden alle KI-Generatoren registriert. Reihenfolge = Priorität bei
 * "Automatisch": der erste verfügbare Generator wird verwendet.
 *
 * Eigene Generatoren: `VoxelGenerator` implementieren (oder einen
 * `PromptInterpreter` mit `BlueprintGenerator` kombinieren) und hier eintragen.
 */
export function createRegistry(): { registry: GeneratorRegistry; autoOrder: string[]; interpreters: InterpreterEntry[] } {
  const claude = new ClaudeInterpreter();
  const ollama = new OllamaInterpreter();
  const interpreters: InterpreterEntry[] = [
    { id: 'claude', interpreter: claude, available: async () => ClaudeInterpreter.isConfigured() },
    { id: 'ollama', interpreter: ollama, available: () => OllamaInterpreter.isReachable() },
  ];
  const registry = new GeneratorRegistry()
    .register(
      new BlueprintGenerator(
        'claude',
        'Claude (LLM) + Objektbibliothek',
        'Claude versteht den Prompt (auch komplexe Szenen und freie Formen); die Voxel baut die prozedurale Bibliothek. Benötigt ANTHROPIC_API_KEY.',
        claude,
        async () => ClaudeInterpreter.isConfigured(),
      ),
    )
    .register(
      new BlueprintGenerator(
        'ollama',
        'Lokales LLM (Ollama) + Objektbibliothek',
        'Ein lokales Sprachmodell interpretiert den Prompt – komplett offline. Benötigt OLLAMA_URL.',
        ollama,
        () => OllamaInterpreter.isReachable(),
      ),
    )
    .register(new StableDiffusionGenerator())
    .register(new MeshApiGenerator())
    .register(createProceduralGenerator());
  // Bild-/Mesh-Generatoren nur auf ausdrücklichen Wunsch, LLMs automatisch
  return { registry, autoOrder: ['claude', 'ollama', 'procedural'], interpreters };
}
