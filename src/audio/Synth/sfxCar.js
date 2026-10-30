// Car / cabin foley: old green-yellow taxi (doors, key, starter, controls,
// knocks and impacts on the body). Every generator returns a mono Float32Array.
import { TAU, alloc, normalize, mixInto, SVF, Biquad, OnePole, Wander, noiseBurst, creak, envAD, addModes, Osc, clamp, Pink, fadeOut } from './dsp.js';
import { L, excite, burst, impulse, thud, metalTick, plasticClick, rattle, scrape, panelModes, glassModes, crackle } from './lib.js';
import { renderEngineCurve, CAR_CFG, BIKE_CFG } from './engineModel.js';


function starterWhir(out, sr, rng, at, dur, { crankHz = 3.6, gain = 1, slowEnd = false } = {}) {
  // starter motor turning a 4-cyl: 2 compressions per rev, motor loads up on each
  const s = Math.floor(at * sr);
  const n = Math.min(out.length - s, Math.floor(dur * sr));
  const o1 = new Osc(sr), o2 = new Osc(sr), o3 = new Osc(sr);
  const bp = new SVF(sr, 900, 1.2);
  const body = new SVF(sr, 140, 1.5);
  let cph = rng();
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const u = i / n;
    const ch = crankHz * (slowEnd ? 1 - 0.3 * u : 1) * (0.9 + 0.1 * Math.min(1, t * 4));
    cph += (ch * 2) / sr;
    const comp = Math.pow(0.5 - 0.5 * Math.cos(TAU * cph), 3); // compression load bump
    const f = 210 * (1 - 0.22 * comp) * (0.85 + 0.15 * Math.min(1, t * 6));
    const w = o1.saw(f) * 0.5 + o2.square(f * 2, 0.3) * 0.25 + o3.saw(f * 6.1) * 0.12;
    const nz = rng() * 2 - 1;
    bp.process(w + nz * 0.5);
    body.process(comp * 2 - 1 + nz * 0.1);
    const env = Math.min(1, t / 0.03) * Math.min(1, (dur - t) / 0.05);
    out[s + i] += (bp.bp * (0.7 + 0.3 * comp) + body.bp * 0.9 + w * 0.15) * env * gain;
  }
  return out;
}

/** Cranking time per engine_start variant (EngineSound syncs its loop to it). */
export const ENGINE_START_CRANK = [0.82, 1.05];

export const CAR_SFX = {
  door_open: {
    vars: 3, cabin: true, ref: 1.6, reverb: 0.12,
    gen({ sr, rng }) {
      const out = alloc(sr, 1.4);
      L(out, sr, 0, 0.05, 0.55, (b) => {
        plasticClick(b, sr, rng, 0, { f: 1400 + rng() * 300, body: 0.9 });
        metalTick(b, sr, rng, 0.011, { f: 2000 + rng() * 300, t60: 0.05, gain: 1.2 });
      });
      L(out, sr, 0.014, 0.3, 0.6, (b) => excite(b, sr, 0, burst(sr, rng, 0.012, { lp: 700 }), panelModes(1.25, 0.45, rng)));
      L(out, sr, 0.05, 0.3, 0.45, (b) => thud(b, sr, rng, 0, { f: 58, fEnd: 38, t60: 0.2, noise: 0.7, click: 0 }));
      const cd = 0.3 + rng() * 0.35;
      L(out, sr, 0.13, cd + 0.1, 0.12 + rng() * 0.12, (b) =>
        creak(b, sr, rng, 0, cd, {
          rate0: 55 + rng() * 30, rate1: 110 + rng() * 60,
          modes: [{ f: 700 + rng() * 300, t60: 0.05, a: 1 }, { f: 1500 + rng() * 300, t60: 0.03, a: 0.6 }, { f: 3100, t60: 0.015, a: 0.25 }],
          env: (t) => Math.sin(Math.PI * Math.pow(t, 0.6)),
        }),
      );
      const te = 0.13 + cd + 0.06;
      L(out, sr, te, 0.4, 0.5, (b) => {
        excite(b, sr, 0, burst(sr, rng, 0.008, { lp: 1500 }), panelModes(1.05, 0.5, rng));
        metalTick(b, sr, rng, 0.002, { f: 950, t60: 0.06, gain: 0.6 });
        rattle(b, sr, rng, 0.01, 0.18, { count: 6, f: 2300, gain: 0.25 });
      });
      return out;
    },
  },

  door_close: {
    vars: 3, cabin: true, ref: 2, reverb: 0.18, sr: 24000,
    gen({ sr, rng }) {
      const out = alloc(sr, 1.1);
      // the slam: heavy low thunk of the whole body + air pressure
      L(out, sr, 0.006, 0.6, 1.0, (b) => {
        thud(b, sr, rng, 0, { f: 78 + rng() * 10, fEnd: 46, t60: 0.32, noise: 0.9, click: 0.05 });
        excite(b, sr, 0, burst(sr, rng, 0.02, { lp: 500 }), [
          { f: 64 + rng() * 6, t60: 0.28, a: 1 }, { f: 97, t60: 0.2, a: 0.8 }, { f: 151, t60: 0.14, a: 0.55 }, { f: 233, t60: 0.1, a: 0.35 },
        ], 0.6);
      });
      // door skin + body panel ring
      L(out, sr, 0.004, 0.45, 0.42, (b) => excite(b, sr, 0, burst(sr, rng, 0.006, { lp: 2500 }), panelModes(1 + rng() * 0.1, 0.7, rng)));
      // two-stage latch: "ka-chunk"
      L(out, sr, 0.0, 0.08, 0.45, (b) => {
        metalTick(b, sr, rng, 0, { f: 1700 + rng() * 300, t60: 0.035 });
        metalTick(b, sr, rng, 0.019 + rng() * 0.006, { f: 1250 + rng() * 200, t60: 0.05, gain: 1.3 });
      });
      // loose trim & window glass in the door rattle afterwards
      L(out, sr, 0.02, 0.4, 0.16, (b) => {
        rattle(b, sr, rng, 0, 0.25, { count: 9, f: 2800, gain: 1 });
        excite(b, sr, 0.01, burst(sr, rng, 0.004), glassModes(1, 0.8), 0.6);
      });
      return out;
    },
  },

  key_insert: {
    vars: 2, cabin: true, ref: 1, reverb: 0.05,
    gen({ sr, rng }) {
      const out = alloc(sr, 0.45);
      L(out, sr, 0, 0.32, 0.22, (b) => scrape(b, sr, rng, 0, 0.3, { f0: 3800, f1: 3200, q: 3, grit: 1 }));
      const pins = 5 + Math.floor(rng() * 2);
      L(out, sr, 0.02, 0.4, 0.8, (b) => {
        for (let i = 0; i < pins; i++) metalTick(b, sr, rng, i * (0.04 + rng() * 0.012), { f: 3600 + rng() * 1500, t60: 0.02, gain: 0.5 + rng() * 0.4 });
        metalTick(b, sr, rng, pins * 0.047 + 0.01, { f: 2100, t60: 0.05, gain: 1.1 });
      });
      return out;
    },
  },

  key_turn: {
    vars: 2, cabin: true, ref: 1, reverb: 0.05,
    gen({ sr, rng }) {
      const out = alloc(sr, 0.5);
      L(out, sr, 0, 0.2, 0.8, (b) => {
        metalTick(b, sr, rng, 0, { f: 2400, t60: 0.03 });
        plasticClick(b, sr, rng, 0.004, { f: 1300, body: 0.8 });
        metalTick(b, sr, rng, 0.09 + rng() * 0.03, { f: 2900, t60: 0.025, gain: 0.7 });
      });
      // ignition relay + dash warning lamps "tok" deep in the dash
      L(out, sr, 0.13, 0.25, 0.35, (b) => {
        plasticClick(b, sr, rng, 0, { f: 700, body: 1.2 });
        noiseBurst(b, sr, rng, 0.0, 0.12, { f: 180, q: 3, a: 0.002, d: 0.08, gain: 0.3 });
      });
      return out;
    },
  },

  ignition: {
    vars: 2, cabin: true, ref: 2.5, reverb: 0.12, sr: 24000,
    gen({ sr, rng }) {
      const dur = 1.5 + rng() * 0.4;
      const out = alloc(sr, dur + 0.3);
      L(out, sr, 0, 0.1, 0.55, (b) => {
        metalTick(b, sr, rng, 0, { f: 1100, t60: 0.05 });
        thud(b, sr, rng, 0, { f: 120, fEnd: 90, t60: 0.06, noise: 0.3, click: 0.4 });
      });
      L(out, sr, 0.02, dur, 1.0, (b) => starterWhir(b, sr, rng, 0, dur - 0.02, { crankHz: 3.3 + rng() * 0.6 }));
      L(out, sr, dur, 0.15, 0.3, (b) => metalTick(b, sr, rng, 0, { f: 1400, t60: 0.04 }));
      return out;
    },
  },

  engine_start: {
    vars: 2, cabin: true, ref: 3, reverb: 0.15, sr: 22050,
    gen({ sr, rng, v }) {
      const crank = ENGINE_START_CRANK[v] ?? 0.85;
      const dur = crank + 2.4;
      const out = alloc(sr, dur);
      L(out, sr, 0, 0.1, 0.4, (b) => metalTick(b, sr, rng, 0, { f: 1100, t60: 0.05 }));
      L(out, sr, 0.02, crank + 0.25, 0.75, (b) => starterWhir(b, sr, rng, 0, crank + 0.2, { crankHz: 3.6 }));
      const rpmAt = (t) => {
        const u = t - crank;
        if (u < 0) return 200 + 30 * Math.sin(t * 40);
        if (u < 0.35) return 200 + (1650 - 200) * Math.pow(u / 0.35, 1.4);
        return 860 + (1650 - 860) * Math.exp(-(u - 0.35) / 0.35) + 25 * Math.sin(u * 9);
      };
      const loadAt = (t) => (t < crank ? 0.15 : t < crank + 0.4 ? 0.85 : 0.25);
      const eng = renderEngineCurve(sr, CAR_CFG, dur, rpmAt, loadAt, 11 + v, {
        misfire: (t, r) => t < crank * 0.85 ? r() < 0.75 : t < crank + 0.15 ? r() < 0.35 : r() < 0.02,
      });
      normalize(eng, 1);
      const fade = Math.floor(0.4 * sr);
      for (let i = 0; i < fade; i++) eng[eng.length - fade + i] *= 1 - i / fade;
      mixInto(out, eng, 0, 0.95);
      return out;
    },
  },

  engine_stall: {
    vars: 2, cabin: true, ref: 3, reverb: 0.15, sr: 22050,
    gen({ sr, rng, v }) {
      const dur = 1.8;
      const out = alloc(sr, dur + 0.3);
      const rpmAt = (t) => Math.max(0, 820 * Math.pow(1 - t / 1.05, 1.3) + (t < 0.6 ? 60 * Math.sin(t * 30) : 0));
      const eng = renderEngineCurve(sr, CAR_CFG, dur, rpmAt, (t) => 0.5 - t * 0.3, 21 + v, { misfire: (t, r) => r() < 0.15 + t * 0.6 });
      normalize(eng, 1);
      mixInto(out, eng, 0, 0.9);
      // body shudder clunk as the engine rocks on its mounts
      L(out, sr, 0.95 + rng() * 0.1, 0.6, 0.6, (b) => {
        thud(b, sr, rng, 0, { f: 48, fEnd: 30, t60: 0.4, noise: 0.5 });
        rattle(b, sr, rng, 0.02, 0.3, { count: 8, f: 2200, gain: 0.25 });
      });
      return out;
    },
  },

  handbrake: {
    // variant 0 = pull (ratchet), 1 = release (button + drop)
    vars: 2, fixedVariants: true, cabin: true, ref: 1, reverb: 0.06,
    gen({ sr, rng, v }) {
      const out = alloc(sr, 0.7);
      if (v === 0) {
        const teeth = 6 + Math.floor(rng() * 3);
        let t = 0;
        L(out, sr, 0, 0.6, 0.9, (b) => {
          for (let i = 0; i < teeth; i++) {
            metalTick(b, sr, rng, t, { f: 2600 + rng() * 400, t60: 0.025, gain: 0.6 + i * 0.05 });
            excite(b, sr, t, burst(sr, rng, 0.002), [{ f: 620, t60: 0.03, a: 1 }, { f: 1340, t60: 0.02, a: 0.5 }], 0.3);
            t += 0.045 + i * 0.008;
          }
        });
        L(out, sr, 0.0, 0.5, 0.25, (b) => scrape(b, sr, rng, 0, 0.42, { f0: 500, f1: 800, q: 2, grit: 0.4 }));
      } else {
        L(out, sr, 0, 0.1, 0.5, (b) => plasticClick(b, sr, rng, 0, { f: 2100, body: 0.6 }));
        L(out, sr, 0.08, 0.5, 0.9, (b) => {
          scrape(b, sr, rng, 0, 0.18, { f0: 700, f1: 400, q: 2, grit: 0.3 });
          thud(b, sr, rng, 0.17, { f: 110, fEnd: 80, t60: 0.12, noise: 0.5, click: 0.5 });
          metalTick(b, sr, rng, 0.172, { f: 1500, t60: 0.05, gain: 0.6 });
        });
      }
      return out;
    },
  },

  gear_shift: {
    vars: 3, cabin: true, ref: 1, reverb: 0.06,
    gen({ sr, rng }) {
      const out = alloc(sr, 0.5);
      L(out, sr, 0, 0.3, 0.5, (b) => scrape(b, sr, rng, 0, 0.12 + rng() * 0.05, { f0: 300, f1: 500, q: 1.5, grit: 0.2 }));
      L(out, sr, 0.1 + rng() * 0.05, 0.35, 1, (b) => {
        thud(b, sr, rng, 0, { f: 160, fEnd: 120, t60: 0.08, noise: 0.6, click: 0.2 });
        metalTick(b, sr, rng, 0.003, { f: 1250 + rng() * 300, t60: 0.06, gain: 0.8 });
        excite(b, sr, 0.004, burst(sr, rng, 0.003), [{ f: 420, t60: 0.05, a: 1 }, { f: 860, t60: 0.04, a: 0.5 }], 0.4);
      });
      return out;
    },
  },

  indicator_tick: {
    // variant 0 = tick (relay closes), 1 = tock (opens)
    vars: 2, fixedVariants: true, cabin: true, ref: 1, reverb: 0.03, loopInterval: 0.36, loopAlternate: true,
    gen({ sr, rng, v }) {
      const out = alloc(sr, 0.12);
      L(out, sr, 0, 0.1, v === 0 ? 1 : 0.7, (b) => {
        plasticClick(b, sr, rng, 0, { f: v === 0 ? 2300 : 1750, body: v === 0 ? 0.6 : 0.9 });
        excite(b, sr, 0.0005, burst(sr, rng, 0.0012), [{ f: v === 0 ? 900 : 760, t60: 0.02, a: 1 }, { f: 3800, t60: 0.008, a: 0.4 }], 0.6);
      });
      return out;
    },
  },

  wiper: {
    vars: 2, cabin: true, ref: 1.2, reverb: 0.05, loopInterval: 1.25, sr: 24000,
    gen({ sr, rng }) {
      const dur = 1.2;
      const out = alloc(sr, dur + 0.15);
      // motor + linkage whine
      L(out, sr, 0, dur, 0.35, (b) => {
        const o = new Osc(sr), o2 = new Osc(sr);
        const bp = new SVF(sr, 320, 2);
        for (let i = 0; i < b.length; i++) {
          const t = i / sr;
          const sp = Math.abs(Math.sin((Math.PI * t) / dur));
          const f = 95 + 25 * sp;
          bp.process(o.saw(f) + o2.square(f * 3.02) * 0.4 + (rng() * 2 - 1) * 0.3);
          b[i] = bp.bp * (0.3 + 0.7 * sp) * Math.min(1, t / 0.04, (dur - t) / 0.04);
        }
      });
      // rubber blade on (slightly dry) glass: squeaky stick-slip in two strokes
      for (let s = 0; s < 2; s++) {
        L(out, sr, 0.04 + s * dur * 0.5, dur * 0.48, 0.32 + rng() * 0.15, (b) =>
          creak(b, sr, rng, 0, dur * 0.46, {
            rate0: 260 + rng() * 80, rate1: 340 + rng() * 120, jitter: 0.15,
            modes: [{ f: 1100 + rng() * 300, t60: 0.02, a: 1 }, { f: 2300 + rng() * 300, t60: 0.012, a: 0.6 }, { f: 4200, t60: 0.006, a: 0.3 }],
            env: (t) => Math.pow(Math.sin(Math.PI * t), 0.6) * (0.6 + 0.4 * Math.sin(t * 17)),
          }),
        );
        L(out, sr, 0.04 + s * dur * 0.5, dur * 0.48, 0.12, (b) => scrape(b, sr, rng, 0, dur * 0.46, { f0: 2400, f1: 2000, q: 1.2, grit: 0.4 }));
      }
      // reversal thump at the end of each stroke
      L(out, sr, dur * 0.5, 0.2, 0.55, (b) => thud(b, sr, rng, 0, { f: 140, fEnd: 100, t60: 0.08, noise: 0.5, click: 0.4 }));
      L(out, sr, dur - 0.02, 0.2, 0.75, (b) => {
        thud(b, sr, rng, 0, { f: 120, fEnd: 90, t60: 0.1, noise: 0.5, click: 0.4 });
        rattle(b, sr, rng, 0.005, 0.06, { count: 3, f: 2000, gain: 0.3 });
      });
      return out;
    },
  },

  window_crank: {
    vars: 2, cabin: true, ref: 1, reverb: 0.05,
    gen({ sr, rng }) {
      // ~2.5 turns of a stiff old regulator handle: per-turn creak + gear ticks, glass rubbing in its channel
      const turn = 0.48 + rng() * 0.1;
      const turns = 2 + Math.floor(rng() * 2);
      const dur = turns * turn + 0.15;
      const out = alloc(sr, dur + 0.3);
      for (let k = 0; k < turns; k++) {
        const t0 = k * turn + rng() * 0.02;
        L(out, sr, t0, turn, 0.55, (b) =>
          creak(b, sr, rng, 0, turn * 0.8, {
            rate0: 45 + rng() * 25, rate1: 70 + rng() * 30, jitter: 0.3,
            modes: [{ f: 620 + rng() * 120, t60: 0.05 }, { f: 1450 + rng() * 200, t60: 0.03, a: 0.5 }, { f: 2900, t60: 0.012, a: 0.25 }],
            env: (u) => Math.pow(Math.sin(Math.PI * u), 1.5) * (0.6 + 0.4 * Math.sin(Math.PI * u * 2)),
          }),
        );
        L(out, sr, t0, turn, 0.16, (b) => {
          for (let t = 0; t < turn * 0.85; t += 0.06 + rng() * 0.02) metalTick(b, sr, rng, t, { f: 2100 + rng() * 500, t60: 0.01, gain: 0.4 + 0.6 * Math.sin((Math.PI * t) / turn) });
        });
      }
      L(out, sr, 0.04, dur, 0.22, (b) => scrape(b, sr, rng, 0, dur - 0.08, { f0: 480, f1: 420, q: 2.5, grit: 0.1, env: (u) => Math.min(1, u * 8, (1 - u) * 6) * (0.6 + 0.4 * Math.abs(Math.sin((u * dur * Math.PI) / turn))) }));
      L(out, sr, dur - 0.06, 0.3, 0.5, (b) => {
        excite(b, sr, 0, burst(sr, rng, 0.006, { lp: 1800 }), glassModes(0.9, 0.7));
        thud(b, sr, rng, 0, { f: 130, fEnd: 100, t60: 0.08, noise: 0.5, click: 0.2 });
      });
      return out;
    },
  },

  radio_click: {
    vars: 2, cabin: true, ref: 1, reverb: 0.04,
    gen({ sr, rng }) {
      const out = alloc(sr, 0.25);
      L(out, sr, 0, 0.2, 1, (b) => {
        plasticClick(b, sr, rng, 0, { f: 1150 + rng() * 200, body: 1.2 });
        metalTick(b, sr, rng, 0.003, { f: 2500, t60: 0.02, gain: 0.5 });
      });
      // speaker pop as the amp powers up
      L(out, sr, 0.015, 0.15, 0.35, (b) => thud(b, sr, rng, 0, { f: 90, fEnd: 60, t60: 0.08, noise: 0.2, click: 0 }));
      return out;
    },
  },

  radio_tune: {
    vars: 3, cabin: true, ref: 1, reverb: 0.04,
    gen({ sr, rng }) {
      const dur = 0.9 + rng() * 0.5;
      const out = alloc(sr, dur);
      const bp = new SVF(sr, 1500, 0.9);
      const o = new Osc(sr), o2 = new Osc(sr);
      const w = new Wander(rng, 9);
      const crackleB = alloc(sr, dur);
      crackle(crackleB, sr, rng, 0, dur, { density: 90, f: 2500, spread: 1.2, t60: 0.003, gain: 1 });
      normalize(crackleB, 1);
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        const u = t / dur;
        const sweep = 400 + 3200 * (0.5 + 0.5 * Math.sin(u * 7 + w.next(1 / sr) * 2));
        bp.set(sweep, 1.1);
        bp.process(rng() * 2 - 1);
        // heterodyne whistles passing stations
        const whistleF = 300 + Math.abs(Math.sin(u * 13.0 + 1.3)) * 3800;
        const st = Math.exp(-Math.pow(((u * 5) % 1) - 0.5, 2) * 40);
        let y = bp.bp * 0.9 + o.sine(whistleF) * 0.18 * st;
        // snippets of programme: AM'd buzzy tones
        y += o2.square(180 + 80 * Math.sin(t * 9)) * 0.12 * st * (0.5 + 0.5 * Math.sin(t * 31));
        y += crackleB[i] * 0.25;
        out[i] = y * Math.min(1, t / 0.03, (dur - t) / 0.06);
      }
      return out;
    },
  },

  meter_beep: {
    vars: 1, cabin: true, ref: 1, reverb: 0.04,
    gen({ sr, rng }) {
      // old taxi meter piezo: two short chirps
      const out = alloc(sr, 0.4);
      const o = new Osc(sr);
      const res = new SVF(sr, 2850, 6);
      for (let k = 0; k < 2; k++) {
        const s = Math.floor((k * 0.14) * sr);
        const n = Math.floor(0.085 * sr);
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const x = o.square(2730, 0.5) * Math.min(1, t / 0.002, (0.085 - t) / 0.004);
          res.process(x);
          out[s + i] += res.bp * 0.7 + x * 0.06;
        }
      }
      return out;
    },
  },

  horn: {
    vars: 1, cabin: false, ref: 4, reverb: 0.25, loopable: true,
    gen({ sr, rng }, loop = false) {
      // old weak twin-tone diaphragm horn, slightly sick
      const dur = loop ? 2.2 : 0.55 + rng() * 0.1;
      const out = alloc(sr, dur);
      const os = [new Osc(sr), new Osc(sr)];
      const fr = [392, 468];
      const res = [new SVF(sr, 1150, 3), new SVF(sr, 2400, 4), new SVF(sr, 620, 2)];
      const w = new Wander(rng, 12);
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        const wob = 1 + w.next(1 / sr) * 0.012;
        const start = loop ? 1 : Math.min(1, t / 0.035);
        const sag = loop ? 1 : 1 - 0.04 * Math.min(1, t / 0.2);
        let x = 0;
        for (let k = 0; k < 2; k++) {
          const p = os[k].square(fr[k] * wob * sag * (k === 1 ? 1 - 0.006 : 1), 0.18);
          x += p * (k === 0 ? 1 : 0.8);
        }
        // diaphragm buzz/clip
        x = Math.tanh(x * 1.8);
        let y = 0;
        for (const r of res) {
          r.process(x);
          y += r.bp;
        }
        const end = loop ? 1 : Math.min(1, (dur - t) / 0.03);
        out[i] = (y * 0.8 + x * 0.12) * start * end * (0.9 + 0.1 * Math.sin(t * 50));
      }
      return out;
    },
  },

  glovebox: {
    vars: 2, cabin: true, ref: 1, reverb: 0.06,
    gen({ sr, rng }) {
      const out = alloc(sr, 0.7);
      L(out, sr, 0, 0.1, 0.7, (b) => plasticClick(b, sr, rng, 0, { f: 1300, body: 1 }));
      L(out, sr, 0.09, 0.4, 0.8, (b) => {
        excite(b, sr, 0, burst(sr, rng, 0.012, { lp: 1200 }), [{ f: 190, t60: 0.12, a: 1 }, { f: 410, t60: 0.08, a: 0.6 }, { f: 870, t60: 0.05, a: 0.4 }, { f: 1460, t60: 0.03, a: 0.2 }]);
      });
      // contents slide: papers, a lighter, coins
      L(out, sr, 0.1, 0.5, 0.35, (b) => {
        scrape(b, sr, rng, 0, 0.18, { f0: 2500, f1: 1800, q: 0.8, grit: 0.6 });
        rattle(b, sr, rng, 0.05, 0.25, { count: 5, f: 3600, gain: 0.6 });
      });
      return out;
    },
  },

  switch_click: {
    vars: 3, cabin: true, ref: 1, reverb: 0.03,
    gen({ sr, rng }) {
      const out = alloc(sr, 0.12);
      L(out, sr, 0, 0.1, 1, (b) => {
        plasticClick(b, sr, rng, 0, { f: 1700 + rng() * 800, body: 0.5 + rng() * 0.5 });
        metalTick(b, sr, rng, 0.0015, { f: 3500 + rng() * 800, t60: 0.012, gain: 0.35 });
      });
      return out;
    },
  },

  seat_creak: {
    vars: 4, cabin: true, ref: 1.2, reverb: 0.06, sr: 24000,
    gen({ sr, rng }) {
      const dur = 0.5 + rng() * 0.6;
      const out = alloc(sr, dur + 0.5);
      // vinyl/leather friction squeak
      L(out, sr, 0, dur, 0.6, (b) =>
        creak(b, sr, rng, 0, dur, {
          rate0: 35 + rng() * 40, rate1: 70 + rng() * 80, jitter: 0.35,
          modes: [{ f: 420 + rng() * 200, t60: 0.05, a: 1 }, { f: 960 + rng() * 200, t60: 0.03, a: 0.5 }, { f: 1900, t60: 0.015, a: 0.25 }],
        }),
      );
      // old seat springs
      L(out, sr, dur * 0.3, 0.7, 0.35, (b) => {
        for (let k = 0; k < 2; k++) addModes(b, sr, Math.floor(k * 0.11 * sr), [
          { f: 380 + rng() * 120, t60: 0.35, a: 0.6 }, { f: 1020 + rng() * 200, t60: 0.2, a: 0.4 }, { f: 2350 + rng() * 300, t60: 0.1, a: 0.25 },
        ], 0.6 + rng() * 0.4);
      });
      L(out, sr, 0.02, 0.3, 0.4, (b) => thud(b, sr, rng, 0, { f: 85, fEnd: 60, t60: 0.15, noise: 0.8, click: 0 }));
      return out;
    },
  },

  collision_thud: {
    vars: 3, cabin: true, ref: 3, reverb: 0.2, sr: 24000,
    gen({ sr, rng }) {
      const out = alloc(sr, 1.6);
      L(out, sr, 0, 1.0, 1, (b) => {
        thud(b, sr, rng, 0, { f: 62, fEnd: 34, t60: 0.6, noise: 1.2, click: 0.2 });
        excite(b, sr, 0, burst(sr, rng, 0.03, { lp: 400 }), [{ f: 48, t60: 0.5, a: 1 }, { f: 81, t60: 0.35, a: 0.8 }, { f: 133, t60: 0.2, a: 0.5 }], 0.5);
      });
      L(out, sr, 0.002, 0.8, 0.55, (b) => {
        excite(b, sr, 0, burst(sr, rng, 0.02, { lp: 3000 }), panelModes(0.95 + rng() * 0.1, 1.2, rng));
        crackle(b, sr, rng, 0, 0.18, { density: 900, f: 1600, spread: 1.3, t60: 0.01, gain: 0.25, env: (u) => 1 - u });
      });
      L(out, sr, 0.03, 0.8, 0.3, (b) => {
        rattle(b, sr, rng, 0, 0.5, { count: 18, f: 2600, gain: 1 });
        excite(b, sr, 0.0, burst(sr, rng, 0.01), glassModes(1, 1.2), 0.5);
      });
      L(out, sr, 0.15, 1.2, 0.12, (b) => scrape(b, sr, rng, 0, 0.9, { f0: 1400, f1: 700, q: 1.2, grit: 1, env: (u) => Math.exp(-u * 4) }));
      return out;
    },
  },

  knock: {
    // single knuckle knock on the side glass (sequence them, or play with count)
    vars: 4, cabin: true, ref: 1, reverb: 0.08,
    gen({ sr, rng }) {
      const out = alloc(sr, 0.35);
      L(out, sr, 0, 0.3, 1, (b) => {
        excite(b, sr, 0, burst(sr, rng, 0.004, { lp: 2500 }), glassModes(0.95 + rng() * 0.1, 1.2));
        excite(b, sr, 0, burst(sr, rng, 0.006, { lp: 700 }), [{ f: 240 + rng() * 40, t60: 0.06, a: 1 }, { f: 560, t60: 0.04, a: 0.5 }], 1.2);
      });
      L(out, sr, 0.001, 0.12, 0.35, (b) => thud(b, sr, rng, 0, { f: 160, fEnd: 120, t60: 0.05, noise: 0.6, click: 0.3 }));
      L(out, sr, 0.004, 0.25, 0.15, (b) => rattle(b, sr, rng, 0, 0.1, { count: 3, f: 3000, gain: 1 }));
      return out;
    },
  },

  knock_trunk: {
    vars: 3, cabin: true, ref: 2, reverb: 0.12, sr: 24000,
    gen({ sr, rng }) {
      // a fist on the trunk lid, heard from inside: hollow, boomy, metallic
      const out = alloc(sr, 0.8);
      L(out, sr, 0, 0.7, 1, (b) => {
        thud(b, sr, rng, 0, { f: 92 + rng() * 10, fEnd: 64, t60: 0.38, noise: 1.0, click: 0.05 });
        excite(b, sr, 0, burst(sr, rng, 0.01, { lp: 600 }), [{ f: 72, t60: 0.4, a: 1 }, { f: 118, t60: 0.3, a: 0.7 }, { f: 176, t60: 0.2, a: 0.4 }], 0.6);
      });
      L(out, sr, 0.002, 0.5, 0.35, (b) => excite(b, sr, 0, burst(sr, rng, 0.008, { lp: 1800 }), panelModes(0.82, 0.9, rng)));
      L(out, sr, 0.01, 0.3, 0.1, (b) => rattle(b, sr, rng, 0, 0.18, { count: 5, f: 2200, gain: 1 }));
      return out;
    },
  },

  thump_roof: {
    vars: 3, cabin: true, ref: 2, reverb: 0.12, sr: 24000,
    gen({ sr, rng }) {
      // something heavy lands on the roof: deep boom, oil-can pop, creak of the pillars
      const out = alloc(sr, 1.6);
      L(out, sr, 0, 0.9, 1, (b) => {
        thud(b, sr, rng, 0, { f: 70, fEnd: 38, t60: 0.6, noise: 1.2, click: 0.03 });
        excite(b, sr, 0, burst(sr, rng, 0.025, { lp: 350 }), [{ f: 55, t60: 0.6, a: 1 }, { f: 88, t60: 0.4, a: 0.7 }], 0.6);
      });
      L(out, sr, 0.01, 0.7, 0.45, (b) => {
        addModes(b, sr, 0, [{ f: 310, fEnd: 250, t60: 0.25, a: 1 }, { f: 520, fEnd: 470, t60: 0.18, a: 0.6 }, { f: 790, t60: 0.12, a: 0.4 }]);
        excite(b, sr, 0, burst(sr, rng, 0.006, { lp: 2500 }), panelModes(0.75, 1.0, rng), 0.5);
      });
      // the roof skin groans under the weight (stick-slip at the seams, falling pitch)
      L(out, sr, 0.22, 1.3, 0.22, (b) => creak(b, sr, rng, 0, 0.8 + rng() * 0.4, { rate0: 140 + rng() * 60, rate1: 60 + rng() * 20, jitter: 0.22, wanderRate: 3, modes: [{ f: 380, t60: 0.06 }, { f: 820, t60: 0.04, a: 0.6 }, { f: 1500, t60: 0.02, a: 0.3 }], env: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 1.2) }));
      return out;
    },
  },

  scratch_glass: {
    vars: 3, cabin: true, ref: 1, reverb: 0.08,
    gen({ sr, rng }) {
      const dur = 1.2 + rng() * 0.7;
      const out = alloc(sr, dur + 0.2);
      // fingernails dragging: chattering squeal with wandering pitch
      for (let k = 0; k < 3; k++) {
        const off = k * 0.03 + rng() * 0.05;
        L(out, sr, off, dur, 0.5 - k * 0.1, (b) =>
          creak(b, sr, rng, 0, dur - off, {
            rate0: 900 + rng() * 600, rate1: 1400 + rng() * 900, jitter: 0.08, wanderRate: 3,
            modes: [{ f: 2600 + k * 300 + rng() * 400, t60: 0.01, a: 1 }, { f: 4100 + rng() * 500, t60: 0.007, a: 0.6 }, { f: 1300, t60: 0.02, a: 0.4 }],
            env: (u) => Math.pow(Math.sin(Math.PI * u), 0.5) * (0.5 + 0.5 * Math.abs(Math.sin(u * 23 + k))),
          }),
        );
      }
      L(out, sr, 0, dur, 0.3, (b) => scrape(b, sr, rng, 0, dur, { f0: 3200, f1: 2600, q: 2, grit: 1 }));
      L(out, sr, 0, dur, 0.25, (b) => {
        const exc = alloc(sr, dur);
        noiseBurst(exc, sr, rng, 0, dur, { f: 1800, q: 1, a: 0.1, d: dur });
        excite(b, sr, 0, exc, glassModes(1, 0.6));
      });
      return out;
    },
  },

  rain_roof_start: {
    vars: 1, cabin: true, ref: 2, reverb: 0.08, sr: 24000,
    gen({ sr, rng }) {
      const dur = 5;
      const out = alloc(sr, dur);
      // first fat drops ping the roof, density grows into a downpour
      L(out, sr, 0, dur, 1, (b) => {
        const res = panelModes(0.8, 0.25, rng);
        const exc = alloc(sr, dur);
        for (let t = 0; t < dur; ) {
          const dens = 3 + Math.pow(t / dur, 2.2) * 400;
          t += -Math.log(1 - rng()) / dens;
          const i = Math.floor(t * sr);
          if (i < exc.length - 3) {
            const a = 0.3 + rng() * 0.8 * (t < 1.5 ? 1.6 : 1);
            exc[i] += a;
            exc[i + 1] -= a * 0.5;
          }
        }
        excite(b, sr, 0, exc, res, 1, 0.1);
        noiseBurst(b, sr, rng, 0, dur, { f: 3000, q: 0.5, a: dur * 0.8, d: dur * 4, gain: 0.08 });
      });
      L(out, sr, 0, dur, 0.4, (b) => noiseBurst(b, sr, rng, 0, dur, { type: 'lp', f: 300, q: 0.5, a: dur * 0.9, d: dur * 3 }));
      fadeOut(out, sr, 0.3);
      return out;
    },
  },
  motorbike_pass: {
    // a distant old motorbike passing on another road (early night ambience)
    vars: 2, ref: 8, rolloff: 0.6, reverb: 0.4, sr: 22050,
    gen({ sr, rng, v }) {
      const dur = 9;
      const shifts = [0, 2.2, 4.6, 7.2];
      const rpmAt = (t) => {
        let k = 0;
        while (k < shifts.length - 1 && t >= shifts[k + 1]) k++;
        const u = (t - shifts[k]) / 2.4;
        return 3600 + Math.min(1, u) * (2600 - k * 300) + Math.sin(t * 3) * 60;
      };
      const raw = renderEngineCurve(sr, BIKE_CFG, dur + 0.5, rpmAt, () => 0.7, 61 + v);
      const out = alloc(sr, dur);
      // doppler (time-warped read) + distance envelope + air absorption
      const lp = new SVF(sr, 1500, 0.6);
      let pos = 0;
      const tc = 4.2 + rng() * 0.6;
      for (let i = 0; i < out.length; i++) {
        const t = i / sr;
        const x = (t - tc) / 1.6;
        const ratio = 1 + 0.045 * -Math.tanh(x);
        pos += ratio;
        const k = Math.floor(pos);
        const f = pos - k;
        const s = (raw[k] || 0) * (1 - f) + (raw[k + 1] || 0) * f;
        const near = 1 / (1 + x * x);
        lp.set(900 + 3500 * near, 0.6);
        out[i] = lp.process(s) * (0.15 + 0.85 * near) * Math.min(1, t / 1.5, (dur - t) / 1.5);
      }
      return out;
    },
  },
};
