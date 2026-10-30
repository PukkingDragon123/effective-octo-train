// Surface nets mesher for SDFGrid (naive surface nets, Lysenko style), with
// tangential relaxation, re-projection onto the iso-surface, gradient normals
// and SDF ambient occlusion. Produces an indexed mesh (shared, welded vertices).

const CUBE_EDGES = new Int32Array([
  0, 1, 0, 2, 0, 4, 1, 3, 1, 5, 2, 3, 2, 6, 3, 7, 4, 5, 4, 6, 5, 7, 6, 7,
]);

/**
 * Mesh the grid. Returns { positions: Float32Array, normals: Float32Array, indices: Uint32Array, count }.
 * opts: { relax: iterations of tangential smoothing (default 2), project: newton steps (default 2), clip?: fn(x,y,z)->bool keep }
 */
export function surfaceNets(grid, opts = {}) {
  const { nx, ny, nz, data, h, ox, oy, oz } = grid;
  const sy = nx, sz = nx * ny;
  const vmap = new Int32Array(nx * ny * nz).fill(-1);
  let pos = new Float32Array(1024 * 3);
  let vcount = 0;
  const cornerOff = [0, 1, sy, sy + 1, sz, sz + 1, sz + sy, sz + sy + 1];
  const cornerXYZ = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1];
  const vals = new Float32Array(8);

  // 1. vertices
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      let idx = j * sy + k * sz;
      for (let i = 0; i < nx - 1; i++, idx++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = data[idx + cornerOff[c]];
          vals[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, syy = 0, szz = 0, n = 0;
        for (let e = 0; e < 12; e++) {
          const a = CUBE_EDGES[e * 2], b = CUBE_EDGES[e * 2 + 1];
          const va = vals[a], vb = vals[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          sx += cornerXYZ[a * 3] + (cornerXYZ[b * 3] - cornerXYZ[a * 3]) * t;
          syy += cornerXYZ[a * 3 + 1] + (cornerXYZ[b * 3 + 1] - cornerXYZ[a * 3 + 1]) * t;
          szz += cornerXYZ[a * 3 + 2] + (cornerXYZ[b * 3 + 2] - cornerXYZ[a * 3 + 2]) * t;
          n++;
        }
        if (vcount * 3 + 3 > pos.length) {
          const np = new Float32Array(pos.length * 2);
          np.set(pos);
          pos = np;
        }
        pos[vcount * 3] = ox + (i + sx / n) * h;
        pos[vcount * 3 + 1] = oy + (j + syy / n) * h;
        pos[vcount * 3 + 2] = oz + (k + szz / n) * h;
        vmap[idx] = vcount++;
      }
    }
  }

  // 2. faces: for each grid edge with a sign change, a quad between the 4 adjacent cells
  let tris = new Uint32Array(4096 * 3);
  let tcount = 0;
  const pushTri = (a, b, c) => {
    if (tcount * 3 + 3 > tris.length) {
      const nt = new Uint32Array(tris.length * 2);
      nt.set(tris);
      tris = nt;
    }
    tris[tcount * 3] = a;
    tris[tcount * 3 + 1] = b;
    tris[tcount * 3 + 2] = c;
    tcount++;
  };
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // split along the shorter diagonal
    const d1 = dist2(pos, a, c), d2 = dist2(pos, b, d);
    if (!flip) {
      if (d1 < d2) { pushTri(a, b, c); pushTri(a, c, d); }
      else { pushTri(a, b, d); pushTri(b, c, d); }
    } else {
      if (d1 < d2) { pushTri(a, c, b); pushTri(a, d, c); }
      else { pushTri(a, d, b); pushTri(b, d, c); }
    }
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      let idx = 1 + j * sy + k * sz;
      for (let i = 1; i < nx - 1; i++, idx++) {
        const v0 = data[idx];
        const inside = v0 < 0;
        // x edge: idx -> idx+1 ; cells sharing it: (i, j-1..j, k-1..k)
        if (i < nx - 1 && (data[idx + 1] < 0) !== inside) {
          quad(vmap[idx - sy - sz], vmap[idx - sz], vmap[idx], vmap[idx - sy], !inside);
        }
        if (j < ny - 1 && (data[idx + sy] < 0) !== inside) {
          quad(vmap[idx - 1 - sz], vmap[idx - sz], vmap[idx], vmap[idx - 1], inside);
        }
        if (k < nz - 1 && (data[idx + sz] < 0) !== inside) {
          quad(vmap[idx - 1 - sy], vmap[idx - sy], vmap[idx], vmap[idx - 1], !inside);
        }
      }
    }
  }
  pos = pos.slice(0, vcount * 3);
  let indices = tris.slice(0, tcount * 3);

  // optional clipping of vertices (drop triangles touching removed verts)
  if (opts.clip) {
    const keep = new Uint8Array(vcount);
    for (let v = 0; v < vcount; v++) keep[v] = opts.clip(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) ? 1 : 0;
    const out = [];
    for (let t = 0; t < tcount; t++) {
      const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
      if (keep[a] && keep[b] && keep[c]) out.push(a, b, c);
    }
    const remap = new Int32Array(vcount).fill(-1);
    let nv = 0;
    for (const v of out) if (remap[v] < 0) remap[v] = nv++;
    const np = new Float32Array(nv * 3);
    for (let v = 0; v < vcount; v++) if (remap[v] >= 0) np.set(pos.subarray(v * 3, v * 3 + 3), remap[v] * 3);
    indices = new Uint32Array(out.map((v) => remap[v]));
    pos = np;
    vcount = nv;
  }

  const mesh = { positions: pos, indices, count: vcount, normals: new Float32Array(vcount * 3) };
  const adj = buildAdjacency(mesh);
  mesh.adj = adj;
  const g = [0, 0, 0];
  const relax = opts.relax ?? 2;
  const project = opts.project ?? 2;
  for (let it = 0; it < relax; it++) {
    // tangential laplacian: move toward neighbour average, remove the normal component
    const np = new Float32Array(pos.length);
    for (let v = 0; v < vcount; v++) {
      const s = adj.offsets[v], e = adj.offsets[v + 1];
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      if (e === s) { np[v * 3] = x; np[v * 3 + 1] = y; np[v * 3 + 2] = z; continue; }
      let ax = 0, ay = 0, az = 0;
      for (let q = s; q < e; q++) {
        const u = adj.list[q];
        ax += pos[u * 3]; ay += pos[u * 3 + 1]; az += pos[u * 3 + 2];
      }
      const n = e - s;
      let dx = ax / n - x, dy = ay / n - y, dz = az / n - z;
      grid.gradient(x, y, z, g);
      const dn = dx * g[0] + dy * g[1] + dz * g[2];
      dx -= dn * g[0]; dy -= dn * g[1]; dz -= dn * g[2];
      np[v * 3] = x + dx * 0.6;
      np[v * 3 + 1] = y + dy * 0.6;
      np[v * 3 + 2] = z + dz * 0.6;
    }
    pos.set(np);
  }
  for (let it = 0; it < project; it++) {
    for (let v = 0; v < vcount; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const d = grid.sample(x, y, z);
      grid.gradient(x, y, z, g);
      const s = Math.max(-h, Math.min(h, d));
      pos[v * 3] = x - g[0] * s;
      pos[v * 3 + 1] = y - g[1] * s;
      pos[v * 3 + 2] = z - g[2] * s;
    }
  }
  computeNormals(mesh, grid);
  return mesh;
}

function dist2(p, a, b) {
  const dx = p[a * 3] - p[b * 3], dy = p[a * 3 + 1] - p[b * 3 + 1], dz = p[a * 3 + 2] - p[b * 3 + 2];
  return dx * dx + dy * dy + dz * dz;
}

/** CSR vertex adjacency from triangles. */
export function buildAdjacency(mesh) {
  const { indices, count } = mesh;
  const deg = new Int32Array(count);
  const tc = indices.length / 3;
  for (let t = 0; t < tc; t++) {
    deg[indices[t * 3]] += 2;
    deg[indices[t * 3 + 1]] += 2;
    deg[indices[t * 3 + 2]] += 2;
  }
  const offsets = new Int32Array(count + 1);
  for (let v = 0; v < count; v++) offsets[v + 1] = offsets[v] + deg[v];
  const tmp = new Int32Array(offsets[count]);
  const fill = offsets.slice(0, count);
  for (let t = 0; t < tc; t++) {
    const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
    tmp[fill[a]++] = b; tmp[fill[a]++] = c;
    tmp[fill[b]++] = a; tmp[fill[b]++] = c;
    tmp[fill[c]++] = a; tmp[fill[c]++] = b;
  }
  // dedupe per vertex
  const list = [];
  const off2 = new Int32Array(count + 1);
  for (let v = 0; v < count; v++) {
    off2[v] = list.length;
    const s = offsets[v], e = offsets[v + 1];
    for (let q = s; q < e; q++) {
      const u = tmp[q];
      let dup = false;
      for (let r = off2[v]; r < list.length; r++) if (list[r] === u) { dup = true; break; }
      if (!dup) list.push(u);
    }
  }
  off2[count] = list.length;
  return { offsets: off2, list: Int32Array.from(list) };
}

/** Normals: blend of SDF gradient (smooth) and area-weighted face normals (accurate). */
export function computeNormals(mesh, grid, gradWeight = 0.65) {
  const { positions: p, indices, count } = mesh;
  const fn = new Float32Array(count * 3);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { fn[q] += nx; fn[q + 1] += ny; fn[q + 2] += nz; }
  }
  const g = [0, 0, 0];
  const n = mesh.normals;
  for (let v = 0; v < count; v++) {
    let x = fn[v * 3], y = fn[v * 3 + 1], z = fn[v * 3 + 2];
    let l = Math.hypot(x, y, z) || 1;
    x /= l; y /= l; z /= l;
    if (grid) {
      grid.gradient(p[v * 3], p[v * 3 + 1], p[v * 3 + 2], g);
      if (g[0] * x + g[1] * y + g[2] * z > 0.2) {
        x = x * (1 - gradWeight) + g[0] * gradWeight;
        y = y * (1 - gradWeight) + g[1] * gradWeight;
        z = z * (1 - gradWeight) + g[2] * gradWeight;
        l = Math.hypot(x, y, z) || 1;
        x /= l; y /= l; z /= l;
      }
    }
    n[v * 3] = x; n[v * 3 + 1] = y; n[v * 3 + 2] = z;
  }
}

/** SDF ambient occlusion per vertex (0 = occluded .. 1 = open). */
export function computeAO(mesh, grid, opts = {}) {
  const { positions: p, normals: n, count } = mesh;
  const steps = opts.steps || [0.012, 0.025, 0.05, 0.09];
  const strength = opts.strength ?? 4.5;
  const ao = new Float32Array(count);
  for (let v = 0; v < count; v++) {
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
    const nx = n[v * 3], ny = n[v * 3 + 1], nz = n[v * 3 + 2];
    let occ = 0, w = 1, wsum = 0;
    for (const s of steps) {
      const d = grid.sample(x + nx * s, y + ny * s, z + nz * s);
      occ += Math.max(0, s - d) / s * w;
      wsum += w;
      w *= 0.75;
    }
    ao[v] = Math.max(0, Math.min(1, 1 - (strength * occ) / wsum / 2));
  }
  // light smoothing
  if (mesh.adj) {
    const out = new Float32Array(count);
    const { offsets, list } = mesh.adj;
    for (let v = 0; v < count; v++) {
      let s = ao[v] * 2, c = 2;
      for (let q = offsets[v]; q < offsets[v + 1]; q++) { s += ao[list[q]]; c++; }
      out[v] = s / c;
    }
    return out;
  }
  return ao;
}

/** Smooth a per-vertex attribute (stride components) over the mesh graph. */
export function smoothAttribute(mesh, arr, stride, iterations = 1, keep = 0.5) {
  const { offsets, list } = mesh.adj;
  const n = mesh.count;
  let src = arr;
  let dst = new Float32Array(arr.length);
  for (let it = 0; it < iterations; it++) {
    for (let v = 0; v < n; v++) {
      const s = offsets[v], e = offsets[v + 1];
      const c = e - s;
      for (let k = 0; k < stride; k++) {
        let acc = 0;
        for (let q = s; q < e; q++) acc += src[list[q] * stride + k];
        dst[v * stride + k] = c ? src[v * stride + k] * keep + (acc / c) * (1 - keep) : src[v * stride + k];
      }
    }
    const t = src;
    src = dst;
    dst = t === arr ? new Float32Array(arr.length) : t;
  }
  if (src !== arr) arr.set(src);
  return arr;
}
