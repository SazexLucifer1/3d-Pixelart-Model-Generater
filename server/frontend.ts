import express, { type Express } from 'express';
import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import sea from 'node:sea';

/**
 * Frontend ausliefern:
 *  - als Windows-.exe (Node Single Executable): aus den eingebetteten Dateien
 *  - sonst aus dem gebauten Ordner dist/ (npm run build && npm start)
 */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export function isExe(): boolean {
  try {
    return sea.isSea();
  } catch {
    return false;
  }
}

export function serveFrontend(app: Express): boolean {
  if (isExe()) {
    // Liste der eingebetteten Dateien (vom Build-Skript erzeugt)
    const files = new Set<string>(JSON.parse(sea.getAsset('manifest.json', 'utf8')));
    app.get(/^(?!\/api\/).*/, (req, res) => {
      const path = decodeURIComponent(req.path).replace(/^\/+/, '');
      const key = files.has(path) ? path : 'index.html';
      res.type(MIME[extname(key)] ?? 'application/octet-stream');
      if (key.startsWith('assets/')) res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(Buffer.from(sea.getAsset(key)));
    });
    return true;
  }
  const dist = resolve('dist');
  if (!existsSync(dist)) return false;
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  return true;
}
