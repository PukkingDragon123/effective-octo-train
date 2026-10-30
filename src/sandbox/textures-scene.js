// In-context check of the texture library: a short stretch of night road under headlights
// (asphalt + worn markings + gravel shoulders, grass / banana / fern cards, bark & banyan
// trunks, a mossy concrete pole, KM post and warning signs). Uses the game's render stack.
//   ?hour=22  ?view=road|signs|forest  ?post=0 (plain render)
import * as THREE from 'three';
import { tex, signTex, FOLIAGE_ATLAS, ROAD_MARKINGS } from '../textures/index.js';
import * as R from '../render/index.js';

function mat(o) {
  try {
    return R.paintedMaterial(o);
  } catch (e) {
    return new THREE.MeshStandardMaterial(o);
  }
}
function fmat(o) {
  try {
    return R.foliageMaterial(o);
  } catch (e) {
    return new THREE.MeshStandardMaterial({ ...o, side: THREE.DoubleSide, alphaTest: 0.5 });
  }
}

/** Plane whose uvs cover an atlas cell. */
function cellPlane(w, h, uv) {
  const g = new THREE.PlaneGeometry(w, h);
  const a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
  g.translate(0, h / 2, 0);
  return g;
}

export default async function ({ engine, cameraRig, params, rendering }) {
  const scene = engine.scene;
  const post = params.get('post') !== '0';
  const hour = Number(params.get('hour') || 22);
  const view = params.get('view') || 'road';
  try {
    rendering?.sky?.setHour?.(hour);
    rendering?.sky?.setWeather?.({ rain: 0, fog: 0.4 }, 0);
  } catch (e) {
    /* render stub */
  }
  if (!post) {
    scene.fog = new THREE.FogExp2(0x0b1016, 0.03);
    scene.background = new THREE.Color(0x0b1016);
    engine.renderPipeline = (r, s, c) => {
      r.setRenderTarget(null);
      r.render(s, c);
    };
    scene.add(new THREE.HemisphereLight(0x3a4a66, 0x0a0806, 0.5));
  }
  const L = 60, RW = 6.2;
  const root = new THREE.Group();
  scene.add(root);

  // --- road
  const roadGeo = new THREE.PlaneGeometry(RW, L).rotateX(-Math.PI / 2);
  roadGeo.translate(0, 0, -L / 2 + 4);
  const uvR = roadGeo.attributes.uv;
  for (let i = 0; i < uvR.count; i++) uvR.setXY(i, uvR.getX(i), uvR.getY(i) * (L / RW));
  const road = new THREE.Mesh(roadGeo, mat({ map: tex('asphalt'), normalMap: tex('asphalt_normal'), roughnessMap: tex('asphalt_rough'), roughness: 1 }));
  road.receiveShadow = true;
  root.add(road);
  // markings: ribbons mapped to strips of road_lines
  const strips = ROAD_MARKINGS.road_lines.strips;
  const ribbon = (name, x) => {
    const s = strips[name];
    const g = new THREE.PlaneGeometry(0.5, L).rotateX(-Math.PI / 2);
    g.translate(x, 0.006, -L / 2 + 4);
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, s.uv[0] + a.getX(i) * (s.uv[2] - s.uv[0]), a.getY(i) * (L / ROAD_MARKINGS.road_lines.tileLength));
    const m = mat({ map: tex('road_lines'), transparent: true, depthWrite: false, roughness: 0.7 });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    root.add(new THREE.Mesh(g, m));
  };
  ribbon('centre_dashed_white', 0);
  ribbon('edge_white', -RW / 2 + 0.2);
  ribbon('edge_white', RW / 2 - 0.2);
  // shoulders
  for (const side of [-1, 1]) {
    const g = new THREE.PlaneGeometry(1.6, L).rotateX(-Math.PI / 2);
    g.translate(side * (RW / 2 + 0.8), -0.02, -L / 2 + 4);
    const a = g.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i), a.getY(i) * (L / 1.6));
    root.add(new THREE.Mesh(g, mat({ map: tex('gravel'), normalMap: tex('gravel_normal'), roughness: 0.95 })));
    const g2 = new THREE.PlaneGeometry(14, L).rotateX(-Math.PI / 2);
    g2.translate(side * (RW / 2 + 1.6 + 7), -0.03, -L / 2 + 4);
    const a2 = g2.attributes.uv;
    for (let i = 0; i < a2.count; i++) a2.setXY(i, a2.getX(i) * 4, a2.getY(i) * (L / 3.5));
    root.add(new THREE.Mesh(g2, mat({ map: tex('leaf_litter'), normalMap: tex('leaf_litter_normal'), roughness: 0.9 })));
  }

  // --- vegetation cards
  const rng = (() => {
    let a = 7;
    return () => ((a = (a * 16807) % 2147483647) / 2147483647);
  })();
  const grassCell = FOLIAGE_ATLAS.grass_card.cells[0];
  const grassMat = fmat({ map: tex('grass_card') });
  for (let i = 0; i < 70; i++) {
    const side = i % 2 ? 1 : -1;
    const z = 4 - rng() * L;
    const x = side * (RW / 2 + 1.0 + rng() * 2.2);
    const w = 1.6 + rng() * 1.4, h = 0.7 + rng() * 0.6;
    const u0 = rng() * 0.6;
    const m = new THREE.Mesh(cellPlane(w, h, [u0, grassCell.uv[1], u0 + 0.4, grassCell.uv[3]]), grassMat);
    m.position.set(x, -0.03, z);
    m.rotation.y = rng() * Math.PI;
    root.add(m);
  }
  const ban = FOLIAGE_ATLAS.leaf_banana.cells;
  const banMat = fmat({ map: tex('leaf_banana'), normalMap: tex('leaf_banana_normal') });
  for (let p = 0; p < 4; p++) {
    const px = (p % 2 ? 1 : -1) * (RW / 2 + 2.6 + rng() * 1.5), pz = -6 - p * 9 - rng() * 4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.2, 10), mat({ color: 0x5a6a38, roughness: 0.8 }));
    trunk.position.set(px, 1.1, pz);
    root.add(trunk);
    for (let l = 0; l < 7; l++) {
      const c = ban[rng() < 0.4 ? 1 : 0];
      const leaf = new THREE.Mesh(cellPlane(0.9, 2.2, c.uv), banMat);
      leaf.position.set(px, 2.0, pz);
      leaf.rotation.set(0, (l / 7) * Math.PI * 2 + rng() * 0.4, 0);
      leaf.rotateX(-0.9 - rng() * 0.6);
      root.add(leaf);
    }
  }
  const fernMat = fmat({ map: tex('leaf_fern') });
  for (let i = 0; i < 18; i++) {
    const c = FOLIAGE_ATLAS.leaf_fern.cells[i % 2];
    const side = i % 2 ? 1 : -1;
    const g = new THREE.Group();
    g.position.set(side * (RW / 2 + 1.4 + rng() * 2.5), 0, 4 - rng() * L);
    for (let f = 0; f < 6; f++) {
      const m = new THREE.Mesh(cellPlane(0.45, 0.9, c.uv), fernMat);
      m.rotation.y = (f / 6) * Math.PI * 2;
      m.rotateX(-0.7);
      g.add(m);
    }
    root.add(g);
  }

  // --- trunks
  const barkMat = mat({ map: tex('bark', { repeat: [2, 3] }), normalMap: tex('bark_normal', { repeat: [2, 3] }), roughness: 0.95 });
  const banyanMat = mat({ map: tex('bark_banyan', { repeat: [3, 3] }), normalMap: tex('bark_banyan_normal', { repeat: [3, 3] }), roughness: 0.9 });
  [[-6.5, -14, 0.55, barkMat], [6.8, -22, 0.8, banyanMat], [-7.5, -30, 0.45, barkMat], [7.2, -8, 0.4, barkMat]].forEach(([x, z, r, m]) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 1.1, 12, 20, 1, true), m);
    t.position.set(x, 6, z);
    root.add(t);
  });

  // --- props: concrete pole, KM post, signs
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 8, 0.22), mat({ map: tex('concrete_moss', { repeat: [0.4, 6] }), normalMap: tex('concrete_moss_normal', { repeat: [0.4, 6] }), roughness: 0.9 }));
  pole.position.set(-RW / 2 - 1.2, 4, -10);
  root.add(pole);
  const km = signTex('km_marker', { km: 9 });
  const kmPost = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.75, 0.16), [
    mat({ map: tex('concrete'), roughness: 0.9 }), mat({ map: tex('concrete'), roughness: 0.9 }), mat({ map: tex('concrete'), roughness: 0.9 }),
    mat({ map: tex('concrete'), roughness: 0.9 }), mat({ map: km, roughness: 0.8 }), mat({ map: tex('concrete'), roughness: 0.9 }),
  ]);
  kmPost.position.set(-RW / 2 - 0.5, 0.36, -5);
  kmPost.rotation.y = 0.5;
  root.add(kmPost);
  const signPost = (kind, o, x, z, ht, rotY) => {
    const t = signTex(kind, o);
    const [sw, sh] = t.userData.size;
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, ht, 8), mat({ map: tex('metal_painted', { repeat: [0.3, 3] }), metalness: 0.4, roughness: 0.6 }));
    p.position.y = ht / 2;
    g.add(p);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat({ map: t, alphaTest: t.userData.alpha ? 0.5 : 0, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.2 }));
    face.position.set(0, ht - sh / 2, 0.04);
    g.add(face);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    root.add(g);
  };
  signPost('curve_warning', { dir: 'right' }, -RW / 2 - 0.9, -18, 2.2, 0.25);
  signPost('elephant_crossing', {}, RW / 2 + 0.9, -26, 2.6, -0.25);
  signPost('speed_sign', { kmh: 40 }, -RW / 2 - 0.9, -34, 2.2, 0.2);

  // --- lighting: headlights + moon
  const head = new THREE.SpotLight(0xfff0d8, 60, 45, 0.5, 0.6, 1.4);
  head.position.set(-1.55, 0.8, 4.5);
  head.target.position.set(-1.0, 0, -20);
  head.castShadow = true;
  scene.add(head, head.target);
  const moon = new THREE.DirectionalLight(0x8090c0, post ? 0.3 : 0.25);
  moon.position.set(10, 20, -5);
  scene.add(moon);
  try {
    R.GLOBAL_UNIFORMS.uHeadlightOn.value = 1;
    R.GLOBAL_UNIFORMS.uHeadlightPos.value.copy(head.position);
    R.GLOBAL_UNIFORMS.uHeadlightDir.value.set(0.02, -0.04, -1).normalize();
  } catch (e) {
    /* stub */
  }

  const eye = new THREE.Object3D();
  if (view === 'signs') eye.position.set(-1.2, 1.25, -11);
  else if (view === 'forest') eye.position.set(3.5, 1.4, -6);
  else eye.position.set(-1.55, 1.25, 4);
  scene.add(eye);
  cameraRig.attach(eye, null, { yaw: view === 'forest' ? 1.1 : view === 'signs' ? 0.15 : 0, pitch: view === 'road' ? -0.06 : 0 });
}
