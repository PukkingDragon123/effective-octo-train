// Tree bark: tropical fissured bark and banyan / fig bark (v runs along the trunk).
import { makeRng } from '../core/math.js';
import { fbm, worley, blur, warp, line } from './noise.js';
import { Img, gradientMap, strokes, shade, normalMap, colorOut, dataOut, tint, modulate, sstep, smask, blotches, adjust, field } from './painter.js';

// ---------------------------------------------------------------------------
// BARK — rainforest hardwood: interlaced vertical ridges and deep furrows, plates breaking
// across, crustose lichen on the crests, moss in the furrows, wet streaks.
// ---------------------------------------------------------------------------
export function genBark(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(1000);
  const wx = fbm(w, h, { cells: [3, 4], octaves: 3, seed: 1001 });
  const wy = fbm(w, h, { cells: [3, 4], octaves: 3, seed: 1002 });
  // elongated cells: their borders form branching / merging vertical furrows
  const C1 = worley(w, h, { cells: [12, 3], seed: 1003 });
  const C2 = worley(w, h, { cells: [26, 6], seed: 1004 });
  const e1raw = new Float32Array(n), e2raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    e1raw[i] = C1.f2[i] - C1.f1[i];
    e2raw[i] = C2.f2[i] - C2.f1[i];
  }
  const e1 = warp(e1raw, w, h, wx, wy, 14 * k);
  const e2 = warp(e2raw, w, h, wy, wx, 6 * k);
  const fib = fbm(w, h, { cells: [48, 6], octaves: 3, seed: 1005 });
  const low = fbm(w, h, { cells: 2, octaves: 4, seed: 1006 });
  const plateN = fbm(w, h, { cells: [8, 12], octaves: 3, seed: 1012 });
  const H = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ridge = sstep(0.0, 0.32, e1[i]); // 0 in the furrow, 1 on the ridge top
    const subM = sstep(-0.05, 0.35, plateN[i] + low[i] * 0.3);
    const sub = 1 - (1 - sstep(0.0, 0.1, e2[i])) * 0.28 * subM;
    const top = Math.sqrt(ridge);
    H[i] = top * 0.55 * sub + fib[i] * 0.05 * top + plateN[i] * 0.06 * top + low[i] * 0.04;
  }
  const img = new Img(w, h);
  const f = field(n, (i) => H[i] * 1.3 + fib[i] * 0.1 + low[i] * 0.12 + plateN[i] * 0.08);
  gradientMap(img, f, [[0, '#15100c'], [0.15, '#261d16'], [0.33, '#3e3228'], [0.52, '#5a4b3d'], [0.72, '#766654'], [0.9, '#91826d'], [1, '#a59783']]);
  modulate(img, fbm(w, h, { cells: [3, 2], octaves: 3, seed: 1007 }), 0.12, 0.06);
  strokes(img, { seed: 1008, len: [14 * k, 34 * k], width: [3 * k, 6 * k], opacity: 0.4, coverage: 0.7, angle: Math.PI / 2, angleJitter: 0.18, curve: 0.12, valueJitter: 0.08, warmJitter: 0.03, height: H, heightAmt: 0.012 });
  // crustose lichen on the ridge tops
  const rag = fbm(w, h, { cells: 30, octaves: 2, seed: 1009 });
  const L1 = blotches(w, h, rng, Math.round(28 * k * k), 6 * k, 34 * k, rag, 0.5);
  const L2 = blotches(w, h, rng, Math.round(14 * k * k), 3 * k, 12 * k, rag, 0.7);
  for (let i = 0; i < n; i++) {
    const onTop = sstep(0.25, 0.45, H[i]);
    L1[i] *= onTop * sstep(-0.3, 0.2, rag[i]);
    L2[i] *= onTop;
  }
  tint(img, L1, '#a3a892', 0.6);
  tint(img, L2, '#c6c3b1', 0.55);
  const L3 = blotches(w, h, rng, Math.round(8 * k * k), 3 * k, 10 * k, rag, 0.6);
  tint(img, L3, '#a07438', 0.4);
  // moss creeping in the furrows (lower, damp areas), wet runnels
  const mossM = field(n, (i) => sstep(0.05, 0.45, low[i] + 0.25 - H[i]) * 0.85);
  const mf = fbm(w, h, { cells: 60, octaves: 2, seed: 1010 });
  gradientMap(img, field(n, (i) => 0.45 + mf[i] * 0.4 + H[i]), [[0, '#1a260f'], [0.5, '#3a4f18'], [1, '#74862a']], mossM, 0.75);
  const wet = smask(fbm(w, h, { cells: [8, 1], octaves: 3, seed: 1011 }), 0.2, 0.6, 0.3);
  tint(img, wet, '#120e0b', 0.45);
  shade(img, H, { strength: 0.38, bump: 36 * k, ao: 0.6, aoRadius: Math.round(4 * k), aoScale: 3, edge: 0.3 });
  adjust(img, { saturation: 0.9 });
  return {
    bark: colorOut(img),
    bark_normal: dataOut(normalMap(H, w, h, 34 * k), w, h),
  };
}

// ---------------------------------------------------------------------------
// BANYAN — pale grey fig bark: fused aerial-root strands (vertical), elephant-skin
// horizontal wrinkles, green algae bloom, dark wet runnels.
// ---------------------------------------------------------------------------
export function genBarkBanyan(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(1100);
  const H = new Float32Array(n);
  const strands = 16;
  const SX = new Float32Array(strands), SW = new Float32Array(strands), SA = new Float32Array(strands), SF = new Float32Array(strands), SP = new Float32Array(strands), SH = new Float32Array(strands);
  for (let s = 0; s < strands; s++) {
    SX[s] = rng() * w;
    SW[s] = (5 + Math.pow(rng(), 2.2) * 60) * k;
    SA[s] = (2 + rng() * 12) * k;
    SF[s] = 1 + Math.floor(rng() * 3);
    SP[s] = rng() * Math.PI * 2;
    SH[s] = 0.5 + rng() * 0.5;
  }
  const wob = fbm(w, h, { cells: [2, 6], octaves: 3, seed: 1101 });
  for (let y = 0; y < h; y++) {
    const ty = (y / h) * Math.PI * 2;
    for (let s = 0; s < strands; s++) {
      const cxs = SX[s] + Math.sin(ty * SF[s] + SP[s]) * SA[s];
      const sw = SW[s];
      for (let x = Math.floor(cxs - sw - 1); x <= cxs + sw + 1; x++) {
        const wx = ((x % w) + w) % w;
        const i = y * w + wx;
        const dx = (x + 0.5 - cxs + wob[i] * 6 * k) / sw;
        if (dx <= -1 || dx >= 1) continue;
        const v = Math.pow(1 - dx * dx, 0.35) * SH[s] * (0.5 + 0.5 * Math.min(1, sw / (24 * k)));
        // smooth union
        const a = H[i], b = v * 0.6;
        const kk = 0.08;
        const hh = Math.max(kk - Math.abs(a - b), 0) / kk;
        H[i] = Math.max(a, b) + hh * hh * kk * 0.25;
      }
    }
  }
  // horizontal wrinkles (stronger in the valleys)
  const wr = fbm(w, h, { cells: [6, 3], octaves: 3, seed: 1102 });
  const fine = fbm(w, h, { cells: [12, 24], octaves: 3, seed: 1103 });
  const crease = new Float32Array(n);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const ph = (y / h) * 36 * Math.PI + wr[i] * 14;
      const c = Math.pow(Math.abs(Math.sin(ph)), 16) * sstep(-0.1, 0.5, fine[i] + wr[i] * 0.5);
      crease[i] = c * (1 - H[i] * 0.8);
      H[i] += -c * 0.025 + fine[i] * 0.012;
    }
  }
  const img = new Img(w, h);
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: 1104 });
  gradientMap(img, field(n, (i) => 0.3 + H[i] * 0.9 + low[i] * 0.22 + fine[i] * 0.06), [[0, '#2a2620'], [0.3, '#4a443a'], [0.55, '#686052'], [0.8, '#868070'], [1, '#a29a8a']]);
  tint(img, crease, '#3a342c', 0.6);
  modulate(img, fbm(w, h, { cells: 4, octaves: 3, seed: 1105 }), 0.08, 0.05);
  strokes(img, { seed: 1106, len: [14 * k, 34 * k], width: [3 * k, 7 * k], opacity: 0.4, coverage: 0.7, angle: Math.PI / 2, angleJitter: 0.25, valueJitter: 0.06 });
  // algae bloom & lichen spots
  const rag = fbm(w, h, { cells: 24, octaves: 2, seed: 1107 });
  const alg = smask(field(n, (i) => low[i] + rag[i] * 0.2), 0.05, 0.5, 0.6);
  tint(img, alg, '#58623e', 0.6);
  tint(img, smask(field(n, (i) => -low[i] + rag[i] * 0.2), 0.2, 0.6, 0.4), '#5a4434', 0.45); // reddish-brown root bark
  const lich = blotches(w, h, rng, Math.round(36 * k * k), 3 * k, 20 * k, rag, 0.6);
  tint(img, lich, '#c4c3b3', 0.5);
  // lenticels: short horizontal dashes
  const lent = new Float32Array(n);
  for (let c = 0; c < 260 * k * k; c++) {
    const x = rng() * w, y = rng() * h, L = (3 + rng() * 7) * k;
    line(lent, w, h, x, y, x + L, y + (rng() - 0.5) * k, 0.9 * k, 1, 'max');
  }
  tint(img, lent, '#4a443a', 0.45);
  const wet = smask(fbm(w, h, { cells: [10, 1], octaves: 3, seed: 1108 }), 0.25, 0.7, 0.4);
  tint(img, wet, '#2a2620', 0.45);
  shade(img, H, { strength: 0.35, bump: 30 * k, ao: 0.6, aoRadius: Math.round(5 * k), aoScale: 3, edge: 0.25 });
  return {
    bark_banyan: colorOut(img),
    bark_banyan_normal: dataOut(normalMap(H, w, h, 28 * k), w, h),
  };
}
