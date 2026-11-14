// Procedural one-off voices for the close scares and the pret (fallback synthesis: there is no
// recording for these). Each is rendered once into an AudioBuffer on the game's audio context and
// cached; play them with playVoice(buf, { position | object, volume, bus }) (audio.playBuffer).
//   whistleBuffer()  the pret's high, thin, breathy whistling cry (a needle-eye mouth trying to call)
//   shriekBuffer()   a close, dry, tearing shriek (the scream into the camera)
//   crunchBuffer()   wet crunching and tearing (being eaten)
import { audio } from '../audio/index.js';

const CACHE = new Map();
const TAU = Math.PI * 2;

function ctx() {
  return audio?.ctx || null;
}
function make(key, seconds, sr, fill) {
  const c = ctx();
  if (!c) return null;
  const k = key + '@' + c.sampleRate;
  if (CACHE.has(k)) return CACHE.get(k);
  const n = Math.max(1, Math.floor(seconds * sr));
  const buf = c.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  fill(d, sr, rngOf(key.length * 7919 + 13));
  let pk = 0;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
  if (pk > 0) for (let i = 0; i < n; i++) d[i] = (d[i] / pk) * 0.92;
  CACHE.set(k, buf);
  return buf;
}
function rngOf(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
// a state-variable band pass on white noise
function bandNoise(rng) {
  let lo = 0, bp = 0;
  return (f, q, sr) => {
    const F = 2 * Math.sin((Math.PI * Math.min(f, sr * 0.45)) / sr);
    const x = rng() * 2 - 1;
    const hp = x - lo - q * bp;
    bp += F * hp;
    lo += F * bp;
    return bp;
  };
}

/** The pret's cry: a thin whistle that bends up and won't resolve, breath hissing through a pinhole. */
export function whistleBuffer() {
  return make('pretWhistle', 4.2, 24000, (d, sr, rng) => {
    const n = d.length;
    const air = bandNoise(rng), air2 = bandNoise(rng);
    let ph = 0, ph2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, k = t / 4.2;
      // envelope: a breath in, the long thin note, a broken tail
      const env = Math.min(1, t / 0.35) * (k < 0.78 ? 1 : Math.max(0, 1 - (k - 0.78) / 0.22)) * (0.82 + 0.18 * Math.sin(TAU * 0.7 * t));
      // pitch: rises in a slow uneven bend, wavers, cracks once near the end
      let f = 2350 + 900 * Math.pow(Math.min(1, k * 1.4), 1.6) + 70 * Math.sin(TAU * 5.3 * t + Math.sin(TAU * 0.9 * t) * 2);
      if (k > 0.62 && k < 0.66) f *= 1.32; // the crack
      f += (rng() - 0.5) * 30;
      ph += (TAU * f) / sr;
      ph2 += (TAU * f * 2.01) / sr;
      const tone = Math.sin(ph) * 0.62 + Math.sin(ph2) * 0.07;
      // pinhole breath: a narrow hiss at the note, a wider one under it
      const hiss = air(f, 0.06, sr) * 0.55 + air2(5200, 0.5, sr) * 0.16;
      // the wet flutter of the lips
      const flutter = 0.75 + 0.25 * Math.sin(TAU * (31 + 9 * Math.sin(TAU * 0.4 * t)) * t);
      d[i] = (tone * flutter + hiss) * env;
    }
    // a faint far echo (the trees)
    const dl = Math.floor(0.19 * sr);
    for (let i = n - 1; i >= dl; i--) d[i] += d[i - dl] * 0.28;
  });
}

/** A close, dry, tearing shriek: a voice that has not breathed in a long time. */
export function shriekBuffer() {
  return make('closeShriek', 1.6, 24000, (d, sr, rng) => {
    const n = d.length;
    const f1 = bandNoise(rng), f2 = bandNoise(rng), f3 = bandNoise(rng);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.025) * Math.max(0, 1 - Math.max(0, t - 1.0) / 0.6);
      const f0 = 520 + 260 * Math.min(1, t * 6) - 90 * t + (rng() - 0.5) * 60 + 40 * Math.sin(TAU * 11 * t);
      ph += (TAU * f0) / sr;
      // a rasping pulse train (saw, clipped), formants of a strained 'ae', a scrape of air over it
      const saw = ((ph / TAU) % 1) * 2 - 1;
      const src = Math.tanh(saw * 2.4) * (0.6 + 0.4 * rng());
      const voice = f1(1100, 0.12, sr) * 0.9 + f2(2300, 0.1, sr) * 0.7 + f3(3600, 0.14, sr) * 0.4;
      d[i] = Math.tanh((src * 0.35 + voice * 3.2 * (0.6 + 0.4 * Math.abs(src))) * 1.6) * env;
    }
  });
}

/** Wet crunching and tearing: cartilage giving, something pulled apart. */
export function crunchBuffer() {
  return make('crunchTear', 2.0, 24000, (d, sr, rng) => {
    const n = d.length;
    const wet = bandNoise(rng), low = bandNoise(rng);
    const cracks = [0.02, 0.11, 0.16, 0.34, 0.41, 0.62, 0.69, 0.97, 1.2];
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let v = 0;
      // crunches: dense bursts of tiny clicks
      for (const c of cracks) {
        const u = t - c;
        if (u >= 0 && u < 0.07) v += (rng() < 0.35 ? (rng() * 2 - 1) : 0) * Math.exp(-u * 55) * 1.3;
      }
      // the tear: a slow rising band of wet noise, squelching amplitude
      const tear = t > 0.3 && t < 1.7 ? Math.sin(Math.PI * ((t - 0.3) / 1.4)) : 0;
      const sq = 0.5 + 0.5 * Math.sin(TAU * (6 + 4 * rng()) * t);
      v += wet(600 + 1600 * tear, 0.25, sr) * tear * sq * 2.2;
      v += low(140, 0.4, sr) * (0.6 + tear) * 1.4 * Math.exp(-t * 0.8);
      d[i] = Math.tanh(v * 1.4);
    }
  });
}

/** Play a buffer from this module (guarded). opts as audio.playBuffer. */
export function playVoice(buf, opts = {}) {
  if (!buf) return null;
  try {
    return audio?.playBuffer?.(buf, { bus: 'sfx', ...opts }) || null;
  } catch (e) {
    return null;
  }
}
