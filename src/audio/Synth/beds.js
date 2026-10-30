// Seamlessly looping ambience beds (stereo), rendered offline: insects, frogs,
// rain on leaves / on the taxi roof, wind in leaves, drips, radio static, tyre
// and road textures, low dread drone.
import { TAU, alloc, normalize, SVF, OnePole, Wander, Pink, Brown, Reson, rngFrom, loopify, clamp } from './dsp.js';
import { panelModes } from './lib.js';
import { whistleNote } from './sfxAnimals.js';

/** Add a mono event buffer into stereo L/R (wrapping around for loops). */
function place(Lc, Rc, ev, at, pan, gain) {
  const n = Lc.length;
  const gl = gain * Math.sqrt(0.5 * (1 - pan)), gr = gain * Math.sqrt(0.5 * (1 + pan));
  for (let i = 0; i < ev.length; i++) {
    const k = (at + i) % n;
    Lc[k] += ev[i] * gl;
    Rc[k] += ev[i] * gr;
  }
}

function cricketChirp(sr, rng, f, syl, sylRate) {
  const len = Math.floor((syl / sylRate + 0.02) * sr);
  const ev = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const sp = (t * sylRate) % 1;
    const env = sp < 0.55 ? Math.sin((Math.PI * sp) / 0.55) : 0;
    ph += (TAU * f * (1 + 0.01 * Math.sin(TAU * sylRate * t))) / sr;
    ev[i] = (Math.sin(ph) + 0.15 * Math.sin(2 * ph)) * env * (t < syl / sylRate ? 1 : 0);
  }
  return ev;
}

function crickets(sr, rng, dur) {
  const n = Math.floor(dur * sr);
  const Lc = new Float32Array(n), Rc = new Float32Array(n);
  const count = 14;
  for (let c = 0; c < count; c++) {
    const f = 3600 + rng() * 2400;
    const pan = rng() * 2 - 1;
    const dist = rng();
    const g = 0.12 + (1 - dist) * 0.3;
    const type = c % 3;
    if (type === 2) {
      // tree cricket: long continuous trill with slow phrasing
      const sylRate = 38 + rng() * 22;
      const ev = cricketChirp(sr, rng, f * 0.8, Math.floor(dur * sylRate * 0.9), sylRate);
      for (let i = 0; i < ev.length; i++) ev[i] *= 0.6 + 0.4 * Math.sin((TAU * i) / (sr * (2 + rng() * 0)) + c);
      place(Lc, Rc, ev, Math.floor(rng() * n), pan, g * 0.5);
    } else {
      const syl = 3 + Math.floor(rng() * 3);
      const sylRate = 28 + rng() * 14;
      const period = 0.45 + rng() * 0.6;
      const ev = cricketChirp(sr, rng, f, syl, sylRate);
      const reps = Math.floor(dur / period);
      const off = rng() * period;
      for (let r = 0; r < reps; r++) place(Lc, Rc, ev, Math.floor((off + r * period + rng() * 0.01) * sr), pan, g * (0.85 + rng() * 0.3));
    }
  }
  // distance haze: gentle lowpass
  const l1 = new OnePole(sr, 7000), l2 = new OnePole(sr, 7000);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
    Lc[i] = l1.lp(Lc[i]);
    Rc[i] = l2.lp(Rc[i]);
  }
  return [Lc, Rc];
}

function katydids(sr, rng, dur) {
  const n = Math.floor(dur * sr);
  const Lc = new Float32Array(n), Rc = new Float32Array(n);
  for (let c = 0; c < 6; c++) {
    const pan = rng() * 2 - 1;
    const f = 1900 + rng() * 1500;
    const period = 0.7 + rng() * 0.9;
    const pulses = 2 + Math.floor(rng() * 3);
    const reps = Math.floor(dur / period);
    const off = rng() * period;
    const res = new Reson(sr, f, 0.01);
    const ev = new Float32Array(Math.floor(0.25 * sr));
    for (let p = 0; p < pulses; p++) {
      const s = Math.floor(p * 0.055 * sr);
      for (let i = 0; i < 0.035 * sr; i++) {
        const u = i / (0.035 * sr);
        const x = (rng() * 2 - 1) * Math.sin(Math.PI * u) * (Math.sin(i * 0.9) > 0.6 ? 1 : 0.2);
        ev[s + i] += x;
      }
    }
    for (let i = 0; i < ev.length; i++) ev[i] = res.process(ev[i]);
    normalize(ev, 1);
    for (let r = 0; r < reps; r++) place(Lc, Rc, ev, Math.floor((off + r * period) * sr), pan, 0.18 + rng() * 0.12);
  }
  return [Lc, Rc];
}

function cicadas(sr, rng, dur) {
  const n = Math.floor(dur * sr);
  const Lc = new Float32Array(n), Rc = new Float32Array(n);
  for (let c = 0; c < 5; c++) {
    const pan = rng() * 2 - 1;
    const base = 4200 + rng() * 2400;
    const rate = 160 + rng() * 260;
    const r1 = new Reson(sr, base, 0.008), r2 = new Reson(sr, base * 1.55, 0.005, 0.5);
    const w = new Wander(rng, 0.6);
    let ph = rng();
    const g = 0.25 + rng() * 0.25;
    const gl = g * Math.sqrt(0.5 * (1 - pan)), gr = g * Math.sqrt(0.5 * (1 + pan));
    const amPer = (2 + rng() * 5) / dur; // integer-ish AM cycles across loop
    const cyc = Math.max(1, Math.round(amPer * dur));
    for (let i = 0; i < n; i++) {
      ph += (rate * (1 + w.next(1 / sr) * 0.04)) / sr;
      let x = (rng() * 2 - 1) * 0.08;
      if (ph >= 1) {
        ph -= 1;
        x += 1;
      }
      const am = 0.55 + 0.45 * Math.sin((TAU * cyc * i) / n + c);
      const y = (r1.process(x) + r2.process(x)) * am;
      Lc[i] += y * gl;
      Rc[i] += y * gr;
    }
  }
  return [Lc, Rc];
}

function frogs(sr, rng, dur) {
  const n = Math.floor(dur * sr);
  const Lc = new Float32Array(n), Rc = new Float32Array(n);
  for (let c = 0; c < 9; c++) {
    const pan = rng() * 2 - 1;
    const species = c % 3;
    const g = 0.2 + rng() * 0.3;
    let t = rng() * 2;
    while (t < dur) {
      let ev;
      if (species === 0) {
        // "op op" pulsed croak
        const pr = 70 + rng() * 50;
        const len = Math.floor((0.08 + rng() * 0.05) * sr);
        ev = new Float32Array(len);
        const r1 = new Reson(sr, 600 + rng() * 300, 0.03), r2 = new Reson(sr, 1400 + rng() * 300, 0.02, 0.5);
        let ph = 0;
        for (let i = 0; i < len; i++) {
          ph += pr / sr;
          let x = 0;
          if (ph >= 1) {
            ph -= 1;
            x = 1;
          }
          const env = Math.sin((Math.PI * i) / len);
          ev[i] = (r1.process(x) + r2.process(x)) * env;
        }
        t += 0.25 + rng() * (rng() < 0.6 ? 0.3 : 2.5);
      } else if (species === 1) {
        // low nasal bullfrog "uung"
        const len = Math.floor(0.35 * sr);
        ev = new Float32Array(len);
        const f0 = 160 + rng() * 60;
        const r1 = new Reson(sr, 300, 0.05), r2 = new Reson(sr, 820, 0.03, 0.5);
        let ph = 0;
        for (let i = 0; i < len; i++) {
          ph += (f0 * (1 + 0.1 * Math.sin((Math.PI * i) / len))) / sr;
          let x = 0;
          if (ph >= 1) {
            ph -= 1;
            x = 1;
          }
          ev[i] = (r1.process(x) + r2.process(x)) * Math.sin((Math.PI * i) / len);
        }
        t += 1.2 + rng() * 3;
      } else {
        // tiny peeper "pip"
        const len = Math.floor(0.05 * sr);
        ev = new Float32Array(len);
        whistleNote(ev, sr, 0, 0.045, 2500 + rng() * 800, 2900 + rng() * 800, { gain: 1, h2: 0.2 });
        t += 0.3 + rng() * 0.8;
      }
      normalize(ev, 1);
      place(Lc, Rc, ev, Math.floor(t * sr), pan, g);
    }
  }
  return [Lc, Rc];
}

function rainLeaves(sr, rng, dur) {
  const n = Math.floor(dur * sr);
  const Lc = new Float32Array(n), Rc = new Float32Array(n);
  const pk = [new Pink(rng), new Pink(rng)];
  const hp = [new OnePole(sr, 400), new OnePole(sr, 400)];
  const lp = [new OnePole(sr, 6000), new OnePole(sr, 6000)];
  for (let ch = 0; ch < 2; ch++) {
    const C = ch ? Rc : Lc;
    for (let i = 0; i < n; i++) C[i] = lp[ch].lp(hp[ch].hp(pk[ch].next())) * 0.35;
  }
  // individual drops on leaves (little ticks with leaf resonances)
  const drops = Math.floor(dur * 900);
  const res = [new Reson(sr, 1800, 0.006), new Reson(sr, 3200, 0.004), new Reson(sr, 900, 0.01)];
  const ev = new Float32Array(Math.floor(0.03 * sr));
  for (let d = 0; d < drops; d++) {
    const at = Math.floor(rng() * n);
    const pan = rng() * 2 - 1;
    const r = res[d % 3];
    r.set((d % 3 === 2 ? 600 : 1300) + rng() * 2500, 0.004 + rng() * 0.008);
    ev.fill(0);
    for (let i = 0; i < ev.length; i++) ev[i] = r.process(i < 2 ? 1 : 0);
    place(Lc, Rc, ev, at, pan, 0.02 + rng() * 0.05);
  }
  return [Lc, Rc];
}

function rainRoof(sr, rng, dur) {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const exc = new Float32Array(n);
  const rate = 650;
  for (let k = 0; k < dur * rate; k++) {
    const i = Math.floor(rng() * (n - 2));
    const a = 0.2 + Math.pow(rng(), 3) * 1.5;
    exc[i] += a;
    exc[i + 1] -= a * 0.6;
  }
  const modes = panelModes(0.8, 0.22, rng).concat([{ f: 2400, t60: 0.01, a: 0.3 }, { f: 3900, t60: 0.006, a: 0.2 }]);
  const res = modes.map((m) => new Reson(sr, m.f, m.t60, m.a));
  const br = new Brown(rng);
  const lp = new OnePole(sr, 250);
  // run twice to settle resonator state for a seamless loop
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      let y = 0;
      for (const r of res) y += r.process(exc[i]);
      out[i] = y + lp.lp(br.next()) * 0.6;
    }
  }
  const Rc = new Float32Array(n);
  // pseudo-stereo: slight different filtering
  const d = Math.floor(0.0007 * sr);
  for (let i = 0; i < n; i++) Rc[i] = out[(i + d) % n] * 0.9 + out[(i + 3 * d) % n] * 0.1;
  return [out, Rc];
}

function windLeaves(sr, rng, dur) {
  const n = Math.floor(dur * sr);
  const Lc = new Float32Array(n), Rc = new Float32Array(n);
  for (let ch = 0; ch < 2; ch++) {
    const C = ch ? Rc : Lc;
    const pk = new Pink(rng);
    const bp = new SVF(sr, 2400, 0.5);
    const w = new Wander(rng, 1.2);
    let g = 0;
    for (let i = 0; i < n; i++) {
      // leaf flutter: granular density
      if (rng() < 140 / sr) g = 0.4 + rng() * 0.8;
      g *= 0.9993;
      bp.process(pk.next());
      C[i] = bp.bp * (0.3 + g * 0.7) * (0.75 + 0.25 * w.next(1 / sr));
    }
  }
  return [Lc, Rc];
}

function drips(sr, rng, dur) {
  const n = Math.floor(dur * sr);
  const Lc = new Float32Array(n), Rc = new Float32Array(n);
  const cnt = Math.floor(dur * 5);
  for (let k = 0; k < cnt; k++) {
    const len = Math.floor(0.08 * sr);
    const ev = new Float32Array(len);
    const f = 900 + rng() * 2400;
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      ph += (TAU * f * (1 + t * 12)) / sr;
      ev[i] = Math.sin(ph) * Math.exp(-t * 60) + (i < 30 ? (rng() * 2 - 1) * 0.3 : 0);
    }
    place(Lc, Rc, ev, Math.floor(rng() * n), rng() * 2 - 1, 0.1 + rng() * 0.3);
  }
  return [Lc, Rc];
}

function staticNoise(sr, rng, dur) {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const bp = new SVF(sr, 2500, 0.4);
  const w = new Wander(rng, 6);
  for (let i = 0; i < n; i++) {
    const x = rng() * 2 - 1;
    bp.process(x);
    let y = bp.bp * (0.7 + 0.3 * w.next(1 / sr)) + x * 0.15;
    if (rng() < 30 / sr) y += (rng() * 2 - 1) * 3; // crackles
    // AM hum under the hiss
    y += Math.sin((TAU * 100 * i) / sr) * 0.05;
    out[i] = y;
  }
  return [loopify(out, sr, 0.2)];
}

function tyre(sr, rng, dur, kind) {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  if (kind === 'gravel') {
    const res = [];
    for (let k = 0; k < 8; k++) res.push(new Reson(sr, 900 + rng() * 3500, 0.004 + rng() * 0.006));
    const br = new Brown(rng);
    const lp = new OnePole(sr, 300);
    for (let i = 0; i < n; i++) {
      let x = 0;
      if (rng() < 1800 / sr) x = (rng() * 2 - 1) * (0.3 + rng());
      let y = 0;
      for (let k = 0; k < res.length; k++) y += res[k].process(k === i % 8 ? x : 0);
      out[i] = y + lp.lp(br.next()) * 0.5;
    }
  } else if (kind === 'grass') {
    const pk = new Pink(rng);
    const bp = new SVF(sr, 1800, 0.6);
    const w = new Wander(rng, 8);
    for (let i = 0; i < n; i++) {
      bp.process(pk.next());
      out[i] = bp.bp * (0.6 + 0.4 * w.next(1 / sr));
    }
  } else {
    // asphalt: coarse road texture + tread hiss
    const br = new Brown(rng);
    const pk = new Pink(rng);
    const bp = new SVF(sr, 700, 0.7);
    const lp = new OnePole(sr, 180);
    for (let i = 0; i < n; i++) {
      bp.process(pk.next());
      let y = bp.bp * 0.6 + lp.lp(br.next()) * 0.8;
      if (rng() < 40 / sr) y += (rng() * 2 - 1) * 0.6; // pebbles
      out[i] = y;
    }
  }
  return [loopify(out, sr, 0.15)];
}

function noiseLoop(sr, rng, dur, color = 'white') {
  const n = Math.floor(dur * sr);
  const out = new Float32Array(n);
  const pk = new Pink(rng);
  for (let i = 0; i < n; i++) out[i] = color === 'pink' ? pk.next() : rng() * 2 - 1;
  return [loopify(out, sr, 0.05)];
}

function dreadDrone(sr, rng, dur) {
  const n = Math.floor(dur * sr);
  const Lc = new Float32Array(n), Rc = new Float32Array(n);
  const fr = [32.7, 34.6, 49.0, 65.4, 69.3];
  const br = new Brown(rng);
  const lp = new SVF(sr, 90, 0.8);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let s = 0;
    for (let k = 0; k < fr.length; k++) s += Math.sin(TAU * fr[k] * t + k) * (0.6 + 0.4 * Math.sin((TAU * (k + 1) * i) / n)) / (1 + k * 0.4);
    lp.process(br.next());
    const y = s * 0.3 + lp.lp * 0.8;
    Lc[i] = y;
    Rc[i] = y * 0.9 + Math.sin(TAU * 98.1 * t) * 0.01;
  }
  return [loopify(Lc, sr, 1), loopify(Rc, sr, 1)];
}

function nightTone(sr, rng, dur) {
  const n = Math.floor(dur * sr);
  const Lc = new Float32Array(n), Rc = new Float32Array(n);
  for (let ch = 0; ch < 2; ch++) {
    const C = ch ? Rc : Lc;
    const br = new Brown(rng);
    const pk = new Pink(rng);
    const lp = new SVF(sr, 140, 0.6);
    const hp = new SVF(sr, 900, 0.5);
    for (let i = 0; i < n; i++) {
      lp.process(br.next());
      hp.process(pk.next());
      C[i] = lp.lp * 0.7 + hp.bp * 0.05;
    }
  }
  return [loopify(Lc, sr, 1), loopify(Rc, sr, 1)];
}

const BEDS = {
  crickets: [12, crickets],
  katydids: [9, katydids],
  cicadas: [10, cicadas],
  frogs: [14, frogs],
  rain_leaves: [7, rainLeaves],
  rain_roof: [5, rainRoof],
  wind_leaves: [9, windLeaves],
  drips: [11, drips],
  static: [4.2, staticNoise],
  tyre_asphalt: [2.5, (sr, rng, d) => tyre(sr, rng, d, 'asphalt')],
  tyre_gravel: [2.5, (sr, rng, d) => tyre(sr, rng, d, 'gravel')],
  tyre_grass: [2.5, (sr, rng, d) => tyre(sr, rng, d, 'grass')],
  noise_white: [2, (sr, rng, d) => noiseLoop(sr, rng, d, 'white')],
  noise_pink: [2, (sr, rng, d) => noiseLoop(sr, rng, d, 'pink')],
  dread_drone: [16, dreadDrone],
  night_tone: [10, nightTone],
};
export const BED_KINDS = Object.keys(BEDS);

export function renderBed(kind, sr, seed = 1, opts = {}) {
  const b = BEDS[kind];
  if (!b) throw new Error('unknown bed ' + kind);
  const rng = rngFrom(seed * 131 + kind.length);
  const ch = b[1](sr, rng, opts.dur || b[0]);
  // joint normalise
  let pk = 0;
  for (const c of ch) for (let i = 0; i < c.length; i++) pk = Math.max(pk, Math.abs(c[i]));
  if (pk > 0) for (const c of ch) for (let i = 0; i < c.length; i++) c[i] *= 0.85 / pk;
  return { channels: ch, sr };
}
