// A ride's passenger: the humanoid, the hail, boarding / alighting, and the identification
// clues (GAME_DESIGN §3), driven by the passenger's `clues` in the ride data:
//   reflection  normal (DEFAULT layer) · none (MAIN_ONLY) · only (REFLECTION_ONLY: seen only in
//               mirrors) · twisted (reflection double, neck bent) · delayed (double moving ~0.5 s late)
//   shadow      a soft contact shadow on the seat under the cabin light (humans only)
//   breathFog   breath blooms on the nearest side glass (humans); ghosts chill the glass instead
//   weightKg    suspension sag + seat creak (ghosts weigh nothing)
//   meter       normal · glitch (bursts) · backward · oldDate (a date that already happened)
//   radioStatic static rises on the radio while they ride
//   blinks      ghosts that do not blink; ghosts are too still, head angle slightly off
//   feetFloat   the feet hover above the ground (seen at the pickup through the side window)
//   payment     coins / notes / old notes / leaves, with a short note (a Ton thought)
// Gore: Boy M's reflection shows the blood-soaked shirt; true forms are revealed by the
// death cinematics (setGore / setGhost).
import * as THREE from 'three';
import { g } from '../context.js';
import { createHumanoid } from '../../characters/index.js';
import { LAYERS } from '../../core/layers.js';
import { clamp, damp, lerp } from '../../core/math.js';
import { CHARACTERS } from '../data/characters.js';

const DOOR_OF = { rearLeft: 'rl', rearRight: 'rr', frontPassenger: 'fl', rearCenter: 'rl' };
const PANE_OF = { rearLeft: 'rl', rearRight: 'rr', frontPassenger: 'fl', rearCenter: 'rl' };
// dates the meter shows (Thai Buddhist Era): Somchai's last morning; a date seventy years back (Nuan)
const OLD_DATES = { somchai: '14-08-2568', nuan: '21-10-2499', saman: '05-02-2526' };

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();

let _blobTex = null;
function blobTexture() {
  if (_blobTex) return _blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 64, 64);
  _blobTex = new THREE.CanvasTexture(c);
  return _blobTex;
}

export class Passenger {
  constructor(ride, data) {
    this.ride = ride;
    this.data = data;
    this.clues = data.clues || {};
    this.ghost = data.identity === 'ghost';
    this.seatId = data.seat || 'rearLeft';
    this.doorId = DOOR_OF[this.seatId] || 'rl';
    this.pane = PANE_OF[this.seatId] || 'rl';
    this.seated = false;
    this.aboard = false;
    this.gone = false;
    this.frozen = false;
    this.time = 0;
    this._breathT = 1 + Math.random() * 2;
    this._meterT = 6 + Math.random() * 6;
    this._meterOn = false;
    this._meterSet = false;
    this._lookT = 2;
    this._lean = { cur: 0, target: 0, until: 0 };
    this._staticT = 0;
    this._lastStatic = -1;
    this.amuletWarmth = this.ghost ? (data.id === 'somchai' ? 0.45 : 1) : 0;

    const ch = CHARACTERS[data.characterId] || {};
    const spec = { id: data.characterId, ...(ch.appearance || { sex: 'f', age: 40 }) };
    const h = (this.humanoid = createHumanoid(spec));
    h.setGroundFn?.((x, z) => g.world.getHeight(x, z));
    g.engine.scene.add(h.root);
    // wait at the shoulder, facing the road
    const lm = g.world.landmarks[data.pickup];
    this.landmark = lm;
    const pos = lm.waitPos.clone();
    pos.y = g.world.getHeight(pos.x, pos.z);
    h.root.position.copy(pos);
    h.root.rotation.set(0, lm.facing ?? lm.yaw ?? 0, 0);
    if (data.id === 'monk') h.holdItem?.('umbrella', 'L');
    if (data.id === 'sri') h.holdItem?.('basket', 'L');
    if (data.id === 'saman') h.holdItem?.('cigarette', 'R');

    // ---- reflection channel -------------------------------------------------------------------
    const refl = this.clues.reflection || 'normal';
    this.reflection = refl;
    if (refl === 'none') h.setLayer(LAYERS.MAIN_ONLY);
    else if (refl === 'only') h.setLayer(LAYERS.REFLECTION_ONLY);
    else if (refl === 'twisted' || refl === 'delayed') {
      h.setLayer(LAYERS.MAIN_ONLY);
      this.double = h.createReflectionDouble(refl === 'twisted' ? { neckTwist: 1.6, stare: 1 } : {});
      g.engine.scene.add(this.double.root);
      if (refl === 'delayed') this._initDelay();
    }
    // ---- body channel -----------------------------------------------------------------------------
    if (this.ghost) {
      const ghostT = { still: 0.75, headRoll: data.id === 'somchai' ? 0.04 : 0.11 };
      if (this.clues.blinks === false) ghostT.noBlink = 1;
      if (this.clues.feetFloat) ghostT.levitate = 0.075;
      h.setGhost(ghostT, 50);
      h.root.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
      });
    }
    // Boy M: the mirror shows the blood-soaked school shirt
    if (data.id === 'boyM') {
      const reduced = g.settings?.get('gore') === 'reduced';
      h.setGore({ wound: 'chest', amount: reduced ? 0.35 : 0.7, bleedMouth: reduced ? 0 : 0.25, speed: 50 });
    }
    // contact shadow under the cabin light (humans only)
    if (this.clues.shadow) this._makeShadow();
    this._offPost = g.engine.onUpdate((dt) => this._postUpdate(dt), 22);
  }

  get headPosition() {
    return this.humanoid.headPosition;
  }
  // humanoid passthroughs (encounters and death cinematics may treat g.ride.passenger like a humanoid)
  get root() {
    return this.humanoid.root;
  }
  get seatAnchor() {
    return g.taxi.seats[this.seatId];
  }
  setGhost(v, speed) {
    this.humanoid.setGhost(v, speed);
  }
  setGore(v) {
    this.humanoid.setGore(v);
  }
  setExpression(e) {
    this.humanoid.setExpression(e);
  }
  lookAt(target, opts) {
    this.humanoid.lookAt(target, opts);
  }
  play(name, opts) {
    return this.humanoid.play(name, opts);
  }
  get disposed() {
    return !!this.humanoid?.disposed;
  }

  // ------------------------------------------------------------------ hail
  /** Thai palm-down beckon toward the oncoming taxi. */
  hail(on = true) {
    const h = this.humanoid;
    if (!h || h.disposed || this.seated) return;
    if (on && !this._hailing) {
      this._hailing = true;
      try {
        h.play('hail', { side: 'R', lookAt: g.taxi.root });
      } catch (e) {
        /* ignore */
      }
    } else if (!on && this._hailing) {
      this._hailing = false;
      h.stop?.('hail');
    }
  }

  /** Door point outside the car on the passenger's side (world). */
  doorOutside(out = new THREE.Vector3()) {
    const t = g.taxi;
    const a = t.anchors['door' + this.doorId.toUpperCase()] || t.anchors.doorRL;
    t.root.updateMatrixWorld(true);
    out.copy(a.position);
    out.x += Math.sign(out.x || -1) * 0.72;
    out.z += 0.1;
    t.bodyInner.localToWorld(out);
    out.y = g.world.getHeight(out.x, out.z);
    return out;
  }
  _behindCar(out = new THREE.Vector3()) {
    const t = g.taxi;
    out.set(0, 0, 3.0);
    t.bodyInner.localToWorld(out);
    out.y = g.world.getHeight(out.x, out.z);
    return out;
  }
  async _walk(to, maxS = 6) {
    const h = this.humanoid;
    const arrived = await Promise.race([h.walkTo(to, {}).then(() => true), new Promise((r) => setTimeout(() => r(false), maxS * 1000))]);
    if (!arrived && !h.disposed) {
      h.stopWalking?.();
      h.root.position.copy(to);
    }
  }

  // ------------------------------------------------------------------ board / alight
  /** Walk to the door, door opens, sit, door shuts. Resolves when seated. */
  async board() {
    const t = g.taxi;
    const h = this.humanoid;
    this.hail(false);
    this.boarding = true;
    h.lookAt(null);
    // the far-side seat (behind the driver): walk round the back of the car
    if (this.doorId === 'rr' || this.doorId === 'fr') await this._walk(this._behindCar(_v2).clone(), 5);
    if (h.disposed) return;
    await this._walk(this.doorOutside(new THREE.Vector3()), 6);
    if (h.disposed) return;
    if (this.reflection === 'only') g.audio?.play?.('door_open', { object: t.anchors['door' + this.doorId.toUpperCase()], volume: 0.4, rate: 0.85 });
    await t.openDoor(this.doorId, 1, this.reflection === 'only' ? 1.6 : 0.8);
    if (h.disposed) return;
    await new Promise((r) => setTimeout(r, 450));
    if (h.disposed) return;
    h.sitAt(t.seats[this.seatId], { pose: 'sitCar' });
    this._seatBase = h.root.position.clone();
    this.seated = true;
    this.aboard = true;
    this.boarding = false;
    if (this.double) this.double.root.visible = true;
    t.setSeatWeight(this.seatId, this.ghost ? 0 : this.clues.weightKg || 60);
    if (this.ghost && this.data.id !== 'somchai') {
      // cold from the OUTSIDE: her window clouds over (ghost channel; humans fog it with breath)
      t.setFog(this.pane, 0.42);
      t.setFog('windshield', 0.12);
    }
    await new Promise((r) => setTimeout(r, 650));
    t.openDoor(this.doorId, 0, 0.7);
  }

  /**
   * Get out. opts { to: Vector3 (walk target), fade: seconds (ghosts fade into the mist), pay: bool }
   * Resolves once the passenger is outside and walking away (not when the walk ends).
   */
  async alight(opts = {}) {
    const t = g.taxi;
    const h = this.humanoid;
    if (!h || h.disposed) return;
    this.leanIn(0);
    await t.openDoor(this.doorId, 1, 0.8);
    if (h.disposed) return;
    t.setSeatWeight(this.seatId, 0);
    this.seated = false;
    this.aboard = false;
    if (this._shadow) this._shadow.grp.visible = false;
    h.detach(g.engine.scene);
    h.root.position.copy(this.doorOutside(_v));
    h.setMode?.('stand');
    if (this.clues.feetFloat) h.setGhost({ levitate: 0.075 }, 2);
    this._restoreMeter();
    g.audio?.radio?.setStatic?.(0);
    if (this.ghost) {
      // the cold leaves with them
      t.setFog(this.pane, 0.06);
      t.setFog('windshield', 0);
    }
    setTimeout(() => t.openDoor(this.doorId, 0, 0.9), 1300);
    if (opts.to) {
      const to = opts.to.clone();
      to.y = g.world.getHeight(to.x, to.z);
      h.walkTo(to, {}).catch?.(() => {});
    }
    if (opts.fade) {
      const dur = opts.fade;
      let t0 = 0;
      const off = g.engine.onUpdate((dt) => {
        t0 += dt;
        if (h.disposed) return off();
        const k = clamp(t0 / dur);
        h.setOpacity?.(1 - k);
        if (this.double && !this.double.disposed) this.double.setOpacity?.(1 - k);
        if (k >= 1) {
          off();
          this.gone = true;
        }
      }, 1);
    }
  }

  /** Data payment note {th,en} (shown as a Ton thought by the fork resolver). */
  get payment() {
    return this.clues.payment || null;
  }

  // ------------------------------------------------------------------ r4 ghosts lean in
  /** Lean forward between the front seats toward the driver for `seconds` (0 = sit back). */
  leanIn(seconds = 8) {
    if (!this.seated) return;
    const L = this._lean;
    if (seconds <= 0) {
      L.target = 0;
      L.until = 0;
      return;
    }
    L.target = 1;
    L.until = this.time + seconds;
  }
  get leaning() {
    return this._lean.cur > 0.5;
  }

  // ------------------------------------------------------------------ per frame (from Ride)
  update(dt) {
    const h = this.humanoid;
    if (!h || h.disposed || this.frozen) return;
    this.time += dt;
    const t = g.taxi;
    // waiting at the roadside: watch the taxi come
    if (!this.seated && !this.aboard && !this.gone) {
      if (this.boarding) return;
      this._lookT -= dt;
      if (this._lookT <= 0) {
        this._lookT = 1.5;
        const d = h.root.position.distanceTo(t.root.position);
        if (d < 90) h.lookAt(t.anchors.driverEye, { speed: this.ghost ? 1.2 : 3, unlimited: this.ghost });
      }
      return;
    }
    if (!this.seated) return;
    this._updateLean(dt);
    this._updateGaze(dt);
    this._updateBreath(dt);
    this._updateShadow();
    this._updateMeter(dt);
    this._updateRadio(dt);
  }

  _updateLean(dt) {
    const L = this._lean;
    if (L.target > 0 && this.time > L.until) L.target = 0;
    const prev = L.cur;
    L.cur = damp(L.cur, L.target, L.target > L.cur ? 1.6 : 2.4, dt);
    if (Math.abs(L.cur - prev) < 1e-4 && L.cur < 1e-3) return;
    const h = this.humanoid;
    if (!this._seatBase) return;
    const side = this.seatId === 'rearRight' ? -1 : 1; // toward the car's centre line
    const k = L.cur;
    h.root.position.set(this._seatBase.x + side * 0.3 * k, this._seatBase.y + 0.08 * k, this._seatBase.z - 0.82 * k);
    if (Math.abs(L.cur - prev) > 1e-3) h.setGhost({ stretch: 0.32 * k, still: 0.75 * (1 - k) }, 6);
  }

  _updateGaze(dt) {
    const h = this.humanoid;
    this._lookT -= dt;
    if (this._lookT > 0) return;
    const t = g.taxi;
    if (this.ghost) {
      // ghosts stare at the driver, long and still; now and then out of the window
      const atDriver = this.leaning || Math.random() < 0.7;
      this._lookT = atDriver ? 6 + Math.random() * 6 : 3;
      if (atDriver) h.lookAt(t.anchors.driverEye, { speed: 1.4, unlimited: true });
      else h.lookAt(this._outsidePoint(_v2).clone(), { speed: 1.2 });
    } else {
      // people glance about: the road ahead, out of their window, at the driver when talking
      const r = Math.random();
      this._lookT = 2.5 + Math.random() * 4;
      if (g.dialogue.current?.humanoid === h || r < 0.3) h.lookAt(t.anchors.driverEye, { speed: 4 });
      else if (r < 0.7) h.lookAt(this._aheadPoint(_v2).clone(), { speed: 3 });
      else h.lookAt(this._outsidePoint(_v2).clone(), { speed: 3 });
    }
  }
  _aheadPoint(out) {
    return out.copy(g.taxi.root.position).addScaledVector(g.taxi.forward, 25).add(_v.set(0, 1.2, 0));
  }
  _outsidePoint(out) {
    const side = this.seatId === 'rearRight' ? 1 : -1;
    out.set(side * 6, 1.1, 0.5);
    return g.taxi.bodyInner.localToWorld(out);
  }

  _updateBreath(dt) {
    if (!this.clues.breathFog) return;
    this._breathT -= dt;
    if (this._breathT > 0) return;
    const hour = g.clock?.hour ?? 22;
    const cold = hour < 24 ? 1.25 : hour < 28 ? 1 : 0.7;
    const big = this.data.id === 'piak' ? 1.5 : 1;
    this._breathT = 3.2 + Math.random() * 2.2;
    const head = this.humanoid.headPosition;
    // a point on the way from the mouth to the nearest side glass
    const out = this._outsidePoint(_v2);
    _v.copy(out).sub(head).normalize();
    const p = _v2.copy(head).addScaledVector(_v, 0.22);
    p.y -= 0.04;
    g.taxi.addBreathFog(this.pane, p, clamp(0.55 * cold * big, 0.2, 1));
  }

  _makeShadow() {
    const t = g.taxi;
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTexture(), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const seat = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.46), mat);
    seat.rotation.x = -Math.PI / 2;
    seat.position.set(0, 0.012, -0.04);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.5), mat);
    back.position.set(0.04, 0.34, 0.2);
    back.rotation.x = -0.18;
    const grp = new THREE.Group();
    grp.add(seat, back);
    grp.renderOrder = 2;
    t.seats[this.seatId]?.add(grp);
    this._shadow = { grp, mat };
  }
  _updateShadow() {
    if (!this._shadow) return;
    const b = g.taxi.cabinBrightness || 0;
    this._shadow.mat.opacity = clamp(b, 0, 1) * 0.62;
    this._shadow.grp.visible = b > 0.02;
  }

  _glitchSpec() {
    const m = this.clues.meter;
    if (m === 'backward') return { mode: 'backward' };
    if (m === 'glitch') return { mode: 'glitch' };
    if (m === 'oldDate') return { mode: 'date', date: OLD_DATES[this.data.id] || '01-01-2520' };
    return null;
  }
  _updateMeter(dt) {
    const m = this.clues.meter;
    const t = g.taxi;
    if (!m || m === 'normal') return;
    if (g.rules?.isArmed?.('r11')) return; // 444 owns the meter
    if (!t.state.meterOn) {
      if (this._meterSet) this._restoreMeter();
      return;
    }
    if (m === 'backward') {
      if (!this._meterSet) {
        t.setMeterGlitch({ mode: 'backward' });
        this._meterSet = true;
        this.ride?.emit('meterGlitch');
      }
      return;
    }
    this._meterT -= dt;
    if (this._meterT > 0) return;
    if (this._meterSet) {
      t.setMeterGlitch(null);
      this._meterSet = false;
      this._meterT = 8 + Math.random() * 10;
    } else {
      t.setMeterGlitch(this._glitchSpec());
      this._meterSet = true;
      this._meterT = m === 'oldDate' ? 3.5 : 1.2 + Math.random() * 1.2;
      g.audio?.play?.('meter_beep', { object: t.anchors.meter, volume: 0.25, rate: 0.6 });
      this.ride?.emit('meterGlitch');
    }
  }
  _restoreMeter() {
    if (this._meterSet && !g.rules?.isArmed?.('r11')) g.taxi.setMeterGlitch(null);
    this._meterSet = false;
  }

  _updateRadio(dt) {
    const s = this.clues.radioStatic || 0;
    if (s <= 0) return;
    this._staticT -= dt;
    if (this._staticT > 0) return;
    this._staticT = 0.3;
    const on = g.taxi.state.radioOn;
    // stronger when you look toward them
    const look = g.cameraRig.isLookingAt(this.humanoid.headPosition, 50) ? 1 : 0.65;
    const v = on ? clamp(s * look * (0.8 + 0.2 * Math.sin(this.time * 1.7)), 0, 1) : 0;
    if (Math.abs(v - this._lastStatic) > 0.03) {
      g.audio?.radio?.setStatic?.(v);
      this._lastStatic = v;
    }
  }

  // ------------------------------------------------------------------ delayed reflection (Somchai)
  _initDelay() {
    const d = this.double;
    d.setFollow(false);
    const n = d.boneList?.length || 0;
    this._delay = { buf: [], n, delay: 0.5, t: 0 };
  }
  _postUpdate(dt) {
    const d = this.double;
    if (!d || d.disposed || !this._delay || this.humanoid.disposed) return;
    const D = this._delay;
    D.t += dt;
    const src = this.humanoid;
    const bones = d.srcBones || [];
    src.root.updateWorldMatrix(true, false);
    // record (ring buffer, ~1 s)
    let rec = D.buf.length > 90 ? D.buf.shift() : { m: new THREE.Matrix4(), ip: new THREE.Vector3(), iq: new THREE.Quaternion(), b: new Float32Array(bones.length * 7) };
    rec.t = D.t;
    rec.m.copy(src.root.matrixWorld);
    if (src.inner) {
      rec.ip.copy(src.inner.position);
      rec.iq.copy(src.inner.quaternion);
    }
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i], o = i * 7;
      rec.b[o] = b.position.x;
      rec.b[o + 1] = b.position.y;
      rec.b[o + 2] = b.position.z;
      rec.b[o + 3] = b.quaternion.x;
      rec.b[o + 4] = b.quaternion.y;
      rec.b[o + 5] = b.quaternion.z;
      rec.b[o + 6] = b.quaternion.w;
    }
    D.buf.push(rec);
    // apply the sample from `delay` seconds ago (the root follows the car exactly: only the body lags)
    const want = D.t - D.delay;
    let use = D.buf[0];
    for (const r of D.buf) if (r.t <= want) use = r;
    if (d.root.parent) {
      d.root.parent.updateWorldMatrix(true, false);
      _m.copy(d.root.parent.matrixWorld).invert().multiply(src.root.matrixWorld);
      _m.decompose(d.root.position, d.root.quaternion, d.root.scale);
    }
    if (d.inner) {
      d.inner.position.copy(use.ip);
      d.inner.quaternion.copy(use.iq);
    }
    const list = d.boneList || [];
    for (let i = 0; i < list.length && i < bones.length; i++) {
      const b = list[i], o = i * 7;
      if (!b) continue;
      b.position.set(use.b[o], use.b[o + 1], use.b[o + 2]);
      b.quaternion.set(use.b[o + 3], use.b[o + 4], use.b[o + 5], use.b[o + 6]);
    }
    d.inner?.updateMatrixWorld(true);
  }

  dispose() {
    this._offPost?.();
    this._offPost = null;
    this._restoreMeter();
    if (this.clues.radioStatic) g.audio?.radio?.setStatic?.(0);
    if (this._shadow) {
      this._shadow.grp.removeFromParent();
      this._shadow.grp.traverse((o) => o.geometry?.dispose?.());
      this._shadow.mat.dispose();
      this._shadow = null;
    }
    if (this.seated) g.taxi.setSeatWeight(this.seatId, 0);
    try {
      this.double?.dispose();
    } catch (e) {
      /* ignore */
    }
    this.double = null;
    try {
      this.humanoid?.dispose();
    } catch (e) {
      /* ignore */
    }
    this.seated = this.aboard = false;
    this.gone = true;
  }
}

void lerp;
