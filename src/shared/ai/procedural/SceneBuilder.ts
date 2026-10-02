import { VoxelModel } from '../../voxel/VoxelModel';
import type { Bounds } from '../../voxel/types';
import { Sculptor, hash3 } from './Sculptor';
import { makeContext } from './context';
import { OBJECT_LIBRARY } from './library';
import type { GenerationRequest, SceneBlueprint, ObjectSpec } from '../types';
import { STYLE_PRESETS, PALETTES, applyStyleColor, mapToPalette, type StylePreset } from '../../palette/styles';
import { reduceColors, shade } from '../../palette/color';

/**
 * Baut aus einem SceneBlueprint ein echtes Voxelmodell.
 *
 * Ablauf:
 *  1. Jedes Objekt wird mit seinem Builder in ein eigenes Modell gezeichnet
 *  2. Objekte werden nebeneinander platziert (ohne Überlappung)
 *  3. Optionaler Diorama-Sockel
 *  4. Stil-Farbtransformation + Palettenbegrenzung
 */
export function buildScene(blueprint: SceneBlueprint, request: GenerationRequest, seed: number): VoxelModel {
  const style = STYLE_PRESETS[blueprint.style] ?? STYLE_PRESETS.fantasy;
  const size = clamp(Math.round(request.size), 8, 128);
  const important = new Set<string>();

  // 1. Objekte einzeln bauen
  const parts: { spec: ObjectSpec; model: VoxelModel }[] = [];
  blueprint.objects.forEach((spec, i) => {
    const entry = OBJECT_LIBRARY[spec.archetype] ?? OBJECT_LIBRARY.custom;
    const m = new VoxelModel();
    const s = new Sculptor(m, seed + i * 7919, request.detail);
    const H = Math.max(6, Math.round(size * (spec.scale || 1)));
    entry.build(makeContext(s, spec, H, style, blueprint));
    s.importantColors.forEach((c) => important.add(c));
    if (m.size > 0) {
      m.normalizePosition();
      parts.push({ spec, model: m });
    }
  });

  const scene = new VoxelModel();
  scene.layers = [];
  const baseH = blueprint.base !== 'none' ? Math.max(2, Math.round(size / 12)) : 0;
  const gap = Math.max(2, Math.round(size / 8));
  const multi = parts.length > 1;

  // 2. Platzierung
  let acc: Bounds | null = null;
  for (const { spec, model } of parts) {
    const b = model.bounds()!;
    let dx = 0, dz = 0;
    if (acc) {
      switch (spec.placement) {
        case 'left':
          dx = acc.minX - gap - b.maxX;
          dz = Math.round((acc.maxZ - b.maxZ) * 0.6);
          break;
        case 'front':
          dz = acc.maxZ + gap - b.minZ;
          break;
        case 'back':
          dz = acc.minZ - gap - b.maxZ;
          break;
        case 'right':
        default:
          dx = acc.maxX + gap - b.minX;
          dz = Math.round((acc.maxZ - b.maxZ) * 0.6);
      }
    }
    mergeInto(scene, model, dx, baseH, dz, multi ? spec.label ?? OBJECT_LIBRARY[spec.archetype]?.name : undefined);
    const nb = { minX: b.minX + dx, maxX: b.maxX + dx, minY: b.minY, maxY: b.maxY, minZ: b.minZ + dz, maxZ: b.maxZ + dz };
    acc = acc ? union(acc, nb) : nb;
  }
  if (scene.layers.length === 0) scene.layers.push({ id: 0, name: 'Basis', visible: true, locked: false });

  // 3. Sockel
  if (baseH > 0 && acc) buildBase(scene, acc, baseH, blueprint.base, request.detail, seed, size);

  // 4. Stil + Palette
  finalizePalette(scene, style, request, important);
  scene.compactPalette();
  scene.normalizePosition();
  return scene;
}

function mergeInto(scene: VoxelModel, part: VoxelModel, dx: number, dy: number, dz: number, prefix?: string): void {
  const layerMap = new Map<number, number>();
  for (const l of part.layers) {
    const name = prefix ? `${prefix}: ${l.name}` : l.name;
    let target = scene.layers.find((x) => x.name === name);
    if (!target) target = scene.addLayer(name, l.role);
    layerMap.set(l.id, target.id);
  }
  for (const v of part.values()) {
    scene.setVoxel({ ...v, x: v.x + dx, y: v.y + dy, z: v.z + dz, c: scene.colorIndex(part.palette[v.c]), l: layerMap.get(v.l) ?? 0 });
  }
}

function buildBase(scene: VoxelModel, b: Bounds, h: number, kind: SceneBlueprint['base'], detail: number, seed: number, size: number): void {
  const margin = Math.max(2, Math.round(size / 8));
  const x0 = b.minX - margin, x1 = b.maxX + margin, z0 = b.minZ - margin, z1 = b.maxZ + margin;
  const top: Record<string, string> = { grass: '#5aa03c', stone: '#8a8a92', sand: '#e0c888', snow: '#eef4fa', dirt: '#8a5e3a' };
  const side: Record<string, string> = { grass: '#7a5232', stone: '#6a6a72', sand: '#c8a868', snow: '#7a5232', dirt: '#6a4428' };
  const layer = scene.addLayer('Sockel', 'base');
  const topCol = top[kind] ?? top.grass;
  const sideCol = side[kind] ?? side.grass;
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      // Abgerundete Ecken
      const cx = Math.min(x - x0, x1 - x), cz = Math.min(z - z0, z1 - z);
      if (cx === 0 && cz === 0) continue;
      for (let y = 0; y < h; y++) {
        const n = hash3(x, y, z, seed);
        let c = y === h - 1 ? topCol : sideCol;
        if (y === h - 1 && n > 0.7) c = shade(c, 0.1);
        else if (n < 0.25) c = shade(c, -0.12);
        if (y === h - 1 && kind === 'grass' && (cx === 0 || cz === 0) && n > 0.5) c = shade(topCol, -0.15);
        scene.set(x, y, z, scene.colorIndex(c), 'diffuse', layer.id);
      }
    }
  }
  // Gras-Büschel und Blumen
  if (kind === 'grass' && detail >= 2) {
    const deco = scene.addLayer('Pflanzen', 'decoration');
    const flowers = ['#f0d040', '#e04870', '#f4f4f4', '#8a6ae0'];
    for (let x = x0 + 1; x < x1; x++)
      for (let z = z0 + 1; z < z1; z++) {
        if (scene.has(x, h, z)) continue;
        const n = hash3(x, 99, z, seed);
        if (n > 0.93) scene.set(x, h, z, scene.colorIndex(n > 0.975 ? flowers[Math.floor(n * 1000) % 4] : '#78c050'), 'diffuse', deco.id);
      }
  }
}

/** Wendet Stilfarben an und begrenzt die Palette. */
function finalizePalette(model: VoxelModel, style: StylePreset, request: GenerationRequest, important: Set<string>): void {
  const fixed = style.forcedPalette ?? PALETTES[request.palette]?.colors;
  const byLum = style.id === 'gameboy' || request.palette === 'gameboy';
  const styledImportant = new Set([...important].map((c) => applyStyleColor(c, style)));
  model.remapColors((hex) => (style.forcedPalette ? hex : applyStyleColor(hex, style)));
  if (fixed) {
    model.remapColors((hex) => mapToPalette(hex, fixed, byLum));
    return;
  }
  if (request.palette === 'style') {
    const factor = request.detail === 1 ? 0.6 : request.detail === 3 ? 1.4 : 1;
    const max = Math.max(4, Math.round(style.maxColors * factor));
    const usage = model.colorUsage();
    const weights = new Map<string, number>();
    model.palette.forEach((hex, i) => weights.set(hex, (usage.get(i) ?? 0) + (styledImportant.has(hex) ? 1e6 : 0)));
    const mapping = reduceColors(model.palette, max, weights);
    model.remapColors((hex) => mapping.get(hex) ?? hex);
  }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function union(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), minZ: Math.min(a.minZ, b.minZ),
    maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY), maxZ: Math.max(a.maxZ, b.maxZ),
  };
}
