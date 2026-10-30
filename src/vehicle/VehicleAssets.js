// Optional professional vehicle models (public/assets/vehicle/taxi.glb, moto.glb).
// `await loadVehicleAssets()` before constructing a Taxi / Motorcycle: when a GLB is present
// the vehicle builds from it (node-name contract in TaxiGLB.js / Motorcycle.js), otherwise
// the procedural model is used. Missing files (404 or the dev server's HTML fallback) and
// broken files fall back silently.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { paintedMaterial } from '../render/index.js';
import { maxAnisotropy } from './VehicleTextures.js';

const ASSETS = { taxi: null, moto: null, loaded: false, errors: [] };
let _loading = null;

async function fetchGLB(url) {
  let res;
  try {
    res = await fetch(url, { cache: 'force-cache' });
  } catch (e) {
    return null;
  }
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  // binary glTF magic 'glTF'
  if (buf.byteLength < 20 || new DataView(buf).getUint32(0, true) !== 0x46546c67) return null;
  const loader = new GLTFLoader();
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  return new Promise((resolve) => {
    loader.parse(buf, base, (gltf) => resolve(gltf), (err) => {
      ASSETS.errors.push(String(err?.message || err));
      console.warn('[vehicle] could not parse', url, err);
      resolve(null);
    });
  });
}

/**
 * Load the optional vehicle GLBs (idempotent). opts.base = folder URL (default
 * 'assets/vehicle/', relative to the page). Resolves to { taxi: gltf|null, moto: gltf|null }.
 */
export function loadVehicleAssets(opts = {}) {
  if (_loading) return _loading;
  const base = opts.base ?? 'assets/vehicle/';
  const abs = (f) => {
    try {
      return new URL(base + f, document.baseURI).href;
    } catch (e) {
      return base + f;
    }
  };
  _loading = Promise.all([fetchGLB(abs('taxi.glb')), fetchGLB(abs('moto.glb'))]).then(([taxi, moto]) => {
    ASSETS.taxi = taxi;
    ASSETS.moto = moto;
    ASSETS.loaded = true;
    return ASSETS;
  });
  return _loading;
}

/** Currently loaded assets ({taxi, moto} gltf objects or null). */
export function getVehicleAssets() {
  return ASSETS;
}

/** Inject assets directly (tests / tools): {taxi?: gltf|{scene}, moto?: gltf|{scene}}. */
export function setVehicleAssets(a = {}) {
  if ('taxi' in a) ASSETS.taxi = a.taxi;
  if ('moto' in a) ASSETS.moto = a.moto;
  ASSETS.loaded = true;
  _loading = Promise.resolve(ASSETS);
}

// ---------------------------------------------------------------------------
// material conversion: GLB PBR materials -> paintedMaterial (fog, wetness, painterly
// grading stay consistent with the rest of the game). Cached per source material.
// ---------------------------------------------------------------------------
const _matCache = new Map();

function tune(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('paint')) return { brush: 0.35, wet: 0.7, dirt: 0.15 };
  if (n.includes('chrome') || n.includes('metal')) return { brush: 0.2, wet: 0.5 };
  if (n.includes('rubber') || n.includes('tyre') || n.includes('tire')) return { brush: 0.2, wet: 0.6 };
  if (n.includes('fabric') || n.includes('seat') || n.includes('carpet') || n.includes('headliner')) return { brush: 0.5 };
  return { brush: 0.3 };
}

/** paintedMaterial equivalent of a glTF material (shared between instances). */
export function convertMaterial(m) {
  if (!m || m.userData?.dlbConverted) return m;
  if (_matCache.has(m.uuid)) return _matCache.get(m.uuid);
  if (!(m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial)) {
    _matCache.set(m.uuid, m);
    return m;
  }
  const an = maxAnisotropy();
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap']) {
    const t = m[k];
    if (t && t.isTexture && t.anisotropy < an) {
      t.anisotropy = an;
      t.needsUpdate = true;
    }
  }
  const p = paintedMaterial({
    ...tune(m.name),
    color: m.color ? m.color.clone() : 0xffffff,
    map: m.map || null,
    normalMap: m.normalMap || null,
    normalScale: m.normalScale ? m.normalScale.clone() : undefined,
    roughness: m.roughness ?? 0.8,
    metalness: m.metalness ?? 0,
    roughnessMap: m.roughnessMap || null,
    emissive: m.emissive ? m.emissive.clone() : 0x000000,
    emissiveMap: m.emissiveMap || null,
    emissiveIntensity: m.emissiveIntensity ?? 1,
    aoMap: m.aoMap || null,
    transparent: !!m.transparent,
    opacity: m.opacity ?? 1,
    alphaTest: m.alphaTest || 0,
    alphaMap: m.alphaMap || null,
    side: m.side ?? THREE.FrontSide,
    vertexColors: !!m.vertexColors,
    name: 'glb_' + (m.name || 'mat'),
  });
  if (m.metalnessMap) p.metalnessMap = m.metalnessMap;
  if (m.depthWrite === false) p.depthWrite = false;
  p.userData.dlbConverted = true;
  p.userData.sourceName = m.name || '';
  _matCache.set(m.uuid, p);
  return p;
}

/** Deep-clone a glTF scene for one vehicle instance (geometry/material shared) and convert its materials. */
export function instantiate(scene) {
  const root = scene.clone(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(convertMaterial) : convertMaterial(o.material);
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return root;
}
