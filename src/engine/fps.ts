// FPS counter + automatic quality scaler.
import { settings } from './settings';

export class FrameStats {
  fps = 60;
  frameMs = 16.7;
  private frames = 0;
  private acc = 0;
  private lowTime = 0;
  private cooldown = 0;
  private el: HTMLDivElement;
  extra = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'fps';
    parent.appendChild(this.el);
    this.applyVisibility();
    settings.onChange((_s, k) => { if (k === 'showFps') this.applyVisibility(); });
  }

  private applyVisibility() { this.el.style.display = settings.values.showFps ? 'block' : 'none'; }

  /** dt in seconds of the real frame. */
  tick(dt: number) {
    this.frames++;
    this.acc += dt;
    this.frameMs = this.frameMs * 0.9 + dt * 1000 * 0.1;
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.frames = 0; this.acc = 0;
      if (settings.values.showFps) this.el.textContent = `${this.fps.toFixed(0)} FPS  ${this.frameMs.toFixed(1)}ms\n${this.extra}`;
    }
    this.autoScale(dt);
  }

  private autoScale(dt: number) {
    const s = settings.values;
    if (!s.autoQuality) { this.lowTime = 0; return; }
    if (this.cooldown > 0) { this.cooldown -= dt; return; }
    const threshold = s.fpsCap === 30 ? 27 : 45;
    if (this.fps < threshold) this.lowTime += dt; else this.lowTime = Math.max(0, this.lowTime - dt * 2);
    if (this.lowTime < 5) return;
    this.lowTime = 0;
    this.cooldown = 5;
    // Order: render scale → view distance → particles
    if (s.renderScale > 0.31) settings.set('renderScale', Math.round((s.renderScale - 0.05) * 100) / 100);
    else if (s.viewDistance > 4) settings.set('viewDistance', s.viewDistance - 1);
    else if (s.particles > 0.2) settings.set('particles', Math.round((s.particles - 0.2) * 10) / 10);
  }
}
