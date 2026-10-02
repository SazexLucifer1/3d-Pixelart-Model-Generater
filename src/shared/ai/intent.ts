import type { AssetCategory } from '../library/gameProject';
import { categoryFor } from '../library/gameProject';
import { analyzePrompt } from './interpreter/RuleBasedInterpreter';

/**
 * Absichtserkennung für den universellen Asset-Generator:
 *  - Welches Ausgabeformat? (2D-Sprite, 3D-Voxel, Tileset, Effekt, UI)
 *  - Welche Kategorie? (Charakter, Gegner, Waffe, Gebäude …)
 *  - Ist es eine Animationsanfrage für einen BESTEHENDEN Charakter?
 *    („Erstelle eine Angriff Animation für diesen Charakter“)
 */

export type OutputKind = 'sprite' | 'voxel' | 'tileset' | 'effect' | 'ui';

export interface AssetIntent {
  output: OutputKind;
  category: AssetCategory;
  /** Gefundene Animationswünsche (IDs der Pose-Bibliothek). */
  animations: string[];
  /** Animation für vorhandenes Asset statt neues Asset. */
  animationRequest: null | { target: 'current' | 'named'; name?: string };
  notes: string[];
}

const norm = (t: string) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

export const ANIMATION_WORDS: [RegExp, string][] = [
  [/idle|stehen|atmen|ruhe|warte/, 'idle'],
  [/lauf(?!en\b.*renn)|geh|walk/, 'walk'],
  [/renn|sprint|run/, 'run'],
  [/schleich|sneak|duck/, 'sneak'],
  [/spring|sprung|jump/, 'jump'],
  [/angriff|attack|schlag|hieb|schiess|stich|kampf(?!f)/, 'attack'],
  [/block|parier|abwehr/, 'block'],
  [/ausweich|dodge|rolle|roll/, 'dodge'],
  [/zauber(n|t|anim)|cast|magie wirk|spell/, 'cast'],
  [/schaden|treffer|hurt|getroffen|\bhit\b/, 'hurt'],
  [/tod|sterb|death|\bdie\b|stirbt/, 'death'],
  [/sieg|victory|jubel|triumph/, 'victory'],
  [/interakt|benutz|interact|aufheb|oeffn|use/, 'interact'],
  [/flieg|flug|fly|flatter/, 'fly'],
];

export function detectAnimations(prompt: string): string[] {
  const t = norm(prompt);
  if (/alle animationen|all animations|komplett/.test(t)) return ['idle', 'walk', 'run', 'sneak', 'jump', 'attack', 'block', 'dodge', 'cast', 'hurt', 'death', 'victory', 'interact'];
  const out: string[] = [];
  for (const [re, id] of ANIMATION_WORDS) if (re.test(t) && !out.includes(id)) out.push(id);
  return out;
}

export function classifyPrompt(prompt: string, preferred: OutputKind | 'auto', mode: '2d' | '3d'): AssetIntent {
  const t = norm(prompt);
  const notes: string[] = [];
  const animations = detectAnimations(prompt);
  // Animation für bestehenden Charakter?
  let animationRequest: AssetIntent['animationRequest'] = null;
  if (/animation|animier|animiere|bewegungsablauf/.test(t) && animations.length) {
    const own = t.match(/(?:fuer|for)\s+(?:diesen|dieser|dieses|den|die|das|meinen|meine|mein|unseren|this|my|the)\s+([a-z-]+)/);
    if (/diesen|dieser|dieses|aktuell|this|current|ihn\b|sie\b/.test(t) || !own) animationRequest = { target: 'current' };
    else animationRequest = { target: 'named', name: own[1] };
    notes.push(`Animationsanfrage: ${animations.join(', ')}${animationRequest.target === 'named' ? ` für „${animationRequest.name}“` : ' für das aktuelle Asset'}`);
  }

  let output: OutputKind = mode === '3d' ? 'voxel' : 'sprite';
  if (/\b(3d|voxel|magicavoxel)\b|3d-modell|3d modell/.test(t)) output = 'voxel';
  if (/\b(2d|sprite|sprites|spritesheet|sprite sheet|pixel ?art)\b/.test(t)) output = 'sprite';
  if (/tileset|\btiles?\b|kachel|bodenfliese|karte\b|karten|\bmap\b|gebiet|gelaende|terrain|biom/.test(t)) output = 'tileset';
  if (/effekt|effect|partikel|particle|\bspell\b|feuerball|fireball|explosion|[a-z]+zauber\b|zauberspruch|\baura\b|blitzschlag|heilzauber/.test(t)) output = 'effect';
  if (/\b(ui|hud|gui)\b|interface|button|knopf|menue|\bmenu|inventar|inventory|lebensleiste|healthbar|health bar|icon-?set|benutzeroberfl|dialogbox|textbox/.test(t)) output = 'ui';
  if (preferred !== 'auto') output = preferred;
  if (animationRequest && output !== 'voxel') output = 'sprite';

  let category: AssetCategory;
  if (output === 'tileset') category = 'tile';
  else if (output === 'effect') category = 'effect';
  else if (output === 'ui') category = 'ui';
  else {
    const bp = analyzePrompt({ prompt, style: 'auto', size: 24, palette: 'style', detail: 2 });
    const main = bp.objects[0];
    category = categoryFor(main.archetype, main.variant, prompt);
  }
  notes.push(`Ausgabe: ${output} · Kategorie: ${category}`);
  return { output, category, animations, animationRequest, notes };
}
