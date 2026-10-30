// Musical instruments rendered to note buffers (mono Float32Array). Thai-
// inspired timbres (ranat, khim, phin, khaen, ching, thon/klong), plus pads,
// music box, bells, drones, and the old big-band palette for the radio ballads.
import { TAU, alloc, normalize, mixInto, SVF, Biquad, OnePole, Wander, Pink, Brown, noiseBurst, addModes, Osc, fadeOut, fadeIn, ksString, rngFrom, Reson, clamp, loopify } from './dsp.js';
import { excite, burst, bellPartials, thud } from './lib.js';

/** Thai-style 7-tone equal temperament: step -> ratio. */
export const thai7 = (step) => Math.pow(2, step / 7);

function ranat(sr, f, vel, rng, { soft = false } = {}) {
  const dur = clamp(2.4 - Math.log2(f / 200) * 0.6, 0.6, 2.6);
  const out = alloc(sr, dur);
  const bright = soft ? 0.35 : 0.7 + vel * 0.3;
  const t = dur / 2.2;
  addModes(out, sr, 0, [
    { f, t60: 1.6 * t, a: 1 },
    { f: f * 1.004, t60: 1.3 * t, a: 0.25 },
    { f: f * 2.76, t60: 0.45 * t, a: 0.38 * bright },
    { f: f * 3.93, t60: 0.25 * t, a: 0.12 * bright },
    { f: f * 5.4, t60: 0.14 * t, a: 0.16 * bright },
    { f: f * 8.93, t60: 0.06 * t, a: 0.07 * bright },
  ].map((m) => ({ ...m, ph: rng() * TAU })));
  // mallet knock
  noiseBurst(out, sr, rng, 0, 0.012, { f: 1800 + f, q: 0.8, a: 0.0002, d: 0.006, gain: 0.12 + bright * 0.15 });
  // boat resonator body
  const body = new Reson(sr, 310, 0.12, 0.25);
  for (let i = 0; i < Math.min(out.length, sr * 0.4); i++) out[i] += body.process(out[i]) * 0.15;
  return out;
}

function khim(sr, f, vel, rng) {
  const dur = clamp(4.0 - Math.log2(f / 200) * 0.8, 1.5, 4.5);
  const out = alloc(sr, dur);
  for (let s = 0; s < 3; s++) {
    const det = 1 + (s - 1) * 0.0016 + (rng() - 0.5) * 0.0006;
    const str = ksString(sr, f * det, dur, { rng, bright: 0.35 + vel * 0.35, decay: 2.6, pos: 0.11 + s * 0.02, damp: 0.42 });
    mixInto(out, str, 0, 0.4);
  }
  // soundboard
  const b1 = new Reson(sr, 240, 0.08, 0.3), b2 = new Reson(sr, 520, 0.05, 0.2);
  const hp = new OnePole(sr, 90);
  for (let i = 0; i < out.length; i++) out[i] = hp.hp(out[i] + b1.process(out[i]) * 0.2 + b2.process(out[i]) * 0.15);
  noiseBurst(out, sr, rng, 0, 0.01, { f: 2500, q: 0.7, a: 0.0002, d: 0.004, gain: 0.05 });
  fadeOut(out, sr, 0.3);
  return out;
}

function phin(sr, f, vel, rng) {
  const dur = clamp(2.2 - Math.log2(f / 200) * 0.4, 0.8, 2.5);
  const str = ksString(sr, f, dur, { rng, bright: 0.75 + vel * 0.25, decay: 1.6, pos: 0.18, damp: 0.38, buzz: 0.18 });
  const out = alloc(sr, dur);
  const body = [new Reson(sr, 190, 0.06, 0.5), new Reson(sr, 410, 0.05, 0.4), new Reson(sr, 950, 0.03, 0.3)];
  const hp = new OnePole(sr, 120);
  for (let i = 0; i < out.length; i++) {
    const x = str[i];
    out[i] = hp.hp(x + (body[0].process(x) + body[1].process(x) + body[2].process(x)) * 0.25);
  }
  fadeOut(out, sr, 0.2);
  return out;
}

function bassPluck(sr, f, vel, rng) {
  const dur = 1.6;
  const s = ksString(sr, f, dur, { rng, bright: 0.25 + vel * 0.2, decay: 1.4, pos: 0.25, damp: 0.5 });
  const lp = new SVF(sr, 900, 0.7);
  for (let i = 0; i < s.length; i++) s[i] = lp.process(s[i]);
  fadeOut(s, sr, 0.25);
  return s;
}

function pianoNote(sr, f, vel, rng) {
  const dur = clamp(3.5 - Math.log2(f / 260) * 0.8, 1.2, 4);
  const out = alloc(sr, dur);
  for (let s = 0; s < 2; s++) {
    const str = ksString(sr, f * (1 + (s - 0.5) * 0.0012), dur, { rng, bright: 0.2 + vel * 0.4, decay: 3, pos: 0.12, damp: 0.46 });
    mixInto(out, str, 0, 0.5);
  }
  const lp = new SVF(sr, 2500 + vel * 2000, 0.7);
  for (let i = 0; i < out.length; i++) out[i] = lp.process(out[i]);
  noiseBurst(out, sr, rng, 0, 0.02, { f: 120, q: 1, a: 0.001, d: 0.02, gain: 0.05 });
  fadeOut(out, sr, 0.3);
  return out;
}

function musicBox(sr, f, vel, rng) {
  const dur = 2.6;
  const out = alloc(sr, dur);
  addModes(out, sr, 0, [
    { f, t60: 2.4, a: 1, ph: rng() * TAU },
    { f: f * 1.0015, t60: 2.2, a: 0.3 },
    { f: f * 5.93, t60: 0.5, a: 0.18 },
    { f: f * 13.4, t60: 0.15, a: 0.06 },
  ].filter((m) => m.f < sr * 0.45));
  noiseBurst(out, sr, rng, 0, 0.004, { f: 4500, q: 1.2, a: 0.0001, d: 0.002, gain: 0.12 });
  return out;
}

function smallBell(sr, f, vel, rng) {
  const out = alloc(sr, 4);
  addModes(out, sr, 0, bellPartials(f, 0.35, rng).filter((m) => m.f < sr * 0.45));
  return out;
}

function khongNote(sr, f, vel, rng) {
  // gong-circle kettle: strong fundamental with slight beating, few partials
  const out = alloc(sr, 3.5);
  addModes(out, sr, 0, [
    { f, t60: 3.0, a: 1 }, { f: f * 1.004, t60: 2.6, a: 0.5 }, { f: f * 2.01, t60: 1.2, a: 0.25 }, { f: f * 2.97, t60: 0.6, a: 0.12 }, { f: f * 4.3, t60: 0.3, a: 0.05 },
  ]);
  noiseBurst(out, sr, rng, 0, 0.01, { f: 900, q: 0.8, a: 0.0002, d: 0.006, gain: 0.08 });
  return out;
}

/** Sustained free-reed (khaen-like) tone for dur seconds; breath AM optional. */
function khaenTone(sr, freqs, dur, rng, { breathRate = 0, bright = 0.6 } = {}) {
  const out = alloc(sr, dur);
  const os = freqs.map(() => new Osc(sr, 1, rng()));
  const lp = new SVF(sr, 1800 + bright * 2500, 0.8);
  const f1 = new SVF(sr, 1100, 3);
  const pink = new Pink(rng);
  const w = new Wander(rng, 3);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    let s = 0;
    for (let k = 0; k < freqs.length; k++) s += os[k].square(freqs[k] * (1 + w.next(0) * 0.002), 0.22) * (k === 0 ? 1 : 0.7);
    s /= freqs.length;
    const br = breathRate ? 0.65 + 0.35 * Math.pow(Math.abs(Math.sin(Math.PI * breathRate * t)), 0.5) : 1;
    const env = Math.min(1, t / 0.06) * Math.min(1, (dur - t) / 0.12);
    lp.process(s + pink.next() * 0.04);
    f1.process(lp.lp);
    out[i] = (lp.lp * 0.7 + f1.bp * 0.5) * env * br;
  }
  return out;
}

function chingHit(sr, open, rng) {
  const dur = open ? 1.6 : 0.18;
  const out = alloc(sr, dur);
  const base = 2950 + rng() * 120;
  const ratios = [1, 1.41, 1.83, 2.27, 2.65, 3.12, 3.6];
  addModes(out, sr, 0, ratios.map((r, k) => ({ f: base * r * (1 + (rng() - 0.5) * 0.01), t60: (open ? 1.4 : 0.09) / (1 + k * 0.25), a: 1 / (1 + k * 0.4), ph: rng() * TAU })).filter((m) => m.f < sr * 0.45));
  noiseBurst(out, sr, rng, 0, open ? 0.05 : 0.03, { f: 7000, q: 0.6, a: 0.0002, d: open ? 0.03 : 0.015, gain: 0.25 });
  return out;
}

function drumHit(sr, kind, vel, rng) {
  const out = alloc(sr, kind === 'klong' ? 1.2 : 0.6);
  if (kind === 'klong') {
    thud(out, sr, rng, 0, { f: 78, fEnd: 58, t60: 0.9, noise: 0.25, click: 0.15 });
    addModes(out, sr, 0, [{ f: 62 * 1.59, t60: 0.4, a: 0.25 }, { f: 62 * 2.14, t60: 0.25, a: 0.15 }]);
  } else if (kind === 'tum') {
    thud(out, sr, rng, 0, { f: 128, fEnd: 104, t60: 0.38, noise: 0.15, click: 0.25 });
    addModes(out, sr, 0, [{ f: 104 * 1.59, t60: 0.2, a: 0.3 }, { f: 104 * 2.14, t60: 0.12, a: 0.2 }]);
  } else if (kind === 'tek') {
    // slap on the rim: bright, short
    noiseBurst(out, sr, rng, 0, 0.05, { f: 1600, q: 1.2, a: 0.0003, d: 0.03, gain: 1 });
    addModes(out, sr, 0, [{ f: 330, t60: 0.08, a: 0.6 }, { f: 525, t60: 0.06, a: 0.5 }, { f: 707, t60: 0.05, a: 0.35 }]);
  } else if (kind === 'brush') {
    noiseBurst(out, sr, rng, 0, 0.25, { f: 5000, q: 0.5, a: 0.02, d: 0.12, gain: 0.8 });
  } else if (kind === 'snare') {
    noiseBurst(out, sr, rng, 0, 0.25, { f: 3000, q: 0.5, a: 0.0005, d: 0.12, gain: 0.9 });
    addModes(out, sr, 0, [{ f: 190, t60: 0.1, a: 0.6 }, { f: 330, t60: 0.06, a: 0.3 }]);
  } else if (kind === 'kick') {
    thud(out, sr, rng, 0, { f: 95, fEnd: 50, t60: 0.35, noise: 0.1, click: 0.3 });
  } else if (kind === 'shaker') {
    noiseBurst(out, sr, rng, 0, 0.08, { f: 7000, q: 0.8, a: 0.01, d: 0.04, gain: 0.7 });
  }
  return out;
}

/** Detuned-saw pad chord (several notes) with slow attack/release; dur seconds. */
function padChord(sr, freqs, dur, rng, { cut = 1100, attack = 1.6, release = 2.2, warmth = 0.5, vib = 0.004 } = {}) {
  const out = alloc(sr, dur);
  const voices = [];
  for (const f of freqs) for (let d = 0; d < 3; d++) voices.push({ o: new Osc(sr, f, rng()), f: f * (1 + (d - 1) * 0.0045 + (rng() - 0.5) * 0.001) });
  const lp = new SVF(sr, cut, 0.7);
  const lp2 = new SVF(sr, cut * 1.5, 0.6);
  const w = new Wander(rng, 0.4);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    let s = 0;
    const vm = 1 + Math.sin(t * 4.7) * vib * 0.3;
    for (const v of voices) s += v.o.saw(v.f * vm) * 0.6 + Math.sin(TAU * v.f * t) * warmth * 0.5;
    s /= voices.length;
    if ((i & 63) === 0) lp.set(cut * (1 + 0.25 * w.next(64 / sr)), 0.7);
    const env = Math.min(1, t / attack) * Math.min(1, Math.max(0, dur - t) / release);
    out[i] = lp2.process(lp.process(s)) * env * env;
  }
  return out;
}

/** Soft breathy string/choir swell for dawn. */
function stringSwell(sr, freqs, dur, rng, { cut = 2400, attack = 2.5, release = 2.5 } = {}) {
  const out = alloc(sr, dur);
  const voices = [];
  for (const f of freqs) for (let d = 0; d < 4; d++) voices.push({ o: new Osc(sr, f, rng()), f: f * (1 + (d - 1.5) * 0.003), vr: 4.5 + rng() * 1.5, vp: rng() * TAU });
  const lp = new SVF(sr, cut, 0.6);
  const hp = new OnePole(sr, 120);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    let s = 0;
    for (const v of voices) s += v.o.saw(v.f * (1 + 0.003 * Math.sin(TAU * v.vr * t + v.vp)));
    s /= voices.length;
    const env = Math.min(1, t / attack) * Math.min(1, Math.max(0, dur - t) / release);
    out[i] = hp.hp(lp.process(s)) * env * env;
  }
  return out;
}

/** Brass section stab/sustain (FM-ish via waveshaped saw with opening filter). */
function brass(sr, f, dur, vel, rng) {
  const out = alloc(sr, dur + 0.15);
  const o = new Osc(sr, f, rng()), o2 = new Osc(sr, f * 1.003, rng());
  const lp = new SVF(sr, 800, 1.2);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.04) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.12));
    const bright = 700 + (1500 + vel * 2500) * Math.min(1, t / 0.08) * (0.8 + 0.2 * Math.sin(t * 30));
    if ((i & 15) === 0) lp.set(bright, 1.3);
    const s = o.saw(f * (1 + 0.004 * Math.sin(TAU * 5.5 * t) * Math.min(1, t / 0.3))) + o2.saw(f * 1.003);
    out[i] = Math.tanh(lp.process(s) * 1.2) * env;
  }
  return out;
}

function reed(sr, f, dur, vel, rng) {
  // sax/clarinet-ish reed with formant and vibrato
  const out = alloc(sr, dur + 0.15);
  const o = new Osc(sr, f, rng());
  const f1 = new SVF(sr, 1300, 2.5), f2 = new SVF(sr, 600, 1.5);
  const pink = new Pink(rng);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.06) * (t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.12));
    const vib = 1 + 0.006 * Math.sin(TAU * 5.2 * t) * Math.min(1, Math.max(0, t - 0.25) / 0.3);
    const s = o.square(f * vib, 0.42) + pink.next() * 0.08;
    f1.process(s);
    f2.process(s);
    out[i] = Math.tanh((f1.bp * 0.8 + f2.bp * 0.6 + s * 0.08) * (0.8 + vel * 0.5)) * env;
  }
  return out;
}

/** Low drone (sine + soft saw + breath) for dur seconds, loop-friendly. */
function drone(sr, f, dur, rng, { saw = 0.25, noise = 0.15, beat = 0.25 } = {}) {
  const out = alloc(sr, dur);
  const o = new Osc(sr, f, rng());
  const lp = new SVF(sr, f * 4, 0.7);
  const nlp = new SVF(sr, f * 3, 2);
  const br = new Brown(rng);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const s = Math.sin(TAU * f * t) + Math.sin(TAU * (f + beat) * t) * 0.6 + Math.sin(TAU * f * 2 * t) * 0.15;
    lp.process(o.saw(f * 1.001));
    nlp.process(br.next());
    out[i] = s * 0.6 + lp.lp * saw + nlp.bp * noise;
  }
  return loopify(out, sr, Math.min(1.5, dur / 4));
}

/** Instrument dispatcher used by the worker / sync path. Returns Float32Array. */
export function renderInstrument(sr, inst, f, vel = 0.7, seed = 1, extra = {}) {
  const rng = rngFrom(seed);
  let b;
  switch (inst) {
    case 'ranat': b = ranat(sr, f, vel, rng); break;
    case 'ranatSoft': b = ranat(sr, f, vel, rng, { soft: true }); break;
    case 'ranatRev': b = ranat(sr, f, vel, rng).reverse(); break;
    case 'khim': b = khim(sr, f, vel, rng); break;
    case 'phin': b = phin(sr, f, vel, rng); break;
    case 'bass': b = bassPluck(sr, f, vel, rng); break;
    case 'piano': b = pianoNote(sr, f, vel, rng); break;
    case 'musicbox': b = musicBox(sr, f, vel, rng); break;
    case 'bell': b = smallBell(sr, f, vel, rng); break;
    case 'khong': b = khongNote(sr, f, vel, rng); break;
    case 'ching': b = chingHit(sr, true, rng); break;
    case 'chap': b = chingHit(sr, false, rng); break;
    case 'klong': case 'tum': case 'tek': case 'brush': case 'snare': case 'kick': case 'shaker': b = drumHit(sr, inst, vel, rng); break;
    case 'khaen': b = khaenTone(sr, extra.freqs || [f, f * 1.5, f * 2], extra.dur || 2, rng, extra); break;
    case 'pad': b = padChord(sr, extra.freqs || [f], extra.dur || 6, rng, extra); break;
    case 'strings': b = stringSwell(sr, extra.freqs || [f], extra.dur || 6, rng, extra); break;
    case 'brass': b = brass(sr, f, extra.dur || 0.5, vel, rng); break;
    case 'reed': b = reed(sr, f, extra.dur || 0.5, vel, rng); break;
    case 'drone': b = drone(sr, f, extra.dur || 8, rng, extra); break;
    case 'templeBell': {
      b = alloc(sr, 9);
      addModes(b, sr, 0, bellPartials(f, 0.8, rng).filter((m) => m.f < sr * 0.45));
      break;
    }
    default: b = ranat(sr, f, vel, rng);
  }
  normalize(b, 0.9);
  return b;
}
