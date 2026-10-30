// ศาลเจ้ามารวย — the Thai-Chinese shrine in the wedge of the fork (hero set piece).
//
// Local frame: origin = the fork point on the main road centreline (layout key
// 'shrineMaRuay', side C). Travel direction is −Z; the GHOST road branches LEFT (−X),
// the HUMAN road RIGHT (+X). The shrine faces the oncoming traffic (+Z) and stands
// opts.setback metres ahead (−Z) in the wedge. Pass setback:0 if you position it yourself.
import * as THREE from 'three';
import { Kit, bevelBox, bbox, lathe, cyl, tube, torus, sphere, quad, extrude, smoothPath, sagCurve, blob, makeRng, noise } from './lib/kit.js';
import { mat, glowMat, signMat, texMat, stainTex, crackTex } from './lib/materials.js';
import { lightSpec } from './lib/lights.js';
import { G, PAL, candle, incensePot, incenseSticks, fruitPlate, teacup, plate, lantern, garland, flowerString, bottle, cup, mossCap } from './lib/small.js';
import { deityHeadGeo, deityBodyGeo, lionGeo } from './lib/figures.js';
import { chineseRoof } from './shrines.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function anchor(parent, name, x, y, z, yaw = 0) {
  const a = new THREE.Object3D();
  a.name = name;
  a.position.set(x, y, z);
  a.rotation.y = yaw;
  parent.add(a);
  return a;
}
const RED = 0x8e1a12, GOLD = 0xd8a848, STONE = 0xa8a090;

// ---------------------------------------------------------------------------
// Lantern strings (also exported for the shrine approach)
// ---------------------------------------------------------------------------
/**
 * Red lanterns on a sagging string between a and b (local Vector3s).
 * opts {count=6, sag=0.5, seed, white=false, size=1, lights=every 3rd}
 * Adds geometry into kit `k`; returns lantern centre positions.
 */
export function lanternString(k, a, b, opts = {}) {
  const n = opts.count ?? 6;
  const sag = opts.sag ?? 0.5;
  const rng = makeRng(opts.seed ?? 3);
  const pts = sagCurve(a, b, sag, 16);
  k.add(mat('dark'), tube(pts, 0.006, 3), { color: 0x2a1a14, w: false });
  const centres = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= 4 * t * (1 - t) * sag;
    const drop = 0.08 + rng() * 0.06;
    const s = (opts.size ?? 1) * (0.85 + rng() * 0.25);
    k.add(mat('dark'), G('lstr:' + drop.toFixed(2), () => cyl(0.004, 0.004, drop, 3, 0, 1, false)), { p: [p.x, p.y - drop, p.z], color: 0x221410, w: false });
    lantern(k, { p: [p.x, p.y - drop, p.z], r: rng() * 6, s, white: opts.white });
    centres.push(new THREE.Vector3(p.x, p.y - drop - 0.17 * s, p.z));
  }
  return centres;
}

/**
 * Stand-alone lantern string (for the shrine approach / ghost gate). a, b local points.
 * -> { object, lanternAnchors, lights }
 */
export function createLanternString(a, b, opts = {}) {
  const group = new THREE.Group();
  group.name = 'lanternString';
  const k = new Kit(opts.seed ?? 1, { grime: 0, vary: 0.15 });
  const centres = lanternString(k, a, b, opts);
  group.add(k.build({ name: 'lanternString', shadows: false }));
  const lanternAnchors = centres.map((c, i) => anchor(group, 'lantern' + i, c.x, c.y, c.z));
  const every = opts.lightEvery ?? 3;
  const lights = lanternAnchors.filter((_, i) => i % every === 1).map((a) => lightSpec(opts.white ? 'lantern_white' : 'lantern', a));
  return { object: group, lanternAnchors, lights };
}

// ---------------------------------------------------------------------------
// The deity statue (Ah Kong / the old man of the earth)
// ---------------------------------------------------------------------------
function deityHeadParts(k) {
  // head sculpt
  k.add(mat('statue'), deityHeadGeo(), { w: false });
  // official's cap: black crown with gold band + side wings
  k.add(mat('lacquer'), G('dcap', () => lathe([[0, 0.0], [0.09, 0.0], [0.094, 0.03], [0.088, 0.065], [0.066, 0.092], [0, 0.098]], 18)), { p: [0, 0.052, -0.012], s: [1, 1, 1.06], color: 0x161210, w: false });
  k.add(mat('gold'), G('dcapband', () => torus(0.092, 0.009, 5, 22)), { p: [0, 0.06, -0.012], r: [Math.PI / 2, 0, 0], s: [1, 1.06, 1], color: GOLD, w: false });
  k.add(mat('gold'), G('dcapjewel', () => sphere(0.013, 8, 6)), { p: [0, 0.095, 0.088], color: 0xe0c060, w: false });
  // back flap + short side wings of the official's cap
  k.add(mat('lacquer'), G('dcapback', () => bevelBox(0.12, 0.07, 0.03, 0.01, 0.05)), { p: [0, 0.11, -0.095], color: 0x161210, w: false });
  for (const s of [-1, 1]) k.add(mat('lacquer'), G('dwing2', () => bevelBox(0.075, 0.028, 0.008, 0.004, 0.05)), { p: [s * 0.09, 0.115, -0.1], r: [0, 0, s * 0.18], color: 0x161210, w: false });
  // long white eyebrows drooping past the eyes
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const pts = smoothPath([V(s * 0.012, 0.032 + i * 0.003, 0.084), V(s * 0.04, 0.036 + i * 0.002, 0.082), V(s * 0.062, 0.022 - i * 0.004, 0.07), V(s * 0.074, -0.005 - i * 0.01, 0.06)], 10);
      k.add(mat('statue'), tube(pts, (t) => 0.0055 * (1 - t * 0.8), 5), { color: 0xf4f0e6, w: false });
    }
  }
  // moustache: two drooping tapered strands
  for (const s of [-1, 1]) {
    const pts = smoothPath([V(s * 0.004, -0.034, 0.104), V(s * 0.03, -0.04, 0.098), V(s * 0.05, -0.065, 0.085), V(s * 0.056, -0.11, 0.07)], 12);
    k.add(mat('statue'), tube(pts, (t) => 0.009 * (1 - t * 0.85) + 0.001, 6), { color: 0xf0ece2, w: false });
  }
  // flowing beard: fan of tapered strands from the chin down to the chest
  const rng = makeRng(77);
  for (let i = 0; i < 11; i++) {
    const u = (i / 10) * 2 - 1;
    const len = 0.2 + (1 - Math.abs(u)) * 0.13 + rng() * 0.03;
    const pts = smoothPath([V(u * 0.04, -0.07, 0.08 - Math.abs(u) * 0.02), V(u * 0.05, -0.11, 0.1), V(u * 0.048 + (rng() - 0.5) * 0.01, -0.07 - len * 0.6, 0.1), V(u * 0.03, -0.07 - len, 0.085)], 12);
    k.add(mat('statue'), tube(pts, (t) => (0.015 - Math.abs(u) * 0.004) * (1 - t * 0.8), 6), { color: 0xeeeae0, w: false, jitter: 0.002, jitterFreq: 80 });
  }
}

/** Seated deity on a throne. Builds into `k` at the current transform (origin floor centre). Returns head anchor pos (kit space). */
function deityStatue(k, headKit) {
  const seatH = 0.5;
  // throne: lacquered chair with gold trim
  k.add(mat('lacquer'), bbox(0.78, seatH, 0.62, 0.02, 0.2), { color: RED, w: { grime: 0.2, grimeH: 0.15 } });
  k.add(mat('gold'), bbox(0.8, 0.04, 0.64, 0.008, 0.2), { p: [0, seatH - 0.02, 0], color: GOLD, w: false });
  k.add(mat('lacquer'), bbox(0.78, 1.18, 0.08, 0.02, 0.2), { p: [0, seatH, -0.3], color: RED, w: false, colorFn: (p, n, c, lp) => { if (n.z > 0.5 && Math.abs(lp.x) < 0.3 && lp.y > 0.65 && lp.y < 1.1) { const r = Math.hypot(lp.x, lp.y - 0.88); if (Math.abs(r - 0.2) < 0.02) c.lerp(_gold, 0.9); } } });
  k.add(mat('gold'), G('throneTop2', () => bevelBox(0.95, 0.08, 0.12, 0.02, 0.08)), { p: [0, seatH + 1.2, -0.3], color: GOLD, w: false, deform: (p) => { p.y += Math.pow(Math.abs(p.x) / 0.475, 3) * 0.09; } });
  for (const s of [-1, 1]) k.add(mat('gold'), G('throneCurl', () => tube(smoothPath([V(0, 0, 0), V(0.04, 0.06, 0), V(0.0, 0.1, 0), V(-0.03, 0.07, 0)], 8), 0.016, 5, true)), { p: [s * 0.47, seatH + 1.27, -0.3], s: [s, 1, 1], color: GOLD, w: false });
  for (const s of [-1, 1]) k.add(mat('lacquer'), bbox(0.07, 0.3, 0.55, 0.015, 0.15), { p: [s * 0.37, seatH, 0], color: RED, w: false });
  // body
  k.add(mat('statue'), deityBodyGeo(), { p: [0, seatH, -0.02], w: false });
  // gold ingot in the right hand, staff in the left
  k.add(mat('gold'), G('ingot', () => lathe([[0, 0], [0.045, 0], [0.06, 0.02], [0.07, 0.04], [0.03, 0.035], [0.025, 0.06], [0, 0.065]], 12).scale(1.3, 1, 0.8)), { p: [-0.12, seatH + 0.33, 0.33], color: 0xe8c050, w: false });
  k.add(mat('wood'), tube(smoothPath([V(0.2, -seatH + 0.05, 0.44), V(0.17, 0.3, 0.33), V(0.25, 0.9, 0.27), V(0.3, 1.12, 0.24)], 8), 0.016, 6), { p: [0, seatH, 0], color: 0x5a3a20, w: false });
  k.add(mat('gold'), G('gourd', () => lathe([[0, 0], [0.03, 0.01], [0.032, 0.035], [0.015, 0.06], [0.024, 0.08], [0.02, 0.1], [0, 0.11]], 10)), { p: [0.3, seatH + 1.12, 0.24], color: 0xd0a040, w: false });
  // head as its own kit (so gameplay can swap/animate it)
  const hp = V(0, seatH + 0.82, 0.005);
  return hp;
}

// ---------------------------------------------------------------------------
// Ridge dragon (simple sculpt from tubes + primitives)
// ---------------------------------------------------------------------------
function ridgeDragon(k, p, dir, s = 1) {
  k.at(p, dir < 0 ? Math.PI : 0, s, () => {
    const body = smoothPath([V(-0.9, 0.0, 0), V(-0.6, 0.18, 0.04), V(-0.3, 0.05, -0.03), V(0.0, 0.22, 0.02), V(0.25, 0.32, 0.0), V(0.42, 0.28, 0.0)], 30);
    k.add(mat('ceramic'), tube(body, (t) => 0.035 + Math.sin(t * Math.PI) * 0.03, 7), {
      color: 0x2a7a4a, w: { grime: 0, vary: 0.25, moss: 0.3 },
      colorFn: (pp, n, c, lp) => { if (n.y < -0.3) c.lerp(_gold, 0.7); else if (Math.sin(lp.x * 90) > 0.5) c.multiplyScalar(0.75); },
    });
    // dorsal spikes
    for (let i = 2; i < 28; i += 3) {
      const q = body[i];
      k.add(mat('ceramic'), G('dspike', () => cyl(0.0, 0.02, 0.06, 4, 0)), { p: [q.x, q.y + 0.04, q.z], r: [0, 0, -0.3], color: 0xd04a20, w: false });
    }
    // head
    k.add(mat('ceramic'), G('dhead', () => sphere(0.07, 10, 8).scale(1.4, 0.9, 0.9)), { p: [0.5, 0.3, 0], color: 0x2a7a4a, w: false });
    k.add(mat('ceramic'), G('dsnout', () => sphere(0.045, 8, 6).scale(1.5, 0.7, 0.8)), { p: [0.6, 0.27, 0], color: 0x3a8a5a, w: false });
    for (const sz of [-1, 1]) {
      k.add(mat('gold'), tube(smoothPath([V(0.47, 0.34, sz * 0.03), V(0.4, 0.44, sz * 0.05), V(0.32, 0.47, sz * 0.06)], 6), (t) => 0.012 * (1 - t * 0.7), 4), { color: GOLD, w: false });
      k.add(mat('gold'), tube(smoothPath([V(0.65, 0.26, sz * 0.03), V(0.75, 0.2, sz * 0.12), V(0.8, 0.26, sz * 0.2)], 8), 0.004, 3), { color: GOLD, w: false });
      k.add(mat('ceramic'), G('deye', () => sphere(0.014, 6, 5)), { p: [0.56, 0.33, sz * 0.045], color: 0xe8d040, w: false });
    }
    k.add(mat('ceramic'), G('djaw', () => bevelBox(0.11, 0.025, 0.06, 0.01, 0.1)), { p: [0.6, 0.22, 0], r: [0, 0, -0.35], color: 0xc83a1a, w: false });
  });
}
const _gold = new THREE.Color(GOLD);

// ---------------------------------------------------------------------------
// Signposts at the Y
// ---------------------------------------------------------------------------
function forkSignpost(k, p, side, rng) {
  // weathered old wooden post with an arrow board pointing toward its road
  k.at(p, (rng() - 0.5) * 0.12, null, () => {
    const lean = [(rng() - 0.5) * 0.06, 0, side * 0.04];
    k.add(mat('wood'), bbox(0.12, 2.3, 0.12, 0.015, 0.3), { r: lean, color: 0x6a5440, jitter: 0.004, jitterFreq: 8, w: { grime: 0.6, grimeH: 0.6, mossLow: 0.8, mossH: 0.5, streak: 0.6 } });
    k.add(mat('wood'), G('postcap', () => cyl(0.0, 0.09, 0.08, 4, 0).rotateY(Math.PI / 4)), { p: [lean[2] * -2.3, 2.3, 0], color: 0x5a4430, w: { moss: 0.8 } });
    // arrow board
    const sh = new THREE.Shape();
    const L = 0.95, H = 0.3;
    sh.moveTo(0, -H / 2);
    sh.lineTo(L - 0.2, -H / 2);
    sh.lineTo(L, 0);
    sh.lineTo(L - 0.2, H / 2);
    sh.lineTo(0, H / 2);
    sh.closePath();
    k.add(mat('wood'), G('arrowboard', () => extrude(sh, 0.035, 0.006)), { p: [side * 0.05 - lean[2] * 1.8, 1.82, 0.08], s: [side, 1, 1], r: [0, 0, side * -0.03], color: 0x8a7458, w: { grime: 0, streak: 0.5, moss: 0.4, vary: 0.3 } });
    // painted face (signTex fork_sign) on the board
    k.add(signMat('fork_sign', { side: side < 0 ? 'left' : 'right' }), G('arrowface', () => quad(0.72, 0.24)), { p: [side * (0.05 + 0.4) - lean[2] * 1.8, 1.82, 0.1], r: [0, 0, side * -0.03], color: 0xd0c4a8, uv: 'keep', w: { vary: 0.35, grime: 0 } });
    // nails, a faded ribbon tied to the post
    k.add(mat('cloth_static'), G('postribbon', () => cyl(0.068, 0.068, 0.06, 8, 0, 1, false)), { p: [0, 1.25, 0], color: side < 0 ? 0xe8e4dc : 0xc83a2a, w: { vary: 0.3 } });
    k.add(mat('cloth'), G('postribbonTail', () => quad(0.04, 0.4, 1, 4).translate(0, -0.2, 0)), { p: [0.04, 1.25, 0.07], r: [0.1, 0.3, 0.1], color: side < 0 ? 0xe8e4dc : 0xc83a2a, uv: 'keep', w: false });
  });
}

// ---------------------------------------------------------------------------
// Shrine set piece
// ---------------------------------------------------------------------------
/**
 * ศาลเจ้ามารวย set piece at the fork.
 * opts {setback=14, noseZ=-6 (signposts), seed=9, lanternCount}
 * -> { object, statueAnchor, statueFaceAnchor, statueHead (Object3D group of the head:
 *      swap/animate it for the final reveal), altarAnchor, lanternAnchors: Object3D[],
 *      incenseAnchors: Object3D[] (altar pot + forecourt burner + statue incense),
 *      smokeAnchors, leftSignAnchor, rightSignAnchor, handSpawnAnchor, burnerAnchor,
 *      furnaceAnchor, forecourtAnchor (where a passenger stands), colliders, lights,
 *      footprint:{x,z,hx,hz} (area the roads must avoid) }
 */
export function createShrineMaRuay(opts = {}) {
  const seed = opts.seed ?? 9;
  const rng = makeRng(seed * 131 + 7);
  const SB = opts.setback ?? 14;
  const noseZ = opts.noseZ ?? -6;
  const group = new THREE.Group();
  group.name = 'shrineMaRuay';
  const k = new Kit(seed, { grime: 0.5, grimeH: 0.6, mossLow: 0.6, mossH: 0.5, moss: 0.3, streak: 0.45, vary: 0.18 });
  const out = { object: group, lanternAnchors: [], incenseAnchors: [], smokeAnchors: [], colliders: [], lights: [] };
  const PH = 0.42; // platform height
  const PW = 10.5, PD = 8.2;
  const pz0 = -SB; // platform front edge
  const pzc = pz0 - PD / 2;

  // ---- forecourt paving + platform -------------------------------------------------
  k.add(mat('stone'), bbox(PW + 2, 0.06, 7.5, 0.02, 0.5), {
    p: [0, -0.03, pz0 + 3.6], color: 0x8a847a, jitter: 0.004,
    w: { grime: 0.2, moss: 0.4, mossLow: 0.3, mossH: 0.06 },
    colorFn: (p, n, c) => { if (n.y > 0.5) { const gx = Math.abs(Math.sin(p.x * Math.PI / 0.6)), gz = Math.abs(Math.sin(p.z * Math.PI / 0.6)); if (gx < 0.08 || gz < 0.08) c.lerp(_mossC, 0.7); } },
  });
  k.add(mat('stone'), bbox(PW, PH, PD, 0.03, 0.5), {
    p: [0, 0, pzc], color: STONE, jitter: 0.004,
    w: { grime: 0.6, grimeH: PH, mossLow: 0.9, mossH: 0.35, moss: 0.25 },
    colorFn: (p, n, c) => { if (n.y > 0.5) { const gx = Math.abs(Math.sin(p.x * Math.PI / 0.5)), gz = Math.abs(Math.sin(p.z * Math.PI / 0.5)); if (gx < 0.06 || gz < 0.06) c.multiplyScalar(0.6); } },
  });
  // steps
  for (let i = 0; i < 3; i++) k.add(mat('stone'), bbox(3.2 - i * 0.1, PH * (i + 1) / 3, 0.36, 0.02, 0.4), { p: [0, 0, pz0 + 0.36 * (2 - i) + 0.18], color: 0x9a9284, w: { grime: 0.6, mossLow: 0.7, mossH: 0.12 } });
  // low stone balustrade at the platform front corners
  for (const s of [-1, 1]) {
    k.add(mat('stone'), bbox(3.2, 0.55, 0.22, 0.02, 0.4), { p: [s * 3.45, PH, pz0 - 0.12], color: 0xa29a8a, w: { ground: PH, moss: 0.6, mossLow: 0.6, grime: 0.5 } });
    for (let i = 0; i < 4; i++) k.add(mat('stone'), G('balpost', () => bbox(0.26, 0.7, 0.26, 0.02, 0.2)), { p: [s * (1.95 + i * 1.0), PH, pz0 - 0.12], color: 0x9a9282, w: { ground: PH, moss: 0.7 } });
    for (let i = 0; i < 3; i++) if (rng() < 0.7) mossCap(k, 0.6 + rng() * 0.3, 0.24, { p: [s * (2.45 + i * 1.0), PH + 0.55, pz0 - 0.12], seed: i + s * 5 });
  }

  // ---- main hall ---------------------------------------------------------------------
  const HW = 6.2, HD = 4.6, WH = 3.4;
  const hz = pz0 - 2.2 - HD / 2; // hall centre
  const hf = hz + HD / 2; // hall front wall z
  const y0 = PH;
  // walls: stone dado + ochre-red plaster
  const wall = (x, z, w, d, rot) => {
    k.add(mat('plaster'), bbox(w, WH, d, 0.02, 0.4), {
      p: [x, y0, z], r: rot, color: 0xb8442c, w: { ground: y0, grime: 0.6, grimeH: 0.9, mossLow: 0.6, mossH: 0.6, streak: 0.7, streakColor: 0x3a2018 },
      colorFn: (p, n, c) => { if (p.y < y0 + 0.75) c.lerp(_stoneC, 0.9); },
    });
  };
  wall(0, hz - HD / 2, HW, 0.25, 0);
  wall(-HW / 2, hz, HD, 0.25, Math.PI / 2);
  wall(HW / 2, hz, HD, 0.25, Math.PI / 2);
  // front wall with a wide central doorway and two round windows
  const doorW = 2.4;
  for (const s of [-1, 1]) {
    const w = (HW - doorW) / 2;
    k.add(mat('plaster'), bbox(w, WH, 0.25, 0.02, 0.4), {
      p: [s * (doorW / 2 + w / 2), y0, hf], color: 0xb8442c, w: { ground: y0, grime: 0.5, grimeH: 0.9, streak: 0.6, streakColor: 0x3a2018 },
      colorFn: (p, n, c, lp) => {
        if (p.y < y0 + 0.75) c.lerp(_stoneC, 0.9);
        const r = Math.hypot(lp.x, lp.y - 1.6);
        if (r < 0.5 && n.z > 0.5) c.lerp(r < 0.42 ? _darkC : _gold, 0.9); // round window w/ gold ring
      },
    });
    // window grille bars
    for (let i = -2; i <= 2; i++) k.add(mat('gold'), G('grille', () => cyl(0.012, 0.012, 0.8, 5, 0)), { p: [s * (doorW / 2 + w / 2) + i * 0.15, y0 + 1.2, hf + 0.13], color: GOLD, w: false });
  }
  k.add(mat('plaster'), bbox(doorW, 0.6, 0.25, 0.02, 0.3), { p: [0, y0 + WH - 0.6, hf], color: 0xb8442c, w: { streak: 0.6, grime: 0 } });
  // gold door frame + carved lintel
  k.add(mat('gold'), bbox(doorW + 0.2, 0.18, 0.3, 0.02, 0.2), { p: [0, y0 + WH - 0.78, hf], color: GOLD, w: { grime: 0, vary: 0.3 }, colorFn: (p, n, c, lp) => { if (Math.sin(lp.x * 40) * Math.sin(lp.y * 60) > 0.5) c.multiplyScalar(0.6); } });
  for (const s of [-1, 1]) k.add(mat('gold'), bbox(0.12, WH - 0.6, 0.3, 0.015, 0.3), { p: [s * (doorW / 2 + 0.04), y0, hf], color: GOLD, w: { ground: y0, grime: 0.4 } });
  // door leaves swung open (red, gold studs)
  for (const s of [-1, 1]) {
    k.at([s * doorW / 2, y0, hf - 0.1], s * 1.75, null, () => {
      k.add(mat('lacquer'), bbox(doorW / 2 - 0.04, WH - 0.7, 0.07, 0.01, 0.2), { p: [-s * (doorW / 4), 0, 0], color: 0x7a1410, w: { grime: 0.4, grimeH: 0.6, ground: 0 }, colorFn: (p, n, c, lp) => { if ((Math.abs(Math.sin(lp.x * 26)) > 0.92 && Math.abs(Math.sin(lp.y * 26)) > 0.92)) c.lerp(_gold, 0.9); } });
    });
  }
  // interior floor (red tiles) + ceiling
  k.add(mat('ceramic'), bbox(HW - 0.3, 0.02, HD - 0.3, 0.004, 0.4), { p: [0, y0, hz], color: 0x6a2418, w: { grime: 0.2, dust: 0.3 } });
  k.add(mat('wood'), bbox(HW, 0.08, HD, 0.01, 0.4), { p: [0, y0 + WH, hz], color: 0x3a1a10, w: false });
  // ceiling beams (painted)
  for (let i = -2; i <= 2; i++) k.add(mat('lacquer'), bbox(0.16, 0.18, HD - 0.2, 0.015, 0.3), { p: [i * 1.25, y0 + WH - 0.18, hz], color: 0x5a1a12, w: false, colorFn: (p, n, c, lp) => { if (Math.abs(lp.z % 0.8) < 0.08) c.lerp(_gold, 0.8); } });

  // ---- porch: red lacquer columns, brackets, beam, couplets, sign board ----------------
  const pzCol = pz0 - 0.9;
  const colXs = [-2.6, -1.1, 1.1, 2.6];
  for (const x of colXs) {
    k.add(mat('stone'), G('colbase', () => lathe([[0, 0], [0.26, 0], [0.27, 0.08], [0.22, 0.12], [0.24, 0.2], [0.18, 0.26], [0, 0.26]], 14)), { p: [x, y0, pzCol], color: 0x9a9284, w: { ground: y0, mossLow: 0.9, mossH: 0.3 } });
    k.add(mat('lacquer'), cyl(0.15, 0.165, 3.1, 14, 0.01, 6), {
      p: [x, y0 + 0.25, pzCol], color: RED, w: { ground: y0, grime: 0.55, grimeH: 1.1, streak: 0.4, streakColor: 0x2a1008 },
      colorFn: (p, n, c) => { const pn = noise.noise3D(p.x * 6, p.y * 3, p.z * 6); if (pn > 0.45) c.lerp(_woodC, (pn - 0.45) * 2.5); },
    });
    k.add(mat('gold'), G('colcap', () => cyl(0.2, 0.16, 0.16, 14, 0.02)), { p: [x, y0 + 3.33, pzCol], color: GOLD, w: false });
    out.colliders.push({ x, z: pzCol, r: 0.26 });
  }
  // inner couplets on the two central columns (vertical boards)
  for (const s of [-1, 1]) k.add(signMat('couplet', { text: s < 0 ? 'มีเมตตา' : 'ย่อมร่มเย็น', side: s }), G('mcouplet', () => quad(0.26, 1.9)), { p: [s * 1.1, y0 + 1.75, pzCol + 0.175], color: 0xe8d8b0, uv: 'keep', w: { vary: 0.3, grime: 0 } });
  // porch beam, brackets + porch roof
  k.add(mat('lacquer'), bbox(6.6, 0.3, 0.26, 0.02, 0.4), { p: [0, y0 + 3.45, pzCol], color: 0x7a1610, w: { streak: 0.6, grime: 0 }, colorFn: (p, n, c, lp) => { if (Math.abs(lp.y - 0.15) < 0.05) c.lerp(_gold, 0.9); } });
  for (const x of colXs) for (const s of [-1, 1]) k.add(mat('gold'), G('bracket', () => tube(smoothPath([V(0, 0, 0), V(0.18, 0.08, 0), V(0.32, 0.25, 0)], 8), 0.035, 5, true)), { p: [x, y0 + 3.15, pzCol + 0.05], s: [s, 1, 1], color: 0xc89a40, w: false });
  // sign board: ศาลเจ้ามารวย (gold board under the porch roof)
  k.add(mat('lacquer'), bbox(2.7, 0.78, 0.1, 0.03, 0.3), { p: [0, y0 + 3.62, pzCol + 0.1], color: 0x5a0e0a, w: false });
  k.add(signMat('shrine_board', { th: 'ศาลเจ้ามารวย' }, { emissive: 0x6a4410, emissiveIntensity: 0.35 }), G('mboard', () => quad(2.5, 0.62)), { p: [0, y0 + 4.01, pzCol + 0.156], color: 0xffffff, uv: 'keep', w: false });
  k.push([0, y0 + 3.62, pzCol - 0.3]);
  chineseRoof(k, { w: 7.4, d: 2.4, h: 0.8, color: 0xd8902a, ridge: 0xb82a18, edge: 0x2a7a4a });
  k.pop();
  // ---- main roof over the hall ------------------------------------------------------------
  const ry = y0 + WH + 0.05;
  k.push([0, ry, hz]);
  chineseRoof(k, { w: HW + 1.6, d: HD + 1.6, h: 1.8, color: 0xd8922c, ridge: 0xb02818, edge: 0x2a7a4a });
  k.pop();
  // ridge dragons facing the flaming pearl
  ridgeDragon(k, [-1.4, ry + 1.95, hz], 1, 1.6);
  ridgeDragon(k, [1.4, ry + 1.95, hz], -1, 1.6);
  k.add(glowMat('gold_glow'), G('pearlFlame', () => sphere(0.14, 12, 10)), { p: [0, ry + 2.25, hz], color: 0xffffff, w: false });
  for (let i = 0; i < 5; i++) k.add(mat('gold'), G('flametongue', () => cyl(0.0, 0.05, 0.28, 5, 0)), { p: [0, ry + 2.25, hz], r: [0, 0, (i - 2) * 0.45], color: 0xe8a030, w: false });

  // ---- interior: altar + deity -------------------------------------------------------------
  const dz = hz - HD / 2 + 0.75; // statue z
  const DAIS = 0.55, SS = 1.3; // dais height, statue scale
  // dais
  k.add(mat('lacquer'), bbox(2.2, DAIS, 1.2, 0.02, 0.3), { p: [0, y0, dz], color: 0x6a1410, w: { grime: 0.3, grimeH: 0.4, ground: y0 } });
  k.add(mat('gold'), bbox(2.24, 0.06, 1.24, 0.01, 0.3), { p: [0, y0 + DAIS - 0.03, dz], color: GOLD, w: false });
  // niche cabinet frame around the statue with red silk curtains
  k.add(mat('gold'), bbox(2.0, 0.22, 0.3, 0.02, 0.3), { p: [0, y0 + 3.0, dz + 0.4], color: GOLD, w: false, colorFn: (p, n, c, lp) => { if (Math.sin(lp.x * 30) > 0.6) c.multiplyScalar(0.6); } });
  for (const s of [-1, 1]) {
    k.add(mat('gold'), bbox(0.14, 2.45, 0.3, 0.02, 0.3), { p: [s * 0.95, y0 + DAIS, dz + 0.4], color: GOLD, w: false });
    k.add(mat('silk'), G('curtain', () => quad(0.55, 1.9, 6, 4).translate(0, -0.95, 0)), {
      p: [s * 0.72, y0 + 3.0, dz + 0.5], color: 0xa01a18, uv: 'keep', w: { vary: 0.25 },
      deform: (p) => { p.z += Math.sin(p.x * 22) * 0.04; p.x *= 1 - (p.y < -1.2 ? 0.45 * (-1.2 - p.y) : 0); },
    });
  }
  k.push([0, y0 + DAIS, dz], null, SS);
  const headPos = deityStatue(k);
  k.pop();
  // altar table in front of the statue
  const az = dz + 1.35;
  k.add(mat('lacquer'), bbox(2.6, 0.95, 0.8, 0.02, 0.3), { p: [0, y0, az], color: 0x7a1610, w: { grime: 0.4, grimeH: 0.4, ground: y0 } });
  k.add(mat('gold'), bbox(2.5, 0.5, 0.02, 0.01, 0.2), { p: [0, y0 + 0.35, az + 0.405], color: GOLD, w: false, colorFn: (p, n, c, lp) => { const v = Math.sin(lp.x * 18 + Math.sin(lp.y * 14) * 2); if (v > 0.4) c.multiplyScalar(0.55); } });
  const at = y0 + 0.95;
  k.details(() => {
    incensePot(k, { p: [0, at, az + 0.05], rad: 0.13, metal: true, color: 0xa88838, legs: true, sticks: 30, seed: seed + 2 });
    for (const s of [-1, 1]) {
      candle(k, { p: [s * 0.45, at, az + 0.1], h: 0.42, rad: 0.035, color: 0xb81a14 });
      k.add(mat('gold'), G('cstand', () => lathe([[0, 0], [0.07, 0], [0.04, 0.03], [0.02, 0.12], [0.06, 0.14], [0, 0.15]], 10)), { p: [s * 0.45, at - 0.0, az + 0.1], s: 0.6, color: GOLD, w: false });
      fruitPlate(k, { p: [s * 0.85, at, az], kind: s < 0 ? 'orange' : 'apple', seed: seed + 3 + s, s: 1.1 });
      for (let i = 0; i < 3; i++) teacup(k, { p: [s * (0.2 + i * 0.08), at, az - 0.22] });
      // vases with flowers
      k.add(mat('ceramic'), G('vase', () => lathe([[0, 0], [0.05, 0], [0.07, 0.08], [0.04, 0.18], [0.05, 0.24], [0, 0.22]], 12)), { p: [s * 1.1, at, az - 0.2], color: 0x2a4a8a, w: false });
      for (let i = 0; i < 6; i++) k.add(mat('flower'), G('vflower', () => sphere(0.03, 6, 5)), { p: [s * 1.1 + (rng() - 0.5) * 0.12, at + 0.3 + rng() * 0.12, az - 0.2 + (rng() - 0.5) * 0.1], color: rng() < 0.5 ? PAL.marigold : 0xd8c040, w: false });
      // oil lamps (gold cups with glowing wick)
      k.add(mat('gold'), G('oillamp', () => lathe([[0, 0], [0.025, 0], [0.012, 0.04], [0.04, 0.07], [0.045, 0.09], [0, 0.085]], 10)), { p: [s * 0.25, at, az + 0.25], color: GOLD, w: false });
      k.add(glowMat('candle'), G('oilflame', () => lathe([[0, 0], [0.008, 0.008], [0.004, 0.025], [0, 0.04]], 6)), { p: [s * 0.25, at + 0.09, az + 0.25], color: 0xffffff, w: false });
    }
    // fortune-stick canister (เซียมซี) + paper offering stacks
    k.add(mat('lacquer'), G('siamsi', () => cyl(0.06, 0.055, 0.22, 12, 0.008)), { p: [0.62, at, az + 0.22], color: 0x8a1a12, w: false });
    for (let i = 0; i < 40; i++) {
      const a = rng() * 6.28, r = Math.sqrt(rng()) * 0.045;
      k.add(mat('wood'), G('fstick', () => bbox(0.008, 0.32, 0.003, 0.001, 0.4)), { p: [0.62 + Math.cos(a) * r, at + 0.06, az + 0.22 + Math.sin(a) * r], r: [(rng() - 0.5) * 0.15, rng() * 3, (rng() - 0.5) * 0.15], color: 0xc89a5a, w: false });
    }
    for (let i = 0; i < 3; i++) k.add(mat('paper'), G('gpaper', () => bbox(0.16, 0.06, 0.11, 0.002, 0.1)), { p: [-0.65 + i * 0.03, at + i * 0.06, az + 0.2], r: rng() * 0.3, color: 0xd8b040, w: false });
  });
  // red altar lamps (emissive) flanking the niche
  const red = glowMat('red');
  for (const s of [-1, 1]) {
    k.add(mat('gold'), G('lotusHolderL', () => lathe([[0, 0], [0.06, 0], [0.07, 0.04], [0.1, 0.08], [0.07, 0.09], [0, 0.08]], 12)), { p: [s * 0.75, y0 + DAIS, dz + 0.35], color: GOLD, w: false });
    k.add(red, G('redbulbL', () => sphere(0.06, 12, 10).scale(1, 1.3, 1)), { p: [s * 0.75, y0 + DAIS + 0.15, dz + 0.35], color: 0xffffff, w: false });
    out.lights.push(lightSpec('altar', anchor(group, 'altarRed' + s, s * 0.75, y0 + DAIS + 0.25, dz + 0.5)));
  }
  // big red candles on stands at the porch + standing lanterns
  for (const s of [-1, 1]) {
    k.add(mat('bronze'), G('candleStand', () => lathe([[0, 0], [0.2, 0], [0.18, 0.05], [0.05, 0.12], [0.04, 0.9], [0.14, 0.95], [0.15, 1.0], [0, 1.0]], 12)), { p: [s * 1.7, y0, pzCol + 0.4], color: 0x6a5028, w: { grime: 0.4, streak: 0.4 } });
    candle(k, { p: [s * 1.7, y0 + 1.0, pzCol + 0.4], h: 0.75, rad: 0.07, color: 0xb81a14 });
    out.lights.push(lightSpec('candle', anchor(group, 'bigCandle' + s, s * 1.7, y0 + 1.85, pzCol + 0.4), { intensity: 1.4, distance: 5 }));
  }

  // ---- forecourt: giant incense burner, lions, paper furnace -------------------------------
  const bz = pz0 + 2.3;
  k.at([0, 0, bz], null, null, () => {
    // stone base
    k.add(mat('stone'), bbox(1.6, 0.5, 1.6, 0.04, 0.3), { color: 0x8a8274, w: { mossLow: 0.9, mossH: 0.3, grime: 0.6 } });
    // bronze cauldron on three legs, two handles
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      k.add(mat('bronze'), G('burnerleg', () => cyl(0.06, 0.09, 0.35, 8, 0.01)), { p: [Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.5], color: 0x5a4826, w: { grime: 0, streak: 0.7, streakColor: 0x2a4a3a } });
    }
    k.add(mat('bronze'), G('cauldron', () => lathe([[0, 0], [0.4, 0.02], [0.62, 0.18], [0.72, 0.42], [0.72, 0.62], [0.78, 0.66], [0.76, 0.7], [0.66, 0.68], [0.64, 0.6], [0, 0.6]], 24)), {
      p: [0, 0.78, 0], color: 0x6a5228, w: { grime: 0, streak: 0.8, streakColor: 0x2a5040, vary: 0.25 },
      colorFn: (p, n, c, lp) => { if (Math.abs(lp.y - 0.4) < 0.1 && Math.sin(Math.atan2(lp.z, lp.x) * 16) > 0.3) c.lerp(_gold, 0.5); },
    });
    for (const s of [-1, 1]) k.add(mat('bronze'), G('burnerhandle', () => torus(0.13, 0.03, 6, 14, Math.PI)), { p: [s * 0.74, 1.42, 0], r: [0, Math.PI / 2, 0], color: 0x5a4826, w: false });
    k.add(mat('ash'), G('burnerAsh', () => cyl(0.66, 0.66, 0.02, 24, 0)), { p: [0, 1.38, 0], color: 0xa8a090, w: false });
    k.details(() => incenseSticks(k, { p: [0, 1.4, 0], n: 90, radius: 0.55, seed: seed + 11, burnt: 0.6, lit: 0.6 }));
    // a few thick dragon joss sticks
    for (const s of [-1, 1]) k.add(mat('lacquer'), G('bigjoss', () => cyl(0.025, 0.025, 1.3, 8, 0.004)), { p: [s * 0.25, 1.35, 0.1], r: [0, 0, s * 0.05], color: 0xa01a10, w: false });
  });
  out.burnerAnchor = anchor(group, 'burner', 0, 1.45, bz);
  out.incenseAnchors.push(out.burnerAnchor);
  out.colliders.push({ x: 0, z: bz, hx: 0.85, hz: 0.85, yaw: 0 });
  // guardian lions on pedestals
  for (const s of [-1, 1]) {
    k.add(mat('stone'), bbox(0.85, 0.9, 0.85, 0.03, 0.3), { p: [s * 2.2, 0, pz0 + 0.6], color: 0x9a9284, w: { mossLow: 0.9, mossH: 0.5, moss: 0.6, grime: 0.6 } });
    mossCap(k, 0.3, 0.25, { p: [s * 2.2 + 0.25, 0.9, pz0 + 0.88], seed: 30 + s });
    k.add(mat('stone'), lionGeo(s > 0), { p: [s * 2.2, 0.9, pz0 + 0.6], r: -s * 0.18, s: 1.35, color: 0xb0a898, w: { ground: 0.9, grime: 0.3, grimeH: 0.3, moss: 0.55, streak: 0.5 } });
    out.colliders.push({ x: s * 2.2, z: pz0 + 0.6, hx: 0.45, hz: 0.45, yaw: 0 });
  }
  // paper-burning furnace (เตาเผากระดาษ) on the right side of the forecourt
  const fx = 4.3, fz = pz0 + 1.8;
  k.at([fx, 0, fz], -0.4, null, () => {
    k.add(mat('brick'), bbox(1.0, 1.3, 0.9, 0.03, 0.25), { color: 0x9a3a24, w: { grime: 0.6, grimeH: 0.6, streak: 0.8, streakColor: 0x1a1210, mossLow: 0.7 } });
    k.add(mat('dark'), bbox(0.4, 0.35, 0.05, 0.01, 0.1), { p: [0, 0.35, 0.44], color: 0x0a0604, w: false });
    k.add(glowMat('ember'), G('furnaceEmber', () => bbox(0.36, 0.08, 0.3, 0.02, 0.1)), { p: [0, 0.36, 0.25], color: 0xffffff, w: false });
    k.add(mat('brick'), G('chimney', () => bbox(0.4, 1.1, 0.4, 0.02, 0.2)), { p: [0, 1.3, -0.1], color: 0x8a3220, w: { streak: 0.9, streakColor: 0x0e0a08, grime: 0 } });
    chineseRoofTiny(k, [0, 2.4, -0.1]);
  });
  out.furnaceAnchor = anchor(group, 'furnace', fx, 0.5, fz + 0.45);
  out.lights.push(lightSpec('candle', anchor(group, 'furnaceGlow', fx + 0.15, 0.45, fz + 0.5), { color: 0xff5a1a, intensity: 1.2, distance: 3.5 }));
  out.colliders.push({ x: fx, z: fz, hx: 0.55, hz: 0.5, yaw: -0.4 });

  // ---- lanterns ---------------------------------------------------------------------------
  const lanternPts = [];
  // porch eave row
  for (let i = 0; i < 6; i++) {
    const x = -2.9 + i * 1.16;
    lantern(k, { p: [x, y0 + 3.3, pzCol + 0.35], s: 1.25, r: rng() * 6 });
    lanternPts.push(V(x, y0 + 3.3 - 0.22, pzCol + 0.35));
  }
  // tall lantern poles at the forecourt corners + strings across and to the porch
  const poleX = 5.2, poleZ = pz0 + 4.2, poleH = 5.2;
  for (const s of [-1, 1]) {
    k.add(mat('lacquer'), cyl(0.08, 0.1, poleH, 10, 0.01, 4), { p: [s * poleX, 0, poleZ], r: [0, 0, s * 0.02], color: 0x8a1a12, w: { grime: 0.6, grimeH: 1.2, streak: 0.4 } });
    k.add(mat('gold'), G('polefinial', () => lathe([[0, 0], [0.1, 0.02], [0.06, 0.12], [0.08, 0.2], [0, 0.32]], 10)), { p: [s * poleX - s * 0.1, poleH, poleZ], color: GOLD, w: false });
    out.colliders.push({ x: s * poleX, z: poleZ, r: 0.15 });
  }
  lanternPts.push(...lanternString(k, V(-poleX + 0.1, poleH - 0.3, poleZ), V(poleX - 0.1, poleH - 0.3, poleZ), { count: opts.lanternCount ?? 9, sag: 0.9, seed: seed + 1, size: 1.05 }));
  for (const s of [-1, 1]) {
    lanternPts.push(...lanternString(k, V(s * (poleX - 0.1), poleH - 0.35, poleZ), V(s * 3.3, y0 + 3.6, pzCol + 0.2), { count: 4, sag: 0.45, seed: seed + 3 + s }));
    // string out toward the nose of the wedge (over the approach)
    lanternPts.push(...lanternString(k, V(s * (poleX - 0.1), poleH - 0.4, poleZ), V(s * 1.6, 2.9, noseZ + 0.2), { count: 5, sag: 0.6, seed: seed + 6 + s, size: 0.95 }));
  }
  lanternPts.forEach((p, i) => out.lanternAnchors.push(anchor(group, 'lantern' + i, p.x, p.y, p.z)));
  // a subset of lanterns become pooled lights
  out.lanternAnchors.forEach((a, i) => { if (i % 4 === 1) out.lights.push(lightSpec('lantern', a)); });
  // warm "golden shrine" fill from the forecourt (reference 2)
  out.lights.unshift(lightSpec('shrine_gold', anchor(group, 'shrineGlow', 0, 2.4, pz0 + 1.4), { intensity: 26, distance: 16, pool: true, poolIntensity: 0.6, glow: { size: 1.4, color: 0xffb860, opacity: 0.35 } }));
  // a warm lamp hidden under the porch roof lighting the facade, sign board and columns
  out.lights.push(lightSpec('shrine_gold', anchor(group, 'porchLamp', 0, y0 + 3.2, pzCol + 0.6), { intensity: 12, distance: 9, pool: false, glow: false, flicker: 'candle' }));

  // ---- signposts at the Y -------------------------------------------------------------------
  // the wedge nose: a little mound with moss and old offerings around the posts
  k.add(mat('soil'), G('nose', () => blob(2.0, 1.0, 5, 20, 0.25)), { p: [0, 0.02, noseZ - 0.4], color: 0x4a4434, w: { mossLow: 0.6, mossH: 0.1 } });
  forkSignpost(k, [-1.25, 0, noseZ], -1, rng);
  forkSignpost(k, [1.25, 0, noseZ + 0.3], 1, rng);
  out.leftSignAnchor = anchor(group, 'signL', -1.25, 1.82, noseZ + 0.1, 0);
  out.rightSignAnchor = anchor(group, 'signR', 1.25, 1.82, noseZ + 0.4, 0);
  out.colliders.push({ x: -1.25, z: noseZ, r: 0.12 }, { x: 1.25, z: noseZ + 0.3, r: 0.12 });
  k.details(() => {
    // zebras + old garlands at the foot of the posts
    for (const s of [-1, 1]) {
      bottle(k, { p: [s * 0.95, 0.02, noseZ + 0.35], straw: true, color: PAL.sodaRed });
      garland(k, { p: [s * 1.25 + 0.06, 1.3, noseZ + 0.08 + (s > 0 ? 0.3 : 0)], len: 0.18, color: s < 0 ? 0xe8e4dc : PAL.jasmine });
    }
    incensePot(k, { p: [0, 0.02, noseZ + 0.45], rad: 0.09, color: 0x8a2418, sticks: 14, seed: seed + 21 });
  });
  out.incenseAnchors.push(anchor(group, 'noseIncense', 0, 0.15, noseZ + 0.45));

  // ---- puddles, stains, fallen leaves --------------------------------------------------
  const stm = texMat('stain_shrine', () => stainTex(seed + 4, '20,24,18'), { transparent: true, decal: true });
  for (let i = 0; i < 4; i++) k.add(stm, G('stainq', () => quad(2.2, 2.2)), { p: [(rng() - 0.5) * 8, 0.005, pz0 + 1 + rng() * 5], r: [-Math.PI / 2, 0, rng() * 6], color: 0xffffff, uv: 'keep', w: false });

  group.add(k.build({ name: 'shrineMaRuay', detailDistance: 45 }));

  // ---- the statue head as its own swappable group -----------------------------------------
  const headWorld = headPos.clone().multiplyScalar(SS).add(V(0, y0 + DAIS, dz));
  const hk = new Kit(seed + 5, { grime: 0.15, grimeH: 0.05, vary: 0.08 });
  deityHeadParts(hk);
  const head = hk.build({ name: 'deityHead' });
  head.position.copy(headWorld);
  head.scale.setScalar(SS * 1.08);
  head.name = 'statueHead';
  group.add(head);
  out.statueHead = head;
  out.statueAnchor = anchor(group, 'statue', 0, y0 + DAIS, dz);
  out.statueFaceAnchor = anchor(group, 'statueFace', headWorld.x, headWorld.y + 0.01, headWorld.z + 0.16);
  out.altarAnchor = anchor(group, 'altar', 0, at, az + 0.25);
  const pot = anchor(group, 'altarIncense', 0, at + 0.2, az + 0.05);
  out.incenseAnchors.unshift(pot);
  out.smokeAnchors = [pot, out.burnerAnchor, anchor(group, 'furnaceSmoke', fx - 0.1, 2.5, fz - 0.1)];
  out.lights.push(lightSpec('shrine_gold', anchor(group, 'statueLight', 0, headWorld.y + 0.2, dz + 1.1), { intensity: 3.0, distance: 4.5, pool: false, glow: false, color: 0xffb070, flicker: 'candle' }));
  // passenger / player positions
  out.forecourtAnchor = anchor(group, 'forecourt', 0, 0, pz0 + 4.5);
  out.handSpawnAnchor = anchor(group, 'hand', opts.handSpawn?.[0] ?? -11, 0, opts.handSpawn?.[1] ?? -26);
  // collision: hall walls + platform edges (the platform is walkable via the steps)
  out.colliders.push(
    { x: 0, z: hz - HD / 2, hx: HW / 2, hz: 0.15, yaw: 0 },
    { x: -HW / 2, z: hz, hx: 0.15, hz: HD / 2, yaw: 0 },
    { x: HW / 2, z: hz, hx: 0.15, hz: HD / 2, yaw: 0 },
    { x: -(doorW / 2 + (HW - doorW) / 4), z: hf, hx: (HW - doorW) / 4, hz: 0.15, yaw: 0 },
    { x: doorW / 2 + (HW - doorW) / 4, z: hf, hx: (HW - doorW) / 4, hz: 0.15, yaw: 0 },
    { x: 0, z: az, hx: 1.3, hz: 0.4, yaw: 0 },
  );
  out.footprint = { x: 0, z: pzc + 1.5, hx: PW / 2 + 1.0, hz: PD / 2 + 4.5 };
  out.walkSurfaces = [{ x: 0, z: pzc, hx: PW / 2, hz: PD / 2, yaw: 0, y: PH }];
  return out;
}
const _mossC = new THREE.Color(0x46562a);
const _stoneC = new THREE.Color(0x8a8478);
const _darkC = new THREE.Color(0x120806);
const _woodC = new THREE.Color(0x4a3020);

function chineseRoofTiny(k, p) {
  k.at(p, null, 0.5, () => chineseRoof(k, { w: 1.0, d: 0.9, h: 0.35, color: 0x2a6a4a, ridge: 0xd8a040 }));
}
