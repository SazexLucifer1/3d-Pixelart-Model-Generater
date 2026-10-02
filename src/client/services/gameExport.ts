import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { download } from './exporters';
import { spritePackage, projectPackage, zipFiles, slugify, paletteGpl, type FileMap } from '../../shared/sprite/package';
import { layoutSheet, composeSheet, sheetMetadata } from '../../shared/sprite/sheet';
import { encodeIndexedPng } from '../../shared/formats/pngEncode';
import { parseSpriteDoc, type SpriteDoc } from '../../shared/sprite/types';
import type { GameAsset, GameProject } from '../../shared/library/gameProject';
import { godotFolder } from '../../shared/sprite/godot';
import { VoxelModel } from '../../shared/voxel/VoxelModel';
import { meshModel } from '../../shared/formats/mesher';
import { toGeometry } from '../render/Viewport';

/**
 * Exporte für 2D-Assets und komplette Spielprojekte (Godot-Struktur).
 */

const blob = (bytes: Uint8Array, type: string) => new Blob([bytes as BlobPart], { type });

export function exportSheetPng(doc: SpriteDoc, name: string): void {
  download(blob(encodeIndexedPng(composeSheet(doc), doc.palette), 'image/png'), `${slugify(name)}.png`);
}

export function exportSheetMeta(doc: SpriteDoc, name: string, category: string): void {
  const layout = layoutSheet(doc);
  download(JSON.stringify(sheetMetadata(doc, layout, { name, image: `${slugify(name)}.png`, category }), null, 2), `${slugify(name)}_metadata.json`, 'application/json');
}

export function exportFramesZip(doc: SpriteDoc, name: string, category: string): void {
  const files = spritePackage(doc, { name, category, dir: slugify(name) });
  download(blob(zipFiles(files), 'application/zip'), `${slugify(name)}_frames.zip`);
}

export function exportPalette(doc: SpriteDoc, name: string): void {
  download(paletteGpl(name, doc.palette), `${slugify(name)}.gpl`, 'text/plain');
}

/** GLB eines Voxelmodells (Three.js GLTFExporter). */
async function glbBytes(model: VoxelModel): Promise<Uint8Array> {
  const group = new THREE.Group();
  for (const md of meshModel(model, { ao: false })) {
    const mat =
      md.material === 'emissive' ? new THREE.MeshBasicMaterial({ vertexColors: true })
        : new THREE.MeshStandardMaterial({ vertexColors: true, metalness: md.material === 'metal' ? 0.6 : 0, roughness: md.material === 'metal' ? 0.35 : 0.9, transparent: md.material === 'glass', opacity: md.material === 'glass' ? 0.55 : 1 });
    group.add(new THREE.Mesh(toGeometry(md), mat));
  }
  const res = await new GLTFExporter().parseAsync(group, { binary: true });
  return new Uint8Array(res as ArrayBuffer);
}

async function glbFor(asset: GameAsset): Promise<FileMap> {
  if (!asset.voxel) return {};
  const slug = slugify(asset.name);
  return { [`assets/models/${godotFolder(asset.category)}/${slug}/${slug}.glb`]: await glbBytes(VoxelModel.fromJSON(asset.voxel.model)) };
}

export async function exportAssetGodot(asset: GameAsset, project: GameProject): Promise<void> {
  const single: GameProject = { ...project, assets: [asset], profiles: project.profiles.filter((p) => p.id === asset.profileId) };
  const files = projectPackage(single, await glbFor(asset));
  download(blob(zipFiles(files), 'application/zip'), `${slugify(asset.name)}_godot.zip`);
}

export async function exportProjectGodot(project: GameProject): Promise<void> {
  const extra: FileMap = {};
  for (const a of project.assets) Object.assign(extra, await glbFor(a));
  const files = projectPackage(project, extra);
  download(blob(zipFiles(files), 'application/zip'), `${slugify(project.name)}_godot.zip`);
}

export function spriteDocOf(asset: GameAsset): SpriteDoc | null {
  return asset.sprite ? parseSpriteDoc(asset.sprite) : null;
}
