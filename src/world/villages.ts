// Villages: deterministic sites (from the seed), flattened ground, layouts built
// from the same pieces the player builds with, and the people who live there.
// Pure functions — usable from workers (terrain flattening) and the main thread.
import { hash3, mulberry32 } from './noise';
import { SEA_LEVEL } from './constants';
import { WALL_H } from '../data/pieces';
import type { Piece } from './building';

export const VILLAGE_CELL = 560;
export const VILLAGE_RADIUS = 36;

export interface VillageSite { id: string; x: number; z: number; y: number; seed: number; name: string; }

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
      if (!c.ok) continue;
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
  const t = Math.max(0, Math.min(1, (VILLAGE_RADIUS + 20 - d) / 20));
  return t * t * (3 - 2 * t);
}

// ------------------------------------------------------------------ layout
export type Job = 'farmer' | 'blacksmith' | 'guard' | 'merchant' | 'alchemist' | 'tailor' | 'priest' | 'child' | 'innkeeper' | 'hunter' | 'beggar' | 'villager';
export interface Spot { x: number; y: number; z: number; }
export interface BuildingInfo { kind: 'house' | 'tavern' | 'chapel' | 'smithy' | 'farm' | 'stall'; door: Spot; inside: Spot; beds: Spot[]; job?: Job; }
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

export function buildLayout(site: VillageSite): Layout {
  const r = mulberry32(site.seed);
  const pieces: Piece[] = [];
  const buildings: BuildingInfo[] = [];
  const y0 = site.y + 0.1;
  const sx = Math.round(site.x / 2) * 2, sz = Math.round(site.z / 2) * 2;
  const rects: [number, number, number, number][] = [[sx - 7, sz - 7, sx + 7, sz + 7]]; // the square stays open
  const free = (x0: number, z0: number, x1: number, z1: number) => rects.every(([a, b, c, d]) => x1 + 2 < a || x0 - 2 > c || z1 + 2 < b || z0 - 2 > d);

  // the square: well + market stalls
  pieces.push({ id: 'well', x: sx, y: y0 - 0.1, z: sz, rot: 0 });
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
        break;
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
      } else if (b.kind === 'tavern') {
        furn.push({ id: 'fireplace', x: W / 2, y: 0, z: D - 0.55, rot: 0 });
        for (const [x, z] of [[2, 2.2], [5.4, 2.2], [2, 4.3]]) furn.push({ id: 'table', x, y: 0, z, rot: 0 }, { id: 'chair', x: x - 0.9, y: 0, z, rot: -Math.PI / 2 }, { id: 'chair', x: x + 0.9, y: 0, z, rot: Math.PI / 2 });
        furn.push({ id: 'bed', x: W - 0.8, y: 0, z: D - 1.2, rot: 0 }, { id: 'banner', x: 0.4, y: 0, z: D - 0.4, rot: 0 });
        beds.push([W - 0.8, D - 1.2]);
      } else if (b.kind === 'chapel') {
        furn.push({ id: 'banner', x: W / 2 - 1.2, y: 0, z: D - 0.4, rot: 0 }, { id: 'banner', x: W / 2 + 1.2, y: 0, z: D - 0.4, rot: 0 }, { id: 'altar', x: W / 2, y: 0, z: D - 1.4, rot: 0 });
        for (let k = 0; k < 2; k++) furn.push({ id: 'pew', x: W / 2 - 1.3, y: 0, z: 2.4 + k * 1.6, rot: 0 }, { id: 'pew', x: W / 2 + 1.3, y: 0, z: 2.4 + k * 1.6, rot: 0 });
        furn.push({ id: 'lantern', x: 0.5, y: 0, z: 0.5, rot: 0 });
      } else if (b.kind === 'smithy') {
        furn.push({ id: 'anvil_piece', x: W / 2, y: 0, z: 2, rot: 0 }, { id: 'forge', x: W - 1.0, y: 0, z: D - 0.8, rot: 0 }, { id: 'weapon_rack', x: 0.6, y: 0, z: D - 0.4, rot: 0 });
      }
      furn.forEach(place);
      const [ix, iz] = toWorld(W / 2, D / 2), [dx, dz] = toWorld(h.door[0], h.door[1]);
      buildings.push({ kind: b.kind, door: { x: dx, y: y0, z: dz }, inside: { x: ix, y: y0, z: iz }, beds: beds.map(([x, z]) => { const [wx, wz] = toWorld(x, z); return { x: wx, y: y0, z: wz }; }), job: b.job });
      break;
    }
  }
  return { pieces: pieces.map((p) => ({ ...p, gen: true } as Piece)), buildings, square: { x: sx, y: y0, z: sz }, well: { x: sx, y: y0, z: sz } };
}

export const isVillageHeightOk = (h: number) => h > SEA_LEVEL + 2 && h < SEA_LEVEL + 32;
