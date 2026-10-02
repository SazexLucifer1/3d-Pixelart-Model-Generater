import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GenerationRequest } from '../src/shared/ai/types';
import { STYLE_PRESETS, PALETTES } from '../src/shared/palette/styles';
import { createRegistry } from './registry';
import { deleteProject, listProjects, loadProject, saveProject } from './projects';

/**
 * Voxel-Forge-Backend (Node.js + Express)
 *
 *   GET    /api/health
 *   GET    /api/generators           verfügbare KI-Generatoren
 *   POST   /api/generate             GenerationRequest → GenerationResult
 *   GET    /api/projects             gespeicherte Projekte
 *   GET    /api/projects/:id
 *   POST   /api/projects             (body: Projektdatei) → { id }
 *   PUT    /api/projects/:id
 *   DELETE /api/projects/:id
 *
 * Im Produktionsmodus wird zusätzlich das gebaute Frontend aus dist/ ausgeliefert.
 */
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const { registry, autoOrder } = createRegistry();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/generators', async (_req, res) => {
  res.json({ generators: await registry.list(), autoOrder });
});

/** Validiert und normalisiert eine eingehende Generierungsanfrage. */
function parseRequest(body: Partial<GenerationRequest>): GenerationRequest {
  if (!body || typeof body.prompt !== 'string' || !body.prompt.trim()) throw new Error('prompt fehlt');
  if (body.prompt.length > 2000) throw new Error('prompt ist zu lang (max. 2000 Zeichen)');
  const style = body.style === 'auto' || (body.style && STYLE_PRESETS[body.style]) ? body.style : 'auto';
  const palette = body.palette && PALETTES[body.palette] ? body.palette : 'style';
  const detail = body.detail === 1 || body.detail === 3 ? body.detail : 2;
  const size = Math.max(8, Math.min(96, Math.round(Number(body.size) || 24)));
  const seed = Number.isFinite(body.seed) ? Math.floor(body.seed!) : undefined;
  return { prompt: body.prompt.trim(), style, palette, detail, size, seed, generator: body.generator };
}

app.post('/api/generate', async (req, res) => {
  let request: GenerationRequest;
  try {
    request = parseRequest(req.body);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }
  // Generator wählen: explizit gewünscht oder erster verfügbarer laut autoOrder
  let generator = request.generator ? registry.get(request.generator) : undefined;
  if (generator && !(await generator.isAvailable())) {
    res.status(400).json({ error: `Generator "${generator.name}" ist nicht konfiguriert` });
    return;
  }
  if (!generator) {
    for (const id of autoOrder) {
      const g = registry.get(id);
      if (g && (await g.isAvailable().catch(() => false))) {
        generator = g;
        break;
      }
    }
  }
  generator ??= await registry.resolve('procedural');
  try {
    const result = await generator.generate(request);
    console.log(`[generate] ${generator.id} "${request.prompt.slice(0, 60)}" → ${result.model.voxels.length} Voxel in ${result.durationMs} ms`);
    res.json(result);
  } catch (e) {
    console.error(`[generate] ${generator.id} fehlgeschlagen:`, e);
    // Fällt ein KI-Dienst aus, wird prozedural weitergearbeitet
    if (generator.id !== 'procedural') {
      const fallback = await registry.resolve('procedural');
      const result = await fallback.generate(request);
      result.blueprint.notes.unshift(`⚠ ${generator.name} fehlgeschlagen (${(e as Error).message}) – prozeduraler Fallback verwendet`);
      res.json(result);
      return;
    }
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get('/api/projects', async (_req, res) => {
  res.json({ projects: await listProjects() });
});
app.get('/api/projects/:id', async (req, res) => {
  try {
    res.json(await loadProject(req.params.id));
  } catch {
    res.status(404).json({ error: 'Projekt nicht gefunden' });
  }
});
app.post('/api/projects', async (req, res) => {
  try {
    res.json({ id: await saveProject(req.body) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
app.put('/api/projects/:id', async (req, res) => {
  try {
    res.json({ id: await saveProject(req.body, req.params.id) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
app.delete('/api/projects/:id', async (req, res) => {
  try {
    await deleteProject(req.params.id);
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'Projekt nicht gefunden' });
  }
});

// Gebautes Frontend ausliefern (npm run build && npm start)
const dist = resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
}

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`Voxel Forge Backend läuft auf http://localhost:${port}`);
  registry.list().then((gens) => {
    for (const g of gens) console.log(`  ${g.available ? '✓' : '·'} ${g.id.padEnd(17)} ${g.name}`);
  });
});
