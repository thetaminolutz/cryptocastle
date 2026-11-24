// World events: a blood moon (stronger monsters, better loot), falling stars that
// leave rare ore, a travelling merchant caravan, village festivals and dragons
// passing overhead. Rolled at dusk and dawn from the in-game calendar.
import * as THREE from 'three';
import { ENEMIES } from '../data/enemies';
import { ITEMS } from '../data/items';
import { UNIQUES, LOOT_TIERS } from '../data/gear';
import { U } from '../world/shaders';
import { Actor } from './story';
import { iconUrl } from '../ui/icons';
import type { Piece, Building } from '../world/building';
import type { TerrainGen } from '../world/terrain';
import type { Player } from '../entities/player';
import type { Creatures } from '../entities/creatures';
import type { Inventory } from './inventory';
import type { WorldMap } from '../ui/map';
import type { FrescoKind } from './fresco';

export interface EventsSave { last: number; blood: number; festival: string | null; festivalDay: number; caravan: { x: number; z: number; day: number; wares: string[] } | null; meteor: { x: number; z: number } | null; counts: Record<string, number>; }
export interface EventHooks {
  toast(t: string, c?: string): void; log(kind: FrescoKind, text: string): void;
  gold(): number; addGold(n: number): void;
  day(): number; hours(): number;
  villageHere(): { id: string; name: string; x: number; z: number } | null;
  pause(p: boolean): void;
}

export class WorldEvents {
  readonly group = new THREE.Group();
  /** day number of the current blood moon (-1 = none) */
  blood = -1;
  festival: string | null = null;
  festivalDay = -1;
  caravan: EventsSave['caravan'] = null;
  meteor: EventsSave['meteor'] = null;
  counts: Record<string, number> = {};
  private last = -1;
  private streak: THREE.Mesh;
  private streakT = -1;
  private streakFrom = new THREE.Vector3(); private streakTo = new THREE.Vector3();
  private dragon = new Actor(ENEMIES.ash_dragon.build);
  private dragonT = -1;
  private dragonFrom = new THREE.Vector3(); private dragonTo = new THREE.Vector3();

  constructor(private ui: HTMLElement, private gen: TerrainGen, private building: Building, private player: Player, private creatures: Creatures,
    private inv: Inventory, private map: WorldMap, private hooks: EventHooks) {
    this.streak = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.05, 30, 6).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3.5, 5), transparent: true, opacity: 0.9 }));
    this.streak.visible = false;
    this.group.add(this.streak, this.dragon.mesh);
  }

  load(d: EventsSave | undefined) {
    if (!d) return;
    this.last = d.last; this.blood = d.blood; this.festival = d.festival; this.festivalDay = d.festivalDay; this.caravan = d.caravan; this.meteor = d.meteor; this.counts = d.counts ?? {};
    if (this.caravan) this.placeCaravan();
    if (this.meteor) this.placeMeteor();
  }
  serialize(): EventsSave { return { last: this.last, blood: this.blood, festival: this.festival, festivalDay: this.festivalDay, caravan: this.caravan, meteor: this.meteor, counts: this.counts }; }

  private count(k: string) { this.counts[k] = (this.counts[k] ?? 0) + 1; }
  get bloodMoon() { const h = this.hooks.hours(); return this.blood >= 0 && ((this.hooks.day() === this.blood && h >= 19) || (this.hooks.day() === this.blood + 1 && h < 5)); }
  festivalIn(villageId: string) { return this.festival === villageId && this.hooks.day() === this.festivalDay && this.hooks.hours() >= 16; }

  update(dt: number) {
    const day = this.hooks.day(), h = this.hooks.hours();
    // roll once per half day: at dusk (19h) and at morning (8h)
    const slot = day * 2 + (h >= 19 ? 1 : h >= 8 ? 0 : -1);
    if (slot > this.last && (h >= 19 || (h >= 8 && h < 10))) {
      this.last = slot;
      if (h >= 19) this.rollNight(day); else this.rollDay(day);
    }
    // blood moon: red sky, more elites
    const bm = this.bloodMoon;
    this.creatures.eliteBonus = bm ? 0.18 : 0;
    if (this.caravan && day > this.caravan.day + 1) { this.caravan = null; this.building.setGenerated('caravan', null); }
    // a falling star
    if (this.streakT >= 0) {
      this.streakT += dt;
      const k = Math.min(1, this.streakT / 2.2);
      this.streak.visible = k < 1;
      this.streak.position.lerpVectors(this.streakFrom, this.streakTo, k);
      this.streak.lookAt(this.streakTo); this.streak.rotateY(Math.PI / 2);
      if (k >= 1) { this.streakT = -1; this.placeMeteor(); this.hooks.toast('A thunderclap. Something glows on the horizon.', '#a8d0ff'); }
    }
    // a dragon passes over
    const d = this.dragon;
    if (this.dragonT >= 0) {
      this.dragonT += dt;
      const k = this.dragonT / 22;
      d.visible = k < 1;
      d.pos.lerpVectors(this.dragonFrom, this.dragonTo, k);
      d.yaw = Math.atan2(-(this.dragonTo.x - this.dragonFrom.x), -(this.dragonTo.z - this.dragonFrom.z));
      d.move = 1; d.phase += dt * 4;
      if (k >= 1) this.dragonT = -1;
    } else d.visible = false;
    d.write();
    if (d.visible) d.mesh.scale.setScalar(2.2);
  }

  /** after the sky has been updated: the blood moon reddens it */
  tintSky() {
    if (!this.bloodMoon) return;
    U.uZenith.value.lerp(new THREE.Color(0.18, 0.01, 0.01), 0.6);
    U.uHorizon.value.lerp(new THREE.Color(0.45, 0.05, 0.03), 0.6);
    U.uFogColor.value.lerp(new THREE.Color(0.2, 0.03, 0.02), 0.5);
  }

  private rollNight(day: number) {
    const r = Math.random();
    if (r < 0.1 && day > 1) { this.blood = day; this.count('blood'); this.hooks.toast('The moon rises red. Tonight the monsters are bolder — and richer.', '#e04030'); this.hooks.log('death', 'A blood moon rose'); }
    else if (r < 0.22) this.fallingStar();
    else if (r < 0.27) this.dragonPass();
  }

  private rollDay(day: number) {
    const r = Math.random();
    if (r < 0.28 && !this.caravan) this.spawnCaravan(day);
    else if (r < 0.4) {
      const v = this.hooks.villageHere();
      if (v) { this.festival = v.id; this.festivalDay = day; this.count('festival'); this.hooks.toast(`${v.name} prepares a festival tonight! Lanterns, music, and cheap ale.`, '#f0d070'); this.hooks.log('village', `The festival of ${v.name}`); }
    } else if (r < 0.45) this.dragonPass();
  }

  fallingStar() {
    const p = this.player.pos;
    const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 120;
    const x = Math.round(p.x + Math.cos(a) * d), z = Math.round(p.z + Math.sin(a) * d);
    this.meteor = { x, z };
    this.streakFrom.set(p.x + Math.cos(a) * 400, 220, p.z + Math.sin(a) * 400 + 150);
    this.streakTo.set(x, this.gen.column(x, z).height + 2, z);
    this.streakT = 0;
    this.map.pins.push([x, z]);
    this.count('meteor');
  }

  private placeMeteor() {
    if (!this.meteor) return;
    const { x, z } = this.meteor;
    this.building.setGenerated('meteor', [{ id: 'meteor', x, y: this.gen.column(x, z).height - 0.2, z, rot: 0, gen: true } as Piece]);
  }

  dragonPass() {
    const p = this.player.pos, a = Math.random() * Math.PI * 2;
    this.dragonFrom.set(p.x + Math.cos(a) * 220, p.y + 70, p.z + Math.sin(a) * 220);
    this.dragonTo.set(p.x - Math.cos(a) * 220, p.y + 60, p.z - Math.sin(a) * 220);
    this.dragonT = 0;
    this.count('dragon');
    this.hooks.toast('A vast shadow passes over the land. Wings — enormous wings.', '#e08070');
  }

  spawnCaravan(day: number) {
    const p = this.player.pos;
    for (let t = 0; t < 20; t++) {
      const a = Math.random() * Math.PI * 2, x = Math.round(p.x + Math.cos(a) * 40), z = Math.round(p.z + Math.sin(a) * 40);
      const c = this.gen.column(x, z);
      if (c.liquidLevel > c.height - 0.3) continue;
      const wares = [...new Set([...Array(5)].map(() => { const pool = Math.random() < 0.15 ? UNIQUES : Math.random() < 0.5 ? LOOT_TIERS.mid : LOOT_TIERS.high; return pool[Math.floor(Math.random() * pool.length)]; }))];
      wares.push('wish_shard', 'arrow', 'bandage');
      this.caravan = { x, z, day, wares };
      this.placeCaravan();
      this.count('caravan');
      this.hooks.toast('Bells on the road: a merchant caravan has stopped nearby.', '#f0d070');
      this.map.pins.push([x, z]);
      return;
    }
  }

  private placeCaravan() {
    if (!this.caravan) return;
    const { x, z } = this.caravan;
    this.building.setGenerated('caravan', [{ id: 'caravan', x, y: this.gen.column(x, z).height, z, rot: Math.random() * 6, gen: true } as Piece]);
  }

  /** event pieces */
  special(p: Piece): boolean {
    if (p.id === 'meteor') {
      const got: [string, number][] = [['mithril_ore', 2 + Math.floor(Math.random() * 3)], ['crystal_shard', 2 + Math.floor(Math.random() * 3)]];
      if (Math.random() < 0.6) got.push(['moonstone', 1]);
      for (const [id, n] of got) this.inv.add(id, n);
      this.hooks.toast(`The fallen star cracks open: ${got.map(([id, n]) => `${n} ${ITEMS[id].name}`).join(', ')}.`, '#a8d0ff');
      this.hooks.log('quest', 'Broke open a fallen star');
      this.meteor = null; this.building.setGenerated('meteor', null);
      const pins = this.map.pins; const i = pins.findIndex(([x, z]) => Math.hypot(x - p.x, z - p.z) < 3); if (i >= 0) pins.splice(i, 1);
      return true;
    }
    if (p.id === 'caravan') { this.openCaravan(); return true; }
    return false;
  }

  private price(id: string) { const d = ITEMS[id]; return id === 'wish_shard' ? 220 : id === 'arrow' ? 2 : Math.max(4, Math.round((d.value ?? 10) * (d.rarity === 'legendary' || d.rarity === 'cursed' ? 2.2 : 1.6))); }

  private openCaravan() {
    const c = this.caravan; if (!c) return;
    const root = document.createElement('div'); root.className = 'menu';
    const box = document.createElement('div'); box.className = 'menu-box panel'; box.style.maxWidth = '640px';
    const draw = () => {
      box.innerHTML = `<h2>The Travelling Caravan</h2><p class="cr-intro">“Silks from the south, steel from the north, and things from places that are not on any map. Gold only.” — you have ${this.hooks.gold()} gold</p>`;
      for (const id of c.wares) {
        const d = ITEMS[id]; if (!d) continue;
        const row = document.createElement('div'); row.className = 'board-q';
        const n = id === 'arrow' ? 20 : id === 'bandage' ? 3 : 1;
        const cost = this.price(id) * n;
        row.innerHTML = `<img src="${iconUrl(id)}" style="width:40px;height:40px;float:left;margin-right:10px"><b>${n > 1 ? n + '× ' : ''}${d.name}</b><p>${d.desc}</p>`;
        const b = document.createElement('button'); b.className = 'btn'; b.textContent = `Buy — ${cost} gold`;
        b.disabled = this.hooks.gold() < cost;
        b.onclick = () => {
          if (this.hooks.gold() < cost) return;
          if (this.inv.add(id, n) >= n) { this.hooks.toast('Your pack is full.', '#e08070'); return; }
          this.hooks.addGold(-cost); this.count('bought');
          if (id !== 'arrow' && id !== 'bandage') c.wares = c.wares.filter((w) => w !== id);
          draw();
        };
        row.appendChild(b); box.appendChild(row);
      }
      const close = document.createElement('button'); close.className = 'btn'; close.textContent = 'Farewell';
      close.onclick = () => { root.remove(); this.hooks.pause(false); };
      box.appendChild(close);
    };
    draw();
    root.appendChild(box);
    this.ui.appendChild(root);
    this.hooks.pause(true);
  }
}
