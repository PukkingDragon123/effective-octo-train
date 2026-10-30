// Diegetic dashboard radio. Stations stream original programmes rendered in
// chunks by the synth worker, through a small-speaker EQ + drive, mixed with
// tuning static, positioned at the dashboard (attach(object3D)).
//   1  luk thung        2  old string-era ballads
//   3  only exists at 03:00–04:00: the father's favourite song (memory m_song); otherwise static + whispers
//   4  dhamma talk
// radio.setOn(b) · next() · setStation(n) · setStatic(0..1 ghost interference) · setVolume(v) · attach(obj) · setHour(h)
// Emits bus 'audio:radio' {on, station, song, title, memory?}.
import { bus } from '../core/Events.js';
import { programItem } from './Synth/songs.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const STATION_NAMES = {
  1: { th: 'ลูกทุ่งยามดึก', en: 'Late-Night Luk Thung', freq: 'FM 91.5' },
  2: { th: 'เพลงเก่าเล่าความหลัง', en: 'Old Songs, Old Stories', freq: 'FM 97.25' },
  3: { th: '…', en: '…', freq: 'FM 103.3' },
  4: { th: 'ธรรมะยามดึก', en: 'Late-Night Dhamma', freq: 'AM 1080' },
};

export class Radio {
  constructor(sys) {
    this.sys = sys;
    this.on = false;
    this.station = 0;
    this.volume = 1;
    this.ghost = 0;
    this.hour = 21;
    this.object = null;
    this.core = null;
    this.song = null;
    this.title = null;
    this._tuning = 0;
    this._items = { 1: 0, 2: 0, 3: 0, 4: 0 };
    this._prog = null;
    this._srcs = new Set();
    this._whisperT = 3;
    bus.on('game:hour', (e) => this.setHour(e?.hour ?? e));
  }

  get fatherHour() {
    const h = this.hour >= 24 ? this.hour - 24 : this.hour;
    return h >= 3 && h < 4;
  }

  // ---- public API ----
  attach(obj) {
    this.object = obj;
    if (this.src) {
      this.src.voice.opts.object = obj;
      this.src.tracked = true;
    }
  }
  setVolume(v) {
    this.volume = clamp(v, 0, 2);
  }
  setStatic(v) {
    this.ghost = clamp(v);
  }
  setHour(h) {
    if (!(h >= 0)) return;
    const was = this.fatherHour;
    this.hour = h;
    if (was !== this.fatherHour && this.on && this.station === 3) this._startStation(3, 0.2);
  }
  setOn(on) {
    on = !!on;
    if (on === this.on) return;
    this.on = on;
    if (this.core) {
      this.sys.play('radio_click', { object: this.object, muffle: false, volume: 0.8 });
      if (on) {
        if (!this.station) this.station = 1;
        this._startStation(this.station, 0.25);
      } else this._stopProgram(0.06);
    } else if (on && !this.station) this.station = 1;
    this._emit();
  }
  /** Tune to the next station (with a static sweep). */
  next() {
    const n = (this.station % 4) + 1;
    this.setStation(n, { sweep: true });
  }
  setStation(n, opts = {}) {
    n = Math.max(0, Math.min(4, n | 0));
    if (n === this.station && !opts.force) return;
    this.station = n;
    if (this.core && this.on) {
      this._stopProgram(0.05);
      if (opts.sweep !== false) {
        this.sys.play('radio_tune', { object: this.object, muffle: false, volume: 0.7 });
        this._tuning = 0.85;
      }
      if (n) this._startStation(n, opts.sweep !== false ? 0.85 : 0.1);
    }
    this._emit();
  }

  // ---- internals ----
  _emit() {
    const memory = this.on && this.station === 3 && this.song === 'father_song' ? 'm_song' : undefined;
    bus.emit('audio:radio', { on: this.on, station: this.station, song: this.on ? this.song : null, title: this.on ? this.title : null, memory });
  }

  _attachCore(core) {
    this.core = core;
    const ctx = core.ctx;
    this.input = ctx.createGain(); // programme
    this.progGain = ctx.createGain();
    this.progGain.gain.value = 0;
    this.input.connect(this.progGain);
    this.staticGain = ctx.createGain();
    this.staticGain.gain.value = 0;
    this.fxIn = ctx.createGain(); // whispers etc.
    // small speaker chain
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 210;
    hp.Q.value = 0.8;
    const pk = ctx.createBiquadFilter();
    pk.type = 'peaking';
    pk.frequency.value = 1500;
    pk.Q.value = 0.8;
    pk.gain.value = 4;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4300;
    lp.Q.value = 0.9;
    const shaper = ctx.createWaveShaper();
    const c = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      const x = (i / 511) * 2 - 1;
      c[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
    }
    shaper.curve = c;
    this.speaker = ctx.createGain();
    this.speaker.gain.value = 0;
    this.progGain.connect(hp);
    this.staticGain.connect(hp);
    this.fxIn.connect(hp);
    hp.connect(pk);
    pk.connect(lp);
    lp.connect(shaper);
    shaper.connect(this.speaker);
    this.lp = lp;
    const pseudo = { opts: { object: this.object }, def: { ref: 1.2, rolloff: 1 }, send: null };
    this.src = core.spatial.createSource(pseudo, { object: this.object, track: true });
    this.speaker.connect(this.src.input);
    this.src.output.connect(core.buses.radio.direct);
    const send = ctx.createGain();
    send.gain.value = 0.25;
    this.speaker.connect(send);
    send.connect(core.buses.radio.sendCab);
    // static bed
    Promise.resolve(core.task('bed:static:1', 'bed', { kind: 'static', seed: 1 }, 1)).then((buf) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.connect(this.staticGain);
      s.start();
    });
    if (this.on) this._startStation(this.station || 1, 0.3);
  }

  _stopProgram(fade = 0.05) {
    const t = this.core.ctx.currentTime;
    for (const s of this._srcs) {
      try {
        s.g.gain.setTargetAtTime(0, t, fade / 3);
        s.src.stop(t + fade + 0.05);
      } catch (e) {
        /* ignore */
      }
    }
    this._srcs.clear();
    this._prog = null;
  }

  _startStation(n, delay = 0.2) {
    this._stopProgram(0.05);
    const now = this.core.ctx.currentTime;
    if (n === 3 && !this.fatherHour) {
      this._prog = null;
      this.song = 'static';
      this.title = null;
      this._emit();
      return;
    }
    // join a programme "in progress": random item / chunk
    const item = n === 3 ? 0 : this._items[n]++;
    const plan = programItem(n, item);
    const ci = plan.chunks.length > 2 && plan.kind !== 'dj' ? Math.floor(Math.random() * Math.min(3, plan.chunks.length - 1)) : 0;
    this._prog = { station: n, item, plan, ci, nextAt: now + delay, requested: null, gen: (this._progGen = (this._progGen || 0) + 1) };
    this._setSong(plan);
  }

  _setSong(plan) {
    this.song = plan.kind === 'ballad' && plan.father ? 'father_song' : plan.kind === 'talk' ? 'dhamma' : plan.kind === 'dj' ? 'dj' : `${plan.kind}_${plan.idx}`;
    this.title = plan.title || null;
    this._emit();
  }

  _pumpProgram() {
    const p = this._prog;
    if (!p || p.requested) return;
    const ctx = this.core.ctx;
    const now = ctx.currentTime;
    if (p.nextAt - now > 2.0) return;
    const { station, item, ci, gen } = p;
    const key = `radio:${station}:${item}:${ci}`;
    p.requested = key;
    const r = this.core.task(key, 'radioChunk', { station, n: item, ci }, 0);
    const go = (buf) => {
      if (!this._prog || this._prog.gen !== gen) return;
      const at = Math.max(ctx.currentTime + 0.02, p.nextAt);
      const off = Math.max(0, ctx.currentTime + 0.02 - p.nextAt);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 1;
      src.connect(g);
      g.connect(this.input);
      if (off < buf.duration) src.start(at, off);
      const rec = { src, g };
      this._srcs.add(rec);
      src.onended = () => {
        src.disconnect();
        g.disconnect();
        this._srcs.delete(rec);
      };
      // advance
      const win = buf._meta?.windowDur ?? p.plan.chunks[ci]?.dur ?? 6;
      p.nextAt += win;
      p.requested = null;
      p.ci++;
      if (p.ci >= p.plan.chunks.length) {
        // next programme item (station 3 repeats the song)
        p.item = station === 3 ? 0 : this._items[station]++;
        p.plan = programItem(station, p.item);
        p.ci = 0;
        p.nextAt += station === 4 ? 1.5 : 0.6;
        const plan = p.plan;
        setTimeout(() => this._prog === p && this._setSong(plan), Math.max(0, (p.nextAt - ctx.currentTime) * 1000));
      }
    };
    if (r instanceof Promise) r.then(go).catch(() => (p.requested = null));
    else go(r);
  }

  update(dt) {
    if (!this.core) return;
    const t = this.core.ctx.currentTime;
    if (this._tuning > 0) this._tuning -= dt;
    const on = this.on ? 1 : 0;
    const off3 = this.station === 3 && !this.fatherHour;
    const tuning = this._tuning > 0 || !this.station;
    let stat = tuning ? 0.9 : off3 ? 0.55 : 0.045;
    stat = clamp(stat + this.ghost * 0.8);
    const prog = tuning ? 0 : (1 - this.ghost * 0.7) * (off3 ? 0 : 1);
    this.staticGain.gain.setTargetAtTime(stat * 0.35 * on, t, 0.05);
    this.progGain.gain.setTargetAtTime(prog * on, t, 0.08);
    this.speaker.gain.setTargetAtTime(on * this.volume * 0.9, t, 0.03);
    // interference closes the band (ghosts nearby)
    this.lp.frequency.setTargetAtTime(4300 - this.ghost * 2200 + Math.sin(t * 7) * this.ghost * 600, t, 0.05);
    if (this.on && !tuning) this._pumpProgram();
    // whispers through the static
    if (this.on && (off3 || this.ghost > 0.45)) {
      this._whisperT -= dt;
      if (this._whisperT <= 0) {
        this._whisperT = 3 + Math.random() * 7 * (1.2 - this.ghost);
        this._whisper();
      }
    }
  }

  _whisper() {
    const core = this.core;
    const v = Math.floor(Math.random() * 6);
    const b = core.sfxBuffer('whisper', v, false, 1);
    const play = (buf) => {
      if (!this.on) return;
      const ctx = core.ctx;
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.playbackRate.value = 0.85 + Math.random() * 0.25;
      const g = ctx.createGain();
      g.gain.value = 0.45 + this.ghost * 0.5;
      s.connect(g);
      g.connect(this.fxIn);
      s.start();
      s.onended = () => {
        s.disconnect();
        g.disconnect();
      };
    };
    if (b instanceof Promise) b.then(play).catch(() => {});
    else play(b);
  }
}
