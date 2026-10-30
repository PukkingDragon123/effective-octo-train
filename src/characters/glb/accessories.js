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
  add(geo, color, bone = 0, m = null, jitter = 0.06, seed = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const r = makeRng(seed);
    _c.set(color);
    for (let i = 0; i < n; i += 3) {
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
      const z = (t.face.eyeSurfaceZ > 0 ? t.face.eyeSurfaceZ : e[0].z + 0.01) + 0.012;
      for (const s of [1, -1]) {
        const ring = new THREE.TorusGeometry(0.0175, 0.0014, 5, 20);
        ring.scale(1, 0.72, 1);
        mb.add(ring, 0x1c1714, iHead, M4(s * Math.abs(e[0].x) * 1.02, e[0].y - 0.001, z));
        const lens = new THREE.CircleGeometry(0.0172, 18);
        lens.scale(1, 0.72, 1);
        mb.add(lens, 0x3a4048, iHead, M4(s * Math.abs(e[0].x) * 1.02, e[0].y - 0.001, z - 0.001));
        const arm = new THREE.BoxGeometry(0.0022, 0.003, 0.1);
        mb.add(arm, 0x1c1714, iHead, M4(s * 0.072, e[0].y + 0.004, z - 0.052, 0, s * -0.12, 0));
      }
      mb.add(new THREE.BoxGeometry(0.014, 0.0025, 0.003), 0x1c1714, iHead, M4(0, e[0].y + 0.004, z + 0.002));
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
      // thin chain around the neck base, pendant on the chest (worn under the shirt collar line)
      const nb = t.Gp[iNeck];
      const chain = new THREE.TorusGeometry(0.068, 0.0016, 5, 40);
      chain.rotateX(Math.PI / 2 - 0.5);
      chain.scale(1.05, 1, 0.95);
      mb.add(chain, 0xb8902e, iChest, M4(0, nb.y - 0.03, nb.z + 0.03));
      const pend = new THREE.CylinderGeometry(0.012, 0.012, 0.004, 14);
      pend.rotateX(Math.PI / 2);
      mb.add(pend, 0xc9a24a, iChest, M4(0, nb.y - 0.115, nb.z + 0.105, -0.2));
      mb.add(new THREE.CylinderGeometry(0.009, 0.009, 0.005, 12).rotateX(Math.PI / 2), 0x3a2a1a, iChest, M4(0, nb.y - 0.115, nb.z + 0.107, -0.2));
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
      // woven bamboo basket hanging from the handle (grip at the top of the handle)
      const body = new THREE.CylinderGeometry(0.16, 0.12, 0.14, 16, 3, true);
      mb.add(body, 0xa8844e, 0, M4(0, -0.24, 0), 0.25, 3);
      mb.add(new THREE.CircleGeometry(0.12, 16).rotateX(Math.PI / 2), 0x8a6a3a, 0, M4(0, -0.31, 0));
      mb.add(new THREE.TorusGeometry(0.16, 0.008, 5, 24).rotateX(Math.PI / 2), 0x8a6a3a, 0, M4(0, -0.17, 0));
      const h = new THREE.TorusGeometry(0.15, 0.007, 5, 20, Math.PI);
      mb.add(h, 0x7a5a30, 0, M4(0, -0.17, 0));
      // jasmine garlands piled inside
      for (let i = 0; i < 5; i++) mb.add(new THREE.TorusGeometry(0.05, 0.012, 5, 12).rotateX(Math.PI / 2 + (i - 2) * 0.2), i % 2 ? 0xf2efe2 : 0xe8e4d4, 0, M4((i - 2) * 0.05, -0.16, (i % 2) * 0.04 - 0.02), 0.15, 7 + i);
      mb.add(new THREE.SphereGeometry(0.018, 6, 4), 0x9a1f2a, 0, M4(0.02, -0.15, 0.02));
      break;
    }
    case 'lunchbox': {
      // ปิ่นโต: three stacked enamel pots + handle frame (grip at the handle top)
      for (let i = 0; i < 3; i++) mb.add(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 14), i === 1 ? 0x6a8a6a : 0x7a9a7a, 0, M4(0, -0.12 - i * 0.062, 0), 0.08, 2 + i);
      mb.add(new THREE.CylinderGeometry(0.068, 0.068, 0.012, 14), 0xb8b8b0, 0, M4(0, -0.085, 0));
      for (const s of [1, -1]) mb.add(new THREE.BoxGeometry(0.006, 0.23, 0.012), 0xa8a8a0, 0, M4(s * 0.07, -0.15, 0));
      mb.add(new THREE.BoxGeometry(0.15, 0.008, 0.014), 0xa8a8a0, 0, M4(0, -0.035, 0));
      break;
    }
    case 'umbrella': {
      // กลด: closed monk's umbrella-tent, long pole held near its middle
      mb.add(new THREE.CylinderGeometry(0.009, 0.009, 1.5, 6), 0x6a5038, 0, M4(0, 0.25, 0));
      mb.add(new THREE.CylinderGeometry(0.05, 0.09, 0.62, 10), 0xc9b48a, 0, M4(0, 0.62, 0), 0.12, 5);
      mb.add(new THREE.ConeGeometry(0.05, 0.08, 8), 0xb8a070, 0, M4(0, 0.97, 0));
      break;
    }
    case 'cigarette': {
      mb.add(new THREE.CylinderGeometry(0.0035, 0.0035, 0.06, 6).rotateX(Math.PI / 2), 0xece8de, 0, M4(0, 0, 0.022));
      mb.add(new THREE.CylinderGeometry(0.0036, 0.0036, 0.016, 6).rotateX(Math.PI / 2), 0xc08a40, 0, M4(0, 0, -0.012));
      mb.add(new THREE.CylinderGeometry(0.0037, 0.0033, 0.004, 6).rotateX(Math.PI / 2), 0xff6a20, 0, M4(0, 0, 0.053), 0, 1);
      break;
    }
    case 'garland': {
      // พวงมาลัย: jasmine loop with a rose and ribbon tassel, hanging from the fingers
      const n = 26;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        mb.add(new THREE.IcosahedronGeometry(0.009, 0), i % 7 === 0 ? 0xc8a040 : 0xf4f1e6, 0, M4(Math.sin(a) * 0.055, -0.065 - Math.cos(a) * 0.065, 0), 0.08, i);
      }
      mb.add(new THREE.SphereGeometry(0.02, 8, 6), 0xa01e2a, 0, M4(0, -0.14, 0));
      for (const s of [1, -1]) mb.add(new THREE.BoxGeometry(0.012, 0.09, 0.002), 0x2e7a3a, 0, M4(s * 0.01, -0.2, 0, 0, 0, s * 0.1));
      break;
    }
    case 'coins': {
      for (let i = 0; i < 4; i++) mb.add(new THREE.CylinderGeometry(0.012, 0.012, 0.002, 12), 0xb8a878, 0, M4(i * 0.006, i * 0.0022, i * 0.003));
      break;
    }
    case 'paper': {
      const g = new THREE.PlaneGeometry(0.15, 0.21, 2, 3);
      mb.add(g, 0xe8e0c8, 0, M4(0, 0.09, 0, -0.2));
      mb.add(g.clone().rotateY(Math.PI), 0xd8d0b8, 0, M4(0, 0.09, -0.001, -0.2));
      break;
    }
    case 'amulet': {
      mb.add(new THREE.CylinderGeometry(0.016, 0.016, 0.005, 16).rotateX(Math.PI / 2), 0xc9a24a, 0, M4(0, 0, 0));
      mb.add(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 14).rotateX(Math.PI / 2), 0x3a2a1a, 0, M4(0, 0, 0.0008));
      mb.add(new THREE.TorusGeometry(0.004, 0.0012, 4, 8), 0xc9a24a, 0, M4(0, 0.019, 0));
      break;
    }
    case 'keys': {
      mb.add(new THREE.TorusGeometry(0.012, 0.0015, 4, 12), 0x9a9a92, 0, M4(0, 0, 0));
      mb.add(new THREE.BoxGeometry(0.008, 0.05, 0.002), 0xb0a890, 0, M4(0.004, -0.035, 0, 0, 0, 0.2));
      mb.add(new THREE.BoxGeometry(0.02, 0.03, 0.004), 0x2a2a2a, 0, M4(-0.01, -0.03, 0.002, 0, 0, -0.3));
      break;
    }
    case 'coffee': {
      // plastic bag of iced coffee with a straw (Thai roadside style)
      mb.add(new THREE.CylinderGeometry(0.035, 0.045, 0.12, 10), 0x5a3a24, 0, M4(0, -0.08, 0), 0.1);
      mb.add(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 5), 0xd03a3a, 0, M4(0.01, 0.0, 0, 0, 0, 0.15));
      break;
    }
    default: return null;
  }
  const geo = mb.build(false);
  heldCache.set(kind, geo);
  return geo;
}
