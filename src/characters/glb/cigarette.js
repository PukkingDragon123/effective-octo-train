// A real, burning cigarette for any humanoid's hand (Ah Kong's ever-present one):
//   * modelled at 8.4 cm: speckled cork filter (2.4 cm) with a gold band, white paper tube; rounded,
//     lathed profiles; the paper shortens as it burns (a fresh one is lit when it reaches the filter)
//   * the ember: a glowing coal under a charred rim that smoulders and flares on every drag
//   * grey ash that lengthens with the burn and drops off (falls, tumbles, fades)
//   * smoke: a thin ribbon rising from the ember with a slow curl, and the exhaled puff from the mouth;
//     both are lit by the scene (never glowing in the dark) and fogged like every painted material.
// Local frame: +Y from the filter (mouth end) to the burning end; the origin is where the fingers hold it.
import * as THREE from 'three';
import { engine } from '../../core/Engine.js';
import { paintedMaterial } from '../../render/index.js';

const LEN = 0.084, FILTER = 0.024, R = 0.0039, Y0 = -0.021; // mouth end at Y0
const PAPER_FULL = LEN - FILTER, PAPER_MIN = 0.012;
const SEG = 20;

const hash = (x) => { const s = Math.sin(x * 127.1) * 43758.5453; return s - Math.floor(s); };

function latheColored(points, seg, colorFn) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const p = g.attributes.position, n = p.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    c.set(colorFn(y, Math.atan2(x, z)));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  // filter: rounded mouth end, cork paper with speckles, then the gold band at the paper joint
  const filter = latheColored([[0, Y0], [R * 0.72, Y0 + 0.0003], [R * 0.95, Y0 + 0.0014], [R, Y0 + 0.003], [R, Y0 + FILTER]], SEG, (y, a) => {
    const t = y - Y0;
    if (t > FILTER - 0.0032) return t > FILTER - 0.0024 && t < FILTER - 0.0016 ? 0xc9a24a : 0xe9e2cf; // gold line on the band
    const sp = hash(Math.floor(t * 2600) * 13.1 + Math.floor(a * 9)) > 0.72;
    return sp ? 0xa8683a : t < 0.0012 ? 0xd9b58a : 0xc98f55;
  });
  // paper: unit-height tube (scaled to the remaining length), faint seam and print
  const paper = latheColored([[R, 0], [R, 1]], SEG, (y, a) => (Math.abs(a - 2.6) < 0.08 ? 0xe2ded4 : 0xf2efe7));
  // ember: a low dome of glowing coal
  const ember = new THREE.LatheGeometry([[R * 0.99, 0], [R * 0.95, 0.0012], [R * 0.7, 0.0024], [0, 0.003]].map(([r, y]) => new THREE.Vector2(r, y)), SEG);
  // charred rim where the paper burns (dark ring just under the coal)
  const char = latheColored([[R * 1.005, -0.0016], [R * 1.005, 0.0004]], SEG, () => 0x2a2420);
  // ash: unit-length, slightly bulging, crumbly cone (scaled by its length)
  const ash = latheColored([[R * 0.97, 0], [R * 1.04, 0.25], [R * 1.0, 0.6], [R * 0.82, 0.88], [R * 0.4, 0.99], [0, 1]], SEG, (y, a) => {
    const n = hash(Math.floor(y * 40) * 7.3 + Math.floor(a * 6));
    return n > 0.82 ? 0x5e5a56 : n > 0.5 ? 0x9a958e : 0xb8b3ab;
  });
  const pa = ash.attributes.position;
  for (let i = 0; i < pa.count; i++) { // crumbly: radial jitter
    const k = 1 + (hash(i * 3.7) - 0.5) * 0.12;
    pa.setX(i, pa.getX(i) * k); pa.setZ(i, pa.getZ(i) * k);
  }
  ash.computeVertexNormals();
  const body = paintedMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.82, brush: 0.12, wet: 0, puddles: 0, name: 'cig-paper' });
  const ashMat = paintedMaterial({ vertexColors: true, color: 0xffffff, roughness: 1, brush: 0.1, wet: 0, puddles: 0, name: 'cig-ash' });
  // smoke strand texture: soft across the ribbon, faint streaks along it
  const S = 64, data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / (S - 1) * 2 - 1;
    const streak = 0.75 + 0.25 * Math.sin(u * 9 + Math.sin(y * 0.4) * 1.5);
    const a = Math.max(0, 1 - u * u) ** 1.5 * streak;
    const o = (y * S + x) * 4;
    data[o] = data[o + 1] = data[o + 2] = 255;
    data[o + 3] = Math.round(a * 255);
  }
  const smokeTex = new THREE.DataTexture(data, S, S);
  smokeTex.wrapT = THREE.RepeatWrapping;
  smokeTex.magFilter = THREE.LinearFilter;
  smokeTex.minFilter = THREE.LinearMipmapLinearFilter;
  smokeTex.generateMipmaps = true;
  smokeTex.needsUpdate = true;
  SHARED = { filter, paper, ember, char, ash, body, ashMat, smokeTex };
  return SHARED;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

/** A camera-facing ribbon of smoke in WORLD space (points emitted at an emitter, rising, curling, fading). */
class SmokeRibbon {
  constructor(parent, opts) {
    this.o = { max: 48, rate: 22, life: 2.6, rise: 0.055, w0: 0.0016, w1: 0.04, alpha: 0.28, curl: 0.045, ...opts };
    const n = this.o.max;
    this.pts = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    this.nor = new Float32Array(n * 2 * 3);
    this.col = new Float32Array(n * 2 * 4);
    this.uv = new Float32Array(n * 2 * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    const mat = paintedMaterial({ vertexColors: true, color: 0xc9ccd0, map: shared().smokeTex, transparent: true, roughness: 1, brush: 0, wet: 0, puddles: 0, side: THREE.DoubleSide, name: 'cig-smoke' });
    mat.depthWrite = false;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.name = 'cig-smoke';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    // points are world-space: the mesh keeps an identity world matrix wherever it hangs
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrixWorld = function () { this.matrixWorld.identity(); };
    this.mesh.updateWorldMatrix = function () { this.matrixWorld.identity(); };
    parent.add(this.mesh);
    this.acc = 0;
    this.t = Math.random() * 10;
  }
  /** emitter: world position (or null to stop emitting), velocity (world, optional), strength 0..1 */
  update(dt, emit, vel = null, strength = 1) {
    const o = this.o;
    this.t += dt;
    if (emit && strength > 0.01) {
      this.acc += dt * o.rate;
      while (this.acc >= 1) {
        this.acc -= 1;
        if (this.pts.length >= o.max) this.pts.shift();
        this.pts.push({ p: emit.clone(), v: vel ? vel.clone() : new THREE.Vector3(), age: 0, s: strength, ph: Math.random() * 6.28 });
      }
    }
    for (const q of this.pts) {
      q.age += dt;
      // buoyant rise, a slow sideways curl and a little drag on the initial velocity
      q.v.multiplyScalar(Math.exp(-1.6 * dt));
      q.v.y += o.rise * dt * 1.6;
      const cx = Math.sin(this.t * 1.3 + q.ph + q.age * 2.2) * o.curl, cz = Math.cos(this.t * 0.9 + q.ph * 1.7 + q.age * 1.7) * o.curl;
      q.p.x += (q.v.x + cx * q.age) * dt;
      q.p.y += (q.v.y + o.rise) * dt;
      q.p.z += (q.v.z + cz * q.age) * dt;
    }
    while (this.pts.length && this.pts[0].age > o.life) this.pts.shift();
    this._build();
  }
  _build() {
    const P = this.pts, n = P.length;
    const g = this.mesh.geometry;
    if (n < 2) { g.setDrawRange(0, 0); return; }
    const cam = engine.camera.getWorldPosition(_d);
    for (let i = 0; i < n; i++) {
      const q = P[i];
      const prev = P[Math.max(0, i - 1)].p, next = P[Math.min(n - 1, i + 1)].p;
      _a.subVectors(next, prev); // tangent
      if (_a.lengthSq() < 1e-12) _a.set(0, 1, 0);
      _b.subVectors(cam, q.p).normalize(); // to camera
      _c.crossVectors(_a, _b).normalize(); // side
      const k = Math.min(1, q.age / this.o.life);
      const w = (this.o.w0 + (this.o.w1 - this.o.w0) * Math.sqrt(k)) * 0.5;
      const alpha = this.o.alpha * q.s * Math.min(1, q.age / 0.12) * (1 - k) ** 1.6;
      for (let s = 0; s < 2; s++) {
        const j = i * 2 + s, sg = s ? 1 : -1;
        this.pos[j * 3] = q.p.x + _c.x * w * sg;
        this.pos[j * 3 + 1] = q.p.y + _c.y * w * sg;
        this.pos[j * 3 + 2] = q.p.z + _c.z * w * sg;
        this.nor[j * 3] = _b.x; this.nor[j * 3 + 1] = _b.y; this.nor[j * 3 + 2] = _b.z;
        this.col[j * 4] = this.col[j * 4 + 1] = this.col[j * 4 + 2] = 1;
        this.col[j * 4 + 3] = alpha;
        this.uv[j * 2] = s;
        this.uv[j * 2 + 1] = q.age * 0.35 + q.ph * 0.1;
      }
    }
    for (const k of ['position', 'normal', 'color', 'uv']) g.attributes[k].needsUpdate = true;
    g.setDrawRange(0, (n - 1) * 6);
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export class Cigarette {
  /** owner: the HumanoidGLB (smoke lives under its root, world-space) */
  constructor(owner) {
    const S = shared();
    this.owner = owner;
    this.root = new THREE.Group();
    this.root.name = 'cigarette';
    this.filter = new THREE.Mesh(S.filter, S.body);
    this.paper = new THREE.Mesh(S.paper, S.body);
    this.paper.position.y = Y0 + FILTER;
    this.tip = new THREE.Group();
    this.emberMat = paintedMaterial({ color: 0x3a1408, emissive: 0xff5a14, emissiveIntensity: 1.2, roughness: 0.9, brush: 0, wet: 0, puddles: 0, atmoRim: 0, name: 'cig-ember' });
    this.ember = new THREE.Mesh(S.ember, this.emberMat);
    this.char = new THREE.Mesh(S.char, S.body);
    this.ash = new THREE.Mesh(S.ash, S.ashMat);
    this.ash.position.y = 0.0014;
    this.tip.add(this.ember, this.char, this.ash);
    this.root.add(this.filter, this.paper, this.tip);
    for (const m of [this.filter, this.paper, this.ember, this.char, this.ash]) m.castShadow = false;
    this.burn = 0.05 + Math.random() * 0.4; // 0 fresh .. 1 at the filter
    this.ashLen = 0.002 + Math.random() * 0.004;
    this.ashMax = 0.006 + Math.random() * 0.004;
    this.drag = 0;
    this.falling = [];
    this.smoke = new SmokeRibbon(owner.root, {});
    this.puff = new SmokeRibbon(owner.root, { max: 40, rate: 34, life: 2.4, rise: 0.05, w0: 0.012, w1: 0.11, alpha: 0.22, curl: 0.05 });
    this._layout();
  }
  _layout() {
    const len = PAPER_MIN + (PAPER_FULL - PAPER_MIN) * (1 - this.burn);
    this.paper.scale.y = len;
    this.tip.position.y = Y0 + FILTER + len;
    this.ash.scale.set(1, Math.max(0.0005, this.ashLen) / 1, 1);
  }
  /** world position of the burning tip / the mouth end */
  tipWorld(out) { return this.tip.getWorldPosition(out); }
  filterWorld(out) { return this.filter.localToWorld(out.set(0, Y0, 0)); }

  /**
   * dt; drag 0..1 (inhaling: the ember flares, the burn speeds up); exhale 0..1 with the mouth point /
   * forward direction (world) for the puff.
   */
  update(dt, drag = 0, exhale = 0, mouth = null, fwd = null) {
    if (dt <= 0) return;
    this.drag += (drag - this.drag) * (1 - Math.exp(-10 * dt));
    // burn: ~6 minutes per cigarette, 6x faster on a drag; the ash grows with what burnt
    const db = dt * (1 / 360) * (1 + this.drag * 6);
    this.burn += db;
    this.ashLen += db * (PAPER_FULL - PAPER_MIN) * 0.85;
    if (this.burn >= 1) { this.burn = 0; this.ashLen = 0; } // a fresh one is lit
    if (this.ashLen > this.ashMax) this._dropAsh();
    this._layout();
    // ember: smoulder flicker, bright on the drag
    const t = engine.time || performance.now() / 1000;
    const flick = 0.85 + 0.1 * Math.sin(t * 7.1) + 0.06 * Math.sin(t * 17.3 + 1.2);
    this.emberMat.emissiveIntensity = (0.55 + 2.6 * this.drag) * flick;
    // smoke from the ember (thin while dragging: it goes into the lungs)
    this.tipWorld(_a);
    this.smoke.update(dt, _a.clone().add(_b.set(0, 0.006, 0)), null, 1 - this.drag * 0.7);
    // exhaled puff
    let v = null;
    if (exhale > 0.05 && mouth) v = (fwd ? _c.copy(fwd) : _c.set(0, 0, 0)).multiplyScalar(0.28).add(_d.set(0, -0.02, 0));
    this.puff.update(dt, exhale > 0.05 && mouth ? mouth : null, v, Math.min(1, exhale * 1.4));
    // falling ash
    for (const f of this.falling) {
      f.t += dt;
      f.v.y -= 9.8 * dt * 0.6;
      f.m.position.addScaledVector(f.v, dt);
      f.m.rotation.x += f.spin * dt;
      f.m.rotation.z += f.spin * 0.6 * dt;
      f.m.scale.multiplyScalar(f.t > 0.8 ? 0.94 : 1);
    }
    this.falling = this.falling.filter((f) => {
      if (f.t < 1.4) return true;
      f.m.removeFromParent();
      return false;
    });
  }
  _dropAsh() {
    // the ash column breaks off at the coal, keeps its world pose and falls
    const S = shared();
    const m = new THREE.Mesh(S.ash, S.ashMat);
    this.ash.updateWorldMatrix(true, false);
    const parent = this.owner.root.parent || this.owner.root;
    parent.updateWorldMatrix(true, false);
    m.matrix.copy(parent.matrixWorld).invert().multiply(this.ash.matrixWorld);
    m.matrix.decompose(m.position, m.quaternion, m.scale);
    parent.add(m);
    if (this.owner._layer !== undefined) m.layers.set(this.owner._layer);
    this.falling.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05), t: 0, spin: (Math.random() - 0.5) * 8 });
    this.ashLen = 0.0006;
    this.ashMax = 0.006 + Math.random() * 0.004;
  }
  dispose() {
    this.root.removeFromParent();
    this.smoke.dispose();
    this.puff.dispose();
    for (const f of this.falling) f.m.removeFromParent();
    this.falling = [];
    this.emberMat.dispose();
  }
}
