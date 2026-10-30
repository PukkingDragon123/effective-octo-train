// Material test bench: painted / foliage / skin materials under a lamp + moon (or dawn sun).
// params: hour (default 22.5), wet=0..1, cam=front|back (back = looking toward the light for translucency)
import * as THREE from 'three';
import {
  paintedMaterial, foliageMaterial, skinMaterial, sky, lightPool, setPaintedParams, setMaterialDebug, postfx,
  bloodDecalMaterial, silhouetteMaterial, applyWindShadows, particles,
} from '../render/index.js';
import { makeRng } from '../core/math.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  if (P('debug', null)) {
    setMaterialDebug(P('debug', null));
    postfx.enabled = false;
  }
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
  // skinned mesh test (skin + cloth wind on a SkinnedMesh)
  {
    const geo = new THREE.CylinderGeometry(0.18, 0.22, 1.4, 16, 12);
    geo.translate(0, 0.7, 0);
    const pos = geo.getAttribute('position');
    const si = [], sw = [];
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, pos.getY(i) / 1.4));
      si.push(0, 1, 0, 0);
      sw.push(1 - t, t, 0, 0);
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const b0 = new THREE.Bone(), b1 = new THREE.Bone();
    b1.position.y = 0.7;
    b0.add(b1);
    const sk = new THREE.Skeleton([b0, b1]);
    for (const [k, mat] of [[0, skinMaterial({ color: 0xc08868, pale: 0.0 })], [1, paintedMaterial({ color: 0xd8d4c8, wind: 'cloth', brush: 0.5 })]]) {
      const sm = new THREE.SkinnedMesh(geo, mat);
      sm.add(b0.clone ? (k === 0 ? b0 : sk.bones[0].clone()) : b0);
      const bones = [];
      sm.traverse((o) => o.isBone && bones.push(o));
      sm.bind(new THREE.Skeleton(bones));
      bones[1].rotation.z = 0.5;
      sm.position.set(-rowW / 2 - 0.6 - k * 0.7, 0, -4.3);
      sm.castShadow = true;
      scene.add(sm);
    }
  }
  // leaf-cluster cards merged into one geometry with per-card pivots (rigid per-card flutter)
  {
    const cards = [];
    const rng = makeRng(17);
    for (let k = 0; k < 10; k++) {
      const g = new THREE.PlaneGeometry(0.7, 0.7);
      g.rotateX((rng() - 0.5) * 1.2);
      g.rotateY(rng() * Math.PI);
      const c = new THREE.Vector3((rng() - 0.5) * 1.2, 1.6 + rng() * 1.0, (rng() - 0.5) * 0.8);
      g.translate(c.x, c.y, c.z);
      const piv = new Float32Array(4 * 4);
      const ph = rng();
      for (let v = 0; v < 4; v++) piv.set([c.x, c.y, c.z, ph], v * 4);
      g.setAttribute('aLeafPivot', new THREE.BufferAttribute(piv, 4));
      cards.push(g);
    }
    const merged = mergeGeometries(cards);
    const tree = new THREE.Mesh(merged, foliageMaterial({ map: leafTex(), translucency: 0.9, color: 0x8a9a70, leafPivot: true, windStrength: 2 }));
    tree.position.set(rowW / 2 + 2.4, 0, -5);
    tree.castShadow = true;
    scene.add(tree);
    applyWindShadows(tree);
  }
  // blood pool on the floor + a dripping point + a tree-line silhouette flat behind everything
  {
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0).rotateX(-Math.PI / 2), bloodDecalMaterial({ seed: 0.42, smear: 0.5 }));
    pool.position.set(-0.4, 0.012, -2.6);
    scene.add(pool);
    particles.emit('blood', { position: new THREE.Vector3(-0.4, 1.6, -2.8), count: 5, radius: 0.02, height: 1.6, groundY: 0.01 });
    const flat = new THREE.Mesh(new THREE.PlaneGeometry(30, 6).translate(0, 3, 0), silhouetteMaterial({ color: 0x2a3428, alphaTest: 0, fogScale: 2 }));
    flat.position.set(0, 0, -14);
    scene.add(flat);
  }
  lightPool.add({ position: new THREE.Vector3(-1.5, 3.2, -2.2), color: 0xffa860, intensity: 60, distance: 14, glow: { size: 0.25 }, flicker: 'none' });
  lightPool.add({ position: new THREE.Vector3(3.5, 2.5, -5.5), color: 0xb8e0ff, intensity: 30, distance: 10, glow: { size: 0.2 } });

  const eye = new THREE.Object3D();
  if (P('cam', 'front') === 'close') {
    eye.position.set(-rowW / 2 + 1.6, 1.5, -2.0);
    eye.lookAt(-rowW / 2 + 1.2, 0.6, -4);
  } else if (P('cam', 'front') === 'back') {
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
