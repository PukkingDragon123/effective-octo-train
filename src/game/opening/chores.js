// Ah Kong's chores and rituals "for safety" at the KM 9 garage (data/chores.js has the lines):
//   1 shrine    the spirit house out front: take three sticks, light them at its candle, wai, plant
//               them. Skip a step and the smoke leans the wrong way (into the garage, at you).
//   2 offering  a glass of red soda and a bowl of rice, from the workbench to the gate (later the
//               soda is lower, when nobody was looking)
//   3 cloth     the three-colour cloth strips, tied on the taxi's rear-view mirror
//   4 coins     count the fare tin: there is always one coin more than you counted (an old holed one)
// Props are small, built from the props kit and real profiles (lathes, traced shapes, swept strips).
//
//   new Chores(stage, { only?: [ids] })
//     .start() (chores become doable) · .done(id) · .requiredDone() · .missing() · .finishRest()
//     .update runs on the stage
import * as THREE from 'three';
import { g } from '../context.js';
import { interact } from '../../core/Interact.js';
import { LAYERS } from '../../core/layers.js';
import { colliders } from '../../core/Colliders.js';
import { clamp, smoothstep, easeInOut, makeRng, noise } from '../../core/math.js';
import { paintedMaterial } from '../../render/index.js';
import { createSpiritHouse } from '../../props/shrines.js';
import { Kit, lathe, tube } from '../../props/lib/kit.js';
import { mat } from '../../props/lib/materials.js';
import { bowl, can } from '../../props/lib/small.js';
import { FONTS } from '../../ui/fonts.js';
import { lm, sfx, ground, runLines, resolve, Stage } from './common.js';
import { bus } from '../../core/Events.js';
import * as D from '../data/chores.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const UP = V(0, 1, 0);
const say = (lines) => runLines(resolve(lines || []));

/** Props that stay for the night (the tutorial and the shift start at the same garage). */
export const nightStage = new Stage();
bus.on('game:state', ({ state } = {}) => {
  if (state === 'menu' || state === 'intro') nightStage.clear();
});

// ------------------------------------------------------------------------------ small props
function incenseSticks(n = 3, seed = 3) {
  const k = new Kit(seed, { grime: 0, vary: 0.15 });
  const rng = makeRng(seed);
  const tips = [];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.006, lean = (i - (n - 1) / 2) * 0.04 + (rng() - 0.5) * 0.02;
    const top = V(x + lean * 0.3, 0.3, (rng() - 0.5) * 0.004);
    k.add(mat('wood'), tube([V(x, 0, 0), V(x + lean * 0.12, 0.11, 0), top], 0.0015, 4), { color: 0xa81c24, w: false });
    k.add(mat('wood'), tube([V(x + lean * 0.11, 0.1, 0), V(x + lean * 0.2, 0.2, 0), top], 0.0026, 5), { color: 0x6a4a30, w: false });
    tips.push(top);
  }
  const grp = k.build({ name: 'incenseSticks' });
  const tipMat = paintedMaterial({ color: 0x3a2a1a, emissive: 0xff5a1a, emissiveIntensity: 0, roughness: 0.8, brush: 0.1, name: 'incenseTip' });
  const tipGeo = lathe([[0, 0], [0.0028, 0.002], [0.0024, 0.009], [0, 0.012]], 6);
  const tipAnchor = new THREE.Object3D();
  for (const p of tips) {
    const m = new THREE.Mesh(tipGeo, tipMat);
    m.position.copy(p);
    grp.add(m);
  }
  tipAnchor.position.copy(tips[Math.floor(n / 2)]).add(V(0, 0.012, 0));
  grp.add(tipAnchor);
  return { object: grp, tipMat, tipAnchor };
}

function offeringTray() {
  const k = new Kit(31, { grime: 0.25, vary: 0.2 });
  k.add(mat('metal'), lathe([[0, 0], [0.12, 0], [0.13, 0.006], [0.134, 0.016], [0.127, 0.017], [0.118, 0.006], [0, 0.006]], 28), { color: 0x9c8e6a, w: { grime: 0.4 } });
  k.add(mat('glass_bottle'), lathe([[0, 0], [0.03, 0], [0.032, 0.004], [0.034, 0.1], [0.031, 0.1], [0.029, 0.011], [0, 0.011]], 18), { p: [0.048, 0.006, 0], color: 0xd8e4e0, w: false });
  bowl(k, { p: [-0.052, 0.006, 0.01], rad: 0.055, color: 0xe6e0d0 });
  k.add(mat('ceramic'), lathe([[0, 0.05], [0.042, 0.034], [0.036, 0.044], [0.022, 0.052], [0, 0.056]], 16), { p: [-0.052, 0.006, 0.01], color: 0xf3f0e6, jitter: 0.0015, jitterFreq: 140, w: false });
  const grp = k.build({ name: 'offeringTray' });
  const liquid = new THREE.Mesh(lathe([[0, 0], [0.027, 0], [0.029, 0.072], [0, 0.072]], 16), paintedMaterial({ color: 0x8e0b14, emissive: 0x3a0306, emissiveIntensity: 0.25, roughness: 0.12, brush: 0.05, name: 'redSoda' }));
  liquid.position.set(0.048, 0.017, 0);
  grp.add(liquid);
  const straw = new THREE.Mesh(tube([V(0, 0, 0), V(0, 0.11, 0), V(0.008, 0.135, 0), V(0.03, 0.142, 0)], 0.0032, 5), paintedMaterial({ color: 0xe86a9a, roughness: 0.5, brush: 0.1, name: 'straw' }));
  straw.position.set(0.05, 0.02, 0.005);
  grp.add(straw);
  return { object: grp, liquid, straw };
}

/** ผ้าแพรสามสี: three thin swept ribbons and a knot. */
function clothStrips(seed = 7) {
  const rng = makeRng(seed);
  const grp = new THREE.Group();
  grp.name = 'clothStrips';
  const cols = [0xd84a7a, 0xe0b830, 0x2a9a5a];
  for (let i = 0; i < 3; i++) {
    const N = 18, L = 0.15 + rng() * 0.05, w = 0.016;
    const pos = [], idx = [];
    for (let j = 0; j <= N; j++) {
      const t = j / N;
      const x = (i - 1) * 0.008 + Math.sin(t * 3 + i) * 0.01 * t, y = -t * L, z = Math.sin(t * 5 + i * 2) * 0.006 * t;
      const tw = (i - 1) * 0.5 + t * (rng() - 0.5) * 1.6;
      const hw = (w / 2) * (1 - 0.35 * t);
      pos.push(x - Math.cos(tw) * hw, y, z - Math.sin(tw) * hw, x + Math.cos(tw) * hw, y, z + Math.sin(tw) * hw);
      if (j < N) idx.push(j * 2, j * 2 + 1, j * 2 + 3, j * 2, j * 2 + 3, j * 2 + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    grp.add(new THREE.Mesh(geo, paintedMaterial({ color: cols[i], roughness: 0.75, brush: 0.4, side: THREE.DoubleSide, name: 'clothStrip' })));
  }
  const knot = new THREE.Mesh(lathe([[0, -0.012], [0.009, -0.008], [0.011, 0.0], [0.007, 0.007], [0, 0.009]], 9), paintedMaterial({ color: 0xc84a6a, roughness: 0.8, brush: 0.4, name: 'clothKnot' }));
  grp.add(knot);
  return grp;
}

function fareTin() {
  const k = new Kit(41, { grime: 0.5, streak: 0.4 });
  can(k, { p: [0, 0, 0], h: 0.085, rad: 0.048, color: 0x8a7448 });
  k.add(mat('metal'), lathe([[0, 0.085], [0.05, 0.085], [0.052, 0.09], [0.05, 0.095], [0, 0.096]], 18), { color: 0x6a5a3a, w: { grime: 0.5 } });
  return k.build({ name: 'fareTin' });
}
const coinGeo = (r) => lathe([[0, 0], [r, 0], [r * 1.02, 0.001], [r, 0.002], [r * 0.86, 0.0018], [0, 0.0019]], 18);
const holedCoinGeo = () => lathe([[0.004, 0], [0.012, 0], [0.0124, 0.0012], [0.012, 0.0022], [0.004, 0.0022], [0.0036, 0.0011]], 18);

// ------------------------------------------------------------------------------ the chores
export class Chores {
  constructor(stage, opts = {}) {
    this.stage = stage; // interactables (this state only)
    this.night = nightStage; // props, smoke, the per-frame life (the whole night)
    this.only = opts.only || null;
    this.active = false;
    this.flags = g.save?.flags || (g.save ? (g.save.flags = {}) : {});
    this.held = null;
    this.state = { sticks: 'none', lit: false, waied: false, offering: 'bench', cloth: 'table' };
    const G = (this.G = lm('garage'));
    this.go = G?.prop?.object || null;
    this._needed = this.only || D.CHORE_IDS;
    this._items = [];
    try {
      this._build();
    } catch (e) {
      console.warn('[chores] props failed: the chores are done for you', e);
      for (const id of this._needed) this._mark(id, 'done', true);
    }
    this.night.update((dt) => this._update(dt), 52);
    this.night.update(() => this._smokeWind(), 85); // after the particles (80) refresh their wind
    stage.add(() => {
      // leaving the garage with something in hand: it is put where it belongs
      if (this.held) {
        const k = this.held.kind;
        this._dropHeld();
        if (k === 'sticks') this._plantSticks(true);
        else if (k === 'offering') this._placeOffering(true);
        else if (k === 'cloth') this._tieCloth(true);
      }
      this.active = false;
    });
  }

  // ---------------------------------------------------------------- public
  has(id) {
    return this._needed.includes(id);
  }
  done(id) {
    return !this.has(id) || !!this.flags['chore.' + id];
  }
  requiredDone() {
    return D.REQUIRED_CHORES.filter((id) => this.has(id)).every((id) => this.done(id));
  }
  missing() {
    return this._needed.filter((id) => !this.done(id));
  }
  start() {
    this.active = true;
    this.t0 = g.engine.time;
  }
  /** Where the objective marker points: where the held thing goes, else the next chore's thing. */
  target() {
    const wp = (o) => o?.getWorldPosition?.(new THREE.Vector3()) || null;
    const k = this.held?.kind;
    if (k === 'sticks') return wp(this.state.lit && !this.state.waied ? this.shrine?.object : this.shrine?.incenseAnchor || this.shrine?.object)?.add(V(0, this.state.lit && !this.state.waied ? 1.2 : 0, 0));
    if (k === 'offering') return wp(this.gateSpot);
    if (k === 'cloth') return wp(g.taxi?.anchors?.rearviewMirror);
    if (this.has('shrine') && !this.done('shrine')) return wp(this.shrine?.offeringAnchor || this.shrine?.object);
    if (this.has('offering') && !this.done('offering')) return wp(this.tray?.object);
    if (this.has('cloth') && !this.done('cloth')) return wp(this.strips);
    return null;
  }

  /** Ah Kong takes whatever Ton is holding out of his hands (it reappears where he puts it). */
  takeFromPlayer() {
    const H = this.held;
    if (!H) return null;
    this._dropHeld();
    H.obj.visible = false;
    return H.kind;
  }
  /** Where Ah Kong goes to do a chore himself: [{ at: Vector3, look: Vector3 }] in order. */
  kongPlan(id) {
    const wp = (o) => o?.getWorldPosition?.(new THREE.Vector3());
    if (id === 'shrine' && this.shrine) return [{ at: this.shrine.object.localToWorld(V(0, 0, 0.95)), look: wp(this.shrine.object) }];
    if (id === 'offering' && this.tray) return [{ at: wp(this.tray.object), look: wp(this.tray.object), stop: 0.6 }, { at: wp(this.gateSpot), look: wp(this.gateSpot), stop: 0.55 }];
    if (id === 'cloth' && this.strips) {
      const mir = g.taxi?.anchors?.rearviewMirror;
      const win = g.taxi?.root ? g.taxi.root.localToWorld(V(1.35, 0, -0.45)) : null;
      return [{ at: wp(this.strips), look: wp(this.strips), stop: 0.6 }, win && { at: win, look: wp(mir) }].filter(Boolean);
    }
    return [];
  }
  /** Hide the thing he is carrying to do `id` (shown again where it ends up). */
  carry(id) {
    const o = id === 'offering' ? this.tray?.object : id === 'cloth' ? this.strips : null;
    if (o) o.visible = false;
  }
  /** Ah Kong finishes one chore (the result, right; the caller walked him there). */
  finish(id) {
    if (id === 'shrine') this._plantSticks(true, false);
    else if (id === 'offering') this._placeOffering(true);
    else if (id === 'cloth') this._tieCloth(true);
    for (const o of [this.sticks?.object, this.tray?.object, this.strips]) if (o) o.visible = true;
  }
  /** Ah Kong does what is left of the required ones himself. */
  finishRest() {
    if (!this.done('shrine')) this._plantSticks(true, false);
    if (!this.done('offering')) this._placeOffering(true);
    if (!this.done('cloth')) this._tieCloth(true);
    this._dropHeld();
  }

  // ---------------------------------------------------------------- build
  _local(obj, x, y, z, yaw = 0) {
    if (this.go) this.night.mesh(obj, this.go);
    else this.night.mesh(obj);
    obj.position.set(x, y, z);
    obj.rotation.y = yaw;
    if (!this.go && this.G) {
      obj.position.applyAxisAngle(UP, this.G.yaw ?? 0).add(this.G.pos);
      obj.rotation.y += this.G.yaw ?? 0;
    }
    return obj;
  }
  _item(id, parent, pos, size, th, en, enabled, onUse, reach = 1.7, icon = 'hand') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), new THREE.MeshBasicMaterial());
    box.layers.set(LAYERS.INTERACT);
    box.position.set(pos[0], pos[1], pos[2]);
    parent.add(box);
    const it = interact.register({ id: 'chore.' + id, object: box, labelTH: th, labelEN: en, icon, reach, enabled: () => !g.actions?.busy && !this._kongOn?.(id) && enabled(), onUse });
    this.stage.add(() => {
      interact.unregister(it);
      box.removeFromParent();
      box.geometry.dispose();
    });
    return box;
  }
  _build() {
    const S = this.state;
    const can1 = () => true; // any order, any time (early counts too)
    if (this.has('shrine')) {
      const sh = createSpiritHouse({ style: 'thai', size: 0.8, seed: 23, offerings: true, age: 0.8 });
      this.shrine = sh;
      this._local(sh.object, 3.55, 0, 4.85, Math.PI + 0.5);
      sh.object.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
      // solid: you walk round the post, not through it
      try {
        const wp = sh.object.getWorldPosition(new THREE.Vector3());
        const col = colliders.addCircle(wp.x, wp.z, 0.42, { tag: 'spiritHouse' });
        this.night.add(() => colliders.remove(col));
      } catch (e) {
        /* collision optional */
      }
      if (sh.candleAnchor) this.night.light({ kind: 'candle', object: sh.candleAnchor, intensity: 2.2, distance: 3.2, glow: { size: 0.16, opacity: 0.6 } });
      const bundle = incenseSticks(9, 11).object;
      bundle.rotation.set(0, 0.3, Math.PI / 2);
      bundle.position.set(-0.04, 0.012, 0.04);
      (sh.offeringAnchor || sh.object).add(bundle);
      const ay = sh.incenseAnchor?.position.y ?? 1.1, az = sh.incenseAnchor?.position.z ?? 0.1;
      this._item('sticks', sh.offeringAnchor || sh.object, [0.02, 0.06, 0.06], [0.42, 0.22, 0.3], 'หยิบธูปสามดอก', 'Take three incense sticks', () => S.sticks === 'none' && !this.held, () => this._takeSticks(), 2.3);
      this._item('light', sh.candleAnchor || sh.object, [0.04, 0.05, 0.03], [0.16, 0.2, 0.2], 'จุดธูป', 'Light the incense', () => this.held?.kind === 'sticks' && !S.lit, () => this._lightSticks(), 2.3);
      this._item('wai', sh.object, [0, ay + 0.38, az - 0.12], [0.62, 0.5, 0.42], 'ไหว้', 'Wai', () => !S.waied && !this._wai && !this.done('shrine'), () => this._doWai(), 2.6, 'pray');
      this._item('plant', sh.incenseAnchor || sh.object, [-0.04, 0.06, 0.02], [0.18, 0.2, 0.22], 'ปักธูป', 'Plant the incense', () => this.held?.kind === 'sticks' && !this._wai, () => this._plantSticks(false), 2.3);
      if (this.done('shrine')) this._plantSticks(true, this.flags['chore.shrine'] === 'wrong', true);
    }
    if (this.has('offering')) {
      const tr = offeringTray();
      this.tray = tr;
      this._local(tr.object, -0.95, 0.895, -3.02, 0.4);
      this._item('offering', tr.object, [0, 0.07, 0], [0.3, 0.16, 0.2], 'หยิบน้ำแดงกับข้าว', 'Take the red soda and the rice', () => can1() && S.offering === 'bench' && !this.held, () => this._takeOffering());
      this.gateSpot = this._local(new THREE.Group(), -3.55, 0, 4.05, 0.3);
      this._item('gate', this.gateSpot, [0, 0.1, 0], [0.6, 0.3, 0.6], 'วางไว้ที่ประตู', 'Leave it by the gate', () => this.held?.kind === 'offering', () => this._placeOffering(false), 2.0);
      if (this.done('offering')) this._placeOffering(true);
    }
    const table = this.G?.anchors?.tableAnchor;
    if (this.has('cloth') && table) {
      const st = clothStrips();
      st.rotation.set(-Math.PI / 2, 0, 0.6);
      st.position.set(-0.32, 0.004, 0.24);
      table.add(st);
      this.night.add(() => st.removeFromParent());
      this.strips = st;
      this._item('cloth', table, [-0.32, 0.03, 0.2], [0.24, 0.08, 0.24], 'หยิบผ้าสามสี', 'Take the coloured cloth', () => can1() && S.cloth === 'table' && !this.held, () => this._takeCloth());
      const mir = g.taxi?.anchors?.rearviewMirror;
      if (mir) this._item('tie', mir, [0, -0.02, 0], [0.3, 0.14, 0.14], 'ผูกผ้าที่กระจกมองหลัง', 'Tie it on the mirror', () => this.held?.kind === 'cloth', () => this._tieCloth(false), 2.3);
      if (this.done('cloth')) this._tieCloth(true);
    }
    if (this.has('coins') && table) {
      const tin = fareTin();
      tin.position.set(0.36, 0, -0.06);
      table.add(tin);
      this.night.add(() => tin.removeFromParent());
      this.tin = tin;
      this._item('coins', table, [0.36, 0.05, -0.06], [0.14, 0.12, 0.14], 'นับเหรียญ', 'Count the coins', () => can1() && !this.done('coins') && !this._counting && !this.held, () => this._countCoins());
    }
  }

  // ---------------------------------------------------------------- flags
  _mark(id, value = 'done', silent = false) {
    if (this.flags['chore.' + id]) return;
    this.flags['chore.' + id] = value;
    try {
      this.onMark?.(id, value);
    } catch (e) {
      /* the listener is the garage's */
    }
    try {
      g.persist?.();
    } catch (e) {
      /* ignore */
    }
    if (!silent && this.active) say(D.CHORE_DONE[id === 'shrine' && value === 'wrong' ? 'shrineWrong' : id]);
  }

  // ---------------------------------------------------------------- holding things
  _hold(kind, obj, pose) {
    this._dropHeld();
    const grip = new THREE.Object3D();
    grip.position.set(0.02, 0.02, 0.02);
    obj.add(grip);
    const from = obj.getWorldPosition(new THREE.Vector3());
    const fromQ = obj.getWorldQuaternion(new THREE.Quaternion());
    g.engine.scene.attach(obj);
    this.held = { kind, obj, grip, pose, lift: 0, k: 0, from, fromQ };
    sfx('paper_rustle', { object: obj, volume: 0.45, rate: 1.3 });
    try {
      g.player?.reach?.(grip, { hand: 'R', duration: 0.4, hold: 1e6, press: false });
    } catch (e) {
      /* cosmetic */
    }
  }
  _releaseHand() {
    const H = this.held;
    try {
      if (H) g.player?.reach?.(H.grip, { duration: 0.01, hold: 0, press: false });
    } catch (e) {
      /* cosmetic */
    }
  }
  _dropHeld() {
    if (!this.held) return;
    this._releaseHand();
    this.held.grip.removeFromParent();
    this.held = null;
  }
  /** View pose: f forward, u up, r right (camera frame) and a tilt. */
  _pose(f, u, r, tilt, out, outQ) {
    const cam = g.engine.camera;
    out.copy(cam.position).add(_v.set(r, u, -f).applyQuaternion(cam.quaternion));
    outQ.copy(cam.quaternion).multiply(_q.setFromEuler(_e.set(tilt[0], tilt[1], tilt[2], 'YXZ')));
  }

  // ---------------------------------------------------------------- 1 the spirit house
  _takeSticks() {
    const st = incenseSticks(3, 5);
    this.sticks = st;
    this.night.mesh(st.object);
    (this.shrine.offeringAnchor || this.shrine.object).getWorldPosition(_v);
    st.object.position.copy(_v);
    this.state.sticks = 'held';
    this._hold('sticks', st.object, (lift, o, q) => this._pose(0.34 - 0.1 * lift, -0.12 + 0.1 * lift, 0.03 - 0.03 * lift, [0.15 - 0.15 * lift, 0, 0], o, q));
  }
  _lightSticks() {
    const S = this.state;
    S.lit = true;
    sfx('lighter', { object: this.sticks.object, volume: 0.5 });
    this._smoke = this.night.emit('incense', { object: this.sticks.tipAnchor, count: 34, intensity: 0.7 });
    this._glow = 1;
  }
  async _doWai() {
    const S = this.state;
    this._wai = { t: 0 };
    const rig = g.cameraRig;
    const p0 = rig.pitch;
    rig.lookEnabled = false;
    say(D.SHRINE_PRAYER);
    try {
      await new Promise((res) => {
        const off = this.stage.update((dt) => {
          const W = this._wai;
          if (!W) return res(off());
          W.t += dt;
          const k = W.t / 3.2;
          const bow = smoothstep(0.1, 0.35, k) * (1 - smoothstep(0.6, 0.9, k)) + 0.5 * smoothstep(0.38, 0.45, k) * (1 - smoothstep(0.5, 0.58, k));
          rig.pitch = p0 + (-0.5 - p0) * bow;
          if (this.held) this.held.lift = smoothstep(0, 0.2, k) * (1 - smoothstep(0.85, 1, k));
          if (k >= 1) {
            off();
            res();
          }
        }, 46);
      });
    } finally {
      rig.pitch = p0;
      rig.lookEnabled = true;
      this._wai = null;
      if (this.held) this.held.lift = 0;
    }
    S.waied = true;
    // the sticks were already planted: now it is complete
    if (S.sticks === 'planted' && !this.done('shrine')) {
      clearTimeout(this._waiWait);
      this._wrongSmoke = !S.lit;
      this._mark('shrine', S.lit ? 'done' : 'wrong');
    }
  }
  _plantSticks(instant, wrong = null, quiet = false) {
    const S = this.state;
    const sh = this.shrine;
    if (!sh) return;
    if (!this.sticks) {
      this.sticks = incenseSticks(3, 5);
      this.night.mesh(this.sticks.object);
    }
    // any order is fine; only a step left out entirely counts (never lit; or no wai at all, below)
    const bad = wrong ?? !S.lit;
    const needWai = wrong == null && !instant && !bad && !S.waied;
    const st = this.sticks;
    if (this.held?.kind === 'sticks') this._dropHeld();
    const pot = sh.incenseAnchor || sh.object;
    pot.attach(st.object);
    st.object.position.set(0, -0.02, 0);
    st.object.quaternion.identity();
    st.object.rotation.set(0, 0, 0.05);
    st.tipMat.emissiveIntensity = 2.2;
    if (!this._smoke) this._smoke = this.night.emit('incense', { object: st.tipAnchor, count: 34, intensity: 0.75 });
    S.sticks = 'planted';
    this._wrongSmoke = bad;
    if (bad) {
      if (!instant) sfx('sting_low', { volume: 0.4 });
      this.flags['k.shrineWrong'] = (this.flags['k.shrineWrong'] || 0) + (quiet ? 0 : 1);
    }
    if (needWai) {
      // planted first, the wai can still come: 25 s
      clearTimeout(this._waiWait);
      this._waiWait = setTimeout(() => {
        if (this.done('shrine')) return;
        this._wrongSmoke = true;
        this._mark('shrine', 'wrong');
      }, 25000);
    } else if (!quiet) this._mark('shrine', bad ? 'wrong' : 'done', instant);
    if (!instant) sfx('bell_temple', { object: pot, volume: 0.25, rate: 1.4 });
  }

  // ---------------------------------------------------------------- 2 the offering by the gate
  _takeOffering() {
    this.state.offering = 'held';
    this._hold('offering', this.tray.object, (lift, o, q) => this._pose(0.4, -0.27, 0.02, [0.35, 0, 0], o, q));
  }
  _placeOffering(instant) {
    const T = this.tray;
    if (!T) return;
    if (this.held?.kind === 'offering') this._dropHeld();
    this.gateSpot.attach(T.object);
    T.object.position.set(0, 0, 0);
    T.object.rotation.set(0, 0.3, 0);
    T.object.getWorldPosition(_v);
    T.object.position.y += ground(_v.x, _v.z) - _v.y + 0.005;
    this.state.offering = 'gate';
    this._placedAt = g.engine.time;
    if (!instant) sfx('coins', { object: T.object, volume: 0.15, rate: 0.6 });
    this._mark('offering', 'done', instant);
  }

  // ---------------------------------------------------------------- 3 the cloth on the mirror
  _takeCloth() {
    this.state.cloth = 'held';
    this._hold('cloth', this.strips, (lift, o, q) => this._pose(0.3, -0.15, 0.08, [-1.2, 0, 0.2], o, q));
  }
  async _tieCloth(instant) {
    const st = this.strips;
    const mir = g.taxi?.anchors?.rearviewMirror;
    if (!st || !mir) return this._mark('cloth', 'done', true);
    if (this.held?.kind === 'cloth') this._dropHeld();
    this.state.cloth = 'tied';
    if (!instant) {
      const t = g.taxi;
      if (t.state.doors.fr < 0.5) t.setControl?.('door', { door: 'fr', open: 1 });
      g.player?.reach?.(mir, { hand: 'R', duration: 0.5, hold: 0.6, press: false });
      sfx('paper_rustle', { object: mir, volume: 0.4, rate: 0.8 });
      setTimeout(() => {
        if (g.actions?.onFoot && t.state.doors.fr > 0.5) t.setControl?.('door', { door: 'fr', open: 0 });
      }, 2200);
    }
    mir.add(st);
    st.position.set(0.035, -0.035, 0);
    st.rotation.set(0, 0, 0);
    this._stripsOnMirror = true;
    this._mark('cloth', 'done', instant);
  }

  // ---------------------------------------------------------------- 4 the coins
  async _countCoins() {
    const table = this.G.anchors.tableAnchor;
    this._counting = true;
    const coinMat = paintedMaterial({ color: 0xc8c4b8, metalness: 0.8, roughness: 0.35, brush: 0.2, name: 'coin' });
    const oldMat = paintedMaterial({ color: 0x5a3a22, metalness: 0.6, roughness: 0.55, brush: 0.4, dirt: 0.6, name: 'oldCoin' });
    const coins = [];
    this.night.add(() => {
      for (const c of coins) c.removeFromParent();
      coinMat.dispose();
      oldMat.dispose();
    });
    const rng = makeRng(77);
    sfx('coins', { object: table, volume: 0.5 });
    for (let i = 0; i < 13; i++) {
      const extra = i === 12;
      if (extra) {
        await new Promise((r) => setTimeout(r, 400));
        await say(D.COIN_COUNT.counted);
        await new Promise((r) => setTimeout(r, 900));
      } else await new Promise((r) => setTimeout(r, 300));
      const m = new THREE.Mesh(extra ? holedCoinGeo() : coinGeo([0.01, 0.0115, 0.012, 0.013][Math.floor(rng() * 4)]), extra ? oldMat : coinMat);
      m.position.set(0.12 + (i % 7) * 0.032, 0.002, 0.12 + Math.floor(i / 7) * 0.035);
      m.rotation.y = rng() * 6;
      table.add(m);
      coins.push(m);
      sfx('coins', { object: m, volume: extra ? 0.18 : 0.12, rate: extra ? 0.7 : 1.6 + rng() * 0.3 });
    }
    await say(D.COIN_COUNT.extra);
    this.flags['k.extraCoins'] = (this.flags['k.extraCoins'] || 0) + 1;
    this._mark('coins', 'done');
    this._counting = false;
    // back into the tin, except the old one, which sits on the lid
    setTimeout(() => {
      for (const c of coins.slice(0, 12)) c.visible = false;
      const old = coins[12];
      if (old) old.position.set(0.36, 0.098, -0.06);
    }, 6000);
  }

  /** The planted sticks' smoke: straight up, or leaning at Ton if a step was skipped. */
  _smokeWind() {
    const sm = this._smoke?.object?.material?.uniforms?.uWindV;
    if (!sm || this.state.sticks !== 'planted') return;
    if (this._wrongSmoke && g.player?.root) {
      const toward = _v.copy(g.player.root.position).sub(this.sticks.tipAnchor.getWorldPosition(_v2)).setY(0).normalize();
      sm.value.set(toward.x * 1.5, toward.z * 1.5);
    } else sm.value.set(0, 0);
  }

  // ---------------------------------------------------------------- per frame (after the camera)
  _update(dt) {
    const t = g.engine.time;
    const H = this.held;
    if (H) {
      H.k = Math.min(1, H.k + dt / 0.45);
      const k = easeInOut(H.k);
      const o = _v2, q = new THREE.Quaternion();
      H.pose(H.lift || 0, o, q);
      H.obj.position.lerpVectors(H.from, o, k);
      H.obj.quaternion.slerpQuaternions(H.fromQ, q, k);
    }
    // incense glow and the smoke: straight up, or leaning into the garage if a step was skipped
    if (this.sticks) this.sticks.tipMat.emissiveIntensity = this.state.lit || this.state.sticks === 'planted' ? 1.8 + Math.sin(t * 7) * 0.4 : 0;
    // the soda goes down when nobody is looking
    const T = this.tray;
    if (T && this.state.offering === 'gate' && !this._sipped && t - this._placedAt > 14 && !g.cameraRig.isOnScreen(T.object.getWorldPosition(_v), -0.2)) {
      this._sipped = true;
      T.liquid.scale.y = 0.55;
      T.straw.rotation.y += 1.7;
    }
    // the strips sway with the taxi
    if (this._stripsOnMirror && this.strips) {
      const a = g.taxi?._accLocal;
      this.strips.rotation.x = clamp((a?.z || 0) * 0.05, -0.6, 0.6) + Math.sin(t * 1.7) * 0.05;
      this.strips.rotation.z = clamp(-(a?.x || 0) * 0.05, -0.6, 0.6) + Math.sin(t * 1.3 + 1) * 0.04;
    }
  }
}
