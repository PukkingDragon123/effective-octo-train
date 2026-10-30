// Painted foliage atlas for the world's vegetation (4x4 slots). Each slot is a complete
// "card" image designed for a specific geometry (leaf clusters, banana blade, palm frond,
// fern frond, grass clump, elephant ear, vine curtain...). Painted with layered brush
// shapes on a 2D canvas, then colour-dilated into the transparent texels so mipmaps
// never bleed dark halos. CPU-side only at build time.
import * as THREE from 'three';
import { makeRng } from '../core/math.js';

export const SLOT = {
  broadA: 0, broadB: 1, rain: 2, fig: 3,
  bamboo: 4, banana: 5, bananaDead: 6, palm: 7,
  fern: 8, grass: 9, elephant: 10, vines: 11,
  shrub: 12, deadTwigs: 13, epiphyte: 14, tallGrass: 15,
};
export const ATLAS_GRID = 4;

/** UV rect of a slot (inset a little to avoid bleeding). */
export function slotRect(slot) {
  const g = ATLAS_GRID;
  const x = slot % g, y = Math.floor(slot / g);
  const inset = 2 / 2048;
  // canvas row 0 is the top; textures are flipped so v = 1 - row
  return { u0: x / g + inset, u1: (x + 1) / g - inset, v0: 1 - (y + 1) / g + inset, v1: 1 - y / g - inset };
}

// ----------------------------------------------------------------------------------
const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(1)},${(s * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%,${a})`;

/** A single leaf shape (pointed ellipse) along +Y from the origin, length len, width w. */
function leafPath(g, len, w, tipSharp = 0.6, asym = 0) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(w * (0.9 + asym), len * 0.18, w * (0.75 + asym), len * (0.75 - tipSharp * 0.2), 0, len);
  g.bezierCurveTo(-w * (0.75 - asym), len * (0.75 - tipSharp * 0.2), -w * (0.9 - asym), len * 0.18, 0, 0);
  g.closePath();
}

function paintLeaf(g, rng, x, y, ang, len, w, base, opts = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const [h, s, l] = base;
  const hh = h + (rng() - 0.5) * (opts.hueJ ?? 14), ss = s * (0.8 + rng() * 0.35), ll = l * (0.7 + rng() * 0.55);
  leafPath(g, len, w, opts.tip ?? 0.6, (rng() - 0.5) * 0.15);
  const grd = g.createLinearGradient(-w, 0, w, len);
  grd.addColorStop(0, hsl(hh, ss, ll * 0.7));
  grd.addColorStop(0.55, hsl(hh + 4, ss, ll));
  grd.addColorStop(1, hsl(hh + 8, ss * 0.9, Math.min(0.85, ll * 1.25)));
  g.fillStyle = grd;
  g.fill();
  // painterly light side
  g.save();
  g.clip();
  g.globalAlpha = 0.35;
  g.fillStyle = hsl(hh + 10, ss * 0.8, Math.min(0.9, ll * 1.6));
  g.beginPath();
  g.ellipse(w * 0.35, len * 0.55, w * 0.45, len * 0.38, 0.2, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 0.25;
  g.fillStyle = hsl(hh - 6, ss, ll * 0.45);
  g.beginPath();
  g.ellipse(-w * 0.45, len * 0.4, w * 0.4, len * 0.45, -0.1, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // midrib & a few veins
  if (opts.rib !== false) {
    g.strokeStyle = hsl(hh + 12, ss * 0.6, Math.min(0.85, ll * 1.5), 0.55);
    g.lineWidth = Math.max(0.6, w * 0.07);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(w * 0.05, len * 0.5, 0, len * 0.96);
    g.stroke();
    if (opts.veins) {
      g.lineWidth = Math.max(0.4, w * 0.03);
      g.strokeStyle = hsl(hh + 10, ss * 0.5, Math.min(0.85, ll * 1.35), 0.3);
      for (let k = 1; k < 6; k++) {
        const t = k / 6;
        g.beginPath();
        g.moveTo(0, len * t * 0.9);
        g.lineTo(w * 0.7, len * (t * 0.9 + 0.12));
        g.moveTo(0, len * t * 0.9);
        g.lineTo(-w * 0.7, len * (t * 0.9 + 0.12));
        g.stroke();
      }
    }
  }
  g.restore();
}

function twig(g, x0, y0, x1, y1, width, col) {
  g.strokeStyle = col;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo((x0 + x1) / 2 + (y1 - y0) * 0.1, (y0 + y1) / 2, x1, y1);
  g.stroke();
}

// ----------------------------------------------------------------------------------
// Slot painters. Each draws into a S x S region (origin top-left).
// ----------------------------------------------------------------------------------
function paintCluster(g, S, rng, base, opts = {}) {
  // a cluster of leaves radiating from twigs, dense in the middle, ragged edges
  const n = opts.count ?? 70;
  const cx = S / 2, cy = S * (opts.cy ?? 0.55);
  const twigs = [];
  for (let i = 0; i < (opts.twigs ?? 6); i++) {
    const a = -Math.PI / 2 + (rng() - 0.5) * 2.6;
    const L = S * (0.25 + rng() * 0.2);
    twigs.push({ x0: cx + (rng() - 0.5) * S * 0.1, y0: S * 0.98, x1: cx + Math.cos(a) * L, y1: cy + Math.sin(a) * L * 0.9 });
  }
  for (const t of twigs) twig(g, t.x0, t.y0, t.x1, t.y1, S * 0.012, hsl(25, 0.25, 0.18));
  const leaves = [];
  for (let i = 0; i < n; i++) {
    const t = twigs[i % twigs.length];
    const f = 0.35 + rng() * 0.75;
    const x = t.x0 + (t.x1 - t.x0) * f + (rng() - 0.5) * S * 0.18;
    const y = t.y0 + (t.y1 - t.y0) * f + (rng() - 0.5) * S * 0.18;
    leaves.push({ x, y, d: Math.hypot(x - cx, y - cy) });
  }
  // back leaves (darker) first, front leaves later
  leaves.sort((a, b) => b.d - a.d);
  for (const L of leaves) {
    const ang = Math.atan2(L.y - cy, L.x - cx) + Math.PI / 2 + (rng() - 0.5) * 1.2;
    const len = S * (opts.len ?? 0.16) * (0.7 + rng() * 0.6);
    const w = len * (opts.aspect ?? 0.32) * (0.8 + rng() * 0.4);
    const dark = L.d / (S * 0.5);
    paintLeaf(g, rng, L.x, L.y, ang + Math.PI, len, w, [base[0], base[1], base[2] * (1.05 - dark * 0.3)], { tip: opts.tip, veins: opts.veins, hueJ: opts.hueJ });
  }
}

function paintRainTree(g, S, rng) {
  // feathery bipinnate foliage: many tiny leaflets along fine rachises
  const cx = S / 2;
  for (let i = 0; i < 9; i++) twig(g, cx + (rng() - 0.5) * S * 0.2, S, cx + (rng() - 0.5) * S * 0.9, S * (0.15 + rng() * 0.4), S * 0.01, hsl(30, 0.3, 0.2));
  for (let k = 0; k < 46; k++) {
    const x0 = S * (0.08 + rng() * 0.84), y0 = S * (0.12 + rng() * 0.7);
    const ang = (rng() - 0.5) * 2.4 - Math.PI / 2;
    const L = S * (0.12 + rng() * 0.12);
    const h = 88 + (rng() - 0.5) * 18, l = 0.2 + rng() * 0.17;
    g.strokeStyle = hsl(70, 0.3, 0.25, 0.8);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x0 + Math.cos(ang) * L, y0 + Math.sin(ang) * L);
    g.stroke();
    for (let j = 0; j < 14; j++) {
      const t = j / 14;
      const px = x0 + Math.cos(ang) * L * t, py = y0 + Math.sin(ang) * L * t;
      for (const sgn of [-1, 1]) {
        const a2 = ang + sgn * (1.1 + rng() * 0.3);
        paintLeaf(g, rng, px, py, a2 - Math.PI / 2, S * 0.032 * (1.1 - t * 0.4), S * 0.012, [h, 0.42, l], { rib: false, hueJ: 8 });
      }
    }
  }
}

function paintBambooSprig(g, S, rng) {
  const cx = S * 0.5;
  twig(g, cx, S, cx + S * 0.05, S * 0.05, S * 0.012, hsl(60, 0.3, 0.32));
  for (let i = 0; i < 26; i++) {
    const t = 0.08 + (i / 26) * 0.85;
    const y = S * (1 - t);
    const side = i % 2 ? 1 : -1;
    const ang = side * (0.9 + rng() * 0.5) + Math.PI;
    const len = S * (0.26 + rng() * 0.12) * (1 - t * 0.35);
    paintLeaf(g, rng, cx + S * 0.05 * t, y, ang, len, len * 0.11, [78 + rng() * 12, 0.45, 0.3], { tip: 0.9, hueJ: 10 });
  }
}

function paintBananaLeaf(g, S, rng, dead) {
  // single blade: midrib along V (bottom -> top), lamina across U, torn into strips
  const cx = S / 2;
  const base = dead ? [32, 0.38, 0.32] : [92, 0.48, 0.3];
  const strips = 26;
  for (const side of [-1, 1]) {
    for (let i = 0; i < strips; i++) {
      const t0 = 0.04 + (i / strips) * 0.92, t1 = t0 + 0.92 / strips + 0.004;
      const y0 = S * (1 - t0), y1 = S * (1 - t1);
      const wMax = S * 0.46 * Math.sin(Math.min(1, (t0 + 0.05) / 0.98) * Math.PI) ** 0.6;
      const tear = rng() < (dead ? 0.6 : 0.35) ? 0.55 + rng() * 0.4 : 1;
      const w = wMax * tear;
      const ll = base[2] * (0.75 + rng() * 0.45) * (dead ? 1 : 1);
      g.fillStyle = hsl(base[0] + (rng() - 0.5) * 10, base[1] * (0.8 + rng() * 0.3), ll);
      g.beginPath();
      g.moveTo(cx, y0);
      g.lineTo(cx + side * w, y0 - S * 0.012);
      g.lineTo(cx + side * w * (0.96 + rng() * 0.08), y1 - S * 0.012);
      g.lineTo(cx, y1);
      g.closePath();
      g.fill();
      // vein stripes
      g.strokeStyle = hsl(base[0] + 6, base[1] * 0.7, ll * 1.25, 0.35);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx, y0);
      g.lineTo(cx + side * w, y0 - S * 0.012);
      g.stroke();
      if (dead || rng() < 0.25) {
        g.fillStyle = hsl(30, 0.35, 0.22 + rng() * 0.12, 0.6);
        g.fillRect(cx + side * w * 0.85 - (side < 0 ? w * 0.15 : 0), y1, w * 0.15, y0 - y1);
      }
    }
  }
  // midrib
  g.strokeStyle = dead ? hsl(35, 0.3, 0.42) : hsl(80, 0.35, 0.55);
  g.lineWidth = S * 0.02;
  g.beginPath();
  g.moveTo(cx, S);
  g.lineTo(cx, S * 0.03);
  g.stroke();
}

function paintPalmFrond(g, S, rng) {
  const cx = S / 2;
  g.strokeStyle = hsl(55, 0.35, 0.3);
  g.lineWidth = S * 0.014;
  g.beginPath();
  g.moveTo(cx, S);
  g.lineTo(cx, 0);
  g.stroke();
  for (let i = 0; i < 44; i++) {
    const t = 0.05 + (i / 44) * 0.92;
    const y = S * (1 - t);
    for (const side of [-1, 1]) {
      const len = S * 0.48 * Math.sin((t * 0.9 + 0.08) * Math.PI) * (0.85 + rng() * 0.2);
      const ang = side * (1.25 + (rng() - 0.5) * 0.2) - (side > 0 ? 0 : 0) + Math.PI;
      paintLeaf(g, rng, cx, y, ang, len, S * 0.014, [80 + rng() * 10, 0.42, 0.3], { tip: 0.9, rib: false, hueJ: 8 });
    }
  }
}

function paintFern(g, S, rng) {
  const cx = S / 2;
  g.strokeStyle = hsl(70, 0.35, 0.22);
  g.lineWidth = S * 0.01;
  g.beginPath();
  g.moveTo(cx, S);
  g.quadraticCurveTo(cx + S * 0.03, S * 0.5, cx, S * 0.02);
  g.stroke();
  for (let i = 0; i < 30; i++) {
    const t = 0.06 + (i / 30) * 0.92;
    const y = S * (1 - t);
    const pl = S * 0.44 * Math.sin(Math.min(1, t * 1.1 + 0.05) * Math.PI * 0.95) ** 0.8;
    for (const side of [-1, 1]) {
      // pinna made of small lobes
      const n = 7;
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n;
        const px = cx + side * pl * f, py = y - pl * f * 0.25;
        paintLeaf(g, rng, px, py, side * 0.35 + Math.PI * (side > 0 ? 0.5 : -0.5) + Math.PI, pl * 0.16, pl * 0.07, [96 + rng() * 14, 0.45, 0.27 + rng() * 0.08], { rib: false, tip: 0.3, hueJ: 6 });
      }
    }
  }
}

function paintGrass(g, S, rng, tall) {
  const n = tall ? 70 : 90;
  for (let i = 0; i < n; i++) {
    const x0 = S * (0.3 + rng() * 0.4);
    const lean = (rng() - 0.5) * S * (tall ? 0.7 : 0.9);
    const h = S * (0.55 + rng() * 0.42);
    const w = S * (tall ? 0.012 : 0.016) * (0.7 + rng() * 0.6);
    const l = 0.24 + rng() * 0.22;
    const hue = 70 + rng() * 25 - (rng() < 0.2 ? 30 : 0);
    g.fillStyle = hsl(hue, 0.42 + rng() * 0.2, l);
    g.beginPath();
    g.moveTo(x0 - w, S);
    g.quadraticCurveTo(x0 + lean * 0.3, S - h * 0.6, x0 + lean, S - h);
    g.quadraticCurveTo(x0 + lean * 0.3 + w, S - h * 0.6, x0 + w, S);
    g.closePath();
    g.fill();
    if (tall && rng() < 0.25) {
      // cogon plume
      g.fillStyle = hsl(40, 0.2, 0.72, 0.8);
      g.beginPath();
      g.ellipse(x0 + lean, S - h, S * 0.012, S * 0.06, lean * 0.002, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function paintElephantEar(g, S, rng) {
  // big heart-shaped peltate leaf, stalk attaches near the notch at the bottom
  const cx = S / 2, cy = S * 0.52;
  const R = S * 0.46;
  g.save();
  g.translate(cx, cy);
  g.beginPath();
  g.moveTo(0, R * 0.62);
  g.bezierCurveTo(-R * 0.25, R * 0.95, -R * 1.02, R * 0.6, -R * 0.92, -R * 0.05);
  g.bezierCurveTo(-R * 0.82, -R * 0.65, -R * 0.2, -R * 1.02, 0, -R * 1.05);
  g.bezierCurveTo(R * 0.2, -R * 1.02, R * 0.82, -R * 0.65, R * 0.92, -R * 0.05);
  g.bezierCurveTo(R * 1.02, R * 0.6, R * 0.25, R * 0.95, 0, R * 0.62);
  g.closePath();
  const grd = g.createRadialGradient(0, R * 0.2, R * 0.05, 0, 0, R * 1.1);
  grd.addColorStop(0, hsl(95, 0.4, 0.42));
  grd.addColorStop(0.6, hsl(105, 0.45, 0.28));
  grd.addColorStop(1, hsl(110, 0.45, 0.2));
  g.fillStyle = grd;
  g.fill();
  g.clip();
  g.strokeStyle = hsl(85, 0.35, 0.55, 0.55);
  for (let k = 0; k < 9; k++) {
    const a = -Math.PI / 2 + (k - 4) * 0.33;
    g.lineWidth = k === 4 ? S * 0.012 : S * 0.006;
    g.beginPath();
    g.moveTo(0, R * 0.25);
    g.quadraticCurveTo(Math.cos(a) * R * 0.5, R * 0.25 + Math.sin(a) * R * 0.5, Math.cos(a) * R * 1.1, Math.sin(a) * R * 1.05);
    g.stroke();
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = hsl(90 + rng() * 20, 0.4, 0.25 + rng() * 0.2, 0.18);
    g.beginPath();
    g.ellipse((rng() - 0.5) * R * 1.6, (rng() - 0.5) * R * 1.6, R * 0.2, R * 0.1, rng() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function paintVines(g, S, rng) {
  // hanging strands (lianas / aerial roots) with small leaves, top attached
  for (let i = 0; i < 22; i++) {
    const x0 = S * (0.05 + rng() * 0.9);
    const len = S * (0.5 + rng() * 0.5);
    const sway = (rng() - 0.5) * S * 0.12;
    const root = rng() < 0.4;
    g.strokeStyle = root ? hsl(30, 0.2, 0.3 + rng() * 0.15) : hsl(80, 0.35, 0.22);
    g.lineWidth = S * (root ? 0.006 : 0.004) * (0.7 + rng());
    g.beginPath();
    g.moveTo(x0, 0);
    g.quadraticCurveTo(x0 + sway, len * 0.5, x0 + sway * 0.4, len);
    g.stroke();
    if (!root) {
      for (let k = 0; k < 14; k++) {
        const t = rng();
        const px = x0 + sway * (t < 0.5 ? t * 2 * 0.5 : 0.5 - (t - 0.5) * 0.2) * 1, py = len * t;
        paintLeaf(g, rng, px, py, (rng() - 0.5) * 2 + Math.PI * (rng() < 0.5 ? 0.5 : -0.5), S * 0.045, S * 0.018, [95 + rng() * 15, 0.42, 0.26], { rib: false });
      }
    }
  }
}

function paintEpiphyte(g, S, rng) {
  // bird's-nest fern rosette seen from the side + small mosses
  const cx = S / 2;
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI / 2 + (i / 15 - 0.5) * 2.6;
    const len = S * (0.38 + rng() * 0.12);
    paintLeaf(g, rng, cx + Math.cos(a) * S * 0.03, S * 0.92, a + Math.PI / 2 + Math.PI, len, len * 0.15, [88 + rng() * 10, 0.5, 0.32], { tip: 0.5, hueJ: 8 });
  }
  g.fillStyle = hsl(30, 0.3, 0.16);
  g.beginPath();
  g.ellipse(cx, S * 0.94, S * 0.12, S * 0.05, 0, 0, Math.PI * 2);
  g.fill();
}

function paintDeadTwigs(g, S, rng) {
  for (let i = 0; i < 14; i++) {
    let x = S * (0.3 + rng() * 0.4), y = S;
    let a = -Math.PI / 2 + (rng() - 0.5) * 1.4;
    let w = S * 0.014;
    for (let k = 0; k < 6; k++) {
      const L = S * (0.06 + rng() * 0.1);
      const nx = x + Math.cos(a) * L, ny = y + Math.sin(a) * L;
      twig(g, x, y, nx, ny, w, hsl(25, 0.15, 0.22 + rng() * 0.1));
      if (rng() < 0.6) paintLeaf(g, rng, nx, ny, a + Math.PI / 2 + (rng() - 0.5), S * 0.05, S * 0.02, [30, 0.4, 0.28], { rib: false });
      x = nx;
      y = ny;
      a += (rng() - 0.5) * 0.9;
      w *= 0.8;
    }
  }
}

// ----------------------------------------------------------------------------------
let _atlas = null;

/** Build (once) and return the foliage atlas DataTexture. size = atlas px (2048 high / 1024 low). */
export function foliageAtlas(size = 2048) {
  if (_atlas) return _atlas;
  const S = size / ATLAS_GRID;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const rng = makeRng(77123);
  const paint = (slot, fn) => {
    const x = (slot % ATLAS_GRID) * S, y = Math.floor(slot / ATLAS_GRID) * S;
    g.save();
    g.beginPath();
    g.rect(x, y, S, S);
    g.clip();
    g.translate(x, y);
    fn(S);
    g.restore();
  };
  paint(SLOT.broadA, (S) => paintCluster(g, S, rng, [96, 0.42, 0.24], { count: 150, len: 0.105, aspect: 0.36, veins: true, twigs: 8 }));
  paint(SLOT.broadB, (S) => paintCluster(g, S, rng, [84, 0.4, 0.29], { count: 70, len: 0.19, aspect: 0.42, twigs: 6, veins: true, tip: 0.4 }));
  paint(SLOT.rain, (S) => paintRainTree(g, S, rng));
  paint(SLOT.fig, (S) => paintCluster(g, S, rng, [110, 0.38, 0.2], { count: 190, len: 0.085, aspect: 0.5, tip: 0.3, twigs: 9 }));
  paint(SLOT.bamboo, (S) => paintBambooSprig(g, S, rng));
  paint(SLOT.banana, (S) => paintBananaLeaf(g, S, rng, false));
  paint(SLOT.bananaDead, (S) => paintBananaLeaf(g, S, rng, true));
  paint(SLOT.palm, (S) => paintPalmFrond(g, S, rng));
  paint(SLOT.fern, (S) => paintFern(g, S, rng));
  paint(SLOT.grass, (S) => paintGrass(g, S, rng, false));
  paint(SLOT.elephant, (S) => paintElephantEar(g, S, rng));
  paint(SLOT.vines, (S) => paintVines(g, S, rng));
  paint(SLOT.shrub, (S) => paintCluster(g, S, rng, [100, 0.4, 0.22], { count: 190, len: 0.075, aspect: 0.45, twigs: 10, tip: 0.5, cy: 0.5 }));
  paint(SLOT.deadTwigs, (S) => paintDeadTwigs(g, S, rng));
  paint(SLOT.epiphyte, (S) => paintEpiphyte(g, S, rng));
  paint(SLOT.tallGrass, (S) => paintGrass(g, S, rng, true));

  const img = g.getImageData(0, 0, size, size);
  dilate(img.data, size, size, 6);
  // flip rows so v = 1 is the canvas top (CanvasTexture convention)
  const row = size * 4;
  const flipped = new Uint8Array(img.data.length);
  for (let y = 0; y < size; y++) flipped.set(img.data.subarray(y * row, (y + 1) * row), (size - 1 - y) * row);
  const tex = new THREE.DataTexture(flipped, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  tex.name = 'worldFoliageAtlas';
  _atlas = tex;
  return tex;
}

/** Spread opaque colours into transparent texels (keeps alpha). passes = max distance in px. */
function dilate(d, w, h, passes) {
  // un-premultiply is not needed: getImageData returns straight alpha
  const n = w * h;
  const filled = new Uint8Array(n);
  for (let i = 0; i < n; i++) filled[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  let frontier = [];
  for (let i = 0; i < n; i++) if (!filled[i]) frontier.push(i);
  for (let p = 0; p < passes && frontier.length; p++) {
    const next = [];
    const newly = [];
    for (const i of frontier) {
      const x = i % w, y = (i / w) | 0;
      let r = 0, gg = 0, b = 0, c = 0;
      if (x > 0 && filled[i - 1]) { r += d[(i - 1) * 4]; gg += d[(i - 1) * 4 + 1]; b += d[(i - 1) * 4 + 2]; c++; }
      if (x < w - 1 && filled[i + 1]) { r += d[(i + 1) * 4]; gg += d[(i + 1) * 4 + 1]; b += d[(i + 1) * 4 + 2]; c++; }
      if (y > 0 && filled[i - w]) { r += d[(i - w) * 4]; gg += d[(i - w) * 4 + 1]; b += d[(i - w) * 4 + 2]; c++; }
      if (y < h - 1 && filled[i + w]) { r += d[(i + w) * 4]; gg += d[(i + w) * 4 + 1]; b += d[(i + w) * 4 + 2]; c++; }
      if (c) {
        d[i * 4] = r / c;
        d[i * 4 + 1] = gg / c;
        d[i * 4 + 2] = b / c;
        newly.push(i);
      } else next.push(i);
    }
    for (const i of newly) filled[i] = 1;
    frontier = next;
  }
  // remaining: average foliage colour
  for (const i of frontier) {
    d[i * 4] = 28;
    d[i * 4 + 1] = 40;
    d[i * 4 + 2] = 20;
  }
}
