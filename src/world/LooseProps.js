// Loose small props that rest on their surface and get knocked about. Two classes:
//   'light'  small light things (cans, cones, bags, buckets, tools): pushed, tipped, sent sliding
//   'nudge'  chairs, stools, crates, toolboxes: solid (static collider), shift a few cm at most
// Heavy things (drums, jars, tyres, big set pieces) are never loose. A deliberately small rigid-box solver (gravity, ground contact with
// friction, tipping torque toward the nearest stable face, pushes from a player capsule and the
// taxi's box). Only bodies near the player are simulated; everything else sleeps.
import * as THREE from 'three';
import { g } from '../game/context.js';
import { colliders } from '../core/Colliders.js';

const _box = new THREE.Box3();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _u = new THREE.Vector3();
const _q = new THREE.Quaternion(), _dq = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
const DOWN = new THREE.Vector3(0, -1, 0);
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];
const ACTIVE_R = 22; // simulate within this of the player (m)
const TAXI_HALF = new THREE.Vector3(0.95, 0.8, 2.35); // taxi body half extents (local, centre 0.8 m up)

export class LooseProps {
  constructor(world) {
    this.world = world;
    this.bodies = [];
    this._prevPlayer = new THREE.Vector3(1e9, 0, 0);
    this._prevTaxi = new THREE.Vector3(1e9, 0, 0);
  }

  /**
   * Register a loose object (already in the scene graph, positioned). opts.floor: y of the floor
   * it falls to when it leaves its surface (default: the ground under it); opts.drop: settle it
   * onto the ground now (no floating corners on slopes).
   */
  add(object, opts = {}) {
    object.updateMatrixWorld(true);
    // local half extents + the offset of the box centre from the object origin
    _inv.copy(object.matrixWorld).invert();
    _box.makeEmpty();
    object.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      _m.multiplyMatrices(_inv, o.matrixWorld);
      _box.union(o.geometry.boundingBox.clone().applyMatrix4(_m));
    });
    if (_box.isEmpty()) return null;
    const half = _box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const centre = _box.getCenter(new THREE.Vector3());
    const parent = object.parent;
    const b = {
      object, parent, half, centre,
      pos: object.getWorldPosition(new THREE.Vector3()),
      quat: object.getWorldQuaternion(new THREE.Quaternion()),
      vel: new THREE.Vector3(), ang: new THREE.Vector3(),
      awake: false, still: 0,
      start: null, support: 0, floor: opts.floor ?? null,
      mass: Math.max(0.5, half.x * half.y * half.z * 8 * (opts.density ?? 120)),
      cls: opts.cls === 'nudge' ? 'nudge' : 'light',
      home: null,
    };
    b.maxShift = b.cls === 'nudge' ? 0.1 : 2.0;
    if (opts.drop) this._drop(b);
    b.start = b.pos.clone();
    b.home = b.pos.clone();
    // chairs and stools are solid: the player bumps into them instead of walking through
    if (b.cls === 'nudge') colliders.addCircle(b.pos.x, b.pos.z, Math.max(0.12, Math.min(b.half.x, b.half.z) * 1.05), { tag: 'world' });
    b.support = this._lowest(b);
    this.bodies.push(b);
    return b;
  }

  /** World y of the lowest box corner. */
  _lowest(b) {
    let lo = Infinity;
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? b.half.x : -b.half.x, i & 2 ? b.half.y : -b.half.y, i & 4 ? b.half.z : -b.half.z).add(b.centre).applyQuaternion(b.quat).add(b.pos);
      if (_v.y < lo) lo = _v.y;
    }
    return lo;
  }

  /** Ground height under a body (the floor it falls to off its surface). */
  _ground(b) {
    const gy = this.world.getHeight(b.pos.x, b.pos.z);
    if (b.floor != null) return Math.max(gy, b.floor);
    return gy;
  }

  /** Rest the body on the ground: lowest corner touches the lowest ground under its footprint. */
  _drop(b) {
    let lo = Infinity;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
      _v.set(sx * b.half.x, 0, sz * b.half.z).add(b.centre).applyQuaternion(b.quat).add(b.pos);
      lo = Math.min(lo, this.world.getHeight(_v.x, _v.z));
    }
    b.pos.y += lo - this._lowest(b);
    this._write(b);
  }

  _write(b) {
    const o = b.object;
    // world pose -> parent space
    _m.compose(b.pos, b.quat, o.scale);
    if (b.parent) {
      b.parent.updateMatrixWorld();
      _m.premultiply(_inv.copy(b.parent.matrixWorld).invert());
    }
    _m.decompose(o.position, o.quaternion, _v);
    o.updateMatrix();
    o.updateMatrixWorld(true);
  }

  update(dt, focus) {
    if (!this.bodies.length || dt <= 0) return;
    dt = Math.min(dt, 1 / 30);
    // pushers: the player on foot (capsule) and the taxi (box)
    const pl = g?.player?.root, onFoot = g?.player?.mode === 'foot';
    const tx = g?.taxi?.root;
    const pp = pl && onFoot ? pl.getWorldPosition(_a) : null;
    let pv = null;
    if (pp) {
      pv = _u.copy(pp).sub(this._prevPlayer).divideScalar(dt);
      if (pv.lengthSq() > 400) pv.set(0, 0, 0);
      this._prevPlayer.copy(pp);
    }
    let tp = null, tvel = null;
    if (tx) {
      tx.updateMatrixWorld();
      tp = new THREE.Vector3().setFromMatrixPosition(tx.matrixWorld);
      tvel = tp.clone().sub(this._prevTaxi).divideScalar(dt);
      if (tvel.lengthSq() > 2500) tvel.set(0, 0, 0);
      this._prevTaxi.copy(tp);
    }
    const center = pp || focus;
    for (const b of this.bodies) {
      if (!b.object.visible && !b.awake) continue;
      const dx = b.pos.x - center.x, dz = b.pos.z - center.z;
      const near = dx * dx + dz * dz < ACTIVE_R * ACTIVE_R;
      const nearTaxi = tp && (b.pos.x - tp.x) ** 2 + (b.pos.z - tp.z) ** 2 < 36;
      if (!near && !nearTaxi && !b.awake) continue;
      const r = Math.max(b.half.x, b.half.z);
      // the player walks into it
      if (pp && pv) {
        const ex = b.pos.x - pp.x, ez = b.pos.z - pp.z;
        const d = Math.hypot(ex, ez);
        const nudge = b.cls === 'nudge';
        const reach = nudge ? Math.min(b.half.x, b.half.z) * 1.05 + 0.38 : r * 0.7 + 0.28;
        const sp = Math.hypot(pv.x, pv.z);
        if (d < reach && sp > 0.3 && b.pos.y < pp.y + 1.2) {
          const nx = ex / (d || 1), nz = ez / (d || 1);
          if (nudge) this._push(b, nx, nz, Math.min(0.35, sp * 0.15), 0.02);
          else {
            this._push(b, nx, nz, Math.min(1.6, sp) * 0.75, 0.22);
            b.pos.x = pp.x + nx * reach;
            b.pos.z = pp.z + nz * reach;
          }
        }
      }
      // the taxi bumps it
      if (nearTaxi) {
        _v.copy(b.pos).applyMatrix4(_inv.copy(tx.matrixWorld).invert());
        _v.y -= TAXI_HALF.y;
        const ox = TAXI_HALF.x + r * 0.6 - Math.abs(_v.x), oz = TAXI_HALF.z + r * 0.6 - Math.abs(_v.z);
        if (ox > 0 && oz > 0 && Math.abs(_v.y) < TAXI_HALF.y + b.half.y) {
          // push out along the shallower side, in world space
          if (ox < oz) _w.set(Math.sign(_v.x) || 1, 0, 0);
          else _w.set(0, 0, Math.sign(_v.z) || 1);
          _w.transformDirection(tx.matrixWorld);
          _w.y = 0;
          _w.normalize();
          const sp = Math.max(1.0, tvel ? tvel.length() : 0);
          if (b.cls === 'nudge') this._push(b, _w.x, _w.z, Math.min(0.6, sp * 0.1), 0.05);
          else {
            this._push(b, _w.x, _w.z, Math.min(6, sp * 0.8 + 0.4), 0.6);
            if (tvel) b.vel.addScaledVector(tvel, 0.35);
            b.pos.addScaledVector(_w, Math.min(ox, oz));
          }
        }
      }
      if (b.awake) this._step(b, dt);
    }
  }

  /** Impulse along (nx, nz) with speed v; tip = how much of it goes into toppling. */
  _push(b, nx, nz, v, tip) {
    b.awake = true;
    b.still = 0;
    b.vel.x += nx * v;
    b.vel.z += nz * v;
    b.vel.y += v * 0.12;
    // topple away from the push: axis = up x push direction
    const h = Math.max(0.2, b.half.y * 2);
    b.ang.x += nz * v * tip / h;
    b.ang.z += -nx * v * tip / h;
  }

  _step(b, dt) {
    b.vel.y -= 9.81 * dt;
    b.pos.addScaledVector(b.vel, dt);
    // integrate the orientation
    const wl = b.ang.length();
    if (wl > 1e-6) {
      _dq.setFromAxisAngle(_w.copy(b.ang).divideScalar(wl), wl * dt);
      b.quat.premultiply(_dq).normalize();
    }
    // the surface under it: its own shelf / bench until it slides off, then the floor
    const off = Math.hypot(b.pos.x - b.start.x, b.pos.z - b.start.z) > 0.25;
    const ground = this._ground(b);
    const surf = off || b.support <= ground + 0.05 ? ground : Math.max(ground, b.support);
    const lo = this._lowest(b);
    let contact = false;
    if (lo <= surf + 0.002) {
      contact = true;
      b.pos.y += surf - lo;
      if (b.vel.y < 0) b.vel.y *= -0.15;
      const f = Math.exp((b.cls === 'nudge' ? -25 : -10) * dt); // rough ground, heavy-ish things
      b.vel.x *= f;
      b.vel.z *= f;
      // gravity torque: fall toward the nearest stable face (tip over past the critical angle)
      let best = -2, bi = 0;
      for (let i = 0; i < 6; i++) {
        const d = _a.copy(AXES[i]).applyQuaternion(b.quat).dot(DOWN);
        if (d > best) {
          best = d;
          bi = i;
        }
      }
      const aw = _a.copy(AXES[bi]).applyQuaternion(b.quat);
      const tilt = Math.acos(Math.min(1, Math.max(-1, aw.dot(DOWN))));
      if (tilt > 1e-3) {
        _u.crossVectors(DOWN, aw).normalize(); // rotating about +u increases the tilt
        const hAlong = bi < 2 ? b.half.x : bi < 4 ? b.half.y : b.half.z;
        const hAcross = bi < 2 ? Math.min(b.half.y, b.half.z) : bi < 4 ? Math.min(b.half.x, b.half.z) : Math.min(b.half.x, b.half.y);
        const crit = Math.atan2(hAcross, hAlong);
        const k = 9.81 / Math.max(0.15, hAlong * 2);
        b.ang.addScaledVector(_u, (tilt > crit ? k : -k * 1.5) * Math.sin(Math.min(tilt, Math.PI / 2)) * dt);
      }
      b.ang.multiplyScalar(Math.exp(-3.5 * dt));
    } else {
      b.ang.multiplyScalar(Math.exp(-0.4 * dt));
    }
    // never further than its class allows from where it was placed
    const hx = b.pos.x - b.home.x, hz = b.pos.z - b.home.z;
    const hd = Math.hypot(hx, hz);
    if (hd > b.maxShift) {
      b.pos.x = b.home.x + (hx / hd) * b.maxShift;
      b.pos.z = b.home.z + (hz / hd) * b.maxShift;
      b.vel.x = b.vel.z = 0;
    }
    this._write(b);
    if (contact && b.vel.lengthSq() < 0.004 && b.ang.lengthSq() < 0.004) {
      b.still += dt;
      if (b.still > 0.6) {
        b.awake = false;
        b.vel.set(0, 0, 0);
        b.ang.set(0, 0, 0);
        b.start.copy(b.pos);
        b.support = this._lowest(b);
      }
    } else b.still = 0;
  }
}
