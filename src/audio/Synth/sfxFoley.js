// Foley: footsteps, hands, paper, fire, water, wood, bells and ritual objects.
import { TAU, alloc, normalize, mixInto, SVF, OnePole, Wander, noiseBurst, creak, addModes, Osc, fadeOut, fadeIn, loopify, bakeVerb } from './dsp.js';
import { excite, burst, thud, metalTick, plasticClick, rattle, scrape, crackle, rustle, bubble, woodModes, bellPartials } from './lib.js';
import { L } from './sfxCar.js';

function heel(b, sr, rng, at, { f = 95, t60 = 0.09, gain = 1, slap = 0.5, slapF = 1200 } = {}) {
  thud(b, sr, rng, at, { f, fEnd: f * 0.7, t60, noise: 0.6, click: 0, gain });
  noiseBurst(b, sr, rng, at, 0.03, { f: slapF, q: 0.8, a: 0.0006, d: 0.015, gain: slap * gain });
}

function footstep(surface) {
  return {
    vars: 6, ref: 1, reverb: 0.1, gain: 0.8,
    gen({ sr, rng, v }) {
      const out = alloc(sr, 0.5);
      const toe = 0.05 + rng() * 0.04;
      const w = 0.75 + rng() * 0.4;
      switch (surface) {
        case 'asphalt':
          L(out, sr, 0, 0.2, 0.9 * w, (b) => heel(b, sr, rng, 0, { f: 90, slap: 0.7, slapF: 1500 }));
          L(out, sr, 0.004, 0.12, 0.35 * w, (b) => crackle(b, sr, rng, 0, 0.06, { density: 2500, f: 4200, spread: 1.4, t60: 0.002, env: (u) => 1 - u }));
          L(out, sr, toe, 0.15, 0.4 * w, (b) => {
            noiseBurst(b, sr, rng, 0, 0.05, { f: 2400, q: 0.7, a: 0.004, d: 0.03 });
            crackle(b, sr, rng, 0, 0.05, { density: 1500, f: 5000, spread: 1.2, t60: 0.0015, gain: 0.5 });
          });
          break;
        case 'gravel':
          L(out, sr, 0, 0.2, 0.5 * w, (b) => heel(b, sr, rng, 0, { f: 80, slap: 0.2 }));
          L(out, sr, 0.0, 0.35, 1.0 * w, (b) => {
            crackle(b, sr, rng, 0, 0.13, { density: 3500, f: 2600, spread: 1.6, t60: 0.006, env: (u) => Math.exp(-u * 3) });
            crackle(b, sr, rng, toe + 0.03, 0.12, { density: 2200, f: 3200, spread: 1.6, t60: 0.004, gain: 0.7, env: (u) => Math.sin(Math.PI * u) });
          });
          break;
        case 'grass':
          L(out, sr, 0, 0.2, 0.35 * w, (b) => heel(b, sr, rng, 0, { f: 70, slap: 0.05, t60: 0.07 }));
          L(out, sr, 0.0, 0.4, 0.9 * w, (b) => {
            rustle(b, sr, rng, 0, 0.28, { density: 500, f: 3200 + rng() * 800, q: 0.7, env: (u) => Math.pow(Math.sin(Math.PI * u), 0.7) });
            crackle(b, sr, rng, 0.02, 0.15, { density: 150, f: 1800, spread: 1, t60: 0.008, gain: 0.4 });
          });
          break;
        case 'wood':
          L(out, sr, 0, 0.45, 1.0 * w, (b) => {
            heel(b, sr, rng, 0, { f: 120, t60: 0.1, slap: 0.4, slapF: 900 });
            excite(b, sr, 0, burst(sr, rng, 0.006, { lp: 1500 }), woodModes(170 + v * 23, 2.2), 0.5);
            excite(b, sr, toe, burst(sr, rng, 0.004, { lp: 2000 }), woodModes(240 + v * 17, 1.5), 0.3);
          });
          if (v % 3 === 0) L(out, sr, 0.06, 0.35, 0.25, (b) => creak(b, sr, rng, 0, 0.25, { rate0: 40, rate1: 70, modes: [{ f: 520, t60: 0.06 }, { f: 1150, t60: 0.03, a: 0.5 }] }));
          break;
        case 'concrete':
          L(out, sr, 0, 0.2, 1.0 * w, (b) => {
            heel(b, sr, rng, 0, { f: 105, t60: 0.06, slap: 1.0, slapF: 2200 });
            noiseBurst(b, sr, rng, 0, 0.012, { f: 3800, q: 1, a: 0.0002, d: 0.006, gain: 0.6 });
          });
          L(out, sr, toe, 0.12, 0.45 * w, (b) => {
            noiseBurst(b, sr, rng, 0, 0.04, { f: 3000, q: 0.8, a: 0.002, d: 0.02 });
            crackle(b, sr, rng, 0, 0.03, { density: 1200, f: 5500, t60: 0.0015, gain: 0.4 });
          });
          break;
        case 'puddle':
          L(out, sr, 0, 0.2, 0.4 * w, (b) => heel(b, sr, rng, 0, { f: 85, slap: 0.3 }));
          L(out, sr, 0.005, 0.45, 1.0 * w, (b) => {
            noiseBurst(b, sr, rng, 0, 0.2, { type: 'lp', f: 2600, q: 0.6, a: 0.004, d: 0.09 });
            const nb = 8 + Math.floor(rng() * 8);
            for (let i = 0; i < nb; i++) bubble(b, sr, rng() * 0.22, { f: 500 + rng() * 2200, t60: 0.02 + rng() * 0.05, rise: 1.3 + rng() * 0.8, gain: 0.15 + rng() * 0.25 });
            noiseBurst(b, sr, rng, toe + 0.04, 0.12, { f: 4500, q: 0.6, a: 0.01, d: 0.06, gain: 0.4 });
          });
          break;
      }
      return out;
    },
  };
}

export const FOLEY_SFX = {
  footstep_asphalt: footstep('asphalt'),
  footstep_gravel: footstep('gravel'),
  footstep_grass: footstep('grass'),
  footstep_wood: footstep('wood'),
  footstep_concrete: footstep('concrete'),
  footstep_puddle: footstep('puddle'),

  coins: {
    vars: 3, cabin: true, ref: 1, reverb: 0.06,
    gen({ sr, rng }) {
      const out = alloc(sr, 1.3);
      const n = 3 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) {
        const t0 = k * (0.05 + rng() * 0.06);
        const f = 2100 + rng() * 1400;
        L(out, sr, t0, 0.9, 0.45 + rng() * 0.4, (b) => {
          let t = 0, gap = 0.06 + rng() * 0.04, a = 1;
          for (let j = 0; j < 4; j++) {
            addModes(b, sr, Math.floor(t * sr), [
              { f, t60: 0.28, a: a, ph: rng() * TAU }, { f: f * 2.34, t60: 0.18, a: a * 0.6, ph: rng() * TAU },
              { f: f * 3.88, t60: 0.1, a: a * 0.35 }, { f: f * 5.3, t60: 0.06, a: a * 0.2 },
            ]);
            noiseBurst(b, sr, rng, t, 0.004, { f: 6000, q: 0.7, a: 0.0002, d: 0.002, gain: a * 0.5 });
            t += gap;
            gap *= 0.6;
            a *= 0.5;
          }
        });
      }
      L(out, sr, 0, 0.3, 0.12, (b) => thud(b, sr, rng, 0.02, { f: 150, fEnd: 110, t60: 0.06, noise: 0.5, click: 0 }));
      return out;
    },
  },

  paper_rustle: {
    vars: 3, cabin: true, ref: 1, reverb: 0.05,
    gen({ sr, rng }) {
      const dur = 0.8 + rng() * 0.6;
      const out = alloc(sr, dur);
      const ges = 2 + Math.floor(rng() * 2);
      L(out, sr, 0, dur, 1, (b) => {
        for (let g = 0; g < ges; g++) {
          const t0 = (g / ges) * dur * 0.8 + rng() * 0.05;
          crackle(b, sr, rng, t0, dur / ges, { density: 600 + rng() * 600, f: 3200 + rng() * 1500, spread: 1.6, t60: 0.002, env: (u) => Math.sin(Math.PI * u) });
        }
        noiseBurst(b, sr, rng, 0, dur, { f: 4500, q: 0.5, a: dur * 0.3, d: dur, gain: 0.05 });
      });
      return out;
    },
  },

  paper_unfold: {
    vars: 2, cabin: true, ref: 1, reverb: 0.05,
    gen({ sr, rng }) {
      const out = alloc(sr, 1.5);
      L(out, sr, 0, 1.4, 1, (b) => {
        crackle(b, sr, rng, 0, 0.35, { density: 900, f: 2800, spread: 1.6, t60: 0.003, env: (u) => Math.sin(Math.PI * u) });
        crackle(b, sr, rng, 0.45, 0.4, { density: 1300, f: 3000, spread: 1.7, t60: 0.003, env: (u) => Math.sin(Math.PI * u) });
        noiseBurst(b, sr, rng, 0.4, 0.3, { type: 'lp', f: 900, q: 0.6, a: 0.08, d: 0.15, gain: 1.4 }); // flap
        crackle(b, sr, rng, 0.9, 0.3, { density: 500, f: 3500, spread: 1.5, t60: 0.002, gain: 0.6, env: (u) => 1 - u });
      });
      return out;
    },
  },

  lighter: {
    vars: 3, cabin: true, ref: 1, reverb: 0.05,
    gen({ sr, rng, v }) {
      const out = alloc(sr, 1.8);
      // flint wheel strike (sometimes twice)
      const strikes = v === 2 ? 2 : 1;
      for (let s = 0; s < strikes; s++) {
        const t0 = s * 0.35;
        L(out, sr, t0, 0.12, 0.8, (b) => {
          crackle(b, sr, rng, 0, 0.05, { density: 5000, f: 4200, spread: 1.4, t60: 0.0015, env: (u) => 1 - u * 0.5 });
          metalTick(b, sr, rng, 0.0, { f: 5200, t60: 0.015, gain: 0.5 });
          metalTick(b, sr, rng, 0.045, { f: 3200, t60: 0.02, gain: 0.4 });
        });
      }
      const tf = (strikes - 1) * 0.35 + 0.04;
      // ignition "fwump" + flame
      L(out, sr, tf, 0.3, 0.55, (b) => noiseBurst(b, sr, rng, 0, 0.25, { type: 'lp', f: 700, q: 0.7, a: 0.015, d: 0.12 }));
      L(out, sr, tf + 0.05, 1.3, 0.3, (b) => {
        const lp = new SVF(sr, 500, 0.6);
        const w = new Wander(rng, 8);
        for (let i = 0; i < b.length; i++) {
          const t = i / sr;
          lp.process(rng() * 2 - 1);
          b[i] = lp.lp * (0.7 + 0.3 * w.next(1 / sr)) * Math.min(1, t / 0.05) * Math.min(1, (1.25 - t) / 0.15);
        }
      });
      return out;
    },
  },

  cigarette_inhale: {
    vars: 2, cabin: true, ref: 1, reverb: 0.04,
    gen({ sr, rng }) {
      const dur = 1.3 + rng() * 0.4;
      const out = alloc(sr, dur + 1.4);
      // drag: air through the filter + tobacco ember crackle
      L(out, sr, 0, dur, 0.7, (b) => {
        const bp = new SVF(sr, 900, 1.5);
        for (let i = 0; i < b.length; i++) {
          const u = i / b.length;
          bp.set(800 + 900 * u, 1.6);
          bp.process(rng() * 2 - 1);
          b[i] = bp.bp * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 0.6);
        }
      });
      L(out, sr, 0.05, dur, 0.4, (b) => crackle(b, sr, rng, 0, dur - 0.05, { density: 220, f: 5500, spread: 1.0, t60: 0.0012, env: (u) => Math.sin(Math.PI * u) }));
      // exhale (slow, relaxed)
      L(out, sr, dur + 0.25, 1.2, 0.45, (b) => {
        const bp = new SVF(sr, 700, 0.9);
        for (let i = 0; i < b.length; i++) {
          const u = i / b.length;
          bp.process(rng() * 2 - 1);
          b[i] = bp.bp * Math.pow(Math.sin(Math.PI * u), 1.5);
        }
      });
      return out;
    },
  },

  bush_scrape: {
    vars: 3, cabin: true, ref: 1.5, reverb: 0.08, loopable: true,
    gen({ sr, rng }, loop = false) {
      const dur = loop ? 4 : 1.2 + rng() * 0.6;
      const out = alloc(sr, dur);
      const env = loop ? () => 1 : (u) => Math.pow(Math.sin(Math.PI * u), 0.5);
      L(out, sr, 0, dur, 0.8, (b) => rustle(b, sr, rng, 0, dur, { density: 900, f: 2600, q: 0.6, env }));
      L(out, sr, 0, dur, 0.6, (b) => noiseBurst(b, sr, rng, 0, dur, { f: 1500, q: 0.6, a: loop ? 0.001 : dur * 0.3, d: loop ? 1e3 : dur }));
      const tw = Math.floor(dur * 2.5);
      for (let k = 0; k < tw; k++) {
        const t0 = rng() * (dur - 0.3);
        L(out, sr, t0, 0.3, 0.25 + rng() * 0.3, (b) => creak(b, sr, rng, 0, 0.12 + rng() * 0.15, { rate0: 300 + rng() * 400, rate1: 200 + rng() * 300, modes: [{ f: 1800 + rng() * 1500, t60: 0.01 }, { f: 3800, t60: 0.006, a: 0.4 }] }));
      }
      L(out, sr, 0, dur, 0.35, (b) => crackle(b, sr, rng, 0, dur, { density: 25, f: 1700, spread: 1.4, t60: 0.01, env }));
      return loop ? loopify(out, sr, 0.4) : out;
    },
  },

  branch_crack: {
    vars: 4, ref: 3, reverb: 0.35,
    gen({ sr, rng }) {
      const out = alloc(sr, 1.6);
      L(out, sr, 0, 0.25, 1, (b) => {
        noiseBurst(b, sr, rng, 0, 0.006, { f: 3000, q: 0.5, a: 0.0001, d: 0.004, gain: 1.4 });
        excite(b, sr, 0, burst(sr, rng, 0.003), [
          { f: 620 + rng() * 300, t60: 0.05, a: 1 }, { f: 1500 + rng() * 400, t60: 0.03, a: 0.7 }, { f: 2900 + rng() * 600, t60: 0.02, a: 0.4 }, { f: 260, t60: 0.08, a: 0.5 },
        ], 0.8);
      });
      L(out, sr, 0.004, 0.25, 0.55, (b) => crackle(b, sr, rng, 0, 0.12, { density: 700, f: 2200, spread: 1.6, t60: 0.004, env: (u) => Math.exp(-u * 3) }));
      if (rng() < 0.7) L(out, sr, 0.15 + rng() * 0.2, 1.1, 0.3, (b) => rustle(b, sr, rng, 0, 0.9, { density: 300, f: 2800, env: (u) => Math.exp(-u * 2.5) * Math.min(1, u * 20) }));
      if (rng() < 0.5) L(out, sr, 0.4 + rng() * 0.3, 0.3, 0.25, (b) => thud(b, sr, rng, 0, { f: 90, fEnd: 70, t60: 0.1, noise: 1 }));
      return out;
    },
  },

  splash: {
    vars: 3, ref: 2, reverb: 0.2,
    gen({ sr, rng }) {
      const out = alloc(sr, 1.4);
      L(out, sr, 0, 0.6, 1, (b) => {
        thud(b, sr, rng, 0, { f: 75, fEnd: 50, t60: 0.15, noise: 1.5, click: 0 });
        noiseBurst(b, sr, rng, 0, 0.5, { type: 'lp', f: 2200, q: 0.5, a: 0.01, d: 0.25, gain: 1.4 });
      });
      L(out, sr, 0.02, 1.2, 0.6, (b) => {
        const n = 30 + Math.floor(rng() * 20);
        for (let i = 0; i < n; i++) {
          const t = Math.pow(rng(), 1.8) * 1.0;
          bubble(b, sr, t, { f: 300 + rng() * 2400, t60: 0.02 + rng() * 0.08, rise: 1.2 + rng() * 1.2, gain: (0.2 + rng() * 0.6) * (1 - t * 0.7) });
        }
        noiseBurst(b, sr, rng, 0.05, 0.6, { f: 5000, q: 0.5, a: 0.02, d: 0.3, gain: 0.25 });
      });
      return out;
    },
  },

  bell_temple: {
    vars: 2, ref: 6, rolloff: 0.6, reverb: 0.5, sr: 32000, gain: 1,
    gen({ sr, rng, v }) {
      const f = v === 0 ? 112 : 96;
      const dur = 11;
      const out = alloc(sr, dur);
      // wooden ram strike (Thai temple bells are struck from outside with a log)
      L(out, sr, 0, 0.4, 0.5, (b) => {
        thud(b, sr, rng, 0, { f: 140, fEnd: 90, t60: 0.15, noise: 1.0, click: 0.2 });
        noiseBurst(b, sr, rng, 0, 0.03, { f: 1200, q: 0.6, a: 0.0005, d: 0.02, gain: 0.6 });
      });
      L(out, sr, 0.002, dur, 1, (b) => {
        addModes(b, sr, 0, bellPartials(f, 1, rng));
        // slow amplitude 'wow' as the bell sways
        for (let i = 0; i < b.length; i++) b[i] *= 1 + 0.08 * Math.sin((i / sr) * 1.3);
      });
      fadeOut(out, sr, 1.5);
      return out;
    },
  },

  wind_chime: {
    vars: 3, ref: 2, reverb: 0.3,
    gen({ sr, rng }) {
      const dur = 4;
      const out = alloc(sr, dur);
      const bells = [1320, 1560, 1760, 2090, 2350].map((x) => x * (0.97 + rng() * 0.06));
      const hits = 4 + Math.floor(rng() * 5);
      L(out, sr, 0, dur, 1, (b) => {
        for (let h = 0; h < hits; h++) {
          const t = Math.pow(rng(), 0.8) * 2.2;
          const f = bells[Math.floor(rng() * bells.length)];
          addModes(b, sr, Math.floor(t * sr), bellPartials(f, 0.18, rng).filter((m) => m.f < 12000), 0.3 + rng() * 0.7);
        }
      });
      fadeOut(out, sr, 0.5);
      return out;
    },
  },

  alms_bowl: {
    vars: 2, ref: 1.5, reverb: 0.15,
    gen({ sr, rng }) {
      const out = alloc(sr, 3.2);
      const f = 330 + rng() * 40;
      const bowl = [{ f, t60: 2.4, a: 1 }, { f: f * 2.71, t60: 1.6, a: 0.6 }, { f: f * 4.95, t60: 1.0, a: 0.35 }, { f: f * 7.6, t60: 0.6, a: 0.2 }, { f: f * 1.003, t60: 2.2, a: 0.5 }];
      // lid lifted off (clink)
      L(out, sr, 0, 3, 0.5, (b) => excite(b, sr, 0, burst(sr, rng, 0.002), bowl, 1));
      // sticky rice dropped in: soft muffled pats + grains exciting the bowl
      L(out, sr, 0.45, 2.7, 0.7, (b) => {
        const exc = alloc(sr, 0.8);
        for (let k = 0; k < 5; k++) noiseBurst(exc, sr, rng, k * 0.09 + rng() * 0.03, 0.03, { type: 'lp', f: 600, q: 0.6, a: 0.003, d: 0.02, gain: 0.6 });
        crackle(exc, sr, rng, 0, 0.5, { density: 300, f: 3000, spread: 1.4, t60: 0.002, gain: 0.3, env: (u) => 1 - u });
        excite(b, sr, 0, exc, bowl.map((m) => ({ ...m, t60: m.t60 * 0.35 })), 1);
        thud(b, sr, rng, 0, { f: 160, fEnd: 120, t60: 0.08, noise: 1, gain: 0.3, click: 0 });
      });
      return out;
    },
  },

  garland_jingle: {
    vars: 3, cabin: true, ref: 1, reverb: 0.06,
    gen({ sr, rng }) {
      const out = alloc(sr, 1.6);
      L(out, sr, 0, 1.5, 0.7, (b) => {
        const n = 3 + Math.floor(rng() * 4);
        for (let i = 0; i < n; i++) addModes(b, sr, Math.floor(rng() * 0.6 * sr), bellPartials(3400 + rng() * 1800, 0.06, rng).filter((m) => m.f < 13000), 0.4 + rng() * 0.6);
      });
      L(out, sr, 0, 0.8, 0.5, (b) => {
        for (let i = 0; i < 6; i++) plasticClick(b, sr, rng, rng() * 0.5, { f: 2600 + rng() * 1500, body: 0.2 });
      });
      L(out, sr, 0, 1, 0.3, (b) => rustle(b, sr, rng, 0, 0.8, { density: 200, f: 2500, env: (u) => Math.sin(Math.PI * u) }));
      return out;
    },
  },
};
