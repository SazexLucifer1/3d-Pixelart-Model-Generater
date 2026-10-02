import { create } from 'zustand';
import { createGameProject, type GameAsset, type GameProject } from '../../shared/library/gameProject';
import { createProfile, type StyleProfile } from '../../shared/style/profile';
import type { OutputKind } from '../../shared/ai/intent';

/**
 * Zustand des Spielprojekts: Asset-Bibliothek, Stilprofile, Arbeitsbereich
 * und Einstellungen des universellen Asset-Generators.
 */

export type Workspace = 'voxel' | 'sprite' | 'library' | 'style';

export interface AnimSetting {
  enabled: boolean;
  frames: number;
  fps: number;
}

/** Charakter-Animationen mit Standardwerten (Frames, FPS). */
export const CHARACTER_ANIMS: { id: string; name: string; group: string; frames: number; fps: number; on: boolean }[] = [
  { id: 'idle', name: 'Idle (Stehen, Atmen)', group: 'Idle', frames: 4, fps: 6, on: true },
  { id: 'walk', name: 'Laufen', group: 'Bewegung', frames: 8, fps: 10, on: true },
  { id: 'run', name: 'Rennen', group: 'Bewegung', frames: 8, fps: 14, on: true },
  { id: 'sneak', name: 'Schleichen', group: 'Bewegung', frames: 6, fps: 8, on: false },
  { id: 'jump', name: 'Springen', group: 'Bewegung', frames: 6, fps: 10, on: false },
  { id: 'attack', name: 'Angriff', group: 'Kampf', frames: 6, fps: 12, on: true },
  { id: 'block', name: 'Blocken', group: 'Kampf', frames: 4, fps: 8, on: false },
  { id: 'dodge', name: 'Ausweichen', group: 'Kampf', frames: 6, fps: 12, on: false },
  { id: 'cast', name: 'Zauber wirken', group: 'Kampf', frames: 8, fps: 10, on: false },
  { id: 'hurt', name: 'Schaden erhalten', group: 'Reaktionen', frames: 3, fps: 10, on: true },
  { id: 'death', name: 'Tod', group: 'Reaktionen', frames: 6, fps: 8, on: true },
  { id: 'victory', name: 'Sieg', group: 'Reaktionen', frames: 6, fps: 8, on: false },
  { id: 'interact', name: 'Interaktion', group: 'Reaktionen', frames: 4, fps: 8, on: false },
  { id: 'fly', name: 'Fliegen (Kreaturen)', group: 'Bewegung', frames: 6, fps: 10, on: false },
];

export interface GameState {
  project: GameProject;
  rev: number;
  workspace: Workspace;
  output: OutputKind | 'auto';
  /** 'auto' = aus Stilprofil und Kategorie. */
  spriteSize: 'auto' | number;
  directions: 'profile' | 1 | 4 | 8;
  animSettings: Record<string, AnimSetting>;
  busy: string | null;
  toast: { text: string; kind: 'ok' | 'error' | 'info' } | null;
  lastNotes: string[];
  activeSpriteId: string | null;
  activeVoxelId: string | null;
  loaded: boolean;

  profile: () => StyleProfile;
  set: (p: Partial<GameState>) => void;
  setProject: (p: GameProject) => void;
  updateProfile: (fn: (p: StyleProfile) => StyleProfile) => void;
  addProfile: (p: StyleProfile) => void;
  deleteProfile: (id: string) => void;
  addAsset: (a: GameAsset) => void;
  updateAsset: (id: string, patch: Partial<GameAsset>) => void;
  removeAsset: (id: string) => void;
  notify: (text: string, kind?: 'ok' | 'error' | 'info') => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useGame = create<GameState>((set, get) => ({
  project: createGameProject(),
  rev: 0,
  workspace: 'sprite',
  output: 'auto',
  spriteSize: 'auto',
  directions: 'profile',
  animSettings: Object.fromEntries(CHARACTER_ANIMS.map((a) => [a.id, { enabled: a.on, frames: a.frames, fps: a.fps }])),
  busy: null,
  toast: null,
  lastNotes: [],
  activeSpriteId: null,
  activeVoxelId: null,
  loaded: false,

  profile: () => {
    const p = get().project;
    return p.profiles.find((x) => x.id === p.activeProfileId) ?? p.profiles[0] ?? createProfile();
  },
  set: (p) => set(p),
  setProject: (project) => set((s) => ({ project, rev: s.rev + 1, activeSpriteId: null, activeVoxelId: null })),
  updateProfile: (fn) =>
    set((s) => {
      const active = s.project.activeProfileId;
      const profiles = s.project.profiles.map((p) => (p.id === active ? { ...fn(structuredClone(p)), updatedAt: new Date().toISOString() } : p));
      return { project: { ...s.project, profiles, updatedAt: new Date().toISOString() }, rev: s.rev + 1 };
    }),
  addProfile: (p) => set((s) => ({ project: { ...s.project, profiles: [...s.project.profiles, p], activeProfileId: p.id }, rev: s.rev + 1 })),
  deleteProfile: (id) =>
    set((s) => {
      if (s.project.profiles.length <= 1) return {};
      const profiles = s.project.profiles.filter((p) => p.id !== id);
      return { project: { ...s.project, profiles, activeProfileId: s.project.activeProfileId === id ? profiles[0].id : s.project.activeProfileId }, rev: s.rev + 1 };
    }),
  addAsset: (a) => set((s) => ({ project: { ...s.project, assets: [a, ...s.project.assets], updatedAt: new Date().toISOString() }, rev: s.rev + 1 })),
  updateAsset: (id, patch) =>
    set((s) => ({
      project: { ...s.project, assets: s.project.assets.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a)), updatedAt: new Date().toISOString() },
      rev: s.rev + 1,
    })),
  removeAsset: (id) =>
    set((s) => ({
      project: { ...s.project, assets: s.project.assets.filter((a) => a.id !== id) },
      rev: s.rev + 1,
      activeSpriteId: s.activeSpriteId === id ? null : s.activeSpriteId,
      activeVoxelId: s.activeVoxelId === id ? null : s.activeVoxelId,
    })),
  notify: (text, kind = 'info') => {
    clearTimeout(toastTimer);
    set({ toast: { text, kind } });
    toastTimer = setTimeout(() => set({ toast: null }), kind === 'error' ? 7000 : 3500);
  },
}));
