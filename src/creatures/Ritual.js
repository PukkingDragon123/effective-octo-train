// Ritual objects for the new encounters: a Thai funeral coffin carried on bamboo poles (sculpted:
// tapering lacquered box, gabled lid with a gilded ridge, raised gold panels, corner finials, plinth,
// crossbars), floating krathong (lathe-turned banana-trunk float, three tiers of folded banana-leaf
// petals, frilly marigolds, a candle and three incense sticks; merged with vertex colours) and a
// soft-edged flood-water sheet.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintedMaterial } from '../render/index.js';
import { Sculpt } from './sculpt.js';
import { creatureMaterial } from './skin.js';
import { TAU, noise, tubeGeometry } from './util.js';

const CACHE = {};

// ------------------------------------------------------------------ coffin
function coffinGeometry() {
  if (CACHE.coffin) return CACHE.coffin;
  const S = new Sculpt({ cell: 0.02 });
  const box = (x, y, z, cx, cy, cz, hx, hy, hz) => {
    const qx = Math.abs(x - cx) - hx, qy = Math.abs(y - cy) - hy, qz = Math.abs(z - cz) - hz;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  };
  // body tapers toward the foot (+Z)
  S.custom((x, y, z) => box(x * (1 + Math.max(0, z) * 0.08), y, z, 0, 0.33, 0, 0.29, 0.24, 0.96) - 0.02, [-0.36, 0.05, -1.02, 0.36, 0.62, 1.02], { k: 0.02, tag: 1 });
  S.box([0, 0.06, 0], [0.33, 0.05, 1.0], 0.02, { k: 0.02, tag: 2 }); // plinth
  S.box([0, 0.585, 0], [0.315, 0.022, 0.985], 0.012, { k: 0.01, tag: 2 }); // rim moulding
  // gabled lid
  S.custom((x, y, z) => Math.max(box(x, y, z, 0, 0.68, 0, 0.3, 0.1, 0.97), (Math.abs(x) * 0.55 + (y - 0.79)) * 0.876), [-0.33, 0.57, -1.0, 0.33, 0.8, 1.0], { k: 0.012, tag: 1 });
  S.capsule([0, 0.787, -0.95], [0, 0.787, 0.95], 0.016, 0.016, { k: 0.008, tag: 2 }); // ridge
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    S.sphere([sx * 0.3, 0.6, sz * 0.97], 0.035, { k: 0.01, tag: 2 }); // finials
    S.capsule([sx * 0.3, 0.6, sz * 0.97], [sx * 0.34, 0.7, sz * 1.0], 0.02, 0.004, { k: 0.008, tag: 2 });
  }
  // side panels: recessed frames with a raised gold diamond
  for (const sx of [-1, 1]) for (const zc of [-0.5, 0.0, 0.5]) {
    S.box([sx * 0.3, 0.33, zc], [0.02, 0.15, 0.2], 0.01, { op: 'sub', k: 0.012 });
    S.ellipsoid([sx * 0.285, 0.33, zc], [0.02, 0.08, 0.08], { k: 0.01, tag: 2, axis: [0, 1, 1], hint: [1, 0, 0] });
  }
  // end panels: a gilded lotus boss
  for (const sz of [-1, 1]) {
    S.ellipsoid([0, 0.34, sz * 0.97], [0.12, 0.13, 0.03], { k: 0.015, tag: 2 });
    S.sphere([0, 0.34, sz * 0.99], 0.045, { k: 0.01, tag: 2 });
  }
  // bamboo carrying poles + crossbars
  for (const sx of [-1, 1]) S.capsule([sx * 0.44, 0.1, -1.6], [sx * 0.44, 0.1, 1.6], 0.034, 0.03, { k: 0.01, tag: 3 });
  for (const sz of [-0.75, 0.75]) S.capsule([-0.46, 0.08, sz], [0.46, 0.08, sz], 0.03, 0.03, { k: 0.02, tag: 3 });
  const res = S.build({
    color: (x, y, z, nx, ny, nz, tag, ao) => {
      let c;
      if (tag === 2) c = [0.66, 0.5, 0.22]; // tarnished gold leaf
      else if (tag === 3) c = [0.52, 0.45, 0.3]; // old bamboo
      else c = [0.8, 0.77, 0.7]; // aged white lacquer
      const n = noise.noise2D(x * 9 + z * 4, y * 11);
      const mould = tag === 1 ? Math.max(0, noise.noise2D(x * 3 + 7, z * 3) - 0.35) * 1.2 : 0;
      c = c.map((v, i) => v * (0.9 + 0.12 * n) * (1 - mould * (i === 1 ? 0.25 : 0.35)));
      const a = 0.5 + 0.5 * ao;
      return [c[0] * a, c[1] * a, c[2] * a];
    },
  });
  CACHE.coffin = res.geometry;
  return res.geometry;
}

/** The coffin on its carrying poles (origin under its centre, poles at y≈0.1, length along Z). */
export function createCoffin() {
  const geo = coffinGeometry();
  const mat = creatureMaterial({ detail: 'ghostSkin', detailScale: 7, detailAmount: 0.35, bump: 0.5, roughness: 0.42, wet: 0.35, brush: 0.4, sss: 0, puddles: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const root = new THREE.Group();
  root.name = 'coffin';
  root.add(mesh);
  // grip points on the pole ends (for the bearers' hands)
  root.userData.grips = [[-0.44, 0.1, -1.45], [0.44, 0.1, -1.45], [-0.44, 0.1, 1.45], [0.44, 0.1, 1.45]].map((p) => {
    const o = new THREE.Object3D();
    o.position.set(...p);
    root.add(o);
    return o;
  });
  return { root, mesh, dispose: () => { root.removeFromParent(); mat.dispose(); } };
}

// ------------------------------------------------------------------ krathong
function colorize(g, c) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const nr = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    const shade = typeof c === 'function' ? c(i, g) : c;
    col[i * 3] = shade[0];
    col[i * 3 + 1] = shade[1];
    col[i * 3 + 2] = shade[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!nr) g.computeVertexNormals();
  return g;
}
function clean(g) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'color'].includes(k)) out.deleteAttribute(k);
  if (!out.attributes.normal) out.computeVertexNormals();
  return out;
}

function marigold() {
  if (CACHE.marigold) return CACHE.marigold;
  const S = new Sculpt({ cell: 0.0028 });
  S.sphere([0, 0, 0], 0.022, { k: 0.004 });
  S.displace((x, y, z) => {
    const r = Math.hypot(x, y, z) || 1;
    const u = Math.atan2(z, x), v = Math.acos(y / r);
    return 0.0035 * Math.abs(Math.sin(u * 11 + Math.sin(v * 7) * 2)) * Math.abs(Math.sin(v * 9)) + 0.0015 * noise.noise2D(u * 6, v * 6);
  });
  const g = S.build({ color: (x, y, z, nx, ny, nz, tag, ao) => [0.95 * (0.55 + 0.45 * ao), 0.48 * (0.55 + 0.45 * ao), 0.06] }).geometry;
  CACHE.marigold = g;
  return g;
}

function krathongGeometry() {
  if (CACHE.krathong) return CACHE.krathong;
  const parts = [];
  // banana-trunk slice: fibrous ring profile
  const prof = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    prof.push(new THREE.Vector2(0.002 + 0.15 * Math.sin(t * Math.PI * 0.5) + 0.004 * Math.sin(t * 40), -0.035 + t * 0.07 * (t < 0.95 ? 1 : 0.98)));
  }
  prof.push(new THREE.Vector2(0.002, 0.035));
  const base = new THREE.LatheGeometry(prof, 40);
  parts.push(colorize(clean(base), (i, g) => {
    const y = g.attributes.position.getY(i);
    return y > 0.03 ? [0.82, 0.84, 0.66] : [0.42, 0.5, 0.3];
  }));
  // folded banana-leaf petals in three tiers
  const petal = (r0, h0, len, wid, ang, tilt) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    const tx = -s, tz = c; // tangent
    const bl = [c * r0 - tx * wid, h0, s * r0 - tz * wid], br = [c * r0 + tx * wid, h0, s * r0 + tz * wid];
    const tip = [c * (r0 + len * Math.cos(tilt)), h0 + len * Math.sin(tilt), s * (r0 + len * Math.cos(tilt))];
    const crest = [c * (r0 + len * 0.35), h0 + len * 0.42 + 0.012, s * (r0 + len * 0.35)];
    const back = [c * (r0 - 0.012), h0 - 0.004, s * (r0 - 0.012)];
    const pos = [...bl, ...crest, ...tip, ...crest, ...br, ...tip, ...bl, ...back, ...crest, ...crest, ...back, ...br];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return colorize(g, (i) => (i % 3 === 2 && i < 6 ? [0.42, 0.62, 0.3] : [0.16, 0.34, 0.12]));
  };
  for (const [n, r, h, len, wid, tilt, off] of [[16, 0.135, 0.03, 0.07, 0.022, 1.05, 0], [12, 0.1, 0.05, 0.075, 0.022, 1.15, 0.5], [8, 0.065, 0.07, 0.08, 0.02, 1.25, 0.25]]) {
    for (let i = 0; i < n; i++) parts.push(petal(r, h, len, wid, ((i + off) / n) * TAU, tilt));
  }
  // marigolds and jasmine buds on top
  const mg = marigold();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const g = clean(mg.clone());
    g.translate(Math.cos(a) * 0.045, 0.09, Math.sin(a) * 0.045);
    parts.push(g);
  }
  // candle (lathe) + incense sticks
  const cp = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.012, 0), new THREE.Vector2(0.011, 0.08), new THREE.Vector2(0.008, 0.088), new THREE.Vector2(0.001, 0.09)];
  const candle = new THREE.LatheGeometry(cp, 12);
  candle.translate(0, 0.08, 0);
  parts.push(colorize(clean(candle), [0.93, 0.88, 0.74]));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4;
    const x = Math.cos(a) * 0.025, z = Math.sin(a) * 0.025;
    const st = tubeGeometry([new THREE.Vector3(x, 0.08, z), new THREE.Vector3(x * 1.4, 0.15, z * 1.4), new THREE.Vector3(x * 1.8, 0.22, z * 1.8)], () => 0.0022, 4);
    parts.push(colorize(clean(st), (j, g) => (g.attributes.position.getY(j) > 0.21 ? [1.0, 0.45, 0.12] : [0.36, 0.12, 0.08])));
  }
  const geo = mergeGeometries(parts);
  geo.computeBoundingSphere();
  CACHE.krathong = geo;
  return geo;
}

let KMAT = null;
/** One floating krathong: { root, flame (Object3D at the candle wick), dispose() }. */
export function createKrathong(scale = 1) {
  const geo = krathongGeometry();
  KMAT ||= Object.assign(paintedMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.6, wet: 0.7, brush: 0.4, puddles: 0, side: THREE.DoubleSide }), {});
  KMAT.userData.shared = true;
  const mesh = new THREE.Mesh(geo, KMAT);
  mesh.castShadow = false;
  const root = new THREE.Group();
  root.name = 'krathong';
  root.add(mesh);
  root.scale.setScalar(scale);
  const flame = new THREE.Object3D();
  flame.position.set(0, 0.185, 0);
  root.add(flame);
  return { root, flame, dispose: () => root.removeFromParent() };
}

// ------------------------------------------------------------------ flood water
function edgeAlpha() {
  if (CACHE.alpha) return CACHE.alpha;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 18, 64, 64, 64);
  grd.addColorStop(0, '#fff');
  grd.addColorStop(0.72, '#ddd');
  grd.addColorStop(1, '#000');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  CACHE.alpha = t;
  return t;
}
/** A sheet of dark flood water w × l (m), rippling. { root, update(t), dispose() } */
export function createFloodWater(w = 9, l = 13) {
  const geo = new THREE.PlaneGeometry(w, l, 24, 32).rotateX(-Math.PI / 2);
  const mat = paintedMaterial({ color: 0x0b1210, roughness: 0.05, metalness: 0.1, wet: 1, envReflect: 2, puddles: 0, transparent: true, opacity: 0.9, alphaMap: edgeAlpha(), depthWrite: false, brush: 0.1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  const p = geo.attributes.position;
  const base = Float32Array.from(p.array);
  return {
    root: mesh,
    update(t) {
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        p.setY(i, Math.sin(x * 1.3 + t * 0.9) * 0.012 + Math.sin(z * 0.9 - t * 0.7) * 0.01);
      }
      p.needsUpdate = true;
    },
    dispose: () => {
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
}
