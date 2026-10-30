// Terrain: a heightfield that only exists in a corridor around the roads, shaped to the
// road (flat under the asphalt, crumbling shoulders, drainage ditches, embankments and
// rock cuttings), carved by the creek under the bridge and flattened into pads under
// set pieces. 64 m tiles at 1 m spacing (with a 2 m index for far LOD).
import * as THREE from 'three';
import { RoadNetwork, RoadSpline } from './Road.js';
import { SimplexNoise, makeRng, smoothstep, clamp } from '../core/math.js';
import { W } from './constants.js';

const COARSE = 4; // coarse distance / base grid cell (m)
const STAMP_R = 104; // influence radius of road samples on the coarse grid
const EXACT_R = 26; // use exact nearest-road queries within this distance

export class Terrain {
  constructor(road, layout, opts = {}) {
    this.road = road;
    this.layout = layout;
    this.noise = new SimplexNoise(layout.seed * 101 + 5);
    this.noise2 = new SimplexNoise(layout.seed * 211 + 17);
    this.pads = []; // {x,z,hx,hz,cos,sin,h,blend,kind}
    this.creek = null; // { net, spline, waterAt(c) }
    this.ponds = []; // {x,z,r,depth}
    this.mods = []; // authored dips / mounds
    this.tiles = new Map(); // key -> tile
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.hw = layout.roadWidth / 2;
    this.sh = layout.shoulder;
    this.scaleE = layout.elevationRange / 18;
    this._near = { sp: null, s: 0, lateral: 0, d: 0, e: 0, hr: 0, side: 0 };
    this.material = opts.material || null;
  }

  // -------------------------------------------------------------------------------------
  // preparation
  // -------------------------------------------------------------------------------------
  /** Rect pad flattened to height h. yaw = rotation of the rect (local x/z half extents). kind: 'gravel'|'concrete'|'dirt' */
  addPad(p) {
    const yaw = p.yaw || 0;
    this.pads.push({ x: p.x, z: p.z, hx: p.hx, hz: p.hz, cos: Math.cos(yaw), sin: Math.sin(yaw), h: p.h, blend: p.blend ?? 3, kind: p.kind || 'dirt', r: Math.hypot(p.hx, p.hz) + (p.blend ?? 3) });
  }

  addPond(x, z, r, depth = 1.2) {
    this.ponds.push({ x, z, r, depth });
  }

  /** Build the coarse distance/base grid, per-spline ditch flags and the creek. */
  prepare() {
    const splines = [...this.road.splines.values()];
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const sp of splines) for (const p of sp.points) {
      minx = Math.min(minx, p.x);
      maxx = Math.max(maxx, p.x);
      minz = Math.min(minz, p.z);
      maxz = Math.max(maxz, p.z);
    }
    const pad = STAMP_R + 8;
    this.minx = Math.floor((minx - pad) / 64) * 64;
    this.minz = Math.floor((minz - pad) / 64) * 64;
    this.maxx = Math.ceil((maxx + pad) / 64) * 64;
    this.maxz = Math.ceil((maxz + pad) / 64) * 64;
    const nx = (this.cnx = Math.ceil((this.maxx - this.minx) / COARSE) + 1);
    const nz = (this.cnz = Math.ceil((this.maxz - this.minz) / COARSE) + 1);
    const N = nx * nz;
    const dist = (this.cDist = new Float32Array(N).fill(1e9));
    const spl = (this.cSpline = new Int8Array(N).fill(-1));
    const sArr = (this.cS = new Float32Array(N));
    const wsum = new Float32Array(N), hsum = new Float32Array(N);
    const rc = Math.ceil(STAMP_R / COARSE);
    splines.forEach((sp, si) => {
      const pts = sp.points;
      for (let i = 0; i < pts.length; i += 2) {
        const p = pts[i];
        // base = IDW of (road height - hills at the road): near a road the natural ground is the road
        // height plus only the cross-gradient of the hills (cut on one side, fill on the other)
        const rel = p.y - this._hills(p.x, p.z);
        const ci = Math.round((p.x - this.minx) / COARSE), cj = Math.round((p.z - this.minz) / COARSE);
        for (let dj = -rc; dj <= rc; dj++) {
          const j = cj + dj;
          if (j < 0 || j >= nz) continue;
          const z = this.minz + j * COARSE;
          for (let di = -rc; di <= rc; di++) {
            const ii = ci + di;
            if (ii < 0 || ii >= nx) continue;
            const x = this.minx + ii * COARSE;
            const dx = x - p.x, dz = z - p.z;
            const d2 = dx * dx + dz * dz;
            if (d2 > STAMP_R * STAMP_R) continue;
            const k = j * nx + ii;
            const d = Math.sqrt(d2);
            if (d < dist[k]) {
              dist[k] = d;
              spl[k] = si;
              sArr[k] = sp.cum[i];
            }
            const w = 1 / (d2 + 900);
            wsum[k] += w;
            hsum[k] += w * rel;
          }
        }
      }
    });
    this.cBase = new Float32Array(N);
    for (let k = 0; k < N; k++) this.cBase[k] = wsum[k] > 0 ? hsum[k] / wsum[k] : 0;
    this._splineList = splines;

    this._buildCreek();
    this._buildDitches();
  }

  _buildCreek() {
    const lm = this.layout.landmarks.bridge;
    if (!lm) return;
    const main = this.road.get(lm.spline);
    const sB = lm.u * main.length;
    const smp = main.sample(sB);
    this.bridgeS = sB;
    this.bridgeLen = lm.length || 26;
    const hr = smp.pos.y;
    const pts = [];
    const tx = smp.tangent.x, tz = smp.tangent.z;
    const tl = Math.hypot(tx, tz);
    const t = { x: tx / tl, z: tz / tl };
    const r = { x: -t.z, z: t.x };
    // c < 0: upstream (right side), c > 0: downstream (left side)
    const raw = [];
    for (let c = -240; c <= 240; c += 3) {
      const fade = smoothstep(10, 40, Math.abs(c));
      const m = (16 * Math.sin(c / 41 + 0.7) + 7 * Math.sin(c / 15.5 + 2.1)) * fade;
      const bend = 0.0009 * c * Math.abs(c) * 0.35; // slow overall curve
      raw.push({ c, x: smp.pos.x - r.x * c + t.x * (m + bend), z: smp.pos.z - r.z * c + t.z * (m + bend) });
    }
    // truncate where the creek would come near another road (keep the bridge crossing)
    const keep = [];
    const pr = { x: 0, y: 0, z: 0 };
    let start = 0, end = raw.length - 1;
    const mid = raw.findIndex((p) => p.c >= 0);
    for (let i = mid; i < raw.length; i++) {
      pr.x = raw[i].x;
      pr.z = raw[i].z;
      const b = this.road._nearest(pr.x, pr.z, 40);
      if (b && b.d < 34 && !(b.sp.id === lm.spline && Math.abs(b.sp.cum[b.i] - sB) < 40)) {
        end = i - 4;
        break;
      }
    }
    for (let i = mid; i >= 0; i--) {
      pr.x = raw[i].x;
      pr.z = raw[i].z;
      const b = this.road._nearest(pr.x, pr.z, 40);
      if (b && b.d < 34 && !(b.sp.id === lm.spline && Math.abs(b.sp.cum[b.i] - sB) < 40)) {
        start = i + 4;
        break;
      }
    }
    for (let i = start; i <= end; i++) keep.push(raw[i]);
    // densify to ~1 m
    for (let i = 0; i < keep.length - 1; i++) {
      const a = keep[i], b = keep[i + 1];
      const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z)));
      for (let k = 0; k < n; k++) {
        const f = k / n;
        const c = a.c + (b.c - a.c) * f;
        pts.push(new THREE.Vector3(a.x + (b.x - a.x) * f, 0, a.z + (b.z - a.z) * f));
        pts[pts.length - 1].c = c;
      }
    }
    const last = keep[keep.length - 1];
    pts.push(new THREE.Vector3(last.x, 0, last.z));
    pts[pts.length - 1].c = last.c;
    const W0 = hr - 3.6 * Math.max(0.6, this.scaleE);
    for (const p of pts) p.y = W0 - 0.011 * p.c - 0.000012 * p.c * Math.abs(p.c);
    const spline = new RoadSpline('creek', pts, { width: 5 });
    const net = new RoadNetwork();
    net.add(spline);
    this.creek = { net, spline, W0, bedHalf: 2.0, depth: 0.75, roadY: hr, sB };
  }

  _buildDitches() {
    // ditch flag per spline sample (left / right): on the uphill (cutting) side, in long stretches
    for (const sp of this._splineList) {
      const n = sp.points.length;
      const L = new Float32Array(n), R = new Float32Array(n);
      const isMain = sp.id === 'main';
      for (let i = 0; i < n; i++) {
        const s = sp.cum[i];
        const p = sp.points[i];
        const tg = sp.tangents[i];
        const rx = -tg.z, rz = tg.x;
        const nzv = this.noise2.noise2D(s / 160 + (isMain ? 0 : 50), sp.id.length * 3.1);
        const want = nzv > -0.15;
        for (const side of [-1, 1]) {
          const lx = p.x + rx * side * (this.hw + 7), lz = p.z + rz * side * (this.hw + 7);
          const delta = this._natural(lx, lz) - p.y;
          let f = want && delta > 0.6 ? 1 : 0;
          // occasional ditch on flat ground too (one side only)
          if (!f && want && side === -1 && nzv > 0.35) f = 1;
          (side < 0 ? L : R)[i] = f;
        }
        // no ditches near junction ends / bridge
        const endDist = Math.min(s, sp.length - s);
        if ((sp.id !== 'main' && endDist < 45) || (isMain && endDist < 45)) L[i] = R[i] = 0;
        if (isMain && this.creek && Math.abs(s - this.creek.sB) < 40) L[i] = R[i] = 0;
        if (isMain && Math.abs(s - this.layout.landmarks.spurJunction.u * sp.length) < 40) L[i] = R[i] = 0;
      }
      // smooth flags into 0..1 ramps (~12 m)
      const sm = (a) => {
        const out = new Float32Array(n);
        const r = 10;
        let acc = 0;
        for (let i = 0; i < Math.min(n, r); i++) acc += a[i];
        for (let i = 0; i < n; i++) {
          if (i + r < n) acc += a[i + r];
          if (i - r - 1 >= 0) acc -= a[i - r - 1];
          const cnt = Math.min(n - 1, i + r) - Math.max(0, i - r) + 1;
          out[i] = acc / cnt;
        }
        return out;
      };
      sp.meta.ditchL = sm(L);
      sp.meta.ditchR = sm(R);
    }
  }

  // -------------------------------------------------------------------------------------
  // height functions
  // -------------------------------------------------------------------------------------
  _coarseIndex(x, z) {
    const i = Math.round((x - this.minx) / COARSE), j = Math.round((z - this.minz) / COARSE);
    if (i < 0 || j < 0 || i >= this.cnx || j >= this.cnz) return -1;
    return j * this.cnx + i;
  }

  /** Smooth base height (IDW of nearby road heights), bilinear on the coarse grid. */
  _base(x, z) {
    const fx = (x - this.minx) / COARSE, fz = (z - this.minz) / COARSE;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.cnx - 1 || j >= this.cnz - 1) return 0;
    const tx = fx - i, tz = fz - j;
    const nx = this.cnx, b = this.cBase;
    const k = j * nx + i;
    return (b[k] * (1 - tx) + b[k + 1] * tx) * (1 - tz) + (b[k + nx] * (1 - tx) + b[k + nx + 1] * tx) * tz;
  }

  _coarseDist(x, z) {
    const fx = (x - this.minx) / COARSE, fz = (z - this.minz) / COARSE;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this.cnx - 1 || j >= this.cnz - 1) return 1e9;
    const tx = fx - i, tz = fz - j;
    const nx = this.cnx, b = this.cDist;
    const k = j * nx + i;
    return (b[k] * (1 - tx) + b[k + 1] * tx) * (1 - tz) + (b[k + nx] * (1 - tx) + b[k + nx + 1] * tx) * tz;
  }

  /** Hills relative to the road base: large rolling noise (continuous across roads). */
  _hills(x, z) {
    const n = this.noise;
    return (n.fbm2(x / 230, z / 230, 3) * 22 + n.noise2D(x / 75 + 11, z / 75 - 3) * 4 + n.noise2D(x / 26 - 7, z / 26 + 5) * 1.2) * this.scaleE;
  }

  _natural(x, z) {
    return this._base(x, z) + this._hills(x, z) + this._localMod(x, z);
  }

  /** Authored terrain features: dips / mounds {x,z,r,dh} (e.g. the ravine below the accident curve). */
  _localMod(x, z) {
    let h = 0;
    for (const m of this.mods) {
      const d = Math.hypot(x - m.x, z - m.z);
      if (d < m.r) {
        const t = 1 - d / m.r;
        h += m.dh * t * t * (3 - 2 * t);
      }
    }
    return h;
  }

  addMod(x, z, r, dh) {
    this.mods.push({ x, z, r, dh });
  }

  /**
   * Nearest road info for terrain shaping. Exact within EXACT_R, coarse beyond.
   * Fills and returns this._near {sp, s, lateral, d, e (beyond asphalt edge), hr, side, exact}.
   */
  nearestRoad(x, z, exactOnly = false) {
    const o = this._near;
    const cd = this._coarseDist(x, z);
    if (cd < EXACT_R + 6 || exactOnly) {
      const b = this.road._nearest(x, z, EXACT_R + 8, null, this._nb || (this._nb = { sp: null, i: 0, t: 0, d: 0 }));
      if (b) {
        const sp = b.sp;
        const a = sp.points[b.i], c = sp.points[b.i + 1];
        const s = sp.cum[b.i] + (sp.cum[b.i + 1] - sp.cum[b.i]) * b.t;
        const ta = sp.tangents[b.i];
        const lateral = (x - (a.x + (c.x - a.x) * b.t)) * -ta.z + (z - (a.z + (c.z - a.z) * b.t)) * ta.x;
        o.sp = sp;
        o.s = s;
        o.i = b.i;
        o.lateral = lateral;
        o.d = b.d;
        o.e = b.d - sp.width / 2;
        o.hr = a.y + (c.y - a.y) * b.t;
        o.side = lateral < 0 ? -1 : 1;
        o.exact = true;
        return o;
      }
    }
    const k = this._coarseIndex(x, z);
    if (k < 0 || this.cSpline[k] < 0) {
      o.sp = null;
      o.d = 1e9;
      o.e = 1e9;
      o.hr = 0;
      o.exact = false;
      return o;
    }
    const sp = this._splineList[this.cSpline[k]];
    o.sp = sp;
    o.s = this.cS[k];
    o.i = Math.min(sp.points.length - 2, Math.round(o.s));
    o.d = cd;
    o.e = cd - sp.width / 2;
    o.hr = sp.heightAt(o.s);
    o.lateral = 0;
    o.side = 0;
    o.exact = false;
    return o;
  }

  /**
   * Full terrain height (slow; used to build the grid). Also writes shading attributes into attr
   * (edge distance, pad weight, wet/creek, ditch) when given.
   */
  heightRaw(x, z, attr = null) {
    const nr = this.nearestRoad(x, z);
    const N = this._natural(x, z);
    const detail = this.noise2.fbm2(x / 9, z / 9, 2) * 0.35 + this.noise2.noise2D(x / 2.3, z / 2.3) * 0.06;
    let h, e = nr.e;
    let ditchV = 0;
    if (!nr.sp) {
      h = N + detail;
    } else if (e < 0) {
      // hidden under the asphalt; rises to just below the slab at the edge so crumbled
      // edges reveal shoulder gravel rather than a trench
      h = nr.hr - 0.06 - 0.24 * smoothstep(0, 1.1, -e);
    } else {
      const sh = this.sh;
      const hr = nr.hr;
      // shoulder: slight drop, gravelly unevenness
      let hEdge = hr - 0.07 - 0.1 * Math.min(1, e / sh);
      let e0 = sh;
      let dFlag = 0;
      if (nr.exact && nr.sp.meta.ditchL) {
        const fl = nr.side < 0 ? nr.sp.meta.ditchL : nr.sp.meta.ditchR;
        dFlag = fl[Math.min(fl.length - 1, nr.i)] || 0;
      }
      if (dFlag > 0.01) e0 = sh + 2.1 * dFlag;
      const delta = N - (hr - 0.17);
      const wv = 1.1 + Math.abs(delta) * (delta > 0 ? 0.55 : 1.45);
      const t = smoothstep(e0, e0 + Math.min(wv, 32), e);
      h = hEdge + delta * t + detail * smoothstep(e0, e0 + 2.5, e);
      if (e < sh) h = hEdge + detail * 0.08;
      // ditch profile (V/U shaped, 0.55 m deep)
      if (dFlag > 0.01 && e > sh && e < sh + 2.1 * dFlag) {
        const f = (e - sh) / (2.1 * dFlag);
        ditchV = Math.sin(Math.PI * f) * dFlag;
        h -= 0.6 * ditchV;
      }
    }
    // pads (flatten under set pieces)
    let padW = 0, padKind = 0;
    for (let i = 0; i < this.pads.length; i++) {
      const p = this.pads[i];
      const dx = x - p.x, dz = z - p.z;
      if (Math.abs(dx) > p.r || Math.abs(dz) > p.r) continue;
      // world -> local (three.js yaw convention)
      const ux = dx * p.cos - dz * p.sin, uz = dx * p.sin + dz * p.cos;
      const ox = Math.max(0, Math.abs(ux) - p.hx), oz = Math.max(0, Math.abs(uz) - p.hz);
      const od = Math.hypot(ox, oz);
      if (od >= p.blend) continue;
      const w = 1 - smoothstep(0, p.blend, od);
      if (w > padW) {
        // never raise the pad over the road surface (keep road priority)
        h = h * (1 - w) + (p.h + (e < 0 ? -0.28 : -0.03)) * w;
        padW = w;
        padKind = p.kind === 'concrete' ? 1 : p.kind === 'gravel' ? 0.66 : 0.33;
      }
    }
    // creek
    let wet = 0;
    if (this.creek) {
      const b = this.creek.net._nearest(x, z, 48, null, this._cb || (this._cb = { sp: null, i: 0, t: 0, d: 0 }));
      if (b) {
        const sp = b.sp;
        const a = sp.points[b.i], c = sp.points[b.i + 1];
        const Wl = a.y + (c.y - a.y) * b.t;
        const nearBridge = Math.abs(a.c ?? 0) < 16;
        const slope = nearBridge ? 0.42 : 0.62 + 0.2 * this.noise2.noise2D(x / 20, z / 20);
        const bed = Wl - this.creek.depth + Math.max(0, b.d - this.creek.bedHalf) * slope + this.noise2.noise2D(x / 3, z / 3) * 0.12;
        if (bed < h) {
          h = bed;
          wet = Math.max(wet, 1 - smoothstep(this.creek.bedHalf + 1, this.creek.bedHalf + 6, b.d));
        }
      }
    }
    for (const p of this.ponds) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + 4) {
        const k = 1 - smoothstep(p.r * 0.35, p.r + 3, d);
        h -= p.depth * k;
        wet = Math.max(wet, k);
      }
    }
    if (attr) {
      attr.e = nr.sp ? e : 99;
      attr.pad = padW > 0.01 ? padKind * padW : 0;
      attr.wet = Math.max(wet, ditchV * 0.8);
      attr.ditch = ditchV;
      attr.cut = nr.sp ? clamp((N - nr.hr) / 6, -1, 1) : 0;
    }
    return h;
  }

  // -------------------------------------------------------------------------------------
  // meshes
  // -------------------------------------------------------------------------------------
  /** Origins [tx, tz] of every tile that touches the road corridor (in build order). */
  tileOrigins() {
    if (this._origins) return this._origins;
    const T = W.terrainTile;
    const keys = [];
    for (let tz = this.minz; tz < this.maxz; tz += T) {
      for (let tx = this.minx; tx < this.maxx; tx += T) {
        // tile relevant if any coarse cell inside is within the corridor
        let near = false;
        for (let z = tz; z <= tz + T && !near; z += 8) for (let x = tx; x <= tx + T && !near; x += 8) if (this._coarseDist(x, z) < W.corridor) near = true;
        if (near) keys.push([tx, tz]);
      }
    }
    this._origins = keys;
    return keys;
  }

  /**
   * Declare the tiles that will be built later (progressive world build): until then sample()
   * computes the exact same surface on demand.
   */
  setPending(origins) {
    this._pending = new Set(origins.map(([tx, tz]) => this._tileKey(tx, tz)));
    if (!this._fmask) this._buildFeatureMask();
  }

  /** Key of the tile containing (x, z). */
  tileKeyAt(x, z) {
    const T = W.terrainTile;
    return this._tileKey(Math.floor((x - this.minx) / T) * T + this.minx, Math.floor((z - this.minz) / T) * T + this.minz);
  }

  /** True while the tile under (x, z) is declared but not built yet. */
  isPending(x, z) {
    return !!this._pending && this._pending.size > 0 && this._pending.has(this.tileKeyAt(x, z));
  }

  /** Build all tiles (or the given origins). Yields to the event loop regularly (await). */
  async build(onProgress, origins = null) {
    const keys = origins || this.tileOrigins();
    if (!this._fmask) this._buildFeatureMask();
    let done = 0;
    let lastYield = performance.now();
    for (const [tx, tz] of keys) {
      this.buildTile(tx, tz);
      done++;
      onProgress?.(done / keys.length);
      if (performance.now() - lastYield > 40) {
        await new Promise((r) => setTimeout(r, 0));
        lastYield = performance.now();
      }
    }
  }

  /** Build one 64 m tile now (no-op if built). Returns the tile (or null outside the corridor). */
  buildTile(tx, tz) {
    const key = this._tileKey(tx, tz);
    const have = this.tiles.get(key);
    if (have) return have;
    if (!this._fmask) this._buildFeatureMask();
    const T = W.terrainTile;
    const res = W.terrainRes;
    const n = T / res; // cells per side
    const attr = this._attr || (this._attr = { e: 0, pad: 0, wet: 0, ditch: 0, cut: 0 });
    {
      const nv = n + 1;
      const ap = nv + 2; // apron for normals
      const H = new Float32Array(ap * ap);
      const AE = new Float32Array(ap * ap * 4); // attributes per apron vertex (e, pad, wet, cut)
      const A = new Uint8Array(nv * nv * 4);
      const inside = new Uint8Array(nv * nv);
      const sample = (i, j) => {
        const x = tx + (i - 1) * res, z = tz + (j - 1) * res;
        const k = j * ap + i;
        H[k] = this.heightRaw(x, z, attr);
        AE[k * 4] = attr.e;
        AE[k * 4 + 1] = attr.pad;
        AE[k * 4 + 2] = attr.wet;
        AE[k * 4 + 3] = attr.cut;
      };
      // pass 1: every 2nd vertex exactly; pass 2: exact near roads / pads / water, else
      // bilinear from pass 1 (the far field is smooth hills: no visible difference, ~3x faster)
      for (let j = 0; j < ap; j += 2) for (let i = 0; i < ap; i += 2) sample(i, j);
      for (let j = 0; j < ap; j++) {
        for (let i = 0; i < ap; i++) {
          if (!(i & 1) && !(j & 1)) continue;
          const x = tx + (i - 1) * res, z = tz + (j - 1) * res;
          const i0 = i & ~1, j0 = j & ~1;
          const i1 = Math.min(ap - 1, i0 + 2), j1 = Math.min(ap - 1, j0 + 2);
          if (this._needsExact(x, z) || ((i & 1) && i1 === i0) || ((j & 1) && j1 === j0)) {
            sample(i, j);
            continue;
          }
          const fx = (i - i0) / 2, fz = (j - j0) / 2;
          const k00 = j0 * ap + i0, k10 = j0 * ap + i1, k01 = j1 * ap + i0, k11 = j1 * ap + i1;
          const w00 = (1 - fx) * (1 - fz), w10 = fx * (1 - fz), w01 = (1 - fx) * fz, w11 = fx * fz;
          const k = j * ap + i;
          H[k] = H[k00] * w00 + H[k10] * w10 + H[k01] * w01 + H[k11] * w11;
          for (let c = 0; c < 4; c++) AE[k * 4 + c] = AE[k00 * 4 + c] * w00 + AE[k10 * 4 + c] * w10 + AE[k01 * 4 + c] * w01 + AE[k11 * 4 + c] * w11;
        }
      }
      for (let j = 1; j <= nv; j++) {
        for (let i = 1; i <= nv; i++) {
          const x = tx + (i - 1) * res, z = tz + (j - 1) * res;
          const ka = (j * ap + i) * 4;
          const k = (j - 1) * nv + (i - 1);
          A[k * 4] = Math.round(clamp(AE[ka] / 30, 0, 1) * 255);
          A[k * 4 + 1] = Math.round(clamp(AE[ka + 1], 0, 1) * 255);
          A[k * 4 + 2] = Math.round(clamp(AE[ka + 2], 0, 1) * 255);
          A[k * 4 + 3] = Math.round(clamp(AE[ka + 3] * 0.5 + 0.5, 0, 1) * 255);
          inside[k] = this._coarseDist(x, z) < W.corridor + 6 ? 1 : 0;
        }
      }
      this._pending?.delete(key);
      const tile = this._makeTile(tx, tz, nv, ap, H, A, inside, res);
      if (tile) {
        this.tiles.set(key, tile);
        this.group.add(tile.mesh);
      }
      return tile;
    }
  }

  /** Coarse-grid mask of cells that need exact terrain samples (pads, creek, ponds, authored mods). */
  _buildFeatureMask() {
    const nx = this.cnx, nz = this.cnz;
    const m = (this._fmask = new Uint8Array(nx * nz));
    const stamp = (x, z, r) => {
      const i0 = Math.max(0, Math.floor((x - r - this.minx) / COARSE)), i1 = Math.min(nx - 1, Math.ceil((x + r - this.minx) / COARSE));
      const j0 = Math.max(0, Math.floor((z - r - this.minz) / COARSE)), j1 = Math.min(nz - 1, Math.ceil((z + r - this.minz) / COARSE));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) m[j * nx + i] = 1;
    };
    for (const p of this.pads) stamp(p.x, p.z, p.r + 3);
    for (const p of this.ponds) stamp(p.x, p.z, p.r + 8);
    for (const md of this.mods) stamp(md.x, md.z, md.r * 0.35);
    if (this.creek) for (const p of this.creek.spline.points) stamp(p.x, p.z, 20);
  }

  _needsExact(x, z) {
    if (this._coarseDist(x, z) < 34) return true;
    const i = Math.round((x - this.minx) / COARSE), j = Math.round((z - this.minz) / COARSE);
    if (i < 0 || j < 0 || i >= this.cnx || j >= this.cnz) return false;
    return this._fmask[j * this.cnx + i] === 1;
  }

  _tileKey(tx, tz) {
    return Math.round(tx / W.terrainTile) * 10007 + Math.round(tz / W.terrainTile);
  }

  _makeTile(tx, tz, nv, ap, H, A, inside, res) {
    const pos = new Float32Array(nv * nv * 3);
    const nrm = new Int8Array(nv * nv * 3);
    const heights = new Float32Array(nv * nv);
    let ymin = Infinity, ymax = -Infinity;
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nv; i++) {
        const k = j * nv + i;
        const h = H[(j + 1) * ap + (i + 1)];
        heights[k] = h;
        pos[k * 3] = tx + i * res;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = tz + j * res;
        if (inside[k]) {
          ymin = Math.min(ymin, h);
          ymax = Math.max(ymax, h);
        }
        const hl = H[(j + 1) * ap + i], hr = H[(j + 1) * ap + i + 2];
        const hd = H[j * ap + i + 1], hu = H[(j + 2) * ap + i + 1];
        let nx = hl - hr, ny = 2 * res, nz = hd - hu;
        const l = Math.hypot(nx, ny, nz);
        nrm[k * 3] = Math.round((nx / l) * 127);
        nrm[k * 3 + 1] = Math.round((ny / l) * 127);
        nrm[k * 3 + 2] = Math.round((nz / l) * 127);
      }
    }
    if (ymin === Infinity) return null;
    const big = nv * nv > 65535;
    const makeIndex = (step) => {
      const cap = Math.ceil((nv - 1) / step) ** 2 * 6;
      const idx = big ? new Uint32Array(cap) : new Uint16Array(cap);
      let n = 0;
      for (let j = 0; j < nv - 1; j += step) {
        for (let i = 0; i < nv - 1; i += step) {
          const a = j * nv + i, b = a + step, c = a + step * nv, d = c + step;
          if (!(inside[a] || inside[b] || inside[c] || inside[d])) continue;
          // alternate diagonal for less directional artefacts
          if ((i / step + j / step) & 1) {
            idx[n] = a; idx[n + 1] = c; idx[n + 2] = b; idx[n + 3] = b; idx[n + 4] = c; idx[n + 5] = d;
          } else {
            idx[n] = a; idx[n + 1] = c; idx[n + 2] = d; idx[n + 3] = a; idx[n + 4] = d; idx[n + 5] = b;
          }
          n += 6;
        }
      }
      return n === cap ? idx : idx.slice(0, n);
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
    geo.setAttribute('aTerrain', new THREE.BufferAttribute(A, 4, true));
    const full = makeIndex(1), coarse = makeIndex(2);
    if (!full.length) return null;
    geo.setIndex(new THREE.BufferAttribute(full, 1));
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(tx, ymin - 1, tz), new THREE.Vector3(tx + (nv - 1) * res, ymax + 1, tz + (nv - 1) * res));
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.name = 'terrainTile';
    const tile = {
      x: tx, z: tz, nv, res, heights, mesh, geo, lod: 0,
      indexFull: geo.index, indexCoarse: new THREE.BufferAttribute(coarse, 1),
      cx: tx + ((nv - 1) * res) / 2, cz: tz + ((nv - 1) * res) / 2,
    };
    return tile;
  }

  /**
   * Height of the terrain grid vertex at integer offsets (ox, oz) from (minx, minz): exactly the
   * value a built tile stores there (pass 1 samples at odd offsets, exact near roads / features,
   * else the average of the exact neighbours). Used before the tile itself is built.
   */
  _vertexHeight(ox, oz) {
    const key = ox * 65536 + oz;
    const c = this._vCache;
    const hit = c.get(key);
    if (hit !== undefined) return hit;
    const res = W.terrainRes;
    const x = this.minx + ox * res, z = this.minz + oz * res;
    const oddX = ox & 1, oddZ = oz & 1;
    let h;
    if ((oddX && oddZ) || this._needsExact(x, z)) h = this.heightRaw(x, z);
    else {
      const xs = oddX ? [ox] : [ox - 1, ox + 1], zs = oddZ ? [oz] : [oz - 1, oz + 1];
      let s = 0, n = 0;
      for (const a of xs) for (const b of zs) {
        s += this.heightRaw(this.minx + a * res, this.minz + b * res);
        n++;
      }
      h = s / n;
    }
    if (c.size > 200000) c.clear();
    c.set(key, h);
    return h;
  }

  /** Height where no tile is built (yet): the same triangulated grid surface as a built tile. */
  _sampleUnbuilt(x, z) {
    if (!this._vCache) this._vCache = new Map();
    if (!this._fmask) this._buildFeatureMask();
    const res = W.terrainRes;
    const fx = (x - this.minx) / res, fz = (z - this.minz) / res;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const h00 = this._vertexHeight(i, j), h10 = this._vertexHeight(i + 1, j);
    const h01 = this._vertexHeight(i, j + 1), h11 = this._vertexHeight(i + 1, j + 1);
    // tile-local parity of the diagonal (tiles start at multiples of 64 m from minx/minz)
    if ((i + j) & 1) {
      if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
      return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
    }
    if (v >= u) return h00 + (h11 - h01) * u + (h01 - h00) * v;
    return h00 + (h10 - h00) * u + (h11 - h10) * v;
  }

  /** Fast terrain height from the built tiles (bilinear). Unbuilt tiles: computed on demand. */
  sample(x, z) {
    const T = W.terrainTile;
    const tx = Math.floor((x - this.minx) / T) * T + this.minx;
    const tz = Math.floor((z - this.minz) / T) * T + this.minz;
    const tile = this.tiles.get(this._tileKey(tx, tz));
    if (!tile) {
      if (this._pending && this._pending.has(this._tileKey(tx, tz))) return this._sampleUnbuilt(x, z);
      return this._natural(x, z);
    }
    const fx = (x - tx) / tile.res, fz = (z - tz) / tile.res;
    const i = Math.min(tile.nv - 2, Math.max(0, Math.floor(fx))), j = Math.min(tile.nv - 2, Math.max(0, Math.floor(fz)));
    const u = fx - i, v = fz - j;
    const h = tile.heights, nv = tile.nv;
    const k = j * nv + i;
    // match the triangle split used by the mesh
    if ((i + j) & 1) {
      // a,c,b / b,c,d
      if (u + v <= 1) return h[k] + (h[k + 1] - h[k]) * u + (h[k + nv] - h[k]) * v;
      return h[k + nv + 1] + (h[k + nv] - h[k + nv + 1]) * (1 - u) + (h[k + 1] - h[k + nv + 1]) * (1 - v);
    }
    // a,c,d / a,d,b
    if (v >= u) return h[k] + (h[k + nv + 1] - h[k + nv]) * u + (h[k + nv] - h[k]) * v;
    return h[k] + (h[k + 1] - h[k]) * u + (h[k + nv + 1] - h[k + 1]) * v;
  }

  /** Per-frame LOD switching (cheap). */
  update(focus, drawDistance) {
    const far = W.terrainLodDist;
    for (const t of this.tiles.values()) {
      const d = Math.hypot(t.cx - focus.x, t.cz - focus.z);
      t.mesh.visible = d < drawDistance + 60;
      const lod = d > far ? 1 : 0;
      if (lod !== t.lod) {
        t.lod = lod;
        t.geo.setIndex(lod ? t.indexCoarse : t.indexFull);
      }
    }
  }

  /** Water surface ribbon along the creek. */
  buildCreekWater(material) {
    if (!this.creek) return null;
    const sp = this.creek.spline;
    const half = this.creek.bedHalf + this.creek.depth / 0.42 + 0.6;
    const n = sp.points.length;
    const pos = [], uv = [], idx = [];
    const cols = 5;
    for (let i = 0; i < n; i++) {
      const p = sp.points[i], t = sp.tangents[i];
      const rx = -t.z, rz = t.x;
      for (let c = 0; c < cols; c++) {
        const l = -half + (2 * half * c) / (cols - 1);
        pos.push(p.x + rx * l, p.y - 0.2, p.z + rz * l);
        uv.push(l, sp.cum[i]);
      }
      if (i < n - 1) {
        for (let c = 0; c < cols - 1; c++) {
          const a = i * cols + c, b = a + 1, d = a + cols, e = d + 1;
          idx.push(a, b, d, b, e, d);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = 'creekWater';
    mesh.receiveShadow = true;
    return mesh;
  }
}
