// Shared building blocks for the procedural SFX generators (impacts, clicks,
// rattles, scrapes, splashes, bubbles, rustles). All write into Float32Arrays.
import { TAU, clamp, alloc, SVF, Biquad, OnePole, ResonBank, Reson, Wander, Pink, addModes, envAD, noiseBurst, normalize, mixInto } from './dsp.js';

/** Render a component into its own buffer, peak-normalise, mix at `at` (s) with `gain`. */
export function L(out, sr, at, dur, gain, fn) {
  const t = alloc(sr, dur);
  fn(t);
  normalize(t, 1);
  mixInto(out, t, Math.floor(at * sr), gain);
  return out;
}

/** Feed an excitation through a resonator bank, adding into out at time `at`. */
export function excite(out, sr, at, exc, modes, gain = 1, ring = null) {
  const bank = new ResonBank(sr, modes);
  const s = Math.floor(at * sr);
  let maxT = 0;
  for (const m of modes) maxT = Math.max(maxT, m.t60);
  const n = Math.min(out.length - s, exc.length + Math.floor((ring ?? maxT) * sr));
  for (let i = 0; i < n; i++) out[s + i] += bank.process(i < exc.length ? exc[i] : 0) * gain;
  return out;
}

/** Excitation buffer: shaped (white or pink) noise burst. */
export function burst(sr, rng, dur, { a = 0.0005, d = dur, lp = 0, hp = 0, pink = false } = {}) {
  const b = alloc(sr, dur);
  const P = pink ? new Pink(rng) : null;
  const l = lp ? new OnePole(sr, lp) : null;
  const h = hp ? new OnePole(sr, hp) : null;
  for (let i = 0; i < b.length; i++) {
    let x = P ? P.next() : rng() * 2 - 1;
    if (l) x = l.lp(x);
    if (h) x = h.hp(x);
    b[i] = x * envAD(i / sr, a, d);
  }
  return b;
}

/** Impulse excitation (a few samples, smoothed) — for hard strikes on modal bodies. */
export function impulse(sr, width = 0.0004, amp = 1) {
  const n = Math.max(2, Math.floor(width * sr));
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = amp * Math.sin((Math.PI * i) / n);
  return b;
}

/** Low body thump: a pitch-dropping sine + lowpassed noise; feels like mass. */
export function thud(out, sr, rng, at, { f = 70, fEnd = 45, t60 = 0.25, gain = 1, noise = 0.4, click = 0.15 } = {}) {
  const s = Math.floor(at * sr);
  const n = Math.min(out.length - s, Math.floor(t60 * sr * 1.1));
  const lp = new SVF(sr, f * 4, 0.7);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const fr = fEnd + (f - fEnd) * Math.exp(-t / (t60 * 0.25));
    ph += (TAU * fr) / sr;
    const env = Math.exp((-6.9 * t) / t60) * Math.min(1, t / 0.002);
    const nz = lp.process(rng() * 2 - 1) * Math.exp((-6.9 * t) / (t60 * 0.3));
    out[s + i] += (Math.sin(ph) * env + nz * noise * 2) * gain;
  }
  if (click > 0) noiseBurst(out, sr, rng, at, 0.012, { f: 2200, q: 0.8, a: 0.0003, d: 0.006, gain: click * gain });
  return out;
}

/** Small metallic tick (key, latch, coin edge). */
export function metalTick(out, sr, rng, at, { f = 3200, t60 = 0.04, gain = 1, spread = 1 } = {}) {
  const modes = [
    { f: f, t60, a: 1 },
    { f: f * (1.47 + rng() * 0.1) * spread, t60: t60 * 0.7, a: 0.6 },
    { f: f * (2.09 + rng() * 0.15) * spread, t60: t60 * 0.5, a: 0.4 },
    { f: f * (2.93 + rng() * 0.2) * spread, t60: t60 * 0.35, a: 0.25 },
  ];
  excite(out, sr, at, burst(sr, rng, 0.0015, { a: 0.0001, d: 0.001 }), modes, gain);
  return out;
}

/** Plastic/bakelite click (switches, dash). */
export function plasticClick(out, sr, rng, at, { f = 1900, gain = 1, body = 0.5 } = {}) {
  const exc = burst(sr, rng, 0.003, { a: 0.0001, d: 0.0015 });
  excite(out, sr, at, exc, [
    { f, t60: 0.018, a: 1 },
    { f: f * 1.63, t60: 0.012, a: 0.6 },
    { f: f * 2.71, t60: 0.008, a: 0.4 },
    { f: f * 0.42, t60: 0.03, a: body },
  ], gain);
  noiseBurst(out, sr, rng, at, 0.004, { f: 5000, q: 0.7, a: 0.0001, d: 0.002, gain: gain * 0.6 });
  return out;
}

/** Random rattle: a cluster of tiny ticks decaying over dur. */
export function rattle(out, sr, rng, at, dur, { count = 8, f = 2600, gain = 0.3, t60 = 0.015, decay = 0.5 } = {}) {
  for (let i = 0; i < count; i++) {
    const t = at + Math.pow(rng(), 1.6) * dur;
    const g = gain * Math.exp((-(t - at) / dur) * 3 * decay) * (0.4 + rng() * 0.6);
    metalTick(out, sr, rng, t, { f: f * (0.7 + rng() * 0.6), t60, gain: g });
  }
  return out;
}

/** Friction scrape: noise through moving resonances with stick-slip AM. */
export function scrape(out, sr, rng, at, dur, { f0 = 900, f1 = 1600, q = 4, gain = 1, grit = 0.5, env = null } = {}) {
  const s = Math.floor(at * sr);
  const n = Math.min(out.length - s, Math.floor(dur * sr));
  const bp = new SVF(sr, f0, q);
  const bp2 = new SVF(sr, f0 * 2.3, q);
  const w = new Wander(rng, 18);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if ((i & 15) === 0) {
      const f = f0 + (f1 - f0) * u;
      bp.set(f * (1 + w.next(16 / sr) * 0.08), q);
      bp2.set(f * 2.3, q);
    }
    const e = env ? env(u) : Math.sin(Math.PI * u);
    let x = rng() * 2 - 1;
    // grit = random impulsive density
    if (rng() < grit * 0.02) x *= 8;
    bp.process(x);
    bp2.process(x);
    out[s + i] += (bp.bp + bp2.bp * 0.5) * e * gain;
  }
  return out;
}

/** Water bubble "plip" (Minnaert resonance with rising pitch). */
export function bubble(out, sr, at, { f = 900, t60 = 0.05, rise = 1.6, gain = 0.5 } = {}) {
  const s = Math.floor(at * sr);
  const n = Math.min(out.length - s, Math.floor(t60 * sr));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const fr = f * (1 + (rise - 1) * (t / t60));
    ph += (TAU * fr) / sr;
    out[s + i] += Math.sin(ph) * Math.exp((-6.9 * t) / t60) * gain * Math.min(1, t / 0.0006);
  }
  return out;
}

/** Leaf / foliage rustle: granular bursts of highpassed noise. */
export function rustle(out, sr, rng, at, dur, { density = 60, f = 3500, q = 0.8, gain = 0.5, env = null } = {}) {
  const s = Math.floor(at * sr);
  const n = Math.min(out.length - s, Math.floor(dur * sr));
  const bp = new SVF(sr, f, q);
  const bed = new SVF(sr, f * 0.6, 0.5);
  let g = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const e = env ? env(u) : Math.sin(Math.PI * u);
    if (rng() < (density * e) / sr) g = 0.5 + rng();
    g *= 0.9975;
    const x = rng() * 2 - 1;
    out[s + i] += (bp.process(x) * 0 + bp.bp * g + bed.process(x) * 0.08 * e) * gain;
  }
  return out;
}

/** Crunchy granular impacts (gravel, crackle, bones, paper). */
export function crackle(out, sr, rng, at, dur, { density = 200, f = 3000, spread = 0.6, t60 = 0.004, gain = 0.4, env = null } = {}) {
  const s = Math.floor(at * sr);
  const n = Math.min(out.length - s, Math.floor(dur * sr));
  const resos = [];
  for (let k = 0; k < 6; k++) resos.push(new Reson(sr, f * (1 - spread / 2 + rng() * spread), t60 * (0.6 + rng()), 1));
  let ri = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const e = env ? env(u) : 1;
    let x = 0;
    if (rng() < (density * e) / sr) {
      x = (rng() * 2 - 1) * (0.3 + rng());
      ri = (ri + 1 + Math.floor(rng() * 3)) % resos.length;
    }
    let y = 0;
    for (let k = 0; k < resos.length; k++) y += resos[k].process(k === ri ? x : 0);
    out[s + i] += y * gain;
  }
  return out;
}

/** Sheet-metal panel modes (car body / roof / trunk lid), scaled. */
export function panelModes(scale = 1, t = 1, rng = null) {
  const base = [118, 187, 263, 342, 455, 588, 731, 903, 1180, 1530];
  return base.map((f, i) => ({
    f: f * scale * (rng ? 0.96 + rng() * 0.08 : 1),
    t60: (0.22 - i * 0.015) * t,
    a: 1 / (1 + i * 0.45),
  }));
}

/** Window glass modes. */
export function glassModes(scale = 1, t = 1) {
  return [
    { f: 310 * scale, t60: 0.05 * t, a: 0.5 },
    { f: 1150 * scale, t60: 0.07 * t, a: 1 },
    { f: 1870 * scale, t60: 0.06 * t, a: 0.8 },
    { f: 2650 * scale, t60: 0.05 * t, a: 0.6 },
    { f: 3900 * scale, t60: 0.035 * t, a: 0.35 },
    { f: 5200 * scale, t60: 0.02 * t, a: 0.2 },
  ];
}

/** Wooden bar / board modes. */
export function woodModes(f = 220, t = 1) {
  return [
    { f, t60: 0.09 * t, a: 1 },
    { f: f * 2.76, t60: 0.05 * t, a: 0.5 },
    { f: f * 5.4, t60: 0.03 * t, a: 0.25 },
    { f: f * 8.9, t60: 0.015 * t, a: 0.12 },
  ];
}

/** Bronze bell partials (minor-third bell) with split pairs for warble. */
export function bellPartials(f, t = 1, rng = null) {
  const R = [
    [0.5, 14, 0.55], // hum
    [1.0, 9, 0.9], // prime
    [1.19, 7, 0.6], // tierce (minor third)
    [1.5, 5.5, 0.35], // quint
    [2.0, 5, 0.6], // nominal
    [2.51, 3.6, 0.32],
    [2.66, 3.2, 0.3],
    [3.01, 2.6, 0.25],
    [4.07, 1.7, 0.16],
    [5.4, 1.1, 0.1],
    [6.8, 0.7, 0.06],
  ];
  const out = [];
  for (const [r, d, a] of R) {
    const det = rng ? 1 + (rng() - 0.5) * 0.004 : 1;
    out.push({ f: f * r * det, t60: d * t, a, ph: rng ? rng() * TAU : 0 });
    // doublet for beating
    out.push({ f: f * r * det * (1 + 0.0018 + (rng ? rng() * 0.002 : 0)), t60: d * t * 0.9, a: a * 0.55, ph: rng ? rng() * TAU : 1 });
  }
  return out;
}

export { addModes };
