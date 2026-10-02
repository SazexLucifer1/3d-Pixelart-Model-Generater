import { useGame } from '../state/gameStore';
import { useEditor } from '../state/editorStore';
import { useSprite } from '../state/spriteStore';
import { classifyPrompt, type AssetIntent } from '../../shared/ai/intent';
import { runAssetJob } from './jobs';
import { runGeneration } from '../hooks/useGeneration';
import { newAsset, categoryFor, type AssetCategory, type GameAsset } from '../../shared/library/gameProject';
import { parseSpriteDoc, serializeSpriteDoc, directionsFor, type Direction, type SpriteDoc } from '../../shared/sprite/types';
import type { SpriteAnimRequest } from '../../shared/sprite/spriteGenerator';
import type { SceneBlueprint } from '../../shared/ai/types';
import type { JobResult } from '../../shared/sprite/jobs';
import { docThumbnail } from './spriteCanvas';
import { thumbnail } from './exporters';
import { viewportRef } from '../render/viewportRef';
import { analyzePrompt } from '../../shared/ai/interpreter/RuleBasedInterpreter';

/**
 * Universeller Asset-Generator: ein Prompt → passendes Asset.
 * Leitet je nach erkannter Absicht weiter an 3D-Voxel-, Sprite-, Tileset-,
 * Effekt- oder UI-Generierung und legt das Ergebnis in der Bibliothek ab.
 */

const CHARACTER_CATS: AssetCategory[] = ['character', 'npc', 'enemy', 'monster', 'animal', 'boss'];

function spriteSizeFor(category: AssetCategory): number {
  const g = useGame.getState();
  if (g.spriteSize !== 'auto') return g.spriteSize;
  const px = g.profile().pixel;
  switch (category) {
    case 'boss': return Math.min(128, px.characterSize * 2);
    case 'item': case 'weapon': case 'armor': return Math.max(16, px.itemSize);
    case 'building': case 'environment': return Math.min(128, px.characterSize * 2);
    case 'tile': return px.tileSize;
    default: return px.characterSize;
  }
}

export function currentDirections(): Direction[] {
  const g = useGame.getState();
  const p = g.profile();
  return directionsFor(g.directions === 'profile' ? p.design.directions : g.directions, p.design.view);
}

export function selectedAnimations(force: string[] = []): SpriteAnimRequest[] {
  const { animSettings } = useGame.getState();
  return Object.entries(animSettings)
    .filter(([id, s]) => s.enabled || force.includes(id))
    .map(([id, s]) => ({ id, frames: s.frames, fps: s.fps }));
}

/** Optional: LLM-Blueprint vom Backend (Claude/Ollama), sonst null. */
async function llmBlueprint(prompt: string): Promise<SceneBlueprint | null> {
  const gen = useEditor.getState().gen.generator;
  if (gen === 'procedural') return null;
  try {
    const res = await fetch('/api/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, generator: gen === 'auto' ? undefined : gen, profile: useGame.getState().profile() }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { blueprint: SceneBlueprint | null };
    return data.blueprint;
  } catch {
    return null;
  }
}

/** Kurzer Asset-Name aus dem Prompt („Erstelle einen Waldläufer … für mein RPG“ → „Waldläufer“). */
export function nameFromPrompt(prompt: string): string {
  let t = prompt.trim()
    .replace(/^(bitte\s+)?(erstelle|erzeuge|generiere|mach|mache|zeichne|baue|create|make|generate|draw)\s+(mir\s+|me\s+)?/i, '')
    .replace(/^(einen|eine|einem|ein|der|die|das|an|a|the)\s+/i, '')
    .replace(/\s+(für|fuer|for)\s+(mein|meine|meinen|my|das|den|die|ein|eine|einen)\b.*$/i, '')
    .replace(/\s+(mit|aus|im|in|auf|neben|with|from|in|on|wearing)\s.*$/i, '')
    .replace(/,.*$/, '')
    .replace(/\s+(charakter|character)$/i, '');
  if (t.length > 42) t = t.slice(0, 40).trimEnd() + '…';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function openSprite(asset: GameAsset, doc: SpriteDoc): void {
  useSprite.getState().load(doc, asset.id);
  useGame.getState().set({ activeSpriteId: asset.id, workspace: 'sprite' });
}

function storeSprite(result: JobResult, intent: Pick<AssetIntent, 'category'>, prompt: string, kind: GameAsset['kind'], name?: string): GameAsset {
  const g = useGame.getState();
  const doc = parseSpriteDoc(result.doc);
  const asset = newAsset({
    name: name ?? (kind === 'sprite' ? nameFromPrompt(prompt) : result.name),
    category: intent.category,
    kind,
    prompt,
    profileId: g.profile().id,
    thumbnail: docThumbnail(doc),
    sprite: result.doc,
    meta: { ...(result.meta ?? {}), archetype: result.archetype, seed: result.seed, available: result.available, notes: result.notes },
  });
  g.addAsset(asset);
  openSprite(asset, doc);
  return asset;
}

/** Sucht ein Sprite-Asset für „meinen Ritter“ (Name, Prompt oder Archetyp). */
function findSpriteAsset(name?: string): GameAsset | undefined {
  const g = useGame.getState();
  const sprites = g.project.assets.filter((a) => a.sprite && parseable(a));
  if (!name) return sprites.find((a) => a.id === g.activeSpriteId) ?? sprites[0];
  const n = name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
  const label = analyzePrompt({ prompt: name, style: 'auto', size: 24, palette: 'style', detail: 2 }).objects[0]?.label?.toLowerCase();
  const norm = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
  return sprites.find((a) => norm(a.name).includes(n) || norm(a.prompt).includes(n) || (label && norm(a.name).includes(norm(label))));
}
const parseable = (a: GameAsset) => !!a.sprite?.source;

export async function runAssetGeneration(): Promise<void> {
  const g = useGame.getState();
  const ed = useEditor.getState();
  const prompt = ed.prompt.trim();
  if (!prompt) {
    g.notify('Bitte zuerst eine Beschreibung eingeben.', 'error');
    return;
  }
  if (g.busy) return;
  const mode = g.workspace === 'voxel' ? '3d' : '2d';
  const intent = classifyPrompt(prompt, g.output, mode);
  const profile = g.profile();
  const seed = ed.gen.seed ?? undefined;
  g.set({ busy: 'Generiere …', lastNotes: intent.notes });
  try {
    if (intent.output === 'voxel') {
      g.set({ workspace: 'voxel' });
      const r = await runGeneration();
      if (!r) return;
      const bp = r.result.blueprint;
      const main = bp.objects[0];
      const asset = newAsset({
        name: nameFromPrompt(prompt),
        category: categoryFor(main?.archetype ?? 'custom', main?.variant, prompt),
        kind: 'voxel',
        prompt,
        profileId: profile.id,
        voxel: { model: r.result.model, animations: r.result.animations, blueprint: bp, seed: r.result.seed, request: { ...r.request, profile: undefined } },
      });
      setTimeout(() => {
        const vp = viewportRef.get();
        if (vp) useGame.getState().updateAsset(asset.id, { thumbnail: thumbnail(vp) });
      }, 120);
      g.addAsset(asset);
      g.set({ activeVoxelId: asset.id });
      g.notify(`3D-Asset „${asset.name}“ erzeugt und in der Bibliothek gespeichert`, 'ok');
      return;
    }

    // Animation für bestehenden Charakter
    if (intent.animationRequest) {
      const target = findSpriteAsset(intent.animationRequest.target === 'named' ? intent.animationRequest.name : undefined);
      if (target?.sprite) {
        const anims = selectedAnimations(intent.animations).filter((a) => intent.animations.includes(a.id));
        g.set({ busy: `Erzeuge ${anims.map((a) => a.id).join(', ')} für „${target.name}“ …` });
        const res = await runAssetJob({ type: 'addAnimations', doc: target.sprite, animations: anims, profile });
        const doc = parseSpriteDoc(res.doc);
        g.updateAsset(target.id, { sprite: res.doc, thumbnail: docThumbnail(doc) });
        openSprite({ ...target, sprite: res.doc }, doc);
        g.notify(`Animation(en) ${anims.map((a) => a.id).join(', ')} zu „${target.name}“ hinzugefügt – gleiche Quelle, Palette und Pixelgröße`, 'ok');
        return;
      }
      g.notify('Kein passender Charakter in der Bibliothek – erzeuge einen neuen.', 'info');
    }

    switch (intent.output) {
      case 'tileset': {
        const res = await runAssetJob({ type: 'tileset', prompt, tileSize: g.spriteSize === 'auto' ? profile.pixel.tileSize : g.spriteSize, profile, seed });
        storeSprite(res, intent, prompt, 'tileset');
        break;
      }
      case 'effect': {
        const res = await runAssetJob({ type: 'effect', prompt, size: spriteSizeFor('effect'), profile, seed });
        storeSprite(res, intent, prompt, 'effect');
        break;
      }
      case 'ui': {
        const res = await runAssetJob({ type: 'ui', prompt, profile });
        storeSprite(res, intent, prompt, 'ui');
        break;
      }
      default: {
        const isChar = CHARACTER_CATS.includes(intent.category);
        const size = spriteSizeFor(intent.category);
        g.set({ busy: `Generiere ${size}×${size}-Sprite …` });
        const blueprint = await llmBlueprint(prompt);
        const res = await runAssetJob({
          type: 'sprite', prompt, size, profile, seed, blueprint: blueprint ?? undefined,
          directions: isChar ? currentDirections() : ['down'],
          animations: isChar ? selectedAnimations(intent.animations) : [],
          objectAnims: !isChar,
        });
        storeSprite(res, intent, prompt, 'sprite');
        g.set({ lastNotes: [...intent.notes, ...res.notes] });
      }
    }
    g.notify('Asset erzeugt und in der Projektbibliothek gespeichert', 'ok');
  } catch (e) {
    g.notify(e instanceof Error ? e.message : String(e), 'error');
  } finally {
    useGame.getState().set({ busy: null });
  }
}

/** Fügt dem aktiven Sprite Animationen hinzu bzw. erzeugt sie neu. */
export async function addAnimationsToActive(anims: SpriteAnimRequest[], directions?: Direction[]): Promise<void> {
  const g = useGame.getState();
  const sp = useSprite.getState();
  if (!sp.doc || !sp.assetId) return;
  if (!sp.doc.source) {
    g.notify('Dieses Sprite hat kein Quellmodell (importiert/gezeichnet) – Animationen bitte manuell zeichnen.', 'error');
    return;
  }
  g.set({ busy: `Erzeuge ${anims.length} Animation(en) …` });
  try {
    const res = await runAssetJob({ type: 'addAnimations', doc: serializeSpriteDoc(sp.doc), animations: anims, profile: g.profile(), directions });
    const doc = parseSpriteDoc(res.doc);
    sp.docEdit('Animationen generiert', (d) => Object.assign(d, doc));
    g.updateAsset(sp.assetId, { sprite: res.doc, thumbnail: docThumbnail(doc) });
    g.notify('Animationen erzeugt (identisches Quellmodell, gleiche Palette)', 'ok');
  } catch (e) {
    g.notify(e instanceof Error ? e.message : String(e), 'error');
  } finally {
    g.set({ busy: null });
  }
}

/** 3D-Modell aus dem Voxel-Editor als 2D-Sprite rendern (inkl. eigener Voxel-Änderungen). */
export async function voxelToSprite(): Promise<void> {
  const g = useGame.getState();
  const ed = useEditor.getState();
  if (!ed.model.size) return;
  const archetype = ed.blueprint?.objects[0]?.archetype ?? 'custom';
  const category = categoryFor(archetype, ed.blueprint?.objects[0]?.variant, ed.prompt);
  const isChar = CHARACTER_CATS.includes(category);
  g.set({ busy: 'Rendere 3D-Modell als Pixel-Sprite …' });
  try {
    const res = await runAssetJob({
      type: 'fromModel', model: ed.model.toJSON(), archetype, size: spriteSizeFor(category), profile: g.profile(),
      directions: isChar ? currentDirections() : ['down'], animations: isChar ? selectedAnimations() : [],
    });
    storeSprite(res, { category }, ed.prompt, 'sprite', `${ed.projectName} (2D)`);
    g.notify(res.notes.join(' · '), 'ok');
  } catch (e) {
    g.notify(e instanceof Error ? e.message : String(e), 'error');
  } finally {
    g.set({ busy: null });
  }
}

export { categoryFor };
