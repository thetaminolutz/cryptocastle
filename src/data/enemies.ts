// Enemy table (data) + procedural models. Bones (GPU-animated, see prop shader):
// 0 body, 1 left arm / front-left leg, 2 left leg / front-right leg, 3 back-left leg,
// 4 right leg / back-right leg, 5 head, 6 tail, 7/8 wings, 9 weapon arm.
import * as THREE from 'three';
import { GeoBuilder } from '../world/vegetation';
import { Biome } from '../world/biomes';
import type { DmgType } from './items';

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
}

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
export function humanoid(b: GeoBuilder, o: Humanoid) {
  const s = o.h / 1.8, w = o.w;
  const hipY = 0.92 * s, shY = 1.42 * s, headY = 1.62 * s + (o.hunch ? -o.hunch * 0.15 : 0);
  const headZ = -(o.hunch ?? 0) * 0.2;
  // torso + belt
  add(b, ell(0.2 * w, 0.32 * s, 0.13 * w, 0, 1.18 * s, (o.hunch ?? 0) * -0.05, 12), o.cloth, 0, V(), o.layer ?? 'fabric');
  add(b, ell(0.17 * w, 0.06 * s, 0.12 * w, 0, hipY + 0.02, 0, 10), [0.2, 0.15, 0.1], 0, V());
  // head
  add(b, ell(0.105 * s, 0.125 * s, 0.11 * s, 0, headY, headZ, 12), o.skin, 5, V(0, 1.5 * s, 0));
  if (o.hood) add(b, ell(0.135 * s, 0.15 * s, 0.14 * s, 0, headY + 0.03 * s, headZ + 0.02, 12), o.hood, 5, V(0, 1.5 * s, 0), 'fabric');
  eyes(b, 0.038 * s, headY + 0.01, headZ - 0.1 * s, 0.017 * s, o.eye, o.eyeGlow ?? 0.25, 5, V(0, 1.5 * s, 0));
  // arms: left = bone 1, right (weapon) = bone 9
  for (const [side, bone] of [[-1, 1], [1, 9]] as const) {
    const x = side * 0.24 * w;
    add(b, cap(0.055 * w, 0.48 * s, x, shY, 0), o.cloth, bone, V(x, shY, 0), o.layer ?? 'fabric');
    add(b, ell(0.045 * w, 0.055 * s, 0.045 * w, x, shY - 0.62 * s, 0, 8), o.skin, bone, V(x, shY, 0));
  }
  // weapon in the right hand
  const hx = 0.24 * w, hy = shY - 0.62 * s;
  if (o.weapon === 'dagger') { const g = new THREE.ConeGeometry(0.02, 0.3, 4); g.rotateX(-Math.PI / 2); g.translate(hx, hy, -0.18); add(b, g, [0.7, 0.7, 0.72], 9, V(hx, shY, 0)); }
  if (o.weapon === 'club') { const g = new THREE.CylinderGeometry(0.06, 0.03, 0.75, 6); g.rotateX(-Math.PI / 2.4); g.translate(hx, hy + 0.05, -0.3); add(b, g, [0.4, 0.28, 0.18], 9, V(hx, shY, 0), 'bark_oak'); }
  if (o.weapon === 'sword') { const g = new THREE.BoxGeometry(0.05, 0.02, 0.8); g.translate(hx, hy, -0.42); add(b, g, [0.62, 0.6, 0.58], 9, V(hx, shY, 0)); }
  if (o.weapon === 'spear') { const g = new THREE.CylinderGeometry(0.018, 0.018, 1.5 * s, 5); g.rotateX(-Math.PI / 2.2); g.translate(hx, hy + 0.1, -0.45); add(b, g, [0.45, 0.32, 0.2], 9, V(hx, shY, 0)); const t = new THREE.ConeGeometry(0.035, 0.16, 4); t.rotateX(-Math.PI / 2.2); t.translate(hx, hy + 0.16, -1.15 * s); add(b, t, [0.6, 0.6, 0.62], 9, V(hx, shY, 0)); }
  // legs: left = bone 2, right = bone 4
  if (o.legs !== false) for (const [side, bone] of [[-1, 2], [1, 4]] as const) {
    const x = side * 0.1 * w;
    add(b, cap(0.07 * w, 0.72 * s, x, hipY, 0), o.pants, bone, V(x, hipY, 0), o.layer ?? 'fabric');
    add(b, ell(0.06 * w, 0.05, 0.11 * w, x, 0.05, -0.04, 8), [0.18, 0.13, 0.1], bone, V(x, hipY, 0));
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
