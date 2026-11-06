// Unsettling roadside set dressing for the drive (placed from LAYOUT.scares by the world):
// abandoned spirit houses, a burnt-out motorbike with a memorial, a row of old school chairs
// facing the road, a broken bus shelter with one sandal, an accident-black-spot warning under a
// CCTV camera, a culvert mouth and an empty stall whose lamp is still on.
// Every factory: front faces local +Z (the road), origin on the ground ->
//   { object, colliders, lights, lampControllers? }
import * as THREE from 'three';
import { Kit, bevelBox, lathe, tube, extrude, quad, makeRng } from './lib/kit.js';
import { mat, glowMat, signMat, texMat, stainTex } from './lib/materials.js';
import { lightSpec } from './lib/lights.js';
import { G, PAL, garland, zebras, dancers, bottle, candle, incensePot, wreath, helmet, hangingBulb, plasticStool, useAsset } from './lib/small.js';
import { brokenScooter } from './dressing.js';
import { createSpiritHouse } from './shrines.js';
import { createBusStop } from './sala.js';
import { createSignPost } from './roadside.js';
import { litter } from './lib/print.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DEAD_FLOWERS = 0x5e4a30; // wilted brown (garland() paints dried flowers for dull colours)

function anchor(parent, name, x, y, z) {
  const a = new THREE.Object3D();
  a.name = name;
  a.position.set(x, y, z);
  parent.add(a);
  return a;
}

/** Old Thai school chair: bent steel-tube frame, plywood seat and curved backrest. */
export function schoolChair(k, o = {}) {
  const paint = o.color ?? 0x4a6a8a;
  k.at(o.p, o.r, o.s, () => {
    // two side frames: front leg -> seat rail -> rear leg rising into the back post (one bent tube)
    for (const sx of [-1, 1]) {
      const x = sx * 0.19;
      const side = [V(x, 0.0, 0.17), V(x, 0.42, 0.18), V(x, 0.44, 0.16), V(x, 0.44, -0.15), V(x, 0.42, -0.18), V(x, 0.0, -0.2)];
      k.add(mat('metal'), G('scFrameA', () => tube(side.map((p) => p.clone().setX(0)), 0.011, 6)), { p: [x, 0, 0], color: paint, w: { grime: 0.6, grimeH: 0.3, streak: 0.4, vary: 0.3 } });
      const back = [V(0, 0.42, -0.18), V(0, 0.62, -0.21), V(0, 0.82, -0.23)];
      k.add(mat('metal'), G('scFrameB', () => tube(back, 0.011, 6)), { p: [x, 0, 0], color: paint, w: { grime: 0.5, streak: 0.4, vary: 0.3 } });
      // rubber foot caps
      for (const z of [0.17, -0.2]) k.add(mat('rubber'), G('scFoot', () => lathe([[0, 0], [0.016, 0], [0.017, 0.02], [0.012, 0.03], [0, 0.03]], 8)), { p: [x, -0.005, z], color: 0x1a1a1a, w: false });
    }
    // cross bars under the seat
    for (const z of [0.12, -0.14]) k.add(mat('metal'), G('scBar', () => tube([V(-0.19, 0, 0), V(0.19, 0, 0)], 0.008, 5)), { p: [0, 0.3, z], color: paint, w: { grime: 0.6, streak: 0.3 } });
    // plywood seat (rounded edges, a little dished) and backrest (bent)
    k.add(mat('wood'), G('scSeat', () => bevelBox(0.42, 0.016, 0.36, 0.007, 0.06, 2)), {
      p: [0, 0.452, -0.005], color: 0xa88a62, w: { grime: 0.3, dust: 0.4, vary: 0.35, moss: o.moss ?? 0.2 },
      deform: (p) => { p.y -= 0.012 * (1 - (p.x / 0.21) ** 2) * (1 - (p.z / 0.18) ** 2); },
    });
    k.add(mat('wood'), G('scBack', () => bevelBox(0.42, 0.15, 0.014, 0.006, 0.05, 2)), {
      p: [0, 0.74, -0.225], r: [-0.12, 0, 0], color: 0xa08460, w: { grime: 0.3, vary: 0.35, streak: 0.4 },
      deform: (p) => { p.z += 0.03 * (p.x / 0.21) ** 2; },
    });
  });
}

/** Single rubber flip-flop sandal: footprint-shaped sole, Y-strap. */
export function sandal(k, o = {}) {
  k.at(o.p, o.r, o.s, () => {
    const sole = G('sandalSole', () => {
      const s = new THREE.Shape();
      s.moveTo(0, -0.125);
      s.bezierCurveTo(0.045, -0.125, 0.048, -0.06, 0.04, 0.0);
      s.bezierCurveTo(0.035, 0.05, 0.058, 0.09, 0.045, 0.118);
      s.bezierCurveTo(0.03, 0.142, -0.035, 0.145, -0.048, 0.11);
      s.bezierCurveTo(-0.055, 0.07, -0.03, 0.03, -0.038, -0.02);
      s.bezierCurveTo(-0.045, -0.08, -0.042, -0.125, 0, -0.125);
      return extrude(s, 0.016, 0.003, 10).rotateX(-Math.PI / 2).translate(0, 0.009, 0);
    });
    k.add(mat('rubber'), sole, { color: o.color ?? 0x3a5a8a, w: { grime: 0.6, grimeH: 0.05, dust: 0.4, vary: 0.2 } });
    const strap = G('sandalStrap', () => tube([V(-0.042, 0.016, -0.02), V(-0.02, 0.05, 0.035), V(0.0, 0.032, 0.085), V(0.02, 0.05, 0.035), V(0.042, 0.016, -0.02)], 0.006, 5));
    k.add(mat('rubber'), strap, { color: o.strap ?? 0x8a1a1a, w: { grime: 0.4 } });
  });
}

/** CCTV camera box on a galvanised pole with a bracket (camera looks toward +Z). */
function cctvCamera(k, o = {}) {
  const H = o.h ?? 3.6;
  k.at(o.p, o.r, null, () => {
    k.add(mat('galv'), G('cctvPole:' + H, () => lathe([[0, 0], [0.052, 0], [0.05, 0.08], [0.044, 0.12], [0.044, H], [0.03, H + 0.02], [0, H + 0.02]], 12)), { color: 0x9a9a94, w: { grime: 0.5, grimeH: 0.6, streak: 0.5, mossLow: 0.4 } });
    k.add(mat('galv'), G('cctvArm', () => tube([V(0, 0, 0), V(0, 0.08, 0.18), V(0, 0.06, 0.42)], 0.018, 6)), { p: [0, H - 0.15, 0], color: 0x8a8a84, w: { streak: 0.4 } });
    k.at([0, H - 0.17, 0.5], [0.32, 0, 0], null, () => {
      // housing: rounded extruded profile, sun shield on top, lens with a ring
      const prof = G('cctvBody', () => {
        const s = new THREE.Shape();
        const w = 0.06, h = 0.05, r = 0.02;
        s.moveTo(-w + r, -h);
        s.lineTo(w - r, -h);
        s.quadraticCurveTo(w, -h, w, -h + r);
        s.lineTo(w, h - r);
        s.quadraticCurveTo(w, h, w - r, h);
        s.lineTo(-w + r, h);
        s.quadraticCurveTo(-w, h, -w, h - r);
        s.lineTo(-w, -h + r);
        s.quadraticCurveTo(-w, -h, -w + r, -h);
        return extrude(s, 0.26, 0.006, 4);
      });
      k.add(mat('plastic'), prof, { color: 0xd8d4c8, w: { grime: 0.5, streak: 0.6, vary: 0.2 } });
      k.add(mat('plastic'), G('cctvShield', () => bevelBox(0.15, 0.008, 0.32, 0.003, 0.05)), { p: [0, 0.062, 0.02], color: 0xcfcbbf, w: { grime: 0.6, streak: 0.4 }, deform: (p) => { p.y -= 0.02 * (p.x / 0.075) ** 2; } });
      k.add(mat('dark'), G('cctvLens', () => lathe([[0, 0], [0.034, 0], [0.036, 0.012], [0.03, 0.018], [0.012, 0.02], [0, 0.016]], 14).rotateX(Math.PI / 2)), { p: [0, 0, 0.135], color: 0x101214, w: false });
      k.add(glowMat('neon_red'), G('cctvLed', () => lathe([[0, 0], [0.004, 0], [0.004, 0.004], [0, 0.005]], 6).rotateX(Math.PI / 2)), { p: [0.042, -0.03, 0.135], color: 0xff2010, w: false });
    });
  });
}

/** Concrete culvert mouth in the ditch: headwall with chamfered edges, pipe running into the bank. */
function culvertMouth(k, o = {}) {
  const R = o.radius ?? 0.5, T = 0.09;
  k.at(o.p, o.r, null, () => {
    // pipe: ring profile (lathe) laid horizontally, running back into the bank (-Z)
    const pipe = G('culvertPipe:' + R, () => lathe([[R, 0], [R + T, 0], [R + T + 0.02, 0.03], [R + T + 0.02, 0.09], [R + T, 0.12], [R + T, 1.6], [R, 1.6], [R - 0.01, 0.06], [R, 0]], 24).rotateX(-Math.PI / 2));
    k.add(mat('concrete'), pipe, {
      p: [0, R + 0.06, 0.12], color: 0x8e8a80, w: { grime: 0.8, grimeH: 0.5, ground: -R, moss: 0.6, mossLow: 0.9, mossH: 0.5, streak: 0.7 },
      colorFn: (p, n, c) => { if (Math.hypot(p.x, p.y - R - 0.06) < R + 0.005) c.multiplyScalar(Math.max(0.08, 0.6 + p.z * 0.6)); }, // dark inside, deeper = darker
    });
    // headwall: slab with a round opening, chamfered (extruded shape with a hole)
    const wall = G('culvertWall:' + R, () => {
      const W = R * 2 + 1.1, H = R * 2 + 0.55;
      const s = new THREE.Shape();
      s.moveTo(-W / 2, 0);
      s.lineTo(W / 2, 0);
      s.lineTo(W / 2 - 0.05, H);
      s.lineTo(-W / 2 + 0.05, H);
      s.lineTo(-W / 2, 0);
      const hole = new THREE.Path();
      hole.absarc(0, R + 0.06, R + T * 0.5, 0, Math.PI * 2, true);
      s.holes.push(hole);
      return extrude(s, 0.22, 0.02, 24);
    });
    k.add(mat('concrete'), wall, { p: [0, 0, 0.1], color: 0x9a968c, jitter: 0.004, w: { grime: 0.8, grimeH: 0.7, ground: 0, moss: 0.7, mossLow: 1, mossH: 0.6, streak: 0.9 } });
    // splayed wing walls
    for (const sx of [-1, 1]) {
      const ww = G('culvertWing', () => {
        const s = new THREE.Shape();
        s.moveTo(0, 0);
        s.lineTo(1.0, 0);
        s.lineTo(1.0, 0.25);
        s.lineTo(0, R * 2 + 0.4);
        s.lineTo(0, 0);
        return extrude(s, 0.16, 0.015, 2);
      });
      k.add(mat('concrete'), ww, { p: [sx * (R + 0.62), 0, 0.2], r: [0, sx > 0 ? -Math.PI / 2 + 0.5 : -Math.PI / 2 - 0.5, 0], s: [sx, 1, 1], color: 0x928e84, w: { grime: 0.8, moss: 0.8, mossLow: 1, streak: 0.8 } });
    }
    // dark silt and standing water in the mouth
    k.add(texMat('culvertSilt', () => stainTex(o.seed ?? 3, '16,14,12'), { transparent: true, decal: true }), G('culvertSiltQ', () => quad(R * 2.6, 1.4)), { p: [0, 0.07, 0.6], r: [-Math.PI / 2, 0, 0], color: 0xffffff, uv: 'keep', w: false });
  });
}

/** Empty roadside stall (no vendor): plank counter, posts, corrugated roof, its bulb still burning. */
function emptyStall(k, group, out, o = {}) {
  const rng = makeRng((o.seed ?? 1) * 31 + 7);
  const W = 1.7, D = 0.75, Hc = 0.92, Hr = 2.15;
  // counter: horizontal planks on a frame (gaps between boards)
  for (let i = 0; i < 6; i++) {
    k.add(mat('wood'), G('stallPlank', () => bevelBox(W, 0.13, 0.025, 0.008, 0.2, 2)), { p: [0, 0.1 + i * 0.145, D / 2], r: [0, 0, (rng() - 0.5) * 0.01], color: 0x8a6a4a, jitter: 0.002, w: { grime: 0.6, grimeH: 0.4, streak: 0.5, moss: 0.3, mossLow: 0.5, vary: 0.4 } });
  }
  k.add(mat('wood'), G('stallTop', () => bevelBox(W + 0.1, 0.035, D + 0.12, 0.01, 0.2, 2)), { p: [0, Hc, 0], color: 0x7a5c40, w: { dust: 0.5, grime: 0.3, vary: 0.4 } });
  // posts and the roof (sagging corrugated sheet)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.add(mat('wood'), G('stallPost', () => bevelBox(0.06, Hr, 0.06, 0.01, 0.4, 2, { bottom: true })), { p: [sx * (W / 2 + 0.02), 0, sz * (D / 2 + 0.02)], r: [0, 0, (rng() - 0.5) * 0.03], color: 0x6a5038, w: { grime: 0.6, grimeH: 0.5, mossLow: 0.6 } });
  }
  k.add(mat('corrugated'), G('stallRoof', () => bevelBox(W + 0.6, 0.012, D + 0.9, 0.004, 0.08, 1)), {
    p: [0, Hr + 0.05, 0.12], r: [0.12, 0, 0], color: 0x8a7a68, w: { streak: 0.9, grime: 0.4, moss: 0.4 },
    deform: (p) => { p.y -= 0.05 * (1 - (p.x / (W / 2 + 0.3)) ** 2); },
  });
  // a faded photo price board, a few empty jars, a tipped stool
  k.add(signMat('noodle_menu', { variant: 'board' }), G('stallBoard', () => quad(0.42, 0.58, 2, 2)), { p: [-W / 2 + 0.3, Hc + 0.36, -D / 2 + 0.05], r: [0, 0, 0.04], color: 0xb8b0a0, uv: 'keep', w: { vary: 0.4, grime: 0.3 } });
  for (let i = 0; i < 3; i++) bottle(k, { kind: 'water', p: [0.2 + i * 0.16, Hc + 0.02, 0.05], color: 0xc8d8d0 });
  plasticStool(k, { p: [0.6, 0.0, 0.85], r: [Math.PI / 2 - 0.15, 0.4, 0], color: PAL.chairRed });
  useAsset(k, 'cardboard_box_01', { p: [-0.5, 0, -0.65], r: 0.4 }, { fit: { h: 0.32 }, w: { grime: 0.4, dust: 0.4 } });
  // the bulb, still on
  const bx = 0.15, by = Hr - 0.02, L = 0.35;
  hangingBulb(k, { p: [bx, by, 0.1], len: L });
  const a = anchor(group, 'lamp', bx, by - L - 0.09, 0.1);
  out.lampAnchor = a;
  out.lights.push(lightSpec('bulb', a, { intensity: 4.5 }));
}

/**
 * kind: 'abandoned_shrine' | 'bike_wreck' | 'school_chairs' | 'broken_shelter' | 'cctv_warning'
 *       | 'culvert' | 'empty_stall'.  opts {seed, n (chairs)}
 */
export function createRoadScare(kind, opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 131 + kind.length * 7);
  const group = new THREE.Group();
  group.name = 'scare_' + kind;
  const out = { object: group, colliders: [], lights: [], lampControllers: [] };
  const k = new Kit(seed, { grime: 0.55, grimeH: 0.5, mossLow: 0.6, mossH: 0.4, streak: 0.4, vary: 0.25 });
  switch (kind) {
    case 'abandoned_shrine': {
      const sh = createSpiritHouse({ style: seed % 3 === 0 ? 'chinese' : 'thai', seed, age: 1, offerings: false, size: 0.85 + (seed % 3) * 0.06 });
      group.add(sh.object);
      out.colliders.push(...(sh.colliders || []));
      const off = sh.offeringAnchor ? sh.offeringAnchor.position : V(0, 1.0, 0.2);
      // toppled figurines and spilt offerings on the ground in front, dead garlands
      zebras(k, { p: [0.42, 0.045, 0.45], r: [0, 0.6, Math.PI / 2], n: 1, size: 1.1, seed: seed + 1 });
      zebras(k, { p: [-0.3, 0.04, 0.55], r: [Math.PI / 2, 1.9, 0], n: 1, size: 0.9, seed: seed + 2 });
      dancers(k, { p: [0.15, 0.03, 0.7], r: [Math.PI / 2, 0.4, 0], n: 1, size: 1.1 });
      bottle(k, { kind: 'soda', p: [-0.15, 0.03, 0.38], r: [Math.PI / 2, 0.8, 0] });
      incensePot(k, { p: [0.05, 0.06, 0.32], r: [0.2, 0, 1.3] });
      garland(k, { p: [off.x, off.y + 0.02, off.z + 0.1], len: 0.26, color: DEAD_FLOWERS, accent: 0x6a4a2a, seed: seed + 3 });
      garland(k, { p: [-0.2, 0.012, 0.6], r: [-Math.PI / 2 + 0.15, 0, 0.7], len: 0.22, color: DEAD_FLOWERS, accent: 0x5a3a24, seed: seed + 4 });
      break;
    }
    case 'bike_wreck': {
      k.setWeather({ grime: 0.9, grimeH: 0.5, streak: 0.9, streakColor: 0x6a3418, vary: 0.4, cavity: 0.7 });
      k.at([0, 0, 0], [0, 0.4 + rng() * 0.4, 0], null, () => brokenScooter(k, { fallen: true, seed, color: 0x2b2420 }));
      k.setWeather({ grime: 0.4, vary: 0.25 });
      // scorched ground under the wreck
      k.add(texMat('scorch' + (seed % 3), () => stainTex(seed + 11, '10,9,8'), { transparent: true, decal: true }), G('scorchQ', () => quad(2.6, 2.0)), { p: [0, 0.012, 0], r: [-Math.PI / 2, 0, rng() * 6], color: 0xffffff, uv: 'keep', w: false });
      // the memorial: helmet on the ground, fresh jasmine and marigold, candles
      helmet(k, { p: [0.95, 0.0, 0.75], r: [0, 2.4, 0] });
      garland(k, { p: [0.95, 0.27, 0.75], r: [0, 0.3, 0], len: 0.2, color: PAL.jasmine, accent: PAL.marigold, seed: seed + 5 });
      garland(k, { p: [0.55, 0.015, 0.95], r: [-Math.PI / 2 + 0.1, 0, 1.1], len: 0.24, color: PAL.marigold, accent: PAL.rose, seed: seed + 6 });
      wreath(k, { p: [1.45, 0, 0.2], r: [0, -0.5, 0], rad: 0.26, seed: seed + 7 });
      for (let i = 0; i < 3; i++) candle(k, { p: [0.7 + i * 0.09, 0, 1.0 - i * 0.05], h: 0.08 + i * 0.03 });
      const a = anchor(group, 'candle', 0.79, 0.14, 0.95);
      out.lights.push(lightSpec('candle', a, { intensity: 0.5 }));
      out.helmetAnchor = anchor(group, 'helmet', 0.95, 0.15, 0.75);
      out.colliders.push({ x: 0, z: 0, r: 0.9 });
      break;
    }
    case 'school_chairs': {
      // a row of old school chairs on the verge, all facing the road; one has fallen over
      const n = opts.n ?? 5;
      const fall = Math.floor(rng() * n);
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.62 + (rng() - 0.5) * 0.06;
        if (i === fall) schoolChair(k, { p: [x, 0.2, 0.15], r: [-Math.PI / 2 + 0.25, rng() - 0.5, 0], color: [0x4a6a8a, 0x8a3a2a, 0x3a6a4a][i % 3] });
        else schoolChair(k, { p: [x, 0, 0], r: (rng() - 0.5) * 0.12, color: [0x4a6a8a, 0x8a3a2a, 0x3a6a4a][i % 3] });
      }
      out.colliders.push({ x: 0, z: 0, hx: n * 0.32, hz: 0.3 });
      break;
    }
    case 'broken_shelter': {
      const bs = createBusStop({ seed });
      // knocked askew by a truck long ago: the shelter leans, a roof sheet lies in the grass
      bs.object.rotation.set(0.02, 0, 0.045);
      group.add(bs.object);
      out.colliders.push(...(bs.colliders || []));
      k.add(mat('corrugated'), G('shelterSheet', () => bevelBox(1.5, 0.01, 0.9, 0.003, 0.08, 1)), {
        p: [2.3, 0.18, -0.4], r: [0.25, 0.7, 0.35], color: 0x7a7a74, w: { streak: 0.9, grime: 0.6, moss: 0.5 },
        deform: (p) => { p.y += 0.06 * Math.sin(p.x * 2.6); },
      });
      // a single sandal under the bench
      sandal(k, { p: [0.35, 0.12, 0.25], r: [0, 2.1, 0], color: 0x2a4a7a, strap: 0x6a1a14 });
      out.seats = bs.seats;
      out.waitSpot = bs.waitSpot;
      break;
    }
    case 'cctv_warning': {
      const sign = createSignPost('warning_sign', { th: 'ระวัง! จุดเกิดอุบัติเหตุบ่อย', en: 'ACCIDENT BLACK SPOT', seed, age: 0.8 });
      group.add(sign.object);
      out.colliders.push(...(sign.colliders || []));
      cctvCamera(k, { p: [1.4, 0, -0.2], r: 0.15, h: 3.7 });
      out.colliders.push({ x: 1.4, z: -0.2, r: 0.12 });
      out.signAnchor = sign.signAnchor;
      break;
    }
    case 'culvert': {
      culvertMouth(k, { seed, radius: 0.48 + (seed % 3) * 0.06 });
      litter(k, 0, 0.9, 0.9, { n: 4, seed, y: 0.06 });
      out.colliders.push({ x: 0, z: 0.2, hx: 1.2, hz: 0.3 });
      break;
    }
    case 'empty_stall': {
      emptyStall(k, group, out, { seed });
      out.colliders.push({ x: 0, z: 0, hx: 0.95, hz: 0.5 });
      break;
    }
    default:
      throw new Error('props: unknown road scare ' + kind);
  }
  group.add(k.build({ name: 'scare_' + kind, detailDistance: 45 }));
  return out;
}

export const ROAD_SCARE_KINDS = ['abandoned_shrine', 'bike_wreck', 'school_chairs', 'broken_shelter', 'cctv_warning', 'culvert', 'empty_stall'];
