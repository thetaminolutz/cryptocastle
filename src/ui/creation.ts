// The seven copper tablets of the First Rite: each opens one step of character creation.
// 0 gender · 1 race · 2 appearance (copper mirror, live preview) · 3 calling · 4 abilities
// 5 the oath · 6 the rusty chest (weapon & shield) · 7 the Naming Gnome.
import {
  RACES, CALLINGS, ABILITIES, ABILITY_PICKS, EXCLUSIONS, HAIR_COLORS, CLOTH_COLORS, HAIR_STYLES,
  GNOME_SILLY, GNOME_DARK, PLAIN_NAMES, GNOME_RUDE, Profile, AbilityId, Look
} from '../data/character';
import { ITEMS } from '../data/items';

export interface CreationHooks {
  preview(look: Look | null): void;
  give(id: string, n: number): void;
  toast(t: string, c?: string): void;
  close(): void;
}

const TITLES = ['The First Tablet — Body', 'The Second Tablet — Blood', 'The Third Tablet — Face', 'The Fourth Tablet — Calling', 'The Fifth Tablet — Gifts', 'The Sixth Tablet — Oath', 'The Rusty Chest', 'The Seventh Tablet — Name'];

export interface CreationCtx { mode: 'wanderer' | 'onelife'; }
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function openCreation(ui: HTMLElement, step: number, prof: Profile, ctx: CreationCtx, hooks: CreationHooks, done: () => void) {
  const root = document.createElement('div'); root.className = 'creation';
  const panel = document.createElement('div'); panel.className = 'panel creation-panel';
  const h = document.createElement('h2'); h.textContent = TITLES[step];
  const body = document.createElement('div'); body.className = 'cr-body';
  const foot = document.createElement('div'); foot.className = 'cr-foot';
  const ok = document.createElement('button'); ok.className = 'btn primary'; ok.textContent = 'Engrave';
  const later = document.createElement('button'); later.className = 'btn'; later.textContent = 'Step back';
  foot.append(later, ok);
  panel.append(h, body, foot); root.appendChild(panel); ui.appendChild(root);
  const look = prof.look;
  const close = (commit: boolean) => {
    root.remove();
    if (step === 2) hooks.preview(null);
    hooks.close();
    if (commit) done();
  };
  later.onclick = () => close(false);

  const row = (label: string, el: HTMLElement) => { const r = document.createElement('div'); r.className = 'cr-row'; const l = document.createElement('label'); l.textContent = label; r.append(l, el); body.appendChild(r); return r; };
  const choices = <T,>(opts: { v: T; label: string; sub?: string; color?: string }[], cur: () => T, set: (v: T) => void, cards = false) => {
    const box = document.createElement('div'); box.className = cards ? 'cr-cards' : 'cr-chips';
    const btns: HTMLButtonElement[] = [];
    const sync = () => btns.forEach((b, i) => b.classList.toggle('on', opts[i].v === cur()));
    for (const o of opts) {
      const b = document.createElement('button'); b.className = cards ? 'cr-card' : 'cr-chip';
      if (o.color) { b.style.background = o.color; b.title = o.label; b.classList.add('swatch'); }
      else b.innerHTML = cards ? `<b>${o.label}</b><span>${o.sub ?? ''}</span>` : o.label;
      b.onclick = () => { set(o.v); sync(); };
      btns.push(b); box.appendChild(b);
    }
    sync();
    return box;
  };
  const slider = (get: () => number, set: (v: number) => void) => {
    const s = document.createElement('input'); s.type = 'range'; s.min = '0'; s.max = '1'; s.step = '0.05'; s.value = String(get());
    s.oninput = () => { set(+s.value); upd(); };
    return s;
  };
  const upd = () => { if (step === 2) hooks.preview({ ...look }); };
  const intro = (t: string) => { const p = document.createElement('p'); p.className = 'cr-intro'; p.textContent = t; body.appendChild(p); };

  switch (step) {
    case 0: {
      intro('The copper is green with age. Two figures are etched into it, worn smooth by many hands. Touch one.');
      body.appendChild(choices([{ v: 'male' as const, label: 'Man', sub: 'Broad of shoulder.' }, { v: 'female' as const, label: 'Woman', sub: 'Lighter of frame.' }], () => look.gender, (v) => { look.gender = v; }, true));
      break;
    }
    case 1: {
      intro('Eight peoples are engraved here, each with a gift and a burden.');
      const info = document.createElement('p'); info.className = 'cr-info';
      const show = () => { const r = RACES.find((x) => x.id === look.race)!; info.innerHTML = `<b>${r.name}</b> — ${r.desc}<br><i>${r.trait}</i>`; };
      body.appendChild(choices(RACES.map((r) => ({ v: r.id, label: r.name, sub: r.desc })), () => look.race, (v) => { look.race = v; prof.race = v; look.skin = 0; if (v === 'dwarf' && look.gender === 'male') look.beard = true; show(); }, true));
      body.appendChild(info); show();
      break;
    }
    case 2: {
      intro('A polished copper mirror. For the first time, a face looks back — and you may shape it.');
      const race = RACES.find((r) => r.id === look.race)!;
      row('Skin', choices(race.skin.map((c, i) => ({ v: i, label: `Tone ${i + 1}`, color: hex(c) })), () => look.skin, (v) => { look.skin = v; upd(); }));
      row('Hair', choices(HAIR_STYLES.map((n, i) => ({ v: i, label: n })), () => look.hairStyle, (v) => { look.hairStyle = v; upd(); }));
      row('Hair colour', choices(HAIR_COLORS.map((c, i) => ({ v: i, label: '', color: hex(c) })), () => look.hairColor, (v) => { look.hairColor = v; upd(); }));
      row('Beard', choices([{ v: false, label: 'None' }, { v: true, label: 'Beard' }], () => look.beard, (v) => { look.beard = v; upd(); }));
      row('Eyes', slider(() => look.eyeSize, (v) => { look.eyeSize = v; }));
      row('Brows', slider(() => look.brows, (v) => { look.brows = v; }));
      row('Nose', slider(() => look.nose, (v) => { look.nose = v; }));
      row('Mouth', slider(() => look.mouth, (v) => { look.mouth = v; }));
      row('Cheeks', slider(() => look.cheeks, (v) => { look.cheeks = v; }));
      row('Scars', choices([{ v: false, label: 'Unmarked' }, { v: true, label: 'Scarred' }], () => look.scars, (v) => { look.scars = v; upd(); }));
      row('Jacket', choices(CLOTH_COLORS.map((c, i) => ({ v: i, label: '', color: hex(c) })), () => look.jacket, (v) => { look.jacket = v; upd(); }));
      row('Trousers', choices(CLOTH_COLORS.map((c, i) => ({ v: i, label: '', color: hex(c) })), () => look.trousers, (v) => { look.trousers = v; upd(); }));
      row('Boots', choices(CLOTH_COLORS.slice(0, 6).map((c, i) => ({ v: i, label: '', color: hex(c) })), () => look.boots, (v) => { look.boots = v; upd(); }));
      row('Head', choices([{ v: 0 as const, label: 'Bare' }, { v: 1 as const, label: 'Hood' }, { v: 2 as const, label: 'Cap' }], () => look.headwear, (v) => { look.headwear = v; upd(); }));
      upd();
      break;
    }
    case 3: {
      intro('How will you walk this world? The fourth tablet shows eight paths.');
      const info = document.createElement('p'); info.className = 'cr-info';
      const show = () => { const c = CALLINGS.find((x) => x.id === prof.calling)!; info.innerHTML = `<b>${c.name}</b> — ${c.desc}<br><i>Paths: ${c.branches.join(' · ')}</i>`; };
      body.appendChild(choices(CALLINGS.map((c) => ({ v: c.id, label: c.name, sub: c.desc })), () => prof.calling, (v) => { prof.calling = v; show(); }, true));
      body.appendChild(info); show();
      break;
    }
    case 4: {
      intro(`Choose ${ABILITY_PICKS} gifts. Some gifts refuse to share a soul.`);
      const sel = new Set<AbilityId>(prof.abilities);
      const count = document.createElement('p'); count.className = 'cr-info';
      const grid = document.createElement('div'); grid.className = 'cr-cards abil';
      const btns = new Map<AbilityId, HTMLButtonElement>();
      const blocked = (id: AbilityId) => EXCLUSIONS.some(([a, b]) => (a === id && sel.has(b)) || (b === id && sel.has(a)));
      const sync = () => {
        for (const [id, b] of btns) { b.classList.toggle('on', sel.has(id)); b.disabled = !sel.has(id) && (blocked(id) || sel.size >= ABILITY_PICKS); }
        count.textContent = `${sel.size} / ${ABILITY_PICKS} chosen`;
        ok.disabled = sel.size !== ABILITY_PICKS;
      };
      for (const a of ABILITIES) {
        const b = document.createElement('button'); b.className = 'cr-card';
        const ex = EXCLUSIONS.find(([x, y]) => x === a.id || y === a.id);
        const other = ex ? ABILITIES.find((q) => q.id === (ex[0] === a.id ? ex[1] : ex[0]))!.name : '';
        b.innerHTML = `<b>${a.name}</b><span>${a.desc}${other ? `<br><em>Not with ${other}</em>` : ''}</span>`;
        b.onclick = () => { if (sel.has(a.id)) sel.delete(a.id); else if (!blocked(a.id) && sel.size < ABILITY_PICKS) sel.add(a.id); prof.abilities = [...sel]; sync(); };
        btns.set(a.id, b); grid.appendChild(b);
      }
      body.append(count, grid);
      sync();
      break;
    }
    case 5: {
      intro('The sixth tablet is not like the others. Its letters are fresh, and they are addressed to you.');
      const t = document.createElement('div'); t.className = 'cr-oath';
      t.innerHTML = `<p>I. When the Herald calls, you will come.</p><p>II. You will speak of the Herald to no one.</p><p>III. What is broken will be punished.</p><p>IV. The Cathedral remembers every name.</p><p class="cr-mode">${ctx.mode === 'onelife' ? 'Your path: <b>One Life</b>. If you fall, you fall forever.' : 'Your path: <b>Wanderer</b>. If you fall, you will wake again — poorer.'}</p>`;
      body.appendChild(t);
      ok.textContent = 'Press your hand to it';
      break;
    }
    case 6: {
      intro('The chest’s hinges shriek. Inside, wrapped in rotten cloth: the tools of your calling, and a few others. Take one weapon.');
      const cal = CALLINGS.find((c) => c.id === prof.calling)!;
      const weapons = ['rusty_sword', 'club', 'flint_spear', 'stone_knife', 'staff'];
      let w = cal.gear.find(([id]) => weapons.includes(id))?.[0] ?? 'rusty_sword';
      let shield = cal.gear.some(([id]) => id === 'wooden_shield');
      row('Weapon', choices(weapons.map((id) => ({ v: id, label: ITEMS[id].name })), () => w, (v) => { w = v; }));
      row('Shield', choices([{ v: true, label: ITEMS.wooden_shield.name }, { v: false, label: 'No shield' }], () => shield, (v) => { shield = v; }));
      const extra = cal.gear.filter(([id]) => !weapons.includes(id) && id !== 'wooden_shield');
      if (extra.length) intro(`Also for a ${cal.name}: ${extra.map(([id, n]) => `${n}× ${ITEMS[id].name}`).join(', ')}.`);
      ok.textContent = 'Take';
      ok.onclick = () => {
        if (w !== 'staff') hooks.give(w, 1);
        if (shield) hooks.give('wooden_shield', 1);
        for (const [id, n] of extra) hooks.give(id, n);
        hooks.toast('You take what the chest offers.', '#e8d8a8');
        close(true);
      };
      break;
    }
    case 7: {
      const gnome = document.createElement('p'); gnome.className = 'cr-gnome';
      const say = (t: string) => { gnome.innerHTML = `<b>The Naming Gnome:</b> ${t}`; };
      say('Heh! Another blank one. A name, then. Make it a good one — I have to remember them all, you know.');
      const input = document.createElement('input'); input.className = 'cr-name'; input.maxLength = 20; input.placeholder = 'Your name'; input.autocomplete = 'off';
      input.value = prof.name === 'The Nameless One' ? '' : prof.name;
      const sug = document.createElement('div'); sug.className = 'cr-chips';
      const fill = () => {
        sug.innerHTML = '';
        for (const n of [pick(GNOME_DARK), pick(GNOME_DARK), pick(GNOME_SILLY)]) {
          const b = document.createElement('button'); b.className = 'cr-chip'; b.textContent = n;
          b.onclick = () => { input.value = n; say(GNOME_SILLY.includes(n) ? 'Hee hee! Oh, do take that one. Please.' : 'Hm. Yes. That one has teeth.'); };
          sug.appendChild(b);
        }
        const r = document.createElement('button'); r.className = 'cr-chip'; r.textContent = '↻'; r.onclick = fill; sug.appendChild(r);
      };
      fill();
      body.append(gnome, input, sug);
      ok.textContent = 'Be named';
      ok.onclick = () => {
        const n = input.value.trim().replace(/\s+/g, ' ');
        if (n.length < 2) { say('That’s not a name, that’s a cough.'); return; }
        if (PLAIN_NAMES.includes(n.toLowerCase()) && !root.dataset.warned) { root.dataset.warned = '1'; say(`${pick(GNOME_RUDE)} Try one of mine — or insist, if you must.`); return; }
        prof.name = n;
        close(true);
      };
      break;
    }
  }
  if (step !== 6 && step !== 7) ok.onclick = () => close(true);
}
