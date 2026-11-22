// Smooth terrain mesher (Surface Nets) + light flood fill + water/lava surfaces.
// Runs in a worker on the padded density/material volume of one chunk.
//
// Surface Nets: one vertex per grid cell that the surface passes through (placed at
// the average of the edge crossings), and one quad per grid edge that changes sign.
// Each quad takes the material of the solid end of its edge. Normals come from the
// density gradient, so shading is smooth and seamless across chunk borders.
import { BLOCKS, B } from './blocks';
import { BLOCK_TILES } from './tiles';
import { CHUNK_HEIGHT, CHUNK_SIZE } from './constants';
import { PAD, PAD_LAYER, PAD_VOLUME, pIdx, SOLID_MIN, WATER_SURFACE_OFFSET } from './terrain';

export interface MeshData {
  positions: Float32Array;
  normals: Int8Array;     // normalized
  tiles: Uint8Array;      // top tile, side tile
  light: Uint8Array;      // ao (0..255), sky (0..15), block (0..15)
  indices: Uint16Array | Uint32Array;
}

const EMIT = new Uint8Array(256);
for (const b of BLOCKS) EMIT[b.id] = b.light ?? 0;

/** Flood-fill sky and block light over grid points of the padded volume. */
export function computeLight(den: Uint8Array, mat: Uint8Array, sky: Uint8Array, blk: Uint8Array) {
  sky.fill(0); blk.fill(0);
  const queue = new Int32Array(PAD_VOLUME);
  const n = queue.length;
  let head = 0, tail = 0;
  const atten = (i: number) => (den[i] >= SOLID_MIN ? 0 : mat[i] === B.WATER ? 2 : 1);

  for (let z = 0; z < PAD; z++) for (let x = 0; x < PAD; x++) {
    let level = 15;
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const i = x + z * PAD + y * PAD_LAYER;
      const a = atten(i);
      if (a === 0) break;
      if (a > 1) level = Math.max(0, level - 2);
      if (level === 0) break;
      sky[i] = level;
      queue[tail] = i; tail = (tail + 1) % n;
    }
  }
  const spread = (light: Uint8Array) => {
    const steps = [1, -1, PAD, -PAD, PAD_LAYER, -PAD_LAYER];
    while (head !== tail) {
      const i = queue[head]; head = (head + 1) % n;
      const l = light[i];
      if (l <= 1) continue;
      const x = i % PAD, z = Math.floor(i / PAD) % PAD;
      for (let s = 0; s < 6; s++) {
        if ((s === 0 && x === PAD - 1) || (s === 1 && x === 0) || (s === 2 && z === PAD - 1) || (s === 3 && z === 0)) continue;
        const j = i + steps[s];
        if (j < 0 || j >= PAD_VOLUME) continue;
        const a = atten(j);
        if (a === 0) continue;
        const nl = l - a;
        if (nl > light[j]) { light[j] = nl; queue[tail] = j; tail = (tail + 1) % n; }
      }
    }
  };
  spread(sky);
  head = 0; tail = 0;
  for (let i = 0; i < PAD_VOLUME; i++) {
    const e = EMIT[mat[i]];
    if (e) { blk[i] = e; queue[tail] = i; tail = (tail + 1) % n; }
  }
  spread(blk);
}

class Builder {
  pos: number[] = []; nrm: number[] = []; tiles: number[] = []; light: number[] = []; idx: number[] = [];
  vcount = 0;
  build(): MeshData {
    return {
      positions: new Float32Array(this.pos),
      normals: new Int8Array(this.nrm),
      tiles: new Uint8Array(this.tiles),
      light: new Uint8Array(this.light),
      indices: this.vcount > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx)
    };
  }
}

// cells span grid points c..c+1; we need cells -1..15 in x/z and 0..H-2 in y
const CELLS_XZ = CHUNK_SIZE + 1;
const cellIdx = (cx: number, cy: number, cz: number) => (cx + 1) + (cz + 1) * CELLS_XZ + cy * CELLS_XZ * CELLS_XZ;

const CUBE_EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7], // along x
  [0, 2], [1, 3], [4, 6], [5, 7], // along y
  [0, 4], [1, 5], [2, 6], [3, 7]  // along z
];
// corner k: x = k&1, y = (k>>1)&1, z = (k>>2)&1

export function meshSmooth(den: Uint8Array, mat: Uint8Array, sky: Uint8Array, blk: Uint8Array): { terrain: MeshData; liquid: MeshData } {
  const nCells = CELLS_XZ * CELLS_XZ * (CHUNK_HEIGHT - 1);
  const vx = new Float32Array(nCells * 3);
  const vn = new Float32Array(nCells * 3);
  const vlight = new Uint8Array(nCells * 3);
  const has = new Uint8Array(nCells);
  const cd = new Float32Array(8);

  // ---- 1. place one vertex in every cell crossed by the surface
  for (let cy = 0; cy < CHUNK_HEIGHT - 1; cy++) {
    for (let cz = -1; cz < CHUNK_SIZE; cz++) {
      for (let cx = -1; cx < CHUNK_SIZE; cx++) {
        let mask = 0;
        for (let k = 0; k < 8; k++) {
          const v = den[pIdx(cx + (k & 1), cy + ((k >> 1) & 1), cz + ((k >> 2) & 1))];
          cd[k] = v - 127.5;
          if (v >= SOLID_MIN) mask |= 1 << k;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (const [a, b] of CUBE_EDGES) {
          const da = cd[a], db = cd[b];
          if ((da > 0) === (db > 0)) continue;
          const t = da / (da - db);
          sx += (a & 1) + (((b & 1) - (a & 1)) * t);
          sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t);
          sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t);
          cnt++;
        }
        const ci = cellIdx(cx, cy, cz);
        has[ci] = 1;
        vx[ci * 3] = cx + sx / cnt; vx[ci * 3 + 1] = cy + sy / cnt; vx[ci * 3 + 2] = cz + sz / cnt;
        // gradient of density across the cell → outward normal = -grad
        const gx = (cd[1] - cd[0]) + (cd[3] - cd[2]) + (cd[5] - cd[4]) + (cd[7] - cd[6]);
        const gy = (cd[2] - cd[0]) + (cd[3] - cd[1]) + (cd[6] - cd[4]) + (cd[7] - cd[5]);
        const gz = (cd[4] - cd[0]) + (cd[5] - cd[1]) + (cd[6] - cd[2]) + (cd[7] - cd[3]);
        const gl = Math.hypot(gx, gy, gz) || 1;
        vn[ci * 3] = -gx / gl; vn[ci * 3 + 1] = -gy / gl; vn[ci * 3 + 2] = -gz / gl;
        // light = brightest open corner; AO = how enclosed the neighbourhood is
        let sl = 0, bl = 0;
        for (let k = 0; k < 8; k++) {
          const i = pIdx(cx + (k & 1), cy + ((k >> 1) & 1), cz + ((k >> 2) & 1));
          if (sky[i] > sl) sl = sky[i];
          if (blk[i] > bl) bl = blk[i];
        }
        let solid = 0, total = 0;
        for (let dy = -1; dy <= 2; dy++) {
          const yy = cy + dy;
          if (yy < 0 || yy >= CHUNK_HEIGHT) continue;
          for (let dz = -1; dz <= 2; dz++) {
            const zz = Math.max(-1, Math.min(CHUNK_SIZE, cz + dz));
            for (let dx = -1; dx <= 2; dx++) {
              const xx = Math.max(-1, Math.min(CHUNK_SIZE, cx + dx));
              total++;
              if (den[pIdx(xx, yy, zz)] >= SOLID_MIN) solid++;
            }
          }
        }
        const frac = solid / total;
        const ao = Math.max(0.42, Math.min(1, 1 - (frac - 0.5) * 1.5));
        vlight[ci * 3] = Math.round(ao * 255); vlight[ci * 3 + 1] = sl; vlight[ci * 3 + 2] = bl;
      }
    }
  }

  // ---- 2. one quad per sign-changing grid edge owned by this chunk
  const terrain = new Builder();
  const quad = [0, 0, 0, 0];
  for (let y = 0; y < CHUNK_HEIGHT - 1; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const i0 = pIdx(x, y, z);
        const s0 = den[i0] >= SOLID_MIN;
        for (let axis = 0; axis < 3; axis++) {
          const x1 = x + (axis === 0 ? 1 : 0), y1 = y + (axis === 1 ? 1 : 0), z1 = z + (axis === 2 ? 1 : 0);
          const i1 = pIdx(x1, y1, z1);
          const s1 = den[i1] >= SOLID_MIN;
          if (s0 === s1) continue;
          // the 4 cells around this edge, ordered so the winding faces +axis
          const u = (axis + 1) % 3, v = (axis + 2) % 3;
          const p = [x, y, z];
          let ok = true;
          for (let c = 0; c < 4; c++) {
            const q = [p[0], p[1], p[2]];
            if (c === 0 || c === 3) q[u] -= 1;
            if (c === 0 || c === 1) q[v] -= 1;
            if (q[1] < 0 || q[1] >= CHUNK_HEIGHT - 1) { ok = false; break; }
            const ci = cellIdx(q[0], q[1], q[2]);
            if (!has[ci]) { ok = false; break; }
            quad[c] = ci;
          }
          if (!ok) continue;
          const m = s0 ? mat[i0] : mat[i1];
          const top = BLOCK_TILES[m * 3], side = BLOCK_TILES[m * 3 + 1];
          const base = terrain.vcount;
          for (let c = 0; c < 4; c++) {
            const ci = quad[c];
            terrain.pos.push(vx[ci * 3], vx[ci * 3 + 1], vx[ci * 3 + 2]);
            terrain.nrm.push(Math.round(vn[ci * 3] * 127), Math.round(vn[ci * 3 + 1] * 127), Math.round(vn[ci * 3 + 2] * 127));
            terrain.tiles.push(top, side);
            terrain.light.push(vlight[ci * 3], vlight[ci * 3 + 1], vlight[ci * 3 + 2]);
          }
          terrain.vcount += 4;
          // solid at the low end → surface faces +axis
          if (s0) terrain.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          else terrain.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
        }
      }
    }
  }

  return { terrain: terrain.build(), liquid: meshLiquids(den, mat, sky, blk) };
}

/** Flat liquid surfaces (water, lava, ice) at the top of each liquid column. */
function meshLiquids(den: Uint8Array, mat: Uint8Array, sky: Uint8Array, blk: Uint8Array): MeshData {
  const out = new Builder();
  const isLiquid = (m: number) => m === B.WATER || m === B.LAVA || m === B.ICE;
  for (let y = 1; y < CHUNK_HEIGHT - 1; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const i = pIdx(x, y, z);
        let m = mat[i];
        const above = pIdx(x, y + 1, z);
        if (isLiquid(mat[above]) || den[above] >= SOLID_MIN) continue;
        if (!isLiquid(m)) {
          // extend the surface one step under the shore so it meets the terrain
          if (den[i] < SOLID_MIN) continue;
          let nb = 0;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const j = mat[pIdx(x + dx, y, z + dz)];
            if (isLiquid(j) && den[pIdx(x + dx, y + 1, z + dz)] < SOLID_MIN && !isLiquid(mat[pIdx(x + dx, y + 1, z + dz)])) nb = j;
          }
          if (!nb) continue;
          m = nb;
        }
        const h = y + WATER_SURFACE_OFFSET;
        const tile = BLOCK_TILES[m * 3];
        const base = out.vcount;
        const corners = [[x - 0.5, z - 0.5], [x + 0.5, z - 0.5], [x + 0.5, z + 0.5], [x - 0.5, z + 0.5]];
        for (const [px, pz] of corners) {
          out.pos.push(px, h, pz);
          out.nrm.push(0, 127, 0);
          out.tiles.push(tile, tile);
          out.light.push(255, sky[above], Math.max(blk[above], m === B.LAVA ? 15 : 0));
        }
        out.vcount += 4;
        out.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    }
  }
  return out.build();
}
