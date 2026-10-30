// Accessories: small procedural props attached rigidly to bones. Parts sharing
// a bone are merged into one vertex-coloured mesh with a shared painted
// material (≈1 draw call per bone used). Held props also set a finger grip.
//   glasses, cap, headscarf, helmet (head) · garland, cigarette, lunchbox, umbrella, basket (hands)
//   amulet-necklace, shoulder-bag (chest)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintedMaterial } from '../render/index.js';
import { makeRng, noise } from '../core/math.js';

let _mat = null;
function accMaterial() {
  if (!_mat) _mat = paintedMaterial({ vertexColors: true, roughness: 0.7, brush: 0.4, name: 'character-accessory' });
  return _mat;
}
let _ember = null;
function emberMaterial() {
  if (!_ember) _ember = new THREE.MeshBasicMaterial({ color: 0xff7a2a, fog: true });
  return _ember;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
function prep(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], colorFn = null) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(...pos), _q, new THREE.Vector3(...scale));
  g.applyMatrix4(_m);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const col = new THREE.Color(color);
  const p = g.attributes.position;
  for (let i = 0; i < n; i++) {
    let r = col.r, gg = col.g, b = col.b;
    if (colorFn) [r, gg, b] = colorFn(p.getX(i), p.getY(i), p.getZ(i), r, gg, b);
    const k = 1 + noise.noise3D(p.getX(i) * 60, p.getY(i) * 60, p.getZ(i) * 60) * 0.08;
    c[i * 3] = r * k; c[i * 3 + 1] = gg * k; c[i * 3 + 2] = b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  return g;
}
const tube = (pts, r, seg = 24, rad = 5, closed = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed), seg, r, rad, closed);

// ---------------------------------------------------------------------------
// builders (each returns parts in the bone's local space)
// ---------------------------------------------------------------------------
function glasses(F) {
  const hs = F.hs;
  const z = F.eyeZ - 0.0215 * hs, y = F.eyeY - 0.001 * hs;
  const parts = [];
  for (const sg of [-1, 1]) {
    const cx = sg * F.eyeX;
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rx = 0.024 * hs, ry = 0.017 * hs;
      pts.push([cx + Math.cos(a) * rx, y + Math.sin(a) * ry * (Math.sin(a) < 0 ? 1.1 : 0.9), z + Math.abs(Math.cos(a)) * 0.002]);
    }
    parts.push(prep(tube(pts, 0.0018 * hs, 32, 4, true), 0x1c1a18));
    // temple arm back to the ear
    parts.push(prep(tube([[cx + sg * 0.024 * hs, y + 0.004, z + 0.002], [sg * 0.071 * hs, y + 0.006, z + 0.03 * hs], [sg * 0.075 * hs, y - 0.004, 0.012 * hs], [sg * 0.072 * hs, y - 0.02 * hs, 0.022 * hs]], 0.0014 * hs, 12, 3), 0x1c1a18));
  }
  parts.push(prep(tube([[-F.eyeX + 0.022 * hs, y + 0.004, z], [0, y + 0.007, z - 0.003], [F.eyeX - 0.022 * hs, y + 0.004, z]], 0.0016 * hs, 8, 3), 0x1c1a18));
  return parts;
}

function cap(F, color = 0x3a4a5a) {
  const hs = F.hs;
  const dome = new THREE.SphereGeometry(0.094 * hs, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const parts = [prep(dome, color, [0, F.crownY - 0.092 * hs, 0.012 * hs], [0, 0, 0], [1.0, 0.95, 1.05], (x, y, z, r, g, b) => {
    const seam = Math.abs(Math.sin(Math.atan2(x, z) * 3)) < 0.06 ? 0.75 : 1;
    return [r * seam, g * seam, b * seam];
  })];
  const brim = new THREE.CylinderGeometry(0.075 * hs, 0.075 * hs, 0.006 * hs, 18, 1, false, -Math.PI * 0.5, Math.PI);
  parts.push(prep(brim, color, [0, F.browY + 0.032 * hs, -0.07 * hs], [-0.25, Math.PI, 0], [1.0, 1, 1.0]));
  parts.push(prep(new THREE.SphereGeometry(0.008 * hs, 6, 4), color, [0, F.crownY + 0.0, 0.012 * hs]));
  return parts;
}

function helmet(F) {
  const hs = F.hs;
  const parts = [prep(new THREE.SphereGeometry(0.108 * hs, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), 0x8a2a24, [0, F.crownY - 0.1 * hs, 0.012 * hs], [0.12, 0, 0], [1, 0.95, 1.06], (x, y, z, r, g, b) => {
    const stripe = Math.abs(x) < 0.012 ? [0.85, 0.82, 0.75] : [r, g, b];
    const scuff = noise.noise3D(x * 40, y * 40, z * 40) > 0.4 ? 0.6 : 1;
    return stripe.map((c) => c * scuff);
  })];
  parts.push(prep(new THREE.TorusGeometry(0.103 * hs, 0.006 * hs, 5, 28), 0x1a1a1a, [0, F.crownY - 0.1 * hs - 0.005, 0.012 * hs], [Math.PI / 2 + 0.12, 0, 0], [1, 1.06, 1]));
  for (const sg of [-1, 1]) parts.push(prep(tube([[sg * 0.075 * hs, 0.06 * hs, 0.0], [sg * 0.06 * hs, F.chinY + 0.01 * hs, -0.04 * hs], [0, F.chinY - 0.004 * hs, -0.06 * hs]], 0.0025 * hs, 8, 3), 0x111111));
  return parts;
}

function headscarf(F, color = 0x7a3a3a) {
  const hs = F.hs;
  const parts = [prep(new THREE.SphereGeometry(0.092 * hs, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), color, [0, F.crownY - 0.088 * hs, 0.016 * hs], [0.25, 0, 0], [1.02, 1.0, 1.06], (x, y, z, r, g, b) => {
    const fold = 1 + Math.sin(y * 300 + x * 80) * 0.08;
    const dots = noise.noise3D(x * 120, y * 120, z * 120) > 0.5 ? 1.5 : 1;
    return [r * fold * dots, g * fold * dots, b * fold * dots];
  })];
  parts.push(prep(new THREE.SphereGeometry(0.022 * hs, 8, 6), color, [0, 0.07 * hs, 0.1 * hs]));
  parts.push(prep(new THREE.ConeGeometry(0.02 * hs, 0.08 * hs, 6), color, [0.01, 0.03 * hs, 0.105 * hs], [0.3, 0, 0.2]));
  return parts;
}

function amulet(P) {
  const s = P.H / 1.7;
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const front = Math.cos(a) < 0 ? 0 : 1;
    pts.push([Math.sin(a) * 0.072 * s, P.shoulderY - P.chestY + 0.035 * s - front * 0.1 * s * Math.pow(Math.cos(a), 4), -Math.cos(a) * 0.075 * s + 0.02 * s]);
  }
  const parts = [prep(tube(pts, 0.0015, 48, 3, true), 0xc9a24a)];
  const py = P.shoulderY - P.chestY - 0.067 * s;
  parts.push(prep(new THREE.BoxGeometry(0.022 * s, 0.03 * s, 0.006 * s), 0xd4ac4a, [0, py, -0.075 * s - 0.02 * s], [0.25, 0, 0]));
  parts.push(prep(new THREE.BoxGeometry(0.016 * s, 0.022 * s, 0.003 * s), 0x2a2018, [0, py, -0.079 * s - 0.02 * s], [0.25, 0, 0]));
  return parts;
}

function shoulderBag(P, color = 0x8a5a2a) {
  const s = P.H / 1.7;
  const y0 = P.shoulderY - P.chestY;
  const strap = tube([[-0.13 * s, y0 + 0.03 * s, 0.0], [-0.06 * s, y0 - 0.02 * s, -0.11 * s], [0.08 * s, y0 - 0.25 * s, -0.12 * s], [0.15 * s, y0 - 0.42 * s, -0.04 * s]], 0.008 * s, 20, 3);
  const strap2 = tube([[-0.13 * s, y0 + 0.03 * s, 0.0], [-0.06 * s, y0 - 0.02 * s, 0.11 * s], [0.08 * s, y0 - 0.25 * s, 0.12 * s], [0.15 * s, y0 - 0.42 * s, 0.04 * s]], 0.008 * s, 20, 3);
  const bag = new THREE.BoxGeometry(0.06 * s, 0.24 * s, 0.26 * s, 2, 3, 3);
  const bp = bag.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const y = bp.getY(i);
    bp.setX(i, bp.getX(i) * (1.1 - y * 2));
    bp.setZ(i, bp.getZ(i) * (0.95 + Math.abs(y) * 0.4));
  }
  bag.computeVertexNormals();
  return [prep(strap, color), prep(strap2, color), prep(bag, color, [0.19 * s, y0 - 0.52 * s, 0.0], [0, 0, 0.12], [1, 1, 1], (x, y, z, r, g, b) => {
    const f = 1 + Math.sin(y * 120 + z * 40) * 0.07;
    return [r * f, g * f, b * f];
  })];
}

/** hand-held items are modelled in the hand frame: Y fingers, Z dorsal, grip channel along X at the palm */
function gripFrame(P) {
  const hs = P.handLen / 0.19;
  return { hs, gx: 0, gy: 0.072 * hs, gz: -0.026 * hs };
}

function cigarette(P, side) {
  const G = gripFrame(P);
  const sx = side === 'R' ? 1 : -1;
  // held between index and middle fingers, pointing out of the hand
  const base = [sx * 0.004 * G.hs, 0.118 * G.hs, -0.002 * G.hs];
  const parts = [prep(new THREE.CylinderGeometry(0.0038, 0.0038, 0.07, 8), 0xe8e4d8, [base[0] + sx * 0.022, base[1], base[2]], [0, 0, Math.PI / 2])];
  parts.push(prep(new THREE.CylinderGeometry(0.0039, 0.0039, 0.022, 8), 0xc08a4a, [base[0] - sx * 0.022, base[1], base[2]], [0, 0, Math.PI / 2]));
  return { parts, ember: { pos: [base[0] + sx * 0.058, base[1], base[2]] } };
}

function lunchbox(P) {
  const G = gripFrame(P);
  const parts = [];
  const tiers = 3;
  const r = 0.058, hh = 0.045;
  // the handle passes through the fist (along X); the stack hangs below (toward -Y_fingers? hand hangs down)
  // in hand space the arm points along +Y; the box hangs along +Y beyond the fist when the arm hangs
  const top = [G.gx, G.gy + 0.02, G.gz];
  for (let i = 0; i < tiers; i++) {
    parts.push(prep(new THREE.CylinderGeometry(r, r * 0.98, hh, 18), i % 2 ? 0x6a9a7a : 0x7aaa8a, [top[0], top[1] + 0.07 + i * (hh + 0.004), top[2] - 0.0], [0, 0, 0], [1, 1, 1], (x, y, z, rr, gg, bb) => {
      const flower = noise.noise3D(x * 90, y * 90, z * 90) > 0.45 ? [0.85, 0.4, 0.35] : null;
      return flower || [rr, gg, bb];
    }));
    parts.push(prep(new THREE.TorusGeometry(r * 0.99, 0.003, 4, 20), 0xb8b8b0, [top[0], top[1] + 0.07 + i * (hh + 0.004) - hh / 2, top[2]], [Math.PI / 2, 0, 0]));
  }
  // side bars + handle
  for (const sg of [-1, 1]) parts.push(prep(new THREE.BoxGeometry(0.006, tiers * (hh + 0.004) + 0.05, 0.012), 0xb0b0a8, [top[0] + sg * (r + 0.004), top[1] + 0.07 + ((tiers - 1) * (hh + 0.004)) / 2 - 0.02, top[2]]));
  parts.push(prep(tube([[-(r + 0.004), top[1] + 0.02, top[2]], [-0.03, top[1] - 0.012, top[2]], [0.03, top[1] - 0.012, top[2]], [r + 0.004, top[1] + 0.02, top[2]]], 0.004, 12, 4), 0xb0b0a8));
  return parts;
}

function basket(P, withGarlands = true) {
  const G = gripFrame(P);
  const parts = [];
  const r = 0.13, hh = 0.11;
  const cy = G.gy + 0.17;
  const body = new THREE.CylinderGeometry(r, r * 0.82, hh, 22, 3, true);
  parts.push(prep(body, 0x9a7a4a, [G.gx, cy, G.gz], [0, 0, 0], [1, 1, 1], (x, y, z, rr, gg, bb) => {
    const a = Math.atan2(x - G.gx, z - G.gz);
    const weave = (Math.sin(a * 22) > 0) !== (Math.sin((y - cy) * 180) > 0) ? 0.78 : 1.08;
    return [rr * weave, gg * weave, bb * weave];
  }));
  parts.push(prep(new THREE.CircleGeometry(r * 0.82, 18), 0x6a5030, [G.gx, cy - hh / 2, G.gz], [Math.PI / 2, 0, 0]));
  parts.push(prep(new THREE.TorusGeometry(r, 0.008, 4, 24), 0x7a5a32, [G.gx, cy - hh / 2 + 0.0, G.gz], [Math.PI / 2, 0, 0]));
  parts.push(prep(new THREE.TorusGeometry(r, 0.009, 4, 24), 0x7a5a32, [G.gx, cy + hh / 2, G.gz], [Math.PI / 2, 0, 0]));
  // handle arc through the fist
  parts.push(prep(new THREE.TorusGeometry(r * 0.95, 0.007, 5, 20, Math.PI), 0x8a6a3a, [G.gx, cy + hh / 2, G.gz], [Math.PI, Math.PI / 2, 0], [1, 1.0, 1]));
  if (withGarlands) {
    const rng = makeRng(5);
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2, rr = rng() * r * 0.6;
      parts.push(...garlandParts([G.gx + Math.cos(a) * rr, cy + hh / 2 - 0.01, G.gz + Math.sin(a) * rr], 0.035, rng));
    }
  }
  return parts;
}

function garlandParts(c, R = 0.05, rng = makeRng(3), hang = false) {
  const parts = [];
  const bud = new THREE.IcosahedronGeometry(0.0075, 0);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    parts.push(prep(bud.clone(), 0xf2efe2, [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * 0.004, c[2] + Math.sin(a) * R * 0.5], [rng() * 3, rng() * 3, 0]));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    parts.push(prep(new THREE.IcosahedronGeometry(0.011, 0), i === 1 ? 0xd8a838 : 0xa02a3a, [c[0] + Math.cos(a) * R, c[1] + 0.004, c[2] + Math.sin(a) * R * 0.5]));
  }
  if (hang) {
    // tassel: two strings of buds and a ribbon
    for (const sg of [-1, 1]) {
      for (let k = 0; k < 6; k++) parts.push(prep(bud.clone(), k === 5 ? 0xa02a3a : 0xf2efe2, [c[0] + sg * 0.012, c[1] - R * 0.5 - k * 0.016, c[2] - R * 0.5]));
    }
    parts.push(prep(new THREE.PlaneGeometry(0.02, 0.07), 0x2a7a4a, [c[0], c[1] - R * 0.5 - 0.05, c[2] - R * 0.52]));
  }
  return parts;
}

function garlandHeld(P) {
  const G = gripFrame(P);
  return garlandParts([G.gx, G.gy + 0.07, G.gz - 0.0], 0.05, makeRng(11), true);
}

function umbrella(P) {
  const G = gripFrame(P);
  const parts = [];
  // shaft through the fist along +X (hand frame), canopy folded above
  parts.push(prep(new THREE.CylinderGeometry(0.009, 0.009, 1.05, 6), 0x5a3a22, [G.gx + 0.25, G.gy, G.gz], [0, 0, Math.PI / 2]));
  const can = new THREE.ConeGeometry(0.06, 0.62, 12, 4, true);
  parts.push(prep(can, 0xb5752a, [G.gx + 0.48, G.gy, G.gz], [0, 0, -Math.PI / 2], [1, 1, 1], (x, y, z, r, g, b) => {
    const fold = 1 + Math.sin(Math.atan2(y - G.gy, z - G.gz) * 8) * 0.12;
    return [r * fold, g * fold, b * fold];
  }));
  parts.push(prep(new THREE.TorusGeometry(0.035, 0.008, 5, 10, Math.PI), 0x4a2a18, [G.gx - 0.28, G.gy - 0.035, G.gz], [0, 0, 0]));
  return parts;
}

// ---------------------------------------------------------------------------
/** Build and attach accessories. Returns { meshes, grips:{L,R}, update(dt), dispose() }. */
export function buildAccessories(h, spec) {
  const list = spec.accessories || [];
  if (!list.length) return null;
  const P = h.P, F = h.face;
  const byBone = new Map();
  const put = (bone, parts) => {
    if (!byBone.has(bone)) byBone.set(bone, []);
    byBone.get(bone).push(...parts);
  };
  const grips = { L: 0, R: 0 };
  const embers = [];
  let freeHand = 'R';
  const takeHand = () => {
    const hnd = freeHand;
    freeHand = freeHand === 'R' ? 'L' : 'R';
    return hnd;
  };
  for (const a of list) {
    switch (a) {
      case 'glasses': put('head', glasses(F)); break;
      case 'cap': put('head', cap(F)); break;
      case 'helmet': put('head', helmet(F)); break;
      case 'headscarf': put('head', headscarf(F)); break;
      case 'amulet-necklace': put('chest', amulet(P)); break;
      case 'shoulder-bag': put('chest', shoulderBag(P, spec.outfit?.type === 'monk-robe' ? 0xa95d1c : 0x6a4a2a)); break;
      case 'cigarette': {
        const s = takeHand();
        const c = cigarette(P, s);
        put('hand' + s, c.parts);
        embers.push({ bone: 'hand' + s, pos: c.ember.pos });
        grips[s] = Math.max(grips[s], 0.35);
        break;
      }
      case 'lunchbox': { const s = takeHand(); put('hand' + s, lunchbox(P)); grips[s] = 0.85; break; }
      case 'basket': { const s = takeHand(); put('hand' + s, basket(P)); grips[s] = 0.9; break; }
      case 'garland': { const s = takeHand(); put('hand' + s, garlandHeld(P)); grips[s] = 0.6; break; }
      case 'umbrella': { const s = takeHand(); put('hand' + s, umbrella(P)); grips[s] = 0.95; break; }
      default: break;
    }
  }
  const meshes = [];
  for (const [bone, parts] of byBone) {
    const geo = mergeGeometries(parts, false);
    if (!geo) continue;
    // convert sRGB colours to linear
    const c = geo.attributes.color;
    for (let i = 0; i < c.array.length; i++) c.array[i] = Math.pow(Math.max(0, c.array[i]), 2.2);
    const mesh = new THREE.Mesh(geo, accMaterial());
    mesh.name = 'acc:' + bone;
    mesh.castShadow = true;
    const b = h.bones[bone];
    if (bone === 'head') {
      // head-local == bone-local (identity rest)
    } else if (bone === 'chest') {
      // chest rest is identity too; our parts are authored relative to the chest joint
    }
    b.add(mesh);
    meshes.push(mesh);
    for (const p of parts) p.dispose();
  }
  const emberMeshes = embers.map((e) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 6, 4), emberMaterial());
    m.position.set(...e.pos);
    h.bones[e.bone].add(m);
    return m;
  });
  let t = Math.random() * 10;
  return {
    meshes, grips, embers: emberMeshes,
    update(dt) {
      t += dt;
      for (const m of emberMeshes) {
        const f = 0.75 + 0.25 * Math.sin(t * 7 + Math.sin(t * 2.3) * 3);
        m.scale.setScalar(0.9 + f * 0.25);
      }
    },
    dispose() {
      for (const m of meshes) { m.removeFromParent(); m.geometry.dispose(); }
      for (const m of emberMeshes) { m.removeFromParent(); m.geometry.dispose(); }
    },
  };
}

export { garlandParts };
