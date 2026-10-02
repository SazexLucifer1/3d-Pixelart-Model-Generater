import { useEditor, type GenerationHistoryItem } from '../state/editorStore';
import { buildProjectFile } from './exporters';
import { parseProject } from '../../shared/project/project';

/**
 * Lokale Persistenz im Browser (localStorage):
 *  - Autosave des aktuellen Projekts
 *  - Generierungsverlauf (begrenzt, inkl. Vorschaubildern)
 * Alle Zugriffe sind abgesichert – ohne Speicher funktioniert die App weiter.
 */
const AUTOSAVE_KEY = 'voxelforge.autosave.v1';
const HISTORY_KEY = 'voxelforge.history.v1';

export function saveGenerationHistory(items: GenerationHistoryItem[]): void {
  // Bei Speicherplatzmangel schrittweise kürzen
  for (let n = Math.min(items.length, 12); n >= 0; n -= 3) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, n)));
      return;
    } catch {
      /* zu groß → weniger Einträge */
    }
  }
}

export function loadGenerationHistory(): GenerationHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as GenerationHistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function autosave(): void {
  try {
    const s = useEditor.getState();
    if (s.model.size === 0) return;
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(buildProjectFile()));
  } catch {
    /* ignorieren */
  }
}

/** Stellt das zuletzt bearbeitete Projekt wieder her. @returns true bei Erfolg */
export function restoreAutosave(): boolean {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    const { project, model } = parseProject(raw);
    if (model.size === 0) return false;
    const s = useEditor.getState();
    s.replaceModel(model, 'Autosave wiederhergestellt', {
      animations: project.animations,
      projectName: project.name,
      prompt: project.generation?.prompt ?? s.prompt,
      blueprint: project.generation?.blueprint ?? null,
      lastRequest: project.generation?.request ?? null,
      lastSeed: project.generation?.seed ?? null,
    });
    // Wiederherstellen soll nicht rückgängig gemacht werden können
    useEditor.setState({ undoStack: [] });
    const ed = project.editor as { renderStyle?: string } | undefined;
    if (ed?.renderStyle) s.setRenderStyle(ed.renderStyle as never);
    return true;
  } catch {
    return false;
  }
}
