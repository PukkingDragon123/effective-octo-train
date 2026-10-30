// Procedural hand-painted texture library (contract: docs/ARCHITECTURE.md "textures").
// STUB IMPLEMENTATION — the textures agent replaces internals; signatures must stay.
import * as THREE from 'three';
import { loadFonts, FONTS } from '../ui/fonts.js';

export { FONTS };
export const fontsReady = loadFonts;

const cache = new Map();

/** Create a CanvasTexture by drawing into a 2D context. draw(ctx, w, h). opts: {srgb=true, repeat, mipmaps=true, anisotropy=4} */
export function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = opts.wrap ?? THREE.RepeatWrapping;
  t.anisotropy = opts.anisotropy ?? 4;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  return t;
}

const STUB_COLORS = {
  asphalt: '#2a2b2c', concrete: '#7d7a72', concrete_moss: '#5f6b4a', bark: '#4a3b2e', bark_banyan: '#6b6255',
  moss: '#3f5a2a', soil: '#3b2f25', rock: '#5a5a55', leaf_tropical: '#2e5a2a', leaf_banana: '#4f7a33',
  leaf_fern: '#36622e', leaf_bamboo: '#5a7a3a', grass_card: '#4a6a35', vine: '#3a5a2a', rust: '#7a4a2a',
  wood_old: '#5a4632', paint_peel_white: '#c9c4b5', roof_tiles: '#7a3a2a', gold_leaf: '#c9a24a',
  taxi_paint: '#c8b84a', leather_seat: '#3a2a22', dash_plastic: '#2a2a2c', fabric: '#6a6a70', skin: '#b08060',
  cloth_red: '#a02a22', cloth_yellow: '#d0a830', cloth_green: '#2a7a4a', water: '#1a2a30', brush_noise: '#808080',
};

/**
 * Get a cached procedural texture by key (see docs for the full key list), e.g.
 * 'asphalt', 'asphalt_normal', 'asphalt_rough', 'concrete_moss', 'bark', 'leaf_tropical' (RGBA atlas), ...
 * opts: { repeat:[u,v] } returns a clone sharing the image with its own repeat.
 */
export function tex(key, opts = {}) {
  let t = cache.get(key);
  if (!t) {
    const col = STUB_COLORS[key.replace(/_(normal|rough|alpha)$/, '')] || '#888888';
    const isNormal = key.endsWith('_normal');
    t = canvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = isNormal ? '#8080ff' : col;
      g.fillRect(0, 0, w, h);
      if (!isNormal) {
        for (let i = 0; i < 200; i++) {
          g.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},0.05)`;
          g.fillRect(Math.random() * w, Math.random() * h, 4, 4);
        }
      }
    }, { srgb: !isNormal });
    cache.set(key, t);
  }
  if (opts.repeat) {
    const c = t.clone();
    c.repeat.set(opts.repeat[0], opts.repeat[1]);
    c.needsUpdate = true;
    return c;
  }
  return t;
}

/**
 * Signage / decals / printed matter as CanvasTextures (original fictional Thai designs).
 * kind: 'km_marker' {km}, 'curve_warning' {dir}, 'elephant_crossing', 'village_sign' {th,en},
 *   'shrine_board', 'couplet' {text}, 'taxi_roof', 'vacant_lamp', 'plate' {text, province}, 'sticker' {variant},
 *   'poster' {variant}, 'drink_label' {variant}, 'snack_wrapper' {variant}, 'receipt' {lines}, 'lottery',
 *   'calendar', 'noodle_menu', 'garage_sign', 'bus_stop_sign', 'temple_sign', 'fork_sign' {side:'left'|'right'},
 *   'amulet_face', 'buddha_card', 'speed_sign' {kmh}, 'warning_sign' {th,en}, 'shop_sign' {th,en}
 */
export function signTex(kind, opts = {}) {
  const key = 'sign:' + kind + ':' + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const t = canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#d8c79a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#222';
    g.font = `600 28px ${FONTS.sign}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(opts.th || opts.text || kind, w / 2, h / 2);
  }, { wrap: THREE.ClampToEdgeWrapping });
  cache.set(key, t);
  return t;
}
