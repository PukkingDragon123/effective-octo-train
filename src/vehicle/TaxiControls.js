// Taxi controls: state changes (setControl), physical look-and-click interactables
// (core/interact, ids 'taxi.*'), hotkeys, and the per-frame animation of every control
// (key, wheel, stalks, pedals, gear lever, handbrake, needles, cranks, visors, glovebox,
// wipers, doors, windows), plus the LED taxi meter / radio / warning-light displays.
import * as THREE from 'three';
import { interact } from '../core/Interact.js';
import { input } from '../core/Input.js';
import { bus } from '../core/Events.js';
import { settings } from '../core/Settings.js';
import { LAYERS } from '../core/layers.js';
import { clamp, damp, lerp, easeInOut } from '../core/math.js';
import { audio, STATION_NAMES } from '../audio/index.js';
import { cameraRig } from '../core/CameraRig.js';
import { GLOBAL_UNIFORMS } from '../render/index.js';
import { FONTS } from '../ui/fonts.js';

export const AUTO_GEARS = ['P', 'R', 'N', 'D', '2', 'L'];
export const MANUAL_GEARS = ['R', 'N', '1', '2', '3', '4', '5'];
/**
 * Radio stations, indexed like audio.radio (1..4; 0 = between stations / static).
 * state.radioStation uses the same numbering (3 = the station that only exists at 03:00).
 */
const _SN = STATION_NAMES || {};
export const STATIONS = [
  { freq: 'FM 88.00', name: '· · ·', th: '· · ·', en: '(static)' },
  { freq: _SN[1]?.freq || 'FM 91.5', name: _SN[1]?.th || 'ลูกทุ่งยามดึก', th: _SN[1]?.th || 'ลูกทุ่งยามดึก', en: _SN[1]?.en || 'Late-Night Luk Thung' },
  { freq: _SN[2]?.freq || 'FM 97.25', name: _SN[2]?.th || 'เพลงเก่าเล่าความหลัง', th: _SN[2]?.th || 'เพลงเก่าเล่าความหลัง', en: _SN[2]?.en || 'Old Songs, Old Stories' },
  { freq: _SN[3]?.freq || 'FM 103.3', name: _SN[3]?.th || '…', th: _SN[3]?.th || '…', en: _SN[3]?.en || '…' },
  { freq: _SN[4]?.freq || 'AM 1080', name: _SN[4]?.th || 'ธรรมะยามดึก', th: _SN[4]?.th || 'ธรรมะยามดึก', en: _SN[4]?.en || 'Late-Night Dhamma' },
];
const ENGINE_CRANK = [0.82, 1.05]; // seconds of cranking per engine_start variant (audio/Synth/sfxCar.js)

const LABELS = {
  key_insert: ['เสียบกุญแจ', 'Insert the key'],
  key_on: ['บิดกุญแจ', 'Turn the key'],
  key_start: ['สตาร์ทเครื่อง', 'Start the engine'],
  key_off: ['ดับเครื่อง', 'Turn off the engine'],
  handbrake_on: ['ดึงเบรกมือ', 'Pull the handbrake'],
  handbrake_off: ['ปลดเบรกมือ', 'Release the handbrake'],
  gear: ['เข้าเกียร์', 'Shift gear'],
  headlights: ['ไฟหน้า', 'Headlights'],
  wipers: ['ที่ปัดน้ำฝน', 'Wipers'],
  indicator: ['ไฟเลี้ยว', 'Indicator'],
  cabinLight: ['ไฟในห้องโดยสาร', 'Cabin light'],
  radio: ['เปิด/ปิดวิทยุ', 'Radio on/off'],
  radioTune: ['หมุนหาคลื่น', 'Tune the radio'],
  meter: ['กดมิเตอร์', 'Taxi meter'],
  horn: ['บีบแตร', 'Horn'],
  window: ['หมุนกระจก', 'Wind the window'],
  door_open: ['เปิดประตู', 'Open the door'],
  door_close: ['ปิดประตู', 'Close the door'],
  trunk: ['ฝากระโปรงท้าย', 'Trunk'],
  glovebox: ['ช่องเก็บของ', 'Glovebox'],
  visor: ['ที่บังแดด', 'Sun visor'],
  wipe: ['เช็ดฝ้า', 'Wipe the fog'],
  sticker: ['ดูสติกเกอร์', 'Look at the sticker'],
};

export class TaxiControls {
  constructor(taxi) {
    this.taxi = taxi;
    this.items = [];
    this.anim = {
      key: 0, gear: new THREE.Vector2(), handbrake: 1, glove: 0, visorD: 0, visorP: 0, stalkL: 0, stalkLtilt: 0, stalkW: 0,
      temp: 0, fuel: 0.46, speedN: 0, tachoN: 0, volume: 0, tune: 0, crank: { fl: 0, fr: 0, rl: 0, rr: 0 }, handle: { fl: 0, fr: 0, rl: 0, rr: 0 },
      wiperPhase: 0, wiperAngle: 0, wiperActive: false, hornHandle: null, startTimer: 0,
    };
    this.windowDrive = {}; // id -> {dir, auto}
    this.doorTweens = {};
    this.meterKey = '';
    this.meterGlitch = null;
    this.fare = 35;
    this.fareDist = 0;
    this.fareTime = 0;
    this._busOff = bus.on('audio:radio', (d) => {
      if (!d || !taxi.isAudioOwner()) return;
      if (typeof d.station === 'number') taxi.state.radioStation = d.station;
      if (typeof d.on === 'boolean') taxi.state.radioOn = d.on;
      this.radioSong = d.song || '';
    });
  }

  // ---------------------------------------------------------------------------
  // state changes
  // ---------------------------------------------------------------------------
  async set(control, value, opts = {}) {
    const t = this.taxi;
    const s = t.state;
    const src = opts.source || 'api';
    const reach = opts.reach ?? (src === 'interact' || src === 'hotkey');
    if (reach && t.onReach) {
      const target = this.reachTarget(control, value);
      try {
        await t.onReach(target, { control, value, source: src });
      } catch (e) {
        /* reach is cosmetic */
      }
    }
    const pos = { object: this.reachTarget(control, value) };
    let emitValue = value;
    switch (control) {
      case 'key': {
        const v = !!value;
        if (v === s.keyInserted) break;
        if (!v && (s.engineOn || s.ignition !== 'off')) this.set('ignition', 'off', { reach: false });
        s.keyInserted = v;
        if (!v) s.ignition = 'off';
        audio.play('key_insert', pos);
        break;
      }
      case 'ignition': {
        if (!s.keyInserted) break;
        if (value === 'start') {
          if (s.engineOn || this.anim.startTimer > 0) break;
          // the key passes through ON on its way to START
          if (s.ignition === 'off' || s.ignition === 'acc') audio.play('ignition', { ...pos, volume: 0.7 });
          s.ignition = 'start';
          audio.play('key_turn', pos);
          const variant = opts.variant ?? (Math.random() < 0.5 ? 0 : 1);
          const crank = opts.crank ?? ENGINE_CRANK[variant];
          // the engine loop plays the crank + catch itself (engine_start) when it owns the car;
          // otherwise play the one-shot here
          const es = audio.engineSound;
          if (es && t.isAudioOwner()) {
            t._engineCranking = true;
            es.setOn(true, { variant });
          } else audio.play('engine_start', { ...pos, variant });
          this.anim.startTimer = crank;
          bus.emit('taxi:control', { control, value: 'start' });
          await new Promise((r) => setTimeout(r, crank * 1000));
          t._engineCranking = false;
          if (s.ignition !== 'start') {
            this.anim.startTimer = 0;
            return;
          }
          s.ignition = 'on';
          s.engineOn = true;
          this.anim.startTimer = 0;
          t.physicsSim.rpm = 1400;
          bus.emit('taxi:engine', { on: true });
          emitValue = 'on';
          break;
        }
        if (value === 'off') {
          if (s.engineOn) {
            s.engineOn = false;
            bus.emit('taxi:engine', { on: false });
          }
          s.ignition = 'off';
          audio.play('key_turn', { ...pos, volume: 0.8, rate: 0.92 });
        } else {
          s.ignition = value === 'acc' ? 'acc' : 'on';
          audio.play('key_turn', pos);
          // relay clunk + dash chime a beat later
          audio.play('ignition', { ...pos, delay: 0.12 });
        }
        break;
      }
      case 'gear': {
        const list = this.gearList();
        let g = value;
        if (value === 'up' || value === 1) g = list[Math.min(list.length - 1, list.indexOf(s.gear) + 1)];
        else if (value === 'down' || value === -1) g = list[Math.max(0, list.indexOf(s.gear) - 1)];
        if (!list.includes(g)) g = this.manual ? 'N' : 'P';
        if (g === s.gear) break;
        s.gear = g;
        emitValue = g;
        audio.play('gear_shift', pos);
        bus.emit('taxi:gear', { gear: g });
        break;
      }
      case 'handbrake': {
        const v = value === 'toggle' ? !s.handbrake : !!value;
        if (v === s.handbrake) break;
        s.handbrake = v;
        emitValue = v;
        audio.play('handbrake', { ...pos, variant: v ? 0 : 1 });
        break;
      }
      case 'headlights': {
        const order = ['off', 'low', 'high'];
        let v = value;
        if (value === 'cycle' || value === 'toggle') v = order[(order.indexOf(s.headlights) + 1) % 3];
        if (value === true) v = 'low';
        if (value === false) v = 'off';
        s.headlights = order.includes(v) ? v : 'off';
        emitValue = s.headlights;
        audio.play('switch_click', pos);
        break;
      }
      case 'cabinLight':
        s.cabinLight = value === 'toggle' ? !s.cabinLight : !!value;
        emitValue = s.cabinLight;
        audio.play('switch_click', { ...pos, volume: 0.7 });
        break;
      case 'indicator': {
        let v = value;
        if (v === 'toggleLeft') v = s.indicator === 'left' ? 'off' : 'left';
        if (v === 'toggleRight') v = s.indicator === 'right' ? 'off' : 'right';
        if (v === 'cycle') v = { off: 'left', left: 'right', right: 'off', hazard: 'off' }[s.indicator];
        s.indicator = ['off', 'left', 'right', 'hazard'].includes(v) ? v : 'off';
        emitValue = s.indicator;
        audio.play('switch_click', { ...pos, volume: 0.6 });
        break;
      }
      case 'wipers': {
        let v = value === 'cycle' ? (s.wipers + 1) % 3 : clamp(Number(value) | 0, 0, 2);
        s.wipers = v;
        emitValue = v;
        audio.play('switch_click', { ...pos, volume: 0.6 });
        break;
      }
      case 'radio': {
        s.radioOn = value === 'toggle' ? !s.radioOn : !!value;
        if (s.radioOn && !s.radioStation) s.radioStation = 1;
        emitValue = s.radioOn;
        audio.play('radio_click', pos);
        if (t.isAudioOwner()) {
          if (s.radioOn && audio.radio && !audio.radio.station) audio.radio.setStation?.(s.radioStation, { sweep: false });
          audio.radio?.setOn?.(s.radioOn && this.hasPower());
          t._radioWas = s.radioOn && this.hasPower();
        }
        break;
      }
      case 'radioTune': {
        // 'next' | 'prev' | station number 0..4 (audio.radio numbering)
        const n = STATIONS.length - 1;
        let v;
        if (value === 'next' || value === undefined) v = (s.radioStation % n) + 1;
        else if (value === 'prev') v = s.radioStation <= 1 ? n : s.radioStation - 1;
        else v = clamp(Number(value) | 0, 0, n);
        if (v === s.radioStation && !opts.force) break;
        s.radioStation = v;
        emitValue = v;
        this.anim.tune += 0.9;
        audio.play('radio_click', { ...pos, volume: 0.5 });
        if (t.isAudioOwner()) audio.radio?.setStation?.(v, { sweep: s.radioOn });
        break;
      }
      case 'meter': {
        const v = value === 'toggle' ? !s.meterOn : !!value;
        if (v && !s.meterOn) {
          this.fare = 35;
          this.fareDist = 0;
          this.fareTime = 0;
        }
        s.meterOn = v;
        s.vacantLamp = !v;
        emitValue = v;
        audio.play('meter_beep', pos);
        break;
      }
      case 'vacantLamp':
        s.vacantLamp = !!value;
        break;
      case 'horn': {
        const v = !!value;
        if (v === s.horn) break;
        s.horn = v;
        if (v) {
          this.anim.hornHandle?.stop?.(0.05);
          this.anim.hornHandle = audio.loop ? audio.loop('horn', { object: t.root }) : audio.play('horn', { object: t.root });
          this.anim.hornT = 0;
        } else {
          const h = this.anim.hornHandle;
          const minLeft = Math.max(0, 0.22 - (this.anim.hornT || 0));
          setTimeout(() => h?.stop?.(0.06), minLeft * 1000);
          this.anim.hornHandle = null;
        }
        break;
      }
      case 'window': {
        // value: {window:'fr', amount} | number (driver window amount) | 'toggle'
        const id = (value && value.window) || opts.window || 'fr';
        let amt = typeof value === 'number' ? value : value?.amount;
        if (value === 'toggle' || amt === undefined) amt = s.windows[id] > 0.5 ? 0 : 1;
        this.windowDrive[id] = { target: clamp(amt, 0, 1), speed: opts.speed ?? 0.45 };
        emitValue = { window: id, amount: amt };
        audio.play('window_crank', { object: t.glass.panes[id]?.mesh || t.root });
        break;
      }
      case 'door':
      case 'trunk': {
        const id = control === 'trunk' ? 'trunk' : (value && value.door) || opts.door || 'fr';
        let amt = control === 'trunk' ? (typeof value === 'number' ? value : value === 'toggle' || value === undefined ? (s.doors.trunk > 0.5 ? 0 : 1) : value ? 1 : 0) : value?.open;
        if (amt === undefined || amt === 'toggle') amt = s.doors[id] > 0.5 ? 0 : 1;
        this.taxi.openDoor(id, amt);
        emitValue = { door: id, open: amt };
        break;
      }
      case 'glovebox':
        s.glovebox = value === 'toggle' ? !s.glovebox : !!value;
        emitValue = s.glovebox;
        audio.play('glovebox', pos);
        break;
      case 'visor':
        s.visor = value === 'toggle' ? !s.visor : !!value;
        emitValue = s.visor;
        audio.play('switch_click', { ...pos, volume: 0.4 });
        break;
      case 'lock':
        s.locked = !!value;
        emitValue = s.locked;
        audio.play('switch_click', pos);
        break;
      default:
        console.warn('[taxi] unknown control', control);
        return;
    }
    bus.emit('taxi:control', { control, value: emitValue });
    this.refreshLabel();
  }

  get manual() {
    return settings.get('transmission') === 'manual';
  }
  gearList() {
    return this.manual ? MANUAL_GEARS : AUTO_GEARS;
  }
  hasPower() {
    const s = this.taxi.state;
    return s.ignition !== 'off' || s.engineOn;
  }

  reachTarget(control, value) {
    const P = this.taxi.parts;
    switch (control) {
      case 'key':
      case 'ignition':
        return P.keySlot;
      case 'gear':
        return P.gear;
      case 'handbrake':
        return P.handbrake;
      case 'headlights':
      case 'indicator':
        return P.stalkLights;
      case 'wipers':
        return P.stalkWipers;
      case 'cabinLight':
        return P.domeLens;
      case 'radio':
        return P.radioKnobVol;
      case 'radioTune':
        return P.radioKnobTune;
      case 'meter':
        return P.meter;
      case 'horn':
        return P.hornAnchor;
      case 'window':
        return P.cranks[(value && value.window) || 'fr'];
      case 'door':
        return P.innerHandles[(value && value.door) || 'fr'];
      case 'glovebox':
        return P.glovebox;
      case 'visor':
        return P.visors.driver;
      default:
        return this.taxi.anchors.steeringWheel;
    }
  }

  // ---------------------------------------------------------------------------
  // interactables
  // ---------------------------------------------------------------------------
  register() {
    if (this.items.length) return;
    const t = this.taxi;
    const P = t.parts;
    const s = t.state;
    const inCar = () => t.isCameraInside();
    const L = (k) => ({ labelTH: LABELS[k][0], labelEN: LABELS[k][1] });
    const add = (spec) => {
      const it = interact.register({ reach: 1.1, icon: 'hand', ...spec });
      this.items.push(it);
      return it;
    };
    // invisible INTERACT-layer pick boxes for small or shared parts
    this._proxies = this._proxies || [];
    const proxy = (parent, size, pos) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial());
      m.layers.set(LAYERS.INTERACT);
      m.position.set(...pos);
      parent.add(m);
      this._proxies.push(m);
      return m;
    };
    this.keyItem = add({
      id: 'taxi.key', object: P.keySlot, icon: 'key', ...L('key_insert'), enabled: inCar,
      onUse: () => {
        if (!s.keyInserted) this.set('key', true, { source: 'interact' });
        else if (s.ignition === 'off' || s.ignition === 'acc') this.set('ignition', 'on', { source: 'interact' });
        else if (!s.engineOn) this.set('ignition', 'start', { source: 'interact' });
        else this.set('ignition', 'off', { source: 'interact' });
      },
    });
    this.hbItem = add({ id: 'taxi.handbrake', object: P.handbrake, ...L('handbrake_off'), enabled: inCar, onUse: () => this.set('handbrake', 'toggle', { source: 'interact' }) });
    add({
      id: 'taxi.gear', object: P.gear, ...L('gear'), enabled: inCar,
      onUse: () => {
        const drive = this.manual ? '1' : 'D';
        const idle = this.manual ? 'N' : 'P';
        this.set('gear', s.gear === drive ? idle : drive, { source: 'interact' });
      },
    });
    // light stalk: twist the knob for the headlights, flick the arm for the indicator
    const knob = proxy(P.stalkLights, [0.05, 0.036, 0.036], [0.145, -0.011, 0.022]);
    const arm = proxy(P.stalkLights, [0.1, 0.03, 0.03], [0.065, -0.005, 0.01]);
    add({ id: 'taxi.headlights', object: knob, ...L('headlights'), enabled: inCar, onUse: () => this.set('headlights', 'cycle', { source: 'interact' }) });
    add({ id: 'taxi.indicator', object: arm, ...L('indicator'), enabled: inCar, onUse: () => this.set('indicator', 'cycle', { source: 'interact' }) });
    add({ id: 'taxi.wipers', object: P.stalkWipers, ...L('wipers'), enabled: inCar, onUse: () => this.set('wipers', 'cycle', { source: 'interact' }) });
    add({ id: 'taxi.cabinLight', object: P.domeLens, ...L('cabinLight'), reach: 1.3, enabled: inCar, onUse: () => this.set('cabinLight', 'toggle', { source: 'interact' }) });
    add({ id: 'taxi.radio', object: P.radioKnobVol, ...L('radio'), enabled: inCar, onUse: () => this.set('radio', 'toggle', { source: 'interact' }) });
    add({ id: 'taxi.radioTune', object: P.radioKnobTune, ...L('radioTune'), enabled: inCar, onUse: () => this.set('radioTune', 'next', { source: 'interact' }) });
    add({ id: 'taxi.meter', object: P.meter, ...L('meter'), enabled: inCar, onUse: () => this.set('meter', 'toggle', { source: 'interact' }) });
    add({
      id: 'taxi.horn', object: P.steering.spin, ...L('horn'), enabled: inCar,
      onUse: () => this.set('horn', true, { source: 'interact', reach: false }),
      onHold: () => {},
      onRelease: () => this.set('horn', false, { source: 'interact', reach: false }),
    });
    add({ id: 'taxi.glovebox', object: P.glovebox, ...L('glovebox'), reach: 1.4, enabled: inCar, onUse: () => this.set('glovebox', 'toggle', { source: 'interact' }) });
    add({ id: 'taxi.sunVisor', object: P.visors.driver, ...L('visor'), enabled: inCar, onUse: () => this.set('visor', 'toggle', { source: 'interact' }) });
    // the faded little blue elephant sticker on the dash (memory m_sticker listens to interact:use 'taxi.sticker')
    if (P.stickerAnchor) {
      const st = proxy(P.stickerAnchor, [0.13, 0.13, 0.03], [0, 0, 0.01]);
      add({ id: 'taxi.sticker', object: st, icon: 'eye', ...L('sticker'), reach: 1.45, enabled: inCar, onUse: () => this.inspect('sticker', P.stickerAnchor) });
    }
    // window cranks (hold to wind; tap = full travel)
    for (const id of ['fr', 'fl', 'rr', 'rl']) {
      add({
        id: 'taxi.window.' + id, object: P.cranks[id], ...L('window'), reach: 1.35, enabled: inCar,
        onUse: () => {
          const target = s.windows[id] > 0.5 ? 0 : 1;
          this._crankHold = { id, t: 0, target };
          this.set('window', { window: id, amount: target }, { source: 'interact', reach: false });
        },
        onHold: (dt) => {
          if (this._crankHold) this._crankHold.t += dt;
        },
        onRelease: () => {
          const h = this._crankHold;
          if (h && h.t > 0.35) this.windowDrive[h.id] = { target: s.windows[h.id], speed: 0.45 };
          this._crankHold = null;
        },
      });
    }
    // doors: inner handles and outer handle proxies
    for (const id of ['fr', 'fl', 'rr', 'rl']) {
      const it = add({ id: 'taxi.door.' + id, object: P.innerHandles[id], ...L('door_open'), reach: 1.4, enabled: inCar, onUse: () => this.set('door', { door: id, open: s.doors[id] > 0.5 ? 0 : 1 }, { source: 'interact' }) });
      it._door = id;
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.22), new THREE.MeshBasicMaterial());
      proxy.layers.set(LAYERS.INTERACT);
      proxy.position.copy(t.ext.doors[id].outerHandle);
      t.ext.doors[id].inner.add(proxy);
      (this._doorProxies = this._doorProxies || []).push(proxy);
      const it2 = add({ id: 'taxi.door.' + id + '.out', object: proxy, ...L('door_open'), reach: 1.6, enabled: () => !inCar(), onUse: () => this.set('door', { door: id, open: s.doors[id] > 0.5 ? 0 : 1 }, { source: 'interact' }) });
      it2._door = id;
    }
    const trunkProxy = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.2), new THREE.MeshBasicMaterial());
    trunkProxy.layers.set(LAYERS.INTERACT);
    trunkProxy.position.set(0, 0.95, 2.1);
    t.bodyInner.add(trunkProxy);
    (this._doorProxies = this._doorProxies || []).push(trunkProxy);
    add({ id: 'taxi.trunk', object: trunkProxy, ...L('trunk'), reach: 1.8, enabled: () => !inCar(), onUse: () => this.set('trunk', 'toggle', { source: 'interact' }) });
    // glass: hold to wipe condensation where you look
    for (const id of t.glass.ids) {
      const pane = t.glass.panes[id];
      add({
        id: 'taxi.glass.' + id, object: pane.mesh, ...L('wipe'), reach: 1.2,
        enabled: () => inCar() && this.paneFoggy(pane),
        onUse: (ctx) => t.wipeGlassAt(ctx.point, 0.06),
        onHold: (dt) => {
          const hit = t.rayGlass();
          if (hit) t.wipeGlassAt(hit.point, 0.065, Math.min(1, dt * 14));
        },
      });
    }
  }

  /**
   * Look closely at a detail (lean in: a short camera focus pull, the hand reaches to touch it).
   * Emits 'taxi:inspect' {what}. Gameplay listens to interact:use for memories.
   */
  async inspect(what, object) {
    const t = this.taxi;
    bus.emit('taxi:inspect', { what });
    const fp = this._inspectPos || (this._inspectPos = new THREE.Vector3());
    if (!cameraRig.focusTarget || cameraRig.focusTarget === fp) {
      // focus is a world point: animate() keeps it on the object while the car moves
      this._inspectObj = object;
      object.getWorldPosition(fp);
      cameraRig.setFocus?.(fp, 0.4);
      clearTimeout(this._inspectT);
      this._inspectT = setTimeout(() => {
        this._inspectObj = null;
        if (cameraRig.focusTarget === fp) cameraRig.setFocus(null);
      }, 1800);
    }
    if (t.onReach) {
      try {
        await t.onReach(object, { control: 'inspect', value: what, source: 'interact' });
      } catch (e) {
        /* cosmetic */
      }
    }
    audio.play('paper_rustle', { object, volume: 0.18, rate: 1.4 });
  }

  paneFoggy(p) {
    if (p.fogTarget > 0.18) return true;
    // sample the mask coarsely
    const f = p.fogF;
    let m = 0;
    for (let i = 0; i < f.length; i += 37) m = Math.max(m, f[i]);
    return m > 0.25;
  }

  unregister() {
    for (const it of this.items) interact.unregister(it);
    this.items = [];
    for (const p of this._proxies || []) {
      p.removeFromParent();
      p.geometry.dispose();
      p.material.dispose();
    }
    this._proxies = [];
    for (const p of this._doorProxies || []) {
      p.removeFromParent();
      p.geometry.dispose();
      p.material.dispose();
    }
    this._doorProxies = [];
  }

  refreshLabel() {
    const s = this.taxi.state;
    if (this.keyItem) {
      const k = !s.keyInserted ? 'key_insert' : s.ignition === 'off' || s.ignition === 'acc' ? 'key_on' : !s.engineOn ? 'key_start' : 'key_off';
      this.keyItem.labelTH = LABELS[k][0];
      this.keyItem.labelEN = LABELS[k][1];
    }
    if (this.hbItem) {
      const k = s.handbrake ? 'handbrake_off' : 'handbrake_on';
      this.hbItem.labelTH = LABELS[k][0];
      this.hbItem.labelEN = LABELS[k][1];
    }
    for (const it of this.items) {
      if (it._door) {
        const k = s.doors[it._door] > 0.5 ? 'door_close' : 'door_open';
        it.labelTH = LABELS[k][0];
        it.labelEN = LABELS[k][1];
      }
    }
    const cur = interact.current;
    if (cur && this.items.includes(cur)) bus.emit('interact:target', { id: cur.id, labelEN: cur.labelEN, labelTH: cur.labelTH, icon: cur.icon });
  }

  // ---------------------------------------------------------------------------
  // hotkeys
  // ---------------------------------------------------------------------------
  hotkeys(dt) {
    const o = { source: 'hotkey' };
    if (input.pressed('headlights')) this.set('headlights', 'cycle', o);
    if (input.pressed('cabinLight')) this.set('cabinLight', 'toggle', o);
    if (input.pressed('wipers')) this.set('wipers', 'cycle', o);
    if (input.pressed('radio')) this.set('radio', 'toggle', o);
    if (input.pressed('radioTune')) this.set('radioTune', 'next', o);
    if (input.pressed('meter')) this.set('meter', 'toggle', o);
    if (input.pressed('indicatorLeft')) this.set('indicator', 'toggleLeft', o);
    if (input.pressed('indicatorRight')) this.set('indicator', 'toggleRight', o);
    if (input.pressed('horn')) this.set('horn', true, { source: 'hotkey', reach: false });
    if (input.released('horn')) this.set('horn', false, { source: 'hotkey', reach: false });
    if (input.pressed('gearUp')) this.set('gear', 'up', { source: 'hotkey', reach: false });
    if (input.pressed('gearDown')) this.set('gear', 'down', { source: 'hotkey', reach: false });
    if (input.pressed('handbrake')) this.set('handbrake', 'toggle', o);
    // driver window: hold T to wind (direction flips each press)
    if (input.pressed('window')) {
      const s = this.taxi.state;
      this._winDir = s.windows.fr > 0.5 ? -1 : 1;
      this.set('window', { window: 'fr', amount: this._winDir > 0 ? 1 : 0 }, { source: 'hotkey', speed: 0.45 });
      this._winHeld = 0;
    }
    if (input.down('window')) this._winHeld = (this._winHeld || 0) + dt;
    if (input.released('window') && this._winHeld > 0.35) this.windowDrive.fr = { target: this.taxi.state.windows.fr, speed: 0.45 };
  }

  // ---------------------------------------------------------------------------
  // per-frame animation
  // ---------------------------------------------------------------------------
  animate(dt) {
    const t = this.taxi;
    const s = t.state;
    const P = t.parts;
    const ph = t.physicsSim;
    const A = this.anim;
    if (this._inspectObj) this._inspectObj.getWorldPosition(this._inspectPos);
    if (s.horn) A.hornT = (A.hornT || 0) + dt;
    // key
    P.key.visible = s.keyInserted;
    const keyRot = { off: 0, acc: 0.45, on: 0.9, start: 1.35 }[s.ignition] ?? 0;
    A.key = damp(A.key, keyRot, 18, dt);
    P.key.rotation.z = -A.key;
    // steering wheel
    P.steering.spin.rotation.z = -ph.wheelAngle * 8.5;
    // pedals
    const inp = ph.input;
    P.pedals.throttle.rotation.x = damp(P.pedals.throttle.rotation.x, -inp.throttle * 0.32, 20, dt);
    P.pedals.brake.rotation.x = damp(P.pedals.brake.rotation.x, -inp.brake * 0.3, 20, dt);
    P.pedals.clutch.visible = this.manual;
    P.pedals.clutch.rotation.x = damp(P.pedals.clutch.rotation.x, -(ph.shiftTimer > 0 ? 0.35 : 0), 16, dt);
    // gear lever pose
    const gp = this.gearPose(s.gear);
    A.gear.x = damp(A.gear.x, gp[0], 16, dt);
    A.gear.y = damp(A.gear.y, gp[1], 16, dt);
    P.gear.rotation.set(A.gear.y, 0, A.gear.x);
    P.gearGate.visible = !this.manual;
    // handbrake
    A.handbrake = damp(A.handbrake, s.handbrake ? 1 : 0, 14, dt);
    P.handbrake.rotation.x = A.handbrake * 0.42;
    // glovebox, visors
    A.glove = damp(A.glove, s.glovebox ? 1 : 0, 7, dt);
    P.glovebox.rotation.x = A.glove * 1.25;
    A.visorD = damp(A.visorD, s.visor ? 1 : 0, 8, dt);
    P.visors.driver.rotation.x = lerp(1.45, 0.12, A.visorD);
    // stalks
    const lightsTwist = { off: 0, low: 0.5, high: 0.5 }[s.headlights] ?? 0;
    A.stalkL = damp(A.stalkL, lightsTwist, 14, dt);
    const tilt = (s.indicator === 'left' ? -0.18 : s.indicator === 'right' ? 0.18 : 0) + (s.headlights === 'high' ? 0.08 : 0);
    A.stalkLtilt = damp(A.stalkLtilt, tilt, 16, dt);
    P.stalkLights.rotation.set(A.stalkL, 0, A.stalkLtilt);
    A.stalkW = damp(A.stalkW, s.wipers * 0.14, 14, dt);
    P.stalkWipers.rotation.z = -A.stalkW;
    // radio knobs
    A.tune = damp(A.tune, 0, 3, dt);
    P.radioKnobTune.rotation.z += A.tune * dt * 6;
    P.radioKnobVol.rotation.z = damp(P.radioKnobVol.rotation.z, s.radioOn ? -1.6 : 0, 8, dt);
    // gauges
    const kmh = Math.abs(ph.v) * 3.6;
    const power = this.hasPower() ? 1 : 0;
    A.speedN = damp(A.speedN, kmh * power, 6, dt);
    A.tachoN = damp(A.tachoN, (s.engineOn ? ph.rpm : 0) / 1000, 10, dt);
    A.temp = damp(A.temp, s.engineOn ? 0.52 : 0, s.engineOn ? 0.05 : 0.02, dt);
    const fuelT = power ? 0.42 + Math.sin(t.time * 0.7) * 0.004 * Math.min(1, kmh / 30) : 0;
    A.fuel = damp(A.fuel, fuelT, 1.5, dt);
    this.setNeedle('speed', A.speedN / 180);
    this.setNeedle('tacho', A.tachoN / 8);
    this.setNeedle('fuel', A.fuel);
    this.setNeedle('temp', A.temp);
    // cranks / windows
    for (const id of ['fl', 'fr', 'rl', 'rr']) {
      const d = this.windowDrive[id];
      if (d) {
        const cur = s.windows[id];
        const step = Math.sign(d.target - cur) * d.speed * dt;
        const next = Math.abs(d.target - cur) <= Math.abs(step) ? d.target : cur + step;
        if (next !== cur) {
          s.windows[id] = next;
          A.crank[id] += (next - cur) * 22 * (id[1] === 'r' ? 1 : -1);
          if (Math.floor(Math.abs(A.crank[id]) / 3.14) !== Math.floor(Math.abs(A.crank[id] - (next - cur) * 22) / 3.14)) audio.play('window_crank', { object: P.cranks[id], volume: 0.5 });
        } else delete this.windowDrive[id];
      }
      P.cranks[id].rotation.x = A.crank[id];
      t.glass.setWindow(id, s.windows[id]);
      // lock pins
      P.lockPins[id].position.y = damp(P.lockPins[id].position.y, (P.lockPins[id].userData.y0 ??= P.lockPins[id].position.y) - (s.locked ? 0.03 : 0), 20, dt);
      // inner handle pull while the door opens
      const pull = this.doorTweens[id] ? 1 : 0;
      A.handle[id] = damp(A.handle[id], pull, 18, dt);
      P.innerHandles[id].rotation.y = A.handle[id] * 0.5 * (id[1] === 'r' ? 1 : -1);
    }
    // doors + trunk hinges
    for (const id of ['fl', 'fr', 'rl', 'rr']) {
      const d = t.ext.doors[id];
      const max = id[0] === 'f' ? 1.12 : 1.02;
      d.group.rotation.y = easeInOut(s.doors[id]) * max * d.sx;
    }
    t.ext.trunk.group.rotation.x = -easeInOut(s.doors.trunk) * 1.15;
    // wipers
    this.animateWipers(dt);
    // displays
    this.drawMeter(dt);
    this.drawRadio();
    this.drawWarnings();
  }

  setNeedle(kind, f) {
    const n = this.taxi.parts.needles[kind];
    if (!n) return;
    f = clamp(f, 0, 1.05);
    // canvas sweep -> rotation about z (canvas y down, three y up)
    const big = n.big;
    const a0 = big ? Math.PI * 0.75 : Math.PI * 0.8, a1 = big ? Math.PI * 2.25 : Math.PI * 1.2;
    const a = a0 + f * (a1 - a0);
    // canvas angle a measured clockwise from +x with y down; needle geometry points +y (three)
    n.pivot.rotation.z = -a - Math.PI / 2;
  }

  gearPose(g) {
    // returns [sideTilt (rot z), foreAft (rot x)]
    if (this.manual) {
      const map = { R: [0.22, -0.28], N: [0, 0], 1: [0.14, -0.28], 2: [0.14, 0.28], 3: [0, -0.28], 4: [0, 0.28], 5: [-0.14, -0.28] };
      return map[g] || [0, 0];
    }
    const idx = AUTO_GEARS.indexOf(g);
    return [0, -0.3 + Math.max(0, idx) * 0.12];
  }

  animateWipers(dt) {
    const t = this.taxi;
    const s = t.state;
    const A = this.anim;
    const power = t.state.engineOn || t.state.ignition === 'on';
    const mode = power ? s.wipers : 0;
    const max = 1.72;
    if (mode > 0 || A.wiperActive) {
      const period = mode === 2 ? 1.05 : 1.35;
      const pause = mode === 1 ? 1.4 : 0;
      const prev = A.wiperPhase;
      A.wiperPhase += dt;
      const cycle = period + pause;
      if (A.wiperPhase >= cycle) {
        A.wiperPhase -= cycle;
        if (mode === 0) {
          A.wiperActive = false;
          A.wiperPhase = 0;
        }
      }
      if (prev === 0 || A.wiperPhase < prev) if (mode > 0) audio.play('wiper', { object: t.root, volume: 0.8 });
      if (mode > 0) A.wiperActive = true;
      const p = Math.min(1, A.wiperPhase / period);
      A.wiperAngle = A.wiperPhase < period ? max * 0.5 * (1 - Math.cos(p * Math.PI * 2)) : 0;
      if (mode === 0 && A.wiperPhase >= period) A.wiperActive = false;
    } else {
      A.wiperAngle = damp(A.wiperAngle, 0, 6, dt);
      A.wiperPhase = 0;
    }
    t.ext.wipers.forEach((w, i) => {
      w.pivot.rotation.z = A.wiperAngle;
      t.glass.setWiperAngle(i, A.wiperAngle);
    });
  }

  // ---------------------------------------------------------------------------
  // displays
  // ---------------------------------------------------------------------------
  /** Glitch modes for ghost passengers: {mode:'glitch'|'backward'|'date'|'text', text, date} or null. */
  setMeterGlitch(g) {
    this.meterGlitch = g;
  }

  drawMeter(dt) {
    const t = this.taxi;
    const s = t.state;
    const im = t.parts.im;
    const kmh = Math.abs(t.physicsSim.v) * 3.6;
    if (s.meterOn) {
      const dist = (Math.abs(t.physicsSim.v) * dt) / 1000;
      this.fareDist += dist;
      this.fareTime += dt;
      const g = this.meterGlitch;
      if (g && g.mode === 'backward') this.fare = Math.max(0, this.fare - dt * 0.8);
      else {
        // 35 baht flag-fall incl. first km, then 2 baht per 400 m; waiting charge when crawling
        const target = 35 + Math.max(0, Math.floor((this.fareDist - 1) / 0.4)) * 2 + Math.floor(this.fareWait || 0) * 2;
        if (kmh < 6) this.fareWait = (this.fareWait || 0) + dt / 60;
        this.fare = Math.max(this.fare, target);
      }
    }
    const power = this.hasPower();
    const g = this.meterGlitch;
    const hour = GLOBAL_UNIFORMS.uHour.value;
    const hh = Math.floor(hour) % 24, mm = Math.floor((hour % 1) * 60);
    const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const glitchTick = g ? Math.floor(t.time * 12) : 0;
    const key = `${power}|${s.meterOn}|${this.fare.toFixed(0)}|${clock}|${g ? g.mode + glitchTick : ''}|${s.vacantLamp}`;
    im.meterCanvas.draw(key, (ctx, W, H) => {
      ctx.fillStyle = '#0a0202';
      ctx.fillRect(0, 0, W, H);
      if (!power) return;
      const red = '#ff3a1c';
      // ghost segments
      ctx.font = `700 64px ${FONTS.lcd}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,60,30,0.07)';
      ctx.fillText('888.88', W - 14, H * 0.52);
      ctx.fillStyle = red;
      if (g && (g.mode === 'glitch' || g.mode === 'date' || g.mode === 'text')) {
        const txt = g.mode === 'date' ? g.date || '12-08-2539' : g.mode === 'text' ? g.text || 'ว่าง' : Math.random().toString().slice(2, 8);
        ctx.font = `700 ${g.mode === 'date' ? 40 : 52}px ${FONTS.lcd}`;
        ctx.textAlign = 'center';
        ctx.fillText(txt, W / 2 + (Math.random() - 0.5) * 6, H * 0.52);
        return;
      }
      if (s.meterOn) {
        ctx.fillText(this.fare.toFixed(2), W - 14, H * 0.52);
        ctx.font = `600 18px ${FONTS.lcd}`;
        ctx.textAlign = 'left';
        ctx.fillText('฿', 10, H * 0.25);
        ctx.fillText('HIRED', 10, H * 0.78);
      } else {
        ctx.font = `700 52px ${FONTS.sign}`;
        ctx.textAlign = 'left';
        ctx.fillText('ว่าง', 12, H * 0.56);
        ctx.font = `700 40px ${FONTS.lcd}`;
        ctx.textAlign = 'right';
        ctx.fillText(clock, W - 12, H * 0.54);
      }
    });
  }

  drawRadio() {
    const t = this.taxi;
    const s = t.state;
    const im = t.parts.im;
    const on = s.radioOn && this.hasPower();
    const st = STATIONS[clamp(s.radioStation | 0, 0, STATIONS.length - 1)];
    const key = `${on}|${s.radioStation}|${this.radioSong || ''}`;
    im.radioCanvas.draw(key, (ctx, W, H) => {
      ctx.fillStyle = '#020403';
      ctx.fillRect(0, 0, W, H);
      if (!on) return;
      ctx.fillStyle = '#7dffa8';
      ctx.font = `700 30px ${FONTS.lcd}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(st.freq, 8, H / 2 + 1);
      ctx.font = `600 18px ${FONTS.sign}`;
      ctx.textAlign = 'right';
      ctx.fillText(st.name, W - 8, H / 2 + 2);
    });
  }

  drawWarnings() {
    const t = this.taxi;
    const s = t.state;
    const im = t.parts.im;
    const power = this.hasPower();
    const blink = t.lights?.blinkOn;
    const key = `${power}|${s.engineOn}|${s.handbrake}|${s.indicator}|${blink}|${s.headlights}`;
    im.warnCanvas.draw(key, (ctx, W, H) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      if (!power) return;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = `700 16px ${FONTS.lcd}`;
      const lamp = (x, txt, col, on) => {
        if (!on) return;
        ctx.fillStyle = col;
        ctx.fillText(txt, x, H / 2);
      };
      lamp(18, '◀', '#4dff7a', blink && (s.indicator === 'left' || s.indicator === 'hazard'));
      lamp(W - 18, '▶', '#4dff7a', blink && (s.indicator === 'right' || s.indicator === 'hazard'));
      lamp(64, '(P)', '#ff3b2a', s.handbrake);
      lamp(108, '⚡', '#ff3b2a', !s.engineOn);
      lamp(146, 'OIL', '#ff5a2a', !s.engineOn);
      lamp(192, '≡D', '#3a7bff', s.headlights === 'high');
    });
  }

  dispose() {
    clearTimeout(this._inspectT);
    this.unregister();
    this._busOff?.();
    this.anim.hornHandle?.stop?.(0.05);
  }
}
