// เปรต (pret): the hungry ghost of Thai temple murals, five metres of starved body standing among the
// roadside trees. Skin and bone: every rib, the knobs of the spine, the cords of a neck that is a fifth
// of its height, knees and elbows wider than the limbs; the belly slack and distended, loose skin
// hanging in aprons from the belly, the chest, the backs of the arms and the throat; fingers half a
// metre long. A small long-skulled head with sunken temples and deep sockets, sparse long wet hair,
// and the mouth of the curse: a puckered pinhole no wider than a needle's eye, so it can never eat.
// It makes a high, thin whistling cry through it, and its head comes down, slowly, toward you.
//
//   const p = createPret(); p.standAt(pos, faceDir);
//   await p.lowerHead(target, { duration, dist })    head + neck come down to `dist` m from target
//   p.raiseHead(duration) · p.whistle({ volume }) · p.setGhostMotion(name, { amount, instant })
//   p.openMouth(k 0..1, speed) (the pinhole tears wide) · p.lookAt(target) · p.setOpacity(a) · p.vanish(s)
//   p.headPosition (world) · p.noticed (bool, set by callers) · p.humanoid = null
//
// Sculpted in unit space (height 1, front −Z, feet at 0) with the SDF kit, two rigs (body + head),
// detail from the found hide scan (creatureMaterial 'hide'). Uncanny motion: stop-motion sample-and-
// hold, held head tilts, jerks, finger twitches, a neck that stretches to reach.
import * as THREE from 'three';
import { paintedMaterial } from '../render/index.js';
import { engine } from '../core/Engine.js';
import { Sculpt, skinnedMesh } from './sculpt.js';
import { creatureMaterial } from './skin.js';
import { Entity, Rope, DynamicTube, animate, noise, clamp, smoothstep, easeInOut, TAU, setOpacityDeep } from './util.js';
import { whistleBuffer, playVoice } from './voices.js';

const GEO = {};
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// ---------------------------------------------------------------- the body (unit height)
const SIDES = [[-1, 'L'], [1, 'R']]; // facing −Z, its right hand is at +X

function bodyBones() {
  const B = [
    { name: 'root', parent: null, pos: [0, 0.45, 0.004] },
    { name: 'spine1', parent: 'root', pos: [0, 0.52, 0.008] },
    { name: 'spine2', parent: 'spine1', pos: [0, 0.59, 0.016] },
    { name: 'spine3', parent: 'spine2', pos: [0, 0.655, 0.026] },
    { name: 'neck1', parent: 'spine3', pos: [0, 0.685, 0.016] },
    { name: 'neck2', parent: 'neck1', pos: [0, 0.735, 0.004] },
    { name: 'neck3', parent: 'neck2', pos: [0, 0.785, -0.008] },
    { name: 'neck4', parent: 'neck3', pos: [0, 0.835, -0.018] },
    { name: 'head', parent: 'neck4', pos: [0, 0.882, -0.026] },
  ];
  for (const [s, n] of SIDES) {
    B.push(
      { name: 'clav' + n, parent: 'spine3', pos: [s * 0.012, 0.668, 0.012] },
      { name: 'shoulder' + n, parent: 'clav' + n, pos: [s * 0.058, 0.664, 0.018] },
      { name: 'elbow' + n, parent: 'shoulder' + n, pos: [s * 0.068, 0.5, 0.026] },
      { name: 'wrist' + n, parent: 'elbow' + n, pos: [s * 0.07, 0.34, 0.012] },
      { name: 'hand' + n, parent: 'wrist' + n, pos: [s * 0.071, 0.316, 0.008] },
      { name: 'finger' + n, parent: 'hand' + n, pos: [s * 0.072, 0.287, 0.005] },
      { name: 'finger2' + n, parent: 'finger' + n, pos: [s * 0.071, 0.262, 0.003] },
      { name: 'tip' + n, parent: 'finger2' + n, pos: [s * 0.07, 0.243, 0.002] },
      { name: 'hip' + n, parent: 'root', pos: [s * 0.028, 0.44, 0.004] },
      { name: 'knee' + n, parent: 'hip' + n, pos: [s * 0.032, 0.235, -0.01] },
      { name: 'ankle' + n, parent: 'knee' + n, pos: [s * 0.033, 0.032, 0.01] },
      { name: 'toe' + n, parent: 'ankle' + n, pos: [s * 0.034, 0.008, -0.026] },
    );
  }
  return B;
}
const P = (bones, name) => bones.find((b) => b.name === name).pos;
const at = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add = (a, d) => [a[0] + d[0], a[1] + d[1], a[2] + d[2]];

function bodyGeo() {
  if (GEO.body) return GEO.body;
  const bones = bodyBones();
  const S = new Sculpt({ cell: 0.0034 });
  // ---- pelvis, hips, the slack belly and its apron of skin
  S.ellipsoid([0, 0.455, 0.006], [0.031, 0.022, 0.022], { bone: 'root', k: 0.012 });
  for (const s of [-1, 1]) {
    S.capsule([s * 0.029, 0.472, -0.012], [s * 0.032, 0.462, 0.014], 0.0055, 0.005, { bone: 'root', k: 0.006, tag: 1 }); // iliac crest
    S.ellipsoid([s * 0.016, 0.434, 0.02], [0.013, 0.015, 0.011], { bone: 'hip' + (s < 0 ? 'L' : 'R'), k: 0.008, wk: 0.6 }); // wasted buttock
  }
  S.capsule([0, 0.47, 0.008], [0, 0.556, 0.013], 0.021, 0.027, { bone: 'spine1', k: 0.014 }); // waist
  S.ellipsoid([0, 0.492, -0.014], [0.029, 0.03, 0.022], { bone: 'spine1', k: 0.014, tag: 2 }); // distended belly
  S.ellipsoid([0, 0.469, -0.019], [0.026, 0.012, 0.012], { bone: 'root', k: 0.008, tag: 2 }); // hanging apron
  S.capsule([-0.018, 0.4605, -0.026], [0.018, 0.4605, -0.026], 0.0016, 0.0016, { op: 'sub', k: 0.0025 }); // the fold under it
  S.sphere([0, 0.494, -0.0365], 0.0022, { op: 'sub', k: 0.002 }); // navel, stretched
  for (const y of [0.503, 0.511, 0.517]) S.capsule([-0.016, y, -0.035], [0.016, y + 0.002, -0.034], 0.0008, 0.0008, { op: 'sub', k: 0.0012 }); // skin creases
  // ---- ribcage, sternum, shoulder blades, collarbones
  S.ellipsoid([0, 0.607, 0.012], [0.037, 0.05, 0.029], { bone: 'spine2', k: 0.014 });
  S.ellipsoid([0, 0.647, 0.019], [0.039, 0.02, 0.025], { bone: 'spine3', k: 0.012 });
  S.capsule([0, 0.664, -0.012], [0, 0.578, -0.016], 0.0035, 0.003, { bone: 'spine2', k: 0.004 }); // sternum ridge
  S.ellipsoid([0, 0.553, -0.006], [0.026, 0.008, 0.016], { op: 'sub', k: 0.008 }); // hollow under the ribs
  S.sphere([0, 0.672, -0.011], 0.0045, { op: 'sub', k: 0.004 }); // sternal notch
  for (const [s, n] of SIDES) {
    S.capsule([s * 0.006, 0.668, -0.009], [s * 0.054, 0.671, 0.007], 0.0034, 0.003, { bone: 'clav' + n, k: 0.004, tag: 1 });
    S.ellipsoid([s * 0.026, 0.637, 0.043], [0.016, 0.024, 0.005], { bone: 'spine3', k: 0.006, axis: [s * 0.15, 1, 0.1] }); // scapula
    S.ellipsoid([s * 0.021, 0.62, -0.029], [0.014, 0.016, 0.0045], { bone: 'spine2', k: 0.006, axis: [0, 1, 0.45], tag: 2 }); // sagging chest skin
  }
  // the spine: a ridge of knuckled vertebrae down the back
  const spineZ = (y) => (y < 0.52 ? 0.024 : y < 0.59 ? 0.027 + (y - 0.52) * 0.1 : 0.034 + (y - 0.59) * 0.16);
  for (let i = 0; i < 13; i++) {
    const y = 0.462 + i * 0.0165;
    const bone = y < 0.52 ? 'root' : y < 0.59 ? 'spine1' : y < 0.655 ? 'spine2' : 'spine3';
    S.sphere([0, y, spineZ(y) + 0.002], 0.004, { bone, k: 0.0035, tag: 1 });
  }
  // ---- the neck: a fifth of its height, cords and windpipe, a dewlap of loose skin
  const nk = ['neck1', 'neck2', 'neck3', 'neck4', 'head'].map((n) => P(bones, n));
  const nr = [0.0105, 0.0086, 0.008, 0.0078, 0.0084];
  for (let i = 0; i < 4; i++) S.capsule(nk[i], nk[i + 1], nr[i], nr[i + 1], { bone: ['neck1', 'neck2', 'neck3', 'neck4'][i], k: 0.006 });
  S.capsule(P(bones, 'spine3'), nk[0], 0.016, 0.0115, { bone: 'spine3', k: 0.01 });
  for (const s of [-1, 1]) {
    // sternocleidomastoid: from behind the ear to the notch, one segment per neck bone
    const a0 = add(nk[4], [s * 0.0068, -0.004, 0.004]), a1 = [s * 0.0045, 0.676, -0.012];
    for (let i = 0; i < 4; i++) {
      const p0 = at(a1, a0, i / 4), p1 = at(a1, a0, (i + 1) / 4);
      S.capsule(p0, p1, 0.0026, 0.0024, { bone: ['neck1', 'neck2', 'neck3', 'neck4'][i], k: 0.0025, wk: 0.7 });
    }
  }
  S.sphere(add(at(nk[0], nk[1], 0.6), [0, -0.002, -0.0085]), 0.0032, { bone: 'neck1', k: 0.0025 }); // adam's apple
  S.ellipsoid(add(at(nk[1], nk[2], 0.4), [0, -0.012, -0.007]), [0.006, 0.026, 0.0035], { bone: 'neck2', k: 0.005, axis: [0, 1, 0.3], tag: 2 }); // dewlap
  for (let i = 0; i < 5; i++) S.sphere(add(nk[i], [0, 0, 0.0075]), 0.0026, { bone: ['neck1', 'neck2', 'neck3', 'neck4', 'neck4'][i], k: 0.003, tag: 1 });
  // ---- arms: bone and the skin hanging off it; knob joints; fingers half a metre long
  for (const [s, n] of SIDES) {
    const sh = P(bones, 'shoulder' + n), el = P(bones, 'elbow' + n), wr = P(bones, 'wrist' + n), hd = P(bones, 'hand' + n);
    S.sphere(sh, 0.0102, { bone: 'shoulder' + n, k: 0.006, tag: 1 });
    S.capsule(sh, el, 0.0068, 0.0052, { bone: 'shoulder' + n, k: 0.004 });
    S.ellipsoid(add(at(sh, el, 0.42), [-s * 0.0055, -0.004, 0.0045]), [0.0035, 0.052, 0.006], { bone: 'shoulder' + n, k: 0.005, axis: [el[0] - sh[0], el[1] - sh[1], el[2] - sh[2]], hint: [s, 0, 0], tag: 2 }); // bat-wing skin
    S.sphere(el, 0.0068, { bone: 'elbow' + n, k: 0.004, tag: 1 });
    S.sphere(add(el, [0, 0.002, 0.0055]), 0.0052, { bone: 'elbow' + n, k: 0.003, tag: 1 }); // olecranon
    S.capsule(add(el, [s * 0.0016, 0, -0.0016]), add(wr, [s * 0.0018, 0, -0.0018]), 0.0042, 0.0031, { bone: 'elbow' + n, k: 0.003 }); // radius
    S.capsule(add(el, [-s * 0.0012, 0, 0.0022]), add(wr, [-s * 0.0012, 0, 0.002]), 0.0038, 0.003, { bone: 'elbow' + n, k: 0.003 }); // ulna
    S.sphere(wr, 0.0041, { bone: 'wrist' + n, k: 0.003, tag: 1 });
    S.capsule(wr, hd, 0.0046, 0.0044, { bone: 'wrist' + n, k: 0.003, flat: [0.55, 1.35], hint: [s, 0, 0] }); // palm
    const fg = P(bones, 'finger' + n), f2 = P(bones, 'finger2' + n), tp = P(bones, 'tip' + n);
    for (let k = 0; k < 4; k++) {
      const dz = (k - 1.5) * 0.0042;
      const len = [0.92, 1, 0.97, 0.8][k];
      const j0 = add(hd, [0, 0, dz]);
      const j1 = add(at(hd, fg, len), [0, 0, dz * 1.08]);
      const j2 = add(at(fg, f2, len), [-s * 0.0012, 0, dz * 1.12]);
      const j3 = add(at(f2, tp, len), [-s * 0.0028, 0, dz * 1.14]);
      S.capsule(j0, j1, 0.0021, 0.0017, { bone: 'hand' + n, k: 0.0015 });
      S.capsule(j1, j2, 0.0017, 0.0014, { bone: 'finger' + n, k: 0.0012 });
      S.capsule(j2, j3, 0.0014, 0.0009, { bone: 'finger2' + n, k: 0.001 });
      S.sphere(j1, 0.0021, { bone: 'finger' + n, k: 0.001, tag: 1 });
      S.sphere(j2, 0.0017, { bone: 'finger2' + n, k: 0.0008, tag: 1 });
      S.capsule(add(j3, [0, 0.0045, 0]), add(j3, [-s * 0.0006, -0.0012, 0]), 0.0009, 0.0004, { bone: 'finger2' + n, k: 0.0005, flat: [0.55, 1], hint: [s, 0, 0], tag: 6 }); // nail
    }
    const th0 = add(wr, [0, -0.008, -0.006]);
    S.capsule(th0, add(th0, [-s * 0.002, -0.017, -0.006]), 0.0024, 0.0016, { bone: 'wrist' + n, k: 0.0015 });
    S.capsule(add(th0, [-s * 0.002, -0.017, -0.006]), add(th0, [-s * 0.004, -0.031, -0.006]), 0.0016, 0.001, { bone: 'hand' + n, k: 0.001 });
  }
  // ---- legs: thigh bone and a wasted muscle, knees like knots, shins like sticks, long bony feet
  for (const [s, n] of SIDES) {
    const hp = P(bones, 'hip' + n), kn = P(bones, 'knee' + n), an = P(bones, 'ankle' + n), to = P(bones, 'toe' + n);
    S.capsule(hp, kn, 0.0105, 0.0074, { bone: 'hip' + n, k: 0.006 });
    S.ellipsoid(add(at(hp, kn, 0.35), [0, 0, -0.004]), [0.009, 0.05, 0.008], { bone: 'hip' + n, k: 0.006, wk: 0.6 });
    S.sphere(kn, 0.0094, { bone: 'knee' + n, k: 0.004, tag: 1 });
    S.ellipsoid(add(kn, [0, 0.002, -0.0072]), [0.0058, 0.0068, 0.003], { bone: 'knee' + n, k: 0.003, tag: 1 }); // kneecap
    S.capsule(kn, an, 0.0064, 0.0039, { bone: 'knee' + n, k: 0.004 });
    S.capsule(add(kn, [0, -0.012, -0.0045]), add(an, [0, 0.03, -0.0032]), 0.0026, 0.0022, { bone: 'knee' + n, k: 0.002 }); // shin ridge
    S.ellipsoid(add(at(kn, an, 0.22), [0, 0, 0.0055]), [0.0056, 0.03, 0.005], { bone: 'knee' + n, k: 0.004, wk: 0.6 }); // the calf, nearly gone
    S.sphere(add(an, [s * 0.0042, 0, 0]), 0.0036, { bone: 'ankle' + n, k: 0.002, tag: 1 });
    S.sphere(add(an, [-s * 0.0042, 0.002, 0]), 0.0036, { bone: 'ankle' + n, k: 0.002, tag: 1 });
    S.sphere(add(an, [0, -0.021, 0.008]), 0.0058, { bone: 'ankle' + n, k: 0.004 }); // heel
    S.capsule(add(an, [0, -0.018, 0.006]), to, 0.0055, 0.004, { bone: 'ankle' + n, k: 0.004, flat: [1.25, 0.65], hint: [0, 1, 0] });
    for (let k = 0; k < 5; k++) {
      const dx = (k - 2) * 0.0026 * s;
      const len = [0.026, 0.024, 0.022, 0.019, 0.016][k];
      const b0 = add(to, [dx, -0.001, 0]);
      const b1 = add(b0, [dx * 0.25, -0.002, -len * 0.55]);
      const b2 = add(b0, [dx * 0.35, -0.0055, -len]);
      S.capsule(b0, b1, 0.0019, 0.0016, { bone: 'toe' + n, k: 0.0012 });
      S.capsule(b1, b2, 0.0016, 0.0011, { bone: 'toe' + n, k: 0.001 });
      S.sphere(b1, 0.0019, { bone: 'toe' + n, k: 0.0008, tag: 1 });
    }
  }
  // ---- the surface: ribs, rings in the neck skin, the slow ripple of skin over bone
  S.displace((x, y, z) => {
    let d = 0;
    if (y > 0.553 && y < 0.662 && z < 0.036) {
      const front = clamp((0.03 - z) / 0.05, 0, 1);
      const v = (y + 0.02 * front) / 0.0102;
      const groove = Math.pow(Math.max(0, Math.cos(v * TAU)), 5);
      const mask = smoothstep(0.553, 0.566, y) * (1 - smoothstep(0.646, 0.662, y)) * smoothstep(0.003, 0.012, Math.abs(x) + (1 - front) * 0.02);
      d -= 0.0013 * groove * mask;
    }
    if (y > 0.69 && y < 0.88) d -= 0.0004 * Math.pow(Math.max(0, Math.cos((y / 0.0072) * TAU)), 4) * smoothstep(-0.002, -0.01, z - 0.0);
    d += 0.00028 * noise.noise3D(x * 95, y * 95, z * 95) + 0.00011 * noise.noise3D(x * 150, y * 150, z * 150);
    return d;
  });
  const res = S.build({
    bones,
    sigma: 0.0052,
    color: (x, y, z, nx, ny, nz, tag, ao) => {
      // ash-grey, mud-brown skin, darker over every knob of bone, paler where it hangs
      let c = [0.34, 0.31, 0.28];
      const m = noise.noise3D(x * 40, y * 40, z * 40);
      c = mix(c, [0.27, 0.25, 0.23], clamp(m * 0.8 + 0.2, 0, 1) * 0.6);
      c = c.map((v) => v * (0.9 + 0.12 * noise.noise3D(x * 160, y * 160, z * 160)));
      if (tag === 1) c = mix(c, [0.24, 0.21, 0.19], 0.55);
      if (tag === 2) c = mix(c, [0.42, 0.38, 0.34], 0.45 + 0.25 * noise.noise3D(x * 70, y * 70, z * 70));
      if (tag === 6) c = [0.36, 0.31, 0.2];
      // grime toward the feet, a bruise-dark under the ribs
      c = mix(c, [0.18, 0.16, 0.13], clamp((0.12 - y) / 0.12, 0, 1) * 0.6);
      const a = 0.5 + 0.5 * ao;
      return [c[0] * a, c[1] * a, c[2] * a];
    },
  });
  res.geometry.userData.shared = true;
  GEO.body = res;
  return res;
}

// ---------------------------------------------------------------- the head (head-bone space)
function headGeo() {
  if (GEO.head) return GEO.head;
  const bones = [
    { name: 'skull', parent: null, pos: [0, 0, 0] },
    { name: 'lips', parent: 'skull', pos: [0, 0.0, -0.034] },
  ];
  const S = new Sculpt({ cell: 0.0011 });
  S.capsule([0, -0.006, 0.006], [0, 0.012, 0.002], 0.0084, 0.0095, { bone: 'skull', k: 0.005 }); // the neck's top
  S.ellipsoid([0, 0.033, 0.004], [0.022, 0.029, 0.028], { bone: 'skull', k: 0.008 }); // long cranium
  S.ellipsoid([0, 0.039, 0.016], [0.019, 0.022, 0.02], { bone: 'skull', k: 0.008 }); // back of the skull
  S.ellipsoid([0, 0.013, -0.015], [0.0165, 0.026, 0.016], { bone: 'skull', k: 0.008 }); // gaunt long face
  for (const s of [-1, 1]) {
    S.sphere([s * 0.023, 0.03, -0.009], 0.0082, { op: 'sub', k: 0.006 }); // sunken temple
    S.ellipsoid([s * 0.0145, 0.0165, -0.0235], [0.0065, 0.0042, 0.0058], { bone: 'skull', k: 0.0035, tag: 1 }); // cheekbone
    S.ellipsoid([s * 0.0135, 0.004, -0.0255], [0.0062, 0.0085, 0.0062], { op: 'sub', k: 0.0045 }); // hollow cheek
    S.sphere([s * 0.0088, 0.0225, -0.0315], 0.0064, { op: 'sub', k: 0.0028 }); // deep socket
    S.capsule([s * 0.0158, 0.0035, -0.0105], [s * 0.0055, -0.0145, -0.0235], 0.0031, 0.0026, { bone: 'skull', k: 0.0025, tag: 1 }); // jaw line
    S.ellipsoid([s * 0.0215, 0.019, 0.0005], [0.0028, 0.0095, 0.0058], { bone: 'skull', k: 0.0022, axis: [s * 0.25, 1, 0.2], tag: 3 }); // withered ear
    S.capsule([s * 0.0035, 0.034, -0.0295], [s * 0.0055, 0.044, -0.026], 0.0005, 0.0005, { op: 'sub', k: 0.0006 }); // frown furrow
  }
  S.capsule([-0.0155, 0.0302, -0.0282], [0.0155, 0.0302, -0.0282], 0.0041, 0.0041, { bone: 'skull', k: 0.0035, tag: 1 }); // brow ridge
  for (let i = 0; i < 3; i++) S.capsule([-0.011, 0.038 + i * 0.0042, -0.027 + i * 0.001], [0.011, 0.0385 + i * 0.0042, -0.027 + i * 0.001], 0.0005, 0.0005, { op: 'sub', k: 0.0006 }); // forehead lines
  // no nose to speak of: a ridge and two slits
  S.capsule([0, 0.026, -0.0315], [0, 0.0125, -0.0335], 0.0023, 0.0021, { bone: 'skull', k: 0.002 });
  for (const s of [-1, 1]) S.capsule([s * 0.0021, 0.0125, -0.0355], [s * 0.0029, 0.0075, -0.0322], 0.0012, 0.001, { op: 'sub', k: 0.0007 });
  // the mouth of the curse: a muzzle drawn to a puckered knot, a pinhole through it
  S.ellipsoid([0, -0.0005, -0.0275], [0.0105, 0.0095, 0.0075], { bone: 'skull', k: 0.004 });
  S.sphere([0, 0.0, -0.0338], 0.0033, { bone: 'lips', k: 0.0022, tag: 4 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.2;
    S.capsule([Math.cos(a) * 0.0016, Math.sin(a) * 0.0016, -0.0372], [Math.cos(a) * 0.0068, Math.sin(a) * 0.0068, -0.0322], 0.00055, 0.0004, { op: 'sub', k: 0.0005 }); // pucker
  }
  S.capsule([0, 0.0, -0.041], [0, 0.0, -0.029], 0.0009, 0.0009, { op: 'sub', k: 0.0003, tag: 5 }); // the pinhole
  S.ellipsoid([0, -0.0135, -0.0235], [0.0068, 0.0058, 0.0065], { bone: 'skull', k: 0.003 }); // small pointed chin
  S.ellipsoid([0, -0.0155, -0.0125], [0.0068, 0.0078, 0.004], { bone: 'skull', k: 0.004, tag: 2 }); // loose skin under the jaw
  S.displace((x, y, z) => 0.00016 * noise.noise3D(x * 260, y * 260, z * 260) + 0.00008 * noise.noise3D(x * 480, y * 480, z * 480));
  const res = S.build({
    bones,
    sigma: 0.0016,
    color: (x, y, z, nx, ny, nz, tag, ao) => {
      let c = [0.33, 0.3, 0.27];
      c = c.map((v) => v * (0.88 + 0.14 * noise.noise3D(x * 500, y * 500, z * 500)));
      // the sockets and the temples go dark as bruises
      for (const s of [-1, 1]) {
        const d = Math.hypot(x - s * 0.0088, y - 0.0225, z + 0.03);
        c = mix(c, [0.12, 0.1, 0.09], clamp(1 - d / 0.009, 0, 1) * 0.85);
      }
      if (tag === 1) c = mix(c, [0.25, 0.22, 0.2], 0.4);
      if (tag === 2) c = mix(c, [0.4, 0.36, 0.32], 0.4);
      if (tag === 3) c = mix(c, [0.22, 0.18, 0.16], 0.5);
      if (tag === 4) c = mix(c, [0.24, 0.14, 0.14], 0.8);
      if (tag === 5) c = [0.02, 0.012, 0.01];
      const a = 0.45 + 0.55 * ao;
      return [c[0] * a, c[1] * a, c[2] * a];
    },
  });
  res.geometry.userData.shared = true;
  GEO.head = res;
  return res;
}

/** The pret's cached sculpts (prewarm: run through prebuildSculpts). */
export function pretGeometry() {
  return [bodyGeo(), headGeo()];
}

// ---------------------------------------------------------------- motion presets
// stutter (stop-motion sample-and-hold), jerks (snaps), holdTilt (a held, wrong angle of the head),
// twitch (fingers), still (no sway / breath), neckRoam (the neck wanders), gape (the pinhole tears)
export const PRET_MOTIONS = {
  none: {},
  calm: { stutter: 0.2, holdTilt: 0.3, twitch: 0.3, neckRoam: 0.2 },
  stopMotion: { stutter: 1, jerks: 0.4, still: 0.7, holdTilt: 0.4 },
  tiltHold: { holdTilt: 1, still: 0.9, neckRoam: 0.6 },
  watcher: { still: 1, twitch: 1, holdTilt: 0.5 },
  wrongLimbs: { twitch: 1, jerks: 0.5, neckRoam: 0.5 },
  gape: { gape: 1, jerks: 0.4, stutter: 0.5 },
  nightmare: { stutter: 0.8, jerks: 0.8, holdTilt: 0.7, neckRoam: 0.7, twitch: 1 },
};
const GM_KEYS = ['stutter', 'jerks', 'holdTilt', 'twitch', 'still', 'neckRoam', 'gape'];

// ---------------------------------------------------------------- entity
export class Pret extends Entity {
  constructor(opts = {}) {
    super('pret');
    this.height = opts.height ?? 5.2;
    const B = bodyGeo(), Hd = headGeo();
    this.mat = creatureMaterial({ detail: 'hide', detailScale: 34, detailAmount: 0.72, bump: 1.15, roughness: 0.8, sss: 0.3, wet: 0.35, brush: 0.4, puddles: 0 });
    this.headMat = creatureMaterial({ detail: 'hide', detailScale: 95, detailAmount: 0.62, bump: 0.8, roughness: 0.7, sss: 0.35, wet: 0.45, brush: 0.3, puddles: 0 });
    const { mesh, rig } = skinnedMesh(B.geometry, this.mat, B.boneDefs);
    mesh.scale.setScalar(this.height);
    mesh.castShadow = true;
    this.mesh = mesh;
    this.rig = rig;
    this.b = rig.byName;
    this.root.add(mesh);
    const h = skinnedMesh(Hd.geometry, this.headMat, Hd.boneDefs);
    this.head = h.mesh;
    this.hb = h.rig.byName;
    this.headRig = h.rig;
    this.head.castShadow = true;
    this.b.head.add(this.head);
    // sunken eyes, black and wet, a pinpoint of light in each
    this.eyeMat = paintedMaterial({ color: 0x0b0908, roughness: 0.05, wet: 1, brush: 0, puddles: 0, envReflect: 1.6 });
    const eg = new THREE.SphereGeometry(0.0034, 18, 12);
    this._eyeGeo = eg;
    this.eyes = [-1, 1].map((s) => {
      const e = new THREE.Mesh(eg, this.eyeMat);
      e.position.set(s * 0.0088, 0.0222, -0.0285);
      this.hb.skull.add(e);
      return e;
    });
    // anchors
    this.faceAnchor = new THREE.Object3D();
    this.faceAnchor.position.set(0, 0.014, -0.034);
    this.hb.skull.add(this.faceAnchor);
    this.bones = { Head: this.faceAnchor };
    this.humanoid = null;
    // sparse long hair: a few wet strands from the scalp (world-space ropes)
    this.hairMat = paintedMaterial({ color: 0x0a0908, roughness: 0.42, wet: 0.7, brush: 0, puddles: 0 });
    this.hairGroup = new THREE.Group();
    this.hairGroup.name = 'pretHair';
    this.strands = [];
    const roots = 13;
    for (let i = 0; i < roots; i++) {
      const a = (i / roots) * Math.PI * 1.6 - Math.PI * 0.8 + Math.sin(i * 7.1) * 0.12;
      const lat = 0.55 + 0.35 * Math.abs(Math.sin(i * 3.7));
      const anchor = new THREE.Object3D();
      anchor.position.set(Math.sin(a) * 0.02 * lat, 0.036 + 0.024 * Math.cos(lat), 0.008 + Math.cos(a) * 0.02 * lat);
      this.hb.skull.add(anchor);
      const len = (0.9 + 0.8 * Math.abs(Math.sin(i * 5.3))) * (this.height / 5.2);
      const n = 12;
      const rope = new Rope(n, len / n, new THREE.Vector3());
      rope.gravity = -9;
      rope.damping = 0.94;
      const r = 0.0042 * (0.7 + 0.6 * Math.abs(Math.sin(i * 2.3))) * (this.height / 5.2);
      const tube = new DynamicTube(n, 4, (t) => r * (1 - t * 0.75), this.hairMat);
      tube.mesh.castShadow = true;
      this.hairGroup.add(tube.mesh);
      this.strands.push({ anchor, rope, tube, init: false });
    }
    // rest state
    this.neck = [this.b.neck1, this.b.neck2, this.b.neck3, this.b.neck4];
    this._neckLen = this.neck.slice(1).concat([this.b.head]).reduce((s, b) => s + b.userData.rest.length(), 0);
    this.maxStretch = opts.maxStretch ?? 3.2;
    this.stretch = 1;
    this.reach = { w: 0, target: null, dist: 0.6, steps: true, goal: new THREE.Vector3(), look: new THREE.Vector3() };
    this.lookTarget = null;
    this.gm = {};
    this.gmT = {};
    for (const k of GM_KEYS) this.gm[k] = this.gmT[k] = 0;
    this.setGhostMotion(opts.motion || 'calm', { instant: true });
    this.mouth = 0;
    this.mouthT = 0;
    this.pucker = 0;
    this.noticed = false;
    this.opacity = 1;
    this._hold = { t: 0, q: null };
    this._jk = new THREE.Vector3();
    this._tilt = 0;
    this._tiltT = 0;
    this._tiltTimer = 1;
    this._bonesAll = [...rig.bones, ...h.rig.bones];
    this._preIK = this.neck.concat([this.b.head]).map(() => new THREE.Quaternion());
  }

  get headPosition() {
    return this.faceAnchor.getWorldPosition(this._hp || (this._hp = new THREE.Vector3()));
  }

  /** Stand at `pos` (world, on the ground) facing `dir` (world direction or a point to face). */
  standAt(pos, face = null) {
    if (!this.root.parent) engine.scene.add(this.root);
    if (!this.hairGroup.parent) engine.scene.add(this.hairGroup);
    const par = this.root.parent;
    par.updateWorldMatrix(true, false);
    this.root.position.copy(par.worldToLocal(pos.clone()));
    if (face) {
      const d = face.clone();
      if (face.lengthSq() > 4) d.sub(pos); // a point
      d.y = 0;
      if (d.lengthSq() > 1e-6) this.root.rotation.set(0, Math.atan2(-d.x, -d.z), 0);
    }
    for (const s of this.strands) s.init = false;
    return this;
  }

  /** Ghost-motion preset (PRET_MOTIONS): 'calm' 'stopMotion' 'tiltHold' 'watcher' 'wrongLimbs' 'gape' 'nightmare' 'none'. */
  setGhostMotion(name = 'calm', opts = {}) {
    const p = PRET_MOTIONS[name];
    if (!p) return false;
    const amt = opts.amount ?? 1;
    for (const k of GM_KEYS) {
      this.gmT[k] = (p[k] || 0) * amt;
      if (opts.instant) this.gm[k] = this.gmT[k];
    }
    if (name === 'gape') this.openMouth(Math.min(1, amt), 6);
    this.motion = name;
    return true;
  }

  /** The pinhole tears open (k 0..1; 1 = wide enough to take a head). */
  openMouth(k = 1, speed = 3) {
    this.mouthT = k;
    this._mouthSpeed = speed;
  }

  lookAt(target) {
    this.lookTarget = target || null;
  }

  /**
   * The head comes down toward `target` (Object3D, Vector3 or () => Vector3), stopping `dist` m short,
   * over `duration` s; the neck stretches as far as it must (maxStretch). In held steps unless
   * opts.steps === false. Resolves when it is there (it stays there, tracking, until raiseHead()).
   */
  lowerHead(target, opts = {}) {
    const R = this.reach;
    R.target = target;
    R.dist = opts.dist ?? 0.6;
    R.steps = opts.steps !== false;
    this.lookTarget = target;
    const d = opts.duration ?? 8;
    const w0 = R.w;
    return animate(d, (k) => {
      const kk = R.steps ? Math.floor(k * 14) / 14 : k;
      R.w = w0 + (1 - w0) * easeInOut(kk);
    });
  }
  raiseHead(duration = 3) {
    const R = this.reach;
    const w0 = R.w;
    return animate(duration, (k) => (R.w = w0 * (1 - easeInOut(k)))).then(() => {
      R.target = null;
    });
  }

  /** Its cry: a high thin whistle through the pinhole (the lips pucker and flutter while it lasts). */
  whistle(opts = {}) {
    this._whistleT = 4.2;
    return playVoice(whistleBuffer(), { object: this.faceAnchor, volume: opts.volume ?? 1, ref: opts.ref ?? 14, rolloff: 0.35, reverb: 0.55, rate: opts.rate ?? 1 });
  }

  setOpacity(a) {
    this.opacity = a;
    setOpacityDeep(this.root, a);
    setOpacityDeep(this.hairGroup, a);
  }
  async vanish(d = 1.5) {
    const a0 = this.opacity;
    await animate(d, (k) => this.setOpacity(a0 * (1 - k)), easeInOut);
  }

  _resolve(t, out) {
    if (!t) return null;
    if (typeof t === 'function') return out.copy(t());
    if (t.isObject3D) return t.getWorldPosition(out);
    if (t.isVector3) return out.copy(t);
    return null;
  }

  step(dt) {
    const gm = this.gm;
    for (const k of GM_KEYS) gm[k] += (this.gmT[k] - gm[k]) * Math.min(1, dt * 3);
    const T = this.time;
    const b = this.b;
    const still = gm.still;
    // ---- 1. rest
    for (const bone of this.rig.bones) {
      bone.quaternion.identity();
      bone.position.copy(bone.userData.rest);
      bone.scale.set(1, 1, 1);
    }
    // ---- 2. the standing pose: stooped, knees soft, arms hanging long, swaying like a tree
    const sway = (1 - still * 0.85);
    b.root.rotation.set(noise.noise2D(T * 0.13, 1.7) * 0.012 * sway, 0, noise.noise2D(T * 0.11, 4.2) * 0.016 * sway);
    b.spine1.rotation.x = -0.05;
    b.spine2.rotation.x = -0.08;
    b.spine3.rotation.x = -0.15;
    const breath = Math.sin(T * 0.9) * (1 - still);
    b.spine2.scale.set(1 + 0.012 * breath, 1, 1 + 0.018 * breath);
    for (const [s, n] of SIDES) {
      const ph = s * 1.3;
      b['hip' + n].rotation.x = 0.06;
      b['knee' + n].rotation.x = -0.13;
      b['ankle' + n].rotation.x = 0.07;
      b['clav' + n].rotation.z = s * -0.04;
      // the stoop swings hanging arms back: the shoulders bring them to hang plumb, a little forward
      b['shoulder' + n].rotation.set(0.32 + noise.noise2D(T * 0.17, ph) * 0.05 * sway, 0, s * 0.04);
      b['elbow' + n].rotation.x = 0.14 + noise.noise2D(T * 0.21, ph + 3) * 0.04 * sway;
      // fingers: half-curled, twitching (snapped, held, released)
      const tw = gm.twitch * (noise.noise2D(T * 2.3, ph + 9) > 0.55 ? 1 : 0);
      const curl = 0.22 + 0.18 * noise.noise2D(T * 0.3, ph + 5) + tw * 0.5;
      b['hand' + n].rotation.z = -s * curl * 0.6;
      b['finger' + n].rotation.z = -s * curl;
      b['finger2' + n].rotation.z = -s * curl * 1.2;
    }
    // ---- 3. the neck: craned forward; roams; reaches
    const roam = gm.neckRoam;
    const ry = noise.noise2D(T * 0.09, 11) * 0.35 * roam, rp = noise.noise2D(T * 0.07, 13) * 0.2 * roam;
    b.neck1.rotation.set(-0.12 + rp * 0.3, ry * 0.25, 0);
    b.neck2.rotation.set(-0.12 + rp * 0.3, ry * 0.25, 0);
    b.neck3.rotation.set(-0.05 + rp * 0.2, ry * 0.25, 0);
    b.neck4.rotation.set(0.05, ry * 0.25, 0);
    b.head.rotation.set(0.26 + rp * 0.4, 0, 0);
    const R = this.reach;
    const goal = R.target ? this._resolve(R.target, R.goal) : null;
    if (goal && R.w > 0.001) {
      // a point `dist` short of the target, on the line back toward the neck's base
      b.neck1.getWorldPosition(_a);
      const toT = _v.copy(goal).sub(_a);
      const L = toT.length();
      const want = Math.max(0.01, L - R.dist);
      _v2.copy(_a).addScaledVector(toT.normalize(), want);
      const ws = this.mesh.scale.x;
      const need = want / Math.max(0.01, this._neckLen * ws * 0.97);
      const st = clamp(need, 1, this.maxStretch);
      this.stretch += (1 + (st - 1) * R.w - this.stretch) * Math.min(1, dt * 4);
    } else this.stretch += (1 - this.stretch) * Math.min(1, dt * 2);
    for (const bone of [b.neck2, b.neck3, b.neck4, b.head]) bone.position.copy(bone.userData.rest).multiplyScalar(this.stretch);
    this.mesh.updateMatrixWorld(true);
    if (goal && R.w > 0.001) {
      const chain = this.neck.concat([b.head]);
      chain.forEach((bone, i) => this._preIK[i].copy(bone.quaternion));
      for (let it = 0; it < 4; it++) this._ccd(_v2);
      // blend toward the reached pose by w
      chain.forEach((bone, i) => bone.quaternion.copy(this._preIK[i]).slerp(_q.copy(bone.quaternion), R.w));
      this.mesh.updateMatrixWorld(true);
    }
    // ---- 4. the head: faces what it wants, a held wrong tilt, snaps
    const lt = this._resolve(this.lookTarget, _v3);
    if (gm.jerks > 0.01 && Math.random() < dt * gm.jerks * 0.9) this._jk.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.7);
    this._jk.multiplyScalar(Math.exp(-dt * 9));
    this._tiltTimer -= dt;
    if (this._tiltTimer <= 0) {
      this._tiltT = gm.holdTilt > 0.05 && Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.45) * gm.holdTilt : 0;
      this._tiltTimer = 2.5 + Math.random() * 4;
    }
    this._tilt += (this._tiltT - this._tilt) * Math.min(1, dt * (gm.holdTilt > 0.5 ? 14 : 3));
    if (lt) {
      b.head.getWorldPosition(_a);
      _m.lookAt(_a, lt, _b.set(0, 1, 0));
      _q.setFromRotationMatrix(_m);
      b.head.parent.getWorldQuaternion(_q2).invert();
      const want = _q2.multiply(_q);
      const w = clamp(0.55 + R.w * 0.45, 0, 1);
      b.head.quaternion.slerp(want, w);
    }
    _e.set(this._jk.x, this._jk.y, this._tilt + this._jk.z, 'XYZ');
    b.head.quaternion.multiply(_q3.setFromEuler(_e));
    // ---- 5. the pinhole: puckered, fluttering while it whistles; torn wide when it gapes
    this.mouth += (Math.max(this.mouthT, gm.gape * 0.35) - this.mouth) * Math.min(1, dt * (this._mouthSpeed || 3));
    this._whistleT = Math.max(0, (this._whistleT || 0) - dt);
    const wh = this._whistleT > 0 ? 1 : 0;
    this.pucker += (wh - this.pucker) * Math.min(1, dt * 6);
    const fl = wh * 0.08 * Math.sin(T * 63);
    const mo = this.mouth;
    const lips = this.hb.lips;
    lips.position.copy(lips.userData.rest);
    lips.scale.set(1 - 0.2 * this.pucker + fl + 3.2 * mo, 1 - 0.2 * this.pucker - fl + 5.0 * mo, 1 + 0.45 * this.pucker - 0.4 * mo);
    lips.position.z -= 0.002 * this.pucker;
    lips.position.y -= 0.006 * mo;
    // ---- 6. stop-motion: the pose is shown in held frames
    if (gm.stutter > 0.05) {
      const H = this._hold;
      H.t -= dt;
      if (!H.q) H.q = this._bonesAll.map((bn) => ({ q: bn.quaternion.clone(), p: bn.position.clone(), s: bn.scale.clone() }));
      if (H.t <= 0) {
        H.t = (1 / (5 + 14 * (1 - gm.stutter))) * (Math.random() < 0.2 ? 2.4 : 1);
        this._bonesAll.forEach((bn, i) => (H.q[i].q.copy(bn.quaternion), H.q[i].p.copy(bn.position), H.q[i].s.copy(bn.scale)));
      } else this._bonesAll.forEach((bn, i) => (bn.quaternion.copy(H.q[i].q), bn.position.copy(H.q[i].p), bn.scale.copy(H.q[i].s)));
    } else this._hold.q = null;
    this.mesh.updateMatrixWorld(true);
    // ---- 7. hair
    for (const s of this.strands) {
      s.anchor.getWorldPosition(_v);
      if (!s.init) {
        for (let i = 0; i < s.rope.n; i++) {
          s.rope.p[i].copy(_v);
          s.rope.p[i].y -= i * s.rope.seg;
          s.rope.q[i].copy(s.rope.p[i]);
        }
        s.init = true;
      }
      s.rope.pin(_v);
      s.rope.wind.set(Math.sin(T * 0.4 + s.rope.seg) * 1.4, 0, Math.cos(T * 0.31) * 1.4);
      s.rope.step(dt);
      s.tube.set(s.rope.p);
    }
    this.hairGroup.visible = this.root.visible && this.opacity > 0.003;
  }

  /** One CCD pass over the neck: bring the head bone to `goal` (world). */
  _ccd(goal) {
    const head = this.b.head;
    for (let j = this.neck.length - 1; j >= 0; j--) {
      const J = this.neck[j];
      J.updateWorldMatrix(true, true);
      J.getWorldPosition(_a);
      head.getWorldPosition(_b);
      const e = _b.sub(_a), t = _v.copy(goal).sub(_a);
      if (e.lengthSq() < 1e-10 || t.lengthSq() < 1e-10) continue;
      _q.setFromUnitVectors(e.normalize(), t.normalize());
      J.getWorldQuaternion(_q2);
      _q.multiply(_q2);
      J.parent.getWorldQuaternion(_q2).invert();
      const local = _q2.multiply(_q);
      // joint limit: at most ~50° from rest per joint
      const ang = 2 * Math.acos(Math.min(1, Math.abs(local.w)));
      if (ang > 0.9) local.copy(_q3.identity().slerp(local, 0.9 / ang));
      J.quaternion.copy(local);
    }
    this.neck[0].updateWorldMatrix(true, true);
  }

  dispose() {
    for (const s of this.strands) s.tube.geometry.dispose();
    this.hairGroup.removeFromParent();
    this.hairMat.dispose();
    this.eyeMat.dispose();
    this._eyeGeo.dispose();
    this.mat.dispose();
    this.headMat.dispose();
    this.rig.skeleton?.dispose?.();
    this.headRig.skeleton?.dispose?.();
    super.dispose();
  }
}
