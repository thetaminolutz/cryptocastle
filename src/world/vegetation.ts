// Trees and plants: procedural models (trunks + leaf-cluster cards) drawn with one
// instanced draw call per kind. Instances come from the chunk workers; plants are
// only drawn within a radius of the player (with a soft shrink at the edge).
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAYER } from './textures';
import { propMaterial } from './shaders';
import { mulberry32 } from './noise';
import { Plant, PLANT_KINDS, Tree, TREE_KINDS } from './biomes';
import { PLANT_STRIDE, TREE_STRIDE } from './terrain';
import { SHADOW_LAYER, type ShadowSystem } from '../engine/shadows';

// ------------------------------------------------------------------ geometry builder
const FOLIAGE = 10;
const srgb = (c: number) => (c > 1 ? c : Math.pow(c, 2.2));
interface PartOpts {
  layer: string; tint?: number; glow?: number; color?: [number, number, number];
  wind?: (p: THREE.Vector3) => number; ao?: (p: THREE.Vector3, n: THREE.Vector3) => number;
  normal?: (p: THREE.Vector3, n: THREE.Vector3) => THREE.Vector3;
  uvScale?: [number, number];
}

class GeoBuilder {
  pos: number[] = []; nrm: number[] = []; uv: number[] = []; lt: number[] = []; col: number[] = []; wa: number[] = []; idx: number[] = [];
  bones: number[] = [];
  private vc = 0;

  add(g: THREE.BufferGeometry, o: PartOpts, m?: THREE.Matrix4, bone?: [number, THREE.Vector3]) {
    const geo = g.index ? g : g;
    if (m) geo.applyMatrix4(m);
    const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), UV = geo.getAttribute('uv');
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    const [su, sv] = o.uvScale ?? [1, 1];
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
      const nn = o.normal ? o.normal(p, n) : n;
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(nn.x, nn.y, nn.z);
      this.uv.push(UV ? UV.getX(i) * su : 0, UV ? UV.getY(i) * sv : 0);
      this.lt.push(LAYER[o.layer], o.tint ?? 0, o.glow ?? 0);
      const c = o.color ?? [1, 1, 1];
      // colours are authored in sRGB; the shader works in linear light
      this.col.push(srgb(c[0]), srgb(c[1]), srgb(c[2]));
      this.wa.push(o.wind ? o.wind(p) : 0, o.ao ? o.ao(p, n) : 1);
      if (bone) this.bones.push(bone[0], bone[1].x, bone[1].y, bone[1].z);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.idx.push(geo.index.getX(i) + this.vc);
    else for (let i = 0; i < P.count; i++) this.idx.push(i + this.vc);
    this.vc += P.count;
    g.dispose();
  }

  /** A double-sided textured quad from 4 corners (uv 0..1). */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, o: PartOpts, normal: THREE.Vector3) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([...normal.toArray(), ...normal.toArray(), ...normal.toArray(), ...normal.toArray()], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.add(g, o);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aLayerTint', new THREE.Float32BufferAttribute(this.lt, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aWindAo', new THREE.Float32BufferAttribute(this.wa, 2));
    if (this.bones.length) g.setAttribute('aBone', new THREE.Float32BufferAttribute(this.bones, 4));
    g.setIndex(this.vc > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}
export { GeoBuilder };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const M = () => new THREE.Matrix4();

function trunk(b: GeoBuilder, rTop: number, rBot: number, h: number, layer: string, bend = 0.3, seg = 8) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 5, true);
  g.translate(0, h / 2, 0);
  const P = g.getAttribute('position');
  for (let i = 0; i < P.count; i++) {
    const t = P.getY(i) / h;
    P.setX(i, P.getX(i) + t * t * bend);
    // root flare
    if (t < 0.12) { const f = 1 + (0.12 - t) * 3; P.setX(i, P.getX(i) * f); P.setZ(i, P.getZ(i) * f); }
  }
  g.computeVertexNormals();
  b.add(g, { layer, uvScale: [2, h / 2.2], ao: (p) => 0.45 + 0.55 * Math.min(1, p.y / (h * 0.6)), wind: (p) => p.y / h * 0.15 });
}

function branch(b: GeoBuilder, from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, layer: string) {
  const g = new THREE.CylinderGeometry(r * 0.4, r, len, 6, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  b.add(g, { layer, uvScale: [1, len / 2], wind: () => 0.2 }, M().compose(from, q, V(1, 1, 1)));
}

/** Clusters of leaf cards on a crown, plus a dense inner mass. */
function crown(b: GeoBuilder, centre: THREE.Vector3, rx: number, ry: number, rz: number, cards: number, cardSize: number, layer: string, mass: string, seed: number, tint = 1) {
  const rnd = mulberry32(seed);
  const massG = new THREE.IcosahedronGeometry(1, 2);
  massG.scale(rx * 0.58, ry * 0.58, rz * 0.58);
  massG.translate(centre.x, centre.y, centre.z);
  b.add(massG, { layer: mass, tint, uvScale: [3, 3], normal: (p) => p.clone().sub(centre).normalize(), wind: (p) => Math.max(0, p.y) * 0.08, ao: (p) => 0.55 + 0.35 * Math.max(0, (p.y - centre.y) / ry) });
  for (let i = 0; i < cards; i++) {
    const u = rnd() * Math.PI * 2, v = Math.acos(2 * rnd() - 1) * 0.85;
    const dir = V(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
    const c = V(centre.x + dir.x * rx * 0.85, centre.y + dir.y * ry * 0.85, centre.z + dir.z * rz * 0.85);
    const s = cardSize * (0.75 + rnd() * 0.5);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI));
    const ax = V(1, 0, 0).applyQuaternion(q).multiplyScalar(s / 2), ay = V(0, 1, 0).applyQuaternion(q).multiplyScalar(s / 2);
    const n = dir.clone().add(V(0, 0.3, 0)).normalize();
    b.quad(c.clone().sub(ax).sub(ay), c.clone().add(ax).sub(ay), c.clone().add(ax).add(ay), c.clone().sub(ax).add(ay),
      { layer, tint: tint + FOLIAGE, wind: () => 0.6 + (c.y - centre.y + ry) * 0.1, ao: () => 0.65 + 0.35 * Math.max(0, dir.y) }, n);
  }
}

function pineTiers(b: GeoBuilder, h: number, tiers: number, r0: number, tint: number) {
  const up = V(0, 1, 0);
  const rnd = mulberry32(77 + tint);
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers;
    const y = h * 0.18 + t * h * 0.8;
    const R = r0 * (1 - t * 0.88) * (0.9 + rnd() * 0.2);
    // a drooping skirt of needles per tier
    const skirtH = 0.9 + R * 0.35;
    const skirt = new THREE.ConeGeometry(R * 0.82, skirtH, 9, 1, true);
    skirt.translate(0, y + skirtH * 0.2, 0);
    b.add(skirt, { layer: 'needle_mass', tint: tint === 3 ? 3 : 1, uvScale: [3, 1], wind: () => 0.2 + t * 0.4, ao: (p) => 0.45 + 0.4 * Math.min(1, (p.y - y + skirtH * 0.3) / skirtH) + t * 0.15 });
    const n = 9 - Math.floor(t * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + k * 0.7 + rnd() * 0.3;
      const out = V(Math.cos(a), 0, Math.sin(a));
      const side = V(-out.z, 0, out.x).multiplyScalar(R * 0.5 + 0.3);
      const inner = V(0, y + 0.45, 0), outer = out.clone().multiplyScalar(R * 1.08).add(V(0, y - R * 0.3, 0));
      const normal = out.clone().multiplyScalar(0.6).add(up).normalize();
      b.quad(inner.clone().sub(side.clone().multiplyScalar(0.3)), outer.clone().sub(side), outer.clone().add(side), inner.clone().add(side.clone().multiplyScalar(0.3)),
        { layer: 'needles', tint: tint + FOLIAGE, wind: () => 0.3 + t * 0.6, ao: () => 0.6 + t * 0.4 }, normal);
    }
  }
  const tip = new THREE.ConeGeometry(0.25, 1.2, 6, 1, true);
  tip.translate(0, h + 0.3, 0);
  b.add(tip, { layer: 'needle_mass', tint: tint === 3 ? 3 : 1, wind: () => 0.8 });
}

function buildTree(kind: Tree): THREE.BufferGeometry {
  const b = new GeoBuilder();
  switch (kind) {
    case Tree.Oak:
    case Tree.DarkOak: {
      const dark = kind === Tree.DarkOak;
      const h = dark ? 5.2 : 4.2;
      trunk(b, 0.26, dark ? 0.52 : 0.42, h, 'bark_oak', 0.35);
      const rnd = mulberry32(dark ? 7 : 3);
      for (let i = 0; i < 5; i++) {
        const a = rnd() * Math.PI * 2;
        branch(b, V(0.2, h * (0.6 + rnd() * 0.3), 0), V(Math.cos(a), 0.9 + rnd(), Math.sin(a)), 2.2, 0.13, 'bark_oak');
      }
      const top = h + 1.6;
      const leaf = dark ? 'leaves_dark' : 'leaves_oak';
      crown(b, V(0.3, top, 0), 2.6, 1.9, 2.6, 40, 1.8, leaf, 'foliage_mass', 11, 1);
      crown(b, V(1.6, top - 0.9, 0.8), 1.6, 1.3, 1.6, 18, 1.4, leaf, 'foliage_mass', 12, 1);
      crown(b, V(-1.3, top - 0.6, -1.0), 1.7, 1.3, 1.7, 18, 1.4, leaf, 'foliage_mass', 13, 1);
      break;
    }
    case Tree.Birch: {
      trunk(b, 0.14, 0.24, 7, 'bark_birch', 0.25);
      crown(b, V(0.25, 6.4, 0), 1.6, 2.4, 1.6, 32, 1.2, 'leaves_birch', 'foliage_mass', 21, 1);
      crown(b, V(0.0, 4.6, 0.3), 1.3, 1.3, 1.3, 10, 1.1, 'leaves_birch', 'foliage_mass', 22, 1);
      break;
    }
    case Tree.Pine:
    case Tree.SnowPine:
      trunk(b, 0.12, 0.34, 10, 'bark_pine', 0.1);
      pineTiers(b, 10, 9, 3.0, kind === Tree.SnowPine ? 3 : 1);
      break;
    case Tree.Dead: {
      trunk(b, 0.14, 0.38, 6, 'bark_dead', 0.5);
      const rnd = mulberry32(41);
      for (let i = 0; i < 7; i++) {
        const a = rnd() * Math.PI * 2, y = 2.5 + rnd() * 3.2;
        const dir = V(Math.cos(a), 0.5 + rnd() * 0.8, Math.sin(a));
        branch(b, V(0.3 * (y / 6) ** 2, y, 0), dir, 1.6 + rnd() * 1.4, 0.1, 'bark_dead');
        const end = dir.clone().normalize().multiplyScalar(1.5).add(V(0, y, 0));
        branch(b, end, V(dir.x + rnd() - 0.5, 1, dir.z + rnd() - 0.5), 1.0, 0.05, 'bark_dead');
      }
      break;
    }
    case Tree.GiantMushroom: {
      trunk(b, 0.5, 0.75, 6, 'mushroom_stem', 0.4, 12);
      const cap = new THREE.SphereGeometry(3.4, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      cap.scale(1, 0.5, 1); cap.translate(0.4, 5.9, 0);
      b.add(cap, { layer: 'mushroom_cap', glow: 0.12, uvScale: [3, 1.5], ao: (p) => 0.6 + 0.4 * ((p.y - 5.9) / 1.7) });
      const gills = new THREE.CircleGeometry(3.35, 20);
      gills.rotateX(Math.PI / 2); gills.translate(0.4, 5.9, 0);
      b.add(gills, { layer: 'white', glow: 0.9, color: [0.55, 0.85, 1.0] });
      break;
    }
    case Tree.Palm: {
      const h = 7;
      const g = new THREE.CylinderGeometry(0.18, 0.3, h, 8, 10, true);
      g.translate(0, h / 2, 0);
      const P = g.getAttribute('position');
      for (let i = 0; i < P.count; i++) { const t = P.getY(i) / h; P.setX(i, P.getX(i) + t * t * 1.8); }
      g.computeVertexNormals();
      b.add(g, { layer: 'bark_palm', uvScale: [1, 4], wind: (p) => p.y / h * 0.3 });
      const top = V(1.8, h, 0);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const out = V(Math.cos(a), 0, Math.sin(a)), side = V(-out.z, 0, out.x).multiplyScalar(0.55);
        const mid = top.clone().add(out.clone().multiplyScalar(1.8)).add(V(0, 0.5, 0));
        const tip = top.clone().add(out.clone().multiplyScalar(3.3)).add(V(0, -1.1, 0));
        const n = V(0, 1, 0);
        b.quad(top.clone().sub(side), top.clone().add(side), mid.clone().add(side), mid.clone().sub(side), { layer: 'frond', tint: 1 + FOLIAGE, wind: () => 0.6 }, n);
        b.quad(mid.clone().sub(side), mid.clone().add(side), tip.clone().add(side.clone().multiplyScalar(0.3)), tip.clone().sub(side.clone().multiplyScalar(0.3)), { layer: 'frond', tint: 1 + FOLIAGE, wind: () => 1 }, n);
      }
      break;
    }
    case Tree.CrystalTree: {
      const rnd = mulberry32(51);
      for (let i = 0; i < 8; i++) {
        const h = 2 + rnd() * 4, r = 0.25 + rnd() * 0.35;
        const g = new THREE.CylinderGeometry(0.02, r, h, 6, 1);
        g.translate(0, h / 2, 0);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.9, rnd() * 6, (rnd() - 0.5) * 0.9));
        b.add(g, { layer: 'crystal', glow: 0.6, uvScale: [1, h / 2] }, M().compose(V((rnd() - 0.5) * 0.8, 0, (rnd() - 0.5) * 0.8), q, V(1, 1, 1)));
      }
      break;
    }
    case Tree.Cactus: {
      const body = new THREE.CapsuleGeometry(0.38, 3, 4, 12);
      body.translate(0, 1.7, 0);
      b.add(body, { layer: 'cactus', uvScale: [1, 2] });
      for (const s of [1, -1]) {
        const arm = new THREE.CapsuleGeometry(0.22, 1.1, 3, 10);
        arm.translate(0.75 * s, 2.2 + (s > 0 ? 0 : 0.5), 0);
        b.add(arm, { layer: 'cactus' });
        const elbow = new THREE.CapsuleGeometry(0.22, 0.4, 3, 10);
        elbow.rotateZ(Math.PI / 2); elbow.translate(0.45 * s, 1.6 + (s > 0 ? 0 : 0.5), 0);
        b.add(elbow, { layer: 'cactus' });
      }
      break;
    }
    case Tree.Willow: {
      trunk(b, 0.3, 0.55, 3.8, 'bark_oak', 0.4);
      const c = V(0.4, 4.6, 0);
      crown(b, c, 2.8, 1.5, 2.8, 14, 1.6, 'leaves_oak', 'foliage_mass', 61, 1);
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        const out = V(Math.cos(a), 0, Math.sin(a)).multiplyScalar(2.6);
        const side = V(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.8);
        const top = c.clone().add(out).add(V(0, 0.2, 0)), bot = top.clone().add(V(0, -3.6, 0)).add(out.clone().multiplyScalar(0.08));
        b.quad(bot.clone().sub(side), bot.clone().add(side), top.clone().add(side), top.clone().sub(side),
          { layer: 'leaves_willow', tint: 1 + FOLIAGE, wind: (p) => (top.y - p.y) * 0.6 + 0.3 }, out.clone().normalize());
      }
      break;
    }
  }
  return b.build();
}

function blades(b: GeoBuilder, count: number, hMin: number, hMax: number, width: number, seed: number, base: [number, number, number], tip: [number, number, number], spread = 0.18) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, h = hMin + rnd() * (hMax - hMin), lean = 0.15 + rnd() * 0.35;
    const out = V(Math.cos(a), 0, Math.sin(a)), side = V(-out.z, 0, out.x).multiplyScalar(width / 2);
    const p0 = out.clone().multiplyScalar(rnd() * spread);
    const p1 = p0.clone().add(out.clone().multiplyScalar(lean * h * 0.4)).add(V(0, h * 0.55, 0));
    const p2 = p0.clone().add(out.clone().multiplyScalar(lean * h)).add(V(0, h, 0));
    const pos = [p0.clone().sub(side), p0.clone().add(side), p1.clone().add(side.clone().multiplyScalar(0.7)), p1.clone().sub(side.clone().multiplyScalar(0.7)), p2];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos.flatMap((p) => [p.x, p.y, p.z]), 3));
    const n = out.clone().multiplyScalar(0.15).add(V(0, 1, 0)).normalize();
    g.setAttribute('normal', new THREE.Float32BufferAttribute([...n.toArray(), ...n.toArray(), ...n.toArray(), ...n.toArray(), ...n.toArray()], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 0.5, 0, 0.5, 0.5, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4]);
    const colAt = (y: number): [number, number, number] => { const t = y / h; return [base[0] + (tip[0] - base[0]) * t, base[1] + (tip[1] - base[1]) * t, base[2] + (tip[2] - base[2]) * t]; };
    // per-vertex colour via separate adds is costly; approximate with mid colour + AO gradient
    b.add(g, { layer: 'white', tint: 1, color: colAt(h * 0.6), wind: (p) => p.y / Math.max(h, 0.01) * 1.4, ao: (p) => 0.45 + 0.55 * (p.y / h) });
  }
}

function buildPlant(kind: Plant): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const green: [number, number, number] = [0.16, 0.3, 0.07], light: [number, number, number] = [0.34, 0.5, 0.14];
  switch (kind) {
    case Plant.Grass: blades(b, 6, 0.3, 0.55, 0.07, 1, green, light); break;
    case Plant.TallGrass: blades(b, 9, 0.7, 1.15, 0.08, 2, [0.25, 0.32, 0.1], [0.45, 0.48, 0.2], 0.25); break;
    case Plant.Flower:
    case Plant.Moonpetal: {
      blades(b, 3, 0.25, 0.4, 0.06, 3, green, light);
      const moon = kind === Plant.Moonpetal;
      const stemH = moon ? 0.5 : 0.45;
      const stem = new THREE.CylinderGeometry(0.008, 0.012, stemH, 4, 1, true); stem.translate(0, stemH / 2, 0);
      b.add(stem, { layer: 'white', color: [0.3, 0.5, 0.18], wind: (p) => p.y * 2 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const petal = new THREE.CircleGeometry(0.06, 5);
        petal.scale(1.4, 0.7, 1); petal.translate(0.06, 0, 0); petal.rotateX(-Math.PI / 2 + 0.35); petal.rotateY(a); petal.translate(0, stemH, 0);
        b.add(petal, moon ? { layer: 'white', glow: 0.9, color: [0.6, 0.8, 1.0], wind: () => 1 } : { layer: 'white', tint: 2, wind: () => 1 }, undefined);
      }
      const centre = new THREE.SphereGeometry(0.03, 6, 4); centre.translate(0, stemH + 0.01, 0);
      b.add(centre, { layer: 'white', color: moon ? [0.9, 1, 1] : [0.95, 0.75, 0.2], glow: moon ? 1 : 0, wind: () => 1 });
      break;
    }
    case Plant.Fern:
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.3;
        const out = V(Math.cos(a), 0, Math.sin(a)), side = V(-out.z, 0, out.x).multiplyScalar(0.22);
        const mid = out.clone().multiplyScalar(0.5).add(V(0, 0.55, 0)), tip = out.clone().multiplyScalar(1.0).add(V(0, 0.35, 0));
        b.quad(side.clone().negate(), side.clone(), mid.clone().add(side), mid.clone().sub(side), { layer: 'fern', tint: 1 + FOLIAGE, wind: () => 0.6 }, V(0, 1, 0));
        b.quad(mid.clone().sub(side), mid.clone().add(side), tip.clone().add(side.clone().multiplyScalar(0.4)), tip.clone().sub(side.clone().multiplyScalar(0.4)), { layer: 'fern', tint: 1 + FOLIAGE, wind: () => 1.2 }, V(0, 1, 0));
      }
      break;
    case Plant.Bush:
    case Plant.BerryBush:
      crown(b, V(0, 0.55, 0), 0.8, 0.6, 0.8, 18, 0.8, 'leaves_oak', 'foliage_mass', kind * 7, 1);
      if (kind === Plant.BerryBush) {
        const rnd = mulberry32(99);
        for (let i = 0; i < 14; i++) {
          const g = new THREE.IcosahedronGeometry(0.05, 0);
          const a = rnd() * 6.28, v = rnd() * 1.2;
          g.translate(Math.cos(a) * 0.75 * Math.cos(v), 0.55 + Math.sin(v) * 0.5, Math.sin(a) * 0.75 * Math.cos(v));
          b.add(g, { layer: 'white', color: [0.75, 0.05, 0.1], wind: () => 0.3 });
        }
      }
      break;
    case Plant.Reeds: {
      blades(b, 12, 1.1, 1.7, 0.05, 5, [0.35, 0.42, 0.18], [0.6, 0.62, 0.3], 0.3);
      const rnd = mulberry32(6);
      for (let i = 0; i < 4; i++) {
        const x = (rnd() - 0.5) * 0.4, z = (rnd() - 0.5) * 0.4, h = 1.3 + rnd() * 0.4;
        const st = new THREE.CylinderGeometry(0.01, 0.012, h, 4, 1, true); st.translate(x, h / 2, z);
        b.add(st, { layer: 'white', color: [0.4, 0.45, 0.2], wind: (p) => p.y });
        const head = new THREE.CapsuleGeometry(0.035, 0.18, 2, 6); head.translate(x, h + 0.05, z);
        b.add(head, { layer: 'white', color: [0.32, 0.2, 0.1], wind: () => h });
      }
      break;
    }
    case Plant.DeadBush: {
      const rnd = mulberry32(8);
      for (let i = 0; i < 9; i++) {
        const a = rnd() * 6.28;
        branch(b, V(0, 0, 0), V(Math.cos(a) * 0.7, 1, Math.sin(a) * 0.7), 0.5 + rnd() * 0.5, 0.025, 'bark_dead');
      }
      break;
    }
    case Plant.Mushroom:
    case Plant.GlowMushroom: {
      const glow = kind === Plant.GlowMushroom;
      const rnd = mulberry32(kind);
      for (let i = 0; i < (glow ? 3 : 2); i++) {
        const x = (rnd() - 0.5) * 0.3, z = (rnd() - 0.5) * 0.3, h = 0.12 + rnd() * 0.15, r = 0.06 + rnd() * 0.08;
        const st = new THREE.CylinderGeometry(r * 0.3, r * 0.4, h, 6, 1, true); st.translate(x, h / 2, z);
        b.add(st, { layer: 'white', color: [0.9, 0.88, 0.8] });
        const cap = new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.6, 1); cap.translate(x, h, z);
        b.add(cap, glow ? { layer: 'white', color: [0.3, 0.85, 1.0], glow: 1.2 } : { layer: 'mushroom_cap', color: [1.6, 0.7, 0.5] });
      }
      break;
    }
    case Plant.Rock: {
      const g = new THREE.IcosahedronGeometry(0.5, 2);
      const P = g.getAttribute('position');
      const rnd = mulberry32(17);
      const seen = new Map<string, number>();
      for (let i = 0; i < P.count; i++) {
        const key = `${P.getX(i).toFixed(3)},${P.getY(i).toFixed(3)},${P.getZ(i).toFixed(3)}`;
        let k = seen.get(key); if (k === undefined) { k = 0.8 + rnd() * 0.35; seen.set(key, k); }
        P.setXYZ(i, P.getX(i) * k * 1.2, P.getY(i) * k * 0.7, P.getZ(i) * k);
      }
      g.deleteAttribute('normal'); g.deleteAttribute('uv');
      const merged = mergeVertices(g);
      merged.computeVertexNormals();
      const uvs: number[] = [];
      const MP = merged.getAttribute('position');
      for (let i = 0; i < MP.count; i++) uvs.push((MP.getX(i) + MP.getZ(i) * 0.6) * 0.5, (MP.getY(i) + MP.getZ(i) * 0.3) * 0.5);
      merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      merged.translate(0, 0.15, 0);
      b.add(merged, { layer: 'cliff_rock', color: [0.95, 0.93, 0.9], ao: (p) => 0.5 + 0.5 * Math.min(1, Math.max(0, p.y + 0.3)) });
      break;
    }
    case Plant.Crystal: {
      const rnd = mulberry32(23);
      for (let i = 0; i < 6; i++) {
        const h = 0.4 + rnd() * 1.1, r = 0.08 + rnd() * 0.12;
        const g = new THREE.CylinderGeometry(0.01, r, h, 6, 1); g.translate(0, h / 2, 0);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 1.2, rnd() * 6, (rnd() - 0.5) * 1.2));
        b.add(g, { layer: 'crystal', glow: 0.9 }, M().compose(V((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3), q, V(1, 1, 1)));
      }
      break;
    }
  }
  return b.build();
}


// ------------------------------------------------------------------ instanced layers
class InstanceSet {
  readonly geo = new THREE.InstancedBufferGeometry();
  private inst!: THREE.InstancedBufferAttribute;
  private inst2!: THREE.InstancedBufferAttribute;
  private capacity = 0;
  constructor(base: THREE.BufferGeometry) {
    for (const [name, attr] of Object.entries(base.attributes)) this.geo.setAttribute(name, attr);
    this.geo.setIndex(base.index);
    this.grow(256);
  }
  private grow(n: number) {
    this.capacity = n;
    this.inst = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.inst2 = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aInst', this.inst);
    this.geo.setAttribute('aInst2', this.inst2);
  }
  /** Begin writing `max` instances; returns the raw arrays. */
  begin(max: number): [Float32Array, Float32Array] {
    if (max > this.capacity) { this.geo.dispose(); this.grow(Math.ceil(max * 1.4) + 16); }
    return [this.inst.array as Float32Array, this.inst2.array as Float32Array];
  }
  commit(count: number) {
    for (const a of [this.inst, this.inst2]) { a.clearUpdateRanges(); a.addUpdateRange(0, count * 4); a.needsUpdate = true; }
    this.geo.instanceCount = count;
  }
}

class PropLayer {
  readonly mesh: THREE.Mesh;
  readonly shadowMesh: THREE.Mesh | null = null;
  readonly main: InstanceSet;
  readonly shadow: InstanceSet | null = null;
  /** candidate instances (near the player) before view culling */
  cand = { a: new Float32Array(0), b: new Float32Array(0), n: 0 };

  constructor(base: THREE.BufferGeometry, readonly material: THREE.ShaderMaterial, readonly shadowMaterial: THREE.ShaderMaterial | null, readonly cullRadius: number) {
    this.main = new InstanceSet(base);
    this.mesh = new THREE.Mesh(this.main.geo, material);
    this.mesh.frustumCulled = false;
    if (shadowMaterial) {
      this.shadow = new InstanceSet(base);
      this.shadowMesh = new THREE.Mesh(this.shadow.geo, shadowMaterial);
      this.shadowMesh.frustumCulled = false;
    }
  }

  ensure(n: number) {
    if (this.cand.a.length < n * 4) this.cand = { a: new Float32Array(n * 8), b: new Float32Array(n * 8), n: 0 };
    this.cand.n = 0;
  }
  push(x: number, y: number, z: number, rot: number, scale: number, v: number, biome: number) {
    const c = this.cand, o = c.n * 4;
    c.a[o] = x; c.a[o + 1] = y; c.a[o + 2] = z; c.a[o + 3] = rot;
    c.b[o] = scale; c.b[o + 1] = v; c.b[o + 2] = biome; c.b[o + 3] = 0;
    c.n++;
  }

  /** Copy candidates inside the view frustum to the GPU. */
  cull(frustum: THREE.Frustum) {
    const c = this.cand;
    const [a, b] = this.main.begin(c.n);
    const sphere = PropLayer.sphere;
    let n = 0;
    for (let i = 0; i < c.n; i++) {
      const o = i * 4;
      sphere.center.set(c.a[o], c.a[o + 1] + this.cullRadius * 0.5 * c.b[o], c.a[o + 2]);
      sphere.radius = this.cullRadius * c.b[o];
      if (!frustum.intersectsSphere(sphere)) continue;
      const w = n * 4;
      a[w] = c.a[o]; a[w + 1] = c.a[o + 1]; a[w + 2] = c.a[o + 2]; a[w + 3] = c.a[o + 3];
      b[w] = c.b[o]; b[w + 1] = c.b[o + 1]; b[w + 2] = c.b[o + 2]; b[w + 3] = 0;
      n++;
    }
    this.main.commit(n);
    this.mesh.visible = n > 0;
  }

  /** Copy candidates within `r` of p to the shadow pass. */
  shadowNear(p: THREE.Vector3, r: number) {
    if (!this.shadow) return;
    const c = this.cand;
    const [a, b] = this.shadow.begin(c.n);
    let n = 0;
    for (let i = 0; i < c.n; i++) {
      const o = i * 4;
      const dx = c.a[o] - p.x, dz = c.a[o + 2] - p.z;
      if (dx * dx + dz * dz > r * r) continue;
      const w = n * 4;
      for (let k = 0; k < 4; k++) { a[w + k] = c.a[o + k]; b[w + k] = c.b[o + k]; }
      n++;
    }
    this.shadow.commit(n);
    this.shadowMesh!.visible = n > 0;
  }
  static sphere = new THREE.Sphere();
}

/** Draw radius (m) per plant kind, relative to the vegetation setting. */
const PLANT_RANGE: Record<number, number> = {
  [Plant.Grass]: 1, [Plant.TallGrass]: 1, [Plant.Flower]: 1.1, [Plant.Fern]: 1.4, [Plant.Bush]: 2.2, [Plant.BerryBush]: 2.2,
  [Plant.Reeds]: 1.5, [Plant.DeadBush]: 1.8, [Plant.Mushroom]: 1, [Plant.GlowMushroom]: 1.8, [Plant.Rock]: 3, [Plant.Crystal]: 1.6, [Plant.Moonpetal]: 1.8
};
const CASTS = new Set<number>([Plant.Bush, Plant.BerryBush, Plant.Rock, Plant.Fern, Plant.TallGrass]);

export class Vegetation {
  readonly group = new THREE.Group();
  private trees: PropLayer[] = [];
  private plants: PropLayer[] = [];
  private treeData = new Map<string, Float32Array>();
  private plantData = new Map<string, Float32Array>();
  private treesDirty = false;
  private plantsDirty = false;
  private lastPos = new THREE.Vector3(1e9, 0, 0);
  private cooldown = 0;
  /** grass radius in metres and fraction of grass instances drawn */
  radius = 30;
  density = 0.7;

  constructor(shadows: ShadowSystem) {
    for (let k = 0; k < TREE_KINDS; k++) {
      const geo = buildTree(k as Tree);
      const layer = new PropLayer(geo, propMaterial({ alphaTest: true }), propMaterial({ alphaTest: true }, true), 7);
      this.addLayer(layer, shadows);
      this.trees.push(layer);
    }
    for (let k = 0; k < PLANT_KINDS; k++) {
      const geo = buildPlant(k as Plant);
      const range = PLANT_RANGE[k] ?? 1;
      const mat = propMaterial({ alphaTest: true, plant: true, doubleSide: true }, false, this.radius * range);
      const shadowMat = CASTS.has(k) ? propMaterial({ alphaTest: true, plant: true, doubleSide: true }, true, this.radius * range) : null;
      const layer = new PropLayer(geo, mat, shadowMat, 1.5);
      this.addLayer(layer, shadows);
      this.plants.push(layer);
    }
  }

  private addLayer(layer: PropLayer, shadows: ShadowSystem) {
    this.group.add(layer.mesh);
    if (layer.shadowMesh) {
      this.group.add(layer.shadowMesh);
      shadows.add(layer.shadowMesh, layer.shadowMaterial!);
      layer.shadowMesh.layers.set(SHADOW_LAYER); // only drawn by the shadow camera
    }
  }

  setQuality(level: number) {
    this.radius = level === 2 ? 42 : level === 1 ? 30 : 18;
    this.density = level === 2 ? 1 : level === 1 ? 0.7 : 0.4;
    this.plants.forEach((p, k) => {
      const r = this.radius * (PLANT_RANGE[k] ?? 1);
      p.material.uniforms.uVegRadius.value = r;
      if (p.shadowMaterial) p.shadowMaterial.uniforms.uVegRadius.value = r;
    });
    this.plantsDirty = true;
  }

  setChunk(key: string, trees: Float32Array, plants: Float32Array) {
    if (trees.length) { this.treeData.set(key, trees); this.treesDirty = true; }
    if (plants.length) { this.plantData.set(key, plants); this.plantsDirty = true; }
  }
  removeChunk(key: string) {
    if (this.treeData.delete(key)) this.treesDirty = true;
    if (this.plantData.delete(key)) this.plantsDirty = true;
  }

  /** Trees near (x,z) for collision: [x, z, radius, y0, y1] */
  treeList(): Iterable<Float32Array> { return this.treeData.values(); }

  private frustum = new THREE.Frustum();
  private projView = new THREE.Matrix4();
  private lastCamPos = new THREE.Vector3(1e9, 0, 0);
  private lastCamQuat = new THREE.Quaternion();
  private needCull = true;
  shadowRadius = 50;

  update(dt: number, player: THREE.Vector3, camera?: THREE.PerspectiveCamera) {
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      if (this.treesDirty || player.distanceToSquared(this.lastTreePos) > 64) {
        this.rebuildTrees(player); this.treesDirty = false; this.lastTreePos.copy(player); this.cooldown = 0.15; this.needCull = true;
      }
      if (this.plantsDirty || player.distanceToSquared(this.lastPos) > 16) {
        this.rebuildPlants(player); this.plantsDirty = false; this.lastPos.copy(player); this.cooldown = 0.25; this.needCull = true;
      }
    }
    if (!camera) return;
    // re-cull only when the camera moved or turned noticeably
    if (this.needCull || camera.position.distanceToSquared(this.lastCamPos) > 1 || camera.quaternion.angleTo(this.lastCamQuat) > 0.05) {
      this.needCull = false;
      this.lastCamPos.copy(camera.position); this.lastCamQuat.copy(camera.quaternion);
      // a slightly wider frustum so fast turns don't pop
      const wide = camera.clone();
      wide.fov = Math.min(170, camera.fov + 25); wide.aspect = camera.aspect * 1.15; wide.updateProjectionMatrix();
      wide.updateMatrixWorld();
      this.projView.multiplyMatrices(wide.projectionMatrix, wide.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projView);
      for (const l of this.trees) l.cull(this.frustum);
      for (const l of this.plants) l.cull(this.frustum);
    }
  }
  private lastTreePos = new THREE.Vector3(1e9, 0, 0);

  private rebuildTrees(p: THREE.Vector3) {
    let total = 0;
    for (const t of this.treeData.values()) total += t.length / TREE_STRIDE;
    for (const l of this.trees) l.ensure(total + 1);
    for (const t of this.treeData.values()) {
      for (let i = 0; i < t.length; i += TREE_STRIDE) {
        this.trees[t[i + 3]].push(t[i], t[i + 1], t[i + 2], t[i + 5], t[i + 4], (t[i] * 0.13 + t[i + 2] * 0.07) % 1, 0);
      }
    }
    for (const l of this.trees) l.shadowNear(p, this.shadowRadius + 12);
  }

  private rebuildPlants(p: THREE.Vector3) {
    let total = 0;
    for (const d of this.plantData.values()) total += d.length / PLANT_STRIDE;
    for (const l of this.plants) l.ensure(total + 1);
    const maxR = this.radius * 3 + 16;
    for (const d of this.plantData.values()) {
      if (!d.length) continue;
      const dx0 = d[0] - p.x, dz0 = d[2] - p.z;
      if (dx0 * dx0 + dz0 * dz0 > maxR * maxR) continue;
      for (let i = 0; i < d.length; i += PLANT_STRIDE) {
        const k = d[i + 3];
        const r = this.radius * (PLANT_RANGE[k] ?? 1);
        const dx = d[i] - p.x, dz = d[i + 2] - p.z;
        if (dx * dx + dz * dz > r * r) continue;
        if ((k === Plant.Grass || k === Plant.TallGrass) && d[i + 6] > this.density) continue;
        this.plants[k].push(d[i], d[i + 1], d[i + 2], d[i + 5], d[i + 4], d[i + 6], d[i + 7]);
      }
    }
    for (const l of this.plants) l.shadowNear(p, Math.min(this.shadowRadius, 40));
  }
}
