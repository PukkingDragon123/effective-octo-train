// A bag of crisps on Ah Kong's table (first night, waiting for him): a crinkled foil pillow bag
// (crimped seals, wrinkles, an original label: กรุบกรอบ รสสาหร่าย), picked up with interact and held
// low in view (Ton's right hand reaches for it and stays on it); each further interact eats one:
// the bag comes up to the mouth, a crisp goes in, a crunch (synthesised: dry cracks + the jaw) and
// a few crumbs fall to the floor.
//
//   createChips(stage, { position, yaw, enabled }) -> { state 'table'|'held'|'gone', eaten, lastEatAt, putAway() }
import * as THREE from 'three';
import { g } from '../context.js';
import { input } from '../../core/Input.js';
import { interact } from '../../core/Interact.js';
import { LAYERS } from '../../core/layers.js';
import { clamp, smoothstep, easeInOut, makeRng, noise } from '../../core/math.js';
import { paintedMaterial } from '../../render/index.js';
import { FONTS } from '../../ui/fonts.js';
import { sfx, ground } from './common.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const BAG = { w: 0.15, h: 0.21, t: 0.027 };

/** The pillow bag: two crinkled foil faces that meet at the side folds and the crimped seals. */
function bagGeometry() {
  const NU = 18, NV = 24;
  const pos = [], uv = [], idx = [];
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let j = 0; j <= NV; j++) {
      const v = (j / NV) * 2 - 1;
      const seal = smoothstep(0.8, 0.9, Math.abs(v));
      for (let i = 0; i <= NU; i++) {
        const u = (i / NU) * 2 - 1;
        const puff = Math.pow(Math.max(0, 1 - u * u), 0.55) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(v) / 0.86, 6)), 0.5) * (1 - seal);
        const x = u * (BAG.w / 2) * (1 - 0.07 * puff) * (1 + 0.05 * seal);
        const y = v * (BAG.h / 2);
        let z = side * BAG.t * puff;
        z += side * 0.0022 * noise.noise2D(u * 5 + side * 7, v * 6.5) * puff; // crinkles
        z += side * 0.0011 * noise.noise2D(u * 17, v * 19 + side) * puff;
        if (seal > 0) z += 0.0011 * Math.sin(u * 70) * seal; // the crimp, one sheet
        pos.push(x, y, z);
        uv.push(((u + 1) / 2) * 0.5 + (side < 0 ? 0.5 : 0), (v + 1) / 2);
      }
    }
    for (let j = 0; j < NV; j++)
      for (let i = 0; i < NU; i++) {
        const a = base + j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1;
        if (side > 0) idx.push(a, b, d, a, d, c);
        else idx.push(a, d, b, a, c, d);
      }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Label art: an original fictional brand on green foil (front) and the small print (back). */
function bagTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 360;
  const x = c.getContext('2d');
  const rng = makeRng(2468);
  for (const ox of [0, 256]) {
    const gr = x.createLinearGradient(ox, 0, ox + 256, 360);
    gr.addColorStop(0, ox ? '#2c6a3e' : '#1d5a32');
    gr.addColorStop(0.5, ox ? '#3c8450' : '#2f7d45');
    gr.addColorStop(1, '#174a2a');
    x.fillStyle = gr;
    x.fillRect(ox, 0, 256, 360);
    // foil crinkle glints
    for (let i = 0; i < 70; i++) {
      x.strokeStyle = `rgba(230,255,235,${0.04 + rng() * 0.1})`;
      x.lineWidth = 0.6 + rng() * 1.6;
      const px = ox + rng() * 256, py = rng() * 360;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (rng() - 0.5) * 50, py + (rng() - 0.5) * 30);
      x.stroke();
    }
    // silver seal bands
    for (const y0 of [0, 324]) {
      x.fillStyle = '#b9bdb4';
      x.fillRect(ox, y0, 256, 36);
      x.fillStyle = 'rgba(60,60,60,0.35)';
      for (let k = 0; k < 64; k++) x.fillRect(ox + k * 4, y0, 1.5, 36);
    }
  }
  // front: a painted heap of crisps, the name, the flavour ribbon
  for (let i = 0; i < 16; i++) {
    const cx = 128 + (rng() - 0.5) * 150, cy = 222 + (rng() - 0.3) * 50;
    x.save();
    x.translate(cx, cy);
    x.rotate(rng() * 3);
    const gg = x.createRadialGradient(-6, -4, 2, 0, 0, 30);
    gg.addColorStop(0, '#f6d27a');
    gg.addColorStop(1, '#b97c2a');
    x.fillStyle = gg;
    x.beginPath();
    x.ellipse(0, 0, 26 + rng() * 10, 15 + rng() * 6, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(40,70,30,0.55)';
    for (let k = 0; k < 5; k++) x.fillRect((rng() - 0.5) * 30, (rng() - 0.5) * 14, 3, 2); // seaweed flecks
    x.restore();
  }
  x.textAlign = 'center';
  x.lineJoin = 'round';
  x.font = `700 58px ${FONTS.sign}`;
  x.lineWidth = 9;
  x.strokeStyle = '#3a1a08';
  x.strokeText('กรุบกรอบ', 128, 108);
  x.fillStyle = '#ffd23a';
  x.fillText('กรุบกรอบ', 128, 108);
  x.fillStyle = '#c42a1e';
  x.beginPath();
  x.moveTo(36, 128);
  x.lineTo(220, 128);
  x.lineTo(208, 150);
  x.lineTo(220, 172);
  x.lineTo(36, 172);
  x.lineTo(48, 150);
  x.closePath();
  x.fill();
  x.font = `700 30px ${FONTS.sign}`;
  x.fillStyle = '#fff6e0';
  x.fillText('รสสาหร่าย', 128, 162);
  x.font = `700 20px ${FONTS.sign}`;
  x.fillStyle = '#f2ead2';
  x.fillText('๓๕ กรัม', 206, 310);
  // back: small print
  x.textAlign = 'left';
  x.fillStyle = 'rgba(240,240,225,0.85)';
  x.font = `700 18px ${FONTS.sign}`;
  x.fillText('ส่วนประกอบ', 276, 66);
  for (let r = 0; r < 11; r++) {
    x.fillStyle = 'rgba(235,240,225,0.55)';
    x.fillRect(276, 84 + r * 16, 120 + rng() * 90, 5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // owner: the pack shows a REAL photo (the CC0 stock snack-bag print), not a painted one.
  // Front and back panels get the photo between the crimped silver seals; the painted
  // version above only shows until the image arrives.
  const img = new Image();
  img.onload = () => {
    for (const ox of [0, 256]) {
      x.save();
      x.beginPath();
      x.rect(ox, 36, 256, 288);
      x.clip();
      const s = Math.max(256 / img.width, 288 / img.height);
      const w = img.width * s, h = img.height * s;
      x.drawImage(img, ox + (256 - w) / 2, 36 + (288 - h) / 2, w, h);
      if (ox) {
        x.fillStyle = 'rgba(10,10,10,0.35)'; // the back panel sits a little darker
        x.fillRect(ox, 36, 256, 288);
      }
      x.restore();
    }
    tex.needsUpdate = true;
  };
  img.src = 'assets/textures/printed/snack_bag__corn.webp';
  return tex;
}

/** One crisp: an irregular wavy disc, bent like a potato slice in hot oil. */
function crispGeometry(r = 0.021, seed = 5) {
  const N = 16;
  const pos = [0, 0, 0.002], idx = [];
  const rng = makeRng(seed);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const rr = r * (0.84 + 0.3 * rng());
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.86;
    pos.push(px, py, (0.006 * (px * px - py * py)) / (r * r) + 0.0016 * Math.sin(a * 5));
  }
  for (let i = 0; i < N; i++) idx.push(0, 1 + i, 1 + ((i + 1) % N));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------------------ the crunch
let crunchBufs = null;
function crunchBuffers() {
  if (crunchBufs) return crunchBufs;
  crunchBufs = [];
  const sr = 44100;
  for (let n = 0; n < 3; n++) {
    const len = Math.floor(sr * 0.28);
    let b;
    try {
      b = new AudioBuffer({ length: len, sampleRate: sr, numberOfChannels: 1 });
    } catch (e) {
      return crunchBufs;
    }
    const d = b.getChannelData(0);
    const rng = makeRng(311 + n * 17);
    for (let c = 0; c < 30 + n * 6; c++) {
      const t0 = Math.floor(Math.pow(rng(), 1.7) * len * 0.75);
      const amp = (0.25 + rng() * 0.75) * (1 - t0 / len);
      const dec = sr * (0.0007 + rng() * 0.0035);
      const f = (1800 + rng() * 4500) / sr * Math.PI * 2;
      for (let j = 0; j < dec * 5 && t0 + j < len; j++) d[t0 + j] += ((rng() * 2 - 1) * 0.8 + Math.sin(j * f) * 0.4) * amp * Math.exp(-j / dec);
    }
    for (let j = 0; j < sr * 0.06; j++) d[j] += Math.sin((j / sr) * Math.PI * 2 * 130) * Math.exp(-j / (sr * 0.016)) * 0.3; // the jaw
    let px = 0, py = 0;
    for (let j = 0; j < len; j++) {
      const y = 0.86 * (py + d[j] - px);
      px = d[j];
      py = y;
      d[j] = y * 0.85;
    }
    crunchBufs.push(b);
  }
  return crunchBufs;
}
function crunch(volume) {
  try {
    const B = crunchBuffers();
    if (B.length && g.audio?.playBuffer) return g.audio.playBuffer(B[Math.floor(Math.random() * B.length)], { volume, rate: 0.9 + Math.random() * 0.25, bus: 'sfx' });
  } catch (e) {
    /* fall through */
  }
  return sfx('branch_crack', { volume: volume * 0.25, rate: 2.4 });
}

// ------------------------------------------------------------------------------ the bag
export function createChips(stage, opts = {}) {
  const geo = bagGeometry();
  const mat = paintedMaterial({ map: bagTexture(), roughness: 0.3, metalness: 0.35, brush: 0.15, side: THREE.DoubleSide, name: 'chips_bag' });
  const bag = new THREE.Mesh(geo, mat);
  bag.castShadow = bag.receiveShadow = true;
  const root = new THREE.Group();
  root.name = 'chipsBag';
  root.add(bag);
  const grip = new THREE.Object3D(); // where the right hand holds it (lower edge, facing side)
  grip.position.set(0.04, -0.07, 0.01);
  root.add(grip);
  const crispMat = paintedMaterial({ color: 0xd9a24a, roughness: 0.6, brush: 0.3, side: THREE.DoubleSide, name: 'crisp' });
  const crisp = new THREE.Mesh(crispGeometry(), crispMat);
  crisp.visible = false;
  stage.mesh(root);
  stage.mesh(crisp);
  // crumbs: a small pool of falling flakes
  const CR = 48;
  const crumbs = new THREE.InstancedMesh(crispGeometry(0.004, 9), crispMat, CR);
  crumbs.frustumCulled = false;
  crumbs.count = CR;
  const cr = Array.from({ length: CR }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), life: 0, rest: false }));
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < CR; i++) crumbs.setMatrixAt(i, m4.makeScale(0, 0, 0));
  stage.mesh(crumbs);
  stage.add(() => {
    mat.map?.dispose();
    mat.dispose();
    crispMat.dispose();
  });
  // on the table, lying a little crumpled
  const tablePos = opts.position.clone();
  const tableQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.06, 0, (opts.yaw ?? 0) + 0.5, 'YXZ'));
  root.position.copy(tablePos).add(_v.set(0, BAG.t * 0.7, 0));
  root.quaternion.copy(tableQ);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.12), new THREE.MeshBasicMaterial());
  hit.layers.set(LAYERS.INTERACT);
  root.add(hit);
  const C = { state: 'table', eaten: 0, lastEatAt: -1e9, anim: null, pick: 0 };
  const item = interact.register({
    id: 'garage.chips', object: hit, labelTH: 'หยิบขนม', labelEN: 'Pick up the crisps', icon: 'hand', reach: 1.7,
    enabled: () => C.state === 'table' && (opts.enabled ? opts.enabled() : true),
    onUse: () => pickUp(),
  });
  stage.add(() => {
    interact.unregister(item);
    hit.geometry.dispose();
    releaseHand();
  });

  const releaseHand = () => {
    try {
      g.player?.reach?.(grip, { duration: 0.01, hold: 0, press: false });
    } catch (e) {
      /* cosmetic */
    }
  };
  function pickUp() {
    if (C.state !== 'table') return;
    C.state = 'held';
    C.pick = 0;
    C.from = root.position.clone();
    C.fromQ = root.quaternion.clone();
    hit.layers.disable(LAYERS.INTERACT);
    sfx('paper_rustle', { object: root, volume: 0.75, rate: 1.25 });
    g.player?.reach?.(grip, { hand: 'R', duration: 0.4, hold: 1e6, press: false });
  }
  function eat() {
    if (C.state !== 'held' || C.anim) return;
    C.anim = { t: 0, crunched: 0 };
    sfx('paper_rustle', { object: root, volume: 0.45, rate: 1.5 });
  }
  C.pickUp = () => pickUp();
  C.eat = () => eat();
  C.putAway = () => {
    if (C.state !== 'held') return;
    C.state = 'gone';
    sfx('paper_rustle', { volume: 0.5, rate: 0.9 });
    releaseHand();
    root.visible = false;
    crisp.visible = false;
  };

  // the held pose, in front of the chest, low right, label toward the eyes
  const heldPose = (lift, outPos, outQ) => {
    const cam = g.engine.camera;
    const f = _v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const u = _v2.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    outPos.copy(cam.position).addScaledVector(f, 0.31 - 0.1 * lift).addScaledVector(u, -0.17 + 0.1 * lift).addScaledVector(r, 0.1 - 0.07 * lift);
    outQ.copy(cam.quaternion).multiply(_q.setFromEuler(_e.set(-0.4 + 0.75 * lift, -0.3 + 0.2 * lift, 0.12, 'YXZ')));
  };
  const hp = new THREE.Vector3(), hq = new THREE.Quaternion();
  const mouth = new THREE.Vector3();
  let next = 0;
  stage.update((dt) => {
    const t = g.engine.time;
    if (C.state === 'held') {
      let lift = 0;
      const A = C.anim;
      if (A) {
        A.t += dt;
        lift = smoothstep(0, 0.32, A.t) * (1 - smoothstep(0.62, 1.1, A.t));
      }
      heldPose(lift, hp, hq);
      C.pick = Math.min(1, C.pick + dt / 0.45);
      const k = easeInOut(C.pick);
      root.position.lerpVectors(C.from, hp, k);
      root.quaternion.slerpQuaternions(C.fromQ, hq, k);
      if (A) {
        // the crisp goes from the bag's mouth to Ton's
        const cam = g.engine.camera;
        mouth.copy(cam.position).add(_v.set(0, -0.08, -0.06).applyQuaternion(cam.quaternion));
        const top = root.localToWorld(_v2.set(0, BAG.h * 0.45, 0.01));
        const m = smoothstep(0.08, 0.42, A.t);
        crisp.visible = A.t > 0.05 && A.t < 0.43;
        crisp.position.lerpVectors(top, mouth, m);
        crisp.quaternion.copy(cam.quaternion).multiply(_q.setFromEuler(_e.set(1.1 - m, 0.3, A.t * 2, 'XYZ')));
        for (const [at, vol] of [[0.42, 0.8], [0.72, 0.55], [0.98, 0.35]]) {
          if (A.t >= at && A.crunched < at) {
            A.crunched = at;
            crunch(vol);
            if (at === 0.42) crumbsAt(mouth, 7);
            else crumbsAt(mouth, 2);
          }
        }
        if (A.t > 1.15) {
          C.anim = null;
          C.eaten++;
          C.lastEatAt = t;
          if (C.eaten >= 14) C.putAway();
        }
      } else if (input.pressed('interact') && !interact.current && C.pick >= 1) {
        input.consume?.('interact');
        eat();
      }
    }
    // crumbs
    let any = false;
    for (let i = 0; i < CR; i++) {
      const q = cr[i];
      if (q.life <= 0) continue;
      any = true;
      q.life -= dt;
      if (!q.rest) {
        q.v.y -= 9.8 * dt;
        q.p.addScaledVector(q.v, dt);
        q.r.x += dt * 9;
        q.r.z += dt * 7;
        const gy = ground(q.p.x, q.p.z) + 0.003;
        if (q.p.y <= gy) {
          q.p.y = gy;
          q.rest = true;
        }
      }
      const s = q.life > 0 ? 1 : 0;
      m4.compose(q.p, _q.setFromEuler(q.r), _v.set(s, s, s));
      crumbs.setMatrixAt(i, m4);
    }
    if (any || next) crumbs.instanceMatrix.needsUpdate = true;
    next = any ? 1 : 0;
  }, 52);

  function crumbsAt(p, n) {
    const rng = Math.random;
    for (let k = 0; k < n; k++) {
      let i = cr.findIndex((q) => q.life <= 0);
      if (i < 0) i = Math.floor(rng() * CR);
      const q = cr[i];
      q.p.copy(p).add(_v.set((rng() - 0.5) * 0.04, -0.02, (rng() - 0.5) * 0.04));
      q.v.set((rng() - 0.5) * 0.5, rng() * 0.4, (rng() - 0.5) * 0.5);
      q.r.set(rng() * 6, rng() * 6, rng() * 6);
      q.life = 9;
      q.rest = false;
    }
  }
  return C;
}
