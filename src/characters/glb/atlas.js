// Procedural painterly atlas for a GLB character (1024² virtual layout, layout.js):
// skin over every body region, then bottoms, tops, shoes, hair strands and grime. A parallel
// mask canvas (RGBA) carries per-texel material data for the shader:
//   R = skin (computed: texels that still equal the skin-only paint), G = roughness,
//   B = 255 shell cutout (the clothing shell is discarded there: bare shoulders, armholes,
//   necklines) / 128 sequins (sparkle), A = 255.
// No photo textures: everything is painted with strokes, blobs and procedural weave tiles.
import * as THREE from 'three';
import { makeRng } from '../../core/math.js';
import { R, torsoT, legT, armT, neckT, handT } from './layout.js';
import { Painter, weaveTile, strandTile, noiseTile, shade, shadeHex, mix, lum, hexToRgb, css, rgba } from './painter.js';

const cache = new Map();

/** Returns { map, mask } CanvasTextures for the look (cached by key). */
export function getAtlas(look, key, size = 1024) {
  const k = key + '|' + size;
  let e = cache.get(k);
  if (e) { e.refs++; return e; }
  const { color, mask } = paintAtlas(look, size);
  const map = new THREE.CanvasTexture(color);
  map.flipY = false;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const mt = new THREE.CanvasTexture(mask);
  mt.flipY = false;
  mt.colorSpace = THREE.NoColorSpace;
  e = { map, mask: mt, refs: 1, key: k };
  cache.set(k, e);
  return e;
}
export function releaseAtlas(e) {
  if (!e) return;
  if (--e.refs <= 0) { e.map.dispose(); e.mask.dispose(); cache.delete(e.key); }
}

const ROUGH = { skin: 0.55, jersey: 0.92, plain: 0.85, twill: 0.88, linen: 0.9, rib: 0.92, sateen: 0.5, knitL: 0.95, leather: 0.42, rubber: 0.6, hair: 0.78 };

export function paintAtlas(look, S = 1024) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const MSZ = Math.min(S, 1024);
  const mk = document.createElement('canvas');
  mk.width = mk.height = MSZ;
  const P = new Painter(cv, S, look.seed);
  const M = new Painter(mk, MSZ, look.seed);
  M.g.fillStyle = `rgb(0,${Math.round(ROUGH.skin * 255)},0)`;
  M.g.fillRect(0, 0, 1024, 1024);
  const r = makeRng(look.seed * 7 + 3);
  const ctx = { P, M, look, r, skin: look.skin, o: look.outfit };
  paintSkin(ctx);
  // snapshot of the skin-only paint (skin mask by difference)
  const MS = 256;
  const snap = document.createElement('canvas');
  snap.width = snap.height = MS;
  snap.getContext('2d', { willReadFrequently: true }).drawImage(cv, 0, 0, MS, MS);
  paintScalp(ctx);
  paintBottom(ctx);
  paintTop(ctx);
  paintShoes(ctx);
  paintHair(ctx);
  paintGrime(ctx);
  // ---- skin mask: R = 255 where the final paint still equals the skin paint
  const fin = document.createElement('canvas');
  fin.width = fin.height = MS;
  const fg = fin.getContext('2d', { willReadFrequently: true });
  fg.drawImage(cv, 0, 0, MS, MS);
  const a = snap.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, MS, MS).data;
  const b = fg.getImageData(0, 0, MS, MS).data;
  const mg = M.g;
  mg.save();
  mg.setTransform(1, 0, 0, 1, 0, 0);
  const md = mg.getImageData(0, 0, MSZ, MSZ);
  const k = MSZ / MS;
  for (let y = 0; y < MSZ; y++) for (let x = 0; x < MSZ; x++) {
    const i = ((y / k | 0) * MS + (x / k | 0)) * 4;
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    const v = d < 18 ? 255 : d < 40 ? Math.round((255 * (40 - d)) / 22) : 0;
    const j = (y * MSZ + x) * 4;
    md.data[j] = v;
    md.data[j + 3] = 255;
  }
  // the face region is always skin (face texture), the hair region never
  for (let y = 400 * MSZ / 1024 | 0; y < 720 * MSZ / 1024; y++) for (let x = 0; x < 320 * MSZ / 1024; x++) md.data[(y * MSZ + x) * 4] = 255;
  mg.putImageData(md, 0, 0);
  mg.restore();
  return { color: cv, mask: mk };
}

// ------------------------------------------------------------------ helpers
function fabric(c, reg, s0, t0, s1, t1, col, weave, o = {}) {
  const { P, M } = c;
  const [x, y, w, h] = P.rect(reg, s0, t0, s1, t1);
  if (w <= 0 || h <= 0) return;
  P.fill(reg, col, s0, t0, s1, t1);
  // painterly colour drift (large soft blotches) and brush strokes
  P.g.save();
  P.g.beginPath(); P.g.rect(x, y, w, h); P.g.clip();
  P.pattern(reg, noiseTile(3, 3, 11), 0.35 * (o.drift ?? 1), s0, t0, s1, t1, 1.6, 'soft-light');
  P.strokes(reg, Math.round(w * h * 0.004 * (o.strokeK ?? 1)), lum(col) > 0.6 ? shadeHex(col, 0.9) : shadeHex(col, 1.15), 0.12, 14, 4, s0, t0, s1, t1, Math.PI / 2, 0.5);
  P.strokes(reg, Math.round(w * h * 0.003 * (o.strokeK ?? 1)), shadeHex(col, 0.78), 0.1, 18, 5, s0, t0, s1, t1, Math.PI / 2, 0.4);
  P.g.restore();
  if (weave) P.pattern(reg, weaveTile(weave), o.weaveA ?? 0.32, s0, t0, s1, t1, o.weaveScale ?? 0.55, 'overlay', o.rot || 0);
  const rough = o.rough ?? ROUGH[weave] ?? 0.85;
  M.fill(reg, `rgb(0,${Math.round(rough * 255)},0)`, s0, t0, s1, t1);
}
function cutout(c, reg, fn) {
  // fn(painter) draws filled shapes on the mask's blue channel
  const g = c.M.g;
  g.save();
  g.globalCompositeOperation = 'lighter';
  fn(c.M, 'rgb(0,0,255)');
  g.restore();
}
const AO = (c, reg, s, t, rs, rt, a, wrap = false, col = null) => c.P.blob(reg, s, t, rs, rt, col || shadeHex(c.skin, 0.5), a, wrap);

// ------------------------------------------------------------------ skin
function paintSkin(c) {
  const { P, skin, look } = c;
  const g = P.g;
  g.fillStyle = skin;
  g.fillRect(0, 0, 1024, 1024);
  const warm = mix(skin, '#c4584a', 0.25), cool = mix(skin, '#6a7a8a', 0.2), light = mix(skin, '#fff1dc', 0.18);
  for (const reg of [R.torso, R.leg, R.arm, R.neck, R.hand, R.foot, R.scalp, R.ear]) {
    P.pattern(reg, noiseTile(4, 4, 23), 0.22, 0, 0, 1, 1, 0.7, 'soft-light');
    P.strokes(reg, Math.round(reg.w * reg.h * 0.0016), light, 0.08, 16, 6, 0, 0, 1, 1, Math.PI / 2, 1.2, true);
    P.strokes(reg, Math.round(reg.w * reg.h * 0.0012), warm, 0.08, 14, 6, 0, 0, 1, 1, Math.PI / 2, 1.2, true);
    P.strokes(reg, Math.round(reg.w * reg.h * 0.0008), cool, 0.06, 18, 7, 0, 0, 1, 1, Math.PI / 2, 1.2, true);
  }
  // torso form: armpits, chest, navel, spine, crotch
  const ta = torsoT(1.36), tc = torsoT(1.3);
  AO(c, R.torso, 0.25, ta, 0.06, 0.09, 0.45); AO(c, R.torso, 0.75, ta, 0.06, 0.09, 0.45);
  if (look.sex === 'm') for (const s of [0.43, 0.57]) { AO(c, R.torso, s, tc + 0.03, 0.05, 0.025, 0.2); P.dot(R.torso, s, tc, 1.5, shade(skin, 0.7)); }
  else AO(c, R.torso, 0.5, torsoT(1.235), 0.1, 0.035, 0.35);
  P.blob(R.torso, 0.5, torsoT(1.05), 0.012, 0.012, shadeHex(skin, 0.6), 0.7);
  AO(c, R.torso, 0.5, torsoT(1.0), 0.13, 0.03, look.build * 0.3);
  AO(c, R.torso, 0.0, 0.6, 0.03, 0.35, 0.2, true);
  AO(c, R.torso, 0.5, 0.98, 0.12, 0.05, 0.4); AO(c, R.torso, 0.0, 0.96, 0.08, 0.05, 0.35, true);
  for (const s of [0.42, 0.58]) P.line(R.torso, [[0.5, torsoT(1.43)], [s + (s - 0.5) * 1.2, torsoT(1.425)]], shade(skin, 0.82), 2, 0.35);
  // legs: knees, shins, inner thigh
  AO(c, R.leg, 0.5, legT(0.5), 0.07, 0.03, 0.16); P.blob(R.leg, 0.5, legT(0.47), 0.05, 0.02, shadeHex(skin, 1.1), 0.22);
  AO(c, R.leg, 0.25, legT(0.9), 0.08, 0.1, 0.3); AO(c, R.leg, 0.0, legT(0.46), 0.08, 0.03, 0.3, true);
  // arms: elbow, armpit
  AO(c, R.arm, 0.75, armT(0.29), 0.06, 0.02, 0.3); AO(c, R.arm, 0.0, armT(0.0), 0.1, 0.08, 0.35, true);
  // neck: under the jaw (top of the neck region), throat
  AO(c, R.neck, 0.5, 0.0, 0.3, 0.4, 0.45, true);
  if (look.sex === 'm') AO(c, R.neck, 0.5, neckT(1.5), 0.04, 0.12, 0.2);
  if (look.old > 0.3) for (let i = 0; i < 3; i++) P.line(R.neck, [[0.32, 0.3 + i * 0.16], [0.5, 0.36 + i * 0.16], [0.68, 0.3 + i * 0.16]], shade(skin, 0.75), 1.2, 0.35 * look.old);
  // hands: knuckles, finger creases, nails
  const hk = R.hand;
  for (const s of [0.42, 0.5, 0.58]) P.line(hk, [[s, 0.62], [s, 0.98]], shade(skin, 0.62), 1.3, 0.5);
  for (const s of [0.38, 0.46, 0.54, 0.62]) P.dot(hk, s, 0.52, 1.5, shade(skin, 0.8));
  for (const s of [0.39, 0.46, 0.54, 0.61]) P.blob(hk, s, 0.94, 0.03, 0.04, mix(skin, '#f0d6cc', 0.6), 0.55);
  AO(c, hk, 0.0, 0.6, 0.15, 0.4, 0.22, true);
  if (look.old > 0.2) P.strokes(hk, 60, shadeHex(skin, 0.75), 0.25 * look.old, 6, 1, 0.3, 0.1, 0.7, 0.6, 0.3, 2.5);
  // feet: toes, nails, sole darker
  const fk = R.foot;
  for (const s of [0.42, 0.48, 0.54, 0.6]) P.line(fk, [[s, 0.86], [s, 0.99]], shade(skin, 0.65), 1.2, 0.5);
  for (const s of [0.4, 0.46, 0.52, 0.57, 0.62]) P.blob(fk, s, 0.94, 0.022, 0.03, mix(skin, '#efd6c8', 0.6), 0.5);
  P.band(fk, 0, 1, shade(skin, 0.72), 0.5, 0, 0.12); P.band(fk, 0, 1, shade(skin, 0.72), 0.5, 0.88, 1);
  // ears region (unused by the body, keep skin)
  P.blob(R.ear, 0.55, 0.5, 0.25, 0.3, shadeHex(skin, 0.6), 0.5);
}

function paintScalp(c) {
  const { P, look, skin } = c;
  const st = look.hair.style, hc = look.hair.color;
  if (st === 'shaved') {
    P.fill(R.scalp, mix(skin, '#3a3a40', 0.28), 0, 0, 1, 1, 0.65);
    P.pattern(R.scalp, noiseTile(5, 16, 41), 0.35, 0, 0, 1, 1, 0.5, 'overlay');
    return;
  }
  if (st === 'bald') {
    P.blob(R.scalp, 0.5, 0.65, 0.6, 0.25, hc, 0.7);
    P.pattern(R.scalp, noiseTile(5, 16, 41), 0.3, 0, 0.45, 1, 1, 0.5, 'overlay');
    return;
  }
  const g = P.g;
  const [x, y, w, h] = P.rect(R.scalp, 0, 0, 1, 1);
  const gr = g.createLinearGradient(0, y, 0, y + h);
  const [r0, g0, b0] = hexToRgb(hc);
  gr.addColorStop(0, css(r0, g0, b0, 1)); gr.addColorStop(0.7, css(r0, g0, b0, 0.95)); gr.addColorStop(0.92, css(r0, g0, b0, 0.0));
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  P.pattern(R.scalp, strandTile(), 0.3, 0, 0, 1, 0.85, 0.5, 'overlay');
}

// ------------------------------------------------------------------ bottoms
function paintBottom(c) {
  const { P, o, r } = c;
  const col = o.botCol;
  const weave = o.botFab;
  const tWaist = torsoT(o.bottom === 'skirt_wrap' || o.bottom === 'skirt_long' ? 1.02 : 0.99);
  const skirt = o.bottom.startsWith('skirt');
  // torso part below the waist
  fabric(c, R.torso, 0, tWaist, 1, 1, col, weave, { weaveA: o.denim ? 0.45 : 0.3 });
  if (o.botPrint) printPattern(c, R.torso, 0, tWaist, 1, 1, o.botPrint, col, o.accent);
  if (skirt) {
    fabric(c, R.skirt, 0, 0, 1, 1, col, weave);
    if (o.botPrint) printPattern(c, R.skirt, 0, 0, 1, 1, o.botPrint, col, o.accent);
    // legs inside the skirt: same cloth (never shows skin through), dark at depth
    const hemLeg = o.bottom === 'skirt_knee' ? legT(0.5) : o.bottom === 'skirt_long' ? legT(0.3) : legT(0.1);
    fabric(c, R.leg, 0, 0, 1, hemLeg, shadeHex(col, 0.7), weave);
    // hem: band + folds
    P.band(R.skirt, 0.95, 1, shade(col, 0.8), 0.9);
    for (let i = 0; i < 14; i++) {
      const s = r();
      P.line(R.skirt, [[s, 0.1 + r() * 0.2], [s + (r() - 0.5) * 0.03, 1]], shade(col, 0.72), 3 + r() * 4, 0.22);
      P.line(R.skirt, [[s + 0.02, 0.2 + r() * 0.2], [s + 0.02 + (r() - 0.5) * 0.03, 1]], shade(col, 1.12), 2 + r() * 3, 0.12);
    }
    // wrap overlap fold at the front-left (Thai sarong tuck)
    if (o.bottom !== 'skirt_knee') {
      P.line(R.skirt, [[0.62, 0], [0.6, 1]], shade(col, 0.6), 3, 0.5);
      P.line(R.torso, [[0.57, tWaist], [0.63, tWaist + 0.03], [0.6, 1]], shade(col, 0.6), 2.5, 0.5);
      // waist roll (the sarong is rolled down at the waist)
      P.band(R.torso, tWaist, tWaist + 0.035, shade(col, 0.82), 1);
      P.line(R.torso, [[0, tWaist + 0.036], [1, tWaist + 0.036]], shade(col, 0.6), 1.5, 0.6);
    }
  } else {
    const hem = o.bottom === 'trousers' ? 1 : o.bottom === 'loose' ? 1 : o.bottom === 'knee' ? legT(0.5) : legT(0.64);
    fabric(c, R.leg, 0, 0, 1, hem, col, weave, { weaveA: o.denim ? 0.45 : 0.3 });
    if (o.denim) {
      P.pattern(R.leg, noiseTile(5, 8, 3), 0.25, 0, 0, 1, hem, 0.5, 'screen');
      P.blob(R.leg, 0.5, legT(0.75), 0.12, 0.12, mix(col, '#b8c4d0', 0.5), 0.35);
      P.blob(R.leg, 0.5, legT(0.5), 0.08, 0.05, mix(col, '#b8c4d0', 0.5), 0.25);
    }
    // hem band, knee/crotch folds, side seam
    P.band(R.leg, hem - 0.018, hem, shade(col, 0.82), 1);
    for (let i = 0; i < 5; i++) P.line(R.leg, [[0.35 + r() * 0.3, legT(0.55) + r() * 0.04], [0.42 + r() * 0.2, legT(0.5) + r() * 0.03]], shade(col, 0.7), 2.5, 0.35);
    for (let i = 0; i < 4; i++) P.line(R.leg, [[0.15 + r() * 0.15, legT(0.95)], [0.3 + r() * 0.1, legT(0.86)]], shade(col, 0.72), 2, 0.3);
    P.line(R.leg, [[0.75, 0], [0.75, hem]], shade(col, 0.75), 1.2, 0.5);
    if (o.bottom === 'loose') for (let i = 0; i < 10; i++) { const s = r(); P.line(R.leg, [[s, r() * 0.3], [s + (r() - 0.5) * 0.05, hem]], shade(col, 0.74), 3, 0.25); }
    // fly + waistband + belt loops
    P.line(R.torso, [[0.5, tWaist], [0.5, torsoT(0.86)]], shade(col, 0.6), 1.4, 0.7);
  }
  // waistband / belt (not on wraps)
  if (!skirt || o.bottom === 'skirt_knee') {
    P.band(R.torso, tWaist - 0.004, tWaist + 0.03, o.school || o.nameTag || o.collar === 'shirt' ? '#2a211b' : shade(col, 0.85), 1);
    if (o.school || o.nameTag || o.collar === 'shirt') { const [bx, by] = P.pt(R.torso, 0.5, tWaist + 0.013); P.g.fillStyle = '#8a7a5a'; P.g.fillRect(bx - 8, by - 6, 16, 12); }
  }
  if (o.waistCloth) {
    // ผ้าขาวม้า: checked cloth tied around the waist
    const t0 = tWaist - 0.02, t1 = tWaist + 0.06;
    fabric(c, R.torso, 0, t0, 1, t1, '#efe6d6', 'plain');
    printPattern(c, R.torso, 0, t0, 1, t1, 'gingham', o.accent || '#a8433a', '#2f4f8a');
    P.line(R.torso, [[0, t1], [1, t1]], shade('#3a3a3a', 1), 1.5, 0.5);
    P.blob(R.torso, 0.62, t1 + 0.02, 0.03, 0.05, shadeHex(o.accent || '#a8433a', 0.8), 0.8);
  }
  if (o.apron) {
    // market vendor apron: front panel from the chest to the knee, pocket, ties
    const ac = o.accent || '#3e5c8a';
    fabric(c, R.torso, 0.39, torsoT(1.3), 0.61, 1, ac, 'plain');
    fabric(c, R.skirt, 0.4, 0, 0.6, 0.62, ac, 'plain');
    P.band(R.skirt, 0.6, 0.62, shade(ac, 0.75), 1, 0.4, 0.6);
    P.line(R.torso, [[0.39, torsoT(1.3)], [0.41, 1]], shade(ac, 0.6), 2, 0.6);
    P.line(R.torso, [[0.61, torsoT(1.3)], [0.59, 1]], shade(ac, 0.6), 2, 0.6);
    P.line(R.torso, [[0.43, torsoT(1.05)], [0.57, torsoT(1.05)], [0.57, torsoT(0.94)], [0.43, torsoT(0.94)], [0.43, torsoT(1.05)]], shade(ac, 0.62), 1.5, 0.8);
    P.band(R.torso, torsoT(1.02), torsoT(0.995), shade(ac, 0.8), 1);
    P.line(R.torso, [[0.42, torsoT(1.3)], [0.36, torsoT(1.44)]], shade(ac, 0.85), 4, 1);
    P.line(R.torso, [[0.58, torsoT(1.3)], [0.64, torsoT(1.44)]], shade(ac, 0.85), 4, 1);
    // stains
    for (let i = 0; i < 6; i++) P.blob(R.torso, 0.42 + r() * 0.16, torsoT(1.15) + r() * 0.2, 0.012, 0.012, '#4a3a22', 0.25);
  }
}

// ------------------------------------------------------------------ tops
function paintTop(c) {
  const { P, M, o, r, skin, look } = c;
  const col = o.topCol;
  const T = R.torso, A = R.arm;
  const hemY = { u: 0.86, t: 0.975, l: 0.82, j: 0.78 }[o.top] ?? 0.95;
  const tucked = o.top === 't';
  const tHem = tucked ? torsoT(0.99) : torsoT(hemY + 0.004);
  const sleeveEnd = { cap: 0.065, short: 0.15, rolled: 0.33, long: 0.535 }[o.sleeve] ?? -1;
  const tSleeve = sleeveEnd > 0 ? armT(sleeveEnd) : -1;
  if (o.dress || o.shroud) {
    fabric(c, T, 0, 0, 1, 1, col, o.topFab, { drift: 1.3 });
  } else fabric(c, T, 0, 0, 1, tHem, col, o.topFab);
  if (!tucked && hemY < 0.99 && !o.bottom.startsWith('skirt')) fabric(c, R.leg, 0, 0, 1, legT(hemY + 0.004), col, o.topFab);
  if (tSleeve > 0) fabric(c, A, 0, 0, 1, tSleeve, col, o.topFab);
  if (o.print) printPattern(c, T, 0, 0, 1, tHem, o.print, col, o.accent);
  if (o.print && tSleeve > 0) printPattern(c, A, 0, 0, 1, tSleeve, o.print, col, o.accent);
  if (o.sequin) {
    printPattern(c, T, 0, 0, 1, tHem, 'sequin', col, o.accent);
    printPattern(c, A, 0, 0, 1, tSleeve, 'sequin', col, o.accent);
  }
  const neckF = torsoT(1.445), neckB = torsoT(1.468);
  const neckline = (front, back, color, cut = true) => {
    const path = (g, pnt) => {
      g.beginPath();
      const [x0, y0] = pnt.pt(T, 0, 0);
      g.moveTo(x0 - 10, y0 - 10);
      for (let i = 0; i <= 48; i++) {
        const s = i / 48;
        const k = Math.pow(Math.cos((s - 0.5) * Math.PI) ** 2, 1.4);
        const [x, y] = pnt.pt(T, s, back + (front - back) * k);
        g.lineTo(x, y);
      }
      const [x1] = pnt.pt(T, 1, 0);
      g.lineTo(x1 + 10, y0 - 10);
      g.closePath();
    };
    P.g.save(); P.clip(T, 0, 0, 1, 0.6); P.g.fillStyle = color; path(P.g, P); P.g.fill(); P.g.restore();
    if (cut) cutout(c, T, (m, cc) => { m.g.save(); m.clip(T, 0, 0, 1, 0.6); m.g.fillStyle = cc; path(m.g, m); m.g.fill(); m.g.restore(); });
  };
  const band = (front, back, color, w = 0.014) => {
    const pts = [];
    for (let i = 0; i <= 48; i++) { const s = i / 48; const k = Math.pow(Math.cos((s - 0.5) * Math.PI) ** 2, 1.4); pts.push([s, back + (front - back) * k + w * 0.5]); }
    P.line(T, pts, color, P.sy(T, w), 1);
  };
  switch (o.collar) {
    case 'crew': neckline(neckF + 0.006, neckB, skin); band(neckF + 0.006, neckB, shade(col, 0.86), 0.016); break;
    case 'scoop': neckline(torsoT(1.39), torsoT(1.45), skin); band(torsoT(1.39), torsoT(1.45), shade(col, 0.9), 0.01); break;
    case 'shirt': case 'mandarin': neckline(neckF + 0.004, neckB, skin);
      // collar points (painted)
      for (const sd of [-1, 1]) P.poly(T, [[0.5 + sd * 0.012, neckF + 0.006], [0.5 + sd * 0.07, neckF - 0.012], [0.5 + sd * 0.055, neckF + 0.05]], shade(col, o.collar === 'shirt' ? 1.04 : 0.95), 1);
      band(neckF + 0.004, neckB, shade(col, 0.75), 0.006);
      break;
    case 'tank': {
      neckline(torsoT(1.37), torsoT(1.44), skin);
      // armholes (cut the shell, paint skin)
      for (const s of [0.25, 0.75]) {
        const ell = (pp, cc) => { pp.g.save(); pp.clip(T); pp.g.fillStyle = cc; const [cx, cy] = pp.pt(T, s, 0.1); pp.g.beginPath(); pp.g.ellipse(cx, cy, pp.sx(T, 0.085), pp.sy(T, 0.2), 0, 0, Math.PI * 2); pp.g.fill(); pp.g.restore(); };
        ell(P, skin);
        cutout(c, T, (m, cc) => ell(m, cc));
        P.blob(T, s, 0.32, 0.07, 0.03, shadeHex(col, 0.75), 0.4);
      }
      // ribbed edge
      for (const s of [0.25, 0.75]) { const [cx, cy] = P.pt(T, s, 0.1); P.g.save(); P.clip(T); P.g.strokeStyle = shade(col, 0.88); P.g.lineWidth = 3; P.g.beginPath(); P.g.ellipse(cx, cy, P.sx(T, 0.085), P.sy(T, 0.2), 0, 0, Math.PI * 2); P.g.stroke(); P.g.restore(); }
      break;
    }
    case 'hood': {
      neckline(neckF + 0.004, neckB, skin);
      // hood gathered behind the neck, drawstrings, kangaroo pocket
      P.blob(T, 0.0, 0.05, 0.12, 0.1, shadeHex(col, 0.75), 0.9, true);
      for (const s of [0.47, 0.53]) P.line(T, [[s, neckF + 0.01], [s + (s - 0.5) * 0.4, torsoT(1.28)]], '#d8d4ca', 2.5, 0.9);
      P.line(T, [[0.4, torsoT(0.95)], [0.42, torsoT(1.1)], [0.58, torsoT(1.1)], [0.6, torsoT(0.95)]], shade(col, 0.65), 2, 0.8);
      P.band(T, tHem - 0.04, tHem, shade(col, 0.85), 1);
      if (tSleeve > 0) P.band(A, tSleeve - 0.05, tSleeve, shade(col, 0.85), 1);
      break;
    }
    case 'lapel': {
      // singer's jacket: open over a white shirt, lapels
      const vb = torsoT(1.2);
      P.poly(T, [[0.42, neckF - 0.02], [0.58, neckF - 0.02], [0.5, vb]], '#ece8de', 1);
      neckline(neckF + 0.004, neckB, skin);
      for (const sd of [-1, 1]) {
        P.poly(T, [[0.5 + sd * 0.08, neckF - 0.02], [0.5 + sd * 0.12, torsoT(1.34)], [0.5, vb]], o.accent || shade(col, 0.6), 0.9);
        P.line(T, [[0.5 + sd * 0.08, neckF - 0.02], [0.5 + sd * 0.12, torsoT(1.34)], [0.5, vb]], shade(col, 0.5), 2, 0.9);
      }
      P.line(T, [[0.5, vb], [0.5, 1]], shade(col, 0.45), 1.8, 0.9);
      for (const t of [torsoT(1.1), torsoT(1.0)]) P.dot(T, 0.52, t, 3, o.accent || '#d8c890');
      P.band(A, armT(0.5), armT(0.535), '#ece8de', 1);
      break;
    }
    case 'robe': case 'sabai': {
      // drape over the LEFT shoulder: right shoulder and upper right chest/back bare
      const low = o.collar === 'sabai' ? 0.06 : 0;
      const edge = (s) => { // t of the robe's upper edge at s (0.25 = right side)
        const ss = ((s % 1) + 1) % 1;
        if (ss >= 0.25 && ss <= 0.6) return Math.max(0, 0.44 + low - ((ss - 0.25) / 0.35) * (0.44 + low));
        if (ss < 0.25) return Math.max(0, 0.44 + low - ((0.25 - ss) / 0.3) * (0.44 + low));
        if (ss > 0.95) return Math.max(0, 0.44 + low - ((1.25 - ss) / 0.3) * (0.44 + low));
        return 0;
      };
      const shape = (pp, cc) => {
        pp.g.save(); pp.clip(T); pp.g.fillStyle = cc; pp.g.beginPath();
        const [x0, y0] = pp.pt(T, 0, 0);
        pp.g.moveTo(x0 - 10, y0 - 10);
        for (let i = 0; i <= 64; i++) { const s = i / 64; const [x, y] = pp.pt(T, s, edge(s)); pp.g.lineTo(x, y); }
        const [x1] = pp.pt(T, 1, 0);
        pp.g.lineTo(x1 + 10, y0 - 10); pp.g.closePath(); pp.g.fill(); pp.g.restore();
      };
      shape(P, skin);
      cutout(c, T, shape);
      // re-establish skin form on the bare shoulder
      AO(c, T, 0.25, torsoT(1.36), 0.05, 0.08, 0.35);
      // folds of the drape: diagonal from the left shoulder to the right hip
      const ec = o.collar === 'sabai' ? o.accent || '#c9a347' : shadeHex(col, 0.7);
      const pts = []; for (let i = 0; i <= 64; i++) { const s = i / 64; pts.push([s, edge(s) + 0.012]); }
      P.line(T, pts, ec, o.collar === 'sabai' ? 7 : 3, 0.9);
      if (o.collar === 'sabai') {
        const pts2 = []; for (let i = 0; i <= 64; i++) { const s = i / 64; pts2.push([s, edge(s) + 0.03]); }
        P.line(T, pts2, shade(ec, 0.8), 2, 0.8);
        printPattern(c, T, 0, 0, 1, tHem, 'silkSheen', col, ec);
      } else {
        for (let i = 0; i < 12; i++) { const t0 = 0.05 + i * 0.075; P.line(T, [[0.68 + r() * 0.04, t0 - 0.1], [0.3 + r() * 0.05, t0 + 0.15]], shade(col, 0.7), 3 + r() * 3, 0.35); }
        for (let i = 0; i < 8; i++) { const t0 = 0.1 + i * 0.1; P.line(T, [[0.9 + r() * 0.04, t0 - 0.1], [0.1 + r() * 0.05, t0 + 0.12]], shade(col, 0.75), 3, 0.3); }
        // robe is also the lower body: the sabong waist band
        P.band(T, torsoT(1.0), torsoT(0.97), shade(col, 0.8), 0.9);
      }
      break;
    }
    default: neckline(neckF, neckB, skin);
  }
  // shirt details
  if (o.placket) {
    const t0 = neckF, t1 = tHem;
    P.band(T, t0, t1, shade(col, 0.96), 1, 0.482, 0.518);
    P.line(T, [[0.482, t0], [0.482, t1]], shade(col, 0.72), 1.1, 0.8);
    const n = Math.max(3, Math.round((t1 - t0) / 0.1));
    for (let i = 0; i < n; i++) P.dot(T, 0.5, t0 + 0.03 + ((t1 - t0 - 0.05) * i) / (n - 1), 2.4, mix(col, '#ffffff', 0.5));
  }
  if (o.pocket) {
    const s = 0.6, t = torsoT(1.34), w = 0.06, h = 0.09;
    P.line(T, [[s - w / 2, t], [s - w / 2, t + h], [s + w / 2, t + h], [s + w / 2, t]], shade(col, 0.72), 1.3, 0.8);
    P.line(T, [[s - w / 2, t + 0.01], [s + w / 2, t + 0.01]], shade(col, 0.75), 1, 0.6);
  }
  if (o.school) {
    // embroidered initials + student name in navy (fictional school)
    P.text(T, 0.4, torsoT(1.34), 'ร.ร.บ.ม.', '"Sarabun"', 11, '#1f2f6a');
    P.text(T, 0.4, torsoT(1.31), look.sex === 'f' ? 'ด.ญ. มานี' : 'ด.ช. เอ็ม', '"Sarabun"', 10, '#1f2f6a');
    if (look.sex === 'f') P.poly(T, [[0.49, neckF + 0.03], [0.51, neckF + 0.03], [0.515, neckF + 0.12], [0.5, neckF + 0.14], [0.485, neckF + 0.12]], '#1f2a4a', 1);
  }
  if (o.nameTag) {
    const [bx, by] = P.pt(T, 0.4, torsoT(1.335));
    P.g.fillStyle = '#20283a'; P.g.fillRect(bx - 22, by - 7, 44, 14);
    P.text(T, 0.4, torsoT(1.335), 'สมชาย', '"Sarabun"', 10, '#e8e4d8');
    // shoulder straps (epaulettes)
    for (const s of [0.25, 0.75]) P.band(T, 0, 0.03, shade(col, 0.82), 1, s - 0.03, s + 0.03);
  }
  // sleeve hems and cuffs
  if (tSleeve > 0 && o.collar !== 'hood') {
    if (o.sleeve === 'rolled') { P.band(A, tSleeve - 0.06, tSleeve, shade(col, 0.88), 1); P.line(A, [[0, tSleeve - 0.03], [1, tSleeve - 0.03]], shade(col, 0.68), 1.4, 0.8); }
    else { P.band(A, tSleeve - 0.02, tSleeve, shade(col, 0.84), 1); P.line(A, [[0, tSleeve - 0.018], [1, tSleeve - 0.018]], shade(col, 0.66), 1, 0.7, [3, 2]); }
  }
  // hem
  if (!tucked && !o.dress) { P.band(T, tHem - 0.022, tHem, shade(col, 0.86), 1); P.line(T, [[0, tHem - 0.018], [1, tHem - 0.018]], shade(col, 0.66), 1, 0.6, [3, 2]); }
  else if (tucked) for (let i = 0; i < 10; i++) P.line(T, [[i / 10 + 0.02, tHem - 0.06], [i / 10 + 0.04, tHem]], shade(col, 0.72), 1.4, 0.4);
  // seams with stitching (side seams, shoulder seams)
  if (!o.robe && !o.sabai) {
    for (const ss of [0.25, 0.75]) { P.line(T, [[ss, 0.12], [ss, tHem]], shade(col, 0.72), 1.1, 0.7); P.line(T, [[ss + 0.006, 0.12], [ss + 0.006, tHem]], shade(col, 1.15), 0.5, 0.5, [2, 2]); }
    if (tSleeve > 0) { P.line(A, [[0, 0.02], [1, 0.02]], shade(col, 0.72), 1, 0.6); P.line(A, [[0.25, 0], [0.25, tSleeve]], shade(col, 0.75), 0.8, 0.5, [2, 2]); }
  }
  // folds / AO on the top: armpits, chest pull, back
  P.blob(T, 0.25, torsoT(1.34), 0.06, 0.07, shadeHex(col, 0.55), 0.4);
  P.blob(T, 0.75, torsoT(1.34), 0.06, 0.07, shadeHex(col, 0.55), 0.4);
  for (let i = 0; i < 8; i++) { const s = r(); P.line(T, [[s, torsoT(1.25)], [s + (r() - 0.5) * 0.05, tHem - 0.03]], shade(col, 0.78), 2.5, 0.22); }
  if (tSleeve > 0) { P.blob(A, 0.75, armT(0.29), 0.08, 0.03, shadeHex(col, 0.6), tSleeve > armT(0.3) ? 0.4 : 0); P.blob(A, 0.0, armT(0.02), 0.12, 0.06, shadeHex(col, 0.6), 0.35, true); }
  if (o.faded) { P.pattern(T, noiseTile(3, 2, 77), 0.35 * o.faded, 0, 0, 1, tHem, 1.4, 'screen'); P.blob(T, 0.25, torsoT(1.3), 0.06, 0.1, '#6a6a5a', 0.15); }
  if (o.dress) {
    // white dress: soft folds, slightly translucent cloth look, darker damp patches
    for (let i = 0; i < 10; i++) { const s = r(); P.line(T, [[s, torsoT(1.2)], [s + (r() - 0.5) * 0.04, 1]], shade(col, 0.8), 4, 0.22); }
  }
  void M;
}

// ------------------------------------------------------------------ prints
function printPattern(c, reg, s0, t0, s1, t1, kind, col, accent) {
  const { P, r } = c;
  if (t1 <= t0) return;
  const g = P.g;
  g.save();
  P.clip(reg, s0, t0, s1, t1);
  const [x, y, w, h] = P.rect(reg, s0, t0, s1, t1);
  const acc = accent || '#d9b25a';
  switch (kind) {
    case 'floral': {
      const n = Math.round(w * h / 380);
      for (let i = 0; i < n; i++) {
        const cx = x + r() * w, cy = y + r() * h, rr = 3 + r() * 4;
        const fc = r() < 0.5 ? mix(col, '#f2e6c8', 0.6) : mix(acc, '#ffffff', 0.2);
        g.fillStyle = fc;
        for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + r(); g.beginPath(); g.ellipse(cx + Math.cos(a) * rr * 0.7, cy + Math.sin(a) * rr * 0.7, rr * 0.55, rr * 0.35, a, 0, 7); g.fill(); }
        g.fillStyle = '#e8c040'; g.beginPath(); g.arc(cx, cy, rr * 0.25, 0, 7); g.fill();
        g.strokeStyle = rgba('#3a5a2a', 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(cx + rr, cy); g.quadraticCurveTo(cx + rr * 2, cy + rr, cx + rr * 2.5, cy + rr * 0.3); g.stroke();
      }
      break;
    }
    case 'smallfloral': {
      const n = Math.round(w * h / 160);
      for (let i = 0; i < n; i++) {
        const cx = x + r() * w, cy = y + r() * h;
        g.fillStyle = r() < 0.5 ? rgba(acc, 0.7) : rgba('#7a8a9a', 0.6);
        for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * 1.6, cy + Math.sin(a) * 1.6, 1.3, 0, 7); g.fill(); }
      }
      break;
    }
    case 'batik': {
      // horizontal motif bands: dots, scroll curves, a hem border
      const bandH = 26;
      for (let yy = y; yy < y + h; yy += bandH) {
        g.strokeStyle = rgba(acc, 0.55); g.lineWidth = 1.6;
        for (let xx = x; xx < x + w; xx += 18) {
          g.beginPath(); g.arc(xx + 9, yy + 13, 6, Math.PI * 0.2, Math.PI * 1.6); g.stroke();
          g.fillStyle = rgba(mix(acc, '#f0e2c0', 0.5), 0.6); g.beginPath(); g.arc(xx + 9, yy + 13, 1.6, 0, 7); g.fill();
        }
        g.fillStyle = rgba(shadeHex(col, 0.7), 0.6); g.fillRect(x, yy + bandH - 3, w, 2);
      }
      g.fillStyle = rgba(acc, 0.5); g.fillRect(x, y + h - 22, w, 10);
      break;
    }
    case 'plaid': case 'gingham': {
      const step = kind === 'gingham' ? 14 : 22;
      const c2 = accent || '#7a2a2a';
      for (let xx = x; xx < x + w; xx += step) { g.fillStyle = rgba(c2, kind === 'gingham' ? 0.45 : 0.35); g.fillRect(xx, y, step * 0.45, h); }
      for (let yy = y; yy < y + h; yy += step) { g.fillStyle = rgba(c2, kind === 'gingham' ? 0.45 : 0.35); g.fillRect(x, yy, w, step * 0.45); }
      if (kind === 'plaid') { g.fillStyle = rgba('#d8d0b8', 0.35); for (let xx = x + 8; xx < x + w; xx += step * 2) g.fillRect(xx, y, 2, h); for (let yy = y + 8; yy < y + h; yy += step * 2) g.fillRect(x, yy, w, 2); }
      if (kind === 'gingham') { g.fillStyle = rgba('#2f4f8a', 0.25); for (let yy = y + 4; yy < y + h; yy += step * 2) g.fillRect(x, yy, w, 4); }
      break;
    }
    case 'sequin': {
      const n = Math.round(w * h / 9);
      for (let i = 0; i < n; i++) {
        const cx = x + r() * w, cy = y + r() * h;
        const k = 0.6 + r() * 0.9;
        g.fillStyle = shade(r() < 0.12 ? acc : col, k);
        g.beginPath(); g.arc(cx, cy, 1.8, 0, 7); g.fill();
      }
      const m = c.M.g;
      m.save(); c.M.clip(reg, s0, t0, s1, t1);
      m.globalCompositeOperation = 'lighter';
      m.fillStyle = 'rgb(0,0,128)';
      const [mx, my, mw, mh] = c.M.rect(reg, s0, t0, s1, t1);
      m.fillRect(mx, my, mw, mh);
      m.restore();
      break;
    }
    case 'silkSheen': {
      // woven gold-thread pattern of the sabai (small diamonds) + sheen streaks
      g.strokeStyle = rgba(acc, 0.35); g.lineWidth = 1;
      for (let yy = y; yy < y + h; yy += 12) for (let xx = x + ((yy / 12) % 2) * 6; xx < x + w; xx += 12) { g.beginPath(); g.moveTo(xx, yy - 3); g.lineTo(xx + 3, yy); g.lineTo(xx, yy + 3); g.lineTo(xx - 3, yy); g.closePath(); g.stroke(); }
      for (let i = 0; i < 12; i++) { g.strokeStyle = rgba('#ffffff', 0.06); g.lineWidth = 6; const xx = x + r() * w; g.beginPath(); g.moveTo(xx, y); g.lineTo(xx + 20, y + h); g.stroke(); }
      break;
    }
    default: break;
  }
  g.restore();
}

// ------------------------------------------------------------------ shoes & feet
function paintShoes(c) {
  const { P, M, o, r, skin } = c;
  const kind = o.shoes;
  const F = R.foot;
  if (kind === 'barefoot') {
    // dirty soles
    P.band(F, 0, 1, '#4a3a2c', 0.35, 0, 0.1); P.band(F, 0, 1, '#4a3a2c', 0.35, 0.9, 1);
    return;
  }
  if (kind === 'sandals') {
    // flip-flops: rubber sole edge + thong strap
    const sc = r.pick ? r.pick(['#2a2a2c', '#7a3a2a', '#2f4f6a']) : '#2a2a2c';
    P.band(F, 0, 1, sc, 1, 0, 0.1); P.band(F, 0, 1, sc, 1, 0.9, 1);
    P.line(F, [[0.32, 0.45], [0.5, 0.82], [0.68, 0.45]], sc, 6, 1);
    M.fill(F, 'rgb(0,150,0)', 0, 0, 1, 0.1); M.fill(F, 'rgb(0,150,0)', 0, 0, 1, 1);
    void skin;
    return;
  }
  // closed shoes (shell): leather / school shoes; socks above
  const sc = kind === 'school' ? '#141210' : '#231d18';
  fabric(c, F, 0, 0, 1, 1, sc, null, { rough: ROUGH.leather, drift: 0.6 });
  P.blob(F, 0.5, 0.75, 0.2, 0.2, '#ffffff', 0.12);
  P.line(F, [[0.35, 0.55], [0.65, 0.55]], shade(sc, 1.6), 1.2, 0.6);
  P.band(F, 0, 1, '#0a0908', 1, 0, 0.08); P.band(F, 0, 1, '#0a0908', 1, 0.92, 1);
  // socks on the lower leg
  const sock = kind === 'school' ? '#e8e6e0' : '#2a2a2c';
  if (o.bottom === 'knee' || o.bottom === 'shorts' || o.bottom === 'skirt_knee') fabric(c, R.leg, 0, legT(0.22), 1, 1, sock, 'rib');
}

// ------------------------------------------------------------------ hair strands (hair geometry samples this region)
function paintHair(c) {
  const { P, M, look } = c;
  const hc = look.hair.color;
  const H = R.hair;
  P.fill(H, hc);
  P.pattern(H, strandTile(), 0.55, 0, 0, 1, 1, 0.6, 'overlay');
  // roots darker near the crown parting, sheen bands, painterly strands
  P.blob(H, 0.5, 0.0, 0.6, 0.15, shadeHex(hc, 0.6), 0.5);
  const hi = lum(hc) < 0.2 ? mix(hc, '#8a7f74', 0.45) : mix(hc, '#ffffff', 0.25);
  for (let i = 0; i < 1400; i++) {
    const s = P.rng(), t = P.rng();
    P.line(H, [[s, t], [s + (P.rng() - 0.5) * 0.008, Math.min(1, t + 0.04 + P.rng() * 0.14)]], P.rng() < 0.45 ? hi : shadeHex(hc, 0.62), 0.35 + P.rng() * 0.6, 0.3 + P.rng() * 0.3);
  }
  P.band(H, 0.18, 0.24, hi, 0.18);
  if (look.old > 0.2 && lum(hc) < 0.3) for (let i = 0; i < 120 * look.old; i++) { const s = P.rng(), t = P.rng() * 0.6; P.line(H, [[s, t], [s, t + 0.06]], '#b8b2a8', 1, 0.5); }
  M.fill(H, `rgb(0,${Math.round((look.hair.wet > 0.3 ? 0.22 : ROUGH.hair) * 255)},0)`);
}

// ------------------------------------------------------------------ grime / ghost stains
function paintGrime(c) {
  const { P, look, r } = c;
  // everyday wear: dust at the hems, darker hands/feet
  P.band(R.leg, 0.92, 1, '#3a2f24', 0.12);
  P.blob(R.hand, 0.5, 0.9, 0.5, 0.2, '#3a2f24', 0.06);
  const gh = look.ghost;
  if (!gh) return;
  if (gh.wet > 0.2) {
    // damp cloth: darker blotches running down
    for (let i = 0; i < 12; i++) P.blob(R.torso, r(), r(), 0.06, 0.12, '#5a6a70', 0.18 * gh.wet, true);
    for (let i = 0; i < 8; i++) P.blob(R.skirt, r(), r(), 0.05, 0.2, '#5a6a70', 0.2 * gh.wet, true);
  }
  if (gh.bloodStains > 0) {
    const bl = '#5a1410';
    for (let i = 0; i < 5; i++) P.blob(R.torso, 0.3 + r() * 0.3, r() * 0.5, 0.02 + r() * 0.03, 0.03 + r() * 0.05, bl, 0.6 * gh.bloodStains * 4);
    P.blob(R.leg, 0.5, legT(0.5), 0.05, 0.06, bl, 0.5 * gh.bloodStains * 4);
    P.blob(R.arm, 0.75, armT(0.4), 0.05, 0.05, bl, 0.4 * gh.bloodStains * 4);
  }
  if (gh.decay > 0) { for (const reg of [R.torso, R.leg, R.arm, R.hand]) P.pattern(reg, noiseTile(4, 6, 99), 0.4 * gh.decay, 0, 0, 1, 1, 0.8, 'multiply'); }
}
