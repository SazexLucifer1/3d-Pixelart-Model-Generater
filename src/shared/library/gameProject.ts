import type { SerializedModel } from '../voxel/VoxelModel';
import type { AnimationClip } from '../animation/types';
import type { GenerationRequest, SceneBlueprint } from '../ai/types';
import type { SerializedSpriteDoc } from '../sprite/types';
import { createProfile, newId, type StyleProfile } from '../style/profile';

/**
 * ============================================================================
 *  Spielprojekt & Asset-Bibliothek
 * ============================================================================
 *
 * WICHTIG: Es gibt keine vorgefertigte Asset-Datenbank. Ein neues Projekt ist
 * leer – die Bibliothek enthält ausschließlich:
 *  - selbst generierte (und bearbeitete) Assets
 *  - Stilprofile
 *  - verwendete Prompts, Paletten und Metadaten
 * Alle Assets werden dynamisch aus Parametern erzeugt.
 */

export type AssetCategory =
  | 'character' | 'npc' | 'enemy' | 'monster' | 'animal' | 'boss'
  | 'item' | 'weapon' | 'armor'
  | 'building' | 'furniture' | 'environment'
  | 'tile' | 'effect' | 'ui';

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  character: 'Spielercharakter', npc: 'NPC', enemy: 'Gegner', monster: 'Monster', animal: 'Tier', boss: 'Boss',
  item: 'Item', weapon: 'Waffe', armor: 'Rüstung',
  building: 'Gebäude', furniture: 'Möbel & Deko', environment: 'Umgebung',
  tile: 'Karten-Tiles', effect: 'Effekt', ui: 'UI',
};

export const CATEGORY_GROUPS: { name: string; categories: AssetCategory[] }[] = [
  { name: 'Charaktere', categories: ['character', 'npc', 'enemy', 'monster', 'animal', 'boss'] },
  { name: 'Items', categories: ['item', 'weapon', 'armor'] },
  { name: 'Gebäude', categories: ['building', 'furniture'] },
  { name: 'Umgebung', categories: ['environment'] },
  { name: 'Karten', categories: ['tile'] },
  { name: 'Effekte & UI', categories: ['effect', 'ui'] },
];

export type AssetKind = 'voxel' | 'sprite' | 'tileset' | 'effect' | 'ui';

export interface GameAsset {
  id: string;
  name: string;
  category: AssetCategory;
  kind: AssetKind;
  prompt: string;
  tags: string[];
  profileId: string;
  createdAt: string;
  updatedAt: string;
  /** Kleines Vorschaubild (PNG-Data-URL). */
  thumbnail?: string;
  voxel?: {
    model: SerializedModel;
    animations: AnimationClip[];
    blueprint?: SceneBlueprint;
    seed?: number;
    request?: GenerationRequest;
  };
  sprite?: SerializedSpriteDoc;
  meta?: Record<string, unknown>;
}

export interface GameProject {
  format: 'voxel-forge-game';
  version: 1;
  name: string;
  profiles: StyleProfile[];
  activeProfileId: string;
  assets: GameAsset[];
  createdAt: string;
  updatedAt: string;
}

export function createGameProject(name = 'Mein Spiel', profile = createProfile()): GameProject {
  const now = new Date().toISOString();
  return { format: 'voxel-forge-game', version: 1, name, profiles: [profile], activeProfileId: profile.id, assets: [], createdAt: now, updatedAt: now };
}

export function parseGameProject(json: unknown): GameProject {
  const p = (typeof json === 'string' ? JSON.parse(json) : json) as Partial<GameProject>;
  if (!p || p.format !== 'voxel-forge-game') throw new Error('Keine gültige Spielprojekt-Datei (.game.json)');
  const profiles = Array.isArray(p.profiles) && p.profiles.length ? p.profiles.map((x) => ({ ...createProfile(), ...x })) : [createProfile()];
  return {
    format: 'voxel-forge-game',
    version: 1,
    name: p.name ?? 'Mein Spiel',
    profiles,
    activeProfileId: profiles.some((x) => x.id === p.activeProfileId) ? p.activeProfileId! : profiles[0].id,
    assets: Array.isArray(p.assets) ? p.assets : [],
    createdAt: p.createdAt ?? new Date().toISOString(),
    updatedAt: p.updatedAt ?? new Date().toISOString(),
  };
}

export function newAsset(partial: Omit<GameAsset, 'id' | 'createdAt' | 'updatedAt' | 'tags'> & { tags?: string[] }): GameAsset {
  const now = new Date().toISOString();
  return { id: newId('asset'), tags: [], createdAt: now, updatedAt: now, ...partial };
}

/** Kategorie aus Archetyp/Variante und Prompt ableiten. */
export function categoryFor(archetype: string, variant: string | undefined, prompt: string): AssetCategory {
  const t = prompt.toLowerCase();
  if (/\bboss|endgegner|endboss/.test(t)) return 'boss';
  if (/gegner|feind|enemy|monster/.test(t) && ['humanoid', 'quadruped', 'critter', 'slime', 'dragon'].includes(archetype)) return 'enemy';
  if (/\bnpc|händler|haendler|dorfbewohner|villager|merchant|bürger/.test(t)) return 'npc';
  switch (archetype) {
    case 'humanoid':
      return ['skeleton', 'zombie', 'golem'].includes(variant ?? '') ? 'enemy' : variant === 'villager' ? 'npc' : 'character';
    case 'dragon':
    case 'slime':
    case 'critter':
      return 'monster';
    case 'quadruped':
    case 'bird':
      return 'animal';
    case 'weapon':
      return 'weapon';
    case 'item':
      return variant === 'helmet' || variant === 'armor' ? 'armor' : 'item';
    case 'potion':
    case 'chest':
      return 'item';
    case 'house':
    case 'tower':
    case 'castle':
    case 'structure':
      return 'building';
    case 'furniture':
      return 'furniture';
    default:
      return 'environment';
  }
}
