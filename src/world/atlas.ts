// Procedurally painted 16x16 pixel texture atlas. No image files needed.
import * as THREE from 'three';
import { mulberry32 } from './noise';
import { ATLAS_PX, ATLAS_TILES, TILE_PX } from './constants';
import { TILE_NAMES, TileName } from './tiles';

type RGB = [number, number, number];
type Px = (x: number, y: number, set: (c: RGB, a?: number) => void, r: () => number) => void;

const jitter = (c: RGB, r: () => number, amt: number): RGB => {
  const k = 1 + (r() - 0.5) * amt;
  return [c[0] * k, c[1] * k, c[2] * k];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const noisy = (base: RGB, amt: number): Px => (_x, _y, set, r) => set(jitter(base, r, amt));

function ore(spot: RGB, dark: RGB): Px {
  return (x, y, set, r) => {
    const h = Math.sin(x * 12.9 + y * 78.2) * 43758.5;
    const f = h - Math.floor(h);
    const cluster = (Math.abs(x - 5) < 2 && Math.abs(y - 5) < 2) || (Math.abs(x - 11) < 2 && Math.abs(y - 10) < 2) || (Math.abs(x - 4) < 1.5 && Math.abs(y - 12) < 1.5);
    if (cluster && f > 0.25) set(jitter(f > 0.7 ? spot : dark, r, 0.15));
    else set(jitter([112, 110, 116], r, 0.25));
  };
}

function bark(base: RGB, line: RGB, horizontal = false): Px {
  return (x, y, set, r) => {
    const v = horizontal ? y : x;
    const stripe = (v * 7 + Math.floor(r() * 2)) % 5 === 0;
    set(jitter(stripe ? line : base, r, 0.2));
  };
}

function rings(outer: RGB, inner: RGB): Px {
  return (x, y, set, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) set(jitter(outer, r, 0.15));
    else set(jitter((Math.floor(d) % 2) ? inner : mix(inner, [60, 40, 20], 0.3), r, 0.12));
  };
}

function leaves(base: RGB): Px {
  return (_x, _y, set, r) => {
    const v = r();
    if (v < 0.17) set(mix(base, [0, 0, 0], 0.55), 0); // holes (alpha 0, dark tint when drawn opaque)
    else set(jitter(v > 0.85 ? mix(base, [255, 255, 200], 0.15) : base, r, 0.35));
  };
}

const PAINTERS: Record<TileName, Px> = {
  grass_top: noisy([78, 128, 52], 0.35),
  grass_side: (x, y, set, r) => {
    const edge = 3 + ((x * 7) % 3 === 0 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
    if (y < edge) set(jitter([78, 128, 52], r, 0.3)); else set(jitter([140, 100, 68], r, 0.3));
  },
  dirt: noisy([140, 100, 68], 0.35),
  stone: (x, y, set, r) => {
    const crack = ((x + y * 3) % 11 === 0 && r() < 0.6);
    set(jitter(crack ? [92, 90, 96] : [120, 118, 124], r, 0.2));
  },
  sand: noisy([214, 196, 140], 0.15),
  water: (x, y, set, r) => {
    const w = Math.sin((x + y * 0.5) * 0.8) * 0.5 + 0.5;
    set(jitter(mix([34, 70, 140], [70, 120, 190], w * 0.6), r, 0.08), 0.72);
  },
  oak_log: bark([98, 74, 46], [64, 48, 30]),
  oak_log_top: rings([98, 74, 46], [168, 132, 84]),
  oak_leaves: leaves([56, 104, 40]),
  bedrock: noisy([40, 38, 42], 0.8),
  gravel: (_x, _y, set, r) => set(jitter(r() < 0.5 ? [130, 124, 120] : [96, 90, 88], r, 0.25)),
  snow: noisy([236, 240, 248], 0.06),
  coal_ore: ore([30, 30, 32], [50, 50, 54]),
  iron_ore: ore([216, 170, 130], [170, 120, 90]),
  cobble: (x, y, set, r) => {
    const cell = ((Math.floor(x / 4) + Math.floor(y / 4) * 3) * 37) % 7;
    const border = x % 4 === 0 || y % 4 === 0;
    set(jitter(border ? [70, 68, 72] : mix([110, 108, 112], [140, 138, 140], cell / 7), r, 0.15));
  },
  planks: (x, y, set, r) => {
    const seam = y % 4 === 3;
    const nail = y % 4 === 1 && (x === 2 || x === 13) && ((y >> 2) % 2 === 0);
    set(jitter(seam ? [92, 66, 38] : nail ? [70, 56, 40] : [160, 120, 74], r, 0.12));
  },
  pine_log: bark([70, 50, 34], [44, 32, 22]),
  pine_log_top: rings([70, 50, 34], [150, 116, 70]),
  pine_leaves: leaves([34, 72, 46]),
  birch_log: (x, y, set, r) => {
    const mark = ((x * 5 + y * 11) % 13 === 0) || (y % 7 === 3 && x > 3 && x < 9);
    set(jitter(mark ? [40, 40, 36] : [222, 218, 204], r, 0.08));
  },
  birch_log_top: rings([222, 218, 204], [190, 160, 110]),
  birch_leaves: leaves([96, 140, 58]),
  snow_side: (x, y, set, r) => {
    const edge = 3 + ((x * 5) % 3 === 0 ? 1 : 0);
    if (y < edge) set(jitter([236, 240, 248], r, 0.05)); else set(jitter([140, 100, 68], r, 0.3));
  },
  ice: (x, y, set, r) => {
    const streak = (x - y + 16) % 9 === 0;
    set(jitter(streak ? [210, 230, 255] : [150, 190, 235], r, 0.06), 0.9);
  },
  moss_stone: (_x, _y, set, r) => set(jitter(r() < 0.4 ? [74, 110, 56] : [116, 114, 118], r, 0.22)),
  lava: (x, y, set, r) => {
    const w = Math.sin(x * 0.9 + Math.cos(y * 0.7) * 2) * 0.5 + 0.5;
    set(jitter(mix([200, 60, 10], [255, 190, 50], w), r, 0.1));
  },
  clay: noisy([150, 152, 166], 0.1)
};

export function createAtlas(): THREE.DataTexture {
  const data = new Uint8Array(ATLAS_PX * ATLAS_PX * 4);
  TILE_NAMES.forEach((name, idx) => {
    const tx = (idx % ATLAS_TILES) * TILE_PX;
    const ty = Math.floor(idx / ATLAS_TILES) * TILE_PX;
    const rnd = mulberry32(1000 + idx * 7919);
    const painter = PAINTERS[name];
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        // flip rows: image row 0 (top) stored at highest v
        const o = ((ty + (TILE_PX - 1 - y)) * ATLAS_PX + tx + x) * 4;
        painter(x, y, (c, a = 1) => {
          data[o] = Math.max(0, Math.min(255, c[0]));
          data[o + 1] = Math.max(0, Math.min(255, c[1]));
          data[o + 2] = Math.max(0, Math.min(255, c[2]));
          data[o + 3] = Math.round(a * 255);
        }, rnd);
      }
    }
  });
  const tex = new THREE.DataTexture(data, ATLAS_PX, ATLAS_PX, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}
