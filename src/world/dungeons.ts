// Dungeons: deterministic sites (from the seed), two floors of rooms and corridors
// carved into the rock, a ramp from the surface and one between the floors, a boss
// room at the bottom and a hidden treasure room behind a cracked wall (dig through).
// Pure functions — used by the terrain worker (carving) and the main thread.
import { hash3, mulberry32 } from './noise';
import { SEA_LEVEL } from './constants';
import { Biome } from './biomes';
import type { Piece } from './building';

export const DUNGEON_CELL = 620;
const FLOOR_DROP = 11, ROOM_H = 4.2, COR_H = 3.2, COR_W = 3;

export type Theme = 'crypt' | 'nest' | 'mine' | 'hideout' | 'cave' | 'chapel' | 'vault' | 'forge' | 'hollow';
export const THEMES: Record<Theme, { names: string[]; enemies: string[]; boss: string; wall: string }> = {
  crypt: { names: ['Crypt', 'Barrow', 'Ossuary', 'Catacombs'], enemies: ['skeleton', 'skeleton_archer', 'ghost', 'wight'], boss: 'barrow_lich', wall: 'moss_stone' },
  nest: { names: ['Nest', 'Webbed Hollow', 'Silk Caves'], enemies: ['spider', 'crystal_crawler', 'vampire_bat'], boss: 'spider_matriarch', wall: 'stone' },
  mine: { names: ['Mine', 'Delve', 'Glittering Shafts'], enemies: ['kobold', 'goblin', 'goblin_shaman'], boss: 'kobold_king', wall: 'stone' },
  hideout: { names: ['Hideout', 'Smugglers’ Den', 'Robbers’ Hole'], enemies: ['bandit', 'cultist', 'grave_robber'], boss: 'bandit_lord', wall: 'stone' },
  cave: { names: ['Troll Cave', 'Hill Hall', 'Bone Grotto'], enemies: ['troll', 'ogre', 'dire_wolf'], boss: 'troll_king', wall: 'stone' },
  chapel: { names: ['Drowned Chapel', 'Sunken Choir', 'Flooded Vault'], enemies: ['water_spirit', 'bog_lurker', 'swamp_hag'], boss: 'drowned_bishop', wall: 'moss_stone' },
  vault: { names: ['Frozen Vault', 'Ice Halls', 'Rime Crypt'], enemies: ['frost_wolf', 'ice_golem', 'skeleton'], boss: 'frost_colossus', wall: 'ice' },
  forge: { names: ['Ember Forge', 'Ash Halls', 'Molten Deep'], enemies: ['fire_imp', 'salamander', 'winged_demon'], boss: 'ash_dragon', wall: 'basalt' },
  hollow: { names: ['Hag Hollow', 'Witch Warren', 'Mire Burrows'], enemies: ['swamp_hag', 'will_o_wisp', 'bog_lurker'], boss: 'swamp_mother', wall: 'moss_stone' }
};
const ADJ = ['Forgotten', 'Whispering', 'Black', 'Sunken', 'Weeping', 'Hollow', 'Silent', 'Cursed', 'Old', 'Bleak', 'Shattered', 'Nameless'];

export interface Room { x0: number; z0: number; x1: number; z1: number; floor: number; y: number; boss?: boolean; hidden?: boolean; entry?: boolean; }
/** an axis-aligned corridor or ramp: from (x0,z0) to (x1,z1), floor height y0 → y1 */
export interface Passage { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; }
export interface Dungeon {
  id: string; name: string; theme: Theme; x: number; z: number; surface: number; seed: number; danger: number;
  rooms: Room[]; passages: Passage[]; minX: number; maxX: number; minZ: number; maxZ: number; minY: number;
  entrance: { x: number; z: number; y: number };
}

const cache = new Map<string, Dungeon | null>();

function themeFor(b: Biome, r: () => number): Theme {
  const pick = (a: Theme[]) => a[Math.floor(r() * a.length)];
  switch (b) {
    case Biome.HauntedMoor: return pick(['crypt', 'crypt', 'hideout']);
    case Biome.MistySwamp: case Biome.SunkenForest: return pick(['chapel', 'hollow']);
    case Biome.SnowyMountains: case Biome.FrozenTundra: return pick(['vault', 'cave']);
    case Biome.VolcanicAshlands: return 'forge';
    case Biome.RedDesert: return pick(['mine', 'hideout']);
    case Biome.DarkPine: return pick(['nest', 'cave', 'crypt']);
    case Biome.MushroomGrove: case Biome.CrystalCaves: return pick(['nest', 'mine']);
    default: return pick(['crypt', 'hideout', 'nest', 'mine', 'cave']);
  }
}

/** The dungeon of a grid cell, or null. */
export function dungeonForCell(cx: number, cz: number, seed: number, raw: (x: number, z: number) => { height: number; ok: boolean; biome?: Biome }): Dungeon | null {
  const key = `${seed}:${cx},${cz}`;
  if (cache.has(key)) return cache.get(key)!;
  let d: Dungeon | null = null;
  if (hash3(cx, 91, cz, seed) < 0.62) {
    const x = Math.round((cx + 0.2 + hash3(cx, 92, cz, seed) * 0.6) * DUNGEON_CELL), z = Math.round((cz + 0.2 + hash3(cx, 93, cz, seed) * 0.6) * DUNGEON_CELL);
    const c = raw(x, z);
    if (Math.hypot(x, z) > 260 && c.height > SEA_LEVEL + 3 && c.height < SEA_LEVEL + 70) d = build(x, z, c.height, c.biome ?? Biome.MoonlitForest, Math.floor(hash3(cx, 94, cz, seed) * 1e9), `${cx},${cz}`);
  }
  cache.set(key, d);
  return d;
}

function build(x: number, z: number, surface: number, biome: Biome, seed: number, id: string): Dungeon {
  const r = mulberry32(seed);
  const theme = themeFor(biome, r);
  const T = THEMES[theme];
  const name = `The ${ADJ[Math.floor(r() * ADJ.length)]} ${T.names[Math.floor(r() * T.names.length)]}`;
  const rooms: Room[] = [];
  const passages: Passage[] = [];
  const top = Math.floor(surface) - 10;
  // rooms on two floors in a 70 x 70 m square around the site
  const overlaps = (a: Room, pad: number) => rooms.some((b) => b.floor === a.floor && a.x0 - pad < b.x1 && a.x1 + pad > b.x0 && a.z0 - pad < b.z1 && a.z1 + pad > b.z0);
  for (let f = 0; f < 2; f++) {
    const y = top - f * FLOOR_DROP;
    let made = 0;
    for (let tries = 0; tries < 80 && made < 6; tries++) {
      const boss = f === 1 && made === 5;
      const w = boss ? 16 : 7 + Math.floor(r() * 6), d2 = boss ? 16 : 7 + Math.floor(r() * 6);
      const rx = Math.round(x - 35 + r() * (70 - w)), rz = Math.round(z - 35 + r() * (70 - d2));
      const room: Room = { x0: rx, z0: rz, x1: rx + w, z1: rz + d2, floor: f, y, boss, entry: f === 0 && made === 0 };
      if (overlaps(room, 4)) continue;
      rooms.push(room); made++;
    }
  }
  // connect each floor's rooms in a chain (nearest next), with L-shaped corridors
  const centre = (q: Room) => [(q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2];
  for (let f = 0; f < 2; f++) {
    const fr = rooms.filter((q) => q.floor === f);
    const order = [fr[0]];
    const left = fr.slice(1);
    while (left.length) {
      const [lx, lz] = centre(order[order.length - 1]);
      left.sort((a, b) => Math.hypot(centre(a)[0] - lx, centre(a)[1] - lz) - Math.hypot(centre(b)[0] - lx, centre(b)[1] - lz));
      // keep the boss room last
      const i = left.length > 1 && left[0].boss ? 1 : 0;
      order.push(left.splice(i, 1)[0]);
    }
    for (let i = 1; i < order.length; i++) {
      const [ax, az] = centre(order[i - 1]), [bx, bz] = centre(order[i]);
      const y = order[i].y;
      passages.push({ x0: ax, z0: az, x1: bx, z1: az, y0: y, y1: y }, { x0: bx, z0: az, x1: bx, z1: bz, y0: y, y1: y });
    }
  }
  // ramp between the floors: from the last non-boss room of floor 0 down to the first room of floor 1
  const f0 = rooms.filter((q) => q.floor === 0), f1 = rooms.filter((q) => q.floor === 1);
  const a = f0[f0.length - 1], b = f1[0];
  const [ax, az] = centre(a);
  const dir = az < z ? 1 : -1;
  const rampLen = FLOOR_DROP * 2.6;
  passages.push({ x0: ax, z0: az, x1: ax, z1: az + dir * rampLen, y0: a.y, y1: a.y - FLOOR_DROP });
  const [bx, bz] = centre(b);
  passages.push({ x0: ax, z0: az + dir * rampLen, x1: bx, z1: az + dir * rampLen, y0: b.y, y1: b.y }, { x0: bx, z0: az + dir * rampLen, x1: bx, z1: bz, y0: b.y, y1: b.y });
  // entrance ramp from the surface into the entry room
  const e = rooms.find((q) => q.entry)!;
  const [ex, ez] = centre(e);
  const edir = ez > z ? 1 : -1;
  const eLen = (surface - e.y) * 2.6;
  passages.push({ x0: ex, z0: ez, x1: ex, z1: ez + edir * eLen, y0: e.y, y1: surface + 1 });
  // the hidden treasure room: next to a floor-1 room, sealed by 1.5 m of rock
  const host = f1[Math.floor(r() * Math.max(1, f1.length - 1))];
  const hw = 5;
  const hidden: Room = { x0: host.x1 + 1.5, z0: host.z0, x1: host.x1 + 1.5 + hw, z1: host.z0 + hw, floor: 1, y: host.y, hidden: true };
  rooms.push(hidden);
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const q of rooms) { minX = Math.min(minX, q.x0); maxX = Math.max(maxX, q.x1); minZ = Math.min(minZ, q.z0); maxZ = Math.max(maxZ, q.z1); }
  for (const p of passages) { minX = Math.min(minX, p.x0, p.x1); maxX = Math.max(maxX, p.x0, p.x1); minZ = Math.min(minZ, p.z0, p.z1); maxZ = Math.max(maxZ, p.z0, p.z1); }
  const danger = 1 + Math.hypot(x, z) / 450;
  return { id, name, theme, x, z, surface, seed, danger, rooms, passages, minX: minX - 3, maxX: maxX + 3, minZ: minZ - 3, maxZ: maxZ + 3, minY: top - FLOOR_DROP - 2, entrance: { x: ex, z: ez + edir * eLen, y: surface } };
}

const sdBox = (px: number, pz: number, x0: number, z0: number, x1: number, z1: number) => {
  const dx = Math.max(x0 - px, px - x1), dz = Math.max(z0 - pz, pz - z1);
  return dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz);
};

/** Signed distance to the dungeon's air (negative = inside a room or passage). */
export function dungeonDist(D: Dungeon, x: number, y: number, z: number): number {
  let best = 1e9;
  for (const q of D.rooms) {
    const d = Math.max(sdBox(x, z, q.x0, q.z0, q.x1, q.z1), q.y - y, y - (q.y + ROOM_H));
    if (d < best) best = d;
  }
  for (const p of D.passages) {
    const hw = COR_W / 2;
    const x0 = Math.min(p.x0, p.x1) - hw, x1 = Math.max(p.x0, p.x1) + hw, z0 = Math.min(p.z0, p.z1) - hw, z1 = Math.max(p.z0, p.z1) + hw;
    const dxy = sdBox(x, z, x0, z0, x1, z1);
    if (dxy > best) continue;
    let fy = p.y0;
    if (p.y0 !== p.y1) {
      const len = Math.hypot(p.x1 - p.x0, p.z1 - p.z0);
      const t = Math.max(0, Math.min(1, ((x - p.x0) * (p.x1 - p.x0) + (z - p.z0) * (p.z1 - p.z0)) / (len * len)));
      fy = p.y0 + (p.y1 - p.y0) * t;
    }
    const d = Math.max(dxy, fy - y, y - (fy + COR_H));
    if (d < best) best = d;
  }
  return best;
}

/** Generated pieces: entrance arch, torches, bones, loot chests, the cracked wall and banners. */
export function dungeonPieces(D: Dungeon): Piece[] {
  const out: Piece[] = [];
  const r = mulberry32(D.seed ^ 0x77);
  const e = D.entrance;
  out.push({ id: 'lab_arch', x: e.x, y: e.y - 0.6, z: e.z, rot: 0 });
  out.push({ id: 'wall_torch', x: e.x - 2.0, y: e.y - 0.6, z: e.z + 0.8, rot: 0 }, { id: 'wall_torch', x: e.x + 2.0, y: e.y - 0.6, z: e.z + 0.8, rot: 0 });
  D.rooms.forEach((q, i) => {
    const cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2;
    out.push({ id: 'wall_torch', x: q.x0 + 0.3, y: q.y, z: cz, rot: -Math.PI / 2 }, { id: 'wall_torch', x: q.x1 - 0.3, y: q.y, z: cz, rot: Math.PI / 2 });
    for (let k = 0; k < 2; k++) if (r() < 0.6) out.push({ id: 'bones', x: q.x0 + 1 + r() * (q.x1 - q.x0 - 2), y: q.y + 0.02, z: q.z0 + 1 + r() * (q.z1 - q.z0 - 2), rot: r() * 6 });
    if (q.boss) for (const s of [-1, 1]) out.push({ id: 'banner', x: cx + s * 3, y: q.y, z: q.z0 + 0.6, rot: 0 }, { id: 'banner', x: cx + s * 3, y: q.y, z: q.z1 - 0.6, rot: Math.PI });
    if (q.hidden) {
      out.push({ id: 'loot_chest', x: cx, y: q.y, z: cz, rot: 0, items: [{ id: `chest:${D.id}:${i}`, n: 3 }] } as Piece);
      out.push({ id: 'cracked_wall', x: q.x0 - 1.6, y: q.y, z: cz, rot: Math.PI / 2 });
    } else if (q.boss || (!q.entry && r() < 0.45)) out.push({ id: 'loot_chest', x: q.x1 - 1.2, y: q.y, z: q.z1 - 1.2, rot: Math.PI * 0.75, items: [{ id: `chest:${D.id}:${i}`, n: q.boss ? 2 : 1 }] } as Piece);
  });
  return out.map((p) => ({ ...p, gen: true } as Piece));
}

export function roomAt(D: Dungeon, x: number, y: number, z: number): number {
  return D.rooms.findIndex((q) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1 && y > q.y - 1 && y < q.y + ROOM_H);
}
