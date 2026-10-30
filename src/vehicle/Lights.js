// Taxi lights: one headlight SpotLight (low / high beam, optional shadow) + soft
// volumetric beams, global headlight uniforms (fog scattering), tail / brake / reverse
// lenses with a red light pool on the road, indicators, roof sign, vacant lamp, the dome
// PointLight and a faint dashboard glow that lights the driver's hands.
import * as THREE from 'three';
import * as R from '../render/index.js';
import { GLOBAL_UNIFORMS } from '../render/index.js';
import { settings } from '../core/Settings.js';
import { engine } from '../core/Engine.js';
import { clamp, damp, lerp } from '../core/math.js';
import { makeCanvas, toTexture } from './VehicleTextures.js';

let _poolTex = null;
function poolTexture() {
  if (_poolTex) return _poolTex;
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  _poolTex = toTexture(c);
  return _poolTex;
}

function fallbackBeam(length, angle, color) {
  const r = Math.tan(angle) * length;
  const g = new THREE.CylinderGeometry(0.04, r, length, 24, 1, true);
  g.translate(0, -length / 2, 0);
  g.rotateX(Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: 0.3 }, uLength: { value: length } },
    vertexShader: `varying float vA; varying vec3 vN; varying vec3 vWP; uniform float uLength;
      void main(){ vA = clamp(-position.z/uLength,0.,1.); vec4 wp = modelMatrix*vec4(position,1.); vWP = wp.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uIntensity; varying float vA; varying vec3 vN; varying vec3 vWP;
      void main(){ vec3 V = normalize(cameraPosition - vWP); float s = pow(abs(dot(normalize(vN), V)), 1.5);
        float f = smoothstep(0.,0.08,vA)*(1.-smoothstep(0.4,1.,vA))/(1.+vA*vA*5.); gl_FragColor = vec4(uColor*uIntensity*s*f, 1.); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.userData.setIntensity = (v) => (m.uniforms.uIntensity.value = v);
  return mesh;
}

// ---- GLOBAL_UNIFORMS.uHeadlight* arbitration between every vehicle (taxis, the bike) ----------
// One headlight drives the fog-scattering uniforms: the player's vehicle (bias) or else the
// nearest one with its lights on. Every vehicle submits every frame.
let hlOwner = null;
let hlScore = Infinity;
/**
 * src: any key object; level 0..1; pos/dir world Vector3; cone [cosOuter, cosInner, range] or null;
 * bias: subtracted from the camera distance (player-driven vehicles pass a large bias).
 */
export function submitHeadlight(src, level, pos, dir, cone = null, bias = 0) {
  const U = GLOBAL_UNIFORMS;
  const score = level > 0.01 ? pos.distanceTo(engine.camera.position) - bias : Infinity;
  if (src === hlOwner) hlScore = score;
  else if (score < hlScore - 0.5) {
    hlOwner = src;
    hlScore = score;
  }
  if (hlOwner !== src) return;
  if (score === Infinity) {
    hlOwner = null;
    hlScore = Infinity;
    U.uHeadlightOn.value = 0;
    return;
  }
  U.uHeadlightPos.value.copy(pos);
  U.uHeadlightDir.value.copy(dir).normalize();
  U.uHeadlightOn.value = level;
  if (cone && U.uHeadlightCone) U.uHeadlightCone.value.set(cone[0], cone[1], cone[2], U.uHeadlightCone.value.w || 8);
}
/** Drop a vehicle from the arbitration (dispose). */
export function releaseHeadlight(src) {
  if (hlOwner !== src) return;
  hlOwner = null;
  hlScore = Infinity;
  GLOBAL_UNIFORMS.uHeadlightOn.value = 0;
}
const _cone = [0, 0, 0];

export class TaxiLights {
  constructor(taxi, body, lenses, interiorParts) {
    this.taxi = taxi;
    this.lenses = lenses;
    this.parts = interiorParts;
    // --- headlight spot ----------------------------------------------------------------------
    // positions follow the anchors (overridden by the GLB's empties / light nodes)
    const hl = taxi.anchorLocal('headlightL'), hr = taxi.anchorLocal('headlightR');
    const tl = taxi.anchorLocal('taillightL'), tr = taxi.anchorLocal('taillightR');
    const spot = new THREE.SpotLight(0xffe6c0, 0, 70, 0.5, 0.55, 1.35);
    spot.position.set((hl.x + hr.x) / 2, (hl.y + hr.y) / 2 + 0.025, Math.min(hl.z, hr.z) - 0.12);
    spot.target.position.set(spot.position.x, 0.0, spot.position.z - 13.7);
    body.add(spot, spot.target);
    const shadows = !!settings.get('shadows') && ['high', 'ultra'].includes(settings.get('graphicsPreset'));
    spot.castShadow = shadows;
    if (shadows) {
      const ms = Math.min(2048, settings.get('shadowMapSize') || 1024);
      spot.shadow.mapSize.set(ms, ms);
      spot.shadow.camera.near = 0.4;
      spot.shadow.camera.far = 45;
      spot.shadow.bias = -0.0004;
      spot.shadow.normalBias = 0.03;
    }
    this.spot = spot;
    // --- volumetric beams --------------------------------------------------------------------
    this.beams = [];
    const make = (len, ang) => (typeof R.createVolumetricBeam === 'function' ? R.createVolumetricBeam({ color: 0xffe2b8, length: len, angle: ang, intensity: 0, noise: 0.85 }) : fallbackBeam(len, ang, 0xffe2b8));
    for (const hp of [hl, hr]) {
      const low = make(15, 0.3);
      const high = make(28, 0.2);
      for (const b of [low, high]) {
        b.position.set(hp.x, hp.y, hp.z - 0.02);
        b.castShadow = false;
        b.receiveShadow = false;
        b.userData.setIntensity?.(0);
        b.visible = false;
        body.add(b);
      }
      low.rotation.x = -0.075;
      high.rotation.x = -0.02;
      this.beams.push({ low, high });
    }
    // --- taillight road glow -----------------------------------------------------------------
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: 0xff2010, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2).rotateX(-Math.PI / 2), poolMat);
    pool.position.set((tl.x + tr.x) / 2, 0.03, Math.max(tl.z, tr.z) + 0.72);
    pool.renderOrder = 2;
    taxi.chassis.add(pool);
    this.tailPool = pool;
    const headPoolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: 0xffd8a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const hp = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5).rotateX(-Math.PI / 2), headPoolMat);
    hp.position.set(spot.position.x, 0.035, spot.position.z - 2.3);
    taxi.chassis.add(hp);
    this.headPool = hp;
    // --- contact shadow: soft ground occlusion under the body and each tyre (night scenes
    // have few shadow-casting lights, without it the car floats) ---------------------------
    const aoMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: 0x000000, transparent: true, opacity: 0.62, depthWrite: false, fog: false });
    const ao = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 5.0).rotateX(-Math.PI / 2), aoMat);
    ao.position.set(0, 0.018, -0.1);
    ao.renderOrder = 1;
    taxi.chassis.add(ao);
    const tyreAo = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.85).rotateX(-Math.PI / 2), aoMat);
    for (const w of taxi.ext?.wheels || []) {
      const m = tyreAo.clone();
      m.position.set(w.pivot.position.x, 0.02, w.pivot.position.z);
      m.renderOrder = 1;
      taxi.chassis.add(m);
    }
    this.contactShadow = ao;
    // --- dome + dash glow ----------------------------------------------------------------------
    const dome = new THREE.PointLight(0xffd59a, 0, 3.2, 2);
    dome.position.copy(taxi.anchorLocal('cabinLight')).add(new THREE.Vector3(0, -0.04, 0));
    body.add(dome);
    this.dome = dome;
    // instrument backlight spilling onto the wheel rim, the driver's hands and chest
    const dash = new THREE.PointLight(0xffb46a, 0, 1.25, 2);
    // under the binnacle hood, above the column shroud
    dash.position.copy(taxi.anchorLocal('steeringWheel')).add(new THREE.Vector3(0, 0.09, -0.38));
    body.add(dash);
    this.dash = dash;
    // night-adapted eyes: a very faint cool fill that only exists while the camera is in the
    // cabin, so the dark interior stays readable (never counted in cabinBrightness)
    const fill = new THREE.PointLight(0x8094a8, 0, 2.6, 2);
    fill.position.set(0.0, 1.18, -0.2);
    body.add(fill);
    this.fill = fill;
    this.fillLevel = 0;
    this.domeLevel = 0;
    this.dashLevel = 0;
    this.headLevel = 0;
    this.blink = 0;
    this.blinkOn = false;
    this.override = { cabin: null, flicker: 0 };
    this._tmp = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  /** Called every frame by the taxi. */
  update(dt, state, phys) {
    const L = this.lenses;
    const ignitionOn = state.ignition === 'on' || state.ignition === 'start' || state.engineOn;
    const elec = ignitionOn ? 1 : 0;
    // headlights (work with ignition on; parking lights glow dim)
    const mode = state.headlights;
    const headTarget = mode === 'off' ? 0 : elec * (state.ignition === 'start' ? 0.55 : 1);
    this.headLevel = damp(this.headLevel, headTarget, 14, dt);
    const high = mode === 'high';
    const hl = this.headLevel;
    this.spot.intensity = hl * (high ? 300 : 150);
    this.spot.angle = high ? 0.42 : 0.55;
    this.spot.distance = high ? 95 : 60;
    this.spot.target.position.set(0, high ? 0.45 : -0.2, -16);
    L.head.emissiveIntensity = hl * (high ? 5 : 3.2) + (mode !== 'off' ? 0.12 : 0);
    const gy = (phys.groundY ?? 0) + 0.03;
    for (const b of this.beams) {
      b.low.visible = hl > 0.01 && !high;
      b.high.visible = hl > 0.01 && high;
      b.low.userData.setIntensity?.(hl * 0.55);
      b.high.userData.setIntensity?.(hl * 0.75);
      b.low.userData.setGroundY?.(gy);
      b.high.userData.setGroundY?.(gy);
    }
    this.headPool.material.opacity = hl * (high ? 0.08 : 0.12);
    // tail / brake / reverse
    const lightsOn = mode !== 'off';
    const braking = phys.input.brake > 0.05 && elec;
    const tail = (lightsOn ? 0.9 : 0) + (braking ? 2.6 : 0);
    L.tail.emissiveIntensity = damp(L.tail.emissiveIntensity, tail, 18, dt);
    L.reverse.emissiveIntensity = damp(L.reverse.emissiveIntensity, state.gear === 'R' && elec ? 2.2 : 0, 18, dt);
    this.tailPool.material.opacity = clamp(L.tail.emissiveIntensity * 0.06, 0, 0.28);
    // indicators
    const ind = state.indicator;
    if (ind !== 'off' && elec) {
      this.blink += dt;
      const on = this.blink % 0.72 < 0.38;
      if (on !== this.blinkOn) {
        this.blinkOn = on;
        this.taxi._onIndicatorTick?.(on);
      }
    } else {
      this.blink = 0;
      if (this.blinkOn) {
        this.blinkOn = false;
        this.taxi._onIndicatorTick?.(false);
      }
    }
    const lOn = this.blinkOn && (ind === 'left' || ind === 'hazard');
    const rOn = this.blinkOn && (ind === 'right' || ind === 'hazard');
    L.indL.emissiveIntensity = lOn ? 3 : 0;
    L.indR.emissiveIntensity = rOn ? 3 : 0;
    // roof sign + vacant lamp (taxi electrics: roof sign follows headlights, vacant lamp when not hired)
    L.roofSign.emissiveIntensity = damp(L.roofSign.emissiveIntensity, (lightsOn ? 1.6 : 0) * Math.max(elec, 0), 10, dt);
    L.vacant.emissiveIntensity = damp(L.vacant.emissiveIntensity, state.vacantLamp && elec ? 2.4 : 0, 10, dt);
    // dome light (cabinLight or any door open), with override / flicker
    let domeT = state.cabinLight ? 1 : 0;
    const anyDoor = state.doors.fl > 0.05 || state.doors.fr > 0.05 || state.doors.rl > 0.05 || state.doors.rr > 0.05;
    // courtesy switch: an open door lights the dome (unless a horror override says otherwise)
    if (anyDoor) domeT = Math.max(domeT, 0.85);
    if (this.override.cabin !== null) domeT = this.override.cabin;
    if (this.override.flicker > 0) domeT *= Math.random() < this.override.flicker ? 0.05 : 1;
    this.domeLevel = damp(this.domeLevel, domeT, domeT > this.domeLevel ? 30 : 9, dt);
    this.dome.intensity = this.domeLevel * 1.5;
    this.parts.im.dome.emissiveIntensity = this.domeLevel * 2.2;
    // dash backlight + gauges
    const dashT = elec * (lightsOn ? 1 : 0.55);
    this.dashLevel = damp(this.dashLevel, dashT, 6, dt);
    this.dash.intensity = this.dashLevel * 0.16;
    const inside = this.taxi.isCameraInside?.() ? 1 : 0;
    this.fillLevel = damp(this.fillLevel, inside * (1 - this.domeLevel * 0.8), 3, dt);
    this.fill.intensity = this.fillLevel * 0.42;
    const gIntensity = this.dashLevel * 1.15;
    for (const k in this.parts.im.gauges) this.parts.im.gauges[k].emissiveIntensity = gIntensity;
    this.parts.im.needle.emissiveIntensity = 0.15 + this.dashLevel * 1.4;
    this.parts.im.warn.emissiveIntensity = 1.6 * elec;
    this.parts.im.radio.emissiveIntensity = state.radioOn && elec ? 1.3 : 0.0;
    this.parts.im.meter.emissiveIntensity = elec ? 1.5 : 0;
    // global headlight uniforms (owner = nearest taxi with lights on)
    this._updateGlobals(hl, high);
  }

  _updateGlobals(hl, high) {
    this.spot.getWorldPosition(this._tmp);
    this.spot.target.getWorldPosition(this._dir).sub(this._tmp);
    _cone[0] = Math.cos(high ? 0.36 : 0.48);
    _cone[1] = Math.cos(high ? 0.12 : 0.2);
    _cone[2] = high ? 70 : 46;
    const t = this.taxi;
    const bias = t.controlsEnabled || t.isCameraInside?.() ? 1e4 : t.autopilotSpec ? 50 : 0;
    submitHeadlight(this, hl, this._tmp, this._dir, _cone, bias);
  }

  dispose() {
    releaseHeadlight(this);
    this.spot.removeFromParent();
    this.dome.removeFromParent();
    this.dash.removeFromParent();
    this.fill.removeFromParent();
    for (const b of this.beams) {
      b.low.removeFromParent();
      b.high.removeFromParent();
    }
    this.tailPool.removeFromParent();
    this.headPool.removeFromParent();
  }
}
