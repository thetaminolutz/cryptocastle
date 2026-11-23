// World rendering shaders (GLSL 3 / WebGL2): terrain, liquids and instanced props
// (trees, plants, animals). Shared uniforms drive sun/moon, sky ambient, height fog,
// soft shadows, weather wetness and material tables.
import * as THREE from 'three';
import { BLOCKS, MAX_MATERIALS } from './blocks';
import { LAYER, TextureSet } from './textures';
import { BIOMES } from './biomes';

const matTop = new Float32Array(MAX_MATERIALS);
const matSide = new Float32Array(MAX_MATERIALS);
const matGlow = new Float32Array(MAX_MATERIALS);
for (const b of BLOCKS) { matTop[b.id] = LAYER[b.top]; matSide[b.id] = LAYER[b.side]; matGlow[b.id] = b.glow ?? 0; }

export const biomeTints = BIOMES.map((b) => new THREE.Vector3(...b.grassTint));

export const U = {
  uAlbedo: { value: null as THREE.Texture | null },
  uNormalMap: { value: null as THREE.Texture | null },
  uNoise: { value: null as THREE.Texture | null },
  uTime: { value: 0 },
  uLightDir: { value: new THREE.Vector3(0, 1, 0) },      // sun or moon (the one that lights)
  uLightColor: { value: new THREE.Color(1, 1, 1) },       // HDR
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },         // true sun direction
  uSunGlow: { value: new THREE.Color(1, 0.8, 0.6) },
  uSkyAmb: { value: new THREE.Color(0.4, 0.5, 0.7) },
  uGroundAmb: { value: new THREE.Color(0.2, 0.18, 0.15) },
  uBlockColor: { value: new THREE.Color(2.2, 1.3, 0.6) },
  uZenith: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uFogColor: { value: new THREE.Color(0.6, 0.7, 0.85) },
  uFogNear: { value: 40 },
  uFogFar: { value: 96 },
  uFogDensity: { value: 0.004 },
  uFogHeight: { value: 50 },
  uWetness: { value: 0 },
  uWaterShallow: { value: new THREE.Color(0.05, 0.22, 0.2) },
  uWaterDeep: { value: new THREE.Color(0.004, 0.03, 0.05) },
  uNight: { value: 0 },
  uShadowMap: { value: null as THREE.Texture | null },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowOn: { value: 0 },
  uShadowSize: { value: 2048 },
  uShadowTexel: { value: 0.05 },
  uMatTop: { value: matTop },
  uMatSide: { value: matSide },
  uMatGlow: { value: matGlow },
  uBiomeTint: { value: biomeTints },
  uVegRadius: { value: 30 },
  uPointPos: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 1)) },
  uPointCol: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
  uPointCount: { value: 0 }
};

export function bindTextures(t: TextureSet) {
  U.uAlbedo.value = t.albedo;
  U.uNormalMap.value = t.normal;
  U.uNoise.value = t.clouds;
}

// ------------------------------------------------------------------ GLSL chunks
/** Fragment output for GLSL3 materials (three.js only adds it for GLSL1). */
export const FRAG_OUT = 'layout(location = 0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n';

export const COMMON = /* glsl */`
precision highp float;
precision highp sampler2DArray;
precision highp sampler2DShadow;
uniform sampler2DArray uAlbedo;
uniform sampler2DArray uNormalMap;
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uLightDir, uLightColor, uSunDir, uSunGlow, uSkyAmb, uGroundAmb, uBlockColor, uZenith, uHorizon, uFogColor;
uniform float uFogNear, uFogFar, uFogDensity, uFogHeight, uWetness, uNight;
uniform vec3 uWaterShallow, uWaterDeep;
uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowOn, uShadowSize, uShadowTexel;

float shadowAt(vec3 wp, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  float ndl = dot(n, uLightDir);
  vec3 p = wp + n * uShadowTexel * (1.5 + 2.0 * (1.0 - abs(ndl)));
  vec4 sc = uShadowMatrix * vec4(p, 1.0);
  vec3 c = sc.xyz * 0.5 + 0.5;
  vec2 e = abs(c.xy - 0.5) * 2.0;
  float edge = max(e.x, e.y);
  if (edge > 1.0 || c.z > 1.0) return 1.0;
  float z = c.z - 0.0008;
  float t = 1.0 / uShadowSize;
  float s = texture(uShadowMap, vec3(c.xy + vec2(-0.6, -0.9) * t, z));
  s += texture(uShadowMap, vec3(c.xy + vec2(0.9, -0.6) * t, z));
  s += texture(uShadowMap, vec3(c.xy + vec2(0.6, 0.9) * t, z));
  s += texture(uShadowMap, vec3(c.xy + vec2(-0.9, 0.6) * t, z));
  s *= 0.25;
  return mix(s, 1.0, smoothstep(0.8, 1.0, edge));
}

vec3 skyGradient(vec3 d) {
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.6));
  float sd = max(dot(d, uSunDir), 0.0);
  vec2 fd = normalize(d.xz + 1e-4), fs = normalize(uSunDir.xz + 1e-4);
  float az = dot(fd, fs) * 0.5 + 0.5;
  col += uSunGlow * (pow(sd, 5.0) * 0.25 + pow(sd, 48.0) * 0.6);
  col += uSunGlow * pow(1.0 - h, 5.0) * pow(az, 3.0) * 0.45;
  if (d.y < 0.0) col = mix(col, uGroundAmb * 0.8, min(-d.y * 4.0, 1.0));
  return col;
}

vec3 applyFog(vec3 col, vec3 wp) {
  vec3 v = wp - cameraPosition;
  float dist = length(v);
  vec3 dir = v / max(dist, 1e-3);
  float hd = uFogDensity * exp(-max(wp.y - uFogHeight, 0.0) * 0.07);
  float fogH = 1.0 - exp(-dist * hd);
  float fogD = smoothstep(uFogNear, uFogFar, dist);
  float f = max(fogH, fogD);
  float sun = pow(max(dot(dir, uSunDir), 0.0), 6.0);
  vec3 fc = uFogColor + uSunGlow * sun * 0.35;
  return mix(col, fc, f);
}

uniform vec4 uPointPos[8];
uniform vec3 uPointCol[8];
uniform int uPointCount;
/** Torches, campfires, furnaces: up to 8 dynamic point lights. */
vec3 pointLights(vec3 wp, vec3 n) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uPointCount) break;
    vec3 d = uPointPos[i].xyz - wp;
    float dist = length(d);
    float att = clamp(1.0 - dist / uPointPos[i].w, 0.0, 1.0);
    att *= att;
    sum += uPointCol[i] * att * (max(dot(n, d / max(dist, 1e-3)), 0.0) * 0.8 + 0.2);
  }
  return sum;
}

vec3 shade(vec3 albedo, vec3 n, float ao, float sky, float blk, float shadow, float wrap) {
  float ndl = max((dot(n, uLightDir) + wrap) / (1.0 + wrap), 0.0);
  vec3 amb = mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5);
  float skyL = sky * sky;
  return albedo * (uLightColor * ndl * shadow * skyL + amb * ao * (0.06 + 0.94 * skyL) + uBlockColor * blk * blk * ao);
}
`;

const TERRAIN_VERT = /* glsl */`
in vec3 aNormal;
in vec3 aMats;
in vec3 aLight;
out vec3 vWorld;
out vec3 vNormal;
flat out vec3 vMats;
out vec3 vBary;
out vec3 vLight;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = aNormal;
  vMats = aMats;
  int k = gl_VertexID % 3;
  vBary = vec3(k == 0 ? 1.0 : 0.0, k == 1 ? 1.0 : 0.0, k == 2 ? 1.0 : 0.0);
  vLight = vec3(aLight.x / 255.0, aLight.yz / 15.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const TERRAIN_FRAG = /* glsl */`
uniform float uMatTop[${MAX_MATERIALS}];
uniform float uMatSide[${MAX_MATERIALS}];
uniform float uMatGlow[${MAX_MATERIALS}];
in vec3 vWorld;
in vec3 vNormal;
flat in vec3 vMats;
in vec3 vBary;
in vec3 vLight;

// tri-planar sample of one material: albedo (a = height) and blended world normal
vec4 material(float m, vec3 wp, vec3 n, vec3 w, inout vec3 nAcc, float weight) {
  int mi = int(m + 0.5);
  float top = uMatTop[mi], side = uMatSide[mi];
  vec4 col = vec4(0.0);
  vec3 nn = vec3(0.0);
  const float S = 0.42;
  if (w.y > 0.01) {
    float l = n.y > 0.0 ? top : side;
    vec2 uv = wp.xz * S;
    col += texture(uAlbedo, vec3(uv, l)) * w.y;
    vec3 t = texture(uNormalMap, vec3(uv, l)).xyz * 2.0 - 1.0;
    t = vec3(t.xy * 0.9 + n.xz, abs(t.z) * n.y);
    nn += t.xzy * w.y;
  }
  if (w.x > 0.01) {
    vec2 uv = wp.zy * S;
    col += texture(uAlbedo, vec3(uv, side)) * w.x;
    vec3 t = texture(uNormalMap, vec3(uv, side)).xyz * 2.0 - 1.0;
    t = vec3(t.xy * 0.9 + n.zy, abs(t.z) * n.x);
    nn += t.zyx * w.x;
  }
  if (w.z > 0.01) {
    vec2 uv = wp.xy * S;
    col += texture(uAlbedo, vec3(uv, side)) * w.z;
    vec3 t = texture(uNormalMap, vec3(uv, side)).xyz * 2.0 - 1.0;
    t = vec3(t.xy * 0.9 + n.xy, abs(t.z) * n.z);
    nn += t * w.z;
  }
  nAcc += nn * weight;
  return col;
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  vec3 wp = vWorld;
  vec3 nAcc = vec3(0.0);
  vec4 alb;
  float glow;
  if (vMats.x == vMats.y && vMats.y == vMats.z) {
    alb = material(vMats.x, wp, n, w, nAcc, 1.0);
    glow = uMatGlow[int(vMats.x + 0.5)];
  } else {
    // height-aware blend between up to three materials
    vec4 a = material(vMats.x, wp, n, w, nAcc, vBary.x);
    vec4 b = material(vMats.y, wp, n, w, nAcc, vBary.y);
    vec4 c = material(vMats.z, wp, n, w, nAcc, vBary.z);
    vec3 bw = vBary * (vec3(a.a, b.a, c.a) + 0.35);
    bw = pow(bw, vec3(5.0));
    bw /= (bw.x + bw.y + bw.z + 1e-5);
    alb = a * bw.x + b * bw.y + c * bw.z;
    glow = uMatGlow[int(vMats.x + 0.5)] * bw.x + uMatGlow[int(vMats.y + 0.5)] * bw.y + uMatGlow[int(vMats.z + 0.5)] * bw.z;
  }
  vec3 N = normalize(nAcc);
  // large-scale colour variation hides texture repetition
  float macro = texture(uNoise, wp.xz * 0.011).g;
  vec3 albedo = alb.rgb * mix(0.78, 1.18, macro);
  // rain: darker, glossier ground
  float topness = smoothstep(0.5, 0.9, N.y);
  albedo *= 1.0 - uWetness * 0.3 * topness;
  float shadow = shadowAt(wp, n);
  vec3 col = shade(albedo, N, vLight.x, vLight.y, vLight.z, shadow, 0.0);
  vec3 V = normalize(cameraPosition - wp);
  float spec = pow(max(dot(reflect(-uLightDir, N), V), 0.0), 40.0) * (0.04 + uWetness * 0.5 * topness);
  col += uLightColor * spec * shadow * vLight.y;
  col += albedo * pointLights(wp, N) * (0.4 + 0.6 * vLight.x);
  col += albedo * glow * (1.2 + uNight);
  gl_FragColor = vec4(applyFog(col, wp), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const LIQUID_VERT = /* glsl */`
in vec4 aData;
out vec3 vWorld;
out float vDepth;
flat out float vKind;
out vec2 vLight;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vKind = aData.x;
  vDepth = aData.y / 20.0;
  vLight = aData.zw / 15.0;
  if (aData.x < 0.5) {
    float amp = 0.05 * clamp(vDepth, 0.0, 1.0);
    world.y += (sin(world.x * 0.55 + uTime * 1.3) + sin(world.z * 0.7 + uTime * 1.1) + sin((world.x + world.z) * 1.3 + uTime * 2.1) * 0.5) * amp - amp;
  }
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const LIQUID_FRAG = /* glsl */`
in vec3 vWorld;
in float vDepth;
flat in float vKind;
in vec2 vLight;
void main() {
  vec3 wp = vWorld;
  vec3 V = normalize(cameraPosition - wp);
  float skyL = vLight.x * vLight.x;
  if (vKind > 0.5 && vKind < 1.5) {
    // lava: slowly churning, self-lit
    vec2 uv = wp.xz * 0.25 + vec2(sin(uTime * 0.2 + wp.z * 0.3), cos(uTime * 0.17 + wp.x * 0.3)) * 0.15;
    vec3 c = texture(uAlbedo, vec3(uv, ${LAYER.lava.toFixed(1)})).rgb;
    float pulse = 0.85 + 0.15 * sin(uTime * 1.5 + wp.x * 0.4 + wp.z * 0.3);
    gl_FragColor = vec4(applyFog(c * 4.0 * pulse, wp), 1.0);
  } else {
    vec2 uv1 = wp.xz * 0.09 + vec2(uTime * 0.018, uTime * 0.011);
    vec2 uv2 = wp.xz * 0.23 - vec2(uTime * 0.025, -uTime * 0.02);
    vec3 n1 = texture(uNormalMap, vec3(uv1, ${LAYER.water_normal.toFixed(1)})).xyz * 2.0 - 1.0;
    vec3 n2 = texture(uNormalMap, vec3(uv2, ${LAYER.water_normal.toFixed(1)})).xyz * 2.0 - 1.0;
    bool ice = vKind > 1.5;
    vec3 N = normalize(vec3(n1.x + n2.x, ice ? 12.0 : 4.0, n1.y + n2.y));
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 R = reflect(-V, N);
    R.y = abs(R.y);
    vec3 refl = skyGradient(R) * (0.25 + 0.75 * skyL);
    float shadow = shadowAt(wp, vec3(0.0, 1.0, 0.0));
    vec3 amb = uSkyAmb * (0.06 + 0.94 * skyL) + uLightColor * max(uLightDir.y, 0.0) * 0.35 * shadow * skyL;
    vec4 outc;
    if (ice) {
      vec3 alb = texture(uAlbedo, vec3(wp.xz * 0.3, ${LAYER.ice.toFixed(1)})).rgb;
      vec3 c = mix(alb * amb * 1.3, refl, fres * 0.6);
      outc = vec4(c, 0.93);
    } else {
      float d = max(vDepth, 0.0);
      vec3 body = mix(uWaterShallow, uWaterDeep, 1.0 - exp(-d * 0.45)) * amb * 2.2;
      vec3 c = mix(body, refl, fres);
      float spec = pow(max(dot(R, uLightDir), 0.0), 280.0) * 6.0 + pow(max(dot(R, uLightDir), 0.0), 40.0) * 0.25;
      c += uLightColor * spec * shadow * skyL;
      // shore foam
      float foamN = texture(uNoise, wp.xz * 0.35 + vec2(uTime * 0.03, 0.0)).r;
      float foam = smoothstep(0.45, 0.0, d) * smoothstep(0.35, 0.7, foamN + sin(uTime * 1.5 + d * 12.0) * 0.12);
      c = mix(c, amb * 1.6, foam * 0.8);
      float alpha = clamp(0.3 + d * 0.45 + fres * 0.6 + foam, 0.0, 0.96);
      outc = vec4(c, alpha);
    }
    gl_FragColor = vec4(applyFog(outc.rgb, wp), outc.a);
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Instanced props. Per instance: aInst = (x, y, z, rotation), aInst2 = (scale, variation, biome, anim)
// Animals also have aAnim = (phase, move, special, -) and per-vertex bones.
const PROP_VERT = /* glsl */`
in vec3 aLayerTint;  // texture layer, tint mode, glow
in vec3 aColor;
in vec2 aWindAo;     // wind weight, ambient occlusion
in vec4 aInst;
in vec4 aInst2;
uniform vec3 uBiomeTint[16];
uniform float uVegRadius;
#ifdef ANIMAL
in vec4 aBone;       // bone id, pivot xyz
in vec4 aAnim;
#endif
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out vec3 vColor;
flat out vec3 vLayerTint;
out float vAo;
out float vVar;

mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main() {
  vec3 p = position;
  vec3 nrm = normal;
  #ifdef ANIMAL
    int bone = int(aBone.x + 0.5);
    vec3 piv = aBone.yzw;
    float ph = aAnim.x, mv = aAnim.y, sp = aAnim.z;
    float ang = 0.0; int axis = 0;
    if (bone >= 1 && bone <= 4) {
      float off = (bone == 1 || bone == 4) ? 0.0 : 3.14159;
      ang = sin(ph + off) * 0.75 * mv;
    } else if (bone == 5) { ang = sp * 0.9 + sin(ph * 0.5) * 0.06; }
    else if (bone == 6) { ang = sin(ph * 2.0) * (0.25 + mv * 0.4); axis = 1; }
    else if (bone == 7) { ang = sin(ph * 2.2) * 0.9 * sp; axis = 2; }
    else if (bone == 8) { ang = -sin(ph * 2.2) * 0.9 * sp; axis = 2; }
    if (ang != 0.0) {
      vec3 q = p - piv;
      if (axis == 0) { q.yz = rot2(ang) * q.yz; nrm.yz = rot2(ang) * nrm.yz; }
      else if (axis == 1) { q.xz = rot2(ang) * q.xz; nrm.xz = rot2(ang) * nrm.xz; }
      else { q.xy = rot2(ang) * q.xy; nrm.xy = rot2(ang) * nrm.xy; }
      p = q + piv;
    }
  #endif
  float scale = aInst2.x;
  vec3 base = aInst.xyz;
  #ifdef PLANT
    // shrink plants away near the edge of the vegetation radius
    float dist = length(base.xz - cameraPosition.xz);
    scale *= smoothstep(uVegRadius, uVegRadius * 0.7, dist);
  #endif
  p *= scale;
  p.xz = rot2(aInst.w) * p.xz;
  nrm.xz = rot2(aInst.w) * nrm.xz;
  vec3 world = base + p;
  // wind
  float wind = aWindAo.x * (0.6 + uWetness * 0.8);
  if (wind > 0.0) {
    float t = uTime * 1.6 + base.x * 0.35 + base.z * 0.27;
    float gust = 0.5 + 0.5 * sin(uTime * 0.37 + base.x * 0.02);
    world.x += (sin(t) * 0.6 + sin(t * 2.3) * 0.25) * wind * (0.4 + gust * 0.6) * 0.12 * p.y;
    world.z += (cos(t * 0.8) * 0.5) * wind * (0.4 + gust * 0.6) * 0.1 * p.y;
  }
  vWorld = world;
  vNormal = normalize(nrm);
  vUv = uv;
  vVar = aInst2.y;
  vec3 c = aColor;
  int tm = int(mod(aLayerTint.y + 0.5, 10.0));
  if (tm == 1) c *= uBiomeTint[int(aInst2.z + 0.5)] * mix(0.8, 1.15, aInst2.y);
  else if (tm == 2) {
    int k = int(aInst2.y * 5.0);
    c = k == 0 ? vec3(0.9, 0.15, 0.12) : k == 1 ? vec3(0.95, 0.8, 0.2) : k == 2 ? vec3(0.55, 0.35, 0.9) : k == 3 ? vec3(0.95, 0.95, 0.95) : vec3(0.3, 0.5, 0.95);
  }
  vColor = c;
  vLayerTint = aLayerTint;
  vAo = aWindAo.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const PROP_FRAG = /* glsl */`
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in vec3 vColor;
flat in vec3 vLayerTint;
in float vAo;
in float vVar;
void main() {
  vec4 tex = texture(uAlbedo, vec3(vUv, vLayerTint.x));
  bool foliage = vLayerTint.y > 9.5;
  float outA = 1.0;
  #ifdef ALPHA_TEST
  if (foliage) {
    // keep foliage dense at a distance: boost alpha as the mip level grows
    vec2 dx = dFdx(vUv * 128.0), dy = dFdy(vUv * 128.0);
    float mip = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
    tex.a *= 1.0 + mip * 0.35;
    if (tex.a < 0.4) discard;
    outA = clamp((tex.a - 0.4) / 0.2, 0.0, 1.0);
  }
  #endif
  #ifdef SHADOW_PASS
    gl_FragColor = vec4(0.0);
  #else
  vec3 albedo = tex.rgb * vColor;
  vec3 n = normalize(vNormal);
  #ifndef PLANT
  if (!foliage && !gl_FrontFacing) n = -n;
  #endif
  int tmode = int(mod(vLayerTint.y + 0.5, 10.0));
  if (tmode == 3) albedo = mix(albedo, vec3(0.92, 0.95, 1.0), smoothstep(0.35, 0.75, n.y)); // snow cover
  float shadow = shadowAt(vWorld, n);
  float wrap = foliage ? 0.6 : 0.15;
  vec3 col = shade(albedo, n, vAo, 1.0, 0.0, shadow, wrap);
  if (foliage) {
    // light shining through leaves
    vec3 V = normalize(cameraPosition - vWorld);
    col += albedo * uLightColor * pow(max(dot(-V, uLightDir), 0.0), 4.0) * 0.6 * shadow;
  }
  col += albedo * pointLights(vWorld, n) * vAo;
  col += albedo * vLayerTint.z * (1.0 + uNight * 2.0);
  gl_FragColor = vec4(applyFog(col, vWorld), outA);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #endif
}
`;

const mk = (vert: string, frag: string, extra: Partial<THREE.ShaderMaterialParameters> = {}, defines: Record<string, string> = {}) =>
  new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...(U as unknown as Record<string, THREE.IUniform>), uVegRadius: { value: 30 } },
    vertexShader: COMMON + vert,
    fragmentShader: FRAG_OUT + COMMON + frag,
    defines,
    ...extra
  });

export function terrainMaterial() { return mk(TERRAIN_VERT, TERRAIN_FRAG); }
export function liquidMaterial() {
  return mk(LIQUID_VERT, LIQUID_FRAG, { transparent: true, depthWrite: false, side: THREE.DoubleSide });
}

export interface PropMaterialOpts { alphaTest?: boolean; plant?: boolean; animal?: boolean; doubleSide?: boolean; }
export function propMaterial(o: PropMaterialOpts, shadowPass = false, radius = 30) {
  const defines: Record<string, string> = {};
  if (o.alphaTest) defines.ALPHA_TEST = '';
  if (o.plant) defines.PLANT = '';
  if (o.animal) defines.ANIMAL = '';
  if (shadowPass) defines.SHADOW_PASS = '';
  const m = mk(PROP_VERT, PROP_FRAG, { side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide }, defines);
  m.uniforms.uVegRadius = { value: radius };
  if (o.alphaTest && !shadowPass) m.alphaToCoverage = true;
  if (shadowPass) m.colorWrite = false;
  return m;
}

/** Depth-only material for simple meshes in the shadow pass. */
export const depthOnlyMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
