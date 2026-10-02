import type { Viewport } from './Viewport';

/** Globale Referenz auf den aktiven 3D-Viewer (für Exporte, Kamera-Befehle). */
let current: Viewport | null = null;

export const viewportRef = {
  get: () => current,
  set: (vp: Viewport | null) => {
    current = vp;
  },
};
