// Ah Kong's chores and rituals "for safety" at the KM 9 garage (data/chores.js has the lines):
//   1 shrine    the spirit house out front: take three sticks, light them at its candle, wai, plant
//               them. Skip a step and the smoke leans the wrong way (into the garage, at you).
//   2 offering  a glass of red soda and a bowl of rice, from the workbench to the gate (later the
//               soda is lower, when nobody was looking)
//   3 cloth     the three-colour cloth strips, tied on the taxi's rear-view mirror
//   4 coins     count the fare tin: there is always one coin more than you counted (an old holed one)
//   5 mirror    cover the old mirror at the back; look into it and a figure stands behind you (a scare)
//   6 phone     the garage phone rings once while he is away; answer and a whisper says "ต้น…"
// Props are small, built from the props kit and real profiles (lathes, traced shapes, swept strips).
//
//   new Chores(stage, { only?: [ids], phone?: bool })
//     .start() (chores become doable) · .done(id) · .requiredDone() · .missing() · .finishRest()
//     .ringPhone() · .update runs on the stage
import * as THREE from 'three';
import { g } from '../context.js';
import { interact } from '../../core/Interact.js';
import { LAYERS } from '../../core/layers.js';
import { clamp, smoothstep, easeInOut, makeRng, noise } from '../../core/math.js';
import { paintedMaterial } from '../../render/index.js';
import { createSpiritHouse } from '../../props/shrines.js';
import { Kit, lathe, tube } from '../../props/lib/kit.js';
import { mat } from '../../props/lib/materials.js';
import { bowl, can } from '../../props/lib/small.js';
import { createHumanoid } from '../../characters/index.js';
import { FONTS } from '../../ui/fonts.js';
import { lm, sfx, ground, runLines, resolve } from './common.js';
import * as D from '../data/chores.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const UP = V(0, 1, 0);
const say = (lines) => runLines(resolve(lines || []));

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

/** The cloth draped over the mirror: a ผ้าขาวม้า (checked cotton) with folds. */
function mirrorCloth(w, h) {
  const NU = 14, NV = 22;
  const geo = new THREE.PlaneGeometry(w + 0.12, h + 0.08, NU, NV);
  geo.translate(0, -(h + 0.08) / 2, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const t = -y / (h + 0.08);
    p.setZ(i, 0.035 + Math.sin(x * 26 + t * 3) * 0.012 * t + noise.noise2D(x * 9, y * 7) * 0.008 + 0.02 * (1 - Math.min(1, Math.abs(x) / (w / 2))) * Math.sin(t * Math.PI));
  }
  geo.computeVertexNormals();
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#5a2a2a';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 32) {
    x.fillStyle = 'rgba(40,70,110,0.55)';
    x.fillRect(i, 0, 12, 256);
    x.fillRect(0, i, 256, 12);
    x.fillStyle = 'rgba(220,200,150,0.35)';
    x.fillRect(i + 18, 0, 3, 256);
    x.fillRect(0, i + 18, 256, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  return new THREE.Mesh(geo, paintedMaterial({ map: tex, roughness: 0.95, brush: 0.5, side: THREE.DoubleSide, name: 'paKhaoMa' }));
}

/** An old wardrobe mirror (arched teak frame) leaning on the back wall; its silvering is dark and dim. */
function oldMirror() {
  const W = 0.6, H = 1.45;
  const arch = (w, h, inset = 0) => {
    const s = new THREE.Shape();
    const hw = w / 2 - inset, top = h - inset - hw * 0.55;
    s.moveTo(-hw, inset);
    s.lineTo(hw, inset);
    s.lineTo(hw, top);
    s.quadraticCurveTo(hw, h - inset, 0, h - inset);
    s.quadraticCurveTo(-hw, h - inset, -hw, top);
    s.closePath();
    return s;
  };
  const frameShape = arch(W, H);
  frameShape.holes.push(arch(W, H, 0.055));
  const grp = new THREE.Group();
  grp.name = 'oldMirror';
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 14 }), paintedMaterial({ color: 0x4a2c1a, map: null, roughness: 0.7, brush: 0.6, dirt: 0.5, name: 'mirrorFrame' }));
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const glassGeo = new THREE.ShapeGeometry(arch(W, H, 0.05), 14);
  const uv = glassGeo.attributes.uv, gp = glassGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, gp.getX(i) / W + 0.5, gp.getY(i) / H);
  const glassMat = paintedMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.1, brush: 0.05, name: 'mirrorGlass' });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.z = 0.03;
  grp.add(frame, glass);
  const draw = (figure) => {
    const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#2a2620');
    gr.addColorStop(0.5, '#141210');
    gr.addColorStop(1, '#0a0908');
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 512);
    // the tube's reflection, the shelves, the open front behind you
    x.fillStyle = 'rgba(220,235,220,0.5)';
    x.fillRect(40, 40, 120, 6);
    x.fillStyle = 'rgba(60,70,60,0.35)';
    x.fillRect(150, 120, 90, 300);
    // Ton's own dark shape, low in the glass
    x.fillStyle = '#060505';
    x.beginPath();
    x.ellipse(128, 300, 30, 36, 0, 0, Math.PI * 2);
    x.moveTo(40, 512);
    x.quadraticCurveTo(60, 360, 128, 350);
    x.quadraticCurveTo(196, 360, 216, 512);
    x.fill();
    if (figure) {
      // someone pale stands right behind his shoulder, hair over the face
      x.fillStyle = 'rgba(200,198,186,0.85)';
      x.beginPath();
      x.moveTo(150, 512);
      x.quadraticCurveTo(160, 330, 190, 300);
      x.quadraticCurveTo(222, 330, 232, 512);
      x.fill();
      x.fillStyle = '#050404';
      x.beginPath();
      x.ellipse(190, 262, 22, 30, 0.05, 0, Math.PI * 2);
      x.fill();
      x.fillRect(170, 262, 40, 120);
      x.fillStyle = 'rgba(210,205,190,0.6)';
      x.fillRect(186, 270, 6, 18);
    }
    // dust and the silvering coming away at the edges
    const rng = makeRng(5);
    for (let i = 0; i < 260; i++) {
      x.fillStyle = `rgba(${rng() < 0.6 ? '180,170,150' : '0,0,0'},${rng() * 0.25})`;
      const px = rng() < 0.5 ? rng() * 30 : 226 + rng() * 30;
      x.fillRect(rng() < 0.7 ? px : rng() * 256, rng() * 512, 2 + rng() * 4, 2 + rng() * 4);
    }
    tex.needsUpdate = true;
  };
  draw(false);
  const cloth = mirrorCloth(W, H);
  cloth.position.set(0, H + 0.02, 0.02);
  cloth.scale.y = 0.14; // folded over the top bar
  grp.add(cloth);
  grp.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
  const center = new THREE.Object3D();
  center.position.set(0, H * 0.55, 0.04);
  grp.add(center);
  return { object: grp, draw, cloth, center, W, H };
}

/** An old black rotary telephone (Thai numerals on the dial), handset on its own pivot. */
function rotaryPhone() {
  const k = new Kit(53, { grime: 0.3, dust: 0.5 });
  const side = new THREE.Shape();
  side.moveTo(-0.1, 0);
  side.lineTo(0.1, 0);
  side.quadraticCurveTo(0.1, 0.05, 0.08, 0.075);
  side.lineTo(0.035, 0.1);
  side.lineTo(-0.05, 0.1);
  side.quadraticCurveTo(-0.1, 0.09, -0.1, 0.05);
  side.closePath();
  const body = new THREE.ExtrudeGeometry(side, { depth: 0.15, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3, curveSegments: 10 });
  body.translate(0, 0, -0.075);
  body.rotateY(-Math.PI / 2);
  k.add(mat('plastic'), body, { color: 0x1a1816, w: { dust: 0.4 } });
  for (const sx of [-1, 1]) k.add(mat('plastic'), lathe([[0, 0], [0.012, 0], [0.01, 0.022], [0.006, 0.026], [0, 0.026]], 10), { p: [sx * 0.06, 0.1, -0.03], color: 0x1a1816 });
  const grp = k.build({ name: 'rotaryPhone' });
  // dial face (canvas: finger holes and Thai digits)
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#e8e0cc';
  x.beginPath();
  x.arc(64, 64, 64, 0, Math.PI * 2);
  x.fill();
  x.font = `700 13px ${FONTS.lcd}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const digits = '๑๒๓๔๕๖๗๘๙๐';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI * 0.35 - (i / 12) * Math.PI * 2;
    x.fillStyle = '#1a1816';
    x.fillText(digits[i], 64 + Math.cos(a) * 34, 64 + Math.sin(a) * 34);
  }
  const dialTex = new THREE.CanvasTexture(c);
  dialTex.colorSpace = THREE.SRGBColorSpace;
  const dialFace = new THREE.Mesh(new THREE.CircleGeometry(0.045, 28), paintedMaterial({ map: dialTex, roughness: 0.5, brush: 0.1, name: 'phoneDial' }));
  const wheel = new THREE.Mesh(lathe([[0.012, 0], [0.05, 0], [0.052, 0.006], [0.046, 0.008], [0.012, 0.007]], 28), paintedMaterial({ color: 0x1c1a18, metalness: 0.2, roughness: 0.35, brush: 0.1, name: 'phoneWheel' }));
  const dial = new THREE.Group();
  wheel.rotation.x = Math.PI / 2;
  dial.add(dialFace, wheel);
  dial.position.set(0, 0.083, 0.062);
  dial.rotation.x = -0.62;
  grp.add(dial);
  // the handset on its cradle
  const hk = new Kit(54, { grime: 0.2 });
  hk.add(mat('plastic'), tube([V(-0.085, 0.012, 0), V(-0.04, 0.026, 0), V(0.04, 0.026, 0), V(0.085, 0.012, 0)], 0.013, 8), { color: 0x1a1816 });
  for (const sx of [-1, 1]) hk.add(mat('plastic'), lathe([[0, 0], [0.026, 0], [0.028, 0.01], [0.018, 0.024], [0, 0.026]], 14), { p: [sx * 0.085, -0.012, 0], color: 0x1a1816 });
  const handset = hk.build({ name: 'handset' });
  handset.position.set(0, 0.125, -0.03);
  grp.add(handset);
  // coiled cord
  class Helix extends THREE.Curve {
    getPoint(t, out = new THREE.Vector3()) {
      const a = V(-0.1, 0.11, -0.03), b = V(-0.11, 0.02, 0.06);
      out.lerpVectors(a, b, t);
      out.y -= Math.sin(t * Math.PI) * 0.05;
      const ph = t * Math.PI * 2 * 24;
      return out.add(V(Math.cos(ph) * 0.006, Math.sin(ph) * 0.006, 0));
    }
  }
  grp.add(new THREE.Mesh(new THREE.TubeGeometry(new Helix(), 360, 0.002, 4, false), paintedMaterial({ color: 0x1a1816, roughness: 0.6, brush: 0.1, name: 'phoneCord' })));
  grp.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
  return { object: grp, handset, home: handset.position.clone() };
}

let ringBuf = null;
function ringBuffer() {
  if (ringBuf) return ringBuf;
  const sr = 22050, len = Math.floor(sr * 1.25);
  try {
    ringBuf = new AudioBuffer({ length: len, sampleRate: sr, numberOfChannels: 1 });
  } catch (e) {
    return null;
  }
  const d = ringBuf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const burst = (t < 0.42 || (t > 0.62 && t < 1.04) ? 1 : 0) * Math.pow(Math.abs(Math.sin(Math.PI * 2 * 21 * t)), 0.6);
    const f = 760;
    d[i] = burst * (Math.sin(t * f * 6.283) * 0.5 + Math.sin(t * f * 2.76 * 6.283) * 0.25 + Math.sin(t * f * 5.4 * 6.283) * 0.1 + Math.sin(t * 940 * 6.283) * 0.3) * 0.55;
  }
  return ringBuf;
}

// ------------------------------------------------------------------------------ the chores
export class Chores {
  constructor(stage, opts = {}) {
    this.stage = stage;
    this.only = opts.only || null;
    this.active = false;
    this.flags = g.save?.flags || (g.save ? (g.save.flags = {}) : {});
    this.held = null;
    this.state = { sticks: 'none', lit: false, waied: false, offering: 'bench', cloth: 'table', phone: 'idle' };
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
    stage.update((dt) => this._update(dt), 52);
    stage.add(() => this._releaseHand());
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
  /** Ah Kong does what is left of the required ones himself. */
  finishRest() {
    if (!this.done('shrine')) this._plantSticks(true, false);
    if (!this.done('offering')) this._placeOffering(true);
    if (!this.done('cloth')) this._tieCloth(true);
    this._dropHeld();
  }

  // ---------------------------------------------------------------- build
  _local(obj, x, y, z, yaw = 0) {
    if (this.go) this.stage.mesh(obj, this.go);
    else this.stage.mesh(obj);
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
    const it = interact.register({ id: 'chore.' + id, object: box, labelTH: th, labelEN: en, icon, reach, enabled: () => !g.actions?.busy && !g.dialogue?.busy && enabled(), onUse });
    this.stage.add(() => {
      interact.unregister(it);
      box.removeFromParent();
      box.geometry.dispose();
    });
    return box;
  }
  _build() {
    const S = this.state;
    const can1 = () => this.active && this.done('shrine');
    if (this.has('shrine')) {
      const sh = createSpiritHouse({ style: 'thai', size: 0.8, seed: 23, offerings: true, age: 0.8 });
      this.shrine = sh;
      this._local(sh.object, 3.55, 0, 4.85, Math.PI + 0.5);
      sh.object.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
      if (sh.candleAnchor) this.stage.light({ kind: 'candle', object: sh.candleAnchor, intensity: 2.2, distance: 3.2, glow: { size: 0.16, opacity: 0.6 } });
      const bundle = incenseSticks(9, 11).object;
      bundle.rotation.set(0, 0.3, Math.PI / 2);
      bundle.position.set(-0.04, 0.012, 0.04);
      (sh.offeringAnchor || sh.object).add(bundle);
      this._item('sticks', sh.offeringAnchor || sh.object, [0, 0.03, 0.04], [0.32, 0.12, 0.14], 'หยิบธูปสามดอก', 'Take three incense sticks', () => this.active && S.sticks === 'none' && !this.held, () => this._takeSticks());
      this._item('light', sh.candleAnchor || sh.object, [0, 0.03, 0], [0.12, 0.14, 0.12], 'จุดธูป', 'Light the incense', () => this.held?.kind === 'sticks' && !S.lit, () => this._lightSticks());
      this._item('wai', sh.object, [0, 1.15, 0.05], [0.5, 0.45, 0.4], 'ไหว้', 'Wai', () => this.held?.kind === 'sticks' && !S.waied && !this._wai, () => this._doWai(), 2.2, 'pray');
      this._item('plant', sh.incenseAnchor || sh.object, [0, 0.04, 0], [0.16, 0.12, 0.16], 'ปักธูป', 'Plant the incense', () => this.held?.kind === 'sticks' && !this._wai, () => this._plantSticks(false));
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
      this.stage.add(() => st.removeFromParent());
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
      this.stage.add(() => tin.removeFromParent());
      this.tin = tin;
      this._item('coins', table, [0.36, 0.05, -0.06], [0.14, 0.12, 0.14], 'นับเหรียญ', 'Count the coins', () => can1() && !this.done('coins') && !this._counting && !this.held, () => this._countCoins());
    }
    if (this.has('mirror')) {
      const m = oldMirror();
      this.mirror = m;
      this._local(m.object, 3.0, 0, -3.28, 0);
      m.object.rotation.x = -0.1;
      this._item('mirror', m.object, [0, m.H * 0.5, 0.06], [m.W, m.H, 0.12], 'คลุมผ้า', 'Cover it with the cloth', () => !this.done('mirror') && !this.held, () => this._coverMirror(false), 2.0);
      if (this.done('mirror')) this._coverMirror(true);
    }
    if (this.has('phone') || (!this.only && this.flags)) {
      const ph = rotaryPhone();
      this.phone = ph;
      this._local(ph.object, -1.06, 0.895, -2.98, 0.35);
      this._item('phone', ph.object, [0, 0.08, 0], [0.26, 0.2, 0.24], 'รับโทรศัพท์', 'Answer the phone', () => this.state.phone === 'ringing', () => this._answer());
    }
  }

  // ---------------------------------------------------------------- flags
  _mark(id, value = 'done', silent = false) {
    if (this.flags['chore.' + id]) return;
    this.flags['chore.' + id] = value;
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
    this.stage.mesh(st.object);
    (this.shrine.offeringAnchor || this.shrine.object).getWorldPosition(_v);
    st.object.position.copy(_v);
    this.state.sticks = 'held';
    this._hold('sticks', st.object, (lift, o, q) => this._pose(0.34 - 0.1 * lift, -0.12 + 0.1 * lift, 0.03 - 0.03 * lift, [0.15 - 0.15 * lift, 0, 0], o, q));
  }
  _lightSticks() {
    const S = this.state;
    S.lit = true;
    sfx('lighter', { object: this.sticks.object, volume: 0.5 });
    this._smoke = this.stage.emit('incense', { object: this.sticks.tipAnchor, count: 34, intensity: 0.7 });
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
  }
  _plantSticks(instant, wrong = null, quiet = false) {
    const S = this.state;
    const sh = this.shrine;
    if (!sh) return;
    if (!this.sticks) {
      this.sticks = incenseSticks(3, 5);
      this.stage.mesh(this.sticks.object);
    }
    const bad = wrong ?? !(S.lit && S.waied);
    const st = this.sticks;
    if (this.held?.kind === 'sticks') this._dropHeld();
    const pot = sh.incenseAnchor || sh.object;
    pot.attach(st.object);
    st.object.position.set(0, -0.02, 0);
    st.object.quaternion.identity();
    st.object.rotation.set(0, 0, 0.05);
    st.tipMat.emissiveIntensity = 2.2;
    if (!this._smoke) this._smoke = this.stage.emit('incense', { object: st.tipAnchor, count: 34, intensity: 0.75 });
    S.sticks = 'planted';
    this._wrongSmoke = bad;
    if (bad) {
      if (!instant) sfx('sting_low', { volume: 0.4 });
      this.flags['k.shrineWrong'] = (this.flags['k.shrineWrong'] || 0) + (quiet ? 0 : 1);
    }
    if (!quiet) this._mark('shrine', bad ? 'wrong' : 'done', instant);
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
    const gy = ground(...(() => {
      T.object.getWorldPosition(_v);
      return [_v.x, _v.z];
    })());
    T.object.getWorldPosition(_v);
    T.object.position.y += gy - _v.y + 0.005;
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
    this.stage.add(() => {
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

  // ---------------------------------------------------------------- 5 the mirror
  _coverMirror(instant) {
    const M = this.mirror;
    if (!M) return;
    M.covered = true;
    if (instant) M.cloth.scale.y = 1;
    else {
      M.clothT = 0;
      sfx('paper_rustle', { object: M.object, volume: 0.6, rate: 0.55 });
    }
    this._mark('mirror', 'done', instant);
  }
  _mirrorScare() {
    const M = this.mirror;
    M.scared = true;
    this.flags['k.mirrorLooked'] = (this.flags['k.mirrorLooked'] || 0) + 1;
    try {
      g.persist?.();
    } catch (e) {
      /* ignore */
    }
    M.draw(true);
    sfx('sting_reveal', { volume: 0.7 });
    sfx('breath_neck', { volume: 0.5, delay: 0.3 });
    g.camfx?.flinch?.(0.7);
    const h = this._figure;
    if (h) {
      const p = g.player.root.position;
      const back = _v.copy(g.cameraRig.lookDirection).setY(0).normalize().multiplyScalar(-1.25).add(p);
      back.y = ground(back.x, back.z);
      h.root.position.copy(back);
      h.root.rotation.y = Math.atan2(p.x - back.x, p.z - back.z) + Math.PI;
      h.root.visible = true;
      h.lookAt?.(g.player.eye, { weight: 1, speed: 4 });
    }
    M.scareT = 0;
    say(D.MIRROR_SCARE.ton);
  }
  _endScare() {
    const M = this.mirror;
    M.scareT = null;
    M.draw(false);
    if (this._figure) this._figure.root.visible = false;
    g.cine?.fade?.(0.85, 0.05).then(() => g.cine.fade(0, 0.3));
    sfx('fluorescent_flicker', { volume: 0.4 });
    if (this.active && g.ahKong?.root?.visible) say(D.MIRROR_SCARE.kong);
  }
  _makeFigure() {
    if (this._figure || this._figureTried) return;
    this._figureTried = true;
    try {
      const h = createHumanoid({
        id: 'mirrorFigure', sex: 'f', age: 30, height: 1.6, build: 'thin', skinTone: 0.12,
        hair: { style: 'long', color: '#0a0909' },
        outfit: { type: 'dress', top: '#c4c0b4', bottom: '#b8b4a8', accent: '#1d1a18', shoes: 'barefoot' },
        face: { seed: 4441, wrinkles: 0, smile: 0, eyeSize: 1.1, noseWidth: 0.95, jaw: 0.9, cheek: 0.9 },
        ghost: { pale: 1, eyes: 'black', wet: 0.4, decay: 0.3, bloodStains: 0.1 },
        noBlink: true,
      });
      g.engine.scene.add(h.root);
      h.root.visible = false;
      h.setMode?.('stand');
      h.setGhost?.({ stare: 1, noBlink: 1, unlimited: 1, headRoll: 0.3 }, 50);
      this._figure = h;
      this.stage.add(() => {
        try {
          h.dispose();
        } catch (e) {
          h.root.removeFromParent();
        }
      });
    } catch (e) {
      console.warn('[chores] mirror figure', e);
    }
  }

  // ---------------------------------------------------------------- 6 the phone
  ringPhone() {
    if (!this.phone || this.state.phone !== 'idle') return;
    this.state.phone = 'ringing';
    this._ringT = 0;
    this._rings = 0;
  }
  async _answer() {
    if (this.state.phone !== 'ringing') return;
    this.state.phone = 'call';
    const P = this.phone;
    sfx('switch_click', { object: P.object, volume: 0.4 });
    this.flags.phoneAnswered = true;
    this.flags['k.phoneAnswered'] = true;
    this.flags['k.phoneCalls'] = (this.flags['k.phoneCalls'] || 0) + 1;
    try {
      g.persist?.();
    } catch (e) {
      /* ignore */
    }
    g.player?.reach?.(P.handset, { hand: 'R', duration: 0.4, hold: 5.5, press: false });
    P.lift = 0;
    const hiss = g.audio?.loop?.('radio_static', { volume: 0.12 });
    try {
      await say(D.PHONE_CALL.hello);
      await new Promise((r) => setTimeout(r, 1200));
      await say(D.PHONE_CALL.whisper);
      await new Promise((r) => setTimeout(r, 500));
    } finally {
      hiss?.stop?.(0.05);
      sfx('switch_click', { volume: 0.5, rate: 0.8 });
      this.state.phone = 'done';
    }
    await say(D.PHONE_CALL.after);
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
    const sm = this._smoke?.object?.material?.uniforms?.uWindV;
    if (sm) {
      if (this._wrongSmoke) {
        const toward = _v.copy(g.player?.root?.position || _v).sub(this.sticks.tipAnchor.getWorldPosition(_v2)).setY(0).normalize();
        sm.value.set(toward.x * 1.4, toward.z * 1.4);
      } else if (this.state.sticks === 'planted') sm.value.set(0, 0);
    }
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
    // the mirror: the cloth falls, the gaze, the figure
    const M = this.mirror;
    if (M) {
      if (M.clothT !== undefined && M.clothT !== null) {
        M.clothT += dt;
        M.cloth.scale.y = 0.14 + 0.86 * easeInOut(clamp(M.clothT / 0.6));
        if (M.clothT > 0.6) M.clothT = null;
      }
      const c = M.center.getWorldPosition(_v);
      const near = g.player?.root?.position?.distanceTo(c) ?? 99;
      if (near < 7) this._makeFigure();
      if (!M.covered && !M.scared && g.actions?.onFoot && g.cameraRig.isLookingAt(c, 11, 4.5) && !g.cameraRig.inCinematic) {
        M.gaze = (M.gaze || 0) + dt;
        if (M.gaze > 1.6) this._mirrorScare();
      } else M.gaze = Math.max(0, (M.gaze || 0) - dt * 0.5);
      if (M.scareT !== null && M.scareT !== undefined) {
        M.scareT += dt;
        const f = this._figure;
        const seen = f && g.cameraRig.isLookingAt(f.root.position.clone().add(V(0, 1.4, 0)), 25, 6);
        if (M.scareT > (seen ? 0.35 : 6) || (seen && M.scareT > 0.6)) this._endScare();
      }
    }
    // the phone: a few double rings, then nothing
    if (this.state.phone === 'ringing') {
      this._ringT -= dt;
      if (this._ringT <= 0) {
        if (this._rings >= 4) {
          this.state.phone = 'done';
          this.flags.phoneIgnored = true;
        } else {
          this._rings++;
          this._ringT = 3;
          const buf = ringBuffer();
          try {
            if (buf && g.audio?.playBuffer) g.audio.playBuffer(buf, { object: this.phone.object, volume: 0.75, bus: 'sfx' });
            else sfx('indicator_tick', { object: this.phone.object, volume: 0.6, count: 8, interval: 0.05 });
          } catch (e) {
            /* audio optional */
          }
          this.phone.handset.position.y = this.phone.home.y + 0.002;
        }
      } else this.phone.handset.position.y = this.phone.home.y + (this._ringT > 2.0 ? Math.abs(Math.sin(t * 130)) * 0.0015 : 0);
    }
    if (this.phone && this.state.phone === 'call') {
      const P = this.phone;
      P.lift = Math.min(1, (P.lift || 0) + dt / 0.5);
      P.handset.position.y = P.home.y + 0.12 * easeInOut(P.lift);
      P.handset.rotation.x = -0.5 * P.lift;
    } else if (this.phone && this.state.phone === 'done' && this.phone.lift) {
      const P = this.phone;
      P.lift = Math.max(0, P.lift - dt / 0.4);
      P.handset.position.y = P.home.y + 0.12 * easeInOut(P.lift);
      P.handset.rotation.x = -0.5 * P.lift;
    }
  }
}
