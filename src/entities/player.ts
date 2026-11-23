// Player controller: walking on smooth terrain (sphere-vs-density-field collision),
// sprinting with stamina, jumping, climbing (hold JUMP at a steep wall or tree trunk),
// swimming / diving with breath, dodge roll, fall damage, life regeneration.
import * as THREE from 'three';
import { input } from '../engine/input';
import type { World, TreeHit } from '../world/world';
import type { AABB } from '../world/building';

const SPHERES = [0.42, 0.95, 1.45]; // sphere centre heights above the feet
const RADIUS = 0.4;
const EYE = 1.62;

export const PLAYER_TUNING = {
  walk: 4.4, sprint: 7.6, swim: 2.8, swimFast: 4.4,
  jump: 8.0, gravity: 24,
  climbSpeed: 3.0,
  roll: 9.5, rollTime: 0.42,
  staminaMax: 100, sprintCost: 16, jumpCost: 6, climbCost: 14, rollCost: 22, staminaRegen: 26,
  lifeMax: 100, breathMax: 12,
  fallSafe: 13, fallDamage: 5.5
};

export type PlayerState = 'ground' | 'air' | 'swim' | 'climb' | 'roll';

export class Player {
  readonly pos = new THREE.Vector3(0, 80, 0);
  readonly vel = new THREE.Vector3();
  /** Body facing (radians, same convention as camera yaw). */
  yaw = 0;
  state: PlayerState = 'air';
  maxLife = PLAYER_TUNING.lifeMax;
  life = PLAYER_TUNING.lifeMax;
  /** combat state (set by the combat system) */
  blocking = false;
  stunT = 0;
  slow = 1;
  stamina = PLAYER_TUNING.staminaMax;
  breath = PLAYER_TUNING.breathMax;
  exhausted = false;   // stamina ran out: no sprint until it recovers a bit
  grounded = false;
  inWater = false;
  headUnderwater = false;
  waterY = -Infinity;
  speed = 0;           // horizontal speed (for animation)
  onDamage: ((amount: number, cause: string) => void) | null = null;
  onDeath: ((cause: string) => void) | null = null;
  /** building collision boxes near the player (filled by the game each frame) */
  boxes: AABB[] = [];
  sitting = false;

  private staminaDelay = 0;
  private sinceDamage = 10;
  private coyote = 0;
  private rollTime = 0;
  /** dodge rolls avoid damage during their first part */
  get invulnerable() { return this.state === 'roll' && this.rollTime > PLAYER_TUNING.rollTime - 0.32; }
  private rollDir = new THREE.Vector3();
  private wallContact = false;
  private trunkContact = false;
  private tmpN = new THREE.Vector3();
  private tmpC = new THREE.Vector3();
  private trees: TreeHit[] = [];
  private dead = false;

  get eye(): THREE.Vector3 { return this.tmpEye.set(this.pos.x, this.pos.y + EYE, this.pos.z); }
  private tmpEye = new THREE.Vector3();

  spawn(x: number, y: number, z: number) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.life = this.maxLife;
    this.stamina = PLAYER_TUNING.staminaMax;
    this.breath = PLAYER_TUNING.breathMax;
    this.dead = false;
    this.state = 'air';
  }

  damage(amount: number, cause: string) {
    if (this.dead || amount <= 0) return;
    this.life = Math.max(0, this.life - amount);
    this.sinceDamage = 0;
    this.onDamage?.(amount, cause);
    if (this.life <= 0) { this.dead = true; this.onDeath?.(cause); }
  }

  update(dt: number, world: World, camYaw: number, camPitch: number, firstPerson: boolean) {
    if (this.dead || !world.isLoaded(this.pos.x, this.pos.z)) return;
    if (this.sitting) {
      if (Math.hypot(input.move.x, input.move.y) > 0.3 || input.button('jump').pressed) this.sitting = false;
      else { this.vel.set(0, 0, 0); this.speed = 0; this.state = 'ground'; this.stamina = Math.min(PLAYER_TUNING.staminaMax, this.stamina + 30 * dt); return; }
    }
    const T = PLAYER_TUNING;

    // ---- input → wish direction (relative to camera)
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const mx = input.move.x, my = input.move.y;
    const ctl = this.stunT > 0 ? 0 : 1;
    if (this.stunT > 0) this.stunT -= dt;
    const wish = new THREE.Vector3((fx * my + rx * mx) * ctl, 0, (fz * my + rz * mx) * ctl);
    const wishLen = Math.min(1, wish.length());
    if (wishLen > 0.01) wish.normalize();

    // ---- environment
    this.waterY = world.waterSurface(this.pos.x, this.pos.y + 1, this.pos.z);
    const depth = this.waterY - this.pos.y;
    this.inWater = depth > 1.05;
    this.headUnderwater = depth > EYE;

    const jump = input.button('jump');
    const wantSprint = input.sprint && wishLen > 0.5 && !this.exhausted;
    let staminaUse = 0;

    // ---- dodge roll
    if (input.button('dodge').pressed && this.state !== 'roll' && this.grounded && this.stamina >= T.rollCost) {
      this.state = 'roll';
      this.rollTime = T.rollTime;
      this.stamina -= T.rollCost; this.staminaDelay = 0.8;
      if (wishLen > 0.1) this.rollDir.copy(wish); else this.rollDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    }

    if (this.state === 'roll') {
      this.rollTime -= dt;
      this.vel.x = this.rollDir.x * T.roll; this.vel.z = this.rollDir.z * T.roll;
      this.vel.y -= T.gravity * dt;
      this.yaw = Math.atan2(-this.rollDir.x, -this.rollDir.z);
      if (this.rollTime <= 0) this.state = this.grounded ? 'ground' : 'air';
    } else if (this.inWater) {
      // ---- swimming
      this.state = 'swim';
      const sp = wantSprint ? T.swimFast : T.swim;
      const dive = this.headUnderwater || camPitch < -0.35 ? Math.sin(camPitch) : 0;
      const target = new THREE.Vector3(wish.x * sp, 0, wish.z * sp);
      this.vel.x += (target.x - this.vel.x) * Math.min(1, dt * 4);
      this.vel.z += (target.z - this.vel.z) * Math.min(1, dt * 4);
      let ay = depth > 1.35 ? 4 : -9;                 // float at chest height
      if (jump.down) ay = 9;                          // swim up
      else if (my > 0.3 && dive < -0.3) ay = dive * 14; // look down + forward = dive
      else if (my > 0.3 && this.headUnderwater && camPitch > 0.3) ay = Math.sin(camPitch) * 10;
      this.vel.y += ay * dt;
      this.vel.y *= Math.exp(-3 * dt);
      if (wantSprint) staminaUse += T.sprintCost * 0.6 * dt;
      // jump out of water onto a ledge
      if (jump.pressed && depth < 1.6 && this.wallContact) this.vel.y = T.jump * 0.85;
    } else {
      // ---- climbing: hold JUMP against a steep wall or a tree trunk
      const canClimb = (this.wallContact || this.trunkContact) && jump.down && jump.held > 0.22 && this.stamina > 1;
      if (canClimb) {
        this.state = 'climb';
        this.vel.y = T.climbSpeed;
        this.vel.x = wish.x * 1.2; this.vel.z = wish.z * 1.2;
        staminaUse += T.climbCost * dt;
      } else {
        if (this.state === 'climb') this.vel.y = Math.max(this.vel.y, 4.5); // vault over the top
        this.state = this.grounded ? 'ground' : 'air';
        const sp = wishLen * (wantSprint && this.stamina > 0 && !this.blocking ? T.sprint : T.walk) * (this.blocking ? 0.45 : 1) * this.slow;
        const accel = this.grounded ? 40 : 9;
        const tx = wish.x * sp, tz = wish.z * sp;
        const dx = tx - this.vel.x, dz = tz - this.vel.z;
        const dl = Math.hypot(dx, dz), maxD = accel * dt;
        if (dl > maxD) { this.vel.x += (dx / dl) * maxD; this.vel.z += (dz / dl) * maxD; }
        else { this.vel.x = tx; this.vel.z = tz; }
        if (wantSprint && wishLen > 0.5 && this.grounded) staminaUse += T.sprintCost * dt;
        if (jump.pressed && (this.grounded || this.coyote > 0) && this.stamina >= T.jumpCost) {
          this.vel.y = T.jump;
          this.stamina -= T.jumpCost; this.staminaDelay = 0.6;
          this.grounded = false; this.coyote = 0;
        }
        this.vel.y -= T.gravity * dt;
        this.vel.y = Math.max(this.vel.y, -45);
      }
    }

    // ---- stamina
    if (staminaUse > 0) {
      this.stamina = Math.max(0, this.stamina - staminaUse);
      this.staminaDelay = 0.8;
      if (this.stamina <= 0) this.exhausted = true;
    } else if (this.staminaDelay > 0) this.staminaDelay -= dt;
    else this.stamina = Math.min(T.staminaMax, this.stamina + T.staminaRegen * dt);
    if (this.exhausted && this.stamina > 25) this.exhausted = false;

    // ---- integrate in sub-steps (max 0.25 m per step) and collide
    const impactVy = this.vel.y;
    const wasGrounded = this.grounded;
    const dist = this.vel.length() * dt;
    const steps = Math.max(1, Math.ceil(dist / 0.25));
    const h = dt / steps;
    this.grounded = false;
    this.wallContact = false;
    this.trunkContact = false;
    world.treesNear(this.pos.x, this.pos.z, 3, this.trees);
    for (let s = 0; s < steps; s++) {
      this.pos.addScaledVector(this.vel, h);
      this.collide(world);
    }
    // stick to the ground when walking downhill
    if (wasGrounded && !this.grounded && this.vel.y <= 0 && this.state !== 'swim') {
      this.tmpC.set(this.pos.x, this.pos.y + SPHERES[0], this.pos.z);
      const sd = world.sdf(this.tmpC, this.tmpN);
      const gap = -sd - RADIUS;
      if (gap > 0 && gap < 0.45 && this.tmpN.y > 0.6) { this.pos.y -= gap; this.grounded = true; this.vel.y = 0; }
    }
    if (this.grounded) this.coyote = 0.12; else this.coyote -= dt;

    // ---- fall damage
    if (this.grounded && !wasGrounded && -impactVy > T.fallSafe && this.state !== 'swim') {
      this.damage((-impactVy - T.fallSafe) * T.fallDamage, 'a fall');
    }

    // ---- breath / drowning
    if (this.headUnderwater) {
      this.breath -= dt;
      if (this.breath < 0) { this.breath = 0; this.damage(10 * dt, 'drowning'); }
    } else this.breath = Math.min(T.breathMax, this.breath + dt * 4);

    // ---- life regeneration
    this.sinceDamage += dt;
    if (this.sinceDamage > 6) this.life = Math.min(this.maxLife, this.life + 1.5 * dt);

    // ---- facing
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (firstPerson) this.yaw = camYaw;
    else if (this.state !== 'roll' && wishLen > 0.05) {
      const target = Math.atan2(-wish.x, -wish.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
    }
    if (this.pos.y < -20) this.damage(1000, 'the void');
  }

  private collide(world: World) {
    for (let i = 0; i < SPHERES.length; i++) {
      for (let iter = 0; iter < 3; iter++) {
        this.tmpC.set(this.pos.x, this.pos.y + SPHERES[i], this.pos.z);
        const s = world.sdf(this.tmpC, this.tmpN);
        const pen = RADIUS + s;
        if (pen <= 0.001) break;
        const n = this.tmpN;
        if (n.y > 0.6) {
          // walkable: push straight up so we never slide down gentle slopes
          this.pos.y += Math.min(pen / n.y, 0.6);
          if (this.vel.y < 0) this.vel.y = 0;
          this.grounded = true;
        } else {
          this.pos.addScaledVector(n, pen);
          const vn = this.vel.dot(n);
          if (vn < 0) this.vel.addScaledVector(n, -vn);
          if (n.y < -0.6 && this.vel.y > 0) this.vel.y = 0;
          if (Math.abs(n.y) <= 0.6) this.wallContact = true;
        }
      }
    }
    // building pieces: spheres vs boxes, with step-up onto low ledges (stairs, floors)
    for (const b of this.boxes) {
      for (let i = 0; i < SPHERES.length; i++) {
        const cx = this.pos.x, cy = this.pos.y + SPHERES[i], cz = this.pos.z;
        const qx = Math.max(b.min.x, Math.min(cx, b.max.x)), qy = Math.max(b.min.y, Math.min(cy, b.max.y)), qz = Math.max(b.min.z, Math.min(cz, b.max.z));
        let dx = cx - qx, dy = cy - qy, dz = cz - qz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= RADIUS * RADIUS) continue;
        const stepUp = b.max.y - this.pos.y;
        if (i === 0 && stepUp > -0.05 && stepUp < 0.5 && this.vel.y <= 1) {
          this.pos.y = b.max.y; if (this.vel.y < 0) this.vel.y = 0; this.grounded = true; continue;
        }
        let d = Math.sqrt(d2);
        if (d < 1e-5) { dx = 0; dy = 1; dz = 0; d = 1; } // centre inside: push up
        const pen = RADIUS - Math.sqrt(d2);
        const nx = dx / d, ny = dy / d, nz = dz / d;
        this.pos.x += nx * pen; this.pos.y += ny * pen; this.pos.z += nz * pen;
        const vn = this.vel.x * nx + this.vel.y * ny + this.vel.z * nz;
        if (vn < 0) { this.vel.x -= nx * vn; this.vel.y -= ny * vn; this.vel.z -= nz * vn; }
        if (ny > 0.6) this.grounded = true;
        else if (Math.abs(ny) < 0.6) this.wallContact = true;
      }
    }
    // tree trunks: vertical cylinders
    for (const t of this.trees) {
      if (this.pos.y > t.y1 || this.pos.y + 1.8 < t.y0) continue;
      const dx = this.pos.x - t.x, dz = this.pos.z - t.z;
      const d = Math.hypot(dx, dz), min = t.r + 0.32;
      if (d < min + 0.15) this.trunkContact = true;
      if (d < min && d > 1e-4) {
        this.pos.x = t.x + (dx / d) * min; this.pos.z = t.z + (dz / d) * min;
        const vn = (this.vel.x * dx + this.vel.z * dz) / d;
        if (vn < 0) { this.vel.x -= (dx / d) * vn; this.vel.z -= (dz / d) * vn; }
      }
    }
  }
}
