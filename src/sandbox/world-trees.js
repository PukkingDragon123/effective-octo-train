// Tree lineup sandbox: every species/variant of the world TreeFactory on a flat ground.
// Params: species (comma list, default all big ones), hour (default 29.6), lod (0|1|imp), dist, h, look, paint, fogd, single
import * as THREE from 'three';
import { sky, postfx, paintedMaterial } from '../render/index.js';
import { Forest } from '../world/Forest.js';
import { SPECIES } from '../world/TreeFactory.js';

export default async function (ctx) {
  const { engine, cameraRig, params } = ctx;
  const num = (k, d) => (params.get(k) != null ? Number(params.get(k)) : d);
  const hour = num('hour', 29.6);
  if (params.get('fogd') != null) sky.overrides.fogDensity = num('fogd', 0.004);
  else sky.overrides.fogDensity = 0.004;
  sky.setHour(hour);
  if (params.get('paint') != null) postfx.params.painterly = num('paint', 1);
  const names = (params.get('species') || 'rainTree,dipterocarp,banyan,understory,deadTree,palm,bamboo').split(',');
  const fake = { road: null, drawDistance: 150, terrain: null, landmarks: {}, plan: { clearings: [] } };
  const forest = new Forest(fake, {});
  forest._materials();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), paintedMaterial({ color: 0x3a3226, roughness: 0.95 }));
  engine.scene.add(ground);
  const lod = params.get('lod') || '0';
  let x = 0;
  const gap = num('gap', 1);
  const row = new THREE.Group();
  engine.scene.add(row);
  const items = [];
  for (const name of names) {
    const sp = SPECIES[name];
    if (!sp) continue;
    const nv = params.get('single') ? 1 : sp.variants;
    for (let v = 0; v < nv; v++) {
      const seed = 1000 + v * 97 + name.length * 13 + name.charCodeAt(0) * 7;
      const g = forest.makeSingle(name, v, seed);
      const built = g.userData.built;
      if (lod === '1' && built.lods[1]) {
        g.clear();
        for (const [part, geo] of Object.entries(built.lods[1])) if (geo) g.add(new THREE.Mesh(geo, part === 'leaves' ? forest._leafMatFor(name) : forest.mats[part] || forest.mats.bark));
      }
      const r = Math.max(1.2, built.radius) * gap;
      x += r;
      g.position.set(x, 0, 0);
      row.add(g);
      items.push({ name, v, x, h: built.height, tris: countTris(g) });
      x += r;
    }
  }
  row.position.x = -x / 2;
  const maxH = Math.max(...items.map((i) => i.h));
  const eye = new THREE.Object3D();
  eye.position.set(num('cx', 0), num('h', maxH * 0.45), num('dist', Math.max(x * 0.62, 20)));
  engine.scene.add(eye);
  cameraRig.attach(eye, null, { yaw: THREE.MathUtils.degToRad(num('look', 0)), pitch: THREE.MathUtils.degToRad(num('pitch', 0)) });
  console.log('[trees]', JSON.stringify(items.map((i) => `${i.name}${i.v}:${i.tris}`)));
  window.__treeInfo = items;
}

function countTris(g) {
  let t = 0;
  g.traverse((o) => {
    if (o.geometry) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  return Math.round(t);
}
