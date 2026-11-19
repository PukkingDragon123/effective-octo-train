// The loading screen's last beat: as the ember dies, about a hundred pale human hands reach out of
// the dark from every side, crawl over the zebras and the ledge, grasp at the urn with twitching
// fingers, converge, and at the end rush the camera and smother the view.
//
// Cheap by design: the HandRig mesh (src/creatures/hand.js) is baked into a few static pose
// variants (claw / reaching / grasping; a slender and a bony, long-nailed build) and drawn with
// InstancedMesh, one draw call per pose variant. Only the woman's hand that takes the stick is a
// skinned rig (IncenseScene). Skin: the CC0 MakeHuman skin scans (public/assets/characters/mh/tex,
// young / middle / old, sampled triplanar from a clean patch of the atlas and tinted pale), chosen
// per hand; blood and grime on some fingertips and nails come from the CC0 blood decal scan
// (public/assets/textures/decals). Nothing is drawn.
import * as THREE from 'three';
import { HandRig } from '../creatures/hand.js';

const POSES = {
  claw: { c: { i: -0.25, m: -0.2, r: -0.18, p: -0.14, t: -0.1 }, spread: 1 },
  reach: { c: { i: 0.18, m: 0.14, r: 0.2, p: 0.26, t: 0.12 }, spread: 0.6 },
  grasp: { c: { i: 0.7, m: 0.76, r: 0.8, p: 0.84, t: 0.5 }, spread: 0.15 },
};
const SHAPES = [
  { fingerScale: 1.2, thickness: 0.72, bony: 0.3, nails: 0.2, forearm: 2.4, wrist: 0.76, color: [0.66, 0.61, 0.56] },
  { fingerScale: 1.18, thickness: 0.76, bony: 0.85, nails: 0.12, forearm: 2.2, wrist: 0.82, color: [0.6, 0.57, 0.53] },
];

/** Bake a skinned hand into static geometry in one pose (bone transforms applied on the CPU). */
function bakePose(shape, pose) {
  const rig = new HandRig({ shape, material: new THREE.MeshBasicMaterial(), twitch: 0 });
  Object.assign(rig.curl, pose.c);
  Object.assign(rig.curlT, pose.c);
  rig.spread = rig.spreadT = pose.spread;
  rig.update(0);
  const mesh = rig.mesh;
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  const src = mesh.geometry;
  const pos = src.attributes.position;
  const out = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    mesh.applyBoneTransform(i, v);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  for (const k of ['uv', 'color', 'aAO']) if (src.attributes[k]) g.setAttribute(k, src.attributes[k]);
  if (src.index) g.setIndex(src.index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  mesh.material.dispose();
  return g;
}

const rnd = (() => {
  let s = 9127;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
})();

/** One material for the whole horde: per-hand skin scan, age, pale tint, blood and dirt (aVar). */
function hordeMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.58, metalness: 0, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tSkin0: { value: tex.young }, tSkin1: { value: tex.middle }, tSkin2: { value: tex.old }, tBlood: { value: tex.blood } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aVar; varying vec3 vVar; varying vec3 vHp; varying vec3 vHn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVar = aVar; vHp = position; vHn = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tSkin0; uniform sampler2D tSkin1; uniform sampler2D tSkin2; uniform sampler2D tBlood;
varying vec3 vVar; varying vec3 vHp; varying vec3 vHn;
// a clean patch of the MakeHuman atlas (the thigh), mirrored so it tiles without seams
vec2 hzWin(vec2 p) { vec2 m = abs(fract(p * 0.5) * 2.0 - 1.0); return vec2(0.28, 0.31) + m * vec2(0.11, 0.12); }
vec3 hzSkin(sampler2D t, vec3 p, vec3 w) {
  return texture2D(t, hzWin(p.yz)).rgb * w.x + texture2D(t, hzWin(p.xz)).rgb * w.y + texture2D(t, hzWin(p.xy)).rgb * w.z;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 w = abs(normalize(vHn)); w /= (w.x + w.y + w.z);
  vec3 p = vHp * 1.7;
  vec3 skin = vVar.x < 0.5 ? hzSkin(tSkin0, p, w) : vVar.x < 1.5 ? hzSkin(tSkin1, p, w) : hzSkin(tSkin2, p, w);
  // pale: drained toward a cold grey, a little of the scan's warmth left
  float l = dot(skin, vec3(0.3, 0.55, 0.15));
  skin = mix(vec3(l) * vec3(0.93, 0.95, 1.0), skin, 0.35) * 1.18;
  vec3 col = skin * mix(vec3(1.0), diffuseColor.rgb * 1.5, 0.45);
  // fingertips and nails: blood (vVar.y) or grime (vVar.z), broken up by the decal scan
  float tip = smoothstep(1.35, 1.75, vHp.y);
  float splat = texture2D(tBlood, fract(vHp.xz * 2.3 + vHp.y * 0.7)).a;
  col = mix(col, vec3(0.28, 0.02, 0.02), tip * vVar.y * smoothstep(0.15, 0.6, splat));
  col = mix(col, vec3(0.16, 0.12, 0.08), tip * vVar.z * smoothstep(0.05, 0.5, splat + 0.2));
  diffuseColor.rgb = col;
}`);
  };
  m.customProgramCacheKey = () => 'dlb-hand-horde';
  return m;
}

export class HandHorde {
  /** Bakes the variants step by step (call build() early, during loading; it yields between steps). */
  constructor(scene, count = 100) {
    this.scene = scene;
    this.count = count;
    this.ready = false;
    this.meshes = [];
    this.hands = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  async build() {
    const pause = () => new Promise((r) => setTimeout(r, 0));
    const geos = [];
    for (const shape of SHAPES) {
      for (const name of Object.keys(POSES)) {
        geos.push({ shape: SHAPES.indexOf(shape), pose: name, geo: bakePose(shape, POSES[name]) });
        await pause();
      }
    }
    const L = new THREE.TextureLoader();
    const load = (f, srgb = true) => L.loadAsync(f).then((t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    });
    const [young, middle, old, blood] = await Promise.all([
      load('assets/characters/mh/tex/skin_young_f.jpg'), load('assets/characters/mh/tex/skin_middle_m.jpg'),
      load('assets/characters/mh/tex/skin_old_m.jpg'), load('assets/textures/decals/blood_spatter_1.webp'),
    ]);
    const mat = hordeMaterial({ young, middle, old, blood });
    // assign every hand a variant; one InstancedMesh per pose variant with exactly its hands
    const buckets = new Map();
    for (let i = 0; i < this.count; i++) {
      const gi = Math.floor(rnd() * geos.length);
      if (!buckets.has(gi)) buckets.set(gi, { gi, list: [] });
      const h = this._newHand(i, geos[gi].pose);
      // old, wrinkled skin goes on the bony build; young and middle on the slender one
      h.var = [geos[gi].shape === 1 ? 2 : rnd() < 0.5 ? 0 : 1, rnd() < 0.3 ? 0.6 + rnd() * 0.4 : 0, rnd() < 0.4 ? 0.5 + rnd() * 0.5 : 0];
      buckets.get(gi).list.push(h);
      this.hands.push(h);
    }
    for (const b of buckets.values()) {
      const im = new THREE.InstancedMesh(geos[b.gi].geo, mat, b.list.length);
      const vars = new Float32Array(b.list.length * 3);
      b.list.forEach((h, j) => vars.set(h.var, j * 3));
      im.geometry = im.geometry.clone(); // per-mesh instanced attribute (shares the vertex buffers' data)
      im.geometry.setAttribute('aVar', new THREE.InstancedBufferAttribute(vars, 3));
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      b.list.forEach((h, j) => {
        h.mesh = im;
        h.slot = j;
      });
      im.visible = false;
      this.scene.add(im);
      this.meshes.push(im);
    }
    this.ready = true;
  }

  /** One hand's script: where it comes from, what it grasps, when, how it twitches. */
  _newHand(i, pose) {
    const wave = i < 30 ? 0 : 1;
    const a = rnd() * Math.PI * 2;
    const r0 = 0.5 + rnd() * 0.6;
    const start = new THREE.Vector3(Math.cos(a) * r0, -0.08 + rnd() * 0.32, Math.sin(a) * r0 * 0.9 - 0.1);
    // targets: the urn's rim, the ledge, the zebras' backs, the stick
    const ta = a + (rnd() - 0.5) * 0.9;
    const tr = 0.08 + rnd() * (pose === 'grasp' ? 0.06 : 0.36);
    const target = new THREE.Vector3(Math.cos(ta) * tr, -0.07 + rnd() * 0.2, Math.sin(ta) * tr);
    const child = rnd() < 0.15;
    return {
      t0: wave ? 0.8 + rnd() * 1.8 : 0.15 + rnd() * 0.9,
      dur: 1.3 + rnd() * 1.1,
      start, target,
      lift: 0.02 + rnd() * 0.06,
      scale: (0.064 + rnd() * 0.02) * (child ? 0.6 : 1),
      thin: 0.85 + rnd() * 0.25,
      roll: (rnd() - 0.5) * 2.6, // a random wrist roll
      tw: 5 + rnd() * 9,
      ph: rnd() * 10,
      rush: new THREE.Vector2((rnd() - 0.5) * 2, (rnd() - 0.5) * 2),
      rushAt: 3.9 + rnd() * 0.5,
      cur: start.clone(),
    };
  }

  /** t: seconds into the grab; camera: to rush it at the end. */
  update(t, camera) {
    if (!this.ready) return;
    for (const m of this.meshes) m.visible = t > 0.1;
    const m4 = this._m, q = this._q, p = this._p, s = this._s;
    const fwd = new THREE.Vector3(), up = new THREE.Vector3(), x = new THREE.Vector3(), z = new THREE.Vector3();
    const camFwd = camera.getWorldDirection(new THREE.Vector3());
    const camRight = new THREE.Vector3().crossVectors(camFwd, camera.up).normalize();
    const camUp = new THREE.Vector3().crossVectors(camRight, camFwd).normalize();
    for (const h of this.hands) {
      const k = Math.max(0, Math.min(1, (t - h.t0) / h.dur));
      if (k <= 0) {
        s.setScalar(0);
        m4.compose(h.start, q.identity(), s);
        h.mesh.setMatrixAt(h.slot, m4);
        continue;
      }
      const e = k * k * (3 - 2 * k);
      // crawl: lerp with a hump (over zebras and the ledge edge), a little creeping hesitation
      p.lerpVectors(h.start, h.target, e);
      p.y += Math.sin(Math.PI * e) * h.lift;
      const creep = Math.sin(t * h.tw * 0.3 + h.ph) * 0.004 * (1 - e);
      p.x += creep;
      // the end: they rush the lens and smother it
      const rk = Math.max(0, Math.min(1, (t - h.rushAt) / 0.7));
      if (rk > 0) {
        const re = rk * rk;
        const cp = camera.position;
        const aim = this._aim || (this._aim = new THREE.Vector3());
        aim.copy(cp).addScaledVector(camFwd, 0.06 + 0.05 * (1 - re)).addScaledVector(camRight, h.rush.x * 0.05).addScaledVector(camUp, h.rush.y * 0.035);
        p.lerp(aim, re);
      }
      // orientation: fingers lead along the motion, palm down onto what they crawl over
      fwd.copy(rk > 0 ? camFwd.clone().negate() : h.target.clone().sub(h.start)).normalize();
      if (rk > 0) fwd.lerp(h.target.clone().sub(h.start).normalize(), 1 - rk).normalize();
      z.set(0, -1, 0).addScaledVector(fwd, -fwd.y).normalize(); // palm (+Z) faces down
      if (rk > 0) z.lerp(fwd.clone().negate(), rk).normalize();
      x.crossVectors(fwd, z).normalize();
      up.crossVectors(z, x).normalize();
      m4.makeBasis(x, up, z);
      q.setFromRotationMatrix(m4);
      // twitching: quick small flexes and a slow roll
      const tw = Math.sin(t * h.tw + h.ph) * Math.sin(t * h.tw * 0.37 + h.ph * 2);
      const te = this._te || (this._te = new THREE.Euler());
      const tq = this._tq || (this._tq = new THREE.Quaternion());
      te.set(tw * 0.18, 0, h.roll + Math.sin(t * 0.7 + h.ph) * 0.15);
      q.multiply(tq.setFromEuler(te));
      const sc = h.scale * (1 + rk * 0.6);
      s.set(sc * h.thin, sc, sc);
      m4.compose(p, q, s);
      h.mesh.setMatrixAt(h.slot, m4);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
