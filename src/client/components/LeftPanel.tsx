import { useEffect, useState } from 'react';
import { useEditor, type ToolId } from '../state/editorStore';
import { actions } from '../editor/actions';
import { Icon } from './Icon';
import { STYLE_LIST, PALETTE_LIST, type StyleId, type PaletteId } from '../../shared/palette/styles';
import type { MaterialType } from '../../shared/voxel/types';
import type { DetailLevel, GeneratorInfo } from '../../shared/ai/types';
import { listGenerators } from '../services/generationService';

export const TOOLS: { id: ToolId; name: string; key: string; hint: string }[] = [
  { id: 'attach', name: 'Hinzufügen', key: 'A', hint: 'Voxel an Fläche anbauen (Ziehen = malen auf Ebene)' },
  { id: 'erase', name: 'Löschen', key: 'E', hint: 'Voxel entfernen' },
  { id: 'paint', name: 'Malen', key: 'P', hint: 'Voxel umfärben' },
  { id: 'pick', name: 'Pipette', key: 'I', hint: 'Farbe, Material und Ebene aufnehmen' },
  { id: 'box', name: 'Box', key: 'B', hint: 'Quader aufziehen · Shift = Höhe · Strg = Box löschen' },
  { id: 'select', name: 'Auswahl', key: 'S', hint: 'Klicken/Rechteck ziehen · Shift = hinzufügen · Strg = entfernen' },
  { id: 'wand', name: 'Zauberstab', key: 'W', hint: 'Zusammenhängende gleiche Farbe · Strg = Farbe global' },
  { id: 'move', name: 'Verschieben', key: 'M', hint: 'Auswahl ziehen · Shift = vertikal · Pfeiltasten/Bild↑↓' },
  { id: 'orbit', name: 'Kamera', key: 'O', hint: 'Linke Maus dreht die Kamera' },
];

const MATERIALS: { id: MaterialType; name: string }[] = [
  { id: 'diffuse', name: 'Matt' },
  { id: 'metal', name: 'Metall' },
  { id: 'emissive', name: 'Leuchtend' },
  { id: 'glass', name: 'Glas' },
];

/**
 * Linke Seite: Werkzeuge, Farben, Stil, Detailgrad, Rendering.
 */
export function LeftPanel() {
  const s = useEditor();
  const palette = s.model.palette;
  const current = palette[s.colorIndex] ?? '#ffffff';
  const [generators, setGenerators] = useState<GeneratorInfo[]>([]);
  const [backend, setBackend] = useState<boolean | null>(null);

  useEffect(() => {
    listGenerators().then((r) => {
      setGenerators(r.generators);
      setBackend(r.backend);
    });
  }, []);

  const gen = s.gen;
  const setGen = (p: Partial<typeof gen>) => s.set({ gen: { ...gen, ...p } });

  return (
    <aside className="panel left">
      <div className="section">
        <h3>Werkzeuge</h3>
        <div className="tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`btn tool ${s.tool === t.id ? 'active' : ''}`}
              title={`${t.name} (${t.key}) – ${t.hint}`}
              onClick={() => s.set({ tool: t.id })}
            >
              <Icon name={t.id} size={18} />
              <kbd>{t.key}</kbd>
            </button>
          ))}
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          <b>{TOOLS.find((t) => t.id === s.tool)?.name}:</b> {TOOLS.find((t) => t.id === s.tool)?.hint}
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <label>
            Pinselgröße <span>{s.brushSize}</span>
          </label>
          <input type="range" min={1} max={5} value={s.brushSize} onChange={(e) => s.set({ brushSize: Number(e.target.value) })} />
        </div>
        <label className="check" title="Änderungen an der X-Achse spiegeln (symmetrisch bauen)">
          <input type="checkbox" checked={s.mirrorX} onChange={(e) => s.set({ mirrorX: e.target.checked })} /> Spiegeln (X-Symmetrie)
        </label>
      </div>

      <div className="section">
        <h3>
          Farben <span className="hint">{palette.length}/256</span>
        </h3>
        <div className="palette">
          {palette.map((c, i) => (
            <button
              key={i}
              className={`swatch ${i === s.colorIndex ? 'on' : ''}`}
              style={{ background: c }}
              title={`${c} – Klick: wählen · Doppelklick: alle Voxel dieser Farbe auswählen`}
              onClick={() => s.set({ colorIndex: i })}
              onDoubleClick={() => actions.selectColor(i)}
            />
          ))}
          <button className="swatch add" title="Neue Farbe hinzufügen" onClick={() => actions.addPaletteColor(current)}>
            <Icon name="plus" size={12} />
          </button>
        </div>
        <div className="current-color">
          <div className="big" style={{ background: current }} title="Farbe bearbeiten (ändert alle Voxel mit dieser Palettenfarbe)">
            <input
              type="color"
              value={current}
              onChange={(e) => {
                if (palette.length === 0) actions.addPaletteColor(e.target.value);
                else actions.setPaletteColor(s.colorIndex, e.target.value);
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <code>{current}</code>
            <div className="hint">Klick auf Feld = Palettenfarbe ändern</div>
          </div>
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <label>Material</label>
          <div className="seg">
            {MATERIALS.map((m) => (
              <button key={m.id} className={s.material === m.id ? 'on' : ''} onClick={() => s.set({ material: m.id })}>
                {m.name}
              </button>
            ))}
          </div>
        </div>
        <div className="btn-row">
          <button className="btn small" onClick={() => actions.compactPalette()} title="Unbenutzte Farben entfernen">
            Palette bereinigen
          </button>
        </div>
      </div>

      <div className="section">
        <h3>Generierung</h3>
        <div className="field">
          <label>
            KI-Generator {backend === false && <span title="Backend nicht erreichbar – Generierung läuft im Browser">offline</span>}
          </label>
          <select value={gen.generator} onChange={(e) => setGen({ generator: e.target.value })}>
            <option value="auto">Automatisch (beste verfügbare)</option>
            {generators.map((g) => (
              <option key={g.id} value={g.id} disabled={!g.available} title={g.description}>
                {g.name}
                {!g.available ? ' (nicht konfiguriert)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Stil</label>
          <select value={gen.style} onChange={(e) => setGen({ style: e.target.value as StyleId | 'auto' })}>
            <option value="auto">Automatisch (aus Prompt)</option>
            {STYLE_LIST.map((st) => (
              <option key={st.id} value={st.id} title={st.description}>
                {st.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>
            Größe (Höhe) <span>{gen.size} Voxel</span>
          </label>
          <input type="range" min={12} max={64} step={2} value={gen.size} onChange={(e) => setGen({ size: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>Detailgrad</label>
          <div className="seg">
            {([1, 2, 3] as DetailLevel[]).map((d) => (
              <button key={d} className={gen.detail === d ? 'on' : ''} onClick={() => setGen({ detail: d })}>
                {d === 1 ? 'Niedrig' : d === 2 ? 'Mittel' : 'Hoch'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Farbpalette</label>
          <select value={gen.palette} onChange={(e) => setGen({ palette: e.target.value as PaletteId })}>
            {PALETTE_LIST.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>
            Seed <span className="hint">leer = zufällig</span>
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              type="number"
              value={gen.seed ?? ''}
              placeholder={s.lastSeed ? `zuletzt ${s.lastSeed}` : 'zufällig'}
              onChange={(e) => setGen({ seed: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <button className="btn small" title="Letzten Seed übernehmen" disabled={!s.lastSeed} onClick={() => setGen({ seed: s.lastSeed })}>
              ↺
            </button>
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Pixel-Rendering</h3>
        <div className="field">
          <label>Render-Stil</label>
          <select value={s.renderStyle} onChange={(e) => s.setRenderStyle(e.target.value as StyleId)}>
            {STYLE_LIST.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>
            Pixelgröße <span>{s.render.pixelScale}×</span>
          </label>
          <input type="range" min={1} max={8} value={s.render.pixelScale} onChange={(e) => s.setRender({ pixelScale: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>
            Posterize <span>{s.render.posterize ? `${s.render.posterize} Stufen` : 'aus'}</span>
          </label>
          <input type="range" min={0} max={16} value={s.render.posterize} onChange={(e) => s.setRender({ posterize: Number(e.target.value) })} />
        </div>
        <label className="check">
          <input type="checkbox" checked={s.render.outline} onChange={(e) => s.setRender({ outline: e.target.checked })} /> Konturen
        </label>
        <label className="check">
          <input type="checkbox" checked={s.render.shadows} onChange={(e) => s.setRender({ shadows: e.target.checked })} /> Schatten
        </label>
        <label className="check">
          <input type="checkbox" checked={s.render.ao} onChange={(e) => s.setRender({ ao: e.target.checked })} /> Ambient Occlusion
        </label>
        <label className="check">
          <input type="checkbox" checked={s.render.showGrid} onChange={(e) => s.setRender({ showGrid: e.target.checked })} /> Raster
        </label>
      </div>
    </aside>
  );
}
