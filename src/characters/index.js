// Characters: procedural skinned humans, faces, IK and procedural animation
// (contract: docs/ARCHITECTURE.md "characters").
// STUB IMPLEMENTATION — the characters agent replaces internals; signatures must stay.
import * as THREE from 'three';
import { paintedMaterial } from '../render/index.js';
import { engine } from '../core/Engine.js';

/**
 * Appearance spec for createHumanoid (all optional):
 * { id, sex:'m'|'f', age: 6..90, height (m), build:'thin'|'average'|'heavy', skinTone: 0..1 (light..dark),
 *   hair: { style:'short'|'long'|'bob'|'bun'|'bald'|'shaved'|'gray-short'|'ponytail'|'messy', color },
 *   outfit: { type:'tshirt-pants'|'shirt-slacks'|'dress'|'school-uniform'|'monk-robe'|'sabai'|'taxi-uniform'|
 *             'market-vendor'|'tank-sarong'|'hoodie-jeans'|'old-woman-sarong'|'farmer'|'shroud', top, bottom, accent, shoes:'sandals'|'shoes'|'barefoot' },
 *   accessories: ['glasses','cap','headscarf','garland','shoulder-bag','basket','amulet-necklace','helmet','cigarette','lunchbox','umbrella'],
 *   face: { seed, wrinkles 0..1, smile 0..1 (resting), eyeSize, noseWidth, jaw, cheek },
 *   ghost: { pale 0..1, eyes:'normal'|'black'|'white'|'glow', wet 0..1, decay 0..1, bloodStains 0..1 } }
 */
export class Humanoid {
  constructor(spec = {}) {
    this.spec = spec;
    this.root = new THREE.Group();
    this.root.name = 'humanoid:' + (spec.id || 'anon');
    const h = spec.height ?? 1.65;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, h - 0.6, 4, 8), paintedMaterial({ color: 0x777788 }));
    body.position.y = h / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), paintedMaterial({ color: 0xb08060 }));
    head.position.y = h - 0.12;
    this.root.add(body, head);
    this._head = head;
    this.bones = {}; // name -> THREE.Bone (see docs for the bone list)
    this.expression = { smile: 0, sad: 0, fear: 0, anger: 0, creepy: 0, surprise: 0 };
    this.ghost = { neckTwist: 0, headRoll: 0, headPitch: 0, backbend: 0, armTwist: 0, jitter: 0, levitate: 0, mouthStretch: 0, limbBreak: 0, crawl: 0, stretch: 0 };
    this.mode = 'stand';
    this.headPosition = new THREE.Vector3();
    this.eyePosition = new THREE.Vector3();
    this._off = engine.onUpdate((dt) => this.update(dt), 20);
  }
  /** Base pose / locomotion mode: 'stand'|'idle'|'sit'|'sitCar'|'drive'|'ride'|'walk'|'run'|'crouch'|'lie'|'float'|'crawl'|'hang' */
  setMode(mode, opts = {}) { this.mode = mode; }
  /** Walk to a world position. opts {speed=1.2, run=false, onArrive, faceAtEnd: yaw} -> Promise */
  walkTo(pos, opts = {}) { this.root.position.copy(pos); opts.onArrive?.(); return Promise.resolve(); }
  /** Head + eye tracking. target Vector3|Object3D|null. opts {weight=1, speed=4, eyesOnly=false, unlimited=false (ghost: head can over-rotate)} */
  lookAt(target, opts = {}) {}
  /** Two-bone arm IK. side 'L'|'R'; target Object3D|Vector3|null; opts {weight=1, grip=0..1, blend=0.3, poleHint: Vector3} */
  setHandTarget(side, target, opts = {}) {}
  /** Leg IK. side 'L'|'R'; target Object3D|Vector3|null; opts {weight=1} */
  setFootTarget(side, target, opts = {}) {}
  /** Seat the character at an anchor (hips at anchor, facing anchor -Z). opts {pose:'sit'|'sitCar'|'drive'} */
  sitAt(anchor, opts = {}) { anchor.add(this.root); this.root.position.set(0, -0.45, 0); this.mode = opts.pose || 'sit'; }
  /** Detach from anchor back into `parent` (default scene), keeping world transform. */
  detach(parent = engine.scene) { parent.attach(this.root); }
  /** Lip-sync / talking flap. talking boolean; amplitude 0..1 */
  setTalking(talking, amplitude = 1) {}
  /** Expression targets (smoothed): { smile, sad, fear, anger, creepy, surprise } 0..1 */
  setExpression(e) { Object.assign(this.expression, e); }
  /** Supernatural deformation targets (smoothed over `speed`): see this.ghost keys. neckTwist/headRoll/headPitch in radians, others 0..1 */
  setGhost(g, speed = 3) { Object.assign(this.ghost, g); }
  /** Procedural action clips. name: 'hail'|'wave'|'wai'|'smoke'|'giveItem'|'takeItem'|'sitDown'|'standUp'|'enterCar'|'exitCar'|
   *  'nod'|'shakeHead'|'laugh'|'cry'|'point'|'pray'|'shiver'|'neckSnap'|'crawlOverSeat'|'emergeFromBelow'|'pressFaceToGlass'|
   *  'ceilingCrawl'|'sprint'|'stagger'|'sing'|'knock'|'reachOut'|'lookAround'|'sleep'|'pay'
   *  opts depend on action (e.g. {target, door, duration, loop}). Returns Promise resolved when the action finishes (loops resolve on stop). */
  play(name, opts = {}) { return Promise.resolve(); }
  stop(name) {}
  /** Put all meshes on a render layer (e.g. LAYERS.MAIN_ONLY = no reflection). */
  setLayer(layer) { this.root.traverse((o) => o.layers.set(layer)); }
  /** A copy on LAYERS.REFLECTION_ONLY that mirrors this character's pose each frame; ghostOverrides applied on top
   *  (e.g. {neckTwist: 1.6} for the "twisted neck only in reflections" scare). Returns Humanoid. */
  createReflectionDouble(ghostOverrides = {}) { return new Humanoid(this.spec); }
  setVisible(v) { this.root.visible = v; }
  setOpacity(a) {}
  update(dt) {
    this._head.getWorldPosition(this.headPosition);
    this.eyePosition.copy(this.headPosition);
  }
  dispose() { this._off(); this.root.removeFromParent(); }
}

/** Create a character from an appearance spec (geometry cached per body-shape hash). */
export function createHumanoid(spec = {}) {
  return new Humanoid(spec);
}

/**
 * The player's own full body (first person). Head/hair on LAYERS.PLAYER_HEAD (visible only in mirrors).
 * Use with cameraRig.attach(player.eye, player.base).
 */
export class PlayerBody {
  constructor(spec = {}) {
    this.humanoid = createHumanoid({ id: 'player', sex: 'm', age: 27, ...spec });
    this.root = this.humanoid.root;
    this.eye = new THREE.Object3D();
    this.eye.position.set(0, 1.62, -0.08);
    this.root.add(this.eye);
    this.base = this.root; // forward frame for the camera when walking
    this.mode = 'foot'; // 'foot'|'car'|'bike'|'cinematic'
    this.held = null;
  }
  /** Sit in a vehicle seat and grip its controls. vehicle: Taxi|Motorcycle (uses vehicle.anchors). */
  enterVehicle(vehicle, opts = {}) { this.mode = vehicle.kind === 'bike' ? 'bike' : 'car'; }
  exitVehicle(opts = {}) { this.mode = 'foot'; }
  /** Reach a hand to a world point / Object3D, then return. opts {hand:'L'|'R'|'auto', duration=0.5, hold=0.15, grip=1} -> Promise resolved at contact */
  reach(target, opts = {}) { return Promise.resolve(); }
  /** Hold an item in hand: 'paper'|'amulet'|'keys'|'coffee'|'coins'|'garland'|null. opts {hand, raise (bring up to view)} */
  hold(item, opts = {}) { this.held = item; }
  /** Wipe condensation gesture at a world point on glass. */
  wipe(point) {}
  /** On-foot locomotion from input (WASD) with collisions & head bob; enabled when mode==='foot'. */
  setWalkEnabled(v) {}
  setPosition(pos, yaw = 0) { this.root.position.copy(pos); this.root.rotation.y = yaw; }
  update(dt) {}
}

/** Animals. kind: 'elephant'|'elephantCalf'|'dog'. -> { root, setGait('idle'|'walk'|'trot'|'run'), walkTo(pos, opts) -> Promise, lookAt(t), bark(), update(dt), dispose() } */
export function createQuadruped(kind, opts = {}) {
  const root = new THREE.Group();
  const s = kind === 'elephant' ? 3 : kind === 'elephantCalf' ? 1.5 : 0.6;
  const m = new THREE.Mesh(new THREE.BoxGeometry(s * 0.6, s * 0.6, s), paintedMaterial({ color: 0x555555 }));
  m.position.y = s * 0.6;
  root.add(m);
  return { root, setGait() {}, walkTo(p) { root.position.copy(p); return Promise.resolve(); }, lookAt() {}, bark() {}, update() {}, dispose() { root.removeFromParent(); } };
}
