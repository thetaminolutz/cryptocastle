// Sky dome (gradient, sun, moon with phases, stars) and the day/night palette that
// drives world lighting + fog. One full day = 20 real minutes by default.
import * as THREE from 'three';
import { worldUniforms } from './material';

export const DAY_LENGTH_SECONDS = 20 * 60;

type Key = { t: number; zenith: THREE.Color; horizon: THREE.Color; sun: THREE.Color; ambient: THREE.Color; daylight: number };
const C = (hex: number) => new THREE.Color(hex);
// t: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
const KEYS: Key[] = [
  { t: 0.0, zenith: C(0x03040c), horizon: C(0x0b1330), sun: C(0x3a4a80), ambient: C(0x0c1022), daylight: 0.18 },
  { t: 0.2, zenith: C(0x05081a), horizon: C(0x1a1838), sun: C(0x3a4a80), ambient: C(0x0f1226), daylight: 0.2 },
  { t: 0.25, zenith: C(0x2a2a5a), horizon: C(0xe0603a), sun: C(0xff8a4a), ambient: C(0x4a3848), daylight: 0.5 },
  { t: 0.31, zenith: C(0x4a78c0), horizon: C(0xf0b080), sun: C(0xffd8a8), ambient: C(0x6a6a78), daylight: 0.85 },
  { t: 0.5, zenith: C(0x3d6fc4), horizon: C(0xa8c8e8), sun: C(0xfff4e0), ambient: C(0x80889a), daylight: 1.0 },
  { t: 0.69, zenith: C(0x4a70b8), horizon: C(0xf0a070), sun: C(0xffd0a0), ambient: C(0x6a6470), daylight: 0.85 },
  { t: 0.75, zenith: C(0x3a1e50), horizon: C(0xd8402a), sun: C(0xff6030), ambient: C(0x4a2c3c), daylight: 0.5 },
  { t: 0.8, zenith: C(0x0a0a22), horizon: C(0x2a1430), sun: C(0x3a4a80), ambient: C(0x0f1226), daylight: 0.22 },
  { t: 1.0, zenith: C(0x03040c), horizon: C(0x0b1330), sun: C(0x3a4a80), ambient: C(0x0c1022), daylight: 0.18 }
];

const skyVert = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const skyFrag = /* glsl */`
  precision highp float;
  uniform vec3 uZenith, uHorizon, uSunDir, uSunColor;
  uniform float uStars, uMoonPhase;
  varying vec3 vDir;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
    if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.35, min(-d.y * 3.0, 1.0));
    // sun glow + pixel-square sun
    float sd = dot(d, uSunDir);
    col += uSunColor * pow(max(sd, 0.0), 24.0) * 0.35 * smoothstep(-0.2, 0.1, uSunDir.y);
    vec3 sunRight = normalize(cross(uSunDir, vec3(0.0, 0.0, 1.0)));
    vec3 sunUp = cross(sunRight, uSunDir);
    vec2 sp = vec2(dot(d, sunRight), dot(d, sunUp));
    if (sd > 0.0 && max(abs(sp.x), abs(sp.y)) < 0.03) col = mix(col, vec3(1.0, 0.95, 0.8), 0.95);
    // moon opposite the sun, with phase
    vec3 md = -uSunDir;
    float mdot = dot(d, md);
    vec2 mp = vec2(dot(d, sunRight), dot(d, sunUp));
    if (mdot > 0.0 && length(mp) < 0.035) {
      float lit = step(uMoonPhase * 0.07 - 0.035, mp.x) ;
      if (uMoonPhase > 1.0) lit = step(mp.x, 0.035 - (uMoonPhase - 1.0) * 0.07);
      col = mix(col, vec3(0.85, 0.85, 0.78), 0.25 + 0.7 * lit);
    }
    // stars: quantised direction → crisp pixel stars
    if (uStars > 0.01 && d.y > 0.0) {
      vec3 q = floor(d * 220.0);
      float s = hash(q);
      if (s > 0.996) col += vec3(0.9, 0.9, 1.0) * uStars * (s - 0.996) * 250.0 * smoothstep(0.0, 0.2, d.y);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  private sun = new THREE.Vector3();
  /** 0..1 time of day (0 = midnight). */
  time = 0.3;
  day = 0;
  private uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uStars: { value: 0 },
    uMoonPhase: { value: 0 }
  };

  constructor() {
    const geo = new THREE.SphereGeometry(500, 24, 12);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: skyVert, fragmentShader: skyFrag,
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
    const sun = this.sun.set(Math.cos(angle), Math.sin(angle), 0.25).normalize();
    worldUniforms.uSunDir.value.copy(sun);

    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t <= this.time) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const f = (this.time - a.t) / (b.t - a.t);
    const lerp = (x: THREE.Color, y: THREE.Color, out: THREE.Color) => out.copy(x).lerp(y, f);

    lerp(a.zenith, b.zenith, this.uniforms.uZenith.value);
    lerp(a.horizon, b.horizon, this.uniforms.uHorizon.value);
    lerp(a.sun, b.sun, this.uniforms.uSunColor.value);
    const daylight = a.daylight + (b.daylight - a.daylight) * f;

    // Light from the moon at night: direction flips to the moon.
    if (sun.y < 0) worldUniforms.uSunDir.value.copy(sun).negate();
    worldUniforms.uSunColor.value.copy(this.uniforms.uSunColor.value).multiplyScalar(daylight);
    lerp(a.ambient, b.ambient, worldUniforms.uAmbient.value);
    worldUniforms.uSkyColor.value.copy(this.uniforms.uZenith.value).lerp(this.uniforms.uHorizon.value, 0.4);
    worldUniforms.uGroundColor.value.copy(worldUniforms.uAmbient.value).multiplyScalar(0.6);
    worldUniforms.uDaylight.value = daylight;
    worldUniforms.uFogColor.value.copy(this.uniforms.uHorizon.value);
    // sky shader wants the real sun direction (moon is drawn opposite)
    this.uniforms.uSunDir.value.copy(sun);
    this.uniforms.uStars.value = Math.max(0, 1 - daylight * 2.2);
    this.uniforms.uMoonPhase.value = (this.day % 8) / 4; // 0..2 waxing → waning
  }

  get hours(): number { return (this.time * 24) % 24; }
  get isNight(): boolean { return this.time < 0.23 || this.time > 0.77; }
}
