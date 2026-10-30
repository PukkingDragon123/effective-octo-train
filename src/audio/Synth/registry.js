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
  // joint normalisation
  let pk = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) pk = Math.max(pk, Math.abs(c[i]));
  const target = def.norm ?? 0.89;
  if (pk > 1e-9) for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= target / pk;
  if (!(loop && def.loopable)) for (const c of channels) {
    fadeIn(c, sr, 0.0008);
    fadeOut(c, sr, 0.004);
  }
  return { channels, sr };
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
