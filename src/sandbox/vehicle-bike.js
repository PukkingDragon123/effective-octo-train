// The intro motorbike on the night test road: headlight beam, basket, lean.
// Params: cam=tq|side|front|rider|rear, hour, rain, fog, preset, lean (degrees, static pose),
//         drive=1 (autopilot along the road for `warm` steps), speed (km/h), light=0 (headlight off)
import * as THREE from 'three';
import { Motorcycle, loadVehicleAssets } from '../vehicle/index.js';
import { buildTestSet, addStreetlight, applyEnv } from './vehicle-common.js';

export default async function ({ engine, cameraRig, params }) {
  if (params.get('procedural') !== '1') await loadVehicleAssets();
  applyEnv(params, { hour: 21.5, rain: 0.0, fog: 0.3, wet: 0.3 });
  const { world } = buildTestSet(engine.scene);
  addStreetlight(engine.scene, new THREE.Vector3(-5.2, 0, -10), 1, 26);
  const bike = new Motorcycle({ world });
  engine.scene.add(bike.root);
  bike.setPose(new THREE.Vector3(-1.3, 0, 0), 0);
  window.__bike = bike;
  if (params.get('light') === '0') bike.setHeadlight(false);
  if (params.get('drive') === '1') {
    bike.autopilot({ splineId: 'main', speedKmh: Number(params.get('speed') ?? 35), lane: -1.3 });
    const warm = Number(params.get('warm') ?? 40);
    for (let i = 0; i < warm; i++) engine.step(1 / 30);
  } else if (params.get('lean')) {
    bike.lean = (Number(params.get('lean')) * Math.PI) / 180;
    bike.steerA = -bike.lean * 0.3;
    bike._apply();
  }
  // camera relative to the bike
  const cam = params.get('cam') || 'tq';
  const views = {
    tq: [[2.2, 1.3, -2.6], [0, 0.6, 0]],
    side: [[3.4, 0.9, 0.0], [0, 0.6, 0]],
    front: [[0.4, 1.0, -3.2], [0, 0.7, 0]],
    rear: [[0.8, 1.4, 3.4], [0, 0.6, -2]],
    rider: [[0, 1.5, 0.05], [0, 0.6, -5]],
  };
  const [p, t] = views[cam] || views.tq;
  bike.root.updateMatrixWorld(true);
  const pos = bike.root.localToWorld(new THREE.Vector3(...p));
  const tgt = bike.root.localToWorld(new THREE.Vector3(...t));
  cameraRig.cinematic({ position: pos, lookAt: tgt, fov: Number(params.get('fov') ?? 50), cut: true });
}
