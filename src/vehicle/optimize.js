// Post-bind draw-call optimisation for GLB vehicles (generic: it never looks at node names, so new
// Blender exports with the TaxiGLB.js node contract drop in unchanged).
//
//   mergeStaticMeshes(shell, refs)   every leaf mesh under `shell` that nothing references (not a
//                                     pivot / door / wheel / lens group / display / anchor parent ...)
//                                     and that shares its material with another one is baked into ONE
//                                     mesh per material (shell space). Fewer draw calls in the main,
//                                     mirror and shadow passes; same triangles, same look.
//   new DetailCuller(roots)           small cabin controls (pedals, needles, cranks, levers, key...)
//                                     stop rendering while the camera is outside and away from the car
//                                     (layer mask, so the controls' own .visible logic is untouched).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Every Object3D reachable from the given values (objects / arrays / plain records, a few levels deep). */
export function collectRefs(values, depth = 4, out = new Set()) {
  const walk = (v, d) => {
    if (!v || typeof v !== 'object' || d < 0) return;
    if (v.isObject3D) {
      out.add(v);
      return;
    }
    if (v.isMaterial || v.isTexture || v.isBufferGeometry || v.isVector3 || ArrayBuffer.isView(v)) return;
    if (Array.isArray(v)) for (const x of v) walk(x, d - 1);
    else for (const k of Object.keys(v)) walk(v[k], d - 1);
  };
  for (const v of values) walk(v, depth);
  return out;
}

function attrSignature(g) {
  const names = Object.keys(g.attributes).sort();
  return names.map((n) => {
    const a = g.attributes[n];
    return `${n}:${a.itemSize}:${a.array.constructor.name}:${a.normalized ? 1 : 0}`;
  }).join('|');
}

/**
 * Merge static leaf meshes per material. refs = Set of referenced Object3Ds (they and everything
 * under them stay untouched). Returns { before, after } draw counts of the merged set.
 */
export function mergeStaticMeshes(shell, refs) {
  shell.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(shell.matrixWorld).invert();
  const groups = new Map();
  const visit = (o) => {
    if (refs.has(o) || o.visible === false) return;
    if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && o.children.length === 0 && !Array.isArray(o.material) && o.material && !o.material.transparent && o.layers.mask === 1 && !o.morphTargetInfluences && o.geometry?.index && o.geometry.attributes.position?.array instanceof Float32Array) {
      const g = o.geometry;
      const key = [o.material.uuid, o.castShadow ? 1 : 0, o.receiveShadow ? 1 : 0, o.renderOrder, attrSignature(g), Object.keys(g.morphAttributes).length].join('/');
      let e = groups.get(key);
      if (!e) groups.set(key, (e = { material: o.material, meshes: [], cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder }));
      e.meshes.push(o);
    }
    for (const c of o.children) visit(c);
  };
  for (const c of shell.children) visit(c);
  let before = 0, after = 0;
  const m = new THREE.Matrix4();
  for (const e of groups.values()) {
    if (e.meshes.length < 2) continue;
    const parts = [];
    for (const o of e.meshes) {
      const g = o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (g.attributes[k].isInterleavedBufferAttribute) g.setAttribute(k, g.attributes[k].clone());
      m.multiplyMatrices(inv, o.matrixWorld);
      g.applyMatrix4(m);
      if (m.determinant() < 0) {
        // a mirrored node: baking the transform flips the winding, swap it back
        const idx = g.index.array;
        for (let i = 0; i < idx.length; i += 3) {
          const t = idx[i + 1];
          idx[i + 1] = idx[i + 2];
          idx[i + 2] = t;
        }
      }
      g.groups.length = 0;
      parts.push(g);
    }
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, e.material);
    mesh.name = 'merged:' + (e.material.name || 'mat');
    mesh.castShadow = e.cast;
    mesh.receiveShadow = e.receive;
    mesh.renderOrder = e.order;
    mesh.userData.mergedFrom = e.meshes.map((o) => o.name);
    shell.add(mesh);
    for (const o of e.meshes) o.removeFromParent();
    before += e.meshes.length;
    after++;
  }
  shell.updateMatrixWorld(true);
  return { before, after };
}

/**
 * Cabin detail that can't be seen from outside the car beyond a few metres (pedals under the dash,
 * gauge needles, window cranks, levers, the key...). set(hidden) flips the meshes' layer masks.
 */
export class DetailCuller {
  constructor(roots) {
    this.meshes = [];
    for (const r of roots) {
      if (!r) continue;
      r.traverse((o) => {
        if (o.isMesh && !this.meshes.some((e) => e.o === o)) this.meshes.push({ o, mask: o.layers.mask });
      });
    }
    this.hidden = false;
  }
  set(hidden) {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    for (const e of this.meshes) {
      if (hidden) {
        e.mask = e.o.layers.mask;
        e.o.layers.mask = 0;
      } else if (e.o.layers.mask === 0) e.o.layers.mask = e.mask;
    }
  }
}

/**
 * Grip radius of a steering wheel: vertices of the meshes under `spin`, in spin space (rim in the XY
 * plane), outer rim edge (99th percentile of the radial distance) minus half a typical rim tube.
 * Returns 0 when there is nothing to measure.
 */
export function measureRimRadius(spin, tube = 0.013) {
  if (!spin) return 0;
  spin.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(spin.matrixWorld).invert();
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  const rs = [];
  spin.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    const p = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(p.count / 4000));
    for (let i = 0; i < p.count; i += step) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      if (Math.abs(v.z) < 0.08) rs.push(Math.hypot(v.x, v.y));
    }
  });
  if (rs.length < 32) return 0;
  rs.sort((a, b) => a - b);
  const outer = rs[Math.floor(rs.length * 0.99)];
  const r = outer - tube;
  return r > 0.12 && r < 0.3 ? r : 0;
}
