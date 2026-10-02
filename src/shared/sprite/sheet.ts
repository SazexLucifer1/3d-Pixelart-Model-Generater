import type { IndexedImage, SpriteAnimation, SpriteDoc } from './types';
import { createImage, blit } from './indexed';

/**
 * Sprite-Sheet-Layout: eine Zeile pro (Animation, Richtung), Spalten =
 * Frames. Atlas-Dokumente (Tilesets, UI) sind bereits ein Sheet.
 */

export interface SheetFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  duration: number;
}

export interface SheetAnimation {
  name: string;
  /** Name für Godot/Engines, z.B. "walk_down". */
  key: string;
  direction: string;
  fps: number;
  loop: boolean;
  row: number;
  frames: SheetFrame[];
}

export interface SheetLayout {
  width: number;
  height: number;
  frameWidth: number;
  frameHeight: number;
  animations: SheetAnimation[];
}

export function animKey(a: Pick<SpriteAnimation, 'name' | 'direction'>): string {
  return a.direction && a.direction !== 'none' ? `${a.name}_${a.direction}` : a.name;
}

export function layoutSheet(doc: SpriteDoc): SheetLayout {
  if (doc.atlas) {
    const a = doc.animations[0];
    return {
      width: doc.width, height: doc.height, frameWidth: doc.width, frameHeight: doc.height,
      animations: a ? [{ name: a.name, key: animKey(a), direction: a.direction, fps: a.fps, loop: a.loop, row: 0, frames: [{ x: 0, y: 0, w: doc.width, h: doc.height, duration: 1000 / a.fps }] }] : [],
    };
  }
  const cols = Math.max(1, ...doc.animations.map((a) => a.frames.length));
  const anims = doc.animations.map((a, row) => ({
    name: a.name,
    key: animKey(a),
    direction: a.direction,
    fps: a.fps,
    loop: a.loop,
    row,
    frames: a.frames.map((_, i) => ({ x: i * doc.width, y: row * doc.height, w: doc.width, h: doc.height, duration: Math.round(1000 / a.fps) })),
  }));
  return { width: cols * doc.width, height: Math.max(1, doc.animations.length) * doc.height, frameWidth: doc.width, frameHeight: doc.height, animations: anims };
}

export function composeSheet(doc: SpriteDoc, layout = layoutSheet(doc)): IndexedImage {
  if (doc.atlas) return doc.animations[0]?.frames[0] ?? createImage(doc.width, doc.height);
  const sheet = createImage(layout.width, layout.height);
  doc.animations.forEach((a, row) => a.frames.forEach((f, i) => blit(sheet, f, i * doc.width, row * doc.height)));
  return sheet;
}

/** Metadaten-Datei (Frame-Größe, Anzahl, Name, Geschwindigkeit, Positionen). */
export function sheetMetadata(doc: SpriteDoc, layout: SheetLayout, info: { name: string; image: string; category?: string; prompt?: string; profile?: string }) {
  return {
    generator: 'Voxel Forge',
    name: info.name,
    category: info.category,
    prompt: info.prompt,
    styleProfile: info.profile,
    image: info.image,
    size: { w: layout.width, h: layout.height },
    frameSize: { w: layout.frameWidth, h: layout.frameHeight },
    palette: doc.palette,
    animations: layout.animations.map((a) => ({
      name: a.name,
      key: a.key,
      direction: a.direction,
      frameCount: a.frames.length,
      fps: a.fps,
      speed: a.fps,
      loop: a.loop,
      frames: a.frames,
    })),
    regions: doc.atlas?.regions,
    tileSize: doc.atlas?.tileSize,
  };
}
