// Owns the scene, world streaming, sky and the main loop.
import * as THREE from 'three';
import { Renderer } from '../engine/renderer';
import { FrameStats } from '../engine/fps';
import { input } from '../engine/input';
import { settings } from '../engine/settings';
import { audio } from '../engine/audio';
import { createAtlas } from '../world/atlas';
import { createVoxelMaterials, worldUniforms } from '../world/material';
import { Sky } from '../world/sky';
import { World } from '../world/world';
import { CHUNK_SIZE } from '../world/constants';
import { FlyCam } from '../entities/flycam';
import { Hud } from '../ui/hud';
import { TouchControls } from '../ui/touch';
import { openSettings } from '../ui/settings-panel';

export class Game {
  private renderer: Renderer;
  private scene = new THREE.Scene();
  private world: World;
  private sky = new Sky();
  private cam = new FlyCam();
  private stats: FrameStats;
  private hud: Hud;
  readonly touch: TouchControls;
  private running = false;
  private paused = false;
  private last = 0;
  private acc = 0;
  private spawned = false;
  private elapsed = 0;

  constructor(canvas: HTMLCanvasElement, private ui: HTMLElement, seed: number) {
    this.renderer = new Renderer(canvas);
    const atlas = createAtlas();
    const mats = createVoxelMaterials(atlas);
    this.world = new World(seed, settings.values.viewDistance, mats.opaque, mats.liquid);
    this.scene.add(this.sky.mesh, this.world.group);
    this.applyViewDistance();
    settings.onChange((_s, k) => { if (k === 'viewDistance') this.applyViewDistance(); });

    this.touch = new TouchControls(ui, [
      { name: 'jump', label: 'Up', size: 92, right: 40, bottom: 40 },
      { name: 'down', label: 'Down', size: 76, right: 150, bottom: 30 }
    ]);
    this.hud = new Hud(ui, () => this.openMenu());
    this.stats = new FrameStats(ui);

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

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      let dt = (now - this.last) / 1000;
      // FPS cap: with a 30 cap skip frames that come too early.
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
    this.cam.update(dt, this.renderer.camera);
    if (!this.spawned) {
      const y = this.world.surfaceY(8, 8);
      if (y > 0) { this.cam.position.y = y + 12; this.spawned = true; }
    }
    this.sky.update(dt, this.renderer.camera.position);
    worldUniforms.uTime.value = this.elapsed;
    this.world.update(this.cam.position, this.cam.forward);
    this.renderer.render(this.scene);
    input.endFrame();

    this.hud.update(this.sky.hours, this.cam.yaw);
    const info = this.renderer.gl.info;
    const p = this.cam.position;
    this.stats.extra = `draws ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k\n`
      + `chunks ${this.world.stats.loaded}  gen ${this.world.stats.genMs.toFixed(1)}ms\n`
      + `${this.renderer.width}x${this.renderer.height}  vd ${settings.values.viewDistance}\n`
      + `xyz ${p.x.toFixed(0)} ${p.y.toFixed(0)} ${p.z.toFixed(0)}`;
    this.stats.tick(dt);
  }

  /** For automated tests / debugging. */
  debug() {
    return { fps: this.stats.fps, chunks: this.world.stats.loaded, info: this.renderer.gl.info.render, time: this.sky.time, sky: this.sky };
  }
}
