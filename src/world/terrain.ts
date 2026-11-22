// Deterministic terrain generation. Pure functions of (seed, world position) so a
// chunk plus its 1-block border can be generated independently in any worker.
// M2: continents, hills, mountains, simple caves, ores, three tree types.
// Full biome system arrives in M4 (biomes.ts).
import { Simplex, hash3 } from './noise';
import { B } from './blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL } from './constants';

export const PAD = CHUNK_SIZE + 2;           // padded width (18)
export const PAD_LAYER = PAD * PAD;
export const PAD_VOLUME = PAD_LAYER * CHUNK_HEIGHT;
/** Index into padded volume; x,z in [-1, 16]. */
export const pIdx = (x: number, y: number, z: number) => (x + 1) + (z + 1) * PAD + y * PAD_LAYER;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const enum SimpleBiome { Ocean, Beach, Meadow, Forest, PineForest, Snowy, Mountain }

export interface Column { height: number; biome: SimpleBiome; }

export class TerrainGen {
  readonly seed: number;
  private nCont: Simplex; private nHill: Simplex; private nMount: Simplex;
  private nMask: Simplex; private nTemp: Simplex; private nMoist: Simplex;
  private nCaveA: Simplex; private nCaveB: Simplex;

  constructor(seed: number) {
    this.seed = seed;
    this.nCont = new Simplex(seed);
    this.nHill = new Simplex(seed + 1);
    this.nMount = new Simplex(seed + 2);
    this.nMask = new Simplex(seed + 3);
    this.nTemp = new Simplex(seed + 4);
    this.nMoist = new Simplex(seed + 5);
    this.nCaveA = new Simplex(seed + 6);
    this.nCaveB = new Simplex(seed + 7);
  }

  column(x: number, z: number): Column {
    const d2 = (x * x + z * z) / (260 * 260);
    // Continents; the area around the start is always land.
    let c = this.nCont.fbm2(x / 900, z / 900, 4) + 0.55 * Math.exp(-d2);
    const land = smooth(-0.22, 0.05, c);
    const hills = this.nHill.fbm2(x / 160, z / 160, 5);
    const mMask = smooth(0.05, 0.45, this.nMask.fbm2(x / 1100, z / 1100, 3)) * (1 - Math.exp(-d2 * 2));
    const ridge = this.nMount.ridged2(x / 380, z / 380, 5);
    let h = SEA_LEVEL - 16 + land * (19 + hills * 10) + mMask * land * ridge * 62;
    // start clearing: gentle and flat-ish
    h = h * (1 - 0.6 * Math.exp(-d2 * 30)) + (SEA_LEVEL + 6) * 0.6 * Math.exp(-d2 * 30);
    const height = Math.max(4, Math.min(CHUNK_HEIGHT - 8, Math.floor(h)));

    const temp = this.nTemp.fbm2(x / 700, z / 700, 3) - (height - SEA_LEVEL) / 90;
    const moist = this.nMoist.fbm2(x / 600, z / 600, 3);
    let biome: SimpleBiome;
    if (height < SEA_LEVEL - 1) biome = SimpleBiome.Ocean;
    else if (height <= SEA_LEVEL + 1 && c < 0.25) biome = SimpleBiome.Beach;
    else if (height > SEA_LEVEL + 48) biome = SimpleBiome.Mountain;
    else if (temp < -0.35) biome = SimpleBiome.Snowy;
    else if (temp < -0.1) biome = SimpleBiome.PineForest;
    else if (moist > -0.05) biome = SimpleBiome.Forest;
    else biome = SimpleBiome.Meadow;
    return { height, biome };
  }

  /** Generate chunk (cx,cz) with a 1-voxel border into a padded volume (18x128x18). */
  generatePadded(cx: number, cz: number, out: Uint8Array): Uint8Array {
    out.fill(0);
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    const heights = new Int16Array(PAD_LAYER);
    for (let lz = -1; lz <= CHUNK_SIZE; lz++) {
      for (let lx = -1; lx <= CHUNK_SIZE; lx++) {
        const wx = x0 + lx, wz = z0 + lz;
        const { height, biome } = this.column(wx, wz);
        heights[(lx + 1) + (lz + 1) * PAD] = height;
        this.fillColumn(out, lx, lz, wx, wz, height, biome);
      }
    }
    this.placeTrees(out, x0, z0);
    return out;
  }

  private fillColumn(out: Uint8Array, lx: number, lz: number, wx: number, wz: number, h: number, biome: SimpleBiome) {
    const seed = this.seed;
    let top: number = B.GRASS, filler: number = B.DIRT;
    switch (biome) {
      case SimpleBiome.Ocean: top = h < SEA_LEVEL - 8 ? B.GRAVEL : B.SAND; filler = B.SAND; break;
      case SimpleBiome.Beach: top = B.SAND; filler = B.SAND; break;
      case SimpleBiome.Snowy: top = B.SNOW_GRASS; break;
      case SimpleBiome.Mountain: top = h > SEA_LEVEL + 58 ? B.SNOW : B.STONE; filler = B.STONE; break;
    }
    if (biome === SimpleBiome.Ocean && hash3(wx, 0, wz, seed) < 0.15 && h > SEA_LEVEL - 6) top = B.CLAY;

    for (let y = 0; y <= h; y++) {
      let b: number;
      if (y === 0) b = B.BEDROCK;
      else if (y < 3 && hash3(wx, y, wz, seed) < 0.5) b = B.BEDROCK;
      else if (y === h) b = top;
      else if (y > h - 4) b = filler;
      else b = B.STONE;

      if (b === B.STONE) {
        // ore clusters
        const cell = hash3(wx >> 2, y >> 2, wz >> 2, seed ^ 0xabc);
        if (cell < 0.035 && hash3(wx, y, wz, seed ^ 0x77) < 0.55) b = B.COAL_ORE;
        else if (y < 40 && cell > 0.975 && hash3(wx, y, wz, seed ^ 0x99) < 0.5) b = B.IRON_ORE;
      }
      // caves (spaghetti tunnels) – keep a crust under the surface for now
      if (y > 4 && y < h - 4) {
        const a = this.nCaveA.noise3(wx / 42, y / 26, wz / 42);
        const c = this.nCaveB.noise3(wx / 42, y / 26 + 50, wz / 42);
        if (a * a + c * c < 0.011) b = y < 12 ? B.LAVA : B.AIR;
      }
      out[pIdx(lx, y, lz)] = b;
    }
    if (h < SEA_LEVEL) {
      for (let y = h + 1; y <= SEA_LEVEL; y++) out[pIdx(lx, y, lz)] = biome === SimpleBiome.Snowy && y === SEA_LEVEL ? B.ICE : B.WATER;
    }
  }

  private placeTrees(out: Uint8Array, x0: number, z0: number) {
    const CELL = 6, R = 3;
    const gx0 = Math.floor((x0 - 1 - R) / CELL), gx1 = Math.floor((x0 + CHUNK_SIZE + R) / CELL);
    const gz0 = Math.floor((z0 - 1 - R) / CELL), gz1 = Math.floor((z0 + CHUNK_SIZE + R) / CELL);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const r1 = hash3(gx, 7, gz, this.seed);
        const tx = gx * CELL + Math.floor(hash3(gx, 1, gz, this.seed) * (CELL - 1));
        const tz = gz * CELL + Math.floor(hash3(gx, 2, gz, this.seed) * (CELL - 1));
        const { height, biome } = this.column(tx, tz);
        if (height <= SEA_LEVEL) continue;
        let density = 0;
        if (biome === SimpleBiome.Forest) density = 0.75;
        else if (biome === SimpleBiome.PineForest) density = 0.7;
        else if (biome === SimpleBiome.Meadow) density = 0.07;
        else if (biome === SimpleBiome.Snowy) density = 0.2;
        if (tx * tx + tz * tz < 14 * 14) density = 0; // keep the start clearing open
        if (r1 >= density) continue;
        const kind = biome === SimpleBiome.PineForest || biome === SimpleBiome.Snowy ? 'pine'
          : hash3(gx, 3, gz, this.seed) < 0.3 ? 'birch' : 'oak';
        this.tree(out, tx - x0, height + 1, tz - z0, kind, hash3(gx, 4, gz, this.seed));
      }
    }
  }

  private tree(out: Uint8Array, lx: number, y: number, lz: number, kind: 'oak' | 'birch' | 'pine', r: number) {
    const set = (x: number, yy: number, z: number, b: number, onlyAir = false) => {
      if (x < -1 || x > CHUNK_SIZE || z < -1 || z > CHUNK_SIZE || yy < 0 || yy >= CHUNK_HEIGHT) return;
      const i = pIdx(x, yy, z);
      if (onlyAir && out[i] !== B.AIR) return;
      out[i] = b;
    };
    if (kind === 'pine') {
      const h = 6 + Math.floor(r * 4);
      for (let i = 0; i < h; i++) set(lx, y + i, lz, B.PINE_LOG);
      for (let i = 2; i <= h; i++) {
        const rad = Math.max(0, Math.floor((h - i) / 2.5)) + ((h - i) % 2 === 0 ? 1 : 0);
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > rad + (rad > 1 ? 1 : 0)) continue;
          set(lx + dx, y + i, lz + dz, B.PINE_LEAVES, true);
        }
      }
      set(lx, y + h, lz, B.PINE_LEAVES, true);
      set(lx, y + h + 1, lz, B.PINE_LEAVES, true);
      return;
    }
    const log = kind === 'oak' ? B.OAK_LOG : B.BIRCH_LOG;
    const leaf = kind === 'oak' ? B.OAK_LEAVES : B.BIRCH_LEAVES;
    const h = (kind === 'oak' ? 4 : 5) + Math.floor(r * 3);
    for (let i = 0; i < h; i++) set(lx, y + i, lz, log);
    for (let yy = h - 3; yy <= h + 1; yy++) {
      const rad = yy >= h ? 1 : 2;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (rad === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && ((dx + dz + yy) & 1)) continue;
        if (yy === h + 1 && Math.abs(dx) + Math.abs(dz) > 1) continue;
        set(lx + dx, y + yy, lz + dz, leaf, true);
      }
    }
  }
}
