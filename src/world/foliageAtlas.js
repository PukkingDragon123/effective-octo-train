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
  small: 16, smallDark: 17,
};
export const ATLAS_GRID = 5;
export const ATLAS_SIZE = 2560;

/** UV rect of a slot (inset a little to avoid bleeding). */
export function slotRect(slot) {
  const g = ATLAS_GRID;
  const x = slot % g, y = Math.floor(slot / g);
  const inset = 2 / ATLAS_SIZE;
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

/**
 * Reference-6 foliage: several sub-clumps of many small, individually readable leaves on thin
 * twigs, with see-through gaps between clumps; back leaves dark, front leaves pale.
 */
function paintSmallLeaves(g, S, rng, dark) {
  const base = dark ? [98, 0.34, 0.2] : [86, 0.42, 0.29];
  const clumps = [];
  const nC = 6 + Math.floor(rng() * 3);
  for (let i = 0; i < nC; i++) {
    const a = -Math.PI / 2 + (rng() - 0.5) * 2.5;
    const d = S * (0.1 + rng() * 0.28);
    clumps.push({ x: S / 2 + Math.cos(a) * d, y: S * 0.52 + Math.sin(a) * d * 0.95, r: S * (0.085 + rng() * 0.06) });
  }
  for (const c of clumps) {
    const x0 = S / 2 + (rng() - 0.5) * S * 0.05;
    twig(g, x0, S * 0.98, c.x, c.y, S * 0.007, hsl(28, 0.2, 0.15));
    for (let k = 0; k < 4; k++) {
      const a = rng() * Math.PI * 2;
      twig(g, c.x, c.y, c.x + Math.cos(a) * c.r * 0.9, c.y + Math.sin(a) * c.r * 0.8, S * 0.004, hsl(30, 0.2, 0.17));
    }
  }
  const leaves = [];
  for (const c of clumps) {
    const n = 26 + Math.floor(rng() * 16);
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng()) * c.r;
      leaves.push({ x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr * 0.85, depth: rng(), c });
    }
  }
  // a few stray leaves outside the clumps break the outline
  for (let k = 0; k < 18; k++) leaves.push({ x: S * (0.1 + rng() * 0.8), y: S * (0.1 + rng() * 0.75), depth: rng(), c: { x: S / 2, y: S * 0.9 } });
  leaves.sort((a, b) => a.depth - b.depth);
  for (const L of leaves) {
    const ang = Math.atan2(L.y - L.c.y, L.x - L.c.x) + Math.PI / 2 + (rng() - 0.5) * 1.1 + Math.PI;
    const len = S * 0.06 * (0.72 + rng() * 0.55);
    const w = len * (0.42 + rng() * 0.12);
    const lv = 0.5 + L.depth * 0.85;
    const yellow = !dark && rng() < 0.05;
    paintLeaf(g, rng, L.x, L.y, ang, len, w, [yellow ? 58 : base[0], base[1], base[2] * lv], { tip: 0.45, veins: false, hueJ: 16 });
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
const _pre = {}; // pixels painted ahead of time by the boot worker (atlasWorker.js)

/** A 2D canvas here or in a worker. */
export function makeCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

/** Pixels painted elsewhere (the boot worker): { atlas: {size, data}, flats: {data} }. */
export function adoptAtlasPixels(kind, entry) {
  if (!_pre[kind]) _pre[kind] = entry;
}

/** Build (once) and return the foliage atlas DataTexture. size = atlas px (2048 high / 1024 low). */
export function foliageAtlas(size = ATLAS_SIZE) {
  if (_atlas) return _atlas;
  const pre = _pre.atlas && _pre.atlas.size === size ? _pre.atlas.data : null;
  const flipped = pre || atlasPixels(size);
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

/** Paint the atlas; returns RGBA rows bottom-up (DataTexture layout). */
export function atlasPixels(size = ATLAS_SIZE) {
  const S = size / ATLAS_GRID;
  const canvas = makeCanvas(size, size);
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
  paint(SLOT.small, (S) => paintSmallLeaves(g, S, rng, false));
  paint(SLOT.smallDark, (S) => paintSmallLeaves(g, S, rng, true));

  const img = g.getImageData(0, 0, size, size);
  dilate(img.data, size, size, 6);
  // flip rows so v = 1 is the canvas top (CanvasTexture convention)
  const row = size * 4;
  const flipped = new Uint8Array(img.data.length);
  for (let y = 0; y < size; y++) flipped.set(img.data.subarray(y * row, (y + 1) * row), (size - 1 - y) * row);
  return flipped;
}

/** Spread opaque colours into transparent texels (keeps alpha). passes = max distance in px. */
function dilate(d, w, h, passes) {
  // un-premultiply is not needed: getImageData returns straight alpha
  // Same result as testing every empty texel each pass, but only the texels next to the filled
  // region are visited (a pass fills exactly the empty texels with a filled 4-neighbour).
  const n = w * h;
  const filled = new Uint8Array(n); // 0 empty, 1 filled, 2 queued for the current pass
  for (let i = 0; i < n; i++) filled[i] = d[i * 4 + 3] > 8 ? 1 : 0;
  let cand = new Int32Array(Math.min(n, 1 << 16));
  let nc = 0;
  const push = (i) => {
    if (nc === cand.length) {
      const c2 = new Int32Array(Math.min(n, cand.length * 2));
      c2.set(cand);
      cand = c2;
    }
    cand[nc++] = i;
  };
  const queueNeighbours = (i) => {
    const x = i % w;
    if (x > 0 && filled[i - 1] === 0) { filled[i - 1] = 2; push(i - 1); }
    if (x < w - 1 && filled[i + 1] === 0) { filled[i + 1] = 2; push(i + 1); }
    if (i >= w && filled[i - w] === 0) { filled[i - w] = 2; push(i - w); }
    if (i + w < n && filled[i + w] === 0) { filled[i + w] = 2; push(i + w); }
  };
  for (let i = 0; i < n; i++) if (filled[i] === 1) queueNeighbours(i);
  for (let p = 0; p < passes && nc; p++) {
    const list = cand.slice(0, nc);
    nc = 0;
    // colours from neighbours filled before this pass (queued texels are not read)
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      const x = i % w;
      let r = 0, gg = 0, b = 0, c = 0;
      if (x > 0 && filled[i - 1] === 1) { r += d[(i - 1) * 4]; gg += d[(i - 1) * 4 + 1]; b += d[(i - 1) * 4 + 2]; c++; }
      if (x < w - 1 && filled[i + 1] === 1) { r += d[(i + 1) * 4]; gg += d[(i + 1) * 4 + 1]; b += d[(i + 1) * 4 + 2]; c++; }
      if (i >= w && filled[i - w] === 1) { r += d[(i - w) * 4]; gg += d[(i - w) * 4 + 1]; b += d[(i - w) * 4 + 2]; c++; }
      if (i + w < n && filled[i + w] === 1) { r += d[(i + w) * 4]; gg += d[(i + w) * 4 + 1]; b += d[(i + w) * 4 + 2]; c++; }
      d[i * 4] = r / c;
      d[i * 4 + 1] = gg / c;
      d[i * 4 + 2] = b / c;
    }
    for (let k = 0; k < list.length; k++) filled[list[k]] = 1;
    if (p + 1 < passes) for (let k = 0; k < list.length; k++) queueNeighbours(list[k]);
  }
  // remaining: average foliage colour
  for (let i = 0; i < n; i++) {
    if (filled[i] === 1) continue;
    d[i * 4] = 28;
    d[i * 4 + 1] = 40;
    d[i * 4 + 2] = 20;
  }
}

// ----------------------------------------------------------------------------------
// Background "stage flats": painted silhouettes of a jungle tree line (trunks, ragged
// crowns of small leaves, hanging lianas, a few palm and bamboo arcs) for the far layers in
// the fog. Two horizontal strips (v 0..0.5 and 0.5..1), each tileable along u.
// ----------------------------------------------------------------------------------
let _flats = null;
const FLATS_W = 2048, FLATS_H = 1024;
export function silhouetteTexture() {
  if (_flats) return _flats;
  const Wd = FLATS_W, Hh = FLATS_H;
  const flipped = (_pre.flats && _pre.flats.data) || silhouettePixels();
  const tex = new THREE.DataTexture(flipped, Wd, Hh, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  tex.name = 'worldSilhouettes';
  _flats = tex;
  return tex;
}

/** Paint the tree-line silhouette strips; returns RGBA rows bottom-up. */
export function silhouettePixels() {
  const Wd = FLATS_W, Hh = FLATS_H, SH = Hh / 2;
  const canvas = makeCanvas(Wd, Hh);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const rng = makeRng(31337);
  for (let strip = 0; strip < 2; strip++) {
    g.save();
    g.beginPath();
    g.rect(0, strip * SH, Wd, SH);
    g.clip();
    g.translate(0, strip * SH);
    const col = (l, a = 1) => hsl(100 + rng() * 30, 0.18, l, a);
    // undergrowth band
    for (let i = 0; i < 900; i++) {
      const x = rng() * Wd, y = SH - rng() * SH * 0.22;
      g.save();
      g.translate(x, y);
      g.rotate(-Math.PI / 2 + (rng() - 0.5) * 1.6);
      leafPath(g, SH * (0.03 + rng() * 0.05), SH * 0.012, 0.5);
      g.fillStyle = col(0.1 + rng() * 0.06);
      g.fill();
      g.restore();
    }
    // trunks + crowns (wrap around the tile edge for seamless tiling)
    const nT = strip === 0 ? 9 : 12;
    for (let t = 0; t < nT; t++) {
      const x0 = ((t + rng() * 0.7) / nT) * Wd;
      const topY = SH * (0.06 + rng() * 0.3);
      const w = SH * (0.008 + rng() * 0.018);
      for (const dx of [0, -Wd, Wd]) {
        const xb = x0 + dx;
        g.strokeStyle = col(0.09 + rng() * 0.04);
        g.lineCap = 'round';
        // trunk with a low fork
        const fy = SH * (0.55 + rng() * 0.25);
        g.lineWidth = w * 1.4;
        g.beginPath();
        g.moveTo(xb, SH);
        g.lineTo(xb + (rng() - 0.5) * w * 3, fy);
        g.stroke();
        for (let k = 0; k < 2 + Math.floor(rng() * 2); k++) {
          g.lineWidth = w * (0.9 - k * 0.2);
          g.beginPath();
          g.moveTo(xb, fy);
          const ex = xb + (rng() - 0.5) * SH * 0.5, ey = topY + rng() * SH * 0.15;
          g.quadraticCurveTo(xb + (ex - xb) * 0.2, (fy + ey) * 0.55, ex, ey);
          g.stroke();
          // reaching limbs
          for (let b = 0; b < 3; b++) {
            const f = 0.35 + rng() * 0.5;
            const bx = xb + (ex - xb) * f, by = fy + (ey - fy) * f;
            const lx = bx + (rng() - 0.5) * SH * 0.55, ly = by - rng() * SH * 0.12;
            g.lineWidth = w * 0.45;
            g.beginPath();
            g.moveTo(bx, by);
            g.quadraticCurveTo((bx + lx) / 2, Math.min(by, ly) - SH * 0.05, lx, ly);
            g.stroke();
            crown(g, rng, lx, ly, SH * (0.07 + rng() * 0.06), col);
          }
          crown(g, rng, ex, ey, SH * (0.1 + rng() * 0.08), col);
        }
      }
      // lianas hanging from the crowns
      for (let v = 0; v < 4; v++) {
        const vx = x0 + (rng() - 0.5) * SH * 0.6, vy = topY + SH * 0.1;
        g.strokeStyle = col(0.08, 0.95);
        g.lineWidth = 1 + rng() * 2;
        g.beginPath();
        g.moveTo(vx, vy);
        g.bezierCurveTo(vx + (rng() - 0.5) * 30, vy + SH * 0.2, vx + (rng() - 0.5) * 30, vy + SH * 0.35, vx + (rng() - 0.5) * 20, vy + SH * (0.3 + rng() * 0.35));
        g.stroke();
      }
    }
    // bamboo / palm arcs
    for (let i = 0; i < (strip ? 5 : 3); i++) {
      const x = rng() * Wd;
      for (let c = 0; c < 7; c++) {
        const a = (rng() - 0.5) * 0.9;
        const L = SH * (0.55 + rng() * 0.35);
        g.strokeStyle = col(0.1);
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x, SH);
        const ex = x + Math.sin(a) * L * 1.2, ey = SH - Math.cos(a) * L;
        g.quadraticCurveTo(x + Math.sin(a) * L * 0.3, SH - L * 0.8, ex, ey);
        g.stroke();
        for (let k = 0; k < 12; k++) {
          g.save();
          g.translate(x + (ex - x) * (k / 12) + Math.sin(a) * L * 0.1, SH + (ey - SH) * (k / 12));
          g.rotate((rng() - 0.5) * 3);
          leafPath(g, SH * 0.05, SH * 0.008, 0.9);
          g.fillStyle = col(0.11);
          g.fill();
          g.restore();
        }
      }
    }
    g.restore();
  }
  const img = g.getImageData(0, 0, Wd, Hh);
  dilate(img.data, Wd, Hh, 4);
  const row = Wd * 4;
  const flipped = new Uint8Array(img.data.length);
  for (let y = 0; y < Hh; y++) flipped.set(img.data.subarray(y * row, (y + 1) * row), (Hh - 1 - y) * row);
  return flipped;
}

function crown(g, rng, x, y, r, col) {
  const n = Math.round(r * 2.2);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * r;
    g.save();
    g.translate(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7);
    g.rotate(rng() * Math.PI * 2);
    leafPath(g, r * (0.16 + rng() * 0.12), r * 0.06, 0.5);
    g.fillStyle = col(0.08 + rng() * 0.07);
    g.fill();
    g.restore();
  }
}
