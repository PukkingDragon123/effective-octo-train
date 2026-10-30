// Per-instance skeleton on a GLB template + pose helpers used by every procedural layer.
//
// Frames: the skeleton lives under `inner` (template model space: +Z forward, +X = the
// character's left, Y up, scaled to the character's height). "Model axes" below mean that
// space. addRot() applies a rotation given in model axes *at rest* through the parent's
// rest frame (so it follows the animated parent: a local, additive offset). World-space
// edits (look-at, IK) use the bones' current matrixWorld.
import * as THREE from 'three';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

/** contract bone name -> template bone name */
export const CONTRACT_BONES = (() => {
  const m = { hips: 'pelvis', spine: 'spine_01', spine2: 'spine_02', chest: 'spine_03', neck: 'neck_01', head: 'Head', eyeL: 'eye_l', eyeR: 'eye_r' };
  for (const [S, s] of [['L', 'l'], ['R', 'r']]) {
    m['clavicle' + S] = 'clavicle_' + s;
    m['upperArm' + S] = 'upperarm_' + s;
    m['forearm' + S] = 'lowerarm_' + s;
    m['hand' + S] = 'hand_' + s;
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
      m[f + '1' + S] = `${f}_01_${s}`;
      m[f + '2' + S] = `${f}_02_${s}`;
      m[f + '3' + S] = `${f}_03_${s}`;
    }
    m['thigh' + S] = 'thigh_' + s;
    m['shin' + S] = 'calf_' + s;
    m['foot' + S] = 'foot_' + s;
    m['toe' + S] = 'ball_' + s;
  }
  return m;
})();

export class InstanceRig {
  constructor(t) {
    this.t = t;
    const n = t.names.length;
    this.bones = t.names.map((name, i) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.copy(t.restPos[i]);
      b.quaternion.copy(t.restQuat[i]);
      b.scale.copy(t.restScale[i]);
      return b;
    });
    this.roots = [];
    this.bones.forEach((b, i) => {
      const p = t.parent[i];
      if (p >= 0) this.bones[p].add(b);
      else this.roots.push(b);
    });
    this.skeleton = new THREE.Skeleton(this.bones, t.boneInverses.map((m) => m.clone()));
    this.byName = {};
    for (const b of this.bones) this.byName[b.name] = b;
    // per-bone rest base: model-space rotation of the parent at rest (conjugation for addRot)
    this.parRest = t.names.map((_, i) => (t.parent[i] >= 0 ? t.Gq[t.parent[i]].clone() : new THREE.Quaternion()));
    this.parRestInv = this.parRest.map((q) => q.clone().invert());
    // rest positions (procedural stretch writes positions; reset each frame)
    this.posRest = t.restPos.map((p) => p.clone());
    this.scaleRest = t.restScale.map((s) => s.clone());
    this._n = n;
  }

  idx(name) { return this.t.index[name]; }
  bone(name) { return this.byName[name]; }

  /** reset every bone to its rest local transform (call before the mixer) */
  reset(keepScale = true) {
    const t = this.t;
    for (let i = 0; i < this._n; i++) {
      const b = this.bones[i];
      b.quaternion.copy(t.restQuat[i]);
      b.position.copy(this.posRest[i]);
      if (!keepScale) b.scale.copy(this.scaleRest[i]);
    }
  }

  /** additive rotation in model axes (at rest) on bone i: L' = (P⁻¹ D P) L ; euler radians (pitch +X, yaw +Y, roll +Z) */
  addEuler(i, pitch, yaw, roll, w = 1) {
    if (i === undefined || (pitch === 0 && yaw === 0 && roll === 0) || w === 0) return;
    _e.set(pitch * w, yaw * w, roll * w, 'YXZ');
    _q.setFromEuler(_e);
    this.addQuat(i, _q);
  }
  addQuat(i, qModel) {
    const b = this.bones[i];
    _q2.copy(this.parRestInv[i]).multiply(qModel).multiply(this.parRest[i]);
    b.quaternion.premultiply(_q2);
  }
  /** additive rotation about a model-space axis (at rest) */
  addAxis(i, axis, angle) {
    if (i === undefined || angle === 0) return;
    _q3.setFromAxisAngle(axis, angle);
    this.addQuat(i, _q3);
  }

  /** world quaternion of bone i (matrixWorld must be current) */
  worldQuat(i, out) {
    this.bones[i].matrixWorld.decompose(_v4, out, _s);
    return out;
  }
  worldPos(i, out) { return out.setFromMatrixPosition(this.bones[i].matrixWorld); }

  /** rotate bone i by a world-space delta D (keeps children attached): L' = Pw⁻¹ D Pw L */
  rotateWorld(i, D, w = 1) {
    const b = this.bones[i];
    const par = b.parent;
    par.matrixWorld.decompose(_v4, _q, _s);
    if (w < 1) { _q3.identity().slerp(D, w); D = _q3; }
    _q2.copy(_q).invert().multiply(D).multiply(_q);
    b.quaternion.premultiply(_q2);
  }
  /** set bone i's world rotation (blend w) */
  setWorldQuat(i, Wq, w = 1) {
    const b = this.bones[i];
    b.parent.matrixWorld.decompose(_v4, _q, _s);
    _q2.copy(_q).invert().multiply(Wq);
    if (w >= 1) b.quaternion.copy(_q2);
    else b.quaternion.slerp(_q2, w);
  }
  update(i) { this.bones[i].updateMatrixWorld(true); }
}

// ---------------------------------------------------------------- two-bone IK
/**
 * Chain descriptor for a limb: indices + rest-derived local axes.
 * along: unit vector in the bone's local frame pointing to its child joint;
 * hinge: unit vector in the bone's local frame = bend-plane normal (cross(upperDir, lowerDir) when flexed).
 */
export function makeChain(rig, a, b, c, flexDirModel) {
  const t = rig.t;
  const ia = t.index[a], ib = t.index[b], ic = t.index[c];
  const pa = t.Gp[ia], pb = t.Gp[ib], pc = t.Gp[ic];
  const dA = pb.clone().sub(pa).normalize();
  const dB = pc.clone().sub(pb).normalize();
  // hinge in model space: normal of the plane (upper dir, flexed lower dir)
  const flexed = dA.clone().multiplyScalar(0.3).add(flexDirModel.clone().normalize()).normalize();
  const hingeM = new THREE.Vector3().crossVectors(dA, flexed).normalize();
  const local = (i, v) => v.clone().applyQuaternion(t.Gq[i].clone().invert()).normalize();
  const ch = {
    ia, ib, ic,
    lenA: pa.distanceTo(pb), lenB: pb.distanceTo(pc),
    alongA: local(ia, dA), alongB: local(ib, dB),
    hingeA: local(ia, hingeM), hingeB: local(ib, hingeM),
  };
  // orthonormalise (along ⟂ hinge)
  for (const k of ['A', 'B']) {
    const al = ch['along' + k], hi = ch['hinge' + k];
    hi.sub(al.clone().multiplyScalar(hi.dot(al))).normalize();
    ch['basis' + k] = basisQuat(al, hi, new THREE.Quaternion()).invert();
  }
  return ch;
}

/** quaternion of the rotation taking the model axes (X, Y, Z) to (along, hinge, along×hinge) */
export function basisQuat(along, hinge, out) {
  _v.crossVectors(along, hinge);
  _m.makeBasis(along, hinge, _v);
  return out.setFromRotationMatrix(_m);
}

const _wa = new THREE.Vector3(), _wb = new THREE.Vector3(), _wc = new THREE.Vector3();
const _dir = new THREE.Vector3(), _pole = new THREE.Vector3(), _elb = new THREE.Vector3(), _n = new THREE.Vector3();
const _Wq = new THREE.Quaternion(), _Bq = new THREE.Quaternion();

/**
 * Solve a two-bone chain in world space. target/pole: world Vector3. w: blend 0..1.
 * Returns the reach ratio (|target - root| / (lenA + lenB)).
 */
export function solveTwoBone(rig, ch, target, pole, w = 1, scale = 1) {
  if (w <= 0.0005) return 0;
  const A = rig.bones[ch.ia], B = rig.bones[ch.ib];
  A.parent.updateMatrixWorld(true);
  A.updateMatrixWorld(true);
  rig.worldPos(ch.ia, _wa);
  const la = ch.lenA * scale * (A.scale.x || 1), lb = ch.lenB * scale * (B.scale.x || 1);
  _dir.copy(target).sub(_wa);
  let d = _dir.length();
  const reach = d / (la + lb);
  d = Math.max(Math.abs(la - lb) + 1e-4, Math.min(d, (la + lb) * 0.9995));
  _dir.normalize();
  // elbow position in the plane (root, target, pole)
  _pole.copy(pole).sub(_wa);
  _pole.addScaledVector(_dir, -_pole.dot(_dir));
  if (_pole.lengthSq() < 1e-10) {
    rig.worldPos(ch.ib, _pole).sub(_wa);
    _pole.addScaledVector(_dir, -_pole.dot(_dir));
  }
  _pole.normalize();
  const cosA = (la * la + d * d - lb * lb) / (2 * la * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _elb.copy(_wa).addScaledVector(_dir, la * cosA).addScaledVector(_pole, la * sinA);
  // bend-plane normal
  _wb.copy(_elb).sub(_wa).normalize();
  _wc.copy(_wa).addScaledVector(_dir, d).sub(_elb).normalize();
  _n.crossVectors(_wb, _wc);
  if (_n.lengthSq() < 1e-10) _n.crossVectors(_wb, _pole);
  _n.normalize();
  // upper bone world rotation: along->wb, hinge->n
  basisQuat(_wb, _n, _Wq).multiply(ch.basisA);
  rig.setWorldQuat(ch.ia, _Wq, w);
  A.updateMatrixWorld(true);
  basisQuat(_wc, _n, _Wq).multiply(ch.basisB);
  rig.setWorldQuat(ch.ib, _Wq, w);
  B.updateMatrixWorld(true);
  return reach;
}

/** Set the end bone (hand / foot) world rotation from (forward dir, normal dir) via its rest basis. */
export function makeEndBasis(rig, name, alongModel, normalModel) {
  const t = rig.t, i = t.index[name];
  const inv = t.Gq[i].clone().invert();
  const al = alongModel.clone().normalize().applyQuaternion(inv);
  const no = normalModel.clone().normalize().applyQuaternion(inv);
  no.sub(al.clone().multiplyScalar(no.dot(al))).normalize();
  return { i, basis: basisQuat(al, no, new THREE.Quaternion()).invert() };
}
export function setEndRotation(rig, eb, alongWorld, normalWorld, w = 1) {
  _v2.copy(normalWorld).addScaledVector(alongWorld, -normalWorld.dot(alongWorld)).normalize();
  _v3.copy(alongWorld).normalize();
  basisQuat(_v3, _v2, _Bq).multiply(eb.basis);
  rig.setWorldQuat(eb.i, _Bq, w);
  rig.bones[eb.i].updateMatrixWorld(true);
}
