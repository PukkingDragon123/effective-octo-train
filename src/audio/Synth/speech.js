// Thai speech synthesis for the voice fallback (no OS Thai voice), whispers, ghosts and the radio DJ.
//
//  * Orthography: rough Thai syllabification with tone assignment (consonant class + tone marks + live/dead
//    syllables), the UTF-16 index of every syllable, and word boundaries (Intl.Segmenter 'th') for stress:
//    the last syllable of a content word is stressed, earlier syllables and function words are reduced.
//  * Prosody: connected speech (voicing runs through words, no gaps between syllables), line + phrase
//    declination, Thai tone contours over the whole voiced rhyme, micro-prosody after voiceless onsets,
//    phrase-final lengthening and creak, question-particle lift, emphasis, breaths at long pauses.
//  * Segments: place-of-articulation formant loci (CV / VC transitions), unreleased final stops, glottal
//    stops on short open syllables, aspirated vs unaspirated vs pre-voiced plosives, affricates, fricatives.
//  * Ghost plans (planGhostEdits): stutters, pauses at wrong places, dragged vowels and run-ons, computed from
//    the text with a seed so the OS-TTS path (Voice.js chunks the utterance) and the murmur agree.
//  * renderVoiceLine(): a dialogue line as time-aligned layers for the Web Audio voice rack (VoiceFX.js):
//    main voice, breath (inhale before the line / breaths that do not match the words), an octave-down double,
//    a whispered double and a reverse-reverb swell into the first word.
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

// unstressed grammatical words (pronouns, auxiliaries, prepositions, conjunctions)
const FUNCTION_WORDS = new Set(
  'ก็ จะ ที่ ของ ได้ ให้ แล้ว กับ และ แต่ ว่า เป็น อยู่ คือ ผม ฉัน หนู เขา มัน เรา นี่ นั่น นี้ นั้น ไป มา ไม่ จาก ใน บน ถึง กัน เลย ด้วย ยัง เพราะ ถ้า เมื่อ ซึ่ง แค่ ก็ได้ อย่า ต้อง คง อาจ เคย กำลัง ข้าง'.split(' '),
);
// sentence-final particles: short, prominent, carry their own tone
const PARTICLES = new Set('นะ ค่ะ คะ ครับ คับ จ้ะ จ้า จ๊ะ จ๋า ล่ะ สิ ซิ เถอะ หรอก ไหม มั้ย เหรอ หรอ น่ะ ฮะ ขา เนอะ วะ ว่ะ เว้ย โว้ย ย่ะ ป่ะ ปะ เปล่า ป่าว จ๊ะ'.split(' '));
const QUESTION = new Set('ไหม มั้ย เหรอ หรอ หรือ ป่ะ ปะ เปล่า ป่าว'.split(' '));

let SEG;
/** Thai word segmentation: [{index (UTF-16), text, word}] (Intl.Segmenter, else whitespace/punctuation runs). */
export function segmentWords(text) {
  const out = [];
  if (!text) return out;
  if (SEG === undefined) {
    try {
      SEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
    } catch (e) {
      SEG = null;
    }
  }
  if (SEG) {
    for (const s of SEG.segment(text)) out.push({ index: s.index, text: s.segment, word: !!s.isWordLike });
    return out;
  }
  const re = /[^\s.,!?…:;"'()]+|[\s.,!?…:;"'()]+/g;
  let m;
  while ((m = re.exec(text))) out.push({ index: m.index, text: m[0], word: !/^[\s.,!?…:;"'()]/.test(m[0]) });
  return out;
}

const CL_R = 'กขคตปพบดฟ';
const CL_L = 'กขคปพผบฟ';
const CL_W = 'กขค';
const validCluster = (a, b) => (b === 'ร' && CL_R.includes(a)) || (b === 'ล' && CL_L.includes(a)) || (b === 'ว' && CL_W.includes(a));

function newSyl(ci) {
  return { lead: '', onset: [], marks: '', tone: '', finals: [], ci };
}

/**
 * Split Thai text into phrases of rough syllables.
 * Returns [{ sylls: [{onset, cluster, vowel, long, coda, glide, tone, ci, word, wordStart, wordEnd, stress, particle,
 *   question}], pause, breakCi }]. `ci` is the UTF-16 index of the syllable's first character; `breakCi` the index
 * of the character that ended the phrase (space / punctuation).
 */
export function parseThai(text) {
  const phrases = [];
  let sylls = [];
  const chars = [...(text || '')];
  const pos = new Array(chars.length + 1);
  for (let i = 0, u = 0; i <= chars.length; i++) {
    pos[i] = u;
    if (i < chars.length) u += chars[i].length;
  }
  // a syllable never crosses a word boundary (the segmenter resolves finals like อยู่|ตรง)
  const wordStarts = new Set(segmentWords(text).filter((w) => w.word).map((w) => w.index));
  let cur = newSyl(0);
  const empty = () => !cur.onset.length && !cur.lead && !cur.marks;
  const flush = (i) => {
    if (cur.onset.length || cur.lead || cur.marks) sylls.push(finishSyl(cur));
    cur = newSyl(pos[i] ?? 0);
  };
  const endPhrase = (pause, i) => {
    flush(i + 1);
    if (sylls.length) phrases.push({ sylls, pause, breakCi: pos[i] ?? -1 });
    else if (phrases.length) phrases[phrases.length - 1].pause = Math.max(phrases[phrases.length - 1].pause, pause);
    sylls = [];
  };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const nx = chars[i + 1] || '\0'; // sentinel: ''.includes('') would be true
    if (i > 0 && wordStarts.has(pos[i]) && !empty() && !TONES.includes(c) && !ABOVE.includes(c) && !FOLLOW.includes(c)) flush(i);
    if (empty()) cur.ci = pos[i];
    if (LEAD.includes(c)) {
      if (cur.onset.length || cur.marks) flush(i);
      cur.lead = c;
    } else if (isCons(c)) {
      if (SILENT === nx) {
        i++;
        continue;
      }
      const nxIsVowel = ABOVE.includes(nx) || FOLLOW.includes(nx) || TONES.includes(nx);
      const L = cur.lead;
      const first = cur.onset[0];
      if (!cur.onset.length) {
        cur.onset.push(c);
      } else if (cur.finals.length) {
        flush(i);
        cur.onset.push(c);
      } else if (!cur.marks) {
        // onset (maybe after a lead vowel) and no vowel mark yet
        const one = cur.onset.length === 1;
        const nn = chars[i + 2] || '\0';
        const implicitO = isCons(nx) && !ABOVE.includes(nn) && !FOLLOW.includes(nn) && !TONES.includes(nn); // ตรง กลม ครบ
        if (one && 'รลว'.includes(c) && validCluster(first, c) && (nxIsVowel || L || (c !== 'ว' && implicitO))) cur.onset.push(c); // true cluster
        else if (one && c === 'ร' && 'จซศส'.includes(first) && (nxIsVowel || L)) {
          /* silent ร: จริง สร้าง ศรี */
        } else if (one && first === 'ท' && c === 'ร' && (nxIsVowel || L)) cur.onset[0] = 'ซ'; // ทร = ซ (ทราย)
        else if (one && first === 'ห' && 'งญนมยรลว'.includes(c) && (nxIsVowel || L || !isCons(chars[i + 2] || '\0'))) cur.onset.push(c); // ห นำ (ไหม เหมือน หมด)
        else if (one && first === 'อ' && c === 'ย' && !L) cur.onset.push(c); // อ นำ ย (อย่า อยู่ อยาก อย่าง)
        else if (c === 'อ' && !L) cur.marks += 'อ'; // อ as vowel ɔɔ
        else if (c === 'ว' && !nxIsVowel && !L) cur.marks += 'ัว'; // ัว (ua) without the mai han-akat
        else if (L && (c === 'อ' || c === 'ย')) cur.marks += c; // เ-อ, เ-ย
        else if (L === 'ไ' || L === 'ใ') {
          // ไ / ใ is a whole vowel: the next consonant starts a new syllable (silent ย of ไทย aside)
          if (!(c === 'ย' && !nxIsVowel)) {
            flush(i);
            cur.onset.push(c);
          }
        } else if (L) {
          if (nxIsVowel) {
            flush(i);
            cur.onset.push(c);
          } else cur.finals.push(c);
        } else if (nxIsVowel) {
          // no cluster: the first consonant carries a reduced inherent 'a' (ตลาด = ta-laat, สบาย = sa-baay)
          flush(i);
          cur.onset.push(c);
        } else {
          cur.finals.push(c); // implicit vowel o: คน
        }
      } else {
        // vowel present
        if (c === 'อ' || (c === 'ย' && cur.marks.includes('ี')) || (c === 'ว' && cur.marks.includes('ั') && !nxIsVowel)) {
          cur.marks += c;
        } else if (nxIsVowel || 'หฉผฝฮ'.includes(c)) {
          flush(i);
          cur.onset.push(c);
        } else {
          cur.finals.push(c);
        }
      }
    } else if (ABOVE.includes(c) || FOLLOW.includes(c)) {
      cur.marks += c;
    } else if (TONES.includes(c)) {
      cur.tone = c;
    } else if (c === 'ๆ') {
      flush(i);
      if (sylls.length) sylls.push({ ...sylls[sylls.length - 1], ci: pos[i], repeatMark: true });
    } else if (c === ' ' || c === '\n' || c === '\t') {
      endPhrase(0.2, i);
    } else if (',;:'.includes(c)) {
      endPhrase(0.32, i);
    } else if ('.!?…'.includes(c)) {
      // runs of dots / ellipsis = a long, held pause
      let j = i;
      while ('.…'.includes(chars[j + 1] || '\0')) j++;
      const long = j > i || c === '…';
      endPhrase(long ? 0.62 : c === '?' ? 0.42 : 0.48, i);
      if (c === '?' && phrases.length) phrases[phrases.length - 1].question = true;
      i = j;
    } else if (/[A-Za-z0-9]/.test(c)) {
      // latin word / digits: approximate by vowel groups
      let word = c;
      const at = pos[i];
      while (i + 1 < chars.length && /[A-Za-z0-9]/.test(chars[i + 1])) word += chars[++i];
      flush(i + 1);
      const groups = Math.max(1, (word.match(/[aeiouy]+/gi) || []).length + (/\d/.test(word) ? word.length : 0));
      for (let g = 0; g < groups; g++) sylls.push({ onset: ['t', 'k', 'n', 's', 'm'][g % 5], cluster: '', vowel: ['a', 'e', 'o', 'i'][g % 4], long: false, coda: '', glide: '', tone: g === groups - 1 ? 'F' : 'M', ci: at });
    }
  }
  endPhrase(0.35, chars.length);
  markWords(text, phrases);
  return phrases;
}

/** Word boundaries, stress and particles from the segmenter (in place). */
function markWords(text, phrases) {
  const words = segmentWords(text).filter((w) => w.word);
  const all = [];
  for (const ph of phrases) for (const s of ph.sylls) all.push(s);
  let wi = 0;
  for (let k = 0; k < all.length; k++) {
    const s = all[k];
    while (wi + 1 < words.length && words[wi + 1].index <= s.ci) wi++;
    const w = words[wi];
    s.word = w && s.ci >= w.index && s.ci < w.index + w.text.length ? wi : -1 - k;
    s.wordText = s.word >= 0 ? w.text : '';
    s.wordCi = s.word >= 0 ? w.index : s.ci;
  }
  for (let k = 0; k < all.length; k++) {
    const s = all[k];
    const prev = all[k - 1];
    const next = all[k + 1];
    s.wordStart = !prev || prev.word !== s.word;
    s.wordEnd = !next || next.word !== s.word;
    s.particle = PARTICLES.has(s.wordText);
    s.fn = FUNCTION_WORDS.has(s.wordText);
    s.stress = s.wordEnd && !s.fn && !s.particle;
    s.question = QUESTION.has(s.wordText);
    // spoken tone of the question particle ไหม is high (มั้ย)
    if (s.wordText === 'ไหม') s.tone = 'H';
  }
  for (const ph of phrases) {
    const last = ph.sylls[ph.sylls.length - 1];
    if (last && last.question) ph.question = true;
  }
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
    else if (has('อ') || has('ิ')) { vowel = 'oe'; long = !has('ะ'); }
    else if (has('ย')) { vowel = 'oe'; long = true; offglide = 'y'; }
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
  if (first === 'อ' && s.onset[1] === 'ย') cls = 'mid';
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
  if ((first === 'ห' || first === 'อ') && s.onset.length > 1) onset = ONSET[s.onset[1]] ?? '';
  const cluster = s.onset.length > 1 && first !== 'ห' && first !== 'อ' ? ONSET[s.onset[1]] || '' : '';
  return { onset, cluster, vowel, long, coda, glide: offglide === 'schwa' ? 'schwa' : '', tone, ci: s.ci ?? 0, dead: !!dead };
}

// ---------------------------------------------------------------------------
// Ghost disruption plan (shared by the murmur and the OS-TTS chunker)
// ---------------------------------------------------------------------------
/**
 * Where a ghost's speech goes wrong. Deterministic for (text, ghost, seed).
 * { pauses:[{ci, dur}] (silence before the word starting at ci, inside a phrase), repeats:[{ci, len, times}]
 *   (stutter on that word), drags:[ci] (a held, sagging vowel), runons:[ci of a space whose pause is dropped] }
 */
export function planGhostEdits(text, ghost = 0, seed = 1) {
  const out = { pauses: [], repeats: [], drags: [], runons: [] };
  if (!text || !(ghost > 0.28)) return out;
  const rng = rngFrom((hashStr(text) ^ Math.imul(seed | 0, 0x5bd1e995) ^ 0x2545f491) >>> 0);
  const words = segmentWords(text).filter((w) => w.word && /[ก-๛]/.test(w.text));
  if (words.length < 2) return out;
  const content = words.filter((w) => w.text.length >= 2 && !FUNCTION_WORDS.has(w.text) && !PARTICLES.has(w.text));
  // stutter: the first content word more often than not (a voice that catches on its own words)
  if (content.length && rng() < 0.25 + 0.55 * ghost) {
    const w = rng() < 0.5 ? content[0] : content[Math.floor(rng() * content.length)];
    out.repeats.push({ ci: w.index, len: w.text.length, times: ghost > 0.7 && rng() < 0.5 ? 2 : 1 });
  }
  // pauses at the wrong place: between two words of the same phrase (not after a space or punctuation)
  const inner = words.filter((w, i) => i > 0 && !/[\s.,!?…:;]/.test(text[w.index - 1] || ' '));
  let np = rng() < 0.3 + 0.55 * ghost ? 1 : 0;
  if (ghost > 0.72 && rng() < 0.45) np++;
  for (let k = 0; k < np && inner.length; k++) {
    const j = Math.floor(rng() * inner.length);
    const w = inner.splice(j, 1)[0];
    out.pauses.push({ ci: w.index, dur: +(0.3 + rng() * 0.5 + ghost * 0.35).toFixed(3) });
  }
  if (ghost > 0.45 && content.length) {
    const nd = 1 + (ghost > 0.75 && rng() < 0.5 ? 1 : 0);
    for (let k = 0; k < nd; k++) out.drags.push(content[Math.floor(rng() * content.length)].index);
  }
  if (ghost > 0.6 && rng() < 0.35) {
    const spaces = [];
    for (let i = 1; i < text.length - 1; i++) if (text[i] === ' ' && /[ก-๛]/.test(text[i - 1]) && /[ก-๛]/.test(text[i + 1])) spaces.push(i);
    if (spaces.length) out.runons.push(spaces[Math.floor(rng() * spaces.length)]);
  }
  out.pauses.sort((a, b) => a.ci - b.ci);
  out.repeats.sort((a, b) => a.ci - b.ci);
  return out;
}

// ---------------------------------------------------------------------------
// Prosody + segments
// ---------------------------------------------------------------------------
// Tone contours in semitones over the voiced rhyme (vowel + sonorant coda), at u = 0, .25, .5, .75, 1.
const TONE_SHAPES = {
  M: [0.2, 0, -0.2, -0.45, -0.75],
  L: [-1.0, -1.7, -2.3, -2.8, -3.2],
  F: [1.1, 2.3, 2.0, 0.1, -3.2],
  H: [0.3, 0.6, 1.2, 2.3, 3.3],
  R: [-0.6, -1.7, -1.9, -0.3, 2.7],
};
function toneAt(shape, u) {
  const x = clamp(u) * 4;
  const i = Math.min(3, Math.floor(x));
  const f = x - i;
  return shape[i] + (shape[i + 1] - shape[i]) * f;
}

/** Voice presets -> base f0, formant scale, voice quality. tone: 'shout' | 'whisper' | 'sing' | ... */
export function voicePreset(v = {}, tone = '') {
  const g = v.gender || 'm';
  const age = v.age ?? (g === 'child' ? 9 : 40);
  const child = g === 'child' || age < 13;
  let f0 = child ? 270 : g === 'f' ? 205 : 112;
  let fs = child ? 1.3 : g === 'f' ? 1.16 : 1.0;
  if (child && g === 'm') fs = 1.26;
  if (!child && age > 55) f0 *= g === 'f' ? 0.86 : 1.04;
  if (!child && age < 30) fs *= g === 'f' ? 1.02 : 1.01;
  const old = clamp((age - 50) / 35);
  f0 *= v.pitch ?? 1;
  // a stable, per-character colour: vocal-tract length and breathiness vary a little between speakers
  const id = rngFrom(hashStr(`${g}|${age}|${v.pitch ?? 1}|${v.rate ?? 1}`));
  fs *= 0.97 + id() * 0.06;
  const p = {
    gender: g,
    child,
    f0,
    fs,
    age,
    old,
    rate: v.rate ?? 1,
    jitter: 0.006 + old * 0.022 + (v.ghost ? 0.01 : 0),
    shimmer: 0.04 + old * 0.11,
    breath: 0.05 + old * 0.1 + (g === 'f' ? 0.05 : 0) + (child ? 0.04 : 0) + id() * 0.03,
    oq: g === 'f' || child ? 0.62 : 0.52,
    tilt: g === 'f' ? 0.32 : 0.26,
    creak: g === 'm' && !child ? 0.35 + old * 0.3 + id() * 0.15 : 0.08 + old * 0.2,
    tremor: old > 0.55 ? { rate: 5 + id() * 1.5, depth: 0.12 + (old - 0.55) * 0.5, amp: 0.06 + old * 0.05 } : null,
    ghost: clamp(v.ghost ?? 0),
    whisper: !!v.whisper || tone === 'whisper',
    sing: !!v.sing || tone === 'sing',
    shout: tone === 'shout',
    toneDepth: 1,
  };
  if (p.shout) {
    p.f0 *= 1.42;
    p.oq = 0.4;
    p.tilt = 0.08;
    p.rate *= 1.06;
    p.breath *= 0.6;
  }
  if (p.whisper) p.rate *= 0.95;
  return p;
}

const PLACE = { p: 'lab', ph: 'lab', b: 'lab', m: 'lab', f: 'lab', w: 'lab', t: 'alv', th: 'alv', d: 'alv', n: 'alv', s: 'alv', l: 'alv', r: 'alv', c: 'pal', ch: 'pal', y: 'pal', k: 'vel', kh: 'vel', ng: 'vel' };
function locus(cons, V) {
  switch (PLACE[cons]) {
    case 'lab': return { F1: 260, F2: 850, F3: 2200 };
    case 'alv': return { F1: 280, F2: 1750, F3: 2650 };
    case 'pal': return { F1: 260, F2: 2150, F3: 2900 };
    case 'vel': return V.F2 > 1600 ? { F1: 260, F2: 2300, F3: 2500 } : { F1: 270, F2: 1250, F3: 2150 };
    default: return null;
  }
}
const toward = (L, V, k) => (L ? { F1: L.F1 + (V.F1 - L.F1) * k, F2: L.F2 + (V.F2 - L.F2) * k, F3: L.F3 + (V.F3 - L.F3) * k } : { F1: V.F1, F2: V.F2, F3: V.F3 });

// burst centre / Q per plosive place; frication per fricative
const BURST = { lab: [1100, 0.6, 0.55], alv: [4300, 1.0, 0.8], pal: [3300, 1.5, 0.75] };
const ASPIRATED = { kh: 1, th: 1, ph: 1, ch: 1 };
const PLOSIVES = { k: 1, t: 1, p: 1, c: 1, kh: 1, th: 1, ph: 1, ch: 1, b: 1, d: 1 };
const FRIC = { s: [6000, 2.2, 0.75, 0.085], f: [3600, 0.55, 0.3, 0.07] };
const SONOR = {
  m: { F1: 260, F2: 1000, F3: 2300, nas: 1 },
  n: { F1: 260, F2: 1500, F3: 2600, nas: 1 },
  ng: { F1: 260, F2: 2000, F3: 2700, nas: 1 },
  l: { F1: 360, F2: 1150, F3: 2700, nas: 0 },
  r: { F1: 420, F2: 1300, F3: 1900, nas: 0 },
  w: { F1: 300, F2: 650, F3: 2300, nas: 0 },
  y: { F1: 270, F2: 2200, F3: 3000, nas: 0 },
};
const VOICED_ONSET = { b: 1, d: 1, m: 1, n: 1, ng: 1, l: 1, r: 1, w: 1, y: 1 };
const CONTINUANT_ONSET = { m: 1, n: 1, ng: 1, l: 1, r: 1, w: 1, y: 1, '': 1 };

/**
 * Build a VoxScore for a list of phrases.
 * opts: { rate, toneDepth, fric, lead (s of silence first), edits (planGhostEdits), ghost 0..1, rng2 (ghost choices) }
 * The score also carries timing marks: score.marks [{t, ci, stress, end}], score.breaths [{t, dur, kind}],
 * score.speechStart / score.speechEnd (s).
 */
export function buildSpeechScore(phrases, preset, rng, opts = {}) {
  const sc = new VoxScore({ f0: preset.f0, av: 0, oq: preset.oq, tilt: preset.tilt });
  const rate = clamp(preset.rate * (opts.rate ?? 1), 0.4, 2.2);
  const ghost = clamp(opts.ghost ?? preset.ghost ?? 0);
  const toneDepth = (opts.toneDepth ?? 1) * preset.toneDepth * (preset.whisper ? 0.55 : 1) * (1 - 0.45 * ghost);
  const fr = opts.fric ?? (preset.whisper ? 0.5 : 1);
  const edits = opts.edits || { pauses: [], repeats: [], drags: [], runons: [] };
  const pauseAt = new Map(edits.pauses.map((p) => [p.ci, p.dur]));
  const repeatAt = new Map(edits.repeats.map((p) => [p.ci, p.times]));
  const dragAt = new Set(edits.drags);
  const runon = new Set(edits.runons);
  const sing = preset.sing;
  sc.marks = [];
  sc.breaths = [];
  const lead = opts.lead ?? 0.04;
  if (lead > 0) sc.rest(lead);
  if (lead > 0.2 && opts.leadBreath !== false && !ghost) sc.breaths.push({ t: Math.max(0, lead - 0.36), dur: Math.min(0.42, lead), kind: 'in', gain: 1 });
  sc.speechStart = sc.duration;
  const total = phrases.reduce((n, p) => n + p.sylls.length, 0) || 1;
  let gi = 0; // syllable index over the whole line
  let prevStop = false; // previous syllable ended in a closure
  let singStep = 2;
  const SCALE = [0, 2, 4, 7, 9, 12, 14];
  for (let pi = 0; pi < phrases.length; pi++) {
    const ph = phrases[pi];
    const N = ph.sylls.length;
    let afterPause = true;
    for (let si = 0; si < N; si++, gi++) {
      const sy = ph.sylls[si];
      const isLast = si === N - 1;
      const lineEnd = isLast && pi === phrases.length - 1;
      const wci = sy.wordCi ?? sy.ci;
      // --- ghost edit: a pause at the wrong place, before this word ---
      if (sy.wordStart && pauseAt.has(wci) && si > 0) {
        sc.seg(0.03, {}, { av: 0, ah: 0, af: 0 });
        sc.rest(pauseAt.get(wci) / Math.max(0.6, rate));
        afterPause = true;
        prevStop = false;
      }
      // --- f0 register: line declination + phrase declination + small random walk + emphasis ---
      const lineProg = total > 1 ? gi / (total - 1) : 0;
      const phProg = N > 1 ? si / (N - 1) : 0;
      let semis = 1.3 - lineProg * 2.8 + (0.7 - phProg * 1.6) + (rng() - 0.5) * 0.6;
      if (sy.stress && rng() < 0.3) semis += 0.8; // emphasis on a content word
      if (ph.question && isLast) semis += 1.6;
      let base = preset.f0 * Math.pow(2, semis / 12);
      // --- durations ---
      let ds = (1 / rate) * (sy.stress || sy.particle ? 1 : 0.68) * (isLast ? 1.42 : 1) * (0.9 + rng() * 0.2);
      if (sy.particle && isLast) ds *= 1.1;
      let depth = toneDepth * (sy.stress ? 1 : sy.particle ? 0.9 : 0.6);
      let shape = TONE_SHAPES[sy.tone] || TONE_SHAPES.M;
      if (sing) {
        // talk-singing: tones steer the melody (rising tones step up, low / falling step down)
        const dir = sy.tone === 'H' || sy.tone === 'R' ? 1 : sy.tone === 'L' || sy.tone === 'F' ? -1 : rng() < 0.5 ? 1 : 0;
        singStep = clamp(singStep + dir, 0, SCALE.length - 1) | 0;
        if (isLast) singStep = rng() < 0.5 ? 0 : 2;
        base = preset.f0 * Math.pow(2, (SCALE[singStep] - 3) / 12);
        depth = 0.25;
        ds *= sy.long || sy.coda ? 2.1 : 1.5;
      }
      // a ghost's last word lifts where it should fall (wrong intonation), sometimes
      if (lineEnd && ghost > 0.5 && opts.rng2 && opts.rng2() < 0.5) shape = TONE_SHAPES.R;
      // the last syllable of a dragged word is held and sags
      const drag = sy.wordEnd && dragAt.has(wci) ? 2.3 : 1;
      const amp = (sy.stress ? 1 : 0.82) * (1 - 0.22 * lineProg) * (0.92 + rng() * 0.16) * (preset.shout ? 1.15 : 1);
      const ctx = { base, depth, shape, ds, amp, afterPause, prevStop, isLast, lineEnd, drag, rng, fr, preset, next: si + 1 < N ? ph.sylls[si + 1] : null, ghost };
      // --- ghost edit: stutter (the word's first syllable caught and cut, once or twice) ---
      if (sy.wordStart && repeatAt.has(wci)) {
        for (let r = 0; r < repeatAt.get(wci); r++) {
          syllable(sc, { ...sy, coda: '', glide: '', long: false, stress: false }, { ...ctx, cut: 0.45, amp: amp * 0.85, isLast: false, lineEnd: false, drag: 1, next: null });
          sc.seg(0.02, {}, { av: 0, ah: 0, af: 0 });
          sc.rest(0.05 + rng() * 0.09 + ghost * 0.06);
          ctx.afterPause = true;
          ctx.prevStop = false;
        }
      }
      syllable(sc, sy, ctx);
      prevStop = !!STOP_FINAL[sy.coda] || (sy.dead && !sy.coda);
      afterPause = false;
    }
    // --- phrase break ---
    let pause = (ph.pause ?? 0.2) / rate;
    if (preset.whisper) pause *= 1.15;
    if (runon.has(ph.breakCi)) pause = 0.025;
    pause *= 0.85 + rng() * 0.3;
    if (pi === phrases.length - 1) pause = Math.min(pause, 0.12);
    sc.seg(0.02, {}, { av: 0, ah: 0, af: 0 });
    if (pi < phrases.length - 1 && pause > 0.38 && !ghost && !preset.whisper && rng() < 0.6) {
      // a natural breath in a long pause
      const bd = Math.min(0.42, pause * 0.7);
      sc.breaths.push({ t: sc.duration + pause - bd - 0.04, dur: bd, kind: 'in', gain: 0.75 });
    }
    sc.speechEnd = sc.duration;
    sc.rest(pause);
  }
  return sc;
}

/** One syllable into the score. c: {base, depth, shape, ds, amp, afterPause, prevStop, isLast, lineEnd, drag, rng, fr, preset, next, cut} */
function syllable(sc, sy, c) {
  const P = c.preset || { creak: 0.2, oq: 0.55, gender: 'm' };
  const rng = c.rng || Math.random;
  const ds = c.ds ?? 1;
  const amp = c.amp ?? 1;
  const fr = c.fr ?? 1;
  const base = c.base ?? sc.cur.f0;
  const depth = c.depth ?? 1;
  const shape = c.shape || TONE_SHAPES[sy.tone] || TONE_SHAPES.M;
  const V = vowelParams(sy.vowel);
  const on = sy.onset;
  const Lc = locus(on, V);
  const f = (u, extra = 0) => base * Math.pow(2, (toneAt(shape, u) * depth + extra) / 12);
  const micro = VOICED_ONSET[on] ? -0.4 : PLOSIVES[on] || FRIC[on] || on === 'h' ? 0.7 : 0;
  const place = PLACE[on];
  sc.marks.push({ t: sc.duration, ci: sy.ci, stress: !!sy.stress, onset: true });
  // ---------------- onset ----------------
  if (PLOSIVES[on]) {
    const clos = c.afterPause ? 0.02 : c.prevStop ? 0.022 : 0.04 * ds;
    const voicedBar = on === 'b' || on === 'd';
    sc.seg(clos, { av: voicedBar ? 0.16 * amp : 0, ah: 0, af: 0, nas: 0, oq: P.oq, sub: 0, f0: f(0, -1), ...(Lc || {}), F1: 220 });
    const [bf, bq, bg] = place === 'vel' ? [clamp(V.F2 * 1.2, 1500, 3000), 2.2, 0.8] : BURST[place] || BURST.alv;
    sc.seg(0.009, { av: 0, af: bg * amp * fr, ff: bf, fq: bq, ...toward(Lc, V, 0.15) }, { af: bg * 0.4 * amp * fr });
    if (on === 'c' || on === 'ch') sc.seg((on === 'ch' ? 0.045 : 0.03) * ds, { af: 0.62 * amp * fr, ff: 3300, fq: 1.6 }, { af: 0.35 * amp * fr });
    if (ASPIRATED[on]) sc.seg(0.055 * ds, { af: 0.05 * fr, ah: 0.5 * amp, ...toward(Lc, V, 0.5), F1: 300 }, { ah: 0.32 * amp, af: 0 });
    else if (!voicedBar) sc.seg(0.012, { af: 0, ah: 0.18 * amp }, { ah: 0.05 });
  } else if (FRIC[on]) {
    const [ff, fq, fa, d] = FRIC[on];
    const scale = P.gender === 'f' || P.child ? 1.12 : 1;
    sc.seg(d * ds, { av: 0, ah: 0, af: fa * amp * fr, ff: ff * scale, fq, nas: 0, sub: 0, f0: f(0, 0.8), ...(Lc || {}) }, { af: fa * 0.75 * amp * fr });
  } else if (on === 'h') {
    sc.seg(0.055 * ds, { av: 0, af: 0, ah: 0.55 * amp, nas: 0, sub: 0, f0: f(0, 0.6), F1: V.F1, F2: V.F2, F3: V.F3 }, { ah: 0.42 * amp });
  } else if (SONOR[on]) {
    sc.seg(0.05 * ds, { av: 0.55 * amp, ah: 0, af: 0, sub: 0, oq: P.oq, f0: f(0, -0.4), ...SONOR[on] }, { av: 0.62 * amp });
  } else if (c.afterPause) {
    // glottal attack after silence
    sc.seg(0.018, { av: 0, ah: 0.06 * amp, af: 0, nas: 0, sub: 0.3, F1: V.F1, F2: V.F2, F3: V.F3, f0: f(0) });
  }
  if (sy.cluster && SONOR[sy.cluster] && rng() < 0.7) sc.seg(0.03 * ds, { av: 0.6 * amp, af: 0, ah: 0, ...SONOR[sy.cluster] });
  // ---------------- rhyme: vowel (+ sonorant coda) carries the tone ----------------
  const cut = c.cut ?? 1;
  let vd = (sy.long ? 0.16 : 0.075) * ds * (c.drag ?? 1) * cut;
  const cd = sy.coda;
  const sonCoda = cd === 'm' || cd === 'n' || cd === 'ng' || cd === 'w' || cd === 'y';
  const cdur = sonCoda && cut === 1 ? (sy.long ? 0.05 : 0.07) * ds * (c.isLast ? 1.25 : 1) : 0;
  const R = vd + cdur;
  const u1 = (vd * 0.3) / R, u2 = (vd * 0.75) / R, u3 = vd / R;
  const Fon = CONTINUANT_ONSET[on] && on ? toward(SONOR[on], V, 0.55) : toward(Lc, V, 0.5);
  const sag = c.drag > 1 ? -1.5 : 0;
  sc.seg(vd * 0.3, { av: amp, ah: 0, af: 0, nas: 0, sub: 0, oq: P.oq, ...Fon, F4: V.F4, f0: f(0, micro) }, { ...V, f0: f(u1) }, 'out');
  sc.seg(vd * 0.45, {}, { f0: f(u2, sag * 0.5), av: amp * 0.97 }, 'smooth');
  // last quarter of the vowel moves toward the glide / coda place
  const G = sy.glide ? vowelParams(sy.glide) : null;
  const Lcoda = cd ? (SONOR[cd] ? SONOR[cd] : locus(cd === 'k' ? 'k' : cd === 't' ? 't' : 'p', V)) : null;
  const endF = G ? { F1: G.F1, F2: G.F2, F3: G.F3 } : Lcoda && cut === 1 ? toward(Lcoda, V, 0.55) : {};
  // phrase-final creak (vocal fry) on low / falling contours, or a breathy release
  const creaky = c.lineEnd || (c.isLast && rng() < 0.5);
  const fry = creaky && !sonCoda && (sy.tone === 'L' || sy.tone === 'F' || sy.tone === 'M') ? P.creak : 0;
  sc.seg(vd * 0.25, {}, { f0: f(u3, sag), av: amp * (STOP_FINAL[cd] ? 0.85 : 0.9), sub: fry, oq: fry ? 0.36 : P.oq, ...endF }, 'smooth');
  if (cut < 1) {
    sc.seg(0.018, {}, { av: 0, sub: 0.3 }); // cut off with a glottal catch (stutter)
    return;
  }
  // ---------------- coda ----------------
  const next = c.next;
  const flowsOn = next && (CONTINUANT_ONSET[next.onset] ?? false) && !c.isLast;
  if (sonCoda) {
    const S = SONOR[cd];
    sc.seg(cdur, { ...S, av: amp * (S.nas ? 0.62 : 0.7) }, { av: amp * (S.nas ? 0.45 : 0.4), f0: f(1, c.lineEnd && fry ? -1 : 0), sub: c.lineEnd ? P.creak * 0.6 : 0 });
    if (!flowsOn) sc.seg(c.isLast ? 0.05 : 0.025, {}, { av: 0, sub: 0, ah: c.isLast && P.gender === 'f' ? 0.04 : 0 });
  } else if (STOP_FINAL[cd]) {
    // unreleased final stop: closure, no burst
    sc.seg(0.012, {}, { av: 0, ah: 0 });
    sc.seg(0.03 * ds, { av: 0, ah: 0, af: 0 });
  } else if (sy.dead) {
    // short open syllable: glottal stop
    sc.seg(0.016, {}, { av: 0, sub: 0.25 });
    sc.seg(0.018, { av: 0, ah: 0, af: 0, sub: 0 });
  } else if (c.isLast || !flowsOn) {
    // open long vowel: let it die away (breathy for women / the old)
    sc.seg(c.isLast ? 0.07 : 0.03, {}, { av: 0, sub: fry * 0.5, ah: c.isLast ? 0.05 + (P.gender === 'f' ? 0.04 : 0) : 0, f0: f(1, c.isLast ? -0.8 : 0) });
    if (c.isLast) sc.seg(0.05, {}, { ah: 0 });
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const loud50 = (a, sr) => {
  const w = Math.max(1, Math.floor(sr * 0.05));
  let best = 0;
  for (let s0 = 0; s0 < a.length; s0 += w >> 1) {
    let e = 0;
    const end = Math.min(a.length, s0 + w);
    for (let i = s0; i < end; i++) e += a[i] * a[i];
    best = Math.max(best, Math.sqrt(e / w));
  }
  return best;
};
const peakOf = (a) => {
  let p = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i] < 0 ? -a[i] : a[i];
    if (v > p) p = v;
  }
  return p;
};
const dB = (x) => Math.pow(10, x / 20);

function voxOpts(preset, rng, extra = {}) {
  return {
    rng,
    formantScale: preset.fs,
    jitter: preset.jitter,
    shimmer: preset.shimmer,
    breath: preset.breath,
    whisper: preset.whisper,
    drift: preset.sing ? 0.08 : 0.22,
    smooth: 0.009,
    smoothAmp: 0.004,
    tremor: preset.tremor,
    vibrato: preset.sing ? { rate: 5.3, depth: 0.3, delay: 0.35 } : null,
    tail: 0.25,
    hpc: true,
    ...extra,
    eq: (extra.whisper ?? preset.whisper) ? [['highshelf', 5000, 0.7, 6]] : [['highshelf', 2200, 0.7, 5], ['highshelf', 5000, 0.7, 10]],
  };
}

/** One breath event (inhale / exhale / ghost rattle) as a short buffer. */
function breathEvent(sr, kind, dur, preset, rng, rattle = 0) {
  const sc = new VoxScore({ f0: 60, av: 0 });
  const fs = preset.fs;
  if (kind === 'in') {
    // inhale: hollow open-mouth air, the friction rising as the lungs fill, a soft catch at the top
    sc.seg(dur * 0.6, { ah: 0.02, af: 0.03, ff: 2600, fq: 0.7, F1: 620, F2: 1200, F3: 2500, F4: 3500, B1: 160, B2: 200, B3: 260 }, { ah: 0.5, af: 0.16, F2: 1450 }, 'in');
    sc.seg(dur * 0.4, {}, { ah: 0, af: 0, F2: 1600, F1: 500 }, 'out');
  } else {
    // exhale / sigh
    sc.seg(dur * 0.25, { ah: 0.04, af: 0, F1: 520, F2: 1350, F3: 2450, F4: 3400, B1: 140, B2: 180, B3: 240 }, { ah: 0.45 }, 'out');
    sc.seg(dur * 0.75, {}, { ah: 0, F1: 450, F2: 1200 }, 'in');
  }
  let b = renderVox(sr, sc, { rng, whisper: true, formantScale: fs, presence: 8, tail: 0.05 });
  if (rattle > 0) {
    // a wet creaky rattle under the air: ingressive vocal fry at a very low pulse rate
    const r = new VoxScore({ f0: 34 + rng() * 10, av: 0, oq: 0.3, sub: 0.9 });
    r.seg(dur * 0.35, { av: 0, ah: 0.05, F1: 400, F2: 1100, F3: 2400 }, { av: 0.35 * rattle }, 'in');
    r.seg(dur * 0.45, {}, { av: 0.25 * rattle, f0: 28 });
    r.seg(dur * 0.2, {}, { av: 0 });
    const rb = renderVox(sr, r, { rng, jitter: 0.12, shimmer: 0.4, breath: 0.4, formantScale: fs * 0.9, tail: 0.05 });
    const g = loud50(b, sr) / Math.max(1e-6, loud50(rb, sr));
    mixInto(b, rb, 0, g * 0.8);
  }
  return b;
}

/** Reverse-reverb swell: the whisper of the first words, reversed, reverberated and reversed back. */
function reverseSwell(src, sr, at, lead, ghost, rng) {
  const segLen = Math.min(src.length - at, Math.floor(1.1 * sr));
  if (segLen < sr * 0.1) return null;
  const seg = src.subarray(at, at + segLen);
  const tail = lead + 0.15;
  const wet = bakeVerb(reverse(seg), sr, { room: 0.96, damp: 0.28 + rng() * 0.1, wet: 1, dry: 0, tail, predelay: 0.0 });
  const u = reverse(wet);
  const tl = Math.floor(tail * sr);
  const out = new Float32Array(src.length);
  // u[tl] lines up with seg[0]; keep the swell and ~0.35 s of the sucked-back texture into the words
  const keep = Math.min(u.length, tl + Math.floor((0.25 + ghost * 0.2) * sr));
  const o = at - tl;
  const fo = Math.floor(0.2 * sr);
  for (let i = 0; i < keep; i++) {
    const d = o + i;
    if (d < 0 || d >= out.length) continue;
    const g = i > keep - fo ? (keep - i) / fo : 1;
    out[d] = u[i] * g;
  }
  return out;
}

/**
 * A dialogue line as aligned layers. a: { th, voice:{gender,age,pitch,rate,ghost,whisper}, tone, seed,
 *   mode: 'murmur' (with the main voice) | 'shadow' (ghost layers only, under an OS TTS voice) | 'breath' (only the
 *   inhale before the line, for a living OS-TTS voice), edits, rate, lead (s of pre-roll), planSeed }
 * Returns { channels: Float32Array[], meta: { layout:[names], duration, speechStart, speechEnd, stress:[t],
 *   sylls:[[ci, t]], breaths, ghost } }. Levels: main's loudest 50 ms at -14 dBFS (-19 whisper, -11.5 shout);
 *   the other layers are set relative to it.
 */
export function renderVoiceLine(sr, a = {}) {
  const v = a.voice || {};
  const tone = a.tone || '';
  const mode = a.mode || 'murmur';
  const th = a.th || '';
  const preset = voicePreset(v, tone);
  const ghost = preset.ghost;
  const seed = a.seed ?? hashStr(th + '|' + JSON.stringify(v) + '|' + tone);
  const rng = rngFrom(seed);
  const rng2 = rngFrom(seed ^ 0x9e3779b9);
  const ghostly = (ghost > 0.25 || mode === 'shadow') && mode !== 'breath';
  if (ghost > 0) {
    preset.f0 *= 1 - ghost * 0.15;
    preset.rate *= 1 - ghost * 0.12;
    preset.fs *= 1 - ghost * 0.05;
    preset.breath += ghost * 0.22;
    preset.jitter += ghost * 0.02;
    preset.shimmer += ghost * 0.1;
    preset.creak += ghost * 0.4;
  }
  const edits = a.edits || planGhostEdits(th, ghost, a.planSeed ?? 1);
  let phrases = parseThai(th);
  if (!phrases.length) phrases = [{ sylls: [{ onset: '', cluster: '', vowel: 'schwa', long: true, coda: 'm', glide: '', tone: 'M', ci: 0, stress: true, wordStart: true, wordEnd: true }], pause: 0.2, breakCi: -1 }];
  const lead = a.lead ?? (ghostly ? 0.55 + ghost * 0.9 : 0.36);
  const score = buildSpeechScore(phrases, preset, rng, { lead, edits, ghost, rate: a.rate, rng2, leadBreath: a.breath !== false });
  const tailSec = ghostly ? 1.25 : 0.25;
  const n = Math.max(1, Math.ceil((score.duration + tailSec) * sr));
  const at = Math.floor(score.speechStart * sr);
  const channels = [];
  const layout = [];
  const fit = (x) => {
    if (x.length === n) return x;
    const y = new Float32Array(n);
    y.set(x.subarray(0, Math.min(n, x.length)));
    return y;
  };
  // ---- main voice ----
  let ref = 0;
  let gain = 1;
  if (mode === 'murmur') {
    const main = fit(renderVox(sr, score, voxOpts(preset, rngFrom(seed + 1), { tail: tailSec })));
    // a voiced ghost gets a slow, uneven breathing in its loudness
    if (ghost > 0.2) {
      const w = new Wander(rng2, 2.2);
      for (let i = 0; i < n; i += 64) {
        const m = 1 + w.next(64 / sr) * 0.22 * ghost;
        for (let k = 0; k < 64 && i + k < n; k++) main[i + k] *= m;
      }
    }
    // tame plosive spikes so the loudness can come up
    const T = loud50(main, sr) * 2.8;
    for (let i = 0; i < n; i++) main[i] = Math.tanh(main[i] / T) * T;
    ref = loud50(main, sr);
    const tgt = dB(preset.whisper ? -19 : preset.shout ? -11.5 : -14);
    gain = Math.min(tgt / Math.max(ref, 1e-9), 0.95 / Math.max(peakOf(main), 1e-9));
    for (let i = 0; i < n; i++) main[i] *= gain;
    ref = tgt;
    fadeIn(main, sr, 0.005);
    fadeOut(main, sr, 0.05);
    channels.push(main);
    layout.push('main');
  } else ref = dB(-14);
  // ---- breath layer ----
  const breath = new Float32Array(n);
  const events = score.breaths.slice();
  if (ghostly && mode !== 'breath') {
    // breaths that do not match the words: inhales on top of speech, a long exhale after the line
    const marks = score.marks.filter((m) => m.stress);
    const nIn = 1 + (rng2() < 0.4 + ghost * 0.4 ? 1 : 0) + (ghost > 0.7 && rng2() < 0.5 ? 1 : 0);
    for (let k = 0; k < nIn && marks.length; k++) {
      const m = marks[Math.floor(rng2() * marks.length)];
      events.push({ t: m.t - 0.05 + rng2() * 0.1, dur: 0.35 + rng2() * 0.3, kind: 'in', gain: 1, rattle: ghost > 0.6 ? ghost : 0 });
    }
    events.push({ t: Math.max(0, score.speechStart - 0.25 - rng2() * 0.2), dur: 0.45, kind: 'in', gain: 0.8, rattle: ghost > 0.75 ? ghost * 0.6 : 0 });
    events.push({ t: score.speechEnd + 0.05 + rng2() * 0.25, dur: 0.6 + ghost * 0.5, kind: 'out', gain: 0.9 });
  }
  for (const e of events) {
    const b = breathEvent(sr, e.kind, e.dur, preset, rngFrom(seed + 17 + Math.floor(e.t * 1000)), e.rattle || 0);
    const g = (e.gain ?? 1) / Math.max(1e-6, loud50(b, sr));
    mixInto(breath, b, Math.floor(e.t * sr), g);
  }
  if (events.length) {
    const rel = ghostly ? -14 + 6 * ghost : -21;
    const g = (ref * dB(rel)) / Math.max(1e-9, loud50(breath, sr));
    for (let i = 0; i < n; i++) breath[i] *= g;
    channels.push(breath);
    layout.push('breath');
  }
  // ---- ghost layers ----
  if (ghostly && mode !== 'breath') {
    const gh = Math.max(ghost, 0.5);
    // octave-down double: the same score half the pitch, a longer throat
    const subRng = rngFrom(seed + 2);
    const sub = fit(renderVox(sr, score, voxOpts(preset, subRng, { tail: tailSec, pitchScale: 0.5, formantScale: preset.fs * 0.84, jitter: preset.jitter + 0.012, breath: preset.breath * 0.6, whisper: false, tremor: null })));
    const lp = new SVF(sr, 1400, 0.6);
    for (let i = 0; i < n; i++) sub[i] = lp.process(sub[i]);
    let g = (ref * dB(-15 + 7 * gh)) / Math.max(1e-9, loud50(sub, sr));
    for (let i = 0; i < n; i++) sub[i] *= g;
    channels.push(sub);
    layout.push('sub');
    // whispered double (delayed and placed behind the listener by the rack)
    const wh = fit(renderVox(sr, score, voxOpts(preset, rngFrom(seed + 3), { tail: tailSec, whisper: true, formantScale: preset.fs * 1.03, tremor: null, vibrato: null })));
    g = (ref * dB(-13 + 6 * gh)) / Math.max(1e-9, loud50(wh, sr));
    for (let i = 0; i < n; i++) wh[i] *= g;
    channels.push(wh);
    layout.push('whisper');
    const sw = reverseSwell(wh, sr, at, lead, gh, rng2);
    if (sw) {
      g = (ref * dB(-7 + 3 * gh)) / Math.max(1e-9, loud50(sw, sr));
      for (let i = 0; i < n; i++) sw[i] *= g;
      channels.push(sw);
      layout.push('swell');
    }
  }
  for (const ch of channels) {
    for (let i = 0; i < n; i++) if (!Number.isFinite(ch[i])) ch[i] = 0;
    const p = peakOf(ch);
    if (p > 0.95) for (let i = 0; i < n; i++) ch[i] *= 0.95 / p;
  }
  const stress = score.marks.filter((m) => m.stress).map((m) => +m.t.toFixed(3));
  const sylls = score.marks.map((m) => [m.ci, +m.t.toFixed(3)]);
  return {
    channels,
    meta: {
      layout,
      duration: n / sr,
      speechStart: score.speechStart,
      speechEnd: score.speechEnd,
      stress,
      sylls,
      breaths: events.map((e) => [+e.t.toFixed(3), e.kind]),
      ghost,
      edits,
    },
  };
}

/**
 * Render a Thai line to a murmur buffer (mono Float32Array) — radio DJ, whisper SFX and other one-layer uses.
 * voice: {gender, age, pitch, rate, ghost, whisper}
 */
export function renderMurmur(sr, th, voice = {}, seed = null) {
  const preset = voicePreset(voice);
  const rng = rngFrom(seed ?? hashStr(th + JSON.stringify(voice)));
  const phrases = parseThai(th);
  if (!phrases.length) phrases.push({ sylls: [{ onset: '', cluster: '', vowel: 'schwa', long: true, coda: 'm', glide: '', tone: 'M', ci: 0, stress: true }], pause: 0.2 });
  const ghost = preset.ghost;
  if (ghost > 0) {
    preset.f0 *= 1 - ghost * 0.22;
    preset.rate *= 1 - ghost * 0.22;
    preset.fs *= 1 - ghost * 0.06;
  }
  const score = buildSpeechScore(phrases, preset, rng, { toneDepth: 1 - ghost * 0.3, ghost: 0, lead: 0.04, leadBreath: false });
  let out = renderVox(sr, score, { ...voxOpts(preset, rng), breath: preset.breath + ghost * 0.15, drift: 0.22 + ghost * 0.6, tail: 0.05 });
  // a slightly closed, intimate colour (radio / whisper uses)
  const lp = new SVF(sr, preset.whisper ? 6500 : 6000, 0.6);
  for (let i = 0; i < out.length; i++) out[i] = lp.process(out[i]);
  if (ghost > 0) out = ghostify(sr, out, ghost, rng);
  normalize(out, 0.8);
  fadeIn(out, sr, 0.01);
  fadeOut(out, sr, 0.05);
  return { buffer: out, duration: out.length / sr, phrases };
}

/** Ghost processing baked into a buffer: granular smear, reverse-tail reverb (pre-echo), slow breathing wobble. */
export function ghostify(sr, a, amount, rng) {
  const pre = Math.floor(0.6 * sr * amount);
  const n = a.length + pre + Math.floor(1.2 * sr * amount);
  const out = new Float32Array(n);
  mixInto(out, a, pre, 1 - amount * 0.25);
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
  const rev = bakeVerb(reverse(a), sr, { room: 0.9, damp: 0.5, wet: 1, dry: 0, tail: 0.6 * amount + 0.2 });
  const swell = reverse(rev);
  mixInto(out, swell, pre - (swell.length - a.length), amount * 0.7);
  const tail = bakeVerb(a, sr, { room: 0.85, damp: 0.6, wet: 1, dry: 0, tail: 1.2 * amount });
  mixInto(out, tail, pre, amount * 0.35);
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
  const PLOS = { k: [1800, 2.0], t: [4200, 1.5], p: [900, 1.0], th: [4200, 1.2], ch: [3200, 1.3] };
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
    } else if (PLOS[on]) {
      sc.seg(0.03, { av: 0, af: 0, ah: 0, f0: f });
      sc.seg(0.015, { af: 0.6, ff: PLOS[on][0], ...vp }, { af: 0 });
      used += 0.045;
    }
    const body = Math.max(0.06, d - used - 0.03);
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

export { alloc };
