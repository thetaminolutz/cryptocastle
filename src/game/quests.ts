// The quest log: active and finished quests, stage progress, the tracked quest,
// flags set by story events, rewards.
import { QUESTS, QuestDef, Objective, Place } from '../data/quests';
import { ITEMS } from '../data/items';
import type { Inventory } from './inventory';

export interface QuestState { id: string; stage: number; prog: number[]; done: boolean; started: number; finished?: number; }
export interface QuestSave { quests: QuestState[]; flags: string[]; tracked: string | null; }

export interface QuestHooks {
  place(p: Place): { x: number; z: number } | null;
  reward(gold: number, xp: number): void;
  toast(t: string, c?: string): void;
  day(): number;
  /** a stage began (spawn things, place markers…) */
  onStage(q: QuestDef, stage: number): void;
  onComplete(q: QuestDef): void;
}

export class QuestLog {
  list: QuestState[] = [];
  flags = new Set<string>();
  tracked: string | null = null;

  constructor(private inv: Inventory, private hooks: QuestHooks) {}

  load(d: QuestSave | undefined) {
    if (!d) return;
    this.list = d.quests.filter((q) => QUESTS[q.id]);
    this.flags = new Set(d.flags);
    this.tracked = d.tracked;
  }
  serialize(): QuestSave { return { quests: this.list, flags: [...this.flags], tracked: this.tracked }; }

  get(id: string) { return this.list.find((q) => q.id === id); }
  active() { return this.list.filter((q) => !q.done); }
  finished() { return this.list.filter((q) => q.done); }
  isActive(id: string) { const q = this.get(id); return !!q && !q.done; }
  isDone(id: string) { return !!this.get(id)?.done; }
  stageOf(id: string) { return this.get(id)?.stage ?? -1; }

  start(id: string, silent = false) {
    if (this.get(id) || !QUESTS[id]) return;
    const def = QUESTS[id];
    const st: QuestState = { id, stage: 0, prog: def.stages[0].objectives.map(() => 0), done: false, started: this.hooks.day() };
    this.list.push(st);
    if (!this.tracked || def.chapter) this.tracked = id;
    if (!silent) this.hooks.toast(def.chapter ? `Chapter ${def.chapter}: ${def.title}` : `New quest: ${def.title}`, '#f0d070');
    this.hooks.onStage(def, 0);
    this.check(st);
  }

  /** a story flag was set (talked to someone, opened something, reached a place) */
  flag(name: string) {
    if (this.flags.has(name)) return;
    this.flags.add(name);
    for (const q of this.active()) this.check(q);
  }

  onKill(enemy: string, pos: { x: number; z: number }) {
    for (const q of this.active()) {
      const objs = QUESTS[q.id].stages[q.stage].objectives;
      objs.forEach((o, i) => {
        if (o.kind !== 'kill' || o.enemy !== enemy || q.prog[i] >= o.n) return;
        if (o.at && o.r) { const p = this.hooks.place(o.at); if (p && Math.hypot(p.x - pos.x, p.z - pos.z) > o.r) return; }
        q.prog[i]++;
        if (q.prog[i] < o.n) this.hooks.toast(`${o.text}: ${q.prog[i]}/${o.n}`, '#c8b890');
      });
      this.check(q);
    }
  }

  /** periodic: position objectives and items in the pack */
  update(pos: { x: number; z: number }) {
    for (const q of this.active()) {
      const objs = QUESTS[q.id].stages[q.stage].objectives;
      objs.forEach((o, i) => {
        if (o.kind === 'goto' && !q.prog[i]) { const p = this.hooks.place(o.at); if (p && Math.hypot(p.x - pos.x, p.z - pos.z) < o.r) q.prog[i] = 1; }
        if (o.kind === 'collect') q.prog[i] = Math.min(o.n, this.inv.count(o.item));
      });
      this.check(q);
    }
  }

  private objDone(o: Objective, p: number) {
    if (o.kind === 'goto') return p >= 1;
    if (o.kind === 'kill' || o.kind === 'collect') return p >= o.n;
    return this.flags.has(o.flag);
  }

  private check(q: QuestState) {
    if (q.done) return;
    const def = QUESTS[q.id];
    const st = def.stages[q.stage];
    if (!st.objectives.every((o, i) => this.objDone(o, q.prog[i]))) return;
    // hand in collected items
    for (const o of st.objectives) if (o.kind === 'collect') this.inv.remove(o.item, o.n);
    if (q.stage + 1 < def.stages.length) {
      q.stage++;
      q.prog = def.stages[q.stage].objectives.map(() => 0);
      this.hooks.toast(def.stages[q.stage].objectives[0].text, '#e8d8a8');
      this.hooks.onStage(def, q.stage);
      this.check(q);
      return;
    }
    q.done = true; q.finished = this.hooks.day();
    const r = def.reward;
    this.hooks.reward(r.gold ?? 0, r.xp ?? 0);
    for (const [id, n] of r.items ?? []) this.inv.add(id, n);
    const bits = [r.gold ? `${r.gold} gold` : '', r.xp ? `${r.xp} XP` : '', ...(r.items ?? []).map(([id, n]) => `${n > 1 ? n + '× ' : ''}${ITEMS[id].name}`)].filter(Boolean);
    this.hooks.toast(`${def.done ?? `Quest complete: ${def.title}`}${bits.length ? ` (${bits.join(', ')})` : ''}`, '#f0d070');
    if (this.tracked === q.id) this.tracked = this.active()[0]?.id ?? null;
    this.hooks.onComplete(def);
    if (def.next) this.start(def.next);
  }

  /** Current objective lines of a quest, with progress. */
  objectives(id: string): { text: string; done: boolean; at: Place | null }[] {
    const q = this.get(id)!;
    const def = QUESTS[id];
    if (q.done) return [];
    return def.stages[q.stage].objectives.map((o, i) => {
      const n = o.kind === 'kill' || o.kind === 'collect' ? ` (${Math.min(q.prog[i], o.n)}/${o.n})` : '';
      return { text: o.text + n, done: this.objDone(o, q.prog[i]), at: o.at ?? null };
    });
  }

  /** The tracked quest's first open objective with a place, for the HUD arrow. */
  trackedObjective(): { text: string; at: { x: number; z: number } | null } | null {
    if (!this.tracked || !this.isActive(this.tracked)) return null;
    const o = this.objectives(this.tracked).find((x) => !x.done);
    if (!o) return null;
    return { text: o.text, at: o.at ? this.hooks.place(o.at) : null };
  }
}
