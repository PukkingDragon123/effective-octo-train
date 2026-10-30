// Procedural body shell of the taxi: a late-80s / early-90s Japanese compact sedan.
//
// Two structured grid surfaces:
//  * LOWER BODY: sections lofted along z (rows = stations, cols = a closed ring of
//    profile points: bottom-centre -> right side -> top-centre -> left side). Rounded
//    ends are produced by insetting the end stations along the ring normals, then the
//    front/rear faces are capped. Wheel arches lift the side's bottom edge per station.
//    Door skins, the trunk lid and the open cabin top are cell subsets of this grid.
//  * GREENHOUSE: horizontal loops lofted from the belt line up to the roof rail
//    (windshield -> A-pillar corner -> side -> C-pillar corner -> rear window), then
//    inset loops form the crowned roof. Window openings are exact cell ranges because
//    the pillar edges are grid columns evaluated per row.
//
// Local frame: +X right, +Y up, -Z forward, origin on the ground under the car centre.
import * as THREE from 'three';
import { GridSurface } from './geom.js';
import { clamp, lerp, smoothstep } from '../core/math.js';

export const DIM = {
  zFront: -2.17,
  zRear: 2.17,
  rEnd: 0.085,
  axleF: -1.36,
  axleR: 1.1,
  archR: 0.372,
  archY: 0.3,
  track: 0.705,
  wheelR: 0.29,
  wheelW: 0.175,
  zCowl: -1.05,
  zParcel: 1.55,
  belt0: 0.93,
  belt1: 0.97,
  rail: 1.31,
  zWsTop: -0.33,
  zRwTop: 1.04,
  crease: 0.7,
  frontDoor: [-1.02, 0.062],
  rearDoor: [0.098, 0.772],
  trunk: [1.6, 2.17],
  zB0: 0.036,
  zDiv: -0.645,
  zRearWinEnd: 0.712,
  zQuarter0: 0.792,
};

// ---------------------------------------------------------------------------
// profile functions
// ---------------------------------------------------------------------------
export const belt = (z) => lerp(DIM.belt0, DIM.belt1, clamp((z - DIM.zCowl) / (DIM.zParcel - DIM.zCowl)));

export function deck(z) {
  if (z <= DIM.zCowl) {
    const t = clamp((z - DIM.zFront) / (DIM.zCowl - DIM.zFront));
    return 0.772 + (DIM.belt0 - 0.772) * (1 - Math.pow(1 - t, 1.7));
  }
  if (z >= DIM.zParcel) {
    const t = clamp((z - DIM.zParcel) / (DIM.zRear - DIM.zParcel));
    return DIM.belt1 + 0.018 * Math.sin(t * Math.PI * 0.85) - 0.012 * t;
  }
  return belt(z);
}
const crownAt = (z) => (z <= DIM.zCowl ? 0.024 : z >= DIM.zParcel ? 0.016 : 0.0);
const halfWidth = (z) => 0.845 - 0.042 * Math.pow(smoothstep(-1.45, -2.17, z), 1.4) - 0.028 * Math.pow(smoothstep(1.62, 2.17, z), 1.4);
const bottomY = (z) => 0.2 + 0.1 * smoothstep(-1.7, -2.17, z) + 0.12 * smoothstep(1.7, 2.17, z);
export function archTop(z) {
  let y = -1;
  for (const a of [DIM.axleF, DIM.axleR]) {
    const d = z - a;
    if (Math.abs(d) < DIM.archR) y = Math.max(y, DIM.archY + Math.sqrt(DIM.archR * DIM.archR - d * d));
  }
  return y;
}
function endInset(z) {
  const r = DIM.rEnd;
  if (z < DIM.zFront + r) {
    const c = clamp(1 - (z - DIM.zFront) / r, 0, 1);
    return r * (1 - Math.sqrt(1 - c * c));
  }
  if (z > DIM.zRear - r) {
    const c = clamp(1 - (DIM.zRear - z) / r, 0, 1);
    return r * (1 - Math.sqrt(1 - c * c));
  }
  return 0;
}

/** Right-half profile at station z: 21 points [x, y] from bottom-centre to top-centre. */
function halfProfile(z) {
  const W = halfWidth(z);
  const yb = bottomY(z);
  const ySh = deck(z);
  const sill = Math.max(0.25 + (yb - 0.2), archTop(z));
  const yCr = Math.min(DIM.crease, ySh - 0.05);
  const yd = deck(z);
  const cr = crownAt(z);
  const X = W - 0.062;
  return [
    [0, yb],
    [W * 0.4, yb],
    [W * 0.78, yb + 0.004],
    [W - 0.07, sill - 0.02],
    [W - 0.035, sill - 0.006],
    [W - 0.013, sill + 0.02],
    [W - 0.004, sill + 0.3 * (yCr - sill)],
    [W, sill + 0.68 * (yCr - sill)],
    [W - 0.001, yCr - 0.014],
    [W - 0.003, yCr - 0.002],
    [W - 0.009, yCr + 0.002],
    [W - 0.012, yCr + 0.45 * (ySh - yCr)],
    [W - 0.016, ySh - 0.028],
    [W - 0.026, ySh - 0.009],
    [W - 0.042, ySh],
    [X, ySh + 0.001],
    [X * 0.8, yd + cr * 0.36],
    [X * 0.6, yd + cr * 0.64],
    [X * 0.4, yd + cr * 0.84],
    [X * 0.2, yd + cr * 0.96],
    [0, yd + cr],
  ];
}
export const LB = {
  half: 21,
  cols: 41,
  splitHi: 10, // first yellow point index (right half)
  doorC0: 5,
  doorC1: 15, // door cells c in [5,15)
  deckC0: 15, // cabin-top cells c in [15, 25)
  deckC1: 25,
};

function lowerStations() {
  const zs = [];
  const r = DIM.rEnd;
  for (let k = 0; k <= 6; k++) {
    const phi = (k / 6) * (Math.PI / 2);
    zs.push(DIM.zFront + r * (1 - Math.cos(phi)));
    zs.push(DIM.zRear - r * (1 - Math.cos(phi)));
  }
  for (let z = DIM.zFront + r; z <= DIM.zRear - r; z += 0.075) zs.push(z);
  const keys = [DIM.zCowl, DIM.zCowl - 0.06, DIM.frontDoor[0], DIM.frontDoor[1], DIM.rearDoor[0], DIM.rearDoor[1], DIM.zParcel, DIM.trunk[0], -2.0, 2.0];
  zs.push(...keys);
  for (const a of [DIM.axleF, DIM.axleR]) {
    zs.push(a - DIM.archR - 0.004, a + DIM.archR + 0.004);
    for (let k = -10; k <= 10; k++) zs.push(a + DIM.archR * Math.sin((k / 10) * (Math.PI / 2)) * 0.999);
  }
  zs.sort((a, b) => a - b);
  const out = [];
  for (const z of zs) if (!out.length || z - out[out.length - 1] > 0.006) out.push(z);
  // make sure keys are exact (snap closest)
  for (const k of keys) {
    let bi = 0;
    for (let i = 0; i < out.length; i++) if (Math.abs(out[i] - k) < Math.abs(out[bi] - k)) bi = i;
    out[bi] = k;
  }
  return out;
}

/** Build the lower body grid + per-station data used for UVs / texture painting. */
export function buildLowerGrid() {
  const zs = lowerStations();
  const rings = zs.map((z) => {
    const h = halfProfile(z);
    const ring = [...h];
    for (let k = h.length - 2; k >= 0; k--) ring.push([-h[k][0], h[k][1]]);
    // inset at the ends along 2D ring normals
    const ins = endInset(z);
    if (ins > 0) {
      const n = ring.length;
      const out = ring.map((p, i) => {
        const a = ring[(i - 1 + n - 1) % (n - 1)];
        const b = ring[(i + 1) % (n - 1)];
        // outward normal of a CCW-ish ring (bottom->right->top->left): rotate tangent
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const l = Math.hypot(tx, ty) || 1;
        tx /= l;
        ty /= l;
        const nx = ty, ny = -tx; // right-hand normal: for ring going counter-clockwise this points outward
        return [p[0] - nx * ins, p[1] - ny * ins];
      });
      return out;
    }
    return ring;
  });
  const grid = new GridSurface(zs.length, LB.cols, (r, c) => [rings[r][c][0], rings[r][c][1], zs[r]]);
  // arc-length v per station
  const vArc = rings.map((ring) => {
    const acc = [0];
    for (let i = 1; i < ring.length; i++) acc.push(acc[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]));
    const L = acc[acc.length - 1];
    return acc.map((a) => a / L);
  });
  return { grid, zs, rings, vArc };
}

// ---------------------------------------------------------------------------
// greenhouse
// ---------------------------------------------------------------------------
const zA = (t) => lerp(DIM.zCowl, DIM.zWsTop, t) - 0.012 * Math.sin(Math.PI * t);
const zC = (t) => lerp(DIM.zParcel, DIM.zRwTop, t) + 0.02 * Math.sin(Math.PI * t);
const xSide = (t) => 0.783 - t * 0.085 + 0.01 * Math.sin(Math.PI * t);
const rc = (t) => 0.012 + 0.05 * t;
const bowF = (t) => 0.03 * t;
const bowR = (t) => 0.025 * t;
const yRow = (t, z) => lerp(belt(z), DIM.rail, t);
export const GH_ROWS_T = [0, 0.035, 0.12, 0.25, 0.4, 0.452, 0.55, 0.7, 0.82, 0.9, 0.94, 1.0];
const ROOF_F = [0.008, 0.02, 0.04, 0.075, 0.13, 0.22, 0.36, 0.52, 0.7, 0.86, 1.0];
export const GH = {
  winBottom: 0.035,
  winTop: 0.9,
  wsTop: 0.94,
  rwTop: 0.93,
  qTop: 0.86,
};

/**
 * Column descriptors for the right half (front-centre -> rear-centre). Each has a tag
 * and fn(t) -> [x, z].
 */
function rightColumns() {
  const cols = [];
  const xe = (t) => xSide(t) - rc(t);
  // windshield
  const wsFr = [0, 0.18, 0.36, 0.54, 0.7, 0.83];
  for (const f of wsFr) cols.push({ tag: 'ws', fn: (t) => { const x = xe(t) * f; return [x, zA(t) - bowF(t) * (1 - f * f)]; } });
  cols.push({ tag: 'wsEdge', fn: (t) => { const x = xe(t) - 0.04; const f = x / xe(t); return [x, zA(t) - bowF(t) * (1 - f * f)]; } });
  cols.push({ tag: 'aFront', fn: (t) => [xe(t), zA(t)] });
  for (let k = 1; k <= 3; k++) {
    const th = (k / 4) * (Math.PI / 2);
    cols.push({ tag: 'aArc', fn: (t) => [xe(t) + rc(t) * Math.sin(th), zA(t) + rc(t) * (1 - Math.cos(th))] });
  }
  const s0 = (t) => zA(t) + rc(t);
  const cFp = (t) => s0(t) + 0.045; // A-pillar side strip end = door frame front edge
  const cFw0 = (t) => cFp(t) + 0.022; // window opening front (slanted)
  const cDiv0 = (t) => Math.max(DIM.zDiv, cFw0(t) + 0.0005);
  const cDiv1 = (t) => Math.max(DIM.zDiv + 0.025, cFw0(t) + 0.001);
  const zB0 = (t) => DIM.zB0 - 0.03 * t;
  const zB1 = (t) => zB0(t) + 0.088;
  const side = (tag, zf) => cols.push({ tag, fn: (t) => [xSide(t), zf(t)] });
  side('s0', s0);
  side('fp', cFp);
  side('fw0', cFw0);
  side('div0', cDiv0);
  side('div1', cDiv1);
  side('fwm', (t) => lerp(cDiv1(t), zB0(t) - 0.022, 0.5));
  side('fw1', (t) => zB0(t) - 0.022);
  side('b0', zB0);
  side('b1', zB1);
  side('rw0', (t) => zB1(t) + 0.022);
  side('rwm', (t) => lerp(zB1(t) + 0.022, DIM.zRearWinEnd, 0.5));
  side('rw1', () => DIM.zRearWinEnd);
  side('dp', () => DIM.zRearWinEnd + 0.06);
  side('q0', () => DIM.zQuarter0);
  side('q1', (t) => Math.max(DIM.zQuarter0 + 0.002, zC(t) - rc(t) - 0.1));
  side('cEnd', (t) => zC(t) - rc(t));
  for (let k = 1; k <= 3; k++) {
    const th = (k / 4) * (Math.PI / 2);
    cols.push({ tag: 'cArc', fn: (t) => [xe(t) + rc(t) * Math.cos(th), zC(t) - rc(t) + rc(t) * Math.sin(th)] });
  }
  cols.push({ tag: 'cRear', fn: (t) => [xe(t), zC(t)] });
  cols.push({ tag: 'rwEdge', fn: (t) => { const x = xe(t) - 0.04; const f = x / xe(t); return [x, zC(t) + bowR(t) * (1 - f * f)]; } });
  for (const f of [0.83, 0.7, 0.54, 0.36, 0.18, 0]) cols.push({ tag: 'rw', fn: (t) => { const x = xe(t) * f; return [x, zC(t) + bowR(t) * (1 - f * f)]; } });
  return cols;
}

export function buildGreenhouse() {
  const R = rightColumns();
  const full = [...R];
  for (let k = R.length - 2; k >= 0; k--) {
    const src = R[k];
    full.push({ tag: src.tag, left: true, fn: (t) => { const p = src.fn(t); return [-p[0], p[1]]; } });
  }
  const nCols = full.length;
  const rowsT = GH_ROWS_T;
  const nSide = rowsT.length;
  const nRows = nSide + ROOF_F.length;
  const yTop = DIM.rail + 0.075;
  const zMid = 0.5 * (zA(1) + zC(1)) + 0.02;
  const pos = (r, c) => {
    const col = full[c];
    if (r < nSide) {
      const t = rowsT[r];
      const [x, z] = col.fn(t);
      const y = yRow(t, z) + (col.tag === 'ws' || col.tag === 'rw' ? 0 : 0);
      return [x, y, z];
    }
    const f = ROOF_F[r - nSide];
    const [x0, z0] = col.fn(1);
    const x = x0 * (1 - f);
    const z = lerp(z0, zMid, f);
    // drip-rail rounding then gentle crown
    const y = DIM.rail + 0.034 * (1 - Math.exp(-f / 0.03)) + (yTop - DIM.rail - 0.034) * Math.sin(f * Math.PI * 0.5);
    return [x, y, z];
  };
  const grid = new GridSurface(nRows, nCols, pos);
  // index ranges by tag (right side indices; left = mirror)
  const idxR = {};
  R.forEach((c, i) => { if (!(c.tag in idxR)) idxR[c.tag] = i; });
  const lastWs = R.findIndex((c) => c.tag === 'wsEdge');
  const firstRw = R.findIndex((c) => c.tag === 'rwEdge');
  const mid = R.length - 1; // rear centre index
  const mirror = (i) => 2 * mid - i; // right index -> left index
  const rowOf = (t) => rowsT.indexOf(t);
  return { grid, cols: full, R, idxR, lastWs, firstRw, mid, mirror, rowOf, nSide, nRows, rowsT };
}

/** Helpers for classifying greenhouse cells. */
export function greenhouseClassifier(gh) {
  const { idxR, mirror, rowOf, nSide } = gh;
  const rWin0 = rowOf(GH.winBottom), rWin1 = rowOf(GH.winTop), rWs1 = rowOf(GH.wsTop), rRw1 = rowOf(GH.rwTop), rQ1 = rowOf(GH.qTop);
  const rRail = nSide - 1;
  const inR = (c, a, b) => c >= idxR[a] && c < idxR[b];
  // range on a side: returns true if cell column c (right) or mirror (left) lies in [a, b)
  const sideRange = (c, a, b) => {
    if (inR(c, a, b)) return 'R';
    const m = mirror(c + 1); // left cells: cell c spans cols c..c+1 -> mirrored cell spans m..m+1
    if (m >= 0 && inR(m, a, b)) return 'L';
    return null;
  };
  const wsC0 = mirror(gh.lastWs); // left wsEdge index
  const wsC1 = gh.lastWs; // right wsEdge index
  const isWindshield = (r, c) => r < rWs1 && (c < wsC1 || c >= mirror(gh.lastWs));
  const isRear = (r, c) => r < rRw1 && c >= gh.firstRw && c < mirror(gh.firstRw);
  const winSide = (r, c, a, b) => (r >= rWin0 && r < rWin1 ? sideRange(c, a, b) : null);
  const classify = (r, c) => {
    if (r >= rRail) return 'body';
    if (isWindshield(r, c)) return 'ws';
    if (isRear(r, c)) return 'rear';
    let s;
    if ((s = winSide(r, c, 'div1', 'fw1'))) return 'win_f' + s;
    if ((s = winSide(r, c, 'rw0', 'rw1'))) return 'win_r' + s;
    if (r >= rWin0 && r < rQ1 && (s = sideRange(c, 'q0', 'q1'))) return 'quarter' + s;
    if ((s = sideRange(c, 'fp', 'b0'))) {
      if (r < rWin1 && sideRange(c, 'fw0', 'div0') && r >= rWin0) return 'sail' + s; // black triangle ahead of division bar
      return 'doorF' + s;
    }
    if ((s = sideRange(c, 'b1', 'dp'))) return 'doorR' + s;
    return 'body';
  };
  return { classify, rWin0, rWin1, rWs1, rRw1, rQ1, rRail, wsC0, wsC1 };
}

/** Side window pane grid (slides inside the door). which 'f'|'r', side 'R'|'L'. */
export function buildSidePane(gh, which, side) {
  const R = gh.R;
  const find = (tag) => R.find((c) => c.tag === tag);
  const cA = which === 'f' ? find('div1') : find('rw0');
  const cB = which === 'f' ? find('fw1') : find('rw1');
  const tTop = GH.winTop;
  const tBot = GH.winBottom;
  const rows = [-0.95, -0.6, -0.3, -0.1, 0, tBot, 0.2, 0.4, 0.55, 0.7, 0.82, tTop];
  const nC = 6;
  const sx = side === 'L' ? -1 : 1;
  const inset = 0.011;
  const P = (t, k) => {
    const tt = Math.max(t, tBot);
    const za = cA.fn(tt)[1], zb = cB.fn(tt)[1];
    const z = lerp(za, zb, k / (nC - 1));
    let x, y;
    if (t >= 0) {
      x = xSide(t) - inset;
      y = yRow(t, z);
    } else {
      x = xSide(0) - inset + t * 0.025;
      y = yRow(0, z) + t * (DIM.rail - belt(z));
    }
    return [x * sx, y, z];
  };
  const grid = new GridSurface(rows.length, nC, (r, c) => P(rows[r], c));
  // mask uv: normalised over the closed opening, v from window bottom to top
  const z0 = Math.min(cA.fn(tTop)[1], cA.fn(tBot)[1]), z1 = Math.max(cB.fn(tTop)[1], cB.fn(tBot)[1]);
  const geo = grid.build(() => true, {
    flip: side === 'L',
    uv: (r, c) => { const p = P(rows[r], c); return [p[2], p[1]]; },
  });
  const uvm = [];
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const z = pa.getZ(i), y = pa.getY(i);
    const yb = yRow(tBot, z), yt = yRow(tTop, z);
    uvm.push(side === 'L' ? 1 - (z - z0) / (z1 - z0) : (z - z0) / (z1 - z0), (y - yb) / (yt - yb));
  }
  geo.setAttribute('uv1', new THREE.Float32BufferAttribute(uvm, 2));
  // slide direction (down along the side surface near the belt)
  const a = P(0.3, 2), b = P(-0.3, 2);
  const slide = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const travel = (DIM.rail - DIM.belt0) * (tTop - tBot) + 0.02;
  return { geometry: geo, slide, travel };
}

export { zA, zC, xSide, rc, yRow };
