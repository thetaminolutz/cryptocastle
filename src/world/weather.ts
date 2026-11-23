// Weather per biome: clear, cloudy, rain, thunderstorm, fog, snow, sandstorm, plus
// fireflies on warm nights. Particles are one instanced draw call that wraps around
// the camera; precipitation stops under roofs and in caves.
import * as THREE from 'three';
import { COMMON, FRAG_OUT, U } from './shaders';
import { Biome, BIOMES, pickWeather, WeatherKind } from './biomes';
import type { Sky } from './sky';
import type { World } from './world';

const N = 3200;
const FIREFLIES = 160;

interface Params { cloud: number; overcast: number; rain: number; snow: number; sand: number; fog: number; wet: number; storm: number; }
const TARGETS: Record<WeatherKind, Params> = {
  clear: { cloud: 0.3, overcast: 0, rain: 0, snow: 0, sand: 0, fog: 0, wet: 0, storm: 0 },
  cloudy: { cloud: 0.62, overcast: 0.35, rain: 0, snow: 0, sand: 0, fog: 0.1, wet: 0, storm: 0 },
  rain: { cloud: 0.9, overcast: 0.7, rain: 0.8, snow: 0, sand: 0, fog: 0.35, wet: 1, storm: 0 },
  storm: { cloud: 1.0, overcast: 0.88, rain: 1, snow: 0, sand: 0, fog: 0.45, wet: 1, storm: 1 },
  fog: { cloud: 0.55, overcast: 0.35, rain: 0, snow: 0, sand: 0, fog: 1, wet: 0.2, storm: 0 },
  snow: { cloud: 0.85, overcast: 0.55, rain: 0, snow: 1, sand: 0, fog: 0.45, wet: 0, storm: 0 },
  sandstorm: { cloud: 0.4, overcast: 0.4, rain: 0, snow: 0, sand: 1, fog: 1, wet: 0, storm: 0 }
};

const VERT = /* glsl */`
in vec4 aSeed;
uniform float uRain, uSnow, uSand, uFire, uCount;
out vec4 vCol;
out vec2 vQ;
out float vFire;
void main() {
  vec3 box = vec3(36.0, 26.0, 36.0);
  float id = aSeed.w;
  vec3 cam = cameraPosition;
  float fire = step(${N.toFixed(1)}, id);
  float t = uTime;
  vec3 vel; vec2 size; vec4 col;
  if (fire > 0.5) {
    box = vec3(30.0, 6.0, 30.0);
    vel = vec3(sin(t * 0.3 + aSeed.x * 9.0), sin(t * 0.5 + aSeed.y * 7.0) * 0.3, cos(t * 0.27 + aSeed.z * 8.0)) * 0.6;
    size = vec2(0.07); col = vec4(vec3(1.0, 0.9, 0.35) * 6.0, (0.5 + 0.5 * sin(t * 3.0 + id)) * uFire);
  } else if (uSnow > 0.0) {
    vel = vec3(sin(t * 0.7 + aSeed.x * 6.0) * 0.6, -1.4, cos(t * 0.6 + aSeed.z * 6.0) * 0.5);
    size = vec2(0.05); col = vec4(1.5, 1.5, 1.6, 0.9);
  } else if (uSand > 0.0) {
    vel = vec3(14.0, -0.6 + sin(t + aSeed.y * 5.0), 4.0);
    size = vec2(0.025, 0.6); col = vec4(1.8, 1.2, 0.7, 0.5);
  } else {
    vel = vec3(0.6, -16.0, 0.3);
    size = vec2(0.012, 0.55); col = vec4(1.2, 1.25, 1.4, 0.4);
  }
  vec3 p = aSeed.xyz * box + vel * t;
  p = mod(p - cam + box * 0.5, box) - box * 0.5 + cam;
  if (fire > 0.5) p.y = cam.y - 1.5 + mod(aSeed.y * box.y + sin(t * 0.4 + id) * 1.5, box.y) - 1.0;
  float shown = fire > 0.5 ? step(0.01, uFire) : step(id / ${N.toFixed(1)}, uCount);
  // billboard: streaks are stretched along their velocity, flakes are round
  vec3 toCam = normalize(cam - p);
  vec3 up, right;
  if (size.x == size.y) { right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam)); up = cross(toCam, right); }
  else { up = normalize(vel); right = normalize(cross(up, toCam)); }
  vec3 world = p + right * position.x * size.x + up * position.y * size.y;
  vQ = position.xy;
  vCol = col;
  vFire = fire;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0) * shown;
}
`;
const FRAG = /* glsl */`
in vec4 vCol;
in vec2 vQ;
in float vFire;
void main() {
  float r = length(vQ);
  float a = vCol.a * smoothstep(1.0, 0.3, r);
  vec3 c = vCol.rgb * (uSkyAmb + uLightColor * 0.3 + uBlockColor * 0.05);
  if (vFire > 0.5) c = vCol.rgb; // fireflies are self-lit
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Weather {
  readonly mesh: THREE.Mesh;
  kind: WeatherKind = 'clear';
  private p: Params = { ...TARGETS.clear };
  private timer = 60;
  private lightningTimer = 5;
  private uniforms = { uRain: { value: 0 }, uSnow: { value: 0 }, uSand: { value: 0 }, uFire: { value: 0 }, uCount: { value: 0 } };
  particleScale = 1;
  onThunder: (() => void) | null = null;
  private exposure = 1;

  constructor() {
    const quad = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', quad.getAttribute('position'));
    g.setIndex(quad.index);
    const seeds = new Float32Array((N + FIREFLIES) * 4);
    for (let i = 0; i < N + FIREFLIES; i++) { seeds[i * 4] = Math.random(); seeds[i * 4 + 1] = Math.random(); seeds[i * 4 + 2] = Math.random(); seeds[i * 4 + 3] = i; }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = N + FIREFLIES;
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...(U as unknown as Record<string, THREE.IUniform>), ...this.uniforms },
      vertexShader: COMMON + VERT, fragmentShader: FRAG_OUT + COMMON + FRAG,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** Force a weather (debug / story). */
  set(kind: WeatherKind) { this.kind = kind; this.timer = 240; }

  update(dt: number, biome: Biome, sky: Sky, world: World, cam: THREE.Vector3) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.kind = pickWeather(biome, Math.random());
      this.timer = 120 + Math.random() * 200;
    }
    let kind = this.kind;
    // adapt to the biome the player is in
    const cold = biome === Biome.FrozenTundra || biome === Biome.SnowyMountains;
    if ((kind === 'rain' || kind === 'storm') && cold) kind = 'snow';
    if (kind === 'snow' && !cold && biome !== Biome.DarkPine) kind = 'rain';
    if (kind === 'sandstorm' && biome !== Biome.RedDesert) kind = 'cloudy';
    if ((kind === 'rain' || kind === 'storm') && biome === Biome.RedDesert) kind = 'cloudy';
    const t = TARGETS[kind];
    const k = Math.min(1, dt * 0.08);
    for (const key of Object.keys(t) as (keyof Params)[]) this.p[key] += (t[key] - this.p[key]) * k;

    // sheltered (roof, cave)? sample the ground field above the camera
    let open = 1;
    for (const h of [3, 8, 16, 30]) if (world.density(cam.x, cam.y + h, cam.z) > 0) { open = 0; break; }
    this.exposure += (open - this.exposure) * Math.min(1, dt * 3);

    const bd = BIOMES[biome];
    sky.cloudCover = this.p.cloud;
    sky.overcast = this.p.overcast;
    sky.fogTint.setRGB(...bd.fogTint);
    const fogBase = 0.0025 + bd.fogDensity * 0.006 * (0.6 + 0.4 * U.uNight.value);
    U.uFogDensity.value = fogBase + this.p.fog * 0.022 + this.p.sand * 0.03;
    if (this.p.sand > 0.05) U.uFogColor.value.lerp(new THREE.Color(0.75, 0.45, 0.25).multiplyScalar(0.3 + U.uLightColor.value.r * 0.25), this.p.sand * 0.8);
    U.uWetness.value = this.p.wet * this.exposure;

    const amount = Math.max(this.p.rain, this.p.snow, this.p.sand) * this.exposure * this.particleScale;
    this.uniforms.uRain.value = this.p.rain;
    this.uniforms.uSnow.value = this.p.snow > this.p.rain ? this.p.snow : 0;
    this.uniforms.uSand.value = this.p.sand > 0.2 ? this.p.sand : 0;
    this.uniforms.uCount.value = amount;
    const fireflies = bd.fireflies && sky.isNight && this.p.rain < 0.2 ? 1 : 0;
    this.uniforms.uFire.value += (fireflies * this.particleScale - this.uniforms.uFire.value) * Math.min(1, dt * 0.5);

    // lightning
    if (this.p.storm > 0.6) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 4 + Math.random() * 12;
        sky.flash = 1;
        setTimeout(() => this.onThunder?.(), 400 + Math.random() * 2000);
      }
    }
  }

  get wetness() { return this.p.wet; }
}
