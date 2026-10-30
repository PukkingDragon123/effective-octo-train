// Static batching of roadside dressing. Props are placed into spatial chunks (live groups:
// anchors, LOD detail children and flickering lamp meshes stay untouched); then every
// mergeable mesh of a chunk (shared material, default onBeforeRender, not inside a LOD) is
// baked into one geometry per material + attribute layout. The world toggles whole chunks
// by distance, three.js frustum-culls the merged meshes.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _s = new THREE.Sphere();
const SMALL_R = 1.25; // merged-mesh bounding radius below which a prop part counts as small
const SMALL_DIST = 85; // small props are not drawn beyond this (m): night fog hides them anyway
const SMALL_MIRROR = 30;
function smallPropPass(renderer, scene, camera, geometry) {
  const rt = renderer.getRenderTarget();
  let n = Infinity;
  if (rt && rt.height <= 400 && camera.isPerspectiveCamera) {
    const s = geometry.boundingSphere, e = camera.matrixWorld.elements;
    if (Math.hypot(s.center.x - e[12], s.center.y - e[13], s.center.z - e[14]) - s.radius > SMALL_MIRROR) n = 0;
  }
  geometry.drawRange.count = n;
}
function smallPropShadow(renderer, object, camera, shadowCamera, geometry) {
  geometry.drawRange.count = Infinity;
}
const _I = new THREE.Matrix4();
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
    c.dirty = true;
    c.lastAdd = this.tick || 0;
    return c;
  }

  /** Merge static meshes of every chunk. Returns {meshesBefore, meshesAfter}. */
  finalize() {
    let before = 0, after = 0;
    this._rootReady = false;
    for (const c of this.list) {
      const r = this.finalizeChunk(c);
      before += r.before;
      after += r.after;
    }
    return { meshesBefore: before, meshesAfter: after };
  }

  /**
   * Merge the chunk's static meshes (again): meshes added since the last merge are baked
   * together with the chunk's merged meshes of the same material, so late additions (props
   * built in the background) never add draw calls.
   */
  finalizeChunk(c) {
    c.dirty = false;
    let before = 0, after = 0;
    if (!this._rootReady) {
      this.parent.updateMatrixWorld(true);
      this._rootReady = true;
    } else c.group.updateMatrixWorld(true);
    const rootInv = _inv.copy(this.parent.matrixWorld).invert();
    const buckets = new Map();
    const victims = [];
    let maxR = 0;
    const merged = new Set(c.merged);
    c.group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || (!o.visible && !merged.has(o))) return;
      before++;
      const mat = o.material;
      if (Array.isArray(mat) || o.userData.noMerge || mat.userData?.perInstance) return;
      if (!merged.has(o) && o.onBeforeRender !== DEFAULT_OBR) return;
      for (let p = o.parent; p && p !== c.group; p = p.parent) if (p.isLOD || !p.visible) return;
      const g = o.geometry;
      if (!g || !g.attributes.position) return;
      const names = Object.keys(g.attributes).sort();
      // small props (spirit houses, clutter, insulators...) merge per 48 m quarter and hide
      // beyond SMALL_DIST; big ones (poles, wires, guardrails, signs) stay with the chunk
      let cls = 'b';
      if (merged.has(o)) cls = o.userData.cls || 'b';
      else {
        if (!g.boundingSphere) g.computeBoundingSphere();
        _s.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
        if (_s.radius < SMALL_R) cls = 's' + (_s.center.x - c.cx > 0 ? 1 : 0) + (_s.center.z - c.cz > 0 ? 1 : 0);
      }
      const sig = `${mat.uuid}|${o.layers.mask}|${names.map((n) => n + g.attributes[n].itemSize + (g.attributes[n].normalized ? 'n' : '')).join(',')}|${g.index ? 1 : 0}|${cls}`;
      let b = buckets.get(sig);
      if (!b) buckets.set(sig, (b = { mat, names, layers: o.layers.mask, items: [], verts: 0, idx: 0, cast: false, receive: false, order: o.renderOrder, old: null, cls }));
      _m.multiplyMatrices(rootInv, o.matrixWorld);
      b.items.push({ g, m: _m.clone() });
      b.verts += g.attributes.position.count;
      b.idx += g.index ? g.index.count : g.attributes.position.count;
      b.cast ||= o.castShadow;
      b.receive ||= o.receiveShadow;
      if (merged.has(o)) b.old = (b.old || 0) + 1;
      victims.push(o);
    });
    // a bucket that only holds an already-merged mesh stays as it is
    for (const [sig, b] of buckets) {
      if (b.items.length === 1 && b.old === 1) {
        buckets.delete(sig);
        victims.splice(victims.indexOf(c.merged.find((m) => m.geometry === b.items[0].g)), 1);
      }
    }
    for (const o of victims) {
      o.parent.remove(o);
      if (merged.has(o)) {
        o.geometry.dispose();
        c.merged.splice(c.merged.indexOf(o), 1);
      }
    }
    for (const b of buckets.values()) {
      const geo = mergeBucket(b);
      const mesh = new THREE.Mesh(geo, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      mesh.layers.mask = b.layers;
      mesh.renderOrder = b.order;
      mesh.matrixAutoUpdate = false;
      mesh.name = `${c.group.name}:${b.mat.name || 'mat'}${b.cls === 'b' ? '' : ':small'}`;
      mesh.userData.cls = b.cls;
      if (b.cls !== 'b') {
        // mirror-sized passes (car mirrors, 256 px) skip small props beyond SMALL_MIRROR m
        mesh.onBeforeRender = smallPropPass;
        mesh.onBeforeShadow = smallPropShadow;
      }
      c.group.add(mesh);
      c.merged.push(mesh);
    }
    c.small = c.merged.filter((m) => m.userData.cls !== 'b');
    for (const m of c.small) if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    for (const mesh of c.merged) {
      const geo = mesh.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const s = geo.boundingSphere;
      maxR = Math.max(maxR, Math.hypot(s.center.x - c.cx, s.center.z - c.cz) + s.radius);
    }
    c.r = Math.max(c.r, maxR);
    c.group.traverse((o) => {
      if (o.isMesh) after++;
    });
    return { before, after };
  }

  update(focus, dist) {
    const near = Math.min(dist, SMALL_DIST);
    for (const c of this.list) {
      const d = Math.hypot(c.cx - focus.x, c.cz - focus.z) - c.r;
      c.group.visible = d < dist;
      if (!c.group.visible || !c.small) continue;
      for (const m of c.small) {
        const s = m.geometry.boundingSphere;
        m.visible = Math.hypot(s.center.x - focus.x, s.center.z - focus.z) - s.radius < near;
      }
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
    const e = it.m.elements, ne = _n.elements;
    const ident = it.m.equals(_I);
    for (const name of b.names) {
      const src = g.attributes[name];
      const dst = arrays[name];
      const sz = dst.size;
      const plain = !src.isInterleavedBufferAttribute && !src.normalized && src.array && src.itemSize === sz;
      const sa = plain ? src.array : null;
      const d = dst.a;
      if (name === 'position' && sa && sz === 3) {
        if (ident) d.set(sa.subarray(0, n * 3), vo * 3);
        else {
          for (let i = 0, o = vo * 3; i < n * 3; i += 3, o += 3) {
            const x = sa[i], y = sa[i + 1], z = sa[i + 2];
            const wd = e[3] * x + e[7] * y + e[11] * z + e[15] || 1;
            d[o] = (e[0] * x + e[4] * y + e[8] * z + e[12]) / wd;
            d[o + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) / wd;
            d[o + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) / wd;
          }
        }
      } else if (name === 'normal' && sa && sz === 3) {
        if (ident) d.set(sa.subarray(0, n * 3), vo * 3);
        else {
          for (let i = 0, o = vo * 3; i < n * 3; i += 3, o += 3) {
            const x = sa[i], y = sa[i + 1], z = sa[i + 2];
            let nx = ne[0] * x + ne[3] * y + ne[6] * z, ny = ne[1] * x + ne[4] * y + ne[7] * z, nz = ne[2] * x + ne[5] * y + ne[8] * z;
            const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            d[o] = nx / l;
            d[o + 1] = ny / l;
            d[o + 2] = nz / l;
          }
        }
      } else if (name === 'position') {
        for (let i = 0; i < n; i++) {
          _v.fromBufferAttribute(src, i).applyMatrix4(it.m);
          d[(vo + i) * 3] = _v.x;
          d[(vo + i) * 3 + 1] = _v.y;
          d[(vo + i) * 3 + 2] = _v.z;
        }
      } else if (name === 'normal') {
        for (let i = 0; i < n; i++) {
          _v.fromBufferAttribute(src, i).applyMatrix3(_n).normalize();
          d[(vo + i) * 3] = _v.x;
          d[(vo + i) * 3 + 1] = _v.y;
          d[(vo + i) * 3 + 2] = _v.z;
        }
      } else if (name === 'tangent') {
        for (let i = 0; i < n; i++) {
          _v.set(src.getX(i), src.getY(i), src.getZ(i)).transformDirection(it.m);
          d.set([_v.x, _v.y, _v.z, src.getW(i)], (vo + i) * 4);
        }
      } else if (sa) {
        d.set(sa.subarray(0, n * sz), vo * sz);
      } else {
        for (let i = 0; i < n; i++) for (let k = 0; k < sz; k++) d[(vo + i) * sz + k] = src.getComponent(i, k);
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
