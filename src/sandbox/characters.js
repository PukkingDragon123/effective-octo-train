// Characters sandbox: the cast under a street lamp at night, close-up faces, actions.
//   ?view=lineup|single   &who=<preset id>  &ids=a,b,c (lineup)  &bind=1 (rest pose)  &studio=1 (neutral light)
//   &cam=front|side|back|three|close|closeSide|hands|feet   &act=<action>  &mode=<mode>  &expr=<expression>
//   &cams=front,close,...  -> window.__nextCam() cycles them (use with --shots=N --evalEach="__nextCam()")
import * as THREE from 'three';
import { paintedMaterial, sky, GLOBAL_UNIFORMS } from '../render/index.js';
import { createHumanoid, PRESETS, PASSENGERS } from '../characters/index.js';

export default async function ({ engine, cameraRig, params }) {
  const who = params.get('who');
  const view = params.get('view') || (who ? 'single' : 'lineup');
  const bind = params.get('bind') === '1';
  const studio = params.get('studio') === '1';
  sky.setHour(+(params.get('hour') || 22));
  const scene = engine.scene;
  scene.background = new THREE.Color(0x070a0e);
  // ground: wet asphalt
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), paintedMaterial({ color: 0x1d1f21, roughness: 0.55 }));
  ground.receiveShadow = true;
  scene.add(ground);
  // lamp post with a sodium lamp
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

  const t0 = performance.now();
  const chars = [];
  if (view === 'lineup') {
    const ids = (params.get('ids') || [...PASSENGERS, 'ahKong'].join(',')).split(',');
    const n = ids.length;
    ids.forEach((id, i) => {
      const h = createHumanoid(PRESETS[id] || { id });
      const x = (i - (n - 1) / 2) * 0.78;
      h.root.position.set(x, 0, -Math.abs(i - (n - 1) / 2) * 0.1);
      h.root.rotation.y = Math.PI - x * 0.08; // face the camera (+Z)
      h.bindPose = bind;
      scene.add(h.root);
      chars.push(h);
    });
  } else {
    const h = createHumanoid(PRESETS[who] || { id: who });
    h.root.rotation.y = Math.PI; // face +Z (camera side)
    h.bindPose = bind;
    scene.add(h.root);
    chars.push(h);
    if (params.get('act')) h.play(params.get('act'), { loop: true });
    if (params.get('mode')) h.setMode(params.get('mode'));
    if (params.get('expr')) h.setExpression({ [params.get('expr')]: +(params.get('amt') || 1) });
  }
  if (params.get('tex') === '1') {
    // show the painted face texture on a card next to the character
    const tex = chars[0].materials.head.map;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: tex }));
    card.position.set(0, 1.0, 0.3);
    scene.add(card);
    chars[0].root.visible = false;
  }
  const ms = performance.now() - t0;
  console.log(`[characters] built ${chars.length} in ${ms.toFixed(0)} ms`, chars.map((h) => `${h.spec.id}:${h.body.geometry.userData.tris}+${h.head.geometry.userData.tris}`).join(' '));

  // cameras (characters face +Z)
  const h0 = chars[0];
  const hy = h0.P.headY + 0.06 * h0.P.headScale;
  const H = h0.P.H;
  const n = chars.length;
  const CAMS = {
    front: [[0, H * 0.6, H * 1.55], [0, H * 0.52, 0]],
    side: [[H * 1.55, H * 0.6, 0], [0, H * 0.52, 0]],
    back: [[0, H * 0.6, -H * 1.55], [0, H * 0.52, 0]],
    three: [[H * 0.9, H * 0.75, H * 1.25], [0, H * 0.55, 0]],
    close: [[0, hy, 0.58], [0, hy - 0.01, 0]],
    closeSide: [[0.5, hy, 0.32], [0, hy - 0.01, 0]],
    close3: [[0.32, hy + 0.02, 0.5], [0, hy - 0.01, 0]],
    torso: [[0, H * 0.72, 1.3], [0, H * 0.7, 0]],
    hands: [[0.25, H * 0.55, 0.75], [0.15, H * 0.5, 0]],
    feet: [[0.3, 0.45, 0.85], [0, 0.08, 0]],
    lineup: [[0, 1.2, n * 0.62 + 1.3], [0, 0.92, 0]],
    lineupClose: [[0, 1.35, 2.4], [0, 1.3, 0]],
    tex: [[0, 1.0, 1.5], [0, 1.0, 0.3]],
    eye: [[-h0.P.face.eyeX * 0.5, h0.P.eyeY + 0.005, 0.26], [-h0.P.face.eyeX * 0.5, h0.P.eyeY, 0]],
  };
  const camList = (params.get('cams') || params.get('cam') || (view === 'lineup' ? 'lineup' : 'front')).split(',');
  const eye = new THREE.Object3D();
  scene.add(eye);
  let ci = 0;
  const setCam = (name) => {
    const c = CAMS[name] || CAMS.front;
    const off = params.get('camx') ? +params.get('camx') : 0;
    eye.position.set(c[0][0] + off, c[0][1], c[0][2]);
    const look = new THREE.Vector3(c[1][0] + off, c[1][1], c[1][2]);
    const dir = look.clone().sub(eye.position).normalize();
    cameraRig.attach(eye, null, { yaw: Math.atan2(-dir.x, -dir.z), pitch: Math.asin(dir.y) });
    cameraRig.lookEnabled = false;
    if (name.startsWith('close')) cameraRig.fovOffset = -30;
    else if (name === 'eye') cameraRig.fovOffset = -45;
    else if (name === 'hands' || name === 'feet' || name === 'torso') cameraRig.fovOffset = -20;
    else cameraRig.fovOffset = -8;
  };
  setCam(camList[0]);
  window.__nextCam = () => setCam(camList[++ci % camList.length]);
  window.__chars = chars;
}
