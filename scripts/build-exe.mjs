/**
 * Baut eine eigenständige Windows-Anwendung: release/VoxelForge.exe
 *
 *   npm run build:exe
 *
 * Ablauf (Node "Single Executable Application"):
 *  1. Frontend bauen (vite build → dist/)
 *  2. Server mit esbuild zu EINER CommonJS-Datei bündeln
 *  3. Frontend-Dateien als Assets in einen SEA-Blob packen
 *  4. offizielle node.exe (gleiche Node-Version) herunterladen und den Blob
 *     mit postject einspritzen
 *
 * Läuft unter Linux, macOS und Windows. Die .exe braucht keine Node-Installation.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'build', 'exe');
const release = join(root, 'release');
const exe = join(release, 'VoxelForge.exe');
const version = process.version; // Blob und node.exe müssen dieselbe Version haben
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
mkdirSync(release, { recursive: true });

console.log('1/4 Frontend bauen …');
run(npx, ['vite', 'build']);

console.log('2/4 Server bündeln …');
await build({
  entryPoints: [join(root, 'server', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: join(out, 'server.cjs'),
  logLevel: 'warning',
});

console.log('3/4 SEA-Blob mit eingebettetem Frontend erzeugen …');
const dist = join(root, 'dist');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(dist, p).split('\\').join('/'));
  }
})(dist);
writeFileSync(join(out, 'manifest.json'), JSON.stringify(files));
const assets = { 'manifest.json': join(out, 'manifest.json') };
for (const f of files) assets[f] = join(dist, f);
writeFileSync(
  join(out, 'sea-config.json'),
  JSON.stringify({ main: join(out, 'server.cjs'), output: join(out, 'sea.blob'), disableExperimentalSEAWarning: true, useCodeCache: false, assets }, null, 2),
);
run(process.execPath, ['--experimental-sea-config', join(out, 'sea-config.json')]);

console.log(`4/4 node.exe ${version} (win-x64) holen und Blob einspritzen …`);
const cache = join(root, 'build', `node-${version}-win-x64.exe`);
if (!existsSync(cache)) {
  const res = await fetch(`https://nodejs.org/dist/${version}/win-x64/node.exe`);
  if (!res.ok) throw new Error(`Download fehlgeschlagen: ${res.status}`);
  writeFileSync(cache, Buffer.from(await res.arrayBuffer()));
}
copyFileSync(cache, exe);
run(npx, [
  'postject', exe, 'NODE_SEA_BLOB', join(out, 'sea.blob'),
  '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
]);

console.log(`\nFertig: ${relative(root, exe)} (${(statSync(exe).size / 1e6).toFixed(0)} MB)`);
