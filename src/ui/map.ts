// The world map: a fog-of-war parchment that reveals as you explore, with markers
// (you, home, villages, the citadel, quest targets, waystones, your own pins).
// Drag to pan, pinch / wheel to zoom, tap to place or remove a pin. Opened from a
// waystone it becomes the fast-travel map.
import { BIOMES } from '../world/biomes';
import { SEA_LEVEL } from '../world/constants';
import type { TerrainGen } from '../world/terrain';

export const MAP_CELL = 16;
export interface MapMarker { x: number; z: number; kind: 'player' | 'home' | 'village' | 'citadel' | 'quest' | 'waystone' | 'pin' | 'pack' | 'landmark'; label?: string; yaw?: number; id?: string; }
export interface MapSave { explored: number[]; pins: [number, number][]; waystones: string[]; places: string[]; }

const key = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);

export class WorldMap {
  explored = new Set<number>();
  pins: [number, number][] = [];
  /** discovered waystones by id */
  waystones = new Set<string>();
  /** discovered named places (village ids, 'citadel', …) */
  places = new Set<string>();
  private colors = new Map<number, string>();
  private view: { x: number; z: number; scale: number } | null = null;

  constructor(private gen: TerrainGen) {}

  load(d: MapSave | undefined) {
    if (!d) return;
    this.explored = new Set(d.explored); this.pins = d.pins; this.waystones = new Set(d.waystones); this.places = new Set(d.places ?? []);
  }
  serialize(): MapSave { return { explored: [...this.explored], pins: this.pins, waystones: [...this.waystones], places: [...this.places] }; }

  /** Reveal cells around a point (call about once a second). */
  reveal(x: number, z: number, r: number) {
    const c0x = Math.floor((x - r) / MAP_CELL), c1x = Math.floor((x + r) / MAP_CELL);
    const c0z = Math.floor((z - r) / MAP_CELL), c1z = Math.floor((z + r) / MAP_CELL);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const mx = (cx + 0.5) * MAP_CELL - x, mz = (cz + 0.5) * MAP_CELL - z;
      if (mx * mx + mz * mz <= r * r) this.explored.add(key(cx, cz));
    }
  }

  private color(cx: number, cz: number): string {
    const k = key(cx, cz);
    let c = this.colors.get(k);
    if (c) return c;
    const col = this.gen.column((cx + 0.5) * MAP_CELL, (cz + 0.5) * MAP_CELL);
    let r: number, g: number, b: number;
    if (col.height < SEA_LEVEL - 0.5 && col.liquidLevel >= SEA_LEVEL - 1) {
      const d = Math.min(1, (SEA_LEVEL - col.height) / 20);
      r = 40 - d * 20; g = 70 - d * 30; b = 92 - d * 30;
    } else {
      const def = BIOMES[col.biome];
      const t = def.grassTint;
      const forest = Math.min(1, def.treeDensity * 2.5);
      const lift = Math.max(0.6, Math.min(1.35, 0.75 + (col.height - SEA_LEVEL) / 90));
      r = (t[0] * 170 * (1 - forest * 0.35) + 30) * lift; g = (t[1] * 160 * (1 - forest * 0.3) + 28) * lift; b = (t[2] * 120 * (1 - forest * 0.3) + 20) * lift;
      if (col.village > 0.5) { r = 150; g = 128; b = 96; }
    }
    // parchment wash
    r = r * 0.75 + 52; g = g * 0.75 + 44; b = b * 0.75 + 30;
    c = `rgb(${r | 0},${g | 0},${b | 0})`;
    this.colors.set(k, c);
    return c;
  }

  /**
   * Render the interactive map into `host`.
   * travel: when set, tapping a discovered waystone calls it.
   */
  render(host: HTMLElement, markers: () => MapMarker[], opts: { travel?: (id: string, label: string) => void; onPins?: () => void } = {}) {
    host.innerHTML = '';
    const wrap = document.createElement('div'); wrap.className = 'map-wrap';
    const cv = document.createElement('canvas'); cv.className = 'map-canvas';
    const legend = document.createElement('div'); legend.className = 'map-legend';
    legend.innerHTML = opts.travel ? '<b>Waystone travel</b> — tap a discovered waystone ◆ to travel (10 gold).' : 'Drag to move · pinch to zoom · tap to place or remove a pin';
    const center = document.createElement('button'); center.className = 'btn map-center'; center.textContent = '◎';
    wrap.append(cv, center);
    host.append(legend, wrap);
    const ms = markers();
    const me = ms.find((m) => m.kind === 'player')!;
    if (!this.view) this.view = { x: me.x, z: me.z, scale: 0.9 };
    const v = this.view;
    if (opts.travel) { v.x = me.x; v.z = me.z; v.scale = Math.min(v.scale, 0.35); }
    center.onclick = () => { v.x = me.x; v.z = me.z; draw(); };
    const ctx = cv.getContext('2d')!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    let W = 0, H = 0;
    const resize = () => { W = wrap.clientWidth; H = wrap.clientHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; };

    const toScreen = (x: number, z: number) => [(x - v.x) * v.scale + W / 2, (z - v.z) * v.scale + H / 2];
    const toWorld = (sx: number, sy: number) => [(sx - W / 2) / v.scale + v.x, (sy - H / 2) / v.scale + v.z];

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#1c150e'; ctx.fillRect(0, 0, W, H);
      const [x0, z0] = toWorld(0, 0), [x1, z1] = toWorld(W, H);
      const c0x = Math.floor(x0 / MAP_CELL), c1x = Math.floor(x1 / MAP_CELL), c0z = Math.floor(z0 / MAP_CELL), c1z = Math.floor(z1 / MAP_CELL);
      const step = Math.max(1, Math.floor(3 / (MAP_CELL * v.scale)));
      const px = MAP_CELL * v.scale * step + 0.6;
      let budget = 9000;
      for (let cz = c0z - (c0z % step); cz <= c1z && budget > 0; cz += step) for (let cx = c0x - (c0x % step); cx <= c1x && budget > 0; cx += step) {
        if (!this.explored.has(key(cx, cz))) continue;
        budget--;
        const [sx, sy] = toScreen(cx * MAP_CELL, cz * MAP_CELL);
        ctx.fillStyle = this.color(cx, cz);
        ctx.fillRect(sx, sy, px, px);
      }
      // grid
      ctx.strokeStyle = 'rgba(40,28,16,.25)'; ctx.lineWidth = 1;
      const g = v.scale > 0.4 ? 128 : 512;
      for (let x = Math.ceil(x0 / g) * g; x < x1; x += g) { const [sx] = toScreen(x, 0); ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke(); }
      for (let z = Math.ceil(z0 / g) * g; z < z1; z += g) { const [, sy] = toScreen(0, z); ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke(); }
      // markers
      ctx.textAlign = 'center'; ctx.font = '12px "Courier New", monospace';
      for (const m of markers()) {
        const [sx, sy] = toScreen(m.x, m.z);
        if (sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) continue;
        ctx.save(); ctx.translate(sx, sy);
        switch (m.kind) {
          case 'player':
            ctx.rotate(-(m.yaw ?? 0));
            ctx.fillStyle = '#fff2c0'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.stroke(); ctx.fill();
            break;
          case 'home': ctx.fillStyle = '#e0b060'; ctx.fillRect(-5, -2, 10, 8); ctx.beginPath(); ctx.moveTo(-7, -2); ctx.lineTo(0, -8); ctx.lineTo(7, -2); ctx.fill(); break;
          case 'village': case 'citadel': case 'landmark':
            ctx.fillStyle = m.kind === 'citadel' ? '#f0ece0' : m.kind === 'landmark' ? '#c8a878' : '#d8c090'; ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, m.kind === 'citadel' ? 8 : 5, 0, Math.PI * 2); ctx.stroke(); ctx.fill();
            break;
          case 'quest': ctx.fillStyle = '#ffd040'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.font = 'bold 20px serif'; ctx.strokeText('!', 0, 7); ctx.fillText('!', 0, 7); break;
          case 'waystone': ctx.fillStyle = '#80c0ff'; ctx.strokeStyle = '#08203a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 0); ctx.lineTo(0, 8); ctx.lineTo(-6, 0); ctx.closePath(); ctx.stroke(); ctx.fill(); break;
          case 'pin': ctx.fillStyle = '#e05040'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -8, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, 4); ctx.stroke(); break;
          case 'pack': ctx.fillStyle = '#ffe080'; ctx.fillRect(-4, -4, 8, 8); break;
        }
        ctx.restore();
        if (m.label && (v.scale > 0.25 || m.kind === 'citadel' || m.kind === 'waystone')) {
          ctx.fillStyle = '#f0e0c0'; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3; ctx.font = '12px "Courier New", monospace';
          ctx.strokeText(m.label, sx, sy - 13); ctx.fillText(m.label, sx, sy - 13);
        }
      }
      // scale bar
      const metres = v.scale > 0.6 ? 100 : v.scale > 0.15 ? 500 : 2000;
      ctx.fillStyle = '#e8d8b0'; ctx.fillRect(14, H - 18, metres * v.scale, 3);
      ctx.fillText(`${metres} m`, 14 + metres * v.scale / 2, H - 24);
    };

    // ---- touch: drag / pinch / tap
    const pts = new Map<number, { x: number; y: number; sx: number; sy: number }>();
    let pinch0 = 0, scale0 = 1, moved = 0;
    cv.addEventListener('pointerdown', (e) => { try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic */ } pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY, sx: e.offsetX, sy: e.offsetY }); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); scale0 = v.scale; } });
    cv.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
      p.x = e.offsetX; p.y = e.offsetY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 1) { v.x -= dx / v.scale; v.z -= dy / v.scale; }
      else if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); v.scale = Math.max(0.04, Math.min(3, scale0 * d / Math.max(1, pinch0))); }
      draw();
    });
    const up = (e: PointerEvent) => {
      const p = pts.get(e.pointerId); pts.delete(e.pointerId);
      if (!p || moved > 8 || pts.size) return;
      // tap: travel to a waystone, or toggle a pin
      const hit = (m: MapMarker) => { const [sx, sy] = toScreen(m.x, m.z); return Math.hypot(sx - e.offsetX, sy - e.offsetY) < 16; };
      if (opts.travel) { const w = markers().find((m) => m.kind === 'waystone' && hit(m)); if (w) opts.travel(w.id!, w.label ?? 'the waystone'); return; }
      const pi = this.pins.findIndex(([x, z]) => hit({ x, z, kind: 'pin' }));
      if (pi >= 0) this.pins.splice(pi, 1);
      else { const [x, z] = toWorld(e.offsetX, e.offsetY); this.pins.push([Math.round(x), Math.round(z)]); }
      opts.onPins?.();
      draw();
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
    cv.addEventListener('wheel', (e) => { e.preventDefault(); v.scale = Math.max(0.04, Math.min(3, v.scale * (e.deltaY > 0 ? 0.85 : 1.18))); draw(); }, { passive: false });
    requestAnimationFrame(() => { resize(); draw(); });
  }
}
