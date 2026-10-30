// Tree bark: tropical fissured bark and banyan / fig bark (v runs along the trunk).
import { makeRng } from '../core/math.js';
import { fbm, worley, blur, warp } from './noise.js';
import { Img, gradientMap, strokes, shade, normalMap, colorOut, dataOut, tint, modulate, sstep, smask, blotches, adjust, field } from './painter.js';

// ---------------------------------------------------------------------------
// BARK — rainforest hardwood: interlaced vertical ridges and deep furrows, plates breaking
// across, crustose lichen on the crests, moss in the furrows, wet streaks.
// ---------------------------------------------------------------------------
export function genBark(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(1000);
  const wx = fbm(w, h, { cells: [3, 5], octaves: 3, seed: 1001 });
  const wy = fbm(w, h, { cells: [3, 5], octaves: 3, seed: 1002 });
  const ridgeRaw = fbm(w, h, { cells: [9, 2], octaves: 4, seed: 1003, mode: 'ridged', gain: 0.45 });
  const ridge = warp(ridgeRaw, w, h, wx, wy, 16 * k);
  const pl = worley(w, h, { cells: [10, 5], seed: 1004 });
  const plE = new Float32Array(n);
  for (let i = 0; i < n; i++) plE[i] = pl.f2[i] - pl.f1[i];
  const plW = warp(plE, w, h, wx, wy, 10 * k);
  const fine = fbm(w, h, { cells: [48, 12], octaves: 3, seed: 1005 });
  const low = fbm(w, h, { cells: 2, octaves: 4, seed: 1006 });
  const H = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = ridge[i];
    const crest = r * r * r;
    const brk = 1 - sstep(0.0, 0.07, plW[i]);
    H[i] = crest * 0.75 + fine[i] * 0.06 - brk * crest * 0.35 + low[i] * 0.05;
  }
  const img = new Img(w, h);
  const f = field(n, (i) => H[i] * 1.25 + fine[i] * 0.12 + low[i] * 0.12 + 0.05);
  gradientMap(img, f, [[0, '#18120e'], [0.18, '#2b211a'], [0.38, '#45372b'], [0.58, '#62523f'], [0.78, '#7d6c58'], [1, '#9b8c77']]);
  modulate(img, fbm(w, h, { cells: [3, 2], octaves: 3, seed: 1007 }), 0.12, 0.06);
  strokes(img, { seed: 1008, len: [16 * k, 40 * k], width: [3 * k, 7 * k], opacity: 0.45, coverage: 0.75, angle: Math.PI / 2, angleJitter: 0.12, curve: 0.1, valueJitter: 0.07, warmJitter: 0.03, height: H, heightAmt: 0.015 });
  // crustose lichen on crests
  const rag = fbm(w, h, { cells: 30, octaves: 2, seed: 1009 });
  const L1 = blotches(w, h, rng, Math.round(26 * k * k), 6 * k, 38 * k, rag, 0.5);
  const L2 = blotches(w, h, rng, Math.round(12 * k * k), 3 * k, 14 * k, rag, 0.7);
  for (let i = 0; i < n; i++) {
    const onCrest = sstep(0.12, 0.35, H[i]);
    L1[i] *= onCrest * sstep(-0.3, 0.2, rag[i]);
    L2[i] *= onCrest;
  }
  tint(img, L1, '#a5a993', 0.65);
  tint(img, L2, '#c8c5b3', 0.6);
  const L3 = blotches(w, h, rng, Math.round(8 * k * k), 3 * k, 10 * k, rag, 0.6);
  tint(img, L3, '#a07438', 0.45);
  // moss in the lower furrows, wet streaks
  const mossM = field(n, (i) => sstep(0.1, 0.5, low[i] + 0.3 - H[i] * 1.2) * 0.85);
  const mf = fbm(w, h, { cells: 60, octaves: 2, seed: 1010 });
  gradientMap(img, field(n, (i) => 0.45 + mf[i] * 0.4 + H[i]), [[0, '#1c2810'], [0.5, '#3d5219'], [1, '#78892a']], mossM, 0.8);
  const wet = smask(fbm(w, h, { cells: [8, 1], octaves: 3, seed: 1011 }), 0.2, 0.6, 0.35);
  tint(img, wet, '#120e0b', 0.5);
  shade(img, H, { strength: 0.35, bump: 40 * k, ao: 0.55, aoRadius: Math.round(4 * k), aoScale: 3, edge: 0.3 });
  adjust(img, { saturation: 0.9 });
  return {
    bark: colorOut(img),
    bark_normal: dataOut(normalMap(H, w, h, 36 * k), w, h),
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
    SW[s] = (6 + Math.pow(rng(), 1.6) * 34) * k;
    SA[s] = (4 + rng() * 18) * k;
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
        const v = Math.sqrt(1 - dx * dx) * SH[s] * (0.6 + 0.4 * Math.min(1, sw / (20 * k)));
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
  const fine = fbm(w, h, { cells: [30, 60], octaves: 2, seed: 1103 });
  const crease = new Float32Array(n);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const ph = (y / h) * 64 * Math.PI + wr[i] * 9;
      const c = Math.pow(Math.abs(Math.sin(ph)), 10) * (0.5 + 0.5 * fine[i]);
      crease[i] = c * (1 - H[i] * 0.9);
      H[i] += -c * 0.035 + fine[i] * 0.01;
    }
  }
  const img = new Img(w, h);
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: 1104 });
  gradientMap(img, field(n, (i) => 0.35 + H[i] * 0.9 + low[i] * 0.15 + fine[i] * 0.05), [[0, '#3a352e'], [0.3, '#5f584d'], [0.55, '#827a6c'], [0.8, '#a19a8b'], [1, '#b9b2a2']]);
  tint(img, crease, '#3a342c', 0.6);
  modulate(img, fbm(w, h, { cells: 4, octaves: 3, seed: 1105 }), 0.08, 0.05);
  strokes(img, { seed: 1106, len: [14 * k, 34 * k], width: [3 * k, 7 * k], opacity: 0.4, coverage: 0.7, angle: Math.PI / 2, angleJitter: 0.25, valueJitter: 0.06 });
  // algae bloom & lichen spots
  const rag = fbm(w, h, { cells: 24, octaves: 2, seed: 1107 });
  const alg = smask(field(n, (i) => low[i] + rag[i] * 0.2), 0.15, 0.55, 0.55);
  tint(img, alg, '#68704f', 0.6);
  const lich = blotches(w, h, rng, Math.round(30 * k * k), 3 * k, 16 * k, rag, 0.6);
  tint(img, lich, '#c4c3b3', 0.45);
  const wet = smask(fbm(w, h, { cells: [10, 1], octaves: 3, seed: 1108 }), 0.25, 0.7, 0.4);
  tint(img, wet, '#2a2620', 0.45);
  shade(img, H, { strength: 0.35, bump: 30 * k, ao: 0.6, aoRadius: Math.round(5 * k), aoScale: 3, edge: 0.25 });
  return {
    bark_banyan: colorOut(img),
    bark_banyan_normal: dataOut(normalMap(H, w, h, 28 * k), w, h),
  };
}
