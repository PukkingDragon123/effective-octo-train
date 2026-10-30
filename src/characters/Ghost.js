// Ghost deformation layer (on top of the human animation):
//   neckTwist (rad, past human limits, shoulders stay put), headRoll (sideways snap),
//   headPitch, backbend (bridge), armTwist, limbBreak (wrong-way elbows / knees),
//   jitter (irregular micro-twitches: sharp attack, slow release, Poisson timing),
//   levitate (rise, toes dangling), stretch (elongated forearms / shins / neck),
//   mouthStretch (jaw past its limit + lips pulled wide), crawl (blend to all fours).
// Values ease toward targets at a per-call speed; neckTwist etc. are applied in
// rig space after IK so nothing else (shoulders, chest) follows them.
import * as THREE from 'three';
import { damp, clamp } from '../core/math.js';
import { BONE_INDEX as BI } from './Rig.js';
import { Pose } from './IK.js';

const KEYS = ['neckTwist', 'headRoll', 'headPitch', 'backbend', 'armTwist', 'jitter', 'levitate', 'mouthStretch', 'limbBreak', 'crawl', 'stretch'];
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _ax = new THREE.Vector3();
const JIT_BONES = ['head', 'neck', 'head', 'clavicleL', 'clavicleR', 'handL', 'handR', 'index1L', 'index1R', 'spine', 'head', 'forearmL', 'forearmR'];

export class GhostLayer {
  constructor(h, isDouble = false) {
    this.h = h;
    this.isDouble = isDouble;
    this.v = Object.fromEntries(KEYS.map((k) => [k, 0]));
    this.t = Object.fromEntries(KEYS.map((k) => [k, 0]));
    this.speed = Object.fromEntries(KEYS.map((k) => [k, 3]));
    this.twitches = Array.from({ length: 10 }, () => ({ bone: -1, t: 0, dur: 0, ax: new THREE.Vector3(), amp: 0, atk: 0.04 }));
    this.nextTwitch = 0.3;
    this.tmp = new Pose();
    this.crawlPose = new Pose();
    this._crawlFeet = { L: new THREE.Vector3(), R: new THREE.Vector3(), use: 0 };
  }

  get levitate() { return this.v.levitate; }
  get mouthStretch() { return this.v.mouthStretch; }

  setTargets(g, speed = 3) {
    for (const k of KEYS) {
      if (g[k] === undefined) continue;
      this.t[k] = g[k];
      this.speed[k] = speed;
      if (speed >= 50) this.v[k] = g[k];
    }
    Object.assign(this.h.ghost, g);
  }

  _ease(dt) {
    for (const k of KEYS) this.v[k] = damp(this.v[k], this.t[k], this.speed[k], dt);
  }

  /** Pose-space part (before IK). */
  applyPose(p, dt) {
    this._ease(dt);
    const v = this.v;
    const h = this.h;
    if (v.crawl > 0.001) {
      h.anim.crawlPose(this.crawlPose.clear(), this._crawlFeet);
      p.lerp(this.crawlPose, clamp(v.crawl, 0, 1));
    }
    if (v.backbend > 0.001) {
      const b = v.backbend;
      p.hips.z += 0.06 * b;
      p.hips.y -= 0.12 * b;
      p.add('hips', 0.25 * b, 0, 0);
      p.add('spine', 0.6 * b, 0, 0);
      p.add('chest', 0.7 * b, 0, 0);
      p.add('neck', 0.55 * b, 0, 0);
      p.add('head', 0.45 * b, 0, 0);
      p.addSym('upperArm', 0.9 * b, 0, 0.3 * b);
    }
    if (v.armTwist > 0.001) {
      const a = v.armTwist;
      p.add('upperArmR', 0, 1.4 * a, 0); p.add('upperArmL', 0, 1.6 * a, 0);
      p.add('forearmR', 0, 1.8 * a, 0); p.add('forearmL', 0, 1.5 * a, 0);
      p.add('thighR', 0, 0.6 * a, 0); p.add('thighL', 0, -0.5 * a, 0);
    }
    if (v.limbBreak > 0.001) {
      const l = v.limbBreak;
      // elbows hyperextend the wrong way, one wrist folds back, fingers splay
      p.add('forearmR', 1.25 * l, 0.4 * l, 0); p.add('forearmL', 0.9 * l, -0.3 * l, 0);
      p.add('handR', 1.0 * l, 0, 0.3 * l); p.add('handL', -0.9 * l, 0, 0);
      p.add('index1R', 0.8 * l, 0, 0.3 * l); p.add('pinky1R', 0.9 * l, 0, -0.4 * l);
    }
    if (v.levitate > 0.001) {
      const lv = v.levitate;
      p.hips.y += 0.32 * lv;
      p.addSym('thigh', -0.06 * lv, 0, 0.02 * lv);
      p.addSym('shin', 0.12 * lv, 0, 0);
      p.addSym('foot', -0.85 * lv, 0, 0);
      p.addSym('toe', -0.3 * lv, 0, 0);
    }
    // stretch: lengthen arms, shins and neck via bone scale (see applyPost)
  }

  /** Rig-space part (after IK). */
  applyPost(dt) {
    const h = this.h;
    const rig = h.rig;
    const v = this.v;
    // stretch
    const st = 1 + clamp(v.stretch, 0, 1.5) * 0.55;
    rig.scaleY = rig.scaleY || new Float32Array(rig.bones.length).fill(1);
    const S = rig.scaleY;
    if (st !== 1 || S[BI.upperArmR] !== 1) {
      for (const s of ['L', 'R']) {
        S[BI['upperArm' + s]] = st; S[BI['hand' + s]] = 1 / st;
        S[BI['thigh' + s]] = 1 + (st - 1) * 0.5; S[BI['foot' + s]] = 1 / (1 + (st - 1) * 0.5);
        rig.stretch[BI['forearm' + s]] = st; rig.stretch[BI['hand' + s]] = st;
        rig.stretch[BI['shin' + s]] = 1 + (st - 1) * 0.5; rig.stretch[BI['foot' + s]] = 1 + (st - 1) * 0.5;
      }
      S[BI.neck] = 1 + (st - 1) * 0.6; S[BI.head] = 1 / S[BI.neck];
      rig.stretch[BI.head] = S[BI.neck];
      rig.fkFrom(BI.hips);
    }
    const chest = BI.chest, neck = BI.neck, head = BI.head;
    // neck twist about the chest's up axis, shoulders untouched
    if (Math.abs(v.neckTwist) > 0.0005) {
      _ax.set(0, 1, 0).applyQuaternion(rig.rq[chest]).normalize();
      _q.setFromAxisAngle(_ax, v.neckTwist * 0.42);
      _q2.copy(_q).multiply(rig.rq[neck]);
      rig.setRigQuat(neck, _q2);
      rig.fkFrom(neck);
      _ax.set(0, 1, 0).applyQuaternion(rig.rq[neck]).normalize();
      _q.setFromAxisAngle(_ax, v.neckTwist * 0.58);
      _q2.copy(_q).multiply(rig.rq[head]);
      rig.setRigQuat(head, _q2);
      rig.fkFrom(head);
    }
    if (Math.abs(v.headRoll) > 0.0005 || Math.abs(v.headPitch) > 0.0005) {
      // roll about the face's forward axis, pitch about the head's left-right axis (neck takes a share)
      _ax.set(0, 0, -1).applyQuaternion(rig.rq[head]).normalize();
      _q.setFromAxisAngle(_ax, v.headRoll * 0.3);
      _v.set(1, 0, 0).applyQuaternion(rig.rq[head]).normalize();
      _q2.setFromAxisAngle(_v, v.headPitch * 0.3);
      _q.multiply(_q2);
      _q2.copy(_q).multiply(rig.rq[neck]);
      rig.setRigQuat(neck, _q2);
      rig.fkFrom(neck);
      _ax.set(0, 0, -1).applyQuaternion(rig.rq[head]).normalize();
      _q.setFromAxisAngle(_ax, v.headRoll * 0.7);
      _v.set(1, 0, 0).applyQuaternion(rig.rq[head]).normalize();
      _q2.setFromAxisAngle(_v, v.headPitch * 0.7);
      _q.multiply(_q2);
      _q2.copy(_q).multiply(rig.rq[head]);
      rig.setRigQuat(head, _q2);
      rig.fkFrom(head);
    }
    this._jitter(dt, (bi, q) => {
      _q2.copy(q).multiply(rig.rq[bi]);
      rig.setRigQuat(bi, _q2);
      rig.fkFrom(bi);
    });
  }

  /** Irregular micro-twitches: Poisson-timed impulses with a sharp attack and a slower release. */
  _jitter(dt, applyFn) {
    const j = this.v.jitter;
    if (j > 0.01) {
      this.nextTwitch -= dt;
      if (this.nextTwitch <= 0) {
        // exponential inter-arrival, bursts more likely at high jitter
        this.nextTwitch = -Math.log(1 - Math.random()) / (1.2 + j * 6);
        if (Math.random() < 0.25 * j) this.nextTwitch *= 0.15; // burst
        const slot = this.twitches.find((s) => s.bone < 0) || this.twitches[0];
        slot.bone = BI[JIT_BONES[Math.floor(Math.random() * JIT_BONES.length)]];
        slot.t = 0;
        slot.atk = 0.025 + Math.random() * 0.04;
        slot.dur = slot.atk + 0.12 + Math.random() * 0.45;
        slot.ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        const big = slot.bone === BI.head || slot.bone === BI.neck ? 0.35 : 0.5;
        slot.amp = (0.06 + Math.random() * big) * j;
      }
    }
    for (const s of this.twitches) {
      if (s.bone < 0) continue;
      s.t += dt;
      if (s.t >= s.dur) { s.bone = -1; continue; }
      const env = s.t < s.atk ? s.t / s.atk : Math.pow(1 - (s.t - s.atk) / (s.dur - s.atk), 2);
      _q.setFromAxisAngle(s.ax, s.amp * env);
      applyFn(s.bone, _q);
    }
  }

  /** Reflection doubles: apply overrides directly to the copied bones (local space). */
  updateDouble(dt) {
    this._ease(dt);
    const v = this.v;
    const b = this.h.bones;
    const loc = (bone, axis, ang) => {
      if (Math.abs(ang) < 1e-5) return;
      _q.setFromAxisAngle(_ax.set(...axis), ang);
      bone.quaternion.multiply(_q);
    };
    loc(b.neck, [0, 1, 0], v.neckTwist * 0.42);
    loc(b.head, [0, 1, 0], v.neckTwist * 0.58);
    loc(b.head, [0, 0, 1], -v.headRoll);
    loc(b.head, [1, 0, 0], v.headPitch);
    loc(b.spine, [1, 0, 0], v.backbend * 0.6);
    loc(b.chest, [1, 0, 0], v.backbend * 0.7);
    loc(b.forearmR, [1, 0, 0], v.limbBreak * 1.25);
    loc(b.forearmL, [1, 0, 0], v.limbBreak * 0.9);
    if (v.levitate > 0.001) b.hips.position.y += 0.32 * v.levitate;
    this._jitter(dt, (bi, q) => {
      const bone = this.h.boneList[bi];
      bone.quaternion.premultiply(q);
    });
    if (this.h.head && v.mouthStretch > 0.001) {
      const m = this.h.head.morphTargetInfluences;
      m[5] = Math.max(m[5], v.mouthStretch * 1.2); // mouthWide
      b.jaw.quaternion.multiply(_q.setFromAxisAngle(_ax.set(1, 0, 0), -v.mouthStretch * 0.5));
    }
  }
}
