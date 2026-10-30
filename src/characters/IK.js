// Pose buffers (per-bone flex/side/twist angles) and analytic two-bone IK with
// pole vectors, working on the Rig's rig-space arrays (no per-frame allocation).
import * as THREE from 'three';
import { BONE_COUNT, BONE_INDEX as BI, IS_LEFT, PARENT } from './Rig.js';

const _e = new THREE.Euler(0, 0, 0, 'XZY');
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _t = new THREE.Vector3();

/** A pose: angles[bone*3 + (0 flex X,1 twist Y,2 side Z)] + hips offset (rig space) + root offsets. */
export class Pose {
  constructor() {
    this.a = new Float32Array(BONE_COUNT * 3);
    this.hips = new THREE.Vector3(); // offset from rest hips position
    this.w = new Float32Array(BONE_COUNT); // per-bone weight (used by layered overrides)
  }
  clear() {
    this.a.fill(0);
    this.hips.set(0, 0, 0);
    return this;
  }
  copy(p) {
    this.a.set(p.a);
    this.hips.copy(p.hips);
    return this;
  }
  set(name, x = 0, y = 0, z = 0) {
    const i = BI[name] * 3;
    this.a[i] = x; this.a[i + 1] = y; this.a[i + 2] = z;
    return this;
  }
  add(name, x = 0, y = 0, z = 0) {
    const i = BI[name] * 3;
    this.a[i] += x; this.a[i + 1] += y; this.a[i + 2] += z;
    return this;
  }
  /** Set both sides (authored for the right side; left mirrored automatically when composed). */
  sym(base, x = 0, y = 0, z = 0) {
    this.set(base + 'L', x, y, z);
    this.set(base + 'R', x, y, z);
    return this;
  }
  addSym(base, x = 0, y = 0, z = 0) {
    this.add(base + 'L', x, y, z);
    this.add(base + 'R', x, y, z);
    return this;
  }
  /** this = lerp(this, p, t) */
  lerp(p, t) {
    if (t <= 0) return this;
    if (t >= 1) return this.copy(p);
    const a = this.a, b = p.a;
    for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * t;
    this.hips.lerp(p.hips, t);
    return this;
  }
  /** Blend only bones with weight mask m (Float32Array per bone) scaled by t. */
  lerpMasked(p, t, mask) {
    const a = this.a, b = p.a;
    for (let i = 0; i < BONE_COUNT; i++) {
      const k = t * (mask ? mask[i] : 1);
      if (k <= 0) continue;
      const o = i * 3;
      a[o] += (b[o] - a[o]) * k;
      a[o + 1] += (b[o + 1] - a[o + 1]) * k;
      a[o + 2] += (b[o + 2] - a[o + 2]) * k;
    }
    return this;
  }
}

/** Compose pose angles into the rig's local quaternions (rest * delta), mirroring left-side bones. */
export function composePose(rig, pose) {
  const a = pose.a;
  for (let i = 0; i < BONE_COUNT; i++) {
    const o = i * 3;
    let x = a[o], y = a[o + 1], z = a[o + 2];
    if (IS_LEFT[i]) { y = -y; z = -z; }
    if (x === 0 && y === 0 && z === 0) {
      rig.lq[i].copy(rig.restLocalQ[i]);
    } else {
      _e.set(x, y, z, 'XZY');
      _q.setFromEuler(_e);
      rig.lq[i].copy(rig.restLocalQ[i]).multiply(_q);
    }
  }
}

/** Quaternion from basis vectors (columns). */
export function quatFromBasis(x, y, z, out) {
  _m.set(x.x, y.x, z.x, 0, x.y, y.y, z.y, 0, x.z, y.z, z.z, 0, 0, 0, 0, 1);
  return out.setFromRotationMatrix(_m);
}

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _fkA = new THREE.Quaternion(), _fkB = new THREE.Quaternion(), _fkC = new THREE.Quaternion();

/**
 * Two-bone IK in rig space.
 * chain: { a, b, c } bone indices (upper, lower, end), kind 'arm' | 'leg'
 * target: Vector3 (end-bone position goal, rig space), pole: Vector3 (rig space point the middle joint points toward)
 * endQ: optional rig-space quaternion for the end bone; weight 0..1; endWeight 0..1
 */
export function solveTwoBone(rig, chain, target, pole, weight = 1, endQ = null, endWeight = 1, stretchMax = 1.0) {
  if (weight <= 0.0001) return;
  const { a, b, c, kind } = chain;
  const A = rig.rp[a];
  const la = rig.restLocalP[b].length() * rig.stretch[b];
  const lb = rig.restLocalP[c].length() * rig.stretch[c];
  _fkA.copy(rig.rq[a]);
  _fkB.copy(rig.rq[b]);
  _fkC.copy(rig.rq[c]);
  // target distance clamp
  _t.copy(target).sub(A);
  let dist = _t.length();
  const maxR = (la + lb) * 0.9995 * stretchMax;
  const minR = Math.abs(la - lb) + 0.01;
  if (dist < 1e-5) return;
  const dir = _d.copy(_t).divideScalar(dist);
  if (dist > maxR) dist = maxR;
  if (dist < minR) dist = minR;
  // pole direction perpendicular to dir
  _b.copy(pole).sub(A);
  _b.addScaledVector(dir, -_b.dot(dir));
  if (_b.lengthSq() < 1e-8) {
    // fall back to current mid-joint direction
    _b.copy(rig.rp[b]).sub(A);
    _b.addScaledVector(dir, -_b.dot(dir));
    if (_b.lengthSq() < 1e-8) _b.set(0, 0, kind === 'leg' ? -1 : 1);
  }
  _b.normalize();
  // law of cosines: angle at A
  const cosA = (la * la + dist * dist - lb * lb) / (2 * la * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  // mid joint position
  _c.copy(A).addScaledVector(dir, cosA * la).addScaledVector(_b, sinA * la); // B'
  const endP = _a.copy(A).addScaledVector(dir, dist); // reached end
  // upper frame: Y along A->B', bend side from the forearm/shin direction
  _y.copy(_c).sub(A).normalize();
  _t.copy(endP).sub(_c).normalize(); // lower dir
  _z.copy(_t).addScaledVector(_y, -_t.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.copy(_b);
  _z.normalize();
  if (kind === 'arm') _z.negate(); // elbow flex = forearm toward -Z
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y).normalize();
  quatFromBasis(_x, _y, _z, _qa);
  // lower frame: same hinge X, Y along lower dir
  const yl = _t;
  _z.crossVectors(_x, yl).normalize();
  quatFromBasis(_x, yl, _z, _qb);
  if (weight < 1) {
    _qa.slerpQuaternions(_fkA, _qa, weight);
    _qb.slerpQuaternions(_fkB, _qb, weight);
  }
  rig.setRigQuat(a, _qa);
  // recompute B's rig position for the new upper rotation, then set lower
  rig.rp[b].copy(rig.restLocalP[b]).multiplyScalar(rig.stretch[b]).applyQuaternion(rig.rq[a]).add(A);
  rig.setRigQuat(b, _qb);
  if (endQ && endWeight > 0) {
    _qc.copy(_fkC);
    // keep FK end orientation relative to the new lower bone, then blend toward endQ
    _q2.copy(_fkB).invert().multiply(_fkC);
    _qc.copy(rig.rq[b]).multiply(_q2);
    _qc.slerp(endQ, endWeight * weight);
    rig.rp[c].copy(rig.restLocalP[c]).multiplyScalar(rig.stretch[c]).applyQuaternion(rig.rq[b]).add(rig.rp[b]);
    rig.setRigQuat(c, _qc);
  }
  rig.fkFrom(a);
}

export const ARM = {
  L: { a: BI.upperArmL, b: BI.forearmL, c: BI.handL, kind: 'arm' },
  R: { a: BI.upperArmR, b: BI.forearmR, c: BI.handR, kind: 'arm' },
};
export const LEG = {
  L: { a: BI.thighL, b: BI.shinL, c: BI.footL, kind: 'leg' },
  R: { a: BI.thighR, b: BI.shinR, c: BI.footR, kind: 'leg' },
};

/** Hand orientation convention: target identity = palm down, fingers forward (-Z). Hand frame: Y fingers, Z dorsal. */
export const HAND_FROM_TARGET = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
/** Foot convention: identity = foot flat, toes forward (-Z). Foot frame: Y toward toes, Z up. */
export const FOOT_FROM_TARGET = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
void PARENT;
