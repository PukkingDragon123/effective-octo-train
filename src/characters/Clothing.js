// Outfits: garment plans built from the appearance spec, SDF garment shells
// (inflated copies of anatomical primitive groups, clipped by hem planes, with
// folds) and procedural painted patterns for vertex colouring.
import { noise, clamp, lerp, smoothstep } from '../core/math.js';
import { custom, smin, smax, sdEllipsoid, sdCapsule } from './SDF.js';

// sRGB hex -> [r,g,b] 0..1 (sRGB)
export function hexRGB(c) {
  if (Array.isArray(c)) return c;
  if (typeof c === 'string') c = parseInt(c.replace('#', ''), 16);
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}

/** Default garment plans per outfit type. Colours are sRGB hex. */
const OUTFITS = {
  'tshirt-pants': { top: { style: 'tshirt', sleeve: 0.36, color: 0x55606a, hemY: -0.02, loose: 0.012 }, bottom: { style: 'pants', length: 0.97, color: 0x2e3a52, pattern: 'denim', loose: 0.012 }, shoes: 'sandals' },
  'shirt-slacks': { top: { style: 'shirt', sleeve: 0.38, color: 0xc9c2b0, tucked: true, collar: true, buttons: true, pocket: true }, bottom: { style: 'pants', length: 0.98, color: 0x2f2d2b, loose: 0.014, belt: 0x2a1d14 }, shoes: 'shoes' },
  'taxi-uniform': { top: { style: 'shirt', sleeve: 0.38, color: 0x8fa6b8, collar: true, buttons: true, pocket: true, faded: 0.4, loose: 0.016 }, bottom: { style: 'pants', length: 0.98, color: 0x34322f, loose: 0.016, belt: 0x241a12 }, shoes: 'sandals' },
  dress: { top: { style: 'dress', sleeve: 0.62, color: 0xe9e6dc, loose: 0.01, neckline: 'round' }, bottom: { style: 'skirt', length: 0.56, color: 0xe9e6dc, flare: 0.07, sameAsTop: true }, belt: 0x1d1b1a, shoes: 'barefoot' },
  'school-uniform': { top: { style: 'shirt', sleeve: 0.35, color: 0xf0efe8, tucked: true, collar: true, buttons: true, pocket: true, nameTag: true, loose: 0.012 }, bottom: { style: 'shorts', length: 0.36, color: 0x1f2a44, loose: 0.02, belt: 0x5a3a22 }, shoes: 'shoes', socks: 0xf0efe8, sockLen: 0.45 },
  'monk-robe': { top: { style: 'robe', color: 0xb5651d, loose: 0.02 }, bottom: { style: 'skirt', length: 0.86, color: 0xa95d1c, flare: 0.08, folds: 1.2 }, shoes: 'barefoot' },
  sabai: { top: { style: 'sabai', color: 0x2f6b4a, loose: 0.008, accent: 0xc9a24a }, bottom: { style: 'skirt', length: 0.97, color: 0x7a5a2a, pattern: 'thaisilk', flare: 0.02, pleat: true, accent: 0xd8b25a }, belt: 0xc9a24a, shoes: 'barefoot' },
  'market-vendor': { top: { style: 'blouse', sleeve: 0.42, color: 0x8a3b4a, pattern: 'floral', loose: 0.018 }, bottom: { style: 'skirt', length: 0.86, color: 0x3a2f3a, pattern: 'thaisilk', flare: 0.04 }, apron: 0x3f5f7a, shoes: 'sandals' },
  'tank-sarong': { top: { style: 'tank', color: 0xd8d4c8, loose: 0.006, stained: 0.5 }, bottom: { style: 'skirt', length: 0.9, color: 0x5a3040, pattern: 'checks', flare: 0.05, knot: true }, shoes: 'sandals' },
  'tank-pants': { top: { style: 'tank', color: 0xe6e2d6, loose: 0.006, stained: 0.3 }, bottom: { style: 'pants', length: 0.92, color: 0x2a2a2c, loose: 0.03 }, shoes: 'sandals' },
  'hoodie-jeans': { top: { style: 'hoodie', sleeve: 1.0, color: 0x3a3f45, loose: 0.02, hood: true }, bottom: { style: 'pants', length: 0.98, color: 0x2e3a52, pattern: 'denim', loose: 0.012 }, shoes: 'shoes' },
  'old-woman-sarong': { top: { style: 'blouse', sleeve: 0.62, color: 0xd9c9c0, pattern: 'lace', loose: 0.016 }, bottom: { style: 'skirt', length: 0.97, color: 0x3b2a3e, pattern: 'thaisilk', flare: 0.02 }, shoes: 'barefoot' },
  farmer: { top: { style: 'shirt', sleeve: 0.95, color: 0x22283a, loose: 0.024, collar: false, buttons: true }, bottom: { style: 'pants', length: 0.8, color: 0x22283a, loose: 0.03 }, sash: 0xa03030, shoes: 'barefoot' },
  singer: { top: { style: 'jacket', sleeve: 1.0, color: 0x9a1f2a, pattern: 'sequin', loose: 0.018, collar: true, inner: 0xe8e4da }, bottom: { style: 'pants', length: 1.0, color: 0x1a1a1c, loose: 0.02, flare: 0.04, belt: 0x111111 }, shoes: 'shoes', shoeColor: 0xe8e4da },
  shroud: { top: { style: 'shroud', color: 0xe4e0d4, loose: 0.03 }, bottom: { style: 'skirt', length: 1.0, color: 0xe4e0d4, flare: 0.0, sameAsTop: true }, shoes: 'barefoot' },
};
OUTFITS['tshirt-shorts'] = { ...OUTFITS['tshirt-pants'], bottom: { style: 'shorts', length: 0.42, color: 0x3a3a34, loose: 0.02 } };

/** Resolve the spec outfit into a garment plan. */
export function outfitPlan(spec) {
  const o = spec.outfit || {};
  const type = o.type || 'tshirt-pants';
  const base = OUTFITS[type] || OUTFITS['tshirt-pants'];
  const plan = JSON.parse(JSON.stringify(base));
  plan.type = type;
  if (o.top !== undefined) plan.top.color = o.top;
  if (o.bottom !== undefined) plan.bottom.color = o.bottom;
  if (plan.bottom.sameAsTop && o.top !== undefined && o.bottom === undefined) plan.bottom.color = o.top;
  if (o.accent !== undefined) plan.accent = o.accent;
  if (o.shoes) plan.shoes = o.shoes;
  if (o.topStyle) plan.top.style = o.topStyle;
  if (o.bottomStyle) plan.bottom.style = o.bottomStyle;
  if (o.sleeve !== undefined) plan.top.sleeve = o.sleeve;
  if (o.length !== undefined) plan.bottom.length = o.length;
  if (o.pattern) plan.top.pattern = o.pattern;
  if (o.bottomPattern) plan.bottom.pattern = o.bottomPattern;
  return plan;
}

// ---------------------------------------------------------------------------
// Shell primitives
// ---------------------------------------------------------------------------
/** Union of a group of primitives inflated by thickness t(x,y,z), clipped by clip(x,y,z) (<0 keeps). */
export function shell(group, thick, clip, o = {}) {
  const prims = group.filter(Boolean);
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const tmax = typeof thick === 'number' ? thick : (o.tmax ?? 0.04);
  for (const p of prims) for (let i = 0; i < 3; i++) { bb[i] = Math.min(bb[i], p.bbox[i] - tmax - 0.01); bb[i + 3] = Math.max(bb[i + 3], p.bbox[i + 3] + tmax + 0.01); }
  if (o.bbox) for (let i = 0; i < 3; i++) { bb[i] = Math.max(bb[i], o.bbox[i]); bb[i + 3] = Math.min(bb[i + 3], o.bbox[i + 3]); }
  const kk = o.blend ?? 0.03;
  const n = prims.length;
  const pad = tmax + kk + 0.03;
  const boxes = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) for (let j = 0; j < 6; j++) boxes[i * 6 + j] = prims[i].bbox[j] + (j < 3 ? -pad : pad);
  const ks = prims.map((p) => Math.max(kk, p.k));
  const fn = (x, y, z) => {
    let d = 1;
    let first = true;
    for (let i = 0; i < n; i++) {
      const o6 = i * 6;
      if (x < boxes[o6] || y < boxes[o6 + 1] || z < boxes[o6 + 2] || x > boxes[o6 + 3] || y > boxes[o6 + 4] || z > boxes[o6 + 5]) continue;
      const di = prims[i].eval(x, y, z);
      d = first ? di : smin(d, di, ks[i]);
      first = false;
    }
    d -= typeof thick === 'number' ? thick : thick(x, y, z);
    if (clip) d = smax(d, clip(x, y, z), o.clipK ?? 0.004);
    return d;
  };
  const prim = custom(fn, bb, { k: o.k ?? 0.006, mat: o.mat || 'top', bias: o.bias ?? 0.004, region: null, tag: o.tag || 'shell' });
  prim.band = [-0.035, tmax + 0.035];
  return prim;
}

/** Elliptical tube/skirt around the vertical axis from yTop (radii at top) to yBot with flare & folds. */
export function skirtPrim(P, cfg, o = {}) {
  const yTop = cfg.yTop, yBot = cfg.yBot;
  const cx = 0, cz = cfg.cz ?? 0.01;
  const rxT = cfg.rxTop, rzT = cfg.rzTop, rxB = cfg.rxBot, rzB = cfg.rzBot;
  const folds = cfg.folds ?? 1;
  const seed = cfg.seed ?? 1;
  const pleat = !!cfg.pleat;
  const fn = (x, y, z) => {
    const t = clamp((yTop - y) / (yTop - yBot), 0, 1);
    const tt = t * t * (3 - 2 * t);
    let rx = lerp(rxT, rxB, Math.pow(t, 0.8));
    let rz = lerp(rzT, rzB, Math.pow(t, 0.8));
    const ang = Math.atan2(x - cx, -(z - cz));
    // folds grow toward the hem
    const f = folds * (0.4 + tt) * (Math.sin(ang * 7 + seed + noise.noise2D(ang * 2, y * 3 + seed) * 1.5) * 0.006 + noise.noise2D(ang * 3 + seed, y * 6) * 0.004);
    let pl = 0;
    if (pleat) {
      // front pleat of a wrapped skirt (pha sin / sarong): a vertical ridge slightly off-centre
      const a2 = ang - 0.25;
      pl = Math.exp(-a2 * a2 * 60) * 0.012 * (0.5 + tt);
    }
    const qx = (x - cx) / rx, qz = (z - cz) / rz;
    const rr = Math.sqrt(qx * qx + qz * qz);
    let d = (rr - 1) * Math.min(rx, rz) - f - pl;
    // top and bottom caps
    d = smax(d, y - yTop, 0.02);
    d = smax(d, yBot - y, 0.004);
    return d;
  };
  const m = Math.max(rxT, rxB, rzT, rzB) + 0.03;
  return custom(fn, [cx - m, yBot - 0.02, cz - m, cx + m, yTop + 0.03, cz + m], { k: o.k ?? 0.03, mat: o.mat || 'bottom', bias: o.bias ?? 0.006, region: 'skirt', tag: 'skirt' });
}

// distance from p to plane through point a with normal n (positive on the n side)
export const planeD = (x, y, z, a, n) => (x - a[0]) * n[0] + (y - a[1]) * n[1] + (z - a[2]) * n[2];

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------
const toLin = (c) => Math.pow(c, 2.2);

/** Pattern colour (sRGB) for a garment at body-space point p. */
export function patternColor(g, x, y, z, base, out) {
  const pat = g.pattern || 'solid';
  let r = base[0], gg = base[1], b = base[2];
  const n1 = noise.noise3D(x * 9, y * 9, z * 9);
  if (pat === 'checks') {
    // plaid sarong: two overlapping band sets around the tube
    const ang = Math.atan2(x, -z);
    const u = ang * 0.17 / 0.06;
    const v = y / 0.06;
    const bu = Math.sin(u * Math.PI) > 0.2 ? 1 : 0;
    const bv = Math.sin(v * Math.PI) > 0.2 ? 1 : 0;
    const thin = Math.abs(Math.sin(u * Math.PI * 2.0)) < 0.18 || Math.abs(Math.sin(v * Math.PI * 2.0)) < 0.18 ? 1 : 0;
    const acc = hexRGB(g.accent ?? 0x2a3a6a);
    const k = (bu + bv) * 0.35;
    r = lerp(r, acc[0], k); gg = lerp(gg, acc[1], k); b = lerp(b, acc[2], k);
    if (thin) { r = lerp(r, 0.85, 0.35); gg = lerp(gg, 0.75, 0.35); b = lerp(b, 0.45, 0.35); }
  } else if (pat === 'floral') {
    const f = noise.noise3D(x * 22 + 3, y * 22, z * 22);
    const f2 = noise.noise3D(x * 30, y * 30 + 7, z * 30);
    if (f > 0.35) { r = lerp(r, 0.95, 0.6); gg = lerp(gg, 0.8, 0.6); b = lerp(b, 0.55, 0.6); }
    else if (f2 > 0.45) { r = lerp(r, 0.35, 0.5); gg = lerp(gg, 0.55, 0.5); b = lerp(b, 0.35, 0.5); }
  } else if (pat === 'thaisilk') {
    // woven pha sin: horizontal bands with a gold-ish border near the hem
    const band = Math.sin(y * 70) * 0.5 + 0.5;
    const acc = hexRGB(g.accent ?? 0xb8954a);
    const hemBand = g.yBot !== undefined ? smoothstep(0.09, 0.02, y - g.yBot) : 0;
    const k = 0.12 * band + hemBand * 0.6;
    r = lerp(r, acc[0], k); gg = lerp(gg, acc[1], k); b = lerp(b, acc[2], k);
    const dia = Math.abs(Math.sin((Math.atan2(x, -z) * 4 + y * 40))) < 0.12 ? 0.25 : 0;
    r = lerp(r, acc[0], dia * hemBand); gg = lerp(gg, acc[1], dia * hemBand); b = lerp(b, acc[2], dia * hemBand);
  } else if (pat === 'sequin') {
    const s = noise.noise3D(x * 160, y * 160, z * 160);
    const s2 = noise.noise3D(x * 47, y * 47, z * 47);
    const k = s > 0.55 ? 0.9 : s > 0.3 ? 0.35 : 0;
    r = lerp(r, 1.0, k * 0.8); gg = lerp(gg, 0.82, k * 0.8); b = lerp(b, 0.5, k * 0.8);
    r *= 0.85 + s2 * 0.2; gg *= 0.85 + s2 * 0.2; b *= 0.85 + s2 * 0.2;
  } else if (pat === 'lace') {
    const s = Math.sin(x * 120) * Math.sin(y * 120) * Math.sin(z * 120);
    const k = s > 0.3 ? 0.12 : 0;
    r = lerp(r, 1, k); gg = lerp(gg, 1, k); b = lerp(b, 1, k);
  } else if (pat === 'denim') {
    const k = noise.noise3D(x * 40, y * 4, z * 40) * 0.08;
    r += k * 0.6; gg += k * 0.7; b += k;
  }
  // weave / painterly tone variation
  const v = 1 + n1 * 0.05;
  out[0] = r * v; out[1] = gg * v; out[2] = b * v;
  return out;
}

export { toLin };
