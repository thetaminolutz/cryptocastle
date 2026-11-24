// Story scenes: a speaker, typed lines (tap to finish a line) and, at the end,
// optional choices. Used by the Stranger, the Herald and the endings.
import { audio } from '../engine/audio';

export interface SceneChoice { label: string; run: () => void; }
let current: HTMLDivElement | null = null;

export function sceneOpen() { return !!current; }

export function playScene(ui: HTMLElement, name: string, color: string, lines: string[], done: () => void = () => {}, choices?: SceneChoice[]) {
  current?.remove();
  const root = document.createElement('div'); root.className = 'dialogue scene';
  const box = document.createElement('div'); box.className = 'dlg-box';
  const who = document.createElement('div'); who.className = 'dlg-who'; who.innerHTML = `<b style="color:${color}">${name}</b>`;
  const text = document.createElement('div'); text.className = 'dlg-text';
  const opts = document.createElement('div'); opts.className = 'dlg-opts';
  box.append(who, text, opts); root.appendChild(box);
  ui.appendChild(root);
  current = root;
  audio.whisper();
  let i = 0, shown = 0, full = false;
  const finish = () => { root.remove(); if (current === root) current = null; };
  const renderOpts = () => {
    opts.innerHTML = '';
    const last = i >= lines.length - 1;
    if (last && choices?.length) {
      for (const c of choices) {
        const b = document.createElement('button'); b.className = 'btn dlg-opt'; b.textContent = c.label;
        b.addEventListener('click', () => { if (!full) { full = true; text.textContent = lines[i]; return; } if (root.dataset.chosen) return; root.dataset.chosen = '1'; finish(); c.run(); });
        opts.appendChild(b);
      }
      return;
    }
    const next = document.createElement('button'); next.className = 'btn dlg-opt'; next.style.textAlign = 'center';
    next.textContent = last ? 'Go' : 'Continue';
    next.addEventListener('click', () => {
      if (!full) { full = true; text.textContent = lines[i]; return; }
      i++;
      if (i >= lines.length) { finish(); done(); return; }
      show();
    });
    opts.appendChild(next);
  };
  const show = () => {
    const line = lines[i];
    shown = 0; full = false;
    renderOpts();
    const tick = () => { if (current !== root || full) return; shown += 2; text.textContent = line.slice(0, shown); if (shown < line.length) requestAnimationFrame(tick); else full = true; };
    tick();
  };
  text.addEventListener('pointerup', () => { full = true; text.textContent = lines[i]; });
  show();
}
