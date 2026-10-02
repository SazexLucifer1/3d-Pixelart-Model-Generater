import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sea from 'node:sea';

/**
 * Lädt Einstellungen (API-Schlüssel usw.) aus einer .env-Datei.
 *
 * Gesucht wird im aktuellen Ordner und – bei der .exe – im Ordner der .exe.
 * Auch „.env.txt“ wird akzeptiert (Windows-Editor hängt gern .txt an),
 * ebenso ein UTF-8-BOM, Anführungszeichen und „export KEY=…“.
 * Bereits gesetzte Umgebungsvariablen haben Vorrang.
 */
export function loadEnv(): string[] {
  const dirs = [process.cwd()];
  try {
    if (sea.isSea()) dirs.push(dirname(process.execPath));
  } catch {
    /* kein SEA */
  }
  const loaded: string[] = [];
  for (const dir of [...new Set(dirs)]) {
    for (const name of ['.env', '.env.txt', 'env.txt']) {
      const file = join(dir, name);
      if (!existsSync(file)) continue;
      parseEnv(readFileSync(file, 'utf8'));
      loaded.push(file);
    }
  }
  return loaded;
}

export function parseEnv(text: string): void {
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    if (value && process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
