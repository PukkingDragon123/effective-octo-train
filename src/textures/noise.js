// Tileable procedural noise on typed arrays (pure functions, no DOM, deterministic).
// Everything wraps around the image edges so surfaces tile seamlessly.
//
//   fbm(w,h,{cells,octaves,gain,seed,mode})  periodic gradient-noise fBm  -> Float32Array ~[-1,1]
//   worley(w,h,{cells,seed,jitter})           tileable cellular noise      -> {f1,f2,id}
//   blur(field,w,h,r,passes)                  wrapped separable box blur
//   warp(field,w,h,wx,wy,amt)                 domain warp by two offset fields
//   sample(field,w,h,x,y)                     bilinear wrapped lookup
//   line / crack helpers draw into height fields with wrap.
import { makeRng } from '../core/math.js';

const TAU = Math.PI * 2;

/** Integer hash -> [0,1). */
export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function hash1(x, seed = 0) {
  return hash2(x, 0x9e37, seed);
}

const _cols = new Map();
function axisTable(n, cells) {
  // per-pixel lattice index / fraction / fade for one axis (cached: same dims reused a lot)
  const key = n * 100000 + cells;
  let t = _cols.get(key);
  if (t) return t;
  const i0 = new Int32Array(n), i1 = new Int32Array(n), f = new Float32Array(n), u = new Float32Array(n);
  for (let x = 0; x < n; x++) {
    const g = (x + 0.5) * cells / n;
    const i = Math.floor(g);
    const fx = g - i;
    i0[x] = i % cells;
    i1[x] = (i + 1) % cells;
    f[x] = fx;
    u[x] = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  }
  t = { i0, i1, f, u };
  if (_cols.size > 256) _cols.clear();
  _cols.set(key, t);
  return t;
}

function gradGrid(cx, cy, rng) {
  const g = new Float32Array(cx * cy * 2);
  for (let i = 0; i < cx * cy; i++) {
    const a = rng() * TAU;
    g[i * 2] = Math.cos(a);
    g[i * 2 + 1] = Math.sin(a);
  }
  return g;
}

/** Bilinear wrapped upsample of a tileable field sw×sh -> w×h. */
export function upsample(src, sw, sh, w, h, out = new Float32Array(w * h)) {
  const x0 = new Int32Array(w), x1 = new Int32Array(w), tx = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const g = ((x + 0.5) * sw) / w - 0.5;
    const f = Math.floor(g);
    tx[x] = g - f;
    x0[x] = (f + sw) % sw;
    x1[x] = (f + 1 + sw) % sw;
  }
  for (let y = 0; y < h; y++) {
    const g = ((y + 0.5) * sh) / h - 0.5;
    const f = Math.floor(g);
    const ty = g - f;
    const r0 = ((f + sh) % sh) * sw, r1 = ((f + 1 + sh) % sh) * sw;
    let i = y * w;
    for (let x = 0; x < w; x++, i++) {
      const a = src[r0 + x0[x]], b = src[r0 + x1[x]], c = src[r1 + x0[x]], d = src[r1 + x1[x]];
      const t = tx[x];
      const top = a + (b - a) * t;
      out[i] = top + (c + (d - c) * t - top) * ty;
    }
  }
  return out;
}

function perlinOctave(w, h, gx, gy, g, tmp) {
  const X = axisTable(w, gx), Y = axisTable(h, gy);
  const XI0 = X.i0, XI1 = X.i1, XF = X.f, XU = X.u;
  for (let y = 0; y < h; y++) {
    const j0 = Y.i0[y] * gx, j1 = Y.i1[y] * gx, fy = Y.f[y], v = Y.u[y], fy1 = fy - 1;
    let idx = y * w;
    for (let x = 0; x < w; x++, idx++) {
      const i0 = XI0[x], i1 = XI1[x], fx = XF[x], u = XU[x], fx1 = fx - 1;
      let k = (j0 + i0) << 1;
      const n00 = g[k] * fx + g[k + 1] * fy;
      k = (j0 + i1) << 1;
      const n10 = g[k] * fx1 + g[k + 1] * fy;
      k = (j1 + i0) << 1;
      const n01 = g[k] * fx + g[k + 1] * fy1;
      k = (j1 + i1) << 1;
      const n11 = g[k] * fx1 + g[k + 1] * fy1;
      const a = n00 + (n10 - n00) * u;
      tmp[idx] = (a + (n01 + (n11 - n01) * u - a) * v) * 1.45;
    }
  }
}

/**
 * Tileable fBm of periodic gradient noise.
 * opts: cells (number | [cx,cy], lattice cells across at octave 0), octaves=5, gain=0.5,
 *       lacunarity=2 (integer keeps tiling), seed, mode 'normal'|'ridged'|'turb', out (reuse array)
 * Low-frequency fields are evaluated at a reduced resolution and upsampled (invisible, much faster).
 * Returns Float32Array w*h roughly in [-1,1] (ridged/turb in [0,1]).
 */
export function fbm(w, h, opts = {}) {
  const cells = opts.cells ?? 4;
  let cx = Array.isArray(cells) ? cells[0] : cells;
  let cy = Array.isArray(cells) ? cells[1] : cells;
  const octaves = opts.octaves ?? 5;
  const gain = opts.gain ?? 0.5;
  const lac = opts.lacunarity ?? 2;
  const mode = opts.mode || 'normal';
  // pick evaluation resolution: >= 6 px per finest lattice cell
  const finest = Math.pow(lac, octaves - 1);
  let rw = w, rh = h;
  while (rw % 2 === 0 && rw / 2 >= cx * finest * 6 && rw > 32) rw /= 2;
  while (rh % 2 === 0 && rh / 2 >= cy * finest * 6 && rh > 32) rh /= 2;
  const rng = makeRng((opts.seed ?? 1) * 7919 + 13);
  const n = rw * rh;
  const acc = rw === w && rh === h && opts.out ? opts.out : new Float32Array(n);
  acc.fill(0);
  const tmp = new Float32Array(n);
  let amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const gx = Math.max(1, Math.round(cx)), gy = Math.max(1, Math.round(cy));
    perlinOctave(rw, rh, gx, gy, gradGrid(gx, gy, rng), tmp);
    if (mode === 'ridged') for (let i = 0; i < n; i++) acc[i] += (1 - Math.abs(tmp[i])) * amp;
    else if (mode === 'turb') for (let i = 0; i < n; i++) acc[i] += Math.abs(tmp[i]) * amp;
    else for (let i = 0; i < n; i++) acc[i] += tmp[i] * amp;
    norm += amp;
    amp *= gain;
    cx *= lac;
    cy *= lac;
  }
  const inv = 1 / norm;
  for (let i = 0; i < n; i++) acc[i] *= inv;
  if (rw === w && rh === h) return acc;
  return upsample(acc, rw, rh, w, h, opts.out || new Float32Array(w * h));
}

/**
 * Tileable cellular (Worley) noise. Distances in cell units.
 * opts: cells (n | [cx,cy]), seed, jitter=1 (0 = regular grid)
 * Returns { f1, f2, id (Int32 cell index), px, py (feature points, cell units), cx, cy }.
 */
export function worley(w, h, opts = {}) {
  const cells = opts.cells ?? 8;
  const cx = Array.isArray(cells) ? cells[0] : cells;
  const cy = Array.isArray(cells) ? cells[1] : cells;
  const jitter = opts.jitter ?? 1;
  const rng = makeRng((opts.seed ?? 1) * 104729 + 7);
  const n = cx * cy;
  const px = new Float32Array(n), py = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = 0.5 + (rng() - 0.5) * jitter;
    py[i] = 0.5 + (rng() - 0.5) * jitter;
  }
  const f1 = new Float32Array(w * h), f2 = new Float32Array(w * h), id = new Int32Array(w * h);
  const sx = cx / w, sy = cy / h;
  const NX = new Float32Array(9), NY = new Float32Array(9), NI = new Int32Array(9);
  const gxs = new Float32Array(w);
  for (let x = 0; x < w; x++) gxs[x] = (x + 0.5) * sx;
  for (let iy = 0; iy < cy; iy++) {
    const yA = Math.max(0, Math.ceil(iy / sy - 0.5)), yB = Math.min(h, Math.ceil((iy + 1) / sy - 0.5));
    for (let ix = 0; ix < cx; ix++) {
      const xA = Math.max(0, Math.ceil(ix / sx - 0.5)), xB = Math.min(w, Math.ceil((ix + 1) / sx - 0.5));
      let q = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const cyy = iy + oy;
        const wy = cyy < 0 ? cyy + cy : cyy >= cy ? cyy - cy : cyy;
        for (let ox = -1; ox <= 1; ox++, q++) {
          const cxx = ix + ox;
          const wx = cxx < 0 ? cxx + cx : cxx >= cx ? cxx - cx : cxx;
          const c = wy * cx + wx;
          NX[q] = cxx + px[c];
          NY[q] = cyy + py[c];
          NI[q] = c;
        }
      }
      for (let y = yA; y < yB; y++) {
        const gy = (y + 0.5) * sy;
        let i = y * w + xA;
        for (let x = xA; x < xB; x++, i++) {
          const gx = gxs[x];
          let d1 = 1e9, d2 = 1e9, best = 0;
          for (let k = 0; k < 9; k++) {
            const dx = NX[k] - gx, dy = NY[k] - gy;
            const d = dx * dx + dy * dy;
            if (d < d1) {
              d2 = d1;
              d1 = d;
              best = k;
            } else if (d < d2) d2 = d;
          }
          f1[i] = Math.sqrt(d1);
          f2[i] = Math.sqrt(d2);
          id[i] = NI[best];
        }
      }
    }
  }
  return { f1, f2, id, px, py, cx, cy };
}

/** Wrapped separable box blur (approximately gaussian with passes>=2). Returns a new array. */
export function blur(src, w, h, r = 2, passes = 2) {
  r = Math.max(1, Math.round(r));
  let a = Float32Array.from(src);
  let b = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    // horizontal a -> b
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[row + (((k % w) + w) % w)];
      for (let x = 0; x < w; x++) {
        b[row + x] = s * inv;
        let add = x + r + 1, rem = x - r;
        if (add >= w) add -= w;
        if (rem < 0) rem += w;
        s += a[row + add] - a[row + rem];
      }
    }
    // vertical b -> a (row-major running sums per column: cache friendly)
    const col = new Float32Array(w);
    for (let k = -r; k <= r; k++) {
      const row = (((k % h) + h) % h) * w;
      for (let x = 0; x < w; x++) col[x] += b[row + x];
    }
    for (let y = 0; y < h; y++) {
      let add = y + r + 1, rem = y - r;
      if (add >= h) add -= h;
      if (rem < 0) rem += h;
      const ro = y * w, ra = add * w, rr = rem * w;
      for (let x = 0; x < w; x++) {
        a[ro + x] = col[x] * inv;
        col[x] += b[ra + x] - b[rr + x];
      }
    }
  }
  return a;
}

/** Bilinear wrapped sample of a scalar field at pixel coords. */
export function sample(f, w, h, x, y) {
  x -= 0.5;
  y -= 0.5;
  const fx = Math.floor(x), fy = Math.floor(y);
  const tx = x - fx, ty = y - fy;
  const x0 = ((fx % w) + w) % w, y0 = ((fy % h) + h) % h;
  const x1 = (x0 + 1) % w, y1 = (y0 + 1) % h;
  const a = f[y0 * w + x0], b = f[y0 * w + x1], c = f[y1 * w + x0], d = f[y1 * w + x1];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/** Domain warp: out(x,y) = f(x + wx*amt, y + wy*amt) (amt in pixels). Works for Int32 id fields too (nearest). */
export function warp(f, w, h, wx, wy, amt, out = null, nearest = false) {
  out = out || new f.constructor(w * h);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const sx = x + 0.5 + wx[i] * amt, sy = y + 0.5 + wy[i] * amt;
      if (nearest) {
        const ix = ((Math.floor(sx) % w) + w) % w, iy = ((Math.floor(sy) % h) + h) % h;
        out[i] = f[iy * w + ix];
      } else out[i] = sample(f, w, h, sx, sy);
    }
  }
  return out;
}

/** Per-cell random table (for worley ids): returns Float32Array(n) of hash values. */
export function cellTable(n, seed) {
  const t = new Float32Array(n);
  for (let i = 0; i < n; i++) t[i] = hash1(i, seed);
  return t;
}

/** Remap a field in place to [0,1] by its min/max. */
export function normalize(f) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < f.length; i++) {
    const v = f[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const s = hi > lo ? 1 / (hi - lo) : 0;
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) * s;
  return f;
}

/**
 * Draw a soft capsule segment into a field with wrap. mode: 'max' | 'min' | 'add' | 'sub'.
 * profile: value at centre falling to 0 at radius r (smooth).
 */
export function line(f, w, h, x0, y0, x1, y1, r, val = 1, mode = 'max') {
  const minx = Math.floor(Math.min(x0, x1) - r - 1), maxx = Math.ceil(Math.max(x0, x1) + r + 1);
  const miny = Math.floor(Math.min(y0, y1) - r - 1), maxy = Math.ceil(Math.max(y0, y1) + r + 1);
  const dx = x1 - x0, dy = y1 - y0;
  const ll = dx * dx + dy * dy || 1e-6;
  const r2 = r * r;
  const wx0 = ((minx % w) + w) % w;
  for (let y = miny; y <= maxy; y++) {
    const wy = ((y % h) + h) % h;
    for (let x = minx, wx = wx0; x <= maxx; x++, wx = wx + 1 === w ? 0 : wx + 1) {
      const px = x + 0.5 - x0, py = y + 0.5 - y0;
      let t = (px * dx + py * dy) / ll;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - dx * t, ey = py - dy * t;
      const d2 = ex * ex + ey * ey;
      if (d2 >= r2) continue;
      const q = 1 - d2 / r2;
      const v = val * q * q;
      const i = wy * w + wx;
      if (mode === 'max') {
        if (v > f[i]) f[i] = v;
      } else if (mode === 'add') f[i] += v;
      else if (mode === 'sub') f[i] -= v;
      else if (mode === 'min') {
        const m = 1 - v;
        if (m < f[i]) f[i] = m;
      }
    }
  }
}

/** Soft disc stamp into a field (wrap). */
export function disc(f, w, h, cx, cy, r, val = 1, mode = 'max', hard = 0) {
  const r2 = r * r;
  const xa = Math.floor(cx - r), wx0 = ((xa % w) + w) % w;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    const wy = ((y % h) + h) % h;
    for (let x = xa, wx = wx0; x <= Math.ceil(cx + r); x++, wx = wx + 1 === w ? 0 : wx + 1) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;
      let q = 1 - d2 / r2;
      q = hard ? Math.min(1, q * (1 + hard * 8)) : q * q;
      const v = val * q;
      const i = wy * w + wx;
      if (mode === 'max') {
        if (v > f[i]) f[i] = v;
      } else if (mode === 'add') f[i] += v;
      else if (mode === 'sub') f[i] -= v;
      else if (mode === 'set') f[i] = f[i] + (val - f[i]) * q;
    }
  }
}

/**
 * Random-walk crack (wandering polyline with optional branches) drawn into field `f`.
 * opts: x,y start, angle, steps, step, wander, width, val, branch (prob), depth, mode
 */
export function crack(f, w, h, rng, o) {
  let x = o.x, y = o.y, a = o.angle ?? rng() * TAU;
  const steps = o.steps ?? 40, step = o.step ?? 4, wander = o.wander ?? 0.5;
  let width = o.width ?? 1.2;
  const taper = o.taper ?? 0.985;
  const depth = o.depth ?? 0;
  const vary = o.vary ?? 0;
  let wv = 1;
  for (let i = 0; i < steps; i++) {
    a += (rng() - 0.5) * wander;
    const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
    if (vary) wv += ((0.5 + rng() * 1.2) - wv) * 0.35 * vary;
    line(f, w, h, x, y, nx, ny, width * wv, o.val ?? 1, o.mode || 'max');
    x = nx;
    y = ny;
    width *= taper;
    if (width < 0.45) break;
    if (depth < 3 && rng() < (o.branch ?? 0.04)) {
      crack(f, w, h, rng, { ...o, x, y, angle: a + rng.sign() * (0.5 + rng() * 0.8), steps: Math.floor((steps - i) * 0.6), width: width * 0.7, depth: depth + 1 });
    }
  }
}

/** Fast blue-noise-ish threshold ordering (void-and-cluster, small sizes). Returns Float32Array ranks in [0,1). */
export function blueNoise(n = 64, seed = 3) {
  const N = n * n;
  const rng = makeRng(seed);
  const sigma = 1.9;
  const R = 6;
  const kern = new Float32Array((2 * R + 1) * (2 * R + 1));
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) kern[(y + R) * (2 * R + 1) + x + R] = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
  const energy = new Float32Array(N);
  const on = new Uint8Array(N);
  const rank = new Float32Array(N);
  const splat = (i, s) => {
    const px = i % n, py = (i / n) | 0;
    for (let y = -R; y <= R; y++) {
      const wy = (((py + y) % n) + n) % n;
      for (let x = -R; x <= R; x++) energy[wy * n + ((((px + x) % n) + n) % n)] += s * kern[(y + R) * (2 * R + 1) + x + R];
    }
  };
  // initial random binary pattern (~10%) then relax by swapping tightest cluster / largest void
  const init = Math.floor(N * 0.1);
  for (let k = 0; k < init; k++) {
    let i;
    do i = Math.floor(rng() * N);
    while (on[i]);
    on[i] = 1;
    splat(i, 1);
  }
  const tightest = () => {
    let best = -1, bv = -Infinity;
    for (let i = 0; i < N; i++) if (on[i] && energy[i] > bv) (bv = energy[i]), (best = i);
    return best;
  };
  const largestVoid = () => {
    let best = -1, bv = Infinity;
    for (let i = 0; i < N; i++) if (!on[i] && energy[i] < bv) (bv = energy[i]), (best = i);
    return best;
  };
  for (let it = 0; it < N; it++) {
    const t = tightest();
    on[t] = 0;
    splat(t, -1);
    const v = largestVoid();
    if (v === t) {
      on[t] = 1;
      splat(t, 1);
      break;
    }
    on[v] = 1;
    splat(v, 1);
  }
  // phase 1: remove points from the initial pattern, ranking downwards
  const proto = on.slice();
  const protoE = energy.slice();
  let ones = 0;
  for (let i = 0; i < N; i++) ones += on[i];
  for (let r = ones - 1; r >= 0; r--) {
    const t = tightest();
    on[t] = 0;
    splat(t, -1);
    rank[t] = r;
  }
  on.set(proto);
  energy.set(protoE);
  // phase 2/3: add points into voids, ranking upwards
  for (let r = ones; r < N; r++) {
    const v = largestVoid();
    on[v] = 1;
    splat(v, 1);
    rank[v] = r;
  }
  for (let i = 0; i < N; i++) rank[i] /= N;
  return rank;
}

/**
 * Chiselled facets: each Worley cell is a randomly tilted plane, giving crisp stone-like
 * planes meeting at ridges/grooves. Returns { h (height), edge (f2-f1), id }.
 * opts: cells, seed, slope=0.6, jitter=1, base=0.3 (random per-cell offset)
 */
export function facets(w, h, opts = {}) {
  const W = worley(w, h, { cells: opts.cells ?? 6, seed: opts.seed ?? 1, jitter: opts.jitter ?? 1 });
  const { cx, cy, px, py } = W;
  const n = cx * cy;
  const slope = opts.slope ?? 0.6, base = opts.base ?? 0.3;
  const sx = new Float32Array(n), sy = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    sx[i] = (hash1(i, (opts.seed ?? 1) * 3 + 1) * 2 - 1) * slope;
    sy[i] = (hash1(i, (opts.seed ?? 1) * 3 + 2) * 2 - 1) * slope;
    b[i] = hash1(i, (opts.seed ?? 1) * 3 + 3) * base;
  }
  const out = new Float32Array(w * h), edge = new Float32Array(w * h);
  const scx = cx / w, scy = cy / h;
  for (let y = 0, i = 0; y < h; y++) {
    const gy = (y + 0.5) * scy;
    for (let x = 0; x < w; x++, i++) {
      const c = W.id[i];
      const fx = (c % cx) + px[c], fy = ((c / cx) | 0) + py[c];
      let dx = (x + 0.5) * scx - fx, dy = gy - fy;
      if (dx > cx / 2) dx -= cx;
      else if (dx < -cx / 2) dx += cx;
      if (dy > cy / 2) dy -= cy;
      else if (dy < -cy / 2) dy += cy;
      out[i] = b[c] + sx[c] * dx + sy[c] * dy;
      edge[i] = W.f2[i] - W.f1[i];
    }
  }
  return { h: out, edge, id: W.id, cx, cy };
}

/** Vertical drips: values run DOWN the image from sources with per-column decay (tileable). */
export function drip(mask, w, h, seed = 1, decayLo = 0.97, decayHi = 0.995) {
  const out = Float32Array.from(mask);
  const dec = new Float32Array(w);
  for (let x = 0; x < w; x++) dec[x] = decayLo + (decayHi - decayLo) * hash1(x >> 1, seed);
  for (let pass = 0; pass < 2; pass++) {
    for (let x = 0; x < w; x++) {
      let v = out[(h - 1) * w + x];
      const d = dec[x];
      for (let y = 0; y < h; y++) {
        const i = y * w + x;
        v *= d;
        if (out[i] > v) v = out[i];
        else out[i] = v;
      }
    }
  }
  return out;
}

/**
 * Pseudo-calligraphic glyph (reads as a brushed Chinese character from a distance) drawn
 * into field f. cx,cy centre, size px. Deterministic per rng.
 */
export function pseudoGlyph(f, w, h, cx, cy, size, rng, val = 1) {
  const s = size / 2;
  const g = (v) => Math.round(v * 4) / 4; // snap to quarter grid
  const stroke = (x0, y0, x1, y1, wd) => {
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const taper = 0.55 + 0.45 * Math.sin(Math.PI * (t0 + 0.08));
      line(f, w, h, cx + (x0 + (x1 - x0) * t0) * s, cy + (y0 + (y1 - y0) * t0) * s, cx + (x0 + (x1 - x0) * t1) * s, cy + (y0 + (y1 - y0) * t1) * s, wd * taper * s, val, 'max');
    }
  };
  const wd = 0.085 + rng() * 0.03;
  const split = rng();
  const boxes = split < 0.4 ? [[-0.85, -0.85, -0.15, 0.85], [0.05, -0.85, 0.85, 0.85]] : split < 0.7 ? [[-0.85, -0.85, 0.85, -0.1], [-0.85, 0.1, 0.85, 0.85]] : [[-0.85, -0.85, 0.85, 0.85]];
  for (const [ax, ay, bx, by] of boxes) {
    const nh = 1 + Math.floor(rng() * 3), nv = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < nh; i++) {
      const y = g(ay + (by - ay) * ((i + 0.5) / nh));
      const xa = ax + rng() * 0.15, xb = bx - rng() * 0.15;
      stroke(xa, y + (rng() - 0.5) * 0.08, xb, y - 0.04 - rng() * 0.05, wd);
    }
    for (let i = 0; i < nv; i++) {
      const x = g(ax + (bx - ax) * ((i + 0.5) / nv) + (rng() - 0.5) * 0.2);
      stroke(x, ay + rng() * 0.1, x + (rng() - 0.5) * 0.05, by - rng() * 0.1, wd * 1.05);
    }
    if (rng() < 0.7) {
      // sweeping diagonal (pie / na)
      const x0 = (ax + bx) / 2, y0 = (ay + by) / 2;
      stroke(x0, y0, x0 - (bx - ax) * 0.45, by, wd);
      if (rng() < 0.6) stroke(x0, y0, x0 + (bx - ax) * 0.45, by, wd * 1.2);
    }
    if (rng() < 0.5) {
      // dots
      const x = ax + (bx - ax) * rng(), y = ay + (by - ay) * 0.15;
      stroke(x, y, x + 0.08, y + 0.12, wd * 1.2);
    }
  }
}
