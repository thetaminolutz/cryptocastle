// Projectiles: arrows, crossbow bolts and spells from the player; spit, bolts and
// fireballs from enemies and bosses. Simple meshes, gravity for arrows, terrain
// collision via the density field.
import * as THREE from 'three';
import type { DmgType } from '../data/items';
import type { Status } from '../data/enemies';
import type { World } from '../world/world';
import type { Creatures, Creature } from '../entities/creatures';
import type { Player } from '../entities/player';

export type ProjKind = 'arrow' | 'bolt' | 'spell' | 'spit' | 'fireball' | 'frost' | 'shadow';
interface Proj {
  kind: ProjKind; mesh: THREE.Object3D; pos: THREE.Vector3; vel: THREE.Vector3; life: number;
  dmg: number; type: DmgType; fromPlayer: boolean; owner?: Creature; status?: [Status, number]; name: string; radius: number; splash: number;
}

const COLORS: Record<ProjKind, THREE.Color> = {
  arrow: new THREE.Color(0.5, 0.36, 0.2), bolt: new THREE.Color(0.45, 0.45, 0.5), spell: new THREE.Color(3, 1.6, 0.5),
  spit: new THREE.Color(0.6, 1.6, 0.3), fireball: new THREE.Color(4, 1.4, 0.3), frost: new THREE.Color(1.2, 2.4, 3.5), shadow: new THREE.Color(1.4, 0.4, 2.2)
};

export interface ProjHooks {
  hitCreature(c: Creature, dmg: number, type: DmgType, from: THREE.Vector3): void;
  hitPlayer(from: THREE.Vector3, dmg: number, type: DmgType, status: [Status, number] | undefined, name: string): void;
  burst(pos: THREE.Vector3, color: THREE.Color): void;
}

export class Projectiles {
  readonly group = new THREE.Group();
  private list: Proj[] = [];
  private geo = {
    shaft: new THREE.CylinderGeometry(0.012, 0.012, 0.7, 4).rotateX(Math.PI / 2),
    bolt: new THREE.CylinderGeometry(0.018, 0.018, 0.45, 4).rotateX(Math.PI / 2),
    ball: new THREE.SphereGeometry(0.12, 10, 8)
  };
  private mats = new Map<ProjKind, THREE.Material>();

  constructor(private world: World, private creatures: Creatures, private player: Player, private hooks: ProjHooks) {}

  private mat(kind: ProjKind) {
    let m = this.mats.get(kind);
    if (!m) {
      m = kind === 'arrow' || kind === 'bolt' ? new THREE.MeshStandardMaterial({ color: COLORS[kind], roughness: 0.7 }) : new THREE.MeshBasicMaterial({ color: COLORS[kind], transparent: true, opacity: 0.9 });
      this.mats.set(kind, m);
    }
    return m;
  }

  /** Launch a projectile. */
  fire(kind: ProjKind, from: THREE.Vector3, dir: THREE.Vector3, speed: number, dmg: number, type: DmgType, o: { fromPlayer: boolean; owner?: Creature; status?: [Status, number]; name?: string; splash?: number } = { fromPlayer: true }) {
    const g = new THREE.Group();
    if (kind === 'arrow' || kind === 'bolt') {
      g.add(new THREE.Mesh(kind === 'arrow' ? this.geo.shaft : this.geo.bolt, this.mat(kind)));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4).rotateX(-Math.PI / 2), this.mat('bolt'));
      tip.position.z = kind === 'arrow' ? -0.38 : -0.26; g.add(tip);
    } else {
      const core = new THREE.Mesh(this.geo.ball, this.mat(kind));
      core.scale.setScalar(kind === 'fireball' ? 2.2 : kind === 'spit' ? 0.9 : 1.2);
      g.add(core);
      const glow = new THREE.Mesh(this.geo.ball, new THREE.MeshBasicMaterial({ color: COLORS[kind], transparent: true, opacity: 0.25, depthWrite: false }));
      glow.scale.setScalar(kind === 'fireball' ? 4 : 2.2); g.add(glow);
    }
    g.position.copy(from);
    this.group.add(g);
    this.list.push({
      kind, mesh: g, pos: from.clone(), vel: dir.clone().normalize().multiplyScalar(speed), life: 3.5, dmg, type, fromPlayer: o.fromPlayer, owner: o.owner,
      status: o.status, name: o.name ?? 'an arrow', radius: kind === 'fireball' ? 0.6 : 0.3, splash: o.splash ?? 0
    });
  }

  update(dt: number) {
    const tmp = new THREE.Vector3();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.kind === 'arrow' || p.kind === 'bolt') p.vel.y -= (p.kind === 'arrow' ? 9 : 4) * dt;
      const steps = Math.max(1, Math.ceil((p.vel.length() * dt) / 0.4));
      let hit = false;
      for (let s = 0; s < steps && !hit; s++) {
        p.pos.addScaledVector(p.vel, dt / steps);
        if (p.fromPlayer) {
          for (const c of this.creatures.alive) {
            const cy = c.pos.y + c.hover + c.def.height * 0.5;
            if (Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < c.def.radius + p.radius && Math.abs(p.pos.y - cy) < c.def.height * 0.6 + p.radius) {
              this.hooks.hitCreature(c, p.dmg, p.type, p.pos); hit = true; break;
            }
          }
        } else {
          const pl = this.player.pos;
          if (Math.hypot(pl.x - p.pos.x, pl.z - p.pos.z) < 0.45 + p.radius && p.pos.y > pl.y - 0.2 && p.pos.y < pl.y + 1.9) {
            this.hooks.hitPlayer(tmp.copy(p.pos).sub(p.vel.clone().normalize()), p.dmg, p.type, p.status, p.name); hit = true;
          }
        }
        if (!hit && this.world.density(p.pos.x, p.pos.y, p.pos.z) > 0) hit = true;
      }
      if (hit && p.splash > 0) {
        // fireballs burst: hurt everything near the impact
        if (!p.fromPlayer && this.player.pos.distanceTo(p.pos) < p.splash) this.hooks.hitPlayer(p.pos.clone(), p.dmg * 0.6, p.type, p.status, p.name);
        if (p.fromPlayer) for (const c of this.creatures.alive) if (c.pos.distanceTo(p.pos) < p.splash) this.hooks.hitCreature(c, p.dmg * 0.5, p.type, p.pos);
      }
      if (hit || p.life <= 0) {
        if (hit && p.kind !== 'arrow' && p.kind !== 'bolt') this.hooks.burst(p.pos, COLORS[p.kind]);
        this.group.remove(p.mesh);
        this.list.splice(i, 1);
        continue;
      }
      p.mesh.position.copy(p.pos);
      p.mesh.lookAt(tmp.copy(p.pos).sub(p.vel));
    }
  }

  clear() { for (const p of this.list) this.group.remove(p.mesh); this.list = []; }
}
