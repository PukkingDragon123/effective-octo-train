// Shared helpers for the vehicle sandboxes: a test road (implements the world road API
// used by the car physics: project / sample / length / get + getHeight), a little night
// set (asphalt ribbon, shoulders, tree trunks + foliage blobs, poles, a streetlight) and
// camera presets. Default export = exterior beauty scene (same as `vehicle`).
import * as THREE from 'three';
import { paintedMaterial, foliageMaterial, sky, lightPool, GLOBAL_UNIFORMS } from '../render/index.js';
import { tex } from '../textures/index.js';
import { makeRng } from '../core/math.js';
import { settings } from '../core/Settings.js';

const UP = new THREE.Vector3(0, 1, 0);

export class TestRoad {
  /** points: Vector3[] control points (Catmull-Rom), width */
  constructor(ctrl, width = 6.2) {
    const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
    const L = curve.getLength();
    const n = Math.ceil(L);
    this.points = curve.getSpacedPoints(n);
    this.cum = [0];
    for (let i = 1; i < this.points.length; i++) this.cum.push(this.cum[i - 1] + this.points[i].distanceTo(this.points[i - 1]));
    this.L = this.cum[this.cum.length - 1];
    this.width = width;
    this.id = 'main';
    this.splines = new Map([['main', this]]);
  }
  get(id) {
    return this;
  }
  length() {
    return this.L;
  }
  sample(id, s, out = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), width: 0 }) {
    if (typeof id === 'number') {
      out = s || out;
      s = id;
    }
    s = Math.max(0, Math.min(this.L, s));
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const t = (s - this.cum[lo]) / (this.cum[hi] - this.cum[lo] || 1);
    out.pos.lerpVectors(this.points[lo], this.points[hi], t);
    out.tangent.subVectors(this.points[hi], this.points[lo]).normalize();
    out.right.crossVectors(out.tangent, UP).normalize();
    out.width = this.width;
    return out;
  }
  project(p) {
    let best = null;
    const pts = this.points;
    // coarse then fine
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i += 8) {
      const d = (pts[i].x - p.x) ** 2 + (pts[i].z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    for (let i = Math.max(0, bi - 10); i < Math.min(pts.length - 1, bi + 10); i++) {
      const a = pts[i], b = pts[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const len2 = abx * abx + abz * abz || 1;
      let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + abx * t, cz = a.z + abz * t;
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (!best || d < best.d) best = { d, i, t };
    }
    const s = this.cum[best.i] + (this.cum[best.i + 1] - this.cum[best.i]) * best.t;
    const smp = this.sample(s);
    const lateral = (p.x - smp.pos.x) * smp.right.x + (p.z - smp.pos.z) * smp.right.z;
    return { id: 'main', s, lateral, distance: Math.abs(lateral), pos: smp.pos, tangent: smp.tangent, right: smp.right, width: this.width, onRoad: Math.abs(lateral) < this.width / 2 };
  }
}

/** Build a little night road set. Returns { world, road, group } where world implements road/getHeight. */
export function buildTestSet(scene, opts = {}) {
  const rng = makeRng(opts.seed ?? 3);
  const ctrl = opts.ctrl || [
    new THREE.Vector3(0, 0, 40), new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, -60), new THREE.Vector3(18, 0, -120),
    new THREE.Vector3(10, 0, -190), new THREE.Vector3(-14, 0, -250), new THREE.Vector3(-10, 0, -330), new THREE.Vector3(14, 0, -400),
  ];
  const road = new TestRoad(ctrl);
  const group = new THREE.Group();
  // ground
  const T = (k, r) => {
    try {
      return tex(k, { repeat: r });
    } catch (e) {
      return null;
    }
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 700).rotateX(-Math.PI / 2), paintedMaterial({ color: 0x1d2416, map: T('soil', [80, 80]), roughness: 0.95, brush: 0.6 }));
  ground.position.set(0, -0.03, -180);
  ground.receiveShadow = true;
  group.add(ground);
  // road ribbon (asphalt) + shoulders
  const ribbon = (half0, half1, y, mat, uScale) => {
    const pos = [], uv = [], idx = [];
    const smp = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), width: 0 };
    const n = Math.ceil(road.L / 1.5);
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * road.L;
      road.sample(s, smp);
      const a = smp.pos.clone().addScaledVector(smp.right, half0), b = smp.pos.clone().addScaledVector(smp.right, half1);
      pos.push(a.x, y, a.z, b.x, y, b.z);
      uv.push(0, s / uScale, 1, s / uScale);
      if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) {
      g.setIndex(idx.slice().reverse());
      g.computeVertexNormals();
    }
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const asphalt = paintedMaterial({ color: 0x3a3a3a, map: T('asphalt', [1, 1]), normalMap: T('asphalt_normal', [1, 1]), roughness: 0.55, wet: 0.9, brush: 0.4 });
  if (asphalt.map) asphalt.map.repeat.set(1, 1);
  ribbon(-3.1, 3.1, 0.0, asphalt, 6.2);
  const shoulder = paintedMaterial({ color: 0x3b3326, map: T('soil', [1, 1]), roughness: 0.95, brush: 0.6 });
  ribbon(-4.6, -3.1, -0.01, shoulder, 4);
  ribbon(3.1, 4.6, -0.01, shoulder, 4);
  // centre line (dashed) + edge lines
  const lineMat = paintedMaterial({ color: 0xd8c890, roughness: 0.6, brush: 0.3 });
  const smp = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), width: 0 };
  const dashGeo = new THREE.PlaneGeometry(0.12, 2.2).rotateX(-Math.PI / 2);
  const dashes = new THREE.InstancedMesh(dashGeo, lineMat, Math.ceil(road.L / 6));
  const mt = new THREE.Matrix4();
  for (let i = 0; i < dashes.count; i++) {
    road.sample(i * 6 + 1, smp);
    mt.makeRotationY(Math.atan2(smp.tangent.x, smp.tangent.z)).setPosition(smp.pos.x, 0.012, smp.pos.z);
    dashes.setMatrixAt(i, mt);
  }
  group.add(dashes);
  // tree trunks + foliage blobs along the corridor
  const trunkMat = paintedMaterial({ color: 0x3a3028, map: T('bark', [1, 3]), roughness: 0.95, brush: 0.7 });
  const leafMat = paintedMaterial({ color: 0x1e3018, roughness: 0.9, brush: 0.8 });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 9, 8);
  const leafGeo = new THREE.IcosahedronGeometry(2.4, 1);
  const nT = Math.ceil(road.L / 7) * 2;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, nT);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, nT * 2);
  let k = 0, kl = 0;
  for (let i = 0; i < nT / 2; i++) {
    for (const side of [-1, 1]) {
      road.sample(i * 7 + rng() * 5, smp);
      const off = side * (6.5 + rng() * 7);
      const p = smp.pos.clone().addScaledVector(smp.right, off);
      const s = 0.7 + rng() * 0.8;
      mt.compose(new THREE.Vector3(p.x, 4.5 * s, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.1, rng() * 6, rng() * 0.1)), new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(k++, mt);
      for (let j = 0; j < 2; j++) {
        const q = p.clone().add(new THREE.Vector3((rng() - 0.5) * 3, 7 * s + rng() * 3, (rng() - 0.5) * 3));
        mt.compose(q, new THREE.Quaternion(), new THREE.Vector3(1 + rng(), 0.7 + rng() * 0.5, 1 + rng()).multiplyScalar(s * 1.2));
        leaves.setMatrixAt(kl++, mt);
      }
    }
  }
  trunks.castShadow = leaves.castShadow = true;
  trunks.receiveShadow = leaves.receiveShadow = true;
  group.add(trunks, leaves);
  // bushes on the shoulders
  const bushGeo = new THREE.IcosahedronGeometry(0.9, 1);
  const bushes = new THREE.InstancedMesh(bushGeo, leafMat, Math.ceil(road.L / 3));
  for (let i = 0; i < bushes.count; i++) {
    road.sample(i * 3 + rng() * 2, smp);
    const side = rng() < 0.5 ? -1 : 1;
    const p = smp.pos.clone().addScaledVector(smp.right, side * (5.3 + rng() * 1.5));
    mt.compose(new THREE.Vector3(p.x, 0.4, p.z), new THREE.Quaternion(), new THREE.Vector3(1 + rng(), 0.6 + rng() * 0.6, 1 + rng()));
    bushes.setMatrixAt(i, mt);
  }
  bushes.receiveShadow = true;
  group.add(bushes);
  scene.add(group);
  const world = {
    road,
    group,
    getHeight: () => 0,
    surfaceAt: () => 'asphalt',
    landmarks: {},
  };
  return { world, road, group };
}

/** Concrete pole + sodium lamp (lightPool) at a world position, arm pointing toward +x*side. */
export function addStreetlight(scene, pos, side = -1, intensity = 30) {
  const g = new THREE.Group();
  const mat = paintedMaterial({ color: 0x8a867c, roughness: 0.9, brush: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 7, 8), mat);
  pole.position.set(0, 3.5, 0);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), mat);
  arm.position.set(side * 0.8, 6.9, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.22), paintedMaterial({ color: 0x3a3a38, roughness: 0.6 }));
  head.position.set(side * 1.55, 6.85, 0);
  g.add(pole, arm, head);
  g.position.copy(pos);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(g);
  const lamp = new THREE.Object3D();
  lamp.position.set(side * 1.55, 6.75, 0);
  g.add(lamp);
  const h = lightPool.add({ object: lamp, color: 0xffa04a, intensity, distance: 24, decay: 2, flicker: 'sodium', glow: { size: 0.6, color: 0xffa050, opacity: 0.9 }, pool: true, groundY: 0, priority: 3, beam: { length: 6.5, angle: 0.62, intensity: 0.5 } });
  return { group: g, handle: h };
}

/** Apply sandbox environment params: hour, rain, fog, wet, preset (graphics preset). */
export function applyEnv(params, defaults = {}) {
  if (params.get('preset')) settings.set('graphicsPreset', params.get('preset'));
  const hour = Number(params.get('hour') ?? defaults.hour ?? 22);
  sky.setHour(hour);
  const rain = Number(params.get('rain') ?? defaults.rain ?? 0.6);
  const fog = Number(params.get('fog') ?? defaults.fog ?? 0.25);
  sky.setWeather({ rain, fog, wind: 0.4 }, 0);
  sky.setWetness?.(Number(params.get('wet') ?? defaults.wet ?? Math.max(0.5, rain)));
  GLOBAL_UNIFORMS.uRain.value = rain;
  return { hour, rain, fog };
}

export default async function (ctx) {
  const mod = await import('./vehicle.js');
  return mod.default(ctx);
}
