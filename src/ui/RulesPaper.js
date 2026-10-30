// Ah Kong's handwritten rules, drawn as a texture: an aged lined page torn from a
// spiral notebook, folded in thirds and in half, coffee rings, a water stain that made
// the ink bleed, a cigarette burn, ballpoint handwriting (Thai + small English),
// crossed-out words, the hidden pencil line, and the player's own pencil notes.
//
// drawRulesPaper(ctx, w, h, data) draws synchronously; call `await loadFonts()` first.
// Everything outside the torn page is left transparent (use alphaTest / transparent).
import { makeRng, noise } from '../core/math.js';
import { FONTS } from './fonts.js';

export const DEFAULT_RULES = [
  { id: 'r1', th: 'รับผู้โดยสารทุกคนที่โบกเรียก ไม่ว่าจะเป็นคนหรือไม่ใช่คน', en: 'Pick up everyone who hails you, human or not.' },
  { id: 'r2', th: 'ทุกเส้นทางไปจบที่ศาลเจ้ามารวย ซ้ายสำหรับคนตาย ขวาสำหรับคนเป็น', en: 'Every road ends at Ma Ruay Shrine. Left for the dead, right for the living.' },
  { id: 'r3', th: 'ไม่ว่าจะได้ยินอะไรจากเบาะหลัง อย่าหันไปมองเด็ดขาด', en: 'Whatever you hear from the back seat, never turn around to look.' },
  { id: 'r4', th: 'ถ้าผู้โดยสารไม่มีเงาในกระจก ห้ามมองหน้าเขาตรง ๆ', en: 'If a passenger has no reflection in the mirror, never look at their face directly.' },
  { id: 'r5', th: 'ถ้าได้ยินเสียงเคาะท้ายรถสามครั้ง ห้ามจอดเด็ดขาด', en: 'If you hear three knocks from the trunk, do not stop.' },
  { id: 'r6', th: 'ถ้าผู้โดยสารขอให้ปิดวิทยุ ให้ปิดทันที', en: 'If a passenger asks you to turn off the radio, turn it off at once.' },
  { id: 'r7', th: 'ถ้ามีเสียงเรียกชื่อจากข้างนอก อย่าขานรับ', en: 'If a voice outside calls your name, do not answer.' },
  { id: 'r8', th: 'ถ้ามีลมหายใจรดต้นคอ ให้กำพระไว้ แล้วมองตรงไปข้างหน้า', en: 'If breath touches your neck, hold the amulet and keep your eyes forward.' },
  { id: 'r9', th: 'ถ้าไฟในรถดับเอง อย่าเปิดมันอีก', en: 'If the cabin light goes out by itself, don’t switch it back on.' },
  { id: 'r10', th: 'ผ่านศาลให้บีบแตรสองครั้ง ขอทางเจ้าที่', en: 'Honk twice when you pass a shrine, to ask the spirits for passage.' },
];
export const HIDDEN_LINE = { th: 'กฎทุกข้อมีข้อยกเว้น ยกเว้นข้อสาม', en: 'Every rule has an exception, except rule three.' };

// Ah Kong's own corrections and emphasis (applied only when the text matches).
const CROSSOUTS = { r3: { before: 'มอง', word: 'ดู' }, r5: { before: 'จอด', word: 'ชะลอ' }, r9: { before: 'เปิด', word: 'แตะ' } };
const EMPHASIS = { r3: [{ w: 'เด็ดขาด', n: 2 }], r5: [{ w: 'เด็ดขาด', n: 1 }], r6: [{ w: 'ทันที', n: 1 }], r2: [{ w: 'ซ้าย', n: 1 }, { w: 'ขวา', n: 1 }] };

const W = 1024;
const H = 1408;
const INK = '#1d2650';
const INK_EN = '#2a3566';
const GRAPHITE = '#4a4c52';

const SEG_G = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
const SEG_W = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
const graphemes = (s) => (SEG_G ? Array.from(SEG_G.segment(s), (x) => x.segment) : [s]);
const words = (s) => (SEG_W ? Array.from(SEG_W.segment(s), (x) => x.segment) : s.split(/(\s+)/).filter(Boolean));

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ------------------------------------------------------------------ shapes ----
function paperPath(rng) {
  const p = new Path2D();
  const L = 16, R = 1008, B = 1390, T = 44;
  const ear = 58; // folded corner (bottom-right)
  const wob = (a) => (rng() - 0.5) * a;
  // top edge: torn through the spiral holes, left -> right
  const holes = [];
  for (let x = 46; x < R - 20; x += 37.5) holes.push(x + wob(1.5));
  p.moveTo(L + wob(1), T + 10 + wob(3));
  let x = L;
  for (const hx of holes) {
    // jagged paper between holes
    while (x < hx - 9) {
      x += 2 + rng() * 4;
      p.lineTo(Math.min(x, hx - 9), T - 4 + rng() * 7 + (rng() < 0.12 ? -rng() * 7 : 0));
    }
    // torn open half-hole (U notch)
    const r = 6.2 + wob(1.2);
    const cy = T + 5 + wob(1.5);
    p.lineTo(hx - r - 1, cy - 2 + wob(2));
    for (let a = Math.PI; a >= 0; a -= Math.PI / 7) p.lineTo(hx + Math.cos(a) * r + wob(0.8), cy + Math.sin(a) * r + wob(0.8));
    p.lineTo(hx + r + 1, cy - 3 + wob(2));
    x = hx + 9;
  }
  while (x < R) {
    x += 3 + rng() * 4;
    p.lineTo(Math.min(x, R), T - 3 + rng() * 6);
  }
  // right edge
  for (let y = T + 10; y < B - ear; y += 30) p.lineTo(R + wob(1.4), y);
  p.lineTo(R + wob(1), B - ear);
  // dog-eared corner cut
  p.lineTo(R - ear, B + wob(1));
  // bottom edge
  for (let xx = R - ear - 30; xx > L; xx -= 30) p.lineTo(xx, B + wob(1.6));
  p.lineTo(L + wob(1), B + wob(1));
  // left edge (one small nick)
  for (let y = B - 30; y > T + 10; y -= 30) {
    if (Math.abs(y - 820) < 15) {
      p.lineTo(L + 5, y + 4);
      p.lineTo(L + 1, y - 3);
    }
    p.lineTo(L + wob(1.4), y);
  }
  p.closePath();
  return { path: p, holes, L, R, T, B, ear };
}

/** Hand-drawn line with pressure variation. */
function handLine(g, rng, x0, y0, x1, y1, { width = 2, color = INK, alpha = 0.85, wave = 1.1 } = {}) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(4, Math.round(len / 10));
  const nx = -(y1 - y0) / (len || 1);
  const ny = (x1 - x0) / (len || 1);
  const ph = rng() * 10;
  g.strokeStyle = color;
  g.lineCap = 'round';
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const off = Math.sin(t * 3.1 + ph) * wave + (rng() - 0.5) * 0.5;
    const qx = x0 + (x1 - x0) * t + nx * off;
    const qy = y0 + (y1 - y0) * t + ny * off;
    const pressure = 0.65 + 0.35 * Math.sin(t * Math.PI) + (rng() - 0.5) * 0.15;
    g.globalAlpha = alpha * Math.min(1, pressure + 0.15);
    g.lineWidth = width * pressure;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(qx, qy);
    g.stroke();
    px = qx;
    py = qy;
  }
  g.globalAlpha = 1;
}

/**
 * Write text by grapheme with an irregular baseline, rotation, size and pressure.
 * Returns { x (end), xs: Map(stringIndex -> x) }.
 */
function write(g, rng, text, x, y, o) {
  g.font = o.font;
  g.fillStyle = o.color;
  g.textBaseline = 'alphabetic';
  const xs = new Map();
  let idx = 0;
  const x0 = x;
  const gs = graphemes(text);
  for (const ch of gs) {
    xs.set(idx, x);
    idx += ch.length;
    const w = g.measureText(ch).width;
    if (/^\s+$/.test(ch)) {
      x += w * (0.85 + rng() * 0.3);
      continue;
    }
    const n = noise.noise2D(x * 0.011 + o.seed, y * 0.01);
    const pressure = Math.max(0.55, Math.min(1, (o.pressure ?? 0.86) + n * 0.16 + (rng() - 0.5) * 0.08));
    const dy = (x - x0) * (o.slope || 0) + Math.sin(x * 0.012 + o.seed) * (o.wave ?? 1.6) + (rng() - 0.5) * (o.jy ?? 1.6);
    const rot = (rng() - 0.5) * (o.rot ?? 0.05);
    const sc = 1 + (rng() - 0.5) * (o.sj ?? 0.06);
    g.save();
    g.translate(x, y + dy);
    if (o.skew) g.transform(1, 0, o.skew, 1, 0, 0);
    g.rotate(rot);
    g.scale(sc, sc * (1 + (rng() - 0.5) * 0.05));
    g.globalAlpha = (o.alpha ?? 1) * pressure;
    g.fillText(ch, 0, 0);
    if (pressure > 0.88 || o.heavy) {
      // pen pressed harder: a second, slightly offset pass thickens the stroke
      g.globalAlpha *= o.heavy ? 0.7 : 0.4;
      g.fillText(ch, 0.55, 0.2);
    }
    if (o.blob && rng() < 0.035) {
      g.globalAlpha = 0.5;
      g.beginPath();
      g.arc(1 + rng() * 2, -o.size * (0.1 + rng() * 0.5), 0.9 + rng() * 0.9, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    x += w * (1 + (rng() - 0.5) * 0.05) + (o.track || 0);
  }
  xs.set(text.length, x);
  g.globalAlpha = 1;
  return { x, xs };
}

function measure(g, text, font, track = 0) {
  g.font = font;
  return g.measureText(text).width + graphemes(text).length * track;
}

/** Wrap a token list ([{t, strike}]) into lines no wider than maxW. */
function wrapTokens(g, tokens, font, maxW, track) {
  const lines = [];
  let cur = [];
  let cw = 0;
  for (const tok of tokens) {
    for (const wd of words(tok.t)) {
      const ws = /^\s+$/.test(wd);
      const w = measure(g, wd, font, track) * (tok.strike ? 1.05 : 1);
      if (!cur.length && ws) continue;
      if (cw + w > maxW && cur.length) {
        lines.push(cur);
        cur = [];
        cw = 0;
        if (ws) continue;
      }
      const last = cur[cur.length - 1];
      if (last && last.strike === !!tok.strike) last.t += wd;
      else cur.push({ t: wd, strike: !!tok.strike });
      cw += w;
    }
  }
  if (cur.length) lines.push(cur);
  // drop trailing whitespace tokens
  for (const l of lines) {
    const last = l[l.length - 1];
    if (last) last.t = last.t.replace(/\s+$/, '');
  }
  return lines;
}

function ruleTokens(rule) {
  const co = CROSSOUTS[rule.id];
  const th = rule.th || '';
  if (co) {
    const i = th.indexOf(co.before);
    if (i > 0) return [{ t: th.slice(0, i) }, { t: co.word, strike: true }, { t: ' ' + th.slice(i) }];
  }
  return [{ t: th }];
}

function annotationText(a) {
  if (a == null) return null;
  if (typeof a === 'string') return a;
  if (Array.isArray(a)) return a.join(' · ');
  if (typeof a === 'object') return [a.th, a.en].filter(Boolean).join(' · ');
  return String(a);
}

function truncate(g, text, font, maxW) {
  if (measure(g, text, font) <= maxW) return text;
  const gs = graphemes(text);
  while (gs.length > 1 && measure(g, gs.join('') + '…', font) > maxW) gs.pop();
  return gs.join('') + '…';
}

// ------------------------------------------------------------ base (cached) ----
const _cache = new Map();

function noisePattern(g, density, seed) {
  const s = 256;
  const c = canvas(s, s);
  const x = c.getContext('2d');
  const img = x.createImageData(s, s);
  const rng = makeRng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rng();
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
    img.data[i + 3] = v < density ? 255 * (0.4 + rng() * 0.6) : 0;
  }
  x.putImageData(img, 0, 0);
  return g.createPattern(c, 'repeat');
}

function buildBase(w, h) {
  const key = `${w}x${h}`;
  if (_cache.has(key)) return _cache.get(key);
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const sx = w / W;
  const sy = h / H;
  g.setTransform(sx, 0, 0, sy, 0, 0);
  const rng = makeRng(90817);
  const shape = paperPath(rng);
  g.save();
  g.clip(shape.path);

  // paper body: warm, yellowed toward the edges
  const grd = g.createRadialGradient(W * 0.48, H * 0.44, 80, W * 0.5, H * 0.5, H * 0.78);
  grd.addColorStop(0, '#ece3cb');
  grd.addColorStop(0.55, '#e4d7b8');
  grd.addColorStop(1, '#cdb88d');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);

  // low-frequency mottling (computed small, scaled up smoothly)
  {
    const mw = 96, mh = 132;
    const m = canvas(mw, mh);
    const mg = m.getContext('2d');
    const img = mg.createImageData(mw, mh);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const n = noise.fbm2 ? noise.fbm2(x * 0.06, y * 0.06, 4) : noise.noise2D(x * 0.06, y * 0.06);
        const n2 = noise.noise2D(x * 0.21 + 40, y * 0.21 - 7);
        const v = 0.5 + n * 0.5;
        const i = (y * mw + x) * 4;
        img.data[i] = 120 + v * 40;
        img.data[i + 1] = 92 + v * 30;
        img.data[i + 2] = 50 + v * 18;
        img.data[i + 3] = Math.max(0, Math.min(255, (Math.max(0, n) * 0.7 + Math.max(0, n2) * 0.3) * 90));
      }
    }
    mg.putImageData(img, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.55;
    g.imageSmoothingEnabled = true;
    g.drawImage(m, 0, 0, W, H);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // printed rules: light blue lines (edge to edge), red double margin
  const top = 214;
  const sp = 40;
  for (let i = -1; i < 30; i++) {
    const y = top + i * sp + 0.5;
    if (y > shape.B - 6) break;
    for (let x = 0; x < W; x += 64) {
      g.globalAlpha = 0.34 + 0.16 * noise.noise2D(x * 0.01, i * 3.1);
      g.fillStyle = '#7d93b9';
      g.fillRect(x, y, 64, 1.25);
    }
  }
  g.globalAlpha = 0.5;
  g.fillStyle = '#c8706a';
  g.fillRect(118, shape.T, 1.4, H);
  g.globalAlpha = 0.32;
  g.fillRect(123, shape.T, 1.1, H);
  g.globalAlpha = 1;

  // paper fibres
  for (let i = 0; i < 1800; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const a = rng() * Math.PI;
    const l = 3 + rng() * 9;
    g.strokeStyle = rng() < 0.5 ? 'rgba(255,250,235,0.18)' : 'rgba(120,96,60,0.10)';
    g.lineWidth = 0.6 + rng() * 0.5;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (rng() - 0.5) * 2, y + Math.sin(a) * l * 0.5 + (rng() - 0.5) * 2, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }

  // foxing: small rust-brown age spots, mostly near the edges
  for (let i = 0; i < 70; i++) {
    const edge = rng() < 0.7;
    let x = rng() * W;
    let y = rng() * H;
    if (edge) {
      if (rng() < 0.5) x = rng() < 0.5 ? 20 + rng() * 90 : W - 20 - rng() * 90;
      else y = rng() < 0.5 ? 50 + rng() * 90 : H - 20 - rng() * 110;
    }
    const r = 1 + rng() * (rng() < 0.15 ? 9 : 3.5);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(140,90,40,${0.18 + rng() * 0.2})`);
    rg.addColorStop(1, 'rgba(140,90,40,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  // fine per-pixel grain (device pixels)
  g.setTransform(1, 0, 0, 1, 0, 0);
  {
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    let s = 2463534242;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      const n = ((s >>> 0) / 4294967296 - 0.5) * 14;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n * 0.9;
    }
    g.putImageData(img, 0, 0);
  }
  const out = { canvas: c, shape };
  _cache.set(key, out);
  return out;
}

// ------------------------------------------------------------ decorations ----
function coffeeRing(g, rng, cx, cy, r, strength = 1, gap = 0.7) {
  const start = rng() * Math.PI * 2;
  // faint interior wash
  const wash = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
  wash.addColorStop(0, 'rgba(160,110,60,0.0)');
  wash.addColorStop(0.85, `rgba(150,100,50,${0.07 * strength})`);
  wash.addColorStop(1, 'rgba(150,100,50,0)');
  g.fillStyle = wash;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  // tide line: many thin arcs with noisy radius and alpha
  for (let k = 0; k < 5; k++) {
    const rr = r - k * 1.6;
    g.lineWidth = 1.1 + rng() * 2.2;
    let prev = null;
    const steps = 140;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = start + t * Math.PI * 2 * (1 - gap * 0.2);
      const fade = Math.sin(Math.min(1, t * 1.15) * Math.PI);
      const rad = rr + noise.noise2D(Math.cos(a) * 2 + k, Math.sin(a) * 2) * 3.2;
      const p = [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
      if (prev) {
        g.strokeStyle = `rgba(115,66,28,${(0.06 + 0.2 * fade * (1 - k * 0.17)) * strength})`;
        g.beginPath();
        g.moveTo(prev[0], prev[1]);
        g.lineTo(p[0], p[1]);
        g.stroke();
      }
      prev = p;
    }
  }
  // a few drips
  for (let i = 0; i < 6; i++) {
    const a = rng() * Math.PI * 2;
    const d = r * (1.05 + rng() * 0.3);
    const rr = 1.5 + rng() * 4;
    g.fillStyle = `rgba(120,70,30,${0.12 * strength})`;
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, Math.PI * 2);
    g.fill();
  }
}

function blobPath(rng, cx, cy, r, irregular = 0.28, seed = 0) {
  const p = new Path2D();
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + noise.noise2D(Math.cos(a) * 1.4 + seed, Math.sin(a) * 1.4 + seed) * irregular + Math.sin(a * 3 + seed) * irregular * 0.3;
    const x = cx + Math.cos(a) * r * k;
    const y = cy + Math.sin(a) * r * k * 0.82;
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

function waterStain(g, rng, cx, cy, r, seed) {
  const p = blobPath(rng, cx, cy, r, 0.3, seed);
  g.save();
  g.clip(p);
  const rg = g.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.15);
  rg.addColorStop(0, 'rgba(250,246,236,0.10)');
  rg.addColorStop(0.75, 'rgba(160,140,100,0.06)');
  rg.addColorStop(1, 'rgba(120,96,60,0.16)');
  g.fillStyle = rg;
  g.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
  g.restore();
  // tide line
  g.save();
  g.lineWidth = 2.2;
  g.strokeStyle = 'rgba(128,100,58,0.22)';
  g.filter = 'blur(0.8px)';
  g.stroke(p);
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(110,84,46,0.25)';
  g.filter = 'none';
  g.stroke(p);
  g.restore();
  return p;
}

function cigaretteBurn(g, rng, cx, cy) {
  // scorch halo
  const s = g.createRadialGradient(cx, cy, 4, cx, cy, 44);
  s.addColorStop(0, 'rgba(70,40,15,0.55)');
  s.addColorStop(0.35, 'rgba(120,70,25,0.32)');
  s.addColorStop(0.7, 'rgba(160,110,50,0.12)');
  s.addColorStop(1, 'rgba(160,110,50,0)');
  g.fillStyle = s;
  g.beginPath();
  g.ellipse(cx, cy, 46, 36, 0.4, 0, Math.PI * 2);
  g.fill();
  // charred ring
  const hole = blobPath(rng, cx, cy, 9.5, 0.4, 7.7);
  g.save();
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(30,18,8,0.75)';
  g.filter = 'blur(1.4px)';
  g.stroke(hole);
  g.restore();
  // the hole itself
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.fill(hole);
  g.restore();
  // ash smear
  g.save();
  g.globalAlpha = 0.18;
  g.fillStyle = '#4b4846';
  g.filter = 'blur(6px)';
  g.beginPath();
  g.ellipse(cx + 38, cy - 12, 34, 9, -0.3, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function thumbprint(g, rng, cx, cy, rot) {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.strokeStyle = 'rgba(70,60,50,0.07)';
  g.lineWidth = 1.4;
  for (let i = 0; i < 13; i++) {
    const r = 4 + i * 2.5;
    g.beginPath();
    g.ellipse(noise.noise2D(i, 3) * 2, i * 0.4, r * 0.75, r, 0, Math.PI * (0.9 + rng() * 0.3), Math.PI * (2.1 + rng() * 0.25));
    g.stroke();
  }
  g.restore();
}

function folds(g, rng, shape) {
  const creaseH = (y) => {
    // shading on each side
    let gr = g.createLinearGradient(0, y - 70, 0, y);
    gr.addColorStop(0, 'rgba(60,45,25,0)');
    gr.addColorStop(1, 'rgba(60,45,25,0.10)');
    g.fillStyle = gr;
    g.fillRect(0, y - 70, W, 70);
    gr = g.createLinearGradient(0, y, 0, y + 50);
    gr.addColorStop(0, 'rgba(255,252,240,0.16)');
    gr.addColorStop(1, 'rgba(255,252,240,0)');
    g.fillStyle = gr;
    g.fillRect(0, y, W, 50);
    // the crease: dark fold line + highlight, slightly wavy and broken
    for (let x = 0; x < W; x += 8) {
      const yy = y + noise.noise2D(x * 0.008, y) * 2.2;
      g.fillStyle = `rgba(70,50,28,${0.2 + rng() * 0.12})`;
      g.fillRect(x, yy - 0.6, 8.5, 1.2);
      g.fillStyle = `rgba(255,252,240,${0.25 + rng() * 0.2})`;
      g.fillRect(x, yy + 1.2, 8.5, 1.1);
    }
  };
  const creaseV = (x) => {
    let gr = g.createLinearGradient(x - 60, 0, x, 0);
    gr.addColorStop(0, 'rgba(60,45,25,0)');
    gr.addColorStop(1, 'rgba(60,45,25,0.08)');
    g.fillStyle = gr;
    g.fillRect(x - 60, 0, 60, H);
    gr = g.createLinearGradient(x, 0, x + 45, 0);
    gr.addColorStop(0, 'rgba(255,252,240,0.13)');
    gr.addColorStop(1, 'rgba(255,252,240,0)');
    g.fillStyle = gr;
    g.fillRect(x, 0, 45, H);
    for (let y = 0; y < H; y += 8) {
      const xx = x + noise.noise2D(y * 0.008, x) * 2;
      g.fillStyle = `rgba(70,50,28,${0.16 + rng() * 0.1})`;
      g.fillRect(xx - 0.6, y, 1.1, 8.5);
      g.fillStyle = `rgba(255,252,240,${0.2 + rng() * 0.18})`;
      g.fillRect(xx + 1.1, y, 1, 8.5);
    }
  };
  creaseH(H / 3 + 8);
  creaseH((H * 2) / 3 + 4);
  creaseV(W / 2 + 6);
  // wear where creases cross
  for (const [x, y] of [[W / 2 + 6, H / 3 + 8], [W / 2 + 6, (H * 2) / 3 + 4]]) {
    const rg = g.createRadialGradient(x, y, 0, x, y, 18);
    rg.addColorStop(0, 'rgba(255,250,236,0.35)');
    rg.addColorStop(1, 'rgba(255,250,236,0)');
    g.fillStyle = rg;
    g.fillRect(x - 20, y - 20, 40, 40);
  }
  // panel shading: the page doesn't lie flat
  const panels = [[0, shape.T, W / 2, H / 3], [W / 2, shape.T, W / 2, H / 3], [0, H / 3, W / 2, H / 3], [W / 2, H / 3, W / 2, H / 3], [0, (H * 2) / 3, W / 2, H / 3], [W / 2, (H * 2) / 3, W / 2, H / 3]];
  for (const [x, y, w, h] of panels) {
    const a = rng() * Math.PI * 2;
    const gr = g.createLinearGradient(x + w / 2 - Math.cos(a) * w * 0.6, y + h / 2 - Math.sin(a) * h * 0.6, x + w / 2 + Math.cos(a) * w * 0.6, y + h / 2 + Math.sin(a) * h * 0.6);
    gr.addColorStop(0, 'rgba(255,250,236,0.06)');
    gr.addColorStop(1, 'rgba(80,60,30,0.07)');
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  }
  // small random wrinkles
  for (let i = 0; i < 14; i++) {
    const x = 60 + rng() * (W - 120);
    const y = 80 + rng() * (H - 160);
    const a = rng() * Math.PI;
    const l = 30 + rng() * 120;
    const x1 = x + Math.cos(a) * l;
    const y1 = y + Math.sin(a) * l;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(80,60,30,0.08)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo((x + x1) / 2 + (rng() - 0.5) * 12, (y + y1) / 2 + (rng() - 0.5) * 12, x1, y1);
    g.stroke();
    g.strokeStyle = 'rgba(255,252,240,0.14)';
    g.beginPath();
    g.moveTo(x + 1.3, y + 1.3);
    g.quadraticCurveTo((x + x1) / 2 + 1.3, (y + y1) / 2 + 1.3, x1 + 1.3, y1 + 1.3);
    g.stroke();
  }
}

function edgeWear(g, shape) {
  g.save();
  g.lineWidth = 26;
  g.strokeStyle = 'rgba(130,95,45,0.20)';
  g.filter = 'blur(10px)';
  g.stroke(shape.path);
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(110,80,40,0.35)';
  g.filter = 'blur(1px)';
  g.stroke(shape.path);
  g.restore();
}

function tornFibres(g, rng, shape) {
  // whiter, fluffy fibres along the torn top edge
  g.save();
  g.strokeStyle = 'rgba(250,246,232,0.7)';
  g.lineWidth = 0.7;
  for (let i = 0; i < 260; i++) {
    const x = shape.L + rng() * (shape.R - shape.L);
    const y = shape.T - 4 + rng() * 9;
    g.beginPath();
    g.moveTo(x, y + 2);
    g.lineTo(x + (rng() - 0.5) * 3, y - 1 - rng() * 3);
    g.stroke();
  }
  g.restore();
}

function dogEar(g, shape) {
  const { R, B, ear } = shape;
  const p = new Path2D();
  p.moveTo(R - ear, B);
  p.lineTo(R, B - ear);
  p.lineTo(R - ear + 3, B - ear + 3);
  p.closePath();
  g.save();
  // shadow cast by the flap
  g.shadowColor = 'rgba(40,25,10,0.35)';
  g.shadowBlur = 8;
  g.shadowOffsetX = -2;
  g.shadowOffsetY = -2;
  const gr = g.createLinearGradient(R - ear, B - ear, R - ear / 2, B - ear / 2);
  gr.addColorStop(0, '#d9c8a0');
  gr.addColorStop(1, '#c3ad80');
  g.fillStyle = gr;
  g.fill(p);
  g.restore();
  g.save();
  g.strokeStyle = 'rgba(255,250,236,0.6)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(R - ear, B);
  g.lineTo(R, B - ear);
  g.stroke();
  g.restore();
}

// ----------------------------------------------------------------- doodle ----
function forkDoodle(g, rng, x, y, s) {
  // tiny map: the road forks at the shrine, arrows left/right
  const o = { width: 2.2, color: INK, alpha: 0.8, wave: 0.6 };
  handLine(g, rng, x, y + 70 * s, x, y + 22 * s, o);
  handLine(g, rng, x, y + 22 * s, x - 42 * s, y - 14 * s, o);
  handLine(g, rng, x, y + 22 * s, x + 42 * s, y - 14 * s, o);
  // arrow heads
  handLine(g, rng, x - 42 * s, y - 14 * s, x - 30 * s, y - 13 * s, o);
  handLine(g, rng, x - 42 * s, y - 14 * s, x - 39 * s, y - 2 * s, o);
  handLine(g, rng, x + 42 * s, y - 14 * s, x + 30 * s, y - 13 * s, o);
  handLine(g, rng, x + 42 * s, y - 14 * s, x + 39 * s, y - 2 * s, o);
  // the shrine: little roof
  handLine(g, rng, x - 9 * s, y + 10 * s, x, y + 2 * s, { ...o, width: 1.6 });
  handLine(g, rng, x, y + 2 * s, x + 9 * s, y + 10 * s, { ...o, width: 1.6 });
  const f = `500 ${Math.round(19 * s)}px ${FONTS.hand}`;
  write(g, rng, 'ผี', x - 74 * s, y - 16 * s, { font: f, size: 19 * s, color: INK, seed: 3, alpha: 0.9 });
  write(g, rng, 'คน', x + 50 * s, y - 16 * s, { font: f, size: 19 * s, color: INK, seed: 4, alpha: 0.9 });
  write(g, rng, 'ศาล', x + 12 * s, y + 18 * s, { font: `400 ${Math.round(14 * s)}px ${FONTS.hand}`, size: 14 * s, color: INK, seed: 5, alpha: 0.75 });
}

// ------------------------------------------------------------------- main ----
/**
 * data {rules:[{id,th,en}], annotations:{ruleId|passengerId: text|{th,en}}, revealed:[ruleIds],
 *       hiddenLine?: bool, hiddenAlpha?: 0..1 (legibility of the hidden line), seed?}
 * `revealed` rules (proven by experience) get the player's pencil tick in the margin.
 */
export function drawRulesPaper(ctx, w, h, data = {}) {
  const rules = data.rules && data.rules.length ? data.rules : DEFAULT_RULES;
  const ann = data.annotations || {};
  const revealed = new Set(data.revealed || []);
  const seed = data.seed ?? 7;
  const base = buildBase(w, h);
  const shape = base.shape;
  const sx = w / W;
  const sy = h / H;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (data.background) {
    ctx.fillStyle = data.background;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(base.canvas, 0, 0);

  // ink & pencil layers (drawn separately so they can be textured, then multiplied)
  const inkC = canvas(w, h);
  const ink = inkC.getContext('2d');
  ink.setTransform(sx, 0, 0, sy, 0, 0);
  const penC = canvas(w, h);
  const pen = penC.getContext('2d');
  pen.setTransform(sx, 0, 0, sy, 0, 0);
  const rng = makeRng(seed * 7919 + 13);

  // ---- layout -------------------------------------------------------------
  const TOP = 214;
  const SP = 40;
  const LAST = Math.floor((shape.B - 30 - TOP) / SP); // last usable ruled-line index
  const X0 = 140;
  const XR = 984;
  const ruleIds = new Set(rules.map((r) => r.id));
  const passengerNotes = Object.keys(ann).filter((k) => !ruleIds.has(k)).map((k) => annotationText(ann[k])).filter(Boolean);
  let thSize = 31;
  let enSize = 19.5;
  let plan = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const thFont = `500 ${thSize}px ${FONTS.hand}`;
    const enFont = `400 ${enSize}px ${FONTS.hand}`;
    const annFont = `italic 300 ${Math.round(enSize + 2)}px ${FONTS.hand}`;
    let line = 0;
    const items = [];
    for (const r of rules) {
      const thLines = wrapTokens(ink, ruleTokens(r), thFont, XR - X0, 0.4);
      const enLines = r.en ? wrapTokens(ink, [{ t: r.en }], enFont, XR - X0 - 24, 0.2) : [];
      const a = annotationText(ann[r.id]);
      let annInline = false;
      if (a) {
        const lastEnW = enLines.length ? measure(ink, enLines[enLines.length - 1].map((t) => t.t).join(''), enFont, 0.2) : 0;
        const aw = measure(ink, a, annFont) + 40;
        annInline = X0 + 24 + lastEnW + 30 + aw <= XR + 20;
      }
      const it = { r, thLines, enLines, line, ann: a, annInline };
      line += thLines.length + enLines.length + (a && !annInline ? 1 : 0);
      items.push(it);
    }
    const tail = (data.hiddenLine ? 2 : 0) + passengerNotes.length + 2; // + signature
    if (line + tail <= LAST + 1 || attempt === 7) {
      plan = { items, used: line, thFont, enFont, annFont };
      break;
    }
    thSize -= 1.5;
    enSize -= 0.8;
  }

  // ---- header ---------------------------------------------------------------
  {
    const hs = 56;
    const r = write(ink, rng, 'กฎของรถคันนี้', 150, 150, { font: `600 ${hs}px ${FONTS.hand}`, size: hs, color: INK, seed: 1.3, slope: -0.012, wave: 1.2, heavy: false, alpha: 0.95, pressure: 0.92 });
    handLine(ink, rng, 146, 166, r.x + 8, 162, { width: 2.6, alpha: 0.85 });
    handLine(ink, rng, 160, 174, r.x - 18, 171, { width: 2, alpha: 0.7 });
    write(ink, rng, 'rules of this car', 156, 200, { font: `400 20px ${FONTS.hand}`, size: 20, color: INK_EN, seed: 2.1, alpha: 0.8, wave: 0.8 });
    // top-right: "learn them by heart!"
    ink.save();
    ink.translate(760, 112);
    ink.rotate(-0.05);
    const rr = write(ink, rng, 'อ่านให้ขึ้นใจ!!', 0, 0, { font: `500 30px ${FONTS.hand}`, size: 30, color: INK, seed: 5.2, alpha: 0.9 });
    write(ink, rng, 'learn them by heart', 8, 28, { font: `400 17px ${FONTS.hand}`, size: 17, color: INK_EN, seed: 6.4, alpha: 0.75 });
    handLine(ink, rng, -6, 8, rr.x + 4, 6, { width: 1.4, alpha: 0.6 });
    ink.restore();
  }

  // ---- rules ------------------------------------------------------------------
  const lineY = (i) => TOP + i * SP - 7;
  const annO = { font: plan.annFont, size: enSize + 2, color: GRAPHITE, seed: 11, alpha: 0.9, skew: -0.18, rot: 0.07, jy: 2.6, wave: 2.4, sj: 0.1, track: -0.4, pressure: 0.8 };
  for (const it of plan.items) {
    const { r } = it;
    const num = /^r(\d+)$/.exec(r.id || '') ? parseInt(r.id.slice(1), 10) : plan.items.indexOf(it) + 1;
    let li = it.line;
    const y0 = lineY(li);
    const isThree = num === 3;
    // margin number
    const nr = write(ink, rng, `${num}.`, num >= 10 ? 58 : 72, y0, { font: `600 ${Math.round(thSize + 3)}px ${FONTS.hand}`, size: thSize, color: INK, seed: num * 1.7, alpha: 0.95, heavy: isThree });
    if (isThree) {
      // circled twice, hard
      for (let k = 0; k < 2; k++) {
        ink.save();
        ink.strokeStyle = INK;
        ink.globalAlpha = 0.75 - k * 0.2;
        ink.lineWidth = 2.1 - k * 0.5;
        ink.beginPath();
        ink.ellipse(84 + k * 2, y0 - thSize * 0.32, 31 + k * 3, 22 + k * 2, -0.12 + k * 0.1, 0.3, Math.PI * 2 + 0.6);
        ink.stroke();
        ink.restore();
      }
    }
    if (revealed.has(r.id)) {
      // the player's tick, in pencil, left of the number
      handLine(pen, rng, 30, y0 - 12, 38, y0 - 3, { width: 2.4, color: GRAPHITE, alpha: 0.85, wave: 0.3 });
      handLine(pen, rng, 38, y0 - 3, 54, y0 - 26, { width: 2.2, color: GRAPHITE, alpha: 0.85, wave: 0.5 });
    }
    void nr;
    // Thai lines
    const emph = EMPHASIS[r.id] || [];
    for (const lineToks of it.thLines) {
      const y = lineY(li);
      let x = X0 + (li === it.line ? 0 : 6);
      const slope = (rng() - 0.55) * 0.012;
      for (const tok of lineToks) {
        const o = { font: plan.thFont, size: thSize, color: INK, seed: li * 3.3 + 0.7, slope, blob: true, alpha: 0.96, heavy: isThree, track: 0.4 };
        const res = write(ink, rng, tok.t, x, y, o);
        if (isThree) write(ink, rng, tok.t, x + 0.5, y + 0.4, { ...o, alpha: 0.35, heavy: false, blob: false });
        if (tok.strike) {
          // scribbled out: tight zig-zag, two passes
          const yy = y - thSize * 0.3;
          for (let pass = 0; pass < 2; pass++) {
            ink.save();
            ink.strokeStyle = INK;
            ink.globalAlpha = 0.85;
            ink.lineWidth = 1.7;
            ink.lineJoin = 'round';
            ink.beginPath();
            let px = x - 3;
            ink.moveTo(px, yy + (rng() - 0.5) * 4);
            let up = pass === 0;
            while (px < res.x + 2) {
              px += 3.5 + rng() * 2.5;
              ink.lineTo(px, yy + (up ? -1 : 1) * (thSize * 0.16 + rng() * 3));
              up = !up;
            }
            ink.stroke();
            ink.restore();
          }
        } else {
          for (const e of emph) {
            let k = tok.t.indexOf(e.w);
            while (k >= 0) {
              const xa = res.xs.get(k) ?? x;
              const xb = res.xs.get(k + e.w.length) ?? res.x;
              for (let u = 0; u < e.n; u++) handLine(ink, rng, xa - 2, y + 7 + u * 5, xb + 3, y + 6 + u * 5 + (rng() - 0.5) * 2, { width: 2 - u * 0.4, alpha: 0.8 });
              k = tok.t.indexOf(e.w, k + 1);
            }
          }
        }
        x = res.x;
      }
      if (isThree && li === it.line + it.thLines.length - 1) {
        write(ink, rng, '!!', x + 10, y, { font: `600 ${Math.round(thSize + 4)}px ${FONTS.hand}`, size: thSize, color: INK, seed: 9, heavy: true });
      }
      li++;
    }
    // English translation (smaller, lighter pressure)
    let lastEnEnd = X0;
    for (const lineToks of it.enLines) {
      const y = lineY(li) - 2;
      const res = write(ink, rng, lineToks.map((t) => t.t).join(''), X0 + 24, y, { font: plan.enFont, size: enSize, color: INK_EN, seed: li * 2.1 + 5, alpha: 0.78, pressure: 0.78, jy: 1.1, wave: 1.0, rot: 0.04, track: 0.2 });
      lastEnEnd = res.x;
      li++;
    }
    // the player's pencil note for this rule
    if (it.ann) {
      if (it.annInline) {
        const y = lineY(li - 1) - 4;
        const text = it.ann;
        const aw = measure(pen, text, plan.annFont);
        const ax = Math.max(lastEnEnd + 46, XR + 10 - aw);
        handLine(pen, rng, ax - 32, y - 6, ax - 8, y - 8, { width: 1.3, color: GRAPHITE, alpha: 0.7, wave: 0.4 });
        handLine(pen, rng, ax - 32, y - 6, ax - 25, y - 12, { width: 1.3, color: GRAPHITE, alpha: 0.7, wave: 0.2 });
        handLine(pen, rng, ax - 32, y - 6, ax - 25, y, { width: 1.3, color: GRAPHITE, alpha: 0.7, wave: 0.2 });
        write(pen, rng, text, ax, y, annO);
      } else {
        const y = lineY(li) - 4;
        const text = truncate(pen, it.ann, plan.annFont, XR - X0 - 120);
        const ax = X0 + 90 + rng() * 40;
        handLine(pen, rng, ax - 40, y - 22, ax - 40, y - 6, { width: 1.3, color: GRAPHITE, alpha: 0.7, wave: 0.2 });
        handLine(pen, rng, ax - 40, y - 6, ax - 12, y - 6, { width: 1.3, color: GRAPHITE, alpha: 0.7, wave: 0.2 });
        write(pen, rng, text, ax, y, annO);
        li++;
      }
    }
  }

  // ---- tail: hidden line, passenger notes, signature, doodle -------------------
  let li = plan.used;
  const freeLines = LAST - li;
  if (data.hiddenLine) {
    // Ah Kong's faint pencil line, pressed lightly: only legible up close / when wet
    const y = lineY(li + 1);
    const hx = X0 + 30;
    const hAlpha = 0.5 * (data.hiddenAlpha ?? 1);
    pen.save();
    pen.translate(hx, y);
    pen.rotate(-0.012);
    write(pen, rng, HIDDEN_LINE.th, 0, 0, { font: `400 ${Math.round(thSize - 2)}px ${FONTS.hand}`, size: thSize - 2, color: '#5d5f66', seed: 21, alpha: hAlpha, pressure: 0.7, jy: 1, wave: 1, rot: 0.03 });
    write(pen, rng, HIDDEN_LINE.en, 24, SP - 2, { font: `400 ${Math.round(enSize - 1)}px ${FONTS.hand}`, size: enSize - 1, color: '#5d5f66', seed: 22, alpha: hAlpha * 0.85, pressure: 0.7, jy: 1, wave: 0.8 });
    pen.restore();
    li += 2 + (freeLines > 6 ? 1 : 0);
  }
  if (passengerNotes.length) {
    // the player's own list, in pencil, slanted
    let y = lineY(li + 1);
    for (const n of passengerNotes) {
      if ((y - TOP) / SP > LAST + 0.5) break;
      const text = truncate(pen, n, plan.annFont, 540);
      handLine(pen, rng, X0 + 2, y - 8, X0 + 12, y - 8, { width: 2, color: GRAPHITE, alpha: 0.7, wave: 0.1 });
      write(pen, rng, text, X0 + 24, y, { ...annO, seed: y * 0.01 });
      y += SP;
      li++;
    }
  }
  // signature (bottom right)
  {
    const sy0 = Math.min(lineY(LAST) - 4, Math.max(lineY(li + 2), lineY(LAST - 1)));
    ink.save();
    ink.translate(770, sy0);
    ink.rotate(-0.06);
    const r = write(ink, rng, '— อากง', 0, 0, { font: `600 38px ${FONTS.hand}`, size: 38, color: INK, seed: 31, alpha: 0.95, rot: 0.06 });
    // flourish
    ink.strokeStyle = INK;
    ink.globalAlpha = 0.75;
    ink.lineWidth = 1.8;
    ink.beginPath();
    ink.moveTo(30, 12);
    ink.bezierCurveTo(90, 26, r.x - 10, 2, r.x + 26, -18);
    ink.bezierCurveTo(r.x + 30, -26, r.x + 6, -20, r.x + 14, 4);
    ink.stroke();
    ink.restore();
    // the little fork map, if the page has room
    if (!passengerNotes.length && LAST - li >= 4) forkDoodle(ink, rng, 470, sy0 - 52, 1.0);
  }

  // ---- texture the ink (ballpoint skips) and pencil (graphite grain) -------------
  ink.setTransform(1, 0, 0, 1, 0, 0);
  ink.globalCompositeOperation = 'destination-out';
  ink.fillStyle = noisePattern(ink, 0.07, 3);
  ink.fillRect(0, 0, w, h);
  pen.setTransform(1, 0, 0, 1, 0, 0);
  pen.globalCompositeOperation = 'destination-out';
  pen.fillStyle = noisePattern(pen, 0.38, 5);
  pen.fillRect(0, 0, w, h);

  // ---- composite onto the page --------------------------------------------------
  ctx.save();
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  ctx.clip(shape.path);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.96;
  ctx.drawImage(inkC, 0, 0);
  ctx.globalAlpha = 0.9;
  ctx.drawImage(penC, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // a faint ink halo (ballpoint ink slightly feathers into old paper)
  ctx.globalAlpha = 0.18;
  ctx.filter = 'blur(1.2px)';
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(inkC, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // ---- stains, burn, folds, wear (over the writing) --------------------------------
  ctx.save();
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  ctx.clip(shape.path);
  const drng = makeRng(4242);
  // water stain: the ink under it bled
  {
    const cx = 300, cy = 668, r = 96;
    const p = blobPath(drng, cx, cy, r, 0.3, 2.2);
    ctx.save();
    ctx.clip(p);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = 'blur(1.8px)';
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(inkC, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    waterStain(ctx, drng, cx, cy, r, 2.2);
  }
  waterStain(ctx, drng, 880, 260, 46, 8.1);
  ctx.globalCompositeOperation = 'multiply';
  coffeeRing(ctx, drng, 770, 1030, 92, 1, 0.8);
  coffeeRing(ctx, drng, 802, 1062, 90, 0.55, 1.4);
  thumbprint(ctx, drng, 942, 560, 0.5);
  ctx.globalCompositeOperation = 'source-over';
  folds(ctx, drng, shape);
  cigaretteBurn(ctx, drng, 70, 1322);
  edgeWear(ctx, shape);
  tornFibres(ctx, drng, shape);
  ctx.restore();
  ctx.save();
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  dogEar(ctx, shape);
  ctx.restore();
  ctx.restore();
}
