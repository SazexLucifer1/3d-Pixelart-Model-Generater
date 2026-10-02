import { useEffect, useMemo, useRef, useState } from 'react';
import { Viewport, type ViewPreset } from '../render/Viewport';
import { viewportRef } from '../render/viewportRef';
import { ToolController } from '../editor/ToolController';
import { useEditor } from '../state/editorStore';
import { applyFrame } from '../../shared/animation/animation';
import { exportPng } from '../services/exporters';
import { Icon } from './Icon';

/**
 * Mittlerer Bereich: 3D-Pixel-Art-Vorschau mit Kamera-Schaltflächen.
 */
export function ViewportView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const vpRef = useRef<Viewport | null>(null);
  const toolRef = useRef<ToolController | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [projection, setProjection] = useState<'perspective' | 'orthographic'>('perspective');

  const model = useEditor((s) => s.model);
  const revision = useEditor((s) => s.revision);
  const selection = useEditor((s) => s.selection);
  const render = useEditor((s) => s.render);
  const tool = useEditor((s) => s.tool);
  const hover = useEditor((s) => s.hover);
  const generating = useEditor((s) => s.generating);
  const error = useEditor((s) => s.generationError);
  const animations = useEditor((s) => s.animations);
  const activeClip = useEditor((s) => s.activeClip);
  const frame = useEditor((s) => s.frame);
  const playing = useEditor((s) => s.playing);

  // Viewer anlegen
  useEffect(() => {
    const vp = new Viewport(hostRef.current!, useEditor.getState().render);
    vpRef.current = vp;
    viewportRef.set(vp);
    toolRef.current = new ToolController(vp, setMarquee);
    return () => {
      vp.dispose();
      viewportRef.set(null);
      vpRef.current = null;
    };
  }, []);

  // Anzuzeigendes Modell: Basismodell oder Animationsframe
  const clip = animations.find((a) => a.id === activeClip);
  const displayModel = useMemo(() => {
    if (!clip || !clip.frames[frame]) return model;
    return applyFrame(model, clip.frames[frame]);
  }, [model, revision, clip, frame]);

  useEffect(() => {
    vpRef.current?.setModel(displayModel);
  }, [displayModel]);

  useEffect(() => {
    vpRef.current?.setSelection(model, clip ? new Set() : selection);
  }, [model, selection, revision, clip]);

  useEffect(() => {
    vpRef.current?.applySettings(render);
  }, [render]);

  useEffect(() => {
    vpRef.current?.setLeftMouseOrbit(tool === 'orbit');
    vpRef.current?.setHover(null);
  }, [tool]);

  // Animations-Wiedergabe
  useEffect(() => {
    if (!playing || !clip) return;
    const t = setInterval(() => {
      const s = useEditor.getState();
      s.set({ frame: (s.frame + 1) % clip.frames.length });
    }, 1000 / clip.fps);
    return () => clearInterval(t);
  }, [playing, clip]);

  const setView = (v: ViewPreset) => {
    vpRef.current?.setView(v);
    setProjection(vpRef.current?.projection ?? 'perspective');
  };

  const toggleProjection = () => {
    const next = projection === 'perspective' ? 'orthographic' : 'perspective';
    vpRef.current?.setProjection(next);
    setProjection(next);
  };

  const editingLocked = !!clip;

  return (
    <div className="viewport-wrap">
      <div
        ref={hostRef}
        className="viewport"
        style={{ cursor: tool === 'orbit' ? 'grab' : 'crosshair' }}
        onPointerDown={(e) => {
          if (editingLocked && e.button === 0 && tool !== 'orbit') return;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          toolRef.current?.pointerDown(e.nativeEvent);
        }}
        onPointerMove={(e) => !editingLocked && toolRef.current?.pointerMove(e.nativeEvent)}
        onPointerUp={(e) => toolRef.current?.pointerUp(e.nativeEvent)}
        onPointerLeave={() => toolRef.current?.leave()}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="viewport"
      />

      <div className="vp-toolbar">
        <button className="btn small" onClick={() => setView('iso')} title="Isometrische Ansicht (1)">Iso</button>
        <button className="btn small" onClick={() => setView('front')} title="Frontansicht (2)">Vorne</button>
        <button className="btn small" onClick={() => setView('side')} title="Seitenansicht (3)">Seite</button>
        <button className="btn small" onClick={() => setView('back')} title="Rückansicht (4)">Hinten</button>
        <button className="btn small" onClick={() => setView('top')} title="Draufsicht (5)">Oben</button>
        <button className="btn small" onClick={toggleProjection} title="Perspektive / Orthografisch umschalten">
          {projection === 'perspective' ? 'Perspektive' : 'Orthografisch'}
        </button>
        <button className="btn small icon" onClick={() => vpRef.current?.frameModel()} title="Modell einpassen (F)">
          <Icon name="frame" size={14} />
        </button>
      </div>
      <div className="vp-right">
        <button
          className="btn small"
          title="Screenshot als PNG speichern"
          onClick={() => vpRef.current && exportPng(vpRef.current, useEditor.getState().projectName, hostRef.current!.clientWidth, hostRef.current!.clientHeight, false)}
        >
          <Icon name="camera" size={14} /> Screenshot
        </button>
      </div>

      {model.size === 0 && !generating && (
        <div className="empty-state">
          <b>Leeres Projekt</b>
          Gib oben eine Beschreibung ein und klicke auf „Generieren“ –<br />
          oder baue selbst mit dem Werkzeug „Hinzufügen“ auf dem Raster.
        </div>
      )}
      {generating && (
        <div className="gen-overlay">
          <span className="spinner" /> Modell wird generiert …
        </div>
      )}
      {error && (
        <div className="error-toast" onClick={() => useEditor.getState().set({ generationError: null })}>
          {error} <span className="hint">(klicken zum Schließen)</span>
        </div>
      )}
      {clip && <div className="toast">▶ {clip.name} – Frame {frame + 1}/{clip.frames.length} (Bearbeiten gesperrt)</div>}

      <div className="vp-status">{hover || 'Bereit'}</div>
      <div className="vp-help">Rechte Maus: drehen · Mitte: verschieben · Rad: zoomen</div>
      {marquee && (
        <div
          className="marquee"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      )}
    </div>
  );
}
