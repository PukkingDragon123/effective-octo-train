// Creatures sandbox: the folklore entities and animals at night, each doing its thing.
//   ?view=lineup (default) | hand | yai | krasue | krahang | tani | wire | giant | phi | rat | elephants | dogs | egrets | window
//   &kind=upsideDownHead|fingersDoorFrame|faceAgainstGlass|roofCrawler|knockWindow   (view=window)
//   &hour=23 &fog=0.3 &cam=x,y,z &look=x,y,z &fov=60 &warm=60 (frames stepped after setup)
import * as THREE from 'three';
import { sky, lightPool, GLOBAL_UNIFORMS, paintedMaterial } from '../render/index.js';
import { loadCharacterAssets, createHumanoid, PRESETS } from '../characters/index.js';
import { Taxi, loadVehicleAssets } from '../vehicle/index.js';
import { buildTestSet, addStreetlight, applyEnv } from './vehicle-common.js';
import {
  createYaiSpeed, createKrasue, createKrahang, createNangTani, createWireCrawler, createForestGiant, createGiantHand, createPhiTaiHong,
  createWindowGhost, createAnimal, createFaceRat, createEgretFlock, DOG_COATS,
} from '../creatures/index.js';

const V = (s, d) => (s ? new THREE.Vector3(...s.split(',').map(Number)) : d);

export default async function ({ engine, cameraRig, params }) {
  await loadCharacterAssets();
  const view = params.get('view') || 'lineup';
  applyEnv(params, { hour: 23, rain: 0, fog: 0.25 });
  const { world, road } = buildTestSet(engine.scene);
  const scene = engine.scene;
  const gf = () => 0;
  addStreetlight(scene, new THREE.Vector3(-5.2, 0, -6), 1, 34);
  addStreetlight(scene, new THREE.Vector3(5.2, 0, -40), -1, 30);
  const moon = new THREE.DirectionalLight(0x8fa8c8, 0.35);
  moon.position.set(-6, 10, 4);
  scene.add(moon);
  const camEye = new THREE.Object3D();
  scene.add(camEye);
  const setCam = (pos, look, fov = 60) => {
    camEye.position.copy(V(params.get('cam'), pos));
    const l = V(params.get('look'), look).sub(camEye.position);
    cameraRig.attach(camEye, null, { yaw: Math.atan2(-l.x, -l.z), pitch: Math.atan2(l.y, Math.hypot(l.x, l.z)) });
    cameraRig.fovBase = Number(params.get('fov') ?? fov);
  };
  const ents = [];
  const keep = (e) => (ents.push(e), e);
  let taxi = null;
  const needTaxi = async (drive = 0) => {
    if (params.get('procedural') !== '1') await loadVehicleAssets();
    taxi = new Taxi({ world });
    scene.add(taxi.root);
    taxi.setPose(new THREE.Vector3(-1.55, 0, 0), 0);
    taxi.state.headlights = 'low';
    if (drive) taxi.autopilot({ splineId: 'main', speedKmh: drive, lane: -1.55, place: true, s: 30 });
    window.__taxi = taxi;
    return taxi;
  };
  const cable = (a, b, sag = 1.1) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push(a.clone().lerp(b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0)));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.012, 5);
    scene.add(new THREE.Mesh(g, paintedMaterial({ color: 0x111111, roughness: 0.5 })));
    return pts;
  };

  if (view === 'lineup') {
    const hand = keep(createGiantHand({ scale: 2.6 }));
    scene.add(hand.root);
    hand.root.position.set(-6, 0, -16);
    hand.root.rotation.y = 0.5;
    hand.rise(0.01);
    const k = keep(createKrasue());
    scene.add(k.root);
    k.placeHead(new THREE.Vector3(-2.6, 2.0, -8));
    k.notice(camEye);
    const tani = keep(createNangTani());
    scene.add(tani.root);
    tani.root.position.set(-1.2, 0, -9);
    tani.root.rotation.y = 0.2;
    tani.gaze(camEye);
    const phi = keep(createPhiTaiHong());
    scene.add(phi.root);
    phi.root.position.set(0.3, 0, -8.4);
    phi.crouch();
    const yai = keep(createYaiSpeed());
    scene.add(yai.root);
    yai.root.position.set(1.6, 0, -9);
    yai.humanoid.setMode('stand');
    yai.turnHead(true);
    const w = keep(createWindowGhost({ spec: 'tallMan' }));
    w.perform('treeWatch', { pos: new THREE.Vector3(3, 0, -10), face: camEye, duration: 1e9 });
    const ele = keep(createAnimal('elephant', { groundFn: gf }));
    scene.add(ele.root);
    ele.place(new THREE.Vector3(7, 0, -16), 0.9);
    const calf = keep(createAnimal('elephantCalf', { groundFn: gf }));
    scene.add(calf.root);
    calf.place(new THREE.Vector3(5.2, 0, -12.5), 0.7);
    calf.lookAt(camEye);
    const dog = keep(createAnimal('dog', { groundFn: gf, tint: DOG_COATS[3] }));
    scene.add(dog.root);
    dog.place(new THREE.Vector3(2.4, 0, -5.5), 2.4);
    dog.lookAt(camEye);
    const rat = keep(createFaceRat());
    scene.add(rat.root);
    rat.root.visible = true;
    rat.tail.mesh.visible = true;
    rat.root.position.set(0.9, 0.55, -4.2);
    rat.root.rotation.y = 0.3;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.5), paintedMaterial({ color: 0x5a4632, roughness: 0.9 }));
    crate.position.set(0.9, 0.275, -4.2);
    scene.add(crate);
    const wc = keep(createWireCrawler());
    scene.add(wc.root);
    wc.crawlAlong(cable(new THREE.Vector3(-14, 7.8, -20), new THREE.Vector3(14, 7.8, -22)), 0.6, { from: 0.3, to: 0.7 });
    const kh = keep(createKrahang());
    scene.add(kh.root);
    kh.flyPath([new THREE.Vector3(-30, 14, -40), new THREE.Vector3(0, 11, -30), new THREE.Vector3(30, 13, -38)], 3);
    setCam(new THREE.Vector3(0, 1.7, 2.5), new THREE.Vector3(0, 2.2, -10), 62);
  } else if (view === 'hand') {
    const hand = keep(createGiantHand({ scale: Number(params.get('scale') ?? 3.2) }));
    scene.add(hand.root);
    hand.root.position.set(-2, 0, -12);
    const victim = createHumanoid(PRESETS.auntieSri);
    scene.add(victim.root);
    victim.root.position.set(0, 0, -12);
    victim.setMode('walk');
    setCam(new THREE.Vector3(4, 2.2, -2), new THREE.Vector3(-1, 3, -12), 55);
    (async () => {
      await hand.rise(3);
      if (params.get('grab') !== '0') await hand.grab(victim.root, { height: 1.55, humanoid: victim });
    })();
  } else if (view === 'yai') {
    const t = await needTaxi(Number(params.get('speed') ?? 60));
    const y = keep(createYaiSpeed({ world }));
    scene.add(y.root);
    y.runAlongside(t, 'L', { along: 1.2, world });
    if (params.get('head') !== '0') y.turnHead(true);
    cameraRig.attach(t.anchors.driverEye, t.bodyInner, { yaw: 1.2, pitch: -0.05 });
    if (params.get('hood') === '1') setTimeout(() => y.landOnHood(t), 300);
  } else if (view === 'krasue') {
    const k = keep(createKrasue());
    scene.add(k.root);
    k.placeHead(new THREE.Vector3(-1, 1.9, -6));
    k.floatTo(new THREE.Vector3(1, 2.1, -5), 0.4);
    k.notice(camEye);
    setCam(new THREE.Vector3(0, 1.8, -1.5), new THREE.Vector3(0, 1.6, -6), 55);
  } else if (view === 'krahang') {
    const kh = keep(createKrahang());
    scene.add(kh.root);
    kh.flyPath([new THREE.Vector3(-25, 7, -20), new THREE.Vector3(0, 6, -12), new THREE.Vector3(25, 8, -18)], Number(params.get('speed') ?? 2.5));
    setCam(new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(0, 5, -12), 60);
  } else if (view === 'tani') {
    const n = keep(createNangTani());
    scene.add(n.root);
    n.root.position.set(0, 0, -4);
    n.beckon(camEye);
    setCam(new THREE.Vector3(0.6, 1.4, -1), new THREE.Vector3(0, 1.0, -4), 50);
  } else if (view === 'wire') {
    const wc = keep(createWireCrawler());
    scene.add(wc.root);
    wc.crawlAlong(cable(new THREE.Vector3(-10, 7.5, -10), new THREE.Vector3(10, 7.5, -12)), 0.8, { from: 0.2, to: 0.8 });
    setCam(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 6.6, -10.5), 55);
  } else if (view === 'giant') {
    const gi = keep(createForestGiant());
    scene.add(gi.root);
    gi.walkPast(new THREE.Vector3(-20, 0, -45), new THREE.Vector3(20, 0, -50), 14);
    setTimeout(() => gi.catchLight(3), 200);
    setCam(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 7, -45), 60);
  } else if (view === 'phi') {
    const p = keep(createPhiTaiHong({ sex: params.get('sex') || 'm' }));
    scene.add(p.root);
    p.root.position.set(0, 0, -4);
    if (params.get('rise') === '1') p.rise(camEye);
    else p.crouch();
    setCam(new THREE.Vector3(0.5, 1.3, -1), new THREE.Vector3(0, 0.9, -4), 50);
  } else if (view === 'rat') {
    const t = await needTaxi(0);
    const r = keep(createFaceRat());
    r.hideAt(t, params.get('spot') || 'footwell');
    cameraRig.attach(t.anchors.driverEye, t.bodyInner, { yaw: Number(params.get('yaw') ?? 0.6), pitch: Number(params.get('pitch') ?? -0.35) });
    if (params.get('leap') !== '0') setTimeout(() => r.leapAt({ exit: 'vanish', hold: Number(params.get('hold') ?? 0.4) }), Number(params.get('delay') ?? 200));
  } else if (view === 'elephants') {
    const m = keep(createAnimal('elephant', { groundFn: gf })), a = keep(createAnimal('elephant', { groundFn: gf, scale: 0.94 })), c = keep(createAnimal('elephantCalf', { groundFn: gf }));
    for (const e of [m, a, c]) scene.add(e.root);
    m.place(new THREE.Vector3(-12, 0, -16), -Math.PI / 2);
    a.place(new THREE.Vector3(-18, 0, -15), -Math.PI / 2);
    c.place(new THREE.Vector3(-14.5, 0, -17.5), -Math.PI / 2);
    m.walkTo(new THREE.Vector3(16, 0, -17), { speed: 1 });
    a.follow(m, new THREE.Vector3(-1.2, 0, 5.5));
    c.follow(m, new THREE.Vector3(1, 0, 2.6));
    setCam(new THREE.Vector3(0, 1.6, 2), new THREE.Vector3(0, 1.6, -16), 55);
  } else if (view === 'dogs') {
    const t = await needTaxi(Number(params.get('speed') ?? 25));
    for (let i = 0; i < 4; i++) {
      const d = keep(createAnimal('dog', { groundFn: gf, tint: DOG_COATS[i % DOG_COATS.length] }));
      scene.add(d.root);
      d.place(new THREE.Vector3(-5 - i * 0.6, 0, -40 - i * 1.4), Math.PI / 2);
      d.mood = 1;
      d.chase(t.root, { speed: 8, offset: new THREE.Vector3(-2 - i * 0.4, 0, 1 + i) });
      d.bark(2);
    }
    cameraRig.attach(t.anchors.driverEye, t.bodyInner, { yaw: 1.4, pitch: -0.1 });
  } else if (view === 'egrets') {
    sky.setHour(Number(params.get('hour') ?? 29.4));
    const f = keep(createEgretFlock(11));
    scene.add(f.root);
    f.takeOff(new THREE.Vector3(-12, 2, -30), new THREE.Vector3(1, 0, 0.2));
    setCam(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 5, -28), 60);
  } else if (view === 'window') {
    const t = await needTaxi(Number(params.get('speed') ?? 0));
    const kind = params.get('kind') || 'faceAgainstGlass';
    const w = keep(createWindowGhost({ spec: params.get('spec') || undefined, world }));
    const pane = params.get('pane') || (kind === 'knockWindow' ? 'fr' : 'rl');
    const yawFor = { upsideDownHead: 0.05, roofCrawler: 0.05, knockWindow: -1.3, fingersDoorFrame: 1.9, faceAgainstGlass: 1.9 };
    cameraRig.attach(t.anchors.driverEye, t.bodyInner, { yaw: Number(params.get('yaw') ?? yawFor[kind] ?? 0), pitch: Number(params.get('pitch') ?? 0.05) });
    const loop = async () => {
      while (!w.disposed) {
        await w.perform(kind, { taxi: t, pane, duration: 6 });
        await new Promise((r) => setTimeout(r, 800));
      }
    };
    loop();
  }
  window.__creatures = ents;
  GLOBAL_UNIFORMS.uFogDensity && (GLOBAL_UNIFORMS.uFogDensity.value *= Number(params.get('fogMul') ?? 1));
  const warm = Number(params.get('warm') ?? 30);
  for (let i = 0; i < warm; i++) engine.step(1 / 30);
  void lightPool;
  void road;
}
