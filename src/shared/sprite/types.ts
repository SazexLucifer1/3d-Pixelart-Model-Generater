import type { SerializedModel } from '../voxel/VoxelModel';
import type { SceneBlueprint } from '../ai/types';
import type { ViewMode } from '../style/profile';

/**
 * 2D-Pixel-Art-Datenmodell.
 *
 * Alle 2D-Assets (Charakter-Sprites, Items, Tiles, Effekte, UI) sind
 * indizierte Bilder: Jeder Pixel ist ein Palettenindex (0 = transparent,
 * k = palette[k-1]). Dadurch ist die Palette pro Asset gesperrt und
 * Farbänderungen wirken konsistent auf alle Frames.
 */

export interface IndexedImage {
  w: number;
  h: number;
  data: Uint8Array;
}

export type Direction = 'down' | 'down_right' | 'right' | 'up_right' | 'up' | 'up_left' | 'left' | 'down_left' | 'none';

/** Gierwinkel (Grad) je Blickrichtung; 0 = Figur schaut zur Kamera. */
export const DIRECTION_YAW: Record<Direction, number> = {
  down: 0, down_right: 45, right: 90, up_right: 135, up: 180, up_left: 225, left: 270, down_left: 315, none: 0,
};
export const DIRECTION_LABEL: Record<Direction, string> = {
  down: 'unten', down_right: 'unten-rechts', right: 'rechts', up_right: 'oben-rechts', up: 'oben', up_left: 'oben-links', left: 'links', down_left: 'unten-links', none: '–',
};

export function directionsFor(count: number, view: ViewMode): Direction[] {
  if (count <= 1) return ['down'];
  if (view === 'side' && count <= 4) return ['right', 'left'];
  if (count >= 8) return ['down', 'down_right', 'right', 'up_right', 'up', 'up_left', 'left', 'down_left'];
  return ['down', 'left', 'right', 'up'];
}

export interface SpriteAnimation {
  id: string;
  /** Animationsname (z.B. "walk"), wird für Godot mit Richtung kombiniert. */
  name: string;
  direction: Direction;
  fps: number;
  loop: boolean;
  frames: IndexedImage[];
  /** true, wenn Frames von Hand verändert wurden. */
  edited?: boolean;
}

/** Bereich in einem Atlas (Tiles, UI-Elemente). */
export interface SpriteRegion {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'tile' | 'transition' | 'deco' | 'animated' | 'ui' | 'icon';
  /** Terrain-Ecken für Auto-Tiling (oben-links, oben-rechts, unten-links, unten-rechts). */
  corners?: [number, number, number, number];
  terrain?: number;
  /** Anzahl Animationsframes (Spalten rechts daneben). */
  frames?: number;
  /** 9-Slice-Ränder für UI-Panels. */
  nineSlice?: [number, number, number, number];
}

/** Render-Einstellungen, die für alle Frames eines Assets fix bleiben (Style Lock). */
export interface SpriteRenderSettings {
  view: ViewMode;
  ppv: number;
  /** Pixel-Anker des Modellbodens (Mitte), für alle Frames identisch. */
  anchor: [number, number];
  /** Weltpunkt des Ankers (Modellmitte am Boden). */
  origin: [number, number, number];
  profileId?: string;
}

/** Quelle eines generierten Sprites – erlaubt neue Animationen mit identischem Aussehen. */
export interface SpriteSource {
  model: SerializedModel;
  archetype: string;
  blueprint?: SceneBlueprint;
  seed?: number;
  render: SpriteRenderSettings;
}

export interface SpriteDoc {
  width: number;
  height: number;
  palette: string[];
  animations: SpriteAnimation[];
  source?: SpriteSource;
  atlas?: {
    tileSize?: number;
    regions: SpriteRegion[];
    terrains?: { name: string; color: string }[];
  };
}

// ------------------------------------------------------------- Serialisierung

export interface SerializedSpriteDoc extends Omit<SpriteDoc, 'animations'> {
  animations: (Omit<SpriteAnimation, 'frames'> & { frames: string[] })[];
}

export function encodeFrame(img: IndexedImage): string {
  let s = '';
  for (let i = 0; i < img.data.length; i++) s += String.fromCharCode(img.data[i]);
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(img.data).toString('base64');
}

export function decodeFrame(b64: string, w: number, h: number): IndexedImage {
  let data: Uint8Array;
  if (typeof atob === 'function') {
    const s = atob(b64);
    data = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) data[i] = s.charCodeAt(i);
  } else data = new Uint8Array(Buffer.from(b64, 'base64'));
  if (data.length !== w * h) {
    const fixed = new Uint8Array(w * h);
    fixed.set(data.subarray(0, w * h));
    data = fixed;
  }
  return { w, h, data };
}

export function serializeSpriteDoc(doc: SpriteDoc): SerializedSpriteDoc {
  return { ...doc, animations: doc.animations.map((a) => ({ ...a, frames: a.frames.map(encodeFrame) })) };
}

export function parseSpriteDoc(s: SerializedSpriteDoc): SpriteDoc {
  return {
    ...s,
    animations: s.animations.map((a) => ({ ...a, frames: a.frames.map((f) => decodeFrame(f, s.width, s.height)) })),
  };
}
