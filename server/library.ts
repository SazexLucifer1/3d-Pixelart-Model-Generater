import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseGameProject } from '../src/shared/library/gameProject';

/**
 * Dateiablage für Spielprojekte (data/games/<id>.game.json).
 * Enthält nur eigene generierte Assets, Stilprofile und Metadaten.
 */
const DIR = resolve(process.env.GAMES_DIR ?? 'data/games');
const safe = (id: string) => {
  if (!/^[a-z0-9_-]{1,64}$/i.test(id)) throw new Error('Ungültige Projekt-ID');
  return id;
};

export async function listGames(): Promise<{ id: string; name: string; assets: number; updatedAt: string }[]> {
  await mkdir(DIR, { recursive: true });
  const out = [];
  for (const f of (await readdir(DIR)).filter((x) => x.endsWith('.game.json'))) {
    try {
      const g = parseGameProject(await readFile(join(DIR, f), 'utf8'));
      out.push({ id: f.replace('.game.json', ''), name: g.name, assets: g.assets.length, updatedAt: g.updatedAt });
    } catch {
      /* überspringen */
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadGame(id: string): Promise<unknown> {
  return JSON.parse(await readFile(join(DIR, `${safe(id)}.game.json`), 'utf8'));
}

export async function saveGame(id: string, body: unknown): Promise<string> {
  const game = parseGameProject(body);
  await mkdir(DIR, { recursive: true });
  await writeFile(join(DIR, `${safe(id)}.game.json`), JSON.stringify(game));
  return id;
}
