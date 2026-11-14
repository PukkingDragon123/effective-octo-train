// Soft cloth bags, modelled as cloth rather than boxes.
//  - buildClothBag(): Grandma Bua's held Thai market bag (ถุงผ้า), indigo hand-woven cotton. Its body is a
//    parametric soft surface: a rounded cross-section that bellies out low down, a sagging bottom wrapped
//    under to a seam, drape folds pulled toward the handle anchors, and small rumples. It has piped side and
//    bottom seams, a rolled top hem with running stitches, and two flat folded cloth handles gathered in the
//    hand. Textured with a photographed CC0 linen scan (colour + normal, see docs/credits/characters.md).
//    Grip frame: origin in the palm, the bag hangs along -Y, broad faces toward ±Z.
//  - softBagGeometry() / ribbonGeometry(): the same soft body and flat folded strap for skinned worn
//    bags (accessories.js), returned as plain geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintedMaterial } from '../../render/index.js';
import { noise, makeRng, smoothstep, lerp } from '../../core/math.js';
import { loadFabricTex } from './mhpack.js';

const TILE = 0.16; // metres per texture repeat
const WASH = 1.45; // sun-faded, much-washed indigo: lifts the dark scan (vertex colours may exceed 1)

/** soft super-elliptic section value */
const se = (t, p) => Math.sign(t) * Math.abs(t) ** p;

/** Grid surface: fn(u, v, out) → position (Vector3); u wraps if closedU. Returns indexed geometry with uv. */
function gridSurface(nu, nv, closedU, fn, uvScale = [1, 1]) {
  const cols = closedU ? nu + 1 : nu + 1;
  const P = new Float32Array(cols * (nv + 1) * 3), UV = new Float32Array(cols * (nv + 1) * 2);
  const p = new THREE.Vector3();
  let k = 0;
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) {
    const u = i / nu, v = j / nv;
    fn(closedU && i === nu ? 0 : u, v, p);
    P[k * 3] = p.x; P[k * 3 + 1] = p.y; P[k * 3 + 2] = p.z;
    UV[k * 2] = u * uvScale[0]; UV[k * 2 + 1] = v * uvScale[1];
    k++;
  }
  const idx = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Soft cloth bag body. opts: { w half width, d half depth (belly), h height, top y, sag, pinch (top depth),
 * seed, wrinkle }. The surface runs from the bottom seam (v=0) under the base, up the sides to the opening.
 * Returns { geo, rim: Vector3[] (the opening loop), side: [Vector3[], Vector3[]] (side seam lines),
 * bottom: Vector3[] (bottom seam line), section(θ, s) → point on the body (s 0..1 up the sides) }.
 */
export function softBagGeometry(opts = {}) {
  const W = opts.w ?? 0.15, D = opts.d ?? 0.055, H = opts.h ?? 0.3, top = opts.top ?? 0, sag = opts.sag ?? 0.03;
  const pinch = opts.pinch ?? 0.014, seed = opts.seed ?? 7, wr = opts.wrinkle ?? 1;
  const anchors = opts.anchors ?? [-0.07, 0.07];
  const yb = top - H;
  const width = (s) => W * (1 + 0.1 * Math.sin(Math.PI * Math.min(1, s * 1.35)) - 0.07 * s);
  const depth = (s) => lerp(D, pinch, smoothstep(0.12, 1, s));
  // s: -1..0 the base wrap (seam at -1), 0..1 the sides
  const point = (th, s, out) => {
    let w, d, y, x, z;
    const cx = se(Math.cos(th), 0.62), sz = se(Math.sin(th), 0.8);
    if (s < 0) {
      const k = -s; // 0 at the base edge, 1 at the seam
      const a = k * Math.PI / 2;
      w = width(0) * (1 - 0.07 * k);
      d = depth(0) * Math.cos(a);
      x = w * cx;
      const xs = x / Math.max(1e-4, w);
      y = yb - d * 0.55 * Math.sin(a) - sag * (1 - xs * xs) * Math.sin(a) - sag * 0.4 * (1 - xs * xs);
      z = d * sz;
    } else {
      w = width(s); d = depth(s);
      x = w * cx; z = d * sz;
      const xs = x / Math.max(1e-4, w);
      // the weight pulls the lower body down in the middle
      y = yb + s * H - sag * 0.4 * (1 - xs * xs) * (1 - smoothstep(0, 0.5, s));
      // the opening dips between the handle anchors and rises at them
      if (s > 0.85) {
        let lift = 0;
        for (const ax of anchors) lift += Math.exp(-(((x - ax) / 0.035) ** 2));
        y += (lift * 0.014 - 0.008) * smoothstep(0.85, 1, s);
      }
    }
    // cloth: drape folds toward the handle anchors, slumped rumples low down, fine noise
    const nx = Math.cos(th), nz = Math.sin(th);
    const up = Math.max(0, s);
    let f = 0;
    for (const ax of anchors) f += Math.exp(-(((x - ax) / 0.05) ** 2)) * Math.sin((x - ax) * 95) * 0.004 * smoothstep(0.35, 1, up);
    f += 0.0035 * noise.noise2D(th * 2.2 + seed, s * 3.1) + 0.0015 * noise.noise2D(th * 7 + seed * 3, s * 9);
    f += 0.003 * Math.sin(y * 70 + th * 2) * Math.exp(-up * 3.5);
    out.set(x + nx * f * 0.4 * wr, y, z + nz * f * wr);
    return out;
  };
  const NU = 72, NV = 40, NB = 10;
  const per = 2 * (2 * W + 2 * D) * 0.9;
  const geo = gridSurface(NU, NV + NB, true, (u, v, out) => {
    const s = v * (NV + NB) < NB ? -1 + (v * (NV + NB)) / NB : (v * (NV + NB) - NB) / NV;
    return point(u * Math.PI * 2, s, out);
  }, [per / TILE, (H + D * 1.5) / TILE]);
  const rim = [], sideA = [], sideB = [], bottom = [];
  const _p = new THREE.Vector3();
  for (let i = 0; i < 64; i++) rim.push(point((i / 64) * Math.PI * 2, 1, _p).clone());
  for (let j = 0; j <= 24; j++) { const s = -1 + (j / 24) * 2; sideA.push(point(0, s, _p).clone()); sideB.push(point(Math.PI, s, _p).clone()); }
  for (let i = 0; i <= 24; i++) bottom.push(point(lerp(0.02, Math.PI - 0.02, i / 24), -1, _p).clone());
  return { geo, rim, side: [sideA, sideB], bottom, point };
}

/**
 * Flat folded cloth strap swept along a curve: a rounded-rectangle section (folded edges) of width w and
 * thickness t; width(u) may taper. normalHint keeps the broad face oriented (e.g. the bag's face normal).
 */
export function ribbonGeometry(points, w = 0.028, t = 0.004, opts = {}) {
  const curve = points.isCurve ? points : new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
  const N = opts.segments ?? 48, R = 10;
  const hint = opts.normalHint || new THREE.Vector3(0, 0, 1);
  const len = curve.getLength();
  const P = [], UV = [], T = new THREE.Vector3(), B = new THREE.Vector3(), Nn = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    curve.getPointAt(u, c);
    curve.getTangentAt(u, T);
    const h = typeof hint === 'function' ? hint(u) : hint;
    Nn.copy(h).addScaledVector(T, -h.dot(T)).normalize(); // broad-face normal
    B.crossVectors(T, Nn).normalize(); // across the strap
    const ww = (opts.width ? opts.width(u) : w) / 2, tt = t / 2;
    for (let k = 0; k <= R; k++) {
      // rounded rectangle: flat faces with rolled (folded) edges
      const a = (k / R) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const px = Math.sign(ca) * Math.min(1, Math.abs(ca) * 1.6) * ww;
      const pz = sa * tt * (1 + 0.25 * (1 - Math.abs(ca)));
      P.push(c.x + B.x * px + Nn.x * pz, c.y + B.y * px + Nn.y * pz, c.z + B.z * px + Nn.z * pz);
      UV.push((k / R) * (2 * ww + 2 * tt) / TILE * 2, (u * len) / TILE);
    }
  }
  const idx = [];
  for (let i = 0; i < N; i++) for (let k = 0; k < R; k++) {
    const a = i * (R + 1) + k, b = a + 1, cc = a + R + 1, d = cc + 1;
    idx.push(a, b, cc, b, d, cc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** tube of radius r along a polyline (seam piping, rolled hem) with uv */
function pipe(points, r, closed = false, seg = 64) {
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed), seg, r, 6, closed);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (seg * 0.004) / TILE * 4, uv.getY(i) * 0.1);
  return g;
}

/** running stitches along a polyline, offset outward by `out` (fn(p) → normal) */
function stitches(points, out, step = 0.008, len = 0.0045, r = 0.0007) {
  const curve = new THREE.CatmullRomCurve3(points);
  const L = curve.getLength(), n = Math.max(2, Math.floor(L / step));
  const parts = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const u0 = (i + 0.2) / n, u1 = Math.min(1, u0 + len / L);
    curve.getPointAt(u0, a); curve.getPointAt(u1, b);
    const na = out(a), nb = out(b);
    a.addScaledVector(na, r * 0.6); b.addScaledVector(nb, r * 0.6);
    const mid = a.clone().lerp(b, 0.5).addScaledVector(na, r * 0.8); // the thread arches over the weave
    parts.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone()), 3, r, 3, false));
  }
  return parts;
}

/** vertex colours: tint × ambient occlusion from height and a folds term */
function paint(g, tint, aoFn) {
  const P = g.attributes.position, n = P.count, col = new Float32Array(n * 3);
  const c = new THREE.Color(tint), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i);
    const k = (aoFn ? aoFn(v) : 1) * WASH;
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

let _mat = null;
/** shared cloth-bag material: photographed CC0 indigo linen (colour + normal) under the painterly shading */
export function clothBagMaterial() {
  if (_mat) return _mat;
  _mat = paintedMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.93, brush: 0.2, wet: 0.25, puddles: 0, side: THREE.DoubleSide, normalScale: new THREE.Vector2(0.9, 0.9), name: 'glb-clothbag' });
  _mat.color.set(0x34405a); // until the scan arrives
  Promise.all([loadFabricTex('bag_indigo_linen.jpg', true), loadFabricTex('bag_indigo_linen_normal.jpg', false)]).then(([map, nrm]) => {
    if (map) { _mat.map = map; _mat.color.set(0xffffff); }
    if (nrm) _mat.normalMap = nrm;
    _mat.needsUpdate = true;
  });
  return _mat;
}

let _geo = null;
/** the held market bag geometry (cached, merged: one draw call) */
export function clothBagGeometry() {
  if (_geo) return _geo;
  const HANDLE = 0.17, H = 0.29, W = 0.15;
  const top = -HANDLE;
  const ax = 0.068;
  const body = softBagGeometry({ w: W, d: 0.058, h: H, top, sag: 0.03, pinch: 0.016, seed: 11, anchors: [-ax, ax] });
  const yb = top - H;
  const parts = [];
  // body: darker in the folds near the bottom and inside the opening
  parts.push(paint(body.geo, 0xffffff, (v) => 0.72 + 0.28 * smoothstep(yb - 0.05, yb + 0.12, v.y) - 0.1 * (1 - smoothstep(0.0, 0.03, Math.abs(v.z)))));
  // rolled top hem + piped side and bottom seams (self fabric, a shade darker)
  const rimOut = body.rim.map((p) => p.clone().multiply(new THREE.Vector3(1.01, 1, 1.12)));
  parts.push(paint(pipe(rimOut, 0.0045, true, 96), 0xd8dbe4));
  for (const s of body.side) parts.push(paint(pipe(s, 0.0032, false, 40), 0xbfc4d0));
  parts.push(paint(pipe(body.bottom, 0.003, false, 32), 0xb0b6c4));
  // running stitches in faded cotton thread just under the hem
  const thread = 0xb8b4a6;
  const outN = (p) => new THREE.Vector3(p.x * 0.2, 0, p.z).normalize();
  for (const half of [0, 1]) {
    const line = [];
    for (let i = 0; i <= 32; i++) line.push(body.point((half + i / 32) * Math.PI, 1 - 0.016 / H, new THREE.Vector3()));
    for (const st of stitches(line, outN)) parts.push(paint(st, thread));
  }
  // handles: front and back straps, from the anchors up into the fist, gathered narrow where held
  const rng = makeRng(5);
  for (const side of [1, -1]) {
    const zf = side * 0.016;
    const pts = [
      new THREE.Vector3(-ax, top - 0.035, zf * 1.05), new THREE.Vector3(-ax * 1.02, top + 0.01, zf * 1.1),
      new THREE.Vector3(-0.05, top + 0.08, zf * 0.9), new THREE.Vector3(-0.012, -0.012, side * 0.008),
      new THREE.Vector3(0, 0.006, side * 0.004),
      new THREE.Vector3(0.012, -0.012, side * 0.008), new THREE.Vector3(0.05, top + 0.08, zf * 0.9 + (rng() - 0.5) * 0.004),
      new THREE.Vector3(ax * 1.02, top + 0.01, zf * 1.1), new THREE.Vector3(ax, top - 0.035, zf * 1.05),
    ];
    const h = ribbonGeometry(pts, 0.028, 0.0045, {
      segments: 72,
      normalHint: new THREE.Vector3(0, 0, side),
      width: (u) => lerp(0.03, 0.013, smoothstep(0.25, 0.5, u) * (1 - smoothstep(0.5, 0.75, u))),
    });
    parts.push(paint(h, 0xe2e4ea));
    // stitched-down handle ends: a box-and-cross of stitches on the bag face
    for (const sx of [-1, 1]) {
      const cx = sx * ax, y0 = top - 0.04, y1 = top - 0.012, z = zf * 1.25;
      const sq = [[cx - 0.012, y0, z], [cx + 0.012, y0, z], [cx + 0.012, y1, z], [cx - 0.012, y1, z], [cx - 0.012, y0, z], [cx + 0.012, y1, z]].map((q) => new THREE.Vector3(...q));
      for (const st of stitches(sq, () => new THREE.Vector3(0, 0, side), 0.006, 0.004, 0.0008)) parts.push(paint(st, thread));
    }
  }
  const geos = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  _geo = mergeGeometries(geos, false);
  _geo.computeBoundingSphere();
  for (const g of geos) if (!parts.includes(g)) g.dispose();
  return _geo;
}

/** the held bag mesh */
export function buildClothBag() {
  const m = new THREE.Mesh(clothBagGeometry(), clothBagMaterial());
  m.castShadow = true;
  return m;
}
