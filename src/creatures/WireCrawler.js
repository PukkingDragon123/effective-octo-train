// The wire crawler: something long-limbed and grey that hangs under the sagging electrical wires
// belly-up like a sloth, crawling hand over hand along the cable. Its arms and neck are far too
// long (ghost stretch), elbows and knees bend the wrong way, and its head is twisted all the way
// round to look DOWN at the road while its body faces the sky. Wet black hair hangs from it.
// Sparks spit where its hands close on the wire.
//   const w = createWireCrawler(); scene.add(w.root); await w.crawlAlong(wirePoints, 1.3)
import * as THREE from 'three';
import { audio } from '../audio/index.js';
import { particles } from '../render/index.js';
import { engine } from '../core/Engine.js';
import { SPECS, human } from './humans.js';
import { humanoidFacing, quatFromBasis } from './taxiGeo.js';
import { Entity, animate, clamp, noise, worldPos, easeInOut } from './util.js';

const _P = new THREE.Vector3(), _T = new THREE.Vector3(), _U = new THREE.Vector3(), _L = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class WireCrawler extends Entity {
  constructor(opts = {}) {
    super('wireCrawler');
    this.h = human(SPECS.wireCrawler, opts);
    this.humanoid = this.h;
    this.root.add(this.h.root);
    this.h.setMode('hang');
    this.h.setGhost({ stretch: 1, limbBreak: 0.45, jitter: 0.3, stare: 1, unlimited: 1, noBlink: 1, neckTwist: Math.PI }, 100);
    this.hang = opts.hang ?? 0.62;
    this.limbs = [];
    for (const [key, foot, off, side] of [['L', false, 0.62, 1], ['R', false, 0.62, -1], ['FL', true, -0.85, 1], ['FR', true, -0.85, -1]]) {
      const tgt = new THREE.Object3D();
      tgt.name = 'wireCrawlerIK_' + key;
      engine.scene.add(tgt);
      this.limbs.push({ key, foot, off, side, tgt, s: 0, s0: 0, s1: 0, swing: -1, phase: key === 'L' || key === 'FR' ? 0 : 1 });
      if (foot) this.h.setFootTarget(key === 'FL' ? 'L' : 'R', tgt, { weight: 1, blend: 0.1, orient: false });
      else this.h.setHandTarget(key, tgt, { weight: 1, blend: 0.1, fingers: 'claw', grip: 1 });
    }
    this.curve = null;
    this.s = 0;
    this.speed = 1.2;
    this.dir = 1;
    this._sparkT = 0;
  }

  /** Crawl along a world-space polyline (wire). opts { from: 0..1, to: 0..1 }. Resolves at the end. */
  crawlAlong(points, speed = 1.2, opts = {}) {
    this.curve = new THREE.CatmullRomCurve3(points.map((p) => p.clone()), false, 'centripetal');
    this.L = this.curve.getLength();
    const from = opts.from ?? 0, to = opts.to ?? 1;
    this.s = from * this.L;
    this.sEnd = to * this.L;
    this.dir = Math.sign(this.sEnd - this.s) || 1;
    this.speed = speed;
    for (const l of this.limbs) {
      l.s = l.s0 = l.s1 = this.s + l.off * this.dir;
      l.swing = -1;
    }
    this._frame(0);
    for (const l of this.limbs) this._gripPoint(l, l.s, 0, l.tgt.position);
    return new Promise((res) => (this._done = res));
  }

  _at(s, outP, outT) {
    const u = clamp(s / this.L, 0, 1);
    this.curve.getPointAt(u, outP);
    if (outT) this.curve.getTangentAt(u, outT).multiplyScalar(this.dir);
  }

  _gripPoint(l, s, lift, out) {
    this._at(s, out, _T);
    // lateral offset on the wire (hands / feet straddle it) + lift away while swinging
    _U.copy(UP).addScaledVector(_T, -UP.dot(_T)).normalize();
    _L.crossVectors(_T, _U).normalize();
    out.addScaledVector(_L, l.side * (l.foot ? 0.07 : 0.05)).addScaledVector(_U, -0.03 - lift * 0.22).addScaledVector(_L, l.side * lift * 0.12);
    // hands: palm up around the cable, fingers along the travel direction
    if (!l.foot) {
      const z = _T.clone().negate(), y = _U.clone().negate();
      const x = new THREE.Vector3().crossVectors(y, z);
      quatFromBasis(x, y, z, l.tgt.quaternion);
    }
    return out;
  }

  _frame(dt) {
    this._at(this.s, _P, _T);
    _U.copy(UP).addScaledVector(_T, -UP.dot(_T)).normalize();
    // body: belly up, head leading along the wire, hanging under it
    const centre = _v.copy(_P).addScaledVector(_U, -this.hang - noise.noise2D(this.time * 1.7, 2.2) * 0.04);
    const parent = this.root.parent || engine.scene;
    parent.updateWorldMatrix(true, false);
    humanoidFacing(_U, _T, _q);
    const pq = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.h.root.quaternion.copy(pq).multiply(_q);
    const hips = (this.h.look?.height ?? 1.9) * 0.5;
    const rootW = centre.clone().addScaledVector(_T, -hips);
    this.h.root.position.copy(parent.worldToLocal(rootW));
    void dt;
  }

  step(dt) {
    if (!this.curve) return;
    if (this._done) {
      // hitching, uneven progress: lunges between grips
      const lunge = 0.55 + 0.75 * Math.max(0, Math.sin(this.time * 4.2)) + noise.noise2D(this.time * 1.3, 4) * 0.2;
      this.s += this.dir * this.speed * lunge * dt;
      if ((this.s - this.sEnd) * this.dir >= 0) {
        this.s = this.sEnd;
        const r = this._done;
        this._done = null;
        r(true);
      }
    }
    this._frame(dt);
    // limbs: re-grip when they trail too far; diagonal pairs alternate
    const swinging = this.limbs.some((l) => l.swing >= 0);
    for (const l of this.limbs) {
      const want = this.s + l.off * this.dir;
      if (l.swing < 0 && !swinging && (want - l.s) * this.dir > 0.42) {
        l.swing = 0;
        l.s0 = l.s;
        l.s1 = want + 0.3 * this.dir;
        for (const o of this.limbs) if (o !== l && o.phase === l.phase && o.swing < 0) { o.swing = 0; o.s0 = o.s; o.s1 = this.s + o.off * this.dir + 0.3 * this.dir; }
      }
      let lift = 0;
      if (l.swing >= 0) {
        l.swing += dt / 0.32;
        const k = Math.min(1, l.swing);
        l.s = l.s0 + (l.s1 - l.s0) * easeInOut(k);
        lift = Math.sin(k * Math.PI);
        if (k >= 1) {
          l.swing = -1;
          if (!l.foot) this._gripFx(l);
        }
      }
      this._gripPoint(l, l.s, lift, l.tgt.position);
    }
  }

  _gripFx(l) {
    this._sparkT -= 1;
    audio.play('scratch_glass', { object: l.tgt, volume: 0.2, rate: 0.6 });
    if (Math.random() < 0.35) {
      audio.play('spark', { object: l.tgt, volume: 0.5 });
      try {
        const sp = particles.emit('sparks', { position: l.tgt.position.clone(), burst: true, autoDispose: true, count: 18 });
        sp.burst?.();
      } catch (e) { /* optional */ }
    }
  }

  async vanish(d = 1.2) {
    await animate(d, (k) => this.h.setOpacity(1 - k), easeInOut);
  }

  dispose() {
    for (const l of this.limbs) l.tgt.removeFromParent();
    this.h.dispose();
    super.dispose();
  }
}

export { worldPos };
