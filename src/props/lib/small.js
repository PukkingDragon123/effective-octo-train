// Small reusable "adders": each draws one object INTO a Kit at the kit's current
// transform (so set pieces merge hundreds of small things into a few draw calls).
// Convention: o.p position, o.r yaw|euler, o.s scale; object origin at its base, front +Z.
import * as THREE from 'three';
import { bevelBox, bbox, lathe, cyl, sphere, tube, torus, quad, smoothPath, blob, makeRng, noise } from './kit.js';
import { mat, glowMat } from './materials.js';
import { zebraGeo, dancerGeo } from './figures.js';
import { addAsset, hasAsset } from './assets.js';
import { labelBand } from './print.js';
import { flowerHead, flowerCard, ribbonTail, flowerForColor, isWiltedColor } from './flowers.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const gcache = new Map();
/** Cache a geometry by key (geometries are copied into kits, never mutated). */
export function G(key, fn) {
  let g = gcache.get(key);
  if (!g) {
    g = fn();
    gcache.set(key, g);
  }
  return g;
}

/**
 * Use a loaded CC0 model (lib/assets.js) instead of the procedural version, at the adder's own
 * transform. Returns false (nothing added) when o.asset === false or the model isn't loaded.
 */
export function useAsset(k, id, o, extra = {}) {
  if (o.asset === false || !hasAsset(id)) return false;
  k.at(o.p, o.r, o.s, () => addAsset(k, id, extra));
  return true;
}

// fork_sign plank silhouette in canvas pixels (768 x 256, arrow pointing right): src/textures/signs.js
const FORK_PLANK = [[10, 40], [618, 30], [618, 6], [760, 132], [618, 248], [616, 222], [14, 212]];
/**
 * Wooden arrow plank carrying a 'fork_sign' face: the plank is extruded from the texture's own
 * silhouette so the painted edge and the wood agree. o {p, r, w=1.1, h=w/2.97, dir=+1|-1 (arrow
 * points to +X|-X), material (the sign material), color}. Face at z = +depth.
 */
export function forkPlank(k, signMaterial, o = {}) {
  const w = o.w ?? 1.1, h = o.h ?? w / 2.97, dir = o.dir ?? 1, dep = 0.03;
  const sh = new THREE.Shape();
  FORK_PLANK.forEach(([px, py], i) => {
    const x = (px / 768 - 0.5) * w * 0.985, y = (0.5 - py / 256) * h * 0.97;
    if (i) sh.lineTo(x, y);
    else sh.moveTo(x, y);
  });
  sh.closePath();
  k.at(o.p, o.r, null, () => {
    const g = new THREE.ExtrudeGeometry(sh, { depth: dep, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, curveSegments: 2 });
    k.add(mat('wood'), g, { s: [dir, 1, 1], color: o.color ?? 0x7a6448, w: { moss: 0.5, streak: 0.5, grime: 0 } });
    k.add(signMaterial, G(`plankface:${w.toFixed(3)}:${h.toFixed(3)}`, () => quad(w, h, 2, 1)), { p: [0, 0, dep + 0.0045], color: 0xffffff, uv: 'keep', w: { vary: 0.25, grime: 0 } });
    for (const yy of [-0.25, 0.25]) k.add(mat('rust'), G('nail', () => cyl(0.006, 0.006, 0.01, 6, 0.001).rotateX(Math.PI / 2)), { p: [-dir * (w / 2 - 0.08), yy * h, dep + 0.008], color: 0x5a3a20, w: false });
  });
}

// palettes (sRGB hex)
export const PAL = {
  chairRed: 0xb02a22, chairBlue: 0x2a4a8a, chairGreen: 0x3a7a4a, chairWhite: 0xd8d2c4, chairPink: 0xd06a7a,
  sodaRed: 0xb0101a, sodaGreen: 0x2a8a3a, sodaOrange: 0xe0601a,
  jasmine: 0xf2efe0, marigold: 0xf09a1a, rose: 0xb0122a, leafGreen: 0x3a6a2a,
  gold: 0xd8a848, red: 0x9a1a14, black: 0x141414, white: 0xe8e4dc,
};

/**
 * Cushion of moss sitting on a flat top (reference 1): irregular, slightly bulging, with
 * ragged edges. Origin = centre of the surface it sits on. w x d footprint.
 */
export function mossCap(k, w, d, o = {}) {
  const seed = o.seed ?? 1;
  const nx = Math.max(3, Math.min(10, Math.round(w / 0.1))), nz = Math.max(3, Math.min(18, Math.round(d / 0.1)));
  const key = `moss:${nx}:${nz}`;
  const g = G(key, () => new THREE.PlaneGeometry(1, 1, nx, nz).rotateX(-Math.PI / 2));
  k.at(o.p, o.r, o.s, () => {
    k.add(mat('moss'), g, {
      s: [w, 1, d], color: o.color ?? 0x5a7a2e, w: { vary: 0.35, grime: 0 }, uv: 'box',
      deform: (p) => {
        // pillow: bulges up in the middle, ragged edges tucked down onto the surface
        const ux = p.x * 2, uz = p.z * 2;
        const e = noise.noise2D(p.x * 9 * w + seed, p.z * 9 * d - seed);
        const edge = Math.max(Math.abs(ux), Math.abs(uz));
        const k2 = 1 - Math.min(1, edge);
        p.y = 0.004 + (0.03 * Math.sqrt(k2) + 0.008 * e) * (edge < 0.999 ? 1 : 0);
        if (edge > 0.7) { const sh = 1 - (0.1 + 0.2 * (e * 0.5 + 0.5)) * (edge - 0.7) / 0.3; p.x *= sh; p.z *= sh; }
      },
      colorFn: (p, n, c) => { if (noise.noise3D(p.x * 14, p.y * 14, p.z * 14) > 0.35) c.multiplyScalar(1.25); },
    });
  });
}

// ---------------------------------------------------------------------------
// Bottles, cans, cups, plates
// ---------------------------------------------------------------------------
const BOTTLE_PROFILES = {
  soda: [[0, 0], [0.028, 0], [0.031, 0.008], [0.031, 0.1], [0.026, 0.14], [0.013, 0.17], [0.012, 0.2], [0.014, 0.205], [0, 0.207]],
  beer: [[0, 0], [0.03, 0], [0.033, 0.01], [0.033, 0.15], [0.02, 0.19], [0.012, 0.215], [0.012, 0.24], [0.014, 0.245], [0, 0.246]],
  whisky: [[0, 0], [0.04, 0], [0.042, 0.01], [0.042, 0.17], [0.03, 0.2], [0.014, 0.215], [0.014, 0.25], [0, 0.25]],
  oil: [[0, 0], [0.05, 0], [0.052, 0.01], [0.052, 0.18], [0.03, 0.22], [0.016, 0.24], [0.016, 0.27], [0, 0.27]],
  water: [[0, 0], [0.034, 0], [0.036, 0.01], [0.036, 0.2], [0.024, 0.24], [0.014, 0.255], [0.014, 0.27], [0, 0.27]],
  small: [[0, 0], [0.018, 0], [0.019, 0.006], [0.019, 0.07], [0.012, 0.09], [0.008, 0.1], [0.008, 0.115], [0, 0.115]],
};
export function bottle(k, o = {}) {
  const kind = o.kind || 'soda';
  const g = G('bottle:' + kind, () => lathe(BOTTLE_PROFILES[kind], 10));
  const col = o.color ?? (kind === 'soda' ? PAL.sodaRed : kind === 'beer' ? 0x3a2a10 : kind === 'whisky' ? 0x8a5a1a : kind === 'oil' ? 0xc8a020 : 0xa8c0c0);
  k.at(o.p, o.r, o.s, () => {
    k.add(mat(kind === 'oil' || kind === 'water' ? 'plastic' : 'ceramic'), g, { color: col, w: { grime: 0.3, grimeH: 0.08, vary: 0.2 } });
    // label band
    if (o.label !== false && kind !== 'small') {
      const r0 = BOTTLE_PROFILES[kind][2][0] + 0.0015;
      const ly = kind === 'soda' ? 0.04 : 0.06, lh = kind === 'soda' ? 0.055 : 0.07;
      // printed (photobashed) label wrapped round the bottle when the texture library has one
      const re = { soda: /red_soda|soda/, water: /water/, beer: /beer/, whisky: /whisky/, oil: /coffee|energy|oil/ }[kind];
      if (!labelBand(k, r0, lh, ly + lh / 2, { re, seed: Math.round((o.p?.[0] ?? 0) * 100 + (o.p?.[2] ?? 0) * 37), yaw: o.labelYaw ?? 0 })) {
        const lc = o.labelColor ?? (kind === 'soda' ? 0xe8e0d0 : kind === 'beer' ? 0xd8c070 : 0xe0d8c0);
        k.add(mat('plastic'), G('label:' + kind, () => cyl(r0, r0, 0.05, 10, 0, 1, false)), { p: [0, ly, 0], color: lc, w: { grime: 0.2, vary: 0.25 } });
      }
    }
    // cap
    const top = BOTTLE_PROFILES[kind].at(-1)[1];
    k.add(mat('metal'), G('cap', () => cyl(0.015, 0.015, 0.012, 8, 0.002)), { p: [0, top - 0.006, 0], color: o.capColor ?? 0xc8b060 });
    if (o.straw) {
      const sp = G('straw', () => tube([V(0, 0, 0), V(0, 0.12, 0), V(0.01, 0.15, 0.0), V(0.035, 0.16, 0)], 0.0035, 4));
      k.add(mat('plastic'), sp, { p: [0, top - 0.05, 0], r: o.strawYaw ?? 0, color: o.strawColor ?? 0xe86a9a, w: false });
    }
  });
}

export function can(k, o = {}) {
  const h = o.h ?? 0.12, r = o.rad ?? 0.033;
  if (o.rust && useAsset(k, 'can_rusted', o, { fit: { h }, color: 0xffffff, w: { grime: 0.3, grimeH: h * 0.4 } })) return;
  k.at(o.p, o.r, o.s, () => {
    k.add(mat(o.rust ? 'rust' : 'metal'), G(`can:${h}:${r}`, () => cyl(r, r, h, 12, 0.004, 2)), { color: o.color ?? 0xb0a080, w: { grime: 0.3, grimeH: h * 0.4, streak: 0.4 } });
    if (o.spout) k.add(mat('metal'), G('spout', () => cyl(0.008, 0.012, 0.05, 6, 0.001)), { p: [r * 0.5, h, 0], color: 0x888070 });
  });
}

/** Square oil/engine-oil can with handle (garage shelves). */
export function oilCan(k, o = {}) {
  k.at(o.p, o.r, o.s, () => {
    k.add(mat('metal'), G('oilcan', () => bbox(0.12, 0.2, 0.07, 0.008, 0.1)), { color: o.color ?? 0x2a5a8a, w: { grime: 0.5, grimeH: 0.1, streak: 0.5 } });
    k.add(mat('plastic'), G('oilcap', () => cyl(0.015, 0.015, 0.02, 8, 0.002)), { p: [0.03, 0.2, 0], color: 0xd0c020 });
    k.add(mat('metal'), G('oilhandle', () => tube([V(-0.04, 0, 0), V(-0.03, 0.03, 0), V(0.0, 0.035, 0), V(0.01, 0, 0)], 0.006, 4)), { p: [-0.01, 0.2, 0], color: o.color ?? 0x2a5a8a });
  });
}

export function plate(k, o = {}) {
  const r = o.rad ?? 0.1;
  k.at(o.p, o.r, o.s, () => k.add(mat('ceramic'), G('plate:' + r, () => lathe([[0, 0], [r * 0.6, 0], [r * 0.65, 0.008], [r, 0.02], [r * 0.97, 0.022], [r * 0.6, 0.011], [0, 0.011]], 16)), { color: o.color ?? 0xece6d8, w: { grime: 0.1, grimeH: 0.02, vary: 0.1 } }));
}
export function bowl(k, o = {}) {
  const r = o.rad ?? 0.08;
  k.at(o.p, o.r, o.s, () => k.add(mat(o.metal ? 'galv' : 'ceramic'), G('bowl:' + r, () => lathe([[0, 0], [r * 0.45, 0], [r * 0.5, 0.008], [r * 0.85, r * 0.45], [r, r * 0.7], [r * 0.95, r * 0.7], [r * 0.8, r * 0.47], [0, r * 0.15]], 14)), { color: o.color ?? 0xece8dc, w: { grime: 0.1, grimeH: 0.03 } }));
}
export function cup(k, o = {}) {
  k.at(o.p, o.r, o.s, () => k.add(mat(o.mat || 'ceramic'), G('cup', () => lathe([[0, 0], [0.025, 0], [0.03, 0.06], [0.027, 0.06], [0.022, 0.006], [0, 0.006]], 10)), { color: o.color ?? 0xe8e2d4, w: { grime: 0.15, grimeH: 0.03 } }));
}
export function teacup(k, o = {}) {
  k.at(o.p, o.r, o.s, () => k.add(mat('ceramic'), G('teacup', () => lathe([[0, 0], [0.015, 0], [0.024, 0.03], [0.021, 0.03], [0.013, 0.004], [0, 0.004]], 10)), { color: o.color ?? 0xe8e4d0, w: false }));
}
export function glassWater(k, o = {}) {
  k.at(o.p, o.r, o.s, () => {
    k.add(mat('ceramic'), G('glassw', () => cyl(0.03, 0.025, 0.09, 10, 0.002)), { color: 0xb8c8c8, w: false });
  });
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------
/** Monobloc plastic chair (origin floor centre, front +Z). */
export function plasticChair(k, o = {}) {
  const color = o.color ?? PAL.chairRed;
  const dusty = { grime: 0.35, grimeH: 0.25, dust: o.dust ?? 0.5, vary: 0.12 };
  if (useAsset(k, 'plastic_monobloc_chair_01', o, { fit: { h: 0.86 }, color, w: dusty })) return;
  k.at(o.p, o.r, o.s, () => {
    const m = mat('plastic');
    // dished seat with a rolled front edge
    k.add(m, G('chairSeat2', () => bevelBox(0.46, 0.035, 0.44, 0.016, [0.04, 0.05, 0.04], 2)), {
      p: [0, 0.43, 0.02], color, w: dusty,
      deform: (p) => { const u = p.x / 0.23, v = p.z / 0.22; p.y -= 0.018 * (1 - u * u) * (1 - v * v); if (p.z > 0.18) p.y -= (p.z - 0.18) * 0.5; },
    });
    // four splayed channel legs
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.add(m, G('chairLeg2', () => bbox(0.045, 0.45, 0.035, 0.012, [0.05, 0.08, 0.05])), {
        p: [sx * 0.205, 0, sz * 0.19], r: [sz * -0.07, 0, sx * 0.07], color, w: dusty,
        deform: (p) => { const t = p.y / 0.45; p.x *= 1 - 0.25 * (1 - t); p.z *= 1 - 0.25 * (1 - t); },
      });
    }
    // solid curved backrest with horizontal slots
    k.add(m, G('chairBack2', () => bevelBox(0.44, 0.4, 0.024, 0.012, [0.025, 0.025, 0.05], 2)), {
      p: [0, 0.68, -0.235], r: [-0.22, 0, 0], color, w: dusty,
      deform: (p) => { p.z += (p.x * p.x) * 0.55; if (p.y > 0.17) p.y += Math.cos(p.x * 6) * 0.02; },
      colorFn: (p, n, c, lp) => {
        const sl = Math.abs(lp.y - 0.04) < 0.13 && Math.abs(lp.x) < 0.15 && Math.abs(Math.sin((lp.y - 0.04) * Math.PI / 0.065)) < 0.45;
        if (sl) c.multiplyScalar(0.12);
      },
    });
    // rear legs continue up into the back frame
    for (const sx of [-1, 1]) k.add(m, G('chairPost2', () => bbox(0.04, 0.42, 0.03, 0.012, [0.05, 0.08, 0.05])), { p: [sx * 0.215, 0.45, -0.205], r: [-0.22, 0, 0], color, w: dusty });
    // curved armrests
    for (const sx of [-1, 1]) {
      k.add(m, G('chairArm2', () => tube(smoothPath([V(0, 0.18, -0.2), V(0, 0.2, -0.05), V(0, 0.19, 0.12), V(0, 0.0, 0.2)], 10), 0.017, 5)), { p: [sx * 0.235, 0.44, 0.0], color, w: dusty });
    }
  });
}

/** Squat Thai plastic stool (frustum shell with four leg cut-outs). */
export function plasticStool(k, o = {}) {
  const color = o.color ?? PAL.chairRed;
  k.at(o.p, o.r, o.s, () => {
    const g = G('stoolShell', () => {
      const prof = [[0.0, 0.39], [0.155, 0.39]];
      for (let i = 1; i < 12; i++) { const t = i / 12; prof.push([0.155 + 0.035 * t, 0.39 * (1 - t)]); }
      prof.push([0.19, 0.0], [0.205, 0.0], [0.2, 0.02]);
      for (let i = 1; i < 12; i++) { const t = i / 12; prof.push([0.2 - 0.035 * t, 0.02 + 0.38 * t]); }
      prof.push([0.165, 0.4], [0.15, 0.415], [0.14, 0.43], [0.0, 0.43]);
      return lathe(prof, 40);
    });
    k.add(mat('plastic'), g, {
      color, w: { dust: 0.35, grime: 0.35, grimeH: 0.2, vary: 0.15 },
      colorFn: (p, n, c, lp) => {
        // four tall arch-shaped cut-outs between the legs read as dark openings
        const a = Math.atan2(lp.z, lp.x);
        const u = Math.abs(Math.sin(a * 2));
        if (lp.y > 0.05 && lp.y < 0.3 && u > 0.55 + (lp.y < 0.12 ? 0 : (lp.y - 0.12) * 1.2)) c.multiplyScalar(0.08);
        // ring of little holes in the seat
        const rr = Math.hypot(lp.x, lp.z);
        if (lp.y > 0.42 && rr < 0.06 && Math.sin(a * 6) > 0.3) c.multiplyScalar(0.3);
      },
    });
  });
}

/** Folding table: steel legs + laminated top. */
export function foldTable(k, o = {}) {
  const w = o.w ?? 0.9, d = o.d ?? 0.6, h = o.h ?? 0.72;
  k.at(o.p, o.r, o.s, () => {
    k.add(mat(o.top === 'steel' ? 'galv' : 'plastic'), G(`tabletop:${w}:${d}`, () => bbox(w, 0.025, d, 0.006, 0.2)), { p: [0, h - 0.025, 0], color: o.color ?? 0xd8c8a8, w: { dust: 0.25, grime: 0.1 } });
    k.add(mat('galv'), G(`tableapron:${w}`, () => bbox(w - 0.06, 0.04, 0.02, 0.004, 0.3)), { p: [0, h - 0.065, d / 2 - 0.04], color: 0x9a9a90 });
    k.add(mat('galv'), G(`tableapron:${w}`, () => bbox(w - 0.06, 0.04, 0.02, 0.004, 0.3)), { p: [0, h - 0.065, -d / 2 + 0.04], color: 0x9a9a90 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(mat('galv'), G(`tleg:${h}`, () => cyl(0.013, 0.013, h - 0.03, 6, 0.002)), { p: [sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05)], color: 0x8a8a84, w: { grime: 0.6, grimeH: 0.2, streak: 0.3 } });
  });
}

/** Steel shelving unit (w x d x h) with n shelves; returns shelf heights. */
export function shelfUnit(k, o = {}) {
  const w = o.w ?? 1.2, d = o.d ?? 0.4, h = o.h ?? 1.9, n = o.n ?? 5;
  const ys = [];
  k.at(o.p, o.r, o.s, () => {
    const c = o.color ?? 0x5a6a6a;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(mat('metal'), G(`shpost:${h}`, () => bbox(0.035, h, 0.035, 0.004, 0.3)), { p: [sx * (w / 2 - 0.018), 0, sz * (d / 2 - 0.018)], color: c, w: { grime: 0.5, streak: 0.5 } });
    for (let i = 0; i < n; i++) {
      const y = 0.12 + (i / (n - 1)) * (h - 0.2);
      ys.push(y + 0.02);
      k.add(mat('metal'), G(`shelf:${w}:${d}`, () => bbox(w, 0.02, d, 0.004, 0.25)), { p: [0, y, 0], color: c, w: { dust: 0.5, grime: 0.15, streak: 0.3 } });
    }
  });
  return ys;
}

// ---------------------------------------------------------------------------
// Offerings
// ---------------------------------------------------------------------------
/**
 * Jasmine garland (พวงมาลัย): a drooping loop densely packed with photobashed jasmine-bud cards
 * (cross-carded around a thread core), bands of the accent flower (marigold / rose / crown flower),
 * and a pendant of a rose head with satin ribbon tails. Dark (dried) colours use the wilted cards.
 */
export function garland(k, o = {}) {
  const L = o.len ?? 0.22;
  const color = o.color ?? PAL.jasmine;
  const wilted = isWiltedColor(color);
  const accent = flowerForColor(o.accent ?? PAL.marigold, 'garland');
  const rng = makeRng(Math.round(L * 1000) + (o.seed ?? 7));
  k.at(o.p, o.r, o.s, () => {
    const pts = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const a = t * Math.PI;
      pts.push(V(Math.cos(a) * 0.04, -Math.sin(a) * L, 0));
    }
    // thread core (hidden under the buds, keeps the silhouette continuous)
    k.add(mat('flower'), G('garlandcore:' + L, () => tube(pts, 0.0075, 5)), { color: wilted ? 0x5a4a34 : 0xd8d6c0, w: false });
    const path = smoothPath(pts, 64);
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
      const p0 = path[i - 1], p1 = path[i];
      acc += p0.distanceTo(p1);
      if (acc < 0.011) continue;
      acc = 0;
      const t = i / (path.length - 1);
      const tan = p1.clone().sub(p0).normalize();
      // outward direction around the cord, rotating so buds cover every side
      const side = new THREE.Vector3(0, 0, 1).applyAxisAngle(tan, i * 2.4 + rng() * 0.6);
      const band = Math.abs(t - 0.5) < 0.06 || Math.abs(t - 0.2) < 0.03 || Math.abs(t - 0.8) < 0.03;
      const name = band ? accent.name : 'jasmine_bud';
      flowerHead(k, name, {
        p: p1.clone().addScaledVector(side, 0.004), dir: side, size: band ? 0.034 : 0.03, wilted, sides: 1,
        spin: rng() * 6, tint: band ? accent.tint : 0xffffff, shade: 0.85 + rng() * 0.25,
      });
    }
    // pendant: rose head + satin tails
    const rose = isWiltedColor(o.rose ?? PAL.rose) ? 'rose_red' : flowerForColor(o.rose ?? PAL.rose).name;
    flowerHead(k, rose, { p: [0, -L - 0.018, 0.004], dir: [0, -0.3, 1], size: 0.045, wilted: wilted || isWiltedColor(o.rose ?? PAL.rose) });
    flowerHead(k, 'leaves', { p: [0, -L - 0.03, -0.004], dir: [0, 0, 1], size: 0.05, sides: 1, wilted });
    for (const sx of [-1, 1]) {
      ribbonTail(k, { p: [sx * 0.008, -L - 0.03, 0.002], len: 0.1, color: o.ribbon ?? 0x2a7a3a, yaw: sx * 0.3, swing: sx * 0.12 });
    }
  });
}
const _cmari = new THREE.Color();

/** A string of marigolds/jasmine draped along points (Vector3[] in kit space): cross-carded heads on a cord. */
export function flowerString(k, pts, o = {}) {
  const path = smoothPath(pts, Math.max(8, pts.length * 6));
  const color = o.color ?? PAL.marigold;
  const wilted = isWiltedColor(color);
  const main = wilted ? { name: 'marigold', tint: 0xffffff } : flowerForColor(color, 'string');
  const acc = o.accent != null ? flowerForColor(o.accent, 'string') : null;
  const rad = o.rad ?? 0.016;
  k.add(mat('flower'), tube(path, rad * 0.35, 4), { color: wilted ? 0x4a3a24 : 0x3a4a22, w: false });
  const dense = smoothPath(pts, Math.max(16, pts.length * 24));
  let d = 0;
  let n = 0;
  for (let i = 1; i < dense.length; i++) {
    const p0 = dense[i - 1], p1 = dense[i];
    d += p0.distanceTo(p1);
    if (d < rad * 1.25) continue;
    d = 0;
    n++;
    const tan = p1.clone().sub(p0).normalize();
    const side = new THREE.Vector3(0, 0, 1).applyAxisAngle(tan, n * 2.2);
    const pick = acc && noise.noise3D(p1.x * 40, p1.y * 40, p1.z * 40) > 0.35 ? acc : main;
    flowerHead(k, pick.name, { p: p1, dir: side, size: rad * 2.6, wilted, sides: 1, spin: n * 1.3, tint: pick.tint, shade: 0.85 + 0.2 * Math.abs(Math.sin(n * 7.1)) });
  }
}

/** Candle (pillar). o.flame -> emissive flame (glow 'candle'), o.color red/white. */
export function candle(k, o = {}) {
  const h = o.h ?? 0.12, r = o.rad ?? 0.014;
  k.at(o.p, o.r, o.s, () => {
    k.add(mat('ceramic'), G(`candle:${h}:${r}`, () => cyl(r * 0.9, r, h, 8, 0.002, 2)), { color: o.color ?? 0xe8dcc4, w: { grime: 0.15, grimeH: h * 0.3, vary: 0.2 }, jitter: 0.0015, jitterFreq: 60 });
    // drips
    k.add(mat('ceramic'), G(`drip:${r}`, () => sphere(r * 0.5, 5, 4).scale(0.7, 1.6, 0.7)), { p: [r * 0.8, h * 0.75, 0], color: o.color ?? 0xe8dcc4 });
    if (o.flame !== false) {
      k.add(mat('dark'), G('wick', () => cyl(0.0015, 0.0015, 0.012, 4, 0)), { p: [0, h, 0], color: 0x111111, w: false });
      k.add(glowMat('candle'), G('flame', () => lathe([[0, 0], [0.005, 0.006], [0.006, 0.014], [0.003, 0.024], [0, 0.034]], 6)), { p: [0, h + 0.006, 0], color: 0xffffff, w: false });
    }
  });
}

/** Bundle of incense sticks stuck into something at the kit origin. */
export function incenseSticks(k, o = {}) {
  const rng = makeRng(o.seed ?? 3);
  const n = o.n ?? 12, R = o.radius ?? 0.05;
  k.at(o.p, o.r, o.s, () => {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * R;
      const burnt = rng() < (o.burnt ?? 0.7);
      const h = burnt ? 0.03 + rng() * 0.09 : 0.18 + rng() * 0.12;
      const tilt = [(rng() - 0.5) * 0.25, 0, (rng() - 0.5) * 0.25];
      k.add(mat('dark'), G('stick:' + Math.round(h * 100), () => cyl(0.0016, 0.0016, Math.round(h * 100) / 100, 3, 0, 1, false)), { p: [Math.cos(a) * rr, -0.01, Math.sin(a) * rr], r: tilt, color: rng() < 0.75 ? 0xa0201a : 0xc89a3a, w: false });
      if (!burnt && rng() < (o.lit ?? 0.5)) k.add(glowMat('ember'), G('ember', () => cyl(0.0022, 0.0022, 0.01, 4, 0)), { p: [Math.cos(a) * rr + tilt[2] * -h, h - 0.012, Math.sin(a) * rr + tilt[0] * h], color: 0xffffff, w: false });
    }
  });
}

/** Incense pot (กระถางธูป) with ash and sticks. size ~ radius. */
export function incensePot(k, o = {}) {
  const r = o.rad ?? 0.08;
  k.at(o.p, o.r, o.s, () => {
    const prof = [[0, 0], [r * 0.7, 0], [r * 0.75, r * 0.12], [r * 1.0, r * 0.45], [r * 1.02, r * 0.8], [r * 0.95, r * 0.95], [r * 1.02, r * 1.0], [r * 0.9, r * 1.02], [r * 0.85, r * 0.85], [0, r * 0.85]];
    k.add(mat(o.metal ? 'bronze' : 'ceramic'), G('ipot:' + r + o.metal, () => lathe(prof, 16)), { color: o.color ?? (o.metal ? 0x7a6030 : 0x9a2a1a), w: { grime: 0.3, grimeH: r * 0.5, streak: 0.4, streakColor: 0x3a3028 } });
    k.add(mat('ash'), G('ipotAsh:' + r, () => cyl(r * 0.86, r * 0.86, 0.004, 14, 0)), { p: [0, r * 0.84, 0], color: 0xb8b0a0, w: false });
    if (o.legs) for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.add(mat(o.metal ? 'bronze' : 'ceramic'), G('ipotleg', () => sphere(0.5, 6, 4)), { p: [Math.cos(a) * r * 0.7, 0, Math.sin(a) * r * 0.7], s: [r * 0.18, r * 0.25, r * 0.18], color: o.color ?? 0x7a6030 });
    }
    incenseSticks(k, { p: [0, r * 0.84, 0], n: o.sticks ?? 18, radius: r * 0.75, seed: o.seed ?? 5, burnt: o.burnt ?? 0.7, lit: o.lit ?? 0.4 });
  });
}

/** Fruit plate: oranges / bananas / apples. */
export function fruitPlate(k, o = {}) {
  const rng = makeRng(o.seed ?? 9);
  k.at(o.p, o.r, o.s, () => {
    plate(k, { rad: 0.09, color: o.plateColor ?? 0xd8c8a0 });
    const kind = o.kind ?? 'orange';
    if (kind === 'banana') {
      for (let i = 0; i < 5; i++) {
        const g = G('banana', () => tube(smoothPath([V(0, 0, -0.07), V(0, 0.02, -0.02), V(0, 0.022, 0.03), V(0, 0.005, 0.075)], 8), (t) => 0.012 * Math.sin(Math.PI * Math.min(0.97, 0.12 + t * 0.85)) + 0.003, 5));
        k.add(mat('plastic'), g, { p: [-0.03 + i * 0.015, 0.02, 0], r: [0, (i - 2) * 0.12, 0], color: rng() < 0.3 ? 0x9aa030 : 0xd8b030, w: { grime: 0.2, grimeH: 0.03, vary: 0.25 } });
      }
    } else {
      const col = kind === 'apple' ? 0xa01a14 : 0xe07a10;
      const pos = [[0, 0.03, 0], [0.045, 0.03, 0.02], [-0.045, 0.03, 0.015], [0.01, 0.03, -0.045], [0, 0.072, 0.0]];
      for (const p of pos) k.add(mat('plastic'), G('fruit', () => sphere(0.03, 8, 6)), { p, s: [1, 0.92, 1], color: col, w: { grime: 0.1, vary: 0.2 } });
    }
  });
}

/** Zebra figurine(s). o.n zebras in a little herd. */
export function zebras(k, o = {}) {
  const rng = makeRng(o.seed ?? 21);
  const n = o.n ?? 1;
  k.at(o.p, o.r, o.s, () => {
    for (let i = 0; i < n; i++) {
      const sc = (o.size ?? 1) * (0.75 + rng() * 0.5);
      const p = n === 1 ? [0, 0, 0] : [(rng() - 0.5) * (o.spread ?? 0.4), 0, (rng() - 0.5) * (o.spread ?? 0.4) * 0.6];
      k.add(mat('ceramic'), zebraGeo(), { p, r: (o.yaw ?? 0) + (rng() - 0.5) * 0.8, s: sc, w: { grime: 0.35, grimeH: 0.08, vary: 0.1, moss: o.moss ?? 0, mossLow: o.moss ?? 0, mossH: 0.06 } });
    }
  });
}

/** Thai dancer figurines in a row. */
export function dancers(k, o = {}) {
  const n = o.n ?? 2;
  k.at(o.p, o.r, o.s, () => {
    for (let i = 0; i < n; i++) k.add(mat('ceramic'), dancerGeo(), { p: [(i - (n - 1) / 2) * (o.gap ?? 0.07), 0, 0], s: o.size ?? 1, w: { grime: 0.25, grimeH: 0.04 } });
  });
}

/** Tray (พาน) with a stacked banana-leaf baisri cone and flowers. */
export function offeringTray(k, o = {}) {
  k.at(o.p, o.r, o.s, () => {
    const tg = G('paan', () => lathe([[0, 0], [0.05, 0], [0.04, 0.03], [0.03, 0.06], [0.11, 0.075], [0.12, 0.09], [0.11, 0.09], [0, 0.085]], 16));
    k.add(mat('gold'), tg, { color: 0xe0b860, w: { grime: 0.2, grimeH: 0.05 } });
    // baisri cone: stacked leaf rings
    for (let i = 0; i < 5; i++) {
      const r = 0.075 - i * 0.013;
      k.add(mat('flower'), G('baisri:' + i, () => cyl(r * 0.85, r, 0.04, 12, 0.004, 1, true)), { p: [0, 0.09 + i * 0.035, 0], color: i % 2 ? 0x3a7a2a : 0x2a5a22, w: { vary: 0.2, grime: 0 } });
    }
    flowerHead(k, 'jasmine', { p: [0, 0.29, 0], dir: [0, 1, 0], size: 0.045 });
    flowerHead(k, 'jasmine_bud', { p: [0, 0.31, 0], dir: [0, 1, 0], size: 0.03, sides: 2 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const dir = [Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5];
      flowerHead(k, i % 2 ? 'marigold' : 'rose_red', { p: [Math.cos(a) * 0.09, 0.1, Math.sin(a) * 0.09], dir, size: 0.036, spin: a });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      flowerHead(k, 'crown_purple', { p: [Math.cos(a) * 0.055, 0.2, Math.sin(a) * 0.055], dir: [Math.cos(a), 0.4, Math.sin(a)], size: 0.026, sides: 1 });
    }
  });
}

// ---------------------------------------------------------------------------
// Lanterns / lamps
// ---------------------------------------------------------------------------
/** Red Chinese lantern (emissive body). Origin at the top hook. */
export function lantern(k, o = {}) {
  const R = o.rad ?? 0.17, H = o.h ?? 0.3;
  const glow = o.glow ?? glowMat(o.white ? 'lantern_white' : 'lantern');
  k.at(o.p, o.r, o.s, () => {
    // pumpkin-ribbed silk lantern: lathe profile with 10 lobes pushed in at the bamboo ribs
    const prof = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      prof.push([R * (0.3 + 0.7 * Math.pow(Math.sin(t * Math.PI), 0.62)), -H * 0.08 - t * H * 0.84]);
    }
    k.add(glow, G(`lantern2:${R}:${H}`, () => {
      const g = lathe(prof.slice().reverse(), 40);
      const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), z = pa.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
        const lobe = 1 - 0.07 * Math.pow(Math.abs(Math.cos(a * 5)), 6);
        pa.setXYZ(i, Math.cos(a) * r * lobe, pa.getY(i), Math.sin(a) * r * lobe);
      }
      g.computeVertexNormals();
      return g;
    }), {
      color: 0xffffff, w: false,
      colorFn: (p, n, c, lp) => {
        const a = Math.atan2(lp.z, lp.x);
        const rib = Math.pow(Math.abs(Math.cos(a * 5)), 10); // dark bamboo ribs at the lobe seams
        const t = (-lp.y - H * 0.08) / (H * 0.84); // 0 top .. 1 bottom
        const core = 0.55 + 0.45 * Math.pow(Math.sin(Math.min(1, Math.max(0, t)) * Math.PI), 1.5); // hot middle band
        c.multiplyScalar(core * (1 - 0.55 * rib));
      },
    });
    // gold trim bands near the caps
    if (!o.white) for (const ty of [0.16, 0.84]) k.add(mat('gold'), G(`ltrim:${R}:${ty}`, () => torus(R * (0.3 + 0.7 * Math.pow(Math.sin(ty * Math.PI), 0.62)) * 1.01, 0.006, 4, 32)), { p: [0, -H * 0.08 - ty * H * 0.84, 0], r: [Math.PI / 2, 0, 0], color: 0xc89a3a, w: false });
    const capc = o.white ? 0x2a2a2a : 0xc89a3a;
    k.add(mat(o.white ? 'dark' : 'gold'), G(`lcap:${R}`, () => cyl(R * 0.3, R * 0.3, H * 0.07, 12, 0.004)), { p: [0, -H * 0.1, 0], color: capc });
    k.add(mat(o.white ? 'dark' : 'gold'), G(`lcap:${R}`, () => cyl(R * 0.3, R * 0.3, H * 0.07, 12, 0.004)), { p: [0, -H * 0.97, 0], color: capc });
    // tassel
    if (o.tassel !== false) k.add(mat('cloth_static'), G(`tassel:${H}`, () => cyl(0.012, 0.03, H * 0.5, 8, 0, 1, false)), { p: [0, -H * 1.5, 0], color: o.white ? 0xe0dcd0 : 0xb81a14, w: false });
    k.add(mat('dark'), G('lhook', () => cyl(0.004, 0.004, H * 0.1, 4, 0)), { p: [0, -H * 0.1, 0], color: 0x222222 });
  });
}

/** Hanging incandescent bulb with cord; origin at ceiling attach point. */
export function hangingBulb(k, o = {}) {
  const L = o.len ?? 0.5;
  k.at(o.p, o.r, o.s, () => {
    k.add(mat('dark'), G('cord:' + L, () => cyl(0.004, 0.004, L, 4, 0)), { p: [0, -L, 0], color: 0x1a1a1a, w: false });
    k.add(mat('metal'), G('socket', () => cyl(0.018, 0.016, 0.05, 8, 0.003)), { p: [0, -L - 0.05, 0], color: 0x2a2a2a });
    k.add(o.glow ?? glowMat('bulb'), G('bulb', () => lathe([[0, 0], [0.02, 0.005], [0.032, 0.03], [0.03, 0.055], [0.014, 0.075], [0.014, 0.085], [0, 0.085]], 10)), { p: [0, -L - 0.05, 0], r: [Math.PI, 0, 0], color: 0xffffff, w: false });
  });
}

// ---------------------------------------------------------------------------
// Misc dressing
// ---------------------------------------------------------------------------
/** Car / bike tyre lying flat (o.upright -> standing). */
export function tire(k, o = {}) {
  const R = o.rad ?? 0.32, W = o.width ?? 0.19;
  const g = G(`tire:${R}:${W}`, () => {
    const prof = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      // rounded rectangular cross-section (tread outside)
      const x = Math.cos(a), y = Math.sin(a);
      const rr = R - W * 0.3 + x * W * 0.32 * (1 + 0.15 * Math.pow(Math.abs(x), 4));
      prof.push(new THREE.Vector2(Math.max(0.01, rr), y * W * 0.5));
    }
    return new THREE.LatheGeometry(prof, 22);
  });
  // old_tyre model: stands on its tread, axle along Z, 0.6 m x 0.165 m
  if (o.asset !== false && hasAsset('old_tyre')) {
    const sc = R / 0.3, hw = 0.0825 * sc * (W / 0.19 > 1.1 ? 1.15 : 1);
    const w = { grime: 0.25, dust: 0.45, vary: 0.2 };
    k.at(o.p, o.r, o.s, () => addAsset(k, 'old_tyre', o.upright ? { r: Math.PI / 2, s: sc, color: 0xb8b4ae, w } : { p: [0, hw, -R], r: [Math.PI / 2, 0, 0], s: [sc, sc, W / 0.19 > 1.1 ? sc * 1.15 : sc], color: 0xb8b4ae, w }));
    return;
  }
  k.at(o.p, o.r, o.s, () => {
    k.add(mat('rubber'), g, {
      p: o.upright ? [0, R, 0] : [0, W * 0.5, 0], r: o.upright ? [0, 0, Math.PI / 2] : null, color: 0x2a2826, w: { grime: 0.2, dust: 0.4, vary: 0.2 },
      colorFn: (p, n, c, lp) => { if (Math.abs(Math.sin(Math.atan2(lp.z, lp.x) * 40)) > 0.75) c.multiplyScalar(0.7); },
    });
  });
}

/** Oil drum (200 L) optionally rusty / blue. */
export function oilDrum(k, o = {}) {
  const dw = { grime: 0.5, grimeH: 0.3, streak: 0.5 };
  // models: Barrel_01 = worn red fuel drum, barrel_03 = blue drum (picked by the requested colour)
  const c = new THREE.Color(o.color ?? (o.rusty ? 0x7a3a1a : 0x2a4a6a));
  const blue = c.b > c.r * 1.2;
  if (useAsset(k, blue ? 'barrel_03' : 'Barrel_01', o, { fit: { h: 0.88 }, color: o.rusty ? 0xc8b8a8 : 0xe8e4dc, w: { ...dw, streak: o.rusty ? 0.8 : 0.5 } })) return;
  k.at(o.p, o.r, o.s, () => {
    k.add(mat(o.rusty ? 'rust' : 'metal'), G('drum', () => cyl(0.29, 0.29, 0.88, 18, 0.012, 6)), { color: o.color ?? 0x2a4a6a, w: { grime: 0.6, grimeH: 0.3, streak: 0.6 } });
    for (const y of [0.29, 0.59]) k.add(mat('metal'), G('drumring', () => torus(0.293, 0.009, 4, 22)), { p: [0, y, 0], r: [Math.PI / 2, 0, 0], color: o.color ?? 0x2a4a6a });
  });
}

/** Dragon water jar (โอ่งมังกร). */
export function waterJar(k, o = {}) {
  const S = o.size ?? 1;
  k.at(o.p, o.r, o.s ?? S, () => {
    const prof = [[0, 0], [0.18, 0], [0.22, 0.04], [0.33, 0.25], [0.35, 0.38], [0.3, 0.55], [0.22, 0.64], [0.2, 0.68], [0.23, 0.69], [0.21, 0.7], [0.17, 0.66], [0, 0.66]];
    k.add(mat('ceramic'), G('jar', () => lathe(prof, 20)), {
      color: 0x6a3a1c, w: { grime: 0.4, grimeH: 0.2, moss: 0.3, mossLow: o.moss ?? 0.3, mossH: 0.2, vary: 0.2 },
      colorFn: (p, n, c, lp) => {
        // dragon relief band: wavy pale yellow glaze
        const a = Math.atan2(lp.z, lp.x);
        const y = lp.y;
        const wave = 0.4 + 0.07 * Math.sin(a * 3 + Math.sin(a * 7) * 0.5);
        const d = Math.abs(y - wave);
        if (d < 0.035) c.lerp(_cmari.set(0xd8b060), (1 - d / 0.035) * 0.8);
      },
    });
    if (o.lid) k.add(mat('galv'), G('jarlid', () => cyl(0.24, 0.25, 0.02, 16, 0.005)), { p: [0, 0.7, 0], color: 0x8a8a80 });
  });
}

export function sandbag(k, o = {}) {
  k.at(o.p, o.r, o.s, () => k.add(mat('cloth_static'), G('sandbag', () => bevelBox(0.55, 0.14, 0.32, 0.06, 0.08, 2)), { p: [0, 0.07, 0], color: o.color ?? 0xb8a478, jitter: 0.012, jitterFreq: 9, w: { grime: 0.5, grimeH: 0.1, vary: 0.25, moss: 0.2 } }));
}

export function cone(k, o = {}) {
  k.at(o.p, o.r, o.s, () => {
    k.add(mat('plastic'), G('conebase', () => bbox(0.36, 0.035, 0.36, 0.02, 0.1)), { color: 0x2a2a2a, w: { grime: 0.5 } });
    k.add(mat('plastic'), G('cone', () => cyl(0.025, 0.13, 0.66, 14, 0.005, 6)), {
      p: [0, 0.035, 0], color: 0xe0501a, w: { grime: 0.5, grimeH: 0.2, vary: 0.2 },
      colorFn: (p, n, c, lp) => { if ((lp.y > 0.33 && lp.y < 0.43) || (lp.y > 0.5 && lp.y < 0.57)) c.setRGB(0.75, 0.75, 0.72); },
    });
  });
}

export function trashBag(k, o = {}) {
  if (useAsset(k, 'trashbag', o, { fit: { h: 0.46 }, color: o.color != null && o.color !== 0x1a1c1c ? new THREE.Color(o.color).lerp(new THREE.Color(1, 1, 1), 0.4) : 0xd8d8d8, w: { grime: 0.2, vary: 0.2 } })) return;
  k.at(o.p, o.r, o.s, () => {
    k.add(mat('plastic'), G('trashbag', () => sphere(0.25, 12, 9).scale(1, 0.85, 0.9).translate(0, 0.2, 0)), { color: o.color ?? 0x1a1c1c, jitter: 0.04, jitterFreq: 6, w: { grime: 0.2, vary: 0.25 } });
    k.add(mat('plastic'), G('trashneck', () => cyl(0.02, 0.05, 0.14, 8, 0.01)), { p: [0, 0.38, 0], r: [0.3, 0, 0.2], color: o.color ?? 0x1a1c1c });
  });
}

export function crate(k, o = {}) {
  // models: plastic_crate_02 (0.51 x 0.25 x 0.41, tinted), wooden_crate_01 (0.83 x 0.35 x 0.41 -> scaled to 0.5 wide)
  if (o.kind === 'plastic' && useAsset(k, 'plastic_crate_02', o, { fit: { h: 0.3 }, color: o.color ?? 0x2a6a3a, w: { grime: 0.35, grimeH: 0.15, dust: 0.4 } })) return;
  if (o.kind !== 'plastic' && useAsset(k, 'wooden_crate_01', o, { fit: { w: 0.55 }, color: o.color != null ? new THREE.Color(o.color).lerp(new THREE.Color(1, 1, 1), 0.6) : 0xffffff, w: { grime: 0.4, grimeH: 0.15, moss: 0.2 } })) return;
  k.at(o.p, o.r, o.s, () => {
    if (o.kind === 'plastic') {
      const c = o.color ?? 0x2a6a3a;
      const g = G('pcrate', () => bbox(0.46, 0.3, 0.32, 0.015, 0.06));
      k.add(mat('plastic'), g, {
        color: c, w: { grime: 0.4, grimeH: 0.15, dust: 0.4 },
        colorFn: (p, n, cc, lp) => { if (Math.abs(n.y) < 0.5 && lp.y > 0.05 && lp.y < 0.24 && Math.abs(Math.sin((lp.x + lp.z) * 40)) > 0.6) cc.multiplyScalar(0.25); },
      });
    } else {
      // wooden crate of slats
      for (let i = 0; i < 3; i++) {
        for (const sz of [-1, 1]) k.add(mat('wood'), G('cslat', () => bbox(0.5, 0.08, 0.02, 0.005, 0.2)), { p: [0, 0.02 + i * 0.11, sz * 0.17], color: o.color ?? 0xa08060 });
        for (const sx of [-1, 1]) k.add(mat('wood'), G('cslat2', () => bbox(0.02, 0.08, 0.34, 0.005, 0.2)), { p: [sx * 0.24, 0.02 + i * 0.11, 0], color: o.color ?? 0xa08060 });
      }
      k.add(mat('wood'), G('cbottom', () => bbox(0.5, 0.02, 0.36, 0.004, 0.2)), { color: 0x8a7050 });
    }
  });
}

/** Coiled cable / hose (stack of loops). o.vertical for hanging coil on a pole (axis Z). */
export function coil(k, o = {}) {
  const R = o.rad ?? 0.25, r = o.thick ?? 0.008, n = o.loops ?? 6;
  const rng = makeRng(o.seed ?? 4);
  k.at(o.p, o.r, o.s, () => {
    const pts = [];
    for (let i = 0; i <= n * 20; i++) {
      const t = i / 20;
      const a = t * Math.PI * 2;
      const rr = R * (1 + (rng() - 0.5) * 0.05 + Math.sin(t * 1.3) * 0.04);
      pts.push(V(Math.cos(a) * rr, Math.sin(a) * rr * (o.flat ? 0 : 1) + (o.flat ? t * r * 2.2 : 0), o.flat ? Math.sin(a) * rr : t * r * 1.8));
    }
    k.add(mat(o.mat || 'dark'), tube(pts, r, 4), { color: o.color ?? 0x161616, w: { grime: 0, vary: 0.1 } });
  });
}

/** Funeral wreath (พวงหรีด) on a tripod stand: ring of paper flowers with a diagonal name sash. */
export function wreath(k, o = {}) {
  const rng = makeRng(o.seed ?? 31);
  const R = o.rad ?? 0.36;
  const pal = [[0xe0b830, 0xe8e4dc], [0xe8e4dc, 0x8a5aa8], [0xd88a2a, 0xe0c040], [0xe8e4dc, 0xd84a6a]];
  const [c1, c2] = o.palette ?? pal[Math.floor(rng() * pal.length)];
  k.at(o.p, o.r, o.s, () => {
    const cy = 1.0;
    // stand
    for (const [x, z, rz, rx] of [[-0.25, 0.08, 0.18, 0.1], [0.25, 0.08, -0.18, 0.1], [0, -0.25, 0, -0.2]]) {
      k.add(mat('wood'), G('wstand', () => cyl(0.012, 0.014, 1.15, 5, 0.002)), { p: [x, 0, z], r: [rx, 0, rz], color: 0x8a6a4a, w: { grime: 0.5 } });
    }
    const fade = o.faded ?? 0.5;
    // straw/foam ring base hidden behind the flowers
    k.add(mat('flower'), G('wbase:' + R, () => torus(R * 0.92, 0.07, 6, 28)), { p: [0, cy, -0.035], color: 0x2a3a22, jitter: 0.02, jitterFreq: 30, w: false });
    // concentric rings of photobashed chrysanthemum cards (outer c1, inner c2) with leaf sprigs between
    const rings = [[R * 1.02, 30, c1, 1.25], [R * 0.82, 26, c1, 1.05], [R * 0.62, 20, c2, 0.95], [R * 0.44, 14, c2, 0.85]];
    rings.forEach(([rr, n, col, sc], ri) => {
      const pick = flowerForColor(col, 'chrys');
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ri * 0.13 + (rng() - 0.5) * 0.08;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        const wilted = rng() < fade * 0.55;
        const z = 0.012 + (ri === 1 || ri === 2 ? 0.02 : 0) + (rng() - 0.5) * 0.01;
        flowerHead(k, pick.name, {
          p: [x, cy + y, z + 0.01], dir: [(x / R) * 0.35, (y / R) * 0.35, 1], size: 0.075 * sc * (0.85 + rng() * 0.3),
          wilted, sides: 1, spin: rng() * 6, tint: pick.tint, shade: (1 - fade * 0.3) * (0.85 + rng() * 0.25),
        });
        if (rng() < 0.45) flowerCard(k, 'leaves', { view: 'front', anchor: 'center', p: [x * 1.06, cy + y * 1.06, -0.004], dir: [0, 0, 1], spin: a - Math.PI / 2 + (rng() - 0.5), size: 0.08, wilted: wilted && rng() < 0.5, shade: 0.85 });
      }
    });
    // centre: pleated satin rosette + printed name card
    k.add(mat('cloth_static'), G('wrosette:' + R, () => {
      const g = new THREE.CircleGeometry(R * 0.33, 36, 0, Math.PI * 2);
      const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), a = Math.atan2(y, x), r = Math.hypot(x, y); pa.setZ(i, Math.sin(a * 16) * 0.008 * (r / (R * 0.33)) - r * 0.08); }
      g.computeVertexNormals();
      return g;
    }), { p: [0, cy, 0.03], color: 0xe2dcd0, uv: 'keep', w: { vary: 0.2, grime: 0.3, grimeH: 0.4, ground: cy - R } });
    k.add(mat('paper'), G('wcard', () => bbox(R * 0.42, R * 0.18, 0.004, 0.002, 0.1)), { p: [0, cy - R * 0.09, 0.035], color: 0xd8c890, w: { vary: 0.3 }, colorFn: (p, nn, c, lp) => { if (nn.z > 0.5 && Math.abs(lp.y - R * 0.09) < R * 0.045 && Math.sin(lp.x * 260) > -0.2) c.set(0x7a5a20); } });
    // ribbon bow on top + two long tails hanging below with gold-printed letters
    const rib = o.ribbon ?? 0xe8e2d4;
    for (const sx of [-1, 1]) {
      k.add(mat('cloth_static'), G('wbow', () => sphere(0.05, 8, 6).scale(1.2, 0.6, 0.3)), { p: [sx * 0.05, cy + R + 0.03, 0.05], r: [0, 0, sx * 0.4], color: rib, w: { vary: 0.25 } });
      k.add(mat('cloth'), G('wtail:' + R, () => quad(0.07, R * 1.5, 1, 8).translate(0, -R * 0.75, 0)), {
        p: [sx * 0.1, cy - R * 0.55, 0.06], r: [0.05, sx * 0.15, sx * 0.08], color: rib, uv: 'keep', w: { vary: 0.25, grime: 0.3, grimeH: 0.3, ground: cy - R * 2 },
        deform: (p) => { p.z += Math.sin(p.y * 9) * 0.012; },
        colorFn: (p, nn, c, lp) => { if (Math.abs(lp.x) < 0.02 && lp.y < -0.06 && lp.y > -R * 1.35 && Math.sin(lp.y * 120) > 0.2) c.set(0xb08a30); },
      });
    }
  });
}

/** Simple sandals / shoes pair. */
export function shoes(k, o = {}) {
  k.at(o.p, o.r, o.s, () => {
    for (const sx of [-1, 1]) {
      k.add(mat('rubber'), G('shoe', () => bevelBox(0.1, 0.06, 0.27, 0.03, 0.1, 2).translate(0, 0.03, 0)), { p: [sx * 0.07, 0, sx * 0.03], r: sx * 0.15 + (o.messy ? sx * 0.6 : 0), color: o.color ?? 0x2a2a3a, w: { grime: 0.4, dust: 0.3 } });
    }
  });
}

/** Motorbike helmet (open face). o.cracked adds a crack band. Origin bottom centre. */
export function helmet(k, o = {}) {
  k.at(o.p, o.r, o.s, () => {
    const g = G('helmet', () => {
      const sp = new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
      sp.scale(1, 1.05, 1.15);
      return sp;
    });
    k.add(mat('plastic'), g, {
      p: [0, 0.02, 0], color: o.color ?? 0x7a1a18, w: { grime: 0.5, grimeH: 0.12, vary: 0.2 },
      colorFn: o.cracked ? (p, n, c, lp) => { const v = Math.abs(lp.x * 1.3 + Math.sin(lp.z * 40) * 0.01 - lp.y * 0.4 + 0.02); if (v < 0.006) c.multiplyScalar(0.15); } : null,
    });
    k.add(mat('dark'), G('helmetliner', () => torus(0.148, 0.012, 5, 18).rotateX(Math.PI / 2).scale(1, 1, 1.15)), { p: [0, 0.02 + 0.15 * Math.cos(Math.PI * 0.62) * 1.05, 0], color: 0x1a1a1a });
    k.add(mat('plastic'), G('visor', () => new THREE.SphereGeometry(0.158, 12, 4, Math.PI / 2 - 0.9, 1.8, Math.PI * 0.32, Math.PI * 0.18).scale(1, 1.05, 1.15)), { p: [0, 0.02, 0], color: 0x3a3a30, w: false });
  });
}
