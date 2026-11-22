// Deterministic terrain generation. Pure functions of (seed, world position), so a
// chunk plus its border can be generated independently in any worker.
//
// The world is a SMOOTH density field sampled on a grid (one sample per metre):
//   density > 0  → solid (inside the ground), density < 0 → air / water.
// It is stored quantised as Uint8 (128 = surface) alongside a material id per grid
// point. The mesher turns it into smooth surfaces (Surface Nets).
// Trees are not voxels: they are returned as a list of placements and drawn as
// instanced low-poly models.
import { Simplex, hash3 } from './noise';
import { B } from './blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL } from './constants';

export const PAD = CHUNK_SIZE + 2;           // padded width (18): grid points -1..16
export const PAD_LAYER = PAD * PAD;
export const PAD_VOLUME = PAD_LAYER * CHUNK_HEIGHT;
/** Index into padded volume; x,z in [-1, 16]. */
export const pIdx = (x: number, y: number, z: number) => (x + 1) + (z + 1) * PAD + y * PAD_LAYER;

/** Density quantisation: stored = 128 + d * DENSITY_SCALE (d in metres). */
export const DENSITY_SCALE = 24;
export const encodeDensity = (d: number) => Math.max(0, Math.min(255, Math.round(128 + d * DENSITY_SCALE)));
export const decodeDensity = (v: number) => (v - 128) / DENSITY_SCALE;
export const SOLID_MIN = 128; // stored value >= 128 → solid

export const WATER_SURFACE_OFFSET = 0.4; // water plane sits this far above the top water grid point

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const enum SimpleBiome { Ocean, Beach, Meadow, Forest, PineForest, Snowy, Mountain }
export const enum TreeKind { Oak = 0, Birch = 1, Pine = 2 }
export const TREE_STRIDE = 6; // x, y, z, kind, scale, rotation

export interface Column { height: number; biome: SimpleBiome; }

export interface GeneratedChunk {
  density: Uint8Array;   // padded
  material: Uint8Array;  // padded
  trees: Float32Array;   // TREE_STRIDE floats per tree whose base lies in this chunk
}

export class TerrainGen {
  readonly seed: number;
  private nCont: Simplex; private nHill: Simplex; private nMount: Simplex;
  private nMask: Simplex; private nTemp: Simplex; private nMoist: Simplex;
  private nCaveA: Simplex; private nCaveB: Simplex; private nDetail: Simplex;

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
    this.nDetail = new Simplex(seed + 8);
  }

  /** Continuous surface height (metres) and biome of a column. */
  column(x: number, z: number): Column {
    const d2 = (x * x + z * z) / (260 * 260);
    // Continents; the area around the start is always land.
    const c = this.nCont.fbm2(x / 900, z / 900, 4) + 0.55 * Math.exp(-d2);
    const land = smooth(-0.22, 0.05, c);
    const hills = this.nHill.fbm2(x / 160, z / 160, 5);
    const mMask = smooth(0.05, 0.45, this.nMask.fbm2(x / 1100, z / 1100, 3)) * (1 - Math.exp(-d2 * 2));
    const ridge = this.nMount.ridged2(x / 380, z / 380, 5);
    let h = SEA_LEVEL - 16 + land * (19 + hills * 10) + mMask * land * ridge * 62;
    h += this.nDetail.noise2(x / 24, z / 24) * 0.8; // gentle small undulation
    // start clearing: gentle and flat-ish
    const clear = Math.exp(-d2 * 30);
    h = h * (1 - 0.6 * clear) + (SEA_LEVEL + 6) * 0.6 * clear;
    const height = Math.max(4, Math.min(CHUNK_HEIGHT - 8, h));

    const temp = this.nTemp.fbm2(x / 700, z / 700, 3) - (height - SEA_LEVEL) / 90;
    const moist = this.nMoist.fbm2(x / 600, z / 600, 3);
    let biome: SimpleBiome;
    if (height < SEA_LEVEL - 0.5) biome = SimpleBiome.Ocean;
    else if (height <= SEA_LEVEL + 1.5 && c < 0.25) biome = SimpleBiome.Beach;
    else if (height > SEA_LEVEL + 48) biome = SimpleBiome.Mountain;
    else if (temp < -0.35) biome = SimpleBiome.Snowy;
    else if (temp < -0.1) biome = SimpleBiome.PineForest;
    else if (moist > -0.05) biome = SimpleBiome.Forest;
    else biome = SimpleBiome.Meadow;
    return { height, biome };
  }

  /** Generate chunk (cx,cz) with a 1-sample border into padded arrays. */
  generate(cx: number, cz: number): GeneratedChunk {
    const density = new Uint8Array(PAD_VOLUME);
    const material = new Uint8Array(PAD_VOLUME);
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    for (let lz = -1; lz <= CHUNK_SIZE; lz++) {
      for (let lx = -1; lx <= CHUNK_SIZE; lx++) {
        const wx = x0 + lx, wz = z0 + lz;
        const col = this.column(wx, wz);
        this.fillColumn(density, material, lx, lz, wx, wz, col.height, col.biome);
      }
    }
    return { density, material, trees: this.placeTrees(x0, z0) };
  }

  private fillColumn(den: Uint8Array, mat: Uint8Array, lx: number, lz: number, wx: number, wz: number, h: number, biome: SimpleBiome) {
    const seed = this.seed;
    let top: number = B.GRASS, filler: number = B.DIRT;
    switch (biome) {
      case SimpleBiome.Ocean: top = h < SEA_LEVEL - 8 ? B.GRAVEL : B.SAND; filler = B.SAND; break;
      case SimpleBiome.Beach: top = B.SAND; filler = B.SAND; break;
      case SimpleBiome.Snowy: top = B.SNOW_GRASS; break;
      case SimpleBiome.Mountain: top = h > SEA_LEVEL + 58 ? B.SNOW : B.STONE; filler = B.STONE; break;
    }
    if (biome === SimpleBiome.Ocean && h > SEA_LEVEL - 6 && this.nDetail.noise2(wx / 9 + 300, wz / 9) > 0.45) top = B.CLAY;

    const yMax = Math.min(CHUNK_HEIGHT - 1, Math.ceil(h) + 6);
    for (let y = 0; y <= yMax; y++) {
      const i = pIdx(lx, y, lz);
      let d = h - y; // metres below the surface
      if (y === 0) d = 10;
      // caves (spaghetti tunnels), kept away from the surface for now
      if (y > 3 && d > 3) {
        const a = this.nCaveA.noise3(wx / 42, y / 26, wz / 42);
        const c = this.nCaveB.noise3(wx / 42, y / 26 + 50, wz / 42);
        const cave = (a * a + c * c - 0.011) * 140 + Math.max(0, 7 - d) * 1.5;
        if (cave < d) d = cave;
      }
      den[i] = encodeDensity(d);
      if (den[i] >= SOLID_MIN) {
        const depth = h - y;
        let b: number;
        if (y < 3 && hash3(wx, y, wz, seed) < 0.6) b = B.BEDROCK;
        else if (depth < 1.3) b = top;
        else if (depth < 4) b = filler;
        else {
          b = B.STONE;
          const cell = hash3(wx >> 2, y >> 2, wz >> 2, seed ^ 0xabc);
          if (cell < 0.035 && hash3(wx, y, wz, seed ^ 0x77) < 0.55) b = B.COAL_ORE;
          else if (y < 40 && cell > 0.975 && hash3(wx, y, wz, seed ^ 0x99) < 0.5) b = B.IRON_ORE;
        }
        mat[i] = b;
      } else if (y <= SEA_LEVEL && y > h - 1) {
        mat[i] = biome === SimpleBiome.Snowy && y === SEA_LEVEL ? B.ICE : B.WATER;
      } else if (y < 12 && d < 0 && h - y > 6) {
        mat[i] = B.LAVA; // lava pools at the bottom of deep caves
      }
    }
  }

  private placeTrees(x0: number, z0: number): Float32Array {
    const CELL = 6;
    const out: number[] = [];
    for (let gz = Math.floor(z0 / CELL); gz <= Math.floor((z0 + CHUNK_SIZE - 1) / CELL); gz++) {
      for (let gx = Math.floor(x0 / CELL); gx <= Math.floor((x0 + CHUNK_SIZE - 1) / CELL); gx++) {
        const tx = gx * CELL + hash3(gx, 1, gz, this.seed) * CELL;
        const tz = gz * CELL + hash3(gx, 2, gz, this.seed) * CELL;
        if (tx < x0 || tx >= x0 + CHUNK_SIZE || tz < z0 || tz >= z0 + CHUNK_SIZE) continue;
        const { height, biome } = this.column(tx, tz);
        if (height <= SEA_LEVEL + 0.8) continue;
        let density = 0;
        if (biome === SimpleBiome.Forest) density = 0.75;
        else if (biome === SimpleBiome.PineForest) density = 0.7;
        else if (biome === SimpleBiome.Meadow) density = 0.07;
        else if (biome === SimpleBiome.Snowy) density = 0.2;
        if (tx * tx + tz * tz < 14 * 14) density = 0; // keep the start clearing open
        if (hash3(gx, 7, gz, this.seed) >= density) continue;
        // don't plant on steep slopes
        const slope = Math.abs(this.column(tx + 1, tz).height - height) + Math.abs(this.column(tx, tz + 1).height - height);
        if (slope > 1.6) continue;
        const kind = biome === SimpleBiome.PineForest || biome === SimpleBiome.Snowy ? TreeKind.Pine
          : hash3(gx, 3, gz, this.seed) < 0.3 ? TreeKind.Birch : TreeKind.Oak;
        const scale = 0.8 + hash3(gx, 4, gz, this.seed) * 0.55;
        out.push(tx, height - 0.4, tz, kind, scale, hash3(gx, 5, gz, this.seed) * Math.PI * 2);
      }
    }
    return new Float32Array(out);
  }
}
