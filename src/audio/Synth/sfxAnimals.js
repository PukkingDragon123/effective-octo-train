// Animals of the Thai night forest: dogs, tokay gecko, owls, koel, rooster,
// dawn birds, elephants, frogs, cicadas, mosquito. Mostly formant synthesis.
import { TAU, alloc, normalize, mixInto, SVF, Biquad, OnePole, Wander, noiseBurst, addModes, Osc, fadeOut, fadeIn, loopify, Reson, clamp, rngFrom } from './dsp.js';
import { L } from './lib.js';
import { VoxScore, renderVox, vowelParams } from './vox.js';

const vox = (sr, rng, build, opts = {}) => {
  const sc = new VoxScore(opts.init || {});
  build(sc);
  return renderVox(sr, sc, { rng, ...opts });
};

function bark(sc, rng, { f0 = 380, size = 1, harsh = 0.4 } = {}) {
  const d = (0.13 + rng() * 0.08) * size;
  const fs = 1 / size;
  sc.seg(0.012, { av: 0, ah: 0.6, af: 0.3, ff: 1500, fq: 0.8, F1: 600 * fs, F2: 1300 * fs, F3: 2500 * fs, f0: f0 * 0.9, oq: 0.35, sub: harsh });
  sc.seg(d * 0.25, { av: 1, ah: 0.25, af: 0, f0: f0 * 1.25, F1: 780 * fs, F2: 1550 * fs }, { f0: f0 * 1.45 }, 'out');
  sc.seg(d * 0.75, {}, { av: 0.15, ah: 0.2, f0: f0 * 0.85, F1: 520 * fs, F2: 1150 * fs }, 'in');
  sc.seg(0.02, {}, { av: 0, ah: 0 });
}

function whistleNote(out, sr, at, dur, f0, f1, { gain = 0.5, h2 = 0.1, vib = 0, vibR = 30, curve = 1 } = {}) {
  const s = Math.floor(at * sr);
  const n = Math.min(out.length - s, Math.floor(dur * sr));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const f = f0 + (f1 - f0) * Math.pow(u, curve) + Math.sin(TAU * vibR * (i / sr)) * vib;
    ph += (TAU * f) / sr;
    const env = Math.pow(Math.sin(Math.PI * u), 0.6);
    out[s + i] += (Math.sin(ph) + h2 * Math.sin(2 * ph)) * env * gain;
  }
}

/** One synthesized songbird phrase (several species styles). Mono. */
function birdPhrase(out, sr, rng, at, kind) {
  let t = at;
  if (kind === 0) {
    // bulbul: bubbly 3-5 note phrase with liquid glides
    const n = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const d = 0.06 + rng() * 0.1;
      const f = 1500 + rng() * 1500;
      whistleNote(out, sr, t, d, f, f * (0.8 + rng() * 0.5), { gain: 0.4 + rng() * 0.3, h2: 0.15, vib: rng() < 0.3 ? 150 : 0 });
      t += d + 0.02 + rng() * 0.05;
    }
  } else if (kind === 1) {
    // magpie robin: clear melodious whistles, varied
    const n = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const d = 0.08 + rng() * 0.2;
      const f = 2000 + rng() * 2200;
      whistleNote(out, sr, t, d, f, f + (rng() - 0.5) * 1200, { gain: 0.35 + rng() * 0.3, h2: 0.05, vib: rng() < 0.4 ? 200 + rng() * 300 : 0, vibR: 40 + rng() * 40, curve: 0.5 + rng() });
      t += d + 0.03 + rng() * 0.12;
    }
  } else if (kind === 2) {
    // tailorbird: repeated sharp "chee-up"
    const reps = 4 + Math.floor(rng() * 4);
    const f = 2800 + rng() * 600;
    for (let i = 0; i < reps; i++) {
      whistleNote(out, sr, t, 0.07, f * 1.2, f, { gain: 0.45, h2: 0.1 });
      whistleNote(out, sr, t + 0.09, 0.08, f * 0.85, f * 1.15, { gain: 0.4, h2: 0.1 });
      t += 0.32 + rng() * 0.05;
    }
  } else if (kind === 3) {
    // coucal: deep descending "boop boop boop" (distant)
    const reps = 5 + Math.floor(rng() * 4);
    let f = 520 + rng() * 60;
    for (let i = 0; i < reps; i++) {
      whistleNote(out, sr, t, 0.16, f, f * 0.95, { gain: 0.5, h2: 0.25 });
      t += 0.28 - i * 0.008;
      f *= 0.985;
    }
  } else {
    // munia / white-eye high twitters
    const n = 6 + Math.floor(rng() * 8);
    for (let i = 0; i < n; i++) {
      const d = 0.025 + rng() * 0.04;
      const f = 4200 + rng() * 2500;
      whistleNote(out, sr, t, d, f, f * (0.85 + rng() * 0.3), { gain: 0.25 + rng() * 0.2, h2: 0.05 });
      t += d + 0.02 + rng() * 0.06;
    }
  }
  return t;
}

/** Stereo dawn chorus. */
function dawnChorus(sr, rng, dur) {
  const Lc = alloc(sr, dur), Rc = alloc(sr, dur);
  const birds = 7;
  for (let b = 0; b < birds; b++) {
    const kind = b % 5;
    const pan = rng() * 2 - 1;
    const dist = 0.3 + rng() * 0.7;
    const mono = alloc(sr, dur);
    let t = rng() * 1.5;
    while (t < dur - 1.2) {
      t = birdPhrase(mono, sr, rng, t, kind) + 0.6 + rng() * (kind === 3 ? 4 : 2.2);
    }
    // distance: lowpass + level
    const lp = new OnePole(sr, 9000 - dist * 6000);
    for (let i = 0; i < mono.length; i++) mono[i] = lp.lp(mono[i]);
    const g = (1.1 - dist) * 0.6;
    const gl = g * Math.sqrt(0.5 * (1 - pan)), gr = g * Math.sqrt(0.5 * (1 + pan));
    for (let i = 0; i < dur * sr; i++) {
      Lc[i] += mono[i] * gl;
      Rc[i] += mono[i] * gr;
    }
  }
  return [Lc, Rc];
}

export const ANIMAL_SFX = {
  dog_bark: {
    vars: 6, ref: 3, reverb: 0.35, rolloff: 0.8,
    gen({ sr, rng, v }) {
      const size = 0.85 + (v % 3) * 0.15;
      const f0 = 330 + rng() * 120;
      const n = 1 + Math.floor(rng() * 4);
      const out = vox(sr, rng, (sc) => {
        sc.rest(0.01);
        for (let i = 0; i < n; i++) {
          bark(sc, rng, { f0: f0 * (1 + (rng() - 0.5) * 0.1), size, harsh: 0.3 + rng() * 0.4 });
          sc.rest(0.12 + rng() * 0.35);
        }
      }, { jitter: 0.05, shimmer: 0.2, breath: 0.25, formantScale: 1, drift: 0.4 });
      return out;
    },
  },

  dog_howl: {
    vars: 3, ref: 4, reverb: 0.5, rolloff: 0.7,
    gen({ sr, rng }) {
      const f0 = 430 + rng() * 80;
      const dur = 2.6 + rng() * 1.4;
      return vox(sr, rng, (sc) => {
        sc.seg(0.05, { av: 0, ah: 0.1, f0: f0 * 0.8, F1: 380, F2: 820, F3: 2400, oq: 0.6 });
        sc.seg(0.5, { av: 0.8, ah: 0.08 }, { f0: f0 * 1.45, F1: 560, F2: 1050 }, 'smooth');
        sc.seg(dur * 0.55, {}, { f0: f0 * 1.5, F1: 600, F2: 1100 });
        sc.seg(dur * 0.35, {}, { f0: f0 * 1.1, av: 0.4, F1: 420, F2: 880 }, 'in');
        sc.seg(0.25, {}, { av: 0, ah: 0, f0: f0 * 0.9 });
      }, { jitter: 0.01, shimmer: 0.05, breath: 0.18, vibrato: { rate: 5.5, depth: 0.5, delay: 0.7 }, drift: 0.25 });
    },
  },

  dog_whine: {
    vars: 3, ref: 2, reverb: 0.2,
    gen({ sr, rng }) {
      const n = 2 + Math.floor(rng() * 2);
      return vox(sr, rng, (sc) => {
        for (let i = 0; i < n; i++) {
          const f = 900 + rng() * 300;
          sc.seg(0.03, { av: 0, F1: 500, F2: 1600, F3: 2800, nas: 0.7, f0: f * 0.9, oq: 0.4 });
          sc.seg(0.25 + rng() * 0.25, { av: 0.8 }, { f0: f * 1.25 }, 'smooth');
          sc.seg(0.15 + rng() * 0.1, {}, { f0: f * 0.8, av: 0.2 });
          sc.rest(0.15 + rng() * 0.2);
        }
      }, { jitter: 0.02, shimmer: 0.1, breath: 0.35, vibrato: { rate: 9, depth: 0.8 } });
    },
  },

  gecko: {
    // tokay gecko "ตุ๊ก-แก": throaty rattle, then a staged accelerando of tuk-kae pairs that weaken at the end
    vars: 3, ref: 3, reverb: 0.3, rolloff: 0.8, sr: 32000,
    gen({ sr, rng }) {
      const pairs = 5 + Math.floor(rng() * 4);
      const f0 = 260 + rng() * 40;
      return vox(sr, rng, (sc) => {
        // rattling chuckle "krrr-r-r"
        const rat = 10 + Math.floor(rng() * 6);
        for (let i = 0; i < rat; i++) {
          sc.seg(0.018, { av: 0.6, ah: 0.2, f0: 70 + rng() * 25, F1: 520, F2: 1400, F3: 2500, oq: 0.3, sub: 0.6 });
          sc.seg(0.022 + i * 0.002, { av: 0.0, ah: 0.05 });
        }
        sc.rest(0.35 + rng() * 0.2);
        let gap = 1.0 + rng() * 0.15;
        for (let p = 0; p < pairs; p++) {
          const fade = p > pairs - 3 ? 0.65 - (p - (pairs - 3)) * 0.12 : 1;
          // "tuk": glottal-ish stop, rounded vowel, upward
          sc.seg(0.012, { av: 0, ah: 0, af: 0.9 * fade, ff: 1900, fq: 1.2, F1: 380, F2: 900, F3: 2300, f0: f0 * 1.05, oq: 0.3, sub: 0.35, nas: 0.3 });
          sc.seg(0.075, { av: 1.0 * fade, af: 0 }, { f0: f0 * 1.2, F1: 420, F2: 1000 }, 'out');
          sc.seg(0.02, {}, { av: 0 });
          sc.rest(0.06);
          // "KAE": loud, nasal, falling
          sc.seg(0.01, { af: 0.8 * fade, ff: 2200, F1: 650, F2: 1750, F3: 2600 });
          sc.seg(0.08, { av: 1.1 * fade, af: 0, f0: f0 * 1.3 }, { f0: f0 * 1.22 }, 'out');
          sc.seg(0.17, {}, { f0: f0 * 0.82, av: 0.35 * fade, F1: 560, F2: 1600 }, 'in');
          sc.seg(0.03, {}, { av: 0 });
          sc.rest(Math.max(0.35, gap - 0.45));
          gap *= 0.9; // staged accelerando
        }
      }, { jitter: 0.03, shimmer: 0.15, breath: 0.1, drift: 0.1 });
    },
  },

  owl: {
    vars: 3, ref: 4, reverb: 0.45, rolloff: 0.7,
    gen({ sr, rng, v }) {
      const out = alloc(sr, 2.6);
      const f = 300 + rng() * 60;
      const hoots = v === 0 ? [[0, 0.32, 1], [0.55, 0.22, 0.8], [0.85, 0.5, 1]] : v === 1 ? [[0, 0.28, 1], [0.32, 0.4, 0.9]] : [[0, 0.22, 0.9]];
      for (const [t, d, g] of hoots) {
        L(out, sr, t, d + 0.1, 0.7 * g, (b) => {
          let ph = 0;
          const bp = new SVF(sr, f, 4);
          for (let i = 0; i < Math.floor(d * sr); i++) {
            const u = i / (d * sr);
            const fr = f * (0.94 + 0.12 * Math.sin(Math.PI * Math.min(1, u * 1.3)));
            ph += (TAU * fr) / sr;
            bp.process(rng() * 2 - 1);
            const env = Math.pow(Math.sin(Math.PI * u), 0.8);
            b[i] = (Math.sin(ph) + 0.18 * Math.sin(2 * ph) + bp.bp * 0.6) * env;
          }
        });
      }
      return out;
    },
  },

  koel: {
    // Asian koel "ko-EL", rising and more frantic with each repetition (dawn)
    vars: 2, ref: 5, reverb: 0.35, rolloff: 0.6,
    gen({ sr, rng }) {
      const reps = 5 + Math.floor(rng() * 4);
      const out = alloc(sr, reps * 0.62 + 0.8);
      let f = 640 + rng() * 60;
      let t = 0.02;
      for (let r = 0; r < reps; r++) {
        whistleNote(out, sr, t, 0.13, f * 0.98, f * 1.02, { gain: 0.5, h2: 0.12 });
        whistleNote(out, sr, t + 0.17, 0.28, f * 1.32, f * 1.48, { gain: 0.65, h2: 0.12, curve: 0.6 });
        t += 0.62 - r * 0.025;
        f *= 1.035;
      }
      return out;
    },
  },

  rooster: {
    vars: 3, ref: 5, reverb: 0.3, rolloff: 0.6,
    gen({ sr, rng }) {
      const f0 = 520 + rng() * 120;
      return vox(sr, rng, (sc) => {
        const syl = (d, fa, fb, v = 'o', a = 1) => {
          const vp = vowelParams(v);
          sc.seg(0.015, { av: 0, af: 0.5, ff: 2400, F1: vp.F1 * 1.4, F2: vp.F2 * 1.25, F3: vp.F3 * 1.1 });
          sc.seg(d, { av: a, af: 0, f0: fa }, { f0: fb }, 'smooth');
          sc.seg(0.02, {}, { av: 0 });
        };
        syl(0.11, f0, f0 * 1.1, 'o', 0.8);
        sc.rest(0.04);
        syl(0.12, f0 * 1.15, f0 * 1.2, 'a', 0.9);
        sc.rest(0.03);
        syl(0.2, f0 * 1.3, f0 * 1.15, 'o', 1);
        sc.rest(0.03);
        syl(0.95 + rng() * 0.3, f0 * 1.25, f0 * 0.82, 'or', 1);
      }, { jitter: 0.05, shimmer: 0.2, breath: 0.25, formantScale: 1.45, drift: 0.4, init: { oq: 0.32, sub: 0.45, tilt: 0.05 } });
    },
  },

  birds_dawn: {
    vars: 2, stereo: true, reverb: 0.25, loopable: true, sr: 32000,
    gen({ sr, rng }, loop = false) {
      const dur = loop ? 16 : 7;
      const st = dawnChorus(sr, rng, dur);
      if (loop) return [loopify(st[0], sr, 1), loopify(st[1], sr, 1)];
      fadeOut(st[0], sr, 0.8);
      fadeOut(st[1], sr, 0.8);
      return st;
    },
  },

  elephant_trumpet: {
    vars: 2, ref: 8, reverb: 0.35, rolloff: 0.6,
    gen({ sr, rng }) {
      const out = alloc(sr, 3.2);
      // short rumble grunt before
      L(out, sr, 0, 0.8, 0.4, (b) => {
        const v = vox(sr, rng, (sc) => {
          sc.seg(0.6, { av: 1, f0: 28, F1: 160, F2: 450, F3: 1100, oq: 0.4, sub: 0.5 }, { f0: 34, av: 0.2 });
        }, { jitter: 0.08, shimmer: 0.2 });
        mixInto(b, v, 0, 1);
      });
      L(out, sr, 0.35, 2.6, 1, (b) => {
        const f0 = 420 + rng() * 120;
        const v = vox(sr, rng, (sc) => {
          sc.seg(0.08, { av: 0.3, ah: 0.6, f0: f0 * 0.7, F1: 900, F2: 1900, F3: 3000, F4: 4200, oq: 0.3, sub: 0.55 }, { av: 1 });
          sc.seg(0.35, { ah: 0.45 }, { f0: f0 * 1.35 }, 'out');
          sc.seg(0.9 + rng() * 0.4, {}, { f0: f0 * 1.2, F1: 1000, F2: 2100 });
          sc.seg(0.35, {}, { f0: f0 * 0.75, av: 0.2, ah: 0.2 }, 'in');
          sc.seg(0.08, {}, { av: 0, ah: 0 });
        }, { jitter: 0.09, shimmer: 0.25, breath: 0.3, drift: 0.8, vibrato: { rate: 14, depth: 0.6 } });
        mixInto(b, v, 0, 1);
        for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * 2.5);
      });
      return out;
    },
  },

  elephant_rumble: {
    vars: 2, ref: 6, reverb: 0.25, rolloff: 0.6, sr: 24000,
    gen({ sr, rng }) {
      const dur = 3 + rng() * 1.5;
      const out = alloc(sr, dur + 0.3);
      L(out, sr, 0, dur + 0.2, 1, (b) => {
        const v = vox(sr, rng, (sc) => {
          sc.seg(0.4, { av: 0, f0: 18, F1: 130, F2: 380, F3: 900, F4: 1600, B1: 60, oq: 0.45, sub: 0.3 }, { av: 1, f0: 21 });
          sc.seg(dur - 0.9, {}, { f0: 24, F1: 150, F2: 420 });
          sc.seg(0.5, {}, { av: 0, f0: 17 });
        }, { jitter: 0.06, shimmer: 0.18, breath: 0.1, drift: 0.6 });
        mixInto(b, v, 0, 1);
        // the felt sub component
        let ph = 0;
        for (let i = 0; i < b.length; i++) {
          const t = i / sr;
          ph += (TAU * (20 + 3 * Math.sin(t * 0.8))) / sr;
          b[i] += Math.sin(ph) * 0.4 * Math.min(1, t / 0.5, Math.max(0, dur - t) / 0.6) * (1 + 0.3 * Math.sin(t * 5));
        }
      });
      return out;
    },
  },

  frog_croak: {
    vars: 4, ref: 2, reverb: 0.25,
    gen({ sr, rng, v }) {
      if (v === 0) {
        // banded bullfrog "oong-aang" (อึ่งอ่าง)
        return vox(sr, rng, (sc) => {
          sc.seg(0.03, { av: 0, f0: 190, F1: 280, F2: 750, F3: 2000, nas: 0.9, oq: 0.4, sub: 0.3 });
          sc.seg(0.28, { av: 1 }, { f0: 210, F1: 320 }, 'smooth');
          sc.seg(0.05, {}, { av: 0.2 });
          sc.seg(0.32, { av: 1, f0: 230, F1: 520, F2: 1100, nas: 0.6 }, { f0: 195, av: 0.3 }, 'smooth');
          sc.seg(0.05, {}, { av: 0 });
        }, { jitter: 0.04, shimmer: 0.15, breath: 0.1 });
      }
      const out = alloc(sr, 1.2);
      if (v === 3) {
        // creaky ratchet frog: fast pulse train
        L(out, sr, 0, 0.8, 1, (b) => {
          const r = [new Reson(sr, 1400 + rng() * 300, 0.015), new Reson(sr, 2600, 0.01, 0.5)];
          let t = 0;
          while (t < 0.6) {
            const i = Math.floor(t * sr);
            for (let k = 0; k < 60 && i + k < b.length; k++) b[i + k] += (rng() * 2 - 1) * Math.exp(-k / 10);
            t += 0.012 + rng() * 0.004;
          }
          for (let i = 0; i < b.length; i++) b[i] = r[0].process(b[i]) + r[1].process(b[i]);
        });
        return out;
      }
      // "op-op": pulsed short croaks
      const n = v === 1 ? 2 : 3;
      for (let k = 0; k < n; k++) {
        L(out, sr, k * (0.18 + rng() * 0.05), 0.2, 1, (b) => {
          const pr = 90 + rng() * 40;
          const r = [new Reson(sr, 700 + rng() * 200, 0.03), new Reson(sr, 1500 + rng() * 300, 0.02, 0.6)];
          let ph = 0;
          for (let i = 0; i < Math.floor(0.11 * sr); i++) {
            const u = i / (0.11 * sr);
            ph += pr / sr;
            let x = 0;
            if (ph >= 1) {
              ph -= 1;
              x = 1;
            }
            const env = Math.sin(Math.PI * u);
            b[i] = (r[0].process(x * env) + r[1].process(x * env));
          }
        });
      }
      return out;
    },
  },

  cicada_burst: {
    vars: 3, ref: 4, reverb: 0.2, rolloff: 0.7, sr: 32000,
    gen({ sr, rng }) {
      const dur = 3.5 + rng() * 2;
      const out = alloc(sr, dur);
      const base = 4300 + rng() * 1500;
      const rate = 220 + rng() * 160;
      const r = [new Reson(sr, base, 0.006), new Reson(sr, base * 1.6, 0.004, 0.5), new Reson(sr, base * 0.55, 0.01, 0.4)];
      let ph = 0;
      const w = new Wander(rng, 3);
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        const u = t / dur;
        // swell "weee" -> sustain -> abrupt drop "eeoo"
        const env = u < 0.35 ? Math.pow(u / 0.35, 2) : u < 0.85 ? 1 : Math.pow(1 - (u - 0.85) / 0.15, 1.5);
        const fShift = 1 + 0.12 * Math.min(1, u / 0.35) - (u > 0.85 ? (u - 0.85) * 1.2 : 0);
        if ((i & 63) === 0) {
          r[0].set(base * fShift, 0.006);
          r[1].set(base * 1.6 * fShift, 0.004);
        }
        ph += (rate * (1 + w.next(1 / sr) * 0.05)) / sr;
        let x = 0;
        if (ph >= 1) {
          ph -= 1;
          x = 1 + rng() * 0.3;
        }
        x += (rng() * 2 - 1) * 0.05;
        out[i] = (r[0].process(x) + r[1].process(x) + r[2].process(x)) * env * (0.85 + 0.15 * Math.sin(t * TAU * 11));
      }
      return out;
    },
  },

  mosquito_buzz: {
    vars: 3, stereo: true, cabin: true, reverb: 0,
    gen({ sr, rng }) {
      const dur = 2.5 + rng() * 1.5;
      const Lb = alloc(sr, dur), Rb = alloc(sr, dur);
      const o = new Osc(sr);
      const bp = new SVF(sr, 1300, 1.2);
      const wf = new Wander(rng, 4), wd = new Wander(rng, 1.3), wp = new Wander(rng, 0.9);
      for (let i = 0; i < Lb.length; i++) {
        const t = i / sr;
        const near = 0.5 + 0.5 * wd.next(1 / sr);
        const f = 560 * (1 + wf.next(1 / sr) * 0.04 + (near - 0.5) * 0.05);
        const s = o.saw(f) * 0.6 + o.saw(f) * 0;
        bp.process(s);
        const y = (bp.bp + s * 0.15) * (0.08 + Math.pow(near, 3)) * Math.min(1, t / 0.4, (dur - t) / 0.5);
        const pan = wp.next(1 / sr);
        Lb[i] = y * Math.sqrt(0.5 * (1 - pan));
        Rb[i] = y * Math.sqrt(0.5 * (1 + pan));
      }
      return [Lb, Rb];
    },
  },
};

export { dawnChorus, birdPhrase, whistleNote };
