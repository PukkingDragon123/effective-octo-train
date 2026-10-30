// Character voices. voice.speak({th, en, voice:{gender,age,pitch,rate,ghost,whisper}, object|position}) -> Promise
// resolved when the line ends (so subtitles stay in sync).
//  * settings.voice 'auto' + an OS Thai voice (lang 'th*'): Web Speech TTS of the Thai text
//    (pitch/rate per character, ghosts lower + slower, plus a quiet spatial ghost-breath layer).
//  * otherwise ('murmur', no Thai voice, whispers): a synthesized Thai-cadence murmur from the
//    actual Thai text (syllables, tone marks -> tone contours, formant synthesis, breaths),
//    ghost processing (pitch down, granular smear, reverse-tail reverb), spatialised at the speaker.
//  * 'off': silent, but still resolves after a reading-time estimate.
import { settings } from '../core/Settings.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const FEMALE_HINT = /kanya|achara|narisa|premwadee|siri|female|หญิง|google ไทย/i;
const MALE_HINT = /pattara|niwat|male|ชาย/i;

export class VoiceSystem {
  constructor(sys) {
    this.sys = sys;
    this.voices = [];
    this.thai = [];
    this._active = new Set();
    this._ttsJob = null;
    this._detect();
  }

  get hasThaiVoice() {
    return this.thai.length > 0;
  }

  _detect() {
    const ss = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!ss) return;
    const load = () => {
      try {
        this.voices = ss.getVoices() || [];
        this.thai = this.voices.filter((v) => /^th/i.test(v.lang || ''));
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

  /** Reading-time estimate (s) used for fallbacks and 'off'. */
  estimate(line) {
    const th = line.th || '';
    const en = line.en || '';
    const rate = line.voice?.rate ?? 1;
    const ghost = line.voice?.ghost ?? 0;
    const base = th ? 0.5 + th.replace(/[่้๊๋์ัิีึืุู็ํ]/g, '').length * 0.085 : 0.6 + en.length * 0.055;
    return clamp((base / rate) * (1 + ghost * 0.25), 0.8, 14);
  }

  speak(line = {}) {
    const mode = settings.get('voice') || 'auto';
    const v = line.voice || {};
    const est = this.estimate(line);
    if (mode === 'off' || !line.th || !this.sys.core) return wait(est * 1000);
    const useTTS = mode === 'auto' && this.hasThaiVoice && !v.whisper && typeof SpeechSynthesisUtterance !== 'undefined';
    return useTTS ? this._tts(line, est) : this._murmur(line, est);
  }

  stop() {
    try {
      if (this._ttsJob) window.speechSynthesis?.cancel();
    } catch (e) {
      /* ignore */
    }
    for (const j of [...this._active]) j.finish();
  }

  _pickVoice(v) {
    const g = v.gender || 'm';
    const want = g === 'm' ? MALE_HINT : FEMALE_HINT;
    return this.thai.find((x) => want.test(x.name)) || this.thai.find((x) => x.localService) || this.thai[0];
  }

  _job(est) {
    let resolve;
    const p = new Promise((r) => (resolve = r));
    const job = {
      p,
      done: false,
      finish: () => {
        if (job.done) return;
        job.done = true;
        clearTimeout(job.timer);
        this._active.delete(job);
        job.onFinish?.();
        if (!this._active.size) this.sys.core?.duck(0, 'voice', 0.8);
        resolve();
      },
    };
    job.timer = setTimeout(() => job.finish(), (est * 2.2 + 3) * 1000);
    this._active.add(job);
    // dialogue ducks music / radio / ambience a little
    this.sys.core?.duck(0.35, ['voice', 'sfx', 'ui'], 0.4);
    return job;
  }

  _tts(line, est) {
    const v = line.voice || {};
    const ghost = clamp(v.ghost ?? 0, 0, 1);
    const job = this._job(est);
    try {
      const u = new SpeechSynthesisUtterance(line.th);
      u.lang = 'th-TH';
      const voice = this._pickVoice(v);
      if (voice) u.voice = voice;
      const g = v.gender || 'm';
      const age = v.age ?? 40;
      let pitch = g === 'child' ? 1.55 : g === 'f' ? 1.1 : 0.85;
      if (age > 60) pitch *= g === 'f' ? 0.9 : 0.95;
      pitch *= v.pitch ?? 1;
      pitch *= 1 - 0.35 * ghost;
      u.pitch = clamp(pitch, 0.1, 2);
      u.rate = clamp((v.rate ?? 1) * (1 - 0.28 * ghost) * (age > 65 ? 0.9 : 1), 0.5, 1.6);
      const vm = settings.get('volMaster') ?? 1;
      const vv = settings.get('volVoice') ?? 1;
      u.volume = clamp(vm * vv, 0, 1);
      u.onend = () => job.finish();
      u.onerror = () => job.finish();
      this._ttsJob = job;
      job.onFinish = () => {
        if (this._ttsJob === job) this._ttsJob = null;
        layer?.stop(0.6);
      };
      // ghosts: quiet spatial breath/whisper bed under the OS voice (TTS itself can't be processed)
      let layer = null;
      if (ghost > 0.2 && (line.object || line.position)) {
        layer = this.sys.loop('breath_neck', { object: line.object, position: line.position, volume: 0.25 * ghost, bus: 'voice', muffle: false });
      }
      window.speechSynthesis.speak(u);
    } catch (e) {
      job.finish();
    }
    return job.p;
  }

  _murmur(line, est) {
    const core = this.sys.core;
    const v = line.voice || {};
    const job = this._job(est);
    const key = `murmur:${line.th}:${JSON.stringify(v)}`;
    const voice = { gender: v.gender, age: v.age, pitch: v.pitch, rate: v.rate, ghost: v.ghost, whisper: v.whisper };
    const r = core.task(key, 'murmur', { th: line.th, voice, seed: null }, 0);
    const go = (buf) => {
      if (job.done) return;
      const spatial = !!(line.object || line.position);
      const handle = this.sys.playBuffer(buf, {
        bus: 'voice',
        object: line.object,
        position: line.position,
        offset3: line.mouthOffset,
        muffle: line.outside ?? false,
        ref: 1.1,
        reverb: (v.ghost ?? 0) > 0 ? 0.25 : 0.08,
        volume: (line.volume ?? 1) * (v.whisper ? 0.8 : 1),
        spatial,
      });
      job.onFinish = () => handle.stop(0.08);
      clearTimeout(job.timer);
      job.timer = setTimeout(() => job.finish(), (buf.duration + 0.05) * 1000);
      handle.ended.then(() => job.finish());
    };
    if (r instanceof Promise) r.then(go).catch(() => job.finish());
    else go(r);
    return job.p;
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
