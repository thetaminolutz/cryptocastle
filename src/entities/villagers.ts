// Villages come alive: loading village layouts near the player, generating their
// people (deterministic from the village seed), daily schedules, A* paths around
// buildings (doors open as people pass), chatter bubbles, fleeing from monsters,
// guards that fight, and persistent reputation / memory per villager.
import * as THREE from 'three';
import { GeoBuilder } from '../world/vegetation';
import { propMaterial } from '../world/shaders';
import { add, ell, eyes } from '../data/enemies';
import { buildLayout, Job, Layout, Spot, VillageSite, VILLAGE_CELL, siteForCell, BuildingInfo } from '../world/villages';
import { NAMES_F, NAMES_M, SURNAMES, TRAITS, Trait, GIFTABLE, DISLIKED_BY_ALL, CHATTER } from '../data/npcs';
import { mulberry32 } from '../world/noise';
import type { Building, Piece } from '../world/building';
import type { World } from '../world/world';
import type { TerrainGen } from '../world/terrain';
import type { ShadowSystem } from '../engine/shadows';
import type { Creatures } from './creatures';

type C3 = [number, number, number];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export type Outfit = 'man' | 'woman' | 'child' | 'guard' | 'smith' | 'priest' | 'merchant';
const OUTFITS: Outfit[] = ['man', 'woman', 'child', 'guard', 'smith', 'priest', 'merchant'];

// ------------------------------------------------------------------ models
/** capsule geometry between two points (with a rounded end) */
function segGeo(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number): THREE.BufferGeometry {
  const A = V(ax, ay, az), B = V(bx, by, bz), len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r1, r0, len, 10, 2, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), B.clone().sub(A).normalize()));
  g.translate(ax, ay, az);
  return g;
}

function person(b: GeoBuilder, o: Outfit) {
  const child = o === 'child';
  const s = child ? 0.62 : 1;
  const skin: C3 = [0.85, 0.68, 0.55], hair: C3 = [0.28, 0.18, 0.1], pants: C3 = [0.25, 0.22, 0.2], boots: C3 = [0.18, 0.12, 0.08];
  const cloth = (g: THREE.BufferGeometry, bone: number, pivot: THREE.Vector3, layer = 'fabric', color: C3 = [1, 1, 1]) =>
    b.add(g, { layer, color, tint: 4, ao: (p) => 0.6 + 0.4 * Math.min(1, Math.max(0, p.y / 1.4)) }, undefined, [bone, pivot]);
  const hip = 0.92 * s, sh = 1.42 * s, hy = 1.64 * s;
  const dress = o === 'woman' || o === 'priest';
  // torso (+ dress / robe)
  if (o === 'guard') {
    add(b, ell(0.21, 0.31 * s, 0.14, 0, 1.18 * s, 0, 14), [0.55, 0.56, 0.6], 0, V(), 'ore_silver');
    cloth(ell(0.22, 0.2, 0.15, 0, 1.0 * s, 0, 12), 0, V());
  } else cloth(ell(0.19 * (child ? 0.9 : 1), 0.31 * s, 0.13, 0, 1.18 * s, 0, 14), 0, V());
  if (dress) {
    const skirt = new THREE.CylinderGeometry(0.2, o === 'priest' ? 0.34 : 0.3, 0.9 * s, 14, 1, true); skirt.translate(0, 0.45 * s + 0.02, 0);
    if (o === 'priest') add(b, skirt, [0.85, 0.82, 0.75], 0, V(), 'fabric'); else cloth(skirt, 0, V());
  }
  if (o === 'smith') add(b, ell(0.17, 0.32, 0.05, 0, 1.0, -0.12, 10), [0.32, 0.22, 0.14], 0, V(), 'planks');
  if (o === 'merchant') add(b, ell(0.2, 0.06, 0.14, 0, 0.98 * s, 0, 12), [0.55, 0.42, 0.15], 0, V());
  add(b, ell(0.17, 0.05, 0.12, 0, hip + 0.04, 0, 10), [0.22, 0.15, 0.1], 0, V());
  // head, hair, face
  const headP = V(0, 1.5 * s, 0);
  const hk = child ? 1.15 : 1;
  add(b, segGeo(0, 1.46 * s, 0, 0, hy - 0.08, 0, 0.05 * s, 0.045 * s), skin, 5, headP);                 // neck
  for (const sd of [-1, 1]) cloth(ell(0.08, 0.07 * s, 0.085, sd * 0.18 * (child ? 0.9 : 1), sh - 0.01, 0, 10), 0, V()); // shoulders
  add(b, ell(0.097 * hk, 0.116 * hk, 0.104 * hk, 0, hy, 0, 14), skin, 5, headP);                        // cranium
  add(b, ell(0.072 * hk, 0.048, 0.078 * hk, 0, hy - 0.072, -0.022, 10), skin, 5, headP);                 // jaw
  add(b, ell(0.08 * hk, 0.016, 0.028, 0, hy + 0.028, -0.085 * hk, 8), [skin[0] * 0.9, skin[1] * 0.9, skin[2] * 0.9], 5, headP); // brow
  const nose = new THREE.ConeGeometry(0.016, 0.05, 6); nose.rotateX(-Math.PI / 2 - 0.4); nose.translate(0, hy - 0.015, -0.11 * hk); add(b, nose, skin, 5, headP);
  for (const sd of [-1, 1]) add(b, ell(0.014, 0.03, 0.022, sd * 0.098 * hk, hy - 0.005, 0, 6), skin, 5, headP); // ears
  add(b, ell(0.028, 0.008, 0.01, 0, hy - 0.055, -0.098 * hk, 6), [0.6, 0.35, 0.32], 5, headP);            // lips
  eyes(b, 0.035, hy + 0.02, -0.095, 0.012, [0.12, 0.1, 0.08], 0, 5, headP);
  if (o === 'woman') { add(b, ell(0.115, 0.1, 0.11, 0, hy + 0.05, 0.02, 12), hair, 5, headP); add(b, ell(0.08, 0.16, 0.06, 0, hy - 0.08, 0.08, 10), hair, 5, headP); }
  else if (o === 'guard') { const h = new THREE.SphereGeometry(0.125, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); h.translate(0, hy + 0.02, 0); add(b, h, [0.55, 0.56, 0.6], 5, headP, 'ore_silver'); add(b, ell(0.012, 0.08, 0.02, 0, hy - 0.04, -0.12), [0.5, 0.5, 0.55], 5, headP); }
  else if (o === 'priest') { const h = new THREE.SphereGeometry(0.13, 12, 8); h.scale(1, 1.1, 1); h.translate(0, hy + 0.03, 0.03); add(b, h, [0.82, 0.8, 0.72], 5, headP, 'fabric'); }
  else if (o === 'merchant') { const hat = new THREE.CylinderGeometry(0.1, 0.12, 0.14, 12); hat.translate(0, hy + 0.13, 0); add(b, hat, [0.35, 0.12, 0.1], 5, headP, 'fabric'); const brim = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14); brim.translate(0, hy + 0.07, 0); add(b, brim, [0.35, 0.12, 0.1], 5, headP, 'fabric'); }
  else { add(b, ell(0.108, 0.07, 0.11, 0, hy + 0.06, 0.01, 12), hair, 5, headP); if (o === 'man' || o === 'smith') add(b, ell(0.07, 0.06, 0.04, 0, hy - 0.08, -0.08, 8), hair, 5, headP); }
  // arms: left = 1, right = 9
  for (const [side, bone] of [[-1, 1], [1, 9]] as const) {
    const x = side * 0.205 * (child ? 0.9 : 1), ex = side * 0.24 * (child ? 0.9 : 1), ey = sh - 0.3 * s, hx = side * 0.245 * (child ? 0.9 : 1), hy2 = sh - 0.6 * s;
    const piv = V(x, sh, 0);
    if (o === 'guard') add(b, segGeo(x, sh, 0, ex, ey, 0.02, 0.058, 0.05), [0.55, 0.56, 0.6], bone, piv, 'ore_silver');
    else cloth(segGeo(x, sh, 0, ex, ey, 0.02, 0.055, 0.047), bone, piv);
    cloth(ell(0.047, 0.047, 0.047, ex, ey, 0.02, 8), bone, piv);                                         // elbow
    add(b, segGeo(ex, ey, 0.02, hx, hy2 + 0.05, -0.04, 0.042, 0.033), skin, bone, piv);                    // forearm
    add(b, ell(0.034, 0.05, 0.044, hx, hy2, -0.045, 8), skin, bone, piv);                                  // hand
  }
  if (o === 'guard') {
    const spear = new THREE.CylinderGeometry(0.018, 0.018, 2.1, 5); spear.translate(0.25, 1.0, -0.12); add(b, spear, [0.42, 0.3, 0.2], 9, V(0.235, sh, 0), 'bark_oak');
    const tip = new THREE.ConeGeometry(0.04, 0.22, 4); tip.translate(0.25, 2.15, -0.12); add(b, tip, [0.7, 0.7, 0.72], 9, V(0.235, sh, 0));
  }
  if (o === 'smith') { const hm = new THREE.BoxGeometry(0.08, 0.08, 0.16); hm.translate(0.24, sh - 0.66, -0.06); add(b, hm, [0.25, 0.25, 0.27], 9, V(0.235, sh, 0)); }
  // legs: left = 2, right = 4
  for (const [side, bone] of [[-1, 2], [1, 4]] as const) {
    const x = side * 0.095;
    const piv = V(x, hip, 0), ky = 0.49 * s;
    if (!dress) {
      add(b, segGeo(x, hip, 0, x * 1.05, ky, -0.01, 0.076, 0.057), pants, bone, piv, 'fabric');            // thigh
      add(b, ell(0.057, 0.057, 0.057, x * 1.05, ky, -0.01, 8), pants, bone, piv, 'fabric');                  // knee
      add(b, segGeo(x * 1.05, ky, -0.01, x * 1.05, 0.1 * s, 0.01, 0.054, 0.042), pants, bone, piv, 'fabric'); // shin
    } else add(b, segGeo(x, hip - 0.1, 0, x * 1.05, 0.1 * s, 0.01, 0.05, 0.04), skin, bone, piv);
    add(b, segGeo(x * 1.05, 0.26 * s, 0, x * 1.05, 0.06 * s, 0.01, 0.058, 0.053), boots, bone, piv, 'planks');
    add(b, ell(0.055, 0.05, 0.1, x, 0.05, -0.03, 8), boots, bone, V(x, hip, 0), 'planks');
  }
}

class OutfitLayer {
  readonly mesh: THREE.Mesh;
  readonly shadow: THREE.ShaderMaterial;
  private geo = new THREE.InstancedBufferGeometry();
  private a: THREE.InstancedBufferAttribute; private b: THREE.InstancedBufferAttribute; private c: THREE.InstancedBufferAttribute;
  constructor(o: Outfit, max = 48) {
    const gb = new GeoBuilder(); person(gb, o);
    const base = gb.build();
    for (const [n, at] of Object.entries(base.attributes)) this.geo.setAttribute(n, at);
    this.geo.setIndex(base.index);
    const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.a = mk(); this.b = mk(); this.c = mk();
    this.geo.setAttribute('aInst', this.a); this.geo.setAttribute('aInst2', this.b); this.geo.setAttribute('aAnim', this.c);
    this.mesh = new THREE.Mesh(this.geo, propMaterial({ animal: true }));
    this.shadow = propMaterial({ animal: true }, true);
    this.mesh.frustumCulled = false;
  }
  write(list: NPC[]) {
    const A = this.a.array as Float32Array, B = this.b.array as Float32Array, C = this.c.array as Float32Array;
    const n = Math.min(list.length, A.length / 4);
    for (let i = 0; i < n; i++) {
      const p = list[i], o = i * 4;
      A[o] = p.pos.x; A[o + 1] = p.pos.y; A[o + 2] = p.pos.z; A[o + 3] = p.yaw;
      B[o] = p.scale; B[o + 1] = p.tint; B[o + 2] = 0; B[o + 3] = p.flash;
      C[o] = p.phase; C[o + 1] = Math.min(1.2, p.speed / 1.4); C[o + 2] = 0; C[o + 3] = p.gesture;
    }
    this.a.needsUpdate = this.b.needsUpdate = this.c.needsUpdate = true;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
  }
}

// ------------------------------------------------------------------ people
export interface Memory { t: number; what: string; delta: number; }
export interface NPC {
  id: string; village: string; name: string; job: Job; outfit: Outfit; female: boolean;
  home: BuildingInfo; work: BuildingInfo | null; bed: Spot;
  traits: Trait[]; likes: string[]; dislikes: string[]; family: string[];
  pos: THREE.Vector3; yaw: number; speed: number; phase: number; scale: number; tint: number; flash: number; gesture: number;
  path: Spot[]; goalKey: string; activity: string; hidden: boolean; wait: number;
  bubble: { text: string; t: number } | null; talking: boolean; fleeT: number; attackCd: number;
  // persistent
  rep: number; memory: Memory[]; request: { item: string; n: number; reward: number } | null;
}
export interface VillageState { site: VillageSite; layout: Layout; npcs: NPC[]; grid: Uint8Array; gx0: number; gz0: number; gw: number; doors: Piece[]; }
export interface NPCSave { rep: number; memory: Memory[]; request: NPC['request']; }

const GRID_R = 52;
const CELL = 0.5;

export class Villagers {
  readonly group = new THREE.Group();
  villages = new Map<string, VillageState>();
  saved: Record<string, NPCSave> = {};
  private layers = new Map<Outfit, OutfitLayer>();
  private timer = 0;
  private bubbleLayer: HTMLDivElement;
  private bubbles = new Map<NPC, HTMLDivElement>();
  onEnterVillage: ((v: VillageState) => void) | null = null;
  current: VillageState | null = null;

  constructor(ui: HTMLElement, private world: World, private gen: TerrainGen, private building: Building, shadows: ShadowSystem, private creatures: Creatures) {
    for (const o of OUTFITS) { const l = new OutfitLayer(o); this.layers.set(o, l); this.group.add(l.mesh); shadows.add(l.mesh, l.shadow); }
    this.bubbleLayer = document.createElement('div');
    this.bubbleLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    ui.appendChild(this.bubbleLayer);
  }

  // ---------------------------------------------------------------- loading
  private nearbySites(p: THREE.Vector3): VillageSite[] {
    const out: VillageSite[] = [];
    const cx = Math.floor(p.x / VILLAGE_CELL), cz = Math.floor(p.z / VILLAGE_CELL);
    const seen = new Set<string>();
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const s = this.gen.village((cx + i + 0.5) * VILLAGE_CELL, (cz + j + 0.5) * VILLAGE_CELL) ?? null;
      if (s && !seen.has(s.id)) { seen.add(s.id); out.push(s); }
    }
    const s0 = siteForCell(0, 0, this.gen.seed, () => ({ height: 0, ok: false }));
    if (s0 && !seen.has(s0.id)) out.push(s0);
    const cit = this.gen.citadel();
    if (!seen.has(cit.id)) out.push(cit);
    return out;
  }

  /** NPCs taken from the world by the Herald's errands */
  gone = new Set<string>();

  private load(site: VillageSite) {
    const layout = buildLayout(site);
    this.building.setGenerated(site.id, layout.pieces);
    const v: VillageState = { site, layout, npcs: [], grid: new Uint8Array(0), gx0: 0, gz0: 0, gw: 0, doors: layout.pieces.filter((p) => p.id === 'door_wall') };
    this.buildGrid(v);
    v.npcs = this.people(v);
    this.villages.set(site.id, v);
  }

  private unload(id: string) {
    const v = this.villages.get(id);
    if (!v) return;
    for (const n of v.npcs) this.saved[n.id] = { rep: n.rep, memory: n.memory, request: n.request };
    this.building.setGenerated(id, null);
    this.villages.delete(id);
  }

  private buildGrid(v: VillageState) {
    const W = Math.round((GRID_R * 2) / CELL);
    v.gw = W; v.gx0 = Math.floor(v.site.x) - GRID_R; v.gz0 = Math.floor(v.site.z) - GRID_R;
    v.grid = new Uint8Array(W * W);
    const m = 0.2;
    for (const p of v.layout.pieces) {
      if (p.id === 'crops' || p.id === 'carpet' || p.id === 'floor' || p.id === 'stone_floor' || p.id.includes('roof') || p.id === 'gable' || p.id === 'wall_torch' || p.id === 'painting') continue;
      for (const b of this.building.boxes({ ...p, open: true })) {
        if (b.max.y - b.min.y < 0.3 || b.min.y > p.y + 1.5) continue;
        const gx0 = Math.max(0, Math.floor((b.min.x - m - v.gx0) / CELL)), gx1 = Math.min(W - 1, Math.floor((b.max.x + m - v.gx0) / CELL));
        const gz0 = Math.max(0, Math.floor((b.min.z - m - v.gz0) / CELL)), gz1 = Math.min(W - 1, Math.floor((b.max.z + m - v.gz0) / CELL));
        for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
          const cx = v.gx0 + (gx + 0.5) * CELL, cz = v.gz0 + (gz + 0.5) * CELL;
          if (cx > b.min.x - m && cx < b.max.x + m && cz > b.min.z - m && cz < b.max.z + m) v.grid[gx + gz * W] = 1;
        }
      }
    }
  }

  /** grid cell of a world point, moved to the nearest walkable cell */
  private cellOf(v: VillageState, x: number, z: number): number {
    const W = v.gw;
    const gx = Math.floor((x - v.gx0) / CELL), gz = Math.floor((z - v.gz0) / CELL);
    if (gx < 0 || gz < 0 || gx >= W || gz >= W) return -1;
    if (!v.grid[gx + gz * W]) return gx + gz * W;
    for (let r = 1; r <= 6; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const nx = gx + dx, nz = gz + dz;
      if (nx >= 0 && nz >= 0 && nx < W && nz < W && !v.grid[nx + nz * W]) return nx + nz * W;
    }
    return gx + gz * W;
  }

  private people(v: VillageState): NPC[] {
    const r = mulberry32(v.site.seed ^ 0x5151);
    const out: NPC[] = [];
    const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
    const homes = v.layout.buildings.filter((b) => b.kind === 'house' && b.beds.length);
    const jobs: { job: Job; at: BuildingInfo | null }[] = v.layout.buildings.filter((b) => b.job && b.kind !== 'house').map((b) => ({ job: b.job!, at: b }));
    const guards = 2 + Math.floor(r() * 2);
    for (let i = 0; i < guards; i++) jobs.push({ job: 'guard', at: null });
    jobs.push({ job: 'hunter', at: null }, { job: 'beggar', at: null });
    let n = 0;
    const make = (job: Job, home: BuildingInfo, bed: Spot, surname: string, work: BuildingInfo | null, childOf?: NPC): NPC => {
      const female = job === 'priest' ? r() < 0.3 : r() < 0.5;
      const child = job === 'child';
      const outfit: Outfit = child ? 'child' : job === 'guard' ? 'guard' : job === 'blacksmith' ? 'smith' : job === 'priest' ? 'priest' : (job === 'merchant' || job === 'innkeeper' || job === 'alchemist') && r() < 0.6 ? 'merchant' : female ? 'woman' : 'man';
      const first = pick(female ? NAMES_F : NAMES_M);
      const traits = [pick(TRAITS)]; if (r() < 0.6) { const t2 = pick(TRAITS); if (t2 !== traits[0]) traits.push(t2); }
      const likes = [pick(GIFTABLE), pick(GIFTABLE)].filter((x) => !DISLIKED_BY_ALL.includes(x));
      const dislikes = [pick(GIFTABLE)].filter((x) => !likes.includes(x));
      const id = `${v.site.id}#${n++}`;
      const s = this.saved[id];
      const p: NPC = {
        id, village: v.site.id, name: `${first} ${surname}`, job, outfit, female, home, work, bed, traits, likes, dislikes, family: childOf ? [childOf.id] : [],
        pos: V(bed.x, bed.y, bed.z), yaw: r() * 6.28, speed: 0, phase: r() * 6, scale: child ? 1 : 0.95 + r() * 0.1, tint: r() * 0.95, flash: 0, gesture: 0,
        path: [], goalKey: '', activity: 'idle', hidden: false, wait: r() * 3, bubble: null, talking: false, fleeT: 0, attackCd: 0,
        rep: s?.rep ?? 0, memory: s?.memory ?? [], request: s?.request ?? null
      };
      if (childOf) childOf.family.push(id);
      return p;
    };
    let hi = 0;
    for (const j of jobs) {
      const home = j.job === 'innkeeper' || j.job === 'priest' ? j.at! : homes[hi++ % Math.max(1, homes.length)] ?? v.layout.buildings[0];
      const bed = home.beds[0] ?? home.inside;
      const p = make(j.job, home, bed, pick(SURNAMES), j.at);
      if (j.at?.npc) {
        p.name = j.at.npc;
        if (j.at.female !== undefined) { p.female = j.at.female; if (p.outfit === 'man' || p.outfit === 'woman') p.outfit = p.female ? 'woman' : 'man'; }
      }
      out.push(p);
    }
    // remaining houses: families of villagers and farmers, sometimes a child
    for (; hi < homes.length; hi++) {
      const home = homes[hi], surname = pick(SURNAMES);
      const adult = make(r() < 0.5 ? 'farmer' : 'villager', home, home.beds[0], surname, v.layout.buildings.find((b) => b.kind === 'farm') ?? null);
      out.push(adult);
      if (home.beds[1] || r() < 0.4) out.push(make('child', home, home.beds[1] ?? home.inside, surname, null, adult));
    }
    // everyone starts outside their door
    for (const p of out) p.pos.set(p.home.door.x + (r() - 0.5), p.home.door.y, p.home.door.z + (r() - 0.5));
    return out;
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number, player: THREE.Vector3, hours: number, camera: THREE.PerspectiveCamera) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1;
      const sites = this.nearbySites(player);
      for (const s of sites) if (!this.villages.has(s.id) && Math.hypot(s.x - player.x, s.z - player.z) < 170 && this.world.isLoaded(s.x, s.z)) this.load(s);
      for (const [id, v] of this.villages) if (Math.hypot(v.site.x - player.x, v.site.z - player.z) > 230) this.unload(id);
      // entering a village
      let inside: VillageState | null = null;
      for (const v of this.villages.values()) if (Math.hypot(v.site.x - player.x, v.site.z - player.z) < 40) inside = v;
      if (inside && inside !== this.current) this.onEnterVillage?.(inside);
      this.current = inside;
    }
    const threats = this.creatures.alive.filter((c) => c.state !== 'hidden');
    const all: NPC[] = [];
    for (const v of this.villages.values()) for (const p of v.npcs) { this.think(v, p, dt, hours, threats, player); if (this.gone.has(p.name)) p.hidden = true; all.push(p); }
    for (const [o, l] of this.layers) l.write(all.filter((p) => p.outfit === o && !p.hidden && p.pos.distanceToSquared(player) < 120 * 120));
    this.updateBubbles(all, player, camera, dt);
  }

  private schedule(p: NPC, h: number): { act: string; to: Spot } {
    const home = p.home.inside, square = this.villages.get(p.village)!.layout.square;
    const social = p.traits.includes('sociable') || p.traits.includes('gossipy');
    const tavern = this.villages.get(p.village)!.layout.buildings.find((b) => b.kind === 'tavern');
    const chapel = this.villages.get(p.village)!.layout.buildings.find((b) => b.kind === 'chapel');
    if (p.job === 'guard') return { act: 'patrol', to: square };
    if (h >= 22 || h < 6) return { act: 'sleep', to: p.bed };
    if (h < 7) return { act: 'home', to: home };
    if (h >= 12 && h < 13) return tavern && social ? { act: 'eat', to: tavern.inside } : { act: 'eat', to: home };
    if (h >= 18) {
      if (social && tavern) return { act: 'tavern', to: tavern.inside };
      if (p.traits.includes('pious') && chapel) return { act: 'chapel', to: chapel.inside };
      return { act: 'home', to: home };
    }
    if (p.job === 'child' || p.job === 'beggar') return { act: 'play', to: square };
    if (p.job === 'hunter') return { act: 'hunt', to: { x: square.x + 30, y: square.y, z: square.z } };
    if (p.work) return { act: 'work', to: p.work.inside };
    return { act: 'wander', to: square };
  }

  private think(v: VillageState, p: NPC, dt: number, hours: number, threats: import('./creatures').Creature[], player: THREE.Vector3) {
    p.flash = Math.max(0, p.flash - dt * 3);
    p.gesture = Math.max(0, p.gesture - dt * 2);
    p.attackCd -= dt;
    if (p.talking) { p.speed = 0; p.hidden = false; const d = Math.atan2(-(player.x - p.pos.x), -(player.z - p.pos.z)) - p.yaw; p.yaw += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * 6); p.phase += dt * 2; return; }
    // monsters: flee home, guards fight
    let threat: import('./creatures').Creature | null = null, td = 16;
    for (const c of threats) { const d = c.pos.distanceTo(p.pos); if (d < td) { td = d; threat = c; } }
    let goal: Spot; let act: string;
    if (threat && p.job === 'guard') {
      goal = threat.pos; act = 'fight';
      if (td < 2.2 && p.attackCd <= 0) { p.attackCd = 1.3; p.gesture = 1; this.creatures.damage(threat, 9, 'pierce', p.pos, false); }
    } else if (threat || p.fleeT > 0) {
      if (threat) p.fleeT = 8;
      p.fleeT -= dt;
      goal = p.home.inside; act = 'flee';
      if (threat && !p.bubble && Math.random() < 0.01) p.bubble = { text: ['Monsters!', 'Run!', 'Help!', 'Guards!'][Math.floor(Math.random() * 4)], t: 2.5 };
    } else ({ act, to: goal } = this.schedule(p, hours));
    // wander / patrol / play: small random targets around the goal
    if ((act === 'patrol' || act === 'play' || act === 'wander' || act === 'work' || act === 'hunt') && p.path.length === 0) {
      p.wait -= dt;
      if (p.wait > 0) { p.speed *= 0.9; p.phase += dt * 1.5; this.settle(v, p); return; }
      p.wait = 3 + Math.random() * 7;
      const r = act === 'patrol' ? 26 : act === 'work' ? 2.5 : act === 'hunt' ? 15 : 7;
      goal = { x: goal.x + (Math.random() - 0.5) * r * 2, y: goal.y, z: goal.z + (Math.random() - 0.5) * r * 2 };
      p.goalKey = '';
    }
    const key = `${act}:${Math.round(goal.x)},${Math.round(goal.z)}`;
    if (key !== p.goalKey && (act !== p.activity || p.path.length === 0 || act === 'fight')) {
      p.goalKey = key; p.activity = act;
      p.path = this.findPath(v, p.pos, goal);
    }
    p.hidden = act === 'sleep' && p.path.length === 0 && p.pos.distanceTo(V(p.bed.x, p.bed.y, p.bed.z)) < 2.2;
    // follow the path
    const run = act === 'flee' || act === 'fight';
    let want = 0;
    if (p.path.length) {
      const t = p.path[0];
      const dx = t.x - p.pos.x, dz = t.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.35) p.path.shift();
      else {
        want = run ? 3.6 : p.job === 'child' ? 1.6 : 1.25;
        const target = Math.atan2(-dx, -dz);
        const dy = Math.atan2(Math.sin(target - p.yaw), Math.cos(target - p.yaw));
        p.yaw += dy * Math.min(1, dt * 8);
      }
    }
    p.speed += (want - p.speed) * Math.min(1, dt * 5);
    if (p.speed > 0.05) { p.pos.x -= Math.sin(p.yaw) * p.speed * dt; p.pos.z -= Math.cos(p.yaw) * p.speed * dt; }
    p.phase += dt * (1.5 + p.speed * 3.4);
    this.settle(v, p);
    // open doors on the way
    for (const d of v.doors) {
      const near = (d.x - p.pos.x) ** 2 + (d.z - p.pos.z) ** 2 < 2.0;
      if (near && !d.open) { d.open = true; (d as Piece & { closeT?: number }).closeT = 3; this.building.markDirty(); }
    }
  }

  /** stand on floors indoors, on the ground outdoors */
  private settle(_v: VillageState, p: NPC) {
    let y = this.world.groundNear(p.pos.x, p.pos.z, p.pos.y);
    for (const b of this.building.boxesNear(p.pos, 1.5, [])) {
      if (p.pos.x > b.min.x && p.pos.x < b.max.x && p.pos.z > b.min.z && p.pos.z < b.max.z && b.max.y > y - 0.1 && b.max.y < p.pos.y + 0.6 && b.max.y - b.min.y < 0.4) y = b.max.y;
    }
    p.pos.y += (y - p.pos.y) * 0.5;
  }

  /** Close doors again after people pass. */
  tickDoors(dt: number) {
    for (const v of this.villages.values()) for (const d of v.doors as (Piece & { closeT?: number })[]) {
      if (d.closeT === undefined) continue;
      d.closeT -= dt;
      if (d.closeT <= 0) { d.open = false; d.closeT = undefined; this.building.markDirty(); }
    }
  }

  // ---------------------------------------------------------------- A*
  private pathCache = new Map<string, Spot[]>();
  private findPath(v: VillageState, from: THREE.Vector3, to: Spot): Spot[] {
    const W = v.gw;
    const start = this.cellOf(v, from.x, from.z), goal = this.cellOf(v, to.x, to.z);
    if (start < 0 || goal < 0) return [{ x: to.x, y: to.y, z: to.z }];
    const key = `${v.site.id}:${start}>${goal}`;
    const hit = this.pathCache.get(key);
    if (hit) return hit.map((s) => ({ ...s }));
    const tx = goal % W, tz = Math.floor(goal / W);
    const N = W * W, g = new Float32Array(N).fill(1e9), f = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open: number[] = [start];
    const h = (i: number) => Math.hypot((i % W) - tx, Math.floor(i / W) - tz);
    g[start] = 0; f[start] = h(start);
    let found = false, iter = 0;
    while (open.length && iter++ < 14000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
      const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (cur === goal) { found = true; break; }
      closed[cur] = 1;
      const cx = cur % W, cz = Math.floor(cur / W);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= W) continue;
        const ni = nx + nz * W;
        if (closed[ni] || v.grid[ni]) continue;
        if (dx && dz && (v.grid[cx + dx + cz * W] || v.grid[cx + (cz + dz) * W])) continue;
        const ng = g[cur] + (dx && dz ? 1.414 : 1);
        if (ng < g[ni]) { g[ni] = ng; f[ni] = ng + h(ni); if (came[ni] === -1 && ni !== start) open.push(ni); came[ni] = cur; }
      }
    }
    let path: Spot[];
    if (!found) path = [];
    else {
      path = [];
      for (let i = goal; i !== start && i >= 0; i = came[i]) path.unshift({ x: v.gx0 + ((i % W) + 0.5) * CELL, y: to.y, z: v.gz0 + (Math.floor(i / W) + 0.5) * CELL });
      path = path.filter((_, i) => i % 3 === 2 || i === path.length - 1);
    }
    if (this.pathCache.size > 400) this.pathCache.clear();
    this.pathCache.set(key, path);
    return path.map((s) => ({ ...s }));
  }

  // ---------------------------------------------------------------- chatter
  private updateBubbles(all: NPC[], player: THREE.Vector3, camera: THREE.PerspectiveCamera, dt: number) {
    for (const p of all) {
      if (p.bubble) { p.bubble.t -= dt; if (p.bubble.t <= 0) p.bubble = null; continue; }
      if (p.talking || p.hidden || p.speed > 0.3 || p.pos.distanceToSquared(player) > 30 * 30) continue;
      if (Math.random() < dt * 0.04) {
        const other = all.find((o) => o !== p && !o.hidden && o.pos.distanceToSquared(p.pos) < 6);
        if (other) { p.bubble = { text: CHATTER[Math.floor(Math.random() * CHATTER.length)], t: 3.5 }; p.gesture = 0.6; }
      }
    }
    const v = new THREE.Vector3();
    for (const [p, el] of this.bubbles) if (!p.bubble) { el.remove(); this.bubbles.delete(p); }
    for (const p of all) {
      if (!p.bubble) continue;
      let el = this.bubbles.get(p);
      if (!el) { el = document.createElement('div'); el.className = 'bubble'; this.bubbleLayer.appendChild(el); this.bubbles.set(p, el); }
      el.textContent = p.bubble.text;
      v.set(p.pos.x, p.pos.y + 2.1 * p.scale, p.pos.z).project(camera);
      el.style.display = v.z < 1 && p.pos.distanceToSquared(player) < 30 * 30 ? 'block' : 'none';
      el.style.transform = `translate(-50%, -100%) translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px)`;
    }
  }

  /** Villager the player can talk to (in front, within reach). */
  talkable(pos: THREE.Vector3, yaw: number): NPC | null {
    const fx = pos.x - Math.sin(yaw) * 1.0, fz = pos.z - Math.cos(yaw) * 1.0;
    let best: NPC | null = null, bd = 2.2 * 2.2;
    for (const v of this.villages.values()) for (const p of v.npcs) {
      if (p.hidden) continue;
      const d = (p.pos.x - fx) ** 2 + (p.pos.z - fz) ** 2;
      if (d < bd && Math.abs(p.pos.y - pos.y) < 1.5) { bd = d; best = p; }
    }
    return best;
  }

  all(): NPC[] { const out: NPC[] = []; for (const v of this.villages.values()) out.push(...v.npcs); return out; }
  villageOf(p: NPC) { return this.villages.get(p.village)!; }
  villageRep(id: string): number {
    const v = this.villages.get(id);
    if (!v || !v.npcs.length) return 0;
    return v.npcs.reduce((s, n) => s + n.rep, 0) / v.npcs.length;
  }

  remember(p: NPC, what: string, delta: number, spread = 0.3) {
    p.rep = Math.max(-100, Math.min(100, p.rep + delta));
    p.memory.push({ t: Date.now(), what, delta });
    if (p.memory.length > 12) p.memory.shift();
    // word travels: family and the village feel some of it
    for (const o of this.villageOf(p).npcs) if (o !== p) o.rep = Math.max(-100, Math.min(100, o.rep + delta * (p.family.includes(o.id) ? 0.6 : spread * 0.3)));
  }

  serialize(): Record<string, NPCSave> {
    for (const v of this.villages.values()) for (const n of v.npcs) this.saved[n.id] = { rep: n.rep, memory: n.memory, request: n.request };
    return this.saved;
  }
}
