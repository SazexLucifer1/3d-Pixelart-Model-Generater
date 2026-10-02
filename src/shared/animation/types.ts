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

export type AnimationKind =
  // Charaktere
  | 'idle' | 'walk' | 'run' | 'sneak' | 'jump' | 'attack' | 'block' | 'dodge' | 'cast' | 'hurt' | 'death' | 'victory' | 'interact'
  // Kreaturen & Objekte
  | 'fly' | 'flicker' | 'bounce' | 'spin' | 'open' | 'machine' | 'wind' | 'wave' | 'smoke' | 'water'
  | 'custom';

export interface AnimationClip {
  id: string;
  name: string;
  kind: AnimationKind;
  fps: number;
  loop: boolean;
  frames: AnimationFrame[];
}
