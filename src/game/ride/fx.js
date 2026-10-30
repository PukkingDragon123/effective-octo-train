// Ride helpers: road position of the taxi, seamless teleports along a spline (the road
// "folds"), fog fades, a robust autopilot stop for drop-offs.
import * as THREE from 'three';
import { g } from '../context.js';
import { wait, until } from '../util.js';
import { clamp, wrapAngle } from '../../core/math.js';
import { GLOBAL_UNIFORMS } from '../../render/index.js';
import { LAYOUT } from '../../world/layout.js';

const _c = new THREE.Color();

/** {id, s, lateral} of the taxi on the road network (null before the physics has projected it). */
export function taxiRoad() {
  const sim = g.taxi?.physicsSim;
  const ref = sim?.roadRef;
  if (!ref) return null;
  return { id: ref.id, s: ref.s, lateral: sim.lateral ?? 0 };
}

/** Main-road arc length of a world point. */
export function mainS(pos) {
  return g.world.road.projectOnto('main', pos).s;
}

/** Move the taxi to (id, s) keeping its lateral offset, heading offset and speed. */
export function teleportAlong(id, s, opts = {}) {
  const t = g.taxi;
  const sim = t.physicsSim;
  const road = g.world.road;
  const L = road.length(id);
  s = clamp(s, 2, L - 2);
  const pr = road.projectOnto(id, sim.pos);
  const lat = opts.lateral ?? clamp(pr.lateral, -2.4, 2.4);
  const roadYaw = Math.atan2(-pr.tangent.x, -pr.tangent.z);
  const yawOff = opts.keepHeading === false ? 0 : clamp(wrapAngle(sim.yaw - roadYaw), -0.6, 0.6);
  const smp = road.sample(id, s);
  const pos = smp.pos.clone().addScaledVector(smp.right, lat);
  const v = opts.speed !== undefined ? opts.speed / 3.6 : sim.v;
  const rpm = sim.rpm, autoGear = sim.autoGear;
  t.setPose(pos, Math.atan2(-smp.tangent.x, -smp.tangent.z) + yawOff);
  sim.v = v;
  sim.rpm = rpm;
  if (autoGear !== undefined) sim.autoGear = autoGear;
  sim.roadRef = { id, s };
}

/** Place the taxi standing on the left lane at (id, s), facing along the road. */
export function placeTaxi(id, s, speedKmh = 0) {
  const t = g.taxi;
  const road = g.world.road;
  const smp = road.sample(id, clamp(s, 2, road.length(id) - 2));
  const pos = smp.pos.clone().addScaledVector(smp.right, LAYOUT.laneOffset);
  t.autopilot(null);
  t.setPose(pos, Math.atan2(-smp.tangent.x, -smp.tangent.z));
  t.physicsSim.v = speedKmh / 3.6;
  t.physicsSim.roadRef = { id, s };
}

/** Fade to the fog colour (mist) and back around `fn` (the fold happens inside). */
export async function fogFade(fn, opts = {}) {
  const p = g.postfx.params;
  _c.copy(GLOBAL_UNIFORMS.uFogColor?.value || _c.setRGB(0.1, 0.12, 0.12));
  if (opts.tint) _c.lerp(new THREE.Color(opts.tint), 0.5);
  const prevBoost = g.sky?.fogBoost ?? 1;
  g.sky?.setFogBoost?.(Math.max(prevBoost, 3.5), opts.in ?? 0.9);
  g.audio?.play?.('whisper', { volume: 0.25, object: g.taxi?.anchors?.driverEye });
  await g.cine.fade(opts.depth ?? 0.94, opts.in ?? 0.9, _c);
  try {
    await fn?.();
  } catch (e) {
    console.error('[ride] fold failed', e);
  }
  await wait(opts.hold ?? 0.3);
  g.sky?.setFogBoost?.(opts.after ?? prevBoost, 2.5);
  await g.cine.fade(0, opts.out ?? 1.4);
}

/** The road folds back: the taxi re-appears `back` metres earlier on the same road, still moving. */
export async function foldBack(back, opts = {}) {
  const r = taxiRoad();
  if (!r) return;
  await fogFade(() => {
    const now = taxiRoad() || r;
    const min = opts.minS ?? 4;
    teleportAlong(now.id, Math.max(min, now.s - back));
  }, opts);
}

/**
 * Bring the taxi to a stop at (splineId, stopS): when the driver gets close (or stops on the way),
 * the autopilot takes over the last metres. Resolves when stopped (or `alive()` turns false).
 */
export async function driveToStop(splineId, stopS, alive = () => true, opts = {}) {
  const t = g.taxi;
  let slow = 0;
  await until((dt) => {
    if (!alive()) return true;
    const r = taxiRoad();
    if (!r) return false;
    slow = t.speedKmh < 3 ? slow + dt : 0;
    if (r.id !== splineId) return slow > 6; // somewhere else and parked: take over anyway
    return r.s > stopS - (opts.takeover ?? 45) || slow > 2.5;
  });
  if (!alive()) return false;
  const gear = t.state.gear;
  t.setControlsEnabled(false);
  const r = taxiRoad();
  const onIt = r && r.id === splineId;
  const stopAt = onIt && r.s > stopS - 3 ? Math.min(g.world.road.length(splineId) - 3, r.s + 8) : stopS;
  if (!onIt) placeTaxi(splineId, Math.max(4, stopS - 30), clamp(t.speedKmh, 0, 25));
  const ap = t.autopilot({ splineId, stopAt, speedKmh: clamp(t.speedKmh, 12, 28) });
  await Promise.race([ap, wait(16)]);
  t.autopilot(null);
  // standing at the kerb: neutral for a manual box (shift into first to go), D for an automatic
  void gear;
  t.state.gear = g.settings.get('transmission') === 'manual' ? 'N' : 'D';
  return alive();
}
