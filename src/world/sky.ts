// Sky dome (atmospheric gradient, sun, drifting clouds, moon with phases, stars) and
// the day/night palette that drives all world lighting, ambient light and fog.
// One full day = 20 real minutes.
import * as THREE from 'three';
import { U, FRAG_OUT } from './shaders';

export const DAY_LENGTH_SECONDS = 20 * 60;

interface Key {
  t: number; zenith: number; horizon: number; glow: number; glowI: number;
  light: number; lightI: number; sky: number; skyI: number; ground: number; groundI: number;
}
// t: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. Colours are sRGB hex.
const RAW: Key[] = [
  { t: 0.0, zenith: 0x040814, horizon: 0x0e1830, glow: 0x000000, glowI: 0, light: 0x7890c8, lightI: 0.6, sky: 0x2a3a60, skyI: 0.8, ground: 0x10141e, groundI: 0.4 },
  { t: 0.21, zenith: 0x060a1c, horizon: 0x1c2040, glow: 0x302040, glowI: 0.3, light: 0x7890c8, lightI: 0.5, sky: 0x2a3456, skyI: 0.75, ground: 0x0c0c14, groundI: 0.3 },
  { t: 0.25, zenith: 0x24365e, horizon: 0xe07848, glow: 0xff8a40, glowI: 1.6, light: 0xffa060, lightI: 1.2, sky: 0x6a6a8a, skyI: 0.55, ground: 0x3a2a22, groundI: 0.4 },
  { t: 0.3, zenith: 0x2a5cb8, horizon: 0xd8c4b0, glow: 0xffc890, glowI: 1.0, light: 0xffe0b8, lightI: 2.6, sky: 0x8aa8d8, skyI: 0.75, ground: 0x5a4a3a, groundI: 0.45 },
  { t: 0.5, zenith: 0x1e56c8, horizon: 0xa8c8ec, glow: 0xfff0d8, glowI: 0.7, light: 0xfff4e2, lightI: 3.3, sky: 0x9ab8e8, skyI: 0.85, ground: 0x6a5a48, groundI: 0.5 },
  { t: 0.7, zenith: 0x2a58b0, horizon: 0xe4c0a4, glow: 0xffc080, glowI: 1.0, light: 0xffdcb0, lightI: 2.6, sky: 0x8aa0d0, skyI: 0.75, ground: 0x5a4a3a, groundI: 0.45 },
  { t: 0.75, zenith: 0x302c5a, horizon: 0xff6630, glow: 0xff6a28, glowI: 1.8, light: 0xff7a3a, lightI: 1.2, sky: 0x6a5a7a, skyI: 0.55, ground: 0x3a2420, groundI: 0.4 },
  { t: 0.79, zenith: 0x0e1230, horizon: 0x4a2440, glow: 0x6a2a40, glowI: 0.5, light: 0x7890c8, lightI: 0.45, sky: 0x2a2e50, skyI: 0.7, ground: 0x0c0c14, groundI: 0.3 },
  { t: 1.0, zenith: 0x040814, horizon: 0x0e1830, glow: 0x000000, glowI: 0, light: 0x7890c8, lightI: 0.6, sky: 0x2a3a60, skyI: 0.8, ground: 0x10141e, groundI: 0.4 }
];
const C = (h: number) => new THREE.Color(h); // sRGB hex → linear (colour management on)
const KEYS = RAW.map((k) => ({
  t: k.t, zenith: C(k.zenith), horizon: C(k.horizon), glow: C(k.glow).multiplyScalar(k.glowI),
  light: C(k.light).multiplyScalar(k.lightI), sky: C(k.sky).multiplyScalar(k.skyI), ground: C(k.ground).multiplyScalar(k.groundI)
}));

const SKY_FRAG = /* glsl */`
uniform float uCloudCover, uStars, uMoonPhase, uFlash;
uniform vec3 uMoonDir;
in vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyGradient(d);
  float day = smoothstep(-0.15, 0.2, uSunDir.y);
  // stars (fade out under clouds and at day)
  float cloudMask = 0.0;
  if (d.y > 0.0) {
    vec2 cp = d.xz / (d.y + 0.12) * 0.22 + vec2(uTime * 0.0015, uTime * 0.0008);
    float c1 = texture(uNoise, cp * 0.5).r;
    float c2 = texture(uNoise, cp * 1.7 + 0.3).g;
    float dens = c1 * 0.75 + c2 * 0.25;
    float th = 1.0 - uCloudCover;
    float cl = smoothstep(th - 0.08, th + 0.22, dens) * smoothstep(0.0, 0.12, d.y);
    cloudMask = cl;
    if (uStars > 0.01) {
      vec3 q = floor(d * 300.0);
      float s = hash(q);
      float tw = 0.7 + 0.3 * sin(uTime * 3.0 + s * 100.0);
      if (s > 0.9965) col += vec3(0.8, 0.85, 1.0) * (s - 0.9965) * 900.0 * uStars * tw * (1.0 - cl) * smoothstep(0.0, 0.25, d.y);
    }
    // moon
    float md = dot(d, uMoonDir);
    if (md > 0.9985) {
      vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
      float x = dot(d - uMoonDir, right) / 0.055;
      float lit = uMoonPhase < 1.0 ? step(1.0 - uMoonPhase * 2.0, x) : step(x, 1.0 - (uMoonPhase - 1.0) * 2.0);
      float crater = texture(uNoise, d.xy * 40.0).b;
      col = mix(col, vec3(1.6, 1.55, 1.4) * (0.75 + crater * 0.4), (0.12 + 0.88 * lit) * (1.0 - cl * 0.8));
    }
    col += vec3(0.55, 0.6, 0.75) * pow(max(md, 0.0), 300.0) * 0.6 * (1.0 - day) * (1.0 - cl);
    // sun disc
    float sd = dot(d, uSunDir);
    col += uSunGlow * smoothstep(0.99955, 0.9998, sd) * 30.0 * (1.0 - cl);
    // clouds: lit from the sun side, dark bellies, silver lining
    float sunSide = pow(max(sd, 0.0), 6.0);
    vec3 lightCol = uSkyAmb * 1.2 + uLightColor * 0.35 * (0.5 + day) + uSunGlow * sunSide * 1.2;
    vec3 darkCol = mix(uHorizon, uSkyAmb, 0.5) * 0.55;
    vec3 cloud = mix(lightCol, darkCol, smoothstep(0.3, 1.0, cl) * (0.3 + uCloudCover * 0.7));
    col = mix(col, cloud, cl * 0.92);
  }
  col += vec3(0.75, 0.8, 1.0) * uFlash;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  time = 0.72;   // start at golden hour; night falls soon after
  day = 0;
  cloudCover = 0.35;
  overcast = 0;  // 0..1 weather darkening
  flash = 0;
  fogTint = new THREE.Color(1, 1, 1);
  private sun = new THREE.Vector3();
  private uniforms = {
    uCloudCover: { value: 0.35 },
    uStars: { value: 0 },
    uMoonPhase: { value: 0 },
    uFlash: { value: 0 },
    uMoonDir: { value: new THREE.Vector3() }
  };

  constructor(common: string) {
    const geo = new THREE.SphereGeometry(500, 32, 16);
    const mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...(U as unknown as Record<string, THREE.IUniform>), ...this.uniforms },
      vertexShader: common + `out vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: FRAG_OUT + common + SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: false
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }

  update(dt: number, camPos: THREE.Vector3) {
    this.time += dt / DAY_LENGTH_SECONDS;
    if (this.time >= 1) { this.time -= 1; this.day++; }
    this.mesh.position.copy(camPos);

    const angle = (this.time - 0.25) * Math.PI * 2;
    const sun = this.sun.set(Math.cos(angle), Math.sin(angle), 0.28).normalize();
    U.uSunDir.value.copy(sun);

    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t <= this.time) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const f = (this.time - a.t) / (b.t - a.t);
    const L = (x: THREE.Color, y: THREE.Color, out: THREE.Color) => out.copy(x).lerp(y, f);

    L(a.zenith, b.zenith, U.uZenith.value);
    L(a.horizon, b.horizon, U.uHorizon.value);
    L(a.glow, b.glow, U.uSunGlow.value);
    L(a.light, b.light, U.uLightColor.value);
    L(a.sky, b.sky, U.uSkyAmb.value);
    L(a.ground, b.ground, U.uGroundAmb.value);

    // the moon lights the world at night
    const moon = this.uniforms.uMoonDir.value.set(-sun.x, -sun.y, sun.z * 0.6 + 0.15).normalize();
    U.uLightDir.value.copy(sun.y > -0.03 ? sun : moon);
    // moon phase changes the night brightness a little
    const phase = (this.day % 8) / 4;
    const fullness = 1 - Math.abs(phase - 1);
    if (sun.y <= -0.03) U.uLightColor.value.multiplyScalar(0.55 + 0.45 * fullness);
    this.uniforms.uMoonPhase.value = phase;

    // weather: overcast skies are greyer and darker
    const o = this.overcast;
    if (o > 0) {
      const grey = (c: THREE.Color, k: number) => { const l = (c.r + c.g + c.b) / 3; c.lerp(new THREE.Color(l, l, l * 1.05), k); };
      grey(U.uZenith.value, o * 0.8); grey(U.uHorizon.value, o * 0.7); grey(U.uSkyAmb.value, o * 0.5);
      U.uZenith.value.multiplyScalar(1 - o * 0.45);
      U.uHorizon.value.multiplyScalar(1 - o * 0.35);
      U.uLightColor.value.multiplyScalar(1 - o * 0.8);
      U.uSunGlow.value.multiplyScalar(1 - o * 0.85);
    }
    U.uFogColor.value.copy(U.uHorizon.value).multiply(this.fogTint);
    U.uNight.value = 1 - THREE.MathUtils.smoothstep(sun.y, -0.15, 0.15);
    this.uniforms.uStars.value = U.uNight.value;
    this.uniforms.uCloudCover.value = this.cloudCover;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.uniforms.uFlash.value = this.flash;
    if (this.flash > 0) { U.uSkyAmb.value.addScalar(this.flash * 1.5); }
  }

  get hours(): number { return (this.time * 24) % 24; }
  get isNight(): boolean { return this.time < 0.23 || this.time > 0.77; }
}
