// Character voices. voice.speak({th, en, voice:{gender,age,pitch,rate,ghost,whisper}, object|position, tone, fx})
// -> Promise resolved when the spoken words end (so subtitles stay in sync).
//
//  * settings.voice 'auto' + an OS Thai voice: Web Speech TTS of the Thai text, with per-character pitch / rate
//    (gender, age, the character's own pitch/rate, a stable per-character offset, ghost slowing) and volume from
//    distance. The OS voice cannot enter Web Audio, so the voice rack (VoiceFX.js) plays its companion layers:
//    a soft inhale before living lines; for ghosts the reverse-reverb swell, an octave-down murmur double and a
//    whispered double behind the listener, breaths that do not match the words and a sub-bass hum, all kept in
//    step with the utterance's word-boundary events. Ghost lines are spoken in chunks with stutters and pauses
//    at wrong places (planGhostEdits, shared with the murmur).
//  * otherwise ('murmur', no Thai voice, whispers, sung lines): formant-synthesised Thai speech built from the
//    actual Thai text (Synth/speech.js renderVoiceLine), all of it processed by the rack: cabin / outdoor reverb,
//    proximity tone, phone / radio band, and for ghosts every layer above plus ring-mod / bit-crush flutter on
//    stressed syllables and a start in the wrong ear.
//  * 'off': silent, but still resolves after a reading-time estimate.
//
// OS voices: Chromium lists whatever the platform speech engine exposes. Windows: SAPI 5 voices (the
// OneCore-only "Microsoft Pattara" Thai voice appears only when the OS exposes it to SAPI; Edge also lists
// online "Premwadee / Niwat (Natural)"), macOS: Kanya / Narisa, Android: Google Thai. Electron uses the
// same Chromium path, so the desktop build finds Pattara exactly when Chrome on that machine does; when no
// voice with lang th* is listed the murmur is used. A voice that never starts (watchdog) is skipped.
import { settings } from '../core/Settings.js';
import { VoiceFX } from './VoiceFX.js';
import { parseThai, planGhostEdits } from './Synth/speech.js';
import { hashStr, rngFrom } from './Synth/dsp.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const FEMALE_HINT = /kanya|narisa|premwadee|achara|female|หญิง|woman|girl/i;
const MALE_HINT = /pattara|niwat|\bmale\b|ชาย|\bman\b/i;
const QUALITY_HINT = /natural|neural|premium|enhanced|online/i;
const taper = (v) => Math.max(0, Math.min(1.5, v ?? 1)) ** 2;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function genderOf(v) {
  const n = v?.name || '';
  if (FEMALE_HINT.test(n)) return 'f';
  if (MALE_HINT.test(n)) return 'm';
  return '?';
}

export class VoiceSystem {
  constructor(sys) {
    this.sys = sys;
    this.voices = [];
    this.thai = [];
    this._active = new Set();
    this._broken = new Set(); // OS voices that never started
    this._cal = new Map(); // OS voice name -> seconds per syllable at rate 1 (learned)
    this.fx = null;
    this.lastPath = null; // 'tts' | 'murmur' (debug / sandbox)
    this._detect();
  }

  get hasThaiVoice() {
    return this.thai.some((v) => !this._broken.has(v.name));
  }
  /** Names of the OS Thai voices found (debug). */
  get thaiVoiceNames() {
    return this.thai.map((v) => `${v.name}${v.localService ? '' : ' (network)'}`);
  }
  info() {
    return {
      mode: settings.get('voice') || 'auto',
      thaiVoices: this.thaiVoiceNames,
      broken: [...this._broken],
      male: this._pickVoice({ gender: 'm' })?.name || null,
      female: this._pickVoice({ gender: 'f' })?.name || null,
      speaking: this._active.size,
      lastPath: this.lastPath,
    };
  }

  _detect() {
    const ss = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!ss) return;
    const load = () => {
      try {
        this.voices = ss.getVoices() || [];
        this.thai = this.voices.filter((v) => /^th([-_]|$)/i.test(v.lang || '') || /thai|ไทย/i.test(v.name || ''));
      } catch (e) {
        this.thai = [];
      }
    };
    load();
    try {
      ss.addEventListener?.('voiceschanged', load);
      if (!ss.addEventListener) ss.onvoiceschanged = load;
    } catch (e) {
      /* ignore */
    }
  }

  _rackPool() {
    const core = this.sys.core;
    if (!core) return null;
    if (!this.fx || this.fx.core !== core) this.fx = new VoiceFX(core);
    return this.fx;
  }
  _attachCore() {
    this.fx = null;
  }

  /** Reading-time estimate (s) used for fallbacks and 'off'. */
  estimate(line) {
    const th = line.th || '';
    const en = line.en || '';
    const rate = line.voice?.rate ?? 1;
    const ghost = line.voice?.ghost ?? 0;
    const base = th ? 0.5 + th.replace(/[่้๊๋์ัิีึืุู็ํ]/g, '').length * 0.085 : 0.6 + en.length * 0.055;
    return clamp((base / rate) * (1 + ghost * 0.25), 0.8, 14);
  }

  /** Normalised description of a line: voice params, tone, effect, seed, ghost plan. */
  _desc(line) {
    const v0 = line.voice || {};
    const tone = line.tone || '';
    const v = {
      gender: v0.gender || 'm',
      age: v0.age ?? (v0.gender === 'child' ? 9 : 40),
      pitch: v0.pitch ?? 1,
      rate: v0.rate ?? 1,
      ghost: clamp(Math.max(v0.ghost ?? 0, tone === 'ghost' ? 0.6 : 0), 0, 1),
      whisper: !!v0.whisper || tone === 'whisper',
    };
    const obj = line.object || null;
    const fx = line.fx || (tone === 'phone' || tone === 'radio' ? tone : null) || obj?.userData?.voiceFx || (/radio/i.test(obj?.name || '') ? 'radio' : /phone|โทรศัพท์/i.test(obj?.name || '') ? 'phone' : null);
    const th = line.th || '';
    const seed = hashStr(`${th}|${v.gender}|${v.age}|${v.pitch}|${v.rate}|${v.ghost}|${v.whisper}|${tone}`);
    const edits = planGhostEdits(th, v.ghost, seed);
    return { th, v, tone, fx, seed, edits, ghost: v.ghost, obj };
  }

  speak(line = {}) {
    const mode = settings.get('voice') || 'auto';
    const est = this.estimate(line);
    if (mode === 'off' || !line.th || !this.sys.core) return wait(est * 1000);
    const d = this._desc(line);
    const sing = d.tone === 'sing' || line.voice?.sing;
    const useTTS = mode === 'auto' && !this.sys.offline && this.hasThaiVoice && !d.v.whisper && !sing && typeof SpeechSynthesisUtterance !== 'undefined';
    this.lastPath = useTTS ? 'tts' : 'murmur';
    return useTTS ? this._tts(line, d, est) : this._murmur(line, d, est);
  }

  /** Render a line ahead of time (low priority) so it starts without latency when spoken. */
  prepare(line = {}) {
    const core = this.sys.core;
    if (!core || !line.th || (settings.get('voice') || 'auto') === 'off') return;
    const d = this._desc(line);
    const useTTS = (settings.get('voice') || 'auto') === 'auto' && this.hasThaiVoice && !d.v.whisper && d.tone !== 'sing';
    if (useTTS) return; // the shadow depends on the chosen OS voice's learned rate: rendered at speak time
    try {
      const r = core.task(this._key(d, 'murmur'), 'voiceLine', this._args(d, 'murmur'), 2);
      if (r instanceof Promise) r.catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }

  stop() {
    try {
      if ([...this._active].some((j) => j.tts)) window.speechSynthesis?.cancel();
    } catch (e) {
      /* ignore */
    }
    for (const j of [...this._active]) j.cancel();
  }

  update() {
    this.fx?.update();
  }

  // -------------------------------------------------------------------------------------------
  _job(est) {
    let resolve;
    const p = new Promise((r) => (resolve = r));
    const job = {
      p,
      done: false,
      tts: false,
      rack: null,
      timers: [],
      finish: () => {
        if (job.done) return;
        job.done = true;
        for (const t of job.timers) clearTimeout(t);
        this._active.delete(job);
        if (!this._active.size) this.sys.core?.duck(0, 'voice', 0.8);
        resolve();
      },
      cancel: () => {
        job.rack?.stop(0.12);
        job.finish();
      },
      after: (sec, fn) => job.timers.push(setTimeout(fn, Math.max(0, sec * 1000))),
    };
    job.after(est * 2.2 + 3, () => job.finish());
    this._active.add(job);
    // dialogue ducks music / radio / ambience a little
    this.sys.core?.duck(0.35, ['voice', 'sfx', 'ui'], 0.4);
    return job;
  }

  _key(d, mode, rate = 1) {
    return `voice:${mode}:${d.seed}:${rate.toFixed(2)}:${d.th}`;
  }
  _args(d, mode, rate) {
    return { th: d.th, voice: d.v, tone: d.tone, seed: d.seed, mode, edits: d.edits, rate, sr: 24000 };
  }
  _rackOpts(line, d, extra = {}) {
    const rng = rngFrom(d.seed ^ 0x51ed27);
    const g = d.ghost;
    return {
      object: d.obj,
      position: d.obj ? null : line.position || null,
      offset3: line.mouthOffset,
      outside: line.outside ?? null,
      fx: d.fx,
      ghost: g,
      wrongEar: g > 0.3 && rng() < 0.25 + 0.45 * g,
      seed: d.seed,
      volume: line.volume ?? 1,
      child: d.v.gender === 'child' || d.v.age < 13,
      self: line.self,
      ...extra,
    };
  }

  // ---------------------------------------------------------------- murmur path (any platform)
  _murmur(line, d, est, job = null) {
    const core = this.sys.core;
    job = job || this._job(est);
    const fx = this._rackPool();
    let r;
    try {
      r = core.task(this._key(d, 'murmur'), 'voiceLine', this._args(d, 'murmur'), 0);
    } catch (e) {
      console.warn('[audio] voice render failed', e);
      job.finish();
      return job.p;
    }
    const go = (buf) => {
      if (job.done || !buf) return job.finish();
      const rack = fx.acquire();
      const pl = rack.play(buf, buf._meta, this._rackOpts(line, d));
      job.rack = rack;
      // the promise ends with the words (the tails keep sounding in the rack)
      job.after(pl.speechEnd - core.ctx.currentTime + 0.08, () => job.finish());
    };
    if (r instanceof Promise) r.then(go).catch(() => job.finish());
    else go(r);
    return job.p;
  }

  // ---------------------------------------------------------------- OS TTS path
  _pickVoice(v = {}) {
    const g = v.gender || 'm';
    const child = g === 'child' || (v.age ?? 40) < 13;
    const want = child ? 'f' : g === 'f' ? 'f' : 'm';
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    let best = null;
    let bestScore = -1e9;
    for (const x of this.thai) {
      if (this._broken.has(x.name)) continue;
      const xg = genderOf(x);
      let s = xg === want ? 20 : xg === '?' ? 6 : 0;
      if (QUALITY_HINT.test(x.name) && online) s += 8;
      if (!x.localService && !online) s -= 30;
      if (x.localService) s += 3;
      if (/^th[-_]th/i.test(x.lang || '')) s += 2;
      if (x.default) s += 1;
      if (s > bestScore) {
        bestScore = s;
        best = x;
      }
    }
    return best;
  }

  _ttsParams(line, d, voice) {
    const v = d.v;
    const child = v.gender === 'child' || v.age < 13;
    const vg = genderOf(voice);
    let pitch;
    if (child) pitch = vg === 'm' ? 1.7 : 1.42;
    else if (v.gender === 'f') pitch = vg === 'm' ? 1.45 : 1.04;
    else pitch = vg === 'f' ? 0.64 : 0.93;
    if (!child && v.age > 60) pitch *= v.gender === 'f' ? 0.93 : 0.95;
    if (!child && v.age < 25) pitch *= 1.03;
    pitch *= 1 + (v.pitch - 1) * 0.75;
    // a stable per-character offset so two similar characters never sound identical
    const id = rngFrom(hashStr(`${v.gender}|${v.age}|${v.pitch}|${v.rate}`));
    pitch *= 0.96 + id() * 0.08;
    let rate = v.rate * (v.age > 65 ? 0.92 : 1) * (0.97 + id() * 0.06);
    pitch *= 1 - 0.32 * d.ghost;
    rate *= 1 - 0.22 * d.ghost;
    if (d.tone === 'shout') {
      pitch *= 1.15;
      rate *= 1.08;
    }
    // loudness: player settings, distance to the speaker, through the car body when outside
    const sp = this.sys.core?.spatial;
    let dist = 1;
    const e = d.obj?.matrixWorld?.elements;
    const p = e ? [e[12], e[13], e[14]] : line.position ? [line.position.x ?? line.position[0], line.position.y ?? line.position[1], line.position.z ?? line.position[2]] : null;
    if (sp && p) dist = Math.hypot(p[0] - sp.lx, p[1] - sp.ly, p[2] - sp.lz);
    let vol = taper(settings.get('volMaster')) * taper(settings.get('volVoice')) * (this.sys.mix?.voice ?? 1) * (this.sys.mix?.master ?? 1);
    vol *= 1.1 / Math.max(1.1, dist);
    if (line.outside || (this.sys.muffle > 0.3 && dist > 1.9)) vol *= 0.55;
    if (d.fx) vol *= 0.8;
    vol *= line.volume ?? 1;
    return { pitch: clamp(pitch, 0.1, 2), rate: clamp(rate, 0.5, 1.6), volume: clamp(vol, 0, 1) };
  }

  /** Utterance chunks: ghost lines break where the plan says (stutters, pauses at wrong places). */
  _chunks(d) {
    const th = d.th;
    const evs = [...d.edits.pauses.map((p) => ({ ci: p.ci, pause: p.dur })), ...d.edits.repeats.map((r) => ({ ci: r.ci, rep: r }))].sort((a, b) => a.ci - b.ci);
    const chunks = [];
    let start = 0;
    for (const e of evs) {
      if (e.ci > start) {
        chunks.push({ text: th.slice(start, e.ci), offset: start, pause: 0 });
        start = e.ci;
      }
      if (e.pause && chunks.length) chunks[chunks.length - 1].pause += e.pause;
      if (e.rep) for (let t = 0; t < e.rep.times; t++) chunks.push({ text: th.substr(e.ci, e.rep.len), offset: e.ci, pause: 0.1 + 0.08 * t, repeat: true });
    }
    chunks.push({ text: th.slice(start), offset: start, pause: 0 });
    const out = [];
    for (const c of chunks) {
      if (!c.text.trim() || /^[\s.…,!?]*$/.test(c.text)) {
        if (out.length) out[out.length - 1].pause += c.pause + 0.15;
        continue;
      }
      out.push(c);
    }
    return out.length ? out : [{ text: th, offset: 0, pause: 0 }];
  }

  _tts(line, d, est) {
    const core = this.sys.core;
    const job = this._job(est);
    job.tts = true;
    const voice = this._pickVoice(d.v);
    if (!voice) return this._murmur(line, d, est, job);
    const params = this._ttsParams(line, d, voice);
    const ghostly = d.ghost >= 0.3 || d.tone === 'ghost';
    const chunks = ghostly ? this._chunks(d) : [{ text: d.th, offset: 0, pause: 0 }];
    // companion layers rendered at the OS voice's (learned) pace
    const syl = Math.max(1, parseThai(d.th).reduce((n, p) => n + p.sylls.length, 0));
    const secPerSyl = this._cal.get(voice.name) ?? 0.19;
    const murmurPace = 0.2 / Math.max(0.4, d.v.rate * (1 - d.ghost * 0.12));
    const rate = clamp(Math.round((murmurPace / (secPerSyl / params.rate)) * 20) / 20, 0.5, 2.2);
    const mode = ghostly ? 'shadow' : 'breath';
    const fx = this._rackPool();
    let r = null;
    try {
      r = core.task(this._key(d, mode, rate), 'voiceLine', this._args(d, mode, rate), 0);
    } catch (e) {
      r = null;
    }
    let started = false;
    const begin = (buf) => {
      if (started || job.done) return;
      started = true;
      let lead = 0.05;
      let pl = null;
      if (buf && buf._meta) {
        const rack = fx.acquire();
        pl = rack.play(buf, buf._meta, this._rackOpts(line, d, { muteMain: true, ttsSync: true }));
        job.rack = rack;
        lead = pl.speechStart - core.ctx.currentTime;
      }
      // OS engines take ~0.1 s to start: begin a little before the inhale / swell ends
      job.after(lead - 0.12, () => this._speakChunks(line, d, job, voice, params, chunks, pl, syl, est));
    };
    if (r instanceof Promise) {
      r.then(begin).catch(() => begin(null));
      // a living voice never waits long for its breath; a ghost waits for its swell
      job.after(ghostly ? 1.5 : 0.35, () => begin(null));
    } else begin(r);
    return job.p;
  }

  _speakChunks(line, d, job, voice, params, chunks, pl, syl, est) {
    if (job.done) return;
    const ss = window.speechSynthesis;
    const gen = (job.ttsGen = (job.ttsGen || 0) + 1);
    const live = () => !job.done && job.ttsGen === gen; // false once the job fell back to the murmur
    const fallBack = () => {
      job.ttsGen++;
      try {
        ss.cancel();
      } catch (err) {
        /* ignore */
      }
      this._broken.add(voice.name);
      rack?.stop(0.1);
      job.rack = null;
      job.tts = false;
      this.lastPath = 'murmur';
      this._murmur(line, d, est, job);
    };
    const rack = job.rack;
    const meta = rack?.meta;
    const ghostly = d.ghost >= 0.3;
    let k = 0;
    let t0 = 0;
    let paused = 0;
    let anyStart = false;
    const target = (ci) => {
      // buffer time of the first syllable at or after char index ci
      const s = meta?.sylls;
      if (!s?.length) return null;
      for (let i = 0; i < s.length; i++) if (s[i][0] >= ci) return s[i][1];
      return s[s.length - 1][1];
    };
    const done = () => {
      if (!live()) return;
      if (t0 && syl > 2) {
        // learn this voice's pace (s per syllable at rate 1) for the next shadow render
        const spoken = (performance.now() - t0) / 1000 - paused;
        const per = (spoken / syl) * params.rate;
        if (per > 0.08 && per < 0.6) {
          const old = this._cal.get(voice.name);
          this._cal.set(voice.name, old ? old * 0.7 + per * 0.3 : per);
        }
      }
      rack?.stop(ghostly ? 0.9 : 0.3);
      job.finish();
    };
    const next = () => {
      if (!live()) return;
      if (k >= chunks.length) return done();
      const ch = chunks[k++];
      let u;
      try {
        u = new SpeechSynthesisUtterance(ch.text);
      } catch (e) {
        return done();
      }
      u.lang = voice.lang || 'th-TH';
      u.voice = voice;
      u.pitch = params.pitch * (ch.repeat ? 0.94 : 1);
      u.rate = params.rate;
      u.volume = params.volume;
      u.onstart = () => {
        if (!live()) return;
        anyStart = true;
        if (!t0) {
          t0 = performance.now();
          const tg = target(ch.offset);
          if (tg != null) rack?.sync(tg);
        }
      };
      u.onboundary = (e) => {
        if (!live() || !rack || e.name === 'sentence') return;
        const tg = target(ch.offset + (e.charIndex || 0));
        if (tg != null) rack.sync(tg);
        if (ghostly && rack.rnd() < 0.25 + 0.5 * d.ghost) rack.flutterNow(0.4 + 0.5 * d.ghost, 0.06 + rack.rnd() * 0.1);
      };
      u.onend = () => {
        if (!live()) return;
        if (ch.pause > 0) {
          paused += ch.pause;
          job.after(ch.pause, next);
        } else next();
      };
      u.onerror = (e) => {
        if (!live()) return;
        if (e?.error === 'interrupted' || e?.error === 'canceled') return job.finish();
        if (!anyStart) fallBack();
        else next();
      };
      job.utt = u; // keep a reference: Chrome may garbage-collect a speaking utterance and drop its events
      try {
        ss.resume?.();
        ss.speak(u);
      } catch (e) {
        return done();
      }
      if (k === 1) {
        // watchdog: some engines never start (no audio device, broken voice): fall back to the murmur
        job.after(2.5, () => {
          if (anyStart || !live()) return;
          fallBack();
        });
      }
    };
    next();
  }
}
