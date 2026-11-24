// Owns the scene, world streaming, sky, weather, wildlife, player, camera and the loop.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Renderer } from '../engine/renderer';
import { FrameStats } from '../engine/fps';
import { input } from '../engine/input';
import { settings } from '../engine/settings';
import { audio } from '../engine/audio';
import { ShadowSystem } from '../engine/shadows';
import { createTextures } from '../world/textures';
import { COMMON, U, bindTextures, liquidMaterial, terrainMaterial } from '../world/shaders';
import { Sky } from '../world/sky';
import { Weather } from '../world/weather';
import { World } from '../world/world';
import { Regions } from '../world/regions';
import { CHUNK_SIZE, SEA_LEVEL } from '../world/constants';
import { TerrainGen } from '../world/terrain';
import { BIOMES, Biome } from '../world/biomes';
import { Player } from '../entities/player';
import { HeroModel, METAL_ENV } from '../entities/hero';
import { CameraRig } from '../entities/camera-rig';
import { Wildlife } from '../entities/animals';
import { Hud } from '../ui/hud';
import { TouchControls } from '../ui/touch';
import { Inventory } from './inventory';
import { Interaction } from './interaction';
import { Props } from '../world/props';
import { Hotbar } from '../ui/hotbar';
import { Menu } from '../ui/menu';
import { saves, SaveData, SAVE_VERSION } from '../engine/save';
import { Building, Piece } from '../world/building';
import { BuildMode } from './build-mode';
import { Creatures } from '../entities/creatures';
import { Combat, STATUS_LABEL, levelWord, xpForLevel } from './combat';
import { showDeath } from '../ui/screens';
import { ITEMS } from '../data/items';
import { HOTBAR, Stack } from './inventory';
import { Villagers } from '../entities/villagers';
import { Dialogue, biomeName } from './dialogue';
import type { AABB } from '../world/building';
import { Story, StorySave } from './story';
import { openCreation } from '../ui/creation';
import { applyProfile, Traits } from './profile';
import { TOWER, GRAVEYARD } from '../data/story';
import { QuestLog, QuestSave } from './quests';
import { Chapters, ChapterSave } from './chapters';
import { WorldMap, MapSave, MapMarker } from '../ui/map';
import { renderJournal } from '../ui/journal';
import { Projectiles } from './projectiles';
import { gearTotals, wornLook } from './equipment';
import { Delves, DelveState } from './delves';
import { Watcher, WatchSave } from './watcher';
import { Herald, HeraldSave } from './herald';
import { Saga, SagaSave, Ending } from './saga';
import { FrescoLog, FrescoEvent, FrescoKind, showFresco } from './fresco';
import { OddJobs, JobsSave } from './oddjobs';
import { WorldEvents, EventsSave } from './events';
import { Codex, CodexSave } from './codex';
import { COINS, LORE, AchState } from '../data/achievements';
import { SETS } from '../data/gear';
import { playScene } from '../ui/scene';
import { Soundscape } from './soundscape';
import { Hints } from './hints';
import { Fx, fxKindFor } from './fx';
import { SORCERER } from '../data/story';
import { ENEMIES } from '../data/enemies';

const SPAWN = { x: 0.5, z: 0.5 };

export interface GameStart { slot: number; seed: number; data: SaveData | null; mode: 'wanderer' | 'onelife'; }

export class Game {
  private renderer: Renderer;
  private scene = new THREE.Scene();
  readonly world: World;
  readonly sky: Sky;
  readonly weather = new Weather();
  readonly gen: TerrainGen;
  readonly regions: Regions;
  readonly wildlife: Wildlife;
  readonly shadows = new ShadowSystem();
  readonly player = new Player();
  readonly rig = new CameraRig();
  readonly model = new HeroModel();
  private stats: FrameStats;
  private hud: Hud;
  readonly touch: TouchControls;
  private running = false;
  private paused = false;
  private last = 0;
  private acc = 0;
  private spawned = false;
  private elapsed = 0;
  gold = 0;
  /** sound state, refreshed twice a second */
  lastKillT = 99; inTavern = false; waterDistance = 99; nearFire = 0;
  get heraldNear() { return this.herald.present; }
  get isUnderwater() { return this.underwater; }
  private soundT = 0;
  readonly fx = new Fx();
  private hitStop = 0;
  readonly sound: Soundscape;
  private hints!: Hints;
  /** for hints */
  get elapsedTime() { return this.elapsed; }
  useVisible = false;
  get inVillage() { return !!this.villagers.current && this.villagers.current.site.id !== 'citadel'; }
  get dialogOpen() { return this.dialogue.isOpen || this.story.busy || this.menu.isOpen || this.creating; }
  isWearable(id: string) { return !!ITEMS[id]?.armor; }
  readonly creatures: Creatures;
  readonly combat: Combat;
  private shake = 0;
  private lostPack: { x: number; y: number; z: number; items: (Stack | null)[] } | null = null;
  private lostMarker: THREE.Mesh;
  private dying = false;
  readonly villagers: Villagers;
  readonly dialogue: Dialogue;
  private rentedBed: { x: number; y: number; z: number } | null = null;
  readonly inventory = new Inventory();
  readonly props: Props;
  readonly building: Building;
  readonly build: BuildMode;
  private boxes: AABB[] = [];
  readonly interaction: Interaction;
  private hotbar: Hotbar;
  private menu: Menu;
  private playTime = 0;
  private autosave = 120;
  private created = Date.now();
  private spawnAt: { x: number; y: number; z: number; yaw: number } | null = null;
  private biomeTimer = 0;
  biome: Biome = Biome.MoonlitForest;
  private regionId = '';
  // lights for standard (Lambert) materials – the player model
  private sunLight = new THREE.DirectionalLight(0xffffff, 1);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  private fog = new THREE.Fog(0x000000, 40, 96);
  readonly story: Story;
  readonly quests: QuestLog;
  readonly chapters: Chapters;
  readonly map: WorldMap;
  private travelMode = false;
  readonly projectiles: Projectiles;
  private gearKey = '';
  readonly bossesDefeated = new Set<string>();
  readonly delves: Delves;
  readonly watcher: Watcher;
  readonly herald: Herald;
  readonly saga: Saga;
  readonly fresco = new FrescoLog();
  private fightSeen = new Set<object>();
  readonly jobs: OddJobs;
  readonly events: WorldEvents;
  readonly codex = new Codex();
  private achTimer = 3;
  private lastDay = -1;
  private questTimer = 0;
  traits!: Traits;
  private creating = false;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement, private start0: GameStart) {
    const seed = start0.seed;
    this.renderer = new Renderer(canvas);
    bindTextures(createTextures(this.renderer.anisotropy));
    this.sky = new Sky(COMMON);
    this.gen = new TerrainGen(seed);
    this.regions = new Regions(this.gen, seed);
    this.world = new World(seed, settings.values.viewDistance, terrainMaterial(), liquidMaterial(), this.shadows);
    this.wildlife = new Wildlife(this.world, this.gen, this.shadows);
    this.props = new Props(this.shadows);
    this.building = new Building(this.shadows);
    this.wildlife.isSafe = (p) => this.building.isSafe(p);
    this.creatures = new Creatures(this.world, this.gen, this.building, this.shadows, {
      strike: () => {}, toast: (t, c) => this.hotbar.notify(t, c),
      shoot: (c) => this.enemyShoot(c),
      slam: (c, radius, dmg, type) => {
        this.shake = Math.max(this.shake, 0.5);
        audio.impact(true);
        const p = this.player.pos;
        if (Math.hypot(p.x - c.pos.x, p.z - c.pos.z) < radius && p.y < c.pos.y + 2.5) {
          const from = c.pos.clone().sub(p).setY(0).normalize().add(p);
          this.combat.hitPlayer(from, dmg, type, ['stun', 0.5], c.def.name);
        }
      }
    });
    this.lostMarker = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.2, 1.2) }));
    this.lostMarker.visible = false;
    this.villagers = new Villagers(ui, this.world, this.gen, this.building, this.shadows, this.creatures);
    this.scene.add(this.sky.mesh, this.world.group, this.wildlife.group, this.model.root, this.weather.mesh, this.sunLight, this.hemi, this.props.group, this.building.group, this.creatures.group, this.lostMarker, this.villagers.group);
    this.shadows.add(this.model.root);
    this.scene.add(this.model.trail, this.fx.points);
    this.scene.fog = this.fog;
    // a soft environment for metal and gloss on the hero, weapons and shields
    const pmrem = new THREE.PMREMGenerator(this.renderer.gl);
    METAL_ENV.tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.applySettings();
    settings.onChange((_s, k) => { if (['viewDistance', 'shadows', 'vegetation', 'particles'].includes(k)) this.applySettings(); });

    this.touch = new TouchControls(ui, [
      { name: 'jump', label: 'Jump', size: 92, right: 30, bottom: 30 },
      { name: 'attack', label: 'Strike', size: 92, right: 140, bottom: 92 },
      { name: 'dodge', label: 'Dodge', size: 68, right: 34, bottom: 140 },
      { name: 'interact', label: 'Use', size: 84, right: 150, bottom: 200 },
      { name: 'block', label: 'Block', size: 76, right: 246, bottom: 34 }
    ]);
    this.hud = new Hud(ui, () => this.openMenu(), () => { this.rig.firstPerson = !this.rig.firstPerson; }, () => this.build.toggle());
    this.hotbar = new Hotbar(ui, this.inventory);
    const cross = document.createElement('div'); cross.className = 'crosshair'; ui.appendChild(cross);
    this.stats = new FrameStats(ui);
    this.menu = new Menu(ui, this.inventory, {
      stations: () => this.props.stationsNear(this.player.pos),
      save: () => this.save(),
      exportSave: async () => { await this.save(); saves.exportFile(this.buildSave()); },
      quit: () => { location.href = location.pathname; },
      onClose: () => { this.travelMode = false; this.setPaused(false); },
      renderMap: (host) => this.map.render(host, () => this.mapMarkers(), {
        travel: this.travelMode ? (id, label) => this.travel(id, label) : undefined
      }),
      renderJournal: (host) => renderJournal(host, this.quests, () => {}),
      renderCodex: (host) => this.codex.render(host, this.creatures.kills),
      itemAction: (id) => id === 'wish_shard' ? { label: 'Call the Herald', run: () => this.herald.wish() }
        : id === 'sealed_box' ? { label: 'Open the box', run: () => this.herald.openBox() } : null
    });
    this.interaction = new Interaction(this.world, this.player, this.model, this.inventory, this.props, this.building, {
      setAction: (l) => { this.useVisible = !!l; this.touch.setVisible('interact', !!l && !this.build.active); if (l) this.touch.setLabel('interact', l); },
      setAttack: (l) => this.touch.setLabel('attack', l),
      toast: (t, c) => this.hotbar.notify(t, c),
      openCrafting: () => { this.setPaused(true); this.menu.open('crafting'); },
      special: (p) => this.special(p),
      openChest: (p) => { if (p.gen) { this.hotbar.notify('This chest belongs to someone else.', '#e08070'); return; } if (p.items) { this.setPaused(true); this.menu.openChest(p.items); } },
      sleep: (p) => {
        if (p.gen && !(this.rentedBed && Math.hypot(this.rentedBed.x - p.x, this.rentedBed.z - p.z) < 1.5)) { this.hotbar.notify('This bed is not yours. Rent a room from the innkeeper.', '#e08070'); return; }
        this.sleep(p);
      }
    });
    this.build = new BuildMode(ui, this.building, this.world, this.player, this.inventory, {
      toast: (t, c) => this.hotbar.notify(t, c),
      onToggle: (on) => {
        for (const b of ['attack', 'interact', 'dodge', 'jump'] as const) this.touch.setVisible(b, !on && b !== 'interact');
        this.hotbar.root.style.display = on ? 'none' : 'flex';
        this.rig.distance = on ? 6 : 4.4;
      }
    });
    this.scene.add(this.interaction.group);
    this.touch.setVisible('interact', false);
    this.combat = new Combat(ui, this.player, this.creatures, this.wildlife, this.inventory, {
      toast: (t, c) => this.hotbar.notify(t, c),
      addGold: (n) => { this.gold += n; },
      shake: (a) => { this.shake = Math.max(this.shake, a); },
      onLevel: (lv) => { this.hotbar.notify(`You're a ${levelWord(lv)} now.`, '#f0d070'); audio.levelUp(); if (lv % 5 === 0) this.logEvent('level', `Became a ${levelWord(lv)}`); }
    });
    this.interaction.combat = this.combat;
    this.combat.onLand = (c, heavy) => {
      const at = c.pos.clone().setY(c.pos.y + c.hover + c.def.height * (c.def.scale ?? 1) * 0.6);
      const dir = c.pos.clone().sub(this.player.pos).setY(0).normalize();
      this.fx.burst(at, fxKindFor(c.def.id), dir, heavy ? 26 : 14);
      this.hitStop = Math.max(this.hitStop, heavy ? 0.11 : 0.06);
    };
    this.projectiles = new Projectiles(this.world, this.creatures, this.player, {
      hitCreature: (c, dmg, type, from) => this.combat.projectileHit(c, dmg, type, from),
      hitPlayer: (from, dmg, type, status, name) => this.combat.hitPlayer(from, dmg, type, status, name),
      burst: () => {}
    });
    this.combat.shoot = (from, dir, speed, dmg, type, kind) => this.projectiles.fire(kind, from, dir, speed, dmg, type, { fromPlayer: true });
    this.scene.add(this.projectiles.group);
    this.inventory.onChange(() => this.onGearChange());
    this.interaction.creatures = this.creatures;
    this.interaction.wildlife = this.wildlife;
    this.dialogue = new Dialogue(ui, this.inventory, this.villagers, {
      gold: () => this.gold, addGold: (n) => { this.gold = Math.max(0, this.gold + n); },
      hours: () => this.sky.hours, day: () => this.sky.day, weather: () => this.weather.kind,
      playerName: () => this.story.profile.created ? this.story.profile.name : 'stranger',
      biomeToward: (dx, dz) => biomeName(this.gen.column(Math.floor(this.player.pos.x + dx * 400), Math.floor(this.player.pos.z + dz * 400)).biome),
      rentRoom: (n) => {
        const bed = this.villagers.villageOf(n).layout.buildings.find((b) => b.kind === 'tavern')?.beds[0];
        if (bed) { this.rentedBed = bed; this.building.respawn = new THREE.Vector3(bed.x, bed.y, bed.z); }
        this.hotbar.notify('The room is yours for the night. Sleep in the tavern bed.', '#c8d8ff');
      },
      toast: (t, c) => this.hotbar.notify(t, c),
      onOpen: () => { this.touch.setVisible('interact', false); },
      onClose: () => {},
      priceMul: () => this.traits?.priceMul ?? 1,
      extraOptions: (n) => {
        const v = this.villagers.villageOf(n);
        const out = [...this.chapters.dialogueOptions(n, () => this.dialogue.close()), ...this.herald.dialogueOptions(n.name, v.site.name, n.job, n.rep, () => this.dialogue.close())];
        if (n.job !== 'child' && n.rep > -20 && !this.jobs.defs.some((q) => q.giver === n.name && !this.quests.isDone(q.id) && !!this.quests.get(q.id))) out.push(['“Any trouble around here?”', () => {
          this.dialogue.close();
          const q = this.jobs.make(v.site.x, v.site.z, n.name.split(' ')[0], v.site.name, 1 + Math.hypot(v.site.x, v.site.z) / 450 + this.combat.level * 0.05);
          q.giver = n.name;
          this.quests.start(q.id);
          this.hotbar.notify(`${n.name.split(' ')[0]}: “${q.desc}”`, '#e8d8a8');
        }]);
        if (n.job === 'guard') { const a = this.saga.allyOption(n.name.split(' ')[0], v.site.id, v.site.name, n.rep); if (a) out.push([a[0], () => { this.dialogue.close(); a[1](); }]); }
        return out;
      }
    });
    this.villagers.onEnterVillage = (v) => {
      this.map.places.add(`${v.site.name}@${Math.round(v.site.x)},${Math.round(v.site.z)}`);
      this.hud.showRegion(v.site.name, `Village · ${Math.round(this.villagers.villageRep(v.site.id)) >= 25 ? 'You are welcome here' : 'Strangers are watched here'}`);
      void this.save();
    };
    this.interaction.extra = () => {
      if (this.story.nearStranger() && !this.story.busy) return this.story.strangerBack ? { label: 'Ask about the fresco', run: () => this.saga.strangerTruth_() } : { label: 'Speak to the Stranger', run: () => this.story.talkStranger() };
      const lp = this.lostPack;
      if (!lp || this.player.pos.distanceTo(new THREE.Vector3(lp.x, lp.y, lp.z)) > 2.5) {
        const npc = this.dialogue.isOpen ? null : this.villagers.talkable(this.player.pos, this.player.yaw);
        return npc ? { label: `Talk to ${npc.name.split(' ')[0]}`, run: () => this.dialogue.open(npc) } : null;
      }
      return { label: 'Recover your pack', run: () => {
        let lost = 0;
        for (const st of lp.items) if (st) lost += this.inventory.add(st.id, st.n);
        this.lostPack = null;
        this.hotbar.notify(lost ? 'You recover what you can carry.' : 'You recover your belongings.', '#e8d8a8');
      } };
    };
    this.map = new WorldMap(this.gen);
    this.quests = new QuestLog(this.inventory, {
      place: (p) => this.chapters.place(p),
      reward: (g, xp) => { this.gold += g; if (xp) this.combat.gainXp(xp); },
      toast: (t, c) => this.hotbar.notify(t, c),
      day: () => this.sky.day,
      onStage: () => {},
      onComplete: (q) => { if (q.chapter) this.logEvent('quest', q.title); void this.save(); }
    });
    this.chapters = new Chapters(ui, this.gen, this.world, this.building, this.player, this.creatures, this.quests, this.map, {
      toast: (t, c) => this.hotbar.notify(t, c),
      gold: () => this.gold, addGold: (n) => { this.gold += n; },
      give: (id, n) => { const left = this.inventory.add(id, n); if (left) this.hotbar.notify('Your pack is full.', '#e08070'); },
      openStash: (items) => { this.setPaused(true); this.menu.openChest(items); },
      openTravelMap: () => { this.travelMode = true; this.setPaused(true); this.menu.open('map'); },
      pause: (p) => this.setPaused(p),
      queenDead: () => this.bossesDefeated.has('scorpion_queen')
    });
    this.delves = new Delves(this.gen, this.world, this.building, this.player, this.creatures, this.map, this.inventory, {
      toast: (t, c) => this.hotbar.notify(t, c), addGold: (n) => { this.gold += Math.round(n * this.combat.perks.gold); },
      day: () => this.sky.day, bossDead: () => false, log: (t) => this.logEvent('dungeon', t)
    });
    this.creatures.onDeath = (c) => { this.lastKillT = 0; audio.death(); if (c.elite) this.codex.inc('elites'); if (!c.ally && Math.random() < 0.035) { const coin = COINS[Math.floor(Math.random() * COINS.length)]; if (this.inventory.add(coin, 1) === 0) this.hotbar.notify(`An old coin glints in the dirt: ${ITEMS[coin].name}.`, '#d8b050'); } this.quests.onKill(c.def.id, c.pos); if (c.def.boss) this.bossDefeated(c); if (c.elite && Math.random() < 0.1) { if (this.inventory.add('wish_shard', 1) === 0) this.hotbar.notify('A wish shard glows among the remains.', '#40e070'); } };
    this.watcher = new Watcher(this.player, this.creatures, () => this.regions.at(this.player.pos.x, this.player.pos.z).name);
    this.combat.onEvent = (e, kind) => this.watcher.event(e, kind);
    const remember = this.villagers.remember.bind(this.villagers);
    this.villagers.remember = (n, what, delta, spread) => {
      remember(n, what, delta, spread);
      const first = n.name.split(' ')[0];
      if (delta > 0) this.watcher.inc('kind', first); else if (delta < 0) this.watcher.inc('kind', '-' + first);
    };
    this.story = new Story(ui, this.world, this.building, this.player, this.creatures, this.props, {
      toast: (t, c) => this.hotbar.notify(t, c),
      objective: (t, at) => this.hud.setObjective(t, at, this.player.pos, this.rig.yaw),
      setTime: (t) => { this.sky.time = t; },
      openCreation: (step, done) => {
        this.creating = true;
        this.touch.setVisible('interact', false);
        openCreation(ui, step, this.story.profile, { mode: this.start0.mode }, {
          preview: (look) => this.model.setLook(look),
          give: (id, n) => { const left = this.inventory.add(id, n); if (left) this.hotbar.notify('Your pack is full.', '#e08070'); },
          toast: (t, c) => this.hotbar.notify(t, c),
          close: () => { this.creating = false; this.rig.distance = 4.4; this.applyProfile(); }
        }, () => { done(); void this.save(); });
      },
      reveal: () => this.reveal(),
      flag: (f) => this.quests.flag(f)
    });
    this.scene.add(this.story.group);
    this.herald = new Herald(ui, this.world, this.player, this.creatures, this.quests, this.watcher, this.inventory, this.combat, {
      name: () => this.story.profile.name,
      gold: () => this.gold, addGold: (n) => { this.gold = Math.max(0, this.gold + n); },
      day: () => this.sky.day, hours: () => this.sky.hours,
      toast: (t, c) => this.hotbar.notify(t, c),
      log: (k, t) => this.logEvent(k, t),
      give: (id, n) => this.inventory.add(id, n) === 0,
      levelUp: () => { this.combat.gainXp(Math.max(1, xpForLevel(this.combat.level + 1) - this.combat.xp)); },
      levelDown: () => { if (this.combat.level > 1) { this.combat.level--; this.combat.xp = xpForLevel(this.combat.level); this.applyProfile(); } },
      revealMap: (r) => this.map.reveal(this.player.pos.x, this.player.pos.z, r),
      spawnPet: () => this.spawnPet(),
      nearestDungeon: () => { const p = this.player.pos; const ds = this.gen.dungeonsNear(p.x, p.z, 1300).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)); const d = ds[0]; return d ? { x: d.entrance.x, z: d.entrance.z, name: d.name } : null; },
      villageWithMerchant: () => { const v = this.nearestVillageSite(); if (!v) return null; const m = this.villagers.all().find((n) => n.village === v.id && n.job === 'merchant'); return { x: v.x, z: v.z, name: v.name, merchant: m?.name ?? 'the merchant' }; },
      nearestVillage: () => { const v = this.nearestVillageSite(); return v ? { x: v.x, z: v.z, name: v.name } : null; },
      applyProfile: () => this.applyProfile()
    });
    this.scene.add(this.herald.group);
    this.saga = new Saga(ui, this.gen, this.world, this.building, this.player, this.creatures, this.quests, this.herald, this.watcher, {
      toast: (t, c) => this.hotbar.notify(t, c),
      log: (k, t) => this.logEvent(k, t),
      give: (id, n) => this.inventory.add(id, n) === 0,
      showStranger: (on) => { this.story.strangerBack = on; },
      endingScreen: (e) => this.endingScreen(e)
    });
    this.chapters.extraPlace = (p) => this.saga.place(p);
    this.jobs = new OddJobs(this.gen, this.world, this.player, this.creatures, this.quests);
    this.chapters.extraNotices = () => { const c = this.chapters.citadel; return this.jobs.boardNotices(c.x, c.z, this.sky.day, 1 + Math.hypot(c.x, c.z) / 450 + this.combat.level * 0.05); };
    this.events = new WorldEvents(ui, this.gen, this.building, this.player, this.creatures, this.inventory, this.map, {
      toast: (t, c) => this.hotbar.notify(t, c), log: (k, t) => this.logEvent(k, t),
      gold: () => this.gold, addGold: (n) => { this.gold = Math.max(0, this.gold + n); },
      day: () => this.sky.day, hours: () => this.sky.hours,
      villageHere: () => { const v = this.gen.village(this.player.pos.x, this.player.pos.z); return v && v.id !== 'citadel' ? { id: v.id, name: v.name, x: v.x, z: v.z } : null; },
      pause: (p) => this.setPaused(p)
    });
    this.scene.add(this.events.group);
    let pickT = 0;
    this.inventory.onAdd = (id) => { this.codex.seen.add(id); const now = performance.now(); if (this.spawned && now - pickT > 150) { pickT = now; audio.pickup(); } };
    this.sound = new Soundscape(this);
    this.hints = new Hints(ui, this);
    const craft = this.inventory.craft.bind(this.inventory);
    this.inventory.craft = (r, st) => { const ok = craft(r, st); if (ok) { this.codex.inc('crafted'); audio.craft(); } return ok; };
    this.touch.onTap = (x, y) => {
      if (this.build.active) return;
      const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
      this.combat.tapTarget(ndc, this.renderer.camera);
    };

    // restore or start fresh
    const d = start0.data;
    if (d) {
      this.world.loadDelta(d.world);
      this.props.load(d.props);
      this.inventory.load(d.inventory);
      this.sky.time = d.time; this.sky.day = d.day;
      this.playTime = d.playTime; this.created = d.created;
      this.spawnAt = { x: d.player.pos[0], y: d.player.pos[1], z: d.player.pos[2], yaw: d.player.yaw };
      this.player.life = d.player.life; this.player.stamina = d.player.stamina;
      this.building.load(d.building);
      const st = d.stats!;
      this.gold = st.gold; this.combat.xp = st.xp; this.combat.level = st.level; this.player.maxLife = st.maxLife; this.creatures.kills = { ...st.kills };
      this.lostPack = d.lostPack ?? null;
      this.villagers.saved = d.villagers ?? {};
      this.dialogue.shops = d.shops ?? {};
      this.story.load(d.story as StorySave | undefined);
      this.jobs.load(d.jobs as JobsSave | undefined);
      this.quests.load(d.quests as QuestSave | undefined);
      this.events.load(d.events as EventsSave | undefined);
      this.codex.load(d.codex as CodexSave | undefined);
      this.map.load(d.map as MapSave | undefined);
      this.chapters.load(d.chapters as ChapterSave | undefined);
      this.delves.load(d.dungeons as Record<string, DelveState> | undefined);
      for (const b of d.bosses ?? []) this.bossesDefeated.add(b);
      this.watcher.load(d.watch as WatchSave | undefined);
      this.herald.load(d.herald as HeraldSave | undefined);
      this.saga.load(d.saga as SagaSave | undefined);
      this.fresco.load(d.fresco as FrescoEvent[] | undefined);
      if (!d.quests) { // saves from before the quest log
        this.quests.start('ch1', true);
        if (this.story.step === 'free') for (const f of ['met_stranger', 'met_herald', 'rite_done']) this.quests.flag(f);
      }
    } else {
      this.inventory.add('staff', 1);
      this.story.begin();
      this.quests.start('ch1', true);
    }
    this.model.setLook(this.story.profile.created ? this.story.profile.look : null);
    this.applyProfile();

    this.player.onDamage = () => this.hud.hurt();
    this.player.onDeath = (cause) => this.die(cause);
    this.weather.onThunder = () => audio.thunder();

    document.addEventListener('visibilitychange', () => { this.setPaused(document.hidden); if (document.hidden) void this.save(); });
    window.addEventListener('pagehide', () => { this.setPaused(true); void this.save(); });
    window.addEventListener('pageshow', () => this.setPaused(false));
  }

  private applySettings() {
    const s = settings.values;
    this.world.setViewDistance(s.viewDistance);
    const far = s.viewDistance * CHUNK_SIZE;
    U.uFogNear.value = far * 0.6;
    U.uFogFar.value = far * 0.97;
    this.renderer.camera.far = far + 80;
    this.renderer.camera.updateProjectionMatrix();
    this.shadows.setQuality(s.shadows);
    this.world.vegetation.shadowRadius = this.shadows.radiusM;
    this.world.vegetation.setQuality(s.vegetation);
    this.weather.particleScale = s.particles;
  }

  private openMenu() {
    this.setPaused(true);
    this.menu.open();
  }

  buildSave(): SaveData {
    const p = this.player;
    return {
      version: SAVE_VERSION, slot: this.start0.slot, seed: this.start0.seed, mode: this.start0.mode,
      created: this.created, updated: Date.now(), playTime: this.playTime, day: this.sky.day, time: this.sky.time,
      player: { pos: [p.pos.x, p.pos.y, p.pos.z], yaw: p.yaw, life: p.life, stamina: p.stamina },
      inventory: this.inventory.serialize() as SaveData['inventory'],
      world: this.world.serializeDelta(),
      props: this.props.list,
      building: this.building.serialize(),
      stats: { gold: this.gold, xp: this.combat.xp, level: this.combat.level, maxLife: this.player.maxLife, kills: this.creatures.kills },
      lostPack: this.lostPack,
      villagers: this.villagers.serialize(),
      shops: this.dialogue.shops,
      story: this.story.serialize(),
      quests: this.quests.serialize(),
      map: this.map.serialize(),
      chapters: this.chapters.serialize(),
      dungeons: this.delves.serialize(),
      bosses: [...this.bossesDefeated],
      watch: this.watcher.serialize(),
      herald: this.herald.serialize(),
      saga: this.saga.serialize(),
      fresco: this.fresco.events,
      jobs: this.jobs.serialize(),
      events: this.events.serialize(),
      codex: this.codex.serialize()
    };
  }

  async save() {
    if (!this.spawned) return;
    try { await saves.write(this.buildSave()); } catch (e) { console.warn('save failed', e); }
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) audio.suspend(); else { audio.resume(); this.last = performance.now(); }
  }

  private respawn() {
    const bed = this.building.respawn;
    if (bed) { this.player.spawn(bed.x, bed.y + 0.6, bed.z); return; }
    const y = this.world.groundY(SPAWN.x, SPAWN.z);
    this.player.spawn(SPAWN.x, y + 0.05, SPAWN.z);
  }

  /** Death: Wanderer wakes at home and leaves the pack behind; One Life ends forever. */
  private die(cause: string) {
    if (this.dying) return;
    this.dying = true;
    this.chapters.onPlayerDeath();
    this.watcher.inc('deaths', cause);
    this.logEvent('death', `Died of ${cause}`);
    this.combat.status.clear();
    this.combat.lock = null;
    if (this.start0.mode === 'onelife') {
      const day = this.sky.day + 1, level = this.combat.level;
      void (async () => {
        await saves.remove(this.start0.slot);
        await saves.addGrave({ name: this.story.profile.name, cause, day, level, date: Date.now(), seed: this.start0.seed });
      })();
      this.spawned = false; // no more saving
      setTimeout(() => showDeath('HERE ENDS THE JOURNEY', `${this.story.profile.name} — a ${levelWord(level)} — died of ${cause} on day ${day}. A stone in the Cemetery of the Fallen now bears their name. There was only ever one chance.`, 'Return', () => { location.href = location.pathname; }), 1500);
      return;
    }
    const lostGold = Math.floor(this.gold * 0.1);
    this.gold -= lostGold;
    // everything in the pack (not the belt) stays where you fell
    const items: (Stack | null)[] = [];
    for (let i = HOTBAR; i < this.inventory.slots.length; i++) { if (this.inventory.slots[i]) items.push(this.inventory.slots[i]); this.inventory.slots[i] = null; }
    this.inventory.changed();
    if (items.length) { const p = this.player.pos; this.lostPack = { x: p.x, y: p.y, z: p.z, items }; }
    setTimeout(() => showDeath('YOU HAVE FALLEN', `You died of ${cause}.${lostGold ? ` ${lostGold} gold slipped from your purse.` : ''}${items.length ? ' Your pack lies where you fell — go back for it.' : ''}`, 'Wake', () => {
      this.respawn(); this.dying = false; void this.save();
    }), 1200);
  }

  /** A boss falls: a unique from its hoard (one you do not have yet, if possible). */
  private bossDefeated(c: import('../entities/creatures').Creature) {
    const drops = c.def.boss!.drops;
    const owned = (id: string) => this.inventory.count(id) > 0 || Object.values(this.inventory.equip).some((s) => s?.id === id);
    const fresh = drops.filter((d) => !owned(d));
    const pick = (fresh.length ? fresh : drops)[Math.floor(Math.random() * (fresh.length || drops.length))];
    const st = { id: pick, n: 1, dur: ITEMS[pick].tool?.durability || undefined };
    if (this.inventory.addStack(st)) this.hotbar.notify(`${c.def.name} is defeated! You claim ${ITEMS[pick].name}.`, '#e8b030');
    else this.hotbar.notify(`${c.def.name} is defeated! ${ITEMS[pick].name} lies on the ground — your pack is full.`, '#e8b030');
    audio.parry();
    this.combat.gainXp(0);
    this.bossesDefeated.add(c.def.id);
    if (this.inventory.add('wish_shard', 1) === 0) this.hotbar.notify('A wish shard glows in the remains.', '#40e070');
    if (c.def.id === 'hollow_king') this.saga.kingDefeated();
    else setTimeout(() => this.herald.judge(c), 3500);
  }

  /** Record something for the Living Fresco. */
  logEvent(kind: FrescoKind, text: string) { this.fresco.add(this.sky.day, kind, text); if (kind === 'wish') this.codex.inc('wishes'); }

  private refreshSoundState() {
    const p = this.player.pos;
    const v = this.villagers.current;
    this.inTavern = !!v && v.layout.buildings.some((b) => b.kind === 'tavern' && Math.hypot(b.inside.x - p.x, b.inside.z - p.z) < 4.6 && Math.abs(b.inside.y - p.y) < 2);
    let wd = 99;
    for (const r of [3, 8, 14, 20]) { for (let a = 0; a < 8; a++) { const x = p.x + Math.cos(a * 0.785) * r, z = p.z + Math.sin(a * 0.785) * r; const c = this.gen.column(x, z); if (c.liquidLevel > c.height + 0.2 && c.liquid === 5) { wd = r; break; } } if (wd < 99) break; }
    this.waterDistance = wd;
    const fire = this.props.list.some((q) => q.type === 'campfire' && Math.hypot(q.x - p.x, q.z - p.z) < 7) || this.building.pieces.some((q) => (q.id === 'fireplace' || q.id === 'forge') && Math.abs(q.x - p.x) < 6 && Math.abs(q.z - p.z) < 6);
    this.nearFire = fire ? 1 : 0;
  }

  /** Check achievements and collection rewards against a snapshot of the game. */
  private checkAchievements() {
    const kills = this.creatures.kills;
    const total = Object.values(kills).reduce((a, b) => a + b, 0);
    const setCount = new Map<string, number>();
    for (const st of Object.values(this.inventory.equip)) { const set = st && ITEMS[st.id]?.armor?.set; if (set) setCount.set(set, (setCount.get(set) ?? 0) + 1); }
    const w = this.watcher.d;
    const s: AchState = {
      kills: total, killsBy: kills, bosses: [...this.bossesDefeated], level: this.combat.level, gold: this.gold,
      quests: this.quests.finished().length, chapters: this.quests.finished().filter((q) => /^ch\d+$/.test(q.id)).length,
      jobs: this.quests.finished().filter((q) => q.id.startsWith('job')).length,
      dungeons: Object.values(this.delves.state).filter((x) => x.boss).length, uniques: this.codex.uniques,
      setsComplete: [...setCount].filter(([id, n]) => n >= SETS[id].pieces.length).length,
      regions: this.codex.regions.size, herbs: this.codex.count(['fiber', 'petals', 'moonpetal', 'berries', 'mushroom', 'glowcap', 'reed', 'fern', 'cactus_flesh', 'resin']),
      minerals: this.codex.count(['coal', 'copper_ore', 'iron_ore', 'silver_ore', 'gold_ore', 'mithril_ore', 'moonstone', 'crystal_shard', 'flint']),
      lore: this.codex.lore.size, coins: this.codex.count(COINS), deaths: Object.values(w.deaths).reduce((a, b) => a + b, 0),
      obey: w.obey, defy: w.defy, trick: w.trick, wishes: this.codex.counters.wishes ?? 0, pet: this.herald.pet, ending: this.saga.ending,
      villages: [...this.map.places].filter((p) => !p.startsWith('dg:') && !p.startsWith('The Pale')).length, waystones: this.map.waystones.size,
      built: this.building.pieces.filter((p) => !p.gen).length, crafted: this.codex.counters.crafted ?? 0, playHours: this.playTime / 3600,
      nights: this.codex.counters.nights ?? 0, biomes: this.codex.biomes.size, arenaWins: this.chapters.arenaWins, events: this.events.counts,
      parries: w.parries, mode: this.start0.mode, elites: this.codex.counters.elites ?? 0, bestiary: Object.keys(kills).length,
      equipped: Object.values(this.inventory.equip).filter(Boolean).length, truth: w.truth
    };
    for (const name of this.codex.check(s)) { this.hotbar.notify(`Achievement: ${name}`, '#e8b030'); audio.achievement(); }
    for (const [name, gold] of this.codex.collectionRewards()) { this.gold += gold; this.hotbar.notify(`Collection complete: ${name}! ${gold} gold.`, '#e8b030'); }
  }

  /** Story pieces: chapters, dungeons, the saga, the fresco, the rite. */
  private special(p: Piece) {
    if (p.id === 'lore_page') {
      const i = Number((p.items?.[0]?.id ?? 'lore:0').split(':')[1]) % LORE.length, l = LORE[i];
      const fresh = !this.codex.lore.has(l.id);
      this.codex.lore.add(l.id);
      playScene(document.getElementById('ui')!, l.title, '#d8c8a0', [l.text], () => { if (fresh) this.hotbar.notify(`Lore page added to the Codex (${this.codex.lore.size}/${LORE.length}).`, '#d8c8a0'); });
      return;
    }
    if (this.events.special(p)) return;
    if (p.id === 'fresco') { this.setPaused(true); showFresco(document.getElementById('ui')!, this.fresco, this.saga.frescoViewed(), () => this.setPaused(false)); return; }
    if (p.id === 'grave_pit') { if (!this.herald.digGrave()) this.hotbar.notify('An empty grave, waiting for someone.', '#a8987c'); return; }
    if (this.chapters.special(p) || this.delves.openChest(p) || this.saga.special(p)) return;
    this.story.useSpecial(p);
  }

  private spawnPet() {
    const p = this.player.pos;
    const x = p.x + 1.5, z = p.z + 1.5;
    if (!this.world.isLoaded(x, z)) return;
    const c = this.creatures.spawn(ENEMIES.loyal_hound, new THREE.Vector3(x, this.world.groundY(x, z), z), 1 + this.combat.level * 0.15, 0);
    c.ally = true; c.elite = false; c.state = 'idle';
  }

  private nearestVillageSite() {
    const p = this.player.pos;
    let best: import('../world/villages').VillageSite | null = null, bd = Infinity;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      const v = this.gen.village((Math.floor(p.x / 560) + i + 0.5) * 560, (Math.floor(p.z / 560) + j + 0.5) * 560);
      if (v && v.id !== 'citadel') { const d = Math.hypot(v.x - p.x, v.z - p.z); if (d < bd) { bd = d; best = v; } }
    }
    return best;
  }

  /** The end of the main story. */
  private endingScreen(e: Ending) {
    const name = this.story.profile.name;
    const text: Record<Ending, [string, string]> = {
      obey: ['THE HERALD’S CROWN', `${name} lifted the hollow crown and set it on their head. It fit. The Herald smiled, and for the first time his smile reached his amber eyes — which were now also ${name}’s eyes. Somewhere, a new faceless one is waking in a moonlit clearing. You will be waiting for them.`],
      resist: ['THE BROKEN OATH', `${name} brought the crown down on the black stone until it split. The Herald did not shout. He only sighed, and his horse walked away into the dark, and the hoofbeats grew quieter for a long time. The rules are broken. The world is yours to wander — and it is a little brighter.`],
      truth: ['THE SORCERER’S WILL', `${name} said the name aloud: ${SORCERER}. The Herald stopped. Across the land, by a fire that had burned for three hundred years, the Ashen Stranger stood up. Two halves of one will met at last, and with a sound like a long breath let out, both were gone. You remember something, then — a face, your own, and a name that is not one the gnome gave you.`]
    };
    const [title, body] = text[e];
    void this.save();
    setTimeout(() => showDeath(title, `${body}\n\nThe story is over. The world stays open: keep exploring, finish your errands, clear the dungeons — and see what the Fresco paints next.`, 'Continue your journey', () => { this.setPaused(false); }), 600);
  }

  /** An enemy releases its ranged attack: aim at the player with a little lead. */
  private enemyShoot(c: import('../entities/creatures').Creature) {
    const r = c.def.ranged; if (!r) return;
    const from = c.pos.clone().setY(c.pos.y + c.hover + c.def.height * (c.def.scale ?? 1) * 0.7);
    const target = this.player.pos.clone().setY(this.player.pos.y + 1.1);
    const t = from.distanceTo(target) / r.speed;
    target.addScaledVector(this.player.vel, t * 0.6);
    if (r.kind === 'arrow') target.y += 0.5 * 9 * t * t;
    const dir = target.sub(from).normalize();
    const type = r.kind === 'fireball' ? 'fire' : r.kind === 'frost' ? 'ice' : r.kind === 'shadow' ? 'shadow' : r.kind === 'spit' ? 'poison' : r.kind === 'arrow' ? 'pierce' : c.def.dmgType;
    this.projectiles.fire(r.kind, from, dir, r.speed, c.def.dmg * c.dmgMul * (r.dmgMul ?? 1), type, { fromPlayer: false, owner: c, status: c.def.onHit, name: c.def.name, splash: r.splash });
  }

  /** Markers for the world map. */
  private mapMarkers(): MapMarker[] {
    const p = this.player.pos;
    const out: MapMarker[] = [{ x: p.x, z: p.z, kind: 'player', yaw: this.player.yaw }];
    const home = this.building.respawn;
    if (home) out.push({ x: home.x, z: home.z, kind: 'home', label: 'Home' });
    out.push({ x: TOWER.x, z: TOWER.z, kind: 'landmark', label: 'The Tower' });
    const parse = (s: string) => { const [name, xz] = s.split('@'); const [x, z] = xz.split(',').map(Number); return { name, x, z }; };
    for (const s of this.map.places) { const dg = s.startsWith('dg:'); const q = parse(dg ? s.slice(3) : s); out.push({ x: q.x, z: q.z, kind: dg ? 'dungeon' : q.name === 'The Pale Citadel' ? 'citadel' : 'village', label: q.name }); }
    if (this.quests.get('ch2')) out.push({ x: GRAVEYARD.x, z: GRAVEYARD.z, kind: 'landmark', label: 'Barrow Cemetery' });
    if (this.quests.get('ch3')) { const e = this.chapters.labEntrance; out.push({ x: e.x, z: e.z, kind: 'landmark', label: 'Labyrinth' }); out.push({ x: this.chapters.citadel.x, z: this.chapters.citadel.z, kind: 'citadel', label: 'The Pale Citadel' }); }
    for (const w of this.map.waystones) { const q = parse(w); out.push({ x: q.x, z: q.z, kind: 'waystone', label: q.name, id: w }); }
    for (const [x, z] of this.map.pins) out.push({ x, z, kind: 'pin' });
    if (this.lostPack) out.push({ x: this.lostPack.x, z: this.lostPack.z, kind: 'pack', label: 'Your pack' });
    const o = this.quests.trackedObjective();
    if (o?.at) out.push({ x: o.at.x, z: o.at.z, kind: 'quest', label: o.text });
    return out;
  }

  /** Fast travel to a discovered waystone. */
  private travel(id: string, label: string) {
    const [, xz] = id.split('@'); const [x, z] = xz.split(',').map(Number);
    if (Math.hypot(x - this.player.pos.x, z - this.player.pos.z) < 20) { this.hotbar.notify('You are already here.', '#a8987c'); return; }
    if (this.gold < 10) { this.hotbar.notify('Travel costs 10 gold.', '#e08070'); return; }
    this.gold -= 10;
    this.menu.close();
    this.travelMode = false;
    const tx = x + 1.5, tz = z + 1.5;
    this.spawnAt = { x: tx, y: this.gen.column(Math.floor(tx), Math.floor(tz)).height + 0.5, z: tz, yaw: this.player.yaw };
    this.player.pos.set(tx, this.spawnAt.y, tz);
    this.spawned = false;
    this.hotbar.notify(`The waystone hums. You step out at ${label}.`, '#80c0ff');
  }

  /** Re-derive stats and perks from the character profile. */
  /** Equipment or held item changed: stats and (if worn pieces changed) the hero's look. */
  private onGearChange() {
    if (!this.story) return;
    this.applyProfile();
    const key = JSON.stringify(this.inventory.equip);
    if (key !== this.gearKey) { this.gearKey = key; this.model.setGear(wornLook(this.inventory)); }
  }

  applyProfile() {
    this.traits = applyProfile(this.story.profile, this.player, this.combat, this.interaction, this.combat.level, gearTotals(this.inventory));
    U.uNightEye.value = this.traits.nightEye ? 1 : 0;
    this.interaction.carriedLight = this.traits.light;
  }

  /** The end of the First Rite: fade, the new face, morning outside the tower. */
  private reveal() {
    const fade = document.createElement('div'); fade.className = 'fade'; fade.textContent = this.story.profile.name.toUpperCase();
    document.getElementById('ui')!.appendChild(fade);
    requestAnimationFrame(() => { fade.style.opacity = '1'; });
    setTimeout(() => {
      this.model.setLook(this.story.profile.look);
      this.applyProfile();
      this.player.life = this.player.maxLife; this.player.stamina = this.player.tune.staminaMax;
      const x = TOWER.x + 0.5, z = TOWER.z + 7;
      this.player.spawn(x, this.world.groundY(x, z) + 0.1, z);
      this.player.yaw = 0; this.rig.yaw = Math.PI; this.rig.pitch = -0.1;
      fade.style.opacity = '0';
      setTimeout(() => fade.remove(), 1300);
      this.hud.showRegion(this.story.profile.name, 'The First Rite is done');
      this.logEvent('rite', `${this.story.profile.name} receives a face`);
      void this.save();
    }, 1600);
  }

  /** Sleep in a bed: sets the respawn point; at night, skip to morning. */
  private sleep(p: Piece) {
    this.building.respawn = new THREE.Vector3(p.x, p.y, p.z);
    if (!this.sky.isNight) { this.hotbar.notify('You are not tired. This bed now marks your home.', '#c8d8ff'); void this.save(); return; }
    const fade = document.createElement('div'); fade.className = 'fade'; fade.textContent = 'YOU SLEEP…';
    document.getElementById('ui')!.appendChild(fade);
    requestAnimationFrame(() => { fade.style.opacity = '1'; });
    setTimeout(() => {
      if (this.sky.time > 0.5) this.sky.day++;
      this.sky.time = 0.26;
      this.player.life = 100; this.player.stamina = 100;
      this.player.spawn(p.x + Math.cos(p.rot) * 1.0, p.y + 0.1, p.z - Math.sin(p.rot) * 1.0);
      void this.save();
      fade.style.opacity = '0';
      setTimeout(() => fade.remove(), 1300);
      this.hotbar.notify('Morning comes. You feel rested.', '#f0e0a0');
    }, 1500);
  }

  private trySpawn() {
    const s = this.spawnAt;
    if (!s) { if (this.world.isLoaded(SPAWN.x, SPAWN.z)) { this.respawn(); this.spawned = true; } return; }
    if (!this.world.isLoaded(s.x, s.z)) return;
    const life = this.player.life, st = this.player.stamina;
    this.player.spawn(s.x, Math.max(s.y, this.world.groundNear(s.x, s.z, s.y)) + 0.05, s.z);
    this.player.life = life; this.player.stamina = st; this.player.yaw = s.yaw; this.rig.yaw = s.yaw;
    this.spawned = true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      let dt = (now - this.last) / 1000;
      const minFrame = settings.values.fpsCap === 30 ? 1 / 30 - 0.004 : 0;
      this.acc += dt;
      this.last = now;
      if (this.acc < minFrame) return;
      dt = Math.min(this.acc, 0.1);
      this.acc = 0;
      if (this.paused) return;
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  private frame(dt: number) {
    // hit-stop: the world holds its breath for a moment when a blow lands
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.1; }
    this.fx.update(dt);
    this.elapsed += dt;
    input.poll(dt);
    if (!this.spawned) this.trySpawn();
    if (this.spawned) {
      this.building.boxesNear(this.player.pos, 3, this.boxes);
      this.player.boxes = this.boxes;
      if (this.creating) {
        // the copper mirror: look at the hero's face
        this.rig.yaw += (this.player.yaw + Math.PI - this.rig.yaw) * Math.min(1, dt * 4);
        this.rig.pitch += (-0.05 - this.rig.pitch) * Math.min(1, dt * 4);
        this.rig.distance = 2.3;
      } else this.player.update(dt, this.world, this.rig.yaw, this.rig.pitch, this.rig.firstPerson);
      this.props.collide(this.player.pos);
      this.playTime += dt;
      this.autosave -= dt;
      if (this.autosave <= 0) { this.autosave = 120; void this.save(); }
    }
    if (input.key('KeyB')) this.build.toggle();
    // the world map: the hotbar via number keys
    for (let i = 0; i < 6; i++) if (input.key(`Digit${i + 1}`)) { this.inventory.selected = i; this.inventory.changed(); }
    const cam = this.renderer.camera;
    // target lock: turn the camera toward the locked enemy
    const lock = this.combat.lock;
    if (lock) {
      const want = Math.atan2(this.player.pos.x - lock.pos.x, this.player.pos.z - lock.pos.z);
      let d = want - this.rig.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.rig.yaw += d * Math.min(1, dt * 6);
      this.rig.pitch += (-0.18 - this.rig.pitch) * Math.min(1, dt * 3);
    }
    this.rig.update(dt, cam, this.player, this.world);
    if (this.shake > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 10);
    }
    if (this.spawned && !this.build.active && !this.creating && !this.story.busy) this.interaction.update(dt, cam, this.elapsed);
    if (this.spawned) {
      this.combat.update(dt, cam);
      this.creatures.update(dt, this.player.pos, this.sky.isNight);
      this.villagers.update(dt, this.player.pos, this.sky.hours, cam);
      this.villagers.tickDoors(dt);
      this.story.update(dt, this.elapsed);
      this.projectiles.update(dt);
      this.chapters.update(dt);
      this.delves.update(dt);
      this.watcher.update(dt, this.sky.isNight);
      this.herald.enabled = this.story.step === 'free' && (this.saga.ending === null || this.saga.ending === 'obey');
      this.herald.update(dt);
      this.saga.update(dt);
      this.events.update(dt);
      this.lastKillT += dt;
      this.soundT -= dt;
      if (this.soundT <= 0) { this.soundT = 0.5; this.refreshSoundState(); }
      this.sound.update(dt);
      this.hints.update(dt);
      this.jobs.update(this.sky.isNight);
      if (this.sky.day !== this.lastDay) { if (this.lastDay >= 0) this.codex.inc('nights'); this.lastDay = this.sky.day; }
      this.achTimer -= dt;
      if (this.achTimer <= 0) { this.achTimer = 4; this.checkAchievements(); }
      this.villagers.gone = new Set(this.herald.gone);
      for (const c of this.creatures.list) if (c.def.boss && c.alerted && c.state !== 'dead' && !this.fightSeen.has(c)) { this.fightSeen.add(c); this.watcher.beginFight(); }
      if (this.herald.pet && !this.creatures.allies.some((c) => c.def.id === 'loyal_hound') && this.spawned) this.spawnPet();
      this.questTimer -= dt;
      if (this.questTimer <= 0) {
        this.questTimer = 0.5;
        this.quests.update(this.player.pos);
        this.map.reveal(this.player.pos.x, this.player.pos.z, 56);
      }
      if (this.story.step === 'free') {
        const o = this.quests.trackedObjective();
        this.hud.setObjective(o?.text ?? null, o?.at ?? null, this.player.pos, this.rig.yaw);
      }
      if (this.dialogue.isOpen && this.player.speed > 1) this.dialogue.close();
      this.model.blocking = this.player.blocking;
      const sh = [0, 1, 2, 3, 4, 5].map((i) => this.inventory.slots[i]).find((x) => x && ITEMS[x.id].shield);
      this.model.setShield(sh ? sh.id : null);
    }
    if (this.lostPack) {
      this.lostMarker.visible = true;
      this.lostMarker.position.set(this.lostPack.x, this.lostPack.y + 0.8 + Math.sin(this.elapsed * 2) * 0.15, this.lostPack.z);
      this.lostMarker.rotation.y += dt;
    } else this.lostMarker.visible = false;
    if (this.spawned) this.build.update(dt, cam);
    this.model.update(dt, this.player, !this.rig.firstPerson && this.spawned);

    // biome & region around the player
    this.biomeTimer -= dt;
    if (this.biomeTimer <= 0 && this.spawned) {
      this.biomeTimer = 0.5;
      const p = this.player.pos;
      this.biome = this.gen.column(Math.floor(p.x), Math.floor(p.z)).biome;
      this.codex.biomes.add(BIOMES[this.biome].name);
      const murky = this.biome === Biome.MistySwamp || this.biome === Biome.SunkenForest;
      if (murky) { U.uWaterShallow.value.setRGB(0.05, 0.07, 0.025); U.uWaterDeep.value.setRGB(0.012, 0.016, 0.006); }
      else { U.uWaterShallow.value.setRGB(0.05, 0.22, 0.2); U.uWaterDeep.value.setRGB(0.004, 0.03, 0.05); }
      const r = this.regions.at(p.x, p.z);
      if (r.id !== this.regionId) {
        this.regionId = r.id;
        this.codex.regions.add(r.name);
        const pips = Math.min(5, Math.ceil(r.danger / 2));
        this.hud.showRegion(r.name, `${BIOMES[this.biome].name} · Danger ${'◆'.repeat(pips)}${'◇'.repeat(5 - pips)}`);
      }
    }

    this.sky.update(dt, cam.position);
    this.events.tintSky();
    this.weather.update(dt, this.biome, this.sky, this.world, cam.position);
    U.uTime.value = this.elapsed;
    U.uFogHeight.value = SEA_LEVEL + 2;
    this.updateLightsAndFog(cam);
    this.world.update(dt, this.player.pos, this.rig.forward, cam);
    if (this.spawned) this.wildlife.update(dt, this.player.pos, this.sky.isNight);
    this.building.update(this.player.pos, cam);
    this.props.update(this.elapsed, this.player.pos, cam, this.building.lights(this.player.pos, this.elapsed));
    this.hotbar.tick();
    this.renderer.gl.info.reset();
    this.shadows.render(this.renderer.gl, this.scene, this.player.pos);
    this.renderer.render(this.scene);
    input.endFrame();

    this.hud.update(this.sky.hours, this.rig.yaw, this.player, this.gold);
    // enemy bar, lock marker, statuses, level
    const t = this.combat.lock ?? this.combat.lastHit;
    if (t && 'def' in t && t.state !== 'dead' && t.pos.distanceTo(this.player.pos) < 30) this.hud.setTarget(t.def.name, t.hp / t.maxHp, t.elite);
    else if (t && !('def' in t) && !t.dead && t.pos.distanceTo(this.player.pos) < 30) this.hud.setTarget('Wild animal', t.hp / t.maxHp);
    else this.hud.setTarget(null);
    const boss = this.creatures.list.find((c) => c.def.boss && c.state !== 'dead' && c.alerted && c.pos.distanceTo(this.player.pos) < 50);
    if (boss) this.hud.setBoss(boss.def.name, boss.def.boss!.title, boss.hp / boss.maxHp); else this.hud.setBoss(null);
    if (lock) {
      const v = lock.pos.clone().setY(lock.pos.y + lock.hover + lock.def.height * 0.6).project(cam);
      Object.assign(this.hud.lockMark.style, { display: v.z < 1 ? 'block' : 'none', left: `${(v.x * 0.5 + 0.5) * innerWidth}px`, top: `${(-v.y * 0.5 + 0.5) * innerHeight}px` });
    } else this.hud.lockMark.style.display = 'none';
    this.hud.setStatus([...this.combat.status.keys()].map((s) => STATUS_LABEL[s]));
    const lv = this.combat.level;
    this.hud.setLevel(lv, (this.combat.xp - xpForLevel(lv)) / Math.max(1, xpForLevel(lv + 1) - xpForLevel(lv)));
    if (settings.values.showFps) {
      const info = this.renderer.gl.info;
      const p = this.player.pos;
      this.stats.extra = `draws ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k\n`
        + `chunks ${this.world.stats.loaded}  gen ${this.world.stats.genMs.toFixed(1)}ms  animals ${this.wildlife.count}\n`
        + `${this.renderer.width}x${this.renderer.height}  vd ${settings.values.viewDistance}  ${BIOMES[this.biome].name}  ${this.weather.kind}\n`
        + `xyz ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)} ${this.player.state}`;
    }
    this.stats.tick(dt);
  }

  private underwater = false;
  private updateLightsAndFog(cam: THREE.PerspectiveCamera) {
    const surface = this.world.waterSurface(cam.position.x, cam.position.y, cam.position.z);
    const under = cam.position.y < surface - 0.05;
    if (under) {
      U.uFogColor.value.setRGB(0.01, 0.05, 0.07).multiplyScalar(0.3 + 0.7 * (1 - U.uNight.value));
      U.uFogNear.value = 0; U.uFogFar.value = 26; U.uFogDensity.value = 0.12;
      this.underwater = true;
    } else if (this.underwater) { this.underwater = false; this.applySettings(); }

    const PI = Math.PI;
    this.sunLight.position.copy(U.uLightDir.value);
    this.sunLight.color.copy(U.uLightColor.value); this.sunLight.intensity = PI;
    this.hemi.color.copy(U.uSkyAmb.value); this.hemi.groundColor.copy(U.uGroundAmb.value); this.hemi.intensity = PI;
    this.fog.color.copy(U.uFogColor.value);
    if (METAL_ENV.tex) this.model.setMetalEnv(METAL_ENV.tex, (under ? 0.05 : 0.1) + 0.45 * (1 - U.uNight.value));
    this.fog.near = under ? 0 : U.uFogNear.value * 0.6; this.fog.far = under ? 26 : U.uFogFar.value;
  }

  /** Debug: nearest column at least `depth` below sea level (spiral search). */
  findWater(depth = 4): { x: number; z: number } | null {
    for (let r = 16; r < 3000; r += 16) for (let a = 0; a < 32; a++) {
      const x = Math.round(Math.cos(a / 32 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 32 * Math.PI * 2) * r);
      if (this.gen.column(x, z).height < SEA_LEVEL - depth) return { x, z };
    }
    return null;
  }

  /** Debug: nearest column of a biome (spiral search). */
  findBiome(b: Biome): { x: number; z: number } | null {
    for (let r = 32; r < 6000; r += 32) for (let a = 0; a < 48; a++) {
      const x = Math.round(Math.cos(a / 48 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 48 * Math.PI * 2) * r);
      if (this.gen.column(x, z).biome === b) return { x, z };
    }
    return null;
  }

  /** For automated tests / debugging. */
  debug() {
    return { fps: this.stats.fps, chunks: this.world.stats.loaded, info: this.renderer.gl.info.render, time: this.sky.time, sky: this.sky };
  }
}
