// Shared helpers for the creatures module: per-frame hooks, tiny tweens, gaze-safe random
// timing, material fading, organic noise and a verlet rope (hanging entrails, hair, vines).
import * as THREE from 'three';
import { engine } from '../core/Engine.js';
import { clamp, lerp, damp, smoothstep, noise } from '../core/math.js';

export { clamp, lerp, damp, smoothstep, noise };
export const TAU = Math.PI * 2;
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a); // transient FX only
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const env = (k, a, b, c, d) => smoothstep(a, b, k) * (1 - smoothstep(c, d, k));

/** Register a per-frame callback (after the characters at 20 by default). Returns off(). */
export function onFrame(fn, order = 22) {
  return engine.onUpdate((dt) => {
    try {
      fn(dt);
    } catch (e) {
      console.error('[creatures]', e);
    }
  }, order);
}

/** Resolve after `s` seconds of game time. */
export function sleep(s) {
  return new Promise((res) => {
    let t = 0;
    const off = engine.onUpdate((dt) => {
      t += dt;
      if (t >= s) {
        off();
        res();
      }
    }, -50);
  });
}

/** Animate fn(k 0..1, dt) over `dur` seconds (game time). Returns a Promise. */
export function animate(dur, fn, ease = (k) => k) {
  return new Promise((res) => {
    let t = 0;
    if (dur <= 0) {
      fn(1, 0);
      res();
      return;
    }
    const off = engine.onUpdate((dt) => {
      t += dt;
      const k = clamp(t / dur, 0, 1);
      try {
        fn(ease(k), dt);
      } catch (e) {
        console.error('[creatures]', e);
      }
      if (k >= 1) {
        off();
        res();
      }
    }, 21);
  });
}

export const easeInOut = (k) => k * k * (3 - 2 * k);
export const easeOut = (k) => 1 - (1 - k) * (1 - k) * (1 - k);
export const easeIn = (k) => k * k * k;

/** Base class for every creature entity: { root, update(dt), dispose() }. */
export class Entity {
  constructor(name, order = 22) {
    this.root = new THREE.Group();
    this.root.name = name;
    this.time = 0;
    this.disposed = false;
    this._offs = [];
    this._tasks = new Set();
    this._offs.push(onFrame((dt) => this._tick(dt), order));
  }
  _tick(dt) {
    if (this.disposed || !(dt > 0)) return;
    this.time += dt;
    for (const t of this._tasks) if (t(dt) === true) this._tasks.delete(t);
    this.step(dt);
  }
  /** Run fn(dt) every frame until it returns true. */
  task(fn) {
    this._tasks.add(fn);
    return () => this._tasks.delete(fn);
  }
  /** Per-frame logic (subclasses). Entities run themselves (engine order 22). */
  step() {}
  /** Contract method: entities update themselves every frame, so this is a no-op kept for callers. */
  update() {}
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const o of this._offs.splice(0)) o();
    this._tasks.clear();
    this.root.removeFromParent();
    disposeTree(this.root, this._keep);
  }
}

/** Dispose geometries / materials under root (skips shared ones listed in keep). */
export function disposeTree(root, keep = null) {
  root.traverse((o) => {
    if (o.isMesh || o.isPoints || o.isLine || o.isSprite) {
      if (o.geometry && !(keep && keep.has(o.geometry)) && !o.geometry.userData?.shared) o.geometry.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m && !(keep && keep.has(m)) && !m.userData?.shared) m.dispose?.();
    }
  });
}

/** Opacity fade for a hierarchy (materials are switched to transparent while fading). */
export function setOpacityDeep(root, a) {
  root.visible = a > 0.003;
  root.traverse((o) => {
    if (!o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.userData._baseT === undefined) {
        m.userData._baseT = m.transparent;
        m.userData._baseDW = m.depthWrite;
        m.userData._baseO = m.opacity;
      }
      const fade = a < 0.999;
      const was = m.transparent;
      m.transparent = fade || m.userData._baseT;
      m.opacity = m.userData._baseO * a;
      if (!m.userData._baseT) m.depthWrite = fade ? a > 0.5 : m.userData._baseDW;
      if (was !== m.transparent) m.needsUpdate = true;
    }
  });
}

/** World position of an object (allocates only `out`). */
export function worldPos(obj, out = new THREE.Vector3()) {
  obj.updateWorldMatrix(true, false);
  return out.setFromMatrixPosition(obj.matrixWorld);
}

/** Irregular "twitch" generator: holds, then snaps to a new random value. */
export class Twitch {
  constructor(rate = 1, amp = 1) {
    this.rate = rate;
    this.amp = amp;
    this.t = 0;
    this.v = 0;
    this.tgt = 0;
  }
  update(dt) {
    this.t -= dt;
    if (this.t <= 0) {
      this.t = (0.05 + Math.random() * Math.random() * 1.2) / Math.max(0.05, this.rate);
      this.tgt = (Math.random() * 2 - 1) * this.amp * (Math.random() < 0.2 ? 1 : 0.35);
    }
    this.v += (this.tgt - this.v) * (1 - Math.exp(-30 * dt));
    return this.v;
  }
}

/**
 * Verlet rope (entrails, hanging hair strands, vines). points are world-space; the first point
 * is pinned to `anchor()` every step. Gravity, damping, distance constraints.
 */
export class Rope {
  constructor(n, segLen, start, dir = new THREE.Vector3(0, -1, 0)) {
    this.n = n;
    this.seg = segLen;
    this.p = [];
    this.q = [];
    for (let i = 0; i < n; i++) {
      const v = start.clone().addScaledVector(dir, segLen * i);
      this.p.push(v);
      this.q.push(v.clone());
    }
    this.gravity = -6;
    this.damping = 0.985;
    this.stiff = 1;
    this.wind = new THREE.Vector3();
  }
  pin(pos) {
    this.p[0].copy(pos);
    this.q[0].copy(pos);
  }
  step(dt, extra = null) {
    dt = Math.min(dt, 1 / 30);
    const g = this.gravity * dt * dt;
    for (let i = 1; i < this.n; i++) {
      const p = this.p[i], q = this.q[i];
      const vx = (p.x - q.x) * this.damping, vy = (p.y - q.y) * this.damping, vz = (p.z - q.z) * this.damping;
      q.copy(p);
      p.x += vx + this.wind.x * dt * dt;
      p.y += vy + g;
      p.z += vz + this.wind.z * dt * dt;
      if (extra) extra(p, i, dt);
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < this.n; i++) {
        const a = this.p[i - 1], b = this.p[i];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = ((d - this.seg) / d) * this.stiff;
        if (i === 1) {
          b.x -= dx * diff;
          b.y -= dy * diff;
          b.z -= dz * diff;
        } else {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
          a.z += dz * diff * 0.5;
          b.x -= dx * diff * 0.5;
          b.y -= dy * diff * 0.5;
          b.z -= dz * diff * 0.5;
        }
      }
    }
  }
}

/**
 * A tube mesh that follows a polyline every frame (for ropes: entrails, wet hair strands).
 * radius(t 0..1) profile; radial segments; updates positions + normals in place.
 */
export class DynamicTube {
  constructor(n, radial, radiusFn, material) {
    this.n = n;
    this.radial = radial;
    this.radiusFn = radiusFn;
    const verts = n * (radial + 1);
    const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), uv = new Float32Array(verts * 2);
    const idx = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= radial; j++) {
        uv[(i * (radial + 1) + j) * 2] = j / radial;
        uv[(i * (radial + 1) + j) * 2 + 1] = i / (n - 1);
        if (i < n - 1 && j < radial) {
          const a = i * (radial + 1) + j, b = a + radial + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this._t = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._prevN = new THREE.Vector3(1, 0, 0);
  }
  /** pts: Vector3[] (length n) in the mesh's parent space. bulge(i, j) optional radius multiplier. */
  set(pts, bulge = null) {
    const { n, radial } = this;
    const pos = this.geometry.attributes.position.array, nor = this.geometry.attributes.normal.array;
    const T = this._t, N = this._n, B = this._b;
    N.copy(this._prevN);
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      T.subVectors(b, a);
      if (T.lengthSq() < 1e-12) T.set(0, -1, 0);
      T.normalize();
      // parallel transport of the normal
      N.addScaledVector(T, -N.dot(T));
      if (N.lengthSq() < 1e-6) N.set(T.y, -T.x, 0.3).addScaledVector(T, -0.3 * T.z);
      N.normalize();
      B.crossVectors(T, N);
      if (i === 0) this._prevN.copy(N);
      const r = this.radiusFn(i / (n - 1));
      const p = pts[i];
      for (let j = 0; j <= radial; j++) {
        const ang = (j / radial) * TAU;
        const c = Math.cos(ang), s = Math.sin(ang);
        const k = r * (bulge ? bulge(i, j) : 1);
        const nx = N.x * c + B.x * s, ny = N.y * c + B.y * s, nz = N.z * c + B.z * s;
        const o = (i * (radial + 1) + j) * 3;
        pos[o] = p.x + nx * k;
        pos[o + 1] = p.y + ny * k;
        pos[o + 2] = p.z + nz * k;
        nor[o] = nx;
        nor[o + 1] = ny;
        nor[o + 2] = nz;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
  }
}

/** Static tube along a curve with a radius profile (sculpted props: pestle, rims, cords). */
export function tubeGeometry(points, radiusFn, radial = 10, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  const n = Math.max(4, points.length * 6);
  const pts = curve.getSpacedPoints(n - 1);
  const tube = new DynamicTube(pts.length, radial, radiusFn, null);
  tube.set(pts);
  const g = tube.geometry;
  g.computeBoundingSphere();
  return g;
}

/** Find the first mesh material (for tinting / emissive pulses). */
export function eachMaterial(root, fn) {
  root.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) fn(m, o);
  });
}
