// Geometry helpers for the vehicles: structured grid surfaces (lofts), lathe/tube
// helpers, deformers, and a per-material merge builder so hundreds of small parts
// collapse into a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

/**
 * A structured grid of points P[r][c] (rows x cols). Normals are computed over the whole
 * grid so any subset of cells shares smooth shading with its neighbours (doors vs body).
 */
export class GridSurface {
  /** posFn(r, c) -> [x, y, z] */
  constructor(rows, cols, posFn, { closedCols = false } = {}) {
    this.rows = rows;
    this.cols = cols;
    this.closedCols = closedCols;
    this.P = new Float32Array(rows * cols * 3);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = posFn(r, c);
        const i = (r * cols + c) * 3;
        this.P[i] = p[0];
        this.P[i + 1] = p[1];
        this.P[i + 2] = p[2];
      }
    }
    this.N = new Float32Array(rows * cols * 3);
    this.computeNormals();
  }
  idx(r, c) {
    if (this.closedCols) c = ((c % this.cols) + this.cols) % this.cols;
    return r * this.cols + c;
  }
  get(r, c, out = new THREE.Vector3()) {
    const i = this.idx(r, c) * 3;
    return out.set(this.P[i], this.P[i + 1], this.P[i + 2]);
  }
  normal(r, c, out = new THREE.Vector3()) {
    const i = this.idx(r, c) * 3;
    return out.set(this.N[i], this.N[i + 1], this.N[i + 2]);
  }
  cellCols() {
    return this.closedCols ? this.cols : this.cols - 1;
  }
  computeNormals(flip = false) {
    const N = this.N;
    N.fill(0);
    const cc = this.cellCols();
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < cc; c++) {
        const i00 = this.idx(r, c), i01 = this.idx(r, c + 1), i10 = this.idx(r + 1, c), i11 = this.idx(r + 1, c + 1);
        this._accumTri(i00, i10, i11);
        this._accumTri(i00, i11, i01);
      }
    }
    for (let i = 0; i < N.length; i += 3) {
      const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
      const s = flip ? -1 / l : 1 / l;
      N[i] *= s;
      N[i + 1] *= s;
      N[i + 2] *= s;
    }
  }
  _accumTri(i0, i1, i2) {
    const P = this.P;
    _a.set(P[i0 * 3], P[i0 * 3 + 1], P[i0 * 3 + 2]);
    _b.set(P[i1 * 3], P[i1 * 3 + 1], P[i1 * 3 + 2]);
    _c.set(P[i2 * 3], P[i2 * 3 + 1], P[i2 * 3 + 2]);
    _b.sub(_a);
    _c.sub(_a);
    _v.crossVectors(_b, _c); // area weighted
    for (const i of [i0, i1, i2]) {
      this.N[i * 3] += _v.x;
      this.N[i * 3 + 1] += _v.y;
      this.N[i * 3 + 2] += _v.z;
    }
  }
  /**
   * Build a BufferGeometry from the cells where pred(r, c) is true.
   * opts: { uv(r,c)->[u,v], color(r,c)->[r,g,b], offset: metres along normal, flip: reverse winding,
   *         mirrorX: also emit the mirrored copy (x -> -x), attrs: {name:(r,c)->number} }
   */
  build(pred = () => true, opts = {}) {
    const pos = [], nor = [], uv = [], col = [], idx = [];
    const map = new Map();
    const off = opts.offset || 0;
    const sx = opts.mirror ? -1 : 1;
    const vert = (r, c) => {
      const key = this.idx(r, c);
      let id = map.get(key);
      if (id !== undefined) return id;
      id = pos.length / 3;
      map.set(key, id);
      const i = key * 3;
      const nx = this.N[i], ny = this.N[i + 1], nz = this.N[i + 2];
      pos.push((this.P[i] + nx * off) * sx, this.P[i + 1] + ny * off, this.P[i + 2] + nz * off);
      const fl = opts.flip ? -1 : 1;
      nor.push(nx * fl * sx, ny * fl, nz * fl);
      if (opts.uv) uv.push(...opts.uv(r, c));
      if (opts.color) col.push(...opts.color(r, c));
      return id;
    };
    const cc = this.cellCols();
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < cc; c++) {
        if (!pred(r, c)) continue;
        const a = vert(r, c), b = vert(r + 1, c), d = vert(r, c + 1), e = vert(r + 1, c + 1);
        let flip = !!opts.flip;
        if (opts.mirror) flip = !flip;
        if (!flip) idx.push(a, b, e, a, e, d);
        else idx.push(a, e, b, a, d, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    if (opts.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (opts.color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }
  /**
   * Strips that close the gap between the surface and its inward offset along the
   * boundary between solid cells (pred true) and hole cells (hole true): window reveals,
   * door edges. Returns BufferGeometry.
   */
  edgeStrips(solid, hole, depth, opts = {}) {
    const pos = [], nor = [], idx = [];
    const sx = opts.mirror ? -1 : 1;
    const push = (p) => pos.push(p.x * sx, p.y, p.z);
    const P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), N0 = new THREE.Vector3(), N1 = new THREE.Vector3();
    const I0 = new THREE.Vector3(), I1 = new THREE.Vector3(), nrm = new THREE.Vector3(), tmp = new THREE.Vector3();
    const emit = (r0, c0, r1, c1, holeR, holeC) => {
      this.get(r0, c0, P0);
      this.get(r1, c1, P1);
      this.normal(r0, c0, N0);
      this.normal(r1, c1, N1);
      I0.copy(P0).addScaledVector(N0, -depth);
      I1.copy(P1).addScaledVector(N1, -depth);
      // facing: toward the hole cell centre
      this.get(holeR, holeC, tmp);
      const cx = tmp.clone();
      this.get(holeR + 1, holeC + 1, tmp);
      cx.add(tmp).multiplyScalar(0.5);
      nrm.subVectors(cx, P0.clone().add(P1).multiplyScalar(0.5));
      const along = tmp.subVectors(P1, P0).normalize();
      nrm.addScaledVector(along, -nrm.dot(along));
      const nn = N0.clone().add(N1).normalize();
      nrm.addScaledVector(nn, -nrm.dot(nn)).normalize();
      const base = pos.length / 3;
      push(P0); push(P1); push(I1); push(I0);
      for (let k = 0; k < 4; k++) nor.push(nrm.x * sx, nrm.y, nrm.z);
      // winding: check against nrm
      const e1 = new THREE.Vector3().subVectors(P1, P0), e2 = new THREE.Vector3().subVectors(I0, P0);
      const fn = new THREE.Vector3().crossVectors(e1, e2);
      let ok = fn.dot(nrm) > 0;
      if (opts.mirror) ok = !ok;
      if (ok) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    };
    const cc = this.cellCols();
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < cc; c++) {
        if (!solid(r, c)) continue;
        // neighbours
        if (r + 1 < this.rows - 1 && hole(r + 1, c)) emit(r + 1, c, r + 1, c + 1, r + 1, c);
        if (r - 1 >= 0 && hole(r - 1, c)) emit(r, c, r, c + 1, r - 1, c);
        if ((c + 1 < cc || this.closedCols) && hole(r, (c + 1) % this.cols)) emit(r, c + 1, r + 1, c + 1, r, c + 1);
        if ((c - 1 >= 0 || this.closedCols) && hole(r, (c - 1 + this.cols) % this.cols)) emit(r, c, r + 1, c, r, c - 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }
}

/** Ensure a geometry has position/normal/uv (non-indexed merge needs consistent attributes). */
export function normalizeAttrs(g, { color = null } = {}) {
  if (!g.index) {
    // keep non-indexed; merge handles both if consistent - convert to indexed for safety
    const n = g.attributes.position.count;
    const ix = [];
    for (let i = 0; i < n; i++) ix.push(i);
    g.setIndex(ix);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  if (color) {
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = color.r;
      arr[i * 3 + 1] = color.g;
      arr[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return g;
}

/** Apply position / rotation (euler xyz radians or quaternion) / scale to a geometry in place. */
export function xform(g, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  if (Array.isArray(rot)) _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], rot[3] || 'XYZ'));
  else _q.copy(rot);
  _s.set(...(typeof scl === 'number' ? [scl, scl, scl] : scl));
  _m.compose(_v.set(pos[0], pos[1], pos[2]), _q, _s);
  g.applyMatrix4(_m);
  return g;
}

/** Per-vertex deform: fn(v: Vector3) mutates v. Recomputes normals unless keepNormals. */
export function deform(g, fn, keepNormals = false) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    fn(_v, i);
    p.setXYZ(i, _v.x, _v.y, _v.z);
  }
  p.needsUpdate = true;
  if (!keepNormals) g.computeVertexNormals();
  return g;
}

/**
 * Collects geometries per material key and merges them into one mesh each.
 * add(key, geometry, {color}) ; build(materials) -> Group of meshes
 */
export class MergeBuilder {
  constructor() {
    this.lists = new Map();
  }
  add(key, g, opts = {}) {
    if (!g) return;
    if (!this.lists.has(key)) this.lists.set(key, []);
    normalizeAttrs(g, { color: opts.color ? new THREE.Color(opts.color) : null });
    this.lists.get(key).push(g);
    return g;
  }
  /** materials: {key: Material}. Vertex-colored keys need all parts colored: missing color -> white. */
  build(materials, group = new THREE.Group()) {
    for (const [key, list] of this.lists) {
      const anyColor = list.some((g) => g.attributes.color);
      if (anyColor) for (const g of list) if (!g.attributes.color) normalizeAttrs(g, { color: new THREE.Color(1, 1, 1) });
      const merged = mergeGeometries(list, false);
      if (!merged) {
        console.warn('[vehicle] merge failed for', key);
        continue;
      }
      merged.computeBoundingSphere();
      const mat = materials[key];
      if (!mat) console.warn('[vehicle] no material for', key);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = key;
      group.add(mesh);
      for (const g of list) g.dispose();
    }
    this.lists.clear();
    return group;
  }
}

export function roundedBox(w, h, d, r = 0.02, seg = 3) {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  return g;
}

/** Lathe from [[r, y], ...] around Y. */
export function lathe(pts, seg = 24, phiStart = 0, phiLength = Math.PI * 2) {
  return new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg, phiStart, phiLength);
}

/** Tube along points (CatmullRom). */
export function tube(points, radius = 0.01, tubular = 24, radial = 6, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]))), closed, 'catmullrom', 0.5);
  return new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
}

/** Cylinder along an axis between two points. */
export function rod(a, b, r = 0.01, seg = 8, r2 = r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r2, r, len, seg, 1, false);
  const dir = B.clone().sub(A).normalize();
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const mid = A.add(B).multiplyScalar(0.5);
  return xform(g, [mid.x, mid.y, mid.z], _q.clone());
}

/** Extruded 2D shape (points [[x,y],...]) with bevel; depth along +Z centred. */
export function extrude(points, depth, bevel = 0.004, curveSeg = 6, bevelSeg = 2) {
  const s = new THREE.Shape(points.map((p) => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevelSeg, curveSegments: curveSeg });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Rounded rectangle polygon points (for extrude / shapes). */
export function roundRectPts(w, h, r, seg = 4) {
  const pts = [];
  const hw = w / 2, hh = h / 2;
  r = Math.min(r, hw, hh);
  const corners = [[hw - r, hh - r, 0], [-hw + r, hh - r, Math.PI / 2], [-hw + r, -hh + r, Math.PI], [hw - r, -hh + r, Math.PI * 1.5]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

/** Flat rounded-rect plane (XY) with UVs 0..1 across the bounding box. */
export function roundRectPlane(w, h, r, seg = 5) {
  const pts = roundRectPts(w, h, r, seg);
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ShapeGeometry(shape, seg);
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / w + 0.5;
    uv[i * 2 + 1] = p.getY(i) / h + 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Simple pillow deformation: bulge a box-ish geometry outward on its faces. */
export function pillow(g, amount = 0.02, axes = [1, 1, 1]) {
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const c = bb.getCenter(new THREE.Vector3());
  const h = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  return deform(g, (v) => {
    const nx = (v.x - c.x) / h.x, ny = (v.y - c.y) / h.y, nz = (v.z - c.z) / h.z;
    const fx = (1 - ny * ny) * (1 - nz * nz), fy = (1 - nx * nx) * (1 - nz * nz), fz = (1 - nx * nx) * (1 - ny * ny);
    v.x += Math.sign(nx) * fx * amount * axes[0] * Math.min(1, Math.abs(nx) * 3);
    v.y += Math.sign(ny) * fy * amount * axes[1] * Math.min(1, Math.abs(ny) * 3);
    v.z += Math.sign(nz) * fz * amount * axes[2] * Math.min(1, Math.abs(nz) * 3);
  });
}

/** Planar UV projection: axis 'x'|'y'|'z', scale metres per uv unit. */
export function planarUV(g, axis = 'z', scale = 1, offset = [0, 0]) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let u, v;
    if (axis === 'x') { u = z; v = y; } else if (axis === 'y') { u = x; v = z; } else { u = x; v = y; }
    uv[i * 2] = u / scale + offset[0];
    uv[i * 2 + 1] = v / scale + offset[1];
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Box-projected UVs by dominant normal (good for random props). */
export function boxUV(g, scale = 1) {
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export { mergeGeometries };
