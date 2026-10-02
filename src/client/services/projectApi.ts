import { parseProject } from '../../shared/project/project';
import { buildProjectFile } from './exporters';
import { useEditor } from '../state/editorStore';

/**
 * Projektablage auf dem Node-Backend (/api/projects).
 */
export interface ServerProject {
  id: string;
  name: string;
  updatedAt: string;
  voxels: number;
}

let currentServerId: string | null = null;

export async function listServerProjects(): Promise<ServerProject[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error('Backend nicht erreichbar');
  return ((await res.json()) as { projects: ServerProject[] }).projects;
}

export async function saveToServer(asNew = false): Promise<string> {
  const body = JSON.stringify(buildProjectFile());
  const url = currentServerId && !asNew ? `/api/projects/${currentServerId}` : '/api/projects';
  const res = await fetch(url, { method: currentServerId && !asNew ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Speichern fehlgeschlagen');
  currentServerId = ((await res.json()) as { id: string }).id;
  return currentServerId;
}

export async function loadFromServer(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) throw new Error('Projekt nicht gefunden');
  const { project, model } = parseProject(await res.json());
  const s = useEditor.getState();
  s.replaceModel(model, `Projekt geladen: ${project.name}`, {
    animations: project.animations,
    projectName: project.name,
    prompt: project.generation?.prompt ?? s.prompt,
    blueprint: project.generation?.blueprint ?? null,
    lastRequest: project.generation?.request ?? null,
    lastSeed: project.generation?.seed ?? null,
  });
  currentServerId = id;
}

export async function deleteFromServer(id: string): Promise<void> {
  await fetch(`/api/projects/${id}`, { method: 'DELETE' });
  if (currentServerId === id) currentServerId = null;
}
