import { useEditor } from '../state/editorStore';
import { applyResult } from '../hooks/useGeneration';
import { Icon } from './Icon';

/**
 * Untere Leiste: Undo/Redo mit Bearbeitungsverlauf und der
 * Generierungsverlauf (Klick lädt ein früheres Ergebnis wieder).
 */
export function BottomBar() {
  const undoStack = useEditor((s) => s.undoStack);
  const redoStack = useEditor((s) => s.redoStack);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const history = useEditor((s) => s.generationHistory);

  return (
    <footer className="bottombar">
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn" onClick={undo} disabled={!undoStack.length} title="Rückgängig (Strg+Z)">
          <Icon name="undo" /> Rückgängig
        </button>
        <button className="btn" onClick={redo} disabled={!redoStack.length} title="Wiederholen (Strg+Y)">
          <Icon name="redo" /> Wiederholen
        </button>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="label-sm">Bearbeitungsverlauf ({undoStack.length})</div>
        <div className="history-list">
          {undoStack.slice(-30).map((e, i, arr) => (
            <span key={i} className={`history-item ${i === arr.length - 1 ? 'last' : ''}`}>
              {e.label}
            </span>
          ))}
          {[...redoStack].reverse().slice(0, 10).map((e, i) => (
            <span key={`r${i}`} className="history-item redo">
              {e.label}
            </span>
          ))}
          {!undoStack.length && !redoStack.length && <span className="hint">Noch keine Änderungen</span>}
        </div>
      </div>
      <div style={{ minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="label-sm">Generierungsverlauf ({history.length})</div>
        <div className="gen-history">
          {history.map((h) => (
            <button
              key={h.id}
              className="gen-thumb"
              style={{ backgroundImage: h.thumbnail ? `url(${h.thumbnail})` : undefined }}
              title={`${h.prompt}\n${new Date(h.createdAt).toLocaleString('de-DE')} · Seed ${h.result.seed} · ${h.result.generator}\nKlick: wieder öffnen`}
              onClick={() => applyResult(h.result, h.request, false)}
            >
              <span>{h.prompt}</span>
            </button>
          ))}
          {!history.length && <span className="hint">Generierte Modelle erscheinen hier.</span>}
        </div>
      </div>
    </footer>
  );
}
