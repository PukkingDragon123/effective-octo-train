// Breaking taxi glass. A PaneBreak lives on one pane (fl fr rl rr rear) and does it for real:
//   crackAt(uv)  an impact: a crushed star, then radial fractures racing out with concentric
//                spider-web rings: real thin ribbon geometry lying on the pane (mapped through the
//                pane's own uv fit, so it follows the window's exact shape and catches the light)
//   burst()      the tempered pane gives: the glass disappears from the frame except a jagged rim of
//                fragments (the pane's own surface, subdivided and cut by a jagged hole), and ~400
//                small irregular glass nuggets fly in with gravity,
//                bounce off the seats, the dash and the floor (body space, they ride with the car),
//                tinkle and settle where they land for the rest of the night
//   smear(p)     blood on the rim (g.blood spray/drip, photo decals; gore-aware)
//   afterwards   wind (and rain, when it rains) comes in through the hole
//   repair()     the next night: the glass is whole again (repairAllPanes(taxi) on a new night)
//   const b = breakPane(taxi, 'rr'); await b.crackAt({x:0.4,y:0.5}); b.burst({ from: worldPoint })
import * as THREE from 'three';
import { audio } from '../audio/index.js';
import { paintedMaterial, particles, GLOBAL_UNIFORMS } from '../render/index.js';
import { settings } from '../core/Settings.js';
import { Entity, rand, clamp, animate, TAU } from './util.js';
import { paneFrame, dirToBody, toBody } from './taxiGeo.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
const REGISTRY = new WeakMap(); // taxi -> Map(paneId -> PaneBreak)
let NUGGET = null;

/** An irregular tempered-glass nugget: a jittered, squashed icosahedron, flat-shaded facets. */
function nuggetGeometry() {
  if (NUGGET) return NUGGET;
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const p = g.attributes.position;
  const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const jit = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = key(p.getX(i), p.getY(i), p.getZ(i));
    if (!jit.has(k)) jit.set(k, [0.75 + Math.random() * 0.5, 0.75 + Math.random() * 0.5, 0.75 + Math.random() * 0.5]);
    const j = jit.get(k);
    p.setXYZ(i, p.getX(i) * j[0] * 1.15, p.getY(i) * j[1] * 0.55, p.getZ(i) * j[2]);
  }
  g.computeVertexNormals();
  g.userData.shared = true;
  NUGGET = g;
  return g;
}

/** Rough cabin collision in taxi body space: the height things land on at (x, z). */
function cabinFloor(x, z) {
  const ax = Math.abs(x);
  if (z < -0.62) return z < -0.95 ? 0.32 : 0.92 + (z + 0.62) * 0.25; // dash top, footwell under it
  if (z > -0.05 && z < 0.55 && ax > 0.1 && ax < 0.68) return 0.52; // front seat cushions
  if (z > 0.72 && z < 1.32 && ax < 0.72) return 0.5; // rear bench
  if (z >= 1.32) return 0.93; // parcel shelf
  return 0.24; // floor
}

// ---------------------------------------------------------------- pane geometry helpers
/** uv1 -> pane-local position through the pane's affine fit (inverse of Glass.uvAt). */
function uvToLocal(fit, u, v, out = new THREE.Vector3()) {
  const a = fit.cu.y, b = fit.cu.z, c = fit.cv.y, d = fit.cv.z;
  const det = a * d - b * c || 1e-6;
  const du = u - fit.cu.x, dv = v - fit.cv.x;
  const sx = (d * du - b * dv) / det, ty = (-c * du + a * dv) / det;
  return out.copy(fit.c).addScaledVector(fit.e1, sx).addScaledVector(fit.e2, ty);
}
function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi) inside = !inside;
  }
  return inside;
}
/** Subdivide a (possibly indexed) pane geometry n times (1 -> 4 triangles), keeping position + uv1. */
function subdivided(geo, n) {
  const g0 = geo.index ? geo.toNonIndexed() : geo;
  let P = Array.from(g0.attributes.position.array), U = Array.from((g0.attributes.uv1 || g0.attributes.uv).array);
  for (let it = 0; it < n; it++) {
    const P2 = [], U2 = [];
    for (let t = 0; t < P.length / 9; t++) {
      const p = (k) => P.slice(t * 9 + k * 3, t * 9 + k * 3 + 3), u = (k) => U.slice(t * 6 + k * 2, t * 6 + k * 2 + 2);
      const mid = (a, b) => a.map((x, i) => (x + b[i]) / 2);
      const [a, b, c] = [p(0), p(1), p(2)], [ua, ub, uc] = [u(0), u(1), u(2)];
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a), uab = mid(ua, ub), ubc = mid(ub, uc), uca = mid(uc, ua);
      for (const [x, y, z, ux, uy, uz] of [[a, ab, ca, ua, uab, uca], [ab, b, bc, uab, ub, ubc], [ca, bc, c, uca, ubc, uc], [ab, bc, ca, uab, ubc, uca]]) {
        P2.push(...x, ...y, ...z);
        U2.push(...ux, ...uy, ...uz);
      }
    }
    P = P2;
    U = U2;
  }
  return { P, U };
}

export class PaneBreak extends Entity {
  constructor(taxi, id) {
    super('paneBreak:' + id);
    this.taxi = taxi;
    this.id = id;
    this.pane = taxi.glass?.panes?.[id] || null;
    this.state = 'whole';
    this.impacts = [];
    // fracture lines are real geometry: thin flat ribbons lying on the pane, in the pane mesh's space
    this.crackMat = paintedMaterial({ color: 0xf2f6f4, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, emissive: 0x1a1f1d, envReflect: 2, brush: 0, puddles: 0 });
    this.crackMat.polygonOffset = true;
    this.crackMat.polygonOffsetFactor = -2;
    this.crackMat.polygonOffsetUnits = -6;
    this.rimMat = paintedMaterial({ color: 0xd8e6df, roughness: 0.04, metalness: 0.05, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, envReflect: 2.5, emissive: 0x070a09, brush: 0, puddles: 0 });
    this.group = new THREE.Group();
    this.group.name = 'paneBreak_' + id;
    if (this.pane?.mesh) {
      this.pane.mesh.parent.add(this.group);
      this._follow();
    }
    this.crackMeshes = [];
    this.rim = null;
    this.shards = null;
    this.wind = null;
    this.drips = null;
    this._tink = 0;
    this._keep = new Set([nuggetGeometry()]);
  }

  _follow() {
    const m = this.pane.mesh;
    this.group.position.copy(m.position);
    this.group.quaternion.copy(m.quaternion);
    this.group.scale.copy(m.scale);
  }

  /** Ribbon geometry for crack polylines given in uv (segments optionally filtered). */
  _ribbons(rays, keep = null) {
    const fit = this.pane.fit;
    const n = fit.nrm.clone().normalize();
    const pos = [], order = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), side = new THREE.Vector3();
    for (const r of rays) {
      for (let i = 1; i < r.pts.length; i++) {
        const [u0, v0] = r.pts[i - 1], [u1, v1] = r.pts[i];
        if (keep && !keep((u0 + u1) / 2, (v0 + v1) / 2)) continue;
        uvToLocal(fit, u0, v0, a).addScaledVector(n, 0.0015);
        uvToLocal(fit, u1, v1, b).addScaledVector(n, 0.0015);
        side.subVectors(b, a).cross(n).normalize().multiplyScalar(r.w * (1 - (i / r.pts.length) * 0.6));
        pos.push(a.x - side.x, a.y - side.y, a.z - side.z, a.x + side.x, a.y + side.y, a.z + side.z, b.x + side.x, b.y + side.y, b.z + side.z);
        pos.push(a.x - side.x, a.y - side.y, a.z - side.z, b.x + side.x, b.y + side.y, b.z + side.z, b.x - side.x, b.y - side.y, b.z - side.z);
        order.push(i / r.pts.length);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return { g, order };
  }

  /** Add an impact at mask uv {x, y} (0..1). opts { strength 0..1, rays, grow (s) }. Resolves when grown. */
  async crackAt(uv, opts = {}) {
    if (this.state === 'broken' || !this.pane?.fit) return;
    const cx = uv.x ?? 0.5, cy = uv.y ?? 0.5;
    const strength = opts.strength ?? 0.7;
    const n = opts.rays ?? Math.round(9 + strength * 7);
    const fit = this.pane.fit;
    const wM = Math.max(0.2, fit.size?.[0] ?? 0.6), hM = Math.max(0.2, fit.size?.[1] ?? 0.4);
    const rays = [];
    // radial fractures (widths in metres), side branches, then spider-web rings between the rays
    const main = [];
    for (let i = 0; i < n; i++) {
      let a = (i / n) * TAU + rand(-0.18, 0.18);
      const len = 0.08 + strength * rand(0.18, 0.42);
      const pts = [[cx, cy]];
      let x = cx, y = cy;
      const steps = 10 + ((Math.random() * 6) | 0);
      for (let k = 1; k <= steps; k++) {
        a += rand(-0.22, 0.22);
        x += (Math.cos(a) * len) / steps / (wM / 0.6);
        y += (Math.sin(a) * len) / steps / (hM / 0.4);
        pts.push([x, y]);
        if (Math.random() < 0.18 * strength) rays.push({ pts: [[x, y], [x + Math.cos(a + rand(-1, 1)) * len * 0.12, y + Math.sin(a + rand(-1, 1)) * len * 0.12]], w: 0.0004 });
      }
      const r = { pts, w: rand(0.0005, 0.0009) };
      rays.push(r);
      main.push(r);
    }
    for (const ring of [0.22, 0.45, 0.7]) {
      const pts = main.map((r) => r.pts[Math.floor((r.pts.length - 1) * ring)]).filter(Boolean);
      if (pts.length > 2) rays.push({ pts: [...pts, pts[0]], w: 0.00035 });
    }
    // the crushed star at the impact
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU), l = rand(0.004, 0.02);
      rays.push({ pts: [[cx, cy], [cx + Math.cos(a) * l, cy + Math.sin(a) * l]], w: 0.0012 });
    }
    this.impacts.push({ cx, cy, rays, strength });
    this.state = 'cracked';
    const { g } = this._ribbons(rays);
    const mesh = new THREE.Mesh(g, this.crackMat);
    mesh.renderOrder = 6;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.crackMeshes.push(mesh);
    const total = g.attributes.position.count;
    g.setDrawRange(0, 0);
    audio.play('bone_crack', { object: this.group, volume: 0.55 + strength * 0.4, rate: rand(1.6, 2.1) });
    audio.play('scratch_glass', { object: this.group, volume: 0.6, rate: rand(1.8, 2.4) });
    let last = 0;
    await animate(opts.grow ?? 0.32, (k) => {
      g.setDrawRange(0, Math.floor((total * k) / 3) * 3);
      if (k - last > 0.09) {
        last = k;
        if (Math.random() < 0.6) audio.play('spark', { object: this.group, volume: 0.18, rate: rand(1.8, 2.6) });
      }
    });
    g.setDrawRange(0, total);
  }

  /**
   * The pane bursts inward. opts { from, speed, count, shards=true }. The pane mesh hides; a jagged
   * cracked rim of real fragments (the pane's own surface, cut by the hole) stays in the frame.
   */
  burst(opts = {}) {
    if (this.state === 'broken' || !this.pane) return;
    this.state = 'broken';
    const imp = this.impacts[this.impacts.length - 1] || { cx: 0.5, cy: 0.5 };
    const icx = imp.cx, icy = imp.cy;
    const hole = [];
    const N = 46;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      const tx = c > 0 ? (1 - icx) / c : c < 0 ? -icx / c : Infinity;
      const ty = s > 0 ? (1 - icy) / s : s < 0 ? -icy / s : Infinity;
      const inset = 0.035 + Math.random() * 0.07 + (Math.random() < 0.22 ? rand(0.08, 0.2) : 0);
      const r = Math.max(0.05, Math.min(tx, ty) - inset);
      hole.push([icx + c * r, icy + s * r]);
    }
    this.hole = hole;
    this.pane.mesh.visible = false;
    // the rim: the pane's own triangles (subdivided), kept where they lie outside the hole
    try {
      const { P, U } = subdivided(this.pane.mesh.geometry, 3);
      const keep = [];
      for (let t = 0; t < P.length / 9; t++) {
        const u = (U[t * 6] + U[t * 6 + 2] + U[t * 6 + 4]) / 3, v = (U[t * 6 + 1] + U[t * 6 + 3] + U[t * 6 + 5]) / 3;
        if (!inPoly(hole, u, v)) keep.push(...P.slice(t * 9, t * 9 + 9));
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
      rg.computeVertexNormals();
      this.rim = new THREE.Mesh(rg, this.rimMat);
      this.rim.renderOrder = 6;
      this.rim.frustumCulled = false;
      this.group.add(this.rim);
    } catch (e) {
      console.warn('[shatter] rim', e);
    }
    // cracks survive only on the rim
    for (const m of this.crackMeshes) {
      m.geometry.dispose();
      m.removeFromParent();
    }
    this.crackMeshes = [];
    const rays = this.impacts.flatMap((i) => i.rays);
    if (rays.length) {
      const { g } = this._ribbons(rays, (u, v) => !inPoly(hole, u, v));
      const m = new THREE.Mesh(g, this.crackMat);
      m.renderOrder = 7;
      m.frustumCulled = false;
      this.group.add(m);
      this.crackMeshes.push(m);
    }
    // sound: a layered tempered-glass burst
    const at = this.group;
    audio.play('collision_thud', { object: at, volume: 1, rate: 1.35 });
    audio.play('scare_hit', { object: at, volume: 0.9, rate: 1.2 });
    audio.play('coins', { object: at, volume: 1, rate: 1.8 });
    audio.play('coins', { object: at, volume: 0.8, rate: 2.4, delay: 0.05 });
    audio.play('wind_chime', { object: at, volume: 0.45, rate: 2.6 });
    audio.play('scratch_glass', { object: at, volume: 0.9, rate: 2.8 });
    if (opts.shards !== false) this._spawnShards(opts);
    this._weather();
  }

  _spawnShards(opts) {
    const t = this.taxi;
    const f = paneFrame(t, this.id);
    const body = t.bodyInner || t.root;
    const N = dirToBody(t, f.normal, new THREE.Vector3()).normalize(); // outward
    const U = dirToBody(t, f.up, new THREE.Vector3()).normalize();
    const R = dirToBody(t, f.right, new THREE.Vector3()).normalize();
    const C = toBody(t, f.center, new THREE.Vector3());
    const count = opts.count ?? 420;
    const mat = paintedMaterial({ color: 0xcfe6dc, roughness: 0.04, metalness: 0.05, transparent: true, opacity: 0.82, envReflect: 2.5, emissive: 0x0a0e0c, brush: 0, puddles: 0, wet: 0.4 });
    const mesh = new THREE.InstancedMesh(nuggetGeometry(), mat, count);
    mesh.frustumCulled = false;
    mesh.name = 'glassNuggets_' + this.id;
    body.add(mesh);
    const P = [];
    const sp = opts.speed ?? 3.2;
    for (let i = 0; i < count; i++) {
      const u = rand(-0.5, 0.5) * f.w * 0.92, v = rand(-0.5, 0.5) * f.h * 0.92;
      const p = C.clone().addScaledVector(R, u).addScaledVector(U, v).addScaledVector(N, -0.01);
      const vel = N.clone().multiplyScalar(-sp * rand(0.35, 1.2)).addScaledVector(R, rand(-1, 1) * 0.9).addScaledVector(U, rand(-0.6, 1.1));
      P.push({ p, v: vel, r: new THREE.Euler(rand(0, TAU), rand(0, TAU), rand(0, TAU)), w: new THREE.Vector3(rand(-20, 20), rand(-20, 20), rand(-20, 20)), s: rand(0.006, 0.013) * (Math.random() < 0.07 ? 2.2 : 1), sleep: false, delay: rand(0, 0.06) });
    }
    this.shards = { mesh, mat, P };
    this._writeShards(0);
  }

  _writeShards(dt) {
    const S = this.shards;
    if (!S) return;
    let awake = 0;
    for (let i = 0; i < S.P.length; i++) {
      const s = S.P[i];
      if (!s.sleep && dt > 0) {
        if (s.delay > 0) s.delay -= dt;
        else {
          s.v.y -= 9.8 * dt;
          s.p.addScaledVector(s.v, dt);
          s.r.x += s.w.x * dt;
          s.r.y += s.w.y * dt;
          s.r.z += s.w.z * dt;
          // cabin side walls
          if (Math.abs(s.p.x) > 0.8 && Math.sign(s.v.x) === Math.sign(s.p.x) && s.p.y > 0.25) {
            s.p.x = Math.sign(s.p.x) * 0.8;
            s.v.x *= -0.35;
          }
          if (s.p.y > 1.36) {
            s.p.y = 1.36;
            s.v.y *= -0.2;
          }
          const fy = cabinFloor(s.p.x, s.p.z) + s.s * 0.4;
          if (s.p.y < fy) {
            s.p.y = fy;
            const hit = -s.v.y;
            s.v.y = hit * 0.28;
            s.v.x *= 0.55;
            s.v.z *= 0.55;
            s.w.multiplyScalar(0.5);
            if (hit > 1.2 && this._tink < 14) {
              this._tink++;
              audio.play('coins', { object: this.taxi.bodyInner || this.taxi.root, offset3: [s.p.x, s.p.y, s.p.z], volume: clamp(hit * 0.05, 0.03, 0.16), rate: rand(1.7, 2.6) });
            }
            if (s.v.lengthSq() < 0.02) {
              s.sleep = true;
              s.r.x = Math.round(s.r.x / (Math.PI / 2)) * (Math.PI / 2) + rand(-0.2, 0.2);
              s.r.z = Math.round(s.r.z / (Math.PI / 2)) * (Math.PI / 2) + rand(-0.2, 0.2);
            }
          }
          awake++;
        }
      }
      _q.setFromEuler(_e.set(s.r.x, s.r.y, s.r.z));
      _m.compose(s.p, _q, _s.setScalar(s.s));
      S.mesh.setMatrixAt(i, _m);
    }
    S.mesh.instanceMatrix.needsUpdate = true;
    S.awake = awake;
  }

  /** Blood dragged over the jagged rim (photo blood decals through the render module when present). */
  smear(world, dir = null, bl = null) {
    try {
      bl?.spray?.(world, dir || new THREE.Vector3(0, -1, 0), settings.get('gore') === 'reduced' ? 0.35 : 0.8);
      bl?.drip?.(world, 0.6);
    } catch (e) { /* optional */ }
  }

  _weather() {
    // wind (and rain, when it rains) comes in through the hole
    this.wind = audio.loop('amb_wind_trees', { object: this.group, volume: 0.35 });
    this.anchor = new THREE.Object3D();
    const f = paneFrame(this.taxi, this.id);
    this.anchor.position.copy(toBody(this.taxi, f.center.clone().addScaledVector(f.up, f.h * 0.45), new THREE.Vector3()));
    (this.taxi.bodyInner || this.taxi.root).add(this.anchor);
    try {
      this.drips = particles.emit('drips', { object: this.anchor, radius: Math.max(0.15, f.w * 0.4), height: 0.9, intensity: 0 });
    } catch (e) {
      this.drips = null;
    }
  }

  step(dt) {
    if (this.state !== 'broken' && this.pane?.mesh) this._follow();
    this._tink = Math.max(0, this._tink - dt * 20);
    if (this.shards && this.shards.awake !== 0) this._writeShards(dt);
    if (this.drips) this.drips.setIntensity((GLOBAL_UNIFORMS.uRain?.value ?? 0) > 0.12 ? 1 : 0);
    // the wind rises and falls with the car's speed
    if (this.wind) this.wind.setVolume(0.15 + clamp((this.taxi.speedKmh || 0) / 80, 0, 1) * 0.5, 0.3);
  }

  /** Whole again (a new night). */
  repair() {
    if (this.pane?.mesh) this.pane.mesh.visible = true;
    this.wind?.stop(0.5);
    this.drips?.dispose();
    this.anchor?.removeFromParent();
    if (this.shards) {
      this.shards.mesh.removeFromParent();
      this.shards.mat.dispose();
      this.shards = null;
    }
    for (const m of this.crackMeshes) m.geometry.dispose();
    this.rim?.geometry.dispose();
    this.group.removeFromParent();
    this.crackMat.dispose();
    this.rimMat.dispose();
    const reg = REGISTRY.get(this.taxi);
    if (reg?.get(this.id) === this) reg.delete(this.id);
    this.dispose();
  }
}

/** The PaneBreak for a taxi pane (created on first use). */
export function breakPane(taxi, id) {
  let reg = REGISTRY.get(taxi);
  if (!reg) REGISTRY.set(taxi, (reg = new Map()));
  let b = reg.get(id);
  if (!b || b.disposed) reg.set(id, (b = new PaneBreak(taxi, id)));
  return b;
}
/** Is a pane broken right now? */
export function isPaneBroken(taxi, id) {
  return REGISTRY.get(taxi)?.get(id)?.state === 'broken';
}
/** Repair every broken / cracked pane of a taxi (new night). */
export function repairAllPanes(taxi) {
  const reg = taxi && REGISTRY.get(taxi);
  if (!reg) return;
  for (const b of [...reg.values()]) b.repair();
  reg.clear();
}
