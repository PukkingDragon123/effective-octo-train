// Animals: Asian elephant (mother / aunt), elephant calf and Thai street dog.
//
// Bodies are SDF-sculpted (smooth-blended masses: domed twin-lobed skull, convex back, sagging
// belly, columnar legs with toenails, a 6-bone trunk, map-shaped ears; the dog's deep chest, tucked
// waist, sickle tail, pricked ears and long muzzle), surface-netted, skinned to a rest-identity rig
// and textured with the rest-space triplanar hide / fur detail (wrinkle grooves, pink freckling on
// trunk and ear edges, dried mud on the legs; dog coats by tint).
// Locomotion: phase-based gaits (elephant lateral-sequence walk; dog walk / trot / rotary gallop),
// planted feet during stance, predicted landing + arc during swing, two-bone leg IK (elbows bend
// back, knees forward), body bob / pitch from the feet, spine flex in the gallop, procedural trunk,
// ears, tail, jaw and head look-at.
//   const e = createAnimal('elephant'); scene.add(e.root); e.setGroundFn(world.getHeight); await e.walkTo(p)
import * as THREE from 'three';
import { audio } from '../audio/index.js';
import { engine } from '../core/Engine.js';
import { Sculpt, skinnedMesh, solveTwoBoneIK, aimBone } from './sculpt.js';
import { creatureMaterial } from './skin.js';
import { Entity, TAU, clamp, damp, lerp, noise, worldPos, easeInOut, rand } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const UP = new THREE.Vector3(0, 1, 0);
const GEO = {};

// ------------------------------------------------------------------------------------ sculpts
function elephantSculpt(juvenile) {
  const key = juvenile ? 'calf' : 'elephant';
  if (GEO[key]) return GEO[key];
  // calf: shorter legs, bigger head, short trunk, rounder body, fuzzy (built at adult scale, scaled later)
  const J = juvenile ? 1 : 0;
  const leg = 1 - 0.12 * J, head = 1 + 0.22 * J, trunkL = 1 - 0.32 * J;
  const S = new Sculpt({ cell: 0.048 });
  const hy = 1.0 * leg; // leg length scale
  const bodyY = 0.7 + 1.1 * hy;
  const bones = [
    { name: 'root', parent: null, pos: [0, bodyY, 0] },
    { name: 'hips', parent: 'root', pos: [0, bodyY + 0.05, 0.6] },
    { name: 'spine', parent: 'root', pos: [0, bodyY + 0.12, 0] },
    { name: 'chest', parent: 'spine', pos: [0, bodyY + 0.15, -0.7] },
    { name: 'neck', parent: 'chest', pos: [0, bodyY + 0.35, -1.1] },
    { name: 'head', parent: 'neck', pos: [0, bodyY + 0.55, -1.45] },
  ];
  const H = (x, y, z) => [x, y, z];
  const hc = H(0, bodyY + 0.6, -1.55 - 0.05 * J);
  // trunk points (from the forehead down to the tip)
  const tp = [];
  const tl = [0.0, 0.4, 0.8, 1.15, 1.45, 1.68].map((v) => v * trunkL);
  for (let i = 0; i < 6; i++) {
    const t = tl[i];
    tp.push([0, hc[1] - 0.25 * head - t * 1.0, hc[2] - 0.42 * head - 0.18 * Math.sin(Math.min(1, t / 1.2) * 1.6) + t * 0.04]);
  }
  for (let i = 0; i < 6; i++) bones.push({ name: 'trunk' + (i + 1), parent: i ? 'trunk' + i : 'head', pos: tp[i] });
  bones.push({ name: 'earL', parent: 'head', pos: [-0.45 * head, hc[1] + 0.1, hc[2] + 0.22] }, { name: 'earR', parent: 'head', pos: [0.45 * head, hc[1] + 0.1, hc[2] + 0.22] });
  const tb = [[0, bodyY + 0.2, 1.42], [0, bodyY - 0.2, 1.52], [0, bodyY - 0.62, 1.56], [0, bodyY - 0.95, 1.57]];
  tb.forEach((p, i) => bones.push({ name: 'tail' + (i + 1), parent: i ? 'tail' + i : 'hips', pos: p }));
  // legs: x<0 = left (the animal faces -Z)
  const legs = {
    fl: [[-0.5, bodyY + 0.1, -0.8], [-0.5, 0.35 + 0.72 * hy, -0.76], [-0.5, 0.36, -0.82], [-0.5, 0.0, -0.86]],
    fr: [[0.5, bodyY + 0.1, -0.8], [0.5, 0.35 + 0.72 * hy, -0.76], [0.5, 0.36, -0.82], [0.5, 0.0, -0.86]],
    bl: [[-0.5, bodyY + 0.05, 0.85], [-0.5, 0.35 + 0.68 * hy, 0.68], [-0.5, 0.36, 0.86], [-0.5, 0.0, 0.88]],
    br: [[0.5, bodyY + 0.05, 0.85], [0.5, 0.35 + 0.68 * hy, 0.68], [0.5, 0.36, 0.86], [0.5, 0.0, 0.88]],
  };
  for (const [n, pts] of Object.entries(legs)) pts.forEach((p, i) => bones.push({ name: n + (i + 1), parent: i ? n + i : n[0] === 'f' ? 'chest' : 'hips', pos: p }));

  // ---- masses
  S.ellipsoid([0, bodyY + 0.05, 0.1], [0.84 + 0.04 * J, 0.86, 1.32], { bone: 'spine', k: 0.3 });
  S.ellipsoid([0, bodyY + 0.0, 0.78], [0.8, 0.84, 0.66], { bone: 'hips', k: 0.3 });
  S.ellipsoid([0, bodyY + 0.12, -0.72], [0.78, 0.84, 0.68], { bone: 'chest', k: 0.3 });
  S.ellipsoid([0, bodyY + 0.42, 0.0], [0.42, 0.36, 1.0], { bone: 'spine', k: 0.3 }); // convex back
  S.ellipsoid([0, bodyY - 0.42, 0.02], [0.68, 0.5, 0.95], { bone: 'spine', k: 0.3 }); // belly sag
  // neck + head (twin domes, forehead, cheeks, small eyes)
  S.capsule([0, bodyY + 0.25, -1.0], [0, hc[1] - 0.1, hc[2] + 0.25], 0.62, 0.55 * head, { bone: 'neck', k: 0.25 });
  S.ellipsoid(hc, [0.5 * head, 0.58 * head, 0.55 * head], { bone: 'head', k: 0.18 });
  S.sphere([-0.2 * head, hc[1] + 0.34 * head, hc[2] - 0.02], 0.3 * head, { bone: 'head', k: 0.14 });
  S.sphere([0.2 * head, hc[1] + 0.34 * head, hc[2] - 0.02], 0.3 * head, { bone: 'head', k: 0.14 });
  S.ellipsoid([0, hc[1] - 0.05, hc[2] - 0.3 * head], [0.36 * head, 0.42 * head, 0.3 * head], { bone: 'head', k: 0.15 });
  S.capsule([0, hc[1] - 0.06, hc[2] + 0.06], [0, hc[1] + 0.3 * head, hc[2] - 0.12], 0.03, 0.03, { op: 'sub', k: 0.06 }); // dome cleft
  for (const s of [-1, 1]) {
    S.ellipsoid([s * 0.34 * head, hc[1] - 0.22, hc[2] - 0.12], [0.2, 0.28, 0.28], { bone: 'head', k: 0.15 }); // cheek
    S.sphere([s * 0.4 * head, hc[1] - 0.02, hc[2] - 0.3 * head], 0.075, { op: 'sub', k: 0.05 }); // eye socket
    S.sphere([s * 0.38 * head, hc[1] - 0.02, hc[2] - 0.3 * head], 0.045, { bone: 'head', k: 0.012, tag: 5 }); // eye
    S.sphere([s * 0.35 * head, hc[1] + 0.05, hc[2] - 0.24 * head], 0.03, { op: 'sub', k: 0.03 }); // temporal gland
  }
  S.ellipsoid([0, hc[1] - 0.48 * head, hc[2] - 0.25 * head], [0.16, 0.12, 0.16], { bone: 'head', k: 0.08 }); // lower lip
  // trunk (tapering, with ring creases via the texture) + its finger tip
  const tr = [0.27, 0.22, 0.17, 0.13, 0.1, 0.08].map((r) => r * (juvenile ? 0.92 : 1) * head);
  for (let i = 0; i < 5; i++) S.capsule(tp[i], tp[i + 1], tr[i], tr[i + 1], { bone: 'trunk' + (i + 1), k: 0.08, tag: 3 });
  S.capsule([0, tp[0][1] + 0.25, tp[0][2] + 0.06], tp[0], 0.32 * head, tr[0], { bone: 'head', k: 0.15, tag: 3 });
  S.sphere(tp[5], 0.085 * head, { bone: 'trunk6', k: 0.04, tag: 3 });
  S.sphere([0, tp[5][1] - 0.03, tp[5][2] - 0.06], 0.035, { bone: 'trunk6', k: 0.03, tag: 3 }); // the finger
  // ears: flat, map-shaped, folded top rim
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'earL' : 'earR';
    const ec = [s * 0.56 * head, hc[1] - 0.05, hc[2] + 0.42];
    S.ellipsoid(ec, [0.055, 0.5 * head, 0.42 * head], { bone: n, k: 0.05, axis: [0, 1, 0.25], hint: [s * 0.2, 0, 1], tag: 4 });
    S.ellipsoid([ec[0] + s * 0.02, ec[1] - 0.32 * head, ec[2] + 0.12], [0.05, 0.22 * head, 0.22 * head], { bone: n, k: 0.06, tag: 4 }); // lobe
    S.capsule([ec[0] - s * 0.03, ec[1] + 0.42 * head, ec[2] - 0.25], [ec[0] + s * 0.03, ec[1] + 0.36 * head, ec[2] + 0.35], 0.045, 0.04, { bone: n, k: 0.04, tag: 4 }); // rim fold
  }
  // legs: columns, knees / elbows, round padded feet with toenails
  for (const [n, pts] of Object.entries(legs)) {
    const front = n[0] === 'f';
    const r = front ? [0.36, 0.28, 0.25, 0.29] : [0.4, 0.28, 0.24, 0.28];
    S.capsule(pts[0], pts[1], r[0], r[1], { bone: n + '1', k: 0.18 });
    S.capsule(pts[1], pts[2], r[1], r[2], { bone: n + '2', k: 0.1 });
    S.sphere(pts[1], r[1] * 1.08, { bone: n + '2', k: 0.08, wk: 0.6 });
    S.capsule(pts[2], [pts[3][0], 0.1, pts[3][2]], r[2], r[3], { bone: n + '3', k: 0.09 });
    S.ellipsoid([pts[3][0], 0.1, pts[3][2] - 0.02], [r[3] * 1.06, 0.12, r[3] * 1.12], { bone: n + '3', k: 0.06 });
    if (!front) S.ellipsoid([pts[0][0], bodyY - 0.15, pts[0][2] + 0.02], [0.42, 0.62, 0.48], { bone: n + '1', k: 0.2 }); // thigh
    else S.ellipsoid([pts[0][0], bodyY - 0.05, pts[0][2] + 0.05], [0.38, 0.58, 0.4], { bone: n + '1', k: 0.2 }); // shoulder
    for (let k = 0; k < (front ? 5 : 4); k++) {
      const a = (k - (front ? 2 : 1.5)) * 0.42;
      S.ellipsoid([pts[3][0] + Math.sin(a) * r[3] * 0.98, 0.07, pts[3][2] - 0.02 - Math.cos(a) * r[3] * 1.0], [0.06, 0.055, 0.04], { bone: n + '3', k: 0.015, tag: 2 });
    }
  }
  S.box([0, -0.25, 0], [3, 0.25, 4], 0, { op: 'sub', k: 0.04 }); // flat soles
  // tail with a tuft
  for (let i = 0; i < 3; i++) S.capsule(tb[i], tb[i + 1], 0.07 - i * 0.015, 0.055 - i * 0.015, { bone: 'tail' + (i + 1), k: 0.04 });
  S.ellipsoid(tb[3], [0.05, 0.12, 0.04], { bone: 'tail4', k: 0.03, tag: 6 });
  const res = S.build({
    bones,
    sigma: 0.09,
    color: (x, y, z, nx, ny, nz, tag, ao) => {
      let c = juvenile ? [0.42, 0.38, 0.36] : [0.37, 0.34, 0.32];
      const n = noise.noise2D(x * 3.1 + z * 1.7, y * 3.3);
      c = c.map((v) => v * (0.92 + 0.12 * n));
      if (tag === 2) c = [0.62, 0.58, 0.5]; // toenails
      if (tag === 5) c = [0.06, 0.04, 0.03];
      if (tag === 6) c = [0.08, 0.07, 0.06];
      // pink depigmentation freckles on the trunk base, face and ear rims (Asian elephants)
      if ((tag === 3 || tag === 4 || (y > hc[1] - 0.4 && z < hc[2] - 0.2)) && !juvenile) {
        const f = noise.noise2D(x * 17, y * 17 + z * 9);
        const zone = tag === 4 ? Math.max(0, Math.abs(nx) < 0.5 ? 0.6 : 0.3) : tag === 3 ? clamp((y - (hc[1] - 1.1)) / 0.8, 0, 1) : 0.5;
        if (f > 0.25) c = lerp3(c, [0.62, 0.48, 0.44], zone * clamp((f - 0.25) * 3, 0, 1));
      }
      // dried red-brown mud on the legs and belly
      const mud = clamp((0.9 - y) / 0.7, 0, 1) * (0.6 + 0.4 * noise.noise2D(x * 4, z * 4));
      c = lerp3(c, [0.36, 0.26, 0.18], mud * 0.75);
      const a = 0.5 + 0.5 * ao;
      return [c[0] * a, c[1] * a, c[2] * a];
    },
  });
  GEO[key] = { ...res, legs: Object.keys(legs), bodyY, hc };
  return GEO[key];
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function dogSculpt() {
  if (GEO.dog) return GEO.dog;
  const S = new Sculpt({ cell: 0.0115 });
  const by = 0.44;
  const bones = [
    { name: 'root', parent: null, pos: [0, by, 0] },
    { name: 'hips', parent: 'root', pos: [0, by + 0.02, 0.24] },
    { name: 'spine', parent: 'root', pos: [0, by + 0.02, 0.0] },
    { name: 'chest', parent: 'spine', pos: [0, by, -0.17] },
    { name: 'neck', parent: 'chest', pos: [0, by + 0.07, -0.3] },
    { name: 'head', parent: 'neck', pos: [0, by + 0.21, -0.43] },
    { name: 'jaw', parent: 'head', pos: [0, by + 0.155, -0.5] },
    { name: 'jaw2', parent: 'jaw', pos: [0, by + 0.14, -0.63] },
    { name: 'earL', parent: 'head', pos: [-0.045, by + 0.27, -0.44] },
    { name: 'earR', parent: 'head', pos: [0.045, by + 0.27, -0.44] },
  ];
  const tb = [[0, by + 0.06, 0.36], [0, by + 0.15, 0.44], [0, by + 0.24, 0.43], [0, by + 0.28, 0.36]];
  tb.forEach((p, i) => bones.push({ name: 'tail' + (i + 1), parent: i ? 'tail' + i : 'hips', pos: p }));
  const legs = {
    fl: [[-0.07, by + 0.02, -0.2], [-0.072, 0.27, -0.2], [-0.068, 0.07, -0.19], [-0.068, 0.0, -0.225]],
    fr: [[0.07, by + 0.02, -0.2], [0.072, 0.27, -0.2], [0.068, 0.07, -0.19], [0.068, 0.0, -0.225]],
    bl: [[-0.075, by + 0.02, 0.27], [-0.078, 0.27, 0.19], [-0.072, 0.12, 0.33], [-0.07, 0.0, 0.3]],
    br: [[0.075, by + 0.02, 0.27], [0.078, 0.27, 0.19], [0.072, 0.12, 0.33], [0.07, 0.0, 0.3]],
  };
  for (const [n, pts] of Object.entries(legs)) pts.forEach((p, i) => bones.push({ name: n + (i + 1), parent: i ? n + i : n[0] === 'f' ? 'chest' : 'hips', pos: p }));
  // body: deep chest, tucked waist, lean hips, visible ribs and shoulder blades
  S.ellipsoid([0, by - 0.01, -0.13], [0.115, 0.16, 0.19], { bone: 'chest', k: 0.06 });
  S.ellipsoid([0, by + 0.03, 0.08], [0.09, 0.095, 0.17], { bone: 'spine', k: 0.07 });
  S.ellipsoid([0, by + 0.02, 0.25], [0.095, 0.1, 0.12], { bone: 'hips', k: 0.06 });
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) S.capsule([s * 0.1, by + 0.08, -0.2 + i * 0.045], [s * 0.105, by - 0.1, -0.17 + i * 0.05], 0.012, 0.01, { bone: 'chest', k: 0.03 });
  for (const s of [-1, 1]) S.ellipsoid([s * 0.07, by + 0.08, -0.2], [0.04, 0.09, 0.06], { bone: 'chest', k: 0.04 });
  // neck, skull, stop, muzzle, jaw, nose, pricked ears
  S.capsule([0, by + 0.05, -0.24], [0, by + 0.19, -0.4], 0.07, 0.055, { bone: 'neck', k: 0.04 });
  S.ellipsoid([0, by + 0.22, -0.45], [0.062, 0.06, 0.075], { bone: 'head', k: 0.03 });
  S.capsule([0, by + 0.2, -0.5], [0, by + 0.175, -0.62], 0.038, 0.026, { bone: 'head', k: 0.03 });
  S.capsule([0, by + 0.155, -0.5], [0, by + 0.148, -0.61], 0.026, 0.017, { bone: 'jaw', k: 0.012 });
  S.capsule([0, by + 0.162, -0.52], [0, by + 0.162, -0.62], 0.012, 0.008, { op: 'sub', k: 0.006 }); // mouth line
  S.sphere([0, by + 0.185, -0.632], 0.016, { bone: 'head', k: 0.01, tag: 2 });
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'earL' : 'earR';
    S.capsule([s * 0.042, by + 0.255, -0.44], [s * 0.06, by + 0.33, -0.435], 0.026, 0.004, { bone: n, k: 0.012, flat: [1, 0.35], hint: [0, 0, 1] });
    S.sphere([s * 0.034, by + 0.225, -0.52], 0.011, { bone: 'head', k: 0.004, tag: 5 }); // eye
    S.ellipsoid([s * 0.045, by + 0.21, -0.48], [0.02, 0.03, 0.035], { bone: 'head', k: 0.02 }); // cheek
  }
  // legs: lean, with elbows / hocks / paws and dew claws
  for (const [n, pts] of Object.entries(legs)) {
    const front = n[0] === 'f';
    const r = front ? [0.042, 0.022, 0.018, 0.022] : [0.05, 0.026, 0.016, 0.02];
    S.capsule(pts[0], pts[1], r[0], r[1], { bone: n + '1', k: 0.03 });
    S.capsule(pts[1], pts[2], r[1], r[2], { bone: n + '2', k: 0.012 });
    S.capsule(pts[2], [pts[3][0], 0.018, pts[3][2] + 0.01], r[2], r[3] * 0.9, { bone: n + '3', k: 0.01 });
    S.ellipsoid([pts[3][0], 0.016, pts[3][2] - 0.005], [r[3] * 1.05, 0.016, r[3] * 1.35], { bone: n + '3', k: 0.008 });
    if (!front) S.ellipsoid([pts[0][0], by - 0.04, pts[0][2] - 0.02], [0.048, 0.1, 0.07], { bone: n + '1', k: 0.03 });
    else S.ellipsoid([pts[0][0], by - 0.04, pts[0][2] + 0.01], [0.04, 0.09, 0.055], { bone: n + '1', k: 0.03 });
  }
  for (let i = 0; i < 3; i++) S.capsule(tb[i], tb[i + 1], 0.024 - i * 0.004, 0.02 - i * 0.004, { bone: 'tail' + (i + 1), k: 0.012 });
  S.box([0, -0.1, 0], [1, 0.1, 1], 0, { op: 'sub', k: 0.004 });
  const res = S.build({
    bones,
    sigma: 0.02,
    color: (x, y, z, nx, ny, nz, tag, ao) => {
      let c = [0.66, 0.5, 0.33];
      const belly = clamp(-ny * 1.2 + 0.2, 0, 1) * (y < by + 0.05 ? 1 : 0.3);
      c = lerp3(c, [0.82, 0.72, 0.56], belly);
      if (z < -0.53 && y < by + 0.2) c = lerp3(c, [0.3, 0.22, 0.16], 0.6); // dark muzzle
      if (y < 0.08) c = lerp3(c, [0.75, 0.68, 0.55], 0.5); // pale socks
      const back = clamp(ny * 1.4 - 0.4, 0, 1) * (y > by ? 1 : 0);
      c = lerp3(c, [0.42, 0.3, 0.2], back * 0.7);
      if (tag === 2) c = [0.05, 0.04, 0.04];
      if (tag === 5) c = [0.12, 0.07, 0.03];
      const a = 0.55 + 0.45 * ao;
      return [c[0] * a, c[1] * a, c[2] * a];
    },
  });
  GEO.dog = { ...res, legs: Object.keys(legs), bodyY: by };
  return GEO.dog;
}

/** The cached sculpted geometry of an animal kind (prewarm: run through prebuildSculpts). */
export function animalGeometry(kind) {
  return SPECIES[kind]?.sculpt() || null;
}

// ------------------------------------------------------------------------------------ species
const SPECIES = {
  elephant: {
    sculpt: () => elephantSculpt(false), scale: 1, detail: 'hide', detailScale: 1.6, bump: 1.6, roughness: 0.9,
    gaits: { walk: { stride: 1.7, duty: 0.66, lift: 0.2, offsets: { bl: 0, fl: 0.25, br: 0.5, fr: 0.75 } } },
    maxSpeed: 1.6,
  },
  elephantCalf: {
    sculpt: () => elephantSculpt(true), scale: 0.44, detail: 'hide', detailScale: 3.2, bump: 1.1, roughness: 0.92,
    gaits: { walk: { stride: 0.9, duty: 0.62, lift: 0.1, offsets: { bl: 0, fl: 0.25, br: 0.5, fr: 0.75 } }, hurry: { stride: 1.1, duty: 0.5, lift: 0.12, offsets: { bl: 0, fl: 0.22, br: 0.5, fr: 0.72 } } },
    maxSpeed: 2.6,
  },
  dog: {
    sculpt: dogSculpt, scale: 1, detail: 'fur', detailScale: 14, bump: 0.9, roughness: 0.95,
    gaits: {
      walk: { stride: 0.55, duty: 0.62, lift: 0.04, offsets: { bl: 0, fl: 0.25, br: 0.5, fr: 0.75 } },
      trot: { stride: 0.9, duty: 0.45, lift: 0.06, offsets: { fl: 0, br: 0, fr: 0.5, bl: 0.5 } },
      gallop: { stride: 1.7, duty: 0.3, lift: 0.1, offsets: { bl: 0, br: 0.1, fl: 0.52, fr: 0.62 }, flex: 1 },
    },
    maxSpeed: 9,
  },
};

// ------------------------------------------------------------------------------------ Quadruped
export class Quadruped extends Entity {
  constructor(kind, opts = {}) {
    super('animal:' + kind);
    const sp = SPECIES[kind] || SPECIES.dog;
    this.kind = kind;
    this.sp = sp;
    const G = sp.sculpt();
    this.G = G;
    this.material = creatureMaterial({
      detail: sp.detail, detailScale: sp.detailScale, detailAmount: 0.85, bump: sp.bump,
      color: opts.tint ?? 0xffffff, roughness: sp.roughness, brush: 0.5, wet: 0.25, sss: 0.3, puddles: 0,
    });
    const { mesh, rig } = skinnedMesh(G.geometry, this.material, G.boneDefs);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.mesh = mesh;
    this.b = rig.byName;
    this.rig = rig;
    this.scale = (opts.scale ?? 1) * sp.scale;
    this.mesh.scale.setScalar(this.scale);
    this.root.add(mesh);
    this._keep = new Set([G.geometry]);
    this.groundFn = opts.groundFn || null;
    this.speed = 0;
    this.vel = new THREE.Vector3();
    this.yaw = opts.yaw ?? 0;
    this.phase = Math.random();
    this.gaitName = 'walk';
    this.gait = sp.gaits.walk;
    this.lookTarget = null;
    this.headQ = new THREE.Quaternion();
    this.move = null;
    this.mood = 0; // dog: tail wag / alert; elephant: ear spread
    this.jaw = 0;
    this.trunkLift = 0;
    // legs
    this.legs = G.legs.map((n) => {
      const b1 = this.b[n + '1'], b2 = this.b[n + '2'], b3 = this.b[n + '3'], b4 = this.b[n + '4'];
      // rest foot (mesh space): sum of rest offsets
      const rest = new THREE.Vector3();
      for (let o = b4; o && o !== mesh; o = o.parent) rest.add(o.userData.rest || o.position);
      return { n, front: n[0] === 'f', b1, b2, b3, b4, rest, plant: new THREE.Vector3(), from: new THREE.Vector3(), target: new THREE.Vector3(), swinging: false, idleStep: -1, init: false };
    });
    this.root.rotation.y = this.yaw;
    this._barkT = 0;
  }

  setGroundFn(fn) {
    this.groundFn = fn;
  }
  _ground(x, z, fallback) {
    if (!this.groundFn) return fallback;
    const y = this.groundFn(x, z);
    return Number.isFinite(y) ? y : fallback;
  }
  /** Resting pose: 'stand' (default) | 'lie' | 'lieAlert' (head up, watching) | 'sleep' (curled). */
  setPose(name = 'stand') {
    this.pose = ['lie', 'lieAlert', 'sleep'].includes(name) ? name : 'stand';
    this._poseK = this._poseK ?? 0;
  }
  setGait(name) {
    if (this.sp.gaits[name]) {
      this.gaitName = name;
      this.gait = this.sp.gaits[name];
    }
  }
  lookAt(target) {
    this.lookTarget = target || null;
  }
  /** Place on the ground at a world position, facing yaw. */
  place(pos, yaw = this.yaw) {
    const parent = this.root.parent || engine.scene;
    parent.updateWorldMatrix(true, false);
    this.root.position.copy(parent.worldToLocal(pos.clone()));
    this.root.position.y = this._ground(pos.x, pos.z, pos.y);
    this.yaw = yaw;
    this.root.rotation.y = yaw;
    for (const l of this.legs) l.init = false;
  }
  /** Walk to a world position. opts { speed, gait }. */
  walkTo(pos, opts = {}) {
    return this.followPath([pos], opts);
  }
  /** Follow world points. opts { speed, gait, faceAtEnd } */
  followPath(points, opts = {}) {
    this.move?.resolve?.(false);
    this.move = { pts: points.map((p) => p.clone()), i: 0, speed: Math.min(opts.speed ?? 1, this.sp.maxSpeed), faceAtEnd: opts.faceAtEnd };
    if (opts.gait) this.setGait(opts.gait);
    return new Promise((res) => (this.move.resolve = res));
  }
  /** Follow another animal (or Object3D) keeping an offset in its frame (calf following its mother). */
  follow(leader, offset = new THREE.Vector3(0.9, 0, 1.6), opts = {}) {
    this.move?.resolve?.(false);
    this.move = { leader, offset: offset.clone(), speed: opts.speed ?? this.sp.maxSpeed, follow: true };
  }
  /** Chase an Object3D (dogs chasing the taxi). opts { speed, offset (world, beside), until() } */
  chase(target, opts = {}) {
    this.move?.resolve?.(false);
    this.move = { chase: target, offset: opts.offset ? opts.offset.clone() : new THREE.Vector3(), speed: Math.min(opts.speed ?? 8, this.sp.maxSpeed), until: opts.until };
    return new Promise((res) => (this.move.resolve = res));
  }
  stopMoving() {
    this.move?.resolve?.(false);
    this.move = null;
  }

  // ---------------------------------------------------------------- per frame
  step(dt) {
    const t = this.time;
    const pos = this.root.position;
    // ---- steering
    let want = 0, dir = null;
    const M = this.move;
    if (M) {
      const parent = this.root.parent || engine.scene;
      let goal = null;
      if (M.pts) {
        goal = parent.worldToLocal(_v.copy(M.pts[M.i]));
        if (Math.hypot(goal.x - pos.x, goal.z - pos.z) < Math.max(0.25, this.speed * 0.4)) {
          M.i++;
          if (M.i >= M.pts.length) {
            this.move = null;
            M.resolve?.(true);
            goal = null;
          } else goal = parent.worldToLocal(_v.copy(M.pts[M.i]));
        }
        want = M.speed;
      } else if (M.follow) {
        const L = M.leader.root || M.leader;
        L.updateWorldMatrix(true, false);
        goal = parent.worldToLocal(_v.copy(M.offset).applyMatrix4(L.matrixWorld));
        const d = Math.hypot(goal.x - pos.x, goal.z - pos.z);
        want = d < 0.3 ? 0 : clamp(d * 0.9, 0, M.speed);
        if (want > (this.sp.gaits.hurry ? 1.3 : 99)) this.setGait('hurry');
        else if (this.sp.gaits.hurry) this.setGait('walk');
      } else if (M.chase) {
        const T = M.chase;
        T.updateWorldMatrix(true, false);
        goal = parent.worldToLocal(_v.setFromMatrixPosition(T.matrixWorld).add(M.offset));
        want = M.speed;
        if (M.until?.()) {
          this.move = null;
          M.resolve?.(true);
          goal = null;
        }
      }
      if (goal) {
        dir = _v2.set(goal.x - pos.x, 0, goal.z - pos.z);
        if (dir.lengthSq() > 1e-6) dir.normalize();
        else dir = null;
      }
    }
    if (!dir) want = 0;
    // dog gait by speed
    if (this.kind === 'dog') this.setGait(this.speed > 4.2 ? 'gallop' : this.speed > 1.6 ? 'trot' : 'walk');
    this.speed = damp(this.speed, want, this.kind === 'dog' ? 2.5 : 1.2, dt);
    if (dir) {
      const yaw = Math.atan2(-dir.x, -dir.z);
      let dy = yaw - this.yaw;
      while (dy > Math.PI) dy -= TAU;
      while (dy < -Math.PI) dy += TAU;
      const turn = (this.kind === 'dog' ? 4 : 1.1) * dt;
      this.yaw += clamp(dy, -turn, turn) * (this.speed > 0.05 ? 1 : 0.5);
    }
    const fwd = _v3.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.vel.copy(fwd).multiplyScalar(this.speed);
    pos.addScaledVector(this.vel, dt);
    pos.y = this._ground(pos.x, pos.z, pos.y);
    this.root.rotation.y = this.yaw;
    // ---- gait clock
    const G = this.gait;
    const freq = this.speed > 0.03 ? this.speed / (G.stride * this.scale) : 0;
    this.phase = (this.phase + dt * freq) % 1;
    // ---- body pose
    const sc = this.scale;
    const bob = freq > 0 ? Math.sin(this.phase * TAU * 2) * 0.012 * sc * (this.kind === 'dog' ? 2 : 1) : 0;
    const flex = G.flex ? Math.sin(this.phase * TAU) * 0.14 * clamp(this.speed / 6, 0, 1) : 0;
    const R = this.b.root;
    R.position.copy(R.userData.rest);
    R.position.y += bob / sc + (this.kind === 'dog' && this.gaitName === 'gallop' ? Math.max(0, Math.sin(this.phase * TAU)) * 0.04 : 0);
    // lying down (dogs in the garage): body lowered onto the ground, slow breathing
    const lying = this.pose && this.pose !== 'stand' && !this.move ? 1 : 0;
    this._poseK = damp(this._poseK ?? 0, lying, 2, dt);
    const pk = this._poseK;
    if (pk > 0.001) {
      const drop = (R.userData.rest.y - (this.kind === 'dog' ? 0.17 : 0.9)) * pk;
      R.position.y -= drop - Math.sin(t * (this.pose === 'sleep' ? 1.6 : 2.4)) * 0.004 * pk;
    }
    // pitch from front / hind foot heights (slopes), plus the gallop's rocking
    const hf = this._avgPlantY(true), hb = this._avgPlantY(false);
    const len = (this.kind === 'dog' ? 0.45 : 1.7) * sc;
    const pitch = Number.isFinite(hf - hb) ? clamp(Math.atan2(hf - hb, len), -0.35, 0.35) : 0;
    R.quaternion.setFromEuler(_e.set(pitch + flex * 0.5, 0, Math.sin(this.phase * TAU) * 0.02 * (freq > 0 ? 1 : 0)));
    const curl = this.pose === 'sleep' ? pk : 0;
    this.b.chest.quaternion.setFromEuler(_e.set(-flex * 0.6, 0.45 * curl, 0));
    this.b.hips.quaternion.setFromEuler(_e.set(flex * 0.6, -0.3 * curl, 0));
    this._head(dt);
    if (pk > 0.001) {
      const asleep = this.pose === 'sleep' ? 1 : 0;
      this.b.neck.quaternion.multiply(_q2.setFromEuler(_e.set(-0.35 * pk * (asleep ? 1.4 : 0.4), 0.5 * curl, 0)));
      this.b.head.quaternion.multiply(_q2.setFromEuler(_e.set(-0.4 * pk * asleep, 0.2 * curl, 0.15 * curl)));
    }
    this._extras(dt, t);
    this.root.updateMatrixWorld(true);
    // ---- legs
    for (const l of this.legs) this._leg(l, dt, freq);
  }

  _avgPlantY(front) {
    let s = 0, n = 0;
    for (const l of this.legs) if (l.front === front && l.init) { s += l.plant.y; n++; }
    return n ? s / n : NaN;
  }

  _restWorld(l, out) {
    out.copy(l.rest);
    out.y = 0;
    this.mesh.updateWorldMatrix(true, false);
    out.applyMatrix4(this.mesh.matrixWorld);
    out.y = this._ground(out.x, out.z, this.root.getWorldPosition(_v).y);
    return out;
  }

  _leg(l, dt, freq) {
    const G = this.gait;
    const rw = this._restWorld(l, new THREE.Vector3());
    if (!l.init) {
      l.plant.copy(rw);
      l.target.copy(rw);
      l.init = true;
    }
    const sc = this.scale;
    const pk = this._poseK ?? 0;
    if (pk > 0.001 && freq === 0) {
      // folded legs: paws forward under the chin, hind legs tucked to the side
      const fwd = _v3.set(0, 0, -1).applyQuaternion(this.mesh.getWorldQuaternion(_q));
      const side = new THREE.Vector3(Math.sign(l.rest.x) || 1, 0, 0).applyQuaternion(_q);
      const lie = rw.clone().addScaledVector(fwd, (l.front ? 0.2 : 0.1) * sc).addScaledVector(side, (l.front ? 0.01 : 0.07) * sc);
      l.target.lerpVectors(l.plant, lie, pk);
    } else if (freq > 0) {
      const ph = (this.phase + (G.offsets[l.n] ?? 0)) % 1;
      if (ph < G.duty) {
        if (l.swinging) {
          l.swinging = false;
          l.plant.copy(l.target);
          this._footfall(l);
        }
        l.target.copy(l.plant);
      } else {
        if (!l.swinging) {
          l.swinging = true;
          l.from.copy(l.plant);
        }
        const s = (ph - G.duty) / (1 - G.duty);
        const remain = ((1 - s) * (1 - G.duty)) / freq;
        const land = rw.clone().addScaledVector(this.vel, remain + (G.duty / freq) * 0.5);
        land.y = this._ground(land.x, land.z, rw.y);
        l.target.lerpVectors(l.from, land, easeInOut(s));
        l.target.y += Math.sin(s * Math.PI) * G.lift * sc;
      }
      l.idleStep = -1;
    } else {
      // standing: settle each foot under its hip, one at a time
      if (l.swinging) {
        l.swinging = false;
        l.plant.copy(l.target);
        l.plant.y = this._ground(l.plant.x, l.plant.z, rw.y);
      }
      if (l.idleStep < 0 && l.plant.distanceTo(rw) > 0.12 * sc && !this.legs.some((o) => o.idleStep >= 0)) {
        l.idleStep = 0;
        l.from.copy(l.plant);
      }
      if (l.idleStep >= 0) {
        l.idleStep += dt / 0.45;
        const s = Math.min(1, l.idleStep);
        l.target.lerpVectors(l.from, rw, easeInOut(s));
        l.target.y += Math.sin(s * Math.PI) * G.lift * sc * 0.6;
        if (s >= 1) {
          l.idleStep = -1;
          l.plant.copy(rw);
          this._footfall(l, 0.5);
        }
      } else l.target.copy(l.plant);
    }
    // IK: ankle / wrist above the foot, elbows back, knees forward
    const foot = l.target;
    this.mesh.getWorldQuaternion(_q);
    const toeOff = _v.copy(l.b4.userData.rest).multiplyScalar(sc).applyQuaternion(_q);
    const ankle = _v2.copy(foot).sub(toeOff);
    const back = _v3.set(0, 0, 1).applyQuaternion(_q);
    l.b1.updateWorldMatrix(true, false);
    const hip = new THREE.Vector3().setFromMatrixPosition(l.b1.matrixWorld);
    const pole = hip.clone().add(ankle).multiplyScalar(0.5).addScaledVector(back, (l.front ? 1 : -1) * 2 * sc);
    const ru = l.front ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, -1);
    solveTwoBoneIK(l.b1, l.b2, l.b3, ankle, pole, ru, ru);
    // lower segment stays near vertical (toe flicks back in the swing)
    l.b3.updateWorldMatrix(true, false);
    const footDir = foot.clone().sub(new THREE.Vector3().setFromMatrixPosition(l.b3.matrixWorld));
    if (footDir.lengthSq() > 1e-8) aimBone(l.b3, l.b4.userData.rest, footDir.normalize(), back.clone().multiplyScalar(l.front ? 1 : -1), ru);
  }

  _footfall(l, vol = 1) {
    if (this.kind === 'dog') {
      if (Math.random() < 0.3) audio.play('footstep_gravel', { position: l.plant, volume: 0.15 * vol, rate: 1.6 });
      return;
    }
    // heavy, soft pad on wet ground
    audio.play('footstep_grass', { position: l.plant, volume: (this.kind === 'elephant' ? 0.45 : 0.25) * vol, rate: this.kind === 'elephant' ? 0.42 : 0.6 });
  }

  _head(dt) {
    const head = this.b.head, neck = this.b.neck;
    let yaw = 0, pitch = 0;
    if (this.lookTarget) {
      const tp = this.lookTarget.isVector3 ? _v.copy(this.lookTarget) : worldPos(this.lookTarget, _v);
      neck.updateWorldMatrix(true, false);
      const hp = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
      const d = tp.sub(hp);
      neck.getWorldQuaternion(_q).invert();
      d.applyQuaternion(_q);
      yaw = clamp(Math.atan2(-d.x, -d.z), -0.9, 0.9);
      pitch = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.45, 0.45);
    }
    const t = this.time;
    if (this.kind === 'dog' && this.speed > 1.5) pitch += Math.sin(this.phase * TAU * 2) * 0.06;
    if (this.kind !== 'dog') pitch += Math.sin(t * 0.7) * 0.03 + (this.speed > 0.1 ? Math.sin(this.phase * TAU * 2) * 0.03 : 0);
    _q2.setFromEuler(_e.set(pitch * 0.65, yaw * 0.65, 0));
    this.headQ.slerp(_q2, 1 - Math.exp(-4 * dt));
    head.quaternion.copy(this.headQ);
    neck.quaternion.setFromEuler(_e.set(pitch * 0.35, yaw * 0.35, 0));
  }

  _extras(dt, t) {
    const b = this.b;
    if (this.kind === 'dog') {
      // tail: wags when excited, streams back in the gallop
      const wag = this.mood > 0.5 ? Math.sin(t * 15) * 0.6 : Math.sin(t * 3) * 0.15;
      const stream = this.gaitName === 'gallop' ? 0.9 : 0;
      b.tail1.quaternion.setFromEuler(_e.set(-stream, wag, 0));
      b.tail2.quaternion.setFromEuler(_e.set(-stream * 0.3, wag * 0.4, 0));
      // ears pricked when alert, folded back when running
      const ear = this.gaitName === 'gallop' ? 0.7 : -this.mood * 0.1;
      b.earL.quaternion.setFromEuler(_e.set(ear, 0, -0.1));
      b.earR.quaternion.setFromEuler(_e.set(ear, 0, 0.1));
      this._barkT -= dt;
      this.jaw = damp(this.jaw, this._barkT > 0 ? 0.55 : this.speed > 4 ? 0.25 : 0.05, 18, dt);
      b.jaw.quaternion.setFromEuler(_e.set(-this.jaw, 0, 0));
    } else {
      // trunk: slow swinging curl, tip exploring; lifts to trumpet
      const lift = this.trunkLift;
      for (let i = 1; i <= 5; i++) {
        const k = i / 5;
        const sway = Math.sin(t * 0.9 - k * 1.8) * 0.08 * k + noise.noise2D(t * 0.3, i) * 0.06;
        const curl = (Math.sin(t * 0.55 - k * 2.2) * 0.07 - 0.04 * k * k) * (1 - lift) + lift * (0.45 - k * 0.1);
        b['trunk' + i].quaternion.setFromEuler(_e.set(curl + (this.speed > 0.1 ? Math.sin(this.phase * TAU) * 0.05 : 0), 0, sway));
      }
      // ears: slow fanning, spread wide when alarmed
      const fan = Math.sin(t * 1.2) * 0.12 + 0.05 + this.mood * 0.6;
      b.earL.quaternion.setFromEuler(_e.set(0, -fan, 0));
      b.earR.quaternion.setFromEuler(_e.set(0, fan, 0));
      b.tail1.quaternion.setFromEuler(_e.set(0.05, 0, Math.sin(t * 1.4) * 0.25));
      b.tail2.quaternion.setFromEuler(_e.set(0, 0, Math.sin(t * 1.4 - 0.6) * 0.2));
    }
  }

  // ---------------------------------------------------------------- voices
  bark(n = 1) {
    if (this.kind !== 'dog') return;
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        if (this.disposed) return;
        this._barkT = 0.18;
        audio.play('dog_bark', { object: this.root, volume: 0.85, rate: rand(0.9, 1.15) });
      }, i * rand(260, 420));
    }
  }
  trumpet() {
    if (this.kind === 'dog') return;
    this.trunkLift = 1;
    this.mood = 1;
    audio.play('elephant_trumpet', { object: this.root, volume: this.kind === 'elephantCalf' ? 0.5 : 0.9, rate: this.kind === 'elephantCalf' ? 1.4 : 1 });
    setTimeout(() => {
      this.trunkLift = 0;
      this.mood = 0;
    }, 2200);
  }
  rumble() {
    audio.play('elephant_rumble', { object: this.root, volume: 0.6 });
  }

  dispose() {
    this.move?.resolve?.(false);
    this.rig.skeleton.dispose();
    this.material.dispose();
    super.dispose();
  }
}

/** createAnimal('elephant'|'elephantCalf'|'dog', opts { tint, scale, groundFn, yaw }) */
export function createAnimal(kind, opts = {}) {
  return new Quadruped(kind, opts);
}

export const DOG_COATS = [0xffffff, 0x9a8a78, 0x3a332e, 0xd9a878, 0xc4b8a8];
export { lerp };
