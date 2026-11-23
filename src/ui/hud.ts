// Minimal HUD: life / stamina (/ breath) bars, gold, time of day + compass,
// menu and view buttons, and a red flash when hurt.
import type { Player } from '../entities/player';
import { PLAYER_TUNING } from '../entities/player';

export class Hud {
  readonly root: HTMLDivElement;
  private top: HTMLDivElement;
  private lifeFill: HTMLDivElement;
  private staminaFill: HTMLDivElement;
  private breathWrap: HTMLDivElement;
  private breathFill: HTMLDivElement;
  private gold: HTMLDivElement;
  private flash: HTMLDivElement;
  private banner: HTMLDivElement;
  private target: HTMLDivElement;
  private targetFill: HTMLDivElement;
  private targetName: HTMLDivElement;
  private statusRow: HTMLDivElement;
  private level: HTMLDivElement;
  readonly lockMark: HTMLDivElement;
  private bannerTimer = 0;
  private last = '';

  constructor(parent: HTMLElement, onMenu: () => void, onView: () => void, onBuild: () => void) {
    this.root = document.createElement('div');
    this.root.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    this.flash = document.createElement('div');
    this.flash.className = 'hurt-flash';
    this.top = document.createElement('div');
    this.top.className = 'hud-top';

    const bars = document.createElement('div');
    bars.className = 'hud-bars';
    const bar = (cls: string) => {
      const wrap = document.createElement('div'); wrap.className = `bar ${cls}`;
      const fill = document.createElement('div'); fill.className = 'fill';
      wrap.appendChild(fill); bars.appendChild(wrap);
      return [wrap, fill] as const;
    };
    this.lifeFill = bar('life')[1];
    this.staminaFill = bar('stamina')[1];
    [this.breathWrap, this.breathFill] = bar('breath');
    this.gold = document.createElement('div');
    this.gold.className = 'hud-gold';
    bars.appendChild(this.gold);

    const btn = (cls: string, text: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = cls; b.textContent = text; b.style.pointerEvents = 'auto';
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('pointerup', (e) => { e.stopPropagation(); fn(); });
      return b;
    };
    const menu = btn('menu-btn', '☰', onMenu);
    const view = btn('menu-btn view-btn', '◐', onView);
    const build = btn('menu-btn build-btn', '⚒', onBuild);
    this.target = document.createElement('div'); this.target.className = 'target-bar';
    this.targetName = document.createElement('div'); this.targetName.className = 'tname';
    const tb = document.createElement('div'); tb.className = 'bar life tbar';
    this.targetFill = document.createElement('div'); this.targetFill.className = 'fill'; tb.appendChild(this.targetFill);
    this.target.append(this.targetName, tb);
    this.statusRow = document.createElement('div'); this.statusRow.className = 'status-row';
    bars.appendChild(this.statusRow);
    this.level = document.createElement('div'); this.level.className = 'hud-level';
    bars.appendChild(this.level);
    this.lockMark = document.createElement('div'); this.lockMark.className = 'lock-mark';
    this.banner = document.createElement('div');
    this.banner.className = 'region-banner';
    const vignette = document.createElement('div');
    vignette.className = 'vignette';
    this.root.append(vignette, this.flash, this.banner, this.top, this.target, this.lockMark, bars, menu, view, build);
    parent.appendChild(this.root);
  }

  showRegion(name: string, subtitle: string) {
    this.banner.innerHTML = '';
    const t = document.createElement('span'); t.textContent = name;
    const sub = document.createElement('span'); sub.className = 'sub'; sub.textContent = subtitle;
    this.banner.append(t, sub);
    this.banner.style.opacity = '1';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => { this.banner.style.opacity = '0'; }, 4200);
  }

  setTarget(name: string | null, frac = 0, elite = false) {
    this.target.style.display = name ? 'block' : 'none';
    if (!name) return;
    this.targetName.textContent = elite ? `★ ${name}` : name;
    this.targetName.style.color = elite ? '#e8b030' : '#e8dcc0';
    this.targetFill.style.width = `${Math.max(0, frac) * 100}%`;
  }
  setStatus(list: [string, string][]) {
    const key = list.map((s) => s[0]).join();
    if (this.statusRow.dataset.k === key) return;
    this.statusRow.dataset.k = key;
    this.statusRow.innerHTML = '';
    for (const [t, c] of list) { const e = document.createElement('span'); e.textContent = t; e.style.borderColor = c; e.style.color = c; this.statusRow.appendChild(e); }
  }
  setLevel(level: number, frac: number) { this.level.textContent = `Lv ${level}`; this.level.style.setProperty('--xp', `${frac * 100}%`); }

  hurt() {
    this.flash.style.transition = 'none';
    this.flash.style.opacity = '0.55';
    requestAnimationFrame(() => { this.flash.style.transition = 'opacity 0.6s'; this.flash.style.opacity = '0'; });
  }

  update(hours: number, yaw: number, p: Player, gold: number) {
    const h = Math.floor(hours), m = Math.floor((hours - h) * 60);
    const deg = ((-yaw * 180) / Math.PI + 360 * 4) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const moon = hours < 5.5 || hours > 18.5 ? '☾' : '☀';
    const text = `${moon} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}   ◆ ${dirs[Math.round(deg / 45) % 8]}`;
    const life = (p.life / p.maxLife) * 100, st = (p.stamina / PLAYER_TUNING.staminaMax) * 100;
    const br = (p.breath / PLAYER_TUNING.breathMax) * 100;
    const key = `${text}|${life.toFixed(0)}|${st.toFixed(0)}|${br.toFixed(0)}|${gold}|${p.exhausted}`;
    if (key === this.last) return;
    this.last = key;
    this.top.textContent = text;
    this.lifeFill.style.width = `${life}%`;
    this.staminaFill.style.width = `${st}%`;
    this.staminaFill.style.opacity = p.exhausted ? '0.45' : '1';
    this.breathWrap.style.display = br < 99.5 ? 'block' : 'none';
    this.breathFill.style.width = `${br}%`;
    this.gold.textContent = `◉ ${gold}`;
  }
}
