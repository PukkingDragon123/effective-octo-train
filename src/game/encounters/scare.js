// Close-contact scares shared by the jumpscares and the death cinematics.
//   GRAB   the ghost's hands clamp Ton's temples; the view is held, shaken and pulled into its face.
//   SCREAM the jaw unhinges (setGhostMotion 'gape') and it screams into the lens (layered, dry, close).
//   EAT    the mouth opens past anything a jaw can do and comes over the lens: crunching, wet tearing,
//          blood over the view, a hard cut to black.
//
//   const c = grab(h, { dist })  -> controller { st, set(o), stop() }
//   await scream(h, seconds)     await eat(h, c)      c.stop()      release(h, c) (it lets go, gone)
//   earlyGame(type) -> true while the fairness gate would avert this death (grab + scream, then release)
//
// Placement runs every frame AFTER the camera rig (engine order 55, the rig is 50), in the camera's own
// frame: the face is kept `dist` metres in front of the eyes even at speed. (The old one-shot world
// placement was left metres behind by a moving taxi before the first frame rendered: nobody saw it.)
import * as THREE from 'three';
import { g } from '../context.js';
import { engine } from '../../core/Engine.js';
import { cameraRig } from '../../core/CameraRig.js';
import { LAYERS } from '../../core/layers.js';
import { postfx } from '../../render/index.js';
import { fairGate } from '../systems/Fairness.js';
import { whistleBuffer, shriekBuffer, crunchBuffer, playVoice } from '../../creatures/voices.js';

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _h = new THREE.Vector3(), _p = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const play = (id, o = {}) => {
  try {
    return g.audio?.play?.(id, { bus: 'sfx', mustPlay: true, ...o });
  } catch (e) {
    return null;
  }
};
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

/** True while a death of `type` would be averted by the fairness gate (early game / first nights). */
export function earlyGame(type = 'windowAttack', cause = 'jumpscare') {
  try {
    return fairGate(type, { cause }) === 'avert';
  } catch (e) {
    return true;
  }
}

/** Make sure a humanoid can be seen by the main camera right now. */
export function makeVisible(h) {
  if (!h?.root) return;
  try {
    h.setLayer?.(LAYERS.DEFAULT);
  } catch (e) { /* optional */ }
  h.setOpacity?.(1);
  h.setVisible?.(true);
  h.root.visible = true;
  h.root.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) o.frustumCulled = false;
  });
}

function headWorld(h, out) {
  const b = h.bones?.Head;
  if (b) return b.getWorldPosition(out);
  if (h.headPosition?.lengthSq?.()) return out.copy(h.headPosition);
  return h.root.getWorldPosition(out).add(_p.set(0, 1.5, 0));
}

/**
 * Hold the ghost's face `dist` metres in front of the eyes, every frame, its hands on Ton's head.
 * opts { dist=0.34, from=1.1 (it lunges in from here over `lunge` s), lunge=0.12, hands=true,
 *        pull=0.9 (how hard the head is held: the look is locked where it was), shake=1,
 *        drop=0.06 (face a little below the eyes),
 *        restore=true (stop() puts it back under its old parent, where it was) }
 */
export function grab(h, opts = {}) {
  if (!h?.root) return { st: {}, set() {}, stop() {} };
  makeVisible(h);
  const cam = engine.camera;
  const st = { dist: opts.dist ?? 0.34, shake: opts.shake ?? 1, headScale: 1, stretch: 1, drop: opts.drop ?? 0.06, alive: true, t: 0 };
  const from = opts.from ?? 1.1, lunge = opts.lunge ?? 0.12;
  // ride the cab when the eyes are in it (no lag at speed), else the world
  const t = g.taxi;
  const home = { parent: h.root.parent, pos: h.root.position.clone(), quat: h.root.quaternion.clone() };
  const parent = t?.isCameraInside?.() ? t.bodyInner || t.root || engine.scene : engine.scene;
  parent.attach(h.root);
  const handL = new THREE.Object3D(), handR = new THREE.Object3D();
  engine.scene.add(handL, handR);
  if (opts.hands !== false) {
    h.setHandTarget?.('L', handL, { weight: 1, fingers: 'claw', grip: 1, blend: 0.08 });
    h.setHandTarget?.('R', handR, { weight: 1, fingers: 'claw', grip: 1, blend: 0.08 });
  }
  h.lookAt?.(cam, { speed: 40, weight: 1, unlimited: true });
  h.setGhost?.({ stare: 1, noBlink: 1, unlimited: 1 }, 40);
  const hs0 = h.bones?.Head ? h.bones.Head.scale.clone() : null;
  // the head is held: the look is locked where it was (a fixed hold, never a pull toward the face
  // itself, which would chase its own tail), the eyes level, struggling a little against it
  const yaw0 = cameraRig.yaw, pitch0 = Math.max(-0.3, Math.min(0.2, cameraRig.pitch));
  const hold = (dt) => {
    if (!st.alive) return;
    const k = Math.min(1, dt * 10 * (opts.pull ?? 0.9));
    cameraRig.yaw += (yaw0 - cameraRig.yaw) * k;
    cameraRig.pitch += (pitch0 - cameraRig.pitch) * k;
  };
  const offHold = engine.onUpdate(hold, 49);
  const place = (dt) => {
    if (!st.alive || h.disposed) return;
    st.t += dt;
    cam.getWorldPosition(_v);
    cam.getWorldQuaternion(_q);
    _f.set(0, 0, -1).applyQuaternion(_q);
    _r.set(1, 0, 0).applyQuaternion(_q);
    _u.set(0, 1, 0).applyQuaternion(_q);
    // the lunge: from arm's length to the face in a few frames
    const k = Math.min(1, st.t / lunge);
    const dist = from + (st.dist - from) * (1 - (1 - k) * (1 - k));
    const par = h.root.parent || engine.scene;
    par.updateWorldMatrix(true, false);
    // facing the eyes, upright in the camera's frame (yaw + a little of the camera's pitch)
    const yaw = Math.atan2(_f.x, _f.z);
    _q2.setFromEuler(new THREE.Euler(0, yaw, 0));
    h.root.quaternion.copy(par.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(_q2));
    if (h.bones?.Head && hs0) h.bones.Head.scale.set(hs0.x * st.headScale, hs0.y * st.headScale * st.stretch, hs0.z * st.headScale);
    h.root.updateMatrixWorld(true);
    // root offset so the head lands on the target point
    const rootW = h.root.getWorldPosition(_p);
    headWorld(h, _h).sub(rootW);
    if (_h.lengthSq() > 9) _h.set(0, 1.5, 0);
    const want = _v.clone().addScaledVector(_f, dist).addScaledVector(_u, -st.drop * (st.stretch > 1 ? 0.4 : 1)).sub(_h);
    h.root.position.copy(par.worldToLocal(want));
    h.root.updateMatrixWorld(true);
    // hands clamp the temples (a little in front of the eyes, at the sides of the view)
    handL.position.copy(_v).addScaledVector(_r, -0.13).addScaledVector(_u, 0.035).addScaledVector(_f, 0.05);
    handR.position.copy(_v).addScaledVector(_r, 0.13).addScaledVector(_u, 0.035).addScaledVector(_f, 0.05);
    handL.updateMatrixWorld(true);
    handR.updateMatrixWorld(true);
    // held and shaken
    if (cameraRig.trauma < 0.25 * st.shake) cameraRig.shake(0.03 * st.shake);
  };
  const off = engine.onUpdate(place, 55);
  place(0); // visible on this very frame
  return {
    st,
    h,
    set(o) {
      Object.assign(st, o);
    },
    stop() {
      if (!st.alive) return;
      st.alive = false;
      off();
      offHold();
      h.setHandTarget?.('L', null);
      h.setHandTarget?.('R', null);
      handL.removeFromParent();
      handR.removeFromParent();
      if (h.bones?.Head && hs0) h.bones.Head.scale.copy(hs0);
      // back where it came from (a passenger to its seat), unless told to stay
      if (opts.restore !== false && home.parent && !h.disposed) {
        home.parent.add(h.root);
        h.root.position.copy(home.pos);
        h.root.quaternion.copy(home.quat);
      }
    },
  };
}

/** The scream into the camera: the jaw unhinges, a layered close scream, the view shakes. */
export async function scream(h, seconds = 1.1) {
  h?.setGhostMotion?.('gape', { amount: 1, instant: true });
  h?.setGhost?.({ mouthStretch: 1, jitter: 0.9, stare: 1 }, 40);
  const at = h?.root ? headWorld(h, new THREE.Vector3()) : null;
  playVoice(shriekBuffer(), { volume: 1, position: at, ref: 1.2, reverb: 0.15 });
  play('scream_far', { synth: true, volume: 1, rate: 0.9, position: at, ref: 3 });
  play('scream_far', { synth: true, volume: 0.7, rate: 0.62, delay: 0.05, position: at, ref: 3 });
  play('sting_reveal', { volume: 1 });
  play('scare_hit', { volume: 1 });
  cameraRig.shake(0.85);
  g.camfx?.flinch?.(1);
  try {
    postfx.flash?.(new THREE.Color(0.7, 0.68, 0.64), 0.06);
  } catch (e) { /* optional */ }
  await wait(seconds);
}

/**
 * It eats him: the mouth comes over the lens, the head swelling and the jaw dropping past its range;
 * crunching, wet tearing, blood sprayed over the view; a hard cut to black. Leaves the screen black
 * (the death flow takes it from there).
 */
export async function eat(h, ctl) {
  if (!h) return;
  h.setGhostMotion?.('gape', { amount: 1, instant: true });
  h.setGhost?.({ mouthStretch: 1, jitter: 1, stare: 1 }, 60);
  play('breath', { volume: 1, rate: 0.45 });
  const d0 = ctl?.st?.dist ?? 0.34;
  const t0 = performance.now();
  // a beat of stillness (it is so close you can hear it breathe), then the lunge over the lens
  await wait(0.35);
  playVoice(shriekBuffer(), { volume: 0.9, rate: 0.7 });
  await new Promise((res) => {
    const t1 = performance.now();
    const off = engine.onUpdate(() => {
      const k = Math.min(1, (performance.now() - t1) / 260);
      const e = k * k;
      ctl?.set?.({ dist: d0 + (0.09 - d0) * e, headScale: 1 + 0.9 * e, stretch: 1 + 0.55 * e, shake: 1 + 2 * k, drop: 0.02 });
      if (k >= 1 || performance.now() - t0 > 3000) {
        off();
        res();
      }
    }, 54);
  });
  const cam = engine.camera;
  const p = cam.getWorldPosition(new THREE.Vector3());
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
  playVoice(crunchBuffer(), { volume: 1 });
  play('bone_crack', { volume: 1, rate: 0.75 });
  play('neck_snap', { volume: 0.9, rate: 0.8, delay: 0.16 });
  play('splash', { volume: 0.7, rate: 0.55, delay: 0.08 });
  try {
    g.blood?.spray?.(p.clone().addScaledVector(fwd, 0.15), fwd.clone().negate(), 1);
    g.blood?.drip?.(p, 1);
  } catch (e) { /* optional */ }
  if (g.settings?.get?.('gore') !== 'off') postfx.bloodSplash?.(g.settings?.get?.('gore') === 'reduced' ? 0.55 : 1);
  cameraRig.shake(1);
  await wait(0.12);
  // hard cut
  postfx.params.fade = 1;
  // never left on black: if no death took it from here (a kill refused), the picture comes back
  setTimeout(() => {
    if (!g.isDying?.() && g.fsm?.is?.('shift') && postfx.params.fade >= 0.99) postfx.params.fade = 0;
  }, 2500);
  ctl?.stop?.();
  if (h.root) h.root.visible = false;
  await wait(0.9);
}

/** It lets go (early game): a shove back, a last hiss, gone in a frame. */
export async function release(h, ctl) {
  play('breath', { volume: 0.8, rate: 0.6 });
  ctl?.set?.({ dist: 0.6 });
  await wait(0.12);
  ctl?.stop?.();
  if (h?.root) h.root.visible = false;
  h?.setGhostMotion?.('none', { instant: true });
  cameraRig.shake(0.5);
  g.camfx?.relief?.();
}

/** The pret's whistle at a world position (or following `object`). */
export function pretWhistle(opts = {}) {
  return playVoice(whistleBuffer(), { volume: 1, ref: 14, rolloff: 0.35, reverb: 0.55, ...opts });
}
