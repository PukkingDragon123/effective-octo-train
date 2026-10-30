// Ground & masonry surfaces: asphalt, concrete (+moss), moss, soil, rock, gravel,
// leaf litter, puddle mask. All tileable, hand-painted (palette ramps + stroke stamping +
// baked soft light), with companion normal / roughness maps from height.
import { makeRng } from '../core/math.js';
import { fbm, worley, blur, crack, line, disc, warp, cellTable, upsample, facets } from './noise.js';
import {
  Img, ramp, gradientMap, strokes, shade, normalMap, grayBytes, colorOut, dataOut, tint, modulate, sstep, rgb, streaks, adjust,
} from './painter.js';

const TAU = Math.PI * 2;

function smoothMask(src, lo, hi) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = sstep(lo, hi, src[i]);
  return out;
}

/** Irregular, noise-edged rounded rectangles (repairs, stains). Returns 0..1 mask + seam line. */
function patches(w, h, rng, count, sizeLo, sizeHi, edgeNoise, seed) {
  const P = new Float32Array(w * h), seam = new Float32Array(w * h);
  const pn = fbm(w, h, { cells: 6, octaves: 4, seed });
  for (let c = 0; c < count; c++) {
    const cx = rng() * w, cy = rng() * h, a = (rng() - 0.5) * 0.25;
    const hw = (sizeLo + rng() * (sizeHi - sizeLo)) * w, hh = (sizeLo + rng() * (sizeHi - sizeLo)) * h * 0.8;
    const ca = Math.cos(a), sa = Math.sin(a);
    const ext = Math.hypot(hw, hh) * 1.25;
    for (let y = Math.floor(cy - ext); y < cy + ext; y++) {
      const wy = ((y % h) + h) % h;
      for (let x = Math.floor(cx - ext); x < cx + ext; x++) {
        const dx = x - cx, dy = y - cy;
        const u = Math.abs(dx * ca + dy * sa) / hw, v = Math.abs(-dx * sa + dy * ca) / hh;
        const i = wy * w + (((x % w) + w) % w);
        // superellipse (rounded rect) + noisy edge
        const u2 = u * u, v2 = v * v;
        const d = Math.sqrt(Math.sqrt(u2 * u2 + v2 * v2)) + pn[i] * edgeNoise;
        const m = 1 - sstep(0.97, 1.0, d);
        if (m > P[i]) P[i] = m;
        const s = 1 - Math.min(1, Math.abs(d - 0.985) / 0.012);
        if (s > seam[i]) seam[i] = s;
      }
    }
  }
  return { P, seam };
}

// ---------------------------------------------------------------------------
// ASPHALT — old, cracked, patched Thai rural road: worn grey binder, exposed aggregate,
// tar-snake sealant, alligator cracking, oil, dust. (~6 m per tile works well.)
// ---------------------------------------------------------------------------
export function genAsphalt(S = 1024) {
  const w = S, h = S, n = w * h, k = S / 1024;
  const rng = makeRng(101);
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: 11 });
  const mid = fbm(w, h, { cells: 12, octaves: 3, seed: 12 });
  const grain = fbm(w, h, { cells: 180, octaves: 1, seed: 13 });
  const ag = worley(w, h, { cells: Math.round(S / 9), seed: 14 });
  const nc = ag.cx * ag.cy;
  const selT = cellTable(nc, 3), colT = cellTable(nc, 7), sizeT = cellTable(nc, 9);

  const H = new Float32Array(n);
  const stone = new Float32Array(n);
  const wear = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = ag.id[i];
    const r = 0.42 + sizeT[c] * 0.4;
    const peb = 1 - ag.f1[i] / r;
    const wr = sstep(-0.3, 0.5, low[i] * 0.8 + mid[i] * 0.5);
    wear[i] = wr;
    const s = peb > 0 ? sstep(0.0, 0.3, peb) * (0.3 + 0.7 * wr) * (selT[c] > 0.45 ? 0.75 : 0.12) : 0;
    stone[i] = s;
    H[i] = 0.5 + (peb > 0 ? peb * 0.14 : 0) * (0.35 + 0.65 * wr) + grain[i] * 0.04 + mid[i] * 0.05;
  }

  // cracks: long wandering cracks + alligator crazing in worn zones
  const C = new Float32Array(n);
  for (let c = 0; c < 6; c++) {
    crack(C, w, h, rng, { x: rng() * w, y: rng() * h, angle: rng() * TAU, steps: 70 + rng() * 90, step: 4 * k, wander: 1.1, width: (1.5 + rng() * 1.8) * k, branch: 0.06, val: 1, vary: 1 });
  }
  const al = worley(w >> 1, h >> 1, { cells: 20, seed: 15 });
  const alE = new Float32Array((w >> 1) * (h >> 1));
  for (let i = 0; i < alE.length; i++) alE[i] = al.f2[i] - al.f1[i];
  const alEdge = upsample(alE, w >> 1, h >> 1, w, h);
  const alMask = fbm(w, h, { cells: 4, octaves: 3, seed: 16 });
  for (let i = 0; i < n; i++) {
    const m = sstep(0.05, 0.35, alMask[i] + low[i] * 0.2);
    const e = 1 - sstep(0.0, 0.035 + 0.02 * m, alEdge[i] + grain[i] * 0.012);
    const v = e * (0.32 + 0.6 * m);
    if (v > C[i]) C[i] = v;
  }
  // tar snakes (black sealant overbands following a few cracks)
  const T = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    crack(T, w, h, rng, { x: rng() * w, y: rng() * h, angle: rng() * TAU, steps: 50 + rng() * 60, step: 9 * k, wander: 0.35, width: (5 + rng() * 3) * k, taper: 0.999, branch: 0.03, val: 1 });
  }
  const P = new Float32Array(n), seam = new Float32Array(n); // (repairs are left to world-scale decals)
  // oil / damp blotches
  const O = new Float32Array(n);
  for (let c = 0; c < 18; c++) disc(O, w, h, rng() * w, rng() * h, (10 + rng() * 45) * k, 0.4 + rng() * 0.6, 'max');
  const Ob = blur(O, w, h, Math.round(8 * k), 2);

  // --- colour
  const img = new Img(w, h);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = 0.5 + mid[i] * 0.35 + grain[i] * 0.18 + low[i] * 0.12 + wear[i] * 0.1;
  gradientMap(img, f, [[0, '#262729'], [0.35, '#333436'], [0.6, '#3f4042'], [0.85, '#4d4c4a'], [1, '#5a5753']]);
  // cool/warm drift (bluish fresh binder vs dusty brown)
  modulate(img, fbm(w, h, { cells: 5, octaves: 3, seed: 18 }), 0.08, 0.07);
  const dust = new Float32Array(n);
  for (let i = 0; i < n; i++) dust[i] = sstep(0.1, 0.9, low[i] * 0.6 + mid[i] * 0.6) * 0.5;
  tint(img, dust, '#625e57', 0.35);
  // aggregate stones (per-stone colour)
  const stoneCols = ['#66676a', '#77746e', '#868076', '#5a5c60', '#958e81', '#727678', '#7d6e60'].map(rgb);
  const d = img.d;
  for (let i = 0; i < n; i++) {
    const s = stone[i];
    if (s <= 0.01) continue;
    const c = stoneCols[(colT[ag.id[i]] * stoneCols.length) | 0];
    const lit = 0.88 + 0.2 * (1 - ag.f1[i]);
    const j = i * 4;
    const a = s * 0.6;
    d[j] += (c[0] * lit - d[j]) * a;
    d[j + 1] += (c[1] * lit - d[j + 1]) * a;
    d[j + 2] += (c[2] * lit - d[j + 2]) * a;
  }
  // repair patches: newer, darker, finer, with a cut seam
  const Pm = new Float32Array(n);
  for (let i = 0; i < n; i++) Pm[i] = P[i] * 0.7;
  tint(img, Pm, '#2b2c2e', 0.8);
  // brushwork: stipple + broad unifying strokes
  strokes(img, { seed: 21, len: [8 * k, 18 * k], width: [3 * k, 7 * k], opacity: 0.45, coverage: 0.55, valueJitter: 0.07, warmJitter: 0.03, bristleAmt: 0.45, height: H, heightAmt: 0.02 });
  strokes(img, { seed: 23, len: [24 * k, 60 * k], width: [8 * k, 16 * k], opacity: 0.2, coverage: 0.45, valueJitter: 0.06, warmJitter: 0.03, bristleAmt: 0.5 });
  strokes(img, { seed: 22, len: [80 * k, 160 * k], width: [20 * k, 40 * k], opacity: 0.08, coverage: 0.3, angle: 0, angleJitter: 0.2, valueJitter: 0.04 });
  // oil, tar, cracks on top
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const o = Ob[i] * 0.45;
    d[j] *= 1 - o * 0.55;
    d[j + 1] *= 1 - o * 0.52;
    d[j + 2] *= 1 - o * 0.46;
  }
  const Tb = blur(T, w, h, Math.max(1, Math.round(1.5 * k)), 1);
  const Tm = smoothMask(Tb, 0.15, 0.5);
  tint(img, Tm, '#141516', 0.9);
  tint(img, seam, '#1a1b1c', 0.6);
  const Cm = smoothMask(C, 0.12, 0.7);
  tint(img, Cm, '#151617', 0.85);
  // pale dust rim along cracks
  const Ce = blur(C, w, h, Math.max(1, Math.round(3 * k)), 1);
  for (let i = 0; i < n; i++) Ce[i] = sstep(0.04, 0.3, Ce[i]) * (1 - Cm[i]) * 0.3 * (0.4 + wear[i]);
  tint(img, Ce, '#77705f', 1);

  for (let i = 0; i < n; i++) {
    H[i] -= C[i] * 0.2 + seam[i] * 0.05;
    H[i] += Tm[i] * 0.025;
    H[i] += (0.5 + grain[i] * 0.02 - H[i]) * P[i] * 0.6;
  }
  shade(img, H, { strength: 0.16, bump: 6 * k, ao: 0.5, aoRadius: Math.round(3 * k), edge: 0.18 });
  adjust(img, { saturation: 0.8 });

  // roughness
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0.9 - stone[i] * 0.12 + grain[i] * 0.04;
    r += (0.74 - r) * P[i];
    r += (0.42 - r) * Tm[i];
    r += (0.55 - r) * Ob[i] * 0.6;
    r += (0.98 - r) * Cm[i];
    R[i] = r;
  }
  return {
    asphalt: colorOut(img),
    asphalt_normal: dataOut(normalMap(H, w, h, 7 * k), w, h),
    asphalt_rough: dataOut(grayBytes(R, w, h), w, h),
    asphalt_height: dataOut(grayBytes(H, w, h, 0.25, 0.8), w, h),
  };
}

// ---------------------------------------------------------------------------
// CONCRETE — weathered cast concrete (posts, sala floors, walls, KM posts, well).
// v-up: water streaks run down the texture. concrete_moss adds creeping moss + mildew.
// ---------------------------------------------------------------------------
function concreteBase(S, seed) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(seed);
  const low = fbm(w, h, { cells: 3, octaves: 5, seed: seed + 1 });
  const mid = fbm(w, h, { cells: 9, octaves: 3, seed: seed + 2 });
  const fine = fbm(w, h, { cells: 96, octaves: 1, seed: seed + 3 });
  const pits = worley(w, h, { cells: Math.round(60 * k), seed: seed + 4 });
  const pitT = cellTable(pits.cx * pits.cy, 5);
  const H = new Float32Array(n);
  const pitM = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = pitT[pits.id[i]] < 0.2 ? 1 - sstep(0.1, 0.26, pits.f1[i]) : 0;
    pitM[i] = p;
    H[i] = 0.55 + mid[i] * 0.06 + fine[i] * 0.04 + low[i] * 0.05 - p * 0.16;
  }
  const C = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    crack(C, w, h, rng, { x: rng() * w, y: rng() * h, angle: rng() * TAU, steps: 40 + rng() * 50, step: 5 * k, wander: 0.7, width: (0.9 + rng() * 0.8) * k, branch: 0.08 });
  }
  // faint horizontal board-form seams
  for (let s = 0; s < 2; s++) {
    const y = (0.25 + s * 0.5) * h + (rng() - 0.5) * 6 * k;
    for (let x = 0; x < w; x += 4) line(C, w, h, x, y + Math.sin(x * 0.02) * k, x + 4, y + Math.sin((x + 4) * 0.02) * k, 1.2 * k, 0.35, 'max');
  }
  const img = new Img(w, h);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = 0.5 + low[i] * 0.45 + mid[i] * 0.3 + fine[i] * 0.12;
  gradientMap(img, f, [[0, '#5f5d57'], [0.35, '#77746b'], [0.6, '#8a867b'], [0.85, '#9d988a'], [1, '#ada798']]);
  modulate(img, fbm(w, h, { cells: 4, octaves: 3, seed: seed + 6 }), 0.07, 0.06);
  // water streaks + grime from the top
  const st = streaks(w, h, seed + 7, { count: Math.round(60 * k), len: [0.15, 0.7], width: [1.5 * k, 7 * k], strength: 0.8 });
  const stb = blur(st, w, h, Math.round(2 * k), 1);
  tint(img, stb, '#4f4d45', 0.5);
  // rust bleed spots (from embedded rebar / bolts)
  const rust = new Float32Array(n);
  for (let c = 0; c < 3; c++) {
    const x = rng() * w, y = rng() * h;
    disc(rust, w, h, x, y, (3 + rng() * 3) * k, 1, 'max');
    const L = (30 + rng() * 40) * k;
    for (let t = 0; t < L; t += 1) disc(rust, w, h, x + Math.sin(t * 0.15) * k, y + t, Math.max(0.6, (2.6 - (t / L) * 2) * k), 0.75 * (1 - t / L), 'max');
  }
  tint(img, blur(rust, w, h, 2, 1), '#7c4c28', 0.55);
  strokes(img, { seed: seed + 8, len: [7 * k, 18 * k], width: [3 * k, 6 * k], opacity: 0.42, coverage: 0.6, valueJitter: 0.06, height: H, heightAmt: 0.02 });
  strokes(img, { seed: seed + 9, len: [30 * k, 70 * k], width: [8 * k, 18 * k], opacity: 0.12, coverage: 0.35, angle: 0, angleJitter: 0.2 });
  tint(img, pitM, '#3e3c37', 0.7);
  const Cm = smoothMask(C, 0.15, 0.7);
  tint(img, Cm, '#2e2d2a', 0.75);
  for (let i = 0; i < n; i++) H[i] -= C[i] * 0.14;
  return { w, h, n, k, img, H, low, mid, fine, pitM, Cm, st: stb, rng };
}

/** Paint cushion moss into img through mask M; adds to height H. Returns luminance field. */
function mossPaint(img, H, M, seed, k) {
  const { w, h } = img;
  const n = w * h;
  const wx = fbm(w, h, { cells: 6, octaves: 3, seed: seed + 3 });
  const wy = fbm(w, h, { cells: 6, octaves: 3, seed: seed + 4 });
  const c1 = worley(w, h, { cells: Math.round(14 * k), seed: seed + 1 });
  const c2 = worley(w, h, { cells: Math.round(34 * k), seed: seed + 2 });
  const f1a = warp(c1.f1, w, h, wx, wy, 16 * k);
  const f1b = warp(c2.f1, w, h, wy, wx, 8 * k);
  const fn = fbm(w, h, { cells: 70 * k, octaves: 2, seed: seed + 5 });
  const big = fbm(w, h, { cells: 3, octaves: 3, seed: seed + 6 });
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, 1 - f1a[i] * 1.15), b = Math.max(0, 1 - f1b[i] * 1.2);
    const dome = a * 0.55 + b * 0.45;
    lum[i] = 0.12 + dome * 0.62 + fn[i] * 0.22 + big[i] * 0.12;
    H[i] += M[i] * (dome * 0.12 + fn[i] * 0.035);
  }
  gradientMap(img, lum, [[0, '#121a0b'], [0.25, '#24340f'], [0.5, '#455a19'], [0.72, '#6f8424'], [0.88, '#97a636'], [1, '#bcbf55']], M, 1);
  return lum;
}

export function genConcrete(S = 512) {
  const c = concreteBase(S, 300);
  shade(c.img, c.H, { strength: 0.2, bump: 5 * c.k, ao: 0.5, aoRadius: 3, edge: 0.18 });
  const R = new Float32Array(c.n);
  for (let i = 0; i < c.n; i++) R[i] = 0.86 + c.fine[i] * 0.06 - c.st[i] * 0.1 + c.pitM[i] * 0.1;
  return {
    concrete: colorOut(c.img),
    concrete_normal: dataOut(normalMap(c.H, c.w, c.h, 4 * c.k), c.w, c.h),
    concrete_rough: dataOut(grayBytes(R, c.w, c.h), c.w, c.h),
  };
}

export function genConcreteMoss(S = 512) {
  const c = concreteBase(S, 340);
  const { w, h, n, k } = c;
  const m1 = fbm(w, h, { cells: 3, octaves: 6, seed: 351, gain: 0.55 });
  const Cb = blur(c.Cm, w, h, Math.round(5 * k), 2);
  const M = new Float32Array(n);
  const mildew = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const y = ((i / w) | 0) / h;
    const grav = 0.5 + 0.5 * Math.cos((y - 1) * TAU); // tileable: more moss at the bottom/top seam (ground contact)
    const v = m1[i] * 1.1 + grav * 0.22 + Cb[i] * 2.2 + c.pitM[i] * 0.25 - 0.12;
    M[i] = sstep(0.0, 0.22, v);
    mildew[i] = sstep(-0.35, 0.15, m1[i] * 0.9 + c.st[i] * 1.2 + grav * 0.15 - 0.1) * (1 - M[i]);
  }
  tint(c.img, mildew, '#2f3529', 0.5);
  const Mb = blur(M, w, h, Math.round(5 * k), 2);
  for (let i = 0; i < n; i++) Mb[i] = sstep(0.02, 0.5, Mb[i]) * (1 - M[i]);
  tint(c.img, Mb, '#333b22', 0.55);
  mossPaint(c.img, c.H, M, 360, k);
  strokes(c.img, { seed: 361, len: [3 * k, 8 * k], width: [1.5 * k, 3.5 * k], opacity: 0.6, coverage: 0.9, mask: M, valueJitter: 0.14, warmJitter: 0.06, bristleAmt: 0.3, height: c.H, heightAmt: 0.05 });
  shade(c.img, c.H, { strength: 0.22, bump: 5 * k, ao: 0.6, aoRadius: 3, edge: 0.25 });
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) R[i] = 0.86 + c.fine[i] * 0.05 + M[i] * 0.08;
  return {
    concrete_moss: colorOut(c.img),
    concrete_moss_normal: dataOut(normalMap(c.H, w, h, 4 * k), w, h),
    concrete_moss_rough: dataOut(grayBytes(R, w, h), w, h),
  };
}

// ---------------------------------------------------------------------------
// MOSS — dense cushion moss carpet (yellow-green highlights, near-black crevices).
// ---------------------------------------------------------------------------
export function genMoss(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const H = new Float32Array(n);
  const img = new Img(w, h, rgb('#1d2a12'));
  const M = new Float32Array(n).fill(1);
  const lum = mossPaint(img, H, M, 402, k);
  const dry = fbm(w, h, { cells: 4, octaves: 4, seed: 403 });
  for (let i = 0; i < n; i++) dry[i] = sstep(0.2, 0.55, dry[i]) * 0.55;
  tint(img, dry, '#857a3a', 0.4);
  strokes(img, { seed: 404, len: [3 * k, 8 * k], width: [1.4 * k, 3 * k], opacity: 0.75, coverage: 1.3, valueJitter: 0.2, warmJitter: 0.08, bristleAmt: 0.3, height: H, heightAmt: 0.06 });
  // sporophytes: tiny rust-red dots
  const rng = makeRng(405);
  const sp = new Float32Array(n);
  for (let c = 0; c < 220 * k * k; c++) disc(sp, w, h, rng() * w, rng() * h, (0.8 + rng()) * k, 1, 'max', 1);
  for (let i = 0; i < n; i++) sp[i] *= sstep(0.45, 0.7, lum[i]);
  tint(img, sp, '#8a4a22', 0.6);
  shade(img, H, { strength: 0.25, bump: 6 * k, ao: 0.75, aoRadius: 2, edge: 0.35 });
  return {
    moss: colorOut(img),
    moss_normal: dataOut(normalMap(H, w, h, 5 * k), w, h),
  };
}

// ---------------------------------------------------------------------------
// SOIL — dark tropical forest earth: clods, pebbles, twigs, bits of leaf, damp patches.
// ---------------------------------------------------------------------------
export function genSoil(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(501);
  const low = fbm(w, h, { cells: 4, octaves: 5, seed: 502 });
  const clod = worley(w, h, { cells: Math.round(26 * k), seed: 503 });
  const wx = fbm(w, h, { cells: 8, octaves: 2, seed: 509 }), wy = fbm(w, h, { cells: 8, octaves: 2, seed: 510 });
  const cf = warp(clod.f1, w, h, wx, wy, 6 * k);
  const fine = fbm(w, h, { cells: 90, octaves: 1, seed: 504 });
  const H = new Float32Array(n);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dome = Math.max(0, 1 - cf[i] * 1.3);
    H[i] = 0.5 + dome * 0.12 + low[i] * 0.06 + fine[i] * 0.04;
    f[i] = 0.45 + dome * 0.3 + low[i] * 0.3 + fine[i] * 0.15;
  }
  const img = new Img(w, h);
  gradientMap(img, f, [[0, '#1c150f'], [0.35, '#2e231a'], [0.6, '#403224'], [0.85, '#574530'], [1, '#6c5a43']]);
  const lat = smoothMask(fbm(w, h, { cells: 3, octaves: 3, seed: 505 }), 0.15, 0.6);
  for (let i = 0; i < n; i++) lat[i] *= 0.45;
  tint(img, lat, '#6b3c24', 0.35);
  // pebbles (few, muted)
  const peb = worley(w, h, { cells: Math.round(12 * k), seed: 506 });
  const pT = cellTable(peb.cx * peb.cy, 2), pS = cellTable(peb.cx * peb.cy, 3), pG = cellTable(peb.cx * peb.cy, 4);
  const d = img.d;
  for (let i = 0; i < n; i++) {
    const c = peb.id[i];
    if (pT[c] > 0.35) continue;
    const r = 0.14 + pS[c] * 0.16;
    const m = 1 - sstep(r - 0.05, r, peb.f1[i]);
    if (m <= 0) continue;
    const g = 0.26 + pG[c] * 0.18;
    const lit = 1 - (peb.f1[i] / r) * 0.45;
    const j = i * 4;
    d[j] += (g * 1.05 * lit - d[j]) * m * 0.9;
    d[j + 1] += (g * 0.98 * lit - d[j + 1]) * m * 0.9;
    d[j + 2] += (g * 0.88 * lit - d[j + 2]) * m * 0.9;
    H[i] += m * (1 - peb.f1[i] / r) * 0.15;
  }
  // twigs & rootlets
  const tw = new Float32Array(n);
  for (let c = 0; c < 18; c++) {
    let x = rng() * w, y = rng() * h, a = rng() * TAU;
    const steps = 4 + rng() * 8, wd = (0.9 + rng() * 1.4) * k;
    for (let s = 0; s < steps; s++) {
      const nx = x + Math.cos(a) * 6 * k, ny = y + Math.sin(a) * 6 * k;
      line(tw, w, h, x, y, nx, ny, wd, 1, 'max');
      x = nx;
      y = ny;
      a += (rng() - 0.5) * 0.5;
    }
  }
  tint(img, tw, '#54402a', 0.75);
  for (let i = 0; i < n; i++) H[i] += tw[i] * 0.08;
  strokes(img, { seed: 507, len: [5 * k, 12 * k], width: [2 * k, 5 * k], opacity: 0.45, coverage: 0.7, valueJitter: 0.1, warmJitter: 0.05, height: H, heightAmt: 0.03 });
  const damp = smoothMask(fbm(w, h, { cells: 5, octaves: 3, seed: 508 }), 0.1, 0.5);
  for (let i = 0; i < n; i++) damp[i] *= 0.35;
  tint(img, damp, '#120d09', 0.55);
  shade(img, H, { strength: 0.22, bump: 5 * k, ao: 0.6, aoRadius: 3, edge: 0.2 });
  return {
    soil: colorOut(img),
    soil_normal: dataOut(normalMap(H, w, h, 4 * k), w, h),
  };
}

// ---------------------------------------------------------------------------
// ROCK — weathered grey boulder skin: strata, fractures, lichen rosettes, moss in cracks.
// ---------------------------------------------------------------------------
export function genRock(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(601);
  const wx = fbm(w, h, { cells: 4, octaves: 3, seed: 611 }), wy = fbm(w, h, { cells: 4, octaves: 3, seed: 612 });
  const F1 = facets(w, h, { cells: 3, seed: 620, slope: 0.55, base: 0.35 });
  const F2 = facets(w, h, { cells: 9, seed: 621, slope: 0.3, base: 0.1 });
  const h1 = warp(F1.h, w, h, wx, wy, 30 * k), e1 = warp(F1.edge, w, h, wx, wy, 30 * k);
  const h2 = warp(F2.h, w, h, wy, wx, 14 * k), e2 = warp(F2.edge, w, h, wy, wx, 14 * k);
  const id1 = warp(F1.id, w, h, wx, wy, 30 * k, null, true);
  const ridged = fbm(w, h, { cells: 3, octaves: 5, seed: 602, mode: 'ridged', gain: 0.5 });
  const low = fbm(w, h, { cells: 2, octaves: 4, seed: 603 });
  const fine = fbm(w, h, { cells: 70, octaves: 2, seed: 606 });
  const H = new Float32Array(n);
  const groove = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const g1 = (1 - sstep(0.0, 0.06, e1[i])) * sstep(-0.1, 0.25, low[i] + ridged[i] * 0.3 - 0.15);
    const g2 = (1 - sstep(0.0, 0.03, e2[i])) * 0.25 * sstep(0.0, 0.3, -low[i]);
    groove[i] = Math.max(g1, g2);
    H[i] = h1[i] * 0.55 + h2[i] * 0.22 + ridged[i] * 0.12 + fine[i] * 0.012 - g1 * 0.08 - g2 * 0.04;
  }
  const C = new Float32Array(n);
  for (let c = 0; c < 5; c++) crack(C, w, h, rng, { x: rng() * w, y: rng() * h, angle: rng() * TAU, steps: 25 + rng() * 35, step: 5 * k, wander: 0.6, width: 1.3 * k, branch: 0.07, vary: 1 });
  for (let i = 0; i < n; i++) {
    H[i] -= C[i] * 0.03;
    if (C[i] > groove[i]) groove[i] = C[i] * 0.8;
  }
  const img = new Img(w, h);
  const tone = cellTable(F1.cx * F1.cy, 31);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = 0.45 + low[i] * 0.25 + (tone[id1[i]] - 0.5) * 0.25 + ridged[i] * 0.15 + fine[i] * 0.08;
  gradientMap(img, f, [[0, '#33342f'], [0.3, '#4b4c46'], [0.5, '#62625b'], [0.7, '#7a786f'], [0.9, '#938f84'], [1, '#a29d90']]);
  modulate(img, fbm(w, h, { cells: 3, octaves: 3, seed: 608 }), 0.08, 0.08);
  strokes(img, { seed: 609, len: [12 * k, 26 * k], width: [4 * k, 8 * k], opacity: 0.4, coverage: 0.6, valueJitter: 0.07, warmJitter: 0.03, height: H, heightAmt: 0.006 });
  // lichen rosettes (pale mint / ochre) with ragged edges
  const lich = new Float32Array(n), lichO = new Float32Array(n);
  for (let c = 0; c < 45 * k * k; c++) {
    const x = rng() * w, y = rng() * h, r = (3 + Math.pow(rng(), 2) * 22) * k;
    disc(rng() < 0.78 ? lich : lichO, w, h, x, y, r, 0.6 + rng() * 0.4, 'max', 0.7);
  }
  const lichN = fbm(w, h, { cells: 40, octaves: 2, seed: 610 });
  for (let i = 0; i < n; i++) {
    lich[i] *= sstep(-0.25, 0.25, lichN[i]) * (1 - groove[i]);
    lichO[i] *= sstep(-0.15, 0.35, lichN[i]) * (1 - groove[i]);
  }
  tint(img, lich, '#a9ad96', 0.5);
  tint(img, lichO, '#a6843f', 0.4);
  // grime and moss in the grooves
  const Gb = blur(groove, w, h, Math.round(4 * k), 2);
  tint(img, smoothMask(Gb, 0.05, 0.5), '#2a2b25', 0.45);
  const M = new Float32Array(n);
  for (let i = 0; i < n; i++) M[i] = sstep(0.12, 0.45, Gb[i] * 1.3 + low[i] * 0.4 - 0.12) * 0.9;
  mossPaint(img, H, M, 613, k);
  tint(img, smoothMask(groove, 0.3, 0.9), '#181916', 0.7);
  shade(img, H, { strength: 0.45, bump: 90 * k, ao: 0.5, aoRadius: Math.round(5 * k), aoScale: 4, edge: 0.4 });
  return {
    rock: colorOut(img),
    rock_normal: dataOut(normalMap(H, w, h, 70 * k), w, h),
  };
}

// ---------------------------------------------------------------------------
// GRAVEL — road shoulder: grey crushed stone, some red laterite, dust between.
// ---------------------------------------------------------------------------
export function genGravel(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const low = fbm(w, h, { cells: 4, octaves: 4, seed: 703 });
  const img = new Img(w, h);
  const base = new Float32Array(n);
  for (let i = 0; i < n; i++) base[i] = 0.5 + low[i] * 0.4;
  gradientMap(img, base, [[0, '#2f2a25'], [0.5, '#4a4038'], [1, '#6a5a4a']]);
  const H = new Float32Array(n);
  const cols = ['#6f6d68', '#85817a', '#5a5955', '#9a9488', '#76695c', '#80553e', '#4d4c4a', '#8d8a82'].map(rgb);
  const d = img.d;
  const wx = fbm(w, h, { cells: 16, octaves: 2, seed: 704 }), wy = fbm(w, h, { cells: 16, octaves: 2, seed: 705 });
  for (const [cells, sc, seed] of [[64, 0.8, 702], [30, 1, 701]]) {
    const W = worley(w, h, { cells: Math.round(cells * k), seed });
    const f1 = warp(W.f1, w, h, wx, wy, 3 * k), f2 = warp(W.f2, w, h, wx, wy, 3 * k);
    const id = warp(W.id, w, h, wx, wy, 3 * k, null, true);
    const rT = cellTable(W.cx * W.cy, 1), cT = cellTable(W.cx * W.cy, 2);
    for (let i = 0; i < n; i++) {
      const c = id[i];
      const r = 0.4 + rT[c] * 0.15;
      const e = f2[i] - f1[i];
      const m = sstep(0.03, 0.14, e) * (f1[i] < r * 1.6 ? 1 : 0);
      if (m <= 0) continue;
      const col = cols[(cT[c] * cols.length) | 0];
      const lit = (0.72 + 0.45 * (1 - f1[i] / (r * 1.6))) * sc;
      const j = i * 4;
      d[j] += (col[0] * lit - d[j]) * m;
      d[j + 1] += (col[1] * lit - d[j + 1]) * m;
      d[j + 2] += (col[2] * lit - d[j + 2]) * m;
      const hh = m * (0.6 - f1[i]) * 0.5 * sc;
      if (hh > H[i]) H[i] = hh;
    }
  }
  const dust = smoothMask(low, 0.0, 0.6);
  for (let i = 0; i < n; i++) dust[i] *= 0.4;
  tint(img, dust, '#857762', 0.45);
  strokes(img, { seed: 706, len: [4 * k, 9 * k], width: [2 * k, 4 * k], opacity: 0.35, coverage: 0.5, valueJitter: 0.08 });
  shade(img, H, { strength: 0.3, bump: 8 * k, ao: 0.7, aoRadius: 2, edge: 0.3 });
  adjust(img, { saturation: 0.8 });
  return {
    gravel: colorOut(img),
    gravel_normal: dataOut(normalMap(H, w, h, 6 * k), w, h),
  };
}

// ---------------------------------------------------------------------------
// LEAF LITTER — forest floor of fallen tropical leaves over dark soil.
// ---------------------------------------------------------------------------
export function genLeafLitter(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(801);
  const img = new Img(w, h, rgb('#1f1711'));
  modulate(img, fbm(w, h, { cells: 4, octaves: 4, seed: 802 }), 0.35);
  const H = new Float32Array(n);
  const d = img.d;
  const pal = ['#5a3a1e', '#6f4824', '#83582a', '#9a7034', '#3c2818', '#8a7a62', '#a8823a', '#6a6430', '#4f2f1a', '#77502c'].map(rgb);
  const count = Math.round(300 * k * k);
  for (let c = 0; c < count; c++) {
    const x = rng() * w, y = rng() * h, a = rng() * TAU;
    const shape = rng();
    const L = (10 + Math.pow(rng(), 1.5) * 22) * k;
    const Wd = L * (shape < 0.5 ? 0.42 + rng() * 0.2 : shape < 0.85 ? 0.26 + rng() * 0.08 : 0.6);
    const col = pal[(rng() * pal.length) | 0];
    const bright = 0.75 + rng() * 0.4;
    const curl = (rng() - 0.5) * 0.6;
    const holes = rng() < 0.3;
    const lift = 0.02 + (c / count) * 0.14;
    const ca = Math.cos(a), sa = Math.sin(a);
    const ext = L + 6 * k;
    const sx = 2.5 * k, sy = 3.5 * k; // drop shadow offset
    for (let py = Math.floor(y - ext); py < y + ext; py++) {
      const wy = ((py % h) + h) % h;
      for (let px = Math.floor(x - ext); px < x + ext; px++) {
        const i = wy * w + (((px % w) + w) % w);
        const j = i * 4;
        // shadow sample (shape evaluated at offset position)
        for (let pass = 0; pass < 2; pass++) {
          const rx = px - x - (pass === 0 ? sx : 0), ry = py - y - (pass === 0 ? sy : 0);
          const u = (rx * ca + ry * sa) / L;
          if (u <= -1 || u >= 1) continue;
          const v = (-rx * sa + ry * ca) / Wd - curl * u * u;
          const prof = Math.sqrt(1 - u * u) * (1 - 0.35 * u) * (shape > 0.85 ? 1 + 0.25 * Math.cos(u * 3) : 1);
          const av = Math.abs(v);
          if (av >= prof) continue;
          const e = av / prof;
          if (pass === 0) {
            const s = 0.45 * (1 - e * e);
            d[j] *= 1 - s;
            d[j + 1] *= 1 - s;
            d[j + 2] *= 1 - s;
            continue;
          }
          if (holes && Math.sin(u * 23 + v * 9) * Math.sin(u * 11 - v * 13) > 0.72) continue;
          const vein = av < 0.06 ? 1.15 : Math.abs((((u * 5 + av * 2.4) % 1) + 1) % 1 - 0.5) < 0.05 ? 1.08 : 1;
          const side = v > 0 ? 1.06 : 0.92; // folded along the midrib
          const sh = (1 - 0.3 * e * e) * bright * vein * side * (1 - 0.15 * (u + 1) * 0.5);
          d[j] = col[0] * sh;
          d[j + 1] = col[1] * sh;
          d[j + 2] = col[2] * sh;
          H[i] = lift + (1 - e) * 0.025 + (v > 0 ? 0.004 : 0);
        }
      }
    }
  }
  const sp = new Float32Array(n);
  for (let c = 0; c < 160 * k * k; c++) disc(sp, w, h, rng() * w, rng() * h, (1 + rng() * 3) * k, 1, 'max', 0.5);
  tint(img, sp, '#21170f', 0.55);
  strokes(img, { seed: 803, len: [5 * k, 12 * k], width: [2 * k, 4 * k], opacity: 0.35, coverage: 0.6, valueJitter: 0.08 });
  shade(img, H, { strength: 0.25, bump: 10 * k, ao: 0.7, aoRadius: 3, edge: 0.15 });
  adjust(img, { saturation: 0.85 });
  return {
    leaf_litter: colorOut(img),
    leaf_litter_normal: dataOut(normalMap(H, w, h, 8 * k), w, h),
  };
}

// ---------------------------------------------------------------------------
// PUDDLE MASK — grayscale tileable puddle shapes (white = standing water).
// ---------------------------------------------------------------------------
export function genPuddleMask(S = 512) {
  const w = S, h = S, n = w * h;
  const a = fbm(w, h, { cells: 3, octaves: 5, seed: 901, gain: 0.55 });
  const b = fbm(w, h, { cells: 24, octaves: 2, seed: 902 });
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = sstep(0.16, 0.34, a[i] + b[i] * 0.05);
  const fb = blur(f, w, h, 2, 2);
  return { puddle_mask: dataOut(grayBytes(fb, w, h), w, h) };
}
