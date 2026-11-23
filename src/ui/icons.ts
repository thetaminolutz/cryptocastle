// Item icons drawn in code (64x64 canvas → data URL, cached). No image files.
import { ITEMS, IconShape } from '../data/items';

const cache = new Map<string, string>();
const S = 64;

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k)), g = Math.min(255, Math.round(((n >> 8) & 255) * k)), b = Math.min(255, Math.round((n & 255) * k));
  return `rgb(${r},${g},${b})`;
}

function handle(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w = 5) {
  c.strokeStyle = '#6a4a2a'; c.lineWidth = w; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  c.strokeStyle = '#8a6a42'; c.lineWidth = w - 2;
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
}

function draw(c: CanvasRenderingContext2D, shape: IconShape, col: string, acc?: string) {
  const grad = (x0: number, y0: number, x1: number, y1: number) => {
    const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, shade(col, 1.35)); g.addColorStop(1, shade(col, 0.6)); return g;
  };
  c.lineJoin = 'round';
  switch (shape) {
    case 'log':
      c.fillStyle = grad(10, 20, 54, 46); c.beginPath(); c.roundRect(8, 22, 44, 22, 6); c.fill();
      c.fillStyle = acc ?? '#c8a070'; c.beginPath(); c.ellipse(52, 33, 6, 11, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = shade(acc ?? '#c8a070', 0.7); c.lineWidth = 1; c.beginPath(); c.ellipse(52, 33, 3, 6, 0, 0, Math.PI * 2); c.stroke();
      break;
    case 'plank':
      for (let i = 0; i < 3; i++) { c.fillStyle = grad(8, 14 + i * 13, 56, 26 + i * 13); c.fillRect(8, 14 + i * 13, 48, 10); }
      break;
    case 'stick': handle(c, 14, 52, 50, 12, 6); break;
    case 'staff': handle(c, 16, 56, 46, 8, 6); c.fillStyle = col; c.beginPath(); c.arc(47, 9, 6, 0, 7); c.fill(); break;
    case 'stone': case 'flint': case 'coal':
      c.fillStyle = grad(14, 18, 50, 50);
      c.beginPath(); c.moveTo(14, 40); c.lineTo(20, 20); c.lineTo(40, 14); c.lineTo(52, 30); c.lineTo(46, 50); c.lineTo(24, 52); c.closePath(); c.fill();
      if (shape === 'flint') { c.strokeStyle = '#9a9aa8'; c.lineWidth = 2; c.beginPath(); c.moveTo(22, 24); c.lineTo(40, 40); c.stroke(); }
      break;
    case 'ore':
      c.fillStyle = '#6a6660'; c.beginPath(); c.moveTo(12, 40); c.lineTo(18, 18); c.lineTo(42, 12); c.lineTo(54, 32); c.lineTo(44, 52); c.lineTo(20, 52); c.closePath(); c.fill();
      c.fillStyle = col; for (const [x, y, r] of [[26, 28, 6], [40, 36, 5], [30, 44, 4], [42, 22, 3]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
      if (acc) { c.fillStyle = acc; c.beginPath(); c.arc(22, 40, 3, 0, 7); c.fill(); }
      break;
    case 'bar':
      c.fillStyle = grad(10, 22, 54, 44);
      c.beginPath(); c.moveTo(10, 42); c.lineTo(18, 24); c.lineTo(54, 24); c.lineTo(46, 42); c.closePath(); c.fill();
      c.fillStyle = shade(col, 1.5); c.fillRect(20, 27, 30, 3);
      break;
    case 'gem': case 'shard': case 'glass':
      c.fillStyle = grad(20, 8, 44, 56); c.globalAlpha = shape === 'glass' ? 0.7 : 1;
      c.beginPath(); c.moveTo(32, 6); c.lineTo(48, 26); c.lineTo(32, 58); c.lineTo(16, 26); c.closePath(); c.fill();
      c.globalAlpha = 1; c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.moveTo(32, 10); c.lineTo(38, 26); c.lineTo(32, 30); c.closePath(); c.fill();
      if (acc) { c.fillStyle = acc; c.beginPath(); c.moveTo(16, 26); c.lineTo(32, 58); c.lineTo(26, 30); c.closePath(); c.fill(); }
      break;
    case 'fiber': case 'rope':
      c.strokeStyle = col; c.lineWidth = 3;
      for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(14 + i * 3, 54); c.bezierCurveTo(20 + i * 4, 30, 30 + i * 3, 30, 40 + i * 3, 10); c.stroke(); }
      if (shape === 'rope') { c.strokeStyle = shade(col, 0.6); c.lineWidth = 2; for (let y = 16; y < 52; y += 6) { c.beginPath(); c.moveTo(16, y); c.lineTo(48, y + 4); c.stroke(); } }
      break;
    case 'berry':
      c.fillStyle = '#3a6a2a'; c.beginPath(); c.ellipse(30, 16, 12, 5, -0.4, 0, 7); c.fill();
      for (const [x, y] of [[24, 34], [38, 32], [30, 46], [44, 44], [18, 46]]) { c.fillStyle = col; c.beginPath(); c.arc(x, y, 8, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.arc(x - 3, y - 3, 2, 0, 7); c.fill(); }
      break;
    case 'mushroom':
      c.fillStyle = '#e8e0d0'; c.fillRect(27, 30, 10, 24);
      c.fillStyle = grad(8, 12, 56, 34); c.beginPath(); c.ellipse(32, 30, 24, 16, 0, Math.PI, 0); c.fill();
      c.fillStyle = 'rgba(255,255,255,.8)'; for (const [x, y] of [[22, 22], [36, 18], [44, 26]]) { c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }
      break;
    case 'flower':
      c.strokeStyle = '#3a7a2a'; c.lineWidth = 3; c.beginPath(); c.moveTo(32, 58); c.lineTo(32, 30); c.stroke();
      c.fillStyle = col; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; c.beginPath(); c.ellipse(32 + Math.cos(a) * 10, 22 + Math.sin(a) * 10, 8, 5, a, 0, 7); c.fill(); }
      c.fillStyle = acc ?? '#f0c040'; c.beginPath(); c.arc(32, 22, 6, 0, 7); c.fill();
      break;
    case 'leaf':
      c.fillStyle = grad(10, 10, 54, 54); c.beginPath(); c.moveTo(10, 54); c.quadraticCurveTo(12, 12, 54, 10); c.quadraticCurveTo(52, 50, 10, 54); c.fill();
      c.strokeStyle = shade(col, 0.6); c.lineWidth = 2; c.beginPath(); c.moveTo(12, 52); c.lineTo(48, 16); c.stroke();
      break;
    case 'pickaxe': handle(c, 20, 56, 40, 14); c.strokeStyle = col; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(14, 18); c.quadraticCurveTo(38, 2, 58, 24); c.stroke(); break;
    case 'axe': handle(c, 18, 58, 42, 10); c.fillStyle = grad(36, 8, 58, 34); c.beginPath(); c.moveTo(36, 12); c.quadraticCurveTo(60, 8, 58, 34); c.lineTo(42, 26); c.closePath(); c.fill(); break;
    case 'shovel': handle(c, 16, 54, 40, 22); c.fillStyle = grad(36, 6, 58, 30); c.beginPath(); c.ellipse(46, 16, 10, 14, 0.8, 0, 7); c.fill(); break;
    case 'sickle': handle(c, 14, 58, 26, 40); c.strokeStyle = col; c.lineWidth = 6; c.beginPath(); c.arc(36, 28, 18, Math.PI * 0.9, Math.PI * 2.2); c.stroke(); break;
    case 'knife': handle(c, 14, 54, 26, 42, 7); c.fillStyle = grad(24, 12, 56, 44); c.beginPath(); c.moveTo(24, 40); c.lineTo(54, 10); c.lineTo(32, 44); c.closePath(); c.fill(); break;
    case 'torch':
      handle(c, 24, 58, 36, 22, 7);
      c.fillStyle = '#ff9a20'; c.beginPath(); c.ellipse(37, 16, 8, 13, 0.3, 0, 7); c.fill();
      c.fillStyle = '#ffe080'; c.beginPath(); c.ellipse(37, 19, 4, 7, 0.3, 0, 7); c.fill();
      break;
    case 'campfire':
      c.fillStyle = '#7a7470'; for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI; c.beginPath(); c.arc(32 + Math.cos(a) * 22, 50 - Math.sin(a) * 4, 6, 0, 7); c.fill(); }
      handle(c, 14, 50, 48, 38, 6); handle(c, 50, 50, 16, 38, 6);
      c.fillStyle = '#ff8a20'; c.beginPath(); c.moveTo(20, 44); c.quadraticCurveTo(32, 0, 44, 44); c.fill();
      c.fillStyle = '#ffe070'; c.beginPath(); c.moveTo(26, 44); c.quadraticCurveTo(32, 18, 38, 44); c.fill();
      break;
    case 'bench':
      c.fillStyle = grad(6, 18, 58, 28); c.fillRect(6, 20, 52, 9);
      c.fillStyle = shade(col, 0.7); c.fillRect(10, 29, 6, 26); c.fillRect(48, 29, 6, 26); c.fillRect(10, 44, 44, 4);
      break;
    case 'furnace':
      c.fillStyle = grad(10, 10, 54, 58); c.fillRect(10, 14, 44, 44); c.fillRect(38, 4, 10, 12);
      c.fillStyle = '#ff6a20'; c.beginPath(); c.roundRect(22, 34, 20, 16, 4); c.fill();
      break;
    case 'anvil':
      c.fillStyle = grad(6, 18, 58, 50);
      c.beginPath(); c.moveTo(6, 20); c.lineTo(58, 20); c.lineTo(50, 30); c.lineTo(40, 30); c.lineTo(44, 48); c.lineTo(20, 48); c.lineTo(24, 30); c.lineTo(14, 30); c.closePath(); c.fill();
      c.fillRect(16, 48, 32, 8);
      break;
    case 'sand': case 'clump':
      c.fillStyle = grad(10, 20, 54, 56);
      c.beginPath(); c.moveTo(8, 54); c.quadraticCurveTo(20, 18, 32, 20); c.quadraticCurveTo(46, 18, 56, 54); c.closePath(); c.fill();
      c.fillStyle = shade(col, 0.7); for (let i = 0; i < 18; i++) { c.fillRect(14 + ((i * 37) % 36), 30 + ((i * 17) % 22), 2, 2); }
      break;
    case 'meal':
      c.fillStyle = '#d8d0c0'; c.beginPath(); c.ellipse(32, 44, 26, 10, 0, 0, 7); c.fill();
      c.fillStyle = grad(14, 22, 50, 44); c.beginPath(); c.ellipse(32, 38, 18, 11, 0, 0, 7); c.fill();
      break;
    case 'potion':
      c.fillStyle = '#c8c0b0'; c.fillRect(27, 6, 10, 12);
      c.fillStyle = 'rgba(200,230,240,0.5)'; c.beginPath(); c.arc(32, 38, 18, 0, 7); c.fill();
      c.fillStyle = col; c.beginPath(); c.arc(32, 40, 15, 0.1, Math.PI - 0.1); c.fill();
      break;
    case 'sword':
      handle(c, 12, 56, 22, 46, 6); c.fillStyle = '#5a4030'; c.fillRect(14, 40, 14, 4);
      c.fillStyle = grad(20, 8, 56, 44); c.beginPath(); c.moveTo(22, 44); c.lineTo(52, 10); c.lineTo(56, 8); c.lineTo(54, 12); c.lineTo(26, 46); c.closePath(); c.fill();
      break;
    case 'spear': handle(c, 10, 58, 46, 14, 5); c.fillStyle = grad(40, 4, 58, 22); c.beginPath(); c.moveTo(44, 16); c.lineTo(58, 4); c.lineTo(50, 22); c.closePath(); c.fill(); break;
    case 'mace': handle(c, 14, 56, 36, 26, 6); c.fillStyle = grad(30, 8, 56, 32); c.beginPath(); c.arc(42, 20, 11, 0, 7); c.fill(); c.fillStyle = shade(col, 1.4); for (let i = 0; i < 6; i++) { const a = i * 1.05; c.beginPath(); c.arc(42 + Math.cos(a) * 12, 20 + Math.sin(a) * 12, 3, 0, 7); c.fill(); } break;
    case 'club': c.strokeStyle = grad(10, 50, 50, 10); c.lineWidth = 12; c.lineCap = 'round'; c.beginPath(); c.moveTo(16, 50); c.lineTo(46, 16); c.stroke(); handle(c, 10, 58, 20, 46, 6); break;
    case 'shield':
      c.fillStyle = grad(10, 6, 54, 58); c.beginPath(); c.moveTo(10, 10); c.lineTo(54, 10); c.lineTo(52, 34); c.quadraticCurveTo(46, 52, 32, 58); c.quadraticCurveTo(18, 52, 12, 34); c.closePath(); c.fill();
      c.strokeStyle = shade(col, 0.55); c.lineWidth = 3; c.stroke(); c.fillStyle = '#c8a040'; c.beginPath(); c.arc(32, 30, 5, 0, 7); c.fill();
      break;
    case 'meat': c.fillStyle = grad(8, 14, 50, 50); c.beginPath(); c.ellipse(28, 34, 20, 15, -0.4, 0, 7); c.fill(); c.fillStyle = '#e8e0cc'; c.fillRect(42, 14, 6, 18); c.beginPath(); c.arc(45, 12, 5, 0, 7); c.fill(); break;
    case 'hide': c.fillStyle = grad(8, 10, 56, 54); c.beginPath(); c.moveTo(12, 14); c.quadraticCurveTo(32, 20, 52, 14); c.lineTo(48, 32); c.lineTo(56, 52); c.quadraticCurveTo(32, 44, 8, 52); c.lineTo(16, 32); c.closePath(); c.fill(); break;
    case 'bone': c.strokeStyle = col; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(16, 48); c.lineTo(48, 16); c.stroke(); c.fillStyle = col; for (const [x, y] of [[12, 46], [18, 52], [46, 12], [52, 18]]) { c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); } break;
    case 'fang': c.fillStyle = grad(20, 8, 44, 58); c.beginPath(); c.moveTo(22, 10); c.quadraticCurveTo(46, 10, 42, 22); c.quadraticCurveTo(38, 44, 30, 58); c.quadraticCurveTo(26, 34, 22, 10); c.fill(); break;
    case 'coin': c.fillStyle = grad(14, 14, 50, 50); c.beginPath(); c.arc(32, 32, 18, 0, 7); c.fill(); c.strokeStyle = shade(col, 0.6); c.lineWidth = 2; c.beginPath(); c.arc(32, 32, 13, 0, 7); c.stroke(); break;
    case 'brick':
      c.fillStyle = grad(8, 20, 56, 46); c.fillRect(8, 22, 48, 24);
      c.strokeStyle = shade(col, 0.6); c.lineWidth = 2; c.strokeRect(8, 22, 48, 24);
      break;
  }
}

export function iconUrl(id: string): string {
  let url = cache.get(id);
  if (url) return url;
  const def = ITEMS[id];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const c = canvas.getContext('2d')!;
  if (def) {
    c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 3; c.shadowOffsetY = 2;
    draw(c, def.icon.shape, def.icon.color, def.icon.accent);
  }
  url = canvas.toDataURL();
  cache.set(id, url);
  return url;
}
