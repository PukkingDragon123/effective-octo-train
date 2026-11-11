// Generic high-top basketball sneakers (an original design: no brand marks, no copied silhouette details),
// built around the character's own feet (model / bind space, foot pointing +Z) and skinned rigidly:
//   * sole: the foot outline + margin, extruded with a bevel; gum-charcoal outsole with tread grooves,
//     off-white midsole, a thin muted-red stripe, toe spring
//   * upper: a lofted shell over the foot (rounded heel, high collar to above the ankle, open on top
//     for the leg), leather panels (off-white body, grey toe cap, maroon heel counter), charcoal mesh
//     vamp panels with perforations, a padded collar rim with dark lining
//   * lacing: two rows of eyelet rings, criss-cross laces over a charcoal tongue
// The rear of each shoe follows the foot bone, the toe box the ball bone.
import * as THREE from 'three';

const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const table = (T, x) => {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 0; i < T.length - 1; i++) if (x <= T[i + 1][0]) return lerp(T[i][1], T[i + 1][1], (x - T[i][0]) / (T[i + 1][0] - T[i][0]));
  return T[T.length - 1][1];
};
const hash = (x) => { const s = Math.sin(x * 91.17) * 43758.5453; return s - Math.floor(s); };

class Builder {
  constructor() { this.P = []; this.N = []; this.C = []; this.SI = []; this.SW = []; }
  /** add a non-indexed triangle list (positions / normals arrays of xyz triples) with per-vertex colours */
  add(pos, nor, col, bone) {
    for (let i = 0; i < pos.length; i++) {
      this.P.push(...pos[i]); this.N.push(...nor[i]); this.C.push(...col[i]);
      this.SI.push(bone, 0, 0, 0); this.SW.push(1, 0, 0, 0);
    }
  }
  addGeometry(g, colorFn, bone) {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.computeVertexNormals();
    const p = ng.attributes.position, n = ng.attributes.normal;
    const pos = [], nor = [], col = [];
    for (let i = 0; i < p.count; i++) {
      pos.push([p.getX(i), p.getY(i), p.getZ(i)]);
      nor.push([n.getX(i), n.getY(i), n.getZ(i)]);
      col.push(colorFn(p.getX(i), p.getY(i), p.getZ(i)));
    }
    this.add(pos, nor, col, bone);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.computeBoundingSphere();
    return g;
  }
}

const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const LEATHER = C(0xe9e5dc), TOE = C(0xc9c6c0), HEEL = C(0x6a2a2c), MESH = C(0x45474b), MESH2 = C(0x2f3134);
const LINING = C(0x26272b), MID = C(0xe6e2d8), STRIPE = C(0x7a2c2a), OUT = C(0x3a3532), OUT2 = C(0x2a2624);
const LACE = C(0xf1efe8), EYELET = C(0x8c8d90), TONGUE = C(0x34363a);

/**
 * Foot measurements from the character's merged bind geometry: per side, the bbox of the vertices that
 * follow the foot / ball bones. Returns { L:{x0,x1,y0,z0,z1,top}, R:{...} } or null.
 */
export function measureFeet(geo, t) {
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const out = {};
  for (const s of ['l', 'r']) {
    const bones = new Set([t.index['foot_' + s], t.index['ball_' + s]].filter((i) => i !== undefined));
    const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
    for (let i = 0; i < pos.count; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (bones.has(si.getComponent(i, k))) w += sw.getComponent(i, k);
      if (w < 0.5) continue;
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z);
    }
    if (!(b.x1 > b.x0)) return null;
    out[s] = b;
  }
  return out;
}

function shoe(B, f, ankle, iFoot, iBall) {
  const m = 0.007;
  const cx = (f.x0 + f.x1) / 2, W = f.x1 - f.x0 + 2 * m;
  const z0 = f.z0 - m, z1 = f.z1 + m, L = z1 - z0;
  const ys = f.y0 + 0.022; // top of the sole (the foot sinks a little into the footbed)
  const yb = f.y0 - 0.012; // bottom of the outsole
  const WT = [[0, 0.1], [0.025, 0.5], [0.07, 0.7], [0.25, 0.78], [0.45, 0.8], [0.68, 1.0], [0.84, 0.94], [0.94, 0.72], [0.985, 0.38], [1, 0.08]];
  const wAt = (t) => W * table(WT, t);
  const spring = (t) => 0.009 * ss(0.78, 1, t); // toe spring
  const zt = (t) => z0 + t * L;
  const toeT = 0.72;
  // ---- sole: extruded outline (lofted rings so the toe spring and bevel follow the outline)
  {
    const N = 48;
    const rings = [[yb, 0.94], [yb + 0.004, 1.0], [ys - 0.006, 1.02], [ys, 0.99], [ys + 0.002, 0.95]];
    const outline = [];
    for (let i = 0; i <= N; i++) { const t = i / N; outline.push([t, -1]); }
    for (let i = N; i >= 0; i--) { const t = i / N; outline.push([t, 1]); }
    const P = (r, k) => {
      const [t, sd] = outline[k];
      const [y, sc] = rings[r];
      return [cx + sd * wAt(t) * 0.5 * sc, y + spring(t), zt(t)];
    };
    const col = (r, k) => {
      const [y] = rings[r];
      const t = outline[k][0];
      if (y <= yb + 0.005) return (Math.floor(t * 60) % 2 ? OUT : OUT2);
      if (y >= ys - 0.004 && y < ys + 0.001) return STRIPE;
      return MID;
    };
    for (const bone of [iFoot, iBall]) {
      const pos = [], nor = [], cl = [];
      for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < outline.length - 1; k++) {
        const tk = (outline[k][0] + outline[k + 1][0]) / 2;
        if ((bone === iBall) !== (tk > toeT)) continue;
        const a = P(r, k), b = P(r, k + 1), c = P(r + 1, k + 1), d = P(r + 1, k);
        const n = new THREE.Vector3().crossVectors(new THREE.Vector3(...b).sub(new THREE.Vector3(...a)), new THREE.Vector3(...d).sub(new THREE.Vector3(...a))).normalize();
        const flip = outline[k][1] > 0 ? -1 : 1;
        const nn = [n.x * flip, n.y * flip, n.z * flip];
        const tri = flip > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
        for (const v of tri) { pos.push(v); nor.push(nn); }
        const cc = col(r, k);
        for (let q = 0; q < 6; q++) cl.push(cc);
      }
      // bottom cap (tread)
      for (let k = 0; k < (outline.length - 1) / 2; k++) {
        const t0 = outline[k][0], t1 = outline[k + 1][0];
        const tk = (t0 + t1) / 2;
        if ((bone === iBall) !== (tk > toeT)) continue;
        const l0 = [cx - wAt(t0) * 0.47, yb + spring(t0), zt(t0)], r0 = [cx + wAt(t0) * 0.47, yb + spring(t0), zt(t0)];
        const l1 = [cx - wAt(t1) * 0.47, yb + spring(t1), zt(t1)], r1 = [cx + wAt(t1) * 0.47, yb + spring(t1), zt(t1)];
        for (const v of [l0, r1, r0, l0, l1, r1]) { pos.push(v); nor.push([0, -1, 0]); }
        const cc = Math.floor(tk * 40) % 2 ? OUT : OUT2;
        for (let q = 0; q < 6; q++) cl.push(cc);
      }
      B.add(pos, nor, cl, bone);
    }
  }
  // ---- upper: lofted shell (t along the foot, phi around the top), open collar for the leg
  const ankleH = Math.max(0.05, ankle.y - ys);
  const Hc = ankleH + 0.07; // high-top collar
  const HT = [[0, Hc * 0.97], [0.12, Hc], [0.36, Hc * 0.93], [0.44, 0.088], [0.6, 0.074], [0.78, 0.058], [0.92, 0.044], [0.98, 0.03], [1, 0.016]];
  const hAt = (t) => table(HT, t);
  const NT = 44, NP = 30;
  const phiAt = (j) => -0.18 + (Math.PI + 0.36) * (j / NP);
  const S = (t, phi) => {
    const w = wAt(t) * 0.5 * 1.01, h = hAt(t);
    const c = Math.cos(phi), s = Math.sin(phi);
    // superellipse: boxy toward the sole, rounded on top
    const ex = Math.sign(c) * Math.pow(Math.abs(c), 0.8), ey = Math.sign(s) * Math.pow(Math.abs(s), 0.62);
    return [cx - ex * w, ys + spring(t) + Math.max(-0.006, ey * h), zt(t)];
  };
  const openAt = (t, phi) => t < 0.42 && Math.abs(phi - Math.PI / 2) < lerp(0.95, 0.3, ss(0.3, 0.42, t)) && t > 0.035; // leg opening
  const lacing = (t, phi) => t >= 0.42 && t <= 0.72 && Math.abs(phi - Math.PI / 2) < 0.34;
  const colAt = (t, phi, y) => {
    const rel = (y - ys) / Math.max(0.01, hAt(t));
    if (lacing(t, phi)) return TONGUE;
    if (t < 0.4 && rel > 0.9) return LINING; // padded collar rim / lining edge
    if (t > 0.82) return TOE;
    if (t < 0.2 && rel < 0.62) return HEEL;
    if (t > 0.45 && t < 0.8 && rel < 0.7 && rel > 0.12) return hash(Math.floor(t * 90) * 7.1 + Math.floor(phi * 40)) > 0.55 ? MESH2 : MESH; // perforated mesh
    return LEATHER;
  };
  for (const bone of [iFoot, iBall]) {
    const pos = [], nor = [], cl = [];
    for (let i = 0; i < NT; i++) {
      const t0 = i / NT, t1 = (i + 1) / NT, tm = (t0 + t1) / 2;
      if ((bone === iBall) !== (tm > toeT)) continue;
      for (let j = 0; j < NP; j++) {
        const p0 = phiAt(j), p1 = phiAt(j + 1), pm = (p0 + p1) / 2;
        if (openAt(tm, pm)) continue;
        const a = S(t0, p0), b = S(t0, p1), c = S(t1, p1), d = S(t1, p0);
        const n = new THREE.Vector3().crossVectors(new THREE.Vector3(...d).sub(new THREE.Vector3(...a)), new THREE.Vector3(...b).sub(new THREE.Vector3(...a))).normalize();
        const nn = [n.x, n.y, n.z];
        for (const v of [a, c, b, a, d, c]) { pos.push(v); nor.push(nn); }
        const cc = colAt(tm, pm, (a[1] + c[1]) / 2);
        const jit = 0.94 + 0.06 * hash(i * 31 + j * 7);
        for (let q = 0; q < 6; q++) cl.push([cc[0] * jit, cc[1] * jit, cc[2] * jit]);
      }
    }
    B.add(pos, nor, cl, bone);
  }
  // ---- padded collar rim (a soft tube along the opening's top edge)
  {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const t = 0.2 + 0.17 * Math.cos(a), sd = Math.sin(a);
      const w = wAt(t) * 0.5 * 0.86, h = hAt(t);
      pts.push(new THREE.Vector3(cx + sd * w, ys + h - 0.004, zt(t)));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    B.addGeometry(new THREE.TubeGeometry(curve, 48, 0.0075, 8, true), () => LINING, iFoot);
  }
  // ---- eyelets (two rows) and criss-cross laces over the tongue
  const rowPt = (t, side) => { const p = S(t, Math.PI / 2 + side * 0.36); return new THREE.Vector3(p[0], p[1] + 0.002, p[2]); };
  const tEye = [0.45, 0.5, 0.55, 0.6, 0.65, 0.7];
  for (const t of tEye) for (const side of [-1, 1]) {
    const p = rowPt(t, side);
    const ring = new THREE.TorusGeometry(0.0034, 0.0011, 6, 12);
    ring.rotateX(Math.PI / 2);
    ring.translate(p.x, p.y, p.z);
    B.addGeometry(ring, () => EYELET, t > toeT ? iBall : iFoot);
  }
  for (let k = 0; k < tEye.length - 1; k++) for (const sd of [-1, 1]) {
    const a = rowPt(tEye[k], sd), b = rowPt(tEye[k + 1], -sd);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += 0.004;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    B.addGeometry(new THREE.TubeGeometry(curve, 8, 0.0016, 5, false), () => LACE, iFoot);
  }
  // top lace bow loops at the last eyelets
  {
    const a = rowPt(0.45, -1), b = rowPt(0.45, 1);
    for (const sd of [-1, 1]) {
      const p0 = (sd < 0 ? a : b).clone(), c1 = p0.clone().add(new THREE.Vector3(sd * 0.018, 0.016, -0.01)), p1 = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.006, 0));
      B.addGeometry(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, c1, p1), 10, 0.0016, 5, false), () => LACE, iFoot);
    }
  }
  // ---- heel pull tab
  {
    const t = 0.015, h = hAt(t);
    const tab = new THREE.BoxGeometry(0.014, 0.03, 0.003, 1, 3, 1);
    const p = tab.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) - (y + 0.015) * 0.12); p.setX(i, p.getX(i) * (1 - (y + 0.015) * 6)); }
    tab.translate(cx, ys + h + 0.006, zt(t) - 0.004);
    B.addGeometry(tab, () => STRIPE, iFoot);
  }
}

/** Skinned sneaker pair geometry for a template + its bind geometry (cached per person key). */
const cache = new Map();
export function sneakerGeometry(t, bindGeo, key) {
  if (key && cache.has(key)) return cache.get(key);
  const feet = measureFeet(bindGeo, t);
  if (!feet) return null;
  const B = new Builder();
  for (const s of ['l', 'r']) {
    const iFoot = t.index['foot_' + s], iBall = t.index['ball_' + s] ?? iFoot;
    if (iFoot === undefined) continue;
    shoe(B, feet[s], t.Gp[iFoot], iFoot, iBall);
  }
  const g = B.build();
  if (key) cache.set(key, g);
  return g;
}
