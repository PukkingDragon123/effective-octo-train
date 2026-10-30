// Procedural actions layered over the clips (things the UAL library does not have).
//  Thai: hail (Thai taxi hail: arm out low toward the road, palm DOWN, beckoning fingers), wai,
//        smoke (cigarette to the lips, inhale, lower, exhale), giveItem (other hand supports the
//        forearm, slight bow), pay, nod, laugh, cry, point, sing (luk thung), stagger (drunk)
//  utility: turnTo, wave, lookAround
//  ghost:   neckSnap, crawlOverSeat, emergeFromBelow, pressFaceToGlass, ceilingCrawl, sprint (Yai Speed)
// Each action: { dur (s, 0 = loop), fadeIn, fadeOut, pose(h, c) local additive, ik(h, c) IK requests,
// face(h, c) expression outputs }. c = { t, k (0..1), w (envelope), opts, st (state) }.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, noise, easeInOut } from '../../core/math.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion();
const env = (k, a, b, c, d) => smoothstep(a, b, k) * (1 - smoothstep(c, d, k)); // rise a..b, fall c..d
const S = (side) => (side === 'L' ? 1 : -1);

/** world point relative to a bone, offset in model axes (rest frame), metres (template scale) */
function bp(h, bone, x, y, z, out = new THREE.Vector3()) {
  const i = h.t.index[bone];
  h.boneFrame(i, _q);
  h.rig.worldPos(i, out);
  return out.add(_v3.set(x, y, z).multiplyScalar(h.scale).applyQuaternion(_q));
}
function bd(h, bone, x, y, z, out = new THREE.Vector3()) {
  h.boneFrame(h.t.index[bone], _q);
  return out.set(x, y, z).normalize().applyQuaternion(_q);
}
/** offset vector in a bone's rest frame (NOT normalised), scaled to the character */
function bo(h, bone, x, y, z, out = new THREE.Vector3()) {
  h.boneFrame(h.t.index[bone], _q);
  return out.set(x, y, z).multiplyScalar(h.scale).applyQuaternion(_q);
}
function target(h, t, out) { return t ? h._target(t, out) : null; }
function req(h, side, w, pos, along, palm, extra = {}) {
  const cur = h.req[side];
  if (cur && cur.w > w) return;
  h.req[side] = { w, pos: pos.clone(), along: along ? along.clone().normalize() : null, palm: palm ? palm.clone().normalize() : null, ...extra };
}

export const ACTIONS = {
  // ------------------------------------------------------------------ Thai gestures
  hail: {
    dur: 0, fadeIn: 0.45, fadeOut: 0.5,
    pose(h, c) {
      const s = c.opts.side || 'R', sx = S(s), I = h.t.index, w = c.w;
      h.rig.addEuler(I.spine_03, 0.05 * w, 0, sx * 0.06 * w);
      h.rig.addEuler(I.spine_01, 0, -sx * 0.12 * w, 0);
    },
    ik(h, c) {
      const s = c.opts.side || 'R', sx = S(s);
      const ph = c.t * Math.PI * 2 * 1.7;
      const flap = Math.max(0, Math.sin(ph));
      // arm extended low toward the road side, palm down
      const pos = bp(h, 'spine_03', sx * 0.3, -0.24 - flap * 0.03, 0.4);
      const along = bd(h, 'spine_03', sx * 0.35, -0.45 - flap * 0.5, 0.8);
      const palm = bd(h, 'spine_03', sx * 0.05, -1, 0.25 + flap * 0.4);
      req(h, s, c.w, pos, along, palm, { fingers: 'beckon', phase: ph, grip: 0 });
      if (c.opts.lookAt) h.lookAt(c.opts.lookAt, { speed: 3 });
    },
  },
  wai: {
    dur: 2.4, fadeIn: 0.5, fadeOut: 0.7,
    pose(h, c) {
      const I = h.t.index, deep = c.opts.level === 'face' || c.opts.deep ? 1.4 : 1;
      const bow = env(c.k, 0.15, 0.4, 0.7, 0.92) * c.w * deep;
      h.rig.addEuler(I.spine_02, 0.1 * bow, 0, 0);
      h.rig.addEuler(I.spine_03, 0.12 * bow, 0, 0);
      h.rig.addEuler(I.neck_01, 0.12 * bow, 0, 0);
      h.rig.addEuler(I.Head, 0.2 * bow, 0, 0);
    },
    ik(h, c) {
      const hi = c.opts.level === 'face' ? 0.27 : c.opts.level === 'forehead' ? 0.36 : 0.16;
      const base = bp(h, 'spine_03', 0, hi, 0.24);
      const up = bd(h, 'spine_03', 0, 1, 0.18);
      for (const s of ['L', 'R']) {
        const sx = S(s);
        const p = base.clone().add(bo(h, 'spine_03', sx * 0.014, 0, 0));
        const palm = bd(h, 'spine_03', -sx, 0, 0.05);
        req(h, s, c.w, p, up, palm, { fingers: 'wai', pole: bp(h, 'spine_03', sx * 0.3, -0.35, 0.05) });
      }
    },
    face(h, c, o) { o.eyesClosed = Math.max(o.eyesClosed, env(c.k, 0.25, 0.4, 0.65, 0.8) * 0.75 * c.w); o.smile += 0.25 * c.w; },
  },
  smoke: {
    dur: 5.2, fadeIn: 0.35, fadeOut: 0.6,
    start(h) { if (!h.held.cigarette) h.holdItem('cigarette', 'R'); },
    pose(h, c) {
      const I = h.t.index, w = c.w;
      const toMouth = env(c.k, 0.08, 0.22, 0.42, 0.55);
      h.rig.addEuler(I.Head, -0.06 * toMouth * w, -0.12 * toMouth * w, 0.04 * toMouth * w);
      // inhale: chest rises; exhale: head tips back a little
      const inh = env(c.k, 0.24, 0.38, 0.45, 0.55), exh = env(c.k, 0.62, 0.72, 0.86, 0.96);
      h.rig.addEuler(I.spine_03, -0.05 * inh * w, 0, 0);
      h.rig.addEuler(I.Head, -0.14 * exh * w, 0, 0);
    },
    ik(h, c) {
      const toMouth = env(c.k, 0.08, 0.22, 0.42, 0.55);
      // resting hold: forearm up in front of the chest, cigarette out
      const rest = bp(h, 'spine_03', -0.17, -0.02, 0.3);
      const restAlong = bd(h, 'spine_03', 0.1, 0.9, 0.35), restPalm = bd(h, 'spine_03', 0.6, 0, -0.4);
      // at the lips: palm toward the face, fingers up and out
      const mouth = bp(h, 'Head', -0.018, 0.035, 0.155);
      const mAlong = bd(h, 'Head', -0.45, 0.85, 0.1), mPalm = bd(h, 'Head', 0.15, -0.1, -1);
      const pos = rest.lerp(mouth, easeInOut(toMouth));
      const al = restAlong.lerp(mAlong, toMouth), pa = restPalm.lerp(mPalm, toMouth);
      req(h, 'R', c.w, pos, al, pa, { fingers: 'cig' });
    },
    face(h, c, o) {
      const inh = env(c.k, 0.24, 0.34, 0.45, 0.52), exh = env(c.k, 0.62, 0.7, 0.88, 0.96);
      o.squint += 0.5 * inh * c.w;
      o.eyesClosed = Math.max(o.eyesClosed, 0.45 * inh * c.w);
      o.jaw += 0.18 * exh * c.w;
      if (exh > 0.5 && !c.st.puffed) { c.st.puffed = true; h.onExhale?.(h.headPosition); }
    },
  },
  giveItem: {
    dur: 2.6, fadeIn: 0.5, fadeOut: 0.6,
    pose(h, c) { const I = h.t.index, b = env(c.k, 0.15, 0.4, 0.75, 0.95) * c.w; h.rig.addEuler(I.spine_03, 0.14 * b, 0, 0); h.rig.addEuler(I.Head, 0.12 * b, 0, 0); },
    ik(h, c) {
      const s = c.opts.side || 'R', sx = S(s), o = s === 'R' ? 'L' : 'R';
      const reach = env(c.k, 0.05, 0.35, 0.75, 0.95);
      const to = target(h, c.opts.target, _v2);
      const pos = to ? bp(h, 'spine_03', sx * 0.12, -0.18, 0.3).lerp(to, reach * 0.85) : bp(h, 'spine_03', sx * 0.1, -0.16, 0.3 + 0.18 * reach);
      const along = bd(h, 'spine_03', -sx * 0.15, 0.1, 1), palm = bd(h, 'spine_03', 0, 1, 0.1);
      req(h, s, c.w, pos, along, palm, { fingers: 'flat' });
      // Thai politeness: the other hand supports the giving forearm
      if (c.opts.support !== false) {
        const fa = h.rig.worldPos(h.t.index[s === 'R' ? 'lowerarm_r' : 'lowerarm_l'], new THREE.Vector3());
        const wr = h.rig.worldPos(h.t.index[s === 'R' ? 'hand_r' : 'hand_l'], new THREE.Vector3());
        const sup = fa.lerp(wr, 0.45).add(bo(h, 'spine_03', 0, -0.035, 0));
        req(h, o, c.w * 0.95, sup, bd(h, 'spine_03', sx, 0.05, 0.4), bd(h, 'spine_03', 0, 1, 0), { fingers: 'flat' });
      }
      if (reach > 0.95 && !c.st.gave) { c.st.gave = true; c.opts.onGive?.(); }
    },
    face(h, c, o) { o.smile += 0.35 * c.w; },
  },
  pay: {
    dur: 2.0, fadeIn: 0.4, fadeOut: 0.5,
    start(h, c) { if (c.opts.item !== false && !h.held.coins) { h.holdItem('coins', c.opts.side || 'R'); c.st.added = true; } },
    end(h, c) { if (c.st.added) h.dropItem('coins'); },
    pose(h, c) { const b = env(c.k, 0.2, 0.45, 0.7, 0.95) * c.w; h.rig.addEuler(h.t.index.spine_03, 0.1 * b, 0, 0); },
    ik(h, c) {
      const s = c.opts.side || 'R', sx = S(s);
      const reach = env(c.k, 0.05, 0.4, 0.7, 0.95);
      const to = target(h, c.opts.target, _v2);
      const pos = to ? bp(h, 'spine_03', sx * 0.12, -0.15, 0.3).lerp(to, reach * 0.9) : bp(h, 'spine_03', sx * 0.08, -0.12, 0.3 + 0.2 * reach);
      req(h, s, c.w, pos, bd(h, 'spine_03', -sx * 0.2, 0, 1), bd(h, 'spine_03', 0, -1, 0.2), { fingers: 'pinch' });
      if (reach > 0.95 && !c.st.paid) { c.st.paid = true; c.opts.onPay?.(); }
    },
  },
  nod: {
    dur: 1.1, fadeIn: 0.1, fadeOut: 0.2,
    pose(h, c) { const I = h.t.index; const n = Math.sin(c.k * Math.PI * (c.opts.times || 2) * 2) * (1 - c.k * 0.4) * c.w; h.rig.addEuler(I.Head, 0.2 * Math.max(0, n), 0, 0); h.rig.addEuler(I.neck_01, 0.08 * Math.max(0, n), 0, 0); },
  },
  laugh: {
    dur: 2.8, fadeIn: 0.25, fadeOut: 0.6,
    pose(h, c) {
      const I = h.t.index, w = c.w;
      const b = Math.abs(Math.sin(c.t * 15)) * (0.6 + 0.4 * Math.sin(c.t * 2.3));
      h.rig.addEuler(I.spine_02, 0.03 * b * w, 0, 0);
      h.rig.addEuler(I.spine_03, -0.04 * w + 0.04 * b * w, 0, 0);
      h.rig.addEuler(I.clavicle_l, 0, 0, 0.05 * b * w);
      h.rig.addEuler(I.clavicle_r, 0, 0, -0.05 * b * w);
      h.rig.addEuler(I.Head, -0.2 * w + 0.05 * b * w, 0, 0.06 * Math.sin(c.t * 1.7) * w);
    },
    face(h, c, o) { o.smile += 1.0 * c.w; o.squint += 0.6 * c.w; o.jaw += (0.35 + 0.35 * Math.abs(Math.sin(c.t * 15))) * c.w; o.brow += 0.2 * c.w; },
  },
  cry: {
    dur: 0, fadeIn: 0.8, fadeOut: 0.8,
    pose(h, c) {
      const I = h.t.index, w = c.w;
      // sobs: irregular shudders
      const sob = Math.max(0, noise.noise2D(c.t * 2.6, 3.3)) * Math.abs(Math.sin(c.t * 9));
      h.rig.addEuler(I.spine_03, 0.12 * w + 0.05 * sob * w, 0, 0);
      h.rig.addEuler(I.neck_01, 0.15 * w, 0, 0);
      h.rig.addEuler(I.Head, 0.3 * w - 0.06 * sob * w, 0, 0.05 * w);
      h.rig.addEuler(I.clavicle_l, 0, 0, 0.07 * sob * w);
      h.rig.addEuler(I.clavicle_r, 0, 0, -0.07 * sob * w);
    },
    ik(h, c) {
      // right hand covers the eyes
      const pos = bp(h, 'Head', -0.01, 0.1, 0.13);
      req(h, 'R', c.w * 0.95, pos, bd(h, 'Head', 0.7, 0.55, 0.1), bd(h, 'Head', 0, -0.1, -1), { fingers: 'flat' });
    },
    face(h, c, o) { o.sad = Math.max(o.sad, c.w); o.eyesClosed = Math.max(o.eyesClosed, 0.6 * c.w); o.jaw += 0.12 * c.w * Math.abs(Math.sin(c.t * 4)); },
  },
  point: {
    dur: 2.2, fadeIn: 0.35, fadeOut: 0.5,
    ik(h, c) {
      const s = c.opts.side || 'R', sx = S(s);
      const sh = h.rig.worldPos(h.t.index[s === 'R' ? 'upperarm_r' : 'upperarm_l'], new THREE.Vector3());
      const to = target(h, c.opts.target, _v2) || bp(h, 'spine_03', sx * 0.3, 0.1, 3);
      const dir = to.clone().sub(sh).normalize();
      const pos = sh.clone().addScaledVector(dir, 0.62 * h.scale);
      const palm = _v.set(0, -1, 0).addScaledVector(dir, 0.2).normalize();
      req(h, s, c.w, pos, dir, palm, { fingers: 'point' });
      h.lookAt(to, { speed: 5 });
    },
  },
  sing: {
    dur: 0, fadeIn: 0.6, fadeOut: 0.8,
    pose(h, c) {
      const I = h.t.index, w = c.w;
      const sway = Math.sin(c.t * 1.9) * w;
      h.rig.addEuler(I.Head, -0.08 * w, 0.06 * sway, 0.12 * sway);
      h.rig.addEuler(I.spine_03, -0.03 * w, 0.05 * sway, 0.04 * sway);
    },
    ik(h, c) {
      // luk thung: right hand drifts out with the phrase, palm up
      const ph = (Math.sin(c.t * 0.9) + 1) * 0.5;
      const pos = bp(h, 'spine_03', -0.16 - ph * 0.14, 0.02 + ph * 0.08, 0.3 + ph * 0.1);
      req(h, 'R', c.w * 0.85, pos, bd(h, 'spine_03', -0.5, 0.3, 0.8), bd(h, 'spine_03', 0, 1, 0.3), { fingers: 'flat' });
    },
    face(h, c, o) {
      const note = 0.4 + 0.35 * Math.max(0, Math.sin(c.t * 2.2)) + 0.05 * Math.sin(c.t * 34);
      o.jaw += note * c.w; o.eyesClosed = Math.max(o.eyesClosed, 0.45 * c.w); o.brow += 0.4 * c.w; o.smile += 0.2 * c.w;
    },
  },
  stagger: {
    dur: 0, fadeIn: 0.8, fadeOut: 1.0,
    pose(h, c) {
      const I = h.t.index, w = c.w, t = c.t;
      const a = noise.noise2D(t * 0.55, 1.1), b = noise.noise2D(t * 0.4, 7.3), d = noise.noise2D(t * 0.8, 3.9);
      h.rig.addEuler(I.pelvis, 0.03 * b * w, 0.06 * a * w, 0.08 * a * w);
      h.rig.addEuler(I.spine_02, 0.05 * w, 0, -0.1 * a * w);
      h.rig.addEuler(I.spine_03, 0.04 * w, 0.05 * b * w, -0.08 * a * w);
      h.rig.addEuler(I.Head, 0.12 * w + 0.08 * d * w, 0.15 * b * w, 0.22 * d * w);
      for (const [x, sg] of [['l', 1], ['r', -1]]) h.rig.addEuler(I['upperarm_' + x], 0, 0, sg * (0.12 + 0.08 * a) * w);
      h._gaitScale = 1 + 0.35 * noise.noise2D(t * 1.3, 5.5) * w;
      if (h.walk) h.root.rotation.y += a * 0.6 * w * c.dt;
    },
    face(h, c, o) { o.eyesClosed = Math.max(o.eyesClosed, 0.35 * c.w); o.smile += 0.25 * c.w; },
    end(h) { h._gaitScale = 1; },
  },
  wave: {
    dur: 2.0, fadeIn: 0.3, fadeOut: 0.4,
    ik(h, c) {
      const s = c.opts.side || 'R', sx = S(s);
      const pos = bp(h, 'spine_03', sx * 0.32, 0.38, 0.12);
      const a = Math.sin(c.t * 9) * 0.35;
      req(h, s, c.w, pos, bd(h, 'spine_03', sx * a, 1, 0.1), bd(h, 'spine_03', 0, 0, 1), { fingers: 'flat' });
    },
  },
  turnTo: {
    dur: 0.7, fadeIn: 0, fadeOut: 0,
    start(h, c) { c.st.y0 = h.root.rotation.y; let d = (c.opts.yaw ?? 0) - c.st.y0; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; c.st.d = d; },
    pose(h, c) { h.root.rotation.y = c.st.y0 + c.st.d * easeInOut(c.k); },
  },
  lookAround: {
    dur: 4, fadeIn: 0.3, fadeOut: 0.5,
    pose(h, c) { const I = h.t.index; const y = Math.sin(c.k * Math.PI * 2) * 0.9 * c.w; h.rig.addEuler(I.neck_01, 0, y * 0.4, 0); h.rig.addEuler(I.Head, 0, y * 0.5, 0); },
  },

  // ------------------------------------------------------------------ ghost actions
  neckSnap: {
    dur: 0.9, fadeIn: 0, fadeOut: 0, hold: true,
    start(h, c) { c.st.dir = c.opts.dir ?? (Math.random() < 0.5 ? 1 : -1); c.st.r0 = h.ghostLayer.v.headRoll; },
    pose(h, c) {
      // fast snap with a small overshoot and a settling twitch
      const k = c.t;
      const a = k < 0.16 ? Math.pow(k / 0.16, 2) * 1.12 : k < 0.32 ? lerp(1.12, 0.96, (k - 0.16) / 0.16) : 0.96 + 0.04 * smoothstep(0.32, 0.9, k);
      h.ghostLayer.setTargets({ headRoll: c.st.r0 + c.st.dir * (c.opts.angle ?? 1.45) * a, jitter: k < 0.5 ? 0.6 : 0.25 }, 100);
    },
    end(h, c) { if (c.opts.release) h.ghostLayer.setTargets({ headRoll: 0, jitter: 0 }, 2); },
  },
  crawlOverSeat: {
    dur: 4.5, fadeIn: 0.6, fadeOut: 0.8, hold: true,
    start(h, c) { c.st.p0 = h.root.position.clone(); c.st.fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(h.root.quaternion); },
    pose(h, c) {
      const I = h.t.index, w = c.w, k = c.k;
      const lean = smoothstep(0, 0.35, k) * w;
      h.rig.addEuler(I.spine_01, 0.35 * lean, 0, 0);
      h.rig.addEuler(I.spine_02, 0.4 * lean, 0, 0);
      h.rig.addEuler(I.spine_03, 0.35 * lean, 0, 0);
      h.rig.addEuler(I.neck_01, -0.5 * lean, 0, 0);
      h.rig.addEuler(I.Head, -0.55 * lean, 0, 0.25 * lean);
      // slow pull forward (root, in its parent space)
      const d = (c.opts.distance ?? 0.55) * easeInOut(smoothstep(0.25, 1, k));
      h.root.position.copy(c.st.p0).addScaledVector(c.st.fwd, d);
      h.ghostLayer.setTargets({ jitter: 0.25 + 0.2 * Math.sin(c.t * 3), stare: 1 }, 6);
    },
    ik(h, c) {
      const k = c.k;
      // hands reach over, alternating grabs
      for (const s of ['L', 'R']) {
        const sx = S(s);
        const ph = clamp(k * 2.2 - (s === 'L' ? 0 : 0.35), 0, 1);
        const lift = Math.sin(ph * Math.PI) * 0.12;
        const to = target(h, c.opts.target, _v2);
        const base = to ? to.clone().add(bo(h, 'pelvis', sx * 0.2, 0, 0)) : bp(h, 'spine_03', sx * 0.24, -0.1 + lift, 0.45 + ph * 0.25);
        req(h, s, c.w, base, bd(h, 'spine_03', sx * 0.2, -0.5, 1), bd(h, 'spine_03', 0, -1, 0.2), { fingers: 'claw' });
      }
    },
    face(h, c, o) { o.creepy += 0.4 * c.w; },
  },
  emergeFromBelow: {
    dur: 5.0, fadeIn: 0.2, fadeOut: 0.6, hold: true,
    pose(h, c) {
      const k = c.k, I = h.t.index;
      const depth = c.opts.depth ?? 1.3;
      // hands first, then the head rises crooked, slow pull with hitches
      const rise = easeInOut(smoothstep(0.15, 1, k)) + 0.03 * Math.sin(c.t * 7) * (1 - k);
      c.out.yOffset = -depth * (1 - rise);
      h.rig.addEuler(I.spine_03, 0.4 * (1 - rise), 0, 0);
      h.ghostLayer.setTargets({ headRoll: 0.5 * (1 - smoothstep(0.5, 1, k)) + 0.15, jitter: 0.35, stare: 1, unlimited: 1 }, 5);
    },
    ik(h, c) {
      const edge = (c.opts.edgeHeight ?? 0) ;
      for (const s of ['L', 'R']) {
        const sx = S(s);
        const grab = smoothstep(0.0, 0.2, c.k - (s === 'L' ? 0 : 0.07));
        const p = h.rig.worldPos(h.t.index.pelvis, new THREE.Vector3());
        const fwd = bd(h, 'pelvis', 0, 0, 1);
        const side = bd(h, 'pelvis', sx, 0, 0);
        const root = new THREE.Vector3().setFromMatrixPosition(h.root.matrixWorld);
        const pos = p.clone().addScaledVector(fwd, 0.35 * h.scale).addScaledVector(side, 0.28 * h.scale);
        pos.y = lerp(pos.y, root.y + edge + 0.02, grab);
        req(h, s, c.w, pos, fwd.clone().add(_v.set(0, 0.2, 0)), _v2.set(0, -1, 0), { fingers: 'claw' });
      }
    },
  },
  pressFaceToGlass: {
    dur: 0, fadeIn: 1.2, fadeOut: 0.8,
    pose(h, c) {
      const I = h.t.index, w = c.w;
      h.rig.addEuler(I.spine_02, 0.15 * w, 0, 0);
      h.rig.addEuler(I.spine_03, 0.18 * w, 0, 0);
      h.ghostLayer.setTargets({ stare: 1, jitter: 0.12 }, 4);
    },
    ik(h, c) {
      const g = target(h, c.opts.target, _v2);
      if (!g) return;
      const head = h.headPosition;
      const n = c.opts.normal ? c.opts.normal.clone().normalize() : head.clone().sub(g).setY(0).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(up, n).normalize();
      const slide = Math.min(1, c.t / 12) * 0.08;
      for (const s of ['L', 'R']) {
        const sx = S(s);
        // hands flat on the glass beside the face (character's left is -right when facing the glass)
        const pos = g.clone().addScaledVector(right, -sx * 0.21 * h.scale).addScaledVector(up, (-0.04 - slide + (s === 'L' ? 0.03 : 0)) * h.scale).addScaledVector(n, 0.012);
        req(h, s, c.w, pos, up.clone().addScaledVector(right, -sx * 0.25), n.clone().negate(), { fingers: 'spread' });
      }
      h.lookAt(g.clone().addScaledVector(n, -1), { speed: 6, unlimited: true });
    },
    face(h, c, o) { o.creepy += 0.3 * c.w; o.brow += 0.4 * c.w; },
  },
  ceilingCrawl: {
    dur: 0, fadeIn: 0.8, fadeOut: 0.8,
    start(h) { h.ghostLayer.setTargets({ neckTwist: Math.PI, jitter: 0.3, stare: 1, unlimited: 1 }, 2); },
    end(h) { h.ghostLayer.setTargets({ neckTwist: 0, jitter: 0 }, 2); },
    pose(h, c) {
      const I = h.t.index, w = c.w;
      // all fours, torso parallel to the support plane (the ceiling after the flip)
      h.rig.addEuler(I.pelvis, 1.25 * w, 0, 0);
      h.rig.addEuler(I.spine_03, -0.15 * w, 0, 0);
      h.rig.addEuler(I.Head, -0.9 * w, 0, 0);
      c.out.roll = Math.PI * w;
      c.out.yOffset = (c.opts.height ?? 1.25) * w;
    },
    ik(h, c) {
      const t = c.t * (c.opts.speed ?? 0.7);
      for (const [s, leg, ph0] of [['L', false, 0], ['R', false, 0.5], ['FL', true, 0.5], ['FR', true, 0]]) {
        const side = s.endsWith('L') ? 1 : -1;
        const ph = (t + ph0) % 1;
        const lift = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI) * 0.08 : 0;
        const step = ph < 0.3 ? lerp(-0.12, 0.12, ph / 0.3) : lerp(0.12, -0.12, (ph - 0.3) / 0.7);
        const root = new THREE.Vector3().setFromMatrixPosition(h.root.matrixWorld);
        const fwd = new THREE.Vector3(0, 0, -1).transformDirection(h.root.matrixWorld);
        const rgt = new THREE.Vector3(1, 0, 0).transformDirection(h.root.matrixWorld);
        const ceil = root.y + (c.opts.height ?? 1.25) * h.root.scale.y;
        const along = (leg ? -0.45 : 0.5) + step;
        const pos = root.clone().addScaledVector(fwd, along * h.scale).addScaledVector(rgt, -side * (leg ? 0.32 : 0.42) * h.scale);
        pos.y = ceil - 0.01 - lift;
        if (leg) h.req[s] = { w: c.w, pos, pole: pos.clone().add(new THREE.Vector3(0, -0.5, 0)).addScaledVector(rgt, -side * 0.4) };
        else req(h, s, c.w, pos, fwd.clone().addScaledVector(rgt, -side * 0.6), new THREE.Vector3(0, 1, 0), { fingers: 'spread', pole: pos.clone().add(new THREE.Vector3(0, -0.4, 0)).addScaledVector(rgt, -side * 0.5) });
      }
    },
  },
  sprint: {
    dur: 0, fadeIn: 0.4, fadeOut: 0.6,
    start(h, c) { c.st.mode = h.mode; h.setMode('sprint', { gait: 'sprint' }); h.ghostLayer.setTargets({ stare: 1, noBlink: 1, unlimited: 1 }, 4); if (c.opts.target) h.lookAt(c.opts.target, { speed: 12, unlimited: true, lock: true }); },
    end(h, c) { h._gaitScale = 1; if (h.mode === 'sprint') h.setMode(c.st.mode === 'sprint' ? 'stand' : c.st.mode); h.ghostLayer.setTargets({ stare: 0, noBlink: 0 }, 2); },
    pose(h, c) {
      const I = h.t.index, w = c.w, t = c.t;
      // long irregular strides, forward lean, arms wrong (stiff, trailing, out of phase)
      h._gaitScale = 0.85 + 0.35 * (0.5 + 0.5 * noise.noise2D(t * 0.9, 2.2));
      h.rig.addEuler(I.spine_01, 0.18 * w, 0, 0);
      h.rig.addEuler(I.spine_03, 0.12 * w, 0, 0);
      h.rig.addEuler(I.neck_01, -0.25 * w, 0, 0);
      for (const [x, sg] of [['l', 1], ['r', -1]]) {
        h.rig.addEuler(I['thigh_' + x], -0.12 * Math.sin(t * 9 + (sg > 0 ? 0 : Math.PI)) * w, 0, 0);
        h.rig.addEuler(I['upperarm_' + x], 0.0, sg * 0.5 * w, -sg * 0.25 * w);
        h.rig.addEuler(I['lowerarm_' + x], 0, -sg * 0.3 * w, 0);
      }
    },
    ik(h, c) {
      // arms trail straight back, palms up, twitching
      for (const s of ['L', 'R']) {
        const sx = S(s);
        const j = noise.noise2D(c.t * 6, sx * 3) * 0.05;
        const pos = bp(h, 'spine_03', sx * 0.3, -0.45 + j, -0.38);
        req(h, s, c.w * 0.9, pos, bd(h, 'spine_03', sx * 0.2, -0.3, -1), bd(h, 'spine_03', 0, 1, 0), { fingers: 'claw' });
      }
    },
    face(h, c, o) { o.creepy += 0.8 * c.w; },
  },
};

export class ActionPlayer {
  constructor(h) {
    this.h = h;
    this.list = [];
    this.out = { smile: 0, brow: 0, squint: 0, jaw: 0, eyesClosed: 0, sad: 0, creepy: 0, yOffset: 0, roll: 0 };
  }
  get smile() { return this.out.smile; }
  get brow() { return this.out.brow; }
  get squint() { return this.out.squint; }
  get jaw() { return this.out.jaw; }
  get eyesClosed() { return this.out.eyesClosed; }

  play(name, opts = {}) {
    const def = ACTIONS[name];
    if (!def) { console.warn('[characters-glb] unknown action', name); return Promise.resolve(false); }
    this.stop(name, true);
    return new Promise((resolve) => {
      const loop = opts.loop ?? def.dur === 0;
      const c = { name, def, opts, t: 0, k: 0, w: 0, dt: 0, st: {}, out: this.out, loop, dur: opts.duration ?? (def.dur || 1e9), stopping: false, resolve, fadeOut: opts.fadeOut ?? def.fadeOut ?? 0.4 };
      def.start?.(this.h, c);
      this.list.push(c);
    });
  }
  stop(name, immediate = false) {
    for (const c of this.list) {
      if (name && c.name !== name) continue;
      if (immediate) { c.def.end?.(this.h, c); c.resolve(false); c.dead = true; }
      else c.stopping = true;
    }
    this.list = this.list.filter((c) => !c.dead);
  }
  update(dt) {
    const o = this.out;
    o.smile = o.brow = o.squint = o.jaw = o.eyesClosed = o.sad = o.creepy = o.yOffset = o.roll = 0;
    this.h.req.L = this.h.req.R = this.h.req.FL = this.h.req.FR = null;
    for (const c of this.list) {
      c.dt = dt;
      c.t += dt;
      const fi = c.def.fadeIn ?? 0.3;
      if (!c.loop && !c.def.hold && c.t >= c.dur - c.fadeOut) c.stopping = true;
      if (c.stopping) {
        c.w = Math.max(0, c.w - dt / Math.max(0.01, c.fadeOut));
        if (c.w <= 0) { c.def.end?.(this.h, c); c.dead = true; c.resolve(true); }
      } else c.w = fi > 0 ? Math.min(1, c.w + dt / fi) : 1;
      c.k = c.loop ? (c.t / (c.def.period || 2)) % 1 : clamp(c.t / c.dur, 0, 1);
      if (c.def.hold && !c.loop && c.t >= c.dur && !c.done) { c.done = true; c.resolve(true); }
      c.w = Math.min(c.w, 1);
      if (c.w > 0) c.def.face?.(this.h, c, o);
    }
    this.list = this.list.filter((c) => !c.dead);
    // ease the weight curve
    for (const c of this.list) c.we = smoothstep(0, 1, c.w);
    // propagate expression outputs
    this.h.actionsExpr = o;
  }
  applyPose() {
    for (const c of this.list) if (c.w > 0 && c.def.pose) { const w = c.w; c.w = c.we; c.def.pose(this.h, c); c.w = w; }
    const h = this.h;
    h.inner.rotation.z = this.out.roll;
    h._yOffset = this.out.yOffset;
  }
  applyIK() {
    for (const c of this.list) if (c.w > 0 && c.def.ik) { const w = c.w; c.w = c.we; c.def.ik(this.h, c); c.w = w; }
  }
}
