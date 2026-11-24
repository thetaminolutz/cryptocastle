// Chunk streaming: requests chunks around the player from a worker pool, uploads
// finished meshes a few per frame, unloads far chunks and keeps a small LRU cache.
// Also answers world queries on the main thread: smooth density (for collision and
// camera), materials (water checks) and nearby trees.
import * as THREE from 'three';
import { CHUNK_HEIGHT, CHUNK_SIZE, chunkKey, vIndex } from './constants';
import type { WorkerRequest, WorkerResult } from './chunk-worker';
import type { TerrainMesh, LiquidMesh } from './smooth-mesher';
import { decodeDensity, TREE_STRIDE, PLANT_STRIDE, WATER_SURFACE_OFFSET, PAD, PAD_VOLUME, pIdx, SOLID_MIN } from './terrain';
import { Vegetation } from './vegetation';
import { Tree } from './biomes';
import { B } from './blocks';
import type { ShadowSystem } from '../engine/shadows';

/** Trunk collision radius / height per tree kind (before instance scale). */
const TRUNK: Record<number, { r: number; h: number }> = {
  [Tree.Oak]: { r: 0.4, h: 4.5 }, [Tree.DarkOak]: { r: 0.5, h: 5.5 }, [Tree.Birch]: { r: 0.22, h: 7 },
  [Tree.Pine]: { r: 0.32, h: 10 }, [Tree.SnowPine]: { r: 0.32, h: 10 }, [Tree.Dead]: { r: 0.35, h: 6 },
  [Tree.GiantMushroom]: { r: 0.72, h: 6 }, [Tree.Palm]: { r: 0.28, h: 7 }, [Tree.CrystalTree]: { r: 0.6, h: 3 },
  [Tree.Cactus]: { r: 0.4, h: 3.4 }, [Tree.Willow]: { r: 0.5, h: 4 }
};
import ChunkWorker from './chunk-worker?worker';

export interface Chunk {
  cx: number; cz: number;
  density: Uint8Array;
  material: Uint8Array;
  trees: Float32Array;
  plants: Float32Array;
  terrain: THREE.Mesh | null;
  liquid: THREE.Mesh | null;
}

export interface TreeHit { x: number; z: number; r: number; y0: number; y1: number; key: string; index: number; kind: number; }

/** Saved world changes: only edited grid points (density/material) and removed vegetation. */
export interface WorldDelta { edits: [string, number[]][]; trees: [string, number[]][]; plants: [string, number[]][]; }

const LRU_MAX = 48;

export class World {
  readonly group = new THREE.Group();
  readonly chunks = new Map<string, Chunk>();
  readonly vegetation: Vegetation;
  private cache = new Map<string, Chunk>();
  private pending = new Map<string, number>();
  private ready: WorkerResult[] = [];
  private workers: Worker[] = [];
  private busy: number[] = [];
  private jobSeq = 1;
  private lastCenter = '';
  private wanted: [number, number][] = [];
  private lastChunk: Chunk | null = null;
  viewDistance: number;
  stats = { genMs: 0, loaded: 0 };

  constructor(readonly seed: number, viewDistance: number, private matTerrain: THREE.Material, private matLiquid: THREE.Material, private shadows: ShadowSystem) {
    this.viewDistance = viewDistance;
    this.vegetation = new Vegetation(shadows);
    this.group.add(this.vegetation.group);
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) {
      const w = new ChunkWorker();
      w.onmessage = (e: MessageEvent<WorkerResult>) => { this.busy[i]--; this.ready.push(e.data); };
      w.postMessage({ type: 'init', seed } satisfies WorkerRequest);
      this.workers.push(w);
      this.busy.push(0);
    }
  }

  setViewDistance(d: number) { this.viewDistance = d; this.lastCenter = ''; }

  update(dt: number, pos: THREE.Vector3, forward: THREE.Vector3, camera?: THREE.PerspectiveCamera) {
    const pcx = Math.floor(pos.x / CHUNK_SIZE), pcz = Math.floor(pos.z / CHUNK_SIZE);
    const center = `${pcx},${pcz},${this.viewDistance}`;
    if (center !== this.lastCenter) {
      this.lastCenter = center;
      this.recomputeWanted(pcx, pcz, forward);
      this.unloadFar(pcx, pcz);
    }
    this.dispatch();
    this.applyReady(3);
    this.vegetation.update(dt, pos, camera);
  }

  private recomputeWanted(pcx: number, pcz: number, fwd: THREE.Vector3) {
    const r = this.viewDistance;
    const list: { cx: number; cz: number; score: number }[] = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > (r + 0.5) * (r + 0.5)) continue;
      const cx = pcx + dx, cz = pcz + dz;
      const key = chunkKey(cx, cz);
      if (this.chunks.has(key) || this.pending.has(key)) continue;
      const len = Math.sqrt(d2) || 1;
      const facing = (dx * fwd.x + dz * fwd.z) / len;
      list.push({ cx, cz, score: d2 - facing * 4 * len });
    }
    list.sort((a, b) => a.score - b.score);
    this.wanted = list.map((c) => [c.cx, c.cz]);
  }

  private dispatch() {
    while (this.wanted.length) {
      let wi = -1, best = 2;
      for (let i = 0; i < this.workers.length; i++) if (this.busy[i] < best) { best = this.busy[i]; wi = i; }
      if (wi < 0) return;
      const [cx, cz] = this.wanted.shift()!;
      const key = chunkKey(cx, cz);
      if (this.chunks.has(key) || this.pending.has(key)) continue;
      const cached = this.cache.get(key);
      if (cached) { // re-show a recently unloaded chunk without regenerating
        this.cache.delete(key);
        this.chunks.set(key, cached);
        for (const m of [cached.terrain, cached.liquid]) if (m) this.group.add(m);
        if (cached.terrain) this.shadows.add(cached.terrain);
        this.syncVegetation(key, cached);
        continue;
      }
      const job = this.jobSeq++;
      this.pending.set(key, job);
      this.busy[wi]++;
      const edits = this.editsFor(cx, cz);
      this.workers[wi].postMessage({ type: 'build', job, cx, cz, edits } satisfies WorkerRequest, edits ? [edits.buffer] : []);
    }
  }

  private applyReady(max: number) {
    let n = 0;
    while (this.ready.length && n < max) {
      const r = this.ready.shift()!;
      const key = chunkKey(r.cx, r.cz);
      if (r.remesh) { this.applyRemesh(key, r); continue; }
      if (this.pending.get(key) !== r.job) continue;
      this.pending.delete(key);
      this.stats.genMs = this.stats.genMs * 0.9 + r.ms * 0.1;
      const chunk: Chunk = {
        cx: r.cx, cz: r.cz, density: r.density, material: r.material, trees: r.trees, plants: r.plants,
        terrain: this.makeTerrain(r.terrain, r.cx, r.cz),
        liquid: this.makeLiquid(r.liquid, r.cx, r.cz)
      };
      this.chunks.set(key, chunk);
      if (chunk.terrain) this.shadows.add(chunk.terrain);
      this.syncVegetation(key, chunk);
      if (this.dirtyAfterLoad.delete(key)) this.remesh(key);
      n++;
    }
    this.stats.loaded = this.chunks.size;
  }

  private place(g: THREE.BufferGeometry, mat: THREE.Material, cx: number, cz: number, order: number) {
    g.computeBoundingBox();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.renderOrder = order;
    this.group.add(mesh);
    return mesh;
  }

  private makeTerrain(m: TerrainMesh, cx: number, cz: number): THREE.Mesh | null {
    if (m.positions.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('aNormal', new THREE.BufferAttribute(m.normals, 3, true));
    g.setAttribute('aMats', new THREE.BufferAttribute(m.mats, 3));
    g.setAttribute('aLight', new THREE.BufferAttribute(m.light, 3));
    return this.place(g, this.matTerrain, cx, cz, 0);
  }

  private makeLiquid(m: LiquidMesh, cx: number, cz: number): THREE.Mesh | null {
    if (m.indices.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('aData', new THREE.BufferAttribute(m.data, 4));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    return this.place(g, this.matLiquid, cx, cz, 1);
  }

  private unloadFar(pcx: number, pcz: number) {
    const r = this.viewDistance + 1.5;
    for (const [key, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz <= r * r) continue;
      for (const m of [c.terrain, c.liquid]) if (m) this.group.remove(m);
      if (c.terrain) this.shadows.remove(c.terrain);
      this.chunks.delete(key);
      this.vegetation.removeChunk(key);
      if (this.lastChunk === c) this.lastChunk = null;
      this.cache.set(key, c);
      if (this.cache.size > LRU_MAX) {
        const oldKey = this.cache.keys().next().value!;
        const old = this.cache.get(oldKey)!;
        for (const m of [old.terrain, old.liquid]) m?.geometry.dispose();
        this.cache.delete(oldKey);
      }
    }
    for (const [key] of this.pending) {
      const [cx, cz] = key.split(',').map(Number);
      const dx = cx - pcx, dz = cz - pcz;
      if (dx * dx + dz * dz > r * r) this.pending.delete(key);
    }
  }

  private chunkAt(x: number, z: number): Chunk | null {
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const lc = this.lastChunk;
    if (lc && lc.cx === cx && lc.cz === cz) return lc;
    const c = this.chunks.get(chunkKey(cx, cz)) ?? null;
    if (c) this.lastChunk = c;
    return c;
  }

  isLoaded(x: number, z: number) { return this.chunkAt(Math.floor(x), Math.floor(z)) !== null; }
  get pad() { return PAD; }

  /** Density at an integer grid point in metres (+ = inside ground). Unloaded = solid. */
  gridDensity(x: number, y: number, z: number): number {
    if (y < 0) return 5;
    if (y >= CHUNK_HEIGHT) return -5;
    const c = this.chunkAt(x, z);
    if (!c) return 5;
    return decodeDensity(c.density[vIndex(x - c.cx * CHUNK_SIZE, y, z - c.cz * CHUNK_SIZE)]);
  }

  /** Smooth (trilinear) density at any point. */
  density(x: number, y: number, z: number): number {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const fx = x - x0, fy = y - y0, fz = z - z0;
    const d = (dx: number, dy: number, dz: number) => this.gridDensity(x0 + dx, y0 + dy, z0 + dz);
    const c00 = d(0, 0, 0) * (1 - fx) + d(1, 0, 0) * fx;
    const c10 = d(0, 1, 0) * (1 - fx) + d(1, 1, 0) * fx;
    const c01 = d(0, 0, 1) * (1 - fx) + d(1, 0, 1) * fx;
    const c11 = d(0, 1, 1) * (1 - fx) + d(1, 1, 1) * fx;
    return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
  }

  /** Approximate signed distance (metres, + inside) and outward normal at p. */
  sdf(p: THREE.Vector3, outNormal: THREE.Vector3): number {
    const e = 0.35;
    const d = this.density(p.x, p.y, p.z);
    const gx = this.density(p.x + e, p.y, p.z) - this.density(p.x - e, p.y, p.z);
    const gy = this.density(p.x, p.y + e, p.z) - this.density(p.x, p.y - e, p.z);
    const gz = this.density(p.x, p.y, p.z + e) - this.density(p.x, p.y, p.z - e);
    const len = Math.hypot(gx, gy, gz);
    if (len < 1e-5) { outNormal.set(0, 1, 0); return d; }
    outNormal.set(-gx / len, -gy / len, -gz / len);
    return d / (len / (2 * e));
  }

  material(x: number, y: number, z: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return 0;
    const c = this.chunkAt(x, z);
    if (!c) return 0;
    return c.material[vIndex(x - c.cx * CHUNK_SIZE, y, z - c.cz * CHUNK_SIZE)];
  }

  /** Height of the water surface in the column nearest (x,z) at/below y, or -Infinity. */
  waterSurface(x: number, y: number, z: number): number {
    const gx = Math.round(x), gz = Math.round(z);
    for (let gy = Math.min(CHUNK_HEIGHT - 2, Math.round(y) + 1); gy >= Math.round(y) - 3 && gy > 0; gy--) {
      const m = this.material(gx, gy, gz);
      if (m === B.WATER) {
        let top = gy;
        while (this.material(gx, top + 1, gz) === B.WATER) top++;
        return top + WATER_SURFACE_OFFSET;
      }
    }
    return -Infinity;
  }

  /** Ground height at (x,z): highest surface crossing below `fromY`. */
  groundY(x: number, z: number, fromY = CHUNK_HEIGHT - 1): number {
    let prev = this.density(x, fromY, z);
    for (let y = fromY - 0.5; y > 0; y -= 0.5) {
      const d = this.density(x, y, z);
      if (d > 0 && prev <= 0) return y + 0.5 * (d / (d - prev));
      prev = d;
    }
    return 0;
  }

  // ------------------------------------------------------------------ editing
  private deltas = new Map<string, Map<number, number>>();     // chunk → vIndex → density<<8 | material
  private removedTrees = new Map<string, Set<number>>();
  private removedPlants = new Map<string, Set<number>>();
  private remeshJobs = new Map<string, number>();
  private dirtyAfterLoad = new Set<string>();

  private syncVegetation(key: string, c: Chunk) {
    const rt = this.removedTrees.get(key), rp = this.removedPlants.get(key);
    const filter = (a: Float32Array, stride: number, rm?: Set<number>) => {
      if (!rm || !rm.size) return a;
      const out: number[] = [];
      for (let i = 0, k = 0; i < a.length; i += stride, k++) if (!rm.has(k)) for (let j = 0; j < stride; j++) out.push(a[i + j]);
      return new Float32Array(out);
    };
    this.vegetation.setChunk(key, filter(c.trees, TREE_STRIDE, rt), filter(c.plants, PLANT_STRIDE, rp));
  }

  isTreeRemoved(key: string, i: number) { return !!this.removedTrees.get(key)?.has(i); }
  isPlantRemoved(key: string, i: number) { return !!this.removedPlants.get(key)?.has(i); }

  removeTree(key: string, index: number) {
    let s = this.removedTrees.get(key); if (!s) { s = new Set(); this.removedTrees.set(key, s); }
    s.add(index);
    const c = this.chunks.get(key); if (c) this.syncVegetation(key, c);
  }
  removePlant(key: string, index: number) {
    let s = this.removedPlants.get(key); if (!s) { s = new Set(); this.removedPlants.set(key, s); }
    s.add(index);
    const c = this.chunks.get(key); if (c) this.syncVegetation(key, c);
  }

  /** Plants near a point: [key, index, x, y, z, kind]. */
  plantsNear(x: number, y: number, z: number, r: number): { key: string; index: number; x: number; y: number; z: number; kind: number }[] {
    const out: { key: string; index: number; x: number; y: number; z: number; kind: number }[] = [];
    for (let cz = Math.floor((z - r) / CHUNK_SIZE); cz <= Math.floor((z + r) / CHUNK_SIZE); cz++)
      for (let cx = Math.floor((x - r) / CHUNK_SIZE); cx <= Math.floor((x + r) / CHUNK_SIZE); cx++) {
        const key = chunkKey(cx, cz), c = this.chunks.get(key);
        if (!c) continue;
        const rm = this.removedPlants.get(key);
        for (let i = 0, k = 0; i < c.plants.length; i += PLANT_STRIDE, k++) {
          if (rm?.has(k)) continue;
          const dx = c.plants[i] - x, dy = c.plants[i + 1] - y, dz = c.plants[i + 2] - z;
          if (dx * dx + dy * dy + dz * dz < r * r) out.push({ key, index: k, x: c.plants[i], y: c.plants[i + 1], z: c.plants[i + 2], kind: c.plants[i + 3] });
        }
      }
    return out;
  }

  /**
   * Dig a soft sphere out of the ground. Only materials allowed by `canDig` are
   * affected. Returns the number of grid points removed per material.
   */
  dig(cx: number, cy: number, cz: number, r: number, strength: number, canDig: (m: number) => number): Map<number, number> {
    const removed = new Map<number, number>();
    const dirty = new Set<string>();
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      if (y < 1 || y >= CHUNK_HEIGHT - 1) continue;
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x - cx, y - cy, z - cz);
        if (d > r) continue;
        const c = this.chunkAt(x, z);
        if (!c) continue;
        const lx = x - c.cx * CHUNK_SIZE, lz = z - c.cz * CHUNK_SIZE, i = vIndex(lx, y, lz);
        const v = c.density[i];
        if (v < SOLID_MIN - 30) continue;
        const m = c.material[i];
        const mul = canDig(m);
        if (mul <= 0) continue;
        const nv = Math.max(0, Math.round(v - strength * (1 - d / r) * 40 * mul));
        if (nv === v) continue;
        c.density[i] = nv;
        if (v >= SOLID_MIN && nv < SOLID_MIN) { removed.set(m, (removed.get(m) ?? 0) + 1); c.material[i] = 0; }
        this.recordDelta(c, i);
        for (const ox of [-1, 0, 1]) for (const oz of [-1, 0, 1]) {
          if ((ox === -1 && lx !== 0) || (ox === 1 && lx !== CHUNK_SIZE - 1) || (oz === -1 && lz !== 0) || (oz === 1 && lz !== CHUNK_SIZE - 1)) continue;
          dirty.add(chunkKey(c.cx + ox, c.cz + oz));
        }
      }
    }
    for (const key of dirty) this.remesh(key);
    return removed;
  }

  private recordDelta(c: Chunk, i: number) {
    const key = chunkKey(c.cx, c.cz);
    let m = this.deltas.get(key); if (!m) { m = new Map(); this.deltas.set(key, m); }
    m.set(i, (c.density[i] << 8) | c.material[i]);
  }

  /** Re-light and re-mesh a loaded chunk from its (edited) data + neighbours. */
  remesh(key: string) {
    const c = this.chunks.get(key);
    if (!c) { this.dirtyAfterLoad.add(key); return; }
    const den = new Uint8Array(PAD_VOLUME), mat = new Uint8Array(PAD_VOLUME);
    for (let lz = -1; lz <= CHUNK_SIZE; lz++) for (let lx = -1; lx <= CHUNK_SIZE; lx++) {
      const wx = c.cx * CHUNK_SIZE + lx, wz = c.cz * CHUNK_SIZE + lz;
      let src = this.chunkAt(wx, wz), sx = wx, sz = wz;
      if (!src) { src = c; sx = c.cx * CHUNK_SIZE + Math.max(0, Math.min(CHUNK_SIZE - 1, lx)); sz = c.cz * CHUNK_SIZE + Math.max(0, Math.min(CHUNK_SIZE - 1, lz)); }
      const ix = sx - src.cx * CHUNK_SIZE, iz = sz - src.cz * CHUNK_SIZE;
      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        const p = pIdx(lx, y, lz), v = vIndex(ix, y, iz);
        den[p] = src.density[v]; mat[p] = src.material[v];
      }
    }
    const job = this.jobSeq++;
    this.remeshJobs.set(key, job);
    let wi = 0;
    for (let i = 1; i < this.workers.length; i++) if (this.busy[i] < this.busy[wi]) wi = i;
    this.busy[wi]++;
    this.workers[wi].postMessage({ type: 'mesh', job, cx: c.cx, cz: c.cz, density: den, material: mat } satisfies WorkerRequest, [den.buffer, mat.buffer]);
  }

  private applyRemesh(key: string, r: WorkerResult) {
    if (this.remeshJobs.get(key) !== r.job) return;
    this.remeshJobs.delete(key);
    const c = this.chunks.get(key);
    if (!c) return;
    for (const m of [c.terrain, c.liquid]) if (m) { this.group.remove(m); this.shadows.remove(m); m.geometry.dispose(); }
    c.terrain = this.makeTerrain(r.terrain, c.cx, c.cz);
    c.liquid = this.makeLiquid(r.liquid, c.cx, c.cz);
    if (c.terrain) this.shadows.add(c.terrain);
  }

  /** Edits that fall inside the padded volume of chunk (cx,cz), as [paddedIndex, value] pairs. */
  private editsFor(cx: number, cz: number): Int32Array | undefined {
    const out: number[] = [];
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
      const d = this.deltas.get(chunkKey(cx + ox, cz + oz));
      if (!d) continue;
      for (const [i, val] of d) {
        const lx = (i % CHUNK_SIZE) + ox * CHUNK_SIZE, lz = (Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE) + oz * CHUNK_SIZE, y = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
        if (lx < -1 || lx > CHUNK_SIZE || lz < -1 || lz > CHUNK_SIZE) continue;
        out.push(pIdx(lx, y, lz), val);
      }
    }
    return out.length ? new Int32Array(out) : undefined;
  }

  serializeDelta(): WorldDelta {
    const flat = (m: Map<number, number>) => { const a: number[] = []; for (const [i, v] of m) a.push(i, v); return a; };
    return {
      edits: [...this.deltas].map(([k, m]) => [k, flat(m)]),
      trees: [...this.removedTrees].map(([k, s]) => [k, [...s]]),
      plants: [...this.removedPlants].map(([k, s]) => [k, [...s]])
    };
  }

  loadDelta(d: WorldDelta) {
    for (const [k, a] of d.edits) { const m = new Map<number, number>(); for (let i = 0; i < a.length; i += 2) m.set(a[i], a[i + 1]); this.deltas.set(k, m); }
    for (const [k, a] of d.trees) this.removedTrees.set(k, new Set(a));
    for (const [k, a] of d.plants) this.removedPlants.set(k, new Set(a));
  }

  /** March a ray through the density field; returns the first surface hit. */
  raycast(o: THREE.Vector3, dir: THREE.Vector3, max: number): { point: THREE.Vector3; normal: THREE.Vector3; dist: number; material: number } | null {
    let prevT = 0;
    let prev = this.density(o.x, o.y, o.z);
    if (prev > 0) return null;
    for (let t = 0.12; t <= max; t += 0.12) {
      const d = this.density(o.x + dir.x * t, o.y + dir.y * t, o.z + dir.z * t);
      if (d > 0) {
        let a = prevT, b = t;
        for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (this.density(o.x + dir.x * m, o.y + dir.y * m, o.z + dir.z * m) > 0) b = m; else a = m; }
        const point = o.clone().addScaledVector(dir, b);
        const normal = new THREE.Vector3();
        this.sdf(point, normal);
        // material: the most solid grid point of the surrounding cell
        let best = -1e9, material = 0;
        for (let k = 0; k < 8; k++) {
          const gx = Math.floor(point.x) + (k & 1), gy = Math.floor(point.y) + ((k >> 1) & 1), gz = Math.floor(point.z) + ((k >> 2) & 1);
          const gd = this.gridDensity(gx, gy, gz);
          if (gd > best) { best = gd; material = this.material(gx, gy, gz); }
        }
        return { point, normal, dist: b, material };
      }
      prev = d; prevT = t;
    }
    return null;
  }

  /** Ground height near an expected height (cheap: searches a few metres). */
  groundNear(x: number, z: number, yGuess: number): number {
    let prev = this.density(x, yGuess + 4, z);
    for (let y = yGuess + 3.5; y > yGuess - 8; y -= 0.5) {
      const d = this.density(x, y, z);
      if (d > 0 && prev <= 0) return y + 0.5 * (d / (d - prev));
      prev = d;
    }
    return this.groundY(x, z);
  }

  /** Tree trunks within range of (x,z). */
  treesNear(x: number, z: number, range: number, out: TreeHit[]): TreeHit[] {
    out.length = 0;
    const cx0 = Math.floor((x - range) / CHUNK_SIZE), cx1 = Math.floor((x + range) / CHUNK_SIZE);
    const cz0 = Math.floor((z - range) / CHUNK_SIZE), cz1 = Math.floor((z + range) / CHUNK_SIZE);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const key = chunkKey(cx, cz);
      const c = this.chunks.get(key);
      if (!c) continue;
      const t = c.trees;
      const rm = this.removedTrees.get(key);
      for (let i = 0, idx = 0; i < t.length; i += TREE_STRIDE, idx++) {
        if (rm?.has(idx)) continue;
        const dx = t[i] - x, dz = t[i + 2] - z;
        if (dx * dx + dz * dz > range * range) continue;
        const k = TRUNK[t[i + 3]], s = t[i + 4];
        out.push({ x: t[i], z: t[i + 2], r: k.r * s, y0: t[i + 1], y1: t[i + 1] + k.h * s, key, index: idx, kind: t[i + 3] });
      }
    }
    return out;
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    for (const c of [...this.chunks.values(), ...this.cache.values()]) for (const m of [c.terrain, c.liquid]) m?.geometry.dispose();
    this.chunks.clear(); this.cache.clear();
    this.group.clear();
  }
}
