// Pickup landmarks. A ride's data may set `pickupAt` to a stop made here at runtime instead of
// its LAYOUT landmark (`pickup`, kept for the narrative validator):
//   firstHitch   the first customer, ~150 m past the KM 9 garage on the left shoulder, under an old
//                sodium lamp, thumb out (so the night starts right after the garage)
//
//   pickupLandmark(key) -> landmark { key, kind, pos, yaw, travelYaw, roadRef, side, sideSign,
//                                     waitPos, stopPos, stopYaw, facing, anchors }
import * as THREE from 'three';
import { g } from '../context.js';
import { LAYOUT } from '../../world/layout.js';
import { lookAtRoadYaw } from '../../world/constants.js';
import { createStreetlight } from '../../props/poles.js';

const SPECIAL = {
  firstHitch: { after: 'garage', ds: 150 },
};

/** The landmark a ride picks up at (`data.pickupAt || data.pickup`). */
export function pickupLandmark(key) {
  const L = g.world?.landmarks || {};
  if (L[key]) return L[key];
  const spec = SPECIAL[key];
  if (!spec) return L[key];
  try {
    return (L[key] = makeStop(key, spec));
  } catch (e) {
    console.warn(`[ride] pickup ${key} could not be made; using sala1`, e);
    return L.sala1;
  }
}

function makeStop(key, spec) {
  const road = g.world.road;
  const sp = road.get('main');
  const base = g.world.landmarks[spec.after];
  const s = Math.min(sp.length - 40, (base?.roadRef?.s ?? sp.length * 0.08) + spec.ds);
  const hw = (sp.width ?? LAYOUT.roadWidth) / 2;
  const travelYaw = sp.yawAt(s);
  const waitPos = sp.pointAt(s, -(hw + 0.75));
  const stopPos = sp.pointAt(Math.min(sp.length, s + 2.2), LAYOUT.laneOffset);
  stopPos.y += 0.025;
  const pos = sp.pointAt(s - 1.2, -(hw + 1.5));
  pos.y = g.world.getHeight(pos.x, pos.z);
  // the old lamp: arm out over the shoulder where they stand
  const smp = road.sample('main', s);
  const lamp = createStreetlight({ kind: 'sodium', height: 5.6, seed: 919, lean: 0.03 });
  lamp.object.position.copy(pos);
  lamp.object.rotation.y = Math.atan2(-smp.right.z, smp.right.x);
  g.world.group.add(lamp.object);
  lamp.object.updateMatrixWorld(true);
  const head = (lamp.lampAnchor || lamp.object).getWorldPosition(new THREE.Vector3());
  try {
    g.lightPool.add({ kind: 'sodium', position: head, intensity: 9, distance: 15, pool: true, poolRadius: 3.2, groundY: waitPos.y, glow: { size: 0.4, opacity: 0.85 }, beam: { length: 6, angle: 0.5, intensity: 0.35 }, priority: 4, name: 'firstHitchLamp' });
  } catch (e) {
    /* the pole alone still reads */
  }
  return {
    key, kind: 'hitch_lamp', spec, pos, yaw: travelYaw, travelYaw, roadRef: { id: 'main', s }, side: 'L', sideSign: -1,
    waitPos, stopPos, stopYaw: travelYaw, facing: lookAtRoadYaw(travelYaw, 'L'), roadHeight: sp.heightAt(s), anchors: { lamp: lamp.lampAnchor || null }, prop: lamp,
  };
}
