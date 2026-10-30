// Shared prop materials. Every non-emissive material here is a cached singleton so all
// props in the world share a handful of programs/materials (and the world can merge
// props per chunk by material). Colour comes from vertex colours (tint + baked
// weathering) multiplied by the painted texture from src/textures.
import * as THREE from 'three';
import { paintedMaterial, foliageMaterial } from '../../render/index.js';
import { tex, signTex, canvasTexture, FONTS } from '../../textures/index.js';
import { makeRng } from '../../core/math.js';
import { settings } from '../../core/Settings.js';

const cache = new Map();

/** Texture size for hero prop surfaces (crisp close-ups on foot): 1024 on high/ultra, else 512. */
function hiSize() {
  let q = 'high';
  try {
    q = settings.get('graphicsPreset') || 'high';
  } catch (e) {
    /* settings not ready */
  }
  return q === 'low' || q === 'medium' ? 512 : 1024;
}

function safeTex(key, hi = false) {
  try {
    const t = hi ? tex(key, { size: hiSize() }) : tex(key);
    if (t && hi && t.anisotropy < 8) {
      t.anisotropy = 8;
      t.needsUpdate = true;
    }
    return t;
  } catch (e) {
    return null;
  }
}

// key -> definition. uv = texture repeats per metre (box-projected UVs).
const DEFS = {
  concrete: { map: 'concrete', normalMap: 'concrete_normal', roughnessMap: 'concrete_rough', hi: true, roughness: 1, uv: 0.55, moss: 0.25, dirt: 0.5 },
  concrete_moss: { map: 'concrete_moss', normalMap: 'concrete_moss_normal', hi: true, roughness: 0.96, uv: 0.5, moss: 0.6, dirt: 0.5 },
  plaster: { map: 'paint_peel_white', normalMap: 'paint_peel_white_normal', hi: true, roughness: 0.92, uv: 0.55, dirt: 0.5, moss: 0.2 },
  paint_red: { map: 'paint_peel_red', normalMap: 'paint_peel_red_normal', hi: true, roughness: 0.8, uv: 0.7, dirt: 0.4 },
  stone: { map: 'rock', normalMap: 'rock_normal', hi: true, roughness: 0.95, uv: 0.6, moss: 0.4, dirt: 0.4 },
  brick: { map: 'concrete_moss', normalMap: 'rock_normal', roughness: 0.95, uv: 0.8, moss: 0.4, dirt: 0.5 },
  metal: { map: 'metal_painted', normalMap: 'metal_painted_normal', roughnessMap: 'metal_painted_rough', hi: true, roughness: 1, metalness: 0.3, uv: 1.0, dirt: 0.4 },
  rust: { map: 'rust', normalMap: 'rust_normal', roughnessMap: 'rust_rough', hi: true, roughness: 1, metalness: 0.35, uv: 1.2, dirt: 0.3 },
  galv: { map: 'chrome_dirty', normalMap: 'chrome_dirty_normal', roughnessMap: 'chrome_dirty_rough', roughness: 0.85, metalness: 0.65, uv: 1.0, dirt: 0.3 },
  wood: { map: 'wood_old', normalMap: 'wood_old_normal', hi: true, roughness: 0.9, uv: 0.9, dirt: 0.4, moss: 0.2 },
  lacquer: { map: 'red_lacquer', normalMap: 'red_lacquer_normal', roughnessMap: 'red_lacquer_rough', hi: true, roughness: 0.75, uv: 0.8, dirt: 0.3 },
  gold: { map: 'gold_leaf', normalMap: 'gold_leaf_normal', hi: true, roughness: 0.42, metalness: 0.45, uv: 1.5, dirt: 0.2 }, // gold PAINT: reads gold at night without env light
  bronze: { map: 'chrome_dirty', roughness: 0.55, metalness: 0.75, uv: 1.2, dirt: 0.3 },
  tiles: { map: 'roof_tiles', normalMap: 'roof_tiles_normal', hi: true, roughness: 0.7, uv: 0.55, moss: 0.5, dirt: 0.3 },
  corrugated: { map: 'roof_corrugated', normalMap: 'roof_corrugated_normal', roughnessMap: 'roof_corrugated_rough', hi: true, roughness: 1, metalness: 0.35, uv: 0.5, dirt: 0.3 },
  plastic: { map: 'brush_noise', roughness: 0.55, uv: 2.0, brush: 0.4 },
  rubber: { map: 'rubber', normalMap: 'rubber_normal', roughness: 0.92, uv: 1.5 },
  ceramic: { map: null, roughness: 0.28, uv: 1.0, brush: 0.3 },
  statue: { map: 'brush_noise', roughness: 0.6, uv: 1.5, brush: 0.5 },
  cloth: { map: 'fabric_cotton', normalMap: 'fabric_cotton_normal', roughness: 1, uv: 1.5, side: THREE.DoubleSide, wind: 'cloth', windStrength: 0.6, shadows: false },
  cloth_static: { map: 'fabric_cotton', normalMap: 'fabric_cotton_normal', roughness: 1, uv: 1.5, side: THREE.DoubleSide },
  silk: { map: 'fabric_silk', roughness: 0.55, uv: 1.5, side: THREE.DoubleSide, wind: 'cloth', windStrength: 0.4, shadows: false },
  paper: { map: 'lantern_paper', roughness: 0.9, uv: 1.0, side: THREE.DoubleSide },
  ash: { map: 'incense_ash', roughness: 1, uv: 3.0 },
  soil: { map: 'soil', roughness: 1, uv: 0.5 },
  moss: { map: 'moss', roughness: 1, uv: 1.2, shadows: false },
  leather: { map: 'leather_seat', roughness: 0.6, uv: 1.5 },
  flower: { map: null, roughness: 0.8, uv: 1.0, side: THREE.DoubleSide, translucency: 0.4, shadows: false },
  glass: { map: null, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, shadows: false, uvMode: 'keep' },
  glass_bottle: { map: null, roughness: 0.12, transparent: true, opacity: 0.78, uv: 1.0, shadows: false },
  dark: { map: null, roughness: 0.9, uv: 1.0 }, // cables, black plastic, shadows inside
};

/** Shared painted material by key (see DEFS). */
export function mat(key) {
  let m = cache.get(key);
  if (m) return m;
  const d = DEFS[key];
  if (!d) throw new Error('props: unknown material ' + key);
  const o = {
    color: 0xffffff,
    vertexColors: true,
    roughness: d.roughness,
    metalness: d.metalness ?? 0,
    side: d.side,
    transparent: d.transparent,
    opacity: d.opacity,
    depthWrite: d.depthWrite,
    brush: d.brush ?? 0.6,
    wet: 0.5,
    moss: d.moss ?? 0,
    dirt: d.dirt ?? 0,
    wind: d.wind ?? 'none',
    windStrength: d.windStrength ?? 1,
    translucency: d.translucency ?? 0,
    name: 'props_' + key,
  };
  if (d.map) o.map = safeTex(d.map, d.hi);
  if (d.normalMap) o.normalMap = safeTex(d.normalMap, d.hi);
  if (d.roughnessMap) o.roughnessMap = safeTex(d.roughnessMap, d.hi);
  m = paintedMaterial(o);
  m.userData.uvScale = d.uv ?? 1;
  m.userData.uvMode = d.uvMode ?? 'box';
  if (d.shadows === false) m.userData.shadows = false;
  cache.set(key, m);
  return m;
}

/** Foliage-like alpha card material (reeds, leaf offerings). */
export function leafMat(key = 'leaf_tropical', extra = {}) {
  const ck = 'leaf:' + key + JSON.stringify(extra);
  let m = cache.get(ck);
  if (m) return m;
  m = foliageMaterial({ map: safeTex(key), vertexColors: true, color: 0xffffff, name: 'props_leaf_' + key, ...extra });
  m.userData.uvMode = 'keep';
  m.userData.shadows = false;
  cache.set(ck, m);
  return m;
}

// ---------------------------------------------------------------------------
// Emissive (lamp) materials.
// ---------------------------------------------------------------------------
export const GLOW = {
  sodium: { color: 0xffa040, intensity: 5.5, base: 0x332010 },
  fluoro: { color: 0xe4fff0, intensity: 4.0, base: 0x9aa59f },
  fluoro_dim: { color: 0xc8e8d8, intensity: 2.2, base: 0x707a74 },
  bulb: { color: 0xffc070, intensity: 5.0, base: 0x4a3010 },
  red: { color: 0xff2a14, intensity: 3.2, base: 0x300404 },
  lantern: { color: 0xc8160a, intensity: 1.35, base: 0x3a0503 },
  lantern_white: { color: 0xfff0d0, intensity: 0.9, base: 0xb0a890 },
  amber: { color: 0xff8a14, intensity: 3.2, base: 0x5a2a00 },
  candle: { color: 0xffb860, intensity: 6.0, base: 0x402008 },
  ember: { color: 0xff5010, intensity: 4.0, base: 0x200000 },
  window: { color: 0xffb060, intensity: 1.8, base: 0x201005 },
  neon_red: { color: 0xff1a20, intensity: 4.0, base: 0x200000 },
  gold_glow: { color: 0xffc860, intensity: 1.2, base: 0x403010 },
};

/** Emissive lamp material. shared=true returns a singleton per kind (no flicker per instance). */
export function glowMat(kind = 'sodium', { shared = true, map = null } = {}) {
  const ck = 'glow:' + kind + (map ? ':' + map.uuid : '');
  if (shared && !map && cache.has(ck)) return cache.get(ck);
  const g = GLOW[kind] || GLOW.sodium;
  const m = paintedMaterial({
    color: g.base, vertexColors: true, emissive: g.color, emissiveIntensity: g.intensity, emissiveMap: map, map: map,
    roughness: 0.4, brush: 0.1, name: 'props_glow_' + kind,
  });
  m.userData.uvMode = 'keep';
  m.userData.shadows = false;
  m.userData.baseEmissive = g.intensity;
  m.userData.glowKind = kind;
  if (shared && !map) cache.set(ck, m);
  return m;
}

const POSTER_VARIANTS = ['movie', 'balm', 'drink', 'temple_fair', 'concert', 'election'];
const STICKER_VARIANTS = ['drive_slow', 'yantra', 'cartoon', 'lucky', 'no_smoking', 'merit'];
/** signTex variants are names: map numeric variants (seed-driven) onto them. */
function normSignOpts(kind, opts) {
  if (typeof opts.variant !== 'number') return opts;
  const list = kind === 'poster' ? POSTER_VARIANTS : kind === 'sticker' ? STICKER_VARIANTS : null;
  return list ? { ...opts, variant: list[((opts.variant % list.length) + list.length) % list.length] } : opts;
}

/** Sign / printed-matter material (UVs kept 0..1 across the plate). */
export function signMat(kind, opts = {}, extra = {}) {
  opts = normSignOpts(kind, opts);
  const ck = 'sign:' + kind + ':' + JSON.stringify(opts) + JSON.stringify(extra);
  let m = cache.get(ck);
  if (m) return m;
  let t = null;
  try {
    t = signTex(kind, opts);
  } catch (e) {
    t = null;
  }
  // cut-out shapes (diamonds, discs, arrow planks, strips) carry alpha: alpha-test them
  const alpha = !!t?.userData?.alpha;
  m = paintedMaterial({ color: 0xffffff, map: t, vertexColors: true, roughness: extra.roughness ?? 0.75, brush: extra.brush ?? 0.2, transparent: !!extra.transparent, alphaTest: extra.alphaTest ?? (alpha ? 0.5 : 0), side: extra.side, name: 'props_sign_' + kind });
  if (extra.emissive) {
    m.emissive = new THREE.Color(extra.emissive);
    m.emissiveMap = t;
    m.emissiveIntensity = extra.emissiveIntensity ?? 0.6;
  }
  m.userData.uvMode = 'keep';
  m.userData.shadows = false;
  cache.set(ck, m);
  return m;
}

/**
 * Physical layout of a signTex kind: { aspect (w/h), size:[w,h] m, shape, alpha } (texture userData).
 * Shapes are drawn upright on the canvas: map them on an axis-aligned quad of this aspect.
 */
export function signInfo(kind, opts = {}) {
  opts = normSignOpts(kind, opts);
  try {
    const u = signTex(kind, opts).userData || {};
    const size = u.size || [1, 1 / (u.aspect || 1)];
    return { aspect: u.aspect || size[0] / size[1], size, shape: u.shape || 'rect', alpha: !!u.alpha };
  } catch (e) {
    return { aspect: 1, size: [1, 1], shape: 'rect', alpha: false };
  }
}

/**
 * Upright sign quad sized from the texture: pass {w} or {h} (the other follows the aspect);
 * neither -> the texture's suggested physical size. -> { geo, w, h, info }
 */
export function signQuadSize(kind, opts = {}, { w, h } = {}) {
  const info = signInfo(kind, opts);
  if (w && !h) h = w / info.aspect;
  else if (h && !w) w = h * info.aspect;
  else if (!w && !h) [w, h] = info.size;
  return { w, h, info };
}

/** Material from a local canvas texture (decals, painting, photos...). */
export function texMat(key, makeTex, extra = {}) {
  const ck = 'tex:' + key;
  let m = cache.get(ck);
  if (m) return m;
  const t = makeTex();
  m = paintedMaterial({
    color: 0xffffff, map: t, vertexColors: true, roughness: extra.roughness ?? 0.85, transparent: !!extra.transparent,
    depthWrite: extra.transparent ? false : undefined, alphaTest: extra.alphaTest ?? 0, side: extra.side, brush: 0.3,
    emissive: extra.emissive, emissiveMap: extra.emissive ? t : null, emissiveIntensity: extra.emissiveIntensity ?? 1,
    metalness: extra.metalness ?? 0, name: 'props_' + key,
  });
  if (extra.transparent || extra.decal) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
  }
  m.userData.uvMode = 'keep';
  m.userData.shadows = false;
  cache.set(ck, m);
  return m;
}

// ---------------------------------------------------------------------------
// Local canvas textures (small decals the texture library doesn't provide).
// ---------------------------------------------------------------------------
const CLAMP = { wrap: THREE.ClampToEdgeWrapping };

/** Spray-paint graffiti tags (alpha). */
export function graffitiTex(seed = 1) {
  return canvasTexture(512, 256, (g, w, h) => {
    const rng = makeRng(seed);
    g.clearRect(0, 0, w, h);
    const cols = ['rgba(20,20,22,0.85)', 'rgba(150,20,24,0.8)', 'rgba(30,50,120,0.75)', 'rgba(25,25,25,0.7)'];
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const words = ['รักนะ', 'ซิ่ง', 'เด็กแว้น', 'ห้ามทิ้งขยะ', 'อย่าหันหลัง', 'จำไว้', 'ม.3/2', 'ผีมีจริง', 'BOY', 'นัท+ฝน'];
    for (let i = 0; i < 4; i++) {
      const c = cols[Math.floor(rng() * cols.length)];
      g.save();
      g.translate(40 + rng() * (w - 160), 50 + rng() * (h - 80));
      g.rotate((rng() - 0.5) * 0.35);
      g.fillStyle = c;
      g.strokeStyle = c;
      g.font = `${28 + rng() * 34}px ${FONTS.hand}`;
      const word = words[Math.floor(rng() * words.length)];
      g.shadowColor = c;
      g.shadowBlur = 6;
      g.fillText(word, 0, 0);
      g.restore();
    }
    // loose scribbles and drips
    for (let i = 0; i < 5; i++) {
      g.strokeStyle = cols[Math.floor(rng() * cols.length)];
      g.lineWidth = 2 + rng() * 5;
      g.beginPath();
      let x = rng() * w, y = rng() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rng() - 0.5) * 90;
        y += (rng() - 0.5) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
      // drip
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rng() - 0.5) * 3, y + 10 + rng() * 40);
      g.stroke();
    }
  }, CLAMP);
}

/** Dark branching cracks (alpha decal). */
export function crackTex(seed = 3) {
  return canvasTexture(256, 256, (g, w, h) => {
    const rng = makeRng(seed);
    g.clearRect(0, 0, w, h);
    g.lineCap = 'round';
    const branch = (x, y, a, len, wdt, depth) => {
      g.strokeStyle = `rgba(12,10,8,${0.55 + 0.3 * rng()})`;
      g.lineWidth = wdt;
      g.beginPath();
      g.moveTo(x, y);
      for (let i = 0; i < len; i++) {
        a += (rng() - 0.5) * 0.7;
        x += Math.cos(a) * 6;
        y += Math.sin(a) * 6;
        g.lineTo(x, y);
        if (depth < 3 && rng() < 0.08) branch(x, y, a + (rng() - 0.5) * 2, len * 0.5, wdt * 0.6, depth + 1);
      }
      g.stroke();
    };
    for (let i = 0; i < 3; i++) branch(w / 2 + (rng() - 0.5) * 60, h / 2 + (rng() - 0.5) * 60, rng() * 6.28, 22 + rng() * 14, 2.4, 0);
  }, CLAMP);
}

/** Water / rust / oil stain blotches (alpha). */
export function stainTex(seed = 5, color = '40,30,20') {
  return canvasTexture(256, 256, (g, w, h) => {
    const rng = makeRng(seed);
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = w / 2 + (rng() - 0.5) * w * 0.55, y = h / 2 + (rng() - 0.5) * h * 0.55, r = 10 + rng() * 60;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${color},${0.18 + rng() * 0.2})`);
      gr.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, CLAMP);
}

/** Milky fluorescent diffuser with dead insects collected inside. */
export function bugDiffuserTex(seed = 7) {
  return canvasTexture(256, 64, (g, w, h) => {
    const rng = makeRng(seed);
    g.fillStyle = '#e8efe6';
    g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0.0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(160,150,110,0.25)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    // yellowed ends
    for (const x0 of [0, w - 40]) {
      const e = g.createLinearGradient(x0, 0, x0 + 40, 0);
      e.addColorStop(x0 === 0 ? 0 : 1, 'rgba(120,100,50,0.45)');
      e.addColorStop(x0 === 0 ? 1 : 0, 'rgba(120,100,50,0)');
      g.fillStyle = e;
      g.fillRect(x0, 0, 40, h);
    }
    // dead bugs settled at the bottom of the trough
    for (let i = 0; i < 70; i++) {
      const x = rng() * w, y = h * (0.55 + rng() * 0.42);
      g.fillStyle = `rgba(${20 + rng() * 30},${15 + rng() * 20},${10},${0.5 + rng() * 0.45})`;
      g.beginPath();
      g.ellipse(x, y, 1 + rng() * 3.5, 0.8 + rng() * 1.6, rng() * 3, 0, Math.PI * 2);
      g.fill();
      if (rng() < 0.3) {
        g.strokeStyle = 'rgba(20,15,10,0.5)';
        g.lineWidth = 0.6;
        g.beginPath();
        g.moveTo(x - 4, y - 2);
        g.lineTo(x + 4, y + 2);
        g.stroke();
      }
    }
  }, CLAMP);
}

/** Ornate abstract "flames" painting (reference 5) for the garage. */
export function paintingTex(seed = 11) {
  return canvasTexture(256, 320, (g, w, h) => {
    const rng = makeRng(seed);
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0d0e12');
    bg.addColorStop(1, '#1d1712');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const cols = ['#d14a1c', '#e8a33a', '#6a8a3a', '#b22a1c', '#f0c860', '#3a6a8a'];
    for (let i = 0; i < 42; i++) {
      const x = 30 + rng() * (w - 60), y0 = h * (0.65 + rng() * 0.25), hh = 60 + rng() * 170;
      g.strokeStyle = cols[Math.floor(rng() * cols.length)];
      g.globalAlpha = 0.55 + rng() * 0.4;
      g.lineWidth = 3 + rng() * 7;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y0);
      g.bezierCurveTo(x + (rng() - 0.5) * 60, y0 - hh * 0.4, x + (rng() - 0.5) * 60, y0 - hh * 0.7, x + (rng() - 0.5) * 30, y0 - hh);
      g.stroke();
    }
    g.globalAlpha = 1;
    // craquelure / varnish yellowing
    g.fillStyle = 'rgba(120,90,30,0.18)';
    g.fillRect(0, 0, w, h);
  }, CLAMP);
}

/** Faded small photo (portrait or landscape). variant picks pose and tint. */
export function photoTex(variant = 0) {
  return canvasTexture(128, 160, (g, w, h) => {
    const rng = makeRng(variant * 31 + 7);
    const warm = ['#c9b48a', '#b8a888', '#a8b0a0', '#c8a890'][variant % 4];
    g.fillStyle = '#efe8d8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = warm;
    g.fillRect(8, 8, w - 16, h - 36);
    // background gradient
    const gr = g.createLinearGradient(0, 8, 0, h - 28);
    gr.addColorStop(0, 'rgba(90,100,110,0.5)');
    gr.addColorStop(1, 'rgba(60,50,40,0.4)');
    g.fillStyle = gr;
    g.fillRect(8, 8, w - 16, h - 36);
    // figure: shoulders + head silhouette, blurred
    g.filter = 'blur(1.5px)';
    g.fillStyle = 'rgba(40,32,28,0.85)';
    g.beginPath();
    g.ellipse(w / 2, h - 34, 40, 34, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = 'rgba(150,110,85,0.95)';
    g.beginPath();
    g.ellipse(w / 2 + (rng() - 0.5) * 6, 64, 19, 24, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(25,20,18,0.95)';
    g.beginPath();
    g.ellipse(w / 2, 50, 21, 14, 0, Math.PI, 0);
    g.fill();
    g.filter = 'none';
    // fading
    g.fillStyle = 'rgba(240,225,190,0.25)';
    g.fillRect(0, 0, w, h);
  }, CLAMP);
}

/** Wall clock face (stopped at 3:00 — the hour of the dead). */
export function clockTex() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#ece4cc';
    g.beginPath();
    g.arc(64, 64, 62, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(120,100,60,0.25)';
    g.beginPath();
    g.arc(64, 70, 58, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#222';
    g.font = `bold 15px ${FONTS.body}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      g.fillText(String(i), 64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48);
    }
    g.strokeStyle = '#111';
    g.lineCap = 'round';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64 + 26, 64);
    g.stroke();
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64, 64 - 40);
    g.stroke();
    g.strokeStyle = '#a01818';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64 - 20, 64 + 34);
    g.stroke();
  }, CLAMP);
}

/** Cheap night environment (dark forest silhouette + a few lamp blobs) for convex mirrors / water. */
let _env = null;
export function nightEnvTex() {
  if (_env) return _env;
  _env = canvasTexture(256, 128, (g, w, h) => {
    const rng = makeRng(77);
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0a1420');
    sky.addColorStop(0.45, '#1c2a32');
    sky.addColorStop(0.55, '#0c120e');
    sky.addColorStop(1, '#050605');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#06090a';
    for (let x = 0; x < w; x += 3) {
      const hh = 40 + Math.sin(x * 0.05) * 8 + rng() * 14;
      g.fillRect(x, h / 2 - hh * 0.4, 3, hh);
    }
    for (let i = 0; i < 6; i++) {
      const x = rng() * w, y = h * (0.42 + rng() * 0.1);
      const gr = g.createRadialGradient(x, y, 0, x, y, 9);
      gr.addColorStop(0, 'rgba(255,190,110,0.95)');
      gr.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = gr;
      g.fillRect(x - 10, y - 10, 20, 20);
    }
  }, CLAMP);
  _env.mapping = THREE.EquirectangularReflectionMapping;
  return _env;
}

/** 2x2 atlas of four faded notices (one material for every pole). */
// notices on walls / poles are real printed posters (photo catalogue), not canvas mock-ups
export const NOTICE_VARIANTS = ['missing', 'lottery', 'election', 'temple_fair'];
/** @deprecated canvas notices: kept for old callers; props use noticeTex / signMat('poster'). */
export function noticeAtlasTex() {
  return canvasTexture(256, 360, (g, W, H) => {
    for (let v = 0; v < 4; v++) {
      g.save();
      g.translate((v % 2) * 128, (1 - Math.floor(v / 2)) * 180);
      drawNotice(g, 128, 180, v);
      g.restore();
    }
  }, CLAMP);
}
/** A4 notice on a wall: a real printed poster from the photo catalogue. */
export function noticeTex(seed = 1) {
  try {
    const t = signTex('poster', { variant: NOTICE_VARIANTS[((seed % NOTICE_VARIANTS.length) + NOTICE_VARIANTS.length) % NOTICE_VARIANTS.length] });
    if (t) return t;
  } catch (e) {
    /* library unavailable: fall through */
  }
  return canvasTexture(128, 180, (g, w, h) => drawNotice(g, w, h, seed), CLAMP);
}
function drawNotice(g, w, h, seed) {
  {
    const rng = makeRng(seed + 1);
    g.fillStyle = ['#e6dcc4', '#d8d0b8', '#e0d4b0'][seed % 3];
    g.fillRect(0, 0, w, h);
    g.fillStyle = ['#8a2a20', '#2a4a7a', '#2a6a3a'][seed % 3];
    g.fillRect(8, 10, w - 16, 26);
    g.fillStyle = 'rgba(30,30,30,0.7)';
    for (let i = 0; i < 12; i++) g.fillRect(10, 48 + i * 10, (w - 20) * (0.5 + rng() * 0.5), 3);
    g.fillStyle = 'rgba(160,130,80,0.35)';
    g.fillRect(0, h * 0.6, w, h * 0.4);
    // a few Thai words (hand-lettered notice: buying scrap / room for rent / lost dog)
    const words = ['รับซื้อของเก่า', 'ห้องว่างให้เช่า', 'สุนัขหาย', 'ประกาศ'];
    g.fillStyle = '#f0e8d0';
    g.font = `bold 15px ${FONTS.sign}`;
    g.textAlign = 'center';
    g.fillText(words[seed % 4], w / 2, 29);
  }
}
