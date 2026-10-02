import { useGame } from '../state/gameStore';
import { idbGet, idbSet } from './idb';
import { parseGameProject, type GameProject } from '../../shared/library/gameProject';
import { download } from './exporters';
import { slugify } from '../../shared/sprite/package';

/**
 * Speichern/Laden des Spielprojekts:
 *  - Autosave in IndexedDB (Browser)
 *  - Datei (.game.json) zum Weitergeben/Versionieren
 *  - Server (/api/library) optional
 */
const KEY = 'game-project-v1';

export async function loadGameProject(): Promise<boolean> {
  const raw = await idbGet<GameProject>(KEY);
  if (!raw) return false;
  try {
    useGame.getState().setProject(parseGameProject(raw));
    return true;
  } catch {
    return false;
  }
}

export function startGameAutosave(): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  const unsub = useGame.subscribe((s, prev) => {
    if (s.rev === prev.rev) return;
    clearTimeout(t);
    t = setTimeout(() => idbSet(KEY, useGame.getState().project), 800);
  });
  return () => {
    clearTimeout(t);
    unsub();
  };
}

export function exportGameFile(): void {
  const p = useGame.getState().project;
  download(JSON.stringify(p), `${slugify(p.name)}.game.json`, 'application/json');
}

export async function importGameFile(file: File): Promise<void> {
  const p = parseGameProject(await file.text());
  useGame.getState().setProject(p);
}

export async function saveGameToServer(): Promise<string> {
  const p = useGame.getState().project;
  const res = await fetch(`/api/library/${encodeURIComponent(slugify(p.name))}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Speichern auf dem Server fehlgeschlagen');
  return slugify(p.name);
}

export async function listServerGames(): Promise<{ id: string; name: string; assets: number; updatedAt: string }[]> {
  const res = await fetch('/api/library');
  if (!res.ok) throw new Error('Backend nicht erreichbar');
  return (await res.json()).games;
}

export async function loadGameFromServer(id: string): Promise<void> {
  const res = await fetch(`/api/library/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Projekt nicht gefunden');
  useGame.getState().setProject(parseGameProject(await res.json()));
}
