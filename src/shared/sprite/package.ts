import { zipSync, strToU8 } from 'fflate';
import type { SpriteDoc } from './types';
import { layoutSheet, composeSheet, sheetMetadata, animKey } from './sheet';
import { spriteFramesTres, tileSetTres, godotFolder } from './godot';
import { encodeIndexedPng } from '../formats/pngEncode';
import type { GameAsset, GameProject } from '../library/gameProject';
import { parseSpriteDoc } from './types';
import { VoxelModel } from '../voxel/VoxelModel';
import { writeObj } from '../formats/obj';
import { writeVox } from '../formats/vox';
import type { StyleProfile } from '../style/profile';

/**
 * Export-Pakete für Game-Engines (Godot-Ordnerstruktur res://assets/…).
 *
 *   assets/characters/ranger/ranger.png        Sprite Sheet
 *   assets/characters/ranger/ranger.tres       Godot SpriteFrames
 *   assets/characters/ranger/metadata.json     Frames, FPS, Positionen …
 *   assets/characters/ranger/frames/*.png      Einzelframes
 */

export type FileMap = Record<string, Uint8Array>;

export function slugify(name: string): string {
  return (
    name.toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'asset'
  );
}

export interface PackageInfo {
  name: string;
  category: string;
  prompt?: string;
  profile?: string;
  /** Basisordner im Godot-Projekt (Standard: assets/<kategorie>/<slug>). */
  dir?: string;
}

/** Sheet-PNG, Metadaten, Godot-Ressource und Einzelframes eines 2D-Assets. */
export function spritePackage(doc: SpriteDoc, info: PackageInfo, opts: { frames?: boolean } = {}): FileMap {
  const slug = slugify(info.name);
  const dir = info.dir ?? `assets/${godotFolder(info.category)}/${slug}`;
  const layout = layoutSheet(doc);
  const files: FileMap = {};
  files[`${dir}/${slug}.png`] = encodeIndexedPng(composeSheet(doc, layout), doc.palette);
  files[`${dir}/metadata.json`] = strToU8(JSON.stringify(sheetMetadata(doc, layout, { name: info.name, image: `${slug}.png`, category: info.category, prompt: info.prompt, profile: info.profile }), null, 2));
  const res = `res://${dir}/${slug}.png`;
  if (doc.atlas?.tileSize && doc.atlas.regions.some((r) => r.kind !== 'ui' && r.kind !== 'icon')) files[`${dir}/${slug}.tres`] = strToU8(tileSetTres(doc, res));
  else if (!doc.atlas) files[`${dir}/${slug}.tres`] = strToU8(spriteFramesTres(layout, res));
  if (opts.frames !== false && !doc.atlas) {
    for (const a of doc.animations) a.frames.forEach((f, i) => (files[`${dir}/frames/${animKey(a)}_${String(i).padStart(2, '0')}.png`] = encodeIndexedPng(f, doc.palette)));
  }
  if (doc.atlas) {
    // Atlas-Bereiche (UI-Elemente, Deko) zusätzlich einzeln
    for (const r of doc.atlas.regions.filter((x) => x.kind === 'ui' || x.kind === 'icon' || x.kind === 'deco')) {
      const src = doc.animations[0].frames[0];
      const img = { w: r.w, h: r.h, data: new Uint8Array(r.w * r.h) };
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) img.data[y * r.w + x] = src.data[(r.y + y) * src.w + r.x + x];
      files[`${dir}/parts/${slugify(r.name)}.png`] = encodeIndexedPng(img, doc.palette);
    }
  }
  return files;
}

/** OBJ/MTL/VOX + Metadaten eines 3D-Voxel-Assets (GLB ergänzt der Browser). */
export function voxelPackage(asset: GameAsset): FileMap {
  if (!asset.voxel) return {};
  const slug = slugify(asset.name);
  const dir = `assets/models/${godotFolder(asset.category)}/${slug}`;
  const model = VoxelModel.fromJSON(asset.voxel.model);
  const { obj, mtl } = writeObj(model, slug);
  const files: FileMap = {
    [`${dir}/${slug}.obj`]: strToU8(obj),
    [`${dir}/${slug}.mtl`]: strToU8(mtl),
    [`${dir}/${slug}.voxproj.json`]: strToU8(JSON.stringify({ format: 'voxel-forge-project', version: 1, name: asset.name, model: asset.voxel.model, animations: asset.voxel.animations, generation: { prompt: asset.prompt, blueprint: asset.voxel.blueprint, seed: asset.voxel.seed } })),
    [`${dir}/metadata.json`]: strToU8(JSON.stringify({ name: asset.name, category: asset.category, prompt: asset.prompt, voxels: model.size, palette: model.palette, layers: model.layers.map((l) => ({ name: l.name, role: l.role })) }, null, 2)),
  };
  try {
    files[`${dir}/${slug}.vox`] = writeVox(model);
  } catch {
    /* zu groß für .vox */
  }
  return files;
}

/** GIMP/Aseprite-Palette (.gpl). */
export function paletteGpl(name: string, colors: string[]): string {
  return ['GIMP Palette', `Name: ${name}`, 'Columns: 8', '#', ...colors.map((c) => {
    const n = parseInt(c.slice(1), 16);
    return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}\t${c}`;
  })].join('\n') + '\n';
}

export function profilePackage(profile: StyleProfile): FileMap {
  const slug = slugify(profile.name);
  return {
    [`assets/style/${slug}.style.json`]: strToU8(JSON.stringify(profile, null, 2)),
    ...(profile.palette.colors.length ? { [`assets/style/${slug}.gpl`]: strToU8(paletteGpl(profile.name, profile.palette.colors)) } : {}),
  };
}

const GODOT_README = `Voxel Forge – Godot-Export
==========================

Ordner "assets" in das Godot-Projekt (res://) kopieren.

Pixel-Art scharf darstellen:
  Projekteinstellungen → Rendering → Texturen → Standard-Texturfilter = "Nearest"

Charaktere / Effekte:
  AnimatedSprite2D anlegen → Sprite Frames → Laden → <name>.tres
  Animationen heißen z.B. "walk_down", "attack_left" (Name_Richtung).

Tilesets:
  TileMapLayer → Tile Set → Laden → <name>.tres
  Terrain-Set 0 (Modus "Match Corners") ist eingerichtet → Terrain-Malen nutzt die Übergänge.

UI:
  Einzelteile liegen unter parts/. Panels/Buttons als NinePatchRect verwenden
  (Ränder siehe metadata.json → regions[].nineSlice).

3D:
  OBJ/GLB unter assets/models/ – MagicaVoxel-Dateien (.vox) bleiben editierbar.
`;

/** Komplettes Spielprojekt als Godot-Paket. GLB-Dateien können ergänzt werden. */
export function projectPackage(project: GameProject, extra: FileMap = {}): FileMap {
  const files: FileMap = { 'README_GODOT.txt': strToU8(GODOT_README) };
  const used = new Set<string>();
  for (const asset of project.assets) {
    let name = asset.name;
    for (let i = 2; used.has(`${asset.category}/${slugify(name)}`); i++) name = `${asset.name} ${i}`;
    used.add(`${asset.category}/${slugify(name)}`);
    const profile = project.profiles.find((p) => p.id === asset.profileId)?.name;
    if (asset.sprite) Object.assign(files, spritePackage(parseSpriteDoc(asset.sprite), { name, category: asset.category, prompt: asset.prompt, profile }));
    if (asset.voxel) Object.assign(files, voxelPackage({ ...asset, name }));
  }
  for (const p of project.profiles) Object.assign(files, profilePackage(p));
  files['assets/project.json'] = strToU8(JSON.stringify({ name: project.name, assets: project.assets.map((a) => ({ name: a.name, category: a.category, kind: a.kind, prompt: a.prompt, createdAt: a.createdAt })) }, null, 2));
  return { ...files, ...extra };
}

export function zipFiles(files: FileMap): Uint8Array {
  return zipSync(files, { level: 6 });
}
