// Contextual tutorial hints: each appears once, the first time it is useful, as a
// small card that can be dismissed. Stored per device (they are about the
// controls, not the save), and they can be switched off in Settings.
import { settings } from '../engine/settings';
import type { Game } from './game';

interface Hint { id: string; text: string; when: (g: Game) => boolean; }

const HINTS: Hint[] = [
  { id: 'move', text: 'Push the left half of the screen to walk — push to the edge to run. Drag on the right half to look around.', when: () => true },
  { id: 'objective', text: 'The line at the top left is your current goal. The arrow points the way.', when: (g) => g.story.step === 'wake' && g.elapsedTime > 12 },
  { id: 'use', text: 'When something is in reach, a “Use” button appears on the right. Tap it to talk, open, read or pick up.', when: (g) => g.useVisible },
  { id: 'enemy', text: 'Enemies! Tap one to lock on. Strike, hold Block to raise your guard — block just as a blow lands to parry. Dodge rolls through attacks.', when: (g) => g.creatures.alive.some((c) => c.alerted && c.pos.distanceTo(g.player.pos) < 20) },
  { id: 'stamina', text: 'The blue bar is stamina: running, swinging, blocking and rolling use it. Stop for a moment to catch your breath.', when: (g) => g.player.stamina < g.player.tune.staminaMax * 0.2 },
  { id: 'hurt', text: 'Wounded? Eat food or use bandages from your belt (tap a belt slot, then Use). Life also returns slowly when you rest.', when: (g) => g.player.life < g.player.maxLife * 0.45 },
  { id: 'night', text: 'Night falls. Monsters grow bolder in the dark. Light a torch, find a village — or build a bed and a fire of your own.', when: (g) => g.sky.isNight && g.story.step === 'free' },
  { id: 'gather', text: 'Hold Strike to chop trees, mine rock and dig earth. A better tool is faster — and some stone needs a better pickaxe.', when: (g) => g.story.step === 'free' && g.elapsedTime > 60 },
  { id: 'craft', text: 'Open the menu (☰) → Craft to turn what you gather into tools, weapons, armour and buildings. Some recipes need a workbench, furnace or anvil nearby.', when: (g) => g.inventory.count('log') + g.inventory.count('stone') >= 4 },
  { id: 'build', text: 'The ⚒ button opens build mode: place walls, floors, roofs, doors and furniture — or a whole blueprint, then gather to finish it.', when: (g) => g.inventory.count('planks') >= 6 },
  { id: 'gear', text: 'You found something to wear. Menu → Gear shows what you have on. Armour is visible on you and sets give bonuses.', when: (g) => g.inventory.slots.some((s) => s && g.isWearable(s.id)) },
  { id: 'village', text: 'A village. Talk to people: they remember how you treat them. Trade, find work, rent a room at the inn.', when: (g) => g.inVillage },
  { id: 'journal', text: 'Menu → Journal lists your quests. Tap one to track it; the Map shows where to go and what you have explored.', when: (g) => g.quests.active().length >= 2 },
  { id: 'waystone', text: 'Waystones glow blue. Touch one to attune it — then travel between attuned waystones for a little gold.', when: (g) => g.map.waystones.size > 0 },
  { id: 'dungeon', text: 'A dungeon. Its rooms wake as you enter them, the boss waits at the bottom — and a cracked wall may hide something. Dig.', when: (g) => !!g.delves.current() },
  { id: 'wish', text: 'A wish shard! Tap it in your pack and choose “Call the Herald” to make a wish. Some wishes have a price.', when: (g) => g.inventory.count('wish_shard') > 0 },
  { id: 'boss', text: 'A boss. Watch for the red ring on the ground — it is about to slam. Roll out of it.', when: (g) => g.creatures.alive.some((c) => c.def.boss && c.alerted && c.pos.distanceTo(g.player.pos) < 30) },
  { id: 'swim', text: 'In water, hold Jump to swim up. Watch your breath when you dive.', when: (g) => g.player.inWater },
  { id: 'codex', text: 'Menu → Codex keeps your bestiary, collections, lore pages and achievements.', when: (g) => Object.keys(g.creatures.kills).length >= 3 }
];

const KEY = 'duskmere.hints.v1';

export class Hints {
  private seen: Set<string>;
  private el: HTMLDivElement;
  private showing: string | null = null;
  private timer = 0;
  private hideT = 0;

  constructor(parent: HTMLElement, private g: Game) {
    let s: string[] = [];
    try { s = JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { /* private mode */ }
    this.seen = new Set(s);
    this.el = document.createElement('div'); this.el.className = 'hint-card';
    this.el.addEventListener('pointerup', (e) => { e.stopPropagation(); this.hide(); });
    parent.appendChild(this.el);
  }

  private hide() { this.el.classList.remove('on'); this.showing = null; }

  update(dt: number) {
    if (this.showing) { this.hideT -= dt; if (this.hideT <= 0) this.hide(); return; }
    this.timer -= dt;
    if (this.timer > 0 || !settings.values.hints) return;
    this.timer = 1;
    if (this.g.dialogOpen) return;
    for (const h of HINTS) {
      if (this.seen.has(h.id)) continue;
      let ok = false;
      try { ok = h.when(this.g); } catch { ok = false; }
      if (!ok) continue;
      this.seen.add(h.id);
      try { localStorage.setItem(KEY, JSON.stringify([...this.seen])); } catch { /* ignore */ }
      this.showing = h.id; this.hideT = 11;
      this.el.innerHTML = `<b>Hint</b>${h.text}<small>tap to dismiss</small>`;
      this.el.classList.add('on');
      return;
    }
  }
}
