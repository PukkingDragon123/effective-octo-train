// ศาลา roadside pavilions (2 variants) and the abandoned bus stop.
import * as THREE from 'three';
import { Kit, bevelBox, bbox, lathe, cyl, tube, torus, sphere, quad, extrude, smoothPath, blob, squareMoulding, makeRng, noise } from './lib/kit.js';
import { mat, glowMat, signMat, texMat, graffitiTex, crackTex, stainTex, clockTex, noticeTex, bugDiffuserTex } from './lib/materials.js';
import { lightSpec, attachFlicker } from './lib/lights.js';
import { G, PAL, plasticChair, plasticStool, bottle, can, oilDrum, trashBag, crate, garland } from './lib/small.js';
import { chofa } from './shrines.js';
import { posterStack, litter, card, findPrint, missingPoster, snackBag } from './lib/print.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function anchor(parent, name, x, y, z, yaw = 0) {
  const a = new THREE.Object3D();
  a.name = name;
  a.position.set(x, y, z);
  a.rotation.y = yaw;
  parent.add(a);
  return a;
}

/** Decal quad (alpha) flush on a surface. normal axis given by rotation. */
function decal(k, m, w, h, o) {
  k.add(m, G(`decal:${w}:${h}`, () => quad(w, h)), { color: o.color ?? 0xffffff, uv: 'keep', w: false, ...o });
}

/**
 * Broken fluorescent fixture hanging from a beam by two chains, one snapped: the fixture
 * dangles at an angle. Returns { anchorPos (kit space) }. Adds per-lamp glow meshes to group.
 */
export function hangingFluorescent(k, group, o) {
  const len = 1.22;
  const tilt = o.broken ? 0.42 : 0.0;
  const chainL = o.chain ?? 0.35;
  // chains (thin tubes); one snapped and dangling
  k.add(mat('galv'), tube([V(len / 2 - 0.08, 0, 0), V(len / 2 - 0.08, -chainL, 0)], 0.004, 3), { color: 0x6a6a64, w: false });
  if (o.broken) k.add(mat('galv'), tube([V(-len / 2 + 0.08, 0, 0), V(-len / 2 + 0.1, -0.12, 0.01)], 0.004, 3), { color: 0x6a6a64, w: false });
  else k.add(mat('galv'), tube([V(-len / 2 + 0.08, 0, 0), V(-len / 2 + 0.08, -chainL, 0)], 0.004, 3), { color: 0x6a6a64, w: false });
  // fixture body pivoting around the intact chain end
  const pivot = V(len / 2 - 0.08, -chainL, 0);
  k.push([pivot.x, pivot.y, pivot.z], [0, 0, tilt]);
  k.push([-(len / 2 - 0.08), -0.03, 0]);
  k.add(mat('metal'), G('fixtureBody', () => bevelBox(len, 0.05, 0.11, 0.008, 0.2)), { color: 0xd8d4c4, w: { grime: 0, streak: 0.7, streakColor: 0x6a5a3a, dust: 0.6, dustColor: 0x5a5040 } });
  const glow = glowMat(o.dying ? 'fluoro_dim' : 'fluoro', { shared: false });
  const diff = glowMat('fluoro_dim', { shared: false, map: bugDiffuserTex(o.seed ?? 9) });
  diff.userData.baseEmissive = 1.3;
  const kk = new Kit(1);
  kk.stack[0].copy(k.matrix);
  kk.add(glow, G('fluoTubeX', () => cyl(0.013, 0.013, len - 0.12, 8, 0.002).rotateZ(Math.PI / 2).translate((len - 0.12) / 2, 0, 0)), { p: [0, -0.04, 0], color: 0xffffff, w: false });
  if (!o.noDiffuser) {
    kk.add(diff, G('diffX', () => {
      const g = new THREE.CylinderGeometry(0.05, 0.05, (len - 0.1) * 0.6, 12, 1, true, Math.PI, Math.PI);
      g.rotateZ(Math.PI / 2);
      return g;
    }), { p: [-0.2, -0.035, 0], color: 0xffffff, w: false, uv: 'keep' });
  }
  const lamp = kk.build({ name: 'fluo', shadows: false });
  const ctls = lamp.children.map((m) => attachFlicker(m, m.material, o.dying ? 'dying' : 'fluorescent', o.seed ?? 3));
  group.add(lamp);
  const ap = V(0, -0.08, 0).applyMatrix4(k.matrix);
  k.pop();
  k.pop();
  // power cord
  k.add(mat('dark'), tube(smoothPath([V(0, 0, 0.04), V(0.2, -0.15, 0.06), V(pivot.x - 0.2, -chainL + 0.05, 0.05)], 8), 0.004, 3), { color: 0x151515, w: false });
  return { anchorPos: ap, controllers: ctls };
}

// ---------------------------------------------------------------------------
// Sala
// ---------------------------------------------------------------------------
/**
 * ศาลาพักทาง. opts {variant:1|2, seed}
 * -> { object, seats: Object3D[], waitSpot, lampAnchor, lightSpec, lights, colliders,
 *      shadowSpots: Object3D[] (behind the back pillars, for the "shadows behind the sala"
 *      encounter), floorHeight, walkSurfaces:[{x,z,hx,hz,yaw,y}], clockAnchor }
 */
export function createSala(opts = {}) {
  const variant = opts.variant ?? 1;
  const seed = opts.seed ?? variant;
  const rng = makeRng(seed * 101 + 9);
  const group = new THREE.Group();
  group.name = 'sala' + variant;
  const age = variant === 2 ? 1 : 0.75;
  const k = new Kit(seed, { grime: 0.6, grimeH: 0.7, mossLow: 0.8 * age, mossH: 0.7, moss: 0.35 * age, streak: 0.45 * age, vary: 0.2 });
  const W = variant === 1 ? 4.4 : 5.4, D = variant === 1 ? 3.0 : 3.3;
  const FH = 0.16; // floor height
  const PH = 2.55; // pillar height above floor
  const out = { object: group, seats: [], colliders: [], lights: [], shadowSpots: [], lampControllers: [], floorHeight: FH };

  // ---- floor slab (cracked, chipped edges, moss in the corners) -------------
  k.add(mat('concrete'), bbox(W + 0.3, FH, D + 0.3, 0.03, 0.4), {
    color: 0xa8a294, jitter: 0.006, jitterFreq: 3,
    w: { grime: 0.3, grimeH: FH + 0.02, moss: 0.25, dust: 0.25 },
    colorFn: (p, n, c) => {
      if (n.y > 0.5) {
        // edge moss + damp
        const e = Math.min(W / 2 + 0.15 - Math.abs(p.x), D / 2 + 0.15 - Math.abs(p.z));
        if (e < 0.35) c.lerp(_moss, (1 - e / 0.35) * 0.55 * (0.6 + 0.4 * noise.noise2D(p.x * 3, p.z * 3)));
      }
    },
  });
  // broken chunk missing at a front corner + rubble
  k.add(mat('concrete'), G('rubble', () => bevelBox(0.18, 0.08, 0.14, 0.02, 0.1)), { p: [W / 2 + 0.25, 0.04, D / 2 + 0.3], r: [0.2, 0.5, 0.1], color: 0x9a948a, jitter: 0.02, jitterFreq: 12 });
  k.add(mat('concrete'), G('rubble2', () => bevelBox(0.1, 0.05, 0.09, 0.015, 0.1)), { p: [W / 2 + 0.45, 0.025, D / 2 + 0.1], r: [0.1, 1.5, 0.3], color: 0x8a847a, jitter: 0.015, jitterFreq: 15 });
  // front step
  k.add(mat('concrete'), bbox(1.4, FH * 0.5, 0.35, 0.03, 0.3), { p: [0, 0, D / 2 + 0.3], color: 0xa09a8c, w: { grime: 0.5, mossLow: 0.9, mossH: 0.1 } });
  // cracks on the floor (decals)
  const cm = texMat('crack1', () => crackTex(seed + 1), { transparent: true, decal: true });
  for (let i = 0; i < 3; i++) decal(k, cm, 1.2 + rng(), 1.2 + rng(), { p: [(rng() - 0.5) * W * 0.8, FH + 0.003, (rng() - 0.5) * D * 0.7], r: [-Math.PI / 2, 0, rng() * 6] });
  const sm = texMat('stain_dark', () => stainTex(seed + 2, '30,28,20'), { transparent: true, decal: true });
  for (let i = 0; i < 2; i++) decal(k, sm, 1.6, 1.4, { p: [(rng() - 0.5) * W * 0.7, FH + 0.004, (rng() - 0.5) * D * 0.6], r: [-Math.PI / 2, 0, rng() * 6] });

  // ---- pillars --------------------------------------------------------------
  const px = W / 2 - 0.2, pz = D / 2 - 0.2;
  const pillarXs = variant === 1 ? [-px, px] : [-px, 0, px];
  const pillars = [];
  for (const x of pillarXs) for (const z of [-pz, pz]) pillars.push([x, z]);
  for (const [x, z] of pillars) {
    const lean = (rng() - 0.5) * 0.015;
    k.add(mat('plaster'), bbox(0.24, PH, 0.24, 0.025, 0.25), {
      p: [x, FH, z], r: [lean, 0, lean], color: variant === 2 ? 0xbcb4a2 : 0xe0dacb, jitter: 0.004, jitterFreq: 5,
      w: { ground: FH, grime: 0.55, grimeH: 0.9, mossLow: 0.9 * age, mossH: 0.75, streak: 0.6 * age },
      colorFn: (p, n, c) => {
        // peeling paint patches revealing grey concrete
        const pn = noise.noise3D(p.x * 4.5 + x, p.y * 2.2, p.z * 4.5);
        if (pn > 0.35) c.lerp(_conc, Math.min(1, (pn - 0.35) * 4) * 0.8);
      },
    });
    // moulded plinth (stepped, chamfered) + capital under the ring beam, mitred profiles
    k.add(mat('concrete'), G('plinthM', () => squareMoulding(0.12, 0.12, [[0.06, 0], [0.06, 0.1], [0.045, 0.115], [0.04, 0.14], [0.025, 0.155], [0.02, 0.18], [0.004, 0.2], [0, 0.205]])), { p: [x, FH, z], r: [lean, 0, lean], color: 0x9a948a, jitter: 0.004, jitterFreq: 9, w: { ground: FH, mossLow: 1, mossH: 0.25, grime: 0.7 } });
    k.add(mat('plaster'), G('capitalM', () => squareMoulding(0.12, 0.12, [[0, 0], [0.008, 0.006], [0.008, 0.03], [0.022, 0.045], [0.026, 0.07], [0.04, 0.085], [0.04, 0.11], [0, 0.11]])), { p: [x + lean * (PH - 0.36), FH + PH - 0.36, z - lean * (PH - 0.36)], r: [lean, 0, lean], color: variant === 2 ? 0xb0a894 : 0xd8d0bc, w: { streak: 0.7 * age, grime: 0, moss: 0.4 } });
    out.colliders.push({ x, z, hx: 0.15, hz: 0.15, yaw: 0 });
  }
  // ---- beams (concrete ring beam) ---------------------------------------------
  const by = FH + PH;
  for (const z of [-pz, pz]) k.add(mat('plaster'), bbox(W - 0.1, 0.24, 0.2, 0.02, 0.35), { p: [0, by - 0.06, z], color: 0xddd6c4, w: { streak: 0.7 * age, grime: 0.0, moss: 0.4 } });
  for (const x of pillarXs) k.add(mat('plaster'), bbox(0.2, 0.24, D - 0.1, 0.02, 0.35), { p: [x, by - 0.06, 0], color: 0xddd6c4, w: { streak: 0.7 * age, grime: 0.0, moss: 0.4 } });

  // ---- roof ---------------------------------------------------------------------
  const RH = variant === 1 ? 1.45 : 1.1; // ridge height above beam top
  const ovX = 0.55, ovZ = 0.6;
  const roofY = by + 0.18;
  const halfD = D / 2 + ovZ;
  const slope = Math.hypot(halfD, RH);
  const ang = Math.atan2(RH, halfD);
  for (const s of [-1, 1]) {
    k.add(mat(variant === 1 ? 'tiles' : 'corrugated'), bevelBox(W + ovX * 2, variant === 1 ? 0.06 : 0.025, slope, 0.01, 0.25), {
      p: [0, roofY + RH / 2, (s * halfD) / 2], r: [s * ang, 0, 0], color: variant === 1 ? 0x9a5034 : 0x8a6a50,
      w: { grime: 0, moss: variant === 1 ? 0.7 : 0.25, streak: 0.0, vary: 0.25 },
      deform: (p) => {
        const u = (p.z * s) / (slope / 2);
        p.y -= 0.05 * (1 - u * u); // sagging old roof
        p.y += noise.noise2D(p.x * 0.8, p.z * 0.8) * 0.02;
        if (variant === 2) p.y += Math.sin(p.x * 2 * Math.PI / 0.076) * 0.012; // corrugations
        else p.y += Math.abs(Math.sin(p.x * Math.PI / 0.22)) * 0.02 + (Math.abs(Math.sin(p.z * Math.PI / 0.3)) < 0.15 ? -0.01 : 0); // tile rows
      },
      colorFn: (p, n, c, lp) => {
        if (variant === 2) {
          // rust streaks running down the sheets + a few lighter replaced panels
          const r = noise.noise2D(lp.x * 3.2, 0.5) * 0.5 + noise.noise2D(lp.x * 11, lp.z * 0.6) * 0.5;
          c.lerp(_rust, Math.max(0, r) * 0.9);
          if (Math.floor((lp.x + W) / 0.9) % 5 === 2) c.lerp(_galv, 0.5);
        }
      },
    });
  }
  // ridge cap
  k.add(mat(variant === 1 ? 'tiles' : 'corrugated'), bevelBox(W + ovX * 2 + 0.05, 0.08, 0.2, 0.03, 0.25), { p: [0, roofY + RH + 0.03, 0], color: variant === 1 ? 0x7a3a24 : 0x6a4a34, w: { moss: 0.6, grime: 0 } });
  // gable ends: triangular wooden panel with sunburst + bargeboards (pan lom)
  for (const sx of [-1, 1]) {
    const gx = sx * (W / 2 - 0.05);
    const shape = new THREE.Shape();
    shape.moveTo(-(D / 2 + 0.05), 0);
    shape.lineTo(D / 2 + 0.05, 0);
    shape.lineTo(0, RH - 0.05);
    shape.closePath();
    k.add(mat(variant === 1 ? 'wood' : 'plaster'), G(`salagable:${D}:${RH}:${variant}`, () => extrude(shape, 0.04, 0)), {
      p: [gx, roofY, 0], r: Math.PI / 2, color: variant === 1 ? 0x7a5a3c : 0xd0c8b4, w: { grime: 0, streak: 0.6, vary: 0.25 },
      colorFn: (p, n, c, lp) => {
        if (variant === 1) {
          const a = Math.atan2(lp.y, lp.x);
          if (Math.abs(Math.sin(a * 18)) > 0.92 && lp.y > 0.05) c.multiplyScalar(0.55); // sunburst boards
        }
      },
    });
    if (variant === 1) {
      for (const s of [-1, 1]) {
        // bargeboard (pan lom) running down the gable along the slope (length along local Z)
        k.add(mat('wood'), bevelBox(0.04, 0.18, slope + 0.1, 0.01, 0.3), { p: [sx * (W / 2 + ovX + 0.02), roofY + RH / 2 + 0.06, (s * halfD) / 2], r: [s * ang, 0, 0], color: 0x5a3e28, w: { grime: 0, streak: 0.5, moss: 0.5 } });
      }
      chofa(k, [sx * (W / 2 + ovX + 0.02), roofY + RH + 0.14, 0], 2.4, 0x8a6a3a, sx > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }
  // underside: rafters + purlins (visible from inside)
  for (let i = -3; i <= 3; i++) {
    for (const s of [-1, 1]) {
      k.add(mat('wood'), G(`rafter:${slope}`, () => bbox(0.06, 0.09, slope * 0.95, 0.01, 0.4)), { p: [i * (W / 7), roofY + RH / 2 - 0.08, (s * halfD) / 2], r: [s * ang, 0, 0], color: 0x4a3626, w: { grime: 0, vary: 0.3 } });
    }
  }
  for (let j = 0; j < 3; j++) {
    for (const s of [-1, 1]) {
      const t = 0.25 + j * 0.28;
      k.add(mat('wood'), G(`purlin:${W}`, () => bbox(W + 0.6, 0.06, 0.06, 0.01, 0.4)), { p: [0, roofY + RH * (1 - t) - 0.12, s * halfD * t], color: 0x3e2c1e, w: { grime: 0, vary: 0.3 } });
    }
  }
  // king post + tie beam inside
  k.add(mat('wood'), bbox(W - 0.4, 0.12, 0.1, 0.01, 0.4), { p: [0, roofY - 0.02, 0], color: 0x4a3626, w: { grime: 0, dust: 0.5 } });

  // ---- back wall + benches ----------------------------------------------------------
  const wallH = variant === 1 ? 1.5 : 0.95;
  k.add(mat('plaster'), bbox(W - 0.4, wallH, 0.14, 0.02, 0.3), {
    p: [0, FH, -pz], color: variant === 1 ? 0xd8cfb8 : 0xc8c0aa, jitter: 0.003,
    w: { ground: FH, grime: 0.6, grimeH: 0.6, mossLow: 0.9 * age, mossH: 0.5, streak: 0.5 },
    colorFn: (p, n, c) => {
      const pn = noise.noise3D(p.x * 3, p.y * 3, 7);
      if (pn > 0.4) c.lerp(_conc, Math.min(1, (pn - 0.4) * 4) * 0.7);
    },
  });
  k.add(mat('plaster'), G(`wallcap:${W}`, () => squareMoulding((W - 0.4) / 2, 0.07, [[0, 0], [0.012, 0.01], [0.02, 0.03], [0.02, 0.045], [0.0, 0.06]], { top: true })), { p: [0, FH + wallH, -pz], color: 0xcfc7b0, w: { moss: 0.8, streak: 0.6 } });
  out.colliders.push({ x: 0, z: -pz, hx: (W - 0.4) / 2, hz: 0.1, yaw: 0 });
  // L-shaped built-in concrete benches (back + one side), cracked with a broken corner
  const benchY = FH + 0.42;
  const benchSeg = (x, z, w, d, rot) => {
    k.add(mat('concrete'), bbox(w, 0.07, d, 0.02, 0.3), { p: [x, benchY - 0.07, z], r: rot, color: 0xb4ae9e, jitter: 0.004, w: { ground: FH, moss: 0.35, dust: 0.3, grime: 0.2 } });
    // rounded front nosing worn smooth by years of sitting
    k.at([x, benchY - 0.035, z], rot, null, () => k.add(mat('concrete'), G(`bnose:${w.toFixed(2)}`, () => cyl(0.04, 0.04, w - 0.02, 10, 0.01).rotateZ(Math.PI / 2).translate(w / 2 - 0.01, 0, 0)), { p: [0, 0, d / 2 - 0.02], color: 0xb8b2a2, jitter: 0.003, jitterFreq: 11, w: { moss: 0.3, dust: 0.3 } }));
    const nLegs = Math.max(2, Math.round(w / 1.2) + 1);
    for (let i = 0; i < nLegs; i++) {
      const lx = -w / 2 + 0.15 + (i / (nLegs - 1)) * (w - 0.3);
      k.at([x, 0, z], rot, null, () => k.add(mat('concrete'), G('blegs', () => bbox(0.12, benchY - 0.07 - FH, d * 0.8, 0.015, 0.2)), { p: [lx, FH, 0], color: 0xa29c8e, w: { ground: FH, mossLow: 0.8, mossH: 0.3 } }));
    }
  };
  const bw = W - 0.9;
  benchSeg(0, -pz + 0.3, bw, 0.38, 0);
  if (variant === 1) benchSeg(-px + 0.32, 0.15, D - 1.3, 0.36, Math.PI / 2);
  else benchSeg(px - 0.32, 0.15, D - 1.3, 0.36, -Math.PI / 2);
  out.colliders.push({ x: 0, z: -pz + 0.3, hx: bw / 2, hz: 0.2, yaw: 0 });
  // seats (on the back bench, facing the road)
  const nSeats = variant === 1 ? 3 : 4;
  for (let i = 0; i < nSeats; i++) {
    const x = -bw / 2 + 0.5 + (i / (nSeats - 1)) * (bw - 1.0);
    out.seats.push(anchor(group, 'seat' + i, x, benchY, -pz + 0.32, 0));
  }
  // bench crack + chipped corner
  decal(k, cm, 0.6, 0.6, { p: [0.4, benchY + 0.002, -pz + 0.3], r: [-Math.PI / 2, 0, 1.2] });

  // ---- posters, clock, graffiti on the back wall -----------------------------------
  const wz = -pz + 0.072;
  if (variant === 1) {
    k.add(signMat('poster', { variant: seed % 3 }), G('poster', () => quad(0.42, 0.6, 2, 3)), { p: [-1.15, FH + 1.05, wz], r: [0, 0, 0.03], color: 0xd8d0c0, uv: 'keep', w: { grime: 0.3, grimeH: 0.4, ground: FH + 0.75, vary: 0.3 }, deform: (p) => { p.z += Math.max(0, p.y - 0.2) * Math.max(0, p.x) * 0.25; } });
    k.add(texMat('notice1', () => noticeTex(1), { decal: true }), G('noticeq', () => quad(0.21, 0.29)), { p: [-0.62, FH + 1.12, wz], r: [0, 0, -0.06], color: 0xffffff, uv: 'keep', w: { vary: 0.3, grime: 0 } });
    k.add(signMat('poster', { variant: (seed + 1) % 3 }), G('poster', () => quad(0.42, 0.6, 2, 3)), { p: [1.2, FH + 1.0, wz], r: [0, 0, -0.02], color: 0xc8c0b0, uv: 'keep', w: { grime: 0.4, vary: 0.35 }, deform: (p) => { if (p.y < -0.15) p.z += (p.x + 0.2) * 0.12; } });
  } else {
    k.add(texMat('notice2', () => noticeTex(2), { decal: true }), G('noticeq', () => quad(0.21, 0.29)), { p: [px + 0.125, FH + 1.4, 0.2], r: [0, Math.PI / 2, 0.05], color: 0xffffff, uv: 'keep', w: { vary: 0.3, grime: 0 } });
    k.add(signMat('poster', { variant: seed % 3 }), G('poster', () => quad(0.42, 0.6, 2, 3)), { p: [-px - 0.125, FH + 1.45, -0.6], r: [0, -Math.PI / 2, 0.04], color: 0xc0b8a8, uv: 'keep', w: { vary: 0.35, grime: 0 } });
  }
  decal(k, texMat('graffiti' + seed, () => graffitiTex(seed + 40), { transparent: true, decal: true }), 1.9, 0.95, { p: [variant === 1 ? 0.1 : -0.6, FH + 0.62, wz + 0.002] });
  // wall clock (stopped) hanging on the wall or the beam
  const clockPos = variant === 1 ? [0.2, FH + 1.3, wz + 0.02] : [0, by - 0.36, pz - 0.11];
  k.at(clockPos, variant === 1 ? 0 : Math.PI, null, () => {
    k.add(mat('plastic'), G('clockRim', () => cyl(0.16, 0.16, 0.045, 20, 0.01).rotateX(Math.PI / 2)), { color: 0x7a2a22, w: { dust: 0.5, grime: 0 } });
    k.add(texMat('clock', () => clockTex(), {}), G('clockFace', () => new THREE.CircleGeometry(0.14, 20)), { p: [0, 0, 0.024], color: 0xd8d0b8, uv: 'keep', w: false });
  });
  out.clockAnchor = anchor(group, 'clock', ...clockPos);

  // ---- printed matter: torn layered posters on the front pillars, a newspaper left on the
  //      bench, wrappers / receipts / lottery stubs on the floor --------------------------------
  k.details(() => {
    for (const x of pillarXs) {
      // front face of each front pillar (+Z) and the inner face of one back pillar
      posterStack(k, { p: [x, FH + 1.3 + rng() * 0.25, pz + 0.123], w: 0.2, n: 2 + Math.floor(rng() * 3), seed: seed * 7 + Math.round(x * 10), spread: 0.04 });
    }
    posterStack(k, { p: [pillarXs[0] + 0.123, FH + 1.9, -pz + 0.02], r: Math.PI / 2, w: 0.2, n: 3, seed: seed * 11 + 3, spread: 0.04, top: missingPoster() });
    const news = findPrint([['newspaper']], rng);
    if (news) card(k, news.kind, news.opts, { p: [-bw / 2 + 0.9, benchY + 0.006, -pz + 0.32], r: [-Math.PI / 2, 0, 0.4, 'XYZ'], scale: 0.85, fold: 0.1, seed: seed + 5, wt: { vary: 0.3, dust: 0.3 } });
    litter(k, 0, 0.2, Math.min(W, D) * 0.45, { n: variant === 2 ? 14 : 9, y: FH, seed: seed + 13 });
    litter(k, W / 2 + 0.3, pz + 0.7, 0.7, { n: 5, y: 0, seed: seed + 17 });
    if (variant === 2) snackBag(k, { p: [px - 0.4, benchY + 0.01, 0.2], r: [-1.35, 0.4, 0, 'YXZ'], seed: seed + 2 });
  });

  // ---- loose furniture + litter ---------------------------------------------------------
  k.details(() => {
    const chairCols = [PAL.chairRed, PAL.chairBlue, PAL.chairWhite, PAL.chairGreen];
    plasticChair(k, { p: [0.9, FH, 0.25], r: -0.4 + rng() * 0.3, color: chairCols[seed % 4], dust: 0.7 });
    if (variant === 1) plasticChair(k, { p: [-0.3, FH, 0.5], r: 0.5, color: chairCols[(seed + 1) % 4], dust: 0.6 });
    // a tipped-over chair
    k.at([variant === 1 ? 1.6 : -1.3, FH, 0.8], [0, 1.0, 0], null, () => plasticChair(k, { p: [0, 0.22, 0], r: [Math.PI / 2 - 0.15, 0, 0], color: chairCols[(seed + 2) % 4], dust: 0.4 }));
    plasticStool(k, { p: [-1.4, FH, 0.6], color: PAL.chairBlue });
    // trash bin: cut-down oil drum (variant 2) or round plastic bin
    if (variant === 2) oilDrum(k, { p: [px - 0.1, FH, pz + 0.55], rusty: true, s: [0.8, 0.75, 0.8] });
    else k.add(mat('plastic'), G('bin', () => cyl(0.24, 0.2, 0.62, 14, 0.015, 3)), { p: [px - 0.05, FH, pz + 0.5], color: 0x2a6a4a, w: { grime: 0.7, grimeH: 0.4, streak: 0.4 } });
    trashBag(k, { p: [px + 0.35, 0, pz + 0.7], s: 0.6 });
    for (let i = 0; i < 4; i++) bottle(k, { p: [(rng() - 0.5) * W * 0.8, FH + 0.03, (rng() - 0.3) * D * 0.6], r: [Math.PI / 2, rng() * 6, 0], kind: rng() < 0.5 ? 'water' : 'beer', label: rng() < 0.5 });
    can(k, { p: [-0.7, FH, -0.4], r: [1.4, 0.3, 0], h: 0.12, color: 0x9a2a1a });
    // dry leaves on the floor
    for (let i = 0; i < 26; i++) {
      k.add(mat('flower'), G('leafbit', () => blob(0.04, 0.025, 3, 6, 0.4)), { p: [(rng() - 0.5) * (W + 0.6), FH + 0.006, (rng() - 0.5) * (D + 0.4)], r: [0, rng() * 6, 0], color: rng() < 0.5 ? 0x6a4a28 : 0x4a3a20, w: false });
    }
  });

  // ---- vines and dead leaves hanging from the eaves (more on the older sala) ----------------
  const nVines = variant === 2 ? 22 : 9;
  for (let i = 0; i < nVines; i++) {
    const s = rng() < 0.5 ? -1 : 1;
    const x = (rng() - 0.5) * (W + 0.8);
    const z0 = s * (halfD - 0.05);
    const y0e = roofY + 0.04;
    const len = 0.4 + rng() * (variant === 2 ? 1.6 : 0.9);
    k.add(mat('flower'), tube(smoothPath([V(x, y0e, z0), V(x + (rng() - 0.5) * 0.1, y0e - len * 0.5, z0 + s * 0.03), V(x + (rng() - 0.5) * 0.15, y0e - len, z0 + s * 0.02)], 6), (t) => 0.01 * (1 - t * 0.6), 3), { color: rng() < 0.4 ? 0x4a3a20 : 0x2e4a1e, w: false });
    if (rng() < 0.6) k.add(mat('flower'), G('vleaf', () => blob(0.05, 0.03, 9, 6, 0.3).rotateX(Math.PI / 2)), { p: [x, y0e - len * (0.4 + rng() * 0.5), z0 + s * 0.04], r: [0, rng() * 6, rng()], color: 0x3a5a22, w: false });
  }
  // ---- broken fluorescent fixture hanging from the tie beam -----------------------------
  k.push([0.3, roofY - 0.08, 0.05]);
  const fl = hangingFluorescent(k, group, { broken: variant === 2 || rng() < 0.5, dying: true, seed: seed + 3 });
  k.pop();
  out.lampControllers.push(...fl.controllers);
  out.lampAnchor = anchor(group, 'lamp', fl.anchorPos.x, fl.anchorPos.y, fl.anchorPos.z);
  out.lightSpec = lightSpec('dying', out.lampAnchor);
  out.lights.push(out.lightSpec);
  // name plate on the front beam
  k.add(signMat('shop_sign', { th: variant === 1 ? 'ศาลาพักร้อน' : 'ศาลาริมทาง', en: '' }), G('salaplate', () => quad(0.96, 0.3)), { p: [0, by + 0.0, pz + 0.105], color: 0xc8bca0, uv: 'keep', w: { grime: 0, streak: 0.5, vary: 0.3 } });

  group.add(k.build({ name: 'sala' + variant, detailDistance: 40 }));
  out.waitSpot = anchor(group, 'wait', 0.3, 0, D / 2 + 0.9, 0);
  for (const [x, z] of pillars.filter(([, z]) => z < 0)) out.shadowSpots.push(anchor(group, 'shadow', x * 1.05, 0, z - 0.9));
  out.walkSurfaces = [{ x: 0, z: 0, hx: W / 2 + 0.15, hz: D / 2 + 0.15, yaw: 0, y: FH }];
  return out;
}
const _moss = new THREE.Color(0x4a5a26);
const _conc = new THREE.Color(0x8a8578);
const _rust = new THREE.Color(0x6a3418);
const _galv = new THREE.Color(0xa8a8a0);

// ---------------------------------------------------------------------------
// Bus stop
// ---------------------------------------------------------------------------
/**
 * Abandoned bus stop: faded steel shelter, corrugated roof, broken ad lightbox, bench,
 * round stop sign. opts {seed} -> { object, waitSpot, seats, lampAnchor, lightSpec, lights, colliders }
 */
export function createBusStop(opts = {}) {
  const seed = opts.seed ?? 2;
  const rng = makeRng(seed * 77 + 1);
  const group = new THREE.Group();
  group.name = 'busStop';
  const k = new Kit(seed, { grime: 0.6, grimeH: 0.6, mossLow: 0.6, mossH: 0.4, streak: 0.5, vary: 0.2 });
  const W = 3.2, D = 1.4, H = 2.45;
  const out = { object: group, seats: [], colliders: [], lights: [], lampControllers: [] };
  const paint = 0x5a7a8a;
  // concrete pad
  k.add(mat('concrete'), bbox(W + 0.6, 0.1, D + 0.5, 0.02, 0.4), { p: [0, 0, 0.1], color: 0x9a968a, jitter: 0.005, w: { grime: 0.3, moss: 0.4, mossLow: 0.4 } });
  // posts (square tube) — slight lean on one
  for (const x of [-W / 2, W / 2]) {
    for (const z of [-D / 2, D / 2]) {
      const hh = z < 0 ? H : H - 0.25;
      k.add(mat('metal'), bbox(0.08, hh, 0.08, 0.008, 0.3), { p: [x, 0.1, z], r: [0, 0, x > 0 && z > 0 ? 0.03 : 0], color: paint, w: { ground: 0.1, grime: 0.6, grimeH: 0.5, streak: 0.8, streakColor: 0x6a3a1a } });
      out.colliders.push({ x, z, r: 0.07 });
    }
  }
  // roof: corrugated sheet sloping to the back on purlins
  const roofTilt = Math.atan2(0.25, D);
  k.add(mat('corrugated'), bevelBox(W + 0.5, 0.02, D + 0.5, 0.006, 0.2), {
    p: [0, H - 0.1, 0], r: [-roofTilt, 0, 0], color: 0x8a6a52, w: { grime: 0, moss: 0.4, vary: 0.25 },
    deform: (p) => { p.y += Math.sin(p.x * 2 * Math.PI / 0.076) * 0.012; if (p.x > W / 2 - 0.4 && p.z > 0.4) p.y -= (p.x - W / 2 + 0.4) * 0.25; },
    colorFn: (p, n, c, lp) => { const r = noise.noise2D(lp.x * 3.2, 0.5); c.lerp(_rust, Math.max(0, r) * 0.9); },
  });
  for (const z of [-D / 2, D / 2]) k.add(mat('metal'), bbox(W + 0.1, 0.08, 0.06, 0.006, 0.3), { p: [0, H - 0.2 + (z > 0 ? -0.12 : 0.12), z], color: paint, w: { grime: 0, streak: 0.7 } });
  // back: ad lightbox (broken glass, faded poster) + perforated side panels
  k.add(mat('metal'), bbox(1.5, 1.4, 0.12, 0.01, 0.3), { p: [0.55, 0.45, -D / 2], color: 0x8a9496, w: { ground: 0.1, grime: 0.6, streak: 0.8 } });
  k.add(signMat('poster', { variant: 2 }), G('adposter', () => quad(0.84, 1.2)), { p: [0.55, 1.15, -D / 2 + 0.065], color: 0xb8b0a0, uv: 'keep', w: { grime: 0.2, vary: 0.4 } });
  // shattered glass shards left in the frame
  for (let i = 0; i < 3; i++) {
    const sh = new THREE.Shape();
    const x0 = (rng() - 0.5) * 1.1, y0 = 0.5 + rng() * 0.6;
    sh.moveTo(x0, y0);
    sh.lineTo(x0 + 0.2 + rng() * 0.2, y0 + (rng() - 0.5) * 0.3);
    sh.lineTo(x0 + rng() * 0.15, y0 + 0.25 + rng() * 0.2);
    sh.closePath();
    k.add(mat('glass'), new THREE.ShapeGeometry(sh), { p: [0.55, 0.55, -D / 2 + 0.08], color: 0xc8d8d8, uv: 'keep', w: false });
  }
  for (const x of [-W / 2, W / 2]) {
    k.add(mat('metal'), bbox(0.03, 1.3, D - 0.1, 0.004, 0.25), {
      p: [x, 0.65, 0], color: paint, w: { ground: 0.1, streak: 0.8, grime: 0.4 },
      colorFn: (p, n, c, lp) => { if (Math.abs(n.x) > 0.5 && Math.sin(lp.y * 120) * Math.sin(lp.z * 120) > 0.6) c.multiplyScalar(0.2); },
    });
  }
  // stop name panel along the front beam
  k.add(signMat('shop_sign', { th: 'ป้ายรถประจำทาง', en: 'BUS STOP' }), G('bspanel', () => quad(1.3, 0.408)), { p: [-0.5, H - 0.36, D / 2 + 0.045], color: 0xc8c4b8, uv: 'keep', w: { vary: 0.3, grime: 0 } });
  // bench: steel frame + 3 slats (one missing)
  const by = 0.5;
  for (const x of [-1.1, 0, 1.1]) k.add(mat('metal'), G('bleg', () => bbox(0.05, by - 0.1, 0.35, 0.005, 0.2)), { p: [x, 0.1, -D / 2 + 0.38], color: 0x4a4a46, w: { ground: 0.1, grime: 0.7, streak: 0.5 } });
  for (let i = 0; i < 3; i++) {
    if (i === 1) continue;
    k.add(mat('wood'), bbox(2.6, 0.035, 0.1, 0.01, 0.3), { p: [0, by, -D / 2 + 0.25 + i * 0.12], r: [0, 0, i === 2 ? 0.03 : 0], color: 0x8a6a4a, w: { dust: 0.4, moss: 0.3, grime: 0 } });
  }
  k.add(mat('wood'), bbox(2.6, 0.1, 0.035, 0.01, 0.3), { p: [0, by + 0.3, -D / 2 + 0.15], color: 0x7a5a3a, w: { grime: 0 } });
  out.colliders.push({ x: 0, z: -D / 2 + 0.38, hx: 1.35, hz: 0.22, yaw: 0 });
  for (let i = 0; i < 3; i++) out.seats.push(anchor(group, 'seat' + i, -0.8 + i * 0.8, by + 0.03, -D / 2 + 0.37));
  // round bus stop sign on its own pole
  k.add(mat('galv'), cyl(0.03, 0.03, 2.6, 8, 0.004), { p: [W / 2 + 0.6, 0, D / 2 + 0.2], r: [0.04, 0, 0.06], color: 0x9a9a94, w: { grime: 0.6, streak: 0.4 } });
  // bus_stop_sign is an upright rounded-rect plate (texture 0.5 x 0.62, alpha corners)
  k.at([W / 2 + 0.6 + 0.12, 2.2, D / 2 + 0.3], [0.04, 0.2, 0.06], null, () => {
    k.add(mat('metal'), G('bsignback', () => bevelBox(0.47, 0.59, 0.012, 0.01, 0.2)), { p: [0, 0, -0.01], color: 0x6a6a64, w: { streak: 0.6 } });
    k.add(signMat('bus_stop_sign', {}), G('bsign', () => quad(0.5, 0.62)), { color: 0xd8d0c0, uv: 'keep', w: { vary: 0.3, grime: 0 } });
    for (const y of [-0.18, 0.18]) k.add(mat('galv'), G('bsclamp', () => bbox(0.1, 0.04, 0.03, 0.004, 0.05)), { p: [-0.12, y - 0.02, -0.03], color: 0x7a7a72 });
  });
  // dead tube under the roof front beam (flickers rarely)
  k.push([-0.3, H - 0.32, D / 2 - 0.12]);
  const fl = hangingFluorescent(k, group, { broken: false, dying: true, chain: 0.02, seed: seed + 5, noDiffuser: true });
  k.pop();
  out.lampControllers.push(...fl.controllers);
  out.lampAnchor = anchor(group, 'lamp', fl.anchorPos.x, fl.anchorPos.y, fl.anchorPos.z);
  out.lightSpec = lightSpec('dying', out.lampAnchor, { intensity: 14 });
  out.lights.push(out.lightSpec);
  // posters layered on the side panels (missing-child poster freshest on top), litter on the pad
  k.details(() => {
    posterStack(k, { p: [W / 2 + 0.018, 1.25, 0.15], r: Math.PI / 2, w: 0.36, n: 4, seed: seed * 5 + 1, spread: 0.18, top: missingPoster() });
    posterStack(k, { p: [-W / 2 + 0.018, 1.3, -0.1], r: Math.PI / 2, w: 0.34, n: 3, seed: seed * 5 + 2, spread: 0.15 });
    posterStack(k, { p: [-W / 2 - 0.018, 1.2, 0.2], r: -Math.PI / 2, w: 0.34, n: 2, seed: seed * 5 + 3, spread: 0.12 });
    litter(k, 0, 0.25, 1.5, { n: 10, y: 0.1, seed: seed + 21 });
  });
  // litter + a stray chair
  k.details(() => {
    plasticChair(k, { p: [-W / 2 - 0.6, 0.0, 0.5], r: 0.8, color: PAL.chairWhite, dust: 0.8 });
    for (let i = 0; i < 6; i++) k.add(mat('flower'), G('leafbit', () => blob(0.04, 0.025, 3, 6, 0.4)), { p: [(rng() - 0.5) * W, 0.106, (rng() - 0.5) * D], r: [0, rng() * 6, 0], color: 0x5a4224, w: false });
    bottle(k, { p: [0.9, 0.12, 0.3], r: [Math.PI / 2, 0.7, 0], kind: 'water', label: false });
    can(k, { p: [-0.6, 0.1, 0.1], color: 0x2a6aa0, h: 0.12 });
  });
  group.add(k.build({ name: 'busStop' }));
  out.waitSpot = anchor(group, 'wait', 0, 0, D / 2 + 0.7);
  return out;
}
