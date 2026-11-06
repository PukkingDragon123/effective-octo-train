// Foliage-bound particle ambience: leaves drifting down through the headlight beams around
// the focus, occasional gust bursts of leaves, floating spores and headlit dust motes,
// fireflies over wet ground (pond, creek, banana grove) and moths at the landmark lamps.
// Uses render's particles (GPU instanced); a handful of draw calls in total.
import * as THREE from 'three';
import { particles } from '../render/index.js';
import { makeRng } from '../core/math.js';
import { engine } from '../core/Engine.js';

const _p = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Ambience {
  constructor(world) {
    this.world = world;
    this.handles = [];
    this.enabled = true;
    this.gustT = 0;
    this.nextGust = 7;
    this.rng = makeRng(99);
    this._inited = false;
  }

  _init() {
    this._inited = true;
    const add = (type, opts) => {
      try {
        const h = particles.emit(type, opts);
        this.handles.push(h);
        return h;
      } catch (e) {
        console.warn('[world] particles', type, e);
        return null;
      }
    };
    this.leaves = add('leaves', { position: new THREE.Vector3(), radius: 15, count: 120, height: 13, seed: 3 });
    this.gust = add('leaves', { position: new THREE.Vector3(), radius: 9, count: 160, height: 9, seed: 7 });
    this.gust?.setActive(false);
    this.spores = add('pollen', { count: 220, radius: 11, height: 7, seed: 5 });
    this.motes = add('dust', { count: 420, seed: 9 });
    const lm = this.world.landmarks || {};
    for (const key of ['hiddenPond', 'bananaGrove', 'bridge', 'sacredTree2']) {
      const L = lm[key];
      if (!L) continue;
      add('fireflies', { position: L.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), radius: key === 'bridge' ? 16 : 11, count: 46, seed: key.length });
    }
    // low mist pooling in the dips: creek under the bridge, the ravine below the accident curve,
    // the pond, the banana grove, the elephant trail, the ghost gate and the shrine approach
    const T = this.world.terrain;
    const mist = (pos, radius, intensity = 1) => {
      if (!pos) return;
      const gy = T ? T.sample(pos.x, pos.z) : pos.y;
      add('mist', { position: new THREE.Vector3(pos.x, gy, pos.z), groundY: gy + 0.1, radius, height: 1.4, count: 40, intensity, seed: Math.round(pos.x * 7 + pos.z) });
    };
    if (T?.creek) {
      const sp = T.creek.spline;
      for (const f of [0.3, 0.5, 0.7]) {
        const p = sp.pointAt(sp.length * f, 0);
        mist(p, 16, 1.2);
      }
    }
    for (const m of T?.mods || []) if (m.dh < 0) mist({ x: m.x, z: m.z }, m.r * 0.6, 1.1);
    // sparse fog pockets where the road dips (a low point at least 1.2 m under the road 60 m
    // either side), at most 10 and 250 m apart
    {
      const dips = [];
      for (const sp of this.world.road?.splines?.values?.() || []) {
        for (let s = 70; s < sp.length - 70; s += 10) {
          const h = sp.heightAt(s);
          if (h < sp.heightAt(s - 10) && h <= sp.heightAt(s + 10) && h < sp.heightAt(s - 60) - 1.2 && h < sp.heightAt(s + 60) - 1.2) {
            const p = sp.pointAt(s, 0);
            if (dips.every((d) => Math.hypot(d.x - p.x, d.z - p.z) > 250)) dips.push(p);
          }
        }
      }
      for (const p of dips.slice(0, 10)) mist(p, 18, 1.15);
    }
    for (const key of ['hiddenPond', 'bananaGrove', 'elephantCrossing', 'ghostGate', 'shrineApproach', 'shrineMaRuay', 'sacredTree1', 'sacredTree3']) {
      const L = lm[key];
      if (L) mist(key === 'shrineMaRuay' ? L.centre || L.pos : L.pos, key === 'bananaGrove' || key === 'shrineApproach' ? 24 : 16, key === 'ghostGate' ? 1.5 : 1);
    }
    this._add = add;
    if (this.world.complete !== false) this._initMoths();
  }

  /** Moths at the lit set pieces (at most 6 lamps; waits for a progressive build to finish). */
  _initMoths() {
    this._moths = true;
    if (this.world.moths) return; // the world's photo moths (Moths.js) replace the particle moths
    const lm = this.world.landmarks || {};
    let n = 0;
    for (const L of Object.values(lm)) {
      const a = L.anchors?.lampAnchor;
      if (!a || n >= 6) continue;
      this._add('moths', { object: a, count: 18, radius: 1.0, seed: 20 + n });
      n++;
    }
  }

  update(dt, focus) {
    if (!this.enabled) return;
    if (!this._inited) this._init();
    if (!this._moths && this.world.complete) this._initMoths();
    // leaves fall around (and a little ahead of) the focus
    // the falling-leaf boxes sit AHEAD of the camera and never contain it (no leaf inside the
    // cab, between the eye and the windshield or the road)
    const cam = engine.camera;
    if (cam) cam.getWorldDirection(_d);
    else _d.set(0, 0, -1);
    _d.y = 0;
    if (_d.lengthSq() < 1e-6) _d.set(0, 0, -1);
    _d.normalize();
    const ax = Math.max(Math.abs(_d.x), Math.abs(_d.z));
    for (const [h, R] of [[this.leaves, 15], [this.gust, 9]]) {
      if (!h) continue;
      const k = (R + 3.5) / ax; // nearest face of the box 3.5 m ahead (+ sway margin)
      _p.set(focus.x + _d.x * k, 0, focus.z + _d.z * k);
      _p.y = this.world.getHeight(_p.x, _p.z);
      h.setPosition(_p);
    }
    this.gustT -= dt;
    this.nextGust -= dt;
    if (this.nextGust <= 0) {
      this.gustT = 2.5 + this.rng() * 2.5;
      this.nextGust = 9 + this.rng() * 18;
      this.gust?.setActive(true);
    }
    if (this.gustT <= 0 && this.gust?.emitter?.active) this.gust.setActive(false);
  }

  setEnabled(on) {
    this.enabled = !!on;
    for (const h of this.handles) h.setActive?.(this.enabled && h !== this.gust);
  }

  dispose() {
    for (const h of this.handles) h.dispose?.();
    this.handles = [];
  }
}
