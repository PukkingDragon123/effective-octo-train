// Road layout generator: turns LAYOUT into dense 3D centrelines for main / ghost / human / spur.
//
// The main loop is "driven" by a turtle program of straights and clothoid-eased arcs
// (sweepers, tight bends, a pair of hairpin switchbacks), closed exactly with a
// least-squares tweak of the straights so it ends at F, 250 m behind the merge point M,
// heading the same way. The ghost / human branches form a lens (a Y at F, a Y at M)
// that bulges LEFT / RIGHT of the travel direction. The spur joins main as a T from
// the right side. Pure math: runs in node for layout checks (tools in src/sandbox/world-map.js).
import * as THREE from 'three';
import { makeRng, SimplexNoise } from '../core/math.js';

const DEG = Math.PI / 180;

// Main loop program. ['S', len] straight; ['C', radius, angleDeg (+ = left)] eased arc.
// Annotations (tag) mark features other code looks up (sharp curves, hairpins, bridge...).
// Total turning is normalised to +360 deg (counter-clockwise loop seen from above).
// (angles/lengths pre-solved offline so the loop closes with only small straight tweaks)
export const MAIN_PROGRAM = [
  ['S', 300, 'junction', { min: 300 }], // M .. spur junction ~0.068 .. garage ~0.08 on one long straight
  ['C', 100, -22],
  ['S', 28],
  ['C', 95, 96],
  ['S', 28],
  ['C', 120, -20],
  ['S', 61, 'sala1', { u: 0.17, min: 44 }],
  ['C', 75, 107],
  ['S', 51, 'sacred1', { u: 0.243, min: 40 }],
  ['C', 90, -30],
  ['S', 34],
  ['C', 31, -82, 'accident', { u: 0.3 }], // Hundred Corpses Curve: sharp RIGHT, drop on the left (outside)
  ['S', 37],
  ['C', 110, 40],
  ['S', 72, 'bridge', { u: 0.36, min: 56 }], // creek bridge on a straight
  ['C', 85, 70],
  ['S', 60, 'noodle', { u: 0.42, min: 40 }],
  ['C', 140, -15],
  ['S', 26],
  ['C', 29, 168, 'hairpin'], // switchback
  ['S', 59, 'busstop', { u: 0.48, min: 44 }],
  ['C', 30, -166, 'hairpin'], // switchback
  ['S', 40],
  ['C', 90, 44],
  ['S', 95, 'banana', { u: 0.55, min: 56 }],
  ['C', 72, -57],
  ['S', 36],
  ['C', 90, 53],
  ['S', 62, 'temple', { u: 0.62, min: 40 }],
  ['C', 44, 63, 'sharp'],
  ['S', 36],
  ['C', 130, -33],
  ['S', 58, 'sala2', { u: 0.68, min: 40 }],
  ['C', 80, 38],
  ['S', 113, 'elephant', { u: 0.74, min: 70 }], // elephant crossing on a long straight
  ['C', 62, 65],
  ['S', 65, 'market', { u: 0.8, min: 44 }],
  ['C', 38, -93, 'sharp'],
  ['S', 58, 'father', { u: 0.865, min: 40 }],
  ['C', 90, 78],
  ['S', 35],
  ['C', 100, 59],
  ['S', 130, 'approach', { min: 140, end: true }], // long straight approach: the shrine glows ahead in the mist
];

const arcTransition = (R) => Math.min(Math.max(R * 0.25, 6), 20);

/** Integrate a turtle program into dense 2D samples (math coords: x east, y north). */
function integrate(program, start, heading0, step = 0.5) {
  const pts = []; // {x, y, k (curvature), tag}
  let x = start.x, y = start.y, th = heading0;
  const push = (k, tag) => pts.push({ x, y, k, th, tag });
  push(0, null);
  for (const el of program) {
    if (el[0] === 'S') {
      const len = el[1];
      const n = Math.max(1, Math.round(len / step));
      const ds = len / n;
      for (let i = 0; i < n; i++) {
        x += Math.cos(th) * ds;
        y += Math.sin(th) * ds;
        push(0, el[2] || null);
      }
    } else {
      const R = el[1], ang = el[2] * DEG, tag = el[3] || null;
      const sign = Math.sign(ang), A = Math.abs(ang);
      const k = 1 / R;
      // clothoid ease in/out: transition length Lt; total angle = k*Lt + k*Lc
      let Lt = arcTransition(R);
      let Lc = A * R - Lt;
      if (Lc < 0) {
        Lt = A * R;
        Lc = 0;
      }
      const total = 2 * Lt + Lc;
      const n = Math.max(2, Math.round(total / step));
      const ds = total / n;
      for (let i = 0; i < n; i++) {
        const s = (i + 0.5) * ds;
        let kk;
        if (s < Lt) kk = (k * s) / Lt;
        else if (s < Lt + Lc) kk = k;
        else kk = (k * (total - s)) / Lt;
        th += sign * kk * ds;
        x += Math.cos(th) * ds;
        y += Math.sin(th) * ds;
        push(sign * kk, tag);
      }
    }
  }
  return { pts, x, y, th };
}

/** Solve a small dense linear system (Gaussian elimination with partial pivoting). */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

/**
 * Close the loop: normalise arc angles (hairpins untouched) to +360 deg, then choose straight lengths
 * that (hard) end exactly at `target` with total length `Ltarget`, and (soft) put tagged features at
 * their layout u, staying close to the authored lengths and above per-straight minimums.
 */
function closeProgram(program, start, heading, target, Ltarget) {
  const prog = program.map((e) => e.slice());
  let fixed = 0, scalable = 0;
  for (const e of prog) if (e[0] === 'C') (e[3] === 'hairpin' ? (fixed += e[2]) : (scalable += e[2]));
  const fix = (360 - fixed) / scalable;
  for (const e of prog) if (e[0] === 'C' && e[3] !== 'hairpin') e[2] *= fix;
  // per element: start heading, fixed arc length/displacement
  const info = [];
  let th = heading;
  for (const e of prog) {
    if (e[0] === 'S') info.push({ S: true, th, opts: e[3] || {} });
    else {
      const r = integrate([e], { x: 0, y: 0 }, th, 0.25);
      let a = 0;
      for (let i = 1; i < r.pts.length; i++) a += Math.hypot(r.pts[i].x - r.pts[i - 1].x, r.pts[i].y - r.pts[i - 1].y);
      info.push({ S: false, th, len: a, dx: r.x, dy: r.y, opts: e[4] || {} });
      th = r.th;
    }
  }
  const vars = [];
  info.forEach((it, i) => it.S && vars.push(i));
  const nV = vars.length;
  const l0 = vars.map((i) => prog[i][1]);
  const mins = vars.map((i) => info[i].opts.min ?? 12);
  const w = vars.map((i) => Math.max(20, prog[i][1]));
  // hard rows: closure x, closure y, total length
  let cx = target.x - start.x, cy = target.y - start.y, arcSum = 0;
  for (const it of info) if (!it.S) {
    cx -= it.dx;
    cy -= it.dy;
    arcSum += it.len;
  }
  const hardA = [vars.map((i) => Math.cos(info[i].th)), vars.map((i) => Math.sin(info[i].th))];
  const hardB = [cx, cy];
  // soft rows: total length (strong) + feature positions
  const softA = [vars.map(() => 4)], softB = [4 * (Ltarget - arcSum)];
  for (let e = 0; e < info.length; e++) {
    const u = info[e].opts.u;
    if (u == null) continue;
    const row = new Array(nV).fill(0);
    let rhs = u * Ltarget;
    for (let k = 0; k < e; k++) {
      if (info[k].S) row[vars.indexOf(k)] = 1;
      else rhs -= info[k].len;
    }
    if (info[e].S) row[vars.indexOf(e)] = 0.5;
    else rhs -= info[e].len / 2;
    softA.push(row);
    softB.push(rhs);
  }
  const lambda = 0.4;
  let fixedSet = new Set();
  let l = l0.slice();
  for (let iter = 0; iter < 30; iter++) {
    const free = [];
    for (let j = 0; j < nV; j++) if (!fixedSet.has(j)) free.push(j);
    const nf = free.length;
    // H = diag(1/w) + lambda*A_f^T A_f ; g = l0/w + lambda*A_f^T(b - A_f*l_fixed)
    const H = Array.from({ length: nf }, () => new Array(nf).fill(0));
    const g = new Array(nf).fill(0);
    for (let a = 0; a < nf; a++) {
      H[a][a] += 1 / w[free[a]];
      g[a] += l0[free[a]] / w[free[a]];
    }
    for (let r = 0; r < softA.length; r++) {
      let rhs = softB[r];
      for (const j of fixedSet) rhs -= softA[r][j] * mins[j];
      for (let a = 0; a < nf; a++) {
        const va = softA[r][free[a]];
        if (!va) continue;
        g[a] += lambda * va * rhs;
        for (let c = 0; c < nf; c++) H[a][c] += lambda * va * softA[r][free[c]];
      }
    }
    const nH = hardA.length;
    const K = Array.from({ length: nf + nH }, () => new Array(nf + nH).fill(0));
    const rhs = new Array(nf + nH).fill(0);
    for (let a = 0; a < nf; a++) {
      for (let c = 0; c < nf; c++) K[a][c] = H[a][c];
      rhs[a] = g[a];
    }
    for (let h = 0; h < nH; h++) {
      let bb = hardB[h];
      for (const j of fixedSet) bb -= hardA[h][j] * mins[j];
      for (let a = 0; a < nf; a++) {
        K[nf + h][a] = hardA[h][free[a]];
        K[a][nf + h] = hardA[h][free[a]];
      }
      rhs[nf + h] = bb;
    }
    const sol = solve(K, rhs);
    l = l0.slice();
    for (const j of fixedSet) l[j] = mins[j];
    for (let a = 0; a < nf; a++) l[free[a]] = sol[a];
    let worst = -1, wv = 0;
    for (let a = 0; a < nf; a++) {
      const j = free[a];
      if (l[j] < mins[j] - 1e-6 && mins[j] - l[j] > wv) {
        wv = mins[j] - l[j];
        worst = j;
      }
    }
    if (worst < 0) break;
    fixedSet.add(worst);
  }
  vars.forEach((i, j) => (prog[i][1] = Math.max(1, l[j])));
  // diagnostics for offline layout search
  let softErr = 0;
  for (let r = 0; r < softA.length; r++) softErr += Math.abs(softA[r].reduce((a, v, j) => a + v * l[j], 0) - softB[r]);
  const hardErr = Math.hypot(...hardA.map((row, h) => row.reduce((a, v, j) => a + v * l[j], 0) - hardB[h]));
  let dev = 0;
  for (let j = 0; j < nV; j++) dev += Math.abs(l[j] - l0[j]);
  prog.diag = { clamped: fixedSet.size, softErr, hardErr, dev };
  return prog;
}

export const _internal = { integrate, closeProgram, resample, clearance: null };

/** Resample a dense 2D polyline at exactly `spacing` metres (arc length). Keeps curvature & tags. */
function resample(pts, spacing = 1) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const L = cum[cum.length - 1];
  const n = Math.max(2, Math.round(L / spacing));
  const out = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * L;
    while (j < pts.length - 2 && cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const a = pts[j], b = pts[j + 1];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, k: a.k + (b.k - a.k) * t, tag: t < 0.5 ? a.tag : b.tag, s });
  }
  return { pts: out, length: L };
}

/** Curvature of a 2D polyline by finite differences of the heading (signed, + = left). */
function curvatureOf(pts, win = 3) {
  const n = pts.length;
  const k = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, Math.min(n - 1 - 2 * win, i - win));
    const a = pts[i0], b = pts[i0 + win], c = pts[i0 + 2 * win];
    const h1 = Math.atan2(b.y - a.y, b.x - a.x), h2 = Math.atan2(c.y - b.y, c.x - b.x);
    let dh = h2 - h1;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    const ds = (Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y)) / 2 || 1;
    k[i] = dh / ds;
  }
  return k;
}

/** Smooth 1D profile from keyframes [[u, h], ...] via monotone-ish cosine interpolation. */
function keyframeProfile(keys, u) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [u0, h0] = keys[i], [u1, h1] = keys[i + 1];
    if (u <= u1) {
      const t = (u - u0) / (u1 - u0);
      const e = t * t * (3 - 2 * t);
      return h0 + (h1 - h0) * e;
    }
  }
  return keys[keys.length - 1][1];
}

function smoothArray(arr, radius) {
  const n = arr.length;
  const out = new Float64Array(n);
  // box blur x3 ~ gaussian
  let src = Float64Array.from(arr);
  for (let pass = 0; pass < 3; pass++) {
    let acc = 0;
    const r = radius;
    const pref = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) pref[i + 1] = pref[i] + src[i];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - r), b = Math.min(n - 1, i + r);
      out[i] = (pref[b + 1] - pref[a]) / (b - a + 1);
    }
    src = Float64Array.from(out);
    acc = 0;
  }
  return src;
}

/** Build the lens branch from F to M bulging to `side` (-1 left, +1 right) with arc length ~ target. */
function lensBranch(F, M, dirF, side, target, rng) {
  const chord = Math.hypot(M.x - F.x, M.y - F.y);
  const cx = (M.x - F.x) / chord, cy = (M.y - F.y) / chord;
  // left of travel direction (math coords, CCW +90deg)
  const lx = -cy, ly = cx;
  const k = 0.92 + rng() * 0.16;
  const wig = (rng() - 0.5) * 6;
  const build = (b) => {
    const pts = [];
    const n = 800;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const fk = Math.pow(f, k);
      const g = Math.pow(Math.sin(Math.PI * fk), 2);
      const extra = wig * Math.sin(3 * Math.PI * f) * Math.pow(Math.sin(Math.PI * f), 2);
      const lat = -side * (b * g + extra); // side -1 (left) => +left offset
      pts.push({ x: F.x + cx * chord * f + lx * lat, y: F.y + cy * chord * f + ly * lat, k: 0, tag: null });
    }
    return pts;
  };
  const lenOf = (pts) => {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return L;
  };
  let lo = 5, hi = chord;
  for (let it = 0; it < 40; it++) {
    const mid = (lo + hi) / 2;
    if (lenOf(build(mid)) < target) lo = mid;
    else hi = mid;
  }
  return build((lo + hi) / 2);
}

/** Spur: from the junction on main going out to the RIGHT, then reversed (starts outside, ends at main). */
function spurPath(J, rightDir, length, rng) {
  const th0 = Math.atan2(rightDir.y, rightDir.x);
  const prog = [
    ['S', 34],
    ['C', 90, 22 + rng() * 8],
    ['S', 70],
    ['C', 140, -38 - rng() * 10],
    ['S', 60],
    ['C', 70, 46 + rng() * 10],
    ['S', 90],
    ['C', 160, -24],
    ['S', 400],
  ];
  const res = integrate(prog, J, th0, 0.5);
  // trim to length
  const pts = [];
  let L = 0;
  pts.push(res.pts[0]);
  for (let i = 1; i < res.pts.length; i++) {
    L += Math.hypot(res.pts[i].x - res.pts[i - 1].x, res.pts[i].y - res.pts[i - 1].y);
    pts.push(res.pts[i]);
    if (L >= length) break;
  }
  pts.reverse();
  for (const p of pts) p.k = -p.k;
  return pts;
}

/** Minimum clearance between two polylines, ignoring pairs within `skip` metres of arc length (same line) or near given points. */
export function clearance(a, b, opts = {}) {
  const cell = 20;
  const grid = new Map();
  const key = (x, y) => Math.floor(x / cell) * 100003 + Math.floor(y / cell);
  for (let i = 0; i < b.length; i += 2) {
    const k = key(b[i].x, b[i].y);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  let best = Infinity, where = null;
  for (let i = 0; i < a.length; i += 2) {
    const p = a[i];
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const l = grid.get((cx + dx) * 100003 + (cy + dy));
        if (!l) continue;
        for (const j of l) {
          if (opts.same && Math.abs(i - j) < opts.skip) continue;
          if (opts.ignore && opts.ignore(i, j)) continue;
          const d = Math.hypot(p.x - b[j].x, p.y - b[j].y);
          if (d < best) {
            best = d;
            where = { i, j, x: p.x, y: p.y };
          }
        }
      }
    }
  }
  return { d: best, where };
}

/**
 * Generate all road centrelines. Returns
 * { splines: { main, ghost, human, spur }: {points: Vector3[], curvature: Float32Array, tags: string[]},
 *   meta: { M, F, chordDir, junctionS, features: [{tag, s0, s1, sign}] } }
 * World coords: x = east, z = -north, y = up.
 */
export function generateRoadLayout(LAYOUT) {
  const rng = makeRng(LAYOUT.seed * 7919 + 13);
  const nz = new SimplexNoise(LAYOUT.seed * 31 + 7);
  const chord = 250;
  const M = { x: 0, y: 0 };
  const heading = Math.PI / 2; // north
  const F = { x: 0, y: -chord };
  const prog = closeProgram(MAIN_PROGRAM, M, heading, F, LAYOUT.mainLength);
  const dense = integrate(prog, M, heading, 0.25);
  const main = resample(dense.pts, 1);

  // features (tagged runs) in main arc length
  const features = [];
  {
    let cur = null;
    for (const p of main.pts) {
      if (p.tag && (!cur || cur.tag !== p.tag || p.s - cur.s1 > 2)) {
        cur = { tag: p.tag, s0: p.s, s1: p.s, sign: 0, kmax: 0 };
        features.push(cur);
      }
      if (p.tag && cur && cur.tag === p.tag) {
        cur.s1 = p.s;
        if (Math.abs(p.k) > cur.kmax) {
          cur.kmax = Math.abs(p.k);
          cur.sign = Math.sign(p.k);
        }
      }
      if (!p.tag) cur = null;
    }
  }

  // branches
  const dirF = { x: Math.cos(dense.th), y: Math.sin(dense.th) };
  const ghost = resample(lensBranch(F, M, dirF, -1, LAYOUT.ghostBranchLength, rng), 1);
  const human = resample(lensBranch(F, M, dirF, +1, LAYOUT.humanBranchLength, rng), 1);

  // spur from junction
  const sJ = LAYOUT.landmarks.spurJunction.u * main.length;
  const jIdx = Math.round(sJ);
  const jp = main.pts[jIdx];
  const jn = main.pts[Math.min(main.pts.length - 1, jIdx + 2)], jb = main.pts[Math.max(0, jIdx - 2)];
  const tl = Math.hypot(jn.x - jb.x, jn.y - jb.y);
  const tdir = { x: (jn.x - jb.x) / tl, y: (jn.y - jb.y) / tl };
  const rightDir = { x: tdir.y, y: -tdir.x }; // CW 90 deg = right of travel
  const spur = resample(spurPath({ x: jp.x, y: jp.y }, rightDir, LAYOUT.spurLength, rng), 1);

  // ---------------- elevation -------------------------------------------------------------
  const L = main.length;
  const fu = (tag) => {
    const f = features.find((f) => f.tag === tag);
    return f ? (f.s0 + f.s1) / 2 / L : null;
  };
  const uBridge = fu('bridge') ?? 0.36;
  const hp = features.filter((f) => f.tag === 'hairpin');
  const hp0 = hp[0] ? hp[0].s0 / L : 0.446, hp1 = hp[1] ? hp[1].s1 / L : 0.513;
  const E = LAYOUT.elevationRange;
  const scaleE = E / 18;
  // authored elevation (metres at elevationRange = 18), keyed by u
  const keys = [
    [0, 0], [0.095, 0.3], [0.17, 4], [0.24, 8.5], [0.29, 7.5],
    [uBridge - 0.012, -4], [uBridge + 0.012, -4], [0.42, -1.5],
    [hp0 - 0.004, -0.5], [hp1 + 0.004, 12], [0.55, 14], [0.595, 15], [0.63, 13],
    [0.68, 7.5], [0.74, 2], [0.8, -3], [0.865, -4], [0.9, -2.2], [0.94, -0.3], [0.97, 0], [1, 0],
  ].sort((a, b) => a[0] - b[0]);
  const hMain = new Float64Array(main.pts.length);
  for (let i = 0; i < main.pts.length; i++) {
    const s = main.pts[i].s, u = s / L;
    let h = keyframeProfile(keys, u) * scaleE;
    // gentle rolling noise, faded where flat zones are needed (ends, junction/garage, bridge)
    let fade = Math.min(1, Math.min(s, L - s) / 140);
    fade *= Math.min(1, Math.max(0, (Math.abs(s - 0.075 * L) - 70) / 60));
    fade *= Math.min(1, Math.max(0, (Math.abs(u - uBridge) * L - 30) / 50));
    h += nz.fbm2(s / 120, 3.7, 3) * 1.4 * fade;
    hMain[i] = h;
  }
  // grade limiter (forward/backward passes) then smooth
  const limitGrade = (arr, g) => {
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 1; i < arr.length; i++) arr[i] = Math.min(arr[i - 1] + g, Math.max(arr[i - 1] - g, arr[i]));
      for (let i = arr.length - 2; i >= 0; i--) arr[i] = Math.min(arr[i + 1] + g, Math.max(arr[i + 1] - g, arr[i]));
    }
    return arr;
  };
  const hMainS = smoothArray(limitGrade(hMain, 0.065), 12);
  // re-pin exact flats at the lens ends
  for (let i = 0; i < main.pts.length; i++) {
    const s = main.pts[i].s;
    if (s < 30) hMainS[i] *= s / 30;
    if (s > L - 30) hMainS[i] *= (L - s) / 30;
  }
  const hJ = hMainS[jIdx];

  const branchH = (pts, bump) => {
    const n = pts.length;
    const arr = new Float64Array(n);
    const Lb = pts[n - 1].s;
    for (let i = 0; i < n; i++) {
      const f = pts[i].s / Lb;
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, (f - 0.08) / 0.84))), 2);
      arr[i] = bump * env + nz.noise2D(f * 3, bump) * 0.6 * env;
    }
    return arr;
  };
  const hGhost = smoothArray(branchH(ghost.pts, -3.2 * scaleE), 8);
  const hHuman = smoothArray(branchH(human.pts, 2.2 * scaleE), 8);
  const hSpur = new Float64Array(spur.pts.length);
  {
    const Ls = spur.length;
    for (let i = 0; i < spur.pts.length; i++) {
      const f = spur.pts[i].s / Ls; // 0 outside .. 1 junction
      const toEnd = Ls - spur.pts[i].s;
      const flat = Math.min(1, Math.max(0, (toEnd - 20) / 60));
      hSpur[i] = hJ + flat * (7 * Math.pow(1 - f, 1.2) * scaleE + nz.noise2D(f * 4, 9.1) * 1.8);
    }
  }
  const hSpurS = smoothArray(hSpur, 10);
  for (let i = 0; i < spur.pts.length; i++) if (spur.length - spur.pts[i].s < 18) hSpurS[i] = hJ;

  const to3 = (pts, h) => pts.map((p, i) => new THREE.Vector3(p.x, h[i], -p.y));
  const curv = (pts) => curvatureOf(pts, 3);

  return {
    splines: {
      main: { points: to3(main.pts, hMainS), curvature: curv(main.pts), tags: main.pts.map((p) => p.tag) },
      ghost: { points: to3(ghost.pts, hGhost), curvature: curv(ghost.pts), tags: [] },
      human: { points: to3(human.pts, hHuman), curvature: curv(human.pts), tags: [] },
      spur: { points: to3(spur.pts, hSpurS), curvature: curv(spur.pts), tags: [] },
    },
    meta: {
      M: new THREE.Vector3(M.x, 0, -M.y),
      F: new THREE.Vector3(F.x, 0, -F.y),
      features,
      program: prog,
      junctionS: sJ,
      checks: {
        mainSelf: clearance(main.pts, main.pts, { same: true, skip: 140 }),
        mainSpur: clearance(spur.pts, main.pts, { ignore: (i, j) => i > spur.pts.length - 60 && Math.abs(j - jIdx) < 60 }),
        mainGhost: clearance(ghost.pts, main.pts, { ignore: (i, j) => (i < 70 && j > main.pts.length - 70) || (i > ghost.pts.length - 70 && j < 70) }),
        mainHuman: clearance(human.pts, main.pts, { ignore: (i, j) => (i < 70 && j > main.pts.length - 70) || (i > human.pts.length - 70 && j < 70) }),
        spurGhost: clearance(spur.pts, ghost.pts),
        spurHuman: clearance(spur.pts, human.pts),
      },
    },
  };
}
