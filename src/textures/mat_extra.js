// Procedural fallbacks for keys that were introduced with the photobashed library
// (fabric_sarong, flower_atlas, foliage_world, and the props / world detail sets at the end). They are deliberately simple: the real
// textures come from public/assets/textures (see photo.js); these only keep tex() working
// (same layout, plausible colours) when the photo set is missing or still loading.
import { FLOWER_ATLAS } from './flowerLayout.js';
import { fbm as nfbm } from './noise.js';
import { normalMap as nmap } from './painter.js';

function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const raw = (w, h, data, o = {}) => ({ w, h, data, srgb: o.srgb !== false, alpha: !!o.alpha, wrap: o.wrap || 'repeat' });
function flatNormal(w, h, wrap) {
  const d = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) d.set([128, 128, 255, 255], i * 4);
  return raw(w, h, d, { srgb: false, wrap });
}

/** Pha khao ma style woven check (the photobashed version adds a real cotton weave). */
export function genSarong(S = 512) {
  const d = new Uint8Array(S * S * 4);
  const base = hex('#2f5a8a'), red = hex('#a8382c'), cream = hex('#d4ccb6');
  const band = (t) => {
    const k = (t * 8) % 1;
    return k < 0.42 ? 1 : k > 0.5 && k < 0.56 ? 0.5 : 0;
  };
  for (let y = 0; y < S; y++) {
    const by = band(y / S);
    for (let x = 0; x < S; x++) {
      const bx = band(x / S);
      const weave = ((x + y) & 1 ? 0.92 : 1.0) * (((x >> 1) + (y >> 1)) & 1 ? 0.96 : 1.04);
      let c = base;
      if (bx && by) c = bx * by > 0.24 ? cream : red;
      else if (bx || by) c = red;
      const i = (y * S + x) * 4;
      d[i] = c[0] * weave * 0.9;
      d[i + 1] = c[1] * weave * 0.9;
      d[i + 2] = c[2] * weave * 0.9;
      d[i + 3] = 255;
    }
  }
  return { fabric_sarong: raw(S, S, d), fabric_sarong_normal: flatNormal(8, 8) };
}

/** Flower atlas fallback: simple petal rosettes / domes / ribbons in each FLOWER_ATLAS cell. */
export function genFlowerAtlas(S = 1024) {
  const d = new Uint8Array(S * S * 4);
  for (const c of FLOWER_ATLAS.cells) {
    const [u0, v0, u1, v1] = c.uv;
    const x0 = Math.round(u0 * S), x1 = Math.round(u1 * S), y0 = Math.round((1 - v1) * S), y1 = Math.round((1 - v0) * S);
    const w = x1 - x0, h = y1 - y0;
    const col = hex(c.color);
    const n = c.kind === 'chrysanthemum' || c.kind === 'marigold' ? 18 : c.kind === 'rose' ? 7 : 5;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const fx = (x - x0) / w - 0.5, fy = (y - y0) / h - 0.5;
        let a = 0, shade = 1;
        if (c.kind === 'ribbon') {
          const t = (y - y0) / h;
          const half = 0.15 - t * 0.04;
          const notch = t > 0.88 && Math.abs(fx) < ((t - 0.88) / 0.12) * half;
          a = Math.abs(fx) < half && !notch && t > 0.01 ? 1 : 0;
          shade = 0.75 + 0.25 * Math.cos(t * 9);
        } else if (c.view === 'front') {
          const r = Math.hypot(fx, fy), th = Math.atan2(fy, fx);
          const R = 0.42 * (0.62 + 0.38 * Math.abs(Math.cos((n * th) / 2)));
          a = r < R ? 1 : 0;
          shade = 0.7 + 0.3 * (1 - r / 0.45);
        } else {
          const ex = fx / 0.4, ey = (fy - 0.12) / 0.3;
          a = ex * ex + ey * ey < 1 || (Math.abs(fx) < 0.02 && fy > 0.1) ? 1 : 0;
          shade = 0.65 + 0.35 * (1 - (fy + 0.5));
        }
        const i = (y * S + x) * 4;
        d[i] = Math.min(255, col[0] * shade);
        d[i + 1] = Math.min(255, col[1] * shade);
        d[i + 2] = Math.min(255, col[2] * shade);
        d[i + 3] = a * 255;
      }
    }
  }
  return { flower_atlas: raw(S, S, d, { alpha: true, wrap: 'clamp' }), flower_atlas_normal: flatNormal(8, 8, 'clamp') };
}

/** foliage_world fallback: fully transparent (the world keeps its own canvas atlas unless the photo loaded). */
export function genFoliageWorld(S = 64) {
  const d = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) d.set([40, 56, 30, 0], i * 4);
  return { foliage_world: raw(S, S, d, { alpha: true, wrap: 'clamp' }), foliage_world_normal: flatNormal(8, 8, 'clamp') };
}

// ---------------------------------------------------------------------------------------------
// Photo detail sets for props / world (galv, plastic_worn, rubber_worn, ceramic, paper_worn,
// brick, bamboo_culm, stem_fibre, creature_hide). The real maps are photobashed
// (tools/photobash/surfaces_props.py); these fallbacks only keep the same layout and the same
// LINEAR mean (DETAIL_MEAN) so materials tuned against the photos keep their brightness.
// ---------------------------------------------------------------------------------------------
/** Linear mean of the tintable detail maps (props scale their material colour by 1 / mean). */
export const DETAIL_MEAN = { galv: 0.4, plastic_worn: 0.5, rubber_worn: 0.4, ceramic: 0.6, paper_worn: 0.5, stem_fibre: 0.5 };

const toSrgb8 = (l) => {
  const c = Math.max(0, Math.min(1, l));
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
};
const toLin = (s8) => {
  const c = s8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** Neutral (or tinted) detail set: colour around a linear mean, normal + roughness from the same fbm. */
function detailSet(key, S, o) {
  const n = S * S;
  const f = nfbm(S, S, { cells: o.cells ?? [6, 6], octaves: 5, seed: o.seed ?? 1 });
  const g = nfbm(S, S, { cells: o.cells2 ?? [24, 24], octaves: 3, seed: (o.seed ?? 1) + 7 });
  const H = new Float32Array(n);
  const col = new Uint8Array(n * 4);
  const rough = new Uint8Array(n * 4);
  const base = o.lin; // [r,g,b] linear mean
  for (let i = 0; i < n; i++) {
    const v = f[i] * (o.amp ?? 0.25) + g[i] * (o.amp2 ?? 0.12);
    H[i] = 0.5 + f[i] * 0.3 + g[i] * 0.2;
    const k = 1 + v;
    col[i * 4] = toSrgb8(base[0] * k);
    col[i * 4 + 1] = toSrgb8(base[1] * k);
    col[i * 4 + 2] = toSrgb8(base[2] * k);
    col[i * 4 + 3] = 255;
    const r = Math.max(0, Math.min(1, (o.rough ?? 0.7) + g[i] * 0.15));
    rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = r * 255;
    rough[i * 4 + 3] = 255;
  }
  const out = { [key]: raw(S, S, col), [key + '_normal']: raw(S, S, nmap(H, S, S, o.bump ?? 2), { srgb: false }) };
  if (o.withRough !== false) out[key + '_rough'] = raw(S, S, rough, { srgb: false });
  return out;
}
const grey = (m) => [m, m * 0.99, m * 0.96];

export const genGalv = (S = 256) => detailSet('galv', S, { lin: grey(DETAIL_MEAN.galv), rough: 0.55, seed: 11 });
export const genPlasticWorn = (S = 256) => detailSet('plastic_worn', S, { lin: grey(DETAIL_MEAN.plastic_worn), rough: 0.62, amp: 0.12, seed: 12 });
export const genRubberWorn = (S = 256) => detailSet('rubber_worn', S, { lin: grey(DETAIL_MEAN.rubber_worn), rough: 0.85, cells2: [64, 64], seed: 13 });
export const genCeramic = (S = 256) => detailSet('ceramic', S, { lin: grey(DETAIL_MEAN.ceramic), rough: 0.2, amp: 0.08, amp2: 0.04, bump: 0.6, seed: 14 });
export const genPaperWorn = (S = 256) => detailSet('paper_worn', S, { lin: grey(DETAIL_MEAN.paper_worn).map((v, i) => v * [1, 0.97, 0.9][i]), rough: 0.88, seed: 15 });
export const genStemFibre = (S = 256) => detailSet('stem_fibre', S, { lin: grey(DETAIL_MEAN.stem_fibre), cells: [24, 2], cells2: [96, 6], withRough: false, seed: 16 });
export function genBrick(S = 256) {
  const out = detailSet('brick', S, { lin: [0.145, 0.085, 0.065], rough: 0.85, seed: 17 });
  // running-bond courses so the fallback still reads as brick
  const c = out.brick.data;
  const rows = 16, cols = 6;
  for (let y = 0; y < S; y++) {
    const r = Math.floor((y / S) * rows);
    const fy = ((y / S) * rows) % 1;
    for (let x = 0; x < S; x++) {
      const fx = ((x / S) * cols + (r % 2) * 0.5) % 1;
      if (fy < 0.12 || fx < 0.04) {
        const i = (y * S + x) * 4;
        c[i] = toSrgb8(0.2);
        c[i + 1] = toSrgb8(0.18);
        c[i + 2] = toSrgb8(0.15);
      }
    }
  }
  return out;
}
export function genBambooCulm(S = 256) {
  const out = detailSet('bamboo_culm', S, { lin: [toLin(0x6e), toLin(0x7c), toLin(0x46)], rough: 0.5, cells: [12, 2], cells2: [48, 4], seed: 18 });
  const c = out.bamboo_culm.data;
  for (let y = S - Math.round(S * 0.03); y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    c[i] *= 0.45;
    c[i + 1] *= 0.45;
    c[i + 2] *= 0.45;
  }
  return out;
}
/** Creature hide detail (RGB modulation around 0.5, A = height): flat neutral until the photo arrives. */
export function genCreatureHide(S = 8) {
  const d = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) d.set([128, 128, 128, 128], i * 4);
  return { creature_hide: raw(S, S, d, { srgb: false, alpha: true }) };
}
/** Creek / pond surface fallback: dark water, gentle ripple normals, glossy (photo adds leaves + scum). */
export function genWaterSurface(S = 256) {
  const out = detailSet('water_surface', S, { lin: [0.007, 0.009, 0.01], rough: 0.06, amp: 0.15, cells: [3, 8], cells2: [8, 24], bump: 1.5, seed: 19 });
  const r = out.water_surface_rough.data;
  for (let i = 0; i < r.length; i += 4) r[i] = r[i + 1] = r[i + 2] = 15;
  return out;
}
/** Woven bamboo strips fallback (2/2 twill of shaded strips). */
export function genBambooWeave(S = 256) {
  const out = detailSet('bamboo_weave', S, { lin: [toLin(0x8a), toLin(0x6c), toLin(0x48)], rough: 0.75, cells: [8, 8], seed: 20 });
  const c = out.bamboo_weave.data;
  const N = 32;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = Math.floor((x / S) * N), j = Math.floor((y / S) * N);
    const k = ((i + j) >> 1) % 2 === 0 ? 1.08 : 0.85;
    const o = (y * S + x) * 4;
    c[o] *= k;
    c[o + 1] *= k;
    c[o + 2] *= k;
  }
  return out;
}
