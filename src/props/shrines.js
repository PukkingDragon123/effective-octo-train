// Spirit houses (ศาลพระภูมิ Thai style, small Chinese red shrine, twin ศาลตายาย),
// incense pots and tri-colour cloth wraps for sacred trees.
import * as THREE from 'three';
import { Kit, bevelBox, bbox, lathe, cyl, tube, torus, sphere, quad, extrude, smoothPath, blob, squareMoulding, baluster, makeRng, noise } from './lib/kit.js';

// moulding profiles [[outward offset, y]] (metres at size 1)
const M_BASE = [[0.03, 0], [0.03, 0.02], [0.018, 0.03], [0.022, 0.045], [0.008, 0.06], [0.004, 0.075], [0, 0.08]];
const M_CAP = [[0, 0], [0.006, 0.006], [0.02, 0.018], [0.016, 0.03], [0.03, 0.042], [0.036, 0.06], [0.036, 0.072], [0.02, 0.076]];
const M_CORNICE = [[0, 0], [0.008, 0.008], [0.008, 0.016], [0.022, 0.026], [0.03, 0.04], [0.03, 0.05], [0.0, 0.05]];
import { mat, glowMat, signMat } from './lib/materials.js';
import { lightSpec } from './lib/lights.js';
import { G, PAL, bottle, candle, incensePot, garland, flowerString, fruitPlate, zebras, dancers, plate, glassWater, teacup, offeringTray, lantern, useAsset } from './lib/small.js';
import { elderGeo, dancerGeo } from './lib/figures.js';
import { jossPaper, card, findPrint } from './lib/print.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function anchor(parent, name, x, y, z, yaw = 0) {
  const a = new THREE.Object3D();
  a.name = name;
  a.position.set(x, y, z);
  a.rotation.y = yaw;
  parent.add(a);
  return a;
}

// ---------------------------------------------------------------------------
// Thai roof pieces
// ---------------------------------------------------------------------------
/** Chofa: the hooked bird-beak finial at a gable apex. Origin at apex, faces +Z. */
export function chofa(k, p, s = 1, color = 0xd8a840, yaw = 0) {
  // swan-neck finial: blade-like (flattened sideways), thick socle tapering to a hooked beak
  const g = G('chofa2', () => {
    const t = tube(smoothPath([V(0, 0, 0.004), V(0, 0.035, 0.01), V(0, 0.08, 0.006), V(0, 0.12, -0.012), V(0, 0.148, -0.042), V(0, 0.152, -0.07), V(0, 0.138, -0.088), V(0, 0.12, -0.084), V(0, 0.114, -0.07)], 28), (u) => 0.017 * Math.pow(1 - u, 0.75) + 0.0022, 8, true);
    t.scale(0.6, 1, 1);
    return t;
  });
  k.add(mat('gold'), g, { p, s, r: yaw, color, w: { grime: 0, vary: 0.2 } });
  k.add(mat('gold'), G('chofaSocle', () => lathe([[0, 0], [0.022, 0], [0.024, 0.008], [0.016, 0.014], [0.014, 0.022], [0, 0.022]], 10)), { p, s, color, w: false });
}
/** Hang hong: curled end at the bottom of a bargeboard. */
function hangHong(k, p, s, color, side) {
  const g = G('hanghong', () => tube(smoothPath([V(0, 0, 0), V(0.03, -0.01, 0), V(0.05, 0.02, 0), V(0.035, 0.05, 0), V(0.02, 0.035, 0)], 12), (t) => 0.012 * (1 - t * 0.6), 5, true));
  k.add(mat('gold'), g, { p, s: [s * side, s, s], color, w: false });
}

/**
 * Thai gable roof tier: ridge along Z, gable faces ±Z. Origin at eave level centre.
 * o {w, d, h, thick, roofColor, borderColor, trim, chofa, front}
 */
export function thaiRoofTier(k, o) {
  const w = o.w, d = o.d, h = o.h, t = o.thick ?? 0.025;
  const ang = Math.atan2(h, w / 2);
  const slope = Math.hypot(w / 2, h);
  for (const s of [-1, 1]) {
    k.add(mat(o.mat ?? 'tiles'), bevelBox(slope + 0.04, t, d, 0.006, 0.12), {
      p: [(s * w) / 4, h / 2 + t * 0.5, 0], r: [0, 0, -s * ang], color: o.roofColor ?? 0x9a2a1c,
      // slight concave sweep + green glazed border band
      deform: (p) => { const u = p.x / (slope / 2); p.y -= 0.018 * (1 - u * u); },
      colorFn: (p, n, c, lp) => {
        if (o.borderColor != null) {
          const edge = Math.min(d / 2 - Math.abs(lp.z), (slope + 0.04) / 2 - lp.x * s);
          if (edge < 0.035) c.lerp(_bc.set(o.borderColor), 0.85);
        }
      },
    });
  }
  // ridge cap
  k.add(mat('gold'), G('ridge:' + d, () => cyl(0.012, 0.012, d + 0.02, 6, 0.002).rotateX(Math.PI / 2).translate(0, 0, -(d + 0.02) / 2)), { p: [0, h + t + 0.008, 0], color: o.trim ?? 0xd8a840, w: false });
  // bargeboards + bai raka + chofa + hang hong at both gables (or front only)
  const ends = o.backGable === false ? [1] : [1, -1];
  for (const zs of ends) {
    const z = zs * (d / 2 + 0.008);
    for (const s of [-1, 1]) {
      k.add(mat('gold'), bevelBox(slope + 0.03, 0.035, 0.016, 0.005, 0.1), { p: [(s * w) / 4, h / 2 + t + 0.01, z], r: [0, 0, -s * ang], color: o.trim ?? 0xd8a840, w: { grime: 0, vary: 0.2 } });
      // serrated blades (bai raka)
      const nb = Math.max(3, Math.round(slope / 0.045));
      for (let i = 1; i < nb; i++) {
        const u = i / nb;
        const x = s * (w / 2) * (1 - u), y = h * u + t + 0.03;
        k.add(mat('gold'), G('blade', () => cyl(0.0, 0.012, 0.035, 4, 0, 1, true)), { p: [x, y, z], r: [0, 0, -s * ang + s * 0.4], color: o.trim ?? 0xd8a840, w: false });
      }
      hangHong(k, [s * (w / 2 + 0.01), t + 0.005, z], (o.scale ?? 1) * 0.9, o.trim ?? 0xd8a840, s);
    }
    if (o.chofa !== false) chofa(k, [0, h + t + 0.02, z], (o.scale ?? 1) * 0.9, o.trim ?? 0xd8a840, zs > 0 ? Math.PI : 0);
    // gable triangle panel (หน้าจั่ว) with a painted pattern
    if (o.gablePanel !== false) {
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2 + 0.04, 0.0);
      shape.lineTo(w / 2 - 0.04, 0.0);
      shape.lineTo(0, h - 0.02);
      shape.closePath();
      k.add(mat('gold'), G(`gable:${w}:${h}`, () => extrude(shape, 0.012, 0)), {
        p: [0, t * 0.5, zs * (d / 2 - 0.02)], color: o.panel ?? 0xc89a40, w: { grime: 0, vary: 0.25 },
        colorFn: (p, n, c, lp) => {
          const r = Math.hypot(lp.x, lp.y - h * 0.38);
          if (Math.abs(Math.sin(r * 90)) > 0.7 || Math.abs(Math.sin(lp.x * 70) * Math.sin(lp.y * 70)) > 0.8) c.multiplyScalar(0.55);
        },
      });
    }
  }
}
const _bc = new THREE.Color();

// ---------------------------------------------------------------------------
// Spirit houses
// ---------------------------------------------------------------------------
/**
 * ศาลพระภูมิ / ศาลตายาย / small Chinese shrine.
 * opts {style:'thai'|'chinese'|'twin', size=1, seed, offerings=true, age=0.7, lights=false}
 * -> { object, incenseAnchor, candleAnchor, offeringAnchor, smokeAnchor, candleAnchors[],
 *      lights (candle glows / red lamps), colliders }
 */
export function createSpiritHouse(opts = {}) {
  const style = opts.style ?? 'thai';
  const seed = opts.seed ?? 1;
  const age = opts.age ?? 0.7;
  const S = opts.size ?? 1;
  const group = new THREE.Group();
  group.name = 'spiritHouse_' + style;
  const k = new Kit(seed, { grime: 0.45 * age + 0.1, grimeH: 0.5, mossLow: 0.7 * age, mossH: 0.45, moss: 0.25 * age, streak: 0.4 * age, vary: 0.16 });
  const rng = makeRng(seed * 11 + 7);
  const out = { object: group, lights: [], candleAnchors: [], colliders: [] };
  k.push(null, null, S);
  let deck = 0;
  if (style === 'thai') deck = buildThaiHouse(k, rng, age, opts);
  else if (style === 'chinese') deck = buildChineseShrine(k, rng, age, opts, group, out);
  else deck = buildTwinHouse(k, rng, age, opts);
  // ---- offerings ------------------------------------------------------------
  const front = style === 'chinese' ? 0.36 : style === 'twin' ? 0.32 : 0.38;
  if (opts.offerings !== false) k.details(() => {
    k.push([0, deck, 0]);
    if (style !== 'chinese') {
      incensePot(k, { p: [0, 0, front], rad: 0.055, seed: seed + 1, color: 0xb0a070, metal: true, legs: true, sticks: 16 });
      for (const sx of [-1, 1]) candle(k, { p: [sx * 0.11, 0, front + 0.03], h: 0.09 + rng() * 0.05, color: rng() < 0.5 ? 0xd8d0b8 : 0xb8241c });
      // red soda bottles with straws, lined along the front edge
      // a few soda bottles with straws at the front corners (the rest on the ground)
      const nb = style === 'thai' ? 2 + Math.floor(rng() * 2) : 3;
      for (let i = 0; i < nb; i++) {
        const sx = i % 2 ? 1 : -1;
        const x = style === 'thai' ? sx * (0.4 - Math.floor(i / 2) * 0.08) : -0.3 + i * 0.12;
        bottle(k, { p: [x, 0, front + (style === 'thai' ? 0.04 : 0.11) - Math.floor(i / 2) * 0.08], straw: true, strawYaw: rng() * 6, kind: 'soda', color: rng() < 0.8 ? PAL.sodaRed : PAL.sodaGreen, s: 0.9 });
      }
      dancers(k, { p: [0.24, 0, front - 0.1], n: 1, size: 1.0 });
      dancers(k, { p: [-0.24, 0, front - 0.1], n: 1, size: 1.0 });
      fruitPlate(k, { p: [-0.12, 0, front - 0.1], kind: rng() < 0.5 ? 'banana' : 'orange', s: 0.7, seed: seed + 3 });
      glassWater(k, { p: [0.12, 0, front - 0.1], s: 0.8 });
      if (style === 'thai') garland(k, { p: [0, 0.55, 0.17], len: 0.12, s: 0.9 });
    }
    k.pop();
    // ground-level clutter: zebras, old bottles, dried garlands, more figurines
    const gz = style === 'chinese' ? 0.55 : 0.55;
    zebras(k, { p: [0.0, 0, gz], n: 2 + Math.floor(rng() * 3), spread: 0.75, size: 1.2, seed: seed + 5, moss: age * 0.5 });
    for (let i = 0; i < 5; i++) bottle(k, { p: [-0.45 + rng() * 0.9, 0, gz + 0.12 + rng() * 0.2], straw: rng() < 0.7, strawYaw: rng() * 6, color: rng() < 0.85 ? PAL.sodaRed : PAL.sodaGreen, s: 1 });
    if (rng() < 0.7) bottle(k, { p: [0.3, 0.03, gz + 0.2], r: [Math.PI / 2, rng() * 6, 0], straw: false, color: 0x6a1010 });
    garland(k, { p: [-0.25, 0.01, gz + 0.05], r: [-Math.PI / 2 + 0.1, rng() * 3, 0], len: 0.14, color: 0x8a7a5a, accent: 0x6a4a2a, rose: 0x4a1a14 });
    dancers(k, { p: [0.32, 0, gz - 0.05], n: 1, size: 1.2 });
    // printed offerings: a stack of gold joss paper, lottery tickets left for a lucky number,
    // a little amulet card tucked against the post base
    jossPaper(k, { p: [-0.42, 0, gz + 0.32], r: rng() * 6, n: 5, loose: 2, seed: seed + 9 });
    // carved wooden elephants offered for a granted wish (CC0 model when loaded)
    for (let i = 0; i < (style === 'chinese' ? 1 : 2); i++) useAsset(k, 'carved_wooden_elephant', { p: [0.42 - i * 0.16, 0, gz + 0.1 + i * 0.05], r: -0.3 + i * 0.5 }, { fit: { h: 0.11 + i * 0.03 }, w: { moss: 0.3 * age, grime: 0.3 } });
    const lot = findPrint([['lottery']], rng);
    if (lot) for (let i = 0; i < 2; i++) card(k, lot.kind, lot.opts, { p: [0.18 + i * 0.05, 0.004 + i * 0.001, gz + 0.38 + i * 0.03], r: [-Math.PI / 2, 0, rng() * 6, 'XYZ'], curl: 0.008, seed: seed + 50 + i, wt: { grime: 0.4, ground: -0.4, vary: 0.3 } });
    const bc = findPrint([['buddha_card'], ['amulet_card']], rng);
    if (bc && style === 'thai') card(k, bc.kind, bc.opts, { p: [0.02, 0.215, 0.087], r: [-0.25, 0, 0.05], scale: 1.2, seed: seed + 60, wt: false });
  });
  k.pop();
  group.add(k.build({ name: 'spiritHouse', detailDistance: opts.detailDistance ?? 32 }));
  // anchors (scaled)
  const ay = deck * S;
  out.incenseAnchor = anchor(group, 'incense', 0, ay + 0.06 * S, front * S);
  out.smokeAnchor = anchor(group, 'smoke', 0, ay + 0.15 * S, front * S);
  out.candleAnchor = anchor(group, 'candle', 0.11 * S, ay + 0.12 * S, (front + 0.03) * S);
  out.candleAnchors.push(out.candleAnchor, anchor(group, 'candle2', -0.11 * S, ay + 0.12 * S, (front + 0.03) * S));
  out.offeringAnchor = anchor(group, 'offering', -0.12 * S, ay + 0.02 * S, (front - 0.1) * S);
  out.groundOfferingAnchor = anchor(group, 'groundOffering', 0, 0, 0.6 * S);
  if (style !== 'chinese') for (const a of out.candleAnchors) out.lights.push(lightSpec('candle', a, { intensity: 0.5, offset: new THREE.Vector3(0, 0.05, 0.08) }));
  out.lightSpec = out.lights[0];
  out.colliders.push(style === 'twin' ? { x: 0, z: 0, hx: 0.55 * S, hz: 0.35 * S, yaw: 0 } : style === 'thai' ? { x: 0, z: 0, hx: 0.2 * S, hz: 0.2 * S, yaw: 0 } : { x: 0, z: 0, hx: 0.42 * S, hz: 0.36 * S, yaw: 0 });
  return out;
}

function buildThaiHouse(k, rng, age, opts) {
  const postH = 1.25;
  const white = 0xe8e0cc, gold = 0xd8a848, red = 0x9a2418;
  // tiled plinth + post
  k.add(mat('concrete'), bbox(0.52, 0.14, 0.52, 0.02, 0.15), { color: 0xc8c0b0, w: { mossLow: 0.9 * age, grime: 0.6 } });
  k.add(mat('ceramic'), bbox(0.46, 0.06, 0.46, 0.008, 0.1), { p: [0, 0.14, 0], color: 0x8a3a2a, w: { grime: 0.5, grimeH: 0.3 } });
  k.add(mat('plaster'), bbox(0.17, postH, 0.17, 0.015, 0.25), { p: [0, 0.2, 0], color: white, w: { mossLow: 0.6 * age, mossH: 0.7, streak: 0.5 * age } });
  // moulded post base + lotus-band capital (mitred mouldings, not stacked slabs)
  k.add(mat('gold'), G('shBase', () => squareMoulding(0.085, 0.085, M_BASE, { top: false })), { p: [0, 0.2, 0], color: gold, w: { grime: 0.5, grimeH: 0.3, ground: 0 } });
  k.add(mat('gold'), G('shCap', () => squareMoulding(0.085, 0.085, M_CAP, { top: true })), { p: [0, postH + 0.03, 0], color: gold });
  k.add(mat('gold'), G('shCollar', () => squareMoulding(0.085, 0.085, [[0, 0], [0.012, 0.006], [0.012, 0.022], [0, 0.028]])), { p: [0, 0.62, 0], color: gold });
  // bracket flare under the deck
  k.add(mat('plaster'), G('flare2', () => cyl(0.44, 0.1, 0.2, 4, 0.01).rotateY(Math.PI / 4)), { p: [0, postH + 0.06, 0], color: white, w: { streak: 0.6 * age } });
  const deck = postH + 0.3;
  // everything above the deck is built at 1.3x around the deck point (a generous house)
  k.push([0, deck, 0], null, 1.3);
  k.push([0, -deck, 0]);
  // deck with balustrade
  k.add(mat('plaster'), bbox(0.78, 0.05, 0.78, 0.012, 0.15), { p: [0, deck - 0.05, 0], color: white, w: { moss: 0.5 * age, dust: 0.2 } });
  k.add(mat('gold'), G('deckCornice', () => squareMoulding(0.39, 0.39, [[0.0, 0], [0.012, 0.004], [0.012, 0.012], [0.006, 0.018], [0.018, 0.03], [0.02, 0.04], [0.006, 0.045], [0, 0.05]])), { p: [0, deck - 0.075, 0], color: gold });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(mat('gold'), G('bpost', () => bbox(0.03, 0.11, 0.03, 0.006, 0.1)), { p: [sx * 0.37, deck, sz * 0.37], color: gold });
  for (const s of [-1, 1]) {
    k.add(mat('lacquer'), G('brail', () => bbox(0.74, 0.02, 0.02, 0.005, 0.15)), { p: [0, deck + 0.09, s * 0.37], color: red });
    k.add(mat('lacquer'), G('brail', () => bbox(0.74, 0.02, 0.02, 0.005, 0.15)), { p: [s * 0.37, deck + 0.09, 0], r: Math.PI / 2, color: red });
    for (let i = -2; i <= 2; i++) {
      if (s > 0 && Math.abs(i) < 1) continue; // front opening
      k.add(mat('gold'), G('baluster2', () => baluster(0.09, 0.011, 8)), { p: [i * 0.13, deck, s * 0.37], color: gold });
      k.add(mat('gold'), G('baluster2', () => baluster(0.09, 0.011, 8)), { p: [s * 0.37, deck, i * 0.13], color: gold });
    }
  }
  // house body (set back so the porch in front holds offerings)
  const bz = -0.08;
  k.add(mat('plaster'), bbox(0.42, 0.36, 0.4, 0.01, 0.12), { p: [0, deck, bz], color: 0xece4d0, w: { streak: 0.45 * age, grime: 0.2, grimeH: 0.1, ground: deck } });
  // corner pilasters + gold mouldings
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(mat('gold'), G('pilaster', () => bbox(0.04, 0.37, 0.04, 0.006, 0.12)), { p: [sx * 0.21, deck, bz + sz * 0.2], color: gold });
  k.add(mat('gold'), G('bodyCornice', () => squareMoulding(0.21, 0.2, M_CORNICE, { top: true })), { p: [0, deck + 0.33, bz], color: gold });
  k.add(mat('gold'), G('bodyBase', () => squareMoulding(0.21, 0.2, [[0.02, 0], [0.02, 0.012], [0.01, 0.02], [0.004, 0.03], [0, 0.034]])), { p: [0, deck, bz], color: gold });
  // door: dark niche + gold frame + tiny Phra Phum figure inside
  k.add(mat('dark'), bbox(0.15, 0.24, 0.02, 0.004, 0.1), { p: [0, deck + 0.03, bz + 0.195], color: 0x1a0c08, w: false });
  k.add(mat('gold'), G('doorframe', () => {
    const s = new THREE.Shape();
    s.moveTo(-0.1, 0);
    s.lineTo(0.1, 0);
    s.lineTo(0.1, 0.26);
    s.lineTo(0.0, 0.31);
    s.lineTo(-0.1, 0.26);
    s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-0.075, 0.0);
    hole.lineTo(0.075, 0.0);
    hole.lineTo(0.075, 0.24);
    hole.lineTo(-0.075, 0.24);
    hole.closePath();
    s.holes.push(hole);
    return extrude(s, 0.02, 0.003);
  }), { p: [0, deck + 0.03, bz + 0.21], color: gold, w: false });
  k.add(mat('gold'), dancerGeo(), { p: [0, deck + 0.03, bz + 0.15], s: 0.75, color: 0xe8c060, w: false });
  // side windows
  for (const s of [-1, 1]) {
    k.add(mat('dark'), G('win', () => bbox(0.012, 0.12, 0.1, 0.003, 0.1)), { p: [s * 0.212, deck + 0.13, bz], color: 0x1a0c08, w: false });
    k.add(mat('gold'), G('winframe', () => bbox(0.016, 0.15, 0.13, 0.003, 0.1)), { p: [s * 0.214, deck + 0.115, bz], color: gold, w: false });
  }
  // two-tier roof (gable to the front)
  const ry = deck + 0.37;
  k.push([0, ry - 0.06, bz - 0.02]);
  thaiRoofTier(k, { w: 0.62, d: 0.66, h: 0.2, roofColor: 0xa82a1a, borderColor: 0x2a7a4a, trim: gold, scale: 1, eaveY: 0 });
  k.pop();
  k.push([0, ry + 0.08, bz - 0.02]);
  thaiRoofTier(k, { w: 0.46, d: 0.44, h: 0.24, roofColor: 0xb0301c, borderColor: 0x2a7a4a, trim: gold, scale: 1.1, eaveY: 0 });
  k.pop();
  // garlands draped on the front corners of the balustrade
  for (const sx of [-1, 1]) garland(k, { p: [sx * 0.37, deck + 0.1, 0.37], len: 0.13, color: PAL.jasmine, accent: PAL.marigold });
  flowerString(k, [V(-0.36, deck + 0.1, 0.375), V(-0.2, deck + 0.02, 0.39), V(0, deck - 0.01, 0.39), V(0.2, deck + 0.02, 0.39), V(0.36, deck + 0.1, 0.375)], { color: PAL.marigold, accent: PAL.rose, rad: 0.014 });
  k.pop();
  k.pop();
  // faded ribbons tied to the post (ผ้าสามสี)
  wrapBands(k, 0.088, 0.85, 1.05, rng, [0xd04a6a, 0xd8b030, 0x2a8a4a], { square: true });
  return deck;
}

function buildChineseShrine(k, rng, age, opts, group, out) {
  const red = 0x9a1a12, gold = 0xd8a848;
  // low tiled base on the ground
  k.add(mat('concrete'), bbox(0.85, 0.3, 0.7, 0.02, 0.15), { color: 0xb8b0a0, w: { mossLow: 0.9 * age, grime: 0.6, grimeH: 0.25 } });
  k.add(mat('ceramic'), bbox(0.8, 0.02, 0.66, 0.005, 0.15), { p: [0, 0.3, 0], color: 0x8a2a1a, w: { grime: 0.3, dust: 0.3 } });
  const deck = 0.32;
  // red cabinet with open front
  k.add(mat('lacquer'), bbox(0.6, 0.5, 0.42, 0.012, 0.15), { p: [0, deck, -0.08], color: red, w: { streak: 0.5 * age, grime: 0.2, ground: deck } });
  k.add(mat('dark'), bbox(0.42, 0.36, 0.02, 0.004, 0.1), { p: [0, deck + 0.05, 0.135], color: 0x200606, w: false });
  // gold board + couplets (signTex)
  k.add(signMat('shrine_board', { th: 'เจ้าที่', cn: '土地公' }), G('cboard', () => quad(0.25, 0.097)), { p: [0, deck + 0.46, 0.142], color: 0xffffff, w: false, uv: 'keep' });
  for (const s of [-1, 1]) k.add(signMat('couplet', { side: s < 0 ? 'left' : 'right' }), G('couplet', () => quad(0.064, 0.34)), { p: [s * 0.25, deck + 0.22, 0.142], color: 0xffffff, w: false, uv: 'keep' });
  k.add(mat('gold'), bbox(0.64, 0.03, 0.46, 0.006, 0.12), { p: [0, deck + 0.5, -0.08], color: gold });
  // curved glazed roof with upturned corners
  k.push([0, deck + 0.53, -0.08]);
  chineseRoof(k, { w: 0.82, d: 0.62, h: 0.18, color: 0x2a6a4a, ridge: 0xd8a040 });
  k.pop();
  // altar items inside + in front
  const deityPlace = [0, deck + 0.05, 0.02];
  k.add(mat('gold'), dancerGeo(), { p: deityPlace, s: 0.9, color: 0xe0b860, w: false });
  incensePot(k, { p: [0, deck, 0.22], rad: 0.06, metal: true, color: 0xb08a40, sticks: 14, seed: 4 });
  for (const s of [-1, 1]) {
    teacup(k, { p: [s * 0.12, deck, 0.22] });
    fruitPlate(k, { p: [s * 0.25, deck, 0.2], kind: 'orange', s: 0.65, seed: 7 + s });
  }
  // red lamp bulbs in little lotus holders (emissive)
  const lampMat = glowMat('red');
  for (const s of [-1, 1]) {
    k.add(mat('gold'), G('lotusHolder', () => lathe([[0, 0], [0.025, 0], [0.03, 0.02], [0.045, 0.04], [0.03, 0.045], [0, 0.04]], 10)), { p: [s * 0.2, deck + 0.04, 0.05], color: gold, w: false });
    k.add(lampMat, G('redbulb', () => sphere(0.026, 10, 8).scale(1, 1.3, 1)), { p: [s * 0.2, deck + 0.105, 0.05], color: 0xffffff, w: false });
    const a = anchor(group, 'redlamp' + s, s * 0.2, deck + 0.11, 0.05);
    out.lights.push(lightSpec('altar', a, { intensity: 1.0, distance: 2.5, glow: { size: 0.15, color: 0xff2a18, opacity: 0.6 } }));
  }
  // paper offerings stack + candles on the base
  for (const s of [-1, 1]) candle(k, { p: [s * 0.33, deck, 0.22], h: 0.15, rad: 0.018, color: 0xb81a14 });
  k.add(mat('paper'), G('joss', () => bbox(0.12, 0.05, 0.08, 0.003, 0.1)), { p: [0.3, 0.0, 0.45], r: 0.3, color: 0xd8b040, w: { grime: 0.3 } });
  return deck;
}

/** Chinese style roof: ridge along X (width w), slopes to ±Z (depth d), upturned corners. Origin eave centre. */
export function chineseRoof(k, o) {
  const w = o.w, d = o.d, h = o.h;
  const color = o.color ?? 0x2a6a4a;
  const slope = Math.hypot(d / 2, h) + 0.08;
  const L = slope / 2;
  for (const s of [-1, 1]) {
    k.add(mat(o.mat ?? 'tiles'), bevelBox(w + 0.1, 0.03, slope, 0.008, [Math.max(0.05, (w + 0.1) / 30), 1, Math.max(0.05, slope / 12)]), {
      p: [0, h / 2 + 0.02, (s * d) / 4], r: [s * Math.atan2(h, d / 2), 0, 0], color,
      deform: (p) => {
        const u = (p.z * s) / L; // -1 ridge .. +1 eave
        const x = p.x / ((w + 0.1) / 2);
        p.y += -0.03 * (1 - u * u) + 0.07 * Math.pow(Math.abs(x), 4) * Math.max(0, u);
      },
      colorFn: (p, n, c, lp) => {
        if (Math.abs(Math.sin(lp.x * 110)) > 0.85) c.multiplyScalar(0.7);
        if (lp.z * s > L - 0.05) c.lerp(_bc.set(o.edge ?? 0xd8a040), 0.6);
      },
    });
  }
  // ridge beam with curled ends + flaming pearl
  k.add(mat('ceramic'), G('cridge:' + w, () => bevelBox(w + 0.16, 0.05, 0.05, 0.01, 0.06)), { p: [0, h + 0.05, 0], color: o.ridge ?? 0xd8a040, w: false, deform: (p) => { const x = p.x / ((w + 0.16) / 2); p.y += 0.05 * Math.pow(Math.abs(x), 5); } });
  for (const s of [-1, 1]) k.add(mat('ceramic'), G('ccurl', () => tube(smoothPath([V(0, 0, 0), V(0, 0.05, 0.02), V(0, 0.08, -0.01), V(0, 0.06, -0.035)], 10), 0.014, 5, true)), { p: [s * (w / 2 + 0.07), h + 0.09, 0], r: s < 0 ? -Math.PI / 2 : Math.PI / 2, color: o.ridge ?? 0xd8a040, w: false });
  k.add(mat('gold'), G('pearl', () => sphere(0.03, 10, 8)), { p: [0, h + 0.12, 0], color: 0xe0b050, w: false });
}

function buildTwinHouse(k, rng, age, opts) {
  // a shared wooden stand on 4 legs with two simple houses (grandpa & grandma)
  const legH = 0.95;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(mat('concrete'), G('tlegs', () => bbox(0.08, legH, 0.08, 0.01, 0.2)), { p: [sx * 0.48, 0, sz * 0.26], color: 0xc8c0b0, w: { mossLow: 0.8 * age, mossH: 0.5 } });
  k.add(mat('wood'), bbox(1.12, 0.06, 0.66, 0.01, 0.15), { p: [0, legH, 0], color: 0x9a7a5a, w: { moss: 0.6 * age, grime: 0.2, ground: legH } });
  const deck = legH + 0.06;
  for (const sx of [-1, 1]) {
    k.at([sx * 0.29, deck, -0.08], null, null, () => {
      k.add(mat('wood'), bbox(0.36, 0.3, 0.32, 0.008, 0.1), { color: 0xa88a64, w: { streak: 0.5 * age, grime: 0.25, grimeH: 0.1, ground: 0 } });
      k.add(mat('dark'), G('tdoor', () => bbox(0.16, 0.2, 0.02, 0.004, 0.1)), { p: [0, 0.02, 0.155], color: 0x140a06, w: false });
      k.add(mat('statue'), elderGeo(sx > 0), { p: [0, 0.02, 0.1], s: 0.95, w: false });
      k.push([0, 0.3, 0]);
      thaiRoofTier(k, { w: 0.46, d: 0.42, h: 0.17, mat: 'wood', roofColor: 0x6a4a34, trim: 0x8a6a44, chofa: true, gablePanel: false, scale: 0.8, eaveY: 0 });
      k.pop();
    });
  }
  // shared front porch rail
  k.add(mat('wood'), bbox(1.1, 0.03, 0.03, 0.005, 0.15), { p: [0, deck + 0.08, 0.31], color: 0x7a5a3a });
  return deck;
}

/** Add tri-colour cloth bands around a vertical post/trunk of radius r between y0..y1. */
function wrapBands(k, r, y0, y1, rng, colors, opts = {}) {
  const n = colors.length;
  const bh = (y1 - y0) / n;
  colors.forEach((c, i) => {
    const ya = y0 + i * bh * 0.92, tilt = (rng() - 0.5) * (opts.square ? 0.05 : 0.18);
    const g = cyl(r + 0.006 + i * 0.004, r + 0.006 + i * 0.004, bh * 1.08, 24, 0, 4, false);
    k.add(mat('cloth_static'), g, {
      p: [0, ya, 0], r: [tilt, opts.square ? 0 : rng() * 6, tilt * 0.5], color: c, w: { grime: 0.15, vary: 0.25 },
      deform: (p) => {
        const a = Math.atan2(p.z, p.x);
        let f = 1 + 0.018 * Math.sin(a * 11 + p.y * 30) + 0.012 * Math.sin(a * 5);
        if (opts.square) {
          const n = 8, ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
          f *= 1.02 / Math.pow(Math.pow(ca, n) + Math.pow(sa, n), 1 / n) * 0.995;
        }
        p.x *= f;
        p.z *= f;
      },
    });
  });
  // knot + hanging tails at the front
  const ky = y0 + (y1 - y0) * 0.6;
  const kr = opts.square ? r * 1.02 : r;
  k.add(mat('cloth_static'), G('knot', () => sphere(0.035, 8, 6)), { p: [0, ky, kr + 0.02], s: [r / 0.12, 0.8, 0.8], color: colors[0], jitter: 0.01, jitterFreq: 30, w: false });
  for (let i = 0; i < 2; i++) {
    const L = 0.25 + rng() * 0.3;
    k.add(mat(opts.wind ? 'cloth' : 'cloth_static'), G('tail:' + L.toFixed(2), () => {
      const q = quad(0.06, L, 1, 6);
      q.translate(0, -L / 2, 0);
      return q;
    }), {
      p: [(i - 0.5) * 0.04, ky - 0.02, kr + 0.03], r: [0.12, (i - 0.5) * 0.6, (i - 0.5) * 0.25], color: colors[(i + 1) % colors.length], uv: 'keep', w: { grime: 0.2, vary: 0.25 },
      deform: (p) => { p.z += Math.sin(p.y * 12) * 0.015 + p.y * p.y * 0.25; },
    });
  }
}

// ---------------------------------------------------------------------------
// Incense pot (stand-alone, e.g. in front of a sacred tree)
// ---------------------------------------------------------------------------
/** opts {seed, size=1, stand=false, sticks=30, metal=false} -> { object, smokeAnchor, colliders } */
export function createIncensePot(opts = {}) {
  const S = opts.size ?? 1;
  const group = new THREE.Group();
  group.name = 'incensePot';
  const k = new Kit(opts.seed ?? 1, { grime: 0.4, grimeH: 0.2, mossLow: 0.5, mossH: 0.15 });
  let y = 0;
  k.push(null, null, S);
  if (opts.stand) {
    k.add(mat('concrete'), bbox(0.4, 0.5, 0.4, 0.02, 0.15), { color: 0xb8b0a0, w: { mossLow: 0.7, mossH: 0.3 } });
    y = 0.5;
  }
  incensePot(k, { p: [0, y, 0], rad: 0.16, metal: opts.metal, color: opts.metal ? 0x8a6a30 : 0x8a2418, sticks: opts.sticks ?? 34, seed: opts.seed ?? 1, lit: 0.5, burnt: 0.65, legs: true });
  // spilled ash ring + a couple of fallen sticks
  k.add(mat('ash'), G('ashspill', () => blob(0.28, 0.24, 3)), { p: [0, y + 0.002, 0], color: 0x9a948a, w: false });
  k.pop();
  group.add(k.build({ name: 'incensePot' }));
  return { object: group, smokeAnchor: anchor(group, 'smoke', 0, (y + 0.32) * S, 0), colliders: [{ x: 0, z: 0, r: 0.2 * S }], lights: [] };
}

// ---------------------------------------------------------------------------
// Cloth wrap (ผ้าแพรสามสี) for sacred trees
// ---------------------------------------------------------------------------
/** Colourful cloth wrapped around a trunk of radius r between heights y0..y1. opts {seed, colors, garland=true} -> Object3D */
export function createClothWrap(radius = 0.8, y0 = 0.8, y1 = 1.6, opts = {}) {
  const rng = makeRng((opts.seed ?? 1) * 5 + 2);
  const k = new Kit(opts.seed ?? 1, { grime: 0, vary: 0.2 });
  const palettes = [[0xd84a7a, 0xe0b830, 0x2a9a5a], [0xc82a2a, 0xe8c040, 0x3a8a3a, 0xd86aa0], [0xe07090, 0xd8c040, 0x30a060]];
  const colors = opts.colors || palettes[Math.floor(rng() * palettes.length)];
  wrapBands(k, radius * 1.03 + 0.012, y0, y1, rng, colors, { wind: true });
  if (opts.garland !== false) {
    // a jasmine/marigold garland hung on the cloth knot
    const ky = y0 + (y1 - y0) * 0.6;
    flowerString(k, [V(-radius * 0.55, ky + 0.12, radius * 0.85), V(-radius * 0.2, ky - 0.15, radius + 0.06), V(0.0, ky - 0.25, radius + 0.08), V(radius * 0.2, ky - 0.15, radius + 0.06), V(radius * 0.55, ky + 0.12, radius * 0.85)], { color: PAL.marigold, accent: PAL.jasmine, rad: 0.022 });
  }
  const obj = k.build({ name: 'clothWrap' });
  return obj;
}
