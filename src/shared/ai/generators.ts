import type { GenerationRequest, GenerationResult, PromptInterpreter, SceneBlueprint, VoxelGenerator, GeneratorInfo } from './types';
import { RuleBasedInterpreter } from './interpreter/RuleBasedInterpreter';
import { buildScene } from './procedural/SceneBuilder';
import { generateAnimations } from '../animation/animation';
import { STYLE_PRESETS } from '../palette/styles';
import { OBJECT_LIBRARY } from './procedural/library';

/**
 * Generator = Interpreter (Text → Blueprint) + SceneBuilder (Blueprint → Voxel).
 *
 * Für jede KI-Anbindung, die "versteht", aber nicht selbst Voxel erzeugt
 * (LLMs), genügt es, einen neuen PromptInterpreter zu schreiben und ihn hier
 * einzustecken. Der restliche Ablauf bleibt identisch.
 */
export class BlueprintGenerator implements VoxelGenerator {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly description: string,
    private readonly interpreter: PromptInterpreter,
    private readonly availability: () => Promise<boolean> = async () => true,
  ) {}

  isAvailable(): Promise<boolean> {
    return this.availability();
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const t0 = Date.now();
    const seed = request.seed ?? Math.floor(Math.random() * 1e9);
    const blueprint = sanitizeBlueprint(await this.interpreter.interpret(request), request);
    return buildFromBlueprint(blueprint, request, seed, this.id, t0);
  }
}

/** Baut ein Ergebnis aus einem fertigen Blueprint (auch für LLM-Antworten). */
export function buildFromBlueprint(blueprint: SceneBlueprint, request: GenerationRequest, seed: number, generatorId: string, t0 = Date.now()): GenerationResult {
  const model = buildScene(blueprint, request, seed);
  const animations = blueprint.objects.length ? generateAnimations(model, blueprint.objects[0].archetype) : [];
  return {
    model: model.toJSON(),
    blueprint,
    animations,
    generator: generatorId,
    durationMs: Date.now() - t0,
    seed,
  };
}

/** Prüft und repariert Blueprints aus unsicheren Quellen (z.B. LLM-Antworten). */
export function sanitizeBlueprint(bp: SceneBlueprint, request: GenerationRequest): SceneBlueprint {
  const style = bp.style && STYLE_PRESETS[bp.style] ? bp.style : request.style !== 'auto' ? request.style : 'fantasy';
  const objects = (bp.objects ?? [])
    .filter((o) => o && OBJECT_LIBRARY[o.archetype])
    .slice(0, 8)
    .map((o, i) => ({
      archetype: o.archetype,
      variant: typeof o.variant === 'string' ? o.variant : undefined,
      scale: Number.isFinite(o.scale) && o.scale > 0 ? Math.min(2, o.scale) : i === 0 ? 1 : 0.5,
      colors: Object.fromEntries(Object.entries(o.colors ?? {}).filter(([, v]) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v))),
      features: Array.isArray(o.features) ? o.features.filter((f) => typeof f === 'string') : [],
      placement: i === 0 ? 'center' as const : (['left', 'right', 'front', 'back'].includes(o.placement) ? o.placement : 'right'),
      primitives: Array.isArray(o.primitives) ? o.primitives.slice(0, 200) : undefined,
      label: o.label,
    }));
  if (objects.length === 0) objects.push({ archetype: 'crystal', variant: undefined, scale: 1, colors: {}, features: [], placement: 'center', primitives: undefined, label: 'Kristall' });
  return {
    title: bp.title || 'Unbenannt',
    style,
    objects,
    base: ['none', 'grass', 'stone', 'sand', 'snow', 'dirt'].includes(bp.base) ? bp.base : 'none',
    mood: bp.mood === 'night' ? 'night' : 'day',
    notes: Array.isArray(bp.notes) ? bp.notes : [],
  };
}

/** Der Standardgenerator: komplett offline, deterministisch per Seed. */
export function createProceduralGenerator(): VoxelGenerator {
  return new BlueprintGenerator(
    'procedural',
    'Prozedural (offline)',
    'Regelbasierte Prompt-Analyse + prozedurale Objektbibliothek. Läuft ohne KI-Dienst, auch im Browser.',
    new RuleBasedInterpreter(),
  );
}

/**
 * Registry aller verfügbaren Generatoren. Neue KI-Anbindungen registrieren
 * sich hier – die UI listet sie automatisch.
 */
export class GeneratorRegistry {
  private generators = new Map<string, VoxelGenerator>();

  register(g: VoxelGenerator): this {
    this.generators.set(g.id, g);
    return this;
  }

  get(id: string | undefined): VoxelGenerator | undefined {
    return id ? this.generators.get(id) : undefined;
  }

  async list(): Promise<GeneratorInfo[]> {
    return Promise.all(
      [...this.generators.values()].map(async (g) => ({ id: g.id, name: g.name, description: g.description, available: await g.isAvailable().catch(() => false) })),
    );
  }

  /** Wählt den gewünschten Generator oder fällt auf "procedural" zurück. */
  async resolve(id?: string): Promise<VoxelGenerator> {
    const wanted = this.get(id);
    if (wanted && (await wanted.isAvailable().catch(() => false))) return wanted;
    const fallback = this.get('procedural');
    if (!fallback) throw new Error('Kein Generator registriert');
    return fallback;
  }
}
