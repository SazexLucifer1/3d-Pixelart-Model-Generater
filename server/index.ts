import express from 'express';
import cors from 'cors';
import { exec } from 'node:child_process';
import type { GenerationRequest } from '../src/shared/ai/types';
import { STYLE_PRESETS, PALETTES } from '../src/shared/palette/styles';
import { createRegistry } from './registry';
import { deleteProject, listProjects, loadProject, saveProject } from './projects';
import { listGames, loadGame, saveGame } from './library';
import { claudeParseStyle, ClaudeInterpreter } from './providers/claude';
import { parseStyleText, createProfile, type StyleProfile } from '../src/shared/style/profile';
import { sanitizeBlueprint } from '../src/shared/ai/generators';
import { isExe, serveFrontend } from './frontend';

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
// .env laden, falls vorhanden (Node ≥ 20.12)
try {
  process.loadEnvFile?.();
} catch {
  /* keine .env-Datei */
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '200mb' }));

const { registry, autoOrder, interpreters } = createRegistry();

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
  const profile = body.profile && typeof body.profile === 'object' && body.profile.pixel && body.profile.palette ? { ...createProfile(), ...body.profile } : undefined;
  return { prompt: body.prompt.trim(), style, palette, detail, size, seed, generator: body.generator, profile };
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

/**
 * Nur Prompt-Interpretation (LLM → Blueprint). Der Browser baut daraus
 * Sprites im Web-Worker. Ohne konfiguriertes LLM: { blueprint: null }.
 */
app.post('/api/interpret', async (req, res) => {
  const { prompt, generator, profile } = req.body ?? {};
  if (typeof prompt !== 'string' || !prompt.trim()) return void res.status(400).json({ error: 'prompt fehlt' });
  for (const entry of interpreters) {
    if (generator && generator !== entry.id) continue;
    if (!(await entry.available().catch(() => false))) continue;
    try {
      const request = parseRequest({ prompt, profile, style: profile?.baseStyle ?? 'auto', size: profile?.pixel?.characterSize ?? 32 });
      const blueprint = sanitizeBlueprint(await entry.interpreter.interpret(request), request);
      return void res.json({ blueprint, interpreter: entry.id });
    } catch (e) {
      console.error('[interpret]', entry.id, e);
    }
  }
  res.json({ blueprint: null });
});

/** Stilbeschreibung → Stilprofil (Claude, falls konfiguriert; sonst Regeln). */
app.post('/api/style/parse', async (req, res) => {
  const { text, profile } = req.body ?? {};
  if (typeof text !== 'string') return void res.status(400).json({ error: 'text fehlt' });
  const base: StyleProfile = profile && profile.pixel ? { ...createProfile(), ...profile } : createProfile();
  const rules = parseStyleText(text, base);
  if (ClaudeInterpreter.isConfigured()) {
    try {
      const llm = await claudeParseStyle(text, base);
      // Gesperrte Paletten (z.B. Game Boy) aus den Regeln übernehmen
      if (rules.profile.palette.locked && !base.palette.locked) llm.profile.palette = rules.profile.palette;
      return void res.json(llm);
    } catch (e) {
      console.error('[style/parse]', e);
    }
  }
  res.json(rules);
});

// Spielprojekte (Bibliothek mit eigenen Assets + Stilprofilen)
app.get('/api/library', async (_req, res) => {
  res.json({ games: await listGames() });
});
app.get('/api/library/:id', async (req, res) => {
  try {
    res.json(await loadGame(req.params.id));
  } catch {
    res.status(404).json({ error: 'Spielprojekt nicht gefunden' });
  }
});
app.put('/api/library/:id', async (req, res) => {
  try {
    res.json({ id: await saveGame(req.params.id, req.body) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
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

// Gebautes Frontend ausliefern (dist/ oder eingebettet in der .exe)
serveFrontend(app);

/** Startet den Server; ist der Port belegt, wird der nächste freie genommen (nur .exe). */
function listen(port: number, triesLeft: number) {
  const server = app.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`Voxel Forge Backend läuft auf ${url}`);
    registry.list().then((gens) => {
      for (const g of gens) console.log(`  ${g.available ? '✓' : '·'} ${g.id.padEnd(17)} ${g.name}`);
    });
    if (isExe()) {
      console.log('\nDer Browser öffnet sich automatisch. Dieses Fenster offen lassen – Schließen beendet Voxel Forge.');
      const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
      exec(cmd, () => undefined);
    }
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && triesLeft > 0) listen(port + 1, triesLeft - 1);
    else throw err;
  });
}
listen(Number(process.env.PORT ?? 8787), isExe() ? 20 : 0);
