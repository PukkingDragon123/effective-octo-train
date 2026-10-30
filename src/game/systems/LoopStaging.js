// LoopStaging: what the KM 9 garage (and the taxi's dash) look like on loop N, from
// data.loop.LOOP_STAGING, plus the one déjà-vu thought per restart (data.loop.DEJA_VU).
//   LoopStaging.apply(loops)  -> stages the garage for this night (idempotent; replaces the last one)
//   LoopStaging.update(dt)    -> déjà-vu triggers + the garage radio hand-over (call while in the garage)
//   LoopStaging.notify(trigger) -> fire a trigger yourself ('enterTaxi', ...)
//   LoopStaging.clearGarage() -> remove the garage dressing (keeps the dash tally: it is part of the taxi)
//   LoopStaging.tallyAnchor   -> Object3D of the scratch tally (gaze target)
import * as THREE from 'three';
import { g } from '../context.js';
import { paintedMaterial } from '../../render/index.js';
import { makeRng } from '../../core/math.js';
import { runLines, resolve, lm, wpos } from '../opening/common.js';

const _v = new THREE.Vector3();

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Key scratches in the dash vinyl: groups of five, pale and fresh; worn older ones beneath. */
function tallyTexture(marks, older) {
  return canvasTex(512, 220, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const rng = makeRng(1441);
    const stroke = (x0, y0, x1, y1, a, wdt, col) => {
      ctx.strokeStyle = col;
      ctx.globalAlpha = a;
      ctx.lineWidth = wdt;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      const n = 5;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        ctx.lineTo(x0 + (x1 - x0) * t + (rng() - 0.5) * 1.6, y0 + (y1 - y0) * t + (rng() - 0.5) * 1.6);
      }
      ctx.stroke();
    };
    const group = (count, x, y, sc, a, col, worn) => {
      for (let i = 0; i < Math.min(4, count); i++) {
        const xx = x + i * 13 * sc + (rng() - 0.5) * 2;
        stroke(xx, y + (rng() - 0.5) * 3, xx + (rng() - 0.5) * 5, y + 54 * sc + (rng() - 0.5) * 3, a * (worn ? 0.5 + rng() * 0.4 : 1), worn ? 1.4 : 2.4, col);
        if (!worn) stroke(xx + 1.2, y + 2, xx + 0.4 + (rng() - 0.5) * 5, y + 50 * sc, a * 0.45, 1, '#2a2622');
      }
      if (count >= 5) stroke(x - 6 * sc, y + 44 * sc, x + 52 * sc, y + 10 * sc, a * (worn ? 0.6 : 1), worn ? 1.4 : 2.4, col);
    };
    // the ninety-nine older ones (another hand, worn almost smooth)
    if (older > 0) {
      let left = older;
      let gx = 10, gy = 12;
      while (left > 0) {
        group(Math.min(5, left), gx, gy, 0.55, 0.5, '#bdb3a0', true);
        left -= 5;
        gx += 38;
        if (gx > w - 40) {
          gx = 10 + rng() * 8;
          gy += 40;
          if (gy > h - 40) gy = 14 + rng() * 10;
        }
      }
    }
    // fresh marks: pale vinyl dust in the cut
    let left = marks;
    let gx = 22, gy = h - 90;
    while (left > 0) {
      group(Math.min(5, left), gx, gy, 1, 0.95, '#e8e0cf', false);
      left -= 5;
      gx += 74;
      if (gx > w - 70) {
        gx = 26;
        gy -= 66;
      }
    }
  });
}

/** Pencil ticks and red circles over the garage calendar (September). */
function calendarTexture(entry, loops) {
  return canvasTex(256, 362, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const rng = makeRng(914 + loops);
    // the month grid on the printed calendar: 7 columns, 5 rows in the lower 55%
    const cell = (day) => {
      const first = 3; // September starts on a Wednesday on this old calendar
      const i = day - 1 + first;
      const col = i % 7;
      const row = Math.floor(i / 7);
      return { x: 22 + col * ((w - 44) / 7) + (w - 44) / 14, y: h * 0.47 + row * (h * 0.48 / 5) + h * 0.045 };
    };
    const circle = (day, a, fresh) => {
      const c = cell(day);
      ctx.strokeStyle = fresh ? '#c21a12' : '#9a1e16';
      ctx.globalAlpha = a;
      ctx.lineWidth = fresh ? 2.6 : 2.0;
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const t = (k / 24) * Math.PI * 2.15 + rng() * 0.05;
        const r = 12 + Math.sin(t * 3) * 0.8 + rng() * 0.6;
        const x = c.x + Math.cos(t) * r * 1.15, y = c.y + Math.sin(t) * r;
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    };
    const circled = entry?.circled === 'all' ? Array.from({ length: 30 }, (_, i) => i + 1) : entry?.circled || [];
    for (const d of circled) if (d !== 14) circle(d, 0.8, true);
    // pencil ticks beside the 14: one per night lived
    const ticks = entry?.pencilTicks === 'loops' ? loops : 0;
    if (ticks > 0) {
      const c = cell(14);
      ctx.strokeStyle = '#3a3c42';
      ctx.lineWidth = 1.3;
      for (let i = 0; i < Math.min(ticks, 40); i++) {
        const x = c.x + 18 + (i % 10) * 4.2;
        const y = c.y - 14 + Math.floor(i / 10) * 13;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rng() - 0.5) * 1.5, y + 9);
        ctx.stroke();
      }
    }
  });
}

function overlayPlane(tex, w, h) {
  const m = paintedMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.9, brush: 0.1, wet: 0, puddles: 0, envReflect: 0, name: 'loopOverlay' });
  m.userData.ownedByStage = true;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.renderOrder = 2;
  return mesh;
}

/** A small cigarette resting on the ashtray, with or without its long grey ash. */
export function cigaretteMesh(state) {
  const grp = new THREE.Group();
  const paper = paintedMaterial({ color: 0xe8e2d4, roughness: 0.8, brush: 0.3, wet: 0 });
  const filt = paintedMaterial({ color: 0xc08a4a, roughness: 0.85, brush: 0.4, wet: 0 });
  const ash = paintedMaterial({ color: 0x8a8682, roughness: 1, brush: 0.9, wet: 0 });
  const ember = paintedMaterial({ color: 0x401008, emissive: 0xff5a18, emissiveIntensity: 2.2, roughness: 1 });
  for (const m of [paper, filt, ash, ember]) m.userData.ownedByStage = true;
  const len = state === 'fresh' ? 0.07 : 0.036;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, len, 10), paper);
  body.rotation.z = Math.PI / 2;
  body.position.x = len / 2;
  const f = new THREE.Mesh(new THREE.CylinderGeometry(0.0039, 0.0039, 0.02, 10), filt);
  f.rotation.z = Math.PI / 2;
  f.position.x = -0.01;
  grp.add(body, f);
  if (state !== 'fresh') {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.0036, 0.0034, 0.024, 8), ash);
    a.rotation.z = Math.PI / 2 - 0.03;
    a.position.x = len + 0.012;
    grp.add(a);
  }
  const e = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 8, 6), ember);
  e.position.x = len + (state !== 'fresh' ? 0.025 : 0.001);
  grp.add(e);
  grp.userData.tip = e;
  grp.rotation.z = 0.12;
  return grp;
}

/** Glass of tea (Thai-Chinese: amber in a small tumbler). */
export function teaMesh(drunk = false) {
  const grp = new THREE.Group();
  const glass = paintedMaterial({ color: 0xd8e2e0, transparent: true, opacity: 0.32, roughness: 0.1, metalness: 0, brush: 0.05, wet: 0, depthWrite: false });
  const tea = paintedMaterial({ color: 0x8a3a0e, roughness: 0.2, brush: 0.1, wet: 0, emissive: 0x2a0a00, emissiveIntensity: 0.4 });
  glass.userData.ownedByStage = tea.userData.ownedByStage = true;
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.026, 0), new THREE.Vector2(0.029, 0.004), new THREE.Vector2(0.033, 0.085), new THREE.Vector2(0.031, 0.085), new THREE.Vector2(0.027, 0.006), new THREE.Vector2(0, 0.006)];
  grp.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 18), glass));
  const lvl = drunk ? 0.022 : 0.068;
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.0285 + lvl * 0.04, 0.0265, lvl, 16), tea);
  liquid.position.y = 0.006 + lvl / 2;
  grp.add(liquid);
  return grp;
}

class LoopStagingImpl {
  constructor() {
    this.loops = 0;
    this.garageItems = [];
    this.tallyMesh = null;
    this.tallyAnchor = null;
    this.dejaVuDone = false;
    this.radioOn = false;
    this.cigTip = null;
    this.dogEntity = null;
    this._dejaT = {};
  }

  /** Stage the garage for `loops` deaths so far. */
  apply(loops = g.save?.loops || 0) {
    this.loops = loops;
    this.clearGarage();
    this.dejaVuDone = false;
    this._dejaT = {};
    const L = g.data?.logic;
    const ST = g.data?.loop?.LOOP_STAGING || {};
    const by = (t) => (L?.byLoop ? L.byLoop(t, loops) : null);
    try {
      this._tally(by(ST.tally), loops);
    } catch (e) {
      console.warn('[loop] tally', e);
    }
    const G = lm('garage');
    if (!G) return this;
    const A = G.anchors || {};
    try {
      this._calendar(A.calendarAnchor, by(ST.calendar), loops);
    } catch (e) {
      console.warn('[loop] calendar', e);
    }
    const ak = by(ST.ahKong) || { cigarette: 'fresh' };
    try {
      if (A.ashtrayAnchor && loops >= 1) {
        const cig = cigaretteMesh(ak.cigarette);
        cig.position.set(0.0, 0.018, 0.0);
        A.ashtrayAnchor.add(cig);
        this.garageItems.push(() => cig.removeFromParent());
        this.cigTip = cig.userData.tip;
        const sm = g.particles.emit('incense', { object: cig.userData.tip, count: 40, intensity: 0.7 });
        this.garageItems.push(() => sm.dispose());
      }
      if (A.tableAnchor && ak.tea) {
        const tea = teaMesh(false);
        tea.position.set(0.22, 0.0, 0.12);
        A.tableAnchor.add(tea);
        this.garageItems.push(() => tea.removeFromParent());
      }
    } catch (e) {
      console.warn('[loop] ahKong props', e);
    }
    this.ahKongStaging = ak;
    // the radio, already playing, the same song from the same line
    this.radioEntry = by(ST.radio) || { on: false };
    this.radioOn = false;
    if (this.radioEntry.on && A.radioAnchor) this._radioOn(A.radioAnchor, this.radioEntry);
    // the dog
    this.dogEntry = by(ST.dog) || { pose: 'asleep' };
    this._dog(A, this.dogEntry);
    // the gecko, seven calls at nine o'clock
    try {
      const gp = wpos(A.calendarAnchor || G.anchors?.lampAnchor || null, new THREE.Vector3());
      gp.y += 0.6;
      g.audio?.play('gecko', { position: gp, count: (by(ST.gecko)?.calls ?? 7), interval: 0.85, delay: 2.5, volume: 0.9 });
    } catch (e) {
      /* audio optional */
    }
    return this;
  }

  _tally(entry, loops) {
    const t = g.taxi;
    if (!t) return;
    if (this.tallyMesh) {
      this.tallyMesh.removeFromParent();
      this.tallyMesh.geometry.dispose();
      this.tallyMesh.material.map?.dispose();
      this.tallyMesh.material.dispose();
      this.tallyMesh = null;
    }
    const marks = entry?.marks === 'loops' ? loops : Number(entry?.marks) || 0;
    if (marks <= 0 && !entry?.olderMarks) return;
    const tex = tallyTexture(marks, entry?.olderMarks || 0);
    const mesh = overlayPlane(tex, 0.105, 0.045);
    const parent = t.parts?.stickerAnchor || t.anchors.dashSticker;
    // beside the faded blue elephant (sticker plane: XY, facing +Z toward the cabin)
    mesh.position.set(0.085, -0.004, 0.0016);
    mesh.rotation.z = 0.12;
    parent.add(mesh);
    this.tallyMesh = mesh;
    this.tallyAnchor = mesh;
  }

  _calendar(anchor, entry, loops) {
    if (!anchor || !entry) return;
    const needs = (entry.circled && (entry.circled === 'all' || entry.circled.length > 1)) || entry.pencilTicks;
    if (!needs) return;
    const tex = calendarTexture(entry, loops);
    const mesh = overlayPlane(tex, 0.5, 0.708);
    mesh.position.set(0, 0, 0.004);
    mesh.rotation.z = 0.02;
    anchor.add(mesh);
    this.garageItems.push(() => {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      tex.dispose();
      mesh.material.dispose();
    });
  }

  _radioOn(anchor, entry) {
    const radio = g.audio?.radio;
    if (!radio) return;
    try {
      radio.attach(anchor);
      radio.setHour?.(21);
      radio.setStation(entry.station || 1, { sweep: false, force: true });
      radio.setOn(true);
      this.radioOn = true;
      this.garageItems.push(() => this.radioOff());
    } catch (e) {
      console.warn('[loop] radio', e);
    }
  }
  /** The garage radio falls silent and the taxi takes the radio back. */
  radioOff() {
    if (!this.radioOn) return;
    this.radioOn = false;
    const radio = g.audio?.radio;
    try {
      radio?.setOn(false);
      if (g.taxi) {
        // the taxi re-attaches the shared radio voice to its own dashboard next frame
        g.taxi._radioAttached = null;
        g.taxi._radioWas = undefined;
      }
    } catch (e) {
      /* ignore */
    }
  }

  async _dog(A, entry) {
    if (!entry || entry.pose === 'gone' || !A.dogBowlAnchor) return;
    const gen = (this._gen = (this._gen || 0) + 1);
    let mod = null;
    try {
      mod = await import('../../creatures/index.js');
    } catch (e) {
      return;
    }
    if (gen !== this._gen) return; // restaged meanwhile
    if (typeof mod.createAnimal !== 'function') return; // no proper dog yet: better none than a box
    try {
      const dog = mod.createAnimal('dog', { seed: 9 });
      const p = wpos(A.dogBowlAnchor, new THREE.Vector3());
      p.x += 0.5;
      g.engine.scene.add(dog.root);
      try {
        dog.setGroundFn?.((x, z) => g.world?.getHeight?.(x, z) ?? p.y);
      } catch (e) {
        /* optional */
      }
      if (dog.place) dog.place(p, Math.PI * 0.3);
      else {
        dog.root.position.copy(p);
        dog.root.rotation.y = Math.PI * 0.3;
      }
      dog.setPose?.(entry.pose === 'watching' ? 'lieAlert' : 'sleep');
      dog.setGait?.(entry.pose === 'watching' ? 'lieAlert' : 'sleep');
      this.dogEntity = dog;
      this.dogPos = p;
      const off = g.engine.onUpdate((dt) => dog.update?.(dt), 20);
      this.garageItems.push(() => {
        off();
        dog.dispose?.();
        this.dogEntity = null;
      });
    } catch (e) {
      console.warn('[loop] dog', e);
    }
  }

  clearGarage() {
    this._gen = (this._gen || 0) + 1;
    for (const f of this.garageItems.splice(0).reverse()) {
      try {
        f();
      } catch (e) {
        /* ignore */
      }
    }
    this.cigTip = null;
  }

  /** Fire a déjà-vu trigger now (at most one thought per restart). */
  notify(trigger) {
    if (this.dejaVuDone || this.loops < 1) return null;
    if (g.dialogue?.busy) return null; // never talk over someone (it would cut their line)
    const list = g.data?.loop?.DEJA_VU || [];
    const hit = list.find((d) => d.trigger === trigger && this.loops >= d.minLoop && this.loops <= (d.maxLoop ?? 99));
    if (!hit) return null;
    this.dejaVuDone = true;
    return runLines(resolve(hit.lines));
  }

  /** Call every frame while Ton is around the garage / taxi. */
  update(dt) {
    if (this.loops < 1 || this.dejaVuDone) {
      this._radioHandover();
      return;
    }
    const cam = g.engine.camera.position;
    const rig = g.cameraRig;
    const G = lm('garage');
    const A = G?.anchors || {};
    const T = this._dejaT;
    const gazeAt = (obj, key, secs, deg = 9, dist = 6) => {
      if (!obj) return false;
      const p = obj.isVector3 ? obj : wpos(obj, _v);
      if (rig.isLookingAt(p, deg, dist)) T[key] = (T[key] || 0) + dt;
      else T[key] = 0;
      return T[key] >= secs;
    };
    if (this.tallyAnchor && gazeAt(this.tallyAnchor, 'tally', 0.8, 10, 1.6)) this.notify('seeTally');
    else if (this.radioOn && A.radioAnchor && wpos(A.radioAnchor, _v).distanceTo(cam) < 6) this.notify('garageRadio');
    else if (A.calendarAnchor && gazeAt(A.calendarAnchor, 'cal', 1.0, 8, 7)) this.notify('calendar');
    else if (A.dogBowlAnchor && gazeAt(this.dogPos || A.dogBowlAnchor, 'dog', 0.8, 10, 8)) this.notify('dog');
    this._radioHandover();
  }

  _radioHandover() {
    // once Ton sits in the taxi the garage radio falls silent
    if (this.radioOn && g.player?.vehicle === g.taxi) this.radioOff();
  }
}

export const LoopStaging = new LoopStagingImpl();
export default LoopStaging;
