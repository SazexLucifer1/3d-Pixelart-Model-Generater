import type { Axis, Bounds, Voxel } from './types';
import { VoxelModel, packKey, inRange } from './VoxelModel';

/**
 * Transformationen auf Voxel-Auswahlen (MagicaVoxel-ähnlich).
 *
 * Alle Funktionen arbeiten auf einer Menge von Schlüsseln (siehe `packKey`),
 * verändern das Modell direkt (die Änderungen werden über die
 * Aufzeichnung des Modells für Undo/Redo erfasst) und liefern die neue
 * Auswahl zurück.
 */

export function selectionBounds(model: VoxelModel, keys: Iterable<number>): Bounds | null {
  let b: Bounds | null = null;
  for (const k of keys) {
    const v = model.getByKey(k);
    if (!v) continue;
    if (!b) b = { minX: v.x, minY: v.y, minZ: v.z, maxX: v.x, maxY: v.y, maxZ: v.z };
    else {
      b.minX = Math.min(b.minX, v.x); b.maxX = Math.max(b.maxX, v.x);
      b.minY = Math.min(b.minY, v.y); b.maxY = Math.max(b.maxY, v.y);
      b.minZ = Math.min(b.minZ, v.z); b.maxZ = Math.max(b.maxZ, v.z);
    }
  }
  return b;
}

function collect(model: VoxelModel, keys: Iterable<number>): Voxel[] {
  const out: Voxel[] = [];
  for (const k of keys) {
    const v = model.getByKey(k);
    if (v) out.push({ ...v });
  }
  return out;
}

/**
 * Ersetzt die ausgewählten Voxel durch transformierte Kopien.
 * @param keepOriginals true = kopieren statt verschieben
 */
function replaceWith(
  model: VoxelModel,
  keys: Iterable<number>,
  mapper: (v: Voxel) => Voxel | Voxel[] | null,
  keepOriginals = false,
): Set<number> {
  const src = collect(model, keys);
  if (!keepOriginals) for (const v of src) model.remove(v.x, v.y, v.z);
  const sel = new Set<number>();
  for (const v of src) {
    const res = mapper(v);
    if (!res) continue;
    for (const nv of Array.isArray(res) ? res : [res]) {
      if (!inRange(nv.x, nv.y, nv.z)) continue;
      model.setVoxel(nv);
      sel.add(packKey(nv.x, nv.y, nv.z));
    }
  }
  return sel;
}

/** Verschiebt die Auswahl um (dx, dy, dz). */
export function moveSelection(model: VoxelModel, keys: Iterable<number>, dx: number, dy: number, dz: number): Set<number> {
  return replaceWith(model, keys, (v) => ({ ...v, x: v.x + dx, y: v.y + dy, z: v.z + dz }));
}

/** Kopiert die Auswahl mit Versatz; die Kopie wird die neue Auswahl. */
export function duplicateSelection(model: VoxelModel, keys: Iterable<number>, dx: number, dy: number, dz: number): Set<number> {
  return replaceWith(model, keys, (v) => ({ ...v, x: v.x + dx, y: v.y + dy, z: v.z + dz }), true);
}

/**
 * Dreht die Auswahl um 90° (dir = 1 bzw. -1) um die angegebene Achse.
 *
 * Exakte Ganzzahl-Rotation innerhalb der Bounding-Box; die Box bleibt
 * zentriert (bei ungerader Größendifferenz symmetrisch gerundet), sodass
 * 4× Drehen bzw. Drehen + Zurückdrehen exakt das Original ergibt.
 */
export function rotateSelection(model: VoxelModel, keys: Iterable<number>, axis: Axis, dir: 1 | -1 = 1): Set<number> {
  const list = [...keys];
  const b = selectionBounds(model, list);
  if (!b) return new Set();
  const ex = b.maxX - b.minX, ey = b.maxY - b.minY, ez = b.maxZ - b.minZ;
  // neue Ausdehnung (Achsenpaar vertauscht)
  const [nex, ney, nez] = axis === 'y' ? [ez, ey, ex] : axis === 'x' ? [ex, ez, ey] : [ey, ex, ez];
  const ox = b.minX + Math.trunc((ex - nex) / 2);
  const oy = b.minY + Math.trunc((ey - ney) / 2);
  const oz = b.minZ + Math.trunc((ez - nez) / 2);
  return replaceWith(model, list, (v) => {
    const rx = v.x - b.minX, ry = v.y - b.minY, rz = v.z - b.minZ;
    let nx = rx, ny = ry, nz = rz;
    if (axis === 'y') [nx, nz] = dir === 1 ? [rz, ex - rx] : [ez - rz, rx];
    else if (axis === 'x') [ny, nz] = dir === 1 ? [rz, ey - ry] : [ez - rz, ry];
    else [nx, ny] = dir === 1 ? [ry, ex - rx] : [ey - ry, rx];
    return { ...v, x: ox + nx, y: oy + ny, z: oz + nz };
  });
}

/** Spiegelt die Auswahl an ihrer eigenen Mitte entlang einer Achse. */
export function mirrorSelection(model: VoxelModel, keys: Iterable<number>, axis: Axis): Set<number> {
  const list = [...keys];
  const b = selectionBounds(model, list);
  if (!b) return new Set();
  return replaceWith(model, list, (v) => {
    if (axis === 'x') return { ...v, x: b.minX + b.maxX - v.x };
    if (axis === 'y') return { ...v, y: b.minY + b.maxY - v.y };
    return { ...v, z: b.minZ + b.maxZ - v.z };
  });
}

/**
 * Erzeugt eine gespiegelte Kopie der Auswahl auf der anderen Seite der
 * Modellachse (x → -x - 1 bzw. um die Modellmitte). Praktisch für
 * symmetrische Charaktere.
 */
export function symmetrizeSelection(model: VoxelModel, keys: Iterable<number>, axis: Axis): Set<number> {
  const all = model.bounds();
  if (!all) return new Set(keys);
  const sum = axis === 'x' ? all.minX + all.maxX : axis === 'y' ? all.minY + all.maxY : all.minZ + all.maxZ;
  const list = [...keys];
  const res = replaceWith(
    model,
    list,
    (v) => (axis === 'x' ? { ...v, x: sum - v.x } : axis === 'y' ? { ...v, y: sum - v.y } : { ...v, z: sum - v.z }),
    true,
  );
  for (const k of list) res.add(k);
  return res;
}

/**
 * Skaliert die Auswahl mit Nearest-Neighbor-Sampling (harte Pixelkanten).
 * Anker: Boden-Mitte der Auswahl.
 */
export function scaleSelection(model: VoxelModel, keys: Iterable<number>, factor: number): Set<number> {
  const list = [...keys];
  const b = selectionBounds(model, list);
  if (!b || factor <= 0) return new Set(list);
  const src = new Map<number, Voxel>();
  for (const v of collect(model, list)) src.set(packKey(v.x, v.y, v.z), v);
  for (const v of src.values()) model.remove(v.x, v.y, v.z);

  const sx = b.maxX - b.minX + 1, sy = b.maxY - b.minY + 1, sz = b.maxZ - b.minZ + 1;
  const nx = Math.max(1, Math.round(sx * factor));
  const ny = Math.max(1, Math.round(sy * factor));
  const nz = Math.max(1, Math.round(sz * factor));
  // Anker: x/z zentriert, y am Boden
  const ox = b.minX + Math.floor((sx - nx) / 2);
  const oz = b.minZ + Math.floor((sz - nz) / 2);
  const oy = b.minY;
  const sel = new Set<number>();
  for (let tx = 0; tx < nx; tx++) {
    for (let ty = 0; ty < ny; ty++) {
      for (let tz = 0; tz < nz; tz++) {
        const sxi = b.minX + Math.min(sx - 1, Math.floor((tx + 0.5) * (sx / nx)));
        const syi = b.minY + Math.min(sy - 1, Math.floor((ty + 0.5) * (sy / ny)));
        const szi = b.minZ + Math.min(sz - 1, Math.floor((tz + 0.5) * (sz / nz)));
        const v = src.get(packKey(sxi, syi, szi));
        if (!v) continue;
        const nv = { ...v, x: ox + tx, y: oy + ty, z: oz + tz };
        if (!inRange(nv.x, nv.y, nv.z)) continue;
        model.setVoxel(nv);
        sel.add(packKey(nv.x, nv.y, nv.z));
      }
    }
  }
  return sel;
}

/** Löscht die ausgewählten Voxel. */
export function deleteSelection(model: VoxelModel, keys: Iterable<number>): void {
  for (const k of [...keys]) model.removeKey(k);
}

/** Färbt die Auswahl mit einem Palettenindex ein. */
export function recolorSelection(model: VoxelModel, keys: Iterable<number>, colorIndex: number): void {
  for (const k of [...keys]) {
    const v = model.getByKey(k);
    if (v) model.setVoxel({ ...v, c: colorIndex });
  }
}

/** Weist der Auswahl ein Material zu. */
export function setSelectionMaterial(model: VoxelModel, keys: Iterable<number>, m: Voxel['m'], e?: number): void {
  for (const k of [...keys]) {
    const v = model.getByKey(k);
    if (!v) continue;
    const nv: Voxel = { ...v, m };
    if (m === 'emissive') nv.e = e ?? v.e ?? 0.8;
    else delete nv.e;
    model.setVoxel(nv);
  }
}

/** Verschiebt die Auswahl auf eine andere Ebene. */
export function assignSelectionLayer(model: VoxelModel, keys: Iterable<number>, layerId: number): void {
  for (const k of [...keys]) {
    const v = model.getByKey(k);
    if (v) model.setVoxel({ ...v, l: layerId });
  }
}

/** Zusammenhängende Voxel gleicher Farbe (Zauberstab, 6er-Nachbarschaft). */
export function floodSelect(model: VoxelModel, startKey: number, sameColorOnly = true): Set<number> {
  const start = model.getByKey(startKey);
  const sel = new Set<number>();
  if (!start) return sel;
  const stack = [start];
  sel.add(startKey);
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  while (stack.length) {
    const v = stack.pop()!;
    for (const [dx, dy, dz] of dirs) {
      const k = packKey(v.x + dx, v.y + dy, v.z + dz);
      if (sel.has(k)) continue;
      const n = model.getByKey(k);
      if (!n) continue;
      if (sameColorOnly && n.c !== start.c) continue;
      sel.add(k);
      stack.push(n);
    }
  }
  return sel;
}

/** Alle Voxel einer Farbe (global). */
export function selectByColor(model: VoxelModel, colorIndex: number): Set<number> {
  const sel = new Set<number>();
  for (const [k, v] of model.entries()) if (v.c === colorIndex) sel.add(k);
  return sel;
}

/** Alle Voxel einer Ebene. */
export function selectByLayer(model: VoxelModel, layerId: number): Set<number> {
  const sel = new Set<number>();
  for (const [k, v] of model.entries()) if (v.l === layerId) sel.add(k);
  return sel;
}

/** Zwischenablage: relative Voxelpositionen. */
export interface VoxelClipboard {
  voxels: Voxel[];
}

export function copyToClipboard(model: VoxelModel, keys: Iterable<number>): VoxelClipboard | null {
  const list = collect(model, keys);
  const b = selectionBounds(model, keys);
  if (!b || list.length === 0) return null;
  return { voxels: list.map((v) => ({ ...v, x: v.x - b.minX, y: v.y - b.minY, z: v.z - b.minZ })) };
}

export function pasteClipboard(model: VoxelModel, clip: VoxelClipboard, ox: number, oy: number, oz: number): Set<number> {
  const sel = new Set<number>();
  for (const v of clip.voxels) {
    const nv = { ...v, x: v.x + ox, y: v.y + oy, z: v.z + oz };
    if (!inRange(nv.x, nv.y, nv.z)) continue;
    model.setVoxel(nv);
    sel.add(packKey(nv.x, nv.y, nv.z));
  }
  return sel;
}
