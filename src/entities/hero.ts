// The player character: a procedurally modelled, skinned fantasy wanderer — hooded
// cloak, tunic, belt with pouches, bracers, boots and a gnarled staff — with a real
// skeleton and procedural animation (idle breathing, walk, run, jump, swim, climb,
// roll, tool swings, harvesting). The cloak follows on springs.
// The face under the hood is smooth and blank (the Nameless One) until character
// creation gives it one.
import type { WornLook } from '../game/equipment';
import * as THREE from 'three';
import type { Player } from './player';
import { Look, RACES, HAIR_COLORS, CLOTH_COLORS } from '../data/character';

type V3 = THREE.Vector3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ skeleton
const BONES = {
  root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5,
  upperArmL: 6, forearmL: 7, handL: 8, upperArmR: 9, forearmR: 10, handR: 11,
  thighL: 12, shinL: 13, footL: 14, thighR: 15, shinR: 16, footR: 17,
  cloak1: 18, cloak2: 19, cloak3: 20
} as const;
type BoneName = keyof typeof BONES;
const PARENT: Record<BoneName, BoneName | null> = {
  root: null, hips: 'root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  upperArmL: 'chest', forearmL: 'upperArmL', handL: 'forearmL', upperArmR: 'chest', forearmR: 'upperArmR', handR: 'forearmR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR',
  cloak1: 'chest', cloak2: 'cloak1', cloak3: 'cloak2'
};
// absolute bind positions (model space, metres; character faces -Z)
const POS: Record<BoneName, V3> = {
  root: V(0, 0, 0), hips: V(0, 0.97, 0), spine: V(0, 1.1, 0), chest: V(0, 1.3, 0), neck: V(0, 1.52, 0), head: V(0, 1.6, 0),
  upperArmL: V(-0.2, 1.45, 0), forearmL: V(-0.22, 1.17, 0), handL: V(-0.23, 0.93, 0),
  upperArmR: V(0.2, 1.45, 0), forearmR: V(0.22, 1.17, 0), handR: V(0.23, 0.93, 0),
  thighL: V(-0.1, 0.94, 0), shinL: V(-0.1, 0.52, 0), footL: V(-0.1, 0.09, 0),
  thighR: V(0.1, 0.94, 0), shinR: V(0.1, 0.52, 0), footR: V(0.1, 0.09, 0),
  cloak1: V(0, 1.42, 0.13), cloak2: V(0, 1.05, 0.2), cloak3: V(0, 0.62, 0.25)
};

// ------------------------------------------------------------------ mesh builder
const enum M { Skin, Cloth, Leather, Metal, Lining, Wood }
type Weights = [number, number][];
interface Ring { c: V3; rx: number; rz: number; w: Weights; }

class SkinBuilder {
  private parts: { pos: number[]; nrm: number[]; uv: number[]; col: number[]; si: number[]; sw: number[]; idx: number[] }[] = [];
  constructor(materials: number) { for (let i = 0; i < materials; i++) this.parts.push({ pos: [], nrm: [], uv: [], col: [], si: [], sw: [], idx: [] }); }

  private vert(m: number, p: V3, n: V3, u: number, v: number, c: THREE.Color, w: Weights) {
    const P = this.parts[m];
    P.pos.push(p.x, p.y, p.z); P.nrm.push(n.x, n.y, n.z); P.uv.push(u, v); P.col.push(c.r, c.g, c.b);
    const ws = [...w].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = ws.reduce((s, e) => s + e[1], 0) || 1;
    for (let i = 0; i < 4; i++) { P.si.push(ws[i]?.[0] ?? 0); P.sw.push(ws[i] ? ws[i][1] / total : 0); }
    return P.pos.length / 3 - 1;
  }

  /** Smooth lofted tube through elliptical rings; optional partial arc (open cloth). */
  loft(m: number, rings: Ring[], color: number, o: { seg?: number; arc?: [number, number]; capEnd?: boolean; capStart?: boolean; uv?: [number, number]; jag?: number } = {}) {
    const seg = o.seg ?? 12;
    const [a0, a1] = o.arc ?? [0, Math.PI * 2];
    const closed = !o.arc;
    const cols = closed ? seg : seg + 1;
    const col = new THREE.Color(color);
    const P = this.parts[m];
    const base: number[][] = [];
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      const prev = rings[Math.max(0, r - 1)].c, next = rings[Math.min(rings.length - 1, r + 1)].c;
      const t = next.clone().sub(prev).normalize();
      const ref = Math.abs(t.z) < 0.9 ? V(0, 0, 1) : V(0, 1, 0);
      const u = new THREE.Vector3().crossVectors(t, ref).normalize();
      const v = new THREE.Vector3().crossVectors(u, t).normalize();
      const row: number[] = [];
      for (let i = 0; i < cols; i++) {
        const a = a0 + (a1 - a0) * (i / seg);
        const ca = Math.cos(a), sa = Math.sin(a);
        let jag = 0;
        if (o.jag && r === rings.length - 1) jag = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * o.jag; // torn hem
        const p = ring.c.clone().addScaledVector(u, ca * ring.rx).addScaledVector(v, sa * ring.rz).addScaledVector(t, -jag);
        const n = u.clone().multiplyScalar(ca / ring.rx).addScaledVector(v, sa / ring.rz).normalize();
        const [us, vs] = o.uv ?? [3, 3];
        row.push(this.vert(m, p, n, (i / seg) * us * 3, (r / (rings.length - 1)) * vs * 3, col, ring.w));
      }
      base.push(row);
    }
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < seg; i++) {
        const i1 = closed ? (i + 1) % seg : i + 1;
        const a = base[r][i], b = base[r][i1], c = base[r + 1][i1], d = base[r + 1][i];
        P.idx.push(a, d, b, b, d, c);
      }
    }
    const cap = (ring: Ring, row: number[], flip: boolean) => {
      const n = rings.length > 1 ? (flip ? rings[0].c.clone().sub(rings[1].c) : ring.c.clone().sub(rings[rings.length - 2].c)).normalize() : V(0, 1, 0);
      const ci = this.vert(m, ring.c, n, 0.5, 0.5, col, ring.w);
      for (let i = 0; i < seg; i++) {
        const a = row[i], b = row[(i + 1) % cols];
        if (flip) P.idx.push(ci, b, a); else P.idx.push(ci, a, b);
      }
    };
    if (o.capStart) cap(rings[0], base[0], true);
    if (o.capEnd) cap(rings[rings.length - 1], base[base.length - 1], false);
  }

  /** Ellipsoid bound to one bone. */
  blob(m: number, c: V3, r: V3, color: number, w: Weights, seg = 12) {
    const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg * 0.75));
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), UV = g.getAttribute('uv');
    const col = new THREE.Color(color);
    const off = this.parts[m].pos.length / 3;
    for (let i = 0; i < P.count; i++) {
      const p = V(P.getX(i) * r.x, P.getY(i) * r.y, P.getZ(i) * r.z).add(c);
      const n = V(N.getX(i) / r.x, N.getY(i) / r.y, N.getZ(i) / r.z).normalize();
      this.vert(m, p, n, UV.getX(i), UV.getY(i), col, w);
    }
    for (let i = 0; i < g.index!.count; i++) this.parts[m].idx.push(g.index!.getX(i) + off);
    g.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = [];
    for (let m = 0; m < this.parts.length; m++) {
      const P = this.parts[m], off = pos.length / 3, start = idx.length;
      pos.push(...P.pos); nrm.push(...P.nrm); uv.push(...P.uv); col.push(...P.col); si.push(...P.si); sw.push(...P.sw);
      for (const i of P.idx) idx.push(i + off);
      g.addGroup(start, P.idx.length, m);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
}

const B = BONES;
const R = (y: number, x: number, z: number, rx: number, rz: number, w: Weights): Ring => ({ c: V(x, y, z), rx, rz, w });
const mixW = (a: number, b: number, t: number): Weights => [[a, 1 - t], [b, t]];

function buildBody(b: SkinBuilder, look: Look | null = null, gear: WornLook = {}) {
  // palette
  const race = look ? RACES.find((r) => r.id === look.race)! : null;
  const SKIN = look ? race!.skin[look.skin % race!.skin.length] : 0xc4b6aa;
  const TUNIC = look ? CLOTH_COLORS[look.jacket] : 0x5a3d2b, PANTS = look ? CLOTH_COLORS[look.trousers] : 0x3a3330;
  let LEATHER = 0x4a3020, BOOT = look ? [0x2e221a, 0x4a3020, 0x1a1a1c, 0x5a4a3a][look.boots % 4] : 0x2e221a, CLOAK = 0x2a3a34;
  const HOOD_IN = 0x120e0c, BRASS = gear.chest?.trim ?? 0xb08a40;
  // worn gear recolours the clothes
  let TUNIC_ = TUNIC, PANTS_ = PANTS, GLOVE = 0x3a2618;
  const ch = gear.chest;
  if (ch && ch.style !== 'plate') TUNIC_ = ch.color;
  if (ch?.style === 'plate') TUNIC_ = 0x4a4038;
  if (gear.legs) PANTS_ = gear.legs.metal ? 0x3a3a3e : gear.legs.color;
  if (gear.boots) BOOT = gear.boots.color;
  if (gear.gloves) GLOVE = gear.gloves.color;
  if (gear.cloak) CLOAK = gear.cloak.color;
  if (ch?.style === 'leather') LEATHER = 0x2a1a10;
  const TORSO_M = ch?.style === 'mail' ? M.Metal : M.Cloth;
  const BOOT_M = gear.boots?.metal ? M.Metal : M.Leather, GLOVE_M = gear.gloves?.metal ? M.Metal : M.Leather;

  // ---- legs (pants) with knee blending
  for (const s of [-1, 1]) {
    const th = s < 0 ? B.thighL : B.thighR, sh = s < 0 ? B.shinL : B.shinR, ft = s < 0 ? B.footL : B.footR;
    const x = 0.1 * s;
    b.loft(M.Cloth, [
      R(0.99, x * 0.85, 0, 0.1, 0.1, [[B.hips, 0.6], [th, 0.4]]),
      R(0.9, x, 0, 0.088, 0.092, [[th, 1]]),
      R(0.72, x, -0.005, 0.075, 0.08, [[th, 1]]),
      R(0.56, x, 0, 0.06, 0.064, mixW(th, sh, 0.3)),
      R(0.5, x, 0, 0.058, 0.06, mixW(th, sh, 0.7)),
      R(0.4, x, 0.008, 0.06, 0.066, [[sh, 1]]),
      R(0.3, x, 0.004, 0.05, 0.054, [[sh, 1]])
    ], PANTS_, { uv: [3, 4] });
    // boots: shaft + foot
    b.loft(BOOT_M, [
      R(0.36, x, 0.005, 0.062, 0.068, [[sh, 1]]),
      R(0.34, x, 0.005, 0.066, 0.07, [[sh, 1]]),
      R(0.16, x, 0.0, 0.052, 0.058, [[sh, 1]]),
      R(0.1, x, -0.005, 0.054, 0.062, mixW(sh, ft, 0.5))
    ], BOOT, { capStart: true });
    b.loft(BOOT_M, [
      { c: V(x, 0.07, 0.06), rx: 0.05, rz: 0.055, w: [[ft, 1]] },
      { c: V(x, 0.06, -0.02), rx: 0.052, rz: 0.06, w: [[ft, 1]] },
      { c: V(x, 0.045, -0.12), rx: 0.046, rz: 0.04, w: [[ft, 1]] },
      { c: V(x, 0.04, -0.16), rx: 0.03, rz: 0.028, w: [[ft, 1]] }
    ], BOOT, { capStart: true, capEnd: true });
    b.loft(M.Leather, [R(0.335, x, 0.005, 0.072, 0.077, [[sh, 1]]), R(0.31, x, 0.005, 0.072, 0.077, [[sh, 1]])], 0x3a2a1e, { capEnd: false }); // cuff
    if (gear.legs?.metal) {
      // greaves over the shins and plates on the thighs
      b.loft(M.Metal, [R(0.52, x, -0.01, 0.066, 0.07, mixW(th, sh, 0.8)), R(0.42, x, -0.008, 0.068, 0.072, [[sh, 1]]), R(0.34, x, -0.004, 0.07, 0.074, [[sh, 1]])], gear.legs.color, { capStart: true, arc: [Math.PI * 1.1, Math.PI * 1.9] });
      b.blob(M.Metal, V(x, 0.52, -0.06), V(0.045, 0.04, 0.03), gear.legs.color, mixW(th, sh, 0.5), 8);
      b.loft(M.Metal, [R(0.92, x, -0.01, 0.1, 0.1, [[th, 1]]), R(0.7, x, -0.01, 0.084, 0.086, [[th, 1]])], gear.legs.color, { arc: [Math.PI * 1.05, Math.PI * 1.95] });
    }
  }

  // ---- torso (tunic) with spine blending
  b.loft(M.Cloth, [
    R(0.9, 0, 0, 0.165, 0.115, [[B.hips, 1]]),
    R(1.0, 0, 0, 0.16, 0.11, [[B.hips, 0.8], [B.spine, 0.2]]),
    R(1.08, 0, 0, 0.145, 0.1, mixW(B.hips, B.spine, 0.6)),
    R(1.2, 0, -0.005, 0.155, 0.105, mixW(B.spine, B.chest, 0.4)),
    R(1.32, 0, -0.01, 0.175, 0.115, [[B.chest, 1]]),
    R(1.42, 0, 0, 0.18, 0.11, [[B.chest, 1]]),
    R(1.49, 0, 0.005, 0.12, 0.085, mixW(B.chest, B.neck, 0.3)),
    R(1.53, 0, 0.005, 0.055, 0.055, mixW(B.chest, B.neck, 0.7))
  ], TUNIC_, { seg: 16, uv: [4, 4] });
  if (TORSO_M === M.Metal) b.loft(M.Metal, [R(1.44, 0, 0, 0.185, 0.115, [[B.chest, 1]]), R(1.2, 0, -0.005, 0.16, 0.11, mixW(B.spine, B.chest, 0.4)), R(0.98, 0, 0, 0.17, 0.12, [[B.hips, 1]])], ch!.color, { seg: 16 });
  if (ch?.style === 'plate') {
    // breastplate, backplate and pauldrons
    b.loft(M.Metal, [
      R(1.49, 0, 0.0, 0.13, 0.09, mixW(B.chest, B.neck, 0.3)),
      R(1.42, 0, -0.004, 0.192, 0.122, [[B.chest, 1]]),
      R(1.3, 0, -0.01, 0.186, 0.124, [[B.chest, 1]]),
      R(1.16, 0, -0.004, 0.165, 0.115, mixW(B.spine, B.chest, 0.3)),
      R(1.02, 0, 0, 0.172, 0.122, [[B.hips, 0.7], [B.spine, 0.3]])
    ], ch.color, { seg: 18 });
    for (const s of [-1, 1]) {
      const ua = s < 0 ? B.upperArmL : B.upperArmR;
      b.blob(M.Metal, V(s * 0.2, 1.47, 0), V(0.085, 0.06, 0.09), ch.color, [[B.chest, 0.4], [ua, 0.6]], 12);
      b.blob(M.Metal, V(s * 0.215, 1.43, 0), V(0.075, 0.035, 0.08), ch.trim ?? ch.color, [[ua, 1]], 10);
    }
    if (ch.trim) b.loft(M.Metal, [R(1.02, 0, 0, 0.175, 0.125, [[B.hips, 1]]), R(0.99, 0, 0, 0.176, 0.126, [[B.hips, 1]])], ch.trim, { seg: 18 });
  }
  // tunic skirt: flares over the thighs, ragged hem
  b.loft(M.Cloth, [
    R(0.98, 0, 0, 0.168, 0.118, [[B.hips, 1]]),
    R(0.85, 0, 0, 0.19, 0.14, [[B.hips, 0.7], [B.thighL, 0.15], [B.thighR, 0.15]]),
    R(0.7, 0, 0.005, 0.215, 0.16, [[B.hips, 0.5], [B.thighL, 0.25], [B.thighR, 0.25]])
  ], TUNIC_, { seg: 18, jag: 0.05 });
  if (ch?.style === 'robe') b.loft(M.Cloth, [
    R(0.72, 0, 0.005, 0.21, 0.16, [[B.hips, 0.5], [B.thighL, 0.25], [B.thighR, 0.25]]),
    R(0.45, 0, 0.01, 0.24, 0.19, [[B.hips, 0.3], [B.thighL, 0.35], [B.thighR, 0.35]]),
    R(0.16, 0, 0.015, 0.27, 0.22, [[B.hips, 0.2], [B.shinL, 0.4], [B.shinR, 0.4]])
  ], ch.color, { seg: 18, jag: 0.04 });
  // belt, buckle, pouches
  b.loft(M.Leather, [R(1.01, 0, 0, 0.168, 0.118, [[B.hips, 1]]), R(0.95, 0, 0, 0.172, 0.121, [[B.hips, 1]])], LEATHER, { seg: 18 });
  b.blob(M.Metal, V(0, 0.98, -0.122), V(0.03, 0.028, 0.012), BRASS, [[B.hips, 1]], 8);
  b.blob(M.Leather, V(0.15, 0.93, -0.06), V(0.045, 0.055, 0.03), 0x5a3a22, [[B.hips, 1]], 8);
  b.blob(M.Leather, V(-0.13, 0.92, 0.07), V(0.04, 0.05, 0.03), 0x5a3a22, [[B.hips, 1]], 8);
  // ---- arms with elbow blending, bracers and gloves
  for (const s of [-1, 1]) {
    const ua = s < 0 ? B.upperArmL : B.upperArmR, fa = s < 0 ? B.forearmL : B.forearmR, hd = s < 0 ? B.handL : B.handR;
    const x = (v: number) => v * s;
    b.loft(M.Cloth, [
      R(1.47, x(0.16), 0, 0.07, 0.07, [[B.chest, 0.6], [ua, 0.4]]),
      R(1.43, x(0.2), 0, 0.062, 0.064, [[ua, 1]]),
      R(1.3, x(0.21), 0, 0.054, 0.056, [[ua, 1]]),
      R(1.2, x(0.22), 0, 0.046, 0.048, mixW(ua, fa, 0.35)),
      R(1.15, x(0.22), 0, 0.044, 0.046, mixW(ua, fa, 0.7)),
      R(1.08, x(0.225), -0.004, 0.045, 0.046, [[fa, 1]])
    ], TUNIC_, { uv: [2, 3] });
    b.loft(GLOVE_M, [
      R(1.1, x(0.225), -0.004, 0.05, 0.051, [[fa, 1]]),
      R(1.0, x(0.23), -0.002, 0.042, 0.042, [[fa, 1]]),
      R(0.95, x(0.232), 0, 0.037, 0.035, mixW(fa, hd, 0.4))
    ], gear.gloves ? GLOVE : LEATHER, { capStart: true });
    // gloved hand (mitten + thumb)
    b.blob(GLOVE_M, V(x(0.235), 0.88, -0.005), V(0.032, 0.06, 0.042), GLOVE, [[hd, 1]], 10);
    b.blob(GLOVE_M, V(x(0.22), 0.9, -0.035), V(0.016, 0.035, 0.016), GLOVE, [[hd, 1]], 6);
  }

  // ---- neck & head (blank, smooth face)
  b.loft(M.Skin, [R(1.5, 0, 0.01, 0.05, 0.05, [[B.neck, 1]]), R(1.62, 0, 0.005, 0.048, 0.05, mixW(B.neck, B.head, 0.6))], SKIN, { seg: 10 });
  b.blob(M.Skin, V(0, 1.7, -0.008), V(0.092, 0.115, 0.104), SKIN, [[B.head, 1]], 16);
  b.blob(M.Skin, V(0, 1.645, -0.045), V(0.065, 0.05, 0.065), SKIN, [[B.head, 1]], 10); // jaw
  if (look) face(b, look, SKIN);

  // ---- hood: open at the front, pointed at the back
  const hoodRings: Ring[] = [];
  const H = [[1.5, 0.13, 0.13, 0.02], [1.58, 0.135, 0.14, 0.015], [1.68, 0.13, 0.142, 0.012], [1.77, 0.11, 0.125, 0.02], [1.83, 0.07, 0.085, 0.045], [1.86, 0.02, 0.03, 0.09]];
  for (const [y, rx, rz, z] of H) hoodRings.push({ c: V(0, y, z), rx, rz, w: y < 1.55 ? [[B.neck, 0.5], [B.head, 0.5]] : [[B.head, 1]] });
  const HOOD_ARC: [number, number] = [Math.PI / 2 - Math.PI * 0.78, Math.PI / 2 + Math.PI * 0.78]; // open at the face (-z)
  const hg = gear.head;
  if (hg && (hg.style === 'helm' || hg.style === 'cap')) {
    if (hg.style === 'helm') {
      b.loft(M.Metal, [R(1.66, 0, 0.0, 0.118, 0.128, [[B.head, 1]]), R(1.76, 0, 0.0, 0.116, 0.126, [[B.head, 1]]), R(1.83, 0, 0.005, 0.09, 0.1, [[B.head, 1]]), R(1.87, 0, 0.01, 0.04, 0.05, [[B.head, 1]])], hg.color, { capEnd: true, seg: 16 });
      b.blob(M.Metal, V(0, 1.7, -0.13), V(0.012, 0.05, 0.012), hg.color, [[B.head, 1]], 6); // nasal
      if (hg.trim) b.loft(M.Metal, [R(1.665, 0, 0, 0.122, 0.132, [[B.head, 1]]), R(1.69, 0, 0, 0.122, 0.132, [[B.head, 1]])], hg.trim, { seg: 16 });
    } else b.loft(M.Leather, [R(1.74, 0, 0.0, 0.112, 0.122, [[B.head, 1]]), R(1.8, 0, 0.005, 0.1, 0.11, [[B.head, 1]]), R(1.84, 0, 0.01, 0.06, 0.07, [[B.head, 1]])], hg.color, { capEnd: true });
  } else if (hg && (hg.style === 'crown' || hg.style === 'circlet')) {
    b.loft(M.Metal, [R(1.775, 0, 0.0, 0.106, 0.116, [[B.head, 1]]), R(1.8, 0, 0.0, 0.106, 0.116, [[B.head, 1]])], hg.color, { seg: 16 });
    if (hg.style === 'crown') for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; b.blob(M.Metal, V(Math.sin(a) * 0.104, 1.83, Math.cos(a) * 0.114), V(0.012, 0.035, 0.012), hg.trim ?? hg.color, [[B.head, 1]], 5); }
    else b.blob(M.Metal, V(0, 1.79, -0.118), V(0.014, 0.014, 0.008), 0xa8d8ff, [[B.head, 1]], 6);
  } else if (hg?.style === 'hood' || !look || look.headwear === 1) {
    const HOOD = hg?.style === 'hood' ? hg.color : CLOAK;
    b.loft(M.Cloth, hoodRings, HOOD, { seg: 16, arc: HOOD_ARC, uv: [3, 2] });
    b.loft(M.Lining, hoodRings.map((r) => ({ ...r, rx: r.rx - 0.008, rz: r.rz - 0.008 })), HOOD_IN, { seg: 16, arc: HOOD_ARC });
  } else if (look?.headwear === 2) {
    b.loft(M.Leather, [R(1.74, 0, 0.0, 0.112, 0.122, [[B.head, 1]]), R(1.8, 0, 0.005, 0.1, 0.11, [[B.head, 1]]), R(1.84, 0, 0.01, 0.06, 0.07, [[B.head, 1]])], 0x5a3a22, { capEnd: true });
  }
  // mantle over the shoulders
  b.loft(M.Cloth, [
    R(1.53, 0, 0.01, 0.12, 0.1, [[B.chest, 0.5], [B.neck, 0.5]]),
    R(1.47, 0, 0.01, 0.22, 0.14, [[B.chest, 1]]),
    R(1.36, 0, 0.012, 0.26, 0.16, [[B.chest, 1]])
  ], CLOAK, { seg: 20, jag: 0.03, uv: [5, 1] });

  // ---- cloak: hangs behind, driven by springy cloak bones; torn hem
  const cloak: Ring[] = [
    R(1.44, 0, 0.02, 0.22, 0.13, [[B.chest, 1]]),
    R(1.25, 0, 0.05, 0.25, 0.16, [[B.chest, 0.4], [B.cloak1, 0.6]]),
    R(1.0, 0, 0.08, 0.28, 0.18, mixW(B.cloak1, B.cloak2, 0.6)),
    R(0.7, 0, 0.1, 0.3, 0.2, mixW(B.cloak2, B.cloak3, 0.6)),
    R(0.38, 0, 0.12, 0.32, 0.21, [[B.cloak3, 1]])
  ];
  b.loft(M.Cloth, cloak, CLOAK, { seg: 18, arc: [Math.PI * 0.12, Math.PI * 0.88], jag: 0.09, uv: [3, 4] });
}

/** Face, hair, beard and race features for a created character. */
function face(b: SkinBuilder, l: Look, skin: number) {
  const H = [[B.head, 1]] as Weights;
  const fem = l.gender === 'female';
  const hair = HAIR_COLORS[l.hairColor];
  const eyeR = 0.012 + l.eyeSize * 0.01;
  const iris = l.race === 'vampire' ? 0xb01010 : l.race === 'darkelf' ? 0xd8a0ff : l.race === 'catfolk' || l.race === 'werewolf' ? 0xd8b030 : l.race === 'lizardfolk' ? 0xc8c040 : 0x3a5a6a;
  for (const s of [-1, 1]) {
    b.blob(M.Skin, V(s * 0.038, 1.715, -0.1), V(eyeR * 1.4, eyeR, eyeR * 0.6), 0xf0ece4, H, 8);
    b.blob(M.Metal, V(s * 0.038, 1.715, -0.106), V(eyeR * 0.7, eyeR * 0.7, eyeR * 0.4), iris, H, 8);
    const browY = 1.742 + l.brows * 0.006;
    b.blob(M.Skin, V(s * 0.04, browY, -0.098), V(0.024, 0.005 + (fem ? 0 : l.brows * 0.004), 0.008), hair, H, 6);
    // cheekbones
    b.blob(M.Skin, V(s * 0.055, 1.69, -0.078), V(0.03 + l.cheeks * 0.01, 0.022, 0.025), skin, H, 8);
  }
  // nose and mouth
  const ns = 0.7 + l.nose * 0.6;
  b.blob(M.Skin, V(0, 1.695, -0.108), V(0.012 * ns, 0.026 * ns, 0.018 * ns), skin, H, 8);
  const my = 1.655 + (l.mouth - 0.5) * 0.012;
  b.blob(M.Skin, V(0, my, -0.1), V(0.024, 0.005, 0.008), fem ? 0xa85a5a : 0x9a6a5a, H, 8);
  if (l.scars) b.blob(M.Skin, V(0.045, 1.7, -0.096), V(0.004, 0.03, 0.004), 0xe8c0b0, H, 4);
  // ears
  for (const s of [-1, 1]) {
    if (l.race === 'darkelf' || l.race === 'vampire') { const e = V(s * 0.1, 1.73, 0.0); b.blob(M.Skin, e, V(0.012, 0.045, 0.02), skin, H, 6); b.blob(M.Skin, e.clone().add(V(s * 0.012, 0.035, 0.01)), V(0.008, 0.03, 0.012), skin, H, 6); }
    else if (l.race === 'catfolk' || l.race === 'werewolf') { b.blob(M.Cloth, V(s * 0.065, 1.83, 0.0), V(0.03, 0.045, 0.015), l.race === 'werewolf' ? 0x5a4a3a : hair, H, 6); }
    else b.blob(M.Skin, V(s * 0.095, 1.705, 0.005), V(0.012, 0.025, 0.018), skin, H, 6);
  }
  if (l.race === 'lizardfolk') {
    b.blob(M.Skin, V(0, 1.66, -0.11), V(0.06, 0.045, 0.07), skin, H, 10); // snout
    for (let i = 0; i < 4; i++) b.blob(M.Skin, V(0, 1.81 - i * 0.04, 0.03 + i * 0.03), V(0.012, 0.025, 0.02), 0x8a6a3a, H, 5); // crest
  }
  // hair
  const hs = l.hairStyle;
  if (hs > 0 && l.race !== 'lizardfolk') {
    b.blob(M.Cloth, V(0, 1.74, 0.01), V(0.1, 0.088, 0.108), hair, H, 12);
    if (hs >= 2) b.blob(M.Cloth, V(0, 1.63, 0.06), V(0.085, 0.13, 0.05), hair, [[B.head, 0.7], [B.neck, 0.3]], 10);
    if (hs === 3) for (const s of [-1, 1]) b.blob(M.Cloth, V(s * 0.07, 1.55, 0.03), V(0.022, 0.09, 0.022), hair, [[B.neck, 1]], 6);
    if (hs === 4) for (let i = 0; i < 6; i++) b.blob(M.Cloth, V(Math.sin(i) * 0.08, 1.79 + (i % 2) * 0.02, Math.cos(i) * 0.05), V(0.04, 0.05, 0.04), hair, H, 6);
  }
  if (l.beard && !fem) b.blob(M.Cloth, V(0, 1.62, -0.07), V(0.07, l.race === 'dwarf' ? 0.12 : 0.06, 0.05), hair, H, 10);
}

// ------------------------------------------------------------------ materials
function weaveTexture(kind: 'cloth' | 'leather'): THREE.DataTexture {
  const S = 64, d = new Uint8Array(S * S * 4);
  const h = (x: number, y: number) => {
    x = (x + S) % S; y = (y + S) % S;
    if (kind === 'cloth') {
      const wx = Math.sin((x / S) * Math.PI * 32), wy = Math.sin((y / S) * Math.PI * 32);
      return ((Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? wx : wy) * 0.5 + 0.5;
    }
    const n = Math.sin(x * 1.7 + Math.sin(y * 0.9) * 3) * Math.cos(y * 1.3 + Math.sin(x * 0.7) * 2);
    return n * 0.5 + 0.5;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    const n = V(-dx * 1.5, -dy * 1.5, 1).normalize();
    const o = (y * S + x) * 4;
    d[o] = (n.x * 0.5 + 0.5) * 255; d[o + 1] = (n.y * 0.5 + 0.5) * 255; d[o + 2] = (n.z * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** environment reflections for metal (set once by the game) */
export const METAL_ENV: { tex: THREE.Texture | null } = { tex: null };

function makeMaterials(): THREE.Material[] {
  const cloth = weaveTexture('cloth'), leather = weaveTexture('leather');
  return [
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, normalMap: cloth, normalScale: new THREE.Vector2(0.3, 0.3), side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, normalMap: leather, normalScale: new THREE.Vector2(0.5, 0.5), side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.75, envMap: METAL_ENV.tex, envMapIntensity: 0.5 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })
  ];
}

/** A gnarled wooden staff with a wrapped grip. */
function buildStaff(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.85 });
  const wrap = new THREE.MeshStandardMaterial({ color: 0x8a7a60, roughness: 0.95 });
  const pts: V3[] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(V(Math.sin(t * 7) * 0.02, -0.55 + t * 1.75, Math.cos(t * 5) * 0.015)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const shaft = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.022, 7), wood);
  const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 1), wood);
  knot.position.copy(pts[10]).add(V(0.01, 0.03, 0));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.2, 8), wrap);
  grip.position.y = 0.05;
  g.add(shaft, knot, grip);
  return g;
}

// ------------------------------------------------------------------ the model

const TRAIL_N = 10;
// ------------------------------------------------------------------ attacks
/** A pose for the parts of the body that move in an attack (radians / metres). */
interface APose { aRx: number; aRz: number; fR: number; aLx: number; aLz: number; fL: number; chY: number; chX: number; spX: number; hpY: number; hipsY: number; thL: number; shL: number; thR: number; shR: number; lunge: number; }
const P0: APose = { aRx: 0.35, aRz: 0.15, fR: 0.5, aLx: 0.2, aLz: -0.15, fL: 0.4, chY: 0, chX: 0, spX: 0.05, hpY: 0, hipsY: 0, thL: 0, shL: -0.08, thR: 0, shR: -0.08, lunge: 0 };
const P = (o: Partial<APose>): APose => ({ ...P0, ...o });
export type AttackKind = 'slashR' | 'slashL' | 'overhead' | 'thrust' | 'shoot' | 'tool';
/** keyframes: [time 0..1, pose]; the blow lands around 0.6 */
const ATTACKS: Record<AttackKind, [number, APose][]> = {
  // forehand diagonal: from high right, across and down to the left
  slashR: [[0, P({ thL: 0.25, shL: -0.3 })], [0.38, P({ aRx: 2.3, aRz: 1.05, fR: 1.0, aLx: 0.6, aLz: -0.5, fL: 0.9, chY: -0.65, hpY: -0.25, spX: -0.02, thL: 0.35, shL: -0.4, thR: -0.15, hipsY: -0.04 })],
    [0.6, P({ aRx: 1.0, aRz: -0.55, fR: 0.15, aLx: 0.3, aLz: -0.7, fL: 0.6, chY: 0.6, hpY: 0.3, spX: 0.2, chX: 0.12, thL: 0.55, shL: -0.6, thR: -0.25, hipsY: -0.09, lunge: 0.32 })],
    [0.78, P({ aRx: 0.6, aRz: -0.75, fR: 0.3, chY: 0.72, hpY: 0.3, spX: 0.22, thL: 0.5, shL: -0.55, thR: -0.2, hipsY: -0.08, lunge: 0.3 })], [1, P({})]],
  // backhand: from low left, up and out to the right
  slashL: [[0, P({})], [0.36, P({ aRx: 1.0, aRz: -0.85, fR: 1.5, aLx: 0.5, aLz: -0.3, chY: 0.6, hpY: 0.25, thR: 0.3, shR: -0.4, hipsY: -0.05 })],
    [0.6, P({ aRx: 1.85, aRz: 1.0, fR: 0.2, aLx: 0.2, aLz: -0.8, chY: -0.55, hpY: -0.3, spX: 0.12, thR: 0.5, shR: -0.55, thL: -0.2, hipsY: -0.08, lunge: 0.28 })],
    [0.78, P({ aRx: 2.05, aRz: 1.15, fR: 0.25, chY: -0.65, hpY: -0.3, spX: 0.12, thR: 0.45, shR: -0.5, hipsY: -0.07, lunge: 0.26 })], [1, P({})]],
  // two-handed overhead: lean back, then come down with the whole body
  overhead: [[0, P({})], [0.42, P({ aRx: 3.05, aRz: 0.25, fR: 1.25, aLx: 2.8, aLz: 0.35, fL: 1.25, spX: -0.22, chX: -0.18, thL: 0.2, shL: -0.25, hipsY: 0.02 })],
    [0.6, P({ aRx: 0.75, aRz: 0.05, fR: 0.1, aLx: 0.8, aLz: 0.3, fL: 0.25, spX: 0.5, chX: 0.3, thL: 0.75, shL: -0.85, thR: -0.35, shR: -0.2, hipsY: -0.16, lunge: 0.45 })],
    [0.8, P({ aRx: 0.45, aRz: 0.05, fR: 0.15, aLx: 0.5, aLz: 0.3, fL: 0.3, spX: 0.55, chX: 0.3, thL: 0.7, shL: -0.8, thR: -0.3, hipsY: -0.15, lunge: 0.42 })], [1, P({})]],
  // thrust: draw the weapon back at the hip, then drive it straight out with a lunge
  thrust: [[0, P({})], [0.38, P({ aRx: 0.9, aRz: 0.55, fR: 1.9, aLx: 0.8, aLz: -0.2, fL: 0.6, chY: -0.5, hpY: -0.2, thR: 0.15, hipsY: -0.04 })],
    [0.58, P({ aRx: 1.6, aRz: 0.02, fR: 0.0, aLx: 0.0, aLz: -0.45, fL: 0.2, chY: 0.4, hpY: 0.2, spX: 0.25, chX: 0.1, thL: 0.8, shL: -0.75, thR: -0.45, shR: -0.15, hipsY: -0.12, lunge: 0.6 })],
    [0.78, P({ aRx: 1.55, aRz: 0.05, fR: 0.05, chY: 0.4, hpY: 0.2, spX: 0.25, thL: 0.75, shL: -0.7, thR: -0.4, hipsY: -0.11, lunge: 0.58 })], [1, P({})]],
  // a bow: side-on stance, bow arm out, draw to the cheek, release
  shoot: [[0, P({})], [0.3, P({ aLx: 1.55, aLz: 0.0, fL: 0.05, aRx: 1.45, aRz: -0.35, fR: 1.5, chY: -0.75, hpY: -0.35, thL: 0.2, thR: -0.2 })],
    [0.58, P({ aLx: 1.58, aLz: 0.0, fL: 0.0, aRx: 1.35, aRz: -0.7, fR: 2.4, chY: -0.85, hpY: -0.4, thL: 0.2, thR: -0.2 })],
    [0.66, P({ aLx: 1.55, aLz: 0.0, fL: 0.05, aRx: 1.5, aRz: 0.2, fR: 1.2, chY: -0.8, hpY: -0.4, thL: 0.2, thR: -0.2 })], [1, P({})]],
  // tools: the old chop / mine arc
  tool: [[0, P({})], [0.45, P({ aRx: 2.9, aRz: 0.25, fR: 1.1, chY: -0.35, spX: -0.05 })], [0.62, P({ aRx: 0.9, aRz: 0.25, fR: 0.3, chY: 0.25, chX: 0.25, spX: 0.25, hipsY: -0.06 })], [1, P({})]]
};
const ease = (t: number) => t * t * (3 - 2 * t);
/** pose of an attack at time t, and how strongly it should override (0..1) */
function attackPose(kind: AttackKind, t: number): APose {
  const K = ATTACKS[kind];
  let i = 0;
  while (i < K.length - 2 && K[i + 1][0] <= t) i++;
  const [ta, a] = K[i], [tb, b] = K[i + 1];
  const f = ease(Math.max(0, Math.min(1, (t - ta) / (tb - ta))));
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof APose)[]) out[k] = a[k] + (b[k] - a[k]) * f;
  return out;
}

export class HeroModel {
  readonly root = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  private bones: THREE.Bone[] = [];
  private phase = 0;
  private cloakVel = [0, 0, 0];
  private cloakAng = [0, 0, 0];
  private lastPos = new THREE.Vector3();
  private roll = 0;
  private t = 0;
  /** 0..1 progress of a tool swing (set by interaction), -1 = none */
  swing = -1;
  /** 0..1 bending down to harvest */
  harvest = 0;
  /** which attack the current swing is */
  attackKind: AttackKind = 'tool';
  /** enemies close: knees bent, weapon up */
  stance = false;
  private yawPrev = 0;
  private turnLean = 0;
  private wasGround = true;
  private landT = 0;
  private stanceK = 0;
  /** world-space weapon trail (added to the scene by the game) */
  readonly trail!: THREE.Mesh;
  private trailPts: THREE.Vector3[] = [];
  private tipLen = 0.8;
  readonly handR: THREE.Bone;
  readonly handL: THREE.Bone;
  private shieldSlot = new THREE.Group();
  private shieldId: string | null = null;
  readonly held = new THREE.Group();
  private staff = buildStaff();

  constructor() {
    const names = Object.keys(BONES) as BoneName[];
    for (const n of names) { const bone = new THREE.Bone(); bone.name = n; this.bones.push(bone); }
    for (const n of names) {
      const bone = this.bones[BONES[n]], p = PARENT[n];
      if (p) { this.bones[BONES[p]].add(bone); bone.position.copy(POS[n]).sub(POS[p]); }
      else bone.position.copy(POS[n]);
    }
    const builder = new SkinBuilder(6);
    buildBody(builder);
    const geo = builder.build();
    this.mesh = new THREE.SkinnedMesh(geo, makeMaterials());
    this.metal = (this.mesh.material as THREE.MeshStandardMaterial[])[3];
    this.mesh.add(this.bones[0]);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.handR = this.bones[BONES.handR];
    this.handL = this.bones[BONES.handL];
    this.shieldSlot.position.set(-0.05, 0.08, -0.02);
    this.bones[BONES.forearmL].add(this.shieldSlot);
    // held item sits in the right hand, pointing forward/up
    this.held.position.set(0, -0.06, -0.01);
    this.handR.add(this.held);
    this.setHeld(null);
    {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
      g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(TRAIL_N * 2), 1));
      const idx: number[] = [];
      for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      const m = new THREE.ShaderMaterial({
        vertexShader: 'attribute float alpha; varying float vA; void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying float vA; void main() { gl_FragColor = vec4(1.0, 0.95, 0.85, vA * 0.35); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      });
      (this as { trail: THREE.Mesh }).trail = new THREE.Mesh(g, m);
      this.trail.frustumCulled = false;
      this.trail.visible = false;
    }
    this.bones[BONES.hips].add(this.tail);
  }

  /** Show an item mesh in the right hand (null = the starting staff). */
  setHeld(obj: THREE.Object3D | null) {
    this.held.clear();
    // weapon length for the trail
    if (obj) { const b = new THREE.Box3().setFromObject(obj); this.tipLen = Math.max(0.3, b.max.y); } else this.tipLen = 1.0;
    const o = obj ?? this.staff;
    if (!obj) { o.rotation.set(0.12, 0, 0); o.position.set(0, -0.32, -0.02); }
    this.held.add(o);
  }

  /** Show a shield on the left forearm (by item id), or none. */
  setShield(id: string | null, color = 0x8a6a42) {
    if (id === this.shieldId) return;
    this.shieldId = id;
    this.shieldSlot.clear();
    if (!id) return;
    const metal = id.includes('iron');
    const shape = new THREE.Shape();
    shape.moveTo(-0.2, 0.24); shape.lineTo(0.2, 0.24); shape.lineTo(0.19, -0.02); shape.quadraticCurveTo(0.14, -0.22, 0, -0.3); shape.quadraticCurveTo(-0.14, -0.22, -0.19, -0.02); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: metal ? 0x9a9aa2 : color, roughness: metal ? 0.4 : 0.8, metalness: metal ? 0.8 : 0 }));
    mesh.rotation.y = -Math.PI / 2; mesh.position.set(-0.07, -0.12, 0);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 6), new THREE.MeshStandardMaterial({ color: 0xc8a040, roughness: 0.35, metalness: 0.9 }));
    boss.position.set(-0.13, -0.1, 0);
    this.shieldSlot.add(mesh, boss);
  }
  blocking = false;
  private metal!: THREE.MeshStandardMaterial;
  /** metal reflection strength (follows daylight) */
  setMetalEnv(tex: THREE.Texture, k: number) { if (this.metal.envMap !== tex) { this.metal.envMap = tex; this.metal.needsUpdate = true; } this.metal.envMapIntensity = k; }

  /** Rebuild the body for a created character (null = the faceless Nameless One). */
  private look: Look | null = null;
  private gear: WornLook = {};
  /** Rebuild with the given worn gear (keeps the current look). */
  setGear(gear: WornLook) { this.gear = gear; this.setLook(this.look); }
  setLook(look: Look | null) {
    this.look = look;
    const builder = new SkinBuilder(6);
    buildBody(builder, look, this.gear);
    const old = this.mesh.geometry;
    this.mesh.geometry = builder.build();
    old.dispose();
    const race = look ? RACES.find((r) => r.id === look.race)! : null;
    const h = race?.height ?? 1;
    const fem = look?.gender === 'female';
    this.root.scale.set(h * (fem ? 0.95 : 1) * (look?.race === 'barbarian' ? 1.05 : 1), h * (fem ? 0.96 : 1), h * (fem ? 0.95 : 1));
    this.tail.visible = look?.race === 'catfolk' || look?.race === 'lizardfolk' || look?.race === 'werewolf';
    (this.tail.material as THREE.MeshStandardMaterial).color.set(look?.race === 'lizardfolk' ? race!.skin[look.skin % 4] : look ? HAIR_COLORS[look.hairColor] : 0);
    this.tail.scale.setScalar(look?.race === 'lizardfolk' ? 1.6 : 1);
  }
  private tail: THREE.Mesh = (() => {
    const g = new THREE.CapsuleGeometry(0.035, 0.6, 3, 8); g.rotateX(1.1); g.translate(0, -0.12, 0.28);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ roughness: 0.8 }));
    m.visible = false;
    return m;
  })();

  private bone(n: BoneName) { return this.bones[BONES[n]]; }
  /** Smoothly rotate a bone toward a target euler (x, y, z). */
  private aim(n: BoneName, x: number, y: number, z: number, k: number) {
    const r = this.bone(n).rotation;
    r.x += (x - r.x) * k; r.y += (y - r.y) * k; r.z += (z - r.z) * k;
  }

  update(dt: number, p: Player, visible: boolean) {
    this.root.visible = visible;
    this.t += dt;
    const moved = this.lastPos.distanceTo(p.pos);
    this.lastPos.copy(p.pos);
    this.root.position.copy(p.pos);
    this.root.rotation.y = p.yaw;
    const k = Math.min(1, dt * 14);
    // lean into turns, dip on landing, settle into a fighting stance
    let dyaw = p.yaw - this.yawPrev; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw)); this.yawPrev = p.yaw;
    this.turnLean += (Math.max(-0.25, Math.min(0.25, -dyaw / Math.max(dt, 1e-3) * 0.045 * Math.min(1, p.speed / 4))) - this.turnLean) * Math.min(1, dt * 6);
    const groundNow = p.state === 'ground';
    if (groundNow && !this.wasGround) this.landT = Math.min(0.35, 0.12 + Math.max(0, -p.vel.y) * 0.02);
    this.wasGround = groundNow;
    this.landT = Math.max(0, this.landT - dt);
    this.stanceK += ((this.stance && p.speed < 3 && groundNow ? 1 : 0) - this.stanceK) * Math.min(1, dt * 5);
    const speed = p.speed;
    const run = Math.min(1, Math.max(0, (speed - 4.5) / 3));
    const walk = Math.min(1, speed / 2.5);
    const ground = p.state === 'ground';
    if (ground) this.phase += Math.min(moved, 0.5) / (1.05 + run * 0.55) * Math.PI;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const hips = this.bone('hips');

    // defaults (idle) — breathing and a slow look around
    const breathe = Math.sin(this.t * 2.1) * 0.025;
    let hipsY = POS.hips.y, lean = 0.04 + run * 0.2;
    let hipsRoll = Math.cos(this.phase) * 0.07 * walk; // the pelvis drops toward the swinging leg
    let rootPitch = 0;
    const legA = (0.5 + run * 0.4) * walk, armA = (0.42 + run * 0.4) * walk;
    // each leg: thigh swings with sin(phase); the knee bends while the leg swings forward
    const knee = (ph: number) => Math.max(0, Math.cos(ph + 0.5)) * (0.95 + run * 1.0) * walk + 0.06;
    const kL = knee(this.phase), kR = knee(this.phase + Math.PI);
    hipsY -= Math.abs(c) * (0.025 + run * 0.04) * walk;

    let thighL = s * legA, thighR = -s * legA, shinL = -kL, shinR = -kR;
    let footL = kL * 0.45 - thighL * 0.3, footR = kR * 0.45 - thighR * 0.3;
    let armLx = -s * armA, armRx = s * armA, armLz = -0.1 - breathe, armRz = 0.1 + breathe;
    let foreL = 0.2 + run * 0.9 + Math.max(0, -s) * 0.3 * walk, foreR = 0.2 + run * 0.9 + Math.max(0, s) * 0.3 * walk;
    let spineX = lean * 0.5 + breathe * 0.5, chestX = lean * 0.5, chestY = -s * 0.12 * walk, hipsYaw = s * 0.08 * walk;
    let headX = -lean * 0.6, headY = Math.sin(this.t * 0.35) * 0.25 * (1 - walk);
    // idle: a slow weight shift from foot to foot
    const shift = Math.sin(this.t * 0.6) * (1 - walk);
    hipsRoll += shift * 0.04; thighL += shift * 0.03; thighR -= shift * 0.03; shinR -= Math.max(0, shift) * 0.12; shinL -= Math.max(0, -shift) * 0.12;
    // running: forearms bent, hands loose, pushing off the toes
    foreL += run * 0.35; foreR += run * 0.35;
    footL -= Math.max(0, -s) * 0.35 * walk; footR -= Math.max(0, s) * 0.35 * walk;
    // landing: knees give way and recover
    if (this.landT > 0) { const d = this.landT * 1.6; hipsY -= d * 0.35; thighL += d * 0.9; thighR += d * 0.9; shinL -= d * 1.6; shinR -= d * 1.6; spineX += d * 0.6; }
    // fighting stance
    const st = this.stanceK;
    if (st > 0.01) {
      hipsY -= 0.06 * st; thighL += 0.3 * st; shinL -= 0.45 * st; thighR -= 0.12 * st; shinR -= 0.3 * st;
      armRx += (0.85 - armRx) * st; armRz += (0.35 - armRz) * st; foreR += (1.25 - foreR) * st;
      armLx += (0.7 - armLx) * st; armLz += (-0.25 - armLz) * st; foreL += (1.1 - foreL) * st;
      chestY += -0.25 * st; hipsYaw += -0.2 * st; spineX += 0.08 * st;
    }

    switch (p.state) {
      case 'air':
        thighL = 0.5; thighR = -0.15; shinL = -0.9; shinR = -0.35; footL = 0.2; footR = 0.1;
        armLx = 0.4; armRx = -0.2; armLz = -0.45; armRz = 0.45; foreL = 0.5; foreR = 0.5;
        break;
      case 'swim': {
        const sw = Math.sin(this.t * 3.5);
        rootPitch = -1.15; hipsY = 0.55;
        thighL = sw * 0.35; thighR = -sw * 0.35; shinL = -0.3; shinR = -0.3;
        armLx = 2.2 + sw * 0.6; armRx = 2.2 + sw * 0.6; armLz = -0.6 - sw * 0.5; armRz = 0.6 + sw * 0.5; foreL = 0.3; foreR = 0.3;
        headX = -0.9; spineX = 0; chestX = 0;
        break;
      }
      case 'climb': {
        const cl = Math.sin(this.t * 6);
        armLx = 2.6 + cl * 0.35; armRx = 2.6 - cl * 0.35; armLz = -0.15; armRz = 0.15; foreL = 0.6; foreR = 0.6;
        thighL = 0.7 + cl * 0.4; thighR = 0.7 - cl * 0.4; shinL = -1.0; shinR = -1.0; headX = 0.35;
        break;
      }
      case 'roll':
        this.roll += dt * 15;
        rootPitch = -this.roll; hipsY = 0.5;
        thighL = thighR = 1.6; shinL = shinR = -2.2; armLx = armRx = 1.2; foreL = foreR = 1.5; headX = 0.6;
        break;
    }
    if (p.state !== 'roll') this.roll = 0;
    if (p.sitting) {
      thighL = thighR = 1.45; shinL = shinR = -1.45; footL = footR = 0; hipsY = 0.52;
      armLx = armRx = 0.45; foreL = foreR = 0.6; spineX = 0.05; chestX = 0;
    }

    // attacks: keyframed wind-up, strike, follow-through and recovery
    let lunge = 0, kk = k;
    if (this.swing >= 0) {
      const A = attackPose(this.attackKind, this.swing);
      const w = Math.min(1, this.swing / 0.08, (1 - this.swing) / 0.12 + 0.2); // blend in and out
      const mix = (a: number, b: number) => a + (b - a) * Math.min(1, w);
      armRx = mix(armRx, A.aRx); armRz = mix(armRz, A.aRz); foreR = mix(foreR, A.fR);
      const twoHanded = this.attackKind === 'overhead' || this.attackKind === 'shoot' || (this.attackKind !== 'tool' && !this.blocking);
      if (twoHanded) { armLx = mix(armLx, A.aLx); armLz = mix(armLz, A.aLz); foreL = mix(foreL, A.fL); }
      chestY = mix(chestY, A.chY); chestX += A.chX * w; spineX += A.spX * w; hipsYaw += A.hpY * w; hipsY += A.hipsY * w;
      if (walk < 0.5) { thighL = mix(thighL, A.thL); shinL = mix(shinL, A.shL); thighR = mix(thighR, A.thR); shinR = mix(shinR, A.shR); }
      lunge = A.lunge * w;
      // the strike itself is fast: no smoothing between 0.4 and 0.65
      if (this.swing > 0.36 && this.swing < 0.68) kk = Math.min(1, dt * 30);
    }
    // blocking: raise the shield arm across the body
    if (this.blocking) { armLx = 1.25; armLz = 0.35; foreL = 1.3; spineX += 0.08; }
    // harvesting: bend down and reach
    if (this.harvest > 0) {
      const h = this.harvest;
      spineX += 0.55 * h; chestX += 0.35 * h; armRx = armRx * (1 - h) + 1.2 * h; foreR = foreR * (1 - h) + 0.2 * h;
      thighL += 0.5 * h; thighR += 0.5 * h; shinL -= 0.8 * h; shinR -= 0.8 * h; hipsY -= 0.18 * h;
    }

    hips.position.y += (hipsY - hips.position.y) * k;
    this.mesh.rotation.x += (rootPitch - this.mesh.rotation.x) * (p.state === 'roll' ? 1 : k);
    if (p.state === 'swim' || p.state === 'roll') this.mesh.position.y = p.state === 'roll' ? 0.45 : 0.9;
    else this.mesh.position.y += (0 - this.mesh.position.y) * k;
    this.aim('hips', 0, hipsYaw, hipsRoll, k);
    this.mesh.rotation.z += (this.turnLean - this.mesh.rotation.z) * k;
    this.mesh.position.z += (-lunge - this.mesh.position.z) * Math.min(1, dt * 16);
    this.aim('spine', spineX, 0, 0, k);
    this.aim('chest', chestX + breathe * 0.4, chestY, 0, kk);
    this.aim('neck', headX * 0.4, headY * 0.4, 0, k);
    this.aim('head', headX * 0.6, headY * 0.6, 0, k);
    this.aim('thighL', thighL, 0, 0.03, k); this.aim('thighR', thighR, 0, -0.03, k);
    this.aim('shinL', shinL, 0, 0, k); this.aim('shinR', shinR, 0, 0, k);
    this.aim('footL', footL, 0, 0, k); this.aim('footR', footR, 0, 0, k);
    this.aim('upperArmL', armLx, 0, armLz, kk); this.aim('upperArmR', armRx, 0, armRz, kk);
    this.aim('forearmL', foreL, 0, 0, kk); this.aim('forearmR', foreR, 0, 0, kk);
    this.updateTrail();

    // cloak springs: trail behind when moving, lift when falling
    const fwd = speed * (p.state === 'swim' ? 0.02 : 0.11) + Math.max(0, -p.vel.y) * 0.05 + Math.sin(this.t * 1.7) * 0.03;
    for (let i = 0; i < 3; i++) {
      const target = Math.min(1.1, fwd * (0.5 + i * 0.35)) + (this.swing >= 0 ? 0.1 : 0);
      this.cloakVel[i] += (target - this.cloakAng[i]) * dt * 40;
      this.cloakVel[i] *= Math.exp(-dt * 7);
      this.cloakAng[i] += this.cloakVel[i] * dt;
      const b = this.bone((['cloak1', 'cloak2', 'cloak3'] as const)[i]);
      b.rotation.x = -this.cloakAng[i] * (i === 0 ? 0.5 : 0.7) - (i === 0 ? spineX * 0.5 : 0);
      b.rotation.z = Math.sin(this.t * 2.3 + i) * 0.03 * (1 + speed * 0.1);
    }
  }

  /** a fading ribbon behind the blade during the strike */
  private updateTrail() {
    const on = this.swing > 0.4 && this.swing < 0.78 && this.attackKind !== 'shoot' && this.attackKind !== 'tool' && this.root.visible;
    if (!on) { if (this.trailPts.length) this.trailPts = []; this.trail.visible = false; return; }
    this.root.updateMatrixWorld(true);
    const base = new THREE.Vector3(), tip = new THREE.Vector3(0, this.tipLen, 0);
    this.held.getWorldPosition(base);
    this.held.localToWorld(tip);
    const mid = base.clone().lerp(tip, 0.35);
    this.trailPts.unshift(mid, tip);
    if (this.trailPts.length > TRAIL_N * 2) this.trailPts.length = TRAIL_N * 2;
    const pos = this.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
    const al = this.trail.geometry.getAttribute('alpha') as THREE.BufferAttribute;
    const n = this.trailPts.length / 2;
    for (let i = 0; i < TRAIL_N; i++) {
      const j = Math.min(i, n - 1);
      const a = this.trailPts[j * 2], b = this.trailPts[j * 2 + 1];
      pos.setXYZ(i * 2, a.x, a.y, a.z); pos.setXYZ(i * 2 + 1, b.x, b.y, b.z);
      const f = i < n ? 1 - i / TRAIL_N : 0;
      al.setX(i * 2, f * 0.2); al.setX(i * 2 + 1, f);
    }
    pos.needsUpdate = true; al.needsUpdate = true;
    this.trail.visible = n > 1;
  }
}
