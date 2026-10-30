// itch.io cover (630x500 / 1260x1000): inside the taxi at night. Ton has turned in the driver's
// seat and looks back over his shoulder at the woman in white, perched in the middle of the back seat;
// she stares into the camera (rear-right, inside the cabin). Dim warm dome light, fog and forest outside. The title
// is composited afterwards (tools/itch/compose.py), so the render has no text.
// window.__itch.frames = number of camera views; frame(i) renders view i (tools/itch/render.mjs).
//   ?sandbox=itch-cover&views=px,py,pz;lx,ly,lz;fov|...  (taxi body space)  &seat=rearLeft|rearCenter
//   &twist=0.85 (Ton's torso turn) &hour=23.6 &fog=0.6 &dome=0.55 (cabin light level) &key / &wkey / &rim
//   (face fills) &clip=x0,y0,z0;x1,y1,z1 (body-space box cut from the cabin, 0 = none) &wlook=cam|ton
import * as THREE from 'three';
import { sky, postfx, lightPool, paintedMaterial, foliageMaterial, GLOBAL_UNIFORMS } from '../render/index.js';
import { loadCharacterAssets, createHumanoid, ACTIONS } from '../characters/index.js';
import { CHARACTERS } from '../game/data/characters.js';
import { Taxi, loadVehicleAssets } from '../vehicle/index.js';
import { Forest } from '../world/Forest.js';
import { tex } from '../textures/index.js';
import { makeRng } from '../core/math.js';
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
  // the cabin has a roof: keep the sky's flat ambient low so the dome lamp does the lighting
  sky.overrides.ambI = num('ambI', 0.05);
  sky.overrides.hemiI = num('hemiI', 0.1);
  postfx.params.exposure = num('exp', 0.6);
  postfx.params.grain = 0;

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
  taxi.setCabinOverride?.(num('dome', 0.6), 0);
  // the lamp lens glows, but its point light (5 cm under the headliner) would flood the roof: the face
  // cones below carry its light instead
  engine.onUpdate(() => {
    if (taxi.lights?.dome) taxi.lights.dome.intensity = num('domeLight', 0);
    if (taxi.lights?.fill) taxi.lights.fill.intensity = num('fill', 0); // the cool night-vision fill too
  }, 95);
  try {
    taxi.glass?.fillFog?.('all', num('condense', 0.1));
  } catch (e) {
    /* glass fog optional */
  }
  const body = taxi.bodyInner;
  if (params.get('garland') === '0') {
    taxi.garland?.group && (taxi.garland.group.visible = false);
    taxi.amulets?.group && (taxi.amulets.group.visible = false);
  }

  // ---------------------------------------------------------------- Ton, turned back in the driver's seat
  // a held "turn in the seat" pose: torso twist toward the back-left, left shoulder dropped back
  const twist = num('twist', 1.5);
  ACTIONS.itchTurnBack = {
    dur: 0, period: 1, fadeIn: 0, fadeOut: 0,
    pose(h) {
      const I = h.t.index;
      h.rig.addEuler(I.spine_01, 0, twist * 0.22, 0);
      h.rig.addEuler(I.spine_02, 0, twist * 0.3, num('tilt', 0.04));
      h.rig.addEuler(I.spine_03, num('chestPitch', -0.02), twist * 0.36, num('tilt', 0.04));
    },
  };
  const tonSpec = CHARACTERS.player.appearance;
  const ton = createHumanoid({ ...tonSpec, hair: { ...tonSpec.hair, style: params.get('thair') || 'short' } });
  hideMouthParts(ton);
  ton.sitAt(taxi.seats.driver, { pose: 'drive', blend: 0.01 });
  ton.root.position.x += num('tonx', -0.12); // leaning in toward the gap between the front seats
  ton.play('itchTurnBack', { loop: true });
  ton.setExpression({ fear: num('fear', 0.85), surprise: num('surprise', 0.6), sad: 0, smile: 0 });
  // right hand stays on the wheel rim, left hand on the top of the (cut away) passenger seat back
  const wheelGrip = new THREE.Object3D();
  wheelGrip.position.copy(taxi.anchors.steeringWheel.position).add(V(num('wx', 0.13), num('wy', 0.12), num('wz', 0.03)));
  taxi.anchors.steeringWheel.parent.add(wheelGrip);
  const seatGrip = new THREE.Object3D();
  seatGrip.position.set(num('gx', 0.02), num('gy', 0.98), num('gz', 0.44));
  body.add(seatGrip);
  ton.setHandTarget('R', wheelGrip, { weight: 1, blend: 0.05, grip: 1, orient: false });
  if (num('lhand', 1) > 0) ton.setHandTarget('L', seatGrip, { weight: num('lhand', 1), blend: 0.05, grip: 0.8, orient: false });

  // ---------------------------------------------------------------- the woman in white, back seat
  const seat = params.get('seat') || 'rearCenter';
  const wwSpec = CHARACTERS.womanWhite.appearance;
  const ww = createHumanoid({ ...wwSpec, ghost: { ...wwSpec.ghost, wet: num('wet2', 0.5) }, noBlink: true });
  hideMouthParts(ww);
  ww.sitAt(taxi.seats[seat], { pose: 'sitCar', blend: 0.01 });
  const wtwist = num('wtwist', -0.9);
  ACTIONS.itchTurnWW = {
    dur: 0, period: 1, fadeIn: 0, fadeOut: 0,
    pose(h) {
      const I = h.t.index;
      h.rig.addEuler(I.spine_01, 0, wtwist * 0.22, 0);
      h.rig.addEuler(I.spine_02, 0, wtwist * 0.3, 0);
      h.rig.addEuler(I.spine_03, 0, wtwist * 0.36, 0);
    },
  };
  ww.play('itchTurnWW', { loop: true });
  ww.root.position.x += num('wox', -0.05); // perched on the edge of the seat, leaning toward the gap
  ww.root.position.z += num('woz', -0.12);
  ww.setGhost({ still: 1, stare: num('stare', 0.5), noBlink: 1, breathStop: 1, uncanny: num('uncanny', 0), veins: num('veins', 0), hairOverFace: num('hof', 0), headRoll: num('roll', 0.1), headPitch: num('pitch', 0.12), unlimited: 1 }, 100);
  ww.setExpression({ smile: num('smile', 0.0), creepy: num('creepy', 0.25), sad: num('wsad', 0.2) });
  ww.bodyLean = { x: num('leanx', 0), y: num('lean', 0.3) };

  // cut one body-space box out of the cabin (default: the driver's headrest, which would hide Ton's
  // turned head from the rear-right camera): clipping planes on the taxi's materials only
  const clipSpec = params.get('clip') ?? '0.18,1.02,0.32;0.62,1.27,0.72';
  if (clipSpec !== '0') {
    engine.renderer.localClippingEnabled = true;
    const [mn, mx] = clipSpec.split(';').map((v) => V(...v.split(',').map(Number)));
    const clipPlanes = [
      [V(1, 0, 0), -mx.x], [V(-1, 0, 0), mn.x], [V(0, 1, 0), -mx.y], [V(0, -1, 0), mn.y], [V(0, 0, 1), -mx.z], [V(0, 0, -1), mn.z],
    ].map(([n, c]) => ({ local: new THREE.Plane(n, c), world: new THREE.Plane() }));
    const planes = clipPlanes.map((p) => p.world);
    const updateClip = () => {
      body.updateMatrixWorld(true);
      for (const p of clipPlanes) p.world.copy(p.local).applyMatrix4(body.matrixWorld);
    };
    updateClip();
    const skip = new Set();
    for (const h of [ton, ww]) h.root.traverse((o) => skip.add(o));
    const seen = new Set();
    body.traverse((o) => {
      if (!o.isMesh || skip.has(o)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || seen.has(m)) continue;
        seen.add(m);
        m.clippingPlanes = planes;
        m.clipIntersection = true;
        m.needsUpdate = true;
      }
    });
    engine.onUpdate(updateClip, 90);
  }

  // views: list of "px,py,pz;lx,ly,lz;fov" in taxi body space
  const views = (params.get('views') || '0.5,1.16,1.1;-0.06,1.1,0.45;56').split('|').map((v) => {
    if (v.startsWith('@')) return { head: v.slice(1) };
    const [p, l, f] = v.split(';');
    return { p: V(...p.split(',').map(Number)), l: V(...l.split(',').map(Number)), fov: Number(f || 50) };
  });
  const eye = new THREE.Object3D(), look = new THREE.Object3D();
  body.add(eye, look);

  // eyes: Ton on her face, she stares into the camera (or at Ton with &wlook=ton)
  // Ton's gaze: her face, pulled a little toward the lens so his face turns to the camera (&tblend)
  const tonGaze = new THREE.Object3D();
  scene.add(tonGaze);
  const tblend = num('tblend', 0.7);
  engine.onUpdate(() => {
    const a = ww.bones.Head.getWorldPosition(V(0, 0, 0));
    const b = eye.getWorldPosition(V(0, 0, 0));
    tonGaze.position.copy(a).lerp(b, tblend);
  }, 18);
  ton.lookAt(tonGaze, { weight: 1, speed: 30, unlimited: params.get('tunl') === '1' });
  ww.lookAt(params.get('wlook') === 'ton' ? ton.bones.Head : eye, { weight: 1, speed: 30, unlimited: true });

  // ---------------------------------------------------------------- light
  // the dome lamp's light as two narrow warm cones from the lamp onto the two faces, so the headliner
  // right next to the bulb stays dark (the title sits on it); &dome is the lamp's own glow / spill
  const domeAt = taxi.anchorLocal('cabinLight').add(V(0, -0.06, 0.02));
  const faceSpot = (color, intensity, target, angle) => {
    const sp = new THREE.SpotLight(color, intensity, 2.2, angle, 0.85, 2);
    sp.position.copy(domeAt);
    sp.target.position.copy(target);
    body.add(sp, sp.target);
    return sp;
  };
  faceSpot(0xffc78c, num('tkey', 1.6), V(num('tkx', 0.24), num('tky', 1.0), num('tkz', 0.16)), num('tcone', 0.45));
  faceSpot(0xf2f4ff, num('key', 4), V(num('kx', -0.12), num('ky', 0.96), num('kz', 0.9)), num('cone', 0.42));
  // a faint warm bounce from the dress / seat onto her face (from below)
  const wkey = new THREE.PointLight(0xffe6c8, num('wkey', 0.22), 1.0, 2);
  wkey.position.set(num('wkx', -0.05), num('wky', 0.85), num('wkz', 0.75));
  body.add(wkey);
  // cold moon spill through the rear glass (separates her wet hair from the dark)
  const rim = new THREE.PointLight(0x8aa4c8, num('rim', 0.5), 2.4, 2);
  rim.position.set(num('rx', -0.45), num('ry', 1.25), num('rz', 1.45));
  body.add(rim);
  // night in the cabin: the taxi's own materials a step darker (the sky's ambient reaches in unoccluded),
  // the cream headliner much darker (old, nicotine-stained), so only the two lit faces carry the frame
  const skipChars = new Set();
  for (const h of [ton, ww]) h.root.traverse((o) => skipChars.add(o));
  const seenM = new Set();
  body.traverse((o) => {
    if (!o.isMesh || skipChars.has(o)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m?.color || seenM.has(m)) continue;
      seenM.add(m);
      m.color.multiplyScalar(num('cabinDark', 0.55) * (/headliner/i.test(m.name || '') ? num('liner', 0.45) : 1));
    }
  });

  // her long hair has one card standing up off the crown like a horn: clip it a little above the scalp
  if (num('horn', 0.13) > 0) {
    engine.renderer.localClippingEnabled = true;
    const hornPlane = new THREE.Plane();
    const hq = new THREE.Quaternion(), up = V(0, 0, 0), top = V(0, 0, 0);
    const wwMats = new Set();
    ww.root.traverse((o) => {
      if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) wwMats.add(m);
    });
    for (const m of wwMats) {
      m.clippingPlanes = [hornPlane];
      m.needsUpdate = true;
    }
    engine.onUpdate(() => {
      const I = ww.t.index.Head;
      ww.boneFrame(I, hq);
      up.set(0, 1, 0).applyQuaternion(hq).normalize();
      ww.bones.Head.getWorldPosition(top).addScaledVector(up, num('horn', 0.13));
      // keep the side of the plane the head is on: points beyond `top` along `up` are cut
      hornPlane.normal.copy(up).negate();
      hornPlane.constant = up.dot(top);
    }, 85);
  }

  const setView = (v) => {
    if (v.head) {
      // close-up of a head (inspection): 0.4 m from it toward the first view's camera
      const h = (v.head === 'ww' ? ww : ton).bones.Head.getWorldPosition(V(0, 0, 0));
      eye.position.copy(views[0].p);
      body.updateMatrixWorld(true);
      const c = eye.getWorldPosition(V(0, 0, 0));
      const p = h.clone().add(c.sub(h).setLength(0.4));
      cameraRig.cinematic({ position: p, lookAt: h.add(V(0, 0.04, 0)), cut: true, fov: 36 });
      engine.camera.fov = 36;
      engine.camera.updateProjectionMatrix();
      return;
    }
    eye.position.copy(v.p);
    look.position.copy(v.l);
    body.updateMatrixWorld(true);
    cameraRig.cinematic({ position: eye.getWorldPosition(V(0, 0, 0)), lookAt: look.getWorldPosition(V(0, 0, 0)), cut: true, fov: v.fov });
    engine.camera.fov = v.fov;
    engine.camera.updateProjectionMatrix();
  };
  cameraRig.lookEnabled = false;
  setView(views[0]);

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
