// Electric hums, horror stings/hits, supernatural voices, ritual drones and UI.
import { TAU, alloc, normalize, mixInto, SVF, Biquad, OnePole, Wander, Brown, Pink, noiseBurst, creak, addModes, Osc, fadeOut, fadeIn, loopify, bakeVerb, reverse, Reson, clamp, rngFrom } from './dsp.js';
import { L } from './lib.js';
import { excite, burst, thud, metalTick, rattle, scrape, crackle, woodModes, bellPartials } from './lib.js';
import { VoxScore, renderVox, vowelParams } from './vox.js';
import { renderMurmur, parseThai, buildSpeechScore, voicePreset } from './speech.js';

const vox = (sr, rng, build, opts = {}) => {
  const sc = new VoxScore(opts.init || {});
  build(sc);
  return renderVox(sr, sc, { rng, ...opts });
};

/** Mains hum/buzz (50 Hz grid -> 100 Hz magnetostriction). Loop-safe when dur is a multiple of 0.02 s. */
function mainsHum(sr, rng, dur, { buzz = 0.5, hum = 1, crackles = 0.3, f = 100 } = {}) {
  const out = alloc(sr, dur);
  const bp = new SVF(sr, 2400, 1.5);
  const bp2 = new SVF(sr, 5200, 2);
  const w = new Wander(rng, 0.8);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const ph = TAU * f * t;
    const h = Math.sin(ph) + 0.5 * Math.sin(2 * ph + 0.3) + 0.3 * Math.sin(3 * ph + 1.1) + 0.15 * Math.sin(4 * ph) + 0.08 * Math.sin(5 * ph + 2);
    // buzz: hard-clipped arcing rattle at 100 Hz
    const sq = Math.sign(Math.sin(ph)) * Math.pow(Math.abs(Math.sin(ph)), 0.15);
    bp.process(sq + (rng() * 2 - 1) * 0.2);
    bp2.process(sq);
    const bz = (bp.bp + bp2.bp * 0.5) * (0.6 + 0.4 * w.next(1 / sr));
    out[i] = h * hum * 0.5 + bz * buzz;
  }
  if (crackles > 0) crackle(out, sr, rng, 0, dur, { density: 8 * crackles, f: 3500, spread: 1.5, t60: 0.003, gain: 0.6 });
  return out;
}

/** Dissonant string-like cluster (saws, tremolo). */
function cluster(sr, rng, dur, freqs, { attack = 0.05, release = 1.5, trem = 0, lp = 4000, gain = 1 } = {}) {
  const out = alloc(sr, dur);
  const os = freqs.map(() => new Osc(sr, 1, rng()));
  const f = new SVF(sr, lp, 0.8);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    let s = 0;
    for (let k = 0; k < freqs.length; k++) s += os[k].saw(freqs[k] * (1 + Math.sin(t * (3 + k) + k) * 0.003));
    const env = Math.min(1, t / attack) * Math.min(1, Math.max(0, dur - t) / release);
    const tr = trem ? 0.65 + 0.35 * Math.sin(TAU * trem * t + rng() * 0.0) : 1;
    out[i] = f.process(s / freqs.length) * env * tr * gain;
  }
  return out;
}

const WHISPERS = ['หันมาสิ', 'ต้น... ต้น', 'อยู่ข้างหลังนะ', 'มองฉันสิ', 'กลับบ้านกัน', 'ไม่ต้องกลัว', 'หนาวจัง', 'จอดก่อน'];

export const HORROR_SFX = {
  // ---------------------------------------------------------------- electric
  electric_buzz: {
    vars: 2, ref: 2, reverb: 0.1, loopable: true,
    gen({ sr, rng }, loop = false) {
      const out = mainsHum(sr, rng, loop ? 3 : 1.6, { buzz: 0.7, hum: 0.6, crackles: 0.6 });
      if (!loop) {
        fadeIn(out, sr, 0.05);
        fadeOut(out, sr, 0.3);
      }
      return out;
    },
  },
  transformer_hum: {
    vars: 1, ref: 3, reverb: 0.1, loopable: true, sr: 22050,
    gen({ sr, rng }, loop = false) {
      const out = mainsHum(sr, rng, loop ? 4 : 2.5, { buzz: 0.12, hum: 1.2, crackles: 0.05 });
      if (!loop) {
        fadeIn(out, sr, 0.3);
        fadeOut(out, sr, 0.5);
      }
      return out;
    },
  },
  spark: {
    vars: 4, ref: 2, reverb: 0.15,
    gen({ sr, rng }) {
      const dur = 0.25 + rng() * 0.35;
      const out = alloc(sr, dur + 0.2);
      L(out, sr, 0, 0.05, 1, (b) => noiseBurst(b, sr, rng, 0, 0.012, { f: 4000, q: 0.4, a: 0.0001, d: 0.005 }));
      L(out, sr, 0.003, dur, 0.7, (b) => {
        // arc: noise gated by 100 Hz with random dropouts
        const hp = new SVF(sr, 2500, 0.7);
        let on = 1;
        for (let i = 0; i < b.length; i++) {
          const t = i / sr;
          if ((i & 127) === 0) on = rng() < 0.8 ? 1 : 0.1;
          const gate = Math.pow(Math.abs(Math.sin(TAU * 50 * t)), 4);
          hp.process(rng() * 2 - 1);
          b[i] = (hp.hp * 0.7 + hp.bp * 0.5) * gate * on * Math.exp(-t * 6);
        }
      });
      L(out, sr, 0.01, dur + 0.15, 0.25, (b) => crackle(b, sr, rng, 0, dur, { density: 600, f: 6000, spread: 1, t60: 0.002, env: (u) => 1 - u }));
      return out;
    },
  },
  fluorescent_flicker: {
    vars: 3, ref: 1.5, reverb: 0.12, loopable: true,
    gen({ sr, rng }, loop = false) {
      const dur = loop ? 6 : 1.4 + rng() * 0.8;
      const out = alloc(sr, dur);
      const hum = mainsHum(sr, rng, dur, { buzz: 0.9, hum: 0.35, crackles: 0.4 });
      // stutter mask
      const mask = new Float32Array(out.length);
      let t = 0, state = 0;
      while (t < dur) {
        const seg = state ? 0.03 + rng() * (loop ? 0.8 : 0.25) : 0.02 + rng() * 0.12;
        const s = Math.floor(t * sr), e = Math.min(out.length, Math.floor((t + seg) * sr));
        for (let i = s; i < e; i++) mask[i] = state;
        if (state === 1 || rng() < 0.6) {
          // starter "tink" on each strike
          metalTick(out, sr, rng, t, { f: 3800 + rng() * 800, t60: 0.02, gain: 0.25 });
          addModes(out, sr, Math.floor(t * sr), [{ f: 820 + rng() * 60, t60: 0.08, a: 0.06 }]);
        }
        t += seg;
        state = state ? 0 : 1;
        if (!loop && t > dur * 0.7) state = 1;
      }
      const sm = new OnePole(sr, 300);
      for (let i = 0; i < out.length; i++) out[i] += hum[i] * sm.lp(mask[i]) * 0.8;
      return loop ? loopify(out, sr, 0.2) : out;
    },
  },

  // ---------------------------------------------------------------- body / horror
  breath_neck: {
    vars: 3, cabin: true, ref: 0.4, reverb: 0.02, loopable: true, sr: 24000,
    gen({ sr, rng }, loop = false) {
      const cycles = loop ? 2 : 1;
      return vox(sr, rng, (sc) => {
        for (let c = 0; c < cycles; c++) {
          // slow wet inhale through the nose/mouth, too long
          sc.seg(0.05, { av: 0, ah: 0, F1: 600, F2: 1300, F3: 2500, B1: 200, B2: 250 });
          sc.seg(1.4 + rng() * 0.4, { ah: 0.15 }, { ah: 0.55, F1: 420, F2: 1700 }, 'in');
          sc.seg(0.08, {}, { ah: 0 });
          sc.rest(0.25 + rng() * 0.35);
          // exhale with a vocal-fry rattle (unnatural)
          sc.seg(0.12, { ah: 0.7, av: 0.2, f0: 42, oq: 0.25, sub: 0.9, F1: 520, F2: 1150 }, {}, 'out');
          sc.seg(1.3 + rng() * 0.5, {}, { ah: 0.08, av: 0.03, f0: 32, F1: 480, F2: 1000 });
          sc.rest(loop ? 0.6 : 0.2);
        }
      }, { jitter: 0.2, shimmer: 0.4, breath: 0.5, drift: 0.5 });
    },
  },
  whisper: {
    vars: 6, cabin: true, ref: 0.8, reverb: 0.15, bus: 'sfx', sr: 24000,
    gen({ sr, rng, v }) {
      const text = WHISPERS[v % WHISPERS.length];
      const { buffer } = renderMurmur(sr, text, { gender: v % 2 ? 'f' : 'm', whisper: true, rate: 0.75, ghost: 0.35 }, 77 + v);
      return buffer;
    },
  },
  heartbeat: {
    vars: 2, cabin: true, ref: 0.5, reverb: 0, loopInterval: 0.86, stereoCenter: true, sr: 16000,
    gen({ sr, rng }) {
      const out = alloc(sr, 0.7);
      L(out, sr, 0, 0.3, 1, (b) => thud(b, sr, rng, 0, { f: 58, fEnd: 38, t60: 0.17, noise: 0.25, click: 0 }));
      L(out, sr, 0.27, 0.3, 0.65, (b) => thud(b, sr, rng, 0, { f: 72, fEnd: 48, t60: 0.13, noise: 0.2, click: 0 }));
      const lp = new OnePole(sr, 220);
      for (let i = 0; i < out.length; i++) out[i] = lp.lp(out[i]);
      return out;
    },
  },
  sting_low: {
    vars: 2, stereo: false, cabin: true, reverb: 0.4, bus: 'music', sr: 22050,
    gen({ sr, rng }) {
      const out = alloc(sr, 4.5);
      L(out, sr, 0, 4, 1, (b) => {
        const c = cluster(sr, rng, 3.8, [41.2, 43.7, 61.7, 65.4, 82.4, 87.3], { attack: 0.03, release: 3, lp: 700 });
        mixInto(b, c, 0, 1);
        for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * 3);
      });
      L(out, sr, 0, 1.5, 0.8, (b) => thud(b, sr, rng, 0, { f: 55, fEnd: 32, t60: 1.2, noise: 0.6, click: 0.05 }));
      L(out, sr, 0.02, 3, 0.25, (b) => noiseBurst(b, sr, rng, 0, 2.5, { type: 'lp', f: 300, q: 0.7, a: 0.05, d: 2 }));
      return bakeVerb(out, sr, { room: 0.85, damp: 0.5, wet: 0.35, tail: 1.5 });
    },
  },
  sting_high: {
    vars: 2, cabin: true, reverb: 0.4, bus: 'music',
    gen({ sr, rng }) {
      const out = alloc(sr, 3.5);
      const base = 1480 + rng() * 200;
      L(out, sr, 0, 3.2, 1, (b) => {
        const c = cluster(sr, rng, 3, [base, base * 1.059, base * 1.122, base * 1.5, base * 1.587, base * 2.12], { attack: 0.02, release: 2.2, trem: 13, lp: 7000 });
        mixInto(b, c, 0, 1);
      });
      L(out, sr, 0, 1.6, 0.5, (b) => creak(b, sr, rng, 0, 1.4, { rate0: 600, rate1: 900, modes: [{ f: 2900, t60: 0.01 }, { f: 4400, t60: 0.008, a: 0.6 }], env: (u) => Math.exp(-u * 2.5) }));
      return bakeVerb(out, sr, { room: 0.8, damp: 0.3, wet: 0.35, tail: 1.5 });
    },
  },
  sting_reveal: {
    vars: 2, cabin: true, reverb: 0.35, bus: 'music', sr: 24000,
    gen({ sr, rng }) {
      const rise = 1.6;
      const out = alloc(sr, rise + 3.2);
      // reversed swell into the hit
      L(out, sr, 0, rise, 0.8, (b) => {
        const hit = alloc(sr, rise);
        noiseBurst(hit, sr, rng, 0, rise, { f: 900, q: 0.6, a: 0.001, d: rise * 0.6 });
        const c = cluster(sr, rng, rise, [220, 233, 311, 330, 466], { attack: 0.001, release: rise, lp: 3000 });
        mixInto(hit, c, 0, 0.8);
        const rev = reverse(bakeVerb(hit, sr, { room: 0.9, damp: 0.4, wet: 1, dry: 0.4, tail: 0.1 }));
        mixInto(b, rev, rise * sr - rev.length, 1);
      });
      L(out, sr, rise, 3, 1, (b) => {
        thud(b, sr, rng, 0, { f: 60, fEnd: 30, t60: 1.6, noise: 1, click: 0.1 });
        const c = cluster(sr, rng, 2.6, [55, 58.3, 82.4, 110, 116.5, 1661, 1760, 1865], { attack: 0.005, release: 2.2, lp: 2500 });
        mixInto(b, c, 0, 0.9);
      });
      return bakeVerb(out, sr, { room: 0.85, damp: 0.4, wet: 0.3, tail: 1.6 });
    },
  },
  scare_hit: {
    vars: 3, cabin: true, reverb: 0.3, bus: 'music', gain: 1, sr: 24000,
    gen({ sr, rng }) {
      const out = alloc(sr, 4.5);
      // the braam: detuned brass-like saws through an opening/closing filter, overdriven
      L(out, sr, 0, 4, 1, (b) => {
        const fr = [55, 55.4, 54.6, 110.3, 109.6, 27.5, 82.5, 165.2];
        const os = fr.map(() => new Osc(sr, 1, rng()));
        const f1 = new SVF(sr, 200, 2.2), f2 = new SVF(sr, 520, 3), f3 = new SVF(sr, 1250, 3);
        for (let i = 0; i < b.length; i++) {
          const t = i / sr;
          let s = 0;
          for (let k = 0; k < fr.length; k++) s += os[k].saw(fr[k]) * (k === 5 ? 1.5 : 1);
          s /= fr.length;
          const cut = 180 + 2600 * Math.exp(-t / 0.5) * Math.min(1, t / 0.02);
          if ((i & 15) === 0) f1.set(cut, 1.8);
          f1.process(s);
          f2.process(f1.lp);
          f3.process(f1.lp);
          const y = f1.lp + f2.bp * 0.8 + f3.bp * 0.4;
          const env = Math.min(1, t / 0.015) * Math.exp(-t / 1.6);
          b[i] = Math.tanh(y * 5) * env;
        }
      });
      L(out, sr, 0, 2, 0.9, (b) => thud(b, sr, rng, 0, { f: 48, fEnd: 26, t60: 1.6, noise: 1.5, click: 0.15 }));
      L(out, sr, 0.01, 2, 0.35, (b) => creak(b, sr, rng, 0, 1.6, { rate0: 700, rate1: 380, jitter: 0.1, modes: [{ f: 2300, t60: 0.01 }, { f: 3600, t60: 0.008, a: 0.7 }, { f: 5100, t60: 0.005, a: 0.4 }], env: (u) => Math.exp(-u * 3) }));
      L(out, sr, 0, 1.0, 0.4, (b) => noiseBurst(b, sr, rng, 0, 0.9, { f: 1500, q: 0.4, a: 0.002, d: 0.4 }));
      return bakeVerb(out, sr, { room: 0.88, damp: 0.45, wet: 0.3, tail: 2 });
    },
  },
  giant_hand_rumble: {
    vars: 2, ref: 10, rolloff: 0.3, reverb: 0.3, loopable: true, sr: 16000,
    gen({ sr, rng }, loop = false) {
      const dur = loop ? 8 : 6.5;
      const out = alloc(sr, dur);
      L(out, sr, 0, dur, 1, (b) => {
        const br = new Brown(rng);
        const lp = new SVF(sr, 60, 0.9);
        let ph = 0;
        const w = new Wander(rng, 0.5);
        for (let i = 0; i < b.length; i++) {
          const t = i / sr;
          const env = loop ? 1 : Math.min(1, t / 1.5, (dur - t) / 1.5);
          ph += (TAU * (24 + 6 * w.next(1 / sr))) / sr;
          lp.process(br.next());
          b[i] = (lp.lp * 1.5 + Math.sin(ph) * 0.5) * env;
        }
      });
      // enormous slow creaks (wood/bone under load)
      const nCreaks = loop ? 4 : 3;
      for (let k = 0; k < nCreaks; k++) {
        const t0 = (k / nCreaks) * dur + rng() * 0.6;
        L(out, sr, t0, 2.2, 0.55, (b) => creak(b, sr, rng, 0, 1.4 + rng() * 0.6, { rate0: 8 + rng() * 6, rate1: 14 + rng() * 10, jitter: 0.45, modes: [{ f: 140 + rng() * 60, t60: 0.15 }, { f: 330 + rng() * 80, t60: 0.1, a: 0.6 }, { f: 760, t60: 0.05, a: 0.3 }] }));
      }
      L(out, sr, 0, dur, 0.25, (b) => crackle(b, sr, rng, 0, dur, { density: 18, f: 900, spread: 1.4, t60: 0.02, env: loop ? null : (u) => Math.sin(Math.PI * u) }));
      return loop ? loopify(out, sr, 0.8) : out;
    },
  },
  bone_crack: {
    vars: 4, ref: 1, reverb: 0.1,
    gen({ sr, rng }) {
      const out = alloc(sr, 0.7);
      L(out, sr, 0, 0.15, 1, (b) => {
        noiseBurst(b, sr, rng, 0, 0.005, { f: 3500, q: 0.6, a: 0.0001, d: 0.003, gain: 1.5 });
        excite(b, sr, 0, burst(sr, rng, 0.002), [{ f: 1900 + rng() * 500, t60: 0.02 }, { f: 3600 + rng() * 600, t60: 0.012, a: 0.6 }, { f: 820, t60: 0.03, a: 0.5 }], 0.7);
      });
      L(out, sr, 0.002, 0.25, 0.7, (b) => crackle(b, sr, rng, 0, 0.09, { density: 1600, f: 2600, spread: 1.6, t60: 0.003, env: (u) => Math.exp(-u * 2) }));
      L(out, sr, 0.01, 0.35, 0.45, (b) => {
        thud(b, sr, rng, 0, { f: 140, fEnd: 90, t60: 0.08, noise: 0.8, click: 0 });
        noiseBurst(b, sr, rng, 0.02, 0.2, { type: 'lp', f: 600, q: 2, a: 0.01, d: 0.12, gain: 0.5, fEnd: 300 });
      });
      return out;
    },
  },
  neck_snap: {
    vars: 3, ref: 1, reverb: 0.12,
    gen({ sr, rng }) {
      const out = alloc(sr, 1.2);
      // slow twisting crunch, accelerating
      L(out, sr, 0, 0.45, 0.55, (b) => crackle(b, sr, rng, 0, 0.4, { density: 900, f: 1700, spread: 1.6, t60: 0.006, env: (u) => Math.pow(u, 1.5) }));
      L(out, sr, 0.0, 0.45, 0.35, (b) => creak(b, sr, rng, 0, 0.4, { rate0: 30, rate1: 90, modes: [{ f: 600, t60: 0.03 }, { f: 1500, t60: 0.02, a: 0.6 }] }));
      // the snap
      L(out, sr, 0.42, 0.25, 1, (b) => {
        noiseBurst(b, sr, rng, 0, 0.006, { f: 3000, q: 0.5, a: 0.0001, d: 0.004, gain: 1.6 });
        excite(b, sr, 0, burst(sr, rng, 0.002), [{ f: 1500, t60: 0.03 }, { f: 2800, t60: 0.02, a: 0.7 }, { f: 4700, t60: 0.01, a: 0.4 }], 0.7);
        crackle(b, sr, rng, 0, 0.06, { density: 2000, f: 2400, spread: 1.6, t60: 0.003, gain: 0.6 });
      });
      L(out, sr, 0.43, 0.4, 0.6, (b) => thud(b, sr, rng, 0, { f: 95, fEnd: 60, t60: 0.2, noise: 0.8, click: 0 }));
      return out;
    },
  },
  scream_far: {
    vars: 3, ref: 8, rolloff: 0.5, reverb: 0.5, sr: 24000,
    gen({ sr, rng }) {
      const f0 = 820 + rng() * 200;
      const dur = 1.3 + rng() * 0.8;
      let v = vox(sr, rng, (sc) => {
        sc.seg(0.08, { av: 0, ah: 0.4, f0: f0 * 0.8, F1: 900, F2: 1500, F3: 2900, oq: 0.35, sub: 0.25 }, { av: 1 });
        sc.seg(0.25, {}, { f0: f0 * 1.25 }, 'out');
        sc.seg(dur, {}, { f0: f0 * 1.05, F1: 850, F2: 1400 });
        sc.seg(0.4, {}, { f0: f0 * 0.75, av: 0, ah: 0 }, 'in');
      }, { jitter: 0.03, shimmer: 0.15, breath: 0.3, formantScale: 1.15, drift: 0.8, vibrato: { rate: 7, depth: 0.7, delay: 0.3 } });
      for (let i = 0; i < v.length; i++) v[i] = Math.tanh(v[i] * 0.8);
      const lp = new SVF(sr, 2400, 0.6);
      for (let i = 0; i < v.length; i++) v[i] = lp.process(v[i]);
      normalize(v, 1);
      return bakeVerb(v, sr, { room: 0.92, damp: 0.6, wet: 0.9, dry: 0.5, tail: 2.5, predelay: 0.04 });
    },
  },
  child_laugh_far: {
    vars: 3, ref: 6, rolloff: 0.5, reverb: 0.5, sr: 24000,
    gen({ sr, rng }) {
      const n = 5 + Math.floor(rng() * 4);
      const f0 = 360 + rng() * 80;
      let v = vox(sr, rng, (sc) => {
        sc.rest(0.02);
        for (let i = 0; i < n; i++) {
          const f = f0 * (1.15 - i * 0.03);
          sc.seg(0.05, { av: 0, ah: 0.7, af: 0, f0: f, F1: 750, F2: 1300, F3: 2700, oq: 0.5 }, { ah: 0.3 });
          sc.seg(0.08 + rng() * 0.03, { av: 0.9, ah: 0.2 }, { f0: f * 0.92, av: 0.4 });
          sc.seg(0.02, {}, { av: 0, ah: 0 });
          sc.rest(0.05 + rng() * 0.05);
        }
      }, { jitter: 0.02, shimmer: 0.1, breath: 0.35, formantScale: 1.35, drift: 0.4 });
      const lp = new SVF(sr, 2600, 0.6);
      for (let i = 0; i < v.length; i++) v[i] = lp.process(v[i]);
      normalize(v, 1);
      return bakeVerb(v, sr, { room: 0.9, damp: 0.6, wet: 0.9, dry: 0.45, tail: 2.2, predelay: 0.05 });
    },
  },
  giggle: {
    vars: 3, ref: 1, reverb: 0.2, sr: 24000,
    gen({ sr, rng }) {
      const n = 4 + Math.floor(rng() * 3);
      const f0 = 430 + rng() * 70;
      return vox(sr, rng, (sc) => {
        sc.rest(0.01);
        for (let i = 0; i < n; i++) {
          sc.seg(0.03, { av: 0, ah: 0.6, f0: f0 * (1.2 - i * 0.03), F1: 330, F2: 2300, F3: 3000, oq: 0.5 });
          sc.seg(0.06, { av: 0.8, ah: 0.25 }, { av: 0.3, f0: f0 * (1.1 - i * 0.04) });
          sc.seg(0.015, {}, { av: 0, ah: 0 });
          sc.rest(0.04 + rng() * 0.03);
        }
        sc.seg(0.3, { ah: 0.3, av: 0, F1: 600, F2: 1500 }, { ah: 0 });
      }, { jitter: 0.02, shimmer: 0.1, breath: 0.45, formantScale: 1.3 });
    },
  },
  amulet_hum: {
    vars: 1, cabin: true, ref: 0.6, reverb: 0.3, loopable: true, sr: 24000, stereoCenter: true,
    gen({ sr, rng }, loop = false) {
      const dur = loop ? 8 : 4.5;
      const out = alloc(sr, dur + 0.5);
      const notes = [146.8, 220, 293.7, 369.9, 440];
      notes.forEach((f, k) => {
        L(out, sr, 0, dur + 0.3, 0.32, (b) => {
          const v = vox(sr, rngFrom(31 + k), (sc) => {
            sc.seg(0.6, { av: 0, f0: f, ...vowelParams(k % 2 ? 'oo' : 'a'), oq: 0.7 }, { av: 0.8 }, 'smooth');
            sc.seg(dur - 1.2, {}, { ...vowelParams(k % 2 ? 'o' : 'or') });
            sc.seg(0.6, {}, { av: loop ? 0.8 : 0 }, 'smooth');
          }, { jitter: 0.003, shimmer: 0.02, breath: 0.25, formantScale: f > 300 ? 1.15 : 1, vibrato: { rate: 4.6 + k * 0.3, depth: 0.12, phase: k }, drift: 0.05 });
          mixInto(b, v, 0, 1);
        });
      });
      // golden shimmer: high partials breathing in and out
      L(out, sr, 0, dur + 0.3, 0.18, (b) => {
        const fr = [880, 1174.7, 1318.5, 1760, 2349];
        for (let i = 0; i < b.length; i++) {
          const t = i / sr;
          let s = 0;
          for (let k = 0; k < fr.length; k++) s += Math.sin(TAU * fr[k] * t + k) * (0.5 + 0.5 * Math.sin(t * (0.9 + k * 0.37) + k * 2));
          b[i] = s * Math.min(1, t / 0.8, (dur - t) / 0.8 + (loop ? 1 : 0));
        }
      });
      if (loop) return loopify(out.subarray(0, Math.floor(dur * sr)), sr, 1.2);
      fadeOut(out, sr, 0.6);
      return out;
    },
  },
  monk_chant: {
    vars: 2, ref: 3, reverb: 0.45, loopable: true, sr: 24000,
    gen({ sr, rng, v }, loop = false) {
      const text = v === 0 ? 'นะโม ตัสสะ ภะคะวะโต อะระหะโต สัมมาสัมพุทธัสสะ' : 'พุทธัง สะระณัง คัจฉามิ ธัมมัง สะระณัง คัจฉามิ';
      const phrases = parseThai(text);
      const voices = [{ f0: 104, fs: 1 }, { f0: 98.5, fs: 1.03 }, { f0: 110.5, fs: 0.97 }, { f0: 52.2, fs: 1.05 }];
      let len = 0;
      const parts = voices.map((vc, k) => {
        const r = rngFrom(100 + k + v * 7);
        const preset = { ...voicePreset({ gender: 'm', age: 45 }), f0: vc.f0, rate: 0.62 + r() * 0.03 };
        const sc = buildSpeechScore(phrases, preset, r, { toneDepth: 0.12, fric: 0.3 });
        const b = renderVox(sr, sc, { rng: r, formantScale: vc.fs, jitter: 0.004, shimmer: 0.03, breath: 0.08, drift: 0.05 });
        len = Math.max(len, b.length);
        return b;
      });
      const out = new Float32Array(len + Math.floor(0.5 * sr));
      parts.forEach((b, k) => mixInto(out, b, Math.floor(rng() * 0.05 * sr), k === 3 ? 0.5 : 0.8));
      // drone under it (held "mmm")
      for (let i = 0; i < out.length; i++) out[i] += Math.sin((TAU * 104 * i) / sr) * 0.02 + Math.sin((TAU * 52 * i) / sr) * 0.03;
      const lp = new SVF(sr, 2600, 0.6);
      for (let i = 0; i < out.length; i++) out[i] = lp.process(out[i]);
      return loop ? loopify(out, sr, 0.6) : out;
    },
  },

  // ---------------------------------------------------------------- UI
  ui_hover: {
    vars: 3, bus: 'ui', stereoCenter: true, reverb: 0.15, gain: 0.35,
    gen({ sr, rng }) {
      const out = alloc(sr, 0.25);
      addModes(out, sr, 0, woodModes(1760 + rng() * 120, 0.5).map((m) => ({ ...m, a: m.a * (m.f > 6000 ? 0.2 : 1) })));
      noiseBurst(out, sr, rng, 0, 0.004, { f: 3000, q: 0.8, a: 0.0002, d: 0.002, gain: 0.2 });
      const lp = new OnePole(sr, 5000);
      for (let i = 0; i < out.length; i++) out[i] = lp.lp(out[i]);
      return out;
    },
  },
  ui_select: {
    vars: 1, bus: 'ui', stereoCenter: true, reverb: 0.3, gain: 0.55,
    gen({ sr, rng }) {
      const out = alloc(sr, 1.4);
      addModes(out, sr, 0, woodModes(1046, 2.2));
      addModes(out, sr, 0, bellPartials(2093, 0.12, rng).filter((m) => m.f < 12000), 0.12);
      addModes(out, sr, Math.floor(0.09 * sr), woodModes(1568, 1.6), 0.5);
      noiseBurst(out, sr, rng, 0, 0.005, { f: 2500, q: 0.8, a: 0.0002, d: 0.003, gain: 0.3 });
      return out;
    },
  },
  ui_back: {
    vars: 1, bus: 'ui', stereoCenter: true, reverb: 0.25, gain: 0.45,
    gen({ sr, rng }) {
      const out = alloc(sr, 0.8);
      addModes(out, sr, 0, woodModes(880, 1.4));
      addModes(out, sr, Math.floor(0.08 * sr), woodModes(659, 1.6), 0.7);
      noiseBurst(out, sr, rng, 0, 0.005, { f: 2000, q: 0.8, a: 0.0002, d: 0.003, gain: 0.25 });
      const lp = new OnePole(sr, 3500);
      for (let i = 0; i < out.length; i++) out[i] = lp.lp(out[i]);
      return out;
    },
  },
  chapter_chime: {
    vars: 1, bus: 'ui', stereoCenter: true, reverb: 0.45, gain: 0.8, sr: 24000,
    gen({ sr, rng }) {
      const dur = 6;
      const out = alloc(sr, dur);
      // khong wong (gong circle) note + small bell + low swelling drone
      const kh = (f, at, g) => addModes(out, sr, Math.floor(at * sr), [
        { f, t60: 3.5, a: 1 }, { f: f * 1.003, t60: 3.2, a: 0.5 }, { f: f * 2.02, t60: 1.6, a: 0.25 }, { f: f * 2.98, t60: 0.9, a: 0.15 }, { f: f * 4.2, t60: 0.4, a: 0.08 },
      ], g);
      kh(392, 0, 0.8);
      kh(293.7, 0.35, 0.6);
      addModes(out, sr, Math.floor(0.7 * sr), bellPartials(1174.7, 0.3, rng).filter((m) => m.f < 12000), 0.12);
      const lpN = new SVF(sr, 200, 0.7);
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 2) * Math.min(1, (dur - t) / 2.5);
        out[i] += (Math.sin(TAU * 98 * t) * 0.18 + Math.sin(TAU * 146.8 * t) * 0.1 + lpN.process(rng() * 2 - 1) * 0.3) * env;
      }
      return out;
    },
  },
};

export { mainsHum, cluster };
