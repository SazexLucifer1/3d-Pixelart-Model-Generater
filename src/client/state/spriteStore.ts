import { create } from 'zustand';
import type { SpriteDoc, IndexedImage } from '../../shared/sprite/types';
import { serializeSpriteDoc, parseSpriteDoc, type SerializedSpriteDoc } from '../../shared/sprite/types';

/**
 * Zustand des 2D-Pixel-Editors (Aseprite-ähnlich).
 * Das Dokument ist veränderlich (Performance); Änderungen erhöhen `rev`.
 */

export type PixelTool = 'pencil' | 'eraser' | 'fill' | 'pick' | 'line' | 'rect' | 'move';

type Edit =
  | { label: string; kind: 'frame'; anim: number; frame: number; before: Uint8Array; after: Uint8Array }
  | { label: string; kind: 'doc'; before: SerializedSpriteDoc; after: SerializedSpriteDoc };

export interface SpriteState {
  doc: SpriteDoc | null;
  assetId: string | null;
  rev: number;
  anim: number;
  frame: number;
  tool: PixelTool;
  color: number;
  brush: number;
  mirror: boolean;
  onion: boolean;
  grid: boolean;
  zoom: number;
  playing: boolean;
  undoStack: Edit[];
  redoStack: Edit[];

  load: (doc: SpriteDoc, assetId: string | null) => void;
  set: (p: Partial<SpriteState>) => void;
  bump: () => void;
  currentFrame: () => IndexedImage | null;
  beginFrameEdit: () => void;
  endFrameEdit: (label: string) => void;
  /** Strukturelle Änderung (Frames/Animationen/Palette) mit Undo. */
  docEdit: (label: string, fn: (doc: SpriteDoc) => void) => void;
  undo: () => void;
  redo: () => void;
}

let editSnapshot: { anim: number; frame: number; data: Uint8Array } | null = null;

export const useSprite = create<SpriteState>((set, get) => ({
  doc: null,
  assetId: null,
  rev: 0,
  anim: 0,
  frame: 0,
  tool: 'pencil',
  color: 1,
  brush: 1,
  mirror: false,
  onion: false,
  grid: true,
  zoom: 0,
  playing: false,
  undoStack: [],
  redoStack: [],

  load: (doc, assetId) => set((s) => ({ doc, assetId, anim: 0, frame: 0, rev: s.rev + 1, undoStack: [], redoStack: [], playing: false, zoom: 0, color: Math.min(Math.max(1, s.color), doc.palette.length || 1) })),
  set: (p) => set(p),
  bump: () => set((s) => ({ rev: s.rev + 1 })),
  currentFrame: () => {
    const { doc, anim, frame } = get();
    return doc?.animations[anim]?.frames[frame] ?? null;
  },
  beginFrameEdit: () => {
    const f = get().currentFrame();
    if (f) editSnapshot = { anim: get().anim, frame: get().frame, data: new Uint8Array(f.data) };
  },
  endFrameEdit: (label) => {
    const { doc } = get();
    const snap = editSnapshot;
    editSnapshot = null;
    if (!doc || !snap) return;
    const f = doc.animations[snap.anim]?.frames[snap.frame];
    if (!f) return;
    let changed = false;
    for (let i = 0; i < f.data.length; i++) if (f.data[i] !== snap.data[i]) { changed = true; break; }
    if (!changed) return;
    doc.animations[snap.anim].edited = true;
    set((s) => ({ undoStack: [...s.undoStack.slice(-199), { label, kind: 'frame', anim: snap.anim, frame: snap.frame, before: snap.data, after: new Uint8Array(f.data) }], redoStack: [], rev: s.rev + 1 }));
  },
  docEdit: (label, fn) => {
    const { doc } = get();
    if (!doc) return;
    const before = serializeSpriteDoc(doc);
    fn(doc);
    const after = serializeSpriteDoc(doc);
    set((s) => ({
      undoStack: [...s.undoStack.slice(-99), { label, kind: 'doc', before, after }],
      redoStack: [],
      rev: s.rev + 1,
      anim: Math.min(s.anim, Math.max(0, doc.animations.length - 1)),
      frame: Math.min(s.frame, Math.max(0, (doc.animations[Math.min(s.anim, doc.animations.length - 1)]?.frames.length ?? 1) - 1)),
    }));
  },
  undo: () => {
    const { undoStack, doc } = get();
    const e = undoStack[undoStack.length - 1];
    if (!e || !doc) return;
    applyEdit(e, true, set, get);
    set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, e], rev: s.rev + 1 }));
  },
  redo: () => {
    const { redoStack, doc } = get();
    const e = redoStack[redoStack.length - 1];
    if (!e || !doc) return;
    applyEdit(e, false, set, get);
    set((s) => ({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, e], rev: s.rev + 1 }));
  },
}));

function applyEdit(e: Edit, reverse: boolean, set: (p: Partial<SpriteState>) => void, get: () => SpriteState): void {
  const doc = get().doc!;
  if (e.kind === 'frame') {
    const f = doc.animations[e.anim]?.frames[e.frame];
    if (f) f.data.set(reverse ? e.before : e.after);
    set({ anim: e.anim, frame: e.frame });
  } else {
    const restored = parseSpriteDoc(reverse ? e.before : e.after);
    Object.assign(doc, restored);
    set({ anim: Math.min(get().anim, Math.max(0, doc.animations.length - 1)), frame: 0 });
  }
}
