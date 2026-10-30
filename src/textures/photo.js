// Photobashed texture library (public/assets/textures/, built by tools/photobash/).
//
// manifest.json:
//   textures: { key: { file, size:[w,h], srgb, alpha?, wrap?:'clamp', grid?, slots? } }   tex(key) overrides
//   printed:  { 'kind:variant': { file, px:[w,h], size:[m,m], alpha?, shape?, aspect } }    signTex photo kinds
//   decals:   { 'kind:variant[:reduced]': { file, px, size, alpha:true } }                  decalTex()
//
// Images are fetched and decoded with createImageBitmap (decoded in parallel off the main thread,
// already flipped so v = 1 is the image top exactly like the procedural DataTextures and
// CanvasTextures, never premultiplied, no colour-space conversion). Opaque maps are halved on
// 'low' / 'medium' quality during the decode (resizeQuality 'high'); alpha maps never are (the
// colour bled under the alpha must survive). Browsers without ImageBitmap options fall back to
// HTMLImageElement + a canvas halving (flipY at upload). Colour maps are sRGB, *_normal / *_rough
// / *_height are NoColorSpace data maps.
import * as THREE from 'three';

const BASE = 'assets/textures/';
let manifest = null;
let manifestPromise = null;
let enabled = true;
const loaded = new Map(); // manifest section/key -> THREE.Texture
const inflight = new Map(); // url|variant -> Promise<ImageBitmap|HTMLImageElement|HTMLCanvasElement|null>
export const photoStats = { files: 0, bytes: 0, ms: 0, failed: 0, bitmap: 0 };

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

// ImageBitmap with options (Chrome / Edge / Firefox / Safari 17+). Older Safari ignores the options
// (flip / premultiply), so it keeps the HTMLImageElement path.
const BITMAP_OK = (() => {
  if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') return false;
  if (typeof navigator === 'undefined') return true;
  const ua = navigator.userAgent || '';
  if (/^((?!chrome|android).)*safari/i.test(ua)) {
    const m = ua.match(/Version\/(\d+)/);
    return !!m && Number(m[1]) >= 17;
  }
  return true;
})();

/** fetch + decode to an ImageBitmap (flipped, straight alpha, raw colours), resized during decode. */
async function fetchBitmap(url, w, h) {
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) return null;
  const blob = await r.blob();
  const opts = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
  if (w && h) Object.assign(opts, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  return createImageBitmap(blob, opts);
}

function loadImageElement(url) {
  return new Promise((resolve) => {
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
 * Image source for a manifest entry. half = halve an opaque map larger than 512 px (low/medium).
 * Resolves to { src, bitmap } or null.
 */
function loadSource(e, half) {
  const url = BASE + e.file;
  const dims = e.size && e.size[0] > 16 ? e.size : e.px || null; // textures: size = px; printed: px
  const want = half && !e.alpha;
  const key = url + '|' + (want ? 'h' : 'f');
  let p = inflight.get(key);
  if (p) return p;
  p = (async () => {
    if (BITMAP_OK) {
      try {
        let w = 0, h = 0;
        if (want && dims && dims[0] > 512) (w = Math.max(1, dims[0] >> 1)), (h = Math.max(1, dims[1] >> 1));
        let bmp = await fetchBitmap(url, w, h);
        if (bmp && want && !dims && bmp.width > 512) {
          const full = bmp;
          bmp = await createImageBitmap(full, { resizeWidth: full.width >> 1, resizeHeight: full.height >> 1, resizeQuality: 'high', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
          full.close?.();
        }
        if (bmp) {
          photoStats.bitmap++;
          return { src: bmp, bitmap: true };
        }
        return null;
      } catch (err) {
        // decoder / option trouble: retry with an <img> below
      }
    }
    const img = await loadImageElement(url);
    if (!img) return null;
    let src = img;
    if (want && img.naturalWidth > 512 && typeof document !== 'undefined') src = halve(img);
    return { src, bitmap: false };
  })();
  inflight.set(key, p);
  return p;
}

/** Tiny stand-in image (transparent, or paper-toned for opaque prints) for printed matter / decals on their way. */
export function placeholderTexture(alpha = true) {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (c) {
    c.width = c.height = 2;
    if (!alpha) {
      // opaque prints: a blank, aged paper card rather than black
      const g = c.getContext('2d');
      g.fillStyle = '#9a8f78';
      g.fillRect(0, 0, 2, 2);
    }
  }
  const t = new THREE.Texture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.userData = { placeholder: true };
  if (c) t.needsUpdate = true;
  return t;
}

/**
 * Put a new image into a texture that may already live on the GPU at another size: WebGL2 texture
 * storage is immutable, so the old GL texture is released first and the image gets a fresh Source.
 */
export function swapTextureImage(t, image) {
  t.dispose();
  t.source = new THREE.Source(image);
  t.needsUpdate = true;
}

const pending = new Map(); // section:key -> { tex, promise }
/** The texture a running load will fill (printed / decals get a transparent stand-in until then). */
export function photoPendingTexture(section, key) {
  return enabled ? pending.get(section + ':' + key)?.tex || null : null;
}
/** Promise of a running load (resolves to the texture or null), or null. */
export function photoPendingPromise(section, key) {
  return pending.get(section + ':' + key)?.promise || null;
}

/**
 * Create (or fill) the THREE.Texture for a manifest entry. into = an existing texture whose image is
 * replaced when the file arrives (used by signTex/decalTex placeholders). Resolves to the texture or null.
 * Without `into`, the texture object exists from the start of the load (photoPendingTexture), so
 * callers can bind it right away and the image is swapped in place.
 */
export function loadPhoto(section, key, { scale = 1, into = null } = {}) {
  const ck = section + ':' + key;
  if (loaded.has(ck) && !into) return Promise.resolve(loaded.get(ck));
  if (!into && pending.has(ck)) return pending.get(ck).promise;
  const e = manifest && manifest[section] && manifest[section][key];
  if (!e) return Promise.resolve(null);
  const t0 = performance.now();
  const t = into || (section === 'textures' ? new THREE.Texture() : placeholderTexture(!!e.alpha));
  const promise = loadSource(e, scale < 1 && typeof document !== 'undefined').then((res) => {
    pending.delete(ck);
    if (!res) {
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
    swapTextureImage(t, res.src);
    const srgb = section !== 'textures' ? true : e.srgb !== false;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    const wrap = section === 'textures' && e.wrap !== 'clamp' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.wrapS = t.wrapT = wrap;
    if (section === 'decals' && key.startsWith('blood_drip')) t.wrapS = THREE.RepeatWrapping; // drips tile along u
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = Math.max(8, t.anisotropy || 0);
    // ImageBitmaps are flipped and kept straight-alpha by createImageBitmap (WebGL ignores the
    // unpack flags for them); <img> / canvas sources are flipped at upload
    t.flipY = !res.bitmap;
    t.premultiplyAlpha = false;
    t.name = (section === 'textures' ? '' : section + ':') + key;
    t.userData = { ...(t.userData || {}), key, photo: true, alpha: !!e.alpha, placeholder: false };
    loaded.set(ck, t);
    return t;
  });
  if (!into) pending.set(ck, { tex: t, promise });
  return promise;
}
const warned = new Set();

/**
 * Load many entries with limited concurrency. list = [[section, key], ...]. onEach(done, total, key).
 * The decodes run in the browser's image decoder threads, so a wide window keeps every core busy.
 */
export async function loadPhotos(list, { scale = 1, concurrency = BITMAP_OK ? 16 : 6, onEach = null } = {}) {
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
