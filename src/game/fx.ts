// Small particle bursts where blows land: blood, sparks off armour, dust and bone
// chips, ghostly wisps. One pooled point cloud, cheap enough for the iPad.
import * as THREE from 'three';

export type FxKind = 'blood' | 'sparks' | 'dust' | 'spirit';
const N = 260;
const COL: Record<FxKind, [number, number, number]> = { blood: [0.45, 0.02, 0.02], sparks: [3.2, 2.2, 0.8], dust: [0.75, 0.7, 0.62], spirit: [0.8, 1.6, 2.2] };

export class Fx {
  readonly points: THREE.Points;
  private pos = new Float32Array(N * 3);
  private col = new Float32Array(N * 3);
  private vel = new Float32Array(N * 3);
  private life = new Float32Array(N);
  private grav = new Float32Array(N);
  private next = 0;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    for (let i = 0; i < N; i++) this.pos[i * 3 + 1] = -1e4;
  }

  burst(at: THREE.Vector3, kind: FxKind, dir: THREE.Vector3 | null, n = 14) {
    const [r, gc, b] = COL[kind];
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % N;
      this.pos[i * 3] = at.x; this.pos[i * 3 + 1] = at.y; this.pos[i * 3 + 2] = at.z;
      const sp = kind === 'sparks' ? 5 : kind === 'spirit' ? 1.2 : 2.6;
      let vx = (Math.random() - 0.5) * sp, vy = Math.random() * sp * 0.8, vz = (Math.random() - 0.5) * sp;
      if (dir) { vx += dir.x * sp * 0.8; vz += dir.z * sp * 0.8; }
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      const j = 0.75 + Math.random() * 0.5;
      this.col[i * 3] = r * j; this.col[i * 3 + 1] = gc * j; this.col[i * 3 + 2] = b * j;
      this.life[i] = kind === 'sparks' ? 0.35 : kind === 'spirit' ? 0.9 : 0.7;
      this.grav[i] = kind === 'spirit' ? -1 : kind === 'sparks' ? 9 : 12;
    }
  }

  update(dt: number) {
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -1e4; continue; }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = Math.min(1, this.life[i] * 3);
      this.col[i * 3] *= 0.985 + f * 0.015; this.col[i * 3 + 1] *= 0.985 + f * 0.015; this.col[i * 3 + 2] *= 0.985 + f * 0.015;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}

export function fxKindFor(id: string): FxKind {
  if (/skeleton|wight|lich|golem|colossus|gargoyle|crab|crawler/.test(id)) return 'dust';
  if (/knight|orc|champion|warden|hollow/.test(id)) return 'sparks';
  if (/ghost|spirit|wisp/.test(id)) return 'spirit';
  return 'blood';
}
