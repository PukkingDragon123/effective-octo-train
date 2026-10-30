// Characters & cloth: skin micro-detail, hair strand cards, cotton / silk / denim, monk
// robe (patchwork), tri-colour shrine cloths (red / yellow / green satin).
import { makeRng } from '../core/math.js';
import { fbm, worley, blur, line, disc, cellTable, crack } from './noise.js';
import {
  Img, gradientMap, strokes, shade, normalMap, grayBytes, colorOut, dataOut, tint, modulate, sstep, smask, field, blotches, adjust, rgb, bleed,
} from './painter.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// SKIN — tileable warm Thai skin micro texture: mottling (red / olive / blue undertones),
// pores, fine cross-hatched wrinkles, a few moles. skin_normal / skin_rough companions.
// Paint faces on top; this is the "surface" (≈ 10 cm per tile).
// ---------------------------------------------------------------------------
export function genSkin(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const low = fbm(w, h, { cells: 3, octaves: 5, seed: 3201 });
  const red = fbm(w, h, { cells: 6, octaves: 4, seed: 3202 });
  const blue = fbm(w, h, { cells: 5, octaves: 3, seed: 3203 });
  const pores = worley(w, h, { cells: Math.round(70 * k), seed: 3204 });
  const pT = cellTable(pores.cx * pores.cy, 3205);
  const wr1 = fbm(w, h, { cells: [40, 8], octaves: 2, seed: 3206 });
  const wr2 = fbm(w, h, { cells: [8, 40], octaves: 2, seed: 3207 });
  const fine = fbm(w, h, { cells: 120, octaves: 1, seed: 3208 });
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.55 + low[i] * 0.2 + fine[i] * 0.06), [[0, '#8a5c44'], [0.5, '#b4836a'], [1, '#cfa286']]);
  tint(img, smask(red, 0.0, 0.6, 0.4), '#b0604e', 0.35);
  tint(img, smask(blue, 0.2, 0.7, 0.25), '#7a7a6a', 0.3);
  const poreM = field(n, (i) => (pT[pores.id[i]] < 0.75 ? 1 - sstep(0.06, 0.16, pores.f1[i]) : 0));
  const wrinkle = field(n, (i) => Math.max(1 - sstep(0.0, 0.08, Math.abs(wr1[i])), 1 - sstep(0.0, 0.08, Math.abs(wr2[i]))) * 0.6);
  tint(img, poreM, '#7a4e3c', 0.35);
  tint(img, wrinkle, '#8d5d48', 0.25);
  const rng = makeRng(3209);
  const moles = new Float32Array(n);
  for (let c = 0; c < 4; c++) disc(moles, w, h, rng() * w, rng() * h, (1.5 + rng() * 2) * k, 1, 'max', 0.6);
  tint(img, moles, '#4a2c22', 0.7);
  strokes(img, { seed: 3210, len: [8 * k, 20 * k], width: [3 * k, 7 * k], opacity: 0.3, coverage: 0.6, valueJitter: 0.04, warmJitter: 0.04 });
  const H = field(n, (i) => 0.5 - poreM[i] * 0.06 - wrinkle[i] * 0.04 + fine[i] * 0.01 + low[i] * 0.01);
  const R = field(n, (i) => 0.52 + low[i] * 0.08 + poreM[i] * 0.1 - red[i] * 0.04);
  return {
    skin: colorOut(img),
    skin_normal: dataOut(normalMap(H, w, h, 6 * k), w, h),
    skin_rough: dataOut(grayBytes(R, w, h), w, h),
  };
}

// ---------------------------------------------------------------------------
// HAIR STRANDS — RGBA hair card (roots at the top, tips at the bottom; tiles in u).
// Black-brown strands, clumping, a soft sheen band. Alpha tapers at the tips.
// ---------------------------------------------------------------------------
export function genHairStrands(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(3300);
  const img = new Img(w, h, [0.06, 0.05, 0.045, 0]);
  const d = img.d;
  const count = Math.round(900 * k);
  for (let c = 0; c < count; c++) {
    let x = rng() * w;
    const len = h * (0.55 + rng() * 0.45);
    const wd = (0.6 + rng() * 0.9) * k;
    const sway = (rng() - 0.5) * 0.6;
    const clump = Math.floor(x / (w / 14));
    const tone = 0.04 + rng() * 0.08 + (rng() < 0.08 ? 0.12 : 0);
    let dx = 0;
    for (let y = 0; y < len; y++) {
      dx += sway * 0.02 + Math.sin(y * 0.02 + c) * 0.03;
      // clump toward clump centres near the tips
      const cc = (clump + 0.5) * (w / 14);
      const pull = (y / len) * 0.4;
      const px = x + dx + (cc - x) * pull * 0.25;
      const fade = 1 - Math.pow(y / len, 3);
      for (let ox = -1; ox <= 1; ox++) {
        const xx = Math.floor(px) + ox;
        const q = 1 - Math.abs(xx + 0.5 - px) / (wd + 0.5);
        if (q <= 0) continue;
        const i = Math.floor(y) * w + (((xx % w) + w) % w);
        const j = i * 4;
        const a = q * fade;
        const sheen = Math.exp(-Math.pow((y / h - 0.28) * 7, 2)) * 0.12;
        const v = tone + sheen;
        if (a > d[j + 3]) {
          d[j] = v * 1.05;
          d[j + 1] = v * 0.92;
          d[j + 2] = v * 0.82;
          d[j + 3] = Math.min(1, a * 1.3);
        }
      }
    }
  }
  // fill the root area densely
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) if (y < h * 0.35) d[i * 4 + 3] = Math.max(d[i * 4 + 3], sstep(0.35, 0.12, y / h));
  bleed(img, 4);
  return { hair_strands: colorOut(img, { alpha: true }) };
}

// ---------------------------------------------------------------------------
// FABRICS — neutral (light) cottons/silks meant to be tinted with material.color, plus
// coloured denim, monk robe and shrine cloths.
// ---------------------------------------------------------------------------
function weave(w, h, threads, twill, seed) {
  const n = w * h;
  const slub = fbm(w, h, { cells: [Math.max(1, threads / 4), 4], octaves: 2, seed });
  const slub2 = fbm(w, h, { cells: [4, Math.max(1, threads / 4)], octaves: 2, seed: seed + 1 });
  const H = new Float32Array(n), warpM = new Float32Array(n);
  const p = w / threads;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const tx = Math.floor(x / p), ty = Math.floor(y / p);
      const fx = x / p - tx, fy = y / p - ty;
      const over = twill ? (((tx - ty) % 4) + 4) % 4 < 2 : (tx + ty) % 2 === 0;
      const a = Math.sin(fx * Math.PI), b = Math.sin(fy * Math.PI);
      warpM[i] = over ? 1 : 0;
      H[i] = over ? 0.5 + a * 0.35 + slub[i] * 0.05 : 0.5 + b * 0.35 + slub2[i] * 0.05;
    }
  }
  return { H, warpM, slub, slub2 };
}

/** Soft cloth folds (height) shared by the cloth generators. */
function folds(w, h, seed, k, dir = 'v') {
  const n = w * h;
  const f = fbm(w, h, { cells: dir === 'v' ? [5, 1] : [1, 5], octaves: 3, seed });
  const g = fbm(w, h, { cells: 3, octaves: 3, seed: seed + 1 });
  return field(n, (i) => Math.sin(f[i] * 7 + g[i] * 2) * 0.5 + 0.5);
}

function clothFinish(img, H, n, w, h, k, seed, sheen) {
  if (sheen) {
    const fl = blur(H, w, h, Math.round(3 * k), 1);
    tint(img, field(n, (i) => sstep(0.55, 0.9, fl[i]) * sheen), '#ffffff', 0.25, 'screen');
  }
  strokes(img, { seed, len: [10 * k, 26 * k], width: [3 * k, 7 * k], opacity: 0.25, coverage: 0.5, valueJitter: 0.05 });
}

export function genFabricCotton(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const wv = weave(w, h, Math.round(160 * k), false, 3400);
  const fo = folds(w, h, 3401, k);
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: 3402 });
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.4 + wv.H[i] * 0.2 + fo[i] * 0.3 + low[i] * 0.1), [[0, '#9c968a'], [0.5, '#cbc5b7'], [1, '#e6e1d4']]);
  const rng = makeRng(3403);
  tint(img, blotches(w, h, rng, 6, 10 * k, 40 * k, low, 0.2), '#a89a7a', 0.35);
  clothFinish(img, wv.H, n, w, h, k, 3404, 0);
  const H = field(n, (i) => wv.H[i] * 0.05 + fo[i] * 0.3);
  return { fabric_cotton: colorOut(img), fabric_cotton_normal: dataOut(normalMap(H, w, h, 10 * k), w, h) };
}

export function genFabricSilk(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const wv = weave(w, h, Math.round(220 * k), true, 3500);
  const fo = folds(w, h, 3501, k);
  const shot = fbm(w, h, { cells: [2, 8], octaves: 3, seed: 3502 });
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.35 + fo[i] * 0.45 + wv.H[i] * 0.08 + shot[i] * 0.1), [[0, '#7c7568'], [0.5, '#c2b9a8'], [1, '#f0e8d6']]);
  // silk sheen streaks along the folds (warp-faced)
  tint(img, field(n, (i) => sstep(0.7, 0.98, fo[i]) * 0.6), '#ffffff', 0.35, 'screen');
  tint(img, smask(shot, 0.1, 0.6, 0.25), '#d6c08a', 0.3); // shot-silk warm shift
  clothFinish(img, wv.H, n, w, h, k, 3503, 0.4);
  const H = field(n, (i) => wv.H[i] * 0.02 + fo[i] * 0.35);
  return {
    fabric_silk: colorOut(img),
    fabric_silk_normal: dataOut(normalMap(H, w, h, 10 * k), w, h),
    fabric_silk_rough: dataOut(grayBytes(field(n, (i) => 0.35 - fo[i] * 0.1 + wv.H[i] * 0.05), w, h), w, h),
  };
}

export function genFabricDenim(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const wv = weave(w, h, Math.round(150 * k), true, 3600);
  const fo = folds(w, h, 3601, k);
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: 3602 });
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.4 + wv.warpM[i] * 0.25 + wv.slub[i] * 0.15 + fo[i] * 0.15), [[0, '#16203a'], [0.45, '#2a3d63'], [0.8, '#4a6088'], [1, '#8e9cb4']]);
  tint(img, field(n, (i) => (1 - wv.warpM[i]) * 0.5), '#9aa0aa', 0.45); // white weft
  tint(img, field(n, (i) => sstep(0.6, 0.95, fo[i]) * sstep(-0.2, 0.4, low[i]) * 0.6), '#a8b4c8', 0.4); // fading on fold crests
  clothFinish(img, wv.H, n, w, h, k, 3603, 0);
  const H = field(n, (i) => wv.H[i] * 0.06 + fo[i] * 0.3);
  return { fabric_denim: colorOut(img), fabric_denim_normal: dataOut(normalMap(H, w, h, 10 * k), w, h) };
}

// MONK ROBE — saffron-ochre "rice paddy" patchwork: rectangular panels joined by stitched
// seams, each panel a slightly different dye lot, sun-faded, soft folds.
export function genMonkRobe(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const wv = weave(w, h, Math.round(140 * k), false, 3700);
  const fo = folds(w, h, 3701, k);
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: 3702 });
  // paddy layout: 5 columns, alternating 2/3 rows, with narrow strips between
  const colsX = [0, 0.06, 0.3, 0.36, 0.64, 0.7, 0.94, 1];
  const panelT = cellTable(64, 3703);
  const seam = new Float32Array(n), pid = new Float32Array(n);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const u = x / w, v = y / h;
      let c = 0;
      while (c < colsX.length - 2 && u > colsX[c + 1]) c++;
      const rowsN = c % 2 ? 1 : 3;
      const r = Math.floor(v * rowsN);
      pid[i] = panelT[(c * 4 + r) % 64];
      const du = Math.min(u - colsX[c], colsX[c + 1] - u) * w;
      const dv = Math.min(v * rowsN - r, r + 1 - v * rowsN) * (h / rowsN);
      seam[i] = 1 - sstep(1 * k, 3.5 * k, Math.min(du, dv));
    }
  }
  const img = new Img(w, h);
  gradientMap(img, field(n, (i) => 0.35 + fo[i] * 0.35 + (pid[i] - 0.5) * 0.2 + wv.H[i] * 0.08 + low[i] * 0.1), [[0, '#6a3410'], [0.35, '#9a5418'], [0.65, '#c07224'], [1, '#d99a44']]);
  tint(img, seam, '#5a2c0e', 0.55);
  // stitch dashes along seams
  tint(img, field(n, (i) => seam[i] > 0.6 && ((i % w) + ((i / w) | 0)) % (6 * k) < 2.5 * k ? 0.6 : 0), '#e0a050', 0.5);
  tint(img, smask(low, 0.2, 0.7, 0.4), '#e4b06a', 0.3); // sun-faded
  clothFinish(img, wv.H, n, w, h, k, 3704, 0);
  const H = field(n, (i) => wv.H[i] * 0.04 + fo[i] * 0.3 - seam[i] * 0.02);
  return { monk_robe: colorOut(img), monk_robe_normal: dataOut(normalMap(H, w, h, 10 * k), w, h) };
}

// CLOTH red / yellow / green — the satin ผ้าสามสี wrapped around sacred trees: saturated but
// sun-faded, rain-stained toward the bottom, satin sheen on folds.
export function genCloths(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const wv = weave(w, h, Math.round(200 * k), true, 3800);
  const fo = folds(w, h, 3801, k, 'h');
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: 3802 });
  const out = {};
  const pals = {
    cloth_red: [['#4a0a0c', '#8e1a1c', '#c43a30', '#e2725a'], '#d8a090'],
    cloth_yellow: [['#6a4a08', '#b68a14', '#e0b62c', '#f4dc78'], '#ecdcb0'],
    cloth_green: [['#0c3218', '#17602e', '#2a8a46', '#78c08a'], '#b4d0b0'],
  };
  const stain = field(n, (i) => sstep(0.55, 1.0, ((i / w) | 0) / h + low[i] * 0.2) * 0.6);
  for (const [key, [p, fade]] of Object.entries(pals)) {
    const img = new Img(w, h);
    gradientMap(img, field(n, (i) => 0.25 + fo[i] * 0.55 + wv.H[i] * 0.06 + low[i] * 0.1), [[0, p[0]], [0.4, p[1]], [0.75, p[2]], [1, p[3]]]);
    tint(img, field(n, (i) => sstep(0.75, 0.98, fo[i]) * 0.5), '#ffffff', 0.3, 'screen');
    tint(img, smask(low, 0.15, 0.7, 0.45), fade, 0.4);
    tint(img, stain, '#3a2a1c', 0.4);
    clothFinish(img, wv.H, n, w, h, k, 3803, 0);
    out[key] = colorOut(img);
  }
  const H = field(n, (i) => wv.H[i] * 0.02 + fo[i] * 0.35);
  out.cloth_normal = dataOut(normalMap(H, w, h, 10 * k), w, h);
  return out;
}
