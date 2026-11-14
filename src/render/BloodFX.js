// 3D blood with gravity (render module). All blood imagery comes from the CC0 photo decals
// (BloodDecals.js); the motion is physics (GPU droplets with gravity, growing pools, runs
// that creep down a surface).
//
//   bloodFX.spray(pos, dir, amount 0..1 | {amount=1, speed})   droplets thrown along dir fall, splash on
//       whatever they hit (spatter + a run on walls / glass / faces) and pool on the ground
//   bloodFX.drip(surface, amount 0..1 | {duration=6, rate, object, length})
//       surface = Vector3 (drips fall from that point, e.g. under the roof, and pool below)
//       or {point, normal, object}: a run creeps down that surface (parented to `object`, so
//       it follows a lunging ghost's face), dripping off its end
//   bloodFX.clear()
// Encounters: expose it as g.blood (installRendering returns it as `bloodFX`).
import * as THREE from 'three';
import { particles } from './Particles.js';
import { bloodDecalTexture, bloodDecalImage } from './BloodDecals.js';
import { paintedMaterial } from './Materials.js';
import { goreReduced } from './Blood.js';

const _ray = new THREE.Raycaster();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const DOWN = new THREE.Vector3(0, -1, 0);
const MAX_POOLS = 24;
// liquid look over the photo decal: alpha = thickness; thin = translucent red, thick = near-black
// crimson, a darker meniscus rim, photo detail at a third; dries to a matte brown (uBloodDry)
const LIQUID_MAP = /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  dlbBTh = sampledDiffuseColor.a;
  float bThick = smoothstep(0.2, 0.85, dlbBTh);
  vec3 bc = mix(vec3(0.42, 0.02, 0.03), vec3(0.035, 0.0, 0.004), bThick);
  bc *= mix(vec3(1.0), clamp(sampledDiffuseColor.rgb * 2.6, 0.0, 1.5), 0.33);
  float bRim = smoothstep(0.04, 0.2, dlbBTh) * (1.0 - smoothstep(0.2, 0.45, dlbBTh));
  bc *= 1.0 - 0.5 * bRim;
  bc = mix(bc, vec3(0.06, 0.025, 0.015), uBloodDry * 0.85);
  diffuseColor.rgb *= bc;
  diffuseColor.a *= smoothstep(0.02, 0.25, dlbBTh) * mix(0.6, 1.0, bThick);
#endif
`;

function decalMesh(kind, variant, w, h, topAnchored) {
  // own texture (own uv transform for the reveal) over the already-loaded photo
  const img = bloodDecalImage(kind, variant);
  const tex = img ? new THREE.Texture(img) : bloodDecalTexture(kind, variant).clone();
  tex.colorSpace = THREE.SRGBColorSpace;
  if (img) tex.needsUpdate = true;
  const geo = new THREE.PlaneGeometry(w, h);
  if (topAnchored) geo.translate(0, -h / 2, 0);
  const uDry = { value: 0 };
  const mat = paintedMaterial({
    map: tex, color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, alphaTest: 0.02, depthWrite: false,
    brush: 0, puddles: 0, envReflect: 0.9, name: 'blood_' + kind,
    _key: 'bloodLiquid',
    _patch: (shader) => {
      shader.uniforms.uBloodDry = uDry;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uBloodDry;\nfloat dlbBTh = 0.0;')
        .replace('#include <map_fragment>', LIQUID_MAP)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.05, 0.75, uBloodDry) + (1.0 - smoothstep(0.1, 0.5, dlbBTh)) * 0.08;');
    },
  });
  mat.userData.dry = uDry;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -3;
  mat.polygonOffsetUnits = -3;
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false;
  m.receiveShadow = true;
  m.renderOrder = 3;
  m.userData.tex = tex;
  return m;
}

class BloodFX {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'bloodFX';
    this.scene = null;
    this.items = [];
    this.pools = [];
  }

  attach(scene) {
    this.scene = scene;
    scene.add(this.group);
  }

  _hit(origin, dir, far) {
    if (!this.scene) return null;
    _ray.set(origin, dir);
    _ray.far = far;
    const hits = _ray.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      const o = h.object;
      if (!o.isMesh || !o.visible || o.material?.transparent || o.material?.blending === THREE.AdditiveBlending) continue;
      let p = o, skip = false;
      while (p) {
        if (p === this.group || p === particles.group || p.name === 'sky' || p.name === 'lightPool') skip = true;
        p = p.parent;
      }
      if (skip) continue;
      const n = h.face ? _n.copy(h.face.normal).transformDirection(o.matrixWorld) : _n.set(0, 1, 0);
      return { point: h.point.clone(), normal: n.clone(), object: o };
    }
    return null;
  }

  _place(mesh, point, normal, parent) {
    mesh.position.copy(point).addScaledVector(normal, 0.004);
    // basis: +z out of the surface, +y up along it (runs hang toward -y, i.e. downhill)
    const zA = normal.clone().normalize();
    const yA = new THREE.Vector3(0, 1, 0).projectOnPlane(zA);
    if (yA.lengthSq() < 1e-4) yA.set(Math.cos(mesh.id), 0, Math.sin(mesh.id)).projectOnPlane(zA);
    yA.normalize();
    const xA = new THREE.Vector3().crossVectors(yA, zA);
    mesh.quaternion.setFromRotationMatrix(_m.makeBasis(xA, yA, zA));
    if (parent) {
      parent.updateMatrixWorld(true);
      parent.worldToLocal(mesh.position);
      const pq = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      mesh.quaternion.premultiply(pq);
      parent.add(mesh);
    } else this.group.add(mesh);
  }

  _pool(point, normal, size, delay = 0, grow = 1.6) {
    const m = decalMesh('pool', (Math.random() * 3) | 0, size, size, false);
    m.scale.setScalar(0.001);
    m.visible = false;
    this._place(m, point, normal, null);
    this.items.push({ kind: 'pool', mesh: m, t: -delay, grow });
    this.pools.push(m);
    while (this.pools.length > MAX_POOLS) this._remove(this.pools.shift());
  }

  _run(point, normal, opts = {}) {
    const len = (opts.length ?? 0.35) * (goreReduced() ? 0.6 : 1);
    const m = decalMesh('drip', (Math.random() * 3) | 0, len * 0.45, len, true);
    m.userData.tex.repeat.set(1, 0.001);
    m.userData.tex.offset.set(0, 0.999);
    m.scale.set(1, 0.001, 1);
    this._place(m, point, normal, opts.object || null);
    this.items.push({ kind: 'run', mesh: m, shown: 0, speed: opts.speed ?? 0.12, len, life: 0 });
    return m;
  }

  /** Droplets thrown along dir: they fall, splash on what they hit and pool on the ground. */
  spray(pos, dir = new THREE.Vector3(0, 0.3, -1), opts = {}) {
    if (typeof opts === 'number') opts = { amount: opts };
    if (!pos) return;
    const amount = (opts.amount ?? 1) * (goreReduced() ? 0.5 : 1);
    const d = _v.copy(dir).normalize().clone();
    const ground = this._hit(pos, DOWN, 8);
    const groundY = ground ? ground.point.y : pos.y - 1.2;
    particles.emit('blood', { position: pos.clone(), direction: d, burst: true, autoDispose: true, groundY, count: Math.round(70 * amount) });
    // splash on a surface in front (glass, wall, face): spatter + a run down it
    const wall = this._hit(pos, d, 1.8);
    if (wall) {
      const sp = decalMesh('spatter', (Math.random() * 3) | 0, 0.5 * amount + 0.2, 0.5 * amount + 0.2, false);
      this._place(sp, wall.point, wall.normal, null);
      if (Math.abs(wall.normal.y) < 0.8) this._run(wall.point, wall.normal, { length: 0.3 + 0.3 * amount });
    }
    // where the spray comes down: pools that spread
    const fall = Math.sqrt(Math.max(0.05, 2 * Math.max(0.1, pos.y - groundY) / 9.8));
    for (let i = 0; i < Math.max(1, Math.round(2 * amount)); i++) {
      const reach = (0.4 + Math.random() * 0.9) * (opts.speed ?? 1);
      _n.set(d.x, 0, d.z);
      if (_n.lengthSq() < 1e-4) _n.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      _n.normalize();
      const from = pos.clone().addScaledVector(_n, reach);
      from.y = pos.y + 0.2;
      const g = this._hit(from, DOWN, 8);
      if (g) this._pool(g.point, g.normal, (0.25 + Math.random() * 0.35) * amount, fall + i * 0.15);
    }
  }

  /**
   * Blood dripping: from a point (falls and pools below) or running down a surface
   * ({point, normal, object}). Returns { stop() }.
   */
  drip(surface, opts = {}) {
    // g.blood.drip(pos, amount): amount 0..1 scales the rate, the duration and the run length
    if (typeof opts === 'number') {
      const a = Math.max(0.05, Math.min(1, opts));
      opts = { rate: 0.2 + 0.4 * a, duration: 3 + 7 * a, length: 0.2 + 0.3 * a };
    }
    if (!surface) return { stop() {} };
    const isPoint = surface?.isVector3;
    const point = isPoint ? surface : surface.point;
    let normal = isPoint ? null : surface.normal;
    const object = isPoint ? opts.object : surface.object ?? opts.object;
    let from = point.clone();
    if (normal && Math.abs(normal.y) < 0.9) {
      // a run creeps down the surface; drops fall off its end
      const len = opts.length ?? 0.35;
      this._run(point, normal, { object, length: len, speed: opts.speed });
      from = point.clone().addScaledVector(DOWN, len * 0.9).addScaledVector(normal, 0.01);
    }
    const ground = this._hit(from, DOWN, 6);
    const h = particles.emit('blood', { position: from, radius: 0.015, groundY: ground ? ground.point.y : from.y - 1, intensity: opts.rate ?? 0.35 });
    if (ground) this._pool(ground.point, ground.normal, 0.18 + Math.random() * 0.12, 0.6, (opts.duration ?? 6) * 0.8);
    const item = { kind: 'drip', handle: h, t: 0, dur: opts.duration ?? 6 };
    this.items.push(item);
    return { stop: () => (item.t = item.dur) };
  }

  _remove(mesh) {
    mesh.parent?.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh.userData.tex?.dispose();
  }

  clear() {
    for (const it of this.items) {
      if (it.mesh) this._remove(it.mesh);
      it.handle?.dispose();
    }
    this.items.length = 0;
    for (const m of this.pools) this._remove(m);
    this.pools.length = 0;
    for (const c of [...this.group.children]) this._remove(c);
  }

  update(dt) {
    // everything left on surfaces dries slowly (about two minutes) to a matte brown
    this._dryT = (this._dryT || 0) + dt;
    if (this._dryT > 0.5) {
      const step = this._dryT;
      this._dryT = 0;
      this.group.traverse((o) => {
        const u = o.material?.userData?.dry;
        if (u && u.value < 1) u.value = Math.min(1, u.value + step / 120);
      });
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.kind === 'pool') {
        it.t += dt;
        if (it.t < 0) continue;
        it.mesh.visible = true;
        const k = Math.min(1, it.t / it.grow);
        it.mesh.scale.setScalar(Math.max(0.001, 1 - Math.pow(1 - k, 3)));
        if (k >= 1) this.items.splice(i, 1);
      } else if (it.kind === 'run') {
        // stick-slip creep down the surface, slowing as it thins
        it.life += dt;
        const surge = 0.4 + 0.6 * Math.max(0, Math.sin(it.life * 1.9));
        it.shown = Math.min(1, it.shown + (it.speed / it.len) * surge * dt * (1 - it.shown * 0.5));
        const tex = it.mesh.userData.tex;
        tex.repeat.set(1, Math.max(0.001, it.shown));
        tex.offset.set(0, 1 - Math.max(0.001, it.shown));
        it.mesh.scale.y = Math.max(0.001, it.shown);
        if (it.shown >= 1) this.items.splice(i, 1);
      } else if (it.kind === 'drip') {
        it.t += dt;
        if (it.t >= it.dur) {
          it.handle.setActive(false);
          const h = it.handle;
          setTimeout(() => h.dispose(), 2500);
          this.items.splice(i, 1);
        }
      }
    }
  }
}

export const bloodFX = new BloodFX();
