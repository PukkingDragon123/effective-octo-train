// Audio sandbox.
//   ?sandbox=audio                 manual test board (buttons for every sound, loops, engine, music, radio, voice, ambience)
//   ?sandbox=audio&test=1          automated OfflineAudioContext render of every sound id + engine RPMs + music moods +
//                                  voice murmur + radio chunks + ambience -> window.__audioReport (+ on-screen table).
//                                  window.__audioTest is a Promise of the report.
//   ?sandbox=audio&spec=a,b,c      offline-render the listed ids (or engine@rpm, mood:name, voice, radio:n, amb) and draw
//                                  spectrograms + waveforms for visual QA.
import * as THREE from 'three';
import { audio, AudioSystem, SOUND_IDS, MOODS } from '../audio/index.js';
import { AudioCore } from '../audio/Engine.js';
import { EngineSound } from '../audio/EngineSound.js';
import { Music } from '../audio/Music.js';
import { Ambience } from '../audio/Ambience.js';
import { SOUNDS } from '../audio/Synth/registry.js';

const SR = 32000;
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
function offlineCore(dur, ch = 2) {
  const ctx = new OfflineAudioContext(ch, Math.ceil(dur * SR), SR);
  const core = new AudioCore(ctx, { sync: true });
  core.cache = sharedCache;
  core.maxCacheBytes = 1e12;
  core.spatial.setListener(0, 1.6, 0);
  core.setBusVolume('master', 0.8);
  return { ctx, core };
}

async function renderSound(id, opts = {}) {
  const def = SOUNDS[id];
  const probe = offlineCore(0.1);
  const b = probe.core.sfxBuffer(id, opts.variant ?? 0, !!opts.loop);
  const dur = Math.min(opts.loop ? 6 : 14, b.duration + 0.8);
  const { ctx, core } = offlineCore(dur);
  const spatial = !def.stereo && !def.stereoCenter && def.bus !== 'ui' && def.bus !== 'music';
  if (opts.loop) core.loop(id, { variant: opts.variant ?? 0, ...(spatial ? { position: { x: 0.8, y: 1.6, z: -2 } } : {}) });
  else core.play(id, { variant: opts.variant ?? 0, rate: 1, ...(spatial ? { position: { x: 0.8, y: 1.6, z: -2 } } : {}) });
  for (let t = 0.1; t < dur; t += 0.25) ctx.suspend(t).then(() => {
    core.update(0.25, null);
    ctx.resume();
  });
  return ctx.startRendering();
}

function fakeSys(core) {
  return { core, ambience: { state: { wetness: 0 } }, play: (id, o) => core.play(id, o), loop: (id, o) => core.loop(id, o), setMuffle: (v) => core.setMuffle(v) };
}

async function renderEngine(rpm, load, kind = 'car', speed = 0, dur = 2.5) {
  const { ctx, core } = offlineCore(dur);
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
  core.playBuffer(b, { bus: 'voice', position: { x: 0.4, y: 1.5, z: 0.8 }, muffle: false, ref: 1.1, reverb: voice.ghost ? 0.25 : 0.08 });
  return ctx.startRendering();
}

async function renderRadio(station, n = 0, ci = 1) {
  const probe = offlineCore(0.1);
  const b = probe.core.task(`radio:${station}:${n}:${ci}`, 'radioChunk', { station, n, ci });
  const { ctx, core } = offlineCore(b.duration + 0.2);
  core.playBuffer(b, { bus: 'radio', muffle: false, reverb: 0.05 });
  return ctx.startRendering();
}

async function renderAmbience(state, dur = 8) {
  const { ctx, core } = offlineCore(dur);
  const sys = fakeSys(core);
  const a = new Ambience(sys);
  sys.ambience = a;
  a._attachCore(core);
  a.set(state);
  a.cicada[0] = { phase: 'sustain', t: 30, g: 1 };
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

async function runTests(onRow) {
  const rows = [];
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
  for (const id of SOUND_IDS) {
    await add(id, () => renderSound(id));
    if (SOUNDS[id].loopable) await add(id + '[loop]', () => renderSound(id, { loop: true }));
  }
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
    b.onclick = () => {
      audio.init();
      fn(b);
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
  for (const id of SOUND_IDS) btn(sfx, id, () => audio.play(id, { position: around() }));
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
    window.__audioTest = runTests(onRow).then((rows) => {
      const bad = rows.filter((r) => r.error || r.nan || r.silent || r.clip > 20);
      window.__audioReport = { rows, bad: bad.map((r) => r.name), count: rows.length };
      return window.__audioReport;
    });
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

export { runTests, stats, renderSound, renderEngine, renderMood, renderVoice, renderRadio, renderAmbience };
