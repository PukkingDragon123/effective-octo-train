// Audio sandbox.
//   ?sandbox=audio                 manual test board (buttons for every sound, loops, engine, music, radio, voice, ambience)
//   ?sandbox=audio&test=1          automated OfflineAudioContext render of every sound id + engine RPMs + music moods +
//                                  voice murmur + radio chunks + ambience -> window.__audioReport (+ on-screen table),
//                                  then the recorded-sample check -> window.__audioSampleReport: the manifest loads,
//                                  every file fetches + decodes (duration, loudness, loop alignment, NaN), and offline
//                                  renders through the sample paths (one-shots, segments, loops, retrigger, ambience
//                                  beds, engine layers, radio static / ching / jingles, ranat notes in the music).
//                                  window.__audioTest is a Promise of the report; the sandbox only signals ready when
//                                  it is done, so give the harness time: node tools/shot.mjs --sandbox=audio
//                                  --params="test=1" --timeout=900000 --eval="return window.__audioReport"
//                                  group=sfx|sfxA|sfxB|systems|samples runs a subset; hrtf=0 = equal-power (faster);
//                                  samples=0 skips the sample check.
//   ?sandbox=audio&spec=a,b,c      offline-render the listed ids (or engine@rpm, mood:name, voice, radio:n, amb) and draw
//                                  spectrograms + waveforms for visual QA.
import * as THREE from 'three';
import { audio, AudioSystem, SOUND_IDS, MOODS } from '../audio/index.js';
import { AudioCore } from '../audio/Engine.js';
import { EngineSound } from '../audio/EngineSound.js';
import { Music } from '../audio/Music.js';
import { Ambience } from '../audio/Ambience.js';
import { Radio } from '../audio/Radio.js';
import { SampleBank, sampleLoudness, detectPitch } from '../audio/Samples.js';
import { SOUNDS } from '../audio/Synth/registry.js';

let SR = 32000;
let TEST_HRTF = true;
const D0 = 0.4; // start offset: Chrome's limiter needs a moment to settle in a fresh context
const sharedCache = new Map();

// ---------------------------------------------------------------- analysis
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j], ai = im[i + j];
        const br = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const bi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ar + br;
        im[i + j] = ai + bi;
        re[i + j + len / 2] = ar - br;
        im[i + j + len / 2] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

function mono(buf) {
  const n = buf.length;
  const m = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) m[i] += d[i] / buf.numberOfChannels;
  }
  return m;
}

function stats(buf) {
  let nan = 0, pk = 0, s2 = 0, clip = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) {
        nan++;
        continue;
      }
      const a = Math.abs(v);
      if (a > pk) pk = a;
      if (a > 0.995) clip++;
      s2 += v * v;
    }
  }
  const m = mono(buf);
  const N = 2048;
  const re = new Float64Array(N), im = new Float64Array(N);
  let num = 0, den = 0, low = 0, high = 0, tot = 0;
  // active length (above -50 dB of peak)
  let last = 0;
  for (let i = 0; i < m.length; i++) if (Math.abs(m[i]) > pk * 0.003) last = i;
  for (let f0 = 0; f0 + N <= m.length; f0 += N) {
    for (let i = 0; i < N; i++) {
      re[i] = (m[f0 + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      const f = (k * buf.sampleRate) / N;
      num += p * f;
      den += p;
      if (f < 150) low += p;
      if (f > 6000) high += p;
      tot += p;
    }
  }
  const rms = Math.sqrt(s2 / Math.max(1, buf.length * buf.numberOfChannels));
  return {
    dur: +(buf.length / buf.sampleRate).toFixed(2),
    active: +(last / buf.sampleRate).toFixed(2),
    rms: +rms.toFixed(4),
    rmsDb: +(20 * Math.log10(rms + 1e-9)).toFixed(1),
    peak: +pk.toFixed(3),
    centroid: Math.round(num / (den || 1)),
    low: +(low / (tot || 1)).toFixed(2),
    high: +(high / (tot || 1)).toFixed(2),
    nan,
    clip,
    silent: rms < 1e-4,
  };
}

// ---------------------------------------------------------------- offline renders
function offlineCore(dur, ch = 2, samples = null) {
  const ctx = new OfflineAudioContext(ch, Math.ceil(dur * SR), SR);
  const core = new AudioCore(ctx, { sync: true, samples });
  core.cache = sharedCache;
  core.maxCacheBytes = 1e12;
  core.spatial.setListener(0, 1.6, 0);
  if (!TEST_HRTF) core.spatial.hrtfCount = 1e9; // equal-power only (fast)
  core.setBusVolume('master', 0.8);
  return { ctx, core };
}

async function renderSound(id, opts = {}) {
  const def = SOUNDS[id];
  const probe = offlineCore(0.1);
  const b = probe.core.sfxBuffer(id, opts.variant ?? 0, !!opts.loop);
  const dur = Math.min(opts.loop ? 6 : 14, b.duration + 0.8) + D0;
  const { ctx, core } = offlineCore(dur);
  const spatial = !def.stereo && !def.stereoCenter && def.bus !== 'ui' && def.bus !== 'music';
  if (opts.loop) core.loop(id, { variant: opts.variant ?? 0, delay: D0, ...(spatial ? { position: { x: 0.5, y: 1.6, z: -1.2 } } : {}) });
  else core.play(id, { variant: opts.variant ?? 0, rate: 1, delay: D0, ...(spatial ? { position: { x: 0.5, y: 1.6, z: -1.2 } } : {}) });
  for (let t = 0.1; t < dur; t += 0.25) ctx.suspend(t).then(() => {
    core.update(0.25, null);
    ctx.resume();
  });
  return ctx.startRendering();
}

function fakeSys(core) {
  return { core, ambience: { state: { wetness: 0 } }, play: (id, o) => core.play(id, o), loop: (id, o) => core.loop(id, o), setMuffle: (v) => core.setMuffle(v) };
}

async function renderEngine(rpm, load, kind = 'car', speed = 0, dur = 2.5, bank = null, surface = 'asphalt') {
  const { ctx, core } = offlineCore(dur, 2, bank);
  const es = new EngineSound(fakeSys(core), kind);
  const obj = new THREE.Object3D();
  obj.position.set(0, 0.8, -1.8);
  obj.updateMatrixWorld();
  es.attach(obj);
  es._attachCore(core);
  await es._loading;
  await new Promise((r) => setTimeout(r, 0));
  es.setOn(true, { instant: true });
  es.setRPM(rpm);
  es.setLoad(load);
  es.setGear(kind === 'car' ? 2 : 1);
  es.setSpeed(speed);
  es.setSurface(surface);
  if (bank) renderEngine.last = { recIdle: !!es.recIdle, recTyre: Object.keys(es.recTyre || {}) };
  for (let i = 0; i < 40; i++) es.update(0.05);
  for (let t = 0.1; t < dur; t += 0.1) ctx.suspend(t).then(() => {
    es.update(0.1);
    core.update(0.1, null);
    ctx.resume();
  });
  return ctx.startRendering();
}

async function renderMood(mood, dur = 18) {
  const { ctx, core } = offlineCore(dur);
  const m = new Music(fakeSys(core));
  m._attachCore(core);
  m.setMood(mood, { fade: 1, delay: 0 });
  m.scheduleUntil(dur);
  return ctx.startRendering();
}

async function renderVoice(th, voice, dur = 8) {
  const { ctx, core } = offlineCore(dur);
  const b = core.task(`murmur:${th}:${JSON.stringify(voice)}`, 'murmur', { th, voice });
  core.playBuffer(b, { delay: D0, bus: 'voice', position: { x: 0.4, y: 1.5, z: 0.8 }, muffle: false, ref: 1.1, reverb: voice.ghost ? 0.25 : 0.08 });
  return ctx.startRendering();
}

async function renderRadio(station, n = 0, ci = 1) {
  const probe = offlineCore(0.1);
  const b = probe.core.task(`radio:${station}:${n}:${ci}`, 'radioChunk', { station, n, ci });
  const { ctx, core } = offlineCore(b.duration + 0.2 + D0);
  core.playBuffer(b, { delay: D0, bus: 'radio', muffle: false, reverb: 0.05 });
  return ctx.startRendering();
}

async function renderAmbience(state, dur = 8, bank = null) {
  const { ctx, core } = offlineCore(dur, 2, bank);
  const sys = fakeSys(core);
  const a = new Ambience(sys);
  sys.ambience = a;
  a._attachCore(core);
  a.set(state);
  a.cicada[0] = { phase: 'sustain', t: 30, g: 1 };
  if (bank) {
    await bank.ready;
    for (let i = 0; i < 4; i++) {
      a.update(0.25);
      await a.whenLoaded();
    }
    renderAmbience.last = a.layers();
  }
  for (let i = 0; i < 20; i++) a.update(0.25);
  for (let t = 0.1; t < dur; t += 0.25) ctx.suspend(t).then(() => {
    a.update(0.25);
    core.update(0.25, null);
    ctx.resume();
  });
  return ctx.startRendering();
}

const VOICE_LINES = [
  ['murmur_auntie', 'สวัสดีจ้ะพ่อหนุ่ม ไปตลาดเช้าหน่อยนะ', { gender: 'f', age: 58 }],
  ['murmur_ahkong', 'อีกรอบแล้วสินะ ไปได้แล้ว ไอ้หนุ่ม อย่าลืมกฎล่ะ', { gender: 'm', age: 78 }],
  ['murmur_child', 'พี่ครับ ปิดวิทยุได้ไหมครับ แม่รอผมกินข้าว', { gender: 'child', age: 9 }],
  ['murmur_ghost', 'มองหน้าฉันสิ', { gender: 'f', age: 24, ghost: 1 }],
  ['murmur_whisper', 'ไม่ต้องหันมานะลูก ขับไปเถอะ', { gender: 'm', age: 55, whisper: true }],
];

async function runTests(onRow, group = 'all') {
  const rows = [];
  const want = (g) => group === 'all' || group === g;
  const add = async (name, fn) => {
    const t0 = performance.now();
    try {
      const buf = await fn();
      const s = stats(buf);
      s.ms = Math.round(performance.now() - t0);
      rows.push({ name, ...s });
    } catch (err) {
      rows.push({ name, error: String(err?.stack || err).slice(0, 300) });
    }
    onRow?.(rows[rows.length - 1]);
  };
  const half = Math.ceil(SOUND_IDS.length / 2);
  for (let i = 0; i < SOUND_IDS.length; i++) {
    const id = SOUND_IDS[i];
    if (!want(i < half ? 'sfxA' : 'sfxB') && !want('sfx')) continue;
    await add(id, () => renderSound(id));
    if (SOUNDS[id].loopable) await add(id + '[loop]', () => renderSound(id, { loop: true }));
  }
  if (!want('systems')) return rows;
  await add('indicator_tick[retrigger]', () => renderSound('indicator_tick', { loop: true }));
  for (const [rpm, load] of [[820, 0.05], [1500, 0.3], [2500, 0.8], [4000, 0.9], [6000, 1], [3000, 0]]) await add(`engine@${rpm}/${load}`, () => renderEngine(rpm, load, 'car', rpm / 60));
  for (const rpm of [1450, 4000, 7500]) await add(`bike@${rpm}`, () => renderEngine(rpm, 0.6, 'bike', rpm / 150));
  for (const m of MOODS) if (m !== 'silence') await add(`mood:${m}`, () => renderMood(m));
  for (const [name, th, v] of VOICE_LINES) await add(name, () => renderVoice(th, v));
  for (const st of [1, 2, 3, 4]) await add(`radio:${st}`, () => renderRadio(st, 0, st === 4 ? 0 : 1));
  await add('radio:dj', () => renderRadio(1, 1, 0));
  await add('ambience:22h', () => renderAmbience({ hour: 22, wind: 0.4, nearWater: 0.5 }));
  await add('ambience:rain_in_car', () => renderAmbience({ hour: 22, rain: 0.8, insideCar: true, windowsOpen: 0 }));
  await add('ambience:dawn', () => renderAmbience({ hour: 29.6, wind: 0.2 }));
  await add('ambience:dread', () => renderAmbience({ hour: 23, dread: 1 }));
  return rows;
}

// ---------------------------------------------------------------- recorded samples
const db = (v) => +(20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);

/** One-shot / loop through AudioCore with the sample bank (buffers prefetched so playback starts synchronously). */
async function renderSample(bank, id, opts = {}) {
  const mode = opts.loop ? 'loop' : 'play';
  await bank.prefetch([id, opts.sample].filter(Boolean), 0, { loops: true, maxFiles: 12 });
  const sm = bank.resolve(id, { ...opts, sampleVariant: opts.sampleVariant }, mode);
  if (!sm) throw new Error(`no recording resolves for ${id} (${mode})`);
  const buf = await bank.get(sm, 0);
  if (!buf) throw new Error(`decode failed for ${sm.file}`);
  const segDur = sm.mode === 'segment' ? (sm.seg?.beats ? buf.duration / sm.seg.beats : sm.seg?.dur ?? 4) : buf.duration;
  const dur = Math.min(opts.loop ? 6 : 12, segDur / Math.max(0.2, sm.rate) + 0.6) + D0;
  const { ctx, core } = offlineCore(dur, 2, bank);
  const def = SOUNDS[id] || bank.defFor(id, sm.key);
  const spatial = !def.stereo && !def.stereoCenter && def.bus !== 'ui' && def.bus !== 'music';
  const o = { ...opts, delay: D0, rate: 1, ...(spatial ? { position: { x: 0.5, y: 1.6, z: -1.2 } } : {}) };
  const h = opts.loop ? core.loop(id, o) : core.play(id, o);
  for (let t = 0.1; t < dur; t += 0.25) ctx.suspend(t).then(() => {
    core.update(0.25, null);
    ctx.resume();
  });
  const out = await ctx.startRendering();
  out._info = { key: sm.key, mode: sm.mode, file: sm.file, usedSample: !!h.sample || !!h.retrigger, normDb: db(bank.normGain(buf, sampleLoudness(id, sm.key))) };
  return out;
}

async function renderRadioSamples(bank, what, dur = 6) {
  const { ctx, core } = offlineCore(dur, 2, bank);
  const r = new Radio(fakeSys(core));
  r._attachCore(core);
  await bank.ready;
  await bank.prefetch(['radio_static', 'ching', 'khaen_phrase', 'khim_phrase'], 0, { loops: true });
  await new Promise((res) => setTimeout(res, 50));
  if (what === 'static') {
    r.hour = 23;
    r.on = true;
    r.station = 3; // 03:00 station outside its hour: static + whispers
  }
  for (let t = 0.1; t < dur; t += 0.1) ctx.suspend(t).then(() => {
    r.update(0.1);
    ctx.resume();
  });
  const out = await ctx.startRendering();
  out._info = { staticRecorded: !!r.staticSrc?.buffer?._file, instruments: r.sampledInstruments || [] };
  return out;
}

async function renderMusicSamples(bank, mood = 'menu', dur = 14) {
  const { ctx, core } = offlineCore(dur, 2, bank);
  const m = new Music(fakeSys(core));
  m._attachCore(core);
  await bank.ready;
  await bank.prefetch(['ranat_note', 'ching'], 0);
  await new Promise((res) => setTimeout(res, 50));
  m.setMood(mood, { fade: 1, delay: 0 });
  m.scheduleUntil(dur);
  const out = await ctx.startRendering();
  out._info = { ranat: (m.sampled.ranat || []).map((x) => Math.round(x.f0)), ching: (m.sampled.ching || []).length };
  return out;
}

async function runSampleTests(onRow) {
  const report = { manifest: null, files: [], failed: [], loops: [], renders: [], bad: [], keys: 0 };
  const bank = new SampleBank();
  bank.maxBytes = 1024 * 1048576;
  const ok = await bank.load();
  report.manifest = bank.info();
  onRow?.({ name: `manifest ${ok ? 'ok' : 'FAILED ' + bank.error}: ${report.manifest.keys} keys / ${report.manifest.files} files`, sample: true, error: ok ? null : bank.error });
  if (!ok) {
    report.bad.push('manifest');
    return report;
  }
  bank.attach(new OfflineAudioContext(1, 1, SR));
  // 1) every file fetches + decodes; measure, then release it
  const t0 = performance.now();
  const jobs = [];
  for (const e of Object.values(bank.entries)) {
    e.files.forEach((file, idx) => {
      jobs.push(Promise.resolve(bank.get({ e, idx }, 1)).then((buf) => {
        if (!buf) {
          report.failed.push(file);
          return;
        }
        const st = buf._stats;
        const row = { key: e.key, file, dur: +buf.duration.toFixed(2), ch: buf.numberOfChannels, sr: buf.sampleRate, rmsDb: db(st.rms), stDb: db(st.st), peak: +st.peak.toFixed(3), nan: st.nan };
        if (e.loop && e.loopSamples[idx]) {
          row.loopExtraMs = +((buf._loopExtra || 0) * 1000).toFixed(1);
          row.loopRegion = buf._loopEnd ? [+buf._loopStart.toFixed(4), +buf._loopEnd.toFixed(4)] : 'whole';
          report.loops.push({ file, extraMs: row.loopExtraMs, region: row.loopRegion });
        }
        if (row.rmsDb < -70 || row.nan) report.bad.push(file);
        report.files.push(row);
        bank.drop(file);
      }));
    });
  }
  await Promise.all(jobs);
  report.decodeMs = Math.round(performance.now() - t0);
  report.keys = Object.keys(bank.entries).length;
  report.failed.forEach((f) => report.bad.push(f));
  onRow?.({ name: `decoded ${report.files.length}/${report.manifest.files} files in ${report.decodeMs} ms, ${report.failed.length} failed`, sample: true, error: report.failed.length ? report.failed.join(' ') : null });

  // 2) offline renders through the sample paths
  const add = async (name, fn, check) => {
    const t1 = performance.now();
    let row;
    try {
      const buf = await fn();
      row = { name, ...stats(buf), ms: Math.round(performance.now() - t1), ...(buf._info || {}) };
      const why = check?.(row);
      if (why) row.error = why;
    } catch (err) {
      row = { name, error: String(err?.stack || err).slice(0, 300) };
    }
    if (row.error || row.nan || row.silent || row.clip > 20) report.bad.push(name);
    report.renders.push(row);
    onRow?.(row);
  };
  const used = (r) => (r.usedSample ? null : 'synth was used');
  for (const [id, o] of [
    ['door_close', {}], ['door_open', {}], ['handbrake', { variant: 0 }], ['handbrake', { variant: 1 }], ['engine_start', {}], ['engine_stall', {}],
    ['gecko', {}], ['dog_bark', {}], ['owl', {}], ['footstep_gravel', {}], ['footstep_asphalt', {}], ['knock', {}], ['whisper', {}], ['bell_temple', {}],
    ['wiper', {}], ['heartbeat', {}], ['mosquito_buzz', {}], ['gong', {}], ['dog_bark_far', {}], ['scream_close', {}],
  ]) await add(`rec:${id}${o.variant != null ? '#' + o.variant : ''}`, () => renderSample(bank, id, o), used);
  for (const id of ['heartbeat', 'wiper', 'monk_chant', 'breath_neck', 'electric_buzz', 'indicator_tick', 'giant_hand_rumble']) await add(`rec:${id}[loop]`, () => renderSample(bank, id, { loop: true }), used);
  const recBeds = (r) => {
    const L = renderAmbience.last || [];
    const recOn = L.filter((l) => l.mode === 'rec' && l.rec.some((x) => x.state === 'on'));
    r.bedsRec = recOn.map((l) => l.slot).join(' ');
    r.bedsSynth = L.filter((l) => l.mode === 'synth' && l.level > 0.001).map((l) => l.slot).join(' ');
    return recOn.length ? null : 'no recorded bed playing';
  };
  await add('rec:ambience:22h', () => renderAmbience({ hour: 22, wind: 0.4, nearWater: 0.5 }, 8, bank), recBeds);
  await add('rec:ambience:01h_dense', () => renderAmbience({ hour: 25, wind: 0.3, forestDensity: 1.4 }, 8, bank), recBeds);
  await add('rec:ambience:rain_in_car', () => renderAmbience({ hour: 22, rain: 0.8, insideCar: true, windowsOpen: 0 }, 8, bank), recBeds);
  await add('rec:ambience:light_rain_outside', () => renderAmbience({ hour: 23, rain: 0.25, wind: 0.5 }, 8, bank), recBeds);
  await add('rec:ambience:dawn', () => renderAmbience({ hour: 29.6, wind: 0.2 }, 8, bank), recBeds);
  await add('rec:ambience:dread', () => renderAmbience({ hour: 23, dread: 1 }, 8, bank), recBeds);
  const eng = (r) => {
    Object.assign(r, renderEngine.last || {});
    return null;
  };
  await add('rec:engine@820 (recorded idle)', () => renderEngine(820, 0.05, 'car', 0, 2.5, bank), eng);
  await add('rec:engine@2500 gravel 60', () => renderEngine(2500, 0.6, 'car', 60, 2.5, bank, 'gravel'), eng);
  await add('rec:engine@3000 asphalt 80', () => renderEngine(3000, 0.5, 'car', 80, 2.5, bank, 'asphalt'), eng);
  await add('rec:bike@1450 (recorded idle)', () => renderEngine(1450, 0.05, 'bike', 0, 2.5, bank), eng);
  await add('rec:radio static', () => renderRadioSamples(bank, 'static'), (r) => (r.staticRecorded ? null : 'synth static'));
  await add('rec:radio luk thung (ching)', async () => {
    await renderRadioSamples(bank, 'register', 0.5);
    const { ctx, core } = offlineCore(9, 2, bank);
    const b = core.task('radioS:1:0:1', 'radioChunk', { station: 1, n: 0, ci: 1 });
    core.playBuffer(b, { delay: D0, bus: 'radio', muffle: false, reverb: 0.05 });
    return ctx.startRendering();
  });
  await add('rec:radio dj jingle (khaen)', async () => {
    const { ctx, core } = offlineCore(9, 2, bank);
    const b = core.task('radioS:1:1:0', 'radioChunk', { station: 1, n: 1, ci: 0 });
    core.playBuffer(b, { delay: D0, bus: 'radio', muffle: false, reverb: 0.05 });
    return ctx.startRendering();
  });
  await add('rec:mood:menu (ranat)', () => renderMusicSamples(bank, 'menu'), (r) => (r.ranat?.length ? null : 'no ranat samples'));
  await add('rec:mood:nostalgic (ching)', () => renderMusicSamples(bank, 'nostalgic'), (r) => (r.ching ? null : 'no ching samples'));
  report.bank = bank.info();
  report.coverage = {
    play: SOUND_IDS.filter((id) => bank.covers(id, 'play')).length,
    loop: SOUND_IDS.filter((id) => SOUNDS[id].loopable || SOUNDS[id].loopInterval).filter((id) => bank.covers(id, 'loop')).length,
    synthOnly: SOUND_IDS.filter((id) => !bank.covers(id, 'play')),
  };
  return report;
}

// ---------------------------------------------------------------- spectrogram view
function drawSpec(canvas, buf, label, st) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.fillStyle = '#05070a';
  g.fillRect(0, 0, W, H);
  const m = mono(buf);
  const N = 1024;
  const sr = buf.sampleRate;
  const specH = H - 40;
  const cols = W;
  const hop = Math.max(1, Math.floor((m.length - N) / cols));
  const re = new Float64Array(N), im = new Float64Array(N);
  const img = g.createImageData(W, specH);
  const fmin = 30, fmax = sr / 2;
  for (let x = 0; x < cols; x++) {
    const s = x * hop;
    for (let i = 0; i < N; i++) {
      re[i] = (m[s + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fft(re, im);
    for (let y = 0; y < specH; y++) {
      const f = fmin * Math.pow(fmax / fmin, 1 - y / specH);
      const k = Math.min(N / 2 - 1, Math.max(1, Math.round((f * N) / sr)));
      const p = re[k] * re[k] + im[k] * im[k];
      const db = 10 * Math.log10(p + 1e-14) - 20 * Math.log10(N / 4); // ~dBFS
      const v = Math.max(0, Math.min(1, (db + 95) / 80));
      const o = (y * W + x) * 4;
      img.data[o] = 255 * Math.min(1, v * 1.8);
      img.data[o + 1] = 255 * Math.max(0, Math.min(1, v * 1.6 - 0.35));
      img.data[o + 2] = 255 * Math.max(0, Math.min(1, 0.5 * v + (v > 0.8 ? (v - 0.8) * 4 : 0)));
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // frequency gridlines
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.font = '9px monospace';
  for (const f of [100, 300, 1000, 3000, 10000]) {
    const y = specH * (1 - Math.log(f / fmin) / Math.log(fmax / fmin));
    g.fillRect(0, y, W, 1);
    g.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), 2, y - 2);
  }
  // waveform
  g.fillStyle = '#9fd6a0';
  for (let x = 0; x < W; x++) {
    let mx = 0;
    const s0 = Math.floor((x / W) * m.length), s1 = Math.floor(((x + 1) / W) * m.length);
    for (let i = s0; i < s1; i++) mx = Math.max(mx, Math.abs(m[i]));
    const h = mx * 18;
    g.fillRect(x, specH + 20 - h, 1, Math.max(1, h * 2));
  }
  g.fillStyle = '#fff';
  g.font = '11px monospace';
  g.fillText(`${label}  ${st.dur}s rms ${st.rmsDb}dB pk ${st.peak} c ${st.centroid}Hz`, 4, 12);
}

async function renderSpec(name) {
  if (name.startsWith('engine@')) {
    const [rpm, load] = name.slice(7).split('/').map(Number);
    return renderEngine(rpm, load ?? 0.5, 'car', rpm / 60);
  }
  if (name.startsWith('bike@')) return renderEngine(Number(name.slice(5)), 0.6, 'bike', 30);
  if (name.startsWith('mood:')) return renderMood(name.slice(5), 16);
  if (name.startsWith('radio:')) {
    const [st, n, ci] = name.slice(6).split('/').map(Number);
    return renderRadio(st, n || 0, ci ?? 1);
  }
  if (name.startsWith('voice:')) {
    const L = VOICE_LINES.find((l) => l[0] === name.slice(6)) || VOICE_LINES[0];
    return renderVoice(L[1], L[2]);
  }
  if (name.startsWith('amb:')) {
    const h = Number(name.slice(4)) || 22;
    return renderAmbience({ hour: h, wind: 0.4, nearWater: 0.5 });
  }
  const [id, v] = name.split('#');
  const loop = id.endsWith('[loop]');
  return renderSound(loop ? id.slice(0, -6) : id, { variant: Number(v) || 0, loop });
}

// ---------------------------------------------------------------- UI
function el(tag, css, parent, text) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

function manualBoard(root, cameraRig) {
  const wrap = el('div', 'position:fixed;inset:0;overflow:auto;padding:14px 18px;color:#e9dcc4;font:12px/1.35 system-ui,sans-serif;background:rgba(6,8,10,0.86);z-index:5', root);
  el('div', 'font:600 18px Cormorant Garamond,serif;letter-spacing:.06em;margin-bottom:6px', wrap, "DON'T LOOK BACK IN HORROR — audio board");
  const status = el('div', 'opacity:.7;margin-bottom:8px', wrap, 'click anything to start audio');
  const section = (title) => {
    el('div', 'margin:10px 0 4px;font-weight:600;color:#d8b46a', wrap, title);
    return el('div', 'display:flex;flex-wrap:wrap;gap:4px', wrap);
  };
  const btn = (parent, label, fn) => {
    const b = el('button', 'background:#1b2226;color:#e9dcc4;border:1px solid #3a464c;border-radius:3px;padding:3px 7px;font:11px monospace;cursor:pointer', parent, label);
    b.onclick = (e) => {
      audio.init();
      fn(b, e);
      status.textContent = `ctx ${audio.ctx?.state} · voices ${audio.core?.voices.length} · cache ${(audio.core?.cacheBytes / 1e6).toFixed(1)} MB`;
    };
    return b;
  };
  const slider = (parent, label, min, max, val, step, fn) => {
    const l = el('label', 'display:inline-flex;align-items:center;gap:4px;margin-right:10px', parent, label);
    const s = el('input', 'width:120px', l);
    Object.assign(s, { type: 'range', min, max, value: val, step });
    s.oninput = () => {
      audio.init();
      fn(Number(s.value));
    };
    return s;
  };
  const around = () => {
    const a = Math.random() * Math.PI * 2;
    const d = 2 + Math.random() * 6;
    return { x: Math.cos(a) * d, y: 1.4, z: Math.sin(a) * d };
  };
  const sfx = section('one-shots (random position around you; shift-click = centred)');
  for (const id of SOUND_IDS) btn(sfx, id, (b, e) => audio.play(id, e?.shiftKey ? {} : { position: around() }));
  const loops = section('loops (toggle)');
  const live = {};
  for (const id of SOUND_IDS.filter((i) => SOUNDS[i].loopable || SOUNDS[i].loopInterval)) {
    btn(loops, id, (b) => {
      if (live[id]) {
        live[id].stop(0.4);
        live[id] = null;
        b.style.background = '#1b2226';
      } else {
        live[id] = audio.loop(id, { position: { x: 1.5, y: 1.5, z: -2 } });
        b.style.background = '#47361a';
      }
    });
  }
  const eng = section('engine');
  const carObj = new THREE.Object3D();
  carObj.position.set(0, 0.8, -1.8);
  carObj.updateMatrixWorld();
  audio.engineSound.attach(carObj);
  audio.bikeSound.attach(carObj);
  btn(eng, 'car on', () => audio.engineSound.setOn(true));
  btn(eng, 'car off', () => audio.engineSound.setOn(false));
  btn(eng, 'stall', () => audio.engineSound.setOn(false, { stall: true }));
  btn(eng, 'bike on', () => audio.bikeSound.setOn(true, { instant: true }));
  btn(eng, 'bike off', () => audio.bikeSound.setOn(false));
  slider(eng, 'rpm', 600, 6500, 820, 10, (v) => {
    audio.engineSound.setRPM(v);
    audio.bikeSound.setRPM(v * 1.4);
  });
  slider(eng, 'load', 0, 1, 0, 0.01, (v) => {
    audio.engineSound.setLoad(v);
    audio.bikeSound.setLoad(v);
  });
  slider(eng, 'km/h', 0, 120, 0, 1, (v) => {
    audio.engineSound.setSpeed(v);
    audio.bikeSound.setSpeed(v);
  });
  for (const s of ['asphalt', 'gravel', 'grass']) btn(eng, s, () => audio.engineSound.setSurface(s));
  const mus = section('music');
  for (const m of MOODS) btn(mus, m, () => audio.music.setMood(m));
  const rad = section('radio');
  btn(rad, 'on/off', () => audio.radio.setOn(!audio.radio.on));
  btn(rad, 'next', () => audio.radio.next());
  for (const n of [1, 2, 3, 4]) btn(rad, 'st ' + n, () => audio.radio.setStation(n));
  btn(rad, '03:30', () => audio.radio.setHour(27.5));
  slider(rad, 'ghost static', 0, 1, 0, 0.01, (v) => audio.radio.setStatic(v));
  const radObj = new THREE.Object3D();
  radObj.position.set(0, 0.8, -0.6);
  radObj.updateMatrixWorld();
  audio.radio.attach(radObj);
  const vo = section('voice');
  for (const [name, th, v] of VOICE_LINES) btn(vo, name, () => audio.voice.speak({ th, voice: v, position: { x: 0.4, y: 1.5, z: 1 } }));
  el('span', 'opacity:.7;margin-left:8px', vo, `Thai OS voice: ${audio.voice.hasThaiVoice ? 'yes' : 'no'} (settings.voice)`);
  const amb = section('ambience');
  btn(amb, 'start', () => audio.ambience.set({ enabled: true }));
  btn(amb, 'stop', () => audio.ambience.set({ enabled: false }));
  slider(amb, 'hour', 21, 30, 22, 0.1, (v) => audio.ambience.set({ hour: v }));
  slider(amb, 'rain', 0, 1, 0, 0.01, (v) => audio.ambience.set({ rain: v }));
  slider(amb, 'wind', 0, 1, 0.3, 0.01, (v) => audio.ambience.set({ wind: v }));
  slider(amb, 'dread', 0, 1, 0, 0.01, (v) => audio.ambience.set({ dread: v }));
  slider(amb, 'water', 0, 1, 0, 0.01, (v) => audio.ambience.set({ nearWater: v }));
  slider(amb, 'lights', 0, 1, 0, 0.01, (v) => audio.ambience.set({ nearLights: v }));
  btn(amb, 'in car', () => audio.ambience.set({ insideCar: true, windowsOpen: 0 }));
  btn(amb, 'window open', () => audio.ambience.set({ insideCar: true, windowsOpen: 1 }));
  btn(amb, 'outside', () => audio.ambience.set({ insideCar: false }));
  for (const e of ['forest', 'garage', 'shrine']) btn(amb, 'env ' + e, () => audio.setEnvironment(e));
  return wrap;
}

function reportTable(root) {
  const wrap = el('div', 'position:fixed;inset:0;overflow:hidden;padding:8px 10px;color:#e9dcc4;font:10px/1.18 monospace;background:#07090b;z-index:5;columns:3;column-gap:14px', root);
  el('div', 'font-weight:700;color:#d8b46a;margin-bottom:3px', wrap, 'offline audio test (name dur rmsDb peak centroid flags)');
  return (r) => {
    let flags = '';
    if (r.error) flags = ' ERROR';
    else {
      if (r.nan) flags += ' NaN';
      if (r.silent) flags += ' SILENT';
      if (r.clip > 20) flags += ' CLIP' + r.clip;
    }
    if (r.sample && !r.error) {
      el('div', 'white-space:pre;color:#d8b46a', wrap, r.name);
      return;
    }
    const line = r.error ? `${r.name} ERROR ${r.error.slice(0, 60)}` : `${r.name.padEnd(26)} ${String(r.dur).padStart(5)}s ${String(r.rmsDb).padStart(6)} ${r.peak.toFixed(2)} ${String(r.centroid).padStart(5)}Hz${flags}`;
    el('div', `white-space:pre;color:${flags ? '#ff8070' : '#cfd8c8'}`, wrap, line);
  };
}

export default async function ({ engine, cameraRig, params }) {
  engine.scene.background = new THREE.Color(0x050608);
  const eye = new THREE.Object3D();
  eye.position.set(0, 1.6, 0);
  engine.scene.add(eye);
  cameraRig.attach(eye);
  const root = document.getElementById('ui') || document.body;
  if (params.get('spec')) {
    specView(root, params);
    return;
  }
  // (the shot harness always adds test=1; use board=1 to screenshot the manual board instead)
  if (params.get('test') === '1' && params.get('board') !== '1') {
    const onRow = reportTable(root);
    if (params.get('sr')) SR = Number(params.get('sr'));
    if (params.get('hrtf') === '0') TEST_HRTF = false;
    const group = params.get('group') || 'all';
    window.__audioTest = (async () => {
      const rows = group === 'samples' ? [] : await runTests(onRow, group);
      const bad = rows.filter((r) => r.error || r.nan || r.silent || r.clip > 20);
      window.__audioReport = { rows, bad: bad.map((r) => r.name), count: rows.length };
      if ((group === 'all' || group === 'samples') && params.get('samples') !== '0') {
        try {
          window.__audioSampleReport = await runSampleTests(onRow);
        } catch (err) {
          window.__audioSampleReport = { bad: ['exception'], error: String(err?.stack || err) };
        }
        const sr = window.__audioSampleReport;
        window.__audioReport.samples = { ok: !sr.bad?.length, bad: sr.bad, files: sr.files?.length, failed: sr.failed?.length, renders: sr.renders?.length, coverage: sr.coverage };
      }
      return window.__audioReport;
    })();
    // the harness's eval runs once the sandbox resolves: finish the report first
    await window.__audioTest;
    return;
  }
  manualBoard(root, cameraRig);
}

function specView(root, params) {
  {
    const names = params.get('spec').split(',');
    const grid = el('div', 'position:fixed;inset:0;display:grid;grid-template-columns:repeat(' + (Number(params.get('cols')) || 2) + ',1fr);gap:4px;padding:4px;background:#000;z-index:5', root);
    const cw = Math.floor((innerWidth - 12) / (Number(params.get('cols')) || 2));
    const ch = Math.floor((innerHeight - 8) / Math.ceil(names.length / (Number(params.get('cols')) || 2))) - 4;
    window.__audioTest = (async () => {
      const out = [];
      for (const n of names) {
        const c = el('canvas', 'width:100%;height:100%', grid);
        c.width = cw;
        c.height = ch;
        try {
          const buf = await renderSpec(n);
          const st = stats(buf);
          drawSpec(c, buf, n, st);
          out.push({ name: n, ...st });
        } catch (err) {
          out.push({ name: n, error: String(err?.stack || err).slice(0, 400) });
        }
      }
      window.__audioReport = out;
      return out;
    })();
  }
}

export { runTests, runSampleTests, stats, renderSound, renderSample, renderEngine, renderMood, renderVoice, renderRadio, renderAmbience };
