// Binder test for the professional-model path: builds a crude stand-in glTF scene that
// follows the taxi.glb node contract (TaxiGLB.js), injects it with setVehicleAssets and
// builds a Taxi from it. Checks every binding (doors, glass, mirrors, wheels, needles,
// lights, displays, anchors) without the real asset.
// Params: cam=tq|inside, open=0..1, hour, rain, fog, preset
import * as THREE from 'three';
import { Taxi, setVehicleAssets } from '../vehicle/index.js';
import { buildTestSet, addStreetlight, applyEnv } from './vehicle-common.js';

function fakeTaxiScene() {
  const scene = new THREE.Group();
  const mat = (name, color, extra = {}) => new THREE.MeshStandardMaterial({ name, color, roughness: 0.6, ...extra });
  const paint = mat('paint_yellow', 0xd0a834), green = mat('paint_green', 0x2e6840), black = mat('plastic_black', 0x151515), chrome = mat('chrome', 0xb0b0b0, { metalness: 0.8, roughness: 0.3 });
  const rubber = mat('rubber', 0x111111), lens = mat('lens_glass', 0xeeeeee), glass = mat('glass', 0x99aaaa, { transparent: true, opacity: 0.3 });
  const node = (name, geo, m, pos, parent = scene, rot = null) => {
    const o = new THREE.Mesh(geo, m);
    o.name = name;
    o.position.set(...pos);
    if (rot) o.rotation.set(...rot);
    parent.add(o);
    return o;
  };
  const body = new THREE.Group();
  body.name = 'body';
  scene.add(body);
  node('body_lower', new THREE.BoxGeometry(1.68, 0.5, 4.3), green, [0, 0.55, 0], body);
  node('body_upper', new THREE.BoxGeometry(1.6, 0.12, 4.2), paint, [0, 0.86, 0], body);
  node('roof', new THREE.BoxGeometry(1.4, 0.05, 1.5), paint, [0, 1.38, 0.35], body);
  for (const sx of [-1, 1]) node('pillar', new THREE.BoxGeometry(0.05, 0.45, 0.05), paint, [sx * 0.72, 1.14, -0.4], body);
  // doors (origin on the front hinge) with their glass
  for (const [id, z0, z1] of [['fl', -1.0, 0.05], ['fr', -1.0, 0.05], ['rl', 0.1, 0.78], ['rr', 0.1, 0.78]]) {
    const sx = id[1] === 'r' ? 1 : -1;
    const door = new THREE.Group();
    door.name = 'door_' + id;
    door.position.set(sx * 0.85, 0, z0);
    scene.add(door);
    node('door_' + id + '_skin', new THREE.BoxGeometry(0.06, 0.5, z1 - z0), paint, [0, 0.62, (z1 - z0) / 2], door);
    const g = new THREE.PlaneGeometry(z1 - z0 - 0.1, 0.36);
    g.rotateY(Math.PI / 2);
    node('glass_' + id, g, glass, [-sx * 0.03, 1.1, (z1 - z0) / 2], door);
    node('window_crank_' + id, new THREE.CylinderGeometry(0.01, 0.01, 0.05, 8).rotateZ(Math.PI / 2), chrome, [-sx * 0.06, 0.6, 0.15], door);
  }
  // windshield + rear glass (tilted quads)
  const ws = new THREE.PlaneGeometry(1.4, 0.75);
  ws.rotateX(-1.05);
  node('glass_windshield', ws, glass, [0, 1.12, -0.68]);
  const rw = new THREE.PlaneGeometry(1.3, 0.6);
  rw.rotateX(1.0);
  node('glass_rear', rw, glass, [0, 1.15, 1.3]);
  // hood / trunk on their hinges
  const hood = new THREE.Group();
  hood.name = 'hood';
  hood.position.set(0, 0.92, -1.05);
  scene.add(hood);
  node('hood_panel', new THREE.BoxGeometry(1.5, 0.04, 1.1), paint, [0, 0, -0.55], hood);
  const trunk = new THREE.Group();
  trunk.name = 'trunk';
  trunk.position.set(0, 0.95, 1.6);
  scene.add(trunk);
  node('trunk_panel', new THREE.BoxGeometry(1.5, 0.04, 0.55), paint, [0, 0, 0.28], trunk);
  // wheels
  for (const [id, x, z] of [['fl', -0.72, -1.36], ['fr', 0.72, -1.36], ['rl', -0.72, 1.1], ['rr', 0.72, 1.1]]) node('wheel_' + id, new THREE.CylinderGeometry(0.29, 0.29, 0.18, 20).rotateZ(Math.PI / 2), rubber, [x, 0.29, z]);
  // cabin bits
  const sw = new THREE.TorusGeometry(0.19, 0.015, 8, 32);
  node('steering_wheel', sw, black, [0.37, 0.84, -0.26], scene, [0.42, 0, 0]);
  for (const [n, x] of [['needle_speedo', 0.3], ['needle_tacho', 0.44], ['needle_fuel', 0.22], ['needle_temp', 0.52]]) node(n, new THREE.BoxGeometry(0.004, 0.04, 0.002).translate(0, 0.02, 0), mat('needle', 0xff5522), [x, 0.86, -0.63]);
  node('meter_display', new THREE.PlaneGeometry(0.16, 0.06), black, [-0.06, 0.975, -0.71]);
  node('radio_display', new THREE.PlaneGeometry(0.12, 0.025), black, [0, 0.74, -0.59]);
  node('gear_lever', new THREE.CylinderGeometry(0.008, 0.008, 0.25).translate(0, 0.125, 0), chrome, [0.05, 0.42, -0.24]);
  node('handbrake_lever', new THREE.BoxGeometry(0.04, 0.03, 0.25).translate(0, 0, 0.12), black, [0.1, 0.42, -0.1]);
  for (const [n, x] of [['pedal_throttle', 0.49], ['pedal_brake', 0.33], ['pedal_clutch', 0.19]]) node(n, new THREE.BoxGeometry(0.06, 0.18, 0.02).translate(0, -0.09, 0), rubber, [x, 0.4, -0.8]);
  node('glovebox_lid', new THREE.BoxGeometry(0.34, 0.15, 0.02).translate(0, 0.075, 0), black, [-0.41, 0.6, -0.6]);
  node('sun_visor_driver', new THREE.BoxGeometry(0.4, 0.02, 0.15).translate(0, 0, 0.075), mat('visor', 0x8c8272), [0.35, 1.32, -0.33]);
  node('rearview_mirror', new THREE.BoxGeometry(0.25, 0.07, 0.03), black, [0, 1.23, -0.46]);
  const mr = new THREE.PlaneGeometry(0.23, 0.055);
  node('mirror_rear_surface', mr, chrome, [0, 1.23, -0.444]);
  for (const [n, x] of [['mirror_left_surface', -1.03], ['mirror_right_surface', 1.03]]) node(n, new THREE.PlaneGeometry(0.16, 0.1), chrome, [x, 1.0, -0.8]);
  node('key_slot', new THREE.CylinderGeometry(0.015, 0.015, 0.01).rotateX(Math.PI / 2), chrome, [0.5, 0.76, -0.37]);
  // lights, plates, roof sign, vacant lamp
  for (const [n, x, y, z] of [['light_head_l', -0.52, 0.6, -2.16], ['light_head_r', 0.52, 0.6, -2.16], ['light_tail_l', -0.55, 0.8, 2.16], ['light_tail_r', 0.55, 0.8, 2.16], ['light_ind_fl', -0.75, 0.6, -2.12], ['light_ind_fr', 0.75, 0.6, -2.12], ['light_ind_rl', -0.72, 0.72, 2.16], ['light_ind_rr', 0.72, 0.72, 2.16], ['light_brake', 0, 0.82, 2.16], ['light_reverse', 0.3, 0.72, 2.16]]) node(n, new THREE.BoxGeometry(0.2, 0.1, 0.03), lens, [x, y, z]);
  node('plate_front', new THREE.PlaneGeometry(0.34, 0.15).rotateY(Math.PI), mat('plate', 0xffffff), [0, 0.42, -2.17]);
  node('plate_rear', new THREE.PlaneGeometry(0.34, 0.15), mat('plate', 0xffffff), [0, 0.6, 2.17]);
  node('roof_sign', new THREE.BoxGeometry(0.5, 0.12, 0.16), lens, [0, 1.47, 0.35]);
  node('vacant_lamp', new THREE.BoxGeometry(0.15, 0.06, 0.04), lens, [-0.46, 0.96, -0.93]);
  // an anchor empty
  const e = new THREE.Object3D();
  e.name = 'driverEye';
  e.position.set(0.37, 1.15, 0.24);
  scene.add(e);
  return { scene };
}

export default async function ({ engine, cameraRig, params }) {
  applyEnv(params, { hour: 22, rain: 0.2, fog: 0.15 });
  const { world } = buildTestSet(engine.scene);
  addStreetlight(engine.scene, new THREE.Vector3(-5.2, 0, -3), 1, 34);
  setVehicleAssets({ taxi: fakeTaxiScene() });
  const taxi = new Taxi({ world });
  engine.scene.add(taxi.root);
  taxi.setPose(new THREE.Vector3(-1.55, 0, 0), 0);
  window.__taxi = taxi;
  Object.assign(taxi.state, { keyInserted: true, ignition: 'on', engineOn: true, headlights: 'low', indicator: 'left' });
  const open = Number(params.get('open') ?? 0.8);
  taxi.state.doors.fl = open;
  taxi.state.doors.trunk = open * 0.7;
  taxi.state.doors.hood = open * 0.5;
  taxi.state.windows.fr = 0.5;
  setVehicleAssets({ taxi: null }); // later taxis are procedural again
  const cam = params.get('cam') || 'tq';
  if (cam === 'inside') cameraRig.attach(taxi.anchors.driverEye, taxi.bodyInner, { yaw: 0.2, pitch: -0.15 });
  else cameraRig.cinematic({ position: new THREE.Vector3(-5.2, 1.9, -4.8), lookAt: new THREE.Vector3(-1.55, 0.7, 0), fov: 45, cut: true });
}
