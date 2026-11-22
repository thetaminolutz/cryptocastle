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
  private last = '';

  constructor(parent: HTMLElement, onMenu: () => void, onView: () => void) {
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
    this.root.append(this.flash, this.top, bars, menu, view);
    parent.appendChild(this.root);
  }

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
    const life = (p.life / PLAYER_TUNING.lifeMax) * 100, st = (p.stamina / PLAYER_TUNING.staminaMax) * 100;
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
