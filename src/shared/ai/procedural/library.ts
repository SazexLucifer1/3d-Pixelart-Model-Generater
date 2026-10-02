import type { ArchetypeId } from '../types';
import type { ObjectBuilder } from './context';
import { buildHumanoid } from './builders/humanoid';
import { buildDragon, buildQuadruped, buildBird, buildSlime } from './builders/creatures';
import { buildHouse, buildTower, buildCastle } from './builders/buildings';
import { buildTree, buildRock, buildCrystal, buildMushroom, buildCampfire } from './builders/nature';
import { buildChest, buildWeapon, buildPotion, buildSpaceship, buildCustom } from './builders/items';
import { buildItem, buildFurniture, buildStructure, buildTerrain, buildCritter } from './builders/props';

/**
 * Die Objektbibliothek: Archetyp → Builder.
 *
 * Neue Objekttypen hinzufügen:
 *  1. Builder-Funktion in `builders/` schreiben (siehe BuildContext)
 *  2. Hier registrieren
 *  3. Schlüsselwörter in `interpreter/lexicon.ts` ergänzen
 */
export interface LibraryEntry {
  id: ArchetypeId;
  name: string;
  build: ObjectBuilder;
  /** Varianten (für UI/LLM-Schema). */
  variants?: string[];
  /** Typische Merkmale (für UI/LLM-Schema). */
  features?: string[];
  /** Größenfaktor, wenn das Objekt als Nebenobjekt auftaucht. */
  secondaryScale: number;
}

export const OBJECT_LIBRARY: Record<ArchetypeId, LibraryEntry> = {
  humanoid: {
    id: 'humanoid', name: 'Figur', build: buildHumanoid, secondaryScale: 0.9,
    variants: ['warrior', 'knight', 'mage', 'archer', 'rogue', 'king', 'villager', 'skeleton', 'robot', 'zombie', 'golem'],
    features: ['sword', 'axe', 'hammer', 'spear', 'staff', 'wand', 'bow', 'shield', 'cape', 'helmet', 'hat', 'crown', 'beard', 'horns', 'wings', 'tail', 'elf_ears', 'robe', 'armor', 'long_hair'],
  },
  dragon: { id: 'dragon', name: 'Drache', build: buildDragon, secondaryScale: 0.8, features: ['fire', 'no_wings'] },
  quadruped: {
    id: 'quadruped', name: 'Tier', build: buildQuadruped, secondaryScale: 0.5,
    variants: ['cat', 'dog', 'wolf', 'fox', 'horse', 'unicorn', 'pig', 'cow', 'bear', 'rabbit', 'sheep', 'deer', 'lion'],
  },
  bird: { id: 'bird', name: 'Vogel', build: buildBird, secondaryScale: 0.4, variants: ['bird', 'owl', 'chicken', 'phoenix'], features: ['wings_spread'] },
  slime: { id: 'slime', name: 'Schleim', build: buildSlime, secondaryScale: 0.45, features: ['crown', 'glass'] },
  house: { id: 'house', name: 'Haus', build: buildHouse, secondaryScale: 0.8, variants: ['hut', 'cottage', 'stone'], features: ['moss', 'snow', 'chimney', 'smoke', 'lantern', 'glow', 'ruined'] },
  tower: { id: 'tower', name: 'Turm', build: buildTower, secondaryScale: 0.9, variants: ['tower', 'wizard'], features: ['moss', 'snow', 'flag', 'ruined'] },
  castle: { id: 'castle', name: 'Burg', build: buildCastle, secondaryScale: 0.9, features: ['moss', 'snow', 'ruined'] },
  tree: { id: 'tree', name: 'Baum', build: buildTree, secondaryScale: 0.85, variants: ['oak', 'pine', 'birch', 'autumn', 'cherry', 'dead', 'palm', 'magic', 'bush'], features: ['fruit', 'snow'] },
  campfire: { id: 'campfire', name: 'Lagerfeuer', build: buildCampfire, secondaryScale: 0.5 },
  chest: { id: 'chest', name: 'Truhe', build: buildChest, secondaryScale: 0.35, features: ['open', 'gold'] },
  mushroom: { id: 'mushroom', name: 'Pilz', build: buildMushroom, secondaryScale: 0.4, variants: ['mushroom', 'house'], features: ['glow', 'door'] },
  spaceship: { id: 'spaceship', name: 'Raumschiff', build: buildSpaceship, secondaryScale: 0.8 },
  crystal: { id: 'crystal', name: 'Kristall', build: buildCrystal, secondaryScale: 0.45 },
  rock: { id: 'rock', name: 'Felsen', build: buildRock, secondaryScale: 0.35, features: ['moss'] },
  weapon: { id: 'weapon', name: 'Waffe', build: buildWeapon, secondaryScale: 0.6, variants: ['sword', 'axe', 'staff', 'shield', 'bow', 'hammer'], features: ['glow'] },
  potion: { id: 'potion', name: 'Trank', build: buildPotion, secondaryScale: 0.3 },
  item: { id: 'item', name: 'Gegenstand', build: buildItem, secondaryScale: 0.35, variants: ['helmet', 'armor', 'pickaxe', 'shovel', 'key', 'scroll', 'book', 'coin', 'ring', 'bag', 'gem'], features: ['glow', 'horns', 'plume'] },
  furniture: { id: 'furniture', name: 'Möbel & Deko', build: buildFurniture, secondaryScale: 0.4, variants: ['barrel', 'crate', 'table', 'chair', 'bed', 'torch', 'door', 'fence', 'bookshelf', 'sign', 'anvil'] },
  structure: { id: 'structure', name: 'Bauwerk', build: buildStructure, secondaryScale: 0.7, variants: ['well', 'bridge', 'windmill', 'tent', 'ruins'], features: ['water'] },
  terrain: { id: 'terrain', name: 'Landschaft', build: buildTerrain, secondaryScale: 0.8, variants: ['mountain', 'cave', 'pond', 'hill'], features: ['moss'] },
  critter: { id: 'critter', name: 'Kleintier/Monster', build: buildCritter, secondaryScale: 0.4, variants: ['bat', 'spider'] },
  custom: { id: 'custom', name: 'Freie Form', build: buildCustom, secondaryScale: 1 },
};

export const ARCHETYPE_IDS = Object.keys(OBJECT_LIBRARY) as ArchetypeId[];
