import { useCallback, useEffect, useRef, useState } from 'react';
import { useSprite } from '../../state/spriteStore';
import { imageToCanvas } from '../../services/spriteCanvas';
import { drawLine, drawRect, floodFill, getPx, setPx, shiftImage } from '../../../shared/sprite/indexed';
import type { IndexedImage } from '../../../shared/sprite/types';

/**
 * Pixel-Leinwand des 2D-Editors: Stift, Radierer, Füllen, Pipette, Linie,
 * Rechteck, Verschieben; Zoom (Mausrad), Verschieben der Ansicht
 * (mittlere Maustaste oder Leertaste + Ziehen), Raster, Zwiebelschalen.
 */
export function PixelCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doc = useSprite((s) => s.doc);
  const rev = useSprite((s) => s.rev);
  const anim = useSprite((s) => s.anim);
  const frame = useSprite((s) => s.frame);
  const zoomSetting = useSprite((s) => s.zoom);
  const grid = useSprite((s) => s.grid);
  const onion = useSprite((s) => s.onion);
  const tool = useSprite((s) => s.tool);
  const [size, setSize] = useState({ w: 400, h: 300 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [preview, setPreview] = useState<IndexedImage | null>(null);
  const drag = useRef<{ mode: 'draw' | 'pan' | 'shape' | 'move'; start: [number, number]; last: [number, number]; panStart: { x: number; y: number }; mouse: [number, number] } | null>(null);
  const spaceDown = useRef(false);

  const img = doc?.animations[anim]?.frames[frame] ?? null;
  const prevImg = onion && doc && frame > 0 ? doc.animations[anim]?.frames[frame - 1] : null;
  const autoZoom = img ? Math.max(1, Math.floor(Math.min((size.w - 40) / img.w, (size.h - 40) / img.h))) : 8;
  const zoom = zoomSetting || autoZoom;
  const ox = Math.round((size.w - (img?.w ?? 0) * zoom) / 2 + pan.x);
  const oy = Math.round((size.h - (img?.h ?? 0) * zoom) / 2 + pan.y);

  // Größe beobachten
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const el = hostRef.current;
      if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(hostRef.current!);
    const onKey = (e: KeyboardEvent) => (spaceDown.current = e.type === 'keydown' && e.code === 'Space' ? true : e.code === 'Space' ? false : spaceDown.current);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  useEffect(() => setPan({ x: 0, y: 0 }), [doc]);

  // Zeichnen
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    c.style.width = `${size.w}px`;
    c.style.height = `${size.h}px`;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0d0e14';
    ctx.fillRect(0, 0, size.w, size.h);
    if (!img || !doc) return;
    const W = img.w * zoom, H = img.h * zoom;
    // Schachbrett (Transparenz)
    const cell = Math.max(4, zoom * (img.w > 64 ? 4 : 2));
    for (let y = 0; y < H; y += cell)
      for (let x = 0; x < W; x += cell) {
        ctx.fillStyle = ((x / cell) + (y / cell)) % 2 ? '#2a2c38' : '#353848';
        ctx.fillRect(ox + x, oy + y, Math.min(cell, W - x), Math.min(cell, H - y));
      }
    if (prevImg) {
      ctx.globalAlpha = 0.28;
      ctx.drawImage(imageToCanvas(prevImg, doc.palette), ox, oy, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(imageToCanvas(preview ?? img, doc.palette), ox, oy, W, H);
    // Raster
    if (grid && zoom >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= img.w; x++) { ctx.moveTo(ox + x * zoom + 0.5, oy); ctx.lineTo(ox + x * zoom + 0.5, oy + H); }
      for (let y = 0; y <= img.h; y++) { ctx.moveTo(ox, oy + y * zoom + 0.5); ctx.lineTo(ox + W, oy + y * zoom + 0.5); }
      ctx.stroke();
      // Tile-Raster für Tilesets
      const ts = doc.atlas?.tileSize;
      if (ts) {
        ctx.strokeStyle = 'rgba(255,200,80,0.35)';
        ctx.beginPath();
        for (let x = 0; x <= img.w; x += ts) { ctx.moveTo(ox + x * zoom + 0.5, oy); ctx.lineTo(ox + x * zoom + 0.5, oy + H); }
        for (let y = 0; y <= img.h; y += ts) { ctx.moveTo(ox, oy + y * zoom + 0.5); ctx.lineTo(ox + W, oy + y * zoom + 0.5); }
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(ox - 0.5, oy - 0.5, W + 1, H + 1);
    if (hover) {
      const b = useSprite.getState().brush;
      ctx.strokeStyle = tool === 'eraser' ? '#ff7070' : '#ffe680';
      ctx.strokeRect(ox + hover[0] * zoom + 0.5, oy + hover[1] * zoom + 0.5, zoom * (tool === 'pencil' || tool === 'eraser' ? b : 1) - 1, zoom * (tool === 'pencil' || tool === 'eraser' ? b : 1) - 1);
    }
  }, [img, prevImg, doc, rev, size, zoom, ox, oy, grid, hover, preview, tool]);

  const toPixel = useCallback((e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left - ox) / zoom), Math.floor((e.clientY - r.top - oy) / zoom)];
  }, [ox, oy, zoom]);

  /** Pinsel (Stift/Radierer) mit Größe und X-Spiegelung. */
  const paint = (target: IndexedImage, x: number, y: number, v: number) => {
    const { brush, mirror } = useSprite.getState();
    const o = -Math.floor((brush - 1) / 2);
    for (let dy = 0; dy < brush; dy++)
      for (let dx = 0; dx < brush; dx++) {
        setPx(target, x + o + dx, y + o + dy, v);
        if (mirror) setPx(target, target.w - 1 - (x + o + dx), y + o + dy, v);
      }
  };

  const onDown = (e: React.PointerEvent) => {
    if (!img) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toPixel(e);
    const st = useSprite.getState();
    if (e.button === 1 || spaceDown.current || e.button === 2) {
      drag.current = { mode: 'pan', start: p, last: p, panStart: { ...pan }, mouse: [e.clientX, e.clientY] };
      return;
    }
    if (st.playing) st.set({ playing: false });
    const v = st.tool === 'eraser' ? 0 : st.color;
    switch (st.tool) {
      case 'pencil':
      case 'eraser':
        st.beginFrameEdit();
        paint(img, p[0], p[1], v);
        drag.current = { mode: 'draw', start: p, last: p, panStart: pan, mouse: [e.clientX, e.clientY] };
        st.bump();
        break;
      case 'fill':
        st.beginFrameEdit();
        floodFill(img, p[0], p[1], st.color);
        st.endFrameEdit('Füllen');
        break;
      case 'pick': {
        const c = getPx(img, p[0], p[1]);
        if (c) st.set({ color: c, tool: 'pencil' });
        break;
      }
      case 'line':
      case 'rect':
        drag.current = { mode: 'shape', start: p, last: p, panStart: pan, mouse: [e.clientX, e.clientY] };
        break;
      case 'move':
        drag.current = { mode: 'move', start: p, last: p, panStart: pan, mouse: [e.clientX, e.clientY] };
        break;
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!img) return;
    const p = toPixel(e);
    setHover(p[0] >= 0 && p[1] >= 0 && p[0] < img.w && p[1] < img.h ? p : null);
    const d = drag.current;
    if (!d) return;
    const st = useSprite.getState();
    if (d.mode === 'pan') {
      setPan({ x: d.panStart.x + e.clientX - d.mouse[0], y: d.panStart.y + e.clientY - d.mouse[1] });
      return;
    }
    if (d.mode === 'draw') {
      const v = st.tool === 'eraser' ? 0 : st.color;
      drawLine(img, d.last[0], d.last[1], p[0], p[1], v, (im, x, y, val) => paint(im, x, y, val));
      d.last = p;
      st.bump();
      return;
    }
    if (d.mode === 'shape') {
      const pv = { ...img, data: new Uint8Array(img.data) };
      if (st.tool === 'line') drawLine(pv, d.start[0], d.start[1], p[0], p[1], st.color);
      else drawRect(pv, d.start[0], d.start[1], p[0], p[1], st.color, e.shiftKey);
      d.last = p;
      setPreview(pv);
      return;
    }
    if (d.mode === 'move') {
      setPreview(shiftImage(img, p[0] - d.start[0], p[1] - d.start[1], e.shiftKey));
      d.last = p;
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !img) return;
    const st = useSprite.getState();
    if (d.mode === 'draw') st.endFrameEdit(st.tool === 'eraser' ? 'Radieren' : 'Zeichnen');
    if ((d.mode === 'shape' || d.mode === 'move') && preview) {
      st.beginFrameEdit();
      img.data.set(preview.data);
      st.endFrameEdit(d.mode === 'move' ? 'Verschieben' : st.tool === 'line' ? 'Linie' : 'Rechteck');
      void e;
    }
    setPreview(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!img) return;
    const next = Math.max(1, Math.min(64, Math.round(zoom * (e.deltaY < 0 ? 1.25 : 0.8)) || 1));
    if (next === zoom) return;
    // Zoom zum Mauszeiger
    const r = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const px = (mx - ox) / zoom, py = (my - oy) / zoom;
    const nox = mx - px * next, noy = my - py * next;
    setPan({ x: nox - (size.w - img.w * next) / 2, y: noy - (size.h - img.h * next) / 2 });
    useSprite.getState().set({ zoom: next });
  };

  return (
    <div ref={hostRef} className="pixel-host" onWheel={onWheel} onContextMenu={(e) => e.preventDefault()}>
      <canvas
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setHover(null)}
        style={{ cursor: tool === 'move' ? 'move' : tool === 'pick' ? 'copy' : 'crosshair', touchAction: 'none' }}
        data-testid="pixel-canvas"
      />
      <div className="vp-status">
        {img ? `${img.w}×${img.h} · Zoom ${zoom}×${hover ? ` · X ${hover[0]} Y ${hover[1]}` : ''}` : 'Kein Sprite geöffnet'}
      </div>
    </div>
  );
}
