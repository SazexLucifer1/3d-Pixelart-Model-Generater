import { useEditor } from '../state/editorStore';
import * as T from '../../shared/voxel/transforms';
import type { Axis, MaterialType } from '../../shared/voxel/types';
import { generateAnimations } from '../../shared/animation/animation';

/**
 * Editor-Aktionen (Auswahl-Operationen, Zwischenablage, Ebenen …).
 * Jede Aktion ist ein eigener Undo-Schritt.
 */

const st = () => useEditor.getState();
let clipboard: T.VoxelClipboard | null = null;

function withSelection(label: string, fn: (keys: Set<number>) => Set<number> | void): void {
  const { selection, commit } = st();
  if (selection.size === 0) return;
  commit(label, () => fn(selection) ?? undefined);
}

export const actions = {
  move: (dx: number, dy: number, dz: number) => withSelection('Verschieben', (sel) => T.moveSelection(st().model, sel, dx, dy, dz)),
  duplicate: () => withSelection('Duplizieren', (sel) => {
    const b = T.selectionBounds(st().model, sel)!;
    return T.duplicateSelection(st().model, sel, b.maxX - b.minX + 2, 0, 0);
  }),
  rotate: (axis: Axis, dir: 1 | -1 = 1) => withSelection(`Drehen ${axis.toUpperCase()}`, (sel) => T.rotateSelection(st().model, sel, axis, dir)),
  mirror: (axis: Axis) => withSelection(`Spiegeln ${axis.toUpperCase()}`, (sel) => T.mirrorSelection(st().model, sel, axis)),
  symmetrize: (axis: Axis) => withSelection(`Symmetrisch kopieren ${axis.toUpperCase()}`, (sel) => T.symmetrizeSelection(st().model, sel, axis)),
  scale: (f: number) => withSelection(`Skalieren ×${f}`, (sel) => T.scaleSelection(st().model, sel, f)),
  remove: () => withSelection('Löschen', (sel) => {
    T.deleteSelection(st().model, sel);
    return new Set();
  }),
  recolor: () => withSelection('Umfärben', (sel) => {
    T.recolorSelection(st().model, sel, st().colorIndex);
    return sel;
  }),
  setMaterial: (m: MaterialType) => withSelection('Material ändern', (sel) => {
    T.setSelectionMaterial(st().model, sel, m);
    return sel;
  }),
  toLayer: (layerId: number) => withSelection('Auf Ebene verschieben', (sel) => {
    T.assignSelectionLayer(st().model, sel, layerId);
    return sel;
  }),

  copy: () => {
    const { model, selection } = st();
    clipboard = T.copyToClipboard(model, selection);
  },
  cut: () => {
    actions.copy();
    actions.remove();
  },
  paste: () => {
    if (!clipboard) return;
    const { model, selection, commit } = st();
    const b = T.selectionBounds(model, selection) ?? model.bounds();
    const ox = b ? b.maxX + 2 : 0;
    const oy = b ? b.minY : 0;
    const oz = b ? b.minZ : 0;
    const clip = clipboard;
    commit('Einfügen', (m) => T.pasteClipboard(m, clip, ox, oy, oz));
  },
  hasClipboard: () => clipboard !== null,

  selectAll: () => {
    const { model, setSelection } = st();
    const hidden = new Set(model.layers.filter((l) => !l.visible || l.locked).map((l) => l.id));
    const sel = new Set<number>();
    for (const [k, v] of model.entries()) if (!hidden.has(v.l)) sel.add(k);
    setSelection(sel);
  },
  deselect: () => st().setSelection(new Set()),
  invertSelection: () => {
    const { model, selection, setSelection } = st();
    const sel = new Set<number>();
    for (const k of model.keys()) if (!selection.has(k)) sel.add(k);
    setSelection(sel);
  },
  selectColor: (index: number) => st().setSelection(T.selectByColor(st().model, index)),
  selectLayer: (id: number) => st().setSelection(T.selectByLayer(st().model, id)),

  // ----------------------------------------------------------------- Ebenen
  addLayer: () => {
    let id = 0;
    st().commit('Neue Ebene', (m) => {
      id = m.addLayer(`Ebene ${m.layers.length + 1}`).id;
    }, { keepSelection: true });
    st().set({ activeLayer: id });
  },
  renameLayer: (id: number, name: string) => st().commit('Ebene umbenennen', (m) => {
    const l = m.getLayer(id);
    if (l) l.name = name;
  }, { keepSelection: true }),
  toggleLayer: (id: number, key: 'visible' | 'locked') => st().commit(key === 'visible' ? 'Sichtbarkeit' : 'Sperre', (m) => {
    const l = m.getLayer(id);
    if (l) l[key] = !l[key];
    m.version++;
  }, { keepSelection: true }),
  deleteLayer: (id: number) => {
    const { model } = st();
    if (model.layers.length <= 1) return;
    st().commit('Ebene löschen', (m) => {
      for (const [k, v] of [...m.entries()]) if (v.l === id) m.removeKey(k);
      m.layers = m.layers.filter((l) => l.id !== id);
      return new Set();
    });
    if (st().activeLayer === id) st().set({ activeLayer: st().model.layers[0].id });
  },
  mergeLayerDown: (id: number) => {
    const { model } = st();
    const idx = model.layers.findIndex((l) => l.id === id);
    if (idx <= 0) return;
    const target = model.layers[idx - 1].id;
    st().commit('Ebenen zusammenführen', (m) => {
      for (const v of [...m.values()]) if (v.l === id) m.setVoxel({ ...v, l: target });
      m.layers = m.layers.filter((l) => l.id !== id);
    });
  },

  // ---------------------------------------------------------------- Palette
  setPaletteColor: (index: number, hex: string) => st().commit('Farbe ändern', (m) => m.setPaletteColor(index, hex), { keepSelection: true }),
  addPaletteColor: (hex: string) => {
    let idx = 0;
    st().commit('Farbe hinzufügen', (m) => {
      if (m.palette.length >= 256) return;
      m.palette = [...m.palette, hex.toLowerCase()];
      idx = m.palette.length - 1;
    }, { keepSelection: true });
    st().set({ colorIndex: idx });
  },
  compactPalette: () => st().commit('Palette bereinigen', (m) => m.compactPalette(), { keepSelection: false }),

  // ------------------------------------------------------------- Animation
  regenerateAnimations: () => {
    const { model, blueprint } = st();
    const archetype = blueprint?.objects[0]?.archetype ?? 'custom';
    st().set({ animations: generateAnimations(model, archetype), activeClip: null, playing: false, frame: 0 });
  },
};

/** Füllt einen Quader mit der aktuellen Farbe (Box-Werkzeug). */
export function fillBox(a: [number, number, number], b: [number, number, number], erase: boolean): void {
  const { colorIndex, material, activeLayer, commit, mirrorX } = st();
  commit(erase ? 'Box löschen' : 'Box füllen', (m) => {
    const apply = (x: number, y: number, z: number) => {
      if (y < 0) return;
      if (erase) {
        const v = m.get(x, y, z);
        if (v && !m.getLayer(v.l)?.locked) m.remove(x, y, z);
      } else if (!m.has(x, y, z)) {
        m.set(x, y, z, colorIndex, material, activeLayer, material === 'emissive' ? 0.9 : undefined);
      }
    };
    for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++)
      for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++)
        for (let z = Math.min(a[2], b[2]); z <= Math.max(a[2], b[2]); z++) {
          apply(x, y, z);
          if (mirrorX) apply(-x, y, z);
        }
  }, { keepSelection: true });
}

