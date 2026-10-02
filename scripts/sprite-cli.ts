/**
 * Sprite-Sheet-Generierung auf der Kommandozeile:
 *   npm run sprite -- "Ein Waldläufer mit Bogen" [größe] [ausgabeordner]
 * Erzeugt PNG-Sheet, metadata.json und Godot-SpriteFrames (.tres).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProfile, parseStyleText } from '../src/shared/style/profile';
import { spriteFromPrompt } from '../src/shared/sprite/spriteGenerator';
import { layoutSheet, composeSheet, sheetMetadata } from '../src/shared/sprite/sheet';
import { encodeIndexedPng } from '../src/shared/formats/pngEncode';
import { spriteFramesTres } from '../src/shared/sprite/godot';

const prompt = process.argv[2] ?? 'Ein Waldläufer mit grüner Lederrüstung und Bogen';
const size = Number(process.argv[3] ?? 32);
const out = process.argv[4] ?? 'sprite-out';
const styleText = process.argv[5];
const profile = styleText ? parseStyleText(styleText).profile : createProfile();
const t0 = Date.now();
const { doc } = spriteFromPrompt({
  prompt, size, profile, seed: 7,
  animations: [
    { id: 'idle', frames: 4, fps: 6 }, { id: 'walk', frames: 8, fps: 10 }, { id: 'attack', frames: 6, fps: 12 },
    { id: 'hurt', frames: 3, fps: 10 }, { id: 'death', frames: 6, fps: 8 },
  ],
});
const layout = layoutSheet(doc);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'sheet.png'), encodeIndexedPng(composeSheet(doc, layout), doc.palette));
writeFileSync(join(out, 'metadata.json'), JSON.stringify(sheetMetadata(doc, layout, { name: 'sprite', image: 'sheet.png' }), null, 2));
writeFileSync(join(out, 'sprite.tres'), spriteFramesTres(layout, 'res://sheet.png'));
console.log(`${doc.animations.length} Animationen, ${layout.width}x${layout.height}, ${doc.palette.length} Farben, ${Date.now() - t0} ms`);
