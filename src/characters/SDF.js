// Signed distance field toolkit for sculpting characters.
//
// A shape is an ordered list of primitives. Each primitive is evaluated only
// inside its (expanded) bounding box and folded into a dense grid with a smooth
// boolean op (sequential, like a sculpting stack):
//   op 'add'  : grid = smin(grid, d, k)
//   op 'sub'  : grid = smax(grid, -d, k)
//   op 'inter': grid = smax(grid, d, k)       (applied over its bbox only)
//   op 'paint': no geometry, only used for material / weight lookups
// Primitives carry `mat` (material id for vertex painting), `region` (skinning
// region) and `bias` (material priority).
//
// All maths is allocation free in the hot loops (plain numbers, no Vector3).

export const smin = (a, b, k) => {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a, b, k) => -smin(-a, -b, k);

// ---------------------------------------------------------------------------
// Primitive distance functions (local coordinates).
// ---------------------------------------------------------------------------
export function sdSphere(x, y, z, r) {
  return Math.sqrt(x * x + y * y + z * z) - r;
}

/** Ellipsoid (iq's bound, good near the surface). */
export function sdEllipsoid(x, y, z, rx, ry, rz) {
  const ax = x / rx, ay = y / ry, az = z / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = x / (rx * rx), by = y / (ry * ry), bz = z / (rz * rz);
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  if (k1 < 1e-9) return -Math.min(rx, ry, rz);
  return (k0 * (k0 - 1)) / k1;
}

/** Round cone between points a (radius r1) and b (radius r2). iq's exact version. */
export function sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const cx = pax * l2 - bax * y, cy = pay * l2 - bay * y, cz = paz * l2 - baz * y;
  const x2 = cx * cx + cy * cy + cz * cz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

export function sdCapsule(px, py, pz, ax, ay, az, bx, by, bz, r) {
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz);
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/** Rounded box, half extents hx,hy,hz, rounding r. */
export function sdRoundBox(x, y, z, hx, hy, hz, r) {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r;
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
}

/** Capped cone (truncated) along Y from y=-h (radius r1) to y=+h (radius r2), with edge rounding rr. */
export function sdCappedCone(x, y, z, h, r1, r2) {
  const qx = Math.sqrt(x * x + z * z), qy = y;
  const k1x = r2, k1y = h;
  const k2x = r2 - r1, k2y = 2 * h;
  const cax = qx - Math.min(qx, qy < 0 ? r1 : r2), cay = Math.abs(qy) - h;
  const k2l = k2x * k2x + k2y * k2y;
  let t = ((k1x - qx) * k2x + (k1y - qy) * k2y) / k2l;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cbx = qx - k1x + k2x * t, cby = qy - k1y + k2y * t;
  const s = cbx < 0 && cay < 0 ? -1 : 1;
  return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
}

export function sdTorus(x, y, z, R, r) {
  const q = Math.sqrt(x * x + z * z) - R;
  return Math.sqrt(q * q + y * y) - r;
}

// ---------------------------------------------------------------------------
// Primitive objects. Each has eval(x,y,z) in shape space and a bbox.
// ---------------------------------------------------------------------------
let _pid = 0;
function basePrim(o) {
  return {
    id: _pid++,
    op: o.op || 'add',
    k: o.k ?? 0.02,
    mat: o.mat ?? 'skin',
    region: o.region ?? null,
    bias: o.bias ?? 0,
    tag: o.tag ?? null,
    data: o.data ?? null,
  };
}

/** Orthonormal basis from an axis (Y) and a hint (Z). Returns 9 numbers (X,Y,Z columns). */
export function basisFromYZ(yx, yy, yz, zx = 0, zy = 0, zz = 1) {
  let l = Math.hypot(yx, yy, yz) || 1;
  yx /= l; yy /= l; yz /= l;
  const d = zx * yx + zy * yy + zz * yz;
  zx -= yx * d; zy -= yy * d; zz -= yz * d;
  l = Math.hypot(zx, zy, zz);
  if (l < 1e-6) { zx = 1; zy = 0; zz = 0; l = 1; }
  zx /= l; zy /= l; zz /= l;
  // X = Y x Z
  const xx = yy * zz - yz * zy, xy = yz * zx - yx * zz, xz = yx * zy - yy * zx;
  return [xx, xy, xz, yx, yy, yz, zx, zy, zz];
}

/** Rotation basis from euler angles (radians), order XYZ intrinsic -> columns. */
export function basisFromEuler(rx = 0, ry = 0, rz = 0) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rx * Ry * Rz (three.js 'XYZ')
  const m11 = cy * cz, m12 = -cy * sz, m13 = sy;
  const m21 = cx * sz + sx * sy * cz, m22 = cx * cz - sx * sy * sz, m23 = -sx * cy;
  const m31 = sx * sz - cx * sy * cz, m32 = sx * cz + cx * sy * sz, m33 = cx * cy;
  // columns: X=(m11,m21,m31) Y=(m12,m22,m32) Z=(m13,m23,m33)
  return [m11, m21, m31, m12, m22, m32, m13, m23, m33];
}

export function sphere(c, r, o = {}) {
  const p = basePrim(o);
  p.kind = 'sphere';
  const [cx, cy, cz] = c;
  p.eval = (x, y, z) => sdSphere(x - cx, y - cy, z - cz, r);
  p.bbox = [cx - r, cy - r, cz - r, cx + r, cy + r, cz + r];
  return p;
}

/** Ellipsoid with optional basis (array of 9 = X,Y,Z axes) */
export function ellipsoid(c, rad, o = {}) {
  const p = basePrim(o);
  p.kind = 'ellipsoid';
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = rad;
  const B = o.basis || null;
  if (!B) {
    p.eval = (x, y, z) => sdEllipsoid(x - cx, y - cy, z - cz, rx, ry, rz);
    p.bbox = [cx - rx, cy - ry, cz - rz, cx + rx, cy + ry, cz + rz];
  } else {
    p.eval = (x, y, z) => {
      const dx = x - cx, dy = y - cy, dz = z - cz;
      return sdEllipsoid(dx * B[0] + dy * B[1] + dz * B[2], dx * B[3] + dy * B[4] + dz * B[5], dx * B[6] + dy * B[7] + dz * B[8], rx, ry, rz);
    };
    const m = Math.max(rx, ry, rz);
    p.bbox = [cx - m, cy - m, cz - m, cx + m, cy + m, cz + m];
  }
  return p;
}

export function roundCone(a, b, r1, r2, o = {}) {
  const p = basePrim(o);
  p.kind = 'roundCone';
  const [ax, ay, az] = a;
  const [bx, by, bz] = b;
  if (Math.abs(r1 - r2) < 1e-5) {
    p.eval = (x, y, z) => sdCapsule(x, y, z, ax, ay, az, bx, by, bz, r1);
  } else {
    p.eval = (x, y, z) => sdRoundCone(x, y, z, ax, ay, az, bx, by, bz, r1, r2);
  }
  p.a = a; p.b = b; p.r1 = r1; p.r2 = r2;
  p.bbox = [
    Math.min(ax - r1, bx - r2), Math.min(ay - r1, by - r2), Math.min(az - r1, bz - r2),
    Math.max(ax + r1, bx + r2), Math.max(ay + r1, by + r2), Math.max(az + r1, bz + r2),
  ];
  return p;
}

export const capsule = (a, b, r, o = {}) => roundCone(a, b, r, r, o);

/** Rounded box with basis. */
export function roundBox(c, half, r, o = {}) {
  const p = basePrim(o);
  p.kind = 'roundBox';
  const [cx, cy, cz] = c;
  const [hx, hy, hz] = half;
  const B = o.basis || [1, 0, 0, 0, 1, 0, 0, 0, 1];
  p.eval = (x, y, z) => {
    const dx = x - cx, dy = y - cy, dz = z - cz;
    return sdRoundBox(dx * B[0] + dy * B[1] + dz * B[2], dx * B[3] + dy * B[4] + dz * B[5], dx * B[6] + dy * B[7] + dz * B[8], hx, hy, hz, r);
  };
  const m = Math.hypot(hx, hy, hz);
  p.bbox = [cx - m, cy - m, cz - m, cx + m, cy + m, cz + m];
  return p;
}

/** Custom function primitive: fn(x,y,z) -> distance; bbox [minx,miny,minz,maxx,maxy,maxz] */
export function custom(fn, bbox, o = {}) {
  const p = basePrim(o);
  p.kind = 'custom';
  p.eval = fn;
  p.bbox = bbox;
  return p;
}

// ---------------------------------------------------------------------------
// Grid evaluation
// ---------------------------------------------------------------------------
export class SDFGrid {
  /** min [x,y,z], max [x,y,z], h voxel size */
  constructor(min, max, h) {
    this.h = h;
    this.ox = min[0] - h * 2;
    this.oy = min[1] - h * 2;
    this.oz = min[2] - h * 2;
    this.nx = Math.ceil((max[0] - min[0]) / h) + 5;
    this.ny = Math.ceil((max[1] - min[1]) / h) + 5;
    this.nz = Math.ceil((max[2] - min[2]) / h) + 5;
    const N = this.nx * this.ny * this.nz;
    this.data = new Float32Array(N).fill(1);
    // ownership: which primitive "wins" the material (min d - bias) and which anatomical
    // primitive (region != null, mat 'skin') is nearest, per voxel
    this.mscore = new Float32Array(N).fill(1e9);
    this.mown = new Int16Array(N).fill(-1);
    this.rscore = new Float32Array(N).fill(1e9);
    this.rown = new Int16Array(N).fill(-1);
    this.sx = 1;
    this.sy = this.nx;
    this.sz = this.nx * this.ny;
  }

  /** Fold primitives into the grid. margin: extra evaluation band beyond k. */
  build(prims, margin = 0.04) {
    const { h, ox, oy, oz, nx, ny, nz, data, mscore, mown, rscore, rown } = this;
    this.prims = prims;
    for (let pi = 0; pi < prims.length; pi++) {
      const p = prims[pi];
      if (p.op === 'paint') continue;
      const bias = p.bias || 0;
      const isReg = p.region && p.mat === 'skin';
      const owns = p.op === 'add';
      const pad = p.k + margin;
      const bb = p.bbox;
      const i0 = Math.max(0, Math.floor((bb[0] - pad - ox) / h));
      const j0 = Math.max(0, Math.floor((bb[1] - pad - oy) / h));
      const k0 = Math.max(0, Math.floor((bb[2] - pad - oz) / h));
      const i1 = Math.min(nx - 1, Math.ceil((bb[3] + pad - ox) / h));
      const j1 = Math.min(ny - 1, Math.ceil((bb[4] + pad - oy) / h));
      const k1 = Math.min(nz - 1, Math.ceil((bb[5] + pad - oz) / h));
      const ev = p.eval;
      const kk = p.k;
      const op = p.op;
      // band-limited primitives (garment shells) only matter near the current surface
      const band = p.band;
      const bLo = band ? band[0] : -1e9, bHi = band ? band[1] : 1e9;
      for (let k = k0; k <= k1; k++) {
        const z = oz + k * h;
        for (let j = j0; j <= j1; j++) {
          const y = oy + j * h;
          let idx = i0 + j * nx + k * nx * ny;
          for (let i = i0; i <= i1; i++, idx++) {
            if (band) {
              const cur = data[idx];
              if (cur < bLo || cur > bHi) continue;
            }
            const x = ox + i * h;
            const d = ev(x, y, z);
            const g = data[idx];
            if (owns) {
              const sc = d - bias;
              if (sc < mscore[idx]) { mscore[idx] = sc; mown[idx] = pi; }
              if (isReg && d < rscore[idx]) { rscore[idx] = d; rown[idx] = pi; }
            }
            if (op === 'add') {
              if (kk <= 0) data[idx] = d < g ? d : g;
              else {
                const hh = Math.max(kk - Math.abs(g - d), 0) / kk;
                data[idx] = (d < g ? d : g) - hh * hh * kk * 0.25;
              }
            } else if (op === 'sub') {
              data[idx] = smax(g, -d, kk);
            } else if (op === 'inter') {
              data[idx] = smax(g, d, kk);
            }
          }
        }
      }
    }
    return this;
  }

  /** Owner primitives at the voxel nearest to a point: returns [matPrim, regionPrim] (may be null). */
  owners(x, y, z, out) {
    const { h, ox, oy, oz, nx, ny, nz } = this;
    let i = Math.round((x - ox) / h), j = Math.round((y - oy) / h), k = Math.round((z - oz) / h);
    i = i < 0 ? 0 : i >= nx ? nx - 1 : i;
    j = j < 0 ? 0 : j >= ny ? ny - 1 : j;
    k = k < 0 ? 0 : k >= nz ? nz - 1 : k;
    const idx = i + j * nx + k * nx * ny;
    const m = this.mown[idx], r = this.rown[idx];
    out[0] = m >= 0 ? this.prims[m] : null;
    out[1] = r >= 0 ? this.prims[r] : null;
    return out;
  }

  /** Trilinear sample of the field at a point. */
  sample(x, y, z) {
    const { h, ox, oy, oz, nx, ny, nz, data } = this;
    let fx = (x - ox) / h, fy = (y - oy) / h, fz = (z - oz) / h;
    if (fx < 0) fx = 0; else if (fx > nx - 1.001) fx = nx - 1.001;
    if (fy < 0) fy = 0; else if (fy > ny - 1.001) fy = ny - 1.001;
    if (fz < 0) fz = 0; else if (fz > nz - 1.001) fz = nz - 1.001;
    const i = fx | 0, j = fy | 0, k = fz | 0;
    const tx = fx - i, ty = fy - j, tz = fz - k;
    const sy = nx, sz = nx * ny;
    const b = i + j * sy + k * sz;
    const c000 = data[b], c100 = data[b + 1], c010 = data[b + sy], c110 = data[b + sy + 1];
    const c001 = data[b + sz], c101 = data[b + sz + 1], c011 = data[b + sz + sy], c111 = data[b + sz + sy + 1];
    const c00 = c000 + (c100 - c000) * tx, c10 = c010 + (c110 - c010) * tx;
    const c01 = c001 + (c101 - c001) * tx, c11 = c011 + (c111 - c011) * tx;
    const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty;
    return c0 + (c1 - c0) * tz;
  }

  /** Gradient (central differences on the trilinear field). out: array of 3 */
  gradient(x, y, z, out, e = this.h * 0.75) {
    out[0] = this.sample(x + e, y, z) - this.sample(x - e, y, z);
    out[1] = this.sample(x, y + e, z) - this.sample(x, y - e, z);
    out[2] = this.sample(x, y, z + e) - this.sample(x, y, z - e);
    const l = Math.hypot(out[0], out[1], out[2]) || 1;
    out[0] /= l; out[1] /= l; out[2] /= l;
    return out;
  }
}

/** Evaluate the exact composite field at a point (slow; for spot checks). */
export function evalPrims(prims, x, y, z) {
  let g = 1;
  for (const p of prims) {
    if (p.op === 'paint') continue;
    const d = p.eval(x, y, z);
    if (p.op === 'add') g = smin(g, d, p.k);
    else if (p.op === 'sub') g = smax(g, -d, p.k);
    else if (p.op === 'inter') g = smax(g, d, p.k);
  }
  return g;
}

/** Bounding box of all additive primitives. */
export function primsBounds(prims, pad = 0.02) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    if (p.op !== 'add') continue;
    for (let i = 0; i < 3; i++) {
      b[i] = Math.min(b[i], p.bbox[i] - pad);
      b[i + 3] = Math.max(b[i + 3], p.bbox[i + 3] + pad);
    }
  }
  return b;
}

/** Simple stable hash of a JSON-able value. */
export function hashKey(obj) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
