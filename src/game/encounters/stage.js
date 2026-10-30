// Staging helpers shared by every encounter: where things go around the moving taxi and along the
// road, what the player is looking at (gaze, mirrors, windows), spatial whispers / speakers, and
// temporary lights. Everything is defensive: missing systems (sandbox) fall back gracefully.
import * as THREE from 'three';
import { g } from '../context.js';
import { engine } from '../../core/Engine.js';
import { cameraRig } from '../../core/CameraRig.js';
import { bus } from '../../core/Events.js';
import { lightPool } from '../../render/index.js';
import { RULE_PARAMS } from '../data/rules.js';
import { CHARACTERS } from '../data/characters.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const DEG = Math.PI / 180;
export const GLASS_IDS = ['windshield', 'rear', 'fl', 'fr', 'rl', 'rr'];
export const MIRROR_IDS = ['mirror_rear', 'mirror_left', 'mirror_right'];
export { RULE_PARAMS, CHARACTERS };

export const taxi = () => g.taxi || null;
export const hour = () => g.clock?.hour ?? 22;

export function taxiPos(out = new THREE.Vector3()) {
  const t = taxi();
  if (!t) return out.set(0, 0, 0);
  t.root.updateWorldMatrix(true, false);
  return out.setFromMatrixPosition(t.root.matrixWorld);
}
export function taxiForward(out = new THREE.Vector3()) {
  const t = taxi();
  if (!t) return out.set(0, 0, -1);
  return out.set(0, 0, -1).applyQuaternion(t.root.quaternion).setY(0).normalize();
}
export function ground(x, z, fallback = 0) {
  try {
    const y = g.world?.getHeight?.(x, z);
    return Number.isFinite(y) ? y : fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * A point on the taxi's road `dist` metres ahead (negative = behind) along the travel direction,
 * at `lateral` metres (+ = right of travel, − = left: Thai traffic keeps left). Returns
 * { pos, tangent (travel dir), right, yaw (facing along travel), s, id }.
 */
export function roadAhead(dist, lateral = 0) {
  const t = taxi();
  const p = taxiPos(new THREE.Vector3());
  const fwd = taxiForward(new THREE.Vector3());
  const road = g.world?.road;
  let pos, tangent, right, s = 0, id = null;
  if (road?.project && road?.sample) {
    try {
      const pr = road.project(p, t?.physicsSim?.roadRef?.id ?? null);
      id = pr.id;
      const len = road.length?.(id) ?? Infinity;
      const tan0 = pr.tangent.clone();
      const sign = tan0.dot(fwd) >= 0 ? 1 : -1;
      s = Math.max(0, Math.min(len, pr.s + sign * dist));
      const smp = road.sample(id, s);
      tangent = smp.tangent.clone().multiplyScalar(sign).setY(0).normalize();
      right = new THREE.Vector3(-tangent.z, 0, tangent.x); // right of travel (y-up, -z forward)
      pos = smp.pos.clone().addScaledVector(right, lateral);
    } catch (e) {
      pos = null;
    }
  }
  if (!pos) {
    tangent = fwd.clone();
    right = new THREE.Vector3(-tangent.z, 0, tangent.x);
    pos = p.clone().addScaledVector(tangent, dist).addScaledVector(right, lateral);
  }
  pos.y = ground(pos.x, pos.z, p.y);
  return { pos, tangent, right, yaw: Math.atan2(-tangent.x, -tangent.z), s, id };
}

/** Taxi-local point -> world. */
export function fromTaxi(x, y, z, out = new THREE.Vector3()) {
  const t = taxi();
  if (!t) return out.set(x, y, z);
  const b = t.bodyInner || t.root;
  b.updateWorldMatrix(true, false);
  return out.set(x, y, z).applyMatrix4(b.matrixWorld);
}

/** Signed distance along the taxi's travel direction to a world point (+ ahead). */
export function aheadOf(pos) {
  return _v.copy(pos).sub(taxiPos(_v2)).dot(taxiForward(new THREE.Vector3()));
}
export function distTo(pos) {
  return taxiPos(_v2).distanceTo(pos);
}
export const speedKmh = () => taxi()?.speedKmh ?? 0;

// ------------------------------------------------------------------ gaze
export const gazeTarget = () => taxi()?.getGazeTarget?.() ?? null;
export const isLooking = (pos, deg = 12, maxDist = Infinity) => cameraRig.isLookingAt(pos, deg, maxDist);
export const onScreen = (pos, margin = 0) => cameraRig.isOnScreen(pos, margin);
export const lookingAtMirror = (id = null) => {
  const gt = gazeTarget();
  return id ? gt === id : !!gt && gt.startsWith('mirror');
};
export const lookingAtGlass = (includeWindshield = true) => {
  const gt = gazeTarget();
  if (!gt || gt === 'interior') return false;
  if (gt.startsWith('mirror')) return true;
  return includeWindshield || gt !== 'windshield';
};
/** Camera yaw relative to the car (deg; + left) and pitch (deg; + up). */
export const lookYawDeg = () => (cameraRig.yaw || 0) / DEG;
export const lookPitchDeg = () => (cameraRig.pitch || 0) / DEG;
export const lookingBack = () => Math.abs(lookYawDeg()) > RULE_PARAMS.lookBackYawDeg;
export const lookingForward = (cone = RULE_PARAMS.breathLookForwardConeDeg) => Math.abs(lookYawDeg()) < cone && Math.abs(lookPitchDeg()) < cone;
export const lookingDown = () => lookPitchDeg() < RULE_PARAMS.meter444LookDownPitchDeg;
export const cameraInside = () => !!taxi()?.isCameraInside?.();

// ------------------------------------------------------------------ speech
/** Make sure a dialogue speaker exists for `who` (CHARACTERS voice + name), optionally spatial at `object`. */
export function ensureSpeaker(who, object = null) {
  const d = g.dialogue;
  if (!d) return;
  const known = d.speakers?.get?.(who);
  const c = CHARACTERS[who];
  if (known && !object) return;
  if (!known || object) d.setSpeaker(who, { nameTH: c?.nameTH ?? '', nameEN: c?.nameEN ?? '', voice: c?.voice || known?.voice || { gender: 'f', ghost: 1 }, ...(object ? { object } : {}) });
}

/** A non-blocking whisper (subtitle + spatial voice), never interrupting the ride's dialogue. */
export function whisper(line, position = null, voice = null) {
  if (!line) return Promise.resolve();
  const v = voice || CHARACTERS[line.who]?.voice || { gender: 'f', age: 30, ghost: 1 };
  try {
    g.ui?.subtitle?.({ speakerTH: '', speakerEN: '', th: line.th, en: line.en, tone: line.tone || 'whisper', duration: 3.2, queue: true });
  } catch (e) { /* ui optional */ }
  bus.emit('encounter:whisper', { line });
  try {
    return g.audio?.voice?.speak?.({ th: line.th, en: line.en, voice: { ...v, whisper: line.tone !== 'ghost', ghost: Math.max(0.7, v.ghost || 0) }, position, tone: line.tone || 'whisper' }) || Promise.resolve();
  } catch (e) {
    return Promise.resolve();
  }
}

export function sfx(id, opts = {}) {
  try {
    return g.audio?.play?.(id, opts) || null;
  } catch (e) {
    return null;
  }
}
export function sfxLoop(id, opts = {}) {
  try {
    return g.audio?.loop?.(id, opts) || null;
  } catch (e) {
    return null;
  }
}

/** Temporary lamp (handle with .remove()). */
export function tempLight(spec) {
  try {
    return lightPool.add(spec);
  } catch (e) {
    return null;
  }
}

/** Respect points (r10 honks). */
export function respect() {
  return g.rules?.respect ?? g.save?.flags?.respect ?? 0;
}

/** A world landmark entry (or null). */
export function landmark(key) {
  return g.world?.landmarks?.[key] || null;
}
export function landmarkPos(key, out = new THREE.Vector3()) {
  const l = landmark(key);
  if (!l) return null;
  if (l.pos?.isVector3) return out.copy(l.pos);
  if (l.pos) return out.set(l.pos.x, l.pos.y ?? 0, l.pos.z);
  return null;
}

/** Ride passenger humanoid (B's ride: passenger may be a humanoid or carry one). */
export function passengerHumanoid(ctx = {}) {
  const p = ctx.passenger || g.ride?.passenger;
  if (!p) return null;
  if (p.humanoid?.setGhost) return p.humanoid;
  if (p.setGhost) return p;
  return null;
}
export function passengerId(ctx = {}) {
  return ctx.ride?.data?.id || g.ride?.data?.id || ctx.passengerId || null;
}
export function passengerSeat(ctx = {}) {
  return ctx.ride?.data?.seat || g.ride?.data?.seat || g.ride?.seat || null;
}

export { engine, cameraRig, bus, DEG };
