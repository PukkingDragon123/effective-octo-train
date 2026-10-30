// GLB Humanoid: same public API as src/characters/Humanoid.js (the contract in
// src/characters/index.js), built on the Quaternius bodies + UAL clips.
//
// Per frame (engine order 20):
//   restore mixer base -> AnimationMixer (crossfaded, speed-synced clips) -> save base ->
//   posture (age stoop / child) + breathing / micro-motion + action poses (local additive) ->
//   matrices -> look-at (chest/neck/head, human limits; ghosts unlimited via the post-skin twist) ->
//   two-bone IK (hands with grip/finger poses, feet) -> ghost layer (post) -> eyes -> face uniforms
//   (jaw/smile/brows/blink) -> hair springs -> held props -> outputs.
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { engine } from '../../core/Engine.js';
import { settings } from '../../core/Settings.js';
import { clamp, lerp, damp, smoothstep, noise } from '../../core/math.js';
import { templateFor } from './assets.js';
import { InstanceRig, CONTRACT_BONES, makeChain, solveTwoBone, makeEndBasis, setEndRotation } from './rig.js';
import { normalizeSpec, atlasKey } from './look.js';
import { getAtlas, releaseAtlas } from './atlas.js';
import { getFaceTexture, releaseFace } from './face.js';
import { acquireLookGeometry, releaseLookGeometry } from './geometry.js';
import { makeCharUniforms, bodyMaterial, eyeMaterial, accessoryMaterial } from './materials.js';
import { eyeTexture, buildEyeGeometry } from './eyes.js';
import { wornAccessoryGeometry, heldGeometry, heldMaterial } from './accessories.js';
import { AnimController } from './anim.js';
import { ActionPlayer } from './actions.js';
import { GhostLayer } from './ghost.js';
import { MH } from './mhpack.js';
import { buildPerson, personTemplate, personLod, personNoMouth, releasePerson } from './mhperson.js';
import { mhRecipe, mhSkinKey, mhDefaults } from './mhrecipe.js';
import { makeMHUniforms, mhBodyMaterial, mhEyeMaterial, driveMHFace } from './mhmaterials.js';
import { sharedMHClips } from './assets.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const eyeGeoCache = new WeakMap();

/** Far LOD beyond this many metres (at the default 72° field of view; zoomed lenses scale it). */
export const LOD_DISTANCE = 12;
const MOUTH_DISTANCE = 6; // teeth / tongue are never drawn beyond this (screen-scaled like the LOD)
const REF_TAN = Math.tan((72 * Math.PI) / 360);

let _camPos = new THREE.Vector3();

export class HumanoidGLB {
  constructor(spec = {}, internal = {}) {
    this.spec = spec;
    this.isGLB = true;
    this.root = new THREE.Group();
    this.root.name = 'humanoid-glb:' + (spec.id || 'anon');
    this.expression = { smile: 0, sad: 0, fear: 0, anger: 0, creepy: 0, surprise: 0 };
    this.ghost = { neckTwist: 0, headRoll: 0, headPitch: 0, backbend: 0, armTwist: 0, jitter: 0, levitate: 0, mouthStretch: 0, limbBreak: 0, crawl: 0, stretch: 0 };
    this.headPosition = new THREE.Vector3();
    this.eyePosition = new THREE.Vector3();
    this.mode = 'stand';
    this.bones = {};
    this.disposed = false;
    this.time = Math.random() * 100;
    if (internal.source) this._initDouble(internal.source, internal.overrides || {});
    else this._build(spec);
    this._off = engine.onUpdate((dt) => this.update(dt), internal.source ? 21 : 20);
  }

  // ======================================================================= build
  _build(spec) {
    if (MH.ready && !spec.quaternius) {
      try {
        this._buildMH(spec);
        return;
      } catch (e) {
        console.warn('[characters] MakeHuman build failed, using the Quaternius body:', e);
        if (this.person) { releasePerson(this.person); this.person = null; }
        this.isMH = false;
        if (this.inner) this.inner.removeFromParent();
        this.bones = {};
      }
    }
    this._buildQ(spec);
  }

  _buildQ(spec) {
    const look = (this.look = normalizeSpec(spec));
    const t = (this.t = templateFor(look.sex));
    const rig = (this.rig = new InstanceRig(t));
    this.inner = new THREE.Group();
    this.inner.name = 'glb-inner';
    this.inner.rotation.y = Math.PI; // glTF faces +Z, ours -Z
    this.root.add(this.inner);
    for (const b of rig.roots) this.inner.add(b);
    // proportions: head scale for children, overall scale to the requested height
    this.headScale = 1 + 0.2 * look.child;
    const hb = rig.bone('Head');
    hb.scale.setScalar(this.headScale);
    rig.scaleRest[t.index.Head].setScalar(this.headScale);
    this.scale = look.height / (t.height + t.headTop * (this.headScale - 1) * 0.9);
    this.inner.scale.setScalar(this.scale);
    // bone map (contract names + template names)
    for (const b of rig.bones) this.bones[b.name] = b;
    for (const [k, n] of Object.entries(CONTRACT_BONES)) if (rig.byName[n]) this.bones[k] = rig.byName[n];
    // jaw helper (no jaw bone in the mesh: the shader deforms the mouth; this follows the chin)
    this.jaw = new THREE.Object3D();
    this.jaw.name = 'jaw';
    const jp = t.face.mouth.clone().sub(t.Gp[t.index.Head]).applyQuaternion(t.Gq[t.index.Head].clone().invert());
    this.jaw.position.copy(jp).multiplyScalar(1 / this.headScale);
    hb.add(this.jaw);
    this.bones.jaw = this.jaw;
    // materials / textures
    const U = (this.U = makeCharUniforms(t));
    U.uFat.value = (look.build - 0.42) * 0.05;
    const akey = atlasKey(look);
    this._atlas = getAtlas(look, akey, look.quality >= 0.75 ? 2048 : 1024);
    this._faceTex = getFaceTexture(look, t, akey, 1024);
    U.uFaceMap.value = this._faceTex.tex;
    U.uMaskMap.value = this._atlas.mask;
    const gh = look.ghost;
    if (gh) U.uGhost.value.set(gh.pale || 0, gh.eyes === 'black' ? 1 : (gh.pale || 0) * 0.35, gh.wet || 0, gh.eyes === 'black' ? 1 : 0);
    this.materials = { body: bodyMaterial(U, { map: this._atlas.map, wet: 0.12 + (gh?.wet || 0) * 0.5 }) };
    // body mesh (one draw call: skin + clothes + hair)
    this._geoHi = acquireLookGeometry(t, look, 'hi');
    this.body = new THREE.SkinnedMesh(this._geoHi.geo, this.materials.body);
    this.body.name = 'body';
    this.body.bind(rig.skeleton, new THREE.Matrix4());
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.inner.add(this.body);
    // eyes
    let eg = eyeGeoCache.get(t);
    if (!eg) { eg = buildEyeGeometry(t); eyeGeoCache.set(t, eg); }
    const eyeStyle = gh?.eyes && gh.eyes !== 'normal' ? gh.eyes : 'normal';
    this.materials.eyes = eyeMaterial(U, eyeTexture(eyeStyle, look.age > 70 ? '#4a3a30' : '#352215'), { glow: eyeStyle === 'glow' });
    this.eyes = new THREE.SkinnedMesh(eg, this.materials.eyes);
    this.eyes.name = 'eyes';
    this.eyes.bind(rig.skeleton, new THREE.Matrix4());
    this.inner.add(this.eyes);
    // worn accessories
    const wg = wornAccessoryGeometry(t, look);
    if (wg) {
      this.materials.acc = accessoryMaterial(U);
      this.worn = new THREE.SkinnedMesh(wg, this.materials.acc);
      this.worn.name = 'accessories';
      this.worn.bind(rig.skeleton, new THREE.Matrix4());
      this.worn.castShadow = true;
      this.inner.add(this.worn);
    }
    this._setupCulling();
    // held props
    this.held = {};
    this._initRuntime();
    const hand = { basket: 'L', lunchbox: 'R', umbrella: 'R', cigarette: 'R', garland: look.acc.includes('basket') ? 'R' : 'L' };
    for (const a of look.acc) if (heldGeometry(a)) this.holdItem(a, hand[a] || 'R');
  }

  /** MakeHuman body: blended T-posed bodies + fitted proxies + clothes shells (mhperson.js). */
  _buildMH(spec0) {
    const spec = mhDefaults(spec0);
    const look = (this.look = normalizeSpec(spec));
    const recipe = (this.recipe = mhRecipe(spec, look));
    if (!look.posture && recipe.look?.posture) look.posture = recipe.look.posture;
    const person = (this.person = buildPerson(recipe));
    const t = (this.t = personTemplate(person, sharedMHClips));
    this.isMH = true;
    const rig = (this.rig = new InstanceRig(t));
    this.inner = new THREE.Group();
    this.inner.name = 'glb-inner';
    this.inner.rotation.y = Math.PI; // model space faces +Z, ours -Z
    this.root.add(this.inner);
    for (const b of rig.roots) this.inner.add(b);
    this.headScale = 1;
    this.scale = look.height / t.height;
    this._legRatio = t.Gp[t.index.pelvis].y / 0.949; // clip ground speeds are for the 1.81 m Quaternius template
    this.inner.scale.setScalar(this.scale);
    for (const b of rig.bones) this.bones[b.name] = b;
    for (const [k, n] of Object.entries(CONTRACT_BONES)) if (rig.byName[n]) this.bones[k] = rig.byName[n];
    const hb = rig.bone('Head');
    this.jaw = new THREE.Object3D();
    this.jaw.name = 'jaw';
    this.jaw.position.copy(t.face.mouth.clone().sub(t.Gp[t.index.Head]).applyQuaternion(t.Gq[t.index.Head].clone().invert()));
    hb.add(this.jaw);
    this.bones.jaw = this.jaw;
    // ---- uniforms / textures / shader look
    const U = (this.U = makeMHUniforms(t, person));
    const tex = MH.tex;
    const skinKey = mhSkinKey(look);
    U.uSkinMap.value = tex.skins[skinKey] || Object.values(tex.skins).find(Boolean) || null;
    U.uHairMap.value = recipe.hair ? tex.hair['hair_' + recipe.hair] || null : null;
    U.uPartsMap.value = tex.parts;
    const sc = new THREE.Color(look.skin);
    const avg = tex.skinAvg[skinKey] || [0.6, 0.35, 0.22];
    U.uSkinCol.value.copy(sc);
    U.uSkinTint.value.set(clamp(sc.r / avg[0], 0.15, 3), clamp(sc.g / avg[1], 0.15, 3), clamp(sc.b / avg[2], 0.15, 3));
    U.uHairCol.value.set(look.hair.color);
    const lx = recipe.look || {};
    const male = look.sex === 'm' ? 1 : 0;
    U.uLook.value.set((lx.stubble || 0) * male * (look.child > 0.3 ? 0 : 1), lx.thin || 0, lx.bald || 0, lx.sweat || 0);
    U.uLook2.value.set(look.old, (lx.moustache || 0) * male, male, look.face.wrinkles);
    this._placeMarks(lx.marks || [], person, t);
    const gh = look.ghost;
    const eyeStyle = gh?.eyes && gh.eyes !== 'normal' ? gh.eyes : 'normal';
    this._mhBase = {
      veins: gh ? gh.veins ?? (gh.pale || 0) * 0.45 : 0,
      pupils: gh ? gh.pupils ?? (gh.pale > 0.6 ? 0.55 : 0) : 0,
      veil: gh ? gh.hairOverFace || 0 : 0,
      eyeStyle: { normal: 0, black: 1, glow: 2, milky: 3, white: 3 }[eyeStyle] ?? 0,
    };
    if (gh) {
      U.uGhost.value.set(gh.pale || 0, gh.eyes === 'black' ? 1 : (gh.pale || 0) * 0.35, gh.wet || 0, gh.eyes === 'black' ? 1 : 0);
      U.uStain.value.set(gh.bloodStains || 0, 0, 0, 0);
      U.uGhost2.value.set(this._mhBase.veins, this._mhBase.pupils, gh.decay || 0, this._mhBase.eyeStyle);
      U.uVeil.value.set(this._mhBase.veil, 0, 0, 0);
    }
    // ---- clothes atlas (procedural painters)
    const akey = atlasKey(look);
    this._atlas = getAtlas(look, akey, look.quality >= 0.75 ? 2048 : 1024);
    U.uMaskMap.value = this._atlas.mask;
    this.materials = { body: mhBodyMaterial(U, { map: this._atlas.map, wet: 0.1 + (gh?.wet || 0) * 0.5 }) };
    this.body = new THREE.SkinnedMesh(person.geo, this.materials.body);
    this.body.name = 'body';
    this.body.bind(rig.skeleton, new THREE.Matrix4());
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.inner.add(this.body);
    // ---- eyes
    if (person.eyeGeo && tex.eye) {
      this.materials.eyes = mhEyeMaterial(U, tex.eye, { glow: eyeStyle === 'glow' });
      this.eyes = new THREE.SkinnedMesh(person.eyeGeo, this.materials.eyes);
    } else {
      let eg = eyeGeoCache.get(t);
      if (!eg) { eg = buildEyeGeometry(t); eyeGeoCache.set(t, eg); }
      this.materials.eyes = eyeMaterial(U, eyeTexture(eyeStyle, '#352215'), { glow: eyeStyle === 'glow' });
      this.eyes = new THREE.SkinnedMesh(eg, this.materials.eyes);
    }
    this.eyes.name = 'eyes';
    this.eyes.bind(rig.skeleton, new THREE.Matrix4());
    this.inner.add(this.eyes);
    // ---- worn accessories
    const wg = wornAccessoryGeometry(t, look);
    if (wg) {
      this.materials.acc = accessoryMaterial(U);
      this.worn = new THREE.SkinnedMesh(wg, this.materials.acc);
      this.worn.name = 'accessories';
      this.worn.bind(rig.skeleton, new THREE.Matrix4());
      this.worn.castShadow = true;
      this.inner.add(this.worn);
    }
    this._setupCulling();
    this.held = {};
    this._initRuntime();
    // ghost look parameters that live in the ghost layer (uncanny, blink desync, stutter...)
    if (gh) {
      const g0 = {};
      for (const k of ['uncanny', 'blinkDesync', 'snapTilts', 'stutter', 'breathStop', 'hairOverFace', 'veilGap', 'pupils']) if (gh[k] !== undefined) g0[k] = gh[k];
      if (gh.uncanny === undefined) g0.uncanny = clamp((gh.pale || 0) - 0.3, 0, 1) * 0.45;
      if (gh.blinkDesync === undefined && (gh.pale || 0) > 0.5) g0.blinkDesync = 0.6;
      if (gh.type === 'emaciated') Object.assign(g0, { stutter: gh.stutter ?? 0.35, snapTilts: gh.snapTilts ?? 0.6, stretch: 0.25 });
      if (gh.type === 'hunched') Object.assign(g0, { snapTilts: gh.snapTilts ?? 0.4 });
      if (gh.type === 'child') Object.assign(g0, { stare: 1, snapTilts: gh.snapTilts ?? 0.5 });
      if (gh.type === 'drowned') Object.assign(g0, { breathStop: 1, hairOverFace: gh.hairOverFace ?? 0.8, stutter: gh.stutter ?? 0.15 });
      if (gh.type === 'hairOverFace') Object.assign(g0, { hairOverFace: gh.hairOverFace ?? 1, breathStop: 1 });
      if (gh.type === 'crushed') Object.assign(g0, { limbBreak: 0.6, jitter: 0.3, headRoll: 0.4 });
      const crush = gh.crush ?? (gh.type === 'crushed' ? 1 : 0);
      if (crush) this._gore.tgt.crush = this._gore.cur.crush = crush;
      this.ghostLayer.setTargets(g0, 100);
    }
    const hand = { basket: 'L', lunchbox: 'R', umbrella: 'R', cigarette: 'R', garland: look.acc.includes('basket') ? 'R' : 'L' };
    for (const a of look.acc) if (heldGeometry(a)) this.holdItem(a, hand[a] || 'R');
    // the far LOD is fitted in idle time, so walking past LOD_DISTANCE never hitches a frame
    if (!person.lo) {
      const idle = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 2000 }) : (f) => setTimeout(f, 200);
      idle(() => { if (!this.disposed && this.person) personLod(this.person); });
    }
  }

  /**
   * Frustum culling for the skinned parts. SkinnedMesh culls with its OWN boundingSphere, which three
   * otherwise computes once by CPU-skinning every vertex in whatever pose the first frame has. A fixed
   * bind-pose sphere (model space, generous enough for any pose: arms up, sitting, lying, crawling)
   * is shared by the body, eyes and accessories, so an off-screen or hidden character costs no draw
   * call and no skeleton upload. The body's onBeforeRender records the last frame it was drawn (by any
   * camera, mirrors included) for the update throttle.
   */
  _setupCulling() {
    const h = this.t.height;
    const sphere = (this._cullSphere = new THREE.Sphere(new THREE.Vector3(0, h * 0.48, 0), h * 0.85));
    for (const m of [this.body, this.eyes, this.worn]) {
      if (!m) continue;
      m.boundingSphere = sphere;
      m.frustumCulled = true;
    }
    this._drawnFrame = -1;
    this.body.onBeforeRender = () => { this._drawnFrame = engine.frame; };
    this._mouthOn = true;
    this._mouthHold = 0;
  }

  /** moles / scars at named face anchors, snapped onto the skin (nearest body vertex) */
  _placeMarks(marks, person, t) {
    const out = this.U.uMarks.value;
    const lm = person.lm, n = lm.noseTip, e = t.eyes, m = t.face.mouth;
    const anchors = {
      cheekL: [0.038, n.y - 0.004, n.z - 0.035], cheekR: [-0.038, n.y - 0.004, n.z - 0.035], jawL: [0.05, m.y - 0.02, m.z - 0.05],
      chinL: [0.014, lm.chin.y + 0.006, lm.chin.z], chinR: [-0.014, lm.chin.y + 0.006, lm.chin.z], lipL: [0.022, m.y + 0.012, m.z - 0.008],
      noseR: [-0.014, n.y + 0.004, n.z - 0.012], templeL: [0.06, e[0].y + 0.022, e[0].z - 0.03], browL: [e[0].x + 0.004, e[0].y + 0.024, e[0].z],
    };
    const P = person.P;
    const nb = P.length / 3;
    marks.slice(0, 4).forEach(([kind, where, size], i) => {
      const a = anchors[where];
      if (!a) return;
      let best = 1e9, bi = 0;
      for (let v = 0; v < nb; v++) {
        const dx = P[v * 3] - a[0], dy = P[v * 3 + 1] - a[1], dz = P[v * 3 + 2] - a[2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < best) { best = d; bi = v; }
      }
      out[i].set(P[bi * 3], P[bi * 3 + 1], P[bi * 3 + 2], kind === 'scar' ? -(size || 0.01) : size || 0.0015);
    });
  }

  _initRuntime() {
    const t = this.t, rig = this.rig;
    this.anim = new AnimController(this);
    this.actions = new ActionPlayer(this);
    this.ghostLayer = new GhostLayer(this);
    this.chains = {
      L: makeChain(rig, 'upperarm_l', 'lowerarm_l', 'hand_l', new THREE.Vector3(0, 0, 1)),
      R: makeChain(rig, 'upperarm_r', 'lowerarm_r', 'hand_r', new THREE.Vector3(0, 0, 1)),
      FL: makeChain(rig, 'thigh_l', 'calf_l', 'foot_l', new THREE.Vector3(0, 0, -1)),
      FR: makeChain(rig, 'thigh_r', 'calf_r', 'foot_r', new THREE.Vector3(0, 0, -1)),
    };
    this.handBasis = { L: makeEndBasis(rig, 'hand_l', X, new THREE.Vector3(0, -1, 0)), R: makeEndBasis(rig, 'hand_r', new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0)) };
    this.footBasis = { L: makeEndBasis(rig, 'foot_l', Z, Y), R: makeEndBasis(rig, 'foot_r', Z, Y) };
    this.ik = { hand: { L: this._slot(), R: this._slot() }, foot: { L: this._slot(), R: this._slot() } };
    this.req = { L: null, R: null, FL: null, FR: null }; // per-frame procedural IK requests (actions)
    this.lookS = { target: null, weight: 0, w: 0, speed: 4, eyesOnly: false, unlimited: false, yaw: 0, pitch: 0, eyeYaw: 0, eyePitch: 0, sacT: 0, sacY: 0, sacP: 0, pos: new THREE.Vector3(), has: false, lock: 0 };
    this.faceS = { blinkT: 1 + Math.random() * 3, blinking: 0, jaw: 0, jawT: 0, talkT: 0, talk: false, amp: 1, expr: { smile: 0, sad: 0, fear: 0, anger: 0, creepy: 0, surprise: 0 }, closed: 0 };
    this.groundFn = null;
    const gh = this.look.ghost;
    const heavy = gh && gh.bloodStains > 0.45 && gh.decay > 0.3 ? 1 : 0;
    this._gore = { cur: { bleedEyes: 0, bleedMouth: 0, amount: 0, crush: heavy }, tgt: { bleedEyes: 0, bleedMouth: 0, amount: 0, crush: heavy }, speed: 0.6, wound: null };
    this.walk = null;
    this.opacity = 1;
    this._lastPos = new THREE.Vector3();
    this._hasLast = false;
    this._rootInv = new THREE.Matrix4();
    this._lod = 'hi';
    this._accDt = 0;
    this._frame = (Math.random() * 7) | 0;
    this.restPelvis = t.restPos[t.index.pelvis].clone();
    // hair springs (only chains that carry hair)
    this.hairSprings = ['hair_1', 'hair_2', 'hair_3', 'hairL_1', 'hairL_2', 'hairR_1', 'hairR_2'].map((n) => ({ i: t.index[n], tip: new THREE.Vector3(), vel: new THREE.Vector3(), init: false }));
    this.hairOn = !this.isMH && ['long', 'bob', 'ponytail'].includes(this.look.hair.style);
    this.anim.setMode('stand');
    this.update(0);
  }
  _slot() { return { target: null, weight: 0, w: 0, blend: 0.3, grip: 0, gripW: 0, pole: null, orient: true, pos: new THREE.Vector3() }; }

  // ======================================================================= public API
  setMode(mode, opts = {}) {
    this.mode = mode;
    this.anim.setMode(mode, opts);
    if (['sit', 'sitCar', 'drive', 'ride', 'lie'].includes(mode)) this.walk = null;
  }

  walkTo(pos, opts = {}) {
    if (this.walk?.resolve) this.walk.resolve(false);
    const target = pos.isVector3 ? pos.clone() : new THREE.Vector3(pos.x, pos.y ?? 0, pos.z);
    const run = !!opts.run;
    const gait = opts.gait || (run ? 'run' : 'walk');
    const base = gait === 'sprint' ? 6.5 : run ? 3.2 : 1.25 * (1 - this.look.old * 0.35) * (1 - this.look.child * 0.1);
    return new Promise((resolve) => {
      this.walk = { target, speed: opts.speed ?? base, run, onArrive: opts.onArrive, faceAtEnd: opts.faceAtEnd, resolve, gait };
      this.setMode(gait === 'sprint' ? 'sprint' : run ? 'run' : 'walk', { gait });
    });
  }
  stopWalking() {
    if (this.walk) { const w = this.walk; this.walk = null; w.resolve?.(false); }
    if (['walk', 'run', 'sprint'].includes(this.mode)) this.setMode('stand');
  }

  lookAt(target, opts = {}) {
    const L = this.lookS;
    L.target = target || null;
    L.weight = target ? opts.weight ?? 1 : 0;
    L.speed = opts.speed ?? 4;
    L.eyesOnly = !!opts.eyesOnly;
    L.unlimited = !!opts.unlimited;
    L.lock = opts.lock ? 1 : 0;
  }

  setHandTarget(side, target, opts = {}) {
    const s = this.ik.hand[side];
    s.target = target || null;
    s.weight = target ? opts.weight ?? 1 : 0;
    s.blend = opts.blend ?? 0.3;
    s.grip = opts.grip ?? s.grip ?? 0;
    s.pole = opts.poleHint || null;
    s.orient = opts.orient !== false;
    s.along = opts.along || null; // optional world dirs (Vector3) for the fingers / palm
    s.palm = opts.palm || null;
    s.fingers = opts.fingers || null;
  }
  setFootTarget(side, target, opts = {}) {
    const s = this.ik.foot[side];
    s.target = target || null;
    s.weight = target ? opts.weight ?? 1 : 0;
    s.blend = opts.blend ?? 0.25;
    s.orient = opts.orient !== false;
  }
  setGroundFn(fn) { this.groundFn = fn; }

  /** Sit on an anchor (seat surface point, facing its -Z). opts.pose 'sit'|'sitCar'|'drive'|'ride'. */
  sitAt(anchor, opts = {}) {
    this.walk = null;
    anchor.add(this.root);
    const pose = opts.pose || 'sit';
    this.setMode(pose, { blend: opts.blend ?? 0.6 });
    this.root.quaternion.identity();
    // seat contact ~9 cm under the pelvis joint of the sitting clip
    const clip = this.anim.clipOf(this.anim.baseClip());
    const pp = pelvisOf(clip, this.t);
    const s = this.scale;
    this.root.position.set(pp.x * s, -(pp.y - 0.095) * s, pp.z * s + (opts.back ?? 0));
    this._seated = anchor;
  }

  detach(parent = engine.scene) {
    this.root.updateWorldMatrix(true, false);
    parent.attach(this.root);
    _e.setFromQuaternion(this.root.quaternion, 'YXZ');
    this.root.rotation.set(0, _e.y, 0);
    this._seated = null;
  }

  setTalking(talking, amplitude = 1) {
    this.faceS.talk = !!talking;
    this.faceS.amp = amplitude;
    this.anim.talking = !!talking;
  }
  setExpression(e) { Object.assign(this.expression, e); }
  setGhost(g, speed = 3) { this.ghostLayer.setTargets(g, speed); }
  /** Reveal gore at runtime: { bleedEyes 0..1, bleedMouth 0..1, wound:'neck'|'head'|'chest'|null, amount 0..1, crush 0..1, speed } */
  setGore(g = {}) {
    const G = this._gore;
    for (const k of ['bleedEyes', 'bleedMouth', 'amount', 'crush']) if (g[k] !== undefined) G.tgt[k] = g[k];
    if (g.speed !== undefined) G.speed = g.speed;
    if (g.wound !== undefined) {
      G.wound = g.wound;
      const t = this.t, I = t.index, e = t.eyeMid;
      const U = this.U.uGoreW.value;
      if (g.wound === 'neck') U.set(0, 0, 0, 1);
      else if (g.wound === 'head') U.set(-0.045, e.y + 0.05, e.z + 0.005, 2);
      else if (g.wound === 'chest') U.set(0.03, t.Gp[I.spine_03].y + 0.06, t.Gp[I.spine_03].z + 0.13, 3);
      else U.set(0, 0, 0, 0);
    }
  }
  play(name, opts = {}) { return this.actions.play(name, opts); }
  stop(name) { this.actions.stop(name); }

  setLayer(layer) {
    this.root.traverse((o) => o.layers.set(layer));
    this._layer = layer;
  }
  createReflectionDouble(ghostOverrides = {}) { return new HumanoidGLB(this.spec, { source: this, overrides: ghostOverrides }); }
  setVisible(v) { this.root.visible = v; }
  setOpacity(a) {
    a = clamp(a, 0, 1);
    if (a === this.opacity) return;
    this.opacity = a;
    const fade = a < 0.999;
    for (const m of this._allMaterials()) {
      if (m.userData.baseTransparent === undefined) { m.userData.baseTransparent = m.transparent; m.userData.baseDepthWrite = m.depthWrite; }
      const was = m.transparent;
      m.transparent = fade || m.userData.baseTransparent;
      m.opacity = a;
      m.depthWrite = fade ? a > 0.6 : m.userData.baseDepthWrite;
      if (was !== m.transparent) m.needsUpdate = true;
    }
    this.root.visible = a > 0.002;
  }
  _allMaterials() { return Object.values(this.materials || {}); }

  /** Attach a held prop ('basket','lunchbox','umbrella','cigarette','garland','coins','paper','amulet','keys','coffee'). */
  holdItem(kind, side = 'R') {
    this.dropItem(kind);
    const geo = heldGeometry(kind);
    if (!geo) return null;
    if (!this.materials.held) this.materials.held = heldMaterial(true);
    const mesh = new THREE.Mesh(geo, this.materials.held);
    mesh.name = 'held:' + kind;
    mesh.castShadow = true;
    const hand = this.rig.bone(side === 'L' ? 'hand_l' : 'hand_r');
    const grip = new THREE.Object3D();
    hand.add(grip);
    grip.add(mesh);
    const hang = ['basket', 'lunchbox', 'garland', 'coffee', 'keys'].includes(kind);
    const sx = side === 'L' ? 1 : -1;
    // grip point in the hand's rest frame: palm centre, slightly under the palm
    const t = this.t;
    const hi = t.index[side === 'L' ? 'hand_l' : 'hand_r'];
    const inv = t.Gq[hi].clone().invert();
    const off = new THREE.Vector3(sx * 0.075, -0.03, 0.005);
    if (kind === 'cigarette') off.set(sx * 0.115, -0.006, -0.012);
    if (kind === 'umbrella') off.set(sx * 0.07, -0.025, 0.01);
    if (kind === 'paper' || kind === 'coins' || kind === 'amulet') off.set(sx * 0.085, -0.03, -0.01);
    grip.position.copy(off.applyQuaternion(inv)).multiplyScalar(1 / (hand.scale.x || 1));
    // base orientation (hand rest frame): items' +Y along the fingers' up-side
    if (kind === 'cigarette') grip.quaternion.copy(inv).multiply(_q.setFromEuler(_e.set(-Math.PI / 2, 0, 0))); // through the fingers, filter on the palm side
    else if (kind === 'umbrella') grip.quaternion.copy(inv).multiply(_q.setFromEuler(_e.set(0, 0, sx * -Math.PI / 2)));
    else grip.quaternion.copy(inv);
    if (this._layer !== undefined) grip.traverse((o) => o.layers.set(this._layer));
    this.held[kind] = { mesh, grip, hand, side, hang, swing: new THREE.Vector2(), vel: new THREE.Vector2() };
    return mesh;
  }
  dropItem(kind) {
    const h = this.held?.[kind];
    if (!h) return;
    h.grip.removeFromParent();
    delete this.held[kind];
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._off?.();
    this.root.removeFromParent();
    if (this.isDouble) { for (const m of Object.values(this.materials || {})) m.dispose?.(); return; }
    this.anim?.dispose();
    if (this.person) releasePerson(this.person);
    releaseLookGeometry(this._geoHi);
    if (this._geoLo) releaseLookGeometry(this._geoLo);
    releaseAtlas(this._atlas);
    releaseFace(this._faceTex);
    for (const m of Object.values(this.materials)) m.dispose();
    this.rig.skeleton.dispose();
  }

  // ======================================================================= reflection double
  _initDouble(src, overrides) {
    this.isDouble = true;
    this.source = src;
    this.followSource = true;
    this.look = src.look;
    this.t = src.t;
    this.scale = src.scale;
    this.headScale = src.headScale;
    const clone = skeletonClone(src.root);
    this.root.add(...clone.children);
    this.inner = this.root.children[0];
    // own uniforms (twist/face copies + overrides), shared textures and geometry
    this.isMH = !!src.isMH;
    if (this.isMH) {
      this.person = null;
      this.U = makeMHUniforms(this.t, src.person);
      for (const k of ['uFat', 'uFaceMap', 'uMaskMap', 'uSkinMap', 'uHairMap', 'uPartsMap', 'uSkinTint', 'uSkinCol', 'uHairCol', 'uLook', 'uLook2', 'uMarks', 'uStain', 'uMorphTex']) this.U[k] = src.U[k];
      this.materials = {
        body: mhBodyMaterial(this.U, { map: src._atlas.map, wet: src.materials.body.userData.uniforms?.dlbPaint?.value?.y ?? 0.1 }),
        eyes: src.person?.eyeGeo ? mhEyeMaterial(this.U, src.materials.eyes.map) : eyeMaterial(this.U, src.materials.eyes.map),
      };
    } else {
      this.U = makeCharUniforms(this.t);
      for (const k of ['uFat', 'uFaceMap', 'uMaskMap']) this.U[k] = src.U[k];
      this.materials = {
        body: bodyMaterial(this.U, { map: src._atlas.map, wet: src.materials.body.userData.uniforms?.dlbPaint?.value?.y ?? 0.12 }),
        eyes: eyeMaterial(this.U, src.materials.eyes.map),
      };
    }
    if (src.materials.acc) this.materials.acc = accessoryMaterial(this.U);
    this.held = {};
    const bones = {};
    this.root.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
      if (o.isSkinnedMesh) {
        if (o.name === 'body') { o.material = this.materials.body; this.body = o; }
        else if (o.name === 'eyes') { o.material = this.materials.eyes; this.eyes = o; }
        else if (o.name === 'accessories') o.material = this.materials.acc;
      }
    });
    this.bones = { ...bones };
    for (const [k, n] of Object.entries(CONTRACT_BONES)) if (bones[n]) this.bones[k] = bones[n];
    this.boneList = src.rig.bones.map((b) => bones[b.name]);
    this.srcBones = src.rig.bones;
    // a light rig wrapper for the ghost layer
    this.rig = Object.create(InstanceRig.prototype);
    Object.assign(this.rig, { t: this.t, bones: this.boneList, byName: bones, parRest: src.rig.parRest, parRestInv: src.rig.parRestInv, posRest: src.rig.posRest, scaleRest: src.rig.scaleRest, _n: this.boneList.length });
    this.overrides = { ...overrides };
    this.ghostLayer = new GhostLayer(this, true);
    this.ghostLayer.setTargets(overrides, 100);
    this.root.traverse((o) => o.layers.set(2)); // LAYERS.REFLECTION_ONLY
    // a drawn reflection keeps its source's pose updating at full rate (the source may be culled)
    if (this.body) this.body.onBeforeRender = () => { src._drawnFrame = engine.frame; };
    this.opacity = 1;
    this.time = src.time;
  }
  setFollow(v) { this.followSource = v; }
  setOverrides(o, speed = 3) { Object.assign(this.overrides, o); this.ghostLayer.setTargets(o, speed); }

  _updateDouble(dt) {
    const src = this.source;
    if (src.disposed) return;
    this.time += dt;
    if (this.followSource) {
      src.root.updateWorldMatrix(true, false);
      if (this.root.parent) {
        this.root.parent.updateWorldMatrix(true, false);
        _m.copy(this.root.parent.matrixWorld).invert().multiply(src.root.matrixWorld);
        _m.decompose(this.root.position, this.root.quaternion, this.root.scale);
      }
      this.inner.position.copy(src.inner.position);
      this.inner.quaternion.copy(src.inner.quaternion);
      for (let i = 0; i < this.boneList.length; i++) {
        const b = this.boneList[i], s = this.srcBones[i];
        b.position.copy(s.position); b.quaternion.copy(s.quaternion); b.scale.copy(s.scale);
      }
    }
    for (const k of ['uFaceA', 'uFaceB', 'uEye', 'uGhost', 'uEyeShape', 'uTwistO', 'uTwistD', 'uGore', 'uGoreW']) this.U[k].value.copy(src.U[k].value);
    // same LOD / mouth geometry as the source (views of the same buffers)
    if (this.body && src.body && this.body.geometry !== src.body.geometry && !src._headSplit) this.body.geometry = src.body.geometry;
    if (this.eyes && src.eyes) this.eyes.visible = src.eyes.visible;
    this.U.uCrush.value = src.U.uCrush.value;
    if (this.isMH) {
      for (const k of ['uGhost2', 'uVeil']) this.U[k].value.copy(src.U[k].value);
      const W = this.U.uMorphW.value;
      W.set(src.U.uMorphW.value);
      // the reflection's own overrides: a wider mouth, wronger proportions, the hair over its face
      const gv = this.ghostLayer.v;
      if (gv.mouthStretch > 0) { W[15] = Math.max(W[15], gv.mouthStretch * 0.9); W[11] = Math.max(W[11], gv.mouthStretch * 0.55); }
      if (gv.uncanny > 0) W[19] = Math.max(W[19], gv.uncanny);
      if (gv.hairOverFace > 0) this.U.uVeil.value.x = Math.max(this.U.uVeil.value.x, gv.hairOverFace);
    }
    this.inner.updateMatrixWorld(true);
    this.ghostLayer.update(dt, true);
    this.ghostLayer.applyPose(dt);
    this.inner.updateMatrixWorld(true);
    this.ghostLayer.applyPost(dt);
    this.headPosition.copy(src.headPosition);
    this.eyePosition.copy(src.eyePosition);
  }

  // ======================================================================= frame update
  update(dt) {
    if (this.disposed) return;
    if (this.isDouble) return this._updateDouble(dt);
    // distance LOD / update throttling (distance scaled by the lens: a zoomed shot keeps detail)
    const cam = engine.camera;
    cam.getWorldPosition(_camPos);
    this.root.getWorldPosition(_v);
    const dist = _v.distanceTo(_camPos);
    const zoom = cam.isPerspectiveCamera ? Math.tan((cam.fov * Math.PI) / 360) / (REF_TAN * (cam.zoom || 1)) : 1;
    const sd = dist * zoom; // "screen distance": metres at the reference field of view
    this._screenDist = sd;
    const lodD = this._lod === 'lo' ? LOD_DISTANCE - 0.75 : LOD_DISTANCE + 0.75;
    this._setLod(sd > lodD ? 'lo' : 'hi');
    this._accDt += dt;
    this._frame++;
    let every = dist < 18 ? 1 : dist < 35 ? 2 : dist < 70 ? 3 : 6;
    // nobody saw it last frame (hidden, culled by every camera incl. the mirrors): pose at ~8 Hz,
    // walking / timers keep their full accumulated time; it snaps back to full rate when it shows
    const shown = this._shownInTree();
    if (!shown || engine.frame - this._drawnFrame > 2) every = Math.max(every, shown ? 6 : 12);
    if (shown && !this._wasShown) every = 1; // just revealed: never show a stale pose
    this._wasShown = shown;
    if (dt > 0 && this._frame % every !== 0) return;
    dt = Math.min(0.25, this._accDt);
    this._accDt = 0;
    this.time += dt;
    const rig = this.rig, t = this.t;
    this.root.updateWorldMatrix(true, false);
    this._updateWalk(dt);
    this._measureSpeed(dt);
    // ---- 1. base: mixer
    rig.restoreBase();
    this.anim.update(dt);
    rig.saveBase();
    // ---- 2. local additive layers
    this.actions.update(dt);
    this.ghostLayer.update(dt, false);
    this._posture(dt);
    this.actions.applyPose(dt);
    this.ghostLayer.applyPose(dt);
    if (this.bodyLean) {
      const I = this.t.index;
      this.rig.addEuler(I.spine_02, this.bodyLean.y * 0.5, 0, this.bodyLean.x * 0.5);
      this.rig.addEuler(I.spine_03, this.bodyLean.y * 0.6, 0, this.bodyLean.x * 0.6);
      this.rig.addEuler(I.Head, -this.bodyLean.y * 0.4, 0, -this.bodyLean.x * 0.5);
    }
    this.inner.position.y = (this.ghostLayer.levitate + (this._yOffset || 0)) / Math.max(0.01, this.root.scale.y);
    this.inner.updateMatrixWorld(true);
    this._rootInv.copy(this.inner.matrixWorld).invert();
    // ---- 3. look-at, IK
    this.actions.applyIK(dt);
    this._extraReqs();
    this._look(dt);
    this._legIK(dt);
    this._armIK(dt);
    // ---- 4. ghost post (twist, roll, jitter, limb breaks), eyes, face
    this.ghostLayer.applyPost(dt);
    this._eyes(dt);
    this._face(dt);
    this._updateMouth(dt);
    this._hair(dt);
    this._heldProps(dt);
    if (this.ghostLayer.v.stutter > 0.01) this._stutter(dt);
    this.inner.updateMatrixWorld(true);
    this._outputs();
  }

  /** stutter-frame motion: hold the whole pose for a few frames, then jump to the live one */
  _stutter(dt) {
    const S = this._stut || (this._stut = { hold: 0, has: false, q: null, p: null });
    const bones = this.rig.bones, n = bones.length;
    if (!S.q) { S.q = new Float32Array(n * 4); S.p = new Float32Array(n * 3); }
    S.hold -= dt;
    if (S.hold <= 0 || !S.has) {
      for (let i = 0; i < n; i++) { bones[i].quaternion.toArray(S.q, i * 4); bones[i].position.toArray(S.p, i * 3); }
      S.has = true;
      S.hold = (0.05 + Math.random() * 0.3) * this.ghostLayer.v.stutter;
    } else {
      for (let i = 0; i < n; i++) { bones[i].quaternion.fromArray(S.q, i * 4); bones[i].position.fromArray(S.p, i * 3); }
    }
  }

  _setLod(l) {
    if (l === this._lod) return;
    this._lod = l;
    if (this.isMH) {
      this.body.geometry = this._mhGeometry();
      this.eyes.visible = l === 'hi';
      if (this.worn) this.worn.visible = l === 'hi';
      return;
    }
    if (l === 'lo' && !this._geoLo) this._geoLo = acquireLookGeometry(this.t, this.look, 'lo');
    this.body.geometry = l === 'lo' ? this._geoLo.geo : this._geoHi.geo;
    this.eyes.visible = l === 'hi';
    if (this.worn) this.worn.visible = l === 'hi';
  }

  /** MakeHuman body geometry for the current LOD / mouth state (all views share the same buffers). */
  _mhGeometry() {
    if (this._lod === 'lo') return personLod(this.person);
    return this._mouthOn ? this.person.geo : personNoMouth(this.person);
  }

  /** true when the root and every ancestor are visible (cheap: a few parents) */
  _shownInTree() {
    for (let o = this.root; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  /**
   * Teeth and tongue only while the mouth can show them: open jaw, talking, a wide smile / sneer,
   * gore at the mouth, a ghost's stretched mouth. Closed (with a short hold so syllables don't
   * flicker) or far away (screen distance > MOUTH_DISTANCE): the draw range stops before them.
   */
  _updateMouth(dt) {
    if (!this.isMH || !this.person) return;
    const W = this.U.uMorphW.value;
    const open = W[11] + W[17] + W[18] + 0.5 * Math.max(W[12], W[13]) + 0.5 * W[15] + 0.3 * W[19];
    const busy = this.faceS.talk || this._gore.cur.bleedMouth > 0 || this._gore.cur.crush > 0 || this.ghostLayer.mouthStretch > 0.01;
    if (open > 0.02 || busy) this._mouthHold = 0.6;
    else this._mouthHold = Math.max(0, this._mouthHold - dt);
    const on = this._mouthHold > 0 && (this._screenDist ?? 0) < MOUTH_DISTANCE;
    this._setMouth(on);
  }
  _setMouth(on) {
    if (on === this._mouthOn) return;
    this._mouthOn = on;
    if (this.isMH && this._lod !== 'lo') this.body.geometry = this._mhGeometry();
  }

  _outputs() {
    const t = this.t;
    const hb = this.rig.bones[t.index.Head];
    _v.set(0, 0.09 / this.headScale, 0.01).applyMatrix4(hb.matrixWorld);
    this.headPosition.copy(_v);
    this.rig.worldPos(t.index.eye_l, _v);
    this.rig.worldPos(t.index.eye_r, _v2);
    this.eyePosition.copy(_v).add(_v2).multiplyScalar(0.5);
    const tw = this.U.uTwistO.value.w;
    if (Math.abs(tw) > 1e-3) {
      // rotate the eye point about the neck axis (post-skin twist)
      this.rig.worldPos(t.index.neck_01, _v3);
      _v4.copy(this.headPosition).sub(_v3).normalize();
      this.eyePosition.sub(_v3).applyAxisAngle(_v4, tw).add(_v3);
    }
  }

  _updateWalk(dt) {
    const w = this.walk;
    if (!w) return;
    const r = this.root;
    const tgt = _v3.copy(w.target);
    if (r.parent) { r.parent.updateWorldMatrix(true, false); tgt.applyMatrix4(_m.copy(r.parent.matrixWorld).invert()); }
    const dx = tgt.x - r.position.x, dz = tgt.z - r.position.z;
    const dist = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz);
    let dy = yaw - r.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    r.rotation.y += dy * (1 - Math.exp(-(w.run ? 7 : 4.5) * dt));
    const facing = Math.cos(dy);
    const slow = smoothstep(0, 0.8, dist);
    const spd = w.speed * slow * clamp(facing * 1.3, 0.12, 1) * (this.ghostLayer.speedMul || 1);
    if (dist > 0.04) {
      const step = Math.min(dist, spd * dt);
      r.position.x += (dx / dist) * step;
      r.position.z += (dz / dist) * step;
      if (this.groundFn) {
        r.updateWorldMatrix(true, false);
        _v.setFromMatrixPosition(r.matrixWorld);
        const gy = this.groundFn(_v.x, _v.z);
        if (Number.isFinite(gy)) r.position.y += gy - _v.y;
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
    this.root.getWorldPosition(_v);
    if (this._hasLast && dt > 0) {
      const sp = Math.min(12, _v.distanceTo(this._lastPos) / dt);
      this.anim.speed = damp(this.anim.speed, sp, 6, dt);
      // footsteps from the locomotion phase
      const a = this.anim.acts.get(this.anim.clip);
      if (a && this.anim.moving > 0.5 && this.onFootstep) {
        const ph = (a.time / a.getClip().duration) % 1;
        const half = ph < 0.5 ? 0 : 1;
        if (this._lastHalf !== undefined && half !== this._lastHalf) this.onFootstep(half ? 'R' : 'L');
        this._lastHalf = half;
      }
    }
    this._lastPos.copy(_v);
    this._hasLast = true;
  }

  // ---- posture: elderly stoop, child, breathing, micro-motion, standing weight shift
  _posture(dt) {
    const rig = this.rig, t = this.t, I = t.index, L = this.look;
    const tm = this.time;
    const old = L.old, mode = this.anim.mode;
    const seated = mode === 'sit' || mode === 'sitCar' || mode === 'drive' || mode === 'ride';
    // elderly stoop: rounded upper back, head forward and up to keep the gaze level
    if (old > 0) {
      rig.addEuler(I.spine_02, 0.1 * old, 0, 0);
      rig.addEuler(I.spine_03, 0.16 * old, 0, 0);
      rig.addEuler(I.neck_01, 0.1 * old, 0, 0);
      rig.addEuler(I.Head, -0.22 * old, 0, 0);
      if (!seated) { rig.addEuler(I.calf_l, 0.08 * old, 0, 0); rig.addEuler(I.calf_r, 0.08 * old, 0, 0); rig.addEuler(I.thigh_l, -0.05 * old, 0, 0); rig.addEuler(I.thigh_r, -0.05 * old, 0, 0); }
      for (const s of ['l', 'r']) rig.addEuler(I['clavicle_' + s], 0.06 * old, 0, 0);
    }
    if (L.child > 0) { rig.addEuler(I.Head, 0.04 * L.child, 0, 0); }
    // the UAL idle stance is wide for everyday Thai passengers: bring the feet under the hips
    if (mode === 'stand') {
      const k = (1 - this.anim.moving) * (this.look.sex === 'f' ? 0.05 : 0.08);
      rig.addEuler(I.thigh_l, 0, 0, -k); rig.addEuler(I.thigh_r, 0, 0, k);
      rig.addEuler(I.foot_l, 0, 0, k); rig.addEuler(I.foot_r, 0, 0, -k);
    }
    // breathing: chest rise, clavicles, subtle belly; faster when afraid
    const fear = this.faceS.expr.fear;
    const br = Math.sin(tm * (1.55 + fear * 1.6 + this.anim.moving * 0.8)) * (1 + fear * 0.6);
    const bAmp = this.ghostLayer.breath;
    rig.addEuler(I.spine_02, -0.012 * br * bAmp, 0, 0);
    rig.addEuler(I.spine_03, -0.016 * br * bAmp, 0, 0);
    rig.addEuler(I.clavicle_l, 0, 0, 0.012 * br * bAmp);
    rig.addEuler(I.clavicle_r, 0, 0, -0.012 * br * bAmp);
    rig.addEuler(I.neck_01, 0.01 * br * bAmp, 0, 0);
    // micro-motion: slow head drift (humans never hold still)
    const still = this.ghostLayer.stillness;
    const n1 = noise.noise2D(tm * 0.21, 3.1 + L.seed % 13), n2 = noise.noise2D(tm * 0.17, 7.7), n3 = noise.noise2D(tm * 0.3, 1.3);
    rig.addEuler(I.Head, n1 * 0.03 * (1 - still), n2 * 0.045 * (1 - still), n3 * 0.02 * (1 - still));
    rig.addEuler(I.spine_03, 0, n2 * 0.015 * (1 - still), n1 * 0.01 * (1 - still));
    // variety: a drunk's slouch, a monk's upright stance, a ghost grandmother's hunch; old hands and heads tremble
    const pst = L.posture;
    if (pst === 'slouch') {
      const sw = noise.noise2D(tm * 0.35, 9.1);
      rig.addEuler(I.spine_02, 0.1, 0, 0); rig.addEuler(I.spine_03, 0.12, 0, sw * 0.05);
      rig.addEuler(I.neck_01, 0.12, 0, 0); rig.addEuler(I.Head, -0.06, 0, sw * 0.08);
      rig.addEuler(I.clavicle_l, 0.08, 0, 0); rig.addEuler(I.clavicle_r, 0.08, 0, 0);
      if (!seated) rig.addEuler(I.pelvis, 0, 0, sw * 0.04);
    } else if (pst === 'upright') {
      rig.addEuler(I.spine_03, -0.05, 0, 0); rig.addEuler(I.Head, 0.02, 0, 0);
    } else if (pst === 'hunch') {
      rig.addEuler(I.spine_01, 0.12, 0, 0); rig.addEuler(I.spine_02, 0.22, 0, 0); rig.addEuler(I.spine_03, 0.3, 0, 0);
      rig.addEuler(I.neck_01, 0.15, 0, 0); rig.addEuler(I.Head, -0.42, 0, 0);
      if (!seated) for (const s of ['l', 'r']) { rig.addEuler(I['thigh_' + s], -0.18, 0, 0); rig.addEuler(I['calf_' + s], 0.32, 0, 0); rig.addEuler(I['foot_' + s], -0.12, 0, 0); }
    }
    const trem = L.tremor || 0;
    if (trem > 0.01 && this.isMH) {
      const k = trem * (0.6 + 0.4 * noise.noise2D(tm * 0.5, 2.2));
      const s1 = Math.sin(tm * 41.0) * 0.5 + Math.sin(tm * 47.3) * 0.5;
      rig.addEuler(I.hand_l, s1 * 0.035 * k, 0, 0); rig.addEuler(I.hand_r, -s1 * 0.03 * k, 0, 0);
      rig.addEuler(I.Head, Math.sin(tm * 37.0) * 0.008 * k, Math.sin(tm * 29.0) * 0.012 * k, 0);
    }
  }

  // ---- look-at (chest / neck / head + eyes)
  _target(tgt, out) {
    if (!tgt) return null;
    if (tgt.isVector3) return out.copy(tgt);
    if (tgt.isObject3D) { tgt.updateWorldMatrix(true, false); return out.setFromMatrixPosition(tgt.matrixWorld); }
    if (tgt.x !== undefined) return out.set(tgt.x, tgt.y, tgt.z);
    return null;
  }
  /** rotation of bone i relative to its rest, in world (maps model rest axes to world) */
  boneFrame(i, out) { this.rig.worldQuat(i, out); return out.multiply(_q3.copy(this.t.Gq[i]).invert()); }

  _look(dt) {
    const L = this.lookS, rig = this.rig, I = this.t.index;
    const has = L.target ? this._target(L.target, L.pos) : null;
    L.w = damp(L.w, has ? L.weight : 0, L.speed, dt);
    L.has = !!has;
    const unl = L.unlimited || this.ghostLayer.unlimitedLook;
    if (has) {
      rig.worldPos(I.Head, _v);
      _v2.copy(L.pos).sub(_v);
      this.boneFrame(I.spine_03, _q).invert();
      _v2.applyQuaternion(_q);
      let yaw = Math.atan2(_v2.x, _v2.z);
      let pitch = Math.atan2(_v2.y, Math.hypot(_v2.x, _v2.z));
      if (!unl) { yaw = clamp(yaw, -1.35, 1.35); pitch = clamp(pitch, -0.8, 0.65); }
      // shortest way round when crossing behind
      let dy = yaw - L.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      const k = 1 - Math.exp(-L.speed * dt);
      L.yaw += dy * k;
      L.pitch += (pitch - L.pitch) * k;
    } else { L.yaw = damp(L.yaw, 0, 3, dt); L.pitch = damp(L.pitch, 0, 3, dt); }
    this.ghostLayer.lookTwist = 0;
    if (L.w < 0.002 || L.eyesOnly) return;
    let yaw = L.yaw * L.w, pitch = L.pitch * L.w;
    // beyond human limits the excess becomes the ghost's neck twist (no shoulder motion)
    if (unl && Math.abs(yaw) > 1.2) { this.ghostLayer.lookTwist = (Math.abs(yaw) - 1.2) * Math.sign(yaw); yaw = 1.2 * Math.sign(yaw); }
    const chestY = unl ? 0 : clamp(yaw * 0.15, -0.25, 0.25);
    // smoothed look direction (world) from the chest frame
    this.boneFrame(I.spine_03, _q);
    const cp = Math.cos(pitch);
    const dir = _vd.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).applyQuaternion(_q);
    this._rotYawPitch(I.spine_03, chestY, pitch * 0.08);
    for (const [i, share] of [[I.neck_01, 0.42], [I.Head, 1]]) {
      this.boneFrame(i, _q);
      _v.copy(dir).applyQuaternion(_q2.copy(_q).invert());
      const by = Math.atan2(_v.x, _v.z), bp = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
      this._rotYawPitch(i, by * share * L.w, bp * share * L.w * (i === I.Head ? 0.85 : 1));
    }
  }
  _rotYawPitch(i, y, p) {
    const rig = this.rig;
    this.boneFrame(i, _q);
    _v.copy(Y).applyQuaternion(_q);
    _q2.setFromAxisAngle(_v, y);
    rig.rotateWorld(i, _q2);
    rig.update(i);
    this.boneFrame(i, _q);
    _v.copy(X).applyQuaternion(_q);
    _q2.setFromAxisAngle(_v, -p);
    rig.rotateWorld(i, _q2);
    rig.update(i);
  }

  _eyes(dt) {
    const L = this.lookS, rig = this.rig, t = this.t, I = t.index;
    let ty = 0, tp = 0;
    if (L.has && L.w > 0.01) {
      rig.worldPos(I.eye_l, _v).add(rig.worldPos(I.eye_r, _v2)).multiplyScalar(0.5);
      _v2.copy(L.pos).sub(_v);
      this.boneFrame(I.Head, _q).invert();
      _v2.applyQuaternion(_q);
      const lim = this.ghostLayer.unlimitedLook ? 0.9 : 0.6;
      ty = clamp(Math.atan2(_v2.x, _v2.z), -lim, lim) * L.w;
      tp = clamp(Math.atan2(_v2.y, Math.hypot(_v2.x, _v2.z)), -0.5, 0.42) * L.w;
    } else {
      // idle saccades: fixations with quick jumps
      L.sacT -= dt;
      if (L.sacT <= 0) { L.sacT = 0.4 + Math.random() * 2.2; L.sacY = (Math.random() - 0.5) * 0.35; L.sacP = (Math.random() - 0.5) * 0.18 - 0.03; }
      ty = L.sacY; tp = L.sacP;
    }
    if (this.ghostLayer.stare > 0) { ty *= 1 - this.ghostLayer.stare; tp *= 1 - this.ghostLayer.stare; }
    const k = 1 - Math.exp(-30 * dt);
    L.eyeYaw += (ty - L.eyeYaw) * k;
    L.eyePitch += (tp - L.eyePitch) * k;
    _e.set(-L.eyePitch, L.eyeYaw, 0, 'YXZ');
    _q.setFromEuler(_e);
    for (const n of ['eye_l', 'eye_r']) {
      const b = rig.bones[I[n]];
      b.quaternion.copy(t.restQuat[I[n]]).multiply(_q);
    }
  }

  /** player / external per-frame requests: reach for a control, hold an item in view */
  _extraReqs() {
    const R = this.reachReq;
    if (R && R.w > 0.001) {
      const cur = this.req[R.side];
      if (!cur || cur.w < R.w) {
        this.boneFrame(this.t.index.spine_03, _q);
        const along = _v.set(R.side === 'L' ? 0.3 : -0.3, -0.1, 1).normalize().applyQuaternion(_q).clone();
        const palm = _v2.set(0, -0.3, 1).normalize().applyQuaternion(_q).clone();
        this.req[R.side] = { w: R.w, pos: R.pos.clone(), along, palm, fingers: R.fingers };
      }
    }
    const H = this.holdReq;
    if (H) {
      const I = this.t.index;
      this.boneFrame(I.spine_03, _q);
      const pt = (x, y, z) => this.rig.worldPos(I.spine_03, new THREE.Vector3()).add(_v.set(x, y, z).multiplyScalar(this.scale).applyQuaternion(_q));
      const dir = (x, y, z) => new THREE.Vector3(x, y, z).normalize().applyQuaternion(_q);
      if (H.at === 'read') this.req.L = { w: 1, pos: pt(0.02, 0.22, 0.36), along: dir(-0.1, 0.9, -0.2), palm: dir(0, 0.2, -1), fingers: 'pinch' };
      else if (H.at === 'clasp') this.req.R = { w: 1, pos: pt(-0.02, 0.1, 0.24), along: dir(0.2, 0.9, 0.2), palm: dir(0.8, 0, -0.2), fingers: 'grip' };
      else this.req[H.side] = { w: 1, pos: pt(-0.08, 0.02, 0.34), along: dir(0, 0.3, 1), palm: dir(0, 1, 0.2), fingers: 'pinch' };
    }
  }

  // ---- IK
  _legIK(dt) {
    const rig = this.rig;
    for (const s of ['L', 'R']) {
      const slot = this.ik.foot[s];
      const req = this.req['F' + s];
      const ext = slot.target ? this._target(slot.target, slot.pos) : null;
      slot.w = damp(slot.w, ext ? slot.weight : 0, 1 / Math.max(0.05, slot.blend), dt);
      let w = slot.w, pos = ext ? slot.pos : null;
      if (req && req.w > 0.001) { pos = req.pos; w = Math.max(w, req.w); }
      if (!pos || w < 0.002) continue;
      const ch = this.chains['F' + s];
      rig.worldPos(ch.ia, _v);
      // knee forward (character forward) and slightly outward
      this.boneFrame(this.t.index.pelvis, _q);
      _v2.set(s === 'L' ? 0.08 : -0.08, -0.2, 0.6).applyQuaternion(_q).add(_v);
      if (req?.pole) _v2.copy(req.pole);
      solveTwoBone(rig, ch, pos, _v2, w, this.scale);
      if (req?.footFwd) setEndRotation(rig, this.footBasis[s], req.footFwd, req.footUp || _v3.set(0, 1, 0), w);
      else if (slot.orient && slot.target?.isObject3D && ext) {
        slot.target.getWorldQuaternion(_q);
        _v3.set(0, 0, -1).applyQuaternion(_q);
        _v4.set(0, 1, 0).applyQuaternion(_q);
        setEndRotation(rig, this.footBasis[s], _v3, _v4, w);
      }
    }
  }

  _armIK(dt) {
    const rig = this.rig, I = this.t.index;
    for (const s of ['L', 'R']) {
      const slot = this.ik.hand[s];
      const req = this.req[s];
      const ext = slot.target ? this._target(slot.target, slot.pos) : null;
      slot.w = damp(slot.w, ext ? slot.weight : 0, 1 / Math.max(0.05, slot.blend), dt);
      slot.gripW = damp(slot.gripW, ext ? slot.grip : 0, 8, dt);
      let w = slot.w, pos = ext ? slot.pos : null, along = slot.along, palm = slot.palm, pole = slot.pole ? this._target(slot.pole, _v4) : null;
      if (ext && slot.orient && !along && slot.target.isObject3D) {
        slot.target.getWorldQuaternion(_q);
        along = _va[s].set(0, 0, -1).applyQuaternion(_q);
        palm = _vp[s].set(0, -1, 0).applyQuaternion(_q);
      }
      let grip = slot.gripW, fingers = slot.fingers;
      if (req && req.w > 0.001) {
        if (!pos || req.w >= w) { pos = req.pos; along = req.along; palm = req.palm; pole = req.pole || null; fingers = req.fingers || null; grip = req.grip ?? 0; }
        w = Math.max(w, req.w);
      }
      if (pos && w > 0.002) {
        const ch = this.chains[s];
        // wrist target: back off from the grip point along the hand
        _v.copy(pos);
        if (along) {
          const hl = 0.085 * this.scale;
          _v.addScaledVector(along, -hl);
          if (palm) _v.addScaledVector(palm, -0.02 * this.scale);
        }
        if (!pole) {
          this.boneFrame(I.spine_03, _q);
          rig.worldPos(ch.ia, _v2);
          _v3.set(s === 'L' ? 0.4 : -0.4, -0.5, -0.35).applyQuaternion(_q).add(_v2);
          pole = _v3;
        }
        solveTwoBone(rig, ch, _v, pole, w, this.scale);
        if (along && palm) setEndRotation(rig, this.handBasis[s], along, palm, w);
      }
      if (grip > 0.01 || fingers) this._fingers(s, fingers || 'grip', grip || (req?.w ?? 1), req?.phase || 0);
    }
  }

  /** finger poses (additive local curls). preset: grip | point | flat | wai | cig | beckon | spread | claw */
  _fingers(s, preset, w, phase = 0) {
    const rig = this.rig, I = this.t.index;
    const sx = s === 'L' ? 1 : -1;
    const ax = _fa[s] || (_fa[s] = new THREE.Vector3(0, 0, -sx));
    const curl = (f, a1, a2, a3) => {
      const n = (k) => I[`${f}_0${k}_${s.toLowerCase()}`];
      rig.addAxis(n(1), ax, a1 * w); rig.addAxis(n(2), ax, a2 * w); rig.addAxis(n(3), ax, a3 * w);
    };
    const thumb = (a1, a2, a3) => {
      const n = (k) => I[`thumb_0${k}_${s.toLowerCase()}`];
      const tax = _ta[s] || (_ta[s] = new THREE.Vector3(sx * 0.6, 0.2, 0.4).normalize());
      rig.addAxis(n(1), tax, a1 * w); rig.addAxis(n(2), ax, a2 * w); rig.addAxis(n(3), ax, a3 * w);
    };
    const F = ['index', 'middle', 'ring', 'pinky'];
    switch (preset) {
      case 'grip': for (const f of F) curl(f, 1.05, 1.25, 0.8); thumb(0.5, 0.4, 0.4); break;
      case 'point': curl('index', -0.05, -0.05, 0); for (const f of F.slice(1)) curl(f, 1.3, 1.4, 0.9); thumb(0.4, 0.5, 0.4); break;
      case 'flat': case 'wai': for (const f of F) curl(f, -0.15, -0.15, -0.1); thumb(-0.1, -0.1, 0); break;
      case 'cig': curl('index', 0.25, 0.2, 0.1); curl('middle', 0.3, 0.25, 0.1); curl('ring', 1.1, 1.2, 0.8); curl('pinky', 1.2, 1.2, 0.8); thumb(0.3, 0.3, 0.2); break;
      case 'beckon': {
        const b = 0.5 + 0.5 * Math.sin(phase);
        for (const f of F) curl(f, 0.3 + b * 0.9, 0.3 + b * 0.8, 0.2 + b * 0.5);
        thumb(0.2, 0.2, 0.1);
        break;
      }
      case 'spread': for (const f of F) curl(f, -0.3, -0.2, -0.1); break;
      case 'claw': for (const f of F) curl(f, 0.3, 0.9, 1.0); thumb(0.3, 0.5, 0.6); break;
      case 'pinch': curl('index', 0.6, 0.6, 0.4); for (const f of F.slice(1)) curl(f, 0.9, 1.0, 0.7); thumb(0.5, 0.3, 0.3); break;
      default: break;
    }
  }

  // ---- face: blink, talk jaw, expressions -> shader uniforms
  _face(dt) {
    const F = this.faceS, ex = F.expr, U = this.U;
    const ao = this.actions.out;
    for (const k in ex) ex[k] = damp(ex[k], (this.expression[k] || 0) + (k === 'sad' ? ao.sad : k === 'creepy' ? ao.creepy : 0), 6, dt);
    const nerv = ex.fear * 0.8 + (this.anim.mode === 'run' ? 0.3 : 0);
    let blink = 0;
    if (!this.look.noBlink && !this.ghostLayer.noBlink) {
      F.blinkT -= dt;
      if (F.blinkT <= 0 && F.blinking <= 0) {
        F.blinking = 1e-4;
        F.blinkT = (1.8 + Math.random() * 4.2) / (1 + nerv * 2);
        if (Math.random() < 0.12) F.blinkT = 0.3;
      }
    }
    if (F.blinking > 0) {
      F.blinking += dt;
      const u = F.blinking / 0.17;
      blink = u < 0.38 ? Math.sin((u / 0.38) * Math.PI / 2) : Math.max(0, 1 - (u - 0.38) / 0.62) ** 1.5;
      if (u >= 1) F.blinking = 0;
    }
    // jaw: syllables while talking
    let jt = 0;
    if (F.talk) {
      F.talkT -= dt;
      if (F.talkT <= 0) {
        F.talkT = 0.07 + Math.random() * 0.13;
        F.jawT = Math.random() < 0.16 ? 0.03 : (0.25 + Math.random() * 0.75) * F.amp;
      }
      jt = F.jawT;
    }
    jt = Math.max(jt, ex.surprise * 0.55, ex.fear * 0.22) + (this.actions.jaw || 0);
    F.jaw = damp(F.jaw, jt, 20, dt);
    const lidDown = clamp(-this.lookS.eyePitch * 1.1, 0, 0.35); // upper lids follow a downward gaze
    const wide = clamp(ex.fear + ex.surprise * 0.8 + ex.creepy * 0.5 + this.ghostLayer.stare * 0.6, 0, 1);
    const squint = clamp(ex.smile * 0.45 + ex.anger * 0.5 + this.actions.squint, 0, 1);
    const closed = clamp(Math.max(blink, F.closed, this.actions.eyesClosed || 0), 0, 1);
    const open = (1 - closed) * (1 - lidDown) * (1 - squint * 0.3);
    U.uEye.value.set(open, open, squint, wide * (1 - closed));
    const rest = this.look.face.smile || 0;
    U.uFaceA.value.set(F.jaw, clamp(ex.smile + rest * 0.35 + (this.actions.smile || 0), 0, 1.3), clamp(ex.sad * 0.9 + ex.anger * 0.3 + ex.fear * 0.25, 0, 1), this.ghostLayer.mouthStretch);
    // gore: blood runs grow at a rate (seconds), crush is a shape change
    const G = this._gore;
    for (const k in G.tgt) { const d = G.tgt[k] - G.cur[k]; G.cur[k] += Math.sign(d) * Math.min(Math.abs(d), dt * (k === 'crush' ? 3 : G.speed)); }
    U.uGore.value.set(G.cur.bleedEyes, G.cur.bleedMouth, G.wound ? G.cur.amount : 0, settings.get('gore') === 'reduced' ? 1 : 0);
    U.uCrush.value = G.cur.crush;
    U.uFaceB.value.set(clamp(ex.surprise + ex.fear * 0.6 + (this.actions.brow || 0), 0, 1.2), clamp(ex.anger + ex.creepy * 0.2, 0, 1), clamp(ex.sad + ex.fear * 0.7, 0, 1), clamp(ex.creepy, 0, 1.2));
    if (this.isMH) this._mhFace(dt, closed, lidDown, squint, wide);
  }

  /** MakeHuman face: per-eye blinks (desync), expressions -> morph channels, ghost skin / eyes / veil uniforms */
  _mhFace(dt, closed, lidDown, squint, wide) {
    const F = this.faceS, ex = F.expr, U = this.U, gl = this.ghostLayer, gv = gl.v;
    let bL = closed, bR = closed;
    const des = clamp(gv.blinkDesync, 0, 1);
    if (des > 0.01) {
      // the right eye keeps its own, slower blink: sometimes only one eye closes
      F.b2T = (F.b2T ?? 1.5) - dt;
      if (F.b2T <= 0 && !(F.b2 > 0)) { F.b2 = 1e-4; F.b2T = (1.2 + Math.random() * 5) / (0.5 + des); F.b2Dur = 0.17 + Math.random() * 0.6 * des; }
      let b2 = 0;
      if (F.b2 > 0) {
        F.b2 += dt;
        const u = F.b2 / F.b2Dur;
        b2 = u < 0.4 ? Math.sin((u / 0.4) * Math.PI / 2) : Math.max(0, 1 - (u - 0.4) / 0.6);
        if (u >= 1) F.b2 = 0;
      }
      const forced = Math.max(F.closed, this.actions.eyesClosed || 0);
      bR = Math.max(forced, bR * (1 - des), b2);
    }
    if (F.talk && F.talkT > (F._lastTalkT ?? 0)) F.syl = (F.syl || 0) + 1;
    F._lastTalkT = F.talkT;
    const A = U.uFaceA.value, B = U.uFaceB.value;
    driveMHFace(U, {
      blinkL: bL, blinkR: bR, lidDown: clamp(lidDown / 0.35, 0, 1) * 0.8, squint, wide,
      jaw: A.x, smile: A.y, frown: A.z, stretch: A.w, browRaise: B.x, browFurrow: B.y, browSad: B.z, creepy: B.w,
      fear: ex.fear, anger: ex.anger, talk: F.talk, syl: F.syl || 0, uncanny: gv.uncanny,
    });
    const b = this._mhBase || { veins: 0, pupils: 0, veil: 0 };
    U.uGhost2.value.x = b.veins + gv.veins;
    U.uGhost2.value.y = gl.set.has('pupils') ? gv.pupils : b.pupils;
    U.uVeil.value.x = Math.max(b.veil, gv.hairOverFace);
    const gap = gv.veilGap;
    U.uVeil.value.y = -gap * 0.033;
    U.uVeil.value.z = Math.abs(gap) > 0.05 ? 0.015 * Math.min(1, Math.abs(gap)) : 0;
  }

  // ---- hair springs (verlet tips) on the hair chains
  _hair(dt) {
    if (!this.hairOn || dt <= 0) return;
    const rig = this.rig, t = this.t;
    const g = _v4.set(0, -9.8, 0);
    const sub = Math.min(4, Math.ceil(dt / 0.016));
    const h = dt / sub;
    for (const sp of this.hairSprings) {
      const b = rig.bones[sp.i];
      b.updateMatrixWorld(true);
      // rest tip: 12 cm along the bone's rest "down" (model -Y) in its current frame
      this.boneFrame(sp.i, _q);
      rig.worldPos(sp.i, _v);
      _v2.set(0, -0.12 * this.scale, -0.01 * this.scale).applyQuaternion(_q).add(_v); // rigid tip
      if (!sp.init) { sp.tip.copy(_v2); sp.vel.set(0, 0, 0); sp.init = true; }
      for (let k = 0; k < sub; k++) {
        // spring to the rigid tip + gravity + damping
        _v3.copy(_v2).sub(sp.tip).multiplyScalar(60);
        sp.vel.addScaledVector(_v3, h).addScaledVector(g, h * 0.25);
        sp.vel.multiplyScalar(Math.exp(-6 * h));
        sp.tip.addScaledVector(sp.vel, h);
        // keep the length
        _v3.copy(sp.tip).sub(_v);
        const len = 0.12 * this.scale;
        sp.tip.copy(_v).addScaledVector(_v3.normalize(), len);
      }
      // rotate the bone so its rest tip points at the simulated tip
      _v3.copy(_v2).sub(_v).normalize();
      const d2 = _q2.setFromUnitVectors(_v3, sp.tip.clone().sub(_v).normalize());
      rig.rotateWorld(sp.i, d2);
    }
    void t;
  }

  _heldProps(dt) {
    for (const k in this.held) {
      const h = this.held[k];
      if (!h.hang) continue;
      // hanging props keep their own "down" (damped pendulum) instead of rotating rigidly with the hand
      h.grip.getWorldQuaternion(_q);
      _v.set(0, -1, 0).applyQuaternion(_q);
      _q2.setFromUnitVectors(_v, _v2.set(0, -1, 0));
      _q3.copy(_q).invert().multiply(_q2).multiply(_q);
      h.mesh.quaternion.slerp(_q3, dt > 0 ? 1 - Math.exp(-7 * dt) : 1);
    }
  }
}

const _vd = new THREE.Vector3();
const _va = { L: new THREE.Vector3(), R: new THREE.Vector3() }, _vp = { L: new THREE.Vector3(), R: new THREE.Vector3() };
const _fa = {}, _ta = {};

/** pelvis model position at the start of a clip (template units) */
function pelvisOf(clip, t) {
  const out = new THREE.Vector3().copy(t.Gp[t.index.pelvis]);
  if (!clip) return out;
  const tr = clip.tracks.find((x) => x.name === 'pelvis.position');
  if (!tr) return out;
  // pelvis local position is in the root bone frame (Z-up); convert with the root's rest rotation
  const p = new THREE.Vector3(tr.values[0], tr.values[1], tr.values[2]);
  const ri = t.parent[t.index.pelvis];
  return p.applyQuaternion(t.Gq[ri]).add(t.Gp[ri]);
}
