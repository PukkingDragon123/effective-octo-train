// Weathered Buddha statues and the abandoned forest temple (วัดป่าร้าง).
import * as THREE from 'three';
import { Kit, bevelBox, bbox, lathe, cyl, tube, torus, sphere, quad, extrude, smoothPath, blob, makeRng, noise } from './lib/kit.js';
import { mat, glowMat, signMat } from './lib/materials.js';
import { lightSpec } from './lib/lights.js';
import { G, PAL, candle, incensePot, garland, flowerString, bottle } from './lib/small.js';
import { buddhaSeatedGeo, buddhaStandingGeo, nagaGeo } from './lib/figures.js';
import { thaiRoofTier } from './shrines.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function anchor(parent, name, x, y, z, yaw = 0) {
  const a = new THREE.Object3D();
  a.name = name;
  a.position.set(x, y, z);
  a.rotation.y = yaw;
  parent.add(a);
  return a;
}

/** Lotus pedestal (origin bottom centre). r = top radius. */
function lotusBase(k, r, h, o = {}) {
  const prof = [[0, 0], [r * 1.15, 0], [r * 1.15, h * 0.18], [r * 1.0, h * 0.22], [r * 0.9, h * 0.45], [r * 1.05, h * 0.62], [r * 1.12, h * 0.85], [r * 1.0, h], [0, h]];
  k.add(mat(o.mat ?? 'stone'), lathe(prof, 28), {
    color: o.color ?? 0xa8a090, w: o.w,
    // petal ridges on the upper and lower rings
    deform: (p) => {
      const a = Math.atan2(p.z, p.x);
      const ring = p.y > h * 0.5 ? 1 : p.y > h * 0.2 && p.y < h * 0.45 ? 0.6 : 0;
      if (ring) {
        const pet = Math.pow(Math.abs(Math.cos(a * 8)), 0.6) * 0.06 * r * ring;
        const f = 1 + pet / Math.max(0.01, Math.hypot(p.x, p.z));
        p.x *= f;
        p.z *= f;
      }
    },
  });
}

/** Saffron cloth sash draped over the left shoulder of a seated Buddha (unit space). */
function saffronSash(k) {
  const pts = smoothPath([V(-0.2, 0.52, -0.02), V(-0.05, 0.46, 0.12), V(0.12, 0.33, 0.13), V(0.2, 0.22, 0.08), V(0.17, 0.12, -0.05), V(0.0, 0.2, -0.14), V(-0.18, 0.45, -0.08), V(-0.2, 0.52, -0.02)], 30);
  k.add(mat('cloth_static'), tube(pts, 0.022, 5), { color: 0xa8521a, w: { grime: 0.45, grimeH: 0.4, vary: 0.3 }, jitter: 0.004, jitterFreq: 40 });
}

/**
 * Weathered Buddha statue. opts {pose:'seated'|'standing', size=1 (seated ≈1.7 m tall incl. base),
 *   seed, broken=false (snapped right hand, lying at the base), moss=0.8, offerings=true, sash=true}
 * -> { object, headAnchor, offeringAnchor, candleAnchors, lights, colliders }
 */
export function createBuddhaStatue(opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 47 + 3);
  const pose = opts.pose ?? 'seated';
  const S = opts.size ?? 1;
  const mossA = opts.moss ?? 0.8;
  const group = new THREE.Group();
  group.name = 'buddha_' + pose;
  const k = new Kit(seed, { grime: 0.5, grimeH: 0.6, mossLow: 0.8 * mossA, mossH: 0.7, moss: 0.75 * mossA, streak: 0.8, streakColor: 0x2a2a20, vary: 0.25 });
  const out = { object: group, candleAnchors: [], lights: [], colliders: [] };
  k.push(null, null, S);
  // square plinth + lotus base
  k.add(mat('stone'), bbox(1.25, 0.32, 1.0, 0.03, 0.3), { color: 0x8a8476, jitter: 0.01, jitterFreq: 4, w: { mossLow: 1, mossH: 0.35 } });
  if (rng() < 0.7 || opts.broken) k.add(mat('stone'), G('chip', () => bevelBox(0.25, 0.14, 0.18, 0.03, 0.1)), { p: [0.66, 0.06, 0.48], r: [0.3, 0.5, 0.2], color: 0x8a8476, jitter: 0.02, jitterFreq: 10 }); // broken-off corner
  let top;
  if (pose === 'standing') {
    k.push([0, 0.32, 0]);
    lotusBase(k, 0.3, 0.22, { color: 0xa09888 });
    k.add(mat('stone'), buddhaStandingGeo(!!opts.broken), { p: [0, 0.22, 0], s: 1.85, color: 0xb8b0a0, w: { ground: -0.32 } });
    k.pop();
    top = 0.32 + 0.22 + 1.85;
  } else {
    k.push([0, 0.32, 0]);
    lotusBase(k, 0.48, 0.28, { color: 0xa09888 });
    k.add(mat('stone'), buddhaSeatedGeo(!!opts.broken), { p: [0, 0.26, -0.02], s: 1.12, color: 0xb8b0a0, w: { ground: -0.32 } });
    if (opts.sash !== false) k.at([0, 0.26, -0.02], null, 1.12, () => saffronSash(k));
    k.pop();
    top = 0.32 + 0.26 + 1.12;
  }
  // the snapped-off hand lying at the base
  if (opts.broken) k.add(mat('stone'), G('brokenhand', () => sphere(0.06, 8, 6).scale(0.8, 1.3, 0.6)), { p: [0.45, 0.35, 0.42], r: [1.2, 0.4, 0.3], color: 0xa8a090, jitter: 0.01, jitterFreq: 30 });
  // offerings at the plinth: old garlands, burnt candles, a soda bottle, dried flowers
  if (opts.offerings !== false) k.details(() => {
    for (const s of [-1, 1]) {
      candle(k, { p: [s * 0.35, 0.32, 0.4], h: 0.05 + rng() * 0.06, color: 0xd8d0b8, flame: rng() < 0.5 });
      garland(k, { p: [s * 0.2, 0.33, 0.42], r: [-Math.PI / 2 + 0.15, rng() * 3, 0], len: 0.14, color: 0x9a8a6a, accent: 0x7a5a30, rose: 0x4a1a14 });
    }
    incensePot(k, { p: [0, 0.32, 0.38], rad: 0.06, color: 0x6a5a4a, sticks: 10, burnt: 0.95, lit: 0.1, seed });
    bottle(k, { p: [0.5, 0.0, 0.62], straw: true, color: PAL.sodaRed });
  });
  k.pop();
  group.add(k.build({ name: 'buddha', detailDistance: 30 }));
  out.headAnchor = anchor(group, 'head', 0, (top - 0.18) * S, 0.05 * S);
  out.offeringAnchor = anchor(group, 'offering', 0, 0.33 * S, 0.4 * S);
  for (const s of [-1, 1]) out.candleAnchors.push(anchor(group, 'bcandle' + s, s * 0.35 * S, 0.45 * S, 0.4 * S));
  out.colliders.push({ x: 0, z: 0, hx: 0.65 * S, hz: 0.52 * S, yaw: 0 });
  return out;
}

// ---------------------------------------------------------------------------
// Forest temple
// ---------------------------------------------------------------------------
/** Brick/laterite wall segment with a jagged crumbled top (origin bottom centre, along X). */
function ruinedWall(k, len, h, th, rng, o = {}) {
  const seg = 0.4;
  const n = Math.max(1, Math.round(len / seg));
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * (len / n);
    const hh = h * (0.45 + 0.55 * Math.abs(noise.noise2D(x * 0.5 + (o.seed ?? 0), 3.1))) + (rng() - 0.5) * 0.15;
    k.add(mat('brick'), G(`wseg:${(len / n).toFixed(2)}:${hh.toFixed(1)}:${th}`, () => bbox(len / n + 0.01, Math.max(0.2, Math.round(hh * 10) / 10), th, 0.02, [0.3, 0.25, 0.3])), {
      p: [x, 0, (rng() - 0.5) * 0.02], color: o.color ?? 0x8a5a40, jitter: 0.015, jitterFreq: 6,
      w: { mossLow: 0.9, mossH: 0.8, moss: 0.9, streak: 0.6, grime: 0.5 },
      colorFn: (p, n2, c, lp) => { if (Math.abs(n2.y) < 0.5 && (Math.abs(Math.sin(lp.y * Math.PI / 0.09)) < 0.12 || Math.abs(Math.sin((lp.x + Math.floor(lp.y / 0.09) * 0.11) * Math.PI / 0.22)) < 0.08)) c.multiplyScalar(0.6); },
    });
  }
}

/** Sema boundary stone (leaf-shaped slab on a little base). */
function semaStone(k, p, yaw, tilt) {
  k.at(p, [tilt, yaw, tilt * 0.5, 'YXZ'], null, () => {
    k.add(mat('stone'), G('semabase', () => bbox(0.45, 0.2, 0.3, 0.03, 0.2)), { color: 0x7a7468, w: { mossLow: 1, mossH: 0.3 } });
    const sh = new THREE.Shape();
    sh.moveTo(-0.2, 0);
    sh.quadraticCurveTo(-0.24, 0.35, 0, 0.75);
    sh.quadraticCurveTo(0.24, 0.35, 0.2, 0);
    sh.closePath();
    k.add(mat('stone'), G('sema', () => extrude(sh, 0.09, 0.02)), { p: [0, 0.2, 0], color: 0x9a9284, jitter: 0.006, jitterFreq: 12, w: { moss: 0.9, mossLow: 0.6, mossH: 0.5, streak: 0.6 } });
  });
}

/**
 * Abandoned forest temple: naga stairs up from the road, ruined gate, broken walls, a big
 * seated Buddha in a roofless hall, a bell, sema stones, overgrowth.
 * opts {seed, platformY=1.2} -> { object, gateAnchor, waitSpot, bellAnchor, buddhaAnchor,
 *   candleAnchors, lights, colliders, walkSurfaces [{x,z,hx,hz,yaw,y} | {ramp:true, y0,y1,...}] }
 */
export function createForestTemple(opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 97 + 13);
  const group = new THREE.Group();
  group.name = 'forestTemple';
  const k = new Kit(seed, { grime: 0.5, grimeH: 0.6, mossLow: 0.85, mossH: 0.8, moss: 0.8, streak: 0.7, streakColor: 0x2a281e, vary: 0.25 });
  const out = { object: group, candleAnchors: [], lights: [], colliders: [] };
  const PY = opts.platformY ?? 1.2;
  const stairZ0 = -0.6, stairLen = 3.6, stairW = 2.4;
  const nSteps = 8;
  // ---- stairs + naga balustrades ------------------------------------------------------------
  for (let i = 0; i < nSteps; i++) {
    const y = ((i + 1) / nSteps) * PY;
    const z = stairZ0 - (i / nSteps) * stairLen;
    k.add(mat('stone'), G(`step:${y.toFixed(2)}`, () => bbox(stairW, y, stairLen / nSteps + 0.02, 0.02, 0.4)), {
      p: [0, 0, z - stairLen / nSteps / 2], r: [0, 0, (rng() - 0.5) * 0.015], color: 0x8a8274, jitter: 0.01, jitterFreq: 5,
      w: { moss: 0.9, mossLow: 0.5, mossH: 0.2 },
    });
  }
  for (const s of [-1, 1]) {
    const x = s * (stairW / 2 + 0.25);
    // stepped side wall the naga body rests on
    k.add(mat('stone'), bevelBox(0.4, 0.5, stairLen + 0.6, 0.04, 0.3), { p: [x, PY * 0.5 + 0.1, stairZ0 - stairLen / 2], r: [Math.atan2(PY, stairLen), 0, 0], color: 0x7a7266, w: { moss: 0.9 } });
    k.add(mat('stone'), bbox(0.5, 0.6, 0.8, 0.03, 0.3), { p: [x, 0, stairZ0 + 0.3], color: 0x7a7266, w: { mossLow: 1, mossH: 0.4 } });
    // naga body undulating down the balustrade, tail curling at the top
    const body = smoothPath([V(x, 0.95, stairZ0 + 0.35), V(x, 0.85, stairZ0 - 0.2), V(x, PY * 0.45 + 0.8, stairZ0 - stairLen * 0.5), V(x, PY + 0.75, stairZ0 - stairLen - 0.2), V(x, PY + 1.05, stairZ0 - stairLen - 0.6), V(x - s * 0.1, PY + 1.35, stairZ0 - stairLen - 0.45)], 40);
    k.add(mat('stone'), tube(body, (t) => 0.17 * (1 - Math.pow(t, 3) * 0.9), 9), {
      color: 0xa09684, w: { moss: 0.9, streak: 0.5 },
      colorFn: (p, n, c, lp) => { const sc = Math.sin(lp.z * 40 + Math.sin(lp.y * 30) * 2) * Math.sin(lp.y * 40); if (sc > 0.55) c.multiplyScalar(0.72); if (n.y < -0.4) c.lerp(_belly, 0.4); },
    });
    // five-headed crest at the bottom
    k.add(mat('stone'), nagaGeo(), { p: [x, 0.6, stairZ0 + 0.5], s: 1.05, r: s * 0.12, color: 0xa89e8a, w: { ground: -0.6, moss: 0.85, streak: 0.6, grime: 0.3 } });
    out.colliders.push({ x, z: stairZ0 - stairLen / 2 + 0.3, hx: 0.3, hz: stairLen / 2 + 0.6, yaw: 0 });
  }
  // ---- platform / courtyard -------------------------------------------------------------------------
  const zG = stairZ0 - stairLen - 0.6; // gate line
  const PD = 15, PW = 15;
  const pzc = zG - PD / 2 + 0.4;
  k.add(mat('stone'), bbox(PW, PY, PD, 0.04, 0.6), {
    p: [0, 0, pzc], color: 0x857c6c, jitter: 0.02, jitterFreq: 2,
    w: { ground: 0, moss: 0.7, mossLow: 0.9, mossH: 0.9 },
    colorFn: (p, n, c) => { if (n.y > 0.5) { const gx = Math.abs(Math.sin(p.x * Math.PI / 0.45)), gz = Math.abs(Math.sin(p.z * Math.PI / 0.3)); if (gx < 0.1 || gz < 0.1) c.lerp(_mossC, 0.75); } },
  });
  // ---- ruined gate (ซุ้มประตู) ---------------------------------------------------------------------
  for (const s of [-1, 1]) {
    const gx = s * 1.65;
    const gh = s < 0 ? 3.4 : 2.3; // right pillar collapsed lower
    k.add(mat('brick'), bbox(0.75, gh, 0.75, 0.04, 0.3), { p: [gx, PY, zG], color: 0x8a5a40, jitter: 0.015, jitterFreq: 6, w: { ground: PY, mossLow: 0.9, mossH: 1.2, moss: 0.9 } });
    k.add(mat('stone'), G('gcap', () => bevelBox(0.95, 0.18, 0.95, 0.03, 0.3)), { p: [gx, PY + gh + 0.07, zG], r: [0.04 * s, 0, 0.05], color: 0x7a7266, w: { moss: 1 } });
    out.colliders.push({ x: gx, z: zG, hx: 0.4, hz: 0.4, yaw: 0 });
  }
  // broken lintel fragment still resting on the tall pillar + the fallen half on the ground
  k.add(mat('brick'), bevelBox(1.7, 0.45, 0.6, 0.05, 0.3), { p: [-1.0, PY + 3.65, zG], r: [0, 0, -0.08], color: 0x7a5038, jitter: 0.02, jitterFreq: 5, w: { moss: 1, streak: 0.6 } });
  k.add(mat('brick'), bevelBox(1.3, 0.4, 0.55, 0.05, 0.3), { p: [2.6, PY + 0.2, zG - 0.9], r: [0.2, 0.6, 0.35], color: 0x7a5038, jitter: 0.02, jitterFreq: 5, w: { moss: 1 } });
  for (let i = 0; i < 18; i++) k.add(mat('brick'), G('brickR', () => bevelBox(0.22, 0.09, 0.11, 0.015, 0.1)), { p: [2.1 + (rng() - 0.5) * 1.8, PY + 0.05 + rng() * 0.1, zG - 0.6 + (rng() - 0.5) * 1.6], r: [rng() * 3, rng() * 3, rng() * 3], color: 0x8a5a40, w: { moss: 0.6 } });
  out.gateAnchor = anchor(group, 'gate', 0, PY, zG);
  // ---- broken perimeter walls -------------------------------------------------------------------
  for (const s of [-1, 1]) {
    k.at([s * (PW / 2 - 0.3), PY, pzc], Math.PI / 2, null, () => ruinedWall(k, PD - 1.0, 1.8, 0.45, rng, { seed: s * 3 }));
    k.at([s * (PW / 4 + 1.0), PY, zG], 0, null, () => ruinedWall(k, PW / 2 - 2.6, 1.6, 0.45, rng, { seed: s * 5 + 1 }));
    out.colliders.push({ x: s * (PW / 2 - 0.3), z: pzc, hx: 0.25, hz: (PD - 1) / 2, yaw: 0 });
    out.colliders.push({ x: s * (PW / 4 + 1.0), z: zG, hx: (PW / 2 - 2.6) / 2, hz: 0.25, yaw: 0 });
  }
  k.at([0, PY, pzc - PD / 2 + 0.4], 0, null, () => ruinedWall(k, PW - 0.6, 2.2, 0.45, rng, { seed: 9 }));
  // ---- the roofless hall: laterite column stumps around the big Buddha -------------------------------
  const bz = pzc - 2.4;
  const colPos = [];
  for (const s of [-1, 1]) for (const z of [bz + 3.4, bz + 0.8, bz - 1.8]) colPos.push([s * 3.4, z]);
  colPos.forEach(([x, z], i) => {
    const h = 0.8 + rng() * 2.6;
    k.add(mat('stone'), G(`lcol:${h.toFixed(1)}`, () => bbox(0.55, Math.round(h * 10) / 10, 0.55, 0.06, 0.3)), { p: [x, PY, z], r: [(rng() - 0.5) * 0.06, rng() * 0.3, (rng() - 0.5) * 0.06], color: 0x8a5a3e, jitter: 0.03, jitterFreq: 4, w: { ground: PY, moss: 1, mossLow: 0.9, mossH: 1.0 } });
    out.colliders.push({ x, z, r: 0.35 });
  });
  // big seated Buddha on a high pedestal
  const bs = 2.3;
  k.add(mat('stone'), bbox(3.4, 0.9, 2.6, 0.05, 0.4), { p: [0, PY, bz], color: 0x857c6c, jitter: 0.015, jitterFreq: 3, w: { ground: PY, mossLow: 1, mossH: 0.6 } });
  k.push([0, PY + 0.9, bz]);
  lotusBase(k, 1.05, 0.55, { color: 0x9a9080 });
  k.add(mat('stone'), buddhaSeatedGeo(false, 1.4), { p: [0, 0.52, -0.05], s: bs, color: 0xb0a898, w: { ground: -PY - 0.9, moss: 0.85, streak: 0.9 } });
  k.at([0, 0.52, -0.05], null, bs, () => saffronSash(k));
  k.pop();
  out.buddhaAnchor = anchor(group, 'buddha', 0, PY + 0.9, bz);
  out.colliders.push({ x: 0, z: bz, hx: 1.75, hz: 1.35, yaw: 0 });
  // offerings at the pedestal
  k.details(() => {
    for (let i = 0; i < 5; i++) candle(k, { p: [-0.6 + i * 0.3, PY, bz + 1.45], h: 0.06 + rng() * 0.1, color: 0xe0d8c0, flame: i % 2 === 0 });
    incensePot(k, { p: [0, PY, bz + 1.6], rad: 0.1, color: 0x5a4a3a, sticks: 16, burnt: 0.9, lit: 0.2, seed });
    garland(k, { p: [0.9, PY + 0.86, bz + 1.32], len: 0.2, color: 0x8a7a5a, accent: 0x6a4a28 });
    flowerString(k, [V(-1.2, PY + 0.88, bz + 1.32), V(-0.4, PY + 0.75, bz + 1.34), V(0.4, PY + 0.75, bz + 1.34), V(1.2, PY + 0.88, bz + 1.32)], { color: 0xd8701a, accent: 0xe8e4dc, rad: 0.02 });
  });
  for (const s of [-1, 1]) {
    const a = anchor(group, 'tcandle' + s, s * 0.6, PY + 0.2, bz + 1.45);
    out.candleAnchors.push(a);
    out.lights.push(lightSpec('candle', a, { intensity: 0.7 }));
  }
  // ---- bell in a little wooden frame ---------------------------------------------------------------
  const bx = 4.6, bzz = zG - 3.0;
  k.at([bx, PY, bzz], -0.3, null, () => {
    for (const s of [-1, 1]) k.add(mat('wood'), bbox(0.16, 2.6, 0.16, 0.02, 0.3), { p: [s * 0.8, 0, 0], color: 0x4a3a2c, w: { mossLow: 0.9, mossH: 0.8 } });
    k.add(mat('wood'), bbox(2.0, 0.16, 0.18, 0.02, 0.3), { p: [0, 2.55, 0], color: 0x3e3026, w: { moss: 0.8 } });
    k.push([0, 2.75, 0]);
    thaiRoofTier(k, { w: 1.2, d: 2.2, h: 0.5, mat: 'tiles', roofColor: 0x5a3a2a, trim: 0x6a5038, chofa: true, gablePanel: false, scale: 1.4, eaveY: 0 });
    k.pop();
    k.add(mat('bronze'), G('bellbody', () => lathe([[0, 0.62], [0.08, 0.62], [0.16, 0.56], [0.2, 0.4], [0.24, 0.12], [0.29, 0.02], [0.3, 0], [0.26, 0], [0, 0.05]], 20)), { p: [0, 1.75, 0], color: 0x4a5a40, w: { grime: 0, streak: 0.8, streakColor: 0x2a6a50, moss: 0.3 } });
    k.add(mat('bronze'), G('bellloop', () => torus(0.05, 0.015, 5, 10)), { p: [0, 2.42, 0], color: 0x3a4a30, w: false });
    k.add(mat('dark'), G('bellrope', () => cyl(0.006, 0.006, 0.16, 3, 0)), { p: [0, 2.4, 0], color: 0x2a2018, w: false });
    // hanging striker log
    k.add(mat('wood'), tube([V(-0.55, 1.9, 0.0), V(-0.45, 1.9, 0.0)], 0.06, 6, true), { color: 0x6a5038, w: false });
    k.add(mat('dark'), tube([V(-0.5, 1.95, 0), V(-0.5, 2.55, 0)], 0.005, 3), { color: 0x2a2018, w: false });
  });
  out.bellAnchor = anchor(group, 'bell', bx, PY + 2.05, bzz);
  out.colliders.push({ x: bx, z: bzz, hx: 0.95, hz: 0.2, yaw: -0.3 });
  // ---- sema stones around the hall (some tilted, half sunk) ------------------------------------------
  const semaR = [[-5.2, bz + 4.6], [0, bz + 5.2], [5.2, bz + 4.6], [-5.6, bz], [5.6, bz], [-5.2, bz - 3.4], [0, bz - 3.9], [5.2, bz - 3.4]];
  semaR.forEach(([x, z], i) => semaStone(k, [x, PY - (i % 3 === 0 ? 0.12 : 0), z], Math.atan2(x, z - bz) + Math.PI, (rng() - 0.5) * 0.4));
  // ---- overgrowth: roots/vines spilling over walls, moss cushions, fallen leaves ------------------------
  for (let i = 0; i < 26; i++) {
    const s = rng() < 0.5 ? -1 : 1;
    const z = pzc + (rng() - 0.5) * (PD - 2);
    const x = s * (PW / 2 - 0.3);
    const top = PY + 1.0 + rng() * 0.8;
    k.add(mat('wood'), tube(smoothPath([V(x - s * 0.3, top + 0.1, z), V(x, top + 0.05, z + 0.1), V(x + s * 0.28, top - 0.6, z + 0.05), V(x + s * 0.3, PY * 0.2, z + (rng() - 0.5) * 0.4)], 10), (t) => 0.035 * (1 - t * 0.5) * (0.6 + rng() * 0.8), 5), { color: 0x3a3226, w: { moss: 0.7 } });
  }
  for (let i = 0; i < 30; i++) k.add(mat('moss'), G('mosscushion', () => sphere(0.25, 8, 5).scale(1, 0.25, 1)), { p: [(rng() - 0.5) * (PW - 2), PY + 0.01, pzc + (rng() - 0.5) * (PD - 2)], s: 0.6 + rng() * 1.6, color: 0x4a6a2a, jitter: 0.03, jitterFreq: 8, w: false });
  // ---- an old faded temple sign at the road ------------------------------------------------------------
  k.add(mat('wood'), bbox(0.1, 1.7, 0.1, 0.012, 0.3), { p: [-2.6, 0, 0.5], r: [0, 0, 0.06], color: 0x5a4636, w: { mossLow: 0.9 } });
  k.add(signMat('temple_sign', { th: 'วัดป่าศรัทธาธรรม', en: 'Forest Monastery' }), G('tsign', () => quad(1.1, 0.42)), { p: [-2.55, 1.5, 0.56], r: [0, 0.15, 0.04], color: 0xd0c4a8, uv: 'keep', w: { vary: 0.35, streak: 0.5 } });
  out.colliders.push({ x: -2.6, z: 0.5, r: 0.08 });

  group.add(k.build({ name: 'forestTemple', detailDistance: 40 }));
  out.waitSpot = anchor(group, 'wait', 0.9, 0, 0.9);
  out.walkSurfaces = [
    { ramp: true, x: 0, z: stairZ0 - stairLen / 2, hx: stairW / 2, hz: stairLen / 2, yaw: 0, y0: 0, y1: PY, axis: '-z' },
    { x: 0, z: pzc, hx: PW / 2, hz: PD / 2, yaw: 0, y: PY },
  ];
  return out;
}
const _belly = new THREE.Color(0xc8b88a);
const _mossC = new THREE.Color(0x46582a);
