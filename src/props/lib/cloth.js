// Hanging cloth with cheap verlet physics (rags on a line, cloth tails on sacred trees, the ghost
// gate's white strips, curtains, ribbons).
//
// Borrowed from the owner's own game "special-telegram" (reuse approved by the owner):
//  - the verlet step (velocity = (P - O) * damping, gravity * h^2, pinned ends, a few
//    distance-constraint iterations) comes from HoseRope in src/modules/water/taps.ts;
//  - the wind terms (slow gust 0.6 + 0.4 sin(t * 0.37 + x * 0.05), travelling flutter
//    sin(t * 2.3 + phase) + sin(t * 4.1 + phase * 2.3)) come from WindCloth in
//    src/modules/world/realprops-market.ts.
// Here they drive a small particle grid per strip instead of a rope / a vertex shader.
//
// Cheap by design: only the cloth sets nearest the camera (within SIM_DIST, at most MAX_ACTIVE)
// are stepped, at a fixed 30 Hz; the rest keep their last pose. Each prop's strips share one
// mesh (one draw call per prop and material); cloth casts no shadow (static shadow caches).
//
// Usage inside a prop builder:   hangCloth(k, mat('cloth_static'), w, L, { p, r, color, ... })
// (same placement / colour / weathering options as Kit.add, plus nu, nv, pin, wind, back).
// The world calls updateCloth(dt) once a frame.
import * as THREE from 'three';
import { GLOBAL_UNIFORMS } from '../../render/index.js';
import { Kit, makeMatrix } from './kit.js';

const SIM_DIST = 30; // metres from the camera to the cloth's centre
const MAX_ACTIVE = 10; // cloth sets stepped per frame
const STEP = 1 / 30;
const ITER = 3;
const DAMP = 0.965;
const REST_PULL = 0.008; // shape memory: keeps the hand-made folds and stops strips wandering
const G = 9.81;

const registry = new Set();
let acc = 0;

/** One prop's strips of one material: a single mesh whose vertices are the particles. */
class ClothSet {
  constructor(parent, material, detail) {
    this.parent = parent;
    this.material = material;
    this.detail = detail;
    this.k = new Kit(parent.seed + 7, {});
    this.k.weather = parent.weather;
    this.strips = []; // {start, nu, nv, pin, back, plane}
    this.wind = 1;
    this.mesh = null;
  }

  add(w, L, o) {
    const nu = o.nu ?? Math.max(1, Math.round(w / 0.12));
    const nv = o.nv ?? Math.max(3, Math.min(12, Math.round(L / 0.09)));
    const geo = new THREE.PlaneGeometry(w, L, nu, nv).translate(0, -L / 2, 0);
    // the strip is placed through the parent kit's current transform stack
    this.k.stack = [this.parent.matrix.clone()];
    const b = this.k.buckets.get(this.material);
    const start = b ? b.count : 0;
    this.k.add(this.material, geo, o);
    geo.dispose();
    // the plane the strip hangs in (top centre + facing), for the optional "back" limit
    const m = makeMatrix(o.p, o.r, null, new THREE.Matrix4()).premultiply(this.parent.matrix);
    const origin = new THREE.Vector3().setFromMatrixPosition(m);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(m);
    this.strips.push({ start, nu, nv, pin: o.pin || 'top', back: o.back ?? Infinity, origin, normal });
    if (o.wind != null) this.wind = o.wind;
  }

  finish() {
    const geo = this.k.takeGeometry(this.material);
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.name = 'cloth';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.userData.noMerge = true;
    mesh.userData.cloth = true;
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geo.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    // room to swing without being frustum-culled
    let maxL = 0;
    for (const s of this.strips) maxL = Math.max(maxL, s.nv * 0.1);
    geo.boundingSphere.radius += maxL * 0.6 + 0.1;
    this.mesh = mesh;
    this.parent.objects.push({ object: mesh, detail: this.detail });
    this._setupSim(geo);
    registry.add(this);
  }

  _setupSim(geo) {
    const pos = geo.attributes.position.array;
    const n = pos.length / 3;
    this.n = n;
    this.P = pos; // particles live directly in the geometry
    this.O = Float32Array.from(pos);
    this.R = Float32Array.from(pos);
    this.N0 = Float32Array.from(geo.attributes.normal.array);
    this.inv = new Float32Array(n);
    this.plane = new Int16Array(n).fill(-1);
    const ca = [];
    const cl = [];
    const cw = [];
    const R = this.R;
    const link = (a, b2, stiff) => {
      ca.push(a, b2);
      cl.push(Math.hypot(R[a * 3] - R[b2 * 3], R[a * 3 + 1] - R[b2 * 3 + 1], R[a * 3 + 2] - R[b2 * 3 + 2]));
      cw.push(stiff);
    };
    this.strips.forEach((s, si) => {
      const row = s.nu + 1;
      const id = (i, j) => s.start + j * row + i;
      for (let j = 0; j <= s.nv; j++) {
        for (let i = 0; i <= s.nu; i++) {
          const v = id(i, j);
          const pinned = j === 0 && (s.pin === 'top' || (s.pin === 'corners' && (i === 0 || i === s.nu)) || (s.pin === 'left' && i === 0) || (s.pin === 'right' && i === s.nu));
          this.inv[v] = pinned ? 0 : 1;
          if (s.back !== Infinity) this.plane[v] = si;
        }
      }
      // top-down order converges fastest from the pins
      for (let j = 0; j <= s.nv; j++) {
        for (let i = 0; i <= s.nu; i++) {
          if (j < s.nv) link(id(i, j), id(i, j + 1), 1);
          if (i < s.nu) link(id(i, j), id(i + 1, j), 1);
          if (i < s.nu && j < s.nv) {
            link(id(i, j), id(i + 1, j + 1), 0.6);
            link(id(i + 1, j), id(i, j + 1), 0.6);
          }
          if (j + 2 <= s.nv) link(id(i, j), id(i, j + 2), 0.25); // a little bending stiffness
        }
      }
    });
    this.ca = Uint32Array.from(ca);
    this.cl = Float32Array.from(cl);
    this.cw = Float32Array.from(cw);
    this.center = geo.boundingSphere.center.clone();
    this.phase = (this.parent.seed * 0.6180339) % 1 * 40;
    this.attached = false;
    this.idle = 0;
  }

  /** One fixed step in mesh-local space. gL/wL: gravity and wind (local accel), t: time. */
  step(h, t, gL, wL, wx, flutterK) {
    const P = this.P, O = this.O, R = this.R, N0 = this.N0, inv = this.inv, n = this.n;
    const hh = h * h;
    // WindCloth gust (slow, travels across the world) + per-particle flutter waves down the cloth
    const gust = 0.6 + 0.4 * Math.sin(t * 0.37 + wx * 0.05 + this.phase);
    for (let v = 0; v < n; v++) {
      if (!inv[v]) continue;
      const o = v * 3;
      const wph = R[o] * 0.9 + R[o + 2] * 0.7 + R[o + 1] * 2.2 + this.phase;
      const sway = gust * (0.55 + 0.45 * Math.sin(t * 2.3 + wph));
      const flut = gust * (Math.sin(t * 4.1 + wph * 2.3) * 0.7 + Math.sin(t * 1.7 + wph * 1.3) * 0.3) * flutterK;
      const ax = gL.x + wL.x * sway + N0[o] * flut;
      const ay = gL.y + wL.y * sway + N0[o + 1] * flut;
      const az = gL.z + wL.z * sway + N0[o + 2] * flut;
      const px = P[o], py = P[o + 1], pz = P[o + 2];
      P[o] = px + (px - O[o]) * DAMP + ax * hh + (R[o] - px) * REST_PULL;
      P[o + 1] = py + (py - O[o + 1]) * DAMP + ay * hh + (R[o + 1] - py) * REST_PULL;
      P[o + 2] = pz + (pz - O[o + 2]) * DAMP + az * hh + (R[o + 2] - pz) * REST_PULL;
      O[o] = px;
      O[o + 1] = py;
      O[o + 2] = pz;
    }
    const ca = this.ca, cl = this.cl, cw = this.cw, nc = cl.length;
    for (let it = 0; it < ITER; it++) {
      for (let c = 0; c < nc; c++) {
        const a = ca[c * 2], b = ca[c * 2 + 1];
        const wa = inv[a], wb = inv[b], sw = wa + wb;
        if (!sw) continue;
        const oa = a * 3, ob = b * 3;
        const dx = P[ob] - P[oa], dy = P[ob + 1] - P[oa + 1], dz = P[ob + 2] - P[oa + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const k = ((d - cl[c]) / d) * cw[c] / sw;
        if (wa) {
          P[oa] += dx * k * wa;
          P[oa + 1] += dy * k * wa;
          P[oa + 2] += dz * k * wa;
        }
        if (wb) {
          P[ob] -= dx * k * wb;
          P[ob + 1] -= dy * k * wb;
          P[ob + 2] -= dz * k * wb;
        }
      }
    }
    // optional: do not swing more than `back` metres behind the hanging plane (trunks, walls)
    const plane = this.plane;
    for (let v = 0; v < n; v++) {
      const si = plane[v];
      if (si < 0 || !inv[v]) continue;
      const s = this.strips[si], o = v * 3;
      const d = (P[o] - s.origin.x) * s.normal.x + (P[o + 1] - s.origin.y) * s.normal.y + (P[o + 2] - s.origin.z) * s.normal.z;
      if (d < -s.back) {
        const k = -s.back - d;
        P[o] += s.normal.x * k;
        P[o + 1] += s.normal.y * k;
        P[o + 2] += s.normal.z * k;
      }
    }
  }
}

function hiddenUp(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return true;
  return false;
}

/**
 * Add a hanging cloth strip (w wide, L long, hanging down from its top edge at o.p) to kit k.
 * o: Kit.add options (p, r, s ignored, color, w, uv, deform, colorFn) +
 *    nu/nv grid segments, pin 'top'|'corners'|'left'|'right', wind (0..1.5, per prop),
 *    back (metres it may swing behind its hanging plane; default unlimited).
 */
export function hangCloth(k, material, w, L, o = {}) {
  const detail = !!(k.detail || o.detail);
  k.clothSets ??= new Map();
  const key = material.uuid + (detail ? ':d' : '');
  let set = k.clothSets.get(key);
  if (!set) {
    set = new ClothSet(k, material, detail);
    k.clothSets.set(key, set);
    (k.beforeBuild ??= []).push(() => set.finish());
  }
  set.add(w, L, { uv: 'keep', ...o, s: undefined });
  return k;
}

const _inv = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();
const _gL = new THREE.Vector3();
const _wL = new THREE.Vector3();
const _c = new THREE.Vector3();
const _cand = [];

/** Step the cloth near the camera. Call once a frame (the world does). */
export function updateCloth(dt, camPos = GLOBAL_UNIFORMS.uCameraPos.value) {
  if (!registry.size) return;
  acc = Math.min(acc + Math.min(dt, 0.1), STEP * 2);
  if (acc < STEP) return;
  let steps = 0;
  while (acc >= STEP && steps < 2) {
    acc -= STEP;
    steps++;
  }
  _cand.length = 0;
  for (const s of registry) {
    const mesh = s.mesh;
    if (!mesh.parent) {
      // never placed, or removed from the scene: forget it after a while
      if (++s.idle > (s.attached ? 30 : 1800)) registry.delete(s);
      continue;
    }
    s.attached = true;
    s.idle = 0;
    _c.copy(s.center).applyMatrix4(mesh.matrixWorld);
    const d2 = _c.distanceToSquared(camPos);
    if (d2 > SIM_DIST * SIM_DIST) continue;
    s._d2 = d2;
    s._wx = _c.x + _c.z * 0.7;
    _cand.push(s);
  }
  if (!_cand.length) return;
  if (_cand.length > MAX_ACTIVE) {
    _cand.sort((a, b) => a._d2 - b._d2);
    _cand.length = MAX_ACTIVE;
  }
  const t = GLOBAL_UNIFORMS.uTime.value;
  const wd = GLOBAL_UNIFORMS.uWindDir.value;
  const ws = Math.max(0.18, Math.min(1.2, GLOBAL_UNIFORMS.uWindStrength.value));
  for (const s of _cand) {
    if (hiddenUp(s.mesh)) continue;
    // world gravity / wind into mesh-local space (props can be rotated / scaled)
    _inv.copy(s.mesh.matrixWorld).invert();
    _m3.setFromMatrix4(_inv);
    _gL.set(0, -G, 0).applyMatrix3(_m3);
    const wk = ws * s.wind;
    _wL.set(wd.x * 5.5 * wk, 0, wd.y * 5.5 * wk).applyMatrix3(_m3);
    const flutterK = 2.4 * wk;
    for (let i = 0; i < steps; i++) s.step(STEP, t - (steps - 1 - i) * STEP, _gL, _wL, s._wx, flutterK);
    const g = s.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
  }
}

/** Number of registered / last-active cloth sets (debug). */
export function clothStats() {
  return { sets: registry.size, active: _cand.length };
}
