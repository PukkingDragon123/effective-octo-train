// Static batching of roadside dressing. Props are placed into spatial chunks (live groups:
// anchors, LOD detail children and flickering lamp meshes stay untouched); then every
// mergeable mesh of a chunk (shared material, default onBeforeRender, not inside a LOD) is
// baked into one geometry per material + attribute layout. The world toggles whole chunks
// by distance, three.js frustum-culls the merged meshes.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();
const DEFAULT_OBR = THREE.Object3D.prototype.onBeforeRender;

export class ChunkBatcher {
  constructor(parent, size = 96) {
    this.parent = parent;
    this.size = size;
    this.chunks = new Map();
    this.list = [];
  }

  chunkAt(x, z) {
    const ix = Math.floor(x / this.size), iz = Math.floor(z / this.size);
    const key = ix * 100003 + iz;
    let c = this.chunks.get(key);
    if (!c) {
      const group = new THREE.Group();
      group.name = `propChunk_${ix}_${iz}`;
      this.parent.add(group);
      c = { key, group, cx: (ix + 0.5) * this.size, cz: (iz + 0.5) * this.size, r: this.size * 0.75, merged: [], count: 0 };
      this.chunks.set(key, c);
      this.list.push(c);
    }
    return c;
  }

  /** Add an object (already positioned in world space) to the chunk containing (x, z). */
  add(object, x, z) {
    const c = this.chunkAt(x, z);
    c.group.add(object);
    c.count++;
    return c;
  }

  /** Merge static meshes of every chunk. Returns {meshesBefore, meshesAfter}. */
  finalize() {
    let before = 0, after = 0;
    this.parent.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(this.parent.matrixWorld).invert();
    for (const c of this.list) {
      const buckets = new Map();
      const victims = [];
      let maxR = 0;
      c.group.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible) return;
        before++;
        const mat = o.material;
        if (Array.isArray(mat) || o.userData.noMerge || mat.userData?.perInstance) return;
        if (o.onBeforeRender !== DEFAULT_OBR) return;
        for (let p = o.parent; p && p !== c.group; p = p.parent) if (p.isLOD || !p.visible) return;
        const g = o.geometry;
        if (!g || !g.attributes.position) return;
        const names = Object.keys(g.attributes).sort();
        const sig = `${mat.uuid}|${o.layers.mask}|${names.map((n) => n + g.attributes[n].itemSize + (g.attributes[n].normalized ? 'n' : '')).join(',')}|${g.index ? 1 : 0}`;
        let b = buckets.get(sig);
        if (!b) buckets.set(sig, (b = { mat, names, layers: o.layers.mask, items: [], verts: 0, idx: 0, cast: false, receive: false, order: o.renderOrder }));
        _m.multiplyMatrices(rootInv, o.matrixWorld);
        b.items.push({ g, m: _m.clone() });
        b.verts += g.attributes.position.count;
        b.idx += g.index ? g.index.count : g.attributes.position.count;
        b.cast ||= o.castShadow;
        b.receive ||= o.receiveShadow;
        victims.push(o);
      });
      for (const o of victims) o.parent.remove(o);
      for (const b of buckets.values()) {
        const geo = mergeBucket(b);
        const mesh = new THREE.Mesh(geo, b.mat);
        mesh.castShadow = b.cast;
        mesh.receiveShadow = b.receive;
        mesh.layers.mask = b.layers;
        mesh.renderOrder = b.order;
        mesh.matrixAutoUpdate = false;
        mesh.name = `${c.group.name}:${b.mat.name || 'mat'}`;
        c.group.add(mesh);
        c.merged.push(mesh);
        geo.computeBoundingSphere();
        const s = geo.boundingSphere;
        maxR = Math.max(maxR, Math.hypot(s.center.x - c.cx, s.center.z - c.cz) + s.radius);
      }
      c.r = Math.max(c.r, maxR);
      let n = 0;
      c.group.traverse((o) => {
        if (o.isMesh) n++;
      });
      after += n;
    }
    return { meshesBefore: before, meshesAfter: after };
  }

  update(focus, dist) {
    for (const c of this.list) {
      const d = Math.hypot(c.cx - focus.x, c.cz - focus.z) - c.r;
      c.group.visible = d < dist;
    }
  }
}

function mergeBucket(b) {
  const geo = new THREE.BufferGeometry();
  const V = b.verts;
  const arrays = {};
  for (const n of b.names) {
    const src = b.items[0].g.attributes[n];
    arrays[n] = { a: new Float32Array(V * src.itemSize), size: src.itemSize, norm: src.normalized };
  }
  const index = V > 65535 ? new Uint32Array(b.idx) : new Uint16Array(b.idx);
  let vo = 0, io = 0;
  for (const it of b.items) {
    const g = it.g;
    const n = g.attributes.position.count;
    _n.getNormalMatrix(it.m);
    for (const name of b.names) {
      const src = g.attributes[name];
      const dst = arrays[name];
      const sz = dst.size;
      if (name === 'position') {
        for (let i = 0; i < n; i++) {
          _v.fromBufferAttribute(src, i).applyMatrix4(it.m);
          dst.a[(vo + i) * 3] = _v.x;
          dst.a[(vo + i) * 3 + 1] = _v.y;
          dst.a[(vo + i) * 3 + 2] = _v.z;
        }
      } else if (name === 'normal') {
        for (let i = 0; i < n; i++) {
          _v.fromBufferAttribute(src, i).applyMatrix3(_n).normalize();
          dst.a[(vo + i) * 3] = _v.x;
          dst.a[(vo + i) * 3 + 1] = _v.y;
          dst.a[(vo + i) * 3 + 2] = _v.z;
        }
      } else if (name === 'tangent') {
        for (let i = 0; i < n; i++) {
          _v.set(src.getX(i), src.getY(i), src.getZ(i)).transformDirection(it.m);
          dst.a.set([_v.x, _v.y, _v.z, src.getW(i)], (vo + i) * 4);
        }
      } else {
        for (let i = 0; i < n; i++) for (let k = 0; k < sz; k++) dst.a[(vo + i) * sz + k] = src.getComponent(i, k);
      }
    }
    if (g.index) {
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i++) index[io + i] = ia[i] + vo;
      io += ia.length;
    } else {
      for (let i = 0; i < n; i++) index[io + i] = vo + i;
      io += n;
    }
    // mirrored transforms flip the winding
    if (it.m.determinant() < 0) {
      const start = io - (g.index ? g.index.count : n);
      for (let i = start; i < io; i += 3) {
        const t = index[i + 1];
        index[i + 1] = index[i + 2];
        index[i + 2] = t;
      }
    }
    vo += n;
  }
  for (const n of b.names) geo.setAttribute(n, new THREE.BufferAttribute(arrays[n].a, arrays[n].size, arrays[n].norm));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return geo;
}
