// The opening of the journey: waking in the clearing at dawn, the toadling ambush,
// the Ashen Stranger at his campfire, the Herald at the gorge, and the Tower of the
// First Rite with its seven copper tablets (character creation), ending with the
// reveal of the new face.
import * as THREE from 'three';
import { GeoBuilder } from '../world/vegetation';
import { propMaterial } from '../world/shaders';
import { humanoid, add, ell } from '../data/enemies';
import { quadruped } from '../entities/animals';
import { CAMPFIRE, HERALD_SPOT, TOWER, SPRING } from '../data/story';
import { WALL_H } from '../data/pieces';
import { Profile, defaultLook } from '../data/character';
import type { Piece, Building } from '../world/building';
import type { World } from '../world/world';
import type { Player } from '../entities/player';
import type { Creatures } from '../entities/creatures';
import type { Props } from '../world/props';
import { ENEMIES } from '../data/enemies';
import { audio } from '../engine/audio';
import { playScene, sceneOpen } from '../ui/scene';

/** six tablets, the rusty chest, the seventh tablet */
export const RITE_STEPS = 8;
export type StoryStep = 'wake' | 'stranger' | 'gorge' | 'tower' | 'rite' | 'free';
export interface StorySave { step: StoryStep; tablets: number; profile: Profile; }

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ actors
export function strangerModel(b: GeoBuilder) {
  humanoid(b, { h: 1.85, w: 0.9, skin: [0.78, 0.8, 0.82], cloth: [0.42, 0.42, 0.44], pants: [0.35, 0.35, 0.37], hood: [0.3, 0.3, 0.32], eye: [0.6, 0.75, 0.9], eyeGlow: 0.6, weapon: 'none' });
}
export function heraldModel(b: GeoBuilder) {
  // huge armoured black horse
  quadruped(b, { body: [0.46, 0.55, 1.2], bodyY: 1.75, legLen: 1.25, legR: 0.09, legX: 0.26, legZ: 0.9, head: [0.18, 0.24, 0.5], headPos: [0, 2.75, -1.75], neck: 0.8, color: [0.05, 0.05, 0.06], dark: [0.03, 0.03, 0.035], tail: 0.8 },
    (bb) => {
      add(bb, ell(0.5, 0.3, 1.0, 0, 2.0, 0.1), [0.18, 0.18, 0.2], 0, V(), 'white'); // barding
      add(bb, ell(0.2, 0.25, 0.32, 0, 2.85, -1.7), [0.2, 0.2, 0.22], 5, V(0, 2.4, -1.0), 'white'); // chanfron
      for (const s of [-1, 1]) add(bb, ell(0.03, 0.03, 0.02, s * 0.12, 2.92, -1.95), [1, 0.6, 0.1], 5, V(0, 2.4, -1.0), 'white', 0.8);
    });
  // the rider: tall, gaunt, bald pointed skull, long fingers, dark grey smock, amber eyes
  const r = 0; void r;
  add(b, ell(0.2, 0.42, 0.14, 0, 2.95, 0.15), [0.22, 0.22, 0.24], 0, V(), 'fabric');
  add(b, ell(0.1, 0.17, 0.11, 0, 3.55, 0.08), [0.78, 0.74, 0.7], 0, V());
  add(b, ell(0.06, 0.1, 0.07, 0, 3.68, 0.13), [0.78, 0.74, 0.7], 0, V());
  for (const s of [-1, 1]) {
    add(b, ell(0.022, 0.014, 0.01, s * 0.04, 3.56, -0.02), [1.0, 0.62, 0.1], 0, V(), 'white', 2.5);
    add(b, ell(0.05, 0.3, 0.05, s * 0.24, 2.85, -0.05), [0.22, 0.22, 0.24], 0, V(), 'fabric');
    for (let f = 0; f < 4; f++) add(b, ell(0.008, 0.08, 0.008, s * 0.24 + f * 0.012 - 0.018, 2.48, -0.12), [0.75, 0.7, 0.66], 0, V());
    add(b, ell(0.07, 0.42, 0.08, s * 0.36, 2.25, 0.2), [0.2, 0.2, 0.22], 0, V(), 'fabric');
  }
  const smock = new THREE.ConeGeometry(0.55, 1.2, 10, 1, true); smock.translate(0, 2.4, 0.15); add(b, smock, [0.2, 0.2, 0.22], 0, V(), 'fabric');
}

export class Actor {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.InstancedBufferGeometry();
  private a: THREE.InstancedBufferAttribute; private b: THREE.InstancedBufferAttribute; private c: THREE.InstancedBufferAttribute;
  pos = V(); yaw = 0; phase = 0; move = 0; visible = false;
  constructor(build: (b: GeoBuilder) => void) {
    const gb = new GeoBuilder(); build(gb);
    const base = gb.build();
    for (const [n, at] of Object.entries(base.attributes)) this.geo.setAttribute(n, at);
    this.geo.setIndex(base.index);
    const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(4), 4).setUsage(THREE.DynamicDrawUsage);
    this.a = mk(); this.b = mk(); this.c = mk();
    this.geo.setAttribute('aInst', this.a); this.geo.setAttribute('aInst2', this.b); this.geo.setAttribute('aAnim', this.c);
    this.mesh = new THREE.Mesh(this.geo, propMaterial({ animal: true }));
    this.mesh.frustumCulled = false;
  }
  write() {
    const A = this.a.array as Float32Array, B = this.b.array as Float32Array, C = this.c.array as Float32Array;
    A.set([this.pos.x, this.pos.y, this.pos.z, this.yaw]); B.set([1, 0.5, 0, 0]); C.set([this.phase, this.move, 0, 0]);
    this.a.needsUpdate = this.b.needsUpdate = this.c.needsUpdate = true;
    this.geo.instanceCount = this.visible ? 1 : 0;
    this.mesh.visible = this.visible;
  }
}

// ------------------------------------------------------------------ tower
function towerPieces(y0: number): Piece[] {
  const out: Piece[] = [];
  const x0 = Math.round(TOWER.x / 2) * 2 - 3, z0 = Math.round(TOWER.z / 2) * 2 - 3; // 6x6 m, corner
  const push = (id: string, x: number, y: number, z: number, rot = 0) => out.push({ id, x, y, z, rot, gen: true });
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) { push('stone_floor', x0 + i * 2 + 1, y0, z0 + k * 2 + 1); push('stone_floor', x0 + i * 2 + 1, y0 + WALL_H * 3, z0 + k * 2 + 1); }
  for (let lvl = 0; lvl < 3; lvl++) {
    const y = y0 + lvl * WALL_H;
    for (let i = 0; i < 3; i++) {
      push(lvl === 0 && i === 1 ? 'door_wall' : 'stone_wall', x0 + i * 2 + 1, y, z0 + 6, Math.PI); // front faces +z (toward the clearing)
      push('stone_wall', x0 + i * 2 + 1, y, z0, 0);
      push('stone_wall', x0, y, z0 + i * 2 + 1, Math.PI / 2);
      push('stone_wall', x0 + 6, y, z0 + i * 2 + 1, -Math.PI / 2);
    }
  }
  for (const [x, z] of [[x0, z0], [x0 + 6, z0], [x0, z0 + 6], [x0 + 6, z0 + 6]]) push('pillar', x, y0 + WALL_H * 3, z);
  push('flag_one', x0 + 3, y0 + WALL_H * 3, z0 + 3);
  // inside: seven copper tablets around the walls, straw, bones, the rusty chest, torches
  const tabs: [number, number, number][] = [[x0 + 1.2, z0 + 0.2, 0], [x0 + 3, z0 + 0.2, 0], [x0 + 4.8, z0 + 0.2, 0], [x0 + 5.8, z0 + 2, -Math.PI / 2], [x0 + 5.8, z0 + 4, -Math.PI / 2], [x0 + 0.2, z0 + 4, Math.PI / 2], [x0 + 0.2, z0 + 2, Math.PI / 2]];
  // tablets face into the room: model front is -z, so rotate by the wall's inward normal
  const rotFor = (r: number) => r + Math.PI;
  tabs.forEach(([x, z, r], i) => out.push({ id: 'tablet', x, y: y0, z, rot: rotFor(r), gen: true, open: false, items: [{ id: `tablet${i}`, n: i }] } as Piece));
  push('straw', x0 + 1.3, y0, z0 + 5); push('straw', x0 + 4.6, y0, z0 + 4.8); push('bones', x0 + 3.6, y0, z0 + 3.2); push('bones', x0 + 1.6, y0, z0 + 2.6);
  push('rite_chest', x0 + 3, y0, z0 + 2.2, 0);
  push('waystone', x0 + 9, y0 - 0.1, z0 + 9, 0);
  push('wall_torch', x0 + 2, y0, z0 + 0.2, Math.PI); push('wall_torch', x0 + 4, y0, z0 + 5.8, 0);
  return out;
}

// ------------------------------------------------------------------ the director
export interface StoryHooks {
  toast(t: string, c?: string): void;
  objective(text: string | null, target: THREE.Vector3 | null): void;
  openCreation(step: number, done: () => void): void;
  reveal(): void;
  setTime(t: number): void;
  /** story flag for the quest log */
  flag(name: string): void;
}

export class Story {
  step: StoryStep = 'wake';
  tablets = 0;
  profile: Profile = { name: 'The Nameless One', look: defaultLook(), race: 'human', calling: 'knight', abilities: [], created: false };
  readonly group = new THREE.Group();
  private stranger = new Actor(strangerModel);
  private herald = new Actor(heraldModel);
  private ambushDone = false;
  private heraldT = -1;
  private towerLoaded = false;
  /** the Stranger returns to his fire later in the story */
  strangerBack = false;
  private needFire = false;

  constructor(private ui: HTMLElement, private world: World, private building: Building, private player: Player, private creatures: Creatures, private props: Props, private hooks: StoryHooks) {
    this.group.add(this.stranger.mesh, this.herald.mesh);
  }

  /** New journey: night, campfire lit at the Stranger's place. */
  begin() {
    this.hooks.setTime(0.32); // early morning: warm, bright light for the first steps
    this.needFire = true;
    setTimeout(() => this.hooks.toast('You wake in a quiet clearing as the sun comes up. You remember nothing — not even your face.', '#c8d8ff'), 1500);
    setTimeout(() => this.hooks.toast('Smoke rises between the trees. Someone has a fire.', '#e8d8a8'), 6000);
  }

  load(d: StorySave | undefined) {
    if (!d) { this.step = 'free'; this.profile.created = true; return; }
    this.step = d.step; this.tablets = d.tablets; this.profile = d.profile;
  }
  serialize(): StorySave { return { step: this.step, tablets: this.tablets, profile: this.profile }; }

  get busy() { return sceneOpen(); }

  update(dt: number, time: number) {
    const p = this.player.pos;
    // tower pieces once its ground is loaded
    if (!this.towerLoaded && this.world.isLoaded(TOWER.x, TOWER.z) && p.distanceTo(V(TOWER.x, p.y, TOWER.z)) < 160) {
      const y0 = this.world.groundY(TOWER.x, TOWER.z) + 0.1;
      this.building.setGenerated('tower', towerPieces(y0));
      this.towerLoaded = true;
    }
    // light the Stranger's fire once its ground exists
    if (this.needFire && this.world.isLoaded(CAMPFIRE.x, CAMPFIRE.z)) {
      this.needFire = false;
      if (!this.props.list.some((q) => q.type === 'campfire' && Math.hypot(q.x - CAMPFIRE.x, q.z - CAMPFIRE.z) < 2))
        this.props.add({ type: 'campfire', x: CAMPFIRE.x, y: this.world.groundY(CAMPFIRE.x, CAMPFIRE.z), z: CAMPFIRE.z, rot: 0 });
    }
    // the Stranger stands by his fire until the rite is done
    const s = this.stranger;
    s.visible = (this.step !== 'free' || this.strangerBack) && this.world.isLoaded(CAMPFIRE.x, CAMPFIRE.z);
    if (s.visible) {
      s.pos.set(CAMPFIRE.x + 1.3, this.world.groundY(CAMPFIRE.x + 1.3, CAMPFIRE.z), CAMPFIRE.z);
      s.yaw = Math.atan2(-(p.x - s.pos.x), -(p.z - s.pos.z)) * 0.3 + Math.PI / 2 * 0.7;
      s.phase += dt * 0.6;
    }
    s.write();
    // the Herald rides in at the gorge
    const h = this.herald;
    if (this.heraldT >= 0) {
      this.heraldT += dt;
      const t = Math.min(1, this.heraldT / 5);
      const from = V(HERALD_SPOT.x - 40, 0, HERALD_SPOT.z - 20), to = V(HERALD_SPOT.x, 0, HERALD_SPOT.z);
      h.pos.lerpVectors(from, to, t); h.pos.y = this.world.groundY(h.pos.x, h.pos.z);
      h.move = t < 1 ? 1.2 : 0;
      h.phase += dt * (t < 1 ? 9 : 1);
      h.yaw = t < 1 ? Math.atan2(-(to.x - from.x), -(to.z - from.z)) : Math.atan2(-(p.x - h.pos.x), -(p.z - h.pos.z));
      if (t < 1 && Math.floor(this.heraldT * 3) !== Math.floor((this.heraldT - dt) * 3)) audio.hoof(Math.min(1, 0.3 + t));
      if (t >= 1 && this.step === 'gorge' && !sceneOpen()) this.heraldSpeaks();
    }
    h.visible = this.heraldT >= 0 && (this.step === 'gorge' || this.step === 'tower' || this.step === 'rite');
    h.write();

    // objectives
    switch (this.step) {
      case 'wake': {
        this.hooks.objective('Follow the smoke to the campfire', V(CAMPFIRE.x, 0, CAMPFIRE.z));
        if (!this.ambushDone && Math.hypot(p.x, p.z) > 12) this.ambush();
        break;
      }
      case 'stranger': {
        this.hooks.objective('Follow the stream to the gorge', V(HERALD_SPOT.x, 0, HERALD_SPOT.z));
        if (Math.hypot(p.x - HERALD_SPOT.x, p.z - HERALD_SPOT.z) < 26 && this.heraldT < 0) { this.step = 'gorge'; this.heraldT = 0; this.hooks.toast('Hoofbeats. Something large is coming.', '#e08070'); }
        break;
      }
      case 'gorge': this.hooks.objective('Face the rider', h.pos); break;
      case 'tower': case 'rite': this.hooks.objective(this.step === 'tower' ? 'Enter the Tower of the First Rite' : `Complete the First Rite (${this.tablets}/${RITE_STEPS})`, V(TOWER.x, 0, TOWER.z)); break;
    }
    void time;
  }

  private ambush() {
    this.ambushDone = true;
    const dir = V(CAMPFIRE.x, 0, CAMPFIRE.z).normalize();
    for (let i = 0; i < 3; i++) {
      const x = dir.x * (20 + i * 2) + (i - 1) * 3, z = dir.z * (20 + i * 2) + (i - 1) * 2;
      if (!this.world.isLoaded(x, z)) continue;
      const c = this.creatures.spawn(ENEMIES.toadling, V(x, this.world.groundY(x, z), z), 1, i);
      c.state = 'hidden'; c.elite = false; c.hp = c.maxHp = 14; c.dmgMul = 0.7;
    }
  }

  /** Talk to the Stranger (called when the player uses him). */
  nearStranger(): boolean { return this.stranger.visible && this.player.pos.distanceTo(this.stranger.pos) < 3; }
  talkStranger() {
    const lines = this.step === 'wake' ? [
      'Ah. Another one comes to my fire. Sit, if you like. The dead do not mind company.',
      'Dead? Yes. Long dead. I have been sitting here a very long time. Your face is blank, little lamb. So was mine, once.',
      'You are a last hope — the last of many. Do not let that frighten you. Fear will find you soon enough on its own.',
      'Beware the rider with amber eyes. He will offer you everything. He will want something back.',
      'Follow the stream to the gorge. He is waiting there. He is always waiting.'
    ] : ['The gorge, little lamb. Follow the stream. And remember what I said about the rider.'];
    this.say('The Ashen Stranger', '#b8c8d8', lines, () => { this.hooks.flag('met_stranger'); if (this.step === 'wake') { this.step = 'stranger'; this.hooks.toast('Objective: follow the stream to the gorge.', '#e8d8a8'); } });
  }

  private heraldSpeaks() {
    this.say('The Herald', '#e8a030', [
      'There you are. I have watched you since you woke. You fight like a frightened animal — but you lived. That counts for something.',
      'I am the Herald. I keep the rules. I give tasks. I judge. Listen well, for I say this once.',
      'The rules: you will obey when I call. You will speak of me to no one. If you break the rules, you will be punished — and the Cathedral remembers every name.',
      'You chose how you would walk this world, before you ever woke. Whether you may fall and rise again, or fall only once. Remember which.',
      'Now go to the tower beyond the gorge. Read the seven tablets. Become someone. We will meet again — I wish you luck, and the right choices.'
    ], () => {
      this.hooks.flag('met_herald');
      this.step = 'tower';
      this.hooks.toast('Objective: enter the Tower of the First Rite.', '#e8d8a8');
      setTimeout(() => { this.heraldT = -1; audio.hoof(0.6); }, 4000);
    });
  }

  /** A tablet or the rite chest was used. */
  useSpecial(piece: Piece) {
    if (this.step === 'free') { this.hooks.toast('The copper is cold now. The rite is done.', '#a8987c'); return; }
    if (this.step === 'stranger' || this.step === 'wake' || this.step === 'gorge') { this.hooks.toast('The letters swim before your eyes. Not yet.', '#a8987c'); return; }
    this.step = 'rite';
    // order: tablets 1–6, the rusty chest, then the seventh tablet (the name)
    const n = piece.items?.[0]?.n ?? 0;
    const idx = piece.id === 'rite_chest' ? 6 : n === 6 ? 7 : n;
    if (idx !== this.tablets) {
      this.hooks.toast(idx < this.tablets ? 'You have already made that choice.' : this.tablets === 6 ? 'The sixth tablet points to the rusty chest.' : 'Another tablet calls to you first — follow them in order.', '#c8b890');
      return;
    }
    this.hooks.openCreation(idx, () => {
      this.tablets++;
      if (this.tablets >= RITE_STEPS) this.finish();
    });
  }

  private finish() {
    this.profile.created = true;
    this.hooks.flag('rite_done');
    this.step = 'free';
    this.hooks.reveal();
    this.hooks.setTime(0.3);
    this.say('The Herald', '#e8a030', [
      `${this.profile.name}. A fitting name. I will remember it — I remember everything.`,
      'Go out into the light now. The world is wide, and it is waiting to see what you will do with it.',
      'One more thing. Grave robbers dig in the old barrow cemetery, north-east of here. What they took belongs to me. Bring it back — and see what else you find.',
      'I wish you luck, and the right choices. We will meet again.'
    ], () => {});
  }

  // ---------------------------------------------------------------- story dialogue box
  private say(name: string, color: string, lines: string[], done: () => void) { playScene(this.ui, name, color, lines, done); }
}

export { SPRING };
