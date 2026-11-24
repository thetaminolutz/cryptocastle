import { renderGuide } from './guide';
// The in-game menu: Inventory (drag & drop, long-press info, split), Crafting,
// Settings and Save. Touch-first; also works with a mouse.
import { Inventory, HOTBAR, BACKPACK, Stack, stackName } from '../game/inventory';
import { EQUIP_SLOTS, SLOT_NAME, SETS, AFFIXES, Bonus } from '../data/gear';
import { gearTotals } from '../game/equipment';
import { ITEMS, RARITY_COLOR, Recipe, Station } from '../data/items';
import { iconUrl } from './icons';
import { slotHTML } from './hotbar';
import { buildSettings } from './settings-panel';

export type MenuTab = 'inventory' | 'gear' | 'crafting' | 'map' | 'journal' | 'codex' | 'help' | 'settings' | 'save' | 'chest';
export interface MenuHooks {
  stations(): Set<Station>;
  save(): Promise<void>;
  exportSave(): Promise<void>;
  quit(): void;
  onClose(): void;
  renderMap(host: HTMLElement): void;
  renderJournal(host: HTMLElement): void;
  renderCodex(host: HTMLElement): void;
  /** a special action for an item in the pack (wish shards, the sealed box) */
  itemAction(id: string): { label: string; run: () => void } | null;
}

const STATION_NAME: Record<Station, string> = { hand: 'By hand', workbench: 'Workbench', campfire: 'Campfire', furnace: 'Furnace', anvil: 'Anvil' };

export class Menu {
  private root: HTMLDivElement | null = null;
  private body!: HTMLDivElement;
  private tab: MenuTab = 'inventory';
  private infoSlot = -1;
  private chest: (Stack | null)[] | null = null;

  constructor(private parent: HTMLElement, private inv: Inventory, private hooks: MenuHooks) {
    inv.onChange(() => { if (this.root && (this.tab === 'inventory' || this.tab === 'crafting' || this.tab === 'gear')) this.renderTab(); });
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
    if (tab !== 'chest') this.chest = null;
    const tabList: [MenuTab, string][] = [['inventory', 'Pack'], ['gear', 'Gear'], ['crafting', 'Craft'], ['map', 'Map'], ['journal', 'Journal'], ['codex', 'Codex'], ['help', 'Help'], ['settings', 'Settings'], ['save', 'Save']];
    if (this.chest) tabList.unshift(['chest', 'Chest']);
    for (const [t, label] of tabList) {
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
    if (this.tab === 'chest' && this.chest) this.renderChest(b, this.chest);
    else if (this.tab === 'inventory') this.renderInventory(b);
    else if (this.tab === 'gear') this.renderGear(b);
    else if (this.tab === 'crafting') this.renderCrafting(b);
    else if (this.tab === 'map') this.hooks.renderMap(b);
    else if (this.tab === 'journal') this.hooks.renderJournal(b);
    else if (this.tab === 'codex') this.hooks.renderCodex(b);
    else if (this.tab === 'help') renderGuide(b);
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
    const h = document.createElement('h3'); h.textContent = stackName(s); h.style.color = RARITY_COLOR[d.rarity ?? 'common'];
    const p = document.createElement('p'); p.textContent = d.desc;
    box.append(h, p);
    const stat = (t: string) => { const e = document.createElement('div'); e.className = 'stat'; e.textContent = t; box.appendChild(e); };
    describeStats(d, s, stat);
    if (d.lore) { const l = document.createElement('p'); l.className = 'lore'; l.textContent = `“${d.lore}”`; box.appendChild(l); }
    if (d.tool && d.tool.kind !== 'staff' && d.tool.kind !== 'torch') stat(`Tier ${d.tool.tier} · Power ${d.tool.power}${s.dur !== undefined ? ` · Durability ${Math.ceil(s.dur)}/${d.tool.durability}` : ''}`);
    if (d.food) stat(`Restores ${d.food.heal} life${d.food.stamina ? `, ${d.food.stamina} stamina` : ''}`);
    if (s.n > 1) stat(`Stack: ${s.n}`);
    const btn = (label: string, fn: () => void) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.addEventListener('click', fn); box.appendChild(b); };
    if (d.armor) btn('Wear', () => { this.inv.equipFrom(this.infoSlot); });
    const act = this.hooks.itemAction(s.id);
    if (act) btn(act.label, () => { this.close(); act.run(); });
    if (s.n > 1) btn('Split', () => this.inv.split(this.infoSlot));
    if (this.infoSlot >= HOTBAR) btn('To belt', () => {
      const free = this.inv.slots.findIndex((x, k) => k < HOTBAR && !x);
      this.inv.move(this.infoSlot, free >= 0 ? free : this.inv.selected);
    });
    btn('Discard', () => { this.inv.slots[this.infoSlot] = null; this.inv.changed(); });
  }

  // ---------------------------------------------------------------- equipment (paper doll)
  private renderGear(b: HTMLElement) {
    const wrap = document.createElement('div'); wrap.className = 'inv-wrap';
    const left = document.createElement('div');
    const doll = document.createElement('div'); doll.className = 'doll';
    for (const k of EQUIP_SLOTS) {
      const cell = document.createElement('div'); cell.className = 'doll-cell';
      const el = document.createElement('div'); el.className = 'slot';
      slotHTML(el, this.inv.equip[k] ?? null);
      const lab = document.createElement('span'); lab.textContent = SLOT_NAME[k];
      el.addEventListener('click', () => { if (this.inv.equip[k] && !this.inv.unequip(k)) alert('Your pack is full.'); });
      cell.append(el, lab); doll.appendChild(cell);
    }
    const l = document.createElement('div'); l.className = 'inv-label'; l.textContent = 'WORN — tap to take off';
    const l2 = document.createElement('div'); l2.className = 'inv-label'; l2.textContent = 'IN YOUR PACK — tap to wear';
    const g = document.createElement('div'); g.className = 'inv-grid';
    this.inv.slots.forEach((st, i) => {
      if (!st || !ITEMS[st.id].armor) return;
      const el = document.createElement('div'); el.className = 'slot'; slotHTML(el, st);
      el.addEventListener('click', () => this.inv.equipFrom(i));
      g.appendChild(el);
    });
    if (!g.children.length) g.innerHTML = '<p class="muted">No clothing or armour in your pack.</p>';
    left.append(l, doll, l2, g);
    // totals
    const info = document.createElement('div'); info.className = 'info';
    const t = gearTotals(this.inv);
    const h = document.createElement('h3'); h.textContent = `Defence ${t.def}`;
    info.appendChild(h);
    const lines = bonusLines(t.bonus);
    for (const line of lines) { const e = document.createElement('div'); e.className = 'stat'; e.textContent = line; info.appendChild(e); }
    for (const st of t.sets) {
      const set = Object.values(SETS).find((x) => x.name === st.name)!;
      const e = document.createElement('div'); e.className = 'stat set';
      e.innerHTML = `<b>${set.name}</b> ${st.n}/${st.total}<br><span class="${st.n >= 2 ? 'on' : ''}">(2) ${bonusLines(set.two).join(', ')}</span><br><span class="${st.n >= 4 ? 'on' : ''}">(4) ${bonusLines(set.four).join(', ')}</span>`;
      info.appendChild(e);
    }
    if (!lines.length && !t.sets.length) info.insertAdjacentHTML('beforeend', '<p>Wear armour and jewellery to raise your defence and gain bonuses. Pieces of the same set work together.</p>');
    wrap.append(left, info);
    b.appendChild(wrap);
  }

  /** Open a storage container (chest). Tap an item to move its stack across. */
  openChest(items: (Stack | null)[]) { this.chest = items; this.open('chest'); }

  private renderChest(b: HTMLElement, chest: (Stack | null)[]) {
    const wrap = document.createElement('div'); wrap.className = 'inv-wrap';
    const col = (label: string, n: number, get: (i: number) => Stack | null, tap: (i: number) => void) => {
      const box = document.createElement('div');
      const l = document.createElement('div'); l.className = 'inv-label'; l.textContent = label;
      const g = document.createElement('div'); g.className = 'inv-grid';
      for (let i = 0; i < n; i++) {
        const el = document.createElement('div'); el.className = 'slot';
        slotHTML(el, get(i));
        el.addEventListener('pointerup', () => { tap(i); this.renderTab(); });
        g.appendChild(el);
      }
      box.append(l, g); wrap.appendChild(box);
    };
    col('CHEST — TAP TO TAKE', chest.length, (i) => chest[i], (i) => {
      const s = chest[i]; if (!s) return;
      const left = this.inv.add(s.id, s.n);
      if (left) s.n = left; else chest[i] = null;
    });
    col('YOUR PACK — TAP TO STORE', HOTBAR + BACKPACK, (i) => this.inv.slots[i], (i) => {
      const s = this.inv.slots[i]; if (!s) return;
      const max = ITEMS[s.id].stack ?? 99;
      for (let k = 0; k < chest.length && s.n > 0; k++) { const c = chest[k]; if (c && c.id === s.id && c.n < max) { const m = Math.min(s.n, max - c.n); c.n += m; s.n -= m; } }
      if (s.n > 0) { const free = chest.findIndex((c) => !c); if (free >= 0) { chest[free] = { ...s }; s.n = 0; } }
      if (s.n <= 0) this.inv.slots[i] = null;
      this.inv.changed();
    });
    b.appendChild(wrap);
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

const PCT = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
/** Human-readable bonus lines. */
export function bonusLines(b: Bonus): string[] {
  const out: string[] = [];
  const add = (v: number | undefined, f: (v: number) => string) => { if (v) out.push(f(v)); };
  add(b.life, (v) => `${v > 0 ? '+' : ''}${v} life`); add(b.stamina, (v) => `+${v} stamina`); add(b.def, (v) => `+${v} defence`);
  add(b.dmg, (v) => `${PCT(v)} damage`); add(b.crit, (v) => `${PCT(v)} critical chance`); add(b.lifesteal, (v) => `${PCT(v)} life steal`);
  add(b.fire, (v) => `${PCT(v)} chance to burn`); add(b.frost, (v) => `${PCT(v)} chance to freeze`); add(b.curse, (v) => `${PCT(v)} chance to curse`);
  add(b.speed, (v) => `${PCT(v)} speed`); add(b.jump, (v) => `${PCT(v)} jump`); add(b.regen, (v) => `+${v} life regeneration`);
  add(b.staminaRegen, (v) => `${PCT(v)} stamina recovery`); add(b.block, (v) => `${PCT(v)} block`); add(b.attackSpeed, (v) => `${PCT(v)} attack speed`);
  add(b.ranged, (v) => `${PCT(v)} ranged damage`); add(b.xp, (v) => `${PCT(v)} experience`); add(b.gold, (v) => `${PCT(v)} gold found`);
  add(b.breath, (v) => `${PCT(v)} breath`); add(b.fireRes, (v) => `${PCT(v)} fire resistance`); if (b.poisonRes) out.push('Immune to poison');
  if (b.nightEye) out.push('See in the dark'); if (b.light) out.push('Carries its own light'); if (b.stealth) out.push('Harder to notice');
  return out;
}

function describeStats(d: import('../data/items').ItemDef, s: Stack, stat: (t: string) => void) {
  stat(`${(d.rarity ?? 'common').toUpperCase()} · ${d.cat === 'armor' ? SLOT_NAME[(d.armor!.slot === 'ring' ? 'ring1' : d.armor!.slot) as keyof typeof SLOT_NAME] : d.cat}`);
  if (d.weapon) stat(`${Math.round(d.weapon.dmg)} ${d.weapon.type} damage · speed ${d.weapon.speed} · ${d.weapon.ranged ? `range ${d.weapon.reach} m${d.weapon.ranged.ammo ? ' · uses arrows' : ''}` : `reach ${d.weapon.reach} m`}`);
  if (d.shield) stat(`Blocks ${Math.round(d.shield.block * 100)}% of a blow`);
  if (d.armor) stat(`Defence ${d.armor.def}${d.armor.set ? ` · ${SETS[d.armor.set].name} set` : ''}`);
  for (const l of bonusLines(d.bonus ?? {})) stat(l);
  if (s.affix) for (const l of bonusLines(AFFIXES[s.affix].bonus)) stat(l);
  if (s.affix && AFFIXES[s.affix].dmgMul) stat(`${PCT(AFFIXES[s.affix].dmgMul! - 1)} damage, ${PCT(AFFIXES[s.affix].speedMul! - 1)} speed`);
}
