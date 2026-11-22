// Smooth low-poly trees drawn with one InstancedMesh per tree kind (3 draw calls for
// every tree in view). Trunk + crown are merged into one geometry; the world shader
// gives them pixel-art bark/leaf textures and gentle wind sway.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE_INDEX } from './tiles';
import { TreeKind, TREE_STRIDE } from './terrain';
import { mulberry32 } from './noise';

/** Trunk collision radius / height per kind (before instance scale). */
export const TREE_TRUNK: Record<TreeKind, { r: number; h: number }> = {
  [TreeKind.Oak]: { r: 0.34, h: 4 },
  [TreeKind.Birch]: { r: 0.22, h: 5.5 },
  [TreeKind.Pine]: { r: 0.28, h: 7 }
};

function decorate(g: THREE.BufferGeometry, top: string, side: string, sway: number, aoFn: (p: THREE.Vector3, n: THREE.Vector3) => number) {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const count = pos.count;
  const tiles = new Uint8Array(count * 2), light = new Uint8Array(count * 3), sw = new Float32Array(count);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nrm, i);
    tiles[i * 2] = TILE_INDEX[top]; tiles[i * 2 + 1] = TILE_INDEX[side];
    light[i * 3] = Math.round(Math.max(0, Math.min(1, aoFn(p, n))) * 255); light[i * 3 + 1] = 15; light[i * 3 + 2] = 0;
    sw[i] = sway;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', pos);
  out.setAttribute('aNormal', nrm);
  out.setAttribute('aTiles', new THREE.BufferAttribute(tiles, 2));
  out.setAttribute('aLight', new THREE.BufferAttribute(light, 3));
  out.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  if (g.index) out.setIndex(g.index);
  return out;
}

function trunk(rTop: number, rBot: number, h: number, log: string) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 7, 3, true);
  g.translate(0, h / 2, 0);
  return decorate(g, `${log}_top`, log, 0, (p) => 0.55 + 0.45 * Math.min(1, p.y / h));
}

function blob(r: number, x: number, y: number, z: number, leaves: string, seed: number) {
  const g = new THREE.SphereGeometry(r, 9, 7);
  const pos = g.getAttribute('position');
  const rnd = mulberry32(seed);
  // lumpy, organic crown – displace along the normal, keep shared seam vertices equal
  const offsets = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let k = offsets.get(key);
    if (k === undefined) { k = 0.85 + rnd() * 0.3; offsets.set(key, k); }
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.85, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  g.translate(x, y, z);
  return decorate(g, leaves, leaves, 1, (_p, n) => 0.6 + 0.4 * (n.y * 0.5 + 0.5));
}

function cone(r: number, h: number, y: number, leaves: string) {
  const g = new THREE.ConeGeometry(r, h, 9, 1, false);
  g.translate(0, y + h / 2, 0);
  return decorate(g, leaves, leaves, 0.6, (p, n) => (n.y < -0.5 ? 0.45 : 0.62 + 0.38 * Math.min(1, (p.y - y) / h)));
}

function buildKind(kind: TreeKind): THREE.BufferGeometry {
  if (kind === TreeKind.Oak) return mergeGeometries([
    trunk(0.22, 0.34, 4, 'oak_log'),
    blob(1.9, 0, 4.7, 0, 'oak_leaves', 1), blob(1.4, 1.0, 4.0, 0.5, 'oak_leaves', 2), blob(1.5, -0.9, 4.2, -0.6, 'oak_leaves', 3)
  ])!;
  if (kind === TreeKind.Birch) return mergeGeometries([
    trunk(0.15, 0.22, 5.5, 'birch_log'),
    blob(1.45, 0, 5.8, 0, 'birch_leaves', 4), blob(1.25, 0.4, 4.7, -0.3, 'birch_leaves', 5)
  ])!;
  return mergeGeometries([
    trunk(0.15, 0.28, 7, 'pine_log'),
    cone(2.2, 2.6, 1.6, 'pine_leaves'), cone(1.75, 2.3, 3.2, 'pine_leaves'),
    cone(1.25, 2.0, 4.7, 'pine_leaves'), cone(0.7, 1.7, 6.1, 'pine_leaves')
  ])!;
}

export class TreeRenderer {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private chunks = new Map<string, Float32Array>();
  private dirty = false;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(private material: THREE.Material) {
    for (const k of [TreeKind.Oak, TreeKind.Birch, TreeKind.Pine]) {
      this.geos[k] = buildKind(k);
      this.meshes[k] = this.makeMesh(k, 512);
    }
  }

  private makeMesh(k: TreeKind, capacity: number) {
    const old = this.meshes[k];
    if (old) { this.group.remove(old); old.dispose(); }
    const mesh = new THREE.InstancedMesh(this.geos[k], this.material, capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(mesh);
    this.meshes[k] = mesh;
    return mesh;
  }

  setChunk(key: string, trees: Float32Array) { if (trees.length) { this.chunks.set(key, trees); this.dirty = true; } }
  removeChunk(key: string) { if (this.chunks.delete(key)) this.dirty = true; }

  update() {
    if (!this.dirty) return;
    this.dirty = false;
    const counts = [0, 0, 0];
    for (const t of this.chunks.values()) for (let i = 0; i < t.length; i += TREE_STRIDE) counts[t[i + 3]]++;
    for (const k of [0, 1, 2]) {
      if (counts[k] > this.meshes[k].instanceMatrix.count) this.makeMesh(k, Math.ceil(counts[k] * 1.5));
      this.meshes[k].count = 0;
    }
    for (const t of this.chunks.values()) {
      for (let i = 0; i < t.length; i += TREE_STRIDE) {
        const k = t[i + 3] as TreeKind, mesh = this.meshes[k];
        this.p.set(t[i], t[i + 1], t[i + 2]);
        this.q.setFromAxisAngle(this.up, t[i + 5]);
        this.s.setScalar(t[i + 4]);
        mesh.setMatrixAt(mesh.count++, this.m.compose(this.p, this.q, this.s));
      }
    }
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }
}
