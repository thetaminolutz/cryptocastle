// The in-game menu: Inventory (drag & drop, long-press info, split), Crafting,
// Settings and Save. Touch-first; also works with a mouse.
import { Inventory, HOTBAR, BACKPACK } from '../game/inventory';
import { ITEMS, RARITY_COLOR, Recipe, Station } from '../data/items';
import { iconUrl } from './icons';
import { slotHTML } from './hotbar';
import { buildSettings } from './settings-panel';

export type MenuTab = 'inventory' | 'crafting' | 'settings' | 'save';
export interface MenuHooks {
  stations(): Set<Station>;
  save(): Promise<void>;
  exportSave(): Promise<void>;
  quit(): void;
  onClose(): void;
}

const STATION_NAME: Record<Station, string> = { hand: 'By hand', workbench: 'Workbench', campfire: 'Campfire', furnace: 'Furnace', anvil: 'Anvil' };

export class Menu {
  private root: HTMLDivElement | null = null;
  private body!: HTMLDivElement;
  private tab: MenuTab = 'inventory';
  private infoSlot = -1;

  constructor(private parent: HTMLElement, private inv: Inventory, private hooks: MenuHooks) {
    inv.onChange(() => { if (this.root && (this.tab === 'inventory' || this.tab === 'crafting')) this.renderTab(); });
  }

  get isOpen() { return !!this.root; }

  open(tab: MenuTab = this.tab) {
    this.close(false);
    this.tab = tab;
    const root = document.createElement('div');
    root.className = 'menu';
    const box = document.createElement('div');
    box.className = 'menu-box';
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    for (const [t, label] of [['inventory', 'Pack'], ['crafting', 'Craft'], ['settings', 'Settings'], ['save', 'Save']] as [MenuTab, string][]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.classList.toggle('on', t === tab);
      b.addEventListener('click', () => { this.tab = t; tabs.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); this.renderTab(); });
      tabs.appendChild(b);
    }
    const close = document.createElement('button');
    close.className = 'close'; close.textContent = '✕';
    close.addEventListener('click', () => this.close());
    tabs.appendChild(close);
    this.body = document.createElement('div');
    this.body.className = 'tab-body';
    box.append(tabs, this.body);
    root.appendChild(box);
    root.addEventListener('pointerdown', (e) => { if (e.target === root) this.close(); });
    this.parent.appendChild(root);
    this.root = root;
    this.renderTab();
  }

  close(notify = true) {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    if (notify) this.hooks.onClose();
  }

  private renderTab() {
    const b = this.body;
    b.innerHTML = '';
    if (this.tab === 'inventory') this.renderInventory(b);
    else if (this.tab === 'crafting') this.renderCrafting(b);
    else if (this.tab === 'settings') buildSettings(b);
    else this.renderSave(b);
  }

  // ---------------------------------------------------------------- inventory
  private renderInventory(b: HTMLElement) {
    const wrap = document.createElement('div'); wrap.className = 'inv-wrap';
    const left = document.createElement('div');
    const grid = (from: number, n: number, label: string) => {
      const l = document.createElement('div'); l.className = 'inv-label'; l.textContent = label;
      const g = document.createElement('div'); g.className = 'inv-grid';
      for (let i = from; i < from + n; i++) g.appendChild(this.slotEl(i));
      left.append(l, g);
    };
    grid(0, HOTBAR, 'BELT (HOTBAR)');
    grid(HOTBAR, BACKPACK, 'PACK');
    const info = document.createElement('div'); info.className = 'info';
    this.renderInfo(info);
    wrap.append(left, info);
    b.appendChild(wrap);
  }

  private slotEl(i: number): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'slot';
    el.dataset.slot = String(i);
    slotHTML(el, this.inv.slots[i]);
    if (i === this.infoSlot) el.classList.add('sel');
    let timer = 0, ghost: HTMLImageElement | null = null, startX = 0, startY = 0, dragging = false, pid = -1;
    el.addEventListener('pointerdown', (e) => {
      if (!this.inv.slots[i]) return;
      pid = e.pointerId; startX = e.clientX; startY = e.clientY; dragging = false;
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      // long press → info with actions
      timer = window.setTimeout(() => { if (!dragging) { this.infoSlot = i; this.renderTab(); } }, 450);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid || !this.inv.slots[i]) return;
      if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) > 8) {
        dragging = true; clearTimeout(timer);
        ghost = document.createElement('img'); ghost.className = 'drag-ghost'; ghost.src = iconUrl(this.inv.slots[i]!.id);
        document.body.appendChild(ghost);
      }
      if (ghost) { ghost.style.left = `${e.clientX - 32}px`; ghost.style.top = `${e.clientY - 32}px`; }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      clearTimeout(timer); pid = -1;
      if (dragging) {
        ghost?.remove(); ghost = null; dragging = false;
        const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.slot') as HTMLElement | null;
        if (over?.dataset.slot !== undefined) this.inv.move(i, Number(over.dataset.slot));
      } else if (e.type === 'pointerup') {
        this.infoSlot = i;
        if (i < HOTBAR) this.inv.selected = i;
        this.renderTab();
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    return el;
  }

  private renderInfo(box: HTMLElement) {
    const s = this.inv.slots[this.infoSlot];
    if (!s) { box.innerHTML = '<p>Tap an item to inspect it. Drag items to move them; drop on the belt to use them.</p>'; return; }
    const d = ITEMS[s.id];
    const h = document.createElement('h3'); h.textContent = d.name; h.style.color = RARITY_COLOR[d.rarity ?? 'common'];
    const p = document.createElement('p'); p.textContent = d.desc;
    box.append(h, p);
    const stat = (t: string) => { const e = document.createElement('div'); e.className = 'stat'; e.textContent = t; box.appendChild(e); };
    stat(`${(d.rarity ?? 'common').toUpperCase()} · ${d.cat}`);
    if (d.tool && d.tool.kind !== 'staff' && d.tool.kind !== 'torch') stat(`Tier ${d.tool.tier} · Power ${d.tool.power}${s.dur !== undefined ? ` · Durability ${Math.ceil(s.dur)}/${d.tool.durability}` : ''}`);
    if (d.food) stat(`Restores ${d.food.heal} life${d.food.stamina ? `, ${d.food.stamina} stamina` : ''}`);
    if (s.n > 1) stat(`Stack: ${s.n}`);
    const btn = (label: string, fn: () => void) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.addEventListener('click', fn); box.appendChild(b); };
    if (s.n > 1) btn('Split', () => this.inv.split(this.infoSlot));
    if (this.infoSlot >= HOTBAR) btn('To belt', () => {
      const free = this.inv.slots.findIndex((x, k) => k < HOTBAR && !x);
      this.inv.move(this.infoSlot, free >= 0 ? free : this.inv.selected);
    });
    btn('Discard', () => { this.inv.slots[this.infoSlot] = null; this.inv.changed(); });
  }

  // ---------------------------------------------------------------- crafting
  private renderCrafting(b: HTMLElement) {
    const stations = this.hooks.stations();
    const near = document.createElement('div'); near.className = 'inv-label';
    near.textContent = `NEARBY: ${['By hand', ...[...stations].map((s) => STATION_NAME[s])].join(' · ')}`;
    b.appendChild(near);
    const list = [...this.inv.recipes()];
    const score = (r: Recipe) => (this.inv.canCraft(r, stations) ? 0 : r.station === 'hand' || stations.has(r.station) ? 1 : 2);
    list.sort((a, c) => score(a) - score(c));
    for (const r of list) {
      const row = document.createElement('div');
      row.className = 'recipe';
      const available = r.station === 'hand' || stations.has(r.station);
      if (!available) row.classList.add('locked');
      const img = document.createElement('img'); img.src = iconUrl(r.out);
      const name = document.createElement('div'); name.className = 'name';
      const d = ITEMS[r.out];
      name.textContent = `${d.name}${r.n > 1 ? ` ×${r.n}` : ''}`; name.style.color = RARITY_COLOR[d.rarity ?? 'common'];
      const inputs = document.createElement('div'); inputs.className = 'inputs';
      for (const [id, n] of r.inputs) {
        const have = this.inv.count(id);
        const sp = document.createElement('span');
        if (have < n) sp.className = 'miss';
        const ic = document.createElement('img'); ic.src = iconUrl(id);
        sp.append(ic, ` ${ITEMS[id].name} ${have}/${n}`);
        inputs.appendChild(sp);
      }
      const badge = document.createElement('div'); badge.className = 'badge'; badge.textContent = STATION_NAME[r.station];
      const btn = document.createElement('button'); btn.className = 'btn primary'; btn.textContent = 'Craft';
      btn.disabled = !this.inv.canCraft(r, stations);
      btn.addEventListener('click', () => this.inv.craft(r, this.hooks.stations()));
      row.append(img, name, inputs, badge, btn);
      b.appendChild(row);
    }
  }

  // ---------------------------------------------------------------- save
  private renderSave(b: HTMLElement) {
    const row = document.createElement('div'); row.className = 'save-row';
    const btn = (label: string, fn: () => void | Promise<void>, primary = false) => {
      const e = document.createElement('button'); e.className = primary ? 'btn primary' : 'btn'; e.textContent = label;
      e.addEventListener('click', async () => { e.disabled = true; await fn(); e.disabled = false; });
      row.appendChild(e);
    };
    btn('Save now', async () => { await this.hooks.save(); msg.textContent = 'Saved.'; }, true);
    btn('Export save file', () => this.hooks.exportSave());
    btn('Quit to title', async () => { await this.hooks.save(); this.hooks.quit(); });
    const msg = document.createElement('p'); msg.className = 'hint'; msg.style.textAlign = 'left';
    msg.textContent = 'The game also saves by itself every two minutes and whenever you leave the app.';
    b.append(row, msg);
  }
}
