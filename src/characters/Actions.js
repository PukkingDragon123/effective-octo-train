// Procedural action clips layered over the base pose. Each clip modifies a copy
// of the current pose (masked blend with fade in/out) and may drive hand IK
// targets (rig space), the gaze, the face and ghost values.
//   play(name, opts) -> Promise (resolves at the end; loops resolve on stop)
import * as THREE from 'three';
import { clamp, lerp, smoothstep, noise, easeInOut } from '../core/math.js';
import { BONE_DEFS, BONE_COUNT, BONE_INDEX as BI } from './Rig.js';
import { Pose } from './IK.js';
import { fingers } from './ProcAnim.js';
import { bus } from '../core/Events.js';

const TAU = Math.PI * 2;
const env = (t, a, b, c, d) => (t < a ? 0 : t < b ? easeInOut((t - a) / (b - a)) : t < c ? 1 : t < d ? 1 - easeInOut((t - c) / (d - c)) : 0);
const osc = (t, f, ph = 0) => Math.sin(t * TAU * f + ph);

// masks
const mask = (pred) => Float32Array.from(BONE_DEFS.map(([n]) => (pred(n) ? 1 : 0)));
const M = {
  all: mask(() => true),
  armR: mask((n) => /R$/.test(n) && !/thigh|shin|foot|toe|eye/.test(n)),
  armL: mask((n) => /L$/.test(n) && !/thigh|shin|foot|toe|eye/.test(n)),
  arms: mask((n) => /(clavicle|upperArm|forearm|hand|thumb|index|middle|ring|pinky)/.test(n)),
  upper: mask((n) => !/thigh|shin|foot|toe/.test(n)),
  head: mask((n) => /neck|head|jaw/.test(n)),
  headArms: mask((n) => /neck|head|jaw|clavicle|upperArm|forearm|hand|thumb|index|middle|ring|pinky/.test(n)),
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();

/** Rig-space hand target helper: position relative to a bone + orientation from euler (target convention). */
function handAt(h, bone, off, rot, out) {
  const rig = h.rig;
  const s = h.P.H / 1.7;
  out.pos.set(off[0] * s, off[1] * s, off[2] * s).applyQuaternion(rig.rq[BI[bone]]).add(rig.rp[BI[bone]]);
  _e.set(rot[0], rot[1], rot[2], 'YXZ');
  out.quat.setFromEuler(_e);
  return out;
}

const DEFS = {
  // ---------------------------------------------------------------- social
  hail: {
    // Thai taxi hail: arm out low and forward, palm DOWN, fingers flapping (beckoning downward)
    loop: true, dur: 2, mask: M.armR, fade: 0.35,
    pose(c, p) {
      const f = 0.5 + 0.5 * osc(c.t, 2.1);
      p.set('handR', -0.15 - f * 0.45, 0, 0);
      for (const n of ['index', 'middle', 'ring', 'pinky']) {
        p.set(n + '1R', -0.15 - f * 0.9, 0, 0);
        p.set(n + '2R', -0.2 - f * 0.8, 0, 0);
      }
      p.set('thumb1R', -0.1, 0, 0.1); p.set('thumb2R', -0.2, 0, 0);
      p.add('chest', 0, 0.08, 0);
      p.add('head', 0, -0.05, 0);
    },
    ik(c) {
      return { R: handAt(c.h, 'chest', [0.32, -0.17, -0.42], [0, -0.4, 0], c.tmp.R), wR: 1 };
    },
  },
  wave: {
    loop: true, dur: 1.6, mask: M.armR,
    pose(c, p) {
      p.set('clavicleR', 0, 0, 0.15);
      p.set('upperArmR', -0.35, 0.3, 1.25);
      p.set('forearmR', -1.6 + osc(c.t, 1.6) * 0.25, 0.9, 0);
      p.set('handR', 0, 0, osc(c.t, 1.6) * 0.3);
      fingers(p, 0, 0.4, 'R');
    },
  },
  wai: {
    // palms together at the chest, fingertips up, slight bow; respectful and slow
    dur: 2.6, mask: M.upper, fade: 0.01,
    pose(c, p) {
      const e = env(c.t, 0, 0.6, 1.9, 2.6);
      const bow = env(c.t, 0.5, 1.0, 1.6, 2.2);
      p.add('spine', -0.12 * bow * e, 0, 0);
      p.add('chest', -0.14 * bow * e, 0, 0);
      p.add('neck', -0.2 * bow * e, 0, 0);
      p.add('head', -0.25 * bow * e, 0, 0);
      for (const s of ['L', 'R']) {
        for (const n of ['index', 'middle', 'ring', 'pinky']) { p.set(n + '1' + s, -0.05, 0, 0); p.set(n + '2' + s, -0.08, 0, 0); }
        p.set('thumb1' + s, -0.1, 0, 0.15); p.set('thumb2' + s, -0.05, 0, 0);
      }
      c.weight = e;
    },
    ik(c) {
      const out = c.tmp;
      handAt(c.h, 'chest', [0.012, 0.13, -0.2], [0, 0, -Math.PI / 2], out.R);
      handAt(c.h, 'chest', [-0.012, 0.13, -0.2], [0, 0, Math.PI / 2], out.L);
      // fingertips up: rotate the palm-down convention so fingers point up and palms face inward
      _q.setFromEuler(_e.set(Math.PI / 2 - 0.15, 0, 0, 'XYZ'));
      out.R.quat.multiply(_q);
      out.L.quat.multiply(_q);
      return { R: out.R, L: out.L, wR: c.weight, wL: c.weight };
    },
  },
  pray: {
    loop: true, dur: 4, mask: M.upper,
    pose(c, p) {
      DEFS.wai.pose({ ...c, t: 1.2 }, p);
      c.weight = 1;
      c.h._eyesClosed = 1;
    },
    ik(c) { return DEFS.wai.ik({ ...c, weight: 1 }); },
    end(c) { c.h._eyesClosed = 0; },
  },
  nod: {
    dur: 1.1, mask: M.head,
    pose(c, p) { const e = env(c.t, 0, 0.15, 0.9, 1.1); p.add('head', -Math.abs(osc(c.t, 1.8)) * 0.28 * e, 0, 0); p.add('neck', -Math.abs(osc(c.t, 1.8)) * 0.1 * e, 0, 0); },
  },
  shakeHead: {
    dur: 1.3, mask: M.head,
    pose(c, p) { const e = env(c.t, 0, 0.15, 1.1, 1.3); p.add('head', 0, osc(c.t, 2.2) * 0.35 * e, 0); p.add('neck', 0, osc(c.t, 2.2, -0.3) * 0.12 * e, 0); },
  },
  laugh: {
    dur: 2.4, mask: M.upper,
    pose(c, p) {
      const e = env(c.t, 0, 0.2, 2.0, 2.4);
      const sh = Math.max(0, osc(c.t, 4.5)) * e;
      p.add('chest', 0.06 * e - sh * 0.04, 0, 0);
      p.addSym('clavicle', 0, 0, sh * 0.1);
      p.add('neck', 0.1 * e, 0, 0);
      p.add('head', 0.18 * e + sh * 0.05, 0.1 * e, 0.05 * e);
      c.expr = { smile: e };
      c.jaw = sh * 0.6;
    },
  },
  cry: {
    loop: true, dur: 3, mask: M.upper,
    pose(c, p) {
      const sob = Math.max(0, osc(c.t, 1.3)) * 0.5 + Math.max(0, osc(c.t, 3.1)) * 0.2;
      p.add('chest', -0.2 - sob * 0.05, 0, 0);
      p.add('neck', -0.25, 0, 0);
      p.add('head', -0.3 + sob * 0.04, 0, 0.05);
      p.addSym('clavicle', 0, 0, 0.06 + sob * 0.08);
      c.expr = { sad: 1 };
    },
    ik(c) {
      const out = c.tmp;
      handAt(c.h, 'head', [0.035, 0.05, -0.1], [Math.PI / 2 + 0.4, 0, 0.3], out.R);
      handAt(c.h, 'head', [-0.035, 0.05, -0.1], [Math.PI / 2 + 0.4, 0, -0.3], out.L);
      return { R: out.R, L: out.L, wR: 1, wL: 1 };
    },
  },
  point: {
    dur: 2.2, mask: M.armR,
    pose(c, p) {
      const e = env(c.t, 0, 0.4, 1.8, 2.2);
      c.weight = e;
      p.set('index1R', 0.05, 0, 0); p.set('index2R', 0.02, 0, 0);
      for (const n of ['middle', 'ring', 'pinky']) { p.set(n + '1R', -1.4, 0, 0); p.set(n + '2R', -1.5, 0, 0); }
      p.set('thumb1R', -0.4, 0, -0.3); p.set('thumb2R', -0.6, 0, 0);
    },
    ik(c) {
      const h = c.h, out = c.tmp.R;
      const rig = h.rig;
      const sh = rig.rp[BI.upperArmR];
      if (c.opts.target) {
        h._targetWorld(c.opts.target, _v);
        h.toRig(_v, _v2).sub(sh).normalize();
      } else _v2.set(0.3, 0.1, -1).normalize();
      out.pos.copy(sh).addScaledVector(_v2, (h.P.upperArmLen + h.P.forearmLen) * 0.98 + 0.08);
      _q.setFromUnitVectors(_v.set(0, 0, -1), _v2);
      out.quat.copy(_q);
      return { R: out, wR: c.weight };
    },
  },
  giveItem: {
    dur: 2.0, mask: M.armR,
    pose(c, p) { c.weight = env(c.t, 0, 0.5, 1.4, 2.0); fingers(p, 0.25, 0, 'R'); p.add('chest', -0.06 * c.weight, 0.1 * c.weight, 0); },
    ik(c) { return { R: handAt(c.h, 'chest', [0.12, -0.12, -0.45], [0, 0, Math.PI * 0.9], c.tmp.R), wR: c.weight }; },
  },
  takeItem: {
    dur: 2.0, mask: M.armR,
    pose(c, p) { c.weight = env(c.t, 0, 0.6, 1.2, 2.0); fingers(p, c.t > 0.9 ? 0.7 : 0.05, 0.2, 'R'); p.add('chest', -0.08 * c.weight, 0.1 * c.weight, 0); },
    ik(c) { return { R: handAt(c.h, 'chest', [0.12, -0.1, -0.48], [0, 0, Math.PI * 0.85], c.tmp.R), wR: c.weight }; },
  },
  pay: {
    dur: 2.6, mask: M.armR,
    pose(c, p) { c.weight = env(c.t, 0, 0.6, 2.0, 2.6); fingers(p, 0.35, 0, 'R'); },
    ik(c) { return { R: handAt(c.h, 'chest', [0.1, -0.08, -0.42], [0, 0.2, Math.PI * 0.95], c.tmp.R), wR: c.weight }; },
  },
  smoke: {
    // hand to the mouth, inhale, lower, exhale smoke
    loop: true, dur: 7, mask: M.armR,
    pose(c, p) {
      const e = env(c.t, 0.2, 1.1, 2.6, 3.5);
      c.weight = e;
      const inhale = env(c.t, 1.2, 1.6, 2.4, 2.7);
      p.add('chest', 0.04 * inhale, 0, 0);
      p.addSym('clavicle', 0, 0, 0.05 * inhale);
      p.add('head', 0.05 * e, -0.05 * e, 0);
      // exhale: head tilts up slightly, lips part
      const ex = env(c.t, 3.4, 3.8, 4.6, 5.4);
      p.add('head', 0.12 * ex, 0, 0);
      c.jaw = ex * 0.12;
      if (c.t > 3.6 && !c.puffed) { c.puffed = true; c.h.onSmokePuff?.(c.h); bus.emit('character:smoke', { id: c.h.spec.id, position: c.h.headPosition.clone() }); }
      if (c.t < 1) c.puffed = false;
      p.set('index1R', -0.2, 0, -0.1); p.set('index2R', -0.25, 0, 0);
      p.set('middle1R', -0.2, 0, 0.05); p.set('middle2R', -0.3, 0, 0);
    },
    ik(c) {
      const out = c.tmp.R;
      handAt(c.h, 'head', [0.012, -0.03, -0.12], [0.2, 0.9, -1.1], out);
      return { R: out, wR: c.weight };
    },
  },
  sing: {
    loop: true, dur: 4, mask: M.upper,
    pose(c, p) {
      const sw = osc(c.t, 0.5);
      p.add('spine', 0, 0, sw * 0.05);
      p.add('chest', 0.04, sw * 0.08, sw * 0.04);
      p.add('head', 0.1 + osc(c.t, 1, 1) * 0.05, -sw * 0.12, sw * 0.1);
      // free arm sways like holding a microphone
      p.set('upperArmL', -0.7, 0.3, -(1.42 - c.h.P.armAngle) + 0.25 + sw * 0.1);
      p.set('forearmL', -1.7, 0.6, 0);
      fingers(p, 0.75, 0, 'L');
      c.talk = 1;
      c.expr = { smile: 0.5 + 0.3 * sw };
    },
  },
  knock: {
    dur: 2.4, mask: M.armR,
    pose(c, p) { c.weight = env(c.t, 0, 0.4, 1.9, 2.4); fingers(p, 0.95, 0, 'R'); },
    ik(c) {
      const h = c.h, out = c.tmp.R;
      const k = [0.8, 1.15, 1.5].map((t) => Math.exp(-Math.pow((c.t - t) * 18, 2)));
      const kn = k[0] + k[1] + k[2];
      for (let i = 0; i < 3; i++) if (!c['k' + i] && c.t > [0.8, 1.15, 1.5][i]) { c['k' + i] = true; c.opts.onKnock?.(i); bus.emit('character:knock', { id: h.spec.id, i }); }
      if (c.opts.target) { h._targetWorld(c.opts.target, _v); h.toRig(_v, out.pos); }
      else handAt(h, 'chest', [0.15, 0.05, -0.45], [0, 0, 0], out);
      _v.set(0, 0, 0.06 * (1 - kn)).applyQuaternion(h.rig.rq[BI.chest]);
      out.pos.add(_v);
      out.quat.setFromEuler(_e.set(0, 0, Math.PI / 2, 'YXZ'));
      return { R: out, wR: c.weight };
    },
  },
  reachOut: {
    dur: 3, mask: M.armR,
    pose(c, p) { c.weight = env(c.t, 0, 1.6, 2.4, 3); fingers(p, -0.1, 0.6, 'R'); },
    ik(c) {
      const h = c.h, out = c.tmp.R;
      const sh = h.rig.rp[BI.upperArmR];
      if (c.opts.target) { h._targetWorld(c.opts.target, _v); h.toRig(_v, _v2).sub(sh).normalize(); } else _v2.set(0.15, 0.05, -1).normalize();
      out.pos.copy(sh).addScaledVector(_v2, (h.P.upperArmLen + h.P.forearmLen) * 1.05);
      out.quat.setFromUnitVectors(_v.set(0, 0, -1), _v2);
      return { R: out, wR: c.weight };
    },
  },
  lookAround: {
    dur: 4, mask: M.head,
    pose(c, p) {
      const e = env(c.t, 0, 0.4, 3.6, 4);
      const yaw = (c.t < 1.3 ? 0.9 : c.t < 2.6 ? -0.9 : 0.2) * e;
      c.ly = lerp(c.ly ?? 0, yaw, 0.08);
      p.add('neck', 0, c.ly * 0.4, 0);
      p.add('head', 0.04 * e, c.ly * 0.6, 0);
      p.add('chest', 0, c.ly * 0.15, 0);
    },
  },
  shiver: {
    loop: true, dur: 3, mask: M.upper,
    pose(c, p) {
      const n = (k) => noise.noise2D(c.t * 22, k) * 0.03;
      p.addSym('clavicle', 0, 0, 0.12);
      p.add('chest', -0.1 + n(1), n(2), 0);
      p.add('head', -0.1 + n(3), n(4), 0);
      p.set('upperArmR', -0.55, 0.4, -(1.42 - c.h.P.armAngle) + 0.1 + n(5));
      p.set('upperArmL', -0.55, 0.4, -(1.42 - c.h.P.armAngle) + 0.1 + n(6));
      p.sym('forearm', -1.9, 0.9, 0);
      p.sym('hand', 0.2, 0, 0);
      c.expr = { fear: 0.6 };
      c.jaw = 0.04 + Math.abs(n(7)) * 2;
    },
  },
  sleep: {
    loop: true, dur: 5, mask: M.head,
    pose(c, p) {
      const br = osc(c.t, 0.18);
      p.add('neck', -0.45 + br * 0.03, 0.15, 0.25);
      p.add('head', -0.25, 0.1, 0.2);
      c.h._eyesClosed = 1;
      c.jaw = 0.1 + Math.max(0, br) * 0.08;
    },
    end(c) { c.h._eyesClosed = 0; },
  },
  stagger: {
    loop: true, dur: 4, mask: M.head,
    start(c) { c.h.anim.gait = 'stagger'; c.h.anim.drunk = 1; if (c.h.anim.mode === 'stand') c.h.setMode('walk', { gait: 'stagger', speed: 0.6 }); },
    pose(c, p) { p.add('head', noise.noise2D(c.t * 0.5, 1) * 0.15, noise.noise2D(c.t * 0.4, 2) * 0.2, noise.noise2D(c.t * 0.45, 3) * 0.25); },
    end(c) { c.h.anim.gait = 'walk'; c.h.anim.drunk = 0; },
  },
  // ---------------------------------------------------------------- transitions
  sitDown: {
    dur: 1.4, mask: M.all,
    start(c) { c.h.setMode(c.opts.pose || 'sit', { blend: 1.2 }); },
    pose(c, p) { const e = env(c.t, 0, 0.5, 0.8, 1.4); p.add('chest', -0.3 * e, 0, 0); p.add('spine', -0.2 * e, 0, 0); p.add('neck', 0.2 * e, 0, 0); },
  },
  standUp: {
    dur: 1.4, mask: M.all,
    start(c) { c.h.setMode('stand', { blend: 1.2 }); },
    pose(c, p) { const e = env(c.t, 0, 0.4, 0.7, 1.4); p.add('chest', -0.35 * e, 0, 0); p.add('spine', -0.25 * e, 0, 0); p.add('neck', 0.25 * e, 0, 0); },
  },
  enterCar: {
    dur: 2.2, mask: M.all,
    start(c) { c.h.setMode('sitCar', { blend: 1.8 }); },
    pose(c, p) {
      const duck = env(c.t, 0.1, 0.7, 1.3, 2.0);
      p.add('spine', -0.3 * duck, 0, 0);
      p.add('chest', -0.3 * duck, 0, 0);
      p.add('neck', -0.2 * duck, 0, 0);
      p.add('head', 0.1 * duck, 0, 0.15 * duck);
      p.set('upperArmR', -0.6 * duck, 0.2, -(1.42 - c.h.P.armAngle) + 0.5 * duck);
    },
  },
  exitCar: {
    dur: 2.2, mask: M.all,
    start(c) { c.h.setMode('stand', { blend: 1.8 }); },
    pose(c, p) {
      const duck = env(c.t, 0.0, 0.5, 1.2, 2.0);
      p.add('spine', -0.3 * duck, 0, 0);
      p.add('chest', -0.3 * duck, 0, 0);
      p.add('head', 0.15 * duck, 0, -0.1 * duck);
    },
  },
  turnTo: {
    dur: 0.8, mask: null,
    start(c) { c.from = c.h.root.rotation.y; },
    pose(c) {
      let d = (c.opts.yaw ?? 0) - c.from;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      c.h.root.rotation.y = c.from + d * easeInOut(clamp(c.t / 0.8, 0, 1));
    },
  },
  // ---------------------------------------------------------------- horror
  neckSnap: {
    // a deliberate, sudden sideways snap with a twist, then a slow settle into the broken angle
    dur: 1.6, mask: null, hold: true,
    start(c) { c.dir = c.opts.dir ?? (Math.random() < 0.5 ? -1 : 1); },
    pose(c) {
      const snap = smoothstep(0.0, 0.12, c.t);
      const settle = smoothstep(0.12, 1.6, c.t);
      const roll = c.dir * (1.35 * snap + 0.2 * settle);
      const twist = c.dir * (0.55 * snap + 0.25 * settle);
      c.h.ghostLayer.setTargets({ headRoll: roll, neckTwist: twist, headPitch: -0.15 * snap }, 100);
      if (c.t > 0.05 && !c.cracked) { c.cracked = true; bus.emit('character:neckSnap', { id: c.h.spec.id }); }
      c.expr = { creepy: snap * 0.6, fear: 0 };
    },
  },
  crawlOverSeat: {
    // from a rear seat: grip the front seat back, pull forward and over toward the target
    dur: 3.4, mask: M.all, hold: true,
    start(c) { c.h.setMode('sitCar', { blend: 0.2 }); c.z0 = c.h.root.position.z; c.y0 = c.h.root.position.y; },
    pose(c, p) {
      const u = smoothstep(0, 3.4, c.t);
      const lean = smoothstep(0, 1.2, c.t);
      const pull = smoothstep(0.9, 3.2, c.t);
      p.add('hips', -0.4 * lean - 0.6 * pull, 0, 0);
      p.add('spine', -0.35 * lean, 0, 0);
      p.add('chest', -0.3 * lean, 0, 0);
      p.add('neck', 0.45 * lean, 0, 0);
      p.add('head', 0.35 * lean, 0, 0);
      p.sym('thigh', -1.0 - 0.6 * pull, 0, 0.2);
      p.sym('shin', 1.6, 0, 0);
      fingers(p, 0.9);
      // root slides forward (local -Z) and up over the seat back
      c.h.root.position.z = c.z0 - 0.75 * pull;
      c.h.root.position.y = c.y0 + 0.22 * Math.sin(Math.PI * pull);
      c.expr = { creepy: u, fear: 0 };
    },
    ik(c) {
      const out = c.tmp;
      const reach = smoothstep(0.2, 1.4, c.t);
      handAt(c.h, 'chest', [0.2, 0.05, -0.45], [0.5, 0, 0], out.R);
      handAt(c.h, 'chest', [-0.2, 0.1, -0.42], [0.5, 0, 0], out.L);
      return { R: out.R, L: out.L, wR: reach, wL: reach };
    },
  },
  emergeFromBelow: {
    dur: 3.2, mask: M.all, hold: true,
    start(c) { c.y0 = c.h.root.position.y; c.h.setMode('stand', { blend: 0.01 }); },
    pose(c, p) {
      const u = easeInOut(clamp(c.t / 3.0, 0, 1));
      c.h.root.position.y = c.y0 - (c.opts.depth ?? 1.3) * (1 - u);
      p.add('neck', 0.3 * (1 - u), 0, 0.35 * (1 - u));
      p.add('head', 0.25 * (1 - u), 0.2, 0.3 * (1 - u));
      p.add('spine', -0.3 * (1 - u), 0, 0);
      c.expr = { creepy: 0.5 };
    },
    ik(c) {
      const out = c.tmp;
      const w = smoothstep(0.3, 1.0, c.t) * (1 - smoothstep(2.6, 3.2, c.t));
      handAt(c.h, 'chest', [0.24, 0.32, -0.3], [-0.6, 0, 0], out.R);
      handAt(c.h, 'chest', [-0.24, 0.3, -0.32], [-0.6, 0, 0], out.L);
      return { R: out.R, L: out.L, wR: w, wL: w };
    },
  },
  pressFaceToGlass: {
    // slow lean until the face touches the glass point; palms flat beside the face
    dur: 2.4, mask: M.upper, hold: true,
    pose(c, p) {
      const u = easeInOut(clamp(c.t / 2.0, 0, 1));
      c.weight = 1;
      p.add('spine', -0.15 * u, 0, 0);
      p.add('chest', -0.15 * u, 0, 0);
      p.add('head', 0.1 * u, 0, 0.12 * u);
      fingers(p, -0.1, 0.5);
      c.expr = { creepy: 0.3 * u, fear: 0.2 * u };
      c.jaw = 0.15 * u;
      c.u = u;
      // move the body so the face reaches the target (in the root's parent space)
      if (c.opts.target) {
        const h = c.h;
        h._targetWorld(c.opts.target, _v);
        if (!c.start) { c.start = h.root.position.clone(); c.eye0 = h.eyePosition.clone(); }
        _v2.copy(c.eye0);
        if (h.root.parent) { const inv = _q2m(h.root.parent); _v.applyMatrix4(inv); _v2.applyMatrix4(inv); }
        h.root.position.copy(c.start).addScaledVector(_v.sub(_v2), u * 0.94);
      }
    },
    ik(c) {
      const out = c.tmp;
      const w = smoothstep(0.6, 2.0, c.t);
      handAt(c.h, 'head', [0.13, 0.05, -0.11], [Math.PI / 2, 0, 0], out.R);
      handAt(c.h, 'head', [-0.13, 0.06, -0.11], [Math.PI / 2, 0, 0], out.L);
      return { R: out.R, L: out.L, wR: w, wL: w };
    },
  },
  ceilingCrawl: {
    loop: true, dur: 4, mask: M.all,
    start(c) { c.h.setMode('ceiling', { blend: 0.5 }); },
    pose(c, p) {
      const ceil = c.opts.height ?? 1.2;
      // upside-down: flip the whole body around its forward axis and lift to the ceiling
      p.hips.y += ceil;
      p.add('hips', 0, 0, Math.PI);
      c.h.anim.speed = Math.max(c.h.anim.speed, c.opts.speed ?? 0.5);
      c.expr = { creepy: 0.7 };
    },
    end(c) { c.h.setMode('stand'); },
  },
  sprint: {
    // Yai Speed: impossibly long strides, arms pumping wrong, head locked on the target
    loop: true, dur: 4, mask: M.head,
    start(c) {
      c.h.anim.gait = 'sprint';
      c.h.setMode('run', { gait: 'sprint', speed: c.opts.speed ?? 7 });
      c.h.anim.gait = 'sprint';
      if (c.opts.target) c.h.lookAt(c.opts.target, { unlimited: true, speed: 14 });
    },
    pose(c, p) {
      // head stays level and steady: counter the gait's head bob
      p.set('neck', 0.25, p.a[BI.neck * 3 + 1], 0);
      p.set('head', 0.2, p.a[BI.head * 3 + 1], 0);
      c.expr = { creepy: 0.4 };
    },
    end(c) { c.h.anim.gait = 'walk'; c.h.setMode('stand'); },
  },
};
const _m4 = new THREE.Matrix4();
function _q2m(obj) {
  obj.updateWorldMatrix(true, false);
  return _m4.copy(obj.matrixWorld).invert();
}

export const ACTIONS = Object.keys(DEFS);

export class ActionPlayer {
  constructor(h) {
    this.h = h;
    this.active = [];
    this.tmpPose = new Pose();
    this.ikOut = {
      L: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), w: 0 },
      R: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), w: 0 },
    };
    this._tmp = { L: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, R: { pos: new THREE.Vector3(), quat: new THREE.Quaternion() } };
  }

  play(name, opts = {}) {
    const def = DEFS[name];
    if (!def) {
      console.warn('[characters] unknown action', name);
      return Promise.resolve();
    }
    // replace the same action
    this.stop(name, true);
    return new Promise((resolve) => {
      const a = {
        name, def, opts, t: 0, w: 0, fadeIn: opts.fade ?? def.fade ?? 0.3, stopping: false, stopT: 0,
        loop: opts.loop ?? !!def.loop, dur: opts.duration ?? def.dur, resolve, ctx: null,
      };
      a.ctx = { h: this.h, opts, t: 0, weight: 1, tmp: this._tmp };
      this.active.push(a);
      def.start?.(a.ctx);
    });
  }

  stop(name, immediate = false) {
    for (const a of this.active) {
      if (name && a.name !== name) continue;
      if (immediate) a.done = true;
      else a.stopping = true;
    }
    if (immediate) this._sweep();
  }

  isPlaying(name) {
    return this.active.some((a) => a.name === name && !a.done);
  }

  _sweep() {
    for (const a of this.active) {
      if (a.done) {
        a.def.end?.(a.ctx);
        a.resolve(true);
      }
    }
    this.active = this.active.filter((a) => !a.done);
  }

  apply(pose, dt) {
    const h = this.h;
    this.ikOut.L.w = 0;
    this.ikOut.R.w = 0;
    h._actionExpr = null;
    h._actionJaw = 0;
    h._actionTalk = 0;
    if (!this.active.length) return;
    for (const a of this.active) {
      a.t += dt;
      const c = a.ctx;
      c.t = a.loop ? a.t % a.dur : Math.min(a.t, a.dur);
      c.weight = 1;
      c.expr = null; c.jaw = 0; c.talk = 0;
      // fade
      if (a.stopping) {
        a.stopT += dt;
        a.w = Math.max(0, 1 - a.stopT / 0.35);
        if (a.w <= 0) a.done = true;
      } else {
        a.w = Math.min(1, a.t / Math.max(0.01, a.fadeIn));
        if (!a.loop && a.t >= a.dur) {
          if (a.def.hold && !a.opts.release) a.w = 1;
          else a.done = true;
        }
      }
      const tmp = this.tmpPose.copy(pose);
      a.def.pose?.(c, tmp);
      const w = a.w * (a.def.mask ? 1 : 0);
      if (w > 0 && a.def.mask) pose.lerpMasked(tmp, w * (c.weight ?? 1) + (a.def.ik ? w * (1 - (c.weight ?? 1)) * 0 : 0), a.def.mask);
      if (a.def.ik) {
        const r = a.def.ik(c);
        for (const s of ['L', 'R']) {
          const ws = (r['w' + s] ?? 0) * a.w;
          if (r[s] && ws > this.ikOut[s].w) {
            this.ikOut[s].pos.copy(r[s].pos);
            this.ikOut[s].quat.copy(r[s].quat);
            this.ikOut[s].w = ws;
          }
        }
      }
      if (c.expr) h._actionExpr = { ...(h._actionExpr || {}), ...mulExpr(c.expr, a.w) };
      if (c.jaw) h._actionJaw = Math.max(h._actionJaw, c.jaw * a.w);
      if (c.talk) h._actionTalk = 1;
    }
    this._sweep();
  }
}

function mulExpr(e, w) {
  const o = {};
  for (const k in e) o[k] = e[k] * w;
  return o;
}
void BONE_COUNT;
