// The Living Fresco: a painted chapel wall that shows what you did — rendered from
// a log of in-game events as panels of flaking plaster, ochre and soot.
import { SORCERER } from '../data/story';

export type FrescoKind = 'boss' | 'death' | 'quest' | 'obey' | 'defy' | 'trick' | 'dungeon' | 'village' | 'level' | 'wish' | 'rite' | 'secret' | 'ending';
export interface FrescoEvent { day: number; kind: FrescoKind; text: string; }

export class FrescoLog {
  events: FrescoEvent[] = [];
  add(day: number, kind: FrescoKind, text: string) {
    this.events.push({ day, kind, text });
    if (this.events.length > 80) this.events.splice(1, this.events.length - 80); // keep the first (the rite)
  }
  load(e: FrescoEvent[] | undefined) { if (e) this.events = e; }
}

const OCHRE = ['#b8864a', '#a8723a', '#c89a5a', '#8a5a32'], SOOT = '#2a1e16', BLOOD = '#7a2418', TEAL = '#3a6a64', GOLD = '#d8a940', SKY = '#6a8aa0';

function rnd(seed: number) { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

/** a hero silhouette */
function figure(g: CanvasRenderingContext2D, x: number, y: number, h: number, col: string, pose: 'stand' | 'strike' | 'kneel' | 'fall' | 'away' | 'raise' = 'stand') {
  g.save(); g.translate(x, y); g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round';
  const s = h / 100;
  if (pose === 'fall') { g.rotate(-1.3); }
  if (pose === 'kneel') g.translate(0, 18 * s);
  g.beginPath(); g.arc(0, -88 * s, 9 * s, 0, 7); g.fill(); // head
  g.beginPath(); g.moveTo(-12 * s, -76 * s); g.lineTo(12 * s, -76 * s); g.lineTo(16 * s, -30 * s); g.lineTo(-16 * s, -30 * s); g.closePath(); g.fill(); // cloak
  g.lineWidth = 6 * s;
  if (pose === 'kneel') { g.beginPath(); g.moveTo(-6 * s, -30 * s); g.lineTo(-14 * s, -12 * s); g.lineTo(6 * s, -12 * s); g.moveTo(6 * s, -30 * s); g.lineTo(10 * s, 0); g.stroke(); }
  else { g.beginPath(); g.moveTo(-6 * s, -30 * s); g.lineTo(-10 * s, 0); g.moveTo(6 * s, -30 * s); g.lineTo(pose === 'strike' ? 18 * s : 10 * s, 0); g.stroke(); }
  g.lineWidth = 5 * s; g.beginPath();
  if (pose === 'strike') { g.moveTo(10 * s, -70 * s); g.lineTo(34 * s, -84 * s); g.stroke(); g.strokeStyle = '#d8d8d0'; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(34 * s, -84 * s); g.lineTo(60 * s, -112 * s); }
  else if (pose === 'raise') { g.moveTo(10 * s, -70 * s); g.lineTo(18 * s, -110 * s); }
  else if (pose === 'away') { g.moveTo(-10 * s, -70 * s); g.lineTo(-30 * s, -52 * s); }
  else { g.moveTo(10 * s, -70 * s); g.lineTo(16 * s, -40 * s); }
  g.stroke();
  g.restore();
}

function rider(g: CanvasRenderingContext2D, x: number, y: number, h: number) {
  const s = h / 100;
  g.save(); g.translate(x, y); g.fillStyle = SOOT;
  g.beginPath(); g.ellipse(0, -55 * s, 40 * s, 18 * s, 0, 0, 7); g.fill(); // horse body
  g.lineWidth = 6 * s; g.strokeStyle = SOOT;
  for (const lx of [-30, -18, 22, 32]) { g.beginPath(); g.moveTo(lx * s, -45 * s); g.lineTo(lx * s, 0); g.stroke(); }
  g.beginPath(); g.moveTo(-34 * s, -62 * s); g.lineTo(-52 * s, -92 * s); g.lineTo(-62 * s, -86 * s); g.stroke(); // neck/head
  g.beginPath(); g.moveTo(-6 * s, -70 * s); g.lineTo(-2 * s, -128 * s); g.lineTo(8 * s, -128 * s); g.lineTo(12 * s, -70 * s); g.fill(); // rider
  g.beginPath(); g.ellipse(3 * s, -138 * s, 7 * s, 11 * s, 0, 0, 7); g.fill();
  g.fillStyle = GOLD; g.beginPath(); g.arc(0, -140 * s, 2 * s, 0, 7); g.arc(6 * s, -140 * s, 2 * s, 0, 7); g.fill(); // amber eyes
  g.restore();
}

function beast(g: CanvasRenderingContext2D, x: number, y: number, h: number, col: string) {
  const s = h / 100;
  g.save(); g.translate(x, y); g.fillStyle = col;
  g.beginPath(); g.moveTo(-50 * s, 0); g.quadraticCurveTo(-60 * s, -90 * s, 0, -100 * s); g.quadraticCurveTo(60 * s, -95 * s, 55 * s, 0); g.closePath(); g.fill();
  g.fillStyle = GOLD; g.beginPath(); g.arc(-14 * s, -70 * s, 4 * s, 0, 7); g.arc(10 * s, -72 * s, 4 * s, 0, 7); g.fill();
  g.fillStyle = '#e8dcc0'; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-20 * s + i * 9 * s, -50 * s); g.lineTo(-16 * s + i * 9 * s, -38 * s); g.lineTo(-12 * s + i * 9 * s, -50 * s); g.fill(); }
  g.restore();
}

function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, e: FrescoEvent, i: number) {
  const r = rnd(i * 13 + e.day * 7 + e.kind.length);
  // plaster ground
  g.fillStyle = OCHRE[i % OCHRE.length]; g.fillRect(x, y, w, h);
  const sky = g.createLinearGradient(0, y, 0, y + h * 0.6); sky.addColorStop(0, e.kind === 'death' || e.kind === 'defy' ? '#4a3a40' : SKY); sky.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sky; g.globalAlpha = 0.55; g.fillRect(x, y, w, h * 0.6); g.globalAlpha = 1;
  g.fillStyle = '#6a4a2a'; g.fillRect(x, y + h * 0.78, w, h * 0.22); // ground
  const gx = x + w / 2, gy = y + h * 0.8, fh = h * 0.42;
  switch (e.kind) {
    case 'boss': figure(g, gx - w * 0.22, gy, fh, SOOT, 'strike'); beast(g, gx + w * 0.18, gy, fh * 1.3, BLOOD); break;
    case 'death': g.fillStyle = '#8a8478'; g.fillRect(gx - 14, gy - fh * 0.5, 28, fh * 0.5); g.beginPath(); g.arc(gx, gy - fh * 0.5, 14, Math.PI, 0); g.fill(); figure(g, gx - w * 0.25, gy, fh * 0.9, SOOT, 'fall'); break;
    case 'quest': figure(g, gx, gy, fh, SOOT, 'raise'); g.fillStyle = GOLD; g.beginPath(); g.arc(gx + fh * 0.18, gy - fh * 1.12, 8, 0, 7); g.fill(); break;
    case 'obey': rider(g, gx + w * 0.2, gy, fh * 0.9); figure(g, gx - w * 0.2, gy, fh, SOOT, 'kneel'); break;
    case 'defy': rider(g, gx + w * 0.22, gy, fh * 0.9); figure(g, gx - w * 0.25, gy, fh, SOOT, 'away'); break;
    case 'trick': rider(g, gx + w * 0.22, gy, fh * 0.9); figure(g, gx - w * 0.2, gy, fh, TEAL, 'stand'); break;
    case 'dungeon': g.fillStyle = '#3a2a22'; g.beginPath(); g.moveTo(gx - 40, gy); g.lineTo(gx - 40, gy - fh * 0.9); g.quadraticCurveTo(gx, gy - fh * 1.4, gx + 40, gy - fh * 0.9); g.lineTo(gx + 40, gy); g.fill(); figure(g, gx - w * 0.28, gy, fh * 0.8, SOOT); break;
    case 'village': for (let k = 0; k < 3; k++) { const hx = x + w * (0.2 + k * 0.3); g.fillStyle = '#8a6a4a'; g.fillRect(hx - 18, gy - 34, 36, 34); g.fillStyle = BLOOD; g.beginPath(); g.moveTo(hx - 24, gy - 34); g.lineTo(hx, gy - 56); g.lineTo(hx + 24, gy - 34); g.fill(); } figure(g, gx, gy + 4, fh * 0.6, SOOT); break;
    case 'level': case 'rite': { const gl = g.createRadialGradient(gx, gy - fh * 0.6, 4, gx, gy - fh * 0.6, fh); gl.addColorStop(0, 'rgba(255,236,170,.9)'); gl.addColorStop(1, 'rgba(255,236,170,0)'); g.fillStyle = gl; g.fillRect(x, y, w, h); figure(g, gx, gy, fh, SOOT, e.kind === 'rite' ? 'stand' : 'raise'); break; }
    case 'wish': g.fillStyle = '#40c070'; g.beginPath(); g.moveTo(gx, gy - fh * 1.1); g.lineTo(gx + 12, gy - fh * 0.8); g.lineTo(gx, gy - fh * 0.5); g.lineTo(gx - 12, gy - fh * 0.8); g.fill(); rider(g, gx + w * 0.25, gy, fh * 0.8); figure(g, gx - w * 0.22, gy, fh, SOOT, 'raise'); break;
    case 'secret': case 'ending': {
      // one robed figure, two faces: grey and kind, gaunt with amber eyes
      g.fillStyle = '#5a5050'; g.beginPath(); g.moveTo(gx - 40, gy); g.lineTo(gx - 22, gy - fh * 1.1); g.lineTo(gx + 22, gy - fh * 1.1); g.lineTo(gx + 40, gy); g.fill();
      g.fillStyle = '#b8b8b8'; g.beginPath(); g.arc(gx - 9, gy - fh * 1.2, 12, 0, 7); g.fill();
      g.fillStyle = '#d8c8a8'; g.beginPath(); g.ellipse(gx + 9, gy - fh * 1.22, 9, 15, 0, 0, 7); g.fill();
      g.fillStyle = GOLD; g.beginPath(); g.arc(gx + 7, gy - fh * 1.24, 2.5, 0, 7); g.arc(gx + 13, gy - fh * 1.24, 2.5, 0, 7); g.fill();
      g.fillStyle = '#e8e0d0'; g.font = 'italic 13px serif'; g.textAlign = 'center'; g.fillText(SORCERER.split('').join(' '), gx, gy - fh * 1.5);
      break;
    }
  }
  // age: cracks, flaking, soot
  g.strokeStyle = 'rgba(40,24,12,.5)'; g.lineWidth = 1;
  for (let k = 0; k < 5; k++) { g.beginPath(); let cx = x + r() * w, cy = y + r() * h; g.moveTo(cx, cy); for (let j = 0; j < 4; j++) { cx += (r() - 0.5) * 40; cy += r() * 26; g.lineTo(cx, cy); } g.stroke(); }
  for (let k = 0; k < 7; k++) { g.fillStyle = `rgba(232,220,196,${0.25 + r() * 0.3})`; g.beginPath(); g.ellipse(x + r() * w, y + r() * h, 3 + r() * 10, 2 + r() * 6, r() * 3, 0, 7); g.fill(); }
  // caption
  g.fillStyle = 'rgba(30,18,10,.85)'; g.fillRect(x, y + h - 30, w, 30);
  g.fillStyle = '#e8d8b0'; g.font = '13px "Courier New", monospace'; g.textAlign = 'center';
  const t = `Day ${e.day + 1}: ${e.text}`;
  g.fillText(t.length > 46 ? t.slice(0, 45) + '…' : t, x + w / 2, y + h - 11);
  g.strokeStyle = '#4a2e18'; g.lineWidth = 6; g.strokeRect(x, y, w, h);
}

/** Show the fresco: the latest events (and, if revealed, the sorcerer's panel). */
export function showFresco(ui: HTMLElement, log: FrescoLog, secret: boolean, onClose: () => void) {
  const root = document.createElement('div'); root.className = 'menu fresco';
  const box = document.createElement('div'); box.className = 'menu-box panel fresco-box';
  const h = document.createElement('h2'); h.textContent = 'The Living Fresco';
  const p = document.createElement('p'); p.className = 'cr-intro'; p.textContent = 'The paint is wet in places, as if it were finished a moment ago. The scenes are yours.';
  const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 620; cv.className = 'fresco-canvas';
  const close = document.createElement('button'); close.className = 'btn'; close.textContent = 'Step back';
  close.onclick = () => { root.remove(); onClose(); };
  box.append(h, p, cv, close); root.appendChild(box); ui.appendChild(root);
  const g = cv.getContext('2d')!;
  g.fillStyle = '#5a3a22'; g.fillRect(0, 0, cv.width, cv.height);
  const ev = log.events.slice(-(secret ? 7 : 8));
  const list: FrescoEvent[] = secret ? [...ev, { day: ev[ev.length - 1]?.day ?? 0, kind: 'secret', text: 'Two faces, one will' }] : ev;
  if (!list.length) list.push({ day: 0, kind: 'rite', text: 'A blank face in a moonlit clearing' });
  const cols = 4, pw = 280, ph = 280, gap = 16;
  list.forEach((e, i) => panel(g, gap + (i % cols) * (pw + gap) + 6, gap + Math.floor(i / cols) * (ph + gap) + 6, pw, ph, e, i));
}
