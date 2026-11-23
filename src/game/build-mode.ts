// Build mode: choose a piece or blueprint, aim, see a ghost preview (green = ok,
// red = blocked / missing materials), place (hold to repeat), rotate, remove with a
// full refund, undo the last 20 actions, and build planned blueprint pieces.
import * as THREE from 'three';
import { BLUEPRINTS, PIECES, PieceCat } from '../data/pieces';
import { ITEMS } from '../data/items';
import type { Building, Piece } from '../world/building';
import type { World } from '../world/world';
import type { Player } from '../entities/player';
import type { Inventory } from './inventory';
import { input } from '../engine/input';

type Cat = PieceCat | 'plans';
const REACH = 9;

function pieceIcon(icon: string): string {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#e8d8b0'; g.fillStyle = 'rgba(200,160,100,0.35)'; g.lineWidth = 3; g.lineJoin = 'round';
  const poly = (pts: number[][], fill = true) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); if (fill) g.fill(); g.stroke(); };
  switch (icon) {
    case 'floor': poly([[8, 40], [32, 28], [56, 40], [32, 52]]); break;
    case 'wall': poly([[10, 14], [54, 14], [54, 54], [10, 54]]); g.beginPath(); for (const y of [27, 40]) { g.moveTo(10, y); g.lineTo(54, y); } g.stroke(); break;
    case 'halfwall': poly([[10, 32], [54, 32], [54, 54], [10, 54]]); break;
    case 'window': poly([[10, 12], [54, 12], [54, 54], [10, 54]]); g.fillStyle = '#1a1410'; g.fillRect(22, 24, 20, 16); g.strokeRect(22, 24, 20, 16); break;
    case 'door': poly([[10, 12], [54, 12], [54, 54], [10, 54]]); g.fillStyle = '#6a4a2a'; g.fillRect(24, 26, 16, 28); g.strokeRect(24, 26, 16, 28); break;
    case 'roof': poly([[6, 50], [32, 14], [58, 50]]); break;
    case 'gable': poly([[8, 54], [56, 54], [56, 14]]); break;
    case 'stairs': poly([[10, 54], [10, 46], [22, 46], [22, 36], [34, 36], [34, 26], [46, 26], [46, 16], [54, 16], [54, 54]]); break;
    case 'pillar': poly([[26, 8], [38, 8], [38, 56], [26, 56]]); break;
    case 'fence': g.beginPath(); for (const x of [12, 32, 52]) { g.moveTo(x, 20); g.lineTo(x, 54); } g.moveTo(8, 30); g.lineTo(56, 30); g.moveTo(8, 44); g.lineTo(56, 44); g.stroke(); break;
    case 'bed': poly([[8, 38], [56, 38], [56, 50], [8, 50]]); g.fillStyle = '#8a1a1a'; g.fillRect(22, 32, 34, 8); g.fillStyle = '#ddd'; g.fillRect(10, 32, 10, 6); break;
    case 'chest': poly([[12, 28], [52, 28], [52, 52], [12, 52]]); g.beginPath(); g.moveTo(12, 34); g.lineTo(52, 34); g.stroke(); g.fillStyle = '#d0a030'; g.fillRect(29, 32, 6, 8); break;
    case 'table': poly([[6, 28], [58, 28], [58, 34], [6, 34]]); g.beginPath(); g.moveTo(12, 34); g.lineTo(12, 54); g.moveTo(52, 34); g.lineTo(52, 54); g.stroke(); break;
    case 'chair': g.beginPath(); g.moveTo(22, 12); g.lineTo(22, 54); g.moveTo(22, 34); g.lineTo(44, 34); g.lineTo(44, 54); g.stroke(); break;
    case 'shelf': poly([[14, 8], [50, 8], [50, 56], [14, 56]], false); g.beginPath(); for (const y of [22, 36, 48]) { g.moveTo(14, y); g.lineTo(50, y); } g.stroke(); break;
    case 'carpet': g.fillStyle = '#8a1a1a'; poly([[6, 40], [32, 30], [58, 40], [32, 52]]); break;
    case 'banner': g.beginPath(); g.moveTo(18, 6); g.lineTo(18, 58); g.stroke(); g.fillStyle = '#a01010'; poly([[20, 12], [46, 12], [46, 44], [33, 36], [20, 44]]); break;
    case 'painting': poly([[10, 16], [54, 16], [54, 48], [10, 48]], false); g.fillStyle = '#4a6aa0'; g.fillRect(14, 20, 36, 14); g.fillStyle = '#4a7a3a'; g.fillRect(14, 34, 36, 10); break;
    case 'rack': g.beginPath(); g.moveTo(14, 54); g.lineTo(14, 14); g.moveTo(50, 54); g.lineTo(50, 14); g.moveTo(10, 22); g.lineTo(54, 22); g.moveTo(10, 46); g.lineTo(54, 46); for (const x of [24, 32, 40]) { g.moveTo(x, 10); g.lineTo(x, 56); } g.stroke(); break;
    case 'pot': poly([[20, 36], [44, 36], [40, 56], [24, 56]]); g.strokeStyle = '#5a9a3a'; g.beginPath(); g.moveTo(32, 36); g.lineTo(22, 14); g.moveTo(32, 36); g.lineTo(44, 16); g.stroke(); break;
    case 'claim': poly([[24, 56], [26, 14], [32, 8], [38, 14], [40, 56]]); g.strokeStyle = '#a080ff'; g.beginPath(); g.moveTo(32, 22); g.lineTo(32, 42); g.moveTo(26, 30); g.lineTo(38, 30); g.stroke(); break;
    case 'fireplace': poly([[8, 56], [8, 24], [56, 24], [56, 56]]); g.fillStyle = '#ff8a20'; g.beginPath(); g.moveTo(22, 54); g.quadraticCurveTo(32, 30, 42, 54); g.fill(); break;
    case 'torch': g.beginPath(); g.moveTo(32, 58); g.lineTo(32, 26); g.stroke(); g.fillStyle = '#ffa030'; g.beginPath(); g.ellipse(32, 18, 7, 11, 0, 0, 7); g.fill(); break;
    case 'lantern': g.beginPath(); g.moveTo(20, 58); g.lineTo(20, 10); g.lineTo(42, 10); g.stroke(); g.fillStyle = '#ffd070'; g.fillRect(36, 16, 12, 16); break;
    default: poly([[10, 10], [54, 10], [54, 54], [10, 54]]);
  }
  return c.toDataURL();
}

export interface BuildHooks { toast(t: string, c?: string): void; onToggle(active: boolean): void; }

export class BuildMode {
  active = false;
  private cat: Cat = 'structure';
  private selected = 'floor';
  private rot = 0;
  private removeMode = false;
  private candidates: Piece[] = [];
  private ok = false;
  private removeTarget: Piece | null = null;
  private root: HTMLDivElement;
  private strip!: HTMLDivElement;
  private placeBtn!: HTMLButtonElement;
  private removeBtn!: HTMLButtonElement;
  private plansBtn!: HTMLButtonElement;
  private holding = false;
  private repeat = 0;
  private lastKey = '';

  constructor(parent: HTMLElement, private building: Building, private world: World, private player: Player, private inv: Inventory, private hooks: BuildHooks) {
    this.root = document.createElement('div');
    this.root.className = 'build-ui';
    this.root.style.display = 'none';
    this.buildDom();
    parent.appendChild(this.root);
    inv.onChange(() => { if (this.active) this.renderStrip(); });
  }

  toggle(on = !this.active) {
    this.active = on;
    this.root.style.display = on ? 'block' : 'none';
    this.building.setPreview([], true);
    this.holding = false;
    if (on) { this.renderStrip(); this.hooks.toast('Build mode — choose a piece, aim, and tap PLACE.', '#c8d8ff'); }
    this.hooks.onToggle(on);
  }

  private btn(label: string, cls: string, down: () => void, up?: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `bbtn ${cls}`; b.textContent = label;
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); b.classList.add('down'); down(); });
    const end = (e: Event) => { e.stopPropagation(); b.classList.remove('down'); up?.(); };
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); b.addEventListener('pointerleave', end);
    return b;
  }

  private buildDom() {
    const bar = document.createElement('div'); bar.className = 'build-bar';
    const tabs = document.createElement('div'); tabs.className = 'build-tabs';
    for (const [c, label] of [['structure', 'Build'], ['furniture', 'Furnish'], ['light', 'Light'], ['plans', 'Plans']] as [Cat, string][]) {
      const t = document.createElement('button'); t.textContent = label; t.dataset.cat = c;
      t.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.cat = c; this.removeMode = false; this.renderStrip(); });
      tabs.appendChild(t);
    }
    this.strip = document.createElement('div'); this.strip.className = 'build-strip';
    this.strip.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.append(tabs, this.strip);
    const side = document.createElement('div'); side.className = 'build-side';
    this.placeBtn = this.btn('Place', 'big', () => { this.holding = true; this.repeat = 0; this.act(); }, () => { this.holding = false; });
    const rotBtn = this.btn('⟳ Rotate', '', () => { this.rot = (this.rot + Math.PI / 2) % (Math.PI * 2); });
    this.removeBtn = this.btn('Remove', '', () => { this.removeMode = !this.removeMode; this.renderStrip(); });
    const undoBtn = this.btn('↶ Undo', '', () => this.undo());
    this.plansBtn = this.btn('Build plans', '', () => this.buildPlans());
    const exitBtn = this.btn('✕ Exit', '', () => this.toggle(false));
    side.append(this.placeBtn, rotBtn, this.removeBtn, undoBtn, this.plansBtn, exitBtn);
    this.root.append(bar, side);
  }

  private cost(id: string): [string, number][] { return PIECES[id]?.cost ?? []; }
  private affordable(cost: [string, number][], n = 1) { return cost.every(([id, k]) => this.inv.count(id) >= k * n); }

  private renderStrip() {
    this.root.querySelectorAll<HTMLButtonElement>('.build-tabs button').forEach((t) => t.classList.toggle('on', t.dataset.cat === this.cat));
    this.removeBtn.classList.toggle('on', this.removeMode);
    this.placeBtn.textContent = this.removeMode ? 'Remove' : 'Place';
    this.strip.innerHTML = '';
    const card = (id: string, name: string, icon: string, cost: [string, number][], desc?: string) => {
      const c = document.createElement('div'); c.className = 'bcard';
      if (id === this.selected && !this.removeMode) c.classList.add('sel');
      const img = document.createElement('img'); img.src = pieceIcon(icon);
      const n = document.createElement('div'); n.className = 'bname'; n.textContent = name;
      const co = document.createElement('div'); co.className = 'bcost';
      co.innerHTML = cost.map(([i, k]) => `<span class="${this.inv.count(i) >= k ? '' : 'miss'}">${k} ${ITEMS[i]?.name ?? i}</span>`).join(' · ') || (desc ?? '');
      c.append(img, n, co);
      c.addEventListener('pointerup', () => { this.selected = id; this.removeMode = false; this.renderStrip(); });
      this.strip.appendChild(c);
    };
    if (this.cat === 'plans') for (const bp of BLUEPRINTS) card(bp.id, bp.name, 'roof', [], bp.desc);
    else for (const d of Object.values(PIECES)) if (d.cat === this.cat && !d.hidden) card(d.id, d.name, d.icon, d.cost);
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number, camera: THREE.PerspectiveCamera) {
    if (!this.active) return;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const eye = this.player.eye.clone();
    const along = Math.max(0, eye.clone().sub(camera.position).dot(dir) - 0.6);
    const origin = camera.position.clone().addScaledVector(dir, along);
    const pieceHit = this.building.raycast(origin, dir, REACH + 2);
    const ground = this.world.raycast(origin, dir, REACH + 2);
    const usePiece = pieceHit && (!ground || pieceHit.dist <= ground.dist + 0.05);
    const hit = usePiece ? { point: pieceHit!.point, normal: pieceHit!.normal } : ground ? { point: ground.point, normal: ground.normal } : null;

    // planned pieces nearby?
    const plannedNear = this.building.pieces.filter((p) => p.planned && (p.x - this.player.pos.x) ** 2 + (p.z - this.player.pos.z) ** 2 < 18 * 18).length;
    this.plansBtn.style.display = plannedNear ? 'block' : 'none';
    this.plansBtn.textContent = `Build plans (${plannedNear})`;

    if (this.removeMode) {
      this.removeTarget = pieceHit && pieceHit.point.distanceTo(eye) < REACH && !pieceHit.piece.gen ? pieceHit.piece : null;
      if (!this.removeTarget) {
        // planned ghosts can be removed too
        const p = hit?.point;
        this.removeTarget = p ? this.building.pieces.find((q) => q.planned && Math.abs(q.x - p.x) < 1 && Math.abs(q.z - p.z) < 1 && Math.abs(q.y - p.y) < 2.5) ?? null : null;
      }
      this.building.setPreview(this.removeTarget ? [{ ...this.removeTarget, planned: false }] : [], false);
    } else if (!hit || hit.point.distanceTo(eye) > REACH) {
      this.candidates = [];
      this.building.setPreview([], true);
    } else if (this.cat === 'plans') {
      const bp = BLUEPRINTS.find((b) => b.id === this.selected) ?? BLUEPRINTS[0];
      this.selected = bp.id;
      // skip pieces that are already built in the same spot
      this.candidates = this.building.blueprint(bp, hit.point, this.rot).filter((c) => !this.building.pieces.some((q) =>
        q.id === c.id && Math.abs(q.x - c.x) < 0.1 && Math.abs(q.z - c.z) < 0.1 && Math.abs(q.y - c.y) < 0.35));
      this.ok = !this.candidates.some((p) => this.building.blocked(p));
      this.building.setPreview(this.candidates, this.ok);
    } else {
      if (!PIECES[this.selected] || PIECES[this.selected].cat !== this.cat || PIECES[this.selected].hidden) this.selected = Object.values(PIECES).find((d) => d.cat === this.cat && !d.hidden)!.id;
      const p = this.building.snap(this.selected, hit.point, hit.normal, !!usePiece, this.rot);
      this.candidates = [p];
      this.ok = !this.building.blocked(p) && this.affordable(this.cost(p.id));
      this.building.setPreview(this.candidates, this.ok);
    }

    if (input.key('KeyR')) this.rot = (this.rot + Math.PI / 2) % (Math.PI * 2);
    if (input.button('attack').pressed) this.act();
    if (this.holding) {
      this.repeat += dt;
      if (this.repeat > 0.35) { this.repeat = 0; this.act(true); }
    }
  }

  private act(repeating = false) {
    if (this.removeMode) { this.removeTargetPiece(); return; }
    if (!this.candidates.length) return;
    const key = this.candidates.map((p) => `${p.id}${p.x}${p.y}${p.z}${p.rot}`).join();
    if (repeating && key === this.lastKey) return;
    if (this.cat === 'plans') {
      if (!this.ok) { this.hooks.toast('Something is in the way.', '#e08070'); return; }
      this.building.add(this.candidates.map((p) => ({ ...p })));
      this.lastKey = key;
      this.hooks.toast('Plan laid out. Gather materials, then tap "Build plans".', '#c8d8ff');
      return;
    }
    const p = this.candidates[0];
    if (this.building.blocked(p)) { if (!repeating) this.hooks.toast('Something is in the way.', '#e08070'); return; }
    const cost = this.cost(p.id);
    if (!this.affordable(cost)) {
      if (!repeating) this.hooks.toast(`Missing: ${cost.filter(([i, k]) => this.inv.count(i) < k).map(([i, k]) => `${k - this.inv.count(i)} ${ITEMS[i].name}`).join(', ')}`, '#e08070');
      return;
    }
    for (const [i, k] of cost) this.inv.remove(i, k);
    this.building.add([{ ...p }]);
    this.lastKey = key;
  }

  private refund(p: Piece) {
    if (p.planned) return;
    for (const [i, k] of this.cost(p.id)) this.inv.add(i, k);
    for (const s of p.items ?? []) if (s) this.inv.add(s.id, s.n);
  }

  private removeTargetPiece() {
    const t = this.removeTarget;
    if (!t) return;
    this.refund(t);
    this.building.remove([t]);
    this.hooks.toast(`${PIECES[t.id].name} removed.`, '#e8d8a8');
  }

  private undo() {
    const a = this.building.undo();
    if (!a) { this.hooks.toast('Nothing to undo.', '#c8b890'); return; }
    if (a.kind === 'add') for (const p of a.pieces) this.refund(p);
    else for (const p of a.pieces) if (!p.planned) for (const [i, k] of this.cost(p.id)) this.inv.remove(i, Math.min(k, this.inv.count(i)));
    this.hooks.toast('Undone.', '#c8b890');
  }

  /** Build every affordable planned piece nearby, bottom-up. */
  buildPlans() {
    const pos = this.player.pos;
    const list = this.building.pieces.filter((p) => p.planned && (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 < 18 * 18)
      .sort((a, b) => a.y - b.y || ((a.x - pos.x) ** 2 + (a.z - pos.z) ** 2) - ((b.x - pos.x) ** 2 + (b.z - pos.z) ** 2));
    let built = 0;
    const missing = new Map<string, number>();
    for (const p of list) {
      const cost = this.cost(p.id);
      if (!this.affordable(cost)) { for (const [i, k] of cost) missing.set(i, (missing.get(i) ?? 0) + Math.max(0, k)); continue; }
      for (const [i, k] of cost) this.inv.remove(i, k);
      this.building.complete(p);
      built++;
    }
    const need = [...missing].map(([i, k]) => `${k} ${ITEMS[i].name}`).join(', ');
    this.hooks.toast(built ? `Built ${built} piece${built > 1 ? 's' : ''}.${need ? ` Still needed: ${need}` : ''}` : `Not enough materials. Needed: ${need}`, built ? '#a8e0a0' : '#e08070');
  }
}
