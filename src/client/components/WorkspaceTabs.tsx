import { useGame, type Workspace } from '../state/gameStore';

const TABS: { id: Workspace; name: string; hint: string }[] = [
  { id: 'sprite', name: '2D Pixel-Editor', hint: 'Sprites, Animationen, Sprite Sheets, Tiles, Effekte, UI – pixelweise bearbeitbar' },
  { id: 'voxel', name: '3D Voxel-Editor', hint: 'MagicaVoxel-ähnlicher Editor für 3D-Pixel-Art' },
  { id: 'library', name: 'Bibliothek', hint: 'Alle eigenen generierten Assets dieses Spielprojekts' },
  { id: 'style', name: 'Stil & Referenzen', hint: 'Art-Style-Profil, Style Lock, Palette, Referenzbilder' },
];

/**
 * Arbeitsbereich-Auswahl, aktives Stilprofil (Style Lock) und Einstellungen
 * des Sprite-Generators.
 */
export function WorkspaceTabs() {
  const g = useGame();
  const p = g.profile();
  return (
    <nav className="ws-tabs">
      {TABS.map((t) => (
        <button key={t.id} className={`ws-tab ${g.workspace === t.id ? 'on' : ''}`} title={t.hint} onClick={() => g.set({ workspace: t.id })}>
          {t.name}
          {t.id === 'library' && <span className="count">{g.project.assets.length}</span>}
        </button>
      ))}
      <div className="ws-settings">
        {g.workspace !== 'voxel' && (
          <>
            <label title="Sprite-Größe (Auto = laut Stilprofil und Asset-Kategorie)">
              Größe
              <select value={String(g.spriteSize)} onChange={(e) => g.set({ spriteSize: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })}>
                <option value="auto">Auto ({p.pixel.characterSize}px)</option>
                {[16, 24, 32, 48, 64, 96, 128].map((n) => <option key={n} value={n}>{n}×{n}</option>)}
              </select>
            </label>
            <label title="Blickrichtungen für Charaktere">
              Richtungen
              <select value={String(g.directions)} onChange={(e) => g.set({ directions: e.target.value === 'profile' ? 'profile' : (Number(e.target.value) as 1 | 4 | 8) })}>
                <option value="profile">Profil ({p.design.directions})</option>
                <option value="1">1</option><option value="4">4</option><option value="8">8</option>
              </select>
            </label>
          </>
        )}
        <button className={`profile-badge ${p.styleLock ? 'locked' : ''}`} onClick={() => g.set({ workspace: 'style' })} title="Aktives Stilprofil – klicken zum Bearbeiten">
          {p.styleLock ? '🔒 Style Lock' : '🔓 frei'} · {p.name} · {p.pixel.characterSize}px · {p.palette.locked ? `${p.palette.colors.length} Farben` : 'Auto-Palette'}
        </button>
      </div>
      {g.busy && <div className="busy"><span className="spinner" /> {g.busy}</div>}
      {g.toast && <div className={`app-toast ${g.toast.kind}`} onClick={() => g.set({ toast: null })}>{g.toast.text}</div>}
    </nav>
  );
}
