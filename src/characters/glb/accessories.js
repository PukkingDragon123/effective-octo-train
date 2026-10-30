// Accessories. Worn items (glasses, cap, helmet, headscarf, amulet necklace, shoulder bag, neck
// garland) are merged into one vertex-coloured skinned geometry per look (rigid bone weights; one
// draw call, twists with the head). Held items (basket, lunchbox, umbrella, cigarette, hand
// garland, player props) are small meshes parented to hand bones; hanging ones swing.
import * as THREE from 'three';
import { paintedMaterial } from '../../render/index.js';
import { makeRng } from '../../core/math.js';
import { headGrid } from './hair.js';

const _c = new THREE.Color();

/** tiny mesh builder: transformed primitives with vertex colours */
class MB {
  constructor() { this.parts = []; }
  add(geo, color, bone = 0, m = null, jitter = 0.06, seed = 1, colorFn = null) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    // per-triangle colour function sees the local (untransformed) centroid
    const P0 = g.attributes.position;
    const cen = [];
    if (colorFn) for (let i = 0; i < P0.count; i += 3) cen.push(new THREE.Vector3((P0.getX(i) + P0.getX(i + 1) + P0.getX(i + 2)) / 3, (P0.getY(i) + P0.getY(i + 1) + P0.getY(i + 2)) / 3, (P0.getZ(i) + P0.getZ(i + 1) + P0.getZ(i + 2)) / 3));
    if (m) g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const r = makeRng(seed);
    for (let i = 0; i < n; i += 3) {
      _c.set(colorFn ? colorFn(cen[i / 3], i / 3) : color);
      const k = 1 + (r() - 0.5) * jitter * 2;
      for (let j = 0; j < 3 && i + j < n; j++) { col[(i + j) * 3] = _c.r * k; col[(i + j) * 3 + 1] = _c.g * k; col[(i + j) * 3 + 2] = _c.b * k; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    this.parts.push({ g, bone });
    if (g !== geo) geo.dispose();
    return this;
  }
  build(skinned) {
    let n = 0;
    for (const p of this.parts) n += p.g.attributes.position.count;
    if (!n) return null;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
    const SI = skinned ? new Uint16Array(n * 4) : null, SW = skinned ? new Float32Array(n * 4) : null;
    let o = 0;
    for (const p of this.parts) {
      const g = p.g, c = g.attributes.position.count;
      P.set(g.attributes.position.array, o * 3);
      N.set(g.attributes.normal.array, o * 3);
      C.set(g.attributes.color.array, o * 3);
      if (skinned) for (let i = 0; i < c; i++) { SI[(o + i) * 4] = p.bone; SW[(o + i) * 4] = 1; }
      o += c;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    if (skinned) { geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4)); }
    geo.computeBoundingSphere();
    return geo;
  }
}
/** lathe from [r, y] pairs (smooth profile) */
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), seg);
/** tube along points */
const tube = (pts, r, seg = 24, rad = 6, closed = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed), seg, r, rad, closed);
/** jasmine bud: elongated teardrop */
const bud = () => lathe([[0, -0.011], [0.0035, -0.008], [0.0048, -0.003], [0.0042, 0.003], [0.0022, 0.008], [0, 0.0105]], 7);
const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));

// ------------------------------------------------------------------ worn (skinned, bind space)
const wornCache = new Map();
export function wornAccessoryGeometry(t, look) {
  const acc = look.acc.filter((a) => ['glasses', 'cap', 'helmet', 'headscarf', 'amulet-necklace', 'shoulder-bag'].includes(a));
  if (!acc.length) return null;
  const key = t.sex + '|' + acc.sort().join('+') + '|' + look.hair.style;
  if (wornCache.has(key)) return wornCache.get(key);
  const mb = new MB();
  const iHead = t.index.Head, iChest = t.index.spine_03, iNeck = t.index.neck_01, iPelvis = t.index.pelvis, iSpine = t.index.spine_01;
  const G = headGrid(t);
  const C = G.C;
  const e = t.eyeCenters;
  const hairOff = look.hair.style === 'shaved' || look.hair.style === 'bald' ? 0.004 : look.hair.style === 'long' ? 0.016 : 0.018;
  const dome = (r0, scaleY, phMin, color, bone, seed) => {
    const g = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2 - phMin);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      const th = Math.atan2(v.x, v.z), ph = Math.asin(Math.max(-1, Math.min(1, v.y)));
      const rr = sampleHead(G, th, ph) + r0;
      const d = new THREE.Vector3(Math.cos(ph) * Math.sin(th), Math.sin(ph) * scaleY, Math.cos(ph) * Math.cos(th));
      p.setXYZ(i, C.x + d.x * rr, C.y + d.y * rr, C.z + d.z * rr);
    }
    g.computeVertexNormals();
    mb.add(g, color, bone, null, 0.08, seed);
  };
  for (const a of acc) {
    if (a === 'glasses') {
      // round wire frames, keyhole bridge, nose pads, temples with ear hooks
      const z = (t.face.eyeSurfaceZ > 0 ? t.face.eyeSurfaceZ : e[0].z + 0.01) + 0.012;
      const ex = Math.abs(e[0].x) * 1.02, ey0 = e[0].y - 0.001;
      for (const s of [1, -1]) {
        const ring = [];
        for (let i = 0; i < 24; i++) { const a2 = (i / 24) * Math.PI * 2; ring.push([s * ex + Math.cos(a2) * 0.0175, ey0 + Math.sin(a2) * 0.013, z - Math.abs(Math.cos(a2)) * 0.002]); }
        mb.add(tube(ring, 0.0011, 48, 5, true), 0x2a2018, iHead);
        mb.add(tube([[s * (ex + 0.0175), ey0 + 0.003, z - 0.001], [s * 0.07, ey0 + 0.006, z - 0.03], [s * 0.074, ey0 + 0.006, z - 0.07], [s * 0.072, ey0 - 0.008, z - 0.09], [s * 0.066, ey0 - 0.02, z - 0.094]], 0.0011, 20, 5), 0x2a2018, iHead);
        mb.add(new THREE.SphereGeometry(0.0022, 6, 4).scale(0.5, 1, 1), 0xd8d0c0, iHead, M4(s * 0.0075, ey0 - 0.008, z - 0.006));
      }
      mb.add(tube([[-(ex - 0.0175), ey0 + 0.002, z], [0, ey0 + 0.006, z + 0.003], [ex - 0.0175, ey0 + 0.002, z]], 0.0011, 10, 5), 0x2a2018, iHead);
    }
    if (a === 'cap') {
      dome(hairOff + 0.006, 1.0, 0.18, 0x2e3a4a, iHead, 3);
      const visor = new THREE.CylinderGeometry(0.075, 0.075, 0.004, 20, 1, false, -Math.PI * 0.42, Math.PI * 0.84);
      visor.scale(1.1, 1, 1.1);
      mb.add(visor, 0x26303d, iHead, M4(0, C.y + 0.055, C.z + 0.045, 0.12, 0, 0));
      mb.add(new THREE.SphereGeometry(0.006, 6, 4), 0x26303d, iHead, M4(0, C.y + sampleHead(G, 0, Math.PI / 2) + hairOff + 0.008, C.z));
    }
    if (a === 'helmet') {
      dome(hairOff + 0.02, 1.0, 0.05, 0x8a2a22, iHead, 4);
      for (const s of [1, -1]) mb.add(new THREE.BoxGeometry(0.004, 0.07, 0.012), 0x1a1a1a, iHead, M4(s * 0.07, C.y - 0.05, C.z + 0.01, 0, 0, s * 0.15));
    }
    if (a === 'headscarf') {
      dome(hairOff + 0.004, 1.02, 0.0, 0x8a5a3a, iHead, 5);
      mb.add(new THREE.ConeGeometry(0.03, 0.12, 8), 0x7a4a30, iHead, M4(0, C.y - 0.06, C.z - 0.11, -0.3, 0, Math.PI));
    }
    if (a === 'amulet-necklace') {
      // fine chain resting on the neck base and collarbones, framed amulet on the sternum
      const nb = t.Gp[iNeck];
      const pts = [];
      for (let i = 0; i < 28; i++) {
        const a2 = (i / 28) * Math.PI * 2;
        const fr = Math.cos(a2) > 0 ? Math.cos(a2) : 0;
        pts.push([Math.sin(a2) * (0.07 + fr * 0.005), nb.y - 0.03 - fr * fr * 0.085, nb.z + Math.cos(a2) * (0.06 + fr * 0.035)]);
      }
      mb.add(tube(pts, 0.0012, 120, 4, true), 0xb8902e, iChest, null, 0.25, 7, (c) => (Math.floor((c.x + c.z) * 900) % 2 ? 0xc9a24a : 0x8a6a22));
      const am = heldGeometry('amulet');
      if (am) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', am.attributes.position.clone());
        g.setAttribute('normal', am.attributes.normal.clone());
        g.applyMatrix4(M4(0, nb.y - 0.142, nb.z + 0.098, -0.25, 0, 0));
        mb.parts.push({ g: (() => { g.setAttribute('color', am.attributes.color.clone()); return g; })(), bone: iChest });
      }
    }
    if (a === 'shoulder-bag') {
      // ย่าม: woven cloth bag at the right hip, strap over the left shoulder
      const pl = t.Gp[iPelvis];
      const bag = new THREE.BoxGeometry(0.26, 0.3, 0.05, 2, 2, 1);
      const p = bag.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * (1 - Math.abs(p.getY(i)) * 1.5));
      bag.computeVertexNormals();
      const col = look.outfit.robe ? 0xa8521a : 0x6a4a2a;
      mb.add(bag, col, iPelvis, M4(-0.2, pl.y - 0.02, pl.z + 0.02, 0, -Math.PI / 2 + 0.25, 0.05), 0.1, 9);
      // strap: polyline from the right hip over the chest to the left shoulder and down the back
      const sh = t.Gp[t.index.clavicle_l];
      const pts = [
        [-0.19, pl.y + 0.13, pl.z + 0.06, iSpine], [-0.08, pl.y + 0.35, pl.z + 0.12, iChest], [0.06, sh.y - 0.08, sh.z + 0.08, iChest],
        [0.12, sh.y + 0.03, sh.z - 0.02, iChest], [0.06, sh.y - 0.1, sh.z - 0.13, iChest], [-0.12, pl.y + 0.2, pl.z - 0.12, iSpine], [-0.2, pl.y + 0.12, pl.z - 0.02, iSpine],
      ];
      for (let i = 0; i < pts.length - 1; i++) {
        const a0 = new THREE.Vector3(...pts[i].slice(0, 3)), a1 = new THREE.Vector3(...pts[i + 1].slice(0, 3));
        const len = a0.distanceTo(a1);
        const seg = new THREE.BoxGeometry(0.035, len, 0.004);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), a1.clone().sub(a0).normalize());
        seg.applyQuaternion(q);
        const mid = a0.clone().add(a1).multiplyScalar(0.5);
        seg.translate(mid.x, mid.y, mid.z);
        mb.add(seg, col, pts[i][3], null, 0.05, 11 + i);
      }
    }
  }
  const geo = mb.build(true);
  wornCache.set(key, geo);
  return geo;
}
function sampleHead(G, th, ph) {
  // same bilinear lookup as hair.js (kept local to avoid exporting internals)
  const NT = 48, NP = 36, PMIN = -70 * Math.PI / 180, PMAX = Math.PI / 2;
  let u = ((th + Math.PI) / (2 * Math.PI)) * NT;
  u = ((u % NT) + NT) % NT;
  const v = Math.max(0, Math.min(NP - 1.001, ((ph - PMIN) / (PMAX - PMIN)) * (NP - 1)));
  const i0 = Math.floor(u), i1 = (i0 + 1) % NT, fu = u - i0, j0 = Math.floor(v), j1 = Math.min(NP - 1, j0 + 1), fv = v - j0;
  const r = G.r;
  const a = r[i0 * NP + j0] * (1 - fu) + r[i1 * NP + j0] * fu, b = r[i0 * NP + j1] * (1 - fu) + r[i1 * NP + j1] * fu;
  return a * (1 - fv) + b * fv;
}

// ------------------------------------------------------------------ held props (local to a grip frame)
// Grip frame: origin at the grip point, +Y = up along the held object (or "hang" direction -Y), +Z forward.
const heldCache = new Map();
let _heldMat = null;
/** shared material for held props; fresh=true makes a per-character instance (fading) */
export function heldMaterial(fresh = false) {
  const mk = () => paintedMaterial({ vertexColors: true, roughness: 0.78, brush: 0.55, wet: 0.35, puddles: 0, name: 'glb-held' });
  if (fresh) return mk();
  if (!_heldMat) _heldMat = mk();
  return _heldMat;
}
export function heldGeometry(kind) {
  if (heldCache.has(kind)) return heldCache.get(kind);
  const mb = new MB();
  switch (kind) {
    case 'basket': {
      // woven bamboo basket: flared body with an over-under weave, thick wrapped rim, cane handle
      const body = lathe([[0.11, -0.33], [0.125, -0.325], [0.14, -0.29], [0.155, -0.23], [0.165, -0.18], [0.17, -0.17]], 40);
      mb.add(body, 0xa8844e, 0, null, 0.18, 3, (c) => { const a = Math.atan2(c.x, c.z); const col = Math.floor((a + Math.PI) * 40 / (Math.PI * 2)), row = Math.floor((c.y + 0.4) * 90); return (col + row) % 2 ? 0xb8925a : 0x8a6a3a; });
      mb.add(lathe([[0, -0.332], [0.112, -0.332], [0.118, -0.326]], 32), 0x7a5a30, 0);
      mb.add(new THREE.TorusGeometry(0.17, 0.011, 8, 48).rotateX(Math.PI / 2), 0x8a6a3a, 0, M4(0, -0.17, 0), 0.1, 4, (c) => (Math.floor((Math.atan2(c.x, c.z) + Math.PI) * 30) % 2 ? 0x9a7642 : 0x6e5230));
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; mb.add(tube([[Math.sin(a) * 0.112, -0.33, Math.cos(a) * 0.112], [Math.sin(a) * 0.15, -0.25, Math.cos(a) * 0.15], [Math.sin(a) * 0.168, -0.175, Math.cos(a) * 0.168]], 0.0025, 6, 4), 0x6e5230, 0); }
      const hp = []; for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI; hp.push([Math.cos(a) * 0.16, -0.17 + Math.sin(a) * 0.17, 0]); }
      mb.add(tube(hp, 0.0075, 40, 7), 0x7a5a30, 0, null, 0.1, 5, (c) => (Math.floor(Math.atan2(c.y + 0.17, c.x) * 14) % 2 ? 0x8a6838 : 0x5e4426));
      // jasmine garlands piled inside
      for (let i = 0; i < 7; i++) {
        const cx = (i % 3 - 1) * 0.06, cz = (Math.floor(i / 3) - 1) * 0.05;
        for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; mb.add(bud(), k % 9 === 0 ? 0xd9b450 : 0xf3efe2, 0, M4(cx + Math.sin(a) * 0.04, -0.16 + Math.sin(a * 3) * 0.004, cz + Math.cos(a) * 0.04, Math.PI / 2, a, 0), 0.08, 30 + i * 18 + k); }
      }
      break;
    }
    case 'lunchbox': {
      // ปิ่นโต: three enamel tiers with rolled rims and a flower band, lid with knob, side rails with clips, arched handle + latch
      for (let i = 0; i < 3; i++) {
        const y0 = -0.27 + i * 0.066;
        mb.add(lathe([[0.0, y0], [0.058, y0], [0.064, y0 + 0.004], [0.067, y0 + 0.03], [0.066, y0 + 0.055], [0.07, y0 + 0.058], [0.07, y0 + 0.062], [0.064, y0 + 0.064]], 36), 0x6a8a72, 0, null, 0.06, 2 + i, (c) => (Math.abs(c.y - y0 - 0.032) < 0.009 ? (Math.floor((Math.atan2(c.x, c.z) + 3.2) * 6) % 2 ? 0xd8c890 : 0xb03a34) : 0x6a8a72));
      }
      mb.add(lathe([[0.066, -0.072], [0.062, -0.06], [0.04, -0.052], [0.012, -0.05], [0.012, -0.044], [0.018, -0.04], [0.0, -0.036]], 36), 0x7a9a80, 0);
      for (const sx of [1, -1]) {
        mb.add(tube([[sx * 0.075, -0.27, 0], [sx * 0.076, -0.15, 0], [sx * 0.074, -0.04, 0]], 0.0035, 8, 6), 0xb0aea4, 0);
        for (let i = 0; i < 4; i++) mb.add(new THREE.TorusGeometry(0.006, 0.0018, 5, 10).rotateY(Math.PI / 2), 0xb8b6aa, 0, M4(sx * 0.071, -0.21 + i * 0.066, 0));
      }
      const hp = []; for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; hp.push([Math.cos(a) * 0.075, -0.04 + Math.sin(a) * 0.045, 0]); }
      mb.add(tube(hp, 0.0042, 24, 6), 0xa8a69c, 0);
      mb.add(new THREE.TorusGeometry(0.008, 0.002, 5, 12), 0xb8b6aa, 0, M4(0, -0.038, 0.012, 0, 0, 0));
      break;
    }
    case 'umbrella': {
      // กลด: closed monk's umbrella-tent: gathered cloth with folds and ties, long pole with a hooked top
      mb.add(tube([[0, -0.5, 0], [0, 0.5, 0], [0, 1.0, 0], [0.02, 1.06, 0], [0.05, 1.05, 0]], 0.009, 24, 6), 0x6a5038, 0);
      const cloth = lathe([[0.004, 0.32], [0.05, 0.38], [0.085, 0.5], [0.09, 0.66], [0.07, 0.82], [0.03, 0.92], [0.006, 0.95]], 48);
      const cp = cloth.attributes.position;
      for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), z = cp.getZ(i), y = cp.getY(i); const a = Math.atan2(x, z); const k = 1 + 0.16 * Math.sin(a * 9 + y * 6) * Math.min(1, (y - 0.32) * 4); cp.setX(i, x * k); cp.setZ(i, z * k); }
      cloth.computeVertexNormals();
      mb.add(cloth, 0xc9b48a, 0, null, 0.12, 5);
      for (const y of [0.5, 0.74]) mb.add(new THREE.TorusGeometry(0.083, 0.004, 5, 24).rotateX(Math.PI / 2), 0x8a6a3a, 0, M4(0, y, 0));
      break;
    }
    case 'cigarette': {
      // filter (speckled cork), paper, uneven ash tip with a glowing ember ring; rounded ends
      const c = lathe([[0.0, -0.03], [0.0033, -0.0298], [0.0036, -0.028], [0.0036, 0.026], [0.0034, 0.029], [0.0026, 0.0315], [0.0012, 0.033], [0, 0.0333]], 12);
      mb.add(c, 0xece8de, 0, M4(0, 0, 0.012, Math.PI / 2, 0, 0), 0.04, 2, (p) => (p.y < -0.012 ? (Math.floor(p.y * 3000 + Math.atan2(p.x, p.z) * 7) % 3 ? 0xc89048 : 0xa86a30) : p.y > 0.0275 ? (p.y > 0.03 ? 0x8a8680 : 0xff5a1a) : 0xefebe2));
      break;
    }
    case 'garland': {
      // พวงมาลัย: two twisted strands of jasmine buds, a layered rose, ribbon tassels
      const n = 34;
      for (let st = 0; st < 2; st++) for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, tw = a * 6 + st * Math.PI;
        const x = Math.sin(a) * 0.055 + Math.sin(tw) * 0.006, y = -0.065 - Math.cos(a) * 0.065, z = Math.cos(tw) * 0.006;
        mb.add(bud(), i % 11 === 0 ? 0xd9b450 : 0xf4f1e6, 0, M4(x, y, z, 0, 0, a + Math.PI / 2), 0.08, i + st * 50);
      }
      for (let k = 0; k < 9; k++) { const pet = new THREE.SphereGeometry(0.014, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.42); mb.add(pet, k < 3 ? 0x7a0e1c : 0xa01e2a, 0, M4(0, -0.142, 0, 0.6 + (k % 3) * 0.35, (k * 2.4), 0, 1 - k * 0.06), 0.1, 70 + k); }
      for (const sx of [1, -1]) { const rb = new THREE.PlaneGeometry(0.012, 0.11, 1, 6); const p = rb.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (0.4 + (y + 0.055) * 6)); p.setZ(i, Math.sin(y * 40) * 0.004); } mb.add(rb, 0x2e7a3a, 0, M4(sx * 0.008, -0.21, 0, 0, 0, sx * 0.12)); mb.add(rb.clone().rotateY(Math.PI), 0x24602e, 0, M4(sx * 0.008, -0.21, -0.0005, 0, 0, sx * 0.12)); }
      break;
    }
    case 'coins': {
      for (let i = 0; i < 4; i++) mb.add(lathe([[0, -0.001], [0.0115, -0.001], [0.0122, 0], [0.0115, 0.001], [0.009, 0.0011], [0, 0.0009]], 18), 0xb8a878, 0, M4(i * 0.006, i * 0.0022, i * 0.003), 0.05, i);
      break;
    }
    case 'paper': {
      const g = new THREE.PlaneGeometry(0.15, 0.21, 6, 8);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(x * 20) * 0.003 + (Math.abs(y) < 0.004 ? -0.002 : 0) + x * x * 0.4); }
      g.computeVertexNormals();
      mb.add(g, 0xe8e0c8, 0, M4(0, 0.09, 0, -0.2), 0.03);
      mb.add(g.clone().rotateY(Math.PI), 0xd8d0b8, 0, M4(0, 0.09, -0.001, -0.2));
      break;
    }
    case 'amulet': {
      // พระเครื่อง in a framed case: bevelled frame, raised seated figure, bail and jump ring
      const frame = new THREE.TorusGeometry(0.016, 0.0028, 8, 32);
      frame.scale(1, 1.25, 0.8);
      mb.add(frame, 0xc9a24a, 0);
      mb.add(new THREE.CircleGeometry(0.0158, 24).scale(1, 1.25, 1), 0x3a2e22, 0, M4(0, 0, -0.0004));
      const fig = lathe([[0, -0.012], [0.008, -0.011], [0.0095, -0.007], [0.0055, -0.003], [0.0045, 0.002], [0.003, 0.005], [0.0035, 0.008], [0.002, 0.012], [0, 0.0135]], 14);
      fig.scale(1, 1, 0.25);
      mb.add(fig, 0x8a7448, 0, M4(0, -0.002, 0.0006));
      mb.add(new THREE.TorusGeometry(0.0045, 0.0013, 6, 12), 0xc9a24a, 0, M4(0, 0.024, 0));
      mb.add(new THREE.TorusGeometry(0.0035, 0.0009, 5, 10).rotateY(Math.PI / 2), 0xb8902e, 0, M4(0, 0.03, 0));
      break;
    }
    case 'keys': {
      mb.add(new THREE.TorusGeometry(0.012, 0.0015, 5, 16), 0x9a9a92, 0, M4(0, 0, 0));
      const key = new THREE.Shape(); key.moveTo(-0.004, 0); key.lineTo(0.004, 0); key.lineTo(0.004, -0.035); key.lineTo(0.002, -0.04); key.lineTo(0.002, -0.034); key.lineTo(0.0, -0.036); key.lineTo(-0.002, -0.03); key.lineTo(-0.004, -0.04); key.closePath();
      mb.add(new THREE.ExtrudeGeometry(key, { depth: 0.0018, bevelEnabled: false }), 0xb0a890, 0, M4(0.004, -0.012, 0, 0, 0, 0.2));
      mb.add(lathe([[0, 0], [0.012, 0.0], [0.013, 0.004], [0.012, 0.008], [0, 0.008]], 14), 0x2a2a2a, 0, M4(-0.008, -0.02, 0, Math.PI / 2, 0, -0.3));
      break;
    }
    case 'coffee': {
      // iced coffee in a tied plastic bag with a straw (Thai roadside style)
      mb.add(lathe([[0.0, -0.15], [0.03, -0.148], [0.045, -0.12], [0.048, -0.07], [0.035, -0.03], [0.012, -0.012], [0.006, 0.0], [0.0, 0.003]], 18), 0x5a3a24, 0, null, 0.1);
      mb.add(tube([[0.008, -0.1, 0], [0.012, 0.0, 0], [0.016, 0.05, 0]], 0.0028, 8, 6), 0xd03a3a, 0);
      break;
    }
    default: return null;
  }
  const geo = mb.build(false);
  heldCache.set(kind, geo);
  return geo;
}
