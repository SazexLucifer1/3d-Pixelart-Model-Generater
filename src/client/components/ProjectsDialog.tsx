import { useEffect, useState } from 'react';
import { deleteFromServer, listServerProjects, loadFromServer, saveToServer, type ServerProject } from '../services/projectApi';
import { exportProject } from '../services/exporters';
import { viewportRef } from '../render/viewportRef';

/**
 * Projekte: als Datei speichern oder auf dem Server ablegen/öffnen.
 */
export function ProjectsDialog({ onClose, onOpenFile }: { onClose: () => void; onOpenFile: () => void }) {
  const [projects, setProjects] = useState<ServerProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const refresh = () =>
    listServerProjects()
      .then(setProjects)
      .catch(() => {
        setProjects([]);
        setError('Backend nicht erreichbar – Projekte können nur als Datei gespeichert werden.');
      });
  useEffect(() => {
    refresh();
  }, []);

  const wrap = (fn: () => Promise<unknown>, msg?: string) => async () => {
    setError(null);
    try {
      await fn();
      if (msg) setInfo(msg);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Projekte">
        <header>
          Projekte
          <button className="btn small" onClick={onClose}>✕</button>
        </header>
        <div className="body">
          {error && <div className="hint" style={{ color: 'var(--danger)' }}>{error}</div>}
          {info && <div className="hint" style={{ color: 'var(--good)' }}>{info}</div>}
          <div className="btn-row">
            <button className="btn" onClick={() => exportProject()}>Als Datei speichern (.voxproj.json)</button>
            <button className="btn" onClick={() => { onClose(); onOpenFile(); }}>Datei öffnen…</button>
            <button className="btn primary" onClick={wrap(() => saveToServer(), 'Auf dem Server gespeichert')}>Auf Server speichern</button>
            <button className="btn" onClick={wrap(() => saveToServer(true), 'Als neues Projekt gespeichert')}>Als neu speichern</button>
          </div>
          <div>
            <div className="label-sm" style={{ marginBottom: 6 }}>Auf dem Server ({projects?.length ?? '…'})</div>
            <div className="layers">
              {projects?.map((p) => (
                <div key={p.id} className="layer" style={{ gridTemplateColumns: '1fr auto auto' }}>
                  <span className="name" title={p.id}>
                    {p.name} <span className="hint">· {p.voxels} Voxel · {new Date(p.updatedAt).toLocaleString('de-DE')}</span>
                  </span>
                  <button className="btn small" onClick={wrap(async () => { await loadFromServer(p.id); viewportRef.get()?.frameModel(); onClose(); })}>Öffnen</button>
                  <button className="btn small danger" onClick={wrap(() => (confirm(`„${p.name}“ löschen?`) ? deleteFromServer(p.id) : Promise.resolve()))}>Löschen</button>
                </div>
              ))}
              {projects?.length === 0 && !error && <span className="hint">Noch keine Projekte auf dem Server.</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
