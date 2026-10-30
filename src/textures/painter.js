// Painter utilities: float RGBA images on typed arrays, palette mapping, brush-stroke
// stamping (sample-and-smear strokes with bristle streaks), baked painterly light from
// height, normal / roughness map packing. Pure functions (no DOM) so generators can
// later run inside a worker.
import { makeRng } from '../core/math.js';
import { blur, hash1, fbm, warp } from './noise.js';

/** Float RGBA image (values 0..1, sRGB-ish "paint" space). Row 0 = TOP of the image. */
export class Img {
  constructor(w, h, fill = null) {
    this.w = w;
    this.h = h;
    this.d = new Float32Array(w * h * 4);
    if (fill) this.fill(fill);
    else for (let i = 3; i < this.d.length; i += 4) this.d[i] = 1;
  }
  fill(c) {
    const d = this.d;
    const a = c.length > 3 ? c[3] : 1;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = a;
    }
    return this;
  }
}

const _hexCache = new Map();
/** '#rrggbb' | 0xrrggbb -> [r,g,b] in 0..1 */
export function rgb(c) {
  if (Array.isArray(c)) return c;
  let v = _hexCache.get(c);
  if (v) return v;
  const n = typeof c === 'number' ? c : parseInt(String(c).replace('#', ''), 16);
  v = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  _hexCache.set(c, v);
  return v;
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const sstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Build a 256-entry gradient lookup from stops [[t, color], ...] (t ascending in 0..1).
 * Returns Float32Array(256*3).
 */
export function ramp(stops) {
  const lut = new Float32Array(256 * 3);
  const s = stops.map(([t, c]) => [t, rgb(c)]);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < s.length - 2 && t > s[k + 1][0]) k++;
    const [t0, c0] = s[k], [t1, c1] = s[Math.min(k + 1, s.length - 1)];
    let f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    f = f * f * (3 - 2 * f);
    lut[i * 3] = c0[0] + (c1[0] - c0[0]) * f;
    lut[i * 3 + 1] = c0[1] + (c1[1] - c0[1]) * f;
    lut[i * 3 + 2] = c0[2] + (c1[2] - c0[2]) * f;
  }
  return lut;
}

/** Paint img with a gradient map of field (expected 0..1). Optional mask/opacity blends over existing. */
export function gradientMap(img, field, stops, mask = null, opacity = 1) {
  const lut = Array.isArray(stops) ? ramp(stops) : stops;
  const d = img.d;
  for (let i = 0, n = img.w * img.h; i < n; i++) {
    let t = field[i];
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const k = ((t * 255 + 0.5) | 0) * 3;
    const a = (mask ? mask[i] : 1) * opacity;
    if (a <= 0) continue;
    const j = i * 4;
    d[j] += (lut[k] - d[j]) * a;
    d[j + 1] += (lut[k + 1] - d[j + 1]) * a;
    d[j + 2] += (lut[k + 2] - d[j + 2]) * a;
  }
  return img;
}

/** Blend a flat colour over img through a mask (0..1). mode: normal | multiply | screen | add | overlay */
export function tint(img, mask, color, opacity = 1, mode = 'normal') {
  const c = rgb(color);
  const d = img.d;
  const n = img.w * img.h;
  const c0 = c[0], c1 = c[1], c2 = c[2];
  const arr = mask && typeof mask !== 'number' ? mask : null;
  const constA = (typeof mask === 'number' ? mask : 1) * opacity;
  if (mode === 'normal') {
    for (let i = 0; i < n; i++) {
      let a = arr ? arr[i] * opacity : constA;
      if (a <= 0) continue;
      if (a > 1) a = 1;
      const j = i * 4;
      d[j] += (c0 - d[j]) * a;
      d[j + 1] += (c1 - d[j + 1]) * a;
      d[j + 2] += (c2 - d[j + 2]) * a;
    }
    return img;
  }
  for (let i = 0; i < n; i++) {
    let a = arr ? arr[i] * opacity : constA;
    if (a <= 0) continue;
    if (a > 1) a = 1;
    const j = i * 4;
    for (let k = 0; k < 3; k++) {
      const s = d[j + k];
      const ck = c[k];
      let t;
      if (mode === 'multiply') t = s * ck;
      else if (mode === 'screen') t = 1 - (1 - s) * (1 - ck);
      else if (mode === 'add') t = s + ck;
      else t = s < 0.5 ? 2 * s * ck : 1 - 2 * (1 - s) * (1 - ck);
      d[j + k] = s + (t - s) * a;
    }
  }
  return img;
}

/** Multiply brightness by (1 + amt*field) (field ~[-1,1]); optional hue-ish warm/cool shift. */
export function modulate(img, field, amt = 0.2, warm = 0) {
  const d = img.d;
  for (let i = 0, n = img.w * img.h; i < n; i++) {
    const f = field[i];
    const m = 1 + amt * f;
    const j = i * 4;
    d[j] *= m * (1 + warm * f);
    d[j + 1] *= m;
    d[j + 2] *= m * (1 - warm * f);
  }
  return img;
}

/** Saturation / contrast / brightness / gamma adjust in place. */
export function adjust(img, o = {}) {
  const sat = o.saturation ?? 1, con = o.contrast ?? 1, bri = o.brightness ?? 1, gam = o.gamma ?? 1, pivot = o.pivot ?? 0.45;
  const d = img.d;
  for (let j = 0; j < d.length; j += 4) {
    let r = d[j], g = d[j + 1], b = d[j + 2];
    const l = r * 0.3 + g * 0.55 + b * 0.15;
    r = l + (r - l) * sat;
    g = l + (g - l) * sat;
    b = l + (b - l) * sat;
    r = (r - pivot) * con + pivot;
    g = (g - pivot) * con + pivot;
    b = (b - pivot) * con + pivot;
    r *= bri;
    g *= bri;
    b *= bri;
    if (gam !== 1) {
      r = Math.pow(Math.max(0, r), gam);
      g = Math.pow(Math.max(0, g), gam);
      b = Math.pow(Math.max(0, b), gam);
    }
    d[j] = r;
    d[j + 1] = g;
    d[j + 2] = b;
  }
  return img;
}

const _bristle = new Float32Array(32);
/**
 * Hand-painted brush strokes. Each stroke samples the image colour under it (smear), jitters
 * it slightly and stamps a tapered, slightly curved stroke with bristle streaks. Wraps at the
 * edges so tiling survives.
 *
 * opts: seed, count (or coverage=1), len:[a,b], width:[a,b], opacity=0.5,
 *   angle: number | (x,y,rng)=>radians, angleJitter=0.3, curve=0.2, bristles=7, bristleAmt=0.55,
 *   mask: Float32Array (0..1 multiplies opacity & skips), valueJitter=0.05, warmJitter=0.02,
 *   color: (x,y,rng,out)=>void (override sampled colour), smear=0.35 (sample from the stroke tail),
 *   height: Float32Array (impasto: bristle ridges added), heightAmt=0.04, alphaOnly (only where alpha>0.5)
 */
export function strokes(img, o = {}) {
  const { w, h, d } = img;
  const rng = makeRng((o.seed ?? 1) * 31 + 5);
  const len = o.len || [10, 24], wid = o.width || [3, 7];
  const avgArea = ((len[0] + len[1]) / 2) * ((wid[0] + wid[1]) / 2) * 0.7;
  const count = o.count ?? Math.round((w * h * (o.coverage ?? 1)) / avgArea);
  const opacity = o.opacity ?? 0.5;
  const angleJ = o.angleJitter ?? 0.3;
  const curveAmt = o.curve ?? 0.2;
  const nb = Math.min(32, o.bristles ?? 7);
  const bAmt = o.bristleAmt ?? 0.55;
  const mask = o.mask || null;
  const vj = o.valueJitter ?? 0.05, wj = o.warmJitter ?? 0.02;
  const smear = o.smear ?? 0.35;
  const H = o.height || null, hAmt = o.heightAmt ?? 0.04;
  const colorFn = o.color || null;
  const alphaOnly = !!o.alphaOnly;
  const col = [0, 0, 0];
  const gridN = Math.max(1, Math.round(Math.sqrt(count)));
  for (let n = 0; n < count; n++) {
    // stratified jittered positions for even coverage
    const cell = n % (gridN * gridN);
    const x = ((cell % gridN) + rng()) * (w / gridN);
    const y = (((cell / gridN) | 0) + rng()) * (h / gridN);
    const ix = ((x | 0) % w + w) % w, iy = ((y | 0) % h + h) % h;
    const m = mask ? mask[iy * w + ix] : 1;
    if (m <= 0.02 || rng() > m * 1.5) continue;
    if (alphaOnly && d[(iy * w + ix) * 4 + 3] < 0.5) continue;
    let ang = typeof o.angle === 'function' ? o.angle(x, y, rng) : (o.angle ?? rng() * Math.PI);
    ang += (rng() - 0.5) * 2 * angleJ;
    const L = len[0] + (len[1] - len[0]) * rng();
    const W = wid[0] + (wid[1] - wid[0]) * rng();
    const ca = Math.cos(ang), sa = Math.sin(ang);
    // colour: sample the tail (drag) of the stroke
    if (colorFn) colorFn(x, y, rng, col);
    else {
      const sx = x - ca * L * smear, sy = y - sa * L * smear;
      const jx = ((Math.round(sx) % w) + w) % w, jy = ((Math.round(sy) % h) + h) % h;
      const k = (jy * w + jx) * 4;
      const k2 = (iy * w + ix) * 4;
      col[0] = (d[k] + d[k2]) * 0.5;
      col[1] = (d[k + 1] + d[k2 + 1]) * 0.5;
      col[2] = (d[k + 2] + d[k2 + 2]) * 0.5;
    }
    const vjit = 1 + (rng() - 0.5) * 2 * vj;
    const wjit = (rng() - 0.5) * 2 * wj;
    const cr = col[0] * vjit * (1 + wjit), cg = col[1] * vjit, cb = col[2] * vjit * (1 - wjit);
    for (let b = 0; b < nb; b++) _bristle[b] = rng();
    const curve = (rng() - 0.5) * 2 * curveAmt;
    const hl = L * 0.5, hw = W * 0.5;
    const acx = ca < 0 ? -ca : ca, asy = sa < 0 ? -sa : sa;
    const ex = acx * hl + asy * hw + 1 + Math.abs(curve) * hl * asy, ey = asy * hl + acx * hw + 1 + Math.abs(curve) * hl * acx;
    const x0 = Math.floor(x - ex), x1 = Math.ceil(x + ex), y0 = Math.floor(y - ey), y1 = Math.ceil(y + ey);
    const op = opacity * (m > 1 ? 1 : m);
    const invHl = 1 / hl, invHw = 1 / hw;
    const wx0 = ((x0 % w) + w) % w;
    for (let py = y0; py <= y1; py++) {
      const wy = ((py % h) + h) % h;
      const ry = py + 0.5 - y;
      const row = wy * w;
      for (let px = x0, wx = wx0; px <= x1; px++, wx = wx + 1 === w ? 0 : wx + 1) {
        const rx = px + 0.5 - x;
        const u = rx * ca + ry * sa;
        let au = u * invHl;
        if (au <= -1 || au >= 1) continue;
        const v = -rx * sa + ry * ca - curve * u * u * invHl;
        au = au < 0 ? -au : au;
        const lim = 1 - 0.55 * au * au * au;
        let av = v * invHw;
        av = av < 0 ? -av : av;
        if (av >= lim) continue;
        const e = av / lim;
        let a = op * (1 - e * e * e * e) * (1 - au * au * au * au * au * au);
        const bi = ((v * invHw * 0.5 + 0.5) * nb) | 0;
        const br = _bristle[bi < 0 ? 0 : bi >= nb ? nb - 1 : bi];
        a *= 1 - bAmt + bAmt * br;
        // dry-brush break-up toward the stroke's end
        if (u > 0 && br < u * invHl * 0.9) a *= 0.35;
        const i = row + wx;
        const j = i * 4;
        if (alphaOnly && d[j + 3] < 0.5) continue;
        d[j] += (cr - d[j]) * a;
        d[j + 1] += (cg - d[j + 1]) * a;
        d[j + 2] += (cb - d[j + 2]) * a;
        if (H) H[i] += a * hAmt * (br - 0.35);
      }
    }
  }
  return img;
}

/**
 * Bake soft painterly light + cavity occlusion from a height field into the colour.
 * opts: light=[-0.5,-0.7,0.6] (x right, y DOWN in image space, z out), strength=0.25, bump=4,
 *       ao=0.5, aoRadius=4, edge=0.15 (convex highlight), mask
 */
export function shade(img, H, o = {}) {
  const { w, h, d } = img;
  const L = o.light || [-0.45, -0.65, 0.62];
  const ll = Math.hypot(L[0], L[1], L[2]);
  const lx = L[0] / ll, ly = L[1] / ll, lz = L[2] / ll;
  const st = o.strength ?? 0.25, bump = o.bump ?? 4, ao = o.ao ?? 0.5, edge = o.edge ?? 0.15;
  const aoK = o.aoScale ?? 6;
  const B = ao || edge ? blur(H, w, h, o.aoRadius ?? 4, 2) : null;
  const flat = lz; // brightness of a flat surface
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w, yp = ((y + 1) % h) * w, yr = y * w;
    for (let x = 0; x < w; x++) {
      const xm = x === 0 ? w - 1 : x - 1, xp = x === w - 1 ? 0 : x + 1;
      const i = yr + x;
      const dx = (H[yr + xp] - H[yr + xm]) * 0.5 * bump;
      const dy = (H[yp + x] - H[ym + x]) * 0.5 * bump;
      // image-space normal (y down)
      const nl = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const ndl = (-dx * lx - dy * ly + lz) * nl;
      let m = 1 + st * (ndl - flat) * 2;
      if (B) {
        const cav = (H[i] - B[i]) * aoK;
        if (cav < 0) m *= 1 + ao * Math.max(-1, cav);
        else m *= 1 + edge * Math.min(1, cav);
      }
      if (o.mask) m = 1 + (m - 1) * o.mask[i];
      const j = i * 4;
      d[j] *= m;
      d[j + 1] *= m;
      d[j + 2] *= m * (m < 1 ? 1.02 : 0.99); // shadows slightly cooler
    }
  }
  return img;
}

/** Tangent-space normal map (OpenGL convention, +Y = up in UV space) from a height field. */
export function normalMap(H, w, h, strength = 4) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w, yp = ((y + 1) % h) * w, yr = y * w;
    for (let x = 0; x < w; x++) {
      const xm = x === 0 ? w - 1 : x - 1, xp = x === w - 1 ? 0 : x + 1;
      // sobel
      const tl = H[ym + xm], t = H[ym + x], tr = H[ym + xp];
      const l = H[yr + xm], r = H[yr + xp];
      const bl = H[yp + xm], b = H[yp + x], br = H[yp + xp];
      const dx = ((tr + 2 * r + br) - (tl + 2 * l + bl)) * 0.125 * strength;
      const dy = ((bl + 2 * b + br) - (tl + 2 * t + tr)) * 0.125 * strength;
      // buffer y grows downward = -v  ->  n = (-dh/du, -dh/dv, 1) = (-dx, +dy, 1)
      const nx = -dx, ny = dy;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const j = (yr + x) * 4;
      out[j] = (nx * inv * 0.5 + 0.5) * 255 + 0.5;
      out[j + 1] = (ny * inv * 0.5 + 0.5) * 255 + 0.5;
      out[j + 2] = (inv * 0.5 + 0.5) * 255 + 0.5;
      out[j + 3] = 255;
    }
  }
  return out;
}

/** Scalar field (lo..hi -> 0..255) to grayscale RGBA bytes. */
export function grayBytes(f, w, h, lo = 0, hi = 1) {
  const out = new Uint8Array(w * h * 4);
  const s = 255 / (hi - lo);
  for (let i = 0; i < w * h; i++) {
    let v = (f[i] - lo) * s;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    const j = i * 4;
    out[j] = out[j + 1] = out[j + 2] = v + 0.5;
    out[j + 3] = 255;
  }
  return out;
}

/** Pack up to 4 fields into RGBA bytes (data texture), each 0..1. */
export function packBytes(w, h, r, g, b, a) {
  const out = new Uint8Array(w * h * 4);
  const ch = [r, g, b, a];
  for (let c = 0; c < 4; c++) {
    const f = ch[c];
    for (let i = 0; i < w * h; i++) {
      let v = f ? (typeof f === 'number' ? f : f[i]) : c === 3 ? 1 : 0;
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      out[i * 4 + c] = v * 255 + 0.5;
    }
  }
  return out;
}

/** Float image -> RGBA bytes (clamped). */
export function imgBytes(img) {
  const d = img.d;
  const out = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) {
    let v = d[i] * 255 + 0.5;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

/**
 * For alpha-tested cards: replace colour where alpha is ~0 by the alpha-weighted blur of
 * neighbouring colours so mipmaps don't pull in dark fringes. Done at 1/4 resolution.
 */
export function bleed(img, radius = 6) {
  const { w, h, d } = img;
  const f = 4;
  const lw = Math.max(1, (w / f) | 0), lh = Math.max(1, (h / f) | 0);
  const ln = lw * lh;
  const A = new Float32Array(ln), R = new Float32Array(ln), G = new Float32Array(ln), B = new Float32Array(ln);
  let tr = 0, tg = 0, tb = 0, ta = 0;
  for (let y = 0; y < h; y++) {
    const ly = Math.min(lh - 1, (y / f) | 0);
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4;
      const a = d[j + 3];
      if (a <= 0.02) continue;
      const li = ly * lw + Math.min(lw - 1, (x / f) | 0);
      A[li] += a;
      R[li] += d[j] * a;
      G[li] += d[j + 1] * a;
      B[li] += d[j + 2] * a;
    }
  }
  for (let i = 0; i < ln; i++) {
    tr += R[i];
    tg += G[i];
    tb += B[i];
    ta += A[i];
  }
  const r = Math.max(1, Math.round(radius / f));
  const ab = blur(A, lw, lh, r, 2), rb = blur(R, lw, lh, r, 2), gb = blur(G, lw, lh, r, 2), bb = blur(B, lw, lh, r, 2);
  const avg = ta > 0 ? [tr / ta, tg / ta, tb / ta] : [0.3, 0.35, 0.25];
  for (let y = 0; y < h; y++) {
    const ly = Math.min(lh - 1, (y / f) | 0);
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4;
      const a = d[j + 3];
      if (a >= 0.99) continue;
      const li = ly * lw + Math.min(lw - 1, (x / f) | 0);
      const s = ab[li];
      let cr, cg, cb;
      if (s > 1e-3) {
        const k = Math.min(1, s * 4);
        cr = (rb[li] / s) * k + avg[0] * (1 - k);
        cg = (gb[li] / s) * k + avg[1] * (1 - k);
        cb = (bb[li] / s) * k + avg[2] * (1 - k);
      } else {
        cr = avg[0];
        cg = avg[1];
        cb = avg[2];
      }
      d[j] = cr + (d[j] - cr) * a;
      d[j + 1] = cg + (d[j + 1] - cg) * a;
      d[j + 2] = cb + (d[j + 2] - cb) * a;
    }
  }
  return img;
}

/** Deterministic per-index jitter helper. */
export const jit = (i, seed = 0) => hash1(i, seed) * 2 - 1;

/** Field helpers */
export function mapField(f, fn) {
  for (let i = 0; i < f.length; i++) f[i] = fn(f[i], i);
  return f;
}
export function addFields(out, a, ka, b, kb, c = null, kc = 0) {
  for (let i = 0; i < out.length; i++) out[i] = a[i] * ka + (b ? b[i] * kb : 0) + (c ? c[i] * kc : 0);
  return out;
}

/** Vertical streaks (rain/water staining running DOWN the image). Returns field 0..1, tileable. */
export function streaks(w, h, seed, o = {}) {
  const rng = makeRng(seed * 17 + 3);
  const f = new Float32Array(w * h);
  const n = o.count ?? Math.round(w / 6);
  for (let k = 0; k < n; k++) {
    const x = rng() * w;
    const y = rng() * h;
    const L = (o.len ?? [0.2, 0.7])[0] * h + rng() * ((o.len ?? [0.2, 0.7])[1] - (o.len ?? [0.2, 0.7])[0]) * h;
    const W = (o.width ?? [1, 4])[0] + rng() * ((o.width ?? [1, 4])[1] - (o.width ?? [1, 4])[0]);
    const s = (o.strength ?? 1) * (0.4 + rng() * 0.6);
    const wob = rng() * 100;
    for (let t = 0; t < L; t++) {
      const yy = (((y + t) | 0) % h + h) % h;
      const fade = (1 - t / L) * Math.min(1, t / 6);
      const xx = x + Math.sin((t + wob) * 0.05) * 1.2;
      const ww = W * (0.6 + 0.4 * (1 - t / L));
      for (let dx = -Math.ceil(ww); dx <= Math.ceil(ww); dx++) {
        const q = 1 - Math.abs(dx) / (ww + 0.5);
        if (q <= 0) continue;
        const i = yy * w + ((((xx + dx) | 0) % w) + w) % w;
        const v = s * fade * q;
        if (v > f[i]) f[i] = v;
      }
    }
  }
  return f;
}

/** Raw texture records returned by generators (turned into THREE textures by index.js). */
export function colorOut(img, o = {}) {
  return { w: img.w, h: img.h, data: imgBytes(img), srgb: true, alpha: !!o.alpha, wrap: o.wrap || 'repeat', meta: o.meta };
}
export function dataOut(bytes, w, h, o = {}) {
  return { w, h, data: bytes, srgb: false, alpha: !!o.alpha, wrap: o.wrap || 'repeat', meta: o.meta };
}

/** smoothstep-mapped copy of a field. */
export function smask(src, lo, hi, mul = 1) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = sstep(lo, hi, src[i]) * mul;
  return out;
}

/** Combine fields: out[i] = fn(i). */
export function field(n, fn) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i);
  return out;
}

/** Lichen / stain blotches: soft discs with ragged edges. Returns mask 0..1. */
export function blotches(w, h, rng, count, rLo, rHi, raggedField, hard = 0.6) {
  const m = new Float32Array(w * h);
  for (let c = 0; c < count; c++) {
    const r = rLo + Math.pow(rng(), 2) * (rHi - rLo);
    const cx = rng() * w, cy = rng() * h;
    const r2 = r * r;
    const val = 0.6 + rng() * 0.4;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      const wy = ((y % h) + h) % h;
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const i = wy * w + (((x % w) + w) % w);
        const q = 1 - Math.sqrt(d2) / r + (raggedField ? raggedField[i] * 0.5 : 0);
        const v = val * sstep(0, 1 - hard * 0.9, q);
        if (v > m[i]) m[i] = v;
      }
    }
  }
  return m;
}

/** Value of `field` at quantile q (0..1), from a strided subsample (deterministic). */
export function quantile(f, q) {
  const step = Math.max(1, Math.floor(f.length / 4096));
  const s = [];
  for (let i = 0; i < f.length; i += step) s.push(f[i]);
  s.sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))];
}

/**
 * Organic patch mask (lichen, stains, moss colonies, peeled areas): domain-warped fBm
 * thresholded at a quantile so `coverage` is the real covered fraction. Edges are ragged at
 * several scales instead of the round discs of `blotches`.
 * opts: seed, cells=5, coverage=0.2, soft=0.04 (edge width in field units), warp=0.5,
 *   detail=0.35 (fine edge raggedness), bias (Float32Array added before thresholding, e.g. ridge tops)
 * Returns { m: mask 0..1, rim: thin band just inside the edge, v: raw field }.
 */
export function organic(w, h, o = {}) {
  const n = w * h;
  const seed = o.seed ?? 1;
  const cells = o.cells ?? 5;
  const base = fbm(w, h, { cells, octaves: o.octaves ?? 4, seed, gain: 0.55 });
  const wx = fbm(w, h, { cells: Math.max(1, Math.round(cells * 0.8)), octaves: 3, seed: seed + 1 });
  const wy = fbm(w, h, { cells: Math.max(1, Math.round(cells * 0.8)), octaves: 3, seed: seed + 2 });
  const v = warp(base, w, h, wx, wy, ((o.warp ?? 0.5) * w) / cells);
  const det = fbm(w, h, { cells: cells * 8, octaves: 2, seed: seed + 3 });
  const dAmt = o.detail ?? 0.35;
  const bias = o.bias || null;
  for (let i = 0; i < n; i++) v[i] += det[i] * dAmt * 0.25 + (bias ? bias[i] : 0);
  const thr = quantile(v, 1 - (o.coverage ?? 0.2));
  const soft = o.soft ?? 0.04;
  const m = new Float32Array(n), rim = new Float32Array(n);
  const rw = soft * 4;
  for (let i = 0; i < n; i++) {
    const d = v[i] - thr;
    m[i] = sstep(-soft * 0.5, soft * 0.5, d);
    rim[i] = m[i] * (1 - sstep(0, rw, d));
  }
  return { m, rim, v };
}
