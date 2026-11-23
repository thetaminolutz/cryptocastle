// Gathering & using things: aim at terrain/trees, swing tools (mine, dig, chop),
// harvest plants, place stations, eat, drink. Also builds the 3D model of the item
// in the hero's hand.
import { METAL_ENV } from '../entities/hero';
import * as THREE from 'three';
import { input } from '../engine/input';
import { ITEMS, MINE, PLANT_DROPS, TREE_DROPS, ToolKind, weaponOf } from '../data/items';
import type { Combat } from './combat';
import type { Creatures } from '../entities/creatures';
import type { Wildlife } from '../entities/animals';
import type { Inventory } from './inventory';
import type { World, TreeHit } from '../world/world';
import type { Player } from '../entities/player';
import type { HeroModel } from '../entities/hero';
import type { Props } from '../world/props';
import { B } from '../world/blocks';
import type { Building, Piece } from '../world/building';
import { PIECES } from '../data/pieces';

const REACH = 4.2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

type Target =
  | { type: 'terrain'; point: THREE.Vector3; normal: THREE.Vector3; material: number }
  | { type: 'tree'; tree: TreeHit; point: THREE.Vector3 }
  | null;

export interface InteractUI {
  setAction(label: string | null): void;       // label for the INTERACT button (null hides it)
  setAttack(label: string): void;              // label for the ATTACK button
  toast(text: string, color?: string): void;   // pickup / info messages
  openCrafting(): void;
  openChest(p: Piece): void;
  sleep(p: Piece): void;
  special(p: Piece): void;
}

/** 3D model of a held item (tools, torch, food...). */
export function heldModel(id: string | null): THREE.Object3D | null {
  if (!id || id === 'staff') return null;
  const def = ITEMS[id];
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.icon.color), roughness: def.tool && def.tool.tier >= 3 ? 0.35 : 0.8, metalness: def.tool && def.tool.tier >= 3 ? 0.8 : 0 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
  };
  const kind: ToolKind | undefined = def.tool?.kind;
  if (kind === 'pickaxe' || (kind === 'axe' && !def.weapon) || kind === 'shovel' || kind === 'sickle' || kind === 'knife') {
    const len = kind === 'knife' ? 0.12 : kind === 'shovel' ? 0.95 : 0.7;
    add(new THREE.CylinderGeometry(0.018, 0.022, len, 6), wood, 0, len / 2 - 0.1, 0);
    const top = len - 0.1;
    if (kind === 'pickaxe') {
      const head = new THREE.TorusGeometry(0.2, 0.025, 5, 10, Math.PI * 0.8);
      add(head, metal, 0, top - 0.17, 0, 0, Math.PI / 2, Math.PI * 0.1);
    } else if (kind === 'axe') {
      const blade = new THREE.BoxGeometry(0.02, 0.16, 0.16);
      add(blade, metal, 0, top - 0.05, -0.09);
    } else if (kind === 'shovel') {
      const blade = new THREE.BoxGeometry(0.17, 0.22, 0.02);
      add(blade, metal, 0, top + 0.1, 0);
    } else if (kind === 'sickle') {
      add(new THREE.TorusGeometry(0.14, 0.015, 4, 12, Math.PI * 1.2), metal, 0, top + 0.1, -0.1, 0, Math.PI / 2, 0);
    } else {
      add(new THREE.ConeGeometry(0.025, 0.22, 4), metal, 0, top + 0.12, 0);
    }
    g.rotation.x = -0.25;
    return g;
  }
  if (kind === 'torch') {
    add(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 6), wood, 0, 0.2, 0);
    const flame = add(new THREE.ConeGeometry(0.05, 0.18, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2, 0.6) }), 0, 0.53, 0);
    flame.name = 'flame';
    add(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4, 1.5) }), 0, 0.47, 0);
    return g;
  }
  // weapons
  const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.icon.color), roughness: 0.3, metalness: 0.85, envMap: METAL_ENV.tex, envMapIntensity: 0.45 });
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.icon.accent ?? '#3a2618'), roughness: 0.8 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a40, roughness: 0.35, metalness: 0.9, envMap: METAL_ENV.tex, envMapIntensity: 0.45 });
  const blade = (len: number, w: number, curve = 0) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.quadraticCurveTo(w / 2 + curve, len * 0.6, curve * 1.4, len); sh.quadraticCurveTo(-w / 2 + curve * 0.6, len * 0.6, -w / 2, 0);
    const g2 = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.006, bevelSegments: 1 });
    g2.translate(0, 0, -0.006); g2.rotateY(Math.PI / 2);
    return g2;
  };
  if (kind === 'sword' || kind === 'longsword' || kind === 'saber' || kind === 'dagger') {
    const L = kind === 'longsword' ? 0.95 : kind === 'dagger' ? 0.26 : kind === 'saber' ? 0.72 : 0.72;
    const gl = kind === 'longsword' ? 0.24 : 0.12;
    add(new THREE.CylinderGeometry(0.018, 0.018, gl, 6), grip, 0, gl / 2 - 0.06, 0);
    add(new THREE.SphereGeometry(0.028, 8, 6), brass, 0, -0.07, 0);
    if (kind === 'saber') add(new THREE.TorusGeometry(0.06, 0.008, 4, 10, Math.PI), brass, 0, gl - 0.04, 0, 0, Math.PI / 2, -Math.PI / 2);
    else add(new THREE.BoxGeometry(kind === 'dagger' ? 0.1 : 0.2, 0.025, 0.035), brass, 0, gl - 0.06, 0);
    add(blade(L, kind === 'longsword' ? 0.055 : kind === 'dagger' ? 0.04 : 0.045, kind === 'saber' ? 0.06 : 0), steel, 0, gl - 0.05, 0);
    return g;
  }
  if (kind === 'axe' && def.weapon) {
    add(new THREE.CylinderGeometry(0.02, 0.024, 0.85, 6), wood, 0, 0.32, 0);
    const sh = new THREE.Shape(); sh.moveTo(0, -0.08); sh.quadraticCurveTo(0.22, -0.16, 0.24, 0.0); sh.quadraticCurveTo(0.22, 0.16, 0, 0.08); sh.closePath();
    const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false }); bg.translate(0, 0, -0.01); bg.rotateY(Math.PI / 2);
    add(bg, steel, 0, 0.66, 0); add(bg.clone().rotateY(Math.PI), steel, 0, 0.66, 0);
    return g;
  }
  if (kind === 'hammer' || kind === 'mace' || kind === 'morningstar' || kind === 'club') {
    const len = kind === 'hammer' ? 0.85 : kind === 'club' ? 0.6 : 0.65;
    add(new THREE.CylinderGeometry(0.02, 0.024, len, 6), kind === 'club' ? new THREE.MeshStandardMaterial({ color: new THREE.Color(def.icon.color), roughness: 0.9 }) : wood, 0, len / 2 - 0.08, 0);
    const top = len - 0.08;
    if (kind === 'hammer') add(new THREE.BoxGeometry(0.11, 0.11, 0.26), steel, 0, top, 0);
    else if (kind === 'club') { add(new THREE.CylinderGeometry(0.06, 0.03, 0.3, 7), new THREE.MeshStandardMaterial({ color: new THREE.Color(def.icon.color), roughness: 0.9 }), 0, top - 0.05, 0); if (id.includes('spiked')) for (let i = 0; i < 8; i++) add(new THREE.ConeGeometry(0.012, 0.06, 4), brass, Math.cos(i) * 0.06, top - 0.1 + (i % 3) * 0.06, Math.sin(i) * 0.06, 0, 0, Math.PI / 2 - i); }
    else {
      add(new THREE.SphereGeometry(0.08, 10, 8), steel, 0, top, 0);
      if (kind === 'morningstar' || id.includes('censer')) for (let i = 0; i < 10; i++) { const a = i * 2.4, b2 = i * 0.9; const sp = add(new THREE.ConeGeometry(0.015, 0.07, 4), steel, Math.cos(a) * Math.sin(b2) * 0.09, top + Math.cos(b2) * 0.09, Math.sin(a) * Math.sin(b2) * 0.09); sp.lookAt(sp.position.clone().multiplyScalar(2).setY(top + (sp.position.y - top) * 2)); sp.rotateX(Math.PI / 2); }
    }
    return g;
  }
  if (kind === 'spear') {
    add(new THREE.CylinderGeometry(0.018, 0.02, 1.7, 6), wood, 0, 0.55, 0);
    add(new THREE.ConeGeometry(0.035, 0.22, 4), steel, 0, 1.5, 0);
    return g;
  }
  if (kind === 'whip') {
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 6), grip, 0, 0.05, 0);
    const pts = [0, 1, 2, 3, 4, 5, 6].map((i) => new THREE.Vector3(Math.sin(i * 0.6) * 0.05 * i, 0.16 + i * 0.12, -i * 0.04));
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.008, 4), new THREE.MeshStandardMaterial({ color: new THREE.Color(def.icon.color), roughness: 0.6, metalness: 0.4 }));
    for (let i = 2; i < 7; i++) add(new THREE.ConeGeometry(0.01, 0.04, 3), brass, pts[i].x, pts[i].y, pts[i].z);
    return g;
  }
  if (kind === 'bow') {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.55, 0.05), new THREE.Vector3(0, 0.1, -0.28), new THREE.Vector3(0, 0.75, 0.05));
    add(new THREE.TubeGeometry(curve, 16, 0.016, 5), new THREE.MeshStandardMaterial({ color: new THREE.Color(def.icon.color), roughness: 0.6 }));
    const str = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.55, 0.05), new THREE.Vector3(0, 0.75, 0.05)]);
    g.add(new THREE.Line(str, new THREE.LineBasicMaterial({ color: 0xe8e0cc })));
    return g;
  }
  if (kind === 'crossbow') {
    add(new THREE.BoxGeometry(0.05, 0.05, 0.6), wood, 0, 0.08, -0.15);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.3, 0.08, -0.38), new THREE.Vector3(0, 0.08, -0.5), new THREE.Vector3(0.3, 0.08, -0.38));
    add(new THREE.TubeGeometry(curve, 10, 0.014, 4), steel);
    return g;
  }
  if (kind === 'wand') {
    add(new THREE.CylinderGeometry(0.01, 0.016, 0.38, 6), wood, 0, 0.12, 0);
    add(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(def.icon.color).multiplyScalar(3) }), 0, 0.32, 0);
    return g;
  }
  // anything else: a small bundle
  const mesh = add(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: new THREE.Color(def.icon.color), roughness: 0.8 }), 0, 0.02, -0.04);
  mesh.rotation.set(0.4, 0.4, 0);
  return g;
}

export class Interaction {
  private target: Target = null;
  private swing = -1;
  private swingDur = 0.55;
  private impactDone = false;
  private harvestT = -1;
  private harvestJob: (() => void) | null = null;
  private treeDamage = new Map<string, number>();
  private aimRay = new THREE.Ray();
  private marker: THREE.Mesh;
  private heldId: string | null | undefined = undefined;
  private action: (() => void) | null = null;
  readonly group = new THREE.Group();
  combat: Combat | null = null;
  /** a worn light source (Hemera's Lantern) */
  carriedLight = false;
  /** herbalism: multiplier for plant harvests */
  herbMul = 1;
  /** game-provided action that takes priority (e.g. recover your pack) */
  extra: (() => { label: string; run: () => void } | null) | null = null;
  creatures: Creatures | null = null;
  wildlife: Wildlife | null = null;
  private heavy = false;
  private combo = 0;
  private queued = false;

  constructor(private world: World, private player: Player, private hero: HeroModel, private inv: Inventory, private props: Props, private building: Building, private ui: InteractUI) {
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 24), new THREE.MeshBasicMaterial({ color: 0xffe8b0, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    this.marker.visible = false;
    this.marker.renderOrder = 10;
    this.group.add(this.marker);
  }

  private tool() {
    const s = this.inv.held;
    return s ? ITEMS[s.id].tool : undefined;
  }

  update(dt: number, camera: THREE.PerspectiveCamera, time: number) {
    // keep the hand model in sync with the selected slot
    const id = this.inv.held?.id ?? null;
    if (id !== this.heldId) { this.heldId = id; this.hero.setHeld(heldModel(id)); }
    const torch = this.tool()?.kind === 'torch';
    if (torch) {
      const p = new THREE.Vector3(); this.hero.held.getWorldPosition(p); p.y += 0.5;
      const f = 1 + 0.12 * Math.sin(time * 11) + 0.06 * Math.sin(time * 27);
      this.props.heldLight = { pos: p, col: V(3.0 * f, 1.7 * f, 0.7 * f), r: 12 };
    } else if (this.carriedLight) {
      const p = this.player.pos.clone(); p.y += 1.6;
      this.props.heldLight = { pos: p, col: V(2.2, 2.0, 1.4), r: 10 };
    } else this.props.heldLight = null;

    this.aim(camera);
    this.updateMarker();
    this.updateAttackLabel();
    this.updateAction();

    // swings: tap = light (press again mid-swing for a 3-hit combo), hold = charged heavy
    const attack = input.button('attack');
    const busy = this.player.state === 'swim' || this.player.state === 'climb' || this.player.state === 'roll' || this.player.stunT > 0 || this.player.blocking;
    const fighting = !!this.creatures && this.creatures.alive.some((c) => c.state !== 'hidden' && c.pos.distanceTo(this.player.pos) < 9);
    const speed = weaponOf(this.inv.held?.id).speed * (1 + (this.combat?.perks.attackSpeed ?? 0));
    if (this.swing >= 0.5 && attack.pressed) this.queued = true;
    if (this.swing < 0 && (attack.down || this.queued) && !busy && this.harvestT < 0) {
      const s = this.inv.held;
      if (s && ITEMS[s.id].food && attack.pressed) { this.eat(); }
      else if (!s || !ITEMS[s.id].food) {
        this.combo = this.queued ? (this.combo + 1) % 3 : 0;
        this.queued = false;
        this.swing = 0; this.impactDone = false; this.heavy = false;
        this.swingDur = 0.58 / speed;
      }
    }
    if (this.swing >= 0) {
      // keep holding during the wind-up in a fight → charged heavy strike
      if (fighting && !this.heavy && this.swing < 0.35 && attack.down && attack.held > 0.3 && this.player.stamina > 15) {
        this.heavy = true; this.swingDur *= 1.7;
      }
      this.swing += dt / this.swingDur;
      if (!this.impactDone && this.swing >= 0.62) { this.impactDone = true; this.impact(); }
      if (this.swing >= 1) this.swing = -1;
    }
    this.hero.swing = this.swing;

    // harvesting animation then the effect
    if (this.harvestT >= 0) {
      this.harvestT += dt;
      this.hero.harvest = Math.min(1, Math.sin(Math.min(1, this.harvestT / 0.7) * Math.PI) * 1.4);
      if (this.harvestT > 0.4 && this.harvestJob) { this.harvestJob(); this.harvestJob = null; }
      if (this.harvestT > 0.7) { this.harvestT = -1; this.hero.harvest = 0; }
    }
    if (input.button('interact').pressed && this.action && this.harvestT < 0) this.action();
  }

  // ---------------------------------------------------------------- aiming
  private aim(camera: THREE.PerspectiveCamera) {
    const dir = V(0, 0, -1).applyQuaternion(camera.quaternion);
    const eye = this.player.eye.clone();
    this.aimRay.set(camera.position, dir);
    // start the ray near the player, not behind them at the camera
    const along = Math.max(0, eye.clone().sub(camera.position).dot(dir) - 0.6);
    const origin = camera.position.clone().addScaledVector(dir, along);
    const maxDist = REACH + 1.5;
    let best: Target = null, bestD = Infinity;
    const hit = this.world.raycast(origin, dir, maxDist);
    if (hit && hit.point.distanceTo(eye) <= REACH) { best = { type: 'terrain', point: hit.point, normal: hit.normal, material: hit.material }; bestD = hit.dist; }
    // building pieces stop the ray (you can't dig through your floor)
    const ph = this.building.raycast(origin, dir, maxDist);
    if (ph && ph.dist < bestD) { best = null; bestD = ph.dist; }
    // tree trunks: ray vs vertical cylinders
    const trees: TreeHit[] = [];
    this.world.treesNear(this.player.pos.x, this.player.pos.z, REACH + 1, trees);
    for (const t of trees) {
      const ox = origin.x - t.x, oz = origin.z - t.z;
      const a = dir.x * dir.x + dir.z * dir.z, b = 2 * (ox * dir.x + oz * dir.z), c = ox * ox + oz * oz - (t.r + 0.1) ** 2;
      const disc = b * b - 4 * a * c;
      if (disc < 0 || a < 1e-6) continue;
      const d = (-b - Math.sqrt(disc)) / (2 * a);
      if (d < 0 || d > bestD) continue;
      const p = origin.clone().addScaledVector(dir, d);
      if (p.y < t.y0 - 0.2 || p.y > t.y0 + Math.min(3, t.y1 - t.y0) || p.distanceTo(eye) > REACH) continue;
      best = { type: 'tree', tree: t, point: p }; bestD = d;
    }
    this.target = best;
  }

  private updateMarker() {
    const t = this.target;
    if (!t || t.type !== 'terrain') { this.marker.visible = false; return; }
    this.marker.visible = true;
    this.marker.position.copy(t.point).addScaledVector(t.normal, 0.04);
    this.marker.lookAt(t.point.clone().add(t.normal));
    const ok = this.digFactor(t.material) > 0;
    (this.marker.material as THREE.MeshBasicMaterial).color.set(ok ? 0xffe8b0 : 0xff5a4a);
  }

  private digFactor(m: number): number {
    const info = MINE[m];
    if (!info) return 0;
    const t = this.tool();
    const kind = t?.kind, tier = t?.tier ?? 0, power = t?.power ?? 0.5;
    if (kind === 'pickaxe') return info.tier <= tier ? (info.soft ? 0.7 : 1) * power : 0;
    if (kind === 'shovel') return info.soft ? 1.7 * power : 0;
    return info.soft ? 0.7 : 0; // hands, staff, axe…
  }

  private updateAttackLabel() {
    const t = this.target, k = this.tool()?.kind, s = this.inv.held;
    let label = 'Strike';
    if (s && ITEMS[s.id].food) label = 'Eat';
    else if (t?.type === 'tree') label = 'Chop';
    else if (t?.type === 'terrain') label = k === 'pickaxe' ? 'Mine' : 'Dig';
    this.ui.setAttack(label);
  }

  // ---------------------------------------------------------------- effects
  private impact() {
    // creatures and animals in front take the blow first
    if (this.combat && this.combat.playerAttack(this.heavy, this.combo)) return;
    const t = this.target;
    const tool = this.tool();
    if (!t) return;
    if (t.type === 'tree') {
      const def = TREE_DROPS[t.tree.kind];
      const key = `${t.tree.key}:${t.tree.index}`;
      const dmg = tool?.kind === 'axe' ? tool.power * 1.2 : tool?.kind === 'pickaxe' ? 0.5 : 0.3;
      const total = (this.treeDamage.get(key) ?? 0) + dmg;
      this.inv.wear(tool?.kind === 'axe' ? 1 : 0);
      const scale = Math.max(0.6, (t.tree.y1 - t.tree.y0) / 5);
      if (total >= def.hp * scale) {
        this.treeDamage.delete(key);
        this.world.removeTree(t.tree.key, t.tree.index);
        this.give(def.drops, 1 + (tool?.kind === 'axe' ? (tool.tier - 1) * 0.15 : 0));
      } else {
        this.treeDamage.set(key, total);
        if (!tool || tool.kind !== 'axe') this.ui.toast(total < 0.7 ? 'An axe would make short work of this.' : '…', '#c8b890');
      }
      return;
    }
    const f = this.digFactor(t.material);
    if (f <= 0) {
      const info = MINE[t.material];
      this.ui.toast(info ? (info.soft ? 'Nothing happens.' : `Too hard — you need a better pickaxe (tier ${info.tier}).`) : 'This will not break.', '#e08070');
      return;
    }
    const kind = tool?.kind;
    const r = kind === 'shovel' ? 1.25 : kind === 'pickaxe' ? 1.05 : 0.85;
    const centre = t.point.clone().addScaledVector(t.normal, -0.25);
    const removed = this.world.dig(centre.x, centre.y, centre.z, r, 1, (m) => this.digFactor(m));
    let gotAny = false;
    for (const [m, count] of removed) {
      const info = MINE[m];
      if (!info) continue;
      let n = 0;
      for (let i = 0; i < count; i++) if (Math.random() < info.chance * (kind === 'shovel' || kind === 'pickaxe' ? 1.3 : 0.8)) n++;
      if (m === B.GRAVEL && Math.random() < 0.15) this.giveOne('flint', 1);
      if (n > 0) { this.giveOne(info.item, n); gotAny = true; }
    }
    if (removed.size) this.inv.wear(1);
    // plants on the dug spot fall away
    for (const p of this.world.plantsNear(centre.x, centre.y, centre.z, r + 0.6)) this.world.removePlant(p.key, p.index);
    if (!gotAny && removed.size === 0) this.inv.wear(0);
  }

  private give(drops: [string, number, number][], mult = 1) {
    for (const [id, lo, hi] of drops) {
      const n = Math.round((lo + Math.floor(Math.random() * (hi - lo + 1))) * mult);
      if (n > 0) this.giveOne(id, n);
    }
  }

  private giveOne(id: string, n: number) {
    const left = this.inv.add(id, n);
    const def = ITEMS[id];
    if (left < n) this.ui.toast(`+${n - left} ${def.name}`, '#e8d8a8');
    if (left > 0) this.ui.toast('Your pack is full.', '#e08070');
  }

  private eat() {
    const s = this.inv.held;
    if (!s) return;
    const food = ITEMS[s.id].food!;
    this.player.life = Math.min(this.player.maxLife, this.player.life + food.heal);
    if (food.stamina) this.player.stamina = Math.min(100, this.player.stamina + food.stamina);
    if (food.cures) { this.combat?.cure(food.cures); this.ui.toast(food.cures === 'bleed' ? 'The bleeding stops.' : 'The poison fades.', '#a8e0a0'); }
    this.ui.toast(`You eat the ${ITEMS[s.id].name.toLowerCase()}.`, '#a8e0a0');
    this.inv.consume(this.inv.selected);
    this.harvestT = 0.35;
  }

  // ---------------------------------------------------------------- contextual INTERACT
  private updateAction() {
    const s = this.inv.held;
    const def = s ? ITEMS[s.id] : undefined;
    const p = this.player.pos;
    this.action = null;
    let label: string | null = null;
    if (def?.place && this.player.state === 'ground') {
      label = `Place ${def.name}`;
      this.action = () => this.placeHeld();
    } else if (this.extra?.()) {
      const x = this.extra()!;
      label = x.label; this.action = x.run;
    } else {
      // nearest harvestable plant in front of the player
      const fwd = V(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
      const near = this.world.plantsNear(p.x + fwd.x * 0.8, p.y + 0.3, p.z + fwd.z * 0.8, 1.6);
      near.sort((a, b) => ((a.x - p.x) ** 2 + (a.z - p.z) ** 2) - ((b.x - p.x) ** 2 + (b.z - p.z) ** 2));
      const plant = near.find((q) => PLANT_DROPS[q.kind]);
      const station = this.props.nearest(p, 2.4);
      const piece = this.building.usable(p, this.player.yaw);
      const body = this.creatures?.lootable(p) ?? null;
      const carcass = body ? null : this.wildlife?.lootable(p) ?? null;
      if (body || carcass) {
        const target = (body ?? carcass)!;
        label = `Loot ${body ? body.def.name : 'carcass'}`;
        this.action = () => {
          this.harvestT = 0;
          this.harvestJob = () => {
            const got = this.combat!.loot(target);
            this.ui.toast(got.length ? `Looted: ${got.join(', ')}` : 'Nothing of value.', '#e8d8a8');
          };
        };
      } else if (piece) {
        const use = PIECES[piece.id].use;
        if (use === 'door') { label = piece.open ? 'Close door' : 'Open door'; this.action = () => this.building.toggleDoor(piece); }
        else if (use === 'bed') { label = 'Sleep'; this.action = () => this.ui.sleep(piece); }
        else if (use === 'chest') { label = 'Open chest'; this.action = () => this.ui.openChest(piece); }
        else if (use === 'sit') { label = this.player.sitting ? 'Stand up' : 'Sit'; this.action = () => { this.player.sitting = !this.player.sitting; if (this.player.sitting) { this.player.pos.set(piece.x, piece.y + 0.05, piece.z); this.player.yaw = piece.rot + Math.PI; } }; }
        else if (use === 'tablet') { label = 'Read the tablet'; this.action = () => this.ui.special(piece); }
        else if (use === 'gate') { label = 'Examine the gate'; this.action = () => this.ui.special(piece); }
        else if (use === 'board') { label = 'Read the notices'; this.action = () => this.ui.special(piece); }
        else if (use === 'waystone') { label = 'Touch the waystone'; this.action = () => this.ui.special(piece); }
        else if (use === 'stash') { label = 'Open your vault'; this.action = () => this.ui.special(piece); }
        else if (use === 'hoard') { label = 'Open the hoard'; this.action = () => this.ui.special(piece); }
        else if (use === 'rite') { label = 'Open the chest'; this.action = () => this.ui.special(piece); }
        else if (use === 'claim') { label = 'Boundary stone'; this.action = () => this.ui.toast(this.building.isSafe(this.player.pos) ? 'Your land is claimed and lit. Monsters will not spawn here.' : 'Your land is claimed. Light it (torch, lantern, fireplace) to keep monsters away.', '#c8b0ff'); }
      } else if (plant) {
        const d = PLANT_DROPS[plant.kind];
        label = d.verb;
        this.action = () => {
          this.harvestT = 0;
          this.player.yaw = Math.atan2(-(plant.x - p.x), -(plant.z - p.z));
          this.harvestJob = () => {
            if (this.world.isPlantRemoved(plant.key, plant.index)) return;
            this.world.removePlant(plant.key, plant.index);
            const sickle = this.tool()?.kind === 'sickle' || this.tool()?.kind === 'knife';
            this.give(d.drops, (sickle ? 1.6 : 1) * this.herbMul);
            if (sickle) this.inv.wear(1);
          };
        };
      } else if (station) {
        label = `Use ${station.type[0].toUpperCase()}${station.type.slice(1)}`;
        this.action = () => this.ui.openCrafting();
      } else if (this.player.inWater || this.nearWater()) {
        label = 'Drink';
        this.action = () => {
          this.player.stamina = 100;
          this.ui.toast('Cold, clear water.', '#a8d0f0');
          this.harvestT = 0;
        };
      }
    }
    this.ui.setAction(label);
  }

  private nearWater(): boolean {
    const p = this.player.pos;
    const fwd = V(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    const s = this.world.waterSurface(p.x + fwd.x * 1.2, p.y + 0.5, p.z + fwd.z * 1.2);
    return s > p.y - 1.2 && s < p.y + 0.6;
  }

  private placeHeld() {
    const s = this.inv.held;
    if (!s) return;
    const def = ITEMS[s.id];
    const p = this.player.pos;
    const fwd = V(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    const x = p.x + fwd.x * 1.8, z = p.z + fwd.z * 1.8;
    const y = this.world.groundNear(x, z, p.y);
    if (Math.abs(y - p.y) > 1.5 || this.world.waterSurface(x, y + 0.5, z) > y) { this.ui.toast('You cannot place that here.', '#e08070'); return; }
    this.props.add({ type: def.place!, x, y: y - 0.03, z, rot: this.player.yaw });
    this.inv.consume(this.inv.selected);
    this.ui.toast(`${def.name} placed.`, '#e8d8a8');
  }
}
