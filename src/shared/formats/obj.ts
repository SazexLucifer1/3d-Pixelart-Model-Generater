import type { VoxelModel } from '../voxel/VoxelModel';
import { meshModel } from './mesher';
import { hexToRgb } from '../palette/color';

/**
 * Wavefront-OBJ-Export mit MTL-Datei.
 * - Vertex-Farben (`v x y z r g b`, von Blender/MeshLab unterstützt)
 * - Zusätzlich je Palettenfarbe ein Material (usemtl) für andere Programme
 * - Vierecke statt Dreiecken (Low-Poly-Voxel-Look bleibt erhalten)
 */
export function writeObj(model: VoxelModel, name = 'voxel_model'): { obj: string; mtl: string } {
  const meshes = meshModel(model, { ao: false });
  const lines: string[] = [`# Voxel Forge OBJ Export`, `# Voxel: ${model.size}`, `mtllib ${name}.mtl`, `o ${name}`];
  const normals = ['vn 1 0 0', 'vn -1 0 0', 'vn 0 1 0', 'vn 0 -1 0', 'vn 0 0 1', 'vn 0 0 -1'];
  lines.push(...normals);
  const normalIndex = (x: number, y: number, z: number) => (x === 1 ? 1 : x === -1 ? 2 : y === 1 ? 3 : y === -1 ? 4 : z === 1 ? 5 : 6);
  const quadsByColor = new Map<number, string[]>();
  let vOffset = 0;
  for (const md of meshes) {
    for (let i = 0; i < md.positions.length; i += 3) {
      const ci = i;
      lines.push(`v ${fmt(md.positions[i])} ${fmt(md.positions[i + 1])} ${fmt(md.positions[i + 2])} ${fmt(md.colors[ci])} ${fmt(md.colors[ci + 1])} ${fmt(md.colors[ci + 2])}`);
    }
    const quads = md.positions.length / 12;
    for (let q = 0; q < quads; q++) {
      const base = vOffset + q * 4 + 1;
      const ni = normalIndex(md.normals[q * 12], md.normals[q * 12 + 1], md.normals[q * 12 + 2]);
      const c = md.faceColors[q];
      if (!quadsByColor.has(c)) quadsByColor.set(c, []);
      quadsByColor.get(c)!.push(`f ${base}//${ni} ${base + 1}//${ni} ${base + 2}//${ni} ${base + 3}//${ni}`);
    }
    vOffset += md.positions.length / 3;
  }
  const mtl: string[] = ['# Voxel Forge MTL'];
  for (const [c, faces] of quadsByColor) {
    lines.push(`usemtl color_${c}`, ...faces);
    const [r, g, b] = hexToRgb(model.palette[c] ?? '#ff00ff').map((v) => v / 255);
    mtl.push(`newmtl color_${c}`, `Kd ${fmt(r)} ${fmt(g)} ${fmt(b)}`, 'Ka 0 0 0', 'Ks 0 0 0', 'd 1', 'illum 1', '');
  }
  return { obj: lines.join('\n') + '\n', mtl: mtl.join('\n') };
}

const fmt = (n: number) => (Math.round(n * 10000) / 10000).toString();
