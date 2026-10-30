// Forest: scatters every species along the road corridor and draws them with a handful of
// global InstancedMeshes (one per species-variant-LOD part, sharing one instance-matrix
// buffer per variant-LOD). Every few frames the instances near the focus are re-selected
// by distance into LOD0 / LOD1 / cross-billboard impostors (rendered from the real trees
// at build time) or culled, so draw calls stay ~constant (~120) wherever you are.
import * as THREE from 'three';
import { paintedMaterial, foliageMaterial } from '../render/index.js';
import { tex } from '../textures/index.js';
import { engine } from '../core/Engine.js';
import { makeRng, SimplexNoise, smoothstep } from '../core/math.js';
import { SPECIES, buildVariant, rockGeometry, bambooTexture } from './TreeFactory.js';
import { foliageAtlas, silhouetteTexture } from './foliageAtlas.js';
import { chainPatch, inject } from './shaderUtil.js';
import { W } from './constants.js';

const CELL = W.forestCell;
const cellKey = (ix, iz) => (ix + 4096) * 8192 + (iz + 4096);

/** Undo three's back-face normal flip so crown-bent normals light both card sides alike. */
function unflipNormals(m, key) {
  return chainPatch(m, key, (shader) => {
    shader.fragmentShader = inject(shader.fragmentShader, '#include <normal_fragment_begin>', '#ifdef DOUBLE_SIDED\n normal *= faceDirection;\n#endif');
  });
}

/**
 * Crisp foliage edges: scale alpha by the sampled mip level so distant cards keep their
 * coverage (no thinning / mush), then alpha-to-coverage (MSAA) or the alpha test cuts a clean edge.
 */
function crispAlpha(m, key) {
  if (!m) return m;
  return chainPatch(m, key, (shader) => {
    shader.fragmentShader = inject(
      shader.fragmentShader,
      '#include <map_fragment>',
      `#ifdef USE_MAP
      {
        vec2 tsz = vec2(textureSize(map, 0));
        vec2 ddx = dFdx(vMapUv * tsz), ddy = dFdy(vMapUv * tsz);
        float mipL = max(0.0, 0.5 * log2(max(dot(ddx, ddx), dot(ddy, ddy))));
        diffuseColor.a = clamp(diffuseColor.a * (1.0 + mipL * 0.3), 0.0, 1.0);
      }
      #endif`,
    );
  });
}

function texSafe(key, opts) {
  try {
    return tex(key, opts);
  } catch (e) {
    return null;
  }
}

// species groups used by the scatter + LOD rules
const KIND_LOD = {
  big: { lod0: W.lod.big0, lod1: W.lod.big1, impostor: true, keepMin: 0.7 },
  mid: { lod0: W.lod.small0, lod1: 70, impostor: true, keepMin: 0.55 },
  small: { lod0: 30, lod1: 60, cull: 64, impostor: false, keepMin: 0.4 },
  ground: { lod0: 14, lod1: W.lod.groundCull, cull: W.lod.groundCull, impostor: false, keepMin: 0.25 },
  rock: { lod0: 24, lod1: 62, cull: 62, impostor: false, keepMin: 0.8 },
  vine: { lod0: 55, lod1: 55, cull: 55, impostor: false, keepMin: 0.6 },
};

export class Forest {
  constructor(world, opts = {}) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'forest';
    this.density = opts.density ?? 1;
    this.maxDensity = 1.3;
    this.variants = []; // see _addVariant
    this.byName = {};
    this.cells = new Map();
    this._last = new THREE.Vector3(1e9, 0, 1e9);
    this._timer = 0;
    this.noise = new SimplexNoise(world.road ? 4711 : 1);
    this.colliders = []; // big trunks near roads {x,z,r}
    this._stats = {};
  }

  // ---------------------------------------------------------------------------------
  _materials() {
    const atlas = foliageAtlas();
    const barkMap = texSafe('bark', { repeat: [1, 1] });
    const barkN = texSafe('bark_normal', { repeat: [1, 1] });
    const banyanMap = texSafe('bark_banyan', { repeat: [1, 1] }) || barkMap;
    this.mats = {
      bark: paintedMaterial({ name: 'bark', map: barkMap, normalMap: barkN, vertexColors: true, roughness: 0.92, wind: 'trunk', moss: 0.45, brush: 0.6, wet: 0.5 }),
      banyanBark: paintedMaterial({ name: 'barkBanyan', map: banyanMap, normalMap: barkN, vertexColors: true, roughness: 0.9, wind: 'trunk', moss: 0.35, brush: 0.6, wet: 0.5 }),
      stem: paintedMaterial({ name: 'plantStem', color: 0xffffff, vertexColors: true, roughness: 0.75, wind: 'leaf', brush: 0.5, wet: 0.6 }),
      bamboo: paintedMaterial({ name: 'bambooCulm', map: bambooTexture(), vertexColors: true, roughness: 0.55, wind: 'leaf', brush: 0.4, wet: 0.6 }),
      leaves: unflipNormals(foliageMaterial({ name: 'leaves', map: atlas, alphaTest: 0.45, vertexColors: true, wind: 'leaf', flutter: 1.7, translucency: 0.7, roughness: 0.72, brush: 0.45 }), 'unflip'),
      ground: unflipNormals(foliageMaterial({ name: 'groundLeaves', map: atlas, alphaTest: 0.42, vertexColors: true, wind: 'grass', translucency: 0.6, roughness: 0.75, brush: 0.5 }), 'unflip'),
      vine: unflipNormals(foliageMaterial({ name: 'vines', map: atlas, alphaTest: 0.42, vertexColors: true, wind: 'vine', translucency: 0.5, roughness: 0.8 }), 'unflip'),
      rock: paintedMaterial({ name: 'rock', color: 0xb8b4aa, vertexColors: true, triplanar: 'rock', triplanarScale: 0.45, roughness: 0.88, moss: 0.65, brush: 0.6, wet: 0.6 }),
    };
    for (const k of ['leaves', 'ground', 'vine']) crispAlpha(this.mats[k], 'crisp');
    for (const m of Object.values(this.mats)) m.side = m.side ?? THREE.FrontSide;
    this.mats.stem.side = THREE.DoubleSide;
  }

  _leafMatFor(name) {
    if (name === 'fern' || name === 'grass' || name === 'elephantEar' || name === 'shrub') return this.mats.ground;
    if (name === 'vine') return this.mats.vine;
    return this.mats.leaves;
  }

  /** Create instanced meshes for one built variant. */
  _addVariant(name, v, built) {
    const sp = SPECIES[name];
    const kind = name === 'rock' ? 'rock' : name === 'vine' ? 'vine' : name === 'banana' || name === 'treeFern' ? 'small' : built.kind;
    const rule = KIND_LOD[kind] || KIND_LOD.mid;
    const rec = {
      name, v, kind, rule, built, index: this.variants.length,
      lods: [], impostor: null,
      inst: { x: [], y: [], z: [], m: [], rnd: [] },
      hasImpostor: !!sp?.impostor,
      lodCount: built.lods.length,
    };
    built.lods.forEach((parts, li) => {
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(16 * 64), 16);
      attr.setUsage(THREE.DynamicDrawUsage);
      const meshes = [];
      for (const [part, geo] of Object.entries(parts)) {
        if (!geo) continue;
        const mat = part === 'leaves' ? this._leafMatFor(name) : this.mats[part] || this.mats.bark;
        const mesh = new THREE.InstancedMesh(geo, mat, 64);
        mesh.instanceMatrix = attr;
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.visible = false;
        mesh.castShadow = li === 0 && (kind === 'big' || kind === 'mid' || kind === 'small');
        mesh.receiveShadow = true;
        mesh.name = `${name}${v}_lod${li}_${part}`;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
        meshes.push(mesh);
      }
      rec.lods.push({ attr, meshes, cap: 64, count: 0 });
    });
    this.variants.push(rec);
    (this.byName[name] || (this.byName[name] = [])).push(rec);
    return rec;
  }

  // ---------------------------------------------------------------------------------
  async build(onProgress) {
    const yieldNow = () => new Promise((r) => setTimeout(r, 0));
    this._materials();
    onProgress?.(0.02, 'กำลังวาดใบไม้…', 'Painting leaves…');
    await yieldNow();
    // ---- build species variants -----------------------------------------------------------
    const names = Object.keys(SPECIES);
    let done = 0;
    const total = names.reduce((a, n) => a + SPECIES[n].variants, 0) + 3;
    for (const name of names) {
      const sp = SPECIES[name];
      for (let v = 0; v < sp.variants; v++) {
        const built = buildVariant(name, v, 1000 + v * 97 + name.length * 13 + name.charCodeAt(0) * 7);
        this._addVariant(name, v, built);
        done++;
        onProgress?.(0.02 + (done / total) * 0.35, 'กำลังปลูกต้นไม้…', 'Growing the trees…');
        await yieldNow();
      }
    }
    // rocks (single geometry, one LOD)
    const rrng = makeRng(5150);
    for (let v = 0; v < 4; v++) {
      const geo = rockGeometry(rrng, 1);
      const rec = this._addVariant('rock', v, { lods: [{ bark: geo }, { bark: geo.userData.lod1 }], kind: 'rock', height: 1, radius: 1.2 });
      for (const l of rec.lods) l.meshes[0].material = this.mats.rock;
    }
    // ---- impostors ---------------------------------------------------------------------------
    onProgress?.(0.4, 'กำลังวาดป่าไกล…', 'Painting the distant forest…');
    await yieldNow();
    try {
      this._buildImpostors();
    } catch (e) {
      console.warn('[world] impostor capture failed', e);
    }
    // ---- scatter -------------------------------------------------------------------------------
    onProgress?.(0.45, 'กำลังปลูกป่า…', 'Planting the jungle…');
    await this._scatter((f) => onProgress?.(0.45 + f * 0.53, 'กำลังปลูกป่า…', 'Planting the jungle…'));
    this._finalizeInstances();
    try {
      this._buildFlats();
    } catch (e) {
      console.warn('[world] silhouette flats failed', e);
    }
    onProgress?.(1);
  }

  // ---------------------------------------------------------------------------------
  // impostors: render each tree variant from the side into an atlas, draw far trees as
  // two crossed cards with crown-bent normals (lit like the real foliage).
  // ---------------------------------------------------------------------------------
  _buildImpostors() {
    const renderer = engine.renderer;
    if (!renderer) return;
    const list = this.variants.filter((r) => r.hasImpostor);
    if (!list.length) return;
    const tile = 256;
    const cols = 8, rows = Math.ceil(list.length / cols);
    const W2 = tile * cols, H2 = tile * rows;
    const rt = new THREE.WebGLRenderTarget(W2, H2, { type: THREE.HalfFloatType, depthBuffer: true, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const atlas = foliageAtlas();
    const basicLeaf = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide });
    const basicBark = new THREE.MeshBasicMaterial({ map: this.mats.bark.map, vertexColors: true });
    const basicBanyan = new THREE.MeshBasicMaterial({ map: this.mats.banyanBark.map, vertexColors: true });
    const basicBamboo = new THREE.MeshBasicMaterial({ map: bambooTexture(), vertexColors: true });
    const basicStem = new THREE.MeshBasicMaterial({ vertexColors: true });
    const matFor = { leaves: basicLeaf, bark: basicBark, banyanBark: basicBanyan, bamboo: basicBamboo, stem: basicStem };
    const prevRT = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    rt.viewport.set(0, 0, W2, H2);
    rt.scissorTest = false;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(new THREE.Color(0.035, 0.05, 0.025), 0);
    renderer.clear(true, true, true);
    list.forEach((rec, i) => {
      const parts = rec.built.lods[0];
      const meshes = [];
      const box = new THREE.Box3();
      for (const [part, geo] of Object.entries(parts)) {
        if (!geo) continue;
        const m = new THREE.Mesh(geo, matFor[part] || basicBark);
        meshes.push(m);
        geo.computeBoundingBox();
        box.union(geo.boundingBox);
        scene.add(m);
      }
      const hw = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z)) * 1.02;
      const y0 = Math.max(-0.5, box.min.y), y1 = box.max.y * 1.01;
      const size = Math.max(hw * 2, y1 - y0);
      const cx = 0, cy = y0 + size / 2;
      cam.left = -size / 2;
      cam.right = size / 2;
      cam.top = size / 2;
      cam.bottom = -size / 2;
      cam.position.set(cx, cy, 100);
      cam.lookAt(cx, cy, 0);
      cam.updateProjectionMatrix();
      const tx = (i % cols) * tile, ty = Math.floor(i / cols) * tile;
      rt.viewport.set(tx, ty, tile, tile);
      rt.scissor.set(tx, ty, tile, tile);
      rt.scissorTest = true;
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      for (const m of meshes) scene.remove(m);
      rec.impostorInfo = { u0: tx / W2, v0: ty / H2, u1: (tx + tile) / W2, v1: (ty + tile) / H2, size, y0: cy - size / 2, crownY: rec.built.crownY ?? size * 0.6 };
    });
    rt.scissorTest = false;
    rt.viewport.set(0, 0, W2, H2);
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.autoClear = prevAuto;
    for (const m of Object.values(matFor)) m.dispose();
    rt.texture.generateMipmaps = true;
    rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
    // generate mipmaps once with the final contents
    try {
      const props = renderer.properties.get(rt.texture);
      const gl = renderer.getContext();
      if (props.__webglTexture) {
        gl.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.bindTexture(gl.TEXTURE_2D, null);
      }
    } catch (e) {
      /* mipmaps are an optimisation */
    }
    this.impostorRT = rt;
    const mat = unflipNormals(
      foliageMaterial({ name: 'impostor', map: rt.texture, alphaTest: 0.5, vertexColors: false, wind: 'trunk', translucency: 0.3, roughness: 0.85, brush: 0.55 }),
      'unflip',
    );
    this.mats.impostor = mat;
    for (const rec of list) {
      const I = rec.impostorInfo;
      const geo = this._impostorGeometry(I);
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(16 * 64), 16);
      attr.setUsage(THREE.DynamicDrawUsage);
      const mesh = new THREE.InstancedMesh(geo, mat, 64);
      mesh.instanceMatrix = attr;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.name = `${rec.name}${rec.v}_impostor`;
      this.group.add(mesh);
      rec.impostor = { attr, meshes: [mesh], cap: 64, count: 0 };
    }
  }

  _impostorGeometry(I) {
    const pos = [], nrm = [], uv = [], idx = [];
    const half = I.size / 2;
    const cy = I.crownY;
    const N = 3;
    for (let q = 0; q < 2; q++) {
      const ang = q * (Math.PI / 2);
      const ax = Math.cos(ang), az = Math.sin(ang);
      const base = pos.length / 3;
      for (let j = 0; j <= N; j++) {
        for (let i = 0; i <= N; i++) {
          const fx = i / N, fy = j / N;
          const lx = (fx - 0.5) * I.size;
          const y = I.y0 + fy * I.size;
          const x = ax * lx, z = az * lx;
          pos.push(x, y, z);
          let nx = x / half, ny = (y - cy) / (half * 0.8) + 0.35, nz = z / half;
          // card facing component so the centre isn't flat
          nx += -az * 0.6;
          nz += ax * 0.6;
          const l = Math.hypot(nx, ny, nz) || 1;
          nrm.push(nx / l, ny / l, nz / l);
          uv.push(I.u0 + (I.u1 - I.u0) * fx, I.v0 + (I.v1 - I.v0) * fy);
        }
      }
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const a = base + j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
          idx.push(a, b, c, b, d, c);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  // ---------------------------------------------------------------------------------
  // scatter
  // ---------------------------------------------------------------------------------
  _blocked(x, z, r) {
    for (const c of this._clear) {
      const dx = x - c.x, dz = z - c.z;
      const rr = c.r + r;
      if (dx * dx + dz * dz < rr * rr) return c;
    }
    return null;
  }

  _water(x, z) {
    const T = this.world.terrain;
    let d = 1e9;
    if (T.creek) {
      const b = T.creek.net._nearest(x, z, 24, null);
      if (b) d = b.d - T.creek.bedHalf;
    }
    for (const p of T.ponds) d = Math.min(d, Math.hypot(x - p.x, z - p.z) - p.r * 0.75);
    return d;
  }

  _place(name, variantIdx, x, z, yaw, scale, rng, o = {}) {
    const recs = this.byName[name];
    if (!recs) return;
    const rec = recs[variantIdx % recs.length];
    const T = this.world.terrain;
    const y = (o.y ?? T.sample(x, z)) + (o.dy ?? 0);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((o.tiltX ?? 0), yaw, (o.tiltZ ?? 0), 'YXZ'));
    if (o.lean) {
      // lean toward (lx, lz) by angle: rotate about the horizontal axis perpendicular to it
      const ax = new THREE.Vector3(o.lean.z, 0, -o.lean.x).normalize();
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, o.lean.a));
    }
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale * (o.sy ?? 1), scale));
    const I = rec.inst;
    I.x.push(x);
    I.y.push(y);
    I.z.push(z);
    I.rnd.push(rng());
    for (let k = 0; k < 16; k++) I.m.push(m.elements[k]);
  }

  async _scatter(onProgress) {
    const world = this.world, T = world.terrain, road = world.road;
    const rng = makeRng(31337);
    const nz = this.noise;
    const lm = world.landmarks;
    // clearings: landmarks + elephant trail + market tracks + sacred trees
    this._clear = (world.plan?.clearings || []).map((c) => ({ ...c }));
    const strip = (key, halfW, len, stepLen = 3) => {
      const L = lm[key];
      if (!L) return;
      const sp = road.get(L.roadRef.id);
      for (const side of [-1, 1]) {
        for (let d = W.halfWidth + 1; d < len; d += stepLen) {
          const p = sp.pointAt(L.roadRef.s + Math.sin(d * 0.07) * 2, side * d);
          this._clear.push({ x: p.x, z: p.z, r: halfW, soft: true });
        }
      }
    };
    strip('elephantCrossing', 3.6, 40);
    strip('marketLamp', 2.6, 32);
    const banana = lm.bananaGrove;
    const groveP = banana ? road.get(banana.roadRef.id).pointAt(banana.roadRef.s, -12) : null;
    const nearLm = (x, z, keys, r) => keys.some((k) => lm[k] && Math.hypot(lm[k].pos.x - x, lm[k].pos.z - z) < r);
    const palmKeys = ['garage', 'noodleShop', 'humanVillageStop', 'forestTemple', 'marketLamp', 'busStop'];
    const tiles = [...T.tiles.values()];
    const corridor = W.corridor - 4;
    const tilesTotal = tiles.length;
    let lastYield = performance.now();

    // ---------------- roadside reach trees: slender forked trees arching over the road ----------
    for (const sp of road.splines.values()) {
      for (let s = 6 + rng() * 6; s < sp.length - 6; s += 7 + rng() * 9) {
        for (const side of [-1, 1]) {
          if (rng() > 0.6) continue;
          const e = 2.5 + rng() * 4.5;
          const p = sp.pointAt(s, side * (W.halfWidth + e));
          const nr = T.nearestRoad(p.x, p.z);
          if (!nr.sp || nr.e < 2.2) continue;
          if (this._blocked(p.x, p.z, 2.2) || this._water(p.x, p.z) < 2) continue;
          const tg = sp.tangents[Math.min(sp.points.length - 1, Math.max(0, Math.round(s)))];
          const tx = side * tg.z, tz = -side * tg.x; // toward the road
          const yaw = Math.atan2(-tz, tx) + (rng() - 0.5) * 0.8;
          this._place('reachTree', Math.floor(rng() * 5), p.x, p.z, yaw, 0.78 + rng() * 0.4, rng, { dy: -0.05, lean: { x: tx, z: tz, a: 0.03 + rng() * 0.1 } });
          this.colliders.push({ x: p.x, z: p.z, r: 0.4 });
        }
      }
    }

    for (let ti = 0; ti < tilesTotal; ti++) {
      const tile = tiles[ti];
      const tx0 = tile.x, tz0 = tile.z, TS = W.terrainTile;
      // ---------------- big trees: 8.5 m grid -----------------------------------------
      for (let gz = tz0 + 4.25; gz < tz0 + TS; gz += 8.5) {
        for (let gx = tx0 + 4.25; gx < tx0 + TS; gx += 8.5) {
          const x = gx + (rng() - 0.5) * 5, z = gz + (rng() - 0.5) * 5;
          if (T._coarseDist(x, z) > corridor) continue;
          const nr = T.nearestRoad(x, z);
          if (!nr.sp || nr.e < 4.6 || nr.e > corridor - W.halfWidth) continue;
          const zone = nz.noise2D(x / 90, z / 90) * 0.5 + 0.5;
          if (rng() > 0.45 + 0.5 * zone) continue;
          if (this._blocked(x, z, 4) || this._water(x, z) < 3) continue;
          const near = nr.e < 14;
          const w = {
            reachTree: near ? 1.1 : 0.55,
            rainTree: near ? 1.6 : nr.e < 32 ? 0.9 : 0.35,
            dipterocarp: 1.1,
            banyan: 0.22,
            deadTree: 0.07,
            understory: 0.35,
          };
          const name = pickW(rng, w);
          const v = Math.floor(rng() * 8);
          const sc = name === 'understory' ? 1.3 + rng() * 0.4 : name === 'reachTree' ? 0.9 + rng() * 0.45 : 0.85 + rng() * 0.32;
          // trees at the road edge lean into the light gap over the asphalt
          let lean = null;
          if (nr.exact && nr.e < 16) {
            const tg = nr.sp.tangents[nr.i];
            const a = (name === 'dipterocarp' ? 0.05 : 0.1) + rng() * (name === 'dipterocarp' ? 0.07 : 0.16);
            lean = { x: -nr.side * -tg.z, z: -nr.side * tg.x, a: a * (1 - nr.e / 18) };
          }
          this._place(name, v, x, z, rng() * Math.PI * 2, sc, rng, { dy: -0.05, lean });
          if (nr.e < 16) this.colliders.push({ x, z, r: name === 'dipterocarp' ? 1.2 : name === 'banyan' ? 1.6 : 0.9 });
        }
      }
      // ---------------- mid layer: 4.2 m grid -----------------------------------------
      for (let gz = tz0 + 2.1; gz < tz0 + TS; gz += 4.2) {
        for (let gx = tx0 + 2.1; gx < tx0 + TS; gx += 4.2) {
          const x = gx + (rng() - 0.5) * 3, z = gz + (rng() - 0.5) * 3;
          if (T._coarseDist(x, z) > 60) continue;
          const nr = T.nearestRoad(x, z);
          if (!nr.sp || nr.e < 1.7 || nr.e > 56) continue;
          const wat = this._water(x, z);
          if (wat < 0.6) continue;
          const blk = this._blocked(x, z, 1.2);
          if (blk && !blk.soft) continue;
          const zb = nz.noise2D(x / 70 + 40, z / 70);
          const zbn = nz.noise2D(x / 55 - 20, z / 55 + 7);
          const inGrove = groveP && Math.hypot(x - groveP.x, z - groveP.z) < 46;
          const r = rng();
          if (blk) {
            if (r < 0.08) this._place('rock', Math.floor(rng() * 3), x, z, rng() * 6.28, 0.4 + rng() * 0.5, rng, { dy: -0.15 });
            continue;
          }
          if (inGrove && r < 0.78 && nr.e > 1.5) {
            // clumps of 1-4 stems (mother plant + suckers), all leaning a little apart
            const nc = 1 + Math.floor(rng() * 3.5);
            for (let c = 0; c < nc; c++) {
              const a = rng() * 6.28, d = c ? 0.5 + rng() * 0.9 : 0;
              this._place('banana', Math.floor(rng() * 4), x + Math.cos(a) * d, z + Math.sin(a) * d, rng() * 6.28, (c ? 0.55 + rng() * 0.35 : 0.95 + rng() * 0.45), rng, { lean: { x: Math.cos(a), z: Math.sin(a), a: c ? 0.08 + rng() * 0.12 : 0.03 } });
            }
            continue;
          }
          if (zb > 0.35 && r < 0.42 && nr.e > 2.6) {
            this._place('bamboo', Math.floor(rng() * 3), x, z, rng() * 6.28, 0.85 + rng() * 0.35, rng, { dy: -0.1 });
            continue;
          }
          if (zbn > 0.5 && r < 0.35 && nr.e > 1.8) {
            this._place('banana', Math.floor(rng() * 4), x, z, rng() * 6.28, 0.8 + rng() * 0.4, rng);
            if (rng() < 0.5) this._place('banana', Math.floor(rng() * 4), x + 0.7, z - 0.4, rng() * 6.28, 0.55 + rng() * 0.3, rng, { lean: { x: 1, z: -0.5, a: 0.12 } });
            continue;
          }
          if ((wat < 14 || zb < -0.55) && r < 0.2) {
            this._place('treeFern', Math.floor(rng() * 2), x, z, rng() * 6.28, 0.85 + rng() * 0.35, rng);
            continue;
          }
          if (r < (nearLm(x, z, palmKeys, 26) ? 0.12 : 0.008) && nr.e > 2.2) {
            this._place('palm', Math.floor(rng() * 2), x, z, rng() * 6.28, 0.85 + rng() * 0.3, rng);
            continue;
          }
          if (r < 0.06 + (nr.e < 9 ? 0.04 : 0)) {
            this._place('rock', Math.floor(rng() * 3), x, z, rng() * 6.28, 0.4 + rng() * 0.9, rng, { dy: -0.2 });
            continue;
          }
          if (r < 0.085 && nr.e > 4) {
            this._place('log', Math.floor(rng() * 2), x, z, rng() * 6.28, 0.8 + rng() * 0.4, rng, { dy: -0.1 });
            continue;
          }
          if (r < 0.5 && nr.e > 2.8) {
            let lean = null;
            if (nr.exact && nr.e < 9) {
              const tg = nr.sp.tangents[nr.i];
              lean = { x: nr.side * tg.z, z: -nr.side * tg.x, a: 0.12 + rng() * 0.2 };
            }
            this._place('understory', Math.floor(rng() * 4), x, z, rng() * 6.28, 0.75 + rng() * 0.5, rng, { lean });
            continue;
          }
        }
      }
      // ---------------- ground cover: 1.25 m grid ------------------------------------
      for (let gz = tz0 + 0.625; gz < tz0 + TS; gz += 1.25) {
        for (let gx = tx0 + 0.625; gx < tx0 + TS; gx += 1.25) {
          const x = gx + (rng() - 0.5) * 1.0, z = gz + (rng() - 0.5) * 1.0;
          if (T._coarseDist(x, z) > 34) continue;
          const nr = T.nearestRoad(x, z);
          if (!nr.sp || nr.e < 0.3) continue;
          const e = nr.e;
          if (e > 28) continue;
          const wat = this._water(x, z);
          if (wat < -0.5) continue;
          const blk = this._blocked(x, z, 0.3);
          const r = rng();
          const dens = 0.75 + 0.5 * (nz.noise2D(x / 18, z / 18) * 0.5 + 0.5);
          let pg, pf, ps, pe;
          if (e < 1.3) {
            pg = 0.16; pf = 0.02; ps = 0; pe = 0;
          } else if (e < 7.5) {
            pg = 0.3; pf = 0.24; ps = 0.1; pe = 0.035;
          } else if (e < 18) {
            pg = 0.1; pf = 0.26; ps = 0.08; pe = 0.02;
          } else {
            pg = 0.03; pf = 0.12; ps = 0.05; pe = 0;
          }
          if (wat < 6) {
            pe += 0.2;
            pf += 0.1;
          }
          if (blk) {
            if (!blk.soft) continue;
            pf *= 0.3;
            ps = 0;
            pe *= 0.3;
            pg *= 1.2;
          }
          const k = r / dens;
          const yaw = rng() * 6.28;
          if (k < pg) this._place('grass', Math.floor(rng() * 3), x, z, yaw, 0.8 + rng() * 0.5, rng, { tiltX: (rng() - 0.5) * 0.2 });
          else if (k < pg + pf) this._place('fern', Math.floor(rng() * 3), x, z, yaw, 0.7 + rng() * 0.6, rng);
          else if (k < pg + pf + ps) this._place('shrub', Math.floor(rng() * 3), x, z, yaw, 0.8 + rng() * 0.5, rng);
          else if (k < pg + pf + ps + pe) this._place('elephantEar', Math.floor(rng() * 2), x, z, yaw, 0.8 + rng() * 0.5, rng);
        }
        if (performance.now() - lastYield > 40) {
          await new Promise((res) => setTimeout(res, 0));
          lastYield = performance.now();
        }
      }
      onProgress?.((ti + 1) / tilesTotal);
    }

    // ---------------- vine curtains over the road edges (under overhanging crowns) ----------
    for (const sp of road.splines.values()) {
      for (let s = 6; s < sp.length - 6; s += 5 + rng() * 9) {
        if (rng() < 0.35) continue;
        const side = rng() < 0.5 ? -1 : 1;
        const lat = side * (W.halfWidth + 0.6 + rng() * 2.2);
        const p = sp.pointAt(s, lat);
        if (this._blocked(p.x, p.z, 1.5)) continue;
        const top = sp.heightAt(s) + 6.5 + rng() * 4;
        // over asphalt keep the lowest strand > 3.4 m above the road
        const len = 4 + 4; // approximate curtain extent (built 4..8 m)
        const maxDrop = top - (sp.heightAt(s) + (Math.abs(lat) < W.halfWidth + 0.5 ? 3.4 : 1.2));
        const sc = Math.min(1, maxDrop / len);
        if (sc < 0.35) continue;
        this._place('vine', Math.floor(rng() * 3), p.x, p.z, rng() * 6.28, sc, rng, { y: top });
      }
    }
  }

  _finalizeInstances() {
    let total = 0;
    for (const rec of this.variants) {
      const I = rec.inst;
      const n = I.x.length;
      rec.n = n;
      rec.x = Float32Array.from(I.x);
      rec.y = Float32Array.from(I.y);
      rec.z = Float32Array.from(I.z);
      rec.rnd = Float32Array.from(I.rnd);
      rec.m = Float32Array.from(I.m);
      rec.inst = null;
      total += n;
      for (let i = 0; i < n; i++) {
        const k = cellKey(Math.floor(rec.x[i] / CELL), Math.floor(rec.z[i] / CELL));
        let c = this.cells.get(k);
        if (!c) this.cells.set(k, (c = { v: [], i: [] }));
        c.v.push(rec.index);
        c.i.push(i);
      }
    }
    for (const c of this.cells.values()) {
      c.v = Int32Array.from(c.v);
      c.i = Int32Array.from(c.i);
    }
    this.totalInstances = total;
  }

  // ---------------------------------------------------------------------------------
  // per-frame selection
  // ---------------------------------------------------------------------------------
  _ensure(slot, n) {
    if (n <= slot.cap) return;
    let cap = slot.cap;
    while (cap < n) cap *= 2;
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(16 * cap), 16);
    attr.setUsage(THREE.DynamicDrawUsage);
    attr.array.set(slot.attr.array);
    for (const m of slot.meshes) m.instanceMatrix = attr;
    slot.attr = attr;
    slot.cap = cap;
  }

  update(dt, focus) {
    if (!this.variants.length || !this.cells.size) return;
    this._timer += dt;
    const moved = Math.hypot(focus.x - this._last.x, focus.z - this._last.z);
    if (moved < W.forestUpdateMove && this._timer < W.forestUpdateTurn && !this._dirty) return;
    this._timer = 0;
    this._dirty = false;
    this._last.copy(focus);
    this._select(focus);
  }

  _select(focus) {
    const dd = this.world.drawDistance ?? 150;
    const scaleD = dd / 150;
    const dens = this.density / this.maxDensity;
    // reset counts
    for (const rec of this.variants) {
      for (const l of rec.lods) l.count = 0;
      if (rec.impostor) rec.impostor.count = 0;
      const k = rec.rule.keepMin;
      rec._keep = k + (1 - k) * Math.min(1, dens);
      rec._l0 = rec.rule.lod0 * scaleD;
      rec._l1 = rec.rule.lod1 * scaleD;
      rec._cull = Math.min(dd, (rec.rule.cull ?? dd) * (rec.rule.cull ? Math.max(0.75, scaleD) : 1));
    }
    const fx = focus.x, fz = focus.z;
    const R = dd + CELL;
    const c0x = Math.floor((fx - R) / CELL), c1x = Math.floor((fx + R) / CELL);
    const c0z = Math.floor((fz - R) / CELL), c1z = Math.floor((fz + R) / CELL);
    const vars = this.variants;
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const cell = this.cells.get(cellKey(cx, cz));
        if (!cell) continue;
        const ccx = (cx + 0.5) * CELL - fx, ccz = (cz + 0.5) * CELL - fz;
        if (Math.hypot(ccx, ccz) > R) continue;
        const cv = cell.v, ci = cell.i;
        for (let k = 0; k < cv.length; k++) {
          const rec = vars[cv[k]];
          const i = ci[k];
          if (rec.rnd[i] > rec._keep) continue;
          const dx = rec.x[i] - fx, dz = rec.z[i] - fz;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > rec._cull) continue;
          let slot;
          let fade = 1;
          if (d < rec._l0 || (rec.lodCount === 1 && !rec.impostor)) slot = rec.lods[0];
          else if (d < rec._l1 && rec.lodCount > 1) slot = rec.lods[1];
          else if (rec.impostor && d >= rec._l1) slot = rec.impostor;
          else slot = rec.lods[rec.lodCount - 1];
          if (rec.rule.cull) fade = smoothstep(rec._cull, rec._cull - 7, d);
          if (fade <= 0.02) continue;
          const n = slot.count;
          if (n >= slot.cap) this._ensure(slot, n + 1);
          const dst = slot.attr.array, src = rec.m;
          const o = n * 16, s0 = i * 16;
          if (fade < 1) {
            for (let j = 0; j < 12; j++) dst[o + j] = src[s0 + j] * fade;
            dst[o + 12] = src[s0 + 12];
            dst[o + 13] = src[s0 + 13];
            dst[o + 14] = src[s0 + 14];
            dst[o + 15] = 1;
          } else {
            for (let j = 0; j < 16; j++) dst[o + j] = src[s0 + j];
          }
          slot.count = n + 1;
        }
      }
    }
    let calls = 0, inst = 0;
    const commit = (slot) => {
      if (!slot) return;
      for (const m of slot.meshes) {
        m.count = slot.count;
        m.visible = slot.count > 0;
        if (m.visible) calls++;
      }
      if (slot.count > 0) {
        slot.attr.clearUpdateRanges?.();
        slot.attr.addUpdateRange?.(0, slot.count * 16);
        slot.attr.needsUpdate = true;
      }
      inst += slot.count;
    };
    for (const rec of vars) {
      for (const l of rec.lods) commit(l);
      commit(rec.impostor);
    }
    calls += this._selectFlats(fx, fz, dd + 40);
    this._stats = { calls, instances: inst, total: this.totalInstances };
  }

  // ---------------------------------------------------------------------------------
  // background stage flats: painted tree-line silhouettes deep in the fog (2 layers)
  // ---------------------------------------------------------------------------------
  _buildFlats() {
    const world = this.world, T = world.terrain, road = world.road;
    if (!T || !road) return;
    const tex = silhouetteTexture();
    const mat = crispAlpha(
      unflipNormals(foliageMaterial({ name: 'flats', map: tex, alphaTest: 0.5, color: 0x56604a, vertexColors: false, wind: 'trunk', windHeightScale: 0.35, translucency: 0.15, roughness: 1, brush: 0.4 }), 'unflip'),
      'crisp',
    );
    this.mats.flats = mat;
    const mk = (row) => {
      const g = new THREE.PlaneGeometry(1, 1, 4, 2).translate(0, 0.5, 0);
      const uv = g.attributes.uv, nrm = g.attributes.normal, pos = g.attributes.position;
      for (let i = 0; i < uv.count; i++) {
        uv.setY(i, row * 0.5 + uv.getY(i) * 0.5);
        const x = pos.getX(i);
        const n = new THREE.Vector3(x * 0.6, 0.45, 1).normalize();
        nrm.setXYZ(i, n.x, n.y, n.z);
      }
      return g;
    };
    const rng = makeRng(777);
    const recs = [];
    for (let row = 0; row < 2; row++) {
      const geo = mk(row);
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(16 * 64), 16);
      attr.setUsage(THREE.DynamicDrawUsage);
      const mesh = new THREE.InstancedMesh(geo, mat, 64);
      mesh.instanceMatrix = attr;
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      mesh.name = 'silhouetteFlats' + row;
      this.group.add(mesh);
      recs.push({ slot: { attr, meshes: [mesh], cap: 64, count: 0 }, m: [], x: [], z: [] });
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const sp of road.splines.values()) {
      for (let s = 10; s < sp.length - 10; s += 16 + rng() * 10) {
        for (const side of [-1, 1]) {
          for (const layer of [0, 1]) {
            const e = layer ? 52 + rng() * 22 : 30 + rng() * 12;
            const p = sp.pointAt(s, side * (W.halfWidth + e));
            if (T._coarseDist(p.x, p.z) > W.corridor - 2) continue;
            const nr = T.nearestRoad(p.x, p.z);
            if (!nr.sp || nr.e < 26) continue;
            const tg = sp.tangents[Math.min(sp.points.length - 1, Math.round(s))];
            const tx = side * tg.z, tz = -side * tg.x; // toward the road
            const yaw = Math.atan2(tx, tz) + (rng() - 0.5) * 0.4;
            q.setFromAxisAngle(up, yaw);
            const w = 26 + rng() * 12, h = (layer ? 24 : 19) + rng() * 8;
            m.compose(new THREE.Vector3(p.x, T.sample(p.x, p.z) - 1.2, p.z), q, new THREE.Vector3(w, h, 1));
            const rec = recs[(layer + (rng() < 0.5 ? 1 : 0)) % 2];
            for (let k = 0; k < 16; k++) rec.m.push(m.elements[k]);
            rec.x.push(p.x);
            rec.z.push(p.z);
          }
        }
      }
    }
    this.flats = recs.map((r) => ({ slot: r.slot, m: Float32Array.from(r.m), x: Float32Array.from(r.x), z: Float32Array.from(r.z) }));
  }

  _selectFlats(fx, fz, R) {
    if (!this.flats) return 0;
    let calls = 0;
    for (const f of this.flats) {
      const slot = f.slot;
      slot.count = 0;
      for (let i = 0; i < f.x.length; i++) {
        const dx = f.x[i] - fx, dz = f.z[i] - fz;
        if (dx * dx + dz * dz > R * R) continue;
        if (slot.count >= slot.cap) this._ensure(slot, slot.count + 1);
        slot.attr.array.set(f.m.subarray(i * 16, i * 16 + 16), slot.count * 16);
        slot.count++;
      }
      const mesh = slot.meshes[0];
      mesh.count = slot.count;
      mesh.visible = slot.count > 0;
      if (slot.count) {
        slot.attr.needsUpdate = true;
        calls++;
      }
    }
    return calls;
  }

  setDensity(f) {
    this.density = f;
    this._dirty = true;
  }

  stats() {
    return this._stats;
  }

  /** A single (non-instanced) plant as regular meshes with the forest materials (sacred trees, set dressing). */
  makeSingle(name, variant, seed, opts = {}) {
    const built = buildVariant(name, variant, seed, opts);
    const g = new THREE.Group();
    for (const [part, geo] of Object.entries(built.lods[0])) {
      if (!geo) continue;
      const mat = part === 'leaves' ? this._leafMatFor(name) : this.mats[part] || this.mats.bark;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    g.userData.built = built;
    return g;
  }

  dispose() {
    this.group.traverse((o) => o.geometry?.dispose?.());
    this.impostorRT?.dispose();
  }
}

function pickW(rng, weights) {
  let sum = 0;
  for (const k in weights) sum += weights[k];
  let r = rng() * sum;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}
