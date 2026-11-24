// Chapters 5–12 in the world: the killer sheep, the Golden Falcon, the Monument of
// Warning, the Living Fresco and the Stranger's secret, the Cathedral, the allies
// and the assault on the Hollow King's Tower — and the endings.
import * as THREE from 'three';
import { ENEMIES } from '../data/enemies';
import { MONUMENT, CATHEDRAL, HOLLOW_TOWER, SORCERER, CAMPFIRE } from '../data/story';
import { WALL_H } from '../data/pieces';
import { siteForCell, VillageSite } from '../world/villages';
import { Biome } from '../world/biomes';
import { playScene } from '../ui/scene';
import type { Place } from '../data/quests';
import type { Piece, Building } from '../world/building';
import type { World } from '../world/world';
import type { TerrainGen } from '../world/terrain';
import type { Player } from '../entities/player';
import type { Creatures, Creature } from '../entities/creatures';
import type { QuestLog } from './quests';
import type { Herald } from './herald';
import type { Watcher } from './watcher';
import type { FrescoKind } from './fresco';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export type Ending = 'obey' | 'resist' | 'truth';
export interface SagaSave { pledges: string[]; ending: Ending | null; frescoTruth: boolean; monumentTruth: boolean; strangerTruth: boolean; }
export interface SagaHooks {
  toast(t: string, c?: string): void;
  log(kind: FrescoKind, text: string): void;
  give(id: string, n: number): boolean;
  showStranger(on: boolean): void;
  endingScreen(e: Ending): void;
}

export class Saga {
  pledges: string[] = [];
  ending: Ending | null = null;
  frescoTruth = false; monumentTruth = false; strangerTruth = false;
  private loaded = new Set<string>();
  private sheep: Creature[] = [];
  private falcon: Creature | null = null;
  private warden: Creature | null = null;
  private king: Creature | null = null;
  private alliesOut = false;
  private v1: VillageSite | null;
  private meadow: { x: number; z: number };

  constructor(private ui: HTMLElement, private gen: TerrainGen, private world: World, private building: Building, private player: Player,
    private creatures: Creatures, private quests: QuestLog, private herald: Herald, private watch: Watcher, private hooks: SagaHooks) {
    this.v1 = siteForCell(0, 0, gen.seed, () => ({ height: 0, ok: false }));
    // a meadow (or cliff-top) a little beyond the first village: the falcon's hunting ground
    const c = this.v1 ?? { x: 200, z: 0 };
    let m = { x: c.x + 220, z: c.z };
    outer: for (const r of [180, 240, 300, 380]) for (let a = 0; a < 16; a++) {
      const x = c.x + Math.cos(a / 16 * Math.PI * 2) * r, z = c.z + Math.sin(a / 16 * Math.PI * 2) * r;
      const col = gen.column(x, z);
      if ((col.biome === Biome.SunnyMeadows || col.biome === Biome.CoastalCliffs) && col.village < 0.05) { m = { x, z }; break outer; }
    }
    this.meadow = m;
  }

  load(d: SagaSave | undefined) { if (d) Object.assign(this, d); }
  serialize(): SagaSave { return { pledges: this.pledges, ending: this.ending, frescoTruth: this.frescoTruth, monumentTruth: this.monumentTruth, strangerTruth: this.strangerTruth }; }

  place(p: Place): { x: number; z: number } | null {
    switch (p) {
      case 'village1': return this.v1 ? { x: this.v1.x, z: this.v1.z } : null;
      case 'falcon_meadow': return this.meadow;
      case 'monument': return MONUMENT;
      case 'cathedral': return CATHEDRAL;
      case 'hollow_tower': return HOLLOW_TOWER;
      case 'errand': return this.herald.errand?.place ?? null;
      default: return null;
    }
  }

  private near(p: { x: number; z: number }, r: number) { return Math.hypot(this.player.pos.x - p.x, this.player.pos.z - p.z) < r; }
  private gy(x: number, z: number) { return this.gen.column(x, z).height; }

  private structure(id: string, at: { x: number; z: number }, make: () => Piece[]) {
    const near = this.near(at, 230);
    if (near && !this.loaded.has(id)) { this.building.setGenerated(id, make().map((q) => ({ ...q, gen: true } as Piece))); this.loaded.add(id); }
    else if (!near && this.loaded.has(id) && !this.near(at, 280)) { this.building.setGenerated(id, null); this.loaded.delete(id); }
  }

  update(_dt: number) {
    const q = this.quests;
    // ---- structures
    this.structure('monument', MONUMENT, () => [{ id: 'monument', x: MONUMENT.x, y: this.gy(MONUMENT.x, MONUMENT.z) - 0.2, z: MONUMENT.z, rot: 0 }, { id: 'waystone', x: MONUMENT.x + 7, y: this.gy(MONUMENT.x + 7, MONUMENT.z + 7), z: MONUMENT.z + 7, rot: 0 }]);
    this.structure('cathedral', CATHEDRAL, () => this.cathedralPieces());
    this.structure('hollow_tower', HOLLOW_TOWER, () => this.towerPieces());

    // ---- chapter 5: the killer sheep come at the village
    if (q.isActive('ch5') && q.stageOf('ch5') === 1 && this.v1 && this.near(this.v1, 130)) {
      this.sheep = this.sheep.filter((c) => c.state !== 'dead' && this.creatures.list.includes(c));
      const need = 6 - (q.get('ch5')!.prog[0] ?? 0);
      for (let i = this.sheep.length; i < Math.min(4, need); i++) {
        const a = Math.random() * Math.PI * 2, x = this.v1.x + Math.cos(a) * 45, z = this.v1.z + Math.sin(a) * 45;
        if (!this.world.isLoaded(x, z)) continue;
        const c = this.creatures.spawn(ENEMIES.killer_sheep, V(x, this.world.groundY(x, z), z), 1.5, i);
        c.state = 'wander'; this.sheep.push(c);
      }
    }
    // ---- chapter 6: the Golden Falcon over its meadow
    if (q.isActive('ch6') && q.stageOf('ch6') === 1 && this.near(this.meadow, 70) && (!this.falcon || this.falcon.state === 'dead' || !this.creatures.list.includes(this.falcon))) {
      if (!this.falcon || !this.creatures.list.includes(this.falcon)) {
        const x = this.meadow.x, z = this.meadow.z - 20;
        if (this.world.isLoaded(x, z)) { this.falcon = this.creatures.spawn(ENEMIES.golden_falcon, V(x, this.world.groundY(x, z), z), 2, 0); this.falcon.state = 'chase'; this.falcon.alerted = true; this.hooks.toast('A golden shape drops out of the sun!', '#e8b030'); }
      }
    }
    // ---- chapter 8: the Stranger waits at his fire again
    this.hooks.showStranger(q.isActive('ch8') && q.stageOf('ch8') === 1);
    // ---- chapter 10: the Warden falls
    if (this.warden && this.warden.state === 'dead') { this.warden = null; q.flag('judged'); this.hooks.log('defy', 'Defeated the Warden of the Cathedral'); }
    // ---- chapter 12: the assault
    if (q.isActive('ch12') && this.near(HOLLOW_TOWER, 70)) {
      if (!this.alliesOut && this.pledges.length) {
        this.alliesOut = true;
        const n = Math.min(4, this.pledges.length + 1);
        for (let i = 0; i < n; i++) {
          const x = this.player.pos.x + (i - n / 2) * 2, z = this.player.pos.z + 3;
          if (!this.world.isLoaded(x, z)) continue;
          const c = this.creatures.spawn(ENEMIES.citadel_guard, V(x, this.world.groundY(x, z), z), 2, i);
          c.ally = true; c.elite = false;
        }
        this.hooks.toast(`Your allies are here: ${this.pledges.join(', ')}.`, '#c8d8ff');
      }
      if (q.stageOf('ch12') === 1 && this.near(HOLLOW_TOWER, 34) && (!this.king || !this.creatures.list.includes(this.king)) && this.world.isLoaded(HOLLOW_TOWER.x, HOLLOW_TOWER.z)) {
        const x = HOLLOW_TOWER.x, z = HOLLOW_TOWER.z + 7;
        this.king = this.creatures.spawn(ENEMIES.hollow_king, V(x, this.world.groundY(x, z), z), 3, 0);
        this.king.state = 'chase'; this.king.alerted = true;
        for (let i = 0; i < 2; i++) { const g = this.creatures.spawn(ENEMIES.dark_knight, V(x + (i ? 4 : -4), this.world.groundY(x, z), z + 3), 3, i + 1); g.state = 'chase'; g.alerted = true; }
        this.hooks.toast('“So. The last of the faceless ones.” The Hollow King rises from his throne.', '#e08070');
      }
    }
  }

  /** a story piece was used */
  special(p: Piece): boolean {
    if (p.id === 'monument') {
      playScene(this.ui, 'The Plinth', '#c8b890', [
        'The letters are worn almost smooth. You trace them with your fingers.',
        `“HERE STOOD ${SORCERER.toUpperCase()}, WHO WOULD NOT DIE. HE SPLIT HIS WILL IN TWO: ONE TO WARN, ONE TO RULE. THE SERPENTS ARE HIS OWN.”`,
        '“IF A FACELESS ONE READS THIS: DO NOT WEAR THE CROWN.”'
      ], () => {
        if (!this.monumentTruth) { this.monumentTruth = true; this.watch.d.truth++; this.hooks.log('secret', 'Read the Monument of Warning'); }
        this.quests.flag('monument_read');
      });
      return true;
    }
    if (p.id === 'judgment_altar') {
      if (this.quests.isActive('ch10') && this.quests.stageOf('ch10') === 1 && !this.warden) {
        this.herald.cathedral(() => {
          const x = CATHEDRAL.x, z = CATHEDRAL.z - 4;
          this.warden = this.creatures.spawn(ENEMIES.cathedral_warden, V(x, this.world.groundY(x, z), z), 3, 0);
          this.warden.state = 'chase'; this.warden.alerted = true;
        });
      } else this.hooks.toast('The altar is cold. Amber light flickers in the eye carved into its front.', '#a8987c');
      return true;
    }
    return false;
  }

  /** the fresco was viewed: returns whether the secret panel shows */
  frescoViewed(): boolean {
    const secret = this.quests.isActive('ch8') || this.quests.isDone('ch8');
    if (this.quests.isActive('ch8')) {
      this.quests.flag('fresco_seen');
      if (!this.frescoTruth) { this.frescoTruth = true; this.watch.d.truth++; this.hooks.log('secret', 'Saw the two faces in the fresco'); }
    }
    return secret;
  }

  /** the Stranger, asked about the fresco (chapter 8) */
  strangerTruth_(): void {
    playScene(this.ui, 'The Ashen Stranger', '#b8c8d8', [
      'You saw it, then. The painting. Sit. My fire is warm, even if I am not.',
      `There was a man called ${SORCERER}. Clever, afraid, and very old. He would not die, so he cut himself in two.`,
      'One half remembers what he did, and warns. That is me. The other half wants what he wanted. You know him. He rides a black horse.',
      'He needs a vessel. The Hollow King was the last one. You may be the next, little lamb — if you put on the crown.',
      'Or you could say his name to his face. Names are older than crowns.'
    ], () => {
      if (!this.strangerTruth) { this.strangerTruth = true; this.watch.d.truth++; this.hooks.log('secret', 'The Ashen Stranger’s secret'); }
      this.quests.flag('stranger_truth');
    });
  }

  /** a guard is asked to stand with you (chapter 11) */
  allyOption(npcName: string, villageId: string, villageName: string, rep: number): [string, () => void] | null {
    if (!this.quests.isActive('ch11') || this.pledges.some((p) => p.endsWith(`(${villageName})`))) return null;
    return ['“Will you stand with me against the Hollow King?”', () => {
      if (rep < 20) { this.hooks.toast(`${npcName} shakes their head. “I don’t know you well enough for that.”`, '#e08070'); return; }
      this.pledges.push(`${npcName} (${villageName})`);
      this.hooks.toast(`${npcName} grips your arm. “When you march, I march.” (${this.pledges.length}/3)`, '#c8d8ff');
      this.hooks.log('village', `${npcName} of ${villageName} pledged to fight`);
      if (this.pledges.length >= 3) this.quests.flag('allies_gathered');
      void villageId;
    }];
  }

  /** the Hollow King fell */
  kingDefeated() {
    if (!this.quests.isActive('ch12') && !this.quests.isDone('ch12')) return;
    setTimeout(() => this.herald.ending((e) => this.finish(e)), 2500);
  }

  private finish(e: Ending) {
    this.ending = e;
    this.herald.enabled = e === 'obey';
    if (e === 'obey') this.hooks.give('hollow_kings_crown', 1);
    if (e === 'resist') this.hooks.give('aegis_of_dawn', 1);
    if (e === 'truth') this.hooks.give('veil_of_the_stranger', 1);
    this.hooks.log('ending', e === 'obey' ? 'Took the Hollow Crown' : e === 'resist' ? 'Shattered the Hollow Crown' : `Spoke the name ${SORCERER}`);
    this.hooks.endingScreen(e);
  }

  // ---------------------------------------------------------------- structures
  private cathedralPieces(): Piece[] {
    const out: Piece[] = [];
    const y = this.gy(CATHEDRAL.x, CATHEDRAL.z) + 0.1;
    const x0 = Math.round(CATHEDRAL.x / 2) * 2 - 8, z0 = Math.round(CATHEDRAL.z / 2) * 2 - 16; // 16 x 32 m nave, door at +z
    for (let i = 0; i < 8; i++) for (let k = 0; k < 16; k++) out.push({ id: 'stone_floor', x: x0 + i * 2 + 1, y, z: z0 + k * 2 + 1, rot: 0 });
    for (let lvl = 0; lvl < 4; lvl++) {
      const yy = y + lvl * WALL_H;
      for (let i = 0; i < 8; i++) {
        const door = lvl < 2 && (i === 3 || i === 4);
        if (!door) out.push({ id: 'stone_wall', x: x0 + i * 2 + 1, y: yy, z: z0 + 32, rot: Math.PI });
        out.push({ id: 'stone_wall', x: x0 + i * 2 + 1, y: yy, z: z0, rot: 0 });
      }
      for (let k = 0; k < 16; k++) {
        out.push({ id: lvl === 2 && k % 3 === 1 ? 'window_wall' : 'stone_wall', x: x0, y: yy, z: z0 + k * 2 + 1, rot: Math.PI / 2 });
        out.push({ id: lvl === 2 && k % 3 === 1 ? 'window_wall' : 'stone_wall', x: x0 + 16, y: yy, z: z0 + k * 2 + 1, rot: -Math.PI / 2 });
      }
    }
    // the roof: two sloping courses
    const ry = y + 4 * WALL_H;
    for (let k = 0; k < 16; k++) for (let i = 0; i < 8; i++) {
      const side = i < 4, lvl = side ? i : 7 - i;
      out.push({ id: 'roof', x: x0 + i * 2 + 1, y: ry + lvl * 1.6, z: z0 + k * 2 + 1, rot: side ? -Math.PI / 2 : Math.PI / 2 });
    }
    out.push({ id: 'cathedral_spire', x: x0 - 1, y, z: z0 + 33, rot: 0 }, { id: 'cathedral_spire', x: x0 + 17, y, z: z0 + 33, rot: 0 });
    out.push({ id: 'rose_window', x: x0 + 8, y: y + 7.5, z: z0 + 32.3, rot: Math.PI }, { id: 'rose_window', x: x0 + 8, y: y + 6.5, z: z0 + 0.4, rot: 0 });
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) out.push({ id: 'pew', x: x0 + 8 + s * 3.2, y, z: z0 + 12 + k * 2.6, rot: 0 });
    out.push({ id: 'judgment_altar', x: x0 + 8, y, z: z0 + 4, rot: 0 });
    for (const s of [-1, 1]) out.push({ id: 'banner', x: x0 + 8 + s * 3, y, z: z0 + 0.6, rot: 0 }, { id: 'lantern', x: x0 + 8 + s * 5, y, z: z0 + 6, rot: 0 }, { id: 'lantern', x: x0 + 8 + s * 5, y, z: z0 + 22, rot: 0 });
    out.push({ id: 'waystone', x: x0 + 8 + 6, y, z: z0 + 38, rot: 0 });
    return out;
  }

  private towerPieces(): Piece[] {
    const out: Piece[] = [];
    const y = this.gy(HOLLOW_TOWER.x, HOLLOW_TOWER.z) + 0.1;
    const H = 20;
    for (let k = -H / 2; k < H / 2; k++) {
      const t = k * 2 + 1;
      for (let lvl = 0; lvl < 3; lvl++) {
        const yy = y - 0.5 + lvl * WALL_H;
        if (!(Math.abs(t) < 4 && lvl < 2)) out.push({ id: 'black_wall', x: HOLLOW_TOWER.x + t, y: yy, z: HOLLOW_TOWER.z + H, rot: 0 });
        out.push({ id: 'black_wall', x: HOLLOW_TOWER.x + t, y: yy, z: HOLLOW_TOWER.z - H, rot: 0 });
        out.push({ id: 'black_wall', x: HOLLOW_TOWER.x - H, y: yy, z: HOLLOW_TOWER.z + t, rot: Math.PI / 2 });
        out.push({ id: 'black_wall', x: HOLLOW_TOWER.x + H, y: yy, z: HOLLOW_TOWER.z + t, rot: Math.PI / 2 });
      }
    }
    out.push({ id: 'black_spire', x: HOLLOW_TOWER.x, y, z: HOLLOW_TOWER.z - 4, rot: 0 });
    for (const [dx, dz] of [[-6, 14], [6, 14], [-10, 2], [10, 2]]) out.push({ id: 'wall_torch', x: HOLLOW_TOWER.x + dx, y, z: HOLLOW_TOWER.z + dz, rot: 0 }, { id: 'bones', x: HOLLOW_TOWER.x + dx * 0.7, y: y + 0.02, z: HOLLOW_TOWER.z + dz - 2, rot: dx });
    for (const s of [-1, 1]) out.push({ id: 'banner', x: HOLLOW_TOWER.x + s * 5, y, z: HOLLOW_TOWER.z + H - 0.8, rot: Math.PI });
    out.push({ id: 'waystone', x: HOLLOW_TOWER.x + 8, y: this.gy(HOLLOW_TOWER.x + 8, HOLLOW_TOWER.z + H + 10), z: HOLLOW_TOWER.z + H + 10, rot: 0 });
    return out;
  }

  get campfire() { return CAMPFIRE; }
}
