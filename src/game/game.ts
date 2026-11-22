// Owns the scene, world streaming, sky, player, camera and the main loop.
import * as THREE from 'three';
import { Renderer } from '../engine/renderer';
import { FrameStats } from '../engine/fps';
import { input } from '../engine/input';
import { settings } from '../engine/settings';
import { audio } from '../engine/audio';
import { createAtlas } from '../world/atlas';
import { createWorldMaterials, worldUniforms } from '../world/material';
import { Sky } from '../world/sky';
import { World } from '../world/world';
import { CHUNK_SIZE, SEA_LEVEL } from '../world/constants';
import { TerrainGen } from '../world/terrain';
import { Player } from '../entities/player';
import { PlayerModel } from '../entities/player-model';
import { CameraRig } from '../entities/camera-rig';
import { Hud } from '../ui/hud';
import { TouchControls } from '../ui/touch';
import { openSettings } from '../ui/settings-panel';
import { showToast } from '../ui/toast';

const SPAWN = { x: 0.5, z: 0.5 };

export class Game {
  private renderer: Renderer;
  private scene = new THREE.Scene();
  readonly world: World;
  readonly sky = new Sky();
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
  // lights for standard (Lambert) materials – characters, props
  private sun = new THREE.DirectionalLight(0xffffff, 1);
  private ambient = new THREE.AmbientLight(0xffffff, 1);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  private fog = new THREE.Fog(0x000000, 40, 96);

  constructor(canvas: HTMLCanvasElement, private ui: HTMLElement, seed: number) {
    this.renderer = new Renderer(canvas);
    const mats = createWorldMaterials(createAtlas());
    this.world = new World(seed, settings.values.viewDistance, mats.terrain, mats.liquid);
    this.scene.add(this.sky.mesh, this.world.group, this.model.root, this.sun, this.ambient, this.hemi);
    this.scene.fog = this.fog;
    this.applyViewDistance();
    settings.onChange((_s, k) => { if (k === 'viewDistance') this.applyViewDistance(); });

    this.touch = new TouchControls(ui, [
      { name: 'jump', label: 'Jump', size: 96, right: 36, bottom: 36 },
      { name: 'dodge', label: 'Dodge', size: 76, right: 150, bottom: 24 }
    ]);
    this.hud = new Hud(ui, () => this.openMenu(), () => { this.rig.firstPerson = !this.rig.firstPerson; });
    this.stats = new FrameStats(ui);

    this.player.onDamage = () => this.hud.hurt();
    this.player.onDeath = (cause) => {
      showToast(`You died of ${cause}. You wake again in the clearing.`, undefined, 4000);
      setTimeout(() => this.respawn(), 1800);
    };

    document.addEventListener('visibilitychange', () => this.setPaused(document.hidden));
    window.addEventListener('pagehide', () => this.setPaused(true));
    window.addEventListener('pageshow', () => this.setPaused(false));
  }

  private applyViewDistance() {
    const d = settings.values.viewDistance;
    this.world.setViewDistance(d);
    const far = d * CHUNK_SIZE;
    worldUniforms.uFogNear.value = far * 0.55;
    worldUniforms.uFogFar.value = far * 0.95;
    this.renderer.camera.far = far + 64;
    this.renderer.camera.updateProjectionMatrix();
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

    this.sky.update(dt, cam.position);
    worldUniforms.uTime.value = this.elapsed;
    this.updateLightsAndFog(cam);
    this.world.update(this.player.pos, this.rig.forward);
    this.renderer.render(this.scene);
    input.endFrame();

    this.hud.update(this.sky.hours, this.rig.yaw, this.player, this.gold);
    const info = this.renderer.gl.info;
    const p = this.player.pos;
    this.stats.extra = `draws ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k\n`
      + `chunks ${this.world.stats.loaded}  gen ${this.world.stats.genMs.toFixed(1)}ms\n`
      + `${this.renderer.width}x${this.renderer.height}  vd ${settings.values.viewDistance}\n`
      + `xyz ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)} ${this.player.state}`;
    this.stats.tick(dt);
  }

  private underwaterSaved = false;
  private updateLightsAndFog(cam: THREE.PerspectiveCamera) {
    const u = worldUniforms;
    // camera under water: murky blue fog
    const surface = this.world.waterSurface(cam.position.x, cam.position.y, cam.position.z);
    const under = cam.position.y < surface - 0.05;
    if (under) {
      u.uFogColor.value.setRGB(0.06, 0.16, 0.26).multiplyScalar(0.4 + 0.6 * u.uDaylight.value);
      u.uFogNear.value = 1; u.uFogFar.value = 22;
      this.underwaterSaved = true;
    } else if (this.underwaterSaved) { this.underwaterSaved = false; this.applyViewDistance(); }

    const PI = Math.PI;
    this.sun.position.copy(u.uSunDir.value);
    this.sun.color.copy(u.uSunColor.value); this.sun.intensity = 0.4 * PI;
    this.ambient.color.copy(u.uAmbient.value); this.ambient.intensity = 1.3 * PI;
    this.hemi.color.copy(u.uSkyColor.value); this.hemi.groundColor.copy(u.uGroundColor.value); this.hemi.intensity = 0.25 * PI;
    this.fog.color.copy(u.uFogColor.value);
    this.fog.near = u.uFogNear.value; this.fog.far = u.uFogFar.value;
  }

  /** Debug: nearest column at least `depth` below sea level (spiral search). */
  findWater(depth = 4): { x: number; z: number } | null {
    const gen = new TerrainGen(this.world.seed);
    for (let r = 16; r < 3000; r += 16) for (let a = 0; a < 32; a++) {
      const x = Math.round(Math.cos(a / 32 * Math.PI * 2) * r), z = Math.round(Math.sin(a / 32 * Math.PI * 2) * r);
      if (gen.column(x, z).height < SEA_LEVEL - depth) return { x, z };
    }
    return null;
  }

  /** For automated tests / debugging. */
  debug() {
    return { fps: this.stats.fps, chunks: this.world.stats.loaded, info: this.renderer.gl.info.render, time: this.sky.time, sky: this.sky };
  }
}
