/**
 * Kommandozeilen-Generator – nützlich zum Testen der Generierung ohne UI.
 *   npm run generate -- "Ein roter Drache" [größe] [stil]
 */
import { writeFileSync } from 'node:fs';
import { createProceduralGenerator } from '../src/shared/ai/generators';
import { createProject } from '../src/shared/project/project';
import { VoxelModel } from '../src/shared/voxel/VoxelModel';
import type { StyleId } from '../src/shared/palette/styles';

const prompt = process.argv[2] ?? 'Ein kleiner Fantasy-Krieger mit grüner Rüstung, Schwert und Umhang';
const size = Number(process.argv[3] ?? 24);
const style = (process.argv[4] ?? 'auto') as StyleId | 'auto';

const gen = createProceduralGenerator();
const res = await gen.generate({ prompt, size, style, palette: 'style', detail: 2, seed: 42 });
const model = VoxelModel.fromJSON(res.model);
console.log(res.blueprint.notes.join('\n'));
console.log(`Voxel: ${model.size}, Farben: ${model.palette.length}, Ebenen: ${model.layers.map((l) => l.name).join(', ')}`);
console.log(`Animationen: ${res.animations.map((a) => `${a.name}(${a.frames.length})`).join(', ')} · ${res.durationMs} ms`);
if (process.argv.includes('--save')) {
  const project = createProject(model, { name: res.blueprint.title, prompt, animations: res.animations });
  writeFileSync('generated.voxproj.json', JSON.stringify(project));
  console.log('gespeichert: generated.voxproj.json');
}
