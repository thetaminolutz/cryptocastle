import { saves, SaveData, formatPlayTime } from '../engine/save';
// Opening screens: "Enter. Or turn back." and the title screen.
const ui = () => document.getElementById('ui')!;

function button(text: string, primary: boolean, onTap: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = primary ? 'btn primary' : 'btn';
  b.textContent = text;
  b.addEventListener('click', onTap);
  return b;
}

export function showTitle(onBegin: () => void) {
  const s = document.createElement('div');
  s.className = 'screen';
  s.style.background = 'radial-gradient(ellipse at 50% 120%, #3a0a10 0%, #0a0608 55%, #000 100%)';
  const logo = document.createElement('div'); logo.className = 'title-logo'; logo.textContent = 'DUSKMERE';
  const sub = document.createElement('div'); sub.className = 'title-sub'; sub.textContent = 'SOMETHING IS WATCHING';
  const row = document.createElement('div'); row.className = 'row';
  row.append(button('Begin', true, () => { s.remove(); onBegin(); }));
  s.append(logo, sub, row);
  ui().appendChild(s);
}

export function showEnter(onEnter: () => void, onTurnBack: () => void) {
  const s = document.createElement('div');
  s.className = 'screen';
  const t = document.createElement('div'); t.className = 'enter-text'; t.textContent = 'Enter. Or turn back.';
  const row = document.createElement('div'); row.className = 'row';
  row.append(
    button('Enter', true, () => { s.remove(); onEnter(); }),
    button('Turn back', false, () => { s.remove(); onTurnBack(); })
  );
  s.append(t, row);
  ui().appendChild(s);
}


/** Save slots: continue, start new, export, delete, import. */
export async function showSlots(onPlay: (slot: number, data: SaveData | null) => void, onBack: () => void) {
  const s = document.createElement('div');
  s.className = 'screen';
  s.style.background = 'radial-gradient(ellipse at 50% 120%, #2a080c 0%, #0a0608 55%, #000 100%)';
  const title = document.createElement('div'); title.className = 'title-sub'; title.textContent = 'CHOOSE YOUR FATE';
  const row = document.createElement('div'); row.className = 'row';
  const list = await saves.list();
  list.forEach((d, i) => {
    const card = document.createElement('div'); card.className = 'slot-card';
    const h = document.createElement('h3'); h.textContent = `JOURNEY ${i + 1}`;
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.textContent = d ? `Day ${d.day + 1} · ${formatPlayTime(d.playTime)} played\nSeed ${d.seed} · ${new Date(d.updated).toLocaleDateString()}` : 'An empty path.';
    meta.style.whiteSpace = 'pre-line';
    card.append(h, meta);
    card.appendChild(button(d ? 'Continue' : 'New journey', true, () => { s.remove(); onPlay(i, d); }));
    if (d) {
      card.appendChild(button('Export file', false, () => saves.exportFile(d)));
      card.appendChild(button('Delete', false, async () => {
        if (!confirm(`Delete journey ${i + 1}? This cannot be undone.`)) return;
        await saves.remove(i); s.remove(); showSlots(onPlay, onBack);
      }));
    }
    row.appendChild(card);
  });
  const bottom = document.createElement('div'); bottom.className = 'row';
  bottom.append(
    button('Import save file', false, async () => {
      const d = await saves.importFile();
      if (!d) { alert('That file is not a Duskmere save.'); return; }
      const cur = await saves.list();
      let slot = cur.findIndex((x) => !x);
      if (slot < 0) { slot = Number(prompt('All slots are full. Overwrite which journey? (1-3)', '1')) - 1; if (!(slot >= 0 && slot < 3)) return; }
      d.slot = slot; await saves.write(d); s.remove(); showSlots(onPlay, onBack);
    }),
    button('Back', false, () => { s.remove(); onBack(); })
  );
  s.append(title, row, bottom);
  s.style.overflowY = 'auto';
  ui().appendChild(s);
}

/** Choose the rule of the journey: Wanderer (normal) or One Life (permanent death). */
export function showModeSelect(onPick: (mode: 'wanderer' | 'onelife') => void, onBack: () => void) {
  const s = document.createElement('div');
  s.className = 'screen';
  const t = document.createElement('div'); t.className = 'title-sub'; t.textContent = 'THE RULE OF YOUR JOURNEY';
  const row = document.createElement('div'); row.className = 'row';
  const card = (title: string, text: string, color: string, fn: () => void) => {
    const c = document.createElement('div'); c.className = 'mode-card';
    const h = document.createElement('h3'); h.textContent = title; h.style.color = color;
    const p = document.createElement('p'); p.textContent = text;
    c.append(h, p, button('Choose', true, fn));
    row.appendChild(c);
  };
  card('WANDERER', 'When you fall, you wake at your bed or the last safe place. You lose some gold, and your pack stays where you died — go back and recover it.', '#d8a93a', () => { s.remove(); onPick('wanderer'); });
  card('ONE LIFE', 'You only get one chance. If this character dies, they are gone forever, and a gravestone in the Cemetery of the Fallen will remember how.', '#e0242e', () => {
    if (!confirm('One Life: when you die, this character and save are gone for good. Are you sure?')) return;
    if (!confirm('Truly? There is no turning back.')) return;
    s.remove(); onPick('onelife');
  });
  s.append(t, row, button('Back', false, () => { s.remove(); onBack(); }));
  ui().appendChild(s);
}

/** Full-screen death message. */
export function showDeath(title: string, text: string, buttonLabel: string, onOk: () => void) {
  const d = document.createElement('div');
  d.className = 'death';
  const h = document.createElement('h1'); h.textContent = title;
  const p = document.createElement('p'); p.textContent = text;
  d.append(h, p, button(buttonLabel, true, () => { d.remove(); onOk(); }));
  ui().appendChild(d);
}
