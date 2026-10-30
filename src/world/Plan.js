// Landmark planning (pure geometry, before anything is built): positions, orientations,
// pickup wait/stop points, terrain pads and forest clearings for every LAYOUT landmark.
import * as THREE from 'three';
import { W, faceRoadYaw, lookAtRoadYaw } from './constants.js';

/** Approximate footprints per kind: hx = half extent along the road, hz = half depth (toward/away from road). */
export const FOOTPRINT = {
  garage: { hx: 5.5, hz: 4.8, pad: 'concrete', clear: 9 },
  sala: { hx: 3, hz: 2.4, pad: 'concrete', clear: 5.5 },
  bus_stop: { hx: 2.2, hz: 1.3, pad: 'concrete', clear: 4 },
  noodle_shop: { hx: 4.5, hz: 3.4, pad: 'gravel', clear: 7 },
  forest_temple: { hx: 7, hz: 7, pad: 'dirt', clear: 11 },
  shrine_maruay: { hx: 5.5, hz: 5, pad: 'concrete', clear: 10 },
  spirit_cluster: { hx: 2.4, hz: 1.4, pad: 'gravel', clear: 3.8 },
  sacred_tree: { hx: 3, hz: 3, pad: 'dirt', clear: 6 },
  km_marker: { hx: 0.3, hz: 0.3, clear: 1 },
  accident_curve: { hx: 2.2, hz: 1.2, pad: 'gravel', clear: 3.5 },
  buddha_statue: { hx: 1.4, hz: 1.4, pad: 'dirt', clear: 3 },
  pond: { hx: 7, hz: 7, clear: 9 },
  banana_grove: { hx: 0, hz: 0, clear: 0 },
  elephant_crossing: { hx: 0.4, hz: 0.4, clear: 1 },
  market_crossroad: { hx: 6, hz: 3.5, pad: 'gravel', clear: 8 },
  lone_streetlight: { hx: 1.2, hz: 1, pad: 'gravel', clear: 3 },
  shrine_approach: { hx: 0, hz: 0, clear: 0 },
  ghost_gate: { hx: 4.5, hz: 1.2, clear: 0 },
  village_stop: { hx: 2.2, hz: 1.4, pad: 'concrete', clear: 4.5 },
  spur_start: { hx: 0, hz: 0, clear: 0 },
  spirit_house: { hx: 0.8, hz: 0.8, pad: 'gravel', clear: 2.4 },
  junction: { hx: 0, hz: 0, clear: 0 },
  bridge: { hx: 0, hz: 0, clear: 0 },
};

/**
 * Plan every landmark. Returns { landmarks: {key: entry}, pads: [], clearings: [{x,z,r, under?}], fork }
 * Each entry: { key, kind, spec, pos, yaw, travelYaw, roadRef:{id,s}, side, sideSign, waitPos, stopPos, stopYaw, facing, footprint }
 * (y values are filled once the terrain exists: see World.)
 */
export function planLandmarks(road, layout) {
  const hw = layout.roadWidth / 2;
  const landmarks = {};
  const pads = [];
  const clearings = [];
  for (const [key, spec] of Object.entries(layout.landmarks)) {
    const sp = road.get(spec.spline);
    if (!sp) continue;
    const s = Math.min(sp.length, Math.max(0, spec.u * sp.length));
    const fp = FOOTPRINT[spec.kind] || { hx: 1, hz: 1, clear: 2 };
    const side = spec.side;
    const sideSign = side === 'L' ? -1 : side === 'R' ? 1 : 0;
    const travelYaw = sp.yawAt(s);
    const hr = sp.heightAt(s);
    let lateral = sideSign * (hw + (spec.offset || 0) + fp.hz);
    if (spec.kind === 'km_marker' || spec.kind === 'elephant_crossing') lateral = sideSign * (hw + (spec.offset || 0.6));
    const pos = sp.pointAt(s, lateral);
    const yaw = side === 'C' ? travelYaw : faceRoadYaw(travelYaw, side);
    const waitSide = sideSign === 0 ? -1 : sideSign;
    const waitPos = sp.pointAt(s, waitSide * (hw + 0.75));
    const stopPos = sp.pointAt(Math.min(sp.length, s + 2.2), layout.laneOffset);
    stopPos.y += 0.025;
    const entry = {
      key, kind: spec.kind, spec, pos, yaw, travelYaw, roadRef: { id: sp.id, s }, side, sideSign,
      waitPos, stopPos, stopYaw: travelYaw, facing: lookAtRoadYaw(travelYaw, side === 'C' ? 'L' : side), footprint: fp, roadHeight: hr,
      anchors: {}, prop: null,
    };
    landmarks[key] = entry;
    if (fp.pad && sideSign !== 0) {
      pads.push({ x: pos.x, z: pos.z, hx: fp.hx + 0.6, hz: fp.hz + 0.6, yaw, h: hr - 0.02, blend: 3.5, kind: fp.pad });
    }
    if (fp.clear > 0) clearings.push({ x: pos.x, z: pos.z, r: fp.clear, key });
  }

  // ---- the fork: ศาลเจ้ามารวย in the wedge between the ghost (left) and human (right) branches.
  // Props contract: the prop origin is the fork point F on the main road; the building stands
  // `setback` m ahead along local -Z, the two signposts at `noseZ`. The axis bisects the wedge
  // and setback / noseZ are fitted so the footprint and the nose stay off both branch roads.
  const main = road.get('main');
  const ghost = road.get('ghost'), human = road.get('human');
  const L = main.length;
  const F = main.points[main.points.length - 1].clone();
  const travelF = main.yawAt(L);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  ghost.pointAt(34, 0, a);
  human.pointAt(34, 0, b);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const axisYaw = Math.atan2(-(mid.x - F.x), -(mid.z - F.z)); // local -Z along the wedge bisector
  const fw = { x: -Math.sin(axisYaw), z: -Math.cos(axisYaw) }; // world dir of local -Z
  const rt = { x: Math.cos(axisYaw), z: -Math.sin(axisYaw) }; // world dir of local +X
  const toWorld = (lx, lz, out = new THREE.Vector3()) => out.set(F.x + rt.x * lx - fw.x * lz, F.y, F.z + rt.z * lx - fw.z * lz);
  const branchClear = (p) => {
    let d = Infinity;
    for (const sp of [ghost, human]) {
      const pr = road.projectOnto(sp.id, p);
      d = Math.min(d, pr.distance);
    }
    return d;
  };
  const q = new THREE.Vector3();
  // nose: the two fork signposts (x = +-1.25) need both branch edges >= 1.6 m away
  let noseT = 6;
  for (; noseT < 60; noseT += 0.5) if (branchClear(toWorld(0, -noseT, q)) >= hw + 1.75) break;
  // footprint (createShrineMaRuay defaults): x +-6.25, z in [-SB-11.2, -SB+6]
  let SB = Math.max(10, noseT + 4);
  for (; SB < 90; SB += 0.5) {
    let ok = true;
    for (let lz = -SB - 11.2; lz <= -SB + 6 && ok; lz += 1.4) {
      for (let lx = -6.25; lx <= 6.25 && ok; lx += 1.25) if (branchClear(toWorld(lx, lz, q)) < hw + 0.7) ok = false;
    }
    if (ok) break;
  }
  const centreLocalZ = -SB - 4.1; // platform centre
  const shrineCentre = toWorld(0, centreLocalZ);
  const ghostHand = ghost.pointAt(Math.min(ghost.length * 0.4, SB + 14), 0);
  const dxh = ghostHand.x - F.x, dzh = ghostHand.z - F.z;
  const handLocal = [dxh * rt.x + dzh * rt.z, -(dxh * fw.x + dzh * fw.z)];
  const sm = landmarks.shrineMaRuay;
  if (sm) {
    sm.pos.copy(F); // prop origin = the fork point (createShrineMaRuay contract)
    sm.yaw = axisYaw;
    sm.travelYaw = travelF;
    sm.centre = shrineCentre.clone();
    sm.shrineOpts = { setback: SB, noseZ: -noseT, handSpawn: handLocal };
    sm.waitPos = main.pointAt(L - 6, -(hw + 0.75));
    sm.stopPos = main.pointAt(L - 14, layout.laneOffset);
    sm.stopPos.y += 0.025;
    sm.facing = travelF + Math.PI;
    const fc = toWorld(0, -SB - 2.6);
    pads.push({ x: fc.x, z: fc.z, hx: 6.6, hz: 9.2, yaw: axisYaw, h: F.y - 0.02, blend: 4, kind: 'concrete' });
    clearings.push({ x: fc.x, z: fc.z, r: 11.5, key: 'shrineMaRuay' });
    const nose = toWorld(0, -noseT);
    clearings.push({ x: nose.x, z: nose.z, r: 2.6, key: 'shrineNose' });
  }
  const fork = {
    pos: shrineCentre.clone(), yaw: travelF, ghostSplineId: 'ghost', humanSplineId: 'human', leftSplineId: 'ghost', rightSplineId: 'human',
    decisionS: L - 2, mainS: L, splitS: noseT, setback: SB, axisYaw, shrine: null,
    point: F.clone(),
  };
  return { landmarks, pads, clearings, fork };
}
