// หนูผีหน้าคน (the face rat): a big Thai bandicoot rat (หนูพุก, ~40 cm, a long scaly tail) with an
// original, uncanny middle-aged man's face where its muzzle should be: heavy jowls, deep
// nasolabial folds, sagging under-eye bags, a small human nose, too-human wet brown eyes under
// heavy lids, small yellowed human teeth in a wet, bloody mouth, thin short black hair over a
// receding line, and rat whiskers sprouting from the upper lip. It hides in the passenger footwell
// or behind the passenger headrest, then leaps at the camera screeching; for 0.4 s its face, fur and
// whiskers fill the view; then it scrambles over the dash and out of an open window, or is gone.
//   const r = createFaceRat(); r.hideAt(taxi, 'footwell'); await r.leapAt();
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { audio } from '../audio/index.js';
import { particles, paintedMaterial, lightPool, postfx } from '../render/index.js';
import { engine } from '../core/Engine.js';
import { cameraRig } from '../core/CameraRig.js';
import { settings } from '../core/Settings.js';
import { Sculpt, skinnedMesh } from './sculpt.js';
import { creatureMaterial } from './skin.js';
import { bodyOf } from './taxiGeo.js';
import { Entity, Rope, DynamicTube, animate, sleep, noise, clamp, easeInOut, easeOut, rand, tubeGeometry, TAU, setOpacityDeep } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
const GEO = {};
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------------------------------------------------------------- body (rat)
function bodyGeo() {
  if (GEO.body) return GEO.body;
  const S = new Sculpt({ cell: 0.0055 });
  const bones = [
    { name: 'root', parent: null, pos: [0, 0.07, 0] },
    { name: 'hips', parent: 'root', pos: [0, 0.07, 0.1] },
    { name: 'spine', parent: 'root', pos: [0, 0.075, 0.0] },
    { name: 'chest', parent: 'spine', pos: [0, 0.072, -0.08] },
    { name: 'neck', parent: 'chest', pos: [0, 0.078, -0.13] },
    { name: 'head', parent: 'neck', pos: [0, 0.088, -0.185] },
  ];
  const legs = {
    fl: [[-0.038, 0.06, -0.085], [-0.042, 0.034, -0.078], [-0.04, 0.012, -0.088], [-0.04, 0.0, -0.104]],
    fr: [[0.038, 0.06, -0.085], [0.042, 0.034, -0.078], [0.04, 0.012, -0.088], [0.04, 0.0, -0.104]],
    bl: [[-0.045, 0.062, 0.12], [-0.05, 0.032, 0.092], [-0.048, 0.012, 0.135], [-0.048, 0.0, 0.09]],
    br: [[0.045, 0.062, 0.12], [0.05, 0.032, 0.092], [0.048, 0.012, 0.135], [0.048, 0.0, 0.09]],
  };
  for (const [n, pts] of Object.entries(legs)) pts.forEach((p, i) => bones.push({ name: n + (i + 1), parent: i ? n + i : n[0] === 'f' ? 'chest' : 'hips', pos: p }));
  S.ellipsoid([0, 0.074, 0.025], [0.062, 0.062, 0.125], { bone: 'spine', k: 0.03 });
  S.ellipsoid([0, 0.07, 0.11], [0.06, 0.062, 0.07], { bone: 'hips', k: 0.03 });
  S.ellipsoid([0, 0.068, -0.075], [0.052, 0.054, 0.068], { bone: 'chest', k: 0.03 });
  S.ellipsoid([0, 0.098, 0.04], [0.035, 0.03, 0.1], { bone: 'spine', k: 0.03 }); // hunched back
  S.capsule([0, 0.074, -0.12], [0, 0.084, -0.175], 0.04, 0.034, { bone: 'neck', k: 0.02 });
  for (const [n, pts] of Object.entries(legs)) {
    const front = n[0] === 'f';
    const r = front ? [0.018, 0.009, 0.006, 0.006] : [0.024, 0.01, 0.007, 0.007];
    S.capsule(pts[0], pts[1], r[0], r[1], { bone: n + '1', k: 0.012 });
    S.capsule(pts[1], pts[2], r[1], r[2], { bone: n + '2', k: 0.006, tag: front ? 0 : 0 });
    S.capsule(pts[2], pts[3], r[2], r[3], { bone: n + '3', k: 0.004, tag: 3 });
    // long pink fingers / toes with claws
    for (let k = 0; k < (front ? 4 : 5); k++) {
      const a = (k - (front ? 1.5 : 2)) * 0.38;
      const tip = [pts[3][0] + Math.sin(a) * 0.016, 0.002, pts[3][2] - Math.cos(a) * 0.016];
      S.capsule(pts[3], tip, 0.003, 0.0018, { bone: n + '3', k: 0.002, tag: 3 });
    }
  }
  S.capsule([0, 0.06, 0.16], [0, 0.055, 0.2], 0.014, 0.011, { bone: 'hips', k: 0.01, tag: 3 }); // tail root
  // mangy bare patches (slight dents)
  S.sphere([0.045, 0.09, 0.05], 0.012, { op: 'sub', k: 0.01 });
  S.sphere([-0.05, 0.08, -0.03], 0.009, { op: 'sub', k: 0.008 });
  const res = S.build({
    bones,
    sigma: 0.006,
    color: (x, y, z, nx, ny, nz, tag, ao) => {
      let c = [0.24, 0.2, 0.16];
      const belly = clamp(-ny * 1.3 + 0.1, 0, 1);
      c = lerp3(c, [0.42, 0.38, 0.33], belly);
      const n = noise.noise2D(x * 60, z * 60);
      c = c.map((v) => v * (0.85 + 0.25 * n));
      const mange = Math.max(0, noise.noise2D(x * 25 + 3, z * 25 + y * 20) - 0.55) * 3;
      c = lerp3(c, [0.5, 0.4, 0.38], clamp(mange, 0, 0.8));
      if (tag === 3) c = [0.58, 0.44, 0.4];
      const a = 0.55 + 0.45 * ao;
      return [c[0] * a, c[1] * a, c[2] * a];
    },
  });
  GEO.body = { ...res, legs: Object.keys(legs) };
  return GEO.body;
}

// ---------------------------------------------------------------- head (the face)
function headGeo(gore) {
  const key = 'head' + gore;
  if (GEO[key]) return GEO[key];
  const S = new Sculpt({ cell: 0.0016 });
  const bones = [
    { name: 'skull', parent: null, pos: [0, 0, 0] },
    { name: 'jaw', parent: 'skull', pos: [0, -0.012, -0.012] },
    { name: 'jawEnd', parent: 'jaw', pos: [0, -0.037, -0.05] },
  ];
  // rat cranium + furred back of the head, human face mask in front
  S.ellipsoid([0, 0.004, 0.012], [0.033, 0.032, 0.042], { bone: 'skull', k: 0.01, tag: 1 });
  S.ellipsoid([0, -0.002, -0.026], [0.037, 0.043, 0.024], { bone: 'skull', k: 0.012 });
  S.capsule([-0.024, 0.017, -0.044], [0.024, 0.017, -0.044], 0.0075, 0.0075, { bone: 'skull', k: 0.006 }); // heavy brow
  S.ellipsoid([0, 0.026, -0.036], [0.026, 0.014, 0.014], { bone: 'skull', k: 0.008 }); // forehead
  for (const s of [-1, 1]) {
    S.sphere([s * 0.0145, 0.0085, -0.049], 0.0078, { op: 'sub', k: 0.004 }); // socket
    S.ellipsoid([s * 0.0145, 0.0128, -0.0472], [0.0076, 0.0034, 0.0056], { bone: 'skull', k: 0.002 }); // heavy upper lid
    S.ellipsoid([s * 0.015, 0.0012, -0.0468], [0.0082, 0.0036, 0.0042], { bone: 'skull', k: 0.002 }); // under-eye bag
    S.ellipsoid([s * 0.016, -0.0035, -0.045], [0.009, 0.0032, 0.004], { bone: 'skull', k: 0.002 }); // second bag
    S.ellipsoid([s * 0.0195, -0.009, -0.0445], [0.0118, 0.0118, 0.0098], { bone: 'skull', k: 0.004 }); // cheek
    S.ellipsoid([s * 0.022, -0.03, -0.037], [0.0128, 0.0165, 0.0128], { bone: 'jaw', k: 0.005, wk: 1.6 }); // jowl
    S.ellipsoid([s * 0.018, -0.039, -0.035], [0.009, 0.007, 0.009], { bone: 'jaw', k: 0.005 }); // sagging jowl lower
    S.capsule([s * 0.0085, -0.0105, -0.0585], [s * 0.019, -0.031, -0.0505], 0.0016, 0.0013, { op: 'sub', k: 0.0016 }); // nasolabial fold
    S.capsule([s * 0.013, -0.021, -0.054], [s * 0.017, -0.036, -0.046], 0.0012, 0.0011, { op: 'sub', k: 0.0014 }); // marionette line
    S.capsule([s * 0.009, 0.0125, -0.0525], [s * 0.004, 0.009, -0.054], 0.0009, 0.0009, { op: 'sub', k: 0.001 }); // brow furrow
    S.capsule([s * 0.021, 0.006, -0.046], [s * 0.026, 0.0, -0.043], 0.0008, 0.0008, { op: 'sub', k: 0.001 }); // crow's foot
    // rat ears: rounded, thin, set high on the sides
    S.ellipsoid([s * 0.027, 0.028, 0.004], [0.0035, 0.012, 0.011], { bone: 'skull', k: 0.003, axis: [s * 0.4, 1, 0], hint: [0, 0, 1], tag: 3 });
  }
  for (let i = 0; i < 3; i++) S.capsule([-0.016 + i * 0.016 - 0.004, 0.0225, -0.0495], [-0.016 + i * 0.016 + 0.004, 0.0228, -0.0495], 0.0007, 0.0007, { op: 'sub', k: 0.0008 }); // forehead lines
  // nose: bridge, bulbous tip, alae, nostrils
  S.capsule([0, 0.009, -0.0525], [0, -0.0075, -0.0612], 0.0034, 0.0046, { bone: 'skull', k: 0.003 });
  S.sphere([0, -0.0098, -0.0618], 0.0062, { bone: 'skull', k: 0.0025 });
  for (const s of [-1, 1]) {
    S.sphere([s * 0.0062, -0.0118, -0.0572], 0.0044, { bone: 'skull', k: 0.002 });
    S.sphere([s * 0.0034, -0.0148, -0.0598], 0.0017, { op: 'sub', k: 0.0012 });
  }
  // mouth: philtrum, lips (the lower one heavy), slightly open, chin + double chin
  S.capsule([0, -0.0152, -0.0585], [0, -0.0205, -0.0585], 0.0013, 0.0013, { op: 'sub', k: 0.0012 });
  S.capsule([-0.0115, -0.0222, -0.0545], [0.0115, -0.0222, -0.0545], 0.0034, 0.0034, { bone: 'skull', k: 0.0025, tag: 4 });
  S.capsule([-0.0105, -0.0285, -0.0535], [0.0105, -0.0285, -0.0535], 0.0041, 0.0041, { bone: 'jaw', k: 0.0025, tag: 4 });
  S.ellipsoid([0, -0.0253, -0.0555], [0.0098, 0.0024, 0.007], { op: 'sub', k: 0.0014 });
  S.ellipsoid([0, -0.0255, -0.048], [0.0085, 0.006, 0.008], { op: 'sub', k: 0.002 }); // mouth cavity
  S.sphere([0, -0.0365, -0.0482], 0.0072, { bone: 'jaw', k: 0.004 });
  S.ellipsoid([0, -0.0435, -0.04], [0.013, 0.006, 0.01], { bone: 'jaw', k: 0.004 }); // double chin
  // thin, short black hair over a receding hairline (a raised layer)
  S.custom((x, y, z) => {
    const cap = Math.hypot(x / 0.034, (y - 0.006) / 0.034, (z - 0.004) / 0.045) - 1;
    return cap * 0.034 - 0.0014;
  }, [-0.04, 0.012, -0.05, 0.04, 0.045, 0.06], { bone: 'skull', k: 0.0015, tag: 5 });
  const bloody = gore === 'full' ? 1 : 0.5;
  const res = S.build({
    bones,
    sigma: 0.0025,
    color: (x, y, z, nx, ny, nz, tag, ao) => {
      let c = [0.56, 0.43, 0.38]; // sallow, greyish human skin
      const blot = noise.noise2D(x * 300, y * 300 + z * 200);
      c = c.map((v, i) => v * (0.9 + 0.12 * blot) * (i === 0 ? 1.02 : 1));
      // redness on nose / cheeks, grey stubble on the jaw and upper lip
      const nose = clamp(1 - Math.hypot(x, y + 0.01) / 0.012, 0, 1) * (z < -0.05 ? 1 : 0);
      c = lerp3(c, [0.62, 0.36, 0.33], nose * 0.6);
      const stub = (y < -0.016 && z < -0.03 ? 1 : 0) * (noise.noise2D(x * 900, y * 900) > 0.1 ? 0.55 : 0.2);
      c = lerp3(c, [0.2, 0.19, 0.18], stub * 0.6);
      // dark sockets / bags
      if (Math.abs(Math.abs(x) - 0.015) < 0.009 && y > -0.004 && y < 0.016 && z < -0.04) c = c.map((v) => v * 0.72);
      if (tag === 1) c = [0.25, 0.21, 0.17];
      if (tag === 3) c = [0.5, 0.38, 0.36];
      if (tag === 5) c = [0.05, 0.045, 0.04];
      if (tag === 4) c = lerp3([0.46, 0.27, 0.26], [0.36, 0.04, 0.04], 0.75 * bloody); // wet, bloody lips
      // blood smeared from the mouth over the chin
      if (y < -0.024 && z < -0.04 && Math.abs(x) < 0.012 + (y + 0.024) * -0.3) c = lerp3(c, [0.3, 0.03, 0.03], 0.65 * bloody * clamp(noise.noise2D(x * 400, y * 200) + 0.6, 0, 1));
      const a = 0.5 + 0.5 * ao;
      return [c[0] * a, c[1] * a, c[2] * a];
    },
  });
  // small human teeth, yellowed, a little crooked, bloody at the gums
  const tooth = (x, y, z, w, h, rot) => {
    const g = new THREE.BoxGeometry(w, h, 0.0022, 1, 1, 1);
    g.rotateZ(rot);
    g.translate(x, y, z);
    return g;
  };
  const up = [], lo = [];
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 0.0029;
    const zz = -0.0545 + Math.abs(i - 2.5) * 0.0009;
    up.push(tooth(x, -0.0236 - (i % 3 === 1 ? 0.0004 : 0), zz, 0.0026 - (i === 0 || i === 5 ? 0.0004 : 0), 0.0036, (Math.sin(i * 7.3) * 0.12)));
    lo.push(tooth(x * 0.92, -0.0266, zz + 0.0012, 0.0022, 0.003, Math.sin(i * 3.1) * 0.15));
  }
  const teethUp = mergeGeometries(up), teethLo = mergeGeometries(lo);
  // whiskers from the upper lip (rat) + a few stray long brow hairs
  const wh = [];
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) {
    const base = new THREE.Vector3(s * (0.0075 + (i % 3) * 0.002), -0.0175 - Math.floor(i / 3) * 0.0016, -0.0565 + (i % 3) * 0.0012);
    const ang = -0.35 + (i / 8) * 0.7;
    const dir = new THREE.Vector3(s * Math.cos(ang) * 0.8, Math.sin(ang) * 0.4, -0.55).normalize();
    const L = 0.045 + ((i * 37) % 11) * 0.0028;
    const pts = [base, base.clone().addScaledVector(dir, L * 0.5).add(new THREE.Vector3(0, -L * 0.04, 0)), base.clone().addScaledVector(dir, L).add(new THREE.Vector3(0, -L * 0.14, 0))];
    wh.push(tubeGeometry(pts, (t) => 0.00042 * (1 - t * 0.85), 3));
  }
  const whiskers = mergeGeometries(wh.map((g) => { g.deleteAttribute('uv'); return g; }));
  GEO[key] = { ...res, teethUp, teethLo, whiskers };
  for (const g of [teethUp, teethLo, whiskers]) g.userData.shared = true;
  return GEO[key];
}

function eyeTexture() {
  if (GEO.eyeTex) return GEO.eyeTex;
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  // yellowed, bloodshot sclera
  const sg = g.createRadialGradient(W * 0.25, H * 0.5, 10, W * 0.25, H * 0.5, 200);
  sg.addColorStop(0, '#e8dfcc');
  sg.addColorStop(0.5, '#d8c8a6');
  sg.addColorStop(1, '#9a6a5a');
  g.fillStyle = sg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(150,20,20,0.55)';
  for (let i = 0; i < 40; i++) {
    g.lineWidth = 0.6 + Math.random() * 1.2;
    let x = W * 0.25 + (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 120), y = H * 0.5 + (Math.random() - 0.5) * 120;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (W * 0.25 - x) * 0.18 + (Math.random() - 0.5) * 10;
      y += (H * 0.5 - y) * 0.18 + (Math.random() - 0.5) * 10;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // brown iris with radial streaks + limbal ring, pupil
  const cx = W * 0.25, cy = H * 0.5, R = 34;
  const ig = g.createRadialGradient(cx, cy, 6, cx, cy, R);
  ig.addColorStop(0, '#2a1a0e');
  ig.addColorStop(0.35, '#5a3a1c');
  ig.addColorStop(0.8, '#3a2412');
  ig.addColorStop(1, '#120a06');
  g.fillStyle = ig;
  g.beginPath();
  g.ellipse(cx, cy, R, R, 0, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(160,110,60,0.35)';
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * TAU;
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11);
    g.lineTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4));
    g.stroke();
  }
  g.fillStyle = '#050303';
  g.beginPath();
  g.ellipse(cx, cy, 12, 12, 0, 0, TAU);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  GEO.eyeTex = t;
  return t;
}

function tailTexture() {
  if (GEO.tailTex) return GEO.tailTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#8a706a';
  g.fillRect(0, 0, 64, 512);
  for (let y = 0; y < 512; y += 6) {
    g.fillStyle = `rgba(40,28,24,${0.45 + Math.random() * 0.2})`;
    g.fillRect(0, y, 64, 1.4);
    for (let x = 0; x < 64; x += 5) {
      g.fillStyle = `rgba(${150 + Math.random() * 40},${120 + Math.random() * 30},${112 + Math.random() * 30},0.5)`;
      g.fillRect(x + ((y / 6) % 2) * 2.5, y + 1.5, 3.5, 3.5);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  GEO.tailTex = t;
  return t;
}

// ---------------------------------------------------------------- entity
export class FaceRat extends Entity {
  constructor(opts = {}) {
    super('faceRat');
    const gore = settings.get('gore') === 'reduced' ? 'reduced' : 'full';
    const B = bodyGeo();
    this.bodyMat = creatureMaterial({ detail: 'fur', detailScale: 42, detailAmount: 0.9, bump: 1.3, roughness: 0.9, brush: 0.45, wet: 0.45, sss: 0.3, puddles: 0 });
    const { mesh, rig } = skinnedMesh(B.geometry, this.bodyMat, B.boneDefs);
    mesh.castShadow = true;
    this.mesh = mesh;
    this.b = rig.byName;
    this.rig = rig;
    this.root.add(mesh);
    // head with its own small rig (jaw), parented to the body's head bone
    const Hd = headGeo(gore);
    this.headMat = creatureMaterial({ detail: 'ghostSkin', detailScale: 150, detailAmount: 0.6, bump: 0.55, roughness: 0.48, skin: true, sss: 0.75, wet: 0.65, brush: 0.25, puddles: 0 });
    const h = skinnedMesh(Hd.geometry, this.headMat, Hd.boneDefs);
    this.head = h.mesh;
    this.hb = h.rig.byName;
    this.headRig = h.rig;
    this.b.head.add(this.head);
    this.head.castShadow = true;
    const toothMat = paintedMaterial({ color: 0xb8a882, roughness: 0.35, wet: 0.8, brush: 0.2, puddles: 0 });
    const tu = new THREE.Mesh(Hd.teethUp, toothMat), tl = new THREE.Mesh(Hd.teethLo, toothMat);
    this.hb.skull.add(tu);
    // lower teeth ride the jaw: express them relative to the jaw bone
    tl.position.set(0, 0.012, 0.012);
    this.hb.jaw.add(tl);
    const whMat = paintedMaterial({ color: 0x15110e, roughness: 0.35, brush: 0, puddles: 0 });
    this.whiskers = new THREE.Mesh(Hd.whiskers, whMat);
    this.hb.skull.add(this.whiskers);
    // too-human wet eyes
    const eyeMat = paintedMaterial({ map: eyeTexture(), roughness: 0.06, wet: 1, brush: 0, puddles: 0, envReflect: 1.5 });
    const eg = new THREE.SphereGeometry(0.0058, 24, 16);
    this.eyes = [-1, 1].map((s) => {
      const e = new THREE.Mesh(eg, eyeMat);
      e.position.set(s * 0.0145, 0.0085, -0.0462);
      this.hb.skull.add(e);
      return e;
    });
    this._mats = [this.bodyMat, this.headMat, toothMat, whMat, eyeMat];
    // tail: verlet rope + scaly tube
    this.tailMat = paintedMaterial({ map: tailTexture(), color: 0xffffff, roughness: 0.5, wet: 0.6, brush: 0.2, puddles: 0 });
    this._mats.push(this.tailMat);
    this.tailBase = new THREE.Object3D();
    this.tailBase.position.set(0, -0.012, 0.11);
    this.b.hips.add(this.tailBase);
    this.tailRope = new Rope(16, 0.021, new THREE.Vector3());
    this.tailRope.gravity = -2;
    this.tailRope.damping = 0.9;
    this.tail = new DynamicTube(16, 6, (t) => 0.0085 * (1 - t * 0.82), this.tailMat);
    engine.scene.add(this.tail.mesh);
    this._tailInit = false;
    // state
    this.pose = 'crouch';
    this.scurry = 0;
    this.jaw = 0;
    this.jawT = 0.1;
    this.taxi = null;
    this.blood = null;
    this.light = null;
    this.root.visible = false;
    this.tail.mesh.visible = false;
  }

  /** Hide in the taxi: spot 'footwell' (passenger footwell) or 'headrest' (behind the passenger headrest). */
  hideAt(taxi, spot = 'footwell') {
    this.taxi = taxi;
    const body = bodyOf(taxi);
    body.add(this.root);
    const seat = taxi.anchors?.frontPassengerSeat?.position || new THREE.Vector3(-0.37, 0.5, 0.14);
    if (spot === 'headrest') {
      this.root.position.set(seat.x + 0.04, seat.y + 0.68, seat.z + 0.3);
      this.root.rotation.set(0.25, -0.7, 0); // peeking toward the driver, over the seat back
    } else {
      this.root.position.set(seat.x + 0.02, Math.max(0.08, seat.y - 0.36), seat.z - 0.5);
      this.root.rotation.set(0, -1.15, 0); // facing the driver's side
    }
    this.spot = spot;
    this.pose = 'crouch';
    this.root.visible = true;
    this.tail.mesh.visible = true;
    this._tailInit = false;
    setOpacityDeep(this.root, 1);
    return this;
  }

  step(dt) {
    const t = this.time;
    const b = this.b;
    // body pose by state
    const crouch = this.pose === 'crouch' ? 1 : 0;
    const air = this.pose === 'air' ? 1 : 0;
    const run = this.pose === 'run' ? 1 : 0;
    this.scurry += dt * (run ? 22 : 0);
    const sniff = Math.sin(t * 18) * 0.04 * crouch + noise.noise2D(t * 2, 1) * 0.08 * crouch;
    b.root.position.copy(b.root.userData.rest).add(_v.set(0, -0.018 * crouch + Math.abs(Math.sin(this.scurry)) * 0.012 * run, 0));
    b.neck.quaternion.setFromEuler(_e.set(sniff + 0.15 * air, noise.noise2D(t * 1.3, 4) * 0.25 * crouch, 0));
    b.head.quaternion.setFromEuler(_e.set(-0.2 * air + sniff * 0.5, 0, noise.noise2D(t * 0.9, 7) * 0.1));
    b.chest.quaternion.setFromEuler(_e.set(-0.25 * air + Math.sin(this.scurry) * 0.12 * run, 0, 0));
    b.hips.quaternion.setFromEuler(_e.set(0.2 * air - Math.sin(this.scurry) * 0.12 * run, 0, 0));
    // legs: tucked (crouch), splayed claws forward (air), scurrying (run)
    for (const n of ['fl', 'fr', 'bl', 'br']) {
      const front = n[0] === 'f', sg = n[1] === 'l' ? -1 : 1;
      const ph = this.scurry + (n === 'fl' || n === 'br' ? 0 : Math.PI);
      const sw = Math.sin(ph) * 0.7 * run;
      const reach = air * (front ? 1.1 : -0.9);
      b[n + '1'].quaternion.setFromEuler(_e.set(sw + reach + 0.35 * crouch * (front ? 1 : -1), 0, sg * 0.25 * air));
      b[n + '2'].quaternion.setFromEuler(_e.set((front ? -0.4 : 0.5) * crouch - Math.max(0, Math.cos(ph)) * 0.6 * run + 0.3 * air * (front ? -1 : 1), 0, 0));
      b[n + '3'].quaternion.setFromEuler(_e.set(0.3 * air, 0, 0));
    }
    // jaw (screech), whisker twitch, eyes on the camera
    this.jaw += (this.jawT - this.jaw) * (1 - Math.exp(-25 * dt));
    this.hb.jaw.quaternion.setFromEuler(_e.set(this.jaw * 0.55 + noise.noise2D(t * 30, 2) * 0.03 * this.jaw, 0, 0));
    this.whiskers.rotation.set(Math.sin(t * 24) * 0.04 * crouch, 0, 0);
    engine.camera.getWorldPosition(_v2);
    for (const e of this.eyes) e.lookAt(_v2);
    // tail
    this.root.updateMatrixWorld(true);
    this.tailBase.getWorldPosition(_v);
    if (!this._tailInit) {
      const back = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(_q));
      for (let i = 0; i < this.tailRope.n; i++) { this.tailRope.p[i].copy(_v).addScaledVector(back, i * 0.021); this.tailRope.q[i].copy(this.tailRope.p[i]); }
      this._tailInit = true;
    }
    this.tailRope.pin(_v);
    const lash = noise.noise2D(t * 3, 9) * (crouch ? 0.6 : 3);
    this.tailRope.wind.set(lash, 0, lash * 0.5);
    this.tailRope.step(dt);
    this.tail.set(this.tailRope.p);
  }

  /**
   * The jumpscare: wind up, leap at the camera screeching, hold 0.4 s filling the view, then scramble
   * over the dash and out of an open window (or vanish). opts { hold=0.4, exit:'auto'|'window'|'vanish' }
   */
  async leapAt(opts = {}) {
    const taxi = this.taxi;
    const body = taxi ? bodyOf(taxi) : this.root.parent;
    if (!body) return;
    this.pose = 'crouch';
    this.jawT = 0.25;
    audio.play('scratch_glass', { object: this.root, volume: 0.35, rate: 1.8 });
    await sleep(0.28);
    // launch
    const start = this.root.position.clone();
    const startQ = this.root.quaternion.clone();
    this.pose = 'air';
    this.jawT = 1;
    audio.play('scream_close', { object: this.root, volume: 1, rate: 1.75, mustPlay: true });
    audio.play('sting_high', { volume: 0.9, mustPlay: true });
    audio.play('scare_hit', { volume: 0.8 });
    // a little light on its face (the dash glow catching it)
    try {
      const a = new THREE.Object3D();
      a.position.set(0, 0.04, -0.12);
      this.b.head.add(a);
      this.light = lightPool.add({ object: a, color: 0xffd8b0, intensity: 0.9, distance: 0.9, decay: 2, flicker: 'none', glow: false, priority: 9 });
      this._lightAnchor = a;
    } catch (e) { /* optional */ }
    const eye = () => body.worldToLocal(engine.camera.getWorldPosition(new THREE.Vector3()));
    const look = () => {
      const fwd = new THREE.Vector3();
      engine.camera.getWorldDirection(fwd);
      return fwd;
    };
    // fly: arc to a point just in front of the eye, face first
    await animate(0.24, (k) => {
      body.updateWorldMatrix(true, false);
      const e = eye();
      const f = look().add(engine.camera.getWorldPosition(new THREE.Vector3()));
      const fl = body.worldToLocal(f);
      const target = e.clone().lerp(fl, 0.34).add(new THREE.Vector3(0, -0.095, 0));
      this.root.position.lerpVectors(start, target, k);
      this.root.position.y += Math.sin(k * Math.PI) * 0.12;
      this._faceToward(e, k * k);
    }, easeOut);
    // impact: jolt
    cameraRig.shake(0.85);
    this._jolt();
    postfx.flash?.(0x2a0606, 0.08);
    if (settings.get('gore') !== 'off') {
      try {
        const sp = particles.emit('blood', { object: this.b.head, offset: new THREE.Vector3(0, -0.03, -0.08), burst: true, autoDispose: true, radius: 0.02, direction: look().negate() });
        sp.burst?.();
        postfx.bloodSplash?.(0.22);
      } catch (e) { /* optional */ }
    }
    // hold filling the view, clawing, mouth working
    const hold = opts.hold ?? 0.4;
    await animate(hold, (k) => {
      body.updateWorldMatrix(true, false);
      const e = eye();
      const f = body.worldToLocal(look().add(engine.camera.getWorldPosition(new THREE.Vector3())));
      const target = e.clone().lerp(f, 0.34).add(new THREE.Vector3(0, -0.095, 0));
      this.root.position.lerp(target, 0.5);
      this._faceToward(e, 1);
      this.jawT = 0.75 + Math.sin(k * 40) * 0.25;
    });
    this.jawT = 0.4;
    // exit: over the dash and out of an open window, else gone
    const win = taxi ? ['fl', 'fr'].find((w) => (taxi.state?.windows?.[w] ?? 0) > 0.12) : null;
    const exit = opts.exit === 'vanish' ? null : opts.exit === 'window' ? win || 'fl' : win;
    this.pose = 'run';
    audio.play('scratch_glass', { object: this.root, volume: 0.5, rate: 2.2 });
    if (exit) {
      const side = exit === 'fl' ? -1 : 1;
      const dash = new THREE.Vector3(side * 0.25, 1.0, -0.62), gap = new THREE.Vector3(side * 0.86, 1.18, -0.2), out = new THREE.Vector3(side * 1.6, 0.6, 0.2);
      const p0 = this.root.position.clone();
      await animate(0.32, (k) => {
        this.root.position.lerpVectors(p0, dash, k);
        this._faceToward(gap, 0.4);
      });
      audio.play('scratch_glass', { object: this.root, volume: 0.4, rate: 2.6 });
      await animate(0.28, (k) => {
        this.root.position.lerpVectors(dash, gap, k);
        this.root.position.y += Math.sin(k * Math.PI) * 0.08;
        this._faceToward(out, 0.5);
      });
      await animate(0.3, (k) => {
        this.root.position.lerpVectors(gap, out, k);
        setOpacityDeep(this.root, 1 - k * 0.6);
      });
    } else {
      const p0 = this.root.position.clone();
      const down = start.clone().add(new THREE.Vector3(0, -0.1, 0.1));
      await animate(0.35, (k) => {
        this.root.position.lerpVectors(p0, down, k);
        setOpacityDeep(this.root, 1 - k);
        this.root.quaternion.slerp(startQ, k);
      });
    }
    this.root.visible = false;
    this.tail.mesh.visible = false;
    this.light?.remove();
    this.light = null;
    this._lightAnchor?.removeFromParent();
    this.pose = 'crouch';
    return true;
  }

  _faceToward(targetLocal, w) {
    // root -Z toward the target (body-parent space)
    const d = _v.copy(targetLocal).sub(this.root.position);
    if (d.lengthSq() < 1e-6) return;
    d.normalize();
    const z = d.clone().negate();
    const y = new THREE.Vector3(0, 1, 0).addScaledVector(z, -z.y).normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    _m.makeBasis(x, y, z);
    _q.setFromRotationMatrix(_m);
    this.root.quaternion.slerp(_q, clamp(w, 0, 1));
  }

  /** Short hand-held camera jolt: recoil through cameraRig.extraOffset, back in 0.35 s. */
  _jolt() {
    const off = cameraRig.extraOffset;
    if (!off) return;
    const base = off.clone();
    animate(0.38, (k) => {
      const a = Math.sin(k * Math.PI) * (1 - k);
      off.copy(base).add(_v2.set(rand(-0.01, 0.01) * a, -0.02 * a, 0.06 * a));
    }).then(() => off.copy(base));
  }

  vanish() {
    this.root.visible = false;
    this.tail.mesh.visible = false;
  }

  dispose() {
    this.light?.remove();
    this.tail.mesh.removeFromParent();
    this.tail.geometry.dispose();
    this.rig.skeleton.dispose();
    this.headRig.skeleton.dispose();
    for (const m of this._mats) m.dispose();
    this.eyes[0].geometry.dispose();
    super.dispose();
  }
}

export function createFaceRat(opts = {}) {
  return new FaceRat(opts);
}
export { easeInOut };
