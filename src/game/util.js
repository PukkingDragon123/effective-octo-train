// Gameplay timing helpers that respect engine time (pause / timeScale aware).
import { engine } from '../core/Engine.js';
import { clamp, easeInOut } from '../core/math.js';

/** Resolve after `seconds` of game time (stops counting while paused). */
export function wait(seconds) {
  return new Promise((resolve) => {
    let t = 0;
    const off = engine.onUpdate((dt) => {
      t += dt;
      if (t >= seconds) {
        off();
        resolve();
      }
    }, -50);
  });
}

/** Resolve after `seconds` of real time (keeps counting while paused; for UI). */
export function waitReal(seconds) {
  return new Promise((resolve) => {
    let t = 0;
    const off = engine.onUpdate(
      (dt) => {
        t += dt;
        if (t >= seconds) {
          off();
          resolve();
        }
      },
      -50,
      { always: true },
    );
  });
}

/** Resolve when predicate() becomes true (checked every frame). Optional timeout (s) resolves with false. */
export function until(predicate, timeout = Infinity) {
  return new Promise((resolve) => {
    let t = 0;
    const off = engine.onUpdate((dt) => {
      t += dt;
      let ok = false;
      try {
        ok = predicate(dt);
      } catch (e) {
        console.error(e);
      }
      if (ok) {
        off();
        resolve(true);
      } else if (t >= timeout) {
        off();
        resolve(false);
      }
    }, -40);
  });
}

/**
 * Tween a numeric property. tween(obj, 'fade', 1, 2.0, easeInOut) -> Promise.
 * Pass {real:true} to keep running while paused.
 */
export function tween(obj, key, to, duration, ease = easeInOut, opts = {}) {
  const from = obj[key];
  if (duration <= 0) {
    obj[key] = to;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let t = 0;
    const off = engine.onUpdate(
      (dt) => {
        t += dt;
        const k = clamp(t / duration);
        obj[key] = from + (to - from) * ease(k);
        opts.onUpdate?.(obj[key]);
        if (k >= 1) {
          off();
          resolve();
        }
      },
      -45,
      { always: !!opts.real },
    );
  });
}

/** Run fn(dt, elapsed) every frame until it returns true or `duration` elapses. */
export function during(duration, fn) {
  return new Promise((resolve) => {
    let t = 0;
    const off = engine.onUpdate((dt) => {
      t += dt;
      const done = fn(dt, t, Math.min(1, t / duration));
      if (done === true || t >= duration) {
        off();
        resolve();
      }
    }, -40);
  });
}

/** A cancellable group of per-frame callbacks & timers; dispose() tears everything down (state exit). */
export class Scope {
  constructor() {
    this.offs = [];
    this.alive = true;
  }
  onUpdate(fn, order = 0, opts) {
    const off = engine.onUpdate((dt, t) => this.alive && fn(dt, t), order, opts);
    this.offs.push(off);
    return off;
  }
  add(off) {
    this.offs.push(off);
    return off;
  }
  dispose() {
    this.alive = false;
    for (const off of this.offs.splice(0)) {
      try {
        off();
      } catch (e) {
        console.error(e);
      }
    }
  }
}
