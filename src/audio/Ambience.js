// Layered night-forest ambience driven by ambience.set({...}).
//
// Beds (looping, crossfaded by the state): night insects (sparse evening / midnight
// recordings, dense forest by forestDensity, close insects, a distant jungle layer),
// cicada choruses that swell & stop (two state machines), frogs near water, wind in
// leaves with gusts, rain on leaves (light <-> heavy) / on the taxi roof (moderate <->
// heavy) when inside, drips after rain, dawn chorus, low night air, dread drone, mains
// buzz near lights. Each bed slot prefers RECORDED loops from the sample manifest
// (amb_* keys, birds_dawn, drone_low, electric_buzz): decoded lazily when the slot first
// becomes audible, released after ~45 s of silence, rms-matched to the synth bed it
// replaces. A slot whose recordings are missing or fail falls back to its synthesized bed.
// Plus spatial random one-shots around the listener (tokay geckos, distant dogs and
// howls, owls, night birds, frogs, branch cracks, a far temple bell, a passing motorbike
// early in the night, koels and roosters at dawn, cicada bursts) — recorded when possible.
import { SOUNDS } from './Synth/registry.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const band = (h, a, b, c, d) => smooth(a, b, h) * (1 - smooth(c, d, h));
const xA = (x) => Math.sqrt(clamp(1 - x)); // equal-power crossfade pair
const xB = (x) => Math.sqrt(clamp(x));

// Bed slots. synth: bed kind ('sfx:<id>' = a registry loop) or null; path 'outside' (muffled in the
// car) | 'direct'; base gain; rec: recorded layers { key, idx, db (rms target), rate, w(state, hour) }.
const SLOTS = [
  { name: 'crickets', synth: 'crickets', path: 'outside', base: 0.5, rec: [
    { key: 'amb_forest_sparse', idx: 1, db: -20, w: (s, h) => xA(smooth(22.5, 24, h)) }, // Chiang Dao, evening
    { key: 'amb_forest_sparse', idx: 0, db: -20, w: (s, h) => xB(smooth(22.5, 24, h)) }, // Chiang Rai, midnight
  ] },
  { name: 'katydids', synth: 'katydids', path: 'outside', base: 0.3, rec: [
    { key: 'amb_forest_dense', idx: 0, db: -21, w: (s) => xA(smooth(1.05, 1.45, s.forestDensity) * 0.6) }, // Nan
    { key: 'amb_forest_dense', idx: 1, db: -21, w: (s) => xB(smooth(1.05, 1.45, s.forestDensity) * 0.6) }, // Borneo (deep jungle)
  ] },
  { name: 'cicadaA', synth: 'cicadas', path: 'outside', base: 0.42, rec: [{ key: 'amb_dusk_cicadas', idx: 0, db: -18 }] },
  { name: 'cicadaB', synth: 'cicadas', seed: 2, rate: 0.93, path: 'outside', base: 0.36, rec: [{ key: 'amb_dusk_cicadas', idx: 0, db: -18, rate: 0.93 }] },
  { name: 'frogs', synth: 'frogs', path: 'outside', base: 0.45, rec: [{ key: 'amb_frogs', idx: 0, db: -20 }] },
  { name: 'wind', synth: 'wind_leaves', path: 'outside', base: 0.5, rec: [{ key: 'amb_wind_trees', idx: 0, db: -17 }] },
  { name: 'rainLeaves', synth: 'rain_leaves', path: 'outside', base: 0.55, rec: [
    { key: 'amb_rain_light', idx: 0, db: -19, w: (s) => xA(smooth(0.3, 0.8, s.rain)) },
    { key: 'amb_rain_heavy', idx: 0, db: -15.5, w: (s) => xB(smooth(0.3, 0.8, s.rain)) },
  ] },
  { name: 'rainRoof', synth: 'rain_roof', path: 'direct', base: 0.5, rec: [
    { key: 'amb_rain_roof', idx: 0, db: -16, w: (s) => xA(smooth(0.35, 0.85, s.rain)) },
    { key: 'amb_rain_roof', idx: 1, db: -14.5, w: (s) => xB(smooth(0.35, 0.85, s.rain)) },
  ] },
  { name: 'drips', synth: 'drips', path: 'outside', base: 0.35 },
  { name: 'air', synth: 'night_tone', path: 'outside', base: 0.35, send: 0 },
  { name: 'distant', synth: null, path: 'outside', base: 0.45, rec: [{ key: 'amb_forest_distant', idx: 0, db: -22 }] },
  { name: 'close', synth: null, path: 'outside', base: 0.32, rec: [{ key: 'amb_insects_close', idx: 0, db: -21 }] },
  { name: 'dread', synth: 'dread_drone', path: 'direct', base: 0.55, send: 0, rec: [{ key: 'drone_low', idx: 0, db: -16 }] },
  { name: 'dawn', synth: 'sfx:birds_dawn', path: 'outside', base: 0.55, send: 0.25, rec: [{ key: 'birds_dawn', idx: 0, db: -22 }] },
  { name: 'lights', synth: 'sfx:electric_buzz', path: 'outside', base: 0.3, send: 0, rec: [{ key: 'electric_buzz', idx: 0, db: -22 }] },
];
const REC_IDLE_RELEASE = 45; // s of silence before a recorded bed is stopped and its buffer released

export class Ambience {
  constructor(sys) {
    this.sys = sys;
    this.state = {
      hour: 21, rain: 0, wind: 0.3, insideCar: false, windowsOpen: 0, nearWater: 0, nearLights: 0, forestDensity: 1, dread: 0,
      wetness: 0, enabled: true, autoMuffle: true,
    };
    this.core = null;
    this.beds = {};
    this.cicada = [
      { phase: 'idle', t: 4, g: 0 },
      { phase: 'idle', t: 11, g: 0 },
    ];
    this._gust = 0;
    this._gustT = 0;
    this._gustTarget = 0;
    this._lastRain = 0;
    this._loads = new Set();
    this.events = this._eventTable();
  }

  /** Merge state. hour accepts 21..30 (or 0..6 = next morning). */
  set(s = {}) {
    const st = this.state;
    for (const k in s) if (s[k] !== undefined && k !== '_apply') st[k] = s[k];
    if (st.hour < 12) st.hour += 24;
    if ('insideCar' in s || 'windowsOpen' in s) this._muffleTouched = true;
    if (this.core && st.autoMuffle && this._muffleTouched && ('insideCar' in s || 'windowsOpen' in s || s._apply)) {
      this.sys.setMuffle(st.insideCar ? clamp(1 - st.windowsOpen * 0.85) : 0);
    }
    if (this.core && 'rain' in s && st.rain > 0.15 && this._lastRain <= 0.15 && st.insideCar) {
      this.sys.play('rain_roof_start', { bus: 'ambience', muffle: false, volume: 0.6 });
    }
    if ('rain' in s) this._lastRain = st.rain;
  }

  _attachCore(core) {
    this.core = core;
    const ctx = core.ctx;
    this.bus = core.buses.ambience;
    for (const def of SLOTS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      const b = { ...def, def, g, input: g, mode: null, src: null, level: 0, recs: [] };
      g.connect(def.path === 'direct' ? this.bus.direct : this.bus.outside);
      // reverb send for the forest feel
      const send = def.send ?? (def.path === 'outside' ? 0.18 : 0);
      if (send > 0) {
        const s = ctx.createGain();
        s.gain.value = send;
        g.connect(s);
        s.connect(this.bus.sendOut);
      }
      this.beds[def.name] = b;
    }
    const bank = core.samples;
    if (bank && (bank.state === 'loading' || bank.state === 'ready')) {
      // wait (bounded) for the manifest, then choose recorded vs synthesized per slot
      Promise.race([bank.ready, new Promise((r) => setTimeout(r, 3000))]).then(() => this._decide());
    } else this._decide();
    this.set({ _apply: true });
  }

  /** Per slot: recorded layers if the manifest has them all, else the synth bed. */
  _decide() {
    if (!this.core) return;
    const bank = this.core.samples;
    for (const b of Object.values(this.beds)) {
      if (b.mode) continue;
      const recOk = bank?.usable && b.rec?.length && b.rec.every((r) => bank.entry(r.key) && r.idx < bank.entry(r.key).files.length);
      if (recOk) this._useRec(b);
      else this._useSynth(b);
    }
  }

  _filterFor(b, type) {
    if (b.name !== 'wind') return;
    const f = this.core.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = type === 'lowpass' ? 4000 : 1800;
    f.Q.value = type === 'lowpass' ? 0.3 : 0.4;
    f.connect(b.g);
    b.filter = f;
    b.input = f;
  }

  _useSynth(b) {
    b.mode = b.synth ? 'synth' : 'off';
    if (!b.synth) return;
    const core = this.core;
    const ctx = core.ctx;
    this._filterFor(b, 'bandpass');
    const r = b.synth.startsWith('sfx:') ? core.sfxBuffer(b.synth.slice(4), 0, true, 1) : core.task(`bed:${b.synth}:${b.seed || 1}`, 'bed', { kind: b.synth, seed: b.seed || 1 }, 1);
    const p = Promise.resolve(r).then((buf) => {
      if (!this.core || !buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = b.rate || 1;
      src.connect(b.input);
      src.start(ctx.currentTime, Math.random() * buf.duration);
      b.src = src;
    });
    this._track(p);
  }

  _useRec(b) {
    b.mode = 'rec';
    this._filterFor(b, 'lowpass');
    b.recs = b.rec.map((r) => {
      const g = this.core.ctx.createGain();
      g.gain.value = 0;
      g.connect(b.input);
      return { ...r, slot: b, g, state: 'idle', src: null, buf: null, norm: 1, quiet: 0, w: r.w || null, weight: 0 };
    });
  }

  _startRec(r) {
    const bank = this.core.samples;
    const e = bank.entry(r.key);
    if (!e) {
      r.state = 'failed';
      return;
    }
    r.state = 'loading';
    const p = Promise.resolve(bank.get({ e, idx: r.idx }, 1)).then((buf) => {
      if (!this.core) return;
      if (!buf) {
        r.state = 'failed';
        // every layer of the slot failed: fall back to its synthesized bed
        const b = r.slot;
        if (b.recs.every((x) => x.state === 'failed')) {
          b.mode = null;
          b.recs = [];
          b.input.disconnect?.();
          b.input = b.g;
          b.filter = null;
          this._useSynth(b);
        }
        return;
      }
      const ctx = this.core.ctx;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const ls = buf._loopStart || 0, le = buf._loopEnd || buf.duration;
      if (buf._loopEnd) {
        src.loopStart = ls;
        src.loopEnd = le;
      }
      src.playbackRate.value = r.rate || 1;
      src.connect(r.g);
      // two layers of one recording (cicadas) start far apart so they never phase
      const twin = r.slot.name === 'cicadaB' ? 0.5 : 0;
      src.start(ctx.currentTime, ls + ((Math.random() * 0.3 + twin) % 1) * (le - ls));
      bank.pin(buf._file);
      r.norm = bank.normGain(buf, r.db, 'rms', 2.5);
      r.buf = buf;
      r.src = src;
      r.state = 'on';
      r.quiet = 0;
    });
    this._track(p);
  }

  _stopRec(r) {
    const t = this.core.ctx.currentTime;
    r.g.gain.cancelScheduledValues(t);
    r.g.gain.setTargetAtTime(0, t, 0.3);
    try {
      r.src.stop(t + 1.5);
    } catch (e) {
      /* ignore */
    }
    const src = r.src;
    src.onended = () => src.disconnect();
    this.core.samples.unpin(r.buf._file);
    r.src = null;
    r.buf = null;
    r.state = 'idle';
  }

  _track(p) {
    this._loads.add(p);
    p.catch(() => {}).finally(() => this._loads.delete(p));
  }
  /** Resolves when every bed load in flight has finished (offline tests). */
  async whenLoaded() {
    for (let i = 0; i < 6 && this._loads.size; i++) await Promise.all([...this._loads]);
  }
  /** Which beds are recorded / synthesized right now (debug + reports). */
  layers() {
    return Object.values(this.beds).map((b) => ({
      slot: b.name, mode: b.mode, level: +b.level.toFixed(3),
      rec: b.recs.map((r) => ({ key: r.key, idx: r.idx, state: r.state, weight: +r.weight.toFixed(2) })),
    }));
  }

  _can(id) {
    return !!SOUNDS[id] || !!this.core?.samples?.covers(id, 'play');
  }

  _eventTable() {
    // rate: events per minute as a function of state s and hour h
    return [
      { id: 'gecko', rate: (s, h) => 0.75 * band(h, 20, 21, 28, 29.2) * (1 - s.dread * 0.6) * (1 - s.rain * 0.5), dist: [7, 28], y: [1.5, 6], vol: 0.9 },
      { id: 'dog_bark', rate: (s, h) => 0.9 * (1 - smooth(29, 30, h) * 0.6), dist: [70, 220], y: [0, 1], vol: 1.0, reverb: 0.55 },
      { id: 'dog_howl', rate: (s, h) => (0.08 + 0.3 * band(h, 22, 23, 26, 27.5)) * (1 + s.dread * 2), dist: [90, 260], y: [0, 1], vol: 0.8, reverb: 0.7 },
      { id: 'owl', rate: (s, h) => 0.45 * band(h, 21.5, 22.5, 28, 29), dist: [25, 80], y: [6, 16], vol: 0.8, reverb: 0.5 },
      { id: 'frog_croak', rate: (s) => (s.nearWater * 3 + s.wetness * 1.2) * (1 - s.dread * 0.7), dist: [5, 22], y: [0, 0.3], vol: 0.6 },
      { id: 'branch_crack', rate: (s) => (0.2 + s.dread * 0.7) * s.forestDensity, dist: [10, 45], y: [0, 6], vol: 0.6, reverb: 0.45 },
      { id: 'bell_temple', rate: (s, h) => 0.05 + 0.35 * band(h, 27.8, 28.2, 29.5, 30), dist: [280, 600], y: [5, 20], vol: 1.4, reverb: 0.9, equal: true },
      { id: 'motorbike_pass', rate: (s, h) => 0.12 * (1 - smooth(22.6, 23.2, h)) * (1 - s.dread), dist: [90, 200], y: [0, 1], vol: 1.0, reverb: 0.5, equal: true },
      { id: 'koel', rate: (s, h) => 1.4 * smooth(28.6, 29.2, h), dist: [40, 120], y: [8, 20], vol: 0.9, reverb: 0.45 },
      { id: 'rooster', rate: (s, h) => 0.9 * smooth(29.4, 29.7, h), dist: [90, 260], y: [0, 2], vol: 1.1, reverb: 0.4, equal: true },
      { id: 'cicada_burst', rate: (s, h) => (0.35 * band(h, 20, 21, 22.5, 23.5) + 0.5 * band(h, 28.8, 29.3, 30, 31)) * (1 - s.rain) * (1 - s.dread), dist: [12, 40], y: [4, 14], vol: 0.6 },
      // recorded-only events (silently skipped when the manifest lacks them)
      { id: 'dog_bark_far', rate: (s, h) => 0.55 * (1 - smooth(29, 30, h) * 0.6) * (1 - s.rain * 0.4), dist: [25, 60], y: [0, 2], vol: 0.9, reverb: 0.3, equal: true },
      { id: 'night_bird', rate: (s, h) => 0.16 * band(h, 22, 23, 28, 29) * (1 - s.dread * 0.8) * (1 - s.rain * 0.7), dist: [20, 60], y: [5, 15], vol: 0.7, reverb: 0.45 },
      { id: 'elephant_rumble', rate: (s, h) => 0.04 * band(h, 27.5, 28, 29, 29.5), dist: [120, 300], y: [0, 2], vol: 1.2, reverb: 0.4, equal: true },
    ];
  }

  _oneShot(e) {
    const sp = this.core.spatial;
    const a = Math.random() * Math.PI * 2;
    const d = e.dist[0] + Math.random() * (e.dist[1] - e.dist[0]);
    const pos = { x: sp.lx + Math.cos(a) * d, y: sp.ly + e.y[0] + Math.random() * (e.y[1] - e.y[0]), z: sp.lz + Math.sin(a) * d };
    // compensate inverse rolloff for far, loud sources (they are loud animals/bells)
    this.sys.play(e.id, { position: pos, bus: 'ambience', volume: e.vol, reverb: e.reverb, hrtf: e.equal ? false : undefined });
  }

  _cicadaStep(c, dt, h, s) {
    c.t -= dt;
    const active = 0.25 + 0.75 * band(h, 20, 20.5, 22.5, 23.5) + 0.7 * band(h, 28.5, 29.2, 30, 31);
    if (c.t <= 0) {
      if (c.phase === 'idle') {
        if (Math.random() < active) {
          c.phase = 'swell';
          c.t = 4 + Math.random() * 8;
        } else c.t = 5 + Math.random() * 15;
      } else if (c.phase === 'swell') {
        c.phase = 'sustain';
        c.t = 6 + Math.random() * 18;
      } else if (c.phase === 'sustain') {
        c.phase = 'stop';
        c.t = 0.4 + Math.random() * 1.2;
      } else {
        c.phase = 'idle';
        c.t = 8 + Math.random() * 30;
      }
      c.dur = c.t;
    }
    const target = c.phase === 'idle' ? 0 : c.phase === 'stop' ? 0 : c.phase === 'swell' ? 1 - c.t / (c.dur || 1) : 1;
    const speed = c.phase === 'stop' ? 4 : c.phase === 'swell' ? 1.5 : 1;
    c.g += (target - c.g) * (1 - Math.exp(-dt * speed));
    return c.g;
  }

  update(dt) {
    if (!this.core) return;
    // control-rate: ~10 Hz is plenty for beds and event rolls (fewer AudioParam events)
    this._acc = (this._acc || 0) + Math.max(0, dt);
    if (this._acc < 0.1) return;
    dt = Math.min(0.25, this._acc);
    this._acc = 0;
    const s = this.state;
    const h = s.hour;
    const now = this.core.ctx.currentTime;
    // wetness: soaks during rain, dries over minutes
    if (s.rain > 0.05) s.wetness = clamp(s.wetness + dt * s.rain * 0.03);
    else s.wetness = clamp(s.wetness - dt / 400);
    const on = s.enabled ? 1 : 0;
    const quiet = 1 - s.dread * 0.92; // the forest falls silent when something is near
    const night = band(h, 19, 20.5, 28.6, 29.8);
    const dawn = smooth(28.5, 29.4, h);
    const rainHush = 1 - s.rain * 0.55;
    const dens = 0.6 + 0.4 * clamp(s.forestDensity, 0, 1.5);
    // gusts
    this._gustT -= dt;
    if (this._gustT <= 0) {
      this._gustTarget = Math.random() < 0.35 ? 0.6 + Math.random() * 0.4 : Math.random() * 0.3;
      this._gustT = 2 + Math.random() * 6;
    }
    this._gust += (this._gustTarget - this._gust) * (1 - Math.exp(-dt * 0.8));
    const windLvl = clamp(s.wind * (0.45 + 0.75 * this._gust) + s.rain * 0.2);
    const c1 = this._cicadaStep(this.cicada[0], dt, h, s);
    const c2 = this._cicadaStep(this.cicada[1], dt, h, s);
    const fd = clamp(s.forestDensity, 0, 1.5);
    const rec = (k) => this.beds[k]?.mode === 'rec';
    const targets = {
      // recorded insect layers: dense jungle grows with forestDensity, the sparse bed thins a little
      crickets: night * quiet * rainHush * dens * (1 - dawn * 0.8) * (rec('crickets') ? 1 - 0.35 * smooth(0.6, 1.3, fd) : 1),
      katydids: night * quiet * rainHush * dens * 0.9 * (rec('katydids') ? 0.35 + 0.85 * smooth(0.25, 1.2, fd) : 1),
      cicadaA: c1 * quiet * (1 - s.rain * 0.8) * dens,
      cicadaB: c2 * quiet * (1 - s.rain * 0.8) * dens,
      frogs: clamp(s.nearWater * 0.8 + s.wetness * 0.6 + s.rain * 0.3) * night * (1 - s.dread * 0.7),
      wind: windLvl,
      rainLeaves: rec('rainLeaves') ? Math.pow(s.rain, 0.8) : s.rain,
      rainRoof: s.insideCar ? Math.pow(s.rain, 0.8) : 0,
      drips: s.wetness * (1 - s.rain) * 0.9,
      air: (0.6 + s.dread * 0.3) * (rec('distant') ? 0.6 : 1),
      distant: night * (1 - s.dread * 0.85) * (1 - s.rain * 0.5) * (1 - dawn * 0.6),
      // close insects: standing on the roadside or with the window down
      close: night * quiet * rainHush * dens * (1 - dawn * 0.8) * (s.insideCar ? clamp(s.windowsOpen) : 1),
      dread: Math.pow(s.dread, 1.3),
      dawn: dawn * (1 - s.dread) * (1 - s.rain * 0.6),
      lights: clamp(s.nearLights),
    };
    for (const k in targets) {
      const b = this.beds[k];
      if (!b) continue;
      const lvl = targets[k] * b.base * on;
      b.g.gain.setTargetAtTime(lvl, now, k === 'cicadaA' || k === 'cicadaB' ? 0.15 : 0.6);
      b.level = lvl;
      if (b.mode === 'rec') this._updateRec(b, lvl, s, h, now, dt);
    }
    const w = this.beds.wind;
    if (w?.filter) {
      if (w.mode === 'rec') w.filter.frequency.setTargetAtTime(1800 + this._gust * 6500 + s.wind * 2500, now, 0.5);
      else w.filter.frequency.setTargetAtTime(900 + this._gust * 2400 + s.wind * 600, now, 0.5);
    }
    if (w?.src && w.mode === 'synth') w.src.playbackRate.setTargetAtTime(0.85 + this._gust * 0.35, now, 0.6);
    // spatial one-shots
    if (on) {
      for (const e of this.events) {
        if (!this._can(e.id)) continue;
        const r = e.rate(s, h);
        if (r > 0 && Math.random() < (r / 60) * dt) this._oneShot(e);
      }
    }
  }

  _updateRec(b, lvl, s, h, now, dt) {
    for (const r of b.recs) {
      const w = r.w ? r.w(s, h) : 1;
      r.weight = w;
      const eff = lvl * w;
      if (r.state === 'idle' && eff > 0.0008) this._startRec(r);
      if (r.state !== 'on') continue;
      r.g.gain.setTargetAtTime(w * r.norm, now, 0.8);
      if (eff < 1e-4) {
        r.quiet += dt;
        if (r.quiet > REC_IDLE_RELEASE) this._stopRec(r);
      } else r.quiet = 0;
    }
  }

  /** Background-load all ambience assets (beds already requested; warm one-shots). */
  warm() {
    if (!this.core) return Promise.resolve();
    return this.core.warm(this.events.map((e) => e.id), { variants: 2 });
  }
}
