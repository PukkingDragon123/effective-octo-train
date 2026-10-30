// The gigantic ghostly hand at ศาลเจ้ามารวย: a sculpted, skinned forearm + hand (×2.5–4.5) that
// rises out of the ground mist with twitching, hyper-extended fingers, then closes around a person
// (or the taxi) and drags it down into the fog. Also used by A's menu incident.
//   const h = createGiantHand({ scale: 3.2 }); scene.add(h.root); h.root.position.copy(ground);
//   await h.rise(4); await h.grab(person.root, { height: 1.7 }); // grab sinks back by default
import * as THREE from 'three';
import { audio } from '../audio/index.js';
import { lightPool, particles, postfx } from '../render/index.js';
import { cameraRig } from '../core/CameraRig.js';
import { engine } from '../core/Engine.js';
import { HandRig } from './hand.js';
import { Entity, animate, sleep, easeOut, easeIn, easeInOut, noise, worldPos, clamp } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class GiantHand extends Entity {
  constructor(opts = {}) {
    super('giantHand');
    this.S = opts.scale ?? 3.2;
    this.forearm = 2.6;
    this.hand = new HandRig({
      shape: { fingerScale: 1.32, bony: 0.8, nails: 0.17, forearm: this.forearm, thickness: 0.88, cell: opts.cell ?? 0.026 },
      pale: 0.55, rim: 0.55, emissive: opts.emissive ?? 0x0e1a15, twitch: 0.45, detailScale: 2.4, bump: 1.4,
    });
    this.pivot = new THREE.Group();
    this.pivot.name = 'giantHandPivot';
    this.root.add(this.pivot);
    this.pivot.add(this.hand.mesh);
    this.hand.mesh.scale.setScalar(this.S);
    this.wristHeight = opts.wristHeight ?? 0.35 * this.S;
    this.sunkY = -(this.forearm + 1.7) * this.S;
    this.pivot.position.y = this.sunkY;
    this.hand.setCurl(1, 100);
    this.risen = 0;
    this.held = null;
    this.tremor = 1;
    // a cold, sickly light cupped in the palm (the fog glows around it)
    this.lightAnchor = new THREE.Object3D();
    this.lightAnchor.position.set(0, 0.55, 0.9);
    this.hand.b.wrist.add(this.lightAnchor);
    this.light = opts.light === false ? null : lightPool.add({ object: this.lightAnchor, color: opts.lightColor ?? 0x9cc4b0, intensity: 0, distance: 6 * this.S, decay: 1.6, flicker: 'none', glow: false, priority: 4 });
    this.mist = null;
    this._rumble = null;
    this.hand.mesh.visible = false;
  }

  step(dt) {
    this.hand.update(dt);
    // slow living sway + tremor (bigger while closing / lifting)
    const t = this.time;
    const a = this.risen;
    this.pivot.rotation.z = (noise.noise2D(t * 0.13, 1.7) * 0.06 + noise.noise2D(t * 2.3, 4.1) * 0.006 * this.tremor) * a;
    this.pivot.rotation.x = (noise.noise2D(t * 0.11, 9.2) * 0.05 + noise.noise2D(t * 2.1, 2.2) * 0.006 * this.tremor) * a;
    this.hand.wristBend = this._bend ?? 0.1;
    this.hand.mesh.visible = this.pivot.position.y > this.sunkY + 0.05;
    if (this.light) this.light.setIntensity(2.2 * this.S * a);
    if (this.mist) this.mist.setPosition(worldPos(this.root, _v));
  }

  _startFx() {
    if (!this.mist) {
      try {
        this.mist = particles.emit('mist', { position: worldPos(this.root, _v).clone(), radius: this.S * 3, height: 1.4, intensity: 1.2 });
      } catch (e) {
        this.mist = null;
      }
    }
    if (!this._rumble) this._rumble = audio.loop('giant_hand_rumble', { object: this.root, volume: 0.9, refDistance: 6 * this.S });
  }
  _stopFx() {
    this._rumble?.stop(1.5);
    this._rumble = null;
    if (this.mist) {
      const m = this.mist;
      this.mist = null;
      setTimeout(() => m.dispose(), 2500);
      m.setIntensity(0.3);
    }
  }

  /** Rise out of the fog (fingers uncurl from a fist into a reaching claw). */
  async rise(duration = 4) {
    this._startFx();
    const y0 = this.pivot.position.y, y1 = this.wristHeight;
    this.hand.setCurl({ i: 0.85, m: 0.9, r: 0.95, p: 1, t: 0.8 }, 3);
    this.tremor = 2;
    audio.play('rumble_rise', { object: this.root, volume: 0.9 });
    await animate(duration, (k) => {
      this.pivot.position.y = y0 + (y1 - y0) * k;
      this.risen = k;
      if (k > 0.45 && !this._opened) {
        this._opened = true;
        this.hand.setCurl({ i: 0.18, m: 0.08, r: 0.22, p: 0.35, t: 0.1 }, 1.4);
        this.hand.spreadT = 0.6;
      }
      this._shakeNear(0.012);
    }, easeOut);
    this._opened = false;
    this.tremor = 1;
    this.risen = 1;
  }

  /** Sink back into the fog. */
  async sink(duration = 3) {
    this.hand.setCurl(1, 2.5);
    const y0 = this.pivot.position.y;
    await animate(duration, (k) => {
      this.pivot.position.y = y0 + (this.sunkY - y0) * k;
      this.risen = 1 - k;
      this._shakeNear(0.008);
    }, easeIn);
    this.risen = 0;
    this._stopFx();
  }

  /**
   * Close around `target` (Object3D: a person's root, a prop). opts: { height=1.7 (target height),
   * from: Vector3 direction the palm comes from (default: from the hand's current spot, else across
   * the view), lift=true, sink=true (drag it down), attach=true (carry it), gore=true, humanoid (to
   * break it), onClose() }.
   */
  async grab(target, opts = {}) {
    const S = this.S;
    const tp = worldPos(target, new THREE.Vector3());
    const parent = this.root.parent || engine.scene;
    parent.updateWorldMatrix(true, false);
    // palm direction (horizontal)
    let n = opts.from ? opts.from.clone() : tp.clone().sub(worldPos(this.root, _v));
    n.y = 0;
    if (n.lengthSq() < 0.25) {
      _v2.copy(tp).sub(engine.camera.position).setY(0).normalize();
      n.set(_v2.z, 0, -_v2.x);
    }
    n.normalize();
    const height = opts.height ?? 1.7;
    // if already up somewhere else, duck under the fog first
    if (this.risen > 0.2) {
      const d = worldPos(this.root, _v).distanceTo(tp);
      if (d > S * 1.2) await this.sink(0.7);
    }
    this._startFx();
    // new spot: palm beside the target, knuckles just above its top
    const spot = tp.clone().addScaledVector(n, -0.34 * S);
    const local = parent.worldToLocal(spot.clone());
    this.root.position.set(local.x, parent.worldToLocal(tp.clone()).y, local.z);
    this.root.rotation.set(0, Math.atan2(n.x, n.z), 0);
    const wristY = height + 0.06 * S - 0.98 * S;
    // burst up with the fingers flung open
    this.hand.setCurl({ i: -0.22, m: -0.25, r: -0.2, p: -0.15, t: -0.1 }, 6);
    this.hand.spreadT = 1;
    this._bend = -0.05;
    audio.play('rumble_rise', { object: this.root, volume: 1 });
    audio.play('sting_high', { position: tp, volume: 0.7 });
    const y0 = Math.min(this.pivot.position.y, this.sunkY * 0.6);
    this.tremor = 2.5;
    await animate(0.95, (k) => {
      this.pivot.position.y = y0 + (wristY - y0) * k;
      this.risen = k;
      this._shakeNear(0.03 * (1 - k));
    }, easeOut);
    this.risen = 1;
    await sleep(0.22);
    // close: pinky first, the thumb last, crushing
    this._bend = 0.28;
    this.hand.spreadT = 0;
    this.hand.setCurl({ p: 1.02, r: 1.0, m: 0.96, i: 0.92, t: 0.95 }, 7);
    await sleep(0.32);
    audio.play('bone_crack', { position: tp, volume: 1 });
    audio.play('scare_hit', { position: tp, volume: 0.8 });
    this._shakeNear(0.35);
    if (opts.gore !== false) {
      try {
        const b = particles.emit('blood', { position: tp.clone().setY(tp.y + height * 0.6), burst: true, autoDispose: true, radius: 0.25, groundY: tp.y, direction: new THREE.Vector3(0, 1, 0).addScaledVector(n, -0.6) });
        b.burst();
      } catch (e) { /* particles optional */ }
      if (opts.humanoid) {
        opts.humanoid.setGhost?.({ limbBreak: 0.9, headRoll: 0.9, jitter: 0.6 }, 20);
        opts.humanoid.setGore?.({ bleedMouth: 1, bleedEyes: 0.8, amount: 1, speed: 3 });
      }
      if (cameraRig && engine.camera.position.distanceTo(tp) < 12) postfx.bloodSplash?.(0.35);
    }
    opts.onClose?.();
    // the target is held from now on (attach:false leaves it where it is: the taxi, cinematics)
    if (opts.attach !== false) {
      this.held = target;
      this.hand.b.wrist.attach(target);
    }
    await sleep(0.35);
    if (opts.lift !== false) {
      const ya = this.pivot.position.y;
      await animate(1.4, (k) => {
        this.pivot.position.y = ya + 0.8 * S * k;
        this._shakeNear(0.01);
      }, easeInOut);
    }
    if (opts.sink !== false) {
      await sleep(0.4);
      await this.sink(2.4);
    }
    this.tremor = 1;
    return target;
  }

  /** Drop what it holds back into `parent` (keeps the world transform). */
  release(parent = engine.scene) {
    if (!this.held) return null;
    parent.attach(this.held);
    const h = this.held;
    this.held = null;
    return h;
  }

  _shakeNear(a) {
    const d = worldPos(this.root, _v).distanceTo(engine.camera.position);
    const k = clamp(1 - d / (this.S * 12), 0, 1);
    if (k > 0 && a > 0) cameraRig.shake(a * k);
  }

  dispose() {
    this._stopFx();
    this.light?.remove();
    this.hand.rig.skeleton.dispose();
    this.hand.material.dispose();
    this._keep = new Set([this.hand.mesh.geometry]);
    super.dispose();
  }
}
