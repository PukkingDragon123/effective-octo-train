// Quick exterior shape check for the taxi body (no physics / glass).
import * as THREE from 'three';
import { paintedMaterial, sky, lightPool, postfx, GLOBAL_UNIFORMS } from '../render/index.js';
import { buildTaxiExterior } from '../vehicle/TaxiModel.js';
import { LAYERS } from '../core/layers.js';

export default async function ({ engine, cameraRig, params }) {
  const hour = Number(params.get('hour') ?? 22);
  sky.setHour(hour);
  sky.setWeather({ rain: 0, fog: Number(params.get('fog') ?? 0.2) }, 0);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), paintedMaterial({ color: 0x2a2b2c, roughness: 0.6 }));
  ground.receiveShadow = true;
  engine.scene.add(ground);
  const ex = buildTaxiExterior();
  const root = new THREE.Group();
  root.add(ex.shell);
  for (const w of ex.wheels) root.add(w.pivot);
  for (const [id, p] of Object.entries(ex.panes)) {
    const m = new THREE.Mesh(p.geometry, new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.55 }));
    p.parent.add(m);
  }
  const open = Number(params.get('open') ?? 0);
  if (open) {
    ex.doors.fr.group.rotation.y = 1.0 * open;
    ex.doors.rl.group.rotation.y = -1.0 * open;
    ex.trunk.group.rotation.x = -1.0 * open;
  }
  engine.scene.add(root);
  const lights = params.get('lights') !== '0';
  if (lights) {
    for (const k of ['head', 'tail', 'roofSign']) ex.lenses[k].emissiveIntensity = 2;
  }
  // a streetlight above
  lightPool.add({ position: new THREE.Vector3(3.5, 6, -1), color: 0xffb060, intensity: Number(params.get('lamp') ?? 60), distance: 30, flicker: 'none', glow: { size: 0.6 }, pool: true, groundY: 0 });
  const fill = new THREE.DirectionalLight(0x8899bb, Number(params.get('fill') ?? 0.6));
  fill.position.set(-4, 6, 5);
  engine.scene.add(fill);
  const cam = params.get('cam') || 'tq';
  const views = {
    tq: [[4.6, 1.7, -4.8], [0, 0.7, 0]],
    side: [[7.5, 1.1, 0], [0, 0.75, 0]],
    front: [[0, 1.2, -7], [0, 0.7, 0]],
    rear: [[2.5, 1.6, 6.2], [0, 0.75, 0]],
    top: [[0.01, 9, 0], [0, 0, 0]],
    reartq: [[-4.2, 1.9, 5.2], [0, 0.7, 0]],
    inside: [[0.37, 1.15, 0.26], [0.2, 1.0, -2]],
  };
  const [p, t] = views[cam] || views.tq;
  cameraRig.cinematic({ position: new THREE.Vector3(...p), lookAt: new THREE.Vector3(...t), fov: Number(params.get('fov') ?? 45), cut: true });
  engine.camera.layers.enable(LAYERS.GLASS);
  if (params.get('studio') === '1') {
    postfx.enabled = false;
    engine.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    sky.group.visible = false;
    engine.scene.background = new THREE.Color(0x30343a);
    const amb = new THREE.HemisphereLight(0xdde6ff, 0x404040, 1.2);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 8, -6);
    engine.scene.add(amb, key);
    engine.onUpdate(() => {
      GLOBAL_UNIFORMS.uFogDensity.value = 0;
      GLOBAL_UNIFORMS.uFogHeightDensity.value = 0;
    }, 85);
  }
}
