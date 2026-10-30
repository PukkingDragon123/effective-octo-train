// Vehicle materials: old green-yellow Thai taxi paint (neutral multiplier + coloured
// variants), dirty chrome, rubber, leather / fabric seats, dash plastic, carpet, headliner,
// glass dirt (RGBA overlays).
import { makeRng } from '../core/math.js';
import { fbm, worley, blur, line, disc, drip, cellTable, crack } from './noise.js';
import {
  Img, gradientMap, strokes, shade, normalMap, grayBytes, colorOut, dataOut, tint, modulate, sstep, smask, field, blotches, adjust, rgb,
} from './painter.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// TAXI PAINT — 25-year-old single-stage enamel. v-up: grime and mud collect toward the
// bottom of the texture (map v=0 to the sills). Keys:
//   taxi_paint        near-white weathering layer, multiply with material.color
//   taxi_paint_green  / taxi_paint_yellow   fully painted versions (lower body / roof)
//   taxi_paint_normal (orange peel, dings, scratches)  taxi_paint_rough
// ---------------------------------------------------------------------------
export function genTaxiPaint(S = 1024) {
  const w = S, h = S, n = w * h, k = S / 1024;
  const rng = makeRng(2300);
  const peel = fbm(w, h, { cells: 64, octaves: 2, seed: 2301 });
  const low = fbm(w, h, { cells: 3, octaves: 5, seed: 2302 });
  const mid = fbm(w, h, { cells: 10, octaves: 3, seed: 2303 });
  const H = field(n, (i) => 0.5 + peel[i] * 0.012);
  // dings (soft dents)
  const dings = new Float32Array(n);
  for (let c = 0; c < 14; c++) disc(dings, w, h, rng() * w, rng() * h, (8 + rng() * 26) * k, 0.5 + rng() * 0.5, 'max');
  // swirl micro scratches + a few deep keyed scratches
  const swirl = new Float32Array(n), deep = new Float32Array(n);
  for (let c = 0; c < 160 * k * k; c++) {
    const cx = rng() * w, cy = rng() * h, r = (20 + rng() * 120) * k, a0 = rng() * TAU, len = 0.3 + rng() * 0.9;
    let px = cx + Math.cos(a0) * r, py = cy + Math.sin(a0) * r;
    for (let t = 1; t <= 8; t++) {
      const a = a0 + (len * t) / 8;
      const nx = cx + Math.cos(a) * r, ny = cy + Math.sin(a) * r;
      line(swirl, w, h, px, py, nx, ny, 0.7 * k, 0.5 + rng() * 0.5, 'max');
      px = nx;
      py = ny;
    }
  }
  for (let c = 0; c < 7; c++) crack(deep, w, h, rng, { x: rng() * w, y: rng() * h, angle: (rng() - 0.5) * 0.6 + (rng() < 0.5 ? 0 : Math.PI), steps: 20 + rng() * 40, step: 6 * k, wander: 0.08, width: (1 + rng() * 0.8) * k, branch: 0, taper: 0.995 });
  // chips (stone chips, door dings) showing primer / rust
  const chips = new Float32Array(n), chipRust = new Float32Array(n);
  for (let c = 0; c < 140 * k * k; c++) {
    const y = Math.pow(rng(), 0.6) * h; // more toward the bottom
    const x = rng() * w, r = (1 + Math.pow(rng(), 3) * 5) * k;
    disc(chips, w, h, x, y, r * 1.4, 1, 'max', 1);
    if (r > 2.5 * k) disc(chipRust, w, h, x, y, r * 0.8, 1, 'max', 1);
  }
  const rustRun = drip(blur(chipRust, w, h, 2, 1), w, h, 2304, 0.97, 0.99);
  // water spots
  const spots = new Float32Array(n);
  for (let c = 0; c < 220 * k * k; c++) {
    const x = rng() * w, y = rng() * h, r = (3 + rng() * 8) * k;
    disc(spots, w, h, x, y, r, 0.6, 'max');
    disc(spots, w, h, x, y, r * 0.7, 0, 'set');
  }
  // grime gradient toward the bottom + mud splatter
  const grime = new Float32Array(n), mud = new Float32Array(n);
  for (let y = 0, i = 0; y < h; y++) {
    const t = y / h;
    for (let x = 0; x < w; x++, i++) grime[i] = sstep(0.45, 1.0, t + mid[i] * 0.12 + low[i] * 0.08) * 0.75;
  }
  for (let c = 0; c < 900 * k * k; c++) {
    const y = h * (0.78 + Math.pow(rng(), 2) * 0.22), x = rng() * w;
    disc(mud, w, h, x, y, (0.8 + Math.pow(rng(), 3) * 5) * k, 0.6 + rng() * 0.4, 'max', 0.6);
  }
  const mudRun = drip(mud, w, h, 2305, 0.9, 0.96);
  // oxidised / chalky patches (sun-faded)
  const chalk = smask(field(n, (i) => low[i] * 0.8 + mid[i] * 0.4), 0.1, 0.65, 0.6);
  const make = (base, chalkCol, satOx) => {
    const img = new Img(w, h);
    const b = rgb(base);
    gradientMap(img, field(n, (i) => 0.5 + low[i] * 0.25 + mid[i] * 0.15 + peel[i] * 0.06), [[0, b.map((v) => v * 0.82)], [0.5, b], [1, b.map((v) => Math.min(1, v * 1.1))]]);
    tint(img, chalk, chalkCol, satOx);
    tint(img, swirl, '#ffffff', 0.1, 'screen');
    tint(img, spots, '#e8e2d4', 0.18);
    tint(img, smask(deep, 0.2, 0.7), '#8d8a82', 0.85);
    tint(img, chips, '#9b9890', 0.9);
    tint(img, chipRust, '#5a2c16', 0.95);
    tint(img, rustRun, '#6e3a1c', 0.5);
    tint(img, grime, '#4a4136', 0.55);
    tint(img, mudRun, '#5a4632', 0.75);
    strokes(img, { seed: 2306, len: [30 * k, 80 * k], width: [8 * k, 16 * k], opacity: 0.12, coverage: 0.4, angle: 0, angleJitter: 0.2, valueJitter: 0.035 });
    return img;
  };
  const out = {};
  const neutral = make('#e9e7e1', '#f4f2ec', 0.4);
  out.taxi_paint = colorOut(neutral);
  out.taxi_paint_green = colorOut(make('#1f6a3c', '#6f9a78', 0.45));
  out.taxi_paint_yellow = colorOut(make('#dcb12a', '#e8d38a', 0.5));
  const dB = blur(dings, w, h, Math.round(6 * k), 2);
  for (let i = 0; i < n; i++) H[i] += -dB[i] * 0.08 - deep[i] * 0.03 - chips[i] * 0.02 + mudRun[i] * 0.01;
  out.taxi_paint_normal = dataOut(normalMap(H, w, h, 24 * k), w, h);
  const R = field(n, (i) => 0.32 + chalk[i] * 0.3 + grime[i] * 0.35 + mudRun[i] * 0.4 + chips[i] * 0.3 - swirl[i] * 0.05 + spots[i] * 0.1);
  out.taxi_paint_rough = dataOut(grayBytes(R, w, h), w, h);
  return out;
}

// ---------------------------------------------------------------------------
// CHROME DIRTY — dull chrome trim: polish streaks, water spots, pitting, rust freckles.
// Use as map on a metalness≈0.9 material with chrome_dirty_rough.
// ---------------------------------------------------------------------------
export function genChromeDirty(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(2400);
  const st = fbm(w, h, { cells: [60, 3], octaves: 3, seed: 2401 });
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: 2402 });
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.55 + st[i] * 0.25 + low[i] * 0.25), [[0, '#6c6e70'], [0.5, '#a9acae'], [1, '#d6d8d8']]);
  const spots = new Float32Array(n), pits = new Float32Array(n), rust = new Float32Array(n);
  for (let c = 0; c < 200 * k * k; c++) {
    const x = rng() * w, y = rng() * h, r = (2 + rng() * 6) * k;
    disc(spots, w, h, x, y, r, 0.7, 'max');
    disc(spots, w, h, x, y, r * 0.75, 0, 'set');
  }
  for (let c = 0; c < 400 * k * k; c++) disc(pits, w, h, rng() * w, rng() * h, (0.7 + rng() * 1.3) * k, 1, 'max', 1);
  for (let c = 0; c < 30 * k * k; c++) disc(rust, w, h, rng() * w, rng() * h, (1.5 + rng() * 5) * k, 1, 'max', 0.3);
  const grime = smask(low, 0.0, 0.6, 0.6);
  tint(img, spots, '#e9ebe6', 0.35);
  tint(img, grime, '#4a4842', 0.55);
  tint(img, pits, '#2a2826', 0.7);
  tint(img, rust, '#6a3a1e', 0.75);
  strokes(img, { seed: 2403, len: [30 * k, 80 * k], width: [4 * k, 8 * k], opacity: 0.25, coverage: 0.5, angle: 0, angleJitter: 0.04, valueJitter: 0.05, bristles: 10 });
  const H = field(n, (i) => 0.5 - pits[i] * 0.05 + rust[i] * 0.03 + st[i] * 0.003);
  const R = field(n, (i) => 0.18 + grime[i] * 0.45 + rust[i] * 0.6 + spots[i] * 0.15 + Math.abs(st[i]) * 0.08);
  return {
    chrome_dirty: colorOut(img),
    chrome_dirty_normal: dataOut(normalMap(H, w, h, 10 * k), w, h),
    chrome_dirty_rough: dataOut(grayBytes(R, w, h), w, h),
  };
}

// ---------------------------------------------------------------------------
// RUBBER — worn black rubber (tyres, seals, pedals): fine grain, dust, scuffs.
// ---------------------------------------------------------------------------
export function genRubber(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const g = fbm(w, h, { cells: 120, octaves: 2, seed: 2501 });
  const low = fbm(w, h, { cells: 4, octaves: 4, seed: 2502 });
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.5 + g[i] * 0.3 + low[i] * 0.25), [[0, '#121212'], [0.5, '#1e1d1c'], [1, '#2e2c2a']]);
  tint(img, smask(low, 0.2, 0.7, 0.5), '#5a5550', 0.4);
  const rng = makeRng(2503);
  const sc = new Float32Array(n);
  for (let c = 0; c < 40; c++) {
    const x = rng() * w, y = rng() * h, a = rng() * TAU, L = (10 + rng() * 40) * k;
    line(sc, w, h, x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, (1 + rng() * 2) * k, 0.6, 'max');
  }
  tint(img, sc, '#47443f', 0.5);
  strokes(img, { seed: 2504, len: [6 * k, 14 * k], width: [2 * k, 4 * k], opacity: 0.3, coverage: 0.5, valueJitter: 0.08 });
  const H = field(n, (i) => 0.5 + g[i] * 0.03 + low[i] * 0.02);
  return {
    rubber: colorOut(img),
    rubber_normal: dataOut(normalMap(H, w, h, 10 * k), w, h),
  };
}

// ---------------------------------------------------------------------------
// LEATHER SEAT — old oxblood-brown vinyl/leather: pebble grain, creases, cracked worn
// panels, sweat-darkened and rubbed-pale areas.
// ---------------------------------------------------------------------------
export function genLeatherSeat(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(2600);
  const peb = worley(w, h, { cells: Math.round(110 * k), seed: 2601 });
  const low = fbm(w, h, { cells: 3, octaves: 5, seed: 2602 });
  const wear = fbm(w, h, { cells: 4, octaves: 5, seed: 2603, gain: 0.55 });
  const H = field(n, (i) => 0.5 + Math.min(0.3, peb.f1[i]) * -0.15 + low[i] * 0.02);
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.5 + low[i] * 0.3 + (0.3 - Math.min(0.3, peb.f1[i])) * 0.6), [[0, '#1e100d'], [0.35, '#341c16'], [0.6, '#4d2a1f'], [0.85, '#6a3c28'], [1, '#80503a']]);
  // creases (long soft folds) and fine cracks in worn zones
  const cr = new Float32Array(n);
  for (let c = 0; c < 10; c++) crack(cr, w, h, rng, { x: rng() * w, y: rng() * h, angle: rng() < 0.6 ? 0 : Math.PI / 2, steps: 20 + rng() * 30, step: 6 * k, wander: 0.25, width: (2 + rng() * 2) * k, branch: 0.02, taper: 0.995 });
  const crB = blur(cr, w, h, Math.round(2 * k), 1);
  const cw = worley(w, h, { cells: Math.round(28 * k), seed: 2604 });
  const wornM = smask(wear, 0.15, 0.45);
  const cracks = field(n, (i) => (1 - sstep(0.0, 0.04, cw.f2[i] - cw.f1[i])) * wornM[i]);
  tint(img, wornM, '#8a5e44', 0.4);
  tint(img, cracks, '#160c09', 0.75);
  tint(img, crB, '#170d0a', 0.5);
  tint(img, smask(low, -0.6, -0.1, 0.4), '#120a08', 0.5);
  strokes(img, { seed: 2605, len: [8 * k, 20 * k], width: [3 * k, 6 * k], opacity: 0.35, coverage: 0.6, valueJitter: 0.06 });
  for (let i = 0; i < n; i++) H[i] += -crB[i] * 0.08 - cracks[i] * 0.04;
  shade(img, H, { strength: 0.2, bump: 16 * k, ao: 0.4, aoRadius: 2, edge: 0.2 });
  const R = field(n, (i) => 0.55 - wornM[i] * 0.15 + cracks[i] * 0.3);
  return {
    leather_seat: colorOut(img),
    leather_seat_normal: dataOut(normalMap(H, w, h, 12 * k), w, h),
    leather_seat_rough: dataOut(grayBytes(R, w, h), w, h),
  };
}

/** Woven fabric height (plain / twill) + thread colour variation. */
function weave(w, h, threads, twill, seed) {
  const n = w * h;
  const slub = fbm(w, h, { cells: [threads / 4, 4], octaves: 2, seed });
  const slub2 = fbm(w, h, { cells: [4, threads / 4], octaves: 2, seed: seed + 1 });
  const H = new Float32Array(n), warpM = new Float32Array(n);
  const p = w / threads;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const tx = Math.floor(x / p), ty = Math.floor(y / p);
      const fx = (x / p) - tx, fy = (y / p) - ty;
      const over = twill ? ((tx + ty) % 4 < 2) : ((tx + ty) % 2 === 0);
      const a = Math.sin(fx * Math.PI), b = Math.sin(fy * Math.PI);
      warpM[i] = over ? 1 : 0;
      H[i] = over ? 0.5 + a * 0.35 + slub[i] * 0.05 : 0.5 + b * 0.35 + slub2[i] * 0.05;
    }
  }
  return { H, warpM, slub, slub2 };
}

// ---------------------------------------------------------------------------
// FABRIC SEAT — grey-blue woven seat cloth (twill) with faded stripes, stains, pilling.
// ---------------------------------------------------------------------------
export function genFabricSeat(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const wv = weave(w, h, Math.round(128 * k), true, 2700);
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: 2701 });
  const img = new Img(w, h);
  const stripe = field(n, (i) => {
    const x = (i % w) / w;
    return Math.sin(x * TAU * 8) > 0.82 ? 1 : 0;
  });
  gradientMap(img, field(n, (i) => 0.45 + wv.H[i] * 0.3 + wv.slub[i] * 0.1 + low[i] * 0.15), [[0, '#1d222b'], [0.5, '#384252'], [1, '#56616f']]);
  tint(img, field(n, (i) => stripe[i] * 0.6 * (0.6 + wv.H[i] * 0.4)), '#6b5a4a', 0.5);
  const rng = makeRng(2702);
  const stains = blotches(w, h, rng, 9, 12 * k, 50 * k, low, 0.3);
  tint(img, stains, '#2a2620', 0.35);
  tint(img, smask(low, 0.25, 0.7, 0.35), '#7d838a', 0.35);
  strokes(img, { seed: 2703, len: [6 * k, 14 * k], width: [2 * k, 4 * k], opacity: 0.25, coverage: 0.5, valueJitter: 0.06 });
  shade(img, wv.H, { strength: 0.25, bump: 4, ao: 0.4, aoRadius: 1, edge: 0.1 });
  return {
    fabric_seat: colorOut(img),
    fabric_seat_normal: dataOut(normalMap(wv.H, w, h, 2.5), w, h),
  };
}

// ---------------------------------------------------------------------------
// DASH PLASTIC — sun-baked dark grey textured plastic, dust film, scratches.
// ---------------------------------------------------------------------------
export function genDashPlastic(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const gr = worley(w, h, { cells: Math.round(90 * k), seed: 2801 });
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: 2802 });
  const dust = fbm(w, h, { cells: 40, octaves: 3, seed: 2803 });
  const H = field(n, (i) => 0.5 - Math.min(0.35, gr.f1[i]) * 0.1);
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.5 + low[i] * 0.25 + (0.35 - Math.min(0.35, gr.f1[i])) * 0.4), [[0, '#141516'], [0.5, '#222325'], [1, '#34353a']]);
  tint(img, smask(low, 0.0, 0.7, 0.55), '#4c4a46', 0.4); // sun-faded
  tint(img, smask(dust, -0.1, 0.5, 0.45), '#6e6a62', 0.35);
  const rng = makeRng(2804);
  const sc = new Float32Array(n);
  for (let c = 0; c < 30; c++) {
    const x = rng() * w, y = rng() * h, a = rng() * TAU, L = (10 + rng() * 50) * k;
    line(sc, w, h, x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, 0.8 * k, 0.7, 'max');
  }
  tint(img, sc, '#5a5852', 0.6);
  strokes(img, { seed: 2805, len: [10 * k, 24 * k], width: [3 * k, 6 * k], opacity: 0.25, coverage: 0.5, valueJitter: 0.05 });
  const R = field(n, (i) => 0.6 + dust[i] * 0.1 + low[i] * 0.05);
  return {
    dash_plastic: colorOut(img),
    dash_plastic_normal: dataOut(normalMap(H, w, h, 8 * k), w, h),
    dash_plastic_rough: dataOut(grayBytes(R, w, h), w, h),
  };
}

// ---------------------------------------------------------------------------
// CARPET — dark loop-pile floor carpet: tufts, grit, mud and worn heel patch.
// ---------------------------------------------------------------------------
export function genCarpet(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const tuft = worley(w, h, { cells: Math.round(150 * k), seed: 2901 });
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: 2902 });
  const fine = fbm(w, h, { cells: 100, octaves: 2, seed: 2903 });
  const H = field(n, (i) => 0.5 + Math.max(0, 0.5 - tuft.f1[i]) * 0.3 + fine[i] * 0.03);
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.45 + Math.max(0, 0.5 - tuft.f1[i]) * 0.6 + fine[i] * 0.2 + low[i] * 0.15), [[0, '#121110'], [0.5, '#2a2622'], [1, '#423c35']]);
  const rng = makeRng(2904);
  const mud = blotches(w, h, rng, 12, 10 * k, 45 * k, fine, 0.2);
  tint(img, mud, '#4a3a2a', 0.45);
  const grit = new Float32Array(n);
  for (let c = 0; c < 600 * k * k; c++) disc(grit, w, h, rng() * w, rng() * h, (0.6 + rng() * 0.8) * k, 1, 'max', 1);
  tint(img, grit, '#8a8070', 0.5);
  tint(img, smask(low, 0.25, 0.7, 0.4), '#5a5248', 0.35);
  strokes(img, { seed: 2905, len: [4 * k, 9 * k], width: [2 * k, 3.5 * k], opacity: 0.3, coverage: 0.6, valueJitter: 0.1 });
  return {
    carpet: colorOut(img),
    carpet_normal: dataOut(normalMap(H, w, h, 6 * k), w, h),
  };
}

// ---------------------------------------------------------------------------
// HEADLINER — perforated beige vinyl / felt roof lining: smoke-yellowed, water tide marks,
// sag wrinkles.
// ---------------------------------------------------------------------------
export function genHeadliner(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const fz = fbm(w, h, { cells: 120, octaves: 2, seed: 3001 });
  const low = fbm(w, h, { cells: 3, octaves: 5, seed: 3002 });
  const sag = fbm(w, h, { cells: [2, 6], octaves: 3, seed: 3003 });
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.55 + fz[i] * 0.15 + low[i] * 0.2 + sag[i] * 0.15), [[0, '#7d7260'], [0.5, '#a89c84'], [1, '#c4b9a2']]);
  // perforation grid
  const perf = new Float32Array(n);
  const step = 8 * k;
  for (let y = step / 2; y < h; y += step) for (let x = ((y / step) % 2) * step * 0.5 + step / 2; x < w; x += step) disc(perf, w, h, x, y, 1.1 * k, 1, 'max', 1);
  tint(img, perf, '#5e5446', 0.55);
  // nicotine yellowing + water tide marks
  tint(img, smask(low, 0.0, 0.6, 0.5), '#9a7e44', 0.35);
  const rng = makeRng(3004);
  const tide = new Float32Array(n);
  for (let c = 0; c < 5; c++) {
    const x = rng() * w, y = rng() * h, r = (30 + rng() * 70) * k;
    for (let s = 0; s < 3; s++) {
      const rr = r * (1 - s * 0.18);
      for (let a = 0; a < TAU; a += 0.05) {
        const wob = 1 + Math.sin(a * 5 + c) * 0.08 + Math.sin(a * 11 + s) * 0.04;
        const x0 = x + Math.cos(a) * rr * wob, y0 = y + Math.sin(a) * rr * wob;
        const x1 = x + Math.cos(a + 0.05) * rr * wob, y1 = y + Math.sin(a + 0.05) * rr * wob;
        line(tide, w, h, x0, y0, x1, y1, 1.6 * k, 0.8 - s * 0.2, 'max');
      }
    }
  }
  tint(img, blur(tide, w, h, 1, 1), '#6a5634', 0.6);
  strokes(img, { seed: 3005, len: [12 * k, 30 * k], width: [4 * k, 8 * k], opacity: 0.25, coverage: 0.5, valueJitter: 0.04 });
  const H = field(n, (i) => 0.5 + sag[i] * 0.1 + fz[i] * 0.01 - perf[i] * 0.02);
  shade(img, H, { strength: 0.2, bump: 20 * k, ao: 0.3, aoRadius: 3, edge: 0.1 });
  return {
    headliner: colorOut(img),
    headliner_normal: dataOut(normalMap(H, w, h, 10 * k), w, h),
  };
}

// ---------------------------------------------------------------------------
// GLASS DIRT — RGBA overlay (alpha = dirt). Not tileable: u across the pane, v up.
//   glass_dirt             dust toward the edges/bottom, smudges, water spots, drip runs
//   glass_dirt_windshield  + two wiper arcs (pivots near the bottom) cleaned by the blades
// ---------------------------------------------------------------------------
export function genGlassDirt(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(3100);
  const low = fbm(w, h, { cells: 3, octaves: 5, seed: 3101 });
  const fine = fbm(w, h, { cells: 50, octaves: 3, seed: 3102 });
  const A = new Float32Array(n);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const ex = Math.min(x, w - 1 - x) / w, ey = Math.min(y, h - 1 - y) / h;
      const edge = 1 - sstep(0.0, 0.12, Math.min(ex, ey) + fine[i] * 0.02);
      const bottom = sstep(0.6, 1.0, y / h) * 0.4;
      A[i] = Math.max(0, edge * 0.75 + bottom + sstep(0.1, 0.8, low[i]) * 0.25 + fine[i] * 0.05);
    }
  }
  const spots = new Float32Array(n);
  for (let c = 0; c < 260 * k * k; c++) {
    const x = rng() * w, y = rng() * h, r = (1.5 + Math.pow(rng(), 2) * 6) * k;
    disc(spots, w, h, x, y, r, 0.7, 'max');
    disc(spots, w, h, x, y, r * 0.65, 0.15, 'set');
  }
  const runs = drip(field(n, (i) => (spots[i] > 0.5 && rng() < 0.02 ? 0.6 : 0)), w, h, 3103, 0.985, 0.996);
  const smudge = smask(fbm(w, h, { cells: 6, octaves: 4, seed: 3104 }), 0.2, 0.6, 0.35);
  const bugs = new Float32Array(n);
  for (let c = 0; c < 9; c++) disc(bugs, w, h, rng() * w, rng() * h * 0.7, (1.5 + rng() * 3) * k, 1, 'max', 0.5);
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.5 + low[i] * 0.3 + fine[i] * 0.2), [[0, '#5a5246'], [0.5, '#8a8070'], [1, '#aaa292']]);
  tint(img, bugs, '#3a3020', 0.9);
  const base = field(n, (i) => Math.min(1, A[i] * 0.55 + spots[i] * 0.5 + runs[i] * 0.4 + smudge[i] * 0.5 + bugs[i]));
  const out = {};
  const d = img.d;
  for (let i = 0; i < n; i++) d[i * 4 + 3] = base[i];
  out.glass_dirt = colorOut(img, { alpha: true, wrap: 'clamp' });
  // windshield: two wiper sweeps clear arcs (pivots at 30% / 70% across, just below the pane)
  const img2 = new Img(w, h);
  img2.d.set(img.d);
  const d2 = img2.d;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      let clean = 0, ridge = 0;
      for (const [px, R] of [[0.28, 0.62], [0.68, 0.6]]) {
        const dx = x / w - px, dy = (y / h - 1.06) * (h / w);
        const r = Math.hypot(dx, dy);
        const ang = Math.atan2(-dy, dx);
        const inArc = ang > 0.18 && ang < Math.PI - 0.25 ? 1 : 0;
        const inner = 0.12;
        clean = Math.max(clean, inArc * sstep(R, R - 0.02, r) * sstep(inner - 0.02, inner, r));
        ridge = Math.max(ridge, inArc * (1 - Math.min(1, Math.abs(r - R) / 0.008)));
      }
      const a = d2[i * 4 + 3] * (1 - clean * 0.8) + ridge * 0.35;
      d2[i * 4 + 3] = Math.min(1, a);
    }
  }
  out.glass_dirt_windshield = colorOut(img2, { alpha: true, wrap: 'clamp' });
  return out;
}
