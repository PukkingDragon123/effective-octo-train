// AudioCore: everything that touches a (Base)AudioContext — master chain
// (glue compressor + limiter), category buses, cabin muffle, convolution reverbs
// built from generated impulse responses (forest / car cabin / garage / shrine /
// hall), the buffer cache fed by the synthesis service, and voice playback
// (one-shots, loops, retriggered loops) with spatial panners.
//
// Works with AudioContext and OfflineAudioContext alike (offline tests).
import { GenService } from './Gen.js';
import { SOUNDS } from './Synth/registry.js';
import { Spatial } from './Spatial.js';

export const BUS_NAMES = ['music', 'sfx', 'ambience', 'voice', 'ui', 'radio'];
const MAX_VOICES = 56;

// ---------------------------------------------------------------------------
// Impulse responses
// ---------------------------------------------------------------------------
const IR_SPECS = {
  forest: { dur: 3.4, pre: 0.03, decay: 2.4, d0: 7000, d1: 1100, early: [[0.041, 0.22], [0.067, 0.16], [0.093, 0.14], [0.141, 0.1], [0.187, 0.08]], hp: 140, density: 0.5, gain: 0.8 },
  cabin: { dur: 0.32, pre: 0.0015, decay: 0.13, d0: 5500, d1: 2200, early: [[0.0019, 0.55], [0.0031, 0.45], [0.0043, 0.4], [0.0058, 0.32], [0.0076, 0.25], [0.0102, 0.2]], hp: 110, density: 1, gain: 0.9 },
  garage: { dur: 1.7, pre: 0.008, decay: 0.95, d0: 7500, d1: 2400, early: [[0.011, 0.45], [0.017, 0.4], [0.026, 0.33], [0.038, 0.28]], flutter: 0.0235, hp: 90, density: 1, gain: 0.9 },
  shrine: { dur: 2.8, pre: 0.016, decay: 1.8, d0: 6500, d1: 1800, early: [[0.021, 0.35], [0.034, 0.3], [0.052, 0.22], [0.077, 0.15]], hp: 100, density: 0.8, gain: 0.85 },
  hall: { dur: 4.5, pre: 0.025, decay: 3.4, d0: 6000, d1: 1600, early: [[0.023, 0.3], [0.037, 0.25], [0.054, 0.2], [0.079, 0.15]], hp: 80, density: 1, gain: 0.8 },
};

function makeIR(ctx, kind, seed = 1) {
  const S = IR_SPECS[kind] || IR_SPECS.forest;
  const sr = ctx.sampleRate;
  const n = Math.floor(S.dur * sr);
  const buf = ctx.createBuffer(2, n, sr);
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 233280 + 49297) % 2147483647;
    return (s / 2147483647) * 2 - 1;
  };
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0, hpY = 0, hpX = 0;
    const hpA = Math.exp((-2 * Math.PI * S.hp) / sr);
    const pre = Math.floor(S.pre * sr);
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp((-6.9 * t) / S.decay) * Math.min(1, t / 0.004);
      const cutoff = S.d1 + (S.d0 - S.d1) * Math.exp(-t / (S.decay * 0.35));
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
      // sparse-ish diffuse noise (forest = sparse reflections from trunks)
      let x = rnd();
      if (S.density < 1 && Math.abs(x) < 1 - S.density * 0.9) x *= 0.15;
      lp += a * (x - lp);
      const y = lp - hpX + hpA * hpY; // DC/low cut
      hpX = lp;
      hpY = y;
      d[i] = y * env;
    }
    // early reflections (different per ear)
    for (const [t, g] of S.early) {
      const i = Math.floor((t * (ch ? 1.07 : 0.94) + S.pre * 0.5) * sr);
      if (i < n) {
        d[i] += g * (ch ? 0.9 : 1);
        if (i + 1 < n) d[i + 1] += g * 0.4;
      }
    }
    // flutter echo between parallel walls / corrugated roof
    if (S.flutter) {
      for (let k = 1; k < 30; k++) {
        const i = Math.floor((S.pre + k * S.flutter * (ch ? 1.01 : 1)) * sr);
        if (i < n) d[i] += 0.3 * Math.exp(-k * 0.16) * (k % 2 ? 1 : -1);
      }
    }
    // normalise energy
    let e = 0;
    for (let i = 0; i < n; i++) e += d[i] * d[i];
    const g = (S.gain / Math.sqrt(e + 1e-9)) * 0.6;
    for (let i = 0; i < n; i++) d[i] *= g;
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Voice (a playing sound)
// ---------------------------------------------------------------------------
let voiceSeq = 1;

export class Voice {
  constructor(core, id, def, opts) {
    this.core = core;
    this.id = id;
    this.def = def || {};
    this.opts = opts;
    this.seq = voiceSeq++;
    this.volume = opts.volume ?? 1;
    this.rate = opts.rate ?? 1;
    this.detune = opts.detune ?? 0;
    this.loop = !!opts._loop;
    this.stopped = false;
    this.started = false;
    this.src = null;
    this.ended = new Promise((r) => (this._resolveEnded = r));
    this.duration = 0;
    this.startTime = 0;
    this.params = {};
    this.retrigger = null; // {interval, next, alt, count}
  }

  /** Build the node chain and start once the buffer exists. */
  _start(buffer, when) {
    if (this.stopped) return;
    const { core, def, opts } = this;
    const ctx = core.ctx;
    const t0 = Math.max(ctx.currentTime, when ?? ctx.currentTime);
    const bus = core.buses[opts.bus || def.bus || 'sfx'] || core.buses.sfx;
    const gain = ctx.createGain();
    const baseGain = (def.gain ?? 1) * this.volume;
    const fadeIn = opts.fadeIn ?? (this.loop ? 0.25 : 0);
    if (fadeIn > 0) {
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(baseGain, t0 + fadeIn);
    } else gain.gain.value = baseGain;
    this.gain = gain;
    const stereo = buffer && buffer.numberOfChannels > 1;
    const spatial = !!(opts.position || opts.object) && !stereo && opts.spatial !== false;
    const muffled = opts.muffle ?? (spatial ? !def.cabin : false);
    let tail = gain;
    if (spatial) {
      this.spatial = core.spatial.createSource(this, opts);
      gain.connect(this.spatial.input);
      tail = this.spatial.output;
    } else if (opts.pan != null && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = opts.pan;
      gain.connect(p);
      tail = p;
      this.panNode = p;
    }
    tail.connect(muffled ? bus.outside : bus.direct);
    const rev = opts.reverb ?? def.reverb ?? 0.12;
    if (rev > 0.001) {
      const send = ctx.createGain();
      send.gain.value = rev;
      gain.connect(send);
      send.connect(muffled ? bus.sendOut : bus.sendCab);
      this.send = send;
      if (this.spatial) core.spatial.updateSource(this.spatial, true);
    }
    this.muffled = muffled;
    this.bus = bus;
    if (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = this.loop && !this.retrigger;
      src.playbackRate.value = this.rate;
      if (this.detune) src.detune.value = this.detune;
      src.connect(gain);
      const off = this.loop ? (opts.offset ?? Math.random() * buffer.duration) % buffer.duration : opts.offset || 0;
      src.start(t0, off);
      src.onended = () => this._ended(src);
      this.src = src;
      this.duration = buffer.duration / Math.max(0.01, this.rate);
      if (!this.loop && this.duration > 0) core._scheduleCleanup(this, t0 + this.duration + 0.1);
    }
    this.startTime = t0;
    this.started = true;
  }

  _ended(src) {
    if (this.retrigger && !this.stopped) {
      // retrigger voices keep their chain; individual hits end silently
      return;
    }
    if (src && src !== this.src) return;
    this._dispose();
  }

  _dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.stopped = true;
    try {
      this.src?.disconnect();
    } catch (e) {
      /* ignore */
    }
    for (const n of [this.gain, this.send, this.panNode]) {
      try {
        n?.disconnect();
      } catch (e) {
        /* ignore */
      }
    }
    if (this.spatial) this.core.spatial.release(this.spatial);
    this.core._removeVoice(this);
    this._resolveEnded();
  }

  // ---- public handle API ----
  stop(fade = 0.05) {
    if (this.stopped) return;
    this.stopped = true;
    const ctx = this.core.ctx;
    if (!this.started) {
      this._dispose();
      return;
    }
    const now = ctx.currentTime;
    const f = Math.max(0.005, fade);
    try {
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(this.gain.gain.value, now);
      this.gain.gain.linearRampToValueAtTime(0, now + f);
      this.src?.stop(now + f + 0.02);
    } catch (e) {
      /* ignore */
    }
    this.core._scheduleCleanup(this, now + f + 0.05, true);
  }
  setVolume(v, ramp = 0.05) {
    this.volume = v;
    if (!this.gain) return;
    const ctx = this.core.ctx;
    const g = (this.def.gain ?? 1) * v;
    this.gain.gain.cancelScheduledValues(ctx.currentTime);
    this.gain.gain.setTargetAtTime(g, ctx.currentTime, Math.max(0.005, ramp / 3));
  }
  setRate(r) {
    this.rate = r;
    if (this.src && !this.retrigger) this.src.playbackRate.setTargetAtTime(r, this.core.ctx.currentTime, 0.03);
  }
  setParam(name, v) {
    this.params[name] = v;
    if (name === 'detune' && this.src) this.src.detune.setTargetAtTime(v, this.core.ctx.currentTime, 0.03);
    if (name === 'interval' && this.retrigger) this.retrigger.interval = v;
    if (name === 'reverb' && this.send) this.send.gain.setTargetAtTime(v, this.core.ctx.currentTime, 0.05);
    if (name === 'pan' && this.panNode) this.panNode.pan.setTargetAtTime(v, this.core.ctx.currentTime, 0.05);
  }
  setPosition(p) {
    if (p && p.isObject3D) {
      this.opts.object = p;
      this.opts.position = null;
    } else {
      this.opts.position = p;
      this.opts.object = null;
    }
    if (this.spatial) this.core.spatial.updateSource(this.spatial, true);
  }
}

const NOOP_HANDLE = {
  stop() {}, setVolume() {}, setRate() {}, setParam() {}, setPosition() {}, ended: Promise.resolve(), duration: 0, noop: true,
};
export function noopHandle() {
  return { ...NOOP_HANDLE };
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------
export class AudioCore {
  /** opts: { sync: bool (generate on the calling thread), gen: GenService } */
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    this.sync = opts.sync ?? this.offline;
    this.gen = opts.gen || new GenService({ sync: this.sync });
    this.cache = new Map(); // key -> AudioBuffer
    this.cacheBytes = 0;
    this.maxCacheBytes = opts.maxCacheBytes ?? 72 * 1024 * 1024;
    this.voices = [];
    this.cleanups = [];
    this.lastVariant = {};
    this.muffle = 0;
    this.env = 'forest';
    this._buildGraph();
    this.spatial = new Spatial(this);
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    // glue + limiter
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.knee.value = 10;
    glue.ratio.value = 2.5;
    glue.attack.value = 0.015;
    glue.release.value = 0.25;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2.5;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.002;
    lim.release.value = 0.12;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.master.connect(glue);
    glue.connect(lim);
    lim.connect(this.out);
    this.out.connect(ctx.destination);
    this.glue = glue;
    this.limiter = lim;

    // direct (cabin / non-world) and outside (world, muffled when sealed in the car)
    this.directSum = ctx.createGain();
    this.outsideSum = ctx.createGain();
    this.muffleLP = ctx.createBiquadFilter();
    this.muffleLP.type = 'lowpass';
    this.muffleLP.frequency.value = Math.min(20000, ctx.sampleRate * 0.48);
    this.muffleLP.Q.value = 0.5;
    this.muffleLP2 = ctx.createBiquadFilter();
    this.muffleLP2.type = 'lowpass';
    this.muffleLP2.frequency.value = Math.min(20000, ctx.sampleRate * 0.48);
    this.muffleLP2.Q.value = 0.6;
    this.muffleShelf = ctx.createBiquadFilter();
    this.muffleShelf.type = 'lowshelf';
    this.muffleShelf.frequency.value = 160;
    this.muffleShelf.gain.value = 0;
    this.muffleGain = ctx.createGain();
    this.outsideSum.connect(this.muffleLP);
    this.muffleLP.connect(this.muffleLP2);
    this.muffleLP2.connect(this.muffleShelf);
    this.muffleShelf.connect(this.muffleGain);
    this.muffleGain.connect(this.master);
    this.directSum.connect(this.master);

    // reverbs: two outdoor convolvers (crossfaded between environments) + cabin
    this.revSendOut = ctx.createGain();
    this.revSendCab = ctx.createGain();
    this.revA = ctx.createConvolver();
    this.revB = ctx.createConvolver();
    this.revCab = ctx.createConvolver();
    this.revA.normalize = this.revB.normalize = this.revCab.normalize = false;
    this.revAGain = ctx.createGain();
    this.revBGain = ctx.createGain();
    this.revBGain.gain.value = 0;
    this.irCache = {};
    this.revA.buffer = this._ir('forest');
    this.revB.buffer = this._ir('shrine');
    this.revCab.buffer = this._ir('cabin');
    this.revSendOut.connect(this.revA);
    this.revSendOut.connect(this.revB);
    this.revA.connect(this.revAGain);
    this.revB.connect(this.revBGain);
    this.revAGain.connect(this.outsideSum);
    this.revBGain.connect(this.outsideSum);
    this.revSendCab.connect(this.revCab);
    this.revCabGain = ctx.createGain();
    this.revCab.connect(this.revCabGain);
    this.revCabGain.connect(this.directSum);
    this._revActive = 'A';
    this._revEnv = { A: 'forest', B: 'shrine' };

    // buses
    this.buses = {};
    for (const name of BUS_NAMES) {
      const b = { name, vol: 1, duck: 1 };
      b.direct = ctx.createGain();
      b.outside = ctx.createGain();
      b.sendOut = ctx.createGain();
      b.sendCab = ctx.createGain();
      b.direct.connect(this.directSum);
      b.outside.connect(this.outsideSum);
      b.sendOut.connect(this.revSendOut);
      b.sendCab.connect(this.revSendCab);
      this.buses[name] = b;
    }
  }

  _ir(kind) {
    if (!this.irCache[kind]) this.irCache[kind] = makeIR(this.ctx, kind, kind.length * 7 + 3);
    return this.irCache[kind];
  }

  /** Make a convolver for a named IR (used by music/radio/voice for private spaces). */
  makeReverb(kind) {
    const c = this.ctx.createConvolver();
    c.normalize = false;
    c.buffer = this._ir(kind);
    return c;
  }

  // ---- mix controls -------------------------------------------------------
  _applyBus(b, ramp = 0.08) {
    const g = b.vol * b.duck;
    const t = this.ctx.currentTime;
    for (const n of [b.direct, b.outside, b.sendOut, b.sendCab]) n.gain.setTargetAtTime(g, t, ramp / 3 + 0.001);
  }
  setBusVolume(name, v, ramp = 0.1) {
    if (name === 'master') {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, ramp / 3 + 0.001);
      return;
    }
    const b = this.buses[name];
    if (!b) return;
    b.vol = v;
    this._applyBus(b, ramp);
  }
  duck(amount = 0.5, except = 'voice', ramp = 0.35) {
    const exc = Array.isArray(except) ? except : [except];
    for (const b of Object.values(this.buses)) {
      b.duck = exc.includes(b.name) ? 1 : Math.max(0, 1 - amount);
      this._applyBus(b, ramp);
    }
  }
  setMuffle(v, ramp = 0.25) {
    v = Math.min(1, Math.max(0, v));
    this.muffle = v;
    const t = this.ctx.currentTime;
    const ny = this.ctx.sampleRate * 0.48;
    const f = Math.min(ny, 20000 * Math.pow(620 / 20000, Math.pow(v, 0.8)));
    const tc = ramp / 3 + 0.001;
    this.muffleLP.frequency.setTargetAtTime(f, t, tc);
    this.muffleLP2.frequency.setTargetAtTime(Math.min(ny, f * 1.6), t, tc);
    this.muffleShelf.gain.setTargetAtTime(v * 3, t, tc); // car body boom
    this.muffleGain.gain.setTargetAtTime(1 - 0.5 * v, t, tc);
  }
  /** Outdoor acoustic environment: 'forest' | 'garage' | 'shrine' | 'hall'. Crossfades the outdoor reverb. */
  setEnvironment(kind, fade = 1.5) {
    if (!IR_SPECS[kind] || kind === this.env) return;
    this.env = kind;
    const t = this.ctx.currentTime;
    const useB = this._revActive === 'A';
    const conv = useB ? this.revB : this.revA;
    const key = useB ? 'B' : 'A';
    if (this._revEnv[key] !== kind) {
      conv.buffer = this._ir(kind);
      this._revEnv[key] = kind;
    }
    (useB ? this.revBGain : this.revAGain).gain.setTargetAtTime(1, t, fade / 3);
    (useB ? this.revAGain : this.revBGain).gain.setTargetAtTime(0, t, fade / 3);
    this._revActive = useB ? 'B' : 'A';
  }

  // ---- buffers ------------------------------------------------------------
  toAudioBuffer(res) {
    const ch = res.channels;
    const len = ch[0].length;
    const b = this.ctx.createBuffer(ch.length, Math.max(1, len), res.sr);
    for (let c = 0; c < ch.length; c++) {
      if (b.copyToChannel) b.copyToChannel(ch[c], c);
      else b.getChannelData(c).set(ch[c]);
    }
    return b;
  }
  _cachePut(key, buf) {
    this.cache.set(key, buf);
    this.cacheBytes += buf.length * buf.numberOfChannels * 4;
    if (this.cacheBytes > this.maxCacheBytes) {
      for (const [k, b] of this.cache) {
        if (this.cacheBytes <= this.maxCacheBytes * 0.8) break;
        if (k === key) continue;
        this.cache.delete(k);
        this.cacheBytes -= b.length * b.numberOfChannels * 4;
      }
    }
  }
  _cacheGet(key) {
    const b = this.cache.get(key);
    if (b) {
      // LRU touch
      this.cache.delete(key);
      this.cache.set(key, b);
    }
    return b;
  }
  /** Generic cached task -> AudioBuffer. Returns AudioBuffer (sync mode / cached) or Promise. */
  task(key, type, args, prio = 1) {
    const hit = this._cacheGet(key);
    if (hit) return hit;
    if (this.sync) {
      const res = this.gen.runSync(type, args);
      const buf = this.toAudioBuffer(res);
      buf._meta = res.meta;
      this._cachePut(key, buf);
      return buf;
    }
    return this.gen.run(type, args, key, prio).then((res) => {
      const ex = this._cacheGet(key);
      if (ex) return ex;
      const buf = this.toAudioBuffer(res);
      buf._meta = res.meta;
      this._cachePut(key, buf);
      return buf;
    });
  }
  sfxBuffer(id, v = 0, loop = false, prio = 0) {
    return this.task(`sfx:${id}:${v}:${loop ? 1 : 0}`, 'sfx', { id, v, loop }, prio);
  }
  hasSfx(id, v = 0, loop = false) {
    return this.cache.has(`sfx:${id}:${v}:${loop ? 1 : 0}`);
  }

  /** Warm the cache in the background (low priority). */
  warm(ids, { variants = 'all', loops = false } = {}) {
    const jobs = [];
    for (const id of ids) {
      const def = SOUNDS[id];
      if (!def) continue;
      const nv = variants === 'all' ? def.vars || 1 : Math.min(variants, def.vars || 1);
      for (let v = 0; v < nv; v++) if (!this.hasSfx(id, v, false)) jobs.push(this.sfxBuffer(id, v, false, 2));
      if (loops && def.loopable && !this.hasSfx(id, 0, true)) jobs.push(this.sfxBuffer(id, 0, true, 2));
    }
    return Promise.all(jobs.map((j) => Promise.resolve(j).catch(() => null)));
  }

  _pickVariant(id, def, opts) {
    const n = def.vars || 1;
    if (opts.variant != null) return Math.min(n - 1, Math.max(0, opts.variant | 0));
    if (def.fixedVariants) return 0;
    if (n <= 1) return 0;
    // prefer cached variants; avoid immediate repeats
    const last = this.lastVariant[id] ?? -1;
    const cands = [];
    for (let v = 0; v < n; v++) if (v !== last && this.hasSfx(id, v)) cands.push(v);
    let v = cands.length ? cands[Math.floor(Math.random() * cands.length)] : Math.floor(Math.random() * n);
    if (v === last) v = (v + 1) % n;
    this.lastVariant[id] = v;
    return v;
  }

  // ---- playback -----------------------------------------------------------
  /** One-shot. Returns a Voice handle (starts when its buffer is ready). */
  play(id, opts = {}) {
    const def = SOUNDS[id];
    if (!def) {
      if (!this._warned) this._warned = {};
      if (!this._warned[id]) {
        this._warned[id] = 1;
        console.warn(`[audio] unknown sound id "${id}"`);
      }
      return noopHandle();
    }
    const count = opts.count | 0;
    if (count > 1) {
      const interval = opts.interval ?? 0.45;
      const handles = [];
      for (let i = 0; i < count; i++) handles.push(this.play(id, { ...opts, count: 0, delay: (opts.delay || 0) + i * interval * (1 + (Math.random() - 0.5) * 0.08) }));
      const h = handles[0];
      return { ...h, stop: (f) => handles.forEach((x) => x.stop(f)), setVolume: (v, r) => handles.forEach((x) => x.setVolume(v, r)), ended: handles[handles.length - 1].ended };
    }
    const v = this._pickVariant(id, def, opts);
    const voice = new Voice(this, id, def, { ...opts });
    if (opts.rate == null && opts.randomize !== false) voice.rate = 1 + (Math.random() - 0.5) * 0.06;
    const when = this.ctx.currentTime + (opts.delay || 0);
    this._addVoice(voice);
    const b = this.sfxBuffer(id, v, false, 0);
    if (b instanceof Promise) {
      const t0 = this.ctx.currentTime;
      b.then((buf) => {
        // a late sound is still useful up to ~0.6 s; then drop it
        if (this.ctx.currentTime - t0 > 0.6 + (opts.delay || 0) && !opts.mustPlay) return voice._dispose();
        voice._start(buf, when);
      }).catch(() => voice._dispose());
    } else voice._start(b, when);
    return voice;
  }

  /** Play an arbitrary AudioBuffer as a voice (opts as play(), plus ref/rolloff/gain). */
  playBuffer(buffer, opts = {}) {
    const def = { gain: opts.gain ?? 1, ref: opts.ref ?? 1.5, rolloff: opts.rolloff ?? 1, reverb: opts.reverb ?? 0.1, cabin: opts.muffle === false, bus: opts.bus || 'sfx' };
    const voice = new Voice(this, '__buffer__', def, { ...opts, _loop: !!opts.loop });
    this._addVoice(voice);
    voice._start(buffer, this.ctx.currentTime + (opts.delay || 0));
    return voice;
  }

  /** Looping sound. Buffer loop if the def is loopable, else retriggered one-shots. */
  loop(id, opts = {}) {
    const def = SOUNDS[id];
    if (!def) return this.play(id, opts);
    const voice = new Voice(this, id, def, { ...opts, _loop: true });
    this._addVoice(voice);
    if (def.loopable) {
      const b = this.sfxBuffer(id, opts.variant ?? 0, true, 0);
      if (b instanceof Promise) b.then((buf) => voice._start(buf)).catch(() => voice._dispose());
      else voice._start(b);
      return voice;
    }
    // retrigger: chain without its own source; hits scheduled from update()
    voice.retrigger = {
      interval: opts.interval ?? def.loopInterval ?? 1,
      next: this.ctx.currentTime + (opts.delay || 0),
      alt: !!def.loopAlternate,
      n: 0,
    };
    voice._start(null);
    return voice;
  }

  _pumpRetriggers(until) {
    for (const v of this.voices) {
      const r = v.retrigger;
      if (!r || v.stopped) continue;
      let guard = 0;
      while (r.next < until && guard++ < 8) {
        const variant = r.alt ? r.n % (v.def.vars || 1) : this._pickVariant(v.id, v.def, {});
        const b = this.sfxBuffer(v.id, variant, false, 0);
        const when = Math.max(this.ctx.currentTime, r.next);
        if (!(b instanceof Promise)) {
          const src = this.ctx.createBufferSource();
          src.buffer = b;
          src.playbackRate.value = (v.params.pitch ?? 1) * (1 + (Math.random() - 0.5) * 0.02);
          src.connect(v.gain);
          src.start(when);
          src.onended = () => src.disconnect();
        }
        r.n++;
        r.next += r.interval / Math.max(0.05, v.rate);
      }
    }
  }

  _addVoice(v) {
    this.voices.push(v);
    if (this.voices.length > MAX_VOICES) {
      // steal the oldest non-loop voice
      const victim = this.voices.find((x) => !x.loop && !x.stopped);
      if (victim) victim.stop(0.03);
    }
  }
  _removeVoice(v) {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }
  _scheduleCleanup(v, at, force = false) {
    this.cleanups.push({ v, at, force });
  }

  /** Per-frame: listener + tracked sources + retriggers + cleanup. camera: THREE camera (optional). */
  update(dt, camera) {
    const now = this.ctx.currentTime;
    if (camera) this.spatial.updateListener(camera);
    this.spatial.update();
    this._pumpRetriggers(now + 0.25);
    if (this.cleanups.length) {
      for (let i = this.cleanups.length - 1; i >= 0; i--) {
        const c = this.cleanups[i];
        if (now >= c.at) {
          this.cleanups.splice(i, 1);
          if (c.force || !c.v.loop) c.v._dispose();
        }
      }
    }
  }

  stopAll(fade = 0.2) {
    for (const v of [...this.voices]) v.stop(fade);
  }
}
