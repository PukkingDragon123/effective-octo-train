// Procedural hand-painted texture library (contract: docs/ARCHITECTURE.md "textures").
//
//   tex(key, {repeat, size})   cached DataTexture (lazy: generated on first use)
//   signTex(kind, opts)        Thai signage / decals / printed matter (CanvasTexture)
//   canvasTexture(w,h,draw,opts), fontsReady(), FONTS
//   FOLIAGE_ATLAS, ROAD_MARKINGS   uv layouts of the atlas textures
//   preloadTextures(keys, onProgress)   async warm-up (yields between keys)
//   setTextureQuality('low'|'medium'|'high'|'ultra'), TEXTURE_KEYS, SIGN_KINDS, textureStats()
//
// Internals: noise.js (tileable noise), painter.js (float images, stroke stamping, baked
// light, normal maps), mat_*.js (material families), foliage.js (leaf atlases),
// road.js (road markings), signs.js / printed.js (canvas signage & printed matter).
import * as THREE from 'three';
import { loadFonts, FONTS } from '../ui/fonts.js';
import { settings } from '../core/Settings.js';
import { FAMILIES } from './registry.js';
import { FOLIAGE_ATLAS } from './foliage.js';
import { ROAD_MARKINGS } from './road.js';
import { drawSign, SIGN_KINDS } from './signs.js';

export { FONTS, FOLIAGE_ATLAS, ROAD_MARKINGS, SIGN_KINDS };
export const fontsReady = loadFonts;

const cache = new Map();
const stats = { generated: 0, ms: 0, perFamily: {} };

/** Create a CanvasTexture by drawing into a 2D context. draw(ctx, w, h). opts: {srgb=true, repeat, mipmaps=true, anisotropy=4, wrap} */
export function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: !!opts.readback });
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = opts.wrap ?? THREE.RepeatWrapping;
  t.anisotropy = opts.anisotropy ?? 4;
  if (opts.mipmaps === false) {
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
  }
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  return t;
}

// ---------------------------------------------------------------------------
// Quality: texture resolution scale (defaults follow the graphics preset).
// ---------------------------------------------------------------------------
const QUALITY_SCALE = { low: 0.5, medium: 0.5, high: 1, ultra: 1 };
let qualityOverride = null;
/** Force texture quality ('low'|'medium'|'high'|'ultra'); affects textures generated afterwards. */
export function setTextureQuality(q) {
  qualityOverride = q;
}
function qualityScale() {
  const q = qualityOverride || settings.get('graphicsPreset') || 'high';
  return QUALITY_SCALE[q] ?? 1;
}

const KEY_TO_FAMILY = new Map();
for (const f of FAMILIES) for (const k of f.keys) KEY_TO_FAMILY.set(k, f);
/** Every texture key tex() understands. */
export const TEXTURE_KEYS = FAMILIES.flatMap((f) => f.keys);

function makeTexture(key, raw) {
  const { w, h, data } = raw;
  // generators paint top-down (like a canvas); flip so v=1 is the image top, matching CanvasTexture.
  const row = w * 4;
  const flipped = new Uint8Array(data.length);
  for (let y = 0; y < h; y++) flipped.set(data.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
  const t = new THREE.DataTexture(flipped, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = raw.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  const wrap = raw.wrap === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.wrapS = t.wrapT = wrap;
  if (raw.meta && raw.meta.nearest) {
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  } else {
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
  }
  t.name = key;
  t.userData = { key, alpha: !!raw.alpha, ...(raw.meta || {}) };
  t.needsUpdate = true;
  return t;
}

function familySize(f, opts) {
  if (f.fixed) return f.size;
  if (opts.size) return opts.size;
  const base = f.size ?? 512;
  return Math.max(f.minSize ?? 128, Math.round((base * qualityScale()) / 64) * 64);
}

function generate(f, size) {
  const t0 = performance.now();
  let raws;
  try {
    raws = f.gen(size);
  } catch (err) {
    console.error('[textures] generator failed for', f.keys[0], err);
    raws = {};
  }
  const ms = performance.now() - t0;
  stats.generated++;
  stats.ms += ms;
  stats.perFamily[f.keys[0] + '@' + size] = Math.round(ms);
  for (const k of f.keys) {
    const raw = raws[k];
    if (raw) cache.set(k + '@' + size, makeTexture(k, raw));
  }
}

const warned = new Set();
function fallback(key) {
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`[textures] unknown texture key "${key}"`);
  }
  const ck = 'fallback:' + key;
  let t = cache.get(ck);
  if (!t) {
    const isData = /_(normal|rough|mask|height)$/.test(key);
    const data = new Uint8Array(4 * 16);
    for (let i = 0; i < 16; i++) data.set(isData ? [128, 128, 255, 255] : [128, 120, 110, 255], i * 4);
    t = new THREE.DataTexture(data, 4, 4);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = isData ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.needsUpdate = true;
    cache.set(ck, t);
  }
  return t;
}

/**
 * Get a cached procedural texture by key (see TEXTURE_KEYS / docs), e.g.
 * 'asphalt', 'asphalt_normal', 'asphalt_rough', 'concrete_moss', 'bark', 'leaf_tropical' (RGBA atlas), ...
 * opts: { repeat:[u,v] } returns a clone sharing the image with its own repeat; { size } forces a resolution.
 * Colour maps are sRGB; *_normal / *_rough / masks / noise are NoColorSpace data maps.
 */
export function tex(key, opts = {}) {
  const f = KEY_TO_FAMILY.get(key);
  let t;
  if (!f) t = fallback(key);
  else {
    const size = familySize(f, opts);
    const ck = key + '@' + size;
    t = cache.get(ck);
    if (!t) {
      generate(f, size);
      t = cache.get(ck) || fallback(key);
    }
  }
  if (opts.repeat) {
    const c = t.clone();
    c.repeat.set(opts.repeat[0], opts.repeat[1]);
    c.needsUpdate = true;
    return c;
  }
  return t;
}

/** True if the key's family was already generated (at the current quality). */
export function isTextureReady(key) {
  const f = KEY_TO_FAMILY.get(key);
  return !!f && cache.has(key + '@' + familySize(f, {}));
}

/**
 * Generate textures ahead of time, yielding to the browser between families so a loading
 * screen can animate. keys default to TEXTURE_KEYS. onProgress(done, total, key).
 */
export async function preloadTextures(keys = TEXTURE_KEYS, onProgress = null) {
  const fams = [];
  for (const k of keys) {
    const f = KEY_TO_FAMILY.get(k);
    if (f && !fams.includes(f)) fams.push(f);
  }
  let done = 0;
  for (const f of fams) {
    if (!cache.has(f.keys[0] + '@' + familySize(f, {}))) generate(f, familySize(f, {}));
    done++;
    if (onProgress) onProgress(done, fams.length, f.keys[0]);
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** Generation timing stats {generated, ms, perFamily:{key@size: ms}}. */
export function textureStats() {
  return { ...stats, perFamily: { ...stats.perFamily } };
}

/**
 * Signage / decals / printed matter as CanvasTextures (original fictional Thai designs).
 * kind: 'km_marker' {km}, 'curve_warning' {dir}, 'elephant_crossing', 'village_sign' {th,en},
 *   'shrine_board', 'couplet' {text}, 'taxi_roof', 'vacant_lamp', 'plate' {text, province}, 'sticker' {variant},
 *   'poster' {variant}, 'drink_label' {variant}, 'snack_wrapper' {variant}, 'receipt' {lines}, 'lottery',
 *   'calendar', 'noodle_menu', 'garage_sign', 'bus_stop_sign', 'temple_sign', 'fork_sign' {side:'left'|'right'},
 *   'amulet_face', 'buddha_card', 'speed_sign' {kmh}, 'warning_sign' {th,en}, 'shop_sign' {th,en}
 * Common opts: { weather=0.5 (0 clean .. 1 ruined), seed, scale=1 (resolution multiplier) }.
 * Returned texture.userData: { kind, aspect (w/h), alpha (true when the shape is cut out by alpha),
 *   size:[metres w,h] suggested physical size, normalMap? (relief items like amulet_face) }.
 */
export function signTex(kind, opts = {}) {
  const key = 'sign:' + kind + ':' + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const t0 = performance.now();
  const t = drawSign(kind, opts, canvasTexture);
  stats.perFamily[key] = Math.round(performance.now() - t0);
  t.name = key;
  cache.set(key, t);
  return t;
}
