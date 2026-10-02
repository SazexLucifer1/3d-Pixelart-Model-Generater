import { useRef, useState } from 'react';
import { useEditor } from '../state/editorStore';
import { runGeneration } from '../hooks/useGeneration';
import { exportProject, importFile } from '../services/exporters';
import { VoxelModel } from '../../shared/voxel/VoxelModel';
import { Icon } from './Icon';

export const EXAMPLE_PROMPTS = [
  'Ein kleiner Fantasy-Krieger mit grüner Rüstung, Schwert und Umhang im Stil eines alten JRPGs',
  'Eine mittelalterliche Holzhütte mit Moos auf dem Dach und einem kleinen Lagerfeuer',
  'Ein roter Drache im Pixel-Art-Stil',
  'Ein alter Magier mit blauer Robe und leuchtendem Stab neben einem Magierturm bei Nacht',
  'Ein Ritter mit silberner Rüstung, rotem Umhang und Schild',
  'A cute pink slime with a golden crown',
  'Ein Zwerg mit Axt vor einer verschneiten Tanne',
  'Eine Burg mit blauen Dächern auf einer Wiese',
  'Sci-Fi Raumschiff mit roten Streifen',
  'Eine offene Schatztruhe voller Gold neben einem Kristall',
  'Ein Fuchs neben einem Fliegenpilz',
  'Ein Skelett-Krieger in Dark Fantasy',
];

/**
 * Obere Leiste: Prompt-Eingabe, Generieren, Neu/Öffnen/Speichern/Export.
 */
export function TopBar({ onExport }: { onExport: () => void }) {
  const prompt = useEditor((s) => s.prompt);
  const generating = useEditor((s) => s.generating);
  const set = useEditor((s) => s.set);
  const [showExamples, setShowExamples] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const newProject = () => {
    if (!confirm('Neues, leeres Projekt beginnen? (Rückgängig ist möglich)')) return;
    const m = new VoxelModel(['#e6e7ef', '#8a8f98', '#4a4e57', '#24222b', '#c8323c', '#e8742a', '#f2c53d', '#4a9e3f', '#2a9d8f', '#3a62c8', '#7c3fae', '#e86fa8', '#8a5a34', '#f0c49a']);
    m.layers[0].name = 'Ebene 1';
    useEditor.getState().replaceModel(m, 'Neues Projekt', { projectName: 'Unbenannt', blueprint: null, animations: [] });
    useEditor.getState().set({ tool: 'attach', colorIndex: 4 });
  };

  return (
    <header className="topbar">
      <div className="logo">
        <svg className="cube" viewBox="0 0 16 16" shapeRendering="crispEdges">
          <path fill="#ffb347" d="M8 1l6 3.5v7L8 15l-6-3.5v-7z" />
          <path fill="#e0683a" d="M8 8l6-3.5v7L8 15z" />
          <path fill="#ffd88a" d="M2 4.5L8 1l6 3.5L8 8z" />
        </svg>
        <div>
          VOXEL FORGE
          <small>KI 3D Pixel-Art Generator</small>
        </div>
      </div>

      <div className="prompt-wrap">
        <textarea
          value={prompt}
          placeholder="Beschreibe dein Modell, z.B. „Ein roter Drache mit goldenen Hörnern“ …"
          onChange={(e) => set({ prompt: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              runGeneration();
            }
          }}
          aria-label="Text-Prompt"
        />
        <button className="btn small" title="Beispiel-Prompts" onClick={() => setShowExamples((v) => !v)}>
          Beispiele ▾
        </button>
        {showExamples && (
          <div className="examples" onMouseLeave={() => setShowExamples(false)}>
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  set({ prompt: p });
                  setShowExamples(false);
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <button className="btn primary generate" onClick={() => runGeneration()} disabled={generating} title="Generieren (Enter)">
          {generating ? <span className="spinner" /> : <Icon name="spark" />}
          {generating ? 'Generiere…' : 'Generieren'}
        </button>
      </div>

      <div className="top-actions">
        <button className="btn" onClick={newProject} title="Neues leeres Projekt">
          Neu
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()} title="Projekt (.json), MagicaVoxel (.vox), OBJ oder Bild öffnen">
          Öffnen
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.vox,.obj,.png,.jpg,.jpeg,.gif,.webp"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              await importFile(f);
            } catch (err) {
              set({ generationError: err instanceof Error ? err.message : String(err) });
            }
          }}
        />
        <button className="btn" onClick={() => exportProject()} title="Projekt als .voxproj.json speichern (Strg+S)">
          Speichern
        </button>
        <button className="btn" onClick={onExport} title="Exportieren (PNG, Sprite Sheet, GLTF, OBJ, VOX)">
          Exportieren ▾
        </button>
      </div>
    </header>
  );
}
