// Low-level offline DSP used to synthesise every sound of the game into plain
// Float32Arrays (then wrapped in AudioBuffers by any BaseAudioContext). Pure JS,
// no WebAudio dependency, deterministic (seeded rng), so it runs identically in a
// realtime AudioContext, an OfflineAudioContext, or a test.
export const TAU = Math.PI * 2;

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const dbToGain = (db) => Math.pow(10, db / 20);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** mulberry32 */
export function rngFrom(seed = 1) {
  let a = seed >>> 0;
  const r = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };
  return r;
}

export function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const alloc = (sr, sec) => new Float32Array(Math.max(1, Math.ceil(sr * sec)));

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------
/** Paul Kellet's economy pink noise. */
export class Pink {
  constructor(rng) {
    this.rng = rng;
    this.b0 = this.b1 = this.b2 = 0;
  }
  next() {
    const w = this.rng() * 2 - 1;
    this.b0 = 0.99765 * this.b0 + w * 0.099046;
    this.b1 = 0.963 * this.b1 + w * 0.2965164;
    this.b2 = 0.57 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.2;
  }
}
/** Brown (red) noise, leaky integrated. */
export class Brown {
  constructor(rng) {
    this.rng = rng;
    this.y = 0;
  }
  next() {
    this.y = (this.y + (this.rng() * 2 - 1) * 0.06) * 0.996;
    return this.y * 3.2;
  }
}

/** Smooth random walk / value noise in [-1,1] (cheap 1D noise for modulations). */
export class Wander {
  constructor(rng, rate = 1) {
    this.rng = rng;
    this.rate = rate;
    this.a = rng() * 2 - 1;
    this.b = rng() * 2 - 1;
    this.t = 0;
  }
  next(dt) {
    this.t += dt * this.rate;
    while (this.t >= 1) {
      this.t -= 1;
      this.a = this.b;
      this.b = this.rng() * 2 - 1;
    }
    const s = this.t * this.t * (3 - 2 * this.t);
    return this.a + (this.b - this.a) * s;
  }
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
/** Topology-preserving-transform state variable filter: stable under fast modulation. */
export class SVF {
  constructor(sr, f = 1000, q = 0.707) {
    this.sr = sr;
    this.ic1 = 0;
    this.ic2 = 0;
    this.lp = this.bp = this.hp = 0;
    this.set(f, q);
  }
  set(f, q = this._q) {
    this._q = q;
    const fc = clamp(f, 5, this.sr * 0.47);
    const g = Math.tan((Math.PI * fc) / this.sr);
    const k = 1 / Math.max(q, 0.05);
    this.k = k;
    this.a1 = 1 / (1 + g * (g + k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
    return this;
  }
  process(x) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - this.k * v1 - v2;
    return v2;
  }
}

/** RBJ cookbook biquad (DF1). type: lowpass highpass bandpass notch peak lowshelf highshelf allpass */
export class Biquad {
  constructor(sr, type = 'lowpass', f = 1000, q = 0.707, gainDb = 0) {
    this.sr = sr;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(type, f, q, gainDb);
  }
  set(type, f, q = 0.707, gainDb = 0) {
    const fc = clamp(f, 5, this.sr * 0.47);
    const w0 = (TAU * fc) / this.sr;
    const cw = Math.cos(w0), sw = Math.sin(w0);
    const alpha = sw / (2 * Math.max(q, 0.01));
    const A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'highpass':
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'bandpass':
        b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'notch':
        b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'peak':
        b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 - (A - 1) * cw + s); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - s);
        a0 = A + 1 + (A - 1) * cw + s; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - s; break;
      }
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        b0 = A * (A + 1 + (A - 1) * cw + s); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - s);
        a0 = A + 1 - (A - 1) * cw + s; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - s; break;
      }
      case 'allpass':
        b0 = 1 - alpha; b1 = -2 * cw; b2 = 1 + alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      default: // lowpass
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

export class OnePole {
  constructor(sr, f = 1000) {
    this.sr = sr;
    this.y = 0;
    this.set(f);
  }
  set(f) {
    this.a = 1 - Math.exp((-TAU * clamp(f, 1, this.sr * 0.49)) / this.sr);
    return this;
  }
  lp(x) {
    this.y += this.a * (x - this.y);
    return this.y;
  }
  hp(x) {
    this.y += this.a * (x - this.y);
    return x - this.y;
  }
}

/** Two-pole resonator (a single mode excited by an input signal). t60 = seconds to -60 dB.
 *  Impulse-normalised: a unit impulse rings at amplitude `gain`. */
export class Reson {
  constructor(sr, f, t60, gain = 1) {
    this.sr = sr;
    this.y1 = this.y2 = 0;
    this.gain = gain;
    this.set(f, t60);
  }
  set(f, t60) {
    const r = Math.exp(-6.9078 / (Math.max(t60, 0.001) * this.sr));
    const w = (TAU * clamp(f, 1, this.sr * 0.48)) / this.sr;
    this.c1 = 2 * r * Math.cos(w);
    this.c2 = -r * r;
    this.norm = Math.sin(w) * this.gain;
    return this;
  }
  process(x) {
    const y = this.c1 * this.y1 + this.c2 * this.y2 + x * this.norm;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Bank of resonators driven by the same excitation. modes: [{f, t60, a}] */
export class ResonBank {
  constructor(sr, modes) {
    this.r = modes.map((m) => new Reson(sr, m.f, m.t60, m.a ?? 1));
  }
  process(x) {
    let s = 0;
    for (let i = 0; i < this.r.length; i++) s += this.r[i].process(x);
    return s;
  }
}

/** Simple delay line with fractional (linear) read. */
export class Delay {
  constructor(maxSamples) {
    this.buf = new Float32Array(maxSamples + 2);
    this.n = this.buf.length;
    this.w = 0;
  }
  write(x) {
    this.buf[this.w] = x;
    this.w = (this.w + 1) % this.n;
  }
  read(d) {
    let r = this.w - 1 - d;
    while (r < 0) r += this.n;
    const i = Math.floor(r);
    const f = r - i;
    const a = this.buf[i % this.n];
    const b = this.buf[(i + 1) % this.n];
    return a + (b - a) * f;
  }
}

/** Freeverb-style mono reverb used to bake distance/ghost tails into buffers. */
export class Verb {
  constructor(sr, { room = 0.8, damp = 0.4, wet = 0.3 } = {}) {
    const s = sr / 44100;
    const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
    const apT = [556, 441, 341, 225];
    this.combs = combT.map((t) => ({ buf: new Float32Array(Math.round(t * s)), i: 0, f: 0 }));
    this.aps = apT.map((t) => ({ buf: new Float32Array(Math.round(t * s)), i: 0 }));
    this.fb = room * 0.28 + 0.7;
    this.damp = damp;
    this.wet = wet;
  }
  process(x) {
    const inp = x * 0.015;
    let out = 0;
    for (const c of this.combs) {
      const y = c.buf[c.i];
      c.f = y * (1 - this.damp) + c.f * this.damp;
      c.buf[c.i] = inp + c.f * this.fb;
      c.i = (c.i + 1) % c.buf.length;
      out += y;
    }
    for (const a of this.aps) {
      const b = a.buf[a.i];
      a.buf[a.i] = out + b * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      out = b - out;
    }
    return out * this.wet;
  }
}

// ---------------------------------------------------------------------------
// Generators / modal synthesis
// ---------------------------------------------------------------------------
/**
 * Add exponentially decaying sinusoids (modal synthesis) into `out` starting at sample `at`.
 * modes: [{f, t60, a, ph?, fEnd?}] (fEnd: linear glide over the decay, for pitch-drop of struck plates)
 */
export function addModes(out, sr, at, modes, gain = 1) {
  const n = out.length;
  for (const m of modes) {
    if (!(m.f > 0) || m.f >= sr * 0.48) continue;
    const r = Math.exp(-6.9078 / (Math.max(m.t60, 0.002) * sr));
    const len = Math.min(n - at, Math.ceil(m.t60 * sr * 1.05));
    if (len <= 0) continue;
    const amp = (m.a ?? 1) * gain;
    if (m.fEnd && m.fEnd !== m.f) {
      let ph = m.ph ?? 0;
      let env = amp;
      for (let i = 0; i < len; i++) {
        const fr = m.f + (m.fEnd - m.f) * (i / len);
        ph += (TAU * fr) / sr;
        out[at + i] += Math.sin(ph) * env;
        env *= r;
      }
      continue;
    }
    const w = (TAU * m.f) / sr;
    const cr = Math.cos(w) * r, sr2 = Math.sin(w) * r;
    let re = Math.cos(m.ph ?? 0) * amp, im = Math.sin(m.ph ?? 0) * amp;
    for (let i = 0; i < len; i++) {
      out[at + i] += im;
      const nr = re * cr - im * sr2;
      im = re * sr2 + im * cr;
      re = nr;
    }
  }
  return out;
}

/** Karplus-Strong plucked/hammered string. Returns a new buffer. */
export function ksString(sr, f, dur, opts = {}) {
  const rng = opts.rng || rngFrom(7);
  const out = alloc(sr, dur);
  const period = sr / f;
  const N = Math.floor(period);
  const frac = period - N; // allpass fractional tuning
  const apC = (1 - frac) / (1 + frac);
  const dl = new Float32Array(N + 2);
  const bright = opts.bright ?? 0.5; // excitation brightness
  const decay = opts.decay ?? 3.0; // t60 seconds at fundamental
  const pos = opts.pos ?? 0.13; // pluck position (comb)
  // excitation: filtered noise burst (hammer = smoother)
  const lp = new OnePole(sr, 300 + bright * 9000);
  for (let i = 0; i < N; i++) dl[i] = lp.lp(rng() * 2 - 1);
  // pluck-position comb on the excitation
  const pd = Math.max(1, Math.floor(N * pos));
  for (let i = N - 1; i >= pd; i--) dl[i] -= dl[i - pd];
  // loss per period from t60
  const g = Math.pow(10, -3 / (decay * f));
  const damp = opts.damp ?? 0.5; // 0.5 = classic averaging
  let idx = 0, prev = 0, apx1 = 0, apy1 = 0;
  const buzz = opts.buzz || 0;
  for (let i = 0; i < out.length; i++) {
    const x = dl[idx];
    const next = dl[(idx + 1) % N];
    let y = g * ((1 - damp) * x + damp * next);
    // fractional delay allpass
    const ap = apC * y + apx1 - apC * apy1;
    apx1 = y;
    apy1 = ap;
    y = ap;
    if (buzz > 0) {
      // bridge buzz (sitar/phin-like): one-sided soft clip
      if (y > buzz) y = buzz + (y - buzz) * 0.3;
    }
    dl[idx] = y;
    idx = (idx + 1) % N;
    out[i] = x;
    prev = x;
  }
  return out;
}

/** Band-limited-ish saw via polyBLEP. Stateful oscillator. */
export class Osc {
  constructor(sr, f = 220, phase = 0) {
    this.sr = sr;
    this.p = phase;
    this.f = f;
  }
  blep(t, dt) {
    if (t < dt) {
      t /= dt;
      return t + t - t * t - 1;
    } else if (t > 1 - dt) {
      t = (t - 1) / dt;
      return t * t + t + t + 1;
    }
    return 0;
  }
  saw(f = this.f) {
    const dt = f / this.sr;
    let y = 2 * this.p - 1 - this.blep(this.p, dt);
    this.p += dt;
    if (this.p >= 1) this.p -= 1;
    return y;
  }
  square(f = this.f, pw = 0.5) {
    const dt = f / this.sr;
    let y = this.p < pw ? 1 : -1;
    y += this.blep(this.p, dt);
    y -= this.blep((this.p + 1 - pw) % 1, dt);
    this.p += dt;
    if (this.p >= 1) this.p -= 1;
    return y;
  }
  sine(f = this.f) {
    const y = Math.sin(TAU * this.p);
    this.p += f / this.sr;
    if (this.p >= 1) this.p -= 1;
    return y;
  }
  tri(f = this.f) {
    const y = 1 - 4 * Math.abs(this.p - 0.5);
    this.p += f / this.sr;
    if (this.p >= 1) this.p -= 1;
    return y;
  }
}

// ---------------------------------------------------------------------------
// Buffer utilities
// ---------------------------------------------------------------------------
export function mixInto(dst, src, at = 0, gain = 1) {
  const o = Math.round(at);
  const n = Math.min(src.length, dst.length - o);
  for (let i = Math.max(0, -o); i < n; i++) dst[o + i] += src[i] * gain;
  return dst;
}
export function peak(a) {
  let p = 0;
  for (let i = 0; i < a.length; i++) {
    const v = Math.abs(a[i]);
    if (v > p) p = v;
  }
  return p;
}
export function rms(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, a.length));
}
export function scale(a, g) {
  for (let i = 0; i < a.length; i++) a[i] *= g;
  return a;
}
export function normalize(a, target = 0.89) {
  const p = peak(a);
  if (p > 1e-9) scale(a, target / p);
  return a;
}
/** Remove NaN/Inf and DC; returns a. */
export function sanitize(a) {
  let dc = 0;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i])) a[i] = 0;
    dc += a[i];
  }
  dc /= a.length || 1;
  if (Math.abs(dc) > 1e-4) for (let i = 0; i < a.length; i++) a[i] -= dc;
  return a;
}
export function fadeIn(a, sr, sec) {
  const n = Math.min(a.length, Math.floor(sr * sec));
  for (let i = 0; i < n; i++) a[i] *= i / n;
  return a;
}
export function fadeOut(a, sr, sec) {
  const n = Math.min(a.length, Math.floor(sr * sec));
  const s = a.length - n;
  for (let i = 0; i < n; i++) a[s + i] *= 1 - i / n;
  return a;
}
export function reverse(a) {
  const b = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) b[i] = a[a.length - 1 - i];
  return b;
}
export function softClip(x) {
  return Math.tanh(x);
}
/** Make a buffer loop seamlessly: crossfade its tail into its head. Returns a shorter buffer. */
export function loopify(a, sr, xfadeSec = 0.25) {
  const x = Math.min(Math.floor(sr * xfadeSec), Math.floor(a.length / 3));
  const n = a.length - x;
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = a[i];
  for (let i = 0; i < x; i++) {
    const t = i / x;
    const gi = Math.sqrt(t), go = Math.sqrt(1 - t);
    b[i] = a[i] * gi + a[n + i] * go;
  }
  return b;
}
/** Linear-interpolated resample by ratio (ratio > 1 = higher pitch/shorter). */
export function resample(a, ratio) {
  const n = Math.max(1, Math.floor(a.length / ratio));
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const k = Math.floor(p);
    const f = p - k;
    b[i] = (a[k] || 0) * (1 - f) + (a[k + 1] || 0) * f;
  }
  return b;
}
/** Apply a filter object (with process()) over a buffer in place. */
export function filt(a, f) {
  for (let i = 0; i < a.length; i++) a[i] = f.process(a[i]);
  return a;
}
/** Bake a reverb tail: returns a new (longer) buffer. */
export function bakeVerb(a, sr, opts = {}) {
  const tail = opts.tail ?? 1.5;
  const out = new Float32Array(a.length + Math.floor(tail * sr));
  const v = new Verb(sr, opts);
  const dry = opts.dry ?? 1;
  const pre = Math.floor((opts.predelay ?? 0.01) * sr);
  for (let i = 0; i < out.length; i++) {
    const x = i < a.length ? a[i] : 0;
    out[i] += x * dry;
    const w = v.process(x);
    if (i + pre < out.length) out[i + pre] += w;
  }
  return out;
}
/** Exponential envelope helper: attack (s), decay t60 (s) at time t. */
export function envAD(t, a, d) {
  if (t < 0) return 0;
  if (t < a) return t / a;
  return Math.exp((-6.9 * (t - a)) / d);
}
/** Generic shaped burst of filtered noise added into out. */
export function noiseBurst(out, sr, rng, at, dur, { f = 1000, q = 0.7, type = 'bp', a = 0.002, d = dur, gain = 1, fEnd = null } = {}) {
  const s = Math.floor(at * sr);
  const n = Math.min(out.length - s, Math.floor(dur * sr));
  const flt = new SVF(sr, f, q);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if (fEnd != null && (i & 15) === 0) flt.set(f + (fEnd - f) * (i / n), q);
    flt.process(rng() * 2 - 1);
    const y = type === 'lp' ? flt.lp : type === 'hp' ? flt.hp : flt.bp;
    out[s + i] += y * envAD(t, a, d) * gain;
  }
  return out;
}
/** Short impact click (broadband impulse lightly filtered). */
export function click(out, sr, rng, at, { f = 3000, q = 1.2, dur = 0.01, gain = 1 } = {}) {
  return noiseBurst(out, sr, rng, at, dur, { f, q, a: 0.0003, d: dur * 0.7, gain });
}
/**
 * Stick-slip friction creak: a train of impulses with wandering period, each exciting a resonator bank.
 * opts {rate0, rate1 (Hz of slips), modes:[{f,t60,a}], jitter, gain, env(t01)}
 */
export function creak(out, sr, rng, at, dur, opts = {}) {
  const s = Math.floor(at * sr);
  const n = Math.min(out.length - s, Math.floor(dur * sr));
  const bank = new ResonBank(sr, opts.modes || [{ f: 600, t60: 0.05 }, { f: 1300, t60: 0.03 }, { f: 2400, t60: 0.02 }]);
  const r0 = opts.rate0 ?? 60, r1 = opts.rate1 ?? 120;
  const jit = opts.jitter ?? 0.25;
  const gain = opts.gain ?? 1;
  const env = opts.env || ((t) => Math.sin(Math.PI * t));
  const w = new Wander(rng, opts.wanderRate ?? 6);
  let next = 0;
  for (let i = 0; i < n; i++) {
    const t01 = i / n;
    let x = 0;
    if (i >= next) {
      const rate = (r0 + (r1 - r0) * t01) * (1 + w.next(1 / 30) * 0.3);
      next = i + Math.max(1, Math.floor((sr / Math.max(rate, 1)) * (1 + (rng() * 2 - 1) * jit)));
      x = (0.6 + rng() * 0.6) * env(t01);
    }
    out[s + i] += bank.process(x) * gain;
  }
  return out;
}
