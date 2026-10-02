import { useEffect, useState } from 'react';
import { TopBar } from './components/TopBar';
import { WorkspaceTabs } from './components/WorkspaceTabs';
import { LeftPanel, TOOLS } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { ViewportView } from './components/ViewportView';
import { BottomBar } from './components/BottomBar';
import { ExportDialog } from './components/ExportDialog';
import { SpriteWorkspace } from './components/sprite/SpriteWorkspace';
import { LibraryWorkspace } from './components/library/LibraryWorkspace';
import { StyleWorkspace } from './components/style/StyleWorkspace';
import { useEditor } from './state/editorStore';
import { useGame } from './state/gameStore';
import { useSprite } from './state/spriteStore';
import { actions } from './editor/actions';
import { viewportRef } from './render/viewportRef';
import { autosave, loadGenerationHistory, restoreAutosave } from './services/persistence';
import { exportProject } from './services/exporters';
import { loadGameProject, startGameAutosave } from './services/gamePersistence';
import { runAssetGeneration } from './services/assetGenerator';
import { parseSpriteDoc } from '../shared/sprite/types';

/**
 * Hauptlayout:
 *   Oben    – Prompt, Ausgabeformat, Generieren, Speichern/Export
 *   Tabs    – 2D-Pixel-Editor · 3D-Voxel-Editor · Bibliothek · Stil & Referenzen
 *   Mitte   – jeweiliger Arbeitsbereich
 */
export function App() {
  const [showExport, setShowExport] = useState(false);
  const workspace = useGame((s) => s.workspace);

  // Start: Spielprojekt laden; bei leerem Projekt ein Beispiel generieren
  useEffect(() => {
    useEditor.getState().set({ generationHistory: loadGenerationHistory() });
    restoreAutosave();
    const stop = startGameAutosave();
    loadGameProject().then((ok) => {
      const g = useGame.getState();
      g.set({ loaded: true });
      const first = g.project.assets.find((a) => a.sprite);
      if (ok && first) {
        useSprite.getState().load(parseSpriteDoc(first.sprite!), first.id);
        g.set({ activeSpriteId: first.id });
      } else if (!g.project.assets.length) {
        useEditor.getState().set({ prompt: 'Erstelle einen Waldläufer Charakter für mein Fantasy RPG' });
        runAssetGeneration();
      }
    });
    return stop;
  }, []);

  // 3D-Autosave + Rückschreiben in das Bibliotheks-Asset
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.revision === prev.revision) return;
      clearTimeout(t);
      t = setTimeout(() => {
        autosave();
        const g = useGame.getState();
        const ed = useEditor.getState();
        if (g.activeVoxelId && ed.model.size) {
          const a = g.project.assets.find((x) => x.id === g.activeVoxelId);
          if (a?.voxel) g.updateAsset(a.id, { voxel: { ...a.voxel, model: ed.model.toJSON(), animations: ed.animations } });
        }
      }, 1500);
    });
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);

  // Tastenkürzel des 3D-Editors (nur im 3D-Arbeitsbereich)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useGame.getState().workspace !== 'voxel') return;
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
    <div className={`app ws-${workspace}`}>
      <TopBar onExport={() => setShowExport(true)} />
      <WorkspaceTabs />
      {workspace === 'voxel' && (
        <>
          <div className="main">
            <LeftPanel />
            <ViewportView />
            <RightPanel />
          </div>
          <BottomBar />
        </>
      )}
      {workspace === 'sprite' && <SpriteWorkspace />}
      {workspace === 'library' && <LibraryWorkspace />}
      {workspace === 'style' && <StyleWorkspace />}
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </div>
  );
}
