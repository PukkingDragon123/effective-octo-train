// Render module test scene: a wet forest road at night with lamps, a headlight beam,
// trees, grass, particles. URL params:
//   hour=21..30  rain=0..1  painterly=0..1  sharpen=0..1  quality=low|medium|high|ultra  fog=0..1
//   cam=road|lamp|side|up  headlights=0|1  t=seconds of simulated time before capture
import * as THREE from 'three';
import {
  paintedMaterial, foliageMaterial, skinMaterial, sky, lightPool, particles, postfx, GLOBAL_UNIFORMS,
  createVolumetricBeam, applyWindShadows, silhouetteMaterial,
} from '../render/index.js';
import { makeRng, noise } from '../core/math.js';
import { LAYERS } from '../core/layers.js';

function leafClusterTexture(seed = 3, hue = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const rng = makeRng(seed);
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 170; i++) {
    const r = Math.sqrt(rng()) * 108;
    const a = rng() * Math.PI * 2;
    const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r * 0.9;
    const len = 16 + rng() * 22, wid = len * (0.32 + rng() * 0.15);
    const ang = a + (rng() - 0.5) * 1.2;
    const l = 20 + rng() * 22;
    const s = 30 + rng() * 25;
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.fillStyle = `hsl(${88 + hue + rng() * 30}, ${s}%, ${l}%)`;
    g.beginPath();
    g.ellipse(0, 0, len * 0.5, wid * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `hsla(${80 + hue}, 30%, ${l + 12}%, 0.5)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-len * 0.45, 0);
    g.lineTo(len * 0.45, 0);
    g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// painted tree-line flat: canopy blobs + trunks, alpha cut-out
function treeLineTexture(seed = 21) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d');
  const rng = makeRng(seed);
  g.fillStyle = '#56664e';
  for (let i = 0; i < 26; i++) {
    const x = rng() * 1024, w = 6 + rng() * 10, top = 60 + rng() * 120;
    g.fillRect(x, top, w, 256 - top);
  }
  for (let i = 0; i < 140; i++) {
    const x = rng() * 1024, y = 30 + Math.pow(rng(), 0.7) * 150, r = 14 + rng() * 34;
    g.fillStyle = `hsl(${80 + rng() * 30}, ${12 + rng() * 14}%, ${30 + rng() * 14}%)`;
    g.beginPath();
    g.ellipse(x, y, r * (1 + rng() * 0.6), r * (0.7 + rng() * 0.4), rng() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.fillRect(0, 200, 1024, 56);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const rng = makeRng(11);
  for (let i = 0; i < 46; i++) {
    const x = 8 + rng() * 112;
    const h = 60 + rng() * 66;
    const bend = (rng() - 0.5) * 30;
    g.strokeStyle = `hsl(${70 + rng() * 30}, ${25 + rng() * 25}%, ${18 + rng() * 22}%)`;
    g.lineWidth = 1.5 + rng() * 2.5;
    g.beginPath();
    g.moveTo(x, 128);
    g.quadraticCurveTo(x + bend * 0.3, 128 - h * 0.6, x + bend, 128 - h);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeTree(rng, mats, scale = 1) {
  const group = new THREE.Group();
  const h = (7 + rng() * 6) * scale;
  // trunk: a few bent tapered segments merged by hand
  const segs = 4;
  let r0 = (0.28 + rng() * 0.14) * scale;
  const pts = [new THREE.Vector3(0, 0, 0)];
  for (let i = 1; i <= segs; i++) pts.push(new THREE.Vector3((rng() - 0.5) * 0.7 * scale, (h * i) / segs, (rng() - 0.5) * 0.7 * scale));
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = a.distanceTo(b);
    const r1 = r0 * 0.78;
    const geo = new THREE.CylinderGeometry(r1, r0, len, 9, 1, true);
    const m = new THREE.Mesh(geo, mats.bark);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    r0 = r1;
  }
  // branches + leaf cards
  const cards = [];
  const nb = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < nb; i++) {
    const y = h * (0.45 + rng() * 0.5);
    const a = rng() * Math.PI * 2;
    const len = (2 + rng() * 2.5) * scale;
    const dir = new THREE.Vector3(Math.cos(a), 0.35 + rng() * 0.4, Math.sin(a)).normalize();
    const geo = new THREE.CylinderGeometry(0.04 * scale, 0.11 * scale, len, 6, 1, true);
    const m = new THREE.Mesh(geo, mats.bark);
    const base = new THREE.Vector3(0, y, 0);
    m.position.copy(base).addScaledVector(dir, len / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    m.castShadow = true;
    group.add(m);
    const tip = base.clone().addScaledVector(dir, len);
    const nc = 9 + Math.floor(rng() * 6);
    for (let k = 0; k < nc; k++) {
      const p = tip.clone().add(new THREE.Vector3((rng() - 0.5) * 2.6, (rng() - 0.35) * 1.6, (rng() - 0.5) * 2.6).multiplyScalar(scale));
      cards.push({ p, s: (1.5 + rng() * 1.3) * scale, ry: rng() * Math.PI, rx: (rng() - 0.5) * 1.2 });
    }
  }
  // crown top
  for (let k = 0; k < 18; k++) {
    const p = new THREE.Vector3((rng() - 0.5) * 4, h + (rng() - 0.3) * 2.2, (rng() - 0.5) * 4).multiplyScalar(scale);
    cards.push({ p, s: (1.6 + rng() * 1.2) * scale, ry: rng() * Math.PI, rx: (rng() - 0.5) * 1.2 });
  }
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mats.leaf, cards.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
  cards.forEach((c, i) => {
    e.set(c.rx, c.ry, 0);
    q.setFromEuler(e);
    s.set(c.s, c.s, c.s);
    m4.compose(c.p, q, s);
    im.setMatrixAt(i, m4);
  });
  im.castShadow = true;
  im.receiveShadow = true;
  group.add(im);
  return group;
}

export default async function ({ engine, cameraRig, params, settings }) {
  const P = (k, d) => (params.get(k) !== null ? params.get(k) : d);
  const hour = parseFloat(P('hour', 21.5));
  const rain = parseFloat(P('rain', hour < 24.5 ? 0.7 : 0));
  const paint = P('painterly', null);
  const quality = P('quality', null);
  if (quality) settings.set('graphicsPreset', quality);
  if (paint !== null) settings.set('painterly', parseFloat(paint));
  const sharpen = P('sharpen', null);
  if (sharpen !== null) settings.set('sharpen', parseFloat(sharpen));
  const camMode = P('cam', 'road');
  const headlights = P('headlights', parseFloat(P('hour', 21.5)) >= 29.4 ? '0' : '1') !== '0';

  const scene = engine.scene;
  const rng = makeRng(7);
  sky.sunAzimuth = parseFloat(P('sunaz', 18));
  sky.setHour(hour);
  sky.setWeather({ rain, fog: parseFloat(P('fog', 0)), wind: 0.35 }, 0);
  sky.setWetness(Math.max(rain, hour < 26 ? 0.75 : 0.35));

  // --- ground + road --------------------------------------------------------------------
  const groundGeo = new THREE.PlaneGeometry(220, 220, 110, 110).rotateX(-Math.PI / 2);
  const pos = groundGeo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const roadMask = Math.min(1, Math.max(0, (Math.abs(x - roadX(z)) - 5) / 6));
    pos.setY(i, noise.fbm2(x * 0.03, z * 0.03, 3) * 1.6 * roadMask + roadMask * 0.25 - 0.05);
  }
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, paintedMaterial({ color: 0x46503a, roughness: 0.95, brush: 0.85, moss: 0.6, wet: 0.7, dirt: 0 }));
  ground.receiveShadow = true;
  scene.add(ground);

  function roadX(z) {
    return Math.sin(z * 0.018) * 6;
  }
  // road ribbon
  const roadPts = [];
  for (let z = 40; z >= -170; z -= 2) roadPts.push(z);
  const rv = [], ri = [], ruv = [];
  roadPts.forEach((z, k) => {
    const x = roadX(z);
    rv.push(x - 3.1, 0.02, z, x + 3.1, 0.02, z);
    ruv.push(0, k * 0.3, 1, k * 0.3);
    if (k > 0) {
      const a = (k - 1) * 2;
      ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
  roadGeo.setIndex(ri);
  roadGeo.computeVertexNormals();
  const road = new THREE.Mesh(roadGeo, paintedMaterial({ color: 0x2c2d2e, roughness: 0.78, brush: 0.7, wet: 1.0, puddles: 1.2 }));
  road.receiveShadow = true;
  scene.add(road);
  // dashed centre line + edge lines
  const lineMat = paintedMaterial({ color: 0xb8ad8a, roughness: 0.6, brush: 0.5, wet: 0.9 });
  for (let z = 30; z > -170; z -= 7) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 3).rotateX(-Math.PI / 2), lineMat);
    m.position.set(roadX(z), 0.03, z);
    m.rotation.y = Math.atan(Math.cos(z * 0.018) * 6 * 0.018);
    scene.add(m);
  }

  // --- trees + undergrowth ------------------------------------------------------------------
  const matsA = {
    bark: paintedMaterial({ color: 0x3e362c, roughness: 0.92, brush: 0.9, moss: 0.7, wet: 0.6, wind: 'trunk', windHeightScale: 1 }),
    leaf: foliageMaterial({ map: leafClusterTexture(3), color: 0x7f9070, translucency: 0.7, wind: 'leaf', alphaTest: 0.45 }),
  };
  const matsB = {
    bark: matsA.bark,
    leaf: foliageMaterial({ map: leafClusterTexture(9, -14), color: 0x6c7c5a, translucency: 0.6, wind: 'leaf', alphaTest: 0.45 }),
  };
  const trees = new THREE.Group();
  for (let i = 0; i < 64; i++) {
    const z = 30 - i * 3.2 - rng() * 3;
    const side = i % 2 ? 1 : -1;
    const x = roadX(z) + side * (5.8 + rng() * 12);
    const t = makeTree(rng, rng() < 0.5 ? matsA : matsB, 0.85 + rng() * 0.7);
    t.position.set(x, 0, z);
    t.rotation.y = rng() * Math.PI * 2;
    trees.add(t);
  }
  scene.add(trees);
  applyWindShadows(trees);

  // grass tufts (instanced crossed cards)
  const grassMat = foliageMaterial({ map: grassTexture(), color: 0x6f7c5c, wind: 'grass', translucency: 0.35, alphaTest: 0.4, brush: 0.7 });
  const gGeo = new THREE.PlaneGeometry(1.2, 0.9);
  gGeo.translate(0, 0.45, 0);
  const g2 = gGeo.clone().rotateY(Math.PI / 2);
  const grassGeo = mergeGeos([gGeo, g2]);
  const NG = 2600;
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, NG);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  for (let i = 0; i < NG; i++) {
    const z = 30 - rng() * 190;
    const side = rng() < 0.5 ? -1 : 1;
    const x = roadX(z) + side * (3.3 + Math.pow(rng(), 1.6) * 12);
    p3.set(x, 0, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
    const sc = 0.5 + rng() * 0.8;
    s3.set(sc, sc * (0.8 + rng() * 0.6), sc);
    m4.compose(p3, q, s3);
    grass.setMatrixAt(i, m4);
  }
  grass.receiveShadow = true;
  scene.add(grass);

  // boxes / rocks / a concrete block with moss, a spirit-house-ish pillar
  const concrete = paintedMaterial({ color: 0x8a867a, roughness: 0.9, brush: 0.8, moss: 0.9, dirt: 0.8, wet: 0.7 });
  const rust = paintedMaterial({ color: 0x6a4026, roughness: 0.8, metalness: 0.3, brush: 0.9, dirt: 0.5, wet: 0.6 });
  for (let i = 0; i < 8; i++) {
    const z = 12 - i * 18 - rng() * 6;
    const side = i % 2 ? -1 : 1;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.6 + rng() * 0.8, 0.5 + rng(), 0.6 + rng() * 0.6), i % 3 ? concrete : rust);
    b.position.set(roadX(z) + side * (4 + rng() * 1.5), 0.4, z);
    b.rotation.y = rng();
    b.castShadow = b.receiveShadow = true;
    scene.add(b);
  }
  // km marker
  const km = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.18), paintedMaterial({ color: 0xd8d2c0, brush: 0.6, dirt: 0.9, moss: 0.3, wet: 0.6, dirtHeight: 0.4 }));
  km.position.set(roadX(-14) - 3.6, 0.45, -14);
  km.castShadow = true;
  scene.add(km);
  const kmTop = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.19), paintedMaterial({ color: 0xa83a2a, brush: 0.6, wet: 0.5 }));
  kmTop.position.set(0, 0.5, 0);
  km.add(kmTop);

  // a pale figure by the roadside (skin + ghost pallor test)
  const ghost = new THREE.Group();
  const dress = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.33, 1.15, 14), paintedMaterial({ color: 0xd8d6cc, roughness: 0.85, brush: 0.4, wind: 'cloth', windStrength: 0.6, wet: 0.3 }));
  dress.position.y = 0.85;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.5, 12), dress.material);
  torso.position.y = 1.65;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), skinMaterial({ color: 0xc8a890, pale: 0.85 }));
  head.position.y = 2.0;
  const hair = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.62, 14, 1, true), paintedMaterial({ color: 0x0c0b0a, roughness: 0.55, side: THREE.DoubleSide, wind: 'vine' }));
  hair.position.y = 1.78;
  ghost.add(dress, torso, head, hair);
  ghost.position.set(roadX(-30) - 4.2, 0, -30);
  ghost.traverse((o) => o.isMesh && (o.castShadow = true));
  scene.add(ghost);

  // --- lamps (pooled lights) --------------------------------------------------------------------
  const poleMat = paintedMaterial({ color: 0x9a978c, roughness: 0.9, brush: 0.8, dirt: 0.7, moss: 0.4, wet: 0.6, dirtHeight: 0.9 });
  const lampDefs = [
    { z: -18, side: -1, color: 0xffa04a, flicker: 'sodium', intensity: 420 },
    { z: -52, side: 1, color: 0xd8f0ff, flicker: 'fluorescent', intensity: 300 },
    { z: -90, side: -1, color: 0xffa04a, flicker: 'sodium', intensity: 420 },
    { z: -128, side: 1, color: 0xffa04a, flicker: 'dying', intensity: 380 },
    { z: -165, side: -1, color: 0xffa04a, flicker: 'sodium', intensity: 420 },
  ];
  const lampHandles = [];
  for (const d of lampDefs) {
    const x = roadX(d.z) + d.side * 3.9;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 6.2, 8), poleMat);
    pole.position.set(x, 3.1, d.z);
    pole.castShadow = true;
    scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.08), poleMat);
    arm.position.set(x - d.side * 0.8, 6.05, d.z);
    scene.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.22), paintedMaterial({ color: 0x3a3a38, roughness: 0.6 }));
    head.position.set(x - d.side * 1.55, 5.98, d.z);
    scene.add(head);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.14), new THREE.MeshBasicMaterial({ color: new THREE.Color(d.color).multiplyScalar(6) }));
    bulb.position.set(x - d.side * 1.55, 5.9, d.z);
    scene.add(bulb);
    const h = lightPool.add({
      position: new THREE.Vector3(x - d.side * 1.55, 5.85, d.z), color: d.color, intensity: d.intensity, distance: 22, flicker: d.flicker,
      glow: { size: 0.38 }, pool: true, groundY: 0.02, beam: { length: 6.2, angle: 0.62, intensity: 0.55 },
      onFlicker: (ev) => {
        if (ev.type === 'spark') particles.emit('sparks', { position: ev.position, burst: true, autoDispose: true, count: 30 });
      },
    });
    lampHandles.push(h);
    // moths around every lamp
    particles.emit('moths', { position: new THREE.Vector3(x - d.side * 1.55, 5.5, d.z), color: d.color, count: 10, intensity: 3 });
  }

  // --- headlights ("taxi" just ahead of the camera) --------------------------------------------------
  const carZ = 8;
  const hlPos = new THREE.Vector3(roadX(carZ) - 1.5, 0.68, carZ - 3.35);
  const look = new THREE.Vector3(roadX(carZ - 30) - 1.4, -1.3, carZ - 30);
  const spot = new THREE.SpotLight(0xfff0d8, headlights ? 1100 : 0, 75, 0.72, 1.0, 2);
  spot.position.copy(hlPos);
  spot.target.position.copy(look);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0005;
  spot.shadow.camera.near = 0.5;
  scene.add(spot, spot.target);
  GLOBAL_UNIFORMS.uHeadlightPos.value.copy(hlPos);
  GLOBAL_UNIFORMS.uHeadlightDir.value.copy(look).sub(hlPos).normalize();
  GLOBAL_UNIFORMS.uHeadlightOn.value = headlights ? 1 : 0;
  if (headlights && P('beams', '0') === '1') {
    for (const dx of [-0.62, 0.62]) {
      const beam = createVolumetricBeam({ color: 0xfff0d8, length: 22, angle: 0.36, intensity: 0.35 });
      beam.position.copy(hlPos).add(new THREE.Vector3(dx, 0, 0));
      beam.lookAt(look);
      beam.rotateY(Math.PI);
      scene.add(beam);
    }
  }
  // the taxi's hood seen from the driver's seat (rounded, glossy green, wet)
  const hoodGeo = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  hoodGeo.scale(0.92, 0.1, 1.3);
  const hood = new THREE.Mesh(hoodGeo, paintedMaterial({ color: 0x2f5a2c, roughness: 0.32, metalness: 0.15, brush: 0.35, wet: 0.9, dirt: 0.3, puddles: 0, name: 'hood' }));
  hood.position.set(roadX(carZ) - 1.5, 0.66, carZ - 2.0);
  scene.add(hood);
  hood.visible = P('hood', '0') === '1';

  // --- painted silhouette flats in the fog (stage-set tree lines) ------------------------------------------------
  if (P('flats', '1') !== '0') {
    const tl = treeLineTexture();
    [[-150, 16, 1.6], [-200, 22, 2.4]].forEach(([z, hgt, fs], k) => {
      const geo = new THREE.PlaneGeometry(260, hgt);
      geo.translate(0, hgt / 2 - 0.5, 0);
      const map = tl.clone();
      map.repeat.set(3 + k, 1);
      map.offset.x = k * 0.37;
      map.needsUpdate = true;
      const flat = new THREE.Mesh(geo, silhouetteMaterial({ map, fogScale: fs, sway: 0.15, name: 'treeLine' + k }));
      flat.position.set(roadX(z), 0, z);
      scene.add(flat);
    });
  }

  // --- particles -------------------------------------------------------------------------------------------
  particles.emit('rain', {});
  particles.emit('splash', { groundY: 0.03 });
  particles.emit('dust', { intensity: 1 });
  particles.emit('mist', { groundY: 0.0, intensity: hour >= 28 ? 1.3 : 1.5, count: 60 });
  if (hour >= 25.5 && hour < 28.6) particles.emit('fireflies', { position: new THREE.Vector3(roadX(-40), 0, -40), radius: 18, count: 80 });
  const leavesH = particles.emit('leaves', { position: new THREE.Vector3(roadX(-14), 0, -14), radius: 10 });
  particles.emit('pollen', { intensity: hour >= 28.5 ? 1.5 : 0.6 });
  particles.emit('spores', { intensity: 1 });
  if (P('gust', '0') === '1') leavesH.setIntensity(2.5);
  particles.emit('headlightBugs', { object: hood, offset: new THREE.Vector3(0, -0.4, -1.2) });
  particles.emit('incense', { position: new THREE.Vector3(roadX(-30) - 4.6, 0.6, -29.6) });
  particles.emit('embers', { position: new THREE.Vector3(roadX(-30) - 4.6, 0.6, -29.6), count: 12, radius: 0.1, height: 0.8 });
  lightPool.add({ position: new THREE.Vector3(roadX(-30) - 4.6, 0.75, -29.6), color: 0xff8a3a, intensity: 12, distance: 5, flicker: 'candle', glow: { size: 0.12 } });

  // --- camera ----------------------------------------------------------------------------------------------
  const eye = new THREE.Object3D();
  if (camMode === 'lamp') {
    eye.position.set(roadX(-40) + 1, 1.6, -40);
    eye.lookAt(roadX(-56) + 2, 3.5, -56);
  } else if (camMode === 'side') {
    eye.position.set(roadX(-22) + 2.5, 1.5, -22);
    eye.lookAt(roadX(-32) - 5, 1.5, -31);
  } else if (camMode === 'moon' || camMode === 'sun') {
    const d = (camMode === 'moon' ? sky.moonDir : sky.sunDir).clone();
    eye.position.set(roadX(-10), 1.5, -10);
    const flat = new THREE.Vector3(d.x, 0, d.z).normalize();
    const tgt = eye.position.clone().addScaledVector(flat, 30);
    tgt.y += Math.min(Math.max(d.y, 0.05), 0.9) * 30 * (camMode === 'moon' ? 0.85 : 0.4);
    eye.lookAt(tgt);
  } else if (camMode === 'up') {
    eye.position.set(roadX(-10), 1.4, -10);
    eye.lookAt(roadX(-40), 14, -45);
  } else {
    eye.position.set(roadX(carZ) - 1.5 + 0.36, 1.25, carZ + 0.2);
    eye.lookAt(roadX(carZ - 40) - 1.0, -1.2, carZ - 40);
  }
  eye.rotateY(Math.PI); // Object3D.lookAt aims +Z; the camera looks down -Z
  scene.add(eye);
  cameraRig.attach(eye, eye, { yaw: 0, pitch: 0 });
  sky.setShadowFocus(new THREE.Vector3(roadX(-20), 0, -20));

  // glass-pass test: a rain-streaked pane on LAYERS.GLASS sampling the opaque scene
  if (P('glass', '0') === '1') {
    const gu = postfx.glassUniforms;
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.8),
      new THREE.ShaderMaterial({
        uniforms: { ...gu, uTime: GLOBAL_UNIFORMS.uTime },
        vertexShader: `varying vec2 vUv; varying vec4 vClip; void main(){ vUv = uv; vClip = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = vClip; }`,
        fragmentShader: `uniform sampler2D tSceneColor; uniform sampler2D tSceneBlur; uniform vec2 uResolution; uniform float uTime; varying vec2 vUv; varying vec4 vClip;
          float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
          void main(){
            vec2 suv = gl_FragCoord.xy / uResolution;
            vec2 cell = floor(vUv * vec2(40.0, 20.0)); vec2 f = fract(vUv * vec2(40.0, 20.0)) - 0.5;
            float drop = step(0.82, h(cell)) * smoothstep(0.35, 0.1, length(f));
            vec2 off = f * drop * 0.02;
            float frost = smoothstep(0.2, 0.8, vUv.x);
            vec3 sharp = texture2D(tSceneColor, suv + off).rgb;
            vec3 blur = texture2D(tSceneBlur, suv + off).rgb;
            vec3 c = mix(sharp, blur * 1.05 + 0.002, frost * (1.0 - drop));
            gl_FragColor = vec4(c, 1.0);
          }`,
        depthWrite: false,
      }),
    );
    pane.layers.set(LAYERS.GLASS);
    pane.position.set(0, 0, -1.1);
    engine.camera.add(pane);
  }

  window.__render = { sky, lightPool, particles, postfx, settings, GLOBAL_UNIFORMS, lampHandles };
}

function mergeGeos(geos) {
  let n = 0;
  for (const g of geos) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const idx = [];
  let o = 0;
  for (const g of geos) {
    const p = g.getAttribute('position'), nn = g.getAttribute('normal'), u = g.getAttribute('uv');
    pos.set(p.array, o * 3);
    nrm.set(nn.array, o * 3);
    uv.set(u.array, o * 2);
    for (const i of g.index.array) idx.push(i + o);
    o += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
