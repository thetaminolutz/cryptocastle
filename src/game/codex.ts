// The Codex: bestiary, collections (herbarium, minerals, ancient coins, unique
// items, regions, biomes), lore pages and achievements.
import { ACHIEVEMENTS, AchState, HERBS, MINERALS, COINS, LORE } from '../data/achievements';
import { ENEMIES } from '../data/enemies';
import { ITEMS, RARITY_COLOR } from '../data/items';
import { UNIQUES } from '../data/gear';
import { iconUrl } from '../ui/icons';

export interface CodexSave { seen: string[]; lore: string[]; regions: string[]; biomes: string[]; ach: string[]; counters: Record<string, number>; rewards: string[]; }

const REWARDS: [string, string, string[], number][] = [
  ['herbs', 'Herbarium', HERBS, 150], ['minerals', 'Minerals', MINERALS, 200], ['coins', 'Ancient Coins', COINS, 400]
];

export class Codex {
  seen = new Set<string>();
  lore = new Set<string>();
  regions = new Set<string>();
  biomes = new Set<string>();
  ach = new Set<string>();
  rewards = new Set<string>();
  counters: Record<string, number> = {};

  load(d: CodexSave | undefined) {
    if (!d) return;
    this.seen = new Set(d.seen); this.lore = new Set(d.lore); this.regions = new Set(d.regions); this.biomes = new Set(d.biomes); this.ach = new Set(d.ach); this.counters = d.counters ?? {}; this.rewards = new Set(d.rewards ?? []);
  }
  serialize(): CodexSave { return { seen: [...this.seen], lore: [...this.lore], regions: [...this.regions], biomes: [...this.biomes], ach: [...this.ach], counters: this.counters, rewards: [...this.rewards] }; }

  inc(k: string, n = 1) { this.counters[k] = (this.counters[k] ?? 0) + n; }
  count(list: string[]) { return list.filter((x) => this.seen.has(x)).length; }
  get uniques() { return UNIQUES.filter((u) => this.seen.has(u)).length; }

  /** collection rewards for completed sets: returns [name, gold] when newly completed */
  collectionRewards(): [string, number][] {
    const out: [string, number][] = [];
    for (const [id, name, list, gold] of REWARDS) if (!this.rewards.has(id) && this.count(list) >= list.length) { this.rewards.add(id); out.push([name, gold]); }
    return out;
  }

  /** newly unlocked achievements */
  check(s: AchState): string[] {
    const out: string[] = [];
    for (const a of ACHIEVEMENTS) if (!this.ach.has(a.id) && a.check(s)) { this.ach.add(a.id); out.push(a.name); }
    return out;
  }

  render(host: HTMLElement, kills: Record<string, number>) {
    host.innerHTML = '';
    const tabs = document.createElement('div'); tabs.className = 'codex-tabs';
    const body = document.createElement('div'); body.className = 'codex-body';
    host.append(tabs, body);
    const sections: [string, () => void][] = [
      ['Bestiary', () => {
        const defs = Object.values(ENEMIES).filter((e) => e.xp > 0);
        const known = defs.filter((e) => kills[e.id]);
        body.innerHTML = `<p class="codex-sum">${known.length} / ${defs.length} creatures recorded</p>`;
        const grid = document.createElement('div'); grid.className = 'codex-grid';
        for (const e of defs) {
          const k = kills[e.id] ?? 0;
          const c = document.createElement('div'); c.className = 'codex-card' + (k ? '' : ' unknown');
          const weak = Object.entries(e.weak).filter(([, v]) => (v as number) > 1.05).map(([t]) => t).join(', ');
          const res = Object.entries(e.weak).filter(([, v]) => (v as number) < 0.95).map(([t]) => t).join(', ');
          c.innerHTML = k ? `<b>${e.name}${e.boss ? ' <em>boss</em>' : ''}</b><span>${e.desc}</span><small>Defeated: ${k}${weak ? ` · weak to ${weak}` : ''}${res ? ` · resists ${res}` : ''}</small>` : '<b>???</b><span>Not yet encountered.</span>';
          grid.appendChild(c);
        }
        body.appendChild(grid);
      }],
      ['Collections', () => {
        body.innerHTML = '';
        const set = (title: string, list: string[], reward?: number) => {
          const h = document.createElement('h3'); h.textContent = `${title} — ${this.count(list)} / ${list.length}${reward ? ` (complete for ${reward} gold)` : ''}`;
          const g = document.createElement('div'); g.className = 'codex-icons';
          for (const id of list) {
            const d = ITEMS[id]; const has = this.seen.has(id);
            const el = document.createElement('div'); el.className = 'codex-icon' + (has ? '' : ' unknown'); el.title = has ? d.name : '???';
            el.innerHTML = `<img src="${iconUrl(id)}"><span style="color:${has ? RARITY_COLOR[d.rarity ?? 'common'] : '#5a4a3a'}">${has ? d.name : '???'}</span>`;
            g.appendChild(el);
          }
          body.append(h, g);
        };
        set('Herbarium', HERBS, 150); set('Minerals', MINERALS, 200); set('Ancient coins', COINS, 400); set('Unique items', UNIQUES);
        const r = document.createElement('h3'); r.textContent = `Regions discovered — ${this.regions.size}`;
        const rl = document.createElement('p'); rl.className = 'codex-list'; rl.textContent = [...this.regions].join(' · ') || 'None yet.';
        const b = document.createElement('h3'); b.textContent = `Biomes visited — ${this.biomes.size}`;
        const bl = document.createElement('p'); bl.className = 'codex-list'; bl.textContent = [...this.biomes].join(' · ') || 'None yet.';
        body.append(r, rl, b, bl);
      }],
      ['Lore', () => {
        body.innerHTML = `<p class="codex-sum">${this.lore.size} / ${LORE.length} pages found — in dungeons, among the dead, in places nobody visits.</p>`;
        for (const l of LORE) {
          const c = document.createElement('div'); c.className = 'codex-card wide' + (this.lore.has(l.id) ? '' : ' unknown');
          c.innerHTML = this.lore.has(l.id) ? `<b>${l.title}</b><span>${l.text}</span>` : '<b>???</b><span>A missing page.</span>';
          body.appendChild(c);
        }
      }],
      ['Achievements', () => {
        body.innerHTML = `<p class="codex-sum">${this.ach.size} / ${ACHIEVEMENTS.length} achieved</p>`;
        const grid = document.createElement('div'); grid.className = 'codex-grid';
        for (const a of ACHIEVEMENTS) {
          const c = document.createElement('div'); c.className = 'codex-card' + (this.ach.has(a.id) ? ' got' : ' unknown');
          c.innerHTML = `<b>${this.ach.has(a.id) ? '★ ' : ''}${a.name}</b><span>${a.desc}</span>`;
          grid.appendChild(c);
        }
        body.appendChild(grid);
      }]
    ];
    sections.forEach(([name, fn], i) => {
      const b = document.createElement('button'); b.textContent = name; b.className = i === 0 ? 'on' : '';
      b.onclick = () => { tabs.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); fn(); };
      tabs.appendChild(b);
    });
    sections[0][1]();
  }
}
