import { useMemo, useState } from 'react';
import { useEditor } from '../state/editorStore';
import { actions } from '../editor/actions';
import { Icon } from './Icon';
import { voxelToSprite } from '../services/assetGenerator';
import { useGame } from '../state/gameStore';
import { selectionBounds } from '../../shared/voxel/transforms';
import type { MaterialType } from '../../shared/voxel/types';

/**
 * Rechte Seite: Objektinformationen, Auswahl-Werkzeuge, Ebenen, Farben,
 * Animationen und die KI-Analyse des Prompts.
 */
export function RightPanel() {
  return (
    <aside className="panel right">
      <InfoSection />
      <SelectionSection />
      <LayersSection />
      <AnimationSection />
      <AnalysisSection />
    </aside>
  );
}

function InfoSection() {
  const revision = useEditor((s) => s.revision);
  const model = useEditor((s) => s.model);
  const name = useEditor((s) => s.projectName);
  const prompt = useEditor((s) => s.lastRequest?.prompt);
  const busy = useGame((s) => !!s.busy);
  const info = useMemo(() => {
    const b = model.bounds();
    const usage = model.colorUsage();
    const mats = new Map<MaterialType, number>();
    for (const v of model.values()) mats.set(v.m, (mats.get(v.m) ?? 0) + 1);
    return {
      size: b ? `${b.maxX - b.minX + 1}×${b.maxY - b.minY + 1}×${b.maxZ - b.minZ + 1}` : '–',
      usage: [...usage.entries()].sort((a, c) => c[1] - a[1]),
      mats,
    };
  }, [model, revision]);
  const [editingName, setEditingName] = useState(false);

  return (
    <div className="section">
      <h3>Objekt</h3>
      {editingName ? (
        <input
          autoFocus
          defaultValue={name}
          style={{ width: '100%', marginBottom: 6 }}
          onBlur={(e) => {
            useEditor.getState().set({ projectName: e.target.value || 'Unbenannt' });
            setEditingName(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      ) : (
        <div className="title-line" title="Doppelklick zum Umbenennen" onDoubleClick={() => setEditingName(true)}>
          {name}
        </div>
      )}
      {prompt && <div className="hint" style={{ marginBottom: 8 }}>„{prompt}“</div>}
      <div className="stats">
        <div className="stat">
          <b>{model.size.toLocaleString('de-DE')}</b>
          <span>Voxel</span>
        </div>
        <div className="stat">
          <b>{info.size}</b>
          <span>Größe B×H×T</span>
        </div>
        <div className="stat">
          <b>{info.usage.length}</b>
          <span>Farben genutzt</span>
        </div>
        <div className="stat">
          <b>{model.layers.length}</b>
          <span>Ebenen</span>
        </div>
      </div>
      <div className="label-sm" style={{ margin: '10px 0 4px' }}>
        Farben (Klick = auswählen)
      </div>
      <div className="color-usage">
        {info.usage.map(([c, n]) => (
          <button
            key={c}
            style={{ background: model.palette[c] }}
            title={`${model.palette[c]} · ${n} Voxel`}
            onClick={() => {
              useEditor.getState().set({ colorIndex: c });
              actions.selectColor(c);
            }}
          />
        ))}
      </div>
      <button
        className="btn small"
        style={{ width: '100%', marginTop: 8 }}
        disabled={model.size === 0 || busy}
        title="Rendert dieses 3D-Modell (inkl. deiner Voxel-Änderungen) mit dem aktiven Stilprofil als 2D-Pixel-Sprite mit Animationen"
        onClick={() => voxelToSprite()}
      >
        → Als 2D-Sprite rendern (Stilprofil)
      </button>
      {info.mats.size > 1 && (
        <div className="hint" style={{ marginTop: 6 }}>
          {[...info.mats.entries()].map(([m, n]) => `${m}: ${n}`).join(' · ')}
        </div>
      )}
    </div>
  );
}

function SelectionSection() {
  const selection = useEditor((s) => s.selection);
  const model = useEditor((s) => s.model);
  const layers = useEditor((s) => s.model.layers);
  useEditor((s) => s.revision);
  const b = selection.size ? selectionBounds(model, selection) : null;
  const disabled = selection.size === 0;
  return (
    <div className="section">
      <h3>
        Auswahl <span className="hint">{selection.size ? `${selection.size} Voxel` : 'leer'}</span>
      </h3>
      {b && (
        <div className="hint" style={{ marginBottom: 6 }}>
          {b.maxX - b.minX + 1}×{b.maxY - b.minY + 1}×{b.maxZ - b.minZ + 1} bei ({b.minX}, {b.minY}, {b.minZ})
        </div>
      )}
      <div className="btn-row" style={{ marginBottom: 6 }}>
        <button className="btn small" onClick={actions.selectAll} title="Strg+A">Alles</button>
        <button className="btn small" onClick={actions.deselect} disabled={disabled} title="Esc">Keine</button>
        <button className="btn small" onClick={actions.invertSelection}>Invertieren</button>
      </div>
      <div className="label-sm">Verschieben</div>
      <div className="grid-3" style={{ margin: '4px 0 8px' }}>
        <button className="btn small" disabled={disabled} onClick={() => actions.move(-1, 0, 0)}>X−</button>
        <button className="btn small" disabled={disabled} onClick={() => actions.move(0, 1, 0)}>Y+</button>
        <button className="btn small" disabled={disabled} onClick={() => actions.move(1, 0, 0)}>X+</button>
        <button className="btn small" disabled={disabled} onClick={() => actions.move(0, 0, -1)}>Z−</button>
        <button className="btn small" disabled={disabled} onClick={() => actions.move(0, -1, 0)}>Y−</button>
        <button className="btn small" disabled={disabled} onClick={() => actions.move(0, 0, 1)}>Z+</button>
      </div>
      <div className="label-sm">Drehen 90° / Spiegeln</div>
      <div className="grid-3" style={{ margin: '4px 0 8px' }}>
        <button className="btn small" disabled={disabled} onClick={() => actions.rotate('x')}>⟳ X</button>
        <button className="btn small" disabled={disabled} onClick={() => actions.rotate('y')} title="R">⟳ Y</button>
        <button className="btn small" disabled={disabled} onClick={() => actions.rotate('z')}>⟳ Z</button>
        <button className="btn small" disabled={disabled} onClick={() => actions.mirror('x')}>⇋ X</button>
        <button className="btn small" disabled={disabled} onClick={() => actions.mirror('y')}>⇵ Y</button>
        <button className="btn small" disabled={disabled} onClick={() => actions.mirror('z')}>⇋ Z</button>
      </div>
      <div className="label-sm">Skalieren / Kopieren</div>
      <div className="grid-3" style={{ margin: '4px 0 8px' }}>
        <button className="btn small" disabled={disabled} onClick={() => actions.scale(0.5)}>×½</button>
        <button className="btn small" disabled={disabled} onClick={() => actions.scale(1.5)}>×1,5</button>
        <button className="btn small" disabled={disabled} onClick={() => actions.scale(2)}>×2</button>
        <button className="btn small" disabled={disabled} onClick={actions.duplicate} title="Strg+D">Duplizieren</button>
        <button className="btn small" disabled={disabled} onClick={actions.copy} title="Strg+C">Kopieren</button>
        <button className="btn small" onClick={actions.paste} title="Strg+V">Einfügen</button>
        <button className="btn small" disabled={disabled} onClick={() => actions.symmetrize('x')} title="Gespiegelte Kopie auf die andere Seite">Symmetrie</button>
        <button className="btn small" disabled={disabled} onClick={actions.recolor} title="Mit aktueller Farbe füllen">Umfärben</button>
        <button className="btn small danger" disabled={disabled} onClick={actions.remove} title="Entf">Löschen</button>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Material / Ebene der Auswahl</label>
        <div style={{ display: 'flex', gap: 4 }}>
          <select disabled={disabled} value="" onChange={(e) => e.target.value && actions.setMaterial(e.target.value as MaterialType)}>
            <option value="">Material…</option>
            <option value="diffuse">Matt</option>
            <option value="metal">Metall</option>
            <option value="emissive">Leuchtend</option>
            <option value="glass">Glas</option>
          </select>
          <select disabled={disabled} value="" onChange={(e) => e.target.value !== '' && actions.toLayer(Number(e.target.value))}>
            <option value="">Ebene…</option>
            {layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function LayersSection() {
  const model = useEditor((s) => s.model);
  const revision = useEditor((s) => s.revision);
  const active = useEditor((s) => s.activeLayer);
  const counts = useMemo(() => model.layerVoxelCount(), [model, revision]);
  const [editing, setEditing] = useState<number | null>(null);
  return (
    <div className="section">
      <h3>
        Ebenen
        <span className="btn-row">
          <button className="btn small icon" title="Neue Ebene" onClick={actions.addLayer}>
            <Icon name="plus" size={12} />
          </button>
        </span>
      </h3>
      <div className="layers">
        {model.layers.map((l) => (
          <div
            key={l.id}
            className={`layer ${l.id === active ? 'active' : ''}`}
            onClick={() => useEditor.getState().set({ activeLayer: l.id })}
            onDoubleClick={() => setEditing(l.id)}
            title={`${l.name}${l.role ? ` (Rolle: ${l.role})` : ''} – Klick: aktiv · Doppelklick: umbenennen`}
          >
            <button title="Sichtbarkeit" onClick={(e) => (e.stopPropagation(), actions.toggleLayer(l.id, 'visible'))}>
              <Icon name={l.visible ? 'eye' : 'eyeOff'} size={14} />
            </button>
            <button title="Sperren" onClick={(e) => (e.stopPropagation(), actions.toggleLayer(l.id, 'locked'))}>
              <Icon name={l.locked ? 'lock' : 'unlock'} size={14} />
            </button>
            {editing === l.id ? (
              <input
                autoFocus
                defaultValue={l.name}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  if (e.target.value && e.target.value !== l.name) actions.renameLayer(l.id, e.target.value);
                  setEditing(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <span className="name" style={{ opacity: l.visible ? 1 : 0.5 }}>
                {l.name}
              </span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span className="count">{counts.get(l.id) ?? 0}</span>
              <button title="Voxel dieser Ebene auswählen" onClick={(e) => (e.stopPropagation(), actions.selectLayer(l.id))}>
                <Icon name="select" size={12} />
              </button>
              <button title="Ebene samt Voxeln löschen" onClick={(e) => (e.stopPropagation(), confirm(`Ebene „${l.name}“ löschen?`) && actions.deleteLayer(l.id))}>
                <Icon name="trash" size={12} />
              </button>
            </span>
          </div>
        ))}
      </div>
      <div className="hint" style={{ marginTop: 6 }}>Neue Voxel landen auf der aktiven Ebene.</div>
    </div>
  );
}

function AnimationSection() {
  const animations = useEditor((s) => s.animations);
  const activeClip = useEditor((s) => s.activeClip);
  const playing = useEditor((s) => s.playing);
  const frame = useEditor((s) => s.frame);
  const set = useEditor((s) => s.set);
  const clip = animations.find((a) => a.id === activeClip);
  return (
    <div className="section">
      <h3>
        Animationen
        <button className="btn small" onClick={actions.regenerateAnimations} title="Animationen aus den Ebenen-Rollen neu berechnen (nach Bearbeitungen)">
          Neu berechnen
        </button>
      </h3>
      {animations.length === 0 && <div className="hint">Keine Animationen. Generierte Modelle erhalten automatisch passende Animationen (Idle, Laufen, Angriff …).</div>}
      {animations.map((a) => (
        <div
          key={a.id}
          className={`clip ${a.id === activeClip ? 'on' : ''}`}
          onClick={() => set({ activeClip: a.id === activeClip ? null : a.id, frame: 0, playing: a.id !== activeClip })}
        >
          <Icon name={a.id === activeClip && playing ? 'stop' : 'play'} size={12} />
          {a.name}
          <span className="frames">
            {a.frames.length}f · {a.fps}fps
          </span>
        </div>
      ))}
      {clip && (
        <div style={{ marginTop: 8 }}>
          <div className="btn-row" style={{ alignItems: 'center' }}>
            <button className="btn small" onClick={() => set({ playing: !playing })}>
              <Icon name={playing ? 'stop' : 'play'} size={12} /> {playing ? 'Stopp' : 'Abspielen'}
            </button>
            <button className="btn small" onClick={() => set({ activeClip: null, playing: false, frame: 0 })}>
              Zum Basismodell
            </button>
          </div>
          <div className="field" style={{ marginTop: 6 }}>
            <label>
              Frame <span>{frame + 1}/{clip.frames.length}</span>
            </label>
            <input type="range" min={0} max={clip.frames.length - 1} value={frame} onChange={(e) => set({ frame: Number(e.target.value), playing: false })} />
          </div>
          <div className="field">
            <label>
              Geschwindigkeit <span>{clip.fps} fps</span>
            </label>
            <input
              type="range"
              min={1}
              max={24}
              value={clip.fps}
              onChange={(e) => set({ animations: animations.map((a) => (a.id === clip.id ? { ...a, fps: Number(e.target.value) } : a)) })}
            />
          </div>
          <div className="hint">Während der Wiedergabe ist das Bearbeiten gesperrt. Frames sind als Voxel-Änderungen gespeichert.</div>
        </div>
      )}
    </div>
  );
}

function AnalysisSection() {
  const blueprint = useEditor((s) => s.blueprint);
  if (!blueprint) return null;
  return (
    <div className="section">
      <h3>KI-Analyse</h3>
      <ul className="notes">
        {blueprint.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
