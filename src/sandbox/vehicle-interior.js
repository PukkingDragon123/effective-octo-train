// Driver POV inside the taxi at night: dashboard lit, rain on the windshield, wipers
// mid-sweep, condensation partly wiped, mirrors showing things behind the car.
// Params: cam=driver|passenger|rear|mirror|dash, yaw, pitch, cabin=0|1, rain, fog (weather),
//         condense=0..1, wipers=0|1|2, hour, lights=off|low|high, drive=1 (autopilot), marks=1
import * as THREE from 'three';
import { Taxi, loadVehicleAssets } from '../vehicle/index.js';
import { buildTestSet, addStreetlight, applyEnv } from './vehicle-common.js';
import { lightPool, paintedMaterial } from '../render/index.js';
import { LAYERS } from '../core/layers.js';

export default async function ({ engine, cameraRig, params, interact }) {
  if (params.get('procedural') !== '1') await loadVehicleAssets();
  const env = applyEnv(params, { hour: 22, rain: 0.7, fog: 0.25 });
  const { world, road } = buildTestSet(engine.scene);
  // streetlights: one ahead, one behind (shows in the mirrors)
  addStreetlight(engine.scene, new THREE.Vector3(-5, 0, -26), 1, 30);
  addStreetlight(engine.scene, new THREE.Vector3(5.2, 0, 24), -1, 30);
  // something to see in the mirrors: a figure + a white post behind the car
  const fig = new THREE.Group();
  const robe = paintedMaterial({ color: 0xd8d4c8, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.0, 4, 10), robe);
  body.position.y = 0.8;
  const headM = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), paintedMaterial({ color: 0x1a1412, roughness: 0.9 }));
  headM.position.y = 1.55;
  fig.add(body, headM);
  fig.position.set(-2.2, 0, 13);
  engine.scene.add(fig);
  for (const [x, z] of [[-4, 8], [4, 16], [-4, 30]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), paintedMaterial({ color: 0xe8e4dc, roughness: 0.6 }));
    post.position.set(x, 0.5, z);
    engine.scene.add(post);
  }

  const taxi = new Taxi({ world });
  engine.scene.add(taxi.root);
  const smp = road.sample(40 - 0.5);
  taxi.setPose(new THREE.Vector3(-1.55, 0, 0), 0);
  window.__taxi = taxi;

  // dashboard on
  taxi.state.keyInserted = true;
  taxi.state.ignition = 'on';
  taxi.state.engineOn = params.get('engine') !== '0';
  taxi.state.handbrake = false;
  taxi.state.gear = 'D';
  taxi.state.headlights = params.get('lights') || 'low';
  taxi.state.cabinLight = params.get('cabin') === '1';
  taxi.state.radioOn = params.get('radio') !== '0';
  taxi.state.radioStation = 0;
  taxi.state.wipers = Number(params.get('wipers') ?? 1);
  taxi.state.meterOn = params.get('meter') === '1';
  taxi.state.vacantLamp = !taxi.state.meterOn;
  if (params.get('visor') === '1') taxi.state.visor = true;
  if (params.get('glove') === '1') taxi.state.glovebox = true;
  if (params.get('win')) taxi.state.windows.fr = Number(params.get('win'));
  const condense = Number(params.get('condense') ?? 0.4);
  taxi.setFog('all', condense);
  taxi.glass.fillFog('all', condense);
  // hand-wiped patches on the windshield and the driver's window
  const ws = taxi.glass.panes.windshield;
  for (let i = 0; i < 26; i++) {
    const u = 0.52 + 0.24 * Math.cos(i * 0.25), v = 0.35 + 0.22 * Math.sin(i * 0.25) * 0.8;
    ws.stamp(u, v, 0.06, (k, w) => {
      ws.fogF[k] = Math.max(0, ws.fogF[k] - w * 1.6);
      ws.smearF[k] = Math.max(ws.smearF[k], 0.5 * w);
    });
  }
  ws._smearAny = true;
  const fr = taxi.glass.panes.fr;
  for (let i = 0; i < 18; i++) {
    fr.stamp(0.45 + 0.3 * (i / 18), 0.5 + 0.12 * Math.sin(i), 0.12, (k, w) => {
      fr.fogF[k] = Math.max(0, fr.fogF[k] - w * 1.5);
      fr.smearF[k] = Math.max(fr.smearF[k], 0.5 * w);
    });
  }
  fr._smearAny = true;
  if (params.get('marks') === '1') {
    taxi.addGlassMark('fl', 'handprint', new THREE.Vector2(0.4, 0.55), { size: 1.4, drag: true });
    taxi.addGlassMark('windshield', 'text', new THREE.Vector2(0.25, 0.7), { text: 'ช่วยด้วย', size: 1.2 });
  }
  if (params.get('drive') === '1') taxi.autopilot({ splineId: 'main', speedKmh: Number(params.get('speed') ?? 45), lane: -1.55 });

  // camera
  const cam = params.get('cam') || 'driver';
  const yaw = Number(params.get('yaw') ?? 0) * (Math.PI / 180);
  const pitch = Number(params.get('pitch') ?? -6) * (Math.PI / 180);
  if (cam === 'driver' || cam === 'mirror' || cam === 'dash') {
    const presets = { driver: [yaw, pitch], mirror: [0.55, 0.05], dash: [0.08, -0.38] };
    const [y, p] = params.get('yaw') ? [yaw, pitch] : presets[cam];
    cameraRig.attach(taxi.anchors.driverEye, taxi.bodyInner, { yaw: y, pitch: p });
  } else {
    const views = {
      passenger: [[-0.37, 1.12, 0.3], [0.3, 0.9, -0.6]],
      rear: [[0.0, 1.15, 1.1], [0.15, 0.95, -0.6]],
      bead: [[0.05, 1.05, -0.35], [0.37, 0.55, 0.3]],
      top: [[0.0, 1.3, 0.6], [0.1, 0.7, -0.6]],
    };
    const [p, t] = views[cam] || views.passenger;
    const eye = new THREE.Object3D();
    eye.position.set(...p);
    taxi.bodyInner.add(eye);
    const look = new THREE.Vector3(...t).sub(new THREE.Vector3(...p));
    cameraRig.attach(eye, taxi.bodyInner, { yaw: Math.atan2(-look.x, -look.z), pitch: Math.atan2(look.y, Math.hypot(look.x, look.z)) });
  }
  cameraRig.fovBase = Number(params.get('fov') ?? 72);
  // warm-up: let wipers sweep and masks settle
  const warm = Number(params.get('warm') ?? 40);
  for (let i = 0; i < warm; i++) engine.step(1 / 30);
}
