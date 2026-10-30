// Photobashed texture library (public/assets/textures/, built by tools/photobash/).
//
// manifest.json:
//   textures: { key: { file, size:[w,h], srgb, alpha?, wrap?:'clamp', grid?, slots? } }   tex(key) overrides
//   printed:  { 'kind:variant': { file, px:[w,h], size:[m,m], alpha?, shape?, aspect } }    signTex photo kinds
//   decals:   { 'kind:variant[:reduced]': { file, px, size, alpha:true } }                  decalTex()
//
// Images load as HTMLImageElement textures (flipY = true, so v = 1 is the image top exactly like the
// procedural DataTextures and CanvasTextures). Colour maps are sRGB, *_normal / *_rough / *_height are
// NoColorSpace data maps. Opaque maps are halved on 'low' / 'medium' quality (alpha maps never are:
// a 2D canvas would premultiply and lose the colour bled under the alpha).
import * as THREE from 'three';

const BASE = 'assets/textures/';
let manifest = null;
let manifestPromise = null;
let enabled = true;
const loaded = new Map(); // manifest section/key -> THREE.Texture
const inflight = new Map(); // url -> Promise<HTMLImageElement|null>
export const photoStats = { files: 0, bytes: 0, ms: 0, failed: 0 };

const EMPTY = { textures: {}, printed: {}, decals: {} };

/** Disable/enable the photobashed overrides (procedural only when false). */
export function setPhotoTexturesEnabled(on) {
  enabled = !!on;
}
export function photoTexturesEnabled() {
  return enabled;
}

/** Fetch manifest.json once (resolves to an empty manifest when missing / offline). */
export function loadPhotoManifest() {
  if (manifestPromise) return manifestPromise;
  manifestPromise = (typeof fetch === 'undefined'
    ? Promise.resolve(EMPTY)
    : fetch(BASE + 'manifest.json', { cache: 'force-cache' })
        .then((r) => (r.ok ? r.json() : EMPTY))
        .catch(() => EMPTY)
  ).then((m) => {
    manifest = { ...EMPTY, ...(m || {}) };
    for (const s of ['textures', 'printed', 'decals']) manifest[s] = manifest[s] || {};
    return manifest;
  });
  return manifestPromise;
}

/** The loaded manifest (null until loadPhotoManifest() resolved). */
export function photoManifest() {
  return manifest;
}

/** Manifest entry of a section ('textures' | 'printed' | 'decals') or null. */
export function photoEntry(section, key) {
  return (enabled && manifest && manifest[section] && manifest[section][key]) || null;
}

/** Loaded photo texture (or null). */
export function photoLoaded(section, key) {
  return enabled ? loaded.get(section + ':' + key) || null : null;
}

function loadImage(url) {
  let p = inflight.get(url);
  if (p) return p;
  p = new Promise((resolve) => {
    if (typeof Image === 'undefined') return resolve(null);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const done = () => resolve(img);
      if (img.decode) img.decode().then(done, done);
      else done();
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  inflight.set(url, p);
  return p;
}

function halve(img) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, img.naturalWidth >> 1);
  c.height = Math.max(1, img.naturalHeight >> 1);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/**
 * Create (or fill) the THREE.Texture for a manifest entry. into = an existing texture whose image is
 * replaced when the file arrives (used by signTex/decalTex placeholders). Resolves to the texture or null.
 */
export function loadPhoto(section, key, { scale = 1, into = null } = {}) {
  const ck = section + ':' + key;
  if (loaded.has(ck) && !into) return Promise.resolve(loaded.get(ck));
  const e = manifest && manifest[section] && manifest[section][key];
  if (!e) return Promise.resolve(null);
  const t0 = performance.now();
  return loadImage(BASE + e.file).then((img) => {
    if (!img) {
      photoStats.failed++;
      if (!warned.has(e.file)) {
        warned.add(e.file);
        console.warn('[textures] photo texture missing, using procedural:', e.file);
      }
      return null;
    }
    photoStats.files++;
    photoStats.bytes += e.bytes || 0;
    photoStats.ms += performance.now() - t0;
    let src = img;
    if (scale < 1 && !e.alpha && img.naturalWidth > 512 && typeof document !== 'undefined') src = halve(img);
    const t = into || new THREE.Texture();
    t.image = src;
    const srgb = section !== 'textures' ? true : e.srgb !== false;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    const wrap = section === 'textures' && e.wrap !== 'clamp' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.wrapS = t.wrapT = wrap;
    if (section === 'decals' && key.startsWith('blood_drip')) t.wrapS = THREE.RepeatWrapping; // drips tile along u
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.flipY = true;
    t.name = (section === 'textures' ? '' : section + ':') + key;
    t.userData = { ...(t.userData || {}), key, photo: true, alpha: !!e.alpha };
    t.needsUpdate = true;
    loaded.set(ck, t);
    return t;
  });
}
const warned = new Set();

/**
 * Load many entries with limited concurrency. list = [[section, key], ...]. onEach(done, total, key).
 */
export async function loadPhotos(list, { scale = 1, concurrency = 6, onEach = null } = {}) {
  let i = 0;
  let done = 0;
  const next = async () => {
    while (i < list.length) {
      const [section, key] = list[i++];
      await loadPhoto(section, key, { scale });
      done++;
      if (onEach) onEach(done, list.length, key);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, next));
}
