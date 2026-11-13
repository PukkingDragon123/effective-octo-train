// Photo-based blood for 2D surfaces (glass panes, screens) and 3D decals: the CC0 blood
// decals in public/assets/textures/decals (built from ambientCG CC0 photos, credited in
// docs/credits/textures.md). Owner rule: no blood is drawn in code, only these found assets.
//
// Canvas convention (glass blood canvases): rgb = blood colour, alpha = thickness
// (thin = translucent film, thick = opaque coagulated blood); the glass shader turns that
// into a stain / body / wet glint and darkens it with the light around it.
//
//   preloadBloodDecals()                          start loading (called at import)
//   bloodDecalImage(kind, variant?)               HTMLImageElement or null while loading
//   whenBloodDecalsReady()                        Promise, resolves when every image loaded
//   paintBloodDecal(g, kind, x, y, w, h, rot, o)  handprint / smear / drip / spatter / pool
//   bloodDecalTexture(kind, variant)              THREE.Texture of a decal (3D blood)
import { settings } from '../core/Settings.js';
import * as THREE from 'three';

const PATH = 'assets/textures/decals/';
const VARIANTS = { handprint: 2, smear: 2, drip: 3, spatter: 3, pool: 3 };
const _imgs = new Map();
const reducedGore = () => settings.get('gore') === 'reduced';

function load(key) {
  if (_imgs.has(key) || typeof Image === 'undefined') return _imgs.get(key);
  const img = new Image();
  img.decoding = 'async';
  img.src = PATH + key + '.webp';
  _imgs.set(key, img);
  return img;
}

/** Start loading every decal (small WebPs, ~0.5 MB in all). */
export function preloadBloodDecals() {
  for (const [kind, n] of Object.entries(VARIANTS)) {
    for (let v = 0; v < n; v++) {
      load(`blood_${kind}_${v}`);
      load(`blood_${kind}_${v}_reduced`);
    }
  }
}

/** A loaded decal image ('handprint'|'smear'|'drip'|'spatter'|'pool'), or null while loading. */
export function bloodDecalImage(kind, variant = 0) {
  const n = VARIANTS[kind];
  if (!n) return null;
  const key = `blood_${kind}_${((variant % n) + n) % n}${reducedGore() ? '_reduced' : ''}`;
  const img = load(key);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

let _ready = null;
/** Resolves once every decal image has loaded (or failed). */
export function whenBloodDecalsReady() {
  if (_ready) return _ready;
  preloadBloodDecals();
  _ready = Promise.all([..._imgs.values()].map((img) => (img.complete ? Promise.resolve() : new Promise((r) => {
    img.addEventListener('load', r, { once: true });
    img.addEventListener('error', r, { once: true });
  }))));
  return _ready;
}

const _tex = new Map();
/** Texture of a decal for 3D blood (pools, runs); cached per gore level. */
export function bloodDecalTexture(kind, variant = 0) {
  const n = VARIANTS[kind] || 1;
  const key = `blood_${kind}_${((variant % n) + n) % n}${reducedGore() ? '_reduced' : ''}`;
  if (_tex.has(key)) return _tex.get(key);
  const t = new THREE.TextureLoader().load(PATH + key + '.webp');
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  _tex.set(key, t);
  return t;
}

/**
 * Draw a photo decal ('smear'|'drip'|'spatter'|'pool') centred at (x, y), w x h px, rotated.
 * opts { variant, alpha=1, anchorTop (drip: (x, y) is the top edge) }. Returns false while
 * the image is still loading (the caller can fall back to a procedural mark).
 */
export function paintBloodDecal(g, kind, x, y, w, h, rot = 0, opts = {}) {
  const img = bloodDecalImage(kind, opts.variant ?? ((Math.random() * 3) | 0));
  if (!img) return false;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.globalAlpha = opts.alpha ?? 1;
  g.drawImage(img, -w / 2, opts.anchorTop ? 0 : -h / 2, w, h);
  g.restore();
  g.globalAlpha = 1;
  return true;
}

preloadBloodDecals();
