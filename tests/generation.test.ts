import { describe, expect, it } from 'vitest';
import { analyzePrompt } from '../src/shared/ai/interpreter/RuleBasedInterpreter';
import { createProceduralGenerator, sanitizeBlueprint, buildFromBlueprint } from '../src/shared/ai/generators';
import { VoxelModel } from '../src/shared/voxel/VoxelModel';
import { ARCHETYPE_IDS, OBJECT_LIBRARY } from '../src/shared/ai/procedural/library';
import { buildScene } from '../src/shared/ai/procedural/SceneBuilder';
import type { GenerationRequest, SceneBlueprint } from '../src/shared/ai/types';
import { GAMEBOY_PALETTE } from '../src/shared/palette/styles';
import { fromLlmJson } from '../server/providers/blueprintSchema';

const req = (prompt: string, extra: Partial<GenerationRequest> = {}): GenerationRequest => ({ prompt, style: 'auto', size: 24, palette: 'style', detail: 2, seed: 7, ...extra });

describe('Prompt-Analyse', () => {
  it('versteht den JRPG-Krieger', () => {
    const bp = analyzePrompt(req('Ein kleiner Fantasy-Krieger mit grüner Rüstung, Schwert und Umhang im Stil eines alten JRPGs'));
    expect(bp.objects).toHaveLength(1);
    const o = bp.objects[0];
    expect(o.archetype).toBe('humanoid');
    expect(o.variant).toBe('warrior');
    expect(o.features).toEqual(expect.arrayContaining(['sword', 'cape', 'armor']));
    expect(o.colors.armor).toBe('#4a9e3f');
    expect(bp.style).toBe('fantasy');
  });

  it('versteht die Holzhütte mit Moos und Lagerfeuer', () => {
    const bp = analyzePrompt(req('Eine mittelalterliche Holzhütte mit Moos auf dem Dach und einem kleinen Lagerfeuer'));
    expect(bp.objects.map((o) => o.archetype)).toEqual(['house', 'campfire']);
    expect(bp.objects[0].variant).toBe('hut');
    expect(bp.objects[0].features).toContain('moss');
    expect(bp.objects[1].scale).toBeLessThan(1);
    expect(bp.style).toBe('medieval');
    expect(bp.base).toBe('grass');
  });

  it('ordnet Farben dem richtigen Objekt zu', () => {
    const bp = analyzePrompt(req('Ein roter Drache mit goldenen Hörnern'));
    expect(bp.objects[0].archetype).toBe('dragon');
    expect(bp.objects[0].colors.body).toBe('#c8323c');
    expect(bp.objects[0].colors.horn).toBe('#e3b23c');
  });

  it('funktioniert auf Englisch und erkennt Mehrdeutigkeiten', () => {
    const bp = analyzePrompt(req('a cute blue slime with a crown'));
    expect(bp.objects[0].archetype).toBe('slime');
    expect(bp.objects[0].features).toContain('crown');
    expect(bp.style).toBe('cute');
    const hut = analyzePrompt(req('a small hut in the snow'));
    expect(hut.objects[0].archetype).toBe('house');
    const hat = analyzePrompt(req('Ein Magier mit spitzem Hut'));
    expect(hat.objects[0].features).toContain('hat');
  });

  it('erzeugt mehrere Objekte für Mengen und Wälder', () => {
    expect(analyzePrompt(req('Ein Wald')).objects.length).toBe(4);
    expect(analyzePrompt(req('Drei Bäume')).objects.length).toBe(3);
  });

  it('fällt bei unbekannten Begriffen auf ein Ersatzobjekt zurück', () => {
    const bp = analyzePrompt(req('xyzzy foobar'));
    expect(bp.objects).toHaveLength(1);
    expect(bp.notes.join(' ')).toMatch(/Kein bekanntes Objekt/);
  });
});

describe('Prozedurale Generierung', () => {
  it('ist mit gleichem Seed deterministisch', async () => {
    const g = createProceduralGenerator();
    const a = await g.generate(req('Ein Ritter mit Schild'));
    const b = await g.generate(req('Ein Ritter mit Schild'));
    expect(JSON.stringify(a.model)).toBe(JSON.stringify(b.model));
    expect(a.model.voxels.length).toBeGreaterThan(500);
    expect(a.animations.map((c) => c.kind)).toEqual(expect.arrayContaining(['idle', 'walk', 'attack']));
  });

  it('baut jeden Archetyp der Bibliothek', () => {
    for (const id of ARCHETYPE_IDS) {
      if (id === 'custom') continue;
      const variants = OBJECT_LIBRARY[id].variants ?? [undefined];
      for (const variant of variants) {
        const bp: SceneBlueprint = { title: id, style: 'fantasy', base: 'none', notes: [], objects: [{ archetype: id, variant, scale: 1, colors: {}, features: OBJECT_LIBRARY[id].features ?? [], placement: 'center' }] };
        const m = buildScene(bp, req(id), 3);
        expect(m.size, `${id}/${variant}`).toBeGreaterThan(20);
        expect(m.bounds()!.minY).toBe(0);
      }
    }
  });

  it('skaliert mit der Zielgröße', async () => {
    const g = createProceduralGenerator();
    const small = VoxelModel.fromJSON((await g.generate(req('Ein Krieger', { size: 16 }))).model);
    const big = VoxelModel.fromJSON((await g.generate(req('Ein Krieger', { size: 48 }))).model);
    const hs = small.bounds()!.maxY, hb = big.bounds()!.maxY;
    expect(hs).toBeGreaterThanOrEqual(14);
    expect(hs).toBeLessThanOrEqual(19);
    expect(hb).toBeGreaterThanOrEqual(44);
    expect(big.size).toBeGreaterThan(small.size * 4);
  });

  it('begrenzt die Palette je nach Stil', async () => {
    const g = createProceduralGenerator();
    const gb = await g.generate(req('Eine Burg', { style: 'gameboy' }));
    expect(gb.model.palette.every((c) => GAMEBOY_PALETTE.includes(c))).toBe(true);
    const pico = await g.generate(req('Ein Drache', { palette: 'pico8' }));
    expect(pico.model.palette.length).toBeLessThanOrEqual(16);
    const low = await g.generate(req('Eine Holzhütte', { detail: 1, style: 'medieval' }));
    expect(low.model.palette.length).toBeLessThanOrEqual(Math.round(24 * 0.6));
  });

  it('platziert Nebenobjekte ohne Überlappung', async () => {
    const res = await createProceduralGenerator().generate(req('Eine Hütte mit einem Lagerfeuer'));
    const m = VoxelModel.fromJSON(res.model);
    const names = m.layers.map((l) => l.name);
    expect(names.some((n) => n.startsWith('Hütte:'))).toBe(true);
    expect(names.some((n) => n.startsWith('Lagerfeuer:'))).toBe(true);
    expect(names).toContain('Sockel');
  });
});

describe('LLM-Anbindung (ohne Netzwerk)', () => {
  it('wandelt eine strukturierte LLM-Antwort in einen gültigen Blueprint', () => {
    const llm = JSON.stringify({
      title: 'Leuchtturm', style: 'fantasy', base: 'sand', mood: 'night', notes: ['Test'],
      objects: [
        { archetype: 'tower', variant: 'tower', label: 'Leuchtturm', scale: 1, placement: 'center', features: ['flag'], colors: [{ slot: 'roof', hex: '#C83232' }], primitives: [] },
        { archetype: 'custom', variant: '', label: 'Boot', scale: 0.5, placement: 'right', features: [], colors: [],
          primitives: [{ shape: 'box', at: [0, 0.1, 0], size: [0.6, 0.2, 0.3], color: '#8a5a34', material: 'diffuse', part: 'Rumpf' }, { shape: 'cylinder', at: [0, 0.2, 0], size: [0.05, 0.6, 0.05], color: '#eeeeee', material: 'diffuse', part: 'Mast' }] },
        { archetype: 'unknown-thing', variant: '', label: 'x', scale: 1, placement: 'left', features: [], colors: [], primitives: [] },
      ],
    });
    const request = req('Ein Leuchtturm am Strand mit einem Boot');
    const bp = sanitizeBlueprint(fromLlmJson('```json\n' + llm + '\n```'), request);
    expect(bp.objects).toHaveLength(2);
    expect(bp.objects[0].colors.roof).toBe('#c83232');
    const result = buildFromBlueprint(bp, request, 1, 'test');
    const m = VoxelModel.fromJSON(result.model);
    expect(m.layers.map((l) => l.name)).toEqual(expect.arrayContaining(['Boot: Rumpf', 'Boot: Mast']));
    expect(m.size).toBeGreaterThan(100);
  });
});
