// Canvas helpers for signage & printed matter: text fitting, shapes, CJK glyphs with a
// procedural brush fallback, silhouettes, and the weathering pipeline (sun fade, grime,
// rain streaks, chips, scratches, rust bleed, moss, paper ageing, hand-painted wobble,
// painterly smear) run on the pixels with the same typed-array painter as the materials.
import { makeRng, hashString } from '../core/math.js';
import { FONTS } from '../ui/fonts.js';
import { fbm, worley, blur, drip, disc, line, crack } from './noise.js';
import { Img, strokes, sstep, rgb } from './painter.js';

export const CJK_FONT = "'Noto Serif CJK SC','Noto Serif CJK TC','Source Han Serif SC','Songti SC','STSong','SimSun','PMingLiU','MingLiU','Hiragino Mincho ProN','Noto Sans CJK SC','Microsoft YaHei',serif";

export function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  return { c, g, w, h };
}

export function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Thai digits for authentic hand-painted signs. */
export const thaiDigits = (s) => String(s).replace(/[0-9]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'[d]);

/**
 * Draw text. o: { size, weight, font, color, align, baseline, maxW (squeeze to fit), sx, sy,
 *   stroke, strokeW, rotate, alpha, shadow:{color, x, y, blur}, spacing (px, latin only) }
 * Returns the drawn width.
 */
export function text(g, s, x, y, o = {}) {
  const size = o.size ?? 48;
  g.save();
  g.font = `${o.weight ?? 600} ${size}px ${o.font ?? FONTS.sign}`;
  g.textAlign = o.align ?? 'center';
  g.textBaseline = o.baseline ?? 'middle';
  if (o.spacing && 'letterSpacing' in g) g.letterSpacing = o.spacing + 'px';
  let sx = o.sx ?? 1;
  const mw = g.measureText(s).width;
  if (o.maxW && mw * sx > o.maxW) sx = o.maxW / mw;
  g.translate(x, y);
  if (o.rotate) g.rotate(o.rotate);
  g.scale(sx, o.sy ?? 1);
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  if (o.shadow) {
    g.shadowColor = o.shadow.color ?? 'rgba(0,0,0,0.5)';
    g.shadowOffsetX = o.shadow.x ?? 2;
    g.shadowOffsetY = o.shadow.y ?? 2;
    g.shadowBlur = o.shadow.blur ?? 0;
  }
  if (o.stroke) {
    g.lineJoin = 'round';
    g.lineWidth = o.strokeW ?? size * 0.12;
    g.strokeStyle = o.stroke;
    g.strokeText(s, 0, 0);
    g.shadowColor = 'transparent';
  }
  g.fillStyle = o.color ?? '#111';
  g.fillText(s, 0, 0);
  g.restore();
  return mw * sx;
}

let _cjk = null;
/** True when the system has a CJK font (real 馬瑞 glyphs); otherwise a brush fallback is used. */
export function cjkAvailable() {
  if (_cjk !== null) return _cjk;
  try {
    const { g } = newCanvas(64, 64);
    const draw = (ch) => {
      g.clearRect(0, 0, 64, 64);
      g.font = `48px ${CJK_FONT}`;
      g.fillStyle = '#000';
      g.textBaseline = 'middle';
      g.fillText(ch, 4, 32);
      const d = g.getImageData(0, 0, 64, 64).data;
      let hsh = 0, ink = 0;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] > 128) {
          ink++;
          hsh = (hsh * 31 + i) | 0;
        }
      }
      return [hsh, ink];
    };
    const a = draw('馬'), b = draw('瑞'), t = draw('￿');
    _cjk = a[1] > 40 && a[0] !== b[0] && a[0] !== t[0];
  } catch (e) {
    _cjk = false;
  }
  return _cjk;
}

/** Brushed pseudo-character (looks like Chinese calligraphy at sign distances). */
function pseudoGlyph(g, cx, cy, size, rng, color) {
  const s = size / 2;
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineCap = 'round';
  const stroke = (x0, y0, x1, y1, wd, hook) => {
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      g.lineWidth = wd * s * (0.62 + 0.38 * Math.sin(Math.PI * (t0 * 0.85 + 0.12)));
      g.beginPath();
      g.moveTo(cx + (x0 + (x1 - x0) * t0) * s, cy + (y0 + (y1 - y0) * t0) * s);
      g.lineTo(cx + (x0 + (x1 - x0) * t1) * s, cy + (y0 + (y1 - y0) * t1) * s);
      g.stroke();
    }
    if (hook) {
      g.lineWidth = wd * s * 0.5;
      g.beginPath();
      g.moveTo(cx + x1 * s, cy + y1 * s);
      g.lineTo(cx + (x1 - 0.12) * s, cy + (y1 - 0.1) * s);
      g.stroke();
    }
  };
  const wd = 0.13 + rng() * 0.04;
  const split = rng();
  const boxes = split < 0.4 ? [[-0.85, -0.85, -0.18, 0.85], [0.02, -0.85, 0.85, 0.85]] : split < 0.7 ? [[-0.85, -0.85, 0.85, -0.12], [-0.85, 0.08, 0.85, 0.85]] : [[-0.85, -0.85, 0.85, 0.85]];
  for (const [ax, ay, bx, by] of boxes) {
    const nh = 1 + Math.floor(rng() * 3), nv = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < nh; i++) {
      const y = ay + (by - ay) * ((i + 0.5) / nh);
      stroke(ax + rng() * 0.12, y + 0.03, bx - rng() * 0.12, y - 0.05, wd);
    }
    for (let i = 0; i < nv; i++) {
      const x = ax + (bx - ax) * ((i + 0.5) / nv) + (rng() - 0.5) * 0.15;
      stroke(x, ay + rng() * 0.08, x, by - rng() * 0.08, wd * 1.05, rng() < 0.4);
    }
    if (rng() < 0.7) {
      const x0 = (ax + bx) / 2, y0 = (ay + by) / 2;
      stroke(x0, y0, x0 - (bx - ax) * 0.45, by, wd);
      if (rng() < 0.6) stroke(x0, y0, x0 + (bx - ax) * 0.45, by, wd * 1.15);
    }
    if (rng() < 0.6) {
      const x = ax + (bx - ax) * (0.2 + rng() * 0.6), y = ay + 0.05;
      stroke(x, y, x + 0.08, y + 0.14, wd * 1.3);
    }
  }
  g.restore();
}

/** Draw one CJK character (real glyph when available, else brushed pseudo-glyph). */
export function cjk(g, ch, cx, cy, size, color, o = {}) {
  if (cjkAvailable()) {
    text(g, ch, cx, cy, { size, font: CJK_FONT, weight: o.weight ?? 700, color, stroke: o.stroke, strokeW: o.strokeW });
  } else {
    if (o.stroke) pseudoGlyph(g, cx, cy, size * 0.86, makeRng(hashString(ch) + 7), o.stroke);
    pseudoGlyph(g, cx, cy, size * 0.82, makeRng(hashString(ch) + 7), color);
  }
}

// ---------------------------------------------------------------------------
// Pictograms / silhouettes (simple filled paths, drawn in a 100-unit box)
// ---------------------------------------------------------------------------
function inBox(g, x, y, s, fn) {
  g.save();
  g.translate(x, y);
  g.scale(s / 100, s / 100);
  fn();
  g.restore();
}

/** Elephant silhouette facing left (road-sign pictogram). */
export function elephant(g, x, y, s, color, baby = false) {
  inBox(g, x, y, s, () => {
    g.fillStyle = color;
    g.beginPath();
    // body + back
    g.moveTo(30, 40);
    g.bezierCurveTo(34, 18, 70, 14, 86, 30);
    g.bezierCurveTo(94, 40, 94, 56, 90, 64);
    // rear leg
    g.lineTo(90, 90);
    g.lineTo(80, 90);
    g.lineTo(79, 70);
    g.lineTo(72, 70);
    g.lineTo(71, 90);
    g.lineTo(61, 90);
    g.lineTo(60, 68);
    // belly
    g.bezierCurveTo(52, 70, 46, 70, 42, 68);
    // front legs
    g.lineTo(42, 90);
    g.lineTo(32, 90);
    g.lineTo(31, 70);
    g.lineTo(26, 72);
    g.lineTo(25, 88);
    g.lineTo(17, 88);
    g.lineTo(18, 62);
    // trunk
    g.bezierCurveTo(12, 60, 8, 70, 9, 82);
    g.lineTo(4, 84);
    g.bezierCurveTo(1, 66, 6, 52, 14, 44);
    // head
    g.bezierCurveTo(14, 32, 22, 26, 30, 28);
    g.closePath();
    g.fill();
    // ear
    g.beginPath();
    g.moveTo(28, 32);
    g.bezierCurveTo(44, 26, 50, 40, 46, 54);
    g.bezierCurveTo(40, 58, 32, 54, 30, 48);
    g.closePath();
    g.fillStyle = color;
    g.fill();
    // tail
    g.lineWidth = 2.5;
    g.strokeStyle = color;
    g.beginPath();
    g.moveTo(91, 42);
    g.quadraticCurveTo(98, 50, 96, 62);
    g.stroke();
    if (!baby) {
      // tusk
      g.lineWidth = 2.5;
      g.strokeStyle = 'rgba(255,255,255,0.0)';
    }
  });
}

/** Seated Buddha silhouette with flame finial (amulets, cards, posters). */
export function buddha(g, cx, cy, s, color, halo = null) {
  inBox(g, cx - s / 2, cy - s / 2, s, () => {
    if (halo) {
      const grd = g.createRadialGradient(50, 34, 4, 50, 34, 40);
      grd.addColorStop(0, halo);
      grd.addColorStop(1, 'rgba(255,220,120,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(50, 34, 40, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = color;
    g.beginPath();
    // flame finial
    g.moveTo(50, 4);
    g.bezierCurveTo(53, 10, 54, 14, 53, 18);
    g.lineTo(47, 18);
    g.bezierCurveTo(46, 14, 47, 10, 50, 4);
    g.fill();
    // head
    g.beginPath();
    g.ellipse(50, 26, 8.5, 10, 0, 0, Math.PI * 2);
    g.fill();
    // ears
    g.beginPath();
    g.ellipse(41.5, 28, 2, 5.5, 0.1, 0, Math.PI * 2);
    g.ellipse(58.5, 28, 2, 5.5, -0.1, 0, Math.PI * 2);
    g.fill();
    // body
    g.beginPath();
    g.moveTo(46, 35);
    g.lineTo(54, 35);
    g.bezierCurveTo(66, 37, 70, 44, 70, 56);
    g.bezierCurveTo(70, 64, 68, 70, 66, 72);
    // lap / crossed legs
    g.bezierCurveTo(82, 73, 86, 78, 84, 84);
    g.bezierCurveTo(70, 88, 30, 88, 16, 84);
    g.bezierCurveTo(14, 78, 18, 73, 34, 72);
    g.bezierCurveTo(32, 70, 30, 64, 30, 56);
    g.bezierCurveTo(30, 44, 34, 37, 46, 35);
    g.closePath();
    g.fill();
    // base (lotus pedestal)
    g.beginPath();
    g.moveTo(14, 88);
    g.lineTo(86, 88);
    g.lineTo(80, 96);
    g.lineTo(20, 96);
    g.closePath();
    g.fill();
  });
}

/** Head-and-shoulders silhouette (posters). */
export function bust(g, cx, cy, s, color, hair = null) {
  inBox(g, cx - s / 2, cy - s / 2, s, () => {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(50, 34, 15, 19, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(42, 50);
    g.lineTo(58, 50);
    g.bezierCurveTo(60, 58, 80, 60, 92, 72);
    g.lineTo(96, 100);
    g.lineTo(4, 100);
    g.lineTo(8, 72);
    g.bezierCurveTo(20, 60, 40, 58, 42, 50);
    g.closePath();
    g.fill();
    if (hair) {
      g.fillStyle = hair;
      g.beginPath();
      g.ellipse(50, 26, 16, 12, 0, Math.PI, Math.PI * 2);
      g.fill();
    }
  });
}

/** Vintage sunburst rays. */
export function sunburst(g, cx, cy, r, n, c1, c2) {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2;
    g.fillStyle = i % 2 ? c1 : c2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    g.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    g.closePath();
    g.fill();
  }
}

/** Painterly gradient wash (radial blobs) for illustrated backgrounds. */
export function wash(g, w, h, cols, seed = 1, n = 12) {
  const rng = makeRng(seed);
  for (let i = 0; i < n; i++) {
    const x = rng() * w, y = rng() * h, r = (0.2 + rng() * 0.5) * Math.max(w, h);
    const c = cols[(rng() * cols.length) | 0];
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, c);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.35 + rng() * 0.35;
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }
  g.globalAlpha = 1;
}

/** Halftone dot overlay inside a rect (print texture). */
export function halftone(g, x, y, w, h, step, color, alpha = 0.15) {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  for (let yy = y; yy < y + h; yy += step) {
    for (let xx = x + ((yy / step) % 2) * step * 0.5; xx < x + w; xx += step) {
      g.beginPath();
      g.arc(xx, yy, step * 0.28, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/** Bolt / rivet heads. */
export function bolts(g, pts, r, color = '#6a6a66') {
  for (const [x, y] of pts) {
    const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    grd.addColorStop(0, '#c9c6bc');
    grd.addColorStop(0.5, color);
    grd.addColorStop(1, '#2a2826');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
}

// ---------------------------------------------------------------------------
// Weathering
// ---------------------------------------------------------------------------
function u8ToF(src, d) {
  for (let i = 0; i < src.length; i++) d[i] = src[i] * (1 / 255);
}
function fToU8(d, src) {
  for (let i = 0; i < src.length; i++) {
    const v = d[i] * 255 + 0.5;
    src[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
}
function opWobble(d, w, h, seed, amt) {
  const wx = fbm(w, h, { cells: 6, octaves: 3, seed: seed + 1 }), wy = fbm(w, h, { cells: 6, octaves: 3, seed: seed + 2 });
  const copy = Float32Array.from(d);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      let sx = (x + wx[i] * amt + 0.5) | 0, sy = (y + wy[i] * amt + 0.5) | 0;
      sx = sx < 0 ? 0 : sx >= w ? w - 1 : sx;
      sy = sy < 0 ? 0 : sy >= h ? h - 1 : sy;
      const j = (sy * w + sx) * 4, o = i * 4;
      d[o] = copy[j];
      d[o + 1] = copy[j + 1];
      d[o + 2] = copy[j + 2];
      d[o + 3] = copy[j + 3];
    }
  }
}
function edgeField(d, w, h, k) {
  const n = w * h;
  const A = new Float32Array(n);
  for (let i = 0; i < n; i++) A[i] = d[i * 4 + 3];
  const Ab = blur(A, w, h, Math.max(2, Math.round(6 * k)), 2);
  const edgeF = new Float32Array(n);
  const inv = 1 / (10 * k);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const fr = Math.min(Math.min(x, y), Math.min(w - 1 - x, h - 1 - y)) * inv;
      const a = 1 - Math.min(1, Ab[i] * 1.05), b = 1 - Math.min(1, fr);
      edgeF[i] = a > b ? a : b;
    }
  }
  return edgeF;
}
function opFadeGrime(d, w, h, low, mid, fine, edgeF, fadeC, fade, grime, edge) {
  for (let y = 0, i = 0; y < h; y++) {
    const yt = y / h;
    for (let x = 0; x < w; x++, i++) {
      const j = i * 4;
      if (d[j + 3] <= 0) continue;
      let r = d[j], gg = d[j + 1], b = d[j + 2];
      let f = fade * (0.55 + 0.45 * low[i] + 0.25 * (1 - yt)) * (0.85 + fine[i] * 0.15);
      if (f > fade) f = fade;
      if (f > 0) {
        const l = r * 0.3 + gg * 0.55 + b * 0.15;
        r += (l * 0.6 + fadeC[0] * 0.4 - r) * f - f * 0.05;
        gg += (l * 0.6 + fadeC[1] * 0.4 - gg) * f;
        b += (l * 0.6 + fadeC[2] * 0.4 - b) * f * 0.9;
      }
      const gv = mid[i] * 0.6 + low[i] * 0.5 + yt * 0.3;
      const gm = grime * sstep(-0.3, 0.7, gv) + edge * edgeF[i] * 0.6;
      if (gm > 0) {
        let m = gm * 0.55;
        m = 1 - (m > 0.85 ? 0.85 : m);
        const q = (1 - m) * 0.4;
        r = r * m + 0.16 * q;
        gg = gg * m + 0.13 * q;
        b = b * m + 0.09 * q;
      }
      d[j] = r;
      d[j + 1] = gg;
      d[j + 2] = b;
    }
  }
}
function opStreaks(d, w, h, k, rng, amount) {
  const n = w * h;
  const st = new Float32Array(n);
  const count = Math.round(30 * k * amount + 4);
  for (let s = 0; s < count; s++) {
    const x = rng() * w, y0 = rng() * h * 0.6, L = (0.1 + rng() * 0.6) * h, wd = (1 + rng() * 3) * k;
    const str = 0.4 + 0.6 * rng();
    for (let t = 0; t < L; t += 1) {
      const yy = (y0 + t) | 0;
      if (yy >= h) break;
      const xx = x + Math.sin(t * 0.05 + s) * 1.5 * k;
      const fall = (1 - t / L) * str;
      for (let dx = -Math.ceil(wd); dx <= Math.ceil(wd); dx++) {
        const xi = (xx + dx) | 0;
        if (xi < 0 || xi >= w) continue;
        const q = 1 - Math.abs(dx) / (wd + 0.5);
        const v = q * fall;
        const ii = yy * w + xi;
        if (v > st[ii]) st[ii] = v;
      }
    }
  }
  const sb = blur(st, w, h, Math.max(1, Math.round(1.5 * k)), 1);
  for (let i = 0; i < n; i++) {
    const v = sb[i] * amount * 0.55;
    if (v <= 0) continue;
    const j = i * 4;
    d[j] *= 1 - v;
    d[j + 1] *= 1 - v * 0.95;
    d[j + 2] *= 1 - v * 0.9;
  }
}
function opChips(d, w, h, k, seed, amount, sub, edgeF, low, fine) {
  const W = worley(w, h, { cells: Math.max(4, Math.round(30 * k)), seed: seed + 7 });
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    if (d[j + 3] <= 0.05) continue;
    const chance = amount * (0.25 + edgeF[i] * 1.8) * (0.6 + low[i] * 0.6);
    const cellR = (Math.imul(W.id[i], 2654435761) >>> 0) % 1000;
    if (cellR / 1000 > chance * 0.6) continue;
    const m = sstep(0.42, 0.3, W.f1[i] + fine[i] * 0.12);
    if (m <= 0) continue;
    const sh = 0.85 + fine[i] * 0.15;
    d[j] += (sub[0] * sh - d[j]) * m;
    d[j + 1] += (sub[1] * sh - d[j + 1]) * m;
    d[j + 2] += (sub[2] * sh - d[j + 2]) * m;
  }
}
function opScratches(d, w, h, k, rng, amount) {
  const n = w * h;
  const sc = new Float32Array(n);
  for (let s = 0; s < Math.round(40 * amount * k); s++) {
    const x = rng() * w, y = rng() * h, a = rng() * Math.PI * 2, L = (10 + rng() * 80) * k;
    line(sc, w, h, x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, (0.5 + rng() * 0.8) * k, 0.4 + rng() * 0.6, 'max');
  }
  for (let i = 0; i < n; i++) {
    if (sc[i] <= 0) continue;
    const j = i * 4;
    const v = sc[i] * 0.45;
    d[j] += (0.82 - d[j]) * v;
    d[j + 1] += (0.8 - d[j + 1]) * v;
    d[j + 2] += (0.75 - d[j + 2]) * v;
  }
}
function opRust(d, w, h, k, rng, seed, pts, rustEdge, edgeF, low, fine) {
  const n = w * h;
  const R = new Float32Array(n);
  for (const [u, v] of pts || []) disc(R, w, h, u * w, v * h, (8 + rng() * 6) * k, 1, 'max');
  if (rustEdge) for (let i = 0; i < n; i++) {
    const e = sstep(0.4, 0.95, edgeF[i] + fine[i] * 0.2) * rustEdge * sstep(-0.2, 0.3, low[i]);
    if (e > R[i]) R[i] = e;
  }
  const Rd = drip(R, w, h, seed + 8, 0.97, 0.992);
  for (let i = 0; i < n; i++) {
    let v = Rd[i] * (0.65 + fine[i] * 0.3);
    if (v <= 0.01) continue;
    if (v > 1) v = 1;
    const j = i * 4;
    const core = R[i] > 0.4 ? 1 : 0.55;
    const a = v * 0.85;
    d[j] += (0.42 * core + 0.1 - d[j]) * a;
    d[j + 1] += (0.22 * core + 0.05 - d[j + 1]) * a;
    d[j + 2] += (0.1 * core + 0.03 - d[j + 2]) * a;
  }
}
function opMoss(d, w, h, amount, low, fine) {
  for (let y = 0, i = 0; y < h; y++) {
    const yt = y / h;
    for (let x = 0; x < w; x++, i++) {
      const j = i * 4;
      if (d[j + 3] <= 0) continue;
      const m = sstep(0.55, 1.0, yt + low[i] * 0.25 + fine[i] * 0.12) * amount;
      if (m <= 0) continue;
      const lum = 0.5 + fine[i] * 0.5;
      d[j] += (0.22 * lum + 0.04 - d[j]) * m;
      d[j + 1] += (0.32 * lum + 0.08 - d[j + 1]) * m;
      d[j + 2] += (0.1 * lum + 0.02 - d[j + 2]) * m;
    }
  }
}
function opPaper(d, n, amount, low, fine, edgeF) {
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    if (d[j + 3] <= 0) continue;
    const fib = fine[i] * 0.04;
    const yel = amount * (0.45 + 0.35 * low[i] + edgeF[i] * 0.6);
    d[j] = d[j] * (1 - yel * 0.06) + fib;
    d[j + 1] = d[j + 1] * (1 - yel * 0.12) + fib;
    d[j + 2] = d[j + 2] * (1 - yel * 0.35) + fib * 0.8;
  }
}
function opCrease(d, w, h, k, u0, v0, u1, v1) {
  const n = w * h;
  const C = new Float32Array(n);
  line(C, w, h, u0 * w, v0 * h, u1 * w, v1 * h, 2.2 * k, 1, 'max');
  const dx = (u1 - u0) * w, dy = (v1 - v0) * h, L = Math.hypot(dx, dy) || 1;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const v = C[i];
      if (v <= 0) continue;
      const side = ((x - u0 * w) * -dy + (y - v0 * h) * dx) / L;
      const j = i * 4;
      const s = 1 + ((side > 0 ? 1.12 : 0.78) - 1) * v;
      d[j] *= s;
      d[j + 1] *= s;
      d[j + 2] *= s;
    }
  }
}
function opTear(d, w, h, k, amount, fine, mid) {
  const inv = 1 / (14 * k);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const fr = Math.min(Math.min(x, y), Math.min(w - 1 - x, h - 1 - y)) * inv;
      if (fr > 2) continue;
      d[i * 4 + 3] *= sstep(0.15, 0.55, fr + fine[i] * 0.5 * amount + mid[i] * 0.25 * amount);
    }
  }
}
function opDust(d, n, amount, mid, fine) {
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    if (d[j + 3] <= 0) continue;
    const v = amount * sstep(-0.2, 0.6, mid[i] + fine[i] * 0.3) * 0.35;
    d[j] += (0.62 - d[j]) * v;
    d[j + 1] += (0.58 - d[j + 1]) * v;
    d[j + 2] += (0.52 - d[j + 2]) * v;
  }
}
function opGloss(d, w, h, amount, low) {
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const j = i * 4;
      if (d[j + 3] <= 0) continue;
      const q = (x / w - (y / h) * 0.6 - 0.2) * 6;
      const band = Math.exp(-q * q) * amount * (0.6 + 0.4 * low[i]) * 0.35;
      d[j] += (1 - d[j]) * band;
      d[j + 1] += (1 - d[j + 1]) * band;
      d[j + 2] += (1 - d[j + 2]) * band;
    }
  }
}

/**
 * Age the canvas in place. o (all optional, 0..1 strengths):
 *  seed, fade (sun bleach), fadeTint, grime, streaks, chips, substrate (colour revealed by chips),
 *  scratches, rust (bolt points [[u,v],...] in 0..1 → rust halos + drips), rustEdge, moss (bottom),
 *  paper (fibres + yellowing), creases [[u0,v0,u1,v1],...], tear (ragged alpha edges), wobble (px, hand
 *  painted), paint (painterly smear opacity), edge (darken / wear borders), dust, gloss (laminate glare)
 * Each step is its own small function so the JIT optimises the pixel loops.
 */
export function weather(cv, o = {}) {
  const { g, w, h } = cv;
  const id = g.getImageData(0, 0, w, h);
  const n = w * h;
  const img = new Img(w, h);
  const d = img.d;
  u8ToF(id.data, d);
  const k = Math.max(w, h) / 512;
  const seed = o.seed ?? 1;
  const rng = makeRng(seed * 13 + 1);
  if (o.wobble) opWobble(d, w, h, seed, o.wobble * k);
  if ((o.paint ?? 0.22) > 0) strokes(img, { seed: seed + 3, len: [3 * k, 9 * k], width: [1.2 * k, 3 * k], opacity: o.paint ?? 0.22, coverage: 0.6, alphaOnly: true, valueJitter: 0.045, warmJitter: 0.02, smear: 0.25, bristleAmt: 0.4 });
  const low = fbm(w, h, { cells: 3, octaves: 4, seed: seed + 4 });
  const mid = fbm(w, h, { cells: 9, octaves: 3, seed: seed + 5 });
  const fine = fbm(w, h, { cells: 64, octaves: 2, seed: seed + 6 });
  const edgeF = edgeField(d, w, h, k);
  opFadeGrime(d, w, h, low, mid, fine, edgeF, rgb(o.fadeTint || '#e8e0cc'), o.fade ?? 0.3, o.grime ?? 0.3, o.edge ?? 0.3);
  if (o.streaks) opStreaks(d, w, h, k, rng, o.streaks);
  if (o.chips) opChips(d, w, h, k, seed, o.chips, rgb(o.substrate || '#8f8e88'), edgeF, low, fine);
  if (o.scratches) opScratches(d, w, h, k, rng, o.scratches);
  if (o.rust || o.rustEdge) opRust(d, w, h, k, rng, seed, o.rust, o.rustEdge, edgeF, low, fine);
  if (o.moss) opMoss(d, w, h, o.moss, low, fine);
  if (o.paper) opPaper(d, n, o.paper, low, fine, edgeF);
  if (o.creases) for (const c of o.creases) opCrease(d, w, h, k, c[0], c[1], c[2], c[3]);
  if (o.tear) opTear(d, w, h, k, o.tear, fine, mid);
  if (o.dust) opDust(d, n, o.dust, mid, fine);
  if (o.gloss) opGloss(d, w, h, o.gloss, low);
  fToU8(d, id.data);
  g.putImageData(id, 0, 0);
  return cv;
}

/** Hash helper re-export for designs. */
export { hashString, makeRng };
export { crack };
