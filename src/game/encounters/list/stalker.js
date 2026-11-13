// The stalker (night-long, see ../Stalker.js): one beat per run, bolder as the night goes on.
//  0–1 tree line: it walks at the edge of the trees keeping pace (a real walk), peeking from behind a
//      trunk; looked at straight, it steps behind cover; you pass it and it is ahead again, nearer
//  2   roadside: on the shoulder, its head turning after you. Do not stop for it (it walks to your door)
//  3   one frame on the back seat in the rear-view mirror; the springs settle. Rule 3: do not look back
//  4   in your lane. Rule 12: no brake, no swerve; drive through it and it lets you go tonight
import * as THREE from 'three';
import { LAYERS } from '../../../core/layers.js';
import { createCreatureHumanoid, CREATURE_SPECS } from '../../../creatures/index.js';
import { RULE_PARAMS } from '../../data/rules.js';
import { stalker, findOccluder, peekBehind } from '../Stalker.js';
import { S, rand, g, stoppedFor } from '../helpers.js';

export function canStart() {
  return stalker.level >= 0 && S.cameraInside();
}

function figure(E) {
  const h = E.track(createCreatureHumanoid(CREATURE_SPECS.stalker));
  S.engine.scene.add(h.root);
  h.setGhost({ stare: 1, noBlink: 1, headPitch: 0.18 }, 100);
  h.setGroundFn?.((x, z) => S.ground(x, z, S.taxiPos().y));
  h.setGhostMotion?.('watcher');
  return h;
}

/** Looked at straight (cone, seconds): it steps behind the nearest cover and is gone. */
async function hideWhenSeen(E, h, until) {
  let seen = 0;
  const ok = await E.until((dt) => {
    if (S.isLooking(h.headPosition, 6) && h.opacity > 0.5) seen += dt;
    else seen = Math.max(0, seen - dt);
    return seen > 0.28 || until();
  }, 60);
  if (!E.alive || !(seen > 0.28)) return false;
  h.setGhostMotion?.('stopMotion');
  const eye = S.engine.camera.getWorldPosition(new THREE.Vector3());
  const occ = findOccluder(h.root.position, 4.5);
  const dir = h.root.position.clone().sub(eye).setY(0).normalize();
  const to = occ ? new THREE.Vector3(occ.x, 0, occ.z).addScaledVector(dir, occ.r + 0.4) : h.root.position.clone().addScaledVector(dir, 3);
  h.walkTo(to, { speed: 2.1 });
  await E.until((dt, el) => (h.setOpacity(Math.max(0, 1 - el / 0.55)), el > 0.55), 1);
  return true;
}

async function treeline(E, L) {
  const side = Math.random() < 0.55 ? -1 : 1;
  for (let k = 0; k < 2 && E.alive; k++) {
    const lat = side * Math.max(6, 15 - L * 3 - k * 2);
    const r = S.roadAhead(k === 0 ? rand(62, 80) : rand(95, 115), lat);
    const h = figure(E);
    const occ = findOccluder(r.pos, 5);
    if (occ) peekBehind(h, occ, S.engine.camera.getWorldPosition(new THREE.Vector3()), -side);
    else {
      h.root.position.copy(r.pos);
      h.root.rotation.y = Math.atan2(r.right.x * side, r.right.z * side);
    }
    h.lookAt(S.engine.camera, { speed: 1.5, weight: 0.8 });
    // as the car nears it walks out along the tree line, the way you drive (keeping pace; a real walk)
    await E.until(() => S.aheadOf(h.root.position) < 42, 30);
    if (!E.alive) return;
    E.event('encounter:stalker');
    h.setGhost({ headRoll: 0, backbend: 0 }, 3);
    h.setGhostMotion?.('longStride');
    h.walkTo(h.root.position.clone().addScaledVector(r.tangent, 40), { speed: 1.35 });
    S.sfx('branch_crack', { position: h.root.position.clone(), volume: 0.5, rate: 0.8 });
    await hideWhenSeen(E, h, () => S.aheadOf(h.root.position) < -6);
    h.setVisible(false);
  }
}

async function roadside(E) {
  for (let k = 0; k < 2 && E.alive; k++) {
    const r = S.roadAhead(k === 0 ? rand(85, 100) : rand(115, 130), -(4.7 - k * 0.8));
    const h = figure(E);
    h.root.position.copy(r.pos);
    h.root.rotation.y = Math.atan2(-r.right.x, -r.right.z);
    h.setGhost({ headRoll: 0.2, still: 1 }, 100);
    h.lookAt(S.engine.camera, { speed: 0.8, unlimited: true });
    if (k === 0) E.event('encounter:stalker');
    // do not stop for it: stop near it and it walks to your door
    const stop = stoppedFor(1.2, 4);
    let walking = false;
    const res = await E.until((dt) => {
      const d = S.aheadOf(h.root.position);
      if (d < 45 && d > -3 && stop(dt) && !walking) {
        walking = true;
        h.setGhost({ still: 0 }, 4);
        h.setGhostMotion?.('longStride');
        h.walkTo(S.fromTaxi(-1.3, 0, -0.2), { speed: 1.15 });
        E.whisper({ who: 'voice', th: 'จอดรอฉันเหรอ', en: 'Waiting for me?', tone: 'whisper' }, h.headPosition.clone());
      }
      if (walking && S.speedKmh() > 8) {
        h.stopWalking();
        walking = false;
      }
      if (walking && h.root.position.distanceTo(S.fromTaxi(-1.2, 0, -0.2)) < 1.4) return 'reached';
      return d < -8;
    }, 70);
    if (!E.alive) return;
    if (res && h.root.position.distanceTo(S.fromTaxi(-1.2, 0, -0.2)) < 1.5) {
      E.violate('roadFigure', 'stoppedForIt');
      await E.wait(10);
      return;
    }
    h.setVisible(false);
  }
}

async function backSeat(E) {
  const t = E.taxi;
  const seat = t.seats?.rearRight;
  if (!seat) return;
  const h = E.track(createCreatureHumanoid(CREATURE_SPECS.stalker, { layer: LAYERS.REFLECTION_ONLY }));
  h.sitAt(seat, { pose: 'sitCar' });
  h.setLayer(LAYERS.REFLECTION_ONLY);
  h.setGhost({ stare: 1, noBlink: 1, still: 1 }, 100);
  h.setGhostMotion?.('watcher');
  h.lookAt(S.engine.camera, { speed: 20, unlimited: true });
  h.setVisible(false);
  const ok = await E.until(() => S.lookingAtMirror('mirror_rear'), 18);
  if (!E.alive || !ok) return;
  // exactly one rendered frame
  h.setVisible(true);
  await E.wait(0.001);
  h.setVisible(false);
  E.event('encounter:stalker');
  const kg0 = t.physicsSim?.seatKg?.rearRight ?? 0;
  t.setSeatWeight?.('rearRight', kg0 + 72);
  E.cleanup(() => t.setSeatWeight?.('rearRight', kg0));
  // rule 3 for a few seconds: it is right behind you now
  try {
    g.rules?.arm?.('r3', { encounter: E.handle, until: 7, params: { mode: 'death', death: 'lookBack', seat: 'rearRight' } });
  } catch (e) { /* optional */ }
  E.report('start', { ruleId: 'r3' });
  await E.wait(1.2);
  E.whisper({ who: 'voice', th: 'ข้างหลังนี่...', en: 'Right behind you...', tone: 'whisper' }, S.fromTaxi(0.4, 1.1, 0.7));
  const looked = await E.until(() => !E.managed && S.lookingBack(), 6);
  if (looked && E.alive) {
    E.violate('lookBack', 'lookedBack');
    await E.wait(10);
    return;
  }
  t.setSeatWeight?.('rearRight', kg0);
}

async function inRoad(E) {
  const r = S.roadAhead(85, -1.55);
  const h = figure(E);
  h.root.position.copy(r.pos);
  h.root.rotation.y = r.yaw + Math.PI;
  h.setGhost({ still: 1, headPitch: 0.05, headRoll: 0.12 }, 100);
  h.setGhostMotion?.('stopMotion');
  h.lookAt(S.engine.camera, { speed: 0.6, weight: 0.6 });
  try {
    g.rules?.arm?.('r12', { encounter: E.handle, params: { position: r.pos.clone() } });
  } catch (e) { /* optional */ }
  E.report('start', { ruleId: 'r12' });
  let shown = false;
  const res = await E.until(() => {
    const d = S.aheadOf(r.pos);
    if (!shown && d < 70) {
      shown = true;
      E.event('encounter:stalker');
    }
    if (!E.managed && d < RULE_PARAMS.roadFigureDangerM && d > 0 && S.speedKmh() < RULE_PARAMS.roadFigureNoBrakeMinKmh) return 'braked';
    return d < -0.5;
  }, 60);
  if (!E.alive) return;
  if (res && S.aheadOf(r.pos) >= -0.5) {
    E.violate('roadFigure', 'braked');
    await E.wait(10);
    return;
  }
  // through it: cold, the glass fogs; it lets you go until tomorrow night
  E.g.postfx?.flash?.(0xe8f0ff, 0.2);
  S.sfx('sting_reveal', { volume: 0.7 });
  E.taxi?.setFog?.('windshield', 0.8);
  h.setVisible(false);
  stalker.done = true;
  await E.wait(2);
  E.taxi?.setFog?.('windshield', 0.2);
}

export async function run(E) {
  const L = stalker.level;
  if (L < 0 || !E.taxi) return;
  if (L <= 1) await treeline(E, L);
  else if (L === 2) await roadside(E);
  else if (L === 3) await backSeat(E);
  else await inRoad(E);
  if (E.alive && !E._violated) stalker.advance();
}
