// Vehicles: the taxi (exterior, interior, controls, glass, mirrors, physics) and the
// intro motorcycle (contract: docs/ARCHITECTURE.md "vehicle").
// STUB IMPLEMENTATION — the vehicle agent replaces internals; signatures must stay.
import * as THREE from 'three';
import { paintedMaterial } from '../render/index.js';

// Taxi-local frame: +X right, +Y up, -Z forward. Right-hand drive (Thailand): driver sits at +X.
export const TAXI_ANCHORS = {
  driverSeat: [0.36, 0.42, 0.15], frontPassengerSeat: [-0.36, 0.42, 0.15], rearLeftSeat: [-0.38, 0.44, 1.05],
  rearRightSeat: [0.38, 0.44, 1.05], rearCenterSeat: [0, 0.46, 1.05], driverEye: [0.36, 1.12, 0.12],
  steeringWheel: [0.36, 0.86, -0.38], gearKnob: [0.02, 0.62, -0.32], handbrake: [0.12, 0.45, 0.0], keySlot: [0.55, 0.78, -0.48],
  pedalThrottle: [0.48, 0.12, -0.78], pedalBrake: [0.33, 0.14, -0.78], pedalClutch: [0.2, 0.14, -0.78],
  radioKnob: [0.0, 0.8, -0.62], meter: [-0.05, 0.98, -0.58], cabinLight: [0, 1.22, 0.2], headlightStalk: [0.58, 0.82, -0.4],
  wiperStalk: [0.16, 0.82, -0.4], hornPad: [0.36, 0.86, -0.36], windowCrankFR: [0.72, 0.62, -0.05], windowCrankFL: [-0.72, 0.62, -0.05],
  amuletHang: [0, 1.05, -0.5], rearviewMirror: [0, 1.17, -0.55], mirrorLeft: [-0.98, 0.92, -0.58], mirrorRight: [0.98, 0.92, -0.58],
  trunk: [0, 0.85, 2.15], roofTop: [0, 1.45, 0.3], hood: [0, 0.85, -1.6], headlightL: [-0.62, 0.62, -2.25], headlightR: [0.62, 0.62, -2.25],
  taillightL: [-0.65, 0.75, 2.25], taillightR: [0.65, 0.75, 2.25], gloveBox: [-0.4, 0.72, -0.55], sunVisorDriver: [0.36, 1.2, -0.42],
  doorFL: [-0.8, 0.7, -0.15], doorFR: [0.8, 0.7, -0.15], doorRL: [-0.8, 0.7, 0.9], doorRR: [0.8, 0.7, 0.9],
};

export class Taxi {
  /** opts { world } */
  constructor(opts = {}) {
    this.kind = 'taxi';
    this.world = opts.world || null;
    this.root = new THREE.Group();
    this.root.name = 'taxi';
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.2, 4.5), paintedMaterial({ color: 0x5a8a3a }));
    body.position.y = 0.8;
    this.root.add(body);
    this.interior = new THREE.Group();
    this.root.add(this.interior);
    this.anchors = {};
    for (const [k, v] of Object.entries(TAXI_ANCHORS)) {
      const a = new THREE.Object3D();
      a.name = k;
      a.position.set(v[0], v[1], v[2]);
      this.root.add(a);
      this.anchors[k] = a;
    }
    this.seats = { driver: this.anchors.driverSeat, frontPassenger: this.anchors.frontPassengerSeat, rearLeft: this.anchors.rearLeftSeat, rearRight: this.anchors.rearRightSeat, rearCenter: this.anchors.rearCenterSeat };
    this.state = {
      keyInserted: false, ignition: 'off', engineOn: false, gear: 'N', handbrake: true, headlights: 'off', cabinLight: false,
      indicator: 'off', wipers: 0, radioOn: false, radioStation: 0, meterOn: false, vacantLamp: true, horn: false,
      windows: { fl: 0, fr: 0, rl: 0, rr: 0 }, doors: { fl: 0, fr: 0, rl: 0, rr: 0, trunk: 0 },
    };
    this.physics = { speed: 0, rpm: 0, steer: 0, wheelAngle: 0, onRoad: true, roadRef: null, frozen: false };
    this.mirrors = {};
    this.glass = {};
    this.controlsEnabled = false;
  }
  /** Place the taxi (wheels on the ground) at a world position with heading yaw (radians, 0 = facing -Z). */
  setPose(pos, yaw) { this.root.position.copy(pos); this.root.rotation.set(0, yaw, 0); this.physics.speed = 0; }
  /** Player input drives the car when true. */
  setControlsEnabled(v) { this.controlsEnabled = v; }
  /** Physically interactive controls (look + click) on/off; ids 'taxi.*' registered with core/interact. */
  setInteractionsEnabled(v) {}
  /** AI driving along a spline (menu / cinematics). spec {splineId, s, speed, lane=-1.55, stopAt?: s} or null to stop. */
  autopilot(spec) {}
  /** Change a control with its animation/sound. control: 'key'|'ignition'|'gear'|'handbrake'|'headlights'|'cabinLight'|'indicator'|
   *  'wipers'|'radio'|'radioTune'|'meter'|'horn'|'window'|'door'|'trunk'; value depends on control. Emits 'taxi:control'. */
  setControl(control, value, opts = {}) {
    if (control === 'cabinLight') this.state.cabinLight = !!value;
    if (control === 'headlights') this.state.headlights = value;
  }
  /** Door open amount 0..1 animated. door 'fl'|'fr'|'rl'|'rr'|'trunk' -> Promise */
  openDoor(door, amount = 1, duration = 0.8) { this.state.doors[door] = amount; return Promise.resolve(); }
  /** Which glass/mirror the player is currently looking through: 'windshield'|'rear'|'fl'|'fr'|'rl'|'rr'|
   *  'mirror_rear'|'mirror_left'|'mirror_right'|'interior'|null */
  getGazeTarget() { return 'windshield'; }
  /** Simulated passenger weight per seat (suspension sag; ghosts weigh nothing). */
  setSeatWeight(seat, kg) {}
  /** Condensation level 0..1 on a glass ('all' for every pane), e.g. cold ghost presence. */
  setFog(glass, amount) {}
  /** Extra uniforms for horror effects on the glass: handprints, face press, writing. glass id, kind:'handprint'|'face'|'scratch'|'text', uv:Vector2 */
  addGlassMark(glass, kind, uv, opts = {}) {}
  /** Cabin interior light level (0..1) for darkness gameplay, including flicker override. */
  get cabinBrightness() { return this.state.cabinLight ? 1 : 0; }
  update(dt) {}
  dispose() { this.root.removeFromParent(); }
}

export class Motorcycle {
  constructor(opts = {}) {
    this.kind = 'bike';
    this.world = opts.world || null;
    this.root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 1.8), paintedMaterial({ color: 0x5a2a1a }));
    body.position.y = 0.6;
    this.root.add(body);
    this.anchors = {};
    const A = { seat: [0, 0.78, 0.1], handleL: [-0.33, 1.0, -0.55], handleR: [0.33, 1.0, -0.55], footL: [-0.22, 0.32, -0.05], footR: [0.22, 0.32, -0.05], eye: [0, 1.48, 0.0], headlight: [0, 0.95, -0.85] };
    for (const [k, v] of Object.entries(A)) {
      const a = new THREE.Object3D();
      a.position.set(v[0], v[1], v[2]);
      this.root.add(a);
      this.anchors[k] = a;
    }
    this.state = { engineOn: true, headlight: true };
    this.physics = { speed: 0, rpm: 0, steer: 0, lean: 0, roadRef: null };
  }
  setPose(pos, yaw) { this.root.position.copy(pos); this.root.rotation.set(0, yaw, 0); }
  setControlsEnabled(v) {}
  autopilot(spec) {}
  update(dt) {}
  dispose() { this.root.removeFromParent(); }
}
