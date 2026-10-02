import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { createProfile, parseStyleText } from '../src/shared/style/profile';
import { spriteFromPrompt, addAnimationsToDoc } from '../src/shared/sprite/spriteGenerator';
import { layoutSheet } from '../src/shared/sprite/sheet';
import { spriteFramesTres } from '../src/shared/sprite/godot';
import { generateTileset, kitFromPrompt, transitionTile } from '../src/shared/sprite/tiles';
import { generateEffect, EFFECTS, type EffectId } from '../src/shared/sprite/effects';
import { generateUiKit } from '../src/shared/sprite/ui';
import { analyzeImage } from '../src/shared/style/analyze';
import { classifyPrompt } from '../src/shared/ai/intent';
import { spritePackage, zipFiles } from '../src/shared/sprite/package';
import { serializeSpriteDoc, parseSpriteDoc, type SpriteDoc } from '../src/shared/sprite/types';
import { runJob } from '../src/shared/sprite/jobs';

const profile = createProfile();
const knight = () =>
  spriteFromPrompt({
    prompt: 'Ein Ritter mit rotem Umhang und Schwert',
    size: 32,
    profile,
    seed: 11,
    animations: [{ id: 'idle', frames: 4, fps: 6 }, { id: 'walk', frames: 8, fps: 10 }, { id: 'attack', frames: 6, fps: 12 }],
  }).doc;

/** Unterste deckende Zeile (Füße) eines Frames. */
function bottomRow(doc: SpriteDoc, a: number, f: number): number {
  const img = doc.animations[a].frames[f];
  for (let y = img.h - 1; y >= 0; y--) for (let x = 0; x < img.w; x++) if (img.data[y * img.w + x]) return y;
  return -1;
}

describe('2D-Sprite-Generator', () => {
  it('erzeugt echte indizierte Pixel-Frames für alle Richtungen und Animationen', () => {
    const doc = knight();
    expect(doc.width).toBe(32);
    expect(doc.animations).toHaveLength(3 * 4); // 3 Animationen × 4 Richtungen
    expect(doc.animations.filter((a) => a.name === 'walk')[0].frames).toHaveLength(8);
    for (const a of doc.animations) for (const f of a.frames) {
      expect(f.w * f.h).toBe(f.data.length);
      expect([...f.data].some((v) => v > 0)).toBe(true); // nicht leer
      expect([...f.data].some((v) => v === 0)).toBe(true); // transparenter Hintergrund
      expect(Math.max(...f.data)).toBeLessThanOrEqual(doc.palette.length);
    }
    expect(doc.palette.length).toBeLessThanOrEqual(profile.palette.maxColors + 2);
  });

  it('ist deterministisch (gleicher Seed → identische Pixel)', () => {
    const a = serializeSpriteDoc(knight()), b = serializeSpriteDoc(knight());
    expect(a.animations.map((x) => x.frames)).toEqual(b.animations.map((x) => x.frames));
  });

  it('Style Lock für Animationen: gleiche Pixelgröße, Palette und Fußlinie in allen Frames', () => {
    const doc = knight();
    const idle = doc.animations.findIndex((a) => a.name === 'idle' && a.direction === 'down');
    const walk = doc.animations.findIndex((a) => a.name === 'walk' && a.direction === 'down');
    // Gleiche Rahmung → Fußlinie bleibt stehen (Schrittpose darf 1 px tiefer reichen)
    expect(Math.abs(bottomRow(doc, idle, 0) - bottomRow(doc, walk, 0))).toBeLessThanOrEqual(1);
    // Neue Animation für denselben Charakter: Palette bleibt EXAKT gleich
    const before = [...doc.palette];
    const more = addAnimationsToDoc(doc, [{ id: 'cast', frames: 8, fps: 10 }, { id: 'death', frames: 6, fps: 8 }], profile);
    expect(more.palette).toEqual(before);
    expect(more.animations.filter((a) => a.name === 'cast')).toHaveLength(4);
    const cast = more.animations.findIndex((a) => a.name === 'cast' && a.direction === 'down');
    // Die Zauber-Pose neigt den Körper leicht → Fußlinie höchstens 1 px Abweichung
    expect(Math.abs(bottomRow(more, cast, 0) - bottomRow(doc, idle, 0))).toBeLessThanOrEqual(1);
    // Dieselbe Animation erneut erzeugt → pixelgenau identische Frames
    const again = addAnimationsToDoc(doc, [{ id: 'idle', frames: doc.animations[idle].frames.length, fps: doc.animations[idle].fps }], profile);
    const idle2 = again.animations.find((a) => a.name === 'idle' && a.direction === 'down')!;
    expect(idle2.frames.map((f) => Array.from(f.data))).toEqual(doc.animations[idle].frames.map((f) => Array.from(f.data)));
    expect(more.source?.render).toEqual(doc.source?.render);
  });

  it('Frame-Anzahl und FPS sind frei wählbar', () => {
    const { doc } = spriteFromPrompt({ prompt: 'Ein Krieger', size: 32, profile, seed: 1, directions: ['down'], animations: [{ id: 'run', frames: 12, fps: 20 }] });
    expect(doc.animations[0].frames).toHaveLength(12);
    expect(doc.animations[0].fps).toBe(20);
  });

  it('unterstützt 16, 32, 64 und individuelle Größen', () => {
    for (const size of [16, 40, 64]) {
      const { doc } = spriteFromPrompt({ prompt: 'Ein Magier', size, profile, seed: 2, directions: ['down'], animations: [{ id: 'idle', frames: 2, fps: 4 }] });
      expect(doc.width).toBe(size);
      expect(doc.animations[0].frames[0].data.length).toBe(size * size);
    }
  }, 60000);

  it('gesperrte Projektpalette: alle Assets nutzen nur Projektfarben', () => {
    const locked = { ...createProfile(), palette: { locked: true, colors: ['#0f0f1a', '#5a3a2a', '#c8323c', '#e3b23c', '#3e8948', '#3a62c8', '#c0cbdc', '#ffffff'], maxColors: 8 } };
    for (const prompt of ['Ein Ritter', 'Ein Magier mit blauer Robe', 'Ein grüner Schleim']) {
      const { doc } = spriteFromPrompt({ prompt, size: 32, profile: locked, seed: 3, directions: ['down'], animations: [{ id: 'idle', frames: 2, fps: 4 }] });
      for (const c of doc.palette) expect(locked.palette.colors).toContain(c);
    }
  });

  it('Stilbeschreibung → Profil (Beispiel aus der Anforderung)', () => {
    const { profile: p } = parseStyleText('Fantasy RPG, dunkle Grüntöne, warme Schatten, goldene Highlights, 32x32 Charaktere, schwarze Outlines, harte Schatten, keine Verläufe, JRPG Charakterproportionen, mittelalterliche Fantasy');
    expect(p.pixel.characterSize).toBe(32);
    expect(p.pixel.outline).toBe('black');
    expect(p.color.shadowTone).toBe('warm');
    expect(p.color.highlightTone).toBe('gold');
    expect(p.color.tint?.hue).toBe(120);
    expect(p.design.proportions).toBe('jrpg');
    expect(p.pixel.dithering).toBe(false);
  });
});

describe('Godot-Export', () => {
  it('SpriteFrames enthält alle Animationen (name_richtung) und Frames', () => {
    const doc = knight();
    const layout = layoutSheet(doc);
    const tres = spriteFramesTres(layout, 'res://assets/characters/ritter/ritter.png');
    expect(tres).toMatch(/^\[gd_resource type="SpriteFrames" load_steps=\d+ format=3\]/);
    for (const k of ['idle_down', 'walk_left', 'attack_up']) expect(tres).toContain(`"name": &"${k}"`);
    const frames = doc.animations.reduce((n, a) => n + a.frames.length, 0);
    expect((tres.match(/type="AtlasTexture"/g) ?? []).length).toBe(frames);
  });

  it('Paket hat die Godot-Ordnerstruktur res://assets/characters/<name>/', () => {
    const files = spritePackage(knight(), { name: 'Ranger', category: 'character' });
    const keys = Object.keys(files);
    expect(keys).toContain('assets/characters/ranger/ranger.png');
    expect(keys).toContain('assets/characters/ranger/ranger.tres');
    expect(keys).toContain('assets/characters/ranger/metadata.json');
    expect(keys.some((k) => k.startsWith('assets/characters/ranger/frames/walk_down_'))).toBe(true);
    const meta = JSON.parse(strFromU8(files['assets/characters/ranger/metadata.json']));
    expect(meta.frameSize).toEqual({ w: 32, h: 32 });
    expect(meta.animations[0]).toMatchObject({ name: 'idle', frameCount: 4, fps: 6 });
    expect(meta.animations[0].frames[1]).toEqual({ x: 32, y: 0, w: 32, h: 32, duration: 167 });
    const unzipped = unzipSync(zipFiles(files));
    expect(Object.keys(unzipped).length).toBe(keys.length);
    // PNG-Signatur
    expect([...files['assets/characters/ranger/ranger.png'].slice(0, 4)]).toEqual([137, 80, 78, 71]);
  });
});

describe('Tiles, Effekte, UI', () => {
  it('Waldgebiet → Tileset mit Übergängen und Terrain-Ecken', () => {
    const kit = kitFromPrompt('Ein Waldgebiet für eine RPG Karte');
    expect(kit.name).toBe('Wald');
    const doc = generateTileset(kit, 16, profile, 2);
    expect(doc.atlas?.tileSize).toBe(16);
    expect(doc.atlas!.regions.filter((r) => r.kind === 'transition').length).toBe(14 * kit.transitions.length);
    expect(doc.atlas!.regions.some((r) => r.kind === 'deco')).toBe(true);
    expect(doc.atlas!.regions.some((r) => r.kind === 'animated' && r.frames === 4)).toBe(true);
    const files = spritePackage(doc, { name: 'Wald', category: 'tile' });
    const tres = strFromU8(files['assets/tiles/wald/wald.tres']);
    expect(tres).toContain('type="TileSet"');
    expect(tres).toContain('terrain_set_0/mode = 1');
    expect(tres).toContain('terrains_peering_bit/top_left_corner');
  });

  it('Übergangs-Tiles sind an gemeinsamen Kanten konsistent', () => {
    const a = transitionTile('grass', 'dirt', [1, 1, 1, 1], 16, profile, 4); // nur Gras
    const b = transitionTile('grass', 'dirt', [0, 0, 0, 0], 16, profile, 4); // nur Erde
    const c = transitionTile('grass', 'dirt', [1, 0, 1, 0], 16, profile, 4); // links Gras, rechts Erde
    const col = (t: (string | null)[], x: number) => Array.from({ length: 16 }, (_, y) => t[y * 16 + x]);
    const grass = new Set(a), dirt = new Set(b);
    expect(col(c, 0).every((p) => grass.has(p) || p === null || !dirt.has(p))).toBe(true);
    expect(col(c, 15).every((p) => dirt.has(p))).toBe(true);
  });

  it('alle Effekte erzeugen nicht-leere Frames', () => {
    for (const id of Object.keys(EFFECTS) as EffectId[]) {
      const doc = generateEffect(id, 32, profile);
      expect(doc.animations[0].frames.length).toBe(EFFECTS[id].frames);
      const filled = doc.animations[0].frames.filter((f) => f.data.some((v) => v > 0)).length;
      expect(filled, id).toBeGreaterThanOrEqual(EFFECTS[id].frames - 1);
    }
  });

  it('UI-Kit enthält 9-Slice-Panel, Buttons, Leisten und Icons', () => {
    const doc = generateUiKit('wood', profile);
    const names = doc.atlas!.regions.map((r) => r.name);
    for (const n of ['Panel (9-Slice)', 'Button normal', 'Button hover', 'Button gedrückt', 'Füllung Leben', 'Herz voll', 'Schwert']) expect(names).toContain(n);
    expect(doc.atlas!.regions.find((r) => r.name === 'Panel (9-Slice)')!.nineSlice).toBeDefined();
  });

  it('Asset-Jobs sind serialisierbar (Worker)', () => {
    const res = runJob({ type: 'effect', prompt: 'Ein Feuerzauber für einen Magier', size: 32, profile });
    expect(res.meta?.effect).toBe('fire');
    expect(parseSpriteDoc(res.doc).animations[0].frames.length).toBeGreaterThan(3);
  });
});

describe('Referenzanalyse & Absichtserkennung', () => {
  it('erkennt Pixelskalierung, Palette und Outline eines hochskalierten Sprites', () => {
    const n = 8, scale = 4, W = n * scale;
    const rgba = new Uint8ClampedArray(W * W * 4);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const edge = x === 1 || y === 1 || x === 6 || y === 6;
        const inside = x >= 1 && x <= 6 && y >= 1 && y <= 6;
        if (!inside) continue;
        const c = edge ? [16, 12, 20] : x < 4 ? [200, 50, 60] : [120, 30, 40];
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) rgba.set([...c, 255], ((y * scale + dy) * W + x * scale + dx) * 4);
      }
    const r = analyzeImage(rgba, W, W, 'test.png');
    expect(r.pixelScale).toBe(4);
    expect(r.width).toBe(8);
    expect(r.hasOutline).toBe(true);
    expect(r.palette.length).toBe(3);
    expect(r.lightDirection).toBe('top-left');
  });

  it('ordnet die Beispiel-Prompts richtig zu', () => {
    const c = (p: string) => classifyPrompt(p, 'auto', '2d');
    expect(c('Ein weiblicher Waldläufer aus einem Fantasy JRPG mit grüner Lederrüstung und einem Bogen')).toMatchObject({ output: 'sprite', category: 'character' });
    expect(c('Eine alte verfallene Burg mit Moos und zerstörten Mauern')).toMatchObject({ output: 'sprite', category: 'building' });
    expect(c('Ein Feuerzauber für einen Magier')).toMatchObject({ output: 'effect' });
    expect(c('Ein Waldgebiet für eine RPG Karte')).toMatchObject({ output: 'tileset' });
    expect(c('Ein Inventar UI im Holzstil')).toMatchObject({ output: 'ui' });
    expect(c('Erstelle eine Angriff Animation für diesen Charakter')).toMatchObject({ animations: ['attack'], animationRequest: { target: 'current' } });
    expect(c('Erstelle eine Laufanimation für meinen Ritter')).toMatchObject({ animations: ['walk'], animationRequest: { target: 'named', name: 'ritter' } });
    expect(c('Erstelle eine Zauber und Sieg Animation für diesen Charakter').animations).toEqual(['cast', 'victory']);
    expect(classifyPrompt('Ein Drache', 'auto', '3d').output).toBe('voxel');
  });
});
