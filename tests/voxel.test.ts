import { describe, expect, it } from 'vitest';
import { VoxelModel, packKey, unpackKey } from '../src/shared/voxel/VoxelModel';
import * as T from '../src/shared/voxel/transforms';

function sampleModel(): VoxelModel {
  const m = new VoxelModel(['#ff0000', '#00ff00', '#0000ff']);
  // L-förmiges Objekt (asymmetrisch → Rotation/Spiegelung prüfbar)
  m.set(0, 0, 0, 0);
  m.set(1, 0, 0, 1);
  m.set(2, 0, 0, 1);
  m.set(0, 1, 0, 2);
  m.set(0, 2, 0, 2);
  m.set(0, 0, 1, 0, 'metal');
  return m;
}
const keysOf = (m: VoxelModel) => new Set(m.keys());
const signature = (m: VoxelModel) => [...m.values()].map((v) => `${v.x},${v.y},${v.z},${v.c},${v.m}`).sort().join('|');

describe('VoxelModel', () => {
  it('packt und entpackt Koordinaten verlustfrei', () => {
    for (const p of [[0, 0, 0], [-512, 511, -1], [123, -45, 67]] as const) {
      expect(unpackKey(packKey(p[0], p[1], p[2]))).toEqual(p);
    }
  });

  it('setzt, liest und entfernt Voxel', () => {
    const m = sampleModel();
    expect(m.size).toBe(6);
    expect(m.get(0, 0, 1)?.m).toBe('metal');
    expect(m.remove(0, 0, 1)).toBe(true);
    expect(m.has(0, 0, 1)).toBe(false);
    expect(m.bounds()).toEqual({ minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 2, maxZ: 0 });
  });

  it('zeichnet Änderungen für Undo/Redo auf', () => {
    const m = sampleModel();
    const before = signature(m);
    m.beginRecording();
    m.set(5, 5, 5, 1);
    m.remove(0, 0, 0);
    m.set(1, 0, 0, 2);
    m.set(9, 9, 9, 0);
    m.remove(9, 9, 9); // netto keine Änderung
    const changes = m.endRecording();
    expect(changes).toHaveLength(3);
    const after = signature(m);
    m.applyChanges(changes, true);
    expect(signature(m)).toBe(before);
    m.applyChanges(changes, false);
    expect(signature(m)).toBe(after);
  });

  it('serialisiert und lädt verlustfrei (inkl. Ebenen und Emission)', () => {
    const m = sampleModel();
    const layer = m.addLayer('Flammen', 'flame');
    m.set(3, 3, 3, 0, 'emissive', layer.id, 0.75);
    const copy = VoxelModel.fromJSON(JSON.parse(JSON.stringify(m.toJSON())));
    expect(signature(copy)).toBe(signature(m));
    expect(copy.get(3, 3, 3)).toMatchObject({ m: 'emissive', l: layer.id, e: 0.75 });
    expect(copy.findLayerByRole('flame')?.name).toBe('Flammen');
  });

  it('bereinigt und ummappt die Palette', () => {
    const m = new VoxelModel(['#111111', '#222222', '#333333']);
    m.set(0, 0, 0, 2);
    m.compactPalette();
    expect(m.palette).toEqual(['#333333']);
    expect(m.get(0, 0, 0)?.c).toBe(0);
    m.set(1, 0, 0, m.colorIndex('#444444'));
    m.remapColors(() => '#ffffff');
    expect(m.palette).toEqual(['#ffffff']);
  });

  it('zentriert das Modell auf dem Boden', () => {
    const m = new VoxelModel(['#fff']);
    m.set(10, 5, 10, 0);
    m.set(12, 7, 14, 0);
    m.normalizePosition();
    const b = m.bounds()!;
    expect(b.minY).toBe(0);
    expect(b.minX + b.maxX).toBeLessThanOrEqual(1);
  });
});

describe('Transformationen', () => {
  it('verschiebt eine Auswahl', () => {
    const m = sampleModel();
    const sel = T.moveSelection(m, keysOf(m), 1, 2, 3);
    expect(sel.size).toBe(6);
    expect(m.has(1, 2, 3)).toBe(true);
    expect(m.has(0, 0, 0)).toBe(false);
  });

  it('4× Drehen um jede Achse ergibt das Original', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      const m = sampleModel();
      const orig = signature(m);
      let sel = keysOf(m);
      for (let i = 0; i < 4; i++) sel = T.rotateSelection(m, sel, axis, 1);
      expect(signature(m)).toBe(orig);
      expect(m.size).toBe(6);
    }
  });

  it('Drehung ist umkehrbar (+1 dann −1)', () => {
    const m = sampleModel();
    const orig = signature(m);
    const s1 = T.rotateSelection(m, keysOf(m), 'y', 1);
    T.rotateSelection(m, s1, 'y', -1);
    expect(signature(m)).toBe(orig);
  });

  it('2× Spiegeln ergibt das Original', () => {
    const m = sampleModel();
    const orig = signature(m);
    const s1 = T.mirrorSelection(m, keysOf(m), 'x');
    expect(signature(m)).not.toBe(orig);
    T.mirrorSelection(m, s1, 'x');
    expect(signature(m)).toBe(orig);
  });

  it('skaliert mit Nearest-Neighbor (×2 = 8-fache Voxelzahl, ×0.5 zurück)', () => {
    const m = new VoxelModel(['#fff']);
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) m.set(x, y, z, 0);
    const s2 = T.scaleSelection(m, keysOf(m), 2);
    expect(m.size).toBe(64);
    T.scaleSelection(m, s2, 0.5);
    expect(m.size).toBe(8);
  });

  it('dupliziert, kopiert und fügt ein', () => {
    const m = sampleModel();
    const dup = T.duplicateSelection(m, keysOf(m), 10, 0, 0);
    expect(dup.size).toBe(6);
    expect(m.size).toBe(12);
    const clip = T.copyToClipboard(m, dup)!;
    T.pasteClipboard(m, clip, 0, 20, 0);
    expect(m.size).toBe(18);
  });

  it('Zauberstab wählt zusammenhängende gleiche Farbe', () => {
    const m = sampleModel();
    const sel = T.floodSelect(m, packKey(1, 0, 0));
    expect(sel.size).toBe(2);
    expect(T.selectByColor(m, 2).size).toBe(2);
  });
});
