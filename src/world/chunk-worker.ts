/// <reference lib="webworker" />
// Chunk worker: generates the smooth density field (from the seed), lights it and
// builds the terrain + liquid meshes.
import { TerrainGen, PAD_VOLUME, pIdx } from './terrain';
import { computeLight, meshSmooth, MeshData } from './smooth-mesher';
import { CHUNK_HEIGHT, CHUNK_SIZE, vIndex } from './constants';

export type WorkerRequest =
  | { type: 'init'; seed: number }
  | { type: 'build'; job: number; cx: number; cz: number };

export interface WorkerResult {
  job: number; cx: number; cz: number;
  density: Uint8Array;   // inner 16x128x16
  material: Uint8Array;  // inner 16x128x16
  trees: Float32Array;
  terrain: MeshData; liquid: MeshData;
  ms: number;
}

let gen: TerrainGen | null = null;
const sky = new Uint8Array(PAD_VOLUME);
const blk = new Uint8Array(PAD_VOLUME);

const transfer = (m: MeshData) => [m.positions.buffer, m.normals.buffer, m.tiles.buffer, m.light.buffer, m.indices.buffer];

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'init') { gen = new TerrainGen(msg.seed); return; }
  const t0 = performance.now();
  const g = gen!.generate(msg.cx, msg.cz);
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
  const res: WorkerResult = { job: msg.job, cx: msg.cx, cz: msg.cz, density, material, trees: g.trees, terrain, liquid, ms: performance.now() - t0 };
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(res,
    [density.buffer, material.buffer, g.trees.buffer, ...transfer(terrain), ...transfer(liquid)]);
};
