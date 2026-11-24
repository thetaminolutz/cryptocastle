// "How to play": a short, illustrated guide. Shown once before the first journey
// and always available from the menu (Pack → How to play, or Settings).
import { GLYPH } from './glyphs';

const CARDS: [string, string, string][] = [
  ['move', 'Walk and run', 'Put your left thumb anywhere on the left half and push. Push to the edge to run.'],
  ['look', 'Look around', 'Drag on the right half of the screen to turn the camera.'],
  ['interact', 'Use', 'When something is close — a person, a door, a chest, a plant — the hand button appears. Tap it.'],
  ['attack', 'Attack', 'Tap the sword to swing. Tap again quickly for a three-hit combo. Hold it for a heavy blow.'],
  ['block', 'Block and parry', 'Hold the shield to block. Press it just as a blow lands to parry and stagger the enemy.'],
  ['dodge', 'Dodge', 'Roll out of the way. You cannot be hit while rolling. Watch for red rings on the ground — they mean “move!”'],
  ['lock', 'Lock on', 'Tap an enemy to lock on. The camera follows it and your swings aim at it.'],
  ['jump', 'Jump, climb, swim', 'Tap to jump. Hold it facing a wall or a tree trunk to climb. In water, hold it to swim up.'],
  ['bow', 'Bows and wands', 'Hold a bow, crossbow or wand on your belt and tap the button to shoot at the enemy in front of you.'],
  ['menu', 'The menu', 'Top right. Your pack, gear, crafting, the map, your quests, the Codex and settings.'],
  ['build', 'Build', 'The hammer button opens build mode: walls, roofs, doors, beds, fires — even a whole cottage.'],
  ['map', 'Where to go', 'The parchment tag at the top left always tells you your next goal. The arrow points the way.']
];

export function renderGuide(host: HTMLElement) {
  host.innerHTML = '';
  const g = document.createElement('div'); g.className = 'guide';
  for (const [ico, title, text] of CARDS) {
    const c = document.createElement('div'); c.className = 'g-card';
    c.innerHTML = `<div class="g-ico">${GLYPH[ico] ?? ''}</div><b>${title}</b><span>${text}</span>`;
    g.appendChild(c);
  }
  host.appendChild(g);
}

/** a full-screen guide with a Begin button */
export function showGuide(parent: HTMLElement, onDone: () => void) {
  const root = document.createElement('div'); root.className = 'menu';
  const box = document.createElement('div'); box.className = 'menu-box panel'; box.style.height = 'auto'; box.style.maxHeight = '92vh'; box.style.padding = '18px';
  const h = document.createElement('h2'); h.textContent = 'How to play';
  const body = document.createElement('div'); body.style.overflowY = 'auto'; body.style.flex = '1';
  renderGuide(body);
  const ok = document.createElement('button'); ok.className = 'btn primary'; ok.textContent = 'I’m ready'; ok.style.marginTop = '14px'; ok.style.alignSelf = 'center';
  ok.onclick = () => { root.remove(); onDone(); };
  box.append(h, body, ok); root.appendChild(box); parent.appendChild(root);
}
