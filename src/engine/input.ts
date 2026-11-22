// Unified input state fed by touch controls (primary), keyboard/mouse and gamepad.
export type ButtonName = 'jump' | 'down' | 'attack' | 'block' | 'dodge' | 'interact' | 'skill' | 'menu';

export interface ButtonState { down: boolean; pressed: boolean; released: boolean; held: number; }

class InputState {
  /** x = strafe right, y = forward. Magnitude 0..1. */
  move = { x: 0, y: 0 };
  sprint = false;
  lookDX = 0;
  lookDY = 0;
  private buttons = new Map<ButtonName, ButtonState>();
  private keys = new Set<string>();
  private touchMove = { x: 0, y: 0, sprint: false };

  button(name: ButtonName): ButtonState {
    let b = this.buttons.get(name);
    if (!b) { b = { down: false, pressed: false, released: false, held: 0 }; this.buttons.set(name, b); }
    return b;
  }
  press(name: ButtonName) { const b = this.button(name); if (!b.down) { b.down = true; b.pressed = true; b.held = 0; } }
  release(name: ButtonName) { const b = this.button(name); if (b.down) { b.down = false; b.released = true; } }

  setTouchMove(x: number, y: number, sprint: boolean) { this.touchMove.x = x; this.touchMove.y = y; this.touchMove.sprint = sprint; }
  addLook(dx: number, dy: number) { this.lookDX += dx; this.lookDY += dy; }

  attachKeyboard() {
    const map: Record<string, ButtonName> = { Space: 'jump', KeyC: 'down', ControlLeft: 'down', KeyF: 'attack', KeyR: 'block', KeyQ: 'dodge', KeyE: 'interact', Tab: 'skill', Escape: 'menu' };
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      this.keys.add(e.code);
      const b = map[e.code];
      if (b) { this.press(b); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const b = map[e.code];
      if (b) this.release(b);
    });
    window.addEventListener('blur', () => { this.keys.clear(); for (const n of this.buttons.keys()) this.release(n); });
  }

  /** Merge sources; call once per frame before game logic. */
  poll(dt: number) {
    let kx = 0, ky = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    const kl = Math.hypot(kx, ky);
    if (kl > 0) { this.move.x = kx / kl; this.move.y = ky / kl; this.sprint = this.keys.has('ShiftLeft'); }
    else { this.move.x = this.touchMove.x; this.move.y = this.touchMove.y; this.sprint = this.touchMove.sprint; }
    this.pollGamepad();
    for (const b of this.buttons.values()) if (b.down) b.held += dt;
  }

  private padPrev: boolean[] = [];
  private pollGamepad() {
    const pads = navigator.getGamepads?.();
    const p = pads && Array.from(pads).find((g) => g);
    if (!p) return;
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    const lx = dz(p.axes[0] ?? 0), ly = dz(p.axes[1] ?? 0);
    if (lx || ly) { this.move.x = lx; this.move.y = -ly; this.sprint = !!p.buttons[10]?.pressed; }
    this.addLook(dz(p.axes[2] ?? 0) * 12, dz(p.axes[3] ?? 0) * 12);
    const map: [number, ButtonName][] = [[0, 'jump'], [2, 'attack'], [1, 'dodge'], [3, 'interact'], [4, 'block'], [5, 'skill'], [9, 'menu'], [6, 'down']];
    for (const [i, name] of map) {
      const now = !!p.buttons[i]?.pressed;
      if (now && !this.padPrev[i]) this.press(name);
      if (!now && this.padPrev[i]) this.release(name);
      this.padPrev[i] = now;
    }
  }

  /** Clear per-frame edges; call at the end of each frame. */
  endFrame() {
    this.lookDX = 0; this.lookDY = 0;
    for (const b of this.buttons.values()) { b.pressed = false; b.released = false; }
  }
}

export const input = new InputState();
