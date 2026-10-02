import type { SpriteDoc } from './types';
import type { SheetLayout } from './sheet';

/**
 * Godot-4-Ressourcen (.tres) für generierte Assets.
 *  - SpriteFrames (AnimatedSprite2D) aus einem Sprite Sheet
 *  - TileSet mit Atlas-Quelle, Terrain-Set (Auto-Tiling über Ecken)
 *    und animierten Tiles (z.B. Wasser)
 */

const fmt = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${Math.round(n * 1000) / 1000}`);

export function spriteFramesTres(layout: SheetLayout, texturePath: string): string {
  const subs: string[] = [];
  const animEntries: string[] = [];
  let id = 0;
  for (const a of layout.animations) {
    const frames: string[] = [];
    for (const f of a.frames) {
      const sid = `AtlasTexture_${++id}`;
      subs.push(`[sub_resource type="AtlasTexture" id="${sid}"]\natlas = ExtResource("1_tex")\nregion = Rect2(${f.x}, ${f.y}, ${f.w}, ${f.h})\n`);
      frames.push(`{\n"duration": 1.0,\n"texture": SubResource("${sid}")\n}`);
    }
    animEntries.push(`{\n"frames": [${frames.join(', ')}],\n"loop": ${a.loop},\n"name": &"${a.key}",\n"speed": ${fmt(a.fps)}\n}`);
  }
  return [
    `[gd_resource type="SpriteFrames" load_steps=${subs.length + 2} format=3]`,
    '',
    `[ext_resource type="Texture2D" path="${texturePath}" id="1_tex"]`,
    '',
    ...subs,
    '[resource]',
    `animations = [${animEntries.join(', ')}]`,
    '',
  ].join('\n');
}

export function tileSetTres(doc: SpriteDoc, texturePath: string): string {
  const ts = doc.atlas?.tileSize ?? 16;
  const lines: string[] = [];
  const terrains = doc.atlas?.terrains ?? [];
  for (const r of doc.atlas?.regions ?? []) {
    if (r.kind === 'ui' || r.kind === 'icon') continue;
    const cx = Math.floor(r.x / ts), cy = Math.floor(r.y / ts);
    const sw = Math.max(1, Math.round(r.w / ts)), sh = Math.max(1, Math.round(r.h / ts));
    const key = `${cx}:${cy}`;
    if (sw > 1 || sh > 1) lines.push(`${key}/size_in_atlas = Vector2i(${sw}, ${sh})`);
    if (r.frames && r.frames > 1) {
      lines.push(`${key}/animation_columns = ${r.frames}`);
      for (let i = 0; i < r.frames; i++) lines.push(`${key}/animation_frame_${i}/duration = 0.25`);
    }
    lines.push(`${key}/0 = 0`);
    if (r.corners && terrains.length) {
      const [tl, tr, bl, br] = r.corners;
      const majority = [tl, tr, bl, br].sort((a, b) => [tl, tr, bl, br].filter((v) => v === b).length - [tl, tr, bl, br].filter((v) => v === a).length)[0];
      lines.push(`${key}/0/terrain_set = 0`, `${key}/0/terrain = ${majority}`);
      lines.push(`${key}/0/terrains_peering_bit/top_left_corner = ${tl}`, `${key}/0/terrains_peering_bit/top_right_corner = ${tr}`);
      lines.push(`${key}/0/terrains_peering_bit/bottom_left_corner = ${bl}`, `${key}/0/terrains_peering_bit/bottom_right_corner = ${br}`);
    }
  }
  const terrainLines = terrains.length
    ? ['terrain_set_0/mode = 1', ...terrains.flatMap((t, i) => [`terrain_set_0/terrain_${i}/name = "${t.name}"`, `terrain_set_0/terrain_${i}/color = Color(${hexToGodot(t.color)})`])]
    : [];
  return [
    '[gd_resource type="TileSet" load_steps=3 format=3]',
    '',
    `[ext_resource type="Texture2D" path="${texturePath}" id="1_tex"]`,
    '',
    '[sub_resource type="TileSetAtlasSource" id="TileSetAtlasSource_1"]',
    'texture = ExtResource("1_tex")',
    `texture_region_size = Vector2i(${ts}, ${ts})`,
    ...lines,
    '',
    '[resource]',
    `tile_size = Vector2i(${ts}, ${ts})`,
    ...terrainLines,
    'sources/0 = SubResource("TileSetAtlasSource_1")',
    '',
  ].join('\n');
}

function hexToGodot(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(', ') + ', 1';
}

/** Ordner unter res://assets/ je Asset-Kategorie. */
export const GODOT_FOLDERS: Record<string, string> = {
  character: 'characters', enemy: 'characters/enemies', npc: 'characters/npcs', monster: 'characters/monsters', animal: 'characters/animals', boss: 'characters/bosses',
  item: 'items', weapon: 'weapons', armor: 'items/armor', building: 'buildings', furniture: 'buildings/furniture',
  environment: 'environment', tile: 'tiles', effect: 'effects', ui: 'ui', map: 'tiles',
};

export function godotFolder(category: string): string {
  return GODOT_FOLDERS[category] ?? 'misc';
}
