// Voice sandbox: every character's lines through the voice system (OS Thai TTS or the formant murmur) and the
// voice rack (src/audio/VoiceFX.js), at their own ghost level and at forced ghost levels.
//   ?sandbox=voices            board: click a line to hear it live (positions match the taxi: back seat, radio,
//                              outside mirror, your own voice), switch auto / murmur, inside / outside the car,
//                              and play the offline renders.
//   ?sandbox=voices&test=1     (the shot harness always adds test=1) offline QA: each line is rendered through the
//                              full chain (rack -> voice bus -> master limiter) in an OfflineAudioContext with HRTF,
//                              then measured: BS.1770 integrated loudness, short-term max, sample / 4x true peak,
//                              NaN, silence, and compared with music moods, ambience and SFX rendered through the
//                              same master (raw, and as mixed with default settings + the dialogue duck).
//                              -> window.__voiceReport; spectrograms on screen. board=1 shows the board instead.
//   node tools/shot.mjs --sandbox=voices --out=.shots/voices.png --timeout=900000 --eval="return window.__voiceReport"
import * as THREE from 'three';
import { audio, AudioSystem } from '../audio/index.js';
import { settings } from '../core/Settings.js';
import { CHARACTERS, PASSENGERS, INTRO_GARAGE, SPECIAL_BROADCASTS } from '../game/data/index.js';
import { renderMood, renderAmbience, renderSound } from './audio.js';

const SR = 44100;
const sharedCache = new Map();

// listener = the driver's eyes; positions relative to it (taxi: driver at +X, rear seats behind, radio front-left low)
const EYE = [0, 1.6, 0];
const SPOTS = {
  backSeat: [-0.45, 1.55, 0.85], // rear left: behind, over your left shoulder
  backRight: [0.05, 1.55, 0.8], // straight behind you
  radio: [-0.42, 1.18, -0.78],
  mirror: [-1.35, 1.42, -0.95], // outside the left window
  garage: [0.9, 1.62, -1.6], // standing in front
  self: [0, 1.6, 0.04],
};

// ------------------------------------------------------------------------------------------- lines
function walk(x, out, depth = 0) {
  if (!x || depth > 9) return;
  if (Array.isArray(x)) {
    for (const y of x) walk(y, out, depth + 1);
    return;
  }
  if (typeof x !== 'object') return;
  if (typeof x.th === 'string' && x.who && !x.choice) out.push(x);
  for (const k in x) if (k !== 'th' && k !== 'en') walk(x[k], out, depth + 1);
}
const speakable = (l) => l.th.length >= 6 && l.th.length <= 80 && !/^[\s.…]*$/.test(l.th) && l.tone !== 'thought';

function collectCast() {
  const cast = [];
  const C = CHARACTERS;
  const pick = (lines, n = 3) => {
    const ok = lines.filter(speakable);
    const out = [];
    const special = ok.find((l) => l.tone === 'ghost') || ok.find((l) => l.tone === 'whisper');
    const shout = ok.find((l) => l.tone === 'shout' || l.tone === 'sing');
    for (const l of [ok[0], special, shout, ok[Math.floor(ok.length / 2)], ok[ok.length - 1]]) if (l && !out.includes(l) && out.length < n) out.push(l);
    return out;
  };
  const ak = [];
  walk(INTRO_GARAGE, ak);
  cast.push({ id: 'ahKong', name: C.ahKong.nameEN, voice: C.ahKong.voice, spot: 'garage', lines: pick(ak.filter((l) => l.who === 'ahKong')) });
  for (const ride of PASSENGERS) {
    const ch = C[ride.characterId];
    if (!ch) continue;
    const all = [];
    walk(ride.dialogue, all);
    const mine = all.filter((l) => l.who === 'passenger' || l.who === ride.characterId);
    cast.push({ id: ch.id, name: ch.nameEN, voice: ch.voice, spot: 'backSeat', lines: pick(mine) });
    if (!cast.find((c) => c.id === 'player')) {
      const pl = all.filter((l) => l.who === 'player');
      if (pl.length) cast.unshift({ id: 'player', name: C.player.nameEN, voice: C.player.voice, spot: 'self', self: true, lines: pick(pl, 2) });
    }
  }
  const radio = [];
  walk(SPECIAL_BROADCASTS, radio);
  cast.push({ id: 'radio', name: 'Radio announcer', voice: C.radio?.voice || { gender: 'm', age: 45 }, spot: 'radio', fx: 'radio', lines: radio.filter(speakable).slice(0, 3) });
  cast.push({ id: 'counter', name: 'Counting ghost (outside)', voice: { gender: 'f', age: 50, ghost: 0.9, whisper: true, pitch: 0.85, rate: 0.7 }, spot: 'mirror', outside: true, lines: [{ th: 'หนึ่ง... สอง... สาม... ข้ามถนน', tone: 'whisper' }] });
  cast.push({ id: 'phone', name: 'Phone call (fx test)', voice: { gender: 'f', age: 52 }, spot: 'radio', fx: 'phone', lines: [{ th: 'ฮัลโหล ลูก ถึงไหนแล้ว แม่รออยู่นะ' }] });
  return cast.filter((c) => c.lines.length);
}

// ------------------------------------------------------------------------------------------- loudness
function kFilter(sr) {
  // ITU-R BS.1770-4 K-weighting (shelf + RLB high-pass) for any sample rate
  let K = Math.tan((Math.PI * 1681.974450955533) / sr);
  const Vh = Math.pow(10, 3.999843853973347 / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let Q = 0.7071752369554196;
  let a0 = 1 + K / Q + K * K;
  const s1 = { b0: (Vh + (Vb * K) / Q + K * K) / a0, b1: (2 * (K * K - Vh)) / a0, b2: (Vh - (Vb * K) / Q + K * K) / a0, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  K = Math.tan((Math.PI * 38.13547087602444) / sr);
  Q = 0.5003270373238773;
  a0 = 1 + K / Q + K * K;
  const s2 = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [s1, s2];
}
function biq(x, c) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}
/** Integrated loudness (LUFS, gated), short-term max (3 s), momentary max (400 ms). */
function loudness(buf) {
  const sr = buf.sampleRate;
  const [s1, s2] = kFilter(sr);
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(biq(biq(buf.getChannelData(c), s1), s2));
  const ms = (start, len) => {
    let e = 0;
    for (const y of chans) for (let i = start; i < start + len; i++) e += y[i] * y[i];
    return e / len;
  };
  const L = (z) => -0.691 + 10 * Math.log10(z + 1e-20);
  const blk = Math.floor(0.4 * sr), hop = Math.floor(0.1 * sr);
  const zs = [];
  for (let s = 0; s + blk <= buf.length; s += hop) zs.push(ms(s, blk));
  const abs = zs.filter((z) => L(z) > -70);
  const mean = (a) => a.reduce((p, q) => p + q, 0) / Math.max(1, a.length);
  const rel = L(mean(abs)) - 10;
  const gated = abs.filter((z) => L(z) > rel);
  const st = [];
  const sb = Math.floor(3 * sr);
  for (let s = 0; s + sb <= buf.length; s += Math.floor(sr * 0.5)) st.push(L(ms(s, sb)));
  return {
    lufs: gated.length ? +L(mean(gated)).toFixed(1) : -99,
    stMax: st.length ? +Math.max(...st).toFixed(1) : null,
    momMax: zs.length ? +L(Math.max(...zs)).toFixed(1) : -99,
  };
}
function peaks(buf) {
  let pk = 0, tp = 0, nan = 0, clip = 0;
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
      if (a >= 0.999) clip++;
      // 4x oversampled estimate (cubic Hermite between samples) for inter-sample peaks
      if (i > 0 && i + 2 < d.length) {
        const p0 = d[i - 1], p1 = v, p2 = d[i + 1], p3 = d[i + 2];
        for (let k = 1; k < 4; k++) {
          const t = k / 4;
          const h = p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
          if (Math.abs(h) > tp) tp = Math.abs(h);
        }
      }
    }
  }
  const db = (x) => +(20 * Math.log10(x + 1e-12)).toFixed(1);
  return { peakDb: db(pk), truePeakDb: db(Math.max(tp, pk)), nan, clip };
}

// ------------------------------------------------------------------------------------------- offline renders
function offlineSystem(dur, muffle) {
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  const sys = new AudioSystem({ offline: true });
  sys.attachContext(ctx, { sync: true });
  sys.core.cache = sharedCache;
  sys.core.maxCacheBytes = 1e12;
  sys.core.setBusVolume('master', 0.8);
  for (const b of ['music', 'sfx', 'ambience', 'voice', 'ui', 'radio']) sys.core.setBusVolume(b, 1);
  sys.core.spatial.setListener(EYE[0], EYE[1], EYE[2]);
  sys.setMuffle(muffle);
  sys.core.setMuffle(muffle, 0.001);
  return { ctx, sys };
}

const speakerObj = (spot) => {
  const o = new THREE.Object3D();
  o.position.fromArray(SPOTS[spot] || SPOTS.backSeat);
  o.updateMatrixWorld(true);
  return o;
};

/** Render one line through AudioSystem.voice (offline = the formant path + the rack). */
async function renderLine(item, muffle = 1) {
  const line = { th: item.th, voice: item.voice, tone: item.tone, fx: item.fx, outside: item.outside, self: item.self, object: item.self ? null : speakerObj(item.spot), position: item.self ? { x: SPOTS.self[0], y: SPOTS.self[1], z: SPOTS.self[2] } : null };
  // probe: render the layers (cached) to know the length
  const probe = offlineSystem(0.1, muffle);
  const d = probe.sys.voice._desc(line);
  const t0 = performance.now();
  const b = probe.sys.core.task(probe.sys.voice._key(d, 'murmur'), 'voiceLine', probe.sys.voice._args(d, 'murmur'), 0);
  const genMs = performance.now() - t0;
  const dur = b.duration + 2.4;
  const { ctx, sys } = offlineSystem(dur, muffle);
  const p = sys.voice.speak(line);
  for (let t = 0.05; t < dur; t += 0.05) {
    ctx.suspend(t).then(() => {
      sys.update(0.05);
      ctx.resume();
    });
  }
  const out = await ctx.startRendering();
  p.catch(() => {});
  return { buf: out, meta: b._meta, genMs };
}

// ------------------------------------------------------------------------------------------- spectrogram
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
        const a = i + j, b = a + len / 2;
        const br = re[b] * cr - im[b] * ci, bi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - br;
        im[b] = im[a] - bi;
        re[a] += br;
        im[a] += bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}
function drawSpec(canvas, buf, label) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const sr = buf.sampleRate;
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const N = 1024;
  const img = g.createImageData(W, H - 14);
  const re = new Float64Array(N), im = new Float64Array(N);
  const fmax = 9000, fmin = 60;
  for (let x = 0; x < W; x++) {
    const s = Math.floor((x / W) * (L.length - N));
    for (let i = 0; i < N; i++) {
      re[i] = ((L[s + i] + R[s + i]) * 0.5) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fft(re, im);
    for (let y = 0; y < H - 14; y++) {
      const f = fmin * Math.pow(fmax / fmin, 1 - y / (H - 14));
      const k = Math.max(1, Math.min(N / 2 - 1, Math.round((f * N) / sr)));
      const db = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-14) - 20 * Math.log10(N / 4);
      const v = Math.max(0, Math.min(1, (db + 90) / 75));
      const o = (y * W + x) * 4;
      img.data[o] = 255 * Math.min(1, v * 1.7);
      img.data[o + 1] = 255 * Math.max(0, Math.min(1, v * 1.5 - 0.4));
      img.data[o + 2] = 255 * Math.max(0, Math.min(1, 0.45 * v + (v > 0.8 ? (v - 0.8) * 3 : 0)));
      img.data[o + 3] = 255;
    }
  }
  g.fillStyle = '#05070a';
  g.fillRect(0, 0, W, H);
  g.putImageData(img, 0, 14);
  // stereo balance strip (where the voice sits: left / right) under the label
  for (let x = 0; x < W; x++) {
    const s0 = Math.floor((x / W) * L.length), s1 = Math.floor(((x + 1) / W) * L.length);
    let el = 0, er = 0;
    for (let i = s0; i < s1; i++) {
      el += L[i] * L[i];
      er += R[i] * R[i];
    }
    const bal = (er - el) / (er + el + 1e-12);
    g.fillStyle = `hsl(${bal > 0 ? 200 : 20}, 70%, ${20 + Math.abs(bal) * 50}%)`;
    g.fillRect(x, 11, 1, 3);
  }
  g.fillStyle = '#e9dcc4';
  g.font = '10px monospace';
  g.fillText(label, 3, 9);
}

// ------------------------------------------------------------------------------------------- QA
async function runQA(root, params) {
  const wrap = el('div', 'position:fixed;inset:0;overflow:auto;padding:6px 8px;background:#07090b;color:#d8d0c0;font:10px/1.25 monospace;z-index:5', root);
  el('div', 'color:#d8b46a;font-weight:700', wrap, 'voices — offline QA (full chain: rack -> voice bus -> master limiter; HRTF; in the cabin)');
  const tbl = el('div', 'white-space:pre', wrap);
  const grid = el('div', 'display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:4px', wrap);
  const cast = collectCast();
  const C = CHARACTERS;
  const items = [];
  const add = (name, c, l, extra = {}) => {
    const { voice: ev, ...rest } = extra;
    items.push({ name, th: l.th, tone: l.tone, voice: { ...c.voice, ...(ev || {}) }, spot: c.spot, fx: c.fx, outside: c.outside, self: c.self, ...rest });
  };
  for (const c of cast) add(c.id, c, c.lines[0]);
  const wl = cast.find((c) => c.id === 'womanWhite');
  if (wl?.lines[1]) add('womanWhite#2', wl, wl.lines[1]);
  // the same line at rising ghost levels
  const sl = { th: 'ต้น... พ่อรออยู่นะลูก กลับบ้านกันเถอะ' };
  const som = { voice: C.somchai.voice, spot: 'backRight' };
  for (const g of [0, 0.35, 0.7, 1]) add(`somchai ghost ${g}`, som, sl, { voice: { ghost: g } });
  add('somchai shout', som, { th: 'ต้น! อย่าหันมา!', tone: 'shout' }, { voice: { ghost: 0 } });
  const only = params.get('only');
  const list = only ? items.filter((i) => i.name.includes(only)) : items;
  const rows = [];
  const head = 'line                       LUFS  momMax  pk dB  TP dB   dur  gen ms  flags   (short lines: read momMax)';
  tbl.textContent = head + '\n';
  const offline = [];
  for (const it of list) {
    try {
      const r = await renderLine(it, 1);
      const lo = loudness(r.buf);
      const pk = peaks(r.buf);
      const row = { name: it.name, th: it.th, ghost: it.voice.ghost ?? 0, ...lo, ...pk, dur: +r.buf.duration.toFixed(2), genMs: Math.round(r.genMs), layout: r.meta.layout.join('+') };
      row.silent = lo.lufs < -60;
      rows.push(row);
      offline.push({ name: it.name, buf: r.buf });
      const flags = `${pk.nan ? ' NaN' : ''}${pk.clip ? ' CLIP' + pk.clip : ''}${row.silent ? ' SILENT' : ''} ${row.layout}`;
      tbl.textContent += `${it.name.padEnd(25)} ${String(lo.lufs).padStart(6)} ${String(lo.momMax).padStart(7)} ${String(pk.peakDb).padStart(6)} ${String(pk.truePeakDb).padStart(6)} ${String(row.dur).padStart(5)} ${String(row.genMs).padStart(6)} ${flags}\n`;
      if (grid.children.length < 9) {
        const cv = el('canvas', 'width:100%;height:110px', grid);
        cv.width = 300;
        cv.height = 110;
        drawSpec(cv, r.buf, `${it.name}  ${lo.lufs} LUFS`);
      }
    } catch (err) {
      rows.push({ name: it.name, error: String(err?.stack || err).slice(0, 300) });
      tbl.textContent += `${it.name.padEnd(25)} ERROR ${String(err).slice(0, 80)}\n`;
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  // references through the same master: music, ambience, SFX
  const refs = [];
  if (params.get('refs') !== '0') {
    const ref = async (name, bus, fn) => {
      try {
        const b = await fn();
        refs.push({ name, bus, ...loudness(b), ...peaks(b) });
      } catch (err) {
        refs.push({ name, bus, error: String(err).slice(0, 200) });
      }
    };
    await ref('music dread', 'music', () => renderMood('dread', 16));
    await ref('music nostalgic', 'music', () => renderMood('nostalgic', 16));
    await ref('music tension', 'music', () => renderMood('tension', 16));
    await ref('ambience 23h', 'ambience', () => renderAmbience({ hour: 23, wind: 0.4, nearWater: 0.3 }, 8));
    await ref('sfx door_close', 'sfx', () => renderSound('door_close'));
    await ref('sfx knock', 'sfx', () => renderSound('knock'));
  }
  // as mixed: bus volume settings (taper = v^2) and the dialogue duck (-35 % on music / ambience / radio)
  const tap = (k) => 20 * Math.log10(Math.max(1e-4, Math.min(1.5, settings.get(k) ?? 1) ** 2));
  const mixDb = { voice: tap('volVoice'), music: tap('volMusic') + 20 * Math.log10(0.65), ambience: tap('volAmbience') + 20 * Math.log10(0.65), sfx: tap('volSfx') };
  const ok = rows.filter((r) => !r.error && !r.silent);
  const living = ok.filter((r) => r.ghost < 0.3 && !/phone|radio|counter/.test(r.name));
  const med = (a) => {
    const s = [...a].sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  };
  const voiceMed = med(living.map((r) => r.lufs));
  for (const r of refs) {
    if (r.error) continue;
    r.mixedLufs = +(r.lufs + (mixDb[r.bus] ?? 0)).toFixed(1);
    r.voiceMinus = voiceMed != null ? +(voiceMed + mixDb.voice - r.mixedLufs).toFixed(1) : null;
  }
  tbl.textContent += '\nreference (same master)      LUFS  stMax  TP dB  as mixed  voice-ref LU\n';
  for (const r of refs) tbl.textContent += r.error ? `${r.name} ERROR ${r.error}\n` : `${r.name.padEnd(26)} ${String(r.lufs).padStart(6)} ${String(r.stMax).padStart(6)} ${String(r.truePeakDb).padStart(6)} ${String(r.mixedLufs).padStart(8)} ${String(r.voiceMinus).padStart(8)}\n`;
  const bad = rows.filter((r) => r.error || r.nan || r.clip || r.silent || r.truePeakDb > -0.1).map((r) => r.name);
  const ghostRows = ok.filter((r) => r.ghost >= 0.3);
  const report = {
    rows,
    refs,
    bad,
    voiceMedianLufs: voiceMed,
    ghostMedianLufs: med(ghostRows.map((r) => r.lufs)),
    maxTruePeakDb: Math.max(...ok.map((r) => r.truePeakDb)),
    mixDb,
  };
  tbl.textContent += `\nliving median ${report.voiceMedianLufs} LUFS · ghost median ${report.ghostMedianLufs} LUFS · max true peak ${report.maxTruePeakDb} dBTP · bad: ${bad.join(', ') || 'none'}\n`;
  window.__voiceReport = report;
  window.__voiceOffline = offline;
  return report;
}

// ------------------------------------------------------------------------------------------- board
function el(tag, css, parent, text) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

function board(root, engine) {
  const wrap = el('div', 'position:fixed;inset:0;overflow:auto;padding:14px 18px;color:#e9dcc4;font:12px/1.4 system-ui,sans-serif;background:rgba(6,8,10,0.92);z-index:5', root);
  el('div', 'font:600 18px serif;margin-bottom:4px', wrap, 'หลอนยันปลายทาง — voices');
  const status = el('div', 'opacity:.75;margin-bottom:8px;white-space:pre-wrap', wrap, 'click anything to start audio');
  const objs = {};
  for (const [k, p] of Object.entries(SPOTS)) {
    const o = new THREE.Object3D();
    o.name = k === 'mirror' ? 'mirrorLeft' : k === 'radio' ? 'radioKnob' : k;
    o.position.fromArray(p);
    engine.scene.add(o);
    o.updateMatrixWorld(true);
    objs[k] = o;
  }
  const refresh = () => {
    const i = audio.voice.info();
    status.textContent = `voice setting: ${i.mode} · OS Thai voices: ${i.thaiVoices.join(', ') || 'none (formant murmur)'}${i.broken.length ? ' · skipped: ' + i.broken.join(', ') : ''}\nmale → ${i.male || '-'} · female → ${i.female || '-'} · last line: ${i.lastPath || '-'} · speaking ${i.speaking} · car ${audio.muffle > 0.5 ? 'closed (inside)' : 'open / outside'}`;
  };
  const btn = (parent, label, fn, css = '') => {
    const b = el('button', 'background:#1b2226;color:#e9dcc4;border:1px solid #3a464c;border-radius:3px;padding:4px 8px;font:12px sans-serif;cursor:pointer;text-align:left;' + css, parent, label);
    b.onclick = () => {
      audio.init();
      fn(b);
      setTimeout(refresh, 50);
    };
    return b;
  };
  const top = el('div', 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px', wrap);
  btn(top, 'voice: auto (OS Thai TTS if present)', () => settings.set('voice', 'auto'));
  btn(top, 'voice: murmur (formant)', () => settings.set('voice', 'murmur'));
  btn(top, 'in the closed car', () => audio.setMuffle(1));
  btn(top, 'outside / window open', () => audio.setMuffle(0));
  btn(top, 'stop', () => audio.voice.stop());
  const speak = (c, l, ghost) => {
    const voice = { ...c.voice, ...(ghost != null ? { ghost } : {}) };
    const tone = ghost != null && ghost >= 0.6 && !l.tone ? 'ghost' : l.tone;
    audio.voice.speak({ th: l.th, en: l.en, voice, tone, fx: c.fx, outside: c.outside, self: c.self, object: c.self ? null : objs[c.spot], position: c.self ? { x: 0, y: 1.6, z: 0.04 } : null });
  };
  for (const c of collectCast()) {
    const row = el('div', 'margin:8px 0 2px', wrap);
    el('span', 'color:#d8b46a;font-weight:600', row, `${c.name} `);
    el('span', 'opacity:.6', row, `(${c.voice.gender}, ${c.voice.age}, pitch ${c.voice.pitch ?? 1}, rate ${c.voice.rate ?? 1}, ghost ${c.voice.ghost ?? 0}${c.voice.whisper ? ', whisper' : ''}) · ${c.spot}${c.fx ? ' · ' + c.fx : ''}`);
    const lines = el('div', 'display:flex;flex-wrap:wrap;gap:4px', wrap);
    for (const l of c.lines) btn(lines, `${l.tone ? '[' + l.tone + '] ' : ''}${l.th}`, () => speak(c, l));
    const gl = el('div', 'display:flex;gap:4px;margin-top:2px', wrap);
    for (const gv of [0, 0.35, 0.7, 1]) btn(gl, `ghost ${gv}`, () => speak(c, c.lines[0], gv), 'font-size:11px;padding:2px 6px;opacity:.85');
  }
  const off = el('div', 'margin-top:12px', wrap);
  el('div', 'color:#d8b46a;font-weight:600', off, 'offline renders (run ?test=1 first in this tab: plays the exact measured buffer)');
  const offRow = el('div', 'display:flex;flex-wrap:wrap;gap:4px', off);
  btn(offRow, 'render QA now (takes a while)', async () => {
    const r = await runQA(el('div', 'display:none', wrap), new URLSearchParams('refs=0'));
    for (const o of window.__voiceOffline || []) btn(offRow, '▶ ' + o.name, () => audio.playBuffer(o.buf, { bus: 'voice', reverb: 0 }));
    status.textContent += `\nQA: living ${r.voiceMedianLufs} LUFS, ghosts ${r.ghostMedianLufs} LUFS, max TP ${r.maxTruePeakDb} dBTP`;
  });
  refresh();
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.addEventListener?.('voiceschanged', refresh);
  window.__voices = { speak, info: () => audio.voice.info() };
}

export default async function ({ engine, cameraRig, params }) {
  engine.scene.background = new THREE.Color(0x050608);
  const eye = new THREE.Object3D();
  eye.position.fromArray(EYE);
  engine.scene.add(eye);
  cameraRig.attach(eye);
  const root = document.getElementById('ui') || document.body;
  if (params.get('test') === '1' && params.get('board') !== '1') {
    window.__voiceTest = runQA(root, params).catch((err) => {
      window.__voiceReport = { bad: ['exception'], error: String(err?.stack || err) };
      console.error(err);
    });
    await window.__voiceTest;
    return;
  }
  board(root, engine);
}

export { runQA, renderLine, loudness, peaks, collectCast };
