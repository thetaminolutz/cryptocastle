// Chunk streaming: requests chunks around the player from a worker pool, uploads
// finished meshes a few per frame, unloads far chunks and keeps a small LRU cache.
// Also answers world queries on the main thread: smooth density (for collision and
// camera), materials (water checks) and nearby trees.
import * as THREE from 'three';
import { CHUNK_HEIGHT, CHUNK_SIZE, chunkKey, vIndex } from './constants';
import type { WorkerRequest, WorkerResult } from './chunk-worker';
import type { MeshData } from './smooth-mesher';
import { decodeDensity, TREE_STRIDE, WATER_SURFACE_OFFSET, TreeKind } from './terrain';
import { TreeRenderer, TREE_TRUNK } from './trees';
import { B } from './blocks';
import ChunkWorker from './chunk-worker?worker';

export interface Chunk {
  cx: number; cz: number;
  density: Uint8Array;
  material: Uint8Array;
  trees: Float32Array;
  terrain: THREE.Mesh | null;
  liquid: THREE.Mesh | null;
}

export interface TreeHit { x: number; z: number; r: number; y0: number; y1: number; }

const LRU_MAX = 48;

export class World {
  readonly group = new THREE.Group();
  readonly chunks = new Map<string, Chunk>();
  readonly trees: TreeRenderer;
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

  constructor(readonly seed: number, viewDistance: number, private matTerrain: THREE.Material, private matLiquid: THREE.Material) {
    this.viewDistance = viewDistance;
    this.trees = new TreeRenderer(matTerrain);
    this.group.add(this.trees.group);
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

  update(pos: THREE.Vector3, forward: THREE.Vector3) {
    const pcx = Math.floor(pos.x / CHUNK_SIZE), pcz = Math.floor(pos.z / CHUNK_SIZE);
    const center = `${pcx},${pcz},${this.viewDistance}`;
    if (center !== this.lastCenter) {
      this.lastCenter = center;
      this.recomputeWanted(pcx, pcz, forward);
      this.unloadFar(pcx, pcz);
    }
    this.dispatch();
    this.applyReady(3);
    this.trees.update();
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
        this.trees.setChunk(key, cached.trees);
        continue;
      }
      const job = this.jobSeq++;
      this.pending.set(key, job);
      this.busy[wi]++;
      this.workers[wi].postMessage({ type: 'build', job, cx, cz } satisfies WorkerRequest);
    }
  }

  private applyReady(max: number) {
    let n = 0;
    while (this.ready.length && n < max) {
      const r = this.ready.shift()!;
      const key = chunkKey(r.cx, r.cz);
      if (this.pending.get(key) !== r.job) continue;
      this.pending.delete(key);
      this.stats.genMs = this.stats.genMs * 0.9 + r.ms * 0.1;
      const chunk: Chunk = {
        cx: r.cx, cz: r.cz, density: r.density, material: r.material, trees: r.trees,
        terrain: this.makeMesh(r.terrain, this.matTerrain, r.cx, r.cz, 0),
        liquid: this.makeMesh(r.liquid, this.matLiquid, r.cx, r.cz, 1)
      };
      this.chunks.set(key, chunk);
      this.trees.setChunk(key, r.trees);
      n++;
    }
    this.stats.loaded = this.chunks.size;
  }

  private makeMesh(m: MeshData, mat: THREE.Material, cx: number, cz: number, order: number): THREE.Mesh | null {
    if (m.indices.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('aNormal', new THREE.BufferAttribute(m.normals, 3, true));
    g.setAttribute('aTiles', new THREE.BufferAttribute(m.tiles, 2));
    g.setAttribute('aLight', new THREE.BufferAttribute(m.light, 3));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
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

  private unloadFar(pcx: number, pcz: number) {
    const r = this.viewDistance + 1.5;
    for (const [key, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz <= r * r) continue;
      for (const m of [c.terrain, c.liquid]) if (m) this.group.remove(m);
      this.chunks.delete(key);
      this.trees.removeChunk(key);
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

  /** Tree trunks within range of (x,z). */
  treesNear(x: number, z: number, range: number, out: TreeHit[]): TreeHit[] {
    out.length = 0;
    const cx0 = Math.floor((x - range) / CHUNK_SIZE), cx1 = Math.floor((x + range) / CHUNK_SIZE);
    const cz0 = Math.floor((z - range) / CHUNK_SIZE), cz1 = Math.floor((z + range) / CHUNK_SIZE);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = this.chunks.get(chunkKey(cx, cz));
      if (!c) continue;
      const t = c.trees;
      for (let i = 0; i < t.length; i += TREE_STRIDE) {
        const dx = t[i] - x, dz = t[i + 2] - z;
        if (dx * dx + dz * dz > range * range) continue;
        const k = TREE_TRUNK[t[i + 3] as TreeKind], s = t[i + 4];
        out.push({ x: t[i], z: t[i + 2], r: k.r * s, y0: t[i + 1], y1: t[i + 1] + k.h * s });
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
