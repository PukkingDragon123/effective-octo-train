// Faded Thai road markings.
//   road_lines    512×2048 RGBA sheet of vertical strips (each 0.5 m wide, 12 m long, tile in v)
//   road_stencils 1024×1024 RGBA cells: ช้าลง / SLOW text, arrows, zebra bars, stop line, chevrons
// ROAD_MARKINGS documents the layout; uv rects are three.js uv (v up).
import { makeRng } from '../core/math.js';
import { fbm, crack } from './noise.js';
import { Img, rgb, colorOut, dataOut, normalMap, sstep, strokes, bleed } from './painter.js';
import { FONTS } from '../ui/fonts.js';

const STRIPS = [
  // name, colour, pattern
  ['centre_dashed_white', 'white', { lines: [0], width: 0.12, dash: [3, 3] }],
  ['centre_double_yellow', 'yellow', { lines: [-0.1, 0.1], width: 0.1 }],
  ['edge_white', 'white', { lines: [0], width: 0.15 }],
  ['centre_solid_yellow', 'yellow', { lines: [0], width: 0.12 }],
  ['edge_white_dashed', 'white', { lines: [0], width: 0.15, dash: [1, 1] }],
  ['edge_yellow', 'yellow', { lines: [0], width: 0.12 }],
  ['centre_dashed_yellow', 'yellow', { lines: [0], width: 0.12, dash: [3, 3] }],
  ['worn_white', 'white', { lines: [0], width: 0.12, dash: [3, 3], worn: 0.55 }],
];

/**
 * Layout of the marking textures. For a strip, map the decal ribbon's u across the strip's
 * u-range (0.5 m wide, line centred in it) and v = metresAlongRoad / tileLength (repeat).
 * Draw as a transparent / alpha-blended decal slightly above the asphalt (polygonOffset).
 */
export const ROAD_MARKINGS = {
  road_lines: {
    size: [512, 2048],
    tileLength: 12, // metres per v repeat
    stripWidth: 0.5, // metres across each strip
    strips: Object.fromEntries(STRIPS.map(([name, color, p], i) => [name, { uv: [i / 8, 0, (i + 1) / 8, 1], centerU: (i + 0.5) / 8, color, lineWidth: p.width, dash: p.dash || null }])),
    usage: "strip u-range across a 0.5 m ribbon, v = s / 12 (RepeatWrapping). Thai convention: white dashed centre where passing is allowed, double yellow at curves / no-passing, white edge lines.",
  },
  road_stencils: {
    size: [1024, 1024],
    cells: [
      { name: 'slow_th', uv: [0, 0.5, 0.25, 1], sizeM: [1.2, 2.4], kind: 'ช้าลง painted text, read from the driver (bottom of cell nearest the car)' },
      { name: 'slow_en', uv: [0.25, 0.5, 0.5, 1], sizeM: [1.2, 2.4], kind: 'SLOW' },
      { name: 'arrow_straight', uv: [0.5, 0.5, 0.625, 1], sizeM: [0.6, 2.4] },
      { name: 'arrow_left', uv: [0.625, 0.5, 0.8125, 1], sizeM: [0.9, 2.4] },
      { name: 'arrow_right', uv: [0.8125, 0.5, 1, 1], sizeM: [0.9, 2.4] },
      { name: 'zebra', uv: [0, 0, 0.5, 0.5], sizeM: [3.1, 3.1], kind: '5 zebra bars (crossing one lane)' },
      { name: 'stop_line', uv: [0.5, 0.375, 1, 0.5], sizeM: [3.1, 0.4] },
      { name: 'chevron', uv: [0.5, 0, 1, 0.375], sizeM: [3.1, 2.3], kind: 'yellow/white chevrons (fork gore area)' },
    ],
  },
};

const PAINT = { white: rgb('#dcd8cc'), yellow: rgb('#d6a62c') };

function wearAlpha(img, seed, amount, k, along = 'v') {
  // erode paint alpha: stretched wear noise (tyres run along the road), grain, cracks
  const { w, h, d } = img;
  const n = w * h;
  const wearN = fbm(w, h, { cells: along === 'v' ? [4, 16] : 8, octaves: 5, seed, gain: 0.55 });
  const grain = fbm(w, h, { cells: along === 'v' ? [96, 384] : 160, octaves: 1, seed: seed + 1 });
  const C = new Float32Array(n);
  const rng = makeRng(seed + 2);
  for (let c = 0; c < Math.round(10 * (h / w)); c++) crack(C, w, h, rng, { x: rng() * w, y: rng() * h, angle: rng() * Math.PI * 2, steps: 30 + rng() * 60, step: 4 * k, wander: 1.0, width: (1 + rng()) * k, branch: 0.05, vary: 1 });
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const a = d[j + 3];
    if (a <= 0) continue;
    const keep = sstep(amount - 0.15, amount + 0.25, wearN[i] * 0.6 + 0.5 + grain[i] * 0.22);
    const cr = 1 - sstep(0.15, 0.6, C[i]);
    d[j + 3] = a * keep * cr * (0.72 + grain[i] * 0.12 + wearN[i] * 0.1);
    // dirt in the paint
    const dirt = 0.82 + wearN[i] * 0.1 + grain[i] * 0.06;
    d[j] *= dirt;
    d[j + 1] *= dirt;
    d[j + 2] *= dirt * 0.98;
  }
}

/** road_lines: pure typed-array painter (no DOM). */
export function genRoadLines(S = 512) {
  const w = S, h = S * 4, k = S / 512;
  const colW = w / 8;
  const pxPerM = colW / 0.5; // across
  const pxPerMv = h / 12; // along
  const img = new Img(w, h, [0.85, 0.85, 0.8, 0]);
  const d = img.d;
  const edgeN = fbm(w, h, { cells: [32, 128], octaves: 2, seed: 6101 });
  STRIPS.forEach(([name, color, p], ci) => {
    const cx = (ci + 0.5) * colW;
    const col = PAINT[color];
    const hw = (p.width / 2) * pxPerM;
    for (let y = 0; y < h; y++) {
      const m = y / pxPerMv; // metres along
      let on = 1;
      if (p.dash) {
        const per = p.dash[0] + p.dash[1];
        const f = (((m % per) + per) % per);
        const ends = Math.min(f, p.dash[0] - f) * pxPerMv;
        on = f < p.dash[0] ? Math.min(1, ends / 2 + 0.5) : 0;
      }
      if (on <= 0) continue;
      for (const off of p.lines) {
        const lc = cx + off * pxPerM;
        for (let x = Math.floor(lc - hw - 3); x <= Math.ceil(lc + hw + 3); x++) {
          const i = y * w + x;
          const e = hw - Math.abs(x + 0.5 - lc) + edgeN[i] * 1.6 * k;
          const a = Math.min(1, Math.max(0, e + 0.5)) * on;
          if (a <= 0) continue;
          const j = i * 4;
          d[j] = col[0];
          d[j + 1] = col[1];
          d[j + 2] = col[2];
          d[j + 3] = Math.max(d[j + 3], a);
        }
      }
    }
    // per-strip wear (worn strip much more eroded)
    void name;
  });
  wearAlpha(img, 6102, 0.14, k, 'v');
  // extra erosion on the worn strip
  const wn = fbm(w, h, { cells: [4, 16], octaves: 4, seed: 6103 });
  for (let y = 0; y < h; y++) for (let x = 7 * colW; x < w; x++) {
    const i = y * w + x;
    d[i * 4 + 3] *= sstep(0.1, 0.5, wn[i] + 0.15);
  }
  strokes(img, { seed: 6104, len: [10 * k, 24 * k], width: [3 * k, 6 * k], opacity: 0.25, coverage: 0.4, angle: Math.PI / 2, angleJitter: 0.1, valueJitter: 0.06, alphaOnly: true });
  bleed(img, 4);
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = d[i * 4 + 3] * 0.5;
  return {
    road_lines: colorOut(img, { alpha: true, meta: { layout: ROAD_MARKINGS.road_lines } }),
    road_lines_normal: dataOut(normalMap(H, w, h, 2), w, h),
  };
}

/** road_stencils: canvas text + shapes, then the same wear. Main thread only (needs fonts). */
export function genRoadStencils(S = 1024) {
  const w = S, h = S, k = S / 1024;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  const white = '#dcd8cc', yellow = '#d6a62c';
  const cell = (u0, v0, u1, v1) => [u0 * w, (1 - v1) * h, (u1 - u0) * w, (v1 - v0) * h]; // x,y,w,h in canvas px
  // stretched text (road text is elongated along the driving direction)
  const stretched = (txt, [x, y, cw, ch], font, col) => {
    g.save();
    g.fillStyle = col;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const m = g.measureText(txt);
    const sx = (cw * 0.9) / m.width;
    const sy = (ch * 0.78) / 140;
    g.translate(x + cw / 2, y + ch / 2);
    g.scale(sx, sy);
    g.fillText(txt, 0, 6);
    g.restore();
  };
  stretched('ช้าลง', cell(0, 0.5, 0.25, 1), `800 120px ${FONTS.sign}`, white);
  stretched('SLOW', cell(0.25, 0.5, 0.5, 1), `800 120px ${FONTS.sign}`, white);
  const arrow = ([x, y, cw, ch], turn) => {
    g.save();
    g.fillStyle = white;
    g.strokeStyle = white;
    g.translate(x + cw / 2, y + ch);
    const sw = cw * (turn ? 0.16 : 0.22), len = ch * 0.94;
    if (!turn) {
      g.fillRect(-sw / 2, -len * 0.66, sw, len * 0.64);
      g.beginPath();
      g.moveTo(-cw * 0.44, -len * 0.64);
      g.lineTo(0, -len);
      g.lineTo(cw * 0.44, -len * 0.64);
      g.closePath();
      g.fill();
    } else {
      const s = turn, bx = -s * cw * 0.18;
      g.lineWidth = sw;
      g.lineCap = 'butt';
      g.beginPath();
      g.moveTo(bx, -len * 0.02);
      g.lineTo(bx, -len * 0.5);
      g.quadraticCurveTo(bx, -len * 0.74, bx + s * cw * 0.3, -len * 0.74);
      g.stroke();
      g.beginPath();
      const hx = bx + s * cw * 0.28;
      g.moveTo(hx, -len * 0.74 - cw * 0.3);
      g.lineTo(hx + s * cw * 0.34, -len * 0.74);
      g.lineTo(hx, -len * 0.74 + cw * 0.3);
      g.closePath();
      g.fill();
    }
    g.restore();
  };
  arrow(cell(0.5, 0.5, 0.625, 1), 0);
  arrow(cell(0.625, 0.5, 0.8125, 1), -1);
  arrow(cell(0.8125, 0.5, 1, 1), 1);
  // zebra bars
  {
    const [x, y, cw, ch] = cell(0, 0, 0.5, 0.5);
    g.fillStyle = white;
    for (let i = 0; i < 5; i++) g.fillRect(x + cw * 0.05 + i * cw * 0.19, y + ch * 0.04, cw * 0.11, ch * 0.92);
  }
  {
    const [x, y, cw, ch] = cell(0.5, 0.375, 1, 0.5);
    g.fillStyle = white;
    g.fillRect(x + cw * 0.03, y + ch * 0.25, cw * 0.94, ch * 0.5);
  }
  {
    const [x, y, cw, ch] = cell(0.5, 0, 1, 0.375);
    g.save();
    g.beginPath();
    g.rect(x, y, cw, ch);
    g.clip();
    for (let i = -4; i < 8; i++) {
      g.fillStyle = i % 2 ? yellow : white;
      g.beginPath();
      const bx = x + i * cw * 0.16;
      g.moveTo(bx, y + ch);
      g.lineTo(bx + cw * 0.07, y + ch);
      g.lineTo(bx + cw * 0.07 + cw * 0.5, y);
      g.lineTo(bx + cw * 0.5, y);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  const id = g.getImageData(0, 0, w, h);
  const img = new Img(w, h);
  const d = img.d;
  for (let i = 0; i < id.data.length; i++) d[i] = id.data[i] / 255;
  wearAlpha(img, 6201, 0.1, k, 'n');
  strokes(img, { seed: 6202, len: [10 * k, 24 * k], width: [3 * k, 6 * k], opacity: 0.25, coverage: 0.4, angleJitter: 3, valueJitter: 0.06, alphaOnly: true });
  bleed(img, 4);
  return { road_stencils: colorOut(img, { alpha: true, wrap: 'clamp', meta: { layout: ROAD_MARKINGS.road_stencils } }) };
}
