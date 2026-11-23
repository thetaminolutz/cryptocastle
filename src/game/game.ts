// Owns the scene, world streaming, sky, weather, wildlife, player, camera and the loop.
import * as THREE from 'three';
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
import { HeroModel } from '../entities/hero';
import { CameraRig } from '../entities/camera-rig';
import { Wildlife } from '../entities/animals';
import { Hud } from '../ui/hud';
import { TouchControls } from '../ui/touch';
import { showToast } from '../ui/toast';
import { Inventory } from './inventory';
import { Interaction } from './interaction';
import { Props } from '../world/props';
import { Hotbar } from '../ui/hotbar';
import { Menu } from '../ui/menu';
import { saves, SaveData, SAVE_VERSION } from '../engine/save';

const SPAWN = { x: 0.5, z: 0.5 };

export interface GameStart { slot: number; seed: number; data: SaveData | null; }

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
  private gold = 0;
  readonly inventory = new Inventory();
  readonly props: Props;
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
    this.scene.add(this.sky.mesh, this.world.group, this.wildlife.group, this.model.root, this.weather.mesh, this.sunLight, this.hemi, this.props.group);
    this.shadows.add(this.model.root);
    this.scene.fog = this.fog;
    this.applySettings();
    settings.onChange((_s, k) => { if (['viewDistance', 'shadows', 'vegetation', 'particles'].includes(k)) this.applySettings(); });

    this.touch = new TouchControls(ui, [
      { name: 'jump', label: 'Jump', size: 92, right: 30, bottom: 30 },
      { name: 'attack', label: 'Strike', size: 92, right: 140, bottom: 92 },
      { name: 'dodge', label: 'Dodge', size: 68, right: 34, bottom: 140 },
      { name: 'interact', label: 'Use', size: 84, right: 150, bottom: 200 }
    ]);
    this.hud = new Hud(ui, () => this.openMenu(), () => { this.rig.firstPerson = !this.rig.firstPerson; });
    this.hotbar = new Hotbar(ui, this.inventory);
    const cross = document.createElement('div'); cross.className = 'crosshair'; ui.appendChild(cross);
    this.stats = new FrameStats(ui);
    this.menu = new Menu(ui, this.inventory, {
      stations: () => this.props.stationsNear(this.player.pos),
      save: () => this.save(),
      exportSave: async () => { await this.save(); saves.exportFile(this.buildSave()); },
      quit: () => { location.href = location.pathname; },
      onClose: () => this.setPaused(false)
    });
    this.interaction = new Interaction(this.world, this.player, this.model, this.inventory, this.props, {
      setAction: (l) => { this.touch.setVisible('interact', !!l); if (l) this.touch.setLabel('interact', l); },
      setAttack: (l) => this.touch.setLabel('attack', l),
      toast: (t, c) => this.hotbar.notify(t, c),
      openCrafting: () => { this.setPaused(true); this.menu.open('crafting'); }
    });
    this.scene.add(this.interaction.group);
    this.touch.setVisible('interact', false);

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
    } else {
      this.inventory.add('staff', 1);
    }

    this.player.onDamage = () => this.hud.hurt();
    this.player.onDeath = (cause) => {
      showToast(`You died of ${cause}. You wake again in the hollow.`, undefined, 4000);
      setTimeout(() => this.respawn(), 1800);
    };
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
      version: SAVE_VERSION, slot: this.start0.slot, seed: this.start0.seed, mode: 'wanderer',
      created: this.created, updated: Date.now(), playTime: this.playTime, day: this.sky.day, time: this.sky.time,
      player: { pos: [p.pos.x, p.pos.y, p.pos.z], yaw: p.yaw, life: p.life, stamina: p.stamina },
      inventory: this.inventory.serialize() as SaveData['inventory'],
      world: this.world.serializeDelta(),
      props: this.props.list
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
    const y = this.world.groundY(SPAWN.x, SPAWN.z);
    this.player.spawn(SPAWN.x, y + 0.05, SPAWN.z);
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
    this.elapsed += dt;
    input.poll(dt);
    if (!this.spawned) this.trySpawn();
    if (this.spawned) {
      this.player.update(dt, this.world, this.rig.yaw, this.rig.pitch, this.rig.firstPerson);
      this.props.collide(this.player.pos);
      this.playTime += dt;
      this.autosave -= dt;
      if (this.autosave <= 0) { this.autosave = 120; void this.save(); }
    }
    // the world map: the hotbar via number keys
    for (let i = 0; i < 6; i++) if (input.key(`Digit${i + 1}`)) { this.inventory.selected = i; this.inventory.changed(); }
    const cam = this.renderer.camera;
    this.rig.update(dt, cam, this.player, this.world);
    if (this.spawned) this.interaction.update(dt, cam, this.elapsed);
    this.model.update(dt, this.player, !this.rig.firstPerson && this.spawned);

    // biome & region around the player
    this.biomeTimer -= dt;
    if (this.biomeTimer <= 0 && this.spawned) {
      this.biomeTimer = 0.5;
      const p = this.player.pos;
      this.biome = this.gen.column(Math.floor(p.x), Math.floor(p.z)).biome;
      const murky = this.biome === Biome.MistySwamp || this.biome === Biome.SunkenForest;
      if (murky) { U.uWaterShallow.value.setRGB(0.05, 0.07, 0.025); U.uWaterDeep.value.setRGB(0.012, 0.016, 0.006); }
      else { U.uWaterShallow.value.setRGB(0.05, 0.22, 0.2); U.uWaterDeep.value.setRGB(0.004, 0.03, 0.05); }
      const r = this.regions.at(p.x, p.z);
      if (r.id !== this.regionId) { this.regionId = r.id; this.hud.showRegion(r.name, r.subtitle); }
    }

    this.sky.update(dt, cam.position);
    this.weather.update(dt, this.biome, this.sky, this.world, cam.position);
    U.uTime.value = this.elapsed;
    U.uFogHeight.value = SEA_LEVEL + 2;
    this.updateLightsAndFog(cam);
    this.world.update(dt, this.player.pos, this.rig.forward, cam);
    if (this.spawned) this.wildlife.update(dt, this.player.pos, this.sky.isNight);
    this.props.update(this.elapsed, this.player.pos, cam);
    this.hotbar.tick();
    this.renderer.gl.info.reset();
    this.shadows.render(this.renderer.gl, this.scene, this.player.pos);
    this.renderer.render(this.scene);
    input.endFrame();

    this.hud.update(this.sky.hours, this.rig.yaw, this.player, this.gold);
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
