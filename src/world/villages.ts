// Villages: deterministic sites (from the seed), flattened ground, layouts built
// from the same pieces the player builds with, and the people who live there.
// Pure functions — usable from workers (terrain flattening) and the main thread.
import { hash3, mulberry32 } from './noise';
import { SEA_LEVEL } from './constants';
import { WALL_H } from '../data/pieces';
import type { Piece } from './building';
import { CITADEL_NOMINAL, CITADEL_HALF, CITADEL_R, GRAVEYARD, LAB } from '../data/story';

export const VILLAGE_CELL = 560;
export const VILLAGE_RADIUS = 36;

export interface VillageSite { id: string; x: number; z: number; y: number; seed: number; name: string; /** flattened radius (default VILLAGE_RADIUS) */ r?: number; }

const SYL_A = ['Harrow', 'Oak', 'Ash', 'Thorn', 'Mill', 'Fern', 'Brook', 'Stone', 'Wolf', 'Raven', 'Elder', 'Moss', 'Bram', 'Cold', 'Glen', 'Hollow', 'Wyn', 'Dun', 'Black', 'Briar'];
const SYL_B = ['mere', 'hollow', 'ford', 'wick', 'stead', 'by', 'ton', 'brook', 'field', 'holt', 'well', 'dale', 'marsh', 'gate', 'bury', 'cross'];

/** Raw surface height + "can a village stand here" for a point (no village flattening). */
export type RawColumn = (x: number, z: number) => { height: number; ok: boolean };

const cache = new Map<string, VillageSite | null>();

export function villageName(seed: number) {
  const r = mulberry32(seed);
  return SYL_A[Math.floor(r() * SYL_A.length)] + SYL_B[Math.floor(r() * SYL_B.length)];
}

/** The village of a grid cell, or null. The first village sits near the start. */
export function siteForCell(cx: number, cz: number, worldSeed: number, raw: RawColumn): VillageSite | null {
  const key = `${worldSeed}:${cx},${cz}`;
  if (cache.has(key)) return cache.get(key)!;
  let site: VillageSite | null = null;
  const seed = Math.floor(hash3(cx, 77, cz, worldSeed) * 1e9);
  if (cx === 0 && cz === 0) {
    // the first village: a short walk east of the clearing, on decent ground
    let best: { x: number; z: number; h: number; s: number } | null = null;
    for (let a = 0; a < 12; a++) for (const d of [170, 210, 250]) {
      const x = Math.cos(a / 12 * Math.PI * 2) * d, z = Math.sin(a / 12 * Math.PI * 2) * d;
      const c = raw(x, z);
      if (!c.ok || Math.hypot(x - GRAVEYARD.x, z - GRAVEYARD.z) < 90) continue;
      const s = spread(x, z, raw);
      if (!best || s < best.s) best = { x, z, h: c.height, s };
    }
    if (best) site = { id: `${cx},${cz}`, x: best.x, z: best.z, y: Math.round(best.h), seed, name: villageName(seed) };
  } else if (hash3(cx, 78, cz, worldSeed) < 0.75) {
    const x = (cx + 0.25 + hash3(cx, 79, cz, worldSeed) * 0.5) * VILLAGE_CELL;
    const z = (cz + 0.25 + hash3(cx, 80, cz, worldSeed) * 0.5) * VILLAGE_CELL;
    const c = raw(x, z);
    if (c.ok && spread(x, z, raw) < 9) site = { id: `${cx},${cz}`, x, z, y: Math.round(c.height), seed, name: villageName(seed) };
  }
  if (site && site.id !== 'citadel' && (Math.hypot(site.x - CITADEL_NOMINAL.x, site.z - CITADEL_NOMINAL.z) < 330 || Math.hypot(site.x - GRAVEYARD.x, site.z - GRAVEYARD.z) < 90)) site = null;
  cache.set(key, site);
  return site;
}

function spread(x: number, z: number, raw: RawColumn) {
  let lo = 1e9, hi = -1e9;
  for (let a = 0; a < 8; a++) for (const r of [12, 26]) {
    const h = raw(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r).height;
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return hi - lo;
}

/** Village whose area contains (x, z). */
export function villageAt(x: number, z: number, worldSeed: number, raw: RawColumn): VillageSite | null {
  const cit = citadelSite(worldSeed, raw);
  if ((cit.x - x) ** 2 + (cit.z - z) ** 2 < (CITADEL_R + 22) ** 2) return cit;
  const cx = Math.floor(x / VILLAGE_CELL), cz = Math.floor(z / VILLAGE_CELL);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const s = siteForCell(cx + i, cz + j, worldSeed, raw);
    if (s && (s.x - x) ** 2 + (s.z - z) ** 2 < (VILLAGE_RADIUS + 22) ** 2) return s;
  }
  // the first village may sit in a neighbouring cell's range of the origin cell
  const s0 = siteForCell(0, 0, worldSeed, raw);
  if (s0 && (s0.x - x) ** 2 + (s0.z - z) ** 2 < (VILLAGE_RADIUS + 22) ** 2) return s0;
  return null;
}

/** Blend weight toward the village ground height (1 inside, 0 outside). */
export function flattenWeight(site: VillageSite, x: number, z: number) {
  const d = Math.hypot(x - site.x, z - site.z);
  const R = site.r ?? VILLAGE_RADIUS;
  const t = Math.max(0, Math.min(1, (R + 20 - d) / 20));
  return t * t * (3 - 2 * t);
}

// ------------------------------------------------------------------ layout
export type Job = 'farmer' | 'blacksmith' | 'guard' | 'merchant' | 'alchemist' | 'tailor' | 'priest' | 'child' | 'innkeeper' | 'hunter' | 'beggar' | 'villager' | 'banker' | 'arena_master';
export interface Spot { x: number; y: number; z: number; }
export interface BuildingInfo { kind: 'house' | 'tavern' | 'chapel' | 'smithy' | 'farm' | 'stall' | 'bank' | 'arena'; door: Spot; inside: Spot; beds: Spot[]; job?: Job; /** building name (inns) */ name?: string; /** fixed name of the NPC who works here */ npc?: string; female?: boolean; }
export interface Layout { pieces: Piece[]; buildings: BuildingInfo[]; square: Spot; well: Spot; }

/** Rotate local (x, z) by q quarter turns, matching building piece rotation. */
const rotQ = (x: number, z: number, q: number): [number, number] => q === 0 ? [x, z] : q === 1 ? [z, -x] : q === 2 ? [-x, -z] : [-z, x];

function house(w: number, d: number, opts: { stone?: boolean; roof?: string; open?: boolean } = {}): { pieces: Piece[]; door: [number, number]; beds: [number, number][]; inside: [number, number] } {
  const out: Piece[] = [];
  const wall = opts.stone ? 'stone_wall' : 'wall';
  const floor = opts.stone ? 'stone_floor' : 'floor';
  for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) out.push({ id: floor, x: i * 2 + 1, y: 0, z: k * 2 + 1, rot: 0 });
  const doorI = Math.floor(w / 2);
  for (let i = 0; i < w; i++) {
    if (!opts.open) out.push({ id: i === doorI ? 'door_wall' : wall, x: i * 2 + 1, y: 0, z: 0, rot: 0 });
    out.push({ id: i === 0 && !opts.stone ? 'window_wall' : wall, x: i * 2 + 1, y: 0, z: d * 2, rot: Math.PI });
  }
  for (let k = 0; k < d; k++) {
    out.push({ id: k === 0 && d > 1 && !opts.stone ? 'window_wall' : wall, x: 0, y: 0, z: k * 2 + 1, rot: Math.PI / 2 });
    out.push({ id: k === d - 1 && w > 2 && !opts.stone ? 'window_wall' : wall, x: w * 2, y: 0, z: k * 2 + 1, rot: -Math.PI / 2 });
  }
  const half = Math.ceil(d / 2), roof = opts.roof ?? 'roof';
  for (let k = 0; k < d; k++) {
    const front = k < half, level = front ? k : d - 1 - k;
    for (const x of [0, w * 2]) out.push({ id: 'gable', x, y: WALL_H + level * 1.6, z: k * 2 + 1, rot: front ? -Math.PI / 2 : Math.PI / 2 });
    for (let i = 0; i < w; i++) out.push({ id: roof, x: i * 2 + 1, y: WALL_H + level * 1.6, z: k * 2 + 1, rot: front ? Math.PI : 0 });
  }
  return { pieces: out, door: [doorI * 2 + 1, -0.8], beds: [], inside: [w, d] };
}


type PlanB = { kind: BuildingInfo['kind']; w: number; d: number; job?: Job; stone?: boolean; open?: boolean; name?: string; npc?: string; female?: boolean; furnish?: (place: (p: Piece) => void, W: number, D: number) => void };
/** Place one building (local box 0..W x 0..D, door on the local -z side) at world corner (ox, oz) turned by q quarter turns. */
function placeBuilding(pieces: Piece[], buildings: BuildingInfo[], b: PlanB, ox: number, oz: number, q: number, y0: number, r: () => number) {
  const W = b.w * 2, D = b.d * 2;
  // local origin corner: rotation maps local box (0..W, 0..D) into (ox..ox+ex, oz..oz+ez)
  const corner = rotQ(W, D, q);
  const bx = ox - Math.min(0, corner[0]), bz = oz - Math.min(0, corner[1]);
  const toWorld = (lx: number, lz: number): [number, number] => { const [rx, rz] = rotQ(lx, lz, q); return [bx + rx, bz + rz]; };
  const place = (p: Piece) => { const [x, z] = toWorld(p.x, p.z); pieces.push({ ...p, x, y: y0 + p.y, z, rot: p.rot + q * (Math.PI / 2) }); };
  if (b.kind === 'farm') {
    for (let i = 0; i < b.w; i++) { place({ id: 'fence', x: i * 2 + 1, y: 0, z: 0, rot: 0 }); place({ id: 'fence', x: i * 2 + 1, y: 0, z: D, rot: 0 }); }
    for (let k = 0; k < b.d; k++) { if (k !== 1) place({ id: 'fence', x: 0, y: 0, z: k * 2 + 1, rot: Math.PI / 2 }); place({ id: 'fence', x: W, y: 0, z: k * 2 + 1, rot: Math.PI / 2 }); }
    for (let i = 0; i < b.w; i++) for (let k = 0; k < b.d; k++) place({ id: 'crops', x: i * 2 + 1, y: -0.08, z: k * 2 + 1, rot: 0 });
    const [ix, iz] = toWorld(W / 2, D / 2);
    const [dx, dz] = toWorld(-0.8, 3);
    buildings.push({ kind: 'farm', door: { x: dx, y: y0, z: dz }, inside: { x: ix, y: y0, z: iz }, beds: [], job: 'farmer' });
    return;
  }
  const h = house(b.w, b.d, { stone: b.stone, roof: b.kind === 'house' && r() < 0.5 ? 'thatch_roof' : 'roof', open: b.open });
  h.pieces.forEach(place);
  // furniture
  const furn: Piece[] = [];
  const beds: [number, number][] = [];
  if (b.kind === 'house') {
    furn.push({ id: 'bed', x: 1.2, y: 0, z: D - 1.3, rot: 0 }); beds.push([1.2, D - 1.3]);
    if (b.w > 2) { furn.push({ id: 'bed', x: 3.2, y: 0, z: D - 1.3, rot: 0 }); beds.push([3.2, D - 1.3]); }
    furn.push({ id: 'table', x: W - 1.2, y: 0, z: 1.4, rot: Math.PI / 2 }, { id: 'chest', x: W - 0.6, y: 0, z: D - 0.6, rot: Math.PI / 2 }, { id: 'wall_torch', x: W / 2 + 0.6, y: 0, z: D - 0.1, rot: 0 });
  } else if (b.kind === 'bank') {
    furn.push({ id: 'stall', x: W / 2, y: 0, z: 2.2, rot: 0 }, { id: 'stash', x: W / 2, y: 0, z: D - 0.6, rot: 0 }, { id: 'chest', x: 0.8, y: 0, z: D - 0.6, rot: 0 }, { id: 'wall_torch', x: 1, y: 0, z: D - 0.1, rot: 0 });
  } else if (b.kind === 'tavern') {
    furn.push({ id: 'fireplace', x: W / 2, y: 0, z: D - 0.55, rot: 0 });
    for (const [x, z] of [[2, 2.2], [5.4, 2.2], [2, 4.3]]) furn.push({ id: 'table', x, y: 0, z, rot: 0 }, { id: 'chair', x: x - 0.9, y: 0, z, rot: -Math.PI / 2 }, { id: 'chair', x: x + 0.9, y: 0, z, rot: Math.PI / 2 });
    furn.push({ id: 'bed', x: W - 0.8, y: 0, z: D - 1.2, rot: 0 }, { id: 'banner', x: 0.4, y: 0, z: D - 0.4, rot: 0 });
    beds.push([W - 0.8, D - 1.2]);
  } else if (b.kind === 'chapel') {
    furn.push({ id: 'banner', x: W / 2 - 1.2, y: 0, z: D - 0.4, rot: 0 }, { id: 'banner', x: W / 2 + 1.2, y: 0, z: D - 0.4, rot: 0 }, { id: 'altar', x: W / 2, y: 0, z: D - 1.4, rot: 0 });
    for (let k = 0; k < 2; k++) furn.push({ id: 'pew', x: W / 2 - 1.3, y: 0, z: 2.4 + k * 1.6, rot: 0 }, { id: 'pew', x: W / 2 + 1.3, y: 0, z: 2.4 + k * 1.6, rot: 0 });
    furn.push({ id: 'lantern', x: 0.5, y: 0, z: 0.5, rot: 0 });
    furn.push({ id: 'fresco', x: W / 2, y: 0, z: D - 0.2, rot: 0 });
  } else if (b.kind === 'smithy') {
    furn.push({ id: 'anvil_piece', x: W / 2, y: 0, z: 2, rot: 0 }, { id: 'forge', x: W - 1.0, y: 0, z: D - 0.8, rot: 0 }, { id: 'weapon_rack', x: 0.6, y: 0, z: D - 0.4, rot: 0 });
  }
  b.furnish?.((p) => furn.push(p), W, D);
  furn.forEach(place);
  const [ix, iz] = toWorld(W / 2, D / 2), [dx, dz] = toWorld(h.door[0], h.door[1]);
  buildings.push({ kind: b.kind, door: { x: dx, y: y0, z: dz }, inside: { x: ix, y: y0, z: iz }, beds: beds.map(([x, z]) => { const [wx, wz] = toWorld(x, z); return { x: wx, y: y0, z: wz }; }), job: b.job, name: b.name, npc: b.npc, female: b.female });
}

export function buildLayout(site: VillageSite): Layout {
  if (site.id === 'citadel') return citadelLayout(site);
  const r = mulberry32(site.seed);
  const pieces: Piece[] = [];
  const buildings: BuildingInfo[] = [];
  const y0 = site.y + 0.1;
  const sx = Math.round(site.x / 2) * 2, sz = Math.round(site.z / 2) * 2;
  const rects: [number, number, number, number][] = [[sx - 7, sz - 7, sx + 7, sz + 7]]; // the square stays open
  const free = (x0: number, z0: number, x1: number, z1: number) => rects.every(([a, b, c, d]) => x1 + 2 < a || x0 - 2 > c || z1 + 2 < b || z0 - 2 > d);

  // the square: well + market stalls
  pieces.push({ id: 'well', x: sx, y: y0 - 0.1, z: sz, rot: 0 });
  pieces.push({ id: 'waystone', x: sx + Math.cos(3.5) * 5, y: y0 - 0.1, z: sz + Math.sin(3.5) * 5, rot: 0 });
  const stalls: Job[] = ['merchant', 'alchemist', 'tailor'];
  stalls.forEach((job, i) => {
    const a = i * 2.1 + 0.4;
    const x = sx + Math.cos(a) * 5.2, z = sz + Math.sin(a) * 5.2;
    const rot = ((((Math.round(Math.atan2(x - sx, z - sz) / (Math.PI / 2)) % 4) + 4) % 4) * Math.PI) / 2;
    pieces.push({ id: 'stall', x, y: y0 - 0.1, z, rot });
    buildings.push({ kind: 'stall', door: { x, y: y0, z }, inside: { x: x + Math.sin(rot) * 0.9, y: y0, z: z + Math.cos(rot) * 0.9 }, beds: [], job });
  });

  const plan: { kind: BuildingInfo['kind']; w: number; d: number; job?: Job; stone?: boolean; open?: boolean }[] = [
    { kind: 'tavern', w: 4, d: 3, job: 'innkeeper' },
    { kind: 'chapel', w: 3, d: 4, job: 'priest', stone: true },
    { kind: 'smithy', w: 3, d: 2, job: 'blacksmith', open: true }
  ];
  const houses = 6 + Math.floor(r() * 7);
  for (let i = 0; i < houses; i++) plan.push({ kind: 'house', w: 2 + (r() < 0.4 ? 1 : 0), d: 2 });
  plan.push({ kind: 'farm', w: 4, d: 3, job: 'farmer' }, { kind: 'farm', w: 3, d: 3, job: 'farmer' });

  let angle = r() * Math.PI * 2;
  for (const b of plan) {
    for (let tries = 0; tries < 40; tries++) {
      const dist = 13 + (b.kind === 'farm' ? 12 : 0) + r() * 13 + tries * 0.3;
      angle += 0.5 + r() * 0.6;
      const cx = sx + Math.cos(angle) * dist, cz = sz + Math.sin(angle) * dist;
      // door faces the square: pick the quarter turn whose front (-z local) points inward
      const q = ((Math.round(Math.atan2(cx - sx, cz - sz) / (Math.PI / 2)) % 4) + 4) % 4;
      const W = b.w * 2, D = b.d * 2;
      const [ex, ez] = q % 2 === 0 ? [W, D] : [D, W];
      const ox = Math.round((cx - ex / 2) / 2) * 2, oz = Math.round((cz - ez / 2) / 2) * 2;
      if (!free(ox, oz, ox + ex, oz + ez)) continue;
      if (Math.hypot(ox + ex / 2 - sx, oz + ez / 2 - sz) > VILLAGE_RADIUS + 4) continue;
      rects.push([ox, oz, ox + ex, oz + ez]);
      placeBuilding(pieces, buildings, b, ox, oz, q, y0, r);
      break;
    }
  }
  return { pieces: pieces.map((p) => ({ ...p, gen: true } as Piece)), buildings, square: { x: sx, y: y0, z: sz }, well: { x: sx, y: y0, z: sz } };
}

export const isVillageHeightOk = (h: number) => h > SEA_LEVEL + 2 && h < SEA_LEVEL + 32;

// ------------------------------------------------------------------ the Pale Citadel
let citCache: { seed: number; site: VillageSite } | null = null;
/** the arena's centre relative to the citadel and its radius */
export const ARENA_DX = -15, ARENA_DZ = -17, ARENA_R = 9;

/** The Pale Citadel: searched near its nominal place on the flattest good ground (deterministic). */
export function citadelSite(worldSeed: number, raw: RawColumn): VillageSite {
  if (citCache && citCache.seed === worldSeed) return citCache.site;
  let best: { x: number; z: number; h: number; s: number } | null = null;
  for (const d of [0, 50, 100, 150, 200]) for (let a = 0; a < (d ? 10 : 1); a++) {
    const x = CITADEL_NOMINAL.x + Math.cos(a / 10 * Math.PI * 2) * d, z = CITADEL_NOMINAL.z + Math.sin(a / 10 * Math.PI * 2) * d;
    const c = raw(x, z);
    if (!c.ok) continue;
    let lo = 1e9, hi = -1e9;
    for (let k = 0; k < 8; k++) for (const r of [20, 40, 60]) { const h = raw(x + Math.cos(k * 0.785) * r, z + Math.sin(k * 0.785) * r).height; lo = Math.min(lo, h); hi = Math.max(hi, h); }
    const s = hi - lo + d * 0.02;
    if (!best || s < best.s) best = { x, z, h: c.height, s };
  }
  const b = best ?? { x: CITADEL_NOMINAL.x, z: CITADEL_NOMINAL.z, h: Math.max(SEA_LEVEL + 6, raw(CITADEL_NOMINAL.x, CITADEL_NOMINAL.z).height), s: 0 };
  const site: VillageSite = { id: 'citadel', x: Math.round(b.x / 2) * 2, z: Math.round(b.z / 2) * 2, y: Math.round(Math.max(b.h, SEA_LEVEL + 6)), seed: Math.floor(hash3(7, 7, 7, worldSeed) * 1e9), name: 'The Pale Citadel', r: CITADEL_R };
  citCache = { seed: worldSeed, site };
  return site;
}

// ---- the scorpion labyrinth beneath it
export interface Labyrinth { x0: number; z0: number; floor: number; open: Uint8Array; n: number; cx: number; cz: number; top: number; }
const N_ = 1, S_ = 2, W_ = 4, E_ = 8;
let labCache: { site: VillageSite; lab: Labyrinth } | null = null;
export function labyrinthOf(site: VillageSite): Labyrinth {
  if (labCache && labCache.site === site) return labCache.lab;
  const n = LAB.cells, r = mulberry32(site.seed ^ 0x1abb);
  const open = new Uint8Array(n * n);
  const seen = new Uint8Array(n * n);
  const stack = [Math.floor(n / 2) + (n - 1) * n];
  seen[stack[0]] = 1;
  const dirs: [number, number, number, number][] = [[0, -1, N_, S_], [0, 1, S_, N_], [-1, 0, W_, E_], [1, 0, E_, W_]];
  while (stack.length) {
    const c = stack[stack.length - 1], ci = c % n, cj = Math.floor(c / n);
    const opts = dirs.filter(([dx, dz]) => { const i = ci + dx, j = cj + dz; return i >= 0 && j >= 0 && i < n && j < n && !seen[i + j * n]; });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dz, a, b] = opts[Math.floor(r() * opts.length)];
    const nb = ci + dx + (cj + dz) * n;
    open[c] |= a; open[nb] |= b; seen[nb] = 1; stack.push(nb);
  }
  // a few loops so it is not one long corridor
  for (let k = 0; k < 14; k++) {
    const i = 1 + Math.floor(r() * (n - 2)), j = 1 + Math.floor(r() * (n - 2));
    const [dx, dz, a, b] = dirs[Math.floor(r() * 4)];
    open[i + j * n] |= a; open[i + dx + (j + dz) * n] |= b;
  }
  open[Math.floor(n / 2) + (n - 1) * n] |= S_; // the entrance on the south side
  const half = (n * LAB.cell) / 2;
  const lab: Labyrinth = { x0: site.x - half, z0: site.z - half, floor: site.y - LAB.depth, open, n, cx: site.x, cz: site.z, top: site.y };
  labCache = { site, lab };
  return lab;
}

const sdBox = (px: number, pz: number, x0: number, z0: number, x1: number, z1: number) => {
  const dx = Math.max(x0 - px, px - x1), dz = Math.max(z0 - pz, pz - z1);
  return dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz);
};

/** Signed distance to the labyrinth's air (negative = inside a corridor, ramp or stair shaft). */
export function labyrinthDist(L: Labyrinth, x: number, y: number, z: number): number {
  const C = LAB.cell, hw = LAB.width / 2, H = LAB.height;
  let best = 1e9;
  // entrance ramp: from the south edge, rising to the surface over ~38 m
  const zs = L.z0 + L.n * C;
  if (z > zs - 3 && z < zs + 60 && Math.abs(x - L.cx) < 6) {
    const rf = L.floor + Math.max(0, z - zs) * (LAB.depth / 36);
    best = Math.min(best, Math.max(Math.abs(x - L.cx) - hw, rf - y, y - (rf + H), zs - 3 - z));
  }
  // exit stair shaft from the centre cell up into the courtyard (open to the sky)
  if (Math.abs(x - L.cx) < 4 && z > L.cz - 10 && z < L.cz + 4) {
    const sf = L.floor + Math.max(0, Math.min(LAB.depth, (L.cz + 2 - z) * 1.2));
    best = Math.min(best, Math.max(Math.abs(x - L.cx) - 1.2, sdBox(x, z, L.cx - 1.2, L.cz - 8.2, L.cx + 1.2, L.cz + 2.2), sf - 0.3 - y));
  }
  const vy = Math.max(L.floor - y, y - (L.floor + H));
  const lx = x - L.x0, lz = z - L.z0;
  const ci = Math.floor(lx / C), cj = Math.floor(lz / C);
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    if (i < 0 || j < 0 || i >= L.n || j >= L.n) continue;
    const o = L.open[i + j * L.n];
    const mx = L.x0 + (i + 0.5) * C, mz = L.z0 + (j + 0.5) * C;
    let d = sdBox(x, z, mx - hw, mz - hw, mx + hw, mz + hw);
    if (o & N_) d = Math.min(d, sdBox(x, z, mx - hw, mz - C / 2 - 0.5, mx + hw, mz));
    if (o & S_) d = Math.min(d, sdBox(x, z, mx - hw, mz, mx + hw, mz + C / 2 + 0.5));
    if (o & W_) d = Math.min(d, sdBox(x, z, mx - C / 2 - 0.5, mz - hw, mx, mz + hw));
    if (o & E_) d = Math.min(d, sdBox(x, z, mx, mz - hw, mx + C / 2 + 0.5, mz + hw));
    best = Math.min(best, Math.max(d, vy));
  }
  return best;
}

/** World position of a labyrinth cell's centre (on the floor). */
export function labCell(L: Labyrinth, i: number, j: number): Spot { return { x: L.x0 + (i + 0.5) * LAB.cell, y: L.floor, z: L.z0 + (j + 0.5) * LAB.cell }; }

/** Generated pieces of the labyrinth: torches, bones, the stairs up and the entrance arch. */
export function labyrinthPieces(L: Labyrinth, surfaceAt: (x: number, z: number) => number): Piece[] {
  const out: Piece[] = [];
  const r = mulberry32(L.open.length * 977 + Math.floor(L.cx));
  for (let j = 0; j < L.n; j++) for (let i = 0; i < L.n; i++) {
    const c = labCell(L, i, j), o = L.open[i + j * L.n];
    if ((i * 7 + j * 3) % 3 === 0) {
      // a torch on a closed side of the cell
      const side = [[N_, 0, -1.4, Math.PI], [S_, 0, 1.4, 0], [W_, -1.4, 0, -Math.PI / 2], [E_, 1.4, 0, Math.PI / 2]].find(([b]) => !(o & (b as number)));
      if (side) out.push({ id: 'wall_torch', x: c.x + (side[1] as number), y: c.y, z: c.z + (side[2] as number), rot: side[3] as number });
    }
    if (r() < 0.12) out.push({ id: 'bones', x: c.x + (r() - 0.5) * 1.6, y: c.y + 0.02, z: c.z + (r() - 0.5) * 1.6, rot: r() * 6 });
  }
  for (let k = 0; k < 5; k++) out.push({ id: 'stairs', x: L.cx, y: L.floor + k * 2.4, z: L.cz + 1 - k * 2, rot: 0 });
  // the entrance: an arch of pale stone where the ramp meets the surface
  const zs = L.z0 + L.n * LAB.cell;
  let zm = zs;
  for (let z = zs; z < zs + 60; z += 0.5) { if (L.floor + (z - zs) * (LAB.depth / 36) >= surfaceAt(L.cx, z) - 1.2) { zm = z; break; } }
  const ym = surfaceAt(L.cx, zm + 1);
  out.push({ id: 'marble_wall', x: L.cx - 2.6, y: ym - 0.4, z: zm, rot: Math.PI / 2 }, { id: 'marble_wall', x: L.cx + 2.6, y: ym - 0.4, z: zm, rot: Math.PI / 2 });
  out.push({ id: 'lab_arch', x: L.cx, y: ym - 0.4, z: zm + 1, rot: 0 });
  out.push({ id: 'wall_torch', x: L.cx - 2.0, y: ym - 0.4, z: zm + 1.8, rot: 0 }, { id: 'wall_torch', x: L.cx + 2.0, y: ym - 0.4, z: zm + 1.8, rot: 0 });
  return out.map((p) => ({ ...p, gen: true } as Piece));
}

/** The citadel's buildings: white walls, a sealed gate, the arena, inns, shops, bank, chapel, quest board. */
function citadelLayout(site: VillageSite): Layout {
  const r = mulberry32(site.seed);
  const pieces: Piece[] = [];
  const buildings: BuildingInfo[] = [];
  const y0 = site.y + 0.1;
  const cx = site.x, cz = site.z, H = CITADEL_HALF;
  // walls: three courses of white stone + crenellations, towers at the corners
  for (let k = -H / 2; k < H / 2; k++) {
    const t = k * 2 + 1;
    for (let lvl = 0; lvl < 3; lvl++) {
      const y = y0 - 0.6 + lvl * WALL_H;
      const gate = Math.abs(t) < 4 && lvl < 2;
      if (!gate) pieces.push({ id: 'marble_wall', x: cx + t, y, z: cz + H, rot: 0 });
      pieces.push({ id: 'marble_wall', x: cx + t, y, z: cz - H, rot: 0 });
      pieces.push({ id: 'marble_wall', x: cx - H, y, z: cz + t, rot: Math.PI / 2 });
      pieces.push({ id: 'marble_wall', x: cx + H, y, z: cz + t, rot: Math.PI / 2 });
    }
    const yc = y0 - 0.6 + 3 * WALL_H;
    pieces.push({ id: 'crenel', x: cx + t, y: yc, z: cz + H, rot: 0 }, { id: 'crenel', x: cx + t, y: yc, z: cz - H, rot: Math.PI });
    pieces.push({ id: 'crenel', x: cx - H, y: yc, z: cz + t, rot: -Math.PI / 2 }, { id: 'crenel', x: cx + H, y: yc, z: cz + t, rot: Math.PI / 2 });
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pieces.push({ id: 'wall_tower', x: cx + sx * H, y: y0 - 0.6, z: cz + sz * H, rot: 0 });
  pieces.push({ id: 'citadel_gate', x: cx, y: y0 - 0.6, z: cz + H, rot: 0 });
  for (const s of [-1, 1]) pieces.push({ id: 'banner', x: cx + s * 5, y: y0, z: cz + H - 0.6, rot: Math.PI }, { id: 'lantern', x: cx + s * 6, y: y0, z: cz + H - 2, rot: 0 });

  // courtyard: the stair shaft from the labyrinth (fenced), the quest board, lanterns
  for (let k = 0; k < 5; k++) for (const s of [-1, 1]) pieces.push({ id: 'fence', x: cx + s * 1.4, y: y0, z: cz + 1 - k * 2, rot: Math.PI / 2 });
  pieces.push({ id: 'fence', x: cx, y: y0, z: cz - 8.6, rot: 0 });
  pieces.push({ id: 'quest_board', x: cx + 5, y: y0, z: cz + 5, rot: Math.PI });
  pieces.push({ id: 'waystone', x: cx - 5, y: y0, z: cz + 6, rot: 0 });
  for (const [dx, dz] of [[6, -6], [-6, -6], [6, 10], [-6, 10], [-10, 24], [10, 24]]) pieces.push({ id: 'lantern', x: cx + dx, y: y0, z: cz + dz, rot: 0 });
  buildings.push({ kind: 'stall', door: { x: cx + 5, y: y0, z: cz + 6.5 }, inside: { x: cx + 5, y: y0, z: cz + 6.5 }, beds: [], job: 'guard' });

  // the arena (north-west): a ring of pale parapets with an opening to the south, benches outside
  const ax = cx + ARENA_DX, az = cz + ARENA_DZ, AR = ARENA_R;
  const segs = 28;
  for (let i = 0; i < segs; i++) {
    const a = (i + 0.5) / segs * Math.PI * 2;
    if (Math.cos(a) > 0.93) continue; // the gap at +z (south)
    const x = ax + Math.sin(a) * AR, z = az + Math.cos(a) * AR;
    pieces.push({ id: 'marble_half', x, y: y0, z, rot: a });
    if (i % 2 === 0) pieces.push({ id: 'pew', x: ax + Math.sin(a) * (AR + 1.5), y: y0, z: az + Math.cos(a) * (AR + 1.5), rot: a + Math.PI });
  }
  for (const s of [-1, 1]) pieces.push({ id: 'banner', x: ax + s * 2.4, y: y0, z: az + AR + 0.8, rot: 0 }, { id: 'lantern', x: ax + s * 3.6, y: y0, z: az + AR + 1.4, rot: 0 });
  buildings.push({ kind: 'arena', door: { x: ax + 3, y: y0, z: az + AR + 2 }, inside: { x: ax, y: y0, z: az }, beds: [], job: 'arena_master', npc: 'Kallias the Unbowed' });

  // buildings along the walls, doors facing the courtyard ([x, z, quarter turns] of the min corner)
  const plan: (PlanB & { at: [number, number, number] })[] = [
    { kind: 'tavern', w: 4, d: 3, job: 'innkeeper', name: 'The Last Thread', npc: 'Atropos', female: true, at: [-H + 2, 2, 3] },
    { kind: 'smithy', w: 3, d: 2, job: 'blacksmith', open: true, at: [-H + 2, 14, 3] },
    { kind: 'house', w: 2, d: 2, at: [-H + 2, 22, 3] },
    { kind: 'tavern', w: 4, d: 3, job: 'innkeeper', name: 'The Gilded Spindle', npc: 'Lachesis', female: true, at: [H - 8, 2, 1] },
    { kind: 'bank', w: 3, d: 2, job: 'banker', stone: true, npc: 'Old Mordecai', at: [H - 6, 14, 1] },
    { kind: 'chapel', w: 3, d: 4, job: 'priest', stone: true, at: [H - 10, 22, 0] },
    { kind: 'house', w: 2, d: 2, at: [-H + 2, -8, 3] },
    { kind: 'house', w: 3, d: 2, at: [H - 6, -8, 1] }, { kind: 'house', w: 2, d: 2, at: [H - 6, -18, 1] },
    { kind: 'house', w: 3, d: 2, at: [H - 6, -28, 1] },
    { kind: 'house', w: 2, d: 2, at: [2, -H + 2, 2] }, { kind: 'house', w: 3, d: 2, at: [9, -H + 2, 2] }, { kind: 'house', w: 2, d: 2, at: [18, -H + 2, 2] },
    { kind: 'house', w: 3, d: 2, at: [-20, H - 6, 0] }, { kind: 'house', w: 2, d: 2, at: [-12, H - 6, 0] },
    { kind: 'house', w: 2, d: 2, at: [8, H - 6, 0] }, { kind: 'house', w: 3, d: 2, at: [14, H - 6, 0] }
  ];
  for (const b of plan) {
    const [lx, lz, q] = b.at;
    placeBuilding(pieces, buildings, b, cx + lx, cz + lz, q, y0, r);
  }
  // the square: a well, benches and lanterns
  pieces.push({ id: 'well', x: cx, y: y0 - 0.1, z: cz + 20, rot: 0 });
  for (const [dx, dz] of [[-4, 20], [4, 20]]) pieces.push({ id: 'pew', x: cx + dx, y: y0, z: cz + dz, rot: dx < 0 ? -Math.PI / 2 : Math.PI / 2 });
  // market stalls on the square in front of the inns
  (['merchant', 'alchemist', 'tailor'] as Job[]).forEach((job, i) => {
    const x = cx - 8 + i * 8, z = cz + 13;
    pieces.push({ id: 'stall', x, y: y0 - 0.1, z, rot: 0 });
    buildings.push({ kind: 'stall', door: { x, y: y0, z }, inside: { x, y: y0, z: z + 0.9 }, beds: [], job });
  });
  return { pieces: pieces.map((p) => ({ ...p, gen: true } as Piece)), buildings, square: { x: cx, y: y0, z: cz + 10 }, well: { x: cx, y: y0, z: cz + 10 } };
}
