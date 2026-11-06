// Sample-based Thai gibberish: real human voices chopped into syllables, re-sequenced from the Thai text.
//
// Voice banks (public/assets/audio/voice/<speaker>.ogg|.mp3 + <speaker>.json, built offline from CC0 Mozilla
// Common Voice recordings): each speaker's speech is cut into "regions" (stretches between pauses) and those into
// syllable grains (80-300 ms, cut at loudness minima), each tagged with its f0 contour (start / middle / end, in
// semitones re the speaker's median), voiced fraction and level, plus a 10 ms f0 track for pitch marks.
//
// A line (renderBankVoiceLine): the Thai text is parsed (speech.js parseThai: syllable count, tones, stress, words,
// particles, phrases), every word gets a run of consecutive grains from one region (real coarticulation inside the
// word), chosen to fit the syllables' tones and lengths and to avoid repeats; runs are joined with 16 ms
// equal-power crossfades, phrases with pauses and breaths. TD-PSOLA (pitch marks from the f0 track) then moves
// each grain gently toward its Thai tone, the line's declination and the character's own pitch, stretches it to
// the speaking rate and scales its formants a little (vocal-tract length per character). Whispers are the same
// render re-excited with noise through its own LPC envelope; old voices tremble; ghosts get the octave-down double
// (PSOLA at half pitch, longer throat), the whispered double and the swell, levelled exactly like speech.js.
import { rngFrom, hashStr, clamp, mixInto, Wander, fadeIn, fadeOut, resample } from './dsp.js';
import { parseThai, planGhostEdits, voicePreset, TONE_SHAPES, toneAt, kLoud, loud50, peakOf, breathEvent, reverseSwell, setMurmurHook } from './speech.js';

/** Speakers shipped in the voice banks: bank type, nominal age (picks the closest per character). */
export const VOICE_SPEAKERS = {
  m1: { bank: 'm', age: 33 },
  m2: { bank: 'm', age: 45 },
  f1: { bank: 'f', age: 25 },
  f2: { bank: 'f', age: 55 },
  om: { bank: 'om', age: 65 },
  of1: { bank: 'of', age: 82 },
  ch: { bank: 'ch', age: 14 },
};
// character `pitch` that matches the bank speaker's own voice (the shift is relative to it)
const PITCH_REF = { m: 0.92, f: 1.05, om: 0.84, of: 0.98, ch: 1.4 };

const BANKS = new Map(); // id -> speaker
const RECENT = new Map(); // id -> Map(grainKey -> use count stamp)
let stamp = 0;

/** Which speaker voices a character: { gender, age } -> speaker id. */
export function speakerFor(v = {}) {
  const g = v.gender || 'm';
  const age = v.age ?? (g === 'child' ? 9 : 40);
  const bank = g === 'child' || age < 13 ? 'ch' : age >= 62 ? (g === 'f' ? 'of' : 'om') : g === 'f' ? 'f' : 'm';
  let best = null;
  for (const [id, s] of Object.entries(VOICE_SPEAKERS)) if (s.bank === bank && (!best || Math.abs(s.age - age) < Math.abs(VOICE_SPEAKERS[best].age - age))) best = id;
  return best;
}
export const hasBank = (id) => BANKS.has(id);

/**
 * Register a decoded bank (worker / main thread). a: { id, info (the speaker json), pcm: Int16Array at info.sr,
 * shift (samples the decoder added before the sync mark) }.
 */
export function setVoiceBank(a) {
  const info = a.info;
  const pcm = a.pcm;
  const sr = info.sr;
  const shift = a.shift | 0;
  const regions = [];
  let gid = 0;
  const rmsAll = [];
  for (const r of info.regions) {
    const at = r.at + shift;
    if (at < 0 || at + r.len > pcm.length) continue;
    const f0q = b64(r.f);
    const reg = { at, len: r.len, f0q, grains: [] };
    for (const g of r.g) {
      reg.grains.push({ a: g[0], len: g[1], c: g[2] == null ? null : [g[2], g[3] ?? g[2], g[4] ?? g[2]], vf: g[5], rms: g[6], id: gid++ });
      rmsAll.push(g[6]);
    }
    pitchMarks(reg, pcm, sr, info.f0);
    regions.push(reg);
  }
  rmsAll.sort((x, y) => x - y);
  BANKS.set(a.id, { id: a.id, sr, f0: info.f0, age: info.age, bank: info.bank, pcm, regions, rmsMed: rmsAll[rmsAll.length >> 1] ?? -20 });
  return { channels: [], sr };
}

function b64(s) {
  if (typeof atob === 'function') {
    const bin = atob(s);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  return new Uint8Array(Buffer.from(s, 'base64'));
}

/** Pitch marks for a region: one per glottal period at the peak of the low-passed wave; unvoiced = 5 ms grid. */
function pitchMarks(reg, pcm, sr, f0med) {
  const n = reg.len;
  const y = new Float32Array(n);
  // 2nd-order low-pass ~900 Hz, run forward and backward (zero phase, so marks sit on the pulses)
  const w = (2 * Math.PI * 900) / sr, al = Math.sin(w) / (2 * Math.SQRT1_2), cw = Math.cos(w), a0 = 1 + al;
  const b0 = (1 - cw) / 2 / a0, b1 = (1 - cw) / a0, a1 = (-2 * cw) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const x = pcm[reg.at + i] / 32768;
    const v = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = v; y[i] = v;
  }
  x1 = x2 = y1 = y2 = 0;
  for (let i = n - 1; i >= 0; i--) {
    const x = y[i];
    const v = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = v; y[i] = v;
  }
  const hopF = Math.round(sr * 0.01);
  const f0At = (t) => {
    const q = reg.f0q[Math.min(reg.f0q.length - 1, Math.max(0, Math.round(t / hopF)))];
    return q ? f0med * Math.pow(2, (q - 128) / 48) : 0;
  };
  const mk = [], mv = [];
  let t = 0, prevV = false;
  while (t < n) {
    const f = f0At(t);
    if (f > 0) {
      const P = sr / f;
      const lo = Math.floor(prevV ? t + 0.75 * P : t);
      const hi = Math.min(n - 1, Math.ceil(prevV ? t + 1.25 * P : t + P));
      if (lo >= n - 1) break;
      let j = lo, best = -Infinity;
      for (let i = lo; i <= hi; i++) if (y[i] > best) { best = y[i]; j = i; }
      if (mk.length && j <= mk[mk.length - 1]) j = mk[mk.length - 1] + Math.max(1, Math.round(P));
      if (j >= n) break;
      mk.push(j); mv.push(1); t = j; prevV = true;
    } else {
      const j = mk.length ? Math.max(mk[mk.length - 1] + 1, prevV ? t + Math.round(sr * 0.004) : t + Math.round(sr * 0.005)) : 0;
      if (j >= n) break;
      mk.push(j); mv.push(0); t = j; prevV = false;
    }
  }
  reg.mk = Int32Array.from(mk);
  reg.mv = Uint8Array.from(mv);
}

// ---------------------------------------------------------------------------------------------- planning
const RUN_MAX = 4;

/** Group a phrase's syllables into words (runs of grains), long words split into pieces of <= RUN_MAX. */
function wordsOf(sylls) {
  const out = [];
  let cur = null;
  for (const s of sylls) {
    if (!cur || s.wordStart || cur.length >= RUN_MAX || s.repeatMark) {
      cur = [];
      out.push(cur);
    }
    cur.push(s);
  }
  return out;
}

/** Target tone contour (semitones) at u = 0, .5, 1 for a syllable. */
function toneTarget(sy, depth, shape) {
  const sh = shape || TONE_SHAPES[sy.tone] || TONE_SHAPES.M;
  return [toneAt(sh, 0.05) * depth, toneAt(sh, 0.5) * depth, toneAt(sh, 0.95) * depth];
}

/** Pick the run of grains for a word: tone fit, length fit, no repeats, natural phrase edges. */
function pickRun(spk, syl, rng, ctx) {
  const n = syl.length;
  const used = RECENT.get(spk.id) || new Map();
  let best = null, bestCost = Infinity;
  const regs = spk.regions;
  const tries = 70;
  for (let k = 0; k < tries; k++) {
    const reg = regs[Math.floor(rng() * regs.length)];
    const G = reg.grains.length;
    if (G < n) continue;
    const i0 = Math.floor(rng() * (G - n + 1));
    let cost = 0;
    for (let j = 0; j < n; j++) {
      const g = reg.grains[i0 + j];
      const t = syl[j];
      if (g.rms < spk.rmsMed - 16) cost += 6;
      if (g.vf < 0.35) cost += 7;
      else if (g.vf < 0.6) cost += 1.5;
      if (g.c && t.T) {
        const cm = (g.c[0] + g.c[1] + g.c[2]) / 3, tm = (t.T[0] + t.T[1] + t.T[2]) / 3;
        for (let q = 0; q < 3; q++) {
          const e = t.T[q] - tm - (g.c[q] - cm);
          cost += 0.5 * e * e;
        }
        const le = tm + t.lvl - cm;
        cost += 0.06 * le * le;
      }
      const dr = Math.log((g.len / spk.sr) / t.dur);
      cost += 3 * dr * dr;
      const u = used.get(g.id);
      if (u != null) cost += u >= ctx.lineStamp ? 40 : 10 * Math.exp(-(stamp - u) / 400);
    }
    // phrase edges: a grain that ended a stretch of speech in the recording ends a phrase naturally
    if (ctx.phraseEnd) cost += i0 + n === reg.grains.length ? -1.5 : 0.6;
    else if (i0 + n === reg.grains.length) cost += 0.4;
    if (ctx.phraseStart && i0 === 0) cost -= 0.8;
    cost += rng() * 0.3;
    if (cost < bestCost) {
      bestCost = cost;
      best = { reg, i0 };
    }
  }
  if (!best) {
    // a word longer than every region: take the longest region's start
    const reg = regs.reduce((a, b) => (b.grains.length > a.grains.length ? b : a));
    best = { reg, i0: 0, n: Math.min(n, reg.grains.length) };
  }
  best.n = best.n ?? n;
  for (let j = 0; j < best.n; j++) used.set(best.reg.grains[best.i0 + j].id, stamp);
  RECENT.set(spk.id, used);
  return best;
}

/**
 * Plan a line: runs of grains with their output positions, per-grain stretch and pitch moves, syllable marks and
 * breaths. Times in samples at spk.sr.
 */
function planLine(spk, phrases, preset, rng, opts) {
  const sr = spk.sr;
  const XF = Math.round(0.016 * sr);
  const rate = clamp(preset.rate * (opts.rate ?? 1), 0.45, 2.2);
  const ghost = clamp(opts.ghost ?? preset.ghost ?? 0);
  const toneDepth = (preset.whisper ? 0.55 : 1) * (1 - 0.45 * ghost) * 0.75;
  const edits = opts.edits || { pauses: [], repeats: [], drags: [], runons: [] };
  const pauseAt = new Map(edits.pauses.map((p) => [p.ci, p.dur]));
  const repeatAt = new Map(edits.repeats.map((p) => [p.ci, p.times]));
  const dragAt = new Set(edits.drags);
  const runon = new Set(edits.runons);
  const sing = preset.sing;
  const SCALE = [0, 2, 4, 7, 9, 12, 14];
  let singStep = 2;
  const items = [], marks = [], breaths = [];
  const lead = opts.lead ?? 0.04;
  if (lead > 0.2 && opts.leadBreath !== false && !ghost) breaths.push({ t: Math.max(0, lead - 0.36), dur: Math.min(0.42, lead), kind: 'in', gain: 1 });
  let t = Math.round(lead * sr);
  const speechStart = lead;
  let speechEnd = lead;
  const total = phrases.reduce((n, p) => n + p.sylls.length, 0) || 1;
  let gi = 0;
  stamp++;
  const lineStamp = stamp;
  for (let pi = 0; pi < phrases.length; pi++) {
    const ph = phrases[pi];
    const N = ph.sylls.length;
    const words = wordsOf(ph.sylls);
    let si = 0;
    let joined = false; // the next run crossfades into the previous one
    for (let wi = 0; wi < words.length; wi++) {
      const w = words[wi];
      const first = w[0];
      const wci = first.wordCi ?? first.ci;
      if (first.wordStart && pauseAt.has(wci) && si > 0) {
        t += Math.round((pauseAt.get(wci) / Math.max(0.6, rate)) * sr);
        joined = false;
      }
      // per-syllable targets
      const syl = w.map((sy, j) => {
        const k = si + j;
        const isLast = k === N - 1;
        const lineEnd = isLast && pi === phrases.length - 1;
        const lineProg = total > 1 ? (gi + j) / (total - 1) : 0;
        const phProg = N > 1 ? k / (N - 1) : 0;
        let lvl = 0.5 * (1.3 - lineProg * 2.8 + (0.7 - phProg * 1.6)) + (rng() - 0.5) * 0.4;
        if (sy.stress && rng() < 0.3) lvl += 0.8;
        if (ph.question && isLast) lvl += 1.6;
        let shape = null;
        if (lineEnd && ghost > 0.5 && opts.rng2 && opts.rng2() < 0.5) shape = TONE_SHAPES.R;
        const depth = toneDepth * (sy.stress ? 1 : sy.particle ? 0.9 : 0.6);
        let dur = (sy.stress || sy.particle ? 0.2 : 0.15) * (sy.long || /^(m|n|ng|w|y)$/.test(sy.coda || '') ? 1.15 : 0.9);
        let note = 0;
        if (sing) {
          const dir = sy.tone === 'H' || sy.tone === 'R' ? 1 : sy.tone === 'L' || sy.tone === 'F' ? -1 : rng() < 0.5 ? 1 : 0;
          singStep = clamp(singStep + dir, 0, SCALE.length - 1) | 0;
          if (isLast) singStep = rng() < 0.5 ? 0 : 2;
          note = SCALE[singStep] - 3;
          dur *= sy.long || sy.coda ? 2 : 1.5;
        }
        return { sy, T: toneTarget(sy, depth, shape), lvl, dur, isLast, lineEnd, note, drag: sy.wordEnd && dragAt.has(wci) };
      });
      const run = pickRun(spk, syl, rng, { lineStamp, phraseEnd: si + w.length === N, phraseStart: si === 0 });
      const segs = [];
      for (let j = 0; j < run.n; j++) {
        const g = run.reg.grains[run.i0 + j];
        const s = syl[Math.min(j, syl.length - 1)];
        const dg = g.len / sr;
        let tau = Math.pow(s.dur / dg, 0.4) * Math.pow(1 / rate, 0.85);
        if (s.isLast) tau *= 1.18;
        if (sing) tau *= Math.sqrt(s.dur / 0.2);
        tau = clamp(tau, 0.7, sing ? 2.6 : 1.7);
        if (s.drag) tau = Math.min(3, tau * 2.3);
        // pitch move toward the tone (semitones at u = 0, .5, 1); small: the grain's own contour leads
        const d = [0, 0, 0];
        if (g.c) {
          const cm = (g.c[0] + g.c[1] + g.c[2]) / 3, tm = (s.T[0] + s.T[1] + s.T[2]) / 3;
          const dl = clamp(0.55 * (tm + s.lvl - cm), -3, 3);
          for (let q = 0; q < 3; q++) d[q] = clamp(dl + clamp(0.6 * (s.T[q] - tm - (g.c[q] - cm)), -2.5, 2.5), -3.5, 3.5);
          if (sing) for (let q = 0; q < 3; q++) d[q] = clamp(s.note - g.c[q] * 0.7, -7, 7);
        } else d[0] = d[1] = d[2] = clamp(0.5 * s.lvl, -2, 2);
        if (s.drag) d[2] -= 1.5;
        segs.push({ a: g.a, len: g.len, tau, d, sing: !!sing });
      }
      // ghost stutter: the word's first syllable caught and cut, once or twice
      if (first.wordStart && repeatAt.has(wci)) {
        for (let r = 0; r < repeatAt.get(wci); r++) {
          const s0 = segs[0];
          const it = { reg: run.reg, segs: [{ ...s0, len: Math.round(s0.len * 0.45) }], pos: joined ? t - XF : t, fin: joined, fout: true };
          it.olen = outLen(it.segs);
          items.push(it);
          marks.push({ t: (it.pos + (joined ? XF : 0)) / sr, ci: first.ci, stress: false });
          t = it.pos + it.olen + Math.round((0.05 + rng() * 0.09 + ghost * 0.06) * sr);
          joined = false;
        }
      }
      const it = { reg: run.reg, segs, pos: joined ? t - XF : t, fin: joined, fout: true };
      it.olen = outLen(segs);
      items.push(it);
      // syllable onsets (subtitle / TTS sync, flutter on stressed syllables)
      let o = it.pos + (joined ? XF : 0);
      for (let j = 0; j < segs.length && j < w.length; j++) {
        marks.push({ t: o / sr, ci: w[j].ci, stress: !!w[j].stress });
        o += Math.round(segs[j].len * segs[j].tau);
      }
      for (let j = segs.length; j < w.length; j++) marks.push({ t: o / sr, ci: w[j].ci, stress: !!w[j].stress });
      t = it.pos + it.olen;
      joined = true;
      si += w.length;
      gi += w.length;
    }
    // phrase break
    let pause = (ph.pause ?? 0.2) / rate;
    if (preset.whisper) pause *= 1.15;
    if (runon.has(ph.breakCi)) pause = 0.025;
    pause *= 0.85 + rng() * 0.3;
    if (pi === phrases.length - 1) pause = Math.min(pause, 0.12);
    if (pause < 0.06 && pi < phrases.length - 1) {
      // run-on: keep the voice flowing into the next phrase
      speechEnd = t / sr;
      continue;
    }
    speechEnd = t / sr;
    if (pi < phrases.length - 1 && pause > 0.38 && !ghost && !preset.whisper && rng() < 0.6) {
      const bd = Math.min(0.42, pause * 0.7);
      breaths.push({ t: speechEnd + pause - bd - 0.04, dur: bd, kind: 'in', gain: 0.75 });
    }
    t += Math.round(pause * sr);
  }
  // mark the previous item's join: an item followed by a joined item fades out over XF, else a short tail
  return { items, marks, breaths, speechStart, speechEnd, end: t, XF };
}

function stretchesOf(items, sr) {
  const out = [];
  for (const it of items) {
    const a = it.pos / sr, b = (it.pos + it.olen) / sr;
    if (it.fin && out.length) out[out.length - 1][1] = b;
    else out.push([a, b]);
  }
  return out.map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]);
}

const outLen = (segs) => segs.reduce((n, s) => n + Math.round(s.len * s.tau), 0);

// ---------------------------------------------------------------------------------------------- synthesis
/**
 * TD-PSOLA render of one run. o: { R (pitch ratio), alpha (formant scale), trem: {rate, depth, ph} | null,
 * t0 (output sample of the run, for the tremor phase) }. Returns Float32Array of the run's output length.
 */
function renderRun(spk, it, o, rng) {
  const sr = spk.sr;
  const pcm = spk.pcm;
  const reg = it.reg;
  const base = reg.at;
  const RL = reg.len;
  const mk = reg.mk, mv = reg.mv, M = mk.length;
  const L = it.olen;
  const PAD = Math.ceil(sr / 50) + 4;
  const buf = new Float32Array(L + 2 * PAD);
  const alpha = o.alpha;
  const read = (p) => {
    // cubic Hermite read of the region (silence outside it)
    const i = Math.floor(p);
    const f = p - i;
    const at = (k) => (k >= 0 && k < RL ? pcm[base + k] : 0);
    const y0 = at(i - 1), y1 = at(i), y2 = at(i + 1), y3 = at(i + 2);
    return (y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0)))) / 32768;
  };
  const segs = it.segs;
  const offs = [];
  let acc = 0;
  for (const s of segs) {
    offs.push(acc);
    acc += Math.round(s.len * s.tau);
  }
  const UV = Math.round(sr * 0.005);
  const PMIN = sr / 600, PMAX = sr / 55;
  let k = 0;
  // first mark at or before the run's start
  while (k + 1 < M && mk[k + 1] <= segs[0].a) k++;
  let to = 0, si = 0;
  const trem = o.trem;
  while (to < L) {
    while (si < segs.length - 1 && to >= offs[si + 1]) si++;
    const sg = segs[si];
    const ts = sg.a + (to - offs[si]) / sg.tau;
    const u = clamp((ts - sg.a) / sg.len);
    while (k + 1 < M && mk[k + 1] <= ts) k++;
    const kk = k + 1 < M && mk[k + 1] - ts < ts - mk[k] ? k + 1 : k;
    const voiced = M > 0 && mv[kk] === 1 && !o.unvoiced;
    let P, r, center;
    if (voiced) {
      const nx = kk + 1 < M && mv[kk + 1] ? mk[kk + 1] - mk[kk] : kk > 0 && mv[kk - 1] ? mk[kk] - mk[kk - 1] : sr / spk.f0;
      P = clamp(nx, PMIN, PMAX);
      const d = u < 0.5 ? sg.d[0] + (sg.d[1] - sg.d[0]) * u * 2 : sg.d[1] + (sg.d[2] - sg.d[1]) * (u - 0.5) * 2;
      let semis = d;
      if (trem) semis += trem.depth * Math.sin(trem.ph + (2 * Math.PI * trem.rate * (o.t0 + to)) / sr);
      r = clamp(o.R * Math.pow(2, semis / 12), 0.3, 2.5);
      center = mk[kk];
    } else {
      P = UV;
      r = 1;
      center = ts + (sg.tau > 1.05 ? (rng() - 0.5) * UV * 0.8 : 0);
    }
    const hw = voiced ? P / alpha : UV;
    const step = voiced ? alpha : 1;
    const c0 = Math.round(to);
    const h = Math.ceil(hw);
    for (let j = -h; j <= h; j++) {
      const x = (j + hw) / (2 * hw);
      if (x <= 0 || x >= 1) continue;
      const wv = 0.5 - 0.5 * Math.cos(2 * Math.PI * x);
      const idx = c0 + j + PAD;
      if (idx >= 0 && idx < buf.length) buf[idx] += wv * read(center + j * step);
    }
    to += voiced ? P / r : UV;
  }
  return buf.subarray(PAD, PAD + L);
}

/** Render the planned line (one layer). o: { R, alpha, trem, unvoiced }. */
function renderPlan(spk, plan, n, o, seed) {
  const out = new Float32Array(n);
  const rng = rngFrom(seed);
  const XF = plan.XF;
  const items = plan.items;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const y = renderRun(spk, it, { ...o, t0: it.pos }, rng);
    const L = y.length;
    // equal-power crossfades where runs overlap, short fades at phrase edges (no clicks)
    const fin = it.fin ? XF : Math.round(spk.sr * 0.006);
    const nextJoined = items[i + 1]?.fin && items[i + 1].pos < it.pos + L;
    const fout = nextJoined ? XF : Math.round(spk.sr * 0.012);
    for (let j = 0; j < fin && j < L; j++) y[j] *= it.fin ? Math.sin((Math.PI / 2) * ((j + 0.5) / fin)) : (j + 0.5) / fin;
    for (let j = 0; j < fout && j < L; j++) y[L - 1 - j] *= nextJoined ? Math.sin((Math.PI / 2) * ((j + 0.5) / fout)) : (j + 0.5) / fout;
    mixInto(out, y, it.pos, 1);
  }
  return out;
}

/** Whisper: the render re-excited with noise through its own LPC envelope (real formants, no voicing). */
export function whisperize(x, sr, rng, order = 18) {
  const n = x.length;
  const hop = Math.round(sr * 0.005), win = hop * 4;
  const out = new Float32Array(n);
  const pre = new Float32Array(n);
  for (let i = 0; i < n; i++) pre[i] = x[i] - 0.92 * (i ? x[i - 1] : 0);
  const hann = new Float32Array(win);
  for (let i = 0; i < win; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / win);
  const R = new Float64Array(order + 1), a = new Float64Array(order + 1), tmp = new Float64Array(order + 1);
  const st = new Float64Array(order); // synthesis filter memory
  let prevG = 0;
  const coef = new Float64Array(order + 1);
  for (let s = 0; s < n; s += hop) {
    const c = s + (hop >> 1) - (win >> 1);
    for (let l = 0; l <= order; l++) {
      let e = 0;
      for (let i = l; i < win; i++) {
        const p = c + i, q = c + i - l;
        if (p < 0 || p >= n || q < 0) continue;
        e += pre[p] * hann[i] * pre[q] * hann[i - l];
      }
      R[l] = e * (l ? Math.exp(-0.5 * ((2 * Math.PI * 60 * l) / sr) ** 2) : 1.0001);
    }
    let g = 0;
    if (R[0] > 1e-10) {
      // Levinson-Durbin
      a.fill(0);
      a[0] = 1;
      let E = R[0];
      for (let i = 1; i <= order; i++) {
        let acc = R[i];
        for (let j = 1; j < i; j++) acc += a[j] * R[i - j];
        const kk = -acc / E;
        tmp.set(a);
        for (let j = 1; j < i; j++) a[j] = tmp[j] + kk * tmp[i - j];
        a[i] = kk;
        E *= 1 - kk * kk;
        if (E <= 1e-12) break;
      }
      coef.set(a);
      g = Math.sqrt(Math.max(0, E) / (win * 0.375));
    }
    for (let i = 0; i < hop && s + i < n; i++) {
      const gg = prevG + (g - prevG) * (i / hop);
      let y = (rng() * 2 - 1) * 1.732 * gg;
      for (let j = 1; j <= order; j++) y -= coef[j] * st[j - 1];
      for (let j = order - 1; j > 0; j--) st[j] = st[j - 1];
      st[0] = y;
      out[s + i] = y;
    }
    prevG = g;
  }
  // de-emphasis
  let z = 0;
  for (let i = 0; i < n; i++) {
    z = out[i] + 0.92 * z;
    out[i] = Number.isFinite(z) ? z : (z = 0);
  }
  return out;
}

function highpass(x, sr, f) {
  const w = (2 * Math.PI * f) / sr, al = Math.sin(w) / (2 * Math.SQRT1_2), cw = Math.cos(w), a0 = 1 + al;
  const b0 = (1 + cw) / 2 / a0, b1 = -(1 + cw) / a0, a1 = (-2 * cw) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; x[i] = v;
  }
  return x;
}
function lowpass(x, sr, f) {
  const w = (2 * Math.PI * f) / sr, al = Math.sin(w) / (2 * 0.6), cw = Math.cos(w), a0 = 1 + al;
  const b0 = (1 - cw) / 2 / a0, b1 = (1 - cw) / a0, a1 = (-2 * cw) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; x[i] = v;
  }
  return x;
}

/** Character -> pitch ratio, formant scale, tremor (stable per character). */
function voiceShape(spk, v, preset) {
  const id = rngFrom(hashStr(`${preset.gender}|${preset.age}|${v.pitch ?? 1}|${v.rate ?? 1}|gib`));
  const ref = PITCH_REF[spk.bank] ?? 1;
  let R = Math.pow((v.pitch ?? 1) / ref, 0.7) * (0.97 + id() * 0.06);
  let alpha = 0.975 + id() * 0.05;
  if (spk.bank === 'ch') {
    // a teenage speaker made a child: a little higher, a shorter vocal tract
    R *= preset.gender === 'm' ? 1.02 : 1.07;
    alpha *= preset.gender === 'm' ? 1.07 : 1.1;
  }
  if (preset.ghost > 0) {
    R *= 1 - preset.ghost * 0.15;
    alpha *= 1 - preset.ghost * 0.05;
  }
  if (preset.shout) R *= 1.15;
  const old = clamp(((preset.age ?? 40) - 58) / 25);
  const trem = old > 0 ? { rate: 4.8 + id() * 1.6, depth: 0.15 + old * 0.35 + preset.ghost * 0.1, ph: id() * 6.28 } : preset.ghost > 0.5 ? { rate: 6 + id(), depth: 0.12 * preset.ghost, ph: id() * 6.28 } : null;
  return { R: clamp(R, 0.55, 1.8), alpha: clamp(alpha, 0.85, 1.2), trem };
}

/** The main voice of a line (unlevelled) + plan; used by renderBankVoiceLine and the murmur hook. */
function renderMain(spk, th, preset, seed, sOpts) {
  let phrases = parseThai(th);
  if (!phrases.length) phrases = parseThai('อืม');
  let plan = planLine(spk, phrases, preset, rngFrom(seed), sOpts);
  const maxDur = sOpts.maxDur;
  if (maxDur && plan.speechEnd - plan.speechStart > maxDur) {
    sOpts = { ...sOpts, rate: (sOpts.rate ?? 1) * Math.min(1.8, (plan.speechEnd - plan.speechStart) / maxDur), rng2: rngFrom(seed ^ 0x9e3779b9) };
    plan = planLine(spk, phrases, preset, rngFrom(seed), sOpts);
  }
  return { plan, phrases };
}

const dB = (x) => Math.pow(10, x / 20);

/**
 * renderVoiceLine (speech.js) for a loaded bank: same arguments, same { channels, meta } result and layer levels.
 * Rendered at the bank's rate (24 kHz).
 */
export function renderBankVoiceLine(a, spk) {
  const sr = spk.sr;
  const v = a.voice || {};
  const tone = a.tone || '';
  const mode = a.mode || 'murmur';
  const th = a.th || '';
  const preset = voicePreset(v, tone);
  const ghost = preset.ghost;
  const seed = a.seed ?? hashStr(th + '|' + JSON.stringify(v) + '|' + tone);
  const rng2 = rngFrom(seed ^ 0x9e3779b9);
  const ghostly = (ghost > 0.25 || mode === 'shadow') && mode !== 'breath';
  if (ghost > 0) {
    preset.rate *= 1 - ghost * 0.12;
    preset.breath += ghost * 0.22;
  }
  const edits = a.edits || planGhostEdits(th, ghost, a.planSeed ?? 1);
  const lead = a.lead ?? (ghostly ? 0.55 + ghost * 0.9 : 0.36);
  const sOpts = { lead, edits, ghost, rate: a.rate, rng2, leadBreath: a.breath !== false, maxDur: a.maxDur ?? 4.5 + 1.1 + th.length * 0.065 };
  const { plan } = renderMain(spk, th, preset, seed, sOpts);
  const tailSec = ghostly ? 1.25 : 0.25;
  const n = Math.max(1, Math.ceil(plan.end + tailSec * sr));
  const shape = voiceShape(spk, v, preset);
  const at = Math.floor(plan.speechStart * sr);
  const channels = [];
  const layout = [];
  let ref = 0;
  let voiced = null;
  if (mode === 'murmur' || ghostly) voiced = renderPlan(spk, plan, n, shape, seed + 1);
  if (mode === 'murmur') {
    let main = voiced;
    if (preset.whisper) {
      // whispered speech: the same words re-excited with noise, a little air, no low end
      main = whisperize(voiced, sr, rngFrom(seed + 5));
      highpass(main, sr, 260);
    } else if (ghost > 0.3) {
      // a breathy, half-whispered ghost voice
      const wh = whisperize(voiced, sr, rngFrom(seed + 5));
      const gw = (loud50(voiced, sr) / Math.max(1e-9, loud50(wh, sr))) * 0.45 * ghost;
      main = new Float32Array(n);
      for (let i = 0; i < n; i++) main[i] = voiced[i] * (1 - 0.25 * ghost) + wh[i] * gw;
    } else main = Float32Array.from(voiced);
    if (shape.trem) {
      // old voices: the tremble is in the loudness too
      for (let i = 0; i < n; i++) main[i] *= 1 + 0.06 * Math.sin(shape.trem.ph + (2 * Math.PI * shape.trem.rate * i) / sr);
    }
    if (preset.shout) for (let i = 0; i < n; i++) main[i] = Math.tanh(main[i] * 3) / 3;
    if (ghost > 0.2) {
      const w = new Wander(rng2, 2.2);
      for (let i = 0; i < n; i += 64) {
        const m = 1 + w.next(64 / sr) * 0.22 * ghost;
        for (let k = 0; k < 64 && i + k < n; k++) main[i + k] *= m;
      }
    }
    const T = loud50(main, sr) * 2.8;
    for (let i = 0; i < n; i++) main[i] = Math.tanh(main[i] / T) * T;
    // same targets as the formant voice; living lines 1.8 dB lower: real voices carry less of their energy in the
    // highs the cabin / HRTF chain takes away, so through the chain they matched the old lines only this way
    const tgtL = (preset.whisper ? -23.5 : preset.shout ? -16.5 : -18.5) - (ghostly ? 0 : 1.8);
    const gain = Math.min(dB(tgtL - kLoud(main, sr)), 0.95 / Math.max(peakOf(main), 1e-9));
    for (let i = 0; i < n; i++) main[i] *= gain;
    ref = loud50(main, sr);
    fadeIn(main, sr, 0.005);
    fadeOut(main, sr, 0.05);
    channels.push(main);
    layout.push('main');
  } else ref = dB(-14);
  // ---- breath layer ----
  const breath = new Float32Array(n);
  const events = plan.breaths.slice();
  if (ghostly && mode !== 'breath') {
    const marks = plan.marks.filter((m) => m.stress);
    const nIn = 1 + (rng2() < 0.4 + ghost * 0.4 ? 1 : 0) + (ghost > 0.7 && rng2() < 0.5 ? 1 : 0);
    for (let k = 0; k < nIn && marks.length; k++) {
      const m = marks[Math.floor(rng2() * marks.length)];
      events.push({ t: m.t - 0.05 + rng2() * 0.1, dur: 0.35 + rng2() * 0.3, kind: 'in', gain: 1, rattle: ghost > 0.6 ? ghost : 0 });
    }
    events.push({ t: Math.max(0, plan.speechStart - 0.25 - rng2() * 0.2), dur: 0.45, kind: 'in', gain: 0.8, rattle: ghost > 0.75 ? ghost * 0.6 : 0 });
    events.push({ t: plan.speechEnd + 0.05 + rng2() * 0.25, dur: 0.6 + ghost * 0.5, kind: 'out', gain: 0.9 });
  }
  for (const e of events) {
    const b = breathEvent(sr, e.kind, e.dur, { ...preset, fs: preset.fs }, rngFrom(seed + 17 + Math.floor(e.t * 1000)), e.rattle || 0);
    const g = (e.gain ?? 1) / Math.max(1e-6, loud50(b, sr));
    mixInto(breath, b, Math.floor(e.t * sr), g);
  }
  if (events.length) {
    const rel = ghostly ? -14 + 6 * ghost : -21;
    const g = (ref * dB(rel)) / Math.max(1e-9, loud50(breath, sr));
    for (let i = 0; i < n; i++) breath[i] *= g;
    channels.push(breath);
    layout.push('breath');
  }
  // ---- ghost layers ----
  if (ghostly && mode !== 'breath') {
    const gh = Math.max(ghost, 0.5);
    // octave-down double: the same grains half the pitch, a longer throat
    const sub = renderPlan(spk, plan, n, { R: shape.R * 0.5, alpha: shape.alpha * 0.84, trem: null }, seed + 2);
    lowpass(sub, sr, 1400);
    let g = (ref * dB(-15 + 7 * gh)) / Math.max(1e-9, loud50(sub, sr));
    for (let i = 0; i < n; i++) sub[i] *= g;
    channels.push(sub);
    layout.push('sub');
    // whispered double (delayed and placed behind the listener by the rack)
    const wh = whisperize(voiced, sr, rngFrom(seed + 3));
    highpass(wh, sr, 300);
    g = (ref * dB(-13 + 6 * gh)) / Math.max(1e-9, loud50(wh, sr));
    for (let i = 0; i < n; i++) wh[i] *= g;
    channels.push(wh);
    layout.push('whisper');
    const sw = reverseSwell(wh, sr, at, lead, gh, rng2);
    if (sw) {
      g = (ref * dB(-7 + 3 * gh)) / Math.max(1e-9, loud50(sw, sr));
      for (let i = 0; i < n; i++) sw[i] *= g;
      channels.push(sw);
      layout.push('swell');
    }
  }
  for (const ch of channels) {
    for (let i = 0; i < n; i++) if (!Number.isFinite(ch[i])) ch[i] = 0;
    const p = peakOf(ch);
    if (p > 0.95) for (let i = 0; i < n; i++) ch[i] *= 0.95 / p;
  }
  return {
    channels,
    sr,
    meta: {
      layout,
      duration: n / sr,
      speechStart: plan.speechStart,
      speechEnd: plan.speechEnd,
      stress: plan.marks.filter((m) => m.stress).map((m) => +m.t.toFixed(3)),
      sylls: plan.marks.map((m) => [m.ci, +m.t.toFixed(3)]),
      breaths: events.map((e) => [+e.t.toFixed(3), e.kind]),
      ghost,
      edits,
      bank: spk.id,
      // QA: continuous speech stretches and crossfade joins (s)
      joins: plan.items.filter((it) => it.fin).map((it) => +(it.pos / sr).toFixed(4)),
      stretches: stretchesOf(plan.items, sr),
    },
  };
}

// radio DJ / whisper SFX (renderMurmur): a single gibberish layer when the speaker's bank is loaded here
setMurmurHook((sr, th, voice = {}, seed = null) => {
  const spk = BANKS.get(speakerFor(voice));
  if (!spk || !th) return null;
  const preset = voicePreset(voice);
  const s = seed ?? hashStr(th + JSON.stringify(voice));
  const { plan, phrases } = renderMain(spk, th, preset, s, { lead: 0.04, ghost: 0, leadBreath: false });
  const n = Math.ceil(plan.end + 0.1 * spk.sr);
  let out = renderPlan(spk, plan, n, voiceShape(spk, voice, preset), s + 1);
  if (preset.whisper) out = highpass(whisperize(out, spk.sr, rngFrom(s + 5)), spk.sr, 260);
  if (sr !== spk.sr) out = resample(out, spk.sr / sr);
  let pk = peakOf(out);
  if (pk > 1e-9) for (let i = 0; i < out.length; i++) out[i] *= 0.8 / pk;
  fadeIn(out, sr, 0.01);
  fadeOut(out, sr, 0.05);
  return { buffer: out, duration: out.length / sr, phrases };
});

export { BANKS };
