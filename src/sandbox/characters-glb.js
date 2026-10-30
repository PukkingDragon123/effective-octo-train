// GLB characters sandbox: the cast under a street lamp at night, close-up faces, Thai actions,
// the ghost deformation sequence and the first-person body on a test steering wheel.
//   ?view=lineup|single|actions|ghost|fp|mirror
//   &who=<preset id>  &ids=a,b,c (lineup subset)  &cam=front|close|close3|closeSide|three|side|back|torso|hands|lineup|lineupClose
//   &act=<action>  &mode=<mode>  &expr=<name>&amt=0..1  &talk=1  &studio=1  &hour=22
//   ghost view: &stage=0..7 (neutral, neckTwist, headRoll snap, backbend, levitate, limbBreak+jitter, mouthStretch, all)
//   fp view: &pitch=-0.75 &yaw=0 (camera)  &steer=0 (wheel angle, rad)
import * as THREE from 'three';
import { paintedMaterial, sky, GLOBAL_UNIFORMS } from '../render/index.js';
import { loadCharacterAssets, createHumanoidGLB, PlayerBodyGLB, PRESETS, PASSENGERS } from '../characters/glb/index.js';
import { LAYERS } from '../core/layers.js';
import { CHARACTERS } from '../game/data/characters.js';

// narrative appearance specs (the game's truth) with the contract presets as fallback
const SPEC = (id) => (CHARACTERS[id]?.appearance ? { ...CHARACTERS[id].appearance, id } : PRESETS[id] || { id });
const CAST = ['sri', 'womanWhite', 'piak', 'boyM', 'nuan', 'monk', 'saman', 'bua', 'somchai', 'ahKong', 'player'];

export default async function ({ engine, cameraRig, params }) {
  const t0 = performance.now();
  await loadCharacterAssets();
  const view = params.get('view') || (params.get('who') ? 'single' : 'lineup');
  const studio = params.get('studio') === '1';
  sky.setHour(+(params.get('hour') || 22));
  const scene = engine.scene;
  // ground: wet asphalt; lamp post with a sodium lamp (same set as the SDF sandbox for comparison)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), paintedMaterial({ color: 0x1d1f21, roughness: 0.55 }));
  ground.receiveShadow = true;
  scene.add(ground);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 6, 10), paintedMaterial({ color: 0x5a5c58, roughness: 0.7 }));
  post.position.set(-2.4, 3, 1.4);
  scene.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.08), paintedMaterial({ color: 0x5a5c58 }));
  arm.position.set(-1.9, 5.9, 1.4);
  scene.add(arm);
  const lamp = new THREE.SpotLight(0xffc27a, 90, 18, 0.85, 0.6, 1.5);
  lamp.position.set(-1.4, 5.8, 1.2);
  lamp.target.position.set(0, 0, 0);
  scene.add(lamp, lamp.target);
  lamp.castShadow = params.get('shadow') === '1';
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0004;
  const moon = new THREE.DirectionalLight(0x6f8fb0, 0.45);
  moon.position.set(4, 6, -6);
  scene.add(moon);
  scene.add(new THREE.HemisphereLight(0x34465a, 0x0c0c0c, 0.5));
  // soft face fill from the camera side (like light spilling from a shop front)
  const fill = new THREE.PointLight(0xffd8b0, params.get('fill') ? +params.get('fill') : 0.45, 6, 1.6);
  fill.position.set(1.4, 1.9, 2.2);
  scene.add(fill);
  if (studio) {
    scene.background = new THREE.Color(0x3a3d40);
    GLOBAL_UNIFORMS.uFogDensity.value = 0.0;
    const key = new THREE.DirectionalLight(0xfff2e0, 2.0);
    key.position.set(-2, 3, 3);
    scene.add(key);
    const f2 = new THREE.DirectionalLight(0xcfe0ff, 0.7);
    f2.position.set(3, 1.5, 2);
    scene.add(f2);
    scene.add(new THREE.AmbientLight(0x808890, 0.5));
    lamp.intensity = 0;
  }
  const chars = [];
  const add = (id, x, z = 0, faceYaw = Math.PI) => {
    const h = createHumanoidGLB(SPEC(id));
    h.root.position.set(x, 0, z);
    h.root.rotation.y = faceYaw; // face +Z (the camera)
    scene.add(h.root);
    chars.push(h);
    return h;
  };
  const eyeT = new THREE.Object3D();
  eyeT.position.set(0, 1.55, 3);
  scene.add(eyeT);
  let player = null;
  let focus = null;

  if (view === 'lineup') {
    const ids = (params.get('ids') || CAST.join(',')).split(',');
    const n = ids.length;
    ids.forEach((id, i) => {
      const x = (i - (n - 1) / 2) * 0.72;
      const h = add(id, x, -Math.abs(i - (n - 1) / 2) * 0.08, Math.PI - x * 0.06);
      h.lookAt(eyeT, { weight: 0.6 });
    });
  } else if (view === 'faces') {
    // portraits: heads aligned at 1.5 m
    const ids = (params.get('ids') || 'womanWhite,bua,boyM,ahKong').split(',');
    ids.forEach((id, i) => {
      const x = (i - (ids.length - 1) / 2) * 0.42;
      const h = add(id, x, 0);
      h.root.position.y = 1.5 - (h.look.height - 0.11);
      h.lookAt(eyeT, { weight: 0.9 });
      if (params.get('talk') === '1' && i % 2) h.setTalking(true);
      if (params.get('expr')) h.setExpression({ [params.get('expr')]: +(params.get('amt') || 1) });
    });
  } else if (view === 'single') {
    const h = add(params.get('who') || 'sri', 0);
    focus = h;
    if (params.get('mode')) h.setMode(params.get('mode'));
    if (params.get('act')) h.play(params.get('act'), { loop: true, side: params.get('side') || undefined });
    if (params.get('expr')) h.setExpression({ [params.get('expr')]: +(params.get('amt') || 1) });
    if (params.get('talk') === '1') h.setTalking(true);
    if (params.get('look') !== '0') h.lookAt(eyeT, { weight: 0.8 });
  } else if (view === 'actions') {
    // hail · wai · smoke · sitCar · drive
    const sri = add('sri', -1.6, 0); sri.play('hail', { side: 'R' });
    const m = add('boyM', -0.8, 0.1); m.play('wai', { loop: true });
    const kong = add('ahKong', 0.0, 0.1); kong.play('smoke', { loop: true });
    const seat = new THREE.Object3D(); seat.position.set(0.85, 0.5, 0); seat.rotation.y = Math.PI; scene.add(seat);
    const w = createHumanoidGLB(SPEC('womanWhite')); w.sitAt(seat, { pose: 'sitCar' }); w.lookAt(eyeT, { weight: 0.7 }); chars.push(w);
    const seat2 = new THREE.Object3D(); seat2.position.set(1.75, 0.5, 0); seat2.rotation.y = Math.PI; scene.add(seat2);
    const wheel = testWheel(); wheel.root.position.set(0, 0.34, -0.4); seat2.add(wheel.root);
    const s = createHumanoidGLB(SPEC('somchai')); s.sitAt(seat2, { pose: 'drive' });
    s.setHandTarget('L', wheel.gripL, { grip: 1 }); s.setHandTarget('R', wheel.gripR, { grip: 1 });
    chars.push(s);
    for (const b of [seat, seat2]) { const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), paintedMaterial({ color: 0x3a2e28 })); box.position.y = -0.06; b.add(box); const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.08), paintedMaterial({ color: 0x3a2e28 })); back.position.set(0, 0.3, 0.27); back.rotation.x = -0.15; b.add(back); }
  } else if (view === 'ghost') {
    const stages = (params.get('stages') || params.get('stage') || '1,2,3,4,5,7').split(',').map(Number);
    const G = [
      {}, { neckTwist: 2.2 }, { headRoll: 1.45, jitter: 0.3 }, { backbend: 1.1, headPitch: -0.6 }, { levitate: 0.35 },
      { limbBreak: 1, jitter: 0.6, armTwist: 0.8 }, { mouthStretch: 1, headPitch: -0.2 }, { neckTwist: 1.4, backbend: 0.6, levitate: 0.25, mouthStretch: 0.8, jitter: 0.4, stretch: 0.6 },
    ];
    stages.forEach((st, i) => {
      const h = add(params.get('who') || 'womanWhite', (i - (stages.length - 1) / 2) * 0.85, 0);
      focus = focus || h;
      h.setGhost({ ...(G[st] || {}), stare: 1 }, 100);
      if (st === 6 || st === 7) h.setExpression({ creepy: 1 });
      if (params.get('act')) h.play(params.get('act'), { loop: true });
      h.lookAt(eyeT, { weight: 1, unlimited: true });
    });
  } else if (view === 'mirror') {
    // reflection double: normal direct view, twisted neck only in the "mirror" (shown side by side)
    const h = add(params.get('who') || 'womanWhite', -0.45);
    const d = h.createReflectionDouble({ neckTwist: 1.6, headRoll: 0.3 });
    scene.add(d.root);
    d.root.position.set(0.45, 0, 0);
    d.setFollow(false);
    d.root.rotation.y = Math.PI;
    d.root.traverse((o) => o.layers.set(LAYERS.DEFAULT));
    chars.push(h, d);
  } else if (view === 'fp') {
    const seat = new THREE.Object3D();
    seat.position.set(0, 0.5, 0);
    scene.add(seat);
    const wheel = testWheel(+(params.get('steer') || 0));
    wheel.root.position.set(0, 0.34, -0.4);
    seat.add(wheel.root);
    const seatMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.52), paintedMaterial({ color: 0x2e2622, roughness: 0.8 }));
    seatMesh.position.set(0, -0.06, 0.05);
    seat.add(seatMesh);
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.4), paintedMaterial({ color: 0x24221f, roughness: 0.7 }));
    dash.position.set(0, 0.42, -0.85);
    seat.add(dash);
    const pedT = new THREE.Object3D(); pedT.position.set(0.1, -0.3, -0.78); seat.add(pedT);
    const pedC = new THREE.Object3D(); pedC.position.set(-0.16, -0.28, -0.78); seat.add(pedC);
    player = new PlayerBodyGLB(SPEC('player'));
    scene.add(player.root);
    player.enterVehicle({ kind: 'taxi', anchors: { driverSeat: seat, steeringWheel: wheel.anchor, pedalThrottle: pedT, pedalClutch: pedC }, parts: { steering: { spin: wheel.spin } }, steeringRadius: 0.19 });
    if (params.get('hold')) player.hold(params.get('hold'));
    chars.push(player.humanoid);
  }
  const ms = performance.now() - t0;
  console.log(`[characters-glb] built ${chars.length} in ${ms.toFixed(0)} ms`, chars.map((h) => `${h.look?.id}:${h.body?.geometry?.userData?.tris ?? '?'}`).join(' '));

  // ---- cameras (characters face +Z)
  const camName = params.get('cam') || (['lineup', 'actions', 'fp', 'faces', 'ghost'].includes(view) ? view : 'front');
  const H = focus ? focus.look.height : 1.65;
  const hy = focus ? focus.headPosition.y : 1.5;
  const n = chars.length;
  const CAMS = {
    front: [[0, H * 0.6, H * 1.6], [0, H * 0.52, 0], -8],
    three: [[H * 0.9, H * 0.78, H * 1.3], [0, H * 0.55, 0], -8],
    side: [[H * 1.6, H * 0.6, 0], [0, H * 0.52, 0], -8],
    back: [[0.3, H * 0.6, -H * 1.6], [0, H * 0.52, 0], -8],
    close: [[0, hy - 0.02, 0.62], [0, hy - 0.03, 0], -32],
    close3: [[0.34, hy, 0.52], [0, hy - 0.03, 0], -32],
    closeSide: [[0.55, hy, 0.18], [0, hy - 0.03, 0], -32],
    torso: [[0, H * 0.72, 1.3], [0, H * 0.68, 0], -20],
    hands: [[0.25, H * 0.55, 0.75], [0.15, H * 0.5, 0], -20],
    lineup: [[0, 1.2, n * 0.55 + 1.0], [0, 0.92, 0], -14],
    faces: [[0, 1.5, +(params.get('camz') || 1.6)], [0, 1.49, 0], -40],
    ghost: [[0.3, 1.25, n * 0.6 + 1.9], [0, 0.95, 0], -12],
    lineupClose: [[0, 1.45, 2.6], [0, 1.38, 0], -12],
    actions: [[0.2, 1.3, 4.6], [0.05, 0.9, 0], -10],
    fp: null,
  };
  const eye = new THREE.Object3D();
  scene.add(eye);
  if (camName === 'fp' && player) {
    cameraRig.attach(player.eye, player.base, { yaw: +(params.get('yaw') || 0), pitch: +(params.get('pitch') || -0.7) });
    cameraRig.lookEnabled = false;
    cameraRig.fovOffset = 0;
  } else {
    const c = CAMS[camName] || CAMS.front;
    const off = params.get('camx') ? +params.get('camx') : 0;
    eye.position.set(c[0][0] + off, c[0][1], c[0][2]);
    const look = new THREE.Vector3(c[1][0] + off, c[1][1], c[1][2]);
    const dir = look.clone().sub(eye.position).normalize();
    cameraRig.attach(eye, null, { yaw: Math.atan2(-dir.x, -dir.z), pitch: Math.asin(dir.y) });
    cameraRig.lookEnabled = false;
    cameraRig.fovOffset = c[2];
    eyeT.position.copy(eye.position);
  }
  window.__chars = chars;
  window.__player = player;
}

/** Simple test steering wheel with the taxi's anchor structure (pivot -> spin, grips). */
function testWheel(steer = 0) {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.rotation.x = -0.45; // column tilt: wheel plane faces the driver
  root.add(pivot);
  const spin = new THREE.Group();
  spin.rotation.z = steer;
  pivot.add(spin);
  const mat = paintedMaterial({ color: 0x1b1a19, roughness: 0.55 });
  spin.add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.016, 10, 48), mat));
  for (const a of [-2.45, -0.69, Math.PI / 2]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.035, 0.014), mat); s.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.01); s.rotation.z = a; spin.add(s); }
  spin.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16).rotateX(Math.PI / 2), mat));
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.4, 10).rotateX(Math.PI / 2), mat);
  col.position.z = -0.22;
  pivot.add(col);
  const anchor = new THREE.Object3D();
  pivot.add(anchor);
  // grips (used directly by NPC drivers in the actions view; the PlayerBody makes its own)
  const mk = (ang, side) => {
    const g = new THREE.Object3D();
    g.position.set(Math.cos(ang) * 0.19, Math.sin(ang) * 0.19, 0.012);
    const radial = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0);
    const along = new THREE.Vector3(0, 0.55, -1).addScaledVector(radial, -0.25).normalize();
    const palm = radial.clone().negate().add(new THREE.Vector3(0, 0, -0.35)).normalize();
    const z = along.clone().negate(), y = palm.clone().negate();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    y.crossVectors(z, x);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    spin.add(g);
    void side;
    return g;
  };
  return { root, pivot, spin, anchor, gripL: mk(Math.PI + 0.32, 'L'), gripR: mk(-0.32, 'R') };
}
