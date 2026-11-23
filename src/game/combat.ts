// Combat rules: player strikes (light combos, charged heavy), blocking, parrying,
// dodge invulnerability, damage types, status effects, loot, XP / levels, damage
// numbers, hit feedback and target lock.
import * as THREE from 'three';
import { input } from '../engine/input';
import { audio } from '../engine/audio';
import { settings } from '../engine/settings';
import { ITEMS, weaponOf, DmgType } from '../data/items';
import type { Status } from '../data/enemies';
import type { Player } from '../entities/player';
import type { Creatures, Creature } from '../entities/creatures';
import type { Wildlife, Animal } from '../entities/animals';
import { ANIMAL_STATS, SPECIES_NAME } from '../entities/animals';
import type { Inventory } from './inventory';

export interface CombatHooks {
  toast(text: string, color?: string): void;
  addGold(n: number): void;
  shake(amount: number): void;
  onLevel(level: number): void;
}

const STATUS_TIME: Record<Status, number> = { bleed: 6, poison: 9, burn: 3.5, frozen: 3, stun: 1, curse: 20 };
export const STATUS_LABEL: Record<Status, [string, string]> = {
  bleed: ['Bleeding', '#e03030'], poison: ['Poisoned', '#80d040'], burn: ['Burning', '#ff8a20'],
  frozen: ['Frozen', '#80c0ff'], stun: ['Stunned', '#e0d060'], curse: ['Cursed', '#a060e0']
};
const NUMBERS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
export function levelWord(n: number) {
  if (n <= 20) return NUMBERS[n];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty'][Math.floor(n / 10)];
  return n % 10 ? `${tens}-${NUMBERS[n % 10].toLowerCase()}` : tens;
}
export const xpForLevel = (n: number) => Math.round(40 * Math.pow(n - 1, 1.65));

interface Num { el: HTMLDivElement; pos: THREE.Vector3; t: number; }

export class Combat {
  status = new Map<Status, number>();
  lock: Creature | null = null;
  lastHit: Creature | Animal | null = null;
  xp = 0;
  level = 1;
  private blockPressed = -10;
  private time = 0;
  private nums: Num[] = [];
  private numLayer: HTMLDivElement;

  constructor(ui: HTMLElement, private player: Player, private creatures: Creatures, private wildlife: Wildlife, private inv: Inventory, private hooks: CombatHooks) {
    this.numLayer = document.createElement('div');
    this.numLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    ui.appendChild(this.numLayer);
    creatures.hooks.strike = (c: Creature) => this.hitPlayer(c.pos, c.def.dmg * c.dmgMul, c.def.dmgType, c.def.onHit, c.def.name, () => creatures.stun(c, 1.6));
    wildlife.onAttack = (a, dmg, bleed) => this.hitPlayer(a.pos, dmg, 'pierce', bleed ? ['bleed', bleed] : undefined, SPECIES_NAME(a.sp));
  }

  /** Damage multiplier from levels. */
  get power() { return 1 + (this.level - 1) * 0.04; }

  get shield(): number {
    let best = 0;
    for (let i = 0; i < 6; i++) { const s = this.inv.slots[i]; const sh = s && ITEMS[s.id].shield; if (sh && sh.block > best) best = sh.block; }
    return best;
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number, camera: THREE.PerspectiveCamera) {
    this.time += dt;
    const p = this.player;
    // blocking (hold BLOCK)
    const b = input.button('block');
    if (b.pressed) this.blockPressed = this.time;
    p.blocking = b.down && p.stamina > 1 && p.state === 'ground';
    // status effects
    p.slow = this.status.has('frozen') ? 0.5 : 1;
    for (const [s, t] of this.status) {
      const left = t - dt;
      if (s === 'bleed') p.damage(2 * dt, 'bleeding');
      else if (s === 'poison') { p.damage(1.4 * dt, 'poison'); p.stamina = Math.max(0, p.stamina - 4 * dt); }
      else if (s === 'burn') { p.damage(4 * dt, 'fire'); if (p.inWater) { this.status.delete(s); continue; } }
      if (left <= 0) this.status.delete(s); else this.status.set(s, left);
    }
    // target lock validity
    if (this.lock && (this.lock.state === 'dead' || this.lock.pos.distanceTo(p.pos) > 30)) this.lock = null;
    // floating numbers
    const v = new THREE.Vector3();
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t += dt;
      v.copy(n.pos).setY(n.pos.y + n.t * 0.9).project(camera);
      if (n.t > 1.1 || v.z > 1) { n.el.remove(); this.nums.splice(i, 1); continue; }
      n.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px)`;
      n.el.style.opacity = String(Math.min(1, (1.1 - n.t) * 3));
    }
  }

  private number(pos: THREE.Vector3, text: string, color: string, big = false) {
    if (!settings.values.damageNumbers) return;
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `position:absolute;left:0;top:0;margin:-10px 0 0 -20px;width:40px;text-align:center;font-weight:bold;font-size:${big ? 22 : 16}px;color:${color};text-shadow:1px 1px 0 #000,-1px -1px 0 #000;`;
    this.numLayer.appendChild(el);
    this.nums.push({ el, pos: pos.clone(), t: 0 });
  }

  // ---------------------------------------------------------------- player attacks
  /** Resolve the impact of a swing. Returns true if anything was hit. */
  playerAttack(heavy: boolean, combo: number): boolean {
    const p = this.player;
    const held = this.inv.held?.id;
    const w = weaponOf(held);
    const mult = (heavy ? 2.2 : combo >= 2 ? 1.45 : 1) * this.power;
    const origin = p.pos.clone().setY(p.pos.y + 1);
    // with a locked target, swing toward it
    if (this.lock && this.lock.pos.distanceTo(p.pos) < w.reach + 2) p.yaw = Math.atan2(-(this.lock.pos.x - p.pos.x), -(this.lock.pos.z - p.pos.z));
    let hit = false;
    for (const c of this.creatures.inArc(p.pos, p.yaw, w.reach + (heavy ? 0.3 : 0))) {
      const crit = Math.random() < 0.08;
      const dmg = this.creatures.damage(c, w.dmg * mult * (crit ? 1.8 : 1) * (0.9 + Math.random() * 0.2), w.type, p.pos, heavy);
      const eff = (c.def.weak[w.type] ?? 1);
      this.number(c.pos.clone().setY(c.pos.y + c.def.height + c.hover), String(Math.round(dmg)), eff > 1.05 ? '#ffd040' : eff < 0.95 ? '#9a9a9a' : '#ffffff', crit || heavy);
      this.lastHit = c;
      hit = true;
      if (c.state === 'dead') this.onKill(c);
    }
    for (const a of this.wildlife.inArc(p.pos, p.yaw, w.reach)) {
      const dmg = this.wildlife.damage(a, w.dmg * mult, origin);
      this.number(a.pos.clone().setY(a.pos.y + 1.2), String(Math.round(dmg)), '#ffffff');
      this.lastHit = a; hit = true;
      if (a.dead) this.gainXp(Math.round(ANIMAL_STATS[a.sp].hp / 4));
    }
    if (hit) {
      audio.impact(heavy);
      this.hooks.shake(heavy ? 0.25 : 0.1);
      if (held && ITEMS[held].tool?.durability) this.inv.wear(1);
    } else audio.whoosh();
    p.stamina = Math.max(0, p.stamina - w.stamina * (heavy ? 2.2 : 1));
    return hit;
  }

  private onKill(c: Creature) {
    this.gainXp(Math.round(c.def.xp * (c.elite ? 2.5 : 1)));
    if (this.lock === c) this.lock = null;
    if (c.elite) this.hooks.toast(`An elite ${c.def.name.toLowerCase()} falls.`, '#e8b030');
  }

  gainXp(n: number) {
    this.xp += n;
    while (this.level < 50 && this.xp >= xpForLevel(this.level + 1)) {
      this.level++;
      this.player.maxLife += 5;
      this.player.life = this.player.maxLife;
      this.hooks.onLevel(this.level);
    }
  }

  // ---------------------------------------------------------------- incoming damage
  hitPlayer(src: THREE.Vector3, dmg: number, type: DmgType, status: [Status, number] | undefined, name: string, onParry?: () => void) {
    const p = this.player;
    if (p.life <= 0) return;
    const reach = p.pos.distanceTo(src);
    if (reach > 4.5) return;
    if (p.invulnerable) { this.number(p.pos.clone().setY(p.pos.y + 2), 'Dodge', '#c8d8ff'); return; }
    const toSrc = Math.atan2(-(src.x - p.pos.x), -(src.z - p.pos.z));
    const front = Math.cos(toSrc - p.yaw) > 0.2;
    if (p.blocking && front) {
      if (this.time - this.blockPressed < 0.25) {
        // perfect timing: parry
        onParry?.();
        audio.parry();
        this.number(p.pos.clone().setY(p.pos.y + 2), 'Parry!', '#ffe080', true);
        this.hooks.shake(0.08);
        return;
      }
      const block = this.shield || 0.55;
      const cost = dmg * (this.shield ? 0.8 : 1.2);
      p.stamina -= cost;
      dmg *= 1 - block;
      audio.block();
      if (p.stamina <= 0) { p.stamina = 0; p.stunT = 0.9; this.hooks.toast('Your guard breaks!', '#e08070'); }
      status = undefined;
    }
    if (this.status.has('curse')) dmg *= 1.3;
    p.damage(dmg, name.toLowerCase().startsWith('a') ? `an ${name.toLowerCase()}` : `a ${name.toLowerCase()}`);
    this.number(p.pos.clone().setY(p.pos.y + 2), String(Math.round(dmg)), '#ff5a4a');
    this.hooks.shake(Math.min(0.4, 0.08 + dmg / 60));
    if (settings.values.hitSound) audio.hurt();
    if (status && Math.random() < status[1]) {
      const [s] = status;
      if (s === 'stun') p.stunT = STATUS_TIME.stun;
      else this.status.set(s, STATUS_TIME[s]);
    }
    if (type === 'fire' && Math.random() < 0.3) this.status.set('burn', STATUS_TIME.burn);
    if (type === 'ice' && Math.random() < 0.3) this.status.set('frozen', STATUS_TIME.frozen);
  }

  cure(what: string) { this.status.delete(what as Status); }

  // ---------------------------------------------------------------- loot
  loot(target: Creature | Animal): string[] {
    const isCreature = 'def' in target;
    const table = isCreature ? (target as Creature).def.loot : ANIMAL_STATS[(target as Animal).sp].loot;
    const got: string[] = [];
    const bonus = isCreature && (target as Creature).elite ? 1 : 0;
    for (const [id, lo, hi, chance] of table) {
      if (Math.random() > Math.min(1, chance + bonus * 0.3)) continue;
      const n = lo + Math.floor(Math.random() * (hi - lo + 1)) + bonus;
      if (n <= 0) continue;
      const left = this.inv.add(id, n);
      if (n - left > 0) got.push(`${n - left} ${ITEMS[id].name}`);
    }
    if (isCreature) {
      const [g0, g1] = (target as Creature).def.gold;
      const g = Math.round((g0 + Math.random() * (g1 - g0)) * (bonus ? 3 : 1));
      if (g > 0) { this.hooks.addGold(g); got.push(`${g} gold`); }
    }
    target.looted = true;
    return got;
  }

  /** Pick a target with a screen tap (normalised device coords). */
  tapTarget(ndc: THREE.Vector2, camera: THREE.PerspectiveCamera): boolean {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const c = this.creatures.pick(ray.ray);
    if (c) { this.lock = c; return true; }
    if (this.lock) { this.lock = null; return true; }
    return false;
  }
}
