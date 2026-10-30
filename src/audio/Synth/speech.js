// Thai-cadence speech murmur: rough Thai orthographic syllabification, tone
// assignment from consonant class + tone marks + live/dead syllables, and a
// formant-synth phrase renderer (voiced, whispered, ghostly, sung).
import { VoxScore, renderVox, vowelParams } from './vox.js';
import { rngFrom, hashStr, clamp, alloc, mixInto, bakeVerb, reverse, normalize, SVF, Wander, TAU, fadeIn, fadeOut } from './dsp.js';

// ---------------------------------------------------------------------------
// Thai orthography
// ---------------------------------------------------------------------------
const isCons = (c) => c >= 'ก' && c <= 'ฮ';
const LEAD = 'เแโใไ';
const ABOVE = 'ัิีึืุู็ํ';
const FOLLOW = 'ะาำๅ';
const TONES = '่้๊๋';
const SILENT = '์';
const MID = 'กจฎฏดตบปอ';
const HIGH = 'ขฃฉฐถผฝศษสห';
const ONSET = {
  ก: 'k', ข: 'kh', ฃ: 'kh', ค: 'kh', ฅ: 'kh', ฆ: 'kh', ง: 'ng', จ: 'c', ฉ: 'ch', ช: 'ch', ซ: 's', ฌ: 'ch', ญ: 'y',
  ฎ: 'd', ฏ: 't', ฐ: 'th', ฑ: 'th', ฒ: 'th', ณ: 'n', ด: 'd', ต: 't', ถ: 'th', ท: 'th', ธ: 'th', น: 'n', บ: 'b', ป: 'p',
  ผ: 'ph', ฝ: 'f', พ: 'ph', ฟ: 'f', ภ: 'ph', ม: 'm', ย: 'y', ร: 'r', ล: 'l', ว: 'w', ศ: 's', ษ: 's', ส: 's', ห: 'h',
  ฬ: 'l', อ: '', ฮ: 'h',
};
const FINAL = {};
for (const c of 'กขคฆ') FINAL[c] = 'k';
for (const c of 'จชซฎฏฐฑฒดตถทธศษส') FINAL[c] = 't';
for (const c of 'บปพฟภ') FINAL[c] = 'p';
for (const c of 'ญณนรลฬ') FINAL[c] = 'n';
FINAL['ม'] = 'm';
FINAL['ง'] = 'ng';
FINAL['ว'] = 'w';
FINAL['ย'] = 'y';
const STOP_FINAL = { k: 1, t: 1, p: 1 };

function newSyl() {
  return { lead: '', onset: [], marks: '', tone: '', finals: [] };
}

/**
 * Split Thai text into phrases of rough syllables.
 * Returns [{ sylls: [{onset, vowel, long, coda, tone}], pause }]
 */
export function parseThai(text) {
  const phrases = [];
  let sylls = [];
  let cur = newSyl();
  const flush = () => {
    if (cur.onset.length || cur.lead || cur.marks) sylls.push(finishSyl(cur));
    cur = newSyl();
  };
  const endPhrase = (pause) => {
    flush();
    if (sylls.length) phrases.push({ sylls, pause });
    else if (phrases.length) phrases[phrases.length - 1].pause = Math.max(phrases[phrases.length - 1].pause, pause);
    sylls = [];
  };
  const chars = [...(text || '')];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const nx = chars[i + 1] || '';
    const hasVowel = !!cur.marks || !!cur.lead;
    if (LEAD.includes(c)) {
      if (cur.onset.length || cur.marks) flush();
      cur.lead = c;
    } else if (isCons(c)) {
      if (SILENT === nx) {
        i++;
        continue;
      }
      const nxIsVowel = ABOVE.includes(nx) || FOLLOW.includes(nx) || TONES.includes(nx);
      if (!cur.onset.length) {
        cur.onset.push(c);
      } else if (cur.finals.length) {
        flush();
        cur.onset.push(c);
      } else if (!cur.marks && !(cur.lead && cur.onset.length && !nxIsVowel && c !== 'อ' && c !== 'ย')) {
        // onset present, no vowel yet
        if ('รลว'.includes(c) && nxIsVowel && cur.onset.length === 1) cur.onset.push(c); // cluster
        else if (cur.onset.length === 1 && cur.onset[0] === 'ห' && 'งญนมยรลว'.includes(c) && !cur.lead) cur.onset.push(c); // ห นำ
        else if (c === 'อ' && !cur.lead) cur.marks += 'อ'; // อ as vowel ɔɔ
        else if (c === 'ว' && !nxIsVowel && !cur.lead) cur.marks += 'ัว'; // ัว (ua) without the mai han-akat
        else if (cur.lead && (c === 'อ' || c === 'ย')) cur.marks += c; // เ-อ, เ-ีย
        else if (nxIsVowel || cur.lead) {
          if (cur.lead) cur.onset.push(c); // e.g. lead + cluster
          else {
            flush();
            cur.onset.push(c);
          }
        } else {
          cur.finals.push(c); // implicit vowel o: คน
        }
      } else {
        // vowel present
        if (c === 'อ' || (c === 'ย' && cur.marks.includes('ี')) || (c === 'ว' && cur.marks.includes('ั') && !nxIsVowel)) {
          cur.marks += c;
        } else if (nxIsVowel) {
          flush();
          cur.onset.push(c);
        } else {
          cur.finals.push(c);
        }
      }
    } else if (ABOVE.includes(c) || FOLLOW.includes(c)) {
      cur.marks += c;
      if (c === 'ะ' || c === 'ำ') {
        /* syllable closes */
      }
    } else if (TONES.includes(c)) {
      cur.tone = c;
    } else if (c === 'ๆ') {
      flush();
      if (sylls.length) sylls.push({ ...sylls[sylls.length - 1] });
    } else if (c === ' ' || c === '\n' || c === '\t') {
      endPhrase(0.18);
    } else if (',;:'.includes(c)) {
      endPhrase(0.3);
    } else if ('.!?…'.includes(c)) {
      endPhrase(nx === '.' || c === '…' ? 0.6 : 0.45);
    } else if (/[A-Za-z0-9]/.test(c)) {
      // latin word / digits: approximate by vowel groups
      let word = c;
      while (i + 1 < chars.length && /[A-Za-z0-9]/.test(chars[i + 1])) word += chars[++i];
      flush();
      const groups = Math.max(1, (word.match(/[aeiouy]+/gi) || []).length + (/\d/.test(word) ? word.length : 0));
      for (let g = 0; g < groups; g++) sylls.push({ onset: ['t', 'k', 'n', 's', 'm'][g % 5], vowel: ['a', 'e', 'o', 'i'][g % 4], long: false, coda: '', tone: g === groups - 1 ? 'F' : 'M' });
    }
  }
  endPhrase(0.35);
  return phrases;
}

function finishSyl(s) {
  const m = s.marks;
  const L = s.lead;
  let vowel = 'o', long = false, offglide = '';
  const has = (ch) => m.includes(ch);
  if (L === 'เ') {
    if (has('า')) { vowel = 'a'; long = false; offglide = 'w'; }
    else if (has('ี') && has('ย')) { vowel = 'i'; long = true; offglide = 'schwa'; }
    else if (has('ื') && has('อ')) { vowel = 'ue'; long = true; offglide = 'schwa'; }
    else if (has('อ') || has('ิ')) { vowel = 'oe'; long = true; }
    else { vowel = 'e'; long = !has('ะ') && !has('็'); }
  } else if (L === 'แ') { vowel = 'ae'; long = !has('ะ') && !has('็'); }
  else if (L === 'โ') { vowel = 'o'; long = !has('ะ'); }
  else if (L === 'ใ' || L === 'ไ') { vowel = 'a'; long = false; offglide = 'y'; }
  else if (has('ำ')) { vowel = 'a'; long = false; offglide = 'm'; }
  else if (has('ั') && has('ว')) { vowel = 'u'; long = true; offglide = 'schwa'; }
  else if (has('ั')) { vowel = 'a'; long = false; }
  else if (has('า') || has('ๅ')) { vowel = 'a'; long = true; }
  else if (has('ะ')) { vowel = 'a'; long = false; }
  else if (has('ี')) { vowel = 'i'; long = true; }
  else if (has('ิ')) { vowel = 'i'; long = false; }
  else if (has('ื')) { vowel = 'ue'; long = true; }
  else if (has('ึ')) { vowel = 'ue'; long = false; }
  else if (has('ู')) { vowel = 'u'; long = true; }
  else if (has('ุ')) { vowel = 'u'; long = false; }
  else if (has('อ')) { vowel = 'or'; long = true; }
  else if (s.finals.length) { vowel = 'o'; long = false; }
  else { vowel = 'a'; long = false; }
  let coda = s.finals.length ? FINAL[s.finals[0]] || 'n' : '';
  if (offglide === 'y' || offglide === 'w' || offglide === 'm') coda = coda || offglide;
  const first = s.onset[0] || 'อ';
  let cls = MID.includes(first) ? 'mid' : HIGH.includes(first) ? 'high' : 'low';
  if (first === 'ห' && s.onset.length > 1) cls = 'high';
  const dead = STOP_FINAL[coda] || (!coda && !long && !offglide);
  let tone = 'M';
  const tm = s.tone;
  if (tm === '่') tone = cls === 'low' ? 'F' : 'L';
  else if (tm === '้') tone = cls === 'low' ? 'H' : 'F';
  else if (tm === '๊') tone = 'H';
  else if (tm === '๋') tone = 'R';
  else if (dead) tone = cls === 'low' ? (long ? 'F' : 'H') : 'L';
  else tone = cls === 'high' ? 'R' : 'M';
  let onset = ONSET[first] ?? '';
  if (first === 'ห' && s.onset.length > 1) onset = ONSET[s.onset[1]] ?? '';
  const cluster = s.onset.length > 1 && first !== 'ห' ? ONSET[s.onset[1]] || '' : '';
  return { onset, cluster, vowel, long, coda, glide: offglide === 'schwa' ? 'schwa' : '', tone };
}

// ---------------------------------------------------------------------------
// Prosody + rendering
// ---------------------------------------------------------------------------
// tone contours in semitones: [start, middle, end]
const TONE_SHAPES = {
  M: [0, -0.2, -0.6],
  L: [-1.6, -2.4, -3.2],
  F: [1.0, 2.2, -3.8],
  H: [0.6, 1.6, 3.4],
  R: [-1.2, -2.4, 2.8],
};

/** Voice presets → base f0, formant scale. */
export function voicePreset(v = {}) {
  const g = v.gender || 'm';
  const age = v.age ?? (g === 'child' ? 9 : 40);
  let f0 = g === 'f' ? 205 : g === 'child' ? 285 : 112;
  let fs = g === 'f' ? 1.16 : g === 'child' ? 1.3 : 1.0;
  if (g !== 'child' && age > 55) {
    f0 *= g === 'f' ? 0.86 : 1.04;
  }
  const old = clamp((age - 50) / 35);
  f0 *= v.pitch ?? 1;
  return {
    f0,
    fs,
    rate: v.rate ?? 1,
    jitter: 0.008 + old * 0.025 + (v.ghost ? 0.01 : 0),
    shimmer: 0.05 + old * 0.12,
    breath: 0.06 + old * 0.12 + (g === 'f' ? 0.05 : 0),
    ghost: clamp(v.ghost ?? 0),
    whisper: !!v.whisper,
    sing: !!v.sing,
  };
}

const PLOSIVE = { k: [1800, 2.0], t: [4200, 1.5], p: [900, 1.0], c: [3200, 1.5], kh: [1800, 1.2], th: [4200, 1.2], ph: [1000, 0.9], ch: [3200, 1.3], b: [800, 1], d: [3500, 1.2] };
const ASPIRATED = { kh: 1, th: 1, ph: 1, ch: 1 };
const FRIC = { s: [6200, 2.5, 0.75], f: [3800, 0.8, 0.35], h: [0, 0, 0] };
const SONOR = {
  m: { F1: 260, F2: 1000, F3: 2300, nas: 1 },
  n: { F1: 260, F2: 1500, F3: 2600, nas: 1 },
  ng: { F1: 260, F2: 2000, F3: 2700, nas: 1 },
  l: { F1: 360, F2: 1150, F3: 2700 },
  r: { F1: 420, F2: 1300, F3: 1900 },
  w: { F1: 300, F2: 650, F3: 2300 },
  y: { F1: 270, F2: 2200, F3: 3000 },
};

/**
 * Build a VoxScore for a list of phrases. Returns {score, dur}.
 * opts: { f0, rate, sing:{notes:[midi], beat}, emphasis }
 */
export function buildSpeechScore(phrases, preset, rng, opts = {}) {
  const sc = new VoxScore({ f0: preset.f0, av: 0 });
  const rate = clamp(preset.rate * (opts.rate ?? 1), 0.4, 2.2);
  const toneDepth = (opts.toneDepth ?? 1) * (preset.whisper ? 0.5 : 1);
  const fr = opts.fric ?? (preset.whisper ? 0.45 : 1); // frication scale (chant / whisper are softer)
  sc.rest(0.04);
  let pi = 0;
  for (const ph of phrases) {
    const N = ph.sylls.length;
    // breath before a phrase after a long pause
    if (pi > 0 && ph.pausePrev > 0.3 && !preset.whisper) {
      sc.seg(0.18 / rate, { av: 0, ah: 0.12, af: 0, F1: 500, F2: 1400 }, { ah: 0.02 });
    }
    for (let si = 0; si < N; si++) {
      const sy = ph.sylls[si];
      const prog = N > 1 ? si / (N - 1) : 0;
      const decl = 1.2 - prog * 2.4; // declination (semitones)
      const isLast = si === N - 1;
      const stretch = (isLast ? 1.35 : 1) * (0.88 + rng() * 0.24) / rate;
      const base = preset.f0 * Math.pow(2, (decl + (rng() - 0.5) * 0.8) / 12);
      const shape = TONE_SHAPES[sy.tone] || TONE_SHAPES.M;
      const st = (k) => base * Math.pow(2, (shape[k] * toneDepth) / 12);
      const vp = vowelParams(sy.vowel);
      const amp = (isLast ? 0.85 : 1) * (0.85 + rng() * 0.3);
      // onset
      const on = sy.onset;
      if (PLOSIVE[on]) {
        const [ff, fq] = PLOSIVE[on];
        sc.seg(0.045 * stretch, { av: on === 'b' || on === 'd' ? 0.12 : 0, ah: 0, af: 0, f0: st(0) });
        sc.seg(0.012, { af: 0.9 * amp * fr, ff, fq, ...vp }, { af: 0.2 * fr });
        if (ASPIRATED[on]) sc.seg(0.05 * stretch, { af: 0.15 * fr, ah: 0.5 * amp, ff }, { ah: 0.3, af: 0 });
        else sc.seg(0.006, { af: 0, ah: 0 });
      } else if (FRIC[on] && on !== 'h') {
        const [ff, fq, fa] = FRIC[on];
        sc.seg(0.085 * stretch, { av: 0, ah: 0, af: fa * amp * fr, ff, fq, f0: st(0), ...vp }, { af: fa * 0.7 * amp * fr });
      } else if (on === 'h') {
        sc.seg(0.06 * stretch, { av: 0, af: 0, ah: 0.6 * amp, f0: st(0), ...vp }, { ah: 0.45 * amp });
      } else if (SONOR[on]) {
        sc.seg(0.055 * stretch, { av: 0.55 * amp, ah: 0, af: 0, f0: st(0), nas: 0, ...SONOR[on] }, { av: 0.6 * amp });
      } else {
        // glottal onset
        sc.seg(0.02, { av: 0, ah: 0, af: 0, f0: st(0), ...vp });
      }
      if (sy.cluster && SONOR[sy.cluster]) sc.seg(0.03 * stretch, { av: 0.6 * amp, af: 0, ah: 0, nas: 0, ...SONOR[sy.cluster] });
      // vowel nucleus with tone contour
      const vdur = (sy.long ? 0.2 : 0.095) * stretch;
      sc.seg(vdur * 0.5, { av: 1.0 * amp, ah: 0, af: 0, nas: 0, f0: st(0), ...vp }, { f0: st(1) }, 'smooth');
      const vEnd = sy.glide ? vowelParams(sy.glide) : vp;
      sc.seg(vdur * 0.5, {}, { f0: st(2), av: (sy.coda && STOP_FINAL[sy.coda] ? 0.9 : 0.8) * amp, ...vEnd }, 'smooth');
      // coda
      const cd = sy.coda;
      if (STOP_FINAL[cd]) {
        const tgt = cd === 'k' ? { F2: 1700, F3: 2200 } : cd === 't' ? { F2: 1700, F3: 2700 } : { F2: 900, F1: 300 };
        sc.seg(0.03 * stretch, tgt, { av: 0 });
      } else if (cd === 'm' || cd === 'n' || cd === 'ng') {
        sc.seg(0.075 * stretch, { ...SONOR[cd], av: 0.55 * amp }, { av: 0.4 * amp, f0: st(2) * 0.98 });
        sc.seg(0.02, {}, { av: 0 });
      } else if (cd === 'w' || cd === 'y') {
        sc.seg(0.07 * stretch, { ...SONOR[cd], av: 0.7 * amp }, { av: 0.3 * amp });
        sc.seg(0.02, {}, { av: 0 });
      } else {
        sc.seg(0.035 * stretch, {}, { av: 0 });
      }
      // micro gap between syllables
      sc.seg(0.012 / rate, { av: 0, af: 0, ah: 0 });
    }
    const pause = (ph.pause ?? 0.2) / rate;
    sc.rest(pause);
    pi++;
    const next = phrases[pi];
    if (next) next.pausePrev = pause;
  }
  return sc;
}

/**
 * Render a Thai line to a murmur buffer (mono Float32Array).
 * voice: {gender, age, pitch, rate, ghost, whisper}
 */
export function renderMurmur(sr, th, voice = {}, seed = null) {
  const preset = voicePreset(voice);
  const rng = rngFrom(seed ?? hashStr(th + JSON.stringify(voice)));
  const phrases = parseThai(th);
  if (!phrases.length) phrases.push({ sylls: [{ onset: '', vowel: 'schwa', long: true, coda: 'm', tone: 'M' }], pause: 0.2 });
  const ghost = preset.ghost;
  if (ghost > 0) {
    preset.f0 *= 1 - ghost * 0.22;
    preset.rate *= 1 - ghost * 0.22;
    preset.fs *= 1 - ghost * 0.06;
  }
  const score = buildSpeechScore(phrases, preset, rng, { toneDepth: 1 - ghost * 0.3 });
  let out = renderVox(sr, score, {
    rng,
    formantScale: preset.fs,
    jitter: preset.jitter,
    shimmer: preset.shimmer,
    breath: preset.breath + ghost * 0.15,
    whisper: preset.whisper,
    drift: 0.25 + ghost * 0.6,
  });
  // gentle "behind the mouth" darkening so it reads as a murmur, not clear speech
  const lp = new SVF(sr, preset.whisper ? 5200 : 4200, 0.6);
  for (let i = 0; i < out.length; i++) out[i] = lp.process(out[i]);
  if (ghost > 0) out = ghostify(sr, out, ghost, rng);
  normalize(out, 0.8);
  fadeIn(out, sr, 0.01);
  fadeOut(out, sr, 0.05);
  return { buffer: out, duration: out.length / sr, phrases };
}

/** Ghost processing: granular smear, sub-octave shadow, reverse-tail reverb (pre-echo). */
export function ghostify(sr, a, amount, rng) {
  const pre = Math.floor(0.6 * sr * amount);
  const n = a.length + pre + Math.floor(1.2 * sr * amount);
  const out = new Float32Array(n);
  // dry, slightly delayed by `pre`
  mixInto(out, a, pre, 1 - amount * 0.25);
  // granular smear: grains copied with random time jitter and slight pitch variation
  const g = Math.floor(0.06 * sr);
  const hop = Math.floor(g / 3);
  const smear = new Float32Array(a.length + g * 4);
  for (let p = 0; p < a.length; p += hop) {
    const jit = Math.floor((rng() - 0.5) * 0.12 * sr * amount);
    const ratio = 1 - rng() * 0.08 * amount;
    for (let i = 0; i < g; i++) {
      const w = 0.5 - 0.5 * Math.cos((TAU * i) / g);
      const src = p + Math.floor(i * ratio);
      const dst = p + i + jit + g;
      if (src < a.length && dst >= 0 && dst < smear.length) smear[dst] += a[src] * w * 0.5;
    }
  }
  mixInto(out, smear, pre - g, amount * 0.55);
  // reverse-tail reverb: reverb of the reversed signal, reversed again => swells into words
  const rev = bakeVerb(reverse(a), sr, { room: 0.9, damp: 0.5, wet: 1, dry: 0, tail: 0.6 * amount + 0.2 });
  const swell = reverse(rev);
  mixInto(out, swell, pre - (swell.length - a.length), amount * 0.7);
  // forward tail
  const tail = bakeVerb(a, sr, { room: 0.85, damp: 0.6, wet: 1, dry: 0, tail: 1.2 * amount });
  mixInto(out, tail, pre, amount * 0.35);
  // slow "breathing" amplitude wobble
  const w = new Wander(rng, 2.5);
  for (let i = 0; i < n; i++) if ((i & 63) === 0) {
    const m = 1 + w.next(64 / sr) * 0.25 * amount;
    for (let k = 0; k < 64 && i + k < n; k++) out[i + k] *= m;
  }
  return out;
}

/**
 * Sung line (luk thung / ballad vocal) on a melody: notes [{t, dur, midi, syl?}].
 * Returns mono buffer. Melisma ornaments (เอื้อน) and vibrato on long notes.
 */
export function renderSung(sr, notes, voice = {}, seed = 1) {
  const preset = voicePreset(voice);
  const rng = rngFrom(seed);
  const total = notes.reduce((m, n) => Math.max(m, n.t + n.dur), 0) + 0.4;
  const sc = new VoxScore({ f0: 200, av: 0 });
  let t = 0;
  const vowels = ['a', 'o', 'oe', 'ae', 'u', 'i', 'or', 'a', 'e'];
  const ons = ['n', 'm', 'l', 'k', 'r', 'th', 'ch', 'w', 'y', 'h', 's', 'p', ''];
  for (const nt of notes) {
    if (nt.t > t) {
      sc.rest(nt.t - t);
      t = nt.t;
    }
    const f = 440 * Math.pow(2, (nt.midi - 69) / 12);
    const vp = vowelParams(nt.vowel || rng.pick(vowels));
    const on = nt.onset ?? rng.pick(ons);
    const d = nt.dur;
    let used = 0;
    if (on && SONOR[on]) {
      sc.seg(0.05, { av: 0.5, ah: 0, af: 0, f0: f * 0.97, ...SONOR[on] });
      used += 0.05;
    } else if (on === 's' || on === 'ch') {
      sc.seg(0.05, { av: 0, af: 0.5, ff: on === 's' ? 6000 : 3200, fq: 2, f0: f, ...vp });
      used += 0.05;
    } else if (PLOSIVE[on]) {
      sc.seg(0.03, { av: 0, af: 0, ah: 0, f0: f });
      sc.seg(0.015, { af: 0.6, ff: PLOSIVE[on][0], ...vp }, { af: 0 });
      used += 0.045;
    }
    const body = Math.max(0.06, d - used - 0.03);
    // scoop into the note (luk thung style) and optional ornament (turn) at the end of long notes
    const scoop = nt.scoop ?? (rng() < 0.4 ? -1.2 : -0.3);
    const f0s = f * Math.pow(2, scoop / 12);
    sc.seg(Math.min(0.08, body * 0.3), { av: 0.95, ah: 0, af: 0, nas: 0, f0: f0s, ...vp }, { f0: f }, 'out');
    const rest = body - Math.min(0.08, body * 0.3);
    if (nt.orn && rest > 0.35) {
      const k = rest / 4;
      sc.seg(k * 2, { f0: f }, { f0: f });
      sc.seg(k * 0.6, {}, { f0: f * Math.pow(2, 2 / 12) }, 'smooth');
      sc.seg(k * 0.6, {}, { f0: f * Math.pow(2, -1 / 12) }, 'smooth');
      sc.seg(k * 0.8, {}, { f0: f }, 'smooth');
    } else sc.seg(rest, { f0: f }, { f0: f * (nt.fall ? Math.pow(2, -nt.fall / 12) : 1) });
    sc.seg(0.03, {}, { av: 0 });
    t = nt.t + d;
  }
  if (total > t) sc.rest(total - t);
  return renderVox(sr, sc, {
    rng,
    formantScale: preset.fs,
    jitter: 0.006,
    shimmer: 0.04,
    breath: preset.breath + 0.05,
    vibrato: { rate: 5.4, depth: 0.35, delay: 0.25 },
    drift: 0.08,
  });
}
