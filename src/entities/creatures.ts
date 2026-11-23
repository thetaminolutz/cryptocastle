// Hostile creatures: spawning by biome / danger / time of day, AI (ambush, chase with
// flanking, telegraphed attacks, fleeing, calling for help, stun), hit reactions,
// death and lootable bodies. Rendered with one instanced, GPU-animated draw call
// per enemy type (same shader as wildlife).
import * as THREE from 'three';
import { GeoBuilder } from '../world/vegetation';
import { propMaterial } from '../world/shaders';
import { ENEMIES, EnemyDef, Status } from '../data/enemies';
import type { DmgType } from '../data/items';
import type { World } from '../world/world';
import type { TerrainGen } from '../world/terrain';
import type { ShadowSystem } from '../engine/shadows';
import type { Building } from '../world/building';

export interface Creature {
  def: EnemyDef; pos: THREE.Vector3; yaw: number;
  hp: number; maxHp: number; dmgMul: number; elite: boolean; scale: number;
  state: 'hidden' | 'idle' | 'wander' | 'chase' | 'windup' | 'recover' | 'flee' | 'stunned' | 'slam' | 'dead';
  timer: number; attackT: number; phase: number; speed: number;
  target: THREE.Vector3; home: THREE.Vector3; flash: number; tilt: number; deadT: number; looted: boolean;
  slot: number; alerted: boolean; knock: THREE.Vector3; burn: number; hover: number;
  /** bosses: phase reached, slam timer, movement multiplier; ranged: this windup ends in a shot */
  phaseIdx: number; slamT: number; speedMul: number; shooting: boolean; rangedOn: boolean;
}

export interface CreatureHooks {
  /** the creature's strike lands (if the player is still in reach) */
  strike(c: Creature): void;
  /** a ranged attack is released */
  shoot(c: Creature): void;
  /** a boss's telegraphed ground slam lands */
  slam(c: Creature, radius: number, dmg: number, type: DmgType): void;
  toast(text: string, color?: string): void;
}

class Layer {
  readonly mesh: THREE.Mesh;
  readonly shadow: THREE.ShaderMaterial;
  private geo = new THREE.InstancedBufferGeometry();
  private a: THREE.InstancedBufferAttribute; private b: THREE.InstancedBufferAttribute; private c: THREE.InstancedBufferAttribute;
  constructor(def: EnemyDef, max: number) {
    const gb = new GeoBuilder(); def.build(gb);
    const base = gb.build();
    for (const [n, at] of Object.entries(base.attributes)) this.geo.setAttribute(n, at);
    this.geo.setIndex(base.index);
    const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.a = mk(); this.b = mk(); this.c = mk();
    this.geo.setAttribute('aInst', this.a); this.geo.setAttribute('aInst2', this.b); this.geo.setAttribute('aAnim', this.c);
    this.mesh = new THREE.Mesh(this.geo, propMaterial({ animal: true }));
    this.shadow = propMaterial({ animal: true }, true);
    this.mesh.frustumCulled = false;
  }
  write(list: Creature[]) {
    const A = this.a.array as Float32Array, Bv = this.b.array as Float32Array, C = this.c.array as Float32Array;
    const n = Math.min(list.length, A.length / 4);
    for (let i = 0; i < n; i++) {
      const k = list[i], o = i * 4;
      const sink = k.state === 'hidden' ? -0.45 * k.def.height : 0;
      A[o] = k.pos.x; A[o + 1] = k.pos.y + sink + k.hover; A[o + 2] = k.pos.z; A[o + 3] = k.yaw;
      Bv[o] = k.scale; Bv[o + 1] = k.elite ? 1 : 0.5; Bv[o + 2] = k.tilt; Bv[o + 3] = k.flash;
      const fly = k.def.flying ? 0.5 : 0;
      C[o] = k.phase; C[o + 1] = k.state === 'dead' ? 0 : Math.min(1.3, k.speed / Math.max(1, k.def.speed)); C[o + 2] = fly; C[o + 3] = k.attackT;
    }
    this.a.needsUpdate = this.b.needsUpdate = this.c.needsUpdate = true;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
  }
}

const MAX = 14;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Creatures {
  readonly group = new THREE.Group();
  list: Creature[] = [];
  private layers = new Map<string, Layer>();
  private spawnTimer = 2;
  private boxes: import('../world/building').AABB[] = [];
  /** kills per enemy id (bestiary) */
  kills: Record<string, number> = {};
  enabled = true;
  private rings: THREE.Mesh[] = [];
  /** called once when a creature dies (quests, arena) */
  onDeath: ((c: Creature) => void) | null = null;

  constructor(private world: World, private gen: TerrainGen, private building: Building, shadows: ShadowSystem, public hooks: CreatureHooks) {
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.35, 0.15), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
      ring.visible = false; this.rings.push(ring); this.group.add(ring);
    }
    for (const def of Object.values(ENEMIES)) {
      const l = new Layer(def, MAX);
      this.layers.set(def.id, l);
      this.group.add(l.mesh);
      shadows.add(l.mesh, l.shadow);
    }
  }

  get alive() { return this.list.filter((c) => c.state !== 'dead'); }

  spawn(def: EnemyDef, pos: THREE.Vector3, danger: number, slot = 0) {
    const elite = Math.random() < 0.05 + Math.min(0.1, danger * 0.01);
    const scaleHp = 1 + (danger - 1) * 0.18;
    const hp = def.hp * scaleHp * (elite ? 2.2 : 1);
    const c: Creature = {
      def, pos: pos.clone(), yaw: Math.random() * 6.28, hp, maxHp: hp, dmgMul: (1 + (danger - 1) * 0.12) * (elite ? 1.4 : 1), elite,
      scale: (0.9 + Math.random() * 0.2) * (elite ? 1.15 : 1), state: def.ambush ? 'hidden' : 'wander', timer: Math.random() * 3,
      attackT: 0, phase: Math.random() * 6, speed: 0, target: pos.clone(), home: pos.clone(), flash: 0, tilt: 0, deadT: 0,
      looted: false, slot, alerted: false, knock: V(), burn: 0, hover: 0,
      phaseIdx: 0, slamT: def.boss?.slam?.every ?? 0, speedMul: 1, shooting: false, rangedOn: !def.boss
    };
    if (def.scale) c.scale = def.scale * (def.boss ? 1 : 0.95 + Math.random() * 0.1);
    if (def.boss) { c.elite = false; c.dmgMul = 1 + (danger - 1) * 0.1; c.hp = c.maxHp = def.hp * (1 + (danger - 1) * 0.12); }
    this.list.push(c);
    return c;
  }

  private trySpawn(player: THREE.Vector3, night: boolean) {
    const alive = this.alive.length;
    if (alive >= MAX - 2) return;
    const ang = Math.random() * Math.PI * 2, dist = 30 + Math.random() * 25;
    const x = player.x + Math.cos(ang) * dist, z = player.z + Math.sin(ang) * dist;
    if (!this.world.isLoaded(x, z)) return;
    const col = this.gen.column(Math.floor(x), Math.floor(z));
    // the start of the journey stays gentle in daylight
    const fromStart = Math.hypot(x, z);
    if (!night && fromStart < 60) return;
    if (!night && col.village > 0.1) return; // villages are safe by day (raids come at night)
    const ground = this.world.groundY(x, z);
    const pos = V(x, ground, z);
    const water = this.world.waterSurface(x, ground + 1, z) > ground - 0.2;
    const options = Object.values(ENEMIES).filter((d) => d.biomes.includes(col.biome) && (!d.night || night) && (d.minDanger ?? 1) <= col.danger && !!d.aquatic === water);
    if (!options.length) return;
    if (!night && Math.random() < 0.55) return; // fewer monsters by day
    const def = options[Math.floor(Math.random() * options.length)];
    if (def.rare && Math.random() > def.rare) return;
    if (def.boss && this.list.some((c) => c.def === def && c.state !== 'dead')) return;
    if (this.building.isSafe(pos)) return;
    const n = def.group[0] + Math.floor(Math.random() * (def.group[1] - def.group[0] + 1));
    for (let i = 0; i < n && this.alive.length < MAX; i++) {
      const px = x + (Math.random() - 0.5) * 5, pz = z + (Math.random() - 0.5) * 5;
      if (!this.world.isLoaded(px, pz)) continue;
      this.spawn(def, V(px, this.world.groundY(px, pz), pz), col.danger, i);
    }
  }

  update(dt: number, player: THREE.Vector3, night: boolean, playerHidden = false) {
    if (this.enabled) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnTimer = night ? 2.5 : 5; this.trySpawn(player, night); }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      const far = c.pos.distanceToSquared(player) > 110 * 110;
      if (far || !this.world.isLoaded(c.pos.x, c.pos.z) || (c.state === 'dead' && c.deadT > (c.looted ? 30 : 120))) { this.list.splice(i, 1); continue; }
      this.think(c, dt, player, night, playerHidden);
    }
    // separation
    const alive = this.alive;
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.def.radius + b.def.radius;
      if (d < min && d > 1e-4) { const p = (min - d) / 2; a.pos.x -= (dx / d) * p; a.pos.z -= (dz / d) * p; b.pos.x += (dx / d) * p; b.pos.z += (dz / d) * p; }
    }
    for (const [id, layer] of this.layers) layer.write(this.list.filter((c) => c.def.id === id));
    // telegraph rings under slamming bosses
    let ri = 0;
    for (const c of this.list) {
      if (c.state !== 'slam' || ri >= this.rings.length) continue;
      const r = this.rings[ri++], sl = c.def.boss!.slam!;
      r.visible = true;
      r.position.set(c.pos.x, c.pos.y + 0.08, c.pos.z);
      const k = 1 - Math.max(0, c.timer) / 1.4;
      r.scale.setScalar(sl.radius * (0.3 + 0.7 * k));
      (r.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.35 * Math.sin(k * 30) ** 2;
    }
    for (; ri < this.rings.length; ri++) this.rings[ri].visible = false;
  }

  private think(c: Creature, dt: number, player: THREE.Vector3, night: boolean, hidden: boolean) {
    const def = c.def;
    c.flash = Math.max(0, c.flash - dt * 4);
    if (c.state === 'dead') {
      c.deadT += dt; c.tilt = Math.min(Math.PI / 2, c.tilt + dt * 4); c.attackT = 0; c.speed = 0; c.hover = Math.max(-0.3, c.hover - dt);
      return;
    }
    if (c.burn > 0) { c.burn -= dt; this.damage(c, 3 * dt, 'fire', null, false, true); if (c.hp <= 0) return; }
    const dx = player.x - c.pos.x, dz = player.z - c.pos.z;
    const dist = Math.hypot(dx, dz);
    c.timer -= dt;
    // knockback
    if (c.knock.lengthSq() > 1e-4) { this.move(c, c.knock.x * dt, c.knock.z * dt); c.knock.multiplyScalar(Math.exp(-dt * 6)); }

    let want = 0;
    const face = (tx: number, tz: number, k = 8) => {
      let d = Math.atan2(-(tx - c.pos.x), -(tz - c.pos.z)) - c.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      c.yaw += d * Math.min(1, dt * k);
    };
    const detect = (night ? 18 : 14) * (hidden ? 0.5 : 1);
    switch (c.state) {
      case 'hidden':
        if (dist < 7) {
          c.state = 'chase'; c.alerted = true;
          this.hooks.toast(`Something bursts from the undergrowth!`, '#e08070');
          this.alertNear(c, 12);
        }
        break;
      case 'idle': case 'wander':
        if (dist < detect || c.alerted) { c.state = 'chase'; c.alerted = true; this.alertNear(c, 10); break; }
        if (c.timer <= 0) {
          c.timer = 3 + Math.random() * 5;
          c.state = Math.random() < 0.5 ? 'idle' : 'wander';
          c.target.set(c.home.x + (Math.random() - 0.5) * 16, 0, c.home.z + (Math.random() - 0.5) * 16);
        }
        if (c.state === 'wander' && Math.hypot(c.target.x - c.pos.x, c.target.z - c.pos.z) > 0.6) { face(c.target.x, c.target.z, 4); want = def.speed; }
        break;
      case 'chase': {
        if (dist > 45) { c.state = 'wander'; c.alerted = false; break; }
        if (def.flee && c.hp < c.maxHp * def.flee) { c.state = 'flee'; c.timer = 4; break; }
        // flank: approach at an angle depending on the pack slot
        const ang = Math.atan2(c.pos.x - player.x, c.pos.z - player.z) + ((c.slot % 3) - 1) * 0.6;
        const stand = def.reach * 0.85;
        const tx = player.x + Math.sin(ang) * stand, tz = player.z + Math.cos(ang) * stand;
        const boss = def.boss;
        if (boss?.slam) {
          c.slamT -= dt;
          if (c.slamT <= 0 && dist < boss.slam.radius + 1.5) { c.state = 'slam'; c.timer = 1.4; c.slamT = boss.slam.every; this.hooks.toast(`${def.name} gathers itself…`, '#e08070'); break; }
        }
        const r = def.ranged && c.rangedOn ? def.ranged : null;
        if (r && dist < r.range && dist > def.reach + 1.2) {
          // keep at a distance and shoot
          face(player.x, player.z, 8);
          want = dist < r.range * 0.55 && !boss ? -def.speed * 0.6 : dist > r.range * 0.8 ? def.run * 0.6 : 0;
          if (c.timer <= 0) { c.state = 'windup'; c.timer = def.windup; c.shooting = true; }
          break;
        }
        if (dist > def.reach + 0.3) { face(tx, tz, 6); want = dist > 6 ? def.run : def.run * 0.7; }
        else { face(player.x, player.z, 10); if (c.timer <= 0) { c.state = 'windup'; c.timer = def.windup; } }
        break;
      }
      case 'slam':
        face(player.x, player.z, 4);
        c.attackT = Math.min(1.2, c.attackT + dt * 1.2);
        c.flash = 0.3 + 0.3 * Math.sin(c.timer * 20);
        if (c.timer <= 0) {
          const sl = def.boss!.slam!;
          this.hooks.slam(c, sl.radius, sl.dmg * c.dmgMul, sl.type);
          c.state = 'recover'; c.timer = def.cooldown * 1.2;
        }
        break;
      case 'windup':
        face(player.x, player.z, 6);
        c.attackT = Math.min(1, c.attackT + dt / Math.max(0.15, def.windup)); // raise the weapon (telegraph)
        c.flash = Math.max(c.flash, c.elite ? 0.25 : 0);
        if (c.timer <= 0) {
          if (c.shooting) { c.shooting = false; this.hooks.shoot(c); c.timer = 0; }
          else if (dist < def.reach + 0.6) this.hooks.strike(c);
          c.state = 'recover'; c.timer = def.cooldown;
        }
        break;
      case 'recover':
        c.attackT = Math.max(-0.5, c.attackT - dt * 8);
        if (c.timer <= def.cooldown * 0.5) c.attackT = Math.min(0, c.attackT + dt * 3);
        if (c.timer <= 0) { c.attackT = 0; c.state = 'chase'; c.timer = 0.3 + Math.random() * 0.6; }
        break;
      case 'flee':
        face(c.pos.x - dx, c.pos.z - dz, 6); want = def.run;
        if (c.timer <= 0) { c.state = dist > 25 ? 'wander' : 'chase'; c.home.copy(c.pos); }
        break;
      case 'stunned':
        c.attackT = Math.max(0, c.attackT - dt * 3);
        if (c.timer <= 0) { c.state = 'chase'; c.timer = 0.4; }
        break;
    }
    // boss phases: stronger, faster, calls for help
    if (def.boss) {
      const ph = def.boss.phases;
      while (c.phaseIdx < ph.length && c.hp / c.maxHp <= ph[c.phaseIdx].at) {
        const P = ph[c.phaseIdx++];
        if (P.speedMul) c.speedMul *= P.speedMul;
        if (P.dmgMul) c.dmgMul *= P.dmgMul;
        if (P.ranged) c.rangedOn = true;
        if (P.say) this.hooks.toast(P.say, '#e8a030');
        if (P.summon) {
          const sd = ENEMIES[P.summon[0]];
          for (let i = 0; i < P.summon[1]; i++) {
            const a = (i / P.summon[1]) * Math.PI * 2, x = c.pos.x + Math.cos(a) * 4, z = c.pos.z + Math.sin(a) * 4;
            if (!this.world.isLoaded(x, z)) continue;
            const m = this.spawn(sd, V(x, this.world.groundNear(x, z, c.pos.y), z), 1 + (c.dmgMul - 1) * 4, i);
            m.state = 'chase'; m.alerted = true; m.elite = false;
          }
        }
      }
    }
    want *= c.speedMul;
    c.speed += (want - c.speed) * Math.min(1, dt * 6);
    if (Math.abs(c.speed) > 0.05) this.move(c, -Math.sin(c.yaw) * c.speed * dt, -Math.cos(c.yaw) * c.speed * dt);
    c.phase += dt * (2 + c.speed * 3) + (def.flying ? dt * 6 : 0);
    if (def.flying) c.hover = 0.9 + Math.sin(c.phase * 0.3) * 0.25;
  }

  private move(c: Creature, mx: number, mz: number) {
    const nx = c.pos.x + mx, nz = c.pos.z + mz;
    if (!this.world.isLoaded(nx, nz)) return;
    const g = this.world.groundNear(nx, nz, c.pos.y);
    if (!c.def.flying) {
      if (Math.abs(g - c.pos.y) > 1.3) return;
      if (this.world.waterSurface(nx, g + 1, nz) > g + 0.4) return;
    }
    // do not walk through walls
    this.building.boxesNear(c.pos, 2, this.boxes);
    for (const b of this.boxes) {
      if (nx > b.min.x - c.def.radius && nx < b.max.x + c.def.radius && nz > b.min.z - c.def.radius && nz < b.max.z + c.def.radius && b.max.y > c.pos.y + 0.4 && b.min.y < c.pos.y + c.def.height) return;
    }
    c.pos.x = nx; c.pos.z = nz;
    c.pos.y += (g - c.pos.y) * 0.5;
  }

  private alertNear(c: Creature, r: number) {
    for (const o of this.list) if (o !== c && o.state !== 'dead' && o.pos.distanceTo(c.pos) < r) { o.alerted = true; if (o.state === 'hidden' || o.state === 'wander' || o.state === 'idle') o.state = 'chase'; }
  }

  /**
   * Apply damage. Returns the dealt amount. `from` gives knockback direction.
   * Heavy hits stagger; weaknesses / resistances multiply.
   */
  damage(c: Creature, amount: number, type: DmgType, from: THREE.Vector3 | null, heavy: boolean, silent = false): number {
    if (c.state === 'dead') return 0;
    const mul = c.def.weak[type] ?? 1;
    const dealt = amount * mul;
    c.hp -= dealt;
    if (!silent) {
      c.flash = 1; c.alerted = true;
      if (c.state === 'hidden' || c.state === 'idle' || c.state === 'wander') c.state = 'chase';
      this.alertNear(c, 15); // calls for help
      if (from) { const d = c.pos.clone().sub(from).setY(0).normalize(); c.knock.copy(d.multiplyScalar((heavy ? 7 : 3) / Math.max(1, c.def.radius * 1.5))); }
      if (heavy && c.state !== 'stunned' && c.def.radius < 0.8) { c.state = 'stunned'; c.timer = 0.7; }
    }
    if (type === 'fire' && !silent && (c.def.weak.fire ?? 1) > 0) c.burn = Math.max(c.burn, 2.5);
    if (c.hp <= 0) {
      c.hp = 0; c.state = 'dead'; c.deadT = 0; c.flash = 1;
      this.kills[c.def.id] = (this.kills[c.def.id] ?? 0) + 1;
      this.onDeath?.(c);
    }
    return dealt;
  }

  stun(c: Creature, t: number) { if (c.state !== 'dead') { c.state = 'stunned'; c.timer = t; c.attackT = 0; } }

  /** Living creatures inside a melee arc in front of the attacker. */
  inArc(pos: THREE.Vector3, yaw: number, reach: number, arc = 0.35): Creature[] {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    return this.alive.filter((c) => {
      const dx = c.pos.x - pos.x, dz = c.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (d > reach + c.def.radius || Math.abs(c.pos.y + c.hover - pos.y) > 2.2 + c.def.height * 0.5) return false;
      return d < c.def.radius + 0.5 || (dx * fx + dz * fz) / d > arc;
    });
  }

  /** Nearest dead, unlooted body within reach. */
  lootable(pos: THREE.Vector3, r = 2.4): Creature | null {
    let best: Creature | null = null, bd = r * r;
    for (const c of this.list) {
      if (c.state !== 'dead' || c.looted) continue;
      const d = c.pos.distanceToSquared(pos);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /** Creature closest to a screen ray (for tap-to-target). */
  pick(ray: THREE.Ray, max = 35): Creature | null {
    let best: Creature | null = null, bd = Infinity;
    const p = V();
    for (const c of this.alive) {
      const centre = c.pos.clone().setY(c.pos.y + c.hover + c.def.height * 0.5);
      const t = ray.closestPointToPoint(centre, p).distanceTo(ray.origin);
      if (t > max) continue;
      const off = p.distanceTo(centre);
      if (off < c.def.radius + 0.9 && t < bd) { bd = t; best = c; }
    }
    return best;
  }

  statusFor(c: Creature): [Status, number] | undefined { return c.def.onHit; }
}
