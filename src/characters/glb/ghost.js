// Ghost deformation layer (contract parameters): neckTwist (rad, post-skin twist about the neck
// axis: far past human limits, shoulders never move), headRoll / headPitch (rad, snaps), backbend
// (rad over the spine), armTwist (rad), limbBreak (0..1 elbows/knees bent the wrong way, wrists
// back), jitter (0..1 irregular twitching: holds, then sudden small snaps, never noise soup),
// levitate (m, toes dangle), stretch (0..1 elongated neck/arms/spine), mouthStretch (0..1),
// crawl (handled by actions). Extras: unlimited (look), stare (fixed eyes), noBlink, breath, stillness.
// Uncanny layer (MakeHuman characters; harmless no-ops on the old bodies):
//   uncanny 0..1      proportions a few percent wrong: eyes further apart and larger, mouth wider,
//                     longer neck (a morph), longer fingers (bone lengths)
//   blinkDesync 0..1  the eyes blink out of sync, sometimes only one eye
//   snapTilts 0..1    micro head tilts that hold, then snap to a new angle with no transition
//   stutter 0..1      stutter-frame motion: the whole body holds a pose, then jumps to the current one
//   breathStop 0..1   breathing stops
//   veins 0..1        visible veins under grey translucent skin (adds to the look's)
//   pupils -1..1      pinprick (-1) .. fully dilated (1) pupils (overrides the look's)
//   hairOverFace 0..1 wet clumps of hair hang over the face (needs a long-haired / ghost look)
//   veilGap -1..1     opens a gap in that hair over the left (-) or right (+) eye; 0 closed
// Values approach their targets with a critically-damped feel (setTargets(g, speed)).
import * as THREE from 'three';
import { clamp, damp, smoothstep, noise } from '../../core/math.js';

const KEYS = ['neckTwist', 'headRoll', 'headPitch', 'backbend', 'armTwist', 'jitter', 'levitate', 'mouthStretch', 'limbBreak', 'crawl', 'stretch', 'stare', 'unlimited', 'noBlink', 'still',
  'uncanny', 'blinkDesync', 'snapTilts', 'stutter', 'breathStop', 'veins', 'pupils', 'hairOverFace', 'veilGap'];
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export class GhostLayer {
  constructor(h, isDouble = false) {
    this.h = h;
    this.isDouble = isDouble;
    this.v = {};
    this.tgt = {};
    this.spd = {};
    for (const k of KEYS) { this.v[k] = 0; this.tgt[k] = 0; this.spd[k] = 3; }
    this.lookTwist = 0;
    this.speedMul = 1;
    // jitter state
    this.jt = 0;
    this.jCur = new Float32Array(8);
    this.jTgt = new Float32Array(8);
    // snapping micro tilts
    this.tiltT = 0;
    this.tilt = new Float32Array(2);
    this.set = new Set();
  }
  setTargets(g = {}, speed = 3) {
    for (const k of KEYS) if (g[k] !== undefined) {
      this.tgt[k] = typeof g[k] === 'boolean' ? (g[k] ? 1 : 0) : g[k];
      this.spd[k] = speed;
      this.set.add(k);
      if (speed >= 50) this.v[k] = this.tgt[k];
    }
    if (g.unlimited !== undefined) this.h.ghost && (this.h.ghost.unlimited = g.unlimited);
  }
  // derived fields used by the humanoid
  get levitate() { return this.v.levitate; }
  get mouthStretch() { return this.v.mouthStretch; }
  get breath() { return (1 - this.v.still * 0.9) * (1 - clamp(this.v.breathStop, 0, 1)); }
  get stillness() { return clamp(this.v.still + this.v.stare * 0.5, 0, 1); }
  get unlimitedLook() { return this.v.unlimited > 0.5 || this.v.neckTwist !== 0; }
  get stare() { return this.v.stare; }
  get noBlink() { return this.v.noBlink > 0.5 || this.v.stare > 0.8; }

  update(dt) {
    this._dt = dt;
    for (const k of KEYS) {
      const s = this.spd[k];
      this.v[k] = s >= 50 ? this.tgt[k] : damp(this.v[k], this.tgt[k], s, dt);
    }
    if (!this.isDouble) Object.assign(this.h.ghost, { neckTwist: this.v.neckTwist, headRoll: this.v.headRoll, headPitch: this.v.headPitch, backbend: this.v.backbend, armTwist: this.v.armTwist, jitter: this.v.jitter, levitate: this.v.levitate, mouthStretch: this.v.mouthStretch, limbBreak: this.v.limbBreak, crawl: this.v.crawl, stretch: this.v.stretch });
    // jitter: hold, then snap to a new small offset (irregular timing)
    const j = this.v.jitter;
    if (j > 0.01) {
      this.jt -= dt;
      if (this.jt <= 0) {
        this.jt = (0.06 + Math.random() * Math.random() * 0.9) / (0.4 + j);
        const n = Math.random() < 0.35 ? 8 : 3;
        for (let i = 0; i < n; i++) this.jTgt[(Math.random() * 8) | 0] = (Math.random() * 2 - 1) * (Math.random() < 0.15 ? 1 : 0.35);
      }
      const k = 1 - Math.exp(-28 * dt);
      for (let i = 0; i < 8; i++) this.jCur[i] += (this.jTgt[i] - this.jCur[i]) * k;
    } else for (let i = 0; i < 8; i++) this.jCur[i] *= Math.exp(-6 * dt);
  }

  /** local layer before IK: backbend, stretch, levitation legs, limb breaks, arm twist */
  applyPose() {
    const h = this.h, rig = h.rig, I = h.t.index, v = this.v;
    const tm = h.time;
    if (v.backbend) {
      const b = v.backbend;
      rig.addEuler(I.spine_01, -0.25 * b, 0, 0);
      rig.addEuler(I.spine_02, -0.35 * b, 0, 0);
      rig.addEuler(I.spine_03, -0.4 * b, 0, 0);
    }
    if (v.stretch > 0.001) {
      const s = v.stretch;
      const sc = (n, k) => { const b = rig.bones[I[n]]; b.position.multiplyScalar(1 + k * s); };
      sc('spine_02', 0.15); sc('spine_03', 0.15); sc('neck_01', 0.5); sc('Head', 1.1);
      for (const x of ['l', 'r']) { sc('lowerarm_' + x, 0.4); sc('hand_' + x, 0.45); sc('calf_' + x, 0.12); sc('foot_' + x, 0.12); }
    }
    const lev = smoothstep(0.0, 0.25, v.levitate);
    if (lev > 0) {
      // dangling: hips loose, knees a little bent, toes pointing down, arms hang slightly away; slow drift
      const sw = noise.noise2D(tm * 0.25, 4.2), sw2 = noise.noise2D(tm * 0.19, 8.9);
      rig.addEuler(I.pelvis, sw * 0.05 * lev, sw2 * 0.08 * lev, sw2 * 0.04 * lev);
      for (const [x, sg] of [['l', 1], ['r', -1]]) {
        rig.addEuler(I['thigh_' + x], 0.12 * lev + sw * 0.05 * sg * lev, 0, 0);
        rig.addEuler(I['calf_' + x], 0.32 * lev + sw2 * 0.06 * sg * lev, 0, 0);
        rig.addEuler(I['foot_' + x], 0.85 * lev, 0, 0);
        rig.addEuler(I['ball_' + x], 0.35 * lev, 0, 0);
        rig.addEuler(I['upperarm_' + x], 0, 0, sg * 0.12 * lev);
      }
    }
    if (v.limbBreak > 0.001) {
      const lb = v.limbBreak;
      for (const [x, sg] of [['l', 1], ['r', -1]]) {
        // elbow bent backwards (about the elbow hinge, model ±Y at rest), wrist folded back
        rig.addEuler(I['lowerarm_' + x], 0, sg * 0.85 * lb, 0);
        rig.addEuler(I['hand_' + x], 0, 0, sg * 0.9 * lb);
        rig.addEuler(I['calf_' + x], 0, 0, sg * 0.35 * lb);
        rig.addEuler(I['clavicle_' + x], 0, 0, -sg * 0.18 * lb);
        for (const f of ['index', 'middle', 'ring', 'pinky']) rig.addEuler(I[`${f}_02_${x}`], 0, 0, sg * (0.6 + 0.4 * Math.sin(f.length * 3.1)) * lb);
      }
    }
    if (v.uncanny > 0.001 && h.isMH) {
      // longer fingers: every finger joint a little further from the last
      const k = 1 + 0.2 * v.uncanny;
      for (const x of ['l', 'r']) for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) for (const seg of ['_02_', '_03_']) {
        const b = rig.bones[I[f + seg + x]];
        if (b) b.position.multiplyScalar(k);
      }
    }
    if (v.armTwist) {
      const a = v.armTwist;
      rig.addAxis(I.upperarm_l, X, a * 0.6); rig.addAxis(I.lowerarm_l, X, a);
      rig.addAxis(I.upperarm_r, X, -a * 0.6); rig.addAxis(I.lowerarm_r, X, -a);
    }
  }

  /** world layer after IK: neck twist (shader), head roll/pitch snaps, jitter */
  applyPost() {
    const h = this.h, rig = h.rig, I = h.t.index, v = this.v, U = h.U;
    // ---- neck twist axis in mesh (inner) space
    let tw = v.neckTwist + this.lookTwist;
    if (this.isDouble) tw += h.source.U.uTwistO.value.w;
    const inv = _m.copy(h.inner.matrixWorld).invert();
    rig.worldPos(I.neck_01, _v).applyMatrix4(inv);
    rig.worldPos(I.Head, _v2).applyMatrix4(inv);
    _v2.sub(_v);
    const len = Math.max(0.03, _v2.length());
    U.uTwistO.value.set(_v.x, _v.y, _v.z, tw);
    U.uTwistD.value.set(_v2.x / len, _v2.y / len, _v2.z / len, len);
    if (this.isDouble) U.uFaceA.value.w = Math.max(U.uFaceA.value.w, v.mouthStretch);
    // ---- head roll / pitch (world axes of the head frame)
    if (v.headRoll || v.headPitch) {
      for (const [i, k] of [[I.neck_01, 0.3], [I.Head, 0.7]]) {
        h.boneFrame(i, _q);
        if (v.headRoll) { _v.copy(Z).applyQuaternion(_q); rig.rotateWorld(i, _q2.setFromAxisAngle(_v, -v.headRoll * k)); rig.update(i); }
        if (v.headPitch) { h.boneFrame(i, _q); _v.copy(X).applyQuaternion(_q); rig.rotateWorld(i, _q2.setFromAxisAngle(_v, v.headPitch * k)); rig.update(i); }
      }
    }
    // ---- micro head tilts that snap: hold an angle, then jump to the next with no transition
    if (v.snapTilts > 0.01) {
      this.tiltT -= this._dt || 0.016;
      if (this.tiltT <= 0) {
        this.tiltT = 0.35 + Math.random() * 2.2 / (0.5 + v.snapTilts);
        this.tilt[0] = (Math.random() * 2 - 1) * 0.16 * v.snapTilts;
        this.tilt[1] = (Math.random() * 2 - 1) * 0.07 * v.snapTilts;
      }
      h.boneFrame(I.Head, _q);
      _v.copy(Z).applyQuaternion(_q); rig.rotateWorld(I.Head, _q2.setFromAxisAngle(_v, this.tilt[0])); rig.update(I.Head);
      h.boneFrame(I.Head, _q);
      _v.copy(X).applyQuaternion(_q); rig.rotateWorld(I.Head, _q2.setFromAxisAngle(_v, this.tilt[1])); rig.update(I.Head);
    }
    // ---- jitter: snaps on head / neck / shoulders / fingers
    const j = v.jitter;
    if (j > 0.01 || Math.abs(this.jCur[0]) > 0.001) {
      const c = this.jCur;
      h.boneFrame(I.Head, _q);
      _v.copy(Y).applyQuaternion(_q); rig.rotateWorld(I.Head, _q2.setFromAxisAngle(_v, c[0] * 0.35 * j)); rig.update(I.Head);
      h.boneFrame(I.Head, _q);
      _v.copy(Z).applyQuaternion(_q); rig.rotateWorld(I.Head, _q2.setFromAxisAngle(_v, c[1] * 0.3 * j)); rig.update(I.Head);
      h.boneFrame(I.Head, _q);
      _v.copy(X).applyQuaternion(_q); rig.rotateWorld(I.Head, _q2.setFromAxisAngle(_v, c[2] * 0.2 * j)); rig.update(I.Head);
      rig.addEuler(I.clavicle_l, 0, 0, c[3] * 0.15 * j);
      rig.addEuler(I.clavicle_r, 0, 0, -c[4] * 0.15 * j);
      for (const [x, k] of [['l', 5], ['r', 6]]) for (const f of ['index', 'middle', 'ring', 'pinky']) rig.addEuler(I[`${f}_01_${x}`], 0, 0, (x === 'l' ? -1 : 1) * c[k] * 0.6 * j);
      rig.addEuler(I.spine_03, c[7] * 0.06 * j, 0, 0);
      h.inner.updateMatrixWorld(true);
    }
  }
}
