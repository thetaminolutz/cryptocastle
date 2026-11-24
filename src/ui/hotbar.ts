// Hotbar (6 slots along the bottom) and pickup notifications.
import { HOTBAR, Inventory } from '../game/inventory';
import { ITEMS, RARITY_COLOR } from '../data/items';
import { iconUrl } from './icons';

export function slotHTML(el: HTMLElement, s: { id: string; n: number; dur?: number } | null) {
  el.innerHTML = '';
  if (!s) return;
  const def = ITEMS[s.id];
  const img = document.createElement('img');
  img.src = iconUrl(s.id); img.draggable = false;
  el.appendChild(img);
  el.style.setProperty('--rar', RARITY_COLOR[def.rarity ?? 'common']);
  if (s.n > 1) { const n = document.createElement('span'); n.className = 'count'; n.textContent = String(s.n); el.appendChild(n); }
  if (s.dur !== undefined && def.tool?.durability) {
    const bar = document.createElement('div'); bar.className = 'dur';
    const f = Math.max(0, s.dur / def.tool.durability);
    bar.style.width = `${f * 80}%`; bar.style.background = f > 0.5 ? '#7c4' : f > 0.2 ? '#dc4' : '#d43';
    el.appendChild(bar);
  }
}

export class Hotbar {
  readonly root: HTMLDivElement;
  private slots: HTMLDivElement[] = [];
  private notes: HTMLDivElement;

  constructor(parent: HTMLElement, private inv: Inventory) {
    this.root = document.createElement('div');
    this.root.className = 'hotbar';
    for (let i = 0; i < HOTBAR; i++) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.inv.selected = i; this.inv.changed(); });
      this.slots.push(el);
      this.root.appendChild(el);
    }
    this.notes = document.createElement('div');
    this.notes.className = 'notes';
    parent.append(this.root, this.notes);
    inv.onChange(() => this.render());
    this.render();
  }

  render() {
    this.slots.forEach((el, i) => { slotHTML(el, this.inv.slots[i]); el.classList.toggle('sel', i === this.inv.selected); });
  }

  notify(text: string, color = '#e8d8a8') {
    // merge repeated pickups ("+1 Stone" → "+3 Stone")
    const m = /^\+(\d+) (.+)$/.exec(text);
    if (m) {
      for (const el of Array.from(this.notes.children) as HTMLDivElement[]) {
        const m2 = /^\+(\d+) (.+)$/.exec(el.textContent ?? '');
        if (m2 && m2[2] === m[2]) { el.textContent = `+${Number(m2[1]) + Number(m[1])} ${m[2]}`; el.dataset.t = String(performance.now()); return; }
      }
    }
    const el = document.createElement('div');
    el.textContent = text; el.style.color = color; el.dataset.t = String(performance.now());
    this.notes.appendChild(el);
    while (this.notes.children.length > 5) this.notes.firstChild!.remove();
  }

  tick() {
    const now = performance.now();
    for (const el of Array.from(this.notes.children) as HTMLDivElement[]) {
      const age = now - Number(el.dataset.t);
      el.style.opacity = String(Math.max(0, Math.min(1, (3200 - age) / 600)));
      if (age > 3200) el.remove();
    }
  }
}
