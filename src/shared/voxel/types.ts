/**
 * Grundlegende Typen der Voxel-Datenstruktur.
 *
 * Diese Datei ist bewusst frei von DOM- oder Three.js-Abhängigkeiten, damit sie
 * sowohl im Browser (Editor) als auch im Node-Backend (Generierung) genutzt
 * werden kann.
 */

/** Materialtypen eines Voxels. Bestimmen das Rendering und den Export. */
export type MaterialType = 'diffuse' | 'metal' | 'emissive' | 'glass';

export const MATERIAL_TYPES: readonly MaterialType[] = ['diffuse', 'metal', 'emissive', 'glass'];

/**
 * Ein einzelner Voxel.
 *
 * Farben werden – wie in MagicaVoxel – als Index in die Palette des Modells
 * gespeichert. Dadurch lässt sich eine Farbe global ändern und die Palette
 * bleibt bewusst begrenzt (Pixel-Art-Look).
 */
export interface Voxel {
  x: number;
  y: number;
  z: number;
  /** Palettenindex (0..255). */
  c: number;
  /** Material. */
  m: MaterialType;
  /** Ebenen-ID (siehe {@link Layer}). */
  l: number;
  /**
   * Optionale Beleuchtungsinformation: Leuchtstärke 0..1 für emissive Voxel
   * (z.B. Feuer, Kristalle, Fenster). Wird beim Rendering als Glow verwendet.
   */
  e?: number;
}

/** Eine Ebene gruppiert Voxel semantisch (z.B. "Körper", "Flügel", "Schwert"). */
export interface Layer {
  id: number;
  name: string;
  /**
   * Semantische Rolle, wird vom Animationssystem genutzt
   * (z.B. "leg_left", "arm_right", "weapon", "flame", "wing_left").
   */
  role?: string;
  visible: boolean;
  locked: boolean;
}

/** Achsen-ausgerichtete Bounding-Box (inklusive Grenzen). */
export interface Bounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** Eine einzelne aufgezeichnete Änderung (für Undo/Redo und Animationen). */
export interface VoxelChange {
  key: number;
  before: Voxel | null;
  after: Voxel | null;
}

export type Axis = 'x' | 'y' | 'z';
