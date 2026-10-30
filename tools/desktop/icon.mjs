// The desktop icon. Source art: tools/desktop/icon.png (a committed copy of the itch.io icon,
// release/itch/icon.png: the woman in white, cropped from the cover render); if neither file
// exists it falls back to the procedural ember flame on a near-black rounded tile below.
// Pure Node (zlib only), deterministic. Exports PNG, ICO (Windows) and ICNS (macOS) buffers;
// `node tools/desktop/icon.mjs out.png` writes a 512 px preview.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ICON_SOURCES = [path.join(HERE, 'icon.png'), path.resolve(HERE, '../../release/itch/icon.png')];

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

/** RGBA pixels of the procedural flame icon at `size` px, 4x4 supersampled. */
export function renderFlame(size) {
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

// ---------------------------------------------------------------- source PNG (8-bit RGB / RGBA / grey)
/** Decode a non-interlaced 8-bit PNG to { w, h, px: RGBA Buffer }. */
export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const kind = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error('icon PNG must be 8-bit, non-interlaced');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!ch) throw new Error('unsupported PNG colour type ' + type);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const cur = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let p = line[i];
      if (ft === 1) p += a;
      else if (ft === 2) p += b;
      else if (ft === 3) p += (a + b) >> 1;
      else if (ft === 4) {
        const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
        p += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = p & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * ch;
      if (type === 6) cur.copy(px, o, s, s + 4);
      else if (type === 2) { px[o] = cur[s]; px[o + 1] = cur[s + 1]; px[o + 2] = cur[s + 2]; px[o + 3] = 255; }
      else if (type === 3) {
        const k = cur[s];
        px[o] = palette[k * 3]; px[o + 1] = palette[k * 3 + 1]; px[o + 2] = palette[k * 3 + 2];
        px[o + 3] = trns && k < trns.length ? trns[k] : 255;
      } else {
        px[o] = px[o + 1] = px[o + 2] = cur[s];
        px[o + 3] = type === 4 ? cur[s + 1] : 255;
      }
    }
    cur.copy(prev);
  }
  return { w, h, px };
}

let _source;
/** The icon source art (first existing file of ICON_SOURCES), or null for the procedural flame. */
export function iconSource() {
  if (_source !== undefined) return _source;
  _source = null;
  for (const f of ICON_SOURCES) {
    if (!fs.existsSync(f)) continue;
    try {
      _source = decodePNG(fs.readFileSync(f));
      _source.file = f;
      break;
    } catch (e) {
      console.warn(`icon: cannot read ${f} (${e.message}), trying the next source`);
    }
  }
  return _source;
}

const toLin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSRGB = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)));

/** Resample the (square) source to size x size: exact area average in linear light when shrinking,
 *  bilinear when enlarging; a light unsharp mask keeps the small Windows sizes crisp. */
function resample(src, size) {
  const { w, h, px } = src;
  const n = Math.min(w, h), ox = (w - n) >> 1, oy = (h - n) >> 1;
  const lin = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = px[i * 4 + 3] / 255;
    lin[i * 4] = toLin(px[i * 4]) * a;
    lin[i * 4 + 1] = toLin(px[i * 4 + 1]) * a;
    lin[i * 4 + 2] = toLin(px[i * 4 + 2]) * a;
    lin[i * 4 + 3] = a;
  }
  const out = new Float32Array(size * size * 4);
  const k = n / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const o = (j * size + i) * 4;
      if (k > 1) {
        const x0 = ox + i * k, x1 = x0 + k, y0 = oy + j * k, y1 = y0 + k;
        let r = 0, g = 0, b = 0, a = 0, wsum = 0;
        for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
          const wy = Math.min(y + 1, y1) - Math.max(y, y0);
          for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
            const wx = Math.min(x + 1, x1) - Math.max(x, x0), wt = wx * wy, s = (y * w + x) * 4;
            r += lin[s] * wt; g += lin[s + 1] * wt; b += lin[s + 2] * wt; a += lin[s + 3] * wt; wsum += wt;
          }
        }
        out[o] = r / wsum; out[o + 1] = g / wsum; out[o + 2] = b / wsum; out[o + 3] = a / wsum;
      } else {
        const fx = Math.min(n - 1, Math.max(0, (i + 0.5) * k - 0.5)), fy = Math.min(n - 1, Math.max(0, (j + 0.5) * k - 0.5));
        const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1);
        const tx = fx - x0, ty = fy - y0;
        for (let c = 0; c < 4; c++) {
          const s = (yy, xx) => lin[((oy + yy) * w + ox + xx) * 4 + c];
          out[o + c] = (s(y0, x0) * (1 - tx) + s(y0, x1) * tx) * (1 - ty) + (s(y1, x0) * (1 - tx) + s(y1, x1) * tx) * ty;
        }
      }
    }
  }
  // unsharp mask (3x3 box) for the downscaled sizes
  const amt = k > 1 ? Math.min(0.5, 0.12 * Math.log2(k)) : 0;
  const res = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const o = (j * size + i) * 4;
      const a = out[o + 3];
      for (let c = 0; c < 3; c++) {
        let v = out[o + c];
        if (amt > 0) {
          let sum = 0, cnt = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const y = j + dy, x = i + dx;
              if (x < 0 || y < 0 || x >= size || y >= size) continue;
              sum += out[(y * size + x) * 4 + c];
              cnt++;
            }
          }
          v = v + (v - sum / cnt) * amt;
        }
        res[o + c] = a > 0 ? toSRGB(Math.max(0, v) / a) : 0;
      }
      res[o + 3] = Math.round(a * 255);
    }
  }
  return res;
}

/** RGBA pixels of the icon at `size` px (the source art, or the procedural flame). */
export function renderIcon(size) {
  const src = iconSource();
  return src ? resample(src, size) : renderFlame(size);
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
  console.log('wrote', out, 'from', iconSource()?.file || 'the procedural flame');
}
