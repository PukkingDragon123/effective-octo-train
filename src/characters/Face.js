// Painted face texture (canvas 2D, warped cylindrical UV from Head.js):
// skin tone variation with brush dabs, blush, stubble, lips, brows, lash lines,
// eye-socket shading, age wrinkles & spots, scalp tint under the hair, the eye
// tile (sclera / iris / pupil / catch-light) and ghost pallor, veins, black eyes,
// decay and blood. Also a roughness map (wet eyes and lips, oily T-zone).
import * as THREE from 'three';
import { clamp, lerp, makeRng } from '../core/math.js';
import { EYE_TILE, MOUTH_UV } from './Head.js';

const css = (c, a = 1) => `rgba(${Math.round(clamp(c[0]) * 255)},${Math.round(clamp(c[1]) * 255)},${Math.round(clamp(c[2]) * 255)},${a})`;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

export function hairRGB(spec) {
  const h = spec.hair || {};
  if (h.color !== undefined) {
    let c = h.color;
    if (typeof c === 'string') c = parseInt(c.replace('#', ''), 16);
    return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  }
  if (h.style === 'gray-short' || (spec.age ?? 30) > 70) return [0.62, 0.61, 0.58];
  if ((spec.age ?? 30) > 52) return [0.2, 0.19, 0.18];
  return [0.06, 0.055, 0.05];
}

/**
 * Paint the face. ctx: { spec, P, F, uvFn, lidMargins, skin (sRGB) }. Returns { map, roughnessMap, emissiveMap? }.
 */
export function paintFace(ctx, size = 1024) {
  const { spec, P, F, uvFn, lidMargins } = ctx;
  const W = size, H = size;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const rv = document.createElement('canvas');
  rv.width = W / 4; rv.height = H / 4;
  const rg = rv.getContext('2d');
  const rng = makeRng((F.seed ^ 0x5f3759df) >>> 0);
  const hs = F.hs;
  const ghost = spec.ghost || {};
  const age = P.age;
  const male = !P.fem;
  const skin = ctx.skin.slice();
  const t2 = [0, 0];
  const px = (x, y, z) => {
    uvFn(x, y, z, t2);
    return [t2[0] * W, (1 - t2[1]) * H];
  };
  // pixels per metre on the face (approx) for sizing strokes
  const ppm = (() => {
    const a = px(0, F.eyeY, -0.09 * hs), b = px(0.02 * hs, F.eyeY, -0.088 * hs);
    return Math.abs(b[0] - a[0]) / (0.02 * hs);
  })();
  const S = (m) => m * ppm; // metres -> px
  const dab = (x, y, r, col, a) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, css(col, a));
    grd.addColorStop(1, css(col, 0));
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const dab3 = (p, r, col, a) => {
    const [x, y] = px(p[0], p[1], p[2]);
    dab(x, y, r, col, a);
  };
  const stroke3 = (pts, width, col, a, cap = 'round') => {
    g.strokeStyle = css(col, a);
    g.lineWidth = width;
    g.lineCap = cap;
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = px(p[0], p[1], p[2]);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
  };
  // surface z of the face front at (x,y) (rough approximation for projecting painted features)
  const fz = (x, y) => {
    const r = 0.09 * hs;
    const zz = -Math.sqrt(Math.max(0, r * r - x * x * 1.6)) + 0.002 - Math.max(0, 0.02 * hs - Math.abs(y - F.eyeY)) * 0.0;
    return zz;
  };

  // ---- base skin with painterly dabs
  g.fillStyle = css(skin);
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const x = rng() * W, y = rng() * H;
    const r = (8 + rng() * 40) * (W / 1024);
    const k = rng();
    const c = k < 0.33 ? mul(skin, 1.06) : k < 0.66 ? mix(skin, [0.75, 0.42, 0.36], 0.12) : mix(skin, [0.55, 0.5, 0.42], 0.12);
    dab(x, y, r, c, 0.12 + rng() * 0.1);
  }
  // fine brush stroke texture
  g.globalAlpha = 0.05;
  for (let i = 0; i < 2500; i++) {
    const x = rng() * W, y = rng() * H;
    g.strokeStyle = css(rng() < 0.5 ? mul(skin, 0.85) : mul(skin, 1.12));
    g.lineWidth = 1 + rng() * 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rng() - 0.5) * 10, y + (rng() - 0.5) * 6);
    g.stroke();
  }
  g.globalAlpha = 1;

  const red = [0.78, 0.36, 0.32];
  const dark = mul(skin, 0.62);
  const eX = F.eyeX, eY = F.eyeY, eZ = F.eyeZ;
  // ---- regional colour
  for (const sg of [-1, 1]) {
    dab3([sg * 0.042 * hs, 0.022 * hs, -0.072 * hs], S(0.028 * hs), red, P.fem ? 0.2 : 0.12); // cheeks
    dab3([sg * 0.075 * hs, 0.045 * hs, 0.0], S(0.03 * hs), red, 0.18); // ears
    // under-eye shadow / bags
    dab3([sg * eX, eY - 0.016 * hs, eZ - 0.01 * hs], S(0.014 * hs), mix(dark, [0.4, 0.3, 0.38], 0.4), 0.22 + 0.25 * F.old);
    // upper lid crease & socket shadow
    dab3([sg * (eX + 0.002 * hs), eY + 0.012 * hs, eZ - 0.012 * hs], S(0.016 * hs), mix(dark, [0.45, 0.32, 0.3], 0.3), 0.32);
    dab3([sg * (eX - 0.016 * hs), eY + 0.002 * hs, eZ - 0.016 * hs], S(0.008 * hs), mix(dark, [0.4, 0.3, 0.3], 0.3), 0.3); // inner corner
    // temple shadow
    dab3([sg * 0.07 * hs, 0.08 * hs, -0.04 * hs], S(0.025 * hs), dark, 0.12);
  }
  dab3([0, F.noseTipY, -0.11 * hs], S(0.013 * hs), red, 0.18);
  dab3([0, F.browY + 0.04 * hs, -0.09 * hs], S(0.04 * hs), mul(skin, 1.08), 0.25); // forehead highlight
  dab3([0, F.chinY + 0.015 * hs, -0.08 * hs], S(0.018 * hs), red, 0.08);
  // under the jaw / neck shadow
  // stubble (adult men)
  if (male && age > 17 && spec.hair?.style !== 'shaved') {
    const st = mix(skin, [0.25, 0.28, 0.32], 0.5);
    const amt = spec.face?.stubble ?? (0.16 + rng() * 0.18);
    for (let i = 0; i < 260; i++) {
      const a = (rng() - 0.5) * 2.3;
      const yy = lerp(F.chinY - 0.005 * hs, F.mouthY + 0.012 * hs, rng());
      const x = Math.sin(a) * 0.06 * hs;
      if (Math.abs(x) > 0.055 * hs && yy > 0.01 * hs) continue;
      const z = -Math.cos(a) * 0.08 * hs;
      if (yy > F.mouthY - 0.004 * hs && Math.abs(x) < F.cornerX * 1.1 && yy < F.mouthY + 0.008 * hs) continue;
      dab3([x, yy, z], S(0.01 * hs), st, amt * 0.35);
    }
  }
  // ---- lips
  const lipC = P.fem ? mix(skin, [0.72, 0.3, 0.3], 0.5) : mix(skin, [0.62, 0.32, 0.3], 0.38);
  const lipC2 = ghost.pale ? mix(lipC, [0.55, 0.55, 0.6], ghost.pale * 0.8) : lipC;
  const cx = F.cornerX, my = F.mouthY, mz = F.mouthZ;
  const lipPath = (upper) => {
    const pts = [];
    const N = 24;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * 2 - 1;
      const x = t * cx;
      // cupid's bow on the upper lip
      let h;
      if (upper) h = (0.0062 * F.lipFull) * hs * (1 - Math.pow(Math.abs(t), 2.2)) + 0.0012 * hs * Math.exp(-Math.pow((Math.abs(t) - 0.28) * 6, 2)) - 0.0012 * hs * Math.exp(-t * t * 60);
      else h = -(0.0072 * F.lipFull) * hs * (1 - Math.pow(Math.abs(t), 1.8));
      pts.push([x, my + h, mz - 0.002 * hs + Math.abs(t) * 0.01 * hs]);
    }
    return pts;
  };
  const fillLip = (pts, col, a) => {
    g.fillStyle = css(col, a);
    g.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = px(p[0], p[1], p[2]);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    const [x0, y0] = px(cx, my, mz);
    g.lineTo(x0, y0);
    for (let i = 24; i >= 0; i--) {
      const t = (i / 24) * 2 - 1;
      const [x, y] = px(t * cx, my, mz - 0.002 * hs + Math.abs(t) * 0.01 * hs);
      g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  };
  g.filter = `blur(${Math.max(1, S(0.0008 * hs)).toFixed(1)}px)`;
  fillLip(lipPath(true), mul(lipC2, 0.92), 0.85);
  fillLip(lipPath(false), lipC2, 0.85);
  g.filter = 'none';
  // lower lip highlight, lip line
  dab3([0, my - 0.004 * hs, mz - 0.001], S(0.006 * hs), mix(lipC2, [1, 0.85, 0.8], 0.35), 0.35);
  const line = [];
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * 2 - 1;
    line.push([t * cx * 1.02, my + Math.sin(t * Math.PI) * 0 - 0.0003, mz - 0.002 * hs + Math.abs(t) * 0.01 * hs]);
  }
  stroke3(line, Math.max(1.5, S(0.0011 * hs)), mul(lipC2, 0.42), 0.8);
  // mouth corners
  for (const sg of [-1, 1]) dab3([sg * cx, my, mz + 0.008 * hs], S(0.004 * hs), mul(skin, 0.55), 0.5);
  // nostrils
  for (const sg of [-1, 1]) dab3([sg * 0.007 * hs * F.noseW, F.noseBaseY + 0.002 * hs, -0.101 * hs], S(0.0035 * hs), [0.22, 0.12, 0.1], 0.8);
  // ---- brows
  const monk = spec.hair?.style === 'shaved' && spec.outfit?.type === 'monk-robe';
  const hairC = hairRGB(spec);
  const browC = mix(hairC, [0.08, 0.06, 0.05], age > 70 ? 0.2 : 0.6);
  if (!monk) {
    for (const sg of [-1, 1]) {
      const n = male ? 70 : 45;
      for (let i = 0; i < n; i++) {
        const t = rng();
        const x = sg * lerp(0.009, 0.052, t) * hs;
        const arch = Math.sin(t * Math.PI * 0.9) * 0.004 * hs * (P.fem ? 1.4 : 1);
        const thick = (male ? 0.0042 : 0.0026) * hs * (1 - t * 0.55);
        const y = F.browY + 0.004 * hs + arch + (rng() - 0.5) * thick;
        const z = fz(x, y) - 0.002;
        const [ax, ay] = px(x, y, z);
        const len = S(0.005 * hs) * (0.6 + rng() * 0.6);
        const ang = (sg > 0 ? -0.35 - t * 0.6 : Math.PI + 0.35 + t * 0.6);
        g.strokeStyle = css(mul(browC, 0.8 + rng() * 0.4), 0.45 + rng() * 0.3);
        g.lineWidth = Math.max(1, S(0.0007 * hs));
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(ax + Math.cos(ang) * len, ay - Math.sin(ang) * len * 0.5);
        g.stroke();
      }
    }
  }
  // ---- lash lines along the lid margins (+ waterline)
  const lashC = [0.05, 0.04, 0.04];
  for (const sg of [-1, 1]) {
    const up = lidMargins.up.filter((m) => m[3] === sg).sort((a, b) => a[0] - b[0]);
    const lo = lidMargins.lo.filter((m) => m[3] === sg).sort((a, b) => a[0] - b[0]);
    const inside = (m) => Math.abs(m[0] - sg * eX) < 0.0112 * hs * F.eyeSize;
    stroke3(up.filter(inside), Math.max(2, S(0.0016 * hs)), lashC, 0.85);
    stroke3(up.filter(inside), Math.max(4, S(0.0034 * hs)), lashC, 0.25);
    stroke3(lo.filter(inside), Math.max(1.2, S(0.0008 * hs)), mul(dark, 0.6), 0.45);
    // caruncle / inner corner pink
    const inner = up.filter(inside).sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]))[0];
    if (inner) dab3([inner[0] - sg * 0.001, inner[1] - 0.002 * hs, inner[2]], S(0.0025 * hs), [0.75, 0.42, 0.4], 0.5);
  }
  // ---- wrinkles
  const wr = F.wrinkles;
  if (wr > 0.02) {
    const wc = mul(skin, 0.6);
    const hl = mul(skin, 1.12);
    const wline = (pts, w, a) => {
      stroke3(pts, w, wc, a);
      stroke3(pts.map((p) => [p[0], p[1] - 0.0012 * hs, p[2]]), w * 0.8, hl, a * 0.5);
    };
    // forehead lines
    for (let k = 0; k < 4; k++) {
      const y0 = F.browY + (0.018 + k * 0.011) * hs;
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = (i / 12) * 2 - 1;
        const x = t * 0.045 * hs;
        pts.push([x, y0 + Math.sin(t * 3 + k) * 0.0015 * hs + t * t * 0.004 * hs, fz(x, y0)]);
      }
      wline(pts, Math.max(1.5, S(0.0012 * hs)), 0.35 * wr);
    }
    for (const sg of [-1, 1]) {
      // crow's feet
      for (let k = 0; k < 4; k++) {
        const a = -0.5 + k * 0.33;
        const x0 = sg * (eX + 0.016 * hs), y0 = eY - 0.001 * hs;
        wline([[x0, y0, eZ - 0.006 * hs], [x0 + sg * Math.cos(a) * 0.013 * hs, y0 + Math.sin(a) * 0.01 * hs, eZ + 0.0]], Math.max(1.2, S(0.0009 * hs)), 0.45 * wr);
      }
      // nasolabial fold
      const n0 = [sg * 0.017 * hs * F.noseW, F.noseBaseY + 0.008 * hs, -0.093 * hs];
      const n1 = [sg * (cx + 0.006 * hs), my - 0.004 * hs, mz + 0.012 * hs];
      const nm = [sg * (cx + 0.01 * hs), lerp(n0[1], n1[1], 0.5), -0.085 * hs];
      wline([n0, nm, n1], Math.max(2, S(0.0018 * hs)), 0.3 + 0.35 * wr);
      // marionette
      if (wr > 0.4) wline([n1, [sg * (cx + 0.004 * hs), F.chinY + 0.012 * hs, -0.07 * hs]], Math.max(1.5, S(0.0014 * hs)), 0.4 * wr);
      // under-eye bag arc
      const bag = [];
      for (let i = 0; i <= 8; i++) {
        const t = (i / 8) * 2 - 1;
        bag.push([sg * eX + t * 0.012 * hs, eY - 0.019 * hs - (1 - t * t) * 0.004 * hs, eZ - 0.008 * hs]);
      }
      wline(bag, Math.max(1.2, S(0.001 * hs)), 0.35 * wr);
    }
    // neck lines
    for (let k = 0; k < 3; k++) {
      const y0 = F.chinY - (0.02 + k * 0.018) * hs;
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = (i / 10) * 2 - 1;
        pts.push([t * 0.045 * hs, y0 + t * t * 0.008 * hs, -0.04 * hs]);
      }
      wline(pts, Math.max(1.5, S(0.0012 * hs)), 0.3 * wr);
    }
    // age spots
    if (age > 60) {
      for (let i = 0; i < 30 * wr; i++) {
        const a = (rng() - 0.5) * 2.4, y = lerp(0.0, 0.14, rng()) * hs;
        dab3([Math.sin(a) * 0.08 * hs, y, -Math.cos(a) * 0.08 * hs], S((0.002 + rng() * 0.003) * hs), mul(skin, 0.7), 0.35);
      }
    }
  }
  // ---- scalp tint under hair / shaved stubble
  const style = spec.hair?.style || 'short';
  if (style !== 'bald') {
    const shaved = style === 'shaved';
    const hc = shaved ? mix(skin, [0.2, 0.22, 0.25], 0.32) : hairC;
    g.fillStyle = css(hc, shaved ? 0.75 : 0.95);
    g.filter = `blur(${S(0.003 * hs).toFixed(1)}px)`;
    g.beginPath();
    // hairline polygon around the head (front hairline -> temples -> above ears -> nape)
    const pts = [];
    const N = 48;
    for (let i = 0; i <= N; i++) {
      const th = -Math.PI + (i / N) * Math.PI * 2;
      const a = Math.abs(th);
      // y of the hairline at this angle
      let y;
      if (a < 0.6) y = F.browY + (0.052 - (P.fem ? 0.004 : 0) + (male && age > 45 ? 0.012 * (a < 0.35 ? 1 : 0.4) : 0)) * hs;
      else if (a < 1.25) y = lerp(F.browY + 0.05 * hs, 0.07 * hs, (a - 0.6) / 0.65);
      else if (a < 1.75) y = lerp(0.075 * hs, 0.082 * hs, (a - 1.25) / 0.5);
      else y = lerp(0.07 * hs, -0.035 * hs, (a - 1.75) / (Math.PI - 1.75));
      const r = 0.09 * hs;
      const [x, yy] = px(Math.sin(th) * r, y, -Math.cos(th) * r);
      if (i === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.lineTo(W, 0);
    g.lineTo(0, 0);
    g.closePath();
    g.fill();
    g.filter = 'none';
    // hair strand strokes on the scalp
    if (!shaved) {
      for (let i = 0; i < 1400; i++) {
        const x = rng() * W, y = rng() * (H * 0.4);
        g.strokeStyle = css(mul(hc, 0.7 + rng() * 0.7), 0.35);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (rng() - 0.5) * 4, y + 6 + rng() * 10);
        g.stroke();
      }
    } else {
      // stubble speckle
      g.globalAlpha = 0.25;
      for (let i = 0; i < 6000; i++) {
        const x = rng() * W, y = rng() * (H * 0.42);
        g.fillStyle = css(mul(hc, 0.6));
        g.fillRect(x, y, 1.2, 1.2);
      }
      g.globalAlpha = 1;
    }
  }
  // ---- ghost layers
  if (ghost.pale) {
    g.globalCompositeOperation = 'color';
    g.fillStyle = css([0.62, 0.68, 0.7], ghost.pale * 0.75);
    g.fillRect(0, 0, W, H * 0.9);
    g.globalCompositeOperation = 'source-over';
    // veins
    g.strokeStyle = css([0.32, 0.3, 0.45], 0.25 * ghost.pale);
    for (let i = 0; i < 26 * ghost.pale; i++) {
      const sg = rng() < 0.5 ? -1 : 1;
      let p = [sg * (0.05 + rng() * 0.03) * hs, (0.02 + rng() * 0.09) * hs, -0.06 * hs];
      let [x, y] = px(p[0], p[1], p[2]);
      g.lineWidth = 1 + rng();
      g.beginPath();
      g.moveTo(x, y);
      let ang = rng() * Math.PI * 2;
      for (let k = 0; k < 8; k++) {
        ang += (rng() - 0.5) * 1.2;
        x += Math.cos(ang) * 7;
        y += Math.sin(ang) * 7;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  if (ghost.eyes === 'black' || ghost.decay > 0.3) {
    for (const sg of [-1, 1]) {
      dab3([sg * eX, eY, eZ - 0.012 * hs], S(0.022 * hs), [0.06, 0.04, 0.05], ghost.eyes === 'black' ? 0.75 : 0.35);
    }
  }
  if (ghost.decay) {
    for (let i = 0; i < 40 * ghost.decay; i++) {
      const a = (rng() - 0.5) * 3, y = lerp(-0.05, 0.14, rng()) * hs;
      dab3([Math.sin(a) * 0.08 * hs, y, -Math.cos(a) * 0.08 * hs], S((0.004 + rng() * 0.012) * hs), rng() < 0.5 ? [0.32, 0.36, 0.28] : [0.25, 0.2, 0.22], 0.35 * ghost.decay);
    }
  }
  if (ghost.bloodStains) {
    const sg = rng() < 0.5 ? -1 : 1;
    for (let k = 0; k < 3; k++) {
      const x0 = sg * (0.02 + k * 0.012) * hs;
      const pts = [];
      let x = x0;
      for (let y = 0.14 * hs; y > -0.02 * hs; y -= 0.006 * hs) {
        x += (rng() - 0.5) * 0.002 * hs;
        pts.push([x, y, fz(x, y) - 0.003]);
      }
      stroke3(pts, S((0.003 + rng() * 0.003) * hs), [0.35, 0.03, 0.03], 0.7 * ghost.bloodStains);
    }
  }
  // ---- mouth interior swatch
  g.fillStyle = 'rgb(28,10,12)';
  g.fillRect(MOUTH_UV[0] * W - 24, (1 - MOUTH_UV[1]) * H - 24, 48, 48);
  // ---- eye tile
  paintEyeTile(g, W, H, spec, rng);

  // ---- roughness (G channel)
  rg.fillStyle = 'rgb(0,160,0)';
  rg.fillRect(0, 0, rv.width, rv.height);
  const rpx = (p) => { const [x, y] = px(p[0], p[1], p[2]); return [x / 4, y / 4]; };
  const rdab = (p, r, val, a) => {
    const [x, y] = rpx(p);
    const grd = rg.createRadialGradient(x, y, 0, x, y, r / 4);
    grd.addColorStop(0, `rgba(0,${val},0,${a})`);
    grd.addColorStop(1, `rgba(0,${val},0,0)`);
    rg.fillStyle = grd;
    rg.fillRect(x - r / 4, y - r / 4, r / 2, r / 2);
  };
  rdab([0, my, mz], S(0.02 * hs), 115, 0.8); // lips
  rdab([0, F.noseTipY, -0.11 * hs], S(0.015 * hs), 128, 0.6);
  rdab([0, F.browY + 0.035 * hs, -0.09 * hs], S(0.03 * hs), 138, 0.5);
  for (const sg of [-1, 1]) rdab([sg * eX, eY, eZ - 0.012 * hs], S(0.01 * hs), 95, 0.6); // wet lid margins
  const wetv = Math.round(160 - (ghost.wet || 0) * 90);
  if (ghost.wet) { rg.fillStyle = `rgba(0,${wetv},0,0.8)`; rg.fillRect(0, 0, rv.width, rv.height * 0.9); }
  rg.fillStyle = 'rgb(0,30,0)';
  rg.fillRect(EYE_TILE.u0 * rv.width, (1 - EYE_TILE.v0 - EYE_TILE.size) * rv.height, EYE_TILE.size * rv.width, EYE_TILE.size * rv.height);

  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  const roughnessMap = new THREE.CanvasTexture(rv);
  let emissiveMap = null;
  if (ghost.eyes === 'glow') {
    const ec = document.createElement('canvas');
    ec.width = ec.height = 128;
    const eg = ec.getContext('2d');
    eg.fillStyle = '#000';
    eg.fillRect(0, 0, 128, 128);
    const cxp = (EYE_TILE.u0 + EYE_TILE.size / 2) * 128, cyp = (1 - EYE_TILE.v0 - EYE_TILE.size / 2) * 128;
    const grd = eg.createRadialGradient(cxp, cyp, 0, cxp, cyp, EYE_TILE.size * 64);
    grd.addColorStop(0, '#fff');
    grd.addColorStop(0.6, '#a66');
    grd.addColorStop(1, '#000');
    eg.fillStyle = grd;
    eg.fillRect(0, 0, 128, 128);
    emissiveMap = new THREE.CanvasTexture(ec);
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
  }
  return { map, roughnessMap, emissiveMap, canvas: cv };
}

function paintEyeTile(g, W, H, spec, rng) {
  const ghost = spec.ghost || {};
  const x0 = EYE_TILE.u0 * W, y0 = (1 - EYE_TILE.v0 - EYE_TILE.size) * H, s = EYE_TILE.size * W;
  const cx = x0 + s / 2, cy = y0 + s / 2;
  const black = ghost.eyes === 'black';
  const white = ghost.eyes === 'white';
  // sclera
  g.fillStyle = black ? '#050404' : 'rgb(222,214,200)';
  g.fillRect(x0, y0, s, s);
  if (!black) {
    const grd = g.createRadialGradient(cx, cy, s * 0.2, cx, cy, s * 0.55);
    grd.addColorStop(0, 'rgba(240,232,220,0)');
    grd.addColorStop(1, 'rgba(190,140,130,0.55)');
    g.fillStyle = grd;
    g.fillRect(x0, y0, s, s);
    // veins
    g.strokeStyle = 'rgba(170,60,60,0.25)';
    g.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      g.beginPath();
      let x = cx + Math.cos(a) * s * 0.5, y = cy + Math.sin(a) * s * 0.5;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x -= Math.cos(a + (rng() - 0.5)) * s * 0.06;
        y -= Math.sin(a + (rng() - 0.5)) * s * 0.06;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  // iris
  const ir = s * 0.255;
  const irisC = white ? [0.72, 0.74, 0.76] : black ? [0.02, 0.02, 0.02] : [0.2 + rng() * 0.05, 0.11, 0.06];
  const grd = g.createRadialGradient(cx, cy, ir * 0.2, cx, cy, ir);
  grd.addColorStop(0, css(mul(irisC, 1.5)));
  grd.addColorStop(0.75, css(irisC));
  grd.addColorStop(1, css(mul(irisC, 0.35)));
  g.fillStyle = grd;
  g.beginPath();
  g.arc(cx, cy, ir, 0, Math.PI * 2);
  g.fill();
  if (!black) {
    g.strokeStyle = css(mul(irisC, white ? 0.9 : 1.8), 0.35);
    for (let i = 0; i < 60; i++) {
      const a = rng() * Math.PI * 2;
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * ir * 0.35, cy + Math.sin(a) * ir * 0.35);
      g.lineTo(cx + Math.cos(a) * ir * 0.9, cy + Math.sin(a) * ir * 0.9);
      g.stroke();
    }
    // pupil
    g.fillStyle = white ? 'rgba(160,170,175,0.9)' : '#060505';
    g.beginPath();
    g.arc(cx, cy, ir * (white ? 0.25 : 0.42), 0, Math.PI * 2);
    g.fill();
    // catch-light (painterly convention)
    g.fillStyle = 'rgba(255,255,250,0.85)';
    g.beginPath();
    g.arc(cx + ir * 0.35, cy - ir * 0.38, ir * 0.16, 0, Math.PI * 2);
    g.fill();
  }
}
