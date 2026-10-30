// Painterly procedural face texture (no photos). Painted in face-region space (s,t ∈ 0..1,
// the GLB head's front projection: s = 0.5 + x / FW, t = 0.44 + (eyeY - y) / FW, FW = iod/0.28;
// eyes at (0.36,0.44)/(0.64,0.44)); mouth, nose and chin positions are measured from the mesh.
// Static content only: skin variation, form shading, brows, lids/creases, lips, ears, facial
// hair, age, ghost pallor/veins. Eye apertures, lash line and the mouth interior are shader-driven.
import * as THREE from 'three';
import { makeRng, clamp } from '../../core/math.js';
import { hexToRgb, css, mix, shadeHex, noiseTile, strandTile } from './painter.js';

const cache = new Map();

export function getFaceTexture(look, t, key, S = 1024) {
  const k = key + '|' + t.sex + '|' + S;
  let e = cache.get(k);
  if (e) { e.refs++; return e; }
  const cv = paintFace(look, t, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  e = { tex, refs: 1, key: k, canvas: cv };
  cache.set(k, e);
  return e;
}
export function releaseFace(e) {
  if (!e) return;
  if (--e.refs <= 0) { e.tex.dispose(); cache.delete(e.key); }
}

export function paintFace(look, t, S = 1024) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const r = makeRng(look.seed * 13 + 5);
  const FW = t.iod / 0.28;
  const X = (xm) => (0.5 + xm / FW) * S; // model x (m) -> px
  const Y = (ym) => (0.44 + (t.eyeMid.y - ym) / FW) * S; // model y -> px
  const M = (m) => (m / FW) * S; // metres -> px
  const ex = t.eyes[0].x, ey = t.eyeMid.y;
  const f = t.face;
  const mouthY = f.mouth.y, noseY = f.noseTip.y;
  const skin = look.skin;
  const male = look.sex === 'm';
  const age = look.age, old = look.old, child = look.child;
  const wr = clamp(look.face.wrinkles, 0, 1);
  const [sr, sg, sb] = hexToRgb(skin);
  const C = (k, a, dr = 0, dg = 0, db = 0) => css(clamp(sr * k + dr, 0, 255), clamp(sg * k + dg, 0, 255), clamp(sb * k + db, 0, 255), a);
  const blob = (x, y, rx, ry, col, a0, a1 = 0, rot = 0) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, col.replace(/[\d.]+\)$/, `${a0})`)); gr.addColorStop(1, col.replace(/[\d.]+\)$/, `${a1})`));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
  };
  const stroke = (pts, col, w, cap = 'round') => {
    g.save(); g.strokeStyle = col; g.lineWidth = w; g.lineCap = cap; g.lineJoin = 'round';
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.restore();
  };
  // ---- base + painterly variation
  g.fillStyle = skin; g.fillRect(0, 0, S, S);
  const pat = (tile, alpha, mode, scale) => { g.save(); const p = g.createPattern(tile, 'repeat'); p.setTransform(new DOMMatrix().scale(scale, scale)); g.globalAlpha = alpha; g.globalCompositeOperation = mode; g.fillStyle = p; g.fillRect(0, 0, S, S); g.restore(); };
  pat(noiseTile(4, 4, 51), 0.22, 'soft-light', S / 512);
  for (let i = 0; i < 900; i++) {
    const x = r() * S, y = r() * S, a = (r() - 0.5) * 0.8 + Math.PI / 2, l = 8 + r() * 26;
    g.strokeStyle = r() < 0.5 ? C(1.08, 0.05, 8, 4, 0) : C(0.92, 0.05, 6, -2, -4);
    g.lineWidth = 3 + r() * 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // ---- form shading (painted light from above-front)
  const dark = C(0.62, 1, -4, -10, -6), deep = C(0.48, 1, -6, -12, -6), light = C(1.12, 1, 14, 10, 6), warm = C(1.0, 1, 26, -6, -10), cool = C(0.86, 1, -8, -2, 10);
  for (const sd of [-1, 1]) {
    blob(X(sd * 0.07), Y(ey - 0.01), M(0.03), M(0.07), dark, 0.32); // temples / sides
    blob(X(sd * 0.05), Y(mouthY + 0.004), M(0.02), M(0.022), dark, 0.18); // under cheekbones
    blob(X(sd * 0.038), Y(ey - 0.025), M(0.022), M(0.013), light, 0.14); // cheekbones
    blob(X(sd * 0.04), Y(ey - 0.028), M(0.02), M(0.016), warm, 0.18 + (look.sex === 'f' ? 0.08 : 0)); // cheek warmth
    blob(X(sd * ex), Y(ey + 0.002), M(0.02), M(0.013), cool, 0.2); // eye socket (cool, deep)
    blob(X(sd * (ex - 0.012)), Y(ey + 0.006), M(0.012), M(0.009), deep, 0.25); // inner socket
    blob(X(sd * 0.012), Y(noseY + 0.012), M(0.006), M(0.02), dark, 0.25); // nose sides
    blob(X(sd * 0.075), Y(ey - 0.01), M(0.012), M(0.025), warm, 0.3); // ears
    blob(X(sd * 0.055), Y(f.chinY + 0.005), M(0.02), M(0.012), dark, 0.25); // jaw line
  }
  blob(X(0), Y(ey + 0.045), M(0.045), M(0.025), light, 0.16); // forehead
  blob(X(0), Y(ey - 0.01), M(0.006), M(0.028), light, 0.18); // nose bridge
  blob(X(0), Y(noseY), M(0.009), M(0.007), warm, 0.28); // nose tip
  blob(X(0), Y(noseY - 0.008), M(0.012), M(0.004), deep, 0.38); // under the nose
  blob(X(0), Y(mouthY - 0.012), M(0.014), M(0.005), dark, 0.32); // under the lower lip
  blob(X(0), Y(f.chinY + 0.01), M(0.014), M(0.009), light, 0.14); // chin
  blob(X(0), Y(f.chinY - 0.012), M(0.05), M(0.016), deep, 0.4); // under the chin
  // ---- ears (front projection: thin vertical strips at the sides)
  for (const sd of [-1, 1]) {
    blob(X(sd * 0.078), Y(ey - 0.012), M(0.006), M(0.02), deep, 0.35);
    stroke([[X(sd * 0.074), Y(ey + 0.005)], [X(sd * 0.079), Y(ey - 0.01)], [X(sd * 0.074), Y(ey - 0.028)]], C(0.7, 0.4), M(0.0015));
  }
  // ---- soften the broad form layer only (features below stay crisp)
  {
    const soft = document.createElement('canvas');
    soft.width = soft.height = S;
    const sg2 = soft.getContext('2d');
    sg2.filter = `blur(${(S / 1024) * 3}px)`;
    sg2.drawImage(cv, 0, 0);
    g.globalAlpha = 0.7;
    g.drawImage(soft, 0, 0);
    g.globalAlpha = 1;
  }
  // fine skin grain / pores (native resolution) + faint blemishes and freckles
  pat(noiseTile(5, 32, 61), 0.1, 'overlay', S / 1024);
  for (let i = 0; i < 260; i++) {
    const x = X(r.range(-0.07, 0.07)), y = Y(ey + r.range(-0.1, 0.07));
    g.fillStyle = r() < 0.5 ? C(0.86, 0.12 + r() * 0.1, 6, -6, -6) : C(1.08, 0.08, 10, 6, 4);
    g.beginPath(); g.arc(x, y, M(0.0002 + r() * 0.0005), 0, Math.PI * 2); g.fill();
  }
  // ---- eyelids, creases, under-eye
  const eyeW = 0.0128 * (look.face.eyeSize ?? 1);
  const crease = male ? r.range(0.2, 0.7) : r.range(0.4, 0.95);
  for (const sd of [-1, 1]) {
    const cx = X(sd * ex), cy = Y(ey);
    // upper lid skin a touch darker + warm, lower lid
    blob(cx, cy - M(0.004), M(0.016), M(0.007), C(0.86, 1, 6, -6, -6), 0.35);
    blob(cx, cy + M(0.007), M(0.014), M(0.005), C(0.8, 1, -2, -8, 4), 0.25 + old * 0.25);
    // inner corner shadow
    blob(X(sd * (ex - eyeW)), cy, M(0.004), M(0.004), deep, 0.35);
    // lid crease (double eyelid strength varies)
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12 * 2 - 1;
      pts.push([X(sd * (ex + u * eyeW * 1.02)), Y(ey + 0.0068 + 0.0024 * (1 - u * u) - u * sd * 0.0004)]);
    }
    stroke(pts, C(0.62, 0.25 + crease * 0.35, -6, -10, -8), M(0.0007));
    // under-eye bags (age)
    if (old > 0 || wr > 0.3) {
      const bp = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10 * 2 - 1; bp.push([X(sd * (ex + u * eyeW * 0.9)), Y(ey - 0.0075 - 0.003 * (1 - u * u))]); }
      stroke(bp, C(0.66, 0.25 + wr * 0.3), M(0.0008));
    }
  }
  // ---- brows
  const browCol = look.hair.style === 'shaved' && !male ? '#2a2420' : age > 65 ? mix(look.hair.color, '#8a857e', 0.4) : mix(look.hair.color, '#1a1411', 0.5);
  const browTh = male ? r.range(0.0028, 0.0042) : r.range(0.0016, 0.0024);
  const browA = (look.hair.style === 'shaved' ? 0.35 : 0.9) * (age > 70 ? 0.6 : 1);
  for (const sd of [-1, 1]) {
    const by = ey + 0.017 + r.range(-0.0015, 0.0015);
    const arch = r.range(0.0015, 0.0035) + (male ? 0 : 0.001);
    const n = 190 + (male ? 140 : 0);
    for (let i = 0; i < n; i++) {
      const u = r(); // 0 inner .. 1 outer
      const xm = sd * (ex - 0.014 + u * 0.03);
      const ym = by + arch * Math.sin(Math.PI * Math.min(1, u * 1.25)) - u * 0.002 + (r() - 0.5) * browTh * (1.2 - u * 0.6);
      const len = M(0.003 + r() * 0.003);
      const a = -Math.PI / 2 * (1 - u) * 0.6 + (sd > 0 ? -0.15 : Math.PI + 0.15) + (r() - 0.5) * 0.3;
      const x0 = X(xm), y0 = Y(ym);
      g.strokeStyle = css(...hexToRgb(browCol), browA * (0.35 + r() * 0.5) * (u < 0.15 ? 0.55 : 1));
      g.lineWidth = M(0.00022 + r() * 0.0003);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len * 0.5); g.stroke();
    }
  }
  // ---- nose: nostrils and alar creases
  const nw = 0.016 * (look.face.noseWidth ?? 1) * (male ? 1.05 : 0.95);
  for (const sd of [-1, 1]) {
    blob(X(sd * nw * 0.42), Y(noseY - 0.006), M(0.0028), M(0.0018), C(0.38, 1), 0.7, 0, sd * 0.4);
    stroke([[X(sd * nw * 0.55), Y(noseY + 0.004)], [X(sd * nw * 0.68), Y(noseY - 0.002)], [X(sd * nw * 0.5), Y(noseY - 0.007)]], C(0.62, 0.45), M(0.0009));
  }
  // ---- lips
  const lipW = 0.024 * (male ? 1.0 : 0.94);
  const lipTint = look.sex === 'f' && age > 16 ? r.range(0.15, 0.45) : 0;
  const lipCol = mix(mix(skin, '#9a4a46', 0.42 + lipTint * 0.3), '#8a3040', lipTint * 0.4);
  const upTh = 0.0042 * (male ? 0.9 : 1.05), loTh = 0.0058 * (male ? 0.95 : 1.1);
  const mx0 = X(0), my0 = Y(mouthY);
  g.save();
  g.fillStyle = lipCol;
  g.globalAlpha = 0.82;
  // upper lip with cupid's bow
  g.beginPath();
  g.moveTo(X(-lipW), my0);
  g.quadraticCurveTo(X(-lipW * 0.45), Y(mouthY + upTh * 1.05), X(-0.003), Y(mouthY + upTh * 0.85));
  g.quadraticCurveTo(mx0, Y(mouthY + upTh * 0.62), X(0.003), Y(mouthY + upTh * 0.85));
  g.quadraticCurveTo(X(lipW * 0.45), Y(mouthY + upTh * 1.05), X(lipW), my0);
  g.quadraticCurveTo(mx0, Y(mouthY + 0.0006), X(-lipW), my0);
  g.fill();
  // lower lip
  g.globalAlpha = 0.72;
  g.beginPath();
  g.moveTo(X(-lipW * 0.92), Y(mouthY - 0.0004));
  g.quadraticCurveTo(mx0, Y(mouthY - loTh * 1.6), X(lipW * 0.92), Y(mouthY - 0.0004));
  g.quadraticCurveTo(mx0, Y(mouthY - 0.0012), X(-lipW * 0.92), Y(mouthY - 0.0004));
  g.fill();
  g.restore();
  blob(mx0, Y(mouthY - loTh * 0.7), M(lipW * 0.4), M(0.0016), C(1.25, 1, 20, 14, 12), 0.22);
  // vermilion border (light rim above the upper lip) and fine vertical lip lines
  {
    const rim = [];
    for (let i = 0; i <= 24; i++) { const u = i / 24 * 2 - 1; const bow = Math.abs(u) < 0.18 ? 0.62 + Math.abs(u) * 1.2 : 1.05 - (Math.abs(u) - 0.18) * 0.9; rim.push([X(u * lipW), Y(mouthY + upTh * Math.max(0.05, bow) + 0.0004)]); }
    stroke(rim, C(1.18, 0.35, 16, 12, 10), M(0.0006));
    g.save(); g.globalAlpha = 0.18; g.strokeStyle = css(90, 40, 36, 1); g.lineWidth = M(0.00018);
    for (let i = 0; i < 46; i++) {
      const u = (i / 45) * 2 - 1, x = X(u * lipW * 0.85);
      const up = r() < 0.5;
      g.beginPath(); g.moveTo(x, Y(mouthY + (up ? 0.0008 : -0.0008))); g.lineTo(x + M(0.0002) * (r() - 0.5), Y(mouthY + (up ? upTh * 0.7 : -loTh * 0.9) * (1 - u * u))); g.stroke();
    }
    g.restore();
  }
  // mouth line (deepest at the corners)
  const ml = [];
  for (let i = 0; i <= 16; i++) { const u = i / 16 * 2 - 1; ml.push([X(u * lipW * 1.02), Y(mouthY + 0.0004 * (1 - u * u) - Math.abs(u) ** 3 * 0.0006 + look.face.smile * 0.0012 * u * u)]); }
  stroke(ml, css(55, 22, 18, 0.75), M(0.0009));
  for (const sd of [-1, 1]) blob(X(sd * lipW * 1.05), Y(mouthY - 0.0005), M(0.0025), M(0.0025), C(0.5, 1), 0.45);
  // philtrum
  for (const sd of [-1, 1]) stroke([[X(sd * 0.0035), Y(noseY - 0.009)], [X(sd * 0.0042), Y(mouthY + upTh)]], C(0.9, 0.35, 10, 8, 6), M(0.0012));
  // ---- age: wrinkles, folds, spots
  if (wr > 0.15) {
    const wa = (a) => C(0.66, a);
    // forehead lines
    for (let k = 0; k < 3 + Math.round(wr * 2); k++) {
      const yy = ey + 0.035 + k * 0.009 + r.range(-0.001, 0.001);
      const pts = []; for (let i = 0; i <= 10; i++) { const u = i / 10 * 2 - 1; pts.push([X(u * (0.035 - k * 0.002)), Y(yy + 0.0015 * Math.sin(u * 2 + k))]); }
      stroke(pts, wa(0.12 + wr * 0.22), M(0.0008));
      const hp = pts.map(([x, y]) => [x, y - M(0.0012)]); stroke(hp, C(1.15, 0.08 + wr * 0.08), M(0.0008));
    }
    // frown lines between the brows
    for (const sd of [-1, 1]) stroke([[X(sd * 0.004), Y(ey + 0.012)], [X(sd * 0.0055), Y(ey + 0.024)]], wa(0.15 + wr * 0.2), M(0.0008));
    // crow's feet
    for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) stroke([[X(sd * (ex + 0.015)), Y(ey + 0.002 - k * 0.003)], [X(sd * (ex + 0.025)), Y(ey + 0.005 - k * 0.0055)]], wa(0.12 + wr * 0.25), M(0.0007));
    // nasolabial folds and marionette lines
    for (const sd of [-1, 1]) {
      stroke([[X(sd * nw * 0.7), Y(noseY - 0.002)], [X(sd * (lipW + 0.006)), Y(mouthY + 0.004)], [X(sd * (lipW + 0.007)), Y(mouthY - 0.006)]], wa(0.2 + wr * 0.35), M(0.0013 + wr * 0.0008));
      stroke([[X(sd * (nw * 0.75 + 0.0015)), Y(noseY - 0.001)], [X(sd * (lipW + 0.0075)), Y(mouthY + 0.004)]], C(1.14, 0.12 + wr * 0.1), M(0.0012));
      if (wr > 0.5) stroke([[X(sd * (lipW + 0.002)), Y(mouthY - 0.003)], [X(sd * (lipW + 0.004)), Y(mouthY - 0.016)]], wa(wr * 0.25), M(0.001));
      // jowl / sag shading
      blob(X(sd * 0.04), Y(mouthY - 0.016), M(0.014), M(0.01), C(0.6, 1), 0.18 * wr);
    }
    // age spots
    for (let i = 0; i < 18 * old; i++) blob(X(r.range(-0.06, 0.06)), Y(ey + r.range(-0.04, 0.06)), M(0.0015 + r() * 0.002), M(0.0015 + r() * 0.002), C(0.7, 1, -8, -14, -20), 0.35);
  }
  // child: rounder softer cheeks
  if (child > 0.3) for (const sd of [-1, 1]) blob(X(sd * 0.036), Y(mouthY + 0.014), M(0.018), M(0.014), warm, 0.18 * child);
  // ---- facial hair (stubble / moustache) for adult men
  if (male && age >= 20) {
    const st = look.face.stubble ?? (look.id === 'monk' ? 0.15 : r.range(0.15, 0.55));
    const hc = age > 60 ? mix(look.hair.color, '#7a766f', 0.4) : '#1f1a17';
    const [hr, hg, hb] = hexToRgb(hc);
    g.save();
    g.beginPath();
    g.ellipse(X(0), Y(mouthY - 0.012), M(0.05), M(0.04), 0, 0, Math.PI * 2);
    g.ellipse(X(0), Y(mouthY + 0.006), M(0.028), M(0.007), 0, 0, Math.PI * 2);
    g.clip('evenodd');
    for (let i = 0; i < 9000 * st; i++) {
      const x = X(r.range(-0.05, 0.05)), y = Y(mouthY + r.range(-0.052, 0.012));
      if (Math.hypot((x - mx0) / M(lipW * 1.05), (y - my0) / M(0.006)) < 1) continue;
      g.fillStyle = css(hr, hg, hb, 0.1 + r() * 0.12);
      g.fillRect(x, y, M(0.00045), M(0.00045));
    }
    g.restore();
    if (look.face.mustache ?? (age > 40 && r() < 0.35)) {
      g.fillStyle = css(hr, hg, hb, 0.55);
      g.beginPath(); g.moveTo(X(-lipW * 0.95), Y(mouthY + 0.0015)); g.quadraticCurveTo(X(0), Y(noseY - 0.004), X(lipW * 0.95), Y(mouthY + 0.0015)); g.quadraticCurveTo(X(0), Y(mouthY + 0.004), X(-lipW * 0.95), Y(mouthY + 0.0015)); g.fill();
    }
  }
  // ---- moles
  const moles = r.int(0, 2);
  for (let i = 0; i < moles; i++) blob(X(r.range(-0.045, 0.045)), Y(ey - r.range(0.0, 0.06)), M(0.0012), M(0.0012), css(60, 36, 26, 1), 0.75);
  // ---- hairline: hair roots darkening the top of the forehead and the temples
  const hs = look.hair.style;
  if (hs !== 'bald' && hs !== 'shaved') {
    const hc = look.hair.color;
    const [hr, hg, hb] = hexToRgb(hc);
    const top = Y(ey + 0.064);
    const grad = g.createLinearGradient(0, top - M(0.012), 0, top + M(0.006));
    grad.addColorStop(0, css(hr, hg, hb, 0.85)); grad.addColorStop(1, css(hr, hg, hb, 0));
    g.fillStyle = grad; g.fillRect(0, 0, S, top + M(0.006));
    // sideburns / temple hair
    for (const sd of [-1, 1]) blob(X(sd * 0.068), Y(ey + 0.012), M(0.008), M(0.028), css(hr, hg, hb, 1), male ? 0.55 : 0.35);
  } else if (hs === 'shaved') {
    g.save(); g.globalAlpha = 0.25; g.fillStyle = mix(skin, '#3a3a40', 0.5); g.fillRect(0, 0, S, Y(ey + 0.066)); g.restore();
  }
  // ---- ghost
  const gh = look.ghost;
  if (gh) {
    if (gh.pale > 0) {
      // bruised, sunken sockets, bluish lips, veins at the temples
      for (const sd of [-1, 1]) blob(X(sd * ex), Y(ey), M(0.022), M(0.017), css(70, 55, 85, 1), 0.35 * gh.pale);
      g.save(); g.globalAlpha = 0.25 * gh.pale; g.globalCompositeOperation = 'color'; g.fillStyle = '#5a6a8a';
      g.beginPath(); g.ellipse(mx0, my0, M(lipW * 1.1), M(0.007), 0, 0, Math.PI * 2); g.fill(); g.restore();
      for (let k = 0; k < 10; k++) {
        const sd = k % 2 ? 1 : -1;
        let x = sd * r.range(0.05, 0.07), y = ey + r.range(-0.02, 0.04);
        const pts = [[X(x), Y(y)]];
        for (let i = 0; i < 6; i++) { x += sd * r.range(-0.002, 0.004); y += r.range(-0.006, 0.002); pts.push([X(x), Y(y)]); }
        stroke(pts, css(60, 80, 110, 0.18 * gh.pale), M(0.0006));
      }
    }
    if (gh.wet > 0) for (let i = 0; i < 14; i++) {
      const x = X(r.range(-0.06, 0.06)), y = Y(ey + r.range(-0.01, 0.06));
      stroke([[x, y], [x + r.range(-3, 3), y + M(r.range(0.01, 0.04))]], css(255, 255, 255, 0.05 * gh.wet), M(0.0015));
    }
    if (gh.bloodStains > 0) {
      const bs = Math.min(1, gh.bloodStains * 1.8);
      const drip = (x0, y0, len, w) => {
        const pts = []; let x = x0;
        for (let i = 0; i <= 12; i++) { x += r.range(-0.0005, 0.0005); pts.push([X(x), Y(y0 - (len * i) / 12)]); }
        stroke(pts, css(36, 14, 10, 0.75), M(w * 1.35)); // dried rim
        stroke(pts, css(78, 10, 8, 0.9), M(w));
        stroke(pts.map(([a, b]) => [a - M(w * 0.2), b]), css(140, 40, 34, 0.25), M(w * 0.3)); // wet sheen
        const [ex2, ey2] = pts[pts.length - 1];
        g.fillStyle = css(70, 8, 6, 0.95); g.beginPath(); g.arc(ex2, ey2, M(w * 0.8), 0, Math.PI * 2); g.fill();
      };
      // forehead wound + runs, tears of blood, nose and mouth
      blob(X(0.02), Y(ey + 0.05), M(0.012 * bs), M(0.016 * bs), css(80, 14, 10, 1), 0.85);
      drip(0.022, ey + 0.045, 0.07 * bs, 0.0018); drip(0.03, ey + 0.04, 0.05 * bs, 0.0012);
      if (bs > 0.3) { for (const sd of [-1, 1]) drip(sd * (ex - 0.002), ey - 0.005, 0.045 * bs, 0.0013); drip(0.005, noseY - 0.008, 0.02 * bs, 0.0012); drip(-0.008, mouthY - 0.002, 0.05 * bs, 0.0016); }
      for (let i = 0; i < 30 * bs; i++) blob(X(r.range(-0.06, 0.06)), Y(ey + r.range(-0.08, 0.06)), M(0.0008), M(0.0008), css(60, 10, 8, 1), 0.8);
    }
  }
  // inside the eye apertures (only seen at the very edges while blinking): moist pink
  for (const sd of [-1, 1]) blob(X(sd * ex), Y(ey), M(0.012), M(0.004), css(170, 110, 100, 1), 0.35);
  void strandTile; void shadeHex;
  return cv;
}
