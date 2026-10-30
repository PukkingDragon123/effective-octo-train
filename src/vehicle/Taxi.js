// The taxi: assembles exterior, interior, glass, mirrors, lights, physics and controls,
// owns the per-frame update (engine order 10) and the pre-render passes (mirrors, glass
// reflection). Public API = the contract in src/vehicle/index.js (+ documented extras).
import * as THREE from 'three';
import { engine } from '../core/Engine.js';
import { input } from '../core/Input.js';
import { bus } from '../core/Events.js';
import { settings } from '../core/Settings.js';
import { cameraRig } from '../core/CameraRig.js';
import { LAYERS } from '../core/layers.js';
import { clamp, damp, lerp, wrapAngle } from '../core/math.js';
import { audio } from '../audio/index.js';
import { GLOBAL_UNIFORMS } from '../render/index.js';
import { LAYOUT } from '../world/layout.js';
import { buildTaxiExterior } from './TaxiModel.js';
import { buildTaxiInterior, INT } from './TaxiInterior.js';
import { GlassSystem } from './Glass.js';
import { MirrorSystem } from './Mirrors.js';
import { TaxiLights } from './Lights.js';
import { CarPhysics, CAR, setPhysicsWetness } from './CarPhysics.js';
import { TaxiControls, STATIONS } from './TaxiControls.js';
import { DIM } from './TaxiBody.js';
import { getVehicleAssets } from './VehicleAssets.js';
import { buildTaxiFromGLB } from './TaxiGLB.js';
import { collectRefs, mergeStaticMeshes, DetailCuller, measureRimRadius } from './optimize.js';
import { Garland, AmuletCluster, GARLAND_UNIFORMS } from './Garland.js';
import { TaxiBlood } from './Blood.js';

// Taxi-local frame: +X right, +Y up, -Z forward. Right-hand drive (Thailand): driver sits at +X.
export const TAXI_ANCHORS = {
  driverSeat: [0.37, 0.5, 0.14], frontPassengerSeat: [-0.37, 0.5, 0.14], rearLeftSeat: [-0.4, 0.47, 1.02],
  rearRightSeat: [0.4, 0.47, 1.02], rearCenterSeat: [0, 0.48, 1.02], driverEye: [0.37, 1.15, 0.24],
  steeringWheel: [0.37, 0.84, -0.26], gearKnob: [0.05, 0.67, -0.22], handbrake: [0.1, 0.48, -0.17], keySlot: [0.5, 0.76, -0.37],
  pedalThrottle: [0.49, 0.18, -0.84], pedalBrake: [0.33, 0.2, -0.84], pedalClutch: [0.19, 0.2, -0.84],
  radioKnob: [-0.0675, 0.737, -0.586], meter: [-0.06, 0.975, -0.72], cabinLight: [0, 1.34, 0.25], headlightStalk: [0.58, 0.79, -0.33],
  wiperStalk: [0.16, 0.79, -0.33], hornPad: [0.37, 0.84, -0.24], windowCrankFR: [0.75, 0.59, -0.71], windowCrankFL: [-0.75, 0.59, -0.71],
  amuletHang: [0, 1.2, -0.46], rearviewMirror: [0, 1.228, -0.455], mirrorLeft: [-1.03, 1.0, -0.82], mirrorRight: [1.03, 1.0, -0.82],
  trunk: [0, 0.98, 2.12], roofTop: [0, 1.42, 0.3], hood: [0, 0.86, -1.6], headlightL: [-0.515, 0.595, -2.2], headlightR: [0.515, 0.595, -2.2],
  taillightL: [-0.55, 0.8, 2.18], taillightR: [0.55, 0.8, 2.18], gloveBox: [-0.41, 0.66, -0.7], sunVisorDriver: [0.45, 1.29, -0.3],
  doorFL: [-0.95, 0.8, -0.12], doorFR: [0.95, 0.8, -0.12], doorRL: [-0.95, 0.8, 0.62], doorRR: [0.95, 0.8, 0.62],
  dashSticker: [-0.45, 0.842, -0.5955],
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ray = new THREE.Ray();
const _plane = new THREE.Plane();
const _C = new THREE.Vector3(), _N = new THREE.Vector3(), _U = new THREE.Vector3(), _R = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
_raycaster.layers.enableAll();

/** Every live taxi (for picking which one drives the shared engine / radio sounds). */
const TAXIS = new Set();
let _ownerFrame = -1;
let _owner = null;
function audioOwner() {
  if (_ownerFrame === engine.frame && (!_owner || TAXIS.has(_owner))) return _owner;
  _ownerFrame = engine.frame;
  let best = null, bestScore = Infinity;
  const cam = engine.camera.position;
  for (const t of TAXIS) {
    // player-driven or the camera in the cabin wins; then autopilot; then the nearest one
    let score = t.root.position.distanceTo(cam);
    if (t.controlsEnabled || t.isCameraInside()) score -= 1e6;
    else if (t.autopilotSpec) score -= 1e3;
    if (t === _owner) score -= 2; // hysteresis
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  _owner = best;
  return best;
}

export class Taxi {
  /** opts { world, interactions=false, controls=false, procedural=false (ignore taxi.glb) } */
  constructor(opts = {}) {
    this.kind = 'taxi';
    this.world = opts.world || null;
    this.layout = LAYOUT;
    this.time = 0;
    this.root = new THREE.Group();
    this.root.name = 'taxi';
    this.root.rotation.order = 'YXZ';
    this.chassis = new THREE.Group(); // ground level: wheels, road glows
    this.root.add(this.chassis);
    this.bodyPivot = new THREE.Group(); // suspension
    this.bodyPivot.position.set(0, 0.55, -0.1);
    this.root.add(this.bodyPivot);
    this.bodyInner = new THREE.Group();
    this.bodyInner.position.set(0, -0.55, 0.1);
    this.bodyPivot.add(this.bodyInner);

    // ---- build ------------------------------------------------------------------------------
    // professional model when taxi.glb is loaded (loadVehicleAssets), procedural otherwise
    let ext = null, int = null, glbAnchors = null;
    const assets = getVehicleAssets();
    if (assets.taxi && !opts.procedural) {
      try {
        const r = buildTaxiFromGLB(assets.taxi, TAXI_ANCHORS);
        ext = r.ext;
        int = r.int;
        glbAnchors = r.anchors;
      } catch (e) {
        console.warn('[vehicle] taxi.glb could not be bound; using the procedural taxi', e);
        ext = int = glbAnchors = null;
      }
    }
    if (!ext) {
      ext = buildTaxiExterior();
      int = buildTaxiInterior(ext);
    }
    this.model = ext.glb ? 'glb' : 'procedural';
    this.ext = ext;
    this._detailCull = null;
    if (ext.glb) {
      // generic draw-call pass (node names untouched): static leaf meshes merged per material; the
      // moving / referenced parts (doors, wheels, pivots, displays, mounts...) are left alone. Pane and
      // mirror PARENTS are only attachment points, so their static siblings may still merge.
      try {
        const refs = collectRefs([{ ...ext, shell: null, panes: null }, int.parts]);
        this.modelStats = mergeStaticMeshes(ext.shell, refs);
        const P = int.parts;
        this._detailCull = new DetailCuller([
          ...Object.values(P.pedals || {}), ...Object.values(P.needles || {}).map((n) => n.pivot), ...Object.values(P.cranks || {}),
          ...Object.values(P.innerHandles || {}), ...Object.values(P.lockPins || {}),
          P.gear, P.gearGate, P.handbrake, P.keySlot, P.stalkLights, P.stalkWipers, P.radioKnobVol, P.radioKnobTune,
        ]);
      } catch (e) {
        console.warn('[vehicle] static merge skipped', e);
      }
      // the driver's hands grip the modelled rim (PlayerBody reads taxi.steeringRadius)
      const rim = measureRimRadius(int.parts.steering?.spin);
      if (rim) this.steeringRadius = rim;
    }
    this.bodyInner.add(ext.shell);
    for (const w of ext.wheels) this.chassis.add(w.pivot);
    this.interior = int.group;
    this.parts = int.parts;
    this.bodyInner.add(this.interior);
    // vacant lamp face (per-taxi emissive material; the GLB has its own vacant_lamp)
    if (this.parts.vacantGroup) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.065), ext.lenses.vacant);
      face.rotation.y = Math.PI; // faces forward (through the windshield)
      face.position.set(0, 0, -0.0235);
      this.parts.vacantGroup.add(face);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.065), ext.lenses.vacant);
      back.position.set(0, 0, 0.0235);
      back.scale.x = -1;
      this.parts.vacantGroup.add(back);
    }
    // ---- anchors -------------------------------------------------------------------------------
    this.anchors = {};
    for (const [k, v] of Object.entries(TAXI_ANCHORS)) {
      const a = new THREE.Object3D();
      a.name = k;
      a.position.set(v[0], v[1], v[2]);
      if (glbAnchors?.[k]) a.position.copy(glbAnchors[k]);
      this.bodyInner.add(a);
      this.anchors[k] = a;
    }
    const glb = !!ext.glb;
    // anchors that follow moving parts
    const reparent = (name, parent) => {
      const a = this.anchors[name];
      parent.updateWorldMatrix(true, false);
      this.root.updateMatrixWorld(true);
      parent.attach(a);
    };
    this.root.updateMatrixWorld(true);
    reparent('steeringWheel', this.parts.steering.pivot);
    reparent('hornPad', this.parts.steering.spin);
    if (glb) {
      // GLB: keep the (empty / derived) positions, just follow the moving parts
      reparent('sunVisorDriver', this.parts.visors.driver);
      reparent('gloveBox', this.parts.gloveAnchor);
      if (this.parts.stickerAnchor) reparent('dashSticker', this.parts.stickerAnchor);
    } else {
      this.anchors.hornPad.position.set(0, -0.005, 0.05);
      this.anchors.sunVisorDriver.position.set(0, 0, 0);
      this.parts.photoAnchor.add(this.anchors.sunVisorDriver);
      this.anchors.gloveBox.position.set(0, 0, 0);
      this.parts.gloveAnchor.add(this.anchors.gloveBox);
      if (this.parts.stickerAnchor) {
        this.anchors.dashSticker.position.set(0, 0, 0.002);
        this.parts.stickerAnchor.add(this.anchors.dashSticker);
      }
      this.anchors.amuletHang.position.copy(INT.mirrorPos).add(new THREE.Vector3(0, -0.01, -0.005));
    }
    this.seats = { driver: this.anchors.driverSeat, frontPassenger: this.anchors.frontPassengerSeat, rearLeft: this.anchors.rearLeftSeat, rearRight: this.anchors.rearRightSeat, rearCenter: this.anchors.rearCenterSeat };

    // ---- state -------------------------------------------------------------------------------
    this.state = {
      keyInserted: false, ignition: 'off', engineOn: false, gear: settings.get('transmission') === 'manual' ? 'N' : 'P', handbrake: true, headlights: 'off', cabinLight: false,
      indicator: 'off', wipers: 0, radioOn: false, radioStation: 0, meterOn: false, vacantLamp: true, horn: false,
      windows: { fl: 0, fr: 0, rl: 0, rr: 0 }, doors: { fl: 0, fr: 0, rl: 0, rr: 0, trunk: 0, hood: 0 }, glovebox: false, visor: false, locked: false,
    };

    // ---- systems -----------------------------------------------------------------------------
    this.glass = new GlassSystem(this, ext.panes);
    this._setupWiperMasks();
    this.mirrors = new MirrorSystem({ rear: this.parts.rearviewMount, left: ext.mirrorMounts.left, right: ext.mirrorMounts.right });
    this.lights = new TaxiLights(this, this.bodyInner, ext.lenses, this.parts);
    this.physicsSim = new CarPhysics(this);
    this.physicsSim.onCollision = (c) => this._onCollision(c);
    this.physicsSim.onBump = (k) => this._onBump(k);
    this.physicsSim.onShift = () => audio.play('gear_shift', { object: this.root, volume: 0.25 });
    this.controls = new TaxiControls(this);
    // ---- hanging decorations (JS for both model paths): amulets on chains + jasmine garland ----
    {
      const hang = this.anchorLocal('amuletHang');
      this.amulets = new AmuletCluster(this, this.bodyInner, hang.clone().add(new THREE.Vector3(0.006, 0, 0)), [
        { kind: 'arch', w: 0.024, h: 0.034, metal: 'gold', len: 0.105, dx: -0.012, twist: 0.4 },
        { kind: 'coin', w: 0.026, metal: 'silver', len: 0.13, dx: 0.004, twist: -0.3, chainMetal: 'brass' },
        { kind: 'rect', w: 0.02, h: 0.03, metal: 'brass', len: 0.085, dx: 0.016, twist: 1.2 },
      ]);
      this.garland = new Garland(this, this.bodyInner, { mode: 'hang', at: hang.clone().add(new THREE.Vector3(-0.022, 0, 0.002)), seed: 11 });
      this.parts.swings.push(this.amulets, this.garland);
      this.dashGarlands = [];
    }
    this.blood = new TaxiBlood(this);
    this.physics = { speed: 0, rpm: 0, steer: 0, wheelAngle: 0, onRoad: true, roadRef: null, frozen: false, sim: this.physicsSim };
    Object.defineProperty(this.physics, 'frozen', {
      get: () => this.physicsSim.frozen,
      set: (v) => (this.physicsSim.frozen = !!v),
    });
    this.controlsEnabled = !!opts.controls;
    this.interactionsEnabled = false;
    this.autopilotSpec = null;
    this._autoResolve = null;
    /** async (target: Object3D, opts) => {} — game hook for the player's hand reach. */
    this.onReach = null;
    /** (paneId, worldPoint) => {} — game hook (player wipe gesture). */
    this.onWipeGlass = null;
    this._indicatorTick = (on) => {
      if (this.isAudioOwner() || this.isCameraInside()) audio.play('indicator_tick', { object: this.anchors.steeringWheel, variant: on ? 0 : 1, volume: on ? 0.7 : 0.55 });
    };
    this._onIndicatorTick = this._indicatorTick;
    this._prevVel = new THREE.Vector3();
    this._accLocal = new THREE.Vector3();
    this._gazeCache = { frame: -1, value: null };
    this._engineSoundAttached = false;
    this._engineCranking = false;
    this._scrape = null;
    TAXIS.add(this);

    // ---- shadows: exterior casts, everything receives -----------------------------------------
    this.interior.traverse((o) => {
      if (o.isMesh) o.receiveShadow = true;
    });

    // ---- engine hooks ----------------------------------------------------------------------------
    this._offUpdate = engine.onUpdate((dt) => this.update(dt), 10);
    this._offPre = engine.onPreRender((renderer, scene, camera, dt) => this._preRender(renderer, scene, camera, dt));
    this._offSettings = settings.onChange(({ key }) => {
      if (key === 'mirrorResolution' || key === 'graphicsPreset' || key === '*') this.mirrors.setResolution();
    });
    if (opts.interactions) this.setInteractionsEnabled(true);
  }

  // ---------------------------------------------------------------------------
  // contract API
  // ---------------------------------------------------------------------------
  /** Place the taxi (wheels on the ground) at a world position with heading yaw (radians, 0 = facing -Z). */
  setPose(pos, yaw) {
    this.physicsSim.place(pos, yaw);
    this.physicsSim._gInit = false;
    this.physicsSim.followGround(1);
    this._applyTransform(0);
    this._prevVel.set(0, 0, 0);
  }
  /** Player input drives the car when true. */
  setControlsEnabled(v) {
    this.controlsEnabled = !!v;
    if (!v) {
      this.physicsSim.input.throttle = 0;
      this.physicsSim.input.brake = 0;
      this.physicsSim.input.steer = 0;
    }
  }
  /** Physically interactive controls (look + click) on/off; ids 'taxi.*' registered with core/interact. */
  setInteractionsEnabled(v) {
    this.interactionsEnabled = !!v;
    if (v) this.controls.register();
    else this.controls.unregister();
  }
  /**
   * AI driving along a spline. spec {splineId, s, speed (km/h if > 3? no: m/s), lane=-1.55, stopAt?: s, place?: bool,
   * speedKmh?: number} or null to stop. Returns a Promise resolved when stopped at stopAt (or cancelled).
   */
  autopilot(spec) {
    if (this._autoResolve) {
      this._autoResolve(false);
      this._autoResolve = null;
    }
    if (!spec) {
      this.autopilotSpec = null;
      this.physicsSim.input.throttle = 0;
      this.physicsSim.input.brake = 1;
      return Promise.resolve(false);
    }
    const road = this.world?.road;
    const sp = { lane: LAYOUT.laneOffset, ...spec };
    if (sp.speedKmh !== undefined) sp.speed = sp.speedKmh / 3.6;
    if (sp.speed === undefined) sp.speed = 40 / 3.6;
    sp.s = sp.s ?? (this.physicsSim.roadRef?.id === sp.splineId ? this.physicsSim.roadRef.s : 0);
    if (road && sp.place) {
      const smp = road.sample(sp.splineId, sp.s);
      const pos = smp.pos.clone().addScaledVector(smp.right, sp.lane);
      this.setPose(pos, Math.atan2(-smp.tangent.x, -smp.tangent.z));
    }
    this.autopilotSpec = sp;
    // make the car drivable
    const s = this.state;
    if (!s.engineOn) {
      s.keyInserted = true;
      s.ignition = 'on';
      s.engineOn = true;
      this.physicsSim.rpm = 1000;
      bus.emit('taxi:engine', { on: true });
    }
    s.handbrake = false;
    if (s.gear !== 'D') {
      s.gear = 'D';
      bus.emit('taxi:gear', { gear: 'D' });
    }
    return new Promise((res) => (this._autoResolve = res));
  }
  /** Change a control with its animation/sound. Emits 'taxi:control'. Returns a Promise (after the hand reach). */
  setControl(control, value, opts = {}) {
    return this.controls.set(control, value, opts);
  }
  /** Door open amount 0..1 animated. door 'fl'|'fr'|'rl'|'rr'|'trunk' -> Promise */
  openDoor(door, amount = 1, duration = 0.8) {
    const s = this.state;
    if (!(door in s.doors)) return Promise.resolve();
    const from = s.doors[door];
    amount = clamp(amount, 0, 1);
    if (Math.abs(from - amount) < 1e-3) return Promise.resolve();
    const opening = amount > from;
    const obj = this._doorAnchor(door);
    if (opening) audio.play(door === 'trunk' ? 'door_open' : 'door_open', { object: obj });
    const tw = { from, to: amount, t: 0, dur: Math.max(0.05, duration) };
    this.controls.doorTweens[door] = tw;
    return new Promise((res) => {
      tw.resolve = res;
    });
  }
  _doorAnchor(door) {
    return door === 'trunk' ? this.anchors.trunk : door === 'hood' ? this.anchors.hood : this.anchors['door' + door.toUpperCase()] || this.root;
  }
  /** Which glass/mirror the player is currently looking through. */
  getGazeTarget() {
    if (this._gazeCache.frame === engine.frame) return this._gazeCache.value;
    const v = this._computeGaze();
    this._gazeCache.frame = engine.frame;
    this._gazeCache.value = v;
    return v;
  }
  /** Simulated passenger weight per seat (suspension sag; ghosts weigh nothing). */
  setSeatWeight(seat, kg) {
    const sk = this.physicsSim.seatKg;
    if (!(seat in sk)) return;
    const before = sk[seat];
    sk[seat] = Math.max(0, kg || 0);
    // a real body makes the old springs creak (ghosts weigh nothing: no sound either)
    if (Math.abs(sk[seat] - before) > 15) audio.play('seat_creak', { object: this.seats[seat] || this.root, volume: clamp(Math.abs(sk[seat] - before) / 80, 0.3, 0.9) });
  }
  /** Condensation level 0..1 on a glass ('all' for every pane), e.g. cold ghost presence. */
  setFog(glass, amount) {
    this.glass.setFog(glass, amount);
  }
  /** Horror marks on the glass: kind 'handprint'|'face'|'scratch'|'text'|'clear', uv: Vector2 (0..1 on the pane). */
  addGlassMark(glass, kind, uv, opts = {}) {
    this.glass.addMark(glass, kind, uv, opts);
  }
  /** Cabin interior light level (0..1) for darkness gameplay, including flicker override. */
  get cabinBrightness() {
    return this.lights.domeLevel;
  }

  // ---------------------------------------------------------------------------
  // extras
  // ---------------------------------------------------------------------------
  get speedKmh() {
    return Math.abs(this.physicsSim.v) * 3.6;
  }
  /** World-space forward unit vector. */
  get forward() {
    return this._fwd || (this._fwd = new THREE.Vector3());
  }
  /** Wipe condensation at a world point (hand). Returns the pane id or null. */
  wipeGlassAt(worldPoint, radius = 0.07, strength = 1) {
    const id = this.glass.wipeAt(worldPoint, radius, strength);
    if (id) this.onWipeGlass?.(id, worldPoint);
    return id;
  }
  /** Breath fog spot on a pane near a world point (passenger / player breath). */
  addBreathFog(glassId, worldPoint, strength = 0.8) {
    this.glass.breathAt(glassId, worldPoint, strength);
  }
  /** Cabin light override for horror events: level 0..1 or null to release; flicker 0..1. */
  setCabinOverride(level = null, flicker = 0) {
    this.lights.override.cabin = level;
    this.lights.override.flicker = flicker;
  }
  /** Meter glitch modes (ghost passengers): {mode:'glitch'|'backward'|'date'|'text', text?, date?} or null. */
  setMeterGlitch(g) {
    this.controls.setMeterGlitch(g);
  }
  get fare() {
    return this.controls.fare;
  }
  /** Convenience: full ignition sequence (insert key, ON, START). */
  async startEngine(opts = {}) {
    if (!this.state.keyInserted) await this.setControl('key', true, opts);
    if (this.state.ignition === 'off') await this.setControl('ignition', 'on', opts);
    await new Promise((r) => setTimeout(r, opts.delay ?? 400));
    if (!this.state.engineOn) await this.setControl('ignition', 'start', opts);
  }
  /**
   * Lay a jasmine garland on the dashboard (Grandma Bua's gift). opts {at: Vector3 body-local
   * (default: on the dash in front of the passenger), scale=1.25, seed}. Returns the garland
   * ({dispose()}); it settles on the dash, jostles over bumps, drops petals and wilts with
   * GARLAND_UNIFORMS.uWilt.
   */
  addDashGarland(opts = {}) {
    const at = opts.at ? opts.at.clone() : new THREE.Vector3(-0.3, 1.0, -0.8);
    // find the dash surface under the spot
    const ray = new THREE.Raycaster();
    this.root.updateMatrixWorld(true);
    const o = this.bodyInner.localToWorld(at.clone().setY(1.2));
    ray.set(o, new THREE.Vector3(0, -1, 0).applyQuaternion(this.bodyInner.getWorldQuaternion(new THREE.Quaternion())));
    ray.far = 0.8;
    const hit = ray.intersectObjects(this.cabinSurfaces(), false)[0];
    const y = hit ? this.bodyInner.worldToLocal(hit.point.clone()).y : 0.94;
    at.y = y + 0.006;
    const g = new Garland(this, this.bodyInner, { mode: 'dash', at, floorY: y + 0.004, scale: opts.scale ?? 1.25, seed: opts.seed ?? 31, yaw: opts.yaw ?? 0.25, tassels: 2 });
    this.parts.swings.push(g);
    this.dashGarlands.push(g);
    const dispose = g.dispose.bind(g);
    g.dispose = () => {
      dispose();
      this.parts.swings.splice(this.parts.swings.indexOf(g), 1);
      this.dashGarlands.splice(this.dashGarlands.indexOf(g), 1);
    };
    return g;
  }
  /**
   * A blood stain seeping into a seat or the floor mat (ghost passengers leave it).
   * seat 'driver'|'frontPassenger'|'rearLeft'|'rearRight'|'rearCenter'|'floorFront'|'floorRear'|'floorDriver'; amount 0..1.
   */
  setInteriorBlood(seat, amount = 1) {
    this.blood.setInteriorBlood(seat, amount);
  }
  /** Blood drips falling from the headliner seam onto the dash; amount 0..1 (0 stops, stains remain). */
  bleedRoof(amount = 1) {
    this.blood.bleedRoof(amount);
  }
  /** Remove all blood (glass, seats, roof). */
  clearBlood() {
    this.blood.clear();
  }
  /** Wilting of every garland 0..1 (ghost-heavy rides): GARLAND_UNIFORMS.uWilt. */
  get garlandWilt() {
    return GARLAND_UNIFORMS.uWilt.value;
  }
  set garlandWilt(v) {
    GARLAND_UNIFORMS.uWilt.value = clamp(v, 0, 1);
  }
  /** Anchor position in body (bodyInner) space. */
  anchorLocal(name, out = new THREE.Vector3()) {
    const a = this.anchors[name];
    if (!a) return out.set(0, 0, 0);
    this.root.updateMatrixWorld(true);
    return this.bodyInner.worldToLocal(a.getWorldPosition(out));
  }
  /** Opaque cabin + body meshes (for raycasts: stains, drips, petals). Cached. */
  cabinSurfaces() {
    if (this._surfaces) return this._surfaces;
    const out = [];
    const skip = new Set();
    for (const id of this.glass.ids) skip.add(this.glass.panes[id].mesh);
    for (const m of this.mirrors.list) skip.add(m.mesh);
    const take = (root) => root.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh && !skip.has(o) && o.layers.isEnabled(0) && o.visible && !o.material?.transparent) out.push(o);
    });
    take(this.interior);
    take(this.ext.shell);
    this._surfaces = out;
    return out;
  }
  /** True for the taxi that currently drives the shared engine / radio sounds (player's or nearest). */
  isAudioOwner() {
    return audioOwner() === this;
  }
  /** True when the main camera is inside the cabin. */
  isCameraInside() {
    _v.copy(engine.camera.position);
    this.bodyInner.worldToLocal(_v);
    return Math.abs(_v.x) < 0.8 && _v.y > 0.25 && _v.y < 1.42 && _v.z > -1.05 && _v.z < 1.55;
  }
  /** Raycast the glass panes from the camera centre. -> {pane, point} | null */
  rayGlass(maxDist = 1.4) {
    _raycaster.setFromCamera({ x: 0, y: 0 }, engine.camera);
    _raycaster.far = maxDist;
    const hits = _raycaster.intersectObjects(this.glass.meshes(), false);
    if (!hits.length) return null;
    return { pane: hits[0].object.userData.glassId, point: hits[0].point };
  }

  // ---------------------------------------------------------------------------
  // per frame
  // ---------------------------------------------------------------------------
  update(dt) {
    if (!(dt > 0)) return;
    this.time += dt;
    const sim = this.physicsSim;
    const s = this.state;
    // ---- inputs ----
    if (this.autopilotSpec) this._autopilotStep(dt);
    else if (this.controlsEnabled) {
      sim.input.throttle = input.axis.throttle;
      sim.input.brake = input.axis.brake;
      sim.input.steer = input.axis.steer;
      this.controls.hotkeys(dt);
    } else {
      sim.input.throttle = 0;
      sim.input.steer = damp(sim.input.steer, 0, 3, dt);
    }
    // doors tween
    for (const [id, tw] of Object.entries(this.controls.doorTweens)) {
      tw.t += dt;
      const k = clamp(tw.t / tw.dur, 0, 1);
      s.doors[id] = lerp(tw.from, tw.to, k);
      if (k >= 1) {
        delete this.controls.doorTweens[id];
        if (tw.to < tw.from && tw.to < 0.02) audio.play('door_close', { object: this._doorAnchor(id) });
        bus.emit('taxi:door', { door: id, open: tw.to });
        this.controls.refreshLabel();
        tw.resolve?.();
      } else if (Math.floor(tw.t * 10) !== Math.floor((tw.t - dt) * 10)) bus.emit('taxi:door', { door: id, open: s.doors[id] });
    }
    // ---- physics ----
    setPhysicsWetness(GLOBAL_UNIFORMS.uWetness?.value ?? 0);
    const transmission = this.autopilotSpec ? 'auto' : settings.get('transmission');
    if (!sim.frozen) {
      const sub = dt > 1 / 45 ? 2 : 1;
      for (let i = 0; i < sub; i++) sim.step(dt / sub, s, transmission);
    }
    this._applyTransform(dt);
    // public physics mirror
    const P = this.physics;
    P.speed = sim.v;
    P.rpm = sim.rpm;
    P.steer = sim.input.steer;
    P.wheelAngle = sim.wheelAngle;
    P.onRoad = sim.offRoad < 0.5;
    P.roadRef = sim.roadRef;
    P.gear = s.gear;
    P.autoGear = sim.autoGear;
    // ---- local acceleration for hanging things ----
    const vel = _v.copy(this.forward).multiplyScalar(sim.v);
    const acc = _v2.copy(vel).sub(this._prevVel).divideScalar(dt);
    this._prevVel.copy(vel);
    _q.copy(this.root.quaternion).invert();
    acc.applyQuaternion(_q);
    this._accLocal.lerp(acc, 1 - Math.exp(-12 * dt));
    const kick = (s.engineOn ? 0.15 : 0) + clamp(this._bumpKick || 0, 0, 3);
    this._bumpKick = Math.max(0, (this._bumpKick || 0) - dt * 6);
    for (const sw of this.parts.swings) sw.step(dt, this._accLocal.x, this._accLocal.z, kick * 0.6);
    for (const r of this.parts.rattles) {
      const a = r.amp * (kick + (s.engineOn ? 0.4 : 0));
      r.obj.position.set(r.base.x + (Math.random() - 0.5) * a, r.base.y + Math.random() * a * 0.5, r.base.z + (Math.random() - 0.5) * a);
    }
    // ---- controls / lights / glass ----
    this.controls.animate(dt);
    this.lights.update(dt, s, sim);
    const cab = this.lights.domeLevel;
    this.glass.uniforms.uCabin.value.setRGB(0.9, 0.72, 0.48).multiplyScalar(cab * 0.6 + this.lights.dashLevel * 0.02);
    this.glass.setFlow(sim.v);
    this.glass.update(dt);
    this.blood.update(dt);
    // ---- audio (only the owning taxi drives the shared engine / radio voices) ----
    const owner = this.isAudioOwner();
    const es = audio.engineSound;
    if (es && owner) {
      if (this._engineSoundAttached !== true || es.object !== this.root) {
        es.attach?.(this.root, this.bodyInner);
        this._engineSoundAttached = true;
      }
      const want = s.engineOn || this._engineCranking;
      // engines that were switched on without the key (autopilot, cinematics, direct state) start instantly
      if (want !== es.on) es.setOn?.(want, { instant: !this._engineCranking });
      es.setRPM?.(sim.rpm);
      es.setLoad?.(sim.engineLoad);
      es.setGear?.(transmission === 'manual' ? s.gear : s.gear === 'D' ? String(sim.autoGear) : s.gear);
      es.setSpeed?.(Math.abs(sim.v) * 3.6);
      es.setSurface?.(sim.surface);
    } else if (!owner) this._engineSoundAttached = false;
    if (owner) {
      const radio = audio.radio;
      if (radio && this._radioAttached !== radio) {
        radio.attach?.(this.parts.radioKnobVol || this.anchors.radioKnob);
        this._radioAttached = radio;
        this._radioWas = undefined;
      }
      const radioPower = s.radioOn && this.controls.hasPower();
      if (radioPower !== this._radioWas) {
        if (radioPower && radio && !radio.station && s.radioStation) radio.setStation?.(s.radioStation, { sweep: false });
        radio?.setOn?.(radioPower);
        this._radioWas = radioPower;
      }
    } else this._radioAttached = null;
    // vegetation scrape while pressed against the wall
    const scraping = sim.wallContact > 0.05 && Math.abs(sim.v) > 0.6;
    if (scraping && !this._scrape && audio.loop) this._scrape = audio.loop('bush_scrape', { object: this.root, volume: 0 });
    if (this._scrape) {
      const vol = scraping ? clamp(Math.abs(sim.v) / 8, 0.2, 1) * sim.wallContact : 0;
      this._scrape.setVolume?.(vol, 0.12);
      this._scrape.setRate?.(clamp(0.8 + Math.abs(sim.v) * 0.03, 0.8, 1.4));
      if (!scraping) {
        this._scrapeOff = (this._scrapeOff || 0) + dt;
        if (this._scrapeOff > 0.6) {
          this._scrape.stop?.(0.15);
          this._scrape = null;
        }
      } else this._scrapeOff = 0;
    }
    // shadows follow the taxi
    this._fwdUpdate();
  }

  _fwdUpdate() {
    this.forward.set(-Math.sin(this.physicsSim.yaw), 0, -Math.cos(this.physicsSim.yaw));
  }

  _applyTransform(dt) {
    const sim = this.physicsSim;
    this.root.position.copy(sim.pos);
    this.root.rotation.set(sim.groundPitch, sim.yaw, sim.groundRoll, 'YXZ');
    const su = sim.susp;
    this.bodyPivot.rotation.set(su.pitch, 0, su.roll);
    this.bodyPivot.position.y = 0.55 + su.heave;
    for (let i = 0; i < this.ext.wheels.length; i++) {
      const w = this.ext.wheels[i];
      const idx = (w.front ? 0 : 2) + (w.side > 0 ? 1 : 0);
      w.spin.rotation.x = -sim.wheelSpin[idx];
      if (w.front) w.pivot.rotation.y = sim.wheelSteer;
      // suspension travel: wheels stay on the ground while the body moves
      w.pivot.position.y = w.radius ?? DIM.wheelR;
    }
    this._fwdUpdate();
  }

  _autopilotStep(dt) {
    const sp = this.autopilotSpec;
    const road = this.world?.road;
    const sim = this.physicsSim;
    if (!road) return;
    const proj = road.project(sim.pos, sp.splineId);
    let s = proj && proj.id === sp.splineId ? proj.s : sp.s;
    sp.s = s;
    const L = road.length(sp.splineId);
    const speed = Math.abs(sim.v);
    const look = 3.5 + speed * 0.65;
    const smp = road.sample(sp.splineId, Math.min(L, s + look));
    const target = _v.copy(smp.pos).addScaledVector(smp.right, sp.lane);
    // pure pursuit
    const local = target.sub(sim.pos);
    const fw = this.forward;
    const right = _v2.set(-fw.z, 0, fw.x).negate(); // (cos, 0, -sin)
    right.set(Math.cos(sim.yaw), 0, -Math.sin(sim.yaw));
    const x = local.dot(right), z = local.dot(fw);
    const ld = Math.max(0.5, Math.hypot(x, z));
    const curv = (2 * x) / (ld * ld);
    const wheel = Math.atan(curv * CAR.wheelbase);
    const maxA = CAR.maxSteer * lerp(1, 0.2, Math.min(1, speed / 32));
    sim.input.steer = clamp(wheel / Math.max(0.05, maxA), -1, 1);
    // speed control
    let vT = sp.speed;
    const end = sp.stopAt ?? (L - 3);
    const dist = end - s;
    if (sp.stopAt !== undefined || dist < 40) vT = Math.min(vT, Math.sqrt(Math.max(0, 2 * 2.2 * Math.max(0, dist - 0.5))));
    // slow down for curves ahead
    const ahead = road.sample(sp.splineId, Math.min(L, s + 12 + speed));
    const t0 = road.sample(sp.splineId, s).tangent.clone();
    const ang = Math.acos(clamp(t0.dot(ahead.tangent), -1, 1));
    vT = Math.min(vT, Math.max(5, 22 - ang * 30));
    const err = vT - sim.v;
    sim.input.throttle = clamp(err * 0.35, 0, 1);
    sim.input.brake = clamp(-err * 0.5, 0, 1);
    if (dist <= 0.6 && speed < 0.3) {
      sim.input.throttle = 0;
      sim.input.brake = 1;
      if (this._autoResolve) {
        this._autoResolve(true);
        this._autoResolve = null;
      }
    }
  }

  _setupWiperMasks() {
    if (this.ext.maskWipers) {
      for (const [pu, pv, r0, r1] of this.ext.maskWipers) this.glass.addWiper([pu, pv], r0, r1);
      return;
    }
    const ws = this.glass.panes.windshield;
    if (!ws || !ws.uvRange) return;
    const [u0, u1, v0, v1] = ws.uvRange;
    const fr = this.ext.windshieldFrame;
    for (const w of this.ext.wipers) {
      const p = w.origin;
      const x = p.x;
      const sDist = p.clone().sub(fr.base).dot(fr.slope);
      const pu = (x - u0) / (u1 - u0), pv = (sDist - v0) / (v1 - v0);
      this.glass.addWiper([pu, pv], (w.len * 0.09) / (u1 - u0), (w.len * 1.0) / (u1 - u0));
    }
  }

  _computeGaze() {
    const cam = engine.camera;
    if (!this.isCameraInside()) {
      // outside: could still look through glass, but report null
      return null;
    }
    _ray.origin.copy(cam.position);
    _ray.direction.copy(cameraRig.lookDirection || _v.set(0, 0, -1).applyQuaternion(cam.quaternion));
    let best = null, bestD = Infinity;
    const test = (id, C, N, U, w, h, pad = 1.0) => {
      _plane.setFromNormalAndCoplanarPoint(N, C);
      const hit = _ray.intersectPlane(_plane, _v);
      if (!hit) return;
      const d = hit.distanceTo(_ray.origin);
      _R.crossVectors(U, N).normalize();
      const rel = _v2.copy(hit).sub(C);
      if (Math.abs(rel.dot(_R)) <= (w / 2) * pad && Math.abs(rel.dot(U)) <= (h / 2) * pad && d < bestD) {
        bestD = d;
        best = id;
      }
    };
    for (const m of this.mirrors.list) {
      m.mount.updateWorldMatrix(true, false);
      const e = m.mount.matrixWorld.elements;
      _C.set(e[12], e[13], e[14]);
      _U.set(e[4], e[5], e[6]).normalize();
      _N.set(e[8], e[9], e[10]).normalize();
      test(m.id, _C, _N, _U, m.w, m.h, 1.15);
    }
    if (best) return best;
    for (const id of this.glass.ids) {
      const p = this.glass.panes[id];
      const size = p.rect(_C, _N, _U);
      const gid = id === 'ql' ? 'rl' : id === 'qr' ? 'rr' : id;
      test(gid, _C, _N, _U, size[0], size[1], 1.02);
    }
    return best || 'interior';
  }

  _preRender(renderer, scene, camera, dt) {
    // skip when far away from the camera
    const d = _v.copy(this.root.position).distanceTo(camera.position);
    // pedals, needles, cranks, levers, the key: invisible from outside beyond a few metres
    if (this._detailCull) this._detailCull.set(d > 3.5 && !this.isCameraInside());
    if (d < 14) this.mirrors.update(renderer, scene, camera, cameraRig, engine.frame);
    // gaze-gated glass reflection (only when the camera is in the cabin)
    let pane = null;
    if (this.isCameraInside()) {
      const g = this.getGazeTarget();
      if (g && !g.startsWith('mirror') && g !== 'interior') pane = g;
      // the rear quarter lights count as rear side windows for reflection purposes
    }
    // the cabin only shows in the glass when it is brighter than the night outside
    let h = GLOBAL_UNIFORMS.uHour?.value ?? 23;
    if (h < 18) h += 24;
    const night = 1 - clamp((h - 28.9) / 1.0, 0, 1);
    const strength = night * clamp(this.lights.domeLevel + this.lights.dashLevel * 0.35, 0, 1);
    this.glass.renderReflection(renderer, scene, camera, pane, strength, dt || 1 / 60);
    // in fallback mode glass is on DEFAULT too: hide it from the mirror cameras
    this.mirrors.hide = this.glass._layerMode === false ? this.glass.meshes() : [];
  }

  _onCollision(c) {
    audio.play('collision_thud', { position: c.point, volume: clamp(c.speed / 6, 0.3, 1) });
    audio.play('bush_scrape', { position: c.point, volume: clamp(c.speed / 5, 0.3, 1) });
    bus.emit('taxi:collision', { impulse: c.impulse, point: c.point });
    if (this.controlsEnabled || this.isCameraInside()) cameraRig.shake(clamp(c.speed / 8, 0.12, 0.6));
    this._bumpKick = (this._bumpKick || 0) + 2;
  }

  _onBump(k) {
    this._bumpKick = (this._bumpKick || 0) + k * 2;
    if (k > 0.35) audio.play('collision_thud', { object: this.root, volume: k * 0.35, rate: 1.3 });
    if (this.isCameraInside() && k > 0.5) cameraRig.shake(k * 0.08);
  }

  dispose() {
    TAXIS.delete(this);
    if (_owner === this) {
      _owner = null;
      _ownerFrame = -1;
    }
    this._scrape?.stop?.(0.1);
    this._offUpdate?.();
    this._offPre?.();
    this._offSettings?.();
    this.autopilot(null);
    this.controls.dispose();
    this.garland?.dispose();
    this.blood?.dispose();
    this.amulets?.dispose();
    for (const g of [...(this.dashGarlands || [])]) g.dispose();
    this.lights.dispose();
    this.glass.dispose();
    this.mirrors.dispose();
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o.isMesh && o.geometry && !o.geometry.userData.shared) {
        /* geometries are shared between taxis via caches; leave them */
      }
    });
  }
}

export { STATIONS };
