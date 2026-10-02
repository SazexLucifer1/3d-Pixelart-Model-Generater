import { useRef, useState } from 'react';
import { useEditor } from '../state/editorStore';
import { runAssetGeneration } from '../services/assetGenerator';
import { useGame } from '../state/gameStore';
import type { OutputKind } from '../../shared/ai/intent';
import { exportGameFile } from '../services/gamePersistence';
import { exportProjectGodot } from '../services/gameExport';
import { exportProject, importFile } from '../services/exporters';
import { VoxelModel } from '../../shared/voxel/VoxelModel';
import { Icon } from './Icon';
import { ProjectsDialog } from './ProjectsDialog';

export const EXAMPLE_PROMPTS: { group: string; items: string[] }[] = [
  { group: 'Charaktere & Gegner (2D-Sprites)', items: [
    'Erstelle einen Waldläufer Charakter für mein Fantasy RPG',
    'Ein weiblicher Waldläufer aus einem Fantasy JRPG mit grüner Lederrüstung und einem Bogen',
    'Ein Ritter mit silberner Rüstung, rotem Umhang und Schild',
    'Ein Magier mit blauer Robe und leuchtendem Stab',
    'Ein Skelett Gegner mit Schwert',
    'Ein roter Drache als Boss',
    'Ein grüner Schleim Gegner',
  ] },
  { group: 'Animationen für vorhandene Charaktere', items: [
    'Erstelle eine Angriff Animation für diesen Charakter',
    'Erstelle eine Laufanimation für meinen Ritter',
    'Erstelle eine Zauber und Sieg Animation für diesen Charakter',
  ] },
  { group: 'Items, Gebäude & Umgebung', items: [
    'Ein goldenes Schwert', 'Ein Heiltrank', 'Ein Helm mit Hörnern', 'Ein alter Schlüssel als Quest Item',
    'Eine alte verfallene Burg mit Moos und zerstörten Mauern', 'Eine Holzhütte mit Moos auf dem Dach', 'Eine Tür', 'Eine Windmühle', 'Eine Tanne mit Schnee', 'Ein Brunnen',
  ] },
  { group: 'Karten, Effekte & UI', items: [
    'Ein Waldgebiet für eine RPG Karte', 'Kerker Dungeon Tiles', 'Strand mit Wasser Tiles', 'Ein Feuerzauber für einen Magier', 'Ein Heilzauber', 'Explosion Effekt', 'Ein Inventar UI im Holzstil',
  ] },
  { group: '3D-Voxel (MagicaVoxel-Stil)', items: [
    '3D Voxel: Ein kleiner Fantasy-Krieger mit grüner Rüstung, Schwert und Umhang im Stil eines alten JRPGs',
    '3D Voxel: Eine mittelalterliche Holzhütte mit Moos auf dem Dach und einem kleinen Lagerfeuer',
    '3D Voxel: Ein roter Drache im Pixel-Art-Stil',
  ] },
];

const OUTPUTS: { id: OutputKind | 'auto'; name: string }[] = [
  { id: 'auto', name: 'Automatisch' },
  { id: 'sprite', name: '2D-Sprite' },
  { id: 'voxel', name: '3D-Voxel' },
  { id: 'tileset', name: 'Tileset/Karte' },
  { id: 'effect', name: 'Effekt' },
  { id: 'ui', name: 'UI-Kit' },
];

/**
 * Obere Leiste: Prompt-Eingabe, Generieren, Neu/Öffnen/Speichern/Export.
 */
export function TopBar({ onExport }: { onExport: () => void }) {
  const prompt = useEditor((s) => s.prompt);
  const generating = useEditor((s) => s.generating);
  const busy = useGame((s) => s.busy);
  const output = useGame((s) => s.output);
  const workspace = useGame((s) => s.workspace);
  const isBusy = generating || !!busy;
  const set = useEditor((s) => s.set);
  const [showExamples, setShowExamples] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
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
              runAssetGeneration();
            }
          }}
          aria-label="Text-Prompt"
        />
        <button className="btn small" title="Beispiel-Prompts" onClick={() => setShowExamples((v) => !v)}>
          Beispiele ▾
        </button>
        {showExamples && (
          <div className="examples" onMouseLeave={() => setShowExamples(false)}>
            {EXAMPLE_PROMPTS.map((grp) => (
              <div key={grp.group}>
                <div className="label-sm" style={{ padding: '6px 8px 2px' }}>{grp.group}</div>
                {grp.items.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      const voxel = p.startsWith('3D Voxel: ');
                      set({ prompt: voxel ? p.slice(10) : p });
                      useGame.getState().set({ output: voxel ? 'voxel' : 'auto' });
                      setShowExamples(false);
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        <select className="output-select" value={output} title="Ausgabeformat" onChange={(e) => useGame.getState().set({ output: e.target.value as OutputKind | 'auto' })}>
          {OUTPUTS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <button className="btn primary generate" onClick={() => runAssetGeneration()} disabled={isBusy} title="Generieren (Enter)">
          {isBusy ? <span className="spinner" /> : <Icon name="spark" />}
          {isBusy ? 'Generiere…' : 'Generieren'}
        </button>
      </div>

      {workspace !== 'voxel' ? (
        <div className="top-actions">
          <button className="btn" onClick={exportGameFile} title="Spielprojekt (alle Assets + Stilprofile) als Datei speichern">Projekt speichern</button>
          <button className="btn" onClick={() => exportProjectGodot(useGame.getState().project)} title="Alle Assets als Godot-Ordnerstruktur (ZIP)">Godot-Export</button>
        </div>
      ) : (
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
        <button className="btn" onClick={() => setShowProjects(true)} title="Projekte auf dem Server speichern/öffnen">
          Projekte
        </button>
        <button className="btn" onClick={onExport} title="Exportieren (PNG, Sprite Sheet, GLTF, OBJ, VOX)">
          Exportieren ▾
        </button>
      </div>
      )}
      {showProjects && <ProjectsDialog onClose={() => setShowProjects(false)} onOpenFile={() => fileRef.current?.click()} />}
    </header>
  );
}
