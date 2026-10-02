import type { ArchetypeId } from '../types';
import type { StyleId } from '../../palette/styles';
import { NAMED_COLORS as C } from '../../palette/color';

/**
 * Wortschatz der regelbasierten Prompt-Analyse (Deutsch + Englisch).
 *
 * Alle Wörter sind normalisiert: Kleinbuchstaben, Umlaute ersetzt
 * (ä→ae, ö→oe, ü→ue, ß→ss). Ein "Stamm" passt, wenn ein Token damit beginnt
 * (Flexionen: "grüner", "grünen") oder – bei längeren Stämmen – damit endet
 * (Komposita: "Holzhütte", "Lagerfeuer").
 */

export interface SubjectEntry {
  stems: string[];
  archetype: ArchetypeId;
  variant?: string;
  features?: string[];
  colors?: Record<string, string>;
  label: string;
  /** Relative Größe, falls abweichend (z.B. Zwerg). */
  scale?: number;
  /** Wird zu einem Ausrüstungsmerkmal, wenn eine Figur vorhanden ist. */
  equipment?: string;
  /** Erzeugt mehrere Instanzen (z.B. "Wald"). */
  count?: number;
}

export const SUBJECTS: SubjectEntry[] = [
  // ----------------------------------------------------------- Figuren
  { stems: ['ritter', 'knight', 'paladin'], archetype: 'humanoid', variant: 'knight', label: 'Ritter', features: ['sword', 'shield', 'armor'] },
  { stems: ['krieger', 'kaempfer', 'warrior', 'fighter', 'held', 'heldin', 'hero', 'soldat', 'soldier', 'gladiator', 'abenteurer', 'adventurer', 'schwertkaempfer', 'swordsman'], archetype: 'humanoid', variant: 'warrior', label: 'Krieger', features: ['armor'] },
  { stems: ['barbar', 'barbarian', 'wikinger', 'viking'], archetype: 'humanoid', variant: 'warrior', label: 'Barbar', features: ['axe', 'beard'], colors: { armor: '#8a5a34' } },
  { stems: ['zwerg', 'dwarf'], archetype: 'humanoid', variant: 'warrior', label: 'Zwerg', features: ['axe', 'beard', 'helmet', 'armor'], scale: 0.85, colors: { beard: '#c8662a' } },
  { stems: ['magier', 'zauberer', 'wizard', 'mage', 'sorcerer', 'hexer', 'warlock', 'druide', 'druid', 'schamane', 'shaman'], archetype: 'humanoid', variant: 'mage', label: 'Magier', features: ['staff', 'hat', 'robe', 'beard'] },
  { stems: ['hexe', 'witch'], archetype: 'humanoid', variant: 'mage', label: 'Hexe', features: ['hat', 'robe', 'long_hair', 'wand'], colors: { armor: '#3a2a4a', hat: '#2a1e34', hair: '#c8502a' } },
  { stems: ['nekromant', 'necromancer', 'lichkoenig', 'lichking'], archetype: 'humanoid', variant: 'skeleton', label: 'Nekromant', features: ['staff', 'robe', 'cape'], colors: { armor: '#2a2236', gem: '#60ff90' } },
  { stems: ['priester', 'priest', 'kleriker', 'cleric', 'heiler', 'healer', 'moench', 'monk'], archetype: 'humanoid', variant: 'mage', label: 'Priester', features: ['staff', 'robe'], colors: { armor: '#eae4d4', accent: C.gold } },
  { stems: ['bogenschuetz', 'archer', 'ranger', 'jaeger', 'hunter', 'waldlaeufer'], archetype: 'humanoid', variant: 'archer', label: 'Bogenschütze', features: ['bow', 'cape'], colors: { armor: '#3e6a32', cape: '#2e4a2a' } },
  { stems: ['elf', 'elfe', 'elfin', 'elves'], archetype: 'humanoid', variant: 'archer', label: 'Elf', features: ['bow', 'elf_ears', 'long_hair'], colors: { armor: '#4a8a3a', hair: '#f0dc8a' } },
  { stems: ['dieb', 'schurke', 'rogue', 'thief', 'assassin', 'meuchler'], archetype: 'humanoid', variant: 'rogue', label: 'Schurke', features: ['sword', 'cape'], colors: { armor: '#3a3440', cape: '#2a2430' } },
  { stems: ['ninja', 'samurai'], archetype: 'humanoid', variant: 'rogue', label: 'Ninja', features: ['sword'], colors: { armor: '#24222b', cloth: '#24222b', hair: '#24222b' } },
  { stems: ['pirat', 'pirate'], archetype: 'humanoid', variant: 'rogue', label: 'Pirat', features: ['sword', 'hat', 'beard'], colors: { armor: '#a8323a', hat: '#24222b' } },
  { stems: ['koenigin', 'queen', 'prinzessin', 'princess'], archetype: 'humanoid', variant: 'king', label: 'Königin', features: ['crown', 'robe', 'long_hair'], colors: { armor: '#e86fa8', hair: '#f0d070' } },
  { stems: ['koenig', 'king', 'kaiser', 'emperor', 'prinz', 'prince', 'herrscher'], archetype: 'humanoid', variant: 'king', label: 'König', features: ['crown', 'cape', 'beard'], colors: { armor: '#7c3fae', cape: '#c8323c' } },
  { stems: ['engel', 'angel'], archetype: 'humanoid', variant: 'villager', label: 'Engel', features: ['wings', 'robe', 'long_hair'], colors: { armor: '#f4f0ea', hair: '#f2d070' } },
  { stems: ['daemon', 'demon', 'teufel', 'devil', 'imp'], archetype: 'humanoid', variant: 'warrior', label: 'Dämon', features: ['horns', 'wings', 'tail'], colors: { skin: '#c8323c', armor: '#24222b', wings: '#3a2030' } },
  { stems: ['vampir', 'vampire', 'dracula'], archetype: 'humanoid', variant: 'villager', label: 'Vampir', features: ['cape'], colors: { skin: '#e8e0e8', armor: '#24222b', cape: '#8a1a2a', hair: '#24222b' } },
  { stems: ['skelett', 'skeleton', 'untot', 'undead', 'knochen'], archetype: 'humanoid', variant: 'skeleton', label: 'Skelett', features: ['sword'] },
  { stems: ['roboter', 'robot', 'android', 'cyborg', 'mech', 'droid', 'droide'], archetype: 'humanoid', variant: 'robot', label: 'Roboter' },
  { stems: ['astronaut', 'raumfahrer', 'spacemarine'], archetype: 'humanoid', variant: 'robot', label: 'Astronaut', colors: { armor: '#eceae4', eyes: '#f0b030' } },
  { stems: ['zombie'], archetype: 'humanoid', variant: 'zombie', label: 'Zombie', colors: { armor: '#5a6a7a' } },
  { stems: ['ork', 'orc', 'oger', 'ogre', 'troll'], archetype: 'humanoid', variant: 'zombie', label: 'Ork', features: ['axe', 'armor'], colors: { armor: '#6a4a2a' } },
  { stems: ['goblin', 'kobold'], archetype: 'humanoid', variant: 'zombie', label: 'Goblin', features: ['elf_ears', 'wand'], scale: 0.75, colors: { armor: '#6a5a3a' } },
  { stems: ['bauer', 'farmer', 'dorfbewohner', 'villager', 'haendler', 'merchant', 'schmied', 'blacksmith', 'koch', 'person', 'mensch', 'mann', 'frau', 'junge', 'maedchen', 'character', 'charakter', 'figur', 'npc', 'man', 'woman', 'boy', 'girl'], archetype: 'humanoid', variant: 'villager', label: 'Figur', colors: { armor: '#5a7aa8' } },

  // ----------------------------------------------------------- Kreaturen
  { stems: ['drache', 'drachen', 'dragon', 'wyvern', 'lindwurm'], archetype: 'dragon', label: 'Drache' },
  { stems: ['katze', 'kater', 'cat', 'kitten', 'kaetzchen'], archetype: 'quadruped', variant: 'cat', label: 'Katze' },
  { stems: ['hund', 'dog', 'welpe', 'puppy'], archetype: 'quadruped', variant: 'dog', label: 'Hund' },
  { stems: ['wolf', 'werwolf', 'woelfe', 'wolves'], archetype: 'quadruped', variant: 'wolf', label: 'Wolf' },
  { stems: ['fuchs', 'fox'], archetype: 'quadruped', variant: 'fox', label: 'Fuchs' },
  { stems: ['einhorn', 'unicorn'], archetype: 'quadruped', variant: 'unicorn', label: 'Einhorn' },
  { stems: ['pferd', 'horse', 'pony', 'ross'], archetype: 'quadruped', variant: 'horse', label: 'Pferd' },
  { stems: ['schwein', 'pig', 'ferkel', 'piglet'], archetype: 'quadruped', variant: 'pig', label: 'Schwein' },
  { stems: ['kuh', 'cow', 'rind', 'stier', 'bull'], archetype: 'quadruped', variant: 'cow', label: 'Kuh' },
  { stems: ['baer', 'bear'], archetype: 'quadruped', variant: 'bear', label: 'Bär' },
  { stems: ['hase', 'kaninchen', 'rabbit', 'bunny', 'haeschen'], archetype: 'quadruped', variant: 'rabbit', label: 'Hase' },
  { stems: ['schaf', 'sheep', 'lamm', 'lamb'], archetype: 'quadruped', variant: 'sheep', label: 'Schaf' },
  { stems: ['hirsch', 'reh', 'deer', 'elch', 'moose'], archetype: 'quadruped', variant: 'deer', label: 'Hirsch' },
  { stems: ['loewe', 'lion', 'tiger'], archetype: 'quadruped', variant: 'lion', label: 'Löwe' },
  { stems: ['phoenix', 'phoenix', 'feuervogel', 'firebird'], archetype: 'bird', variant: 'phoenix', label: 'Phönix' },
  { stems: ['eule', 'owl'], archetype: 'bird', variant: 'owl', label: 'Eule' },
  { stems: ['huhn', 'chicken', 'henne', 'hahn', 'kueken', 'chick'], archetype: 'bird', variant: 'chicken', label: 'Huhn' },
  { stems: ['vogel', 'bird', 'papagei', 'parrot', 'adler', 'eagle', 'rabe', 'raven', 'kraehe', 'taube', 'dove', 'pigeon'], archetype: 'bird', variant: 'bird', label: 'Vogel' },
  { stems: ['schleim', 'slime', 'glibber', 'blob', 'gelee', 'jelly', 'monster', 'kreatur', 'creature', 'wesen'], archetype: 'slime', label: 'Schleim' },

  // ----------------------------------------------------------- Gebäude
  { stems: ['burg', 'ritterburg', 'sandburg', 'schloss', 'castle', 'festung', 'fortress', 'palast', 'palace', 'zitadelle', 'citadel'], archetype: 'castle', label: 'Burg' },
  { stems: ['magierturm', 'zauberturm'], archetype: 'tower', variant: 'wizard', label: 'Magierturm' },
  { stems: ['turm', 'tower', 'leuchtturm', 'lighthouse', 'wachturm'], archetype: 'tower', label: 'Turm' },
  { stems: ['steinhaus'], archetype: 'house', variant: 'stone', label: 'Steinhaus' },
  { stems: ['fachwerk', 'cottage', 'taverne', 'tavern', 'gasthaus', 'inn', 'laden', 'shop', 'bauernhaus', 'farmhouse'], archetype: 'house', variant: 'cottage', label: 'Haus' },
  { stems: ['huette', 'cabin', 'blockhaus', 'holzhaus', 'shack', 'schuppen', 'shed'], archetype: 'house', variant: 'hut', label: 'Hütte' },
  { stems: ['haus', 'baumhaus', 'hexenhaus', 'lebkuchenhaus', 'house', 'home', 'haeuschen', 'gebaeude', 'building', 'heim'], archetype: 'house', variant: 'cottage', label: 'Haus' },

  // ----------------------------------------------------------- Natur
  { stems: ['wald', 'forest', 'woods', 'hain', 'grove'], archetype: 'tree', variant: 'oak', label: 'Wald', count: 4 },
  { stems: ['tanne', 'fichte', 'kiefer', 'pine', 'nadelbaum', 'weihnachtsbaum', 'fir', 'spruce'], archetype: 'tree', variant: 'pine', label: 'Tanne' },
  { stems: ['birke', 'birch'], archetype: 'tree', variant: 'birch', label: 'Birke' },
  { stems: ['kirschbaum', 'kirschbluete', 'sakura', 'cherry'], archetype: 'tree', variant: 'cherry', label: 'Kirschbaum' },
  { stems: ['totbaum', 'deadtree'], archetype: 'tree', variant: 'dead', label: 'Toter Baum' },
  { stems: ['herbstbaum', 'autumntree'], archetype: 'tree', variant: 'autumn', label: 'Herbstbaum' },
  { stems: ['zauberbaum', 'magietree'], archetype: 'tree', variant: 'magic', label: 'Zauberbaum', features: ['glow'] },
  { stems: ['apfelbaum', 'appletree'], archetype: 'tree', variant: 'oak', label: 'Apfelbaum', features: ['fruit'] },
  { stems: ['palme', 'palm'], archetype: 'tree', variant: 'palm', label: 'Palme' },
  { stems: ['eiche', 'oak', 'baum', 'tree', 'baeume', 'trees'], archetype: 'tree', variant: 'oak', label: 'Baum' },
  { stems: ['lagerfeuer', 'campfire', 'feuerstelle', 'bonfire', 'feuer', 'fire'], archetype: 'campfire', label: 'Lagerfeuer' },
  { stems: ['fliegenpilz', 'pilz', 'mushroom', 'toadstool', 'pilzhaus'], archetype: 'mushroom', label: 'Pilz' },
  { stems: ['kristall', 'crystal', 'edelstein', 'gem', 'juwel', 'jewel'], archetype: 'crystal', label: 'Kristall' },
  { stems: ['fels', 'felsen', 'rock', 'boulder', 'brocken', 'stein'], archetype: 'rock', label: 'Felsen' },

  // ----------------------------------------------------------- Gegenstände
  { stems: ['schatztruhe', 'truhe', 'chest', 'schatz', 'treasure', 'kiste'], archetype: 'chest', label: 'Truhe' },
  { stems: ['trank', 'potion', 'elixier', 'elixir', 'flasche', 'bottle', 'heiltrank'], archetype: 'potion', label: 'Trank' },
  { stems: ['raumschiff', 'spaceship', 'starship', 'ufo', 'rakete', 'rocket', 'raumjaeger', 'starfighter', 'shuttle'], archetype: 'spaceship', label: 'Raumschiff' },
  { stems: ['schwert', 'sword', 'klinge', 'blade', 'saebel', 'katana', 'dolch', 'dagger'], archetype: 'weapon', variant: 'sword', label: 'Schwert', equipment: 'sword' },
  { stems: ['axt', 'axe', 'beil', 'streitaxt'], archetype: 'weapon', variant: 'axe', label: 'Axt', equipment: 'axe' },
  { stems: ['kampfstab', 'staff', 'zepter', 'scepter'], archetype: 'weapon', variant: 'staff', label: 'Stab', equipment: 'staff' },
  { stems: ['schild', 'shield'], archetype: 'weapon', variant: 'shield', label: 'Schild', equipment: 'shield' },
  { stems: ['bogen', 'bow'], archetype: 'weapon', variant: 'bow', label: 'Bogen', equipment: 'bow' },
  { stems: ['hammer', 'kriegshammer', 'warhammer'], archetype: 'weapon', variant: 'hammer', label: 'Hammer', equipment: 'hammer' },
  { stems: ['speer', 'lanze', 'spear', 'lance'], archetype: 'weapon', variant: 'sword', label: 'Speer', equipment: 'spear' },
  { stems: ['zauberstab', 'wand'], archetype: 'weapon', variant: 'staff', label: 'Zauberstab', equipment: 'wand' },
];

/** Merkmale/Details (gehören zum nächstgelegenen Objekt davor). */
export const FEATURES: { stems: string[]; feature: string }[] = [
  { stems: ['umhang', 'cape', 'mantel', 'cloak', 'umhaengen'], feature: 'cape' },
  { stems: ['helm', 'helmet'], feature: 'helmet' },
  { stems: ['krone', 'crown', 'diadem', 'tiara'], feature: 'crown' },
  { stems: ['bart', 'beard', 'baertig', 'bearded'], feature: 'beard' },
  { stems: ['hoerner', 'horn', 'horns', 'gehoernt', 'horned'], feature: 'horns' },
  { stems: ['fluegel', 'wings', 'wing', 'gefluegelt', 'winged'], feature: 'wings' },
  { stems: ['schwanz', 'tail', 'schweif'], feature: 'tail' },
  { stems: ['ruestung', 'armor', 'armour', 'panzer', 'gepanzert', 'armored', 'plattenruestung'], feature: 'armor' },
  { stems: ['robe', 'gewand', 'kutte', 'kleid', 'dress', 'tunika'], feature: 'robe' },
  { stems: ['spitzohr', 'elfenohren'], feature: 'elf_ears' },
  { stems: ['moos', 'moss', 'bemoost', 'mossy', 'bewachsen', 'overgrown'], feature: 'moss' },
  { stems: ['schnee', 'snow', 'verschneit', 'snowy', 'winter', 'frost'], feature: 'snow' },
  { stems: ['schornstein', 'kamin', 'chimney', 'schlot'], feature: 'chimney' },
  { stems: ['rauch', 'smoke', 'qualm'], feature: 'smoke' },
  { stems: ['laterne', 'lantern', 'lampe', 'lamp', 'fackel', 'torch'], feature: 'lantern' },
  { stems: ['leucht', 'glow', 'glowing', 'magisch', 'magic', 'magical', 'verzaubert', 'enchanted', 'glimm'], feature: 'glow' },
  { stems: ['feuerdrach', 'feuerspeiend', 'feueratem', 'firebreathing', 'speit', 'spuckt', 'breathing'], feature: 'fire' },
  { stems: ['offen', 'open', 'geoeffnet'], feature: 'open' },
  { stems: ['gold', 'muenzen', 'coins', 'reichtum'], feature: 'gold' },
  { stems: ['flagge', 'fahne', 'banner', 'flag', 'wimpel'], feature: 'flag' },
  { stems: ['fruechte', 'fruit', 'aepfel', 'apples', 'aepfeln', 'obst'], feature: 'fruit' },
  { stems: ['tuer', 'door', 'eingang'], feature: 'door' },
  { stems: ['flammen', 'flames', 'brennend', 'burning'], feature: 'fire' },
  { stems: ['ausgebreitet', 'spread', 'fliegend', 'flying'], feature: 'wings_spread' },
  { stems: ['glatze', 'bald', 'kahl'], feature: 'bald' },
];

/** Englisch/Deutsch-Doppeldeutigkeiten: abhängig von der erkannten Sprache. */
export const AMBIGUOUS: Record<string, { de: { feature?: string; slot?: string }; en: { subject?: string; feature?: string; slot?: string } }> = {
  hut: { de: { feature: 'hat', slot: 'hat' }, en: { subject: 'huette' } },
  wand: { de: { slot: 'walls' }, en: { subject: 'zauberstab' } },
};

/** Farbwörter. */
export const COLORS: { stems: string[]; color: string }[] = [
  { stems: ['dunkelrot', 'crimson', 'blutrot', 'bordeaux', 'karmesin'], color: C.darkred },
  { stems: ['rot', 'red', 'scharlach', 'scarlet'], color: C.red },
  { stems: ['dunkelgruen', 'tannengruen', 'smaragd', 'emerald'], color: C.darkgreen },
  { stems: ['hellgruen', 'lime', 'limette'], color: C.lime },
  { stems: ['gruen', 'green', 'oliv', 'olive'], color: C.green },
  { stems: ['dunkelblau', 'navy', 'marine', 'nachtblau'], color: C.darkblue },
  { stems: ['hellblau', 'lightblue', 'himmelblau', 'eisblau', 'azur', 'azure'], color: '#7ab8f0' },
  { stems: ['blau', 'blue', 'saphir', 'sapphire', 'kobalt', 'cobalt'], color: C.blue },
  { stems: ['tuerkis', 'turquoise', 'teal', 'cyan', 'aqua', 'petrol'], color: C.teal },
  { stems: ['gelb', 'yellow', 'zitronen'], color: C.yellow },
  { stems: ['orange', 'orangen', 'kupfer', 'copper'], color: C.orange },
  { stems: ['lila', 'violett', 'violet', 'purple', 'purpur', 'magenta', 'flieder', 'lavendel', 'lavender', 'amethyst'], color: C.purple },
  { stems: ['rosa', 'pink', 'pinke', 'rosig'], color: C.pink },
  { stems: ['dunkelbraun', 'schokolade', 'chocolate'], color: C.darkbrown },
  { stems: ['braun', 'brown', 'holz', 'wooden'], color: C.brown },
  { stems: ['beige', 'creme', 'cream', 'sand'], color: C.beige },
  { stems: ['schwarz', 'black', 'obsidian', 'ebenholz', 'onyx'], color: C.black },
  { stems: ['weiss', 'white', 'schneeweiss', 'elfenbein', 'ivory'], color: C.white },
  { stems: ['dunkelgrau', 'anthrazit', 'charcoal'], color: C.darkgray },
  { stems: ['grau', 'gray', 'grey', 'aschgrau'], color: C.gray },
  { stems: ['golden', 'goldene', 'goldenen', 'goldener', 'goldenes', 'gold'], color: C.gold },
  { stems: ['silber', 'silver', 'silbern', 'stahl', 'steel', 'eisen', 'iron', 'chrom', 'chrome'], color: C.silver },
  { stems: ['bronze', 'messing', 'brass'], color: C.bronze },
];

/** Hilfswörter für Hell/Dunkel. */
export const DARK_WORDS = ['dunkel', 'dark', 'deep', 'tief'];
export const LIGHT_WORDS = ['hell', 'light', 'pale', 'blass', 'pastell', 'pastel'];

/** Farbslot-Nomen (Farbe → Teil eines Objekts). */
export const SLOTS: { stems: string[]; slot: string }[] = [
  { stems: ['ruestung', 'armor', 'armour', 'panzer', 'harnisch', 'brustpanzer'], slot: 'armor' },
  { stems: ['umhang', 'cape', 'mantel', 'cloak'], slot: 'cape' },
  { stems: ['haar', 'haare', 'hair', 'frisur', 'locken', 'zopf'], slot: 'hair' },
  { stems: ['haut', 'skin', 'teint'], slot: 'skin' },
  { stems: ['augen', 'auge', 'eyes', 'eye', 'blick'], slot: 'eyes' },
  { stems: ['hose', 'hosen', 'pants', 'trousers', 'kleidung', 'clothes', 'clothing', 'tunika'], slot: 'cloth' },
  { stems: ['robe', 'gewand', 'kutte', 'kleid', 'dress'], slot: 'armor' },
  { stems: ['stiefel', 'boots', 'schuhe', 'shoes'], slot: 'boots' },
  { stems: ['hat', 'muetze', 'kapuze', 'hood'], slot: 'hat' },
  { stems: ['schwert', 'klinge', 'blade', 'sword'], slot: 'metal' },
  { stems: ['schild', 'shield'], slot: 'shield' },
  { stems: ['dach', 'roof', 'daecher', 'roofs'], slot: 'roof' },
  { stems: ['waende', 'walls', 'wall', 'mauer', 'mauern', 'fassade'], slot: 'walls' },
  { stems: ['tuer', 'door'], slot: 'door' },
  { stems: ['fenster', 'window', 'windows'], slot: 'window' },
  { stems: ['fluegel', 'wings', 'wing', 'schwingen'], slot: 'wings' },
  { stems: ['bauch', 'belly', 'unterseite'], slot: 'belly' },
  { stems: ['schuppen', 'scales', 'koerper', 'body', 'fell', 'fur', 'gefieder', 'feathers', 'federn'], slot: 'body' },
  { stems: ['hoerner', 'horns', 'horn'], slot: 'horn' },
  { stems: ['blaetter', 'leaves', 'laub', 'blaettern', 'foliage', 'baumkrone'], slot: 'leaves' },
  { stems: ['stamm', 'trunk', 'rinde', 'bark'], slot: 'trunk' },
  { stems: ['edelstein', 'gem', 'juwel', 'kristall', 'crystal', 'stein'], slot: 'gem' },
  { stems: ['huelle', 'hull', 'rumpf'], slot: 'hull' },
  { stems: ['fluessigkeit', 'liquid', 'inhalt'], slot: 'liquid' },
  { stems: ['flagge', 'fahne', 'banner', 'flag'], slot: 'flag' },
  { stems: ['bart', 'beard'], slot: 'beard' },
  { stems: ['moos', 'moss'], slot: 'moss' },
  { stems: ['stacheln', 'spikes', 'zacken'], slot: 'spikes' },
  { stems: ['maehne', 'mane'], slot: 'accent' },
];

/** Primärer Farbslot je Archetyp ("roter Drache" → body). */
export const PRIMARY_SLOT: Record<ArchetypeId, string> = {
  humanoid: 'armor', dragon: 'body', quadruped: 'body', bird: 'body', slime: 'body',
  house: 'walls', tower: 'roof', castle: 'walls', tree: 'leaves', campfire: 'none', chest: 'wood',
  mushroom: 'cap', spaceship: 'hull', crystal: 'crystal', rock: 'stone', weapon: 'metal', potion: 'liquid', custom: 'none',
};

/** Slot-Umbenennung je Archetyp (z.B. "Hut" beim Pilz = Pilzkappe). */
export const SLOT_ALIASES: Partial<Record<ArchetypeId, Record<string, string>>> = {
  mushroom: { hat: 'cap', body: 'stem' },
  crystal: { gem: 'crystal', body: 'crystal' },
  tree: { body: 'leaves' },
  weapon: { gem: 'gem', body: 'metal' },
  chest: { body: 'wood' },
  slime: { skin: 'body' },
};

export const STYLE_HINTS: { stems: string[]; style: StyleId }[] = [
  { stems: ['gameboy', 'gb', 'handheld', 'monochrom'], style: 'gameboy' },
  { stems: ['scifi', 'science', 'futurist', 'cyber', 'weltraum', 'space', 'neon', 'galakt', 'galactic', 'laser'], style: 'scifi' },
  { stems: ['mittelalter', 'medieval', 'mittelalterlich', 'ritterzeit'], style: 'medieval' },
  { stems: ['duester', 'finster', 'gothic', 'grimdark', 'horror', 'unheimlich', 'creepy', 'boese', 'evil', 'verflucht', 'cursed', 'darkfantasy'], style: 'dark' },
  { stems: ['cute', 'niedlich', 'suess', 'kawaii', 'chibi', 'knuffig', 'putzig', 'adorable'], style: 'cute' },
  { stems: ['jrpg', 'rpg', 'fantasy', 'snes', '16bit', 'abenteuer'], style: 'fantasy' },
];

export const SMALL_WORDS = ['klein', 'small', 'little', 'tiny', 'winzig', 'mini', 'kleines'];
export const BIG_WORDS = ['gross', 'big', 'large', 'huge', 'riesig', 'gigant', 'giant', 'enorm', 'maechtig', 'mighty'];
export const NIGHT_WORDS = ['nacht', 'night', 'abend', 'evening', 'mondlicht', 'moonlight', 'nachts', 'dunkelheit'];
export const PLACEMENT_WORDS: { stems: string[]; placement: 'left' | 'right' | 'front' | 'back' }[] = [
  { stems: ['links', 'left', 'linken'], placement: 'left' },
  { stems: ['rechts', 'right', 'rechten'], placement: 'right' },
  { stems: ['vor', 'davor', 'front', 'vorne'], placement: 'front' },
  { stems: ['hinter', 'dahinter', 'behind', 'hinten'], placement: 'back' },
];
export const BASE_WORDS: { stems: string[]; base: 'grass' | 'stone' | 'sand' | 'snow' | 'dirt' }[] = [
  { stems: ['wiese', 'gras', 'grass', 'meadow', 'rasen', 'lichtung', 'clearing', 'insel', 'island', 'diorama', 'szene', 'scene', 'sockel', 'plattform', 'platform', 'tile'], base: 'grass' },
  { stems: ['wueste', 'desert', 'strand', 'beach', 'sandig'], base: 'sand' },
  { stems: ['steinboden', 'pflaster', 'cobble', 'kopfstein', 'hoehle', 'cave'], base: 'stone' },
];
export const NUMBER_WORDS: Record<string, number> = {
  zwei: 2, two: 2, drei: 3, three: 3, vier: 4, four: 4, paar: 2, couple: 2, einige: 3, several: 3, some: 2, mehrere: 3,
  '2': 2, '3': 3, '4': 4,
};
/** Typische deutsche Funktionswörter zur Spracherkennung. */
export const GERMAN_MARKERS = ['ein', 'eine', 'einem', 'einen', 'einer', 'mit', 'und', 'der', 'die', 'das', 'im', 'auf', 'dem', 'den', 'kleine', 'kleiner', 'grosse', 'neben', 'aus', 'von', 'stil'];
