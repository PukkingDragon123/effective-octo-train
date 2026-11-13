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
// Motion layer (uncanny behaviour, mostly driven by the GHOST_MOTIONS presets via HumanoidGLB.setGhostMotion):
//   holdTilt 0..1     big head tilts held far too long (2-7 s), then a snap to the next
//   neckRoam 0..1     the head turns slowly past the shoulder (to ~150 deg), holds, snaps back
//   jerks 0..1        long smooth stretches broken by sudden whole-body jerks (and lurches while walking)
//   glide 0..1        moves without stepping (walkTo floats; the toes drag)
//   stride 0..1       walking with too-long strides (slow cadence, over-swung legs)
//   backwards 0/1     walks backwards: body faces away from travel, the clip runs in reverse
//   hyperExt 0..1     elbows lock a little past straight
//   fingerCrawl 0..1  the fingers crawl one after another, a beat late
//   gasp 0..1         stands perfectly still without breathing, then one huge breath all at once
//   twitch 0..1       twitches the moment the player looks at it
//   gape 0..1         the mouth opens too wide (past the jaw's range)
// Values approach their targets with a critically-damped feel (setTargets(g, speed)).
import * as THREE from 'three';
import { clamp, damp, smoothstep, noise } from '../../core/math.js';
import { engine } from '../../core/Engine.js';

export const MOTION_KEYS = ['holdTilt', 'neckRoam', 'jerks', 'glide', 'stride', 'backwards', 'hyperExt', 'fingerCrawl', 'gasp', 'twitch', 'gape'];
const KEYS = ['neckTwist', 'headRoll', 'headPitch', 'backbend', 'armTwist', 'jitter', 'levitate', 'mouthStretch', 'limbBreak', 'crawl', 'stretch', 'stare', 'unlimited', 'noBlink', 'still',
  'uncanny', 'blinkDesync', 'snapTilts', 'stutter', 'breathStop', 'veins', 'pupils', 'hairOverFace', 'veilGap', ...MOTION_KEYS];

/**
 * Ghost behaviour presets for HumanoidGLB.setGhostMotion(name, opts). `set` are ghost-layer targets (scaled
 * by opts.amount), `action` a looping action started with the preset, `timeline` a scripted sequence run by
 * the layer. Switching presets returns every key the previous preset set to the ghost's own default.
 */
export const GHOST_MOTIONS = {
  none: { set: {} },
  // the default for calm ghosts: barely-there versions of everything below
  calm: { set: { stutter: 0.1, snapTilts: 0.3, holdTilt: 0.3, jerks: 0.12, gasp: 0.35, twitch: 0.4, hyperExt: 0.3, fingerCrawl: 0.15, neckRoam: 0.12 } },
  stopMotion: { set: { stutter: 1, jerks: 0.5, holdTilt: 0.45, snapTilts: 0.6, still: 0.7, breathStop: 1 } },
  tiltHold: { set: { holdTilt: 1, neckRoam: 1, unlimited: 1, stare: 1, still: 0.8, noBlink: 1 } },
  glide: { set: { glide: 1, jerks: 1, still: 0.9, levitate: 0.05, breathStop: 1, stare: 0.8, noBlink: 1 } },
  wrongLimbs: { set: { hyperExt: 1, fingerCrawl: 1, uncanny: 0.8, jitter: 0.12, snapTilts: 0.4 } },
  longStride: { set: { stride: 1, stare: 1, still: 0.6, holdTilt: 0.35, breathStop: 1 } },
  backwards: { set: { backwards: 1, neckTwist: Math.PI, unlimited: 1, stare: 1, still: 0.6, stutter: 0.25 } },
  breathless: { set: { gasp: 1, still: 1, stare: 0.7, noBlink: 1 } },
  crawl: { set: { backwards: 1, hyperExt: 0.6, jerks: 0.5, stare: 1, unlimited: 1, noBlink: 1, fingerCrawl: 0.5, stutter: 0.3 }, action: 'wrongCrawl' },
  headRaise: { set: { headPitch: 0, veilGap: 0, hairOverFace: 1, still: 1, breathStop: 1, stutter: 0.45, noBlink: 1 }, timeline: 'headRaise' },
  watcher: { set: { twitch: 1, stare: 1, still: 0.9, noBlink: 1, holdTilt: 0.5, gasp: 0.5 } },
  gape: { set: { gape: 1, headPitch: -0.22, jitter: 0.3, stutter: 0.4, stare: 1 } },
  nightmare: { set: { stutter: 0.7, holdTilt: 0.7, neckRoam: 0.6, unlimited: 1, jerks: 0.7, hyperExt: 0.8, fingerCrawl: 0.8, twitch: 1, stride: 0.6, gasp: 0.8, stare: 1, uncanny: 1 } },
};
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _m = new THREE.Matrix4();
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
    this.tiltS = new Float32Array(2);
    this.set = new Set();
    // motion layer state
    this.mo = { name: 'none', t: 0, timeline: null, roam: 0, roamT: 3 + Math.random() * 6, roamPh: 0, roamTgt: 0, jerkT: 2 + Math.random() * 5, lurch: 0,
      gaspT: 4 + Math.random() * 6, gaspU: -1, looked: false, twitchT: 0, crawlT: 0, raise: 0 };
    this.roamTw = 0;
    this.gaspK = 0; // 0..1 the all-at-once breath
    this.gapeK = 0;
  }
  /** start a preset's scripted part (called by HumanoidGLB.setGhostMotion) */
  startMotion(name, opts = {}) {
    const p = GHOST_MOTIONS[name];
    Object.assign(this.mo, { name, t: 0, timeline: p?.timeline || null, opts, raise: 0 });
    if (p?.set.neckRoam >= 0.5 && this.mo.roamPh === 0) this.mo.roamT = 0.6 + Math.random() * 1.5; // the first turn comes soon
    if (p?.timeline === 'headRaise') { this.setTargets({ headPitch: opts.from ?? 1.05, veilGap: 0 }, 100); }
  }
  /** is the player looking at this ghost? (encounters may set h.gazeFn for mirror gazes) */
  _watched() {
    const h = this.h;
    if (h.gazeFn) return !!h.gazeFn(h.headPosition);
    const cam = engine.camera;
    if (!cam || !h.headPosition) return false;
    const e = cam.matrixWorld.elements;
    _v.copy(h.headPosition).sub(_v2.set(e[12], e[13], e[14]));
    const d = _v.length();
    if (d > 30 || d < 0.05) return false;
    return (-(e[8] * _v.x + e[9] * _v.y + e[10] * _v.z)) / d > 0.982; // ≈ 11°
  }
  /** per-frame motion state machines: cheap scalar timers, no allocation */
  _motion(dt) {
    const v = this.v, mo = this.mo;
    mo.t += dt;
    // ---- neck roam: slow, too-smooth turn past the shoulder, a long hold, then a snap back
    if (v.neckRoam > 0.01 || mo.roamPh) {
      mo.roamT -= dt;
      if (mo.roamPh === 0 && mo.roamT <= 0 && v.neckRoam > 0.01) {
        mo.roamPh = 1; mo.roamTgt = (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.45) * (0.35 + 0.65 * v.neckRoam);
      }
      if (mo.roamPh === 1) {
        mo.roam = damp(mo.roam, mo.roamTgt, 0.9, dt); // eerily even, no ease-in wobble
        if (Math.abs(mo.roam - mo.roamTgt) < 0.03) { mo.roamPh = 2; mo.roamT = 1.5 + Math.random() * 3.5 * (0.5 + v.neckRoam); }
      } else if (mo.roamPh === 2 && mo.roamT <= 0) {
        mo.roamPh = 3;
      } else if (mo.roamPh === 3) {
        mo.roam = damp(mo.roam, 0, 30, dt); // snap back
        if (Math.abs(mo.roam) < 0.01) { mo.roam = 0; mo.roamPh = 0; mo.roamT = (4 + Math.random() * 9) / (0.3 + v.neckRoam); }
      }
    }
    this.roamTw = mo.roam;
    // ---- jerks: long stillness, then a sudden whole-body jerk (jitter channels slammed) and a lurch
    if (v.jerks > 0.01) {
      mo.jerkT -= dt;
      if (mo.jerkT <= 0) {
        mo.jerkT = (1.5 + Math.random() * 6) / (0.3 + v.jerks);
        const a = 0.5 + 0.6 * v.jerks;
        for (let i = 0; i < 8; i++) this.jTgt[i] = this.jCur[i] = (Math.random() * 2 - 1) * a;
        this.jt = 0.12 + Math.random() * 0.25;
        this.jerkHold = 0.35;
        mo.lurch = 0.18 + Math.random() * 0.2;
      }
    }
    if (this.jerkHold > 0) this.jerkHold -= dt;
    // walking: smooth glide broken by lurches (a burst forward, then a dead stop)
    let sm = 1;
    if (mo.lurch > 0) { mo.lurch -= dt; sm = mo.lurch > 0.12 ? 3.2 : 0.05; }
    if (v.stride > 0.01) sm *= 1 + 0.25 * v.stride;
    this.speedMul = sm;
    // ---- breathless, then all at once
    this.gaspK = 0;
    if (v.gasp > 0.01) {
      if (mo.gaspU < 0) {
        mo.gaspT -= dt;
        if (mo.gaspT <= 0) mo.gaspU = 0;
      } else {
        mo.gaspU += dt;
        const u = mo.gaspU;
        // 0.22 s violent inhale, 0.35 s held, 0.6 s collapse
        this.gaspK = u < 0.22 ? smoothstep(0, 0.22, u) : u < 0.57 ? 1 : 1 - smoothstep(0.57, 1.17, u);
        if (u > 1.17) { mo.gaspU = -1; mo.gaspT = (5 + Math.random() * 7) / (0.4 + 0.6 * v.gasp); }
      }
      this.gaspK *= Math.min(1, v.gasp * 1.6);
    }
    // ---- twitch when the player looks (edge-triggered, plus the odd re-twitch while watched)
    if (v.twitch > 0.01) {
      const w = this._watched();
      if ((w && !mo.looked) || (w && Math.random() < dt * 0.15 * v.twitch)) {
        const a = 0.6 + 0.9 * v.twitch;
        for (let i = 0; i < 8; i++) this.jTgt[i] = this.jCur[i] = (Math.random() * 2 - 1) * a;
        this.jt = 0.15 + Math.random() * 0.2;
        this.jerkHold = 0.3;
        mo.twitchT = 0.3;
      }
      mo.looked = w;
    }
    // ---- mouth too wide: opens in uneven snaps
    const gq = v.gape > 0.01 ? Math.min(1, Math.floor(v.gape * 5 + 0.35) / 5) : 0;
    this.gapeK = gq;
    // ---- timelines
    if (mo.timeline === 'headRaise') {
      // chin on the chest, hair hanging; the head rises in stop-motion steps over ~6 s, then a gap opens over one eye
      const dur = mo.opts?.duration ?? 6;
      const from = mo.opts?.from ?? 1.05;
      const k = clamp((mo.t - 0.6) / dur, 0, 1);
      const step = Math.floor(k * 9) / 9; // held steps
      this.setTargets({ headPitch: from * (1 - step) - 0.08 * step }, 14);
      if (mo.t > dur + 1.2) this.setTargets({ veilGap: mo.opts?.eye === 'left' ? -0.9 : 0.9 }, 0.6);
    }
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
  get breath() { return (1 - this.v.still * 0.9) * (1 - clamp(this.v.breathStop, 0, 1)) * (1 - clamp(this.v.gasp * 1.6, 0, 1)); }
  get stillness() { return clamp(Math.max(this.v.still + this.v.stare * 0.5, this.v.gasp * 1.3), 0, 1); }
  get unlimitedLook() { return this.v.unlimited > 0.5 || this.v.neckTwist !== 0; }
  get stare() { return this.v.stare; }
  get noBlink() { return this.v.noBlink > 0.5 || this.v.stare > 0.8; }

  update(dt) {
    this._dt = dt;
    for (const k of KEYS) {
      const s = this.spd[k];
      this.v[k] = s >= 50 ? this.tgt[k] : damp(this.v[k], this.tgt[k], s, dt);
    }
    if (!this.isDouble) this._motion(dt);
    if (!this.isDouble) Object.assign(this.h.ghost, { neckTwist: this.v.neckTwist, headRoll: this.v.headRoll, headPitch: this.v.headPitch, backbend: this.v.backbend, armTwist: this.v.armTwist, jitter: this.v.jitter, levitate: this.v.levitate, mouthStretch: this.v.mouthStretch, limbBreak: this.v.limbBreak, crawl: this.v.crawl, stretch: this.v.stretch });
    // jitter: hold, then snap to a new small offset (irregular timing)
    // a jerk / twitch slams the channels and holds them, then lets go slowly (too smooth after too sudden)
    this.jerkEnv = this.jerkHold > 0 ? 1 : (this.jerkEnv || 0) * Math.exp(-2.5 * dt);
    const j = this.v.jitter;
    this._jAmp = Math.max(j, this.jerkEnv);
    if (this.jerkHold > 0) { /* hold the slammed pose */ } else if (j > 0.01) {
      this.jt -= dt;
      if (this.jt <= 0) {
        this.jt = (0.06 + Math.random() * Math.random() * 0.9) / (0.4 + j);
        const n = Math.random() < 0.35 ? 8 : 3;
        for (let i = 0; i < n; i++) this.jTgt[(Math.random() * 8) | 0] = (Math.random() * 2 - 1) * (Math.random() < 0.15 ? 1 : 0.35);
      }
      const k = 1 - Math.exp(-28 * dt);
      for (let i = 0; i < 8; i++) this.jCur[i] += (this.jTgt[i] - this.jCur[i]) * k;
    } else for (let i = 0; i < 8; i++) this.jCur[i] *= Math.exp(-(this.jerkEnv > 0.02 ? 1.5 : 6) * dt);
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
    // ---- the all-at-once breath: chest heaves, shoulders jump, head tips back, mouth gulps
    const gk = this.gaspK;
    if (gk > 0.001) {
      rig.addEuler(I.spine_01, -0.03 * gk, 0, 0);
      rig.addEuler(I.spine_02, -0.07 * gk, 0, 0);
      rig.addEuler(I.spine_03, -0.1 * gk, 0, 0);
      rig.addEuler(I.clavicle_l, -0.05 * gk, 0, 0.13 * gk);
      rig.addEuler(I.clavicle_r, -0.05 * gk, 0, -0.13 * gk);
      rig.addEuler(I.neck_01, -0.06 * gk, 0, 0);
      rig.addEuler(I.Head, -0.1 * gk, 0, 0);
    }
    // ---- too-long strides (and the backwards walk): over-swing the clip's legs and arms about their rest
    const st = v.stride;
    if (st > 0.01 && h.anim?.moving > 0.05) {
      const f = 1 + 0.75 * st * h.anim.moving;
      for (const x of ['l', 'r']) for (const n of ['thigh_', 'calf_']) {
        const i = I[n + x];
        if (i === undefined) continue;
        const b = rig.bones[i];
        _q.copy(h.t.restQuat[i]).invert().multiply(b.quaternion); // local delta from rest
        if (_q.w < 0) { _q.x = -_q.x; _q.y = -_q.y; _q.z = -_q.z; _q.w = -_q.w; }
        const ang = 2 * Math.acos(Math.min(1, _q.w));
        if (ang < 1e-4) continue;
        const sn = Math.sin(ang / 2);
        _v.set(_q.x / sn, _q.y / sn, _q.z / sn);
        _q.setFromAxisAngle(_v, Math.min(2.6, ang * f));
        b.quaternion.copy(h.t.restQuat[i]).multiply(_q);
      }
    }
    // ---- gliding: legs barely move, toes point down and drag
    const gl = v.glide * (h.walk ? 1 : 0.4);
    if (gl > 0.01) for (const x of ['l', 'r']) { rig.addEuler(I['foot_' + x], 0.55 * gl, 0, 0); rig.addEuler(I['calf_' + x], 0.08 * gl, 0, 0); }
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
    let tw = v.neckTwist + this.lookTwist + this.roamTw;
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
    // (holdTilt: much bigger tilts held for seconds, then the snap; the neck takes part of the roll)
    const ht = v.holdTilt;
    if (v.snapTilts > 0.01 || ht > 0.01) {
      const dt = this._dt || 0.016;
      this.tiltT -= dt;
      if (this.tiltT <= 0) {
        const big = ht > 0.01 && Math.random() < 0.35 + 0.5 * ht;
        this.tiltT = big ? 2 + Math.random() * 5 * ht : 0.35 + Math.random() * 2.2 / (0.5 + v.snapTilts);
        const a = big ? (0.25 + 0.4 * ht) * (Math.random() < 0.5 ? -1 : 1) * (0.7 + 0.3 * Math.random()) : (Math.random() * 2 - 1) * 0.16 * Math.max(v.snapTilts, ht * 0.5);
        this.tilt[0] = a;
        this.tilt[1] = (Math.random() * 2 - 1) * (big ? 0.12 * ht : 0.07 * v.snapTilts);
      }
      // a snap, not an ease: ~3 frames
      const k = 1 - Math.exp(-45 * dt);
      this.tiltS[0] += (this.tilt[0] - this.tiltS[0]) * k;
      this.tiltS[1] += (this.tilt[1] - this.tiltS[1]) * k;
      for (const [i, w] of [[I.neck_01, 0.35], [I.Head, 0.65]]) {
        h.boneFrame(i, _q);
        _v.copy(Z).applyQuaternion(_q); rig.rotateWorld(i, _q2.setFromAxisAngle(_v, this.tiltS[0] * w)); rig.update(i);
        h.boneFrame(i, _q);
        _v.copy(X).applyQuaternion(_q); rig.rotateWorld(i, _q2.setFromAxisAngle(_v, this.tiltS[1] * w)); rig.update(i);
      }
    }
    // ---- elbows a little past straight (measured hinge, so it reads whatever the arm is doing)
    if (v.hyperExt > 0.01) {
      for (const x of ['l', 'r']) {
        const iu = I['upperarm_' + x], il = I['lowerarm_' + x], ih = I['hand_' + x];
        rig.worldPos(iu, _v); rig.worldPos(il, _v2); rig.worldPos(ih, _v3);
        _v3.sub(_v2); _v2.sub(_v); // upper (shoulder->elbow), lower (elbow->wrist)
        const lu = _v2.length(), ll = _v3.length();
        if (lu < 1e-4 || ll < 1e-4) continue;
        _v4.crossVectors(_v2, _v3);
        const sn = _v4.length() / (lu * ll);
        if (sn < 0.03) continue;
        const flex = Math.atan2(sn, _v2.dot(_v3) / (lu * ll));
        _v4.normalize();
        rig.rotateWorld(il, _q2.setFromAxisAngle(_v4, -(flex + 0.22) * clamp(v.hyperExt, 0, 1)));
        rig.update(il);
      }
    }
    // ---- fingers crawl one after another (pinky first), each a beat late, with dead pauses
    if (v.fingerCrawl > 0.01) {
      const fc = v.fingerCrawl, tm = h.time;
      for (const [x, sx, ph0] of [['l', 1, 0], ['r', -1, 1.7]]) {
        _v4.set(0, 0, -sx);
        const gate = smoothstep(-0.2, 0.3, noise.noise2D(tm * 0.23 + ph0, 5.5 + sx)); // crawling .. paused
        ['pinky', 'ring', 'middle', 'index'].forEach((f, n) => {
          const t = tm * 2.1 - n * 0.42 + ph0; // the lag between fingers
          const c = Math.max(0, Math.sin(t * Math.PI)) ** 3 * gate * fc;
          const lift = Math.max(0, Math.sin(t * Math.PI + 0.9)) ** 4 * gate * fc;
          rig.addAxis(I[`${f}_01_${x}`], _v4, -0.35 * lift + 0.25 * c);
          rig.addAxis(I[`${f}_02_${x}`], _v4, 0.9 * c);
          rig.addAxis(I[`${f}_03_${x}`], _v4, 0.7 * c);
        });
      }
    }
    // ---- jitter: snaps on head / neck / shoulders / fingers
    const j = this._jAmp ?? v.jitter;
    if (j > 0.01 && (v.jitter > 0.01 || Math.abs(this.jCur[0]) + Math.abs(this.jCur[1]) > 0.001)) {
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
