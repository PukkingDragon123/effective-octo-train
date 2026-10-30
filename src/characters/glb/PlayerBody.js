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

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

/** split a skinned look geometry into head (Head/neck dominated + hair) and body index ranges */
function splitHead(geo, t) {
  if (geo.userData.headSplit) return geo.userData.headSplit;
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, part = geo.attributes.apart;
  const head = new Set([t.index.Head, t.index.neck_01, t.index.eye_l, t.index.eye_r, ...['hair_1', 'hair_2', 'hair_3', 'hairL_1', 'hairL_2', 'hairR_1', 'hairR_2'].map((n) => t.index[n])]);
  const hw = (i) => { let w = 0; for (let k = 0; k < 4; k++) if (head.has(si.getComponent(i, k))) w += sw.getComponent(i, k); return w; };
  const idx = geo.index.array;
  const A = [], B = [], M = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const pa = part ? part.getX(a) : 0;
    const isHead = (part && pa > 1.5) || (hw(a) + hw(b) + hw(c)) / 3 > 0.5;
    // teeth (5) / tongue (6) last in the head, so a closed mouth draws less
    (isHead ? (pa > 4.5 && pa < 6.5 ? M : A) : B).push(a, b, c);
  }
  const mk = (arr) => { const g = new THREE.BufferGeometry(); for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]); g.setIndex(arr); g.boundingSphere = geo.boundingSphere; return g; };
  const headGeo = mk(A.concat(M));
  headGeo.userData.mouthStart = A.length;
  geo.userData.headSplit = { head: headGeo, headNoMouth: noMouthView(headGeo), body: mk(B) };
  return geo.userData.headSplit;
}

export class PlayerBodyGLB {
  constructor(spec = {}) {
    this.humanoid = new HumanoidGLB({ ...PRESETS.ton, id: 'player', ...spec });
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
    this.headMesh.layers.set(LAYERS.PLAYER_HEAD);
    h.eyes.layers.set(LAYERS.PLAYER_HEAD);
    if (h.worn) h.worn.layers.set(LAYERS.PLAYER_HEAD);
    h.body.frustumCulled = false;
    this._off = engine.onUpdate((dt) => this.update(dt), 15);
    // eye point relative to the head bone (between the eyes, slightly forward)
    this._eyeLocal = new THREE.Vector3();
    {
      const t = h.t, hb = t.index.Head;
      const mid = t.eyeCenters[0].clone().add(t.eyeCenters[1]).multiplyScalar(0.5);
      mid.z += 0.012;
      this._eyeLocal.copy(mid).sub(t.Gp[hb]).applyQuaternion(t.Gq[hb].clone().invert()).multiplyScalar(1 / h.headScale);
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
      const R = vehicle.steeringRadius ?? 0.19;
      for (const [side, ang] of [['L', Math.PI + 0.32], ['R', -0.32]]) {
        const g = new THREE.Object3D();
        g.name = 'grip' + side;
        spin.add(g);
        // wheel frame: XY = rim plane, +Z toward the driver
        g.position.set(Math.cos(ang) * R, Math.sin(ang) * R, 0.012);
        const radial = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0);
        const along = new THREE.Vector3(0, 0, -1).addScaledVector(radial, -0.25).add(new THREE.Vector3(0, 0.55, 0)).normalize(); // fingers wrap forward/up
        const palm = radial.clone().multiplyScalar(-1).add(new THREE.Vector3(0, 0, -0.35)).normalize(); // palm toward the rim/centre
        const z = along.clone().negate(), y = palm.clone().negate();
        const x = new THREE.Vector3().crossVectors(y, z).normalize();
        y.crossVectors(z, x);
        g.quaternion.setFromRotationMatrix(_m.makeBasis(x, y, z));
        this._grips.push(g);
        h.setHandTarget(side, g, { grip: 1, blend: 0.35 });
      }
      if (A.pedalThrottle) h.setFootTarget('R', A.pedalThrottle, { blend: 0.4, orient: false });
      if (A.pedalClutch) h.setFootTarget('L', A.pedalClutch, { blend: 0.4, orient: false });
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
    if (this.mode === 'foot') this._footController(dt);
    else this._vehicleReactions(dt);
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
    // eye: the head bone's eye point, smoothed (no clip head bob in the camera)
    const hb = h.rig.bone('Head');
    hb.updateWorldMatrix(true, false);
    _v.copy(this._eyeLocal).applyMatrix4(hb.matrixWorld);
    if (!this._eyeInit) { this._eyeS.copy(_v); this._eyeInit = true; }
    this._eyeS.lerp(_v, this.mode === 'foot' ? 0.25 : 0.5);
    this.base.updateWorldMatrix(true, false);
    this.eye.position.copy(this._eyeS).applyMatrix4(_m.copy(this.base.matrixWorld).invert());
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
