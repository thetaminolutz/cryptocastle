// Light propagation + greedy mesher. Runs inside a worker on a padded chunk volume.
// Output: two meshes per chunk (opaque/cutout and liquid), hidden faces never emitted.
// Per-vertex AO, sky light and block light are baked into a compact vertex attribute.
import { BLOCKS, Render } from './blocks';
import { BLOCK_TILES } from './tiles';
import { CHUNK_HEIGHT, CHUNK_SIZE } from './constants';
import { PAD, PAD_LAYER, PAD_VOLUME, pIdx } from './terrain';

const RENDER = new Uint8Array(256);
const EMIT = new Uint8Array(256);
for (const b of BLOCKS) { RENDER[b.id] = b.render; EMIT[b.id] = b.light ?? 0; }

/** How much light is lost passing into a cell of this block (0 = blocks fully). */
const ATTEN = new Uint8Array(256);
for (const b of BLOCKS) {
  ATTEN[b.id] = b.render === Render.Air ? 1 : b.render === Render.Cutout ? 2 : b.render === Render.Liquid ? 3 : 0;
}

export interface MeshData {
  positions: Float32Array;
  normals: Int8Array;
  uvs: Uint8Array;
  data: Uint8Array;     // tile, ao(0..3), sky(0..15), block(0..15)
  indices: Uint16Array | Uint32Array;
}

/** Flood-fill sky and block light in the padded volume. */
export function computeLight(vox: Uint8Array, sky: Uint8Array, blk: Uint8Array) {
  sky.fill(0); blk.fill(0);
  const queue = new Int32Array(PAD_VOLUME * 2);
  let head = 0, tail = 0;
  const push = (i: number) => { queue[tail] = i; tail = (tail + 1) % queue.length; };

  // Sky: straight down columns at full strength.
  for (let z = 0; z < PAD; z++) for (let x = 0; x < PAD; x++) {
    let level = 15;
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const i = x + z * PAD + y * PAD_LAYER;
      const a = ATTEN[vox[i]];
      if (a === 0) break;
      if (a > 1) level = Math.max(0, level - (a - 1) * 2);
      if (level === 0) break;
      sky[i] = level;
      push(i);
    }
  }
  spread(vox, sky, queue, head, tail);

  head = 0; tail = 0;
  for (let i = 0; i < PAD_VOLUME; i++) {
    const e = EMIT[vox[i]];
    if (e) { blk[i] = e; push(i); }
  }
  spread(vox, blk, queue, head, tail);
}

function spread(vox: Uint8Array, light: Uint8Array, queue: Int32Array, head: number, tail: number) {
  const n = queue.length;
  const steps = [1, -1, PAD, -PAD, PAD_LAYER, -PAD_LAYER];
  while (head !== tail) {
    const i = queue[head]; head = (head + 1) % n;
    const l = light[i];
    if (l <= 1) continue;
    const x = i % PAD, z = Math.floor(i / PAD) % PAD;
    for (let s = 0; s < 6; s++) {
      if (s === 0 && x === PAD - 1) continue;
      if (s === 1 && x === 0) continue;
      if (s === 2 && z === PAD - 1) continue;
      if (s === 3 && z === 0) continue;
      const j = i + steps[s];
      if (j < 0 || j >= PAD_VOLUME) continue;
      const a = ATTEN[vox[j]];
      if (a === 0) continue;
      const nl = l - a;
      if (nl > light[j]) { light[j] = nl; queue[tail] = j; tail = (tail + 1) % n; }
    }
  }
}

class Builder {
  pos: number[] = []; nrm: number[] = []; uv: number[] = []; dat: number[] = []; idx: number[] = [];
  vcount = 0;
  build(): MeshData {
    return {
      positions: new Float32Array(this.pos),
      normals: new Int8Array(this.nrm),
      uvs: new Uint8Array(this.uv),
      data: new Uint8Array(this.dat),
      indices: this.vcount > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx)
    };
  }
}

const DIMS = [CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_SIZE];

/** Greedy-mesh the inner 16x128x16 region of a padded volume. */
export function greedyMesh(vox: Uint8Array, sky: Uint8Array, blk: Uint8Array): { opaque: MeshData; liquid: MeshData } {
  const opaque = new Builder(), liquid = new Builder();
  const mask = new Int32Array(CHUNK_SIZE * CHUNK_HEIGHT);
  const get = (x: number, y: number, z: number) => (y < 0 ? 8 /* bedrock */ : y >= CHUNK_HEIGHT ? 0 : vox[pIdx(x, y, z)]);
  const occ = (x: number, y: number, z: number) => {
    const r = RENDER[get(x, y, z)];
    return r === Render.Opaque || r === Render.Cutout ? 1 : 0;
  };
  const pos = [0, 0, 0], q = [0, 0, 0], t = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const du = DIMS[u], dv = DIMS[v];
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < DIMS[d]; i++) {
        // ---- build mask for this slice
        let anyFace = false;
        for (let b = 0; b < dv; b++) {
          for (let a = 0; a < du; a++) {
            pos[d] = i; pos[u] = a; pos[v] = b;
            const id = get(pos[0], pos[1], pos[2]);
            const r = RENDER[id];
            let key = 0;
            if (r !== Render.Air) {
              q[0] = pos[0]; q[1] = pos[1]; q[2] = pos[2]; q[d] += side;
              const nid = get(q[0], q[1], q[2]);
              const nr = RENDER[nid];
              let visible = false;
              if (r === Render.Opaque) visible = nr !== Render.Opaque;
              else if (r === Render.Cutout) visible = nr !== Render.Opaque && nid !== id;
              else visible = (nr === Render.Air || nr === Render.Cutout) && nid !== id;
              if (visible) {
                const tile = BLOCK_TILES[id * 3 + (d === 1 ? (side > 0 ? 0 : 2) : 1)];
                let ao = 0xff; // 4 x 2 bits, all 3 = no occlusion
                if (r !== Render.Liquid) {
                  ao = 0;
                  // corners in order: (-u,-v), (+u,-v), (+u,+v), (-u,+v)
                  for (let c = 0; c < 4; c++) {
                    const su = c === 1 || c === 2 ? 1 : -1;
                    const sv = c >= 2 ? 1 : -1;
                    t[0] = q[0]; t[1] = q[1]; t[2] = q[2]; t[u] += su;
                    const s1 = occ(t[0], t[1], t[2]);
                    t[v] += sv;
                    const s3 = occ(t[0], t[1], t[2]);
                    t[u] -= su;
                    const s2 = occ(t[0], t[1], t[2]);
                    const cval = s1 && s2 ? 0 : 3 - (s1 + s2 + s3);
                    ao |= cval << (c * 2);
                  }
                }
                const qi = q[1] < 0 ? -1 : q[1] >= CHUNK_HEIGHT ? -2 : pIdx(q[0], q[1], q[2]);
                const sl = qi === -2 ? 15 : qi === -1 ? 0 : sky[qi];
                const bl = qi < 0 ? 0 : blk[qi];
                const lw = r === Render.Liquid ? 1 : 0;
                const top = r === Render.Liquid && d === 1 && side > 0 && RENDER[get(q[0], q[1], q[2])] !== Render.Liquid ? 1 : 0;
                key = 1 + (tile | (ao << 8) | (sl << 16) | (bl << 20) | (lw << 24) | (top << 25));
              }
            }
            mask[a + b * du] = key;
            if (key) anyFace = true;
          }
        }
        if (!anyFace) continue;
        // ---- greedy merge
        for (let b = 0; b < dv; b++) {
          for (let a = 0; a < du;) {
            const key = mask[a + b * du];
            if (!key) { a++; continue; }
            // Only merge faces whose 4 AO corners are equal; otherwise the AO
            // gradient would be stretched across the merged quad.
            const aoBits = ((key - 1) >> 8) & 0xff;
            const mergeable = aoBits === 0xff || aoBits === 0 || aoBits === 0x55 || aoBits === 0xaa;
            let w = 1;
            while (mergeable && a + w < du && mask[a + w + b * du] === key) w++;
            let h = 1;
            if (mergeable) outer: for (; b + h < dv; h++) {
              for (let k = 0; k < w; k++) if (mask[a + k + (b + h) * du] !== key) break outer;
            }
            emitQuad(key - 1, d, u, v, side, i, a, b, w, h, (key - 1) >> 24 & 1 ? liquid : opaque);
            for (let hh = 0; hh < h; hh++) for (let k = 0; k < w; k++) mask[a + k + (b + hh) * du] = 0;
            a += w;
          }
        }
      }
    }
  }
  return { opaque: opaque.build(), liquid: liquid.build() };
}

function emitQuad(k: number, d: number, u: number, v: number, side: number, i: number, a: number, b: number, w: number, h: number, out: Builder) {
  const tile = k & 0xff, ao = (k >> 8) & 0xff, sl = (k >> 16) & 0xf, bl = (k >> 20) & 0xf, top = (k >> 25) & 1;
  const base = [0, 0, 0];
  base[d] = i + (side > 0 ? 1 : 0); base[u] = a; base[v] = b;
  const corners: number[][] = [];
  for (let c = 0; c < 4; c++) {
    const p = [base[0], base[1], base[2]];
    if (c === 1 || c === 2) p[u] += w;
    if (c >= 2) p[v] += h;
    if (top) p[1] -= 0.125;
    corners.push(p);
  }
  const vi = out.vcount;
  const aos = [ao & 3, (ao >> 2) & 3, (ao >> 4) & 3, (ao >> 6) & 3];
  const n = [0, 0, 0]; n[d] = side;
  for (let c = 0; c < 4; c++) {
    const p = corners[c];
    out.pos.push(p[0], p[1], p[2]);
    out.nrm.push(n[0], n[1], n[2]);
    if (d === 1) out.uv.push(p[0], p[2]);
    else if (d === 0) out.uv.push(p[2], Math.round(p[1]));
    else out.uv.push(p[0], Math.round(p[1]));
    out.dat.push(tile, aos[c], sl, bl);
  }
  out.vcount += 4;
  const flip = aos[0] + aos[2] < aos[1] + aos[3];
  if (side > 0) {
    if (!flip) out.idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    else out.idx.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi);
  } else {
    if (!flip) out.idx.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2);
    else out.idx.push(vi + 1, vi + 3, vi + 2, vi + 1, vi, vi + 3);
  }
}
