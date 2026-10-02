/**
 * Kleine Pixel-Icons (16×16-Raster als SVG-Pfade).
 */
const PATHS: Record<string, string> = {
  attach: 'M3 9h4v4H3zM7 5h4v4H7zM7 9h4v4H7zM11 2h2v2h2v2h-2v2h-2V6H9V4h2z',
  erase: 'M2 10l6-6 6 6-4 4H6zM5 10l3 3h1l2-2-3-3z',
  paint: 'M10 2h4v4l-6 6H4V8zM3 12h2v2H3z',
  pick: 'M11 2h3v3l-2 2 1 1-1 1-1-1-5 5H3v-3l5-5-1-1 1-1 1 1z',
  select: 'M2 2h3v1H3v2H2zM11 2h3v3h-1V3h-2zM2 11h1v2h2v1H2zM13 11h1v3h-3v-1h2zM6 2h4v1H6zM6 13h4v1H6zM2 6h1v4H2zM13 6h1v4h-1z',
  wand: 'M2 13l8-8 1 1-8 8zM11 1h1v2h-1zM13 3h2v1h-2zM12 5h1v1h-1zM9 2h1v1H9zM13 1h1v1h-1z',
  move: 'M8 1l3 3H9v3h3V5l3 3-3 3V9H9v3h2l-3 3-3-3h2V9H4v2L1 8l3-3v2h3V4H5z',
  box: 'M2 5l6-3 6 3v7l-6 3-6-3zM4 6v5l3 1.5v-5zM9 7.5v5l3-1.5V6z',
  orbit: 'M8 2a6 6 0 1 1-5.2 3H1l2.5-3L6 5H4.6A4.5 4.5 0 1 0 8 3.5z',
  undo: 'M6 3L2 7l4 4V8h4a2 2 0 0 1 0 4H8v2h2a4 4 0 0 0 0-8H6z',
  redo: 'M10 3l4 4-4 4V8H6a2 2 0 0 0 0 4h2v2H6a4 4 0 0 1 0-8h4z',
  eye: 'M8 4c3 0 5.5 2 7 4-1.5 2-4 4-7 4s-5.5-2-7-4c1.5-2 4-4 7-4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  eyeOff: 'M2 2l12 12-1 1-2.3-2.3A7.5 7.5 0 0 1 8 12c-3 0-5.5-2-7-4 .8-1.1 1.9-2.2 3.2-2.9L1 3zM8 4c3 0 5.5 2 7 4-.6.8-1.3 1.6-2.2 2.2L6.6 4.1C7 4 7.5 4 8 4z',
  lock: 'M5 7V5a3 3 0 0 1 6 0v2h1v7H4V7zm2 0h2V5a1 1 0 0 0-2 0z',
  unlock: 'M5 7V5a3 3 0 0 1 6 0h-2a1 1 0 0 0-2 0v2h5v7H4V7z',
  trash: 'M5 2h6v1h3v2H2V3h3zM3 6h10l-1 8H4z',
  plus: 'M7 2h2v5h5v2H9v5H7V9H2V7h5z',
  play: 'M4 2l10 6-10 6z',
  stop: 'M3 3h10v10H3z',
  camera: 'M5 3h6l1 2h2v9H2V5h2zm3 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  frame: 'M2 2h4v2H4v2H2zM10 2h4v4h-2V4h-2zM2 10h2v2h2v2H2zM12 10h2v4h-4v-2h2z',
  spark: 'M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z',
};

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden>
      <path d={PATHS[name] ?? PATHS.spark} fillRule="evenodd" />
    </svg>
  );
}
