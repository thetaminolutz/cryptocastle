// Wildlife: deer, rabbits, boars, wolves, bears, sheep, goats, horses, birds, fish.
// Each species is one instanced draw call; legs/head/tail/wings are animated on the
// GPU with simple "bones". Behaviour: wander, graze, flee, stalk, fly, swim.
// (Fighting, taming and riding come with the combat milestone.)
import * as THREE from 'three';
import { GeoBuilder } from '../world/vegetation';
import { propMaterial } from '../world/shaders';
import { Species, BIOMES } from '../world/biomes';
import type { World } from '../world/world';
import type { TerrainGen } from '../world/terrain';
import type { ShadowSystem } from '../engine/shadows';

type Behaviour = 'prey' | 'neutral' | 'predator' | 'bird' | 'fish';
type RGB = [number, number, number];

interface SpeciesDef {
  name: string; behaviour: Behaviour; walk: number; run: number; flee: number; herd: [number, number];
  build: (b: GeoBuilder) => void;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function part(b: GeoBuilder, g: THREE.BufferGeometry, color: RGB, bone: number, pivot: THREE.Vector3) {
  b.add(g, { layer: 'white', color, ao: (p) => 0.6 + 0.4 * Math.min(1, Math.max(0, p.y / 1.2)) }, undefined, [bone, pivot]);
}
function ellipsoid(rx: number, ry: number, rz: number, x: number, y: number, z: number) {
  const g = new THREE.SphereGeometry(1, 12, 9); g.scale(rx, ry, rz); g.translate(x, y, z); return g;
}
function limb(r: number, len: number, x: number, top: number, z: number) {
  const g = new THREE.CapsuleGeometry(r, len, 2, 6); g.translate(x, top - len / 2 - r, z); return g;
}

interface Quad {
  body: [number, number, number]; bodyY: number; legLen: number; legR: number; legX: number; legZ: number;
  head: [number, number, number]; headPos: [number, number, number]; neck?: number; color: RGB; dark: RGB; tail?: number;
}
function quadruped(b: GeoBuilder, q: Quad, extra?: (b: GeoBuilder) => void) {
  part(b, ellipsoid(q.body[0], q.body[1], q.body[2], 0, q.bodyY, 0), q.color, 0, V());
  const top = q.bodyY - q.body[1] * 0.3;
  const legs: [number, number, number][] = [[-q.legX, 1, -q.legZ], [q.legX, 2, -q.legZ], [-q.legX, 3, q.legZ], [q.legX, 4, q.legZ]];
  for (const [x, bone, z] of legs) part(b, limb(q.legR, q.legLen, x, top, z), q.dark, bone, V(x, top, z));
  const [hx, hy, hz] = q.headPos;
  const neckPivot = V(0, q.bodyY + q.body[1] * 0.4, -q.body[2] * 0.75);
  if (q.neck) {
    const n = new THREE.CapsuleGeometry(q.head[0] * 0.55, q.neck, 2, 6);
    n.rotateX(0.7); n.translate(0, (neckPivot.y + hy) / 2, (neckPivot.z + hz) / 2);
    part(b, n, q.color, 5, neckPivot);
  }
  part(b, ellipsoid(q.head[0], q.head[1], q.head[2], hx, hy, hz), q.color, 5, neckPivot);
  if (q.tail) {
    const t = new THREE.CapsuleGeometry(q.tail * 0.25, q.tail, 2, 5); t.rotateX(-0.9);
    t.translate(0, q.bodyY + q.body[1] * 0.3 - q.tail * 0.3, q.body[2] + q.tail * 0.35);
    part(b, t, q.dark, 6, V(0, q.bodyY + q.body[1] * 0.3, q.body[2] * 0.9));
  }
  extra?.(b);
}

const SPECIES: SpeciesDef[] = [];
SPECIES[Species.Rabbit] = { name: 'Rabbit', behaviour: 'prey', walk: 1.2, run: 7, flee: 7, herd: [1, 2], build: (b) => quadruped(b,
  { body: [0.13, 0.12, 0.2], bodyY: 0.18, legLen: 0.06, legR: 0.04, legX: 0.07, legZ: 0.1, head: [0.08, 0.08, 0.1], headPos: [0, 0.3, -0.18], color: [0.55, 0.45, 0.35], dark: [0.45, 0.36, 0.28], tail: 0.04 },
  (b) => { for (const s of [-1, 1]) { const e = ellipsoid(0.025, 0.1, 0.015, s * 0.035, 0.45, -0.17); part(b, e, [0.6, 0.5, 0.42], 5, V(0, 0.28, -0.15)); } }) };
SPECIES[Species.Deer] = { name: 'Deer', behaviour: 'prey', walk: 1.4, run: 9, flee: 15, herd: [2, 4], build: (b) => quadruped(b,
  { body: [0.28, 0.32, 0.7], bodyY: 1.05, legLen: 0.72, legR: 0.05, legX: 0.16, legZ: 0.48, head: [0.12, 0.13, 0.24], headPos: [0, 1.6, -0.95], neck: 0.4, color: [0.55, 0.38, 0.22], dark: [0.38, 0.26, 0.16], tail: 0.12 },
  (b) => {
    for (const s of [-1, 1]) {
      const a = new THREE.CylinderGeometry(0.015, 0.025, 0.5, 4); a.rotateZ(s * 0.5); a.translate(s * 0.13, 1.92, -0.9);
      part(b, a, [0.85, 0.78, 0.65], 5, V(0, 1.4, -0.7));
      const tine = new THREE.CylinderGeometry(0.01, 0.018, 0.25, 4); tine.rotateX(-0.6); tine.translate(s * 0.2, 2.0, -0.98);
      part(b, tine, [0.85, 0.78, 0.65], 5, V(0, 1.4, -0.7));
    }
  }) };
SPECIES[Species.Boar] = { name: 'Boar', behaviour: 'predator', walk: 1.2, run: 6, flee: 6, herd: [1, 3], build: (b) => quadruped(b,
  { body: [0.32, 0.36, 0.62], bodyY: 0.62, legLen: 0.28, legR: 0.07, legX: 0.18, legZ: 0.38, head: [0.2, 0.2, 0.3], headPos: [0, 0.62, -0.78], color: [0.28, 0.2, 0.15], dark: [0.18, 0.13, 0.1], tail: 0.1 },
  (b) => { for (const s of [-1, 1]) { const t = new THREE.ConeGeometry(0.025, 0.16, 5); t.rotateX(-2.2); t.translate(s * 0.12, 0.56, -1.0); part(b, t, [0.95, 0.92, 0.82], 5, V(0, 0.75, -0.55)); } }) };
SPECIES[Species.Wolf] = { name: 'Wolf', behaviour: 'predator', walk: 1.6, run: 8, flee: 0, herd: [2, 4], build: (b) => quadruped(b,
  { body: [0.22, 0.26, 0.6], bodyY: 0.75, legLen: 0.45, legR: 0.05, legX: 0.13, legZ: 0.4, head: [0.15, 0.15, 0.26], headPos: [0, 1.0, -0.78], neck: 0.2, color: [0.45, 0.44, 0.42], dark: [0.3, 0.29, 0.28], tail: 0.4 },
  (b) => { for (const s of [-1, 1]) { const e = new THREE.ConeGeometry(0.05, 0.13, 4); e.translate(s * 0.08, 1.18, -0.72); part(b, e, [0.35, 0.34, 0.33], 5, V(0, 0.95, -0.55)); } }) };
SPECIES[Species.Bear] = { name: 'Bear', behaviour: 'predator', walk: 1.1, run: 7, flee: 0, herd: [1, 1], build: (b) => quadruped(b,
  { body: [0.55, 0.6, 0.95], bodyY: 1.0, legLen: 0.45, legR: 0.14, legX: 0.32, legZ: 0.6, head: [0.3, 0.3, 0.34], headPos: [0, 1.25, -1.15], color: [0.3, 0.2, 0.12], dark: [0.22, 0.15, 0.09], tail: 0.08 },
  (b) => { for (const s of [-1, 1]) part(b, ellipsoid(0.08, 0.08, 0.05, s * 0.2, 1.55, -1.1), [0.24, 0.16, 0.1], 5, V(0, 1.3, -0.85)); }) };
SPECIES[Species.Sheep] = { name: 'Sheep', behaviour: 'neutral', walk: 0.9, run: 5, flee: 4, herd: [3, 6], build: (b) => quadruped(b,
  { body: [0.38, 0.36, 0.55], bodyY: 0.75, legLen: 0.4, legR: 0.045, legX: 0.18, legZ: 0.35, head: [0.13, 0.15, 0.22], headPos: [0, 0.95, -0.62], color: [0.9, 0.88, 0.82], dark: [0.15, 0.13, 0.12] }) };
SPECIES[Species.Goat] = { name: 'Goat', behaviour: 'neutral', walk: 1.1, run: 6, flee: 6, herd: [2, 4], build: (b) => quadruped(b,
  { body: [0.26, 0.3, 0.5], bodyY: 0.8, legLen: 0.48, legR: 0.045, legX: 0.14, legZ: 0.32, head: [0.12, 0.14, 0.2], headPos: [0, 1.15, -0.62], neck: 0.15, color: [0.82, 0.8, 0.75], dark: [0.4, 0.37, 0.33], tail: 0.08 },
  (b) => { for (const s of [-1, 1]) { const h = new THREE.TorusGeometry(0.1, 0.025, 4, 8, Math.PI); h.rotateY(Math.PI / 2); h.translate(s * 0.07, 1.3, -0.55); part(b, h, [0.35, 0.3, 0.25], 5, V(0, 1.0, -0.45)); } }) };
SPECIES[Species.Horse] = { name: 'Horse', behaviour: 'neutral', walk: 1.6, run: 12, flee: 6, herd: [2, 4], build: (b) => quadruped(b,
  { body: [0.36, 0.42, 0.95], bodyY: 1.35, legLen: 0.95, legR: 0.07, legX: 0.2, legZ: 0.7, head: [0.14, 0.18, 0.38], headPos: [0, 2.1, -1.35], neck: 0.6, color: [0.42, 0.26, 0.14], dark: [0.12, 0.08, 0.06], tail: 0.6 },
  (b) => { const m = new THREE.BoxGeometry(0.06, 0.5, 0.7); m.rotateX(0.75); m.translate(0, 1.95, -1.0); part(b, m, [0.1, 0.07, 0.05], 5, V(0, 1.75, -0.75)); }) };
SPECIES[Species.Bird] = { name: 'Bird', behaviour: 'bird', walk: 0, run: 9, flee: 0, herd: [1, 3], build: (b) => {
  part(b, ellipsoid(0.1, 0.09, 0.22, 0, 0, 0), [0.2, 0.18, 0.2], 0, V());
  part(b, ellipsoid(0.07, 0.07, 0.08, 0, 0.05, -0.2), [0.18, 0.16, 0.18], 0, V());
  const beak = new THREE.ConeGeometry(0.02, 0.08, 4); beak.rotateX(-Math.PI / 2); beak.translate(0, 0.04, -0.3); part(b, beak, [0.8, 0.6, 0.2], 0, V());
  for (const s of [-1, 1]) {
    const w = new THREE.BoxGeometry(0.5, 0.015, 0.2); w.translate(s * 0.3, 0.03, 0);
    part(b, w, [0.25, 0.22, 0.24], s < 0 ? 7 : 8, V(s * 0.06, 0.03, 0));
  }
  const t = new THREE.BoxGeometry(0.12, 0.01, 0.15); t.translate(0, 0, 0.27); part(b, t, [0.18, 0.16, 0.18], 0, V());
} };
SPECIES[Species.Fish] = { name: 'Fish', behaviour: 'fish', walk: 0.6, run: 4, flee: 4, herd: [2, 5], build: (b) => {
  part(b, ellipsoid(0.06, 0.1, 0.25, 0, 0, 0), [0.55, 0.62, 0.68], 0, V());
  const tail = new THREE.ConeGeometry(0.09, 0.16, 4); tail.rotateX(Math.PI / 2); tail.scale(0.3, 1, 1); tail.translate(0, 0, 0.3);
  part(b, tail, [0.45, 0.5, 0.58], 6, V(0, 0, 0.22));
} };

interface Animal {
  sp: Species; pos: THREE.Vector3; yaw: number; speed: number; target: THREE.Vector3; timer: number;
  phase: number; graze: number; mode: 'idle' | 'walk' | 'run'; scale: number; home: THREE.Vector3; alt: number;
}

class SpeciesLayer {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.InstancedBufferGeometry();
  private inst: THREE.InstancedBufferAttribute;
  private inst2: THREE.InstancedBufferAttribute;
  private anim: THREE.InstancedBufferAttribute;
  readonly shadowMat: THREE.ShaderMaterial;
  constructor(def: SpeciesDef, max: number) {
    const b = new GeoBuilder();
    def.build(b);
    const base = b.build();
    for (const [n, a] of Object.entries(base.attributes)) this.geo.setAttribute(n, a);
    this.geo.setIndex(base.index);
    const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.inst = mk(); this.inst2 = mk(); this.anim = mk();
    this.geo.setAttribute('aInst', this.inst); this.geo.setAttribute('aInst2', this.inst2); this.geo.setAttribute('aAnim', this.anim);
    this.geo.instanceCount = 0;
    this.mesh = new THREE.Mesh(this.geo, propMaterial({ animal: true }));
    this.shadowMat = propMaterial({ animal: true }, true);
    this.mesh.frustumCulled = false;
  }
  write(list: Animal[]) {
    const a = this.inst.array as Float32Array, b = this.inst2.array as Float32Array, c = this.anim.array as Float32Array;
    const n = Math.min(list.length, a.length / 4);
    for (let i = 0; i < n; i++) {
      const an = list[i], o = i * 4;
      a[o] = an.pos.x; a[o + 1] = an.pos.y; a[o + 2] = an.pos.z; a[o + 3] = an.yaw;
      b[o] = an.scale; b[o + 1] = 0; b[o + 2] = 0; b[o + 3] = 0;
      const def = SPECIES[an.sp];
      const move = def.behaviour === 'bird' ? 1 : Math.min(1.2, an.speed / Math.max(def.walk, 1));
      c[o] = an.phase; c[o + 1] = move; c[o + 2] = def.behaviour === 'bird' ? (an.mode === 'idle' ? 0.15 : 1) : an.graze; c[o + 3] = 0;
    }
    this.inst.needsUpdate = this.inst2.needsUpdate = this.anim.needsUpdate = true;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
  }
}

const MAX_PER_SPECIES = 16;
const MAX_TOTAL = 30;

export class Wildlife {
  readonly group = new THREE.Group();
  private layers: SpeciesLayer[] = [];
  private animals: Animal[] = [];
  private spawnTimer = 0;
  private rnd = Math.random;

  constructor(private world: World, private gen: TerrainGen, shadows: ShadowSystem) {
    SPECIES.forEach((def) => {
      const l = new SpeciesLayer(def, MAX_PER_SPECIES);
      this.layers.push(l);
      this.group.add(l.mesh);
      shadows.add(l.mesh, l.shadowMat);
    });
  }

  get count() { return this.animals.length; }

  update(dt: number, player: THREE.Vector3, night: boolean) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = 0.8; this.trySpawn(player); }
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      if (a.pos.distanceToSquared(player) > 95 * 95 || !this.world.isLoaded(a.pos.x, a.pos.z)) { this.animals.splice(i, 1); continue; }
      this.think(a, dt, player, night);
    }
    const bySpecies: Animal[][] = SPECIES.map(() => []);
    for (const a of this.animals) bySpecies[a.sp].push(a);
    bySpecies.forEach((list, s) => this.layers[s].write(list));
  }

  private trySpawn(player: THREE.Vector3) {
    if (this.animals.length >= MAX_TOTAL) return;
    const ang = this.rnd() * Math.PI * 2, dist = 35 + this.rnd() * 30;
    const x = player.x + Math.cos(ang) * dist, z = player.z + Math.sin(ang) * dist;
    if (!this.world.isLoaded(x, z)) return;
    const col = this.gen.column(Math.floor(x), Math.floor(z));
    const table = BIOMES[col.biome].animals;
    if (!table.length) return;
    const total = table.reduce((s, e) => s + e[1], 0);
    let r = this.rnd() * total, sp = table[0][0];
    for (const [s, w] of table) { if (r < w) { sp = s; break; } r -= w; }
    const def = SPECIES[sp];
    if (this.animals.filter((a) => a.sp === sp).length >= MAX_PER_SPECIES - def.herd[1]) return;
    const ground = this.world.groundY(x, z);
    const water = this.world.waterSurface(x, ground + 1, z);
    if (def.behaviour === 'fish') { if (water - ground < 1.5) return; }
    else if (water > ground - 0.2 && def.behaviour !== 'bird') return;
    const n = def.herd[0] + Math.floor(this.rnd() * (def.herd[1] - def.herd[0] + 1));
    for (let i = 0; i < n; i++) {
      const px = x + (this.rnd() - 0.5) * 6, pz = z + (this.rnd() - 0.5) * 6;
      if (!this.world.isLoaded(px, pz)) continue;
      const gy = this.world.groundY(px, pz);
      const pos = new THREE.Vector3(px, gy, pz);
      const alt = def.behaviour === 'bird' ? 12 + this.rnd() * 18 : 0;
      if (def.behaviour === 'bird') pos.y += alt;
      if (def.behaviour === 'fish') pos.y = water - 0.6 - this.rnd() * Math.max(0, water - gy - 1.2);
      this.animals.push({ sp, pos, yaw: this.rnd() * 6.28, speed: 0, target: pos.clone(), timer: this.rnd() * 3, phase: this.rnd() * 6, graze: 0, mode: 'idle', scale: 0.85 + this.rnd() * 0.3, home: pos.clone(), alt });
    }
  }

  private think(a: Animal, dt: number, player: THREE.Vector3, night: boolean) {
    const def = SPECIES[a.sp];
    const toPlayer = Math.hypot(player.x - a.pos.x, player.z - a.pos.z);
    a.timer -= dt;
    if (def.behaviour === 'bird') {
      // circle around home, flap
      a.phase += dt * 6;
      const t = performance.now() / 1000 * 0.25 + a.home.x;
      const r = 10 + (a.home.z % 6);
      const tx = a.home.x + Math.cos(t) * r, tz = a.home.z + Math.sin(t) * r;
      const ty = this.world.groundY(tx, tz) + a.alt;
      const dx = tx - a.pos.x, dz = tz - a.pos.z;
      a.yaw = Math.atan2(-dx, -dz);
      a.pos.x += dx * Math.min(1, dt * 2); a.pos.z += dz * Math.min(1, dt * 2); a.pos.y += (ty - a.pos.y) * Math.min(1, dt);
      a.mode = 'walk';
      return;
    }
    // decide
    let fleeing = false;
    if (def.flee > 0 && toPlayer < def.flee && def.behaviour !== 'predator') fleeing = true;
    if (def.behaviour === 'predator' && a.sp === Species.Boar && toPlayer < 5) fleeing = false;
    if (fleeing) {
      const dx = a.pos.x - player.x, dz = a.pos.z - player.z, l = Math.hypot(dx, dz) || 1;
      a.target.set(a.pos.x + (dx / l) * 14, 0, a.pos.z + (dz / l) * 14);
      a.mode = 'run'; a.timer = 2;
    } else if (def.behaviour === 'predator' && (a.sp === Species.Wolf ? night || toPlayer < 18 : toPlayer < 9) && toPlayer > 4) {
      // stalk: keep a menacing distance (attacks arrive with combat)
      const dx = player.x - a.pos.x, dz = player.z - a.pos.z;
      a.target.set(player.x - (dx / toPlayer) * 6, 0, player.z - (dz / toPlayer) * 6);
      a.mode = toPlayer > 12 ? 'run' : 'walk'; a.timer = 1;
    } else if (a.timer <= 0) {
      if (this.rnd() < 0.45) { a.mode = 'idle'; a.timer = 2 + this.rnd() * 5; }
      else {
        const r = def.behaviour === 'fish' ? 5 : 10;
        a.target.set(a.home.x + (this.rnd() - 0.5) * 2 * r, 0, a.home.z + (this.rnd() - 0.5) * 2 * r);
        a.mode = 'walk'; a.timer = 4 + this.rnd() * 6;
      }
    }
    // move
    const want = a.mode === 'run' ? def.run : a.mode === 'walk' ? def.walk : 0;
    const dx = a.target.x - a.pos.x, dz = a.target.z - a.pos.z;
    const dist = Math.hypot(dx, dz);
    let speed = dist < 0.4 ? 0 : want;
    if (speed > 0) {
      let d = Math.atan2(-dx, -dz) - a.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      a.yaw += d * Math.min(1, dt * 5);
      const nx = a.pos.x - Math.sin(a.yaw) * speed * dt, nz = a.pos.z - Math.cos(a.yaw) * speed * dt;
      if (this.world.isLoaded(nx, nz)) {
        if (def.behaviour === 'fish') {
          const w = this.world.waterSurface(nx, a.pos.y, nz), g = this.world.groundNear(nx, nz, a.pos.y);
          if (w - g > 1.2) { a.pos.x = nx; a.pos.z = nz; a.pos.y += (Math.min(w - 0.5, Math.max(g + 0.5, a.pos.y)) - a.pos.y) * dt; }
          else { a.timer = 0; speed = 0; }
        } else {
          const g = this.world.groundNear(nx, nz, a.pos.y);
          const w = this.world.waterSurface(nx, g + 1, nz);
          if (Math.abs(g - a.pos.y) < 1.2 && w < g - 0.1) { a.pos.x = nx; a.pos.z = nz; a.pos.y += (g - a.pos.y) * Math.min(1, dt * 10); }
          else { a.timer = 0; speed = 0; if (a.mode === 'run') a.yaw += 1; }
        }
      }
    }
    a.speed += (speed - a.speed) * Math.min(1, dt * 6);
    a.phase += dt * (2 + a.speed * 3.2);
    const grazing = a.mode === 'idle' && def.behaviour !== 'predator' && def.behaviour !== 'fish';
    a.graze += ((grazing ? 1 : 0) - a.graze) * Math.min(1, dt * 2);
  }
}
