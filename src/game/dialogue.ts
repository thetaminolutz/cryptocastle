// Talking to villagers: portrait, template-built greetings (time, weather,
// reputation, traits), and choices — trade, work, rumours, gifts, renting a room,
// pickpocketing, insults and threats (with consequences). Includes shops with
// limited gold, reputation- and supply-based prices and restocking.
import { ITEMS, RARITY_COLOR } from '../data/items';
import { GREET, GREET_REP, WEATHER_LINES, TRAIT_LINES, RUMOURS, GIFT_REACT, JOB_NEEDS, JOB_TITLE, SHOPS, DISLIKED_BY_ALL } from '../data/npcs';
import { BIOMES } from '../world/biomes';
import { iconUrl } from '../ui/icons';
import type { NPC, Villagers } from '../entities/villagers';
import type { Inventory } from './inventory';
import type { Job } from '../world/villages';

export interface ShopState { gold: number; stock: Record<string, number>; day: number; }
export interface DialogueHooks {
  gold(): number; addGold(n: number): void;
  hours(): number; day(): number; weather(): string;
  playerName(): string;
  biomeToward(dx: number, dz: number): string;
  rentRoom(npc: NPC): void;
  toast(t: string, c?: string): void;
  onOpen(): void; onClose(): void;
  priceMul(): number;
  /** story / quest options for a villager */
  extraOptions(n: NPC): [string, () => void][];
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

function portrait(n: NPC): string {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const bg = g.createRadialGradient(64, 54, 10, 64, 64, 80); bg.addColorStop(0, '#3a2a20'); bg.addColorStop(1, '#0c0806');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  const dyes = ['#6b4229', '#3d5233', '#38455f', '#73291f', '#8c7340', '#5a5450'];
  const cloth = n.outfit === 'guard' ? '#8a8c94' : n.outfit === 'priest' ? '#d8d0c0' : dyes[Math.floor(n.tint * 6)];
  g.fillStyle = cloth; g.beginPath(); g.ellipse(64, 128, 52, 40, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#d8ad8c'; g.fillRect(56, 76, 16, 14);
  g.beginPath(); g.ellipse(64, 58, 24, 29, 0, 0, Math.PI * 2); g.fill();
  const hair = ['#3a2614', '#1e1610', '#6a4a24', '#8a8070', '#a06830'][Math.floor(n.tint * 37) % 5];
  g.fillStyle = hair;
  if (n.outfit === 'guard') { g.fillStyle = '#8a8c94'; g.beginPath(); g.ellipse(64, 44, 27, 20, 0, Math.PI, 0); g.fill(); g.fillRect(62, 44, 4, 22); }
  else if (n.outfit === 'priest') { g.fillStyle = '#d8d0c0'; g.beginPath(); g.ellipse(64, 52, 32, 38, 0, Math.PI * 1.05, -0.05 * Math.PI); g.lineTo(96, 90); g.lineTo(32, 90); g.fill(); g.fillStyle = '#d8ad8c'; g.beginPath(); g.ellipse(64, 62, 19, 22, 0, 0, Math.PI * 2); g.fill(); }
  else if (n.outfit === 'merchant') { g.fillStyle = '#5a1e18'; g.fillRect(40, 22, 48, 16); g.fillRect(30, 36, 68, 5); }
  else if (n.female) { g.beginPath(); g.ellipse(64, 46, 27, 22, 0, Math.PI, 0); g.fill(); g.fillRect(38, 46, 9, 40); g.fillRect(81, 46, 9, 40); }
  else { g.beginPath(); g.ellipse(64, 40, 25, 14, 0, Math.PI, 0); g.fill(); if (n.outfit !== 'child' && n.tint > 0.4) { g.beginPath(); g.ellipse(64, 78, 18, 12, 0, 0, Math.PI); g.fill(); } }
  g.fillStyle = '#1a1410'; g.beginPath(); g.arc(55, 58, 3, 0, 7); g.arc(73, 58, 3, 0, 7); g.fill();
  g.strokeStyle = '#8a4a3a'; g.lineWidth = 2; g.beginPath();
  if (n.rep < -20) { g.moveTo(56, 76); g.quadraticCurveTo(64, 71, 72, 76); } else { g.moveTo(56, 73); g.quadraticCurveTo(64, n.rep > 30 ? 80 : 76, 72, 73); }
  g.stroke();
  return c.toDataURL();
}

export class Dialogue {
  private root: HTMLDivElement | null = null;
  private npc: NPC | null = null;
  shops: Record<string, ShopState> = {};

  constructor(private parent: HTMLElement, private inv: Inventory, private villagers: Villagers, private hooks: DialogueHooks) {}

  get isOpen() { return !!this.root; }

  private fill(t: string): string {
    const n = this.npc!;
    const v = this.villagers.villageOf(n);
    return t.replace(/\{player\}/g, this.hooks.playerName()).replace(/\{village\}/g, v.site.name).replace(/\{name\}/g, n.name.split(' ')[0]);
  }

  open(n: NPC) {
    this.close(false);
    this.npc = n;
    n.talking = true;
    this.hooks.onOpen();
    const root = document.createElement('div'); root.className = 'dialogue';
    this.root = root;
    this.parent.appendChild(root);
    this.main(this.greeting());
  }

  close(notify = true) {
    if (!this.root) return;
    this.root.remove(); this.root = null;
    if (this.npc) this.npc.talking = false;
    this.npc = null;
    if (notify) this.hooks.onClose();
  }

  private greeting(): string {
    const n = this.npc!;
    const h = this.hooks.hours();
    const rep = n.rep;
    let line: string;
    if (rep < -40) line = pick(GREET_REP.hostile);
    else if (rep > 70) line = pick(GREET_REP.beloved);
    else if (rep > 25) line = pick(GREET_REP.warm);
    else if (rep < -10) line = pick(GREET_REP.cool);
    else line = pick(h < 10 && h >= 5 ? GREET.morning : h < 17 ? GREET.day : h < 21 ? GREET.evening : GREET.night);
    const extra: string[] = [];
    if (Math.random() < 0.5) extra.push(pick(TRAIT_LINES[pick(n.traits)]));
    const w = WEATHER_LINES[this.hooks.weather()];
    if (w && Math.random() < 0.35) extra.push(pick(w));
    const last = n.memory[n.memory.length - 1];
    if (last && Math.random() < 0.6) {
      if (last.what === 'gift' && last.delta > 0) extra.push('I still have the gift you gave me.');
      if (last.what === 'theft') extra.push('I’m watching my purse around you.');
      if (last.what === 'insult') extra.push('Come to apologise?');
      if (last.what === 'work') extra.push('Thanks again for your help.');
    }
    return this.fill([line, ...extra].join(' '));
  }

  // ---------------------------------------------------------------- views
  private frame(text: string, options: [string, () => void, boolean?][]) {
    const n = this.npc!;
    const r = this.root!;
    r.innerHTML = '';
    const box = document.createElement('div'); box.className = 'dlg-box';
    const head = document.createElement('div'); head.className = 'dlg-head';
    const img = document.createElement('img'); img.src = portrait(n);
    const who = document.createElement('div'); who.className = 'dlg-who';
    const repWord = n.rep > 70 ? 'Devoted' : n.rep > 25 ? 'Friendly' : n.rep > -10 ? 'Neutral' : n.rep > -40 ? 'Wary' : 'Hostile';
    who.innerHTML = `<b>${n.name}</b><span>${JOB_TITLE[n.job]} of ${this.villagers.villageOf(n).site.name} · ${repWord}</span>`;
    head.append(img, who);
    const t = document.createElement('div'); t.className = 'dlg-text';
    // type-on text; tap to finish
    let i = 0;
    const tick = () => { if (!this.root || t.dataset.done) return; i += 2; t.textContent = text.slice(0, i); if (i < text.length) requestAnimationFrame(tick); else t.dataset.done = '1'; };
    tick();
    t.addEventListener('pointerup', () => { t.textContent = text; t.dataset.done = '1'; });
    const opts = document.createElement('div'); opts.className = 'dlg-opts';
    for (const [label, fn, disabled] of options) {
      const b = document.createElement('button'); b.className = 'btn dlg-opt'; b.textContent = label;
      b.disabled = !!disabled;
      b.addEventListener('click', fn);
      opts.appendChild(b);
    }
    box.append(head, t, opts);
    r.appendChild(box);
  }

  private main(text: string) {
    const n = this.npc!;
    const opts: [string, () => void, boolean?][] = [];
    if (n.rep < -60) { this.frame(this.fill('I’ve nothing to say to you. Leave.'), [['Leave', () => this.close()]]); return; }
    const shop = SHOPS[n.job];
    if (shop) opts.push([`Trade (${shop.name})`, () => this.shop()]);
    if (n.request) opts.push([this.inv.count(n.request.item) >= n.request.n ? `Here are the ${ITEMS[n.request.item].name.toLowerCase()}` : 'About that job…', () => this.request()]);
    else if (JOB_NEEDS[n.job]) opts.push(['Any work for me?', () => this.work()]);
    opts.push(['Heard any rumours?', () => this.rumour()]);
    opts.push(['I have a gift for you', () => this.gifts()]);
    for (const o of this.hooks.extraOptions(n)) opts.push(o);
    if (n.job === 'innkeeper') opts.push([`Rent a room (8 gold)`, () => this.rent()]);
    opts.push(['More…', () => this.more()]);
    opts.push(['Farewell', () => this.close()]);
    this.frame(text, opts);
  }

  private more() {
    this.frame(this.fill('Yes?'), [
      ['Pickpocket (risky)', () => this.steal()],
      ['Insult them', () => this.insult()],
      ['Threaten them', () => this.threaten()],
      ['Back', () => this.main(this.fill('Something else?'))]
    ]);
  }

  private rumour() {
    const n = this.npc!;
    const d = Math.floor(Math.random() * 8);
    const a = (d / 8) * Math.PI * 2;
    let t = pick(RUMOURS).replace('{dir}', DIRS[d]).replace('{biome}', this.hooks.biomeToward(Math.sin(a), -Math.cos(a)).toLowerCase());
    if (n.traits.includes('gossipy')) t += ' And you didn’t hear it from me!';
    if (n.rep < -10 && Math.random() < 0.5) t = 'Rumours? Find your own.';
    this.main(this.fill(t));
  }

  private work() {
    const n = this.npc!;
    const needs = JOB_NEEDS[n.job]!;
    const [item, lo, hi, per] = pick(needs);
    const count = lo + Math.floor(Math.random() * (hi - lo + 1));
    n.request = { item, n: count, reward: Math.round(count * per * 1.4 + 5) };
    this.main(this.fill(`As it happens… bring me ${count} ${ITEMS[item].name.toLowerCase()} and I’ll pay you ${n.request.reward} gold.`));
  }

  private request() {
    const n = this.npc!, q = n.request!;
    if (this.inv.count(q.item) < q.n) {
      this.frame(this.fill(`I still need ${q.n} ${ITEMS[q.item].name.toLowerCase()} — you have ${this.inv.count(q.item)}.`), [
        ['I’ll be back', () => this.main(this.fill('Don’t take too long.'))],
        ['I can’t do it (cancel)', () => { n.request = null; this.villagers.remember(n, 'failed', -3); this.main(this.fill('Shame. I’ll find someone else.')); }]
      ]);
      return;
    }
    this.inv.remove(q.item, q.n);
    this.hooks.addGold(q.reward);
    this.villagers.remember(n, 'work', 12);
    this.hooks.toast(`+${q.reward} gold`, '#e8c860');
    n.request = null;
    this.main(this.fill('Just what I needed. Here’s your pay — and my thanks.'));
  }

  private gifts() {
    const n = this.npc!;
    const ids = [...new Set(this.inv.slots.filter(Boolean).map((s) => s!.id))].filter((id) => ITEMS[id].cat !== 'tool' || ITEMS[id].id !== 'staff');
    if (!ids.length) { this.main(this.fill('Your hands are empty, friend.')); return; }
    const opts: [string, () => void][] = ids.slice(0, 8).map((id) => [ITEMS[id].name, () => {
      this.inv.remove(id, 1);
      const value = ITEMS[id].value ?? 1;
      let delta: number, react: string;
      if (n.likes.includes(id)) { delta = 14 + Math.min(10, value / 3); react = pick(GIFT_REACT.love); }
      else if (n.dislikes.includes(id) || DISLIKED_BY_ALL.includes(id)) { delta = -6; react = pick(GIFT_REACT.dislike); }
      else if (value >= 8) { delta = 6; react = pick(GIFT_REACT.like); }
      else { delta = 1; react = pick(GIFT_REACT.neutral); }
      if (n.traits.includes('greedy') && value >= 15) delta += 6;
      this.villagers.remember(n, 'gift', delta, 0.15);
      n.gesture = 1;
      this.main(this.fill(react));
    }]);
    opts.push(['Never mind', () => this.main(this.fill('Hm?'))]);
    this.frame(this.fill(`What do you have? (They like ${n.likes.map((l) => ITEMS[l].name.toLowerCase()).join(' and ') || 'nothing in particular'}… or so you guess.)`), opts);
  }

  private rent() {
    const n = this.npc!;
    if (this.hooks.gold() < 8) { this.main(this.fill('Eight gold, and not a copper less.')); return; }
    this.hooks.addGold(-8);
    this.villagers.remember(n, 'guest', 2);
    this.hooks.rentRoom(n);
    this.close();
  }

  private steal() {
    const n = this.npc!;
    const chance = 0.35 + (this.hooks.hours() >= 20 || this.hooks.hours() < 5 ? 0.15 : 0) - (n.traits.includes('brave') ? 0.1 : 0);
    if (Math.random() < chance) {
      const g = 3 + Math.floor(Math.random() * 15);
      this.hooks.addGold(g);
      n.memory.push({ t: Date.now(), what: 'robbed', delta: 0 });
      this.hooks.toast(`You lift ${g} gold unnoticed.`, '#c8b0ff');
      this.close();
    } else {
      this.villagers.remember(n, 'theft', -30, 0.5);
      const fine = Math.min(this.hooks.gold(), 20);
      this.hooks.addGold(-fine);
      this.frame(this.fill(`Thief! THIEF! Guards!${fine ? ` (A guard takes ${fine} gold from you as a fine.)` : ''}`), [['…', () => this.close()]]);
    }
  }

  private insult() {
    const n = this.npc!;
    this.villagers.remember(n, 'insult', n.traits.includes('grumpy') ? -6 : -12);
    this.frame(this.fill(n.traits.includes('brave') ? 'Say that again and you’ll be picking up your teeth.' : n.traits.includes('cowardly') ? '…why would you say that?' : 'How dare you!'), [['Leave', () => this.close()]]);
  }

  private threaten() {
    const n = this.npc!;
    if (n.job === 'guard' || n.traits.includes('brave')) {
      this.villagers.remember(n, 'threat', -18, 0.4);
      this.frame(this.fill('You’d threaten ME? Walk away while you still can.'), [['Leave', () => this.close()]]);
      return;
    }
    this.villagers.remember(n, 'threat', -20, 0.4);
    const g = Math.floor(Math.random() * 10);
    if (g) this.hooks.addGold(g);
    n.fleeT = 10;
    this.frame(this.fill(g ? `Please! Take it — ${g} gold — just leave me be!` : 'I have nothing! Nothing! Leave me alone!'), [['Leave', () => this.close()]]);
  }

  // ---------------------------------------------------------------- shop
  private shopState(n: NPC): ShopState {
    const key = `${n.village}:${n.job}`;
    let s = this.shops[key];
    const day = this.hooks.day();
    if (!s || day - s.day >= 3) {
      const def = SHOPS[n.job as Job]!;
      s = { gold: 150 + Math.floor(Math.random() * 250), stock: Object.fromEntries(def.stock.map(([id, k]) => [id, k])), day };
      this.shops[key] = s;
    }
    return s;
  }
  private buyPrice(n: NPC, id: string) { return Math.max(1, Math.round((ITEMS[id].value ?? 1) * 1.35 * (1 - n.rep / 300) * this.hooks.priceMul())); }
  private sellPrice(n: NPC, id: string) { return Math.max(0, Math.min(this.buyPrice(n, id) - 1, Math.round((ITEMS[id].value ?? 1) * 0.5 * (1 + n.rep / 300) / this.hooks.priceMul()))); }

  private shop() {
    const n = this.npc!, def = SHOPS[n.job]!, st = this.shopState(n);
    const r = this.root!;
    r.innerHTML = '';
    const box = document.createElement('div'); box.className = 'dlg-box shop';
    const head = document.createElement('div'); head.className = 'dlg-who';
    head.innerHTML = `<b>${def.name} — ${n.name}</b><span>Your gold: ${this.hooks.gold()} · Shop gold: ${st.gold}</span>`;
    const cols = document.createElement('div'); cols.className = 'shop-cols';
    const list = (title: string, rows: [string, number, number, () => void, boolean][]) => {
      const c = document.createElement('div'); c.className = 'shop-col';
      const h = document.createElement('div'); h.className = 'inv-label'; h.textContent = title; c.appendChild(h);
      for (const [id, n2, price, fn, ok] of rows) {
        const row = document.createElement('div'); row.className = 'shop-row';
        const img = document.createElement('img'); img.src = iconUrl(id);
        const nm = document.createElement('span'); nm.textContent = `${ITEMS[id].name}${n2 > 1 ? ` ×${n2}` : ''}`; nm.style.color = RARITY_COLOR[ITEMS[id].rarity ?? 'common'];
        const b = document.createElement('button'); b.className = 'btn'; b.textContent = `${price} g`; b.disabled = !ok;
        b.addEventListener('click', () => { fn(); this.shop(); });
        row.append(img, nm, b); c.appendChild(row);
      }
      if (!rows.length) { const e = document.createElement('p'); e.className = 'hint'; e.textContent = 'Nothing.'; c.appendChild(e); }
      cols.appendChild(c);
    };
    list('FOR SALE', Object.entries(st.stock).filter(([, k]) => k > 0).map(([id, k]) => {
      const p = this.buyPrice(n, id);
      return [id, k, p, () => { if (this.inv.add(id, 1) === 0) { st.stock[id]--; this.hooks.addGold(-p); st.gold += p; } }, this.hooks.gold() >= p] as [string, number, number, () => void, boolean];
    }));
    const mine = [...new Set(this.inv.slots.filter(Boolean).map((s) => s!.id))].filter((id) => def.buys.includes(id) || ITEMS[id].cat === 'weapon' || ITEMS[id].cat === 'tool');
    list('SELL', mine.filter((id) => id !== 'staff').map((id) => {
      const p = this.sellPrice(n, id);
      return [id, this.inv.count(id), p, () => { this.inv.remove(id, 1); this.hooks.addGold(p); st.gold -= p; st.stock[id] = (st.stock[id] ?? 0) + 1; }, st.gold >= p && p > 0] as [string, number, number, () => void, boolean];
    }));
    const back = document.createElement('button'); back.className = 'btn'; back.textContent = 'Done';
    back.addEventListener('click', () => this.main(this.fill(pick(['Come again.', 'Pleasure doing business.', 'Mind how you go.']))));
    box.append(head, cols, back);
    r.appendChild(box);
  }
}

export const biomeName = (b: number) => BIOMES[b]?.name ?? 'wilds';
