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
import { drawSegments, segWidth } from './VehicleTextures.js';
const drawSegmentsWidth = (txt, h) => String(txt).split('').reduce((a, c) => a + (c === '.' || c === ':' ? segWidth(h) * 0.32 : segWidth(h)), 0);

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
const ENGINE_CRANK = [0.82, 1.05];

/**
 * Rotate a control part. Procedural parts use Euler components; GLB pivots carry
 * userData.axis (parent space) + sign, so the same control code drives both models.
 */
export function turn(obj, comp, v) {
  if (!obj) return;
  const u = obj.userData;
  if (u.axis) obj.quaternion.setFromAxisAngle(u.axis, v * (u.sign ?? 1));
  else obj.rotation[comp] = v;
} // seconds of cranking per engine_start variant (audio/Synth/sfxCar.js)

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
      // the dashboard switch is authoritative for on/off (audio may echo 'off' before it is
      // initialised); follow the station / programme the audio radio actually plays
      if (typeof d.station === 'number' && d.station > 0) taxi.state.radioStation = d.station;
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
      if (!t.ext.doors[id]) continue;
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
    trunkProxy.position.copy(t.anchors.trunk.position);
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
    A.pThr = damp(A.pThr || 0, -inp.throttle * 0.32, 20, dt);
    A.pBrk = damp(A.pBrk || 0, -inp.brake * 0.3, 20, dt);
    A.pClu = damp(A.pClu || 0, -(ph.shiftTimer > 0 ? 0.35 : 0), 16, dt);
    turn(P.pedals.throttle, 'x', A.pThr);
    turn(P.pedals.brake, 'x', A.pBrk);
    P.pedals.clutch.visible = this.manual || !!t.ext.glb;
    turn(P.pedals.clutch, 'x', A.pClu);
    // gear lever pose
    const gp = this.gearPose(s.gear);
    A.gear.x = damp(A.gear.x, gp[0], 16, dt);
    A.gear.y = damp(A.gear.y, gp[1], 16, dt);
    P.gear.rotation.set(A.gear.y, 0, A.gear.x);
    P.gearGate.visible = !this.manual;
    // handbrake
    A.handbrake = damp(A.handbrake, s.handbrake ? 1 : 0, 14, dt);
    turn(P.handbrake, 'x', A.handbrake * 0.42);
    // glovebox, visors
    A.glove = damp(A.glove, s.glovebox ? 1 : 0, 7, dt);
    turn(P.glovebox, 'x', A.glove * 1.25);
    A.visorD = damp(A.visorD, s.visor ? 1 : 0, 8, dt);
    if (P.visors.driver.userData.relative) turn(P.visors.driver, 'x', A.visorD * 1.35);
    else P.visors.driver.rotation.x = lerp(1.45, 0.12, A.visorD);
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
    A.tuneRot = (A.tuneRot || 0) + A.tune * dt * 6;
    A.volRot = damp(A.volRot || 0, s.radioOn ? -1.6 : 0, 8, dt);
    turn(P.radioKnobTune, 'z', A.tuneRot);
    turn(P.radioKnobVol, 'z', A.volRot);
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
      turn(P.cranks[id], 'x', A.crank[id]);
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
      if (!d) continue;
      const max = id[0] === 'f' ? 1.12 : 1.02;
      d.group.rotation.y = easeInOut(s.doors[id]) * max * d.sx;
    }
    if (t.ext.trunk) turn(t.ext.trunk.group, 'x', -easeInOut(s.doors.trunk) * 1.15);
    if (t.ext.hood) turn(t.ext.hood.group, 'x', easeInOut(s.doors.hood || 0) * 1.0);
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
    if (n.axis) {
      // GLB needle: rest pose = zero; clockwise as seen by the driver
      n.pivot.quaternion.setFromAxisAngle(n.axis, -f * n.sweep);
      return;
    }
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
    t.ext.wipers.forEach((w) => turn(w.pivot, 'z', A.wiperAngle));
    const nw = t.glass.wipers.length;
    for (let i = 0; i < nw; i++) t.glass.setWiperAngle(i, A.wiperAngle);
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
      const red = '#ff3a1c', ghost = 'rgba(255,60,30,0.07)';
      const segH = H * 0.6, segY = H * 0.2;
      // LED glow under the lit segments
      ctx.shadowColor = 'rgba(255,40,10,0.55)';
      ctx.shadowBlur = 6;
      if (g && (g.mode === 'glitch' || g.mode === 'date')) {
        const txt = g.mode === 'date' ? (g.date || '12-08-2539').replace(/[^0-9-]/g, '-') : String(Math.floor(Math.random() * 1e6)).padStart(6, '8');
        drawSegments(ctx, '8'.repeat(txt.length).replace(/8/g, ' '), W - 10, segY, segH, { color: red, ghost, align: 'right' });
        const hh = g.mode === 'date' ? H * 0.46 : segH;
        drawSegments(ctx, txt, W / 2 + (drawSegmentsWidth(txt, hh) / 2) + (Math.random() - 0.5) * 4, (H - hh) / 2, hh, { color: red, ghost, align: 'right' });
        return;
      }
      if (g && g.mode === 'text') {
        ctx.fillStyle = red;
        ctx.font = `700 ${H * 0.5}px ${FONTS.sign}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(g.text || 'ว่าง', W / 2 + (Math.random() - 0.5) * 4, H * 0.55);
        return;
      }
      if (s.meterOn) {
        drawSegments(ctx, this.fare.toFixed(2).padStart(6, ' '), W - 10, segY, segH, { color: red, ghost, align: 'right' });
        ctx.shadowBlur = 0;
        ctx.fillStyle = red;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${H * 0.26}px ${FONTS.sign}`;
        ctx.fillText('฿', 8, H * 0.3);
        ctx.font = `700 ${H * 0.2}px ${FONTS.sign}`;
        ctx.fillText('ไป', 8, H * 0.72);
      } else {
        ctx.fillStyle = red;
        ctx.font = `700 ${H * 0.52}px ${FONTS.sign}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('ว่าง', 10, H * 0.56);
        drawSegments(ctx, clock, W - 10, H * 0.26, H * 0.48, { color: red, ghost, align: 'right' });
      }
      ctx.shadowBlur = 0;
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
      const vfd = '#7dffa8', ghost = 'rgba(125,255,168,0.06)';
      ctx.shadowColor = 'rgba(90,255,150,0.5)';
      ctx.shadowBlur = 5;
      const [band, num] = st.freq.split(' ');
      ctx.fillStyle = vfd;
      ctx.font = `700 ${H * 0.36}px ${FONTS.lcd}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(band || '', 6, H * 0.52);
      drawSegments(ctx, (num || '').padStart(6, ' '), W * 0.58, H * 0.16, H * 0.68, { color: vfd, ghost, align: 'right', skew: 0.08 });
      ctx.shadowBlur = 0;
      ctx.font = `700 ${H * 0.4}px ${FONTS.sign}`;
      ctx.textAlign = 'right';
      ctx.fillText(st.th || st.name, W - 6, H * 0.55);
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
      const cy = H / 2, r = H * 0.32;
      const green = '#4dff7a', red = '#ff3b2a', blue = '#3a7bff', amber = '#ff9a2a';
      ctx.lineWidth = 2;
      // indicator arrows
      const arrow = (x, dir, col, lit) => {
        if (!lit) return;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x + dir * r * 1.1, cy);
        ctx.lineTo(x - dir * r * 0.1, cy - r);
        ctx.lineTo(x - dir * r * 0.1, cy - r * 0.4);
        ctx.lineTo(x - dir * r * 1.0, cy - r * 0.4);
        ctx.lineTo(x - dir * r * 1.0, cy + r * 0.4);
        ctx.lineTo(x - dir * r * 0.1, cy + r * 0.4);
        ctx.lineTo(x - dir * r * 0.1, cy + r);
        ctx.closePath();
        ctx.fill();
      };
      arrow(18, -1, green, blink && (s.indicator === 'left' || s.indicator === 'hazard'));
      arrow(W - 18, 1, green, blink && (s.indicator === 'right' || s.indicator === 'hazard'));
      // handbrake: (P) in a circle with brackets
      if (s.handbrake) {
        ctx.strokeStyle = red;
        ctx.fillStyle = red;
        ctx.beginPath();
        ctx.arc(64, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(64, cy, r * 1.35, sx > 0 ? -0.7 : Math.PI - 0.7, sx > 0 ? 0.7 : Math.PI + 0.7);
          ctx.stroke();
        }
        ctx.font = `700 ${H * 0.5}px ${FONTS.lcd}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('P', 64, cy + 1);
      }
      if (!s.engineOn) {
        // battery
        ctx.strokeStyle = red;
        ctx.strokeRect(100, cy - r * 0.7, r * 2.2, r * 1.5);
        ctx.fillStyle = red;
        ctx.fillRect(100 + r * 0.3, cy - r * 0.95, r * 0.4, r * 0.25);
        ctx.fillRect(100 + r * 1.5, cy - r * 0.95, r * 0.4, r * 0.25);
        // oil can with a drop
        ctx.fillStyle = amber;
        ctx.beginPath();
        ctx.moveTo(140, cy + r * 0.6);
        ctx.lineTo(140, cy - r * 0.2);
        ctx.lineTo(140 + r * 1.4, cy - r * 0.2);
        ctx.lineTo(140 + r * 2.4, cy - r * 0.7);
        ctx.lineTo(140 + r * 1.8, cy + r * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(140 + r * 2.6, cy + r * 0.3, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (s.headlights === 'high') {
        // high beam: the 'D' lamp with straight rays
        ctx.strokeStyle = blue;
        ctx.fillStyle = blue;
        ctx.beginPath();
        ctx.arc(196, cy, r * 0.85, -Math.PI / 2, Math.PI / 2);
        ctx.closePath();
        ctx.fill();
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath();
          ctx.moveTo(196 - r * 0.3, cy + k * r * 0.35);
          ctx.lineTo(196 - r * 1.3, cy + k * r * 0.35);
          ctx.stroke();
        }
      }
    });
  }

  dispose() {
    clearTimeout(this._inspectT);
    this.unregister();
    this._busOff?.();
    this.anim.hornHandle?.stop?.(0.05);
  }
}
