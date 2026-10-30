// SDF sculpting for non-human creatures (giant hand, animals, organs): an ordered stack of
// smooth-blended primitives -> dense grid -> naive surface nets (relaxed, re-projected onto the
// iso-surface, gradient normals) -> skin weights from primitive proximity (each primitive names
// the bone it belongs to, weights blend across the smooth unions) -> a THREE.SkinnedMesh-ready
// BufferGeometry + a rest-pose bone hierarchy. Results are cached per key (built once).
//
//   const S = new Sculpt({ cell: 0.02 });
//   S.capsule([0,0,0], [0,1,0], 0.1, 0.08, { bone: 'finger1', k: 0.03, tag: 1 });
//   const { geometry } = S.build({ bones, color: (x,y,z,nx,ny,nz,tag,ao) => [r,g,b] });
import * as THREE from 'three';

const { sqrt, min, max, abs, exp, hypot } = Math;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = max(k - abs(a - b), 0) / k;
  return min(a, b) - h * h * k * 0.25;
}
export const smax = (a, b, k) => -smin(-a, -b, k);

function sdEllipsoid(x, y, z, rx, ry, rz) {
  const ax = x / rx, ay = y / ry, az = z / rz;
  const k0 = sqrt(ax * ax + ay * ay + az * az);
  const bx = x / (rx * rx), by = y / (ry * ry), bz = z / (rz * rz);
  const k1 = sqrt(bx * bx + by * by + bz * bz);
  if (k1 < 1e-9) return -min(rx, ry, rz);
  return (k0 * (k0 - 1)) / k1;
}

/** Round cone between a (r1) and b (r2) — iq's exact distance. */
function sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  if (l2 < 1e-12) return hypot(px - ax, py - ay, pz - az) - max(r1, r2);
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
  if (Math.sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/** Orthonormal basis (columns X,Y,Z as 9 numbers) with Y along `axis`, Z near `hint`. */
export function basisY(axis, hint = [0, 0, 1]) {
  let [yx, yy, yz] = axis;
  let l = hypot(yx, yy, yz) || 1;
  yx /= l; yy /= l; yz /= l;
  let [zx, zy, zz] = hint;
  const d = zx * yx + zy * yy + zz * yz;
  zx -= yx * d; zy -= yy * d; zz -= yz * d;
  l = hypot(zx, zy, zz);
  if (l < 1e-6) { zx = 1; zy = 0; zz = 0; l = 1; }
  zx /= l; zy /= l; zz /= l;
  const xx = yy * zz - yz * zy, xy = yz * zx - yx * zz, xz = yx * zy - yy * zx;
  return [xx, xy, xz, yx, yy, yz, zx, zy, zz];
}

export class Sculpt {
  constructor(opts = {}) {
    this.cell = opts.cell ?? 0.02;
    this.prims = [];
  }
  _add(p, o) {
    p.op = o.op || 'add';
    p.k = o.k ?? this.cell * 2;
    p.bone = o.bone ?? null;
    p.tag = o.tag ?? 0;
    p.wk = o.wk ?? 1; // weight influence multiplier
    p.noW = !!o.noWeight;
    const m = p.k + this.cell * 2;
    p.bb[0] -= m; p.bb[1] -= m; p.bb[2] -= m; p.bb[3] += m; p.bb[4] += m; p.bb[5] += m;
    this.prims.push(p);
    return p;
  }
  sphere(c, r, o = {}) {
    const [cx, cy, cz] = c;
    return this._add({ eval: (x, y, z) => hypot(x - cx, y - cy, z - cz) - r, bb: [cx - r, cy - r, cz - r, cx + r, cy + r, cz + r] }, o);
  }
  /** Ellipsoid; o.basis = 9 numbers (local X,Y,Z axes as columns) or o.axis/o.hint. */
  ellipsoid(c, rad, o = {}) {
    const [cx, cy, cz] = c;
    const [rx, ry, rz] = rad;
    const B = o.basis || (o.axis ? basisY(o.axis, o.hint) : null);
    const m = max(rx, ry, rz);
    const ev = B
      ? (x, y, z) => {
          const dx = x - cx, dy = y - cy, dz = z - cz;
          return sdEllipsoid(dx * B[0] + dy * B[1] + dz * B[2], dx * B[3] + dy * B[4] + dz * B[5], dx * B[6] + dy * B[7] + dz * B[8], rx, ry, rz);
        }
      : (x, y, z) => sdEllipsoid(x - cx, y - cy, z - cz, rx, ry, rz);
    return this._add({ eval: ev, bb: B ? [cx - m, cy - m, cz - m, cx + m, cy + m, cz + m] : [cx - rx, cy - ry, cz - rz, cx + rx, cy + ry, cz + rz] }, o);
  }
  /** Tapered capsule a(r1) -> b(r2). o.flat = [sx, sz] squash across the axis (approximate). */
  capsule(a, b, r1, r2 = r1, o = {}) {
    const [ax, ay, az] = a, [bx, by, bz] = b;
    const R = max(r1, r2);
    let ev;
    if (o.flat) {
      // squash perpendicular to the axis in a local frame (Y = axis, Z = o.hint)
      const B = basisY([bx - ax, by - ay, bz - az], o.hint || [0, 0, 1]);
      const [sx, sz] = o.flat;
      const L = hypot(bx - ax, by - ay, bz - az);
      const sm = min(sx, sz, 1);
      ev = (x, y, z) => {
        const dx = x - ax, dy = y - ay, dz = z - az;
        const lx = (dx * B[0] + dy * B[1] + dz * B[2]) / sx, ly = dx * B[3] + dy * B[4] + dz * B[5], lz = (dx * B[6] + dy * B[7] + dz * B[8]) / sz;
        return sdRoundCone(lx, ly, lz, 0, 0, 0, 0, L, 0, r1, r2) * sm;
      };
    } else ev = (x, y, z) => sdRoundCone(x, y, z, ax, ay, az, bx, by, bz, r1, r2);
    const f = o.flat ? max(o.flat[0], o.flat[1], 1) : 1;
    return this._add({ eval: ev, bb: [min(ax, bx) - R * f, min(ay, by) - R * f, min(az, bz) - R * f, max(ax, bx) + R * f, max(ay, by) + R * f, max(az, bz) + R * f], a, b, r1, r2 }, o);
  }
  /** Chain of tapered capsules through points with radii (one bone per segment or a bones list). */
  chain(points, radii, o = {}) {
    for (let i = 0; i < points.length - 1; i++) {
      const bone = Array.isArray(o.bones) ? o.bones[Math.min(i, o.bones.length - 1)] : o.bone;
      this.capsule(points[i], points[i + 1], radii[i], radii[i + 1], { ...o, bone });
    }
  }
  /** Rounded box (axis aligned, centred at c, half extents h). */
  box(c, h, r = 0, o = {}) {
    const [cx, cy, cz] = c, [hx, hy, hz] = h;
    const ev = (x, y, z) => {
      const qx = abs(x - cx) - hx + r, qy = abs(y - cy) - hy + r, qz = abs(z - cz) - hz + r;
      return hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, max(qy, qz)), 0) - r;
    };
    return this._add({ eval: ev, bb: [cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz] }, o);
  }
  /** Generic custom SDF with a bbox. */
  custom(fn, bb, o = {}) {
    return this._add({ eval: fn, bb: bb.slice() }, o);
  }
  /** Surface detail: displacement d(x,y,z) (metres, + = outward) added within the bbox. */
  displace(fn, bb = null) {
    this.disp = { fn, bb };
  }

  /**
   * Mesh + skin. opts: { bones: [{name, parent, pos:[x,y,z]}], color(x,y,z,nx,ny,nz,tag,ao)->[r,g,b],
   *   relax=2, sigma (weight falloff, m; default 2.5 cells), maxBones=4 }
   * Returns { geometry, boneDefs, stats }.
   */
  build(opts = {}) {
    const t0 = performance.now();
    const cell = this.cell;
    const add = this.prims.filter((p) => p.op === 'add');
    const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const p of add) for (let i = 0; i < 3; i++) { bb[i] = min(bb[i], p.bb[i]); bb[i + 3] = max(bb[i + 3], p.bb[i + 3]); }
    const pad = cell * 3;
    const ox = bb[0] - pad, oy = bb[1] - pad, oz = bb[2] - pad;
    const nx = Math.ceil((bb[3] - bb[0] + pad * 2) / cell) + 1;
    const ny = Math.ceil((bb[4] - bb[1] + pad * 2) / cell) + 1;
    const nz = Math.ceil((bb[5] - bb[2] + pad * 2) / cell) + 1;
    const N = nx * ny * nz;
    const data = new Float32Array(N).fill(cell * 4);
    const sy = nx, sz = nx * ny;
    // ---- evaluate the stack
    for (const p of this.prims) {
      const i0 = Math.max(0, Math.floor((p.bb[0] - ox) / cell)), i1 = Math.min(nx - 1, Math.ceil((p.bb[3] - ox) / cell));
      const j0 = Math.max(0, Math.floor((p.bb[1] - oy) / cell)), j1 = Math.min(ny - 1, Math.ceil((p.bb[4] - oy) / cell));
      const k0 = Math.max(0, Math.floor((p.bb[2] - oz) / cell)), k1 = Math.min(nz - 1, Math.ceil((p.bb[5] - oz) / cell));
      const k = p.k, sub = p.op === 'sub', inter = p.op === 'inter';
      for (let kk = k0; kk <= k1; kk++) {
        const z = oz + kk * cell;
        for (let j = j0; j <= j1; j++) {
          const y = oy + j * cell;
          let idx = i0 + j * sy + kk * sz;
          for (let i = i0; i <= i1; i++, idx++) {
            const x = ox + i * cell;
            const d = p.eval(x, y, z);
            const cur = data[idx];
            data[idx] = sub ? smax(cur, -d, k) : inter ? smax(cur, d, k) : smin(cur, d, k);
          }
        }
      }
    }
    if (this.disp) {
      const { fn } = this.disp;
      for (let kk = 0; kk < nz; kk++) for (let j = 0; j < ny; j++) {
        let idx = j * sy + kk * sz;
        for (let i = 0; i < nx; i++, idx++) {
          const d = data[idx];
          if (d > cell * 3 || d < -cell * 3) continue;
          data[idx] = d - fn(ox + i * cell, oy + j * cell, oz + kk * cell);
        }
      }
    }
    const grid = { nx, ny, nz, data, h: cell, ox, oy, oz };
    grid.sample = (x, y, z) => sampleGrid(grid, x, y, z);
    // ---- mesh
    const mesh = surfaceNets(grid);
    relaxAndProject(mesh, grid, opts.relax ?? 2);
    const vc = mesh.count;
    const P = mesh.positions;
    const nrm = new Float32Array(vc * 3);
    const g3 = [0, 0, 0];
    for (let v = 0; v < vc; v++) {
      gradient(grid, P[v * 3], P[v * 3 + 1], P[v * 3 + 2], g3);
      nrm[v * 3] = g3[0]; nrm[v * 3 + 1] = g3[1]; nrm[v * 3 + 2] = g3[2];
    }
    // face-normal sanity blend (sharp creases)
    blendFaceNormals(mesh, nrm, 0.35);
    // ---- skin weights + tags (nearest primitive)
    const boneDefs = opts.bones || [];
    const boneIndex = new Map(boneDefs.map((b, i) => [b.name, i]));
    const sigma = opts.sigma ?? cell * 2.5;
    const maxB = opts.maxBones ?? 4;
    const skinI = new Uint16Array(vc * 4), skinW = new Float32Array(vc * 4);
    const tags = new Uint8Array(vc);
    const colors = opts.color ? new Float32Array(vc * 3) : null;
    const acc = new Float32Array(boneDefs.length);
    const touched = [];
    for (let v = 0; v < vc; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      let dmin = Infinity, tag = 0;
      const ds = [];
      for (const p of add) {
        if (x < p.bb[0] || y < p.bb[1] || z < p.bb[2] || x > p.bb[3] || y > p.bb[4] || z > p.bb[5]) continue;
        const d = p.eval(x, y, z);
        ds.push(d, p);
        if (d < dmin) { dmin = d; tag = p.tag; }
      }
      tags[v] = tag;
      touched.length = 0;
      let tot = 0;
      for (let q = 0; q < ds.length; q += 2) {
        const p = ds[q + 1];
        if (p.bone == null || p.noW) continue;
        const bi = boneIndex.get(p.bone);
        if (bi === undefined) continue;
        const w = exp(-(ds[q] - dmin) / Math.max(1e-4, sigma * p.wk)) ;
        if (w < 1e-3) continue;
        if (acc[bi] === 0) touched.push(bi);
        acc[bi] += w;
        tot += w;
      }
      touched.sort((a, b) => acc[b] - acc[a]);
      let wsum = 0;
      for (let q = 0; q < maxB; q++) {
        if (q < touched.length) { skinI[v * 4 + q] = touched[q]; skinW[v * 4 + q] = acc[touched[q]]; wsum += acc[touched[q]]; }
      }
      if (wsum <= 0) { skinI[v * 4] = 0; skinW[v * 4] = 1; wsum = 1; }
      for (let q = 0; q < 4; q++) skinW[v * 4 + q] /= wsum;
      for (const bi of touched) acc[bi] = 0;
      void tot;
    }
    // ---- AO (cheap SDF probe) + colours
    const ao = new Float32Array(vc);
    for (let v = 0; v < vc; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      const ax = nrm[v * 3], ay = nrm[v * 3 + 1], az = nrm[v * 3 + 2];
      let occ = 0, w = 1, ws = 0;
      for (const s of [1.5, 3, 6, 10]) {
        const st = s * cell;
        const d = sampleGrid(grid, x + ax * st, y + ay * st, z + az * st);
        occ += (max(0, st - d) / st) * w;
        ws += w;
        w *= 0.7;
      }
      ao[v] = clamp01(1 - (occ / ws) * 1.6);
    }
    if (colors) {
      for (let v = 0; v < vc; v++) {
        const c = opts.color(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2], tags[v], ao[v]);
        colors[v * 3] = c[0]; colors[v * 3 + 1] = c[1]; colors[v * 3 + 2] = c[2];
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    // planar fallback uv (the creature material samples rest-space triplanar instead)
    const uv = new Float32Array(vc * 2);
    for (let v = 0; v < vc; v++) { uv[v * 2] = P[v * 3] + P[v * 3 + 2] * 0.5; uv[v * 2 + 1] = P[v * 3 + 1]; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (colors) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
    if (boneDefs.length) {
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinI, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinW, 4));
    }
    geo.setIndex(new THREE.BufferAttribute(vc > 65535 ? mesh.indices : new Uint16Array(mesh.indices), 1));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.userData.shared = true;
    return { geometry: geo, boneDefs, tags, stats: { verts: vc, tris: mesh.indices.length / 3, ms: performance.now() - t0, grid: [nx, ny, nz] } };
  }
}

// ---------------------------------------------------------------------------------------- grid
function sampleGrid(g, x, y, z) {
  const fx = (x - g.ox) / g.h, fy = (y - g.oy) / g.h, fz = (z - g.oz) / g.h;
  let i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
  if (i < 0 || j < 0 || k < 0 || i >= g.nx - 1 || j >= g.ny - 1 || k >= g.nz - 1) return g.h * 4;
  const tx = fx - i, ty = fy - j, tz = fz - k;
  const sy = g.nx, sz = g.nx * g.ny, d = g.data;
  const b = i + j * sy + k * sz;
  const c00 = d[b] + (d[b + 1] - d[b]) * tx;
  const c10 = d[b + sy] + (d[b + sy + 1] - d[b + sy]) * tx;
  const c01 = d[b + sz] + (d[b + sz + 1] - d[b + sz]) * tx;
  const c11 = d[b + sy + sz] + (d[b + sy + sz + 1] - d[b + sy + sz]) * tx;
  const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty;
  return c0 + (c1 - c0) * tz;
}
function gradient(g, x, y, z, out) {
  const e = g.h * 0.75;
  const gx = sampleGrid(g, x + e, y, z) - sampleGrid(g, x - e, y, z);
  const gy = sampleGrid(g, x, y + e, z) - sampleGrid(g, x, y - e, z);
  const gz = sampleGrid(g, x, y, z + e) - sampleGrid(g, x, y, z - e);
  const l = hypot(gx, gy, gz) || 1;
  out[0] = gx / l; out[1] = gy / l; out[2] = gz / l;
  return out;
}

const CUBE_EDGES = [0, 1, 0, 2, 0, 4, 1, 3, 1, 5, 2, 3, 2, 6, 3, 7, 4, 5, 4, 6, 5, 7, 6, 7];
const CXYZ = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1];

function surfaceNets(g) {
  const { nx, ny, nz, data, h, ox, oy, oz } = g;
  const sy = nx, sz = nx * ny;
  const vmap = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const off = [0, 1, sy, sy + 1, sz, sz + 1, sz + sy, sz + sy + 1];
  const vals = new Float32Array(8);
  let vc = 0;
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) {
    let idx = j * sy + k * sz;
    for (let i = 0; i < nx - 1; i++, idx++) {
      const d0 = data[idx];
      if (d0 > h * 2 || d0 < -h * 2) continue;
      let mask = 0;
      for (let c = 0; c < 8; c++) { const v = data[idx + off[c]]; vals[c] = v; if (v < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, s2 = 0, s3 = 0, n = 0;
      for (let e = 0; e < 24; e += 2) {
        const a = CUBE_EDGES[e], b = CUBE_EDGES[e + 1];
        const va = vals[a], vb = vals[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        sx += CXYZ[a * 3] + (CXYZ[b * 3] - CXYZ[a * 3]) * t;
        s2 += CXYZ[a * 3 + 1] + (CXYZ[b * 3 + 1] - CXYZ[a * 3 + 1]) * t;
        s3 += CXYZ[a * 3 + 2] + (CXYZ[b * 3 + 2] - CXYZ[a * 3 + 2]) * t;
        n++;
      }
      pos.push(ox + (i + sx / n) * h, oy + (j + s2 / n) * h, oz + (k + s3 / n) * h);
      vmap[idx] = vc++;
    }
  }
  const tris = [];
  const P = pos;
  const d2 = (a, b) => (P[a * 3] - P[b * 3]) ** 2 + (P[a * 3 + 1] - P[b * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[b * 3 + 2]) ** 2;
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const shortAC = d2(a, c) < d2(b, d);
    if (!flip) {
      if (shortAC) tris.push(a, b, c, a, c, d);
      else tris.push(a, b, d, b, c, d);
    } else if (shortAC) tris.push(a, c, b, a, d, c);
    else tris.push(a, d, b, b, d, c);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) {
    let idx = 1 + j * sy + k * sz;
    for (let i = 1; i < nx - 1; i++, idx++) {
      const inside = data[idx] < 0;
      if ((data[idx + 1] < 0) !== inside) quad(vmap[idx - sy - sz], vmap[idx - sz], vmap[idx], vmap[idx - sy], !inside);
      if ((data[idx + sy] < 0) !== inside) quad(vmap[idx - 1 - sz], vmap[idx - sz], vmap[idx], vmap[idx - 1], inside);
      if ((data[idx + sz] < 0) !== inside) quad(vmap[idx - 1 - sy], vmap[idx - sy], vmap[idx], vmap[idx - 1], !inside);
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(tris), count: vc };
}

function adjacency(mesh) {
  const { indices, count } = mesh;
  const sets = Array.from({ length: count }, () => []);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    sets[a].push(b, c); sets[b].push(a, c); sets[c].push(a, b);
  }
  return sets.map((s) => Array.from(new Set(s)));
}

function relaxAndProject(mesh, grid, iters) {
  const P = mesh.positions, vc = mesh.count;
  const adj = (mesh.adj = adjacency(mesh));
  const g = [0, 0, 0];
  const np = new Float32Array(P.length);
  for (let it = 0; it < iters; it++) {
    for (let v = 0; v < vc; v++) {
      const nb = adj[v];
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      if (!nb.length) { np[v * 3] = x; np[v * 3 + 1] = y; np[v * 3 + 2] = z; continue; }
      let ax = 0, ay = 0, az = 0;
      for (const u of nb) { ax += P[u * 3]; ay += P[u * 3 + 1]; az += P[u * 3 + 2]; }
      let dx = ax / nb.length - x, dy = ay / nb.length - y, dz = az / nb.length - z;
      gradient(grid, x, y, z, g);
      const dn = dx * g[0] + dy * g[1] + dz * g[2];
      dx -= dn * g[0]; dy -= dn * g[1]; dz -= dn * g[2];
      np[v * 3] = x + dx * 0.6; np[v * 3 + 1] = y + dy * 0.6; np[v * 3 + 2] = z + dz * 0.6;
    }
    P.set(np);
  }
  for (let it = 0; it < 2; it++) {
    for (let v = 0; v < vc; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      const d = sampleGrid(grid, x, y, z);
      gradient(grid, x, y, z, g);
      const s = Math.max(-grid.h, Math.min(grid.h, d));
      P[v * 3] = x - g[0] * s; P[v * 3 + 1] = y - g[1] * s; P[v * 3 + 2] = z - g[2] * s;
    }
  }
}

function blendFaceNormals(mesh, nrm, w) {
  const P = mesh.positions, I = mesh.indices, vc = mesh.count;
  const fn = new Float32Array(vc * 3);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { fn[q] += nx; fn[q + 1] += ny; fn[q + 2] += nz; }
  }
  for (let v = 0; v < vc; v++) {
    const l = hypot(fn[v * 3], fn[v * 3 + 1], fn[v * 3 + 2]) || 1;
    const fx = fn[v * 3] / l, fy = fn[v * 3 + 1] / l, fz = fn[v * 3 + 2] / l;
    if (fx * nrm[v * 3] + fy * nrm[v * 3 + 1] + fz * nrm[v * 3 + 2] < 0.2) continue;
    let x = nrm[v * 3] * (1 - w) + fx * w, y = nrm[v * 3 + 1] * (1 - w) + fy * w, z = nrm[v * 3 + 2] * (1 - w) + fz * w;
    const m = hypot(x, y, z) || 1;
    nrm[v * 3] = x / m; nrm[v * 3 + 1] = y / m; nrm[v * 3 + 2] = z / m;
  }
}

// ---------------------------------------------------------------------------------------- rig
/**
 * Bone hierarchy from rest positions (identity rest rotations). defs [{name, parent, pos}] in
 * mesh space. Returns { root (first parentless bone), bones[], byName, skeleton (after bind) }.
 */
export function buildRig(defs) {
  const bones = [], byName = {};
  for (const d of defs) {
    const b = new THREE.Bone();
    b.name = d.name;
    byName[d.name] = b;
    bones.push(b);
  }
  const roots = [];
  defs.forEach((d, i) => {
    const b = bones[i];
    const p = d.parent ? defs.find((x) => x.name === d.parent) : null;
    if (p) {
      b.position.set(d.pos[0] - p.pos[0], d.pos[1] - p.pos[1], d.pos[2] - p.pos[2]);
      byName[d.parent].add(b);
    } else {
      b.position.set(d.pos[0], d.pos[1], d.pos[2]);
      roots.push(b);
    }
    b.userData.rest = b.position.clone();
  });
  return { bones, byName, roots };
}

/** SkinnedMesh with the rig bound in rest pose (mesh at the origin while binding). */
export function skinnedMesh(geometry, material, defs) {
  const rig = buildRig(defs);
  const mesh = new THREE.SkinnedMesh(geometry, material);
  for (const r of rig.roots) mesh.add(r);
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(rig.bones);
  mesh.bind(skeleton);
  mesh.frustumCulled = false;
  rig.skeleton = skeleton;
  return { mesh, rig };
}

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
const _ma = new THREE.Matrix4(), _mb = new THREE.Matrix4();

/**
 * Rotate `bone` (rest rotation identity) so its child (rest offset `childRest`, local) points at
 * world direction `dir`, with the bone's rest `restUp` (local) turned toward world `up`.
 */
export function aimBone(bone, childRest, dir, up, restUp = null) {
  const parent = bone.parent;
  parent.updateWorldMatrix(true, false);
  parent.matrixWorld.decompose(_va, _qa, _vb);
  // rest frame (in parent space): Y' = childRest, Z' = restUp
  const r0 = _ma.makeBasis(..._basis(childRest, restUp || _defUp(childRest)));
  // target frame in parent space
  const invP = _qb.copy(_qa).invert();
  const d = _vc.copy(dir).applyQuaternion(invP).normalize();
  const u = _va.copy(up).applyQuaternion(invP).normalize();
  const r1 = _mb.makeBasis(..._basis(d, u));
  r1.multiply(r0.invert());
  bone.quaternion.setFromRotationMatrix(r1);
}
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
function _basis(y, zHint) {
  _by.copy(y).normalize();
  _bz.copy(zHint).addScaledVector(_by, -zHint.dot(_by));
  if (_bz.lengthSq() < 1e-8) _bz.set(_by.y, _by.z, _by.x).addScaledVector(_by, -_by.dot(_bz));
  _bz.normalize();
  _bx.crossVectors(_by, _bz);
  return [_bx.clone(), _by.clone(), _bz.clone()];
}
function _defUp(v) {
  return Math.abs(v.y) > 0.9 * v.length() ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
}

/**
 * Two-bone IK on a rest-identity chain A->B->C. target (world), pole (world point the middle joint
 * bends toward). Lengths from the rest offsets. Works for animal legs, arms, fingers.
 */
export function solveTwoBoneIK(A, B, C, target, pole, restUpA = null, restUpB = null) {
  const la = B.userData.rest.length(), lb = C.userData.rest.length();
  A.updateWorldMatrix(true, false);
  const pa = _va.setFromMatrixPosition(A.matrixWorld).clone();
  const toT = new THREE.Vector3().subVectors(target, pa);
  let dist = toT.length();
  const maxR = (la + lb) * 0.999, minR = Math.abs(la - lb) * 1.01 + 1e-4;
  dist = Math.min(maxR, Math.max(minR, dist));
  toT.normalize();
  // bend plane from the pole
  const toP = new THREE.Vector3().subVectors(pole, pa);
  const bendN = toP.addScaledVector(toT, -toP.dot(toT));
  if (bendN.lengthSq() < 1e-8) bendN.set(0, 1, 0).addScaledVector(toT, -toT.y);
  bendN.normalize();
  const cosA = (la * la + dist * dist - lb * lb) / (2 * la * dist);
  const angA = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const knee = pa.clone().addScaledVector(toT, Math.cos(angA) * la).addScaledVector(bendN, Math.sin(angA) * la);
  const endP = pa.clone().addScaledVector(toT, dist);
  const dirA = knee.clone().sub(pa).normalize();
  const dirB = endP.clone().sub(knee).normalize();
  aimBone(A, B.userData.rest, dirA, bendN, restUpA);
  A.updateWorldMatrix(false, false);
  aimBone(B, C.userData.rest, dirB, bendN, restUpB);
  return knee;
}
