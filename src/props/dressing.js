// Small roadside dressing (createDressing) + the crashed old step-through motorbike.
import * as THREE from 'three';
import { Kit, bevelBox, bbox, lathe, cyl, tube, torus, sphere, quad, smoothPath, blob, makeRng, noise } from './lib/kit.js';
import { mat, glowMat } from './lib/materials.js';
import { lightSpec } from './lib/lights.js';
import {
  G, PAL, plasticChair, plasticStool, crate, garland, offeringTray, bottle, zebras, dancers, waterJar, tire, sandbag, cone, trashBag,
  candle, incensePot, fruitPlate, glassWater, oilDrum, wreath, helmet, shoes, lantern, coil, can,
} from './lib/small.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Old step-through motorbike (crashed). Origin under the bike centre, front toward −Z.
 * o {fallen=true, seed, color}
 */
export function brokenScooter(k, o = {}) {
  const rng = makeRng((o.seed ?? 1) * 17 + 5);
  const body = o.color ?? [0x8a2a24, 0x2a4a7a, 0x3a3a3a][Math.floor(rng() * 3)];
  const R = 0.29;
  const fallen = o.fallen !== false;
  k.push(fallen ? [0, 0.2, 0] : [0, 0, 0], fallen ? [0, 0, Math.PI / 2 - 0.12] : null);
  k.push(fallen ? [-0.0, -R, 0] : null);
  const w = { grime: 0.5, grimeH: 0.4, ground: fallen ? -1 : 0, streak: 0.5, dust: 0.4, vary: 0.25 };
  // wheels: tyre + rim + hub + spokes
  const wheel = (z, turned) => {
    k.at([0, R, z], [0, turned, 0], null, () => {
      k.add(mat('rubber'), G('btire', () => torus(R - 0.03, 0.04, 6, 24).rotateY(Math.PI / 2)), { color: 0x1c1a18, w: { dust: 0.5 } });
      k.add(mat('galv'), G('brim', () => torus(R - 0.065, 0.012, 4, 24).rotateY(Math.PI / 2)), { color: 0x9a9a90, w: { streak: 0.6 } });
      k.add(mat('galv'), G('bhub', () => cyl(0.07, 0.07, 0.1, 10, 0.01).rotateZ(Math.PI / 2).translate(0.05, 0, 0)), { color: 0x7a7a70, w: false });
      for (let i = 0; i < 12; i++) k.add(mat('galv'), G('bspoke', () => cyl(0.0025, 0.0025, R - 0.08, 3, 0).translate(0, (R - 0.08) / 2, 0)), { r: [(i / 12) * Math.PI * 2, 0, 0], color: 0x8a8a84, w: false });
    });
  };
  wheel(-0.62, fallen ? 0.6 : 0.1);
  wheel(0.6, 0);
  // backbone frame (step-through curve)
  k.add(mat('metal'), tube(smoothPath([V(0, 0.95, -0.5), V(0, 0.55, -0.32), V(0, 0.36, 0.0), V(0, 0.42, 0.28), V(0, 0.62, 0.45)], 16), 0.035, 7), { color: body, w });
  // front fork + steering column + handlebars (bent)
  k.at([0, 0, -0.62], [0, fallen ? 0.6 : 0.1, 0], null, () => {
    for (const s of [-1, 1]) k.add(mat('galv'), tube([V(s * 0.07, R, 0), V(s * 0.07, 0.9, 0.12)], 0.018, 6), { color: 0x9a9a92, w: { streak: 0.6 } });
    k.add(mat('metal'), tube([V(0, 0.88, 0.12), V(0, 1.05, 0.16)], 0.03, 6), { color: body, w });
    k.add(mat('galv'), tube(smoothPath([V(-0.36, 1.12, 0.22), V(-0.18, 1.06, 0.18), V(0, 1.05, 0.16), V(0.18, 1.0, 0.12), V(0.34, 0.92, 0.02)], 10), 0.012, 5), { color: 0x8a8a84, w: false });
    for (const s of [-1, 1]) k.add(mat('rubber'), G('grip', () => cyl(0.018, 0.018, 0.12, 6, 0.004).rotateZ(Math.PI / 2)), { p: [s * 0.36, s < 0 ? 1.12 : 0.92, s < 0 ? 0.22 : 0.02], color: 0x1a1a1a, w: false });
    // headlight shell (lens smashed -> dark) + front fender
    k.add(mat('metal'), G('hlshell', () => sphere(0.09, 10, 8).scale(1, 0.9, 1.2)), { p: [0, 1.0, 0.02], color: body, w });
    k.add(mat('dark'), G('hllens', () => new THREE.CircleGeometry(0.075, 12)), { p: [0, 1.0, -0.09], r: [0, Math.PI, 0], color: 0x1a1612, w: false });
    k.add(mat('metal'), G('ffender', () => new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.12, 16, 1, true, -0.4, 2.0).rotateZ(Math.PI / 2)), { p: [0, R, 0], color: body, w });
  });
  // leg shield (cracked plastic panel)
  k.add(mat('plastic'), bevelBox(0.42, 0.55, 0.03, 0.02, 0.1), { p: [0, 0.68, -0.42], r: [0.35, 0, 0.0], color: body, w, deform: (p) => { p.z += (p.x * p.x) * 0.6; }, colorFn: (p, n, c, lp) => { if (Math.abs(lp.x - lp.y * 0.4 - 0.03) < 0.006) c.multiplyScalar(0.2); } });
  // engine + swingarm + exhaust
  k.add(mat('rust'), G('bengine', () => bevelBox(0.22, 0.24, 0.36, 0.04, 0.1)), { p: [0, 0.32, 0.12], color: 0x5a5450, w: { streak: 0.8, grime: 0.4 } });
  k.add(mat('metal'), tube([V(0.06, 0.38, 0.12), V(0.08, R, 0.6)], 0.025, 6), { color: 0x2a2a2a, w });
  k.add(mat('galv'), tube(smoothPath([V(-0.05, 0.3, -0.05), V(-0.12, 0.2, 0.15), V(-0.14, 0.25, 0.5), V(-0.13, 0.32, 0.72)], 12), 0.03, 7), { color: 0x8a8070, w: { streak: 0.9, streakColor: 0x6a3a18 } });
  // body cowl + seat + rack + tail
  k.add(mat('plastic'), G('cowl', () => sphere(0.25, 12, 8).scale(0.75, 0.55, 1.3)), { p: [0, 0.62, 0.42], color: body, w, jitter: 0.008, jitterFreq: 10 });
  k.add(mat('leather'), G('bseat', () => bevelBox(0.26, 0.09, 0.55, 0.04, 0.1, 2)), { p: [0, 0.8, 0.35], color: 0x1a1816, w: { dust: 0.6 }, colorFn: (p, n, c, lp) => { if (lp.z > 0.1 && Math.abs(lp.x) < 0.08 && n.y > 0.5) c.lerp(_foam, 0.85); } });
  k.add(mat('galv'), tube([V(-0.12, 0.85, 0.62), V(-0.12, 0.85, 0.85), V(0.12, 0.85, 0.85), V(0.12, 0.85, 0.62)], 0.01, 4), { color: 0x7a7a70, w: false });
  k.add(mat('metal'), G('tplate', () => bbox(0.2, 0.12, 0.01, 0.004, 0.05)), { p: [0, 0.55, 0.86], r: [0.3, 0, 0], color: 0xd8d0b0, w: { streak: 0.6 } });
  // a rear-view mirror snapped off, lying nearby
  k.add(mat('galv'), tube([V(0.25, 0.02, -0.9), V(0.4, 0.04, -1.0)], 0.006, 4), { color: 0x8a8a84, w: false });
  k.pop();
  k.pop();
  // spilt engine oil patch (dark) if fallen
  if (fallen) k.add(mat('dark'), G('oilpatch', () => blob(0.35, 0.25, 7, 14, 0.4)), { p: [0.2, 0.006, 0.1], color: 0x0a0806, w: false });
}
const _foam = new THREE.Color(0xc8b080);

/**
 * Small roadside dressing.
 * kind: 'plastic_chair'|'crate'|'garland'|'offering_tray'|'red_soda_bottles'|'zebra_statues'|
 *   'thai_dancer_figurine'|'broken_scooter'|'water_jar'|'tire'|'sandbags'|'cone'|'trash_bag'|'shrine_table'
 *   + extras: 'oil_drum'|'plastic_stool'|'wreath'|'helmet'|'shoes'|'candles'|'incense_pot'|'fruit_plate'|
 *   'red_lantern'|'cable_coil'|'cans'
 * opts {seed, n, color, fallen, ...}. 'garland' and 'red_lantern' hang from their origin.
 * -> { object, colliders, lights? }
 */
export function createDressing(kind, opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 29 + kind.length * 7);
  const group = new THREE.Group();
  group.name = 'dressing_' + kind;
  const k = new Kit(seed, { grime: 0.45, grimeH: 0.3, mossLow: 0.45, mossH: 0.2, vary: 0.2, streak: 0.3 });
  const out = { object: group, colliders: [], lights: [] };
  switch (kind) {
    case 'plastic_chair':
      plasticChair(k, { color: opts.color ?? [PAL.chairRed, PAL.chairBlue, PAL.chairWhite, PAL.chairGreen][seed % 4], dust: 0.6 });
      out.colliders.push({ x: 0, z: 0, r: 0.3 });
      break;
    case 'plastic_stool':
      plasticStool(k, { color: opts.color ?? (seed % 2 ? PAL.chairRed : PAL.chairBlue) });
      out.colliders.push({ x: 0, z: 0, r: 0.2 });
      break;
    case 'crate': {
      const n = opts.n ?? 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) crate(k, { p: [(rng() - 0.5) * 0.1, i * 0.3, (rng() - 0.5) * 0.1], r: (rng() - 0.5) * 0.4, kind: opts.wood ? 'wood' : rng() < 0.6 ? 'plastic' : 'wood', color: [0x2a6a3a, 0xa82a1a, 0x2a4a8a, 0xd8b030][Math.floor(rng() * 4)] });
      out.colliders.push({ x: 0, z: 0, hx: 0.28, hz: 0.2, yaw: 0 });
      break;
    }
    case 'garland':
      garland(k, { len: opts.len ?? 0.22, color: opts.color ?? PAL.jasmine, accent: opts.accent ?? PAL.marigold });
      break;
    case 'offering_tray':
      offeringTray(k, {});
      break;
    case 'red_soda_bottles': {
      const n = opts.n ?? 6 + Math.floor(rng() * 7);
      for (let i = 0; i < n; i++) {
        const fallen = rng() < 0.15;
        bottle(k, { p: [(rng() - 0.5) * 0.5, fallen ? 0.031 : 0, (rng() - 0.5) * 0.35], r: fallen ? [Math.PI / 2, rng() * 6, 0] : rng() * 6, straw: !fallen && rng() < 0.85, strawYaw: rng() * 6, color: rng() < 0.85 ? PAL.sodaRed : PAL.sodaGreen });
      }
      break;
    }
    case 'zebra_statues':
      zebras(k, { n: opts.n ?? 3 + Math.floor(rng() * 4), spread: 0.8, size: opts.size ?? 1.3, seed, moss: opts.moss ?? 0.3 });
      out.colliders.push({ x: 0, z: 0, r: 0.4 });
      break;
    case 'thai_dancer_figurine':
      dancers(k, { n: opts.n ?? 2 + Math.floor(rng() * 2), size: opts.size ?? 1.4, gap: 0.12 });
      break;
    case 'broken_scooter':
      brokenScooter(k, { seed, fallen: opts.fallen !== false, color: opts.color });
      out.colliders.push({ x: 0, z: 0, hx: 0.5, hz: 0.95, yaw: 0 });
      break;
    case 'water_jar':
      waterJar(k, { size: opts.size ?? 1, lid: opts.lid ?? rng() < 0.5, moss: 0.5 });
      out.colliders.push({ x: 0, z: 0, r: 0.38 * (opts.size ?? 1) });
      break;
    case 'tire': {
      const n = opts.n ?? 1 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) tire(k, { p: [(rng() - 0.5) * 0.08, i * 0.19, (rng() - 0.5) * 0.08], r: rng() * 6 });
      if (opts.leaning !== false && rng() < 0.5) tire(k, { p: [0.55, 0, 0.1], upright: true, r: [0.25, 1.2, 0] });
      out.colliders.push({ x: 0, z: 0, r: 0.38 });
      break;
    }
    case 'sandbags': {
      const cols = opts.n ?? 3;
      for (let row = 0; row < 3; row++) for (let i = 0; i < cols - (row === 2 ? 1 : 0); i++) sandbag(k, { p: [(i - (cols - 1) / 2) * 0.56 + (row % 2) * 0.28, row * 0.13, (rng() - 0.5) * 0.04], r: (rng() - 0.5) * 0.15 });
      out.colliders.push({ x: 0, z: 0, hx: cols * 0.28, hz: 0.18, yaw: 0 });
      break;
    }
    case 'cone': {
      const n = opts.n ?? 1;
      for (let i = 0; i < n; i++) {
        const fallen = rng() < 0.25;
        cone(k, { p: [i * 0.9, fallen ? 0.18 : 0, 0], r: fallen ? [Math.PI / 2 - 0.3, rng() * 6, 0] : null });
      }
      out.colliders.push({ x: 0, z: 0, r: 0.2 });
      break;
    }
    case 'trash_bag': {
      const n = opts.n ?? 2 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) trashBag(k, { p: [(rng() - 0.5) * 0.7, 0, (rng() - 0.5) * 0.5], s: 0.6 + rng() * 0.5, r: rng() * 6, color: rng() < 0.75 ? 0x1a1c1c : 0x2a4a3a });
      for (let i = 0; i < 3; i++) can(k, { p: [(rng() - 0.5) * 1.1, 0.03, 0.3 + rng() * 0.3], r: [Math.PI / 2, rng() * 6, 0], color: [0xa02a1a, 0x2a5aa0, 0xc8b040][i] });
      out.colliders.push({ x: 0, z: 0, r: 0.4 });
      break;
    }
    case 'shrine_table': {
      // low lacquered offering table (โต๊ะหมู่) with offerings
      k.add(mat('lacquer'), bbox(0.9, 0.04, 0.5, 0.008, 0.2), { p: [0, 0.5, 0], color: 0x8a1a12, w: { dust: 0.3 } });
      k.add(mat('gold'), bbox(0.86, 0.12, 0.02, 0.004, 0.2), { p: [0, 0.38, 0.24], color: 0xd8a848, w: false });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(mat('lacquer'), G('stleg', () => bbox(0.05, 0.5, 0.05, 0.006, 0.2)), { p: [sx * 0.4, 0, sz * 0.2], color: 0x7a1610, w: { grime: 0.5 } });
      k.details(() => {
        incensePot(k, { p: [0, 0.54, 0.05], rad: 0.06, metal: true, color: 0xb08a40, sticks: 12, seed });
        for (const s of [-1, 1]) {
          candle(k, { p: [s * 0.32, 0.54, 0.12], h: 0.12, color: 0xb81a14 });
          fruitPlate(k, { p: [s * 0.18, 0.54, -0.08], kind: s < 0 ? 'banana' : 'orange', s: 0.7, seed: seed + s });
        }
        for (let i = 0; i < 4; i++) bottle(k, { p: [-0.3 + i * 0.2, 0.54, -0.18], straw: true, color: PAL.sodaRed, s: 0.8 });
        garland(k, { p: [0.0, 0.5, 0.26], len: 0.15 });
        zebras(k, { p: [0.0, 0, 0.45], n: 2, spread: 0.5, size: 1.1, seed });
      });
      for (const s of [-1, 1]) out.lights.push(lightSpec('candle', anchorAt(group, s * 0.32, 0.7, 0.12), { intensity: 0.5 }));
      out.colliders.push({ x: 0, z: 0, hx: 0.45, hz: 0.25, yaw: 0 });
      break;
    }
    case 'oil_drum':
      oilDrum(k, { rusty: opts.rusty ?? rng() < 0.6, color: opts.color });
      out.colliders.push({ x: 0, z: 0, r: 0.32 });
      break;
    case 'wreath':
      wreath(k, { seed, faded: opts.faded ?? 0.6 });
      out.colliders.push({ x: 0, z: 0, r: 0.4 });
      break;
    case 'helmet':
      helmet(k, { cracked: opts.cracked ?? true });
      break;
    case 'shoes':
      shoes(k, { messy: true });
      break;
    case 'candles':
      for (let i = 0; i < (opts.n ?? 5); i++) candle(k, { p: [(rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.2], h: 0.05 + rng() * 0.12, color: rng() < 0.5 ? 0xe8e0c8 : 0xb81a14 });
      out.lights.push(lightSpec('candle', anchorAt(group, 0, 0.2, 0)));
      break;
    case 'incense_pot':
      incensePot(k, { rad: opts.rad ?? 0.09, sticks: 20, seed });
      break;
    case 'fruit_plate':
      fruitPlate(k, { kind: opts.fruit ?? 'orange', seed });
      break;
    case 'red_lantern':
      lantern(k, { s: opts.size ?? 1.2 });
      out.lights.push(lightSpec('lantern', anchorAt(group, 0, -0.25, 0)));
      break;
    case 'cable_coil':
      coil(k, { rad: 0.35, thick: 0.012, loops: 7, flat: true, seed });
      break;
    case 'cans':
      for (let i = 0; i < (opts.n ?? 5); i++) can(k, { p: [(rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.4], r: rng() < 0.4 ? [Math.PI / 2, rng() * 6, 0] : rng() * 6, color: [0xa02a1a, 0x2a5aa0, 0xc8b040, 0x2a8a3a][i % 4], rust: rng() < 0.5 });
      break;
    default:
      crate(k, {});
  }
  group.add(k.build({ name: 'dressing_' + kind, detailDistance: 40 }));
  return out;
}
function anchorAt(parent, x, y, z) {
  const a = new THREE.Object3D();
  a.position.set(x, y, z);
  parent.add(a);
  return a;
}
