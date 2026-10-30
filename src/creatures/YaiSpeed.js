// ยายสปีด (Yai Speed): a tiny, bent old grandmother who sprints beside the car at ANY speed with
// an impossible gait: the sprint clip runs far faster than her body moves, stiff arms trail behind
// her palms-up, her bare feet slap the asphalt, and while she runs she turns her head 180° to grin
// at the driver. Slow down and she overtakes and runs off into the dark; stare at her and speed up
// and she leaps onto the hood, spread-eagled against the windshield, until the amulet throws her off.
//   const y = createYaiSpeed(); scene.add(y.root);
//   y.runAlongside(taxi, 'L', { along: 6 }); y.setAlong(-0.4); y.turnHead(true); await y.landOnHood(taxi);
import * as THREE from 'three';
import { audio } from '../audio/index.js';
import { engine } from '../core/Engine.js';
import { cameraRig } from '../core/CameraRig.js';
import { SPECS, human, groundAt } from './humans.js';
import { Entity, animate, sleep, damp, clamp, lerp, easeInOut, noise, worldPos, rand } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class YaiSpeed extends Entity {
  constructor(opts = {}) {
    super('yaiSpeed');
    this.h = human(SPECS.yaiSpeed, opts);
    this.humanoid = this.h;
    this.root.add(this.h.root);
    this.mode = 'idle';
    this.taxi = null;
    this.side = 'L';
    this.lat = 1.9; // metres from the car's centre line
    this.along = 8; // + behind the car centre (car local +Z), - ahead
    this.alongT = 8;
    this.latT = 1.9;
    this.world = opts.world || null;
    this.gazeTarget = null;
    this._stepT = 0;
    this.h.onFootstep = () => {
      if (this.mode !== 'run' || this._stepT > 0) return;
      this._stepT = 0.07;
      audio.play('footstep_asphalt', { object: this.h.root, volume: 0.55, rate: rand(1.15, 1.45) });
    };
    this.h.setExpression({ creepy: 0.8, smile: 0.6 });
  }

  /** Lock to the taxi: side 'L' (passenger / road shoulder) or 'R' (driver side). opts { along, lat, world } */
  runAlongside(taxi, side = 'L', opts = {}) {
    this.taxi = taxi;
    this.side = side;
    this.world = opts.world || this.world || taxi.world || null;
    this.along = this.alongT = opts.along ?? 8;
    this.lat = this.latT = opts.lat ?? 1.95;
    if (this.root.parent !== engine.scene && !opts.keepParent) engine.scene.add(this.root);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.h.root.position.set(0, 0, 0);
    this.mode = 'run';
    this.h.setGhost({ jitter: 0.22, stare: 1, unlimited: 1 }, 4);
    this.h.play('sprint', { target: engine.camera });
    this.h.lookAt(this.gazeTarget || engine.camera, { speed: 10, unlimited: true });
    this._place(0);
    this.h.root.visible = true;
    this.h.setOpacity(1);
    return this;
  }
  /** Change her position along the car (+ behind, − ahead); she accelerates / falls back smoothly. */
  setAlong(z, lat) {
    this.alongT = z;
    if (lat !== undefined) this.latT = lat;
  }
  /** Turn the head 180° (grinning back at the driver while her body runs forward). */
  turnHead(on = true) {
    this.h.setGhost({ neckTwist: on ? Math.PI * (this.side === 'L' ? -1 : 1) : 0, jitter: on ? 0.35 : 0.22 }, on ? 1.6 : 3);
    if (on) audio.play('neck_snap', { object: this.h.root, volume: 0.5 });
  }
  setGaze(target) {
    this.gazeTarget = target;
    this.h.lookAt(target || null, { speed: 10, unlimited: true });
  }
  /** Run off ahead into the dark and vanish. */
  async passAndVanish() {
    this.setAlong(-28);
    await sleep(2.2);
    await animate(1.2, (k) => this.h.setOpacity(1 - k));
    this.stop();
  }
  stop() {
    this.mode = 'idle';
    this.h.stop('sprint');
    this.h.root.visible = false;
  }

  _place(dt) {
    const t = this.taxi;
    if (!t) return;
    const sgn = this.side === 'L' ? -1 : 1;
    // follows the car exactly (no lag at any speed); changes of position along it are eased
    const k = 1 - Math.exp(-1.2 * dt);
    this.along += (this.alongT - this.along) * k;
    this.lat += (this.latT - this.lat) * k;
    const wob = noise.noise2D(this.time * 0.8, 3.3) * 0.18;
    _v.set(sgn * (this.lat + wob), 0, this.along);
    t.root.updateWorldMatrix(true, false);
    _v.applyMatrix4(t.root.matrixWorld);
    _v.y = groundAt(this.world, _v.x, _v.z, t.root.position.y);
    this.root.position.copy(_v);
    // face the car's travel direction, leaning in
    _e.set(0, t.root.rotation.y, 0, 'YXZ');
    this.root.quaternion.setFromEuler(_e);
  }

  step(dt) {
    this._stepT -= dt;
    if (this.mode === 'run') {
      this._place(dt);
      // impossible cadence: the faster the car, the more the clip over-spins
      const kmh = this.taxi?.speedKmh ?? 30;
      this.h._gaitScale = 1.1 + clamp(kmh / 60, 0, 1.6) + noise.noise2D(this.time * 0.7, 9.1) * 0.25;
    }
  }

  /** Leap onto the hood and cling to the windshield. Returns after she lands. */
  async landOnHood(taxi = this.taxi) {
    if (!taxi) return;
    this.mode = 'leap';
    this.h.stop('sprint');
    const body = taxi.bodyInner || taxi.root;
    const from = worldPos(this.h.root, new THREE.Vector3());
    body.attach(this.root);
    const p0 = body.worldToLocal(from.clone());
    const p1 = new THREE.Vector3(0.12, 0.95, -1.15);
    this.root.position.copy(p0);
    this.root.rotation.set(0, Math.PI, 0); // facing the driver
    this.h.setMode('crouch');
    this.h.setGhost({ neckTwist: 0, headRoll: 0.35, jitter: 0.5, stare: 1, mouthStretch: 0.6, unlimited: 1 }, 6);
    audio.play('sting_high', { object: taxi.root, volume: 0.9 });
    await animate(0.42, (k) => {
      this.root.position.lerpVectors(p0, p1, k);
      this.root.position.y += Math.sin(k * Math.PI) * 0.9;
    }, easeInOut);
    audio.play('thump_roof', { object: taxi.root, volume: 1, rate: 0.8 });
    audio.play('scare_hit', { object: taxi.root, volume: 0.9 });
    cameraRig.shake(0.6);
    // hands slam the glass, face pressed in front of the driver
    const glassPt = new THREE.Object3D();
    glassPt.position.set(0.3, 1.12, -0.86);
    body.add(glassPt);
    this._glassPt = glassPt;
    this.h.play('pressFaceToGlass', { target: glassPt, normal: new THREE.Vector3(0, 0.35, -1).applyQuaternion(body.getWorldQuaternion(_q)) });
    this.h.lookAt(engine.camera, { speed: 14, unlimited: true });
    try {
      taxi.addGlassMark?.('windshield', 'handprint', new THREE.Vector2(0.62, 0.5), { size: 1.3, drag: true });
      taxi.addGlassMark?.('windshield', 'handprint', new THREE.Vector2(0.86, 0.46), { size: 1.25, angle: 0.4 });
      taxi.addGlassMark?.('windshield', 'scratch', new THREE.Vector2(0.75, 0.62), { size: 1.4 });
    } catch (e) { /* glass marks optional */ }
    this.mode = 'hood';
  }

  /** Thrown off the hood (amulet): flung sideways, tumbling into the dark. */
  async throwOff(taxi = this.taxi) {
    if (this.mode !== 'hood') return;
    this.mode = 'thrown';
    this.h.stop('pressFaceToGlass');
    const p0 = worldPos(this.root, new THREE.Vector3());
    engine.scene.attach(this.root);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(taxi.root.quaternion).multiplyScalar(this.side === 'L' ? -1 : 1);
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(taxi.root.quaternion);
    audio.play('scream_far', { position: p0, volume: 0.8, rate: 1.2 });
    this.h.setGhost({ limbBreak: 0.6, jitter: 0.8 }, 8);
    const r0 = this.root.rotation.z;
    await animate(0.9, (k) => {
      this.root.position.copy(p0).addScaledVector(side, k * 6).addScaledVector(back, k * k * 9);
      this.root.position.y = p0.y + Math.sin(k * Math.PI) * 1.2 - k * 0.8;
      this.root.rotation.z = r0 + k * 5;
      this.h.setOpacity(1 - k * k);
    });
    this._glassPt?.removeFromParent();
    this.stop();
  }

  dispose() {
    this._glassPt?.removeFromParent();
    this.h.dispose();
    super.dispose();
  }
}

export { lerp, damp };
