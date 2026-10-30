// Layered night-forest ambience driven by ambience.set({...}):
//   beds (looping stereo): crickets, katydids, cicada choruses (swell & stop state
//   machines), frogs near water, wind in leaves with gusts, rain on leaves / on the
//   taxi roof, drips after rain, dawn chorus, low night air, dread drone, mains buzz
//   + spatial random one-shots around the listener (tokay geckos, distant dogs and
//   howls, owls, frogs, branch cracks, a far temple bell, a passing motorbike early
//   in the night, koels and roosters at dawn, cicada bursts).
import { SOUNDS } from './Synth/registry.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const band = (h, a, b, c, d) => smooth(a, b, h) * (1 - smooth(c, d, h));

const BEDS = [
  // name, bed kind, path ('outside'|'direct'), base gain
  ['crickets', 'crickets', 'outside', 0.5],
  ['katydids', 'katydids', 'outside', 0.3],
  ['cicadaA', 'cicadas', 'outside', 0.42],
  ['cicadaB', 'cicadas', 'outside', 0.36],
  ['frogs', 'frogs', 'outside', 0.45],
  ['wind', 'wind_leaves', 'outside', 0.5],
  ['rainLeaves', 'rain_leaves', 'outside', 0.55],
  ['rainRoof', 'rain_roof', 'direct', 0.5],
  ['drips', 'drips', 'outside', 0.35],
  ['air', 'night_tone', 'outside', 0.35],
  ['dread', 'dread_drone', 'direct', 0.55],
];

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
    this.events = this._eventTable();
  }

  /** Merge state. hour accepts 21..30 (or 0..6 = next morning). */
  set(s = {}) {
    const st = this.state;
    for (const k in s) if (s[k] !== undefined) st[k] = s[k];
    if (st.hour < 12) st.hour += 24;
    if (this.core && st.autoMuffle && ('insideCar' in s || 'windowsOpen' in s)) {
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
    for (const [name, kind, path, gain] of BEDS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      const b = { name, kind, path, base: gain, g, src: null, level: 0 };
      if (name === 'wind') {
        b.filter = ctx.createBiquadFilter();
        b.filter.type = 'bandpass';
        b.filter.frequency.value = 1800;
        b.filter.Q.value = 0.4;
        b.filter.connect(g);
      }
      g.connect(path === 'direct' ? this.bus.direct : this.bus.outside);
      // reverb send for the forest feel
      if (path === 'outside' && name !== 'air') {
        const s = ctx.createGain();
        s.gain.value = 0.18;
        g.connect(s);
        s.connect(this.bus.sendOut);
      }
      this.beds[name] = b;
      const seed = name === 'cicadaB' ? 2 : 1;
      const r = core.task(`bed:${kind}:${seed}`, 'bed', { kind, seed }, 1);
      Promise.resolve(r).then((buf) => {
        if (!this.core) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = name === 'cicadaB' ? 0.93 : 1;
        src.connect(b.filter || g);
        src.start(ctx.currentTime, Math.random() * buf.duration);
        b.src = src;
      });
    }
    // dawn chorus bed (stereo loop from the sfx registry)
    const dg = ctx.createGain();
    dg.gain.value = 0;
    dg.connect(this.bus.outside);
    const ds = ctx.createGain();
    ds.gain.value = 0.25;
    dg.connect(ds);
    ds.connect(this.bus.sendOut);
    this.beds.dawn = { name: 'dawn', g: dg, base: 0.55, level: 0 };
    Promise.resolve(core.sfxBuffer('birds_dawn', 0, true, 1)).then((buf) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(dg);
      src.start(ctx.currentTime, Math.random() * buf.duration);
    });
    // mains buzz near lights / poles
    const eg = ctx.createGain();
    eg.gain.value = 0;
    eg.connect(this.bus.outside);
    this.beds.lights = { name: 'lights', g: eg, base: 0.3, level: 0 };
    Promise.resolve(core.sfxBuffer('electric_buzz', 0, true, 1)).then((buf) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(eg);
      src.start();
    });
    this.set({});
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
    dt = Math.min(0.25, Math.max(0, dt));
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
    const targets = {
      crickets: night * quiet * rainHush * dens * (1 - dawn * 0.8),
      katydids: night * quiet * rainHush * dens * 0.9,
      cicadaA: c1 * quiet * (1 - s.rain * 0.8) * dens,
      cicadaB: c2 * quiet * (1 - s.rain * 0.8) * dens,
      frogs: clamp(s.nearWater * 0.8 + s.wetness * 0.6 + s.rain * 0.3) * night * (1 - s.dread * 0.7),
      wind: windLvl,
      rainLeaves: s.rain,
      rainRoof: s.insideCar ? Math.pow(s.rain, 0.8) : 0,
      drips: s.wetness * (1 - s.rain) * 0.9,
      air: 0.6 + s.dread * 0.3,
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
    }
    const w = this.beds.wind;
    if (w?.filter) w.filter.frequency.setTargetAtTime(900 + this._gust * 2400 + s.wind * 600, now, 0.5);
    if (w?.src) w.src.playbackRate.setTargetAtTime(0.85 + this._gust * 0.35, now, 0.6);
    // spatial one-shots
    if (on) {
      for (const e of this.events) {
        if (!SOUNDS[e.id]) continue;
        const r = e.rate(s, h);
        if (r > 0 && Math.random() < (r / 60) * dt) this._oneShot(e);
      }
    }
  }

  /** Background-load all ambience assets (beds already requested; warm one-shots). */
  warm() {
    if (!this.core) return Promise.resolve();
    return this.core.warm(this.events.map((e) => e.id), { variants: 2 });
  }
}
