// Foliage atlases (RGBA, clean alpha for alphaTest) painted leaf by leaf: curved midribs,
// pinnate / parallel veins, torn banana blades, dry edges, insect holes, painterly strokes
// following the veins. FOLIAGE_ATLAS documents every cell (uv rects, v up like three.js).
import { makeRng } from '../core/math.js';
import { fbm, sample } from './noise.js';
import { Img, rgb, strokes, normalMap, colorOut, dataOut, bleed, sstep, shade } from './painter.js';

const TAU = Math.PI * 2;
const UP = -Math.PI / 2; // image-space angle pointing up

/**
 * Atlas layouts. uv = [u0, v0, u1, v1] (three.js uv space, v up). base/tip = where the
 * stem attaches and where the leaf points (uv). Cells with tileU / tileV repeat seamlessly
 * along that axis inside their rect (grass rows tile in u; vines tile in v).
 */
export const FOLIAGE_ATLAS = {
  leaf_tropical: {
    size: [1024, 1024],
    cells: [
      { name: 'broad', uv: [0, 0.5, 0.5, 1], base: [0.25, 0.51], tip: [0.25, 0.99], kind: 'single leaf, drip tip' },
      { name: 'heart', uv: [0.5, 0.5, 1, 1], base: [0.75, 0.6], tip: [0.75, 0.99], kind: 'taro / philodendron, petiole notch at base' },
      { name: 'spray', uv: [0, 0, 0.5, 0.5], base: [0.25, 0.01], tip: [0.25, 0.49], kind: 'twig with alternate leaves (canopy card)' },
      { name: 'cluster', uv: [0.5, 0, 1, 0.5], base: [0.75, 0.01], tip: [0.75, 0.49], kind: 'dense leaf cluster (canopy card)' },
    ],
  },
  leaf_banana: {
    size: [1024, 1024],
    cells: [
      { name: 'fresh', uv: [0, 0, 0.5, 1], base: [0.25, 0.0], tip: [0.25, 1], kind: 'whole blade, few tears' },
      { name: 'torn', uv: [0.5, 0, 1, 1], base: [0.75, 0.0], tip: [0.75, 1], kind: 'shredded old blade, browning edges' },
    ],
  },
  leaf_fern: {
    size: [1024, 1024],
    cells: [
      { name: 'frond', uv: [0, 0, 0.5, 1], base: [0.25, 0.0], tip: [0.25, 1], kind: 'pinnate frond, arching' },
      { name: 'frond_lacy', uv: [0.5, 0, 1, 1], base: [0.75, 0.0], tip: [0.75, 1], kind: 'bipinnate frond' },
    ],
  },
  leaf_bamboo: {
    size: [1024, 1024],
    cells: [
      { name: 'fan', uv: [0, 0.5, 0.5, 1], base: [0.03, 0.55], tip: [0.45, 0.95], kind: 'twig with fan of leaves' },
      { name: 'droop', uv: [0.5, 0.5, 1, 1], base: [0.53, 0.97], tip: [0.95, 0.55], kind: 'drooping twig' },
      { name: 'spray', uv: [0, 0, 0.5, 0.5], base: [0.25, 0.02], tip: [0.25, 0.48], kind: 'upright spray' },
      { name: 'sparse', uv: [0.5, 0, 1, 0.5], base: [0.52, 0.25], tip: [0.98, 0.25], kind: 'sparse side twig' },
    ],
  },
  leaf_palm: {
    size: [1024, 1024],
    cells: [
      { name: 'frond', uv: [0, 0, 0.5, 1], base: [0.25, 0.0], tip: [0.25, 1], kind: 'green pinnate frond (seen from above)' },
      { name: 'frond_dry', uv: [0.5, 0, 1, 1], base: [0.75, 1], tip: [0.75, 0.0], kind: 'dead hanging frond (base at top)' },
    ],
  },
  grass_card: {
    size: [1024, 1024],
    cells: [
      { name: 'tall', uv: [0, 0.5, 1, 1], base: [0.5, 0.5], tip: [0.5, 1], tileU: true, kind: 'tall wild grass with seed heads, ground at bottom edge' },
      { name: 'short', uv: [0, 0, 1, 0.5], base: [0.5, 0], tip: [0.5, 0.5], tileU: true, kind: 'short tufty grass and weeds' },
    ],
  },
  vine: {
    size: [1024, 1024],
    cells: [
      { name: 'leafy', uv: [0, 0, 0.5, 1], base: [0.25, 1], tip: [0.25, 0], tileV: true, kind: 'hanging vine with heart leaves' },
      { name: 'liana', uv: [0.5, 0, 1, 1], base: [0.75, 1], tip: [0.75, 0], tileV: true, kind: 'bare lianas / aerial roots with sparse leaves' },
    ],
  },
};

// ---------------------------------------------------------------------------
// Atlas painter
// ---------------------------------------------------------------------------
function atlas(w, h, seed) {
  const img = new Img(w, h, [0.2, 0.3, 0.15, 0]);
  return {
    w, h, img,
    H: new Float32Array(w * h),
    ang: new Float32Array(w * h),
    N: fbm(w, h, { cells: 8, octaves: 3, seed }),
    N2: fbm(w, h, { cells: 48, octaves: 1, seed: seed + 1 }),
  };
}

const SHAPES = {
  ovate: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.8) * (t > 0.86 ? 1 - (t - 0.86) * 2.5 : 1),
  lance: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 1.25),
  oblong: (t) => Math.sqrt(Math.min(1, t * 9)) * Math.pow(Math.min(1, (1 - t) * 3.2), 0.55),
  linear: (t) => Math.pow(1 - t, 0.85) * Math.min(1, t * 12 + 0.25),
  bamboo: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.5)), 1.3) * Math.min(1, t * 7),
  pinna: (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 0.9),
  heart: (t) => (t < 0 ? Math.sqrt(Math.max(0, 1 - Math.pow(t / 0.28, 2))) * 0.9 : Math.pow(Math.sin(Math.PI * (0.5 + 0.5 * Math.pow(t, 0.9))), 0.7) * (1 - 0.1 * t)),
};

function mixc(a, b, t, out) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

/**
 * Rasterise one leaf. o: { x, y (base px), angle, len, width, shape, bend (lateral tip offset
 *  as fraction of len), pal:{base,mid,tip,vein,dry,spot}, veins:{n, slope, w, amt, parallel},
 *  midrib (px), dry (edge width px), tears:[{t, side, depth, gap}], holes, spots, tStart (heart),
 *  clip:[x0,y0,x1,y1], lift (height), seed, light (0..1 brightness) }
 */
function leaf(A, o) {
  const { w, h, img, H, ang, N, N2 } = A;
  const d = img.d;
  const L = o.len, hwMax = o.width / 2;
  const ca = Math.cos(o.angle), sa = Math.sin(o.angle);
  const bend = (o.bend || 0) * L;
  const shapeSrc = typeof o.shape === 'function' ? o.shape : SHAPES[o.shape || 'ovate'];
  const t0 = o.tStart ?? 0;
  // tabulate the outline once per leaf (transcendental shape functions are hot otherwise)
  const LUT_N = Math.max(24, Math.min(256, Math.round(o.len / 2)));
  const lut = new Float32Array(LUT_N + 1);
  for (let q = 0; q <= LUT_N; q++) lut[q] = Math.max(0, shapeSrc(t0 + ((1 - t0) * q) / LUT_N));
  const lutScale = LUT_N / (1 - t0);
  const shapeFn = (t) => {
    const f = (t - t0) * lutScale;
    const q = f | 0;
    if (q >= LUT_N) return lut[LUT_N];
    const r = f - q;
    return lut[q] + (lut[q + 1] - lut[q]) * r;
  };
  const rng = makeRng(o.seed ?? 1);
  // bbox from outline samples
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i <= 24; i++) {
    const t = t0 + ((1 - t0) * i) / 24;
    const hw = hwMax * Math.max(0, shapeFn(t)) * 1.15 + 2;
    for (const s of [-hw, hw]) {
      const al = t * L, ac = bend * t * t + s;
      const px = o.x + al * ca - ac * sa, py = o.y + al * sa + ac * ca;
      x0 = Math.min(x0, px);
      y0 = Math.min(y0, py);
      x1 = Math.max(x1, px);
      y1 = Math.max(y1, py);
    }
  }
  const clip = o.clip || [0, 0, w, h];
  x0 = Math.max(clip[0], Math.floor(x0));
  y0 = Math.max(clip[1], Math.floor(y0));
  x1 = Math.min(clip[2] - 1, Math.ceil(x1));
  y1 = Math.min(clip[3] - 1, Math.ceil(y1));
  const pal = o.pal;
  const vn = o.veins || { n: 8, slope: 1.2, w: 0.06, amt: 0.35 };
  const tears = o.tears || [];
  const holes = [];
  for (let i = 0; i < (o.holes || 0); i++) holes.push([0.15 + rng() * 0.75, (rng() * 2 - 1) * 0.75, 0.012 + rng() * 0.03]);
  const spots = [];
  for (let i = 0; i < (o.spots || 0); i++) spots.push([0.1 + rng() * 0.85, (rng() * 2 - 1) * 0.8, 0.015 + rng() * 0.04]);
  const light = o.light ?? 1;
  const lift = o.lift ?? 0.5;
  const c = [0, 0, 0], tmp = [0, 0, 0];
  const midW = o.midrib ?? Math.max(1, hwMax * 0.06);
  const dryW = o.dry || 0;
  const serr = o.serrate || 0;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const rx = px + 0.5 - o.x, ry = py + 0.5 - o.y;
      const along = rx * ca + ry * sa;
      const t = along / L;
      if (t < t0 || t > 1) continue;
      const across = -rx * sa + ry * ca;
      const s = across - bend * t * t;
      const i = py * w + px;
      let hw = hwMax * shapeFn(t);
      if (serr) hw *= 1 - serr * Math.abs(Math.sin(t * 60));
      hw *= 1 + N2[i] * 0.04;
      const as = Math.abs(s);
      if (as >= hw || hw <= 0.3) continue;
      const u = as / hw; // 0 midrib .. 1 edge
      // vein coordinate
      let q, veinD;
      if (vn.parallel) {
        q = (t - u * vn.slope * (hwMax / L)) * vn.n;
        veinD = Math.abs(q - Math.round(q));
      } else {
        q = (t - u * vn.slope * (hwMax / L)) * vn.n;
        veinD = Math.abs(q - Math.round(q)) * (1 + u);
      }
      // tears: wedge-shaped gaps along the vein direction, opening toward the edge
      let cut = false, tearEdge = 0;
      for (let k = 0; k < tears.length; k++) {
        const tr = tears[k];
        if ((s > 0 ? 1 : -1) !== tr.side) continue;
        const inner = 1 - tr.depth;
        if (u < inner) continue;
        const qd = Math.abs(q - tr.t * vn.n);
        const gap = tr.gap * ((u - inner) / tr.depth);
        if (qd < gap) {
          cut = true;
          break;
        }
        if (qd < gap + 0.6) tearEdge = Math.max(tearEdge, (1 - (qd - gap) / 0.6) * ((u - inner) / tr.depth));
      }
      if (cut) continue;
      let hole = false, holeRim = 0;
      for (let k = 0; k < holes.length; k++) {
        const [ht, hs, hr] = holes[k];
        const dt = (t - ht) * L, ds = s - hs * hw;
        const rr = Math.sqrt(dt * dt + ds * ds) / (hr * L) + N2[i] * 0.45 + Math.sin(Math.atan2(ds, dt) * 5 + k) * 0.12;
        if (rr < 1) {
          hole = true;
          break;
        }
        if (rr < 1.35) holeRim = Math.max(holeRim, (1.35 - rr) / 0.35);
      }
      if (hole) continue;
      // colour
      if (t < 0.5) mixc(pal.base, pal.mid, Math.max(0, t) * 2, c);
      else mixc(pal.mid, pal.tip, (t - 0.5) * 2, c);
      const nn = N[i];
      let v = light * (1 + nn * 0.18) * (s > 0 ? 1.06 : 0.92) * (1 - 0.22 * u * u * u);
      c[0] *= v * (1 + nn * 0.05);
      c[1] *= v;
      c[2] *= v * (1 - nn * 0.05);
      // veins & midrib
      const vw = vn.w ?? 0.06;
      if (veinD < vw && u > midW / hw) mixc(c, pal.vein, (vn.amt ?? 0.35) * (1 - veinD / vw) * (1 - 0.5 * u), c);
      const mw = midW * (1 - t * 0.7) + 0.4;
      if (as < mw) mixc(c, pal.vein, 0.75 * (1 - as / mw) + 0.15, c);
      // dry / brown edges, tear edges
      if (dryW > 0) {
        const e = hw - as;
        const dw = dryW * (0.6 + 0.8 * (N[i] * 0.5 + 0.5));
        if (e < dw) mixc(c, pal.dry, Math.min(1, (1 - e / dw) * 1.3), c);
      }
      if (tearEdge > 0 && pal.dry) mixc(c, pal.dry, tearEdge * 0.75, c);
      if (holeRim > 0 && pal.dry) mixc(c, pal.dry, holeRim * 0.8, c);
      for (let k = 0; k < spots.length; k++) {
        const [st, ss, sr] = spots[k];
        const dt = (t - st) * L, ds = s - ss * hw;
        const r2 = (dt * dt + ds * ds) / (sr * sr * L * L);
        const r2n = r2 + N2[i] * 0.5;
        if (r2n < 1) mixc(c, r2n < 0.4 ? pal.spot || pal.dry : pal.tip, (1 - r2n) * 0.7, c);
      }
      const aa = Math.min(1, (hw - as) * 1.2);
      const j = i * 4;
      const a0 = d[j + 3];
      const a = aa;
      d[j] = d[j] * (1 - a) + c[0] * a;
      d[j + 1] = d[j + 1] * (1 - a) + c[1] * a;
      d[j + 2] = d[j + 2] * (1 - a) + c[2] * a;
      d[j + 3] = Math.max(a0, a);
      H[i] = lift + (1 - u * u) * 0.08 + (as < mw ? 0.03 : 0) - (veinD < vw ? 0.015 : 0);
      ang[i] = o.angle + (vn.parallel ? (s > 0 ? 1 : -1) * 1.3 : (s > 0 ? 1 : -1) * 0.6);
    }
  }
}

/** Tapered stem / twig polyline. pts: [[x,y],...]; width at start..end. */
function stem(A, pts, w0, w1, col, col2) {
  const { w, h, img, H } = A;
  const d = img.d;
  const c0 = rgb(col), c1 = rgb(col2 || col);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const segL = Math.hypot(bx - ax, by - ay) || 1e-3;
    const ra = w0 + (w1 - w0) * (acc / total), rb = w0 + (w1 - w0) * ((acc + segL) / total);
    const r = Math.max(ra, rb);
    const minx = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), maxx = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + r + 1));
    const miny = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), maxy = Math.min(h - 1, Math.ceil(Math.max(ay, by) + r + 1));
    const dx = bx - ax, dy = by - ay, ll = dx * dx + dy * dy;
    for (let y = miny; y <= maxy; y++) {
      for (let x = minx; x <= maxx; x++) {
        const pxx = x + 0.5 - ax, pyy = y + 0.5 - ay;
        let t = (pxx * dx + pyy * dy) / ll;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const rr = ra + (rb - ra) * t;
        const ex = pxx - dx * t, ey = pyy - dy * t;
        const dist = Math.sqrt(ex * ex + ey * ey);
        if (dist >= rr + 0.5) continue;
        const a = Math.min(1, rr + 0.5 - dist);
        const side = (ex * -dy + ey * dx) / (Math.sqrt(ll) * (rr + 0.01)); // -1..1 across
        const sh = 0.8 + 0.35 * side;
        const j = (y * w + x) * 4;
        const tt = (acc + segL * t) / total;
        const cr = (c0[0] + (c1[0] - c0[0]) * tt) * sh, cg = (c0[1] + (c1[1] - c0[1]) * tt) * sh, cb = (c0[2] + (c1[2] - c0[2]) * tt) * sh;
        d[j] = d[j] * (1 - a) + cr * a;
        d[j + 1] = d[j + 1] * (1 - a) + cg * a;
        d[j + 2] = d[j + 2] * (1 - a) + cb * a;
        d[j + 3] = Math.max(d[j + 3], a);
        H[y * w + x] = 0.55 + (1 - Math.abs(side)) * 0.05;
      }
    }
    acc += segL;
  }
}

function finish(A, key, opts = {}) {
  const { w, h, img, H, ang } = A;
  // painterly strokes that follow the vein direction, only on opaque pixels
  strokes(img, {
    seed: opts.seed ?? 7, len: opts.len || [6, 16], width: opts.width || [2, 5], opacity: opts.opacity ?? 0.45, coverage: opts.coverage ?? 0.7,
    angle: (x, y) => ang[(Math.min(h - 1, Math.max(0, y | 0))) * w + Math.min(w - 1, Math.max(0, x | 0))], angleJitter: 0.25, valueJitter: 0.08, warmJitter: 0.04, alphaOnly: true, bristleAmt: 0.45,
  });
  if (opts.shade !== false) {
    // soft cupping light from the leaf height (mask by alpha)
    const m = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) m[i] = img.d[i * 4 + 3];
    shade(img, H, { strength: 0.25, bump: 30, ao: 0.25, aoRadius: 3, edge: 0.1, mask: m });
  }
  // harden alpha a little for crisp alphaTest silhouettes, then bleed colour under alpha=0
  const d = img.d;
  for (let i = 3; i < d.length; i += 4) d[i] = sstep(0.2, 0.8, d[i]);
  bleed(img, 6);
  return {
    [key]: colorOut(img, { alpha: true, wrap: opts.wrap || 'clamp', meta: { atlas: FOLIAGE_ATLAS[key] } }),
    [key + '_normal']: dataOut(normalMap(H, w, h, 12), w, h, { wrap: opts.wrap || 'clamp' }),
  };
}

const P = (base, mid, tip, vein, dry, spot) => ({ base: rgb(base), mid: rgb(mid), tip: rgb(tip), vein: rgb(vein), dry: rgb(dry), spot: rgb(spot || dry) });

// ---------------------------------------------------------------------------
// LEAF TROPICAL — broad leaf, heart leaf, twig spray, dense cluster
// ---------------------------------------------------------------------------
export function genLeafTropical(S = 1024) {
  const A = atlas(S, S, 5000);
  const k = S / 1024, c = S / 2;
  const rng = makeRng(5001);
  const green = P('#1e3a19', '#335f26', '#4d7a30', '#8a9e52', '#6e5a2a', '#4a3a1a');
  const green2 = P('#22401a', '#3e6a2a', '#5a8236', '#97a85c', '#7a6430', '#3e2e18');
  // broad leaf (top-left cell): base at bottom centre
  leaf(A, { x: c * 0.5, y: c * 0.98, angle: UP, len: c * 0.94, width: c * 0.56, shape: 'ovate', bend: 0.05, pal: green, veins: { n: 9, slope: 2.2, w: 0.05, amt: 0.4 }, midrib: 4 * k, holes: 3, spots: 2, dry: 5 * k, seed: 11, clip: [0, 0, c, c] });
  stem(A, [[c * 0.5, c], [c * 0.5, c * 0.97]], 4 * k, 3.5 * k, '#4a5a2a');
  // heart leaf (top-right): petiole notch at the base
  leaf(A, { x: c * 1.5, y: c * 0.74, angle: UP, len: c * 0.7, width: c * 0.8, shape: 'heart', tStart: -0.26, bend: 0.02, pal: green2, veins: { n: 7, slope: 1.4, w: 0.05, amt: 0.45 }, midrib: 5 * k, holes: 2, dry: 3 * k, seed: 12, clip: [c, 0, 2 * c, c] });
  stem(A, [[c * 1.5, c], [c * 1.5, c * 0.74]], 6 * k, 4 * k, '#55663a');
  // spray: twig with alternate leaves (bottom-left)
  const sprayCell = [0, c, c, 2 * c];
  const twig = [];
  for (let i = 0; i <= 10; i++) twig.push([c * 0.5 + Math.sin(i * 0.5) * 10 * k, 2 * c - 2 - i * c * 0.085]);
  for (let i = 0; i < 9; i++) {
    const p = twig[Math.min(10, i + 1)];
    const side = i % 2 ? 1 : -1;
    const ang = UP + side * (0.7 + rng() * 0.4) - i * 0.01;
    leaf(A, { x: p[0], y: p[1], angle: ang, len: c * (0.3 - i * 0.012) * (0.85 + rng() * 0.3), width: c * 0.12, shape: 'lance', bend: side * 0.06, pal: rng() < 0.3 ? green2 : green, veins: { n: 7, slope: 2.5, w: 0.06, amt: 0.35 }, midrib: 2 * k, holes: rng() < 0.3 ? 1 : 0, dry: rng() < 0.3 ? 3 * k : 0, seed: 20 + i, clip: sprayCell, light: 0.9 + rng() * 0.25 });
  }
  leaf(A, { x: twig[10][0], y: twig[10][1] + 6 * k, angle: UP, len: c * 0.16, width: c * 0.07, shape: 'lance', pal: green2, veins: { n: 6, slope: 2.5, w: 0.06, amt: 0.3 }, seed: 39, clip: sprayCell, light: 1.15 });
  stem(A, twig, 5 * k, 1.5 * k, '#4a3c2a', '#5a6a32');
  // cluster: many leaves radiating from a few points (bottom-right)
  const clCell = [c, c, 2 * c, 2 * c];
  const hubs = [[c * 1.5, c * 1.55], [c * 1.35, c * 1.4], [c * 1.65, c * 1.38], [c * 1.5, c * 1.25]];
  stem(A, [[c * 1.5, 2 * c], [c * 1.5, c * 1.55], [c * 1.35, c * 1.4]], 5 * k, 2 * k, '#4a3c2a');
  stem(A, [[c * 1.5, c * 1.55], [c * 1.65, c * 1.38]], 3 * k, 2 * k, '#4a3c2a');
  stem(A, [[c * 1.5, c * 1.55], [c * 1.5, c * 1.25]], 3 * k, 1.5 * k, '#4a3c2a');
  let li = 0;
  for (const [hx, hy] of hubs) {
    for (let j = 0; j < 6; j++) {
      const ang = UP + (j / 5 - 0.5) * 2.6 + (rng() - 0.5) * 0.3;
      leaf(A, { x: hx, y: hy, angle: ang, len: c * (0.24 + rng() * 0.12), width: c * (0.1 + rng() * 0.04), shape: 'ovate', bend: (rng() - 0.5) * 0.15, pal: rng() < 0.4 ? green2 : green, veins: { n: 7, slope: 2.2, w: 0.06, amt: 0.35 }, midrib: 2 * k, holes: rng() < 0.2 ? 1 : 0, spots: rng() < 0.2 ? 1 : 0, seed: 50 + li++, clip: clCell, light: 0.85 + rng() * 0.3 });
    }
  }
  return finish(A, 'leaf_tropical', { len: [6 * k, 16 * k], width: [2 * k, 5 * k] });
}

// ---------------------------------------------------------------------------
// LEAF BANANA — big ribbed blades: fresh (few tears) and shredded/browning
// ---------------------------------------------------------------------------
export function genLeafBanana(S = 1024) {
  const A = atlas(S, S, 5100);
  const k = S / 1024, cw = S / 2;
  const rng = makeRng(5101);
  const fresh = P('#3a5a22', '#4f7a2e', '#5f8a36', '#b4bc80', '#7a5a2a', '#5a4020');
  const old = P('#3e5222', '#55692a', '#62702e', '#a8a874', '#7a5a2e', '#4a3018');
  const mk = (cx, pal, nTears, dryW, seed, tearDepth, gapLo, gapHi) => {
    const r = makeRng(seed);
    const tears = [];
    for (let i = 0; i < nTears; i++) tears.push({ t: 0.06 + r() * 0.9, side: r() < 0.5 ? -1 : 1, depth: tearDepth * (0.45 + r() * 0.55), gap: gapLo + r() * (gapHi - gapLo) });
    leaf(A, { x: cx, y: S - 4 * k, angle: UP, len: S * 0.97, width: cw * 0.8, shape: 'oblong', bend: (r() - 0.5) * 0.04, pal, veins: { n: 90, slope: 0.32, w: 0.14, amt: 0.2, parallel: true }, midrib: 9 * k, dry: dryW, tears, holes: 0, spots: 1, seed, clip: [cx - cw / 2, 0, cx + cw / 2, S] });
  };
  mk(cw * 0.5, fresh, 8, 4 * k, 5102, 0.8, 0.3, 1.0);
  mk(cw * 1.5, old, 22, 14 * k, 5103, 0.97, 0.8, 2.8);
  // a bit of petiole at the bottom of each
  stem(A, [[cw * 0.5, S], [cw * 0.5, S - 30 * k]], 10 * k, 9 * k, '#7a8a4a');
  stem(A, [[cw * 1.5, S], [cw * 1.5, S - 30 * k]], 10 * k, 9 * k, '#8a8a4a');
  void rng;
  return finish(A, 'leaf_banana', { len: [8 * k, 22 * k], width: [3 * k, 6 * k], coverage: 0.8 });
}

// ---------------------------------------------------------------------------
// LEAF FERN — pinnate and bipinnate fronds
// ---------------------------------------------------------------------------
export function genLeafFern(S = 1024) {
  const A = atlas(S, S, 5200);
  const k = S / 1024, cw = S / 2;
  const rng = makeRng(5201);
  const pal = P('#1d3a17', '#2f5a22', '#4a7a2e', '#7a9a48', '#6a5a2a');
  const pal2 = P('#203f1a', '#356428', '#55843a', '#82a052', '#6a5a2a');
  const frond = (cx, lacy, seed) => {
    const r = makeRng(seed);
    const pts = [];
    const n = lacy ? 22 : 28;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([cx + Math.sin(t * 2.2) * 40 * k * (lacy ? -1 : 1), S - 4 - t * S * 0.95]);
    }
    const clip = [cx - cw / 2, 0, cx + cw / 2, S];
    for (let i = 2; i < n; i++) {
      const t = i / n;
      const [px, py] = pts[i];
      const dx = pts[i + 1][0] - px, dy = pts[i + 1][1] - py;
      const dir = Math.atan2(dy, dx);
      const plen = cw * 0.44 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.9) + 8 * k;
      for (const side of [-1, 1]) {
        const a = dir + side * (1.25 - t * 0.3);
        if (!lacy) {
          leaf(A, { x: px, y: py, angle: a, len: plen, width: plen * 0.2, shape: 'pinna', bend: side * -0.12 - t * 0.1 * side, pal: r() < 0.5 ? pal : pal2, veins: { n: 10, slope: 1.5, w: 0.08, amt: 0.25 }, midrib: 1.2 * k, serrate: 0.25, dry: t > 0.85 ? 2 * k : 0, seed: seed + i * 2 + (side > 0 ? 1 : 0), clip, light: 0.9 + r() * 0.2 });
        } else {
          // bipinnate: each pinna is a row of small pinnules
          const m = Math.max(3, Math.round(plen / (13 * k)));
          const ca = Math.cos(a), sa = Math.sin(a);
          for (let j = 0; j < m; j++) {
            const tt = (j + 0.5) / m;
            const qx = px + ca * plen * tt, qy = py + sa * plen * tt;
            const pl = plen * 0.2 * (1 - tt * 0.7) + 3 * k;
            for (const s2 of [-1, 1]) leaf(A, { x: qx, y: qy, angle: a + s2 * 1.05, len: pl, width: pl * 0.42, shape: 'ovate', pal: r() < 0.5 ? pal : pal2, veins: { n: 3, slope: 1, w: 0.1, amt: 0.2 }, midrib: 0.8 * k, seed: seed + i * 50 + j * 2 + (s2 > 0 ? 1 : 0), clip, light: 0.85 + r() * 0.3 });
          }
          stem(A, [[px, py], [px + ca * plen, py + sa * plen]], 1.4 * k, 0.6 * k, '#4a5a28');
        }
      }
    }
    stem(A, pts, 5 * k, 1 * k, '#3a3a1e', '#5a6a2c');
  };
  frond(cw * 0.5, false, 5210);
  frond(cw * 1.5, true, 5310);
  void rng;
  return finish(A, 'leaf_fern', { len: [4 * k, 10 * k], width: [1.5 * k, 3.5 * k], opacity: 0.35 });
}

// ---------------------------------------------------------------------------
// LEAF BAMBOO — narrow lanceolate leaves fanning from twig nodes
// ---------------------------------------------------------------------------
export function genLeafBamboo(S = 1024) {
  const A = atlas(S, S, 5400);
  const k = S / 1024, c = S / 2;
  const rng = makeRng(5401);
  const pals = [P('#3c5a22', '#58782e', '#7a9440', '#a6b46a', '#9a8a48'), P('#41602a', '#5e8234', '#86a04a', '#b0bc78', '#a89050'), P('#4a5a26', '#6a7a32', '#9a9a4a', '#b8b67a', '#b09a58')];
  const twigFan = (cell, start, dir, nNodes, seed, droop) => {
    const r = makeRng(seed);
    const pts = [start];
    let [x, y] = start;
    let a = dir;
    for (let i = 0; i < nNodes * 3; i++) {
      a += droop * 0.03 + (r() - 0.5) * 0.06;
      x += Math.cos(a) * c * 0.045;
      y += Math.sin(a) * c * 0.045;
      pts.push([x, y]);
    }
    stem(A, pts, 2.6 * k, 1 * k, '#6a6a34', '#7a7a3a');
    for (let nI = 1; nI <= nNodes; nI++) {
      const [px, py] = pts[Math.min(pts.length - 1, nI * 3)];
      const leaves = 4 + Math.floor(r() * 3);
      for (let j = 0; j < leaves; j++) {
        const la = a + (j / (leaves - 1) - 0.5) * 1.9 + (r() - 0.5) * 0.3 + droop * 0.5;
        const len = c * (0.36 + r() * 0.2);
        leaf(A, { x: px, y: py, angle: la, len, width: len * 0.13, shape: 'bamboo', bend: (r() - 0.5) * 0.25 + droop * 0.12, pal: pals[(r() * pals.length) | 0], veins: { n: 1, slope: 0, w: 0.02, amt: 0.1, parallel: true }, midrib: 1.6 * k, dry: r() < 0.25 ? 3 * k : 0, seed: seed + nI * 10 + j, clip: cell, light: 0.9 + r() * 0.25 });
      }
    }
  };
  twigFan([0, 0, c, c], [c * 0.06, c * 0.9], -0.75, 4, 5410, 0.2);
  twigFan([c, 0, 2 * c, c], [c * 1.06, c * 0.06], 0.6, 4, 5420, 1.0);
  twigFan([0, c, c, 2 * c], [c * 0.5, 2 * c - 6 * k], UP, 5, 5430, 0);
  twigFan([c, c, 2 * c, 2 * c], [c * 1.04, c * 1.5], 0, 3, 5440, 0.5);
  void rng;
  return finish(A, 'leaf_bamboo', { len: [6 * k, 16 * k], width: [2 * k, 4 * k] });
}

// ---------------------------------------------------------------------------
// LEAF PALM — green pinnate frond + dead hanging frond
// ---------------------------------------------------------------------------
export function genLeafPalm(S = 1024) {
  const A = atlas(S, S, 5500);
  const k = S / 1024, cw = S / 2;
  const green = P('#2c4a1e', '#46682a', '#64843a', '#a2ac66', '#8a7a40');
  const dry = P('#6a5430', '#8a6e3a', '#a08448', '#c0a870', '#5a4426');
  const frond = (cx, pal, seed, dead) => {
    const r = makeRng(seed);
    const pts = [];
    const n = 50;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([cx + Math.sin(t * 1.8 + seed) * 18 * k, dead ? 4 + t * S * 0.96 : S - 4 - t * S * 0.96]);
    }
    const clip = [cx - cw / 2, 0, cx + cw / 2, S];
    for (let i = 3; i < n; i++) {
      const t = i / n;
      const [px, py] = pts[i];
      const dir = Math.atan2(pts[i + 1][1] - py, pts[i + 1][0] - px);
      const ll = cw * 0.47 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.55)), 0.7) + 10 * k;
      for (const side of [-1, 1]) {
        const a = dir + side * (dead ? 0.35 + r() * 0.3 : 0.55 + t * 0.25 + (r() - 0.5) * 0.2);
        leaf(A, { x: px, y: py, angle: a, len: ll * (0.85 + r() * 0.2), width: ll * (dead ? 0.06 : 0.09), shape: 'linear', bend: side * (dead ? 0.05 : 0.18), pal: pal, veins: { n: 1, slope: 0, w: 0.02, amt: 0.1, parallel: true }, midrib: 1.4 * k, dry: dead ? 0 : r() < 0.2 ? 8 * k : 2 * k, seed: seed + i * 2 + (side > 0 ? 1 : 0), clip, light: 0.85 + r() * 0.3 });
      }
    }
    stem(A, pts, 9 * k, 2 * k, dead ? '#6a5434' : '#6a7a3a', dead ? '#8a7244' : '#8a9448');
  };
  frond(cw * 0.5, green, 5510, false);
  frond(cw * 1.5, dry, 5520, true);
  return finish(A, 'leaf_palm', { len: [8 * k, 20 * k], width: [2 * k, 4 * k] });
}

// ---------------------------------------------------------------------------
// GRASS CARD — two horizontally tileable rows: tall seeding grass, short tufts
// ---------------------------------------------------------------------------
export function genGrassCard(S = 1024) {
  const A = atlas(S, S, 5600);
  const { w, img, H, ang } = A;
  const d = img.d;
  const k = S / 1024, rowH = S / 2;
  const rng = makeRng(5601);
  const cols = [rgb('#1e2c14'), rgb('#3a5222'), rgb('#5e7a32'), rgb('#8a9a4a'), rgb('#a8a260'), rgb('#9a8a52')];
  const blade = (x0, yBase, height, lean, wd, col, tipCol, seedHead) => {
    const steps = Math.ceil(height * 1.2);
    let x = x0;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const y = yBase - t * height;
      x = x0 + lean * t * t * height;
      const bw = wd * (1 - Math.pow(t, 1.4)) + 0.35;
      const cr = col[0] + (tipCol[0] - col[0]) * t, cg = col[1] + (tipCol[1] - col[1]) * t, cb = col[2] + (tipCol[2] - col[2]) * t;
      const yy = Math.floor(y);
      if (yy < 0 || yy >= S) continue;
      for (let ox = Math.floor(x - bw - 1); ox <= Math.ceil(x + bw + 1); ox++) {
        const q = bw + 0.5 - Math.abs(ox + 0.5 - x);
        if (q <= 0) continue;
        const a = Math.min(1, q);
        const i = yy * w + (((ox % w) + w) % w);
        const j = i * 4;
        const side = (ox + 0.5 - x) / (bw + 0.01);
        const sh = 0.85 + 0.3 * side * (lean > 0 ? 1 : -1);
        d[j] = d[j] * (1 - a) + cr * sh * a;
        d[j + 1] = d[j + 1] * (1 - a) + cg * sh * a;
        d[j + 2] = d[j + 2] * (1 - a) + cb * sh * a;
        d[j + 3] = Math.max(d[j + 3], a);
        H[i] = 0.5 + (1 - Math.abs(side)) * 0.05;
        ang[i] = -Math.PI / 2 + lean;
      }
    }
    if (seedHead) {
      const tx = x, ty = yBase - height;
      const spal = P('#6a6034', '#8a7a46', '#b0a068', '#c8b888', '#7a6a40');
      for (let sp = 0; sp < 7; sp++) {
        const a = -Math.PI / 2 + lean * 1.5 + (sp / 6 - 0.5) * 1.6 + (rng() - 0.5) * 0.3;
        leaf(A, { x: tx, y: ty + sp * 4 * k, angle: a + Math.PI * 0.08, len: (14 + rng() * 16) * k, width: 3.2 * k, shape: 'lance', bend: 0.25, pal: spal, veins: { n: 1, slope: 0, w: 0.02, amt: 0, parallel: true }, midrib: 0.6 * k, seed: 6000 + sp + Math.floor(tx), clip: [0, 0, w, S], light: 0.9 + rng() * 0.2 });
      }
    }
  };
  for (const [row, tall] of [[0, true], [1, false]]) {
    const yBase = (row + 1) * rowH - 2;
    const n = Math.round((tall ? 520 : 760) * k);
    for (let b = 0; b < n; b++) {
      const depth = b / n; // later = in front
      const x = rng() * w;
      const hh = tall ? rowH * (0.35 + Math.pow(rng(), 0.7) * 0.6) : rowH * (0.15 + Math.pow(rng(), 1.2) * 0.45);
      const lean = (rng() - 0.5) * (tall ? 0.6 : 0.9);
      const dryish = rng() < 0.18;
      const ci = Math.min(cols.length - 1, Math.floor(1 + rng() * 2 + depth));
      const col = cols[ci].map((v) => v * (0.75 + depth * 0.35));
      const tip = dryish ? cols[5] : cols[Math.min(cols.length - 2, ci + 1 + (rng() < 0.4 ? 1 : 0))];
      blade(x, yBase, Math.min(hh, rowH - 6), lean, (1.5 + rng() * 2.4) * k, col, tip, tall && rng() < 0.07);
    }
    // a few broad weeds in the short row
    if (!tall) {
      const wpal = P('#21391a', '#3a6226', '#5a8034', '#7a9a4a', '#7a6a32');
      for (let i = 0; i < 26; i++) {
        const x = rng() * w;
        for (let j = 0; j < 5; j++) leaf(A, { x: x + (rng() - 0.5) * 20 * k, y: yBase - rng() * rowH * 0.12, angle: UP + (j / 4 - 0.5) * 2.6 + (rng() - 0.5) * 0.3, len: rowH * (0.08 + rng() * 0.07), width: rowH * 0.07, shape: 'ovate', pal: wpal, veins: { n: 5, slope: 2, w: 0.06, amt: 0.3 }, seed: 5700 + i * 4 + j, clip: [0, rowH, w, S], light: 0.8 + rng() * 0.3 });
      }
    }
  }
  // tileable in u: blades drawn with wrap; finish without clamp
  return finish(A, 'grass_card', { len: [6 * k, 14 * k], width: [1.5 * k, 3 * k], wrap: 'repeat', shade: false });
}

// ---------------------------------------------------------------------------
// VINE — vertically tileable hanging vines: leafy heart-leaf vine and bare lianas
// ---------------------------------------------------------------------------
export function genVine(S = 1024) {
  const A = atlas(S, S, 5800);
  const k = S / 1024, cw = S / 2;
  const rng = makeRng(5801);
  const pal = P('#1f3a18', '#33602a', '#4e7e34', '#8aa858', '#6a5a2a');
  const pal2 = P('#2a4a1c', '#3f6e2c', '#5f8e3a', '#9ab460', '#7a6a32');
  const strand = (cx, amp, seed, leaves, wd, col) => {
    const r = makeRng(seed);
    const pts = [];
    const ph = r() * TAU;
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      pts.push([cx + Math.sin(t * TAU * 2 + ph) * amp + Math.sin(t * TAU * 5 + ph * 2) * amp * 0.25, t * S]);
    }
    stem(A, pts, wd, wd * 0.9, col, col);
    for (let i = 0; i < leaves; i++) {
      const t = (i + 0.5) / leaves;
      const p = pts[Math.floor(t * 64)];
      const side = i % 2 ? 1 : -1;
      const len = cw * (0.13 + r() * 0.08);
      leaf(A, { x: p[0], y: p[1], angle: Math.PI / 2 + side * (0.6 + r() * 0.5), len, width: len * 0.85, shape: 'heart', tStart: -0.2, bend: side * 0.1, pal: r() < 0.5 ? pal : pal2, veins: { n: 5, slope: 1.3, w: 0.06, amt: 0.35 }, midrib: 1.5 * k, holes: r() < 0.25 ? 1 : 0, dry: r() < 0.2 ? 3 * k : 0, seed: seed + i, clip: [cx - cw / 2, 0, cx + cw / 2, S], light: 0.85 + r() * 0.3 });
    }
  };
  strand(cw * 0.5, 26 * k, 5810, 14, 3 * k, '#3a4a22');
  strand(cw * 0.3, 14 * k, 5811, 6, 2 * k, '#3e4e24');
  strand(cw * 1.35, 20 * k, 5820, 0, 5 * k, '#4a3e2c');
  strand(cw * 1.6, 12 * k, 5821, 3, 3 * k, '#56483a');
  strand(cw * 1.5, 30 * k, 5822, 0, 2 * k, '#4c4232');
  void rng;
  // vertical tiling: leaves near the top/bottom edges may cut; the strands themselves wrap
  return finish(A, 'vine', { len: [6 * k, 14 * k], width: [2 * k, 4 * k], wrap: 'repeat' });
}
