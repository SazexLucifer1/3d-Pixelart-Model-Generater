import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { Viewport } from '../render/Viewport';
import type { VoxelModel } from '../../shared/voxel/VoxelModel';
import { writeObj } from '../../shared/formats/obj';
import { writeVox, readVox } from '../../shared/formats/vox';
import { imageToVoxels, parseObj, voxelizeTriangles } from '../../shared/formats/voxelize';
import { createProject, parseProject, type ProjectFile } from '../../shared/project/project';
import { applyFrame } from '../../shared/animation/animation';
import type { AnimationClip } from '../../shared/animation/types';
import { useEditor } from '../state/editorStore';

/**
 * Export- und Importfunktionen des Editors.
 */

export function download(data: Blob | string, filename: string, type = 'application/octet-stream'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || 'voxel_model'
  );
}

function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG-Erzeugung fehlgeschlagen'))), 'image/png'));
}

// -------------------------------------------------------------------- Export

export async function exportPng(vp: Viewport, name: string, width: number, height: number, transparent: boolean, fit = false): Promise<void> {
  const canvas = vp.renderToCanvas(width, height, { transparent, fit });
  download(await canvasToBlob(canvas), `${slug(name)}.png`);
}

/** Kleines Vorschaubild für den Generierungsverlauf. */
export function thumbnail(vp: Viewport): string {
  return vp.renderToCanvas(160, 120, { transparent: false, fit: true }).toDataURL('image/png');
}

/**
 * Sprite-Sheet: Zeilen = Blickrichtungen, Spalten = Animationsframes.
 * Zusätzlich wird eine JSON-Beschreibung (Frame-Rechtecke) erzeugt.
 */
export async function exportSpriteSheet(
  vp: Viewport,
  model: VoxelModel,
  name: string,
  opts: { cell: number; directions: 1 | 4 | 8; clip: AnimationClip | null; transparent: boolean },
): Promise<void> {
  const frames = opts.clip ? opts.clip.frames : [null];
  const cols = frames.length;
  const rows = opts.directions;
  const sheet = document.createElement('canvas');
  sheet.width = cols * opts.cell;
  sheet.height = rows * opts.cell;
  const ctx = sheet.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const meta: { frames: Record<string, { x: number; y: number; w: number; h: number; direction: number; frame: number }>; meta: Record<string, unknown> } = {
    frames: {},
    meta: { image: `${slug(name)}_sheet.png`, size: { w: sheet.width, h: sheet.height }, cell: opts.cell, fps: opts.clip?.fps ?? 1, animation: opts.clip?.name ?? 'static', directions: rows },
  };
  const original = useEditor.getState().model;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const f = frames[c];
      vp.setModel(f ? applyFrame(model, f) : model);
      vp.flush();
      const img = vp.renderToCanvas(opts.cell, opts.cell, { transparent: opts.transparent, cameraAngle: (r / rows) * Math.PI * 2, fit: true });
      ctx.drawImage(img, c * opts.cell, r * opts.cell);
      meta.frames[`dir${r}_frame${c}`] = { x: c * opts.cell, y: r * opts.cell, w: opts.cell, h: opts.cell, direction: Math.round((r / rows) * 360), frame: c };
    }
  }
  vp.setModel(original);
  vp.flush();
  download(await canvasToBlob(sheet), `${slug(name)}_sheet.png`);
  download(JSON.stringify(meta, null, 2), `${slug(name)}_sheet.json`, 'application/json');
}

export async function exportGltf(vp: Viewport, model: VoxelModel, name: string, binary = true): Promise<void> {
  const group = vp.buildExportGroup(model);
  group.name = name;
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(group, { binary });
  if (binary) download(new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' }), `${slug(name)}.glb`);
  else download(JSON.stringify(result, null, 2), `${slug(name)}.gltf`, 'model/gltf+json');
}

export function exportObj(model: VoxelModel, name: string): void {
  const base = slug(name);
  const { obj, mtl } = writeObj(model, base);
  download(obj, `${base}.obj`, 'text/plain');
  setTimeout(() => download(mtl, `${base}.mtl`, 'text/plain'), 300);
}

export function exportVox(model: VoxelModel, name: string): void {
  const bytes = writeVox(model);
  download(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }), `${slug(name)}.vox`);
}

export function buildProjectFile(): ProjectFile {
  const s = useEditor.getState();
  return createProject(s.model, {
    name: s.projectName,
    prompt: s.prompt,
    animations: s.animations,
    request: s.lastRequest ?? undefined,
    blueprint: s.blueprint ?? undefined,
    seed: s.lastSeed ?? undefined,
    editor: { renderStyle: s.renderStyle, render: s.render, gen: s.gen },
  });
}

export function exportProject(): void {
  const p = buildProjectFile();
  download(JSON.stringify(p), `${slug(p.name)}.voxproj.json`, 'application/json');
}

// -------------------------------------------------------------------- Import

export async function importFile(file: File): Promise<void> {
  const s = useEditor.getState();
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.json')) {
    const { project, model } = parseProject(await file.text());
    s.replaceModel(model, `Projekt geladen: ${project.name}`, {
      animations: project.animations,
      projectName: project.name,
      prompt: project.generation?.prompt ?? s.prompt,
      blueprint: project.generation?.blueprint ?? null,
      lastRequest: project.generation?.request ?? null,
      lastSeed: project.generation?.seed ?? null,
    });
    const ed = project.editor as { renderStyle?: string; gen?: typeof s.gen } | undefined;
    if (ed?.renderStyle) s.setRenderStyle(ed.renderStyle as never);
    if (ed?.gen) s.set({ gen: { ...s.gen, ...ed.gen } });
    return;
  }
  if (lower.endsWith('.vox')) {
    const model = readVox(new Uint8Array(await file.arrayBuffer()));
    s.replaceModel(model, `VOX importiert: ${file.name}`, { projectName: file.name.replace(/\.vox$/i, ''), blueprint: null });
    return;
  }
  if (lower.endsWith('.obj')) {
    const mesh = parseObj(await file.text());
    const model = voxelizeTriangles(mesh, s.gen.size, 32);
    s.replaceModel(model, `OBJ voxelisiert: ${file.name}`, { projectName: file.name.replace(/\.obj$/i, ''), blueprint: null });
    return;
  }
  if (/\.(png|jpe?g|gif|webp)$/.test(lower)) {
    const img = await loadImage(file);
    const max = s.gen.size;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const model = imageToVoxels(data, w, h, { mode: 'inflate', depth: Math.max(2, Math.round(max / 8)), maxColors: 32 });
    s.replaceModel(model, `Bild extrudiert: ${file.name}`, { projectName: file.name.replace(/\.\w+$/, ''), blueprint: null });
    return;
  }
  throw new Error('Unbekanntes Dateiformat (unterstützt: .voxproj.json, .vox, .obj, .png/.jpg)');
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Bild konnte nicht geladen werden'));
    img.src = URL.createObjectURL(file);
  });
}
