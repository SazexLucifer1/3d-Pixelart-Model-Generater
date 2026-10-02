import { useEffect, useState } from 'react';
import { TopBar } from './components/TopBar';
import { LeftPanel, TOOLS } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { ViewportView } from './components/ViewportView';
import { BottomBar } from './components/BottomBar';
import { ExportDialog } from './components/ExportDialog';
import { useEditor } from './state/editorStore';
import { actions } from './editor/actions';
import { viewportRef } from './render/viewportRef';
import { runGeneration } from './hooks/useGeneration';
import { autosave, loadGenerationHistory, restoreAutosave } from './services/persistence';
import { exportProject } from './services/exporters';

/**
 * Hauptlayout:
 *   Oben    – Prompt, Generieren, Speichern, Export
 *   Links   – Werkzeuge, Farben, Stil, Detailgrad, Rendering
 *   Mitte   – 3D Pixel-Art Vorschau
 *   Rechts  – Objektinfos, Auswahl, Ebenen, Animationen, KI-Analyse
 *   Unten   – Undo/Redo und Generierungsverlauf
 */
export function App() {
  const [showExport, setShowExport] = useState(false);

  // Start: Autosave wiederherstellen oder direkt ein Beispiel generieren
  useEffect(() => {
    useEditor.getState().set({ generationHistory: loadGenerationHistory() });
    if (!restoreAutosave()) runGeneration();
  }, []);

  // Autosave (verzögert nach Änderungen)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.revision === prev.revision) return;
      clearTimeout(t);
      t = setTimeout(autosave, 1500);
    });
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);

  // Tastenkürzel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && key === 'y') return e.preventDefault(), s.redo();
      if (mod && key === 'c') return actions.copy();
      if (mod && key === 'x') return actions.cut();
      if (mod && key === 'v') return actions.paste();
      if (mod && key === 'd') return e.preventDefault(), actions.duplicate();
      if (mod && key === 'a') return e.preventDefault(), actions.selectAll();
      if (mod && key === 's') return e.preventDefault(), exportProject();
      if (mod) return;
      if (s.playing || s.activeClip) {
        if (key === 'escape') s.set({ activeClip: null, playing: false });
        return;
      }
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          return actions.remove();
        case 'Escape':
          return actions.deselect();
        case 'ArrowLeft':
          return e.preventDefault(), actions.move(-1, 0, 0);
        case 'ArrowRight':
          return e.preventDefault(), actions.move(1, 0, 0);
        case 'ArrowUp':
          return e.preventDefault(), actions.move(0, 0, -1);
        case 'ArrowDown':
          return e.preventDefault(), actions.move(0, 0, 1);
        case 'PageUp':
          return e.preventDefault(), actions.move(0, 1, 0);
        case 'PageDown':
          return e.preventDefault(), actions.move(0, -1, 0);
      }
      if (key === 'r') return actions.rotate('y', e.shiftKey ? -1 : 1);
      if (key === 'f') return viewportRef.get()?.frameModel();
      const views = ['iso', 'front', 'side', 'back', 'top'] as const;
      if (/^[1-5]$/.test(key)) return viewportRef.get()?.setView(views[Number(key) - 1]);
      const tool = TOOLS.find((t) => t.key.toLowerCase() === key);
      if (tool) s.set({ tool: tool.id });
      if (key === 'x' && !tool) s.set({ mirrorX: !s.mirrorX });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar onExport={() => setShowExport(true)} />
      <div className="main">
        <LeftPanel />
        <ViewportView />
        <RightPanel />
      </div>
      <BottomBar />
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </div>
  );
}
