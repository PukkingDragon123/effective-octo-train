// Procedural base-layer animation: stance/idle (weight shift, breathing,
// micro-motion), walk / run / sprint / stagger cycles with foot planting
// targets, sit / sitCar / drive / ride / crouch / lie / float / crawl / hang.
// Each mode writes a Pose (angles) plus optional foot targets in rig space.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, noise, damp } from '../core/math.js';
import { Pose } from './IK.js';

const TAU = Math.PI * 2;
const ease = (t) => t * t * (3 - 2 * t);

/** Natural relaxed fingers (authored right side). curl 0..1 extra grip. */
export function fingers(p, curl = 0, spread = 0, side = null) {
  const sides = side ? [side] : ['L', 'R'];
  for (const s of sides) {
    const c = curl;
    p.set('index1' + s, -0.12 - c * 1.25, 0, -spread * 0.1);
    p.set('index2' + s, -0.22 - c * 1.35);
    p.set('middle1' + s, -0.16 - c * 1.3, 0, 0);
    p.set('middle2' + s, -0.28 - c * 1.35);
    p.set('ring1' + s, -0.2 - c * 1.3, 0, spread * 0.06);
    p.set('ring2' + s, -0.32 - c * 1.35);
    p.set('pinky1' + s, -0.24 - c * 1.3, 0, spread * 0.14);
    p.set('pinky2' + s, -0.34 - c * 1.3);
    p.set('thumb1' + s, -0.05 - c * 0.35, -c * 0.2, -c * 0.25);
    p.set('thumb2' + s, -0.12 - c * 0.7);
  }
}

/** Arms hanging naturally (A-pose bind -> down). */
export function armsDown(p, P, out = 0.0, fwd = 0.0) {
  const down = -(1.42 - P.armAngle) + out; // adduct toward the body
  p.sym('clavicle', 0, 0, -0.04);
  p.sym('upperArm', -0.05 - fwd, 0.18, down);
  p.sym('forearm', -0.2, 0.25, 0);
  p.sym('hand', -0.08, 0, 0.06);
}

export class Animator {
  constructor(h) {
    this.h = h;
    this.P = h.P;
    this.mode = 'stand';
    this.prevMode = 'stand';
    this.blend = 1;
    this.blendDur = 0.4;
    this.time = 0;
    this.modeTime = 0;
    this.speed = 0; // m/s along root forward (smoothed)
    this.phase = 0;
    this.gait = 'walk'; // walk | run | sprint | stagger
    this.opts = {};
    this.poseA = new Pose();
    this.poseB = new Pose();
    this.out = new Pose();
    // foot targets in rig space produced by the gait (null = FK)
    this.feet = { L: new THREE.Vector3(), R: new THREE.Vector3(), use: 0, liftL: 0, liftR: 0, pitchL: 0, pitchR: 0 };
    this._feetA = { L: new THREE.Vector3(), R: new THREE.Vector3(), use: 0, pitchL: 0, pitchR: 0 };
    this._feetB = { L: new THREE.Vector3(), R: new THREE.Vector3(), use: 0, pitchL: 0, pitchR: 0 };
    this.breath = Math.random() * 10;
    this.shift = Math.random() * 10;
    this.posture = clamp(this.P.old * 1.1, 0, 1); // elderly stoop
    this.nervous = 0;
    this.drunk = 0;
    this.footstep = null; // callback(side)
    this._lastPlant = { L: true, R: true };
  }

  setMode(mode, opts = {}) {
    if (mode === 'idle') mode = 'stand';
    if (mode === this.mode && !opts.force) { Object.assign(this.opts, opts); return; }
    this.prevMode = this.mode;
    this.mode = mode;
    this.opts = { ...opts };
    this.blend = 0;
    this.blendDur = opts.blend ?? 0.45;
    this.modeTime = 0;
    if (mode === 'run') this.gait = 'run';
    else if (mode === 'walk') this.gait = opts.gait || 'walk';
  }

  /** Evaluate the base pose for mode m into pose p and feet f. */
  evalMode(m, p, f, dt) {
    p.clear();
    f.use = 0;
    const P = this.P;
    const t = this.time;
    switch (m) {
      case 'walk':
      case 'run':
        this.gaitPose(p, f, m === 'run' ? (this.gait === 'sprint' ? 'sprint' : 'run') : this.gait);
        break;
      case 'sit': this.sitPose(p, f, false); break;
      case 'sitCar': this.sitPose(p, f, true); break;
      case 'drive': this.sitPose(p, f, true, true); break;
      case 'ride': this.ridePose(p, f); break;
      case 'crouch': this.crouchPose(p, f); break;
      case 'lie': this.liePose(p, f); break;
      case 'float': this.floatPose(p, f); break;
      case 'crawl': this.crawlPose(p, f); break;
      case 'hang': this.hangPose(p, f); break;
      case 'ceiling': this.crawlPose(p, f, true); break;
      case 'sprint': this.gaitPose(p, f, 'sprint'); break;
      default: this.standPose(p, f);
    }
    // breathing on everything (chest + shoulders), stronger when nervous
    const br = Math.sin(this.breath);
    const amp = 0.012 * (1 + this.nervous * 1.2) * (m === 'lie' ? 0.6 : 1);
    p.add('chest', -br * amp * 0.6, 0, 0);
    p.add('spine', br * amp * 0.5, 0, 0);
    p.addSym('clavicle', 0, 0, br * amp * 0.7);
    p.add('neck', br * amp * 0.25, 0, 0);
    void t; void P; void dt;
  }

  update(dt) {
    this.time += dt;
    this.modeTime += dt;
    const breathRate = (m) => (m === 'run' || m === 'crawl' ? 2.6 : m === 'walk' ? 1.6 : 1.15) * (1 + this.nervous * 0.8);
    this.breath += dt * TAU * 0.24 * breathRate(this.mode);
    this.shift += dt * 0.11;
    // gait phase
    if (this.mode === 'walk' || this.mode === 'run' || this.mode === 'crawl' || this.mode === 'ceiling' || this.mode === 'sprint') {
      const v = Math.max(this.speed, this.opts.speed ?? 0);
      const g = this.gaitParams(this.mode === 'run' ? (this.gait === 'sprint' ? 'sprint' : 'run') : this.gait);
      const stride = g.stride * (0.55 + 0.45 * clamp(v / g.speed, 0, 1.6));
      const prev = this.phase;
      this.phase = (this.phase + (Math.max(0.25, v) / stride) * dt) % 1;
      // footstep events at heel strike (phase 0 for R, 0.5 for L)
      if (this.footstep) {
        if (prev > this.phase) this.footstep('R');
        if (prev < 0.5 && this.phase >= 0.5) this.footstep('L');
      }
    }
    this.blend = Math.min(1, this.blend + dt / Math.max(0.01, this.blendDur));
    const k = ease(this.blend);
    if (k < 1) {
      this.evalMode(this.prevMode, this.poseA, this._feetA, dt);
      this.evalMode(this.mode, this.poseB, this._feetB, dt);
      this.out.copy(this.poseA).lerp(this.poseB, k);
      const f = this.feet;
      f.use = lerp(this._feetA.use, this._feetB.use, k);
      f.L.copy(this._feetA.use ? this._feetA.L : this._feetB.L).lerp(this._feetB.use ? this._feetB.L : this._feetA.L, k);
      f.R.copy(this._feetA.use ? this._feetA.R : this._feetB.R).lerp(this._feetB.use ? this._feetB.R : this._feetA.R, k);
      f.pitchL = lerp(this._feetA.pitchL || 0, this._feetB.pitchL || 0, k);
      f.pitchR = lerp(this._feetA.pitchR || 0, this._feetB.pitchR || 0, k);
    } else {
      this.evalMode(this.mode, this.out, this.feet, dt);
    }
    return this.out;
  }

  // -------------------------------------------------------------------------
  standPose(p, f) {
    const P = this.P;
    const t = this.time;
    const post = this.posture;
    // slow weight shift between legs + micro sway
    const ws = Math.sin(this.shift * TAU) * 0.6 + Math.sin(this.shift * TAU * 2.3 + 1) * 0.25;
    const sway = noise.noise2D(t * 0.23, 3.1) * 0.5;
    p.hips.set(ws * 0.018 * (P.H / 1.7), -0.006 - post * 0.035 - Math.abs(ws) * 0.004, 0.004 * post);
    p.set('hips', 0.02 - post * 0.06, ws * 0.03, -ws * 0.035);
    p.set('spine', 0.03 - post * 0.12 + sway * 0.01, -ws * 0.02, ws * 0.03);
    p.set('chest', -0.03 - post * 0.22, -ws * 0.015, ws * 0.015 + sway * 0.01);
    p.set('neck', 0.05 + post * 0.2, 0, -ws * 0.02);
    p.set('head', 0.02 + post * 0.12 + noise.noise2D(t * 0.31, 7.7) * 0.025, noise.noise2D(t * 0.17, 1.3) * 0.05, noise.noise2D(t * 0.2, 4.4) * 0.03);
    armsDown(p, P, 0.04 + post * 0.05, post * 0.25);
    p.add('forearmL', -post * 0.25, 0, 0);
    p.add('forearmR', -post * 0.25, 0, 0);
    fingers(p, 0.05 + post * 0.15);
    // legs: feet planted (IK), slight knee unlock on the unloaded leg
    f.use = 1;
    const Lf = this.h.layout;
    for (const s of ['L', 'R']) {
      const a = Lf['foot' + s].pos;
      const load = s === 'R' ? ws : -ws;
      f[s].set(a[0] * (1 + post * 0.15), a[1] + Math.max(0, -load) * 0.004, a[2] + (s === 'L' ? 0.02 : -0.01) * (P.H / 1.7));
      f['pitch' + s] = 0;
    }
  }

  gaitParams(g) {
    const s = this.P.H / 1.7;
    switch (g) {
      case 'run': return { speed: 3.4, stride: 2.3 * s, stance: 0.36, lift: 0.16 * s, bob: 0.03, arm: 0.75, lean: 0.18, elbow: 1.35 };
      case 'sprint': return { speed: 7.5, stride: 3.6 * s, stance: 0.3, lift: 0.22 * s, bob: 0.025, arm: 0.95, lean: 0.4, elbow: 0.4 };
      case 'stagger': return { speed: 0.8, stride: 0.95 * s, stance: 0.66, lift: 0.06 * s, bob: 0.02, arm: 0.35, lean: 0.06, elbow: 0.3 };
      default: return { speed: 1.25, stride: 1.38 * s * (1 - this.posture * 0.25), stance: 0.6, lift: 0.085 * s, bob: 0.018, arm: 0.42, lean: 0.04, elbow: 0.25 };
    }
  }

  gaitPose(p, f, g) {
    const P = this.P;
    const G = this.gaitParams(g);
    const ph = this.phase;
    const v = Math.max(this.speed, this.opts.speed ?? 0);
    const amt = clamp(v / G.speed, 0.35, 1.3);
    const stride = G.stride * (0.55 + 0.45 * clamp(v / G.speed, 0, 1.6));
    const post = this.posture;
    const Lf = this.h.layout;
    const s = P.H / 1.7;
    f.use = 1;
    let pelvisYaw = 0, pelvisRoll = 0;
    for (const side of ['R', 'L']) {
      const lp = (ph + (side === 'L' ? 0.5 : 0)) % 1;
      const st = G.stance;
      const half = (stride * st) / 2;
      const a = Lf['foot' + side].pos;
      let z, y = 0, pitch = 0;
      if (lp < st) {
        const u = lp / st;
        z = -half + stride * st * u;
        // heel strike -> flat -> heel rise before toe-off
        pitch = (u < 0.15 ? (0.15 - u) / 0.15 * 0.3 : 0) - smoothstep(0.7, 1, u) * 0.45;
        y = smoothstep(0.7, 1, u) * 0.03 * s;
      } else {
        const u = (lp - st) / (1 - st);
        z = half - stride * st * ease(u);
        y = Math.pow(Math.sin(Math.PI * u), 0.8) * G.lift * (0.6 + 0.4 * amt) + (1 - u) * 0.02 * s;
        pitch = lerp(-0.6, 0.25, ease(u));
      }
      // stagger: feet cross / wander
      let x = a[0];
      if (g === 'stagger') x += noise.noise2D(this.time * 0.9 + (side === 'L' ? 10 : 0), 2) * 0.08 * s;
      if (g === 'sprint') x *= 1.35;
      f[side].set(x, a[1] + y, a[2] + z);
      f['pitch' + side] = pitch;
      if (side === 'R') pelvisYaw = (z / Math.max(0.01, half)) * 0.08 * amt;
    }
    const ph2 = ph * TAU;
    // hips: double bob, sway over the stance leg, rotation
    const bob = (Math.cos(ph2 * 2) * 0.5 + 0.5) * G.bob * amt;
    const swayX = Math.sin(ph2) * 0.022 * s * (g === 'stagger' ? 3 : 1);
    pelvisRoll = Math.sin(ph2) * 0.05;
    const crouch = g === 'run' ? 0.04 : g === 'sprint' ? 0.09 : 0.012 + post * 0.04;
    p.hips.set(swayX, -bob - crouch * s, 0);
    p.set('hips', -G.lean * 0.3 - post * 0.06, -pelvisYaw, pelvisRoll);
    p.set('spine', -G.lean * 0.3 - post * 0.12, pelvisYaw * 0.5, -pelvisRoll * 0.4);
    p.set('chest', -G.lean * 0.4 - post * 0.2, pelvisYaw * 0.9, -pelvisRoll * 0.4);
    p.set('neck', G.lean * 0.4 + post * 0.18, -pelvisYaw * 0.5, 0);
    p.set('head', G.lean * 0.45 + post * 0.1 + Math.cos(ph2 * 2) * 0.012, -pelvisYaw * 0.4, pelvisRoll * 0.2);
    // arms swing opposite to legs
    armsDown(p, P, 0.06 + (g === 'sprint' ? 0.1 : 0), 0);
    const sw = Math.sin(ph2) * G.arm * amt;
    if (g === 'sprint') {
      // Yai Speed: arms stiff and pumping out of sync, flung backward, palms open
      const wrong = Math.sin(ph2 * 1.0 + 1.9);
      p.set('upperArmR', -0.1 + wrong * 0.9, 0.5, -0.55);
      p.set('upperArmL', -0.1 - Math.sin(ph2 * 1.0 + 0.7) * 0.85, 0.5, -0.55);
      p.sym('forearm', -0.25, 0.9, 0);
      p.sym('hand', 0.5, 0, 0.2);
      fingers(p, -0.15, 0.6);
    } else {
      p.add('upperArmR', sw, 0, 0);
      p.add('upperArmL', -sw, 0, 0);
      p.add('forearmR', -G.elbow * (0.6 + 0.4 * Math.max(0, -Math.sin(ph2))), 0, 0);
      p.add('forearmL', -G.elbow * (0.6 + 0.4 * Math.max(0, Math.sin(ph2))), 0, 0);
      fingers(p, g === 'run' ? 0.45 : 0.08);
    }
    if (g === 'stagger') {
      p.add('head', noise.noise2D(this.time * 0.7, 9) * 0.25, noise.noise2D(this.time * 0.5, 3) * 0.3, noise.noise2D(this.time * 0.6, 5) * 0.3);
      p.add('spine', 0, 0, noise.noise2D(this.time * 0.4, 1) * 0.12);
    }
  }

  sitPose(p, f, car, drive = false) {
    const P = this.P;
    const t = this.time;
    const post = this.posture;
    const recline = car ? 0.22 : 0.05;
    p.hips.set(0, 0, 0);
    p.set('hips', recline * 0.6, 0, 0);
    p.set('spine', -0.04 - post * 0.08 + recline * 0.1, 0, 0);
    p.set('chest', -0.04 - post * 0.16 - (drive ? 0.06 : 0), 0, 0);
    p.set('neck', 0.04 + post * 0.15 - recline * 0.3, 0, 0);
    p.set('head', -0.05 + post * 0.1 - recline * 0.2 + noise.noise2D(t * 0.3, 2) * 0.02, noise.noise2D(t * 0.15, 5) * 0.06, 0);
    // thighs forward, shins down, slightly apart
    const kneeOut = car ? 0.1 : 0.06;
    p.sym('thigh', -1.42 - recline * 0.6, 0.0, kneeOut);
    p.sym('shin', car ? 1.25 : 1.45, 0, 0);
    p.sym('foot', car ? 0.15 : 0.05, 0, 0);
    // hands resting on the thighs
    p.sym('clavicle', 0, 0, -0.05);
    p.sym('upperArm', -0.28, 0.25, -(1.42 - P.armAngle) + 0.12);
    p.sym('forearm', -0.95, 0.85, 0);
    p.sym('hand', 0.18, 0, 0.1);
    fingers(p, 0.12);
    f.use = 0;
  }

  ridePose(p, f) {
    const P = this.P;
    p.set('hips', 0.1, 0, 0);
    p.set('spine', -0.08, 0, 0);
    p.set('chest', -0.12, 0, 0);
    p.set('neck', 0.12, 0, 0);
    p.set('head', 0.08, 0, 0);
    p.sym('thigh', -1.25, -0.15, 0.32);
    p.sym('shin', 1.35, 0, 0);
    p.sym('foot', 0.2, 0, 0);
    p.sym('upperArm', -0.85, 0.2, -(1.42 - P.armAngle) + 0.35);
    p.sym('forearm', -0.6, 0.6, 0);
    fingers(p, 0.7);
    f.use = 0;
  }

  crouchPose(p, f) {
    const P = this.P;
    const s = P.H / 1.7;
    // Thai-style deep squat, heels down, forearms on the knees
    p.hips.set(0, -0.48 * s, 0.12 * s);
    p.set('hips', -0.3, 0, 0);
    p.set('spine', -0.25, 0, 0);
    p.set('chest', -0.15, 0, 0);
    p.set('neck', 0.25, 0, 0);
    p.set('head', 0.2, 0, 0);
    p.sym('upperArm', -0.9, 0.2, -(1.42 - P.armAngle) + 0.3);
    p.sym('forearm', -0.7, 0.5, 0);
    p.sym('hand', 0.3, 0, 0);
    fingers(p, 0.2);
    f.use = 1;
    for (const sd of ['L', 'R']) {
      const a = this.h.layout['foot' + sd].pos;
      f[sd].set(a[0] * 1.6, a[1], a[2] - 0.02);
      f['pitch' + sd] = 0;
    }
  }

  liePose(p, f) {
    const P = this.P;
    // lying on the back: root handles the 90 deg roll; here a relaxed supine pose
    p.hips.set(0, 0, 0);
    p.set('hips', 0, 0, 0);
    p.set('neck', -0.15, 0, 0);
    p.set('head', -0.1, 0.25, 0);
    p.sym('upperArm', 0, 0.3, -(1.42 - P.armAngle) + 0.25);
    p.sym('forearm', -0.25, 0.4, 0);
    p.sym('foot', 0.35, 0, 0.1);
    p.sym('thigh', -0.05, 0.12, 0.04);
    p.sym('shin', 0.08, 0, 0);
    fingers(p, 0.2);
    f.use = 0;
  }

  floatPose(p, f) {
    const P = this.P;
    const t = this.time;
    const bob = Math.sin(t * 1.3) * 0.03;
    p.hips.set(0, 0.25 + bob, 0);
    p.set('hips', 0.02, 0, Math.sin(t * 0.7) * 0.02);
    p.set('spine', 0.02, 0, 0);
    p.set('chest', -0.03, 0, 0);
    p.set('neck', -0.05, 0, 0);
    p.set('head', -0.08 + Math.sin(t * 0.9) * 0.03, 0, Math.sin(t * 0.5) * 0.05);
    armsDown(p, P, 0.18, -0.05);
    p.add('forearmL', 0.1, 0, 0); p.add('forearmR', 0.1, 0, 0);
    fingers(p, -0.05, 0.3);
    // legs dangling, toes pointed down
    p.sym('thigh', -0.08 + Math.sin(t * 1.1) * 0.03, 0.05, 0.02);
    p.sym('shin', 0.18 + Math.sin(t * 1.1 + 0.6) * 0.04, 0, 0);
    p.sym('foot', -0.85, 0, 0);
    p.sym('toe', -0.25, 0, 0);
    f.use = 0;
  }

  crawlPose(p, f, ceiling = false) {
    const P = this.P;
    const t = this.time;
    const ph = (this.phase + (this.speed > 0.05 ? 0 : 0)) * TAU;
    const s = P.H / 1.7;
    // on hands and knees (spidery when ceiling): torso horizontal
    p.hips.set(0, -0.42 * s, 0.05);
    p.set('hips', -1.45, 0, Math.sin(ph) * 0.06);
    p.set('spine', 0.08, Math.sin(ph) * 0.08, 0);
    p.set('chest', 0.06, Math.sin(ph) * 0.1, 0);
    p.set('neck', 0.6, 0, 0);
    p.set('head', 0.55 + (ceiling ? 0.3 : 0), 0, 0);
    const reachR = Math.sin(ph) * 0.35, reachL = Math.sin(ph + Math.PI) * 0.35;
    p.set('clavicleR', 0, 0, 0.1);
    p.set('clavicleL', 0, 0, 0.1);
    p.set('upperArmR', -1.2 - reachR, 0.3, -(1.42 - P.armAngle) + 0.3);
    p.set('upperArmL', -1.2 - reachL, 0.3, -(1.42 - P.armAngle) + 0.3);
    p.sym('forearm', -0.2, 0.4, 0);
    p.sym('hand', 0.9, 0, 0);
    fingers(p, 0.1, 0.5);
    p.set('thighR', -0.15 + reachL * 0.5, 0, 0.2);
    p.set('thighL', -0.15 + reachR * 0.5, 0, 0.2);
    p.sym('shin', 1.55, 0, 0);
    p.sym('foot', -0.6, 0, 0);
    f.use = 0;
    void t;
  }

  hangPose(p, f) {
    const P = this.P;
    const t = this.time;
    p.hips.set(0, 0.05, 0);
    p.set('hips', 0.0, Math.sin(t * 0.4) * 0.05, 0);
    p.set('spine', -0.04, 0, 0);
    p.set('chest', -0.06, 0, 0.02);
    p.set('neck', -0.35, 0, 0.45);
    p.set('head', -0.3, 0.1, 0.3);
    armsDown(p, P, 0.02, 0.0);
    p.sym('forearm', -0.05, 0.1, 0);
    fingers(p, 0.25);
    p.sym('thigh', 0.02, 0, 0.0);
    p.sym('shin', 0.05, 0, 0);
    p.sym('foot', -0.9, 0, 0);
    f.use = 0;
  }
}

export { damp };
