// Tree bark: tropical fissured bark and banyan / fig bark (v runs along the trunk).
import { makeRng } from '../core/math.js';
import { fbm, worley, blur, warp, line, cellTable } from './noise.js';
import { Img, gradientMap, strokes, shade, normalMap, colorOut, dataOut, tint, modulate, sstep, smask, blotches, adjust, field, organic, streaks } from './painter.js';

// ---------------------------------------------------------------------------
// BARK — old rainforest hardwood (rain tree / dipterocarp): long interlacing vertical
// furrows (zero-crossings of vertically stretched noise, so they split and merge like real
// fissured bark), flat weathered grey ridges with occasional horizontal checks, warm
// red-brown inner bark in the furrow floors, ragged crustose lichen colonies on the ridges,
// algae / moss in the damp furrows, dark rain runnels. v runs along the trunk.
// ---------------------------------------------------------------------------
export function genBark(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const wx = fbm(w, h, { cells: [3, 2], octaves: 3, seed: 1001 });
  const wy = fbm(w, h, { cells: [3, 2], octaves: 3, seed: 1002 });
  // two families of furrows: broad main fissures + finer, shallower secondary ones
  const A = warp(fbm(w, h, { cells: [7, 1], octaves: 4, seed: 1003, gain: 0.4 }), w, h, wx, wy, 12 * k);
  const B = warp(fbm(w, h, { cells: [11, 2], octaves: 3, seed: 1004, gain: 0.42 }), w, h, wy, wx, 8 * k);
  const fib = fbm(w, h, { cells: [48, 6], octaves: 3, seed: 1005 });
  const low = fbm(w, h, { cells: 2, octaves: 4, seed: 1006 });
  const xc = fbm(w, h, { cells: [3, 16], octaves: 2, seed: 1007 }); // horizontal checks
  const xm = fbm(w, h, { cells: [5, 7], octaves: 3, seed: 1008 });
  const flake = fbm(w, h, { cells: [10, 6], octaves: 3, seed: 1017 });
  // bark plates: elongated cells that break the ridges into flakes of slightly different tone
  const PLraw = worley(w, h, { cells: [12, 5], seed: 1018 });
  const PL = { f1: warp(PLraw.f1, w, h, wx, wy, 14 * k), f2: warp(PLraw.f2, w, h, wx, wy, 14 * k), id: warp(PLraw.id, w, h, wx, wy, 14 * k, null, true) };
  const plateT = cellTable(PLraw.cx * PLraw.cy, 1019);
  const plateE = new Float32Array(n);
  const H = new Float32Array(n), dist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.abs(A[i]) * 2.6;
    const b = Math.abs(B[i]) * 3.4;
    const main = sstep(0.04, 0.34, a); // steep-walled main fissures
    const sec = 1 - (1 - sstep(0.0, 0.32, b)) * (0.18 + 0.22 * sstep(-0.2, 0.3, xm[i]));
    const d = Math.min(a, b * 0.9 + 0.12);
    dist[i] = d;
    const top = Math.sqrt(main) * sec;
    const c = (1 - sstep(0.0, 0.05, Math.abs(xc[i]))) * sstep(0.15, 0.45, xm[i]) * sstep(0.3, 0.6, a);
    const pe = (1 - sstep(0.0, 0.13, PL.f2[i] - PL.f1[i])) * sstep(0.35, 0.7, a) * 0.45;
    plateE[i] = pe;
    H[i] = top * 0.62 + fib[i] * 0.035 * top + (plateT[PL.id[i]] - 0.5) * 0.06 * top + flake[i] * 0.04 * top + low[i] * 0.04 - c * 0.08 - pe * 0.04;
  }
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => H[i] * 1.22 + fib[i] * 0.1 + low[i] * 0.1 + flake[i] * 0.08), [
    [0, '#120c08'], [0.14, '#24180f'], [0.3, '#3e2f24'], [0.48, '#56493c'], [0.66, '#6c6457'], [0.84, '#857e72'], [1, '#9c968a'],
  ]);
  modulate(img, fbm(w, h, { cells: [3, 2], octaves: 3, seed: 1009 }), 0.12, 0.07);
  modulate(img, field(n, (i) => (plateT[PL.id[i]] - 0.5) * sstep(0.2, 0.5, dist[i])), 0.22, 0.12);
  tint(img, plateE, '#2e241b', 0.3);
  tint(img, field(n, (i) => (1 - sstep(0.05, 0.22, dist[i])) * sstep(-0.2, 0.4, flake[i]) * 0.5), '#4a2a1a', 0.35); // warm inner bark in some fissures
  strokes(img, { seed: 1010, len: [16 * k, 40 * k], width: [3 * k, 6 * k], opacity: 0.4, coverage: 0.8, angle: Math.PI / 2, angleJitter: 0.1, curve: 0.1, valueJitter: 0.08, warmJitter: 0.035, bristles: 9, height: H, heightAmt: 0.008 });
  // lichen colonies on the crests (pale grey and mint species) + rare orange
  const crest = field(n, (i) => (sstep(0.35, 0.6, H[i]) - 0.5) * 0.3);
  const L1 = organic(w, h, { seed: 1011, cells: 7, coverage: 0.11, soft: 0.05, warp: 0.6, detail: 0.6, bias: crest });
  const L2 = organic(w, h, { seed: 1012, cells: 11, coverage: 0.05, soft: 0.05, warp: 0.5, detail: 0.6, bias: crest });
  const L3 = organic(w, h, { seed: 1013, cells: 16, coverage: 0.015, soft: 0.04 });
  const lt = fbm(w, h, { cells: 50, octaves: 2, seed: 1014 });
  const onRidge = field(n, (i) => sstep(0.15, 0.4, dist[i]));
  gradientMap(img, field(n, (i) => 0.5 + lt[i] * 0.5 - L1.rim[i] * 0.25), [[0, '#7e8076'], [0.5, '#9fa093'], [1, '#bdbcae']], field(n, (i) => L1.m[i] * onRidge[i] * (0.55 + lt[i] * 0.25)));
  gradientMap(img, field(n, (i) => 0.5 + lt[i] * 0.5), [[0, '#6e7a62'], [1, '#98a68c']], field(n, (i) => L2.m[i] * onRidge[i] * 0.55));
  tint(img, field(n, (i) => L3.m[i] * onRidge[i]), '#9a6e34', 0.45);
  // green algae film + moss deep in the furrows on the damp side
  const damp = field(n, (i) => sstep(-0.1, 0.4, -low[i] + xm[i] * 0.25));
  const mf = fbm(w, h, { cells: 80, octaves: 2, seed: 1015 });
  gradientMap(img, field(n, (i) => 0.35 + mf[i] * 0.5 + H[i] * 0.5), [[0, '#141a0c'], [0.5, '#2c3a16'], [1, '#56642a']], field(n, (i) => damp[i] * (1 - sstep(0.06, 0.26, dist[i])) * 0.45));
  tint(img, field(n, (i) => damp[i] * 0.3), '#3a4228', 0.3);
  const st = streaks(w, h, 1016, { count: Math.round(22 * k), len: [0.3, 0.9], width: [2 * k, 6 * k], strength: 0.7 });
  tint(img, blur(st, w, h, Math.round(2 * k), 1), '#120c08', 0.35);
  shade(img, H, { strength: 0.3, bump: 26 * k, ao: 0.45, aoRadius: Math.round(4 * k), aoScale: 3, edge: 0.18 });
  adjust(img, { saturation: 0.85 });
  return {
    bark: colorOut(img),
    bark_normal: dataOut(normalMap(H, w, h, 26 * k), w, h),
  };
}

// ---------------------------------------------------------------------------
// BANYAN — pale grey fig bark: fused aerial-root strands (vertical, smooth-unioned),
// soft horizontal "elephant skin" creases, lenticels, ragged lichen colonies, green algae on
// the damp side, dark wet runnels between the strands.
// ---------------------------------------------------------------------------
export function genBarkBanyan(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(1100);
  const H = new Float32Array(n);
  const strands = 30;
  const SX = new Float32Array(strands), SW = new Float32Array(strands), SA = new Float32Array(strands), SF = new Float32Array(strands), SP = new Float32Array(strands), SH = new Float32Array(strands);
  for (let s = 0; s < strands; s++) {
    SX[s] = rng() * w;
    SW[s] = (5 + Math.pow(rng(), 1.6) * 30) * k;
    SA[s] = (2 + rng() * 10) * k;
    SF[s] = 1 + Math.floor(rng() * 2);
    SP[s] = rng() * Math.PI * 2;
    SH[s] = 0.55 + rng() * 0.45;
  }
  const wob = fbm(w, h, { cells: [3, 5], octaves: 3, seed: 1101 });
  for (let y = 0; y < h; y++) {
    const ty = (y / h) * Math.PI * 2;
    for (let s = 0; s < strands; s++) {
      const cxs = SX[s] + Math.sin(ty * SF[s] + SP[s]) * SA[s];
      const sw = SW[s];
      for (let x = Math.floor(cxs - sw - 1); x <= cxs + sw + 1; x++) {
        const wx = ((x % w) + w) % w;
        const i = y * w + wx;
        const dx = (x + 0.5 - cxs + wob[i] * 7 * k) / sw;
        if (dx <= -1 || dx >= 1) continue;
        const v = Math.sqrt(1 - dx * dx) * SH[s] * (0.4 + 0.6 * Math.min(1, sw / (22 * k)));
        // polynomial smooth max: strands fuse into each other instead of overlapping
        const a = H[i], b = v * 0.6, kk = 0.05;
        const hh = Math.max(kk - Math.abs(a - b), 0) / kk;
        H[i] = Math.max(a, b) + hh * hh * kk * 0.25;
      }
    }
  }
  const Hs = blur(H, w, h, Math.max(1, Math.round(1.5 * k)), 2);
  H.set(Hs);
  // soft horizontal creases (wider in the valleys), fine skin texture
  const wr = fbm(w, h, { cells: [4, 6], octaves: 3, seed: 1102 });
  const fine = fbm(w, h, { cells: [16, 32], octaves: 3, seed: 1103 });
  const crease = new Float32Array(n);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const ph = (y / h) * 30 * Math.PI + wr[i] * 9;
      const c = Math.pow(0.5 + 0.5 * Math.sin(ph), 10) * sstep(0.0, 0.5, fine[i] * 0.6 + wr[i] * 0.6);
      crease[i] = c * (1 - Math.min(1, H[i] * 1.1));
      H[i] += -crease[i] * 0.035 + fine[i] * 0.012;
    }
  }
  const img = new Img(w, h);
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: 1104 });
  gradientMap(img, field(n, (i) => 0.28 + H[i] * 0.95 + low[i] * 0.18 + fine[i] * 0.05), [[0, '#221f1a'], [0.28, '#423d34'], [0.52, '#625b4f'], [0.75, '#7f7a6c'], [1, '#9b968a']]);
  tint(img, crease, '#3a352c', 0.5);
  modulate(img, fbm(w, h, { cells: 4, octaves: 3, seed: 1105 }), 0.08, 0.05);
  strokes(img, { seed: 1106, len: [16 * k, 40 * k], width: [3 * k, 7 * k], opacity: 0.4, coverage: 0.75, angle: Math.PI / 2, angleJitter: 0.2, curve: 0.12, valueJitter: 0.06, warmJitter: 0.03 });
  // algae on the damp side, reddish young root bark in places
  tint(img, smask(field(n, (i) => low[i] + fine[i] * 0.15), 0.05, 0.5, 0.5), '#55603c', 0.55);
  tint(img, smask(field(n, (i) => -low[i] + fine[i] * 0.2), 0.25, 0.6, 0.35), '#5a4434', 0.4);
  // lichen colonies (ragged)
  const L1 = organic(w, h, { seed: 1107, cells: 8, coverage: 0.08, soft: 0.05, warp: 0.6, detail: 0.7 });
  const L2 = organic(w, h, { seed: 1108, cells: 12, coverage: 0.05, soft: 0.04, detail: 0.6 });
  const lt = fbm(w, h, { cells: 50, octaves: 2, seed: 1109 });
  gradientMap(img, field(n, (i) => 0.5 + lt[i] * 0.5 - L1.rim[i] * 0.3), [[0, '#86887c'], [0.5, '#a2a396'], [1, '#bab9aa']], field(n, (i) => L1.m[i] * (0.35 + lt[i] * 0.2)));
  tint(img, L2.m, '#8e9a7c', 0.3);
  // lenticels: short horizontal dashes
  const lent = new Float32Array(n);
  for (let c = 0; c < 220 * k * k; c++) {
    const x = rng() * w, y = rng() * h, L = (3 + rng() * 6) * k;
    line(lent, w, h, x, y, x + L, y + (rng() - 0.5) * k, 0.8 * k, 0.8, 'max');
  }
  tint(img, lent, '#4a443a', 0.35);
  // dark wet runnels in the gaps between strands
  const runN = fbm(w, h, { cells: [6, 2], octaves: 3, seed: 1110 });
  const gap = field(n, (i) => (1 - sstep(0.05, 0.3, H[i])) * sstep(-0.3, 0.3, runN[i]));
  tint(img, gap, '#16130f', 0.45);
  shade(img, H, { strength: 0.42, bump: 34 * k, ao: 0.6, aoRadius: Math.round(4 * k), aoScale: 3, edge: 0.25 });
  adjust(img, { saturation: 0.9 });
  return {
    bark_banyan: colorOut(img),
    bark_banyan_normal: dataOut(normalMap(H, w, h, 24 * k), w, h),
  };
}
