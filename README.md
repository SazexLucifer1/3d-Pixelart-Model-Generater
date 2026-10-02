# Voxel Forge – KI 3D Pixel-Art Generator

Voxel Forge erzeugt aus Textbeschreibungen **echte, editierbare 3D-Voxelmodelle** im Stil klassischer 16/32-Bit-Spiele – und öffnet sie direkt in einem MagicaVoxel-artigen Editor.

> „Ein kleiner Fantasy-Krieger mit grüner Rüstung, Schwert und Umhang im Stil eines alten JRPGs“
> „Eine mittelalterliche Holzhütte mit Moos auf dem Dach und einem kleinen Lagerfeuer“

![Voxel Forge Editor](docs/screenshot.png)

Das Ergebnis ist kein Bild, sondern eine Voxel-Struktur (Position, Palettenfarbe, Material, Leuchtstärke, Ebene je Voxel), die sich voxelgenau bearbeiten, animieren und in gängige Formate exportieren lässt.

---

## Schnellstart

```bash
npm install
npm run dev          # Frontend (http://localhost:5173) + Backend (http://localhost:8787)
```

Beim ersten Start wird automatisch ein Beispielmodell generiert. Prompt eingeben → **Generieren** (oder Enter).

| Befehl | Zweck |
|---|---|
| `npm run dev` | Frontend (Vite) und Backend (Express, Auto-Reload) gemeinsam |
| `npm run dev:client` | Nur Frontend – Generierung läuft dann komplett im Browser |
| `npm run build && npm start` | Produktionsbuild; das Backend liefert `dist/` mit aus |
| `npm test` | Unit-Tests (Datenstruktur, Transformationen, Generator, Formate, Animationen) |
| `npm run typecheck` | TypeScript-Prüfung (Frontend, Backend, Tests) |
| `npm run generate -- "Ein roter Drache" 32` | Generierung auf der Kommandozeile (`--save` speichert ein Projekt) |

Voraussetzung: Node.js ≥ 20.

---

## Funktionen

### Text → 3D-Voxelmodell
- **Eingaben:** Beschreibung, Stil (oder automatisch aus dem Prompt), Größe (12–64 Voxel Höhe), Farbpalette, Detailgrad, optionaler Seed (reproduzierbar)
- **Prompt-Analyse (DE/EN):** erkennt Objekte, Varianten, Ausrüstung, Merkmale, Farben inkl. Zuordnung („grüne Rüstung“, „roter Drache mit goldenen Hörnern“), Größen, Mengen („drei Bäume“, „Wald“), Platzierung („links“, „davor“), Tageszeit und Untergrund
- **Objektbibliothek:** Figuren (Krieger, Ritter, Magier, Hexe, Elf, Zwerg, König, Engel, Dämon, Skelett, Roboter, Ork …), Drachen, 13 Tierarten, Vögel/Phönix, Schleime, Häuser/Hütten, Türme, Burgen, Bäume (8 Varianten), Lagerfeuer, Truhen, Pilze, Kristalle, Felsen, Waffen, Tränke, Raumschiffe – plus **freie Primitive** für alles andere (über LLM)
- **Szenen:** mehrere Objekte werden überlappungsfrei platziert, optional auf einem Diorama-Sockel mit Gras und Blumen
- **Ebenen mit Rollen** (z. B. `leg_left`, `weapon`, `flame`) – Grundlage für Animationen

### Editor (MagicaVoxel-ähnlich)
| Werkzeug | Taste | Funktion |
|---|---|---|
| Hinzufügen | `A` | Voxel an Flächen anbauen, Ziehen malt auf der Ebene |
| Löschen | `E` | Voxel entfernen |
| Malen | `P` | Voxel umfärben (Farbe + Material) |
| Pipette | `I` | Farbe, Material und Ebene aufnehmen |
| Box | `B` | Quader aufziehen (`Shift` = Höhe, `Strg` = Box löschen) |
| Auswahl | `S` | Klick / Rechteck (`Shift` hinzufügen, `Strg` entfernen) |
| Zauberstab | `W` | Zusammenhängende Farbe (`Strg` = Farbe global) |
| Verschieben | `M` | Auswahl ziehen (`Shift` = vertikal) |
| Kamera | `O` | Linke Maus dreht die Kamera |

Weitere Funktionen: Pinselgröße, X-Spiegelsymmetrie (`X`), Auswahl verschieben (Pfeiltasten, `Bild↑/↓`), drehen (`R`, Panel), spiegeln, skalieren (×½, ×1,5, ×2, Nearest-Neighbor), duplizieren (`Strg+D`), kopieren/ausschneiden/einfügen, symmetrisch kopieren, umfärben, Material/Ebene zuweisen, Ebenen (sichtbar, gesperrt, umbenennen, löschen), Palette bearbeiten (ändert alle Voxel einer Farbe), **Undo/Redo** (`Strg+Z` / `Strg+Y`, 200 Schritte).

Kamera: rechte Maus drehen, mittlere Maus verschieben, Mausrad zoomen. Ansichten `1` Isometrisch · `2` Vorne · `3` Seite · `4` Hinten · `5` Oben · `F` einpassen; Perspektive/Orthografisch umschaltbar.

### Pixel-Art-Rendering
- Rendern in reduzierter Auflösung mit Nearest-Neighbor-Hochskalierung (einstellbare Pixelgröße)
- Konturen (außen) und abgedunkelte Innenkanten, Posterize, 4-Farben-Palette (Game Boy)
- Voxel-Ambient-Occlusion, harte Schatten, Himmels-/Bodenlicht, farbige Punktlichter an leuchtenden Voxeln (Feuer, Fenster, Kristalle)
- Stil-Presets: **Fantasy RPG, Sci-Fi, Medieval, Dark Fantasy, Cute Pixel, Retro Gameboy** – beeinflussen Farben, Palettengröße und Rendering
- Paletten: Stil (automatisch begrenzt), PICO-8, Sweetie 16, Endesga 32, Game Boy, frei

### Animationen
Animationen werden als **Veränderungen der Voxel-Struktur** gespeichert (pro Frame: gesetzte und entfernte Voxel relativ zum Basismodell). Automatisch erzeugt werden je nach Objekt: Idle/Atmen, Laufen, Angriff (Waffenschwung), Fliegen (Flügelschlag), Flackern (Feuer), Hüpfen, Wind, Fahne, Rauch, Schweben und Drehen. Wiedergabe, Frame-Scrubbing und Geschwindigkeit im rechten Panel; nach Bearbeitungen „Neu berechnen“.

### Speichern & Export
| Format | Inhalt |
|---|---|
| **Projekt `.voxproj.json`** | komplett editierbar: Voxel, Palette, Ebenen, Animationen, Prompt, Blueprint, Seed, Editor-Einstellungen |
| **PNG** | Pixel-Art-Rendering bis 2048², optional transparent und eingepasst |
| **Sprite Sheet** | PNG + JSON-Atlas, Zeilen = 1/4/8 Blickrichtungen, Spalten = Animationsframes |
| **GLB/GLTF** | Vertex-Farben, getrennte Materialien (matt/metall/leuchtend/glas) |
| **OBJ + MTL** | Vertex-Farben + Materialgruppen pro Palettenfarbe, Quads |
| **MagicaVoxel `.vox`** | Voxel + Palette (≤ 256³) |

Import: `.voxproj.json`, `.vox`, `.obj` (wird voxelisiert), Bilder `.png/.jpg` (Sprite wird zu 3D „aufgeblasen“). Zusätzlich: Autosave im Browser, Generierungsverlauf mit Vorschaubildern, Projektablage auf dem Server („Projekte“).

---

## Architektur

```
src/
  shared/                      ← läuft im Browser UND im Node-Backend (keine DOM-Abhängigkeiten)
    voxel/        VoxelModel (Datenstruktur, Undo-Aufzeichnung), Transformationen
    palette/      Farben, Stil-Presets, Paletten
    ai/
      types.ts    GenerationRequest, SceneBlueprint, PromptInterpreter, VoxelGenerator
      generators.ts  BlueprintGenerator, GeneratorRegistry, Blueprint-Validierung
      interpreter/   Regelbasierte Prompt-Analyse + Wortschatz (DE/EN)
      procedural/    Sculptor (Zeichenwerkzeuge), Objektbibliothek, SceneBuilder
    animation/    Frames als Voxel-Diffs, Standard-Animationen
    formats/      Mesher, OBJ, VOX, PNG-Decoder, Mesh-/Bild-Voxelisierung
    project/      Projektformat
  client/                      ← React + Three.js
    render/       Viewport (Szene, Kamera, Picking), PixelPass (Pixel-Shader)
    editor/       ToolController (Maus → Werkzeuge), Aktionen
    state/        Zustand (zustand) inkl. Undo/Redo
    services/     Generierung (Backend/Browser-Fallback), Export/Import, Persistenz
    components/   TopBar, LeftPanel, ViewportView, RightPanel, BottomBar, Dialoge
server/                        ← Node.js + Express
  index.ts        REST-API (/api/generate, /api/generators, /api/projects)
  registry.ts     Registrierung aller KI-Generatoren
  providers/      Claude, Ollama (lokal), Stable Diffusion, Text-zu-3D-API
```

### KI-Pipeline (austauschbar)

```
Prompt + Einstellungen
      │
      ▼
PromptInterpreter ──── Regelbasiert (offline) │ Claude │ Ollama (lokal) │ eigenes Modell
      │  SceneBlueprint (Objekte, Varianten, Merkmale, Farben, Primitive, Stil …)
      ▼
SceneBuilder ───────── prozedurale Objektbibliothek + freie Primitive
      │
      ▼
GenerationResult (VoxelModel + Animationen + Analyse-Log)
```

Alternativ ersetzt ein `VoxelGenerator` die komplette Pipeline – so sind **Stable Diffusion** (Text → Sprite → 3D-Extrusion) und **Text-zu-3D-Modelle** (Mesh → Voxelisierung) angebunden. Alle Generatoren liefern dasselbe `GenerationResult`; Frontend und Editor bleiben unverändert.

Das Frontend nutzt bevorzugt das Backend. Ist es nicht erreichbar, läuft der prozedurale Generator direkt im Browser.

### KI-Dienste aktivieren

`.env.example` nach `.env` kopieren und ausfüllen (oder Umgebungsvariablen setzen), dann `npm run dev` neu starten:

| Generator | Variablen | Beschreibung |
|---|---|---|
| Claude | `ANTHROPIC_API_KEY`, optional `CLAUDE_MODEL` | LLM interpretiert den Prompt per Structured Outputs als Blueprint (inkl. freier Formen) |
| Lokales LLM | `OLLAMA_URL`, `OLLAMA_MODEL` | gleiches Schema über die native Ollama-API, komplett offline |
| Stable Diffusion | `SD_API_URL` | AUTOMATIC1111/Forge-API: Pixel-Art-Sprite → Hintergrund entfernen → aufblasen |
| Text-zu-3D | `TEXT_TO_3D_URL` | beliebiger Dienst: `POST {prompt, seed}` → OBJ-Text, wird voxelisiert |

„Automatisch“ wählt Claude → Ollama → prozedural. Fällt ein Dienst aus, wird prozedural weitergearbeitet (mit Hinweis in der KI-Analyse).

### Erweitern

- **Neuer Objekttyp:** Builder in `src/shared/ai/procedural/builders/` schreiben (Zeichenwerkzeuge des `Sculptor`: `box`, `ellipsoid`, `cylinder`, `cone`, `tube`, `triangle`, `recolorWhere` …), in `library.ts` registrieren, Schlüsselwörter in `interpreter/lexicon.ts` ergänzen. Ebenen mit Rollen versehen, damit Animationen funktionieren.
- **Neues KI-Modell:** `PromptInterpreter` implementieren und mit `BlueprintGenerator` in `server/registry.ts` registrieren – oder direkt `VoxelGenerator` implementieren, wenn das Modell selbst Geometrie liefert.
- **Neuer Stil / neue Palette:** `src/shared/palette/styles.ts`.
- **Neue Animation:** `generateAnimations()` in `src/shared/animation/animation.ts` (Ebenen-Transformationen → Frame-Diffs).

---

## REST-API

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/health` | Statusprüfung |
| `GET` | `/api/generators` | verfügbare Generatoren |
| `POST` | `/api/generate` | `{prompt, style, size, palette, detail, seed?, generator?}` → `GenerationResult` |
| `GET/POST` | `/api/projects` | Projekte auflisten / speichern |
| `GET/PUT/DELETE` | `/api/projects/:id` | Projekt laden / überschreiben / löschen |
