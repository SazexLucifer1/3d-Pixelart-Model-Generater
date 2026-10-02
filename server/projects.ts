import { mkdir, readdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseProject } from '../src/shared/project/project';

/**
 * Einfache dateibasierte Projektablage (data/projects/*.voxproj.json).
 * Für den produktiven Einsatz kann dieses Modul durch eine Datenbank
 * ersetzt werden – die API-Routen bleiben gleich.
 */
const DIR = resolve(process.env.PROJECTS_DIR ?? 'data/projects');

const safeId = (id: string) => {
  if (!/^[a-z0-9_-]{1,64}$/i.test(id)) throw new Error('Ungültige Projekt-ID');
  return id;
};

export async function listProjects(): Promise<{ id: string; name: string; updatedAt: string; voxels: number }[]> {
  await mkdir(DIR, { recursive: true });
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.voxproj.json'));
  const out = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(await readFile(join(DIR, f), 'utf8'));
      out.push({ id: f.replace('.voxproj.json', ''), name: raw.name, updatedAt: raw.updatedAt ?? (await stat(join(DIR, f))).mtime.toISOString(), voxels: raw.model?.voxels?.length ?? 0 });
    } catch {
      /* beschädigte Datei überspringen */
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadProject(id: string): Promise<unknown> {
  return JSON.parse(await readFile(join(DIR, `${safeId(id)}.voxproj.json`), 'utf8'));
}

export async function saveProject(body: unknown, id?: string): Promise<string> {
  const { project } = parseProject(body); // validiert
  await mkdir(DIR, { recursive: true });
  const pid = id ? safeId(id) : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await writeFile(join(DIR, `${pid}.voxproj.json`), JSON.stringify(project));
  return pid;
}

export async function deleteProject(id: string): Promise<void> {
  await unlink(join(DIR, `${safeId(id)}.voxproj.json`));
}
