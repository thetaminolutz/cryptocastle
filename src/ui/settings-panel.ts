// Settings menu (touch friendly). Reachable from the HUD menu button.
import { settings, Settings, QualityPreset } from '../engine/settings';
import { isStandalone } from '../engine/pwa';

type Row =
  | { kind: 'select'; key: keyof Settings; label: string; options: [string, string][] }
  | { kind: 'range'; key: keyof Settings; label: string; min: number; max: number; step: number }
  | { kind: 'toggle'; key: keyof Settings; label: string };

const ROWS: Row[] = [
  { kind: 'select', key: 'quality', label: 'Quality preset', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
  { kind: 'range', key: 'viewDistance', label: 'View distance (chunks)', min: 4, max: 10, step: 1 },
  { kind: 'range', key: 'renderScale', label: 'Render scale', min: 0.35, max: 1, step: 0.05 },
  { kind: 'select', key: 'shadows', label: 'Shadows', options: [['0', 'Off'], ['1', 'Medium'], ['2', 'High']] },
  { kind: 'select', key: 'vegetation', label: 'Grass & plants', options: [['0', 'Low'], ['1', 'Medium'], ['2', 'High']] },
  { kind: 'range', key: 'particles', label: 'Weather particles', min: 0, max: 1, step: 0.1 },
  { kind: 'toggle', key: 'pixelLook', label: 'Retro pixel look' },
  { kind: 'select', key: 'fpsCap', label: 'FPS cap', options: [['60', '60'], ['30', '30']] },
  { kind: 'toggle', key: 'autoQuality', label: 'Auto quality (heat / FPS)' },
  { kind: 'toggle', key: 'showFps', label: 'Show FPS counter' },
  { kind: 'range', key: 'masterVolume', label: 'Master volume', min: 0, max: 1, step: 0.05 },
  { kind: 'range', key: 'musicVolume', label: 'Music volume', min: 0, max: 1, step: 0.05 },
  { kind: 'range', key: 'sfxVolume', label: 'Effects volume', min: 0, max: 1, step: 0.05 },
  { kind: 'range', key: 'ambienceVolume', label: 'Ambience volume', min: 0, max: 1, step: 0.05 },
  { kind: 'range', key: 'joystickSize', label: 'Joystick size', min: 50, max: 110, step: 5 },
  { kind: 'range', key: 'cameraSensitivity', label: 'Camera sensitivity', min: 0.3, max: 2.5, step: 0.1 },
  { kind: 'toggle', key: 'invertY', label: 'Invert Y' },
  { kind: 'toggle', key: 'leftHanded', label: 'Left-handed layout' }
];

export function openSettings(parent: HTMLElement, onClose: () => void) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.width = 'min(640px, 92vw)';
  const h = document.createElement('h2');
  h.textContent = 'SETTINGS';
  panel.appendChild(h);

  const refreshers: (() => void)[] = [];
  for (const row of ROWS) {
    const r = document.createElement('div');
    r.className = 'set-row';
    const label = document.createElement('label');
    label.textContent = row.label;
    r.appendChild(label);
    const v = settings.values as unknown as Record<string, unknown>;
    if (row.kind === 'select') {
      const sel = document.createElement('select');
      for (const [val, text] of row.options) {
        const o = document.createElement('option'); o.value = val; o.textContent = text; sel.appendChild(o);
      }
      sel.addEventListener('change', () => {
        if (row.key === 'quality') settings.applyPreset(sel.value as QualityPreset);
        else settings.set(row.key, Number(sel.value) as never);
        refreshers.forEach((f) => f());
      });
      refreshers.push(() => { sel.value = String(v[row.key]); });
      r.appendChild(sel);
    } else if (row.kind === 'range') {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;gap:10px';
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = String(row.min); inp.max = String(row.max); inp.step = String(row.step);
      const out = document.createElement('span'); out.style.minWidth = '44px';
      inp.addEventListener('input', () => {
        settings.set(row.key, Number(inp.value) as never);
        out.textContent = inp.value;
      });
      refreshers.push(() => { inp.value = String(v[row.key]); out.textContent = String(v[row.key]); });
      wrap.append(inp, out);
      r.appendChild(wrap);
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.minWidth = '110px'; btn.style.minHeight = '48px'; btn.style.fontSize = '16px';
      btn.addEventListener('click', () => { settings.set(row.key, !v[row.key] as never); refreshers.forEach((f) => f()); });
      refreshers.push(() => { btn.textContent = v[row.key] ? 'On' : 'Off'; });
      r.appendChild(btn);
    }
    panel.appendChild(r);
  }
  refreshers.forEach((f) => f());

  const note = document.createElement('p');
  note.className = 'hint';
  note.style.textAlign = 'left';
  note.textContent = isStandalone()
    ? 'Running from the Home Screen – saves are kept safely.'
    : 'Tip: in Safari tap Share → "Add to Home Screen". iOS may delete saves of websites that are not installed.';
  panel.appendChild(note);

  const close = document.createElement('button');
  close.className = 'btn primary';
  close.textContent = 'Close';
  close.addEventListener('click', () => { overlay.remove(); onClose(); });
  panel.appendChild(close);

  overlay.appendChild(panel);
  parent.appendChild(overlay);
}
