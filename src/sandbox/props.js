// Props night gallery.
//   ?sandbox=props&item=<name|all>&hour=22&dist=8&yaw=20&h=1.6&ty=1&fov=60&fill=1&fog=0.02
// item names: see ITEMS below (or a factory name like createSala). eye=1 puts the camera
// at human eye height (1.6 m). yaw = degrees around the target (0 = in front, +Z side).
import * as THREE from 'three';
import { sky, lightPool, paintedMaterial, GLOBAL_UNIFORMS } from '../render/index.js';
import { tex } from '../textures/index.js';
import * as P from '../props/index.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function wiresDemo() {
  const g = new THREE.Group();
  const res = { object: g, lights: [] };
  const poles = [];
  for (let i = 0; i < 3; i++) {
    const p = P.createElectricPole({ seed: 11 + i, transformer: i === 1, lamp: i === 0 ? 'fluorescent' : null, height: 9 + (i % 2) * 0.6 });
    p.object.position.set(0, 0, -i * 32);
    g.add(p.object);
    if (p.lights) res.lights.push(...p.lights);
    poles.push(p);
  }
  g.updateMatrixWorld(true);
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i].wireAnchors.map((v) => v.clone().applyMatrix4(poles[i].object.matrixWorld));
    const b = poles[i + 1].wireAnchors.map((v) => v.clone().applyMatrix4(poles[i + 1].object.matrixWorld));
    g.add(P.createWireSpan(a, b, { seed: 5 + i, kinds: poles[i].wireKinds, messy: 1.4 }));
  }
  return res;
}

function signsDemo() {
  const g = new THREE.Group();
  const kinds = [
    ['km_marker', { km: 9 }], ['curve_warning', { dir: 'left' }], ['elephant_crossing', {}], ['speed_sign', { kmh: 60 }],
    ['warning_sign', { th: 'ระวังสัตว์ป่า', en: 'WILDLIFE' }], ['bus_stop_sign', {}], ['temple_sign', {}], ['fork_sign', { side: 'left' }],
    ['shop_sign', { th: 'ร้านค้า', en: 'SHOP' }], ['village_sign', { th: 'บ้านห้วยทราย', en: 'Ban Huai Sai' }],
  ];
  const lights = [];
  kinds.forEach(([k, o], i) => {
    const r = P.createSignPost(k, { ...o, seed: i });
    r.object.position.set((i - (kinds.length - 1) / 2) * 1.6, 0, 0);
    g.add(r.object);
  });
  return { object: g, lights };
}

function dressingDemo() {
  const g = new THREE.Group();
  P.DRESSING_KINDS.forEach((k, i) => {
    const r = P.createDressing(k, { seed: i + 1 });
    const col = i % 5, row = Math.floor(i / 5);
    r.object.position.set((col - 2) * 1.5, 0, -row * 1.6);
    g.add(r.object);
  });
  return { object: g, lights: [] };
}

// name -> { build, view:{dist,yaw,h,ty,tx,tz}, road:'front'|'through'|'none' }
const ITEMS = {
  pole: { build: () => P.createElectricPole({ seed: 3, transformer: true, lamp: 'fluorescent' }), view: { dist: 7, yaw: 35, h: 3, ty: 5.5 } },
  pole_plain: { build: () => P.createElectricPole({ seed: 8, lamp: 'sodium' }), view: { dist: 6, yaw: -30, h: 2, ty: 5 } },
  wires: { build: wiresDemo, view: { dist: 10, yaw: 60, h: 2.5, ty: 6, tz: -20 }, road: 'through' },
  sodium: { build: () => P.createStreetlight({ kind: 'sodium', seed: 2 }), view: { dist: 6, yaw: 30, h: 2, ty: 4.5 } },
  fluoro: { build: () => P.createStreetlight({ kind: 'fluorescent', seed: 4 }), view: { dist: 4, yaw: 40, h: 2.2, ty: 3.8 } },
  spirit_thai: { build: () => P.createSpiritHouse({ style: 'thai', seed: 3 }), view: { dist: 2.6, yaw: 20, h: 1.6, ty: 1.5 } },
  spirit_chinese: { build: () => P.createSpiritHouse({ style: 'chinese', seed: 4 }), view: { dist: 2.4, yaw: 15, h: 1.5, ty: 0.8 } },
  spirit_twin: { build: () => P.createSpiritHouse({ style: 'twin', seed: 5 }), view: { dist: 2.4, yaw: -15, h: 1.5, ty: 1.0 } },
  sala1: { build: () => P.createSala({ variant: 1, seed: 1 }), view: { dist: 9, yaw: 25, h: 1.6, ty: 1.4 } },
  sala2: { build: () => P.createSala({ variant: 2, seed: 2 }), view: { dist: 9, yaw: -25, h: 1.6, ty: 1.4 } },
  shrine: { build: () => P.createShrineMaRuay({}), view: { dist: 22, yaw: 0, h: 1.4, ty: 2.5, tz: -14 }, road: 'through' },
  garage: { build: () => P.createGarage({}), view: { dist: 9, yaw: 10, h: 1.65, ty: 1.4 } },
  busstop: { build: () => P.createBusStop({ seed: 2 }), view: { dist: 6, yaw: 25, h: 1.6, ty: 1.3 } },
  noodle: { build: () => P.createNoodleStall({ seed: 3 }), view: { dist: 6, yaw: 20, h: 1.6, ty: 1.1 } },
  bridge: { build: () => P.createBridge({ seed: 4 }), view: { dist: 16, yaw: 70, h: 1.2, ty: -0.5 }, road: 'none', groundY: -4.2 },
  guardrail: {
    build: () => {
      const pts = [];
      for (let i = 0; i <= 24; i++) pts.push(V(Math.sin(i * 0.05) * 6, 0, -i * 2));
      return P.createGuardrail(pts, { seed: 2, damaged: true });
    },
    view: { dist: 7, yaw: 150, h: 1.3, ty: 0.6, tz: -8 },
    road: 'none',
  },
  buddha: { build: () => P.createBuddhaStatue({ seed: 1, broken: true }), view: { dist: 3.5, yaw: 15, h: 1.6, ty: 1.2 } },
  buddha_standing: { build: () => P.createBuddhaStatue({ seed: 2, pose: 'standing' }), view: { dist: 3.5, yaw: -15, h: 1.6, ty: 1.4 } },
  temple: { build: () => P.createForestTemple({ seed: 1 }), view: { dist: 16, yaw: 15, h: 1.7, ty: 2.5, tz: -6 } },
  memorial: { build: () => P.createAccidentMemorial({ seed: 1 }), view: { dist: 3.6, yaw: 20, h: 1.6, ty: 0.6 } },
  ghostgate: { build: () => P.createGhostGate({ seed: 1 }), view: { dist: 12, yaw: 0, h: 1.4, ty: 2.5 }, road: 'through' },
  village: { build: () => P.createVillageStop({ seed: 1 }), view: { dist: 9, yaw: 20, h: 1.5, ty: 1.5, tz: -3 } },
  signs: { build: signsDemo, view: { dist: 9, yaw: 0, h: 1.5, ty: 1.4 } },
  mirror: { build: () => P.createConvexMirror({ seed: 1 }), view: { dist: 3.5, yaw: 20, h: 1.6, ty: 2.2 } },
  incense: { build: () => P.createIncensePot({ seed: 1 }), view: { dist: 1.3, yaw: 20, h: 1.0, ty: 0.3 } },
  pond: { build: () => P.createPond({ seed: 1 }), view: { dist: 9, yaw: 20, h: 2.0, ty: 0 }, road: 'none' },
  cloth: {
    build: () => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 6, 20), paintedMaterial({ color: 0x5a4a3a, map: tex('bark') }));
      trunk.position.y = 3;
      g.add(trunk);
      g.add(P.createClothWrap(0.82, 0.9, 1.5, { seed: 2 }));
      return { object: g, lights: [] };
    },
    view: { dist: 3.2, yaw: 10, h: 1.6, ty: 1.2 },
  },
  dressing: { build: dressingDemo, view: { dist: 8, yaw: 0, h: 2.6, ty: 0.3, tz: -2 } },
};

export default async function ({ engine, cameraRig, params }) {
  const scene = engine.scene;
  const itemName = params.get('item') || 'all';
  const hour = Number(params.get('hour') ?? 22);
  sky.setHour(hour);
  sky.setWeather?.({ rain: Number(params.get('rain') ?? 0), fog: Number(params.get('fog') ?? 0), wind: 0.3 }, 0);
  sky.setWetness?.(Number(params.get('wet') ?? 0.5));

  // ground + road
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1).rotateX(-Math.PI / 2), paintedMaterial({ color: 0x4a4636, map: tex('soil', { repeat: [80, 80] }) }));
  ground.position.y = -0.02;
  const gItem = ITEMS[params.get('item')];
  if (gItem && gItem.groundY != null) ground.position.y = gItem.groundY;
  ground.receiveShadow = true;
  scene.add(ground);

  const placed = [];
  const addItem = (name, x, z, yaw) => {
    const it = ITEMS[name];
    const r = it.build();
    r.object.position.set(x, 0, z);
    r.object.rotation.y = yaw;
    scene.add(r.object);
    placed.push({ name, r });
    return { it, r };
  };

  let view;
  let road = 'front';
  if (itemName === 'all') {
    const names = Object.keys(ITEMS).filter((n) => !['wires', 'shrine', 'temple', 'bridge', 'guardrail', 'pond', 'dressing', 'signs', 'ghostgate'].includes(n));
    names.forEach((n, i) => {
      const side = i % 2 ? 1 : -1;
      addItem(n, side * 6.5, -i * 7, side > 0 ? -Math.PI / 2 : Math.PI / 2);
    });
    view = { dist: 0.01, yaw: 0, h: 1.3, ty: 1.3, tz: -12, tx: 0, cam: V(-1.5, 1.3, 8) };
    road = 'along';
  } else {
    const key = ITEMS[itemName] ? itemName : Object.keys(ITEMS).find((n) => ('create' + n).toLowerCase() === itemName.toLowerCase()) || 'pole';
    const { it } = addItem(key, 0, 0, 0);
    view = { ...it.view };
    road = it.road || 'front';
  }
  // road strip
  const roadMat = paintedMaterial({ color: 0x3a3a3c, map: tex('asphalt', { repeat: [2, 40] }), roughness: 0.6 });
  if (road === 'front') {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(200, 6.2).rotateX(-Math.PI / 2), roadMat);
    r.position.set(0, 0.0, 6.5);
    r.receiveShadow = true;
    scene.add(r);
  } else if (road === 'through' || road === 'along') {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 300).rotateX(-Math.PI / 2), roadMat);
    r.position.set(0, 0.0, road === 'along' ? -100 : 20);
    r.receiveShadow = true;
    scene.add(r);
  }

  // lights from the props
  for (const p of placed) P.addPropLights(p.r, lightPool);
  if (params.get('lights') === '0') for (const p of placed) for (const h of p.r.lightHandles || []) h.setOn(false);

  // camera
  const num = (k, d) => (params.has(k) ? Number(params.get(k)) : d);
  const dist = num('dist', view.dist), yaw = num('yaw', view.yaw) * (Math.PI / 180);
  const target = V(num('tx', view.tx ?? 0), num('ty', view.ty ?? 1), num('tz', view.tz ?? 0));
  const h = params.get('eye') === '1' ? 1.6 : num('h', view.h ?? 1.6);
  const cam = view.cam ? view.cam.clone() : V(target.x + Math.sin(yaw) * dist, h, target.z + Math.cos(yaw) * dist);
  cameraRig.cinematic({ position: cam, lookAt: target, cut: true, fov: num('fov', 60) });

  // taxi-headlight-like fill from below the camera (same setup as the render sandbox)
  const fill = num('fill', 1);
  if (fill > 0) {
    const hl = cam.clone().add(V(0, -0.7, 0));
    const look = target.clone();
    look.y = Math.min(look.y, hl.y);
    const dd = cam.distanceTo(target);
    const s = new THREE.SpotLight(0xfff0d8, 2500 * fill * Math.min(1, (dd / 22) ** 2), 70, 0.6, 0.55, 2);
    s.position.copy(hl);
    s.target.position.copy(look);
    s.castShadow = params.get('shadows') !== '0';
    s.shadow.mapSize.set(1024, 1024);
    s.shadow.bias = -0.0005;
    s.shadow.camera.near = 0.3;
    scene.add(s, s.target);
    GLOBAL_UNIFORMS.uHeadlightPos.value.copy(hl);
    GLOBAL_UNIFORMS.uHeadlightDir.value.copy(look).sub(hl).normalize();
    GLOBAL_UNIFORMS.uHeadlightOn.value = 1;
  }
  window.__props = { placed, P, ITEMS };
}
