// Built / man-made materials: rust, painted metal, peeling paint (white wall, red wood),
// old wood (+planks), clay roof tiles, corrugated zinc, gold leaf, red lacquer, lantern
// paper, incense ash. v-up convention: streaks and drips run DOWN the texture.
import { makeRng } from '../core/math.js';
import { fbm, worley, blur, warp, crack, line, disc, drip, cellTable, pseudoGlyph } from './noise.js';
import {
  Img, rgb, gradientMap, strokes, shade, normalMap, grayBytes, colorOut, dataOut, tint, modulate, sstep, smask, field, blotches, adjust, streaks,
} from './painter.js';

const TAU = Math.PI * 2;

/** Organic peel mask: returns { lost (0..1 substrate visible), rim (lifted flake edge), crackle }. */
function peelMask(w, h, seed, amount, k, scale = 6) {
  const n = w * h;
  const wx = fbm(w, h, { cells: 5, octaves: 3, seed: seed + 1 }), wy = fbm(w, h, { cells: 5, octaves: 3, seed: seed + 2 });
  const D0 = fbm(w, h, { cells: scale, octaves: 6, seed: seed + 3, gain: 0.6 });
  const D = warp(D0, w, h, wx, wy, 12 * k);
  const lost = new Float32Array(n);
  for (let i = 0; i < n; i++) lost[i] = sstep(amount, amount + 0.025, D[i]);
  const lb = blur(lost, w, h, Math.max(1, Math.round(2 * k)), 1);
  const rim = new Float32Array(n), shadowIn = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    rim[i] = sstep(0.02, 0.35, lb[i]) * (1 - lost[i]);
    shadowIn[i] = lost[i] * (1 - sstep(0.55, 1.0, lb[i]));
  }
  const cr = worley(w, h, { cells: Math.round(26 * k), seed: seed + 4 });
  const crackle = new Float32Array(n);
  for (let i = 0; i < n; i++) crackle[i] = (1 - sstep(0.0, 0.05, cr.f2[i] - cr.f1[i])) * sstep(amount - 0.25, amount, D[i]) * (1 - lost[i]);
  return { lost, rim, shadowIn, crackle, D };
}

// ---------------------------------------------------------------------------
// RUST — corroded steel: flaking scale, pits, orange blooms, dark streaks.
// ---------------------------------------------------------------------------
function rustLayer(w, h, seed, k) {
  const n = w * h;
  const flk = worley(w, h, { cells: Math.round(22 * k), seed: seed + 1 });
  const low = fbm(w, h, { cells: 3, octaves: 5, seed: seed + 2 });
  const fine = fbm(w, h, { cells: 60, octaves: 3, seed: seed + 3 });
  const tT = cellTable(flk.cx * flk.cy, seed);
  const H = new Float32Array(n);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const sc = Math.max(0, 1 - flk.f1[i] * 1.4) * tT[flk.id[i]];
    H[i] = 0.4 + sc * 0.12 + fine[i] * 0.06 + low[i] * 0.05;
    f[i] = 0.45 + low[i] * 0.35 + fine[i] * 0.25 + sc * 0.3;
  }
  return { H, f, low, fine };
}
const RUST_RAMP = [[0, '#26150d'], [0.25, '#4a2614'], [0.45, '#6e3a1c'], [0.62, '#8f5126'], [0.8, '#a86a34'], [1, '#c08a4e']];

export function genRust(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(1200);
  const r = rustLayer(w, h, 1201, k);
  const img = new Img(w, h);
  gradientMap(img, r.f, RUST_RAMP);
  // pits
  const pits = new Float32Array(n);
  for (let c = 0; c < 260 * k * k; c++) disc(pits, w, h, rng() * w, rng() * h, (1 + rng() * 3) * k, 1, 'max', 0.4);
  tint(img, pits, '#1c0f09', 0.7);
  // bright orange blooms + dark streaks
  const bloom = smask(fbm(w, h, { cells: 7, octaves: 4, seed: 1202 }), 0.25, 0.6, 0.5);
  tint(img, bloom, '#c2742e', 0.45);
  const st = streaks(w, h, 1203, { count: Math.round(40 * k), len: [0.2, 0.8], width: [2 * k, 6 * k], strength: 0.7 });
  tint(img, blur(st, w, h, 2, 1), '#2a160c', 0.45);
  strokes(img, { seed: 1204, len: [6 * k, 14 * k], width: [2.5 * k, 5 * k], opacity: 0.5, coverage: 0.8, valueJitter: 0.1, warmJitter: 0.05, height: r.H, heightAmt: 0.03 });
  for (let i = 0; i < n; i++) r.H[i] -= pits[i] * 0.1;
  shade(img, r.H, { strength: 0.3, bump: 14 * k, ao: 0.6, aoRadius: 2, edge: 0.3 });
  const R = field(n, (i) => 0.82 + r.fine[i] * 0.08);
  return {
    rust: colorOut(img),
    rust_normal: dataOut(normalMap(r.H, w, h, 10 * k), w, h),
    rust_rough: dataOut(grayBytes(R, w, h), w, h),
  };
}

// ---------------------------------------------------------------------------
// METAL PAINTED — faded teal-grey enamel on sheet steel, chipped to rust, rust bleeding down.
// ---------------------------------------------------------------------------
export function genMetalPainted(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const r = rustLayer(w, h, 1301, k);
  const pm = peelMask(w, h, 1310, 0.3, k, 5);
  const img = new Img(w, h);
  gradientMap(img, r.f, RUST_RAMP);
  const paint = new Img(w, h);
  const pf = fbm(w, h, { cells: 4, octaves: 4, seed: 1311 });
  gradientMap(paint, field(n, (i) => 0.5 + pf[i] * 0.4 + r.fine[i] * 0.1), [[0, '#4f625e'], [0.5, '#6b807b'], [1, '#90a19a']]);
  // chalky sun-faded patches
  tint(paint, smask(pf, 0.1, 0.6, 0.5), '#a9b3aa', 0.5);
  const d = img.d, p = paint.d;
  for (let i = 0; i < n; i++) {
    const a = 1 - pm.lost[i];
    const j = i * 4;
    d[j] += (p[j] - d[j]) * a;
    d[j + 1] += (p[j + 1] - d[j + 1]) * a;
    d[j + 2] += (p[j + 2] - d[j + 2]) * a;
  }
  tint(img, pm.rim, '#c3cbc2', 0.35);
  // rust bleeding down from the chips
  const bleedSrc = blur(pm.lost, w, h, 2, 1);
  const dr = drip(field(n, (i) => bleedSrc[i] * 0.6), w, h, 1312, 0.975, 0.993);
  for (let i = 0; i < n; i++) dr[i] *= 1 - pm.lost[i];
  tint(img, dr, '#7a4422', 0.5);
  tint(img, pm.crackle, '#3b3a33', 0.4);
  const grime = smask(fbm(w, h, { cells: [6, 2], octaves: 3, seed: 1313 }), 0.0, 0.7, 0.35);
  tint(img, grime, '#2b2a24', 0.4);
  strokes(img, { seed: 1314, len: [8 * k, 20 * k], width: [3 * k, 6 * k], opacity: 0.35, coverage: 0.6, valueJitter: 0.05 });
  const H = field(n, (i) => r.H[i] * pm.lost[i] + (0.55 + pf[i] * 0.01) * (1 - pm.lost[i]) + pm.rim[i] * 0.03);
  shade(img, H, { strength: 0.25, bump: 14 * k, ao: 0.5, aoRadius: 2, edge: 0.2 });
  const R = field(n, (i) => 0.55 + pm.lost[i] * 0.33 + pf[i] * 0.05);
  return {
    metal_painted: colorOut(img),
    metal_painted_normal: dataOut(normalMap(H, w, h, 12 * k), w, h),
    metal_painted_rough: dataOut(grayBytes(R, w, h), w, h),
  };
}

// ---------------------------------------------------------------------------
// PAINT PEEL WHITE — whitewashed render over concrete: flaking, black mildew runs from the
// top, green algae near the bottom, rising damp tide line.
// ---------------------------------------------------------------------------
export function genPaintPeelWhite(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const pm = peelMask(w, h, 1400, 0.24, k, 5);
  const low = fbm(w, h, { cells: 3, octaves: 5, seed: 1401 });
  const fine = fbm(w, h, { cells: 64, octaves: 2, seed: 1402 });
  const img = new Img(w, h);
  // substrate: grey render
  gradientMap(img, field(n, (i) => 0.5 + low[i] * 0.3 + fine[i] * 0.2), [[0, '#5e5b54'], [0.5, '#7c786e'], [1, '#98938a']]);
  const paint = new Img(w, h);
  gradientMap(paint, field(n, (i) => 0.55 + low[i] * 0.3 + fine[i] * 0.1), [[0, '#b7b2a4'], [0.5, '#cdc8b9'], [1, '#e0dccd']]);
  const d = img.d, p = paint.d;
  for (let i = 0; i < n; i++) {
    const a = 1 - pm.lost[i];
    const j = i * 4;
    d[j] += (p[j] - d[j]) * a;
    d[j + 1] += (p[j + 1] - d[j + 1]) * a;
    d[j + 2] += (p[j + 2] - d[j + 2]) * a;
  }
  tint(img, pm.rim, '#f0ecdf', 0.45);
  tint(img, pm.shadowIn, '#3a3833', 0.35);
  tint(img, pm.crackle, '#8a857a', 0.45);
  // mildew runs (from the top) and algae (bottom)
  const st = streaks(w, h, 1403, { count: Math.round(55 * k), len: [0.2, 0.75], width: [2 * k, 9 * k], strength: 0.9 });
  const stb = blur(st, w, h, Math.round(3 * k), 2);
  const mm = smask(low, -0.2, 0.5);
  for (let i = 0; i < n; i++) stb[i] *= 0.5 + mm[i] * 0.6;
  tint(img, stb, '#3c3e36', 0.55);
  const alg = field(n, (i) => {
    const y = ((i / w) | 0) / h;
    return sstep(0.55, 1.0, y + low[i] * 0.25 + fine[i] * 0.05) * 0.55;
  });
  tint(img, alg, '#4a5a32', 0.6);
  // splash dirt line
  strokes(img, { seed: 1404, len: [10 * k, 26 * k], width: [3 * k, 7 * k], opacity: 0.35, coverage: 0.7, angle: 0, angleJitter: 0.8, valueJitter: 0.05 });
  const H = field(n, (i) => 0.5 + (1 - pm.lost[i]) * 0.04 + pm.rim[i] * 0.03 + fine[i] * 0.01 - pm.crackle[i] * 0.01);
  shade(img, H, { strength: 0.25, bump: 24 * k, ao: 0.45, aoRadius: 2, edge: 0.15 });
  return {
    paint_peel_white: colorOut(img),
    paint_peel_white_normal: dataOut(normalMap(H, w, h, 18 * k), w, h),
  };
}

// ---------------------------------------------------------------------------
// WOOD — weathered silver-brown timber (grain along v). Shared by wood_old / wood_planks /
// paint_peel_red (red paint over wood).
// ---------------------------------------------------------------------------
function woodLayer(w, h, seed, k, planks = 0) {
  const n = w * h;
  const rng = makeRng(seed);
  const wx = fbm(w, h, { cells: [3, 1], octaves: 2, seed: seed + 1 });
  const g0 = fbm(w, h, { cells: [6, 1], octaves: 2, seed: seed + 2 });
  const g1 = fbm(w, h, { cells: [24, 1], octaves: 1, seed: seed + 6 });
  const fineV = fbm(w, h, { cells: [90, 6], octaves: 2, seed: seed + 3 });
  const plankId = new Int32Array(n), gap = new Float32Array(n);
  const pw = planks ? w / planks : w;
  const pOff = cellTable(16, seed + 4), pTone = cellTable(16, seed + 5);
  const H = new Float32Array(n), tone = new Float32Array(n), grain = new Float32Array(n);
  // knots
  const knots = [];
  for (let i = 0; i < 4; i++) knots.push([rng() * w, rng() * h, (5 + rng() * 9) * k]);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const p = planks ? Math.floor(x / pw) : 0;
      plankId[i] = p;
      let gx = x + wx[i] * 9 * k + pOff[p] * 300;
      let ky = 0;
      for (const [kx, kyy, kr] of knots) {
        let dx = x - kx, dy = y - kyy;
        if (dx > w / 2) dx -= w;
        if (dx < -w / 2) dx += w;
        if (dy > h / 2) dy -= h;
        if (dy < -h / 2) dy += h;
        const d2 = (dx * dx) / (kr * kr) + (dy * dy) / (kr * kr * 9);
        if (d2 < 9) {
          const infl = Math.exp(-d2 * 0.5);
          gx += (dx > 0 ? 1 : -1) * infl * kr * 1.4;
          ky = Math.max(ky, Math.exp(-d2 * 2.5));
        }
      }
      const ring = 0.5 + 0.5 * Math.sin(gx * 0.42 / k + g0[i] * 9 + g1[i] * 2);
      const late = 0.5 + 0.5 * Math.sin(gx * 0.11 / k + g0[i] * 5);
      const gr = Math.pow(ring, 4) * (0.35 + 0.35 * late) + fineV[i] * 0.35 + Math.pow(late, 8) * 0.25;
      grain[i] = gr + ky * 0.8;
      tone[i] = pTone[p];
      if (planks) {
        const lx = x - p * pw;
        const e = Math.min(lx, pw - lx);
        gap[i] = 1 - sstep(0.5 * k, 2.5 * k, e);
      }
      H[i] = 0.5 - gr * 0.06 - gap[i] * 0.25 - ky * 0.04 + fineV[i] * 0.02;
    }
  }
  // splits along the grain
  const C = new Float32Array(n);
  for (let c = 0; c < 6; c++) {
    const x = rng() * w, y = rng() * h, L = (40 + rng() * 120) * k;
    let px = x;
    for (let t = 0; t < L; t += 4 * k) {
      const nx = px + (rng() - 0.5) * 1.2 * k;
      line(C, w, h, px, y + t, nx, y + t + 4 * k, (1.3 - (t / L)) * k + 0.3, 1, 'max');
      px = nx;
    }
  }
  for (let i = 0; i < n; i++) H[i] -= C[i] * 0.12;
  return { H, tone, grain, gap, C, knots, plankId };
}

function paintWood(img, wl, n, k, palette) {
  gradientMap(img, field(n, (i) => 0.62 - wl.grain[i] * 0.45 + (wl.tone[i] - 0.5) * 0.25), palette);
  tint(img, smask(wl.C, 0.2, 0.8), '#1d1712', 0.85);
  tint(img, wl.gap, '#120e0b', 0.95);
}

export function genWoodOld(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const out = {};
  for (const [key, planks, seed] of [['wood_old', 0, 1500], ['wood_planks', 4, 1520]]) {
    const wl = woodLayer(w, h, seed, k, planks);
    const img = new Img(w, h);
    paintWood(img, wl, n, k, [[0, '#2e261f'], [0.3, '#4f4337'], [0.55, '#6f6456'], [0.78, '#8c8374'], [1, '#a59d8e']]);
    // brown un-weathered undertone in places, dark water stains, moss at plank ends
    const low = fbm(w, h, { cells: 3, octaves: 4, seed: seed + 9 });
    tint(img, smask(low, 0.1, 0.6, 0.45), '#6a4c34', 0.5);
    tint(img, smask(fbm(w, h, { cells: [4, 2], octaves: 3, seed: seed + 10 }), 0.25, 0.7, 0.4), '#2a231c', 0.5);
    // nail holes with rust halos
    const rng = makeRng(seed + 11);
    const nails = new Float32Array(n), halo = new Float32Array(n);
    for (let c = 0; c < (planks ? 8 : 3); c++) {
      const x = planks ? (Math.floor(rng() * planks) + 0.5) * (w / planks) : rng() * w, y = rng() * h;
      disc(nails, w, h, x, y, 2.2 * k, 1, 'max', 1);
      disc(halo, w, h, x, y + 3 * k, 9 * k, 0.6, 'max');
    }
    tint(img, drip(halo, w, h, seed, 0.96, 0.985), '#5a3420', 0.45);
    tint(img, nails, '#140f0c', 0.9);
    strokes(img, { seed: seed + 12, len: [14 * k, 40 * k], width: [2.5 * k, 6 * k], opacity: 0.45, coverage: 0.8, angle: Math.PI / 2, angleJitter: 0.06, curve: 0.05, valueJitter: 0.07, warmJitter: 0.03, bristles: 9, bristleAmt: 0.6, height: wl.H, heightAmt: 0.01 });
    shade(img, wl.H, { strength: 0.3, bump: 18 * k, ao: 0.5, aoRadius: 2, edge: 0.25 });
    adjust(img, { saturation: 0.9 });
    out[key] = colorOut(img);
    out[key + '_normal'] = dataOut(normalMap(wl.H, w, h, 14 * k), w, h);
  }
  return out;
}

// ---------------------------------------------------------------------------
// PAINT PEEL RED — oxblood temple/shrine paint over grey wood, peeling along the grain.
// ---------------------------------------------------------------------------
export function genPaintPeelRed(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const wl = woodLayer(w, h, 1600, k, 0);
  const img = new Img(w, h);
  paintWood(img, wl, n, k, [[0, '#2c241d'], [0.4, '#5a4e42'], [0.75, '#857b6c'], [1, '#9e9686']]);
  // peel follows grain: stretch the damage noise vertically
  const wx = fbm(w, h, { cells: [4, 2], octaves: 3, seed: 1601 }), wy = fbm(w, h, { cells: [4, 2], octaves: 3, seed: 1602 });
  const D = warp(fbm(w, h, { cells: [10, 2], octaves: 6, seed: 1603, gain: 0.6 }), w, h, wx, wy, 10 * k);
  const lost = smask(field(n, (i) => D[i] - wl.grain[i] * 0.12), 0.18, 0.2);
  const lb = blur(lost, w, h, Math.max(1, Math.round(1.5 * k)), 1);
  const rim = field(n, (i) => sstep(0.02, 0.4, lb[i]) * (1 - lost[i]));
  const paint = new Img(w, h);
  const pf = fbm(w, h, { cells: 3, octaves: 4, seed: 1604 });
  gradientMap(paint, field(n, (i) => 0.5 + pf[i] * 0.35 - wl.grain[i] * 0.15), [[0, '#4a1210'], [0.4, '#701c16'], [0.7, '#8e2a1e'], [1, '#a8432c']]);
  tint(paint, smask(pf, 0.2, 0.7, 0.45), '#b0604a', 0.45); // sun-chalked
  const d = img.d, p = paint.d;
  for (let i = 0; i < n; i++) {
    const a = 1 - lost[i];
    const j = i * 4;
    d[j] += (p[j] - d[j]) * a;
    d[j + 1] += (p[j + 1] - d[j + 1]) * a;
    d[j + 2] += (p[j + 2] - d[j + 2]) * a;
  }
  tint(img, rim, '#c27a62', 0.4);
  tint(img, smask(fbm(w, h, { cells: [6, 2], octaves: 3, seed: 1605 }), 0.2, 0.7, 0.4), '#241612', 0.45);
  strokes(img, { seed: 1606, len: [16 * k, 40 * k], width: [3 * k, 7 * k], opacity: 0.4, coverage: 0.75, angle: Math.PI / 2, angleJitter: 0.08, valueJitter: 0.06, bristles: 9, height: wl.H, heightAmt: 0.01 });
  const H = field(n, (i) => wl.H[i] + (1 - lost[i]) * 0.04 + rim[i] * 0.02);
  shade(img, H, { strength: 0.28, bump: 18 * k, ao: 0.5, aoRadius: 2, edge: 0.2 });
  return {
    paint_peel_red: colorOut(img),
    paint_peel_red_normal: dataOut(normalMap(H, w, h, 14 * k), w, h),
  };
}

// ---------------------------------------------------------------------------
// ROOF TILES — Thai fired-clay tiles with rounded tails, staggered rows, soot streaks,
// moss in the overlaps, lichen spots. 6 tiles across, 8 rows down.
// ---------------------------------------------------------------------------
export function genRoofTiles(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const cols = 6, rows = 8;
  const tw = w / cols, th = h / rows;
  const tone = cellTable(cols * rows * 2, 1701);
  const H = new Float32Array(n), shadowM = new Float32Array(n), edgeM = new Float32Array(n), tid = new Float32Array(n);
  const fine = fbm(w, h, { cells: 48, octaves: 2, seed: 1702 });
  const tailOf = (u) => 1 + 0.24 * Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.5) * 2.05, 2)));
  const hit = { id: 0, ly: 0, edge: 0, ok: false };
  const tileAt = (r, x, y) => {
    const rr = ((r % rows) + rows) % rows;
    const off = (rr % 2) * tw * 0.5;
    const lx = (((x - off) % w) + w) % w;
    const c = Math.floor(lx / tw);
    const u = (lx - c * tw) / tw;
    const ly = (y - r * th) / th;
    const tail = tailOf(u);
    const side = Math.min(u, 1 - u) * tw;
    if (ly < 0 || ly > tail || side < 0.9 * k) return false;
    hit.id = (rr * cols + c) % (cols * rows);
    hit.ly = ly;
    hit.edge = Math.min(1, ((tail - ly) * th) / (4 * k)) * Math.min(1, (side - 0.9 * k) / (3 * k));
    return true;
  };
  for (let y = 0, i = 0; y < h; y++) {
    const r0 = Math.floor(y / th);
    for (let x = 0; x < w; x++, i++) {
      let covered = tileAt(r0 - 1, x + 0.5, y + 0.5);
      if (!covered && !tileAt(r0, x + 0.5, y + 0.5)) {
        H[i] = 0;
        shadowM[i] = 1;
        continue;
      }
      tid[i] = hit.id;
      H[i] = 0.25 + hit.ly * 0.22 + (1 - hit.edge) * -0.04 + fine[i] * 0.01;
      edgeM[i] = 1 - hit.edge;
      if (!covered) {
        // shadow cast by the tail of the tile above
        const rr = (((r0 - 1) % rows) + rows) % rows;
        const off = (rr % 2) * tw * 0.5;
        const lx = (((x + 0.5 - off) % w) + w) % w;
        const u = (lx - Math.floor(lx / tw) * tw) / tw;
        const tailY = (r0 - 1) * th + tailOf(u) * th;
        shadowM[i] = (1 - sstep(0, 7 * k, y + 0.5 - tailY)) * 0.85;
      }
    }
  }
  const img = new Img(w, h);
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: 1703 });
  gradientMap(img, field(n, (i) => 0.5 + (tone[tid[i] | 0] - 0.5) * 0.45 + low[i] * 0.2 + fine[i] * 0.12), [[0, '#4a2418'], [0.3, '#6e3422'], [0.55, '#8a4630'], [0.8, '#a35a3c'], [1, '#b8714f']]);
  // fired-clay blackening on some tiles
  const black = field(n, (i) => (tone[(tid[i] | 0) + 3] > 0.8 ? 0.5 : 0) * (0.6 + fine[i] * 0.4));
  tint(img, black, '#2a1a14', 0.6);
  tint(img, shadowM, '#160c09', 0.75);
  // soot / rain streaks down the roof, lichen and moss in overlaps
  const st = streaks(w, h, 1704, { count: Math.round(50 * k), len: [0.2, 0.7], width: [2 * k, 8 * k], strength: 0.8 });
  tint(img, blur(st, w, h, 2, 1), '#2b2420', 0.45);
  const rng = makeRng(1705);
  const rag = fbm(w, h, { cells: 30, octaves: 2, seed: 1706 });
  tint(img, blotches(w, h, rng, Math.round(40 * k * k), 2 * k, 11 * k, rag, 0.6), '#c2bea8', 0.5);
  tint(img, blotches(w, h, rng, Math.round(16 * k * k), 2 * k, 8 * k, rag, 0.6), '#b4863e', 0.5);
  const mossM = field(n, (i) => sstep(0.3, 0.9, shadowM[i] + edgeM[i] * 0.5) * sstep(-0.1, 0.4, low[i]) * 0.9);
  gradientMap(img, field(n, (i) => 0.45 + rag[i] * 0.4), [[0, '#1d2810'], [0.5, '#3f5419'], [1, '#7a8d2c']], mossM, 0.85);
  strokes(img, { seed: 1707, len: [8 * k, 20 * k], width: [3 * k, 6 * k], opacity: 0.4, coverage: 0.7, angle: 0, angleJitter: 0.5, valueJitter: 0.06, height: H, heightAmt: 0.01 });
  shade(img, H, { strength: 0.3, bump: 20 * k, ao: 0.6, aoRadius: Math.round(3 * k), aoScale: 4, edge: 0.3 });
  return {
    roof_tiles: colorOut(img),
    roof_tiles_normal: dataOut(normalMap(H, w, h, 16 * k), w, h),
  };
}

// ---------------------------------------------------------------------------
// CORRUGATED — galvanised zinc sheet (12 corrugations across, ridges along v), white
// oxidation, rust in the troughs and around nail holes, streaks down.
// ---------------------------------------------------------------------------
export function genRoofCorrugated(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const waves = 12;
  const H = new Float32Array(n), trough = new Float32Array(n);
  const low = fbm(w, h, { cells: 3, octaves: 5, seed: 1801 });
  const fine = fbm(w, h, { cells: [80, 20], octaves: 2, seed: 1802 });
  const dent = fbm(w, h, { cells: 4, octaves: 3, seed: 1803 });
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const ph = (x / w) * waves * TAU;
      const s = Math.cos(ph);
      H[i] = 0.5 + s * 0.5 + dent[i] * 0.15 + fine[i] * 0.01;
      trough[i] = sstep(0.2, 1, -s);
    }
  }
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.5 + low[i] * 0.35 + fine[i] * 0.2), [[0, '#4f5456'], [0.5, '#7a8082'], [1, '#a1a6a5']]);
  tint(img, smask(fbm(w, h, { cells: 6, octaves: 4, seed: 1804 }), 0.2, 0.55, 0.5), '#b8bdb6', 0.5); // white rust
  // rust: in troughs + along a bottom overlap band + nails on the ridges
  const rr = fbm(w, h, { cells: 5, octaves: 5, seed: 1805, gain: 0.6 });
  const rustM = field(n, (i) => {
    const y = ((i / w) | 0) / h;
    const band = sstep(0.82, 0.98, y) + sstep(0.15, 0.0, y) * 0.6;
    return sstep(0.0, 0.3, rr[i] + trough[i] * 0.35 + band * 0.5 - 0.15);
  });
  const nails = new Float32Array(n);
  for (let c = 0; c < waves; c += 2) for (const yy of [0.08, 0.58]) disc(nails, w, h, ((c + 0.5) / waves) * w, yy * h, 2.5 * k, 1, 'max', 1);
  const nailHalo = blur(nails, w, h, Math.round(5 * k), 2);
  const rustAll = drip(field(n, (i) => Math.max(rustM[i] * 0.85, Math.min(1, nailHalo[i] * 6))), w, h, 1806, 0.975, 0.992);
  const rl = rustLayer(w, h, 1807, k);
  const rust = new Img(w, h);
  gradientMap(rust, rl.f, RUST_RAMP);
  const d = img.d, r = rust.d;
  for (let i = 0; i < n; i++) {
    const a = Math.min(1, rustAll[i]) * 0.9;
    const j = i * 4;
    d[j] += (r[j] - d[j]) * a;
    d[j + 1] += (r[j + 1] - d[j + 1]) * a;
    d[j + 2] += (r[j + 2] - d[j + 2]) * a;
  }
  tint(img, nails, '#1a1512', 0.9);
  strokes(img, { seed: 1808, len: [16 * k, 40 * k], width: [3 * k, 6 * k], opacity: 0.35, coverage: 0.6, angle: Math.PI / 2, angleJitter: 0.1, valueJitter: 0.05 });
  shade(img, H, { strength: 0.35, bump: 6 * k, ao: 0.2, aoRadius: 3, edge: 0.1 });
  const R = field(n, (i) => 0.5 + rustAll[i] * 0.4 + low[i] * 0.08);
  return {
    roof_corrugated: colorOut(img),
    roof_corrugated_normal: dataOut(normalMap(H, w, h, 9 * k), w, h),
    roof_corrugated_rough: dataOut(grayBytes(R, w, h), w, h),
  };
}

// ---------------------------------------------------------------------------
// GOLD LEAF — gilding in overlapping leaf squares, crackle, rubbed-through to red bole,
// soot in the low areas. Use with metalness ~0.8 and gold_leaf_rough.
// ---------------------------------------------------------------------------
export function genGoldLeaf(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const sheets = 6, sw = w / sheets;
  const tone = cellTable(sheets * sheets, 1901);
  const low = fbm(w, h, { cells: 3, octaves: 5, seed: 1902 });
  const fine = fbm(w, h, { cells: 70, octaves: 2, seed: 1903 });
  const wear = fbm(w, h, { cells: 5, octaves: 6, seed: 1904, gain: 0.6 });
  const img = new Img(w, h);
  const seam = new Float32Array(n), sid = new Float32Array(n);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const row = Math.floor(y / sw);
      const off = (row % 2) * sw * 0.37;
      const lx = (((x + off) % w) + w) % w;
      const c = Math.floor(lx / sw);
      sid[i] = tone[(row * sheets + c) % (sheets * sheets)];
      const ex = Math.min(lx - c * sw, (c + 1) * sw - lx), ey = Math.min(y - row * sw, (row + 1) * sw - y);
      seam[i] = 1 - sstep(0.5 * k, 2 * k, Math.min(ex, ey) + fine[i] * k);
    }
  }
  gradientMap(img, field(n, (i) => 0.5 + (sid[i] - 0.5) * 0.06 + low[i] * 0.3 + fine[i] * 0.15), [[0, '#6b4a16'], [0.3, '#9a7224'], [0.55, '#c39a3c'], [0.78, '#ddb85a'], [1, '#f0d488']]);
  tint(img, seam, '#e8c870', 0.1);
  tint(img, smask(fbm(w, h, { cells: [8, 3], octaves: 3, seed: 1907 }), 0.2, 0.7, 0.4), '#fff0b0', 0.35); // burnish
  const bole = smask(wear, 0.32, 0.36);
  const boleImg = new Img(w, h);
  gradientMap(boleImg, field(n, (i) => 0.5 + fine[i] * 0.4), [[0, '#3a120c'], [0.5, '#6a2216'], [1, '#8a3a22']]);
  const d = img.d, b = boleImg.d;
  for (let i = 0; i < n; i++) {
    const a = bole[i];
    const j = i * 4;
    d[j] += (b[j] - d[j]) * a;
    d[j + 1] += (b[j + 1] - d[j + 1]) * a;
    d[j + 2] += (b[j + 2] - d[j + 2]) * a;
  }
  const cr = worley(w, h, { cells: Math.round(30 * k), seed: 1905 });
  const crackle = field(n, (i) => (1 - sstep(0.0, 0.04, cr.f2[i] - cr.f1[i])) * sstep(0.0, 0.3, wear[i]) * 0.8);
  tint(img, crackle, '#3a2a12', 0.6);
  tint(img, smask(low, -0.6, 0.0, 0.45), '#2a2014', 0.5); // soot in low areas
  strokes(img, { seed: 1906, len: [8 * k, 20 * k], width: [3 * k, 6 * k], opacity: 0.35, coverage: 0.6, valueJitter: 0.08, warmJitter: 0.03 });
  const H = field(n, (i) => 0.5 + seam[i] * 0.02 - bole[i] * 0.03 - crackle[i] * 0.02 + fine[i] * 0.01);
  shade(img, H, { strength: 0.2, bump: 14 * k, ao: 0.4, aoRadius: 2, edge: 0.2 });
  const R = field(n, (i) => 0.28 + bole[i] * 0.55 + crackle[i] * 0.3 + Math.max(0, -low[i]) * 0.3 + fine[i] * 0.04);
  return {
    gold_leaf: colorOut(img),
    gold_leaf_normal: dataOut(normalMap(H, w, h, 10 * k), w, h),
    gold_leaf_rough: dataOut(grayBytes(R, w, h), w, h),
  };
}

// ---------------------------------------------------------------------------
// RED LACQUER — Chinese shrine lacquer: deep crimson, fine crackle, brush drag, worn to
// black undercoat, dust in the cracks.
// ---------------------------------------------------------------------------
export function genRedLacquer(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const low = fbm(w, h, { cells: 3, octaves: 5, seed: 2001 });
  const fine = fbm(w, h, { cells: [120, 20], octaves: 2, seed: 2002 });
  const wear = fbm(w, h, { cells: 4, octaves: 6, seed: 2003, gain: 0.6 });
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.5 + low[i] * 0.35 + fine[i] * 0.12), [[0, '#3c0a0a'], [0.3, '#5e1010'], [0.55, '#7e1714'], [0.8, '#982419'], [1, '#ad3a22']]);
  const under = smask(wear, 0.36, 0.4);
  tint(img, under, '#1c1210', 0.85);
  const ub = blur(under, w, h, 1, 1);
  tint(img, field(n, (i) => sstep(0.05, 0.5, ub[i]) * (1 - under[i])), '#c4553a', 0.35);
  const cr = worley(w, h, { cells: Math.round(40 * k), seed: 2004 });
  const crackle = field(n, (i) => (1 - sstep(0.0, 0.035, cr.f2[i] - cr.f1[i])) * (0.4 + 0.6 * sstep(-0.2, 0.3, low[i])));
  tint(img, crackle, '#2a0806', 0.5);
  tint(img, smask(low, 0.2, 0.7, 0.3), '#8a6a5a', 0.3); // dust film
  strokes(img, { seed: 2005, len: [30 * k, 80 * k], width: [5 * k, 10 * k], opacity: 0.25, coverage: 0.6, angle: 0, angleJitter: 0.05, valueJitter: 0.05, bristles: 12, bristleAmt: 0.6 });
  const H = field(n, (i) => 0.5 - under[i] * 0.03 - crackle[i] * 0.02 + fine[i] * 0.006);
  shade(img, H, { strength: 0.2, bump: 12 * k, ao: 0.3, aoRadius: 2, edge: 0.1 });
  const R = field(n, (i) => 0.32 + under[i] * 0.4 + crackle[i] * 0.3 + sstep(0.2, 0.7, low[i]) * 0.25);
  return {
    red_lacquer: colorOut(img),
    red_lacquer_normal: dataOut(normalMap(H, w, h, 10 * k), w, h),
    red_lacquer_rough: dataOut(grayBytes(R, w, h), w, h),
  };
}

// ---------------------------------------------------------------------------
// LANTERN PAPER — red Chinese lantern skin (u wraps around, v top->bottom): bamboo rib lines,
// paper fibre, gold bands and brushed glyphs, age stains. Also usable as emissiveMap.
// ---------------------------------------------------------------------------
export function genLanternPaper(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(2100);
  const fib = fbm(w, h, { cells: [40, 100], octaves: 2, seed: 2101 });
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: 2102 });
  const ribs = 11;
  const img = new Img(w, h);
  const f = new Float32Array(n), rib = new Float32Array(n);
  for (let y = 0, i = 0; y < h; y++) {
    const ph = (y / h) * ribs;
    const fr = ph - Math.floor(ph);
    const r = 1 - sstep(0.0, 0.06, Math.min(fr, 1 - fr));
    const bulge = Math.sin(fr * Math.PI);
    for (let x = 0; x < w; x++, i++) {
      rib[i] = r;
      f[i] = 0.35 + bulge * 0.45 + fib[i] * 0.12 + low[i] * 0.12;
    }
  }
  gradientMap(img, f, [[0, '#4a0c0a'], [0.35, '#86160f'], [0.65, '#b3241a'], [0.9, '#d2442a'], [1, '#e0623a']]);
  tint(img, rib, '#3a0806', 0.65);
  // gold bands top and bottom
  const band = field(n, (i) => {
    const y = ((i / w) | 0) / h;
    return sstep(0.1, 0.085, y) + sstep(0.9, 0.915, y);
  });
  gradientMap(img, field(n, (i) => 0.5 + fib[i] * 0.5 + low[i] * 0.2), [[0, '#7a5212'], [0.5, '#b88a2e'], [1, '#e2c060']], band, 0.95);
  // brushed glyphs (gold) on two sides
  const gm = new Float32Array(n);
  for (const u of [0.25, 0.75]) pseudoGlyph(gm, w, h, u * w, 0.5 * h, 0.34 * h, rng, 1);
  const gmb = blur(gm, w, h, 1, 1);
  gradientMap(img, field(n, (i) => 0.4 + fib[i] * 0.6), [[0, '#9a6c1c'], [1, '#f2cf6a']], smask(gmb, 0.2, 0.6), 0.95);
  // age stains and water marks
  tint(img, smask(fbm(w, h, { cells: 4, octaves: 5, seed: 2103 }), 0.25, 0.6, 0.45), '#3a1410', 0.45);
  strokes(img, { seed: 2104, len: [10 * k, 26 * k], width: [3 * k, 7 * k], opacity: 0.3, coverage: 0.5, angle: 0, angleJitter: 0.3, valueJitter: 0.06 });
  const H = field(n, (i) => 0.5 - rib[i] * 0.05 + fib[i] * 0.01);
  shade(img, H, { strength: 0.15, bump: 8 * k, ao: 0.2, aoRadius: 2, edge: 0.1 });
  return { lantern_paper: colorOut(img) };
}

// ---------------------------------------------------------------------------
// INCENSE ASH — top of an incense urn: fine grey ash, joss-stick stubs (red), fallen
// half-burnt sticks, ash curls.
// ---------------------------------------------------------------------------
export function genIncenseAsh(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(2200);
  const low = fbm(w, h, { cells: 4, octaves: 5, seed: 2201 });
  const fine = fbm(w, h, { cells: 90, octaves: 2, seed: 2202 });
  const H = field(n, (i) => 0.5 + low[i] * 0.08 + fine[i] * 0.03);
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.5 + low[i] * 0.45 + fine[i] * 0.3), [[0, '#3e3a36'], [0.4, '#6a6560'], [0.75, '#938e86'], [1, '#c2bdb2']]);
  // fallen sticks (thin, red-brown, grey burnt tips)
  const sticks = new Float32Array(n), tips = new Float32Array(n);
  for (let c = 0; c < 22 * k * k; c++) {
    const x = rng() * w, y = rng() * h, a = rng() * TAU, L = (30 + rng() * 80) * k;
    const x1 = x + Math.cos(a) * L, y1 = y + Math.sin(a) * L;
    line(sticks, w, h, x, y, x1, y1, 1.6 * k, 1, 'max');
    line(tips, w, h, x1 - Math.cos(a) * L * 0.25, y1 - Math.sin(a) * L * 0.25, x1, y1, 2 * k, 1, 'max');
  }
  tint(img, sticks, '#8c2a26', 0.85);
  tint(img, tips, '#5a5450', 0.8);
  // standing stubs seen from above
  const stubs = new Float32Array(n), stubC = new Float32Array(n);
  // clustered bundles of red joss-stick ends (seen from above)
  for (let b = 0; b < 26 * k * k; b++) {
    const bx = rng() * w, by = rng() * h, br = (6 + rng() * 22) * k;
    const cnt = 4 + Math.floor(rng() * 16);
    for (let c = 0; c < cnt; c++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * br;
      const x = bx + Math.cos(a) * r, y = by + Math.sin(a) * r;
      disc(stubs, w, h, x, y, 2.4 * k, 1, 'max', 1);
      disc(stubC, w, h, x, y, 1.1 * k, 1, 'max', 1);
    }
  }
  tint(img, blur(stubs, w, h, Math.round(4 * k), 1), '#2a2420', 0.35); // soot around bundles
  tint(img, stubs, '#b2362c', 0.95);
  tint(img, stubC, '#3a2622', 0.8);
  // ash curls
  const curls = new Float32Array(n);
  for (let c = 0; c < 50 * k * k; c++) {
    let x = rng() * w, y = rng() * h, a = rng() * TAU;
    for (let s = 0; s < 6; s++) {
      const nx = x + Math.cos(a) * 3 * k, ny = y + Math.sin(a) * 3 * k;
      line(curls, w, h, x, y, nx, ny, 1.4 * k, 1, 'max');
      x = nx;
      y = ny;
      a += 0.5;
    }
  }
  tint(img, curls, '#cfcac0', 0.6);
  for (let i = 0; i < n; i++) H[i] += sticks[i] * 0.04 + stubs[i] * 0.08 + curls[i] * 0.02;
  strokes(img, { seed: 2203, len: [5 * k, 12 * k], width: [2 * k, 4 * k], opacity: 0.35, coverage: 0.6, valueJitter: 0.06 });
  shade(img, H, { strength: 0.25, bump: 12 * k, ao: 0.6, aoRadius: 2, edge: 0.2 });
  return { incense_ash: colorOut(img) };
}
