// Procedurally generated side quests: from the Citadel's quest board and from
// villagers. Fetch, hunt, bounties on named elites, find a lost person, clear a
// camp, defend a village at night, bring rare herbs, deliver a parcel.
import * as THREE from 'three';
import { QUESTS, QuestDef } from '../data/quests';
import { ENEMIES } from '../data/enemies';
import { ITEMS } from '../data/items';
import { BIOMES } from '../world/biomes';
import type { TerrainGen } from '../world/terrain';
import type { World } from '../world/world';
import type { Player } from '../entities/player';
import type { Creatures, Creature } from '../entities/creatures';
import type { QuestLog } from './quests';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];
const FIRST = ['Grimbold', 'Hesk', 'Varra', 'Ulric', 'Mabyn', 'Tarn', 'Orla', 'Brannoc', 'Sable', 'Kettle', 'Duna', 'Ferris'];
const EPITHET = ['the Gutter-King', 'Three-Fingers', 'the Red', 'Bonegnawer', 'the Widowmaker', 'of the Ditch', 'Half-Ear', 'the Smiling', 'Ashtongue', 'the Patient'];
const LOST = ['a goatherd’s boy', 'an old charcoal-burner', 'a travelling pedlar', 'a novice priest', 'a hunter’s daughter', 'a drunk minstrel'];
const HUNT: [string, string][] = [['rat', 'rats'], ['toadling', 'toadlings'], ['spider', 'spiders'], ['dire_wolf', 'dire wolves'], ['kobold', 'kobolds'], ['skeleton', 'skeletons'], ['goblin', 'goblins'], ['harpy', 'harpies'], ['giant_wasp', 'giant wasps'], ['bandit', 'bandits']];
const FETCH: [string, number][] = [['leather', 4], ['iron_bar', 3], ['planks', 10], ['cooked_meat', 4], ['rope', 4], ['glass', 3], ['chitin', 4], ['bone', 6], ['fang', 4], ['brick', 8]];
const HERBS: [string, number][] = [['moonpetal', 3], ['glowcap', 4], ['petals', 6], ['berries', 8], ['resin', 4], ['fern', 6]];

export interface JobsSave { defs: QuestDef[]; boardDay: number; board: string[]; seq: number; }

export class OddJobs {
  defs: QuestDef[] = [];
  board: string[] = [];
  boardDay = -99;
  private seq = 0;
  private spawned = new Map<string, Creature[]>();

  constructor(private gen: TerrainGen, private world: World, private player: Player, private creatures: Creatures, private quests: QuestLog) {}

  load(d: JobsSave | undefined) {
    if (!d) return;
    this.defs = d.defs; this.board = d.board; this.boardDay = d.boardDay; this.seq = d.seq;
    for (const q of this.defs) QUESTS[q.id] = q;
  }
  serialize(): JobsSave {
    // forget finished generated quests that are not on the board any more (keep the journal short)
    const keep = this.defs.filter((q) => this.board.includes(q.id) || (this.quests.get(q.id) && !this.quests.isDone(q.id)) || this.quests.isDone(q.id));
    return { defs: keep.slice(-60), board: this.board, boardDay: this.boardDay, seq: this.seq };
  }

  /** A spot in the wild near (x, z), on dry land and outside villages. */
  private spot(x: number, z: number, r: () => number, min: number, max: number) {
    for (let t = 0; t < 30; t++) {
      const a = r() * Math.PI * 2, d = min + r() * (max - min);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const c = this.gen.column(px, pz);
      if (c.village < 0.05 && c.liquidLevel < c.height - 0.5 && c.height > 30) return { x: Math.round(px), z: Math.round(pz), biome: BIOMES[c.biome].name };
    }
    return { x: Math.round(x + min), z: Math.round(z), biome: 'the wilds' };
  }

  private register(q: QuestDef) { q.generated = true; QUESTS[q.id] = q; this.defs.push(q); return q; }

  /** Generate one quest near a point, for a giver. */
  make(x: number, z: number, giver: string, villageName: string, danger: number): QuestDef {
    let s = (Math.floor(x) * 73856093) ^ (Math.floor(z) * 19349663) ^ (++this.seq * 83492791);
    const r = () => { s = (s * 16807 + 12345) % 2147483647; return Math.abs(s) / 2147483647; };
    for (let k = 0; k < 7 + (this.seq % 5); k++) r();
    const id = `job${this.seq}`;
    const gold = Math.round((25 + r() * 30) * (0.8 + danger * 0.4)), xp = Math.round((40 + r() * 40) * danger);
    const kind = pick(r, ['fetch', 'hunt', 'bounty', 'lost', 'camp', 'defend', 'herbs', 'hunt', 'bounty', 'fetch']);
    switch (kind) {
      case 'fetch': {
        const [item, n] = pick(r, FETCH);
        return this.register({ id, giver, title: `${giver} needs ${ITEMS[item].name.toLowerCase()}`, desc: `${giver} of ${villageName} needs ${n} ${ITEMS[item].name.toLowerCase()} and will pay well.`, stages: [{ text: 'Gather or buy them, then they are yours to hand in.', objectives: [{ kind: 'collect', item, n, text: `Bring ${ITEMS[item].name.toLowerCase()}` }] }], reward: { gold, xp } });
      }
      case 'herbs': {
        const [item, n] = pick(r, HERBS);
        return this.register({ id, giver, title: `Rare herbs for ${giver}`, desc: `${giver} brews something that needs ${ITEMS[item].name.toLowerCase()} — fresh. “Do not ask what it is for.”`, stages: [{ text: 'Harvest them in the wild (a sickle helps).', objectives: [{ kind: 'collect', item, n, text: `Gather ${ITEMS[item].name.toLowerCase()}` }] }], reward: { gold: gold + 10, xp, items: [['bandage', 2]] } });
      }
      case 'hunt': {
        const [enemy, plural] = pick(r, HUNT);
        const p = this.spot(x, z, r, 80, 220);
        const n = 4 + Math.floor(r() * 4);
        return this.register({ id, giver, title: `Hunt: ${plural}`, desc: `${plural[0].toUpperCase() + plural.slice(1)} have been seen in ${p.biome} near ${villageName}. ${giver} wants them gone.`, spawn: { enemy, n, pos: p }, stages: [
          { text: `They gather out in ${p.biome}.`, objectives: [{ kind: 'kill', enemy, n, text: `Kill ${plural}`, pos: p, r: 90 }] }], reward: { gold, xp } });
      }
      case 'bounty': {
        const pool = Object.values(ENEMIES).filter((e) => !e.boss && e.biomes.length && !e.aquatic && (e.minDanger ?? 1) <= danger + 0.5 && e.id !== 'mimic');
        const e = pick(r, pool);
        const name = `${pick(r, FIRST)} ${pick(r, EPITHET)}`;
        const p = this.spot(x, z, r, 120, 300);
        return this.register({ id, giver, title: `Bounty: ${name}`, desc: `A ${e.name.toLowerCase()} called ${name} has killed travellers on the roads near ${villageName}. ${gold * 2} gold for proof it is dead.`, spawn: { enemy: e.id, n: 1, pos: p, elite: true, name }, stages: [
          { text: `It was last seen in ${p.biome}.`, objectives: [{ kind: 'kill', enemy: e.id, n: 1, text: `Slay ${name}`, pos: p, r: 70 }] }], reward: { gold: gold * 2, xp: xp * 2 } });
      }
      case 'lost': {
        const who = pick(r, LOST);
        const p = this.spot(x, z, r, 150, 320);
        return this.register({ id, giver, title: `Lost: ${who}`, desc: `${who[0].toUpperCase() + who.slice(1)} from ${villageName} went into ${p.biome} three days ago and has not come back.`, stages: [
          { text: 'Follow the tracks into the wilds.', objectives: [{ kind: 'goto', r: 8, text: `Find ${who}`, pos: p }] }], reward: { gold, xp }, done: `You find ${who} — cold, frightened, alive — and point them home.` });
      }
      case 'camp': {
        const p = this.spot(x, z, r, 140, 300);
        const enemy = pick(r, danger > 2 ? ['bandit', 'orc', 'cultist'] : ['bandit', 'goblin', 'kobold']);
        return this.register({ id, giver, title: `Clear the ${ENEMIES[enemy].name.toLowerCase()} camp`, desc: `${ENEMIES[enemy].name}s have made camp in ${p.biome} and raid the farms of ${villageName}.`, spawn: { enemy, n: 5, pos: p }, stages: [
          { text: 'Find the camp.', objectives: [{ kind: 'goto', r: 30, text: 'Find the camp', pos: p }] },
          { text: 'Drive them out.', objectives: [{ kind: 'kill', enemy, n: 5, text: `Defeat the ${ENEMIES[enemy].name.toLowerCase()}s`, pos: p, r: 70 }] }], reward: { gold: gold + 20, xp: xp + 30 } });
      }
      case 'defend':
      default: {
        const enemy = pick(r, ['skeleton', 'dire_wolf', 'goblin', 'killer_sheep', 'bandit']);
        const p = { x: Math.round(x), z: Math.round(z) };
        return this.register({ id, giver, title: `Defend ${villageName} tonight`, desc: `${giver} says something comes for ${villageName} after dark. The guards are few.`, spawn: { enemy, n: 6, pos: p, night: true }, stages: [
          { text: 'Be in the village when night falls, and fight.', objectives: [{ kind: 'kill', enemy, n: 6, text: `Repel the ${ENEMIES[enemy].name.toLowerCase()}s`, pos: p, r: 80 }] }], reward: { gold: gold + 30, xp: xp + 40 } });
      }
    }
  }

  /** The quest board's notices (refreshed every three days). */
  boardNotices(cx: number, cz: number, day: number, danger: number): QuestDef[] {
    if (day - this.boardDay >= 3 || this.board.some((id) => !QUESTS[id])) {
      this.boardDay = day;
      this.board = [0, 1, 2].map(() => this.make(cx, cz, 'The Pale Citadel', 'the Pale Citadel', danger).id);
    }
    return this.board.map((id) => QUESTS[id]).filter(Boolean);
  }

  /** spawn bounty targets, camps and night raids near the player */
  update(night: boolean) {
    const p = this.player.pos;
    for (const st of this.quests.active()) {
      const q = QUESTS[st.id];
      if (!q.spawn) continue;
      const sp = q.spawn;
      if (sp.night && !night) continue;
      if (Math.hypot(sp.pos.x - p.x, sp.pos.z - p.z) > 75) continue;
      const list = (this.spawned.get(q.id) ?? []).filter((c) => this.creatures.list.includes(c) && c.state !== 'dead');
      const killed = q.stages.flatMap((s, si) => s.objectives.map((o, oi) => (o.kind === 'kill' && si === st.stage ? st.prog[oi] : 0))).reduce((a, b) => a + b, 0);
      const want = Math.min(sp.n - killed, sp.night ? 3 : sp.n);
      for (let i = list.length; i < want; i++) {
        const a = (i / Math.max(1, want)) * Math.PI * 2 + Math.random(), d = sp.night ? 28 : 6;
        const x = sp.pos.x + Math.cos(a) * d, z = sp.pos.z + Math.sin(a) * d;
        if (!this.world.isLoaded(x, z)) continue;
        const c = this.creatures.spawn(ENEMIES[sp.enemy], V(x, this.world.groundY(x, z), z), 1 + Math.hypot(x, z) / 450, i);
        c.elite = !!sp.elite;
        if (sp.elite) { c.hp = c.maxHp = c.maxHp * 2.5; c.dmgMul *= 1.4; c.scale *= 1.2; }
        if (sp.night) { c.state = 'chase'; c.alerted = true; }
        list.push(c);
      }
      this.spawned.set(q.id, list);
    }
  }
}
