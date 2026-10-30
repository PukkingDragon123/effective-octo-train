// Generative score. music.setMood(mood, {fade}) crossfades between players:
//   silence · menu · dread · surreal · calm · nostalgic · dawn · ending · tension
// Each player schedules notes ahead of time (look-ahead) from cached instrument
// buffers rendered in the synth worker. Motifs are generated, remembered and
// varied (transpose / ornament / retrograde / truncate) so phrases feel composed
// but never loop. Thai colour: 7-tone equal tuning (pentatonic subsets), ranat
// rolls, khim tremolo, khong + temple bell, ching/chap time-keeping.
import { FATHER_SONG } from './Synth/songs.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const T7 = (step) => Math.pow(2, step / 7);
const ET = (semi) => Math.pow(2, semi / 12);
const PENT7 = [0, 1, 2, 4, 5]; // pentatonic subset of the Thai 7-tone scale
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (a, b) => a + Math.random() * (b - a);

export const MOODS = ['silence', 'menu', 'dread', 'surreal', 'calm', 'nostalgic', 'dawn', 'ending', 'tension'];

/** degree in pentatonic-of-7TET -> frequency */
function thaiF(base, deg) {
  const o = Math.floor(deg / 5);
  const i = ((deg % 5) + 5) % 5;
  return base * T7(PENT7[i] + 7 * o);
}

function genMotif(len, center = 5) {
  const m = [];
  let d = center + Math.floor(rand(-2, 3));
  const rhythms = [[1, 1, 2], [0.5, 0.5, 1], [1.5, 0.5, 1], [1, 0.5, 0.5], [2, 1, 1], [0.5, 1, 0.5]];
  const r = [];
  while (r.length < len) r.push(...pick(rhythms));
  for (let i = 0; i < len; i++) {
    const s = Math.random();
    d += s < 0.38 ? 1 : s < 0.76 ? -1 : s < 0.88 ? 2 : s < 0.97 ? -2 : 3 * (Math.random() < 0.5 ? 1 : -1);
    d = Math.max(center - 5, Math.min(center + 6, d));
    m.push({ deg: d, beats: r[i] });
  }
  m[m.length - 1].beats = pick([2, 3, 3, 4]);
  m[m.length - 1].roll = true;
  return m;
}

function vary(motif) {
  let m = motif.map((n) => ({ ...n }));
  const r = Math.random();
  if (r < 0.25) {
    const t = pick([-2, -1, 1, 2]);
    m.forEach((n) => (n.deg += t));
  } else if (r < 0.45) {
    const i = Math.floor(Math.random() * (m.length - 1));
    m[i].deg += pick([-1, 1]);
  } else if (r < 0.6) {
    const h = Math.floor(m.length / 2);
    const tail = m.slice(h).reverse().map((n, k) => ({ ...n, beats: m[h + k].beats }));
    m = m.slice(0, h).concat(tail);
  } else if (r < 0.72 && m.length > 4) {
    m = m.slice(0, m.length - 2);
  }
  m[m.length - 1].beats = Math.max(2, m[m.length - 1].beats);
  m[m.length - 1].roll = true;
  return m;
}

// ---------------------------------------------------------------------------
class Player {
  constructor(music, mood) {
    this.music = music;
    this.core = music.core;
    this.ctx = this.core.ctx;
    this.mood = mood;
    this.out = this.ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(music.input);
    this.nextT = 0;
    this.startT = 0;
    this.stopped = false;
    this.sources = new Set();
    this.timers = [];
  }
  start(t0, fade) {
    this.startT = t0;
    this.nextT = t0 + 0.3;
    this.out.gain.setValueAtTime(0, t0);
    this.out.gain.linearRampToValueAtTime(this.level ?? 1, t0 + fade);
  }
  stop(fade) {
    this.stopped = true;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + fade);
    this._killAt = t + fade + 0.1;
  }
  get elapsed() {
    return this.ctx.currentTime - this.startT;
  }
  /** Request (prefetch) an instrument buffer; returns AudioBuffer or null when not ready yet. */
  buf(inst, f, vel = 0.7, extra = null) {
    const vl = vel > 0.6 ? 0.85 : 0.45;
    const ek = extra ? JSON.stringify(extra) : '';
    const key = `inst:${inst}:${f.toFixed(2)}:${vl}:${ek}`;
    const b = this.core.task(key, 'inst', { inst, f, vel: vl, seed: Math.round(f * 7) % 9973, extra: extra || {} }, 1);
    return b instanceof Promise ? null : b;
  }
  /** Schedule a note. opts {vel, gain, pan, rate, extra, env:{a,r,dur}, send} */
  note(inst, f, when, o = {}) {
    if (this.stopped) return false;
    const b = this.buf(inst, f, o.vel ?? 0.7, o.extra || null);
    if (!b) return false;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = b;
    if (o.rate) src.playbackRate.value = o.rate;
    if (o.detune) src.detune.value = o.detune;
    const g = ctx.createGain();
    const vel = o.vel ?? 0.7;
    const lvl = (o.gain ?? 1) * (0.55 + vel * 0.5);
    if (o.env) {
      const { a = 0.01, r = 0.5, dur = b.duration } = o.env;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(lvl, when + a);
      g.gain.setValueAtTime(lvl, when + Math.max(a, dur - r));
      g.gain.linearRampToValueAtTime(0, when + dur);
      src.loop = !!o.loop;
      src.start(when);
      src.stop(when + dur + 0.05);
    } else {
      g.gain.value = lvl;
      src.start(when);
    }
    src.connect(g);
    let tail = g;
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      g.connect(p);
      tail = p;
    }
    tail.connect(this.out);
    if (o.send != null) {
      const s = ctx.createGain();
      s.gain.value = o.send;
      g.connect(s);
      s.connect(this.music.revIn);
      src.onended = () => {
        src.disconnect();
        g.disconnect();
        s.disconnect();
        this.sources.delete(src);
      };
    } else
      src.onended = () => {
        src.disconnect();
        g.disconnect();
        this.sources.delete(src);
      };
    this.sources.add(src);
    return true;
  }
  /** Ranat roll (kro): rapid repeated strikes. */
  roll(inst, f, when, dur, o = {}) {
    const step = o.step ?? 0.11;
    const n = Math.max(2, Math.floor(dur / step));
    for (let k = 0; k < n; k++) {
      const fall = 1 - (k / n) * 0.55;
      this.note(inst, f, when + k * step + (Math.random() - 0.5) * 0.008, { ...o, vel: (o.vel ?? 0.6) * fall * (k % 2 ? 0.85 : 1) });
    }
  }
  schedule(until) {
    let guard = 0;
    while (!this.stopped && this.nextT < until && guard++ < 64) this.step();
  }
  step() {
    this.nextT += 1;
  }
  prefetch() {}
  dispose() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch (e) {
        /* ignore */
      }
    }
    this.out.disconnect();
  }
}

// ---------------------------------------------------------------- menu
class MenuPlayer extends Player {
  init() {
    this.base = 293.7 * 0.5 * 2; // ~D4 (7-TET root)
    this.beat = 0.82;
    this.motif = genMotif(6);
    this.phrase = [];
    this.count = 0;
    this.nextBell = this.startT + rand(6, 14);
    this.level = 1;
    // drones (root + 7-TET "fifth")
    this.droneAt = this.startT;
  }
  prefetch() {
    for (let d = -2; d <= 12; d++) {
      this.buf('ranat', thaiF(this.base, d), 0.85);
      this.buf('ranat', thaiF(this.base, d), 0.45);
      this.buf('khim', thaiF(this.base / 2, d), 0.45);
    }
    this.buf('drone', this.base / 4, 0.45, { dur: 12 });
    this.buf('drone', (this.base / 4) * T7(4), 0.45, { dur: 12 });
    this.buf('templeBell', this.base / 2, 0.85);
  }
  step() {
    const t = this.nextT;
    // continuous drone bed, re-triggered with overlap
    if (t >= this.droneAt) {
      this.note('drone', this.base / 4, t, { vel: 0.45, gain: 0.32, extra: { dur: 12 }, env: { a: 4, r: 4, dur: 16 }, loop: true, send: 0.3 });
      this.note('drone', (this.base / 4) * T7(4), t + 2, { vel: 0.45, gain: 0.16, extra: { dur: 12 }, env: { a: 5, r: 5, dur: 15 }, loop: true, send: 0.3, pan: 0.3 });
      this.droneAt = t + 12;
    }
    if (t >= this.nextBell) {
      this.note('templeBell', this.base / 2, t, { vel: 0.85, gain: 0.22, send: 0.9, pan: -0.4 });
      this.nextBell = t + rand(26, 52);
    }
    if (!this.phrase.length) {
      this.count++;
      if (this.count % 4 === 0) this.motif = genMotif(5 + Math.floor(Math.random() * 4));
      this.phrase = vary(this.motif);
      // khim answers the phrase an octave below sometimes
      if (Math.random() < 0.45) this.answer = this.phrase.slice(-3).map((n) => ({ ...n }));
      this.nextT += this.beat * rand(3, 7);
      return;
    }
    const n = this.phrase.shift();
    const f = thaiF(this.base, n.deg);
    const dur = n.beats * this.beat;
    if (n.roll && dur > 1.2) this.roll('ranat', f, t, dur * 0.9, { vel: 0.55, gain: 0.5, send: 0.45, pan: -0.15 });
    else this.note('ranat', f, t, { vel: n.beats < 1 ? 0.45 : 0.85, gain: 0.55, send: 0.45, pan: -0.15 });
    if (Math.random() < 0.35) this.note('ranat', f / 2, t + 0.004, { vel: 0.45, gain: 0.3, send: 0.4, pan: -0.25 });
    if (!this.phrase.length && this.answer) {
      let at = t + dur + this.beat;
      for (const a of this.answer) {
        this.note('khim', thaiF(this.base / 2, a.deg), at, { vel: 0.45, gain: 0.42, send: 0.5, pan: 0.35 });
        at += a.beats * this.beat * 1.1;
      }
      this.answer = null;
    }
    this.nextT += dur;
  }
}

// ---------------------------------------------------------------- dread
class DreadPlayer extends Player {
  init() {
    this.level = 1;
    this.nextSub = this.startT + rand(1, 4);
    this.nextCluster = this.startT + rand(12, 24);
    this.nextGlass = this.startT + rand(20, 40);
    this.nextKlong = this.startT + rand(30, 60);
  }
  prefetch() {
    this.buf('drone', 36.7, 0.45, { dur: 10, saw: 0.1, noise: 0.35, beat: 0.6 });
    this.buf('drone', 41.2, 0.45, { dur: 10, saw: 0.1, noise: 0.35, beat: 0.45 });
    this.buf('strings', 98, 0.45, { freqs: [98, 103.8, 146.8, 155.6], dur: 14, attack: 5, release: 6, cut: 900 });
    this.buf('strings', 196, 0.45, { freqs: [1567, 1661, 2349], dur: 12, attack: 4, release: 6, cut: 5000 });
    this.buf('musicbox', 2093, 0.45);
    this.buf('klong', 62, 0.85);
  }
  step() {
    const t = this.nextT;
    const ev = [this.nextSub, this.nextCluster, this.nextGlass, this.nextKlong];
    const m = Math.min(...ev);
    if (m > t) {
      this.nextT = m;
      return;
    }
    if (t >= this.nextSub) {
      const f = pick([36.7, 41.2]);
      this.note('drone', f, t, { vel: 0.45, gain: 0.7, extra: { dur: 10, saw: 0.1, noise: 0.35, beat: f === 36.7 ? 0.6 : 0.45 }, env: { a: 6, r: 7, dur: 18 }, loop: true, send: 0.2 });
      this.nextSub = t + rand(22, 40);
    }
    if (t >= this.nextCluster) {
      this.note('strings', 98, t, { vel: 0.45, gain: 0.35, extra: { freqs: [98, 103.8, 146.8, 155.6], dur: 14, attack: 5, release: 6, cut: 900 }, send: 0.5, pan: rand(-0.5, 0.5) });
      this.nextCluster = t + rand(35, 70);
    }
    if (t >= this.nextGlass) {
      if (Math.random() < 0.5) this.note('strings', 196, t, { vel: 0.45, gain: 0.12, extra: { freqs: [1567, 1661, 2349], dur: 12, attack: 4, release: 6, cut: 5000 }, send: 0.7, pan: rand(-0.7, 0.7) });
      else this.note('musicbox', 2093, t, { vel: 0.45, gain: 0.12, rate: rand(0.45, 0.55), send: 0.9, pan: rand(-0.7, 0.7) });
      this.nextGlass = t + rand(45, 90);
    }
    if (t >= this.nextKlong) {
      this.note('klong', 62, t, { vel: 0.85, gain: 0.25, rate: 0.7, send: 0.8 });
      this.note('klong', 62, t + 0.42, { vel: 0.45, gain: 0.18, rate: 0.7, send: 0.8 });
      this.nextKlong = t + rand(60, 120);
    }
    this.nextT = t + 0.5;
  }
}

// ---------------------------------------------------------------- surreal
class SurrealPlayer extends Player {
  init() {
    this.base = 293.7 * 2;
    this.beat = 0.68;
    this.motif = genMotif(7, 5);
    this.phrase = [];
    this.count = 0;
    this.nextRev = this.startT + rand(3, 6);
    this.nextPad = this.startT;
    this.level = 0.9;
  }
  prefetch() {
    for (let d = 0; d <= 12; d++) this.buf('musicbox', thaiF(this.base, d), 0.45);
    for (let d = -3; d <= 4; d++) this.buf('ranatRev', thaiF(this.base / 4, d), 0.85);
    this.buf('pad', 146.8, 0.45, this._padExtra(0));
  }
  _padExtra(k) {
    const r = 146.8;
    const chords = [[0, 4, 7], [-2, 2, 5], [1, 4, 8], [-1, 3, 6]];
    return { freqs: chords[k % 4].map((s) => r * T7(s)), dur: 16, attack: 4, release: 6, cut: 650 };
  }
  step() {
    const t = this.nextT;
    if (t >= this.nextPad) {
      const k = Math.floor((t - this.startT) / 14);
      this.note('pad', 146.8, t, { vel: 0.45, gain: 0.35, extra: this._padExtra(k), send: 0.5, detune: -15 + Math.random() * 30 });
      this.buf('pad', 146.8, 0.45, this._padExtra(k + 1));
      this.nextPad = t + 14;
    }
    if (t >= this.nextRev) {
      const d = Math.floor(rand(-3, 5));
      this.note('ranatRev', thaiF(this.base / 4, d), t, { vel: 0.85, gain: 0.4, send: 0.6, pan: rand(-0.6, 0.6), rate: rand(0.7, 0.85) });
      this.nextRev = t + rand(7, 13);
    }
    if (!this.phrase.length) {
      this.count++;
      if (this.count % 3 === 0) this.motif = genMotif(6, 5);
      this.phrase = vary(this.motif);
      this.nextT += this.beat * rand(3, 8);
      return;
    }
    const n = this.phrase.shift();
    const f = thaiF(this.base, n.deg);
    // warped, slightly detuned music box (worn spring)
    const wob = 1 + Math.sin((t - this.startT) * 0.37) * 0.012 + rand(-0.008, 0.008);
    this.note('musicbox', f, t, { vel: 0.45, gain: 0.32, rate: wob * 0.995, send: 0.65, pan: 0.2 });
    if (Math.random() < 0.3) this.note('musicbox', f * T7(4) / 2, t + 0.02, { vel: 0.45, gain: 0.15, rate: wob, send: 0.6, pan: -0.2 });
    this.nextT += n.beats * this.beat * (1 + rand(-0.06, 0.1));
  }
}

// ---------------------------------------------------------------- 12-TET helpers
const D_MAJ_PENT = [0, 2, 4, 7, 9];
const etF = (root, deg, scale = D_MAJ_PENT) => {
  const o = Math.floor(deg / scale.length);
  const i = ((deg % scale.length) + scale.length) % scale.length;
  return root * ET(scale[i] + 12 * o);
};

// ---------------------------------------------------------------- calm
class CalmPlayer extends Player {
  init() {
    this.root = 293.66; // D4
    this.beat = 0.83;
    this.chords = [[0, 4, 7, 11, 14], [-3, 0, 4, 7, 11], [-5, -1, 2, 7, 9], [-3, 2, 4, 9, 12]]; // Dmaj9 Bm7 Gmaj7 A6sus-ish (semitones from D)
    this.ci = 0;
    this.nextChord = this.startT;
    this.motif = genMotif(5, 5);
    this.phrase = [];
    this.count = 0;
    this.level = 0.85;
  }
  _pad(k) {
    return { freqs: this.chords[k % 4].map((s) => (this.root / 2) * ET(s)), dur: 8.5, attack: 1.8, release: 2.8, cut: 1400 };
  }
  prefetch() {
    for (let k = 0; k < 4; k++) this.buf('pad', this.root / 2, 0.45, this._pad(k));
    for (let d = 0; d <= 10; d++) this.buf('ranatSoft', etF(this.root, d), 0.45);
    for (const s of [0, 2, 4, 7, 9, 11, 12, 14, 16]) this.buf('khim', (this.root / 2) * ET(s), 0.45);
    for (const s of [0, -3, -5, -7]) this.buf('bass', (this.root / 4) * ET(s), 0.45);
  }
  step() {
    const t = this.nextT;
    if (t >= this.nextChord) {
      const k = this.ci++;
      const ch = this.chords[k % 4];
      this.note('pad', this.root / 2, t, { vel: 0.45, gain: 0.32, extra: this._pad(k), send: 0.4 });
      this.note('bass', (this.root / 4) * ET(ch[0] > -4 ? ch[0] : ch[0] + 12), t, { vel: 0.45, gain: 0.3, send: 0.15 });
      if (k % 2 === 1) {
        // khim broken chord
        const arp = ch.slice(0, 4).map((s) => (this.root / 2) * ET(s + 12));
        arp.forEach((f, i) => this.note('khim', f, t + this.beat * (2 + i * 0.5), { vel: 0.45, gain: 0.25, send: 0.5, pan: 0.3 }));
      }
      this.nextChord = t + this.beat * 8;
    }
    if (!this.phrase.length) {
      this.count++;
      if (this.count % 3 === 0) this.motif = genMotif(5, 5);
      this.phrase = vary(this.motif).map((n) => ({ ...n, roll: false }));
      this.nextT = t + this.beat * Math.round(rand(3, 6));
      return;
    }
    const n = this.phrase.shift();
    const f = etF(this.root, n.deg);
    this.note('ranatSoft', f, t, { vel: 0.45, gain: 0.45, send: 0.45, pan: -0.2 });
    this.nextT = t + this.beat * Math.max(0.5, n.beats);
  }
}

// ---------------------------------------------------------------- nostalgic (luk thung flavour)
const A_MIN_PENT = [0, 3, 5, 7, 10];
class NostalgicPlayer extends Player {
  init() {
    this.root = 220;
    this.beat = 0.79;
    this.prog = [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7], [-7, -4, 0], [0, 3, 7], [-5, -1, 2], [0, 3, 7]];
    this.bar = 0;
    this.barT = this.startT + 0.3;
    this.phrase = [];
    this.motif = this._motif();
    this.level = 0.8;
  }
  _motif() {
    return genMotif(6, 6).map((n) => ({ ...n, roll: false }));
  }
  _pad(k) {
    return { freqs: this.prog[k % 8].map((s) => (this.root / 2) * ET(s)), dur: this.beat * 4 + 2, attack: 0.8, release: 2, cut: 1100 };
  }
  prefetch() {
    for (let k = 0; k < 8; k++) this.buf('pad', this.root / 2, 0.45, this._pad(k));
    for (let d = 2; d <= 14; d++) {
      this.buf('phin', etF(this.root, d, A_MIN_PENT), 0.85);
      this.buf('phin', etF(this.root, d, A_MIN_PENT), 0.45);
    }
    this.buf('ching', 1, 0.45);
    this.buf('chap', 1, 0.45);
    for (const ch of this.prog) this.buf('bass', (this.root / 4) * ET(ch[0] < -5 ? ch[0] + 12 : ch[0]), 0.45);
  }
  step() {
    const t = this.nextT;
    // bar-level events
    while (this.barT <= t + 0.001) {
      const bt = this.barT;
      const k = this.bar++;
      const ch = this.prog[k % 8];
      this.note('pad', this.root / 2, bt, { vel: 0.45, gain: 0.25, extra: this._pad(k), send: 0.35 });
      const r = (this.root / 4) * ET(ch[0] < -5 ? ch[0] + 12 : ch[0]);
      this.note('bass', r, bt, { vel: 0.45, gain: 0.32 });
      this.note('bass', r * ET(7), bt + this.beat * 2, { vel: 0.45, gain: 0.25 });
      for (let b = 0; b < 4; b++) this.note(b % 2 ? 'ching' : 'chap', 1, bt + b * this.beat, { vel: 0.45, gain: b % 2 ? 0.11 : 0.07, pan: 0.4, send: 0.2 });
      this.barT += this.beat * 4;
    }
    if (!this.phrase.length) {
      if (Math.random() < 0.35) this.motif = this._motif();
      this.phrase = vary(this.motif).map((n) => ({ ...n, roll: false }));
      this.nextT = t + this.beat * Math.round(rand(2, 5));
      return;
    }
    const n = this.phrase.shift();
    const f = etF(this.root, n.deg, A_MIN_PENT);
    // grace note (เอื้อน-like ornament) on longer notes
    if (n.beats >= 1 && Math.random() < 0.45) this.note('phin', etF(this.root, n.deg + 1, A_MIN_PENT), t - 0.07, { vel: 0.45, gain: 0.22, pan: -0.25, send: 0.3 });
    this.note('phin', f, t, { vel: 0.85, gain: 0.4, pan: -0.25, send: 0.3 });
    this.nextT = t + this.beat * Math.max(0.5, n.beats);
  }
}

// ---------------------------------------------------------------- dawn (the payoff)
class DawnPlayer extends Player {
  init() {
    this.root = 196; // G3
    this.beat = 0.91;
    // G  D/F#  Em  C  G/B  Am  D  D(sus)
    this.prog = [[0, 4, 7, 11], [-1, 2, 7, 9], [-3, 4, 7, 11], [-7, 4, 7, 12], [-1, 4, 7, 12], [-10, 4, 9, 12], [-5, 2, 6, 9], [-5, 2, 7, 9]];
    this.ci = 0;
    this.nextChord = this.startT + 0.2;
    this.mel = FATHER_SONG.melody;
    this.mi = 0;
    this.melT = this.startT + 30;
    this.level = 0.95;
  }
  _pad(k) {
    return { freqs: this.prog[k % 8].map((s) => this.root * ET(s)), dur: this.beat * 8 + 3, attack: 2.5, release: 3, cut: 1600 };
  }
  _str(k) {
    return { freqs: this.prog[k % 8].slice(1).map((s) => this.root * 2 * ET(s)), dur: this.beat * 8 + 3, attack: 3, release: 3, cut: 2600 };
  }
  prefetch() {
    for (let k = 0; k < 8; k++) {
      this.buf('pad', this.root, 0.45, this._pad(k));
      this.buf('strings', this.root * 2, 0.45, this._str(k));
    }
    for (let s = -5; s <= 26; s++) this.buf('khim', this.root * ET(s), 0.45);
    for (const n of this.mel) this.buf('ranatSoft', 392 * ET(n[0]), 0.85);
    this.buf('bell', 783.99, 0.45);
  }
  step() {
    const t = this.nextT;
    const I = clamp(this.elapsed / 100);
    if (t >= this.nextChord) {
      const k = this.ci++;
      const ch = this.prog[k % 8];
      this.note('pad', this.root, t, { vel: 0.45, gain: 0.3, extra: this._pad(k), send: 0.45 });
      if (this.elapsed > 8) this.note('strings', this.root * 2, t, { vel: 0.45, gain: 0.12 + 0.18 * I, extra: this._str(k), send: 0.5 });
      if (k % 4 === 0) this.note('bell', 783.99, t, { vel: 0.45, gain: 0.08 + 0.08 * I, send: 0.8, pan: 0.5 });
      if (this.elapsed > 14) {
        // khim arpeggio, rising, 8ths
        const notes = ch.map((s) => this.root * ET(s + 12)).concat(ch.map((s) => this.root * ET(s + 24)));
        const steps = 16;
        for (let i = 0; i < steps; i++) {
          const f = notes[[0, 1, 2, 3, 4, 3, 2, 1][i % 8] + (i >= 8 ? 1 : 0)] || notes[0];
          this.note('khim', f, t + i * this.beat * 0.5, { vel: 0.45, gain: (0.12 + 0.16 * I) * (i % 2 ? 0.8 : 1), pan: 0.35, send: 0.45 });
        }
      }
      this.nextChord = t + this.beat * 8;
    }
    if (t >= this.melT) {
      const [semi, beats] = this.mel[this.mi % this.mel.length];
      this.mi++;
      const f = 392 * ET(semi);
      if (beats >= 2) this.roll('ranatSoft', f, t, beats * this.beat * 0.85, { vel: 0.85, gain: 0.28, send: 0.5, pan: -0.25, step: 0.12 });
      else this.note('ranatSoft', f, t, { vel: 0.85, gain: 0.4, send: 0.5, pan: -0.25 });
      this.melT = t + beats * this.beat;
      if (this.mi % this.mel.length === 0) this.melT += this.beat * 8;
    }
    this.nextT = Math.min(this.nextChord, this.melT);
  }
}

// ---------------------------------------------------------------- ending (the father's song, gently)
class EndingPlayer extends Player {
  init() {
    this.root = 196;
    this.beat = 1.0;
    this.mel = FATHER_SONG.melody;
    this.chords = FATHER_SONG.chords;
    this.mi = 0;
    this.melT = this.startT + 2;
    this.bar = 0;
    this.barT = this.startT + 2;
    this.pass = 0;
    this.level = 0.9;
  }
  _pad(c) {
    return { freqs: c.map((s) => this.root * ET(s)), dur: this.beat * 4 + 2.5, attack: 1.5, release: 2.5, cut: 1400 };
  }
  prefetch() {
    for (const c of this.chords) this.buf('pad', this.root, 0.45, this._pad(c));
    for (const n of this.mel) {
      this.buf('ranatSoft', 392 * ET(n[0]), 0.85);
      this.buf('khim', 392 * ET(n[0]), 0.45);
    }
    this.buf('khong', 196, 0.45);
    this.buf('templeBell', 98, 0.85);
  }
  step() {
    const t = this.nextT;
    while (this.barT <= t + 0.001) {
      const c = this.chords[this.bar % this.chords.length];
      this.note('pad', this.root, this.barT, { vel: 0.45, gain: 0.3, extra: this._pad(c), send: 0.45 });
      if (this.bar % 8 === 0) this.note('khong', 196, this.barT, { vel: 0.45, gain: 0.25, send: 0.5, pan: -0.3 });
      this.bar++;
      this.barT += this.beat * 4;
    }
    if (t >= this.melT) {
      const [semi, beats] = this.mel[this.mi];
      const f = 392 * ET(semi);
      const inst = this.pass % 2 ? 'khim' : 'ranatSoft';
      if (beats >= 2 && inst === 'ranatSoft') this.roll(inst, f, t, beats * this.beat * 0.85, { vel: 0.85, gain: 0.26, send: 0.5, step: 0.12 });
      else this.note(inst, f, t, { vel: inst === 'khim' ? 0.45 : 0.85, gain: 0.42, send: 0.5 });
      this.melT = t + beats * this.beat;
      this.mi++;
      if (this.mi >= this.mel.length) {
        this.mi = 0;
        this.pass++;
        this.note('templeBell', 98, this.melT + this.beat * 2, { vel: 0.85, gain: 0.25, send: 0.9 });
        this.melT += this.beat * 16;
        this.barT = this.melT;
      }
    }
    this.nextT = Math.min(this.melT, this.barT);
  }
}

// ---------------------------------------------------------------- tension
class TensionPlayer extends Player {
  init() {
    this.beat = 60 / 92;
    this.bar = 0;
    this.barT = this.startT + 0.2;
    this.level = 1;
  }
  prefetch() {
    this.buf('klong', 62, 0.85);
    this.buf('klong', 62, 0.45);
    this.buf('tek', 1, 0.45);
    this.buf('bass', 41.2, 0.85);
    this.buf('bass', 43.65, 0.85);
    this.buf('strings', 196, 0.45, { freqs: [622, 659, 698, 932], dur: this.beat * 16, attack: this.beat * 12, release: 1.5, cut: 4000 });
  }
  step() {
    const t = this.barT;
    const k = this.bar++;
    const I = clamp(k / 24);
    const b = this.beat;
    this.note('klong', 62, t, { vel: 0.85, gain: 0.55, send: 0.3 });
    this.note('klong', 62, t + b * 0.42, { vel: 0.45, gain: 0.35, send: 0.3 });
    for (let i = 0; i < 4; i++) this.note('bass', i === 3 ? 43.65 : 41.2, t + i * b, { vel: 0.85, gain: 0.35 + 0.15 * I });
    if (I > 0.2) for (let i = 0; i < 8; i++) this.note('tek', 1, t + i * b * 0.5, { vel: 0.45, gain: (0.05 + 0.08 * I) * (i % 2 ? 0.6 : 1), pan: 0.5, send: 0.2 });
    if (k % 4 === 0) this.note('strings', 196, t, { vel: 0.45, gain: 0.12 + 0.2 * I, extra: { freqs: [622, 659, 698, 932], dur: b * 16, attack: b * 12, release: 1.5, cut: 4000 }, send: 0.4 });
    this.barT += b * 4;
    this.nextT = this.barT;
  }
}

const PLAYERS = { menu: MenuPlayer, dread: DreadPlayer, surreal: SurrealPlayer, calm: CalmPlayer, nostalgic: NostalgicPlayer, dawn: DawnPlayer, ending: EndingPlayer, tension: TensionPlayer };

// ---------------------------------------------------------------------------
export class Music {
  constructor(sys) {
    this.sys = sys;
    this.mood = 'silence';
    this.core = null;
    this.player = null;
    this.old = [];
    this.volume = 1;
  }
  _attachCore(core) {
    this.core = core;
    const ctx = core.ctx;
    this.input = ctx.createGain();
    this.revIn = ctx.createGain();
    this.rev = core.makeReverb('hall');
    this.revIn.connect(this.rev);
    const rg = ctx.createGain();
    rg.gain.value = 0.9;
    this.rev.connect(rg);
    rg.connect(core.buses.music.direct);
    this.input.connect(core.buses.music.direct);
    if (this.mood !== 'silence') {
      const m = this.mood;
      this.mood = 'silence';
      this.setMood(m, { fade: 2 });
    }
  }
  /** setMood(mood, {fade=3}) */
  setMood(mood, opts = {}) {
    if (!PLAYERS[mood] && mood !== 'silence') mood = 'silence';
    if (mood === this.mood && !opts.restart) return;
    this.mood = mood;
    if (!this.core) return;
    const fade = opts.fade ?? (mood === 'tension' ? 1 : 3.5);
    if (this.player) {
      this.player.stop(opts.fadeOut ?? fade);
      this.old.push(this.player);
      this.player = null;
    }
    if (mood === 'silence') return;
    const P = new PLAYERS[mood](this, mood);
    // give the worker a moment to render the first notes
    const t0 = this.core.ctx.currentTime + (opts.delay ?? (this.core.sync ? 0 : 0.6));
    P.startT = t0;
    P.init?.();
    P.prefetch();
    P.start(t0, fade);
    this.player = P;
  }
  update() {
    if (!this.core) return;
    const now = this.core.ctx.currentTime;
    if (this.player) this.player.schedule(now + 1.2);
    for (let i = this.old.length - 1; i >= 0; i--) {
      const p = this.old[i];
      if (now > p._killAt) {
        p.dispose();
        this.old.splice(i, 1);
      }
    }
  }
  /** Offline helper: schedule everything up to `t` (seconds of context time). */
  scheduleUntil(t) {
    this.player?.schedule(t);
  }
}
