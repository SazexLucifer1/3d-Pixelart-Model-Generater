import { describe, expect, it } from 'vitest';
import { deflateSync, inflateSync } from 'node:zlib';
import { VoxelModel } from '../src/shared/voxel/VoxelModel';
import { writeVox, readVox } from '../src/shared/formats/vox';
import { writeObj } from '../src/shared/formats/obj';
import { meshModel } from '../src/shared/formats/mesher';
import { imageToVoxels, parseObj, voxelizeTriangles } from '../src/shared/formats/voxelize';
import { decodePng } from '../src/shared/formats/png';
import { createProject, parseProject } from '../src/shared/project/project';
import { createProceduralGenerator } from '../src/shared/ai/generators';
import { applyFrame, makeFrame, diffModels } from '../src/shared/animation/animation';

function cube(n: number): VoxelModel {
  const m = new VoxelModel(['#c8323c', '#3a62c8']);
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) m.set(x, y, z, (x + y + z) % 2);
  return m;
}

describe('Mesher', () => {
  it('erzeugt nur sichtbare Flächen', () => {
    const [mesh] = meshModel(cube(3), { ao: false });
    // 3×3×3-Würfel: 6 Seiten × 9 Flächen = 54 Quads
    expect(mesh.positions.length / 12).toBe(54);
    expect(mesh.indices.length).toBe(54 * 6);
  });
  it('trennt Netze nach Material', () => {
    const m = cube(2);
    m.set(5, 0, 0, 0, 'emissive', 0, 1);
    expect(meshModel(m).map((d) => d.material).sort()).toEqual(['diffuse', 'emissive']);
  });
});

describe('MagicaVoxel .vox', () => {
  it('Rundreise Schreiben → Lesen erhält Form und Farben', () => {
    const m = cube(3);
    m.set(0, 3, 0, 1);
    const back = readVox(writeVox(m));
    expect(back.size).toBe(m.size);
    expect(new Set(back.palette)).toEqual(new Set(m.palette));
    expect(back.bounds()!.maxY - back.bounds()!.minY).toBe(3);
  });
});

describe('OBJ', () => {
  it('schreibt Vertices mit Farbe, Normalen, Flächen und Materialien', () => {
    const { obj, mtl } = writeObj(cube(2), 'test');
    expect(obj).toMatch(/^v -?[\d.]+ -?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+ [\d.]+$/m);
    expect(obj).toMatch(/^f \d+\/\/\d+ \d+\/\/\d+ \d+\/\/\d+ \d+\/\/\d+$/m);
    expect(obj).toContain('mtllib test.mtl');
    expect(mtl).toContain('newmtl color_0');
    // OBJ wieder einlesen und voxelisieren
    const re = voxelizeTriangles(parseObj(obj), 8);
    expect(re.size).toBeGreaterThan(20);
  });
});

describe('Bild → Voxel', () => {
  it('extrudiert undurchsichtige Pixel', () => {
    const w = 4, h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set(i % 2 ? [255, 0, 0, 255] : [0, 0, 0, 0], i * 4);
    const flat = imageToVoxels(data, w, h, { mode: 'flat', depth: 1 });
    expect(flat.size).toBe(8);
    const thick = imageToVoxels(data, w, h, { mode: 'flat', depth: 3 });
    expect(thick.size).toBe(8 * 3);
  });

  it('dekodiert PNG (RGBA) inkl. Sub-, Up- und Paeth-Filter', () => {
    const w = 2, h = 3;
    // Zeile 0: Filter 1 (Sub): Pixel1 = (10,20,30,255), Pixel2 = Pixel1 + (5,5,5,0)
    // Zeile 1: Filter 2 (Up):  jeweils +1 gegenüber der Zeile darüber
    // Zeile 2: Filter 4 (Paeth) mit Delta 0 → übernimmt den Prädiktor
    const raw = Uint8Array.from([
      1, 10, 20, 30, 255, 5, 5, 5, 0,
      2, 1, 1, 1, 0, 1, 1, 1, 0,
      4, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const chunk = (type: string, data: Uint8Array) => {
      const b = Buffer.alloc(12 + data.length);
      b.writeUInt32BE(data.length, 0);
      b.write(type, 4, 'ascii');
      Buffer.from(data).copy(b, 8);
      return b;
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; // Bit-Tiefe
    ihdr[9] = 6; // RGBA
    const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]);
    const img = decodePng(png, (d) => inflateSync(d));
    expect([img.width, img.height]).toEqual([2, 3]);
    expect([...img.data.slice(0, 8)]).toEqual([10, 20, 30, 255, 15, 25, 35, 255]);
    expect([...img.data.slice(8, 16)]).toEqual([11, 21, 31, 255, 16, 26, 36, 255]);
    expect([...img.data.slice(16, 24)]).toEqual([11, 21, 31, 255, 16, 26, 36, 255]);
  });
});

describe('Projektformat', () => {
  it('speichert und lädt komplett editierbar', async () => {
    const res = await createProceduralGenerator().generate({ prompt: 'Ein Krieger mit Schwert', style: 'auto', size: 20, palette: 'style', detail: 2, seed: 5 });
    const model = VoxelModel.fromJSON(res.model);
    const file = createProject(model, { name: 'Test', prompt: 'Ein Krieger', animations: res.animations, blueprint: res.blueprint, seed: res.seed });
    const { project, model: loaded } = parseProject(JSON.stringify(file));
    expect(project.name).toBe('Test');
    expect(project.generation?.seed).toBe(5);
    expect(loaded.size).toBe(model.size);
    expect(loaded.layers).toEqual(model.layers);
    expect(project.animations.length).toBe(res.animations.length);
    expect(() => parseProject('{"format":"x"}')).toThrow();
  });
});

describe('Animationen', () => {
  it('speichert Frames als Voxel-Differenzen', async () => {
    const res = await createProceduralGenerator().generate({ prompt: 'Ein Ritter', style: 'auto', size: 24, palette: 'style', detail: 2, seed: 1 });
    const base = VoxelModel.fromJSON(res.model);
    const walk = res.animations.find((a) => a.kind === 'walk')!;
    expect(walk.frames.length).toBe(8);
    for (const f of walk.frames) {
      expect(f.set.length + f.remove.length).toBeGreaterThan(0);
      expect(f.set.length + f.remove.length).toBeLessThan(base.size);
      // Frame anwenden und Differenz erneut bilden ergibt denselben Frame
      const applied = applyFrame(base, f);
      const again = diffModels(base, applied);
      expect(again.set.length).toBe(f.set.length);
      expect(again.remove.length).toBe(f.remove.length);
    }
  });

  it('dreht Ebenen per Rotation ohne Löcher', () => {
    const m = new VoxelModel(['#fff']);
    const l = m.addLayer('Arm', 'arm_right');
    for (let y = 0; y < 6; y++) m.set(0, y, 0, 0, 'diffuse', l.id);
    const f = makeFrame(m, [{ roles: ['arm_right'], rotate: { axis: 'x', deg: 90, pivot: [0, 5, 0] } }]);
    const rotated = applyFrame(m, f);
    expect(rotated.size).toBe(6);
  });
});
