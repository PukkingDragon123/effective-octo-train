// Foliage-bound particle ambience: leaves drifting down through the headlight beams around
// the focus, occasional gust bursts of leaves, floating spores and headlit dust motes,
// fireflies over wet ground (pond, creek, banana grove) and moths at the landmark lamps.
// Uses render's particles (GPU instanced); a handful of draw calls in total.
import * as THREE from 'three';
import { particles } from '../render/index.js';
import { makeRng } from '../core/math.js';

const _p = new THREE.Vector3();

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
    // moths at the lit set pieces (at most 6 lamps)
    let n = 0;
    for (const L of Object.values(lm)) {
      const a = L.anchors?.lampAnchor;
      if (!a || n >= 6) continue;
      add('moths', { object: a, count: 18, radius: 1.0, seed: 20 + n });
      n++;
    }
  }

  update(dt, focus) {
    if (!this.enabled) return;
    if (!this._inited) this._init();
    // leaves fall around (and a little ahead of) the focus
    _p.copy(focus);
    _p.y = this.world.getHeight(focus.x, focus.z);
    this.leaves?.setPosition(_p);
    this.gust?.setPosition(_p);
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
