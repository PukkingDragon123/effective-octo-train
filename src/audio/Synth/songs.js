// Original songs for the diegetic radio, rendered in chunks (a few bars at a
// time) inside the synth worker:
//   station 1  luk thung (phin riffs, khaen, ching/chap, bass, sung vocal with ornaments)
//   station 2  old string-era ballads (brushes, walking bass, piano comping, brass pads, reed + crooner)
//   station 3  late night only: the father's favourite song (memory m_song), 03:00–04:00
//   station 4  dhamma talk (calm monk murmur, small bell)
//   + DJ chatter between songs.
// Plans are pure + deterministic so the main thread can compute timing while
// the worker renders audio.
import { rngFrom, alloc, mixInto, softClip, SVF, OnePole } from './dsp.js';
import { renderInstrument } from './instruments.js';
import { renderSung, renderMurmur } from './speech.js';

const ET = (s) => Math.pow(2, s / 12);

/** The father's favourite song (original). melody: [semitones from G4, beats]; chords per bar (semitones from G3). */
export const FATHER_SONG = {
  title: { th: 'ฝากรักไว้ที่ปลายทาง', en: 'Leave My Love at the Road’s End' },
  melody: [
    [4, 1], [7, 1], [9, 2], [7, 1.5], [4, 0.5], [2, 2], [0, 1], [2, 1], [4, 1], [7, 1], [9, 4],
    [12, 1], [9, 1], [7, 2], [4, 1.5], [7, 0.5], [2, 2], [0, 1], [-3, 1], [-5, 1], [-3, 1], [0, 4],
    [9, 1], [12, 1], [14, 2], [12, 1.5], [9, 0.5], [7, 2], [4, 1], [7, 1], [9, 1], [12, 1], [7, 4],
    [9, 1], [7, 1], [4, 2], [2, 1.5], [4, 0.5], [7, 2], [-3, 1], [0, 1], [2, 1], [4, 1], [0, 4],
  ],
  chords: [
    [0, 4, 7, 11], [-1, 2, 7], [-3, 0, 4, 7], [-7, -3, 0, 5], [-8, 0, 4, 7], [-5, -1, 2, 7], [-7, -3, 0, 5], [-12, 0, 4, 7],
    [-7, -3, 0, 5], [0, 4, 7, 11], [-3, 0, 4, 7], [-5, -1, 2, 7], [-7, -3, 0, 4], [-5, -1, 2, 6], [-10, -7, -3, 0], [-12, 0, 4, 7],
  ],
};

const RADIO_SR = 16000;
const CHUNK_BARS = 4;

// ---------------------------------------------------------------- plans
const LT_TITLES = [
  { th: 'สาวนาคอยรัก', en: 'The Rice-Field Girl Waits' },
  { th: 'รถเมล์สายสุดท้าย', en: 'The Last Bus Home' },
  { th: 'ฝนตกที่บ้านเกิด', en: 'Rain Over My Hometown' },
  { th: 'คิดถึงแม่ที่อีสาน', en: 'Missing Mother in Isan' },
];
const BL_TITLES = [
  { th: 'ราตรีประดับดาว', en: 'Night Adorned with Stars' },
  { th: 'จันทร์เจ้าขา', en: 'Dear Moon' },
  { th: 'ลมหนาวที่เชียงคาน', en: 'Cool Wind at the River Town' },
];

function pentDeg(root, deg, scale) {
  const o = Math.floor(deg / scale.length);
  const i = ((deg % scale.length) + scale.length) % scale.length;
  return root + scale[i] + 12 * o;
}

function genMelodyBars(rng, bars, scale, rootMidi, center, beatsPerBar = 4, dense = 0.6) {
  // returns [{t (beats from section start), dur (beats), midi, orn}]
  const notes = [];
  let motif = null;
  for (let b = 0; b < bars; b += 2) {
    if (!motif || rng() < 0.4) {
      motif = [];
      let d = center + Math.floor(rng() * 3) - 1;
      let t = rng() < 0.5 ? 0 : 0.5;
      while (t < beatsPerBar * 2 - 1.5) {
        const dur = rng() < dense ? 0.5 : rng() < 0.7 ? 1 : 1.5;
        motif.push({ t, dur, deg: d });
        t += dur;
        d += rng() < 0.45 ? 1 : rng() < 0.85 ? -1 : 2;
        d = Math.max(center - 4, Math.min(center + 5, d));
      }
      motif.push({ t, dur: beatsPerBar * 2 - t - 0.25, deg: center + (rng() < 0.5 ? 0 : -1), orn: true });
    }
    const shift = b % 4 === 2 ? (rng() < 0.5 ? 1 : -1) : 0;
    for (const n of motif) notes.push({ t: b * beatsPerBar + n.t, dur: n.dur, midi: pentDeg(rootMidi, n.deg + shift, scale), orn: !!n.orn });
  }
  return notes;
}

function lukthungPlan(idx) {
  const rng = rngFrom(1000 + idx * 17);
  const minor = idx % 2 === 0;
  const scale = minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  const rootMidi = minor ? 57 + Math.floor(rng() * 3) : 55 + Math.floor(rng() * 4); // A3.. / G3..
  const bpm = 118 + Math.floor(rng() * 16);
  const prog = minor ? [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7]] : [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]];
  const sections = [['intro', 4], ['A', 8], ['B', 8], ['inst', 4], ['A', 8], ['B', 8], ['outro', 4]];
  const melA = genMelodyBars(rng, 8, scale, rootMidi, 6, 4, 0.55);
  const melB = genMelodyBars(rng, 8, scale, rootMidi, 8, 4, 0.5);
  const riff = genMelodyBars(rng, 2, scale, rootMidi + 12, 3, 4, 0.85).map((n) => ({ ...n, orn: false }));
  return { kind: 'lukthung', station: 1, idx, title: LT_TITLES[idx % LT_TITLES.length], bpm, beatsPerBar: 4, scale, rootMidi, prog, sections, melA, melB, riff, voice: { gender: idx % 3 === 1 ? 'm' : 'f', age: 30 } };
}

function balladPlan(idx, father = false) {
  const rng = rngFrom(2000 + idx * 31 + (father ? 999 : 0));
  const rootMidi = father ? 55 : 53 + Math.floor(rng() * 5);
  const bpm = father ? 78 : 86 + Math.floor(rng() * 12);
  const prog = father ? FATHER_SONG.chords : [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5], [0, 4, 7, 11], [-3, 0, 4, 9], [2, 5, 9, 12], [-5, -1, 2, 7]];
  const sections = father ? [['intro', 2], ['A', 16], ['inst', 8], ['A', 16], ['outro', 2]] : [['intro', 4], ['A', 8], ['A', 8], ['inst', 8], ['A', 8], ['outro', 4]];
  let melA;
  if (father) {
    melA = [];
    let t = 0;
    for (const [s, b] of FATHER_SONG.melody) {
      melA.push({ t, dur: b, midi: 67 + s - 12 * (rootMidi < 60 ? 1 : 0), orn: b >= 4 });
      t += b;
    }
  } else melA = genMelodyBars(rng, 8, [0, 2, 4, 7, 9], rootMidi + 12, 4, 4, 0.35);
  return { kind: 'ballad', station: father ? 3 : 2, idx, father, title: father ? FATHER_SONG.title : BL_TITLES[idx % BL_TITLES.length], bpm, beatsPerBar: 4, rootMidi, prog, sections, melA, melB: melA, voice: { gender: 'm', age: father ? 50 : 35, pitch: father ? 0.95 : 1 } };
}

const DHAMMA = [
  'ทุกสิ่งในโลกนี้ ล้วนไม่เที่ยง เกิดขึ้น ตั้งอยู่ แล้วก็ดับไป',
  'จงอยู่กับลมหายใจ หายใจเข้ารู้ หายใจออกรู้',
  'ความโกรธเหมือนถ่านไฟ ที่เรากำไว้ในมือ คนที่ร้อนก็คือตัวเราเอง',
  'อย่าแบกอดีตไว้ อย่ากังวลถึงอนาคต จงอยู่กับปัจจุบัน',
  'การให้อภัย คือการปล่อยตัวเราเองให้เป็นอิสระ',
  'บุญที่ทำแล้ว ย่อมติดตามตัวเราไป เหมือนเงาตามตัว',
  'ผู้ที่จากไปแล้ว รอเพียงความระลึกถึงด้วยใจที่สงบ',
];
const DJ = [
  'สวัสดีค่ะ คุณผู้ฟัง ยามดึกแบบนี้ ขับรถกันระวังนะคะ',
  'เพลงต่อไป ขอมอบให้คนที่ยังไม่ได้กลับบ้านค่ะ',
  'คืนนี้ฝนตกหนัก ใครเดินทางอยู่ ขอให้ปลอดภัยนะคะ',
  'คลื่นนี้อยู่เป็นเพื่อนคุณ จนถึงเช้าค่ะ',
];

function dhammaPlan(idx) {
  return { kind: 'talk', station: 4, idx, title: { th: 'ธรรมะยามดึก', en: 'Late-Night Dhamma' }, text: DHAMMA[idx % DHAMMA.length], voice: { gender: 'm', age: 45, pitch: 0.92, rate: 0.72 }, bell: idx % 3 === 0 };
}
function djPlan(station, idx) {
  return { kind: 'dj', station, idx, title: { th: 'ดีเจ', en: 'DJ' }, text: DJ[idx % DJ.length], voice: { gender: station === 2 ? 'm' : 'f', age: 32, rate: 1.15, pitch: 1.05 } };
}

/** Program item n for a station: songs with DJ breaks. Returns plan + {chunks, chunkDur(beats->s)}. */
export function programItem(station, n) {
  let plan;
  if (station === 4) plan = dhammaPlan(n);
  else if (station === 3) plan = balladPlan(0, true);
  else if (n % 2 === 1) plan = djPlan(station, (n - 1) / 2);
  else plan = station === 1 ? lukthungPlan(n / 2) : balladPlan(n / 2);
  return withTiming(plan);
}

function withTiming(plan) {
  if (plan.kind === 'talk' || plan.kind === 'dj') {
    // estimated speech length: ~0.19 s per Thai char-ish cluster
    const est = Math.max(4, plan.text.length * (plan.kind === 'talk' ? 0.16 : 0.1)) + (plan.kind === 'talk' ? 2.5 : 1.5);
    plan.chunks = [{ start: 0, dur: est }];
    plan.duration = est;
    return plan;
  }
  const barDur = (60 / plan.bpm) * plan.beatsPerBar;
  const totalBars = plan.sections.reduce((a, s) => a + s[1], 0);
  plan.barDur = barDur;
  plan.totalBars = totalBars;
  plan.chunks = [];
  for (let b = 0; b < totalBars; b += CHUNK_BARS) plan.chunks.push({ start: b * barDur, dur: Math.min(CHUNK_BARS, totalBars - b) * barDur, bar0: b });
  plan.duration = totalBars * barDur;
  return plan;
}

// ---------------------------------------------------------------- rendering
const noteCache = new Map();
function noteBuf(inst, f, vel, extra) {
  const key = inst + ':' + f.toFixed(2) + ':' + vel + ':' + (extra ? JSON.stringify(extra) : '');
  let b = noteCache.get(key);
  if (!b) {
    b = renderInstrument(RADIO_SR, inst, f, vel, Math.round(f * 3) % 997, extra || {});
    noteCache.set(key, b);
    if (noteCache.size > 400) noteCache.delete(noteCache.keys().next().value);
  }
  return b;
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function sectionAt(plan, bar) {
  let b0 = 0;
  for (const [name, n] of plan.sections) {
    if (bar < b0 + n) return { name, local: bar - b0, start: b0 };
    b0 += n;
  }
  return { name: 'outro', local: 0, start: b0 };
}

/** Render chunk `ci` of a plan. Returns mono Float32Array (window + tail). */
export function renderRadioChunk(plan, ci) {
  const sr = RADIO_SR;
  const ch = plan.chunks[ci];
  if (plan.kind === 'talk' || plan.kind === 'dj') {
    const voice = plan.voice;
    const { buffer } = renderMurmur(sr, plan.text, voice, 300 + plan.idx * 13 + plan.station);
    const out = alloc(sr, Math.max(ch.dur, buffer.length / sr + 0.5) + 2);
    const at = plan.kind === 'dj' ? 0.9 : 0.6;
    mixInto(out, buffer, Math.floor(at * sr), plan.kind === 'dj' ? 1.1 : 1.35);
    if (plan.kind === 'dj') {
      // station jingle: quick khim arpeggio
      [0, 4, 7, 12, 16].forEach((s, i) => mixInto(out, noteBuf('khim', mtof(67 + s), 0.85), Math.floor((0.05 + i * 0.09) * sr), 0.25));
    }
    if (plan.bell) mixInto(out, noteBuf('bell', 880, 0.45), 0, 0.2);
    // room tone
    const lp = new OnePole(sr, 400);
    let s = plan.idx * 77 + 1;
    for (let i = 0; i < out.length; i++) {
      s = (s * 16807) % 2147483647;
      out[i] += lp.lp((s / 2147483647) * 2 - 1) * 0.01;
    }
    ch.dur = Math.max(ch.dur, buffer.length / sr + at + 0.4);
    return finish(out);
  }
  const spb = 60 / plan.bpm;
  const out = alloc(sr, ch.dur + 3);
  const bar0 = ch.bar0;
  const nb = Math.round(ch.dur / plan.barDur);
  const vocal = [];
  const rng = rngFrom(plan.idx * 101 + ci * 7 + plan.station);
  const put = (inst, f, tSec, gain, vel = 0.85, extra = null) => {
    if (tSec < -0.01 || tSec > ch.dur + 0.01) return;
    mixInto(out, noteBuf(inst, f, vel, extra), Math.floor(Math.max(0, tSec) * sr), gain);
  };
  const swing = plan.kind === 'ballad' ? 0.62 : 0.5;
  for (let b = 0; b < nb; b++) {
    const bar = bar0 + b;
    const sec = sectionAt(plan, bar);
    const tb = b * plan.barDur;
    const chord = plan.prog[bar % plan.prog.length];
    const root = plan.rootMidi - 12;
    const last = bar === plan.totalBars - 1;
    if (plan.kind === 'lukthung') {
      // drums: kick 1 & 3, tek (slap) 2 & 4, ching/chap time-keeping on every beat, shaker 8ths
      for (let q = 0; q < 4; q++) {
        const t = tb + q * spb;
        if (q % 2 === 0) put('kick', 1, t, 0.55);
        else put('tek', 1, t, 0.4);
        put(q % 2 ? 'ching' : 'chap', 1, t + (q % 2 ? 0 : spb * 0.5), q % 2 ? 0.22 : 0.16, 0.45);
        put('shaker', 1, t + spb * 0.5, 0.08, 0.45);
      }
      if (sec.name !== 'intro' || sec.local > 0) {
        // bass: root-fifth bounce
        const r = mtof(root + chord[0] - 12);
        [0, 1.5, 2, 3.5].forEach((q, i) => put('bass', i % 2 ? r * ET(7) : r, tb + q * spb, 0.5, 0.85));
      }
      // khaen chord pad (stronger in chorus)
      const khF = chord.map((s) => mtof(root + 12 + s));
      put('khaen', khF[0], tb, sec.name === 'B' ? 0.3 : 0.18, 0.45, { freqs: khF, dur: +(plan.barDur + 0.1).toFixed(2), breathRate: 0 });
      // phin riff in intro / inst / outro, fills elsewhere
      if (sec.name === 'intro' || sec.name === 'inst' || sec.name === 'outro') {
        for (const n of plan.riff) if (Math.floor(n.t / 4) === sec.local % 2) put('phin', mtof(n.midi), tb + (n.t % 4) * spb, 0.42, 0.85);
      } else if (sec.local % 2 === 1) {
        put('phin', mtof(plan.rootMidi + 12 + plan.scale[(bar * 3) % 5]), tb + 3.5 * spb, 0.25, 0.85);
      }
    } else {
      // ballad: brushes, walking bass, piano comping on 2 & 4, brass pad, reed melody in the instrumental
      for (let q = 0; q < 4; q++) {
        const t = tb + q * spb;
        put('brush', 1, t, q % 2 ? 0.2 : 0.12, 0.45);
        put('brush', 1, t + spb * swing, 0.06, 0.45);
        if (q % 2 === 1) {
          for (const s of chord.slice(0, 4)) put('piano', mtof(root + 12 + s), t, 0.13, 0.45);
        }
        const walk = [chord[0], chord[1] ?? chord[0] + 4, chord[2] ?? chord[0] + 7, (chord[0] + (q === 3 ? -1 : 2))][q];
        put('bass', mtof(root - 12 + walk), t, 0.42, 0.85);
      }
      if (b % 2 === 0) put('brass', mtof(root + 12 + chord[1]), tb, 0.12, 0.45, { dur: +(plan.barDur * 1.8).toFixed(2) });
      if (sec.name === 'inst') {
        // reed takes the melody
        for (const n of plan.melA) {
          const nbar = Math.floor(n.t / 4);
          if (nbar === sec.local) put('reed', mtof(n.midi), tb + (n.t % 4) * spb, 0.3, 0.85, { dur: +(n.dur * spb * 0.95).toFixed(2) });
        }
      }
    }
    // vocal notes for this bar
    if (sec.name === 'A' || sec.name === 'B') {
      const mel = sec.name === 'B' ? plan.melB : plan.melA;
      for (const n of mel) {
        const nbar = Math.floor(n.t / 4);
        if (nbar === sec.local % (plan.father ? 16 : 8)) vocal.push({ t: tb + (n.t % 4) * spb, dur: n.dur * spb * 0.97, midi: n.midi, orn: n.orn });
      }
    }
    if (last) put(plan.kind === 'lukthung' ? 'ching' : 'piano', plan.kind === 'lukthung' ? 1 : mtof(root + 12), tb + plan.barDur, 0.3, 0.45);
  }
  if (vocal.length) {
    const v = renderSung(sr, vocal, plan.voice, plan.idx * 11 + ci);
    mixInto(out, v, 0, plan.kind === 'lukthung' ? 0.75 : 0.65);
  }
  return finish(out);
}

function finish(out) {
  // gentle broadcast-style limiting (no hard saturation on vocal onsets)
  let env = 0;
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i]);
    env = a > env ? env + (a - env) * 0.02 : env * 0.9997;
    const g = env > 0.6 ? 0.6 / env : 1;
    out[i] = softClip(out[i] * g * 0.75) * 0.9;
  }
  return out;
}

export { RADIO_SR };
