// Quadric error metric (Garland-Heckbert) edge-collapse decimation for closed
// or bordered triangle meshes. Positions only (attributes are computed after).
// Border vertices are locked; collapses that flip faces or break the link
// condition (non-manifold) are rejected. Allocation-light: typed arrays, small
// plain-array neighbour lists and an index heap.

class Heap {
  constructor(cap) {
    this.key = new Float64Array(cap);
    this.ent = new Int32Array(cap);
    this.n = 0;
  }
  push(k, e) {
    if (this.n >= this.key.length) {
      const nk = new Float64Array(this.key.length * 2); nk.set(this.key); this.key = nk;
      const ne = new Int32Array(this.ent.length * 2); ne.set(this.ent); this.ent = ne;
    }
    const key = this.key, ent = this.ent;
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (key[p] <= k) break;
      key[i] = key[p]; ent[i] = ent[p];
      i = p;
    }
    key[i] = k; ent[i] = e;
  }
  /** returns entry index or -1 */
  pop() {
    if (!this.n) return -1;
    const key = this.key, ent = this.ent;
    const top = ent[0];
    const n = --this.n;
    if (n > 0) {
      const k = key[n], e = ent[n];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && key[r] < key[l] ? r : l;
        if (key[m] >= k) break;
        key[i] = key[m]; ent[i] = ent[m];
        i = m;
      }
      key[i] = k; ent[i] = e;
    }
    return top;
  }
}

/**
 * Decimate to `targetTris`. opts.weightFn(x,y,z) -> importance multiplier for quadrics (e.g. face detail).
 * opts.lockFn(x,y,z) -> true to keep a vertex. Returns { positions, indices, count }.
 */
export function decimate(positions, indices, targetTris, opts = {}) {
  const nv = positions.length / 3;
  const nf = indices.length / 3;
  if (nf <= targetTris) return { positions, indices, count: nv };
  const P = new Float64Array(positions);
  const F = new Int32Array(indices);
  const faceAlive = new Uint8Array(nf).fill(1);
  const Q = new Float64Array(nv * 10);
  const vAlive = new Uint8Array(nv).fill(1);
  const ver = new Int32Array(nv);
  const vFaces = new Array(nv);
  const nbr = new Array(nv);
  for (let v = 0; v < nv; v++) { vFaces[v] = []; nbr[v] = []; }
  const weightFn = opts.weightFn;
  for (let f = 0; f < nf; f++) {
    const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2];
    vFaces[a].push(f); vFaces[b].push(f); vFaces[c].push(f);
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
    const wx = P[c * 3] - ax, wy = P[c * 3 + 1] - ay, wz = P[c * 3 + 2] - az;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-14) continue;
    nx /= len; ny /= len; nz /= len;
    const d = -(nx * ax + ny * ay + nz * az);
    let wgt = len * 0.5;
    if (weightFn) wgt *= weightFn((ax + P[b * 3] + P[c * 3]) / 3, (ay + P[b * 3 + 1] + P[c * 3 + 1]) / 3, (az + P[b * 3 + 2] + P[c * 3 + 2]) / 3);
    const q0 = nx * nx * wgt, q1 = nx * ny * wgt, q2 = nx * nz * wgt, q3 = nx * d * wgt, q4 = ny * ny * wgt, q5 = ny * nz * wgt, q6 = ny * d * wgt, q7 = nz * nz * wgt, q8 = nz * d * wgt, q9 = d * d * wgt;
    for (let vi = 0; vi < 3; vi++) {
      const o = F[f * 3 + vi] * 10;
      Q[o] += q0; Q[o + 1] += q1; Q[o + 2] += q2; Q[o + 3] += q3; Q[o + 4] += q4; Q[o + 5] += q5; Q[o + 6] += q6; Q[o + 7] += q7; Q[o + 8] += q8; Q[o + 9] += q9;
    }
  }
  // neighbours + border detection (an edge shared by != 2 faces locks its vertices)
  const locked = new Uint8Array(nv);
  const cntIdx = [], cntVal = [];
  for (let v = 0; v < nv; v++) {
    cntIdx.length = 0; cntVal.length = 0;
    const fl = vFaces[v];
    for (let i = 0; i < fl.length; i++) {
      const f = fl[i];
      for (let k = 0; k < 3; k++) {
        const u = F[f * 3 + k];
        if (u === v) continue;
        const j = cntIdx.indexOf(u);
        if (j < 0) { cntIdx.push(u); cntVal.push(1); } else cntVal[j]++;
      }
    }
    for (let i = 0; i < cntIdx.length; i++) {
      nbr[v].push(cntIdx[i]);
      if (cntVal[i] !== 2) locked[v] = 1;
    }
  }
  if (opts.lockFn) for (let v = 0; v < nv; v++) if (opts.lockFn(P[v * 3], P[v * 3 + 1], P[v * 3 + 2])) locked[v] = 1;

  const opt = [0, 0, 0];
  const lengthPenalty = opts.lengthPenalty ?? 1e-6;
  const costOf = (a, b) => {
    const oa = a * 10, ob = b * 10;
    const q0 = Q[oa] + Q[ob], q1 = Q[oa + 1] + Q[ob + 1], q2 = Q[oa + 2] + Q[ob + 2], q3 = Q[oa + 3] + Q[ob + 3], q4 = Q[oa + 4] + Q[ob + 4];
    const q5 = Q[oa + 5] + Q[ob + 5], q6 = Q[oa + 6] + Q[ob + 6], q7 = Q[oa + 7] + Q[ob + 7], q8 = Q[oa + 8] + Q[ob + 8], q9 = Q[oa + 9] + Q[ob + 9];
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
    let best = Infinity;
    let e;
    const det = q0 * (q4 * q7 - q5 * q5) - q1 * (q1 * q7 - q5 * q2) + q2 * (q1 * q5 - q4 * q2);
    const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5;
    const el2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay) + (bz - az) * (bz - az);
    if (Math.abs(det) > 1e-14) {
      const b1 = -q3, b2 = -q6, b3 = -q8;
      const x = (b1 * (q4 * q7 - q5 * q5) - q1 * (b2 * q7 - q5 * b3) + q2 * (b2 * q5 - q4 * b3)) / det;
      const y = (q0 * (b2 * q7 - q5 * b3) - b1 * (q1 * q7 - q5 * q2) + q2 * (q1 * b3 - b2 * q2)) / det;
      const z = (q0 * (q4 * b3 - b2 * q5) - q1 * (q1 * b3 - b2 * q2) + b1 * (q1 * q5 - q4 * q2)) / det;
      const dx = x - mx, dy = y - my, dz = z - mz;
      if (dx * dx + dy * dy + dz * dz < el2) {
        best = q0 * x * x + 2 * q1 * x * y + 2 * q2 * x * z + 2 * q3 * x + q4 * y * y + 2 * q5 * y * z + 2 * q6 * y + q7 * z * z + 2 * q8 * z + q9;
        opt[0] = x; opt[1] = y; opt[2] = z;
      }
    }
    e = q0 * ax * ax + 2 * q1 * ax * ay + 2 * q2 * ax * az + 2 * q3 * ax + q4 * ay * ay + 2 * q5 * ay * az + 2 * q6 * ay + q7 * az * az + 2 * q8 * az + q9;
    if (e < best) { best = e; opt[0] = ax; opt[1] = ay; opt[2] = az; }
    e = q0 * bx * bx + 2 * q1 * bx * by + 2 * q2 * bx * bz + 2 * q3 * bx + q4 * by * by + 2 * q5 * by * bz + 2 * q6 * by + q7 * bz * bz + 2 * q8 * bz + q9;
    if (e < best) { best = e; opt[0] = bx; opt[1] = by; opt[2] = bz; }
    e = q0 * mx * mx + 2 * q1 * mx * my + 2 * q2 * mx * mz + 2 * q3 * mx + q4 * my * my + 2 * q5 * my * mz + 2 * q6 * my + q7 * mz * mz + 2 * q8 * mz + q9;
    if (e < best) { best = e; opt[0] = mx; opt[1] = my; opt[2] = mz; }
    return (best > 0 ? best : 0) + el2 * lengthPenalty;
  };

  // entry pool
  let cap = nv * 4;
  let EA = new Int32Array(cap), EB = new Int32Array(cap), EVA = new Int32Array(cap), EVB = new Int32Array(cap);
  let ne = 0;
  const heap = new Heap(cap);
  const pushEdge = (a, b) => {
    if (ne >= cap) {
      cap *= 2;
      const g = (arr) => { const n = new Int32Array(cap); n.set(arr); return n; };
      EA = g(EA); EB = g(EB); EVA = g(EVA); EVB = g(EVB);
    }
    EA[ne] = a; EB[ne] = b; EVA[ne] = ver[a]; EVB[ne] = ver[b];
    heap.push(costOf(a, b), ne++);
  };
  for (let v = 0; v < nv; v++) {
    if (locked[v]) continue;
    const nl = nbr[v];
    for (let i = 0; i < nl.length; i++) {
      const u = nl[i];
      if (u <= v || locked[u]) continue;
      pushEdge(v, u);
    }
  }

  function flips(v, other, nx0, ny0, nz0) {
    const fl = vFaces[v];
    for (let i = 0; i < fl.length; i++) {
      const f = fl[i];
      if (!faceAlive[f]) continue;
      const i0 = F[f * 3], i1 = F[f * 3 + 1], i2 = F[f * 3 + 2];
      if (i0 === other || i1 === other || i2 === other) continue;
      let j1, j2;
      if (i0 === v) { j1 = i1; j2 = i2; } else if (i1 === v) { j1 = i2; j2 = i0; } else { j1 = i0; j2 = i1; }
      const vx = P[v * 3], vy = P[v * 3 + 1], vz = P[v * 3 + 2];
      const ax = P[j1 * 3] - vx, ay = P[j1 * 3 + 1] - vy, az = P[j1 * 3 + 2] - vz;
      const bx = P[j2 * 3] - vx, by = P[j2 * 3 + 1] - vy, bz = P[j2 * 3 + 2] - vz;
      const n0x = ay * bz - az * by, n0y = az * bx - ax * bz, n0z = ax * by - ay * bx;
      const cx = P[j1 * 3] - nx0, cy = P[j1 * 3 + 1] - ny0, cz = P[j1 * 3 + 2] - nz0;
      const dx = P[j2 * 3] - nx0, dy = P[j2 * 3 + 1] - ny0, dz = P[j2 * 3 + 2] - nz0;
      const n1x = cy * dz - cz * dy, n1y = cz * dx - cx * dz, n1z = cx * dy - cy * dx;
      const l0 = Math.sqrt(n0x * n0x + n0y * n0y + n0z * n0z), l1 = Math.sqrt(n1x * n1x + n1y * n1y + n1z * n1z);
      if (l1 < 1e-14) return true;
      if ((n0x * n1x + n0y * n1y + n0z * n1z) / (l0 * l1 + 1e-20) < 0.25) return true;
    }
    return false;
  }

  let faces = nf;
  while (faces > targetTris) {
    const ei = heap.pop();
    if (ei < 0) break;
    const a = EA[ei], b = EB[ei];
    if (!vAlive[a] || !vAlive[b] || ver[a] !== EVA[ei] || ver[b] !== EVB[ei]) continue;
    const na = nbr[a], nb = nbr[b];
    if (na.indexOf(b) < 0) continue;
    // link condition: exactly 2 common neighbours
    let common = 0;
    for (let i = 0; i < na.length; i++) if (nb.indexOf(na[i]) >= 0) common++;
    if (common !== 2) continue;
    costOf(a, b);
    const px = opt[0], py = opt[1], pz = opt[2];
    if (flips(a, b, px, py, pz) || flips(b, a, px, py, pz)) continue;
    // collapse b -> a
    const fb = vFaces[b];
    for (let i = 0; i < fb.length; i++) {
      const f = fb[i];
      if (!faceAlive[f]) continue;
      const o = f * 3;
      if (F[o] === a || F[o + 1] === a || F[o + 2] === a) { faceAlive[f] = 0; faces--; continue; }
      if (F[o] === b) F[o] = a; else if (F[o + 1] === b) F[o + 1] = a; else F[o + 2] = a;
      vFaces[a].push(f);
    }
    vAlive[b] = 0;
    P[a * 3] = px; P[a * 3 + 1] = py; P[a * 3 + 2] = pz;
    for (let k = 0; k < 10; k++) Q[a * 10 + k] += Q[b * 10 + k];
    for (let i = 0; i < nb.length; i++) {
      const n = nb[i];
      const nl = nbr[n];
      const j = nl.indexOf(b);
      if (j >= 0) nl.splice(j, 1);
      if (n !== a) {
        if (nl.indexOf(a) < 0) nl.push(a);
        if (na.indexOf(n) < 0) na.push(n);
      }
    }
    const jb = na.indexOf(b);
    if (jb >= 0) na.splice(jb, 1);
    nb.length = 0;
    if (vFaces[a].length > 20) vFaces[a] = vFaces[a].filter((f) => faceAlive[f]);
    ver[a]++;
    for (let i = 0; i < na.length; i++) {
      const n = na[i];
      if (locked[n]) continue;
      pushEdge(a, n);
    }
  }

  // compact
  const remap = new Int32Array(nv).fill(-1);
  let cnt = 0;
  const out = new Uint32Array(faces * 3 + 3);
  let oi = 0;
  for (let f = 0; f < nf; f++) {
    if (!faceAlive[f]) continue;
    const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2];
    if (a === b || b === c || a === c) continue;
    if (remap[a] < 0) remap[a] = cnt++;
    if (remap[b] < 0) remap[b] = cnt++;
    if (remap[c] < 0) remap[c] = cnt++;
    out[oi++] = remap[a]; out[oi++] = remap[b]; out[oi++] = remap[c];
  }
  const pos = new Float32Array(cnt * 3);
  for (let v = 0; v < nv; v++) {
    const r = remap[v];
    if (r < 0) continue;
    pos[r * 3] = P[v * 3]; pos[r * 3 + 1] = P[v * 3 + 1]; pos[r * 3 + 2] = P[v * 3 + 2];
  }
  return { positions: pos, indices: out.slice(0, oi), count: cnt };
}
