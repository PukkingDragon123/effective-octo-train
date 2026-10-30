// Tiny signed-distance sculpting kit + surface-nets mesher for organic props
// (statues, figurines, lions, naga heads). Results are cached per key, so each sculpt
// is meshed once per session no matter how many props use it.
import * as THREE from 'three';
import { fixWinding } from './kit.js';

const { hypot, max, min, abs, sqrt } = Math;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Polynomial smooth union. */
export function smin(a, b, k) {
  if (k <= 0) return min(a, b);
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return b + (a - b) * h - k * h * (1 - h);
}
/** Smooth subtraction of b from a. */
export function ssub(a, b, k) {
  return -smin(-a, b, k);
}
/** Smooth intersection. */
export function sint(a, b, k) {
  return -smin(-a, -b, k);
}

export function sphere(x, y, z, cx, cy, cz, r) {
  return hypot(x - cx, y - cy, z - cz) - r;
}
export function ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = hypot(px, py, pz);
  const k1 = hypot(px / rx, py / ry, pz / rz);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -min(rx, ry, rz);
}
/** Round cone / tapered capsule from a (radius ra) to b (radius rb). */
export function capsule(x, y, z, ax, ay, az, bx, by, bz, ra, rb = ra) {
  const pax = x - ax, pay = y - ay, paz = z - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const bb = bax * bax + bay * bay + baz * baz || 1e-9;
  const h = clamp01((pax * bax + pay * bay + paz * baz) / bb);
  return hypot(pax - bax * h, pay - bay * h, paz - baz * h) - (ra + (rb - ra) * h);
}
/** Axis-aligned rounded box centred at c with half extents h and rounding r. */
export function rbox(x, y, z, cx, cy, cz, hx, hy, hz, r = 0) {
  const qx = abs(x - cx) - hx + r, qy = abs(y - cy) - hy + r, qz = abs(z - cz) - hz + r;
  return hypot(max(qx, 0), max(qy, 0), max(qz, 0)) + min(max(qx, max(qy, qz)), 0) - r;
}
/** Torus around Y at c. */
export function torusY(x, y, z, cx, cy, cz, R, r) {
  const q = hypot(x - cx, z - cz) - R;
  return hypot(q, y - cy) - r;
}
/** Vertical cylinder (capped) centred at c. */
export function cylY(x, y, z, cx, cy, cz, r, hh) {
  const dx = hypot(x - cx, z - cz) - r, dy = abs(y - cy) - hh;
  return min(max(dx, dy), 0) + hypot(max(dx, 0), max(dy, 0));
}

/**
 * Mesh an SDF with surface nets.
 * sdf(x,y,z) -> distance; bounds [minX,minY,minZ,maxX,maxY,maxZ]; cell size.
 * opts.color(x,y,z,nx,ny,nz,out:Color) paints vertex colours (sRGB-free linear Color).
 * opts.smooth: number of Laplacian smoothing passes (default 1).
 * Returns indexed BufferGeometry (position, normal, uv(zero), color).
 */
export function meshSDF(sdf, bounds, cell, opts = {}) {
  const [x0, y0, z0, x1, y1, z1] = bounds;
  const nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
  const N = nx * ny * nz;
  const vals = new Float32Array(N);
  let i = 0;
  for (let k = 0; k < nz; k++) {
    const z = z0 + k * cell;
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * cell;
      for (let ii = 0; ii < nx; ii++, i++) vals[i] = sdf(x0 + ii * cell, y, z);
    }
  }
  const vidx = new Int32Array(N).fill(-1);
  const pos = [];
  const sx = 1, sy = nx, sz = nx * ny;
  const corner = [0, sx, sy, sx + sy, sz, sz + sx, sz + sy, sz + sx + sy];
  const cOff = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let ii = 0; ii < nx - 1; ii++) {
        const base = ii + j * sy + k * sz;
        let mask = 0;
        for (let c = 0; c < 8; c++) if (vals[base + corner[c]] < 0) mask |= 1 << c;
        if (mask === 0 || mask === 255) continue;
        let ax = 0, ay = 0, az = 0, cnt = 0;
        for (const [a, b] of edges) {
          const va = vals[base + corner[a]], vb = vals[base + corner[b]];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          const oa = cOff[a], ob = cOff[b];
          ax += oa[0] + (ob[0] - oa[0]) * t;
          ay += oa[1] + (ob[1] - oa[1]) * t;
          az += oa[2] + (ob[2] - oa[2]) * t;
          cnt++;
        }
        vidx[base] = pos.length / 3;
        pos.push(x0 + (ii + ax / cnt) * cell, y0 + (j + ay / cnt) * cell, z0 + (k + az / cnt) * cell);
      }
    }
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let ii = 0; ii < nx; ii++) {
        const p = ii + j * sy + k * sz;
        const inside = vals[p] < 0;
        if (ii < nx - 1 && j > 0 && k > 0 && inside !== vals[p + sx] < 0) {
          quad(vidx[p - sy - sz], vidx[p - sz], vidx[p], vidx[p - sy], inside);
        }
        if (j < ny - 1 && ii > 0 && k > 0 && inside !== vals[p + sy] < 0) {
          quad(vidx[p - sx - sz], vidx[p - sx], vidx[p], vidx[p - sz], inside);
        }
        if (k < nz - 1 && ii > 0 && j > 0 && inside !== vals[p + sz] < 0) {
          quad(vidx[p - sx - sy], vidx[p - sy], vidx[p], vidx[p - sx], inside);
        }
      }
    }
  }
  const nv = pos.length / 3;
  // light Laplacian smoothing (keeps the painterly soft-clay look, removes grid terraces)
  const passes = opts.smooth ?? 1;
  if (passes > 0) {
    const nbr = Array.from({ length: nv }, () => []);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      nbr[a].push(b, c);
      nbr[b].push(a, c);
      nbr[c].push(a, b);
    }
    let cur = Float32Array.from(pos);
    for (let s = 0; s < passes; s++) {
      const nxt = new Float32Array(cur.length);
      for (let v = 0; v < nv; v++) {
        const L = nbr[v];
        if (!L.length) {
          nxt[v * 3] = cur[v * 3];
          nxt[v * 3 + 1] = cur[v * 3 + 1];
          nxt[v * 3 + 2] = cur[v * 3 + 2];
          continue;
        }
        let sx2 = 0, sy2 = 0, sz2 = 0;
        for (const q of L) {
          sx2 += cur[q * 3];
          sy2 += cur[q * 3 + 1];
          sz2 += cur[q * 3 + 2];
        }
        const w = 0.5;
        nxt[v * 3] = cur[v * 3] * (1 - w) + (sx2 / L.length) * w;
        nxt[v * 3 + 1] = cur[v * 3 + 1] * (1 - w) + (sy2 / L.length) * w;
        nxt[v * 3 + 2] = cur[v * 3 + 2] * (1 - w) + (sz2 / L.length) * w;
      }
      cur = nxt;
    }
    for (let v = 0; v < pos.length; v++) pos[v] = cur[v];
  }
  const nor = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const e = cell * 0.5;
  const c = new THREE.Color();
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z);
    let gy = sdf(x, y + e, z) - sdf(x, y - e, z);
    let gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = sqrt(gx * gx + gy * gy + gz * gz) || 1;
    gx /= l;
    gy /= l;
    gz /= l;
    nor[v * 3] = gx;
    nor[v * 3 + 1] = gy;
    nor[v * 3 + 2] = gz;
    c.setRGB(1, 1, 1);
    if (opts.color) opts.color(x, y, z, gx, gy, gz, c);
    col[v * 3] = c.r;
    col[v * 3 + 1] = c.g;
    col[v * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  fixWinding(g);
  g.computeBoundingSphere();
  return g;
}

const cache = new Map();
/** Cached meshSDF: same key -> same geometry. */
export function sculpt(key, sdf, bounds, cell, opts) {
  let g = cache.get(key);
  if (!g) {
    g = meshSDF(sdf, bounds, cell, opts);
    cache.set(key, g);
  }
  return g;
}

/** sRGB hex -> linear THREE.Color helper for colour functions. */
export function C(hex) {
  return new THREE.Color(hex);
}
