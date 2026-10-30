// Narrative cast sandbox: renders the appearance specs from src/game/data/characters.js through
// createHumanoid, so the narrative data can be checked visually (faces, outfits, family resemblance).
//   ?ids=player,somchai,ahKong   (default: the whole speaking cast)
//   &cam=lineup|close            &legacy=1 (map face params back to the old 0..1 scale, for comparison)
//   &hour=22  &studio=1 (neutral light)
// node tools/shot.mjs --sandbox=narrative-cast --params="ids=player,somchai&cam=close" --out=.shots/narrative-cast.png
import * as THREE from 'three';
import { paintedMaterial, sky, GLOBAL_UNIFORMS } from '../render/index.js';
import { createHumanoid } from '../characters/index.js';
import { CHARACTERS } from '../game/data/index.js';

const ALL = ['player', 'somchai', 'ahKong', 'sri', 'womanWhite', 'piak', 'boyM', 'nuan', 'monk', 'saman', 'bua', 'auntieLek'];

export default async function ({ engine, cameraRig, params }) {
  const ids = (params.get('ids') || ALL.join(',')).split(',').filter((id) => CHARACTERS[id]?.appearance);
  const studio = params.get('studio') === '1';
  sky.setHour(+(params.get('hour') || 22));
  const scene = engine.scene;
  scene.background = new THREE.Color(0x070a0e);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), paintedMaterial({ color: 0x1d1f21, roughness: 0.55 }));
  scene.add(ground);
  // sodium street lamp + moon, like a roadside pickup
  const lamp = new THREE.SpotLight(0xffc27a, 110, 22, 0.95, 0.6, 1.4);
  lamp.position.set(-1.6, 5.8, 2.2);
  lamp.target.position.set(0, 1, 0);
  scene.add(lamp, lamp.target);
  const moon = new THREE.DirectionalLight(0x6f8fb0, 0.5);
  moon.position.set(4, 6, -6);
  scene.add(moon);
  scene.add(new THREE.HemisphereLight(0x34465a, 0x0c0c0c, 0.6));
  if (studio) {
    scene.background = new THREE.Color(0x3a3d40);
    GLOBAL_UNIFORMS.uFogDensity.value = 0.0;
    const key = new THREE.DirectionalLight(0xfff2e0, 2.0);
    key.position.set(-2, 3, 3);
    scene.add(key, new THREE.AmbientLight(0x808890, 0.5));
    lamp.intensity = 0;
  }

  const legacy = params.get('legacy') === '1';
  const toLegacy = (v) => (v == null ? v : 0.5 + (v - 1) / 0.4); // inverse of the fix: 1.0 -> 0.5
  const chars = [];
  const n = ids.length;
  const t0 = performance.now();
  ids.forEach((id, i) => {
    const a = CHARACTERS[id].appearance;
    const spec = { ...a, face: { ...a.face } };
    if (legacy) for (const k of ['eyeSize', 'noseWidth', 'jaw', 'cheek']) spec.face[k] = toLegacy(spec.face[k]);
    const h = createHumanoid(spec);
    const x = (i - (n - 1) / 2) * 0.8;
    h.root.position.set(x, 0, -Math.abs(i - (n - 1) / 2) * 0.08);
    h.root.rotation.y = Math.PI - x * 0.06; // face the camera (+Z)
    scene.add(h.root);
    chars.push(h);
  });
  console.log(`[narrative-cast] built ${n} in ${(performance.now() - t0).toFixed(0)} ms: ${ids.join(' ')}`);

  // labels pinned under each character's feet (DOM, so they stay crisp)
  const labels = ids.map((id) => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;transform:translate(-50%,0);text-align:center;font:12px Sarabun,sans-serif;color:#cbbf9f;z-index:20;pointer-events:none;text-shadow:0 1px 2px #000;white-space:nowrap';
    el.innerHTML = `${CHARACTERS[id].nameTH}<br><small style="opacity:.6">${CHARACTERS[id].nameEN}${legacy ? ' (legacy face)' : ''}</small>`;
    document.body.appendChild(el);
    return el;
  });
  const _p = new THREE.Vector3();
  engine.onUpdate(() => {
    const w = engine.renderer.domElement.clientWidth;
    const h = engine.renderer.domElement.clientHeight;
    chars.forEach((c, i) => {
      _p.set(0, cam === 'close' ? 1.32 : -0.02, 0).applyMatrix4(c.root.matrixWorld).project(engine.camera);
      labels[i].style.left = `${((_p.x + 1) / 2) * w}px`;
      labels[i].style.top = `${((1 - _p.y) / 2) * h + 4}px`;
    });
  }, 95);

  const cam = params.get('cam') || 'lineup';
  const eye = new THREE.Object3D();
  scene.add(eye);
  const H = 1.62;
  if (cam === 'close') {
    eye.position.set(0, H * 0.93, Math.max(1.0, n * 0.5));
    cameraRig.fovOffset = -30;
  } else {
    eye.position.set(0, 1.15, n * 0.5 + 1.0);
    cameraRig.fovOffset = -14;
  }
  const look = new THREE.Vector3(0, cam === 'close' ? H * 0.9 : 0.88, 0);
  const dir = look.clone().sub(eye.position).normalize();
  cameraRig.attach(eye, null, { yaw: Math.atan2(-dir.x, -dir.z), pitch: Math.asin(dir.y) });
  cameraRig.lookEnabled = false;
  window.__chars = chars;
}
