// Inventory: 6 hotbar slots + 24 backpack slots. Stacks, tool durability, crafting.
import { ITEMS, RECIPES, Recipe, Station } from '../data/items';

export interface Stack { id: string; n: number; dur?: number }
export const HOTBAR = 6;
export const BACKPACK = 24;

export class Inventory {
  slots: (Stack | null)[] = Array(HOTBAR + BACKPACK).fill(null);
  selected = 0;
  private listeners: (() => void)[] = [];

  onChange(fn: () => void) { this.listeners.push(fn); }
  changed() { for (const l of this.listeners) l(); }

  get held(): Stack | null { return this.slots[this.selected]; }

  count(id: string): number {
    let n = 0;
    for (const s of this.slots) if (s?.id === id) n += s.n;
    return n;
  }

  /** Add items; returns how many did not fit. Hotbar fills first for tools. */
  add(id: string, n: number): number {
    const def = ITEMS[id];
    if (!def) return n;
    const max = def.stack ?? 99;
    for (let i = 0; i < this.slots.length && n > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.n < max) { const k = Math.min(n, max - s.n); s.n += k; n -= k; }
    }
    const order = [...Array(this.slots.length).keys()];
    if (def.cat !== 'tool' && def.cat !== 'placeable' && def.cat !== 'food') order.push(...order.splice(0, HOTBAR)); // materials go to the backpack first
    for (const i of order) {
      if (n <= 0) break;
      if (!this.slots[i]) {
        const k = Math.min(n, max);
        this.slots[i] = { id, n: k, dur: def.tool?.durability || undefined };
        n -= k;
      }
    }
    this.changed();
    return n;
  }

  remove(id: string, n: number): boolean {
    if (this.count(id) < n) return false;
    for (let i = this.slots.length - 1; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (s?.id !== id) continue;
      const k = Math.min(n, s.n);
      s.n -= k; n -= k;
      if (s.n <= 0) this.slots[i] = null;
    }
    this.changed();
    return true;
  }

  /** Use up one item from a slot. */
  consume(slot: number) {
    const s = this.slots[slot];
    if (!s) return;
    s.n--;
    if (s.n <= 0) this.slots[slot] = null;
    this.changed();
  }

  /** Wear the held tool; returns true if it broke. */
  wear(amount = 1): boolean {
    const s = this.held;
    if (!s || s.dur === undefined) return false;
    s.dur -= amount;
    if (s.dur <= 0) { this.slots[this.selected] = null; this.changed(); return true; }
    this.changed();
    return false;
  }

  move(from: number, to: number) {
    if (from === to) return;
    const a = this.slots[from], b = this.slots[to];
    if (a && b && a.id === b.id) {
      const max = ITEMS[a.id].stack ?? 99;
      const k = Math.min(a.n, max - b.n);
      b.n += k; a.n -= k;
      if (a.n <= 0) this.slots[from] = null;
    } else { this.slots[from] = b; this.slots[to] = a; }
    this.changed();
  }

  split(slot: number) {
    const s = this.slots[slot];
    if (!s || s.n < 2) return;
    const free = this.slots.findIndex((x, i) => !x && i >= HOTBAR);
    const target = free >= 0 ? free : this.slots.findIndex((x) => !x);
    if (target < 0) return;
    const half = Math.floor(s.n / 2);
    s.n -= half;
    this.slots[target] = { id: s.id, n: half };
    this.changed();
  }

  canCraft(r: Recipe, stations: Set<Station>): boolean {
    if (r.station !== 'hand' && !stations.has(r.station)) return false;
    return r.inputs.every(([id, n]) => this.count(id) >= n);
  }

  craft(r: Recipe, stations: Set<Station>): boolean {
    if (!this.canCraft(r, stations)) return false;
    for (const [id, n] of r.inputs) this.remove(id, n);
    const left = this.add(r.out, r.n);
    return left === 0;
  }

  recipes(): Recipe[] { return RECIPES; }

  serialize() { return { slots: this.slots, selected: this.selected }; }
  load(d: { slots: (Stack | null)[]; selected: number }) {
    this.slots = Array(HOTBAR + BACKPACK).fill(null).map((_, i) => d.slots[i] ?? null).map((s) => (s && ITEMS[s.id] ? s : null));
    this.selected = d.selected ?? 0;
    this.changed();
  }
}
