// Electric poles, wire spans and streetlights.
//
// Pole orientation: cross-arms run along local X, so wires leave along ±Z. Place a pole
// with yaw = road travel yaw (local −Z along the road). The lamp bracket (if any) points
// toward +X * lampSide (default +1). For a pole on the LEFT road edge +X faces the road.
import * as THREE from 'three';
import { Kit, bevelBox, bbox, lathe, cyl, tube, torus, sphere, quad, smoothPath, sagCurve, makeRng, noise } from './lib/kit.js';
import { mat, glowMat, texMat, bugDiffuserTex, noticeAtlasTex } from './lib/materials.js';
import { lightSpec, attachFlicker } from './lib/lights.js';
import { G, coil } from './lib/small.js';

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
// Insulators
// ---------------------------------------------------------------------------
const PIN_PROFILE = [[0, 0], [0.025, 0], [0.03, 0.02], [0.075, 0.035], [0.07, 0.05], [0.04, 0.06], [0.06, 0.08], [0.055, 0.095], [0.035, 0.105], [0.045, 0.125], [0.03, 0.15], [0, 0.155]];
function pinInsulator(k, p, color) {
  k.add(mat('rust'), G('pin', () => cyl(0.012, 0.012, 0.08, 6, 0.002)), { p, color: 0x7a7a70 });
  k.add(mat('ceramic'), G('pinIns', () => lathe(PIN_PROFILE, 8)), { p: [p[0], p[1] + 0.06, p[2]], color, w: { grime: 0.3, grimeH: 0.08, ground: p[1] + 0.06, vary: 0.15 } });
}
const SPOOL_PROFILE = [[0, 0], [0.04, 0], [0.042, 0.01], [0.03, 0.02], [0.028, 0.055], [0.042, 0.065], [0.04, 0.075], [0, 0.075]];
function spoolInsulator(k, p, color) {
  k.add(mat('ceramic'), G('spool', () => lathe(SPOOL_PROFILE, 8)), { p, color, w: { grime: 0.25 } });
}
/** Suspension disc string (dead-end / transformer). Hangs along -Y from p unless r given. */
function discString(k, p, r, n = 3, color = 0x6a4a3a) {
  k.at(p, r, null, () => {
    for (let i = 0; i < n; i++) k.add(mat('ceramic'), G('disc', () => lathe([[0, 0], [0.012, 0], [0.07, 0.015], [0.075, 0.025], [0.02, 0.04], [0, 0.04]], 12)), { p: [0, -0.06 - i * 0.055, 0], color, w: false });
  });
}

// ---------------------------------------------------------------------------
// Lamp heads (shared by poles and standalone streetlights)
// ---------------------------------------------------------------------------
/**
 * Fluorescent fixture on a bent pipe bracket. Origin at the pole face; bracket goes +X.
 * Returns {anchorPos:Vector3 (kit space), glow material, lampMesh setter}.
 */
function fluorescentBracket(k, o) {
  const reach = o.reach ?? 1.1;
  const rng = o.rng;
  // bent pipe: out, up, out (classic Thai DIY bracket)
  const pts = smoothPath([V(0, 0, 0), V(0.25, 0.08, 0), V(0.5, 0.3, 0), V(reach * 0.8, 0.42, 0), V(reach, 0.38, 0)], 14);
  k.add(mat('rust'), tube(pts, 0.022, 6), { color: 0x8a8070, w: { grime: 0, streak: 0.6, vary: 0.2 } });
  // pole band clamps (square-ish straps hugging the pole)
  const pr = o.poleR ?? 0.13, px = o.poleX ?? -0.13;
  for (const y of [-0.04, 0.2]) k.add(mat('rust'), G('band:' + pr, () => cyl(pr * 1.06, pr * 1.06, 0.05, 4, 0.004, 1, false).rotateY(Math.PI / 4)), { p: [px, y, 0], color: 0x6a5a4a, w: false });
  k.add(mat('rust'), tube([V(0.0, 0.22, 0), V(0.35, 0.22, 0), V(0.5, 0.3, 0)], 0.012, 5), { color: 0x7a6a5a, w: false });
  // fixture: steel channel along Z (perpendicular to the bracket)
  const fx = reach, fy = 0.31;
  const len = 1.25;
  k.add(mat('rust'), G('fluoTray', () => bevelBox(0.12, 0.06, len, 0.01, 0.2)), { p: [fx, fy, 0], color: o.color ?? 0xd8d4c8, w: { grime: 0, streak: 0.7, streakColor: 0x6a4a2a, vary: 0.25 } });
  k.add(mat('rust'), G('fluoEnd', () => bbox(0.1, 0.07, 0.03, 0.006, 0.1)), { p: [fx, fy - 0.08, len / 2 - 0.02], color: 0xb8b4a8 });
  k.add(mat('rust'), G('fluoEnd', () => bbox(0.1, 0.07, 0.03, 0.006, 0.1)), { p: [fx, fy - 0.08, -len / 2 + 0.02], color: 0xb8b4a8 });
  // cable from pole into the fixture, with a drip loop
  k.add(mat('dark'), tube(smoothPath([V(0, -0.3, 0.06), V(0.2, -0.45, 0.08), V(0.45, -0.2, 0.06), V(fx - 0.05, fy + 0.02, 0.1)], 12), 0.006, 4), { color: 0x141414, w: false });
  return { pos: V(fx, fy - 0.1, 0), len };
}

function addFluorescentTube(group, k, pos, len, o) {
  // the glowing tube + bug-filled diffuser are per-lamp materials (flicker)
  const tubeMat = glowMat(o.dying ? 'fluoro_dim' : 'fluoro', { shared: false });
  const diff = glowMat('fluoro_dim', { shared: false, map: bugDiffuserTex(o.seed ?? 7) });
  diff.userData.baseEmissive = 1.6;
  diff.emissiveIntensity = 1.6;
  const kk = new Kit(1, {});
  kk.push(null, null, null);
  kk.stack[kk.stack.length - 1].copy(k.matrix);
  if (o.broken) {
    // half the diffuser missing, tube hanging at an angle from one socket
    kk.add(tubeMat, G('fluoTube', () => cyl(0.013, 0.013, len - 0.1, 8, 0.002).rotateZ(Math.PI / 2)), { p: [pos.x, pos.y - 0.02, pos.z - (len - 0.1) / 2], r: [0, Math.PI / 2, 0.0], color: 0xffffff, w: false });
    kk.add(diff, G('diffHalf', () => cyl(0.05, 0.05, (len - 0.1) * 0.45, 10, 0, 1, false, ).rotateZ(Math.PI / 2)), { p: [pos.x, pos.y - 0.035, pos.z + 0.08], r: [0, Math.PI / 2, 0], color: 0xffffff, w: false, uv: 'keep' });
  } else {
    kk.add(tubeMat, G('fluoTube', () => cyl(0.013, 0.013, len - 0.1, 8, 0.002).rotateZ(Math.PI / 2)), { p: [pos.x, pos.y - 0.02, pos.z - (len - 0.1) / 2], r: [0, Math.PI / 2, 0], color: 0xffffff, w: false });
    kk.add(diff, G('diffuser', () => {
      const g = new THREE.CylinderGeometry(0.055, 0.055, len - 0.08, 12, 1, true, Math.PI, Math.PI);
      g.rotateZ(Math.PI / 2);
      return g;
    }), { p: [pos.x, pos.y - 0.005, pos.z], r: [0, Math.PI / 2, 0], color: 0xffffff, w: false, uv: 'keep' });
  }
  const meshes = kk.build({ name: 'fluoLamp', shadows: false });
  const ctls = [];
  for (const m of meshes.children) {
    m.castShadow = false;
    ctls.push(attachFlicker(m, m.material, o.dying ? 'dying' : o.flicker ?? 'fluorescent', o.seed ?? 1));
  }
  group.add(meshes);
  return ctls;
}

/** Sodium cobra-head on a curved arm. Origin at pole top centre; arm goes +X. */
function cobraHead(k, o) {
  const reach = o.reach ?? 1.8;
  const pts = smoothPath([V(0, -0.6, 0), V(0, -0.1, 0), V(0.25, 0.18, 0), V(reach * 0.6, 0.32, 0), V(reach, 0.36, 0)], 16);
  k.add(mat('rust'), tube(pts, (t) => 0.045 - t * 0.012, 8), { color: 0x9a9c98, w: { grime: 0, streak: 0.45, vary: 0.2 } });
  const hx = reach + 0.25, hy = 0.36;
  // housing: flattened teardrop
  const housing = G('cobra', () => {
    const g = new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    g.scale(0.36, 0.22, 0.19);
    return g;
  });
  k.add(mat('rust'), housing, { p: [hx, hy - 0.03, 0], r: [0, 0, -0.08], color: 0xb8bab2, w: { grime: 0, streak: 0.5, streakColor: 0x4a3a2a, dust: 0.5, dustColor: 0x5a5a40 } });
  k.add(mat('rust'), G('cobraRim', () => torus(0.5, 0.03, 4, 18).rotateX(Math.PI / 2).scale(0.36, 1, 0.19)), { p: [hx, hy - 0.035, 0], color: 0x8a8c86 });
  k.add(mat('dark'), G('photocell', () => cyl(0.03, 0.035, 0.05, 8, 0.005)), { p: [hx - 0.05, hy + 0.08, 0], color: 0x2a2a2a });
  return { pos: V(hx, hy - 0.06, 0) };
}
function addSodiumBowl(group, k, pos, o) {
  const glow = glowMat('sodium', { shared: false });
  const kk = new Kit(1, {});
  kk.stack[0].copy(k.matrix);
  kk.add(glow, G('sodiumBowl', () => {
    const g = new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45);
    g.scale(0.3, 0.16, 0.15);
    return g;
  }), { p: [pos.x, pos.y + 0.03, pos.z], r: [0, 0, -0.08], color: 0xffffff, w: false });
  const m = kk.build({ name: 'sodiumLamp', shadows: false });
  const ctls = m.children.map((c) => attachFlicker(c, c.material, o.flicker ?? 'sodium', o.seed ?? 2));
  group.add(m);
  return ctls;
}

// ---------------------------------------------------------------------------
// Electric pole
// ---------------------------------------------------------------------------
/**
 * Crooked old concrete electric pole.
 * opts {seed, height=9, lean=0 (radians, toward +X), transformer=false,
 *   lamp=null|'sodium'|'fluorescent'|'dying', lampSide=+1, crossArms=2, telecom=true,
 *   meters=auto, notices=auto, stripes=auto, coils=auto, lights=false}
 * -> { object, wireAnchors: Vector3[] (local), wireKinds: string[] ('hv'|'lv'|'tel'),
 *      lampAnchor?, lightSpec?, lights: spec[], colliders, transformerAnchor?, humAnchor }
 */
export function createElectricPole(opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 31 + 5);
  const H = opts.height ?? 9;
  const lean = opts.lean ?? (rng() - 0.5) * 0.04;
  const leanZ = (rng() - 0.5) * 0.03;
  const group = new THREE.Group();
  group.name = 'electricPole';
  const k = new Kit(seed, { grime: 0.55, grimeH: 0.9, mossLow: 0.75, mossH: 0.8, streak: 0.35, vary: 0.18 });
  // Pole frame: lean whole upper assembly
  const bend = (rng() - 0.5) * 0.08;
  const poleTop = (y) => V(Math.sin(lean) * y + bend * (y / H) ** 2, Math.cos(lean) * y, Math.sin(leanZ) * y);
  const base = 0.3, top = 0.17;
  const stripes = opts.stripes ?? rng() < 0.4;
  const shaft = bevelBox(base, H, base * 0.85, 0.035, 0.45, 1, { bottom: true });
  k.add(mat('concrete'), shaft, {
    r: [leanZ, 0, -lean],
    deform: (p) => {
      const t = p.y / H;
      const s = 1 + (top / base - 1) * t;
      p.x = p.x * s + bend * t * t;
      p.z *= s;
    },
    color: 0xb8b2a4,
    colorFn: (p, n, c, lp) => {
      // reflective road stripes near the base on roadside poles
      if (stripes && lp.y > 0.6 && lp.y < 1.8) {
        const s = Math.floor((lp.y - 0.6) / 0.2);
        if (s % 2 === 0) c.multiplyScalar(0.18);
        else c.lerp(_white, 0.55);
      }
    },
  });
  // bolt holes up the top third (dark plugs flush on two faces)
  k.push(null, [leanZ, 0, -lean]);
  for (let y = H * 0.55; y < H - 0.3; y += 0.32 + rng() * 0.08) {
    const t = y / H, w = (base + (top - base) * t) * 0.5;
    for (const s of [-1, 1]) k.add(mat('dark'), G('hole', () => bbox(0.035, 0.035, 0.01, 0.004, 0.1)), { p: [bend * t * t, y, s * (w * 0.85 + 0.001)], color: 0x0e0d0c, w: false });
  }
  k.pop();
  const P = (x, y, z) => poleTop(y).add(V(x, 0, z));
  const wireAnchors = [];
  const wireKinds = [];
  // --- cross-arms + HV pin insulators ---------------------------------------
  const insColor = rng() < 0.5 ? 0x8a5a3a : 0xc8c4b8;
  const nArms = opts.crossArms ?? 2;
  const armYs = [H - 0.25, H - 1.05].slice(0, Math.max(0, nArms));
  armYs.forEach((ay, ai) => {
    const c = poleTop(ay);
    const L = ai === 0 ? 2.3 : 1.9;
    k.at([c.x, c.y, c.z], [0, 0, (rng() - 0.5) * 0.05 - lean], null, () => {
      k.add(mat('rust'), G('arm:' + L, () => bevelBox(L, 0.09, 0.09, 0.008, 0.3)), { color: 0x7a7468, w: { grime: 0, streak: 0.6, vary: 0.25 } });
      // diagonal braces
      for (const s of [-1, 1]) k.add(mat('rust'), tube([V(s * 0.75, -0.02, 0.06), V(0.02 * s, -0.6, 0.11)], 0.012, 4), { color: 0x6a5a4a, w: false });
      k.add(mat('rust'), G('ubolt', () => bbox(0.25, 0.12, 0.25, 0.01, 0.1)), { p: [0, -0.06, 0], color: 0x5a4a3a, w: false });
      if (ai === 0) {
        for (const x of [-L / 2 + 0.1, -0.35, 0.35, L / 2 - 0.1]) {
          if (Math.abs(x) < 0.3) continue;
          pinInsulator(k, [x, 0.045, 0], insColor);
        }
      } else {
        for (const x of [-L / 2 + 0.12, L / 2 - 0.12]) pinInsulator(k, [x, 0.045, 0], insColor);
      }
    });
    if (ai === 0) {
      for (const x of [-L / 2 + 0.1, -0.35, 0.35, L / 2 - 0.1]) {
        if (Math.abs(x) < 0.3) continue;
        wireAnchors.push(P(x, ay + 0.19, 0));
        wireKinds.push('hv');
      }
    }
  });
  // top pin
  if (nArms > 0) {
    const c = poleTop(H);
    pinInsulator(k, [c.x, c.y - 0.02, c.z], insColor);
  }
  // --- LV rack: vertical bracket with 4 spool insulators ---------------------
  const lvY = H - 2.2;
  const lvSide = rng() < 0.5 ? 1 : -1;
  {
    const c = poleTop(lvY);
    k.at([c.x, c.y, c.z], null, null, () => {
      k.add(mat('rust'), G('lvrack', () => bbox(0.05, 0.95, 0.04, 0.005, 0.3)), { p: [0, -0.45, lvSide * 0.16], color: 0x6a5e50, w: { grime: 0, streak: 0.6 } });
      for (let i = 0; i < 4; i++) {
        spoolInsulator(k, [0, -0.4 + i * 0.22 - 0.04, lvSide * 0.22], 0xd8d4c8);
        wireAnchors.push(V(c.x, c.y - 0.4 + i * 0.22, c.z + lvSide * 0.22));
        wireKinds.push('lv');
      }
    });
  }
  // --- telecom clamps, bundles, coils, boxes ---------------------------------
  const telY = H - 3.4 - rng() * 0.4;
  if (opts.telecom !== false) {
    const c = poleTop(telY);
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.55 + (rng() - 0.5) * 0.2;
      const x = Math.sin(a) * 0.17, z = Math.cos(a) * 0.17 * -lvSide;
      k.add(mat('rust'), G('clamp', () => bbox(0.06, 0.07, 0.06, 0.008, 0.1)), { p: [c.x + x, c.y - 0.03 - i * 0.18, c.z + z], color: 0x4a4a46, w: false });
      wireAnchors.push(V(c.x + x * 1.3, c.y - i * 0.18, c.z + z * 1.3));
      wireKinds.push('tel');
    }
    // fibre slack coils hanging on the pole (very common)
    const nCoils = opts.coils ?? (rng() < 0.7 ? 1 + (rng() < 0.4 ? 1 : 0) : 0);
    for (let i = 0; i < nCoils; i++) {
      const cy = telY - 0.7 - i * 0.55;
      const cc = poleTop(cy);
      coil(k, { p: [cc.x + 0.02, cc.y, cc.z + (i ? 0.2 : -0.2) * -lvSide], r: [0, Math.PI / 2 + (rng() - 0.5) * 0.4, 0], rad: 0.28 + rng() * 0.12, thick: 0.009, loops: 5 + Math.floor(rng() * 4), seed: seed + i });
    }
    // splice closure (black cylinder) + junction box
    if (rng() < 0.6) {
      const cc = poleTop(telY - 0.35);
      k.add(mat('dark'), G('splice', () => cyl(0.08, 0.08, 0.5, 10, 0.02)), { p: [cc.x - 0.2, cc.y - 0.25, cc.z], color: 0x1c1c1c, w: { grime: 0, dust: 0.3 } });
    }
    // dangling cables: a couple of loose ends hanging toward the ground
    const nDrop = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < nDrop; i++) {
      const cc = poleTop(telY - 0.05);
      const side = rng() < 0.5 ? -1 : 1;
      const endY = 1.6 + rng() * 2.5;
      const pts = smoothPath([V(cc.x + 0.12 * side, cc.y, cc.z + 0.1), V(cc.x + 0.25 * side, cc.y - 0.6, cc.z + 0.12), V(cc.x + 0.18 * side + Math.sin(lean) * -(cc.y - endY), endY + 0.6, cc.z + 0.18), V(cc.x + 0.24 * side + Math.sin(lean) * -(cc.y - endY), endY, cc.z + 0.22 + rng() * 0.1)], 18);
      k.add(mat('dark'), tube(pts, 0.006 + rng() * 0.004, 4), { color: 0x151515, w: false });
    }
  }
  // --- transformer bank -------------------------------------------------------
  let transformerAnchor = null;
  if (opts.transformer) {
    const ty = H - 2.9;
    const c = poleTop(ty);
    const n = 1 + Math.floor(rng() * 2.4);
    k.at([c.x, c.y, c.z], null, null, () => {
      // platform channels
      k.add(mat('rust'), G('tplat', () => bevelBox(1.6, 0.1, 0.1, 0.008, 0.3)), { p: [0, -0.05, -0.32], color: 0x5a5046, w: { grime: 0, streak: 0.6 } });
      k.add(mat('rust'), G('tplat', () => bevelBox(1.6, 0.1, 0.1, 0.008, 0.3)), { p: [0, -0.05, 0.32 * 0 - 0.12], color: 0x5a5046, w: { grime: 0, streak: 0.6 } });
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 0.55;
        const tz = -0.55;
        // tank with cooling fins, lid, bushings
        k.add(mat('rust'), G('tank', () => cyl(0.23, 0.23, 0.82, 16, 0.02, 4)), {
          p: [x, 0, tz], color: 0x8a908a, w: { ground: 0, grime: 0.2, grimeH: 0.3, streak: 0.9, streakColor: 0x6a3a1a, vary: 0.2 },
          colorFn: (p, nn, cc, lp) => { if (Math.abs(Math.sin(Math.atan2(lp.z, lp.x) * 14)) > 0.8) cc.multiplyScalar(0.72); },
        });
        k.add(mat('rust'), G('tlid', () => cyl(0.25, 0.25, 0.05, 16, 0.012)), { p: [x, 0.82, tz], color: 0x7a7e78, w: { streak: 0.5 } });
        for (let b = 0; b < 2; b++) {
          k.add(mat('ceramic'), G('bushing', () => lathe([[0, 0], [0.04, 0], [0.04, 0.02], [0.055, 0.03], [0.03, 0.05], [0.05, 0.07], [0.03, 0.09], [0.045, 0.11], [0.02, 0.15], [0, 0.15]], 10)), { p: [x + (b ? 0.09 : -0.09), 0.86, tz + 0.02], color: 0x6a4030, w: false });
        }
        // drop leads to the cross-arm (fuse cutouts)
        k.add(mat('dark'), tube(smoothPath([V(x + 0.09, 1.0, tz + 0.02), V(x + 0.12, 1.4, tz + 0.1), V(x * 0.6, 2.3, 0.02)], 10), 0.006, 4), { color: 0x2a2a2a, w: false });
        k.add(mat('ceramic'), G('cutout', () => cyl(0.025, 0.03, 0.35, 8, 0.006)), { p: [x * 0.6, 2.05, 0.08], r: [0.3, 0, 0], color: 0x7a5040, w: false });
      }
    });
    transformerAnchor = anchor(group, 'transformer', c.x, c.y + 0.4, c.z - 0.55);
  }
  // --- meter boxes / junction box low on the pole ---------------------------
  if (opts.meters ?? rng() < 0.45) {
    const c = poleTop(2.6);
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      k.add(mat('rust'), G('meterbox', () => bbox(0.2, 0.3, 0.13, 0.012, 0.15)), { p: [c.x - 0.2 + i * 0.22 - (n - 1) * 0.11, c.y - i * 0.05, c.z + 0.2], color: rng() < 0.5 ? 0xc8c8bc : 0x8a9a9a, w: { grime: 0, streak: 0.8, streakColor: 0x5a3a20 } });
      k.add(mat('ceramic'), G('meterwin', () => bbox(0.1, 0.1, 0.01, 0.003, 0.1)), { p: [c.x - 0.2 + i * 0.22 - (n - 1) * 0.11, c.y + 0.12 - i * 0.05, c.z + 0.267], color: 0x3a4a48, w: false });
    }
    // conduit down + service cable up
    k.add(mat('dark'), tube([V(c.x - 0.05, 0.15, c.z + 0.16), V(c.x - 0.05, c.y, c.z + 0.18)], 0.016, 6), { color: 0x7a8a8a, w: { grime: 0.5, grimeH: 0.5 } });
    k.add(mat('dark'), tube(smoothPath([V(c.x, c.y + 0.3, c.z + 0.2), V(c.x + 0.05, lvY - 1.0, c.z + 0.22), V(c.x, lvY - 0.45, c.z + lvSide * 0.22)], 10), 0.007, 4), { color: 0x161616, w: false });
  }
  // --- ground wire down the pole in PVC ---------------------------------------
  {
    const pts = [];
    for (let y = 0.0; y <= H - 2.4; y += 0.6) pts.push(poleTop(y).add(V(0, 0, -0.17)));
    k.add(mat('dark'), tube(pts, 0.011, 5), { color: 0x8a8e88, w: { grime: 0.6, grimeH: 0.8 } });
  }
  // --- pole number tag ---------------------------------------------------------
  {
    const c = poleTop(3.3);
    k.add(mat('rust'), G('tag', () => bbox(0.12, 0.16, 0.006, 0.004, 0.1)), {
      p: [c.x, c.y, c.z + 0.135], color: rng() < 0.5 ? 0xd8c040 : 0xe0ddd0, w: { grime: 0, streak: 0.5, vary: 0.2 },
      colorFn: (p, n, cc) => { if (n.z > 0.5 && Math.abs(Math.sin(p.y * 90)) > 0.85) cc.multiplyScalar(0.2); },
    });
  }
  // --- stapled paper notices (tattered) ---------------------------------------
  const nNotice = opts.notices ?? (rng() < 0.5 ? 1 + Math.floor(rng() * 2) : 0);
  for (let i = 0; i < nNotice; i++) {
    const nm = texMat('noticeAtlas', () => noticeAtlasTex(), { decal: true });
    const vi = (seed + i) % 4;
    const c = poleTop(1.6 + i * 0.45 + rng() * 0.3);
    const face = rng() < 0.5 ? 1 : -1;
    k.add(nm, G('notice', () => quad(0.21, 0.29, 2, 3)), {
      p: [c.x + face * 0.142 * (1 - 0.45 * (c.y / H)), c.y, c.z + (rng() - 0.5) * 0.04], r: [0, face * Math.PI / 2, (rng() - 0.5) * 0.15], color: 0xffffff, uv: 'keep', uvScale: 0.5, uvOffset: [(vi % 2) * 0.5, Math.floor(vi / 2) * 0.5],
      w: { grime: 0.4, grimeH: 0.3, ground: c.y - 0.15, vary: 0.3, moss: 0 },
      deform: (p) => { p.z += Math.sin(p.x * 30) * 0.004 + (p.y < -0.08 ? (p.x + 0.1) * 0.05 : 0); },
    });
  }
  // --- lamp ---------------------------------------------------------------------
  const out = { object: group, wireAnchors, wireKinds, colliders: [{ x: 0, z: 0, r: 0.22 }], lights: [], lampControllers: [] };
  if (opts.lamp) {
    const side = opts.lampSide ?? 1;
    const ly = (opts.transformer ? H - 4.3 : H - 3.0) + (opts.lamp === 'sodium' ? 0.6 : 0);
    const c = poleTop(ly);
    if (opts.lamp === 'sodium') {
      k.push([c.x, c.y, c.z], side < 0 ? Math.PI : 0);
      const h = cobraHead(k, { reach: 1.4 });
      out.lampControllers.push(...addSodiumBowl(group, k, h.pos, { seed }));
      out.lampAnchor = anchor(group, 'lamp', ...new THREE.Vector3().copy(h.pos).applyMatrix4(k.matrix).toArray());
      k.pop();
      out.lightSpec = lightSpec('sodium', out.lampAnchor);
    } else {
      k.push([c.x + side * 0.13, c.y, c.z], side < 0 ? Math.PI : 0);
      const pw = (0.3 + (0.17 - 0.3) * (ly / H)) / 2;
      const b = fluorescentBracket(k, { reach: 1.0, rng, poleR: pw * 1.25, poleX: -0.13 });
      out.lampControllers.push(...addFluorescentTube(group, k, b.pos, b.len, { seed, dying: opts.lamp === 'dying', broken: opts.brokenLamp }));
      out.lampAnchor = anchor(group, 'lamp', ...new THREE.Vector3().copy(b.pos).applyMatrix4(k.matrix).toArray());
      k.pop();
      out.lightSpec = lightSpec(opts.lamp === 'dying' ? 'dying' : 'fluorescent', out.lampAnchor);
    }
    out.lights.push(out.lightSpec);
  }
  group.add(k.build({ name: 'electricPole' }));
  out.humAnchor = anchor(group, 'hum', 0, H - 1.5, 0);
  if (transformerAnchor) out.transformerAnchor = transformerAnchor;
  out.topAnchor = anchor(group, 'top', ...poleTop(H).toArray());
  return out;
}
const _white = new THREE.Color(0xf0eee8);

// ---------------------------------------------------------------------------
// Wire span
// ---------------------------------------------------------------------------
const KIND_R = { hv: 0.0065, lv: 0.0095, tel: 0.013 };
/**
 * Sagging cable bundle between two anchor lists (world or common space).
 * opts {sag (m at mid-span; default ≈ 3% of length), seed, messy=1 (0..2 extra clutter),
 *   kinds: string[] (per anchor index; default from createElectricPole order),
 *   drops=true, coils=true}
 * -> Object3D (one merged mesh). object.userData.cables = [{a,b,sag,lateral}] and
 *    object.userData.sample(i, t, out) gives a point on main cable i (for the wire crawler).
 */
export function createWireSpan(anchorsA, anchorsB, opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = makeRng(seed * 17 + 3);
  const messy = opts.messy ?? 1;
  const n = Math.min(anchorsA.length, anchorsB.length);
  const kinds = opts.kinds || DEFAULT_KINDS;
  const k = new Kit(seed, { grime: 0, vary: 0.08 });
  const m = mat('dark');
  const cables = [];
  let span = 0;
  for (let i = 0; i < n; i++) span += anchorsA[i].distanceTo(anchorsB[i]);
  span /= Math.max(1, n);
  const baseSag = opts.sag ?? Math.max(0.3, span * 0.03);
  const segs = Math.max(10, Math.min(30, Math.round(span / 1.4)));
  const dir = new THREE.Vector3();
  const side = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = anchorsA[i], b = anchorsB[i];
    const kind = kinds[i] || 'lv';
    const sag = baseSag * (kind === 'hv' ? 0.75 : kind === 'lv' ? 1.0 : 1.15) * (0.9 + rng() * 0.25);
    dir.subVectors(b, a).normalize();
    side.set(-dir.z, 0, dir.x).normalize();
    const lat = side.clone().multiplyScalar((rng() - 0.5) * 0.12);
    const pts = sagCurve(a, b, sag, segs, lat);
    k.add(m, tube(pts, KIND_R[kind] * (0.85 + rng() * 0.3), kind === 'hv' ? 3 : 4), { color: kind === 'hv' ? 0x4a4a46 : 0x121212, w: false });
    cables.push({ a: a.clone(), b: b.clone(), sag, lateral: lat });
    if (kind === 'tel') {
      // bundle of extra thin/thick cables hanging at different sags, some twisted
      const extra = 1 + Math.floor(rng() * (2 + 2 * messy));
      for (let e = 0; e < extra; e++) {
        const off = (r) => new THREE.Vector3((rng() - 0.5) * r, (rng() - 0.5) * r, (rng() - 0.5) * r);
        const a2 = a.clone().add(off(0.12)), b2 = b.clone().add(off(0.12));
        const s2 = sag * (1 + rng() * 0.35 * messy) + rng() * 0.2;
        const l2 = side.clone().multiplyScalar((rng() - 0.5) * 0.3);
        const p2 = sagCurve(a2, b2, s2, segs, l2);
        k.add(m, tube(p2, 0.005 + rng() * 0.011, 4), { color: rng() < 0.15 ? 0x2a2a2a : 0x0e0e0e, w: false });
      }
      // lashing wire spiralling around the main cable
      if (rng() < 0.6) {
        const lp = [];
        const N = segs * 6;
        const tmpN = new THREE.Vector3();
        for (let s = 0; s <= N; s++) {
          const t = s / N;
          const p = new THREE.Vector3().lerpVectors(a, b, t);
          const q = 4 * t * (1 - t);
          p.y -= q * sag;
          p.addScaledVector(lat, q);
          const ang = t * span * 2.2;
          tmpN.set(0, Math.cos(ang) * 0.02, 0).addScaledVector(side, Math.sin(ang) * 0.02);
          lp.push(p.add(tmpN));
        }
        k.add(m, tube(lp, 0.0018, 3), { color: 0x3a3a3a, w: false });
      }
    }
  }
  // clutter: slack coils hanging mid-span, loose drops, a tangle
  const telIdx = [];
  for (let i = 0; i < n; i++) if ((kinds[i] || 'lv') === 'tel') telIdx.push(i);
  if (telIdx.length && opts.coils !== false && rng() < 0.45 * messy) {
    const c = cables[telIdx[Math.floor(rng() * telIdx.length)]];
    const t = 0.25 + rng() * 0.5;
    const p = sampleCable(c, t, new THREE.Vector3());
    dir.subVectors(c.b, c.a).normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    coil(k, { p: [p.x, p.y - 0.3, p.z], r: [0, yaw + Math.PI / 2, 0], rad: 0.3 + rng() * 0.15, thick: 0.008, loops: 4 + Math.floor(rng() * 4), seed: seed + 9 });
  }
  if (telIdx.length && opts.drops !== false) {
    const nd = Math.floor(rng() * (1 + messy * 1.5));
    for (let d = 0; d < nd; d++) {
      const c = cables[telIdx[Math.floor(rng() * telIdx.length)]];
      const t = 0.15 + rng() * 0.7;
      const p = sampleCable(c, t, new THREE.Vector3());
      const L = 0.8 + rng() * 2.2;
      const sx = (rng() - 0.5) * 0.4, sz = (rng() - 0.5) * 0.4;
      const pts = smoothPath([p.clone(), p.clone().add(V(sx * 0.3, -L * 0.35, sz * 0.3)), p.clone().add(V(sx, -L * 0.8, sz)), p.clone().add(V(sx * 1.4, -L, sz * 1.2 + 0.1))], 12);
      k.add(m, tube(pts, 0.006 + rng() * 0.005, 4), { color: 0x101010, w: false });
    }
    if (rng() < 0.3 * messy) {
      const c = cables[telIdx[0]];
      const p = sampleCable(c, 0.3 + rng() * 0.4, new THREE.Vector3());
      k.add(m, G('tangle', () => torus(0.12, 0.012, 4, 22).scale(1, 0.6, 1)), { p: [p.x, p.y - 0.05, p.z], r: [rng(), rng(), rng()], color: 0x111111, w: false, jitter: 0.05, jitterFreq: 14 });
      k.add(m, G('tangle', () => torus(0.12, 0.012, 4, 22).scale(1, 0.6, 1)), { p: [p.x + 0.04, p.y - 0.08, p.z], r: [rng() * 3, rng(), rng()], color: 0x111111, w: false, jitter: 0.05, jitterFreq: 14 });
    }
  }
  const obj = k.build({ name: 'wireSpan', shadows: true });
  obj.userData.cables = cables;
  obj.userData.sample = (i, t, out = new THREE.Vector3()) => sampleCable(cables[Math.max(0, Math.min(cables.length - 1, i))], t, out);
  return obj;
}
const DEFAULT_KINDS = ['hv', 'hv', 'lv', 'lv', 'lv', 'lv', 'tel', 'tel', 'tel'];

/** Point on a cable record at t (0..1). */
export function sampleCable(c, t, out = new THREE.Vector3()) {
  out.lerpVectors(c.a, c.b, t);
  const q = 4 * t * (1 - t);
  out.y -= q * c.sag;
  if (c.lateral) out.addScaledVector(c.lateral, q);
  return out;
}

// ---------------------------------------------------------------------------
// Standalone streetlight
// ---------------------------------------------------------------------------
/**
 * opts {kind:'sodium'|'fluorescent'|'dying', height=6, seed, lean, broken=false}
 * -> { object, lampAnchor, lightSpec, lights, colliders, lampControllers }
 * The arm reaches toward +X (place so +X points over the road).
 */
export function createStreetlight(opts = {}) {
  const seed = opts.seed ?? 3;
  const rng = makeRng(seed * 13 + 1);
  const kind = opts.kind ?? 'sodium';
  const H = opts.height ?? (kind === 'sodium' ? 7 : 5.5);
  const group = new THREE.Group();
  group.name = 'streetlight';
  const k = new Kit(seed, { grime: 0.5, grimeH: 0.6, mossLow: 0.5, mossH: 0.4, streak: 0.4 });
  const lean = opts.lean ?? (rng() - 0.5) * 0.03;
  const out = { object: group, lights: [], colliders: [{ x: 0, z: 0, r: 0.18 }], lampControllers: [] };
  if (kind === 'sodium') {
    // concrete footing, base plate, tapered galvanised pole
    k.add(mat('concrete'), G('slfoot', () => bbox(0.5, 0.25, 0.5, 0.04, 0.2)), { color: 0x9a968c, w: { mossLow: 0.9, mossH: 0.3, grime: 0.5 } });
    k.add(mat('galv'), G('slplate', () => bbox(0.32, 0.02, 0.32, 0.005, 0.2)), { p: [0, 0.25, 0], color: 0x7a7c78 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(mat('rust'), G('nut', () => cyl(0.018, 0.018, 0.04, 6, 0.002)), { p: [sx * 0.12, 0.27, sz * 0.12], color: 0x6a4a30, w: false });
    k.push([0, 0.27, 0], [0, 0, -lean]);
    k.add(mat('galv'), G('slpole:' + H, () => cyl(0.06, 0.1, H - 0.27, 12, 0.005, 8)), { color: 0x9a9c96, w: { grime: 0.4, grimeH: 1.0, streak: 0.5, ground: -0.27 } });
    // inspection door + sticker
    k.add(mat('galv'), G('sldoor', () => bbox(0.08, 0.25, 0.02, 0.004, 0.1)), { p: [0, 0.5, 0.095], color: 0x8a8c86 });
    k.push([0, H - 0.27, 0]);
    const h = cobraHead(k, { reach: 1.9 });
    out.lampControllers.push(...addSodiumBowl(group, k, h.pos, { seed, flicker: opts.broken ? 'dying' : 'sodium' }));
    out.lampAnchor = anchor(group, 'lamp', ...new THREE.Vector3().copy(h.pos).applyMatrix4(k.matrix).toArray());
    k.pop();
    k.pop();
    out.lightSpec = lightSpec(opts.broken ? 'dying' : 'sodium', out.lampAnchor, opts.broken ? { color: 0xff9a45 } : {});
  } else {
    // old square concrete post with a bent-pipe fluorescent bracket
    k.add(mat('concrete'), bevelBox(0.18, H, 0.18, 0.025, 0.4, 1, { bottom: true }), {
      r: [0, 0, -lean], color: 0xb0aa9c,
      deform: (p) => { const t = p.y / H; p.x *= 1 - 0.3 * t; p.z *= 1 - 0.3 * t; },
    });
    k.push([Math.sin(lean) * (H - 0.9) + 0.07, H - 0.9, 0]);
    const b = fluorescentBracket(k, { reach: 1.2, rng, poleR: 0.095 * 1.0, poleX: -0.07 });
    out.lampControllers.push(...addFluorescentTube(group, k, b.pos, b.len, { seed, dying: kind === 'dying', broken: opts.broken }));
    out.lampAnchor = anchor(group, 'lamp', ...new THREE.Vector3().copy(b.pos).applyMatrix4(k.matrix).toArray());
    k.pop();
    // feed cable down the post
    k.add(mat('dark'), tube([V(0.09, 0.4, 0.05), V(0.1 + Math.sin(lean) * H * 0.5, H * 0.5, 0.06), V(0.09 + Math.sin(lean) * (H - 1.1), H - 1.1, 0.06)], 0.007, 4), { color: 0x151515, w: false });
    out.lightSpec = lightSpec(kind === 'dying' ? 'dying' : 'fluorescent', out.lampAnchor);
  }
  out.lights.push(out.lightSpec);
  group.add(k.build({ name: 'streetlight' }));
  return out;
}

/** Turn every emissive lamp of a prop result on/off (keeps lights in sync if registered). */
export function setLampOn(result, on) {
  for (const c of result.lampControllers || []) c.on = on;
  for (const h of result.lightHandles || []) h.setOn?.(on);
}
