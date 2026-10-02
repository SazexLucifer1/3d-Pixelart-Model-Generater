import { useEffect, useMemo, useRef, useState } from 'react';
import { PixelCanvas } from './PixelCanvas';
import { useSprite, type PixelTool } from '../../state/spriteStore';
import { useGame, CHARACTER_ANIMS } from '../../state/gameStore';
import { imageToCanvas, docThumbnail } from '../../services/spriteCanvas';
import { addAnimationsToActive, currentDirections } from '../../services/assetGenerator';
import { exportSheetPng, exportSheetMeta, exportFramesZip, exportAssetGodot, exportPalette } from '../../services/gameExport';
import { cloneImage, createImage, flipH } from '../../../shared/sprite/indexed';
import { serializeSpriteDoc, DIRECTION_LABEL, directionsFor, type SpriteDoc, type Direction } from '../../../shared/sprite/types';
import { lockColor } from '../../../shared/style/profile';
import { CATEGORY_LABELS } from '../../../shared/library/gameProject';
import { Icon } from '../Icon';

const TOOLS: { id: PixelTool; name: string; key: string; icon: string }[] = [
  { id: 'pencil', name: 'Stift', key: 'B', icon: 'paint' },
  { id: 'eraser', name: 'Radierer', key: 'E', icon: 'erase' },
  { id: 'fill', name: 'Füllen', key: 'G', icon: 'box' },
  { id: 'pick', name: 'Pipette', key: 'I', icon: 'pick' },
  { id: 'line', name: 'Linie (Ziehen)', key: 'L', icon: 'wand' },
  { id: 'rect', name: 'Rechteck (Shift = gefüllt)', key: 'R', icon: 'select' },
  { id: 'move', name: 'Frame verschieben (Shift = umlaufend)', key: 'M', icon: 'move' },
];

/**
 * 2D-Pixel-Art-Editor: Werkzeuge, Palette, Leinwand, Animationen,
 * Zeitleiste und Export (Aseprite-ähnlich).
 */
export function SpriteWorkspace() {
  const doc = useSprite((s) => s.doc);
  useSyncToLibrary();
  useSpriteShortcuts();
  if (!doc) return <EmptySprite />;
  return (
    <div className="sprite-ws">
      <SpriteToolsPanel />
      <div className="sprite-center">
        <CanvasToolbar />
        <PixelCanvas />
        <Timeline />
      </div>
      <SpriteSidePanel />
    </div>
  );
}

// ------------------------------------------------------------------ Leer

function EmptySprite() {
  const profile = useGame((s) => s.profile());
  const createBlank = () => {
    const size = profile.pixel.characterSize;
    const palette = profile.palette.colors.length ? [...profile.palette.colors] : ['#141018', '#3a3048', '#6a5a7a', '#a89ab8', '#eae4f0', '#c8323c', '#e8742a', '#f2c53d', '#4a9e3f', '#2a9d8f', '#3a62c8', '#7c3fae', '#8a5a34', '#f0c49a', '#ffffff', '#5a6070'];
    const doc: SpriteDoc = { width: size, height: size, palette, animations: [{ id: 'idle_new', name: 'idle', direction: 'none', fps: 6, loop: true, frames: [createImage(size, size)] }] };
    const g = useGame.getState();
    import('../../../shared/library/gameProject').then(({ newAsset }) => {
      const asset = newAsset({ name: 'Neues Sprite', category: 'character', kind: 'sprite', prompt: '', profileId: profile.id, sprite: serializeSpriteDoc(doc) });
      g.addAsset(asset);
      useSprite.getState().load(doc, asset.id);
      g.set({ activeSpriteId: asset.id });
    });
  };
  return (
    <div className="empty-big">
      <b>2D-Pixel-Editor</b>
      <p>
        Beschreibe oben ein Asset – z.B. „Erstelle einen Waldläufer Charakter für mein Fantasy RPG“, „Ein Feuerzauber“, „Ein Waldgebiet für eine RPG Karte“ – und klicke <b>Generieren</b>.
        Das Ergebnis ist ein echtes, pixelweise bearbeitbares Sprite mit Animationen.
      </p>
      <button className="btn" onClick={createBlank}>Leeres Sprite ({profile.pixel.characterSize}×{profile.pixel.characterSize}) anlegen</button>
    </div>
  );
}

// ----------------------------------------------------------------- Werkzeuge

function SpriteToolsPanel() {
  const s = useSprite();
  const doc = s.doc!;
  const profile = useGame((g) => g.profile());
  const colorInput = useRef<HTMLInputElement>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const used = useMemo(() => {
    const u = new Map<number, number>();
    for (const a of doc.animations) for (const f of a.frames) for (const v of f.data) if (v) u.set(v, (u.get(v) ?? 0) + 1);
    return u;
  }, [doc, s.rev]);

  return (
    <aside className="panel left">
      <div className="section">
        <h3>Werkzeuge</h3>
        <div className="tools">
          {TOOLS.map((t) => (
            <button key={t.id} className={`btn tool ${s.tool === t.id ? 'active' : ''}`} title={`${t.name} (${t.key})`} onClick={() => s.set({ tool: t.id })}>
              <Icon name={t.icon} size={18} />
              <kbd>{t.key}</kbd>
            </button>
          ))}
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <label>Pinselgröße <span>{s.brush}px</span></label>
          <input type="range" min={1} max={4} value={s.brush} onChange={(e) => s.set({ brush: Number(e.target.value) })} />
        </div>
        <label className="check"><input type="checkbox" checked={s.mirror} onChange={(e) => s.set({ mirror: e.target.checked })} /> X-Spiegelung (X)</label>
        <label className="check"><input type="checkbox" checked={s.onion} onChange={(e) => s.set({ onion: e.target.checked })} /> Zwiebelschale (Vorframe)</label>
        <label className="check"><input type="checkbox" checked={s.grid} onChange={(e) => s.set({ grid: e.target.checked })} /> Pixelraster</label>
      </div>
      <div className="section">
        <h3>Palette <span className="hint">{doc.palette.length} Farben</span></h3>
        <div className="palette">
          {doc.palette.map((c, i) => (
            <button
              key={i}
              className={`swatch ${s.color === i + 1 ? 'on' : ''}`}
              style={{ background: c, opacity: used.has(i + 1) ? 1 : 0.45 }}
              title={`${c} · ${used.get(i + 1) ?? 0} Pixel – Doppelklick: Farbe ändern (alle Frames)`}
              onClick={() => s.set({ color: i + 1, tool: s.tool === 'eraser' ? 'pencil' : s.tool })}
              onDoubleClick={() => {
                setEditIdx(i);
                setTimeout(() => colorInput.current?.click(), 0);
              }}
            />
          ))}
          <button className="swatch add" title="Farbe hinzufügen" onClick={() => s.docEdit('Farbe hinzufügen', (d) => { if (d.palette.length < 255) d.palette.push(doc.palette[s.color - 1] ?? '#ffffff'); })}>
            <Icon name="plus" size={12} />
          </button>
        </div>
        <input
          ref={colorInput}
          type="color"
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
          value={editIdx !== null ? doc.palette[editIdx] : '#000000'}
          onChange={(e) => editIdx !== null && s.docEdit('Palettenfarbe ändern', (d) => (d.palette[editIdx] = e.target.value))}
        />
        <div className="current-color">
          <div className="big" style={{ background: doc.palette[s.color - 1] ?? 'transparent' }} />
          <div>
            <code>{doc.palette[s.color - 1]}</code>
            <div className="hint">Doppelklick auf eine Farbe ändert sie in allen Frames – z.B. Umhangfarbe konsistent tauschen.</div>
          </div>
        </div>
        <div className="btn-row" style={{ marginTop: 6 }}>
          <button className="btn small" title="Alle Farben auf die gesperrte Projektpalette abbilden (Style Lock)" disabled={!profile.palette.locked || !profile.palette.colors.length}
            onClick={() => s.docEdit('Auf Projektpalette abbilden', (d) => (d.palette = d.palette.map((c) => lockColor(c, profile))))}>
            Auf Projektpalette
          </button>
          <button className="btn small" onClick={() => exportPalette(doc, useGame.getState().project.assets.find((a) => a.id === s.assetId)?.name ?? 'palette')}>.gpl</button>
        </div>
      </div>
    </aside>
  );
}

// ------------------------------------------------------------- Leinwandleiste

function CanvasToolbar() {
  const s = useSprite();
  const doc = s.doc!;
  const a = doc.animations[s.anim];
  return (
    <div className="canvas-bar">
      <button className="btn small icon" title="Rückgängig (Strg+Z)" disabled={!s.undoStack.length} onClick={s.undo}><Icon name="undo" size={14} /></button>
      <button className="btn small icon" title="Wiederholen (Strg+Y)" disabled={!s.redoStack.length} onClick={s.redo}><Icon name="redo" size={14} /></button>
      <span className="sep" />
      <button className="btn small" onClick={() => s.set({ zoom: Math.max(1, (s.zoom || 8) - 2) })}>−</button>
      <button className="btn small" onClick={() => s.set({ zoom: 0 })} title="Einpassen">Fit</button>
      <button className="btn small" onClick={() => s.set({ zoom: Math.min(64, (s.zoom || 8) + 2) })}>+</button>
      <span className="sep" />
      <button className="btn small" disabled={!a} onClick={() => s.docEdit('Frame spiegeln', (d) => { const fr = d.animations[s.anim].frames; fr[s.frame] = flipH(fr[s.frame]); })}>Spiegeln ⇋</button>
      <span className="hint" style={{ marginLeft: 'auto' }}>
        {a ? `${a.name}${a.direction !== 'none' ? ` · ${DIRECTION_LABEL[a.direction]}` : ''} · Frame ${s.frame + 1}/${a.frames.length}` : ''}
        {' · '}Rechte/mittlere Maus oder Leertaste: Ansicht verschieben · Mausrad: Zoom
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ Zeitleiste

function FrameThumb({ img, palette, active, onClick }: { img: SpriteDoc['animations'][0]['frames'][0]; palette: string[]; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const scale = Math.max(1, Math.floor(48 / Math.max(img.w, img.h)));
    c.width = img.w * scale;
    c.height = img.h * scale;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(imageToCanvas(img, palette), 0, 0, c.width, c.height);
  });
  return <canvas ref={ref} className={`frame-thumb ${active ? 'on' : ''}`} onClick={onClick} />;
}

function Preview() {
  const s = useSprite();
  const doc = s.doc!;
  const a = doc.animations[s.anim];
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!a) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000 / Math.max(1, a.fps));
    return () => clearInterval(t);
  }, [a, a?.fps]);
  useEffect(() => {
    if (!a || !ref.current) return;
    const img = a.frames[(s.playing ? tick : s.frame) % a.frames.length];
    const c = ref.current;
    const scale = Math.max(1, Math.floor(96 / Math.max(img.w, img.h)));
    c.width = img.w * scale;
    c.height = img.h * scale;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(imageToCanvas(img, doc.palette), 0, 0, c.width, c.height);
  }, [tick, a, s.frame, s.playing, s.rev, doc.palette]);
  return <canvas ref={ref} className="anim-preview" title="Live-Vorschau (immer abspielend)" onClick={() => s.set({ playing: !s.playing })} />;
}

function Timeline() {
  const s = useSprite();
  const doc = s.doc!;
  const a = doc.animations[s.anim];
  // Abspielen im Editor
  useEffect(() => {
    if (!s.playing || !a) return;
    const t = setInterval(() => {
      const st = useSprite.getState();
      st.set({ frame: (st.frame + 1) % (st.doc?.animations[st.anim]?.frames.length || 1) });
    }, 1000 / Math.max(1, a.fps));
    return () => clearInterval(t);
  }, [s.playing, a, a?.fps]);
  if (!a) return null;
  const frameOp = (label: string, fn: (frames: typeof a.frames) => number | void) =>
    s.docEdit(label, (d) => {
      const r = fn(d.animations[s.anim].frames);
      if (typeof r === 'number') useSprite.setState({ frame: r });
    });
  return (
    <div className="timeline">
      <div className="timeline-controls">
        <button className="btn small" onClick={() => s.set({ playing: !s.playing })}><Icon name={s.playing ? 'stop' : 'play'} size={12} /> {s.playing ? 'Stopp' : 'Abspielen'}</button>
        <label className="hint">FPS <input type="number" min={1} max={60} value={a.fps} style={{ width: 48 }} onChange={(e) => s.docEdit('FPS', (d) => (d.animations[s.anim].fps = Math.max(1, Number(e.target.value))))} /></label>
        <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={a.loop} onChange={(e) => s.docEdit('Loop', (d) => (d.animations[s.anim].loop = e.target.checked))} /> Loop</label>
        <span className="sep" />
        <button className="btn small" title="Leeren Frame einfügen" onClick={() => frameOp('Frame hinzufügen', (fr) => { fr.splice(s.frame + 1, 0, createImage(doc.width, doc.height)); return s.frame + 1; })}>+ Frame</button>
        <button className="btn small" title="Frame duplizieren" onClick={() => frameOp('Frame duplizieren', (fr) => { fr.splice(s.frame + 1, 0, cloneImage(fr[s.frame])); return s.frame + 1; })}>Duplizieren</button>
        <button className="btn small" disabled={s.frame === 0} onClick={() => frameOp('Frame nach links', (fr) => { [fr[s.frame - 1], fr[s.frame]] = [fr[s.frame], fr[s.frame - 1]]; return s.frame - 1; })}>←</button>
        <button className="btn small" disabled={s.frame >= a.frames.length - 1} onClick={() => frameOp('Frame nach rechts', (fr) => { [fr[s.frame + 1], fr[s.frame]] = [fr[s.frame], fr[s.frame + 1]]; return s.frame + 1; })}>→</button>
        <button className="btn small danger" disabled={a.frames.length <= 1} onClick={() => frameOp('Frame löschen', (fr) => { fr.splice(s.frame, 1); return Math.max(0, s.frame - 1); })}>Löschen</button>
      </div>
      <div className="timeline-row">
        <Preview />
        <div className="frames">
          {a.frames.map((f, i) => (
            <div key={i} className="frame-cell">
              <FrameThumb img={f} palette={doc.palette} active={i === s.frame} onClick={() => s.set({ frame: i, playing: false })} />
              <span>{i + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- Seitenleiste

function SpriteSidePanel() {
  const s = useSprite();
  const doc = s.doc!;
  const g = useGame();
  const asset = g.project.assets.find((a) => a.id === s.assetId);
  const profile = g.profile();
  // Animationen nach Name gruppieren
  const groups = useMemo(() => {
    const m = new Map<string, { index: number; direction: Direction; frames: number }[]>();
    doc.animations.forEach((a, i) => {
      if (!m.has(a.name)) m.set(a.name, []);
      m.get(a.name)!.push({ index: i, direction: a.direction, frames: a.frames.length });
    });
    return [...m.entries()];
  }, [doc, s.rev]);
  const available = (asset?.meta?.available as { id: string; name: string; group: string; frames: number; fps: number }[] | undefined) ?? [];
  const animList = available.length ? CHARACTER_ANIMS.filter((c) => available.some((a) => a.id === c.id)).concat(
    available.filter((a) => !CHARACTER_ANIMS.some((c) => c.id === a.id)).map((a) => ({ ...a, on: false })),
  ) : CHARACTER_ANIMS;
  const [dirCount, setDirCount] = useState<number>(Math.max(1, new Set(doc.animations.map((a) => a.direction)).size));
  const consistent = new Set(doc.animations.flatMap((a) => a.frames.map((f) => `${f.w}x${f.h}`))).size === 1;

  const generate = () => {
    const anims = animList
      .filter((a) => g.animSettings[a.id]?.enabled ?? false)
      .map((a) => ({ id: a.id, frames: g.animSettings[a.id]?.frames ?? a.frames, fps: g.animSettings[a.id]?.fps ?? a.fps }));
    if (!anims.length) return g.notify('Bitte mindestens eine Animation auswählen', 'error');
    const dirs = dirCount <= 1 ? (['down'] as Direction[]) : directionsFor(dirCount, profile.design.view);
    addAnimationsToActive(anims, dirs);
  };

  return (
    <aside className="panel right">
      <div className="section">
        <h3>Asset</h3>
        {asset ? (
          <>
            <input className="name-input" value={asset.name} onChange={(e) => g.updateAsset(asset.id, { name: e.target.value })} />
            <div className="hint" style={{ margin: '4px 0 8px' }}>{CATEGORY_LABELS[asset.category]} · {asset.kind}{asset.prompt ? ` · „${asset.prompt}“` : ''}</div>
          </>
        ) : null}
        <div className="stats">
          <div className="stat"><b>{doc.width}×{doc.height}</b><span>Sprite-Größe</span></div>
          <div className="stat"><b>{doc.animations.reduce((n, a) => n + a.frames.length, 0)}</b><span>Frames</span></div>
          <div className="stat"><b>{doc.palette.length}</b><span>Farben</span></div>
          <div className="stat"><b>{groups.length}</b><span>Animationen</span></div>
        </div>
        <ul className="lock-checks">
          <li className={consistent ? 'ok' : ''}>{consistent ? '✓' : '✗'} gleiche Pixelgröße in allen Frames</li>
          <li className="ok">✓ eine gemeinsame Palette (indiziert)</li>
          <li className={doc.source ? 'ok' : ''}>{doc.source ? '✓ gleiche Quelle, Perspektive, Outline & Licht' : '– gezeichnet/importiert (keine Quelle)'}</li>
          {doc.source && <li className="ok">✓ Ansicht: {doc.source.render.view} · {doc.source.render.ppv} px/Voxel</li>}
        </ul>
      </div>

      {!doc.atlas && (
        <div className="section">
          <h3>Animationen</h3>
          <div className="anim-groups">
            {groups.map(([name, dirs]) => (
              <div key={name} className="anim-group">
                <span className="anim-name">{CHARACTER_ANIMS.find((c) => c.id === name)?.name ?? name}</span>
                <span className="dir-chips">
                  {dirs.map((d) => (
                    <button key={d.index} className={`chip ${d.index === s.anim ? 'on' : ''}`} title={`${DIRECTION_LABEL[d.direction]} · ${d.frames} Frames`} onClick={() => s.set({ anim: d.index, frame: 0 })}>
                      {d.direction === 'none' ? '●' : DIRECTION_ARROWS[d.direction]}
                    </button>
                  ))}
                </span>
                <button className="icon-btn" title="Animation löschen" onClick={() => s.docEdit(`Animation ${name} löschen`, (dd) => (dd.animations = dd.animations.filter((x) => x.name !== name)))}>
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
          </div>
          <button className="btn small" style={{ marginTop: 6 }} onClick={() => {
            const name = prompt('Name der neuen (leeren) Animation', 'custom');
            if (!name) return;
            s.docEdit('Animation anlegen', (d) => d.animations.push({ id: `${name}_${Date.now()}`, name, direction: 'none', fps: 8, loop: true, frames: [cloneImage(d.animations[s.anim]?.frames[s.frame] ?? createImage(d.width, d.height))] }));
            useSprite.setState({ anim: doc.animations.length - 1, frame: 0 });
          }}>+ Eigene Animation (von Hand)</button>
        </div>
      )}

      {doc.source && (
        <div className="section">
          <h3>Animationen generieren</h3>
          <div className="hint" style={{ marginBottom: 6 }}>Frames entstehen aus derselben Quelle – Farben, Kleidung, Körperform und Pixelgröße bleiben identisch.</div>
          <div className="anim-settings">
            {animList.map((a) => {
              const st = g.animSettings[a.id] ?? { enabled: false, frames: a.frames, fps: a.fps };
              const setSt = (p: Partial<typeof st>) => g.set({ animSettings: { ...g.animSettings, [a.id]: { ...st, ...p } } });
              return (
                <div key={a.id} className="anim-setting">
                  <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={st.enabled} onChange={(e) => setSt({ enabled: e.target.checked })} /> {a.name}</label>
                  <input type="number" min={1} max={32} value={st.frames} title="Frames" onChange={(e) => setSt({ frames: Number(e.target.value) })} />
                  <input type="number" min={1} max={60} value={st.fps} title="FPS" onChange={(e) => setSt({ fps: Number(e.target.value) })} />
                </div>
              );
            })}
          </div>
          <div className="field" style={{ marginTop: 6 }}>
            <label>Blickrichtungen</label>
            <div className="seg">
              {[1, 4, 8].map((n) => <button key={n} className={dirCount === n ? 'on' : ''} onClick={() => setDirCount(n)}>{n}</button>)}
            </div>
          </div>
          <button className="btn primary" style={{ width: '100%' }} disabled={!!g.busy} onClick={generate}>
            Ausgewählte erzeugen / ersetzen
          </button>
        </div>
      )}

      <div className="section">
        <h3>Export</h3>
        <div className="grid-2">
          <button className="btn small" onClick={() => exportSheetPng(doc, asset?.name ?? 'sprite')}>Sheet PNG</button>
          <button className="btn small" onClick={() => exportSheetMeta(doc, asset?.name ?? 'sprite', asset?.category ?? 'character')}>Metadaten</button>
          <button className="btn small" onClick={() => exportFramesZip(doc, asset?.name ?? 'sprite', asset?.category ?? 'character')}>Frames ZIP</button>
          <button className="btn small primary" disabled={!asset} onClick={() => asset && exportAssetGodot({ ...asset, sprite: serializeSpriteDoc(doc) }, g.project)}>Godot ZIP</button>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>Godot: res://assets/{'<kategorie>'}/{'<name>'}/ mit .png, .tres (SpriteFrames/TileSet) und metadata.json.</div>
      </div>
    </aside>
  );
}

const DIRECTION_ARROWS: Record<Direction, string> = { down: '↓', down_right: '↘', right: '→', up_right: '↗', up: '↑', up_left: '↖', left: '←', down_left: '↙', none: '●' };

// ---------------------------------------------------------------- Hooks

/** Änderungen im Editor verzögert in die Bibliothek zurückschreiben. */
function useSyncToLibrary() {
  const rev = useSprite((s) => s.rev);
  useEffect(() => {
    const { doc, assetId } = useSprite.getState();
    if (!doc || !assetId) return;
    const t = setTimeout(() => useGame.getState().updateAsset(assetId, { sprite: serializeSpriteDoc(doc), thumbnail: docThumbnail(doc) }), 900);
    return () => clearTimeout(t);
  }, [rev]);
}

function useSpriteShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useGame.getState().workspace !== 'sprite') return;
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      const s = useSprite.getState();
      if (!s.doc) return;
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && k === 'z') return e.preventDefault(), e.shiftKey ? s.redo() : s.undo();
      if (mod && k === 'y') return e.preventDefault(), s.redo();
      if (mod) return;
      const tool = TOOLS.find((t) => t.key.toLowerCase() === k);
      if (tool) return s.set({ tool: tool.id });
      if (k === 'x') return s.set({ mirror: !s.mirror });
      const a = s.doc.animations[s.anim];
      if (k === 'arrowright' || k === '.') return s.set({ frame: (s.frame + 1) % a.frames.length });
      if (k === 'arrowleft' || k === ',') return s.set({ frame: (s.frame - 1 + a.frames.length) % a.frames.length });
      if (k === 'enter') return s.set({ playing: !s.playing });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export { currentDirections };
