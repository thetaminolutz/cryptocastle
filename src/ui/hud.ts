// Minimal HUD: time of day + compass along the top, menu button in the corner.
export class Hud {
  readonly root: HTMLDivElement;
  private top: HTMLDivElement;
  readonly menuBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, onMenu: () => void) {
    this.root = document.createElement('div');
    this.root.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    this.top = document.createElement('div');
    this.top.className = 'hud-top';
    this.menuBtn = document.createElement('button');
    this.menuBtn.className = 'menu-btn';
    this.menuBtn.textContent = '☰';
    this.menuBtn.style.pointerEvents = 'auto';
    this.menuBtn.addEventListener('pointerup', (e) => { e.stopPropagation(); onMenu(); });
    this.menuBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.append(this.top, this.menuBtn);
    parent.appendChild(this.root);
  }

  update(hours: number, yaw: number) {
    const h = Math.floor(hours), m = Math.floor((hours - h) * 60);
    const deg = ((-yaw * 180) / Math.PI + 360 * 4) % 360; // 0 = north (-z)
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const dir = dirs[Math.round(deg / 45) % 8];
    const moon = hours < 5.5 || hours > 18.5 ? '☾' : '☀';
    const text = `${moon} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}   ◆ ${dir}`;
    if (this.top.textContent !== text) this.top.textContent = text;
  }
}
