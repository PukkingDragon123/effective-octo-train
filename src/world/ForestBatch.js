// One THREE.BatchedMesh per forest material (+ shadow flag): every species / variant / LOD that
// uses the material lives in it, so the whole forest is ~a dozen draw calls per pass, and each
// instance is culled against every camera that renders it (main view, mirrors, shadow cameras).
// Needs WEBGL_multi_draw (Forest falls back to per-variant InstancedMeshes without it).
//
// Culling is our own (onBeforeRender): the world-space bounding sphere of every selected
// instance is computed once per forest re-selection, so a render pass only tests spheres
// against 6 planes (three's generic path re-derives matrices and spheres every pass).
import * as THREE from 'three';

const _proj = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _pl = new Float32Array(24);

export function canBatch(renderer) {
  try {
    return !!renderer && renderer.capabilities?.isWebGL2 !== false && !!renderer.extensions?.has?.('WEBGL_multi_draw') && !!THREE.BatchedMesh;
  } catch (e) {
    return false;
  }
}

export class BatchPool {
  constructor(material, cast, name) {
    this.material = material;
    this.cast = cast;
    this.name = name;
    this.geos = [];
    this.gids = [];
    this.lsph = null; // local bounding spheres per geometry: x, y, z, r
    this.mesh = null;
    this.cap = 0;
    this.used = 0;
    this.geomOf = null; // per instance: local geometry index
    this.wsph = null; // per instance: world sphere x, y, z, r
  }

  /** Register a geometry; returns its local index. */
  add(geo) {
    this.geos.push(geo);
    return this.geos.length - 1;
  }

  build(parent, cap = 128) {
    let nv = 0, ni = 0;
    for (const g of this.geos) {
      nv += g.attributes.position.count;
      ni += g.index ? g.index.count : g.attributes.position.count;
    }
    const m = new THREE.BatchedMesh(cap, nv, ni, this.material);
    this.gids = this.geos.map((g) => m.addGeometry(g));
    this.lsph = new Float32Array(this.geos.length * 4);
    this.geos.forEach((g, i) => {
      if (!g.boundingSphere) g.computeBoundingSphere();
      const s = g.boundingSphere;
      this.lsph.set([s.center.x, s.center.y, s.center.z, s.radius], i * 4);
    });
    for (let i = 0; i < cap; i++) m.addInstance(this.gids[0]);
    m.perObjectFrustumCulled = true;
    m.sortObjects = false;
    m.frustumCulled = false; // per-instance culling only (the batch bounds change every selection)
    m.castShadow = this.cast;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.visible = false;
    m.name = this.name;
    m.raycast = () => {};
    const pool = this;
    m.onBeforeRender = function (renderer, scene, camera, geometry) {
      pool._cull(renderer, camera, geometry);
    };
    parent.add(m);
    this.mesh = m;
    this.cap = cap;
    this.geomOf = new Int32Array(cap);
    this.wsph = new Float32Array(cap * 4);
    return m;
  }

  begin() {
    this.used = 0;
  }

  /** Add an instance of local geometry li with the 4x4 matrix src[s0..s0+15], 3x3 scaled by fade. */
  push(li, src, s0, fade) {
    if (this.used >= this.cap) this._grow();
    const id = this.used++;
    this.geomOf[id] = li;
    const d = this.mesh._matricesTexture.image.data;
    const o = id * 16;
    if (fade < 1) {
      for (let j = 0; j < 12; j++) d[o + j] = src[s0 + j] * fade;
      d[o + 12] = src[s0 + 12];
      d[o + 13] = src[s0 + 13];
      d[o + 14] = src[s0 + 14];
      d[o + 15] = 1;
    } else {
      for (let j = 0; j < 16; j++) d[o + j] = src[s0 + j];
    }
    // world bounding sphere
    const ls = this.lsph, k = li * 4;
    const cx = ls[k], cy = ls[k + 1], cz = ls[k + 2];
    const w = this.wsph, q = id * 4;
    w[q] = d[o] * cx + d[o + 4] * cy + d[o + 8] * cz + d[o + 12];
    w[q + 1] = d[o + 1] * cx + d[o + 5] * cy + d[o + 9] * cz + d[o + 13];
    w[q + 2] = d[o + 2] * cx + d[o + 6] * cy + d[o + 10] * cz + d[o + 14];
    const sx = d[o] * d[o] + d[o + 1] * d[o + 1] + d[o + 2] * d[o + 2];
    const sy = d[o + 4] * d[o + 4] + d[o + 5] * d[o + 5] + d[o + 6] * d[o + 6];
    const sz = d[o + 8] * d[o + 8] + d[o + 9] * d[o + 9] + d[o + 10] * d[o + 10];
    w[q + 3] = ls[k + 3] * Math.sqrt(Math.max(sx, sy, sz));
  }

  commit() {
    const m = this.mesh;
    if (!m) return 0;
    if (this.used) m._matricesTexture.needsUpdate = true;
    m.visible = this.used > 0;
    return this.used;
  }

  /** Per-pass culling: fills the multi-draw lists with the instances inside the camera frustum. */
  _cull(renderer, camera, geometry) {
    const m = this.mesh;
    const index = geometry.getIndex();
    const bpe = index === null ? 1 : index.array.BYTES_PER_ELEMENT;
    _proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(m.matrixWorld);
    _frustum.setFromProjectionMatrix(_proj, renderer.coordinateSystem);
    const P = _frustum.planes;
    for (let i = 0; i < 6; i++) {
      _pl[i * 4] = P[i].normal.x;
      _pl[i * 4 + 1] = P[i].normal.y;
      _pl[i * 4 + 2] = P[i].normal.z;
      _pl[i * 4 + 3] = P[i].constant;
    }
    const starts = m._multiDrawStarts, counts = m._multiDrawCounts;
    const indirect = m._indirectTexture.image.data;
    const info = m._geometryInfo, gids = this.gids, geomOf = this.geomOf, w = this.wsph;
    let n = 0;
    for (let i = 0, used = this.used; i < used; i++) {
      const q = i * 4;
      const x = w[q], y = w[q + 1], z = w[q + 2], r = -w[q + 3];
      if (_pl[0] * x + _pl[1] * y + _pl[2] * z + _pl[3] < r) continue;
      if (_pl[4] * x + _pl[5] * y + _pl[6] * z + _pl[7] < r) continue;
      if (_pl[8] * x + _pl[9] * y + _pl[10] * z + _pl[11] < r) continue;
      if (_pl[12] * x + _pl[13] * y + _pl[14] * z + _pl[15] < r) continue;
      if (_pl[16] * x + _pl[17] * y + _pl[18] * z + _pl[19] < r) continue;
      if (_pl[20] * x + _pl[21] * y + _pl[22] * z + _pl[23] < r) continue;
      const g = info[gids[geomOf[i]]];
      starts[n] = g.start * bpe;
      counts[n] = g.count;
      indirect[n] = i;
      n++;
    }
    m._indirectTexture.needsUpdate = true;
    m._multiDrawCount = n;
    m._visibilityChanged = false;
  }

  _grow() {
    const m = this.mesh;
    const n = this.cap * 2;
    m.setInstanceCount(n);
    for (let i = this.cap; i < n; i++) m.addInstance(this.gids[0]);
    const g = new Int32Array(n);
    g.set(this.geomOf);
    this.geomOf = g;
    const w = new Float32Array(n * 4);
    w.set(this.wsph);
    this.wsph = w;
    this.cap = n;
  }

  dispose() {
    this.mesh?.dispose?.();
  }
}
