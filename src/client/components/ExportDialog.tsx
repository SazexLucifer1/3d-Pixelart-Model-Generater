import { useState } from 'react';
import { useEditor } from '../state/editorStore';
import { viewportRef } from '../render/viewportRef';
import { exportGltf, exportObj, exportPng, exportProject, exportSpriteSheet, exportVox } from '../services/exporters';

/**
 * Export-Dialog: PNG, Sprite Sheet, GLTF/GLB, OBJ, VOX, Projekt (JSON).
 */
export function ExportDialog({ onClose }: { onClose: () => void }) {
  const s = useEditor();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pngSize, setPngSize] = useState(1024);
  const [transparent, setTransparent] = useState(true);
  const [cell, setCell] = useState(128);
  const [dirs, setDirs] = useState<1 | 4 | 8>(4);
  const [clipId, setClipId] = useState<string>(s.animations[0]?.id ?? '');

  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const vp = viewportRef.get();
  const name = s.projectName;
  const empty = s.model.size === 0;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Exportieren">
        <header>
          Exportieren – {name}
          <button className="btn small" onClick={onClose}>✕</button>
        </header>
        <div className="body">
          {err && <div className="error-toast" style={{ position: 'static', transform: 'none', maxWidth: '100%' }}>{err}</div>}

          <div>
            <div className="label-sm" style={{ marginBottom: 6 }}>Bild</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <select value={pngSize} onChange={(e) => setPngSize(Number(e.target.value))}>
                {[256, 512, 1024, 2048].map((n) => <option key={n} value={n}>{n}×{n}</option>)}
              </select>
              <label className="check" style={{ margin: 0 }}>
                <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Transparenter Hintergrund
              </label>
            </div>
            <div className="export-grid">
              <button className="export-card" disabled={busy || empty || !vp} onClick={() => run(() => exportPng(vp!, name, pngSize, pngSize, transparent))}>
                <b>PNG Render</b>
                <span>Aktuelle Kameraansicht im Pixel-Art-Rendering</span>
              </button>
            </div>
          </div>

          <div>
            <div className="label-sm" style={{ marginBottom: 6 }}>Sprite Sheet</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <select value={cell} onChange={(e) => setCell(Number(e.target.value))} title="Zellengröße">
                {[64, 96, 128, 192, 256].map((n) => <option key={n} value={n}>{n}px</option>)}
              </select>
              <select value={dirs} onChange={(e) => setDirs(Number(e.target.value) as 1 | 4 | 8)} title="Blickrichtungen">
                <option value={1}>1 Richtung</option>
                <option value={4}>4 Richtungen</option>
                <option value={8}>8 Richtungen</option>
              </select>
              <select value={clipId} onChange={(e) => setClipId(e.target.value)} title="Animation">
                <option value="">Ohne Animation</option>
                {s.animations.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.frames.length} Frames)</option>)}
              </select>
            </div>
            <div className="export-grid">
              <button
                className="export-card"
                disabled={busy || empty || !vp}
                onClick={() => run(() => exportSpriteSheet(vp!, s.model, name, { cell, directions: dirs, clip: s.animations.find((a) => a.id === clipId) ?? null, transparent }))}
              >
                <b>Sprite Sheet (PNG + JSON)</b>
                <span>Zeilen = Richtungen, Spalten = Frames – direkt für 2D-Engines</span>
              </button>
            </div>
          </div>

          <div>
            <div className="label-sm" style={{ marginBottom: 6 }}>3D-Modell</div>
            <div className="export-grid">
              <button className="export-card" disabled={busy || empty || !vp} onClick={() => run(() => exportGltf(vp!, s.model, name, true))}>
                <b>GLB / GLTF</b>
                <span>Für Unity, Godot, Blender, Web (Vertex-Farben, Materialien)</span>
              </button>
              <button className="export-card" disabled={busy || empty} onClick={() => run(() => exportObj(s.model, name))}>
                <b>OBJ + MTL</b>
                <span>Universell, Vertex-Farben + Materialgruppen</span>
              </button>
              <button className="export-card" disabled={busy || empty} onClick={() => run(() => exportVox(s.model, name))}>
                <b>MagicaVoxel .vox</b>
                <span>Voxel-Datei mit Palette (max. 256³)</span>
              </button>
              <button className="export-card" disabled={busy} onClick={() => run(() => exportProject())}>
                <b>Projekt (.voxproj.json)</b>
                <span>Komplett editierbar inkl. Ebenen, Animationen, Prompt & Seed</span>
              </button>
            </div>
          </div>
          {busy && <div className="hint">Exportiere …</div>}
        </div>
      </div>
    </div>
  );
}
