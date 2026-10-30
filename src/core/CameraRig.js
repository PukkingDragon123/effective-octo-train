// Owns engine.camera every frame. Two layers that blend together:
//
//  * PLAYER mode: camera sits at an "eye" anchor (an Object3D, usually the player's
//    head eye-point) and is rotated by the free-look yaw/pitch from input, relative to
//    a "base" frame (vehicle body / walking body yaw). Lean (Q/E) shifts the head
//    sideways toward the windows.
//  * CINEMATIC mode: camera follows authored shots (position + lookAt + fov), blended
//    smoothly from / back to the player view.
//
// It also answers gaze questions for the horror director: isLookingAt(), angleTo().
import * as THREE from 'three';
import { engine } from './Engine.js';
import { input } from './Input.js';
import { settings } from './Settings.js';
import { clamp, damp, easeInOut, lerp, DEG } from './math.js';
import { noise } from './math.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

class CameraRig {
  constructor() {
    this.eye = null; // Object3D whose world position is the eye
    this.base = null; // Object3D whose world orientation is the "forward" frame (vehicle / body). null = world
    this.yaw = 0; // look yaw relative to base (radians, + = left)
    this.pitch = 0; // look pitch (+ = up)
    this.limits = { yawMin: -2.6, yawMax: 2.6, pitchMin: -1.2, pitchMax: 1.25 };
    this.lookEnabled = true;
    this.leanOffset = new THREE.Vector3(); // current lean offset in base space
    this.leanAmount = { side: 0.28, forward: 0.06, down: 0.03 };
    this.extraOffset = new THREE.Vector3(); // external offset in base space (body motion, bumps)
    this.fovBase = settings.get('fov') || 72;
    this.fovOffset = 0; // added by cinematics / zoom
    this.roll = 0;
    // shake
    this.trauma = 0;
    this.shakeFreq = 18;
    // cinematic
    this.shot = null; // {position:Vector3|fn, lookAt:Vector3|fn, fov, roll}
    this.cineBlend = 0; // 0 = player, 1 = cinematic
    this.cineBlendTarget = 0;
    this.cineBlendSpeed = 1.5;
    this._cinePos = new THREE.Vector3();
    this._cineQuat = new THREE.Quaternion();
    // soft focus (auto look toward something interesting during dialogue)
    this.focusTarget = null;
    this.focusStrength = 0;
    // outputs
    this.playerPosition = new THREE.Vector3();
    this.playerQuaternion = new THREE.Quaternion();
    this.lookDirection = new THREE.Vector3(0, 0, -1);
    this.worldYaw = 0;
    settings.onChange(() => (this.fovBase = settings.get('fov') || 72));
  }

  install() {
    engine.onUpdate((dt) => this.update(dt), 50, { always: true });
    return this;
  }

  /** Attach the first-person view. eye: Object3D eye point. base: Object3D providing the forward frame. */
  attach(eye, base = null, opts = {}) {
    this.eye = eye;
    this.base = base;
    if (opts.resetLook !== false) {
      this.yaw = opts.yaw ?? 0;
      this.pitch = opts.pitch ?? 0;
    }
    if (opts.limits) this.setLimits(opts.limits);
  }

  setLimits(l) {
    Object.assign(this.limits, l);
  }

  /** Add camera shake. amount 0..1 */
  shake(amount = 0.3) {
    this.trauma = clamp(this.trauma + amount * (settings.get('cameraShake') ?? 1), 0, 1);
  }

  /**
   * Play a cinematic shot. shot = {
   *   position: Vector3 | () => Vector3,   lookAt: Vector3 | () => Vector3,
   *   fov?: number, roll?: number, blend?: seconds (blend-in time) }
   * Shots can be swapped while in cinematic mode (they cross-blend).
   */
  cinematic(shot) {
    this.shot = shot;
    this.cineBlendTarget = 1;
    this.cineBlendSpeed = 1 / Math.max(0.01, shot.blend ?? 0.8);
    if (shot.cut) this.cineBlend = 1;
  }

  /** Return to the first-person player view over `blend` seconds. */
  release(blend = 0.8) {
    this.cineBlendTarget = 0;
    this.cineBlendSpeed = 1 / Math.max(0.01, blend);
  }

  get inCinematic() {
    return this.cineBlendTarget > 0 || this.cineBlend > 0.001;
  }

  /** Gently pull the player's view toward a point (dialogue). strength 0..1, null to clear. */
  setFocus(target, strength = 0.5) {
    this.focusTarget = target;
    this.focusStrength = target ? strength : 0;
  }

  /** Angle (radians) between the current view direction and the direction to `pos`. */
  angleTo(pos) {
    const cam = engine.camera;
    _v.copy(pos).sub(cam.position).normalize();
    return Math.acos(clamp(_v.dot(this.lookDirection), -1, 1));
  }

  /** True when `pos` lies within `maxDeg` of the view centre (and optionally within range). */
  isLookingAt(pos, maxDeg = 12, maxDist = Infinity) {
    if (engine.camera.position.distanceTo(pos) > maxDist) return false;
    return this.angleTo(pos) < maxDeg * DEG;
  }

  /** True when `pos` is inside the camera frustum at all (peripheral vision counts). */
  isOnScreen(pos, margin = 0) {
    _v.copy(pos).project(engine.camera);
    return _v.z < 1 && Math.abs(_v.x) < 1 - margin && Math.abs(_v.y) < 1 - margin;
  }

  update(dt) {
    const cam = engine.camera;
    // --- free look -------------------------------------------------------
    if (this.lookEnabled && !engine.paused) {
      this.yaw += input.look.dx;
      this.pitch += input.look.dy;
    }
    if (this.focusTarget && this.focusStrength > 0 && !engine.paused) {
      // compute yaw/pitch that would look at the target in base space and ease toward it
      const basePos = this.eye ? this.eye.getWorldPosition(_v2) : cam.position;
      _v.copy(this.focusTarget).sub(basePos);
      if (this.base) {
        this.base.getWorldQuaternion(_q).invert();
        _v.applyQuaternion(_q);
      }
      const ty = Math.atan2(-_v.x, -_v.z);
      const tp = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
      const k = this.focusStrength * 2.5;
      this.yaw = damp(this.yaw, ty, k, dt);
      this.pitch = damp(this.pitch, tp, k, dt);
    }
    this.yaw = clamp(this.yaw, this.limits.yawMin, this.limits.yawMax);
    this.pitch = clamp(this.pitch, this.limits.pitchMin, this.limits.pitchMax);

    // --- player transform ---------------------------------------------------
    if (this.base) this.base.getWorldQuaternion(_q);
    else _q.identity();
    _e.set(this.pitch, this.yaw, this.roll, 'YXZ');
    _q2.setFromEuler(_e);
    this.playerQuaternion.copy(_q).multiply(_q2);

    if (this.eye) this.eye.getWorldPosition(this.playerPosition);
    // lean: sideways toward windows, a bit forward and down
    const lean = engine.paused ? 0 : input.axis.lean;
    const tl = _v.set(lean * this.leanAmount.side, -Math.abs(lean) * this.leanAmount.down, -Math.abs(lean) * this.leanAmount.forward);
    this.leanOffset.lerp(tl, 1 - Math.exp(-10 * dt));
    _v2.copy(this.leanOffset).add(this.extraOffset).applyQuaternion(_q);
    this.playerPosition.add(_v2);

    // --- cinematic blend -----------------------------------------------------
    const dir = Math.sign(this.cineBlendTarget - this.cineBlend);
    this.cineBlend = clamp(this.cineBlend + dir * this.cineBlendSpeed * dt, 0, 1);
    if (this.shot) {
      const p = typeof this.shot.position === 'function' ? this.shot.position() : this.shot.position;
      const l = typeof this.shot.lookAt === 'function' ? this.shot.lookAt() : this.shot.lookAt;
      if (p) this._cinePos.copy(p);
      if (l) {
        _m.lookAt(this._cinePos, l, UP);
        this._cineQuat.setFromRotationMatrix(_m);
        if (this.shot.roll) {
          _q2.setFromAxisAngle(_v.set(0, 0, 1), this.shot.roll);
          this._cineQuat.multiply(_q2);
        }
      }
    }
    const b = easeInOut(this.cineBlend);
    cam.position.copy(this.playerPosition).lerp(this._cinePos, b);
    cam.quaternion.copy(this.playerQuaternion).slerp(this._cineQuat, b);
    if (this.cineBlend <= 0 && this.cineBlendTarget === 0) this.shot = null;

    // --- shake ----------------------------------------------------------------
    if (this.trauma > 0) {
      const t = engine.realTime * this.shakeFreq;
      const s = this.trauma * this.trauma;
      _e.set(noise.noise2D(t, 1.3) * 0.05 * s, noise.noise2D(t, 7.1) * 0.05 * s, noise.noise2D(t, 13.7) * 0.04 * s, 'YXZ');
      _q2.setFromEuler(_e);
      cam.quaternion.multiply(_q2);
      this.trauma = Math.max(0, this.trauma - dt * 1.2);
    }

    // --- fov --------------------------------------------------------------------
    const shotFov = this.shot && this.shot.fov ? this.shot.fov : this.fovBase;
    const targetFov = lerp(this.fovBase, shotFov, b) + this.fovOffset;
    if (Math.abs(cam.fov - targetFov) > 0.01) {
      cam.fov = targetFov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld(true);
    this.lookDirection.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.worldYaw = Math.atan2(-this.lookDirection.x, -this.lookDirection.z);
  }
}

export const cameraRig = new CameraRig();
