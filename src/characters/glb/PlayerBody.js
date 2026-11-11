// First-person player body on the GLB humanoid (PlayerBody API of src/characters).
//   eye   Object3D at the (smoothed) eye point: cameraRig.attach(player.eye, player.base)
//   base  yaw frame for the camera: world-aligned on foot, the seat's frame in a vehicle
//   mode  'foot' | 'taxi' | 'bike'
// The head, hair and eyes are a separate draw on LAYERS.PLAYER_HEAD (never seen by the
// first-person camera, visible in mirrors); the rest of the body is on DEFAULT.
import * as THREE from 'three';
import { engine } from '../../core/Engine.js';
import { input } from '../../core/Input.js';
import { cameraRig } from '../../core/CameraRig.js';
import { colliders } from '../../core/Colliders.js';
import { bus } from '../../core/Events.js';
import { LAYERS } from '../../core/layers.js';
import { clamp, damp, smoothstep } from '../../core/math.js';
import { HumanoidGLB } from './Humanoid.js';
import { PRESETS } from '../Presets.js';
import { noMouthView } from './mhperson.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();

/** split a skinned look geometry into head (Head/neck dominated + hair) and body index ranges */
function splitHead(geo, t) {
  if (geo.userData.headSplit) return geo.userData.headSplit;
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, part = geo.attributes.apart;
  const head = new Set([t.index.Head, t.index.neck_01, t.index.eye_l, t.index.eye_r, ...['hair_1', 'hair_2', 'hair_3', 'hairL_1', 'hairL_2', 'hairR_1', 'hairR_2'].map((n) => t.index[n])]);
  const hw = (i) => { let w = 0; for (let k = 0; k < 4; k++) if (head.has(si.getComponent(i, k))) w += sw.getComponent(i, k); return w; };
  // first-person body (the proven FPS cut): everything above the CHEST LINE goes with the head (mirrors
  // only): head, neck, shoulders, upper chest and back, and the upper arms out to their midpoint. The arms
  // from mid-upper-arm down, the hands, the lower torso, legs and feet stay. One clean region test in the
  // bind pose (T-pose, arms along ±X): no partial caps, nothing pops in or out with the pose.
  const pos = geo.attributes.position;
  const ua = t.Gp[t.index.upperarm_l], la = t.Gp[t.index.lowerarm_l], sp3 = t.Gp[t.index.spine_03];
  const chestY = sp3 ? sp3.y + 0.035 : 1.36;
  const midArmX = ua && la ? Math.abs(ua.x) + 0.5 * Math.abs(la.x - ua.x) : 0.3;
  const sh = (i) => (pos.getY(i) > chestY && Math.abs(pos.getX(i)) < midArmX ? 1 : 0);
  const idx = geo.index.array;
  const A = [], B = [], M = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const pa = part ? part.getX(a) : 0;
    const isHead = (part && pa > 1.5) || (hw(a) + hw(b) + hw(c)) / 3 > 0.5 || sh(a) + sh(b) + sh(c) >= 2;
    // teeth (5) / tongue (6) last in the head, so a closed mouth draws less
    (isHead ? (pa > 4.5 && pa < 6.5 ? M : A) : B).push(a, b, c);
  }
  const mk = (arr) => { const g = new THREE.BufferGeometry(); for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]); g.setIndex(arr); g.boundingSphere = geo.boundingSphere; return g; };
  const headGeo = mk(A.concat(M));
  headGeo.userData.mouthStart = A.length;
  geo.userData.headSplit = { head: headGeo, headNoMouth: noMouthView(headGeo), body: mk(B) };
  return geo.userData.headSplit;
}

/** Height (seat-local y) of the cabin ceiling above a seat: the first cabin surface straight above it. */
function cabinCeiling(vehicle, seat) {
  try {
    seat.updateWorldMatrix(true, false);
    const o = seat.localToWorld(new THREE.Vector3(0, 0.45, 0));
    const up = new THREE.Vector3(0, 1, 0).transformDirection(seat.matrixWorld);
    const meshes = vehicle.cabinSurfaces ? vehicle.cabinSurfaces() : [];
    const hit = meshes.length ? new THREE.Raycaster(o, up, 0.15, 1.2).intersectObjects(meshes, false)[0] : null;
    if (hit) return seat.worldToLocal(hit.point.clone()).y;
    const roof = vehicle.anchors?.roofTop;
    if (roof) return seat.worldToLocal(roof.getWorldPosition(new THREE.Vector3())).y - 0.08; // outer roof - roof + headliner
  } catch (e) {
    /* no ceiling: no adjustment */
  }
  return null;
}

export class PlayerBodyGLB {
  constructor(spec = {}) {
    // Ton is an average Thai man (about 1.70 m): taller bodies put his hair through the taxi's roof
    const look = { ...PRESETS.ton, id: 'player', ...spec };
    look.height = Math.min(look.height ?? 1.7, 1.7);
    // Ton's own high-top sneakers (sneakers.js: an original, unbranded design)
    look.accessories = [...new Set([...(look.accessories || []), 'sneakers'])];
    this.humanoid = new HumanoidGLB(look);
    const h = this.humanoid;
    this.root = h.root;
    this.base = new THREE.Object3D();
    this.base.name = 'player-base';
    this.eye = new THREE.Object3D();
    this.eye.name = 'player-eye';
    this.base.add(this.eye);
    this.mode = 'foot';
    this.held = null;
    this.walkEnabled = false;
    this.speed = 0;
    this.groundFn = null;
    this.surfaceFn = null;
    this.vehicle = null;
    this._eyeS = new THREE.Vector3();
    this._eyeInit = false;
    this._acc = { v: new THREE.Vector3(), last: new THREE.Vector3(), has: false, lean: new THREE.Vector2(), vel: new THREE.Vector2() };
    this._reach = null;
    this._stepPhase = 0;
    // head on PLAYER_HEAD: split the body draw (from the full merged geometry, mouth included)
    const sp = splitHead(h.person ? h.person.geo : h.body.geometry, h.t);
    h.body.geometry = sp.body;
    h._headSplit = true;
    this.headMesh = new THREE.SkinnedMesh(h._mouthOn ? sp.head : sp.headNoMouth, h.materials.body);
    this.headMesh.name = 'player-head';
    this.headMesh.bind(h.rig.skeleton, new THREE.Matrix4());
    // mirrors only: culled with the character's fixed bind-pose sphere
    this.headMesh.boundingSphere = h._cullSphere || null;
    this.headMesh.frustumCulled = !!h._cullSphere;
    h._setMouth = (on) => {
      if (on === h._mouthOn) return;
      h._mouthOn = on;
      this.headMesh.geometry = on ? sp.head : sp.headNoMouth;
    };
    this.headMesh.castShadow = true;
    h.inner.add(this.headMesh);
    h._setLod = () => {}; // the player is always full detail
    h.noThrottle = true; // the first-person camera rides on his head bone: always posed at full rate
    this.headMesh.layers.set(LAYERS.PLAYER_HEAD);
    h.eyes.layers.set(LAYERS.PLAYER_HEAD);
    if (h.worn) h.worn.layers.set(LAYERS.PLAYER_HEAD);
    h.body.frustumCulled = false;
    // the first-person body draws FRONT faces only: looking down past the chest-line cut never shows the
    // inside of the torso or the sleeves (the head mesh keeps the double-sided material for its hair)
    const fpMat = h.materials.body.clone();
    fpMat.onBeforeCompile = h.materials.body.onBeforeCompile;
    fpMat.customProgramCacheKey = h.materials.body.customProgramCacheKey;
    fpMat.side = THREE.FrontSide;
    fpMat.userData = { ...h.materials.body.userData };
    h.materials.fpBody = fpMat;
    h.body.material = fpMat;
    this._off = engine.onUpdate((dt) => this.update(dt), 15);
    // eye point relative to the head bone (between the eyes, slightly forward)
    this._eyeLocal = new THREE.Vector3();
    {
      const t = h.t, hb = t.index.Head;
      const mid = t.eyeCenters[0].clone().add(t.eyeCenters[1]).multiplyScalar(0.5);
      mid.z += 0.012;
      this._eyeLocal.copy(mid).sub(t.Gp[hb]).applyQuaternion(t.Gq[hb].clone().invert()).multiplyScalar(1 / h.headScale);
      // the same offset in the body's look frame (x right, y up, -z forward; model space faces +Z)
      const o = mid.clone().sub(t.Gp[hb]).multiplyScalar(h.scale);
      this._eyeOff = new THREE.Vector3(-o.x, o.y, -o.z);
    }
    this._placeBase();
  }

  // ---------------------------------------------------------------- API
  setGroundFn(fn) { this.groundFn = fn; this.humanoid.setGroundFn(fn); }
  setSurfaceFn(fn) { this.surfaceFn = fn; }
  setWalkEnabled(b) { this.walkEnabled = !!b; if (!b && this.mode === 'foot') this.humanoid.setMode('stand'); }
  setPosition(pos, yaw = 0) {
    if (this.mode !== 'foot') this.exitVehicle();
    this.root.position.copy(pos);
    this.root.rotation.set(0, yaw, 0);
    this._eyeInit = false;
    this._placeBase();
  }

  enterVehicle(vehicle) {
    const h = this.humanoid;
    const A = vehicle.anchors || {};
    this.vehicle = vehicle;
    const bike = vehicle.kind === 'bike' || vehicle.kind === 'motorcycle' || (!A.driverSeat && A.seat);
    this.mode = bike ? 'bike' : 'taxi';
    const seat = bike ? A.seat : A.driverSeat;
    if (!seat) return;
    h.sitAt(seat, { pose: bike ? 'ride' : 'drive', blend: 0.6, back: bike ? 0.0 : 0.02 });
    seat.add(this.base);
    this.base.position.set(0, 0, 0);
    this.base.quaternion.identity();
    this._grips = [];
    if (!bike) {
      // steering grips at ~9:15, children of the spinning wheel so the hands turn it
      const anchor = A.steeringWheel;
      const spin = vehicle.parts?.steering?.spin || A.hornPad?.parent || anchor;
      const R = vehicle.steeringRadius ?? 0.19; // the taxi measures its modelled rim
      // wheel frame: XY = rim plane. Which way +Z faces differs between models (the GLB binder points
      // it into the dash), so take the driver's side from the eye / seat position, not a convention
      spin.updateWorldMatrix(true, false);
      const eyeW = A.driverEye ? A.driverEye.getWorldPosition(new THREE.Vector3()) : seat.localToWorld(new THREE.Vector3(0, 0.7, 0));
      const toDriver = Math.sign(spin.worldToLocal(eyeW).z) || 1; // +1: +Z faces the driver
      for (const [side, ang] of [['L', Math.PI + 0.32], ['R', -0.32]]) {
        const g = new THREE.Object3D();
        g.name = 'grip' + side;
        spin.add(g);
        // the grip point is the rim's centreline: the palm closes on it, the fingers wrap over the top
        // of the rim toward the dash
        g.position.set(Math.cos(ang) * R, Math.sin(ang) * R, 0);
        const radial = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0);
        const along = new THREE.Vector3(0, 0, -toDriver).addScaledVector(radial, -0.25).add(new THREE.Vector3(0, 0.55, 0)).normalize(); // fingers wrap forward/up
        const palm = radial.clone().multiplyScalar(-1).add(new THREE.Vector3(0, 0, -0.35 * toDriver)).normalize(); // palm toward the rim/centre
        const z = along.clone().negate(), y = palm.clone().negate();
        const x = new THREE.Vector3().crossVectors(y, z).normalize();
        y.crossVectors(z, x);
        g.quaternion.setFromRotationMatrix(_m.makeBasis(x, y, z));
        this._grips.push(g);
        h.setHandTarget(side, g, { grip: 1, blend: 0.35 });
      }
      if (A.pedalThrottle) h.setFootTarget('R', A.pedalThrottle, { blend: 0.4, orient: false });
      if (A.pedalClutch) h.setFootTarget('L', A.pedalClutch, { blend: 0.4, orient: false });
      // head clearance: measure the headliner above the seat; once seated, the hips settle into the
      // cushion until his hair clears it by 5 cm (see _seatClearance)
      this._seatFit = { base: h.root.position.y, baseZ: h.root.position.z, drop: 0, target: 0, t: 0, slide: 0, slideT: 0, ceil: cabinCeiling(vehicle, seat) };
    } else {
      for (const [side, k] of [['L', 'handleL'], ['R', 'handleR']]) {
        if (!A[k]) continue;
        const g = new THREE.Object3D();
        A[k].add(g);
        const along = new THREE.Vector3(side === 'L' ? 0.25 : -0.25, -0.55, -0.8).normalize();
        const palm = new THREE.Vector3(0, -1, 0.35).normalize();
        const z = along.clone().negate(), y = palm.clone().negate();
        const x = new THREE.Vector3().crossVectors(y, z).normalize();
        y.crossVectors(z, x);
        g.quaternion.setFromRotationMatrix(_m.makeBasis(x, y, z));
        this._grips.push(g);
        h.setHandTarget(side, g, { grip: 1, blend: 0.3 });
      }
      if (A.footL) h.setFootTarget('L', A.footL, { orient: false });
      if (A.footR) h.setFootTarget('R', A.footR, { orient: false });
    }
    this._eyeInit = false;
  }

  exitVehicle() {
    const h = this.humanoid;
    if (!this.vehicle) return;
    this._seatFit = null;
    for (const g of this._grips || []) g.removeFromParent();
    this._grips = [];
    for (const s of ['L', 'R']) { h.setHandTarget(s, null); h.setFootTarget(s, null); }
    h.detach(engine.scene);
    this.root.position.y = this.groundFn ? this.groundFn(this.root.position.x, this.root.position.z) : 0;
    h.setMode('stand');
    this.mode = 'foot';
    this.vehicle = null;
    this._placeBase();
    this._eyeInit = false;
  }

  /** Reach for a control / object; resolves when the hand arrives (then returns to the wheel). */
  reach(target, opts = {}) {
    const side = opts.hand || (this.mode === 'taxi' ? 'L' : 'R');
    return new Promise((resolve) => {
      if (this._reach) this._reach.resolve(false);
      this._reach = { target, side, t: 0, dur: opts.duration ?? 0.42, hold: opts.hold ?? 0.25, resolve, done: false, press: opts.press !== false };
    });
  }

  /** Hold an item in front of the body ('paper','amulet','keys','coffee','coins','garland'); null = put away. */
  hold(item) {
    const h = this.humanoid;
    if (this.held && this.held !== item) h.dropItem(this.held);
    this.held = item || null;
    if (item) h.holdItem(item, item === 'paper' ? 'L' : 'R');
    bus.emit('player:hold', { item: this.held });
    if (item === 'amulet') bus.emit('amulet:hold', { active: true });
  }

  /** Wipe condensation at a world point (hand flat, circling); resolves when done. */
  wipe(point, opts = {}) {
    return new Promise((resolve) => {
      this._wipe = { point: point.clone ? point.clone() : new THREE.Vector3(point.x, point.y, point.z), t: 0, dur: opts.duration ?? 1.3, side: opts.hand || 'R', resolve };
    });
  }

  dispose() { this._off?.(); this.base.removeFromParent(); this.humanoid.dispose(); }

  // ---------------------------------------------------------------- update (order 15, before the humanoid)
  update(dt) {
    const h = this.humanoid;
    this._dt = dt;
    if (this.mode === 'foot') {
      this._footController(dt);
      this._footLookDown(dt);
    } else this._vehicleReactions(dt);
    if (this.mode === 'taxi') this._seatClearance(dt);
    this._actionsUpdate(dt);
    // head follows the camera look (the body follows the camera on foot)
    const lookPt = _v.copy(cameraRig.lookDirection || _v2.set(0, 0, -1)).multiplyScalar(3);
    this.eye.getWorldPosition(_v2);
    h.lookAt(lookPt.add(_v2), { speed: 10, weight: 0.85 });
    this._placeBase();
  }

  _placeBase() {
    const h = this.humanoid;
    if (this.mode === 'foot') {
      if (this.base.parent !== this.root.parent && this.root.parent) this.root.parent.add(this.base);
      this.base.position.copy(this.root.position);
      this.base.quaternion.identity();
    }
    // eye = smoothed head PIVOT + the eye offset turned by the LOOK direction, all in the base (seat)
    // frame. Turning the offset with the camera rather than the head bone breaks the feedback loop
    // camera -> look-at -> head -> eye -> camera (micro-jitter); the pivot follows the neck and spine
    // (breathing, lean, bumps) through a time-based filter, and a moving vehicle never makes it lag.
    const hb = h.rig.bone('Head');
    hb.updateWorldMatrix(true, false);
    this.base.updateWorldMatrix(true, false);
    _m.copy(this.base.matrixWorld).invert();
    const dt = this._dt || 1 / 60;
    _v.setFromMatrixPosition(hb.matrixWorld).applyMatrix4(_m);
    if (!this._eyeInit) { this._eyeS.copy(_v); this._eyeInit = true; }
    this._eyeS.lerp(_v, 1 - Math.exp(-(this.mode === 'foot' ? 14 : 18) * dt));
    const look = cameraRig.lookDirection;
    if (look && this._eyeOff) {
      // look direction in the base frame -> yaw / pitch (base forward = -Z)
      this.base.getWorldQuaternion(_q).invert();
      _v2.copy(look).applyQuaternion(_q).normalize();
      const yaw = Math.atan2(-_v2.x, -_v2.z), pitch = Math.asin(clamp(_v2.y, -1, 1));
      _q.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
      _v2.copy(this._eyeOff).applyQuaternion(_q);
      this.eye.position.copy(this._eyeS).add(_v2);
    } else {
      _v2.copy(this._eyeLocal).applyMatrix4(hb.matrixWorld).applyMatrix4(_m);
      this.eye.position.copy(_v2);
    }
  }

  /** Seated in the taxi: settle the hips into the cushion until the hair clears the headliner by 5 cm. */
  _seatClearance(dt) {
    const S = this._seatFit, h = this.humanoid;
    const seat = h.root.parent;
    if (!S || S.ceil == null || !seat || dt <= 0) return;
    S.t += dt;
    if (S.t > 0.9) {
      // the sitting blend has settled: head top (skin + ~3 cm of hair) along the head's up axis
      const t = h.t;
      h.boneFrame(t.index.Head, _q);
      _v.set(0, 1, 0).applyQuaternion(_q);
      h.rig.bone('Head').getWorldPosition(_v2).addScaledVector(_v, (t.headTop + 0.03) * h.scale);
      seat.worldToLocal(_v2);
      const need = _v2.y + 0.05 - S.ceil;
      if (need > 0.002) S.target = Math.min(0.14, S.target + need);
    }
    S.drop = damp(S.drop, S.target, 6, dt);
    h.root.position.y = S.base - S.drop;
    // reach: a straight arm at full stretch makes the two-bone IK snap and jitter (and the hands stop
    // short of the rim). Slide the seat forward until both elbows keep a comfortable bend (≤ 84 % reach),
    // back again if the hands are cramped against the chest.
    if (S.t > 0.9 && this._grips?.length === 2) {
      let r = 0, rMin = 9;
      for (const [k, g] of [['L', this._grips[0]], ['R', this._grips[1]]]) {
        const ch = h.chains[k];
        if (!ch) continue;
        h.rig.worldPos(ch.ia, _v);
        g.getWorldPosition(_v2);
        const q = _v.distanceTo(_v2) / Math.max(0.1, (ch.lenA + ch.lenB) * h.scale);
        r = Math.max(r, q);
        rMin = Math.min(rMin, q);
      }
      if (r > 0.86) S.slideT = Math.min(0.16, (S.slideT || 0) + (r - 0.84) * 0.5);
      else if (rMin < 0.62) S.slideT = Math.max(0, (S.slideT || 0) - (0.64 - rMin) * 0.5);
    }
    S.slide = damp(S.slide || 0, S.slideT || 0, 4, dt);
    h.root.position.z = S.baseZ - S.slide;
  }

  /** On foot, looking down bends the upper back forward (head over the chest) so the legs and feet show. */
  _footLookDown(dt) {
    const h = this.humanoid;
    const dy = (cameraRig.lookDirection || _v2.set(0, 0, -1)).y;
    const target = clamp((-dy - 0.4) * 0.6, 0, 0.33);
    const L = this._footLean || (this._footLean = new THREE.Vector2());
    L.x = 0;
    L.y = damp(L.y, target, 8, dt);
    h.bodyLean = L;
  }

  _footController(dt) {
    const h = this.humanoid;
    const r = this.root;
    let mx = 0, my = 0;
    if (this.walkEnabled) { mx = input.axis.moveX || 0; my = input.axis.moveY || 0; }
    const run = this.walkEnabled && input.down('run');
    const len = Math.hypot(mx, my);
    const target = len > 0.05 ? (run ? 3.0 : 1.35) * Math.min(1, len) : 0;
    this.speed = damp(this.speed, target, target > this.speed ? 6 : 9, dt);
    const yaw = cameraRig.worldYaw ?? 0;
    if (this.speed > 0.05) {
      const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), rt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const dir = f.multiplyScalar(my).addScaledVector(rt, mx);
      if (dir.lengthSq() > 1e-6) dir.normalize();
      r.position.addScaledVector(dir, this.speed * dt);
      const res = colliders.resolve(r.position, 0.28);
      if (res && res.isVector3) r.position.copy(res);
      if (this.groundFn) { const gy = this.groundFn(r.position.x, r.position.z); if (Number.isFinite(gy)) r.position.y = gy; }
      h.setMode(this.speed > 2 ? 'run' : 'walk');
      // footsteps
      this._stepPhase += dt * (this.speed > 2 ? 2.9 : 1.9);
      if (this._stepPhase >= 1) {
        this._stepPhase -= 1;
        bus.emit('player:footstep', { surface: this.surfaceFn ? this.surfaceFn(r.position.x, r.position.z) : 'asphalt', position: r.position.clone() });
      }
    } else if (h.mode === 'walk' || h.mode === 'run') h.setMode('stand');
    // the body turns toward the view direction (lags slightly; keeps the shoulders natural)
    let dy = yaw - r.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const turn = this.speed > 0.1 ? 9 : Math.abs(dy) > 0.9 ? 4 : 0;
    r.rotation.y += dy * (1 - Math.exp(-turn * dt));
  }

  _vehicleReactions(dt) {
    // torso sways with the seat acceleration (spring): lean back on throttle, forward on braking, out in turns
    const h = this.humanoid;
    const seat = this.root.parent;
    if (!seat || dt <= 0) return;
    seat.getWorldPosition(_v);
    const A = this._acc;
    if (A.has) {
      const vel = _v2.copy(_v).sub(A.last).divideScalar(dt);
      const acc = vel.clone().sub(A.v).divideScalar(dt);
      A.v.copy(vel);
      seat.getWorldQuaternion(_q).invert();
      acc.applyQuaternion(_q); // seat-local: -Z forward
      const tx = clamp(-acc.x * 0.012, -0.12, 0.12), tz = clamp(acc.z * 0.01, -0.12, 0.12);
      A.vel.x += ((tx - A.lean.x) * 40 - A.vel.x * 7) * dt;
      A.vel.y += ((tz - A.lean.y) * 40 - A.vel.y * 7) * dt;
      A.lean.addScaledVector(A.vel, dt);
    }
    A.last.copy(_v);
    A.has = true;
    h.bodyLean = A.lean;
  }

  _actionsUpdate(dt) {
    const h = this.humanoid;
    // reach for controls (taxi.onReach)
    const R = this._reach;
    if (R) {
      R.t += dt;
      const p = h._target(R.target, new THREE.Vector3());
      const w = R.t < R.dur ? smoothstep(0, R.dur, R.t) : R.t < R.dur + R.hold ? 1 : 1 - smoothstep(R.dur + R.hold, R.dur + R.hold + 0.4, R.t);
      if (p) {
        h.reachReq = { side: R.side, pos: p, w, fingers: R.press ? 'point' : 'grip' };
      }
      if (!R.done && R.t >= R.dur) { R.done = true; R.resolve(true); }
      if (R.t > R.dur + R.hold + 0.4) { this._reach = null; h.reachReq = null; }
    }
    const W = this._wipe;
    if (W) {
      W.t += dt;
      const k = W.t / W.dur;
      const env = smoothstep(0, 0.15, k) * (1 - smoothstep(0.85, 1, k));
      const a = W.t * 9;
      const p = W.point.clone().add(new THREE.Vector3(Math.cos(a) * 0.05, Math.sin(a) * 0.04, 0));
      h.reachReq = { side: W.side, pos: p, w: env, fingers: 'flat' };
      if (k >= 1) { this._wipe = null; h.reachReq = null; W.resolve(true); }
    }
    // held items in front of the body (paper raised to read, amulet clasped)
    if (this.held === 'paper') h.holdReq = { side: 'L', at: 'read' };
    else if (this.held === 'amulet') h.holdReq = { side: 'R', at: 'clasp' };
    else if (this.held) h.holdReq = { side: 'R', at: 'show' };
    else h.holdReq = null;
  }
}
