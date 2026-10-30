// Taxi exterior beauty shots at night: under a sodium streetlight, in the headlights of
// another car, on wet asphalt in the forest set.
// Params: cam=tq|side|front|rear|reartq|low|interior|doors, hour, rain, fog, lights=off|low|high,
//         other=1 (second car's headlights), open=0..1 (doors/trunk), dist (camera distance scale)
import * as THREE from 'three';
import { Taxi } from '../vehicle/index.js';
import { buildTestSet, addStreetlight, applyEnv } from './vehicle-common.js';

export default async function ({ engine, cameraRig, params }) {
  applyEnv(params, { hour: 22.5, rain: 0.3, fog: 0.3 });
  const { world } = buildTestSet(engine.scene);
  addStreetlight(engine.scene, new THREE.Vector3(-5.2, 0, -3), 1, Number(params.get('lamp') ?? 34));
  const taxi = new Taxi({ world });
  engine.scene.add(taxi.root);
  taxi.setPose(new THREE.Vector3(-1.55, 0, 0), Number(params.get('heading') ?? 0) * (Math.PI / 180));
  window.__taxi = taxi;
  const s = taxi.state;
  s.keyInserted = true;
  s.ignition = 'on';
  s.engineOn = true;
  s.headlights = params.get('lights') || 'low';
  s.cabinLight = params.get('cabin') === '1';
  s.radioOn = true;
  s.indicator = params.get('ind') || 'off';
  const open = Number(params.get('open') ?? 0);
  if (open) {
    s.doors.fl = open;
    s.doors.rr = open * 0.8;
    s.doors.trunk = open * 0.6;
  }
  if (params.get('win')) s.windows.fr = s.windows.fl = Number(params.get('win'));
  // a second car's headlights from behind / the side
  if (params.get('other') !== '0') {
    const other = new Taxi({ world });
    engine.scene.add(other.root);
    other.setPose(new THREE.Vector3(1.6, 0, -16), Math.PI + 0.12);
    Object.assign(other.state, { keyInserted: true, ignition: 'on', engineOn: true, headlights: 'high' });
    other.root.visible = params.get('showOther') === '1';
    if (!other.root.visible) {
      // keep only its lights in the scene
      other.root.visible = true;
      other.bodyInner.traverse((o) => {
        if (o.isMesh) o.visible = false;
      });
      other.chassis.visible = false;
    }
  }
  const cam = params.get('cam') || 'tq';
  const k = Number(params.get('dist') ?? 1);
  const views = {
    tq: [[4.2, 1.45, -4.6], [-1.4, 0.75, 0.2]],
    side: [[5.4, 1.0, 0.2], [-1.55, 0.75, 0.1]],
    front: [[-0.9, 1.1, -6.8], [-1.55, 0.7, 0]],
    rear: [[0.6, 1.5, 6.5], [-1.55, 0.8, 0]],
    reartq: [[-5.6, 1.6, 4.8], [-1.55, 0.7, 0]],
    low: [[2.6, 0.45, -4.2], [-1.6, 0.8, 0.3]],
    doors: [[2.4, 1.6, -2.2], [-1.9, 0.8, 0.5]],
    interior: [[-3.4, 1.25, -0.4], [-1.2, 1.0, 0.2]],
    wheel: [[0.2, 0.55, -2.1], [-0.85, 0.32, -1.36]],
  };
  const [p, t] = views[cam] || views.tq;
  const pos = new THREE.Vector3(...p);
  const tgt = new THREE.Vector3(...t);
  pos.sub(tgt).multiplyScalar(k).add(tgt);
  cameraRig.cinematic({ position: pos, lookAt: tgt, fov: Number(params.get('fov') ?? 45), cut: true });
}
