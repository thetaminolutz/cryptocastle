// Player building: grid-snapped structure pieces, furniture, lights, doors, chests,
// beds (respawn), land claims, blueprints (planned pieces) and undo. Pieces are drawn
// with one instanced draw call per type, collide as axis-aligned boxes and are saved
// as a compact list.
import * as THREE from 'three';
import { GeoBuilder, PropLayer } from './vegetation';
import { propMaterial } from './shaders';
import { SHADOW_LAYER, type ShadowSystem } from '../engine/shadows';
import { PIECES, PieceDef, Box, GRID, WALL_H, CLAIM_RADIUS, Blueprint } from '../data/pieces';
import type { Stack } from '../game/inventory';
import { mulberry32 } from './noise';

export interface Piece {
  id: string; x: number; y: number; z: number; rot: number;
  open?: boolean; planned?: boolean; items?: (Stack | null)[];
  /** part of a generated village (not saved, cannot be removed) */
  gen?: boolean;
}
export interface AABB { min: THREE.Vector3; max: THREE.Vector3; piece: Piece; }
export interface BuildSave { pieces: Piece[]; respawn: [number, number, number] | null; }

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
type C3 = [number, number, number];

// ------------------------------------------------------------------ models
function box(b: GeoBuilder, w: number, h: number, d: number, x: number, y: number, z: number, layer: string, color: C3 = [1, 1, 1], glow = 0, uv?: [number, number]) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  b.add(g, { layer, color, glow, uvScale: uv ?? [Math.max(w, d) / 2, h / 2] });
}
function log(b: GeoBuilder, x: number, y0: number, z: number, h: number, r = 0.11) {
  const g = new THREE.CylinderGeometry(r, r * 1.08, h, 7); g.translate(x, y0 + h / 2, z);
  b.add(g, { layer: 'bark_oak', uvScale: [1, h / 2] });
}
function flame(b: GeoBuilder, x: number, y: number, z: number, s = 1) {
  for (let i = 0; i < 3; i++) {
    const f = new THREE.ConeGeometry(0.06 * s * (1 - i * 0.2), 0.3 * s * (1 + i * 0.2), 6, 1, true);
    f.translate(x + (i - 1) * 0.03 * s, y + 0.15 * s, z);
    b.add(f, { layer: 'white', color: i === 1 ? [1, 0.85, 0.45] : [1, 0.5, 0.12], glow: 3.5, wind: (p) => (p.y - y) * 8 });
  }
}
const DARK_WOOD: C3 = [0.7, 0.62, 0.55];

function wallFrame(b: GeoBuilder, mat: 'wood' | 'stone' | 'brick', h = WALL_H) {
  if (mat === 'wood') {
    box(b, 2, h, 0.16, 0, h / 2, 0, 'planks', [1, 1, 1], 0, [1, h / 2]);
    log(b, -0.95, 0, 0, h); log(b, 0.95, 0, 0, h);
    const beam = new THREE.CylinderGeometry(0.1, 0.1, 2, 7); beam.rotateZ(Math.PI / 2); beam.translate(0, h - 0.08, 0);
    b.add(beam, { layer: 'bark_oak' });
  } else {
    box(b, 2, h, 0.3, 0, h / 2, 0, 'stone_brick', mat === 'brick' ? [1.25, 0.62, 0.45] : [1, 1, 1], 0, [1, h / 2]);
  }
}

const MODELS: Record<string, () => THREE.BufferGeometry> = {
  floor: () => { const b = new GeoBuilder(); box(b, 2, 0.2, 2, 0, -0.1, 0, 'planks', [1, 1, 1], 0, [1, 1]); return b.build(); },
  stone_floor: () => { const b = new GeoBuilder(); box(b, 2, 0.25, 2, 0, -0.125, 0, 'cobble', [1, 1, 1], 0, [1, 1]); return b.build(); },
  wall: () => { const b = new GeoBuilder(); wallFrame(b, 'wood'); return b.build(); },
  stone_wall: () => { const b = new GeoBuilder(); wallFrame(b, 'stone'); return b.build(); },
  brick_wall: () => { const b = new GeoBuilder(); wallFrame(b, 'brick'); return b.build(); },
  half_wall: () => { const b = new GeoBuilder(); box(b, 2, 1.2, 0.16, 0, 0.6, 0, 'planks', [1, 1, 1], 0, [1, 0.6]); log(b, -0.95, 0, 0, 1.25); log(b, 0.95, 0, 0, 1.25); return b.build(); },
  window_wall: () => {
    const b = new GeoBuilder();
    box(b, 2, 0.9, 0.16, 0, 0.45, 0, 'planks', [1, 1, 1], 0, [1, 0.45]);
    box(b, 2, 0.6, 0.16, 0, 2.1, 0, 'planks', [1, 1, 1], 0, [1, 0.3]);
    box(b, 0.5, 0.9, 0.16, -0.75, 1.35, 0, 'planks'); box(b, 0.5, 0.9, 0.16, 0.75, 1.35, 0, 'planks');
    box(b, 1.1, 0.06, 0.3, 0, 0.92, -0.05, 'planks', DARK_WOOD);
    for (const s of [-1, 1]) { const sh = new THREE.BoxGeometry(0.5, 0.86, 0.04); sh.translate(s * 0.25, 0, 0); sh.rotateY(s * -1.1); sh.translate(s * 0.5, 1.35, -0.1); b.add(sh, { layer: 'planks', color: DARK_WOOD }); }
    log(b, -0.95, 0, 0, WALL_H); log(b, 0.95, 0, 0, WALL_H);
    return b.build();
  },
  door_wall: () => {
    const b = new GeoBuilder();
    box(b, 0.5, WALL_H, 0.16, -0.75, WALL_H / 2, 0, 'planks'); box(b, 0.5, WALL_H, 0.16, 0.75, WALL_H / 2, 0, 'planks');
    box(b, 1.0, 0.35, 0.16, 0, 2.225, 0, 'planks');
    box(b, 1.1, 0.12, 0.22, 0, 2.06, 0, 'bark_oak');
    log(b, -0.95, 0, 0, WALL_H); log(b, 0.95, 0, 0, WALL_H); log(b, -0.52, 0, 0, 2.05, 0.06); log(b, 0.52, 0, 0, 2.05, 0.06);
    return b.build();
  },
  door_leaf: () => { // hinge at x = 0, leaf extends to +x
    const b = new GeoBuilder();
    box(b, 1.0, 2.0, 0.07, 0.5, 1.0, 0, 'planks', DARK_WOOD, 0, [0.5, 1]);
    for (const y of [0.35, 1.65]) box(b, 0.95, 0.07, 0.09, 0.5, y, 0, 'white', [0.15, 0.15, 0.16]);
    const ring = new THREE.TorusGeometry(0.05, 0.012, 4, 10); ring.translate(0.85, 1.0, -0.06);
    b.add(ring, { layer: 'white', color: [0.6, 0.5, 0.25] });
    return b.build();
  },
  gable: () => {
    const b = new GeoBuilder();
    const g = new THREE.BufferGeometry();
    const t = 0.08;
    // right triangle rising toward +x, two faces + top edge
    const P = [[-1, 0], [1, 0], [1, 1.6]];
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [];
    for (const z of [-t, t]) for (const [x, y] of z < 0 ? [P[0], P[2], P[1]] : P) { pos.push(x, y, z); nrm.push(0, 0, z < 0 ? -1 : 1); uv.push((x + 1) / 2, y / 2); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    b.add(g, { layer: 'planks', color: [0.92, 0.88, 0.84] });
    return b.build();
  },
  roof: () => roofModel('shingles', 0.08),
  thatch_roof: () => roofModel('thatch', 0.25),
  stairs: () => {
    const b = new GeoBuilder();
    for (let i = 0; i < 8; i++) box(b, 1.8, 0.08, 0.3, 0, (WALL_H / 8) * (i + 1) - 0.04, 1 - (2 / 8) * (i + 0.5), 'planks', [1, 1, 1], 0, [0.9, 0.2]);
    for (const s of [-0.92, 0.92]) {
      const st = new THREE.BoxGeometry(0.1, 0.3, Math.hypot(2, WALL_H)); st.rotateX(Math.atan2(WALL_H, 2)); st.translate(s, WALL_H / 2 - 0.05, 0);
      b.add(st, { layer: 'planks', color: DARK_WOOD });
    }
    return b.build();
  },
  pillar: () => { const b = new GeoBuilder(); log(b, 0, 0, 0, WALL_H, 0.17); return b.build(); },
  fence: () => {
    const b = new GeoBuilder();
    for (const x of [-0.95, 0, 0.95]) log(b, x, 0, 0, 1.05, 0.06);
    for (const y of [0.45, 0.85]) { const r = new THREE.CylinderGeometry(0.04, 0.04, 2, 5); r.rotateZ(Math.PI / 2); r.translate(0, y, 0); b.add(r, { layer: 'bark_oak' }); }
    return b.build();
  },
  bed: () => {
    const b = new GeoBuilder();
    box(b, 1.1, 0.3, 2.1, 0, 0.2, 0, 'planks', DARK_WOOD);
    box(b, 1.1, 0.7, 0.1, 0, 0.35, 1.02, 'planks', DARK_WOOD);
    box(b, 1.0, 0.16, 1.95, 0, 0.42, 0, 'fabric', [0.85, 0.8, 0.7]);
    box(b, 1.02, 0.08, 1.3, 0, 0.53, -0.32, 'fabric', [0.55, 0.12, 0.12]);
    box(b, 0.7, 0.1, 0.35, 0, 0.55, 0.72, 'fabric', [0.92, 0.9, 0.85]);
    return b.build();
  },
  chest: () => {
    const b = new GeoBuilder();
    box(b, 0.9, 0.42, 0.6, 0, 0.21, 0, 'planks', DARK_WOOD);
    const lid = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10, 1, false, 0, Math.PI); lid.rotateZ(Math.PI / 2); lid.rotateX(Math.PI / 2); lid.scale(1, 0.55, 1); lid.translate(0, 0.42, 0);
    b.add(lid, { layer: 'planks', color: DARK_WOOD });
    for (const x of [-0.32, 0.32]) box(b, 0.06, 0.45, 0.62, x, 0.23, 0, 'white', [0.12, 0.12, 0.13]);
    box(b, 0.1, 0.12, 0.04, 0, 0.38, -0.31, 'white', [0.75, 0.6, 0.25]);
    return b.build();
  },
  table: () => {
    const b = new GeoBuilder();
    box(b, 1.6, 0.08, 1.0, 0, 0.78, 0, 'planks', [1, 1, 1], 0, [0.8, 0.5]);
    for (const [x, z] of [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]]) box(b, 0.08, 0.74, 0.08, x, 0.37, z, 'planks', DARK_WOOD);
    const mug = new THREE.CylinderGeometry(0.05, 0.045, 0.12, 8); mug.translate(0.3, 0.88, 0.1); b.add(mug, { layer: 'planks', color: DARK_WOOD });
    return b.build();
  },
  chair: () => {
    const b = new GeoBuilder();
    box(b, 0.5, 0.06, 0.5, 0, 0.46, 0, 'planks');
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) box(b, 0.05, 0.46, 0.05, x, 0.23, z, 'planks', DARK_WOOD);
    box(b, 0.5, 0.5, 0.05, 0, 0.74, 0.22, 'planks', DARK_WOOD);
    return b.build();
  },
  shelf: () => {
    const b = new GeoBuilder();
    for (const x of [-0.68, 0.68]) box(b, 0.05, 1.8, 0.34, x, 0.9, 0, 'planks', DARK_WOOD);
    for (const y of [0.1, 0.65, 1.2, 1.75]) box(b, 1.4, 0.04, 0.34, 0, y, 0, 'planks');
    const rnd = mulberry32(5);
    for (const y of [0.67, 1.22]) for (let i = 0; i < 9; i++) {
      const h = 0.22 + rnd() * 0.12;
      box(b, 0.07, h, 0.22, -0.55 + i * 0.12, y + h / 2 + 0.02, 0, 'fabric', [0.3 + rnd() * 0.5, 0.15 + rnd() * 0.3, 0.1 + rnd() * 0.3]);
    }
    return b.build();
  },
  carpet: () => { const b = new GeoBuilder(); box(b, 1.8, 0.02, 1.2, 0, 0.01, 0, 'fabric', [0.55, 0.12, 0.1], 0, [1, 1]); box(b, 1.5, 0.022, 0.9, 0, 0.012, 0, 'fabric', [0.75, 0.55, 0.2], 0, [1, 1]); return b.build(); },
  banner: () => {
    const b = new GeoBuilder();
    log(b, 0, 0, 0, 2.4, 0.04);
    const bar = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 5); bar.rotateZ(Math.PI / 2); bar.translate(0, 2.3, -0.05); b.add(bar, { layer: 'bark_oak' });
    const cloth = new THREE.PlaneGeometry(0.7, 1.4, 1, 6); cloth.translate(0, 1.55, -0.06);
    b.add(cloth, { layer: 'fabric', color: [0.6, 0.06, 0.08], wind: (p) => (2.3 - p.y) * 0.8 });
    return b.build();
  },
  painting: () => {
    const b = new GeoBuilder();
    box(b, 1.0, 0.75, 0.05, 0, 1.5, 0.02, 'planks', [0.55, 0.45, 0.25]);
    box(b, 0.86, 0.3, 0.02, 0, 1.6, -0.005, 'white', [0.35, 0.45, 0.7]);
    box(b, 0.86, 0.32, 0.02, 0, 1.31, -0.005, 'grass', [0.8, 0.9, 0.7]);
    return b.build();
  },
  weapon_rack: () => {
    const b = new GeoBuilder();
    for (const x of [-0.55, 0.55]) box(b, 0.08, 1.4, 0.08, x, 0.7, 0, 'planks', DARK_WOOD);
    for (const y of [0.3, 1.2]) box(b, 1.2, 0.08, 0.1, 0, y, 0, 'planks');
    for (let i = 0; i < 3; i++) { const s = new THREE.CylinderGeometry(0.025, 0.025, 1.3, 5); s.rotateZ(0.08); s.translate(-0.35 + i * 0.35, 0.75, -0.08); b.add(s, { layer: 'bark_oak' }); }
    return b.build();
  },
  plant_pot: () => {
    const b = new GeoBuilder();
    const pot = new THREE.CylinderGeometry(0.2, 0.15, 0.35, 10); pot.translate(0, 0.175, 0); b.add(pot, { layer: 'clay', color: [1.3, 0.75, 0.55] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, leaf = new THREE.PlaneGeometry(0.16, 0.5);
      leaf.translate(0, 0.25, 0); leaf.rotateX(-0.5); leaf.rotateY(a); leaf.translate(0, 0.32, 0);
      b.add(leaf, { layer: 'fern', tint: 11, wind: () => 0.6 });
    }
    return b.build();
  },
  well: () => {
    const b = new GeoBuilder();
    const ring = new THREE.CylinderGeometry(0.85, 0.9, 0.8, 14, 1, true); ring.translate(0, 0.4, 0); b.add(ring, { layer: 'stone_brick', uvScale: [3, 0.5] });
    const rim = new THREE.TorusGeometry(0.85, 0.08, 6, 16); rim.rotateX(Math.PI / 2); rim.translate(0, 0.8, 0); b.add(rim, { layer: 'cobble' });
    const water = new THREE.CircleGeometry(0.8, 14); water.rotateX(-Math.PI / 2); water.translate(0, 0.3, 0); b.add(water, { layer: 'white', color: [0.04, 0.08, 0.1] });
    for (const s of [-1, 1]) log(b, s * 0.85, 0.8, 0, 1.5, 0.07);
    const roof = new THREE.ConeGeometry(1.3, 0.8, 4); roof.rotateY(Math.PI / 4); roof.translate(0, 2.65, 0); b.add(roof, { layer: 'shingles', uvScale: [2, 1] });
    const axle = new THREE.CylinderGeometry(0.06, 0.06, 1.7, 6); axle.rotateZ(Math.PI / 2); axle.translate(0, 1.9, 0); b.add(axle, { layer: 'bark_oak' });
    const bucket = new THREE.CylinderGeometry(0.12, 0.1, 0.2, 8); bucket.translate(0.2, 1.4, 0); b.add(bucket, { layer: 'planks', color: DARK_WOOD });
    return b.build();
  },
  stall: () => {
    const b = new GeoBuilder();
    box(b, 2.0, 0.9, 0.7, 0, 0.45, 0, 'planks', DARK_WOOD);
    for (const x of [-0.95, 0.95]) for (const z of [-0.35, 0.8]) log(b, x, 0, z, 2.3, 0.05);
    const awning = new THREE.PlaneGeometry(2.3, 1.5, 1, 1); awning.rotateX(-Math.PI / 2 + 0.35); awning.translate(0, 2.3, 0.25);
    b.add(awning, { layer: 'fabric', color: [0.65, 0.15, 0.12], wind: () => 0.2 });
    const rnd = mulberry32(9);
    for (let i = 0; i < 7; i++) box(b, 0.16, 0.12, 0.16, -0.75 + i * 0.25, 0.97, -0.1 + (i % 2) * 0.15, 'fabric', [0.4 + rnd() * 0.5, 0.3 + rnd() * 0.4, 0.15 + rnd() * 0.3]);
    return b.build();
  },
  crops: () => {
    const b = new GeoBuilder();
    box(b, 1.9, 0.12, 1.9, 0, 0.0, 0, 'dirt', [0.75, 0.6, 0.45]);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
      for (let j = 0; j < 2; j++) {
        const st = new THREE.PlaneGeometry(0.06, 0.8); st.translate(0, 0.45, 0); st.rotateY(j * Math.PI / 2 + i); st.translate(-0.7 + i * 0.47, 0.05, -0.7 + k * 0.47);
        b.add(st, { layer: 'white', color: [0.75, 0.68, 0.32], wind: (p) => p.y * 1.5 });
      }
      const head = new THREE.CapsuleGeometry(0.035, 0.14, 2, 5); head.translate(-0.7 + i * 0.47, 0.9, -0.7 + k * 0.47); b.add(head, { layer: 'white', color: [0.85, 0.72, 0.35], wind: () => 1.3 });
    }
    return b.build();
  },
  altar: () => {
    const b = new GeoBuilder();
    box(b, 1.6, 1.0, 0.7, 0, 0.5, 0, 'stone_brick', [0.95, 0.95, 0.98]);
    box(b, 1.75, 0.08, 0.8, 0, 1.04, 0, 'fabric', [0.9, 0.88, 0.8]);
    for (const x of [-0.55, 0.55]) { const c = new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6); c.translate(x, 1.23, 0); b.add(c, { layer: 'white', color: [0.95, 0.93, 0.85] }); flame(b, x, 1.38, 0, 0.35); }
    box(b, 0.05, 0.6, 0.05, 0, 1.38, 0.2, 'white', [0.8, 0.65, 0.3]); box(b, 0.32, 0.05, 0.05, 0, 1.5, 0.2, 'white', [0.8, 0.65, 0.3]);
    return b.build();
  },
  pew: () => { const b = new GeoBuilder(); box(b, 1.6, 0.08, 0.45, 0, 0.45, 0, 'planks', DARK_WOOD); box(b, 1.6, 0.5, 0.06, 0, 0.75, 0.22, 'planks', DARK_WOOD); for (const x of [-0.75, 0.75]) box(b, 0.06, 0.45, 0.42, x, 0.22, 0, 'planks', DARK_WOOD); return b.build(); },
  anvil_piece: () => {
    const b = new GeoBuilder(); const steel: C3 = [0.22, 0.22, 0.24];
    box(b, 0.7, 0.5, 0.5, 0, 0.25, 0, 'bark_oak'); box(b, 0.3, 0.2, 0.22, 0, 0.6, 0, 'white', steel); box(b, 0.7, 0.16, 0.26, 0, 0.78, 0, 'white', steel);
    return b.build();
  },
  forge: () => {
    const b = new GeoBuilder();
    box(b, 1.4, 0.9, 1.0, 0, 0.45, 0, 'stone_brick'); box(b, 1.0, 0.1, 0.7, 0, 0.92, 0, 'lava', [1, 1, 1], 1.6);
    const hood = new THREE.CylinderGeometry(0.25, 0.75, 0.9, 4, 1, true); hood.rotateY(Math.PI / 4); hood.translate(0, 1.9, 0); b.add(hood, { layer: 'stone_brick' });
    box(b, 0.4, 1.2, 0.4, 0, 2.9, 0, 'stone_brick');
    return b.build();
  },
  claim_stone: () => {
    const b = new GeoBuilder();
    const g = new THREE.CylinderGeometry(0.22, 0.32, 1.3, 6); g.translate(0, 0.65, 0); b.add(g, { layer: 'stone_brick', color: [0.8, 0.8, 0.85] });
    box(b, 0.04, 0.5, 0.02, 0, 0.8, -0.27, 'white', [0.5, 0.3, 1.0], 1.2);
    box(b, 0.3, 0.04, 0.02, 0, 0.9, -0.27, 'white', [0.5, 0.3, 1.0], 1.2);
    return b.build();
  },
  fireplace: () => {
    const b = new GeoBuilder();
    box(b, 1.8, 1.0, 0.9, 0, 0.5, 0.0, 'stone_brick');
    box(b, 1.0, 0.7, 0.5, 0, 0.45, -0.25, 'white', [0.03, 0.03, 0.03]);
    box(b, 1.9, 0.15, 1.0, 0, 1.07, 0, 'stone_brick', [0.85, 0.85, 0.85]);
    box(b, 1.0, 1.25, 0.6, 0, 1.8, 0.1, 'stone_brick');
    for (let i = 0; i < 3; i++) { const l = new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6); l.rotateZ(Math.PI / 2); l.rotateY(i * 0.6 - 0.6); l.translate(0, 0.17, -0.28); b.add(l, { layer: 'bark_oak' }); }
    flame(b, -0.12, 0.18, -0.28, 1.4); flame(b, 0.15, 0.18, -0.25, 1.2);
    return b.build();
  },
  wall_torch: () => {
    const b = new GeoBuilder();
    box(b, 0.08, 0.2, 0.05, 0, 1.6, 0.04, 'white', [0.15, 0.15, 0.16]);
    const st = new THREE.CylinderGeometry(0.03, 0.025, 0.45, 6); st.rotateX(-0.35); st.translate(0, 1.75, -0.08); b.add(st, { layer: 'bark_oak' });
    flame(b, 0, 1.96, -0.15, 0.9);
    return b.build();
  },
  lantern: () => {
    const b = new GeoBuilder();
    log(b, 0, 0, 0, 2.0, 0.05);
    box(b, 0.5, 0.05, 0.05, 0.2, 1.98, 0, 'white', [0.15, 0.15, 0.16]);
    box(b, 0.2, 0.28, 0.2, 0.38, 1.78, 0, 'white', [1.0, 0.8, 0.45], 2.5);
    box(b, 0.24, 0.04, 0.24, 0.38, 1.94, 0, 'white', [0.12, 0.12, 0.13]);
    return b.build();
  }
};

function roofModel(layer: string, thick: number): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const rise = 1.6, run = 2, len = Math.hypot(rise, run) + 0.35;
  const g = new THREE.BoxGeometry(2.1, thick, len);
  g.rotateX(-Math.atan2(rise, run)); // rises toward -Z
  g.translate(0, rise / 2 + thick / 2, 0);
  b.add(g, { layer, uvScale: [1, len / 2] });
  const beam = new THREE.CylinderGeometry(0.09, 0.09, 2, 6); beam.rotateZ(Math.PI / 2); beam.translate(0, rise - 0.05, -0.98);
  b.add(beam, { layer: 'bark_oak' });
  return b.build();
}

// ------------------------------------------------------------------ helpers
/** Rotate a local box by a multiple of 90° → world-space AABB. */
function worldBox(bx: Box, p: { x: number; y: number; z: number; rot: number }): [THREE.Vector3, THREE.Vector3] {
  const q = Math.round(p.rot / (Math.PI / 2)) & 3;
  const rx = (x: number, z: number): [number, number] => q === 0 ? [x, z] : q === 1 ? [z, -x] : q === 2 ? [-x, -z] : [-z, x];
  const [ax, az] = rx(bx[0], bx[2]), [bx2, bz2] = rx(bx[3], bx[5]);
  return [V(p.x + Math.min(ax, bx2), p.y + bx[1], p.z + Math.min(az, bz2)), V(p.x + Math.max(ax, bx2), p.y + bx[4], p.z + Math.max(az, bz2))];
}
const DOOR_LEAF: Box = [-0.5, 0, -0.04, 0.5, 2.0, 0.04];

/** World position of a door's hinge for a door piece. */
function hinge(p: Piece): [number, number] {
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  return [p.x + c * -0.5, p.z - s * -0.5];
}

export class Building {
  readonly group = new THREE.Group();
  pieces: Piece[] = [];
  respawn: THREE.Vector3 | null = null;
  private real = new Map<string, PropLayer>();
  private planned = new Map<string, PropLayer>();
  private preview = new Map<string, PropLayer>();
  private dirty = true;
  private frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  private undoStack: { kind: 'add' | 'remove'; pieces: Piece[] }[] = [];

  constructor(shadows: ShadowSystem) {
    const okGhost = new THREE.Vector4(0.3, 1.0, 0.4, 0.45);
    const planGhost = new THREE.Vector4(0.35, 0.6, 1.0, 0.35);
    for (const [id, build] of Object.entries(MODELS)) {
      const geo = build();
      const real = new PropLayer(geo, propMaterial({ alphaTest: true }), propMaterial({ alphaTest: true }, true), 4);
      this.real.set(id, real);
      this.group.add(real.mesh, real.shadowMesh!);
      shadows.add(real.shadowMesh!, real.shadowMaterial!);
      real.shadowMesh!.layers.set(SHADOW_LAYER);
      const plan = new PropLayer(geo, propMaterial({ ghost: planGhost }), null, 4);
      this.planned.set(id, plan); this.group.add(plan.mesh);
      const prev = new PropLayer(geo, propMaterial({ ghost: okGhost.clone() }), null, 4);
      prev.mesh.renderOrder = 20;
      this.preview.set(id, prev); this.group.add(prev.mesh);
    }
  }

  // ---------------------------------------------------------------- rendering
  private push(layers: Map<string, PropLayer>, p: Piece) {
    if (p.id === 'door_wall') {
      const [hx, hz] = hinge(p);
      layers.get('door_leaf')!.push(hx, p.y, hz, p.rot + (p.open ? -Math.PI / 2 : 0), 1, 0.5, 0);
    }
    layers.get(p.id)?.push(p.x, p.y, p.z, p.rot, 1, 0.5, 0);
  }

  private rebuild(player: THREE.Vector3) {
    for (const l of [...this.real.values(), ...this.planned.values()]) l.ensure(this.pieces.length * 2 + 2);
    for (const p of this.pieces) this.push(p.planned ? this.planned : this.real, p);
    for (const l of this.real.values()) l.shadowNear(player, 80);
  }

  /** Show ghost pieces (placement preview). ok=false tints red. */
  setPreview(list: Piece[], ok: boolean) {
    for (const l of this.preview.values()) l.ensure(list.length * 2 + 2);
    for (const p of list) this.push(this.preview, p);
    for (const l of this.preview.values()) {
      const u = (l.material.uniforms.uGhost.value as THREE.Vector4);
      if (ok) u.set(0.3, 1.0, 0.4, 0.45); else u.set(1.0, 0.25, 0.2, 0.5);
    }
  }

  update(player: THREE.Vector3, camera: THREE.PerspectiveCamera) {
    if (this.dirty) { this.dirty = false; this.rebuild(player); }
    camera.updateMatrixWorld();
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    for (const l of [...this.real.values(), ...this.planned.values(), ...this.preview.values()]) l.cull(this.frustum);
  }

  /** Lights from fireplaces, torches and lanterns near a point. */
  lights(p: THREE.Vector3, time: number): { pos: THREE.Vector3; col: THREE.Vector3; r: number; d: number }[] {
    const out: { pos: THREE.Vector3; col: THREE.Vector3; r: number; d: number }[] = [];
    for (const q of this.pieces) {
      const L = PIECES[q.id]?.light;
      if (!L || q.planned) continue;
      const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d > 60 * 60) continue;
      const f = 1 - 0.1 * Math.sin(time * 9 + q.x) - 0.06 * Math.sin(time * 21 + q.z);
      const ly = q.id === 'fireplace' ? 0.4 : q.id === 'lantern' ? 1.75 : 1.95;
      const c = Math.cos(q.rot), s = Math.sin(q.rot);
      const off = q.id === 'lantern' ? 0.38 : 0, fwd = q.id === 'fireplace' ? -0.6 : q.id === 'wall_torch' ? -0.2 : 0;
      out.push({ pos: V(q.x + c * off + s * fwd, q.y + ly, q.z - s * off + c * fwd), col: V(L[0] * f, L[1] * f, L[2] * f), r: L[3], d });
    }
    return out;
  }

  // ---------------------------------------------------------------- queries
  boxes(p: Piece): AABB[] {
    const def = PIECES[p.id];
    if (!def || p.planned) return [];
    const out = def.boxes.map((b) => { const [min, max] = worldBox(b, p); return { min, max, piece: p }; });
    if (p.id === 'door_wall' && !p.open) { const [min, max] = worldBox(DOOR_LEAF, p); out.push({ min, max, piece: p }); }
    return out;
  }

  boxesNear(pos: THREE.Vector3, r: number, out: AABB[] = []): AABB[] {
    out.length = 0;
    for (const p of this.pieces) {
      if (Math.abs(p.x - pos.x) > r + 2 || Math.abs(p.z - pos.z) > r + 2 || Math.abs(p.y - pos.y) > r + 4) continue;
      for (const b of this.boxes(p)) out.push(b);
    }
    return out;
  }

  /** Nearest piece hit by a ray (box test). */
  raycast(o: THREE.Vector3, d: THREE.Vector3, max: number): { piece: Piece; point: THREE.Vector3; normal: THREE.Vector3; dist: number } | null {
    let best: { piece: Piece; point: THREE.Vector3; normal: THREE.Vector3; dist: number } | null = null;
    const ray = new THREE.Ray(o, d), tmp = new THREE.Vector3(), b3 = new THREE.Box3();
    for (const p of this.pieces) {
      if (p.planned || (p.x - o.x) ** 2 + (p.z - o.z) ** 2 > (max + 3) ** 2) continue;
      const def = PIECES[p.id];
      const list = def.boxes.length ? this.boxes(p) : [{ ...(() => { const [min, max2] = worldBox([-0.3, 0, -0.3, 0.3, 0.3, 0.3], p); return { min, max: max2 }; })(), piece: p }];
      for (const bx of list) {
        b3.set(bx.min, bx.max);
        const hit = ray.intersectBox(b3, tmp);
        if (!hit) continue;
        const dist = hit.distanceTo(o);
        if (dist > max || (best && dist >= best.dist)) continue;
        // face normal from which side we hit
        const n = V();
        const e = 1e-3;
        if (Math.abs(hit.x - bx.min.x) < e) n.set(-1, 0, 0); else if (Math.abs(hit.x - bx.max.x) < e) n.set(1, 0, 0);
        else if (Math.abs(hit.y - bx.min.y) < e) n.set(0, -1, 0); else if (Math.abs(hit.y - bx.max.y) < e) n.set(0, 1, 0);
        else if (Math.abs(hit.z - bx.min.z) < e) n.set(0, 0, -1); else n.set(0, 0, 1);
        best = { piece: p, point: hit.clone(), normal: n, dist };
      }
    }
    return best;
  }

  /** Top of supporting pieces under (x,z) near height y, or null. */
  private supportTop(x: number, z: number, y: number, range = 0.9): number | null {
    let best: number | null = null;
    for (const p of this.pieces) {
      if (p.planned || Math.abs(p.x - x) > 2.2 || Math.abs(p.z - z) > 2.2) continue;
      for (const b of this.boxes(p)) {
        if (x < b.min.x - 0.05 || x > b.max.x + 0.05 || z < b.min.z - 0.05 || z > b.max.z + 0.05) continue;
        const top = b.max.y;
        if (Math.abs(top - y) < range && (best === null || Math.abs(top - y) < Math.abs(best - y))) best = top;
      }
    }
    return best;
  }

  /** Snap a piece type to the grid around an aimed point. */
  snap(id: string, point: THREE.Vector3, normal: THREE.Vector3, onPiece: boolean, rot: number): Piece {
    const def = PIECES[id];
    let x = point.x, z = point.z, y = point.y;
    const along = Math.abs(Math.sin(rot)) < 0.5; // wall runs along X
    if (def.snap === 'cell') { x = Math.floor(x / GRID) * GRID + GRID / 2; z = Math.floor(z / GRID) * GRID + GRID / 2; }
    else if (def.snap === 'corner') { x = Math.round(x / GRID) * GRID; z = Math.round(z / GRID) * GRID; }
    else if (def.snap === 'edge') {
      if (along) { z = Math.round(z / GRID) * GRID; x = Math.floor(x / GRID) * GRID + GRID / 2; }
      else { x = Math.round(x / GRID) * GRID; z = Math.floor(z / GRID) * GRID + GRID / 2; }
    } else {
      x = Math.round(x * 4) / 4; z = Math.round(z * 4) / 4;
      if (Math.abs(normal.y) < 0.5 && (id === 'painting' || id === 'wall_torch')) {
        // hang on a wall, facing out
        const r = Math.atan2(-normal.x, -normal.z);
        return { id, x: point.x + normal.x * 0.02, y: point.y - (id === 'painting' ? 1.5 : 1.75), z: point.z + normal.z * 0.02, rot: Math.round(r / (Math.PI / 2)) * (Math.PI / 2) };
      }
    }
    // height: stand on supporting pieces if close, otherwise on the ground hit
    const sup = this.supportTop(x, z, y, onPiece ? 0.6 : 0.9);
    if (sup !== null) y = sup;
    else y = def.snap === 'free' ? y : Math.ceil((y - 0.15) * 4) / 4 + (def.top === 0 ? 0.1 : 0);
    return { id, x, y, z, rot };
  }

  /** Would this piece overlap an existing one? */
  blocked(p: Piece): boolean {
    const mine = this.boxesFor(p);
    for (const q of this.pieces) {
      if (q.planned || Math.abs(q.x - p.x) > 4 || Math.abs(q.z - p.z) > 4 || Math.abs(q.y - p.y) > 4) continue;
      if (q.id === p.id && Math.abs(q.x - p.x) < 0.05 && Math.abs(q.z - p.z) < 0.05 && Math.abs(q.y - p.y) < 0.05 && Math.abs(Math.sin(q.rot - p.rot)) < 0.1) return true;
      for (const a of mine) for (const b of this.boxes(q)) {
        const s = 0.06;
        if (a.min.x + s < b.max.x && a.max.x - s > b.min.x && a.min.y + s < b.max.y && a.max.y - s > b.min.y && a.min.z + s < b.max.z && a.max.z - s > b.min.z) return true;
      }
    }
    return false;
  }
  private boxesFor(p: Piece): AABB[] { return this.boxes({ ...p, planned: false }); }

  // ---------------------------------------------------------------- edits
  add(list: Piece[], undoable = true) {
    for (const p of list) {
      if (PIECES[p.id]?.use === 'chest' && !p.items) p.items = Array(16).fill(null);
      this.pieces.push(p);
    }
    if (undoable) { this.undoStack.push({ kind: 'add', pieces: list }); if (this.undoStack.length > 20) this.undoStack.shift(); }
    this.dirty = true;
  }
  remove(list: Piece[], undoable = true) {
    this.pieces = this.pieces.filter((p) => !list.includes(p));
    if (undoable) { this.undoStack.push({ kind: 'remove', pieces: list }); if (this.undoStack.length > 20) this.undoStack.shift(); }
    this.dirty = true;
  }
  /** Undo the last action; returns it so the caller can refund / charge materials. */
  undo(): { kind: 'add' | 'remove'; pieces: Piece[] } | null {
    const a = this.undoStack.pop();
    if (!a) return null;
    if (a.kind === 'add') this.remove(a.pieces, false); else this.add(a.pieces, false);
    return a;
  }
  /** Mark a planned piece as built. */
  complete(p: Piece) { p.planned = false; if (PIECES[p.id]?.use === 'chest' && !p.items) p.items = Array(16).fill(null); this.dirty = true; }
  toggleDoor(p: Piece) { p.open = !p.open; this.dirty = true; }

  blueprint(bp: Blueprint, anchor: THREE.Vector3, rot: number): Piece[] {
    const q = Math.round(rot / (Math.PI / 2)) & 3;
    const ax = Math.floor(anchor.x / GRID) * GRID, az = Math.floor(anchor.z / GRID) * GRID;
    const y0 = Math.ceil((anchor.y - 0.15) * 4) / 4 + 0.1;
    return bp.pieces.map((p) => {
      const [x, z] = q === 0 ? [p.x, p.z] : q === 1 ? [p.z, -p.x] : q === 2 ? [-p.x, -p.z] : [-p.z, p.x];
      return { id: p.id, x: ax + x, y: y0 + p.y, z: az + z, rot: p.rot + q * (Math.PI / 2), planned: true };
    });
  }

  /** Interactive piece in front of the player. */
  usable(pos: THREE.Vector3, yaw: number): Piece | null {
    const fx = pos.x - Math.sin(yaw) * 0.9, fz = pos.z - Math.cos(yaw) * 0.9;
    let best: Piece | null = null, bd = 2.2 * 2.2;
    for (const p of this.pieces) {
      if (p.planned || !PIECES[p.id]?.use || Math.abs(p.y - pos.y) > 2) continue;
      const d = (p.x - fx) ** 2 + (p.z - fz) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** Inside a claimed plot that is lit (monsters will not spawn there). */
  isSafe(pos: THREE.Vector3): boolean {
    for (const c of this.pieces) {
      if (c.id !== 'claim_stone' || c.planned) continue;
      if ((c.x - pos.x) ** 2 + (c.z - pos.z) ** 2 > CLAIM_RADIUS ** 2) continue;
      if (this.pieces.some((l) => PIECES[l.id]?.light && !l.planned && (l.x - c.x) ** 2 + (l.z - c.z) ** 2 < CLAIM_RADIUS ** 2)) return true;
    }
    return false;
  }
  claims(): Piece[] { return this.pieces.filter((p) => p.id === 'claim_stone' && !p.planned); }

  serialize(): BuildSave {
    return { pieces: this.pieces.filter((p) => !p.gen).map((p) => ({ ...p })), respawn: this.respawn ? [this.respawn.x, this.respawn.y, this.respawn.z] : null };
  }
  load(d: BuildSave | undefined) {
    if (!d) return;
    this.pieces = d.pieces.filter((p) => PIECES[p.id]);
    this.respawn = d.respawn ? V(...d.respawn) : null;
    this.dirty = true;
  }
  markDirty() { this.dirty = true; }

  /** Show / hide the generated pieces of a village (kept out of saves). */
  private genSets = new Map<string, Piece[]>();
  setGenerated(id: string, list: Piece[] | null) {
    const old = this.genSets.get(id);
    if (old) this.pieces = this.pieces.filter((p) => !old.includes(p));
    if (list) { this.genSets.set(id, list); this.pieces.push(...list); } else this.genSets.delete(id);
    this.dirty = true;
  }
  hasGenerated(id: string) { return this.genSets.has(id); }
}

export type { PieceDef };
