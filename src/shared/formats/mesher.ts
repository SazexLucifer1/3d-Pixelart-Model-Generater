import type { VoxelModel } from '../voxel/VoxelModel';
import { packKey } from '../voxel/VoxelModel';
import type { MaterialType, Voxel } from '../voxel/types';
import { hexToRgb } from '../palette/color';

/**
 * Wandelt ein Voxelmodell in Dreiecksnetze um (ohne Three.js-Abhängigkeit,
 * damit es auch für OBJ/GLTF-Export und im Backend nutzbar ist).
 *
 * - Nur sichtbare Flächen werden erzeugt (Face Culling zwischen Nachbarn)
 * - Ein Netz pro Material (diffuse/metal/emissive/glass)
 * - Optionale Voxel-Ambient-Occlusion pro Eckpunkt (klassischer Voxel-Look)
 * - Ein Voxel belegt den Würfel [x-0.5, x+0.5] (Zentrum auf ganzen Zahlen)
 */

export interface MeshData {
  material: MaterialType;
  positions: number[];
  normals: number[];
  colors: number[]; // linear 0..1 (sRGB-Werte, Konvertierung beim Rendern)
  indices: number[];
  /** Palettenindex pro Fläche (für OBJ-Materialgruppen). */
  faceColors: number[];
  /** Leuchtstärke pro Eckpunkt (für emissive Voxel). */
  emission: number[];
}

export interface MeshOptions {
  ao?: boolean;
  /** Stärke der AO-Abdunklung 0..1 */
  aoStrength?: number;
  /** Nur Voxel sichtbarer Ebenen. */
  visibleOnly?: boolean;
}

// Flächen: Normale, 4 Ecken (gegen den Uhrzeigersinn von außen gesehen)
const FACES: { n: [number, number, number]; corners: [number, number, number][] }[] = [
  { n: [1, 0, 0], corners: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], corners: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], corners: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], corners: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

export function meshModel(model: VoxelModel, opts: MeshOptions = {}): MeshData[] {
  const ao = opts.ao ?? true;
  const aoStrength = opts.aoStrength ?? 0.45;
  const visibleOnly = opts.visibleOnly ?? true;
  const hidden = new Set(model.layers.filter((l) => !l.visible).map((l) => l.id));
  const isVisible = (v: Voxel | undefined) => !!v && (!visibleOnly || !hidden.has(v.l));
  const solidAt = (x: number, y: number, z: number) => {
    const v = model.getByKey(packKey(x, y, z));
    return isVisible(v) && v!.m !== 'glass';
  };
  const paletteRgb = model.palette.map((h) => hexToRgb(h).map((c) => c / 255));

  const meshes = new Map<MaterialType, MeshData>();
  const get = (m: MaterialType) => {
    let d = meshes.get(m);
    if (!d) {
      d = { material: m, positions: [], normals: [], colors: [], indices: [], faceColors: [], emission: [] };
      meshes.set(m, d);
    }
    return d;
  };

  for (const v of model.values()) {
    if (!isVisible(v)) continue;
    const rgb = paletteRgb[v.c] ?? [1, 0, 1];
    for (const face of FACES) {
      const [nx, ny, nz] = face.n;
      const nb = model.getByKey(packKey(v.x + nx, v.y + ny, v.z + nz));
      if (isVisible(nb)) {
        // Fläche verdeckt, außer Glas grenzt an Nicht-Glas
        if (nb!.m !== 'glass' || v.m === 'glass') continue;
      }
      const d = get(v.m);
      const base = d.positions.length / 3;
      const aoVals: number[] = [];
      for (const [cx, cy, cz] of face.corners) {
        d.positions.push(v.x + cx * 0.5, v.y + cy * 0.5, v.z + cz * 0.5);
        d.normals.push(nx, ny, nz);
        let shadeF = 1;
        if (ao && v.m !== 'emissive') {
          // Die zwei Seitennachbarn + Ecknachbar auf der Außenseite der Fläche
          const ox = v.x + nx, oy = v.y + ny, oz = v.z + nz;
          let s1: boolean, s2: boolean, corner: boolean;
          if (nx !== 0) {
            s1 = solidAt(ox, v.y + cy, v.z); s2 = solidAt(ox, v.y, v.z + cz); corner = solidAt(ox, v.y + cy, v.z + cz);
          } else if (ny !== 0) {
            s1 = solidAt(v.x + cx, oy, v.z); s2 = solidAt(v.x, oy, v.z + cz); corner = solidAt(v.x + cx, oy, v.z + cz);
          } else {
            s1 = solidAt(v.x + cx, v.y, oz); s2 = solidAt(v.x, v.y + cy, oz); corner = solidAt(v.x + cx, v.y + cy, oz);
          }
          const occ = s1 && s2 ? 3 : (s1 ? 1 : 0) + (s2 ? 1 : 0) + (corner ? 1 : 0);
          shadeF = 1 - (occ / 3) * aoStrength;
        }
        aoVals.push(shadeF);
        d.colors.push(rgb[0] * shadeF, rgb[1] * shadeF, rgb[2] * shadeF);
        d.emission.push(v.m === 'emissive' ? v.e ?? 0.8 : 0);
      }
      // Diagonale so wählen, dass AO-Verläufe nicht "verdreht" aussehen
      if (aoVals[0] + aoVals[2] < aoVals[1] + aoVals[3]) {
        d.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      } else {
        d.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      d.faceColors.push(v.c);
    }
  }
  return [...meshes.values()];
}
