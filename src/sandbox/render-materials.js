// Material test bench: painted / foliage / skin materials under a lamp + moon (or dawn sun).
// params: hour (default 22.5), wet=0..1, cam=front|back (back = looking toward the light for translucency)
import * as THREE from 'three';
import { paintedMaterial, foliageMaterial, skinMaterial, sky, lightPool, setPaintedParams } from '../render/index.js';
import { makeRng } from '../core/math.js';

function leafTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rng = makeRng(5);
  for (let i = 0; i < 60; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 52;
    g.save();
    g.translate(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    g.rotate(a + (rng() - 0.5));
    g.fillStyle = `hsl(${90 + rng() * 30}, ${35 + rng() * 20}%, ${24 + rng() * 18}%)`;
    g.beginPath();
    g.ellipse(0, 0, 12, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default async function ({ engine, cameraRig, params }) {
  const P = (k, d) => (params.get(k) !== null ? params.get(k) : d);
  const hour = parseFloat(P('hour', 22.5));
  const scene = engine.scene;
  sky.sunAzimuth = 180; // sun behind the bench (toward -Z from the camera's point of view at cam=back)
  sky.setHour(hour);
  sky.setWeather({ rain: 0, fog: 0, wind: 0.5 }, 0);
  sky.setWetness(parseFloat(P('wet', 0.7)));

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30, 1, 1).rotateX(-Math.PI / 2), paintedMaterial({ color: 0x3a3a38, roughness: 0.85, wet: 1, brush: 0.8, puddles: 1.3 }));
  scene.add(floor);
  const items = [
    ['mossy concrete', new THREE.BoxGeometry(0.9, 1.1, 0.9), paintedMaterial({ color: 0x9a968a, brush: 0.9, moss: 1, dirt: 1, wet: 0.6, dirtHeight: 0.5 })],
    ['rust metal', new THREE.CylinderGeometry(0.35, 0.35, 1.2, 24), paintedMaterial({ color: 0x6e4228, roughness: 0.75, metalness: 0.4, brush: 1, dirt: 0.6, wet: 0.5 })],
    ['painted wood', new THREE.BoxGeometry(0.5, 1.4, 0.5), paintedMaterial({ color: 0xa83a2a, roughness: 0.7, brush: 0.9, dirt: 0.8, moss: 0.4, wet: 0.5 })],
    ['triplanar rock', new THREE.IcosahedronGeometry(0.6, 3), paintedMaterial({ color: 0xffffff, triplanar: 'rock', triplanarScale: 0.8, brush: 0.7, moss: 0.7, wet: 0.6 })],
    ['skin', new THREE.SphereGeometry(0.4, 48, 32), skinMaterial({ color: 0xc89070 })],
    ['ghost skin', new THREE.SphereGeometry(0.4, 48, 32), skinMaterial({ color: 0xc89070, pale: 0.9, rim: 1 })],
    ['taxi paint', new THREE.SphereGeometry(0.45, 48, 32), paintedMaterial({ color: 0x3f7a3a, roughness: 0.35, metalness: 0.1, brush: 0.3, wet: 0.9, dirt: 0.6 })],
  ];
  const rowW = items.length * 1.3;
  items.forEach(([name, geo, mat], i) => {
    const m = new THREE.Mesh(geo, mat);
    geo.computeBoundingBox();
    const h = geo.boundingBox.max.y - geo.boundingBox.min.y;
    m.position.set(-rowW / 2 + 0.65 + i * 1.3, h / 2 + 0.01, -4);
    m.castShadow = m.receiveShadow = true;
    m.name = name;
    scene.add(m);
  });
  // foliage cluster (translucency) and grass
  const fol = foliageMaterial({ map: leafTex(), translucency: 0.9, color: 0x9aaa80 });
  for (let k = 0; k < 14; k++) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), fol);
    q.position.set(rowW / 2 + 0.8 + Math.sin(k * 2.1) * 0.4, 1.0 + Math.cos(k * 1.3) * 0.45, -4.2 + Math.sin(k * 0.7) * 0.3);
    q.rotation.set(Math.sin(k) * 0.6, k * 0.9, 0);
    scene.add(q);
  }
  lightPool.add({ position: new THREE.Vector3(-1.5, 3.2, -2.2), color: 0xffa860, intensity: 60, distance: 14, glow: { size: 0.25 }, flicker: 'none' });
  lightPool.add({ position: new THREE.Vector3(3.5, 2.5, -5.5), color: 0xb8e0ff, intensity: 30, distance: 10, glow: { size: 0.2 } });

  const eye = new THREE.Object3D();
  if (P('cam', 'front') === 'back') {
    eye.position.set(rowW / 2 + 0.5, 1.2, -1.4);
    eye.lookAt(rowW / 2 + 0.8, 1.2, -6);
  } else {
    eye.position.set(0.3, 1.6, 0.8);
    eye.lookAt(0, 0.55, -4);
  }
  eye.rotateY(Math.PI);
  scene.add(eye);
  cameraRig.attach(eye, eye, { yaw: 0, pitch: 0 });
  sky.setShadowFocus(new THREE.Vector3(0, 0, -4));
  window.__mat = { setPaintedParams };
}
