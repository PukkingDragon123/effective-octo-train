// Minimal 2D (XZ-plane) collision world for walking on foot: static circles and
// oriented boxes registered by props/world. Vehicles use the road corridor instead.
import * as THREE from 'three';

class Colliders {
  constructor() {
    this.circles = []; // {x, z, r, yMin, yMax, tag}
    this.boxes = []; // {x, z, hx, hz, cos, sin, yMin, yMax, tag}
    this.cell = 16;
    this.grid = new Map();
  }
  _key(ix, iz) {
    return ix * 73856093 ^ iz * 19349663;
  }
  _insert(entry, x, z, r) {
    const c = this.cell;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++) {
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
        const k = this._key(ix, iz);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(entry);
      }
    }
  }
  /** Vertical cylinder. */
  addCircle(x, z, r, opts = {}) {
    const e = { type: 'c', x, z, r, yMin: opts.yMin ?? -Infinity, yMax: opts.yMax ?? Infinity, tag: opts.tag || '' };
    this.circles.push(e);
    this._insert(e, x, z, r);
    return e;
  }
  /** Oriented box: centre, half extents (along local x / z), yaw in radians. */
  addBox(x, z, hx, hz, yaw = 0, opts = {}) {
    const e = {
      type: 'b', x, z, hx, hz, cos: Math.cos(yaw), sin: Math.sin(yaw),
      yMin: opts.yMin ?? -Infinity, yMax: opts.yMax ?? Infinity, tag: opts.tag || '',
    };
    this.boxes.push(e);
    this._insert(e, x, z, Math.hypot(hx, hz));
    return e;
  }
  /** Add a box from an Object3D's world-space bounding box (axis aligned). */
  addObjectBounds(object, pad = 0, opts = {}) {
    const b = new THREE.Box3().setFromObject(object);
    return this.addBox((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, (b.max.x - b.min.x) / 2 + pad, (b.max.z - b.min.z) / 2 + pad, 0, {
      yMin: b.min.y, yMax: b.max.y, ...opts,
    });
  }
  remove(entry) {
    for (const list of this.grid.values()) {
      const i = list.indexOf(entry);
      if (i >= 0) list.splice(i, 1);
    }
    const arr = entry.type === 'c' ? this.circles : this.boxes;
    const i = arr.indexOf(entry);
    if (i >= 0) arr.splice(i, 1);
  }
  removeTag(tag) {
    for (const e of [...this.circles, ...this.boxes]) if (e.tag === tag) this.remove(e);
  }
  /** Push a walker (circle radius r at pos, feet height y) out of all colliders. Mutates & returns pos. */
  resolve(pos, r = 0.3, y = pos.y) {
    const c = this.cell;
    const ix = Math.floor(pos.x / c), iz = Math.floor(pos.z / c);
    const seen = new Set();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.grid.get(this._key(ix + dx, iz + dz));
        if (!list) continue;
        for (const e of list) {
          if (seen.has(e)) continue;
          seen.add(e);
          if (y + 1.6 < e.yMin || y + 0.3 > e.yMax) continue;
          if (e.type === 'c') {
            const ddx = pos.x - e.x, ddz = pos.z - e.z;
            const d = Math.hypot(ddx, ddz);
            const min = e.r + r;
            if (d < min && d > 1e-5) {
              pos.x = e.x + (ddx / d) * min;
              pos.z = e.z + (ddz / d) * min;
            }
          } else {
            // world -> box local (three.js Y rotation convention: local = R(-yaw) * (p - c))
            const wx = pos.x - e.x, wz = pos.z - e.z;
            const ux = wx * e.cos - wz * e.sin;
            const uz = wx * e.sin + wz * e.cos;
            const cx = Math.max(-e.hx, Math.min(e.hx, ux));
            const cz = Math.max(-e.hz, Math.min(e.hz, uz));
            let ddx = ux - cx, ddz = uz - cz;
            let d = Math.hypot(ddx, ddz);
            let nx, nz;
            if (d < 1e-5) {
              // inside: push along smallest penetration axis
              const px = e.hx - Math.abs(ux), pz = e.hz - Math.abs(uz);
              if (px < pz) { nx = Math.sign(ux) || 1; nz = 0; d = -px; }
              else { nx = 0; nz = Math.sign(uz) || 1; d = -pz; }
            } else {
              nx = ddx / d; nz = ddz / d;
            }
            if (d < r) {
              const push = r - d;
              const ox = ux + nx * push, oz = uz + nz * push;
              // box local -> world (rotate by +yaw)
              pos.x = e.x + ox * e.cos + oz * e.sin;
              pos.z = e.z - ox * e.sin + oz * e.cos;
            }
          }
        }
      }
    }
    return pos;
  }
  clear() {
    this.circles.length = 0;
    this.boxes.length = 0;
    this.grid.clear();
  }
}

export const colliders = new Colliders();
