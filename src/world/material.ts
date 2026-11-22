// World shader for smooth surfaces: pixel-art atlas tiles projected tri-planar in
// world space (16 px per metre), baked AO + sky/block light, sun/moon + hemisphere +
// ambient lighting and fog. Also used (with instancing) for trees and props.
// Shared uniforms drive the day/night cycle.
import * as THREE from 'three';
import { ATLAS_TILES } from './constants';
import { TILE_INDEX } from './tiles';

export const worldUniforms = {
  uAtlas: { value: null as THREE.Texture | null },
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uAmbient: { value: new THREE.Color(0.3, 0.3, 0.35) },
  uSkyColor: { value: new THREE.Color(0.5, 0.6, 0.8) },
  uGroundColor: { value: new THREE.Color(0.25, 0.2, 0.15) },
  uDaylight: { value: 1 },
  uFogColor: { value: new THREE.Color(0.6, 0.7, 0.85) },
  uFogNear: { value: 40 },
  uFogFar: { value: 96 },
  uBlockLightColor: { value: new THREE.Color(1.0, 0.72, 0.42) }
};

const vert = /* glsl */`
  attribute vec3 aNormal;
  attribute vec2 aTiles;   // top tile, side tile
  attribute vec3 aLight;   // ao (0..255), sky (0..15), block (0..15)
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec2 vTiles;
  varying vec3 vLight;
  varying float vFogDepth;
  uniform float uTime;
  uniform float uIsLiquid;
  #ifdef USE_INSTANCING
  attribute float aSway;
  #endif
  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vec4 world = m * vec4(position, 1.0);
    #ifdef USE_INSTANCING
      // leaves sway gently in the wind
      float s = aSway * max(position.y - 1.5, 0.0) * 0.02;
      world.x += sin(uTime * 1.3 + world.z * 0.3) * s;
      world.z += cos(uTime * 1.1 + world.x * 0.3) * s;
    #endif
    if (uIsLiquid > 0.5) {
      world.y += sin(world.x * 0.7 + uTime * 1.6) * 0.05 + cos(world.z * 0.6 + uTime * 1.2) * 0.05 - 0.05;
    }
    vNormal = normalize(mat3(m) * aNormal);
    vWorld = world.xyz;
    vTiles = aTiles;
    vLight = vec3(aLight.x / 255.0, aLight.yz / 15.0);
    vec4 mv = viewMatrix * world;
    vFogDepth = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const frag = /* glsl */`
  precision highp float;
  uniform sampler2D uAtlas;
  uniform float uTime;
  uniform vec3 uSunDir, uSunColor, uAmbient, uSkyColor, uGroundColor, uFogColor, uBlockLightColor;
  uniform float uDaylight, uFogNear, uFogFar, uIsLiquid;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec2 vTiles;
  varying vec3 vLight;
  varying float vFogDepth;
  const float TILES = ${ATLAS_TILES.toFixed(1)};

  vec4 tileSample(float tile, vec2 uv) {
    float t = floor(tile + 0.5);
    vec2 f = clamp(fract(uv), 0.002, 0.998);
    vec2 xy = vec2(mod(t, TILES), floor(t / TILES));
    return texture2D(uAtlas, (xy + f) / TILES);
  }

  void main() {
    vec3 n = normalize(vNormal);
    vec4 tex;
    if (uIsLiquid > 0.5) {
      tex = tileSample(vTiles.x, vWorld.xz + vec2(uTime * 0.03, uTime * 0.05));
    } else {
      // tri-planar: top tile on flat ground, side tile on steep slopes
      float topW = n.y > 0.0 ? smoothstep(0.55, 0.75, n.y) : 0.0;
      vec2 sideUv = abs(n.x) > abs(n.z) ? vWorld.zy : vWorld.xy;
      if (topW > 0.99) tex = tileSample(vTiles.x, vWorld.xz);
      else if (topW < 0.01) tex = tileSample(vTiles.y, sideUv);
      else tex = mix(tileSample(vTiles.y, sideUv), tileSample(vTiles.x, vWorld.xz), topW);
    }
    float ao = vLight.x;
    float sky = pow(vLight.y, 1.6);
    float blk = pow(vLight.z, 1.5);
    float hemi = n.y * 0.5 + 0.5;
    vec3 skyLit = uAmbient * 1.3 + mix(uGroundColor, uSkyColor, hemi) * 0.25 + uSunColor * max(dot(n, uSunDir), 0.0) * 0.4;
    vec3 lit = skyLit * sky + uBlockLightColor * blk * 1.15;
    lit = max(lit, vec3(0.035, 0.035, 0.05));
    vec3 col = tex.rgb * lit * ao;
    if (abs(floor(vTiles.x + 0.5) - ${TILE_INDEX.lava.toFixed(1)}) < 0.5) col = tex.rgb * 1.1; // lava glows
    float fog = smoothstep(uFogNear, uFogFar, vFogDepth);
    col = mix(col, uFogColor, fog);
    float alpha = uIsLiquid > 0.5 ? mix(tex.a, 1.0, fog) : 1.0;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createWorldMaterials(atlas: THREE.Texture) {
  worldUniforms.uAtlas.value = atlas;
  const terrain = new THREE.ShaderMaterial({
    uniforms: { ...worldUniforms, uIsLiquid: { value: 0 } },
    vertexShader: vert, fragmentShader: frag
  });
  const liquid = new THREE.ShaderMaterial({
    uniforms: { ...worldUniforms, uIsLiquid: { value: 1 } },
    vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
  return { terrain, liquid };
}
