// World: road network + terrain + forest + placed props (contract: docs/ARCHITECTURE.md "world").
// STUB IMPLEMENTATION — the world agent replaces internals; signatures must stay.
import * as THREE from 'three';
import { LAYOUT } from './layout.js';
import { paintedMaterial } from '../render/index.js';

const UP = new THREE.Vector3(0, 1, 0);

/** Dense polyline spline with arc-length parameterisation. */
export class RoadSpline {
  constructor(id, points, { closed = false, width = LAYOUT.roadWidth } = {}) {
    this.id = id;
    this.closed = closed;
    this.width = width;
    this.points = points; // Vector3[] ~1 m apart
    this.cum = [0];
    for (let i = 1; i < points.length; i++) this.cum.push(this.cum[i - 1] + points[i].distanceTo(points[i - 1]));
    this.length = this.cum[this.cum.length - 1];
  }
  /** Sample at arc length s. Writes into out = {pos, tangent, right, up, width}. */
  sample(s, out = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), width: 0 }) {
    const L = this.length;
    s = this.closed ? ((s % L) + L) % L : Math.max(0, Math.min(L, s));
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= s) lo = mid; else hi = mid;
    }
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const t = (s - this.cum[lo]) / seg;
    out.pos.lerpVectors(this.points[lo], this.points[hi], t);
    out.tangent.subVectors(this.points[hi], this.points[lo]).normalize();
    out.right.crossVectors(out.tangent, UP).normalize();
    out.up.set(0, 1, 0);
    out.width = this.width;
    return out;
  }
}

/** Road graph: splines + projection queries. */
export class RoadNetwork {
  constructor() {
    this.splines = new Map();
    this.connections = []; // {kind:'fork'|'merge'|'junction', a:{id,s}, b:{id,s}}
  }
  add(spline) {
    this.splines.set(spline.id, spline);
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
   * Project a world position onto the nearest road.
   * Returns { id, s, lateral (+ = right of travel direction), distance, pos, tangent, right, width, onRoad }.
   * preferId biases ties toward the spline the vehicle is already on.
   */
  project(p, preferId = null) {
    let best = null;
    for (const sp of this.splines.values()) {
      const pts = sp.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const abx = b.x - a.x, abz = b.z - a.z;
        const len2 = abx * abx + abz * abz || 1;
        let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2;
        t = Math.max(0, Math.min(1, t));
        const cx = a.x + abx * t, cz = a.z + abz * t;
        let d = Math.hypot(p.x - cx, p.z - cz);
        if (sp.id === preferId) d -= 0.5;
        if (!best || d < best.d) best = { d, sp, i, t };
      }
    }
    const sp = best.sp;
    const s = sp.cum[best.i] + (sp.cum[best.i + 1] - sp.cum[best.i]) * best.t;
    const smp = sp.sample(s);
    const lateral = (p.x - smp.pos.x) * smp.right.x + (p.z - smp.pos.z) * smp.right.z;
    return {
      id: sp.id, s, lateral, distance: Math.abs(lateral), pos: smp.pos, tangent: smp.tangent, right: smp.right,
      width: sp.width, onRoad: Math.abs(lateral) < sp.width / 2,
    };
  }
}

export class World {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'world';
    this.road = new RoadNetwork();
    this.landmarks = {};
    this.pickups = {};
    this.fork = null;
  }

  /** Build everything. opts: { onProgress(fraction, label), quality }. */
  async build(opts = {}) {
    // stub: a big wobbly ring for main + short branches
    const R = 540;
    const main = [];
    const n = Math.round(LAYOUT.mainLength);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 * 0.97;
      const r = R + Math.sin(a * 5) * 30;
      main.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 3) * 4, Math.sin(a) * r));
    }
    this.road.add(new RoadSpline('main', main));
    const F = main[main.length - 1], M = main[0];
    const mk = (id, bulge) => {
      const pts = [];
      for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        const p = new THREE.Vector3().lerpVectors(F, M, t);
        const dir = new THREE.Vector3().subVectors(M, F).normalize();
        const side = new THREE.Vector3().crossVectors(dir, UP);
        p.addScaledVector(side, Math.sin(t * Math.PI) * bulge);
        pts.push(p);
      }
      return new RoadSpline(id, pts);
    };
    this.road.add(mk('ghost', -25));
    this.road.add(mk('human', 25));
    const spur = [];
    const j = this.road.sample('main', LAYOUT.mainLength * 0.068);
    for (let i = 0; i <= 600; i++) spur.push(j.pos.clone().addScaledVector(j.right, 600 - i));
    this.road.add(new RoadSpline('spur', spur));

    // ground + road ribbons
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2), paintedMaterial({ color: 0x1c2416 }));
    ground.position.y = -0.05;
    this.group.add(ground);
    for (const sp of this.road.splines.values()) this.group.add(this._ribbon(sp));

    // landmarks
    for (const [key, lm] of Object.entries(LAYOUT.landmarks)) {
      const sp = this.road.get(lm.spline);
      const s = lm.u * sp.length;
      const smp = sp.sample(s);
      const sideSign = lm.side === 'L' ? -1 : lm.side === 'R' ? 1 : 0;
      const pos = smp.pos.clone().addScaledVector(smp.right, sideSign * (sp.width / 2 + lm.offset));
      const yaw = Math.atan2(-smp.tangent.x, -smp.tangent.z);
      const stopPos = smp.pos.clone().addScaledVector(smp.right, LAYOUT.laneOffset * (sideSign <= 0 ? 1 : -1));
      this.landmarks[key] = { key, kind: lm.kind, pos, yaw, roadRef: { id: sp.id, s }, side: lm.side, waitPos: pos.clone(), stopPos, facing: yaw };
    }
    for (const k of LAYOUT.pickups) this.pickups[k] = this.landmarks[k];
    const f = this.landmarks.shrineMaRuay;
    this.fork = { pos: f.pos.clone(), yaw: f.yaw, leftSplineId: 'ghost', rightSplineId: 'human', mainS: this.road.length('main') };
    opts.onProgress?.(1, 'done');
    return this;
  }

  _ribbon(sp) {
    const pos = [];
    const idx = [];
    const tmp = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), width: 0 };
    const steps = Math.ceil(sp.length / 2);
    for (let i = 0; i <= steps; i++) {
      sp.sample((i / steps) * sp.length, tmp);
      const l = tmp.pos.clone().addScaledVector(tmp.right, -sp.width / 2);
      const r = tmp.pos.clone().addScaledVector(tmp.right, sp.width / 2);
      pos.push(l.x, l.y + 0.02, l.z, r.x, r.y + 0.02, r.z);
      if (i < steps) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return new THREE.Mesh(g, paintedMaterial({ color: 0x2b2c2e, roughness: 0.7 }));
  }

  /** Terrain/road surface height at x,z. */
  getHeight(x, z) {
    const pr = this.road.project(new THREE.Vector3(x, 0, z));
    return pr.distance < 8 ? pr.pos.y : 0;
  }

  /** Streaming / culling / animation. focus = Vector3 (camera or taxi). */
  update(dt, focus) {}
}
