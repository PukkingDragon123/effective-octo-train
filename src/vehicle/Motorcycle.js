// Old rusty step-through underbone motorbike (generic, no brand) for the intro ride:
// front basket, leg shield, worn seat, round headlight (SpotLight + soft beam),
// spoked wheels that rotate, simple lean physics along the road, autopilot, audio hooks.
import * as THREE from 'three';
import { paintedMaterial, GLOBAL_UNIFORMS, createVolumetricBeam } from '../render/index.js';
import { tex } from '../textures/index.js';
import { engine } from '../core/Engine.js';
import { input } from '../core/Input.js';
import { bus } from '../core/Events.js';
import { settings } from '../core/Settings.js';
import { cameraRig } from '../core/CameraRig.js';
import { clamp, damp, lerp, wrapAngle, makeRng } from '../core/math.js';
import { audio } from '../audio/index.js';
import { LAYOUT } from '../world/layout.js';
import { MergeBuilder, xform, roundedBox, lathe, rod, tube, GridSurface, deform, pillow, boxUV } from './geom.js';
import { makeCanvas, toTexture, noiseCanvas } from './VehicleTextures.js';
import { FONTS } from '../ui/fonts.js';
import { submitHeadlight, releaseHeadlight } from './Lights.js';
import { getVehicleAssets, instantiate } from './VehicleAssets.js';
import { indexNodes, worldPos, boxOf } from './TaxiGLB.js';

const _hp = new THREE.Vector3(), _hd = new THREE.Vector3();
const BIKE_CONE = [Math.cos(0.45), Math.cos(0.18), 36];

const T = (k, r) => {
  try {
    return tex(k, r ? { repeat: r } : {});
  } catch (e) {
    return null;
  }
};

const BIKE = { wheelR: 0.285, wheelbase: 1.2, axleF: -0.62, axleR: 0.58 };

let mats = null;
function bikeMaterials() {
  if (mats) return mats;
  const paintTex = (() => {
    const c = makeCanvas(256, 256);
    const g = c.getContext('2d');
    g.fillStyle = '#6a1e1a';
    g.fillRect(0, 0, 256, 256);
    const n = noiseCanvas(64, 64, { scale: 5, oct: 4, seed: 41, contrast: 1.4 });
    g.globalAlpha = 0.35;
    g.globalCompositeOperation = 'multiply';
    g.drawImage(n, 0, 0, 256, 256);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    const rng = makeRng(17);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(${120 + rng() * 40},${60 + rng() * 20},${30},${rng.range(0.3, 0.8)})`;
      g.beginPath();
      g.ellipse(rng() * 256, rng() * 256, rng.range(2, 12), rng.range(2, 8), rng() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(230,210,190,${rng.range(0.15, 0.4)})`;
      g.lineWidth = 1;
      g.beginPath();
      const x = rng() * 256, y = rng() * 256;
      g.moveTo(x, y);
      g.lineTo(x + rng.range(-30, 30), y + rng.range(-6, 6));
      g.stroke();
    }
    return toTexture(c, { wrap: THREE.RepeatWrapping });
  })();
  mats = {
    paint: paintedMaterial({ map: paintTex, roughness: 0.6, metalness: 0.1, brush: 0.5, wet: 0.6, name: 'bike_paint' }),
    shield: paintedMaterial({ color: 0xc9bea2, map: T('dash_plastic', [2, 2]), roughness: 0.7, brush: 0.5, dirt: 0.4, name: 'bike_shield' }),
    chrome: paintedMaterial({ color: 0xa8a49a, metalness: 0.7, roughness: 0.38, map: T('chrome_dirty', [2, 2]), brush: 0.3, name: 'bike_chrome' }),
    rust: paintedMaterial({ color: 0x7a4a2a, metalness: 0.3, roughness: 0.9, map: T('rust', [2, 2]), brush: 0.5, name: 'bike_rust' }),
    black: paintedMaterial({ color: 0x151413, roughness: 0.7, brush: 0.3, name: 'bike_black' }),
    rubber: paintedMaterial({ color: 0x111111, roughness: 0.9, map: T('rubber', [4, 1]), brush: 0.2, name: 'bike_rubber' }),
    seat: paintedMaterial({ color: 0x2a2420, map: T('leather_seat', [2, 2]), roughness: 0.6, brush: 0.5, name: 'bike_seat' }),
    foam: paintedMaterial({ color: 0xc8b47a, roughness: 0.95, brush: 0.5, name: 'bike_foam' }),
    engine: paintedMaterial({ color: 0x5a5a56, metalness: 0.4, roughness: 0.7, map: T('rust', [3, 3]), brush: 0.4, name: 'bike_engine' }),
    wire: paintedMaterial({ color: 0x3a3632, metalness: 0.5, roughness: 0.6, brush: 0.2, name: 'bike_wire' }),
    plate: paintedMaterial({ map: plateTex(), roughness: 0.6, brush: 0.2, name: 'bike_plate' }),
  };
  return mats;
}

function plateTex() {
  const c = makeCanvas(128, 96);
  const g = c.getContext('2d');
  g.fillStyle = '#e8e4d8';
  g.fillRect(0, 0, 128, 96);
  g.strokeStyle = '#222';
  g.lineWidth = 3;
  g.strokeRect(3, 3, 122, 90);
  g.fillStyle = '#1a1a1a';
  g.textAlign = 'center';
  g.font = `700 26px ${FONTS.sign}`;
  g.fillText('๑กข', 64, 32);
  g.font = `700 14px ${FONTS.sign}`;
  g.fillText('เชียงราย', 64, 54);
  g.font = `700 26px ${FONTS.sign}`;
  g.fillText('357', 64, 84);
  return toTexture(c);
}

function spokedWheel(m) {
  const g = new THREE.Group();
  const mb = new MergeBuilder();
  const R = BIKE.wheelR;
  const tire = new THREE.TorusGeometry(R - 0.03, 0.03, 10, 36);
  tire.rotateY(Math.PI / 2);
  mb.add('rubber', tire);
  const rim = new THREE.TorusGeometry(R - 0.055, 0.008, 6, 36);
  rim.rotateY(Math.PI / 2);
  mb.add('chrome', rim);
  mb.add('chrome', xform(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 14), [0, 0, 0], [0, 0, Math.PI / 2]));
  mb.add('engine', xform(new THREE.CylinderGeometry(0.065, 0.065, 0.04, 14), [0.04, 0, 0], [0, 0, Math.PI / 2]));
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const side = i % 2 ? 0.035 : -0.035;
    mb.add('wire', rod([side, Math.cos(a + 0.2) * 0.045, Math.sin(a + 0.2) * 0.045], [0, Math.cos(a) * (R - 0.06), Math.sin(a) * (R - 0.06)], 0.0018, 3));
  }
  g.add(mb.build({ rubber: m.rubber, chrome: m.chrome, engine: m.engine, wire: m.wire }));
  return g;
}

export class Motorcycle {
  constructor(opts = {}) {
    this.kind = 'bike';
    this.world = opts.world || null;
    this.root = new THREE.Group();
    this.root.name = 'motorcycle';
    this.root.rotation.order = 'YXZ';
    this.leanGroup = new THREE.Group(); // rolls around the contact line
    this.root.add(this.leanGroup);
    const m = bikeMaterials();
    const mb = new MergeBuilder();
    const R = BIKE.wheelR;
    const fz = BIKE.axleF, rz = BIKE.axleR;
    // ---- frame: underbone spine from the steering head down and back -------------------------
    const head = new THREE.Vector3(0, 0.92, -0.48);
    mb.add('paint', tube([head, [0, 0.72, -0.36], [0, 0.48, -0.12], [0, 0.46, 0.12], [0, 0.6, 0.34], [0, 0.7, 0.55]], 0.032, 32, 10));
    mb.add('paint', xform(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 12), [head.x, head.y, head.z], [-0.45, 0, 0]));
    // leg shield (curved panel)
    const shield = new GridSurface(8, 9, (r, c) => {
      const t = r / 7, u = (c / 8) * 2 - 1;
      const y = lerp(0.36, 0.9, t);
      const w = lerp(0.2, 0.17, t) * (1 + 0.15 * Math.sin(t * Math.PI));
      const x = u * w;
      const z = -0.4 + 0.1 * (1 - t) + 0.08 * u * u + 0.04 * Math.sin(t * Math.PI);
      return [x, y, z];
    });
    mb.add('shield', shield.build(() => true, { uv: (r, c) => [c / 8, r / 7] }));
    mb.add('shield', shield.build(() => true, { flip: true, offset: -0.004, uv: (r, c) => [c / 8, r / 7] }));
    // body under the seat + side covers
    const body = roundedBox(0.26, 0.24, 0.56, 0.08, 4);
    pillow(body, 0.02);
    mb.add('paint', boxUV(xform(body, [0, 0.6, 0.28]), 0.3));
    // floorboard / footrest area
    mb.add('black', xform(roundedBox(0.22, 0.03, 0.3, 0.01, 2), [0, 0.35, -0.12]));
    // engine + exhaust
    mb.add('engine', xform(roundedBox(0.22, 0.2, 0.3, 0.05, 3), [0, 0.32, 0.08]));
    mb.add('engine', xform(new THREE.CylinderGeometry(0.06, 0.07, 0.2, 12), [0, 0.38, -0.12], [1.2, 0, 0]));
    for (let i = 0; i < 5; i++) mb.add('engine', xform(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 12), [0, 0.39 - i * 0.01, -0.07 - i * 0.03], [1.2, 0, 0]));
    mb.add('rust', tube([[0.02, 0.33, -0.2], [0.1, 0.24, -0.08], [0.15, 0.24, 0.2], [0.16, 0.28, 0.62]], 0.018, 24, 8));
    mb.add('chrome', xform(new THREE.CylinderGeometry(0.045, 0.04, 0.42, 14), [0.16, 0.3, 0.55], [Math.PI / 2 - 0.12, 0, 0]));
    // rear: swingarm, shocks, fender, rack, taillight, plate
    for (const sx of [-1, 1]) {
      mb.add('black', rod([sx * 0.07, 0.36, 0.12], [sx * 0.07, R, rz], 0.016, 8));
      mb.add('chrome', rod([sx * 0.085, R + 0.02, rz - 0.04], [sx * 0.085, 0.72, rz - 0.12], 0.016, 8));
      mb.add('rust', rod([sx * 0.085, R + 0.08, rz - 0.05], [sx * 0.085, 0.62, rz - 0.1], 0.022, 8));
    }
    const fender = new THREE.TorusGeometry(R + 0.04, 0.05, 6, 20, Math.PI * 0.75);
    fender.scale(1, 1, 1);
    fender.rotateY(Math.PI / 2);
    fender.rotateX(-Math.PI * 0.05);
    mb.add('paint', xform(fender, [0, R, rz]));
    for (let i = 0; i < 4; i++) mb.add('chrome', rod([-0.11, 0.78, 0.52 + i * 0.07], [0.11, 0.78, 0.52 + i * 0.07], 0.007, 5));
    mb.add('chrome', rod([-0.11, 0.78, 0.5], [-0.11, 0.78, 0.82], 0.008, 5));
    mb.add('chrome', rod([0.11, 0.78, 0.5], [0.11, 0.78, 0.82], 0.008, 5));
    const tl = roundedBox(0.1, 0.05, 0.05, 0.012, 2);
    this._tailMat = paintedMaterial({ color: 0x7a1010, emissive: 0xff2010, emissiveIntensity: 0.6, roughness: 0.3, brush: 0.1, name: 'bike_tail' });
    const tailMesh = new THREE.Mesh(xform(tl, [0, 0.72, 0.86]), this._tailMat);
    this.leanGroup.add(tailMesh);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.13), m.plate);
    this._proc = [procBody, tailMesh, plate];
    plate.position.set(0, 0.62, 0.9);
    this.leanGroup.add(plate);
    // seat
    const seat = roundedBox(0.24, 0.08, 0.62, 0.04, 4);
    pillow(seat, 0.015);
    deform(seat, (v) => {
      v.y += -0.012 * Math.sin(((v.z + 0.31) / 0.62) * Math.PI);
    });
    mb.add('seat', boxUV(xform(seat, [0, 0.77, 0.2]), 0.2));
    // torn patch with foam
    mb.add('foam', xform(new THREE.SphereGeometry(0.035, 10, 8).scale(1.3, 0.25, 1), [0.06, 0.805, 0.08]));
    // kickstand + pegs
    mb.add('black', rod([-0.08, 0.3, 0.05], [-0.22, 0.02, 0.12], 0.012, 6));
    for (const sx of [-1, 1]) mb.add('rubber', rod([sx * 0.1, 0.3, -0.02], [sx * 0.22, 0.3, -0.02], 0.016, 6));
    const procBody = mb.build({ paint: m.paint, shield: m.shield, black: m.black, engine: m.engine, rust: m.rust, chrome: m.chrome, seat: m.seat, foam: m.foam, rubber: m.rubber });
    this.leanGroup.add(procBody);

    // ---- steering assembly (fork, front wheel, handlebar, headlight, basket) -------------------
    const steer = new THREE.Group();
    steer.position.copy(head);
    steer.rotation.x = -0.45; // rake
    this.leanGroup.add(steer);
    const steerYaw = new THREE.Group();
    steer.add(steerYaw);
    this.steerGroup = steerYaw;
    const sm = new MergeBuilder();
    const forkLen = 0.75;
    for (const sx of [-1, 1]) {
      sm.add('chrome', rod([sx * 0.07, -0.05, 0], [sx * 0.07, -forkLen, 0.0], 0.018, 8));
      sm.add('paint', rod([sx * 0.07, -0.05, 0], [sx * 0.07, -0.32, 0], 0.028, 8));
    }
    // front mudguard
    const fg = new THREE.TorusGeometry(R + 0.03, 0.045, 6, 18, Math.PI * 0.6);
    fg.rotateY(Math.PI / 2);
    fg.rotateX(Math.PI * 0.35);
    sm.add('paint', xform(fg, [0, -forkLen, 0]));
    // handlebar + grips + levers + mirrors
    const bar = [[-0.34, 0.16, 0.1], [-0.2, 0.13, 0.03], [0, 0.12, 0], [0.2, 0.13, 0.03], [0.34, 0.16, 0.1]];
    sm.add('chrome', tube(bar, 0.012, 24, 6));
    for (const sx of [-1, 1]) {
      sm.add('rubber', rod([sx * 0.28, 0.15, 0.08], [sx * 0.38, 0.165, 0.12], 0.018, 8));
      sm.add('chrome', rod([sx * 0.22, 0.15, 0.04], [sx * 0.33, 0.12, 0.0], 0.006, 4));
      sm.add('chrome', rod([sx * 0.22, 0.14, 0.03], [sx * 0.3, 0.42, 0.06], 0.006, 4));
      sm.add('black', xform(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 16), [sx * 0.31, 0.44, 0.06], [Math.PI / 2 - 0.3, 0, 0]));
    }
    // headlight nacelle + speedo
    sm.add('paint', xform(roundedBox(0.26, 0.14, 0.2, 0.06, 3), [0, 0.06, -0.06]));
    const lampBody = lathe([[0.0, 0.0], [0.085, 0.0], [0.09, 0.03], [0.085, 0.08], [0.0, 0.085]], 20);
    lampBody.rotateX(-Math.PI / 2);
    sm.add('chrome', xform(lampBody, [0, 0.04, -0.13]));
    sm.add('black', xform(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), [0, 0.13, -0.02], [-0.6, 0, 0]));
    // front basket (wire grid)
    const bx = 0.17, by0 = -0.2, by1 = 0.04, bz0 = -0.3, bz1 = -0.58;
    for (let i = 0; i <= 6; i++) {
      const x = lerp(-bx, bx, i / 6);
      sm.add('wire', rod([x, by0, bz0], [x, by0, bz1], 0.0028, 3));
      sm.add('wire', rod([x, by0, bz1], [x, by1, bz1 - 0.02], 0.0028, 3));
      sm.add('wire', rod([x, by0, bz0], [x, by1, bz0], 0.0028, 3));
    }
    for (let j = 0; j <= 4; j++) {
      const y = lerp(by0, by1, j / 4);
      sm.add('wire', rod([-bx, y, bz0], [bx, y, bz0], 0.0028, 3));
      sm.add('wire', rod([-bx, y, bz1 - 0.02 * (j / 4)], [bx, y, bz1 - 0.02 * (j / 4)], 0.0028, 3));
      sm.add('wire', rod([-bx, y, bz0], [-bx, y, bz1], 0.0028, 3));
      sm.add('wire', rod([bx, y, bz0], [bx, y, bz1], 0.0028, 3));
    }
    sm.add('wire', rod([0, -0.05, -0.1], [0, by0, bz0], 0.006, 4));
    // a plastic bag in the basket
    sm.add('foam', xform(new THREE.SphereGeometry(0.09, 10, 8).scale(1.2, 0.7, 1), [0.03, by0 + 0.07, -0.45]));
    steerYaw.add(sm.build({ chrome: m.chrome, paint: m.paint, rubber: m.rubber, black: m.black, wire: m.wire, foam: m.shield }));
    // headlight lens (emissive)
    this._headMat = paintedMaterial({ color: 0xe8e2d0, emissive: 0xfff0d0, emissiveIntensity: 0, roughness: 0.15, brush: 0.1, name: 'bike_head' });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20), this._headMat);
    lens.position.set(0, 0.04, -0.215);
    lens.rotation.y = Math.PI;
    steerYaw.add(lens);
    // front wheel on the fork
    this.frontWheel = spokedWheel(m);
    this.frontWheel.position.set(0, -forkLen, 0);
    steerYaw.add(this.frontWheel);
    this.rearWheel = spokedWheel(m);
    this.rearWheel.position.set(0, R, rz);
    this.leanGroup.add(this.rearWheel);

    // ---- headlight SpotLight + beam ------------------------------------------------------------
    this.spot = new THREE.SpotLight(0xffe0b0, 0, 50, 0.5, 0.6, 1.4);
    this.spot.position.set(0, 0.04, -0.24);
    this.spot.target.position.set(0, -0.9, -10);
    steerYaw.add(this.spot, this.spot.target);
    if (settings.get('shadows') && ['high', 'ultra'].includes(settings.get('graphicsPreset'))) {
      this.spot.castShadow = true;
      this.spot.shadow.mapSize.set(1024, 1024);
      this.spot.shadow.camera.near = 0.3;
      this.spot.shadow.camera.far = 35;
      this.spot.shadow.bias = -0.0005;
    }
    this.beam = typeof createVolumetricBeam === 'function' ? createVolumetricBeam({ color: 0xffe0b0, length: 14, angle: 0.32, intensity: 0, noise: 0.9 }) : null;
    if (this.beam) {
      this.beam.position.copy(this.spot.position);
      this.beam.rotation.x = -0.05;
      steerYaw.add(this.beam);
    }

    // ---- anchors ------------------------------------------------------------------------------
    this.anchors = {};
    const A = { seat: [0, 0.8, 0.14], handleL: [-0.33, 1.08, -0.5], handleR: [0.33, 1.08, -0.5], footL: [-0.16, 0.36, -0.12], footR: [0.16, 0.36, -0.12], eye: [0, 1.5, 0.02], headlight: [0, 0.98, -0.66] };
    for (const [k, v] of Object.entries(A)) {
      const a = new THREE.Object3D();
      a.name = k;
      a.position.set(v[0], v[1], v[2]);
      this.leanGroup.add(a);
      this.anchors[k] = a;
    }
    // handle anchors follow the bars
    for (const k of ['handleL', 'handleR', 'headlight']) {
      this.root.updateMatrixWorld(true);
      steerYaw.attach(this.anchors[k]);
    }
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    if (this.beam) this.beam.castShadow = false;
    this._proc.push(steer, this.rearWheel);
    this._procSteer = steerYaw;
    this.model = 'procedural';
    const assets = getVehicleAssets();
    if (assets.moto && !opts.procedural) {
      try {
        this._bindGLB(assets.moto);
      } catch (e) {
        console.warn('[vehicle] moto.glb could not be bound; using the procedural bike', e);
      }
    }

    // ---- state ------------------------------------------------------------------------------
    this.state = { engineOn: true, headlight: true };
    this.physics = { speed: 0, rpm: 0, steer: 0, lean: 0, roadRef: null, frozen: false };
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.v = 0;
    this.lean = 0;
    this.steerA = 0;
    this.rpm = 1300;
    this.gear = 1;
    this.wheelRot = 0;
    this.controlsEnabled = false;
    this.autopilotSpec = null;
    this._autoResolve = null;
    this.forward = new THREE.Vector3(0, 0, -1);
    this._off = engine.onUpdate((dt) => this.update(dt), 10);
    this._soundAttached = false;
  }

  /**
   * Professional model (moto.glb). Node contract (all optional): wheel_front|wheel_f and
   * wheel_rear|wheel_r (origin at the wheel centre), steering|handlebar|fork (origin on the
   * steering head; the front wheel turns with it), light_head, light_tail, plate; empties
   * named like the anchors (seat handleL handleR footL footR eye headlight) override them.
   */
  _bindGLB(gltf) {
    const root = instantiate(gltf.scene || gltf);
    root.updateMatrixWorld(true);
    const N = indexNodes(root);
    const pick = (...names) => names.map(N).find(Boolean) || null;
    // stash the procedural model; keep its lights / anchors
    const keep = [this.spot, this.spot.target, this.beam, ...Object.values(this.anchors)].filter(Boolean);
    this.root.updateMatrixWorld(true);
    const tmp = new THREE.Group();
    this.leanGroup.add(tmp);
    for (const k of keep) tmp.attach(k);
    for (const p of this._proc) p.removeFromParent();
    this.leanGroup.add(root);
    this.leanGroup.updateMatrixWorld(true);
    const wheel = (node) => {
      if (!node) return null;
      const pivot = new THREE.Group();
      node.parent.add(pivot);
      pivot.position.copy(node.parent.worldToLocal(worldPos(node)));
      pivot.updateMatrixWorld(true);
      const spin = new THREE.Group();
      pivot.add(spin);
      spin.updateMatrixWorld(true);
      spin.attach(node);
      return { pivot, spin };
    };
    const fw = wheel(pick('wheel_front', 'wheel_f'));
    const rw = wheel(pick('wheel_rear', 'wheel_r'));
    // steering about the head-tube axis (through the steering node and the front axle)
    const st = pick('steering', 'handlebar', 'fork', 'front_assembly');
    const head = st ? worldPos(st) : fw ? worldPos(fw.pivot).add(new THREE.Vector3(0, 0.62, 0.3)) : new THREE.Vector3(0, 0.92, -0.48);
    const axis = fw ? head.clone().sub(worldPos(fw.pivot)).normalize() : new THREE.Vector3(0, Math.cos(0.45), Math.sin(0.45));
    if (axis.y < 0) axis.negate();
    const steerPivot = new THREE.Group();
    this.leanGroup.add(steerPivot);
    steerPivot.position.copy(this.leanGroup.worldToLocal(head.clone()));
    steerPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    const yaw = new THREE.Group();
    steerPivot.add(yaw);
    yaw.updateMatrixWorld(true);
    if (st) yaw.attach(st);
    if (fw) {
      let inside = false;
      fw.pivot.traverseAncestors((a) => (inside = inside || a === yaw));
      if (!inside) yaw.attach(fw.pivot);
    }
    this.steerGroup = yaw;
    this.frontWheel = fw ? fw.spin : new THREE.Group();
    this.rearWheel = rw ? rw.spin : new THREE.Group();
    if (rw) this._rearR = worldPos(rw.pivot).y;
    // lenses: per-bike emissive copies of the model's materials
    const lens = (node, emissive, current) => {
      if (!node) return current;
      let mat = null;
      node.traverse((o) => {
        if (!o.isMesh) return;
        if (!mat) mat = paintedMaterial({ color: o.material.color?.clone() ?? 0xffffff, map: o.material.map || null, emissive, emissiveMap: o.material.emissiveMap || o.material.map || null, emissiveIntensity: 0, roughness: o.material.roughness ?? 0.2, brush: 0.1, name: 'bike_glb_lens' });
        o.material = mat;
      });
      return mat || current;
    };
    const hl = pick('light_head', 'headlight_lens');
    this._headMat = lens(hl, 0xfff0d0, this._headMat);
    this._tailMat = lens(pick('light_tail', 'taillight'), 0xff2010, this._tailMat);
    // headlight spot + beam ride the steering, aimed ahead and down
    const hp = hl ? boxOf(hl).getCenter(new THREE.Vector3()) : worldPos(yaw).add(new THREE.Vector3(0, 0.04, -0.24));
    yaw.updateMatrixWorld(true);
    yaw.add(this.spot, this.spot.target);
    this.spot.position.copy(yaw.worldToLocal(hp.clone()));
    this.spot.target.position.copy(yaw.worldToLocal(hp.clone().add(new THREE.Vector3(0, -0.9, -10))));
    if (this.beam) {
      yaw.add(this.beam);
      this.beam.position.copy(this.spot.position);
      this.beam.lookAt(yaw.localToWorld(this.spot.target.position.clone()));
      // createVolumetricBeam points along -Z: lookAt aims +Z, so flip
      this.beam.rotateY(Math.PI);
    }
    // anchors: empties override; handles + headlight follow the steering
    for (const [k, a] of Object.entries(this.anchors)) {
      const e = N(k);
      const parent = k === 'handleL' || k === 'handleR' || k === 'headlight' ? yaw : this.leanGroup;
      parent.attach(a);
      if (e) a.position.copy(parent.worldToLocal(worldPos(e)));
    }
    tmp.removeFromParent();
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.model = 'glb';
  }

  setPose(pos, yaw) {
    this.pos.copy(pos);
    if (this.world?.getHeight) this.pos.y = this.world.getHeight(pos.x, pos.z);
    this.yaw = yaw;
    this.v = 0;
    this._apply();
  }
  setControlsEnabled(v) {
    this.controlsEnabled = !!v;
  }
  /** Engine on/off (a parked bike should be switched off so its engine voice stops). */
  setEngine(on) {
    this.state.engineOn = !!on;
    if (!on) this.rpm = 0;
  }
  /** Headlight on/off. */
  setHeadlight(on) {
    this.state.headlight = !!on;
  }
  /** spec {splineId, s, speed (m/s) | speedKmh, lane, stopAt, place} or null. Returns Promise (stopped). */
  autopilot(spec) {
    if (this._autoResolve) {
      this._autoResolve(false);
      this._autoResolve = null;
    }
    if (!spec) {
      this.autopilotSpec = null;
      return Promise.resolve(false);
    }
    const sp = { lane: LAYOUT.laneOffset * 0.8, ...spec };
    if (sp.speedKmh !== undefined) sp.speed = sp.speedKmh / 3.6;
    if (sp.speed === undefined) sp.speed = 30 / 3.6;
    const road = this.world?.road;
    if (road && sp.place) {
      const smp = road.sample(sp.splineId, sp.s ?? 0);
      this.setPose(smp.pos.clone().addScaledVector(smp.right, sp.lane), Math.atan2(-smp.tangent.x, -smp.tangent.z));
    }
    this.autopilotSpec = sp;
    return new Promise((r) => (this._autoResolve = r));
  }

  update(dt) {
    if (!(dt > 0) || this.physics.frozen) return;
    let throttle = 0, brake = 0, steer = 0;
    const road = this.world?.road;
    if (this.autopilotSpec && road) {
      const sp = this.autopilotSpec;
      const pr = road.project(this.pos, sp.splineId);
      const s = pr && pr.id === sp.splineId ? pr.s : sp.s ?? 0;
      sp.s = s;
      const L = road.length(sp.splineId);
      const look = 3 + Math.abs(this.v) * 0.6;
      const smp = road.sample(sp.splineId, Math.min(L, s + look));
      const tx = smp.pos.x + smp.right.x * sp.lane - this.pos.x, tz = smp.pos.z + smp.right.z * sp.lane - this.pos.z;
      const fw = this.forward;
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const x = tx * rx + tz * rz, z = tx * fw.x + tz * fw.z;
      const ld = Math.max(0.5, Math.hypot(x, z));
      const want = Math.atan((2 * x * BIKE.wheelbase) / (ld * ld));
      steer = clamp(want / 0.5, -1, 1);
      let vT = sp.speed;
      const end = sp.stopAt ?? L - 2;
      vT = Math.min(vT, Math.sqrt(Math.max(0, 2 * 2.5 * Math.max(0, end - s - 0.3))));
      const err = vT - this.v;
      throttle = clamp(err * 0.4, 0, 1);
      brake = clamp(-err * 0.6, 0, 1);
      if (end - s < 0.5 && Math.abs(this.v) < 0.3 && this._autoResolve) {
        this._autoResolve(true);
        this._autoResolve = null;
      }
    } else if (this.controlsEnabled) {
      throttle = input.axis.throttle;
      brake = input.axis.brake;
      steer = input.axis.steer;
      if (input.pressed('headlights')) this.state.headlight = !this.state.headlight;
      if (input.pressed('horn')) audio.play('horn', { object: this.root, rate: 1.6, volume: 0.6 });
    }
    // longitudinal
    const engine_ = this.state.engineOn;
    const F = (engine_ ? throttle * 1500 * (1 - Math.min(1, this.v / 22)) : 0) - this.v * Math.abs(this.v) * 0.45 - Math.sign(this.v) * 60;
    this.v += (F / 160) * dt;
    const dB = brake * 7 * dt;
    this.v = Math.abs(this.v) <= dB ? 0 : this.v - Math.sign(this.v) * dB;
    this.v = Math.max(-1, this.v);
    // steering & lean
    const speed = Math.abs(this.v);
    const maxS = lerp(0.6, 0.12, Math.min(1, speed / 15));
    this.steerA = damp(this.steerA, -steer * maxS, 6, dt);
    const yawRate = (this.v * Math.tan(this.steerA)) / BIKE.wheelbase;
    this.yaw = wrapAngle(this.yaw + yawRate * dt);
    const leanT = clamp(Math.atan2(this.v * yawRate, 9.81), -0.6, 0.6);
    this.lean = damp(this.lean, leanT, 4, dt);
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.pos.addScaledVector(this.forward, this.v * dt);
    // corridor
    if (road?.project) {
      const pr = road.project(this.pos, this.physics.roadRef?.id ?? null);
      if (pr) {
        this.physics.roadRef = { id: pr.id, s: pr.s };
        const wall = (pr.width ?? 6.2) / 2 + LAYOUT.shoulder + 1.0;
        if (Math.abs(pr.lateral) > wall) {
          const pen = Math.abs(pr.lateral) - wall;
          this.pos.addScaledVector(pr.right, -Math.sign(pr.lateral) * pen);
          this.v *= 0.97;
        }
        this._offRoad = Math.abs(pr.lateral) > (pr.width ?? 6.2) / 2;
        if (this._offRoad) this.v *= 1 - 0.25 * dt;
      }
    }
    if (this.world?.getHeight) this.pos.y = damp(this.pos.y, this.world.getHeight(this.pos.x, this.pos.z), 16, dt);
    // engine
    this.gear = clamp(1 + Math.floor(speed / 6), 1, 4);
    const ratio = [0, 3.2, 2.0, 1.45, 1.1][this.gear];
    const coupled = (speed / BIKE.wheelR) * 9.55 * ratio * 3.2;
    this.rpm = damp(this.rpm, engine_ ? Math.max(1300 + throttle * 1500 * (speed < 2 ? 1 : 0), coupled) : 0, 8, dt);
    this.wheelRot += (this.v / BIKE.wheelR) * dt;
    this._apply();
    // lights
    const on = this.state.headlight && engine_;
    this.spot.intensity = on ? 70 : 0;
    this._headMat.emissiveIntensity = on ? 3 : 0;
    this._tailMat.emissiveIntensity = on ? (brake > 0.05 ? 3 : 1) : 0;
    if (this.beam) {
      this.beam.userData.setIntensity?.(on ? 0.26 : 0);
      this.beam.userData.setGroundY?.(this.pos.y + 0.03);
      this.beam.visible = on;
    }
    this.spot.getWorldPosition(_hp);
    this.spot.target.getWorldPosition(_hd).sub(_hp);
    submitHeadlight(this, on ? 1 : 0, _hp, _hd, BIKE_CONE, this.controlsEnabled ? 1e4 : this.autopilotSpec ? 50 : 0);
    // audio
    const bs = audio.bikeSound;
    if (bs) {
      if (!this._soundAttached) {
        bs.attach?.(this.root);
        this._soundAttached = true;
      }
      bs.setOn?.(engine_);
      bs.setRPM?.(this.rpm);
      bs.setLoad?.(throttle);
      bs.setGear?.(String(this.gear));
      bs.setSpeed?.(speed * 3.6);
      bs.setSurface?.(this._offRoad ? 'gravel' : 'asphalt');
    }
    this.physics.speed = this.v;
    this.physics.rpm = this.rpm;
    this.physics.steer = steer;
    this.physics.lean = this.lean;
  }

  _apply() {
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0, 'YXZ');
    this.leanGroup.rotation.z = -this.lean;
    this.steerGroup.rotation.y = this.steerA;
    this.frontWheel.rotation.x = -this.wheelRot;
    this.rearWheel.rotation.x = -this.wheelRot;
  }

  get speedKmh() {
    return Math.abs(this.v) * 3.6;
  }

  dispose() {
    this._off?.();
    releaseHeadlight(this);
    this.autopilot(null);
    this.root.removeFromParent();
  }
}
