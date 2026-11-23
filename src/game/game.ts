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
import { PlayerModel } from '../entities/player-model';
import { CameraRig } from '../entities/camera-rig';
import { Wildlife } from '../entities/animals';
import { Hud } from '../ui/hud';
import { TouchControls } from '../ui/touch';
import { openSettings } from '../ui/settings-panel';
import { showToast } from '../ui/toast';

const SPAWN = { x: 0.5, z: 0.5 };

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
  private model = new PlayerModel();
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
  private biomeTimer = 0;
  biome: Biome = Biome.MoonlitForest;
  private regionId = '';
  // lights for standard (Lambert) materials – the player model
  private sunLight = new THREE.DirectionalLight(0xffffff, 1);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  private fog = new THREE.Fog(0x000000, 40, 96);

  constructor(canvas: HTMLCanvasElement, private ui: HTMLElement, seed: number) {
    this.renderer = new Renderer(canvas);
    bindTextures(createTextures(this.renderer.anisotropy));
    this.sky = new Sky(COMMON);
    this.gen = new TerrainGen(seed);
    this.regions = new Regions(this.gen, seed);
    this.world = new World(seed, settings.values.viewDistance, terrainMaterial(), liquidMaterial(), this.shadows);
    this.wildlife = new Wildlife(this.world, this.gen, this.shadows);
    this.scene.add(this.sky.mesh, this.world.group, this.wildlife.group, this.model.root, this.weather.mesh, this.sunLight, this.hemi);
    this.shadows.add(this.model.root);
    this.scene.fog = this.fog;
    this.applySettings();
    settings.onChange((_s, k) => { if (['viewDistance', 'shadows', 'vegetation', 'particles'].includes(k)) this.applySettings(); });

    this.touch = new TouchControls(ui, [
      { name: 'jump', label: 'Jump', size: 96, right: 36, bottom: 36 },
      { name: 'dodge', label: 'Dodge', size: 76, right: 150, bottom: 24 }
    ]);
    this.hud = new Hud(ui, () => this.openMenu(), () => { this.rig.firstPerson = !this.rig.firstPerson; });
    this.stats = new FrameStats(ui);

    this.player.onDamage = () => this.hud.hurt();
    this.player.onDeath = (cause) => {
      showToast(`You died of ${cause}. You wake again in the hollow.`, undefined, 4000);
      setTimeout(() => this.respawn(), 1800);
    };
    this.weather.onThunder = () => audio.thunder();

    document.addEventListener('visibilitychange', () => this.setPaused(document.hidden));
    window.addEventListener('pagehide', () => this.setPaused(true));
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
    openSettings(this.ui, () => this.setPaused(false));
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) audio.suspend(); else { audio.resume(); this.last = performance.now(); }
  }

  private respawn() {
    const y = this.world.groundY(SPAWN.x, SPAWN.z);
    this.player.spawn(SPAWN.x, y + 0.05, SPAWN.z);
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
    if (!this.spawned && this.world.isLoaded(SPAWN.x, SPAWN.z)) { this.respawn(); this.spawned = true; }
    if (this.spawned) this.player.update(dt, this.world, this.rig.yaw, this.rig.pitch, this.rig.firstPerson);
    const cam = this.renderer.camera;
    this.rig.update(dt, cam, this.player, this.world);
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
