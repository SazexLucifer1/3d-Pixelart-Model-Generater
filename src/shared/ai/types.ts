import type { PaletteId, StyleId } from '../palette/styles';
import type { SerializedModel } from '../voxel/VoxelModel';
import type { AnimationClip } from '../animation/types';
import type { MaterialType } from '../voxel/types';

/**
 * ============================================================================
 *  KI-Architektur – Überblick
 * ============================================================================
 *
 *   Text-Prompt + Einstellungen  (GenerationRequest)
 *            │
 *            ▼
 *   ┌──────────────────────┐   austauschbar: Regelbasiert | LLM (Claude, lokal)
 *   │  PromptInterpreter    │   → versteht die Beschreibung
 *   └──────────────────────┘
 *            │  SceneBlueprint (strukturierte Zwischenrepräsentation)
 *            ▼
 *   ┌──────────────────────┐   prozedurale Objektbibliothek + freie Primitive
 *   │  VoxelBuilder         │   → baut echte Voxel
 *   └──────────────────────┘
 *            │
 *            ▼
 *   GenerationResult (editierbares VoxelModel + Animationen + Analyse-Log)
 *
 * Alternativ kann ein {@link VoxelGenerator} die gesamte Pipeline ersetzen –
 * z.B. ein Text-zu-3D-Modell, dessen Mesh anschließend voxelisiert wird. Alle
 * Generatoren liefern dasselbe Ergebnisformat, die UI muss nichts wissen.
 */

export type DetailLevel = 1 | 2 | 3;

/** Eingabe für eine Generierung. */
export interface GenerationRequest {
  prompt: string;
  /** Stil-Preset; "auto" = aus dem Prompt ableiten. */
  style: StyleId | 'auto';
  /** Zielgröße (Höhe des Hauptobjekts in Voxeln), typ. 16–64. */
  size: number;
  palette: PaletteId;
  detail: DetailLevel;
  /** Zufallsseed für reproduzierbare Ergebnisse. */
  seed?: number;
  /** Bevorzugter Generator (z.B. "procedural", "claude"). */
  generator?: string;
}

/** Bekannte Objekt-Archetypen der prozeduralen Bibliothek. */
export type ArchetypeId =
  | 'humanoid'
  | 'dragon'
  | 'quadruped'
  | 'bird'
  | 'slime'
  | 'house'
  | 'tower'
  | 'castle'
  | 'tree'
  | 'campfire'
  | 'chest'
  | 'mushroom'
  | 'spaceship'
  | 'crystal'
  | 'rock'
  | 'weapon'
  | 'potion'
  | 'custom';

/**
 * Freies Primitiv – erlaubt einem LLM, Formen zu beschreiben, die nicht in
 * der Objektbibliothek existieren. Koordinaten sind relativ zur Objekthöhe
 * (1.0 = Zielgröße), x/z zentriert, y=0 am Boden, +z = vorne.
 */
export interface PrimitiveSpec {
  shape: 'box' | 'sphere' | 'cylinder' | 'cone';
  /** Mittelpunkt (box/sphere) bzw. Basismittelpunkt (cylinder/cone). */
  at: [number, number, number];
  /** Ausdehnung [breite, höhe, tiefe]. */
  size: [number, number, number];
  color: string;
  material?: MaterialType;
  /** Name der Ebene, in die das Primitiv gezeichnet wird. */
  part?: string;
}

/** Spezifikation eines einzelnen Objekts in der Szene. */
export interface ObjectSpec {
  archetype: ArchetypeId;
  /** Variante innerhalb des Archetyps (z.B. "knight", "mage", "pine", "wolf"). */
  variant?: string;
  /** Relative Größe zum Hauptobjekt (1 = Zielgröße). */
  scale: number;
  /** Semantische Farbslots, z.B. { armor: '#3a9e4a', cape: '#8b1e2e' }. */
  colors: Record<string, string>;
  /** Merkmale/Ausrüstung, z.B. ["sword", "cape", "helmet"]. */
  features: string[];
  /** Position relativ zum Hauptobjekt. */
  placement: 'center' | 'left' | 'right' | 'front' | 'back';
  /** Zusätzliche freie Formen. */
  primitives?: PrimitiveSpec[];
  /** Anzeigename (für Ebenen/Info). */
  label?: string;
}

/** Strukturierte Zwischenrepräsentation einer Szene. */
export interface SceneBlueprint {
  title: string;
  style: StyleId;
  objects: ObjectSpec[];
  /** Diorama-Sockel unter der Szene. */
  base: 'none' | 'grass' | 'stone' | 'sand' | 'snow' | 'dirt';
  /** Erkannte Stimmung/Tageszeit (beeinflusst Leuchtfenster etc.). */
  mood?: 'day' | 'night';
  /** Nachvollziehbares Analyse-Log für die UI. */
  notes: string[];
}

/** Ergebnis jeder Generierung – unabhängig vom verwendeten Generator. */
export interface GenerationResult {
  model: SerializedModel;
  blueprint: SceneBlueprint;
  animations: AnimationClip[];
  generator: string;
  durationMs: number;
  seed: number;
}

/** Wandelt einen Prompt in einen Blueprint um (regelbasiert oder per LLM). */
export interface PromptInterpreter {
  readonly id: string;
  readonly name: string;
  interpret(request: GenerationRequest): Promise<SceneBlueprint>;
}

/** Komplett austauschbarer Generator (Prompt → Voxelmodell). */
export interface VoxelGenerator {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Ob der Generator aktuell nutzbar ist (z.B. API-Key vorhanden). */
  isAvailable(): Promise<boolean>;
  generate(request: GenerationRequest): Promise<GenerationResult>;
}

/** Info über einen Generator (für die UI). */
export interface GeneratorInfo {
  id: string;
  name: string;
  description: string;
  available: boolean;
}
