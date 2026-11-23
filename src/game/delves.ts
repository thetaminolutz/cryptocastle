// Dungeons at runtime: their pieces near the player, enemies that wake as you enter
// each room, the boss in the deepest room, loot chests, discovery on the map, and
// the reset after a week (cleared dungeons stay cleared for a while).
import * as THREE from 'three';
import { ENEMIES } from '../data/enemies';
import { ITEMS } from '../data/items';
import { AFFIXES, LOOT_TIERS, UNIQUES } from '../data/gear';
import { Dungeon, THEMES, dungeonPieces, roomAt } from '../world/dungeons';
import type { TerrainGen } from '../world/terrain';
import type { World } from '../world/world';
import type { Building, Piece } from '../world/building';
import type { Player } from '../entities/player';
import type { Creatures, Creature } from '../entities/creatures';
import type { WorldMap } from '../ui/map';
import { stackName, type Inventory, type Stack } from './inventory';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const RESET_DAYS = 7;

export interface DelveState { cleared: number[]; chests: string[]; boss: boolean; day: number; }
export interface DelveHooks { toast(t: string, c?: string): void; addGold(n: number): void; day(): number; bossDead(id: string): boolean; }

export class Delves {
  state: Record<string, DelveState> = {};
  private loaded = new Map<string, Dungeon>();
  private roomFoes = new Map<string, Creature[]>();
  private timer = 0;

  constructor(private gen: TerrainGen, _world: World, private building: Building, private player: Player, private creatures: Creatures,
    private map: WorldMap, private inv: Inventory, private hooks: DelveHooks) {}

  load(d: Record<string, DelveState> | undefined) { if (d) this.state = d; }
  serialize() { return this.state; }

  private st(D: Dungeon): DelveState {
    let s = this.state[D.id];
    if (!s) s = this.state[D.id] = { cleared: [], chests: [], boss: false, day: this.hooks.day() };
    if (this.hooks.day() - s.day >= RESET_DAYS && (s.cleared.length || s.chests.length)) { s.cleared = []; s.chests = []; s.boss = false; s.day = this.hooks.day(); }
    return s;
  }

  /** the dungeon the player is inside (underground), if any */
  current(): Dungeon | null {
    const p = this.player.pos;
    for (const D of this.loaded.values()) if (p.x > D.minX && p.x < D.maxX && p.z > D.minZ && p.z < D.maxZ && p.y < D.surface - 3) return D;
    return null;
  }

  update(dt: number) {
    const p = this.player.pos;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1;
      const near = this.gen.dungeonsNear(p.x, p.z, 180);
      for (const D of near) if (!this.loaded.has(D.id)) { this.loaded.set(D.id, D); this.building.setGenerated(`dg:${D.id}`, dungeonPieces(D)); }
      for (const [id, D] of this.loaded) if (Math.hypot(D.x - p.x, D.z - p.z) > 240) { this.loaded.delete(id); this.building.setGenerated(`dg:${id}`, null); }
      for (const D of this.loaded.values()) {
        const key = `dg:${D.name}@${Math.round(D.entrance.x)},${Math.round(D.entrance.z)}`;
        if (!this.map.places.has(key) && Math.hypot(D.entrance.x - p.x, D.entrance.z - p.z) < 45) {
          this.map.places.add(key);
          this.hooks.toast(`Discovered: ${D.name}`, '#c8b0ff');
        }
      }
    }
    const D = this.current();
    if (!D) return;
    const s = this.st(D);
    const ri = roomAt(D, p.x, p.y, p.z);
    if (ri < 0) return;
    const room = D.rooms[ri];
    const key = `${D.id}:${ri}`;
    if (s.cleared.includes(ri)) return;
    let foes = this.roomFoes.get(key);
    if (!foes) {
      foes = [];
      const T = THEMES[D.theme];
      if (room.boss) {
        if (!s.boss && !this.hooks.bossDead(T.boss + ':' + D.id)) {
          const c = this.creatures.spawn(ENEMIES[T.boss], V((room.x0 + room.x1) / 2, room.y + 0.1, room.z0 + 3), D.danger, 0);
          c.state = 'chase'; c.alerted = true;
          foes.push(c);
          this.hooks.toast(`${ENEMIES[T.boss].name} — ${ENEMIES[T.boss].boss!.title}`, '#e8a030');
        }
      } else if (!room.hidden) {
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const id = T.enemies[Math.floor(Math.random() * T.enemies.length)];
          const x = room.x0 + 1.2 + Math.random() * (room.x1 - room.x0 - 2.4), z = room.z0 + 1.2 + Math.random() * (room.z1 - room.z0 - 2.4);
          const c = this.creatures.spawn(ENEMIES[id], V(x, room.y + 0.1, z), D.danger, i);
          c.state = 'chase'; c.alerted = true; c.home.set(x, room.y, z);
          foes.push(c);
        }
      }
      this.roomFoes.set(key, foes);
    }
    if (foes.every((c) => c.state === 'dead' || !this.creatures.list.includes(c))) {
      s.cleared.push(ri);
      if (room.boss) { s.boss = true; this.hooks.toast(`${D.name} falls silent.`, '#c8b0ff'); }
      this.roomFoes.delete(key);
      if (!s.day) s.day = this.hooks.day();
    }
  }

  /** a loot chest was opened */
  openChest(p: Piece): boolean {
    if (p.id !== 'loot_chest') return false;
    const tag = p.items?.[0]?.id ?? '';
    const [, dId, roomI] = tag.split(':');
    const D = [...this.loaded.values()].find((d) => d.id === dId);
    if (!D) return true;
    const s = this.st(D);
    if (s.chests.includes(tag)) { this.hooks.toast('Empty. Someone — you — got here first.', '#a8987c'); return true; }
    const room = D.rooms[Number(roomI)];
    // the boss chest only opens once its keeper is dead
    if (room.boss && !s.boss) { this.hooks.toast('The chest is bound in black iron. Its keeper still lives.', '#e08070'); return true; }
    s.chests.push(tag);
    const got: string[] = [];
    const gold = Math.round((10 + Math.random() * 25) * D.danger * (room.boss ? 3 : room.hidden ? 2 : 1));
    this.hooks.addGold(gold); got.push(`${gold} gold`);
    const rolls = room.boss ? 2 : room.hidden ? 2 : 1;
    for (let i = 0; i < rolls; i++) {
      let id: string;
      if ((room.hidden && i === 0 && Math.random() < 0.5) || (room.boss && Math.random() < 0.15)) id = UNIQUES[Math.floor(Math.random() * UNIQUES.length)];
      else {
        const tier = room.boss || room.hidden ? 'high' : D.danger > 2.2 ? 'mid' : Math.random() < 0.35 ? 'mid' : 'low';
        const pool = LOOT_TIERS[tier];
        id = pool[Math.floor(Math.random() * pool.length)];
      }
      const st: Stack = { id, n: 1, dur: ITEMS[id].tool?.durability || undefined, affix: ITEMS[id].weapon && ITEMS[id].rarity !== 'legendary' && Math.random() < 0.4 ? Object.keys(AFFIXES)[Math.floor(Math.random() * Object.keys(AFFIXES).length)] : undefined };
      if (this.inv.addStack(st)) got.push(stackName(st));
    }
    if (Math.random() < 0.5) { const left = this.inv.add('bandage', 1 + Math.floor(Math.random() * 2)); if (!left) got.push('bandages'); }
    this.hooks.toast(`You find: ${got.join(', ')}`, '#f0d070');
    return true;
  }
}
