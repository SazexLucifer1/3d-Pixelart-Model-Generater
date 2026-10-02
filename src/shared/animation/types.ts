/**
 * Animationen werden als Veränderungen der Voxel-Struktur gespeichert:
 * Jeder Frame enthält nur die Differenz zum Basismodell (gesetzte und
 * entfernte Voxel). Dadurch bleiben Animationen klein, sind exakt
 * reproduzierbar und funktionieren mit jedem Voxelmodell.
 */

export interface AnimationFrame {
  /** Gesetzte/geänderte Voxel als Tupel [x, y, z, c, materialIndex, layer, emission?]. */
  set: number[][];
  /** Entfernte Voxel (gepackte Schlüssel, siehe packKey). */
  remove: number[];
  /** Dauer dieses Frames in ms (optional, sonst 1000/fps). */
  duration?: number;
}

export type AnimationKind = 'idle' | 'walk' | 'attack' | 'fly' | 'flicker' | 'bounce' | 'spin' | 'custom';

export interface AnimationClip {
  id: string;
  name: string;
  kind: AnimationKind;
  fps: number;
  loop: boolean;
  frames: AnimationFrame[];
}
