// Generates the PWA / Apple touch icons as pixel-art PNGs (no external tools needed).
// A 32x32 logical pixel design is upscaled with nearest-neighbour.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// --- 32x32 design: night sky, moon, black tower with two amber eyes ---
const G = 32;
function design(x, y, pad) {
  // pad shrinks the art toward the centre (maskable safe zone)
  const s = (G - pad * 2) / G;
  const gx = (x - pad) / s, gy = (y - pad) / s;
  const sky = [
    Math.round(10 + gy * 1.2), Math.round(8 + gy * 0.6), Math.round(24 + gy * 1.4)
  ];
  if (gx < 0 || gy < 0 || gx >= G || gy >= G) return sky;
  const ix = Math.floor(gx), iy = Math.floor(gy);
  // moon
  const mdx = ix - 23, mdy = iy - 7;
  if (mdx * mdx + mdy * mdy <= 12) {
    const shade = (mdx - 1) * (mdx - 1) + (mdy + 1) * (mdy + 1) <= 6 ? 0 : 1;
    return shade ? [220, 214, 190] : [196, 188, 160];
  }
  // ground hill
  const hill = 26 + Math.round(Math.sin(ix * 0.35) * 1.5);
  if (iy >= hill) return [18, 14, 20];
  // tower
  const inTower = ix >= 12 && ix <= 19 && iy >= 9;
  const battlement = iy >= 7 && iy <= 8 && ix >= 11 && ix <= 20 && (ix % 2 === 1);
  const spire = iy >= 2 && iy < 9 && Math.abs(ix - 15.5) <= (iy - 2) * 0.55;
  if (inTower || battlement || spire) {
    // amber eyes (window)
    if (iy === 13 && (ix === 14 || ix === 17)) return [255, 176, 40];
    if (iy === 14 && (ix === 14 || ix === 17)) return [170, 90, 10];
    // door
    if (ix >= 15 && ix <= 16 && iy >= 22) return [70, 10, 14];
    return [4, 3, 6];
  }
  // stars
  const starHash = (ix * 73856093) ^ (iy * 19349663);
  if (iy < 18 && (starHash & 127) === 3) return [200, 190, 220];
  // red horizon glow
  if (iy > 20) return [Math.min(255, sky[0] + (iy - 20) * 10), sky[1] + (iy - 20), sky[2]];
  return sky;
}

mkdirSync('public/icons', { recursive: true });
const out = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-512-maskable.png', 512, 4],
  ['apple-touch-icon.png', 180, 0]
];
for (const [name, size, pad] of out) {
  const scale = size / G;
  const buf = png(size, (x, y) => design(x / scale, y / scale, pad));
  writeFileSync(`public/icons/${name}`, buf);
}
console.log('icons generated');
