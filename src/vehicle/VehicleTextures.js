// Taxi-specific procedural textures: the body paint atlas (two-tone green/yellow with
// fading, rust, mud, scratches, dings, panel gaps), plus small painted textures for
// lights, gauges, the LED taxi meter, the radio, roof sign, stickers and the photo.
import * as THREE from 'three';
import { makeRng, noise, clamp, lerp } from '../core/math.js';
import { FONTS } from '../ui/fonts.js';
import { engine } from '../core/Engine.js';

/** Highest anisotropic filtering level the GPU offers (vehicle textures are seen at grazing angles). */
export function maxAnisotropy() {
  try {
    return Math.max(4, engine.renderer?.capabilities?.getMaxAnisotropy?.() || 8);
  } catch (e) {
    return 8;
  }
}
/** Supersampling factor for small painted details the player looks at all game (gauges, stickers, meter). */
export const HI = 2;
/** Canvas of w*k x h*k pixels whose 2D context is pre-scaled, so painters keep drawing in w x h units. */
export function hiCanvas(w, h, k = HI) {
  const c = makeCanvas(Math.round(w * k), Math.round(h * k));
  const g = c.getContext('2d');
  g.setTransform(k, 0, 0, k, 0, 0);
  g.imageSmoothingQuality = 'high';
  return [c, g];
}

export const PAINT = {
  green: [46, 104, 64],
  greenFade: [86, 128, 92],
  yellow: [208, 168, 52],
  yellowFade: [212, 190, 120],
  rustDark: [62, 34, 20],
  rust: [126, 64, 30],
  rustLight: [170, 98, 48],
  mud: [86, 70, 52],
  mudLight: [122, 104, 80],
};

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function toTexture(c, opts = {}) {
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = opts.wrap ?? THREE.ClampToEdgeWrapping;
  t.anisotropy = opts.anisotropy ?? maxAnisotropy();
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  if (opts.nearest) t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Grayscale fbm noise canvas computed at low resolution (upscale with drawImage). */
export function noiseCanvas(w, h, { scale = 4, oct = 4, seed = 0, contrast = 1, bias = 0 } = {}) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let n = noise.fbm2((x / w) * scale + seed * 13.1, (y / h) * scale + seed * 7.7, oct);
      n = clamp(0.5 + n * 0.5 * contrast + bias, 0, 1);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = n * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Painterly brush strokes: elongated soft ellipses. */
export function strokes(g, rng, { x0 = 0, y0 = 0, w, h, n = 200, colors, len = [20, 60], width = [3, 9], angle = 0, jitter = 0.4, alpha = [0.03, 0.09] }) {
  for (let i = 0; i < n; i++) {
    const x = x0 + rng() * w, y = y0 + rng() * h;
    const l = rng.range(len[0], len[1]), wd = rng.range(width[0], width[1]);
    const a = angle + (rng() - 0.5) * jitter * 2;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.globalAlpha = rng.range(alpha[0], alpha[1]);
    g.fillStyle = colors[Math.floor(rng() * colors.length)];
    g.beginPath();
    g.ellipse(0, 0, l / 2, wd / 2, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.globalAlpha = 1;
}

/** Ragged blob (rust patch / mud splat). */
function blob(g, rng, x, y, r, color, alpha = 1, lobes = 9, rough = 0.45) {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.beginPath();
  const n = lobes * 3;
  const ph = rng() * 10;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - rough * 0.5 + rough * (0.5 + 0.5 * noise.noise2D(Math.cos(a) * 1.3 + ph, Math.sin(a) * 1.3 + ph * 2)));
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  g.restore();
}

/** Height canvas -> tangent-space normal map canvas. */
export function heightToNormal(hc, strength = 2) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const og = out.getContext('2d');
  const img = og.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

// ---------------------------------------------------------------------------
// Body atlas
// ---------------------------------------------------------------------------
export const ATLAS = {
  size: 2048,
  lowerV: [0.0, 0.62],
  capV: [0.62, 0.66],
  ghV: [0.67, 1.0],
  zMin: -2.25,
  zMax: 2.25,
};
export const lowerU = (z) => (z - ATLAS.zMin) / (ATLAS.zMax - ATLAS.zMin);
export const lowerVmap = (v) => ATLAS.lowerV[0] + v * (ATLAS.lowerV[1] - ATLAS.lowerV[0]);

/**
 * Paints the body atlas. lower = {zs, rings, vArc}, gh = {grid, nCols, nRows, classify(r,c)}.
 * Returns { map, normalMap, roughnessMap }.
 */
export function paintBodyAtlas(lower, gh, opts = {}) {
  const S = opts.size || ATLAS.size;
  const rng = makeRng(opts.seed ?? 4521);
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const HS = S / 2; // height / roughness maps at half res
  const hc = makeCanvas(HS, HS);
  const hg = hc.getContext('2d');
  hg.fillStyle = 'rgb(128,128,128)';
  hg.fillRect(0, 0, HS, HS);
  const rc = makeCanvas(HS, HS);
  const rg = rc.getContext('2d');
  rg.fillStyle = 'rgb(0,128,0)';
  rg.fillRect(0, 0, HS, HS);

  const px = (u) => u * S;
  const py = (v) => (1 - v) * S; // CanvasTexture flipY: v=1 at top row
  const { zs, rings, vArc } = lower;

  // --- helpers to locate side positions (z, y) -> (u, v) ----------------------
  const stationAt = (z) => {
    let i = 0;
    while (i < zs.length - 2 && zs[i + 1] < z) i++;
    const t = clamp((z - zs[i]) / (zs[i + 1] - zs[i] || 1));
    return [i, t];
  };
  const sideV = (z, y, side = 'R') => {
    const [i, t] = stationAt(z);
    const vAt = (r) => {
      const ring = rings[r];
      const va = vArc[r];
      // right side points 3..15, left side mirror indices 25..37
      const idx = side === 'R' ? [3, 15] : [25, 37];
      for (let k = idx[0]; k < idx[1]; k++) {
        const ya = ring[k][1], yb = ring[k + 1][1];
        if ((y >= ya && y <= yb) || (y <= ya && y >= yb)) {
          const f = (y - ya) / (yb - ya || 1);
          return lerp(va[k], va[k + 1], f);
        }
      }
      // clamp
      const yb0 = ring[idx[0]][1];
      return y < yb0 ? va[idx[0]] : va[idx[1]];
    };
    return lowerVmap(lerp(vAt(i), vAt(i + 1), t));
  };
  const deckV = (z, xFrac) => {
    // top deck position: xFrac 0 = centre .. 1 = ledge (right) ; negative = left
    const [i, t] = stationAt(z);
    const f = (r) => {
      const va = vArc[r];
      const k = 20 - Math.abs(xFrac) * 5; // 20 centre, 15 ledge (right)
      const kk = xFrac >= 0 ? k : 40 - k;
      const k0 = Math.floor(kk), fr = kk - k0;
      return lerp(va[k0], va[Math.min(40, k0 + 1)], fr);
    };
    return lowerVmap(lerp(f(i), f(i + 1), t));
  };
  const P = (z, y, side) => [px(lowerU(z)), py(sideV(z, y, side))];

  // --- base two-tone -------------------------------------------------------------
  const L0 = py(ATLAS.lowerV[1]), L1 = py(ATLAS.lowerV[0]);
  g.fillStyle = rgb(PAINT.green);
  g.fillRect(0, L0, S, L1 - L0);
  // yellow band: between the split points on each station (right split idx 9/10, left 30/31)
  g.fillStyle = rgb(PAINT.yellow);
  g.beginPath();
  const up = [], dn = [];
  for (let r = 0; r < zs.length; r++) {
    const u = px(lowerU(zs[r]));
    const vR = lowerVmap((vArc[r][9] + vArc[r][10]) / 2);
    const vL = lowerVmap((vArc[r][30] + vArc[r][31]) / 2);
    up.push([u, py(vR)]);
    dn.push([u, py(vL)]);
  }
  // extend to the atlas edges in u
  g.moveTo(0, up[0][1]);
  for (const p of up) g.lineTo(p[0], p[1]);
  g.lineTo(S, up[up.length - 1][1]);
  g.lineTo(S, dn[dn.length - 1][1]);
  for (let k = dn.length - 1; k >= 0; k--) g.lineTo(dn[k][0], dn[k][1]);
  g.lineTo(0, dn[0][1]);
  g.closePath();
  g.fill();

  // caps region: green below crease (y < 0.70), yellow above (planar x,y mapping)
  const capY = (y) => py(ATLAS.capV[0] + ((y - 0.2) / 0.8) * (ATLAS.capV[1] - ATLAS.capV[0]));
  g.fillStyle = rgb(PAINT.green);
  g.fillRect(0, capY(1.0), S, capY(0.2) - capY(1.0));
  g.fillStyle = rgb(PAINT.yellow);
  g.fillRect(0, capY(1.0), S, capY(0.7) - capY(1.0));

  // greenhouse region: per cell classification colours
  const G0 = ATLAS.ghV[0], G1 = ATLAS.ghV[1];
  const ghU = (cc) => cc / (gh.nCols - 1);
  const ghVv = (r) => G0 + (r / (gh.nRows - 1)) * (G1 - G0);
  g.fillStyle = rgb(PAINT.yellow);
  g.fillRect(0, py(G1), S, py(G0) - py(G1) + 2);
  for (let r = 0; r < gh.nRows - 1; r++) {
    for (let cc = 0; cc < gh.nCols - 1; cc++) {
      const k = gh.classify(r, cc);
      if (k.startsWith('sail') || k === 'bpillar') {
        g.fillStyle = 'rgb(18,18,19)';
        g.fillRect(px(ghU(cc)) - 1, py(ghVv(r + 1)) - 1, px(ghU(cc + 1)) - px(ghU(cc)) + 2, py(ghVv(r)) - py(ghVv(r + 1)) + 2);
      }
    }
  }
  for (const [cA, cB] of gh.blackCols || []) {
    g.fillStyle = 'rgb(20,20,21)';
    g.fillRect(px(ghU(cA)), py(ghVv(gh.railRow)), px(ghU(cB)) - px(ghU(cA)), py(ghVv(0)) - py(ghVv(gh.railRow)) + 2);
  }

  // --- painterly variation strokes ----------------------------------------------------
  const greenShades = [rgb(mix3(PAINT.green, [20, 60, 40], 0.5)), rgb(PAINT.greenFade), rgb(mix3(PAINT.green, [70, 110, 60], 0.5)), rgb([36, 86, 56])];
  const yellowShades = [rgb(PAINT.yellowFade), rgb(mix3(PAINT.yellow, [180, 130, 40], 0.5)), rgb([226, 186, 70]), rgb([190, 150, 60])];
  g.save();
  g.beginPath();
  g.rect(0, L0, S, L1 - L0);
  g.clip();
  strokes(g, rng, { w: S, h: L1 - L0, y0: L0, n: 2600, colors: [...greenShades, ...yellowShades], len: [30, 120], width: [6, 18], angle: 0, jitter: 0.12, alpha: [0.02, 0.06] });
  g.restore();
  // re-assert the two-tone edge crisply: draw a thin trim line (pin stripe) along split
  g.strokeStyle = 'rgba(30,26,20,0.55)';
  g.lineWidth = 2.2;
  for (const arr of [up, dn]) {
    g.beginPath();
    arr.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.stroke();
  }
  // faded / chalky top surfaces (hood, roof, trunk): lighter strokes near v centre
  const vTop0 = py(lowerVmap(0.41)), vTop1 = py(lowerVmap(0.59));
  g.save();
  g.globalCompositeOperation = 'screen';
  const fadeGrad = g.createLinearGradient(0, vTop0, 0, vTop1);
  fadeGrad.addColorStop(0, 'rgba(60,50,30,0)');
  fadeGrad.addColorStop(0.5, 'rgba(60,52,34,0.35)');
  fadeGrad.addColorStop(1, 'rgba(60,50,30,0)');
  g.fillStyle = fadeGrad;
  g.fillRect(0, vTop0, S, vTop1 - vTop0);
  g.restore();
  // roof fading in greenhouse region (upper rows)
  g.save();
  g.globalCompositeOperation = 'screen';
  const rf = g.createLinearGradient(0, py(ghVv(gh.railRow)), 0, py(G1));
  rf.addColorStop(0, 'rgba(50,44,30,0.05)');
  rf.addColorStop(1, 'rgba(70,62,44,0.45)');
  g.fillStyle = rf;
  g.fillRect(0, py(G1), S, py(ghVv(gh.railRow)) - py(G1));
  g.restore();
  g.save();
  g.beginPath();
  g.rect(0, py(G1), S, py(G0) - py(G1));
  g.clip();
  strokes(g, rng, { w: S, h: py(G0) - py(G1), y0: py(G1), n: 900, colors: yellowShades, len: [30, 100], width: [5, 14], angle: 0, jitter: 0.15, alpha: [0.03, 0.08] });
  g.restore();

  // --- panel gaps --------------------------------------------------------------------
  const gapLine = (pts, w = 2.2, a = 0.85) => {
    g.strokeStyle = `rgba(14,12,10,${a})`;
    g.lineWidth = w;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.stroke();
    hg.strokeStyle = 'rgb(40,40,40)';
    hg.lineWidth = Math.max(1, w * 0.6);
    hg.beginPath();
    pts.forEach((p, i) => (i ? hg.lineTo(p[0] / 2, p[1] / 2) : hg.moveTo(p[0] / 2, p[1] / 2)));
    hg.stroke();
  };
  const vertGap = (z, side, y0, y1) => {
    const pts = [];
    for (let k = 0; k <= 12; k++) pts.push(P(z, lerp(y0, y1, k / 12), side));
    gapLine(pts);
  };
  for (const side of ['R', 'L']) {
    for (const z of [-1.02, 0.062, 0.098, 0.772]) vertGap(z, side, 0.3, 0.96);
    // door bottoms (sill line)
    const pts = [];
    for (const [z0, z1] of [[-1.02, 0.062], [0.098, 0.772]]) {
      const ptsB = [];
      for (let k = 0; k <= 16; k++) {
        const z = lerp(z0, z1, k / 16);
        const [i] = stationAt(z);
        const ring = rings[i];
        const y = ring[side === 'R' ? 5 : 35][1];
        ptsB.push(P(z, y + 0.002, side));
      }
      gapLine(ptsB, 1.8, 0.6);
    }
    void pts;
  }
  // hood gaps: along the ledge both sides from front to cowl, and across at the cowl
  for (const xf of [0.98, -0.98]) {
    const pts = [];
    for (let k = 0; k <= 30; k++) {
      const z = lerp(-2.12, -1.1, k / 30);
      pts.push([px(lowerU(z)), py(deckV(z, xf))]);
    }
    gapLine(pts, 1.8);
  }
  {
    const pts = [];
    for (let k = -10; k <= 10; k++) pts.push([px(lowerU(-1.1)), py(deckV(-1.1, k / 10.2))]);
    gapLine(pts, 2);
  }
  // trunk gaps
  for (const xf of [0.98, -0.98]) {
    const pts = [];
    for (let k = 0; k <= 20; k++) {
      const z = lerp(1.6, 2.12, k / 20);
      pts.push([px(lowerU(z)), py(deckV(z, xf))]);
    }
    gapLine(pts, 1.8);
  }
  {
    const pts = [];
    for (let k = -10; k <= 10; k++) pts.push([px(lowerU(1.6)), py(deckV(1.6, k / 10.2))]);
    gapLine(pts, 2);
  }

  // --- grime / dirt streaks below windows (vertical drips on doors) -------------------
  for (const side of ['R', 'L']) {
    for (let i = 0; i < 70; i++) {
      const z = rng.range(-1.0, 1.5);
      const [x, y0] = P(z, rng.range(0.82, 0.93), side);
      const [, y1] = P(z, rng.range(0.4, 0.75), side);
      const grd = g.createLinearGradient(x, y0, x, y1);
      grd.addColorStop(0, 'rgba(40,34,24,0.16)');
      grd.addColorStop(1, 'rgba(40,34,24,0)');
      g.fillStyle = grd;
      g.fillRect(x - rng.range(0.6, 2.4), Math.min(y0, y1), rng.range(1.2, 4), Math.abs(y1 - y0));
    }
  }

  // --- mud: lower body, sprays behind wheels --------------------------------------------
  for (const side of ['R', 'L']) {
    // general low grime band
    for (let i = 0; i < 260; i++) {
      const z = rng.range(-2.15, 2.15);
      const y = 0.22 + Math.pow(rng(), 2.2) * 0.32;
      const [x, yy] = P(z, y, side);
      blob(g, rng, x, yy, rng.range(1.5, 7), rgb(rng() < 0.6 ? PAINT.mud : PAINT.mudLight), rng.range(0.12, 0.4), 5, 0.6);
    }
    // sprays behind each wheel arch
    for (const ax of [DIM_AXLES.f, DIM_AXLES.r]) {
      for (let i = 0; i < 420; i++) {
        const a = rng.range(-0.3, 1.25);
        const d = 0.38 + Math.pow(rng(), 1.6) * 0.45;
        const z = ax + Math.cos(a) * d * 0.85;
        const y = 0.3 + Math.sin(a) * d * 0.7;
        if (y < 0.2 || y > 0.8) continue;
        const [x, yy] = P(z, y, side);
        const r = rng.range(0.6, 3.6) * (1.2 - (d - 0.38));
        blob(g, rng, x, yy, Math.max(0.5, r), rgb(rng() < 0.7 ? PAINT.mud : [64, 52, 38]), rng.range(0.2, 0.65), 4, 0.5);
      }
      // dark grime directly around the arch edge
      for (let k = 0; k < 60; k++) {
        const a = (k / 60) * Math.PI;
        const z = ax + Math.cos(a) * (0.392);
        const y = 0.3 + Math.sin(a) * 0.392;
        const [x, yy] = P(z, y, side);
        blob(g, rng, x, yy, rng.range(3, 8), 'rgb(40,32,24)', 0.35, 5, 0.5);
      }
    }
  }

  // --- rust ------------------------------------------------------------------------------
  const rustSpot = (x, y, r, heavy = 0.5) => {
    blob(g, rng, x, y, r * 1.6, rgb(PAINT.rustLight), 0.25 * heavy + 0.1, 8, 0.6);
    blob(g, rng, x, y, r * 1.1, rgb(PAINT.rust), 0.75, 8, 0.6);
    blob(g, rng, x + rng.range(-1, 1) * r * 0.2, y + rng.range(-1, 1) * r * 0.2, r * 0.6, rgb(PAINT.rustDark), 0.85, 7, 0.7);
    for (let k = 0; k < 6; k++) blob(g, rng, x + rng.range(-1, 1) * r * 1.5, y + rng.range(-1, 1) * r * 1.5, r * rng.range(0.1, 0.3), rgb(PAINT.rust), 0.6, 5, 0.6);
    // blister ring in height + rough
    blob(hg, rng, x / 2, y / 2, r * 0.8, 'rgb(150,150,150)', 0.8, 7, 0.6);
    blob(hg, rng, x / 2, y / 2, r * 0.45, 'rgb(105,105,105)', 0.8, 6, 0.6);
    blob(rg, rng, x / 2, y / 2, r * 0.9, 'rgb(0,235,0)', 0.9, 7, 0.6);
    // rust run-off streak below
    const grd = g.createLinearGradient(x, y, x, y + r * 6);
    grd.addColorStop(0, rgb(PAINT.rust, 0.35));
    grd.addColorStop(1, rgb(PAINT.rust, 0));
    g.fillStyle = grd;
    g.fillRect(x - r * 0.3, y, r * 0.6, r * 6);
  };
  for (const side of ['R', 'L']) {
    // arch edges
    for (const ax of [DIM_AXLES.f, DIM_AXLES.r]) {
      for (let k = 0; k < 9; k++) {
        const a = rng.range(0.15, Math.PI - 0.15);
        const z = ax + Math.cos(a) * 0.4, y = 0.3 + Math.sin(a) * 0.4;
        const [x, yy] = P(z, y, side);
        rustSpot(x, yy, rng.range(3, 9), 0.7);
      }
    }
    // door bottoms & rocker
    for (let k = 0; k < 22; k++) {
      const z = rng.range(-1.0, 0.76);
      const y = rng.range(0.26, 0.34);
      const [x, yy] = P(z, y, side);
      rustSpot(x, yy, rng.range(2, 7), 0.6);
    }
    // a few random blisters on panels
    for (let k = 0; k < 8; k++) {
      const z = rng.range(-2.0, 2.0);
      const y = rng.range(0.4, 0.88);
      const [x, yy] = P(z, y, side);
      rustSpot(x, yy, rng.range(1.5, 3.5), 0.3);
    }
  }
  // hood front edge & trunk edges
  for (let k = 0; k < 10; k++) {
    const z = rng.range(-2.12, -2.0);
    rustSpot(px(lowerU(z)), py(deckV(z, rng.range(-0.9, 0.9))), rng.range(2, 6), 0.5);
  }
  for (let k = 0; k < 8; k++) {
    const z = rng.range(1.62, 2.1);
    rustSpot(px(lowerU(z)), py(deckV(z, rng.sign() * rng.range(0.7, 0.98))), rng.range(2, 5), 0.5);
  }
  // greenhouse: rust at window corners & drip rail
  for (let k = 0; k < 16; k++) {
    const cc = rng.int(0, gh.nCols - 2);
    const r = rng() < 0.5 ? gh.railRow - 1 : 0;
    rustSpot(px(ghU(cc + rng())), py(ghVv(r + rng())), rng.range(2, 5), 0.4);
  }

  // --- scratches ---------------------------------------------------------------------------
  for (const side of ['R', 'L']) {
    for (let i = 0; i < 40; i++) {
      const z = rng.range(-1.9, 1.9);
      const y = rng.range(0.38, 0.9);
      const [x, yy] = P(z, y, side);
      const len = rng.range(8, 70);
      const ang = rng.range(-0.25, 0.25) + (rng() < 0.2 ? rng.range(-1, 1) : 0);
      g.save();
      g.translate(x, yy);
      g.rotate(ang);
      g.strokeStyle = `rgba(225,220,200,${rng.range(0.18, 0.45)})`;
      g.lineWidth = rng.range(0.6, 1.4);
      g.beginPath();
      g.moveTo(0, 0);
      let cx = 0, cy = 0;
      for (let s = 0; s < 5; s++) {
        cx += len / 5;
        cy += rng.range(-1.2, 1.2);
        g.lineTo(cx, cy);
      }
      g.stroke();
      g.strokeStyle = 'rgba(60,40,25,0.3)';
      g.lineWidth = 0.6;
      g.stroke();
      g.restore();
      hg.save();
      hg.translate(x / 2, yy / 2);
      hg.rotate(ang);
      hg.strokeStyle = 'rgb(95,95,95)';
      hg.lineWidth = 0.8;
      hg.beginPath();
      hg.moveTo(0, 0);
      hg.lineTo(len / 2, 0);
      hg.stroke();
      hg.restore();
    }
  }

  // --- door dings (height only + slight shading) -------------------------------------------
  for (const side of ['R', 'L']) {
    for (let i = 0; i < 26; i++) {
      const z = rng.range(-1.95, 2.0);
      const y = rng.range(0.42, 0.88);
      const [x, yy] = P(z, y, side);
      const r = rng.range(4, 14);
      const grd = hg.createRadialGradient(x / 2, yy / 2, 0, x / 2, yy / 2, r / 2);
      grd.addColorStop(0, 'rgba(70,70,70,0.9)');
      grd.addColorStop(1, 'rgba(128,128,128,0)');
      hg.fillStyle = grd;
      hg.beginPath();
      hg.ellipse(x / 2, yy / 2, r / 2, r / 2.8, rng() * 3, 0, Math.PI * 2);
      hg.fill();
    }
  }

  // --- side lettering (rear doors): fictional owner-driver wording -------------------------
  const text = (side, z, y, str, size, color) => {
    const [x, yy] = P(z, y, side);
    g.save();
    g.translate(x, yy);
    if (side === 'R') g.scale(-1.7, 1);
    else g.scale(1.7, -1);
    // compensate stretch: atlas px per metre
    g.font = `700 ${size}px ${FONTS.sign}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(str, 0, 0);
    g.restore();
  };
  // compute vertical scale: px per metre along u vs v differ; keep text modest
  for (const side of ['R', 'L']) {
    text(side, 0.44, 0.565, 'แท็กซี่บุคคล', 22, 'rgba(236,232,214,0.82)');
    text(side, 0.44, 0.515, 'กท. 1ท-4521', 15, 'rgba(236,232,214,0.7)');
  }

  // --- micro grain over everything ---------------------------------------------------------
  const nc = noiseCanvas(256, 256, { scale: 24, oct: 3, seed: 3, contrast: 1.6 });
  g.save();
  g.globalAlpha = 0.07;
  g.globalCompositeOperation = 'overlay';
  for (let y = 0; y < S; y += 256) for (let x = 0; x < S; x += 256) g.drawImage(nc, x, y);
  g.restore();
  const big = noiseCanvas(128, 128, { scale: 5, oct: 4, seed: 11, contrast: 1.3 });
  g.save();
  g.globalAlpha = 0.16;
  g.globalCompositeOperation = 'multiply';
  g.imageSmoothingEnabled = true;
  g.drawImage(big, 0, 0, S, S);
  g.restore();
  // height map orange-peel
  const hn = noiseCanvas(128, 128, { scale: 40, oct: 2, seed: 5, contrast: 1 });
  hg.save();
  hg.globalAlpha = 0.08;
  hg.globalCompositeOperation = 'overlay';
  hg.drawImage(hn, 0, 0, HS, HS);
  hg.restore();
  // roughness variation
  const rn = noiseCanvas(128, 128, { scale: 6, oct: 3, seed: 9, contrast: 1.2 });
  rg.save();
  rg.globalAlpha = 0.35;
  rg.globalCompositeOperation = 'lighter';
  rg.drawImage(rn, 0, 0, HS, HS);
  rg.restore();

  const map = toTexture(c, { anisotropy: 8 });
  const normalMap = toTexture(heightToNormal(hc, 3.5), { srgb: false, anisotropy: 8 });
  const roughnessMap = toTexture(rc, { srgb: false });
  return { map, normalMap, roughnessMap, canvas: c };
}
const DIM_AXLES = { f: -1.36, r: 1.1 };

// ---------------------------------------------------------------------------
// Generic small textures
// ---------------------------------------------------------------------------
const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

/** Headlight lens: fluted glass + reflector bowl (map + emissive). */
export function headlightTex() {
  return cached('headlight', () => {
    const w = 256, h = 96;
    const [c, g] = hiCanvas(w, h);
    const grd = g.createRadialGradient(w * 0.5, h * 0.5, 4, w * 0.5, h * 0.5, w * 0.55);
    grd.addColorStop(0, '#f4f0e4');
    grd.addColorStop(0.35, '#b8b6ae');
    grd.addColorStop(1, '#4a4a48');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // flutes
    for (let x = 0; x < w; x += 6) {
      g.fillStyle = `rgba(255,255,255,${0.08 + 0.05 * Math.sin(x)})`;
      g.fillRect(x, 0, 2, h);
    }
    for (let y = 0; y < h; y += 8) {
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(0, y, w, 1.5);
    }
    // bulb
    const b = g.createRadialGradient(w * 0.5, h * 0.52, 0, w * 0.5, h * 0.52, 22);
    b.addColorStop(0, 'rgba(255,250,235,1)');
    b.addColorStop(1, 'rgba(255,250,235,0)');
    g.fillStyle = b;
    g.fillRect(0, 0, w, h);
    // grime
    const rng = makeRng(77);
    for (let i = 0; i < 80; i++) blob(g, rng, rng() * w, rng() * h, rng.range(1, 6), 'rgba(70,60,40,1)', rng.range(0.05, 0.25), 5, 0.5);
    return toTexture(c);
  });
}

/** Rear light cluster: indicator (amber) | tail/brake (red) | reverse (white) sections. */
export function taillightTex() {
  return cached('taillight', () => {
    const w = 512, h = 128;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    // sections in u: 0-0.28 amber, 0.28-0.82 red, 0.82-1 white (outer -> inner)
    const sec = [[0, 0.27, '#b8701a'], [0.27, 0.83, '#8c1410'], [0.83, 1, '#d8d4c8']];
    for (const [a, b, col] of sec) {
      g.fillStyle = col;
      g.fillRect(a * w, 0, (b - a) * w, h);
      // ribbed prism pattern
      for (let x = a * w; x < b * w; x += 7) {
        g.fillStyle = 'rgba(255,255,255,0.10)';
        g.fillRect(x, 0, 2, h);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(x + 4, 0, 1.5, h);
      }
      for (let y = 0; y < h; y += 10) {
        g.fillStyle = 'rgba(0,0,0,0.12)';
        g.fillRect(a * w, y, (b - a) * w, 1.5);
      }
      g.fillStyle = 'rgba(10,8,8,0.9)';
      g.fillRect(b * w - 3, 0, 6, h);
    }
    g.strokeStyle = 'rgba(15,12,10,1)';
    g.lineWidth = 8;
    g.strokeRect(0, 0, w, h);
    const rng = makeRng(31);
    for (let i = 0; i < 60; i++) blob(g, rng, rng() * w, rng() * h, rng.range(1, 8), 'rgba(60,50,40,1)', rng.range(0.05, 0.2), 5, 0.5);
    return toTexture(c);
  });
}

/** Emissive mask for the tail cluster: R = tail/brake, G = indicator, B = reverse. */
export function taillightMaskTex() {
  return cached('taillightMask', () => {
    const w = 128, h = 32;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#00ff00';
    g.fillRect(2, 2, 0.27 * w - 4, h - 4);
    g.fillStyle = '#ff0000';
    g.fillRect(0.27 * w + 2, 2, 0.56 * w - 4, h - 4);
    g.fillStyle = '#0000ff';
    g.fillRect(0.83 * w + 2, 2, 0.17 * w - 4, h - 4);
    return toTexture(c, { srgb: false });
  });
}

/** TAXI-METER roof sign face. */
export function roofSignTex() {
  return cached('roofsign', () => {
    const w = 512, h = 128;
    const [c, g] = hiCanvas(w, h);
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#f6efd2');
    grd.addColorStop(1, '#e6d9ae');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#b0201a';
    g.font = `700 66px ${FONTS.sign}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('TAXI-METER', w / 2, h / 2 + 3);
    g.strokeStyle = '#1f3e8a';
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
    const rng = makeRng(9);
    for (let i = 0; i < 120; i++) blob(g, rng, rng() * w, rng() * h, rng.range(1, 7), 'rgba(110,90,50,1)', rng.range(0.04, 0.16), 5, 0.5);
    // dead bugs inside the lens
    for (let i = 0; i < 14; i++) blob(g, rng, rng() * w, h - rng() * 30, rng.range(1, 2.5), 'rgba(20,15,10,1)', 0.8, 4, 0.4);
    return toTexture(c);
  });
}

/** ว่าง vacant lamp (red). */
export function vacantTex() {
  return cached('vacant', () => {
    const w = 256, h = 128;
    const [c, g] = hiCanvas(w, h);
    g.fillStyle = '#2a0504';
    g.fillRect(0, 0, w, h);
    const grd = g.createRadialGradient(w / 2, h / 2, 5, w / 2, h / 2, w * 0.6);
    grd.addColorStop(0, '#ff3a26');
    grd.addColorStop(1, '#9a0c06');
    g.fillStyle = grd;
    g.fillRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#fff2d0';
    g.font = `700 84px ${FONTS.sign}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('ว่าง', w / 2, h / 2 + 8);
    return toTexture(c);
  });
}

/** Gauge face. kind 'speed'|'tacho'|'fuel'|'temp'. lit=true -> emissive version (green numerals). */
export function gaugeTex(kind, lit = false) {
  return cached(`gauge:${kind}:${lit}`, () => {
    const S = 256;
    const [c, g] = hiCanvas(S, S);
    const cx = S / 2, cy = S / 2, R = S * 0.47;
    if (lit) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, S, S);
    } else {
      const grd = g.createRadialGradient(cx, cy, 10, cx, cy, R);
      grd.addColorStop(0, '#16181a');
      grd.addColorStop(1, '#0a0b0c');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
    }
    const ink = lit ? '#7dffb0' : '#c8cfc2';
    const ink2 = lit ? '#3fd68a' : '#8a9086';
    g.strokeStyle = ink;
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const big = kind === 'speed' || kind === 'tacho';
    const a0 = big ? Math.PI * 0.75 : Math.PI * 0.8, a1 = big ? Math.PI * 2.25 : Math.PI * 1.2; // sweep (canvas angles)
    const tick = (a, r0, r1, w) => {
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.stroke();
    };
    if (kind === 'speed') {
      const max = 180;
      for (let v = 0; v <= max; v += 10) {
        const a = a0 + (v / max) * (a1 - a0);
        tick(a, R * 0.78, R * 0.95, v % 20 === 0 ? 4 : 2);
        if (v % 20 === 0) {
          g.font = `700 ${S * 0.085}px ${FONTS.lcd}`;
          g.fillText(String(v), cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.6);
        }
      }
      g.font = `400 ${S * 0.055}px ${FONTS.lcd}`;
      g.fillStyle = ink2;
      g.fillText('km/h', cx, cy + R * 0.42);
      // odometer window
      g.fillStyle = lit ? '#000' : '#050505';
      g.fillRect(cx - S * 0.16, cy + R * 0.12, S * 0.32, S * 0.08);
      g.fillStyle = lit ? '#59c98a' : '#bfbfb0';
      g.font = `700 ${S * 0.06}px ${FONTS.lcd}`;
      g.fillText('387214', cx, cy + R * 0.12 + S * 0.04);
    } else if (kind === 'tacho') {
      const max = 8;
      for (let v = 0; v <= max * 2; v++) {
        const a = a0 + (v / (max * 2)) * (a1 - a0);
        tick(a, R * 0.78, R * 0.95, v % 2 === 0 ? 4 : 2);
        if (v % 2 === 0) {
          g.font = `700 ${S * 0.1}px ${FONTS.lcd}`;
          g.fillText(String(v / 2), cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.6);
        }
      }
      // red zone
      g.strokeStyle = lit ? '#ff5040' : '#a8322a';
      g.lineWidth = 7;
      g.beginPath();
      g.arc(cx, cy, R * 0.9, a0 + (6.2 / 8) * (a1 - a0), a1);
      g.stroke();
      g.fillStyle = ink2;
      g.font = `400 ${S * 0.05}px ${FONTS.lcd}`;
      g.fillText('x1000 r/min', cx, cy + R * 0.42);
    } else {
      // small gauges: fuel / temp, sweep at top
      const labels = kind === 'fuel' ? ['E', 'F'] : ['C', 'H'];
      for (let v = 0; v <= 4; v++) {
        const a = a0 + (v / 4) * (a1 - a0);
        tick(a, R * 0.72, R * 0.92, v % 2 === 0 ? 4 : 2);
      }
      g.font = `700 ${S * 0.13}px ${FONTS.lcd}`;
      g.fillText(labels[0], cx + Math.cos(a0) * R * 0.48, cy + Math.sin(a0) * R * 0.48 + 6);
      g.fillText(labels[1], cx + Math.cos(a1) * R * 0.48, cy + Math.sin(a1) * R * 0.48 + 6);
      if (kind === 'temp') {
        g.strokeStyle = lit ? '#ff5040' : '#a8322a';
        g.lineWidth = 6;
        g.beginPath();
        g.arc(cx, cy, R * 0.82, a0 + 0.8 * (a1 - a0), a1);
        g.stroke();
      }
      g.fillStyle = ink2;
      g.font = `700 ${S * 0.08}px ${FONTS.lcd}`;
      g.fillText(kind === 'fuel' ? 'FUEL' : 'TEMP', cx, cy + R * 0.25);
    }
    if (!lit) {
      // age: dust and a faint scratch on the face
      const rng = makeRng(kind.length * 17);
      for (let i = 0; i < 40; i++) blob(g, rng, rng() * S, rng() * S, rng.range(1, 4), 'rgba(140,130,110,1)', rng.range(0.03, 0.1), 5, 0.5);
    }
    return toTexture(c);
  });
}

/** Cassette radio faceplate (static). */
export function radioFaceTex() {
  return cached('radioFace', () => {
    const w = 512, h = 144;
    const [c, g] = hiCanvas(w, h);
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#3a3b3d');
    grd.addColorStop(1, '#1c1d1f');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // cassette door
    g.fillStyle = '#121314';
    g.fillRect(150, 30, 210, 54);
    g.strokeStyle = '#4c4d50';
    g.lineWidth = 2;
    g.strokeRect(150, 30, 210, 54);
    g.fillStyle = '#26282a';
    g.fillRect(160, 48, 190, 6);
    // display window (dark; the live display texture is a separate mesh)
    g.fillStyle = '#060807';
    g.fillRect(150, 92, 210, 30);
    // preset buttons
    for (let i = 0; i < 5; i++) {
      g.fillStyle = '#2c2d30';
      g.fillRect(150 + i * 43, 126, 36, 12);
      g.fillStyle = '#9a9c96';
      g.font = `700 10px ${FONTS.lcd}`;
      g.textAlign = 'center';
      g.fillText(String(i + 1), 168 + i * 43, 135);
    }
    // labels
    g.fillStyle = '#a7a9a2';
    g.font = `700 13px ${FONTS.lcd}`;
    g.textAlign = 'left';
    g.fillText('STEREO CASSETTE', 368, 40);
    g.font = `400 11px ${FONTS.lcd}`;
    g.fillText('AM/FM  AUTO-REVERSE', 368, 58);
    g.fillText('VOL / PUSH', 30, 128);
    g.textAlign = 'right';
    g.fillText('TUNE', 482, 128);
    // knob rings
    for (const x of [64, 448]) {
      g.strokeStyle = '#55575a';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, 66, 34, 0, Math.PI * 2);
      g.stroke();
    }
    // wear
    const rng = makeRng(55);
    for (let i = 0; i < 90; i++) blob(g, rng, rng() * w, rng() * h, rng.range(1, 5), 'rgba(160,150,130,1)', rng.range(0.03, 0.12), 5, 0.5);
    return toTexture(c);
  });
}

// ---------------------------------------------------------------------------
// 7-segment LED / VFD digits (taxi meter, clock, radio frequency): drawn as shapes, so
// they read crisply whatever the UI typeface is.
// ---------------------------------------------------------------------------
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '', E: 'adefg', r: 'eg', o: 'cdeg', P: 'abefg', H: 'bcefg', L: 'def', A: 'abcefg' };
/** Width of one digit cell for height h. */
export function segWidth(h) {
  return h * 0.62;
}
/**
 * Draw `text` in 7-segment style. x = left edge (align 'left') or right edge ('right').
 * opts { color, ghost (unlit segments rgba), skew=0.12, align='left' }. Returns the drawn width.
 */
export function drawSegments(g, text, x, y, h, opts = {}) {
  const color = opts.color || '#ff3a1c';
  const ghost = opts.ghost ?? null;
  const skew = opts.skew ?? 0.12;
  const cw = segWidth(h), t = h * 0.11, gap = h * 0.015;
  const chars = String(text).split('');
  // width: digits take cw, '.' and ':' take a narrow slot
  const wOf = (c) => (c === '.' || c === ':' ? cw * 0.32 : cw);
  const total = chars.reduce((a, c) => a + wOf(c), 0);
  let cx = opts.align === 'right' ? x - total : x;
  const bar = (x0, y0, x1, y1, lit) => {
    // hexagonal bar between two points (horizontal or vertical), skewed for the italic LED look
    const sk = (px, py) => [px + (y + h / 2 - py) * skew, py];
    const horiz = Math.abs(y1 - y0) < Math.abs(x1 - x0);
    const pts = horiz
      ? [[x0 + gap, y0], [x0 + gap + t / 2, y0 - t / 2], [x1 - gap - t / 2, y1 - t / 2], [x1 - gap, y1], [x1 - gap - t / 2, y1 + t / 2], [x0 + gap + t / 2, y0 + t / 2]]
      : [[x0, y0 + gap], [x0 + t / 2, y0 + gap + t / 2], [x1 + t / 2, y1 - gap - t / 2], [x1, y1 - gap], [x1 - t / 2, y1 - gap - t / 2], [x0 - t / 2, y0 + gap + t / 2]];
    g.beginPath();
    pts.forEach(([px, py], i) => {
      const [qx, qy] = sk(px, py);
      if (i) g.lineTo(qx, qy);
      else g.moveTo(qx, qy);
    });
    g.closePath();
    g.fillStyle = lit ? color : ghost;
    if (lit || ghost) g.fill();
  };
  for (const c of chars) {
    const w = wOf(c);
    if (c === '.' || c === ':') {
      const r = t * 0.6;
      g.fillStyle = color;
      const dots = c === '.' ? [y + h - r] : [y + h * 0.3, y + h * 0.7];
      for (const dy of dots) {
        g.beginPath();
        g.arc(cx + w / 2 + (y + h / 2 - dy) * skew, dy, r, 0, Math.PI * 2);
        g.fill();
      }
      cx += w;
      continue;
    }
    const on = SEG[c] ?? '';
    const l = cx + t * 0.6, r = cx + cw - t * 0.9, top = y + t / 2, mid = y + h / 2, bot = y + h - t / 2;
    bar(l, top, r, top, on.includes('a'));
    bar(r, top, r, mid, on.includes('b'));
    bar(r, mid, r, bot, on.includes('c'));
    bar(l, bot, r, bot, on.includes('d'));
    bar(l, mid, l, bot, on.includes('e'));
    bar(l, top, l, mid, on.includes('f'));
    bar(l, mid, r, mid, on.includes('g'));
    cx += w;
  }
  return total;
}

/** A dynamic canvas texture with a redraw(fn) helper. */
export class DynamicCanvas {
  /** opts.scale: supersampling (the draw callback still receives w x h logical units). */
  constructor(w, h, opts = {}) {
    this.w = w;
    this.h = h;
    this.scale = opts.scale ?? 1;
    this.canvas = makeCanvas(Math.round(w * this.scale), Math.round(h * this.scale));
    this.g = this.canvas.getContext('2d');
    this.texture = toTexture(this.canvas, opts);
    this.key = '';
  }
  draw(key, fn) {
    if (key === this.key) return;
    this.key = key;
    this.g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    fn(this.g, this.w, this.h);
    this.texture.needsUpdate = true;
  }
}

/**
 * Seat seam: a pressed groove with two rows of slightly irregular thread stitches (u along
 * the seam, 1 u = 4 cm; v across). RGBA (alpha outside the seam).
 */
export function stitchTex() {
  return cached('stitch', () => {
    const w = 128, h = 32;
    const [c, g] = hiCanvas(w, h, 4);
    g.clearRect(0, 0, w, h);
    // groove: soft dark valley with a lit lip
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.3, 'rgba(255,240,215,0.10)');
    grd.addColorStop(0.44, 'rgba(10,6,4,0.55)');
    grd.addColorStop(0.5, 'rgba(0,0,0,0.75)');
    grd.addColorStop(0.56, 'rgba(10,6,4,0.55)');
    grd.addColorStop(0.7, 'rgba(255,240,215,0.08)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    const rng = makeRng(77);
    for (const row of [0.22, 0.78]) {
      for (let x = 2; x < w; x += 8) {
        const y = h * row + rng.range(-0.5, 0.5);
        const len = 5 + rng.range(-0.6, 0.6);
        // thread: dark hole shadow, then the thread with a highlight
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.lineWidth = 2.2;
        g.beginPath();
        g.moveTo(x, y + 0.5);
        g.lineTo(x + len, y + 0.5);
        g.stroke();
        g.strokeStyle = 'rgba(184,166,134,0.92)';
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + len, y);
        g.stroke();
        g.strokeStyle = 'rgba(255,248,230,0.6)';
        g.lineWidth = 0.5;
        g.beginPath();
        g.moveTo(x + 0.8, y - 0.35);
        g.lineTo(x + len - 0.8, y - 0.35);
        g.stroke();
      }
    }
    return toTexture(c, { wrap: THREE.RepeatWrapping });
  });
}

/** Painted photo of a child (the memory in the sun visor). */
export function childPhotoTex() {
  return cached('childPhoto', () => {
    const w = 192, h = 256;
    const [c, g] = hiCanvas(w, h);
    g.fillStyle = '#efe6d2';
    g.fillRect(0, 0, w, h);
    // photo area
    const x0 = 12, y0 = 12, pw = w - 24, ph = h - 64;
    const sky = g.createLinearGradient(0, y0, 0, y0 + ph);
    sky.addColorStop(0, '#9fb7b0');
    sky.addColorStop(0.55, '#c8c3a2');
    sky.addColorStop(1, '#7d8a5e');
    g.fillStyle = sky;
    g.fillRect(x0, y0, pw, ph);
    // the green-yellow taxi behind
    g.fillStyle = '#d2b04a';
    g.fillRect(x0 + 6, y0 + ph * 0.52, pw - 12, ph * 0.12);
    g.fillStyle = '#3f7a50';
    g.fillRect(x0 + 2, y0 + ph * 0.64, pw - 4, ph * 0.16);
    g.fillStyle = '#222';
    for (const xx of [x0 + 30, x0 + pw - 30]) {
      g.beginPath();
      g.arc(xx, y0 + ph * 0.82, 13, 0, Math.PI * 2);
      g.fill();
    }
    // child: school uniform white shirt, navy shorts
    const cx = x0 + pw * 0.48;
    g.fillStyle = '#2c3550';
    g.fillRect(cx - 16, y0 + ph * 0.66, 32, 26);
    g.fillStyle = '#f2efe6';
    g.beginPath();
    g.moveTo(cx - 22, y0 + ph * 0.45);
    g.lineTo(cx + 22, y0 + ph * 0.45);
    g.lineTo(cx + 18, y0 + ph * 0.68);
    g.lineTo(cx - 18, y0 + ph * 0.68);
    g.closePath();
    g.fill();
    g.fillStyle = '#b98a62';
    g.fillRect(cx - 12, y0 + ph * 0.66 + 26, 8, 20);
    g.fillRect(cx + 4, y0 + ph * 0.66 + 26, 8, 20);
    g.beginPath();
    g.ellipse(cx, y0 + ph * 0.36, 15, 18, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1b1612';
    g.beginPath();
    g.ellipse(cx, y0 + ph * 0.31, 16, 11, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillRect(cx - 16, y0 + ph * 0.3, 32, 4);
    g.fillStyle = '#2a1d16';
    g.fillRect(cx - 7, y0 + ph * 0.355, 3, 3);
    g.fillRect(cx + 4, y0 + ph * 0.355, 3, 3);
    g.strokeStyle = '#6a3d2a';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, y0 + ph * 0.39, 6, 0.2, Math.PI - 0.2);
    g.stroke();
    // fade + warm cast
    g.fillStyle = 'rgba(240,200,140,0.22)';
    g.fillRect(x0, y0, pw, ph);
    const rng = makeRng(7);
    for (let i = 0; i < 70; i++) blob(g, rng, x0 + rng() * pw, y0 + rng() * ph, rng.range(1, 5), 'rgba(255,250,235,1)', rng.range(0.05, 0.2), 5, 0.5);
    // caption in pen
    g.fillStyle = '#3a3a6a';
    g.font = `400 18px ${FONTS.hand}`;
    g.textAlign = 'center';
    g.fillText('ต้น ๗ ขวบ', w / 2, h - 30);
    g.font = `400 12px ${FONTS.hand}`;
    g.fillText('๒๕๓๘', w / 2, h - 12);
    // crease
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, h * 0.42);
    g.lineTo(w, h * 0.47);
    g.stroke();
    return toTexture(c);
  });
}

/** Dashboard stickers. variant 'cartoon' (memory: faded elephant cartoon), 'yantra', 'safe'. */
export function stickerTex(variant) {
  return cached('sticker:' + variant, () => {
    const S = 256;
    const [c, g] = hiCanvas(S, S);
    g.clearRect(0, 0, S, S);
    if (variant === 'cartoon') {
      // faded round sticker: a cheerful little blue elephant waving
      g.fillStyle = '#f3e9c8';
      g.beginPath();
      g.arc(S / 2, S / 2, S * 0.47, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#e07a3a';
      g.lineWidth = 8;
      g.stroke();
      g.fillStyle = '#7aa7c8';
      g.beginPath();
      g.ellipse(S * 0.5, S * 0.58, S * 0.22, S * 0.17, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(S * 0.42, S * 0.4, S * 0.15, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(S * 0.3, S * 0.4, S * 0.09, S * 0.12, -0.3, 0, Math.PI * 2);
      g.fillStyle = '#93bcd8';
      g.fill();
      g.strokeStyle = '#7aa7c8';
      g.lineWidth = 14;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(S * 0.5, S * 0.45);
      g.quadraticCurveTo(S * 0.66, S * 0.36, S * 0.64, S * 0.2);
      g.stroke();
      g.fillStyle = '#1b1b22';
      g.beginPath();
      g.arc(S * 0.44, S * 0.37, 6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e8828a';
      g.beginPath();
      g.arc(S * 0.48, S * 0.45, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#c0483a';
      g.font = `700 ${S * 0.1}px ${FONTS.sign}`;
      g.textAlign = 'center';
      g.fillText('ช้างน้อย', S * 0.5, S * 0.86);
    } else if (variant === 'yantra') {
      g.fillStyle = '#f2e7c6';
      g.fillRect(S * 0.08, S * 0.08, S * 0.84, S * 0.84);
      g.strokeStyle = '#7a1c14';
      g.lineWidth = 4;
      g.strokeRect(S * 0.12, S * 0.12, S * 0.76, S * 0.76);
      g.beginPath();
      g.moveTo(S * 0.5, S * 0.16);
      g.lineTo(S * 0.84, S * 0.8);
      g.lineTo(S * 0.16, S * 0.8);
      g.closePath();
      g.stroke();
      g.fillStyle = '#7a1c14';
      g.font = `700 ${S * 0.07}px ${FONTS.sign}`;
      g.textAlign = 'center';
      g.fillText('นะ  มะ  พะ  ทะ', S * 0.5, S * 0.62);
      g.fillText('อุ  อะ  มะ', S * 0.5, S * 0.72);
      g.beginPath();
      g.arc(S * 0.5, S * 0.42, S * 0.07, 0, Math.PI * 2);
      g.stroke();
    } else {
      g.fillStyle = '#1e4f8a';
      g.fillRect(0, S * 0.3, S, S * 0.4);
      g.fillStyle = '#ffe9a8';
      g.font = `700 ${S * 0.085}px ${FONTS.sign}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('ขอให้เดินทางปลอดภัย', S / 2, S * 0.5);
    }
    // fade + sun bleaching
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(250,240,215,0.35)';
    g.fillRect(0, 0, S, S);
    const rng = makeRng(variant.length * 3);
    for (let i = 0; i < 60; i++) blob(g, rng, rng() * S, rng() * S, rng.range(2, 10), 'rgba(255,250,240,1)', rng.range(0.05, 0.25), 5, 0.6);
    g.globalCompositeOperation = 'source-over';
    return toTexture(c);
  });
}

/** Wooden bead seat cover: per-bead colours provided by instanceColor; this is a grain map. */
export function woodGrainTex() {
  return cached('woodgrain', () => {
    const w = 128, h = 128;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = '#9a6a3c';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      const a = 0.08 + 0.08 * Math.sin(y * 0.7 + Math.sin(y * 0.13) * 3);
      g.fillStyle = `rgba(50,28,12,${a})`;
      g.fillRect(0, y, w, 1);
    }
    return toTexture(c, { wrap: THREE.RepeatWrapping });
  });
}

/** Simple tileable grime/dirt alpha (for glass dirt & smudges). Single channel in R. */
export function glassDirtTex() {
  return cached('glassDirt', () => {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    const rng = makeRng(404);
    const n = noiseCanvas(64, 64, { scale: 4, oct: 4, seed: 21, contrast: 1.5, bias: -0.15 });
    g.globalAlpha = 0.6;
    g.drawImage(n, 0, 0, S, S);
    g.globalAlpha = 1;
    // specks
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(255,255,255,${rng.range(0.1, 0.6)})`;
      g.beginPath();
      g.arc(rng() * S, rng() * S, rng.range(0.4, 1.6), 0, Math.PI * 2);
      g.fill();
    }
    // smudge arcs (old wiping marks)
    g.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = `rgba(255,255,255,${rng.range(0.05, 0.15)})`;
      g.lineWidth = rng.range(4, 14);
      g.beginPath();
      const cx = rng() * S, cy = rng() * S, r = rng.range(20, 80);
      g.arc(cx, cy, r, rng() * 6, rng() * 6 + rng.range(0.5, 1.6));
      g.stroke();
    }
    return toTexture(c, { srgb: false, wrap: THREE.RepeatWrapping });
  });
}

/** Mirror smudge mask (R) for mirrors. */
export function mirrorDirtTex() {
  return cached('mirrorDirt', () => {
    const S = 128;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    const rng = makeRng(808);
    for (let i = 0; i < 50; i++) {
      g.fillStyle = `rgba(255,255,255,${rng.range(0.05, 0.3)})`;
      g.beginPath();
      g.arc(rng() * S, rng() * S, rng.range(0.5, 4), 0, Math.PI * 2);
      g.fill();
    }
    const grd = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(1, 'rgba(255,255,255,0.5)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return toTexture(c, { srgb: false });
  });
}

/** Tire sidewall + tread (u around, v across). */
export function tireTex() {
  return cached('tire', () => {
    const w = 512, h = 64;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = '#1b1b1b';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) {
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(x, 20, 3, 24);
      g.fillRect(x + 4, 26, 2, 12);
    }
    const rng = makeRng(3);
    for (let i = 0; i < 300; i++) blob(g, rng, rng() * w, rng() * h, rng.range(0.5, 3), 'rgba(110,95,75,1)', rng.range(0.05, 0.3), 4, 0.4);
    return toTexture(c, { wrap: THREE.RepeatWrapping });
  });
}

/** Sidewall lettering ring texture (generic, no brand). */
export function sidewallTex() {
  return cached('sidewall', () => {
    const S = 256;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#1d1d1d';
    g.fillRect(0, 0, S, S);
    g.save();
    g.translate(S / 2, S / 2);
    g.fillStyle = 'rgba(120,118,112,0.45)';
    g.font = `700 14px ${FONTS.lcd}`;
    g.textAlign = 'center';
    const str = '175/70 R13  82S  TUBELESS  RADIAL  ';
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < str.length; i++) {
        const a = (i / str.length) * Math.PI + k * Math.PI;
        g.save();
        g.rotate(a);
        g.fillText(str[i], 0, -S * 0.42);
        g.restore();
      }
    }
    g.restore();
    const rng = makeRng(6);
    for (let i = 0; i < 160; i++) blob(g, rng, rng() * S, rng() * S, rng.range(0.5, 4), 'rgba(115,100,80,1)', rng.range(0.04, 0.25), 4, 0.4);
    return toTexture(c);
  });
}

/** License plate fallback (if the textures module isn't ready). */
export function plateTexFallback(text = 'กท 1ท-4521', province = 'กรุงเทพมหานคร') {
  return cached('plate:' + text, () => {
    const w = 256, h = 128;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = '#e9c63c';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#111';
    g.lineWidth = 5;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#111';
    g.textAlign = 'center';
    g.font = `700 50px ${FONTS.sign}`;
    g.fillText(text, w / 2, 64);
    g.font = `700 22px ${FONTS.sign}`;
    g.fillText(province, w / 2, 104);
    return toTexture(c);
  });
}
