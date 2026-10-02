import { useRef, useState } from 'react';
import { useGame } from '../../state/gameStore';
import { useSprite } from '../../state/spriteStore';
import { useEditor } from '../../state/editorStore';
import { CATEGORY_GROUPS, CATEGORY_LABELS, type AssetCategory, type GameAsset } from '../../../shared/library/gameProject';
import { parseSpriteDoc } from '../../../shared/sprite/types';
import { VoxelModel } from '../../../shared/voxel/VoxelModel';
import { exportAssetGodot, exportProjectGodot } from '../../services/gameExport';
import { exportGameFile, importGameFile, saveGameToServer, listServerGames, loadGameFromServer } from '../../services/gamePersistence';
import { createGameProject } from '../../../shared/library/gameProject';
import { createProfile } from '../../../shared/style/profile';
import { viewportRef } from '../../render/viewportRef';
import { Icon } from '../Icon';

/**
 * Projektbibliothek: enthält ausschließlich selbst generierte Assets dieses
 * Projekts (keine vorgefertigte Asset-Datenbank).
 */
export function LibraryWorkspace() {
  const g = useGame();
  const [group, setGroup] = useState<string>('Alle');
  const [query, setQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [server, setServer] = useState<{ id: string; name: string; assets: number }[] | null>(null);

  const cats = CATEGORY_GROUPS.find((x) => x.name === group)?.categories;
  const q = query.toLowerCase();
  const assets = g.project.assets.filter((a) => (!cats || cats.includes(a.category)) && (!q || a.name.toLowerCase().includes(q) || a.prompt.toLowerCase().includes(q)));

  const open = (a: GameAsset) => {
    if (a.sprite) {
      useSprite.getState().load(parseSpriteDoc(a.sprite), a.id);
      g.set({ activeSpriteId: a.id, workspace: 'sprite' });
    } else if (a.voxel) {
      useEditor.getState().replaceModel(VoxelModel.fromJSON(a.voxel.model), `Asset geöffnet: ${a.name}`, {
        animations: a.voxel.animations, blueprint: a.voxel.blueprint ?? null, projectName: a.name, prompt: a.prompt, lastSeed: a.voxel.seed ?? null,
      });
      g.set({ activeVoxelId: a.id, workspace: 'voxel' });
      setTimeout(() => viewportRef.get()?.frameModel(), 50);
    }
  };

  return (
    <div className="library">
      <div className="library-head">
        <div>
          <input className="project-name" value={g.project.name} onChange={(e) => g.setProject({ ...g.project, name: e.target.value })} style={{ fontWeight: 700 }} />
          <div className="hint">
            {g.project.assets.length} eigene Assets · {g.project.profiles.length} Stilprofil(e) · Keine vorgefertigten Assets – alles hier wurde in diesem Projekt generiert oder gezeichnet.
          </div>
        </div>
        <div className="btn-row">
          <button className="btn primary" disabled={!g.project.assets.length} onClick={() => exportProjectGodot(g.project).catch((e) => g.notify(String(e), 'error'))}>Ganzes Projekt → Godot ZIP</button>
          <button className="btn" onClick={exportGameFile}>Speichern (.game.json)</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Öffnen</button>
          <button className="btn" onClick={async () => {
            try {
              await saveGameToServer();
              g.notify('Projekt auf dem Server gespeichert', 'ok');
            } catch (e) {
              g.notify(e instanceof Error ? e.message : String(e), 'error');
            }
          }}>Auf Server speichern</button>
          <button className="btn" onClick={async () => {
            try {
              setServer(await listServerGames());
            } catch (e) {
              g.notify(e instanceof Error ? e.message : String(e), 'error');
            }
          }}>Vom Server…</button>
          <button className="btn danger" onClick={() => {
            if (!confirm('Neues, leeres Spielprojekt beginnen? (Aktuelles vorher speichern!)')) return;
            g.setProject(createGameProject('Neues Spiel', createProfile()));
          }}>Neues Projekt</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              await importGameFile(f);
              g.notify('Spielprojekt geladen', 'ok');
            } catch (err) {
              g.notify(err instanceof Error ? err.message : String(err), 'error');
            }
          }} />
        </div>
      </div>
      {server && (
        <div className="server-list">
          <b>Projekte auf dem Server:</b>
          {server.length === 0 && <span className="hint"> keine</span>}
          {server.map((s) => (
            <button key={s.id} className="btn small" onClick={() => loadGameFromServer(s.id).then(() => { setServer(null); g.notify('Projekt geladen', 'ok'); })}>{s.name} ({s.assets})</button>
          ))}
          <button className="btn small" onClick={() => setServer(null)}>✕</button>
        </div>
      )}
      <div className="library-filter">
        {['Alle', ...CATEGORY_GROUPS.map((x) => x.name)].map((n) => (
          <button key={n} className={`chip ${group === n ? 'on' : ''}`} onClick={() => setGroup(n)}>
            {n} <span className="hint">{n === 'Alle' ? g.project.assets.length : g.project.assets.filter((a) => CATEGORY_GROUPS.find((x) => x.name === n)!.categories.includes(a.category)).length}</span>
          </button>
        ))}
        <input placeholder="Suchen (Name, Prompt) …" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {assets.length === 0 ? (
        <div className="empty-big">
          <b>Noch keine Assets</b>
          <p>Die Bibliothek startet leer. Gib oben eine Beschreibung ein (Charakter, Gegner, Waffe, Gebäude, Karten-Tiles, Effekt, UI …) und klicke „Generieren“.</p>
        </div>
      ) : (
        <div className="asset-grid">
          {assets.map((a) => (
            <div key={a.id} className={`asset-card ${a.id === g.activeSpriteId || a.id === g.activeVoxelId ? 'active' : ''}`}>
              <button className="asset-thumb" onClick={() => open(a)} title="Öffnen">
                {a.thumbnail ? <img src={a.thumbnail} alt="" /> : <Icon name={a.kind === 'voxel' ? 'box' : 'paint'} size={28} />}
                <span className={`kind kind-${a.kind}`}>{a.kind === 'voxel' ? '3D' : a.kind === 'sprite' ? '2D' : a.kind}</span>
              </button>
              <input className="asset-name" value={a.name} onChange={(e) => g.updateAsset(a.id, { name: e.target.value })} />
              <select className="asset-cat" value={a.category} onChange={(e) => g.updateAsset(a.id, { category: e.target.value as AssetCategory })}>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <div className="asset-meta" title={a.prompt}>{a.prompt || '—'}</div>
              <div className="asset-actions">
                <button className="btn small" onClick={() => open(a)}>Öffnen</button>
                <button className="btn small" title="Godot-Paket dieses Assets" onClick={() => exportAssetGodot(a, g.project).catch((e) => g.notify(String(e), 'error'))}>Godot</button>
                <button className="btn small" title="Duplizieren" onClick={() => g.addAsset({ ...structuredClone(a), id: `asset_${Date.now().toString(36)}`, name: `${a.name} (Kopie)` })}>⧉</button>
                <button className="btn small danger" title="Löschen" onClick={() => confirm(`„${a.name}“ löschen?`) && g.removeAsset(a.id)}><Icon name="trash" size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
