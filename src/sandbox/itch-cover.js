// itch.io cover (630x500 / 1260x1000): inside the taxi at night. Ton has turned in the driver's
// seat and looks back over his shoulder; the woman in white sits in the middle of the back seat,
// staring at him. One warm dome light, green dash glow, fog and dark forest through the glass.
// window.__itch.frames = number of camera views; frame(i) renders view i (tools/itch/render.mjs).
//   ?sandbox=itch-cover&views=px,py,pz;lx,ly,lz;fov|...  (taxi body space)  &seat=rearCenter|rearLeft
//   &title=1 &twist=0.5 (Ton's torso turn) &hour=23.6 &fog=0.6 &dome=1.4 (cabin light multiplier)
import * as THREE from 'three';
import { sky, postfx, lightPool, paintedMaterial, foliageMaterial, GLOBAL_UNIFORMS } from '../render/index.js';
import { loadCharacterAssets, createHumanoid, ACTIONS } from '../characters/index.js';
import { CHARACTERS } from '../game/data/characters.js';
import { Taxi, loadVehicleAssets } from '../vehicle/index.js';
import { Forest } from '../world/Forest.js';
import { tex } from '../textures/index.js';
import { makeRng } from '../core/math.js';
import { FONTS } from '../ui/fonts.js';
import { TestRoad } from './vehicle-common.js';
import { hideMouthParts } from './itch-banner.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** asphalt / shoulder ribbon along the test road */
function ribbon(road, half0, half1, y, mat, uScale) {
  const pos = [], uv = [], idx = [];
  const smp = { pos: V(0, 0, 0), tangent: V(0, 0, 0), right: V(0, 0, 0), up: V(0, 1, 0), width: 0 };
  const n = Math.ceil(road.L / 1.5);
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * road.L;
    road.sample(s, smp);
    const a = smp.pos.clone().addScaledVector(smp.right, half0), b = smp.pos.clone().addScaledVector(smp.right, half1);
    pos.push(a.x, y, a.z, b.x, y, b.z);
    uv.push(0, s / uScale, 1, s / uScale);
    if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    g.setIndex(idx.slice().reverse());
    g.computeVertexNormals();
  }
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

export default async function ({ engine, cameraRig, params }) {
  const num = (k, d) => (params.get(k) != null ? Number(params.get(k)) : d);
  const scene = engine.scene;
  await Promise.all([loadCharacterAssets(), loadVehicleAssets()]);

  // ---------------------------------------------------------------- night, fog
  sky.setHour(num('hour', 23.6));
  sky.setWeather({ rain: 0, fog: num('fog', 0.6), wind: 0.1 }, 0);
  sky.setWetness?.(num('wet', 0.6));
  if (params.get('fogd') != null) sky.overrides.fogDensity = num('fogd', 0.04);
  postfx.params.exposure = num('exp', 1);
  postfx.params.grain = num('grain', 0.6);

  // ---------------------------------------------------------------- road + forest
  const road = new TestRoad([V(0, 0, 60), V(0, 0, 0), V(-3, 0, -50), V(-12, 0, -110), V(-6, 0, -170)]);
  const world = { road, getHeight: () => 0, surfaceAt: () => 'asphalt', landmarks: {} };
  const T = (k, r) => {
    try {
      return tex(k, { repeat: r });
    } catch (e) {
      return null;
    }
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 400).rotateX(-Math.PI / 2), paintedMaterial({ color: 0x1d2416, map: T('soil', [70, 90]), roughness: 0.95, brush: 0.6 }));
  ground.position.set(0, -0.03, -60);
  ground.receiveShadow = true;
  scene.add(ground);
  scene.add(ribbon(road, -3.1, 3.1, 0, paintedMaterial({ color: 0x3a3a3a, map: T('asphalt', [1, 1]), normalMap: T('asphalt_normal', [1, 1]), roughness: 0.55, wet: 0.8, brush: 0.4 }), 6.2));
  const shoulder = paintedMaterial({ color: 0x3b3326, map: T('soil', [1, 1]), roughness: 0.95, brush: 0.6 });
  scene.add(ribbon(road, -4.8, -3.1, -0.01, shoulder, 4), ribbon(road, 3.1, 4.8, -0.01, shoulder, 4));

  const forest = new Forest({ road: null, drawDistance: 150, terrain: null, landmarks: {}, plan: { clearings: [] } }, {});
  forest._materials();
  const rng = makeRng(77);
  const smp = { pos: V(0, 0, 0), tangent: V(0, 0, 0), right: V(0, 0, 0), up: V(0, 1, 0), width: 0 };
  const big = ['rainTree', 'dipterocarp', 'reachTree', 'banyan', 'deadTree', 'bamboo'];
  const small = ['understory', 'banana', 'shrub', 'fern', 'bamboo', 'elephantEar', 'grass'];
  let n = 0;
  const place = (name, s, lat) => {
    try {
      road.sample(s, smp);
      const g = forest.makeSingle(name, n % 2, 9000 + n * 31);
      g.position.copy(smp.pos).addScaledVector(smp.right, lat);
      g.rotation.y = rng() * 6.28;
      scene.add(g);
      n++;
    } catch (e) {
      console.warn('[itch-cover] plant', name, e.message);
    }
  };
  if (params.get('trees') !== '0') {
    for (let s = 34; s < 120; s += 6.5 + rng() * 4) {
      for (const side of [-1, 1]) {
        place(big[(rng() * big.length) | 0], s + rng() * 3, side * (7 + rng() * 6));
        if (rng() < 0.8) place(small[(rng() * small.length) | 0], s + rng() * 4, side * (5.2 + rng() * 2));
      }
    }
  }

  // ---------------------------------------------------------------- the taxi
  const taxi = new Taxi({ world });
  scene.add(taxi.root);
  road.sample(60, smp);
  taxi.setPose(smp.pos.clone().addScaledVector(smp.right, -1.55), Math.atan2(-smp.tangent.x, -smp.tangent.z));
  taxi.physics.frozen = true;
  Object.assign(taxi.state, {
    keyInserted: true, ignition: 'on', engineOn: true, handbrake: true, gear: 'N', headlights: 'low', cabinLight: true,
    radioOn: true, radioStation: 3, meterOn: true, vacantLamp: false, wipers: 0,
  });
  if (params.get('dome')) taxi.setCabinOverride?.(num('dome', 1), 0);
  taxi.setFog?.('all', num('condense', 0.12));
  try {
    taxi.glass?.fillFog?.('all', num('condense', 0.12));
    taxi.addGlassMark('rr', 'handprint', new THREE.Vector2(0.45, 0.55), { size: 1.2, drag: true });
  } catch (e) {
    /* glass marks optional */
  }
  const body = taxi.bodyInner;

  // ---------------------------------------------------------------- Ton, turned back in the driver's seat
  // a held "turn in the seat" pose: torso twist toward the cabin, shoulder dropped (runs before IK/look-at)
  const twist = num('twist', 0.5);
  ACTIONS.itchTurnBack = {
    dur: 0, period: 1, fadeIn: 0, fadeOut: 0,
    pose(h) {
      const I = h.t.index;
      h.rig.addEuler(I.spine_01, 0, twist * 0.25, 0);
      h.rig.addEuler(I.spine_02, 0, twist * 0.35, 0.03);
      h.rig.addEuler(I.spine_03, -0.04, twist * 0.4, 0.05);
    },
  };
  const ton = createHumanoid({ ...CHARACTERS.player.appearance });
  hideMouthParts(ton);
  ton.sitAt(taxi.seats.driver, { pose: 'drive', blend: 0.01 });
  ton.play('itchTurnBack', { loop: true });
  ton.setExpression({ fear: num('fear', 0.75), surprise: num('surprise', 0.55), sad: 0, smile: 0 });
  // right hand on the wheel rim (about 1 o'clock), left hand gripping the passenger seat back
  const wheelGrip = new THREE.Object3D();
  wheelGrip.position.copy(taxi.anchors.steeringWheel.position).add(V(0.12, 0.13, 0.03));
  taxi.anchors.steeringWheel.parent.add(wheelGrip);
  const seatGrip = new THREE.Object3D();
  seatGrip.position.set(num('gx', -0.16), num('gy', 1.12), num('gz', 0.4));
  body.add(seatGrip);
  ton.setHandTarget('R', wheelGrip, { weight: 1, blend: 0.05, grip: 1, orient: false });
  ton.setHandTarget('L', seatGrip, { weight: num('lhand', 1), blend: 0.05, grip: 0.9, orient: false });

  // ---------------------------------------------------------------- the woman in white, back seat
  const seat = params.get('seat') || 'rearCenter';
  const ww = createHumanoid({ ...CHARACTERS.womanWhite.appearance, noBlink: true });
  hideMouthParts(ww);
  ww.sitAt(taxi.seats[seat], { pose: 'sitCar', blend: 0.01 });
  ww.setGhost({ still: 1, stare: 1, noBlink: 1, breathStop: 1, uncanny: num('uncanny', 0.45), veins: num('veins', 0.25), hairOverFace: num('hof', 0.15), headRoll: num('roll', 0.14), headPitch: num('pitch', 0.1), unlimited: 1 }, 100);
  ww.setExpression({ smile: num('smile', 0.08), creepy: num('creepy', 0.35), sad: 0.1 });
  ww.bodyLean = { x: 0, y: num('lean', 0.18) };

  // eyes on each other
  ww.lookAt(ton.bones.Head, { weight: 1, speed: 30, unlimited: true });
  ton.lookAt(ww.bones.Head, { weight: 1, speed: 30 });

  // ---------------------------------------------------------------- views + title
  const views = (params.get('views') || '-0.62,1.24,-0.3;0.05,1.02,0.62;56').split('|').map((v) => {
    const [p, l, f] = v.split(';');
    return { p: V(...p.split(',').map(Number)), l: V(...l.split(',').map(Number)), fov: Number(f || 56) };
  });
  const eye = new THREE.Object3D(), look = new THREE.Object3D();
  body.add(eye, look);
  const setView = (v) => {
    eye.position.copy(v.p);
    look.position.copy(v.l);
    body.updateMatrixWorld(true);
    cameraRig.cinematic({ position: eye.getWorldPosition(V(0, 0, 0)), lookAt: look.getWorldPosition(V(0, 0, 0)), cut: true, fov: v.fov });
    engine.camera.fov = v.fov;
    engine.camera.updateProjectionMatrix();
  };
  cameraRig.lookEnabled = false;
  setView(views[0]);

  if (params.get('title') !== '0') {
    const W = engine.width || window.innerWidth;
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:fixed;left:0;right:0;top:${num('ty', 0.05) * window.innerHeight}px;text-align:center;z-index:20;pointer-events:none;color:#e9e1cd;font-family:${FONTS.title};line-height:1.1`;
    const t = document.createElement('div');
    t.textContent = 'หลอนยันปลายทาง';
    t.style.cssText = `font-size:${num('ts', 0.118) * W}px;font-weight:400;white-space:nowrap`;
    wrap.appendChild(t);
    document.body.appendChild(wrap);
    const by = document.createElement('div');
    by.textContent = 'Pukking Dragon';
    by.style.cssText = `position:fixed;right:${0.03 * W}px;bottom:${0.025 * window.innerHeight}px;z-index:20;pointer-events:none;color:#e9e1cd;opacity:0.8;font:400 ${num('bs', 0.03) * W}px ${FONTS.title};white-space:nowrap`;
    document.body.appendChild(by);
  }

  // settle: seat poses, IK, look-at, glass, lights
  const realRender = engine.render.bind(engine);
  window.__itch = {
    frames: views.length,
    async prepare() {
      engine.render = () => {};
      for (let i = 0; i < num('warm', 40); i++) {
        engine.step(1 / 30);
        if (i % 10 === 9) await new Promise((r) => setTimeout(r, 0));
      }
      engine.render = realRender;
      realRender(1 / 30);
    },
    async frame(i) {
      setView(views[i]);
      engine.step(1 / 30);
    },
  };
  window.__cover = { taxi, ton, ww, setView, GLOBAL_UNIFORMS, lightPool, foliageMaterial };
}
