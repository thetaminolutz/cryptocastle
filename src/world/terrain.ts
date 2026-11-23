// Deterministic terrain generation: pure functions of (seed, world position), so a
// chunk plus its border can be generated independently in any worker.
//
// The world is a SMOOTH density field sampled on a 1 m grid (density > 0 = solid),
// stored quantised as Uint8 (128 = surface) with a material id per grid point.
// Biomes are blended by climate (temperature / moisture / weirdness) so terrain
// shapes flow into each other. Trees and plants are returned as instance lists.
import { Simplex, hash3 } from './noise';
import { B } from './blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL } from './constants';
import { Biome, BIOMES, CLIMATE_BIOMES, Plant } from './biomes';
import { villageAt, flattenWeight, isVillageHeightOk, VillageSite } from './villages';

export const PAD = CHUNK_SIZE + 2;           // padded width (18): grid points -1..16
export const PAD_LAYER = PAD * PAD;
export const PAD_VOLUME = PAD_LAYER * CHUNK_HEIGHT;
export const pIdx = (x: number, y: number, z: number) => (x + 1) + (z + 1) * PAD + y * PAD_LAYER;

export const DENSITY_SCALE = 24;
export const encodeDensity = (d: number) => Math.max(0, Math.min(255, Math.round(128 + d * DENSITY_SCALE)));
export const decodeDensity = (v: number) => (v - 128) / DENSITY_SCALE;
export const SOLID_MIN = 128;
export const WATER_SURFACE_OFFSET = 0.4;

export const TREE_STRIDE = 6;   // x, y, z, kind, scale, rotation
export const PLANT_STRIDE = 8;  // x, y, z, kind, scale, rotation, variation, biome

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export interface Column {
  height: number;       // surface height (m)
  biome: Biome;         // dominant biome (for materials, vegetation, weather)
  liquidLevel: number;  // liquid fills (height, liquidLevel]
  liquid: number;       // material of that liquid
  cliff: number;        // 0..1 coastal cliff strength
  floating: number;     // 0..1 floating-rocks weight
  crystal: number;      // 0..1 crystal-cave zone
  danger: number;
  village: number;      // 0..1 how much this column belongs to a village (flattened, no trees)
}

export interface GeneratedChunk {
  density: Uint8Array; material: Uint8Array;
  trees: Float32Array; plants: Float32Array;
}

export class TerrainGen {
  readonly seed: number;
  private n: Simplex[];

  constructor(seed: number) {
    this.seed = seed;
    this.n = Array.from({ length: 24 }, (_, i) => new Simplex(seed + i * 101));
  }

  /** Temperature, moisture, weirdness at a column; the start is always Moonlit Forest. */
  climate(x: number, z: number): [number, number, number] {
    const n = this.n;
    let t = n[4].fbm2(x / 900, z / 900, 3) * 1.6;
    let m = n[5].fbm2(x / 800, z / 800, 3) * 1.6;
    let w = n[9].fbm2(x / 1300, z / 1300, 2) * 1.9;
    const k = Math.exp(-(x * x + z * z) / (220 * 220));
    t = t * (1 - k) + 0.1 * k; m = m * (1 - k) + 0.35 * k; w = w * (1 - k);
    return [t, m, w];
  }

  biomeWeights(t: number, m: number, w: number): { b: Biome; w: number }[] {
    const out: { b: Biome; w: number }[] = [];
    let total = 0;
    for (const b of CLIMATE_BIOMES) {
      const c = BIOMES[b].climate!;
      const d2 = (t - c[0]) ** 2 + (m - c[1]) ** 2 + ((w - c[2]) * 1.2) ** 2;
      const wt = Math.exp(-d2 / 0.035);
      if (wt > 1e-4) { out.push({ b, w: wt }); total += wt; }
    }
    if (!out.length) return [{ b: Biome.SunnyMeadows, w: 1 }];
    for (const o of out) o.w /= total;
    out.sort((a, b) => b.w - a.w);
    return out.slice(0, 3);
  }

  /** Land height of one biome (before continent/mountain shaping). */
  private biomeHeight(b: Biome, x: number, z: number, hills: number): number {
    const n = this.n;
    switch (b) {
      case Biome.SunnyMeadows: return SEA_LEVEL + 4 + hills * 6;
      case Biome.MoonlitForest: return SEA_LEVEL + 5 + hills * 9;
      case Biome.DarkPine: return SEA_LEVEL + 7 + hills * 15;
      case Biome.MistySwamp: return SEA_LEVEL + 0.2 + n[10].fbm2(x / 40, z / 40, 3) * 2.2;
      case Biome.SunkenForest: return SEA_LEVEL - 2.4 + n[10].fbm2(x / 30, z / 30, 2) * 1.2;
      case Biome.FrozenTundra: return SEA_LEVEL + 4 + hills * 4;
      case Biome.HauntedMoor: return SEA_LEVEL + 6 + hills * 8 + Math.max(0, n[11].noise2(x / 30, z / 30) - 0.6) * 12;
      case Biome.MushroomGrove: return SEA_LEVEL + 5 + hills * 8 + n[11].noise2(x / 25, z / 25) * 2;
      case Biome.FloatingRocks: return SEA_LEVEL + 5 + hills * 7;
      case Biome.VolcanicAshlands: {
        const rugged = n[12].ridged2(x / 120, z / 120, 4);
        return SEA_LEVEL + 6 + hills * 8 + rugged * 14;
      }
      case Biome.RedDesert: {
        // mesas: terraced plateaus with soft edges, plus dunes
        const mesa = Math.max(0, n[13].fbm2(x / 260, z / 260, 4) + 0.1) * 60;
        const step = 7, f = mesa / step, fi = Math.floor(f);
        const terraced = (fi + smooth(0.75, 1, f - fi)) * step;
        const dunes = Math.abs(n[14].noise2(x / 45, z / 70)) * 3;
        return SEA_LEVEL + 4 + terraced + dunes + hills * 3;
      }
      default: return SEA_LEVEL + 5 + hills * 8;
    }
  }

  /** Column including village flattening. */
  column(x: number, z: number): Column {
    const c = this.rawColumn(x, z);
    const v = this.village(x, z);
    if (v) {
      const w = flattenWeight(v, x, z);
      if (w > 0) {
        c.height = c.height * (1 - w) + v.y * w;
        c.village = w;
        if (w > 0.5 && (c.biome === Biome.Beach || c.biome === Biome.Ocean)) c.biome = Biome.SunnyMeadows;
      }
    }
    return c;
  }

  private rawFn = (x: number, z: number) => {
    const c = this.rawColumn(x, z);
    const ok = isVillageHeightOk(c.height) && c.liquid === B.WATER && c.cliff < 0.2 && c.floating < 0.1 &&
      ![Biome.Ocean, Biome.Beach, Biome.SnowyMountains, Biome.MistySwamp, Biome.SunkenForest, Biome.VolcanicAshlands, Biome.CrystalCaves].includes(c.biome);
    return { height: c.height, ok };
  };
  village(x: number, z: number): VillageSite | null { return villageAt(x, z, this.seed, this.rawFn); }

  private rawColumn(x: number, z: number): Column {
    const n = this.n;
    const d2 = (x * x + z * z) / (260 * 260);
    const c = n[0].fbm2(x / 1000, z / 1000, 4) + 0.6 * Math.exp(-d2);
    const land = smooth(-0.22, 0.05, c);
    const hills = n[1].fbm2(x / 170, z / 170, 5);
    const [t, m, w] = this.climate(x, z);
    const weights = this.biomeWeights(t, m, w);
    let hLand = 0;
    for (const bw of weights) hLand += bw.w * this.biomeHeight(bw.b, x, z, hills);
    let h = SEA_LEVEL - 18 + land * (hLand - (SEA_LEVEL - 18));
    // coastal cliffs: land rises abruptly at the shore where the cliff noise says so
    const cliffNoise = smooth(0.1, 0.4, n[15].fbm2(x / 500, z / 500, 2)) * (1 - Math.exp(-d2 * 4));
    const step = smooth(0.02, 0.07, c);
    const cliff = cliffNoise * step;
    h += cliff * 14;
    // mountains
    const mMask = smooth(0.05, 0.45, n[3].fbm2(x / 1100, z / 1100, 3)) * (1 - Math.exp(-d2 * 2));
    const ridge = n[2].ridged2(x / 380, z / 380, 5);
    h += mMask * land * ridge * 66;
    h += n[8].noise2(x / 24, z / 24) * 0.7;
    // start clearing: gentle and flat-ish
    const clear = Math.exp(-d2 * 30);
    h = h * (1 - 0.65 * clear) + (SEA_LEVEL + 6) * 0.65 * clear;

    let biome = weights[0].b;
    // jitter the border a little so it isn't a clean line
    if (weights.length > 1 && weights[1].w > 0.3 && hash3(x, 9, z, this.seed) < (weights[1].w - 0.3) * 2.5) biome = weights[1].b;
    let liquidLevel = SEA_LEVEL, liquid: number = B.WATER;
    if (h > SEA_LEVEL + 46 + n[16].noise2(x / 60, z / 60) * 6) biome = Biome.SnowyMountains;
    else if (cliff > 0.35) biome = Biome.CoastalCliffs;
    else if (h < SEA_LEVEL - 0.6 && land < 0.9 && biome !== Biome.SunkenForest && biome !== Biome.MistySwamp) biome = Biome.Ocean;
    else if (h <= SEA_LEVEL + 1.6 && c < 0.2 && land < 0.98) biome = Biome.Beach;

    if (biome === Biome.FrozenTundra || biome === Biome.SnowyMountains) liquid = B.ICE;
    // lava pools in the ashlands
    if (biome === Biome.VolcanicAshlands) {
      const pool = n[17].fbm2(x / 70, z / 70, 3);
      if (pool > 0.3) { const dip = smooth(0.3, 0.5, pool) * 4; liquidLevel = Math.floor(h - 1); h -= dip; liquid = B.LAVA; }
    }
    const height = Math.max(4, Math.min(CHUNK_HEIGHT - 10, h));
    const floating = weights.find((e) => e.b === Biome.FloatingRocks)?.w ?? 0;
    const crystal = smooth(0.35, 0.55, n[18].fbm2(x / 380, z / 380, 2));
    return { height, biome, liquidLevel, liquid, cliff, floating, crystal, danger: 1 + Math.sqrt(x * x + z * z) / 450, village: 0 };
  }

  /** Generate chunk (cx,cz) with a 1-sample border into padded arrays. */
  generate(cx: number, cz: number): GeneratedChunk {
    const density = new Uint8Array(PAD_VOLUME);
    const material = new Uint8Array(PAD_VOLUME);
    const cols: Column[] = [];
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    for (let lz = -1; lz <= CHUNK_SIZE; lz++) for (let lx = -1; lx <= CHUNK_SIZE; lx++) {
      const col = this.column(x0 + lx, z0 + lz);
      cols[(lx + 1) + (lz + 1) * PAD] = col;
    }
    for (let lz = -1; lz <= CHUNK_SIZE; lz++) for (let lx = -1; lx <= CHUNK_SIZE; lx++) {
      const col = cols[(lx + 1) + (lz + 1) * PAD];
      // slope from neighbours (clamped to the padded area)
      const hx = cols[Math.min(PAD - 1, lx + 2) + (lz + 1) * PAD].height - cols[Math.max(0, lx) + (lz + 1) * PAD].height;
      const hz = cols[(lx + 1) + Math.min(PAD - 1, lz + 2) * PAD].height - cols[(lx + 1) + Math.max(0, lz) * PAD].height;
      const slope = Math.hypot(hx, hz) * 0.5;
      this.fillColumn(density, material, lx, lz, x0 + lx, z0 + lz, col, slope);
    }
    return { density, material, ...this.vegetation(cx, cz, density, material, cols) };
  }

  private fillColumn(den: Uint8Array, mat: Uint8Array, lx: number, lz: number, wx: number, wz: number, col: Column, slope: number) {
    const n = this.n, seed = this.seed;
    const h = col.height;
    const bd = BIOMES[col.biome];
    let top: number = bd.top, filler: number = bd.filler;
    if (col.biome === Biome.Ocean && h > SEA_LEVEL - 6 && n[19].noise2(wx / 9, wz / 9) > 0.45) top = B.CLAY;
    if (col.biome === Biome.Ocean && h < SEA_LEVEL - 9) top = B.GRAVEL;
    if (col.biome === Biome.SnowyMountains && h < SEA_LEVEL + 54) top = B.STONE;
    const steep = slope > 1.15;
    if (steep) { top = bd.steep; filler = bd.steep; }

    // ravines / canyons
    const rv = Math.abs(n[20].noise2(wx / 280, wz / 280) + n[21].noise2(wx / 60, wz / 60) * 0.05);
    const canyon = col.biome === Biome.RedDesert;
    const rvWidth = canyon ? 0.06 : 0.03;
    const startDist = Math.hypot(wx, wz);
    const awayFromStart = smooth(90, 170, startDist) * (1 - Math.min(1, col.village * 2));
    const ravine = rv < rvWidth && h > SEA_LEVEL + 3 && awayFromStart > 0 ? Math.sqrt(1 - rv / rvWidth) * (canyon ? 30 : 24) * awayFromStart : 0;
    const rvDist = rv * 180;
    // cave entrances: where this noise is high the surface protection drops
    const entrance = smooth(0.5, 0.72, n[22].fbm2(wx / 260, wz / 260, 2)) * awayFromStart;
    const crystal = col.crystal;

    const yMax = Math.min(CHUNK_HEIGHT - 1, Math.ceil(Math.max(h, col.liquidLevel)) + 6 + (col.floating > 0.2 ? 50 : 0));
    let localDepth = -1; // metres below the nearest surface above (handles islands/overhangs)
    for (let y = yMax; y >= 0; y--) {
      const i = pIdx(lx, y, lz);
      let d = h - y;
      if (y === 0) d = 10;
      // spaghetti caves (+ bigger chambers in crystal zones)
      if (y > 3 && d > 1.5) {
        const a = n[6].noise3(wx / 42, y / 26, wz / 42);
        const c = n[7].noise3(wx / 42, y / 26 + 50, wz / 42);
        const r = 0.011 + (y < 42 ? crystal * 0.025 : 0);
        const protect = Math.max(0, 7 - d) * 1.5 * (1 - entrance);
        const cave = (a * a + c * c - r) * 140 + protect;
        if (cave < d) d = cave;
      }
      if (ravine > 0 && y > h - ravine) {
        const half = 2.5 + (y - (h - ravine)) * (canyon ? 0.5 : 0.22);
        d = Math.min(d, rvDist - half);
      }
      // floating islands
      if (col.floating > 0.15 && y > 78 && y < 112) {
        const isl = n[23].noise3(wx / 38, y / 16, wz / 38) - 0.28 - Math.abs(y - 94) * 0.028;
        d = Math.max(d, isl * 30 * col.floating - (1 - col.floating) * 8);
      }
      const v = encodeDensity(d);
      den[i] = v;
      if (v >= SOLID_MIN) {
        localDepth++;
        let b: number;
        if (y < 3 && hash3(wx, y, wz, seed) < 0.6) b = B.BEDROCK;
        else if (y > h + 3) b = localDepth < 1 ? B.GRASS : localDepth < 3 ? B.DIRT : B.STONE; // floating island
        else if (y >= h - 3 && localDepth < 1.3) b = top;
        else if (h - y < 4 && localDepth < 4) b = filler;
        else {
          b = col.biome === Biome.VolcanicAshlands ? B.BASALT : col.biome === Biome.RedDesert && y > SEA_LEVEL ? B.RED_ROCK : B.STONE;
          b = this.ore(wx, y, wz, b, crystal);
        }
        mat[i] = b;
      } else {
        localDepth = -1;
        if (y <= col.liquidLevel && y > h - 1) mat[i] = col.liquid === B.ICE && y < col.liquidLevel ? B.WATER : col.liquid;
        else if (y < 12 && h - y > 6 && crystal < 0.5) mat[i] = B.LAVA;
      }
    }
  }

  private ore(x: number, y: number, z: number, base: number, crystal: number): number {
    const s = this.seed;
    const cell = hash3(x >> 2, y >> 2, z >> 2, s ^ 0xabc);
    const pick = hash3(x, y, z, s ^ 0x77);
    if (crystal > 0.3 && y < 40 && this.n[18].noise3(x / 9, y / 9, z / 9) > 0.45) return B.CRYSTAL;
    if (pick > 0.6) return base;
    if (y < 12 && cell > 0.9985) return B.MOONSTONE_ORE;
    if (y < 16 && cell > 0.996) return B.MITHRIL_ORE;
    if (y < 26 && cell > 0.99) return B.GOLD_ORE;
    if (y < 36 && cell > 0.982) return B.SILVER_ORE;
    if (y < 50 && cell > 0.965) return B.IRON_ORE;
    if (y > 28 && y < 72 && cell < 0.025) return B.COPPER_ORE;
    if (y < 80 && cell > 0.94 && cell < 0.965) return B.COAL_ORE;
    return base;
  }

  // ------------------------------------------------------------ vegetation
  private vegetation(cx: number, cz: number, den: Uint8Array, mat: Uint8Array, cols: Column[]) {
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    const seed = this.seed;
    const dAt = (x: number, y: number, z: number) => {
      // trilinear density in the padded volume (local coords)
      const xi = Math.max(-1, Math.min(CHUNK_SIZE - 1, Math.floor(x))), zi = Math.max(-1, Math.min(CHUNK_SIZE - 1, Math.floor(z)));
      const yi = Math.max(0, Math.min(CHUNK_HEIGHT - 2, Math.floor(y)));
      const fx = x - xi, fy = y - yi, fz = z - zi;
      const g = (a: number, b: number, c: number) => den[pIdx(xi + a, yi + b, zi + c)];
      const c00 = g(0, 0, 0) * (1 - fx) + g(1, 0, 0) * fx, c10 = g(0, 1, 0) * (1 - fx) + g(1, 1, 0) * fx;
      const c01 = g(0, 0, 1) * (1 - fx) + g(1, 0, 1) * fx, c11 = g(0, 1, 1) * (1 - fx) + g(1, 1, 1) * fx;
      return ((c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz) - 127.5;
    };
    /** surface below `from` at local (x,z): returns y, or -1 */
    const surface = (x: number, z: number, from: number) => {
      let prev = dAt(x, from, z);
      for (let y = from - 1; y > 1; y--) {
        const d = dAt(x, y, z);
        if (d > 0 && prev <= 0) return y + d / (d - prev);
        prev = d;
      }
      return -1;
    };
    const slopeAt = (x: number, y: number, z: number) => {
      const gx = dAt(x + 0.5, y, z) - dAt(x - 0.5, y, z), gz = dAt(x, y, z + 0.5) - dAt(x, y, z - 0.5);
      const gy = dAt(x, y + 0.5, z) - dAt(x, y - 0.5, z);
      return Math.abs(gy) / (Math.hypot(gx, gy, gz) || 1); // = normal.y
    };
    const colAt = (x: number, z: number) => cols[(Math.round(x) + 1) + (Math.round(z) + 1) * PAD];
    const matAt = (x: number, y: number, z: number) => mat[pIdx(Math.round(x), Math.max(0, Math.floor(y)), Math.round(z))];

    // ---- trees: one candidate per 6x6 m cell
    const trees: number[] = [];
    const CELL = 6;
    for (let gz = Math.floor(z0 / CELL); gz <= Math.floor((z0 + CHUNK_SIZE - 1) / CELL); gz++) {
      for (let gx = Math.floor(x0 / CELL); gx <= Math.floor((x0 + CHUNK_SIZE - 1) / CELL); gx++) {
        const tx = gx * CELL + hash3(gx, 1, gz, seed) * CELL, tz = gz * CELL + hash3(gx, 2, gz, seed) * CELL;
        const lx = tx - x0, lz = tz - z0;
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
        const col = colAt(lx, lz);
        const bd = BIOMES[col.biome];
        let dens = bd.treeDensity;
        if (tx * tx + tz * tz < 13 * 13 || col.village > 0.05) dens = 0; // keep the start clearing and villages open
        if (hash3(gx, 7, gz, seed) >= dens || !bd.trees.length) continue;
        const y = surface(lx, lz, Math.min(CHUNK_HEIGHT - 2, Math.ceil(col.height) + 8));
        if (y < 0) continue;
        const sunken = col.biome === Biome.SunkenForest || col.biome === Biome.MistySwamp;
        if (y < SEA_LEVEL + 0.6 && !sunken) continue;
        if (slopeAt(lx, y, lz) < 0.8) continue;
        const total = bd.trees.reduce((s, t) => s + t[1], 0);
        let r = hash3(gx, 3, gz, seed) * total, kind = bd.trees[0][0];
        for (const [k, wgt] of bd.trees) { if (r < wgt) { kind = k; break; } r -= wgt; }
        const scale = 0.8 + hash3(gx, 4, gz, seed) * 0.5;
        trees.push(tx, y - 0.25, tz, kind, scale, hash3(gx, 5, gz, seed) * Math.PI * 2);
      }
    }

    // ---- plants: jittered samples per biome density
    const plants: number[] = [];
    let k = 0;
    const centre = colAt(8, 8);
    const table = BIOMES[centre.biome].plants;
    for (const [kind, perM2] of table) {
      const count = Math.round(perM2 * CHUNK_SIZE * CHUNK_SIZE);
      for (let i = 0; i < count; i++, k++) {
        const lx = hash3(cx, k, cz, seed ^ 0x51) * CHUNK_SIZE, lz = hash3(cx, k, cz, seed ^ 0x52) * CHUNK_SIZE;
        const col = colAt(lx, lz);
        if (col.biome !== centre.biome && hash3(cx, k, cz, seed ^ 0x53) < 0.5) continue;
        const wx = x0 + lx, wz = z0 + lz;
        const d2s = wx * wx + wz * wz;
        if (col.village > 0.3 && kind !== Plant.Grass && kind !== Plant.Flower) continue;
        if (d2s < 9 || (d2s < 14 * 14 && kind !== Plant.Grass && kind !== Plant.Flower && kind !== Plant.Moonpetal && kind !== Plant.Mushroom)) continue;
        const y = surface(lx, lz, Math.min(CHUNK_HEIGHT - 2, Math.ceil(col.height) + 6));
        if (y < 0) continue;
        const m = matAt(lx, y - 0.5, lz);
        const ny = slopeAt(lx, y, lz);
        const wet = y < SEA_LEVEL + 0.45;
        if (kind === Plant.Reeds) { if (y > SEA_LEVEL + 1.2 || y < SEA_LEVEL - 0.9) continue; }
        else if (wet && kind !== Plant.Rock) continue;
        if (kind === Plant.Grass || kind === Plant.TallGrass || kind === Plant.Flower || kind === Plant.Fern || kind === Plant.Moonpetal) {
          if (!(m === B.GRASS || m === B.DRY_GRASS || m === B.FOREST_FLOOR || m === B.SWAMP_GRASS || m === B.TUNDRA || m === B.MYCELIUM)) continue;
          if (ny < 0.78) continue;
        } else if (ny < 0.6) continue;
        const scale = 0.7 + hash3(cx, k, cz, seed ^ 0x54) * 0.6;
        plants.push(wx, y - 0.05, wz, kind, scale, hash3(cx, k, cz, seed ^ 0x55) * Math.PI * 2, hash3(cx, k, cz, seed ^ 0x56), col.biome);
      }
    }
    // crystals on cave floors in crystal zones
    if (centre.crystal > 0.3) {
      for (let i = 0; i < 40; i++, k++) {
        const lx = hash3(cx, k, cz, seed ^ 0x61) * CHUNK_SIZE, lz = hash3(cx, k, cz, seed ^ 0x62) * CHUNK_SIZE;
        let prev = dAt(lx, 45, lz);
        for (let y = 44; y > 4; y--) {
          const d = dAt(lx, y, lz);
          if (d > 0 && prev <= 0) {
            if (hash3(cx, k + y, cz, seed ^ 0x63) < 0.5)
              plants.push(x0 + lx, y + d / (d - prev) - 0.1, z0 + lz, Plant.Crystal, 0.6 + hash3(cx, k, cz, seed) * 0.9, hash3(cx, k, cz, seed ^ 3) * 6.28, hash3(k, cx, cz, seed), Biome.CrystalCaves);
            break;
          }
          prev = d;
        }
      }
    }
    return { trees: new Float32Array(trees), plants: new Float32Array(plants) };
  }
}
