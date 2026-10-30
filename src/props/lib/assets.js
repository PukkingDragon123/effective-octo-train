// Optional real-world prop models (CC0, Poly Haven; reused from the owner's game "เฮียผัด!",
// see docs/credits/props.md). They live in public/assets/props/<id>.glb (meshopt geometry +
// WebP textures) and are loaded ONCE, asynchronously, by loadPropAssets() at boot (before
// world.build()). After that every factory stays synchronous: addAsset(kit, id, o) merges the
// model into the prop's Kit (so it gets the same baked weathering / vertex colours and one
// draw call per asset material) and returns true, or returns false when the asset isn't
// loaded so the caller falls back to its procedural model.
//
// Painterly treatment: the photo-scanned albedo is re-graded on a canvas (less saturation,
// a touch of contrast, optional greyscale for tintable plastics) and every model uses
// paintedMaterial (brush modulation, wetness, fog, dirt) with its normal/ORM maps.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { paintedMaterial } from '../../render/index.js';

/**
 * Model list: id -> { tint (greyscale the albedo so the vertex colour sets the hue), grade
 *   (canvas filter for the albedo), brush, shadows, alpha }.
 */
export const PROP_ASSETS = {
  plastic_monobloc_chair_01: { tint: true, brush: 0.45 },
  old_tyre: {},
  wooden_crate_01: {},
  plastic_crate_02: { tint: true, alpha: true },
  Barrel_01: {},
  barrel_03: {},
  power_box_01: {},
  utility_box_01: {},
  small_lpg_tank: {},
  propane_tank: {},
  cardboard_box_01: {},
  trashbag: {},
  folding_wooden_stool: {},
  metal_stool_02: {},
  can_rusted: { shadows: false },
  wicker_basket_01: {},
  wicker_basket_02: {},
  worn_metal_rack: {},
  steel_frame_shelves_02: {},
  plastic_jerrycan: { tint: true },
  cement_bag: {},
  plastic_broom: { alpha: true },
  jug_01: { shadows: false },
  hand_truck: {},
  multi_cleaner_5_litre: { shadows: false },
  cleaner_tin_01: { shadows: false },
  ceramic_pot: {},
  dustpan: { shadows: false },
  // fetched directly from polyhaven.com (CC0), textures 512 px JPEG, packed to GLB
  Television_01: {},
  bench_vice_01: {},
  brass_pot_01: {},
  ceramic_vase_01: { shadows: false },
  ceramic_vase_03: { shadows: false },
  chinese_stool: {},
  chinese_tea_table: {},
  combination_wrench: { shadows: false },
  cross_pein_hammer: { shadows: false },
  crowbar_01: { shadows: false },
  flathead_screwdriver: { shadows: false },
  handsaw_wood: { shadows: false },
  metal_tool_chest: {},
  oil_tin: { shadows: false },
};

const ready = new Map(); // id -> { parts:[{geo, mat}], size: Vector3 }
const failed = new Set();
let loading = null;

const DEFAULT_GRADE = 'saturate(0.78) contrast(1.06) brightness(0.96)';

function regradeMap(t, def) {
  const img = t && t.image;
  if (!img || !img.width || typeof document === 'undefined') return t;
  try {
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const g = cv.getContext('2d', { willReadFrequently: !!def.tint });
    g.filter = def.grade || DEFAULT_GRADE;
    g.drawImage(img, 0, 0);
    g.filter = 'none';
    if (def.tint) {
      // greyscale, normalised to ~0.85 mean so a vertex colour reads as the plastic's colour
      const d = g.getImageData(0, 0, cv.width, cv.height);
      const p = d.data;
      let sum = 0, n = 0;
      for (let i = 0; i < p.length; i += 16) {
        sum += Math.max(p[i], p[i + 1], p[i + 2]);
        n++;
      }
      const k = (0.85 * 255) / Math.max(1, sum / n);
      for (let i = 0; i < p.length; i += 4) {
        const l = Math.min(255, Math.max(p[i], p[i + 1], p[i + 2]) * k);
        p[i] = p[i + 1] = p[i + 2] = l;
      }
      g.putImageData(d, 0, 0);
    }
    const o = new THREE.CanvasTexture(cv);
    o.flipY = t.flipY;
    o.colorSpace = THREE.SRGBColorSpace;
    o.wrapS = t.wrapS;
    o.wrapT = t.wrapT;
    o.anisotropy = 8;
    return o;
  } catch (e) {
    return t;
  }
}

/** Float copy (position/normal/uv/index) with the node transform baked in (meshopt quantisation). */
function floatGeometry(src, matrix) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const n = a.itemSize, out = new Float32Array(a.count * n);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) out[i * n + c] = a.getComponent(i, c);
    g.setAttribute(name, new THREE.BufferAttribute(out, n));
  }
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (src.index) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index.array), 1));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  g.applyMatrix4(matrix);
  return g;
}

function prepare(id, gltf) {
  const def = PROP_ASSETS[id] || {};
  const parts = [];
  const matCache = new Map();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    let mat = matCache.get(src);
    if (!mat) {
      const blend = def.alpha || src.transparent || src.alphaTest > 0;
      mat = paintedMaterial({
        color: 0xffffff,
        vertexColors: true,
        map: regradeMap(src.map, def),
        normalMap: src.normalMap || null,
        normalScale: 0.9,
        roughnessMap: src.roughnessMap || null,
        roughness: Math.max(0.35, src.roughness ?? 1),
        metalness: src.metalness ?? 0,
        alphaTest: blend ? 0.45 : 0,
        side: blend || src.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide,
        brush: def.brush ?? 0.55,
        wet: 0.5,
        dirt: 0.35,
        name: 'props_asset_' + id + (matCache.size ? '_' + matCache.size : ''),
      });
      if (src.metalnessMap) {
        mat.metalnessMap = src.metalnessMap;
        mat.needsUpdate = true;
      }
      for (const t of [mat.normalMap, mat.roughnessMap]) if (t) t.anisotropy = 8;
      mat.userData.uvMode = 'keep';
      mat.userData.shadows = def.shadows ?? true;
      mat.userData.asset = id;
      matCache.set(src, mat);
    }
    parts.push({ geo: floatGeometry(o.geometry, o.matrixWorld), mat });
  });
  if (!parts.length) throw new Error('no meshes');
  // normalise: origin at the bottom centre, front = +Z (Poly Haven models already face +Z)
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geo.computeBoundingBox();
    box.union(p.geo.boundingBox);
  }
  const c = box.getCenter(new THREE.Vector3());
  for (const p of parts) {
    p.geo.translate(-c.x, -box.min.y, -c.z);
    p.geo.computeBoundingSphere();
  }
  const size = box.getSize(new THREE.Vector3());
  ready.set(id, { parts, size, shelves: findShelves(parts, size) });
}

/**
 * Heights of large up-facing surfaces (shelf boards, table tops): area of up-facing triangles
 * binned by height; bins covering >= 30% of the footprint count as a shelf.
 */
function findShelves(parts, size) {
  const bin = 0.02, bins = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const { geo } of parts) {
    const pos = geo.attributes.position, idx = geo.index;
    const tri = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < tri; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0);
      b.fromBufferAttribute(pos, i1);
      c.fromBufferAttribute(pos, i2);
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
      const area2 = n.length();
      if (area2 < 1e-9 || n.y / area2 < 0.95) continue;
      const y = (a.y + b.y + c.y) / 3;
      const key = Math.round(y / bin);
      bins.set(key, (bins.get(key) || 0) + area2 / 2);
    }
  }
  const foot = size.x * size.z;
  const keys = [...bins.keys()].filter((key) => key * bin > 0.05 && bins.get(key) >= foot * 0.3).sort((x, y) => x - y);
  const out = [];
  for (const key of keys) {
    const y = key * bin;
    if (out.length && y - out[out.length - 1] < 0.08) out[out.length - 1] = y;
    else out.push(y);
  }
  return out;
}

/** Shelf heights (m, unscaled model space) of a loaded model, [] if none / not loaded. */
export function assetShelves(id) {
  return ready.get(id)?.shelves || [];
}

/**
 * Load the CC0 prop models (once; later calls return the same promise). Call at boot before
 * world.build(); factories built before it resolves use their procedural fallbacks.
 * opts {ids = all, base = 'assets/props/', onProgress(fraction)} -> Promise<{loaded, failed}>
 */
export function loadPropAssets(opts = {}) {
  if (loading) return loading;
  if (typeof document === 'undefined') return Promise.resolve({ loaded: [], failed: [] });
  const ids = opts.ids || Object.keys(PROP_ASSETS);
  const base = opts.base ?? 'assets/props/';
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  let done = 0;
  loading = Promise.all(
    ids.map((id) =>
      loader
        .loadAsync(new URL(base + id + '.glb', document.baseURI).href)
        .then((gltf) => prepare(id, gltf))
        .catch((err) => {
          failed.add(id);
          console.warn('[props] asset failed', id, err?.message || err);
        })
        .finally(() => opts.onProgress?.(++done / ids.length)),
    ),
  ).then(() => propAssetsStatus());
  return loading;
}

/** { loaded: id[], failed: id[], pending: bool } */
export function propAssetsStatus() {
  return { loaded: [...ready.keys()], failed: [...failed], pending: !!loading && ready.size + failed.size < Object.keys(PROP_ASSETS).length };
}

/** True when the model is loaded and usable. */
export function hasAsset(id) {
  return ready.has(id);
}

/** Size (Vector3, metres) of a loaded model, or null. */
export function assetSize(id) {
  return ready.get(id)?.size || null;
}

/**
 * Merge a loaded model into a Kit. o: Kit.add options (p, r, s, color, w, colorFn, detail) plus
 * fit:{h|w|d} (scale uniformly to that height/width/depth in metres). Returns false (and adds
 * nothing) when the model isn't loaded, so callers can fall back to their procedural version.
 */
export function addAsset(k, id, o = {}) {
  const a = ready.get(id);
  if (!a) return false;
  let s = o.s ?? 1;
  if (o.fit) {
    const f = o.fit.h ? o.fit.h / a.size.y : o.fit.w ? o.fit.w / a.size.x : o.fit.d ? o.fit.d / a.size.z : 1;
    s = typeof s === 'number' ? s * f : s.map((v) => v * f);
  }
  const opts = { ...o, s, uv: 'keep' };
  delete opts.fit;
  if (opts.color == null) opts.color = 0xffffff;
  for (const p of a.parts) k.add(p.mat, p.geo, opts);
  return true;
}
