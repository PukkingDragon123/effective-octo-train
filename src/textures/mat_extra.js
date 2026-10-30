// Procedural fallbacks for keys that were introduced with the photobashed library
// (fabric_sarong, flower_atlas, foliage_world). They are deliberately simple: the real
// textures come from public/assets/textures (see photo.js); these only keep tex() working
// (same layout, plausible colours) when the photo set is missing or still loading.
import { FLOWER_ATLAS } from './flowerLayout.js';

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
