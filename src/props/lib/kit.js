// Prop construction kit: accumulate many small parts per material, bake painterly
// weathering into vertex colours (grime at the bottom, moss on top faces, rust streaks,
// low-frequency tonal variation) and merge everything into ONE mesh per material.
//
// Every merged geometry has the same attribute layout (position, normal, uv, color +
// index) so the world can further merge props per chunk by material if it wants.
import * as THREE from 'three';
import { makeRng, noise, smoothstep, clamp } from '../../core/math.js';

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _lp = new THREE.Vector3();

/** Default weathering. All amounts 0..1. Heights are prop-local metres. */
export const DEFAULT_WEATHER = {
  grime: 0.45, // darkening near the ground
  grimeH: 0.55, // height of the grime band
  ground: 0, // y of the ground for grime / ground moss
  moss: 0, // moss on up-facing surfaces
  mossLow: 0, // moss creeping up from the ground
  mossH: 0.6,
  mossColor: 0x56692c,
  streak: 0, // vertical dark/rust streaks on walls
  streakColor: 0x5b3a22,
  vary: 0.14, // low-frequency brightness variation (painterly unevenness)
  hueVary: 0.04, // slight warm/cool drift
  dust: 0, // pale dust on top faces (interiors)
  dustColor: 0xb8ad98,
  cavity: 0, // darken concave-ish/underside faces
};

function toColor(c, out = new THREE.Color()) {
  if (c == null) return out.setRGB(1, 1, 1);
  if (c.isColor) return out.copy(c);
  if (Array.isArray(c)) return out.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
  return out.set(c);
}

function makeMatrix(p, r, s, out = new THREE.Matrix4()) {
  if (p) {
    if (Array.isArray(p)) _t.set(p[0], p[1], p[2]);
    else _t.copy(p);
  } else _t.set(0, 0, 0);
  if (r == null) _q.identity();
  else if (typeof r === 'number') _q.setFromAxisAngle(_s.set(0, 1, 0), r);
  else if (r.isQuaternion) _q.copy(r);
  else {
    _e.set(r[0] || 0, r[1] || 0, r[2] || 0, r[3] || 'XYZ');
    _q.setFromEuler(_e);
  }
  if (s == null) _s.set(1, 1, 1);
  else if (typeof s === 'number') _s.set(s, s, s);
  else _s.set(s[0], s[1], s[2]);
  return out.compose(_t, _q, _s);
}

class Bucket {
  constructor(material) {
    this.material = material;
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.count = 0;
  }
}

export class Kit {
  /**
   * @param {number} seed
   * @param {object} weather overrides of DEFAULT_WEATHER for every part
   */
  constructor(seed = 1, weather = {}) {
    this.seed = seed;
    this.rng = makeRng(seed * 7919 + 13);
    this.buckets = new Map();
    this.detailBuckets = new Map();
    this.detail = false; // when true, parts go into the distance-culled detail LOD
    this.stack = [new THREE.Matrix4()];
    this.setWeather(weather);
    this.no = ((seed * 0.6180339) % 1) * 97.3; // noise offset per prop
  }

  setWeather(w) {
    const base = { ...DEFAULT_WEATHER, ...w };
    base.mossColorC = toColor(base.mossColor, new THREE.Color());
    base.streakColorC = toColor(base.streakColor, new THREE.Color());
    base.dustColorC = toColor(base.dustColor, new THREE.Color());
    this.weather = base;
    return this;
  }

  get matrix() {
    return this.stack[this.stack.length - 1];
  }

  /** Push a transform (position [x,y,z], rotation yaw|[x,y,z]|Quaternion, scale) */
  push(p, r, s) {
    const m = makeMatrix(p, r, s, new THREE.Matrix4());
    this.stack.push(m.premultiply(this.matrix));
    return this;
  }
  pop() {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }
  /** Run fn(kit) inside a pushed transform. */
  at(p, r, s, fn) {
    this.push(p, r, s);
    try {
      fn(this);
    } finally {
      this.pop();
    }
    return this;
  }

  /** Transform a local point by the current stack (returns new Vector3). */
  point(x, y, z) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.matrix);
  }

  /**
   * Add a geometry. o = { p, r, s, color, w (weather overrides | false), uv:'box'|'keep',
   *   uvScale, uvOffset:[u,v], jitter (normal displacement m), jitterFreq, deform(fnVec3),
   *   colorFn(pos, nor, color, localPos) (pos/nor prop space, localPos = geometry space), shade (brightness multiplier) }
   * The geometry is not modified (copied).
   */
  add(material, geo, o = {}) {
    if (!material) throw new Error('Kit.add: material missing');
    const map = this.detail || o.detail ? this.detailBuckets : this.buckets;
    let b = map.get(material);
    if (!b) {
      b = new Bucket(material);
      map.set(material, b);
    }
    const pa = geo.attributes.position;
    let na = geo.attributes.normal;
    if (!na) {
      geo.computeVertexNormals();
      na = geo.attributes.normal;
    }
    const ua = geo.attributes.uv;
    const ca = geo.attributes.color;
    const m = makeMatrix(o.p, o.r, o.s, _m4).premultiply(this.matrix);
    _nm.getNormalMatrix(m);
    const base = toColor(o.color, new THREE.Color());
    if (o.shade != null) base.multiplyScalar(o.shade);
    const w = o.w === false ? null : o.w ? { ...this.weather, ...o.w } : this.weather;
    if (w && o.w) {
      w.mossColorC = toColor(w.mossColor, new THREE.Color());
      w.streakColorC = toColor(w.streakColor, new THREE.Color());
      w.dustColorC = toColor(w.dustColor, new THREE.Color());
    }
    const uvMode = o.uv || (material.userData.uvMode ?? 'box');
    const uvs = (o.uvScale ?? 1) * (material.userData.uvScale ?? 1);
    const uo = o.uvOffset || [this.rng() * 7, this.rng() * 7];
    const jit = o.jitter || 0;
    const jf = o.jitterFreq || 4;
    const start = b.count;
    const no = this.no;
    for (let i = 0; i < pa.count; i++) {
      _p.fromBufferAttribute(pa, i);
      _n.fromBufferAttribute(na, i);
      if (o.deform) o.deform(_p, _n);
      if (jit) {
        const d = noise.noise3D(_p.x * jf + no, _p.y * jf, _p.z * jf - no) * jit;
        _p.addScaledVector(_n, d);
      }
      _lp.copy(_p);
      _p.applyMatrix4(m);
      _n.applyMatrix3(_nm).normalize();
      b.pos.push(_p.x, _p.y, _p.z);
      b.nor.push(_n.x, _n.y, _n.z);
      // uv
      if (uvMode === 'keep' && ua) {
        b.uv.push(ua.getX(i) * (o.uvScale ?? 1) + (o.uvOffset ? o.uvOffset[0] : 0), ua.getY(i) * (o.uvScale ?? 1) + (o.uvOffset ? o.uvOffset[1] : 0));
      } else {
        const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
        let u, v;
        if (ay >= ax && ay >= az) {
          u = _p.x;
          v = _p.z;
        } else if (ax >= az) {
          u = _p.z * Math.sign(_n.x || 1);
          v = _p.y;
        } else {
          u = -_p.x * Math.sign(_n.z || 1);
          v = _p.y;
        }
        b.uv.push(u * uvs + uo[0], v * uvs + uo[1]);
      }
      // colour
      if (ca) _c.fromBufferAttribute(ca, i).multiply(base);
      else _c.copy(base);
      if (w) weatherColor(_c, _p, _n, w, no);
      if (o.colorFn) o.colorFn(_p, _n, _c, _lp);
      b.col.push(_c.r, _c.g, _c.b);
    }
    if (geo.index) {
      const ia = geo.index;
      for (let i = 0; i < ia.count; i++) b.idx.push(start + ia.getX(i));
    } else {
      for (let i = 0; i < pa.count; i++) b.idx.push(start + i);
    }
    // negative determinant (mirrored scale) -> flip winding
    if (m.determinant() < 0) {
      const n0 = b.idx.length - (geo.index ? geo.index.count : pa.count);
      for (let i = n0; i < b.idx.length; i += 3) {
        const t = b.idx[i + 1];
        b.idx[i + 1] = b.idx[i + 2];
        b.idx[i + 2] = t;
      }
    }
    b.count += pa.count;
    return this;
  }

  /** Run fn with every added part going to the distance-culled detail LOD. */
  details(fn) {
    const d = this.detail;
    this.detail = true;
    try {
      fn(this);
    } finally {
      this.detail = d;
    }
    return this;
  }

  /**
   * Bake into a Group of one Mesh per material. opts {name, shadows=true, detailDistance=30}
   * Detail parts (small offerings, clutter) go into a THREE.LOD child that hides them beyond
   * detailDistance (three updates LODs automatically during render).
   */
  build(opts = {}) {
    const g = new THREE.Group();
    if (opts.name) g.name = opts.name;
    const mk = (b, parent, shadowsDefault) => {
      if (!b.count) return;
      const mesh = new THREE.Mesh(bucketGeometry(b), b.material);
      mesh.name = (opts.name || 'prop') + ':' + (b.material.name || 'mat');
      const sh = b.material.userData.shadows ?? shadowsDefault;
      mesh.castShadow = !!sh;
      mesh.receiveShadow = b.material.userData.receiveShadow ?? true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
    };
    for (const b of this.buckets.values()) mk(b, g, opts.shadows ?? true);
    if (this.detailBuckets.size) {
      const near = new THREE.Group();
      near.name = 'details';
      for (const b of this.detailBuckets.values()) mk(b, near, false);
      const lod = new THREE.LOD();
      lod.name = (opts.name || 'prop') + ':detailLOD';
      lod.addLevel(near, 0);
      lod.addLevel(new THREE.Object3D(), opts.detailDistance ?? 30);
      g.add(lod);
    }
    return g;
  }

  /** Bake one material bucket into a geometry (and remove it from the kit). */
  takeGeometry(material) {
    const b = this.buckets.get(material);
    if (!b) return null;
    this.buckets.delete(material);
    return bucketGeometry(b);
  }
}

function bucketGeometry(b) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  geo.setIndex(b.count > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/** Bake weathering into colour c (linear) for prop-local position p and normal n. */
export function weatherColor(c, p, n, w, no = 0) {
  if (w.vary) {
    const v = noise.noise3D(p.x * 0.55 + no, p.y * 0.55, p.z * 0.55) * 0.6 + noise.noise3D(p.x * 2.1, p.y * 2.1 + no, p.z * 2.1) * 0.4;
    c.multiplyScalar(1 + v * w.vary);
    if (w.hueVary) {
      const h = noise.noise3D(p.x * 0.3 - no, p.y * 0.3, p.z * 0.3 + 11) * w.hueVary;
      c.r *= 1 + h;
      c.b *= 1 - h;
    }
  }
  const hy = p.y - w.ground;
  if (w.grime) {
    const g = 1 - smoothstep(0, w.grimeH, hy + noise.noise3D(p.x * 3 + no, 0.5, p.z * 3) * 0.12);
    const k = w.grime * g * (0.7 + 0.3 * noise.noise3D(p.x * 5, p.y * 5, p.z * 5 + no));
    c.r *= 1 - k * 0.75;
    c.g *= 1 - k * 0.72;
    c.b *= 1 - k * 0.7;
  }
  if (w.streak && n.y < 0.6) {
    const s = noise.noise3D(p.x * 7.3 + no, p.y * 0.35, p.z * 7.3 - no);
    const s2 = noise.noise3D(p.x * 2.2 - no, p.y * 1.5 + 4, p.z * 2.2);
    const k = clamp((s - 0.15) * 1.6) * w.streak * (0.6 + 0.4 * s2);
    if (k > 0) c.lerp(w.streakColorC, k * 0.75).multiplyScalar(1 - k * 0.25);
  }
  if (w.cavity && n.y < -0.3) c.multiplyScalar(1 - w.cavity * Math.min(1, -n.y));
  if (w.dust && n.y > 0.5) {
    const k = w.dust * smoothstep(0.5, 0.95, n.y) * (0.6 + 0.4 * noise.noise3D(p.x * 6, p.y * 6, p.z * 6));
    c.lerp(w.dustColorC, k * 0.6);
  }
  if (w.moss || w.mossLow) {
    let m = 0;
    if (w.moss && n.y > 0.2) {
      const mn = noise.noise3D(p.x * 2.4 + no, p.y * 2.4, p.z * 2.4) * 0.6 + noise.noise3D(p.x * 9, p.y * 9, p.z * 9 - no) * 0.4;
      m = Math.max(m, smoothstep(0.2, 0.75, n.y) * smoothstep(-0.35, 0.25, mn) * w.moss);
    }
    if (w.mossLow) {
      const mn = noise.noise3D(p.x * 3.1 - no, p.y * 1.4, p.z * 3.1);
      m = Math.max(m, (1 - smoothstep(0, w.mossH, hy + mn * 0.25)) * w.mossLow * smoothstep(-0.5, 0.2, mn));
    }
    if (m > 0) {
      const mv = 0.75 + 0.5 * noise.noise3D(p.x * 13, p.y * 13, p.z * 13);
      _c2.copy(w.mossColorC).multiplyScalar(mv);
      c.lerp(_c2, clamp(m));
    }
  }
  return c;
}
const _c2 = new THREE.Color();

// ---------------------------------------------------------------------------
// Geometry generators. All return INDEXED BufferGeometries with normals.
// Origin conventions are documented per function.
// ---------------------------------------------------------------------------

function axisCoords(half, r, seg, bs) {
  const inner = Math.max(1e-4, half - r);
  const out = [];
  if (r > 1e-5) for (let b = 0; b < bs; b++) out.push(-inner - r * Math.cos((b / bs) * Math.PI * 0.5));
  const n = Math.max(1, Math.ceil((2 * inner) / seg));
  for (let i = 0; i <= n; i++) out.push(-inner + (2 * inner * i) / n);
  if (r > 1e-5) for (let b = bs - 1; b >= 0; b--) out.push(inner + r * Math.cos((b / bs) * Math.PI * 0.5));
  return out;
}

/**
 * Bevelled box centred at the origin. r = bevel radius, seg = max flat segment length
 * (number or [sx,sy,sz]; more segments = smoother weathering gradients), bs = bevel segments.
 * opts.bottom: true -> origin at the bottom face centre instead of centre.
 */
export function bevelBox(w, h, d, r = 0.015, seg = 0.35, bs = 1, opts = {}) {
  r = Math.min(r, w * 0.49, h * 0.49, d * 0.49);
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const sg = Array.isArray(seg) ? seg : [seg, seg, seg];
  const cx = axisCoords(hx, r, sg[0], bs), cy = axisCoords(hy, r, sg[1], bs), cz = axisCoords(hz, r, sg[2], bs);
  const ix = hx - r, iy = hy - r, iz = hz - r;
  const pos = [], nor = [], uv = [], idx = [];
  let vi = 0;
  const v = new THREE.Vector3(), q = new THREE.Vector3(), dd = new THREE.Vector3();
  const face = (axis, sign, us, vs) => {
    // axis: 0 x, 1 y, 2 z. us/vs coordinate lists for the two other axes
    const start = vi;
    for (let j = 0; j < vs.length; j++) {
      for (let i = 0; i < us.length; i++) {
        const a = us[i], bb = vs[j];
        if (axis === 0) v.set(sign * hx, bb, a * sign * -1);
        else if (axis === 1) v.set(a, sign * hy, bb * sign * -1);
        else v.set(a * sign, bb, sign * hz);
        q.set(clamp(v.x, -ix, ix), clamp(v.y, -iy, iy), clamp(v.z, -iz, iz));
        dd.subVectors(v, q);
        const len = dd.length();
        if (len > 1e-6) {
          dd.multiplyScalar(1 / len);
          if (r > 1e-5) v.copy(q).addScaledVector(dd, r);
        } else dd.set(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0);
        pos.push(v.x, v.y + (opts.bottom ? hy : 0), v.z);
        nor.push(dd.x, dd.y, dd.z);
        uv.push(i / (us.length - 1), j / (vs.length - 1));
        vi++;
      }
    }
    const nu = us.length;
    for (let j = 0; j < vs.length - 1; j++) {
      for (let i = 0; i < nu - 1; i++) {
        const a = start + j * nu + i, b2 = a + 1, c = a + nu, d2 = c + 1;
        idx.push(a, b2, d2, a, d2, c);
      }
    }
  };
  face(0, 1, cz, cy);
  face(0, -1, cz, cy);
  face(1, 1, cx, cz);
  face(1, -1, cx, cz);
  face(2, 1, cx, cy);
  face(2, -1, cx, cy);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return fixWinding(g);
}

/** Ensure triangles face along their vertex normals (flip any that don't). */
export function fixWinding(g) {
  const p = g.attributes.position, n = g.attributes.normal, ix = g.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let i = 0; i < ix.length; i += 3) {
    a.fromBufferAttribute(p, ix[i]);
    b.fromBufferAttribute(p, ix[i + 1]);
    c.fromBufferAttribute(p, ix[i + 2]);
    fn.subVectors(b, a).cross(c.sub(a));
    nn.fromBufferAttribute(n, ix[i]).add(_t.fromBufferAttribute(n, ix[i + 1])).add(_t.fromBufferAttribute(n, ix[i + 2]));
    if (fn.dot(nn) < 0) {
      const t = ix[i + 1];
      ix[i + 1] = ix[i + 2];
      ix[i + 2] = t;
    }
  }
  return g;
}

/** Box with origin at the bottom centre. */
export function bbox(w, h, d, r = 0.015, seg = 0.35, bs = 1) {
  return bevelBox(w, h, d, r, seg, bs, { bottom: true });
}

/**
 * Lathe from a 2D profile [[r, y], ...] (bottom → top). seg radial segments.
 * Origin on the axis; y as given.
 */
export function lathe(profile, seg = 12, phiStart = 0, phiLength = Math.PI * 2) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  const g = new THREE.LatheGeometry(pts, seg, phiStart, phiLength);
  return g;
}

/** Cylinder with chamfered rims, bottom at y=0. hs = height segments. */
export function cyl(rTop, rBot, h, seg = 12, ch = 0.01, hs = 1, caps = true) {
  const c = Math.min(ch, h * 0.3, Math.min(rTop, rBot) * 0.4);
  const prof = [];
  if (caps) prof.push([0, 0], [rBot - c, 0]);
  prof.push([rBot, c]);
  for (let i = 1; i < hs; i++) {
    const t = i / hs;
    prof.push([rBot + (rTop - rBot) * t, c + (h - 2 * c) * t]);
  }
  prof.push([rTop, h - c]);
  if (caps) prof.push([rTop - c, h], [0, h]);
  return lathe(prof, seg);
}

/** Sphere (indexed) centred at origin. */
export function sphere(r, ws = 10, hs = 8) {
  return new THREE.SphereGeometry(r, ws, hs);
}

/** Flat quad in XY plane facing +Z, centred. */
export function quad(w, h, ws = 1, hs = 1) {
  return new THREE.PlaneGeometry(w, h, ws, hs);
}

/** Torus (indexed). */
export function torus(R, r, rs = 6, ts = 16, arc = Math.PI * 2) {
  return new THREE.TorusGeometry(R, r, rs, ts, arc);
}

/**
 * Tube along a polyline (Vector3[]), variable radius rFn(t 0..1)|number, radial segments.
 * Uses parallel-transport frames (no twisting). Ends open unless caps.
 */
export function tube(points, radius = 0.01, radial = 5, caps = false, upHint = null) {
  const n = points.length;
  const pos = [], nor = [], uv = [], idx = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), tmp = new THREE.Vector3();
  // initial normal
  T.subVectors(points[Math.min(1, n - 1)], points[0]).normalize();
  if (upHint) N.copy(upHint);
  else if (Math.abs(T.y) < 0.9) N.set(0, 1, 0);
  else N.set(1, 0, 0);
  N.addScaledVector(T, -N.dot(T)).normalize();
  let len = 0;
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    T.subVectors(b, a);
    if (T.lengthSq() < 1e-12) T.set(0, 1, 0);
    T.normalize();
    N.addScaledVector(T, -N.dot(T));
    if (N.lengthSq() < 1e-8) N.set(T.y, -T.x, 0);
    N.normalize();
    B.crossVectors(T, N);
    if (i > 0) len += points[i].distanceTo(points[i - 1]);
    const t = n > 1 ? i / (n - 1) : 0;
    const r = typeof radius === 'function' ? radius(t, i) : radius;
    for (let k = 0; k <= radial; k++) {
      const ang = (k / radial) * Math.PI * 2;
      const cs = Math.cos(ang), sn = Math.sin(ang);
      tmp.copy(N).multiplyScalar(cs).addScaledVector(B, sn);
      pos.push(points[i].x + tmp.x * r, points[i].y + tmp.y * r, points[i].z + tmp.z * r);
      nor.push(tmp.x, tmp.y, tmp.z);
      uv.push(k / radial, len);
    }
  }
  const rr = radial + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * rr + k, b = a + 1, c = a + rr, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (caps) {
    for (const [i, s] of [[0, -1], [n - 1, 1]]) {
      const ci = pos.length / 3;
      const p = points[i];
      const tt = new THREE.Vector3().subVectors(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)]).normalize().multiplyScalar(s);
      pos.push(p.x, p.y, p.z);
      nor.push(tt.x, tt.y, tt.z);
      uv.push(0.5, 0.5);
      for (let k = 0; k < radial; k++) {
        const a = i * rr + k, b = a + 1;
        if (s < 0) idx.push(ci, a, b);
        else idx.push(ci, b, a);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return fixWinding(g);
}

/**
 * Sweep a 2D profile [[x,y],...] (x = sideways, y = up in the path frame) along a
 * polyline. up = world up hint (default Y). closed: profile loop.
 */
export function sweep(points, profile, { up = new THREE.Vector3(0, 1, 0), closed = false, scaleFn = null } = {}) {
  const n = points.length, m = profile.length;
  const pos = [], uv = [], idx = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), Bv = new THREE.Vector3();
  let len = 0;
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    T.subVectors(b, a).normalize();
    Bv.copy(up).addScaledVector(T, -up.dot(T)).normalize(); // frame up
    N.crossVectors(T, Bv).normalize(); // frame side (right)
    if (i > 0) len += points[i].distanceTo(points[i - 1]);
    const sc = scaleFn ? scaleFn(n > 1 ? i / (n - 1) : 0) : 1;
    let pl = 0;
    for (let k = 0; k < m; k++) {
      const [x, y] = profile[k];
      if (k > 0) pl += Math.hypot(x - profile[k - 1][0], y - profile[k - 1][1]);
      pos.push(points[i].x + N.x * x * sc + Bv.x * y * sc, points[i].y + N.y * x * sc + Bv.y * y * sc, points[i].z + N.z * x * sc + Bv.z * y * sc);
      uv.push(pl, len);
    }
  }
  const segs = closed ? m : m - 1;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < segs; k++) {
      const k2 = (k + 1) % m;
      const a = i * m + k, b = i * m + k2, c = (i + 1) * m + k, d = (i + 1) * m + k2;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Extrude a THREE.Shape (XY) by depth along +Z, centred on z. Indexed output. */
export function extrude(shape, depth, bevel = 0, curveSegments = 6) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  g.clearGroups();
  return indexed(g);
}

/** Make a non-indexed geometry indexed (sequential). */
export function indexed(g) {
  if (g.index) return g;
  const n = g.attributes.position.count;
  const ia = [];
  for (let i = 0; i < n; i++) ia.push(i);
  g.setIndex(ia);
  return g;
}

/** Irregular polygon "blob" disc (moss patch, stain, puddle) on XZ plane facing +Y. */
export function blob(rx, rz, seed = 1, seg = 18, rough = 0.35) {
  const rng = makeRng(seed);
  const pos = [0, 0, 0], nor = [0, 1, 0], uv = [0.5, 0.5], idx = [];
  const ph = rng() * 10;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const k = 1 + (noise.noise2D(Math.cos(a) * 1.3 + ph, Math.sin(a) * 1.3) * 0.7 + (rng() - 0.5) * 0.6) * rough;
    pos.push(Math.cos(a) * rx * k, 0, Math.sin(a) * rz * k);
    nor.push(0, 1, 0);
    uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  for (let i = 0; i < seg; i++) idx.push(0, 1 + ((i + 1) % seg), 1 + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Sample a quadratic-sag cable between a and b into `n+1` points (sag metres down at the middle). */
export function sagCurve(a, b, sag, n = 12, lateral = null, out = []) {
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    const s = 4 * t * (1 - t);
    p.y -= s * sag;
    if (lateral) p.addScaledVector(lateral, s);
    out.push(p);
  }
  return out;
}

/** CatmullRom-smoothed resample of control points into n points. */
export function smoothPath(ctrl, n = 16, tension = 0.5) {
  const c = new THREE.CatmullRomCurve3(ctrl, false, 'catmullrom', tension);
  return c.getPoints(n);
}

/**
 * Moulding run around a rectangle (post capital/base, plinth, cornice): profile [[r, y], ...]
 * bottom -> top, r = outward offset from the rectangle's faces (half sizes hw x hd). Each side
 * is its own strip with mitred corners, so the corners stay crisp. Origin at the axis, y as given.
 * opts.top / opts.bottom: close the ring with a flat cap at the last / first profile point.
 */
export function squareMoulding(hw, hd, profile, opts = {}) {
  const pos = [], idx = [];
  const C = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  const OUT = [[1, 0], [0, -1], [-1, 0], [0, 1]];
  const fn = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), a3 = new THREE.Vector3(), b3 = new THREE.Vector3(), c3 = new THREE.Vector3();
  for (let s = 0; s < 4; s++) {
    const [ax, az] = C[s], [bx, bz] = C[(s + 1) % 4];
    const base = pos.length / 3;
    for (const [r, y] of profile) pos.push(ax * (hw + r), y, az * (hd + r), bx * (hw + r), y, bz * (hd + r));
    for (let i = 0; i < profile.length - 1; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      // expected outward normal of this band (2D profile normal turned to the side)
      const dr = profile[i + 1][0] - profile[i][0], dy = profile[i + 1][1] - profile[i][1];
      const nx = dy, ny = -dr;
      a3.fromArray(pos, a * 3);
      b3.fromArray(pos, b * 3);
      c3.fromArray(pos, c * 3);
      fn.crossVectors(e1.subVectors(c3, a3), e2.subVectors(b3, a3));
      const want = OUT[s][0] * nx * fn.x + OUT[s][1] * nx * fn.z + ny * fn.y;
      if (want >= 0) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  const cap = (pi, up) => {
    const [r, y] = profile[pi];
    const base = pos.length / 3;
    pos.push(-(hw + r), y, -(hd + r), hw + r, y, -(hd + r), hw + r, y, hd + r, -(hw + r), y, hd + r);
    if (up) idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  if (opts.top) cap(profile.length - 1, true);
  if (opts.bottom) cap(0, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Turned (lathed) baluster / finial of height h: vase profile, seg radial segments. */
export function baluster(h, r, seg = 10) {
  const P = [[0, 0], [r * 1.0, 0], [r * 1.0, 0.08], [r * 0.7, 0.12], [r * 0.75, 0.18], [r * 1.15, 0.38], [r * 1.1, 0.5], [r * 0.6, 0.66], [r * 0.5, 0.74], [r * 0.85, 0.8], [r * 0.85, 0.86], [r * 1.05, 0.9], [r * 1.05, 1.0], [0, 1.0]];
  return lathe(P.map(([x, y]) => [x, y * h]), seg);
}

export { makeRng, noise, smoothstep, clamp };
