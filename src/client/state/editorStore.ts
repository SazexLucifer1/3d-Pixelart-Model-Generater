import { create } from 'zustand';
import { VoxelModel, type SerializedModel } from '../../shared/voxel/VoxelModel';
import type { Layer, MaterialType, VoxelChange } from '../../shared/voxel/types';
import type { AnimationClip } from '../../shared/animation/types';
import type { DetailLevel, GenerationRequest, GenerationResult, SceneBlueprint } from '../../shared/ai/types';
import { STYLE_PRESETS, type PaletteId, type StyleId } from '../../shared/palette/styles';
import type { ViewportSettings } from '../render/Viewport';

/**
 * Zentraler Editor-Zustand.
 *
 * Das VoxelModel ist bewusst ein veränderliches Objekt (Performance bei
 * großen Modellen). Änderungen laufen immer über `commit()`, das
 *  - die Änderungen für Undo/Redo aufzeichnet und
 *  - `revision` erhöht, damit React-Komponenten neu rendern.
 */

export type ToolId = 'attach' | 'erase' | 'paint' | 'pick' | 'select' | 'wand' | 'move' | 'box' | 'orbit';

export interface HistoryEntry {
  label: string;
  changes: VoxelChange[];
  paletteBefore?: string[];
  paletteAfter?: string[];
  layersBefore?: Layer[];
  layersAfter?: Layer[];
  /** Vollständiger Austausch (z.B. neue Generierung). */
  snapshotBefore?: SerializedModel;
  snapshotAfter?: SerializedModel;
  animationsBefore?: AnimationClip[];
  animationsAfter?: AnimationClip[];
  selectionBefore: number[];
  selectionAfter: number[];
}

export interface GenerationHistoryItem {
  id: string;
  prompt: string;
  request: GenerationRequest;
  result: GenerationResult;
  thumbnail?: string;
  createdAt: number;
}

export interface GenerationSettings {
  style: StyleId | 'auto';
  size: number;
  palette: PaletteId;
  detail: DetailLevel;
  seed: number | null;
  generator: string;
}

export interface EditorState {
  model: VoxelModel;
  revision: number;
  projectName: string;
  prompt: string;
  blueprint: SceneBlueprint | null;
  lastRequest: GenerationRequest | null;
  lastSeed: number | null;

  tool: ToolId;
  colorIndex: number;
  material: MaterialType;
  brushSize: number;
  mirrorX: boolean;
  activeLayer: number;
  selection: Set<number>;
  hover: string;

  gen: GenerationSettings;
  generating: boolean;
  generationError: string | null;
  generationHistory: GenerationHistoryItem[];

  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  animations: AnimationClip[];
  activeClip: string | null;
  playing: boolean;
  frame: number;

  renderStyle: StyleId;
  render: ViewportSettings;

  // Aktionen
  commit: (label: string, fn: (m: VoxelModel) => Set<number> | void, opts?: { keepSelection?: boolean }) => void;
  beginStroke: () => void;
  endStroke: (label: string) => void;
  undo: () => void;
  redo: () => void;
  replaceModel: (model: VoxelModel, label: string, extra?: Partial<Pick<EditorState, 'animations' | 'blueprint' | 'projectName' | 'prompt' | 'lastRequest' | 'lastSeed'>>) => void;
  setSelection: (sel: Set<number>) => void;
  bump: () => void;
  set: (partial: Partial<EditorState>) => void;
  setRenderStyle: (style: StyleId) => void;
  setRender: (partial: Partial<ViewportSettings>) => void;
}

function settingsFromStyle(style: StyleId, prev?: ViewportSettings): ViewportSettings {
  const r = STYLE_PRESETS[style].render;
  return { ...r, showGrid: prev?.showGrid ?? true, ao: prev?.ao ?? true };
}

/** Aktive Aufzeichnung eines Pinselstrichs (mehrere Pointer-Events → ein Undo-Schritt). */
let strokeSelectionBefore: number[] | null = null;

export const useEditor = create<EditorState>((set, get) => ({
  model: new VoxelModel(),
  revision: 0,
  projectName: 'Unbenannt',
  prompt: 'Ein kleiner Fantasy-Krieger mit grüner Rüstung, Schwert und Umhang im Stil eines alten JRPGs',
  blueprint: null,
  lastRequest: null,
  lastSeed: null,

  tool: 'attach',
  colorIndex: 0,
  material: 'diffuse',
  brushSize: 1,
  mirrorX: false,
  activeLayer: 0,
  selection: new Set(),
  hover: '',

  gen: { style: 'auto', size: 24, palette: 'style', detail: 2, seed: null, generator: 'auto' },
  generating: false,
  generationError: null,
  generationHistory: [],

  undoStack: [],
  redoStack: [],

  animations: [],
  activeClip: null,
  playing: false,
  frame: 0,

  renderStyle: 'fantasy',
  render: settingsFromStyle('fantasy'),

  commit: (label, fn, opts) => {
    const { model, selection } = get();
    const paletteBefore = [...model.palette];
    const layersBefore = model.layers.map((l) => ({ ...l }));
    model.beginRecording();
    let newSel: Set<number> | void = undefined;
    try {
      newSel = fn(model);
    } finally {
      const changes = model.endRecording();
      const paletteChanged = JSON.stringify(paletteBefore) !== JSON.stringify(model.palette);
      const layersChanged = JSON.stringify(layersBefore) !== JSON.stringify(model.layers);
      const nextSel = newSel instanceof Set ? newSel : opts?.keepSelection ? selection : pruneSelection(model, selection);
      if (changes.length || paletteChanged || layersChanged || newSel instanceof Set) {
        const entry: HistoryEntry = {
          label,
          changes,
          selectionBefore: [...selection],
          selectionAfter: [...nextSel],
        };
        if (paletteChanged) {
          entry.paletteBefore = paletteBefore;
          entry.paletteAfter = [...model.palette];
        }
        if (layersChanged) {
          entry.layersBefore = layersBefore;
          entry.layersAfter = model.layers.map((l) => ({ ...l }));
        }
        if (changes.length || paletteChanged || layersChanged) {
          set((s) => ({ undoStack: [...s.undoStack.slice(-199), entry], redoStack: [] }));
        }
      }
      set((s) => ({ selection: nextSel, revision: s.revision + 1 }));
    }
  },

  beginStroke: () => {
    const { model, selection } = get();
    if (model.isRecording) return;
    strokeSelectionBefore = [...selection];
    model.beginRecording();
  },

  endStroke: (label) => {
    const { model, selection } = get();
    if (!model.isRecording) return;
    const changes = model.endRecording();
    if (changes.length) {
      const entry: HistoryEntry = { label, changes, selectionBefore: strokeSelectionBefore ?? [], selectionAfter: [...selection] };
      set((s) => ({ undoStack: [...s.undoStack.slice(-199), entry], redoStack: [] }));
    }
    strokeSelectionBefore = null;
    set((s) => ({ revision: s.revision + 1 }));
  },

  undo: () => {
    const { undoStack, model } = get();
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    applyEntry(model, entry, true, set);
    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, entry],
      selection: new Set(entry.selectionBefore),
      revision: s.revision + 1,
    }));
  },

  redo: () => {
    const { redoStack, model } = get();
    const entry = redoStack[redoStack.length - 1];
    if (!entry) return;
    applyEntry(model, entry, false, set);
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, entry],
      selection: new Set(entry.selectionAfter),
      revision: s.revision + 1,
    }));
  },

  replaceModel: (next, label, extra = {}) => {
    const { model, selection, animations } = get();
    const entry: HistoryEntry = {
      label,
      changes: [],
      snapshotBefore: model.toJSON(),
      snapshotAfter: next.toJSON(),
      animationsBefore: animations,
      animationsAfter: extra.animations ?? [],
      selectionBefore: [...selection],
      selectionAfter: [],
    };
    // Modell-Objekt bleibt dasselbe (Viewport hält Referenz) → Inhalt ersetzen
    loadInto(model, entry.snapshotAfter!);
    set((s) => ({
      ...extra,
      animations: extra.animations ?? [],
      activeClip: null,
      playing: false,
      frame: 0,
      selection: new Set(),
      activeLayer: model.layers[0]?.id ?? 0,
      colorIndex: Math.min(s.colorIndex, Math.max(0, model.palette.length - 1)),
      undoStack: [...s.undoStack.slice(-199), entry],
      redoStack: [],
      revision: s.revision + 1,
    }));
  },

  setSelection: (sel) => set((s) => ({ selection: sel, revision: s.revision + 1 })),
  bump: () => set((s) => ({ revision: s.revision + 1 })),
  set: (partial) => set(partial),
  setRenderStyle: (style) => set((s) => ({ renderStyle: style, render: settingsFromStyle(style, s.render) })),
  setRender: (partial) => set((s) => ({ render: { ...s.render, ...partial } })),
}));

/** Ersetzt den Inhalt eines Modells durch einen Snapshot (gleiche Referenz). */
export function loadInto(model: VoxelModel, data: SerializedModel): void {
  const fresh = VoxelModel.fromJSON(data);
  model.clear();
  model.palette = [...fresh.palette];
  model.layers = fresh.layers.map((l) => ({ ...l }));
  for (const v of fresh.values()) model.setVoxel(v);
  model.version++;
}

function applyEntry(model: VoxelModel, e: HistoryEntry, reverse: boolean, set: (p: Partial<EditorState>) => void): void {
  if (e.snapshotBefore && e.snapshotAfter) {
    loadInto(model, reverse ? e.snapshotBefore : e.snapshotAfter);
    set({ animations: (reverse ? e.animationsBefore : e.animationsAfter) ?? [], activeClip: null, playing: false });
    return;
  }
  model.applyChanges(e.changes, reverse);
  const pal = reverse ? e.paletteBefore : e.paletteAfter;
  if (pal) model.palette = [...pal];
  const layers = reverse ? e.layersBefore : e.layersAfter;
  if (layers) model.layers = layers.map((l) => ({ ...l }));
  model.version++;
}

function pruneSelection(model: VoxelModel, sel: Set<number>): Set<number> {
  let changed = false;
  const out = new Set<number>();
  for (const k of sel) {
    if (model.hasKey(k)) out.add(k);
    else changed = true;
  }
  return changed ? out : sel;
}
