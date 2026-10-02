import type { Sculptor } from './Sculptor';
import type { ObjectSpec, SceneBlueprint } from '../types';
import type { StylePreset } from '../../palette/styles';
import type { Proportions } from '../../style/profile';

/**
 * Kontext, den jeder Objekt-Builder erhält.
 */
export interface BuildContext {
  s: Sculptor;
  spec: ObjectSpec;
  /** Zielhöhe dieses Objekts in Voxeln. */
  H: number;
  /** Skalierungsfaktor relativ zur Referenzhöhe 24. */
  u: number;
  style: StylePreset;
  blueprint: SceneBlueprint;
  /** Liefert die Farbe eines Slots oder den Standardwert. */
  col(slot: string, fallback: string): string;
  /** Prüft, ob ein Merkmal gewünscht ist. */
  has(feature: string): boolean;
  /** Skaliert einen Wert der Referenzgröße 24 auf die Zielgröße (gerundet). */
  r(v: number): number;
  /** Körperproportionen aus dem Stilprofil. */
  proportions: Proportions;
}

/** Signatur eines Objekt-Builders der Bibliothek. */
export type ObjectBuilder = (ctx: BuildContext) => void;

export function makeContext(s: Sculptor, spec: ObjectSpec, H: number, style: StylePreset, blueprint: SceneBlueprint): BuildContext {
  const u = H / 24;
  const features = new Set(spec.features);
  return {
    s,
    spec,
    H,
    u,
    style,
    blueprint,
    col: (slot, fallback) => spec.colors[slot] ?? fallback,
    has: (f) => features.has(f),
    r: (v) => Math.round(v * u),
    proportions: blueprint.proportions ?? 'chibi',
  };
}
