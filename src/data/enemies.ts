// Enemy table (data) + procedural models. Bones (GPU-animated, see prop shader):
// 0 body, 1 left arm / front-left leg, 2 left leg / front-right leg, 3 back-left leg,
// 4 right leg / back-right leg, 5 head, 6 tail, 7/8 wings, 9 weapon arm.
import * as THREE from 'three';
import { GeoBuilder } from '../world/vegetation';
import { Biome } from '../world/biomes';
import type { DmgType } from './items';
import type { ProjKind } from '../game/projectiles';
import { quadruped } from '../entities/animals';

type C3 = [number, number, number];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export type Status = 'bleed' | 'poison' | 'burn' | 'frozen' | 'stun' | 'curse';

export interface EnemyDef {
  id: string; name: string;
  hp: number; dmg: number; dmgType: DmgType;
  speed: number; run: number; reach: number; cooldown: number; windup: number;
  radius: number; height: number;
  weak: Partial<Record<DmgType, number>>;  // multiplier > 1 = weakness, < 1 = resistance
  onHit?: [Status, number];                // status inflicted, chance
  loot: [string, number, number, number][]; // item, min, max, chance
  gold: [number, number];
  xp: number;
  biomes: Biome[]; night?: boolean; minDanger?: number;
  group: [number, number];
  flee?: number;      // flee below this fraction of hp
  ambush?: boolean;   // hides until the player is close
  flying?: boolean;
  build: (b: GeoBuilder) => void;
  desc: string;
  /** shoots instead of (or as well as) striking */
  ranged?: { kind: ProjKind; speed: number; range: number; dmgMul?: number; splash?: number };
  /** spawns in or at water */
  aquatic?: boolean;
  /** boss: shown with a big bar; phases and telegraphed slams */
  boss?: BossDef;
  /** model scale (bosses and big variants) */
  scale?: number;
  /** chance that a natural spawn of this kind is allowed (rare wanderers) */
  rare?: number;
}

export interface BossPhase { at: number; speedMul?: number; dmgMul?: number; summon?: [string, number]; ranged?: boolean; say?: string; }
export interface BossDef { title: string; phases: BossPhase[]; slam?: { radius: number; dmg: number; every: number; type: DmgType }; drops: string[]; music?: string; }

// ------------------------------------------------------------------ model helpers
export function add(b: GeoBuilder, g: THREE.BufferGeometry, color: C3, bone: number, pivot: THREE.Vector3, layer = 'white', glow = 0) {
  b.add(g, { layer, color, glow, ao: (p) => 0.55 + 0.45 * Math.min(1, Math.max(0, p.y / 1.4)), uvScale: [1, 1] }, undefined, [bone, pivot]);
}
export function ell(rx: number, ry: number, rz: number, x: number, y: number, z: number, seg = 12) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7))); g.scale(rx, ry, rz); g.translate(x, y, z); return g;
}
export function cap(r: number, len: number, x: number, top: number, z: number) {
  const g = new THREE.CapsuleGeometry(r, len, 3, 8); g.translate(x, top - len / 2 - r, z); return g;
}
export function eyes(b: GeoBuilder, x: number, y: number, z: number, r: number, color: C3, glow = 0.35, bone = 5, pivot = V()) {
  for (const s of [-1, 1]) add(b, ell(r, r, r * 0.6, s * x, y, z, 8), color, bone, pivot, 'white', glow);
}

export interface Humanoid { h: number; w: number; skin: C3; cloth: C3; pants: C3; hood?: C3; eye: C3; eyeGlow?: number; hunch?: number; layer?: string; weapon?: 'dagger' | 'club' | 'sword' | 'spear' | 'none'; legs?: boolean }
/** a capsule between two points */
function seg(b: GeoBuilder, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, color: C3, bone: number, pivot: THREE.Vector3, layer = 'fabric') {
  const A = V(ax, ay, az), B = V(bx, by, bz), len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r1, r0, len, 10, 2);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), B.clone().sub(A).normalize()));
  g.translate(ax, ay, az);
  add(b, g, color, bone, pivot, layer);
  add(b, ell(r1, r1, r1, bx, by, bz, 10), color, bone, pivot, layer); // rounded joint
}

export function humanoid(b: GeoBuilder, o: Humanoid) {
  const s = o.h / 1.8, w = o.w, hu = o.hunch ?? 0;
  const L = o.layer ?? 'fabric';
  const hipY = 0.93 * s, shY = 1.44 * s, headY = 1.67 * s - hu * 0.16;
  const lean = hu * 0.14; // the upper body leans forward when hunched
  const headZ = -hu * 0.22;
  const dark: C3 = [o.cloth[0] * 0.6, o.cloth[1] * 0.6, o.cloth[2] * 0.6];
  // ---- torso: pelvis, waist, ribcage, shoulders
  add(b, ell(0.17 * w, 0.1 * s, 0.12 * w, 0, hipY + 0.04 * s, 0, 12), o.pants, 0, V(), L);
  add(b, ell(0.15 * w, 0.15 * s, 0.11 * w, 0, 1.12 * s, -lean * 0.4, 12), o.cloth, 0, V(), L);
  add(b, ell(0.19 * w, 0.17 * s, 0.13 * w, 0, 1.31 * s, -lean * 0.8, 14), o.cloth, 0, V(), L);
  for (const sd of [-1, 1]) add(b, ell(0.085 * w, 0.075 * s, 0.09 * w, sd * 0.19 * w, shY - 0.01 * s, -lean, 10), o.cloth, 0, V(), L);
  add(b, ell(0.175 * w, 0.035 * s, 0.125 * w, 0, hipY + 0.11 * s, 0, 12), [0.18, 0.13, 0.09], 0, V()); // belt
  add(b, ell(0.03 * w, 0.03 * s, 0.015, 0, hipY + 0.11 * s, -0.125 * w, 6), [0.75, 0.6, 0.3], 0, V()); // buckle
  // tunic hem flaring over the hips
  const hem = new THREE.CylinderGeometry(0.17 * w, 0.21 * w, 0.26 * s, 14, 1, true); hem.translate(0, hipY - 0.06 * s, 0);
  add(b, hem, dark, 0, V(), L);
  // ---- neck and head
  const hp = V(0, 1.52 * s, -lean);
  seg(b, 0, 1.48 * s, -lean, 0, headY - 0.08 * s, headZ, 0.05 * s, 0.045 * s, o.skin, 5, hp, 'white');
  add(b, ell(0.098 * s, 0.118 * s, 0.108 * s, 0, headY, headZ, 14), o.skin, 5, hp, 'white');            // cranium
  add(b, ell(0.074 * s, 0.05 * s, 0.08 * s, 0, headY - 0.075 * s, headZ - 0.025 * s, 10), o.skin, 5, hp, 'white'); // jaw
  add(b, ell(0.082 * s, 0.018 * s, 0.03 * s, 0, headY + 0.025 * s, headZ - 0.088 * s, 8), [o.skin[0] * 0.85, o.skin[1] * 0.85, o.skin[2] * 0.85], 5, hp, 'white'); // brow ridge
  const nose = new THREE.ConeGeometry(0.016 * s, 0.05 * s, 6); nose.rotateX(-Math.PI / 2 - 0.4); nose.translate(0, headY - 0.02 * s, headZ - 0.112 * s);
  add(b, nose, o.skin, 5, hp, 'white');
  for (const sd of [-1, 1]) add(b, ell(0.015 * s, 0.03 * s, 0.022 * s, sd * 0.1 * s, headY - 0.005 * s, headZ, 6), o.skin, 5, hp, 'white'); // ears
  if (o.hood) {
    add(b, ell(0.128 * s, 0.14 * s, 0.135 * s, 0, headY + 0.025 * s, headZ + 0.02 * s, 14), o.hood, 5, hp, 'fabric');
    const drape = new THREE.ConeGeometry(0.2 * w, 0.22 * s, 12, 1, true); drape.translate(0, 1.47 * s, -lean + 0.02); add(b, drape, o.hood, 0, V(), 'fabric');
  }
  eyes(b, 0.036 * s, headY + 0.005 * s, headZ - 0.098 * s, 0.015 * s, o.eye, o.eyeGlow ?? 0.25, 5, hp);
  // ---- arms: shoulder → elbow (sleeve) → wrist (skin) → hand; left = bone 1, right (weapon) = bone 9
  const hx = 0.255 * w, hy = shY - 0.6 * s, hz = -0.07 - lean;
  for (const [sd, bone] of [[-1, 1], [1, 9]] as const) {
    const x0 = sd * 0.21 * w, ex = sd * 0.25 * w, ey = shY - 0.3 * s, ez = -lean + 0.02;
    const piv = V(x0, shY, -lean);
    seg(b, x0, shY, -lean, ex, ey, ez, 0.058 * w, 0.048 * w, o.cloth, bone, piv, L);
    seg(b, ex, ey, ez, sd * hx, hy + 0.06 * s, hz, 0.044 * w, 0.034 * w, o.skin, bone, piv, 'white');
    add(b, ell(0.035 * w, 0.05 * s, 0.045 * w, sd * hx, hy, hz, 8), o.skin, bone, piv, 'white');
    add(b, ell(0.05 * w, 0.03 * s, 0.05 * w, sd * hx * 0.99, hy + 0.1 * s, hz + 0.01, 8), [0.22, 0.16, 0.11], bone, piv); // cuff
  }
  // ---- weapon in the right hand
  const wp = V(0.21 * w, shY, -lean);
  if (o.weapon === 'dagger') { const g = new THREE.ConeGeometry(0.02, 0.3, 4); g.rotateX(-Math.PI / 2); g.translate(hx, hy, hz - 0.17); add(b, g, [0.7, 0.7, 0.72], 9, wp); }
  if (o.weapon === 'club') { const g = new THREE.CylinderGeometry(0.06, 0.03, 0.75, 7); g.rotateX(-Math.PI / 2.4); g.translate(hx, hy + 0.05, hz - 0.28); add(b, g, [0.4, 0.28, 0.18], 9, wp, 'bark_oak'); }
  if (o.weapon === 'sword') {
    const bl = new THREE.BoxGeometry(0.05, 0.012, 0.78); bl.translate(hx, hy, hz - 0.45); add(b, bl, [0.75, 0.74, 0.72], 9, wp, 'white');
    const gd = new THREE.BoxGeometry(0.16, 0.025, 0.03); gd.translate(hx, hy, hz - 0.05); add(b, gd, [0.55, 0.45, 0.25], 9, wp);
  }
  if (o.weapon === 'spear') { const g = new THREE.CylinderGeometry(0.018, 0.018, 1.5 * s, 5); g.rotateX(-Math.PI / 2.2); g.translate(hx, hy + 0.1, hz - 0.42); add(b, g, [0.45, 0.32, 0.2], 9, wp, 'bark_oak'); const t = new THREE.ConeGeometry(0.035, 0.16, 4); t.rotateX(-Math.PI / 2.2); t.translate(hx, hy + 0.16, hz - 1.1 * s); add(b, t, [0.6, 0.6, 0.62], 9, wp); }
  // ---- legs: hip → knee → ankle, boots; left = bone 2, right = bone 4
  if (o.legs !== false) for (const [sd, bone] of [[-1, 2], [1, 4]] as const) {
    const x = sd * 0.095 * w, piv = V(x, hipY, 0);
    seg(b, x, hipY, 0, x * 1.05, 0.5 * s, -0.01, 0.078 * w, 0.058 * w, o.pants, bone, piv, L);
    seg(b, x * 1.05, 0.5 * s, -0.01, x * 1.05, 0.12 * s, 0.01, 0.055 * w, 0.042 * w, o.pants, bone, piv, L);
    seg(b, x * 1.05, 0.28 * s, 0, x * 1.05, 0.07 * s, 0.01, 0.06 * w, 0.055 * w, [0.2, 0.14, 0.1], bone, piv, 'fabric'); // boot shaft
    add(b, ell(0.058 * w, 0.045 * s, 0.12 * w, x * 1.05, 0.045 * s, -0.045, 10), [0.16, 0.11, 0.08], bone, piv);       // foot
  }
}

function spider(b: GeoBuilder) {
  const body: C3 = [0.12, 0.1, 0.09], leg: C3 = [0.16, 0.13, 0.11];
  add(b, ell(0.32, 0.26, 0.42, 0, 0.45, 0.3), body, 0, V(), 'cobble');
  add(b, ell(0.2, 0.17, 0.22, 0, 0.42, -0.2), body, 5, V(0, 0.42, -0.05));
  eyes(b, 0.06, 0.5, -0.38, 0.03, [1, 0.15, 0.1], 0.5);
  eyes(b, 0.11, 0.47, -0.34, 0.02, [1, 0.15, 0.1], 0.5);
  for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) {
    const bone = (i % 2 === 0) === (sd < 0) ? 1 : 2;
    const z = -0.18 + i * 0.13;
    const up = new THREE.CapsuleGeometry(0.025, 0.42, 2, 5); up.rotateZ(sd * 1.0); up.translate(sd * 0.32, 0.6, z);
    add(b, up, leg, bone + (i >= 2 ? 2 : 0), V(sd * 0.15, 0.45, z));
    const lo = new THREE.CapsuleGeometry(0.02, 0.5, 2, 5); lo.rotateZ(-sd * 0.35); lo.translate(sd * 0.58, 0.28, z);
    add(b, lo, leg, bone + (i >= 2 ? 2 : 0), V(sd * 0.15, 0.45, z));
  }
}

function toad(b: GeoBuilder) {
  const skin: C3 = [0.32, 0.38, 0.18], belly: C3 = [0.6, 0.55, 0.3];
  add(b, ell(0.32, 0.26, 0.34, 0, 0.42, 0.05), skin, 0, V(), 'swamp_grass');
  add(b, ell(0.25, 0.14, 0.26, 0, 0.32, 0.02), belly, 0, V());
  add(b, ell(0.26, 0.17, 0.22, 0, 0.6, -0.24), skin, 5, V(0, 0.55, -0.1), 'swamp_grass');
  eyes(b, 0.13, 0.75, -0.3, 0.06, [0.95, 0.75, 0.15], 0.3);
  // mouth slit
  add(b, ell(0.18, 0.015, 0.05, 0, 0.55, -0.43), [0.15, 0.05, 0.05], 5, V(0, 0.55, -0.1));
  for (const [sd, bone] of [[-1, 1], [1, 9]] as const) {
    const arm = cap(0.05, 0.28, sd * 0.3, 0.5, -0.2); add(b, arm, skin, bone, V(sd * 0.3, 0.5, -0.2));
    for (let k = -1; k <= 1; k++) { const claw = new THREE.ConeGeometry(0.015, 0.1, 4); claw.rotateX(Math.PI); claw.translate(sd * 0.3 + k * 0.03, 0.06, -0.24); add(b, claw, [0.9, 0.85, 0.7], bone, V(sd * 0.3, 0.5, -0.2)); }
  }
  for (const [sd, bone] of [[-1, 2], [1, 4]] as const) add(b, ell(0.12, 0.16, 0.22, sd * 0.28, 0.2, 0.25), skin, bone, V(sd * 0.28, 0.35, 0.25), 'swamp_grass');
}

function rat(b: GeoBuilder) {
  const fur: C3 = [0.32, 0.28, 0.25];
  add(b, ell(0.18, 0.17, 0.36, 0, 0.3, 0), fur, 0, V(), 'dry_grass');
  add(b, ell(0.12, 0.11, 0.17, 0, 0.32, -0.38), fur, 5, V(0, 0.32, -0.25), 'dry_grass');
  eyes(b, 0.06, 0.37, -0.48, 0.02, [0.9, 0.1, 0.05], 0.4);
  for (const sd of [-1, 1]) add(b, ell(0.05, 0.06, 0.02, sd * 0.07, 0.45, -0.32), [0.7, 0.5, 0.5], 5, V(0, 0.32, -0.25));
  const tail = new THREE.CylinderGeometry(0.012, 0.025, 0.6, 5); tail.rotateX(Math.PI / 2 - 0.2); tail.translate(0, 0.25, 0.62); add(b, tail, [0.75, 0.55, 0.5], 6, V(0, 0.28, 0.33));
  for (const [x, z, bone] of [[-0.12, -0.2, 1], [0.12, -0.2, 2], [-0.12, 0.2, 3], [0.12, 0.2, 4]] as const) add(b, cap(0.03, 0.14, x, 0.22, z), fur, bone, V(x, 0.22, z));
}

function troll(b: GeoBuilder) {
  const skin: C3 = [0.38, 0.42, 0.32];
  humanoid(b, { h: 3.0, w: 1.9, skin, cloth: [0.3, 0.24, 0.16], pants: skin, eye: [1, 0.7, 0.2], eyeGlow: 0.3, hunch: 0.9, layer: 'moss_stone', weapon: 'club' });
  add(b, ell(0.22, 0.09, 0.1, 0, 2.55, -0.32), [0.9, 0.85, 0.7], 5, V(0, 2.5, -0.1)); // jutting tusks / brow
}

function ghost(b: GeoBuilder) {
  const pale: C3 = [0.75, 0.85, 0.95];
  const robe = new THREE.ConeGeometry(0.38, 1.4, 12, 4, true); robe.translate(0, 0.95, 0);
  add(b, robe, pale, 0, V(), 'fabric', 0.55);
  add(b, ell(0.12, 0.15, 0.13, 0, 1.75, 0), pale, 5, V(0, 1.6, 0), 'white', 0.6);
  add(b, ell(0.15, 0.17, 0.15, 0, 1.78, 0.02), [0.4, 0.45, 0.55], 5, V(0, 1.6, 0), 'fabric', 0.3);
  for (const sd of [-1, 1]) add(b, ell(0.035, 0.025, 0.02, sd * 0.045, 1.76, -0.12), [0.02, 0.02, 0.05], 5, V(0, 1.6, 0));
  for (const [sd, bone] of [[-1, 1], [1, 9]] as const) { add(b, cap(0.05, 0.6, sd * 0.3, 1.5, -0.05), pale, bone, V(sd * 0.3, 1.5, 0), 'fabric', 0.5); }
}

function imp(b: GeoBuilder) {
  const skin: C3 = [0.7, 0.2, 0.08];
  add(b, ell(0.14, 0.2, 0.12, 0, 0.0, 0), skin, 0, V(), 'lava', 0.6);
  add(b, ell(0.11, 0.12, 0.11, 0, 0.27, -0.03), skin, 5, V(0, 0.18, 0), 'white', 0.3);
  eyes(b, 0.045, 0.29, -0.12, 0.02, [1, 0.9, 0.3], 1.5);
  for (const sd of [-1, 1]) { const h = new THREE.ConeGeometry(0.025, 0.12, 5); h.rotateZ(-sd * 0.4); h.translate(sd * 0.07, 0.4, -0.02); add(b, h, [0.15, 0.1, 0.08], 5, V(0, 0.18, 0)); }
  for (const [sd, bone] of [[-1, 7], [1, 8]] as const) { const w = new THREE.BoxGeometry(0.55, 0.01, 0.3); w.translate(sd * 0.32, 0.1, 0.08); add(b, w, [0.35, 0.08, 0.05], bone, V(sd * 0.06, 0.1, 0.05)); }
  for (const [sd, bone] of [[-1, 1], [1, 9]] as const) add(b, cap(0.03, 0.18, sd * 0.16, 0.12, -0.02), skin, bone, V(sd * 0.16, 0.12, 0));
  const tail = new THREE.CylinderGeometry(0.01, 0.03, 0.35, 5); tail.rotateX(1.2); tail.translate(0, -0.18, 0.18); add(b, tail, skin, 6, V(0, -0.1, 0.08));
}

function scorpion(b: GeoBuilder) {
  const shell: C3 = [0.42, 0.26, 0.14], dark: C3 = [0.22, 0.13, 0.07];
  add(b, ell(0.32, 0.16, 0.5, 0, 0.32, 0), shell, 0, V(), 'red_rock');
  add(b, ell(0.22, 0.12, 0.2, 0, 0.34, -0.5), shell, 5, V(0, 0.32, -0.35), 'red_rock');
  eyes(b, 0.06, 0.44, -0.62, 0.025, [0.1, 0.9, 0.5], 1.2);
  // pincers on the "arms"
  for (const [sd, bone] of [[-1, 1], [1, 9]] as const) {
    const piv = V(sd * 0.22, 0.34, -0.5);
    add(b, cap(0.05, 0.4, sd * 0.38, 0.4, -0.72), shell, bone, piv, 'red_rock');
    add(b, ell(0.12, 0.08, 0.2, sd * 0.42, 0.36, -0.98), dark, bone, piv, 'red_rock');
    const claw = new THREE.ConeGeometry(0.05, 0.25, 5); claw.rotateX(-Math.PI / 2); claw.translate(sd * 0.47, 0.36, -1.18); add(b, claw, dark, bone, piv);
  }
  // legs: 4 per side on the 4 leg bones
  for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) {
    const bone = k < 2 ? (sd < 0 ? 1 : 2) : (sd < 0 ? 3 : 4);
    const z = -0.3 + k * 0.22;
    const leg = new THREE.CylinderGeometry(0.025, 0.02, 0.6, 5); leg.rotateZ(sd * 1.0); leg.translate(sd * 0.48, 0.22, z);
    add(b, leg, dark, bone, V(sd * 0.25, 0.32, z));
  }
  // the tail: segments arching over the back, stinger on top
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1), a = t * Math.PI * 0.95;
    const y = 0.38 + Math.sin(a) * 0.75, z = 0.45 + Math.cos(a) * -0.1 + Math.sin(a * 0.5) * 0.45 - t * 0.35;
    add(b, ell(0.11 - t * 0.04, 0.09 - t * 0.03, 0.13, 0, y, z), i % 2 ? shell : dark, 6, V(0, 0.38, 0.45), 'red_rock');
  }
  const sting = new THREE.ConeGeometry(0.04, 0.26, 6); sting.rotateX(-2.2); sting.translate(0, 1.08, -0.02); add(b, sting, [0.85, 0.8, 0.5], 6, V(0, 0.38, 0.45), 'white', 0.2);
}

export const ENEMIES: Record<string, EnemyDef> = {};
const E = (d: EnemyDef) => { ENEMIES[d.id] = d; };

E({ id: 'toadling', name: 'Toadling', desc: 'Squat marsh-things that wait in the undergrowth. Their claws open wounds that will not close.',
  hp: 20, dmg: 6, dmgType: 'slash', speed: 2.2, run: 5.2, reach: 1.3, cooldown: 1.3, windup: 0.45, radius: 0.4, height: 0.9,
  weak: { fire: 1.5, blunt: 1.2 }, onHit: ['bleed', 0.45], loot: [['toad_slime', 1, 2, 0.8], ['raw_meat', 0, 1, 0.4]], gold: [0, 2], xp: 8,
  biomes: [Biome.MoonlitForest, Biome.MistySwamp, Biome.SunkenForest], group: [2, 4], ambush: true, build: toad });
E({ id: 'rat', name: 'Giant Rat', desc: 'Bold, hungry and never alone.',
  hp: 12, dmg: 4, dmgType: 'pierce', speed: 2.5, run: 6.5, reach: 1.1, cooldown: 1.0, windup: 0.3, radius: 0.35, height: 0.5,
  weak: { blunt: 1.3 }, onHit: ['poison', 0.1], loot: [['hide', 0, 1, 0.5], ['fang', 0, 1, 0.3]], gold: [0, 1], xp: 4,
  biomes: [Biome.MoonlitForest, Biome.SunnyMeadows, Biome.HauntedMoor, Biome.DarkPine], group: [2, 5], flee: 0.2, build: rat });
E({ id: 'spider', name: 'Cave Spider', desc: 'Eight legs, too many eyes, and venom that slows the heart.',
  hp: 28, dmg: 7, dmgType: 'pierce', speed: 2.4, run: 5.8, reach: 1.4, cooldown: 1.4, windup: 0.4, radius: 0.6, height: 0.7,
  weak: { fire: 1.6, slash: 1.15 }, onHit: ['poison', 0.4], loot: [['chitin', 1, 2, 0.8], ['venom_sac', 0, 1, 0.35]], gold: [0, 0], xp: 12,
  biomes: [Biome.DarkPine, Biome.MoonlitForest, Biome.MushroomGrove, Biome.CrystalCaves], night: true, group: [1, 3], build: spider });
E({ id: 'grave_robber', name: 'Grave Robber', desc: 'Digs by night, stabs by preference, and runs when the odds turn.',
  hp: 42, dmg: 9, dmgType: 'pierce', speed: 2.4, run: 5.6, reach: 1.5, cooldown: 1.2, windup: 0.4, radius: 0.4, height: 1.75,
  weak: {}, onHit: ['bleed', 0.25], loot: [['bone', 0, 2, 0.5], ['rusty_sword', 1, 1, 0.12], ['bandage', 1, 1, 0.3]], gold: [3, 12], xp: 16,
  biomes: [Biome.HauntedMoor, Biome.SunnyMeadows, Biome.MoonlitForest], night: true, group: [1, 2], flee: 0.25,
  build: (b) => humanoid(b, { h: 1.75, w: 1, skin: [0.75, 0.62, 0.52], cloth: [0.25, 0.24, 0.22], pants: [0.2, 0.18, 0.16], hood: [0.18, 0.17, 0.16], eye: [0.1, 0.1, 0.1], weapon: 'dagger' }) });
E({ id: 'bandit', name: 'Bandit', desc: 'Your purse or your life — and they would rather have both.',
  hp: 55, dmg: 11, dmgType: 'slash', speed: 2.6, run: 5.8, reach: 1.8, cooldown: 1.4, windup: 0.5, radius: 0.42, height: 1.8,
  weak: {}, loot: [['rusty_sword', 1, 1, 0.2], ['cooked_meat', 1, 1, 0.3], ['leather', 0, 1, 0.4]], gold: [6, 20], xp: 22,
  biomes: [Biome.SunnyMeadows, Biome.MoonlitForest, Biome.DarkPine, Biome.CoastalCliffs, Biome.RedDesert], minDanger: 1, group: [2, 3], flee: 0.15,
  build: (b) => humanoid(b, { h: 1.82, w: 1.08, skin: [0.78, 0.6, 0.48], cloth: [0.45, 0.2, 0.15], pants: [0.25, 0.2, 0.16], hood: [0.35, 0.12, 0.1], eye: [0.1, 0.1, 0.1], weapon: 'sword' }) });
E({ id: 'skeleton', name: 'Skeleton Warrior', desc: 'Old bones bound by older oaths. Blunt weapons and holy light undo them.',
  hp: 46, dmg: 10, dmgType: 'slash', speed: 2.1, run: 4.6, reach: 1.8, cooldown: 1.5, windup: 0.55, radius: 0.4, height: 1.8,
  weak: { blunt: 1.6, holy: 2, pierce: 0.5, poison: 0, slash: 0.85 }, loot: [['bone', 2, 4, 1], ['rusty_sword', 1, 1, 0.15]], gold: [1, 6], xp: 20,
  biomes: [Biome.HauntedMoor, Biome.DarkPine, Biome.MoonlitForest, Biome.FrozenTundra], night: true, minDanger: 2, group: [1, 3],
  build: (b) => humanoid(b, { h: 1.8, w: 0.75, skin: [0.88, 0.85, 0.76], cloth: [0.82, 0.8, 0.72], pants: [0.82, 0.8, 0.72], eye: [0.4, 0.8, 1], eyeGlow: 1.2, layer: 'white', weapon: 'sword' }) });
E({ id: 'kobold', name: 'Kobold', desc: 'Small, sly and well-armed. Where there is one, there are five.',
  hp: 24, dmg: 7, dmgType: 'pierce', speed: 2.6, run: 6.0, reach: 2.1, cooldown: 1.2, windup: 0.4, radius: 0.35, height: 1.1,
  weak: { slash: 1.2 }, loot: [['copper_ore', 0, 2, 0.5], ['crystal_shard', 0, 1, 0.2], ['hide', 0, 1, 0.3]], gold: [1, 5], xp: 12,
  biomes: [Biome.SnowyMountains, Biome.CrystalCaves, Biome.RedDesert, Biome.VolcanicAshlands], group: [3, 5], flee: 0.2,
  build: (b) => humanoid(b, { h: 1.1, w: 1.0, skin: [0.6, 0.35, 0.2], cloth: [0.35, 0.3, 0.2], pants: [0.6, 0.35, 0.2], eye: [1, 0.8, 0.2], eyeGlow: 0.6, hunch: 0.5, layer: 'red_sand', weapon: 'spear' }) });
E({ id: 'troll', name: 'Troll', desc: 'A mountain with a grudge. Its slam can be seen coming — get out of the way.',
  hp: 170, dmg: 26, dmgType: 'blunt', speed: 1.6, run: 3.6, reach: 2.6, cooldown: 2.4, windup: 1.0, radius: 0.9, height: 3.0,
  weak: { fire: 1.4, pierce: 1.1, blunt: 0.8 }, onHit: ['stun', 0.35], loot: [['troll_hide', 1, 1, 0.8], ['bone', 2, 4, 1], ['iron_ore', 1, 3, 0.4]], gold: [8, 25], xp: 70,
  biomes: [Biome.DarkPine, Biome.SnowyMountains, Biome.FrozenTundra, Biome.HauntedMoor], minDanger: 2, group: [1, 2], build: troll });
E({ id: 'ghost', name: 'Restless Ghost', desc: 'A grief that forgot its name. Steel passes through it; fire and holy light do not.',
  hp: 34, dmg: 8, dmgType: 'shadow', speed: 2.0, run: 4.2, reach: 1.6, cooldown: 1.6, windup: 0.6, radius: 0.4, height: 1.9,
  weak: { slash: 0.35, pierce: 0.35, blunt: 0.5, fire: 1.4, holy: 2.5 }, onHit: ['curse', 0.3], loot: [['ectoplasm', 1, 2, 0.9]], gold: [0, 4], xp: 24,
  biomes: [Biome.HauntedMoor, Biome.SunkenForest, Biome.MistySwamp], night: true, group: [1, 2], flying: true, build: ghost });
E({ id: 'fire_imp', name: 'Fire Imp', desc: 'Cackling sparks with teeth. Water and frost put them out.',
  hp: 30, dmg: 8, dmgType: 'fire', speed: 3.0, run: 6.5, reach: 1.5, cooldown: 1.2, windup: 0.35, radius: 0.35, height: 0.9,
  weak: { ice: 2, fire: 0, pierce: 1.2 }, onHit: ['burn', 0.5], loot: [['ember_core', 1, 1, 0.7], ['coal', 1, 2, 0.6]], gold: [1, 6], xp: 18,
  biomes: [Biome.VolcanicAshlands], group: [2, 4], flying: true, build: imp });

// ---- story enemies (never spawn naturally: no biomes)
E({ id: 'scorpion', name: 'Giant Scorpion', desc: 'The labyrinth’s keepers. Pincers hold, the tail strikes — and the venom burns for a long time.',
  hp: 48, dmg: 10, dmgType: 'pierce', speed: 2.3, run: 5.4, reach: 1.7, cooldown: 1.5, windup: 0.5, radius: 0.6, height: 0.9,
  weak: { blunt: 1.4, ice: 1.3, pierce: 0.8 }, onHit: ['poison', 0.45], loot: [['chitin', 1, 3, 0.9], ['venom_sac', 1, 1, 0.5]], gold: [0, 3], xp: 22,
  biomes: [], group: [1, 2], build: scorpion });
E({ id: 'champion', name: 'Arena Champion', desc: 'Trained for the crowd, scarred by it. Reads your swings and punishes greed.',
  hp: 130, dmg: 15, dmgType: 'slash', speed: 2.7, run: 5.8, reach: 2.0, cooldown: 1.1, windup: 0.45, radius: 0.45, height: 1.9,
  weak: {}, loot: [['bandage', 1, 2, 1]], gold: [10, 20], xp: 60,
  biomes: [], group: [1, 1],
  build: (b) => humanoid(b, { h: 1.9, w: 1.15, skin: [0.72, 0.55, 0.42], cloth: [0.62, 0.62, 0.66], pants: [0.35, 0.12, 0.1], eye: [0.1, 0.1, 0.1], layer: 'white', weapon: 'sword' }) });


// ------------------------------------------------------------------ more of the world's horrors (M11)
const wings = (b: GeoBuilder, span: number, y: number, z: number, col: C3, layer = 'fabric') => {
  for (const [sd, bone] of [[-1, 7], [1, 8]] as const) {
    const w = new THREE.BufferGeometry();
    const pts = new Float32Array([0, 0, 0, sd * span, 0.1, 0.15, sd * span * 0.85, -0.05, 0.55, sd * span * 0.4, -0.1, 0.5, 0, 0, 0.3]);
    w.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    w.setIndex([0, 1, 4, 1, 2, 4, 2, 3, 4]);
    w.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(10), 2));
    w.computeVertexNormals();
    w.translate(sd * 0.12, y, z);
    add(b, w, col, bone, V(sd * 0.12, y, z), layer);
  }
};
const legs4 = (b: GeoBuilder, col: C3, x: number, y: number, z: number, r: number, len: number) => {
  for (const [lx, bone, lz] of [[-x, 1, -z], [x, 2, -z], [-x, 3, z], [x, 4, z]] as const) add(b, cap(r, len, lx, y, lz), col, bone, V(lx, y, lz));
};

function bat(b: GeoBuilder) {
  const fur: C3 = [0.18, 0.12, 0.12];
  add(b, ell(0.12, 0.14, 0.16, 0, 0, 0), fur, 0, V());
  add(b, ell(0.08, 0.08, 0.08, 0, 0.12, -0.12), fur, 5, V(0, 0.1, -0.06));
  for (const sd of [-1, 1]) { const e = new THREE.ConeGeometry(0.03, 0.1, 4); e.translate(sd * 0.05, 0.22, -0.12); add(b, e, fur, 5, V(0, 0.1, -0.06)); }
  eyes(b, 0.03, 0.13, -0.19, 0.015, [1, 0.2, 0.1], 1.2);
  wings(b, 0.55, 0.04, -0.1, [0.25, 0.14, 0.14]);
}
function harpy(b: GeoBuilder) {
  humanoid(b, { h: 1.6, w: 0.85, skin: [0.72, 0.6, 0.55], cloth: [0.45, 0.38, 0.3], pants: [0.35, 0.28, 0.2], hood: [0.3, 0.22, 0.15], eye: [1, 0.85, 0.2], eyeGlow: 0.8, layer: 'dry_grass', weapon: 'none', legs: true });
  wings(b, 1.0, 1.35, 0.05, [0.4, 0.32, 0.24], 'dry_grass');
}
function demon(b: GeoBuilder) {
  humanoid(b, { h: 2.1, w: 1.25, skin: [0.55, 0.12, 0.1], cloth: [0.4, 0.08, 0.06], pants: [0.25, 0.05, 0.04], eye: [1, 0.7, 0.1], eyeGlow: 2, layer: 'lava', weapon: 'sword' });
  for (const sd of [-1, 1]) { const h = new THREE.ConeGeometry(0.04, 0.3, 5); h.rotateZ(-sd * 0.5); h.translate(sd * 0.12, 2.05, -0.02); add(b, h, [0.15, 0.1, 0.08], 5, V(0, 1.75, 0)); }
  wings(b, 1.4, 1.65, 0.12, [0.3, 0.06, 0.05]);
  const tail = new THREE.CylinderGeometry(0.02, 0.05, 0.9, 5); tail.rotateX(1.1); tail.translate(0, 0.8, 0.45); add(b, tail, [0.5, 0.1, 0.08], 6, V(0, 0.95, 0.1));
}
function hag(b: GeoBuilder) {
  humanoid(b, { h: 1.6, w: 0.9, skin: [0.45, 0.55, 0.35], cloth: [0.22, 0.25, 0.15], pants: [0.2, 0.2, 0.12], hood: [0.15, 0.18, 0.1], eye: [0.9, 1, 0.3], eyeGlow: 1.0, hunch: 1.0, layer: 'swamp_grass', weapon: 'none' });
  const nose = new THREE.ConeGeometry(0.03, 0.14, 5); nose.rotateX(-Math.PI / 2); nose.translate(0, 1.3, -0.4); add(b, nose, [0.45, 0.55, 0.35], 5, V(0, 1.35, 0));
}
function golem(b: GeoBuilder) {
  const ice: C3 = [0.7, 0.85, 1.0];
  add(b, ell(0.55, 0.6, 0.4, 0, 1.6, 0), ice, 0, V(), 'ice');
  add(b, ell(0.28, 0.25, 0.26, 0, 2.35, -0.05), ice, 5, V(0, 2.1, 0), 'ice');
  eyes(b, 0.1, 2.38, -0.28, 0.05, [0.4, 0.8, 1], 2.5, 5, V(0, 2.1, 0));
  for (const [sd, bone] of [[-1, 1], [1, 9]] as const) { add(b, cap(0.2, 1.0, sd * 0.75, 2.0, 0), ice, bone, V(sd * 0.75, 2.0, 0), 'ice'); add(b, ell(0.26, 0.26, 0.26, sd * 0.75, 0.85, 0), ice, bone, V(sd * 0.75, 2.0, 0), 'crystal'); }
  for (const [sd, bone] of [[-1, 2], [1, 4]] as const) add(b, cap(0.22, 1.0, sd * 0.3, 1.1, 0), ice, bone, V(sd * 0.3, 1.1, 0), 'ice');
  for (let i = 0; i < 5; i++) { const c = new THREE.ConeGeometry(0.08, 0.5, 5); c.translate(Math.sin(i * 1.3) * 0.35, 2.25, 0.25 + Math.cos(i) * 0.1); add(b, c, [0.8, 0.95, 1.1], 0, V(), 'crystal', 0.4); }
}
function worm(b: GeoBuilder) {
  const sk: C3 = [0.62, 0.48, 0.32];
  for (let i = 0; i < 7; i++) { const r = 0.55 - i * 0.05; add(b, ell(r, r, 0.5, 0, 0.5 + Math.sin(i * 0.6) * 0.15, -0.6 + i * 0.6), sk, i < 2 ? 5 : i > 4 ? 6 : 0, V(0, 0.5, i < 2 ? -0.3 : 1.2), 'red_sand'); }
  for (let i = 0; i < 8; i++) { const t = new THREE.ConeGeometry(0.05, 0.25, 4); const a = i / 8 * Math.PI * 2; t.rotateX(Math.PI / 2); t.translate(Math.cos(a) * 0.38, 0.5 + Math.sin(a) * 0.38, -1.1); add(b, t, [0.95, 0.9, 0.8], 5, V(0, 0.5, -0.3)); }
  add(b, ell(0.42, 0.42, 0.05, 0, 0.5, -1.08), [0.25, 0.05, 0.05], 5, V(0, 0.5, -0.3));
}
function spirit(b: GeoBuilder) {
  const w: C3 = [0.4, 0.75, 0.9];
  const body = new THREE.ConeGeometry(0.45, 1.6, 12, 3, true); body.rotateX(Math.PI); body.translate(0, 0.9, 0); add(b, body, w, 0, V(), 'water_normal', 0.9);
  add(b, ell(0.18, 0.22, 0.18, 0, 1.85, 0), w, 5, V(0, 1.7, 0), 'white', 0.9);
  eyes(b, 0.06, 1.88, -0.16, 0.03, [0.9, 1, 1], 2.5, 5, V(0, 1.7, 0));
  for (const [sd, bone] of [[-1, 1], [1, 9]] as const) add(b, cap(0.06, 0.8, sd * 0.35, 1.55, -0.05), w, bone, V(sd * 0.35, 1.55, 0), 'white', 0.7);
}
function mimic(b: GeoBuilder) {
  const wood: C3 = [0.5, 0.36, 0.24];
  add(b, new THREE.BoxGeometry(1.0, 0.5, 0.65).translate(0, 0.25, 0), wood, 0, V(), 'planks');
  const lid = new THREE.BoxGeometry(1.0, 0.25, 0.65); lid.translate(0, 0.62, 0); add(b, lid, wood, 5, V(0, 0.5, 0.3), 'planks');
  for (let i = 0; i < 7; i++) { const t = new THREE.ConeGeometry(0.04, 0.14, 4); t.translate(-0.4 + i * 0.13, 0.55, -0.3); add(b, t, [0.95, 0.92, 0.85], 0, V()); const t2 = t.clone(); t2.rotateZ(Math.PI); t2.translate(0, -0.0, 0); add(b, t2.translate(0, 0.05, 0), [0.95, 0.92, 0.85], 5, V(0, 0.5, 0.3)); }
  add(b, ell(0.3, 0.06, 0.2, 0, 0.5, -0.2), [0.7, 0.15, 0.2], 0, V());
  eyes(b, 0.22, 0.72, -0.34, 0.04, [1, 0.8, 0.2], 1.5, 5, V(0, 0.5, 0.3));
  for (const x of [-0.42, 0.42]) add(b, new THREE.BoxGeometry(0.06, 0.52, 0.67).translate(x, 0.26, 0), [0.75, 0.6, 0.3], 0, V(), 'ore_gold');
  legs4(b, [0.25, 0.15, 0.1], 0.38, 0.1, 0.22, 0.05, 0.2);
}
function falcon(b: GeoBuilder) {
  const gold: C3 = [1.1, 0.8, 0.25];
  add(b, ell(0.22, 0.2, 0.42, 0, 0, 0), gold, 0, V(), 'white', 0.25);
  add(b, ell(0.13, 0.13, 0.15, 0, 0.12, -0.42), gold, 5, V(0, 0.08, -0.3), 'white', 0.25);
  const beak = new THREE.ConeGeometry(0.04, 0.14, 5); beak.rotateX(-Math.PI / 2); beak.translate(0, 0.1, -0.6); add(b, beak, [0.3, 0.25, 0.15], 5, V(0, 0.08, -0.3));
  eyes(b, 0.06, 0.16, -0.52, 0.02, [1, 0.3, 0.1], 1.5, 5, V(0, 0.08, -0.3));
  wings(b, 1.3, 0.05, -0.15, [1.0, 0.72, 0.2], 'white');
  const tail = new THREE.BoxGeometry(0.3, 0.03, 0.4); tail.translate(0, 0, 0.55); add(b, tail, gold, 6, V(0, 0, 0.35), 'white', 0.2);
}
function crab(b: GeoBuilder) {
  const sh: C3 = [0.65, 0.22, 0.12];
  add(b, ell(0.55, 0.22, 0.42, 0, 0.45, 0), sh, 0, V(), 'red_rock');
  eyes(b, 0.12, 0.72, -0.35, 0.04, [0.1, 0.1, 0.1], 0, 0, V());
  for (const [sd, bone] of [[-1, 1], [1, 9]] as const) { add(b, cap(0.07, 0.45, sd * 0.55, 0.5, -0.4), sh, bone, V(sd * 0.45, 0.45, -0.3), 'red_rock'); add(b, ell(0.18, 0.13, 0.25, sd * 0.6, 0.45, -0.75), sh, bone, V(sd * 0.45, 0.45, -0.3), 'red_rock'); }
  for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) { const l = new THREE.CylinderGeometry(0.035, 0.02, 0.7, 5); l.rotateZ(sd * 0.9); l.translate(sd * 0.75, 0.25, -0.1 + k * 0.22); add(b, l, sh, k < 2 ? (sd < 0 ? 3 : 4) : (sd < 0 ? 2 : 1), V(sd * 0.5, 0.4, k * 0.2)); }
}
function wasp(b: GeoBuilder) {
  const y: C3 = [0.95, 0.75, 0.1], k: C3 = [0.1, 0.08, 0.05];
  add(b, ell(0.14, 0.13, 0.2, 0, 0, -0.1), k, 0, V());
  for (let i = 0; i < 3; i++) add(b, ell(0.17 - i * 0.03, 0.16 - i * 0.03, 0.12, 0, -0.04, 0.2 + i * 0.16), i % 2 ? k : y, 6, V(0, 0, 0.1));
  const st = new THREE.ConeGeometry(0.03, 0.18, 5); st.rotateX(Math.PI / 2); st.translate(0, -0.06, 0.7); add(b, st, k, 6, V(0, 0, 0.1));
  add(b, ell(0.1, 0.1, 0.1, 0, 0.04, -0.34), k, 5, V(0, 0, -0.2));
  eyes(b, 0.06, 0.07, -0.4, 0.04, [0.6, 0.1, 0.05], 0.3, 5, V(0, 0, -0.2));
  wings(b, 0.45, 0.12, -0.15, [0.85, 0.9, 1.0], 'ice');
}
function wisp(b: GeoBuilder) {
  add(b, ell(0.16, 0.16, 0.16, 0, 0, 0), [0.6, 1.4, 1.6], 0, V(), 'white', 4);
  add(b, ell(0.3, 0.3, 0.3, 0, 0, 0), [0.3, 0.8, 1.0], 0, V(), 'white', 1.2);
}
function myconid(b: GeoBuilder) {
  humanoid(b, { h: 1.5, w: 1.1, skin: [0.85, 0.8, 0.7], cloth: [0.75, 0.7, 0.6], pants: [0.7, 0.65, 0.55], eye: [0.3, 1, 0.8], eyeGlow: 2, layer: 'mushroom_stem', weapon: 'none' });
  const cap2 = new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); cap2.scale(1, 0.55, 1); cap2.translate(0, 1.55, 0); add(b, cap2, [0.7, 0.2, 0.55], 5, V(0, 1.3, 0), 'mushroom_cap', 0.35);
}
function salamander(b: GeoBuilder) {
  const sk: C3 = [0.55, 0.18, 0.06];
  add(b, ell(0.25, 0.18, 0.6, 0, 0.35, 0), sk, 0, V(), 'lava', 0.3);
  add(b, ell(0.18, 0.13, 0.25, 0, 0.4, -0.7), sk, 5, V(0, 0.38, -0.45), 'lava', 0.3);
  eyes(b, 0.1, 0.5, -0.82, 0.03, [1, 0.9, 0.2], 2, 5, V(0, 0.38, -0.45));
  const tail = new THREE.CylinderGeometry(0.02, 0.15, 0.9, 6); tail.rotateX(Math.PI / 2); tail.translate(0, 0.3, 0.95); add(b, tail, sk, 6, V(0, 0.33, 0.5), 'lava', 0.4);
  for (const [x, bone, z] of [[-0.3, 1, -0.35], [0.3, 2, -0.35], [-0.3, 3, 0.3], [0.3, 4, 0.3]] as const) { const l = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 5); l.rotateZ(Math.sign(x) * 1.0); l.translate(x, 0.2, z); add(b, l, [0.35, 0.1, 0.04], bone, V(x * 0.5, 0.3, z)); }
}
function gargoyle(b: GeoBuilder) {
  const st: C3 = [0.5, 0.5, 0.5];
  humanoid(b, { h: 1.7, w: 1.15, skin: st, cloth: st, pants: st, eye: [1, 0.3, 0.2], eyeGlow: 1.5, hunch: 0.8, layer: 'cobble', weapon: 'none' });
  wings(b, 0.95, 1.35, 0.15, [0.42, 0.42, 0.42], 'cobble');
  for (const sd of [-1, 1]) { const h = new THREE.ConeGeometry(0.035, 0.2, 5); h.rotateZ(-sd * 0.6); h.translate(sd * 0.1, 1.68, -0.15); add(b, h, st, 5, V(0, 1.4, 0), 'cobble'); }
}
function crawler(b: GeoBuilder) {
  const c: C3 = [0.5, 0.75, 0.95];
  spider(b);
  for (let i = 0; i < 5; i++) { const sp = new THREE.ConeGeometry(0.06, 0.4, 5); sp.translate(Math.sin(i * 1.7) * 0.2, 0.8, 0.2 + i * 0.1); add(b, sp, c, 0, V(), 'crystal', 0.6); }
}
function sheep(b: GeoBuilder) {
  quadruped(b, { body: [0.32, 0.3, 0.45], bodyY: 0.62, legLen: 0.4, legR: 0.045, legX: 0.16, legZ: 0.28, head: [0.11, 0.12, 0.17], headPos: [0, 0.82, -0.55], color: [0.9, 0.88, 0.82], dark: [0.15, 0.12, 0.1], tail: 0.06 },
    (bb) => { eyes(bb, 0.06, 0.88, -0.7, 0.025, [1, 0.05, 0.05], 2.5, 5, V(0, 0.75, -0.35)); add(bb, ell(0.07, 0.015, 0.03, 0, 0.75, -0.72), [0.6, 0.05, 0.05], 5, V(0, 0.75, -0.35)); });
}
function direWolf(b: GeoBuilder, col: C3, eye: C3) {
  quadruped(b, { body: [0.3, 0.34, 0.75], bodyY: 0.85, legLen: 0.55, legR: 0.06, legX: 0.17, legZ: 0.48, head: [0.16, 0.16, 0.28], headPos: [0, 1.05, -0.95], neck: 0.25, color: col, dark: [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], tail: 0.4 },
    (bb) => { eyes(bb, 0.07, 1.1, -1.15, 0.025, eye, 1.4, 5, V(0, 1.1, -0.6)); for (const sd of [-1, 1]) { const e = new THREE.ConeGeometry(0.04, 0.12, 4); e.translate(sd * 0.08, 1.25, -0.88); add(bb, e, col, 5, V(0, 1.1, -0.6)); } });
}
function yeti(b: GeoBuilder) {
  humanoid(b, { h: 2.6, w: 1.7, skin: [0.6, 0.65, 0.75], cloth: [0.92, 0.94, 0.98], pants: [0.9, 0.92, 0.96], eye: [0.3, 0.6, 1], eyeGlow: 0.8, hunch: 0.7, layer: 'snow', weapon: 'none' });
}
function ogre(b: GeoBuilder) {
  humanoid(b, { h: 2.7, w: 1.85, skin: [0.6, 0.5, 0.35], cloth: [0.4, 0.3, 0.2], pants: [0.3, 0.22, 0.15], eye: [0.8, 0.6, 0.2], eyeGlow: 0.3, hunch: 0.5, layer: 'dirt', weapon: 'club' });
}

E({ id: 'dire_wolf', name: 'Dire Wolf', desc: 'Bigger than a pony and twice as hungry. Hunts in packs and circles before it bites.',
  hp: 44, dmg: 10, dmgType: 'pierce', speed: 3, run: 8, reach: 1.6, cooldown: 1.2, windup: 0.35, radius: 0.5, height: 1.2,
  weak: { fire: 1.3 }, onHit: ['bleed', 0.3], loot: [['hide', 1, 2, 0.9], ['fang', 1, 2, 0.6], ['raw_meat', 1, 2, 0.7]], gold: [0, 0], xp: 18,
  biomes: [Biome.DarkPine, Biome.MoonlitForest, Biome.HauntedMoor], night: true, minDanger: 1.5, group: [2, 4], build: (b) => direWolf(b, [0.25, 0.23, 0.22], [1, 0.8, 0.2]) });
E({ id: 'frost_wolf', name: 'Frost Wolf', desc: 'White as the tundra, and its breath freezes the blood.',
  hp: 50, dmg: 11, dmgType: 'ice', speed: 3, run: 8.4, reach: 1.6, cooldown: 1.2, windup: 0.35, radius: 0.5, height: 1.2,
  weak: { fire: 1.6, ice: 0 }, onHit: ['frozen', 0.25], loot: [['hide', 1, 2, 0.9], ['fang', 1, 2, 0.6]], gold: [0, 0], xp: 22,
  biomes: [Biome.FrozenTundra, Biome.SnowyMountains], group: [2, 4], build: (b) => direWolf(b, [0.85, 0.88, 0.92], [0.4, 0.8, 1]) });
E({ id: 'water_spirit', name: 'Water Spirit', desc: 'Rises from still lakes to drag the careless under. Fire hisses on it; lightning would do worse.',
  hp: 40, dmg: 9, dmgType: 'ice', speed: 2.2, run: 4.8, reach: 1.8, cooldown: 1.6, windup: 0.6, radius: 0.45, height: 2.0,
  weak: { slash: 0.5, pierce: 0.5, fire: 1.3, holy: 1.5 }, onHit: ['frozen', 0.2], loot: [['ectoplasm', 1, 1, 0.6], ['crystal_shard', 0, 1, 0.3]], gold: [0, 4], xp: 24,
  biomes: [Biome.MoonlitForest, Biome.MistySwamp, Biome.SunkenForest, Biome.CoastalCliffs, Biome.SunnyMeadows], aquatic: true, group: [1, 2], flying: true, ranged: { kind: 'frost', speed: 14, range: 14 }, build: spirit });
E({ id: 'giant_scorpion', name: 'Desert Scorpion', desc: 'Sand-coloured and the size of a cart. Its tail strikes from further than you think.',
  hp: 70, dmg: 13, dmgType: 'pierce', speed: 2.4, run: 5.5, reach: 2.1, cooldown: 1.5, windup: 0.5, radius: 0.8, height: 1.1,
  weak: { blunt: 1.4, ice: 1.4 }, onHit: ['poison', 0.5], loot: [['chitin', 2, 4, 0.9], ['venom_sac', 1, 1, 0.6]], gold: [0, 4], xp: 32,
  biomes: [Biome.RedDesert], minDanger: 1.5, group: [1, 2], scale: 1.6, build: (b) => { scorpion(b); } });
E({ id: 'orc', name: 'Armoured Orc', desc: 'Iron plates nailed onto muscle. Slow to fall, quick to anger.',
  hp: 95, dmg: 17, dmgType: 'slash', speed: 2.2, run: 5.0, reach: 2.1, cooldown: 1.7, windup: 0.6, radius: 0.55, height: 2.1,
  weak: { blunt: 1.25, pierce: 0.8, slash: 0.85 }, loot: [['iron_ore', 1, 2, 0.5], ['leather', 1, 2, 0.6]], gold: [8, 22], xp: 42,
  biomes: [Biome.DarkPine, Biome.RedDesert, Biome.VolcanicAshlands, Biome.SnowyMountains], minDanger: 2, group: [2, 3],
  build: (b) => humanoid(b, { h: 2.1, w: 1.45, skin: [0.35, 0.45, 0.25], cloth: [0.45, 0.45, 0.5], pants: [0.3, 0.25, 0.2], eye: [1, 0.2, 0.1], eyeGlow: 0.6, hunch: 0.3, layer: 'cobble', weapon: 'sword' }) });
E({ id: 'killer_sheep', name: 'Killer Sheep', desc: 'Wool, hooves, red eyes and absolutely no remorse. The shepherds never stood a chance.',
  hp: 22, dmg: 7, dmgType: 'pierce', speed: 2, run: 7, reach: 1.2, cooldown: 1.0, windup: 0.3, radius: 0.4, height: 1.0,
  weak: { fire: 1.5 }, onHit: ['bleed', 0.3], loot: [['raw_meat', 1, 2, 0.9], ['fiber', 2, 4, 0.8]], gold: [0, 1], xp: 10,
  biomes: [Biome.SunnyMeadows], night: true, minDanger: 1.4, group: [3, 5], build: sheep });
E({ id: 'harpy', name: 'Harpy', desc: 'Screeching from the cliffs, diving with talons first.',
  hp: 36, dmg: 9, dmgType: 'slash', speed: 3, run: 7, reach: 1.6, cooldown: 1.3, windup: 0.4, radius: 0.45, height: 1.6,
  weak: { pierce: 1.4 }, onHit: ['bleed', 0.25], loot: [['fiber', 1, 3, 0.6], ['bone', 0, 1, 0.4]], gold: [1, 6], xp: 20,
  biomes: [Biome.CoastalCliffs, Biome.SnowyMountains, Biome.FloatingRocks], group: [2, 3], flying: true, build: harpy });
E({ id: 'winged_demon', name: 'Winged Demon', desc: 'A furnace with wings and a grudge against everything that lives.',
  hp: 120, dmg: 20, dmgType: 'fire', speed: 2.8, run: 6.5, reach: 2.2, cooldown: 1.6, windup: 0.55, radius: 0.6, height: 2.1,
  weak: { holy: 2, ice: 1.5, fire: 0 }, onHit: ['burn', 0.5], loot: [['ember_core', 1, 2, 0.9]], gold: [15, 35], xp: 80,
  biomes: [Biome.VolcanicAshlands], night: true, minDanger: 3, group: [1, 1], flying: true, ranged: { kind: 'fireball', speed: 16, range: 18, splash: 2.5 }, build: demon });
E({ id: 'swamp_hag', name: 'Swamp Hag', desc: 'She knows your name. She knows a great many names. Her curses linger.',
  hp: 60, dmg: 11, dmgType: 'poison', speed: 2.0, run: 4.4, reach: 1.7, cooldown: 1.8, windup: 0.6, radius: 0.45, height: 1.5,
  weak: { fire: 1.5, holy: 1.4 }, onHit: ['curse', 0.4], loot: [['glowcap', 1, 2, 0.6], ['venom_sac', 0, 1, 0.4]], gold: [4, 14], xp: 34,
  biomes: [Biome.MistySwamp, Biome.SunkenForest], minDanger: 1.5, group: [1, 1], flee: 0.2, ranged: { kind: 'spit', speed: 13, range: 12 }, build: hag });
E({ id: 'ice_golem', name: 'Ice Golem', desc: 'A glacier taught to walk. Fire is the only argument it understands.',
  hp: 180, dmg: 24, dmgType: 'blunt', speed: 1.5, run: 3.2, reach: 2.6, cooldown: 2.4, windup: 1.0, radius: 0.9, height: 2.7,
  weak: { fire: 1.8, blunt: 1.2, ice: 0, slash: 0.7, pierce: 0.6 }, onHit: ['frozen', 0.4], loot: [['crystal_shard', 1, 3, 0.9], ['snowball', 2, 4, 1]], gold: [5, 20], xp: 70,
  biomes: [Biome.SnowyMountains, Biome.FrozenTundra], minDanger: 2.5, group: [1, 1], build: golem });
E({ id: 'sand_worm', name: 'Sand Worm', desc: 'The dunes breathe. Then they open.',
  hp: 160, dmg: 22, dmgType: 'pierce', speed: 2.4, run: 5.5, reach: 2.6, cooldown: 2.0, windup: 0.7, radius: 0.9, height: 1.4,
  weak: { ice: 1.4, pierce: 1.2 }, loot: [['chitin', 2, 4, 0.8], ['raw_meat', 2, 4, 0.9]], gold: [0, 10], xp: 65,
  biomes: [Biome.RedDesert], minDanger: 2.5, group: [1, 1], ambush: true, build: worm });
E({ id: 'vampire_bat', name: 'Vampire Bat', desc: 'A cloud of leather wings that drinks while it flies.',
  hp: 12, dmg: 4, dmgType: 'pierce', speed: 3.5, run: 8, reach: 1.1, cooldown: 0.9, windup: 0.25, radius: 0.3, height: 0.5,
  weak: { holy: 1.5, fire: 1.3 }, onHit: ['bleed', 0.3], loot: [['hide', 0, 1, 0.3]], gold: [0, 1], xp: 6,
  biomes: [Biome.HauntedMoor, Biome.DarkPine, Biome.CrystalCaves, Biome.MushroomGrove], night: true, group: [3, 6], flying: true, build: bat });
E({ id: 'dark_knight', name: 'Dark Knight', desc: 'Black plate and an oath no one remembers. It does not tire. It does not speak.',
  hp: 150, dmg: 22, dmgType: 'slash', speed: 2.3, run: 5.0, reach: 2.3, cooldown: 1.5, windup: 0.55, radius: 0.5, height: 2.0,
  weak: { holy: 1.6, blunt: 1.2, slash: 0.6, pierce: 0.6 }, onHit: ['curse', 0.2], loot: [['iron_bar', 1, 2, 0.6]], gold: [20, 45], xp: 95,
  biomes: [Biome.HauntedMoor, Biome.DarkPine], night: true, minDanger: 3, group: [1, 1],
  build: (b) => humanoid(b, { h: 2.0, w: 1.3, skin: [0.12, 0.12, 0.14], cloth: [0.14, 0.14, 0.16], pants: [0.12, 0.12, 0.14], hood: [0.1, 0.1, 0.12], eye: [1, 0.2, 0.15], eyeGlow: 2.5, layer: 'basalt', weapon: 'sword' }) });
E({ id: 'cultist', name: 'Cultist', desc: 'Hooded, chanting, and very sure the world should end soon.',
  hp: 40, dmg: 8, dmgType: 'shadow', speed: 2.3, run: 5.0, reach: 1.6, cooldown: 1.6, windup: 0.6, radius: 0.4, height: 1.8,
  weak: { holy: 1.6 }, onHit: ['curse', 0.25], loot: [['bandage', 0, 1, 0.3], ['crystal_shard', 0, 1, 0.2]], gold: [4, 14], xp: 22,
  biomes: [Biome.HauntedMoor, Biome.MistySwamp, Biome.VolcanicAshlands], night: true, minDanger: 1.5, group: [2, 3], ranged: { kind: 'shadow', speed: 15, range: 15 },
  build: (b) => humanoid(b, { h: 1.8, w: 0.95, skin: [0.7, 0.6, 0.55], cloth: [0.35, 0.08, 0.1], pants: [0.3, 0.06, 0.08], hood: [0.28, 0.05, 0.07], eye: [1, 0.3, 0.6], eyeGlow: 1.2, weapon: 'dagger' }) });
E({ id: 'mimic', name: 'Mimic', desc: 'A treasure chest that is mostly teeth. Greed is its bait.',
  hp: 75, dmg: 16, dmgType: 'pierce', speed: 1.6, run: 4.0, reach: 1.5, cooldown: 1.4, windup: 0.4, radius: 0.55, height: 0.8,
  weak: { fire: 1.5 }, onHit: ['bleed', 0.4], loot: [['gold_bar', 0, 1, 0.5], ['crystal_shard', 1, 2, 0.6]], gold: [25, 60], xp: 45,
  biomes: [], group: [1, 1], ambush: true, build: mimic });
E({ id: 'skeleton_archer', name: 'Skeleton Archer', desc: 'Dead hands, a steady draw. Close the distance.',
  hp: 34, dmg: 9, dmgType: 'pierce', speed: 2.1, run: 4.2, reach: 1.6, cooldown: 1.9, windup: 0.7, radius: 0.4, height: 1.8,
  weak: { blunt: 1.6, holy: 2, pierce: 0.5, poison: 0 }, loot: [['bone', 1, 3, 1], ['arrow', 2, 5, 0.7]], gold: [1, 6], xp: 22,
  biomes: [Biome.HauntedMoor, Biome.DarkPine, Biome.FrozenTundra], night: true, minDanger: 2, group: [1, 2], ranged: { kind: 'arrow', speed: 26, range: 22 },
  build: (b) => humanoid(b, { h: 1.8, w: 0.75, skin: [0.88, 0.85, 0.76], cloth: [0.82, 0.8, 0.72], pants: [0.82, 0.8, 0.72], eye: [0.4, 0.8, 1], eyeGlow: 1.2, layer: 'white', weapon: 'none' }) });
E({ id: 'goblin', name: 'Goblin', desc: 'Sharp ears, sharper knives, no manners at all.',
  hp: 20, dmg: 6, dmgType: 'pierce', speed: 2.8, run: 6.4, reach: 1.3, cooldown: 1.0, windup: 0.3, radius: 0.35, height: 1.1,
  weak: {}, loot: [['copper_ore', 0, 1, 0.3], ['berries', 0, 2, 0.4]], gold: [1, 6], xp: 9,
  biomes: [Biome.MushroomGrove, Biome.DarkPine, Biome.SunnyMeadows], group: [3, 5], flee: 0.3,
  build: (b) => humanoid(b, { h: 1.1, w: 0.95, skin: [0.4, 0.55, 0.25], cloth: [0.4, 0.3, 0.2], pants: [0.3, 0.25, 0.15], eye: [1, 0.9, 0.2], eyeGlow: 0.5, hunch: 0.4, weapon: 'dagger' }) });
E({ id: 'goblin_shaman', name: 'Goblin Shaman', desc: 'Bones in its hair and fire in its fists. Kill it first.',
  hp: 26, dmg: 9, dmgType: 'fire', speed: 2.4, run: 5.0, reach: 1.4, cooldown: 2.0, windup: 0.7, radius: 0.35, height: 1.15,
  weak: { ice: 1.3 }, onHit: ['burn', 0.4], loot: [['bone', 1, 2, 0.6], ['glowcap', 0, 1, 0.4]], gold: [3, 10], xp: 16,
  biomes: [Biome.MushroomGrove, Biome.DarkPine], minDanger: 1.3, group: [1, 1], flee: 0.3, ranged: { kind: 'spell', speed: 14, range: 15 },
  build: (b) => humanoid(b, { h: 1.15, w: 0.95, skin: [0.4, 0.55, 0.25], cloth: [0.55, 0.15, 0.1], pants: [0.3, 0.2, 0.12], hood: [0.5, 0.12, 0.08], eye: [1, 0.5, 0.1], eyeGlow: 1.5, hunch: 0.5, weapon: 'none' }) });
E({ id: 'ogre', name: 'Ogre', desc: 'Dim, enormous, and holding a tree. Always hungry.',
  hp: 210, dmg: 28, dmgType: 'blunt', speed: 1.7, run: 3.8, reach: 2.7, cooldown: 2.5, windup: 1.0, radius: 0.95, height: 2.7,
  weak: { pierce: 1.2, fire: 1.2 }, onHit: ['stun', 0.4], loot: [['raw_meat', 2, 4, 1], ['bone', 2, 4, 1], ['gold_ore', 0, 1, 0.3]], gold: [10, 30], xp: 85,
  biomes: [Biome.SunnyMeadows, Biome.DarkPine, Biome.CoastalCliffs], minDanger: 3, group: [1, 1], build: ogre });
E({ id: 'myconid', name: 'Myconid', desc: 'A walking mushroom that exhales sleep. Do not breathe deeply.',
  hp: 45, dmg: 8, dmgType: 'poison', speed: 1.8, run: 3.6, reach: 1.7, cooldown: 1.8, windup: 0.7, radius: 0.45, height: 1.6,
  weak: { fire: 2, slash: 1.2 }, onHit: ['poison', 0.5], loot: [['mushroom', 1, 3, 0.9], ['glowcap', 0, 2, 0.5]], gold: [0, 3], xp: 18,
  biomes: [Biome.MushroomGrove], group: [1, 3], build: myconid });
E({ id: 'crystal_crawler', name: 'Crystal Crawler', desc: 'A spider grown into the cave walls. Its back glitters; its bite bleeds.',
  hp: 55, dmg: 11, dmgType: 'pierce', speed: 2.6, run: 6.0, reach: 1.5, cooldown: 1.3, windup: 0.4, radius: 0.6, height: 0.9,
  weak: { blunt: 1.6, slash: 0.8 }, onHit: ['bleed', 0.35], loot: [['crystal_shard', 1, 3, 0.9], ['chitin', 1, 2, 0.6]], gold: [0, 5], xp: 26,
  biomes: [Biome.CrystalCaves], group: [1, 3], build: crawler });
E({ id: 'salamander', name: 'Fire Salamander', desc: 'It swims in lava and spits what it swims in.',
  hp: 50, dmg: 10, dmgType: 'fire', speed: 2.4, run: 5.6, reach: 1.6, cooldown: 1.5, windup: 0.5, radius: 0.5, height: 0.7,
  weak: { ice: 2, fire: 0 }, onHit: ['burn', 0.5], loot: [['ember_core', 0, 1, 0.6], ['hide', 1, 1, 0.5]], gold: [1, 6], xp: 24,
  biomes: [Biome.VolcanicAshlands], group: [1, 3], ranged: { kind: 'fireball', speed: 13, range: 12, splash: 1.5, dmgMul: 0.8 }, build: salamander });
E({ id: 'yeti', name: 'Yeti', desc: 'Its roar brings down snow. Its arms bring down everything else.',
  hp: 190, dmg: 25, dmgType: 'blunt', speed: 2.0, run: 5.2, reach: 2.4, cooldown: 2.0, windup: 0.8, radius: 0.85, height: 2.6,
  weak: { fire: 1.5, ice: 0.3 }, onHit: ['stun', 0.3], loot: [['hide', 2, 4, 1], ['raw_meat', 2, 3, 1]], gold: [5, 20], xp: 80,
  biomes: [Biome.SnowyMountains], minDanger: 2.5, group: [1, 1], build: yeti });
E({ id: 'giant_crab', name: 'Giant Crab', desc: 'Armour, claws, and an opinion about your presence on its beach.',
  hp: 70, dmg: 12, dmgType: 'blunt', speed: 1.8, run: 4.0, reach: 1.9, cooldown: 1.6, windup: 0.5, radius: 0.75, height: 0.8,
  weak: { blunt: 1.5, slash: 0.6 }, loot: [['chitin', 1, 3, 0.9], ['raw_meat', 1, 2, 0.9]], gold: [0, 5], xp: 26,
  biomes: [Biome.Beach, Biome.CoastalCliffs], group: [1, 2], build: crab });
E({ id: 'wight', name: 'Barrow Wight', desc: 'A dead lord still guarding his grave goods. Its touch steals warmth.',
  hp: 80, dmg: 14, dmgType: 'shadow', speed: 2.0, run: 4.4, reach: 1.9, cooldown: 1.6, windup: 0.6, radius: 0.45, height: 1.9,
  weak: { holy: 2.2, fire: 1.3, slash: 0.7, pierce: 0.6 }, onHit: ['curse', 0.35], loot: [['bone', 1, 3, 1], ['silver_ore', 0, 1, 0.4], ['gold_ore', 0, 1, 0.2]], gold: [8, 20], xp: 48,
  biomes: [Biome.HauntedMoor], night: true, minDanger: 2, group: [1, 1],
  build: (b) => humanoid(b, { h: 1.9, w: 0.85, skin: [0.6, 0.65, 0.62], cloth: [0.3, 0.32, 0.3], pants: [0.25, 0.26, 0.25], hood: [0.2, 0.22, 0.2], eye: [0.5, 1, 0.8], eyeGlow: 2.2, layer: 'moss_stone', weapon: 'sword' }) });
E({ id: 'gargoyle', name: 'Gargoyle', desc: 'Stone by day. Not by night.',
  hp: 90, dmg: 14, dmgType: 'blunt', speed: 2.4, run: 6.0, reach: 1.8, cooldown: 1.6, windup: 0.5, radius: 0.5, height: 1.7,
  weak: { blunt: 1.5, slash: 0.6, pierce: 0.5 }, loot: [['stone', 2, 5, 1], ['crystal_shard', 0, 1, 0.3]], gold: [3, 12], xp: 40,
  biomes: [Biome.HauntedMoor, Biome.SnowyMountains, Biome.FloatingRocks], night: true, minDanger: 2, group: [1, 2], flying: true, build: gargoyle });
E({ id: 'giant_wasp', name: 'Giant Wasp', desc: 'The size of a dog. Angrier than one.',
  hp: 18, dmg: 7, dmgType: 'poison', speed: 3.5, run: 8.5, reach: 1.2, cooldown: 1.1, windup: 0.3, radius: 0.35, height: 0.6,
  weak: { fire: 1.5, blunt: 1.2 }, onHit: ['poison', 0.5], loot: [['venom_sac', 0, 1, 0.5], ['chitin', 0, 1, 0.4]], gold: [0, 0], xp: 9,
  biomes: [Biome.SunnyMeadows, Biome.MushroomGrove, Biome.RedDesert], group: [2, 4], flying: true, build: wasp });
E({ id: 'bog_lurker', name: 'Bog Lurker', desc: 'A toadling’s grandmother, grown fat on travellers.',
  hp: 85, dmg: 15, dmgType: 'slash', speed: 1.8, run: 4.6, reach: 1.9, cooldown: 1.6, windup: 0.6, radius: 0.75, height: 1.4,
  weak: { fire: 1.5, blunt: 1.2 }, onHit: ['bleed', 0.5], loot: [['toad_slime', 2, 4, 1], ['raw_meat', 1, 2, 0.8]], gold: [2, 10], xp: 38,
  biomes: [Biome.MistySwamp, Biome.SunkenForest], minDanger: 1.8, group: [1, 1], ambush: true, scale: 1.8, build: (b) => { toad(b); } });
E({ id: 'will_o_wisp', name: 'Will-o’-the-Wisp', desc: 'A pretty light that wants you to follow it into the deep water.',
  hp: 16, dmg: 6, dmgType: 'shadow', speed: 2.8, run: 6, reach: 1.2, cooldown: 1.5, windup: 0.5, radius: 0.3, height: 0.6,
  weak: { slash: 0.4, pierce: 0.4, holy: 2, ice: 1.5 }, onHit: ['curse', 0.2], loot: [['ectoplasm', 0, 1, 0.5]], gold: [0, 2], xp: 12,
  biomes: [Biome.MistySwamp, Biome.HauntedMoor, Biome.SunkenForest], night: true, group: [1, 3], flying: true, ranged: { kind: 'spell', speed: 11, range: 12, dmgMul: 0.8 }, build: wisp });


// ------------------------------------------------------------------ bosses
const crown = (b: GeoBuilder, y: number, r: number, col: C3 = [1.1, 0.8, 0.25], z = 0) => {
  const ring = new THREE.CylinderGeometry(r, r * 1.05, r * 0.5, 10, 1, true); ring.translate(0, y, z); add(b, ring, col, 5, V(0, y - 0.3, z), 'white', 0.15);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const sp = new THREE.ConeGeometry(r * 0.18, r * 0.6, 4); sp.translate(Math.sin(a) * r, y + r * 0.5, z + Math.cos(a) * r); add(b, sp, col, 5, V(0, y - 0.3, z), 'white', 0.15); }
};
function dragon(b: GeoBuilder) {
  const sc: C3 = [0.22, 0.2, 0.2], belly: C3 = [0.5, 0.2, 0.08];
  quadruped(b, { body: [0.9, 0.85, 2.0], bodyY: 1.9, legLen: 1.3, legR: 0.22, legX: 0.7, legZ: 1.3, head: [0.45, 0.42, 0.8], headPos: [0, 3.2, -3.0], neck: 1.2, color: sc, dark: [0.14, 0.12, 0.12], tail: 2.4 },
    (bb) => {
      add(bb, ell(0.75, 0.5, 1.6, 0, 1.45, 0), belly, 0, V(), 'lava', 0.35);
      eyes(bb, 0.22, 3.35, -3.55, 0.07, [1, 0.6, 0.1], 3, 5, V(0, 2.6, -1.6));
      for (const sd of [-1, 1]) { const h = new THREE.ConeGeometry(0.1, 0.7, 5); h.rotateX(0.9); h.translate(sd * 0.25, 3.7, -2.7); add(bb, h, [0.6, 0.55, 0.45], 5, V(0, 2.6, -1.6)); }
      for (let i = 0; i < 7; i++) { const sp = new THREE.ConeGeometry(0.12, 0.5, 4); sp.translate(0, 2.8 - i * 0.05, -1.2 + i * 0.5); add(bb, sp, [0.4, 0.12, 0.06], 0, V(), 'lava', 0.3); }
      wings(bb, 3.6, 2.6, -0.3, [0.3, 0.12, 0.08]);
    });
}
function bishop(b: GeoBuilder) {
  humanoid(b, { h: 2.4, w: 1.2, skin: [0.55, 0.65, 0.65], cloth: [0.75, 0.75, 0.68], pants: [0.6, 0.62, 0.58], eye: [0.4, 1, 0.9], eyeGlow: 2.5, layer: 'water_normal', weapon: 'club' });
  const mitre = new THREE.ConeGeometry(0.2, 0.55, 4); mitre.translate(0, 2.5, 0); add(b, mitre, [0.85, 0.82, 0.7], 5, V(0, 2, 0), 'fabric');
  const robe = new THREE.ConeGeometry(0.6, 1.4, 12, 1, true); robe.translate(0, 0.75, 0); add(b, robe, [0.7, 0.72, 0.65], 0, V(), 'water_normal', 0.2);
}
function lich(b: GeoBuilder) {
  humanoid(b, { h: 2.1, w: 0.85, skin: [0.88, 0.85, 0.76], cloth: [0.22, 0.12, 0.3], pants: [0.2, 0.1, 0.25], hood: [0.18, 0.08, 0.24], eye: [0.5, 1, 0.6], eyeGlow: 3, layer: 'fabric', weapon: 'none' });
  const robe = new THREE.ConeGeometry(0.55, 1.3, 12, 1, true); robe.translate(0, 0.7, 0); add(b, robe, [0.2, 0.1, 0.28], 0, V(), 'fabric');
  crown(b, 2.02, 0.12, [0.6, 0.9, 0.7]);
}
function hollowKing(b: GeoBuilder) {
  humanoid(b, { h: 2.6, w: 1.35, skin: [0.05, 0.05, 0.06], cloth: [0.1, 0.1, 0.12], pants: [0.08, 0.08, 0.1], eye: [1, 0.25, 0.1], eyeGlow: 4, layer: 'basalt', weapon: 'sword' });
  crown(b, 2.47, 0.15, [0.2, 0.2, 0.25]);
  const cape = new THREE.ConeGeometry(0.75, 2.0, 12, 1, true, Math.PI * 0.5, Math.PI); cape.translate(0, 1.4, 0.15); add(b, cape, [0.3, 0.04, 0.05], 0, V(), 'fabric');
}

const BOSS = (d: Omit<EnemyDef, 'group' | 'biomes'> & { biomes?: Biome[] }) => E({ group: [1, 1], biomes: [], ...d });
BOSS({ id: 'troll_king', name: 'The Troll King', desc: 'He crowned himself with a mountain’s knuckle. Twice.', scale: 1.5,
  hp: 900, dmg: 34, dmgType: 'blunt', speed: 1.8, run: 4.2, reach: 3.6, cooldown: 2.2, windup: 1.0, radius: 1.3, height: 4.4,
  weak: { fire: 1.3, pierce: 1.1 }, onHit: ['stun', 0.4], loot: [['troll_hide', 2, 3, 1], ['gold_bar', 1, 2, 1]], gold: [80, 140], xp: 600,
  boss: { title: 'King under the Hill', phases: [{ at: 0.6, summon: ['troll', 1], say: 'The Troll King bellows for his kin!' }, { at: 0.3, speedMul: 1.3, dmgMul: 1.2, say: 'The Troll King rages!' }], slam: { radius: 5, dmg: 40, every: 7, type: 'blunt' }, drops: ['troll_kings_maul', 'heart_of_the_mountain'] },
  build: (b) => { troll(b); crown(b, 2.72, 0.2, undefined, -0.18); } });
BOSS({ id: 'scorpion_queen', name: 'The Scorpion Queen', desc: 'Mother of the labyrinth. Every scorpion in the dark is one of hers.', scale: 2.6,
  hp: 760, dmg: 26, dmgType: 'poison', speed: 2.2, run: 5.4, reach: 3.6, cooldown: 1.6, windup: 0.6, radius: 1.5, height: 2.3,
  weak: { blunt: 1.4, ice: 1.4 }, onHit: ['poison', 0.6], loot: [['chitin', 4, 6, 1], ['venom_sac', 2, 3, 1]], gold: [60, 110], xp: 520,
  ranged: { kind: 'spit', speed: 15, range: 16, dmgMul: 0.7 },
  boss: { title: 'Mother of the Labyrinth', phases: [{ at: 0.7, summon: ['scorpion', 3], say: 'The Queen’s brood pours from the walls!' }, { at: 0.45, ranged: true, say: 'The Queen spits venom!' }, { at: 0.2, speedMul: 1.35, summon: ['scorpion', 2] }], slam: { radius: 4.5, dmg: 30, every: 8, type: 'pierce' }, drops: ['queens_stinger', 'scorpion_queens_carapace'] },
  build: scorpion });
BOSS({ id: 'drowned_bishop', name: 'The Drowned Bishop', desc: 'He preached to the flood until it answered. He still preaches.', scale: 1.1,
  hp: 820, dmg: 28, dmgType: 'ice', speed: 1.9, run: 4.4, reach: 2.8, cooldown: 1.8, windup: 0.8, radius: 0.8, height: 2.6,
  weak: { fire: 1.4, holy: 1.6, slash: 0.8 }, onHit: ['frozen', 0.35], loot: [['crystal_shard', 2, 4, 1]], gold: [70, 120], xp: 560,
  ranged: { kind: 'frost', speed: 15, range: 18 },
  boss: { title: 'Shepherd of the Sunken Choir', phases: [{ at: 0.85, ranged: true }, { at: 0.55, summon: ['water_spirit', 2], say: 'The drowned choir rises!' }, { at: 0.25, speedMul: 1.25, dmgMul: 1.2 }], slam: { radius: 5, dmg: 32, every: 9, type: 'ice' }, drops: ['bishops_censer', 'crown_of_the_drowned', 'bishops_mitre'] },
  build: bishop });
BOSS({ id: 'golden_falcon', name: 'The Golden Falcon', desc: 'Too fast to follow, too bright to look at. It hunts the hunters.', scale: 1.4,
  hp: 420, dmg: 18, dmgType: 'slash', speed: 4.5, run: 11, reach: 1.9, cooldown: 1.0, windup: 0.35, radius: 0.8, height: 1.2,
  weak: { pierce: 1.5, ice: 1.2 }, onHit: ['bleed', 0.5], loot: [['fiber', 2, 4, 1]], gold: [40, 90], xp: 380, flying: true,
  biomes: [Biome.SunnyMeadows, Biome.CoastalCliffs], minDanger: 2.2, rare: 0.06,
  boss: { title: 'The Sun’s Own Hunter', phases: [{ at: 0.5, speedMul: 1.4, say: 'The Golden Falcon screams and dives!' }], drops: ['falcon_wing', 'falconers_glove'] },
  build: falcon });
BOSS({ id: 'ash_dragon', name: 'The Ash Dragon', desc: 'It sleeps under the volcanoes and dreams of burning cities.', scale: 1.25,
  hp: 1800, dmg: 40, dmgType: 'fire', speed: 2.0, run: 5.0, reach: 4.5, cooldown: 2.0, windup: 1.0, radius: 2.2, height: 4.2,
  weak: { ice: 1.6, pierce: 1.1, fire: 0 }, onHit: ['burn', 0.6], loot: [['ember_core', 3, 5, 1], ['gold_bar', 2, 4, 1]], gold: [200, 320], xp: 1400,
  ranged: { kind: 'fireball', speed: 18, range: 26, splash: 3.2, dmgMul: 0.8 },
  boss: { title: 'Dreamer under the Mountain', phases: [{ at: 0.9, ranged: true, say: 'The Ash Dragon draws breath…' }, { at: 0.5, summon: ['fire_imp', 3], say: 'Embers take shape around the dragon!' }, { at: 0.25, speedMul: 1.3, dmgMul: 1.25, say: 'The Ash Dragon roars in fury!' }], slam: { radius: 6, dmg: 45, every: 8, type: 'fire' }, drops: ['ember_tongue', 'ash_dragon_scale', 'stormcallers_gauntlets'] },
  build: dragon });
BOSS({ id: 'hollow_king', name: 'The Hollow King', desc: 'A crown with something inside it that used to be a man.', scale: 1.1,
  hp: 2400, dmg: 36, dmgType: 'shadow', speed: 2.4, run: 5.2, reach: 3.0, cooldown: 1.4, windup: 0.6, radius: 0.9, height: 2.9,
  weak: { holy: 1.8, slash: 0.8, pierce: 0.8 }, onHit: ['curse', 0.5], loot: [['moonstone', 2, 3, 1]], gold: [300, 500], xp: 3000,
  ranged: { kind: 'shadow', speed: 17, range: 20, splash: 2 },
  boss: { title: 'Last of the Crowned', phases: [{ at: 0.66, summon: ['dark_knight', 2], ranged: true, say: '“Kneel.” The Hollow King calls his guard.' }, { at: 0.33, speedMul: 1.35, dmgMul: 1.3, summon: ['wight', 2], say: '“Then break.” The crown blazes black.' }], slam: { radius: 5.5, dmg: 46, every: 6, type: 'shadow' }, drops: ['hollow_kings_crown', 'hollow_edge'] },
  build: hollowKing });
BOSS({ id: 'bandit_lord', name: 'The Bandit Lord', desc: 'Your money or your life — and he already has a lot of both.', scale: 1.2,
  hp: 520, dmg: 24, dmgType: 'slash', speed: 2.6, run: 6.0, reach: 2.4, cooldown: 1.2, windup: 0.5, radius: 0.6, height: 2.2,
  weak: {}, loot: [['gold_bar', 1, 2, 1], ['cooked_meat', 2, 3, 1]], gold: [120, 200], xp: 320,
  boss: { title: 'King of the Roads', phases: [{ at: 0.7, summon: ['bandit', 2], say: '“Lads! Get this one!”' }, { at: 0.35, speedMul: 1.25, summon: ['bandit', 2] }], slam: { radius: 3.5, dmg: 26, every: 9, type: 'slash' }, drops: ['bandit_kings_cleaver', 'midas_ring'] },
  build: (b) => { humanoid(b, { h: 2.0, w: 1.25, skin: [0.78, 0.6, 0.48], cloth: [0.55, 0.15, 0.1], pants: [0.25, 0.2, 0.16], hood: [0.4, 0.1, 0.08], eye: [0.1, 0.1, 0.1], weapon: 'sword' }); crown(b, 1.93, 0.115, [0.8, 0.7, 0.4]); } });
BOSS({ id: 'spider_matriarch', name: 'The Spider Matriarch', desc: 'Older than the forest above her. Her web is the forest’s memory.', scale: 2.4,
  hp: 640, dmg: 22, dmgType: 'poison', speed: 2.4, run: 5.6, reach: 2.8, cooldown: 1.4, windup: 0.5, radius: 1.4, height: 1.7,
  weak: { fire: 1.6, slash: 1.15 }, onHit: ['poison', 0.6], loot: [['chitin', 4, 6, 1], ['venom_sac', 2, 3, 1]], gold: [50, 90], xp: 420,
  ranged: { kind: 'spit', speed: 14, range: 15 },
  boss: { title: 'Weaver of the Deep Wood', phases: [{ at: 0.75, summon: ['spider', 3], say: 'The walls crawl with her children!' }, { at: 0.5, ranged: true }, { at: 0.25, speedMul: 1.3, summon: ['spider', 3] }], slam: { radius: 4, dmg: 26, every: 9, type: 'poison' }, drops: ['the_last_thread', 'lachesis_measure'] },
  build: spider });
BOSS({ id: 'kobold_king', name: 'The Kobold King', desc: 'Small, clever, enormously rich, and entirely surrounded by kobolds.', scale: 1.6,
  hp: 460, dmg: 20, dmgType: 'pierce', speed: 2.8, run: 6.2, reach: 3.0, cooldown: 1.2, windup: 0.5, radius: 0.6, height: 1.8,
  weak: { slash: 1.2 }, loot: [['gold_ore', 2, 4, 1], ['crystal_shard', 2, 3, 1]], gold: [150, 260], xp: 300,
  boss: { title: 'Lord of the Glittering Mine', phases: [{ at: 0.8, summon: ['kobold', 3], say: '“Protect the crown!”' }, { at: 0.5, summon: ['kobold', 3] }, { at: 0.2, speedMul: 1.4, summon: ['goblin', 2] }], drops: ['kobold_kings_crown', 'thunder_bolt'] },
  build: (b) => { humanoid(b, { h: 1.1, w: 1.0, skin: [0.6, 0.35, 0.2], cloth: [0.6, 0.15, 0.4], pants: [0.6, 0.35, 0.2], eye: [1, 0.8, 0.2], eyeGlow: 0.8, hunch: 0.5, layer: 'red_sand', weapon: 'spear' }); crown(b, 1.0, 0.075, undefined, -0.1); } });
BOSS({ id: 'barrow_lich', name: 'The Barrow Lich', desc: 'Old Hob’s master. It keeps its heart in a jar it has forgotten the location of.', scale: 1.1,
  hp: 600, dmg: 24, dmgType: 'shadow', speed: 2.0, run: 4.4, reach: 2.2, cooldown: 1.8, windup: 0.7, radius: 0.6, height: 2.3,
  weak: { holy: 2.2, blunt: 1.4, pierce: 0.6 }, onHit: ['curse', 0.5], loot: [['bone', 4, 8, 1], ['silver_bar', 1, 2, 1]], gold: [70, 130], xp: 450,
  ranged: { kind: 'shadow', speed: 15, range: 18 },
  boss: { title: 'Keeper of the Barrow', phases: [{ at: 0.95, ranged: true }, { at: 0.6, summon: ['skeleton', 3], say: 'The dead answer the Lich’s call!' }, { at: 0.3, summon: ['skeleton_archer', 2], speedMul: 1.2 }], drops: ['gravediggers_spade', 'ring_of_the_ninth_hour', 'signet_of_the_herald'] },
  build: lich });
BOSS({ id: 'swamp_mother', name: 'The Hag Mother', desc: 'All the swamp hags call her mother. None of them say it fondly.', scale: 1.5,
  hp: 560, dmg: 22, dmgType: 'poison', speed: 2.0, run: 4.6, reach: 2.6, cooldown: 1.6, windup: 0.7, radius: 0.8, height: 2.3,
  weak: { fire: 1.5, holy: 1.4 }, onHit: ['curse', 0.6], loot: [['glowcap', 3, 5, 1], ['moonpetal', 1, 2, 1]], gold: [60, 110], xp: 400,
  ranged: { kind: 'spit', speed: 14, range: 16 },
  boss: { title: 'Mother of Curses', phases: [{ at: 0.9, ranged: true }, { at: 0.6, summon: ['will_o_wisp', 3], say: 'Lights gather in the mist…' }, { at: 0.3, summon: ['swamp_hag', 1], speedMul: 1.2 }], slam: { radius: 4, dmg: 24, every: 10, type: 'poison' }, drops: ['widows_veil', 'cloak_of_the_ashen'] },
  build: hag });
BOSS({ id: 'frost_colossus', name: 'The Frost Colossus', desc: 'A mountain’s winter given legs and a single, cold thought.', scale: 1.6,
  hp: 980, dmg: 34, dmgType: 'ice', speed: 1.5, run: 3.6, reach: 3.8, cooldown: 2.4, windup: 1.1, radius: 1.4, height: 4.3,
  weak: { fire: 1.8, blunt: 1.2, ice: 0 }, onHit: ['frozen', 0.5], loot: [['crystal_shard', 3, 6, 1], ['moonstone', 0, 1, 0.5]], gold: [80, 150], xp: 620,
  boss: { title: 'Winter’s Last Word', phases: [{ at: 0.65, summon: ['frost_wolf', 3], say: 'Wolves howl out of the blizzard!' }, { at: 0.3, speedMul: 1.3, dmgMul: 1.2 }], slam: { radius: 6, dmg: 42, every: 7, type: 'ice' }, drops: ['boots_of_the_hare', 'moonsilver_blade', 'pilgrims_sandals'] },
  build: golem });


// ------------------------------------------------------------------ friends (never hostile)
E({ id: 'loyal_hound', name: 'Loyal Hound', desc: 'A grey hound with amber eyes. It came with the wish, and it will not leave.',
  hp: 120, dmg: 12, dmgType: 'pierce', speed: 3, run: 8.5, reach: 1.6, cooldown: 1.1, windup: 0.3, radius: 0.45, height: 1.0,
  weak: {}, loot: [], gold: [0, 0], xp: 0, biomes: [], group: [1, 1], scale: 0.85, build: (b) => direWolf(b, [0.45, 0.43, 0.42], [1, 0.7, 0.2]) });
E({ id: 'citadel_guard', name: 'Pale Guard', desc: 'One of the Citadel’s watch, sworn to stand with you.',
  hp: 200, dmg: 16, dmgType: 'slash', speed: 2.6, run: 6.0, reach: 2.0, cooldown: 1.3, windup: 0.4, radius: 0.45, height: 1.9,
  weak: {}, loot: [], gold: [0, 0], xp: 0, biomes: [], group: [1, 1],
  build: (b) => humanoid(b, { h: 1.9, w: 1.1, skin: [0.75, 0.6, 0.5], cloth: [0.9, 0.88, 0.82], pants: [0.6, 0.58, 0.55], eye: [0.1, 0.1, 0.1], layer: 'white', weapon: 'spear' }) });
E({ id: 'cathedral_warden', name: 'The Warden of the Cathedral', desc: 'The Herald’s executioner. Faceless, patient, and never late.', scale: 1.25,
  hp: 1100, dmg: 30, dmgType: 'shadow', speed: 2.2, run: 5.0, reach: 2.8, cooldown: 1.5, windup: 0.6, radius: 0.7, height: 2.5,
  weak: { holy: 1.6, blunt: 1.2 }, onHit: ['curse', 0.4], loot: [['silver_bar', 1, 2, 1]], gold: [120, 200], xp: 900, biomes: [], group: [1, 1],
  ranged: { kind: 'shadow', speed: 16, range: 16 },
  boss: { title: 'Hand of the Herald', phases: [{ at: 0.7, ranged: true, say: '“The rules were explained to you.”' }, { at: 0.35, summon: ['dark_knight', 1], speedMul: 1.25, say: '“The Cathedral remembers every name.”' }], slam: { radius: 5, dmg: 36, every: 8, type: 'shadow' }, drops: ['veil_of_the_stranger', 'aegis_of_dawn'] },
  build: (b) => { humanoid(b, { h: 2.0, w: 1.3, skin: [0.15, 0.15, 0.16], cloth: [0.18, 0.18, 0.2], pants: [0.12, 0.12, 0.14], hood: [0.1, 0.1, 0.12], eye: [1, 0.62, 0.1], eyeGlow: 3, layer: 'basalt', weapon: 'sword' }); } });
