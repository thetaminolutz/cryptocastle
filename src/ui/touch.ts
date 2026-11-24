import { GLYPH } from './glyphs';
// Touch controls: floating joystick (left thumb), drag-to-look (right side) and
// action buttons. Sizes respect settings; layout mirrors for left-handed players.
import { input, ButtonName } from '../engine/input';
import { settings } from '../engine/settings';

const capture = (el: Element, id: number) => { try { el.setPointerCapture(id); } catch { /* pointer already gone */ } };

interface BtnSpec { name: ButtonName; label: string; size: number; right: number; bottom: number; }

export class TouchControls {
  readonly layer: HTMLDivElement;
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private lookIds = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  /** a short tap on the camera side of the screen (e.g. to pick a target) */
  onTap: ((x: number, y: number) => void) | null = null;
  private buttons: HTMLDivElement[] = [];
  private byName = new Map<ButtonName, HTMLDivElement>();
  private labels = new Map<ButtonName, string>();
  private hidden = new Set<ButtonName>();

  constructor(parent: HTMLElement, private specs: BtnSpec[]) {
    this.layer = document.createElement('div');
    this.layer.style.cssText = 'position:absolute;inset:0;touch-action:none;';
    this.base = document.createElement('div'); this.base.className = 'joy-base';
    this.knob = document.createElement('div'); this.knob.className = 'joy-knob';
    this.layer.append(this.base, this.knob);
    parent.appendChild(this.layer);

    this.layer.addEventListener('pointerdown', (e) => this.onDown(e));
    this.layer.addEventListener('pointermove', (e) => this.onMove(e));
    this.layer.addEventListener('pointerup', (e) => this.onUp(e));
    this.layer.addEventListener('pointercancel', (e) => this.onUp(e));
    this.buildButtons();
    settings.onChange((_s, k) => { if (k === 'leftHanded' || k === 'joystickSize') this.buildButtons(); });
  }

  private buildButtons() {
    for (const b of this.buttons) b.remove();
    this.buttons = [];
    const left = settings.values.leftHanded;
    for (const s of this.specs) {
      const el = document.createElement('div');
      el.className = 'touch-btn';
      this.paint(el, s.name, this.labels.get(s.name) ?? s.label);
      el.style.display = this.hidden.has(s.name) ? 'none' : 'flex';
      this.byName.set(s.name, el);
      const side = left ? 'left' : 'right';
      el.style.cssText = `width:${s.size}px;height:${s.size}px;${side}:calc(${s.right}px + var(--sa${left ? 'l' : 'r'}));bottom:calc(${s.bottom}px + var(--sab));`;
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); capture(el, e.pointerId); el.classList.add('down'); input.press(s.name); });
      const up = (e: PointerEvent) => { e.stopPropagation(); el.classList.remove('down'); input.release(s.name); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      this.layer.appendChild(el);
      this.buttons.push(el);
      if (s.name === 'interact') el.classList.add('wide');
    }
  }

  setLabel(name: ButtonName, text: string) {
    if (this.labels.get(name) === text) return;
    this.labels.set(name, text);
    const el = this.byName.get(name); if (el) this.paint(el, name, text);
  }
  /** icon + small caption */
  private paint(el: HTMLElement, name: string, text: string) {
    const ico = name === 'attack' && /shoot/i.test(text) ? GLYPH.bow : GLYPH[name];
    el.innerHTML = ico ? `<span class="ico">${ico}</span><span class="cap">${text}</span>` : text;
  }
  setVisible(name: ButtonName, v: boolean) {
    if (v === !this.hidden.has(name)) return;
    if (v) this.hidden.delete(name); else { this.hidden.add(name); input.release(name); }
    const el = this.byName.get(name); if (el) { el.style.display = v ? 'flex' : 'none'; el.classList.remove('down'); }
  }

  private isJoySide(x: number) {
    const half = window.innerWidth * 0.45;
    return settings.values.leftHanded ? x > window.innerWidth - half : x < half;
  }

  private onDown(e: PointerEvent) {
    capture(this.layer, e.pointerId);
    if (e.pointerType !== 'mouse' && this.joyId === null && this.isJoySide(e.clientX)) {
      this.joyId = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      const r = settings.values.joystickSize;
      Object.assign(this.base.style, { display: 'block', width: `${r * 2}px`, height: `${r * 2}px`, left: `${e.clientX - r}px`, top: `${e.clientY - r}px` });
      Object.assign(this.knob.style, { display: 'block', width: `${r}px`, height: `${r}px` });
      this.placeKnob(e.clientX, e.clientY);
    } else {
      this.lookIds.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    }
  }

  private placeKnob(x: number, y: number) {
    const r = settings.values.joystickSize;
    let dx = x - this.joyOrigin.x, dy = y - this.joyOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > r) { dx *= r / len; dy *= r / len; }
    this.knob.style.left = `${this.joyOrigin.x + dx - r / 2}px`;
    this.knob.style.top = `${this.joyOrigin.y + dy - r / 2}px`;
    const mag = Math.min(1, len / r);
    const nx = len > 0 ? dx / Math.min(len, r) : 0, ny = len > 0 ? dy / Math.min(len, r) : 0;
    const dead = mag < 0.12 ? 0 : 1;
    input.setTouchMove(nx * mag * dead, -ny * mag * dead, len >= r * 0.98);
  }

  private onMove(e: PointerEvent) {
    if (e.pointerId === this.joyId) { this.placeKnob(e.clientX, e.clientY); return; }
    const last = this.lookIds.get(e.pointerId);
    if (last) {
      input.addLook(e.clientX - last.x, e.clientY - last.y);
      last.x = e.clientX; last.y = e.clientY;
    }
  }

  private onUp(e: PointerEvent) {
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.base.style.display = 'none';
      this.knob.style.display = 'none';
      input.setTouchMove(0, 0, false);
    }
    const l = this.lookIds.get(e.pointerId);
    if (l && e.type === 'pointerup' && performance.now() - l.t < 300 && Math.hypot(e.clientX - l.sx, e.clientY - l.sy) < 12) this.onTap?.(e.clientX, e.clientY);
    this.lookIds.delete(e.pointerId);
  }
}
