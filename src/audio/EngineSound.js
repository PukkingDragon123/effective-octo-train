// Realtime vehicle engine: crossfaded pulse-model loops (3 rpm layers x on/off
// load) played at playbackRate = rpm / baseRpm, through FIXED exhaust/pipe
// resonances, a drive waveshaper and a load/rpm-dependent low-pass. Plus intake
// roar amplitude-modulated by the firing pulses, gear whine, idle unevenness, rev
// limiter, decel crackle, tyre roll noise per surface and wind noise vs speed.
//
//
// Recorded samples layered in when the manifest has them: the starter crank + catch (engine_start;
// trimmed so it catches on the gameplay crank timer, then crossfaded into the model), a real idle
// (engine_idle / bike_idle) that dominates near idle rpm and hands over to the model as revs rise,
// gravel tyre roll (tyres_gravel) and cabin road noise (car_interior_cruise) vs speed.
//
//   engineSound.setOn(true|false, {instant, stall}) · setRPM(rpm) · setLoad(0..1 | -1..1)
//   setGear(g) · setSpeed(kmh) · setSurface('asphalt'|'gravel'|'grass'|'dirt'|'wood'|'concrete'|'puddle') · attach(obj, bodyObj?)
//   crankFail() -> handle   (the starter cranks but the engine will not catch)
import { Wander, rngFrom, alloc, noiseBurst, normalize } from './Synth/dsp.js';
import { thud } from './Synth/lib.js';
import { ENGINE_START_CRANK } from './Synth/sfxCar.js';
import { SOUNDS } from './Synth/registry.js';
import { detectCatch, sampleLoudness } from './Samples.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const PROFILES = {
  car: {
    cfg: 'car',
    layers: [900, 2200, 4400],
    idle: 820,
    redline: 6200,
    res: [[105, 1.4, 4], [330, 2.2, 6], [620, 3, 3], [1350, 2, 2], [2900, 1.5, -4]],
    gain: 0.55,
    whine: [0, 38, 23, 15.5, 11.5, 9.2], // Hz per km/h by gear (index = gear number; R uses 45)
    tyre: 1,
    ref: 3,
    startSfx: 'engine_start',
    idleRec: 'engine_idle',
    idleRecDb: -21,
    tyreRec: { gravel: ['tyres_gravel', -15], cruise: ['car_interior_cruise', -19] },
  },
  bike: {
    cfg: 'bike',
    layers: [1500, 3800, 7200],
    idle: 1450,
    redline: 9000,
    res: [[180, 1.8, 5], [420, 2.5, 6], [1250, 3, 4], [2600, 2, 2]],
    gain: 0.5,
    whine: [0, 60, 44, 33, 27, 22],
    tyre: 0.6,
    ref: 2,
    startSfx: null,
    idleRec: 'bike_idle',
    idleRecDb: -22,
    tyreRec: null,
  },
};

export class EngineSound {
  constructor(sys, kind = 'car') {
    this.sys = sys;
    this.kind = kind;
    this.P = PROFILES[kind];
    this.on = false;
    this.rpm = this.P.idle;
    this.load = 0;
    this.gear = 'N';
    this.speed = 0;
    this.surface = 'asphalt';
    this.object = null;
    this.body = null;
    this.volume = 1;
    this.core = null;
    this.ready = false;
    this._rpmS = this.P.idle;
    this._loadS = 0;
    this._onGain = 0;
    this._prevLoad = 0;
    this._crackleT = 0;
    this._limiterT = 0;
    this._startAt = 0;
    this._rng = rngFrom(kind === 'car' ? 4 : 5);
    this._wander = new Wander(this._rng, 2.2);
  }

  // ---- public API (safe before audio init) ----
  setOn(on, opts = {}) {
    on = !!on;
    if (on === this.on) return;
    this.on = on;
    if (!this.core) return;
    const now = this.core.ctx.currentTime;
    if (on) {
      if (opts.instant || !this.P.startSfx || opts.silent) {
        this._startAt = now;
        this._rpmS = this.P.idle * 1.4;
      } else if (this._recordedStart(opts, now)) {
        this._rpmS = this.P.idle * 1.05;
      } else {
        const v = opts.variant ?? (Math.random() < 0.5 ? 0 : 1);
        const crank = ENGINE_START_CRANK[v] ?? 0.85;
        this.sys.play(this.P.startSfx, { object: this.object, variant: v, bus: 'sfx', muffle: false, volume: this.volume, mustPlay: true });
        this._startAt = now + crank + 1.45;
        this._rpmS = this.P.idle * 1.05;
      }
    } else {
      this._startAt = Infinity;
      if (opts.stall) this.sys.play('engine_stall', { object: this.object, bus: 'sfx', muffle: false, volume: this.volume });
      this._shutdownT = now;
    }
  }
  /** Recorded crank + catch, trimmed so the engine catches when the gameplay crank timer ends. */
  _recordedStart(opts, now) {
    const core = this.core;
    const bank = core.samples;
    const sm = bank?.resolve(this.P.startSfx, {}, 'play');
    if (!sm || sm.mode !== 'shot') return false;
    const buf = bank.get(sm, 0);
    if (!buf || buf instanceof Promise) return false; // still loading: the synth start this time
    const v = opts.variant ?? (Math.random() < 0.5 ? 0 : 1);
    const crank = opts.crank ?? ENGINE_START_CRANK[v] ?? 0.85;
    const tc = detectCatch(buf);
    const off = clamp(tc - crank, 0, Math.max(0, tc - 0.35));
    const catchAt = now + (tc - off);
    const def = SOUNDS[this.P.startSfx] || {};
    const h = core.playBuffer(buf, {
      object: this.object, bus: 'sfx', muffle: false, offset: off, fadeIn: off > 0 ? 0.04 : 0,
      volume: this.volume * bank.normGain(buf, sampleLoudness(this.P.startSfx, sm.key)), ref: def.ref ?? 3, reverb: def.reverb ?? 0.15,
    });
    bank.stats.plays++;
    this._recStart = { h, stopAt: catchAt + 1.2 };
    this._startAt = catchAt + 0.3;
    return true;
  }
  /** The starter cranks but the engine will not catch (recorded engine_crank_fail, else a long synth crank). */
  crankFail(opts = {}) {
    const o = { object: this.object, bus: 'sfx', muffle: false, volume: this.volume * (opts.volume ?? 1), mustPlay: true };
    if (this.core?.samples?.covers('engine_crank_fail', 'play')) return this.sys.play('engine_crank_fail', o);
    return this.sys.play('ignition', { ...o, count: opts.count ?? 2, interval: 1.6 });
  }
  setRPM(rpm) {
    this.rpm = Math.max(0, rpm || 0);
  }
  setLoad(load) {
    this.load = clamp(load || 0, -1, 1);
  }
  setThrottle(t) {
    this.setLoad(t);
  }
  setGear(g) {
    if (g !== this.gear && this.core && this.on && this.kind === 'car') {
      // momentary drivetrain lash
      this._lashT = this.core.ctx.currentTime;
    }
    this.gear = g;
  }
  setSpeed(kmh) {
    this.speed = Math.abs(kmh || 0);
  }
  setSurface(kind) {
    this.surface = kind || 'asphalt';
  }
  setVolume(v) {
    this.volume = v;
  }
  attach(object, body = null) {
    this.object = object;
    this.body = body || object;
    if (this.src) {
      this.src.voice.opts.object = object;
      this.tyreSrc.voice.opts.object = this.body;
    }
  }

  // ---- graph ----
  _attachCore(core) {
    this.core = core;
    const ctx = core.ctx;
    const P = this.P;
    this.sum = ctx.createGain();
    this.sum.gain.value = 0.8;
    this.layers = [];
    // waveshaper (soft drive)
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2) + 0.05 * x * x; // slight asymmetry = even harmonics
    }
    this.shaper.curve = curve;
    this.shaper.oversample = '2x';
    let node = this.shaper;
    this.sum.connect(this.shaper);
    this.res = P.res.map(([f, q, g]) => {
      const b = ctx.createBiquadFilter();
      b.type = 'peaking';
      b.frequency.value = f;
      b.Q.value = q;
      b.gain.value = g;
      node.connect(b);
      node = b;
      return b;
    });
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 38;
    node.connect(this.hp);
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.6;
    this.lp.frequency.value = 2000;
    this.hp.connect(this.lp);
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.lp.connect(this.out);

    // intake roar: noise AM'd by the engine signal
    this.intakeBP = ctx.createBiquadFilter();
    this.intakeBP.type = 'bandpass';
    this.intakeBP.Q.value = 1.2;
    this.intakeBP.frequency.value = 500;
    this.intakeAM = ctx.createGain();
    this.intakeAM.gain.value = 0;
    this.intakeLevel = ctx.createGain();
    this.intakeLevel.gain.value = 0;
    this.intakeBP.connect(this.intakeAM);
    this.sum.connect(this.intakeAM.gain); // audio-rate AM
    this.intakeAM.connect(this.intakeLevel);
    this.intakeLevel.connect(this.out);

    // dashboard / trim rattle: noise bursts gated by the rectified firing pulses
    this.rattleBP = ctx.createBiquadFilter();
    this.rattleBP.type = 'bandpass';
    this.rattleBP.frequency.value = 2700;
    this.rattleBP.Q.value = 2.2;
    this.rattleAM = ctx.createGain();
    this.rattleAM.gain.value = 0;
    const rect = ctx.createWaveShaper();
    const rc = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      rc[i] = Math.max(0, Math.abs(x) - 0.25) * 2.2; // only the pulse peaks open the gate
    }
    rect.curve = rc;
    this.sum.connect(rect);
    rect.connect(this.rattleAM.gain);
    this.rattleBP.connect(this.rattleAM);
    this.rattleLevel = ctx.createGain();
    this.rattleLevel.gain.value = 0;
    this.rattleAM.connect(this.rattleLevel);
    this.rattleLevel.connect(this.out);

    // gear whine
    this.whine = ctx.createOscillator();
    this.whine.type = 'triangle';
    this.whine.frequency.value = 400;
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain);
    this.whineGain.connect(this.out);
    this.whine.start();

    // spatial source for the engine
    const pseudo = (obj, ref) => ({ opts: { object: obj }, def: { ref, rolloff: 1 }, send: null });
    this.src = core.spatial.createSource(pseudo(this.object, P.ref), { object: this.object, track: true });
    this.out.connect(this.src.input);
    this.src.output.connect(core.buses.sfx.direct);
    const send = ctx.createGain();
    send.gain.value = 0.12;
    this.out.connect(send);
    send.connect(core.buses.sfx.sendCab);

    // tyres + wind (from the vehicle body)
    this.tyreOut = ctx.createGain();
    this.tyreOut.gain.value = 0;
    this.tyreSrc = core.spatial.createSource(pseudo(this.body, 2.5), { object: this.body, track: true });
    this.tyreOut.connect(this.tyreSrc.input);
    this.tyreSrc.output.connect(core.buses.sfx.direct);
    this.tyreLP = ctx.createBiquadFilter();
    this.tyreLP.type = 'lowpass';
    this.tyreLP.frequency.value = 800;
    this.tyreLP.connect(this.tyreOut);
    this.tyreG = {};
    this.windBP = ctx.createBiquadFilter();
    this.windBP.type = 'bandpass';
    this.windBP.frequency.value = 900;
    this.windBP.Q.value = 0.5;
    this.windG = ctx.createGain();
    this.windG.gain.value = 0;
    this.windBP.connect(this.windG);
    this.windG.connect(core.buses.sfx.direct);

    this._loading = this._loadBuffers().then(() => this._recLoading);
  }

  async _loadBuffers() {
    const core = this.core;
    const P = this.P;
    const jobs = [];
    P.layers.forEach((rpm, i) => {
      for (const load of [0.9, 0.12]) {
        const key = `eng:${P.cfg}:${rpm}:${load}`;
        jobs.push(Promise.resolve(core.task(key, 'engineLoop', { cfg: P.cfg, rpm, load, seconds: 1.9, seed: 10 + i * 3 + (load > 0.5 ? 1 : 0) }, 1)).then((buf) => ({ buf, i, on: load > 0.5 })));
      }
    });
    const beds = ['tyre_asphalt', 'tyre_gravel', 'tyre_grass', 'noise_pink'].map((k) => Promise.resolve(core.task(`bed:${k}:3`, 'bed', { kind: k, seed: 3 }, 1)).then((buf) => ({ k, buf })));
    // recorded layers attach whenever they arrive (they never hold up the synth engine)
    this._recLoading = this._loadRecorded().catch(() => null);
    const [ls, bs] = await Promise.all([Promise.all(jobs), Promise.all(beds)]);
    if (!this.core) return;
    const ctx = core.ctx;
    for (const { buf, i, on } of ls) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(g);
      g.connect(this.sum);
      s.start(ctx.currentTime, Math.random() * buf.duration);
      this.layers.push({ s, g, i, on, base: buf._meta?.baseRpm || P.layers[i] });
    }
    for (const { k, buf } of bs) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start(ctx.currentTime, Math.random() * buf.duration);
      if (k === 'noise_pink') {
        s.connect(this.intakeBP);
        const s2 = ctx.createBufferSource();
        s2.buffer = buf;
        s2.loop = true;
        s2.playbackRate.value = 0.73;
        s2.start(ctx.currentTime, Math.random() * buf.duration);
        s2.connect(this.windBP);
        this.windSrc = s2;
        const s3 = ctx.createBufferSource();
        s3.buffer = buf;
        s3.loop = true;
        s3.playbackRate.value = 1.31;
        s3.start(ctx.currentTime, Math.random() * buf.duration);
        s3.connect(this.rattleBP);
      } else {
        const name = k.slice(5);
        if (this.recTyre?.[name]) {
          s.stop(); // a recording replaces this synth texture
          continue;
        }
        const g = ctx.createGain();
        g.gain.value = 0;
        s.connect(g);
        g.connect(this.tyreLP);
        this.tyreG[name] = { s, g };
      }
    }
    this.ready = true;
  }

  /** Recorded layers (idle, tyres, cabin road noise). Missing/failed recordings are skipped. */
  async _loadRecorded() {
    const core = this.core;
    const bank = core.samples;
    this.recTyre = {};
    if (!bank) return;
    await Promise.race([bank.ready, new Promise((r) => setTimeout(r, 2500))]);
    if (!this.core || !bank.usable) return;
    const ctx = core.ctx;
    const loopSrc = (buf, dest, gainNode) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      if (buf._loopEnd) {
        s.loopStart = buf._loopStart;
        s.loopEnd = buf._loopEnd;
      }
      s.connect(gainNode);
      gainNode.connect(dest);
      s.start(ctx.currentTime, (buf._loopStart || 0) + Math.random() * ((buf._loopEnd || buf.duration) - (buf._loopStart || 0)));
      bank.pin(buf._file);
      return s;
    };
    const load = async (key, idx = 0) => {
      const e = bank.entry(key);
      if (!e || !e.loop) return null;
      return Promise.resolve(bank.get({ e, idx: Math.min(idx, e.files.length - 1) }, 1));
    };
    const jobs = [];
    if (this.P.idleRec) {
      jobs.push(load(this.P.idleRec, 0).then((buf) => {
        if (!buf || !this.core) return;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3000;
        lp.Q.value = 0.5;
        lp.connect(this.src.input);
        const g = ctx.createGain();
        g.gain.value = 0;
        this.recIdle = { s: loopSrc(buf, lp, g), g, lp, norm: bank.normGain(buf, this.P.idleRecDb, 'rms', 2) };
      }));
    }
    for (const [name, [key, db]] of Object.entries(this.P.tyreRec || {})) {
      jobs.push(load(key, 0).then((buf) => {
        if (!buf || !this.core) return;
        const g = ctx.createGain();
        g.gain.value = 0;
        // gravel replaces the synth texture inside the tyre path; cabin road noise has its own level
        const s = loopSrc(buf, name === 'cruise' ? this.tyreSrc.input : this.tyreOut, g);
        this.recTyre[name] = { s, g, norm: bank.normGain(buf, db, 'rms', 2) };
        if (this.tyreG[name]) {
          try {
            this.tyreG[name].s.stop();
          } catch (e) {
            /* ignore */
          }
          delete this.tyreG[name];
        }
      }));
    }
    await Promise.all(jobs.map((j) => j.catch(() => null)));
  }

  _pop() {
    // decel crackle / backfire pop through the engine panner
    const core = this.core;
    const ctx = core.ctx;
    if (!this._popBufs) {
      this._popBufs = [];
      for (let k = 0; k < 4; k++) {
        const sr = 24000;
        const b = alloc(sr, 0.12);
        const rng = rngFrom(50 + k);
        thud(b, sr, rng, 0, { f: 120 + k * 30, fEnd: 60, t60: 0.06, noise: 1.5, click: 0.8 });
        noiseBurst(b, sr, rng, 0, 0.02, { f: 1800, q: 0.7, a: 0.0002, d: 0.01, gain: 0.6 });
        normalize(b, 0.9);
        this._popBufs.push(core.toAudioBuffer({ channels: [b], sr }));
      }
    }
    const s = ctx.createBufferSource();
    s.buffer = this._popBufs[Math.floor(Math.random() * 4)];
    s.playbackRate.value = 0.85 + Math.random() * 0.3;
    const g = ctx.createGain();
    g.gain.value = 0.25 + Math.random() * 0.35;
    s.connect(g);
    g.connect(this.src.input);
    s.start();
    s.onended = () => {
      s.disconnect();
      g.disconnect();
    };
  }

  update(dt) {
    if (!this.core || !this.ready) return;
    const ctx = this.core.ctx;
    const now = ctx.currentTime;
    const P = this.P;
    dt = Math.min(0.1, Math.max(0, dt));
    // smoothing
    const target = this.on ? Math.max(this.rpm, now < this._startAt + 0.6 ? P.idle * 0.95 : 0, 200) : 0;
    const k = 1 - Math.exp(-dt * 9);
    this._rpmS += (target - this._rpmS) * k;
    const loadT = this.load;
    this._loadS += (loadT - this._loadS) * (1 - Math.exp(-dt * 7));
    // recorded start: let it ring through the catch, then hand over to the model
    if (this._recStart && now >= this._recStart.stopAt) {
      this._recStart.h.stop(this.on ? 1.0 : 0.3);
      this._recStart = null;
    } else if (this._recStart && !this.on) {
      this._recStart.h.stop(0.25);
      this._recStart = null;
    }
    // engine on/off envelope
    let onT = this.on && now >= this._startAt ? 1 : 0;
    const fadeSpeed = this.on ? 2.2 : 3.5;
    this._onGain += (onT - this._onGain) * (1 - Math.exp(-dt * fadeSpeed));
    // shutdown rundown: rpm falls
    if (!this.on) this._rpmS *= Math.exp(-dt * 3.2);

    // idle unevenness (old carb engine hunting at idle)
    const idleness = 1 - smooth(P.idle * 1.2, P.idle * 2.2, this._rpmS);
    let rpm = this._rpmS * (1 + this._wander.next(dt) * 0.03 * idleness);

    // rev limiter
    let limCut = 1;
    if (this.on && this.rpm >= P.redline - 40 && this.load > 0.5) {
      this._limiterT += dt;
      const ph = (this._limiterT * 13) % 1;
      if (ph < 0.45) {
        limCut = 0.18;
        rpm -= 220;
      }
    } else this._limiterT = 0;

    // decel crackle
    if (this.on && this._prevLoad > 0.55 && this.load < 0.15 && this._rpmS > 3000) this._crackleT = 1.2;
    this._prevLoad = this.load;
    if (this._crackleT > 0) {
      this._crackleT -= dt;
      if (Math.random() < dt * 9) this._pop();
    }

    // layer crossfade (log-rpm, equal power) x load
    const L = P.layers;
    const lr = Math.log(Math.max(rpm, 50));
    const wts = L.map(() => 0);
    if (lr <= Math.log(L[0])) wts[0] = 1;
    else if (lr >= Math.log(L[L.length - 1])) wts[L.length - 1] = 1;
    else {
      for (let i = 0; i < L.length - 1; i++) {
        const a = Math.log(L[i]), b = Math.log(L[i + 1]);
        if (lr >= a && lr <= b) {
          const t = (lr - a) / (b - a);
          wts[i] = Math.cos((t * Math.PI) / 2);
          wts[i + 1] = Math.sin((t * Math.PI) / 2);
        }
      }
    }
    const ld = Math.max(0, this._loadS);
    const onW = smooth(0.08, 0.7, ld);
    const tc = 0.03;
    for (const l of this.layers) {
      const w = wts[l.i] * (l.on ? onW : 1 - onW * 0.85);
      l.g.gain.setTargetAtTime(w, now, tc);
      l.s.playbackRate.setTargetAtTime(clamp(rpm / l.base, 0.05, 4), now, tc);
    }
    // drive + tone
    const rpmN = clamp(rpm / P.redline, 0, 1);
    this.sum.gain.setTargetAtTime(0.45 + ld * 0.5 + rpmN * 0.15, now, tc);
    const muffle = this.core.muffle;
    const bright = (1100 + rpm * 0.55 + ld * 2600) * (1 - 0.35 * muffle);
    this.lp.frequency.setTargetAtTime(clamp(bright, 300, 9000), now, tc);
    const lash = this._lashT && now - this._lashT < 0.12 ? 0.8 : 1;
    // recorded idle: dominant at idle rpm, gone by ~1.9x idle or under load
    const ri = this.recIdle;
    const recW = ri ? (1 - smooth(P.idle * 1.1, P.idle * 1.9, rpm)) * (1 - 0.6 * smooth(0.15, 0.6, ld)) : 0;
    const level = this._onGain * P.gain * this.volume * (0.5 + 0.25 * ld + 0.25 * rpmN) * limCut * lash * (1 - 0.65 * recW);
    this.out.gain.setTargetAtTime(level, now, 0.02);
    if (ri) {
      ri.g.gain.setTargetAtTime(this._onGain * this.volume * ri.norm * recW * limCut, now, 0.04);
      ri.s.playbackRate.setTargetAtTime(clamp(rpm / P.idle, 0.6, 2.2), now, tc);
      ri.lp.frequency.setTargetAtTime(clamp((2600 + ld * 3000) * (1 - 0.3 * muffle), 800, 8000), now, 0.05);
    }
    // intake
    this.intakeBP.frequency.setTargetAtTime(250 + rpm * 0.18, now, tc);
    this.intakeLevel.gain.setTargetAtTime(this._onGain * (0.04 + 0.4 * ld * (0.3 + rpmN)), now, tc);
    // rattles: worst at idle and around the cabin's resonance band (~1100-1500 rpm)
    const resBand = smooth(950, 1150, rpm) * (1 - smooth(1450, 1700, rpm));
    this.rattleLevel.gain.setTargetAtTime(this._onGain * this.volume * (idleness * 0.5 + resBand * 0.7) * 0.22, now, 0.08);
    // gear whine (strongest in low gears, under load or overrun)
    const g = this.gear;
    const gn = Number(g);
    const gi = g === 'R' ? 45 : Number.isFinite(gn) && gn > 0 ? P.whine[Math.min(5, gn)] || 0 : g === 'D' ? P.whine[Math.min(5, 1 + Math.floor(this.speed / 25))] : 0;
    const wf = Math.max(30, this.speed * (gi || 10));
    this.whine.frequency.setTargetAtTime(wf, now, 0.05);
    const wg = gi ? smooth(2, 15, this.speed) * (0.006 + 0.01 * Math.abs(this._loadS)) * (g === 'R' ? 2.5 : 1) * this._onGain : 0;
    this.whineGain.gain.setTargetAtTime(wg, now, 0.05);
    // tyres
    const sp = this.speed;
    const roll = smooth(0.5, 20, sp) * (0.35 + 0.65 * Math.min(1, sp / 80));
    const surf = this.surface === 'gravel' || this.surface === 'dirt' ? 'gravel' : this.surface === 'grass' ? 'grass' : 'asphalt';
    const rt = this.recTyre || {};
    for (const [name, t] of Object.entries(this.tyreG)) {
      // with recorded cabin road noise the synth asphalt texture stays underneath at half level
      const want = name === surf ? (name === 'asphalt' && rt.cruise ? 0.5 : 1) : 0;
      t.g.gain.setTargetAtTime(want, now, 0.12);
      t.s.playbackRate.setTargetAtTime(clamp(0.45 + sp / 55, 0.3, 2.5), now, 0.05);
    }
    if (rt.gravel) {
      // recorded gravel bypasses the synth tyre low-pass; tyreOut carries the speed level
      rt.gravel.g.gain.setTargetAtTime(surf === 'gravel' ? rt.gravel.norm * 1.4 : 0, now, 0.12);
      rt.gravel.s.playbackRate.setTargetAtTime(clamp(0.72 + sp / 160, 0.6, 1.4), now, 0.08);
    }
    if (rt.cruise) {
      const paved = surf === 'asphalt' ? 1 : 0.35;
      const lvl = smooth(3, 45, sp) * (0.45 + 0.55 * Math.min(1, sp / 90)) * paved * this.volume * rt.cruise.norm;
      rt.cruise.g.gain.setTargetAtTime(lvl, now, 0.15);
      rt.cruise.s.playbackRate.setTargetAtTime(clamp(0.78 + sp / 260, 0.75, 1.3), now, 0.1);
    }
    const wet = this.sys.ambience?.state?.wetness ?? 0;
    this.tyreLP.frequency.setTargetAtTime(350 + sp * 22 + wet * 2500, now, 0.1);
    this.tyreOut.gain.setTargetAtTime(roll * P.tyre * 0.6 * this.volume * (1 + wet * 0.6), now, 0.08);
    // wind past the body (more with windows open = less muffle)
    const wind = Math.pow(Math.min(1, sp / 110), 2) * (0.12 + 0.45 * (1 - muffle));
    this.windBP.frequency.setTargetAtTime(500 + sp * 9, now, 0.1);
    this.windG.gain.setTargetAtTime(wind * this.volume, now, 0.1);
  }

  dispose() {
    for (const r of [this.recIdle, ...Object.values(this.recTyre || {})]) {
      try {
        r?.s.stop();
      } catch (e) {
        /* ignore */
      }
    }
    for (const l of this.layers || []) {
      try {
        l.s.stop();
      } catch (e) {
        /* ignore */
      }
    }
    try {
      this.whine?.stop();
    } catch (e) {
      /* ignore */
    }
    this.out?.disconnect();
    this.core = null;
  }
}
