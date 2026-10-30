// PlayerActions (g.actions): the player's own physical verbs, shared by every state.
//   * the rules paper: raise / lower (Tab · J · pad Y), turn it over (F · LMB · pad A while up)
//     to the red-ink back; pencil notes come from g.knowledge (or the save)
//   * the amulet: hold (G · RMB · pad X, or look at it and hold F): golden aura (g.cine.amulet),
//     a hum, bus 'amulet:hold' {active}
//   * get out of the taxi and walk (V, or open the driver door while stopped), get back in
//     (V near the driver door, or reach into the open doorway)
//   * wipe condensation (the taxi's glass interactables; the hand follows), inspect (lean in)
//
// API for B and C (all safe to call at any time):
//   g.actions.setEnabled(b) · setAllowed({paper, amulet, vehicle, inspect}) · busy · inTaxi · onFoot
//   raisePaper(side?) · lowerPaper(instant?) · togglePaper() · flipPaper() · refreshPaper()
//   paper { up, side, seconds, total, flipped }       amulet { held, seconds, total }
//   holdAmulet(on) · setAmuletWarmth(fn: () => 0..1)   (default: 1 with a ghost passenger aboard)
//   exitTaxi() -> Promise<bool> · enterTaxi() -> Promise<bool> · canExit() · canEnter()
//   seatCamera(opts) · footCamera(yaw) · bikeCamera() · wipeAt(worldPoint) · inspect(target, opts)
// Bus out: 'player:exitTaxi', 'player:enterTaxi', 'player:paper' {up, side}, 'player:inspect' {what},
//          'amulet:hold' {active, warmth}
import * as THREE from 'three';
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { input } from '../../core/Input.js';
import { interact } from '../../core/Interact.js';
import { colliders } from '../../core/Colliders.js';
import { LAYERS } from '../../core/layers.js';
import { clamp, damp, easeInOut, smoothstep } from '../../core/math.js';
import { paintedMaterial } from '../../render/index.js';
import { wait } from '../util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const PAPER_W = 0.205;
const PAPER_H = 0.282;
const TEX_W = 896;
const TEX_H = 1232;

// ------------------------------------------------------------------------------- paper art
function paperGeometry() {
  const geo = new THREE.PlaneGeometry(PAPER_W, PAPER_H, 12, 16);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (PAPER_W / 2);
    const y = p.getY(i) / (PAPER_H / 2);
    // the sheet curls away from the eye at the sides, and keeps the memory of its folds
    let z = -0.011 * x * x;
    z += -0.0035 * Math.max(0, 1 - Math.abs(y - 0.33) * 14) + -0.0035 * Math.max(0, 1 - Math.abs(y + 0.33) * 14);
    z += 0.0025 * Math.max(0, 1 - Math.abs(x) * 9) * (0.5 + 0.5 * y);
    p.setZ(i, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Turn the ballpoint ink of a drawn page into smudged red ink (Somchai's back side). */
function redInk(canvas) {
  const c2 = canvas.getContext('2d', { willReadFrequently: true });
  const img = c2.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    const blue = b - r;
    if (blue < 6) continue;
    const t = clamp(blue / 46, 0, 1);
    const L = (r + gg + b) / 3;
    const R = Math.min(255, L * 1.25 + 38);
    const G = L * 0.42;
    const B = L * 0.38;
    d[i] = r + (R - r) * t;
    d[i + 1] = gg + (G - gg) * t;
    d[i + 2] = b + (B - b) * t;
  }
  c2.putImageData(img, 0, 0);
  // a soft smear of the wet ink
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width;
  tmp.height = canvas.height;
  tmp.getContext('2d').drawImage(canvas, 0, 0);
  c2.save();
  c2.globalAlpha = 0.18;
  c2.globalCompositeOperation = 'multiply';
  c2.filter = 'blur(1.4px)';
  c2.drawImage(tmp, 1.5, 1);
  c2.restore();
}

export class PlayerActions {
  constructor() {
    this.enabled = true;
    this.allow = { paper: true, amulet: true, vehicle: true, inspect: true };
    this.busy = false;
    this.paper = { up: false, side: 'front', k: 0, flip: 0, seconds: 0, total: 0, flipped: false, backSeconds: 0 };
    this.amulet = { held: false, seconds: 0, total: 0, first: false, warmth: 0 };
    this._warmthFn = null;
    this._paperDirty = { front: true, back: true };
    this._paperKey = '';
    this._installed = false;
    this._hum = null;
    this._lastWipe = 0;
    this._ctrlBefore = false;
    this._colliders = [];
  }

  install() {
    if (this._installed) return this;
    this._installed = true;
    g.engine.onUpdate((dt) => this._input(dt), 2);
    g.engine.onUpdate((dt) => this._place(dt), 55, { always: true });
    // anything that changes what Ton knows redraws the paper the next time it is raised
    for (const ev of ['knowledge:changed', 'knowledge:note', 'memory:found', 'save:loaded', 'rule:event']) bus.on(ev, () => this.refreshPaper());
    bus.on('game:state', ({ state }) => {
      this.lowerPaper(true);
      this.holdAmulet(false);
      this.enabled = !['menu', 'intro', 'ending', 'death'].includes(state);
      this.busy = false;
    });
    // the driver door opened from the inside while stopped: step out
    bus.on('taxi:control', (e) => {
      if (!this.enabled || !this.allow.vehicle || this.busy) return;
      if (e?.control === 'door' && e.value?.door === 'fr' && e.value.open > 0.5 && this.inTaxi && this.canExit()) {
        setTimeout(() => {
          if (this.inTaxi && g.taxi.state.doors.fr > 0.3 && this.canExit()) this.exitTaxi({ doorOpen: true });
        }, 350);
      }
    });
    this._registerInteractables();
    if (g.taxi) {
      g.taxi.onWipeGlass = (pane, point) => this._wipeHand(point);
    }
    return this;
  }

  // ------------------------------------------------------------------------- state
  get inTaxi() {
    return !!g.player && g.player.vehicle === g.taxi && !!g.taxi;
  }
  get onFoot() {
    return !!g.player && g.player.mode === 'foot';
  }
  setEnabled(b) {
    this.enabled = !!b;
    if (!b) {
      this.lowerPaper();
      this.holdAmulet(false);
    }
  }
  setAllowed(a = {}) {
    Object.assign(this.allow, a);
    if (a.paper === false) this.lowerPaper();
    if (a.amulet === false) this.holdAmulet(false);
  }
  setAmuletWarmth(fn) {
    this._warmthFn = typeof fn === 'function' ? fn : null;
  }

  // ------------------------------------------------------------------------- input
  _input(dt) {
    const P = this.paper;
    const A = this.amulet;
    if (P.up) {
      P.seconds += dt;
      P.total += dt;
      if (P.side === 'back') P.backSeconds += dt;
    }
    if (A.held) {
      A.seconds += dt;
      A.total += dt;
    }
    if (!this.enabled || g.engine.paused || g.ui?.modalOpen) return;
    if (g.cameraRig.cineBlend > 0.5 && !this._cineOk) {
      if (P.up) this.lowerPaper();
      return;
    }
    // paper
    if (input.pressed('paper') && this.allow.paper && !this.busy) {
      this.togglePaper();
      input.consume('paper');
    }
    if (P.up && (input.pressed('interact') || input.pressed('confirm')) && !interact.current) {
      this.flipPaper();
      input.consume('interact');
    }
    // amulet (hotkey hold)
    if (this.allow.amulet && !this.busy) {
      if (input.pressed('amulet')) {
        if (P.up) this.lowerPaper();
        this.holdAmulet(true, 'key');
      } else if (A.held && A.by === 'key' && !input.down('amulet')) this.holdAmulet(false);
    } else if (A.held) this.holdAmulet(false);
    // vehicle
    if (input.pressed('vehicle') && this.allow.vehicle && !this.busy) {
      if (this.inTaxi && this.canExit()) this.exitTaxi();
      else if (this.onFoot && this.canEnter()) this.enterTaxi();
    }
    // amulet warmth follows the night (a ghost aboard)
    if (A.held) {
      const w = this._warmth();
      if (Math.abs(w - A.warmth) > 0.05) {
        A.warmth = w;
        g.cine?.amulet(0.18 + 0.82 * w, 0.8);
        this._hum?.setVolume?.(0.15 + 0.6 * w, 0.6);
      }
    }
  }

  _warmth() {
    try {
      if (this._warmthFn) return clamp(this._warmthFn() || 0, 0, 1);
      const r = g.ride;
      if (r && (r.data?.identity === 'ghost') && ['riding', 'forkApproach', 'resolving', 'pickup'].includes(r.phase)) return 1;
    } catch (e) {
      /* ignore */
    }
    return 0;
  }

  // ------------------------------------------------------------------------- paper
  togglePaper() {
    if (this.paper.up) this.lowerPaper();
    else this.raisePaper();
  }
  raisePaper(side) {
    const P = this.paper;
    if (!this.allow.paper) return;
    if (this.amulet.held) this.holdAmulet(false);
    this._ensurePaper();
    if (side) P.side = side;
    this._renderPaper(P.side);
    if (!P.up) {
      P.up = true;
      P.seconds = 0;
      g.audio?.play('paper_unfold', { object: g.player?.root, volume: 0.7 });
      bus.emit('player:paper', { up: true, side: P.side });
    }
  }
  lowerPaper(instant = false) {
    const P = this.paper;
    if (!P.up) {
      if (instant) P.k = 0;
      return;
    }
    P.up = false;
    if (instant) P.k = 0;
    g.audio?.play('paper_rustle', { object: g.player?.root, volume: 0.5 });
    bus.emit('player:paper', { up: false, side: P.side });
  }
  flipPaper() {
    const P = this.paper;
    if (!P.up) return;
    P.side = P.side === 'front' ? 'back' : 'front';
    if (P.side === 'back') P.flipped = true;
    this._renderPaper(P.side);
    g.audio?.play('paper_rustle', { object: g.player?.root, volume: 0.8, rate: 1.1 });
    bus.emit('player:paper', { up: true, side: P.side });
  }
  /** Mark both sides for a redraw (new pencil notes); redrawn lazily on the next raise. */
  refreshPaper() {
    this._paperDirty.front = this._paperDirty.back = true;
    if (this.paper.up) this._renderPaper(this.paper.side);
  }

  _ensurePaper() {
    if (this._paperGroup) return;
    const grp = new THREE.Group();
    grp.name = 'rulesPaperProp';
    const geo = paperGeometry();
    const mk = (canvas) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const m = paintedMaterial({
        map: tex, emissive: 0xfff0d8, emissiveMap: tex, emissiveIntensity: 0.16, alphaTest: 0.45, roughness: 0.96,
        brush: 0.12, wet: 0, puddles: 0, envReflect: 0, atmoRim: 0, side: THREE.FrontSide, name: 'rulesPaper',
      });
      return { tex, m };
    };
    this._canvas = { front: document.createElement('canvas'), back: document.createElement('canvas') };
    for (const c of Object.values(this._canvas)) {
      c.width = TEX_W;
      c.height = TEX_H;
    }
    const F = mk(this._canvas.front);
    const B = mk(this._canvas.back);
    this._tex = { front: F.tex, back: B.tex };
    const front = new THREE.Mesh(geo, F.m);
    const back = new THREE.Mesh(geo, B.m);
    back.rotation.y = Math.PI;
    back.position.z = -0.0006;
    for (const m of [front, back]) {
      m.frustumCulled = false;
      m.renderOrder = 5;
      grp.add(m);
    }
    this._flipPivot = new THREE.Group();
    this._flipPivot.add(grp);
    this._paperGroup = new THREE.Group();
    this._paperGroup.add(this._flipPivot);
    this._paperGroup.visible = false;
    g.engine.scene.add(this._paperGroup);
  }

  /** What Ton has written on the paper (knowledge), the hidden line, for one side. */
  _paperData(side) {
    const R = g.data?.rules || {};
    const rules = (R.RULES || []).filter((r) => (side === 'back' ? r.side === 'back' : r.side !== 'back'));
    let ann = {};
    let revealed = [];
    const K = g.knowledge;
    try {
      const d = K?.paperData?.() || K?.paperAnnotations?.() || K?.pencilNotes?.() || null;
      if (d && typeof d === 'object') {
        ann = { ...(d.annotations || (d.revealed ? {} : d)) };
        revealed = (d.revealed || []).slice();
      }
    } catch (e) {
      /* knowledge optional */
    }
    const save = g.save;
    const PN = R.PENCIL_NOTES || {};
    if (save && !Object.keys(ann).length) {
      for (const id of save.rulesLearned || []) if (PN[id]) ann[id] = PN[id];
      revealed = (save.rulesLearned || []).slice();
      for (const pid of Object.keys(save.knowledge || {})) if (PN['p:' + pid]) ann['p:' + pid] = PN['p:' + pid];
      if ((save.loops || 0) >= 3 && PN.back) ann.back = PN.back;
    }
    const ids = new Set(rules.map((r) => r.id));
    const out = {};
    for (const [k, v] of Object.entries(ann)) {
      if (ids.has(k)) out[k] = v;
      else if (side === 'front' && k.startsWith('p:')) out[k] = v;
      else if (side === 'back' && k === 'back') out['p:back'] = v;
      else if (side === 'front' && k === 'hidden') out.hidden = v;
    }
    const data = { rules, annotations: out, revealed: revealed.filter((id) => ids.has(id)), seed: side === 'back' ? 31 : 7 };
    if (side === 'back' && R.PAPER?.back) {
      data.paper = { title: R.PAPER.back.title, subtitle: null, footer: R.PAPER.back.footer, forkSketch: R.PAPER.forkSketch };
      if (save?.flags?.['k.endingSuccessor'] && R.PAPER.successorNote) out['p:kong'] = R.PAPER.successorNote;
    }
    if (side === 'front') {
      const H = R.HIDDEN_LINE || {};
      const loops = save?.loops || 0;
      const cabin = this.inTaxi && g.taxi?.state?.cabinLight ? 1 : 0;
      const wet = !this.inTaxi && (g.sky?.weather?.rain ?? 0) > 0.25 ? 1 : 0;
      if (loops >= (H.minLoop ?? 1) && (cabin || wet)) {
        data.hiddenLine = true;
        data.hiddenAlpha = Math.max(cabin, wet * 0.8);
      }
    }
    return data;
  }

  _renderPaper(side) {
    const data = this._paperData(side);
    const key = side + JSON.stringify([data.annotations, data.revealed, data.hiddenLine ? 1 : 0, (data.rules || []).length]);
    if (!this._paperDirty[side] && this._paperKeys?.[side] === key) return;
    this._paperKeys = this._paperKeys || {};
    this._paperKeys[side] = key;
    this._paperDirty[side] = false;
    const c = this._canvas[side];
    const ctx = c.getContext('2d', { willReadFrequently: true });
    try {
      g.ui.drawRulesPaper(ctx, c.width, c.height, data);
      if (side === 'back') redInk(c);
    } catch (e) {
      console.warn('[actions] paper draw failed', e);
      ctx.fillStyle = '#d9cfb4';
      ctx.fillRect(0, 0, c.width, c.height);
    }
    this._tex[side].needsUpdate = true;
  }

  // ------------------------------------------------------------------------- amulet
  holdAmulet(on, by = 'api') {
    const A = this.amulet;
    if (on === A.held) return;
    if (on && !this.allow.amulet) return;
    A.held = !!on;
    A.by = by;
    const p = g.player;
    if (on) {
      A.seconds = 0;
      A.warmth = this._warmth();
      if (this.inTaxi) {
        const anchor = g.taxi.anchors.amuletHang;
        p?.reach?.(anchor, { hold: 1e6, press: false, duration: 0.35 });
        bus.emit('amulet:hold', { active: true, warmth: A.warmth });
      } else if (p) {
        p.hold('amulet'); // emits amulet:hold {active:true}
      } else bus.emit('amulet:hold', { active: true, warmth: A.warmth });
      g.cine?.amulet(0.18 + 0.82 * A.warmth, 0.5);
      try {
        this._hum?.stop?.(0.2);
        const obj = this.inTaxi ? g.taxi.anchors.amuletHang : p?.root;
        this._hum = g.audio?.loop('amulet_hum', { object: obj || undefined, volume: 0.15 + 0.6 * A.warmth });
      } catch (e) {
        this._hum = null;
      }
      if (!A.first) {
        A.first = true;
        bus.emit('amulet:first', {});
      }
    } else {
      if (this.inTaxi) p?.reach?.(g.taxi.anchors.amuletHang, { duration: 0.01, hold: 0, press: false });
      else if (p && p.held === 'amulet') p.hold(null);
      bus.emit('amulet:hold', { active: false });
      g.cine?.amulet(0, 0.7);
      this._hum?.stop?.(0.6);
      this._hum = null;
    }
  }

  // ------------------------------------------------------------------------- per-frame placement
  _place(dt) {
    const P = this.paper;
    if (!this._paperGroup) return;
    P.k = damp(P.k, P.up ? 1 : 0, P.up ? 9 : 11, dt);
    const targetFlip = P.side === 'back' ? Math.PI : 0;
    P.flip = damp(P.flip, targetFlip, 8, dt);
    const vis = P.k > 0.01;
    this._paperGroup.visible = vis;
    if (!vis) return;
    const cam = g.engine.camera;
    const k = easeInOut(clamp(P.k, 0, 1));
    const fwd = _v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = _v2.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const right = _v3.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const t = g.engine.time;
    const G = this._paperGroup;
    G.position.copy(cam.position).addScaledVector(fwd, 0.33 + 0.02 * (1 - k)).addScaledVector(up, -0.022 - (1 - k) * 0.33).addScaledVector(right, 0.006 + Math.sin(t * 0.7) * 0.0015);
    G.quaternion.copy(cam.quaternion);
    _e.set(-0.1 - (1 - k) * 0.9 + Math.sin(t * 0.9) * 0.008, Math.sin(t * 0.53) * 0.01, 0.025 + Math.sin(t * 0.61) * 0.006);
    G.quaternion.multiply(_q.setFromEuler(_e));
    // turning it over: a quick lift-and-turn around the vertical axis
    this._flipPivot.rotation.set(0, P.flip, 0);
    this._flipPivot.position.z = -Math.sin(Math.min(Math.PI, Math.abs(P.flip))) * 0.035;
    // readable in the dark, a touch more under the cabin light
    const cabin = this.inTaxi ? g.taxi?.cabinBrightness ?? 0 : 0;
    for (const m of this._flipPivot.children[0].children) m.material.emissiveIntensity = 0.13 + cabin * 0.1;
  }

  // ------------------------------------------------------------------------- vehicle
  canExit() {
    if (!this.inTaxi || this.busy) return false;
    const t = g.taxi;
    return Math.abs(t.speedKmh || 0) < 2 && !t.autopilotSpec;
  }
  canEnter() {
    if (!this.onFoot || this.busy || !g.taxi) return false;
    const d = this._doorPoint(_v, 1.25, 0).distanceTo(g.player.root.position);
    return d < 1.9 && Math.abs(g.taxi.speedKmh || 0) < 2;
  }
  _doorPoint(out, x = 1.25, z = 0) {
    return localTo(g.taxi.root, x, 0, -0.1 + z, out);
  }

  /** Step out on the driver's side (right, RHD). */
  async exitTaxi(opts = {}) {
    if (!this.canExit() && !opts.force) return false;
    const t = g.taxi;
    this.busy = true;
    this.lowerPaper();
    this.holdAmulet(false);
    this._ctrlBefore = t.controlsEnabled;
    t.setControlsEnabled(false);
    if (!t.state.handbrake) t.setControl('handbrake', true);
    if (t.state.doors.fr < 0.5) t.setControl('door', { door: 'fr', open: 1 });
    const cam = g.engine.camera;
    const from = cam.position.clone();
    const lookFrom = from.clone().add(_v.set(0, 0, -1).applyQuaternion(cam.quaternion));
    const out = this._doorPoint(new THREE.Vector3(), 1.32, 0.15);
    out.y = groundAt(out.x, out.z);
    const eyeOut = out.clone();
    eyeOut.y += 1.58;
    const yawT = taxiYaw();
    const lookOut = eyeOut.clone().add(_v.set(-Math.sin(yawT), -0.05, -Math.cos(yawT)).multiplyScalar(4));
    const pos = from.clone();
    const look = lookFrom.clone();
    const shot = { position: () => pos, lookAt: () => look, fov: g.cameraRig.fovBase, cut: true, blend: 0.01 };
    this._cineOk = true;
    g.cameraRig.cinematic(shot);
    const D = 1.15;
    await new Promise((res) => {
      let tt = 0;
      const off = g.engine.onUpdate((dt) => {
        tt += dt;
        const k = easeInOut(clamp(tt / D));
        pos.lerpVectors(from, eyeOut, k);
        pos.y += Math.sin(k * Math.PI) * -0.12; // duck under the door frame
        look.lerpVectors(lookFrom, lookOut, smoothstep(0.1, 1, k));
        if (tt >= D) {
          off();
          res();
        }
      }, 45);
    });
    const p = g.player;
    p.exitVehicle();
    p.setPosition(out, yawT);
    this.footCamera(yawT);
    g.cameraRig.release(0.25);
    p.setWalkEnabled(true);
    this._addTaxiColliders();
    this._cineOk = false;
    this.busy = false;
    bus.emit('player:exitTaxi', {});
    bus.emit('player:vehicle', { vehicle: 'taxi', inside: false });
    wait(0.9).then(() => {
      if (this.onFoot && g.taxi.state.doors.fr > 0.5 && !opts.keepDoor) g.taxi.setControl('door', { door: 'fr', open: 0 });
    });
    return true;
  }

  /** Get back into the driver's seat. */
  async enterTaxi(opts = {}) {
    if (!this.canEnter() && !opts.force) return false;
    const t = g.taxi;
    this.busy = true;
    this.lowerPaper();
    this.holdAmulet(false);
    g.player.setWalkEnabled(false);
    if (t.state.doors.fr < 0.5) {
      g.player.reach?.(t.ext?.doors?.fr?.inner || t.anchors.doorFR, { duration: 0.3, hold: 0.1 });
      t.setControl('door', { door: 'fr', open: 1 });
      await wait(0.45);
    }
    const cam = g.engine.camera;
    const from = cam.position.clone();
    const lookFrom = from.clone().add(_v.set(0, 0, -1).applyQuaternion(cam.quaternion));
    const eye = t.anchors.driverEye.getWorldPosition(new THREE.Vector3());
    const yawT = taxiYaw();
    const lookIn = eye.clone().add(_v.set(-Math.sin(yawT), -0.08, -Math.cos(yawT)).multiplyScalar(4));
    const pos = from.clone();
    const look = lookFrom.clone();
    this._cineOk = true;
    g.cameraRig.cinematic({ position: () => pos, lookAt: () => look, fov: g.cameraRig.fovBase, cut: true, blend: 0.01 });
    const D = 1.1;
    await new Promise((res) => {
      let tt = 0;
      const off = g.engine.onUpdate((dt) => {
        tt += dt;
        const k = easeInOut(clamp(tt / D));
        t.anchors.driverEye.getWorldPosition(eye);
        pos.lerpVectors(from, eye, k);
        pos.y += Math.sin(k * Math.PI) * -0.16;
        look.lerpVectors(lookFrom, lookIn, smoothstep(0, 0.8, k));
        if (tt >= D) {
          off();
          res();
        }
      }, 45);
    });
    this._removeTaxiColliders();
    g.player.enterVehicle(t);
    this.seatCamera();
    g.cameraRig.release(0.2);
    this._cineOk = false;
    this.busy = false;
    if (this._ctrlBefore || opts.controls) t.setControlsEnabled(true);
    t.setInteractionsEnabled(true);
    bus.emit('player:enterTaxi', {});
    bus.emit('player:vehicle', { vehicle: 'taxi', inside: true });
    wait(0.5).then(() => {
      if (this.inTaxi && t.state.doors.fr > 0.5) t.setControl('door', { door: 'fr', open: 0 });
    });
    return true;
  }

  /** Put Ton in the driver's seat right now (no animation). */
  seatInTaxi(opts = {}) {
    const t = g.taxi;
    this._removeTaxiColliders();
    g.player.setWalkEnabled(false);
    if (g.player.vehicle && g.player.vehicle !== t) g.player.exitVehicle();
    if (g.player.vehicle !== t) g.player.enterVehicle(t);
    this.seatCamera(opts);
    t.setInteractionsEnabled(true);
  }

  /** Put Ton on foot at a position (no animation). */
  standAt(pos, yaw = 0) {
    const p = g.player;
    if (p.mode !== 'foot') p.exitVehicle();
    const q = pos.clone();
    q.y = groundAt(q.x, q.z);
    p.setPosition(q, yaw);
    this.footCamera(yaw);
    this._addTaxiColliders();
  }

  seatCamera(opts = {}) {
    const t = g.taxi;
    g.cameraRig.attach(t.anchors.driverEye, t.bodyInner || t.root, { yaw: opts.yaw ?? 0, pitch: opts.pitch ?? -0.04, limits: { yawMin: -2.6, yawMax: 2.6, pitchMin: -1.2, pitchMax: 1.25 } });
  }
  footCamera(yaw = 0, pitch = 0) {
    g.cameraRig.attach(g.player.eye, null, { yaw, pitch, limits: { yawMin: -1e9, yawMax: 1e9, pitchMin: -1.25, pitchMax: 1.2 } });
  }
  bikeCamera(opts = {}) {
    g.cameraRig.attach(g.player.eye, g.bike.root, { yaw: 0, pitch: opts.pitch ?? -0.14, limits: { yawMin: -1.9, yawMax: 1.9, pitchMin: -1.0, pitchMax: 0.8 } });
  }

  _addTaxiColliders() {
    this._removeTaxiColliders();
    if (!g.taxi) return;
    for (const z of [-1.45, -0.5, 0.5, 1.45]) {
      localTo(g.taxi.root, 0, 0, z, _v);
      this._colliders.push(colliders.addCircle(_v.x, _v.z, 0.88, { tag: 'taxiBody' }));
    }
  }
  _removeTaxiColliders() {
    for (const c of this._colliders.splice(0)) colliders.remove(c);
  }

  // ------------------------------------------------------------------------- hands
  _wipeHand(point) {
    const now = g.engine.time;
    if (now - this._lastWipe < 1.1) return;
    this._lastWipe = now;
    try {
      g.player?.wipe?.(point, { duration: 1.0 });
    } catch (e) {
      /* cosmetic */
    }
  }
  /** Wipe condensation at a world point (hand + glass). */
  wipeAt(point, radius = 0.07) {
    const id = g.taxi?.wipeGlassAt(point, radius, 1);
    return id;
  }

  /**
   * Lean in and look closely: a soft focus pull, a slight zoom, the head leans toward it.
   * target: Object3D | Vector3; opts { seconds=1.8, zoom=-14, what, reach=true }
   */
  async inspect(target, opts = {}) {
    if (!this.allow.inspect) return;
    const pos = target?.isVector3 ? target.clone() : target?.getWorldPosition?.(new THREE.Vector3());
    if (!pos) return;
    bus.emit('player:inspect', { what: opts.what || target?.name || '' });
    const rig = g.cameraRig;
    rig.setFocus(pos, 0.6);
    const from = rig.fovOffset;
    const lean = _v.copy(pos).sub(g.engine.camera.position);
    const dist = lean.length();
    const base = rig.base;
    if (base) {
      base.getWorldQuaternion(_q2).invert();
      lean.applyQuaternion(_q2);
    }
    lean.normalize().multiplyScalar(Math.min(0.14, dist * 0.25));
    if (opts.reach !== false && target?.isObject3D) g.player?.reach?.(target, { duration: 0.45, hold: 0.6, press: false });
    const secs = opts.seconds ?? 1.8;
    let tt = 0;
    await new Promise((res) => {
      const off = g.engine.onUpdate((dt) => {
        tt += dt;
        const k = Math.sin(clamp(tt / secs) * Math.PI);
        rig.fovOffset = from + (opts.zoom ?? -14) * k;
        rig.extraOffset.copy(lean).multiplyScalar(k);
        if (tt >= secs) {
          off();
          rig.fovOffset = from;
          rig.extraOffset.set(0, 0, 0);
          res();
        }
      }, 44);
    });
    if (rig.focusTarget === pos) rig.setFocus(null);
  }

  // ------------------------------------------------------------------------- interactables
  _registerInteractables() {
    const t = g.taxi;
    if (!t) return;
    // the amulet on the mirror: look at it and hold
    const ap = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial());
    ap.layers.set(LAYERS.INTERACT);
    ap.position.set(0, -0.08, 0);
    t.anchors.amuletHang.add(ap);
    interact.register({
      id: 'player.amulet', object: ap, labelTH: 'กำพระ', labelEN: 'Hold the amulet', icon: 'pray', reach: 1.0,
      enabled: () => this.enabled && this.allow.amulet && this.inTaxi && !this.busy,
      onUse: () => this.holdAmulet(true, 'interact'),
      onHold: () => {},
      onRelease: () => {
        if (this.amulet.by === 'interact') this.holdAmulet(false);
      },
    });
    // the open driver's doorway: step in
    const dp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.0, 0.9), new THREE.MeshBasicMaterial());
    dp.layers.set(LAYERS.INTERACT);
    dp.position.set(0.62, 0.85, -0.05);
    (t.bodyInner || t.root).add(dp);
    interact.register({
      id: 'player.enterTaxi', object: dp, labelTH: 'ขึ้นรถ', labelEN: 'Get in', icon: 'hand', reach: 1.9,
      enabled: () => this.enabled && this.allow.vehicle && this.onFoot && !this.busy && t.state.doors.fr > 0.5,
      onUse: () => this.enterTaxi(),
    });
  }
}

function localTo(obj, x, y, z, out) {
  obj.updateWorldMatrix(true, false);
  return out.set(x, y, z).applyMatrix4(obj.matrixWorld);
}
function groundAt(x, z) {
  try {
    const y = g.world?.getHeight?.(x, z);
    return Number.isFinite(y) ? y : 0;
  } catch (e) {
    return 0;
  }
}
function taxiYaw() {
  const t = g.taxi;
  t.root.updateWorldMatrix(true, false);
  t.root.getWorldQuaternion(_q);
  _e.setFromQuaternion(_q, 'YXZ');
  return _e.y;
}

/**
 * Draw one side of the rules paper into a fresh canvas (props in cutscenes: the paper left on
 * the driver's seat). extraAnn adds pencil notes, e.g. { 'p:kong': PAPER.successorNote }.
 */
export function paperCanvas(side = 'front', extraAnn = null, w = 768, h = 1056) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const A = ensurePlayerActions();
  const data = A ? A._paperData(side) : { rules: [] };
  if (extraAnn) data.annotations = { ...(data.annotations || {}), ...extraAnn };
  try {
    g.ui.drawRulesPaper(c.getContext('2d', { willReadFrequently: true }), w, h, data);
    if (side === 'back') redInk(c);
  } catch (e) {
    console.warn('[actions] paperCanvas', e);
  }
  return c;
}

/** Install g.actions once (safe to call from anywhere). */
export function ensurePlayerActions() {
  if (!g.actions && g.engine && g.player) {
    g.actions = new PlayerActions().install();
  }
  return g.actions || null;
}

// Installed lazily on the first state change, so it exists before any state's enter() runs.
bus.on('game:state', () => ensurePlayerActions());
