// Frame-time driven quality control (render module internals).
//
//  * FrameClock: real frame intervals measured at the start of every PostFX frame
//    (performance.now(), so it works while the game is paused in menus).
//  * DynamicResolution: scales the internal render size (sceneRT, grade, bloom...) by
//    1.0 / 0.9 / 0.8 / 0.7 ONLY while the frame time is over budget (16.7 ms); the
//    output pass upsamples with contrast-adaptive sharpening so the image stays crisp.
//    It steps back up as soon as frames fit the budget again (backing off if a step up
//    immediately turns out to be too slow, so it never oscillates).
//  * AutoQuality: first run only. Samples ~2 s of frame times in the main menu and steps
//    `graphicsPreset` down (ultra > high > medium > low) while it is slow; the decision is
//    persisted through the settings API (`settings.autoQuality`), so it never runs again.
//
// Both are off for deterministic captures (`?manual=1`, used by tools/shot.mjs), with
// `?dynres=0` / `?autoq=0`, and dynamic resolution also with settings.dynamicResolution = false.
import { settings } from '../core/Settings.js';
import { bus } from '../core/Events.js';

const BUDGET_MS = 1000 / 60;
const PRESET_ORDER = ['low', 'medium', 'high', 'ultra'];

function urlFlag(name) {
  try {
    return new globalThis.URLSearchParams(globalThis.location?.search || '').get(name);
  } catch {
    return null;
  }
}
const MANUAL = urlFlag('manual') === '1';

export class FrameClock {
  constructor() {
    this.last = 0;
    this.ms = BUDGET_MS; // last interval (clamped)
    this.valid = false; // false on the first frame and after long stalls (tab switch, loading)
  }
  tick(now = performance.now()) {
    const d = this.last ? now - this.last : 0;
    this.last = now;
    // long stalls (tab hidden, loading hitches, shader compiles) are not frame times
    this.valid = d > 0 && d < 250;
    if (this.valid) this.ms = Math.min(d, 60);
    return this.valid;
  }
}

export class DynamicResolution {
  constructor() {
    this.enabled = !MANUAL && urlFlag('dynres') !== '0';
    this.min = 0.7;
    this.step = 0.1;
    this.scale = 1;
    this.hold = false; // frozen at the current scale (auto-quality sampling)
    this._avg = BUDGET_MS;
    this._settle = 0; // frames to ignore after a size change (reallocation hitch)
    this._cool = 0; // seconds before the next change
    this._goodT = 0; // seconds the frame time has been within budget
    this._upWait = 1.0; // seconds of good frames needed before stepping up (backs off)
    this._lastUpT = -1e9;
    this._probing = false;
    this._t = 0;
  }

  get active() {
    return this.enabled && settings.get('dynamicResolution') !== false;
  }

  reset() {
    this.scale = 1;
    this._avg = BUDGET_MS;
    this._goodT = 0;
    this._settle = 10;
  }

  /** Feed one frame interval (ms). Returns the render scale to use for this frame. */
  update(ms, valid) {
    if (!this.active) {
      if (this.scale !== 1) this.reset();
      return this.scale;
    }
    if (this.hold || !valid) return this.scale;
    const dt = ms / 1000;
    this._t += dt;
    if (this._settle > 0) {
      this._settle--;
      return this.scale;
    }
    // fast EMA (~0.25 s) of the frame interval
    this._avg += (ms - this._avg) * 0.12;
    this._cool = Math.max(0, this._cool - dt);
    const over = this._avg > BUDGET_MS * 1.1; // missing the 60 Hz vsync
    const good = this._avg < BUDGET_MS * 1.04;
    this._goodT = good ? this._goodT + dt : 0;
    if (over && this._cool <= 0 && this.scale > this.min + 1e-3) {
      // a step up that is immediately too slow: wait twice as long before probing again
      if (this._probing && this._t - this._lastUpT < 3.0) this._upWait = Math.min(this._upWait * 2, 16);
      this._probing = false;
      this._set(Math.max(this.min, this.scale - this.step));
    } else if (this._goodT >= this._upWait && this._cool <= 0 && this.scale < 1 - 1e-3) {
      this._lastUpT = this._t;
      this._probing = true;
      this._set(Math.min(1, this.scale + this.step));
    }
    // the step up held: the scene got cheaper, probe quickly again next time
    if (this._probing && this._t - this._lastUpT > 3.0) {
      this._probing = false;
      this._upWait = 1.0;
    }
    return this.scale;
  }

  _set(s) {
    this.scale = Math.round(s * 100) / 100;
    this._cool = 0.6;
    this._goodT = 0;
    this._settle = 8;
    this._avg = BUDGET_MS; // fresh evidence at the new size
  }
}

/**
 * First-run auto quality. `clock` is the FrameClock PostFX ticks every frame; `dyn` is
 * frozen at full resolution while sampling so the samples measure the preset itself.
 */
export class AutoQuality {
  constructor(dyn) {
    this.dyn = dyn;
    this.enabled = !MANUAL && urlFlag('autoq') !== '0';
    this.state = 'idle'; // idle | warmup | sampling | done
    this.samples = [];
    this._t = 0;
    this._steps = 0;
    this.result = null;
    if (!this.enabled || this._done()) {
      this.state = 'done';
      return;
    }
    this._off = bus.on('game:state', ({ state }) => {
      if (this.state === 'done') return;
      if (state === 'menu') this._start();
      else this._abort();
    });
  }

  _done() {
    const v = settings.get('autoQuality');
    return typeof v === 'string' && v.startsWith('done');
  }

  _start() {
    this.state = 'warmup';
    this._t = 0;
    this.samples.length = 0;
    this.dyn.hold = true;
    this.dyn.reset();
  }

  _abort() {
    // left the menu before a decision: try again the next time the menu shows
    if (this.state === 'warmup' || this.state === 'sampling') {
      this.state = 'idle';
      this.dyn.hold = false;
    }
  }

  /** Called every frame with the frame interval (ms). */
  frame(ms, valid) {
    if (this.state !== 'warmup' && this.state !== 'sampling') return;
    if (!valid) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this._t += ms / 1000;
    if (this.state === 'warmup') {
      // skip shader compiles / texture uploads right after the menu appears
      if (this._t >= 1.5) {
        this.state = 'sampling';
        this._t = 0;
        this.samples.length = 0;
      }
      return;
    }
    this.samples.push(ms);
    if (this._t < 2.0) return;
    const s = this.samples.slice().sort((a, b) => a - b);
    const median = s[Math.floor(s.length * 0.5)];
    const p75 = s[Math.floor(s.length * 0.75)];
    const preset = settings.get('graphicsPreset') || 'medium';
    const idx = PRESET_ORDER.indexOf(preset);
    // slow: clearly below ~45 fps most of the time (dynamic resolution handles small dips)
    const slow = median > 22 || p75 > 30;
    if (slow && idx > 0 && this._steps < 3) {
      this._steps++;
      const next = PRESET_ORDER[idx - 1];
      console.info(`[render] auto quality: ${preset} median ${median.toFixed(1)} ms -> ${next}`);
      settings.set('graphicsPreset', next);
      this._start(); // re-measure at the new preset
      return;
    }
    this.result = { preset, median, p75 };
    this.state = 'done';
    this.dyn.hold = false;
    settings.set('autoQuality', 'done:' + preset);
    this._off?.();
  }
}
