// Camera feel (g.camfx): the small, physical life of the first-person view, layered on top of
// core/CameraRig without changing it. Every frame it adds its offsets just before the rig runs
// (order 49) and takes them back just after (order 51), so player look input, gaze checks and
// tweens on rig.fovOffset / rig.extraOffset by other code are never disturbed.
//
//   * breathing in the seat (slow rise and fall), a hint of engine tremor and road sway with speed
//   * a soft walking bob on foot (settings.headBob scales all of it; 0 = off)
//   * look-lag on fast turns: the head trails the car's yaw a little and rolls into the bend
//   * startle flinch: flinch(k) — a jerk back, a blink of tunnel vision (auto on scares and QTEs)
//   * dread: the FOV narrows slowly with g.rules.threat and during QTEs; relief() lets it go
//
//   g.camfx.flinch(k=1) · relief() · qte(on, dread) · enabled
import * as THREE from 'three';
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { engine } from '../../core/Engine.js';
import { settings } from '../../core/Settings.js';
import { clamp, damp, noise } from '../../core/math.js';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const SCARY = new Set(['scare', 'folklore', 'rule']);

export class CameraFeel {
  constructor() {
    this.enabled = true;
    this.t = 0;
    this.offset = new THREE.Vector3(); // added to rig.extraOffset (base space)
    this.yaw = 0; // added to rig.yaw for one frame
    this.pitch = 0;
    this.roll = 0;
    this.fov = 0; // added to rig.fovOffset for one frame
    this._applied = false;
    this._lastYaw = null;
    this._yawRate = 0;
    this._lag = 0;
    this._lean = 0;
    this._flinch = 0;
    this._flinchV = 0;
    this._dread = 0;
    this._qteDread = 0;
    this._relief = 0;
    this._walk = 0;
    this._breath = Math.random() * 6;
  }

  install() {
    if (this._installed) return this;
    this._installed = true;
    engine.onUpdate((dt) => this._pre(dt), 49, { always: true });
    engine.onUpdate(() => this._post(), 51, { always: true });
    // startle on scares: a reveal, a rule window opening, a hit
    bus.on('encounter:event', (e) => {
      const id = e?.id;
      if (!id || e.event !== 'encounter:' + id) return;
      const kind = g.director?.defs?.[id]?.kind;
      if (SCARY.has(kind)) this.flinch(kind === 'scare' ? 0.9 : 0.55);
    });
    bus.on('rule:event', (e) => {
      if (e?.phase === 'warn') this.flinch(0.35);
    });
    bus.on('death:start', () => this.flinch(1));
    bus.on('taxi:collision', (e) => this.flinch(clamp((e?.impulse ?? 4) / 10, 0.2, 0.8)));
    return this;
  }

  /** A startle: the head jerks back, the view tightens for a moment. k 0..1 */
  flinch(k = 1) {
    if (!this.enabled) return;
    const s = settings.get('cameraShake') ?? 1;
    this._flinchV += 7.5 * k * s;
    g.cameraRig?.shake?.(0.18 * k);
  }
  /** After a QTE / a scare passes: the shoulders drop, the FOV breathes back out. */
  relief() {
    this._relief = 1;
    this._qteDread = 0;
  }
  /** QTE framing: the view tightens while a QTE runs. */
  qte(on, dread = 0.6) {
    this._qteDread = on ? clamp(dread, 0, 1) : 0;
    if (on) this.flinch(0.6);
  }

  _ctx() {
    const rig = g.cameraRig;
    if (!rig || !rig.eye) return null;
    const p = g.player;
    const inTaxi = !!g.taxi && p?.vehicle === g.taxi;
    const onBike = !!g.bike && p?.vehicle === g.bike;
    const onFoot = p?.mode === 'foot';
    return { rig, inTaxi, onBike, onFoot };
  }

  _pre(dt) {
    this._applied = false;
    if (!this.enabled || engine.paused || !(dt > 0)) return;
    const c = this._ctx();
    if (!c) return;
    const { rig } = c;
    // nothing of this in authored shots
    const fp = 1 - clamp(rig.cineBlend ?? 0, 0, 1);
    this.t += dt;
    const bob = (settings.get('headBob') ?? 0.6) * fp;
    const o = this.offset.set(0, 0, 0);
    let yaw = 0, pitch = 0, roll = 0, fov = 0;

    // ---- breathing: ~15 breaths a minute, faster with dread
    const dread = clamp(Math.max(g.rules?.threat || 0, this._qteDread), 0, 1);
    this._dread = damp(this._dread, dread, dread > this._dread ? 1.6 : 0.5, dt);
    this._breath += dt * (1.55 + this._dread * 1.6) * (1 - this._relief * 0.45);
    const br = Math.sin(this._breath);
    const brAmp = (0.0032 + this._dread * 0.0022) * (1 + this._relief * 1.8);
    o.y += br * brAmp * bob;
    o.z += br * brAmp * 0.45 * bob;
    pitch += br * 0.0018 * bob;

    // ---- vehicles: engine tremor, road sway, look-lag into fast bends
    const veh = c.inTaxi ? g.taxi : c.onBike ? g.bike : null;
    if (veh) {
      const kmh = Math.abs(veh.speedKmh || 0);
      const run = veh === g.taxi ? !!veh.state?.engineOn : true;
      const tt = this.t;
      if (run) {
        const trem = (0.00035 + Math.min(kmh, 90) * 0.000006) * bob;
        o.x += noise.noise2D(tt * 23, 1.7) * trem;
        o.y += noise.noise2D(tt * 29, 5.3) * trem;
      }
      const sway = Math.min(kmh / 60, 1.2) * bob;
      o.x += noise.noise2D(tt * 0.9, 11.1) * 0.006 * sway;
      o.y += noise.noise2D(tt * 1.7, 2.9) * 0.004 * sway;
      roll += noise.noise2D(tt * 0.6, 7.7) * 0.004 * sway;
      // yaw rate of the vehicle (rad/s), smoothed
      (veh.root || veh).getWorldQuaternion?.(_q);
      _e.setFromQuaternion(_q, 'YXZ');
      const y = _e.y;
      if (this._lastYaw !== null) {
        let d = y - this._lastYaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const rate = clamp(d / dt, -3, 3);
        this._yawRate = damp(this._yawRate, rate, 6, dt);
      }
      this._lastYaw = y;
      // the head trails the turn (and the eyes look into it): small, never more than ~3°
      const lagT = clamp(-this._yawRate * 0.045 * (kmh > 8 ? 1 : kmh / 8), -0.055, 0.055);
      this._lag = damp(this._lag, lagT, 4, dt);
      const leanT = clamp(this._yawRate * Math.min(kmh, 80) * 0.00045, -0.03, 0.03);
      this._lean = damp(this._lean, leanT, 3, dt);
      yaw += this._lag * fp;
      roll += this._lean * fp;
      o.x += -this._lean * 0.35 * fp;
    } else {
      this._lastYaw = null;
      this._yawRate = damp(this._yawRate, 0, 4, dt);
      this._lag = damp(this._lag, 0, 4, dt);
      this._lean = damp(this._lean, 0, 4, dt);
    }

    // ---- on foot: a soft step bob (the body's own bob is filtered out of the eye)
    if (c.onFoot) {
      const sp = clamp((g.player.speed || 0) / 1.35, 0, 2);
      this._walk += dt * (sp > 1.5 ? 2.9 : 1.9) * Math.PI * 2 * (sp > 0.05 ? 1 : 0);
      const a = Math.min(sp, 1.6) * bob;
      o.y += (Math.abs(Math.sin(this._walk * 0.5)) - 0.5) * 0.022 * a;
      o.x += Math.sin(this._walk * 0.5) * 0.008 * a;
      roll += Math.sin(this._walk * 0.5) * 0.004 * a;
    }

    // ---- startle flinch (critically damped spring): back and up, the view tightens
    this._flinchV += -this._flinch * 120 * dt - this._flinchV * 16 * dt;
    this._flinch += this._flinchV * dt;
    const f = this._flinch;
    o.z += f * 0.035;
    o.y += f * 0.012;
    pitch += f * 0.03;
    fov -= f * 2.2;

    // ---- dread: a slow push in; relief lets it go
    fov -= this._dread * 5.5;
    this._relief = Math.max(0, this._relief - dt * 0.35);
    fov += this._relief * 1.2;

    // apply (taken back in _post)
    this.yaw = yaw;
    this.pitch = pitch;
    this.roll = roll;
    this.fov = fov;
    rig.extraOffset.add(o);
    rig.yaw += yaw;
    rig.pitch += pitch;
    rig.roll += roll;
    rig.fovOffset += fov;
    this._rig = rig;
    this._applied = true;
  }

  _post() {
    if (!this._applied) return;
    const rig = this._rig;
    rig.extraOffset.sub(this.offset);
    rig.yaw -= this.yaw;
    rig.pitch -= this.pitch;
    rig.roll -= this.roll;
    rig.fovOffset -= this.fov;
    this._applied = false;
  }
}

/** Install g.camfx once. */
export function ensureCameraFeel() {
  if (!g.camfx) g.camfx = new CameraFeel().install();
  return g.camfx;
}
