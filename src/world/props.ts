// Placed crafting stations (workbench, campfire, furnace, anvil) and the dynamic
// point lights of fires and held torches. Building (M6) extends this.
import * as THREE from 'three';
import { GeoBuilder, PropLayer } from './vegetation';
import { propMaterial, U } from './shaders';
import { SHADOW_LAYER, type ShadowSystem } from '../engine/shadows';
import type { Station } from '../data/items';

export interface PlacedProp { type: string; x: number; y: number; z: number; rot: number; }
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const M = () => new THREE.Matrix4();

function box(b: GeoBuilder, w: number, h: number, d: number, x: number, y: number, z: number, layer: string, color: [number, number, number] = [1, 1, 1], glow = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  b.add(g, { layer, color, glow, uvScale: [Math.max(w, d), h] });
}

const MODELS: Record<string, () => THREE.BufferGeometry> = {
  workbench: () => {
    const b = new GeoBuilder();
    box(b, 1.5, 0.12, 0.8, 0, 0.86, 0, 'planks');
    for (const [x, z] of [[-0.65, -0.32], [0.65, -0.32], [-0.65, 0.32], [0.65, 0.32]]) box(b, 0.1, 0.82, 0.1, x, 0.41, z, 'planks', [0.8, 0.75, 0.7]);
    box(b, 1.3, 0.06, 0.6, 0, 0.3, 0, 'planks', [0.75, 0.7, 0.65]);
    box(b, 0.25, 0.16, 0.18, 0.5, 1.0, -0.2, 'white', [0.25, 0.25, 0.27]); // vise
    const saw = new THREE.BoxGeometry(0.5, 0.005, 0.14); saw.rotateY(0.4); saw.translate(-0.3, 0.93, 0.1);
    b.add(saw, { layer: 'white', color: [0.6, 0.6, 0.62] });
    return b.build();
  },
  campfire: () => {
    const b = new GeoBuilder();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const g = new THREE.IcosahedronGeometry(0.16, 1); g.scale(1.2, 0.8, 1);
      g.translate(Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55);
      b.add(g, { layer: 'stone', uvScale: [0.6, 0.6], ao: () => 0.7 });
    }
    for (let i = 0; i < 4; i++) {
      const g = new THREE.CylinderGeometry(0.06, 0.07, 0.9, 6); g.rotateZ(1.25);
      b.add(g, { layer: 'bark_oak', uvScale: [1, 0.5] }, M().compose(V(0, 0.2, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (i / 4) * Math.PI, 0)), V(1, 1, 1)));
    }
    const embers = new THREE.CircleGeometry(0.32, 10); embers.rotateX(-Math.PI / 2); embers.translate(0, 0.06, 0);
    b.add(embers, { layer: 'lava', glow: 1.6 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const f = new THREE.ConeGeometry(0.12 + (i % 2) * 0.05, 0.55 + (i % 3) * 0.15, 6, 1, true);
      f.translate(Math.cos(a) * 0.1, 0.38, Math.sin(a) * 0.1);
      b.add(f, { layer: 'white', color: [1.0, 0.55, 0.15], glow: 3, wind: (p) => p.y * 6 });
    }
    const core = new THREE.ConeGeometry(0.1, 0.8, 6, 1, true); core.translate(0, 0.45, 0);
    b.add(core, { layer: 'white', color: [1.0, 0.85, 0.4], glow: 4, wind: (p) => p.y * 6 });
    return b.build();
  },
  furnace: () => {
    const b = new GeoBuilder();
    box(b, 1.2, 1.3, 1.1, 0, 0.65, 0, 'cobble');
    box(b, 0.5, 0.4, 0.05, 0, 0.45, -0.56, 'lava', [1, 1, 1], 1.4);
    box(b, 0.7, 0.08, 0.14, 0, 0.7, -0.58, 'cobble', [0.8, 0.8, 0.8]);
    box(b, 0.38, 0.8, 0.38, 0.25, 1.65, 0.2, 'cobble', [0.85, 0.85, 0.85]);
    return b.build();
  },
  anvil: () => {
    const b = new GeoBuilder();
    const steel: [number, number, number] = [0.22, 0.22, 0.24];
    box(b, 0.7, 0.5, 0.5, 0, 0.25, 0, 'bark_oak');
    box(b, 0.3, 0.2, 0.22, 0, 0.6, 0, 'white', steel);
    box(b, 0.7, 0.16, 0.26, 0, 0.78, 0, 'white', steel);
    const horn = new THREE.ConeGeometry(0.11, 0.38, 8); horn.rotateZ(Math.PI / 2); horn.translate(0.53, 0.8, 0);
    b.add(horn, { layer: 'white', color: steel });
    return b.build();
  }
};

/** Light each prop type emits: colour (HDR), radius, flicker. */
const LIGHTS: Record<string, [number, number, number, number, number]> = {
  campfire: [3.2, 1.6, 0.6, 11, 1], furnace: [2.4, 1.0, 0.35, 7, 0.4]
};
export const STATION_OF: Record<string, Station> = { workbench: 'workbench', campfire: 'campfire', furnace: 'furnace', anvil: 'anvil' };

export class Props {
  readonly group = new THREE.Group();
  list: PlacedProp[] = [];
  private layers = new Map<string, PropLayer>();
  private dirty = true;
  private frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  /** extra lights from the player (held torch) */
  heldLight: { pos: THREE.Vector3; col: THREE.Vector3; r: number } | null = null;

  constructor(shadows: ShadowSystem) {
    for (const [type, build] of Object.entries(MODELS)) {
      const layer = new PropLayer(build(), propMaterial({}), propMaterial({}, true), 2);
      this.layers.set(type, layer);
      this.group.add(layer.mesh, layer.shadowMesh!);
      shadows.add(layer.shadowMesh!, layer.shadowMaterial!);
      layer.shadowMesh!.layers.set(SHADOW_LAYER);
    }
  }

  add(p: PlacedProp) { this.list.push(p); this.dirty = true; }
  load(list: PlacedProp[]) { this.list = list.filter((p) => MODELS[p.type]); this.dirty = true; }

  /** Stations within reach of a point. */
  stationsNear(p: THREE.Vector3, r = 4): Set<Station> {
    const out = new Set<Station>();
    for (const q of this.list) if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 + (q.y - p.y) ** 2 < r * r && STATION_OF[q.type]) out.add(STATION_OF[q.type]);
    return out;
  }
  nearest(p: THREE.Vector3, r = 2.5): PlacedProp | null {
    let best: PlacedProp | null = null, bd = r * r;
    for (const q of this.list) { const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2 + (q.y - p.y) ** 2; if (d < bd) { bd = d; best = q; } }
    return best;
  }
  /** Simple collision: props are cylinders of radius ~0.6. */
  collide(pos: THREE.Vector3) {
    for (const q of this.list) {
      if (pos.y > q.y + 1.4 || pos.y + 1.8 < q.y) continue;
      const dx = pos.x - q.x, dz = pos.z - q.z, d = Math.hypot(dx, dz), min = q.type === 'campfire' ? 0.75 : 0.95;
      if (d < min && d > 1e-4) { pos.x = q.x + (dx / d) * min; pos.z = q.z + (dz / d) * min; }
    }
  }

  update(time: number, player: THREE.Vector3, camera: THREE.PerspectiveCamera) {
    if (this.dirty) {
      this.dirty = false;
      for (const [type, layer] of this.layers) {
        const items = this.list.filter((p) => p.type === type);
        layer.ensure(items.length + 1);
        for (const p of items) layer.push(p.x, p.y, p.z, p.rot, 1, 0.5, 0);
        layer.shadowNear(player, 1e6);
      }
    }
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    for (const layer of this.layers.values()) layer.cull(this.frustum);

    // lights: held torch first, then the nearest fires
    const lights: { pos: THREE.Vector3; col: THREE.Vector3; r: number; d: number }[] = [];
    if (this.heldLight) lights.push({ ...this.heldLight, d: -1 });
    for (const p of this.list) {
      const L = LIGHTS[p.type];
      if (!L) continue;
      const flick = 1 - L[4] * (0.12 * Math.sin(time * 9 + p.x) + 0.08 * Math.sin(time * 23 + p.z));
      lights.push({ pos: V(p.x, p.y + 0.6, p.z), col: V(L[0] * flick, L[1] * flick, L[2] * flick), r: L[3], d: (p.x - player.x) ** 2 + (p.z - player.z) ** 2 });
    }
    lights.sort((a, b) => a.d - b.d);
    const n = Math.min(8, lights.length);
    for (let i = 0; i < n; i++) {
      U.uPointPos.value[i].set(lights[i].pos.x, lights[i].pos.y, lights[i].pos.z, lights[i].r);
      U.uPointCol.value[i].copy(lights[i].col);
    }
    U.uPointCount.value = n;
  }
}
