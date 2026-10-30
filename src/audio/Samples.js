// Recorded samples (CC0 / CC-BY field recordings in public/assets/audio).
//
// The manifest (assets/audio/manifest.json) maps keys to files:
//   { "<key>": { files: ["car/door_close_1.mp3", ...], loop: bool, gain, category, credits: [...],
//                loopSamples: [n per file @44.1 kHz], lufs: [...], replaces: "handbrake:0" | "bed:..." } }
// A key is either a synth sound id (door_close), a sample-only id (gong, dog_bark_far, ...) or an
// ambience bed (amb_*). Nothing here throws: a missing manifest, a 404 or a decode failure just
// leaves the synthesized sound in place.
//
// Files are fetched and decoded lazily on first use (a small priority queue, 3 at a time) and kept
// in an LRU of decoded AudioBuffers (~128 MB). Long loops / beds decode at 32 kHz to halve memory.
// Every decoded buffer is analysed once (rms, loudest 50 ms, peak, seamless loop points) so callers
// can loudness-match it to the synthesized mix (`normGain`).
import { SOUNDS, loudnessTarget } from './Synth/registry.js';

const SRC_RATE = 44100; // rate of the source files (loopSamples are counted at this rate)
const LOOP_SR = 32000; // decode rate for loops / beds
const MAX_ACTIVE = 3;
const LAME_DELAY = 1105; // encoder priming samples, if a decoder does not trim them

// ---------------------------------------------------------------------------
// Resolution tables (sound id -> recording)
// ---------------------------------------------------------------------------
/** play/loop(id) served by another key (rate = playback-rate multiplier). */
const ALIAS = {
  engine_stall: { key: 'engine_off', rate: 0.88 },
};
/** One-shots cut from loop recordings: `beats` aligned events per loop, or a `dur` (s) slice. false = keep synth. */
const SEGMENT = {
  wiper: { beats: 6 },
  heartbeat: { beats: 8 },
  indicator_loop: { beats: 8 },
  mosquito_buzz: { dur: 3.5 },
  breath_neck: { dur: 5 },
  electric_buzz: { dur: 2.5 },
  transformer_hum: { dur: 3 },
  fluorescent_hum: { dur: 3 },
  electric_arc: { dur: 2 },
  giant_hand_rumble: { dur: 7, fadeIn: 1.2 },
  drone_low: { dur: 8, fadeIn: 1.5 },
  monk_chant: { dur: 9, fadeIn: 0.8 },
  wind_chime_loop: { dur: 6 },
  radio_static: { dur: 1.5 },
};
const DEFAULT_SEG = { dur: 4 };
/** Per-file playback-rate base (synth heartbeat rate 1 = 70 bpm; the loops are 60 and 80 bpm). */
const RATE_BASE = { heartbeat: [70 / 60, 70 / 80] };
/** Sample-only keys borrow spatial settings from a similar synth sound... */
const LIKE = {
  dog_bark_far: 'dog_bark', night_bird: 'owl', knock_window_seq: 'knock', key_remove: 'key_insert',
  engine_crank_fail: 'ignition', engine_off: 'engine_stall', engine_idle: 'engine_start', engine_rev: 'engine_start',
  car_interior_cruise: 'engine_start', handbrake_pull: 'handbrake', handbrake_release: 'handbrake', indicator_loop: 'indicator_tick',
  tyres_gravel: 'collision_thud', tyres_gravel_roll: 'collision_thud', bike_idle: 'motorbike_pass', bike_ride_away: 'motorbike_pass',
  gong: 'bell_temple', wind_chime_loop: 'wind_chime', fluorescent_hum: 'fluorescent_flicker', electric_arc: 'spark',
  breath: 'breath_neck', scream_close: 'giggle', rumble_rise: 'giant_hand_rumble', drone_low: 'giant_hand_rumble',
  rumble_sub: 'giant_hand_rumble', radio_static: 'radio_tune',
};
/** ...or from their category. */
const CAT_DEF = {
  car: { cabin: true, ref: 1.5, reverb: 0.1 },
  foley: { ref: 1, reverb: 0.1 },
  animal: { ref: 4, rolloff: 0.7, reverb: 0.4 },
  bike: { ref: 6, rolloff: 0.6, reverb: 0.35 },
  temple: { ref: 4, rolloff: 0.7, reverb: 0.45 },
  electric: { ref: 2, reverb: 0.12 },
  horror: { ref: 1.5, reverb: 0.25 },
  radio: { cabin: true, ref: 1, reverb: 0.04 },
  music: { bus: 'music', stereoCenter: true, reverb: 0.3 },
  amb: { bus: 'ambience', stereo: true, reverb: 0.1 },
};
/** Loudness targets (dBFS, loudest 50 ms RMS) for keys that are not synth ids (same scale as registry LOUD). */
const SAMPLE_LOUD = {
  dog_bark_far: -14, night_bird: -15, knock_window_seq: -16, key_remove: -24, engine_crank_fail: -12, engine_off: -14,
  engine_idle: -16, engine_rev: -12, car_interior_cruise: -20, handbrake_pull: -20, handbrake_release: -20, indicator_loop: -29,
  tyres_gravel: -18, tyres_gravel_roll: -14, bike_idle: -16, bike_ride_away: -12, gong: -12, wind_chime_loop: -22,
  fluorescent_hum: -22, electric_arc: -18, breath: -18, scream_close: -10, rumble_rise: -12, drone_low: -16, rumble_sub: -12,
  radio_static: -20, ranat_note: -16, khim_phrase: -16, khaen_phrase: -16, ching: -18,
};
const SPATIAL_KEYS = ['cabin', 'ref', 'rolloff', 'reverb', 'bus', 'stereo', 'stereoCenter'];

/** Loudness target for a requested id served by `key`. */
export function sampleLoudness(id, key) {
  if (SOUNDS[id]) return loudnessTarget(id);
  return SAMPLE_LOUD[key] ?? SAMPLE_LOUD[id] ?? -18;
}

function safePath(p) {
  return typeof p === 'string' && p.length > 0 && p.length < 200 && !/^[a-z]+:|^\/|\\|\.\./i.test(p) && /\.(mp3|ogg|wav|m4a|webm|opus|flac)$/i.test(p);
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------
/** rms, loudest 50 ms rms, peak (linear) + NaN count over all channels. */
export function analyseBuffer(buf) {
  const chs = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
  const n = buf.length;
  const w = Math.max(1, Math.floor(buf.sampleRate * 0.05));
  let s2 = 0, pk = 0, nan = 0, best = 0, win = 0, cnt = 0;
  // non-overlapping 50 ms windows + half-window offsets via two accumulators
  let win2 = 0, cnt2 = 0;
  const half = w >> 1;
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let c = 0; c < chs.length; c++) {
      const v = chs[c][i];
      if (v !== v || v === Infinity || v === -Infinity) {
        nan++;
        continue;
      }
      const a = v < 0 ? -v : v;
      if (a > pk) pk = a;
      e += v * v;
    }
    s2 += e;
    win += e;
    cnt += chs.length;
    if (i >= half) {
      win2 += e;
      cnt2 += chs.length;
    }
    if (cnt >= w * chs.length) {
      best = Math.max(best, Math.sqrt(win / cnt));
      win = cnt = 0;
    }
    if (cnt2 >= w * chs.length) {
      best = Math.max(best, Math.sqrt(win2 / cnt2));
      win2 = cnt2 = 0;
    }
  }
  if (cnt > w * chs.length * 0.5) best = Math.max(best, Math.sqrt(win / cnt));
  const rms = Math.sqrt(s2 / Math.max(1, n * chs.length));
  if (!best) best = rms;
  return { rms, st: best, peak: pk, nan };
}

/** Engine-start recordings: time (s) the engine catches (first sustained jump above the cranking level). */
export function detectCatch(buf) {
  if (buf._catch != null) return buf._catch;
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const w = Math.floor(sr * 0.05);
  const env = [];
  for (let s = 0; s + w <= d.length; s += w) {
    let e = 0;
    for (let i = s; i < s + w; i++) e += d[i] * d[i];
    env.push(10 * Math.log10(e / w + 1e-12));
  }
  // cranking baseline: median of 0.15 s .. 0.9 s
  const base = env.slice(3, 18).filter((v) => v > -90).sort((a, b) => a - b);
  const med = base.length ? base[base.length >> 1] : -30;
  let t = 1.2;
  for (let i = 8; i < env.length - 3; i++) {
    if (env[i] > med + 6 && env[i + 1] > med + 4 && env[i + 2] > med + 4) {
      t = i * 0.05;
      break;
    }
  }
  buf._catch = Math.min(t, buf.duration * 0.7);
  return buf._catch;
}

function decode(ctx, ab) {
  return new Promise((resolve, reject) => {
    try {
      const p = ctx.decodeAudioData(ab, resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    } catch (e) {
      reject(e);
    }
  });
}

// ---------------------------------------------------------------------------
// Bank
// ---------------------------------------------------------------------------
export class SampleBank {
  /** opts: { base='assets/audio/', url, maxBytes, fetch } */
  constructor(opts = {}) {
    this.base = opts.base ?? 'assets/audio/';
    this.url = opts.url ?? this.base + 'manifest.json';
    this.enabled = opts.enabled ?? true;
    this.maxBytes = opts.maxBytes ?? 128 * 1024 * 1024;
    this.entries = {};
    this.variantMap = {}; // synth id -> [key per synth variant] (manifest "replaces": "handbrake:0")
    this.state = 'idle'; // idle | loading | ready | failed
    this.error = null;
    this.cache = new Map(); // file -> rec { file, state, buf, p, bytes, pins, loop, prio }
    this.bytes = 0;
    this.queue = [];
    this.active = 0;
    this.ctx = null;
    this._loopCtx = null;
    this._last = {};
    this.stats = { fetched: 0, decoded: 0, failed: 0, evicted: 0, decodeMs: 0, plays: 0 };
    this._fetch = opts.fetch || (typeof fetch === 'function' ? (...a) => fetch(...a) : null);
    this.ready = new Promise((r) => (this._readyResolve = r));
  }

  // ---- manifest -----------------------------------------------------------
  /** Fetch + parse the manifest once. Resolves to true when usable; never rejects. */
  load() {
    if (this._loadP) return this._loadP;
    if (!this._fetch) {
      this.state = 'failed';
      this.error = 'no fetch';
      this._readyResolve(false);
      return (this._loadP = Promise.resolve(false));
    }
    this.state = 'loading';
    this._loadP = (async () => {
      try {
        const res = await this._fetch(this.url);
        if (!res || !res.ok) throw new Error(`manifest HTTP ${res?.status}`);
        this.setManifest(await res.json());
      } catch (err) {
        this.state = 'failed';
        this.error = String(err?.message || err);
      }
      this._readyResolve(this.state === 'ready');
      return this.state === 'ready';
    })();
    return this._loadP;
  }

  /** Install a manifest object directly (also used by load()). */
  setManifest(m) {
    const entries = {};
    const vmap = {};
    if (m && typeof m === 'object') {
      for (const [key, e] of Object.entries(m)) {
        if (!e || !Array.isArray(e.files) || !/^[a-z0-9_]+$/i.test(key)) continue;
        const files = e.files.filter(safePath);
        if (!files.length) continue;
        const loopSamples = Array.isArray(e.loopSamples) ? e.loopSamples : [];
        entries[key] = {
          key,
          files,
          loop: !!e.loop,
          gain: Number.isFinite(e.gain) ? e.gain : 1,
          category: e.category || '',
          credits: Array.isArray(e.credits) ? e.credits : [],
          fileCredit: Array.isArray(e.fileCredit) ? e.fileCredit : null,
          loopSamples: files.map((f) => loopSamples[e.files.indexOf(f)] || 0),
          srcRate: Number(e.sampleRate) || SRC_RATE,
          failed: new Set(),
        };
        const rep = typeof e.replaces === 'string' ? e.replaces.match(/^([a-z0-9_]+):(\d+)$/i) : null;
        if (rep && SOUNDS[rep[1]]) (vmap[rep[1]] ||= [])[Number(rep[2])] = key;
      }
    }
    this.entries = entries;
    this.variantMap = vmap;
    this.state = Object.keys(entries).length ? 'ready' : 'failed';
    if (this.state === 'failed' && !this.error) this.error = 'empty manifest';
    return this.state === 'ready';
  }

  /** Decoding context (any BaseAudioContext). */
  attach(ctx) {
    this.ctx = ctx;
  }

  get usable() {
    return this.enabled && this.state === 'ready';
  }
  /** Entry for a manifest key (or null). */
  entry(key) {
    const e = this.entries[key];
    return e && e.failed.size < e.files.length ? e : null;
  }
  /** True if `id` is a sample key or has a recording for `mode` ('play' | 'loop'). */
  covers(id, mode = 'play') {
    return !!this.resolve(id, {}, mode, true);
  }
  knows(id) {
    return this.usable && (!!this.entries[id] || !!ALIAS[id] || !!this.variantMap[id]);
  }

  /** Synth-like definition (spatial settings) for a key that has no synth def. */
  defFor(id, key) {
    if (SOUNDS[id]) return SOUNDS[id];
    if (this._defs?.[key]) return this._defs[key];
    const e = this.entries[key];
    const like = SOUNDS[LIKE[key]];
    const d = { ...(CAT_DEF[e?.category] || CAT_DEF.foley), sampleOnly: true };
    if (like) for (const k of SPATIAL_KEYS) if (like[k] !== undefined) d[k] = like[k];
    (this._defs ||= {})[key] = d;
    return d;
  }

  /**
   * How to play `id` from recordings, or null (synth). mode 'play' | 'loop'.
   * -> { key, e, idx, rate, mode: 'shot'|'segment'|'loop'|'retrigger'|'loopShot', seg }
   */
  resolve(id, opts = {}, mode = 'play', probe = false) {
    if (!this.usable || !id) return null;
    const def = SOUNDS[id];
    let key = typeof opts.sample === 'string' ? opts.sample : null;
    let rate = 1;
    let fixed = null;
    const vmap = this.variantMap[id];
    if (!key && vmap && def?.fixedVariants) {
      const v = Math.max(0, Math.min((def.vars || 1) - 1, (opts.variant ?? 0) | 0));
      if (vmap[v] && this.entry(vmap[v])) key = vmap[v];
      else if (vmap.length) return null; // the other variant has no recording: keep the pair consistent (synth)
    }
    if (!key && ALIAS[id] && this.entry(ALIAS[id].key) && !this.entry(id)) {
      key = ALIAS[id].key;
      rate = ALIAS[id].rate ?? 1;
    }
    if (!key) key = id;
    const e = this.entry(key);
    if (!e) return null;
    if (def?.fixedVariants && key === id) fixed = Math.max(0, opts.variant ?? 0) | 0;
    let m;
    if (mode === 'loop') {
      if (e.loop) m = 'loop';
      else if (!def) m = 'loopShot';
      else if (!def.loopable && def.loopInterval) m = 'retrigger';
      else return null; // designed synth buffer loop (horn, bush_scrape, ...) has no seamless recording
    } else if (e.loop) {
      const seg = SEGMENT[id] ?? SEGMENT[key];
      if (seg === false) return null;
      m = 'segment';
    } else m = 'shot';
    if (probe) return { key, e, mode: m };
    const idx = this._pickFile(id, key, e, opts, fixed, m);
    if (idx < 0) return null;
    const rb = RATE_BASE[id]?.[idx] ?? 1;
    return { id, key, e, idx, file: e.files[idx], rate: rate * rb, mode: m, seg: m === 'segment' ? SEGMENT[id] ?? SEGMENT[key] ?? DEFAULT_SEG : null };
  }

  _pickFile(id, key, e, opts, fixed, mode) {
    const n = e.files.length;
    const ok = (i) => !e.failed.has(i);
    if (fixed != null) {
      const i = fixed % n;
      return ok(i) ? i : -1;
    }
    if (opts.sampleVariant != null) {
      const i = Math.abs(opts.sampleVariant | 0) % n;
      return ok(i) ? i : -1;
    }
    if (RATE_BASE[id]) {
      // the recording whose tempo needs the least repitch
      const want = opts.rate ?? 1;
      let best = -1, bd = Infinity;
      RATE_BASE[id].forEach((b, i) => {
        const d = Math.abs(Math.log(want * b));
        if (i < n && ok(i) && d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best >= 0) return best;
    }
    if (n === 1) return ok(0) ? 0 : -1;
    // prefer decoded files, avoid immediate repeats
    const last = this._last[key] ?? -1;
    const ready = [], all = [];
    for (let i = 0; i < n; i++) {
      if (!ok(i) || i === last) continue;
      all.push(i);
      if (this.isReady(e.files[i])) ready.push(i);
    }
    const pool = ready.length ? ready : all.length ? all : ok(last) ? [last] : [];
    if (!pool.length) return -1;
    const i = pool[Math.floor(Math.random() * pool.length)];
    this._last[key] = i;
    // warm the rest of this key's variants for next time
    if (mode === 'shot') for (const f of e.files) if (!this.cache.has(f)) this._request(f, e, 2);
    return i;
  }

  // ---- buffers --------------------------------------------------------------
  isReady(file) {
    return this.cache.get(file)?.state === 'ready';
  }
  /** Decoded AudioBuffer for a resolved sample (or entry+idx), else a Promise of it (null on failure). */
  get(r, prio = 0) {
    const file = r.file ?? r.e.files[r.idx];
    const rec = this.cache.get(file);
    if (rec?.state === 'ready') {
      rec.last = ++this._tick;
      return rec.buf;
    }
    return this._request(file, r.e, prio);
  }
  /** Decoded buffer or null (never starts a load). */
  peek(file) {
    const rec = this.cache.get(file);
    return rec?.state === 'ready' ? rec.buf : null;
  }
  pin(file) {
    const rec = this.cache.get(file);
    if (rec) rec.pins++;
  }
  unpin(file) {
    const rec = this.cache.get(file);
    if (rec && rec.pins > 0) rec.pins--;
  }
  /** Forget a decoded buffer (it is re-fetched on next use). */
  drop(file) {
    const rec = this.cache.get(file);
    if (!rec || rec.state === 'loading') return;
    this.cache.delete(file);
    this.bytes -= rec.bytes || 0;
  }

  /** Loudness-matching gain for a decoded buffer: target dBFS of the loudest 50 ms ('st') or the overall rms ('rms'). */
  normGain(buf, db, mode = 'st', peakCap = 0.98) {
    const s = buf?._stats;
    if (!s || !(s.st > 1e-7)) return 1;
    const ref = mode === 'rms' ? s.rms : s.st;
    const g = Math.pow(10, db / 20) / Math.max(ref, 1e-7);
    return Math.max(0, Math.min(g, peakCap / Math.max(s.peak, 1e-6), 64));
  }

  /** Start loading every file of these ids/keys (prio 1 = soon, 2 = background). */
  prefetch(ids, prio = 1, { maxFiles = 8, loops = false } = {}) {
    if (!this.usable) return Promise.resolve([]);
    const jobs = [];
    const keys = new Set();
    for (const id of ids) {
      if (this.variantMap[id]) for (const k of this.variantMap[id]) k && keys.add(k);
      if (ALIAS[id] && !this.entries[id]) keys.add(ALIAS[id].key);
      keys.add(id);
    }
    for (const k of keys) {
      const e = this.entry(k);
      if (!e || (e.loop && !loops)) continue;
      e.files.slice(0, maxFiles).forEach((f, i) => {
        if (!e.failed.has(i)) jobs.push(Promise.resolve(this.get({ e, idx: i }, prio)));
      });
    }
    return Promise.all(jobs);
  }

  _request(file, e, prio) {
    let rec = this.cache.get(file);
    if (rec) {
      if (rec.state === 'ready') return Promise.resolve(rec.buf);
      if (rec.state === 'failed') return Promise.resolve(null);
      if (prio < rec.prio) {
        rec.prio = prio;
        this.queue.sort((a, b) => a.prio - b.prio || a.seq - b.seq);
      }
      return rec.p;
    }
    rec = { file, e, state: 'loading', buf: null, bytes: 0, pins: 0, prio, seq: (this._seq = (this._seq || 0) + 1), last: 0 };
    rec.p = new Promise((r) => (rec.resolve = r));
    this.cache.set(file, rec);
    this.queue.push(rec);
    this.queue.sort((a, b) => a.prio - b.prio || a.seq - b.seq);
    this._pump();
    return rec.p;
  }

  _pump() {
    while (this.active < MAX_ACTIVE && this.queue.length) {
      const rec = this.queue.shift();
      this.active++;
      this._load(rec).finally(() => {
        this.active--;
        this._pump();
      });
    }
  }

  _decodeCtx(loop) {
    if (!loop || !this.ctx || this.ctx.sampleRate <= LOOP_SR) return this.ctx;
    if (this._loopCtx === null) return this.ctx;
    if (!this._loopCtx) {
      try {
        const OAC = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : globalThis.webkitOfflineAudioContext;
        this._loopCtx = new OAC(1, 1, LOOP_SR);
      } catch (e) {
        this._loopCtx = null;
        return this.ctx;
      }
    }
    return this._loopCtx;
  }

  async _load(rec) {
    const { e, file } = rec;
    const idx = e.files.indexOf(file);
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    try {
      if (!this.ctx) throw new Error('no audio context');
      const res = await this._fetch(this.base + file);
      if (!res || !res.ok) throw new Error(`HTTP ${res?.status}`);
      const ab = await res.arrayBuffer();
      this.stats.fetched++;
      const long = e.loop || e.category === 'amb';
      let buf;
      try {
        buf = await decode(this._decodeCtx(long), ab.slice ? ab.slice(0) : ab);
      } catch (err) {
        if (this._decodeCtx(long) === this.ctx) throw err;
        this._loopCtx = null; // OfflineAudioContext decode unsupported here: use the main context
        buf = await decode(this.ctx, ab);
      }
      if (!buf || !buf.length) throw new Error('empty decode');
      buf._stats = analyseBuffer(buf);
      if (buf._stats.nan) throw new Error('NaN samples');
      buf._file = file;
      buf._key = e.key;
      if (e.loop) this._loopPoints(buf, e, idx);
      rec.buf = buf;
      rec.bytes = buf.length * buf.numberOfChannels * 4;
      rec.state = 'ready';
      rec.last = ++this._tick;
      this.bytes += rec.bytes;
      this.stats.decoded++;
      this.stats.decodeMs += (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
      this._evict(rec);
      rec.resolve(buf);
    } catch (err) {
      rec.state = 'failed';
      rec.error = String(err?.message || err);
      if (idx >= 0) e.failed.add(idx);
      this.stats.failed++;
      if (!this._warned) {
        this._warned = true;
        console.warn(`[audio] sample "${file}" unavailable (${rec.error}); using synthesized sound`);
      }
      rec.resolve(null);
    }
  }

  /** Seamless loop region: the manifest's loopSamples, minus encoder priming if the decoder kept it. */
  _loopPoints(buf, e, idx) {
    const L = e.loopSamples[idx];
    buf._loopStart = 0;
    buf._loopEnd = 0;
    buf._loopExtra = 0;
    if (!L) return;
    const loopDur = L / e.srcRate;
    const extra = buf.duration - loopDur;
    buf._loopExtra = extra;
    if (Math.abs(extra) < 0.004 || extra < 0) return; // decoder trimmed the gapless padding: whole buffer loops
    const lead = Math.min(extra, LAME_DELAY / e.srcRate);
    buf._loopStart = lead;
    buf._loopEnd = lead + loopDur;
  }

  _evict(keep) {
    if (this.bytes <= this.maxBytes) return;
    const recs = [...this.cache.values()].filter((r) => r.state === 'ready' && r !== keep && !r.pins).sort((a, b) => a.last - b.last);
    for (const r of recs) {
      if (this.bytes <= this.maxBytes * 0.85) break;
      this.cache.delete(r.file);
      this.bytes -= r.bytes;
      this.stats.evicted++;
    }
  }

  /** Attribution list for the credits screen: [{ key, author, title, license, licenseUrl, source }]. */
  credits() {
    const out = [];
    const seen = new Set();
    for (const e of Object.values(this.entries)) {
      for (const c of e.credits) {
        const id = c.source || c.file || `${c.author}|${c.title}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ key: e.key, author: c.author || '', title: c.title || '', license: c.license || '', licenseUrl: c.licenseUrl || '', source: c.source || '' });
      }
    }
    return out;
  }

  /** Summary for debugging / reports. */
  info() {
    return {
      state: this.state,
      error: this.error,
      enabled: this.enabled,
      keys: Object.keys(this.entries).length,
      files: Object.values(this.entries).reduce((n, e) => n + e.files.length, 0),
      cachedMB: +(this.bytes / 1048576).toFixed(1),
      queue: this.queue.length,
      ...this.stats,
      decodeMs: Math.round(this.stats.decodeMs),
    };
  }
}
SampleBank.prototype._tick = 0;
