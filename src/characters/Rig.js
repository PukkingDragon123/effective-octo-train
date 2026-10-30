// Skeleton layout from body proportions + a fast array-based FK pose solver.
//
// Bone frames (rest): every bone has an anatomical local frame:
//   Y = along the bone (toward its child), Z = "back" (spine/limbs) or dorsal (hands/feet), X = Y x Z.
// Pose angles are authored per bone as [x, y, z] radians (order 'XZY': flex, then side, then twist).
// Limb conventions (authored for the RIGHT side; LEFT is mirrored automatically: y,z negated):
//   shoulder/hip: -x = swing forward, +z = abduct (raise outward), y = twist
//   elbow: -x = flex;  knee: +x = flex;  wrist: -x = flex palmward; fingers: -x = curl
//   spine/neck/head (centre bones, not mirrored): -x = bend forward, +y = turn left, +z = lean left
import * as THREE from 'three';
import { clamp, lerp } from '../core/math.js';
import { basisFromYZ } from './SDF.js';

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

/** Bone list in topological order: [name, parent] */
export const BONE_DEFS = (() => {
  const d = [
    ['hips', null], ['spine', 'hips'], ['chest', 'spine'], ['neck', 'chest'], ['head', 'neck'],
    ['jaw', 'head'], ['eyeL', 'head'], ['eyeR', 'head'],
  ];
  for (const s of ['L', 'R']) {
    d.push(['clavicle' + s, 'chest'], ['upperArm' + s, 'clavicle' + s], ['forearm' + s, 'upperArm' + s], ['hand' + s, 'forearm' + s]);
    for (const f of FINGERS) d.push([f + '1' + s, 'hand' + s], [f + '2' + s, f + '1' + s]);
  }
  for (const s of ['L', 'R']) d.push(['thigh' + s, 'hips'], ['shin' + s, 'thigh' + s], ['foot' + s, 'shin' + s], ['toe' + s, 'foot' + s]);
  return d;
})();
export const BONE_INDEX = Object.fromEntries(BONE_DEFS.map((b, i) => [b[0], i]));
export const BONE_COUNT = BONE_DEFS.length;
export const PARENT = Int16Array.from(BONE_DEFS.map((b) => (b[1] ? BONE_INDEX[b[1]] : -1)));
/** bones whose authored y/z angles are mirrored (left side) */
export const IS_LEFT = Uint8Array.from(BONE_DEFS.map((b) => (/L$/.test(b[0]) && b[0] !== 'eyeL' ? 1 : 0)));

/**
 * Body proportions from an appearance spec.
 * Returns a plain object with landmark heights, widths, limb lengths and radii (metres).
 */
export function computeProportions(spec = {}) {
  const sex = spec.sex === 'f' ? 'f' : 'm';
  const fem = sex === 'f' ? 1 : 0;
  const age = clamp(spec.age ?? 30, 4, 95);
  const H = spec.height ?? (age < 16 ? 0.75 + age * 0.055 : fem ? 1.57 : 1.68);
  const build = spec.build || 'average';
  const fat = build === 'thin' ? 0.82 : build === 'heavy' ? 1.3 : 1.0;
  const child = clamp((16 - age) / 10, 0, 1); // 1 = small child
  const old = clamp((age - 55) / 30, 0, 1); // 1 = very old
  const adult = 1 - child;
  const muscle = (fem ? 0.75 : 1.0) * (0.8 + 0.2 * adult) * (1 - 0.3 * old) * (build === 'thin' ? 0.92 : 1);

  // head height (chin->crown)
  let HH = lerp(fem ? 0.222 : 0.232, 0.2, child) * Math.pow(H / (fem ? 1.57 : 1.69), child > 0 ? 0.15 : 0.35);
  const neckLen = lerp(fem ? 0.095 : 0.088, 0.07, child);
  const chinY = H - HH;
  const P = { sex, fem, age, H, HH, fat, child, old, adult, muscle, build };
  P.crownY = H;
  P.chinY = chinY;
  P.headY = chinY + HH * 0.24; // head pivot (atlas)
  P.headZ = 0.012;
  P.neckY = chinY - neckLen * 0.62; // neck base
  P.neckZ = 0.022;
  // shoulders / clavicle
  const shW = H * lerp(fem ? 0.212 : 0.232, 0.205, child) * (0.96 + 0.04 * fat);
  P.shoulderHalf = shW / 2;
  P.shoulderY = chinY - neckLen * 0.95;
  P.shoulderX = shW / 2 - 0.035 * (H / 1.7);
  P.shoulderZ = 0.012;
  P.clavY = P.shoulderY + 0.012;
  P.clavX = 0.022;
  P.clavZ = -0.012;
  // torso
  P.chestY = lerp(P.shoulderY - 0.17 * H / 1.7, P.shoulderY - 0.13, child);
  P.spineY = H * lerp(fem ? 0.6 : 0.6, 0.6, child);
  P.hipsY = H * lerp(fem ? 0.54 : 0.535, 0.535, child);
  P.hipJointY = H * lerp(fem ? 0.505 : 0.505, 0.5, child);
  P.hipJointX = H * lerp(fem ? 0.057 : 0.05, 0.05, child) * (0.95 + 0.05 * fat);
  P.crotchY = P.hipJointY - 0.055 * H / 1.7;
  // legs
  P.kneeY = H * lerp(0.285, 0.28, child);
  P.ankleY = H * 0.045;
  P.legSpread = 0.022 * H / 1.7; // extra x at the ankle (bind stance)
  P.footLen = H * 0.152;
  // arms (A-pose)
  P.upperArmLen = H * lerp(0.188, 0.18, child);
  P.forearmLen = H * lerp(0.145, 0.14, child);
  P.handLen = H * lerp(0.108, 0.11, child);
  P.armAngle = 0.82; // radians below horizontal in bind pose
  // radii
  const r = (base) => base * (H / 1.7);
  P.neckR = r(lerp(fem ? 0.047 : 0.056, 0.042, child)) * (0.92 + 0.08 * fat) * (1 - 0.06 * old);
  P.upperArmR = r(fem ? 0.042 : 0.046) * (0.85 + 0.15 * muscle) * Math.pow(fat, 0.6) * (1 - 0.12 * child);
  P.forearmR = r(fem ? 0.034 : 0.039) * (0.88 + 0.12 * muscle) * Math.pow(fat, 0.35) * (1 - 0.08 * child);
  P.wristR = r(fem ? 0.024 : 0.027) * (1 - 0.05 * child);
  P.thighR = r(fem ? 0.088 : 0.084) * Math.pow(fat, 0.65) * (1 - 0.1 * old) * (1 - 0.12 * child);
  P.kneeR = r(fem ? 0.05 : 0.052) * Math.pow(fat, 0.3);
  P.calfR = r(fem ? 0.052 : 0.055) * Math.pow(fat, 0.45) * (0.9 + 0.1 * muscle) * (1 - 0.12 * old);
  P.ankleR = r(fem ? 0.03 : 0.033);
  // torso shape
  P.chestHalfW = r(fem ? 0.13 : 0.148) * (0.9 + 0.1 * muscle) * Math.pow(fat, 0.3) * (1 - 0.06 * child);
  P.chestDepth = r(fem ? 0.095 : 0.105) * Math.pow(fat, 0.45);
  P.waistHalfW = r(fem ? 0.112 : 0.128) * Math.pow(fat, 0.75);
  P.waistDepth = r(fem ? 0.085 : 0.095) * Math.pow(fat, 0.8);
  P.pelvisHalfW = r(fem ? 0.172 : 0.158) * Math.pow(fat, 0.45) * (1 - 0.08 * child);
  P.pelvisDepth = r(fem ? 0.105 : 0.1) * Math.pow(fat, 0.5);
  P.belly = build === 'heavy' ? (fem ? 0.75 : 1.0) : build === 'thin' ? 0 : 0.25 + 0.35 * old * (1 - fem * 0.4) + (age > 40 ? 0.2 : 0);
  P.breast = fem ? clamp((age - 11) / 6, 0, 1) * (build === 'heavy' ? 1.25 : build === 'thin' ? 0.8 : 1) : 0;
  P.sag = old;
  return P;
}

/**
 * Rest layout: rig-space position + basis for every bone. Character faces -Z, right = +X.
 */
export function computeLayout(P) {
  const L = {};
  const set = (name, pos, basis) => (L[name] = { pos, basis });
  const up = basisFromYZ(0, 1, 0, 0, 0, 1);
  set('hips', [0, P.hipsY, 0.005], up);
  set('spine', [0, P.spineY, 0.012], up);
  set('chest', [0, P.chestY, 0.01], up);
  set('neck', [0, P.neckY, P.neckZ], basisFromYZ(0, 1, -0.18, 0, 0, 1));
  set('head', [0, P.headY, P.headZ], up);
  // head-local features (filled by Head.js layout but we need defaults)
  const hs = P.HH / 0.232;
  set('jaw', [0, P.headY + 0.004 * hs, P.headZ - 0.012 * hs], up);
  const eyeY = P.headY + 0.062 * hs;
  const eyeZ = P.headZ - 0.07 * hs;
  set('eyeL', [-0.031 * hs, eyeY, eyeZ], up);
  set('eyeR', [0.031 * hs, eyeY, eyeZ], up);
  P.eyeY = eyeY;
  P.eyeZ = eyeZ;
  P.headScale = hs;

  for (const s of ['L', 'R']) {
    const sg = s === 'R' ? 1 : -1;
    const cl = [sg * P.clavX, P.clavY, P.clavZ];
    const sh = [sg * P.shoulderX, P.shoulderY, P.shoulderZ];
    set('clavicle' + s, cl, basisFromYZ(sh[0] - cl[0], sh[1] - cl[1], sh[2] - cl[2], 0, 0, 1));
    const a = P.armAngle;
    let dx = Math.cos(a) * sg, dy = -Math.sin(a), dz = -0.06;
    const dl = Math.hypot(dx, dy, dz);
    dx /= dl; dy /= dl; dz /= dl;
    const el = [sh[0] + dx * P.upperArmLen, sh[1] + dy * P.upperArmLen, sh[2] + dz * P.upperArmLen];
    const wr = [el[0] + dx * P.forearmLen, el[1] + dy * P.forearmLen, el[2] + dz * P.forearmLen];
    set('upperArm' + s, sh, basisFromYZ(dx, dy, dz, 0, 0, 1));
    set('forearm' + s, el, basisFromYZ(dx, dy, dz, 0, 0, 1));
    // hand: Y continues the forearm, Z (dorsal) = up/out in the frontal plane, slightly forward-rolled
    // dorsal perpendicular to arm dir in the frontal plane, pointing up/outward,
    // rolled slightly forward so the palms face the thighs and a little backward
    let ox = -dy * sg, oy = dx * sg, oz = 0;
    const roll = -0.15;
    const cz = Math.cos(roll), sz = Math.sin(roll);
    ox = ox * cz; oy = oy * cz; oz = sz;
    set('hand' + s, wr, basisFromYZ(dx, dy, dz, ox, oy, oz));
    L['hand' + s].dir = [dx, dy, dz];
    L['hand' + s].dorsal = [ox, oy, oz];
    // fingers from the hand layout (hand-local -> rig)
    const HB = L['hand' + s].basis;
    const HX = [HB[0], HB[1], HB[2]], HY = [HB[3], HB[4], HB[5]], HZ = [HB[6], HB[7], HB[8]];
    const toRig = (p) => [wr[0] + HX[0] * p[0] + HY[0] * p[1] + HZ[0] * p[2], wr[1] + HX[1] * p[0] + HY[1] * p[1] + HZ[1] * p[2], wr[2] + HX[2] * p[0] + HY[2] * p[1] + HZ[2] * p[2]];
    const toRigDir = (d) => [HX[0] * d[0] + HY[0] * d[1] + HZ[0] * d[2], HX[1] * d[0] + HY[1] * d[1] + HZ[1] * d[2], HX[2] * d[0] + HY[2] * d[1] + HZ[2] * d[2]];
    const HL = handLayout(P, sg);
    for (const f of FINGERS) {
      const d = HL[f];
      const d1 = toRigDir(d.d1), d2 = toRigDir(d.d2);
      set(f + '1' + s, toRig(d.k1), basisFromYZ(d1[0], d1[1], d1[2], HZ[0], HZ[1], HZ[2]));
      set(f + '2' + s, toRig(d.k2), basisFromYZ(d2[0], d2[1], d2[2], HZ[0], HZ[1], HZ[2]));
    }
    // legs
    const hp = [sg * P.hipJointX, P.hipJointY, 0.0];
    const an = [sg * (P.hipJointX + P.legSpread), P.ankleY, 0.03];
    const kn = [lerp(hp[0], an[0], 0.5), P.kneeY, -0.008];
    set('thigh' + s, hp, basisFromYZ(kn[0] - hp[0], kn[1] - hp[1], kn[2] - hp[2], 0, 0, 1));
    set('shin' + s, kn, basisFromYZ(an[0] - kn[0], an[1] - kn[1], an[2] - kn[2], 0, 0, 1));
    const ball = [an[0] + sg * 0.012, 0.022 * P.H / 1.7, an[2] - P.footLen * 0.66];
    set('foot' + s, an, basisFromYZ(ball[0] - an[0], ball[1] - an[1], ball[2] - an[2], 0, 1, 0));
    set('toe' + s, ball, basisFromYZ(0, 0, -1, 0, 1, 0));
  }
  return L;
}

/** Hand layout in hand-local space (Y fingers, Z dorsal). side +1 right, -1 left (thumb toward -X*side). */
export function handLayout(P, side) {
  const s = P.handLen / 0.19;
  const sx = -side; // thumb side sign
  const F = {};
  // knuckle (MCP) positions and finger directions
  const defs = {
    index: { x: 0.027, y: 0.094, len: [0.046, 0.047], r: 0.0092, spread: -0.08 },
    middle: { x: 0.007, y: 0.099, len: [0.05, 0.051], r: 0.0095, spread: -0.01 },
    ring: { x: -0.013, y: 0.094, len: [0.047, 0.047], r: 0.0089, spread: 0.06 },
    pinky: { x: -0.031, y: 0.083, len: [0.036, 0.037], r: 0.0079, spread: 0.14 },
  };
  for (const [name, d] of Object.entries(defs)) {
    const dx = Math.sin(d.spread) * -sx, dy = Math.cos(d.spread);
    const bend = 0.12; // natural flex in bind pose
    // proximal direction (slightly curled toward palm: -Z)
    const p1 = [dx * Math.cos(bend), dy * Math.cos(bend), -Math.sin(bend)];
    const b2 = bend * 2.4;
    const p2 = [dx * Math.cos(b2), dy * Math.cos(b2), -Math.sin(b2)];
    const k1 = [sx * d.x * s, d.y * s, 0.002 * s];
    const k2 = [k1[0] + p1[0] * d.len[0] * s, k1[1] + p1[1] * d.len[0] * s, k1[2] + p1[2] * d.len[0] * s];
    const tip = [k2[0] + p2[0] * d.len[1] * s, k2[1] + p2[1] * d.len[1] * s, k2[2] + p2[2] * d.len[1] * s];
    F[name] = { k1, k2, tip, d1: p1, d2: p2, r: d.r * s };
  }
  // thumb: CMC near the wrist on the palm side, metacarpal angled out and forward (palmar)
  const t1 = [sx * 0.021 * s, 0.024 * s, -0.012 * s];
  let md = [sx * 0.62, 0.66, -0.42];
  let ml = Math.hypot(...md);
  md = md.map((v) => v / ml);
  const t2 = [t1[0] + md[0] * 0.046 * s, t1[1] + md[1] * 0.046 * s, t1[2] + md[2] * 0.046 * s];
  let pd = [sx * 0.32, 0.8, -0.5];
  ml = Math.hypot(...pd);
  pd = pd.map((v) => v / ml);
  const ttip = [t2[0] + pd[0] * 0.058 * s, t2[1] + pd[1] * 0.058 * s, t2[2] + pd[2] * 0.058 * s];
  F.thumb = { k1: t1, k2: t2, tip: ttip, d1: md, d2: pd, r: 0.0105 * s };
  F.scale = s;
  F.sx = sx;
  return F;
}

/** Convert a 9-number basis to a quaternion. */
export function basisToQuat(B, q = new THREE.Quaternion()) {
  const m = new THREE.Matrix4().set(B[0], B[3], B[6], 0, B[1], B[4], B[7], 0, B[2], B[5], B[8], 0, 0, 0, 0, 1);
  return q.setFromRotationMatrix(m);
}

/**
 * Rig: owns THREE.Bones + rest data + pose arrays.
 *  - restQ[i] (rig-space rest orientation), restP[i] (rig-space rest position)
 *  - restLocalQ/restLocalP relative to parent
 * Pose evaluation: localQ = restLocalQ * delta(euler), then FK into rig-space arrays rq/rp.
 */
export class Rig {
  constructor(layout) {
    this.layout = layout;
    this.bones = [];
    this.byName = {};
    this.restQ = [];
    this.restP = [];
    this.restLocalQ = [];
    this.restLocalP = [];
    for (let i = 0; i < BONE_COUNT; i++) {
      const [name] = BONE_DEFS[i];
      const L = layout[name];
      const b = new THREE.Bone();
      b.name = name;
      this.bones.push(b);
      this.byName[name] = b;
      this.restQ.push(basisToQuat(L.basis));
      this.restP.push(new THREE.Vector3(...L.pos));
    }
    for (let i = 0; i < BONE_COUNT; i++) {
      const p = PARENT[i];
      const lq = new THREE.Quaternion();
      const lp = new THREE.Vector3();
      if (p < 0) {
        lq.copy(this.restQ[i]);
        lp.copy(this.restP[i]);
      } else {
        const inv = this.restQ[p].clone().invert();
        lq.copy(inv).multiply(this.restQ[i]);
        lp.copy(this.restP[i]).sub(this.restP[p]).applyQuaternion(inv);
        this.bones[p].add(this.bones[i]);
      }
      this.restLocalQ.push(lq);
      this.restLocalP.push(lp);
      this.bones[i].quaternion.copy(lq);
      this.bones[i].position.copy(lp);
    }
    this.root = this.bones[0];
    // pose state (rig space)
    this.rq = this.restQ.map((q) => q.clone());
    this.rp = this.restP.map((p) => p.clone());
    this.lq = this.restLocalQ.map((q) => q.clone()); // current local
    this.stretch = new Float32Array(BONE_COUNT).fill(1); // length multiplier of the bone's offset from parent
    this.root.updateMatrixWorld(true);
  }

  makeSkeleton() {
    // inverse bind matrices from rest rig-space transforms
    const inverses = [];
    for (let i = 0; i < BONE_COUNT; i++) {
      const m = new THREE.Matrix4().compose(this.restP[i], this.restQ[i], new THREE.Vector3(1, 1, 1));
      inverses.push(m.invert());
    }
    return new THREE.Skeleton(this.bones, inverses);
  }

  /** FK from current local quats (this.lq) + hips position offset -> rig-space rq/rp. */
  fk(hipsPos) {
    for (let i = 0; i < BONE_COUNT; i++) {
      const p = PARENT[i];
      if (p < 0) {
        this.rq[i].copy(this.lq[i]);
        this.rp[i].copy(hipsPos);
      } else {
        this.rq[i].copy(this.rq[p]).multiply(this.lq[i]);
        const s = this.stretch[i];
        this.rp[i].copy(this.restLocalP[i]);
        if (s !== 1) this.rp[i].multiplyScalar(s);
        this.rp[i].applyQuaternion(this.rq[p]).add(this.rp[p]);
      }
    }
  }

  /** Recompute FK for the subtree starting at bone i (after IK changed lq[i]). */
  fkFrom(i) {
    const p = PARENT[i];
    if (p >= 0) {
      this.rq[i].copy(this.rq[p]).multiply(this.lq[i]);
      const s = this.stretch[i];
      this.rp[i].copy(this.restLocalP[i]);
      if (s !== 1) this.rp[i].multiplyScalar(s);
      this.rp[i].applyQuaternion(this.rq[p]).add(this.rp[p]);
    }
    for (let c = i + 1; c < BONE_COUNT; c++) {
      // children appear after parents; check ancestry quickly by walking up
      let a = PARENT[c];
      while (a > i) a = PARENT[a];
      if (a !== i) continue;
      const pp = PARENT[c];
      this.rq[c].copy(this.rq[pp]).multiply(this.lq[c]);
      const s = this.stretch[c];
      this.rp[c].copy(this.restLocalP[c]);
      if (s !== 1) this.rp[c].multiplyScalar(s);
      this.rp[c].applyQuaternion(this.rq[pp]).add(this.rp[pp]);
    }
  }

  /** Set bone i's rig-space orientation (updates its local quat; caller re-runs FK for children). */
  setRigQuat(i, q) {
    const p = PARENT[i];
    if (p < 0) this.lq[i].copy(q);
    else this.lq[i].copy(_qi.copy(this.rq[p]).invert()).multiply(q);
    this.rq[i].copy(q);
  }

  /** Write the pose to the THREE bones. */
  apply(hipsPos) {
    for (let i = 0; i < BONE_COUNT; i++) {
      const b = this.bones[i];
      b.quaternion.copy(this.lq[i]);
      if (i === 0) b.position.copy(hipsPos);
      else {
        const s = this.stretch[i];
        if (s !== 1) b.position.copy(this.restLocalP[i]).multiplyScalar(s);
        else b.position.copy(this.restLocalP[i]);
      }
    }
  }
}
const _qi = new THREE.Quaternion();
