// Roadside set pieces: noodle stall, bridge, guardrail, sign posts, convex traffic mirror,
// accident memorial, ghost (mist) gate, village stop.
import * as THREE from 'three';
import { Kit, bevelBox, bbox, lathe, cyl, tube, torus, sphere, quad, extrude, sweep, smoothPath, sagCurve, blob, makeRng, noise } from './lib/kit.js';
import { mat, glowMat, signMat, texMat, photoTex, nightEnvTex, stainTex, crackTex, noticeTex } from './lib/materials.js';
import { lightSpec } from './lib/lights.js';
import { paintedMaterial } from '../render/index.js';
import {
  G, PAL, bottle, can, cup, bowl, plate, plasticChair, plasticStool, foldTable, candle, incensePot, garland, flowerString, fruitPlate, zebras,
  dancers, wreath, shoes, helmet, hangingBulb, lantern, crate, trashBag, coil, mossCap,
} from './lib/small.js';
import { brokenScooter } from './dressing.js';
import { chineseRoof, thaiRoofTier } from './shrines.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function anchor(parent, name, x, y, z, yaw = 0) {
  const a = new THREE.Object3D();
  a.name = name;
  a.position.set(x, y, z);
  a.rotation.y = yaw;
  parent.add(a);
  return a;
}

// ===========================================================================
// Noodle stall
// ===========================================================================
function condimentCaddy(k, p, r = 0) {
  k.at(p, r, null, () => {
    k.add(mat('galv'), G('caddy', () => bbox(0.26, 0.02, 0.18, 0.004, 0.1)), { color: 0xb0b0a8, w: false });
    k.add(mat('galv'), G('caddyH', () => torus(0.05, 0.005, 3, 10, Math.PI)), { p: [0, 0.12, 0], color: 0xb0b0a8, w: false });
    k.add(mat('galv'), G('caddyP', () => cyl(0.005, 0.005, 0.12, 4, 0)), { p: [0, 0.02, 0], color: 0xb0b0a8, w: false });
    const cols = [0xb02a14, 0xe8e4d8, 0x6a3a14, 0xd8d0a0];
    let i = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.add(mat('glass_bottle'), G('cjar', () => cyl(0.032, 0.03, 0.075, 10, 0.004)), { p: [sx * 0.065, 0.02, sz * 0.045], color: cols[i], w: false });
      k.add(mat('galv'), G('cjarlid', () => cyl(0.033, 0.033, 0.01, 10, 0.002)), { p: [sx * 0.065, 0.095, sz * 0.045], color: 0xa8a8a0, w: false });
      i++;
    }
  });
}

/**
 * Night noodle stall (ก๋วยเตี๋ยวเรือ cart, tarp roof, tables, stools, hanging bulbs).
 * -> { object, vendorSpot, customerSpots, counterAnchor, lampAnchor, lampAnchors, steamAnchor,
 *      tables: Object3D[], lights, colliders }
 */
export function createNoodleStall(opts = {}) {
  const seed = opts.seed ?? 3;
  const rng = makeRng(seed * 19 + 4);
  const group = new THREE.Group();
  group.name = 'noodleStall';
  const k = new Kit(seed, { grime: 0.55, grimeH: 0.5, streak: 0.4, vary: 0.2, mossLow: 0.2 });
  const out = { object: group, customerSpots: [], tables: [], lights: [], lampAnchors: [], colliders: [] };
  // packed-dirt + old concrete pad
  k.add(mat('concrete'), bbox(6.2, 0.05, 5.0, 0.02, 0.6), { p: [0, -0.03, 0.2], color: 0x7a766c, jitter: 0.004, w: { grime: 0.2, moss: 0.3, dust: 0.3 } });
  const stm = texMat('stain_noodle', () => stainTex(seed, '30,24,16'), { transparent: true, decal: true });
  for (let i = 0; i < 3; i++) k.add(stm, G('nstain', () => quad(1.6, 1.6)), { p: [(rng() - 0.5) * 4, 0.025, (rng() - 0.5) * 3], r: [-Math.PI / 2, 0, rng() * 6], color: 0xffffff, uv: 'keep', w: false });
  // ---- the cart ----------------------------------------------------------------------
  const cz = -1.1;
  k.at([-0.4, 0, cz], 0, null, () => {
    // body: stainless counter on a wooden cabinet
    k.add(mat('wood'), bbox(1.7, 0.72, 0.72, 0.015, 0.25), { p: [0, 0.12, 0], color: 0x7a3a24, w: { grime: 0.6, grimeH: 0.4, ground: 0.12, streak: 0.4 }, colorFn: (p, n, c, lp) => { if (n.z > 0.5 && (Math.abs(lp.y - 0.36) < 0.02 || Math.abs(lp.x) < 0.01)) c.multiplyScalar(0.4); } });
    k.add(mat('galv'), bbox(1.78, 0.03, 0.78, 0.006, 0.3), { p: [0, 0.84, 0], color: 0xc0c0b8, w: { grime: 0, dust: 0.2 } });
    // painted boat-noodle sign on the front panel
    k.add(signMat('shop_sign', { th: 'ก๋วยเตี๋ยวเรือ ป้าเล็ก', en: "Auntie Lek's Boat Noodles" }), G('cartsign', () => quad(1.5, 0.42)), { p: [0, 0.45, 0.365], color: 0xe0d4b8, uv: 'keep', w: { vary: 0.25, grime: 0.2, grimeH: 0.2, ground: 0.24 } });
    // wheels (two bicycle-like + a small front castor)
    for (const sx of [-1, 1]) {
      k.add(mat('rubber'), G('cartwheel', () => torus(0.26, 0.022, 5, 22).rotateY(Math.PI / 2)), { p: [sx * 0.6, 0.27, -0.42], color: 0x1a1a1a, w: false });
      for (let i = 0; i < 8; i++) k.add(mat('galv'), G('spoke', () => cyl(0.003, 0.003, 0.5, 3, 0).translate(0, -0.25, 0)), { p: [sx * 0.6, 0.27, -0.42], r: [(i / 8) * Math.PI, 0, 0], color: 0x9a9a94, w: false });
    }
    // glass display case
    k.at([0.2, 0.87, 0.0], null, null, () => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(mat('galv'), G('casepost', () => bbox(0.02, 0.62, 0.02, 0.003, 0.2)), { p: [sx * 0.6, 0, sz * 0.3], color: 0xc8c8c0, w: false });
      k.add(mat('galv'), bbox(1.24, 0.03, 0.64, 0.004, 0.2), { p: [0, 0.62, 0], color: 0xc8c8c0, w: false });
      k.add(mat('glass'), G('caseglassF', () => quad(1.18, 0.6)), { p: [0, 0.31, 0.31], color: 0xc8d8d0, uv: 'keep', w: false });
      k.add(mat('glass'), G('caseglassS', () => quad(0.6, 0.6)), { p: [0.61, 0.31, 0], r: [0, Math.PI / 2, 0], color: 0xc8d8d0, uv: 'keep', w: false });
      k.add(mat('glass'), G('caseglassS', () => quad(0.6, 0.6)), { p: [-0.61, 0.31, 0], r: [0, Math.PI / 2, 0], color: 0xc8d8d0, uv: 'keep', w: false });
      k.add(mat('galv'), bbox(1.18, 0.015, 0.58, 0.003, 0.2), { p: [0, 0.3, 0], color: 0xb8b8b0, w: false });
      k.details(() => {
        // noodles (pale tangles), meatballs, greens, sliced pork, bean sprouts
        for (let i = 0; i < 4; i++) k.add(mat('flower'), G('noodlenest', () => sphere(0.07, 8, 6).scale(1, 0.45, 0.8)), { p: [-0.42 + i * 0.12, 0.03, 0.05], color: i % 2 ? 0xe8d890 : 0xf0ecd8, jitter: 0.012, jitterFreq: 40, w: false });
        for (let i = 0; i < 14; i++) k.add(mat('ceramic'), G('meatball', () => sphere(0.016, 6, 5)), { p: [0.1 + (rng() - 0.5) * 0.2, 0.03 + rng() * 0.02, (rng() - 0.5) * 0.25], color: 0x9a7a60, w: false });
        for (let i = 0; i < 6; i++) k.add(mat('flower'), G('greens', () => sphere(0.04, 6, 4).scale(1, 0.5, 1)), { p: [0.35 + (rng() - 0.5) * 0.15, 0.32 + 0.03, (rng() - 0.5) * 0.3], color: 0x3a7a2a, jitter: 0.012, jitterFreq: 50, w: false });
        k.add(mat('ceramic'), G('porkplate', () => bbox(0.2, 0.02, 0.14, 0.01, 0.1)), { p: [-0.25, 0.33, 0], color: 0xa83a2a, w: false });
        for (let i = 0; i < 5; i++) bowl(k, { p: [-0.45, 0.32 + i * 0.035, -0.1], rad: 0.07, color: 0xe8e2d0 });
      });
    });
    // boiling pot on the burner (right end)
    k.add(mat('metal'), G('burner', () => cyl(0.2, 0.22, 0.12, 14, 0.01)), { p: [-0.55, 0.87, 0.05], color: 0x2a2a2a, w: false });
    k.add(mat('galv'), G('noodlepot', () => cyl(0.24, 0.24, 0.42, 18, 0.01, 3)), { p: [-0.55, 0.99, 0.05], color: 0xc8c8c0, w: { grime: 0.2, grimeH: 0.15, ground: 0.99, streak: 0.4, streakColor: 0x6a5030 } });
    k.add(mat('galv'), G('potrim', () => torus(0.24, 0.012, 4, 22)), { p: [-0.55, 1.41, 0.05], r: [Math.PI / 2, 0, 0], color: 0xb8b8b0, w: false });
    k.add(mat('galv'), G('potlid', () => lathe([[0, 0.04], [0.12, 0.03], [0.24, 0.0], [0.25, -0.01]], 16)), { p: [-0.55, 1.47, -0.15], r: [-0.7, 0, 0], color: 0xb8b8b0, w: false });
    k.add(mat('ceramic'), G('broth', () => cyl(0.225, 0.225, 0.005, 18, 0)), { p: [-0.55, 1.36, 0.05], color: 0x4a2a14, w: false });
    k.add(mat('galv'), tube([V(0, 0, 0), V(0.05, 0.2, 0.05), V(0.1, 0.38, 0.1)], 0.007, 4), { p: [-0.4, 1.3, 0.1], color: 0xa8a8a0, w: false }); // ladle
    // LPG tank under the cart
    k.add(mat('metal'), G('lpg', () => cyl(0.16, 0.16, 0.55, 14, 0.06, 2)), { p: [-1.05, 0, 0.15], color: 0xb02a1a, w: { grime: 0.6, streak: 0.5 } });
    k.add(mat('dark'), tube(smoothPath([V(-1.05, 0.58, 0.15), V(-0.95, 0.75, 0.25), V(-0.75, 0.8, 0.2), V(-0.62, 0.9, 0.1)], 8), 0.008, 4), { color: 0x1a1a1a, w: false });
    // menu board hanging off the case
    k.add(signMat('noodle_menu', {}), G('menu', () => quad(0.55, 0.75)), { p: [0.95, 1.2, 0.18], r: [0, -0.5, 0.03], color: 0xd8d0b8, uv: 'keep', w: { vary: 0.3 } });
    k.add(mat('wood'), G('menuframe', () => bbox(0.6, 0.8, 0.02, 0.006, 0.2)), { p: [0.955, 0.8, 0.17], r: [0, -0.5, 0.03], color: 0x5a3a20, w: false });
    // dish rack + cooler + water bucket at the side
    k.add(mat('plastic'), G('cooler', () => bbox(0.6, 0.42, 0.4, 0.03, 0.1)), { p: [1.25, 0, -0.1], r: 0.2, color: 0x2a5a9a, w: { grime: 0.5 } });
    k.add(mat('plastic'), G('coolerlid', () => bbox(0.62, 0.06, 0.42, 0.02, 0.1)), { p: [1.25, 0.42, -0.1], r: 0.2, color: 0xe8e4dc, w: { grime: 0.2 } });
  });
  out.vendorSpot = anchor(group, 'vendor', -0.4, 0, cz - 0.75, 0);
  out.counterAnchor = anchor(group, 'counter', -0.2, 0.88, cz + 0.3);
  out.steamAnchor = anchor(group, 'steam', -0.95, 1.45, cz + 0.05);
  out.colliders.push({ x: -0.4, z: cz, hx: 0.95, hz: 0.45, yaw: 0 });
  // ---- tarp roof on bamboo/steel poles, hanging bulbs -----------------------------------------
  const tw = 5.6, td = 4.4, th = 2.45;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.add(mat('galv'), G('tarppole', () => cyl(0.025, 0.025, th + 0.1, 6, 0.003)), { p: [sx * tw / 2, 0, 0.1 + sz * td / 2], r: [sz * 0.03, 0, -sx * 0.02], color: 0x8a8a84, w: { grime: 0.6, grimeH: 0.6 } });
    out.colliders.push({ x: sx * tw / 2, z: 0.1 + sz * td / 2, r: 0.06 });
  }
  const tarp = bevelBox(tw + 0.3, 0.01, td + 0.3, 0.003, 0.25);
  k.add(mat('cloth_static'), tarp, {
    p: [0, th + 0.08, 0.1], color: 0x2a5a8a, w: { grime: 0, vary: 0.25, streak: 0 },
    deform: (p) => { const u = p.x / ((tw + 0.3) / 2), v = p.z / ((td + 0.3) / 2); p.y += 0.25 * (1 - v * v) * 0.6 - 0.12 * (1 - u * u) * (1 - v * v) + Math.sin(p.x * 3) * 0.015; },
    colorFn: (p, n, c, lp) => { if (Math.abs(lp.z) > (td + 0.3) / 2 - 0.15) c.multiplyScalar(0.8); if (noise.noise2D(lp.x * 2, lp.z * 2) > 0.5) c.lerp(_fade, 0.4); },
  });
  for (const sz of [-1, 1]) k.add(mat('galv'), bbox(tw, 0.03, 0.03, 0.004, 0.4), { p: [0, th, 0.1 + sz * td / 2], color: 0x8a8a84, w: false });
  k.add(mat('galv'), bbox(0.03, 0.03, td, 0.004, 0.4), { p: [0, th + 0.1, 0.1], color: 0x8a8a84, w: false });
  const bulbs = [[-1.6, 0.1], [0.4, -0.9], [1.6, 0.9]];
  bulbs.forEach(([x, z], i) => {
    const L = 0.45 + rng() * 0.25;
    hangingBulb(k, { p: [x, th + 0.08, z], len: L });
    const a = anchor(group, 'bulb' + i, x, th + 0.08 - L - 0.12, z);
    out.lampAnchors.push(a);
    out.lights.push(lightSpec('bulb', a, { intensity: 5 }));
  });
  // power cord running along the tarp frame
  k.add(mat('dark'), tube(smoothPath([V(-tw / 2, th - 0.05, 0.1 - td / 2), V(-1.6, th + 0.05, 0.1), V(0.4, th + 0.06, -0.9), V(1.6, th + 0.06, 0.9), V(tw / 2, th - 0.1, 0.1 + td / 2)], 30), 0.005, 3), { color: 0x151515, w: false });
  out.lampAnchor = out.lampAnchors[1];
  out.lightSpec = out.lights[1];
  // ---- tables + stools + condiments -----------------------------------------------------------
  const tables = [[-1.3, 1.0, 0.1], [1.2, 1.2, -0.15]];
  tables.forEach(([x, z, r], ti) => {
    foldTable(k, { p: [x, 0, z], r, w: 0.9, d: 0.6, h: 0.68, color: ti ? 0xd8a8a0 : 0xa8c8b8, top: 'plastic' });
    out.tables.push(anchor(group, 'table' + ti, x, 0.69, z, r));
    out.colliders.push({ x, z, hx: 0.48, hz: 0.33, yaw: r });
    k.details(() => {
      condimentCaddy(k, [x + 0.15, 0.68, z - 0.05], r);
      k.add(mat('plastic'), G('chopcup', () => cyl(0.04, 0.035, 0.12, 10, 0.004)), { p: [x - 0.2, 0.68, z - 0.12], color: 0xd0c8b0, w: false });
      for (let i = 0; i < 10; i++) k.add(mat('wood'), G('chopstick', () => cyl(0.003, 0.004, 0.22, 3, 0)), { p: [x - 0.2 + (rng() - 0.5) * 0.04, 0.7, z - 0.12 + (rng() - 0.5) * 0.04], r: [(rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3], color: 0xd8c8a0, w: false });
      k.add(mat('plastic'), G('napkins', () => bbox(0.14, 0.08, 0.1, 0.008, 0.1)), { p: [x - 0.05, 0.68, z + 0.15], r, color: 0xc84a6a, w: false });
      if (ti === 0) {
        bowl(k, { p: [x - 0.25, 0.68, z + 0.12], rad: 0.08, color: 0xe8e0d0 });
        k.add(mat('ceramic'), G('soup', () => cyl(0.07, 0.07, 0.004, 12, 0)), { p: [x - 0.25, 0.73, z + 0.12], color: 0x5a2a14, w: false });
        cup(k, { p: [x + 0.32, 0.68, z + 0.15], color: 0xc8d0d0 });
      }
    });
    const ns = 3 + (ti % 2);
    for (let i = 0; i < ns; i++) {
      const a = (i / ns) * Math.PI * 2 + 0.4 + r;
      const sx = x + Math.cos(a) * 0.62, sz = z + Math.sin(a) * 0.48;
      plasticStool(k, { p: [sx, 0, sz], color: i % 2 ? PAL.chairRed : PAL.chairBlue });
      out.customerSpots.push(anchor(group, 'cust' + ti + '_' + i, sx, 0.44, sz, Math.atan2(sx - x, sz - z)));
    }
  });
  // ---- clutter: crates, trash bag, bucket, broom, a sleeping dog's mat ----------------------------
  k.details(() => {
    crate(k, { p: [2.4, 0, -1.6], kind: 'plastic', color: 0xa82a1a, r: 0.3 });
    crate(k, { p: [2.4, 0.3, -1.6], kind: 'plastic', color: 0x2a6a3a, r: 0.1 });
    trashBag(k, { p: [-2.6, 0, -1.5], s: 0.7 });
    k.add(mat('plastic'), G('bucketN', () => lathe([[0, 0], [0.13, 0], [0.15, 0.28], [0.145, 0.28], [0.125, 0.01], [0, 0.01]], 14)), { p: [-1.75, 0, -1.4], color: 0x2a8a9a, w: { grime: 0.5 } });
    k.add(mat('cloth_static'), G('dogmat', () => bevelBox(0.7, 0.03, 0.5, 0.015, 0.1)), { p: [2.3, 0, 0.6], r: 0.3, color: 0x6a5a48, jitter: 0.01, jitterFreq: 12, w: { grime: 0.4 } });
  });
  group.add(k.build({ name: 'noodleStall', detailDistance: 40 }));
  return out;
}
const _fade = new THREE.Color(0x8aa0b0);

// ===========================================================================
// Bridge
// ===========================================================================
/**
 * Mossy old concrete bridge. Deck runs along local Z (length) and is `width` wide in X;
 * the deck top is at y=0 (the world's road surface lies on it). Place at the road centre
 * with yaw = travel yaw. opts {width=7.4, length=26, depth=3.6 (to the creek bed), seed, broken=true}
 * -> { object, colliders, deckY:0, railAnchors, nameAnchor }
 */
export function createBridge(opts = {}) {
  const seed = opts.seed ?? 4;
  const rng = makeRng(seed * 23 + 2);
  const W = opts.width ?? 7.4, L = opts.length ?? 26, Dp = opts.depth ?? 3.6;
  const group = new THREE.Group();
  group.name = 'bridge';
  const k = new Kit(seed, { grime: 0.0, moss: 0.65, mossLow: 0.0, streak: 0.7, streakColor: 0x2a2a1e, vary: 0.22 });
  const out = { object: group, colliders: [], railAnchors: [], deckY: 0 };
  // deck slab + edge beams
  k.add(mat('concrete'), bbox(W + 0.6, 0.55, L, 0.04, [0.5, 0.3, 0.6]), { p: [0, -0.6, 0], color: 0x7a766a, w: { streak: 0.9, moss: 0.3, cavity: 0.4 } });
  // kerbs / walkways
  for (const s of [-1, 1]) {
    k.add(mat('concrete'), bbox(0.6, 0.22, L, 0.03, [0.3, 0.3, 0.5]), { p: [s * (W / 2 - 0.0), -0.05, 0], color: 0x86827a, jitter: 0.004, w: { moss: 0.7, grime: 0, streak: 0.4 }, colorFn: (p, n, c, lp) => { if (n.y < 0.5 && Math.abs(lp.z % 4) < 0.04) c.multiplyScalar(0.6); } });
  }
  // railings: posts every 2 m + two rails, some broken
  const nP = Math.floor(L / 2);
  for (const s of [-1, 1]) {
    const x = s * (W / 2 + 0.12);
    for (let i = 0; i <= nP; i++) {
      const z = -L / 2 + (i * L) / nP;
      const missing = !(opts.broken === false) && rng() < 0.06 && i > 0 && i < nP;
      if (missing) {
        k.add(mat('concrete'), G('stump', () => bbox(0.2, 0.25, 0.2, 0.02, 0.1)), { p: [x, 0.17, z], color: 0x9a968a, jitter: 0.02, jitterFreq: 10 });
        continue;
      }
      const end = i === 0 || i === nP;
      k.add(mat('concrete'), G(end ? 'bpostE' : 'bpost', () => bbox(end ? 0.32 : 0.2, end ? 1.2 : 0.95, end ? 0.32 : 0.2, 0.025, 0.2)), {
        p: [x, 0.17, z], r: [(rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.04], color: 0x7a766c, jitter: 0.006, jitterFreq: 6,
        w: { ground: 0.17, grime: 0.6, grimeH: 0.5, mossLow: 0.9, mossH: 0.6, moss: 0.95, streak: 0.7 },
        colorFn: end ? (p, n, c, lp) => { if (Math.floor((lp.y + lp.x * 0.5) / 0.2) % 2 === 0) c.multiplyScalar(0.18); } : null,
      });
    }
    for (const ry of [0.55, 0.95]) {
      // rail segments (one broken & sagging)
      const brokenSeg = Math.floor(rng() * nP);
      for (let i = 0; i < nP; i++) {
        const z0 = -L / 2 + (i * L) / nP, z1 = -L / 2 + ((i + 1) * L) / nP;
        if (ry > 0.9 && i === brokenSeg && opts.broken !== false) {
          k.add(mat('concrete'), G('railhalf', () => bbox(0.12, 0.12, (z1 - z0) * 0.45, 0.02, 0.2)), { p: [x, ry - 0.06 + 0.17, z0 + (z1 - z0) * 0.25], r: [0.4, 0, 0], color: 0xa8a498, jitter: 0.01, jitterFreq: 12 });
          continue;
        }
        k.add(mat('concrete'), G('railseg:' + (z1 - z0).toFixed(2), () => bbox(0.13, 0.12, z1 - z0, 0.02, [0.2, 0.2, 0.3])), { p: [x, ry - 0.06 + 0.17, (z0 + z1) / 2], color: 0x767268, jitter: 0.005, jitterFreq: 5, w: { moss: 1.0, grime: 0, streak: 0.8, cavity: 0.4 } });
        if (ry > 0.9 && rng() < 0.55) mossCap(k, 0.15, (z1 - z0) * (0.4 + rng() * 0.5), { p: [x, ry + 0.17 + 0.06, (z0 + z1) / 2 + (rng() - 0.5) * 0.4], seed: i * 7 + s });
      }
    }
    out.colliders.push({ x, z: 0, hx: 0.15, hz: L / 2, yaw: 0 });
    out.railAnchors.push(anchor(group, 'rail' + s, x, 1.1, 0));
  }
  // moss cushions on the kerbs
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) mossCap(k, 0.45, 0.6 + rng() * 2.5, { p: [s * W / 2, 0.17, -L / 2 + rng() * L], seed: i * 3 + s * 11 });
  // name plate on the first end post
  k.add(signMat('shop_sign', { th: 'สะพานห้วยเงียบ', en: 'Huai Ngiap Bridge' }), G('bridgeplate', () => quad(0.28, 0.5)), { p: [-(W / 2 + 0.12), 0.75, L / 2 + 0.165], color: 0xc8c0a8, uv: 'keep', w: { vary: 0.3 } });
  out.nameAnchor = anchor(group, 'name', -(W / 2 + 0.12), 0.75, L / 2 + 0.2);
  // piers + abutments
  for (const z of [-L / 6, L / 6]) {
    k.add(mat('concrete'), bbox(W - 0.6, Dp, 0.7, 0.05, 0.5), { p: [0, -Dp - 0.6, z], color: 0x8a867a, w: { ground: -Dp - 0.6, mossLow: 0.9, mossH: 1.2, moss: 0.6, streak: 0.9, grime: 0.7, grimeH: 0.8 } });
    k.add(mat('concrete'), bbox(W + 0.2, 0.4, 0.9, 0.04, 0.4), { p: [0, -1.0, z], color: 0x928e82, w: { streak: 0.8 } });
  }
  for (const s of [-1, 1]) {
    k.add(mat('stone'), bbox(W + 1.6, Dp + 0.4, 1.2, 0.05, 0.5), { p: [0, -Dp - 0.6, s * (L / 2 + 0.2)], color: 0x7a766a, jitter: 0.03, jitterFreq: 2, w: { ground: -Dp - 0.6, mossLow: 0.9, mossH: 1.5, moss: 0.8 } });
  }
  // drain spouts with rust/algae streaks below
  for (let i = 0; i < 6; i++) {
    const z = -L / 2 + 2 + i * ((L - 4) / 5);
    for (const s of [-1, 1]) k.add(mat('galv'), G('spout2', () => cyl(0.04, 0.04, 0.25, 6, 0.004).rotateZ(Math.PI / 2)), { p: [s * (W / 2 + 0.3), -0.45, z], s: [s, 1, 1], color: 0x5a4a3a, w: false });
  }
  // dangling vines / roots from the deck edge (simple strands)
  for (let i = 0; i < 14; i++) {
    const s = rng() < 0.5 ? -1 : 1, z = (rng() - 0.5) * L;
    const len = 0.6 + rng() * 1.8;
    k.add(mat('flower'), tube(smoothPath([V(s * (W / 2 + 0.3), -0.35, z), V(s * (W / 2 + 0.36), -0.35 - len * 0.5, z + 0.05), V(s * (W / 2 + 0.34), -0.35 - len, z + 0.1)], 6), (t) => 0.012 * (1 - t * 0.6), 3), { color: 0x2a4a1e, w: false });
  }
  group.add(k.build({ name: 'bridge' }));
  return out;
}

// ===========================================================================
// Guardrail (W-beam)
// ===========================================================================
const WBEAM = (() => {
  const prof = [];
  // W-beam: two crests, 0.31 m tall, ~0.08 deep (front face x>0), closed thin profile
  const pts = [[0, -0.155], [0.035, -0.135], [0.07, -0.095], [0.075, -0.075], [0.045, -0.03], [0.025, 0], [0.045, 0.03], [0.075, 0.075], [0.07, 0.095], [0.035, 0.135], [0, 0.155]];
  for (const p of pts) prof.push(p);
  for (let i = pts.length - 1; i >= 0; i--) prof.push([pts[i][0] - 0.006, pts[i][1]]);
  return prof;
})();
/**
 * Guardrail along points (Vector3[], world or common space, in order).
 * opts {delineators=true, damaged=false, seed, postSpacing=4, height=0.72, faceSide=+1
 *   (+1: the beam faces the RIGHT of the polyline direction, i.e. the road is on the right),
 *   lampEvery=2 (posts per delineator lamp)}
 * -> { object, lampAnchors: Object3D[], lights, colliders (in the points' space) }
 */
export function createGuardrail(points, opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 41 + 3);
  const group = new THREE.Group();
  group.name = 'guardrail';
  const out = { object: group, lampAnchors: [], lights: [], colliders: [] };
  if (!points || points.length < 2) return out;
  const fs = opts.faceSide ?? 1;
  const H = opts.height ?? 0.72;
  const k = new Kit(seed, { grime: 0.5, grimeH: 0.4, mossLow: 0.6, mossH: 0.35, streak: 0.5, streakColor: 0x6a3a18, vary: 0.2 });
  // resample polyline every ~0.5 m
  const path = [];
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = cum[cum.length - 1];
  const at = (s, outv = new THREE.Vector3()) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    return outv.lerpVectors(points[i - 1], points[i], Math.min(1, Math.max(0, t)));
  };
  const n = Math.max(2, Math.ceil(total / 0.5));
  const dentS = opts.damaged ? total * (0.3 + rng() * 0.4) : -100;
  const side = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const sideAt = (s) => {
    const a = at(Math.max(0, s - 0.3)), b = at(Math.min(total, s + 0.3));
    tan.subVectors(b, a).normalize();
    side.set(-tan.z, 0, tan.x).multiplyScalar(-fs); // right of travel (x fs)
    return side;
  };
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * total;
    const p = at(s).clone();
    p.y += H;
    // dent: pushed back + twisted downward
    const dd = Math.abs(s - dentS);
    if (dd < 1.6) {
      const k2 = (1 - dd / 1.6) ** 2;
      p.addScaledVector(sideAt(s), -0.22 * k2);
      p.y -= 0.12 * k2;
    }
    path.push(p);
  }
  // terminal flares (fish-tail) at both ends: bend the last 0.6 m away from the road
  const flare = (idx, dir) => {
    for (let j = 0; j < 2; j++) {
      const i = dir > 0 ? j : path.length - 1 - j;
      const s = (i / n) * total;
      path[i].addScaledVector(sideAt(s), -0.12 * (2 - j));
    }
  };
  flare(0, 1);
  flare(0, -1);
  const prof = WBEAM.map(([x, y]) => [x * fs, y]);
  k.add(mat('galv'), sweep(path, prof, {}), {
    color: 0x8a8c86, w: { grime: 0.2, grimeH: 0.9, streak: 0.6, vary: 0.3 },
    colorFn: (p, nn, c) => {
      const sc = noise.noise3D(p.x * 1.5, p.y * 4, p.z * 1.5);
      if (sc > 0.35) c.lerp(_rustC, Math.min(1, (sc - 0.35) * 2.5) * 0.85); // rust patches
      const sm = noise.noise3D(p.x * 0.3, 7, p.z * 0.3);
      if (sm > 0.55) c.multiplyScalar(0.7); // road grime
    },
  });
  // posts, spacer blocks, reflectors and delineator lamps
  const spacing = opts.postSpacing ?? 4;
  const np = Math.max(1, Math.floor(total / spacing));
  const missing = opts.damaged ? 1 + Math.floor(rng() * (np - 1)) : -1;
  for (let i = 0; i <= np; i++) {
    const s = (i / np) * total;
    const b = at(s).clone();
    const sd = sideAt(s).clone();
    const yaw = Math.atan2(sd.x, sd.z);
    const off = sd.clone().multiplyScalar(-0.12);
    const bent = opts.damaged && Math.abs(s - dentS) < 1.6;
    if (i === missing) {
      k.add(mat('galv'), G('gpstump', () => bbox(0.1, 0.18, 0.1, 0.01, 0.1)), { p: [b.x + off.x, b.y, b.z + off.z], r: yaw, color: 0x8a8a80, w: { streak: 0.8 } });
      continue;
    }
    k.at([b.x + off.x, b.y, b.z + off.z], [bent ? -0.35 : (rng() - 0.5) * 0.04, yaw, (rng() - 0.5) * 0.05, 'YXZ'], null, () => {
      k.add(mat('galv'), G('gpost', () => bbox(0.1, H + 0.12, 0.15, 0.008, 0.2)), { color: 0x7a7c76, w: { grime: 0.7, grimeH: 0.5, streak: 0.8, mossLow: 0.7, mossH: 0.25 } });
      k.add(mat('wood'), G('gspacer', () => bbox(0.12, 0.32, 0.12, 0.01, 0.1)), { p: [0, H - 0.16, 0.12], color: 0x5a4a3a, w: { moss: 0.5 } });
      // delineator lamp on top (reference 4): post cap + small housing + glowing amber dome
      const lampHere = opts.delineators !== false && i % (opts.lampEvery ?? 2) === 0;
      if (lampHere) {
        k.add(mat('plastic'), G('dlhouse', () => cyl(0.045, 0.05, 0.08, 10, 0.01)), { p: [0, H + 0.12, 0.02], color: 0x2a2a2a, w: { dust: 0.4 } });
        k.add(mat('dark'), G('dlsolar', () => bbox(0.07, 0.006, 0.07, 0.002, 0.05)), { p: [0, H + 0.2, 0.02], r: [0.3, 0, 0], color: 0x1a2030, w: false });
        k.add(glowMat('amber'), G('dldome', () => new THREE.SphereGeometry(0.055, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6)), { p: [0, H + 0.2, 0.02], color: 0xffffff, w: false });
      } else {
        // reflector on the beam (amber)
        k.add(mat('plastic'), G('refl', () => bbox(0.07, 0.1, 0.012, 0.004, 0.05)), { p: [0, H - 0.02, 0.21], color: 0xe0901a, w: false });
      }
    });
    if (opts.delineators !== false && i % (opts.lampEvery ?? 2) === 0 && i !== missing) {
      const lp = V(b.x + off.x, b.y + H + 0.24, b.z + off.z);
      const a = anchor(group, 'delineator' + i, lp.x, lp.y, lp.z);
      out.lampAnchors.push(a);
      out.lights.push(lightSpec('delineator', a, { height: H + 0.24 }));
    }
    out.colliders.push({ x: b.x + off.x, z: b.z + off.z, hx: 0.08, hz: Math.min(spacing / 2, 2), yaw });
  }
  // scraped paint debris + rubble at the dent
  if (opts.damaged) {
    const p = at(dentS);
    for (let i = 0; i < 6; i++) k.add(mat('plastic'), G('shard', () => bbox(0.06, 0.006, 0.04, 0.002, 0.05)), { p: [p.x + (rng() - 0.5) * 1.2, p.y + 0.01, p.z + (rng() - 0.5) * 1.2], r: rng() * 6, color: rng() < 0.5 ? 0xd8c040 : 0x9a1a14, w: false });
  }
  group.add(k.build({ name: 'guardrail' }));
  return out;
}
const _rustC = new THREE.Color(0x7a4220);

// ===========================================================================
// Sign posts
// ===========================================================================
const SIGN_SHAPES = {
  km_marker: 'stone', curve_warning: 'diamond', elephant_crossing: 'diamond', warning_sign: 'diamond', speed_sign: 'circle',
  bus_stop_sign: 'circle', village_sign: 'wide', temple_sign: 'wide', fork_sign: 'arrow', shop_sign: 'board', garage_sign: 'board',
  shrine_board: 'board', noodle_menu: 'board', poster: 'board', calendar: 'board',
};
/**
 * Any signTex kind on a proper post/plate. kind: see SIGN_SHAPES (others -> 'board').
 * opts: passed to signTex (km, dir, th, en, kmh, side ...) + {seed, bent=auto, age=0.7}
 * -> { object, signAnchor, colliders }
 */
export function createSignPost(kind, opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 13 + kind.length);
  const group = new THREE.Group();
  group.name = 'sign_' + kind;
  const age = opts.age ?? 0.7;
  const k = new Kit(seed, { grime: 0.5 * age, grimeH: 0.5, mossLow: 0.8 * age, mossH: 0.45, streak: 0.5 * age, vary: 0.2 });
  const shape = SIGN_SHAPES[kind] || 'board';
  const texOpts = { ...opts };
  delete texOpts.seed;
  delete texOpts.bent;
  delete texOpts.age;
  const sm = signMat(kind, texOpts);
  const out = { object: group, colliders: [] };
  const bent = opts.bent ?? rng() < 0.3;
  const lean = bent ? [(rng() - 0.5) * 0.12, 0, (rng() - 0.5) * 0.12] : [(rng() - 0.5) * 0.02, 0, (rng() - 0.5) * 0.02];
  const pipe = (x, h) => {
    k.add(mat('galv'), cyl(0.03, 0.03, h, 8, 0.004, 3), { p: [x, 0, 0], r: lean, color: 0x9a9a94, w: { grime: 0.6, streak: 0.6 } });
    k.add(mat('concrete'), G('footing', () => cyl(0.1, 0.12, 0.08, 8, 0.01)), { p: [x, -0.04, 0], color: 0x8a867a, w: { mossLow: 0.9 } });
  };
  let sy = 0;
  if (shape === 'stone') {
    // Thai KM stone: rounded-top concrete post with painted face
    const sh = new THREE.Shape();
    sh.moveTo(-0.17, 0);
    sh.lineTo(0.17, 0);
    sh.lineTo(0.17, 0.62);
    sh.absarc(0, 0.62, 0.17, 0, Math.PI, false);
    sh.lineTo(-0.17, 0);
    k.add(mat('concrete'), G('kmstone', () => extrude(sh, 0.16, 0.015)), { p: [0, 0.0, 0], r: lean, color: 0xd8d4c8, w: { grime: 0.7, grimeH: 0.35, mossLow: 0.9, mossH: 0.3, streak: 0.4 }, colorFn: (p, n, c, lp) => { if (lp.y > 0.6) c.lerp(_kmTop, 0.85); } });
    k.add(sm, G('kmface', () => quad(0.3, 0.42)), { p: [0, 0.4, 0.096], r: lean, color: 0xffffff, uv: 'keep', w: { grime: 0.4, grimeH: 0.15, ground: 0.2, vary: 0.25 } });
    k.add(sm, G('kmface', () => quad(0.3, 0.42)), { p: [0, 0.4, -0.096], r: [lean[0], Math.PI, lean[2]], color: 0xffffff, uv: 'keep', w: { grime: 0.4, grimeH: 0.15, ground: 0.2, vary: 0.25 } });
    sy = 0.45;
    out.colliders.push({ x: 0, z: 0, hx: 0.18, hz: 0.1, yaw: 0 });
  } else if (shape === 'diamond' || shape === 'circle') {
    const h = 2.3;
    pipe(0, h + 0.1);
    const top = V(lean[2] * -h, h, lean[0] * h);
    sy = h - 0.4;
    k.at([top.x, sy, top.z], [lean[0], 0, lean[2] + (bent ? (rng() - 0.5) * 0.2 : 0)], null, () => {
      if (shape === 'diamond') {
        k.add(mat('metal'), G('diamondback', () => bbox(0.62, 0.62, 0.02, 0.03, 0.1).translate(0, -0.31, 0).rotateZ(Math.PI / 4)), { p: [0, 0, -0.012], color: 0x7a7a74, w: { streak: 0.6 } });
        k.add(sm, G('diamondface', () => quad(0.6, 0.6).rotateZ(Math.PI / 4)), { p: [0, 0, 0.0], color: 0xffffff, uv: 'keep', w: { vary: 0.25 }, deform: (p) => { p.z += Math.max(0, p.x * 0.6 - 0.15) * (bent ? 0.08 : 0); } });
      } else {
        k.add(mat('metal'), G('circleback', () => cyl(0.31, 0.31, 0.02, 24, 0.004).rotateX(Math.PI / 2)), { p: [0, 0, -0.012], color: 0x7a7a74, w: { streak: 0.6 } });
        k.add(sm, G('circleface', () => new THREE.CircleGeometry(0.3, 24)), { p: [0, 0, 0.0], color: 0xffffff, uv: 'keep', w: { vary: 0.25 } });
      }
      k.add(mat('galv'), G('sbracket', () => bbox(0.08, 0.05, 0.05, 0.005, 0.05)), { p: [0, 0.2, -0.04], color: 0x6a6a64 });
      k.add(mat('galv'), G('sbracket', () => bbox(0.08, 0.05, 0.05, 0.005, 0.05)), { p: [0, -0.25, -0.04], color: 0x6a6a64 });
    });
    out.colliders.push({ x: 0, z: 0, r: 0.06 });
  } else if (shape === 'wide') {
    const w = 2.1, hp = 0.95, h = 2.4;
    for (const s of [-1, 1]) {
      if (kind === 'temple_sign') k.add(mat('wood'), bbox(0.12, h, 0.12, 0.015, 0.3), { p: [s * (w / 2 - 0.15), 0, 0], color: 0x6a5440, w: { mossLow: 0.9 } });
      else pipe(s * (w / 2 - 0.15), h);
      out.colliders.push({ x: s * (w / 2 - 0.15), z: 0, r: 0.07 });
    }
    sy = h - hp / 2 - 0.05;
    k.add(mat('metal'), bbox(w, hp, 0.03, 0.01, 0.3), { p: [0, sy - hp / 2, -0.02], color: 0x6a6a64, w: { streak: 0.7 } });
    k.add(sm, G('wideface:' + w, () => quad(w - 0.04, hp - 0.04, 2, 2)), { p: [0, sy, 0.0], color: 0xffffff, uv: 'keep', w: { vary: 0.3, streak: 0.4 } });
  } else if (shape === 'arrow') {
    k.add(mat('wood'), bbox(0.11, 2.2, 0.11, 0.015, 0.3), { r: lean, color: 0x6a5440, w: { mossLow: 0.9, streak: 0.5 } });
    const dir = opts.side === 'right' ? 1 : -1;
    const sh = new THREE.Shape();
    sh.moveTo(0, -0.14); sh.lineTo(0.75, -0.14); sh.lineTo(0.92, 0); sh.lineTo(0.75, 0.14); sh.lineTo(0, 0.14); sh.closePath();
    sy = 1.8;
    k.add(mat('wood'), G('arrowb', () => extrude(sh, 0.03, 0.005)), { p: [dir * 0.05, sy, 0.07], s: [dir, 1, 1], color: 0x8a7458, w: { moss: 0.4 } });
    k.add(sm, G('arrowface2', () => quad(0.7, 0.22)), { p: [dir * 0.45, sy, 0.088], color: 0xffffff, uv: 'keep', w: { vary: 0.3 } });
    out.colliders.push({ x: 0, z: 0, r: 0.08 });
  } else {
    // board on a single post (or an A-frame stand for menus / posters)
    const w = 0.9, hb = 0.65;
    k.add(mat('wood'), bbox(0.1, 1.9, 0.1, 0.012, 0.3), { r: lean, color: 0x6a5440, w: { mossLow: 0.9 } });
    sy = 1.55;
    k.add(mat('wood'), bbox(w + 0.06, hb + 0.06, 0.03, 0.008, 0.2), { p: [0, sy - hb / 2 - 0.03, 0.05], color: 0x5a4430, w: false });
    k.add(sm, G('boardface', () => quad(w, hb)), { p: [0, sy, 0.068], color: 0xffffff, uv: 'keep', w: { vary: 0.3, streak: 0.4 } });
    out.colliders.push({ x: 0, z: 0, r: 0.08 });
  }
  group.add(k.build({ name: 'sign_' + kind }));
  out.signAnchor = anchor(group, 'sign', 0, sy, 0.1);
  return out;
}
const _kmTop = new THREE.Color(0xc0302a);

// ===========================================================================
// Convex traffic mirror
// ===========================================================================
let _mirrorMat = null;
function mirrorMaterial() {
  if (_mirrorMat) return _mirrorMat;
  _mirrorMat = paintedMaterial({ color: 0xb8c0c0, metalness: 1.0, roughness: 0.12, brush: 0.15, name: 'props_convexMirror' });
  _mirrorMat.envMap = nightEnvTex();
  _mirrorMat.envMapIntensity = 1.4;
  _mirrorMat.userData.uvMode = 'keep';
  _mirrorMat.userData.shadows = false;
  return _mirrorMat;
}
/** Orange-pole convex mirror at a blind curve. opts {seed, height=2.8, size=0.8} -> { object, mirrorAnchor, colliders } */
export function createConvexMirror(opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 7 + 9);
  const H = opts.height ?? 2.8, R = (opts.size ?? 0.8) / 2;
  const group = new THREE.Group();
  group.name = 'convexMirror';
  const k = new Kit(seed, { grime: 0.5, grimeH: 0.6, mossLow: 0.7, mossH: 0.4, streak: 0.4, vary: 0.2 });
  const lean = [(rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.04];
  k.add(mat('concrete'), G('cmfoot', () => cyl(0.14, 0.16, 0.12, 10, 0.02)), { p: [0, -0.05, 0], color: 0x8a867a, w: { mossLow: 1 } });
  k.add(mat('metal'), cyl(0.038, 0.038, H, 10, 0.004, 4), {
    r: lean, color: 0xe0601a, w: { grime: 0.6, grimeH: 0.8, streak: 0.4 },
    colorFn: (p, n, c, lp) => { if (lp.y < 0.9 && Math.floor(lp.y / 0.18) % 2 === 1) c.setRGB(0.82, 0.8, 0.76); const f = noise.noise3D(p.x * 9, p.y * 3, p.z * 9); if (f > 0.4) c.lerp(_fadeOr, 0.6); },
  });
  const top = V(-lean[2] * H, H, lean[0] * H);
  const tilt = -0.18;
  k.at([top.x, top.y, top.z + 0.12], [tilt, 0, 0], null, () => {
    // orange rim + hood + back shell
    k.add(mat('plastic'), G('cmrim', () => torus(R, 0.035, 6, 32)), { color: 0xe0601a, w: { grime: 0, vary: 0.3, dust: 0.4 } });
    k.add(mat('plastic'), G('cmback', () => new THREE.SphereGeometry(R, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI * 0.18).rotateX(Math.PI / 2)), { p: [0, 0, -0.01], color: 0xd85a18, w: { grime: 0, streak: 0.4 } });
    k.add(mat('plastic'), G('cmhood', () => new THREE.CylinderGeometry(R + 0.04, R + 0.04, 0.12, 24, 1, true, -Math.PI * 0.45, Math.PI * 0.9).rotateX(Math.PI / 2).translate(0, 0, 0.06)), { color: 0xe0601a, w: false });
    k.add(mat('galv'), G('cmclamp', () => bbox(0.1, 0.12, 0.12, 0.01, 0.1)), { p: [0, -R - 0.02, -0.08], color: 0x8a8a84 });
  });
  group.add(k.build({ name: 'convexMirror' }));
  // the mirror itself: convex cap, reflective
  const cap = new THREE.SphereGeometry(R * 2.2, 28, 10, 0, Math.PI * 2, 0, Math.asin(R / (R * 2.2)));
  cap.rotateX(Math.PI / 2);
  cap.translate(0, 0, -R * 2.2 * Math.cos(Math.asin(1 / 2.2)) + 0.012);
  const mirror = new THREE.Mesh(cap, mirrorMaterial());
  mirror.position.set(top.x, top.y, top.z + 0.12);
  mirror.rotation.x = tilt;
  mirror.name = 'convexMirrorGlass';
  group.add(mirror);
  const out = { object: group, mirrorAnchor: anchor(group, 'mirror', top.x, top.y, top.z + 0.16), mirror, colliders: [{ x: 0, z: 0, r: 0.08 }] };
  return out;
}
const _fadeOr = new THREE.Color(0xc89a70);

// ===========================================================================
// Accident memorial (โค้งร้อยศพ)
// ===========================================================================
/**
 * Roadside accident memorial: little shrine with photos, wreaths, a crashed old motorbike,
 * a cracked helmet (memory m_helmet), shoes, candles, zebras.
 * -> { object, waitSpot, helmetAnchor, helmet (Object3D: the helmet mesh group, for
 *      interaction/pick-up), candleAnchors, smokeAnchor, lights, colliders }
 */
export function createAccidentMemorial(opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 59 + 1);
  const group = new THREE.Group();
  group.name = 'accidentMemorial';
  const k = new Kit(seed, { grime: 0.5, grimeH: 0.4, mossLow: 0.6, mossH: 0.3, streak: 0.4, vary: 0.22 });
  const out = { object: group, candleAnchors: [], lights: [], colliders: [] };
  // muddy patch
  k.add(mat('soil'), G('mempatch', () => blob(1.9, 1.3, seed + 3, 22, 0.3)), { p: [0, 0.01, -0.2], color: 0x4a3c2e, w: false });
  // little shrine: a concrete stand + a box shelter with a tin roof
  k.add(mat('concrete'), bbox(0.7, 0.75, 0.45, 0.02, 0.2), { p: [0, 0, -0.6], color: 0xb0aa9c, w: { mossLow: 0.9, mossH: 0.4 } });
  k.add(mat('wood'), bbox(0.66, 0.5, 0.38, 0.01, 0.15), { p: [0, 0.75, -0.65], color: 0x7a5a3a, w: { streak: 0.5 }, colorFn: (p, n, c) => { if (n.z > 0.5) c.multiplyScalar(0.35); } });
  k.add(mat('corrugated'), bevelBox(0.82, 0.015, 0.56, 0.004, 0.1), { p: [0, 1.29, -0.62], r: [0.18, 0, 0], color: 0x8a6a50, w: { moss: 0.5 }, deform: (p) => { p.y += Math.sin(p.x * 80) * 0.006; } });
  out.colliders.push({ x: 0, z: -0.6, hx: 0.38, hz: 0.26, yaw: 0 });
  // framed photos (faded) inside + on the stand
  for (let i = 0; i < 3; i++) {
    const pm = texMat('mphoto' + i, () => photoTex(i), {});
    const x = -0.18 + i * 0.18;
    k.add(mat('wood'), G('pframe', () => bbox(0.13, 0.17, 0.015, 0.004, 0.05)), { p: [x, 0.8, -0.5], r: [-0.15, (i - 1) * 0.2, 0], color: [0x2a2018, 0xc8a050, 0x1a1a1a][i], w: false });
    k.add(pm, G('pphoto', () => quad(0.1, 0.13)), { p: [x + Math.sin((i - 1) * 0.2) * 0.009, 0.885, -0.49 + 0.009], r: [-0.15, (i - 1) * 0.2, 0], color: 0xffffff, uv: 'keep', w: false });
  }
  k.details(() => {
    // offerings on the stand
    for (const s of [-1, 1]) {
      candle(k, { p: [s * 0.27, 0.75, -0.43], h: 0.08 + rng() * 0.06, color: 0xe8e0c8 });
      bottle(k, { p: [s * 0.18, 0.75, -0.42], straw: true, color: PAL.sodaRed, s: 0.85 });
    }
    incensePot(k, { p: [0, 0.75, -0.42], rad: 0.05, color: 0x8a2418, sticks: 12, seed: seed + 2 });
    garland(k, { p: [0, 1.2, -0.44], len: 0.16 });
    // zebras crowding in front (traffic deaths)
    zebras(k, { p: [0.05, 0, -0.05], n: 7, spread: 1.1, size: 1.25, seed: seed + 5, yaw: Math.PI * 0.1, moss: 0.3 });
    // drinks, a toy car, shoes
    for (let i = 0; i < 4; i++) bottle(k, { p: [-0.6 + rng() * 1.2, 0, 0.3 + rng() * 0.3], straw: rng() < 0.5, color: rng() < 0.7 ? PAL.sodaRed : PAL.sodaGreen });
    shoes(k, { p: [0.75, 0, 0.1], r: 0.6, color: 0x2a2a3a, messy: true });
  });
  // wreaths (faded, one fallen)
  wreath(k, { p: [-0.95, 0, -0.75], r: 0.35, seed: seed + 7, faded: 0.7, accent: 0xc8a020 });
  wreath(k, { p: [0.95, 0, -0.8], r: -0.3, seed: seed + 8, faded: 0.5, accent: 0xb0304a, ribbon: 0xe0d8c8 });
  k.at([1.5, 0.08, 0.3], [-Math.PI / 2 + 0.15, 0.8, 0], 0.9, () => wreath(k, { seed: seed + 9, faded: 0.9, accent: 0x8a8a6a }));
  out.colliders.push({ x: -0.95, z: -0.75, r: 0.45 }, { x: 0.95, z: -0.8, r: 0.45 });
  // crashed old motorbike on its side in the grass behind
  k.at([-1.6, 0, 0.25], [0, 0.9, 0], null, () => brokenScooter(k, { seed: seed + 11, fallen: true }));
  out.colliders.push({ x: -1.6, z: 0.25, hx: 0.9, hz: 0.4, yaw: -0.9 });
  // scattered plastic shards / broken indicator glass
  for (let i = 0; i < 12; i++) k.add(mat('plastic'), G('mshard', () => bbox(0.05, 0.005, 0.03, 0.002, 0.05)), { p: [-0.8 + rng() * 2.4, 0.012, 0.2 + rng() * 1.0], r: rng() * 6, color: [0xe0801a, 0xd8d0c0, 0x9a1a14, 0x1a1a1a][Math.floor(rng() * 4)], w: false });
  group.add(k.build({ name: 'accidentMemorial', detailDistance: 35 }));
  // the cracked helmet: its own small group (memory pickup)
  const hk = new Kit(seed + 3, { grime: 0.5, grimeH: 0.15, mossLow: 0.4, mossH: 0.08, vary: 0.25 });
  helmet(hk, { cracked: true, color: 0x6a1a16 });
  const helmetObj = hk.build({ name: 'helmet' });
  helmetObj.position.set(0.32, 0.0, 0.05);
  helmetObj.rotation.set(-0.35, 2.4, 0.25);
  group.add(helmetObj);
  out.helmet = helmetObj;
  out.helmetAnchor = anchor(group, 'helmet', 0.32, 0.15, 0.05);
  // candle lights + smoke
  for (const s of [-1, 1]) {
    const a = anchor(group, 'mcandle' + s, s * 0.27, 0.9, -0.43);
    out.candleAnchors.push(a);
    out.lights.push(lightSpec('candle', a, { intensity: 0.5 }));
  }
  out.smokeAnchor = anchor(group, 'smoke', 0, 0.95, -0.42);
  out.waitSpot = anchor(group, 'wait', 0.5, 0, 0.9);
  return out;
}

// ===========================================================================
// Ghost gate (ประตูหมอก) — spans the ghost road
// ===========================================================================
/**
 * Old wooden archway across the ghost road with white cloth strips, sacred thread and paper
 * lanterns. Spans local X (road width), road runs along Z; ghosts walk through toward −Z.
 * opts {seed, width=9.5, height=5} -> { object, walkTarget, gateCenter, lanternAnchors, lights, colliders }
 */
export function createGhostGate(opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 71 + 5);
  const Wd = opts.width ?? 9.5, Hh = opts.height ?? 5.0;
  const group = new THREE.Group();
  group.name = 'ghostGate';
  const k = new Kit(seed, { grime: 0.6, grimeH: 0.9, mossLow: 0.8, mossH: 0.9, moss: 0.5, streak: 0.6, vary: 0.25 });
  const out = { object: group, lanternAnchors: [], lights: [], colliders: [] };
  const px = Wd / 2;
  // two thick old posts on stone footings, slightly leaning inward
  for (const s of [-1, 1]) {
    k.add(mat('stone'), bbox(0.75, 0.4, 0.75, 0.05, 0.3), { p: [s * px, 0, 0], color: 0x6a665c, jitter: 0.02, jitterFreq: 6, w: { mossLow: 1, mossH: 0.5 } });
    k.add(mat('wood'), cyl(0.2, 0.24, Hh, 10, 0.01, 8), { p: [s * px, 0.35, 0], r: [0, 0, -s * 0.02], color: 0x4a3c30, jitter: 0.012, jitterFreq: 3, w: { ground: 0.35, grime: 0.6, mossLow: 0.8, mossH: 1.2, streak: 0.4 } });
    // sacred cloth wrapped round each post
    k.add(mat('cloth_static'), G('postcloth', () => cyl(0.235, 0.235, 0.5, 14, 0, 2, false)), { p: [s * px, 1.2, 0], color: 0xe8e4d8, w: { vary: 0.3, grime: 0.3 }, jitter: 0.008, jitterFreq: 20 });
    out.colliders.push({ x: s * px, z: 0, r: 0.4 });
  }
  // lintel (curved slightly, cracked) + lower tie beam + small roof
  const lint = bevelBox(Wd + 1.4, 0.32, 0.36, 0.03, [0.4, 0.2, 0.2]);
  k.add(mat('wood'), lint, { p: [0, Hh + 0.2, 0], color: 0x3e3228, w: { moss: 0.8, streak: 0.5, grime: 0 }, deform: (p) => { const u = p.x / ((Wd + 1.4) / 2); p.y += Math.pow(Math.abs(u), 3) * 0.25; } });
  k.add(mat('wood'), bevelBox(Wd + 0.2, 0.2, 0.22, 0.02, [0.4, 0.2, 0.2]), { p: [0, Hh - 0.55, 0], r: [0, 0, 0.015], color: 0x46382c, w: { moss: 0.6, grime: 0 } });
  k.push([0, Hh + 0.36, 0], Math.PI / 2);
  thaiRoofTier(k, { w: 1.2, d: Wd + 1.8, h: 0.55, mat: 'wood', roofColor: 0x3a2e24, trim: 0x5a4a38, chofa: false, gablePanel: false, scale: 2, eaveY: 0, backGable: true });
  k.pop();
  // old name board in the middle (blank, worn — the text has faded away)
  k.add(mat('wood'), bbox(1.6, 0.6, 0.06, 0.01, 0.2), { p: [0, Hh - 0.35, 0.16], color: 0x5a4a3a, w: { moss: 0.5, streak: 0.6 } });
  // sacred white thread (sai sin) zig-zagging between the posts
  k.add(mat('cloth_static'), tube(sagCurve(V(-px + 0.2, Hh - 0.9, 0.2), V(px - 0.2, Hh - 0.9, 0.2), 0.5, 24), 0.006, 3), { color: 0xe8e4d8, w: false });
  // white cloth strips hanging from the lintel (ragged lengths) — sway in the wind
  const nStrips = 34;
  for (let i = 0; i < nStrips; i++) {
    const x = -Wd / 2 + 0.4 + (i / (nStrips - 1)) * (Wd - 0.8) + (rng() - 0.5) * 0.15;
    const L = 0.9 + rng() * 1.9;
    const w = 0.07 + rng() * 0.07;
    k.add(mat('cloth'), G(`strip:${L.toFixed(1)}:${w.toFixed(2)}`, () => {
      const g = quad(w, L, 1, 8);
      g.translate(0, -L / 2, 0);
      return g;
    }), {
      p: [x, Hh + 0.02, 0.2 + (rng() - 0.5) * 0.06], r: [(rng() - 0.5) * 0.08, (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.06], color: rng() < 0.85 ? 0xe8e4da : 0xd8c8a8, uv: 'keep',
      w: { grime: 0.3, grimeH: 0.6, ground: Hh - L, vary: 0.3 },
      deform: (p) => {
        p.z += Math.sin(p.y * 4 + x) * 0.04 + Math.sin(p.y * 11 + x * 7) * 0.012;
        p.x += Math.sin(p.y * 7 + x * 3) * 0.01 * (-p.y);
        // torn, frayed bottom ends
        const torn = 0.08 + Math.abs(Math.sin(x * 37)) * 0.25;
        if (p.y < -L + torn) p.y += (p.x / w + 0.5) * torn * Math.sign(Math.sin(x * 13));
      },
    });
  }
  // white paper lanterns hanging (dim)
  const nl = 4;
  for (let i = 0; i < nl; i++) {
    const x = (-1.5 + i) * (Wd / 4.5);
    const drop = 0.4 + rng() * 0.5;
    k.add(mat('dark'), G('lcord:' + drop.toFixed(2), () => cyl(0.004, 0.004, drop, 3, 0)), { p: [x, Hh - 0.45 - drop, 0.05], color: 0x222222, w: false });
    lantern(k, { p: [x, Hh - 0.45 - drop, 0.05], white: true, s: 1.2, tassel: true, r: rng() });
    const a = anchor(group, 'glantern' + i, x, Hh - 0.45 - drop - 0.2, 0.05);
    out.lanternAnchors.push(a);
    if (i % 2 === 0) out.lights.push(lightSpec('lantern_white', a));
  }
  // offerings at the foot of the posts (old, rotten)
  k.details(() => {
    for (const s of [-1, 1]) {
      incensePot(k, { p: [s * (px - 0.6), 0, 0.4], rad: 0.07, color: 0x6a5a4a, sticks: 8, burnt: 1, lit: 0, seed: seed + s });
      garland(k, { p: [s * (px - 0.3), 0.01, 0.55], r: [-Math.PI / 2 + 0.1, rng() * 3, 0], len: 0.15, color: 0x7a6a50, accent: 0x5a4a30, rose: 0x3a1a14 });
    }
  });
  group.add(k.build({ name: 'ghostGate', detailDistance: 40 }));
  out.walkTarget = anchor(group, 'walk', 0, 0, -9);
  out.gateCenter = anchor(group, 'center', 0, 0, 0);
  return out;
}

// ===========================================================================
// Village stop (บ้านห้วยทราย) — humans get off here
// ===========================================================================
/**
 * Village sign on two posts, a tiny shelter, a bamboo fence and a stilt house far behind
 * with one warm lit window. opts {seed, houseDistance=24}
 * -> { object, walkTarget, waitSpot, windowAnchor, lampAnchor, lights, colliders, seats }
 */
export function createVillageStop(opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 83 + 7);
  const group = new THREE.Group();
  group.name = 'villageStop';
  const k = new Kit(seed, { grime: 0.5, grimeH: 0.5, mossLow: 0.6, mossH: 0.4, streak: 0.4, vary: 0.22 });
  const out = { object: group, lights: [], colliders: [], seats: [] };
  // village sign (big green-blue plate on two concrete posts)
  const sx0 = -2.4;
  for (const s of [-1, 1]) {
    k.add(mat('concrete'), bbox(0.16, 2.5, 0.16, 0.02, 0.3), { p: [sx0 + s * 1.2, 0, -0.3], color: 0xd8d4c8, w: { mossLow: 0.9, mossH: 0.6 }, colorFn: (p, n, c, lp) => { if (lp.y < 1.2 && Math.floor(lp.y / 0.2) % 2 === 0) c.multiplyScalar(0.2); } });
    out.colliders.push({ x: sx0 + s * 1.2, z: -0.3, r: 0.1 });
  }
  k.add(mat('metal'), bbox(2.7, 1.05, 0.04, 0.01, 0.3), { p: [sx0, 1.35, -0.32], color: 0x6a6a64, w: { streak: 0.6 } });
  k.add(signMat('village_sign', { th: 'บ้านห้วยทราย', en: 'Ban Huai Sai' }), G('vsign', () => quad(2.62, 0.98, 2, 2)), { p: [sx0, 1.87, -0.295], color: 0xffffff, uv: 'keep', w: { vary: 0.3, streak: 0.4 } });
  // tiny shelter: concrete bench + tin roof on 4 pipes
  const shx = 1.6;
  for (const s of [-1, 1]) for (const z of [-0.5, 0.4]) k.add(mat('galv'), G('vshpost', () => cyl(0.03, 0.03, 2.25, 6, 0.003)), { p: [shx + s * 0.9, 0, z], color: 0x8a8a84, w: { grime: 0.6, streak: 0.6 } });
  k.add(mat('corrugated'), bevelBox(2.2, 0.02, 1.4, 0.005, 0.2), { p: [shx, 2.3, -0.05], r: [-0.1, 0, 0], color: 0x8a6a50, w: { moss: 0.4 }, deform: (p) => { p.y += Math.sin(p.x * 2 * Math.PI / 0.076) * 0.01; } });
  k.add(mat('concrete'), bbox(1.6, 0.06, 0.4, 0.015, 0.3), { p: [shx, 0.42, -0.3], color: 0xb0aa9c, w: { moss: 0.5 } });
  for (const s of [-1, 1]) k.add(mat('concrete'), G('vbleg', () => bbox(0.1, 0.42, 0.35, 0.01, 0.2)), { p: [shx + s * 0.6, 0, -0.3], color: 0xa29c8e });
  out.seats.push(anchor(group, 'seat0', shx - 0.3, 0.48, -0.3), anchor(group, 'seat1', shx + 0.35, 0.48, -0.3));
  out.colliders.push({ x: shx, z: -0.3, hx: 0.85, hz: 0.25, yaw: 0 });
  // a bare bulb under the shelter roof (dim) = lampAnchor
  hangingBulbK(k, [shx, 2.27, -0.05]);
  out.lampAnchor = anchor(group, 'lamp', shx, 1.95, -0.05);
  out.lights.push(lightSpec('bulb', out.lampAnchor, { intensity: 3, flicker: 'candle' }));
  // bamboo fence along the property line behind
  const fenceZ = -2.2;
  for (let i = 0; i < 26; i++) {
    const x = -6 + i * 0.5;
    if (x > -0.6 && x < 0.6) continue; // gap / path to the house
    k.add(mat('wood'), G('fpost', () => cyl(0.035, 0.04, 1.2, 6, 0.004)), { p: [x, 0, fenceZ + (rng() - 0.5) * 0.06], r: [(rng() - 0.5) * 0.08, 0, (rng() - 0.5) * 0.08], color: 0x8a7a50, w: { mossLow: 0.8 } });
  }
  for (const y of [0.45, 0.95]) for (const s of [-1, 1]) k.add(mat('wood'), tube([V(s * 0.6, y, fenceZ), V(s * 6, y + (rng() - 0.5) * 0.1, fenceZ)], 0.022, 5), { color: 0x9a8a5a, w: { moss: 0.4 } });
  // dirt path toward the house
  k.add(mat('soil'), G('vpath', () => blob(0.9, 6, seed + 1, 20, 0.15)), { p: [0, 0.008, fenceZ - 6], color: 0x5a4a38, w: false });
  // the stilt house far behind with one warm window
  const hz = -(opts.houseDistance ?? 24);
  k.at([1.0, 0, hz], 0.15, null, () => {
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) k.add(mat('wood'), G('stilt', () => bbox(0.16, 1.6, 0.16, 0.02, 0.4)), { p: [sx * 2.4, 0, sz * 1.8], color: 0x4a3a2c, w: { mossLow: 0.7, mossH: 0.5 } });
    k.add(mat('wood'), bbox(5.4, 0.12, 4.2, 0.015, 0.4), { p: [0, 1.6, 0], color: 0x4a3a2c });
    k.add(mat('wood'), bbox(5.0, 2.3, 3.8, 0.02, 0.5), {
      p: [0, 1.72, 0], color: 0x5a4632, w: { grime: 0.4, streak: 0.5, ground: 1.72 },
      colorFn: (p, n, c, lp) => { if (Math.abs(n.y) < 0.5 && Math.abs(Math.sin((Math.abs(n.x) > 0.5 ? lp.z : lp.x) * 14)) < 0.12) c.multiplyScalar(0.6); },
    });
    k.add(mat('dark'), bbox(0.9, 1.8, 0.03, 0.005, 0.2), { p: [-1.4, 1.75, 1.9], color: 0x0a0806, w: false });
    k.push([0, 4.0, 0]);
    thaiRoofTier(k, { w: 6.4, d: 4.8, h: 2.0, mat: 'corrugated', roofColor: 0x5a4a3c, trim: 0x4a3a2c, chofa: false, gablePanel: false, scale: 1, eaveY: 0 });
    k.pop();
    // stairs
    for (let i = 0; i < 6; i++) k.add(mat('wood'), G('hstep', () => bbox(0.9, 0.05, 0.28, 0.008, 0.2)), { p: [-1.4, 0.25 + i * 0.25, 2.4 + (5 - i) * 0.22], color: 0x5a4632 });
  });
  // the lit window (emissive) + warm light spilling out
  const wx = 1.0 + 0.8, wy = 2.8, wz = hz + 1.92;
  k.at([wx, wy, wz], 0.15, null, () => {
    k.add(glowMat('window'), G('vwindow', () => quad(0.8, 0.6, 1, 1)), { color: 0xffffff, uv: 'keep', w: false, colorFn: (p, n, c, lp) => { if (Math.abs(lp.x) < 0.02 || Math.abs(lp.y) < 0.02) c.multiplyScalar(0.15); else if (lp.x < -0.1) c.multiplyScalar(0.7); } });
    k.add(mat('wood'), G('vwinframe', () => bbox(0.92, 0.72, 0.04, 0.01, 0.1)), { p: [0, -0.36, -0.03], color: 0x3a2a1c, w: false });
    k.add(mat('cloth_static'), G('vcurtain', () => quad(0.3, 0.55, 3, 2)), { p: [-0.24, 0.0, 0.01], color: 0xc89a6a, uv: 'keep', w: false, deform: (p) => { p.z += Math.sin(p.x * 30) * 0.01; } });
  });
  out.windowAnchor = anchor(group, 'window', wx, wy, wz + 0.3);
  out.lights.push(lightSpec('window', out.windowAnchor, { intensity: 3.5 }));
  // clutter: a parked bicycle silhouette, sandals at the shelter, a mailbox on a post
  k.details(() => {
    k.add(mat('galv'), cyl(0.025, 0.025, 1.2, 6, 0.003), { p: [-0.9, 0, -0.6], color: 0x6a6a64 });
    k.add(mat('metal'), bbox(0.3, 0.22, 0.24, 0.01, 0.1), { p: [-0.9, 1.2, -0.6], color: 0xb02a1a, w: { streak: 0.6 } });
    shoes(k, { p: [shx + 0.2, 0, 0.0], r: 0.4, color: 0x7a3a2a });
  });
  group.add(k.build({ name: 'villageStop', detailDistance: 40 }));
  out.waitSpot = anchor(group, 'wait', 0.4, 0, 0.6);
  out.walkTarget = anchor(group, 'walk', 0.1, 0, hz + 3.5);
  return out;
}
function hangingBulbK(k, p) {
  hangingBulb(k, { p, len: 0.25 });
}
