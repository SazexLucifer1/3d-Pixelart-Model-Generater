import { BlueprintGenerator, GeneratorRegistry, createProceduralGenerator } from '../src/shared/ai/generators';
import { ClaudeInterpreter } from './providers/claude';
import { OllamaInterpreter } from './providers/ollama';
import { MeshApiGenerator, StableDiffusionGenerator } from './providers/imageModels';

/**
 * Hier werden alle KI-Generatoren registriert. Reihenfolge = Priorität bei
 * "Automatisch": der erste verfügbare Generator wird verwendet.
 *
 * Eigene Generatoren: `VoxelGenerator` implementieren (oder einen
 * `PromptInterpreter` mit `BlueprintGenerator` kombinieren) und hier eintragen.
 */
export function createRegistry(): { registry: GeneratorRegistry; autoOrder: string[] } {
  const registry = new GeneratorRegistry()
    .register(
      new BlueprintGenerator(
        'claude',
        'Claude (LLM) + Objektbibliothek',
        'Claude versteht den Prompt (auch komplexe Szenen und freie Formen); die Voxel baut die prozedurale Bibliothek. Benötigt ANTHROPIC_API_KEY.',
        new ClaudeInterpreter(),
        async () => ClaudeInterpreter.isConfigured(),
      ),
    )
    .register(
      new BlueprintGenerator(
        'ollama',
        'Lokales LLM (Ollama) + Objektbibliothek',
        'Ein lokales Sprachmodell interpretiert den Prompt – komplett offline. Benötigt OLLAMA_URL.',
        new OllamaInterpreter(),
        () => OllamaInterpreter.isReachable(),
      ),
    )
    .register(new StableDiffusionGenerator())
    .register(new MeshApiGenerator())
    .register(createProceduralGenerator());
  // Bild-/Mesh-Generatoren nur auf ausdrücklichen Wunsch, LLMs automatisch
  return { registry, autoOrder: ['claude', 'ollama', 'procedural'] };
}
