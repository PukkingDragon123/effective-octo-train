// Ground & masonry surfaces: asphalt, concrete (+moss), moss, soil, rock, gravel,
// leaf litter, puddle mask. All tileable, hand-painted (palette ramps + stroke stamping +
// baked soft light), with companion normal / roughness maps from height.
import { makeRng } from '../core/math.js';
import { fbm, worley, blur, crack, line, disc, warp, cellTable, upsample, facets } from './noise.js';
import {
  Img, ramp, gradientMap, strokes, shade, normalMap, grayBytes, colorOut, dataOut, tint, modulate, sstep, rgb, streaks, adjust, smask, field, organic, quantile,
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
// ASPHALT — surface material of an old Thai rural road (the world maps one tile to ~3.2 m and
// draws the large-scale cracks, patches, potholes, ruts and markings in its own shader, so
// this tile only carries what repeats well): fine weathered binder, exposed aggregate chips at
// a believable 0.5–2 cm scale, ravelled voids, faint hairline crazing, dust in the low spots,
// soft tonal drift and stippled brushwork.
// ---------------------------------------------------------------------------
export function genAsphalt(S = 1024) {
  const w = S, h = S, n = w * h, k = S / 1024;
  const rng = makeRng(101);
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: 11 });
  const mid = fbm(w, h, { cells: 10, octaves: 3, seed: 12 });
  const grain = fbm(w, h, { cells: 256, octaves: 1, seed: 13 });
  const wx = fbm(w, h, { cells: 64, octaves: 1, seed: 19 }), wy = fbm(w, h, { cells: 64, octaves: 1, seed: 20 });
  // fine aggregate (~1.2 cm cells) + sparse coarse chips (~3 cm)
  const fineW = worley(w, h, { cells: Math.round(240 * k), seed: 14 });
  const coarse = worley(w, h, { cells: Math.round(96 * k), seed: 15 });
  const nf = fineW.cx * fineW.cy, nc = coarse.cx * coarse.cy;
  const fSel = cellTable(nf, 3), fCol = cellTable(nf, 7), fSize = cellTable(nf, 9);
  const cSel = cellTable(nc, 4), cCol = cellTable(nc, 8), cSize = cellTable(nc, 10);
  const H = new Float32Array(n), stone = new Float32Array(n), sCol = new Float32Array(n), wear = new Float32Array(n), voids = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const wr = sstep(-0.35, 0.45, low[i] * 0.7 + mid[i] * 0.6);
    wear[i] = wr;
    // fine chips: irregular (edge noise), more exposed where the binder is worn
    const ff = fineW.f1[i] + wx[i] * 0.12;
    const fc = fineW.id[i];
    let st = 0, col = 0, hh = 0;
    if (fSel[fc] < 0.32 + 0.4 * wr) {
      // angular chip: Voronoi-cell polygon shrunk by a per-chip margin, corners softened by f1
      const e = Math.min((fineW.f2[i] - fineW.f1[i]) * 2.4 - 0.2 + fSize[fc] * 0.25 + wx[i] * 0.1, 1.1 - ff * 1.5);
      if (e > 0) {
        st = sstep(0.0, 0.25, e) * (0.45 + 0.55 * wr);
        col = fCol[fc];
        hh = Math.sqrt(e) * 0.07;
      }
    } else if (fSel[fc] > 0.93) {
      // ravelled void where a chip was plucked out
      const e = (fineW.f2[i] - fineW.f1[i]) * 2.4 - 0.35 + wx[i] * 0.1;
      if (e > 0) voids[i] = sstep(0.0, 0.3, e) * (0.4 + 0.6 * wr);
    }
    const cf = coarse.f1[i] + wy[i] * 0.1;
    const cc = coarse.id[i];
    if (cSel[cc] < 0.22) {
      const e = Math.min((coarse.f2[i] - coarse.f1[i]) * 2.2 - 0.32 + cSize[cc] * 0.2 + wy[i] * 0.1, 1.0 - cf * 1.6);
      if (e > 0) {
        const s2 = sstep(0.0, 0.2, e) * (0.55 + 0.45 * wr);
        if (s2 > st) {
          st = s2;
          col = cCol[cc] + 1;
        }
        hh = Math.max(hh, Math.sqrt(e) * 0.1);
      }
    }
    stone[i] = st;
    sCol[i] = col;
    H[i] = 0.5 + hh + grain[i] * 0.015 + mid[i] * 0.03 - voids[i] * 0.06;
  }
  // faint hairline crazing in the most worn areas (big cracks come from the road shader)
  const C = new Float32Array(n);
  for (let c = 0; c < 9; c++) {
    crack(C, w, h, rng, { x: rng() * w, y: rng() * h, angle: rng() * TAU, steps: 18 + rng() * 30, step: 4 * k, wander: 1.1, width: (0.55 + rng() * 0.4) * k, branch: 0.12, val: 0.6 + rng() * 0.4, vary: 1 });
  }
  const crazeM = smask(low, -0.1, 0.4);
  for (let i = 0; i < n; i++) C[i] *= 0.35 + 0.65 * crazeM[i];
  // --- colour
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.5 + mid[i] * 0.3 + low[i] * 0.25 + grain[i] * 0.12 + wear[i] * 0.12), [
    [0, '#26272a'], [0.35, '#303134'], [0.6, '#3a3b3d'], [0.85, '#46464a'], [1, '#525150'],
  ]);
  modulate(img, fbm(w, h, { cells: 4, octaves: 3, seed: 18 }), 0.07, 0.06); // cool fresh binder vs warm dusty
  const stoneCols = ['#5f6063', '#6d6a64', '#7c766c', '#55585c', '#8a8378', '#696d70', '#76695c', '#8e8a82', '#5a564f'].map(rgb);
  const d = img.d;
  for (let i = 0; i < n; i++) {
    const s = stone[i];
    if (s <= 0.01) continue;
    const ci = sCol[i];
    const c = stoneCols[((ci % 1) * stoneCols.length) | 0];
    const j = i * 4;
    const a = s * (ci >= 1 ? 0.75 : 0.62);
    d[j] += (c[0] - d[j]) * a;
    d[j + 1] += (c[1] - d[j + 1]) * a;
    d[j + 2] += (c[2] - d[j + 2]) * a;
  }
  tint(img, voids, '#141517', 0.75);
  // dust settled in the low, unworn areas; faint oil darkening
  tint(img, field(n, (i) => sstep(0.1, 0.7, -low[i] * 0.6 + mid[i] * 0.5) * 0.45), '#5c5850', 0.35);
  tint(img, smask(fbm(w, h, { cells: 5, octaves: 4, seed: 16 }), 0.3, 0.7, 0.35), '#1c1c1e', 0.4);
  strokes(img, { seed: 21, len: [5 * k, 12 * k], width: [2 * k, 5 * k], opacity: 0.35, coverage: 0.5, valueJitter: 0.07, warmJitter: 0.03, bristleAmt: 0.45, height: H, heightAmt: 0.012 });
  strokes(img, { seed: 23, len: [30 * k, 80 * k], width: [10 * k, 22 * k], opacity: 0.12, coverage: 0.35, valueJitter: 0.05, warmJitter: 0.025, bristleAmt: 0.5 });
  const Cm = smask(C, 0.1, 0.7);
  tint(img, Cm, '#141415', 0.6);
  const Ce = blur(C, w, h, Math.max(1, Math.round(2 * k)), 1);
  tint(img, field(n, (i) => sstep(0.03, 0.25, Ce[i]) * (1 - Cm[i]) * 0.3), '#6f6a5c', 1);
  for (let i = 0; i < n; i++) H[i] -= C[i] * 0.06;
  shade(img, H, { strength: 0.2, bump: 9 * k, ao: 0.5, aoRadius: Math.max(1, Math.round(2 * k)), edge: 0.25 });
  adjust(img, { saturation: 0.8 });
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) R[i] = 0.9 - stone[i] * 0.16 + grain[i] * 0.04 + voids[i] * 0.06 + Cm[i] * 0.05 - wear[i] * 0.04;
  return {
    asphalt: colorOut(img),
    asphalt_normal: dataOut(normalMap(H, w, h, 6 * k), w, h),
    asphalt_rough: dataOut(grayBytes(R, w, h), w, h),
    asphalt_height: dataOut(grayBytes(H, w, h, 0.35, 0.7), w, h),
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
  const crumbW = worley(w, h, { cells: Math.round(80 * k), seed: 512 });
  const crumbE = warp(field(n, (i) => crumbW.f2[i] - crumbW.f1[i]), w, h, wx, wy, 5 * k);
  const H = new Float32Array(n);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dome = Math.max(0, 1 - cf[i] * 1.3);
    const cr = Math.sqrt(Math.max(0, Math.min(1, crumbE[i] * 3 - 0.1)));
    H[i] = 0.5 + dome * 0.12 + cr * 0.03 + low[i] * 0.06 + fine[i] * 0.025;
    f[i] = 0.42 + dome * 0.28 + cr * 0.08 + low[i] * 0.3 + fine[i] * 0.12;
  }
  const img = new Img(w, h);
  gradientMap(img, f, [[0, '#1c150f'], [0.35, '#2e231a'], [0.6, '#403224'], [0.85, '#574530'], [1, '#6c5a43']]);
  const lat = smoothMask(fbm(w, h, { cells: 3, octaves: 3, seed: 505 }), 0.15, 0.6);
  for (let i = 0; i < n; i++) lat[i] *= 0.45;
  tint(img, lat, '#6b3c24', 0.35);
  // small half-buried stones: angular, earth-coloured, lit by the shared height shading
  const peb = worley(w, h, { cells: Math.round(30 * k), seed: 506 });
  const pT = cellTable(peb.cx * peb.cy, 2), pS = cellTable(peb.cx * peb.cy, 3), pG = cellTable(peb.cx * peb.cy, 4);
  const d = img.d;
  for (let i = 0; i < n; i++) {
    const c = peb.id[i];
    if (pT[c] > 0.16) continue;
    const e = Math.min((peb.f2[i] - peb.f1[i]) * 2.0 - 0.45 + pS[c] * 0.3 + fine[i] * 0.12, 1 - peb.f1[i] * 1.6);
    if (e <= 0) continue;
    const m = sstep(0.0, 0.1, e) * (0.7 + 0.3 * pS[c]);
    const g = 0.2 + pG[c] * 0.14 + fine[i] * 0.03;
    const j = i * 4;
    d[j] += (g * 1.12 - d[j]) * m;
    d[j + 1] += (g * 1.0 - d[j + 1]) * m;
    d[j + 2] += (g * 0.82 - d[j + 2]) * m;
    H[i] += Math.sqrt(Math.min(1, e * 3)) * 0.12 * m;
  }
  // tiny leaf fragments and organic flecks
  const rngF = makeRng(511);
  const frag = new Float32Array(n), fragD = new Float32Array(n);
  for (let c = 0; c < 180 * k * k; c++) {
    const x = rngF() * w, y = rngF() * h, a = rngF() * TAU, L = (2 + rngF() * 5) * k;
    line(rngF() < 0.6 ? frag : fragD, w, h, x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, (1 + rngF() * 1.5) * k, 1, 'max');
  }
  tint(img, frag, '#5e4628', 0.55);
  tint(img, fragD, '#17110b', 0.6);
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
  shade(img, H, { strength: 0.3, bump: 9 * k, ao: 0.65, aoRadius: 2, edge: 0.25 });
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
  const fine = fbm(w, h, { cells: 120, octaves: 1, seed: 707 });
  const img = new Img(w, h);
  // packed dust / laterite fines between the stones
  gradientMap(img, field(n, (i) => 0.5 + low[i] * 0.4 + fine[i] * 0.15), [[0, '#2c2620'], [0.5, '#463b30'], [1, '#62533f']]);
  tint(img, smask(fbm(w, h, { cells: 3, octaves: 3, seed: 708 }), 0.1, 0.5, 0.5), '#6a3e26', 0.35); // red laterite
  const H = new Float32Array(n);
  const top = new Float32Array(n).fill(-1);
  const cols = ['#5f5d58', '#6e6a64', '#545350', '#7a756c', '#68605a', '#6a4c3a', '#4c4a45', '#7c7870', '#8a8478', '#5d6062'].map(rgb);
  const d = img.d;
  const wx = fbm(w, h, { cells: 16, octaves: 2, seed: 704 }), wy = fbm(w, h, { cells: 16, octaves: 2, seed: 705 });
  // three layers: small, medium, a few larger stones lying on top (painter's algorithm by height)
  for (const [cells, keep, lift, seed] of [[60, 0.75, 0.0, 702], [34, 0.6, 0.05, 701], [18, 0.22, 0.1, 709]]) {
    const W = worley(w, h, { cells: Math.round(cells * k), seed });
    const f1 = warp(W.f1, w, h, wx, wy, 3 * k), f2 = warp(W.f2, w, h, wx, wy, 3 * k);
    const id = warp(W.id, w, h, wx, wy, 3 * k, null, true);
    const nc = W.cx * W.cy;
    const rT = cellTable(nc, seed + 1), cT = cellTable(nc, seed + 2), sT = cellTable(nc, seed + 3);
    for (let i = 0; i < n; i++) {
      const c = id[i];
      if (sT[c] > keep) continue;
      const e = Math.min((f2[i] - f1[i]) * 2.2 - 0.18 - rT[c] * 0.12, 1.05 - f1[i] * 1.4) + fine[i] * 0.05;
      if (e <= 0) continue;
      const dome = Math.sqrt(Math.min(1, e * 2.2));
      const hh = lift + dome * (0.08 + rT[c] * 0.05);
      if (hh <= top[i]) continue;
      top[i] = hh;
      const m = sstep(0.0, 0.08, e);
      const col = cols[(cT[c] * cols.length) | 0];
      const v = 0.85 + fine[i] * 0.12 + (rT[c] - 0.5) * 0.2;
      const j = i * 4;
      d[j] += (col[0] * v - d[j]) * m;
      d[j + 1] += (col[1] * v - d[j + 1]) * m;
      d[j + 2] += (col[2] * v - d[j + 2]) * m;
      H[i] = hh * m + H[i] * (1 - m);
    }
  }
  const dust = smask(low, 0.0, 0.6);
  for (let i = 0; i < n; i++) dust[i] *= 0.35;
  tint(img, dust, '#857762', 0.4);
  strokes(img, { seed: 706, len: [4 * k, 9 * k], width: [2 * k, 4 * k], opacity: 0.3, coverage: 0.5, valueJitter: 0.08 });
  shade(img, H, { strength: 0.38, bump: 10 * k, ao: 0.75, aoRadius: Math.max(1, Math.round(2 * k)), edge: 0.3 });
  adjust(img, { saturation: 0.8 });
  return {
    gravel: colorOut(img),
    gravel_normal: dataOut(normalMap(H, w, h, 7 * k), w, h),
  };
}

// ---------------------------------------------------------------------------
// LEAF LITTER — forest floor of fallen tropical leaves over dark soil.
// ---------------------------------------------------------------------------
export function genLeafLitter(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(801);
  const img = new Img(w, h, rgb('#1d150f'));
  modulate(img, fbm(w, h, { cells: 4, octaves: 4, seed: 802 }), 0.35);
  const nf = fbm(w, h, { cells: 40, octaves: 2, seed: 804 });
  const nd = fbm(w, h, { cells: 9, octaves: 3, seed: 805 });
  const H = new Float32Array(n);
  const d = img.d;
  const pal = ['#5a3a1e', '#6f4824', '#83582a', '#9a7034', '#3c2818', '#7d6a50', '#a8823a', '#6a6430', '#4f2f1a', '#77502c', '#8c4a22', '#2e2016'].map(rgb);
  const decay = rgb('#2a1c12'), under = rgb('#a89478');
  const count = Math.round(560 * k * k);
  const col = [0, 0, 0];
  for (let c = 0; c < count; c++) {
    const x = rng() * w, y = rng() * h, a = rng() * TAU;
    const shape = rng();
    const L = (9 + Math.pow(rng(), 1.5) * 22) * k;
    const Wd = L * (shape < 0.5 ? 0.42 + rng() * 0.18 : shape < 0.85 ? 0.24 + rng() * 0.08 : 0.58);
    const base = pal[(rng() * pal.length) | 0];
    const bright = 0.78 + rng() * 0.36;
    const curl = (rng() - 0.5) * 0.7;
    const holes = rng() < 0.3;
    const flip = rng() < 0.1; // showing the paler underside
    const rot = rng() * 0.6; // how decomposed
    const lift = 0.02 + (c / count) * 0.14;
    const ca = Math.cos(a), sa = Math.sin(a);
    const ext = L + 6 * k;
    const sx = 2.2 * k, sy = 3 * k; // soft drop shadow offset
    for (let py = Math.floor(y - ext); py < y + ext; py++) {
      const wy = ((py % h) + h) % h;
      for (let px = Math.floor(x - ext); px < x + ext; px++) {
        const i = wy * w + (((px % w) + w) % w);
        const j = i * 4;
        for (let pass = 0; pass < 2; pass++) {
          const rx = px - x - (pass === 0 ? sx : 0), ry = py - y - (pass === 0 ? sy : 0);
          const u = (rx * ca + ry * sa) / L;
          if (u <= -1 || u >= 1) continue;
          const v = (-rx * sa + ry * ca) / Wd - curl * u * u;
          let prof = Math.sqrt(1 - u * u) * (1 - 0.3 * u);
          if (u > 0.55) prof *= 1 - (u - 0.55) * 0.9; // pointed tip
          if (shape > 0.85) prof *= 1 + 0.2 * Math.cos(u * 3);
          prof *= 1 + nf[i] * 0.12; // ragged margin
          const av = Math.abs(v);
          if (av >= prof) continue;
          const e = av / prof;
          if (pass === 0) {
            const sh = 0.4 * (1 - e * e);
            d[j] *= 1 - sh;
            d[j + 1] *= 1 - sh;
            d[j + 2] *= 1 - sh;
            continue;
          }
          if (holes && nf[i] + nd[i] * 0.5 > 0.5 - rot * 0.3) continue; // decay holes, ragged
          // base colour, decay mottling toward dark brown, paler underside
          const mot = sstep(-0.1, 0.5, nd[i] * 0.8 + nf[i] * 0.5 + rot - 0.2) * 0.7;
          col[0] = base[0] + (decay[0] - base[0]) * mot;
          col[1] = base[1] + (decay[1] - base[1]) * mot;
          col[2] = base[2] + (decay[2] - base[2]) * mot;
          if (flip) {
            col[0] += (under[0] - col[0]) * 0.35;
            col[1] += (under[1] - col[1]) * 0.35;
            col[2] += (under[2] - col[2]) * 0.35;
          }
          // venation: midrib + pinnate laterals sweeping to the tip
          const q = u * 5.5 - av * 2.2 / (prof + 0.2);
          const lat = Math.abs(q - Math.round(q));
          let vein = av < 0.05 ? 1.22 : lat < 0.06 && e < 0.85 ? 1.09 : 1;
          if (flip) vein = av < 0.07 ? 1.15 : vein;
          const side = v > 0 ? 1.07 : 0.9; // folded along the midrib
          const sh = (1 - 0.32 * e * e) * bright * vein * side * (1 - 0.12 * (u + 1) * 0.5);
          d[j] = col[0] * sh;
          d[j + 1] = col[1] * sh;
          d[j + 2] = col[2] * sh;
          H[i] = lift + (1 - e) * 0.025 + (v > 0 ? 0.004 : 0) + (av < 0.05 ? 0.006 : 0);
        }
      }
    }
  }
  // twigs and seed husks
  const tw = new Float32Array(n);
  for (let c = 0; c < 22 * k * k; c++) {
    let x = rng() * w, y = rng() * h, a = rng() * TAU;
    const steps = 3 + rng() * 6, wd = (0.8 + rng() * 1.2) * k;
    for (let st = 0; st < steps; st++) {
      const nx = x + Math.cos(a) * 6 * k, ny = y + Math.sin(a) * 6 * k;
      line(tw, w, h, x, y, nx, ny, wd, 1, 'max');
      x = nx;
      y = ny;
      a += (rng() - 0.5) * 0.6;
    }
  }
  tint(img, tw, '#3a2a1a', 0.85);
  for (let i = 0; i < n; i++) H[i] += tw[i] * 0.05;
  const sp = new Float32Array(n);
  for (let c = 0; c < 120 * k * k; c++) disc(sp, w, h, rng() * w, rng() * h, (1 + rng() * 2.5) * k, 1, 'max', 0.5);
  tint(img, sp, '#1d140d', 0.5);
  strokes(img, { seed: 803, len: [5 * k, 12 * k], width: [2 * k, 4 * k], opacity: 0.35, coverage: 0.6, valueJitter: 0.08 });
  shade(img, H, { strength: 0.25, bump: 10 * k, ao: 0.7, aoRadius: 3, edge: 0.15 });
  adjust(img, { saturation: 0.82 });
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
