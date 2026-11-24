/// <reference lib="webworker" />
// Chunk worker: generates the smooth density field (from the seed), lights it and
// builds the terrain + liquid meshes and vegetation instance lists.
import { TerrainGen, PAD_VOLUME, pIdx } from './terrain';
import { computeLight, meshSmooth, TerrainMesh, LiquidMesh } from './smooth-mesher';
import { CHUNK_HEIGHT, CHUNK_SIZE, vIndex } from './constants';

export type WorkerRequest =
  | { type: 'init'; seed: number }
  | { type: 'build'; job: number; cx: number; cz: number; edits?: Int32Array }
  | { type: 'mesh'; job: number; cx: number; cz: number; density: Uint8Array; material: Uint8Array };

export interface WorkerResult {
  job: number; cx: number; cz: number;
  density: Uint8Array; material: Uint8Array;   // inner 16x128x16
  trees: Float32Array; plants: Float32Array;
  terrain: TerrainMesh; liquid: LiquidMesh;
  ms: number;
  remesh?: boolean;
}

let gen: TerrainGen | null = null;
const sky = new Uint8Array(PAD_VOLUME);
const blk = new Uint8Array(PAD_VOLUME);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'init') { gen = new TerrainGen(msg.seed); return; }
  const t0 = performance.now();
  if (msg.type === 'mesh') {
    computeLight(msg.density, msg.material, sky, blk);
    const { terrain, liquid } = meshSmooth(msg.density, msg.material, sky, blk);
    const empty = new Uint8Array(0);
    const res: WorkerResult = { job: msg.job, cx: msg.cx, cz: msg.cz, density: empty, material: empty, trees: new Float32Array(0), plants: new Float32Array(0), terrain, liquid, ms: performance.now() - t0, remesh: true };
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(res, [terrain.positions.buffer, terrain.normals.buffer, terrain.mats.buffer, terrain.light.buffer, liquid.positions.buffer, liquid.data.buffer, liquid.indices.buffer]);
    return;
  }
  const g = gen!.generate(msg.cx, msg.cz);
  if (msg.edits) for (let i = 0; i < msg.edits.length; i += 2) {
    const v = msg.edits[i + 1];
    g.density[msg.edits[i]] = v >> 8; g.material[msg.edits[i]] = v & 255;
  }
  const n = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;
  const density = new Uint8Array(n), material = new Uint8Array(n);
  for (let y = 0; y < CHUNK_HEIGHT; y++)
    for (let z = 0; z < CHUNK_SIZE; z++)
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const p = pIdx(x, y, z), v = vIndex(x, y, z);
        density[v] = g.density[p]; material[v] = g.material[p];
      }
  computeLight(g.density, g.material, sky, blk);
  const { terrain, liquid } = meshSmooth(g.density, g.material, sky, blk);
  const res: WorkerResult = { job: msg.job, cx: msg.cx, cz: msg.cz, density, material, trees: g.trees, plants: g.plants, terrain, liquid, ms: performance.now() - t0 };
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(res, [
    density.buffer, material.buffer, g.trees.buffer, g.plants.buffer,
    terrain.positions.buffer, terrain.normals.buffer, terrain.mats.buffer, terrain.light.buffer,
    liquid.positions.buffer, liquid.data.buffer, liquid.indices.buffer
  ]);
};
