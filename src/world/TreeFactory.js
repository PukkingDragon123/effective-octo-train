// Procedural Thai jungle vegetation. Each species builds a seeded SKELETON (branch tubes +
// leaf placements), then meshes it at several detail levels so LODs keep the same shape.
// Geometry per variant & LOD: { bark, leaves, stem? } BufferGeometries with position /
// normal / uv / color. Leaf cards use the world foliage atlas (foliageAtlas.js) and get
// crown-bent normals (soft volumetric shading); trunks get bark UVs (metres) + AO tint.
import * as THREE from 'three';
import { makeRng } from '../core/math.js';
import { SLOT, slotRect } from './foliageAtlas.js';

const TAU = Math.PI * 2;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// ----------------------------------------------------------------------------------
// Geometry builder
// ----------------------------------------------------------------------------------
export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }
  get count() {
    return this.pos.length / 3;
  }
  v(x, y, z, nx, ny, nz, u, vv, r, g, b) {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, vv);
    this.col.push(r, g, b);
    return this.pos.length / 3 - 1;
  }
  t(a, b, c) {
    this.idx.push(a, b, c);
  }
  build() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * Tube along pts [{x,y,z,r}] with parallel-transport frames.
 * o: { radial, uMeters=1.1 (bark tile width), vMeters=1.6, color(i, t, y) -> [r,g,b], rFn(i, ang, r) -> r, cap }
 */
export function addTube(B, pts, o = {}) {
  const n = pts.length;
  if (n < 2) return;
  const radial = Math.max(3, o.radial || 6);
  const r0 = pts[0].r;
  const uRep = Math.max(1, Math.round((TAU * r0) / (o.uMeters ?? 1.1)));
  const vM = o.vMeters ?? 1.6;
  const T = new THREE.Vector3(), N = new THREE.Vector3(), Bn = new THREE.Vector3();
  _a.set(pts[1].x - pts[0].x, pts[1].y - pts[0].y, pts[1].z - pts[0].z).normalize();
  N.set(0, 1, 0);
  if (Math.abs(_a.dot(N)) > 0.9) N.set(1, 0, 0);
  N.sub(_b.copy(_a).multiplyScalar(N.dot(_a))).normalize();
  let vAcc = o.v0 ?? 0;
  const base = B.count;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const pn = pts[Math.min(n - 1, i + 1)], pp = pts[Math.max(0, i - 1)];
    T.set(pn.x - pp.x, pn.y - pp.y, pn.z - pp.z).normalize();
    N.sub(_b.copy(T).multiplyScalar(N.dot(T))).normalize();
    Bn.crossVectors(T, N).normalize();
    if (i > 0) vAcc += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z) / vM;
    const t = i / (n - 1);
    const col = o.color ? o.color(i, t, p.y) : [1, 1, 1];
    for (let j = 0; j <= radial; j++) {
      const ang = (j / radial) * TAU;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const dx = N.x * ca + Bn.x * sa, dy = N.y * ca + Bn.y * sa, dz = N.z * ca + Bn.z * sa;
      const r = o.rFn ? o.rFn(i, ang, p.r, p) : p.r;
      B.v(p.x + dx * r, p.y + dy * r, p.z + dz * r, dx, dy, dz, (j / radial) * uRep, vAcc, col[0], col[1], col[2]);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = base + i * row + j, b = a + 1, c = a + row, d = c + 1;
      B.t(a, b, c);
      B.t(b, d, c);
    }
  }
  if (o.cap) {
    const p = pts[n - 1];
    const ci = B.v(p.x + T.x * p.r * 0.3, p.y + T.y * p.r * 0.3, p.z + T.z * p.r * 0.3, T.x, T.y, T.z, 0.5, vAcc, 0.6, 0.55, 0.5);
    const last = base + (n - 1) * row;
    for (let j = 0; j < radial; j++) B.t(last + j, last + j + 1, ci);
  }
}

/** Card quad(s) for a leaf cluster: crossed quads around axis dir at p. */
function addCluster(B, p, dir, size, slot, tint, crownC, o = {}) {
  const R = slotRect(slot);
  const quads = o.quads ?? 2;
  const bend = o.bend ?? 0.72;
  // a perpendicular to dir
  _a.copy(dir).normalize();
  _b.set(0, 1, 0);
  if (Math.abs(_a.y) > 0.9) _b.set(1, 0, 0);
  _c.crossVectors(_a, _b).normalize();
  const rot = o.rot ?? 0;
  for (let q = 0; q < quads; q++) {
    const ang = rot + (q / quads) * Math.PI;
    // side vector rotated around dir
    _d.copy(_c).applyAxisAngle(_a, ang);
    const nx = _a.y * _d.z - _a.z * _d.y, ny = _a.z * _d.x - _a.x * _d.z, nz = _a.x * _d.y - _a.y * _d.x; // card normal
    const back = o.back ?? 0.2;
    const corners = [
      [-0.5, -back, R.u0, R.v0], [0.5, -back, R.u1, R.v0],
      [-0.5, 1 - back, R.u0, R.v1], [0.5, 1 - back, R.u1, R.v1],
    ];
    const ids = [];
    for (const [sx, sy, u, v] of corners) {
      const x = p.x + _d.x * sx * size + _a.x * sy * size;
      const y = p.y + _d.y * sx * size + _a.y * sy * size;
      const z = p.z + _d.z * sx * size + _a.z * sy * size;
      // bent normal: mostly radial from the crown centre
      let rx = x - crownC.x, ry = (y - crownC.y) * 1.3, rz = z - crownC.z;
      const rl = Math.hypot(rx, ry, rz) || 1;
      rx /= rl;
      ry /= rl;
      rz /= rl;
      let fx = nx * (1 - bend) + rx * bend, fy = ny * (1 - bend) + ry * bend + 0.15, fz = nz * (1 - bend) + rz * bend;
      const fl = Math.hypot(fx, fy, fz) || 1;
      const shade = o.shadeFn ? o.shadeFn(y, rl) : 1;
      ids.push(B.v(x, y, z, fx / fl, fy / fl, fz / fl, u, v, tint[0] * shade, tint[1] * shade, tint[2] * shade));
    }
    B.t(ids[0], ids[1], ids[2]);
    B.t(ids[1], ids[3], ids[2]);
  }
}

/**
 * Curved strip (banana blade, palm/fern frond, grass blade): spine pts [{x,y,z}], width profile w(t),
 * side vector per point (across the blade), optional V-fold. UV across = slot u, along = slot v.
 */
function addStrip(B, spine, sideVecs, widthFn, slot, tint, o = {}) {
  const R = slotRect(slot);
  const n = spine.length;
  const fold = o.fold ?? 0;
  const base = B.count;
  const cols = 3;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const p = spine[i], s = sideVecs[i];
    const w = widthFn(t);
    // local normal: cross(side, tangent)
    const pn = spine[Math.min(n - 1, i + 1)], pp = spine[Math.max(0, i - 1)];
    _a.set(pn.x - pp.x, pn.y - pp.y, pn.z - pp.z).normalize();
    _b.copy(s).normalize();
    _c.crossVectors(_b, _a).normalize();
    if (_c.y < 0 && !o.keepNormal) _c.multiplyScalar(-1);
    const shade = (o.shadeFn ? o.shadeFn(t) : 1);
    for (let k = 0; k < cols; k++) {
      const f = k / (cols - 1) - 0.5; // -0.5..0.5
      const lift = fold * Math.abs(f) * 2 * w;
      const x = p.x + _b.x * f * w * 2 + _c.x * lift;
      const y = p.y + _b.y * f * w * 2 + _c.y * lift;
      const z = p.z + _b.z * f * w * 2 + _c.z * lift;
      // normals tilt outward across the fold and up a bit
      const nx = _c.x + _b.x * f * 0.6, ny = _c.y + 0.25, nz = _c.z + _b.z * f * 0.6;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const u = R.u0 + (R.u1 - R.u0) * (0.5 + f * (o.uSpan ?? 1));
      const v = R.v0 + (R.v1 - R.v0) * (o.v0 ?? 0) + (R.v1 - R.v0) * t * ((o.v1 ?? 1) - (o.v0 ?? 0));
      B.v(x, y, z, nx / nl, ny / nl, nz / nl, u, v, tint[0] * shade, tint[1] * shade, tint[2] * shade);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < cols - 1; k++) {
      const a = base + i * cols + k, b = a + 1, c = a + cols, d = c + 1;
      B.t(a, c, b);
      B.t(b, c, d);
    }
  }
}

// ----------------------------------------------------------------------------------
// Skeleton helpers
// ----------------------------------------------------------------------------------
/** Grow a branch path: start {x,y,z}, dir Vector3, length, r0 -> r1, segments, tropism (up +), gravity sag, wobble. */
function growPath(rng, start, dir, len, r0, r1, segs, o = {}) {
  const pts = [{ x: start.x, y: start.y, z: start.z, r: r0 }];
  const d = dir.clone().normalize();
  let x = start.x, y = start.y, z = start.z;
  const step = len / segs;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    d.y += (o.tropism ?? 0) * step * 0.1 - (o.gravity ?? 0) * step * 0.1 * t;
    if (o.outward) {
      // pull toward horizontal outward direction
      d.x += o.outward.x * step * 0.08;
      d.z += o.outward.z * step * 0.08;
    }
    const wob = o.wobble ?? 0.15;
    d.x += (rng() - 0.5) * wob;
    d.y += (rng() - 0.5) * wob * 0.6;
    d.z += (rng() - 0.5) * wob;
    d.normalize();
    x += d.x * step;
    y += d.y * step;
    z += d.z * step;
    const r = r0 + (r1 - r0) * Math.pow(t, o.taperPow ?? 1);
    pts.push({ x, y, z, r });
  }
  return pts;
}

function pointOn(pts, t) {
  const f = t * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  const k = f - i;
  const a = pts[i], b = pts[i + 1];
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, r: a.r + (b.r - a.r) * k, dir: new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize() };
}

function randPerp(rng, dir) {
  const v = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5);
  v.sub(dir.clone().multiplyScalar(v.dot(dir))).normalize();
  return v;
}

const hsv = (h, s, v) => {
  const c = new THREE.Color().setHSL(h, s, v);
  return [c.r, c.g, c.b];
};
function jitterTint(rng, base, hj = 0.03, lj = 0.18) {
  const c = new THREE.Color(base[0], base[1], base[2]);
  const hslv = {};
  c.getHSL(hslv);
  c.setHSL((hslv.h + (rng() - 0.5) * hj + 1) % 1, Math.min(1, hslv.s * (0.85 + rng() * 0.3)), Math.min(1, hslv.l * (1 - lj / 2 + rng() * lj)));
  return [c.r, c.g, c.b];
}

// ----------------------------------------------------------------------------------
// Skeleton -> mesh
// ----------------------------------------------------------------------------------
/**
 * skel: { branches: [{pts, level, mat?:'bark'|'stem'|'bamboo', rFn?, color?}], leaves: [{type:'cluster'|'strip'|'quad', ...}], crownC }
 * lod 0 = full, 1 = reduced. Returns { bark, leaves, stem, bamboo } geometries (null when empty).
 */
export function meshSkeleton(skel, lod = 0) {
  const builders = { bark: new GeoBuilder(), banyanBark: new GeoBuilder(), leaves: new GeoBuilder(), stem: new GeoBuilder(), bamboo: new GeoBuilder() };
  for (const br of skel.branches) {
    if (lod >= 1 && br.level >= (skel.lod1MaxLevel ?? 3) && br.pts[0].r < (skel.lod1MinR ?? 0.06)) continue;
    const r0 = br.pts[0].r;
    let radial = r0 > 0.6 ? 14 : r0 > 0.3 ? 10 : r0 > 0.12 ? 7 : r0 > 0.05 ? 5 : 4;
    if (br.radial) radial = br.radial;
    if (lod >= 1) radial = Math.max(3, Math.round(radial * 0.5));
    let pts = br.pts;
    if (lod >= 1 && pts.length > 4) pts = pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1);
    addTube(builders[br.mat || 'bark'], pts, { radial, color: br.color, rFn: br.rFn, uMeters: br.uMeters, vMeters: br.vMeters, cap: br.cap });
  }
  const crownC = skel.crownC || new THREE.Vector3(0, 5, 0);
  let k = 0;
  for (const lf of skel.leaves) {
    k++;
    const target = lf.mat ? builders[lf.mat] : builders.leaves;
    if (lf.type === 'cluster') {
      if (lod >= 1 && lf.lod1 !== 'keep' && k % 2 === 0) continue;
      const size = lod >= 1 && lf.lod1 !== 'keep' ? lf.size * 1.38 : lf.size;
      addCluster(target, lf.p, lf.dir, size, lf.slot, lf.tint, lf.crownC || crownC, { quads: lod >= 1 ? Math.min(2, lf.quads ?? 2) : lf.quads ?? 2, rot: lf.rot, bend: lf.bend, back: lf.back, shadeFn: skel.shadeFn });
    } else if (lf.type === 'strip') {
      let spine = lf.spine, sides = lf.sides;
      if (lod >= 1 && spine.length > 4) {
        const keep = spine.map((_, i) => i % 2 === 0 || i === spine.length - 1);
        spine = spine.filter((_, i) => keep[i]);
        sides = sides.filter((_, i) => keep[i]);
      }
      addStrip(target, spine, sides, lf.widthFn, lf.slot, lf.tint, { fold: lf.fold, shadeFn: lf.shadeFn, uSpan: lf.uSpan, keepNormal: lf.keepNormal });
    }
  }
  return {
    bark: builders.bark.build(),
    banyanBark: builders.banyanBark.build(),
    leaves: builders.leaves.build(),
    stem: builders.stem.build(),
    bamboo: builders.bamboo.build(),
  };
}

// ----------------------------------------------------------------------------------
// Species
// ----------------------------------------------------------------------------------
const BARK_TINT = (rng, base = [0.62, 0.56, 0.5]) => {
  const k = 0.85 + rng() * 0.3;
  return [base[0] * k, base[1] * k, base[2] * k];
};
const aoColor = (tint, groundDark = 0.45, h0 = 0, h1 = 3) => (i, t, y) => {
  const f = Math.min(1, Math.max(0, (y - h0) / (h1 - h0)));
  const m = groundDark + (1 - groundDark) * f;
  return [tint[0] * m, tint[1] * m, tint[2] * m];
};

/** Leaves at a branch tip & along its outer part. */
function leafSpray(rng, skel, pts, slot, size, count, tintBase, o = {}) {
  for (let i = 0; i < count; i++) {
    const t = o.t0 != null ? o.t0 + (1 - o.t0) * (count === 1 ? 1 : i / (count - 1)) : 1;
    const q = pointOn(pts, Math.min(1, t));
    const dir = q.dir.clone();
    dir.y += o.up ?? 0.35;
    dir.add(randPerp(rng, q.dir).multiplyScalar(o.spread ?? 0.6)).normalize();
    skel.leaves.push({
      type: 'cluster', p: { x: q.x, y: q.y, z: q.z }, dir, size: size * (0.8 + rng() * 0.4), slot, tint: jitterTint(rng, tintBase, 0.04, 0.3), rot: rng() * Math.PI, quads: o.quads,
    });
  }
}

/** Giant rain tree (Samanea saman): short massive trunk, huge spreading limbs, umbrella crown. */
function rainTree(rng, opts) {
  const skel = { branches: [], leaves: [], lod1MaxLevel: 3, lod1MinR: 0.07 };
  const sc = opts.scale ?? 1;
  const H0 = (3.2 + rng() * 2) * sc, R0 = (0.62 + rng() * 0.3) * sc;
  const lean = new THREE.Vector3((rng() - 0.5) * 0.25, 1, (rng() - 0.5) * 0.25).normalize();
  const trunk = growPath(rng, { x: 0, y: -0.4, z: 0 }, lean, H0 + 0.4, R0 * 1.05, R0 * 0.82, 6, { wobble: 0.06 });
  const tint = BARK_TINT(rng, [0.72, 0.66, 0.6]);
  skel.branches.push({
    pts: trunk, level: 0, color: aoColor(tint, 0.5, 0, 2.5),
    rFn: (i, ang, r, p) => r * (1 + Math.max(0, 0.9 - p.y) * 0.35 * (1 + 0.6 * Math.pow(Math.max(0, Math.cos(ang * 3 + 1)), 6))),
  });
  const top = trunk[trunk.length - 1];
  const nL = 4 + Math.floor(rng() * 3);
  const crownR = (12 + rng() * 4) * sc;
  for (let l = 0; l < nL; l++) {
    const az = (l / nL) * TAU + rng() * 0.6;
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const elev = 0.45 + rng() * 0.45;
    const d = out.clone().multiplyScalar(Math.cos(elev)).add(new THREE.Vector3(0, Math.sin(elev), 0)).normalize();
    const y0 = H0 * (0.72 + rng() * 0.25);
    const len = crownR * (0.75 + rng() * 0.35);
    const limb = growPath(rng, { x: top.x * (y0 / H0), y: y0, z: top.z * (y0 / H0) }, d, len, R0 * (0.5 + rng() * 0.12), 0.1 * sc, 9, { tropism: -0.05, gravity: 0.35, outward: out, wobble: 0.12, taperPow: 0.8 });
    skel.branches.push({ pts: limb, level: 1, color: aoColor(tint, 0.75, 0, 8) });
    // sub branches
    const nb = 4 + Math.floor(rng() * 3);
    for (let b = 0; b < nb; b++) {
      const t = 0.3 + (b / nb) * 0.68 + rng() * 0.05;
      const q = pointOn(limb, t);
      const bd = q.dir.clone().add(randPerp(rng, q.dir).multiplyScalar(0.9)).add(new THREE.Vector3(0, 0.55, 0)).normalize();
      const bl = (4 + rng() * 3.5) * sc * (1.15 - t * 0.4);
      const br = growPath(rng, q, bd, bl, Math.min(q.r * 0.7, 0.24 * sc), 0.035, 6, { tropism: 0.2, gravity: 0.25, wobble: 0.2 });
      skel.branches.push({ pts: br, level: 2, color: aoColor(tint, 0.85, 0, 8) });
      const nt = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < nt; k++) {
        const q2 = pointOn(br, 0.45 + rng() * 0.5);
        const td = q2.dir.clone().add(randPerp(rng, q2.dir).multiplyScalar(1.1)).add(new THREE.Vector3(0, 0.5, 0)).normalize();
        const tw = growPath(rng, q2, td, (1.6 + rng() * 1.8) * sc, 0.035, 0.012, 3, { tropism: 0.3, wobble: 0.3 });
        skel.branches.push({ pts: tw, level: 3, color: aoColor(tint, 0.9, 0, 8) });
        leafSpray(rng, skel, tw, SLOT.rain, 3.0 * sc, 2, [0.42, 0.5, 0.26], { t0: 0.5, up: 0.8, spread: 0.7 });
      }
      leafSpray(rng, skel, br, SLOT.rain, 3.2 * sc, 2, [0.4, 0.48, 0.25], { t0: 0.7, up: 0.9 });
    }
    // epiphytes on the upper side of the limb
    for (let e = 0; e < 2 + Math.floor(rng() * 3); e++) {
      const q = pointOn(limb, 0.15 + rng() * 0.45);
      skel.leaves.push({ type: 'cluster', p: { x: q.x, y: q.y + q.r * 0.8, z: q.z }, dir: new THREE.Vector3(0, 1, 0), size: 1.3 + rng() * 0.7, slot: SLOT.epiphyte, tint: jitterTint(rng, [0.5, 0.6, 0.32]), rot: rng() * 3, back: 0.05, bend: 0.4, lod1: 'keep' });
    }
    // hanging vines
    for (let e = 0; e < 1 + Math.floor(rng() * 3); e++) {
      const q = pointOn(limb, 0.4 + rng() * 0.55);
      const len = 3 + rng() * 4;
      skel.leaves.push({ type: 'cluster', p: { x: q.x, y: q.y - len * 0.95, z: q.z }, dir: new THREE.Vector3(0, 1, 0), size: len, slot: SLOT.vines, tint: jitterTint(rng, [0.55, 0.6, 0.4]), rot: rng() * 3, back: 0, bend: 0.3, quads: 2 });
    }
  }
  skel.crownC = new THREE.Vector3(0, H0 + crownR * 0.25, 0);
  skel.shadeFn = (y) => 0.55 + 0.45 * Math.min(1, Math.max(0, (y - H0) / (crownR * 0.5)));
  return { skel, height: H0 + crownR * 0.6, radius: crownR, crownY: H0 + crownR * 0.35, trunkR: R0 * 1.4, kind: 'big' };
}

/** Tall dipterocarp (ยางนา) with buttress roots and a high cauliflower crown. */
function dipterocarp(rng, opts) {
  const skel = { branches: [], leaves: [], lod1MaxLevel: 2, lod1MinR: 0.08 };
  const sc = opts.scale ?? 1;
  const H = (22 + rng() * 10) * sc, R0 = (0.42 + rng() * 0.25) * sc;
  const trunk = growPath(rng, { x: 0, y: -0.5, z: 0 }, new THREE.Vector3((rng() - 0.5) * 0.08, 1, (rng() - 0.5) * 0.08), H, R0, R0 * 0.45, 14, { wobble: 0.04, taperPow: 0.8 });
  const fins = [];
  const nf = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < nf; i++) fins.push({ a: (i / nf) * TAU + rng() * 0.8, s: 1.6 + rng() * 1.6 });
  const tint = BARK_TINT(rng, [0.85, 0.82, 0.75]);
  skel.branches.push({
    pts: trunk, level: 0, radial: 16, color: aoColor(tint, 0.42, 0, 4),
    rFn: (i, ang, r, p) => {
      const hy = Math.max(0, p.y);
      let f = 0;
      for (const fn of fins) {
        let da = Math.abs(((ang - fn.a + Math.PI) % TAU + TAU) % TAU - Math.PI);
        f += fn.s * Math.pow(Math.max(0, Math.cos(da)), 14) * Math.exp(-hy / 1.5);
      }
      return r * (1 + f + Math.exp(-hy / 0.8) * 0.25);
    },
  });
  // crown
  const nB = 6 + Math.floor(rng() * 4);
  const crownW = (6.5 + rng() * 2.5) * sc;
  for (let b = 0; b < nB; b++) {
    const t = 0.66 + (b / nB) * 0.3;
    const q = pointOn(trunk, t);
    const az = rng() * TAU;
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const d = out.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.75 + rng() * 0.4, 0)).normalize();
    const br = growPath(rng, q, d, crownW * (0.7 + rng() * 0.45), q.r * 0.45, 0.05, 6, { tropism: 0.1, gravity: 0.25, outward: out, wobble: 0.15 });
    skel.branches.push({ pts: br, level: 1, color: aoColor(tint, 0.9, 0, 10) });
    for (let s = 0; s < 3; s++) {
      const q2 = pointOn(br, 0.4 + s * 0.2 + rng() * 0.1);
      const sd = q2.dir.clone().add(randPerp(rng, q2.dir)).add(new THREE.Vector3(0, 0.5, 0)).normalize();
      const sb = growPath(rng, q2, sd, (2.2 + rng() * 2.2) * sc, 0.06, 0.015, 3, { tropism: 0.2, wobble: 0.25 });
      skel.branches.push({ pts: sb, level: 2, color: aoColor(tint, 0.9, 0, 10) });
      leafSpray(rng, skel, sb, rng() < 0.5 ? SLOT.broadA : SLOT.fig, 2.7 * sc, 2, [0.36, 0.46, 0.22], { t0: 0.5, up: 0.7 });
    }
    leafSpray(rng, skel, br, SLOT.broadA, 3.0 * sc, 2, [0.34, 0.44, 0.21], { t0: 0.75, up: 0.8 });
  }
  // climbers spiralling up the trunk
  if (rng() < 0.7) {
    const turns = 1.5 + rng() * 2;
    const h1 = H * (0.25 + rng() * 0.35);
    const n = Math.round(h1 / 0.7);
    const a0 = rng() * TAU;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const y = 0.4 + t * h1;
      const q = pointOn(trunk, Math.min(1, (y + 0.5) / H));
      const ang = a0 + t * turns * TAU;
      const rr = q.r * (1 + Math.exp(-y / 1.5) * 1.2) + 0.08;
      const p = { x: q.x + Math.cos(ang) * rr, y, z: q.z + Math.sin(ang) * rr };
      const dir = new THREE.Vector3(Math.cos(ang), 0.6, Math.sin(ang)).normalize();
      skel.leaves.push({ type: 'cluster', p, dir, size: 0.9 + rng() * 0.5, slot: SLOT.shrub, tint: jitterTint(rng, [0.38, 0.5, 0.24]), rot: rng() * 3, back: 0.4, bend: 0.5, quads: 1, crownC: new THREE.Vector3(q.x, y, q.z) });
    }
  }
  skel.crownC = new THREE.Vector3(0, H * 0.86, 0);
  skel.shadeFn = (y) => 0.6 + 0.4 * Math.min(1, Math.max(0, (y - H * 0.7) / (H * 0.3)));
  return { skel, height: H + crownW * 0.4, radius: crownW, crownY: H * 0.85, trunkR: R0 * 1.3, kind: 'big' };
}

/** Banyan / strangler fig: braided multiple trunks, horizontal limbs, aerial root curtains. */
function banyan(rng, opts) {
  const skel = { branches: [], leaves: [], lod1MaxLevel: 2, lod1MinR: 0.05 };
  const sc = opts.scale ?? 1;
  const Ht = (5 + rng() * 2.5) * sc;
  const tint = BARK_TINT(rng, [0.8, 0.78, 0.72]);
  const nT = 6 + Math.floor(rng() * 4);
  const twist = (rng() - 0.5) * 1.6;
  for (let i = 0; i < nT; i++) {
    const a0 = (i / nT) * TAU + rng() * 0.5;
    const rad = (0.35 + rng() * 0.9) * sc;
    const pts = [];
    const segs = 9;
    const r = (0.14 + rng() * 0.28) * sc;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const a = a0 + twist * t;
      const rr = rad * (1 - t * 0.75);
      pts.push({ x: Math.cos(a) * rr, y: -0.4 + t * (Ht + 0.6), z: Math.sin(a) * rr, r: r * (1 - t * 0.25) * (1 + (k === 0 ? 0.6 : 0)) });
    }
    skel.branches.push({ pts, level: 0, mat: 'banyanBark', color: aoColor(tint, 0.5, 0, 3) });
  }
  const crownR = (9 + rng() * 3) * sc;
  const nL = 5 + Math.floor(rng() * 3);
  for (let l = 0; l < nL; l++) {
    const az = (l / nL) * TAU + rng() * 0.5;
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const d = out.clone().add(new THREE.Vector3(0, 0.35 + rng() * 0.4, 0)).normalize();
    const limb = growPath(rng, { x: 0, y: Ht * (0.85 + rng() * 0.2), z: 0 }, d, crownR * (0.8 + rng() * 0.3), 0.36 * sc, 0.08, 8, { gravity: 0.2, tropism: 0.06, outward: out, wobble: 0.14 });
    skel.branches.push({ pts: limb, level: 1, mat: 'banyanBark', color: aoColor(tint, 0.8, 0, 8) });
    for (let b = 0; b < 4; b++) {
      const q = pointOn(limb, 0.35 + b * 0.18 + rng() * 0.08);
      const bd = q.dir.clone().add(randPerp(rng, q.dir).multiplyScalar(0.8)).add(new THREE.Vector3(0, 0.6, 0)).normalize();
      const br = growPath(rng, q, bd, (3 + rng() * 3) * sc, 0.12 * sc, 0.03, 5, { tropism: 0.2, wobble: 0.2 });
      skel.branches.push({ pts: br, level: 2, mat: 'banyanBark', color: aoColor(tint, 0.85, 0, 8) });
      leafSpray(rng, skel, br, SLOT.fig, 2.6 * sc, 3, [0.3, 0.42, 0.2], { t0: 0.35, up: 0.6 });
    }
    leafSpray(rng, skel, limb, SLOT.fig, 2.8 * sc, 2, [0.28, 0.4, 0.19], { t0: 0.8, up: 0.6 });
    // aerial roots: thin straight tubes to the ground, some thick pillar roots
    const nr = 2 + Math.floor(rng() * 4);
    for (let r = 0; r < nr; r++) {
      const q = pointOn(limb, 0.25 + rng() * 0.7);
      const thick = rng() < 0.25;
      const rr = thick ? (0.07 + rng() * 0.08) * sc : (0.015 + rng() * 0.025);
      const bottom = thick ? -0.3 : q.y * (rng() < 0.5 ? 0.02 : 0.2 + rng() * 0.5);
      const pts = [];
      const segs = 6;
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        pts.push({ x: q.x + (rng() - 0.5) * 0.15, y: q.y + (bottom - q.y) * t, z: q.z + (rng() - 0.5) * 0.15, r: rr * (1 + t * (thick ? 0.6 : 0)) });
      }
      skel.branches.push({ pts, level: thick ? 1 : 3, mat: 'banyanBark', radial: thick ? 6 : 3, color: aoColor(tint, 0.8, 0, 3) });
      if (!thick) {
        // root curtain card
        const len = (q.y - Math.max(0.5, bottom)) * (0.6 + rng() * 0.4);
        skel.leaves.push({ type: 'cluster', p: { x: q.x, y: q.y - len, z: q.z }, dir: new THREE.Vector3(0, 1, 0), size: len, slot: SLOT.vines, tint: jitterTint(rng, [0.62, 0.6, 0.48]), rot: rng() * 3, back: 0, bend: 0.25, quads: 2 });
      }
    }
  }
  skel.crownC = new THREE.Vector3(0, Ht + crownR * 0.35, 0);
  skel.shadeFn = (y) => 0.5 + 0.5 * Math.min(1, Math.max(0, (y - Ht) / (crownR * 0.6)));
  return { skel, height: Ht + crownR * 0.75, radius: crownR, crownY: Ht + crownR * 0.4, trunkR: 1.4 * sc, kind: 'big' };
}

/** Understory / mid-size trees (several looks). */
function understory(rng, opts) {
  const skel = { branches: [], leaves: [], lod1MaxLevel: 2, lod1MinR: 0.03 };
  const look = opts.look ?? Math.floor(rng() * 3);
  const sc = opts.scale ?? 1;
  const H = (look === 1 ? 3.5 + rng() * 2.5 : 6 + rng() * 5) * sc;
  const R0 = (0.08 + rng() * 0.08) * sc * (look === 2 ? 1.4 : 1);
  const lean = new THREE.Vector3((rng() - 0.5) * (look === 2 ? 0.8 : 0.3), 1, (rng() - 0.5) * (look === 2 ? 0.8 : 0.3)).normalize();
  const trunk = growPath(rng, { x: 0, y: -0.2, z: 0 }, lean, H, R0, R0 * 0.35, 8, { wobble: 0.12, tropism: 0.05 });
  const tint = BARK_TINT(rng, look === 0 ? [0.78, 0.75, 0.68] : [0.66, 0.6, 0.52]);
  skel.branches.push({ pts: trunk, level: 0, color: aoColor(tint, 0.6, 0, 2) });
  const slot = look === 0 ? SLOT.broadB : look === 1 ? SLOT.shrub : SLOT.broadA;
  const size = look === 0 ? 1.9 : look === 1 ? 1.4 : 1.7;
  const nb = 4 + Math.floor(rng() * 4);
  for (let b = 0; b < nb; b++) {
    const t = 0.4 + (b / nb) * 0.55;
    const q = pointOn(trunk, t);
    const d = randPerp(rng, q.dir).add(new THREE.Vector3(0, look === 2 ? -0.1 : 0.5, 0)).normalize();
    const br = growPath(rng, q, d, (1.5 + rng() * 2.2) * sc, q.r * 0.6, 0.012, 4, { tropism: look === 2 ? -0.1 : 0.2, gravity: look === 2 ? 0.4 : 0.1, wobble: 0.25 });
    skel.branches.push({ pts: br, level: 1, color: aoColor(tint, 1, 0, 2) });
    leafSpray(rng, skel, br, slot, size * sc, look === 1 ? 4 : 3, look === 0 ? [0.4, 0.5, 0.24] : [0.34, 0.45, 0.22], { t0: 0.3, up: look === 2 ? 0.0 : 0.4, spread: 0.8 });
  }
  leafSpray(rng, skel, trunk, slot, size * 1.1 * sc, 3, [0.38, 0.48, 0.23], { t0: 0.85, up: 0.6 });
  skel.crownC = new THREE.Vector3(trunk[trunk.length - 1].x, H * 0.75, trunk[trunk.length - 1].z);
  skel.shadeFn = (y) => 0.6 + 0.4 * Math.min(1, Math.max(0, y / H));
  return { skel, height: H + 1, radius: 3 * sc, crownY: H * 0.75, trunkR: R0 * 2, kind: 'mid' };
}

/** Dead / dying tree: bare branches, broken top, vines. */
function deadTree(rng, opts) {
  const skel = { branches: [], leaves: [], lod1MaxLevel: 2, lod1MinR: 0.04 };
  const sc = opts.scale ?? 1;
  const H = (8 + rng() * 8) * sc, R0 = (0.22 + rng() * 0.18) * sc;
  const trunk = growPath(rng, { x: 0, y: -0.3, z: 0 }, new THREE.Vector3((rng() - 0.5) * 0.3, 1, (rng() - 0.5) * 0.3), H, R0, R0 * 0.55, 9, { wobble: 0.1 });
  const tint = [0.75, 0.72, 0.66];
  skel.branches.push({ pts: trunk, level: 0, cap: true, color: aoColor(tint, 0.6, 0, 3) });
  const nb = 4 + Math.floor(rng() * 5);
  for (let b = 0; b < nb; b++) {
    const q = pointOn(trunk, 0.45 + rng() * 0.5);
    const d = randPerp(rng, q.dir).add(new THREE.Vector3(0, 0.4 + rng() * 0.5, 0)).normalize();
    const br = growPath(rng, q, d, (2 + rng() * 4) * sc, q.r * 0.5, 0.02, 5, { wobble: 0.35, tropism: 0.1 });
    skel.branches.push({ pts: br, level: 1, color: aoColor(tint, 1, 0, 3) });
    for (let k = 0; k < 2; k++) {
      const q2 = pointOn(br, 0.4 + rng() * 0.5);
      const tw = growPath(rng, q2, randPerp(rng, q2.dir).add(new THREE.Vector3(0, 0.5, 0)).normalize(), 1 + rng() * 1.5, 0.025, 0.008, 3, { wobble: 0.4 });
      skel.branches.push({ pts: tw, level: 2, color: aoColor(tint, 1, 0, 3) });
    }
    if (rng() < 0.4) leafSpray(rng, skel, br, SLOT.deadTwigs, 1.4, 1, [0.6, 0.5, 0.38], { t0: 1 });
    if (rng() < 0.5) {
      const q3 = pointOn(br, 0.5 + rng() * 0.4);
      const len = 2.5 + rng() * 4;
      skel.leaves.push({ type: 'cluster', p: { x: q3.x, y: q3.y - len, z: q3.z }, dir: new THREE.Vector3(0, 1, 0), size: len, slot: SLOT.vines, tint: jitterTint(rng, [0.5, 0.56, 0.4]), rot: rng() * 3, back: 0, bend: 0.3 });
    }
  }
  skel.crownC = new THREE.Vector3(0, H * 0.7, 0);
  return { skel, height: H, radius: 4 * sc, crownY: H * 0.7, trunkR: R0 * 1.5, kind: 'big' };
}

/** Coconut palm (look 0) / areca palm (look 1). */
function palm(rng, opts) {
  const skel = { branches: [], leaves: [], lod1MaxLevel: 9 };
  const areca = opts.look === 1;
  const sc = opts.scale ?? 1;
  const H = (areca ? 6 + rng() * 4 : 9 + rng() * 6) * sc;
  const R0 = (areca ? 0.08 : 0.16) * sc;
  const leanA = rng() * TAU, leanM = areca ? 0.05 : 0.15 + rng() * 0.2;
  const pts = [];
  const segs = 12;
  for (let k = 0; k <= segs; k++) {
    const t = k / segs;
    const off = leanM * H * t * t * 0.6;
    pts.push({ x: Math.cos(leanA) * off, y: -0.3 + t * H, z: Math.sin(leanA) * off, r: R0 * (1.35 - t * 0.4 + (k === 0 ? 0.3 : 0)) });
  }
  skel.branches.push({ pts, level: 0, radial: 9, vMeters: 0.6, color: aoColor(areca ? [0.7, 0.72, 0.62] : [0.68, 0.62, 0.54], 0.6, 0, 2) });
  const top = pts[pts.length - 1];
  const nF = areca ? 8 : 14 + Math.floor(rng() * 4);
  for (let f = 0; f < nF; f++) {
    const az = (f / nF) * TAU + rng() * 0.4;
    const dead = !areca && f >= nF - 3;
    const elev = dead ? -1.2 : (areca ? 0.9 : 0.75) - (f % 3) * 0.32 + rng() * 0.25;
    const len = (areca ? 2.6 : 4.4) * sc * (0.85 + rng() * 0.25);
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const dir = out.clone().multiplyScalar(Math.cos(elev)).add(new THREE.Vector3(0, Math.sin(elev), 0));
    const spine = [], sides = [];
    const n = 8;
    const p = new THREE.Vector3(top.x, top.y, top.z);
    const d = dir.clone();
    const side = new THREE.Vector3(-out.z, 0, out.x);
    for (let i = 0; i <= n; i++) {
      spine.push(p.clone());
      sides.push(side.clone());
      d.y -= (dead ? 0.05 : 0.2) * (len / n) * 0.35;
      d.normalize();
      p.addScaledVector(d, len / n);
    }
    skel.leaves.push({ type: 'strip', spine, sides, widthFn: (t) => (areca ? 0.55 : 0.85) * sc * Math.sin(Math.min(1, t * 1.1 + 0.08) * Math.PI) ** 0.5, slot: SLOT.palm, tint: dead ? [0.75, 0.55, 0.3] : jitterTint(rng, areca ? [0.5, 0.62, 0.3] : [0.45, 0.55, 0.28]), fold: -0.35 });
  }
  skel.crownC = new THREE.Vector3(top.x, top.y, top.z);
  return { skel, height: H + 2, radius: areca ? 2.5 : 4.5, crownY: H, trunkR: R0 * 2, kind: 'mid' };
}

/** Bamboo clump: dense arching culms with sprigs of narrow leaves. */
function bamboo(rng, opts) {
  const skel = { branches: [], leaves: [], lod1MaxLevel: 9 };
  const sc = opts.scale ?? 1;
  const n = 18 + Math.floor(rng() * 16);
  const lean = rng() * TAU, leanS = 0.25 + rng() * 0.3; // whole clump leans (toward the road when placed)
  for (let c = 0; c < n; c++) {
    const ba = rng() * TAU, br = Math.sqrt(rng()) * 1.1 * sc;
    const bx = Math.cos(ba) * br, bz = Math.sin(ba) * br;
    const dead = rng() < 0.08;
    const len = (8 + rng() * 7) * sc * (dead ? 0.7 : 1);
    const r = (0.035 + rng() * 0.03) * sc;
    const outA = Math.atan2(bz, bx) * 0.6 + lean * 0.4 + (rng() - 0.5) * 0.8;
    const out = new THREE.Vector3(Math.cos(outA), 0, Math.sin(outA));
    const tilt = 0.08 + rng() * 0.25 + leanS * 0.3;
    const d = out.clone().multiplyScalar(tilt).add(new THREE.Vector3(0, 1, 0)).normalize();
    const pts = growPath(rng, { x: bx, y: -0.2, z: bz }, d, len, r, r * 0.45, 12, { gravity: 0.45 + rng() * 0.35, outward: out, wobble: 0.03 });
    skel.branches.push({ pts, level: 1, mat: 'bamboo', radial: 5, vMeters: 0.42, uMeters: 0.3, color: () => (dead ? [0.85, 0.7, 0.45] : [0.75 + rng() * 0.2, 0.85, 0.65]) });
    if (dead) continue;
    const nl = Math.round(len / 1.0);
    for (let k = 0; k < nl; k++) {
      const t = 0.38 + (k / nl) * 0.62;
      const q = pointOn(pts, t);
      const sd = randPerp(rng, q.dir).add(new THREE.Vector3(0, -0.35, 0)).normalize();
      skel.leaves.push({ type: 'cluster', p: { x: q.x, y: q.y, z: q.z }, dir: sd, size: (1.1 + rng() * 0.6) * sc, slot: SLOT.bamboo, tint: jitterTint(rng, [0.5, 0.58, 0.3], 0.03, 0.3), rot: rng() * 3, back: 0.05, bend: 0.55, quads: 2 });
    }
  }
  skel.crownC = new THREE.Vector3(0, 6 * sc, 0);
  skel.shadeFn = (y) => 0.6 + 0.4 * Math.min(1, Math.max(0, y / (10 * sc)));
  return { skel, height: 13 * sc, radius: 6 * sc, crownY: 7 * sc, trunkR: 1.3 * sc, kind: 'mid' };
}

/** Banana plant with big torn leaves and dead hanging leaves. */
function banana(rng, opts) {
  const skel = { branches: [], leaves: [], lod1MaxLevel: 9 };
  const sc = opts.scale ?? 1;
  const H = (2 + rng() * 1.4) * sc, R = (0.11 + rng() * 0.05) * sc;
  const stem = growPath(rng, { x: 0, y: -0.2, z: 0 }, new THREE.Vector3((rng() - 0.5) * 0.15, 1, (rng() - 0.5) * 0.15), H, R * 1.3, R * 0.8, 5, { wobble: 0.03 });
  skel.branches.push({ pts: stem, level: 0, mat: 'stem', radial: 8, vMeters: 1.2, color: (i, t) => [0.42 + t * 0.1, 0.45 + t * 0.15, 0.26] });
  const top = stem[stem.length - 1];
  const nL = 6 + Math.floor(rng() * 4);
  for (let l = 0; l < nL; l++) {
    const az = l * 2.4 + rng() * 0.5;
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const young = l === nL - 1;
    const elev = young ? 1.25 : 0.5 + rng() * 0.6;
    const blade = (1.6 + rng() * 1.0) * sc;
    const spine = [], sides = [];
    const p = new THREE.Vector3(top.x, top.y - rng() * 0.2, top.z);
    const d = out.clone().multiplyScalar(Math.cos(elev)).add(new THREE.Vector3(0, Math.sin(elev), 0));
    // petiole
    const pet = 0.4 + rng() * 0.3;
    const petPts = [{ x: p.x, y: p.y, z: p.z, r: 0.045 * sc }];
    p.addScaledVector(d, pet);
    petPts.push({ x: p.x, y: p.y, z: p.z, r: 0.03 * sc });
    skel.branches.push({ pts: petPts, level: 2, mat: 'stem', radial: 4, color: () => [0.5, 0.58, 0.32] });
    const n = 9;
    const twist = (rng() - 0.5) * 0.5;
    for (let i = 0; i <= n; i++) {
      spine.push(p.clone());
      const side = new THREE.Vector3(-d.z, 0, d.x).normalize();
      side.applyAxisAngle(d, twist * (i / n));
      sides.push(side);
      d.y -= (young ? 0.04 : 0.17 + rng() * 0.05);
      d.normalize();
      p.addScaledVector(d, blade / n);
    }
    skel.leaves.push({ type: 'strip', spine, sides, widthFn: (t) => 0.36 * sc * Math.sin(Math.min(1, t * 1.02 + 0.05) * Math.PI) ** 0.35, slot: SLOT.banana, tint: jitterTint(rng, [0.55, 0.68, 0.36], 0.03, 0.25), fold: 0.18 });
  }
  // dead hanging leaves along the stem
  for (let k = 0; k < 2 + Math.floor(rng() * 3); k++) {
    const az = rng() * TAU;
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const y0 = H * (0.6 + rng() * 0.35);
    const len = 1.2 + rng() * 0.8;
    const spine = [], sides = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      spine.push(new THREE.Vector3(out.x * (R + 0.05 + t * 0.12), y0 - t * len, out.z * (R + 0.05 + t * 0.12)));
      sides.push(new THREE.Vector3(-out.z, 0, out.x));
    }
    skel.leaves.push({ type: 'strip', spine, sides, widthFn: (t) => 0.18 * sc * (1 - t * 0.3), slot: SLOT.bananaDead, tint: jitterTint(rng, [0.8, 0.7, 0.55]), fold: 0.1, keepNormal: true });
  }
  skel.crownC = new THREE.Vector3(0, H, 0);
  return { skel, height: H + 2, radius: 2.4 * sc, crownY: H, trunkR: 0.4, kind: 'small' };
}

/** Frond rosette (ground fern, look 0) or tree fern (look 1). */
function fernPlant(rng, opts) {
  const skel = { branches: [], leaves: [], lod1MaxLevel: 9 };
  const tree = opts.look === 1;
  const sc = opts.scale ?? 1;
  let topY = 0.05;
  if (tree) {
    const H = (2 + rng() * 2.5) * sc;
    const trunk = growPath(rng, { x: 0, y: -0.2, z: 0 }, new THREE.Vector3((rng() - 0.5) * 0.3, 1, (rng() - 0.5) * 0.3), H, 0.16 * sc, 0.12 * sc, 6, { wobble: 0.08 });
    skel.branches.push({ pts: trunk, level: 0, radial: 7, color: aoColor([0.42, 0.34, 0.27], 0.7, 0, 2) });
    topY = trunk[trunk.length - 1].y;
  }
  const nF = tree ? 11 + Math.floor(rng() * 4) : 7 + Math.floor(rng() * 6);
  for (let f = 0; f < nF; f++) {
    const az = f * 2.4 + rng() * 0.4;
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const dead = tree && f < 3;
    const elev = dead ? -1.1 : 0.55 + rng() * 0.6;
    const len = (tree ? 2.2 + rng() * 0.6 : 0.7 + rng() * 0.7) * sc;
    const d = out.clone().multiplyScalar(Math.cos(elev)).add(new THREE.Vector3(0, Math.sin(elev), 0));
    const p = new THREE.Vector3(0, topY, 0);
    const spine = [], sides = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      spine.push(p.clone());
      sides.push(new THREE.Vector3(-out.z, 0, out.x));
      d.y -= dead ? 0.02 : 0.24;
      d.normalize();
      p.addScaledVector(d, len / n);
    }
    skel.leaves.push({ type: 'strip', spine, sides, widthFn: (t) => len * 0.3 * Math.sin(Math.min(1, t + 0.1) * Math.PI) ** 0.7, slot: SLOT.fern, tint: dead ? [0.65, 0.48, 0.3] : jitterTint(rng, [0.5, 0.62, 0.32], 0.04, 0.3), fold: 0.12, shadeFn: (t) => 0.6 + t * 0.45 });
  }
  skel.crownC = new THREE.Vector3(0, topY, 0);
  return { skel, height: topY + 1.5, radius: tree ? 2.6 : 1.2, crownY: topY, trunkR: tree ? 0.4 : 0.2, kind: tree ? 'mid' : 'ground' };
}

/** Grass clump (short tufts look 0, tall cogon look 1). */
function grassClump(rng, opts) {
  const skel = { branches: [], leaves: [] };
  const tall = opts.look === 1;
  const sc = opts.scale ?? 1;
  const n = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI + rng() * 0.5;
    const h = (tall ? 1.1 + rng() * 0.7 : 0.55 + rng() * 0.45) * sc;
    const side = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const out = new THREE.Vector3(-side.z, 0, side.x).multiplyScalar((rng() - 0.5) * 0.5);
    const spine = [], sides = [];
    for (let k = 0; k <= 3; k++) {
      const t = k / 3;
      spine.push(new THREE.Vector3(out.x * t * t * h, -0.05 + t * h, out.z * t * t * h));
      sides.push(side);
    }
    skel.leaves.push({ type: 'strip', spine, sides, widthFn: () => h * 0.5, slot: tall ? SLOT.tallGrass : SLOT.grass, tint: jitterTint(rng, tall ? [0.5, 0.54, 0.34] : [0.42, 0.5, 0.28], 0.04, 0.3), fold: 0, keepNormal: false, shadeFn: (t) => 0.45 + t * 0.5 });
  }
  return { skel, height: tall ? 1.8 : 1, radius: 0.8, crownY: 0.5, trunkR: 0, kind: 'ground' };
}

/** Elephant-ear (colocasia): big heart leaves on long petioles. */
function elephantEar(rng, opts) {
  const skel = { branches: [], leaves: [] };
  const sc = opts.scale ?? 1;
  const n = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const az = i * 2.3 + rng() * 0.6;
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const ph = (0.6 + rng() * 0.8) * sc;
    const tip = new THREE.Vector3(out.x * ph * 0.35, ph, out.z * ph * 0.35);
    skel.branches.push({ pts: [{ x: 0, y: -0.05, z: 0, r: 0.03 * sc }, { x: tip.x * 0.5, y: ph * 0.55, z: tip.z * 0.5, r: 0.025 * sc }, { x: tip.x, y: tip.y, z: tip.z, r: 0.018 * sc }], level: 1, mat: 'stem', radial: 4, color: () => [0.52, 0.62, 0.36] });
    // blade: strip from the petiole tip outward & drooping
    const L = (0.7 + rng() * 0.45) * sc;
    const d = out.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.25 - rng() * 0.5, 0)).normalize();
    const spine = [], sides = [];
    const p = tip.clone().addScaledVector(d, -L * 0.18);
    for (let k = 0; k <= 4; k++) {
      spine.push(p.clone());
      sides.push(new THREE.Vector3(-out.z, 0, out.x));
      d.y -= 0.18;
      d.normalize();
      p.addScaledVector(d, L / 4);
    }
    skel.leaves.push({ type: 'strip', spine, sides, widthFn: () => L * 0.5, slot: SLOT.elephant, tint: jitterTint(rng, [0.55, 0.66, 0.4], 0.03, 0.25), fold: 0.1 });
  }
  return { skel, height: 2, radius: 1.2, crownY: 1, trunkR: 0.15, kind: 'ground' };
}

/** Woody shrub with dense small-leaf clusters. */
function shrub(rng, opts) {
  const skel = { branches: [], leaves: [], lod1MaxLevel: 1, lod1MinR: 0.05 };
  const sc = opts.scale ?? 1;
  const H = (1.0 + rng() * 1.3) * sc;
  const n = 3 + Math.floor(rng() * 4);
  const slot = rng() < 0.6 ? SLOT.shrub : SLOT.broadA;
  for (let i = 0; i < n; i++) {
    const az = rng() * TAU;
    const d = new THREE.Vector3(Math.cos(az) * 0.5, 1, Math.sin(az) * 0.5).normalize();
    const pts = growPath(rng, { x: 0, y: -0.1, z: 0 }, d, H * (0.7 + rng() * 0.4), 0.035 * sc, 0.01, 4, { wobble: 0.3 });
    skel.branches.push({ pts, level: 2, radial: 4, color: aoColor([0.45, 0.4, 0.34], 0.7, 0, 1) });
    leafSpray(rng, skel, pts, slot, (1.0 + rng() * 0.4) * sc, 3, [0.36, 0.48, 0.23], { t0: 0.35, up: 0.5, spread: 1 });
  }
  skel.crownC = new THREE.Vector3(0, H * 0.4, 0);
  skel.shadeFn = (y) => 0.55 + 0.45 * Math.min(1, Math.max(0, y / H));
  return { skel, height: H + 0.6, radius: 1.2 * sc, crownY: H * 0.5, trunkR: 0.2, kind: 'ground' };
}

/** Mossy fallen log with ferns. */
function fallenLog(rng, opts) {
  const skel = { branches: [], leaves: [] };
  const sc = opts.scale ?? 1;
  const len = (4 + rng() * 5) * sc, R = (0.22 + rng() * 0.22) * sc;
  const pts = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    pts.push({ x: (t - 0.5) * len, y: R * 0.6 + Math.sin(t * 3 + rng()) * 0.05, z: Math.sin(t * 2.5) * 0.3, r: R * (1 - t * 0.25) });
  }
  skel.branches.push({ pts, level: 0, cap: true, radial: 9, color: (i, t, y) => [0.5, 0.52, 0.42] });
  for (let k = 0; k < 4; k++) {
    const q = pointOn(pts, 0.15 + rng() * 0.7);
    skel.leaves.push({ type: 'cluster', p: { x: q.x, y: q.y + q.r * 0.7, z: q.z }, dir: new THREE.Vector3(0, 1, 0), size: 0.8 + rng() * 0.5, slot: rng() < 0.5 ? SLOT.epiphyte : SLOT.fern, tint: jitterTint(rng, [0.5, 0.6, 0.32]), rot: rng() * 3, back: 0.05, bend: 0.4 });
  }
  return { skel, height: 1.5, radius: len / 2, crownY: 0.5, trunkR: R, kind: 'ground' };
}

/** Hanging liana curtain (origin at the TOP, hangs down to -len). */
function vineCurtain(rng, opts) {
  const skel = { branches: [], leaves: [] };
  const len = 4 + rng() * 4;
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const x = (rng() - 0.5) * 3, z = (rng() - 0.5) * 1.2;
    const l = len * (0.6 + rng() * 0.4);
    skel.leaves.push({ type: 'cluster', p: { x, y: -l, z }, dir: new THREE.Vector3(0, 1, 0), size: l, slot: SLOT.vines, tint: jitterTint(rng, [0.55, 0.62, 0.42]), rot: rng() * Math.PI, back: 0, bend: 0.3, quads: 1 });
  }
  skel.crownC = new THREE.Vector3(0, -len * 0.5, 0);
  return { skel, height: len, radius: 2, crownY: -len / 2, trunkR: 0, kind: 'vine' };
}

/** Mossy boulder (single geometry, rock material). */
export function rockGeometry(rng, sc = 1) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  const sx = (0.7 + rng() * 0.8) * sc, sy = (0.45 + rng() * 0.5) * sc, sz = (0.7 + rng() * 0.6) * sc;
  const ph = rng() * 10;
  const cols = [];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.22 * Math.sin(x * 3.1 + ph) * Math.sin(y * 2.7 + ph * 0.5) * Math.sin(z * 3.3) + 0.12 * Math.sin(x * 7 + z * 5 + ph);
    x *= sx * n;
    y *= sy * n;
    z *= sz * n;
    if (y < -0.25 * sy) y = -0.25 * sy + (y + 0.25 * sy) * 0.2;
    p.setXYZ(i, x, y + 0.15 * sy, z);
    const m = Math.max(0, Math.min(1, (y / sy) * 1.2 + 0.2));
    cols.push(0.62 - m * 0.2, 0.62 - m * 0.08, 0.58 - m * 0.3);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export const SPECIES = {
  rainTree: { fn: rainTree, variants: 3, lods: 2, impostor: true },
  dipterocarp: { fn: dipterocarp, variants: 3, lods: 2, impostor: true },
  banyan: { fn: banyan, variants: 2, lods: 2, impostor: true },
  understory: { fn: understory, variants: 4, lods: 2, impostor: true },
  deadTree: { fn: deadTree, variants: 2, lods: 2, impostor: true },
  palm: { fn: palm, variants: 2, lods: 1, impostor: true, looks: [0, 1] },
  bamboo: { fn: bamboo, variants: 3, lods: 2, impostor: true },
  banana: { fn: banana, variants: 3, lods: 1, impostor: false },
  treeFern: { fn: fernPlant, variants: 2, lods: 1, impostor: false, looks: [1, 1] },
  fern: { fn: fernPlant, variants: 3, lods: 2, impostor: false, looks: [0, 0, 0] },
  grass: { fn: grassClump, variants: 3, lods: 1, impostor: false, looks: [0, 0, 1] },
  elephantEar: { fn: elephantEar, variants: 2, lods: 1, impostor: false },
  shrub: { fn: shrub, variants: 3, lods: 2, impostor: false },
  log: { fn: fallenLog, variants: 2, lods: 1, impostor: false },
  vine: { fn: vineCurtain, variants: 3, lods: 1, impostor: false },
};

/** Build one variant: { lods: [meshSkeleton(...)...], info } */
export function buildVariant(name, variant, seed, opts = {}) {
  const sp = SPECIES[name];
  const rng = makeRng(seed);
  const look = sp.looks ? sp.looks[variant % sp.looks.length] : variant;
  const res = sp.fn(rng, { scale: opts.scale ?? 1, look, ...opts });
  const lods = [];
  for (let l = 0; l < sp.lods; l++) lods.push(meshSkeleton(res.skel, l));
  return { name, variant, lods, height: res.height, radius: res.radius, crownY: res.crownY, trunkR: res.trunkR, kind: res.kind, skel: res.skel };
}

/** Bamboo culm texture (green, node rings, dusty bloom). */
let _bambooTex = null;
export function bambooTexture() {
  if (_bambooTex) return _bambooTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  const rng = makeRng(991);
  const grd = g.createLinearGradient(0, 0, 64, 0);
  grd.addColorStop(0, '#4f6a2a');
  grd.addColorStop(0.5, '#7d9440');
  grd.addColorStop(1, '#4a6328');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(${200 + rng() * 40},${200 + rng() * 40},${150},${0.05 + rng() * 0.06})`;
    g.fillRect(rng() * 64, rng() * 256, 2 + rng() * 6, 8 + rng() * 40);
  }
  // node ring near the bottom of the tile
  g.fillStyle = 'rgba(40,45,20,0.85)';
  g.fillRect(0, 246, 64, 5);
  g.fillStyle = 'rgba(200,200,150,0.35)';
  g.fillRect(0, 240, 64, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  _bambooTex = t;
  return t;
}
