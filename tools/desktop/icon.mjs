// Generates the desktop icon: a red ember flame with a bone-white core on a near-black
// rounded tile. Pure Node (zlib only), deterministic. Exports PNG, ICO (Windows) and
// ICNS (macOS) buffers; `node tools/desktop/icon.mjs out.png` writes a 512 px preview.
import zlib from 'node:zlib';
import fs from 'node:fs';

const BG = [11, 9, 9];
const RED = [168, 26, 22];
const DEEP = [74, 10, 9];
const BONE = [236, 224, 198];
const EMBER = [222, 104, 52];

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Teardrop flame, tip up: half-width at height y in [-1, 1] (x = sin t * sin^m(t/2), y = cos t).
// The centre line sways a little so it reads as a living flame, not a symbol.
function flame(x, y, sx, sy, oy) {
  const raw = (y - oy) / sy;
  const fy = Math.min(0.999, Math.max(-0.999, raw));
  const t = Math.acos(fy);
  const half = Math.sin(t) * Math.pow(Math.sin(t / 2), 1.7) * 0.82;
  const lean = 0.16 * Math.sin((fy + 1) * 2.1) * ((fy + 1) / 2) ** 1.5;
  return half - Math.abs(x / sx - lean) - Math.abs(raw - fy); // > 0 inside, roughly in flame units
}

function shade(x, y) {
  // rounded tile
  const q = Math.max(Math.abs(x), Math.abs(y)) > 0.94 ? 1 : 0;
  const r = 0.24;
  const dx = Math.max(Math.abs(x) - (0.94 - r), 0);
  const dy = Math.max(Math.abs(y) - (0.94 - r), 0);
  if (q || Math.hypot(dx, dy) > r) return null;
  const glowR = Math.hypot(x * 0.9, (y + 0.35) * 1.1);
  let c = mix(BG, DEEP, 0.55 * Math.exp(-glowR * glowR * 2.2));

  const outer = flame(x, y, 0.74, 0.7, -0.04);
  const core = flame(x, y, 0.4, 0.38, -0.32);
  if (outer > 0) {
    const edge = smooth(0, 0.1, outer); // crisp dark rim, then the red body
    c = mix(DEEP, RED, edge);
    c = mix(c, EMBER, smooth(-0.1, -0.7, y) * edge * 0.5);
  } else {
    c = mix(c, RED, 0.22 * Math.exp(outer * 16)); // thin heat halo outside the flame
  }
  if (core > -0.06) c = mix(c, EMBER, smooth(-0.06, 0.04, core));
  if (core > 0) c = mix(c, BONE, smooth(0.0, 0.14, core));
  // two rising sparks
  for (const [sxp, syp, rr] of [[0.4, 0.46, 0.045], [0.54, 0.66, 0.03]]) {
    const d = Math.hypot(x - sxp, y - syp);
    if (d < rr) c = mix(RED, BONE, smooth(rr, rr * 0.25, d));
  }
  return c;
}

/** RGBA pixels of the icon at `size` px, 4x4 supersampled. */
export function renderIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const S = 4;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sj = 0; sj < S; sj++) {
        for (let si = 0; si < S; si++) {
          const x = ((i + (si + 0.5) / S) / size) * 2 - 1;
          const y = 1 - ((j + (sj + 0.5) / S) / size) * 2;
          const c = shade(x, y);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const o = (j * size + i) * 4;
      if (a) { px[o] = r / a; px[o + 1] = g / a; px[o + 2] = b / a; }
      px[o + 3] = Math.round((a / (S * S)) * 255);
    }
  }
  return px;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function png(size) {
  const px = renderIcon(size);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Windows .ico with PNG-compressed entries (Vista and later). */
export function ico(sizes = [16, 24, 32, 48, 64, 128, 256]) {
  const imgs = sizes.map((s) => png(s));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head[e] = s % 256;
    head[e + 1] = s % 256;
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(imgs[i].length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += imgs[i].length;
  });
  return Buffer.concat([head, ...imgs]);
}

/** macOS .icns made of PNG entries. */
export function icns() {
  const types = [['icp4', 16], ['icp5', 32], ['ic11', 32], ['ic12', 64], ['ic07', 128], ['ic13', 256], ['ic08', 256], ['ic14', 512], ['ic09', 512], ['ic10', 1024]];
  const cache = new Map();
  const parts = types.map(([type, s]) => {
    if (!cache.has(s)) cache.set(s, png(s));
    const data = cache.get(s);
    const h = Buffer.alloc(8);
    h.write(type, 0, 'ascii');
    h.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([h, data]);
  });
  const body = Buffer.concat(parts);
  const h = Buffer.alloc(8);
  h.write('icns', 0, 'ascii');
  h.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([h, body]);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const out = process.argv[2] || 'icon-preview.png';
  fs.writeFileSync(out, png(512));
  console.log('wrote', out);
}
