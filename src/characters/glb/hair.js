// Procedural hair fitted to the GLB head (ideas from Hia Phat's hair.ts, re-implemented):
// the bind-pose head is ray-cast once per template into a clean spherical surface grid
// r(θ, φ) around a head centre; styles define a hairline (height per azimuth), a shell
// thickness field and optional curtains (long / bob), bun or ponytail. Curtains drape over
// the shoulders and back (ray-cast body surface) and are skinned to spring-driven hair chains
// (hair_1..3 at the back, hairL/R at the sides) for secondary motion.
// UVs: atlas hair region (s around the head, t 0..0.62 shell, 0.64..1 curtain/tails).
import * as THREE from 'three';
import { makeRng, clamp, smoothstep, lerp, noise } from '../../core/math.js';
import { ruv, R } from './layout.js';

const NT = 48, NP = 36; // azimuth / elevation samples
const P_MIN = -70 * Math.PI / 180, P_MAX = Math.PI / 2;

/** Head surface grid (cached on the template). */
export function headGrid(t) {
  if (t._headGrid) return t._headGrid;
  const g = t.geos.body_lo ? t.geos.body_hi : t.geos.body_hi;
  const pos = g.attributes.position, idx = g.index.array;
  const hb = t.Gp[t.index.Head];
  const C = new THREE.Vector3(0, t.eyeMid.y + 0.004, hb.z + 0.012);
  const tris = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(pos, idx[i]); b.fromBufferAttribute(pos, idx[i + 1]); c.fromBufferAttribute(pos, idx[i + 2]);
    if (Math.max(a.y, b.y, c.y) < hb.y - 0.08) continue;
    if (a.distanceTo(C) > 0.2 && b.distanceTo(C) > 0.2) continue;
    tris.push(a.clone(), b.clone(), c.clone());
  }
  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();
  const r = new Float32Array(NT * NP);
  for (let i = 0; i < NT; i++) {
    const th = -Math.PI + (2 * Math.PI * i) / NT;
    for (let j = 0; j < NP; j++) {
      const ph = P_MIN + ((P_MAX - P_MIN) * j) / (NP - 1);
      ray.origin.copy(C);
      ray.direction.set(Math.cos(ph) * Math.sin(th), Math.sin(ph), Math.cos(ph) * Math.cos(th));
      let best = 0;
      for (let k = 0; k < tris.length; k += 3) if (ray.intersectTriangle(tris[k], tris[k + 1], tris[k + 2], false, hit)) best = Math.max(best, hit.distanceTo(C));
      r[i * NP + j] = best;
    }
  }
  // fill misses from neighbours
  for (let pass = 0; pass < 6; pass++) for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
    if (r[i * NP + j] > 0) continue;
    let s = 0, n = 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = (i + di + NT) % NT, jj = j + dj;
      if (jj < 0 || jj >= NP) continue;
      const v = r[ii * NP + jj];
      if (v > 0) { s += v; n++; }
    }
    if (n) r[i * NP + j] = s / n;
  }
  t._headGrid = { C, r };
  return t._headGrid;
}

function sampleR(G, th, ph) {
  let u = ((th + Math.PI) / (2 * Math.PI)) * NT;
  u = ((u % NT) + NT) % NT;
  const v = clamp(((ph - P_MIN) / (P_MAX - P_MIN)) * (NP - 1), 0, NP - 1.001);
  const i0 = Math.floor(u), i1 = (i0 + 1) % NT, fu = u - i0;
  const j0 = Math.floor(v), j1 = Math.min(NP - 1, j0 + 1), fv = v - j0;
  const r = G.r;
  return lerp(lerp(r[i0 * NP + j0], r[i1 * NP + j0], fu), lerp(r[i0 * NP + j1], r[i1 * NP + j1], fu), fv);
}
const dirOf = (th, ph, out) => out.set(Math.cos(ph) * Math.sin(th), Math.sin(ph), Math.cos(ph) * Math.cos(th));

/** elevation φ at which the head surface reaches height y (relative to C) along azimuth θ */
function phiAtHeight(G, th, y) {
  let lo = P_MIN, hi = P_MAX;
  for (let k = 0; k < 24; k++) {
    const m = (lo + hi) / 2;
    const h = Math.sin(m) * sampleR(G, th, m);
    if (h < y) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

// hairline height (m relative to the head centre ≈ eye level) by |θ| in degrees
const lineStd = (front = 0.064, temple = 0.047, side = 0.02, behind = -0.012, back = -0.07) => (a) =>
  a < 45 ? lerp(front, temple, a / 45) : a < 90 ? lerp(temple, side, (a - 45) / 45) : a < 125 ? lerp(side, behind, (a - 90) / 35) : lerp(behind, back, (a - 125) / 55);

const STYLES = {
  short: { line: lineStd(), thick: (a, k) => lerp(0.005, 0.02, k * k) + (a < 40 ? 0.004 * k : 0) + (a > 120 ? 0.004 * k : 0), noise: [0.003, 12, 0.0015, 30] },
  'gray-short': { line: lineStd(0.068, 0.05, 0.018, -0.014, -0.068), thick: (a, k) => lerp(0.004, 0.013, k * k), noise: [0.002, 14, 0.001, 30] },
  messy: { line: lineStd(0.052, 0.04, 0.012, -0.02, -0.075), thick: (a, k) => lerp(0.008, 0.026, k), noise: [0.007, 8, 0.004, 22], spikes: 0.012 },
  pompadour: { line: lineStd(0.066, 0.05, 0.02, -0.012, -0.068), thick: (a, k) => lerp(0.004, 0.012, k) + (a < 50 ? 0.03 * smoothstep(0.3, 0.9, k) * (1 - a / 50) : 0), noise: [0.001, 18], slick: true },
  long: { line: lineStd(0.064, 0.047, 0.018, -0.014, -0.06), thick: (a, k) => lerp(0.009, 0.016, k), curtain: (a) => (a < 60 ? null : a < 110 ? lerp(-0.2, -0.26, (a - 60) / 50) : lerp(-0.26, -0.4, (a - 110) / 70)), gap: 52, flare: 0.012, noise: [0.002, 10] },
  bob: { line: lineStd(0.064, 0.047, 0.02, -0.012, -0.05), thick: (a, k) => lerp(0.011, 0.015, k), curtain: (a) => (a < 62 ? null : lerp(-0.075, -0.085, (a - 62) / 118)), gap: 58, flare: 0.008, noise: [0.0015, 14] },
  bun: { line: lineStd(0.066, 0.05, 0.022, -0.01, -0.055), thick: (a, k) => 0.006 + 0.004 * k, extra: 'bun', slick: true },
  ponytail: { line: lineStd(0.066, 0.05, 0.022, -0.01, -0.055), thick: () => 0.006, extra: 'ponytail', slick: true },
  bald: { line: lineStd(0.02, 0.015, 0.005, -0.02, -0.07), thick: () => 0.004, minA: 75, top: 0.045, noise: [0.001, 20] },
  shaved: null,
};
STYLES.pony = STYLES.ponytail;

const _d = new THREE.Vector3();

/** Hair geometry (bind space) with skin attributes + apart = 2. Returns null for shaved. */
export function buildHairGeometry(t, look) {
  let st = STYLES[look.hair.style] ?? STYLES.short;
  if (!st) return null;
  const G = headGrid(t);
  const C = G.C;
  const rng = makeRng(look.seed * 3 + 1);
  const wet = look.hair.wet || 0;
  const hasHat = look.acc.includes('cap') || look.acc.includes('helmet');
  const J = 32, K = 9;
  const verts = []; // {p, uv, w: [[bone, weight]...]}
  const tris = [];
  const iHead = t.index.Head;
  const addV = (p, u, v, w) => { verts.push({ p: p.clone(), u, v, w }); return verts.length - 1; };
  const thickAt = (th, ph, k) => {
    const a = Math.abs(th) * 180 / Math.PI;
    let tk = st.thick(a, k);
    if (st.noise) {
      dirOf(th, ph, _d);
      tk += noise.noise3D(_d.x * st.noise[1], _d.y * st.noise[1], _d.z * st.noise[1] + look.seed % 97) * st.noise[0];
      if (st.noise[2]) tk += noise.noise3D(_d.x * st.noise[3] + 9, _d.y * st.noise[3], _d.z * st.noise[3]) * st.noise[2];
    }
    if (st.spikes) tk += Math.max(0, noise.noise3D(_d.x * 11, _d.y * 11, _d.z * 11)) * st.spikes * k;
    if (hasHat && ph > 0.25) tk *= 0.35;
    return Math.max(0.0025, tk) + (wet > 0.3 ? -0.002 : 0);
  };
  // the shell thins out to the scalp at the hairline (no helmet step)
  const edgeK = (f) => 0.25 + 0.75 * (1 - smoothstep(0.62, 1, f));
  const thickAt0 = thickAt;
  const thickAtE = (th, ph, k, f) => thickAt0(th, ph, k) * edgeK(f);
  void thickAtE;
  {
  };
  const pt = (th, ph, off, out = new THREE.Vector3()) => out.copy(dirOf(th, ph, _d)).multiplyScalar(sampleR(G, th, ph) + off).add(C);
  // ---- shell grid: columns θ (seam at the back), rows from crown (k=1 at top) to hairline
  const cols = [];
  for (let j = 0; j <= J; j++) cols.push(-Math.PI + (2 * Math.PI * j) / J);
  const minA = st.minA ?? 0;
  const topPh = st.top !== undefined ? phiAtHeight(G, 0, st.top) : Math.PI / 2 - 0.12;
  const grid = [];
  const lineY = (th) => st.line(Math.abs(th) * 180 / Math.PI) + (look.sex === 'f' ? -0.003 : 0);
  for (let j = 0; j <= J; j++) {
    const th = cols[j];
    const ph0 = phiAtHeight(G, th, lineY(th));
    const col = [];
    for (let k = 0; k <= K; k++) {
      const f = k / K; // 0 = top, 1 = hairline
      const ph = lerp(topPh, ph0, Math.pow(f, 0.85));
      const p = pt(th, ph, thickAt0(th, ph, 1 - f) * edgeK(f));
      col.push({ p, ph, idx: addV(p, j / J, f * 0.6, [[iHead, 1]]) });
    }
    grid.push(col);
  }
  const okCol = (j) => Math.abs(cols[j]) * 180 / Math.PI >= minA - 0.1;
  for (let j = 0; j < J; j++) {
    if (!okCol(j) || !okCol(j + 1)) continue;
    for (let k = 0; k < K; k++) tris.push([grid[j][k].idx, grid[j][k + 1].idx, grid[j + 1][k].idx], [grid[j + 1][k].idx, grid[j][k + 1].idx, grid[j + 1][k + 1].idx]);
  }
  // crown cap
  if (st.top === undefined) {
    const cp = pt(0, Math.PI / 2 - 0.001, thickAt(0, Math.PI / 2, 1));
    const ci = addV(cp, 0.5, 0, [[iHead, 1]]);
    for (let j = 0; j < J; j++) tris.push([grid[j][0].idx, grid[j + 1][0].idx, ci].reverse());
  }
  // lip under the hairline back onto the scalp (visible shell thickness)
  const lip = [];
  for (let j = 0; j <= J; j++) {
    const th = cols[j], ph = grid[j][K].ph - 0.01;
    lip.push(addV(pt(th, ph, 0.0008), j / J, 0.615, [[iHead, 1]]));
  }
  for (let j = 0; j < J; j++) {
    if (!okCol(j) || !okCol(j + 1)) continue;
    tris.push([grid[j][K].idx, lip[j], grid[j + 1][K].idx], [grid[j + 1][K].idx, lip[j], lip[j + 1]]);
  }
  // ---- curtain (long hair / bob)
  const curtainTris = [];
  if (st.curtain && !look.acc.includes('helmet')) {
    const hb = t.Gp[iHead];
    const bodyR = bodyRadiusFn(t);
    const chains = { back: ['hair_1', 'hair_2', 'hair_3'].map((n) => t.index[n]), L: ['hairL_1', 'hairL_2'].map((n) => t.index[n]), R: ['hairR_1', 'hairR_2'].map((n) => t.index[n]) };
    const KC = 10;
    const run = [];
    for (let j = 0; j <= J; j++) if (Math.abs(cols[j]) * 180 / Math.PI >= st.gap) run.push(j);
    // order around the back: positive θ ascending, then negative θ ascending (unwrap through ±π)
    const left = run.filter((j) => cols[j] > 0).sort((a, b) => cols[a] - cols[b]);
    const right = run.filter((j) => cols[j] <= 0).sort((a, b) => cols[a] - cols[b]);
    const order = [...left, ...right];
    const cgrid = [];
    for (let ci = 0; ci < order.length; ci++) {
      const j = order[ci];
      const th = cols[j];
      const a = Math.abs(th) * 180 / Math.PI;
      const endY = (st.curtain(a) ?? -0.1) + (rng() - 0.5) * 0.02;
      const start = grid[j][K].p.clone();
      const col = [];
      let prev = start.clone();
      const out = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
      for (let k = 0; k <= KC; k++) {
        const f = k / KC;
        const y = lerp(start.y, C.y + endY, f);
        const p = prev.clone();
        p.y = y;
        // flare out a little, keep outside the head/body, gravity-straight strands
        p.addScaledVector(out, (st.flare || 0) * f / KC * 2);
        const relY = y - C.y;
        const ph = Math.asin(clamp(relY / Math.max(0.05, p.clone().sub(C).length()), -1, 1));
        let minR = 0;
        if (relY > -0.13) minR = sampleR(G, th, Math.max(P_MIN, ph)) + 0.006;
        const br = bodyR(y, th) + (look.outfit.top === 'l' || look.outfit.top === 'j' ? 0.03 : 0.018);
        const hp = new THREE.Vector2(p.x - 0, p.z - hb.z);
        const ang = Math.atan2(hp.x, hp.y);
        let rad = hp.length();
        const need = Math.max(br, minR > 0 ? minR * Math.cos(ph) : 0);
        if (rad < need) rad = need;
        p.x = Math.sin(ang) * rad;
        p.z = hb.z + Math.cos(ang) * rad;
        // wet clumps: strands stick together (lateral wobble)
        if (wet > 0.3) p.addScaledVector(new THREE.Vector3(Math.cos(th), 0, -Math.sin(th)), Math.sin(ci * 1.7 + f * 3) * 0.004 * f);
        prev = p.clone();
        // weights: Head near the top, then the chain by height below the head
        const below = clamp((start.y - y) / Math.max(0.05, start.y - (C.y + endY)), 0, 1);
        const side = a < 115 ? (th > 0 ? 'L' : 'R') : 'back';
        const ch = chains[side];
        const w = [];
        const s = below * ch.length; // 0..len
        const i0 = Math.min(ch.length - 1, Math.floor(s)), fr = s - Math.floor(s);
        if (below < 0.12) w.push([iHead, 1 - below / 0.12], [ch[0], below / 0.12]);
        else if (i0 + 1 < ch.length) w.push([ch[i0], 1 - fr], [ch[i0 + 1], fr]);
        else w.push([ch[ch.length - 1], 1]);
        col.push(addV(p, ci / Math.max(1, order.length - 1), 0.64 + f * 0.36, w));
      }
      cgrid.push(col);
    }
    for (let ci = 0; ci < cgrid.length - 1; ci++) {
      // skip the seam between the last left and first right column if they are not adjacent (front gap)
      const ja = order[ci], jb = order[ci + 1];
      if (Math.abs(cols[ja] - cols[jb]) > (2 * Math.PI) / J * 1.5 && !(cols[ja] > 3 && cols[jb] < -3)) continue;
      for (let k = 0; k < KC; k++) curtainTris.push([cgrid[ci][k], cgrid[ci][k + 1], cgrid[ci + 1][k]], [cgrid[ci + 1][k], cgrid[ci][k + 1], cgrid[ci + 1][k + 1]]);
    }
    // close the seam at the back (θ = ±π share the same column position)
  }
  // ---- bun / ponytail
  if (st.extra === 'bun') {
    const th = Math.PI, ph = 0.42;
    const c0 = pt(th, ph, 0.0);
    const n = new THREE.Vector3().copy(dirOf(th, ph, _d));
    const center = c0.clone().addScaledVector(n, 0.032);
    const s = new THREE.SphereGeometry(0.042, 14, 10);
    s.scale(1.1, 0.85, 0.9);
    const p = s.attributes.position, uv = s.attributes.uv;
    const base = verts.length;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      const tw = noise.noise3D(v.x * 40, v.y * 40, v.z * 40) * 0.003;
      v.multiplyScalar(1 + tw / 0.04).add(center);
      addV(v, uv.getX(i), 0.64 + uv.getY(i) * 0.3, [[iHead, 1]]);
    }
    const ix = s.index.array;
    for (let i = 0; i < ix.length; i += 3) tris.push([base + ix[i], base + ix[i + 1], base + ix[i + 2]]);
    s.dispose();
  }
  if (st.extra === 'ponytail') {
    const th = Math.PI, ph = 0.2;
    const root = pt(th, ph, 0.004);
    const ch = ['hair_1', 'hair_2', 'hair_3'].map((n) => t.index[n]);
    const RS = 8, LS = 9, len = 0.3;
    const base = verts.length;
    for (let l = 0; l <= LS; l++) {
      const f = l / LS;
      const c = root.clone().add(new THREE.Vector3(0, -len * f * 0.95, -0.02 - 0.03 * Math.sin(f * 1.5)));
      const rad = 0.017 * (1 - f * 0.6) * (l === 0 ? 1.2 : 1);
      const s = f * ch.length * 0.999;
      const i0 = Math.floor(s), fr = s - i0;
      const w = f < 0.1 ? [[iHead, 1 - f / 0.1], [ch[0], f / 0.1]] : i0 + 1 < ch.length ? [[ch[i0], 1 - fr], [ch[i0 + 1], fr]] : [[ch[ch.length - 1], 1]];
      for (let rr = 0; rr <= RS; rr++) {
        const a = (rr / RS) * Math.PI * 2;
        addV(c.clone().add(new THREE.Vector3(Math.cos(a) * rad, 0, Math.sin(a) * rad * 0.8)), rr / RS, 0.64 + f * 0.36, w);
      }
    }
    for (let l = 0; l < LS; l++) for (let rr = 0; rr < RS; rr++) {
      const a0 = base + l * (RS + 1) + rr, a1 = a0 + 1, b0 = a0 + RS + 1, b1 = b0 + 1;
      tris.push([a0, a1, b0], [b0, a1, b1]);
    }
  }
  return toGeometry(verts, tris, curtainTris, C);
}

/** body radius (m, from the spine axis) at model height y in azimuth θ (ray cast, cached per template) */
function bodyRadiusFn(t) {
  if (t._bodyR) return t._bodyR;
  const g = t.geos.body_hi;
  const pos = g.attributes.position, idx = g.index.array;
  const hb = t.Gp[t.index.Head];
  const buckets = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(pos, idx[i]); b.fromBufferAttribute(pos, idx[i + 1]); c.fromBufferAttribute(pos, idx[i + 2]);
    if (Math.max(Math.abs(a.x), Math.abs(b.x), Math.abs(c.x)) > 0.32) continue; // no arms
    const y0 = Math.floor(Math.min(a.y, b.y, c.y) / 0.02), y1 = Math.floor(Math.max(a.y, b.y, c.y) / 0.02);
    for (let y = y0; y <= y1; y++) { if (!buckets.has(y)) buckets.set(y, []); buckets.get(y).push(a.clone(), b.clone(), c.clone()); }
  }
  const ray = new THREE.Ray(), hit = new THREE.Vector3();
  const memo = new Map();
  t._bodyR = (y, th) => {
    const key = Math.round(y * 200) + ':' + Math.round(th * 20);
    if (memo.has(key)) return memo.get(key);
    const list = buckets.get(Math.floor(y / 0.02)) || [];
    ray.origin.set(0, y, hb.z - 0.02);
    ray.direction.set(Math.sin(th), 0, Math.cos(th));
    let best = 0;
    for (let k = 0; k < list.length; k += 3) if (ray.intersectTriangle(list[k], list[k + 1], list[k + 2], false, hit)) best = Math.max(best, hit.distanceTo(ray.origin));
    memo.set(key, best);
    return best;
  };
  return t._bodyR;
}

function toGeometry(verts, tris, curtainTris, C) {
  const n = verts.length;
  // curtain is double-sided: duplicate its vertices for the inner side
  const usedInCurtain = new Set();
  for (const tr of curtainTris) for (const i of tr) usedInCurtain.add(i);
  const dup = new Map();
  let m = n;
  for (const i of usedInCurtain) dup.set(i, m++);
  const P = new Float32Array(m * 3), U = new Float32Array(m * 2), SI = new Uint16Array(m * 4), SW = new Float32Array(m * 4), A = new Float32Array(m), F = new Float32Array(m);
  const put = (dst, v) => {
    P[dst * 3] = v.p.x; P[dst * 3 + 1] = v.p.y; P[dst * 3 + 2] = v.p.z;
    const [u, vv] = ruv(R.hair, v.u, v.v);
    U[dst * 2] = u; U[dst * 2 + 1] = vv;
    v.w.slice(0, 4).forEach(([b, w], k) => { SI[dst * 4 + k] = b; SW[dst * 4 + k] = w; });
    A[dst] = 2;
  };
  verts.forEach((v, i) => put(i, v));
  for (const [i, d] of dup) put(d, verts[i]);
  const I = [];
  // outward winding check against the head centre
  const fix = (tr) => {
    const [a, b, c] = tr.map((i) => verts[i].p);
    const nrm = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const mid = a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(C);
    mid.y *= 0.3;
    return nrm.dot(mid) < 0 ? [tr[0], tr[2], tr[1]] : tr;
  };
  for (const tr of tris) I.push(...fix(tr));
  for (const tr of curtainTris) {
    const f = fix(tr);
    I.push(...f);
    I.push(dup.get(f[0]), dup.get(f[2]), dup.get(f[1]));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  geo.setAttribute('afat', new THREE.BufferAttribute(F, 1));
  geo.setAttribute('apart', new THREE.BufferAttribute(A, 1));
  geo.setIndex(I);
  geo.computeVertexNormals(); // the duplicated inner curtain side gets inward normals from its reversed winding
  return geo;
}
