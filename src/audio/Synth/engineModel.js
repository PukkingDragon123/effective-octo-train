// Piston-engine pulse model rendered offline. Each combustion event emits an
// exhaust pressure pulse (shape defined in crank-angle terms so it scales with
// rpm like a real engine), with per-cylinder imbalance, cycle-to-cycle
// variation, valve-train ticks and intake/mechanical hash.
//
// Two uses:
//  * renderEngineLoop(): N whole engine cycles at a fixed rpm/load, wrap-around
//    so the buffer loops seamlessly. The realtime EngineSound plays these at
//    playbackRate = rpm / baseRpm and adds FIXED exhaust resonances in WebAudio.
//  * renderEngineCurve(): a one-shot following an rpm(t)/load(t) curve with the
//    resonances baked in (engine start, stall, distant motorbike pass).
import { TAU, clamp, rngFrom, SVF, Biquad, OnePole, Wander, alloc, normalize, Reson } from './dsp.js';

export const CAR_CFG = {
  cylinders: 4, // fires per 720°
  imbalance: [1.0, 0.9, 1.06, 0.95],
  pulseWidth: 0.36, // radians of crank per pulse rise/decay (blowdown)
  snap: 0.55, // sharp combustion edge component
  rasp: 0.18, // noise burst per firing
  valveTick: 0.05,
  mech: 0.04, // mechanical hash
  jitter: 0.03, // firing timing jitter (fraction of interval)
  ampVar: 0.12, // cycle-to-cycle amplitude variation
  pipe: [{ f: 105, t60: 0.09, a: 1.0 }, { f: 290, t60: 0.05, a: 0.5 }, { f: 760, t60: 0.03, a: 0.22 }, { f: 1650, t60: 0.015, a: 0.1 }],
};

export const BIKE_CFG = {
  cylinders: 1,
  imbalance: [1],
  pulseWidth: 0.55,
  snap: 0.5,
  rasp: 0.32,
  valveTick: 0.09,
  mech: 0.06,
  jitter: 0.02,
  ampVar: 0.1,
  pipe: [{ f: 180, t60: 0.07, a: 1.0 }, { f: 420, t60: 0.06, a: 0.7 }, { f: 1250, t60: 0.03, a: 0.3 }, { f: 2600, t60: 0.012, a: 0.12 }],
};

/** Pulse shape g(φ) in crank radians since firing; gamma-like blowdown + rarefaction lobe. */
function pulseShape(phi, w) {
  if (phi < 0) return 0;
  const x = phi / w;
  const main = x * Math.exp(1 - x);
  const y = (phi - w * 1.6) / (w * 1.3);
  const rare = y > 0 ? -0.38 * y * Math.exp(1 - y) : 0;
  return main + rare;
}
function snapShape(phi, w) {
  if (phi < 0) return 0;
  const x = phi / (w * 0.12);
  return x * Math.exp(1 - x);
}

/**
 * Core renderer. rpmAt(t), loadAt(t) give the state; writes into out[].
 * wrapLen: if set, events wrap modulo the buffer (seamless loop).
 */
function renderPulses(out, sr, cfg, rpmAt, loadAt, rng, opts = {}) {
  const n = out.length;
  const cyl = cfg.cylinders;
  const firingInterval = (4 * Math.PI) / cyl; // crank radians between firings
  const rasp = new SVF(sr, 2500, 0.8);
  const tickF = new SVF(sr, 4200, 3);
  const mechF = new SVF(sr, 1800, 0.7);
  const wrap = !!opts.wrap;
  const events = []; // {t (samples), amp, load, cyl}
  // walk crank angle through time and collect firing events
  let theta = opts.theta0 ?? 0;
  let nextFire = firingInterval * 0.5;
  let k = 0;
  const step = 16;
  for (let i = 0; i < n; i += step) {
    const t = i / sr;
    const rpm = rpmAt(t);
    const w = (rpm / 60) * TAU; // rad/s
    const dTheta = (w * step) / sr;
    while (theta + dTheta >= nextFire && rpm > 30) {
      const frac = (nextFire - theta) / Math.max(dTheta, 1e-9);
      const c = k % cyl;
      const load = loadAt(t);
      const miss = opts.misfire ? opts.misfire(t, rng) : false;
      const jit = (rng() * 2 - 1) * cfg.jitter * (firingInterval / Math.max(w, 1)) * sr;
      events.push({
        s: i + frac * step + jit,
        amp: miss ? 0.08 : (cfg.imbalance[c] ?? 1) * (1 + (rng() * 2 - 1) * cfg.ampVar) * (0.35 + 0.65 * load),
        load,
        w,
        c,
      });
      nextFire += firingInterval;
      k++;
    }
    theta += dTheta;
  }
  // write pulses (crank-angle shaped) + snap + rasp noise + valve ticks
  for (const e of events) {
    const w = e.w;
    const pw = cfg.pulseWidth * (1.15 - 0.3 * e.load);
    const len = Math.ceil(((pw * 7) / w) * sr);
    const snapAmp = cfg.snap * (0.4 + e.load);
    const raspAmp = cfg.rasp * (0.3 + 0.9 * e.load) * e.amp;
    for (let j = 0; j < len; j++) {
      let idx = Math.floor(e.s) + j;
      if (wrap) idx = ((idx % n) + n) % n;
      else if (idx < 0 || idx >= n) continue;
      const phi = ((j + (Math.floor(e.s) - e.s)) / sr) * w;
      let v = pulseShape(phi, pw) * e.amp + snapShape(phi, pw) * snapAmp * e.amp;
      if (phi < pw * 1.2) v += (rng() * 2 - 1) * raspAmp * Math.exp(-phi / (pw * 0.35));
      out[idx] += v;
    }
  }
  // filter the rasp component smoothness: gentle lowpass of whole signal to keep it pulse-like
  // valve-train ticks: 2 per cylinder per cycle, offset from firing
  if (cfg.valveTick > 0) {
    for (const e of events) {
      const off = ((Math.PI * 0.8) / e.w) * sr;
      for (let v = 0; v < 2; v++) {
        const at = Math.floor(e.s + off * (1 + v * 1.7));
        const L = Math.floor(0.004 * sr);
        for (let j = 0; j < L; j++) {
          let idx = at + j;
          if (wrap) idx = ((idx % n) + n) % n;
          else if (idx < 0 || idx >= n) continue;
          out[idx] += tickF.process((rng() * 2 - 1) * Math.exp(-j / (0.0007 * sr))) * cfg.valveTick * 3;
        }
      }
    }
  }
  // mechanical hash (continuous noise modulated by the firing rhythm)
  if (cfg.mech > 0) {
    let envFollow = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(out[i]);
      envFollow += (a - envFollow) * 0.004;
      out[i] += mechF.process(rng() * 2 - 1) * cfg.mech * (0.3 + envFollow * 2);
    }
  }
  return events.length;
}

/** Seamless loop of whole engine cycles at constant rpm/load. Returns {buffer, baseRpm, sr}. */
export function renderEngineLoop(sr, cfg, rpm, load, seconds = 1.8, seed = 1) {
  const rng = rngFrom(seed);
  const cycle = 120 / rpm; // seconds per 720°
  const cycles = Math.max(4, Math.round(seconds / cycle));
  const len = Math.round(cycles * cycle * sr);
  const out = new Float32Array(len);
  // exact rpm such that the loop holds an integer number of cycles
  const exactRpm = (cycles * 120 * sr) / len;
  renderPulses(out, sr, cfg, () => exactRpm, () => load, rng, { wrap: true });
  // gentle anti-alias + DC removal (the realtime chain adds the pipe resonances)
  const lp1 = new Biquad(sr, 'lowpass', 7000, 0.7);
  const hp = new Biquad(sr, 'highpass', 18, 0.7);
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < len; i++) out[i] = hp.process(lp1.process(out[i]));
  normalize(out, 0.7);
  return { buffer: out, baseRpm: exactRpm };
}

/**
 * One-shot following curves; pipe resonances baked. rpmAt/loadAt functions of t.
 * opts: { misfire(t,rng)->bool, dur, crank: (t)->0..1 starter amount }
 */
export function renderEngineCurve(sr, cfg, dur, rpmAt, loadAt, seed = 3, opts = {}) {
  const rng = rngFrom(seed);
  const raw = alloc(sr, dur);
  renderPulses(raw, sr, cfg, rpmAt, loadAt, rng, opts);
  const out = alloc(sr, dur);
  const pipes = cfg.pipe.map((p) => new Reson(sr, p.f, p.t60, p.a));
  const lp = new SVF(sr, 3000, 0.6);
  const hp = new Biquad(sr, 'highpass', 25, 0.7);
  for (let i = 0; i < raw.length; i++) {
    const x = raw[i];
    let y = x * 0.25;
    for (const p of pipes) y += p.process(x) * 0.6;
    if ((i & 31) === 0) lp.set(1200 + loadAt(i / sr) * 2500 + rpmAt(i / sr) * 0.4, 0.6);
    y = lp.process(y);
    out[i] = Math.tanh(hp.process(y) * 1.4);
  }
  return out;
}
