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

let headlightOwner = null;

export class TaxiLights {
  constructor(taxi, body, lenses, interiorParts) {
    this.taxi = taxi;
    this.lenses = lenses;
    this.parts = interiorParts;
    // --- headlight spot ----------------------------------------------------------------------
    const spot = new THREE.SpotLight(0xffe6c0, 0, 70, 0.5, 0.55, 1.35);
    spot.position.set(0, 0.62, -2.32);
    spot.target.position.set(0, 0.0, -16);
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
    for (const sx of [-1, 1]) {
      const low = make(15, 0.3);
      const high = make(28, 0.2);
      for (const b of [low, high]) {
        b.position.set(sx * 0.515, 0.595, -2.22);
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
    pool.position.set(0, 0.03, 2.9);
    pool.renderOrder = 2;
    taxi.chassis.add(pool);
    this.tailPool = pool;
    const headPoolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: 0xffd8a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const hp = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5).rotateX(-Math.PI / 2), headPoolMat);
    hp.position.set(0, 0.035, -4.6);
    taxi.chassis.add(hp);
    this.headPool = hp;
    // --- dome + dash glow ----------------------------------------------------------------------
    const dome = new THREE.PointLight(0xffd59a, 0, 2.8, 2);
    dome.position.set(0, 1.3, 0.25);
    body.add(dome);
    this.dome = dome;
    const dash = new THREE.PointLight(0x9cffc8, 0, 1.1, 2);
    dash.position.set(0.3, 0.92, -0.5);
    body.add(dash);
    this.dash = dash;
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
    for (const b of this.beams) {
      b.low.visible = hl > 0.01 && !high;
      b.high.visible = hl > 0.01 && high;
      b.low.userData.setIntensity?.(hl * 0.55);
      b.high.userData.setIntensity?.(hl * 0.75);
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
    if (anyDoor && state.cabinLight !== false) domeT = Math.max(domeT, 0.85);
    if (this.override.cabin !== null) domeT = this.override.cabin;
    if (this.override.flicker > 0) domeT *= Math.random() < this.override.flicker ? 0.05 : 1;
    this.domeLevel = damp(this.domeLevel, domeT, domeT > this.domeLevel ? 30 : 9, dt);
    this.dome.intensity = this.domeLevel * 0.7;
    this.parts.im.dome.emissiveIntensity = this.domeLevel * 2.2;
    // dash backlight + gauges
    const dashT = elec * (lightsOn ? 1 : 0.55);
    this.dashLevel = damp(this.dashLevel, dashT, 6, dt);
    this.dash.intensity = this.dashLevel * 0.05;
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
    const cam = engine.camera.position;
    this.spot.getWorldPosition(this._tmp);
    if (hl > 0.01) {
      if (!headlightOwner || headlightOwner === this || headlightOwner.headLevel <= 0.01 || headlightOwner._tmp.distanceTo(cam) > this._tmp.distanceTo(cam)) headlightOwner = this;
    } else if (headlightOwner === this) headlightOwner = null;
    if (headlightOwner === this) {
      const U = GLOBAL_UNIFORMS;
      U.uHeadlightPos.value.copy(this._tmp);
      this.spot.target.getWorldPosition(this._dir).sub(this._tmp).normalize();
      U.uHeadlightDir.value.copy(this._dir);
      U.uHeadlightOn.value = hl;
      if (U.uHeadlightCone) U.uHeadlightCone.value.set(Math.cos(high ? 0.36 : 0.48), Math.cos(high ? 0.12 : 0.2), high ? 70 : 46, U.uHeadlightCone.value.w || 8);
    } else if (!headlightOwner) {
      GLOBAL_UNIFORMS.uHeadlightOn.value = 0;
    }
  }

  dispose() {
    if (headlightOwner === this) {
      headlightOwner = null;
      GLOBAL_UNIFORMS.uHeadlightOn.value = 0;
    }
    this.spot.removeFromParent();
    this.dome.removeFromParent();
    this.dash.removeFromParent();
    for (const b of this.beams) {
      b.low.removeFromParent();
      b.high.removeFromParent();
    }
    this.tailPool.removeFromParent();
    this.headPool.removeFromParent();
  }
}
