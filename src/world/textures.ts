// Procedural, seamlessly tiling 128x128 textures generated at startup (no image files).
// Albedo layers carry height (terrain) or alpha (leaf cards) in A; a matching normal
// map layer is derived from the height. Both are packed into WebGL2 texture arrays
// with mipmaps + anisotropic filtering.
import * as THREE from 'three';
import { mulberry32 } from './noise';

export const TEX_SIZE = 128;

type RGB = [number, number, number];
interface Px { c: RGB; h: number; a?: number }
type Painter = (u: number, v: number) => Px;

// ---------------------------------------------------------------- tileable noise
const ihash = (x: number, y: number, s: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const mod = (a: number, p: number) => ((a % p) + p) % p;

/** Tileable value noise; u,v in [0,1), `p` lattice cells per tile. Returns 0..1. */
function vnoise(u: number, v: number, p: number, s: number): number {
  const x = u * p, y = v * p;
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = fade(x - xi), fy = fade(y - yi);
  const x0 = mod(xi, p), x1 = mod(xi + 1, p), y0 = mod(yi, p), y1 = mod(yi + 1, p);
  const a = ihash(x0, y0, s), b = ihash(x1, y0, s), c = ihash(x0, y1, s), d = ihash(x1, y1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(u: number, v: number, p: number, oct: number, s: number, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) { sum += vnoise(u, v, p << o, s + o * 31) * amp; norm += amp; amp *= gain; }
  return sum / norm;
}
/** Tileable Worley noise: distance to nearest / second nearest feature, and cell id. */
function worley(u: number, v: number, p: number, s: number, jitter = 0.9) {
  const x = u * p, y = v * p;
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const hx = mod(cx, p), hy = mod(cy, p);
    const px = cx + 0.5 + (ihash(hx, hy, s) - 0.5) * jitter;
    const py = cy + 0.5 + (ihash(hx, hy, s + 7) - 0.5) * jitter;
    const d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; id = ihash(hx, hy, s + 13); } else if (d < f2) f2 = d;
  }
  return { f1, f2, id };
}

const hex = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const sat = (x: number) => Math.max(0, Math.min(1, x));
const sstep = (e0: number, e1: number, x: number) => { const t = sat((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- painters
function soil(base: RGB, dark: RGB, s: number, pebbles = 0.4): Painter {
  return (u, v) => {
    const n = fbm(u, v, 4, 5, s);
    let c = mix(dark, base, sstep(0.25, 0.75, n));
    let h = n * 0.5;
    const w = worley(u, v, 14, s + 3);
    if (pebbles > 0 && w.f1 < 0.28 * pebbles + 0.05 && w.id < pebbles) {
      c = mix(c, mix(hex(0x6e665c), hex(0x9a9286), w.id), 0.75);
      h += (0.33 - w.f1) * 1.2;
    }
    c = mul(c, 0.9 + fbm(u, v, 32, 2, s + 9) * 0.2);
    return { c, h: sat(h) };
  };
}

function grass(light: RGB, dark: RGB, dry: RGB, s: number): Painter {
  return (u, v) => {
    const big = fbm(u, v, 3, 4, s);
    const blades = fbm(u * 1, v, 48, 2, s + 4) * 0.6 + vnoise(u, v, 96, s + 5) * 0.4;
    let c = mix(dark, light, sstep(0.2, 0.8, blades));
    c = mix(c, dry, sstep(0.55, 0.8, big) * 0.6);
    const soilSpot = sstep(0.68, 0.8, fbm(u, v, 6, 3, s + 8));
    c = mix(c, hex(0x5a4632), soilSpot * 0.7);
    return { c, h: blades * 0.7 + 0.15 };
  };
}

function rock(base: RGB, dark: RGB, s: number, crackAmt = 1, strata = 0): Painter {
  return (u, v) => {
    const n = fbm(u, v, 4, 5, s);
    let c = mix(dark, base, sstep(0.2, 0.8, n));
    let h = n;
    if (strata > 0) {
      const band = Math.sin((v + fbm(u, v, 4, 3, s + 2) * 0.12) * Math.PI * 2 * strata);
      c = mix(c, mul(c, 0.72), sstep(0.3, 0.9, band) * 0.8);
      h += band * 0.15;
    }
    // sparse, irregular cracks (warped cells, only some edges)
    const wu = u + (fbm(u, v, 6, 2, s + 12) - 0.5) * 0.12, wv = v + (fbm(u, v, 6, 2, s + 13) - 0.5) * 0.12;
    const w = worley(mod(wu, 1), mod(wv, 1), 4, s + 11);
    const crack = sstep(0.035 * crackAmt, 0.0, w.f2 - w.f1) * (w.id > 0.45 ? 1 : 0.25);
    c = mix(c, mul(dark, 0.6), crack * 0.7);
    h -= crack * 0.35;
    // lichen / weathering speckles
    c = mix(c, mul(base, 1.15), sstep(0.62, 0.75, fbm(u, v, 10, 3, s + 14)) * 0.35);
    c = mul(c, 0.92 + vnoise(u, v, 64, s + 5) * 0.16);
    return { c, h: sat(h * 0.8 + 0.1) };
  };
}

function ore(spot: RGB, s: number, shine = 0): Painter {
  const stone = rock(hex(0x8a8784), hex(0x55524f), s);
  return (u, v) => {
    const p = stone(u, v);
    const w = worley(u, v, 7, s + 21, 1);
    const blob = sstep(0.3, 0.18, w.f1) * (w.id > 0.35 ? 1 : 0);
    if (blob > 0) {
      const sparkle = shine * vnoise(u, v, 64, s + 3);
      p.c = mix(p.c, mix(spot, [255, 255, 240], sparkle * 0.5), blob);
      p.h = sat(p.h + blob * 0.35);
    }
    return p;
  };
}

function bark(base: RGB, dark: RGB, s: number, birch = false): Painter {
  return (u, v) => {
    // strongly stretched vertically → bark fibres
    const fib = fbm(u, v * 0.15, 24, 3, s);
    const ridge = Math.abs(fbm(u, v * 0.25, 8, 3, s + 3) - 0.5) * 2;
    let c = mix(dark, base, sstep(0.2, 0.9, fib * 0.6 + ridge * 0.6));
    let h = fib * 0.5 + ridge * 0.5;
    if (birch) {
      c = mix(hex(0xe6e2d8), hex(0xc8c2b4), fib);
      const len = vnoise(u * 0.5, v, 10, s + 9);
      if (len > 0.72 && fbm(u, v, 30, 2, s + 4) > 0.45) { c = hex(0x2c2824); h -= 0.3; }
    }
    return { c, h: sat(h) };
  };
}

interface Leaf { x: number; y: number; ang: number; len: number; wid: number; col: RGB }
function leafCard(light: RGB, dark: RGB, s: number, count = 60, len = 0.11, wid = 0.045, spread = 0.42): Painter {
  const r = mulberry32(s);
  const leaves: Leaf[] = [];
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
    leaves.push({ x: 0.5 + Math.cos(a) * d, y: 0.5 + Math.sin(a) * d, ang: r() * Math.PI * 2, len: len * (0.7 + r() * 0.6), wid: wid * (0.7 + r() * 0.6), col: mix(dark, light, r()) });
  }
  return (u, v) => {
    for (let i = leaves.length - 1; i >= 0; i--) {
      const l = leaves[i];
      const dx = u - l.x, dy = v - l.y;
      const ca = Math.cos(l.ang), sa = Math.sin(l.ang);
      const lx = (dx * ca + dy * sa) / l.len, ly = (-dx * sa + dy * ca) / l.wid;
      if (lx < -1 || lx > 1) continue;
      const w = 1 - lx * lx;
      if (Math.abs(ly) > w) continue;
      const shade = 0.75 + 0.25 * (1 - Math.abs(ly) / w) - (Math.abs(ly) < 0.08 ? 0.12 : 0);
      return { c: mul(l.col, shade * (0.85 + 0.3 * (lx * 0.5 + 0.5))), h: shade, a: 1 };
    }
    return { c: dark, h: 0, a: 0 };
  };
}

function needleCard(light: RGB, dark: RGB, s: number): Painter {
  const r = mulberry32(s);
  const twigs: { x0: number; y0: number; ang: number }[] = [];
  for (let i = 0; i < 9; i++) twigs.push({ x0: 0.1 + r() * 0.8, y0: 0.15 + r() * 0.7, ang: -0.4 + r() * 0.8 });
  return (u, v) => {
    for (const t of twigs) {
      // twig runs horizontally; needles are short strokes off it
      const dx = u - t.x0, dy = v - t.y0;
      const along = dx * Math.cos(t.ang) + dy * Math.sin(t.ang);
      const across = -dx * Math.sin(t.ang) + dy * Math.cos(t.ang);
      if (along < -0.35 || along > 0.35) continue;
      const taper = 1 - Math.abs(along) / 0.35;
      if (Math.abs(across) < 0.006) return { c: hex(0x3a2a1a), h: 0.6, a: 1 };
      const needle = (Math.abs(across) < 0.09 * taper) && (Math.abs(((along * 70 + Math.abs(across) * 40) % 1) - 0.5) < 0.22);
      if (needle) return { c: mix(dark, light, Math.abs(across) / 0.09), h: 0.8, a: 1 };
    }
    return { c: dark, h: 0, a: 0 };
  };
}

function frondCard(light: RGB, dark: RGB, density = 34): Painter {
  return (u, v) => {
    const x = u - 0.5;
    if (Math.abs(x) < 0.012 && v > 0.02 && v < 0.98) return { c: mul(light, 0.8), h: 0.7, a: 1 };
    const taper = Math.sin(Math.PI * v);
    const reach = 0.46 * taper;
    if (Math.abs(x) > reach) return { c: dark, h: 0, a: 0 };
    const leaflet = ((v * density + Math.abs(x) * 1.2) % 1);
    if (leaflet < 0.62) return { c: mix(dark, light, 1 - Math.abs(x) / 0.46), h: 0.8, a: 1 };
    return { c: dark, h: 0, a: 0 };
  };
}

function strandCard(light: RGB, dark: RGB, s: number): Painter {
  const r = mulberry32(s);
  const strands = Array.from({ length: 14 }, () => ({ x: 0.08 + r() * 0.84, len: 0.5 + r() * 0.48 }));
  return (u, v) => {
    for (const st of strands) {
      if (v > st.len) continue;
      const sway = Math.sin(v * 6 + st.x * 10) * 0.015;
      const dx = Math.abs(u - st.x - sway);
      const leafy = ((v * 40) % 1) < 0.7;
      if (dx < 0.004 || (leafy && dx < 0.022 * (1 - v / st.len * 0.5))) return { c: mix(dark, light, 1 - v), h: 0.7, a: 1 };
    }
    return { c: dark, h: 0, a: 0 };
  };
}

/** Turn an alpha card into an opaque "dense foliage" texture. */
function opaque(card: Painter, back: RGB): Painter {
  return (u, v) => { const p = card(u, v); return p.a ? { c: p.c, h: p.h } : { c: mul(back, 0.8 + vnoise(u, v, 32, 5) * 0.4), h: 0.1 }; };
}

const PAINTERS: Record<string, Painter> = {
  grass: grass(hex(0x5e8a30), hex(0x2a5018), hex(0x8a8a40), 11),
  dry_grass: grass(hex(0xb4a45a), hex(0x6a6030), hex(0xc8b878), 12),
  swamp_grass: grass(hex(0x6a7a34), hex(0x2e3a18), hex(0x4a4a2a), 13),
  tundra: (u, v) => {
    const g = grass(hex(0x8a9a6a), hex(0x4a5a3a), hex(0x9a9070), 14)(u, v);
    const snow = sstep(0.55, 0.62, fbm(u, v, 4, 4, 15));
    g.c = mix(g.c, hex(0xeef2f8), snow); g.h = g.h * (1 - snow) + snow * 0.6;
    return g;
  },
  mycelium: (u, v) => {
    const p = soil(hex(0x6a5070), hex(0x3a2840), 16, 0.1)(u, v);
    const w = worley(u, v, 18, 17);
    if (w.f1 < 0.12 && w.id > 0.7) p.c = mix(p.c, hex(0xc8f0ff), 0.85);
    return p;
  },
  forest_floor: (u, v) => {
    const p = soil(hex(0x4e3c2a), hex(0x2a2018), 18, 0.05)(u, v);
    const w = worley(u, v, 22, 19, 1);
    if (w.f1 < 0.24 && w.id > 0.72) {
      const leafCol = w.id > 0.9 ? hex(0x7a4a22) : w.id > 0.65 ? hex(0x5a4228) : hex(0x3e4a26);
      p.c = mix(p.c, mul(leafCol, 0.85 + vnoise(u, v, 64, 20) * 0.3), sstep(0.24, 0.12, w.f1) * 0.6); p.h += 0.12;
    }
    return p;
  },
  dirt: soil(hex(0x7a5a3c), hex(0x4a3422), 20),
  mud: (u, v) => {
    const p = soil(hex(0x4e3c2a), hex(0x2a2018), 21, 0.1)(u, v);
    const wet = sstep(0.5, 0.65, fbm(u, v, 5, 4, 22));
    p.c = mix(p.c, hex(0x2a2a22), wet * 0.6); p.h *= 1 - wet * 0.8;
    return p;
  },
  stone: rock(hex(0x7c7974), hex(0x4a4642), 23, 0.7),
  cliff_rock: rock(hex(0x8a8276), hex(0x4e4840), 24, 1.3, 5),
  moss_stone: (u, v) => {
    const p = rock(hex(0x8e8b86), hex(0x5a5652), 25)(u, v);
    const moss = sstep(0.45, 0.6, fbm(u, v, 5, 5, 26));
    p.c = mix(p.c, mix(hex(0x3a5a22), hex(0x6a8a3a), vnoise(u, v, 40, 27)), moss); p.h += moss * 0.2;
    return p;
  },
  basalt: (u, v) => {
    const w = worley(u, v, 5, 28, 0.5);
    const edge = sstep(0.08, 0.0, w.f2 - w.f1);
    const c = mix(mul(hex(0x34302e), 0.8 + w.id * 0.4), hex(0x141212), edge);
    return { c: mul(c, 0.9 + fbm(u, v, 16, 3, 29) * 0.2), h: 0.7 - edge * 0.6 };
  },
  ash: (u, v) => {
    const p = soil(hex(0x5a5654), hex(0x2c2a2a), 30, 0.2)(u, v);
    if (vnoise(u, v, 64, 31) > 0.985 && fbm(u, v, 4, 2, 32) > 0.55) p.c = hex(0xd85a1a);
    return p;
  },
  sand: (u, v) => {
    const n = fbm(u, v, 8, 4, 32);
    const ripple = Math.sin((u * 7 + fbm(u, v, 3, 2, 33) * 1.5) * Math.PI * 2) * 0.5 + 0.5;
    const c = mul(mix(hex(0xc8b080), hex(0xe2cfa0), n), 0.92 + ripple * 0.1 + vnoise(u, v, 128, 34) * 0.08);
    return { c, h: ripple * 0.4 + n * 0.3 };
  },
  red_sand: (u, v) => {
    const n = fbm(u, v, 8, 4, 35);
    const ripple = Math.sin((u * 6 + fbm(u, v, 3, 2, 36) * 1.5) * Math.PI * 2) * 0.5 + 0.5;
    return { c: mul(mix(hex(0x96603e), hex(0xbc8a62), n), 0.9 + ripple * 0.12), h: ripple * 0.4 + n * 0.3 };
  },
  red_rock: rock(hex(0xa06848), hex(0x5e3a28), 37, 0.8, 6),
  snow: (u, v) => {
    const n = fbm(u, v, 4, 5, 38);
    const c = mix(hex(0xc8d4e4), hex(0xf4f8ff), sstep(0.2, 0.8, n));
    return { c: vnoise(u, v, 128, 39) > 0.97 ? [255, 255, 255] : c, h: n * 0.6 };
  },
  ice: (u, v) => {
    const w = worley(u, v, 5, 40);
    const crack = sstep(0.04, 0, w.f2 - w.f1);
    return { c: mix(mix(hex(0x9cc4e4), hex(0xd8ecff), fbm(u, v, 4, 4, 41)), hex(0xf0f8ff), crack), h: 0.5 - crack * 0.3 };
  },
  gravel: (u, v) => {
    const w = worley(u, v, 16, 42, 1);
    const stoneCol = mix(hex(0x5a5550), hex(0xa8a098), w.id);
    const c = mix(stoneCol, hex(0x3a3632), sstep(0.32, 0.5, w.f1));
    return { c, h: sat(0.8 - w.f1 * 1.6) };
  },
  clay: soil(hex(0x9a9aa6), hex(0x6a6a78), 43, 0.05),
  crystal: (u, v) => {
    const w = worley(u, v, 4, 44, 1);
    const facet = (w.f2 - w.f1);
    const c = mix(hex(0x5a3a9a), hex(0x6ae0ff), sstep(0, 0.4, facet) * (0.5 + w.id * 0.5));
    return { c: mix(c, [240, 250, 255], sstep(0.03, 0, facet)), h: sat(facet * 2) };
  },
  ore_coal: ore(hex(0x1c1a1a), 45),
  ore_copper: ore(hex(0xc87a3a), 46, 0.5),
  ore_iron: ore(hex(0xc8a080), 47, 0.3),
  ore_silver: ore(hex(0xd8dce4), 48, 1),
  ore_gold: ore(hex(0xf0c040), 49, 1),
  ore_mithril: ore(hex(0x8ae8f0), 50, 1),
  ore_moonstone: ore(hex(0xd8d0ff), 51, 1),
  lava: (u, v) => {
    const w = worley(u, v, 6, 52);
    const crack = sstep(0.18, 0.0, w.f2 - w.f1);
    const crust = mix(hex(0x3a1a10), hex(0x6a2a14), fbm(u, v, 8, 3, 53));
    return { c: mix(crust, mix(hex(0xff5a10), hex(0xffd040), crack), crack), h: 1 - crack };
  },
  bark_oak: bark(hex(0x6a5038), hex(0x2e2216), 54),
  bark_pine: bark(hex(0x6a4630), hex(0x2a1a12), 55),
  bark_birch: bark(hex(0xdedad0), hex(0xa8a294), 56, true),
  bark_dead: bark(hex(0x6a6258), hex(0x34302a), 57),
  bark_palm: (u, v) => {
    const ring = Math.abs(((v * 8) % 1) - 0.5) * 2;
    return { c: mix(hex(0x6a5a40), hex(0xa08a62), ring * fbm(u, v, 12, 3, 58)), h: ring };
  },
  wood_end: (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5);
    const ring = Math.sin(d * 90 + fbm(u, v, 4, 3, 59) * 6) * 0.5 + 0.5;
    return { c: d > 0.45 ? hex(0x4a3422) : mix(hex(0x9a7a50), hex(0xc8a474), ring), h: ring * 0.4 };
  },
  leaves_oak: leafCard(hex(0x6a9a3a), hex(0x2a4a18), 60),
  leaves_birch: leafCard(hex(0x9ac050), hex(0x4a7024), 61, 70, 0.08, 0.04),
  leaves_dark: leafCard(hex(0x3a5a2a), hex(0x142414), 62),
  leaves_willow: strandCard(hex(0x8aa84a), hex(0x3a5a20), 63),
  needles: needleCard(hex(0x3a6a3a), hex(0x142a18), 64),
  foliage_mass: opaque(leafCard(hex(0x4a7a2a), hex(0x1a3010), 160, 120, 0.09, 0.04, 0.6), hex(0x14240c)),
  needle_mass: opaque(needleCard(hex(0x2a5a30), hex(0x0e2012), 161), hex(0x0c1a0e)),
  frond: frondCard(hex(0x7aa040), hex(0x2a5018)),
  fern: frondCard(hex(0x5a9a3a), hex(0x1a4a18), 22),
  mushroom_cap: (u, v) => {
    const w = worley(u, v, 6, 65);
    const spot = sstep(0.22, 0.16, w.f1) * (w.id > 0.4 ? 1 : 0);
    return { c: mix(mix(hex(0x5a2a6a), hex(0x8a3a8a), fbm(u, v, 4, 3, 66)), hex(0xd8f4ff), spot), h: spot };
  },
  mushroom_stem: bark(hex(0xd8d0c0), hex(0xa09888), 67),
  cactus: (u, v) => {
    const rib = Math.abs(Math.sin(u * Math.PI * 8));
    const spine = vnoise(u, v, 64, 68) > 0.9 ? 1 : 0;
    return { c: spine ? hex(0xe8e0b0) : mix(hex(0x2a5a2a), hex(0x5a8a3a), rib), h: rib * 0.6 + spine * 0.4 };
  },
  planks: (u, v) => {
    const board = Math.floor(v * 4);
    const grain = fbm(u * 0.2 + board * 0.3, v, 24, 3, 69 + board);
    const seam = sstep(0.03, 0, Math.abs((v * 4) % 1 - 0.0)) + sstep(0.97, 1, (v * 4) % 1);
    return { c: mul(mix(hex(0x8a6038), hex(0xb48a58), grain), 1 - seam * 0.5), h: 0.6 - seam * 0.5 };
  },
  cobble: (u, v) => {
    const w = worley(u, v, 5, 70, 0.7);
    const edge = sstep(0.12, 0.02, w.f2 - w.f1);
    return { c: mix(mul(mix(hex(0x7a7670), hex(0xa09a92), w.id), 0.9 + fbm(u, v, 16, 3, 71) * 0.2), hex(0x2a2826), edge), h: 0.8 - edge * 0.7 };
  },
  white: () => ({ c: [235, 235, 235], h: 0.5 }),
  shingles: (u, v) => {
    const row = Math.floor(v * 8), off = row % 2 ? 0.5 : 0;
    const x = (u * 6 + off) % 1, y = (v * 8) % 1;
    const tile = ihash(Math.floor(u * 6 + off), row, 90);
    const edge = sstep(0.12, 0.0, y) + sstep(0.06, 0, Math.min(x, 1 - x)) * 0.6;
    const c = mul(mix(hex(0x5a3a2a), hex(0x7a4a32), tile), (0.75 + y * 0.35) * (0.9 + fbm(u, v, 16, 2, 91) * 0.2));
    return { c: mix(c, hex(0x1e140e), Math.min(1, edge)), h: y * 0.8 - edge * 0.4 + 0.2 };
  },
  thatch: (u, v) => {
    const str = fbm(u * 0.15, v, 40, 3, 92);
    const band = Math.abs(((v * 5) % 1) - 0.5) * 2;
    return { c: mul(mix(hex(0x8a7440), hex(0xc8a868), str), 0.75 + band * 0.3), h: str * 0.6 + band * 0.4 };
  },
  stone_brick: (u, v) => {
    const row = Math.floor(v * 4), off = row % 2 ? 0.25 : 0;
    const x = (u * 2 + off) % 1, y = (v * 4) % 1;
    const id = ihash(Math.floor(u * 2 + off), row, 93);
    const mortar = sstep(0.06, 0.0, Math.min(y, 1 - y)) + sstep(0.04, 0, Math.min(x, 1 - x));
    const c = mul(mix(hex(0x6e6a64), hex(0x9a948a), id), 0.85 + fbm(u, v, 12, 3, 94) * 0.3);
    return { c: mix(c, hex(0x3a3632), Math.min(1, mortar)), h: 0.8 - Math.min(1, mortar) * 0.7 };
  },
  fabric: (u, v) => {
    const w = (Math.sin(u * Math.PI * 128) * Math.sin(v * Math.PI * 128)) * 0.5 + 0.5;
    return { c: mul([210, 205, 195], 0.85 + w * 0.15 + fbm(u, v, 8, 2, 95) * 0.1), h: w * 0.4 };
  },
  water_normal: (u, v) => ({ c: [128, 128, 255], h: fbm(u, v, 4, 4, 72) * 0.6 + fbm(u, v, 12, 2, 73) * 0.4 }),
  rock_moss_top: (u, v) => {
    const p = rock(hex(0x8a8680), hex(0x55514c), 74)(u, v);
    const moss = sstep(0.4, 0.55, fbm(u, v, 4, 4, 75));
    p.c = mix(p.c, hex(0x4a6a2a), moss);
    return p;
  }
};

export const LAYER_NAMES = Object.keys(PAINTERS);
export const LAYER: Record<string, number> = Object.fromEntries(LAYER_NAMES.map((n, i) => [n, i]));
/** Layers that use alpha (leaf cards) instead of height in A. */
const ALPHA_LAYERS = new Set(['leaves_oak', 'leaves_birch', 'leaves_dark', 'leaves_willow', 'needles', 'frond', 'fern']);

export interface TextureSet { albedo: THREE.DataArrayTexture; normal: THREE.DataArrayTexture; clouds: THREE.DataTexture; }

export function createTextures(anisotropy: number): TextureSet {
  const S = TEX_SIZE, L = LAYER_NAMES.length;
  const albedo = new Uint8Array(S * S * 4 * L);
  const normal = new Uint8Array(S * S * 4 * L);
  const height = new Float32Array(S * S);
  LAYER_NAMES.forEach((name, layer) => {
    const paint = PAINTERS[name];
    const alphaLayer = ALPHA_LAYERS.has(name);
    const base = layer * S * S * 4;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const p = paint((x + 0.5) / S, (y + 0.5) / S);
      const o = base + (y * S + x) * 4;
      albedo[o] = Math.max(0, Math.min(255, p.c[0]));
      albedo[o + 1] = Math.max(0, Math.min(255, p.c[1]));
      albedo[o + 2] = Math.max(0, Math.min(255, p.c[2]));
      albedo[o + 3] = Math.round((alphaLayer ? (p.a ?? 1) : sat(p.h)) * 255);
      height[y * S + x] = p.h;
    }
    // normal map from height (Sobel, wrapping)
    const strength = name === 'water_normal' ? 3 : alphaLayer ? 1.5 : 2.5;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const hgt = (dx: number, dy: number) => height[mod(y + dy, S) * S + mod(x + dx, S)];
      const nx = (hgt(-1, -1) + 2 * hgt(-1, 0) + hgt(-1, 1) - hgt(1, -1) - 2 * hgt(1, 0) - hgt(1, 1)) * strength;
      const ny = (hgt(-1, -1) + 2 * hgt(0, -1) + hgt(1, -1) - hgt(-1, 1) - 2 * hgt(0, 1) - hgt(1, 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const o = base + (y * S + x) * 4;
      normal[o] = Math.round((nx / len * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
    }
  });
  const make = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataArrayTexture(data, S, S, L);
    t.format = THREE.RGBAFormat;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = anisotropy;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { albedo: make(albedo, true), normal: make(normal, false), clouds: cloudTexture() };
}

/** 256x256 tileable fbm used by the sky for clouds. */
function cloudTexture(): THREE.DataTexture {
  const S = 256;
  const d = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const o = (y * S + x) * 4;
    d[o] = Math.round(fbm(u, v, 4, 6, 101, 0.55) * 255);
    d[o + 1] = Math.round(fbm(u, v, 8, 4, 102) * 255);
    d[o + 2] = Math.round(worley(u, v, 6, 103).f1 * 200);
    d[o + 3] = 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
