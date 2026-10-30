// Road splines + road graph with a spatial hash for fast projection.
// Pure math (three.js vectors only) so it also runs in node for layout checks.
import * as THREE from 'three';
import { LAYOUT } from './layout.js';

const UP = new THREE.Vector3(0, 1, 0);

/** Dense polyline spline (~1 m spacing) with arc-length parameterisation. */
export class RoadSpline {
  constructor(id, points, { closed = false, width = LAYOUT.roadWidth } = {}) {
    this.id = id;
    this.closed = closed;
    this.width = width;
    this.points = points; // Vector3[] ~1 m apart
    const n = points.length;
    this.cum = new Float64Array(n);
    for (let i = 1; i < n; i++) this.cum[i] = this.cum[i - 1] + points[i].distanceTo(points[i - 1]);
    this.length = this.cum[n - 1];
    // smooth per-point tangents (central differences) so sampled tangents are continuous
    this.tangents = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
      this.tangents[i] = new THREE.Vector3().subVectors(b, a).normalize();
    }
    // optional per-point metadata filled by the generator (curvature, flags)
    this.curvature = null; // Float32Array signed 1/R (+ = left turn)
    this.meta = {};
  }

  _locate(s) {
    const L = this.length;
    s = this.closed ? ((s % L) + L) % L : s < 0 ? 0 : s > L ? L : s;
    const cum = this.cum;
    // initial guess assuming ~uniform spacing, then walk
    let i = Math.min(cum.length - 2, Math.max(0, Math.floor((s / L) * (cum.length - 1))));
    while (i > 0 && cum[i] > s) i--;
    while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const seg = cum[i + 1] - cum[i] || 1;
    return { i, t: Math.min(1, Math.max(0, (s - cum[i]) / seg)), s };
  }

  /** Sample at arc length s. Writes into out = {pos, tangent, right, up, width}. */
  sample(s, out) {
    if (!out) out = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), width: 0 };
    const { i, t } = this._locate(s);
    const a = this.points[i], b = this.points[i + 1];
    out.pos.lerpVectors(a, b, t);
    out.tangent.lerpVectors(this.tangents[i], this.tangents[i + 1], t).normalize();
    out.right.crossVectors(out.tangent, UP).normalize();
    out.up.crossVectors(out.right, out.tangent).normalize();
    out.width = this.width;
    if (this.curvature) out.curvature = this.curvature[i] * (1 - t) + this.curvature[i + 1] * t;
    return out;
  }

  /** Road surface height at arc length s (fast path, no vectors). */
  heightAt(s) {
    const { i, t } = this._locate(s);
    return this.points[i].y + (this.points[i + 1].y - this.points[i].y) * t;
  }

  /** Signed curvature (1/m, + = turning left) at s. */
  curvatureAt(s) {
    if (!this.curvature) return 0;
    const { i, t } = this._locate(s);
    return this.curvature[i] * (1 - t) + this.curvature[i + 1] * t;
  }

  /** World yaw (radians, 0 = facing -Z, + = left) of the travel direction at s. */
  yawAt(s) {
    const { i, t } = this._locate(s);
    const ta = this.tangents[i], tb = this.tangents[i + 1];
    const tx = ta.x + (tb.x - ta.x) * t, tz = ta.z + (tb.z - ta.z) * t;
    return Math.atan2(-tx, -tz);
  }

  /** Point at arc length s offset sideways by `lateral` (+ = right). y = road height. */
  pointAt(s, lateral = 0, out = new THREE.Vector3()) {
    const { i, t } = this._locate(s);
    const a = this.points[i], b = this.points[i + 1];
    const ta = this.tangents[i], tb = this.tangents[i + 1];
    let tx = ta.x + (tb.x - ta.x) * t, tz = ta.z + (tb.z - ta.z) * t;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    // right = tangent x UP = (-tz, 0, tx)
    out.set(a.x + (b.x - a.x) * t - tz * lateral, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t + tx * lateral);
    return out;
  }
}

// ---------------------------------------------------------------------------
// Road network
// ---------------------------------------------------------------------------
const CELL = 8;
const keyOf = (ix, iz) => ((ix + 32768) << 16) | ((iz + 32768) & 0xffff);

/** Road graph: splines + projection queries (spatial hash of segments). */
export class RoadNetwork {
  constructor() {
    this.splines = new Map();
    this.connections = []; // {kind:'fork'|'merge'|'junction', a:{id,s}, b:{id,s}}
    this.grid = new Map(); // key -> Int32Array-like list of packed (splineIndex<<20 | segIndex)
    this._list = []; // splines by index
    this._tmp = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), width: 0 };
  }

  add(spline) {
    this._bbox = null;
    this._dense = null;
    this.splines.set(spline.id, spline);
    const si = this._list.length;
    this._list.push(spline);
    spline._index = si;
    const pts = spline.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const x0 = Math.floor(Math.min(a.x, b.x) / CELL), x1 = Math.floor(Math.max(a.x, b.x) / CELL);
      const z0 = Math.floor(Math.min(a.z, b.z) / CELL), z1 = Math.floor(Math.max(a.z, b.z) / CELL);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const k = keyOf(ix, iz);
          let l = this.grid.get(k);
          if (!l) this.grid.set(k, (l = []));
          l.push(si * 1048576 + i);
        }
      }
    }
    return spline;
  }

  get(id) {
    return this.splines.get(id);
  }
  length(id) {
    return this.splines.get(id).length;
  }
  sample(id, s, out) {
    return this.splines.get(id).sample(s, out);
  }

  /**
   * Nearest segment search. Returns best {sp, i, t, d (horizontal dist to centreline)} per spline in `perSpline`
   * (array indexed by spline index) and overall. Searches growing rings of cells up to maxDist.
   */
  _nearest(x, z, maxDist, perSpline, out = null) {
    // whole-network bounds: far queries (e.g. the creek network from most of the map) exit at once
    const maxRing = Math.ceil(maxDist / CELL);
    const D = this._dense || this._buildDense();
    const bb = D.bb;
    const mg = (maxRing + 1) * CELL; // the ring scan never reaches a segment beyond this
    if (x < bb[0] - mg || x > bb[2] + mg || z < bb[1] - mg || z > bb[3] + mg) return null;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let bG = -1, bT = 0, bD = Infinity;
    const { ix0, iz0, nx, nz, off, ent, ax, az, bx, bz, gsi, gi } = D;
    const list = this._list;
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let ix = cx - ring; ix <= cx + ring; ix++) {
        const gx = ix - ix0;
        if (gx < 0 || gx >= nx) continue;
        const edgeX = ix === cx - ring || ix === cx + ring;
        const step = edgeX || ring === 0 ? 1 : 2 * ring;
        for (let iz = cz - ring; iz <= cz + ring; iz += step) {
          const gz = iz - iz0;
          if (gz < 0 || gz >= nz) continue;
          const c = gx * nz + gz;
          for (let k = off[c], k1 = off[c + 1]; k < k1; k++) {
            const g = ent[k];
            const x0 = ax[g], z0 = az[g];
            const abx = bx[g] - x0, abz = bz[g] - z0;
            const len2 = abx * abx + abz * abz || 1e-9;
            let t = ((x - x0) * abx + (z - z0) * abz) / len2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const px = x0 + abx * t - x, pz = z0 + abz * t - z;
            const d = Math.sqrt(px * px + pz * pz);
            if (perSpline) {
              const si = gsi[g];
              const cur = perSpline[si];
              if (!cur || d < cur.d) perSpline[si] = { sp: list[si], i: gi[g], t, d };
            }
            if (d < bD) {
              bD = d;
              bG = g;
              bT = t;
            }
          }
        }
      }
      // a hit within this ring radius is final once the ring fully covers that distance
      if (bG >= 0 && bD <= ring * CELL) break;
    }
    if (bG < 0) return null;
    if (!out) return { sp: list[gsi[bG]], i: gi[bG], t: bT, d: bD };
    out.sp = list[gsi[bG]];
    out.i = gi[bG];
    out.t = bT;
    out.d = bD;
    return out;
  }

  /** Dense (CSR) copy of the segment hash + flat segment endpoints for _nearest. */
  _buildDense() {
    const bb = this._bbox || this._computeBBox();
    const ix0 = Math.floor(bb[0] / CELL) - 1, iz0 = Math.floor(bb[1] / CELL) - 1;
    const nx = Math.floor(bb[2] / CELL) + 2 - ix0, nz = Math.floor(bb[3] / CELL) + 2 - iz0;
    const segBase = [];
    let nSeg = 0;
    for (const sp of this._list) {
      segBase.push(nSeg);
      nSeg += Math.max(0, sp.points.length - 1);
    }
    const ax = new Float64Array(nSeg), az = new Float64Array(nSeg), bx = new Float64Array(nSeg), bz = new Float64Array(nSeg);
    const gsi = new Int32Array(nSeg), gi = new Int32Array(nSeg);
    this._list.forEach((sp, si) => {
      const pts = sp.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const g = segBase[si] + i;
        ax[g] = pts[i].x;
        az[g] = pts[i].z;
        bx[g] = pts[i + 1].x;
        bz[g] = pts[i + 1].z;
        gsi[g] = si;
        gi[g] = i;
      }
    });
    const off = new Int32Array(nx * nz + 1);
    const cellOf = (key) => {
      const ix = (key >>> 16) - 32768, iz = (key & 0xffff) - 32768;
      const gx = ix - ix0, gz = iz - iz0;
      return gx < 0 || gz < 0 || gx >= nx || gz >= nz ? -1 : gx * nz + gz;
    };
    for (const [key, l] of this.grid) {
      const c = cellOf(key);
      if (c >= 0) off[c + 1] += l.length;
    }
    for (let c = 0; c < nx * nz; c++) off[c + 1] += off[c];
    const ent = new Int32Array(off[nx * nz]);
    const fill = off.slice(0, nx * nz);
    for (const [key, l] of this.grid) {
      const c = cellOf(key);
      if (c < 0) continue;
      for (const packed of l) {
        const si = Math.floor(packed / 1048576);
        ent[fill[c]++] = segBase[si] + (packed - si * 1048576);
      }
    }
    this._dense = { bb, ix0, iz0, nx, nz, off, ent, ax, az, bx, bz, gsi, gi };
    return this._dense;
  }

  _computeBBox() {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const sp of this._list) {
      for (const p of sp.points) {
        if (p.x < x0) x0 = p.x;
        if (p.x > x1) x1 = p.x;
        if (p.z < z0) z0 = p.z;
        if (p.z > z1) z1 = p.z;
      }
    }
    this._bbox = [x0, z0, x1, z1];
    return this._bbox;
  }

  /**
   * Project a world position onto the nearest road.
   * Returns { id, s, lateral (+ = right of travel direction), distance, pos, tangent, right, width, onRoad, y }.
   * preferId keeps the result on that spline while the point is on its asphalt (fork/merge overlaps).
   * Pass `out` to avoid allocations (it is filled and returned).
   */
  project(p, preferId = null, out = null) {
    const per = preferId ? [] : null;
    let best = this._nearest(p.x, p.z, 96, per);
    if (!best) best = this._bruteNearest(p.x, p.z);
    if (preferId && per) {
      const sp = this.splines.get(preferId);
      const cand = sp ? per[sp._index] : null;
      if (cand && cand.d <= sp.width / 2 + 0.75) best = cand;
    }
    return this._fill(best, p, out);
  }

  /** Project onto one specific spline (no network search). */
  projectOnto(id, p, out = null) {
    const sp = this.splines.get(id);
    const per = [];
    let best = this._nearest(p.x, p.z, 160, per);
    let cand = per[sp._index];
    if (!cand) cand = this._bruteNearest(p.x, p.z, sp);
    return this._fill(cand || best, p, out);
  }

  _bruteNearest(x, z, only = null) {
    let best = null;
    for (const sp of only ? [only] : this._list) {
      const pts = sp.points;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i], b = pts[i + 1];
        const abx = b.x - a.x, abz = b.z - a.z;
        const len2 = abx * abx + abz * abz || 1e-9;
        let t = ((x - a.x) * abx + (z - a.z) * abz) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(a.x + abx * t - x, a.z + abz * t - z);
        if (!best || d < best.d) best = { sp, i, t, d };
      }
    }
    return best;
  }

  _fill(best, p, out) {
    const sp = best.sp;
    const s = sp.cum[best.i] + (sp.cum[best.i + 1] - sp.cum[best.i]) * best.t;
    if (!out) out = { id: '', s: 0, lateral: 0, distance: 0, pos: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), width: 0, onRoad: false, y: 0 };
    const smp = sp.sample(s, out._smp || (out._smp = { pos: out.pos, tangent: out.tangent, right: out.right, up: out.up || (out.up = new THREE.Vector3()), width: 0 }));
    const lateral = (p.x - smp.pos.x) * smp.right.x + (p.z - smp.pos.z) * smp.right.z;
    out.id = sp.id;
    out.s = s;
    out.lateral = lateral;
    out.distance = Math.abs(lateral);
    // beyond an open end the perpendicular distance is meaningless: use the true distance
    if (!sp.closed && (s <= 1e-6 || s >= sp.length - 1e-6)) out.distance = best.d;
    out.width = sp.width;
    out.onRoad = out.distance < sp.width / 2;
    out.y = smp.pos.y;
    out.curvature = smp.curvature || 0;
    return out;
  }

  /** Splines that continue from the end of `id` (graph successors). */
  successors(id) {
    const res = [];
    const L = this.length(id);
    for (const c of this.connections) {
      if (c.a.id === id && Math.abs(c.a.s - L) < 1 && c.kind !== 'junction') res.push(c.b);
    }
    return res;
  }

  /**
   * Advance along the network: from (id,s) move ds metres forward (ds >= 0), choosing
   * `choice` ('ghost' | 'human' | spline id) at forks. Returns {id, s}.
   */
  follow(id, s, ds, choice = 'ghost', out = { id: '', s: 0 }) {
    let cur = id, pos = s + ds;
    for (let guard = 0; guard < 8; guard++) {
      const L = this.length(cur);
      if (pos <= L) break;
      const next = this.successors(cur);
      if (!next.length) {
        pos = L;
        break;
      }
      const pick = next.find((n) => n.id === choice) || next[0];
      pos = pos - L + pick.s;
      cur = pick.id;
    }
    out.id = cur;
    out.s = pos;
    return out;
  }
}
