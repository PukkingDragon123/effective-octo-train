// Somchai's dashboard monitor (the "head unit"): a cheap 7-inch screen on a bracket above the
// cassette radio, loaded with his own karaoke VCD and cat photos. It is on whenever the radio is on
// (and the car has power) and follows what the radio plays:
//   songs     karaoke VCD: Ken Burns over Thai scenery, title card, lyric fill in time with the song
//   DJ breaks / instrumental bridges / now and then on the dhamma station: the cat album
//   tuning / dead air (station 3 outside 03:00) / ghost interference: snow and rolling bars
//   scares    bus 'encounter:start' and 'rule:event' (start / warn / violated): 2-3 glitch frames
// Rendering: one 512x288 CanvasTexture redrawn at ~13 fps, only while the screen is near the camera,
// facing it and in the view frustum; emissive (untinted) plus a tiny cabin PointLight (Lights.js
// `screen`) tinted by the picture's average colour (never green-dominant).
//
// Timing comes from audio.radio.clock() (programme plan + seconds into the item); without running
// audio (before the first gesture, sandboxes) the screen runs its own copy of the programme.
//
//   taxi.headUnit  .on · .glitch(frames?) · .showAlbum() · .debug({station, item, time, album, glitch})
//   GLB: a node named head_unit_screen / headunit_screen / head_unit_display / screen_display /
//   monitor_screen / monitor_display (uv 0..1) is used as the screen; otherwise the modelled
//   monitor (HeadUnitModel.js) is fitted above the radio.
import * as THREE from 'three';
import { engine } from '../core/Engine.js';
import { bus } from '../core/Events.js';
import { audio } from '../audio/index.js';
import { paintedMaterial, GLOBAL_UNIFORMS } from '../render/index.js';
import { clamp, damp } from '../core/math.js';
import { buildMonitor, bindGLBScreen } from './HeadUnitModel.js';
import { ScreenPlayer } from './HeadUnitScreen.js';
import { FALLBACK_DJ, FALLBACK_TALK } from './HeadUnitData.js';
import { STATIONS } from './TaxiControls.js';

const FPS = 13;
const NEAR = 6.5;
const _c = new THREE.Vector3(), _n = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4(), _fr = new THREE.Frustum(), _sph = new THREE.Sphere();

// ---- the screen's own copy of the programme (same shape as the radio's plans) ---------------------
const LT = ['สาวนาคอยรัก', 'รถเมล์สายสุดท้าย', 'ฝนตกที่บ้านเกิด', 'คิดถึงแม่ที่อีสาน'];
const BL = ['ราตรีประดับดาว', 'จันทร์เจ้าขา', 'ลมหนาวที่เชียงคาน'];
const _plans = new Map();
function songPlan(kind, station, idx, th, bpm, sections, gender, father = false) {
  const barDur = (60 / bpm) * 4;
  const bars = sections.reduce((a, s) => a + s[1], 0);
  return { kind, station, idx, father, title: { th }, bpm, beatsPerBar: 4, barDur, sections, duration: bars * barDur, voice: { gender } };
}
function fallbackPlan(station, n) {
  const key = station * 1000 + n;
  let p = _plans.get(key);
  if (p) return p;
  if (station === 4) p = { kind: 'talk', station, idx: n, title: { th: 'ธรรมะยามดึก' }, text: FALLBACK_TALK[n % FALLBACK_TALK.length], duration: 13 };
  else if (station === 3) p = songPlan('ballad', 3, 0, 'ฝากรักไว้ที่ปลายทาง', 78, [['intro', 2], ['A', 16], ['inst', 8], ['A', 16], ['outro', 2]], 'm', true);
  else if (n % 2 === 1) p = { kind: 'dj', station, idx: (n - 1) / 2, title: { th: 'ดีเจ' }, text: FALLBACK_DJ[((n - 1) / 2) % FALLBACK_DJ.length], duration: 8 };
  else if (station === 1) p = songPlan('lukthung', 1, n / 2, LT[(n / 2) % LT.length], 124 + ((n * 5) % 9), [['intro', 4], ['A', 8], ['B', 8], ['inst', 4], ['A', 8], ['B', 8], ['outro', 4]], (n / 2) % 3 === 1 ? 'm' : 'f');
  else p = songPlan('ballad', 2, n / 2, BL[(n / 2) % BL.length], 90, [['intro', 4], ['A', 8], ['A', 8], ['inst', 8], ['A', 8], ['outro', 4]], 'm');
  _plans.set(key, p);
  return p;
}

export class HeadUnit {
  constructor(taxi) {
    this.taxi = taxi;
    const P = taxi.parts;
    this.player = new ScreenPlayer();
    this.material = paintedMaterial({ color: 0x050506, emissive: 0xffffff, emissiveMap: this.player.texture, emissiveIntensity: 0, roughness: 0.14, metalness: 0, brush: 0, wet: 0, atmoRim: 0, name: 'hu_screen' });
    this.parent = taxi.bodyInner;
    this.parent.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.parent.matrixWorld).invert();
    let bind = null;
    if (P.headUnitScreen) {
      const eye = taxi.anchorLocal('driverEye').clone().applyMatrix4(this.parent.matrixWorld);
      bind = bindGLBScreen(P.headUnitScreen, eye);
      if (bind) {
        bind.screen.material = this.material;
        bind.center.applyMatrix4(inv);
        bind.normal.transformDirection(inv);
        bind.lightPos.applyMatrix4(inv);
      }
    }
    if (!bind) {
      const rf = P.radioFace || { top: 0.766, front: -0.543 };
      bind = buildMonitor({ radioTop: rf.top, radioFront: rf.front, stackZ: rf.stack });
      bind.screen.material = this.material;
      (taxi.interior || this.parent).add(bind.group);
      this.group = bind.group;
      this.led = bind.led;
    }
    this.screen = bind.screen;
    this.centerLocal = bind.center.clone();
    this.normalLocal = bind.normal.clone().normalize();
    this.light = taxi.lights?.screen || null;
    if (this.light) this.light.position.copy(bind.lightPos);
    this.lightCol = new THREE.Color(0, 0, 0);
    this.lightLevel = 0;
    this.on = false;
    this.visible = false;
    this.acc = 1;
    this.dirty = true;
    this.frame = { on: false, plan: null, time: 0, tuning: false, ghost: 0, station: 0, hour: 22, stationLabel: '' };
    this.fb = { station: -1, n: 0, time: 0, plan: null };
    this._dbg = null;
    this._glitchCool = 0;
    const scare = () => this.glitch();
    this._offs = [
      bus.on('encounter:start', scare),
      bus.on('rule:event', (e) => {
        if (!e || e.phase === 'resolved') return;
        scare();
      }),
    ];
    this.player.clear();
  }

  /** Scare glitch: 2-3 frames (only while the screen is on). */
  glitch(frames) {
    if (!this.on || this._glitchCool > 0) return;
    this._glitchCool = 2.5;
    this.player.glitch(frames);
    this.dirty = true;
  }
  /** Start the cat album now. */
  showAlbum() {
    this.player.startSlideshow(true);
    this.dirty = true;
  }
  /** Test hook: {station, item, time} drives the screen's own programme; album / glitch force a mode. */
  debug(o = {}) {
    this._dbg = { ...(this._dbg || {}), ...o };
    this.player.bootT = 0;
    this.player.volT = 0;
    if (o.station !== undefined || o.item !== undefined || o.time !== undefined) {
      this.fb.station = o.station ?? this.fb.station;
      this.fb.n = o.item ?? this.fb.n;
      this.fb.time = o.time ?? this.fb.time;
      this.fb.plan = null;
    }
    if (o.album) {
      this.player.startSlideshow(o.album === 'intro');
      this.dirty = true;
    }
    if (o.glitch) {
      this._glitchCool = 0;
      this.glitch(o.glitch === true ? 3 : o.glitch);
    }
    this.dirty = true;
  }

  _fallback(dt, station, hour) {
    const fb = this.fb;
    if (station !== fb.station) {
      fb.station = station;
      fb.n = station === 3 ? 0 : (Math.random() * 3) | 0;
      fb.time = 6 + Math.random() * 30;
      fb.plan = null;
    }
    const h = ((hour % 24) + 24) % 24;
    if (station === 3 && !(h >= 3 && h < 4)) return null;
    if (!fb.plan) fb.plan = fallbackPlan(station, fb.n);
    fb.time += dt;
    if (fb.time > fb.plan.duration + 0.6) {
      fb.n = station === 3 ? 0 : fb.n + 1;
      fb.plan = fallbackPlan(station, fb.n);
      fb.time = -0.6;
    }
    return fb.plan;
  }

  _isVisible() {
    const cam = engine.camera;
    if (!cam) return false;
    const M = this.parent.matrixWorld;
    _c.copy(this.centerLocal).applyMatrix4(M);
    if (_c.distanceToSquared(cam.position) > NEAR * NEAR) return false;
    _n.copy(this.normalLocal).transformDirection(M);
    if (_d.copy(cam.position).sub(_c).dot(_n) < 0) return false;
    _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _fr.setFromProjectionMatrix(_m);
    _sph.center.copy(_c);
    _sph.radius = 0.12;
    return _fr.intersectsSphere(_sph);
  }

  update(dt) {
    const t = this.taxi;
    const s = t.state;
    const power = t.controls.hasPower();
    const on = !!s.radioOn && power;
    if (this._glitchCool > 0) this._glitchCool -= dt;
    if (this.led) {
      this.led.emissive.setHex(on ? 0x3a7bff : 0xff2a1a);
      this.led.emissiveIntensity = on ? 2.4 : power ? 1.3 : 0;
    }
    const P = this.player;
    if (on !== this.on) {
      this.on = on;
      if (on) {
        if (!this._dbg) P.boot();
        this.dirty = true;
      } else {
        P.clear();
        this.material.emissiveIntensity = 0;
      }
    }
    if (!on) {
      this._light(dt, 0);
      return;
    }
    P.tick(dt);
    // ---- what the radio is playing ----
    const f = this.frame;
    const hour = GLOBAL_UNIFORMS.uHour?.value ?? 22;
    f.on = true;
    f.hour = hour;
    const R = audio.radio;
    const clk = !this._dbg && t.isAudioOwner() && typeof R?.clock === 'function' ? R.clock() : null;
    const station = clamp((this._dbg?.station ?? s.radioStation) | 0, 0, 4);
    f.station = station;
    f.stationLabel = STATIONS[station]?.freq || '';
    if (clk) {
      f.plan = clk.plan;
      f.time = clk.time;
      f.tuning = clk.tuning;
      f.ghost = clk.ghost;
    } else {
      f.plan = station ? this._fallback(dt, station, hour) : null;
      f.time = this.fb.time;
      f.tuning = !station;
      f.ghost = R?.ghost ?? 0;
    }
    // ---- draw at ~13 fps while it can be seen ----
    this.acc += dt;
    const vis = this._isVisible();
    if (vis && (this.acc >= 1 / FPS || this.dirty || !this.visible)) {
      this.acc = 0;
      this.dirty = false;
      P.draw(f);
    }
    this.visible = vis;
    this.material.emissiveIntensity = 0.82 + (P.glitchFrames > 0 ? 0.35 : 0);
    const near = t.isCameraInside() || vis;
    this._light(dt, near ? 1 : 0);
  }

  _light(dt, want) {
    const L = this.light;
    if (!L) return;
    const P = this.player;
    const a = P.avg;
    // tint by the picture, but never green-dominant (and never fully saturated)
    let r = a[0], g = a[1], b = a[2];
    const cap = Math.max(r, b) + 0.02;
    if (g > cap) g = cap;
    const lum = 0.3 * r + 0.55 * g + 0.15 * b;
    const k = 0.35;
    r += (lum - r) * k;
    g += (lum - g) * k;
    b += (lum - b) * k;
    const target = want * P.level * (0.35 + lum * 0.9);
    this.lightLevel = damp(this.lightLevel, target, 8, dt);
    const m = Math.max(r, g, b, 1e-3);
    this.lightCol.r = damp(this.lightCol.r, r / m, 6, dt);
    this.lightCol.g = damp(this.lightCol.g, g / m, 6, dt);
    this.lightCol.b = damp(this.lightCol.b, b / m, 6, dt);
    L.color.copy(this.lightCol);
    L.intensity = this.lightLevel * 0.16;
  }

  dispose() {
    for (const off of this._offs) off?.();
    this._offs = [];
    this.player.dispose();
    this.material.dispose();
    this.group?.removeFromParent();
    if (this.light) this.light.intensity = 0;
  }
}
