// Registry of every one-shot / loop sound id plus a task dispatcher that the
// generation worker (or the synchronous fallback) runs. Pure JS: no WebAudio.
import { CAR_SFX } from './sfxCar.js';
import { FOLEY_SFX } from './sfxFoley.js';
import { ANIMAL_SFX } from './sfxAnimals.js';
import { HORROR_SFX } from './sfxHorror.js';
import { rngFrom, hashStr, sanitize, normalize, fadeOut, fadeIn } from './dsp.js';
import { renderInstrument } from './instruments.js';
import { renderMurmur, renderSung } from './speech.js';
import { renderEngineLoop, CAR_CFG, BIKE_CFG } from './engineModel.js';
import { renderBed } from './beds.js';
import { programItem, renderRadioChunk, RADIO_SR } from './songs.js';

export const SOUNDS = { ...CAR_SFX, ...FOLEY_SFX, ...ANIMAL_SFX, ...HORROR_SFX };
export const DEFAULT_SR = 32000;

/** Generate channels for a sound id / variant. Returns {channels, sr}. */
export function generateSound(id, v = 0, loop = false, srOverride = 0) {
  const def = SOUNDS[id];
  if (!def) throw new Error(`unknown sound "${id}"`);
  const sr = srOverride || def.sr || DEFAULT_SR;
  const rng = rngFrom(hashStr(id) + v * 7919 + (loop ? 104729 : 0));
  let res = def.gen({ sr, rng, v, p: {} }, loop && !!def.loopable);
  let channels = Array.isArray(res) ? res : [res];
  channels = channels.map((c) => sanitize(c, loop && !!def.loopable));
  // loudness normalisation: loudest 50 ms window hits the id's target (dBFS RMS), peak capped
  let pk = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) pk = Math.max(pk, Math.abs(c[i]));
  if (pk > 1e-9) {
    const st = shortTermMax(channels, sr);
    const tgt = Math.pow(10, loudnessTarget(id) / 20);
    const g = Math.min(tgt / Math.max(st, 1e-9), (def.norm ?? 0.95) / pk);
    for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= g;
  }
  if (!(loop && def.loopable)) for (const c of channels) {
    fadeIn(c, sr, 0.0008);
    fadeOut(c, sr, 0.004);
  }
  return { channels, sr };
}

/** Max short-term (50 ms) RMS across the buffer (linear). */
function shortTermMax(channels, sr) {
  const w = Math.max(1, Math.floor(sr * 0.05));
  const n = channels[0].length;
  let best = 0;
  for (let s0 = 0; s0 < n; s0 += Math.floor(w / 2)) {
    let e = 0, cnt = 0;
    for (const c of channels) for (let i = s0; i < Math.min(n, s0 + w); i++) {
      e += c[i] * c[i];
      cnt++;
    }
    best = Math.max(best, Math.sqrt(e / Math.max(1, cnt)));
  }
  return best;
}

// Target loudness (dBFS, loudest 50 ms RMS) per sound: sets the relative mix of all SFX.
const LOUD = {
  '-10': 'collision_thud scare_hit elephant_trumpet horn thump_roof',
  '-12': 'door_close knock_trunk engine_start engine_stall sting_low sting_reveal bell_temple giant_hand_rumble dog_bark rooster splash',
  '-14': 'door_open ignition sting_high dog_howl koel gecko neck_snap scream_far branch_crack motorbike_pass elephant_rumble chapter_chime',
  '-16': 'knock scratch_glass heartbeat bone_crack owl frog_croak dog_whine child_laugh_far rain_roof_start wind_chime monk_chant amulet_hum cicada_burst',
  '-18': 'wiper window_crank bush_scrape footstep_puddle footstep_gravel footstep_wood breath_neck whisper giggle alms_bowl spark birds_dawn',
  '-20': 'footstep_asphalt footstep_concrete footstep_grass glovebox handbrake gear_shift seat_creak radio_tune fluorescent_flicker electric_buzz transformer_hum mosquito_buzz',
  '-23': 'coins paper_unfold lighter cigarette_inhale garland_jingle meter_beep key_turn ui_select',
  '-26': 'key_insert radio_click switch_click paper_rustle ui_back',
  '-29': 'indicator_tick ui_hover',
};
const LOUD_MAP = {};
for (const [db, ids] of Object.entries(LOUD)) for (const id of ids.split(' ')) LOUD_MAP[id] = Number(db);
export function loudnessTarget(id) {
  return LOUD_MAP[id] ?? -18;
}

/** Task dispatcher shared by worker and main thread. */
export function runTask(type, a) {
  switch (type) {
    case 'sfx':
      return generateSound(a.id, a.v, a.loop, a.sr);
    case 'inst': {
      const sr = a.sr || DEFAULT_SR;
      return { channels: [sanitize(renderInstrument(sr, a.inst, a.f, a.vel, a.seed, a.extra || {}), a.inst === 'drone')], sr };
    }
    case 'murmur': {
      const sr = a.sr || 24000;
      const r = renderMurmur(sr, a.th, a.voice || {}, a.seed);
      return { channels: [sanitize(r.buffer)], sr, meta: { duration: r.duration } };
    }
    case 'sung': {
      const sr = a.sr || 24000;
      const b = renderSung(sr, a.notes, a.voice || {}, a.seed || 1);
      normalize(sanitize(b), 0.85);
      return { channels: [b], sr };
    }
    case 'engineLoop': {
      const sr = a.sr || DEFAULT_SR;
      const cfg = a.cfg === 'bike' ? BIKE_CFG : CAR_CFG;
      const r = renderEngineLoop(sr, cfg, a.rpm, a.load, a.seconds || 1.8, a.seed || 1);
      return { channels: [r.buffer], sr, meta: { baseRpm: r.baseRpm } };
    }
    case 'bed': {
      const r = renderBed(a.kind, a.sr || DEFAULT_SR, a.seed || 1, a.opts || {});
      return { channels: r.channels.map((c) => sanitize(c, true)), sr: r.sr };
    }
    case 'radioChunk': {
      const plan = programItem(a.station, a.n);
      const b = renderRadioChunk(plan, a.ci);
      return { channels: [sanitize(b)], sr: RADIO_SR, meta: { windowDur: plan.chunks[a.ci].dur, chunks: plan.chunks.length } };
    }
    default:
      throw new Error(`unknown task ${type}`);
  }
}

/** Ordered list of all sound ids (documented in src/audio/index.js). */
export const SOUND_IDS = Object.keys(SOUNDS);
