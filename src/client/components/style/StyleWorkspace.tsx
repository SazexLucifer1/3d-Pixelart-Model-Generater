import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../state/gameStore';
import { useSprite } from '../../state/spriteStore';
import { createProfile, parseStyleText, PROFILE_TEMPLATES, type StyleProfile } from '../../../shared/style/profile';
import { STYLE_LIST, type StyleId } from '../../../shared/palette/styles';
import { analyzeImage, applyReference, learnPaletteFromDocs, type AnalysisResult } from '../../../shared/style/analyze';
import { parseSpriteDoc, serializeSpriteDoc, type SpriteDoc } from '../../../shared/sprite/types';
import { fromRGBA } from '../../../shared/sprite/indexed';
import { newAsset } from '../../../shared/library/gameProject';
import { runAssetJob } from '../../services/jobs';
import { imageToCanvas, docThumbnail } from '../../services/spriteCanvas';

/**
 * Stilprofil-Editor mit Style Lock, Freitext-Analyse, Palette,
 * Live-Vorschau und Referenzsystem (eigene Bilder analysieren).
 */
export function StyleWorkspace() {
  const g = useGame();
  const p = g.profile();
  const upd = (fn: (x: StyleProfile) => void) => g.updateProfile((x) => (fn(x), x));
  const [text, setText] = useState(p.description);
  const [notes, setNotes] = useState<string[]>([]);
  useEffect(() => setText(p.description), [p.id]);

  /** fresh = Vorlage: von einem neutralen Profil ausgehen statt das aktuelle zu ergänzen. */
  const applyText = async (t: string, fresh = false) => {
    const base = fresh ? createProfile({ id: p.id, name: p.name, styleLock: p.styleLock }) : p;
    let res: { profile: StyleProfile; notes: string[] } | null = null;
    try {
      const r = await fetch('/api/style/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t, profile: base }) });
      if (r.ok) res = await r.json();
    } catch {
      /* lokal */
    }
    res ??= parseStyleText(t, base);
    g.updateProfile(() => ({ ...res!.profile, id: p.id, name: p.name, references: p.references, createdAt: p.createdAt }));
    setNotes(res.notes);
  };

  return (
    <div className="style-ws">
      <div className="style-col">
        <div className="section">
          <h3>Stilprofile</h3>
          <div className="profile-list">
            {g.project.profiles.map((x) => (
              <button key={x.id} className={`chip ${x.id === p.id ? 'on' : ''}`} onClick={() => g.setProject({ ...g.project, activeProfileId: x.id })}>
                {x.styleLock ? '🔒 ' : ''}{x.name}
              </button>
            ))}
            <button className="chip" onClick={() => g.addProfile(createProfile({ name: `Stil ${g.project.profiles.length + 1}` }))}>+ Neu</button>
            <button className="chip" onClick={() => g.addProfile({ ...structuredClone(p), id: `style_${Date.now().toString(36)}`, name: `${p.name} (Kopie)` })}>Duplizieren</button>
            {g.project.profiles.length > 1 && <button className="chip danger" onClick={() => confirm(`Profil „${p.name}“ löschen?`) && g.deleteProfile(p.id)}>Löschen</button>}
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label>Name</label>
            <input type="text" value={p.name} onChange={(e) => upd((x) => (x.name = e.target.value))} />
          </div>
          <label className="lock-toggle">
            <input type="checkbox" checked={p.styleLock} onChange={(e) => upd((x) => (x.styleLock = e.target.checked))} />
            <span>
              <b>Style Lock</b> – alle neuen 2D- und 3D-Generierungen übernehmen dieses Profil automatisch (Pixelgröße, Palette, Outline, Perspektive, Proportionen, Detailgrad, Licht).
            </span>
          </label>
        </div>

        <div className="section">
          <h3>Stil beschreiben</h3>
          <div className="template-chips">
            {PROFILE_TEMPLATES.map((t) => (
              <button key={t.name} className="chip" title={`${t.text}\n(setzt das Profil auf diese Vorlage zurück)`} onClick={() => { setText(t.text); applyText(t.text, true); }}>{t.name}</button>
            ))}
          </div>
          <textarea className="style-text" value={text} placeholder="z.B. dunkle Grüntöne, warme Schatten, goldene Highlights, 32x32 Charaktere, schwarze Outlines, harte Schatten, keine Verläufe, JRPG Proportionen, mittelalterliche Fantasy" onChange={(e) => setText(e.target.value)} />
          <button className="btn primary" onClick={() => applyText(text)}>Profil aus Beschreibung ableiten</button>
          {notes.length > 0 && <ul className="notes" style={{ marginTop: 6 }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </div>

        <ProfileForm />
      </div>

      <div className="style-col">
        <StylePreview />
        <PaletteSection />
        <References />
      </div>
    </div>
  );
}

function ProfileForm() {
  const g = useGame();
  const p = g.profile();
  const upd = (fn: (x: StyleProfile) => void) => g.updateProfile((x) => (fn(x), x));
  const num = (v: string) => Math.max(1, Number(v) || 1);
  return (
    <>
      <div className="section">
        <h3>Farben</h3>
        <div className="form-grid">
          <label>Basis-Stil</label>
          <select value={p.baseStyle} onChange={(e) => upd((x) => (x.baseStyle = e.target.value as StyleId))}>
            {STYLE_LIST.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label>Sättigung</label>
          <input type="range" min={0.4} max={1.5} step={0.05} value={p.color.saturation} onChange={(e) => upd((x) => (x.color.saturation = Number(e.target.value)))} />
          <label>Helligkeit</label>
          <input type="range" min={0.6} max={1.3} step={0.02} value={p.color.brightness} onChange={(e) => upd((x) => (x.color.brightness = Number(e.target.value)))} />
          <label>Schatten</label>
          <select value={p.color.shadowTone} onChange={(e) => upd((x) => (x.color.shadowTone = e.target.value as StyleProfile['color']['shadowTone']))}>
            <option value="warm">warm</option><option value="cool">kühl</option><option value="neutral">neutral</option>
          </select>
          <label>Highlights</label>
          <select value={p.color.highlightTone} onChange={(e) => upd((x) => (x.color.highlightTone = e.target.value as StyleProfile['color']['highlightTone']))}>
            <option value="gold">golden</option><option value="white">weiß</option><option value="neutral">neutral</option>
          </select>
          <label>Farbstich</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="checkbox" checked={!!p.color.tint} onChange={(e) => upd((x) => (x.color.tint = e.target.checked ? { hue: 120, amount: 0.12 } : null))} />
            {p.color.tint && <input type="range" min={0} max={359} value={p.color.tint.hue} onChange={(e) => upd((x) => (x.color.tint = { ...x.color.tint!, hue: Number(e.target.value) }))} style={{ accentColor: `hsl(${p.color.tint.hue},70%,50%)` }} />}
          </div>
        </div>
      </div>
      <div className="section">
        <h3>Pixel-Stil</h3>
        <div className="form-grid">
          <label>Charaktere</label>
          <SizeSelect value={p.pixel.characterSize} onChange={(v) => upd((x) => (x.pixel.characterSize = v))} />
          <label>Tiles</label>
          <SizeSelect value={p.pixel.tileSize} onChange={(v) => upd((x) => (x.pixel.tileSize = v))} />
          <label>Items/Icons</label>
          <SizeSelect value={p.pixel.itemSize} onChange={(v) => upd((x) => (x.pixel.itemSize = v))} />
          <label>Pixel/Voxel</label>
          <select value={p.pixel.pixelsPerVoxel} onChange={(e) => upd((x) => (x.pixel.pixelsPerVoxel = Number(e.target.value)))}>
            <option value={0}>automatisch</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
          </select>
          <label>Outline</label>
          <select value={p.pixel.outline} onChange={(e) => upd((x) => (x.pixel.outline = e.target.value as StyleProfile['pixel']['outline']))}>
            <option value="black">schwarz</option><option value="dark">dunkel (selektiv)</option><option value="colored">Farbe</option><option value="none">keine</option>
          </select>
          <label>Outline-Farbe</label>
          <input type="color" value={p.pixel.outlineColor} onChange={(e) => upd((x) => (x.pixel.outlineColor = e.target.value))} />
          <label>Schattierung</label>
          <select value={p.pixel.shadingLevels} onChange={(e) => upd((x) => (x.pixel.shadingLevels = Number(e.target.value) as 2 | 3 | 4))}>
            <option value={2}>2 Stufen (hart)</option><option value={3}>3 Stufen (klassisch)</option><option value={4}>4 Stufen (weich)</option>
          </select>
          <label>Licht</label>
          <select value={p.pixel.lightDirection} onChange={(e) => upd((x) => (x.pixel.lightDirection = e.target.value as StyleProfile['pixel']['lightDirection']))}>
            <option value="top-left">oben links</option><option value="top-right">oben rechts</option><option value="top">oben</option><option value="front">vorne</option>
          </select>
          <label>Optionen</label>
          <div>
            <label className="check"><input type="checkbox" checked={p.pixel.castShadows} onChange={(e) => upd((x) => (x.pixel.castShadows = e.target.checked))} /> Schlagschatten</label>
            <label className="check"><input type="checkbox" checked={p.pixel.innerLines} onChange={(e) => upd((x) => (x.pixel.innerLines = e.target.checked))} /> Innenlinien</label>
          </div>
        </div>
      </div>
      <div className="section">
        <h3>Design</h3>
        <div className="form-grid">
          <label>Proportionen</label>
          <select value={p.design.proportions} onChange={(e) => upd((x) => (x.design.proportions = e.target.value as StyleProfile['design']['proportions']))}>
            <option value="chibi">Chibi (großer Kopf)</option><option value="jrpg">JRPG</option><option value="heroic">Heroisch</option>
          </select>
          <label>Perspektive</label>
          <select value={p.design.view} onChange={(e) => upd((x) => (x.design.view = e.target.value as StyleProfile['design']['view']))}>
            <option value="topdown">Top-Down 3/4 (RPG)</option><option value="side">Seitenansicht (Platformer)</option><option value="iso">Isometrisch</option><option value="front">Frontal</option>
          </select>
          <label>Richtungen</label>
          <select value={p.design.directions} onChange={(e) => upd((x) => (x.design.directions = Number(e.target.value) as 1 | 4 | 8))}>
            <option value={1}>1</option><option value={4}>4</option><option value={8}>8</option>
          </select>
          <label>Detailgrad</label>
          <select value={p.design.detail} onChange={(e) => upd((x) => (x.design.detail = Number(e.target.value) as 1 | 2 | 3))}>
            <option value={1}>niedrig</option><option value={2}>mittel</option><option value={3}>hoch</option>
          </select>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>Max. Farben: <input type="number" min={4} max={255} value={p.palette.maxColors} style={{ width: 56 }} onChange={(e) => upd((x) => (x.palette.maxColors = num(e.target.value)))} /></div>
      </div>
    </>
  );
}

function SizeSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const preset = [16, 24, 32, 48, 64, 96, 128];
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <select value={preset.includes(value) ? value : 'custom'} onChange={(e) => e.target.value !== 'custom' && onChange(Number(e.target.value))}>
        {preset.map((n) => <option key={n} value={n}>{n}×{n}</option>)}
        <option value="custom">individuell</option>
      </select>
      <input type="number" min={8} max={256} value={value} style={{ width: 56 }} onChange={(e) => onChange(Math.max(8, Math.min(256, Number(e.target.value) || 8)))} />
    </div>
  );
}

// ------------------------------------------------------------------ Palette

function PaletteSection() {
  const g = useGame();
  const p = g.profile();
  const upd = (fn: (x: StyleProfile) => void) => g.updateProfile((x) => (fn(x), x));
  const learn = () => {
    const docs = g.project.assets.filter((a) => a.sprite && a.profileId === p.id).map((a) => parseSpriteDoc(a.sprite!));
    if (!docs.length) return g.notify('Noch keine 2D-Assets mit diesem Profil – zuerst etwas generieren.', 'info');
    const res = learnPaletteFromDocs(docs, p.palette.maxColors);
    upd((x) => (x.palette = { ...x.palette, colors: res.colors, locked: true }));
    g.notify(res.notes.join(' · '), 'ok');
  };
  return (
    <div className="section">
      <h3>Projektpalette</h3>
      <label className="check"><input type="checkbox" checked={p.palette.locked} onChange={(e) => upd((x) => (x.palette.locked = e.target.checked))} /> Palette sperren (alle Assets exakt auf diese Farben abbilden)</label>
      <div className="palette" style={{ marginTop: 6 }}>
        {p.palette.colors.map((c, i) => (
          <label key={i} className="swatch" style={{ background: c }} title={`${c} – klicken zum Ändern, Rechtsklick entfernt`} onContextMenu={(e) => { e.preventDefault(); upd((x) => x.palette.colors.splice(i, 1)); }}>
            <input type="color" value={c} style={{ opacity: 0, width: '100%', height: '100%' }} onChange={(e) => upd((x) => (x.palette.colors[i] = e.target.value))} />
          </label>
        ))}
        <button className="swatch add" onClick={() => upd((x) => x.palette.colors.push('#808080'))}>+</button>
      </div>
      {!p.palette.colors.length && <div className="hint">Leer = Palette wird pro Asset automatisch erzeugt (max. {p.palette.maxColors} Farben).</div>}
      <div className="btn-row" style={{ marginTop: 6 }}>
        <button className="btn small" onClick={learn} title="Gemeinsame Palette aus allen bisherigen Assets dieses Profils lernen">Aus Bibliothek lernen</button>
        <button className="btn small" onClick={() => upd((x) => (x.palette.colors = []))}>Leeren</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Live-Vorschau

function StylePreview() {
  const g = useGame();
  const p = g.profile();
  const [docs, setDocs] = useState<SpriteDoc[]>([]);
  const [subject, setSubject] = useState('Ein Ritter mit rotem Umhang und Schwert');
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const size = Math.min(64, p.pixel.characterSize);
        const [a, b, c] = await Promise.all([
          runAssetJob({ type: 'sprite', prompt: subject, size, profile: p, directions: ['down', 'right'], animations: [{ id: 'walk', frames: 4, fps: 8 }], seed: 3 }),
          runAssetJob({ type: 'sprite', prompt: 'Ein Magier mit Stab', size, profile: p, directions: ['down'], animations: [{ id: 'idle', frames: 2, fps: 4 }], seed: 4 }),
          runAssetJob({ type: 'effect', prompt: 'Feuerzauber', size: Math.min(48, p.pixel.characterSize), profile: p, frames: 6 }),
        ]);
        if (!cancelled) setDocs([a, b, c].map((r) => parseSpriteDoc(r.doc)));
      } catch {
        /* Vorschau optional */
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [p, subject]);
  return (
    <div className="section">
      <h3>Live-Vorschau des Stils</h3>
      <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%', marginBottom: 6 }} />
      <div className="style-preview">
        {docs.map((d, i) => <AnimatedDoc key={i} doc={d} />)}
        {!docs.length && <span className="hint">Berechne Vorschau …</span>}
      </div>
      <div className="hint">So sehen neue Assets mit diesem Profil aus (gleiche Pixelgröße, Palette, Outline, Licht).</div>
    </div>
  );
}

function AnimatedDoc({ doc }: { doc: SpriteDoc }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 160);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const anims = doc.animations;
    const scale = Math.max(1, Math.floor(120 / doc.height));
    c.width = doc.width * scale * anims.length;
    c.height = doc.height * scale;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    anims.forEach((a, i) => ctx.drawImage(imageToCanvas(a.frames[tick % a.frames.length], doc.palette), i * doc.width * scale, 0, doc.width * scale, doc.height * scale));
  }, [tick, doc]);
  return <canvas ref={ref} className="pix" />;
}

// ---------------------------------------------------------------- Referenzen

function References() {
  const g = useGame();
  const p = g.profile();
  const [results, setResults] = useState<(AnalysisResult & { url: string })[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList) => {
    const out: (AnalysisResult & { url: string })[] = [];
    for (const f of [...files]) {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('Bild konnte nicht geladen werden'));
        i.src = URL.createObjectURL(f);
      });
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height).data;
      out.push({ ...analyzeImage(data, img.width, img.height, f.name), url: img.src });
    }
    setResults((r) => [...out, ...r]);
  };

  const importAsSprite = (r: AnalysisResult) => {
    const palette: string[] = [];
    const img = fromRGBA(r.native.data, r.native.w, r.native.h, palette, true, 255);
    const doc: SpriteDoc = { width: r.native.w, height: r.native.h, palette, animations: [{ id: 'ref', name: 'default', direction: 'none', fps: 1, loop: true, frames: [img] }] };
    const asset = newAsset({ name: r.name.replace(/\.\w+$/, ''), category: 'character', kind: 'sprite', prompt: '(Referenz-Import)', profileId: p.id, sprite: serializeSpriteDoc(doc), thumbnail: docThumbnail(doc), tags: ['referenz'] });
    g.addAsset(asset);
    useSprite.getState().load(doc, asset.id);
    g.set({ activeSpriteId: asset.id, workspace: 'sprite' });
  };

  return (
    <div className="section">
      <h3>Referenzen <span className="hint">eigene Bilder analysieren</span></h3>
      <div className="hint" style={{ marginBottom: 6 }}>
        Lade eigene Sprites/Screenshots hoch. Analysiert werden Pixelgröße, Palette, Outline, Schattierungsstufen und Licht – danach passen neue Assets („Erstelle einen Bogenschützen im gleichen Stil“) zum bestehenden Spiel.
      </div>
      <button className="btn" onClick={() => fileRef.current?.click()}>Bilder hochladen …</button>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && onFiles(e.target.files).catch((err) => g.notify(String(err), 'error'))} />
      {p.references.length > 0 && <div className="hint" style={{ marginTop: 6 }}>Im Profil übernommen: {p.references.map((r) => r.name).join(', ')}</div>}
      {results.map((r, i) => (
        <div key={i} className="ref-card">
          <NativePreview r={r} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{r.name}</b>
            <div className="mini-palette">{r.palette.map((c) => <span key={c} style={{ background: c }} title={c} />)}</div>
            <ul className="notes">{r.notes.map((n, k) => <li key={k}>{n}</li>)}</ul>
            <div className="btn-row">
              <button className="btn small primary" onClick={() => { g.updateProfile((x) => applyReference(x, r)); g.notify(`Stil aus „${r.name}“ übernommen (Palette gesperrt)`, 'ok'); }}>Stil übernehmen</button>
              <button className="btn small" onClick={() => g.updateProfile((x) => applyReference(x, r, { size: false }))}>Ohne Größe</button>
              <button className="btn small" onClick={() => importAsSprite(r)}>Als Sprite-Asset importieren</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function NativePreview({ r }: { r: AnalysisResult }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const scale = Math.max(1, Math.floor(96 / Math.max(r.native.w, r.native.h)));
    const src = document.createElement('canvas');
    src.width = r.native.w;
    src.height = r.native.h;
    src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.native.data), r.native.w, r.native.h), 0, 0);
    c.width = r.native.w * scale;
    c.height = r.native.h * scale;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, c.width, c.height);
  }, [r]);
  return <canvas ref={ref} className="pix ref-img" />;
}
