import type { ArchetypeId, GenerationRequest, ObjectSpec, PromptInterpreter, SceneBlueprint } from '../types';
import type { StyleId } from '../../palette/styles';
import { STYLE_PRESETS } from '../../palette/styles';
import { shade } from '../../palette/color';
import { OBJECT_LIBRARY } from '../procedural/library';
import {
  SUBJECTS, FEATURES, COLORS, SLOTS, AMBIGUOUS, PRIMARY_SLOT, SLOT_ALIASES, STYLE_HINTS,
  SMALL_WORDS, BIG_WORDS, NIGHT_WORDS, PLACEMENT_WORDS, BASE_WORDS, NUMBER_WORDS, GERMAN_MARKERS,
  DARK_WORDS, LIGHT_WORDS, type SubjectEntry,
} from './lexicon';

/**
 * Regelbasierte Prompt-Analyse – funktioniert komplett offline.
 *
 * Erkennt in deutschen und englischen Beschreibungen:
 *  - Objekte (Archetyp + Variante), auch mehrere ("Hütte mit Lagerfeuer")
 *  - Ausrüstung & Merkmale ("Schwert", "Umhang", "Moos auf dem Dach")
 *  - Farben inkl. Zuordnung zu Teilen ("grüne Rüstung", "roter Drache")
 *  - Größenangaben, Anzahl, Platzierung, Stil, Tageszeit, Untergrund
 *
 * Das Ergebnis ist ein SceneBlueprint – exakt dasselbe Format, das auch ein
 * LLM liefert. Dadurch sind beide Interpreter austauschbar.
 */
export class RuleBasedInterpreter implements PromptInterpreter {
  readonly id = 'rules';
  readonly name = 'Regelbasierte Analyse';

  async interpret(request: GenerationRequest): Promise<SceneBlueprint> {
    return analyzePrompt(request);
  }
}

// ----------------------------------------------------------------- Tokenizer

/** Mehrwort-Ausdrücke, die vor der Tokenisierung zusammengefasst werden. */
const PHRASES: [RegExp, string][] = [
  [/\b(wizard|mage|magic|sorcerer)'?s? tower\b/g, 'magierturm'],
  [/\b(toter|toten|kahler|kahlen) baum\b|\bdead tree\b/g, 'totbaum'],
  [/\bherbstlicher baum\b|\bautumn tree\b/g, 'herbstbaum'],
  [/\bmagic tree\b|\bmagischer baum\b/g, 'zauberbaum'],
  [/\btreasure chest\b/g, 'schatztruhe'],
  [/\bchristmas tree\b/g, 'weihnachtsbaum'],
  [/\bcherry (blossom )?tree\b/g, 'kirschbaum'],
  [/\bapple tree\b/g, 'apfelbaum'],
  [/\bstone house\b/g, 'steinhaus'],
  [/\btree ?house\b/g, 'baumhaus'],
  [/\bpine tree\b/g, 'pine'],
  [/\bpalm tree\b/g, 'palm'],
  [/\blich king\b/g, 'lichking'],
];

export function normalize(text: string): string[] {
  let t = text
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  for (const [re, rep] of PHRASES) t = t.replace(re, rep);
  return t
    .replace(/sci-fi/g, 'scifi').replace(/game ?boy/g, 'gameboy').replace(/16-bit/g, '16bit').replace(/dark fantasy/g, 'darkfantasy')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
}

/** Erlaubte Flexionsendungen (Deutsch/Englisch). */
const SUFFIXES = new Set(['', 'e', 'er', 'en', 'es', 'em', 'n', 's', 'in', 'innen', 'ern', 'ns', 'ies', 'lich', 'liche', 'licher', 'lichen', 'ig', 'ige', 'iger', 'igen', 'chen', 'ish']);

/** Prüft, ob ein Token zu einem Wortstamm passt (Flexion oder Kompositum). */
export function matchStem(token: string, stem: string, loose = false): boolean {
  if (token === stem) return true;
  if (token.startsWith(stem)) {
    if (SUFFIXES.has(token.slice(stem.length))) return true;
    if (loose && stem.length >= 4) return true;
  }
  if (stem.length >= 5) {
    // Kompositum ("Holzhütte", "Lagerfeuer"): Stamm am Wortende
    const idx = token.lastIndexOf(stem);
    if (idx >= 3 && SUFFIXES.has(token.slice(idx + stem.length))) return true;
  }
  return false;
}

const anyStem = (token: string, stems: string[], loose = false) => stems.some((s) => matchStem(token, s, loose));

interface Mention {
  entry: SubjectEntry;
  index: number;
  count: number;
  sizeMod: number;
  placement?: ObjectSpec['placement'];
  spec?: ObjectSpec;
}

// ---------------------------------------------------------------- Analyse

export function analyzePrompt(request: GenerationRequest): SceneBlueprint {
  const tokens = normalize(request.prompt);
  const notes: string[] = [];
  const german = /[äöüß]/i.test(request.prompt) || tokens.filter((t) => GERMAN_MARKERS.includes(t)).length >= 1;
  notes.push(`Sprache: ${german ? 'Deutsch' : 'Englisch'} · ${tokens.length} Wörter`);

  const consumed = new Set<number>();
  const mentions: Mention[] = [];
  const subjectByStem = (stem: string) => SUBJECTS.find((e) => e.stems.includes(stem));

  // 1) Objekte finden ---------------------------------------------------
  tokens.forEach((tok, i) => {
    let entry: SubjectEntry | undefined;
    const amb = AMBIGUOUS[tok];
    if (amb) {
      const sub = german ? undefined : amb.en.subject;
      if (sub) entry = subjectByStem(sub);
      if (!entry) return;
    }
    // Farben und Merkmale haben Vorrang vor Objekt-Stämmen mit Komposita
    if (!entry && COLORS.some((c) => anyStem(tok, c.stems))) return;
    entry ??= SUBJECTS.find((e) => anyStem(tok, e.stems));
    if (!entry) return;
    // "rot" im Wort "Rotkehlchen" etc. wird hier nicht erfasst; ok.
    let count = entry.count ?? 1;
    let sizeMod = 1;
    let placement: Mention['placement'];
    for (let j = Math.max(0, i - 4); j < i; j++) {
      const t = tokens[j];
      if (NUMBER_WORDS[t]) count = NUMBER_WORDS[t];
      if (anyStem(t, SMALL_WORDS)) sizeMod = 0.75;
      if (anyStem(t, BIG_WORDS)) sizeMod = 1.3;
      const pl = PLACEMENT_WORDS.find((p) => anyStem(t, p.stems));
      if (pl) placement = pl.placement;
    }
    // Plural ohne Zahl ("Bäume", "trees") → 2 Instanzen bei Natur
    if (count === 1 && entry.archetype === 'tree' && /(baeume|trees)$/.test(tok)) count = 3;
    consumed.add(i);
    mentions.push({ entry, index: i, count: Math.min(count, 5), sizeMod, placement });
  });

  // 1b) Komposita wie "Skelett-Krieger" / "Drachen-Ritter": direkt benachbarte
  //     Objekte gleichen Archetyps zu einem Objekt zusammenfassen.
  for (let k = mentions.length - 1; k > 0; k--) {
    const a = mentions[k - 1], b = mentions[k];
    if (b.index === a.index + 1 && a.entry.archetype === b.entry.archetype && !a.entry.count && !b.entry.count) {
      a.entry = {
        ...a.entry,
        features: [...(a.entry.features ?? []), ...(b.entry.features ?? [])],
        colors: { ...(b.entry.colors ?? {}), ...(a.entry.colors ?? {}) },
        label: `${a.entry.label}-${b.entry.label}`,
      };
      mentions.splice(k, 1);
    }
  }

  // 2) Ausrüstung → Merkmal einer Figur ---------------------------------
  const humanoids = mentions.filter((m) => m.entry.archetype === 'humanoid');
  const objects: Mention[] = [];
  for (const m of mentions) {
    if (m.entry.equipment && humanoids.length > 0) {
      const owner = nearestBefore(humanoids, m.index) ?? humanoids[0];
      owner.entry = { ...owner.entry, features: [...(owner.entry.features ?? []), m.entry.equipment] };
      notes.push(`"${tokens[m.index]}" → Ausrüstung (${m.entry.equipment}) für ${owner.entry.label}`);
      continue;
    }
    objects.push(m);
  }

  if (objects.length === 0) {
    notes.push('Kein bekanntes Objekt erkannt – verwende Kristall als Ersatz. (Tipp: LLM-Generator für freie Formen aktivieren)');
    objects.push({ entry: SUBJECTS.find((e) => e.archetype === 'crystal')!, index: 0, count: 1, sizeMod: 1 });
  }

  // 3) ObjectSpecs erzeugen --------------------------------------------
  const placements: ObjectSpec['placement'][] = ['right', 'left', 'front', 'back'];
  let pIdx = 0;
  const specs: { spec: ObjectSpec; index: number }[] = [];
  objects.forEach((m, oi) => {
    const lib = OBJECT_LIBRARY[m.entry.archetype];
    for (let c = 0; c < m.count && specs.length < 6; c++) {
      const isMain = specs.length === 0;
      const scale = isMain ? m.entry.scale ?? 1 : lib.secondaryScale * m.sizeMod * (m.entry.scale ?? 1);
      let variant = m.entry.variant;
      if (m.entry.count && m.entry.archetype === 'tree') variant = (['oak', 'pine', 'oak', 'birch', 'pine'] as const)[c % 5];
      const spec: ObjectSpec = {
        archetype: m.entry.archetype,
        variant,
        scale: isMain ? scale : scale * (c > 0 ? 0.85 + 0.1 * (c % 2) : 1),
        colors: { ...(m.entry.colors ?? {}) },
        features: [...(m.entry.features ?? [])],
        placement: isMain ? 'center' : m.placement ?? placements[pIdx++ % placements.length],
        label: m.entry.label,
      };
      specs.push({ spec, index: m.index });
      if (c === 0) m.spec = spec;
    }
    if (oi === 0 && m.sizeMod !== 1) notes.push('Größenangabe beim Hauptobjekt: Zielgröße bleibt maßgeblich');
  });
  const main = specs[0].spec;
  const specAt = (index: number) => nearestBefore(specs, index)?.spec ?? main;

  // 4) Merkmale zuordnen ------------------------------------------------
  tokens.forEach((tok, i) => {
    if (consumed.has(i)) return;
    let feature: string | undefined;
    const amb = AMBIGUOUS[tok];
    if (amb) feature = german ? amb.de.feature : amb.en.feature;
    feature ??= FEATURES.find((f) => anyStem(tok, f.stems, true))?.feature;
    if (!feature) return;
    // passendes Objekt: nächstes davor, das dieses Merkmal unterstützt
    const candidates = specs.filter((s) => s.index <= i).reverse();
    const target =
      candidates.find((s) => supports(s.spec.archetype, feature!))?.spec ??
      specs.find((s) => supports(s.spec.archetype, feature!))?.spec ??
      specAt(i);
    if (!target.features.includes(feature)) target.features.push(feature);
  });

  // Standardausrüstung, wenn nichts angegeben; doppelte Merkmale entfernen
  for (const { spec } of specs) {
    spec.features = [...new Set(spec.features)];
    if (spec.archetype !== 'humanoid') continue;
    const weapons = ['sword', 'axe', 'hammer', 'spear', 'staff', 'wand', 'bow'];
    if (spec.variant === 'warrior' && !spec.features.some((f) => weapons.includes(f))) spec.features.push('sword');
  }

  // 5) Farben zuordnen --------------------------------------------------
  tokens.forEach((tok, i) => {
    const colorEntry = COLORS.find((c) => anyStem(tok, c.stems));
    if (!colorEntry) return;
    // "gold" als Merkmal einer Truhe ist keine Farbe des Hauptobjekts
    let color = colorEntry.color;
    const prev = tokens[i - 1];
    if (prev && DARK_WORDS.includes(prev)) color = shade(color, -0.35);
    if (prev && LIGHT_WORDS.includes(prev)) color = shade(color, 0.35);

    let target: ObjectSpec | undefined;
    let slot: string | undefined;
    // a) Slot-Nomen danach ("grüne Rüstung")
    for (let j = i + 1; j <= Math.min(tokens.length - 1, i + 3); j++) {
      const t = tokens[j];
      if (['und', 'and', 'mit', 'with', 'oder', 'or'].includes(t) && j > i + 1) break;
      const s = slotOf(t, german);
      if (s) {
        slot = s;
        target = nearestBefore(specs, i)?.spec ?? main;
        break;
      }
      const subj = specs.find((sp) => sp.index === j);
      if (subj) {
        target = subj.spec;
        slot = PRIMARY_SLOT[subj.spec.archetype];
        break;
      }
      // Merkmal ohne eigenen Slot ("goldene Krone") → Slot = Merkmal
      const feat = FEATURES.find((f) => anyStem(t, f.stems, true))?.feature;
      if (feat) {
        slot = FEATURE_SLOTS[feat] ?? feat;
        target = nearestBefore(specs, i)?.spec ?? main;
        break;
      }
      if (COLORS.some((c) => anyStem(t, c.stems))) break;
    }
    // b) Slot-Nomen davor ("Rüstung in Grün")
    if (!slot) {
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        const s = slotOf(tokens[j], german);
        if (s) {
          slot = s;
          target = nearestBefore(specs, j)?.spec ?? main;
          break;
        }
        const subj = specs.find((sp) => sp.index === j);
        if (subj) {
          target = subj.spec;
          slot = PRIMARY_SLOT[subj.spec.archetype];
          break;
        }
      }
    }
    target ??= main;
    slot ??= PRIMARY_SLOT[target.archetype];
    slot = SLOT_ALIASES[target.archetype]?.[slot] ?? slot;
    if (slot === 'none') return;
    target.colors[slot] = color;
    notes.push(`Farbe ${color} → ${target.label ?? target.archetype}.${slot}`);
  });

  // 6) Stil, Tageszeit, Untergrund -------------------------------------
  let detectedStyle: StyleId | undefined;
  for (const tok of tokens) {
    const hint = STYLE_HINTS.find((h) => anyStem(tok, h.stems));
    if (hint) {
      detectedStyle = hint.style;
      break;
    }
  }
  if (!detectedStyle && tokens.includes('dark') && !COLORS.some((c) => anyStem(tokens[tokens.indexOf('dark') + 1] ?? '', c.stems))) detectedStyle = 'dark';
  if (!detectedStyle && (main.archetype === 'spaceship' || main.variant === 'robot')) detectedStyle = 'scifi';
  const style: StyleId = request.profile?.styleLock ? request.profile.baseStyle : request.style === 'auto' ? detectedStyle ?? 'fantasy' : request.style;
  notes.push(`Stil: ${STYLE_PRESETS[style].name}${request.style === 'auto' ? ' (automatisch erkannt)' : ''}${detectedStyle && request.style !== 'auto' && detectedStyle !== request.style ? ` – Prompt deutet auf ${STYLE_PRESETS[detectedStyle].name} hin` : ''}`);

  const mood = tokens.some((t) => anyStem(t, NIGHT_WORDS)) ? 'night' : 'day';
  if (mood === 'night') notes.push('Tageszeit: Nacht → leuchtende Fenster');

  let base: SceneBlueprint['base'] = 'none';
  for (const tok of tokens) {
    const b = BASE_WORDS.find((w) => anyStem(tok, w.stems));
    if (b) {
      base = b.base;
      break;
    }
  }
  const sceneLike: ArchetypeId[] = ['house', 'tower', 'castle', 'campfire', 'tree', 'mushroom', 'rock', 'crystal'];
  if (base === 'none' && (specs.length > 1 || sceneLike.includes(main.archetype))) {
    base = specs.some((s) => s.spec.features.includes('snow')) ? 'snow' : main.variant === 'palm' ? 'sand' : style === 'dark' ? 'dirt' : 'grass';
  }
  if (main.archetype === 'crystal' || main.archetype === 'rock') base = base === 'grass' && specs.length === 1 ? 'none' : base;

  for (const { spec } of specs) {
    notes.push(
      `Objekt: ${spec.label} [${spec.archetype}${spec.variant ? '/' + spec.variant : ''}] ` +
        `Größe ${Math.round(spec.scale * 100)}%` +
        (spec.features.length ? ` · Merkmale: ${spec.features.join(', ')}` : '') +
        (spec.placement !== 'center' ? ` · Position: ${spec.placement}` : ''),
    );
  }
  if (base !== 'none') notes.push(`Sockel: ${base}`);

  return {
    title: makeTitle(request.prompt),
    style,
    objects: specs.map((s) => s.spec),
    base,
    mood,
    notes,
  };
}

/** Farbslot für Merkmale, deren Name nicht direkt einem Slot entspricht. */
const FEATURE_SLOTS: Record<string, string> = { helmet: 'metal', horns: 'horn', robe: 'armor', fire: 'flame', glow: 'gem', smoke: 'smoke', snow: 'snow' };

function nearestBefore<T extends { index: number }>(list: T[], index: number): T | undefined {
  let best: T | undefined;
  for (const m of list) if (m.index <= index && (!best || m.index > best.index)) best = m;
  return best;
}

function slotOf(token: string, german: boolean): string | undefined {
  const amb = AMBIGUOUS[token];
  if (amb) return german ? amb.de.slot : amb.en.slot;
  return SLOTS.find((s) => anyStem(token, s.stems))?.slot;
}

function supports(archetype: ArchetypeId, feature: string): boolean {
  const lib = OBJECT_LIBRARY[archetype];
  return !!lib.features?.includes(feature);
}

function makeTitle(prompt: string): string {
  const t = prompt.trim().replace(/\s+/g, ' ');
  if (!t) return 'Unbenannt';
  const short = t.length > 48 ? t.slice(0, 45).trimEnd() + '…' : t;
  return short.charAt(0).toUpperCase() + short.slice(1);
}
