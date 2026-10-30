// Window-scare puppet: a ghost humanoid (and a sculpted long-fingered hand) driven by scripted,
// gaze-aware procedural performances around the moving taxi. Everything attaches to the taxi body
// so it rides with the suspension at any speed.
//
//   const g = createWindowGhost({ spec: 'windowWoman' });
//   await g.perform('upsideDownHead', { taxi, duration: 5 });
//   kinds: upsideDownHead · fingersDoorFrame · faceAgainstGlass · roofCrawler · runBeside ·
//          treeWatch · standInRoad · knockWindow   (opts per kind below)
import * as THREE from 'three';
import { audio } from '../audio/index.js';
import { particles } from '../render/index.js';
import { engine } from '../core/Engine.js';
import { cameraRig } from '../core/CameraRig.js';
import { LAYERS } from '../core/layers.js';
import { SPECS, human, groundAt } from './humans.js';
import { HandRig } from './hand.js';
import { paneFrame, panePoint, bodyOf, toBody, dirToBody, quatFromBasis, humanoidFacing } from './taxiGeo.js';
import { Entity, animate, sleep, noise, worldPos, clamp, easeInOut, easeOut, easeIn, rand } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

export class WindowGhost extends Entity {
  constructor(opts = {}) {
    super('windowGhost');
    const spec = typeof opts.spec === 'object' ? opts.spec : SPECS[opts.spec || (opts.sex === 'm' ? 'tallMan' : 'windowWoman')] || SPECS.windowWoman;
    this.spec = spec;
    this.h = opts.humanoid || human(spec, opts);
    this.ownsHumanoid = !opts.humanoid;
    this.humanoid = this.h;
    this.root.add(this.h.root);
    this.h.setGhost({ stare: 1, noBlink: 1 }, 100);
    this.hand = null;
    this.aborted = false;
    this.kind = null;
    this.world = opts.world || null;
    this._marks = [];
  }

  /** Run a performance (see header). Resolves when it is over (or stop() was called). */
  async perform(kind, opts = {}) {
    this.aborted = false;
    this.kind = kind;
    const fn = this['_' + kind];
    if (!fn) {
      console.warn('[creatures] unknown window performance', kind);
      return false;
    }
    try {
      return await fn.call(this, opts);
    } finally {
      this.kind = null;
    }
  }
  stop() {
    this.aborted = true;
  }
  /** wait that ends early on stop() */
  async _wait(s) {
    let t = 0;
    while (t < s && !this.aborted && !this.disposed) {
      await sleep(Math.min(0.1, s - t));
      t += 0.1;
    }
  }
  _attach(taxi) {
    const body = bodyOf(taxi);
    body.add(this.root);
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
    this.h.root.position.set(0, 0, 0);
    this.h.root.quaternion.identity();
    this.h.setOpacity(1);
    this.h.setVisible(true);
    return body;
  }
  _toScene() {
    engine.scene.add(this.root);
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
    this.h.setOpacity(1);
    this.h.setVisible(true);
  }

  // ------------------------------------------------------------------------------------------
  /** Her head lowers, upside down, into the top of the windshield from the roof (wet hair hanging). */
  async _upsideDownHead({ taxi, duration = 5, side = 0.22, onReveal } = {}) {
    const body = this._attach(taxi);
    const ws = paneFrame(taxi, 'windshield');
    const top = toBody(taxi, panePoint(ws, side / Math.max(0.5, ws.w), 0.5, 0, _v), new THREE.Vector3());
    const shoulders = (this.h.look?.height ?? 1.6) * 0.82;
    const y = top.y + 0.14;
    const z0 = top.z + shoulders + 0.3, z1 = top.z + shoulders - 0.04;
    this.h.root.position.set(top.x, y, z0);
    this.h.root.rotation.set(-Math.PI / 2, 0, 0); // face down on the roof, head toward the front
    this.h.setMode('stand');
    this.h.setGhost({ headPitch: 0.1, jitter: 0.12, stare: 1, unlimited: 1 }, 100);
    this.h.lookAt(engine.camera, { speed: 1.2, unlimited: true });
    this.h.setExpression({ creepy: 0.4, sad: 0.4 });
    audio.play('thump_roof', { object: taxi.root, volume: 0.6, rate: 0.8 });
    let drips = null;
    try {
      drips = particles.emit('drips', { object: this.h.bones.Head || this.h.root, radius: 0.12, height: 1.2 });
    } catch (e) { /* optional */ }
    await animate(duration * 0.45, (k) => {
      this.h.root.position.z = z0 + (z1 - z0) * k;
      this.h.setGhost({ headPitch: 0.1 + 1.55 * k }, 100);
    }, easeInOut);
    onReveal?.();
    audio.play('sting_low', { object: taxi.root, volume: 0.6 });
    // a hand curls over the windshield's top edge beside her face
    const grip = new THREE.Object3D();
    grip.position.copy(top).add(new THREE.Vector3(0.3, -0.04, 0.02));
    body.add(grip);
    this.h.setHandTarget('L', grip, { weight: 1, fingers: 'claw', grip: 0.6, blend: 0.6 });
    await this._wait(duration * 0.4);
    // snap back up
    this.h.setHandTarget('L', null);
    audio.play('thump_roof', { object: taxi.root, volume: 0.9 });
    await animate(0.35, (k) => {
      this.h.root.position.z = z1 + (z0 + 0.4 - z1) * k;
      this.h.setGhost({ headPitch: 1.65 * (1 - k) }, 100);
    }, easeIn);
    grip.removeFromParent();
    drips?.dispose();
    this.h.setVisible(false);
    return true;
  }

  // ------------------------------------------------------------------------------------------
  /** Long grey fingers curl over the window frame from the roof; tighten when looked at, then slide away. */
  async _fingersDoorFrame({ taxi, pane = 'rl', duration = 6, along = 0.18, gaze = null } = {}) {
    const body = bodyOf(taxi);
    this.h.setVisible(false);
    if (!this.hand) {
      this.hand = new HandRig({ shape: { fingerScale: 1.75, bony: 0.95, nails: 0.14, forearm: 1.6, thickness: 0.78, cell: 0.024 }, pale: 0.6, twitch: 0.35, detailScale: 26, rim: 0.3 });
      this.hand.mesh.scale.setScalar(0.098);
    }
    const H = this.hand;
    body.add(H.mesh);
    H.mesh.visible = true;
    const f = paneFrame(taxi, pane);
    const N = dirToBody(taxi, f.normal, new THREE.Vector3()).normalize();
    const U = dirToBody(taxi, f.up, new THREE.Vector3()).normalize();
    const edge = toBody(taxi, panePoint(f, along, 0.5, 0, _v), new THREE.Vector3()).addScaledVector(U, 0.035);
    // fingers point outward over the edge, palm down on the roof rail
    const Y = N.clone(), Z = U.clone().negate(), X = new THREE.Vector3().crossVectors(Y, Z);
    quatFromBasis(X, Y, Z, H.mesh.quaternion);
    const inPos = edge.clone().addScaledVector(N, -0.2).addScaledVector(U, 0.02);
    const outPos = edge.clone().addScaledVector(N, -0.085).addScaledVector(U, 0.02);
    H.mesh.position.copy(inPos);
    H.setCurl({ i: 0.15, m: 0.1, r: 0.2, p: 0.25, t: 0.4 }, 100);
    audio.play('scratch_glass', { object: H.mesh, volume: 0.35, rate: 0.7 });
    await animate(1.4, (k) => {
      H.mesh.position.lerpVectors(inPos, outPos, k);
    }, easeInOut);
    H.setCurl({ i: 0.92, m: 0.98, r: 0.95, p: 0.9, t: 0.3 }, 2.2);
    let t = 0, tight = false;
    const fingertip = new THREE.Vector3();
    while (t < duration && !this.aborted) {
      await sleep(0.1);
      t += 0.1;
      worldPos(H.b.m4, fingertip);
      const looking = gaze ? gaze() : cameraRig.isLookingAt(fingertip, 14);
      if (looking && !tight) {
        tight = true;
        H.setCurl({ i: 1.18, m: 1.2, r: 1.15, p: 1.1, t: 0.5 }, 9);
        audio.play('scratch_glass', { object: H.mesh, volume: 0.8, rate: 0.9 });
        audio.play('bone_crack', { object: H.mesh, volume: 0.2, rate: 1.6 });
        try {
          taxi.addGlassMark?.(pane, 'scratch', new THREE.Vector2(0.5 + along, 0.93), { size: 0.9 });
        } catch (e) { /* optional */ }
        t = Math.max(t, duration - 1.6);
      }
    }
    // slide away over the roof
    H.setCurl({ i: 0.2, m: 0.15, r: 0.25, p: 0.3, t: 0.3 }, 3);
    await animate(0.9, (k) => H.mesh.position.lerpVectors(outPos, inPos.clone().addScaledVector(N, -0.15), k), easeIn);
    H.mesh.visible = false;
    H.mesh.removeFromParent();
    return tight;
  }

  // ------------------------------------------------------------------------------------------
  /** A face presses against a side window from outside: condensation smears, a grin, blood (gore). */
  async _faceAgainstGlass({ taxi, pane = 'rl', duration = 4, grin = true, blood = true, onPress } = {}) {
    const body = this._attach(taxi);
    const f = paneFrame(taxi, pane);
    const N = dirToBody(taxi, f.normal, new THREE.Vector3()).normalize();
    const face = toBody(taxi, panePoint(f, 0.05, 0.08, 0.01, _v), new THREE.Vector3());
    const tgt = new THREE.Object3D();
    tgt.position.copy(face);
    body.add(tgt);
    const headH = (this.h.look?.height ?? 1.6) - 0.1;
    const up = new THREE.Vector3(0, 1, 0);
    humanoidFacing(N.clone().negate(), up, this.h.root.quaternion);
    const start = face.clone().addScaledVector(N, 0.9).addScaledVector(up, -headH);
    const end = face.clone().addScaledVector(N, 0.26).addScaledVector(up, -headH + 0.04);
    this.h.root.position.copy(start);
    this.h.setOpacity(0);
    this.h.setGhost({ stare: 1, jitter: 0.1, mouthStretch: grin ? 0.35 : 0 }, 100);
    this.h.setExpression(grin ? { smile: 1, creepy: 1 } : { creepy: 0.6, sad: 0.5 });
    await animate(0.5, (k) => {
      this.h.root.position.lerpVectors(start, end, k);
      this.h.setOpacity(k);
    }, easeOut);
    this.h.play('pressFaceToGlass', { target: tgt, normal: f.normal.clone() });
    audio.play('knock', { object: tgt, volume: 0.5, rate: 0.7 });
    audio.play('sting_high', { object: tgt, volume: 0.5 });
    await sleep(0.45);
    onPress?.();
    try {
      taxi.setFog?.(pane, 0.75);
      taxi.addBreathFog?.(pane, worldPos(tgt, _v2), 1);
      taxi.addGlassMark?.(pane, 'face', new THREE.Vector2(0.55, 0.58), { size: 1.1, intensity: 1 });
      taxi.addGlassMark?.(pane, 'handprint', new THREE.Vector2(0.2, 0.5), { size: 1.2, drag: true });
      taxi.addGlassMark?.(pane, 'handprint', new THREE.Vector2(0.86, 0.48), { size: 1.2, angle: -0.3 });
    } catch (e) { /* optional */ }
    await this._wait(duration * 0.6);
    if (blood) {
      try {
        taxi.addGlassMark?.(pane, 'blood_smear', new THREE.Vector2(0.55, 0.52), { size: 1.2, drag: true });
        taxi.addGlassMark?.(pane, 'blood_handprint', new THREE.Vector2(0.24, 0.42), { size: 1.1, drag: true });
      } catch (e) { /* optional */ }
    }
    // slides down and away
    this.h.stop('pressFaceToGlass');
    const p0 = this.h.root.position.clone();
    await animate(0.8, (k) => {
      this.h.root.position.copy(p0).addScaledVector(up, -0.45 * k).addScaledVector(N, 0.3 * k);
      this.h.setOpacity(1 - k);
    }, easeIn);
    tgt.removeFromParent();
    this.h.setVisible(false);
    return true;
  }

  // ------------------------------------------------------------------------------------------
  /** Something crawls over the roof (thumps), slaps the windshield, peeks over, leaps away. */
  async _roofCrawler({ taxi, duration = 6, onSlap } = {}) {
    const body = this._attach(taxi);
    const ws = paneFrame(taxi, 'windshield');
    const top = toBody(taxi, panePoint(ws, 0.1, 0.5, 0, _v), new THREE.Vector3());
    const shoulders = (this.h.look?.height ?? 1.7) * 0.82;
    const y = top.y + 0.15;
    this.h.setVisible(false);
    // thumps travel from the back of the roof to the front
    const n = 5;
    for (let i = 0; i < n && !this.aborted; i++) {
      const z = 1.0 - (i / (n - 1)) * 1.1;
      audio.play('thump_roof', { object: body, offset3: [rand(-0.3, 0.3), 1.4, z], volume: 0.5 + i * 0.1, rate: rand(0.85, 1.1) });
      if (i % 2) audio.play('scratch_glass', { object: body, offset3: [0, 1.4, z], volume: 0.25, rate: 0.5 });
      cameraRig.shake(0.05);
      await sleep(Math.max(0.25, duration * 0.08) * rand(0.7, 1.3));
    }
    if (this.aborted) return false;
    // over the edge: head and an arm
    this.h.setVisible(true);
    this.h.setOpacity(1);
    this.h.root.rotation.set(-Math.PI / 2, 0, 0);
    this.h.root.position.set(top.x, y, top.z + shoulders + 0.2);
    this.h.setGhost({ headPitch: 0.3, jitter: 0.5, stare: 1, unlimited: 1, mouthStretch: 0.5 }, 100);
    this.h.lookAt(engine.camera, { speed: 6, unlimited: true });
    const slap = new THREE.Object3D();
    slap.position.copy(toBody(taxi, panePoint(ws, -0.1, 0.32, 0.02, _v), new THREE.Vector3()));
    body.add(slap);
    this.h.setHandTarget('R', slap, { weight: 1, fingers: 'spread', blend: 0.08 });
    await animate(0.25, (k) => {
      this.h.root.position.z = top.z + shoulders + 0.2 - 0.3 * k;
      this.h.setGhost({ headPitch: 0.3 + 1.1 * k }, 100);
    }, easeOut);
    audio.play('knock', { object: slap, volume: 1, rate: 0.6 });
    audio.play('scare_hit', { object: slap, volume: 0.7 });
    cameraRig.shake(0.3);
    onSlap?.();
    try {
      taxi.addGlassMark?.('windshield', 'handprint', new THREE.Vector2(0.4, 0.82), { size: 1.4, drag: true });
    } catch (e) { /* optional */ }
    await this._wait(0.9);
    // leap off into the trees
    this.h.setHandTarget('R', null);
    const p0 = worldPos(this.h.root, new THREE.Vector3());
    engine.scene.attach(this.h.root);
    const side = new THREE.Vector3(-1, 0, 0).applyQuaternion(taxi.root.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(taxi.root.quaternion);
    audio.play('branch_crack', { position: p0.clone().addScaledVector(side, 6), volume: 0.8 });
    await animate(0.8, (k) => {
      this.h.root.position.copy(p0).addScaledVector(side, k * 7).addScaledVector(fwd, k * 3);
      this.h.root.position.y = p0.y + Math.sin(k * Math.PI) * 2 + k * 2;
      this.h.setOpacity(1 - k * k);
    });
    slap.removeFromParent();
    this.root.add(this.h.root);
    this.h.setVisible(false);
    return true;
  }

  // ------------------------------------------------------------------------------------------
  /**
   * A woman runs beside the car (any speed), her neck slowly turning toward the driver.
   * opts { taxi, side 'L', duration, mirrorFirst (seconds on REFLECTION_ONLY before she is real), along }
   */
  async _runBeside({ taxi, side = 'L', duration = 10, mirrorFirst = 3.5, along = 2.4, world } = {}) {
    this._toScene();
    const sg = side === 'L' ? -1 : 1;
    this.h.setMode('run');
    this.h.setLayer(mirrorFirst > 0 ? LAYERS.REFLECTION_ONLY : LAYERS.DEFAULT);
    this.h.setGhost({ stare: 1, jitter: 0.15, unlimited: 1 }, 100);
    this.h.lookAt(null);
    let t = 0, al = along + 3;
    let real = mirrorFirst <= 0;
    const W = world || this.world || taxi.world;
    while (t < duration && !this.aborted) {
      const dt = engine.dt || 1 / 60;
      await sleep(0);
      t += dt;
      al += ((t < duration * 0.6 ? along : along - 1.8) - al) * (1 - Math.exp(-0.8 * dt));
      _v.set(sg * (1.85 + noise.noise2D(t * 0.6, 1) * 0.15), 0, al);
      taxi.root.updateWorldMatrix(true, false);
      _v.applyMatrix4(taxi.root.matrixWorld);
      _v.y = groundAt(W, _v.x, _v.z, taxi.root.position.y);
      this.h.root.position.copy(_v);
      this.h.root.rotation.set(0, taxi.root.rotation.y, 0);
      this.h._gaitScale = 1 + clamp((taxi.speedKmh || 0) / 70, 0, 1.2);
      if (!real && t > mirrorFirst) {
        real = true;
        this.h.setLayer(LAYERS.DEFAULT);
        this.h.lookAt(engine.camera, { speed: 0.6, unlimited: true });
        this.h.setGhost({ neckTwist: sg * -0.5 }, 0.5);
      }
    }
    await animate(0.8, (k) => this.h.setOpacity(1 - k));
    this.h.setVisible(false);
    this.h.setLayer(LAYERS.DEFAULT);
    return true;
  }

  // ------------------------------------------------------------------------------------------
  /** Stand still at a world position, staring at `face` (Object3D/Vector3). Vanishes on stop(). */
  async _treeWatch({ pos, face = engine.camera, duration = 10, gazeHide = null } = {}) {
    this._toScene();
    this.h.root.position.copy(pos);
    const fp = face.isObject3D ? worldPos(face, _v) : face;
    this.h.root.rotation.set(0, Math.atan2(-(fp.x - pos.x), -(fp.z - pos.z)), 0);
    this.h.setMode('stand');
    this.h.setGhost({ stare: 1, headRoll: 0.18, still: 1 }, 100);
    this.h.lookAt(face, { speed: 0.8, weight: 0.7 });
    let t = 0;
    while (t < duration && !this.aborted) {
      await sleep(0.1);
      t += 0.1;
      if (gazeHide && gazeHide()) break;
    }
    this.h.setVisible(false);
    return true;
  }

  /** Stand dead centre in the lane, arms at the sides, not hailing. */
  async _standInRoad({ pos, facing = 0, duration = 10 } = {}) {
    this._toScene();
    this.h.root.position.copy(pos);
    this.h.root.rotation.set(0, facing, 0);
    this.h.setMode('stand');
    this.h.setGhost({ still: 1, stare: 1, headRoll: 0.12, headPitch: 0.12 }, 100);
    this.h.lookAt(engine.camera, { speed: 0.5, weight: 0.5 });
    await this._wait(duration);
    return true;
  }

  // ------------------------------------------------------------------------------------------
  /** A too-tall shape at the window taps the glass three times; an unlit cigarette in its fingers. */
  async _knockWindow({ taxi, pane = 'fr', duration = 10, knocks = 3, onKnock } = {}) {
    const body = this._attach(taxi);
    const f = paneFrame(taxi, pane);
    const N = dirToBody(taxi, f.normal, new THREE.Vector3()).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const glass = toBody(taxi, panePoint(f, 0.1, -0.05, 0.015, _v), new THREE.Vector3());
    const ground = toBody(taxi, worldPos(taxi.root, _v2).setY(groundAt(this.world || taxi.world, _v2.x, _v2.z, taxi.root.position.y)), new THREE.Vector3());
    humanoidFacing(N.clone().negate(), up, this.h.root.quaternion);
    this.h.root.position.copy(glass).addScaledVector(N, 0.62);
    this.h.root.position.y = ground.y;
    this.h.setMode('stand');
    this.h.setGhost({ backbend: -0.45, headPitch: 0.25, stare: 1, still: 0.6 }, 100);
    this.h.holdItem?.('cigarette', 'L');
    this.h.lookAt(engine.camera, { speed: 1, weight: 0.8 });
    try {
      taxi.setFog?.(pane, 0.85);
      taxi.glass?.fillFog?.(pane, 0.8);
    } catch (e) { /* optional */ }
    const knuckle = new THREE.Object3D();
    body.add(knuckle);
    for (let i = 0; i < knocks && !this.aborted; i++) {
      const p = glass.clone().addScaledVector(up, 0.03 * i);
      await animate(0.18, (k) => {
        knuckle.position.copy(p).addScaledVector(N, 0.06 * (1 - k));
        this.h.setHandTarget('R', knuckle, { weight: 1, fingers: 'grip', grip: 1, blend: 0.05 });
      });
      audio.play('knock', { object: knuckle, volume: 0.85, rate: 1.05 });
      onKnock?.(i);
      await animate(0.22, (k) => knuckle.position.copy(p).addScaledVector(N, 0.07 * k));
      await sleep(rand(0.25, 0.5));
    }
    this.h.setHandTarget('R', null);
    await this._wait(Math.max(0, duration - 3));
    knuckle.removeFromParent();
    this.h.dropItem?.('cigarette');
    await animate(0.6, (k) => this.h.setOpacity(1 - k));
    this.h.setVisible(false);
    return true;
  }

  /** Long grey arm through an open window: grabs at the driver (death cinematics use it). */
  armThroughWindow(taxi, pane = 'fr') {
    if (!this.hand) {
      this.hand = new HandRig({ shape: { fingerScale: 1.5, bony: 0.9, nails: 0.12, forearm: 4.2, thickness: 0.82, cell: 0.026 }, pale: 0.62, twitch: 0.5, detailScale: 22 });
      this.hand.mesh.scale.setScalar(0.105);
    }
    const H = this.hand;
    const body = bodyOf(taxi);
    body.add(H.mesh);
    H.mesh.visible = true;
    const f = paneFrame(taxi, pane);
    const N = dirToBody(taxi, f.normal, new THREE.Vector3()).normalize();
    const c = toBody(taxi, f.center, new THREE.Vector3());
    // fingers point inward (-N), palm down
    const Y = N.clone().negate(), Z = new THREE.Vector3(0, -1, 0);
    const X = new THREE.Vector3().crossVectors(Y, Z);
    quatFromBasis(X, Y, Z, H.mesh.quaternion);
    H.mesh.position.copy(c).addScaledVector(N, 0.5);
    H.setCurl(-0.2, 100);
    return { hand: H, inward: N.clone().negate(), center: c };
  }

  dispose() {
    if (this.hand) {
      this.hand.mesh.removeFromParent();
      this.hand.material.dispose();
      this.hand.rig.skeleton.dispose();
    }
    if (this.ownsHumanoid) this.h.dispose();
    super.dispose();
  }
}

export { easeOut, quatFromBasis };
