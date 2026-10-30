// Local red-green subdivision of a skinned BufferGeometry (indexed): triangles whose centroid
// lies in a region (weight fn > 0) are split 1->4; their neighbours are split 1->2 / 1->3 so
// the mesh stays crack-free. Midpoints follow a cubic Hermite curve through the vertex normals
// (smooth, slightly rounded surface). Edges are identified by welded position so UV seams
// (duplicated vertices) split identically on both sides.
// Attributes handled: position, normal, uv, skinIndex/skinWeight (merged, top 4), afat.
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

function subdivideOnce(geo, regionFn) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, fat = geo.attributes.afat;
  const idx = geo.index.array;
  const n = pos.count;
  // weld: canonical id per position
  const canon = new Int32Array(n);
  const map = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
    let c = map.get(k);
    if (c === undefined) { c = i; map.set(k, i); }
    canon[i] = c;
  }
  // welded (averaged) normals for the curve computation
  const wn = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = canon[i];
    wn[c * 3] += nor.getX(i); wn[c * 3 + 1] += nor.getY(i); wn[c * 3 + 2] += nor.getZ(i);
  }
  for (let i = 0; i < n; i++) {
    const c = canon[i];
    const l = Math.hypot(wn[c * 3], wn[c * 3 + 1], wn[c * 3 + 2]) || 1;
    if (c === i) { wn[c * 3] /= l; wn[c * 3 + 1] /= l; wn[c * 3 + 2] /= l; }
  }
  const ekey = (i, j) => { const a = canon[i], b = canon[j]; return a < b ? a * 1048576 + b : b * 1048576 + a; };
  // mark triangles
  const split = new Set();
  const tris = idx.length / 3;
  for (let t = 0; t < tris; t++) {
    const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
    _a.fromBufferAttribute(pos, i0).add(_b.fromBufferAttribute(pos, i1)).add(_c.fromBufferAttribute(pos, i2)).multiplyScalar(1 / 3);
    if (regionFn(_a) > 0) { split.add(ekey(i0, i1)); split.add(ekey(i1, i2)); split.add(ekey(i2, i0)); }
  }
  if (!split.size) return geo;
  // output buffers (dynamic arrays)
  const P = Array.from(pos.array), N = Array.from(nor.array), U = Array.from(uv.array);
  const SI = Array.from(si.array), SW = Array.from(sw.array), F = Array.from(fat.array);
  const midPos = new Map(); // canonical edge -> [x,y,z]
  const midVert = new Map(); // actual pair -> new index
  const mid = (i, j) => {
    const pk = i < j ? i * 1048576 + j : j * 1048576 + i;
    let v = midVert.get(pk);
    if (v !== undefined) return v;
    const ek = ekey(i, j);
    let mp = midPos.get(ek);
    if (!mp) {
      const a = canon[i] < canon[j] ? canon[i] : canon[j], b = a === canon[i] ? canon[j] : canon[i];
      const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
      const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const n0x = wn[a * 3], n0y = wn[a * 3 + 1], n0z = wn[a * 3 + 2];
      const n1x = wn[b * 3], n1y = wn[b * 3 + 1], n1z = wn[b * 3 + 2];
      const d0 = dx * n0x + dy * n0y + dz * n0z, d1 = dx * n1x + dy * n1y + dz * n1z;
      // Hermite midpoint: 0.5(p0+p1) + 0.125((d.n1)n1 - (d.n0)n0)
      mp = [
        (ax + bx) * 0.5 + 0.125 * (d1 * n1x - d0 * n0x),
        (ay + by) * 0.5 + 0.125 * (d1 * n1y - d0 * n0y),
        (az + bz) * 0.5 + 0.125 * (d1 * n1z - d0 * n0z),
      ];
      midPos.set(ek, mp);
    }
    v = P.length / 3;
    P.push(mp[0], mp[1], mp[2]);
    let nx = N[i * 3] + N[j * 3], ny = N[i * 3 + 1] + N[j * 3 + 1], nz = N[i * 3 + 2] + N[j * 3 + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    N.push(nx / l, ny / l, nz / l);
    U.push((U[i * 2] + U[j * 2]) * 0.5, (U[i * 2 + 1] + U[j * 2 + 1]) * 0.5);
    // merge skin weights
    const acc = new Map();
    for (const s of [i, j]) for (let k = 0; k < 4; k++) {
      const w = SW[s * 4 + k] * 0.5;
      if (w <= 0) continue;
      const b = SI[s * 4 + k];
      acc.set(b, (acc.get(b) || 0) + w);
    }
    const top = [...acc.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
    const tot = top.reduce((s, e) => s + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) {
      SI.push(top[k] ? top[k][0] : 0);
      SW.push(top[k] ? top[k][1] / tot : 0);
    }
    F.push((F[i] + F[j]) * 0.5);
    midVert.set(pk, v);
    return v;
  };
  const out = [];
  for (let t = 0; t < tris; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    const sab = split.has(ekey(a, b)), sbc = split.has(ekey(b, c)), sca = split.has(ekey(c, a));
    const cnt = (sab ? 1 : 0) + (sbc ? 1 : 0) + (sca ? 1 : 0);
    if (cnt === 0) { out.push(a, b, c); continue; }
    if (cnt === 3) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      continue;
    }
    // rotate so the pattern starts at a fixed edge
    let v = [a, b, c], s = [sab, sbc, sca];
    if (cnt === 1) {
      while (!s[0]) { v = [v[1], v[2], v[0]]; s = [s[1], s[2], s[0]]; }
      const m = mid(v[0], v[1]);
      out.push(v[0], m, v[2], m, v[1], v[2]);
    } else {
      // two split edges: rotate so edges 0 (v0v1) and 1 (v1v2) are split
      while (!(s[0] && s[1])) { v = [v[1], v[2], v[0]]; s = [s[1], s[2], s[0]]; }
      const m01 = mid(v[0], v[1]), m12 = mid(v[1], v[2]);
      out.push(m01, v[1], m12);
      out.push(v[0], m01, m12, v[0], m12, v[2]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  g.setAttribute('afat', new THREE.Float32BufferAttribute(F, 1));
  g.setIndex(new THREE.BufferAttribute(Uint32Array.from(out), 1));
  return g;
}

/** Subdivide the region `levels` times. */
export function subdivideRegion(geo, regionFn, levels = 1) {
  let g = geo;
  for (let l = 0; l < levels; l++) g = subdivideOnce(g, regionFn);
  g.computeBoundingSphere();
  return g;
}
