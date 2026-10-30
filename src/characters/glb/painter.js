// Canvas painter for the character atlas (port of Hia Phat's atlas Painter, procedural only:
// no photo textures). Region-local coordinates (s, t ∈ 0..1) inside the layout regions; every
// fill overpaints the INSET margin at region edges (mip bleeding guard).
import { makeRng } from '../../core/math.js';
import { ATLAS, INSET } from './layout.js';
import { FONTS } from '../../ui/fonts.js';

export const hexToRgb = (h) => {
  if (Array.isArray(h)) return h;
  if (typeof h === 'number') return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const n = parseInt(String(h || '#c69472').replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const toHex = (c) => {
  if (typeof c === 'string' && c[0] === '#') return c;
  const [r, g, b] = Array.isArray(c) ? c : hexToRgb(c);
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
};
export const css = (r, g, b, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
export function mix(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  return toHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}
export function shade(h, k, a = 1) {
  const c = hexToRgb(h);
  return css(Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k), a);
}
export function shadeHex(h, k) {
  const c = hexToRgb(h);
  return toHex([c[0] * k, c[1] * k, c[2] * k]);
}
export const lum = (h) => { const c = hexToRgb(h); return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255; };
export const rgba = (h, a) => { const c = hexToRgb(h); return css(c[0], c[1], c[2], a); };

// ---------------------------------------------------------------- procedural tiles (cached)
const tiles = new Map();
function tile(key, S, fn) {
  if (tiles.has(key)) return tiles.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const im = g.createImageData(S, S);
  fn(im.data, S);
  g.putImageData(im, 0, 0);
  tiles.set(key, cv);
  return cv;
}
// periodic value noise
function pnoise(rng, period) {
  const gr = new Float32Array(period * period);
  for (let i = 0; i < gr.length; i++) gr[i] = rng();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = gr[y0 * period + x0], b = gr[y0 * period + x1], c = gr[y1 * period + x0], d = gr[y1 * period + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
/** grey value-noise tile (fbm), mean 128 */
export function noiseTile(octaves = 4, base = 4, seed = 7) {
  return tile(`n${octaves}_${base}_${seed}`, 256, (d, S) => {
    const rng = makeRng(seed);
    const L = [];
    for (let o = 0; o < octaves; o++) L.push(pnoise(rng, base << o));
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let s = 0, a = 0.5, n = 0;
      for (let o = 0; o < octaves; o++) { const p = base << o; s += a * L[o]((x / S) * p, (y / S) * p); n += a; a *= 0.5; }
      const v = 128 + (s / n - 0.5) * 255;
      const i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
  });
}
/** fabric weave detail tiles (grey, mean ~128): jersey, plain, twill, linen, rib, sateen, knitL */
export function weaveTile(kind) {
  return tile('w_' + kind, 64, (d, S) => {
    const rng = makeRng(kind.length * 97 + kind.charCodeAt(0));
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let v = 0;
      const jit = (rng() - 0.5) * 18;
      switch (kind) {
        case 'jersey': { // knit columns of little Vs
          const cx = x % 4, cy = y % 4;
          v = (cx === 1 || cx === 2 ? 22 : -14) + (cy === 0 ? -10 : 0) + ((x >> 2) % 2 === 0 ? (cy < 2 ? 6 : -6) : (cy < 2 ? -6 : 6));
          break;
        }
        case 'plain': v = ((x + (y % 2)) % 2 ? 14 : -14) + ((y % 2) ? -4 : 4); break;
        case 'twill': v = (((x + y) % 4) < 2 ? 20 : -16) + ((x % 4 === 0) ? -6 : 0); break;
        case 'linen': {
          const sl = Math.sin(y * 0.9 + Math.sin(x * 0.13) * 2) * 10 + Math.sin(x * 1.3 + Math.sin(y * 0.21) * 2) * 8;
          v = sl + ((x + y) % 2 ? 8 : -8);
          break;
        }
        case 'rib': v = (x % 3 === 0 ? -22 : 12); break;
        case 'sateen': v = ((x * 3 + y) % 5 === 0 ? 18 : -4); break;
        case 'knitL': v = ((x % 6) < 3 ? 16 : -12) + ((y % 3) === 0 ? -10 : 2); break;
        default: v = 0;
      }
      const i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, 128 + v + jit));
      d[i + 3] = 255;
    }
  });
}
/** hair strand tile: vertical strands with clumps (grey) */
export function strandTile() {
  return tile('strands', 256, (d, S) => {
    const rng = makeRng(31);
    const cols = new Float32Array(S);
    for (let x = 0; x < S; x++) cols[x] = rng();
    const clump = pnoise(rng, 8);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const c = clump((x / S) * 8, (y / S) * 2);
      const s = cols[x] * 0.6 + cols[(x + 1) % S] * 0.2 + cols[(x + S - 1) % S] * 0.2;
      const v = 128 + (s - 0.5) * 140 + (c - 0.5) * 90;
      const i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v));
      d[i + 3] = 255;
    }
  });
}

// ---------------------------------------------------------------- painter
export class Painter {
  constructor(cv, S, seed = 1) {
    this.cv = cv;
    this.S = S;
    this.g = cv.getContext('2d', { willReadFrequently: true });
    const k = S / ATLAS;
    this.g.setTransform(k, 0, 0, k, 0, 0);
    this.rng = makeRng(seed);
  }
  rect(reg, s0, t0, s1, t1) {
    const iw = reg.w - 2 * INSET, ih = reg.h - 2 * INSET;
    const x0 = s0 <= 0 ? reg.x : reg.x + INSET + s0 * iw;
    const x1 = s1 >= 1 ? reg.x + reg.w : reg.x + INSET + s1 * iw;
    const y0 = t0 <= 0 ? reg.y : reg.y + INSET + t0 * ih;
    const y1 = t1 >= 1 ? reg.y + reg.h : reg.y + INSET + t1 * ih;
    return [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
  }
  pt(reg, s, t) { return [reg.x + INSET + s * (reg.w - 2 * INSET), reg.y + INSET + t * (reg.h - 2 * INSET)]; }
  sx(reg, ds) { return ds * (reg.w - 2 * INSET); }
  sy(reg, dt) { return dt * (reg.h - 2 * INSET); }
  clip(reg, s0 = 0, t0 = 0, s1 = 1, t1 = 1) { const [x, y, w, h] = this.rect(reg, s0, t0, s1, t1); this.g.beginPath(); this.g.rect(x, y, w, h); this.g.clip(); }
  fill(reg, color, s0 = 0, t0 = 0, s1 = 1, t1 = 1, a = 1) {
    const [x, y, w, h] = this.rect(reg, s0, t0, s1, t1);
    this.g.save(); this.g.globalAlpha = a; this.g.fillStyle = color; this.g.fillRect(x, y, w, h); this.g.restore();
  }
  /** overlay a grey tile pattern (mode overlay/multiply/soft-light) */
  pattern(reg, tileCv, alpha, s0 = 0, t0 = 0, s1 = 1, t1 = 1, scale = 1, mode = 'overlay', rot = 0) {
    const g = this.g;
    const [x, y, w, h] = this.rect(reg, s0, t0, s1, t1);
    if (w <= 0 || h <= 0) return;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    const p = g.createPattern(tileCv, 'repeat');
    // pattern texels map ~1:1 to canvas pixels at any atlas resolution (crisp weave / grain)
    const ns = scale * (ATLAS / this.S) * (this.S > ATLAS ? 1.4 : 1);
    p.setTransform(new DOMMatrix().translate(x, y).rotate(rot).scale(ns, ns));
    g.globalCompositeOperation = mode; g.globalAlpha = alpha; g.fillStyle = p; g.fillRect(x, y, w, h);
    g.restore();
  }
  noise(reg, alpha, s0 = 0, t0 = 0, s1 = 1, t1 = 1, scale = 1, oct = 4, base = 4) {
    this.pattern(reg, noiseTile(oct, base), alpha, s0, t0, s1, t1, scale, 'overlay');
  }
  /** soft radial blob in region-local coordinates; radii in region-local units */
  blob(reg, s, t, rs, rt, color, a, wrap = false, clipReg = true) {
    const g = this.g;
    const draw = (ss) => {
      const [cx, cy] = this.pt(reg, ss, t);
      const rx = Math.max(0.5, this.sx(reg, rs)), ry = Math.max(0.5, this.sy(reg, rt));
      g.save();
      if (clipReg) { const [x, y, w, h] = this.rect(reg, 0, 0, 1, 1); g.beginPath(); g.rect(x, y, w, h); g.clip(); }
      g.translate(cx, cy); g.scale(1, ry / rx);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      const c = hexToRgb(color);
      gr.addColorStop(0, css(c[0], c[1], c[2], a)); gr.addColorStop(1, css(c[0], c[1], c[2], 0));
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
      g.restore();
    };
    draw(s);
    if (wrap) { if (s - rs < 0) draw(s + 1); if (s + rs > 1) draw(s - 1); }
  }
  band(reg, t0, t1, color, a = 1, s0 = 0, s1 = 1) { this.fill(reg, color, s0, t0, s1, t1, a); }
  line(reg, pts, color, width, a = 1, dash = null) {
    const g = this.g;
    g.save(); g.globalAlpha = a; g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
    if (dash) g.setLineDash(dash);
    g.beginPath();
    pts.forEach(([s, t], i) => { const [x, y] = this.pt(reg, s, t); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke(); g.restore();
  }
  dot(reg, s, t, r, color) { const g = this.g; const [x, y] = this.pt(reg, s, t); g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  /** painterly strokes: many short semi-transparent dabs following a direction field */
  strokes(reg, n, color, alpha, len, width, s0 = 0, t0 = 0, s1 = 1, t1 = 1, angle = 0, spread = 0.6, wrap = false) {
    const g = this.g, r = this.rng;
    g.save();
    const [x, y, w, h] = this.rect(reg, 0, 0, 1, 1);
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.lineCap = 'round';
    const c = hexToRgb(color);
    for (let i = 0; i < n; i++) {
      const s = s0 + r() * (s1 - s0), t = t0 + r() * (t1 - t0);
      const [px, py] = this.pt(reg, s, t);
      const a = angle + (r() - 0.5) * spread;
      const l = len * (0.5 + r());
      const k = 0.6 + r() * 0.8;
      g.strokeStyle = css(c[0] * k > 255 ? 255 : c[0] * k, c[1] * k > 255 ? 255 : c[1] * k, c[2] * k > 255 ? 255 : c[2] * k, alpha * (0.4 + r() * 0.6));
      g.lineWidth = width * (0.5 + r());
      g.beginPath(); g.moveTo(px - Math.cos(a) * l * 0.5, py - Math.sin(a) * l * 0.5);
      g.quadraticCurveTo(px + (r() - 0.5) * l * 0.3, py + (r() - 0.5) * l * 0.3, px + Math.cos(a) * l * 0.5, py + Math.sin(a) * l * 0.5);
      g.stroke();
      if (wrap && (s < 0.05 || s > 0.95)) {
        const dx = s < 0.05 ? this.sx(reg, 1) : -this.sx(reg, 1);
        g.beginPath(); g.moveTo(px + dx - Math.cos(a) * l * 0.5, py - Math.sin(a) * l * 0.5); g.lineTo(px + dx + Math.cos(a) * l * 0.5, py + Math.sin(a) * l * 0.5); g.stroke();
      }
    }
    g.restore();
  }
  text(reg, s, t, str, font, size, color, rot = 0) {
    const g = this.g;
    const [x, y] = this.pt(reg, s, t);
    g.save(); g.translate(x, y); if (rot) g.rotate(rot);
    g.font = `${size}px ${font || FONTS.body}, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color; g.fillText(str, 0, 0);
    g.restore();
  }
  /** polygon in region coords */
  poly(reg, pts, color, a = 1) {
    const g = this.g;
    g.save(); g.globalAlpha = a; g.fillStyle = color; g.beginPath();
    pts.forEach(([s, t], i) => { const [x, y] = this.pt(reg, s, t); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.closePath(); g.fill(); g.restore();
  }
}
