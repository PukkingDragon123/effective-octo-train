// Voice banks: real recorded voices (CC0 Mozilla Common Voice, see docs/credits/audio.md) chopped into syllable
// grains offline (public/assets/audio/voice/<speaker>.ogg + .json; .mp3 where Ogg Opus cannot be decoded).
// Loaded lazily per speaker (a character's first line, or prepare()), decoded at 24 kHz, sent as Int16 PCM to the
// voice worker (Gen.js pins voice lines there; in the synchronous / offline mode they live on the main thread),
// where Synth/gibberish.js turns Thai text into realistic, unintelligible speech. Nothing here throws: a missing
// or undecodable bank leaves that speaker on the formant synth.
import { VOICE_SPEAKERS, speakerFor, hasBank } from './Synth/gibberish.js';

const BASE = 'assets/audio/voice/';
const FIRST = ['m1', 'om']; // the player and Ah Kong speak first (the garage)

let ext = null;
function format() {
  if (ext) return ext;
  try {
    const a = typeof document !== 'undefined' ? document.createElement('audio') : null;
    ext = a && a.canPlayType('audio/ogg; codecs=opus') ? 'ogg' : 'mp3';
  } catch (e) {
    ext = 'mp3';
  }
  return ext;
}

function markOffset(pcm, markAt) {
  // the atlas starts with a short 1.5 kHz burst at `markAt`: its position tells how many samples the decoder added
  let exp = 0;
  for (let i = 0; i < 96; i++) {
    const v = 0.5 * Math.sin((2 * Math.PI * 1500 * i) / 24000) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 95));
    if (Math.abs(v) > 0.25) {
      exp = i;
      break;
    }
  }
  const lim = Math.min(pcm.length, markAt + 2400);
  for (let i = 0; i < lim; i++) if (Math.abs(pcm[i]) > 8192) return i - (markAt + exp);
  return 0;
}

export class VoiceBanks {
  constructor(sys) {
    this.sys = sys;
    this.state = new Map(); // id -> { gen, epoch, p, ok }
    this.failed = new Set();
    this.bytes = 0;
    this._fetch = typeof fetch === 'function' ? (...a) => fetch(...a) : null;
  }

  /** Speaker id for a character voice ({gender, age}). */
  speaker(v) {
    return speakerFor(v);
  }

  get _gen() {
    return this.sys.core?.gen || null;
  }

  /** True when `id` is registered where voice lines render now. */
  ready(id) {
    const gen = this._gen;
    if (!gen || !id || !VoiceBanks.enabled) return false;
    // synchronous mode: the banks live in this realm (shared by every offline AudioSystem)
    if (!gen.pool.length) return hasBank(id);
    const st = this.state.get(id);
    return !!(st && st.ok && st.gen === gen && st.epoch === gen.epoch);
  }

  /** Load + register a speaker's bank (idempotent). Resolves true when ready, false on failure. */
  ensure(id) {
    const gen = this._gen;
    if (!id || !VOICE_SPEAKERS[id] || !gen || this.failed.has(id) || !this._fetch || !VoiceBanks.enabled) return Promise.resolve(false);
    const st = this.state.get(id);
    if (st && st.gen === gen && st.epoch === gen.epoch) return st.p;
    const rec = { gen, epoch: gen.epoch, ok: false, p: null };
    rec.p = this._load(id)
      .then((b) => {
        if (!b) return false;
        // synchronous mode: a bank already registered in this realm (another offline AudioSystem) is reused
        if (gen.pool.length || !hasBank(id)) gen.broadcast('setVoiceBank', { id, info: b.info, pcm: b.pcm, shift: b.shift });
        rec.ok = true;
        this.bytes += b.pcm.byteLength;
        return true;
      })
      .catch((err) => {
        this.failed.add(id);
        this.state.delete(id);
        console.warn(`[audio] voice bank "${id}" unavailable (${err?.message || err}); using the formant voice`);
        return false;
      });
    this.state.set(id, rec);
    return rec.p;
  }

  /** Warm the first speakers in the background. */
  warm(ids = FIRST) {
    for (const id of ids) this.ensure(id);
  }

  async _load(id) {
    if (!this.sys.core?.gen?.pool.length && hasBank(id)) return { info: null, pcm: new Int16Array(0), shift: 0 };
    const get = async (url, kind) => {
      const r = await this._fetch(url);
      if (!r || !r.ok) throw new Error(`HTTP ${r?.status} ${url}`);
      return kind === 'json' ? r.json() : r.arrayBuffer();
    };
    const info = await get(BASE + id + '.json', 'json');
    const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!OAC) throw new Error('no OfflineAudioContext');
    const decode = (ab) =>
      new Promise((res, rej) => {
        const ctx = new OAC(1, 1, info.sr || 24000);
        const p = ctx.decodeAudioData(ab, res, rej);
        if (p && p.then) p.then(res, rej);
      });
    let buf = null;
    for (const e of format() === 'ogg' ? ['ogg', 'mp3'] : ['mp3']) {
      try {
        buf = await decode(await get(BASE + id + '.' + e));
        if (buf?.length) break;
      } catch (err) {
        buf = null;
      }
    }
    if (!buf?.length) throw new Error('decode failed');
    const f = buf.getChannelData(0);
    const pcm = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) {
      const v = f[i] * 32767;
      pcm[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v | 0;
    }
    return { info, pcm, shift: markOffset(pcm, info.markAt) };
  }

  info() {
    const out = {};
    for (const [id, st] of this.state) out[id] = st.ok ? (this.ready(id) ? 'ready' : 'stale') : this.failed.has(id) ? 'failed' : 'loading';
    return { banks: out, mb: +(this.bytes / 1048576).toFixed(1), format: format(), enabled: VoiceBanks.enabled };
  }
}
/** false = every voice uses the formant synth (A/B tests); all VoiceSystems share it. */
VoiceBanks.enabled = true;
