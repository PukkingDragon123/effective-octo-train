// Klatt-style formant synthesiser rendered offline into a Float32Array.
// Drives speech murmur, singing, whispers, chanting and animal calls (barks,
// howls, gecko, rooster, elephant): anything with a glottal-ish source shaped by
// vocal-tract resonances.
//
// Usage:
//   const v = new VoxScore();
//   v.seg(0.12, { f0: 120, av: 0, af: 0.6, ff: 5500 }, { ... });   // start params, end params (optional)
//   const out = renderVox(sr, v, { rng, jitter, shimmer, breath, formantScale, rough });
//
// Params (all optional, carried over from the previous segment when omitted):
//   f0 Hz · av voicing amp · ah aspiration amp (noise through formants) · af frication amp
//   ff frication centre Hz · fq frication Q · F1..F5 Hz · B1..B5 bandwidth Hz · tilt (0..1, darker source)
//   oq open quotient (0.3 pressed .. 0.8 breathy) · sub (period-doubling roughness 0..1)
import { TAU, clamp, rngFrom, SVF, Wander, Biquad } from './dsp.js';

const KEYS = ['f0', 'av', 'ah', 'af', 'ff', 'fq', 'F1', 'F2', 'F3', 'F4', 'F5', 'B1', 'B2', 'B3', 'B4', 'B5', 'tilt', 'oq', 'sub', 'nas'];
const DEFAULTS = {
  f0: 120, av: 0, ah: 0, af: 0, ff: 4000, fq: 1.5,
  F1: 500, F2: 1500, F3: 2500, F4: 3400, F5: 4300,
  B1: 70, B2: 100, B3: 150, B4: 220, B5: 300,
  tilt: 0.3, oq: 0.55, sub: 0, nas: 0,
};

export class VoxScore {
  constructor(init = {}) {
    this.segs = [];
    this.cur = { ...DEFAULTS, ...init };
    this.duration = 0;
  }
  /** Append a segment of `dur` seconds interpolating from `a` (merged onto current) to `b` (merged onto a). */
  seg(dur, a = {}, b = null, curve = 'lin') {
    const A = { ...this.cur, ...a };
    const B = b ? { ...A, ...b } : A;
    this.segs.push({ t0: this.duration, dur: Math.max(1e-4, dur), A, B, curve });
    this.duration += Math.max(1e-4, dur);
    this.cur = { ...B };
    return this;
  }
  /** Silence (voicing/noise off) for dur seconds. */
  rest(dur) {
    return this.seg(dur, { av: 0, ah: 0, af: 0 });
  }
}

/** Klatt cascade resonator (unity gain at DC). */
class KRes {
  constructor(sr) {
    this.sr = sr;
    this.y1 = this.y2 = 0;
    this.A = 1; this.B = 0; this.C = 0;
  }
  set(F, BW) {
    const T = 1 / this.sr;
    const f = clamp(F, 30, this.sr * 0.45);
    const r = Math.exp(-Math.PI * Math.max(BW, 10) * T);
    this.C = -r * r;
    this.B = 2 * r * Math.cos(TAU * f * T);
    this.A = 1 - this.B - this.C;
  }
  process(x) {
    const y = this.A * x + this.B * this.y1 + this.C * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

const easeF = {
  lin: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  smooth: (t) => t * t * (3 - 2 * t),
};

/**
 * Render a VoxScore. opts:
 *  rng, jitter (0.01), shimmer (0.05), breath (aspiration mixed with voicing 0..1),
 *  formantScale (1 male, 1.17 female, 1.3 child), pitchScale, gain,
 *  whisper (bool: all voicing becomes aspiration), vibrato {rate, depth (semitones)}, drift (slow f0 wander semitones)
 *  smooth (s, 0 = off): one-pole glide on formants / f0 / source shape so segment boundaries coarticulate
 *    instead of jumping (speech); smoothAmp (s): the same on av / ah / af (no clicks at voicing on/offsets)
 *  tremor {rate Hz, depth semitones, amp 0..1}: elderly / frightened shake on f0 and loudness
 *  hpc (bool): higher-pole correction: three fixed resonances above F5 (scaled with formantScale) so a
 *    24-32 kHz render keeps the 4-8 kHz air of a real voice instead of the 5-pole cascade's cliff
 */
export function renderVox(sr, score, opts = {}) {
  const rng = opts.rng || rngFrom(1);
  const n = Math.max(1, Math.ceil((score.duration + (opts.tail ?? 0.05)) * sr));
  const out = new Float32Array(n);
  const fs = opts.formantScale ?? 1;
  const ps = opts.pitchScale ?? 1;
  const jitter = opts.jitter ?? 0.012;
  const shimmer = opts.shimmer ?? 0.06;
  const breath = opts.breath ?? 0.05;
  const whisper = !!opts.whisper;
  const vib = opts.vibrato || null;
  const drift = opts.drift ?? 0.15;
  const trem = opts.tremor || null;
  const upd = 24; // control-rate (samples)
  const kF = opts.smooth > 0 ? 1 - Math.exp(-upd / (sr * opts.smooth)) : 1;
  const kA = opts.smoothAmp > 0 ? 1 - Math.exp(-upd / (sr * opts.smoothAmp)) : 1;
  const kP = opts.smooth > 0 ? 1 - Math.exp(-upd / (sr * opts.smooth * 1.6)) : 1;
  const S = { ...DEFAULTS };
  let sInit = false;
  const res = [new KRes(sr), new KRes(sr), new KRes(sr), new KRes(sr), new KRes(sr)];
  const hpc = opts.hpc ? [4950, 5900, 7000].filter((F) => F * fs < sr * 0.42).map((F, k) => {
    const r = new KRes(sr);
    r.set(F * fs, 380 + k * 160);
    return r;
  }) : [];
  const nasRes = new KRes(sr); // nasal murmur pole (~270 Hz)
  nasRes.set(270, 100);
  const fric = new SVF(sr, 4000, 1.5);
  const tiltLP = new SVF(sr, 3000, 0.5);
  const aspHP = new SVF(sr, whisper ? 1300 : 400, 0.6);
  const w = new Wander(rng, 3);
  const wSlow = new Wander(rng, 0.7);
  const P = { ...DEFAULTS };
  let segI = 0;
  let phase = 0;
  let periodAmp = 1;
  let periodCount = 0;
  let prevSrc = 0;
  let lastFlow = 0;
  let curJ = 0;
  const segs = score.segs;
  const wTrem = trem ? new Wander(rng, trem.rate * 0.7) : null;
  let tremAmp = 1;
  let av = 0, ah = 0, af = 0, f0 = 120, oq = 0.55, sub = 0, nas = 0;
  for (let i = 0; i < n; i++) {
    if (i % upd === 0) {
      const t = i / sr;
      while (segI < segs.length - 1 && t >= segs[segI].t0 + segs[segI].dur) segI++;
      const s = segs[segI];
      if (s) {
        const u = clamp((t - s.t0) / s.dur);
        const e = (easeF[s.curve] || easeF.lin)(u);
        for (let k = 0; k < KEYS.length; k++) {
          const key = KEYS[k];
          P[key] = s.A[key] + (s.B[key] - s.A[key]) * e;
        }
        if (t > score.duration) P.av = P.ah = P.af = 0;
      }
      if (!sInit || (kF === 1 && kA === 1)) {
        for (let k = 0; k < KEYS.length; k++) S[KEYS[k]] = P[KEYS[k]];
        sInit = true;
      } else {
        // coarticulation glide: formants + source shape (kF), f0 (kP, slower), amplitudes (kA)
        for (let k = 0; k < KEYS.length; k++) {
          const key = KEYS[k];
          const c = key === 'av' || key === 'ah' || key === 'af' ? kA : key === 'f0' ? kP : kF;
          S[key] += c * (P[key] - S[key]);
        }
      }
      for (let k = 0; k < 5; k++) {
        const F = S['F' + (k + 1)] * fs;
        const B = S['B' + (k + 1)] * (whisper ? 1.6 : 1) * (1 + S.nas * (k === 0 ? 1.5 : 0.4));
        res[k].set(F, B);
      }
      fric.set(S.ff, S.fq);
      tiltLP.set(clamp(5200 - S.tilt * 4600, 300, 8000), 0.5);
      av = S.av; ah = S.ah; af = S.af; oq = clamp(S.oq, 0.2, 0.9); sub = S.sub; nas = S.nas;
      let semis = w.next(upd / sr) * drift * 0.5 + wSlow.next(upd / sr) * drift;
      if (vib) semis += Math.sin(TAU * vib.rate * t + (vib.phase || 0)) * vib.depth * clamp(t / (vib.delay || 0.001));
      if (trem) {
        const tw = Math.sin(TAU * trem.rate * t) * 0.75 + wTrem.next(upd / sr) * 0.5;
        semis += tw * trem.depth;
        tremAmp = 1 + tw * (trem.amp ?? 0.1);
      }
      f0 = S.f0 * ps * Math.pow(2, semis / 12);
    }
    // --- glottal source (Rosenberg pulse, differentiated = lip radiation) ---
    const f = Math.max(20, f0 * (1 + curJ));
    phase += f / sr;
    if (phase >= 1) {
      phase -= 1;
      periodCount++;
      curJ = (rng() * 2 - 1) * jitter * (1 + sub * 4);
      periodAmp = 1 + (rng() * 2 - 1) * shimmer;
      if (sub > 0 && periodCount & 1) periodAmp *= 1 - sub * 0.75; // period doubling = growl/creak
    }
    const tp = oq * 0.62, tn = oq * 0.38;
    let flow;
    if (phase < tp) flow = 0.5 * (1 - Math.cos((Math.PI * phase) / tp));
    else if (phase < tp + tn) flow = Math.cos((Math.PI * (phase - tp)) / (2 * tn));
    else flow = 0;
    const dflow = (flow - lastFlow) * (sr / Math.max(f, 50)) * 0.12;
    lastFlow = flow;
    let src = whisper ? 0 : dflow * av * periodAmp * tremAmp;
    // aspiration noise (modulated by glottal flow when voicing, breathy voice)
    const nz = rng() * 2 - 1;
    const asp = aspHP.process(nz) * (whisper ? (av * 0.9 + ah) * 2.2 : ah * 2.2 + av * breath * (0.4 + flow) * 0.6);
    src = tiltLP.process(src + asp);
    if (nas > 0) src = src * (1 - nas * 0.6) + nasRes.process(src) * nas * 0.5;
    // cascade formants
    let y = src;
    for (let k = 0; k < 5; k++) y = res[k].process(y);
    for (let k = 0; k < hpc.length; k++) y = hpc[k].process(y);
    // parallel frication
    fric.process(rng() * 2 - 1);
    y += (fric.bp + fric.hp * 0.25) * af * 0.6;
    // radiation-ish (simple first difference blend for brightness)
    const yo = y - prevSrc * 0.6;
    prevSrc = y;
    out[i] = yo;
  }
  // presence: high-shelf lift (whispers / breaths live in 1.5-5 kHz, the cascade rolls that off)
  const pres = opts.presence ?? (whisper ? 13 : 0);
  if (pres) {
    const hs = new Biquad(sr, 'highshelf', 1800, 0.7, pres);
    const pk = new Biquad(sr, 'peak', 3200, 1.2, pres * 0.35);
    for (let i = 0; i < n; i++) out[i] = pk.process(hs.process(out[i]));
  }
  if (!Number.isFinite(out[0])) out.fill(0);
  return out;
}

/** Vowel formant targets (adult male, Hz). */
export const VOWELS = {
  a: [740, 1180, 2450, 3400],
  i: [280, 2250, 2950, 3600],
  ue: [330, 1450, 2400, 3400],
  u: [310, 850, 2250, 3300],
  e: [430, 2000, 2650, 3500],
  ae: [620, 1760, 2550, 3500],
  oe: [480, 1320, 2450, 3400],
  o: [450, 830, 2450, 3400],
  or: [590, 900, 2450, 3400],
  schwa: [520, 1450, 2500, 3500],
  oo: [360, 780, 2300, 3300],
};

export function vowelParams(v) {
  const f = VOWELS[v] || VOWELS.schwa;
  return { F1: f[0], F2: f[1], F3: f[2], F4: f[3] };
}
