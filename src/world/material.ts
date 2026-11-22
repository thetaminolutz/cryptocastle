// Custom voxel shader: atlas tiling for greedy quads, baked AO + sky/block light,
// sun/moon + hemisphere + ambient lighting, linear fog. Shared uniforms drive day/night.
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
  attribute vec2 aUv;
  attribute vec4 aData;   // tile, ao, sky, block
  attribute vec3 aNormal;
  varying vec2 vUv;
  varying float vTile;
  varying float vAo;
  varying vec2 vLight;
  varying vec3 vNormal;
  varying float vFogDepth;
  varying vec3 vWorld;
  uniform float uTime;
  uniform float uIsLiquid;
  void main() {
    vUv = aUv;
    vTile = aData.x;
    vAo = aData.y;
    vLight = aData.zw / 15.0;
    vNormal = aNormal;
    vec4 world = modelMatrix * vec4(position, 1.0);
    if (uIsLiquid > 0.5 && aNormal.y > 0.5) {
      world.y += sin(world.x * 0.9 + uTime * 1.7) * 0.04 + cos(world.z * 0.8 + uTime * 1.3) * 0.04 - 0.04;
    }
    vWorld = world.xyz;
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
  varying vec2 vUv;
  varying float vTile;
  varying float vAo;
  varying vec2 vLight;
  varying vec3 vNormal;
  varying float vFogDepth;
  varying vec3 vWorld;
  const float TILES = ${ATLAS_TILES.toFixed(1)};
  void main() {
    vec2 f = clamp(fract(vUv), 0.001, 0.999);
    if (uIsLiquid > 0.5) f = fract(f + vec2(uTime * 0.03, uTime * 0.05) * (vNormal.y > 0.5 ? 1.0 : 0.0));
    float t = floor(vTile + 0.5);
    vec2 tileXY = vec2(mod(t, TILES), floor(t / TILES));
    vec4 tex = texture2D(uAtlas, (tileXY + f) / TILES);
    if (uIsLiquid < 0.5 && tex.a < 0.5) discard;
    vec3 n = normalize(vNormal);
    float ao = vAo < 0.5 ? 0.42 : vAo < 1.5 ? 0.62 : vAo < 2.5 ? 0.82 : 1.0;
    float sky = pow(vLight.x, 1.6);
    float blk = pow(vLight.y, 1.5);
    float hemi = n.y * 0.5 + 0.5;
    vec3 skyLit = uAmbient * 1.3 + mix(uGroundColor, uSkyColor, hemi) * 0.25 + uSunColor * max(dot(n, uSunDir), 0.0) * 0.35;
    // side faces get a fixed shade for the classic voxel look
    float faceShade = abs(n.x) > 0.5 ? 0.9 : abs(n.z) > 0.5 ? 0.8 : n.y < -0.5 ? 0.6 : 1.0;
    vec3 lit = skyLit * sky + uBlockLightColor * blk * 1.15;
    lit = max(lit, vec3(0.035, 0.035, 0.05));
    vec3 col = tex.rgb * lit * ao * faceShade;
    // lava glows on its own
    if (abs(t - ${TILE_INDEX.lava.toFixed(1)}) < 0.5) col = tex.rgb * 1.1;
    float fog = smoothstep(uFogNear, uFogFar, vFogDepth);
    col = mix(col, uFogColor, fog);
    float alpha = uIsLiquid > 0.5 ? mix(tex.a, 1.0, fog) : 1.0;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createVoxelMaterials(atlas: THREE.Texture) {
  worldUniforms.uAtlas.value = atlas;
  const opaque = new THREE.ShaderMaterial({
    uniforms: { ...worldUniforms, uIsLiquid: { value: 0 } },
    vertexShader: vert, fragmentShader: frag
  });
  const liquid = new THREE.ShaderMaterial({
    uniforms: { ...worldUniforms, uIsLiquid: { value: 1 } },
    vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
  return { opaque, liquid };
}
