import type { Viewport, Cell } from '../render/Viewport';
import { useEditor } from '../state/editorStore';
import { packKey } from '../../shared/voxel/VoxelModel';
import { floodSelect, moveSelection, selectByColor } from '../../shared/voxel/transforms';
import { fillBox } from './actions';

/**
 * Übersetzt Maus-/Touch-Eingaben im Viewport in Editor-Operationen,
 * abhängig vom aktiven Werkzeug. Rechte Maustaste = Kamera drehen,
 * mittlere = verschieben, Mausrad = zoomen (OrbitControls).
 */
export class ToolController {
  private down = false;
  private startX = 0;
  private startY = 0;
  private dragged = false;
  private lastCell = '';
  /** Ebene, auf die ein Anbau-Strich eingeschränkt ist. */
  private lockPlane: { axis: 'x' | 'y' | 'z'; value: number; n: Cell; cell: number } | null = null;
  private boxStart: Cell | null = null;
  private boxEnd: Cell | null = null;
  private boxErase = false;
  private moveStart: { x: number; y: number; z: number } | null = null;
  private moveApplied: Cell = [0, 0, 0];
  private moveAxis: 'x' | 'y' | 'z' = 'y';

  constructor(
    private readonly vp: Viewport,
    private readonly onMarquee: (rect: { x0: number; y0: number; x1: number; y1: number } | null) => void,
  ) {}

  private get s() {
    return useEditor.getState();
  }

  pointerDown(e: PointerEvent): void {
    if (e.button !== 0 || this.s.playing) return;
    const tool = this.s.tool;
    if (tool === 'orbit' || e.altKey) return;
    this.down = true;
    this.dragged = false;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.lastCell = '';
    const hit = this.vp.pick(e.clientX, e.clientY);

    switch (tool) {
      case 'attach':
      case 'erase':
      case 'paint':
        this.s.beginStroke();
        if (hit) {
          if (tool === 'attach') {
            const axis = hit.normal[0] ? 'x' : hit.normal[1] ? 'y' : 'z';
            const ai = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
            this.lockPlane = { axis, value: hit.adjacent[ai] - hit.normal[ai] * 0.5, n: hit.normal, cell: hit.adjacent[ai] };
          }
          this.applyBrush(tool, tool === 'attach' ? hit.adjacent : hit.voxel);
        }
        break;
      case 'pick':
        if (hit?.voxel) {
          const v = this.s.model.get(...hit.voxel);
          if (v) this.s.set({ colorIndex: v.c, material: v.m, activeLayer: v.l });
        }
        break;
      case 'wand':
        if (hit?.voxel) {
          const key = packKey(...hit.voxel);
          const v = this.s.model.getByKey(key);
          const found = e.ctrlKey || e.metaKey ? selectByColor(this.s.model, v!.c) : floodSelect(this.s.model, key, true);
          const sel = e.shiftKey ? new Set([...this.s.selection, ...found]) : found;
          this.s.setSelection(sel);
        } else if (!e.shiftKey) this.s.setSelection(new Set());
        break;
      case 'box':
        if (hit) {
          this.boxErase = e.ctrlKey || e.metaKey;
          this.boxStart = this.boxErase && hit.voxel ? hit.voxel : hit.adjacent;
          this.boxEnd = this.boxStart;
          this.vp.setPreviewBox(this.boxStart, this.boxEnd, this.boxErase ? 0xff5050 : 0x66ccff);
        }
        break;
      case 'move': {
        if (this.s.selection.size === 0) {
          // Ohne Auswahl: angeklicktes zusammenhängendes Teil auswählen
          if (hit?.voxel) this.s.setSelection(floodSelect(this.s.model, packKey(...hit.voxel), false));
          else return;
        }
        this.moveAxis = e.shiftKey ? this.vp.dominantViewAxis() : 'y';
        const ref = hit?.voxel ?? hit?.adjacent ?? [0, 0, 0];
        const value = this.moveAxis === 'y' ? ref[1] : this.moveAxis === 'x' ? ref[0] : ref[2];
        const p = this.vp.pickPlane(e.clientX, e.clientY, this.moveAxis, value);
        if (p) {
          this.moveStart = { x: p.x, y: p.y, z: p.z };
          this.moveApplied = [0, 0, 0];
          this.s.beginStroke();
        }
        break;
      }
      case 'select':
        break;
    }
  }

  pointerMove(e: PointerEvent): void {
    const tool = this.s.tool;
    if (Math.hypot(e.clientX - this.startX, e.clientY - this.startY) > 4) this.dragged = this.down;

    if (!this.down) {
      this.updateHover(e);
      return;
    }
    switch (tool) {
      case 'attach': {
        if (!this.lockPlane) break;
        const p = this.vp.pickPlane(e.clientX, e.clientY, this.lockPlane.axis, this.lockPlane.value);
        if (!p) break;
        const cell: Cell = [Math.round(p.x), Math.round(p.y), Math.round(p.z)];
        const ai = this.lockPlane.axis === 'x' ? 0 : this.lockPlane.axis === 'y' ? 1 : 2;
        cell[ai] = this.lockPlane.cell;
        this.applyBrush('attach', cell);
        break;
      }
      case 'erase':
      case 'paint': {
        const hit = this.vp.pick(e.clientX, e.clientY);
        if (hit?.voxel) this.applyBrush(tool, hit.voxel);
        break;
      }
      case 'select':
        if (this.dragged) this.onMarquee({ x0: this.startX, y0: this.startY, x1: e.clientX, y1: e.clientY });
        break;
      case 'box': {
        if (!this.boxStart) break;
        let end: Cell | null = null;
        if (e.shiftKey) {
          // Höhe ziehen: vertikale Ebene durch den Endpunkt
          const axis = this.vp.dominantViewAxis();
          const ref = this.boxEnd ?? this.boxStart;
          const p = this.vp.pickPlane(e.clientX, e.clientY, axis, axis === 'x' ? ref[0] : ref[2]);
          if (p) end = [ref[0], Math.max(0, Math.round(p.y)), ref[2]];
        } else {
          const p = this.vp.pickPlane(e.clientX, e.clientY, 'y', this.boxStart[1]);
          if (p) end = [Math.round(p.x), this.boxEnd ? this.boxEnd[1] : this.boxStart[1], Math.round(p.z)];
          if (end && this.boxEnd) end[1] = this.boxEnd[1];
        }
        if (end) {
          this.boxEnd = end;
          this.vp.setPreviewBox(this.boxStart, end, this.boxErase ? 0xff5050 : 0x66ccff);
          this.s.set({ hover: `Box ${Math.abs(end[0] - this.boxStart[0]) + 1}×${Math.abs(end[1] - this.boxStart[1]) + 1}×${Math.abs(end[2] - this.boxStart[2]) + 1}` });
        }
        break;
      }
      case 'move': {
        if (!this.moveStart) break;
        const ref = this.moveStart;
        const value = this.moveAxis === 'y' ? ref.y : this.moveAxis === 'x' ? ref.x : ref.z;
        const p = this.vp.pickPlane(e.clientX, e.clientY, this.moveAxis, value);
        if (!p) break;
        const target: Cell =
          this.moveAxis === 'y'
            ? [Math.round(p.x - ref.x), 0, Math.round(p.z - ref.z)]
            : [0, Math.round(p.y - ref.y), 0];
        const d: Cell = [target[0] - this.moveApplied[0], target[1] - this.moveApplied[1], target[2] - this.moveApplied[2]];
        if (d[0] || d[1] || d[2]) {
          const minY = Math.min(...[...this.s.selection].map((k) => this.s.model.getByKey(k)?.y ?? 0));
          if (minY + d[1] < 0) d[1] = -minY;
          const sel = moveSelection(this.s.model, this.s.selection, d[0], d[1], d[2]);
          this.moveApplied = [this.moveApplied[0] + d[0], this.moveApplied[1] + d[1], this.moveApplied[2] + d[2]];
          this.s.set({ selection: sel, hover: `Verschoben um ${this.moveApplied.join(', ')}` });
          this.s.bump();
        }
        break;
      }
    }
  }

  pointerUp(e: PointerEvent): void {
    if (!this.down) return;
    this.down = false;
    const tool = this.s.tool;
    switch (tool) {
      case 'attach':
        this.s.endStroke('Voxel hinzufügen');
        this.lockPlane = null;
        break;
      case 'erase':
        this.s.endStroke('Voxel löschen');
        break;
      case 'paint':
        this.s.endStroke('Malen');
        break;
      case 'move':
        this.s.endStroke('Teil verschieben');
        this.moveStart = null;
        break;
      case 'box':
        if (this.boxStart && this.boxEnd) fillBox(this.boxStart, this.boxEnd, this.boxErase);
        this.boxStart = this.boxEnd = null;
        this.vp.setPreviewBox(null);
        break;
      case 'select': {
        const { model, selection } = this.s;
        let found: Set<number>;
        if (this.dragged) {
          found = this.vp.voxelsInRect(model, this.startX, this.startY, e.clientX, e.clientY);
          this.onMarquee(null);
        } else {
          const hit = this.vp.pick(e.clientX, e.clientY);
          found = hit?.voxel ? new Set([packKey(...hit.voxel)]) : new Set();
        }
        let next: Set<number>;
        if (e.shiftKey) next = new Set([...selection, ...found]);
        else if (e.ctrlKey || e.metaKey) {
          next = new Set(selection);
          for (const k of found) {
            if (!this.dragged && next.has(k)) next.delete(k);
            else if (this.dragged) next.delete(k);
            else next.add(k);
          }
        } else next = found;
        this.s.setSelection(next);
        break;
      }
    }
    this.dragged = false;
  }

  /** Wendet Pinsel (inkl. Größe und X-Spiegelung) an einer Zelle an. */
  private applyBrush(tool: 'attach' | 'erase' | 'paint', cell: Cell | null): void {
    if (!cell) return;
    const id = cell.join(',');
    if (id === this.lastCell) return;
    this.lastCell = id;
    const { model, brushSize, colorIndex, material, activeLayer, mirrorX } = this.s;
    const r0 = -Math.floor((brushSize - 1) / 2), r1 = Math.ceil((brushSize - 1) / 2);
    const cells: Cell[] = [];
    for (let dx = r0; dx <= r1; dx++) for (let dy = r0; dy <= r1; dy++) for (let dz = r0; dz <= r1; dz++) cells.push([cell[0] + dx, cell[1] + dy, cell[2] + dz]);
    if (mirrorX) for (const c of [...cells]) cells.push([-c[0], c[1], c[2]]);
    const layerLocked = (l: number) => !!model.getLayer(l)?.locked;
    for (const [x, y, z] of cells) {
      if (y < 0) continue;
      const v = model.get(x, y, z);
      if (tool === 'attach') {
        if (!v && !layerLocked(activeLayer)) model.set(x, y, z, colorIndex, material, activeLayer, material === 'emissive' ? 0.9 : undefined);
      } else if (v && !layerLocked(v.l)) {
        if (tool === 'erase') model.remove(x, y, z);
        else {
          const nv = { ...v, c: colorIndex, m: material };
          if (material === 'emissive') nv.e = v.e ?? 0.9;
          else delete nv.e;
          model.setVoxel(nv);
        }
      }
    }
    this.s.bump();
  }

  private updateHover(e: PointerEvent): void {
    const tool = this.s.tool;
    if (tool === 'orbit') return;
    const hit = this.vp.pick(e.clientX, e.clientY);
    if (!hit) {
      this.vp.setHover(null);
      return;
    }
    const useAdjacent = tool === 'attach' || tool === 'box';
    const cell = useAdjacent ? hit.adjacent : hit.voxel;
    const colors: Record<string, number> = { attach: 0x80ff80, erase: 0xff6060, paint: 0x80c0ff, box: 0x66ccff };
    this.vp.setHover(cell, colors[tool] ?? 0xffffff);
    if (cell) {
      const v = hit.voxel ? this.s.model.get(...hit.voxel) : undefined;
      const layer = v ? this.s.model.getLayer(v.l)?.name : undefined;
      const text = `X ${cell[0]}  Y ${cell[1]}  Z ${cell[2]}${layer ? `  ·  ${layer}` : ''}`;
      if (text !== this.s.hover) this.s.set({ hover: text });
    }
  }

  leave(): void {
    this.vp.setHover(null);
  }
}
