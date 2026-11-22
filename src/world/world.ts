// Chunk streaming: requests chunks around the player from a worker pool, uploads
// finished meshes a few per frame, unloads far chunks and keeps a small LRU cache of
// voxel data. Also answers block queries (collision, raycasts) on the main thread.
import * as THREE from 'three';
import { CHUNK_HEIGHT, CHUNK_SIZE, chunkKey, vIndex } from './constants';
import type { WorkerRequest, WorkerResult } from './chunk-worker';
import type { MeshData } from './mesher';
import ChunkWorker from './chunk-worker?worker';

export interface Chunk {
  cx: number; cz: number;
  voxels: Uint8Array;
  opaque: THREE.Mesh | null;
  liquid: THREE.Mesh | null;
}

const LRU_MAX = 48;

export class World {
  readonly group = new THREE.Group();
  readonly chunks = new Map<string, Chunk>();
  private cache = new Map<string, Uint8Array>(); // LRU of unloaded voxel data (insertion order)
  private pending = new Map<string, number>();   // key → job id
  private ready: WorkerResult[] = [];
  private workers: Worker[] = [];
  private busy: number[] = [];
  private jobSeq = 1;
  private lastCenter = '';
  private wanted: [number, number][] = [];
  viewDistance: number;
  stats = { genMs: 0, loaded: 0, triangles: 0 };

  constructor(readonly seed: number, viewDistance: number, private matOpaque: THREE.Material, private matLiquid: THREE.Material) {
    this.viewDistance = viewDistance;
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

  /** Call every frame with the camera/player position and look direction. */
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
      const facing = (dx * fwd.x + dz * fwd.z) / len; // prefer chunks in view
      list.push({ cx, cz, score: d2 - facing * 4 * len });
    }
    list.sort((a, b) => a.score - b.score);
    this.wanted = list.map((c) => [c.cx, c.cz]);
  }

  private dispatch() {
    const maxPerWorker = 2;
    while (this.wanted.length) {
      let wi = -1, best = maxPerWorker;
      for (let i = 0; i < this.workers.length; i++) if (this.busy[i] < best) { best = this.busy[i]; wi = i; }
      if (wi < 0) return;
      const [cx, cz] = this.wanted.shift()!;
      const key = chunkKey(cx, cz);
      if (this.chunks.has(key) || this.pending.has(key)) continue;
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
      if (this.pending.get(key) !== r.job) continue; // stale (unloaded meanwhile)
      this.pending.delete(key);
      this.stats.genMs = this.stats.genMs * 0.9 + r.ms * 0.1;
      const chunk: Chunk = { cx: r.cx, cz: r.cz, voxels: r.voxels, opaque: null, liquid: null };
      chunk.opaque = this.makeMesh(r.opaque, this.matOpaque, r.cx, r.cz, 0);
      chunk.liquid = this.makeMesh(r.liquid, this.matLiquid, r.cx, r.cz, 1);
      this.chunks.set(key, chunk);
      this.cache.delete(key);
      n++;
    }
    this.stats.loaded = this.chunks.size;
  }

  private makeMesh(m: MeshData, mat: THREE.Material, cx: number, cz: number, order: number): THREE.Mesh | null {
    if (m.indices.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setAttribute('aNormal', new THREE.BufferAttribute(m.normals, 3));
    g.setAttribute('aUv', new THREE.BufferAttribute(m.uvs, 2));
    g.setAttribute('aData', new THREE.BufferAttribute(m.data, 4));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE));
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
      for (const m of [c.opaque, c.liquid]) {
        if (!m) continue;
        this.group.remove(m);
        m.geometry.dispose();
      }
      this.chunks.delete(key);
      this.cache.set(key, c.voxels);
      if (this.cache.size > LRU_MAX) this.cache.delete(this.cache.keys().next().value!);
    }
    for (const [key] of this.pending) {
      const [cx, cz] = key.split(',').map(Number);
      const dx = cx - pcx, dz = cz - pcz;
      if (dx * dx + dz * dz > r * r) this.pending.delete(key); // result will be discarded
    }
  }

  /** Block id at world coords, or -1 if the chunk isn't loaded. */
  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return 8;
    if (y >= CHUNK_HEIGHT) return 0;
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return -1;
    return c.voxels[vIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  }

  /** Highest non-air block in a loaded column, or -1. */
  surfaceY(x: number, z: number): number {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const b = this.getBlock(x, y, z);
      if (b < 0) return -1;
      if (b !== 0) return y;
    }
    return 0;
  }

  countTriangles(): number {
    let t = 0;
    for (const c of this.chunks.values()) {
      if (c.opaque?.geometry.index) t += c.opaque.geometry.index.count / 3;
      if (c.liquid?.geometry.index) t += c.liquid.geometry.index.count / 3;
    }
    return t;
  }

  dispose() {
    for (const w of this.workers) w.terminate();
    for (const c of this.chunks.values()) for (const m of [c.opaque, c.liquid]) m?.geometry.dispose();
    this.chunks.clear();
    this.group.clear();
  }
}
