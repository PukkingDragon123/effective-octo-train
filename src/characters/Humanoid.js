// Humanoid runtime: builds (cached) geometry, skeleton and materials from a
// spec, then runs the layered procedural animation every frame:
//   base mode/locomotion -> actions -> ghost (pre-IK) -> FK -> leg/arm IK ->
//   look-at (spine/neck/head + eyes) -> ghost (post: neck twist, roll, jitter)
//   -> bones -> face (blink, expressions, jaw) -> hair & cloth springs.
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { engine } from '../core/Engine.js';
import { clamp, lerp, damp, smoothstep, noise, Spring } from '../core/math.js';
import { skinMaterial, paintedMaterial } from '../render/index.js';
import { computeProportions, computeLayout, Rig, BONE_INDEX as BI, BONE_COUNT } from './Rig.js';
import { buildBodyGeometry, skinRGB } from './BodyBuilder.js';
import { buildHeadGeometry, faceParams, MORPHS, MORPH_INDEX } from './Head.js';
import { paintFace } from './Face.js';
import { Pose, composePose, solveTwoBone, ARM, LEG, HAND_FROM_TARGET } from './IK.js';
import { Animator, fingers } from './ProcAnim.js';
import { ActionPlayer } from './Actions.js';
import { GhostLayer } from './Ghost.js';
import { buildHair } from './Hair.js';
import { buildAccessories } from './Accessories.js';
import { hashKey } from './SDF.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// caches + shared materials
// ---------------------------------------------------------------------------
const bodyCache = new Map();
const headCache = new Map();
let _bodyMat = null;
function bodyMaterial() {
  if (!_bodyMat) _bodyMat = skinMaterial({ vertexColors: true, roughness: 0.8, wet: 0.04, name: 'character-body' });
  return _bodyMat;
}
export function geometryStats() {
  return { bodies: bodyCache.size, heads: headCache.size };
}

const SHAPE_KEYS = ['sex', 'age', 'height', 'build', 'skinTone', 'outfit', 'ghost', 'quality'];
function bodyKey(spec) {
  const o = {};
  for (const k of SHAPE_KEYS) o[k] = spec[k];
  return hashKey(o);
}
function headKey(spec) {
  return hashKey({ sex: spec.sex, age: spec.age, height: spec.height, build: spec.build, face: spec.face, id: spec.face?.seed === undefined ? spec.id : '', skinTone: spec.skinTone, ghost: spec.ghost, hair: spec.hair, outfit: spec.outfit?.type, quality: spec.quality });
}

export class Humanoid {
  constructor(spec = {}, internal = {}) {
    this.spec = spec;
    this.root = new THREE.Group();
    this.root.name = 'humanoid:' + (spec.id || 'anon');
    this.expression = { smile: 0, sad: 0, fear: 0, anger: 0, creepy: 0, surprise: 0 };
    this.ghost = { neckTwist: 0, headRoll: 0, headPitch: 0, backbend: 0, armTwist: 0, jitter: 0, levitate: 0, mouthStretch: 0, limbBreak: 0, crawl: 0, stretch: 0 };
    this.headPosition = new THREE.Vector3();
    this.eyePosition = new THREE.Vector3();
    this.mode = 'stand';
    this.bones = {};
    this.disposed = false;
    if (internal.source) this._initDouble(internal.source, internal.overrides || {});
    else this._build(spec);
    this._off = engine.onUpdate((dt) => this.update(dt), internal.source ? 21 : 20);
  }

  // -------------------------------------------------------------------------
  _build(spec) {
    const P = (this.P = computeProportions(spec));
    P.face = faceParams(spec, P);
    const L = (this.layout = computeLayout(P));
    const rig = (this.rig = new Rig(L));
    for (const b of rig.bones) this.bones[b.name] = b;
    this.skeleton = rig.makeSkeleton();
    const quality = spec.quality ?? 1;
    // body geometry (cached)
    const bk = bodyKey(spec);
    let bodyGeo = bodyCache.get(bk);
    if (!bodyGeo) {
      bodyGeo = buildBodyGeometry(spec, P, L, quality);
      bodyCache.set(bk, bodyGeo);
    }
    this.plan = bodyGeo.userData.plan;
    // head (cached geometry + texture)
    const hk = headKey(spec);
    let head = headCache.get(hk);
    if (!head) {
      const W = (this._weights = (this._weights || null));
      void W;
      const { makeWeightFns } = BodyBuilderRef;
      const hb = buildHeadGeometry(spec, P, L, makeWeightFns(P, L), quality);
      const tex = paintFace({ spec, P, F: hb.F, uvFn: hb.uvFn, lidMargins: hb.lidMargins, skin: skinRGB(spec) }, spec.faceTexSize || 1024);
      head = { ...hb, tex };
      headCache.set(hk, head);
    }
    this.face = head.F;
    const ghost = spec.ghost || {};
    const bodyMat = ghost.pale || ghost.wet ? skinMaterial({ vertexColors: true, roughness: 0.78 - (ghost.wet || 0) * 0.4, pale: ghost.pale || 0, name: 'character-body-ghost' }) : bodyMaterial();
    // roughness lives in the painted roughness map (G channel = absolute roughness)
    const headMat = skinMaterial({ map: head.tex.map, vertexColors: true, roughness: 1.0, wet: 0.04 + (ghost.wet || 0) * 0.5, pale: ghost.pale || 0, name: 'character-head' });
    headMat.roughnessMap = head.tex.roughnessMap;
    if (head.tex.emissiveMap) {
      headMat.emissiveMap = head.tex.emissiveMap;
      headMat.emissive = new THREE.Color(0xff9a7a);
      headMat.emissiveIntensity = 2.5;
    }
    this.materials = { body: bodyMat, head: headMat };
    const body = new THREE.SkinnedMesh(bodyGeo, bodyMat);
    body.name = 'body';
    const headMesh = new THREE.SkinnedMesh(head.geometry, headMat);
    headMesh.name = 'head';
    this.root.add(rig.root);
    for (const m of [body, headMesh]) {
      m.bind(this.skeleton, new THREE.Matrix4());
      m.castShadow = true;
      m.receiveShadow = true;
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, P.H * 0.5, 0), P.H * 0.9);
      m.frustumCulled = true;
      this.root.add(m);
    }
    this.body = body;
    this.head = headMesh;
    headMesh.morphTargetInfluences = new Array(MORPHS.length).fill(0);
    headMesh.morphTargetDictionary = { ...MORPH_INDEX };
    // hair
    this.hair = buildHair(this, spec);
    // accessories
    this.accessories = buildAccessories(this, spec);
    this._initRuntime();
  }

  _initRuntime() {
    this.anim = new Animator(this);
    this.pose = new Pose();
    this.actions = new ActionPlayer(this);
    this.ghostLayer = new GhostLayer(this);
    this.hipsPos = new THREE.Vector3();
    this.restHips = this.rig.restP[0].clone();
    // IK state
    this.ik = {
      hand: { L: this._ikSlot(), R: this._ikSlot() },
      foot: { L: this._ikSlot(), R: this._ikSlot() },
    };
    this.look = { target: null, weight: 0, w: 0, speed: 4, eyesOnly: false, unlimited: false, yaw: 0, pitch: 0, eyeYaw: 0, eyePitch: 0, pos: new THREE.Vector3(), has: false };
    this.faceState = {
      blink: 0, blinkT: 1 + Math.random() * 3, blinking: 0, talk: false, talkAmp: 1, jaw: 0, jawTarget: 0, talkT: 0,
      expr: { smile: 0, sad: 0, fear: 0, anger: 0, creepy: 0, surprise: 0 }, twitchL: 0, twitchR: 0, twitchT: 2 + Math.random() * 5,
      blinkEnabled: true,
    };
    this.groundFn = null;
    this.walk = null; // walkTo state
    this.opacity = 1;
    this.springs = { head: new Spring(0, 90, 14), belly: new Spring(0, 60, 6) };
    this._lastRootPos = new THREE.Vector3();
    this._hasLast = false;
    this._rootMat = new THREE.Matrix4();
    this._rootInv = new THREE.Matrix4();
    this.anim.footstep = (side) => this.onFootstep?.(side);
    this.update(0);
  }

  _ikSlot() {
    return { target: null, weight: 0, w: 0, blend: 0.3, grip: 0, gripW: 0, pole: null, orient: true, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), hasQuat: false };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  setMode(mode, opts = {}) {
    this.mode = mode;
    this.anim.setMode(mode, opts);
    if (mode === 'sit' || mode === 'sitCar' || mode === 'drive' || mode === 'ride' || mode === 'lie') this.walk = null;
  }

  walkTo(pos, opts = {}) {
    if (this.walk?.resolve) this.walk.resolve(false);
    const target = pos.isVector3 ? pos.clone() : new THREE.Vector3(pos.x, pos.y ?? 0, pos.z);
    const run = !!opts.run;
    return new Promise((resolve) => {
      this.walk = { target, speed: opts.speed ?? (run ? 3.2 : 1.2 * (1 - this.anim.posture * 0.35)), run, onArrive: opts.onArrive, faceAtEnd: opts.faceAtEnd, resolve, gait: opts.gait };
      this.setMode(run ? 'run' : 'walk', { gait: opts.gait || (run ? 'run' : 'walk') });
    });
  }

  stopWalking() {
    if (this.walk) {
      const w = this.walk;
      this.walk = null;
      w.resolve?.(false);
    }
    if (this.anim.mode === 'walk' || this.anim.mode === 'run') this.setMode('stand');
  }

  lookAt(target, opts = {}) {
    const L = this.look;
    L.target = target || null;
    L.weight = target ? opts.weight ?? 1 : 0;
    L.speed = opts.speed ?? 4;
    L.eyesOnly = !!opts.eyesOnly;
    L.unlimited = !!opts.unlimited;
  }

  setHandTarget(side, target, opts = {}) {
    const s = this.ik.hand[side];
    s.target = target || null;
    s.weight = target ? opts.weight ?? 1 : 0;
    s.blend = opts.blend ?? 0.3;
    s.grip = opts.grip ?? s.grip ?? 0;
    s.pole = opts.poleHint || null;
    s.orient = opts.orient !== false;
    s.offset = opts.offset || null;
  }

  setFootTarget(side, target, opts = {}) {
    const s = this.ik.foot[side];
    s.target = target || null;
    s.weight = target ? opts.weight ?? 1 : 0;
    s.blend = opts.blend ?? 0.25;
    s.orient = opts.orient !== false;
  }

  /** Optional ground height function (x, z) -> y for foot planting & walkTo. */
  setGroundFn(fn) {
    this.groundFn = fn;
  }

  sitAt(anchor, opts = {}) {
    this.walk = null;
    anchor.add(this.root);
    this.root.position.set(0, -this.restHips.y, -this.restHips.z);
    this.root.quaternion.identity();
    this.setMode(opts.pose || 'sit', { blend: opts.blend ?? 0.6 });
  }

  detach(parent = engine.scene) {
    this.root.updateWorldMatrix(true, false);
    parent.attach(this.root);
    // keep upright
    _e.setFromQuaternion(this.root.quaternion, 'YXZ');
    this.root.rotation.set(0, _e.y, 0);
  }

  setTalking(talking, amplitude = 1) {
    this.faceState.talk = !!talking;
    this.faceState.talkAmp = amplitude;
  }

  setExpression(e) {
    Object.assign(this.expression, e);
  }

  setGhost(g, speed = 3) {
    this.ghostLayer.setTargets(g, speed);
  }

  play(name, opts = {}) {
    return this.actions.play(name, opts);
  }

  stop(name) {
    this.actions.stop(name);
  }

  setLayer(layer) {
    this.root.traverse((o) => o.layers.set(layer));
    this._layer = layer;
  }

  createReflectionDouble(ghostOverrides = {}) {
    const d = new Humanoid(this.spec, { source: this, overrides: ghostOverrides });
    return d;
  }

  setVisible(v) {
    this.root.visible = v;
  }

  setOpacity(a) {
    a = clamp(a, 0, 1);
    if (a === this.opacity) return;
    this.opacity = a;
    if (!this._ownMats) {
      // clone shared materials so fading one ghost never fades everyone
      this._ownMats = true;
      const map = new Map();
      this.root.traverse((o) => {
        if (!o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const nm = mats.map((m) => {
          if (!map.has(m)) {
            const c = m.clone();
            if (m.onBeforeCompile) c.onBeforeCompile = m.onBeforeCompile;
            if (m.customProgramCacheKey) c.customProgramCacheKey = m.customProgramCacheKey;
            c.userData = { ...m.userData, baseOpacity: m.opacity, baseTransparent: m.transparent, baseDepthWrite: m.depthWrite };
            map.set(m, c);
          }
          return map.get(m);
        });
        o.material = Array.isArray(o.material) ? nm : nm[0];
      });
      this._fadeMats = [...map.values()];
    }
    for (const m of this._fadeMats) {
      const fade = a < 0.999;
      m.transparent = fade || m.userData.baseTransparent;
      m.opacity = (m.userData.baseOpacity ?? 1) * a;
      m.depthWrite = fade ? a > 0.6 : m.userData.baseDepthWrite;
      m.needsUpdate = true;
    }
    this.root.visible = a > 0.002;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._off?.();
    this.root.removeFromParent();
    this.hair?.dispose?.();
    if (this._fadeMats) for (const m of this._fadeMats) m.dispose();
    if (!this.isDouble) this.materials?.head?.dispose();
  }

  // -------------------------------------------------------------------------
  // Reflection double: shares geometry/materials, copies the source pose
  // -------------------------------------------------------------------------
  _initDouble(src, overrides) {
    this.isDouble = true;
    this.source = src;
    this.followSource = true;
    this.P = src.P;
    this.layout = src.layout;
    this.plan = src.plan;
    this.face = src.face;
    const root = skeletonClone(src.root);
    // SkeletonUtils.clone clones the root group itself; take its children
    this.root.add(...root.children);
    this.root.position.copy(src.root.position);
    this.root.quaternion.copy(src.root.quaternion);
    this.root.scale.copy(src.root.scale);
    // locate meshes / bones
    this.root.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isSkinnedMesh && o.name === 'body') this.body = o;
      if (o.isSkinnedMesh && o.name === 'head') this.head = o;
    });
    this.boneList = Object.keys(BI).map((n) => this.bones[n]);
    this.srcBoneList = Object.keys(BI).map((n) => src.bones[n]);
    this.overrides = { ...overrides };
    this.ghostLayer = new GhostLayer(this, true);
    this.ghostLayer.setTargets(overrides, 100);
    this.materials = src.materials;
    this.hair = src.hair?.cloneFor?.(this);
    this.root.traverse((o) => o.layers.set(2)); // LAYERS.REFLECTION_ONLY
    this.opacity = 1;
    this._q = new THREE.Quaternion();
    // follow the source in the world (same parent transform)
    this._followParent = true;
  }

  /** For doubles: stop copying the source (e.g. "the reflection stays seated"). */
  setFollow(v) {
    this.followSource = v;
  }

  setOverrides(o, speed = 3) {
    Object.assign(this.overrides, o);
    this.ghostLayer.setTargets(o, speed);
  }

  _updateDouble(dt) {
    const src = this.source;
    if (src.disposed) return;
    if (this.followSource) {
      // world transform of the source root
      src.root.updateWorldMatrix(true, false);
      if (this.root.parent) {
        this.root.parent.updateWorldMatrix(true, false);
        _m.copy(this.root.parent.matrixWorld).invert().multiply(src.root.matrixWorld);
        _m.decompose(this.root.position, this.root.quaternion, this.root.scale);
      }
      for (let i = 0; i < this.boneList.length; i++) {
        const b = this.boneList[i], s = this.srcBoneList[i];
        b.position.copy(s.position);
        b.quaternion.copy(s.quaternion);
        b.scale.copy(s.scale);
      }
      if (this.head && src.head) {
        const a = this.head.morphTargetInfluences, b = src.head.morphTargetInfluences;
        for (let i = 0; i < a.length; i++) a[i] = b[i];
      }
    }
    // ghost overrides on top (post-FK operations on bones directly)
    this.ghostLayer.updateDouble(dt);
    this.headPosition.copy(src.headPosition);
  }

  // -------------------------------------------------------------------------
  // Frame update
  // -------------------------------------------------------------------------
  update(dt) {
    if (this.disposed) return;
    if (this.isDouble) return this._updateDouble(dt);
    const rig = this.rig;
    this.root.updateWorldMatrix(true, false);
    this._rootMat.copy(this.root.matrixWorld);
    this._rootInv.copy(this._rootMat).invert();
    this._updateWalk(dt);
    this._measureSpeed(dt);
    // 1. base layer
    const base = this.anim.update(dt);
    const pose = this.pose.copy(base);
    if (this.bindPose) {
      pose.clear();
      composePose(rig, pose);
      this.hipsPos.copy(this.restHips);
      rig.fk(this.hipsPos);
      rig.apply(this.hipsPos);
      this._updateOutputs();
      return;
    }
    // 2. actions
    this.actions.apply(pose, dt);
    // 3. ghost pre-IK (backbend, limb breaks, stretch, levitate, crawl)
    this.ghostLayer.applyPose(pose, dt);
    // look-at angles (spine/neck/head) are added in pose space
    this._lookPose(pose, dt);
    // grip curls from IK slots
    for (const s of ['L', 'R']) {
      const h = this.ik.hand[s];
      h.gripW = damp(h.gripW, h.target ? h.grip : 0, 8, dt);
      if (h.gripW > 0.01) this._gripFingers(pose, s, h.gripW);
    }
    // jaw
    this._faceJaw(pose, dt);
    // 4. FK
    composePose(rig, pose);
    this.hipsPos.copy(this.restHips).add(pose.hips);
    rig.fk(this.hipsPos);
    // 5. IK legs (gait feet / explicit targets) then arms
    this._legIK(dt);
    this._armIK(dt);
    // 6. post-FK ghost (neck twist past limits, head roll/pitch, jitter)
    this.ghostLayer.applyPost(dt);
    // eyes
    this._eyes(dt);
    rig.apply(this.hipsPos);
    // 7. face morphs
    this._faceMorphs(dt);
    // 8. outputs + secondary
    this._updateOutputs();
    this.hair?.update?.(dt);
    this.accessories?.update?.(dt);
  }

  _updateOutputs() {
    const rig = this.rig;
    _v.copy(rig.rp[BI.head]).applyMatrix4(this._rootMat);
    this.headPosition.copy(_v);
    // eye point: between the eyes
    _v.copy(rig.rp[BI.eyeL]).add(rig.rp[BI.eyeR]).multiplyScalar(0.5);
    _v2.set(0, 0, -0.012);
    _v2.applyQuaternion(rig.rq[BI.head]);
    _v.add(_v2).applyMatrix4(this._rootMat);
    this.eyePosition.copy(_v);
  }

  /** World -> rig space. */
  toRig(v, out) {
    return out.copy(v).applyMatrix4(this._rootInv);
  }

  _targetWorld(t, out) {
    if (!t) return null;
    if (t.isVector3) return out.copy(t);
    if (t.isObject3D) {
      t.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(t.matrixWorld);
    }
    if (t.x !== undefined) return out.set(t.x, t.y, t.z);
    return null;
  }

  _updateWalk(dt) {
    const w = this.walk;
    if (!w) return;
    const r = this.root;
    const parentInv = r.parent ? _mi.copy(r.parent.matrixWorld).invert() : null;
    const tgt = _v3.copy(w.target);
    if (parentInv) tgt.applyMatrix4(parentInv);
    const dx = tgt.x - r.position.x, dz = tgt.z - r.position.z;
    const dist = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz);
    let dy = yaw - r.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    r.rotation.y += dy * (1 - Math.exp(-(w.run ? 7 : 5) * dt));
    const facing = Math.cos(dy);
    const slow = smoothstep(0, 0.9, dist);
    const spd = w.speed * slow * clamp(facing * 1.3, 0.15, 1);
    if (dist > 0.04) {
      const step = Math.min(dist, spd * dt);
      r.position.x += (dx / dist) * step;
      r.position.z += (dz / dist) * step;
      if (this.groundFn && !r.parent?.isScene === false) {
        // ground follow (world space when the parent is the scene)
      }
      if (this.groundFn) {
        r.updateWorldMatrix(true, false);
        _v.setFromMatrixPosition(r.matrixWorld);
        const gy = this.groundFn(_v.x, _v.z);
        if (Number.isFinite(gy)) r.position.y += (gy - _v.y);
      }
    } else {
      this.walk = null;
      if (w.faceAtEnd !== undefined) this.actions.play('turnTo', { yaw: w.faceAtEnd });
      this.setMode('stand');
      w.onArrive?.();
      w.resolve?.(true);
    }
  }

  _measureSpeed(dt) {
    // speed of the root along its forward axis, from actual movement (external drivers too)
    _v.setFromMatrixPosition(this._rootMat);
    if (this._hasLast && dt > 0) {
      _v2.copy(_v).sub(this._lastRootPos);
      _v3.set(0, 0, -1).transformDirection(this._rootMat);
      const fwd = _v2.dot(_v3) / dt;
      const sp = Math.min(12, Math.max(0, fwd));
      this.anim.speed = damp(this.anim.speed, sp, 6, dt);
    }
    this._lastRootPos.copy(_v);
    this._hasLast = true;
  }

  _gripFingers(p, s, g) {
    // blend the current finger angles toward a full grip
    const curl = (n, a) => {
      const i = BI[n + s] * 3;
      p.a[i] = lerp(p.a[i], a, g);
    };
    curl('index1', -1.25); curl('index2', -1.45);
    curl('middle1', -1.35); curl('middle2', -1.5);
    curl('ring1', -1.4); curl('ring2', -1.5);
    curl('pinky1', -1.45); curl('pinky2', -1.45);
    curl('thumb1', -0.45); curl('thumb2', -0.75);
    const i = BI['thumb1' + s] * 3;
    p.a[i + 2] = lerp(p.a[i + 2], -0.35, g);
  }

  _legIK(dt) {
    const rig = this.rig;
    const feet = this.anim.feet;
    const lift = this.ghostLayer.levitate;
    for (const s of ['L', 'R']) {
      const slot = this.ik.foot[s];
      const ext = slot.target ? this._targetWorld(slot.target, slot.pos) : null;
      slot.w = damp(slot.w, ext ? slot.weight : 0, 1 / Math.max(0.05, slot.blend), dt);
      const gaitW = feet.use * (1 - slot.w) * (1 - lift);
      if (gaitW < 0.001 && slot.w < 0.001) continue;
      _v.copy(feet[s]);
      if (this.groundFn && gaitW > 0) {
        // plant on the ground: rig -> world -> height -> rig
        _v2.copy(_v).applyMatrix4(this._rootMat);
        const gy = this.groundFn(_v2.x, _v2.z);
        if (Number.isFinite(gy)) {
          _v3.set(_v2.x, gy, _v2.z).applyMatrix4(this._rootInv);
          _v.y += _v3.y; // rig ground height offset (0 on flat ground)
        }
      }
      let tw = gaitW;
      if (slot.w > 0.001 && ext) {
        this.toRig(ext, _v2);
        _v.lerp(_v2, slot.w);
        tw = Math.max(gaitW, slot.w);
      }
      // foot orientation: rest (flat) pitched by the gait
      const pitch = feet['pitch' + s] || 0;
      _q.setFromAxisAngle(_v3.set(1, 0, 0), -pitch * (1 - slot.w));
      _q2.copy(_q).multiply(rig.restQ[BI['foot' + s]]);
      // yaw follows the hips (rig space) so the feet turn with the body
      const leg = LEG[s];
      // pole: knee forward (rig -Z) plus a little outward
      _v3.copy(rig.rp[leg.a]).add(_v2.set(s === 'R' ? 0.05 : -0.05, -0.2, -0.6).applyQuaternion(rig.rq[BI.hips]));
      solveTwoBone(rig, leg, _v, _v3, tw, _q2, 1);
    }
  }

  _armIK(dt) {
    const rig = this.rig;
    for (const s of ['L', 'R']) {
      const slot = this.ik.hand[s];
      const has = slot.target ? this._targetWorld(slot.target, slot.pos) : null;
      slot.w = damp(slot.w, has ? slot.weight : 0, 1 / Math.max(0.05, slot.blend), dt);
      if (slot.w < 0.001 || !has) continue;
      const arm = ARM[s];
      // target rotation (world -> rig)
      let endQ = null;
      if (slot.orient && slot.target.isObject3D) {
        slot.target.getWorldQuaternion(_q);
        _q2.setFromRotationMatrix(this._rootMat).invert();
        _q.premultiply(_q2).multiply(HAND_FROM_TARGET);
        endQ = _q;
      }
      // grip point -> wrist: offset from the palm centre back to the wrist
      this.toRig(slot.pos, _v);
      if (endQ) {
        const hs = this.P.handLen / 0.19;
        _v2.set(0, 0.085 * hs, -0.024 * hs).applyQuaternion(endQ);
        _v.sub(_v2);
      } else {
        // reach with the palm centre roughly at the target along the forearm
        _v2.copy(_v).sub(rig.rp[arm.a]).normalize().multiplyScalar(this.P.handLen * 0.45);
        _v.sub(_v2);
      }
      // pole: elbow down/back/out
      const sg = s === 'R' ? 1 : -1;
      if (slot.pole) this.toRig(slot.pole, _v3);
      else _v3.copy(rig.rp[arm.a]).add(_v2.set(sg * 0.35, -0.45, 0.25).applyQuaternion(rig.rq[BI.chest]));
      solveTwoBone(rig, arm, _v, _v3, slot.w, endQ, 1, 1);
    }
  }

  _lookPose(pose, dt) {
    const L = this.look;
    const has = L.target ? this._targetWorld(L.target, L.pos) : null;
    L.w = damp(L.w, has ? L.weight : 0, L.speed, dt);
    L.has = !!has;
    if (!has && L.w < 0.001) { L.yaw = damp(L.yaw, 0, 3, dt); L.pitch = damp(L.pitch, 0, 3, dt); return; }
    const rig = this.rig;
    if (has) {
      // direction in the chest frame (previous frame's FK is fine)
      this.toRig(L.pos, _v);
      _v.sub(rig.rp[BI.head]);
      _q.copy(rig.rq[BI.chest]).invert();
      _v.applyQuaternion(_q);
      let yaw = Math.atan2(-_v.x, -_v.z);
      let pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
      if (!L.unlimited) {
        yaw = clamp(yaw, -1.45, 1.45);
        pitch = clamp(pitch, -0.75, 0.6);
      }
      L.yaw = damp(L.yaw, yaw, L.speed, dt);
      L.pitch = damp(L.pitch, pitch, L.speed, dt);
    }
    if (L.eyesOnly) return;
    const w = L.w;
    const yaw = L.yaw * w, pitch = L.pitch * w;
    // human distribution: chest 15%, neck 35%, head 50% (unlimited: head takes the excess)
    const lim = L.unlimited ? 99 : 1;
    const cy = clamp(yaw * 0.15, -0.35 * lim, 0.35 * lim);
    pose.add('chest', 0, cy, 0);
    pose.add('neck', pitch * 0.4, (yaw - cy) * 0.4, 0);
    pose.add('head', pitch * 0.6, (yaw - cy) * 0.6, 0);
  }

  _eyes(dt) {
    const rig = this.rig;
    const L = this.look;
    let ty = 0, tp = 0;
    if (L.has && L.w > 0.01) {
      // eye direction in the head frame
      this.toRig(L.pos, _v);
      const mid = _v2.copy(rig.rp[BI.eyeL]).add(rig.rp[BI.eyeR]).multiplyScalar(0.5);
      _v.sub(mid);
      _q.copy(rig.rq[BI.head]).invert();
      _v.applyQuaternion(_q);
      ty = clamp(Math.atan2(-_v.x, -_v.z), -0.6, 0.6) * L.w;
      tp = clamp(Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -0.45, 0.4) * L.w;
    } else {
      // idle saccades
      const t = this.anim.time;
      ty = Math.round(noise.noise2D(t * 0.4, 11) * 3) * 0.06;
      tp = Math.round(noise.noise2D(t * 0.33, 17) * 2) * 0.04;
    }
    const k = 1 - Math.exp(-28 * dt); // fast saccade-like
    L.eyeYaw += (ty - L.eyeYaw) * k;
    L.eyePitch += (tp - L.eyePitch) * k;
    _e.set(L.eyePitch, L.eyeYaw, 0, 'YXZ');
    _q.setFromEuler(_e);
    for (const n of ['eyeL', 'eyeR']) {
      const i = BI[n];
      _q2.copy(rig.rq[BI.head]).multiply(rig.restLocalQ[i]).multiply(_q);
      rig.setRigQuat(i, _q2);
    }
  }

  _faceJaw(pose, dt) {
    const F = this.faceState;
    let target = 0;
    if (F.talk) {
      F.talkT -= dt;
      if (F.talkT <= 0) {
        // syllable rhythm ~ 5-7 Hz with pauses
        F.talkT = 0.08 + Math.random() * 0.12;
        F.jawTarget = Math.random() < 0.15 ? 0.02 : (0.25 + Math.random() * 0.75) * F.talkAmp;
      }
      target = F.jawTarget;
    }
    const ex = F.expr;
    target = Math.max(target, ex.surprise * 0.5, ex.fear * 0.25);
    target += this.ghostLayer.mouthStretch * 1.6;
    F.jaw = damp(F.jaw, target, 22, dt);
    pose.add('jaw', -F.jaw * 0.32, 0, 0);
  }

  _faceMorphs(dt) {
    const m = this.head?.morphTargetInfluences;
    if (!m) return;
    const F = this.faceState;
    const ex = F.expr;
    for (const k in ex) ex[k] = damp(ex[k], this.expression[k] || 0, 6, dt);
    // blinking: random interval, faster when nervous; never for ghosts that "don't blink"
    const nerv = this.anim.nervous + ex.fear * 0.8;
    if (F.blinkEnabled && !this.spec.noBlink) {
      F.blinkT -= dt;
      if (F.blinkT <= 0 && F.blinking <= 0) {
        F.blinking = 0.0001;
        F.blinkT = (1.2 + Math.random() * 4.5) / (1 + nerv * 2.2);
        if (Math.random() < 0.12) F.blinkT = 0.25; // double blink
      }
    }
    let blink = 0;
    if (F.blinking > 0) {
      F.blinking += dt;
      const d = 0.16;
      const u = F.blinking / d;
      blink = u < 0.4 ? u / 0.4 : Math.max(0, 1 - (u - 0.4) / 0.6);
      if (u >= 1) F.blinking = 0;
    }
    const closed = clamp(this._eyesClosed ?? 0, 0, 1);
    blink = Math.max(blink, closed);
    // cheek twitch (nervous / creepy)
    F.twitchT -= dt;
    if (F.twitchT <= 0) {
      F.twitchT = (3 + Math.random() * 8) / (1 + nerv + ex.creepy * 2);
      if (nerv + ex.creepy > 0.2 || Math.random() < 0.25) F[Math.random() < 0.5 ? 'twitchL' : 'twitchR'] = 1;
    }
    F.twitchL = damp(F.twitchL, 0, 9, dt);
    F.twitchR = damp(F.twitchR, 0, 9, dt);
    const rest = this.face?.smileRest || 0;
    const I = MORPH_INDEX;
    m[I.smile] = clamp(ex.smile + rest * 0.4 + ex.creepy * 0.9 + ex.surprise * 0, 0, 1.3);
    m[I.frown] = clamp(ex.sad * 0.8 + ex.anger * 0.35 + ex.fear * 0.2, 0, 1);
    m[I.mouthWide] = clamp(ex.fear * 0.45 + ex.creepy * 0.8 + this.ghostLayer.mouthStretch * 1.2, 0, 1.6);
    m[I.browUp] = clamp(ex.surprise + ex.fear * 0.6 + ex.sad * 0.1, 0, 1);
    m[I.browInnerUp] = clamp(ex.sad + ex.fear * 0.8, 0, 1);
    m[I.browDown] = clamp(ex.anger + ex.creepy * 0.25, 0, 1);
    const wide = clamp(ex.fear + ex.surprise * 0.8 + ex.creepy * 0.6, 0, 1);
    m[I.lidWide] = wide * (1 - blink);
    m[I.squint] = clamp(ex.smile * 0.35 + ex.anger * 0.5, 0, 1) * (1 - blink);
    m[I.blinkL] = blink;
    m[I.blinkR] = blink;
    m[I.cheekL] = F.twitchL * 0.8;
    m[I.cheekR] = F.twitchR * 0.8;
    m[I.lipPress] = clamp(ex.anger * 0.6 + ex.sad * 0.2, 0, 1);
    m[I.sneer] = clamp(ex.anger * 0.4, 0, 1);
  }
}

// late-bound helper (avoid a circular import at module eval)
import * as BodyBuilderRef from './BodyBuilder.js';
export { fingers, BONE_COUNT, UP };
