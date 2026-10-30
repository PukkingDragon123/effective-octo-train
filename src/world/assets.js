// Optional scanned forest-floor models (CC0, Poly Haven; packed by the orchestrator into
// public/assets/props/polyhaven/, credits in docs/credits/polyhaven.md). They are loaded once,
// converted to plain float geometry with the origin at the bottom centre, and re-materialed with
// the painterly material (keeping their colour / normal / roughness maps). If loading fails the
// world simply uses its procedural rocks and roots.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { paintedMaterial } from '../render/index.js';

const SETS = {
  rocks: ['rock_moss_set_01', 'rock_moss_set_02'],
  stumps: ['tree_stump_01', 'tree_stump_02'],
  roots: ['root_cluster_01'],
};

/** { loaded, rocks: [{id, geo, mat, radius, height, tris}], stumps: [...], roots: [...] } */
export const WORLD_ASSETS = { loaded: false, failed: false, rocks: [], stumps: [], roots: [] };
let _loading = null;

/**
 * Load the scanned forest-floor models (call before world.build(); World.build calls it too and
 * never fails because of it). onProgress(done, total).
 */
export function loadWorldAssets(onProgress = null) {
  if (_loading) return _loading;
  _loading = (async () => {
    const loader = new GLTFLoader();
    const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './';
    const jobs = [];
    for (const [kind, ids] of Object.entries(SETS)) for (const id of ids) jobs.push([kind, id]);
    let done = 0;
    await Promise.all(
      jobs.map(async ([kind, id]) => {
        try {
          const gltf = await loader.loadAsync(`${base}assets/props/polyhaven/${id}.glb`);
          WORLD_ASSETS[kind].push(...extract(gltf, id, kind));
        } catch (e) {
          console.warn('[world] optional asset', id, 'not loaded:', e?.message || e);
        }
        onProgress?.(++done, jobs.length);
      }),
    );
    // deterministic order regardless of network timing
    for (const k of Object.keys(SETS)) WORLD_ASSETS[k].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    WORLD_ASSETS.loaded = true;
    WORLD_ASSETS.failed = !WORLD_ASSETS.rocks.length && !WORLD_ASSETS.stumps.length;
    return WORLD_ASSETS;
  })();
  return _loading;
}

const _mats = new Map();
function painted(src, id, kind) {
  if (_mats.has(id)) return _mats.get(id);
  const m = paintedMaterial({
    name: 'ph_' + id,
    color: kind === 'stumps' ? 0xc8beb0 : 0xbfbab0,
    map: src.map || null,
    normalMap: src.normalMap || null,
    roughnessMap: src.roughnessMap || null,
    roughness: 1,
    metalness: 0,
    brush: 0.5,
    moss: kind === 'rocks' ? 0.45 : 0.3,
    wet: 0.6,
  });
  if (m.normalScale && src.normalScale) m.normalScale.copy(src.normalScale);
  _mats.set(id, m);
  return m;
}

function toFloat(geo) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = geo.attributes[name];
    if (!a) continue;
    const n = a.count, sz = a.itemSize;
    const arr = new Float32Array(n * sz);
    for (let i = 0; i < n; i++) for (let k = 0; k < sz; k++) arr[i * sz + k] = a.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(arr, sz));
  }
  if (geo.index) g.setIndex(new THREE.BufferAttribute(geo.index.array.slice(), 1));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

function extract(gltf, id, kind) {
  const out = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const g = toFloat(o.geometry);
    g.applyMatrix4(o.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    g.computeBoundingBox();
    const b = g.boundingBox;
    g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    const size = g.boundingBox.getSize(new THREE.Vector3());
    if (size.y < 0.02 && Math.max(size.x, size.z) < 0.05) return;
    out.push({ id: id + ':' + out.length, geo: g, mat: painted(o.material, id, kind), radius: Math.max(size.x, size.z) / 2, height: size.y, tris: (g.index ? g.index.count : g.attributes.position.count) / 3 });
  });
  // rock sets: keep the 3 most useful (largest) rocks per set
  if (kind === 'rocks') out.sort((a, b) => b.radius - a.radius).splice(3);
  return out;
}
