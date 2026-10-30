// 2D printed matter for prop dressing: posters, packaging, labels, joss paper, receipts,
// newspapers, stickers, lottery tickets. Every print is a REAL-PHOTO printed texture from
// src/textures: signTex(kind, {variant}) with the PRINTED_CATALOGUE kinds (snack_bag, noodle_cup,
// drink_label, cigarette_pack, betel_pack, incense_box, candle_pack, poster, calendar, newspaper,
// receipt, lottery, joss_paper, sticker, ...). No procedural canvas labels.
//
// Every card is a real bent/curled/torn sheet (subdivided or torn-outline geometry, alpha-tested,
// double-sided) placed a few mm off its surface, never a flat sticker floating in the air.
import * as THREE from 'three';
import * as TX from '../../textures/index.js';
import { paintedMaterial } from '../../render/index.js';
import { makeRng, noise } from '../../core/math.js';

const cache = new Map();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// dynamic access: these exports may not exist yet in src/textures (no static import errors)
const lib = () => TX;
const decalFn = () => lib()['decal' + 'Tex'];
const decalKinds = () => lib()['DECAL' + '_KINDS'] || null;

/** All printed kinds available right now ({kind: {variants:[opts...]}}): the photo catalogue first. */
export function printKinds() {
  const out = {};
  for (const [k, e] of Object.entries(lib().PRINTED_CATALOGUE || {})) out[k] = { source: 'printed', variants: e.variants.map((v) => ({ variant: v })) };
  const sk = lib().SIGN_KINDS || {};
  for (const [k, v] of Object.entries(sk)) if (!out[k]) out[k] = { source: 'sign', variants: v.gallery || [{}] };
  const dk = decalKinds();
  if (dk && typeof decalFn() === 'function') {
    for (const [k, v] of Object.entries(dk)) {
      if (out[k]) continue;
      const vars = v?.gallery || (Array.isArray(v?.variants) ? v.variants.map((x) => (typeof x === 'object' ? x : { variant: x })) : null) || (Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? x : { variant: x })) : [{}]);
      out[k] = { source: 'decal', variants: vars.length ? vars : [{}] };
    }
  }
  return out;
}
let _kinds = null;
function kinds() {
  if (!_kinds) _kinds = printKinds();
  return _kinds;
}

/**
 * Find the first available print among candidates: [kind, variantRegex?] pairs. A regex matches
 * variant names (or the kind name when the variant is omitted). -> {kind, opts} | null
 */
export function findPrint(cands, rng = Math.random) {
  const K = kinds();
  for (const [kind, re] of cands) {
    const e = K[kind];
    if (!e) continue;
    const vars = re ? e.variants.filter((o) => re.test(String(o.variant ?? o.kind ?? ''))) : e.variants;
    if (vars.length) return { kind, opts: { ...vars[Math.floor(rng() * vars.length) % vars.length] } };
  }
  return null;
}

/** All variants of a kind (opts objects), [] if the kind doesn't exist. */
export function printVariants(kind) {
  return kinds()[kind]?.variants || [];
}

/** Texture for a printed kind (decalTex first when it exists, then signTex), or null. */
export function printTex(kind, opts = {}) {
  const K = kinds();
  const e = K[kind];
  try {
    if (e?.source === 'printed') return lib().signTex(kind, { variant: opts.variant ?? e.variants[0].variant });
    if (e?.source === 'decal') return decalFn()(kind, opts);
    if (e) return lib().signTex(kind, opts);
  } catch (err) {
    /* fall through */
  }
  return null;
}

/** Shared material for a printed kind (double-sided card, alpha-tested when the print has alpha). */
export function printMat(kind, opts = {}, extra = {}) {
  const ck = kind + ':' + JSON.stringify(opts) + JSON.stringify(extra);
  if (cache.has(ck)) return cache.get(ck);
  const t = printTex(kind, opts);
  if (!t) {
    cache.set(ck, null);
    return null;
  }
  const m = paintedMaterial({
    color: 0xffffff, map: t, vertexColors: true, roughness: extra.roughness ?? 0.82, metalness: extra.metalness ?? 0, brush: 0.15,
    alphaTest: t.userData?.alpha || extra.alpha ? 0.5 : 0, side: THREE.DoubleSide, name: 'props_print_' + kind,
  });
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -2;
  m.userData.uvMode = 'keep';
  m.userData.shadows = false;
  m.userData.print = t.userData || {};
  cache.set(ck, m);
  return m;
}

function sizeOf(m, o) {
  const u = m.userData.print || {};
  const sz = u.size || [0.4, 0.4 / (u.aspect || 1)];
  const asp = u.aspect || sz[0] / sz[1];
  let w = o.w, h = o.h;
  if (w && !h) h = w / asp;
  else if (h && !w) w = h * asp;
  else if (!w && !h) [w, h] = [sz[0] * (o.scale ?? 1), sz[1] * (o.scale ?? 1)];
  return [w, h];
}

/** Torn sheet outline (w x h, centred) with ragged edges; uv = 0..1 over the full rectangle. */
function tornGeo(w, h, seed, tear = 0.12) {
  const rng = makeRng(seed * 977 + 31);
  const depth = [0, 1, 2, 3].map(() => (rng() < 0.45 ? rng() * tear : rng() * 0.015));
  const cut = rng() < 0.5 ? Math.floor(rng() * 4) : -1; // a torn-away corner
  const pts = [];
  const C = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  for (let s = 0; s < 4; s++) {
    const [ax, ay] = C[s], [bx, by] = C[(s + 1) % 4];
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(4, Math.round(len / 0.025));
    const nx = -(by - ay) / len, ny = (bx - ax) / len; // inward normal (CCW outline)
    for (let i = 0; i < n; i++) {
      const t = i / n;
      let d = depth[s] * Math.min(w, h) * (0.4 + 0.6 * Math.abs(noise.noise2D(seed * 3.1 + s * 7, t * 6))) + rng() * 0.004;
      if (s === cut && t > 0.55) d += (t - 0.55) * Math.min(w, h) * 0.9 * (0.8 + rng() * 0.4);
      if ((s + 3) % 4 === cut && t < 0.45) d += (0.45 - t) * Math.min(w, h) * 0.9 * (0.8 + rng() * 0.4);
      pts.push(new THREE.Vector2(ax + (bx - ax) * t + nx * d, ay + (by - ay) * t + ny * d));
    }
  }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
  const pa = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pa.count; i++) uv.setXY(i, pa.getX(i) / w + 0.5, pa.getY(i) / h + 0.5);
  return g;
}

/**
 * Add one printed card to kit k. kind/opts select the print; o: {p, r (euler/yaw), w|h|scale,
 * curl (bottom-corner lift, m), bend (cylindrical bow, m), sag, torn (0..1), seed, color,
 * crumple (m, for litter), fold (newspaper tent fold)}. Returns false when the print is missing.
 * The card faces +Z at the given transform; place it 3-6 mm in front of its surface.
 */
export function card(k, kind, opts, o = {}) {
  const m = printMat(kind, opts);
  if (!m) return false;
  const [w, h] = sizeOf(m, o);
  const seed = o.seed ?? 1;
  const geo = o.torn ? tornGeo(w, h, seed, 0.1 + o.torn * 0.2) : new THREE.PlaneGeometry(w, h, Math.max(2, Math.round(w / 0.04)), Math.max(2, Math.round(h / 0.04)));
  const curl = o.curl ?? 0, bend = o.bend ?? 0, crumple = o.crumple ?? 0, fold = o.fold ?? 0;
  const cs = seed % 2 ? 1 : -1;
  k.add(m, geo, {
    p: o.p, r: o.r, color: o.color ?? 0xffffff, uv: 'keep', w: o.wt !== undefined ? o.wt : { vary: 0.22, grime: 0.12, grimeH: 0.15, ground: -10 },
    deform: (p) => {
      const u = p.x / (w / 2), v = p.y / (h / 2);
      // curled bottom corner (glue failed) + gentle overall bow
      if (curl) p.z += curl * Math.pow(Math.max(0, -v * 0.5 + 0.5), 2.2) * Math.pow(Math.max(0, cs * u * 0.5 + 0.5), 1.6);
      if (bend) p.z += bend * (1 - u * u);
      if (o.sag) p.z += o.sag * Math.max(0, -v) * Math.max(0, -v);
      if (fold) p.z += Math.abs(p.x) * fold;
      if (crumple) p.z += noise.noise2D(p.x * 40 + seed, p.y * 40 - seed) * crumple + noise.noise2D(p.x * 90, p.y * 90 + seed) * crumple * 0.4;
    },
  });
  return true;
}

/** Layered torn posters/notices on a surface (local +Z out). o {p, r, w=0.5, n=3, seed, kinds} */
export function posterStack(k, o = {}) {
  const rng = makeRng((o.seed ?? 1) * 131 + 7);
  const n = o.n ?? 3;
  const pool = o.kinds || [['poster'], ['poster'], ['poster', /missing/], ['calendar']];
  k.at(o.p, o.r, null, () => {
    for (let i = 0; i < n; i++) {
      const pick = i === n - 1 && o.top ? o.top : findPrint([pool[Math.floor(rng() * pool.length)], ['poster']], rng);
      if (!pick) continue;
      const w = (o.w ?? 0.45) * (0.75 + rng() * 0.35);
      card(k, pick.kind, pick.opts, {
        p: [(rng() - 0.5) * (o.spread ?? 0.12), (rng() - 0.5) * (o.spread ?? 0.12) * 1.4, 0.003 + i * 0.0025],
        r: [0, 0, (rng() - 0.5) * 0.12], w, torn: i < n - 1 ? 0.6 + rng() * 0.4 : rng() * 0.4, curl: rng() < 0.6 ? 0.015 + rng() * 0.03 : 0, seed: (o.seed ?? 1) * 17 + i,
        wt: { vary: 0.3, grime: 0.25, grimeH: 0.2, ground: -1, streak: 0.3 },
      });
    }
  });
}

/**
 * Litter on the ground (wrappers, receipts, newspaper pages, lottery tickets, napkins) around
 * (cx, cz) within radius; y = ground height. o {n, seed, y}
 */
export function litter(k, cx, cz, radius, o = {}) {
  const rng = makeRng((o.seed ?? 1) * 59 + 3);
  const y = o.y ?? 0;
  const n = o.n ?? 8;
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * radius;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const t = rng();
    const pick = t < 0.35 ? findPrint([['snack_bag']], rng)
      : t < 0.6 ? findPrint([['receipt'], ['lottery']], rng)
        : t < 0.8 ? findPrint([['newspaper']], rng)
          : findPrint([['lottery'], ['receipt'], ['drink_label']], rng);
    if (!pick) continue;
    const news = /newspaper/.test(pick.kind);
    const wrap = /wrapper|snack/.test(pick.kind);
    card(k, pick.kind, pick.opts, {
      p: [x, y + 0.004 + (wrap ? 0.012 : 0), z], r: [-Math.PI / 2 + (rng() - 0.5) * 0.1, 0, rng() * Math.PI * 2, 'XYZ'],
      scale: news ? 0.9 : 1, crumple: wrap ? 0.012 : news ? 0.004 : 0.002, fold: news ? 0.12 : 0, curl: news ? 0 : 0.01, seed: (o.seed ?? 1) * 31 + i,
      wt: { grime: 0.5, grimeH: 0.3, ground: y - 0.5, vary: 0.3, moss: 0 },
    });
  }
}

// ---------------------------------------------------------------------------
// Packaging (3D items carrying printed textures)
// ---------------------------------------------------------------------------
const _pillow = new Map();
function pillowGeo(w, h, puff) {
  const key = `${w.toFixed(3)}:${h.toFixed(3)}:${puff}`;
  if (_pillow.has(key)) return _pillow.get(key);
  const mk = (side) => {
    const g = new THREE.PlaneGeometry(w, h, 6, 8);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const u = pa.getX(i) / (w / 2), v = pa.getY(i) / (h / 2);
      const crimp = Math.abs(v) > 0.86 ? 0.1 : 1; // crimped seal strips top + bottom
      pa.setZ(i, side * puff * (1 - Math.pow(Math.abs(u), 3)) * (1 - Math.pow(Math.abs(v), 4)) * crimp);
    }
    if (side < 0) {
      // back panel bulges to -Z: flip the winding so it faces outward
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
    }
    g.computeVertexNormals();
    return g;
  };
  const f = mk(1), b = mk(-1);
  _pillow.set(key, [f, b]);
  return [f, b];
}

/** Pillow-pack snack bag (chips/candy/biscuit) standing or hanging. o {p, r, variant, scale} */
export function snackBag(k, o = {}) {
  const rng = makeRng((o.seed ?? 1) * 7 + 1);
  const pick = o.pick || findPrint([['snack_bag', o.re]], rng);
  if (!pick) return false;
  const m = printMat(pick.kind, pick.opts);
  if (!m) return false;
  const [w, h] = sizeOf(m, { w: (o.w ?? 0.15) * (o.scale ?? 1) });
  const [f, b] = pillowGeo(w, h, Math.min(w, h) * 0.22);
  k.at(o.p, o.r, null, () => {
    k.add(m, f, { p: [0, h / 2, 0], color: 0xffffff, uv: 'keep', w: { vary: 0.15, grime: 0.1 } });
    k.add(m, b, { p: [0, h / 2, 0], color: 0xd8d8d8, uv: 'keep', w: { vary: 0.15, grime: 0.1 } });
  });
  return true;
}

/** Instant-noodle cup with its printed wrap + foil lid. o {p, r, s} */
export function noodleCup(k, o = {}) {
  const pick = findPrint([['noodle_cup']], makeRng(o.seed ?? 3));
  const m = pick && printMat(pick.kind, pick.opts);
  if (!m) return false;
  const geo = (() => {
    const key = 'ncup';
    if (_pillow.has(key)) return _pillow.get(key);
    const g = new THREE.CylinderGeometry(0.048, 0.036, 0.1, 20, 1, true);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 2); // wrap the print twice around
    m.map.wrapS = THREE.RepeatWrapping;
    m.map.needsUpdate = true;
    g.translate(0, 0.05, 0);
    _pillow.set(key, g);
    return g;
  })();
  k.at(o.p, o.r, o.s, () => {
    k.add(m, geo, { color: 0xffffff, uv: 'keep', w: { vary: 0.15, grime: 0.15, grimeH: 0.03 } });
    k.add(m, G0('ncupBottom', () => new THREE.CircleGeometry(0.036, 16).rotateX(Math.PI / 2)), { p: [0, 0.001, 0], color: 0xd8d0c0, uv: 'keep', w: false });
    k.add(m, G0('ncupLid', () => new THREE.CircleGeometry(0.05, 16).rotateX(-Math.PI / 2)), { p: [0, 0.101, 0], r: [0.04, 0, 0.03], color: 0xd8d8d0, uv: 'keep', w: false });
  });
  return true;
}
const _g0 = new Map();
function G0(key, fn) {
  if (!_g0.has(key)) _g0.set(key, fn());
  return _g0.get(key);
}

/** Printed label band wrapped round a bottle (radius r, height h, centre y). Returns false if no labels. */
export function labelBand(k, r, h, y, o = {}) {
  const pick = o.pick || findPrint([['drink_label', o.re]], makeRng(o.seed ?? 5));
  const m = pick && printMat(pick.kind, pick.opts);
  if (!m) return false;
  k.add(m, G0(`lband:${r.toFixed(4)}:${h}`, () => new THREE.CylinderGeometry(r, r, h, 14, 1, true)), { p: [0, y, 0], r: o.yaw ?? 0, color: 0xffffff, uv: 'keep', w: { vary: 0.2, grime: 0.2 } });
  return true;
}

/** Stack of joss paper (gold-foil squares) + a few loose fanned sheets. o {p, r, n, seed, loose} */
export function jossPaper(k, o = {}) {
  const rng = makeRng((o.seed ?? 1) * 41 + 9);
  const pick = findPrint([['joss_paper']], rng);
  if (!pick) return false;
  const m = printMat(pick.kind, pick.opts);
  const [w, h] = sizeOf(m, { w: 0.12 });
  k.at(o.p, o.r, null, () => {
    const n = o.n ?? 6;
    for (let i = 0; i < n; i++) card(k, pick.kind, pick.opts, { p: [(rng() - 0.5) * 0.01, 0.002 + i * 0.0025, (rng() - 0.5) * 0.01], r: [-Math.PI / 2, 0, (rng() - 0.5) * 0.15, 'XYZ'], w, seed: i, bend: 0.002, wt: false });
    for (let i = 0; i < (o.loose ?? 3); i++) card(k, pick.kind, pick.opts, { p: [(rng() - 0.5) * 0.3, 0.003 + n * 0.0025, (rng() - 0.5) * 0.2], r: [-Math.PI / 2 + (rng() - 0.5) * 0.2, 0, rng() * 6, 'XYZ'], w: w * (0.9 + rng() * 0.2), seed: 20 + i, curl: 0.01, crumple: 0.002, wt: { grime: 0.3, vary: 0.3, ground: -1 } });
  });
  return true;
}

/** The missing-child poster (photo catalogue). */
export function missingPoster() {
  return findPrint([['poster', /missing/]]) || { kind: 'poster', opts: { variant: 'missing' } };
}

/**
 * A printed box (cigarette / betel / incense / candle pack): card body with the photo print on its
 * faces. o {p, r, d (thickness, m), w|h|scale, seed, variant regex re}
 */
export function printedPack(k, kind, o = {}) {
  const pick = findPrint([[kind, o.re]], makeRng((o.seed ?? 1) * 13 + 5));
  const m = pick && printMat(pick.kind, pick.opts);
  if (!m) return false;
  const [w, h] = sizeOf(m, o);
  const d = o.d ?? Math.min(w, h) * 0.3;
  const key = `pack:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}`;
  const g = G0(key, () => {
    // printed front + back; the edges carry a thin strip of the print (folded card)
    const geo = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
    const uv = geo.attributes.uv, nr = geo.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(nr.getZ(i)) > 0.5) continue; // front / back: whole print
      // sides / top / bottom: the print's edge band (no stretched artwork)
      const u = uv.getX(i), v = uv.getY(i);
      if (Math.abs(nr.getX(i)) > 0.5) uv.setXY(i, nr.getX(i) > 0 ? 0.97 + u * 0.02 : 0.01 + u * 0.02, v);
      else uv.setXY(i, u, nr.getY(i) > 0 ? 0.97 + v * 0.02 : 0.01 + v * 0.02);
    }
    return geo;
  });
  k.add(m, g, { p: o.p, r: o.r, color: 0xffffff, uv: 'keep', w: o.wt ?? { vary: 0.15, grime: 0.12, grimeH: 0.05 } });
  return true;
}
