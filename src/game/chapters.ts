// Story chapters 2–4 in the world: the barrow cemetery and the robbers' hoard, the
// scorpion labyrinth beneath the Pale Citadel, the arena trials. Also the citadel's
// quest board, the bank vault, the sealed gate and the waystones.
import * as THREE from 'three';
import { ENEMIES } from '../data/enemies';
import { QUESTS, Place } from '../data/quests';
import { CAMPFIRE, HERALD_SPOT, TOWER, GRAVEYARD, CITADEL_HALF, LAB } from '../data/story';
import { labyrinthPieces, labCell, VillageSite, Labyrinth, ARENA_DX, ARENA_DZ, ARENA_R } from '../world/villages';
import { audio } from '../engine/audio';
import type { Piece, Building } from '../world/building';
import type { World } from '../world/world';
import type { TerrainGen } from '../world/terrain';
import type { Player } from '../entities/player';
import type { Creatures, Creature } from '../entities/creatures';
import type { QuestLog } from './quests';
import type { WorldMap } from '../ui/map';
import type { NPC } from '../entities/villagers';
import type { Stack } from './inventory';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export interface ChapterHooks {
  toast(t: string, c?: string): void;
  gold(): number; addGold(n: number): void;
  give(id: string, n: number): void;
  openStash(items: (Stack | null)[]): void;
  openTravelMap(): void;
  pause(p: boolean): void;
  queenDead(): boolean;
}
export interface ChapterSave { stash: (Stack | null)[]; arenaWins: number; }

const ARENA_WAVES: [string, number][][] = [[['kobold', 3]], [['champion', 1]], [['troll', 1]]];

export class Chapters {
  readonly citadel: VillageSite;
  readonly lab: Labyrinth;
  readonly labEntrance: { x: number; z: number };
  stash: (Stack | null)[] = new Array(24).fill(null);
  arenaWins = 0;
  private graveLoaded = false;
  private labLoaded = false;
  private robbers: Creature[] = [];
  private scorpions: Creature[] = [];
  private scorpT = 0;
  private arena: { wave: number; foes: Creature[]; rest: number; forCoin: boolean } | null = null;

  constructor(private ui: HTMLElement, private gen: TerrainGen, private world: World, private building: Building, private player: Player,
    private creatures: Creatures, private quests: QuestLog, private map: WorldMap, private hooks: ChapterHooks) {
    this.citadel = gen.citadel();
    this.lab = gen.labyrinth();
    const zs = this.lab.z0 + this.lab.n * LAB.cell;
    let zm = zs + 36;
    for (let z = zs; z < zs + 60; z += 0.5) if (this.lab.floor + (z - zs) * (LAB.depth / 36) >= gen.column(this.lab.cx, z).height - 1.2) { zm = z; break; }
    this.labEntrance = { x: this.lab.cx, z: zm + 3 };
  }

  load(d: ChapterSave | undefined) { if (d) { this.stash = d.stash; this.arenaWins = d.arenaWins; } }
  serialize(): ChapterSave { return { stash: this.stash, arenaWins: this.arenaWins }; }

  place(p: Place): { x: number; z: number } | null {
    switch (p) {
      case 'campfire': return CAMPFIRE;
      case 'herald': return HERALD_SPOT;
      case 'tower': return TOWER;
      case 'graveyard': return GRAVEYARD;
      case 'lab_entrance': return this.labEntrance;
      case 'citadel': return { x: this.citadel.x, z: this.citadel.z };
      case 'arena': return { x: this.citadel.x + ARENA_DX, z: this.citadel.z + ARENA_DZ + ARENA_R + 2 };
      case 'quest_board': return { x: this.citadel.x + 5, z: this.citadel.z + 5 };
    }
  }

  /** inside the citadel walls, at ground level */
  get citadelPlace() { return `The Pale Citadel@${this.citadel.x},${this.citadel.z}`; }
  inCitadel(p = this.player.pos) { return Math.abs(p.x - this.citadel.x) < CITADEL_HALF - 1 && Math.abs(p.z - this.citadel.z) < CITADEL_HALF - 1 && p.y > this.citadel.y - 2.5; }
  private queenDead() { return this.hooks.queenDead(); }
  inLabyrinth(p = this.player.pos) { const h = (this.lab.n * LAB.cell) / 2; return Math.abs(p.x - this.lab.cx) < h + 1 && Math.abs(p.z - this.lab.cz) < h + 1 && p.y < this.lab.floor + 5; }

  update(dt: number) {
    const p = this.player.pos;
    // ---- generated places
    const gd = Math.hypot(p.x - GRAVEYARD.x, p.z - GRAVEYARD.z);
    if (!this.graveLoaded && gd < 170) { this.building.setGenerated('graveyard', this.graveyardPieces()); this.graveLoaded = true; }
    else if (this.graveLoaded && gd > 240) { this.building.setGenerated('graveyard', null); this.graveLoaded = false; }
    const cd = Math.hypot(p.x - this.citadel.x, p.z - this.citadel.z);
    if (!this.labLoaded && cd < 190) { this.building.setGenerated('labyrinth', labyrinthPieces(this.lab, (x, z) => this.gen.column(x, z).height)); this.labLoaded = true; }
    else if (this.labLoaded && cd > 260) { this.building.setGenerated('labyrinth', null); this.labLoaded = false; }
    if (cd < 120) this.map.places.add(this.citadelPlace);

    // ---- chapter 2: the robbers come back as long as the stage is open
    if (this.quests.isActive('ch2') && this.quests.stageOf('ch2') >= 1 && this.quests.stageOf('ch2') <= 1 && gd < 55) {
      this.robbers = this.robbers.filter((c) => c.state !== 'dead' && this.creatures.list.includes(c));
      const need = 4 - (this.quests.get('ch2')!.prog[0] ?? 0);
      for (let i = this.robbers.length; i < Math.min(need, 4); i++) {
        const a = i * 1.7 + 0.5, x = GRAVEYARD.x + Math.cos(a) * 8, z = GRAVEYARD.z + Math.sin(a) * 8;
        if (!this.world.isLoaded(x, z)) continue;
        const c = this.creatures.spawn(ENEMIES.grave_robber, V(x, this.world.groundY(x, z), z), 1.2, i);
        c.state = 'chase'; c.alerted = true;
        this.robbers.push(c);
      }
    }

    // ---- chapter 3: scorpions in the labyrinth, reaching the citadel
    const inLab = this.inLabyrinth();
    if (inLab) {
      this.scorpT -= dt;
      this.scorpions = this.scorpions.filter((c) => c.state !== 'dead' && this.creatures.list.includes(c));
      if (this.scorpT <= 0 && this.scorpions.length < 5) {
        this.scorpT = 4;
        const L = this.lab;
        for (let tries = 0; tries < 10; tries++) {
          const i = Math.floor(Math.random() * L.n), j = Math.floor(Math.random() * L.n);
          const c = labCell(L, i, j);
          const d = Math.hypot(c.x - p.x, c.z - p.z);
          if (d < 12 || d > 40 || !this.world.isLoaded(c.x, c.z)) continue;
          const s = this.creatures.spawn(ENEMIES.scorpion, V(c.x, L.floor + 0.1, c.z), 2, tries);
          this.scorpions.push(s);
          break;
        }
      }
    }
    // the Scorpion Queen waits in the labyrinth's far corner
    if (inLab && !this.queenDead() && !this.creatures.list.some((c) => c.def.id === 'scorpion_queen' && c.state !== 'dead')) {
      const qc = labCell(this.lab, 0, 0);
      if (Math.hypot(qc.x - p.x, qc.z - p.z) < 22 && this.world.isLoaded(qc.x, qc.z)) {
        const q = this.creatures.spawn(ENEMIES.scorpion_queen, V(qc.x, this.lab.floor + 0.1, qc.z), 2, 0);
        q.state = 'chase'; q.alerted = true;
        this.hooks.toast('Something vast stirs in the dark. The Scorpion Queen!', '#e08070');
      }
    }
    if (this.inCitadel()) {
      this.map.places.add(this.citadelPlace);
      if (this.quests.isActive('ch3')) this.quests.flag('citadel_reached');
    }

    // ---- chapter 4: the arena
    this.updateArena(dt);
  }

  // ---------------------------------------------------------------- pieces
  private graveyardPieces(): Piece[] {
    const out: Piece[] = [];
    const y = this.gen.column(GRAVEYARD.x, GRAVEYARD.z).height + 0.05;
    let seed = 1234;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 6; i++) for (let k = 0; k < 4; k++) {
      if (rnd() < 0.15) continue;
      const x = GRAVEYARD.x - 9 + i * 3.4 + (rnd() - 0.5) * 0.6, z = GRAVEYARD.z - 7 + k * 4 + (rnd() - 0.5) * 0.6;
      out.push({ id: rnd() < 0.2 ? 'grave_pit' : 'gravestone', x, y, z, rot: (rnd() - 0.5) * 0.3 });
    }
    for (let i = -6; i < 6; i++) {
      if (i === 0 || i === -1) continue; // gaps for the path
      out.push({ id: 'fence', x: GRAVEYARD.x + i * 2 + 1, y, z: GRAVEYARD.z + 12, rot: 0 }, { id: 'fence', x: GRAVEYARD.x + i * 2 + 1, y, z: GRAVEYARD.z - 12, rot: 0 });
      out.push({ id: 'fence', x: GRAVEYARD.x - 12, y, z: GRAVEYARD.z + i * 2 + 1, rot: Math.PI / 2 }, { id: 'fence', x: GRAVEYARD.x + 12, y, z: GRAVEYARD.z + i * 2 + 1, rot: Math.PI / 2 });
    }
    out.push({ id: 'hoard_chest', x: GRAVEYARD.x + 7.5, y, z: GRAVEYARD.z + 8.5, rot: 0.4 });
    out.push({ id: 'grave_pit', x: GRAVEYARD.x + 6, y, z: GRAVEYARD.z + 8.8, rot: 0.2 }, { id: 'bones', x: GRAVEYARD.x + 5.6, y: y + 0.05, z: GRAVEYARD.z + 7.4, rot: 1 });
    out.push({ id: 'lantern', x: GRAVEYARD.x - 1.5, y, z: GRAVEYARD.z + 12.5, rot: 0 });
    return out.map((q) => ({ ...q, gen: true } as Piece));
  }

  // ---------------------------------------------------------------- special pieces
  /** A story piece was used; returns true if handled. */
  special(p: Piece): boolean {
    switch (p.id) {
      case 'hoard_chest': {
        if (this.quests.isActive('ch2') && this.quests.stageOf('ch2') === 2) {
          this.hooks.addGold(25);
          this.hooks.give('torn_map', 1);
          this.hooks.give('silver_bar', 1);
          this.hooks.toast('Coins, a silver bar… and a torn map of a city with white walls.', '#f0d070');
          this.quests.flag('hoard_opened');
        } else if (this.quests.isDone('ch2')) this.hooks.toast('Empty now, except for the smell.', '#a8987c');
        else this.hooks.toast('A heavy chest, chained shut. The robbers would not like you touching it.', '#a8987c');
        return true;
      }
      case 'citadel_gate': this.hooks.toast('The gate is sealed with lead and old oaths. They say the only way in lies below.', '#c8b890'); return true;
      case 'quest_board': this.openBoard(); return true;
      case 'waystone': this.useWaystone(p); return true;
      case 'stash': this.hooks.openStash(this.stash); return true;
    }
    return false;
  }

  waystoneId(p: { x: number; z: number }): string {
    let name = 'Waystone';
    if (Math.hypot(p.x - this.citadel.x, p.z - this.citadel.z) < 60) name = 'The Pale Citadel';
    else if (Math.hypot(p.x - TOWER.x, p.z - TOWER.z) < 30) name = 'The Tower';
    else { const v = this.gen.village(p.x, p.z); if (v) name = v.name; }
    return `${name}@${Math.round(p.x)},${Math.round(p.z)}`;
  }

  private useWaystone(p: Piece) {
    const id = this.waystoneId(p);
    if (!this.map.waystones.has(id)) {
      this.map.waystones.add(id);
      this.hooks.toast(`Waystone attuned: ${id.split('@')[0]}. Touch any waystone to travel here.`, '#80c0ff');
      audio.parry();
      return;
    }
    this.hooks.openTravelMap();
  }

  // ---------------------------------------------------------------- quest board
  private openBoard() {
    const root = document.createElement('div'); root.className = 'menu';
    const box = document.createElement('div'); box.className = 'menu-box panel'; box.style.maxWidth = '640px';
    const h = document.createElement('h2'); h.textContent = 'Quest Board';
    box.appendChild(h);
    const list = Object.values(QUESTS).filter((q) => q.board);
    for (const q of list) {
      const card = document.createElement('div'); card.className = 'board-q';
      const st = this.quests.get(q.id);
      const reward = [q.reward.gold ? `${q.reward.gold} gold` : '', q.reward.xp ? `${q.reward.xp} XP` : ''].filter(Boolean).join(', ');
      card.innerHTML = `<b>${q.title}</b><p>${q.desc}</p><p><i>Reward: ${reward}</i></p>`;
      const b = document.createElement('button'); b.className = 'btn';
      b.textContent = st ? (st.done ? 'Done' : 'Accepted') : 'Take the notice';
      b.disabled = !!st;
      b.onclick = () => { this.quests.start(q.id); b.textContent = 'Accepted'; b.disabled = true; };
      card.appendChild(b); box.appendChild(card);
    }
    const close = document.createElement('button'); close.className = 'btn'; close.textContent = 'Close';
    close.onclick = () => { root.remove(); this.hooks.pause(false); };
    box.appendChild(close);
    root.appendChild(box);
    root.addEventListener('pointerdown', (e) => { if (e.target === root) { root.remove(); this.hooks.pause(false); } });
    this.ui.appendChild(root);
    this.hooks.pause(true);
  }

  // ---------------------------------------------------------------- dialogue options
  dialogueOptions(n: NPC, close: () => void): [string, () => void][] {
    const out: [string, () => void][] = [];
    if (n.job === 'arena_master') {
      if (this.quests.isActive('ch4') && this.quests.stageOf('ch4') === 0) out.push(['I want to fight in the arena', () => {
        this.quests.flag('arena_signed');
        this.hooks.toast('Kallias: “Three trials. The pack, the champion, the beast. Step into the ring and tell me when.”', '#e8d8a8');
        close();
      }]);
      else if (this.quests.isActive('ch4') && this.quests.stageOf('ch4') === 1 && !this.arena) out.push(['Begin the trials', () => { close(); this.startArena(false); }]);
      else if (this.quests.isDone('ch4') && !this.arena) out.push(['Fight for coin (20 gold purse)', () => { close(); this.startArena(true); }]);
    }
    if (n.job === 'banker') out.push(['Open my vault', () => { close(); this.hooks.openStash(this.stash); }]);
    return out;
  }

  // ---------------------------------------------------------------- the arena
  private get arenaCenter() { return V(this.citadel.x + ARENA_DX, this.citadel.y, this.citadel.z + ARENA_DZ); }

  private startArena(forCoin: boolean) {
    const c = this.arenaCenter;
    this.player.spawn(c.x, this.world.groundY(c.x, c.z + 5) + 0.1, c.z + 5);
    this.player.yaw = 0;
    this.arena = { wave: 0, foes: [], rest: 3, forCoin };
    this.hooks.toast('The crowd roars. The first trial: the pack.', '#f0d070');
  }

  private updateArena(dt: number) {
    const a = this.arena;
    if (!a) return;
    const c = this.arenaCenter;
    const p = this.player.pos;
    if (Math.hypot(p.x - c.x, p.z - c.z) > ARENA_R + 1.5 || this.player.life <= 0) {
      for (const f of a.foes) if (f.state !== 'dead') { f.hp = 0; f.state = 'dead'; f.deadT = 5; }
      this.arena = null;
      this.hooks.toast(this.player.life <= 0 ? 'Carried out of the ring. The crowd jeers.' : 'You leave the ring. The trial is forfeit.', '#e08070');
      return;
    }
    if (a.rest > 0) {
      a.rest -= dt;
      if (a.rest <= 0) {
        for (const [id, n] of ARENA_WAVES[a.wave]) for (let i = 0; i < n; i++) {
          const ang = (i - (n - 1) / 2) * 0.7;
          const x = c.x + Math.sin(ang) * 5, z = c.z - Math.cos(ang) * 5;
          const f = this.creatures.spawn(ENEMIES[id], V(x, this.world.groundY(x, z), z), 1 + a.wave * 0.5 + this.arenaWins * 0.3, i);
          f.state = 'chase'; f.alerted = true; f.elite = id === 'champion';
          a.foes.push(f);
        }
      }
      return;
    }
    if (a.foes.every((f) => f.state === 'dead')) {
      a.foes = [];
      a.wave++;
      audio.parry();
      if (a.wave >= ARENA_WAVES.length) {
        this.arena = null;
        this.arenaWins++;
        if (a.forCoin) { this.hooks.addGold(20); this.hooks.toast('Victory! The purse is yours: 20 gold.', '#f0d070'); }
        else { this.hooks.toast('Victory! Kallias raises your arm to the crowd.', '#f0d070'); this.quests.flag('arena_won'); }
        return;
      }
      a.rest = 5;
      this.hooks.toast(a.wave === 1 ? 'The second trial: the champion.' : 'The last trial: the beast. The gate rattles.', '#f0d070');
    }
  }

  /** the player died: an arena fight ends */
  onPlayerDeath() { if (this.arena) { for (const f of this.arena.foes) { f.hp = 0; f.state = 'dead'; } this.arena = null; } }
}
