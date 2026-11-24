// The Herald: rule-keeper, quest-giver, judge and teacher. He rides in (hoofbeats
// first), calls you by name, judges how you fought, heals you at death's door for a
// favour, hands out errands with moral weight, grants wishes for wish shards — and
// always wishes you luck and the right choices.
import * as THREE from 'three';
import { Actor, heraldModel } from './story';
import { playScene, sceneOpen, SceneChoice } from '../ui/scene';
import { audio } from '../engine/audio';
import { ITEMS } from '../data/items';
import { UNIQUES } from '../data/gear';
import { ENEMIES } from '../data/enemies';
import { SORCERER } from '../data/story';
import type { Player } from '../entities/player';
import type { World } from '../world/world';
import type { Creatures, Creature } from '../entities/creatures';
import type { QuestLog } from './quests';
import type { Watcher, FightStyle } from './watcher';
import type { Inventory } from './inventory';
import type { Combat } from './combat';
import type { FrescoKind } from './fresco';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const FAREWELL = ['I wish you luck, and the right choices. We will meet again.', 'Luck, and the right choices. We will meet again — we always do.', 'Go on. I wish you luck and the right choices. We will meet again soon.'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export interface HeraldSave { boons: { dmg: number; life: number }; errandsDone: number; errand: ErrandState | null; lastErrandDay: number; gone: string[]; pet: boolean; healed: number; }
export interface ErrandState { id: string; place?: { x: number; z: number; name: string }; target?: string; deadline?: number; opened?: boolean; progress?: number; }

export interface HeraldHooks {
  name(): string;
  gold(): number; addGold(n: number): void;
  day(): number; hours(): number;
  toast(t: string, c?: string): void;
  log(kind: FrescoKind, text: string): void;
  give(id: string, n: number): boolean;
  levelUp(): void; levelDown(): void;
  revealMap(r: number): void;
  spawnPet(): void;
  nearestDungeon(): { x: number; z: number; name: string } | null;
  villageWithMerchant(): { x: number; z: number; name: string; merchant: string } | null;
  nearestVillage(): { x: number; z: number; name: string } | null;
  applyProfile(): void;
}

export class Herald {
  readonly group = new THREE.Group();
  private actor = new Actor(heraldModel);
  private ride: { t: number; from: THREE.Vector3; to: THREE.Vector3; leave: boolean; then: (() => void) | null } | null = null;
  private cooldown = 30;
  private healCd = 0;
  boons = { dmg: 0, life: 0 };
  errandsDone = 0;
  errand: ErrandState | null = null;
  lastErrandDay = -10;
  /** NPCs the Herald's errands took from the world */
  gone: string[] = [];
  pet = false;
  healed = 0;
  enabled = false;

  constructor(private ui: HTMLElement, private world: World, private player: Player, private creatures: Creatures, private quests: QuestLog,
    private watch: Watcher, private inv: Inventory, private combat: Combat, private hooks: HeraldHooks) {
    this.group.add(this.actor.mesh);
  }

  load(d: HeraldSave | undefined) {
    if (!d) return;
    this.boons = d.boons; this.errandsDone = d.errandsDone; this.errand = d.errand; this.lastErrandDay = d.lastErrandDay; this.gone = d.gone; this.pet = d.pet; this.healed = d.healed ?? 0;
  }
  serialize(): HeraldSave { return { boons: this.boons, errandsDone: this.errandsDone, errand: this.errand, lastErrandDay: this.lastErrandDay, gone: this.gone, pet: this.pet, healed: this.healed }; }

  /** he is on screen */
  get present() { return this.actor.visible; }
  get busy() { return (!!this.ride && !this.ride.leave) || sceneOpen(); }

  // ---------------------------------------------------------------- riding in and out
  /** Ride in near the player, then run `then` (usually a scene). */
  private arrive(then: () => void) {
    // already here (or just turning to leave): he stays
    if (this.actor.visible && (!this.ride || this.ride.leave)) { this.ride = null; this.actor.yaw = Math.atan2(-(this.player.pos.x - this.actor.pos.x), -(this.player.pos.z - this.actor.pos.z)); then(); return; }
    const p = this.player.pos;
    const a = Math.random() * Math.PI * 2;
    const from = V(p.x + Math.cos(a) * 34, 0, p.z + Math.sin(a) * 34);
    const to = V(p.x + Math.cos(a) * 6, 0, p.z + Math.sin(a) * 6);
    this.ride = { t: 0, from, to, leave: false, then };
    this.hooks.toast('Hoofbeats.', '#e8a030');
  }
  private leave() {
    const a = this.actor.pos.clone();
    const away = a.clone().sub(this.player.pos).setY(0).normalize().multiplyScalar(40).add(a);
    this.ride = { t: 0, from: a, to: away, leave: true, then: null };
    this.cooldown = 120;
  }

  update(dt: number) {
    this.cooldown -= dt; this.healCd -= dt;
    const h = this.actor;
    if (this.ride) {
      const r = this.ride;
      r.t += dt;
      const k = Math.min(1, r.t / 3.2);
      h.pos.lerpVectors(r.from, r.to, k);
      h.pos.y = this.world.isLoaded(h.pos.x, h.pos.z) ? this.world.groundNear(h.pos.x, h.pos.z, this.player.pos.y) : this.player.pos.y;
      h.yaw = Math.atan2(-(r.to.x - r.from.x), -(r.to.z - r.from.z));
      h.move = k < 1 ? 1.2 : 0; h.phase += dt * (k < 1 ? 9 : 1);
      if (k < 1 && Math.floor(r.t * 3) !== Math.floor((r.t - dt) * 3)) audio.hoof(0.4 + k * 0.6);
      h.visible = true;
      if (k >= 1) {
        if (r.leave) { this.ride = null; h.visible = false; }
        else { this.ride = null; h.yaw = Math.atan2(-(this.player.pos.x - h.pos.x), -(this.player.pos.z - h.pos.z)); r.then?.(); }
      }
    } else if (h.visible && !sceneOpen()) this.leave();
    if (h.visible && !this.ride) { h.move = 0; h.phase += dt; }
    h.write();
    if (!this.enabled) return;

    // near death in a big fight: he lays his hands on you — for a favour
    const boss = this.creatures.list.find((c) => c.def.boss && c.state !== 'dead' && c.alerted && c.pos.distanceTo(this.player.pos) < 40);
    if (boss && this.player.life > 0 && this.player.life < this.player.maxLife * 0.15 && this.healCd <= 0 && !this.busy) {
      this.healCd = 900;
      this.player.life = this.player.maxLife; this.player.stamina = this.player.tune.staminaMax;
      this.combat.status.clear();
      boss.state = 'stunned'; boss.timer = 4;
      this.watch.d.favours++; this.healed++;
      this.hooks.toast('Long fingers touch your brow. The wounds close. You owe him now.', '#e8a030');
      this.hooks.log('obey', 'Healed by the Herald — a favour owed');
    }
    // errands: after the arena, every couple of days (at once while chapter 9 is open)
    const day = this.hooks.day();
    const ch9 = this.quests.isActive('ch9');
    if (!this.errand && this.cooldown <= 0 && !this.busy && (this.quests.isDone('ch4') || ch9) && (ch9 || day - this.lastErrandDay >= 2) && !boss) this.offerErrand();
    this.trackErrand();
  }

  // ---------------------------------------------------------------- judgment after big fights
  judge(foe: Creature) {
    if (!this.enabled || this.busy) return;
    const style: FightStyle = this.watch.fightStyle();
    const name = this.hooks.name();
    const lines: string[] = [`${name}. I watched that. ${foe.def.name} is dust, and you are not. Let me tell you how you fought.`];
    const after: (() => void)[] = [];
    if (style === 'brave') {
      lines.push('Brave. Straight at it, eyes open. Foolish, sometimes — but brave things are rare, and I reward rare things.');
      after.push(() => { this.hooks.addGold(60); this.hooks.give('bandage', 3); this.hooks.toast('The Herald rewards you: 60 gold and bandages.', '#f0d070'); });
    } else if (style === 'clever') {
      lines.push('Clever. You waited, you turned the blows, you made it fight on your terms. Let me sharpen that a little.');
      after.push(() => { this.boons.dmg += 0.03; this.hooks.applyProfile(); this.hooks.toast('The Herald’s gift: your blows land 3% harder, for good.', '#f0d070'); });
    } else if (style === 'cowardly') {
      lines.push('Cowardly. You ran, and ran, and only fought when there was nowhere left to run. That has a price.');
      after.push(() => { const g = Math.floor(this.hooks.gold() * 0.15); this.hooks.addGold(-g); this.hooks.toast(`The Herald takes ${g} gold. “For the lesson.”`, '#e08070'); });
    } else {
      lines.push('Cruel. Fire and curses and no mercy for the ones that fled. I do not judge cruelty. I only remember it.');
      after.push(() => { this.hooks.addGold(40); this.combat.status.set('curse', 60); this.hooks.toast('40 gold — and a curse that lingers for a minute.', '#c080e0'); });
    }
    lines.push(this.watch.remark(name));
    lines.push(pick(FAREWELL));
    this.hooks.log(style === 'cowardly' ? 'defy' : 'boss', `${foe.def.name} slain — judged ${style}`);
    this.arrive(() => playScene(this.ui, 'The Herald', '#e8a030', lines, () => { for (const f of after) f(); }));
  }

  // ---------------------------------------------------------------- wish shards
  wish() {
    if (this.busy) { this.hooks.toast('He is already here.', '#a8987c'); return; }
    if (this.inv.count('wish_shard') <= 0) return;
    const name = this.hooks.name();
    this.arrive(() => {
      const spend = () => this.inv.remove('wish_shard', 1);
      const choices: SceneChoice[] = [
        { label: 'A rare treasure', run: () => { spend(); const id = pick(UNIQUES); this.hooks.give(id, 1); this.combat.status.set('curse', 180); this.hooks.toast(`${ITEMS[id].name} — and something cold settles on you. A curse, for a while.`, '#c080e0'); this.hooks.log('wish', `Wished for ${ITEMS[id].name}`); } },
        { label: 'Strength: a level', run: () => { spend(); this.hooks.levelUp(); this.watch.d.favours++; this.hooks.toast('You feel stronger. You also feel you owe him something.', '#f0d070'); this.hooks.log('wish', 'Wished for strength'); } },
        { label: 'A secret', run: () => { spend(); this.secret(); } },
        { label: 'Show me the land', run: () => { spend(); this.hooks.revealMap(700); this.hooks.toast('The map fills in, as if you had walked it in a dream.', '#80c0ff'); this.hooks.log('wish', 'Wished to see the land'); } }
      ];
      if (!this.pet) choices.push({ label: 'A companion', run: () => { spend(); this.pet = true; this.hooks.spawnPet(); this.hooks.toast('A grey hound trots out from behind his horse and sits at your feet.', '#f0d070'); this.hooks.log('wish', 'A loyal hound'); } });
      if (this.gone.length) choices.push({ label: `Bring back ${this.gone[0]}`, run: () => { spend(); const who = this.gone.shift()!; this.watch.d.obey++; this.hooks.toast(`${who} will be back by morning. “Everything has a price,” he says. You do not ask which.`, '#f0d070'); this.hooks.log('wish', `${who} returned`); } });
      choices.push({ label: 'Keep the shard', run: () => playScene(this.ui, 'The Herald', '#e8a030', ['Then why did you call me? Hm. Keep it, then. ' + pick(FAREWELL)]) });
      playScene(this.ui, 'The Herald', '#e8a030', [`A wish shard. You found one, ${name}. They are pieces of something very old.`, 'Ask, and I will give. Some gifts are free. Most are not.'], () => {}, choices);
    });
  }

  private secret() {
    const n = this.watch.d.truth++;
    const SECRETS = [
      'A secret, then. The Ashen Stranger is not a man. He has not been a man for three hundred years. Neither have I.',
      `There was a sorcerer called ${SORCERER}. When he died, his will did not. It split in two — the part that warns, and the part that rules.`,
      `The Hollow King is not the master here. He is a jar. ${SORCERER} needs a vessel, and every vessel cracks in the end.`,
      'Every one of you comes to the clearing faceless. Do you know why? Because the face you choose is the only thing I cannot give you.'
    ];
    playScene(this.ui, 'The Herald', '#e8a030', [SECRETS[Math.min(n, SECRETS.length - 1)], pick(FAREWELL)]);
    this.hooks.log('secret', 'A secret from the Herald');
  }

  // ---------------------------------------------------------------- errands
  private offerErrand() {
    const done = new Set(this.quests.list.map((q) => q.id));
    const favour = this.watch.d.favours > 0;
    const options: string[] = [];
    if (favour && !done.has('errand_grave')) options.push('errand_grave');
    if (!done.has('errand_box')) options.push('errand_box');
    if (!done.has('errand_spy')) options.push('errand_spy');
    if (!done.has('errand_news')) options.push('errand_news');
    if (this.quests.isDone('ch4') && !done.has('errand_wine')) options.push('errand_wine');
    if (!options.length) { this.lastErrandDay = this.hooks.day(); return; }
    const id = options[0];
    const name = this.hooks.name();
    const st: ErrandState = { id };
    let lines: string[] = [];
    if (id === 'errand_box') {
      const d = this.hooks.nearestDungeon(); if (!d) { this.lastErrandDay = this.hooks.day(); return; }
      st.place = d; st.deadline = this.hooks.day() * 24 + 20;
      lines = [`${name}. An errand. Take this box to ${d.name} and leave it at the arch. Before nightfall.`, 'Do not open it. I will know.'];
    } else if (id === 'errand_spy') {
      const v = this.hooks.villageWithMerchant(); if (!v) { this.lastErrandDay = this.hooks.day(); return; }
      st.place = { x: v.x, z: v.z, name: v.name }; st.target = v.merchant;
      lines = [`A small thing. In ${v.name} there is a merchant, ${v.merchant}. Watch him after dark. Then tell me what he does.`];
    } else if (id === 'errand_news') {
      const v = this.hooks.nearestVillage(); if (!v) { this.lastErrandDay = this.hooks.day(); return; }
      st.place = v; st.progress = 0;
      lines = [`Go to ${v.name} and tell them the Hollow King’s riders are coming. Tell three of them.`, 'It is not true. That does not matter.'];
    } else if (id === 'errand_wine') {
      st.target = 'Lachesis';
      lines = ['Lachesis of the Gilded Spindle measures threads that are not hers to measure.', 'Here is a vial. Her wine, tonight. That is all.'];
    } else if (id === 'errand_grave') {
      lines = ['You owe me a favour. I am collecting.', 'In the barrow cemetery there is an open grave. Old Hob is in it. Bring me his bones.'];
    }
    this.arrive(() => playScene(this.ui, 'The Herald', '#e8a030', lines, () => {}, [
      { label: 'I will do it', run: () => {
        this.errand = st; this.lastErrandDay = this.hooks.day();
        if (id === 'errand_box') this.hooks.give('sealed_box', 1);
        if (id === 'errand_wine') this.hooks.give('nightshade_vial', 1);
        this.quests.start(id);
        playScene(this.ui, 'The Herald', '#e8a030', [pick(FAREWELL)]);
      } },
      { label: 'No. Find someone else.', run: () => { this.refuse(id); } }
    ]));
  }

  private refuse(id: string) {
    this.watch.d.defy++;
    this.lastErrandDay = this.hooks.day();
    this.errandsDone++;
    this.quests.start(id, true);
    this.quests.get(id)!.done = true;
    const favour = id === 'errand_grave';
    const lines = favour ? ['A favour refused is a debt doubled. You will feel it.'] : ['No? You are allowed to say no. You are not allowed to forget that you did.'];
    playScene(this.ui, 'The Herald', '#e8a030', [...lines, pick(FAREWELL)], () => {
      if (favour) { this.hooks.levelDown(); this.hooks.toast('Something is taken from you. You feel less than you were.', '#e08070'); }
      else { const g = Math.floor(this.hooks.gold() * 0.1); this.hooks.addGold(-g); this.combat.status.set('curse', 90); this.hooks.toast(`${g} gold vanishes from your purse, and a curse settles on you.`, '#e08070'); }
    });
    this.hooks.log('defy', 'Refused the Herald’s errand');
    this.checkCh9();
  }

  private settle(kind: 'obey' | 'defy' | 'trick', text: string, lines: string[], after?: () => void, present = false) {
    if (!this.errand) return;
    const id = this.errand.id;
    this.watch.d[kind]++;
    this.errandsDone++;
    this.errand = null;
    this.hooks.log(kind, text);
    const scene = () => playScene(this.ui, 'The Herald', '#e8a030', [...lines, pick(FAREWELL)], () => {
      after?.();
      this.quests.flag(id === 'errand_box' ? 'box_delivered' : id === 'errand_spy' ? 'spied' : id === 'errand_news' ? 'news_spread' : id === 'errand_wine' ? 'wine_done' : 'hob_dug');
      this.checkCh9();
    });
    if (present) scene(); else this.arrive(scene);
  }

  private checkCh9() { if (this.errandsDone >= 2) this.quests.flag('errands_two'); }

  /** progress of the current errand (positions, time, deadlines) */
  private trackErrand() {
    const e = this.errand;
    if (!e || this.busy) return;
    const p = this.player.pos;
    if (e.id === 'errand_box' && e.place) {
      const now = this.hooks.day() * 24 + this.hooks.hours();
      if (now > (e.deadline ?? 1e9)) {
        this.inv.remove('sealed_box', 1);
        this.settle('defy', 'The sealed box arrived too late', ['Night fell, and the box was still in your hands. I asked for one thing.'], () => { this.combat.status.set('curse', 120); });
        return;
      }
      if (Math.hypot(p.x - e.place.x, p.z - e.place.z) < 8 && this.inv.count('sealed_box') > 0) {
        this.inv.remove('sealed_box', 1);
        if (e.opened) this.settle('trick', 'Opened the sealed box', ['You opened it. I told you I would know. The heart inside stopped beating when you looked at it.', 'Keep it. It is yours now. So is what comes with it.'], () => { this.hooks.give('heart_of_the_mountain', 1); this.combat.status.set('curse', 240); });
        else this.settle('obey', 'Delivered the sealed box unopened', ['Delivered, and unopened. Good. Very good. You may not like what it was, so I will not tell you.'], () => { this.hooks.addGold(60); });
      }
    }
    if (e.id === 'errand_spy' && e.place) {
      const night = this.hooks.hours() >= 21 || this.hooks.hours() < 4;
      if (night && Math.hypot(p.x - e.place.x, p.z - e.place.z) < 45) {
        e.progress = (e.progress ?? 0) + 1 / 60;
        if ((e.progress ?? 0) > 0.5 && !this.busy) {
          const who = e.target ?? 'the merchant';
          this.hooks.toast(`In the dark, ${who} carries sacks of food and medicine to the poorest houses — and takes no coin.`, '#c8d8ff');
          const errand = e;
          this.arrive(() => playScene(this.ui, 'The Herald', '#e8a030', ['Well? What does the merchant do in the dark?'], () => {}, [
            { label: 'Tell the truth', run: () => { this.errand = errand; this.gone.push(who); this.settle('obey', `Reported ${who} to the Herald`, [`Charity without my leave. How touching. ${who} will not be selling anything for a while.`], () => this.hooks.addGold(50), true); } },
            { label: 'Lie: “Nothing. He sleeps.”', run: () => { this.errand = errand; this.settle('trick', `Lied to the Herald for ${who}`, ['He sleeps. Of course he does. Everyone sleeps, in the end.'], undefined, true); } },
            { label: 'Refuse to say', run: () => { this.errand = errand; this.settle('defy', 'Refused to inform on a merchant', ['Silence is also an answer. A loud one.'], () => this.combat.status.set('curse', 90), true); } }
          ]));
          this.errand = null;
        }
      }
    }
  }

  /** dialogue options with villagers for the current errand */
  dialogueOptions(npcName: string, villageName: string, job: string, rep: number, close: () => void): [string, () => void][] {
    const e = this.errand;
    const out: [string, () => void][] = [];
    if (e?.id === 'errand_news' && e.place?.name === villageName) {
      out.push(['“The Hollow King’s riders are coming.”', () => {
        close();
        e.progress = (e.progress ?? 0) + 1;
        this.hooks.toast(`${npcName} goes pale and hurries off to tell the others.`, '#e08070');
        if ((e.progress ?? 0) >= 3) this.settle('obey', `Spread false news in ${villageName}`, ['Panic in the streets, doors barred at noon. Fear is a fine fertiliser.'], () => this.hooks.addGold(40));
      }]);
      out.push(['“The Herald wants you afraid. Don’t be.”', () => {
        close();
        this.settle('defy', `Warned ${villageName} about the Herald’s lie`, ['You told them the truth. How brave. How expensive.'], () => { const g = Math.floor(this.hooks.gold() * 0.1); this.hooks.addGold(-g); });
      }]);
    }
    if (e?.id === 'errand_wine' && npcName === 'Lachesis' && this.inv.count('nightshade_vial') > 0) {
      out.push(['Pour the vial into her wine', () => { close(); this.inv.remove('nightshade_vial', 1); this.gone.push('Lachesis'); this.settle('obey', 'Poisoned Lachesis’ wine', ['It is done. The Spindle will need a new keeper. Do not look at me like that.'], () => this.hooks.addGold(100)); }]);
      out.push(['Spill it while she is not looking', () => { close(); this.inv.remove('nightshade_vial', 1); this.settle('trick', 'Spilled the poison', ['A clumsy servant. The wine went everywhere, I am told. Everywhere but her mouth.'], () => { this.combat.status.set('curse', 120); }); }]);
      out.push(['Warn her', () => { close(); this.inv.remove('nightshade_vial', 1); this.hooks.give('lachesis_measure', 1); this.hooks.toast('Lachesis listens, very still. She gives you a silver pendant. “Measure your own thread carefully.”', '#c8d8ff'); this.settle('defy', 'Warned Lachesis of the poison', ['You warned her. I expected nothing less of you — and nothing more.'], () => this.combat.status.set('curse', 120)); }]);
    }
    void job; void rep;
    return out;
  }

  /** the sealed box was opened from the pack */
  openBox() {
    if (this.errand?.id !== 'errand_box') return;
    if (this.errand.opened) return;
    this.errand.opened = true;
    this.hooks.toast('Inside, on black velvet, a red stone beats like a heart. You close the lid quickly. Too late.', '#e08070');
  }

  /** Old Hob's grave was dug */
  digGrave() {
    if (this.errand?.id !== 'errand_grave' || this.inv.count('hobs_bones') > 0) return false;
    this.hooks.give('hobs_bones', 1);
    this.hooks.toast('Under the earth: an apron, a spade-handle and a bundle of bones that hum faintly.', '#c8b890');
    const e = this.errand;
    setTimeout(() => {
      if (this.errand !== e) return;
      this.arrive(() => playScene(this.ui, 'The Herald', '#e8a030', ['Old Hob. Sixty years of digging, and in the end someone dug for him. Give them to me.'], () => {}, [
        { label: 'Hand over the bones', run: () => { this.inv.remove('hobs_bones', 1); this.watch.d.favours = Math.max(0, this.watch.d.favours - 1); this.settle('obey', 'Gave Old Hob’s bones to the Herald', ['Debt paid. For now.'], undefined, true); } },
        { label: 'Keep them — let him rest', run: () => { this.settle('defy', 'Kept Old Hob’s bones from the Herald', ['Sentiment. It will not save him, and it will not save you.'], () => { this.hooks.levelDown(); }, true); } }
      ]));
    }, 1500);
    return true;
  }

  /** the scene at the Cathedral (chapter 10) */
  cathedral(onFight: () => void) {
    const d = this.watch.d, name = this.hooks.name();
    const verdict = d.obey > d.defy + d.trick ? 'obedient' : d.defy >= d.obey ? 'defiant' : 'cunning';
    const lines = [
      `${name}. Kneel, or stand — it is all written down either way.`,
      `Errands obeyed: ${d.obey}. Refused: ${d.defy}. Twisted to your own ends: ${d.trick}. Favours owed: ${d.favours}.`,
      verdict === 'obedient' ? 'You have been useful. Useful things are kept. Rise, and carry my mark.' : verdict === 'defiant' ? 'You defied me. The rules were explained to you. The Cathedral remembers every name — and now it remembers yours.' : 'You bent every rule until it nearly broke. Clever. I hate clever. My Warden will test how clever.'
    ];
    this.hooks.log(verdict === 'obedient' ? 'obey' : 'defy', `Judged ${verdict} in the Cathedral`);
    playScene(this.ui, 'The Herald', '#e8a030', lines, () => {
      if (verdict === 'obedient') { this.boons.life += 25; this.hooks.applyProfile(); this.hooks.give('signet_of_the_herald', 1); this.quests.flag('judged'); this.hooks.toast('The Herald’s mark: +25 life, and his signet.', '#f0d070'); }
      else onFight();
    });
  }

  /** the end of the story: three paths */
  ending(choose: (e: 'obey' | 'resist' | 'truth') => void) {
    const d = this.watch.d, name = this.hooks.name();
    const lines = [
      `It is done, ${name}. The Hollow King is empty again. Look — the crown is still warm.`,
      'Pick it up. Wear it. Everything you have done has led you here. I would be a kind master. Kinder than him.',
      d.truth >= 2 ? `And yet you know my name, don’t you? Not the Herald. ${SORCERER}. Half of him.` : 'Well? The crown is waiting.'
    ];
    const choices: SceneChoice[] = [
      { label: 'Take the crown', run: () => choose('obey') },
      { label: 'Shatter the crown', run: () => choose('resist') }
    ];
    if (d.truth >= 2) choices.push({ label: `Speak his true name: ${SORCERER}`, run: () => choose('truth') });
    this.arrive(() => playScene(this.ui, 'The Herald', '#e8a030', lines, () => {}, choices));
  }

  /** summon the Herald with a shard (from the pack) */
  get hasShard() { return this.inv.count('wish_shard') > 0; }
  enemyName(id: string) { return ENEMIES[id]?.name ?? id; }
}
