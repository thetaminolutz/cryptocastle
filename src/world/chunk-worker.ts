/// <reference lib="webworker" />
// Chunk worker: generates terrain (from seed) and/or meshes a padded voxel volume.
import { TerrainGen, PAD_VOLUME, pIdx } from './terrain';
import { computeLight, greedyMesh, MeshData } from './mesher';
import { CHUNK_HEIGHT, CHUNK_SIZE, vIndex } from './constants';

export type WorkerRequest =
  | { type: 'init'; seed: number }
  | { type: 'build'; job: number; cx: number; cz: number; padded?: Uint8Array };

export interface WorkerResult {
  job: number; cx: number; cz: number;
  voxels: Uint8Array;          // inner 16x128x16 (only when generated here)
  opaque: MeshData; liquid: MeshData;
  ms: number;
}

let gen: TerrainGen | null = null;
const sky = new Uint8Array(PAD_VOLUME);
const blk = new Uint8Array(PAD_VOLUME);

const transfer = (m: MeshData) => [m.positions.buffer, m.normals.buffer, m.uvs.buffer, m.data.buffer, m.indices.buffer];

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'init') { gen = new TerrainGen(msg.seed); return; }
  if (msg.type === 'build') {
    const t0 = performance.now();
    let padded = msg.padded;
    if (!padded) padded = gen!.generatePadded(msg.cx, msg.cz, new Uint8Array(PAD_VOLUME));
    const voxels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    for (let y = 0; y < CHUNK_HEIGHT; y++)
      for (let z = 0; z < CHUNK_SIZE; z++)
        for (let x = 0; x < CHUNK_SIZE; x++) voxels[vIndex(x, y, z)] = padded[pIdx(x, y, z)];
    computeLight(padded, sky, blk);
    const { opaque, liquid } = greedyMesh(padded, sky, blk);
    const res: WorkerResult = { job: msg.job, cx: msg.cx, cz: msg.cz, voxels, opaque, liquid, ms: performance.now() - t0 };
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(res, [voxels.buffer, ...transfer(opaque), ...transfer(liquid)]);
  }
};
