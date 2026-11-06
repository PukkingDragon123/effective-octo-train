// Gibberish voice QA (audio module): the recorded-voice banks decoded in the browser, then every cast line through
// the full chain (voice rack -> voice bus -> master limiter, offline, HRTF) with the voices sandbox's measurements.
//   node tools/shot.mjs --sandbox=audio-gibberish --out=.shots/gib.png --timeout=900000 --eval="return window.__gibTest"
//   params: formant=1 (also measure the old formant voice first), only=<name filter>
import { runQA } from './voices.js';
import { AudioSystem } from '../audio/index.js';
import { VOICE_SPEAKERS } from '../audio/Synth/gibberish.js';
import { VoiceBanks } from '../audio/VoiceBanks.js';

const sum = (r) =>
  r && {
    living: r.voiceMedianLufs,
    ghost: r.ghostMedianLufs,
    maxTP: r.maxTruePeakDb,
    bad: r.bad,
    rows: r.rows.map((x) => [x.name, x.lufs, x.momMax, x.truePeakDb, x.clip, x.nan, x.dur, x.genMs, x.layout, x.error || '']),
  };

export default async function ({ params }) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const q = new URLSearchParams('refs=0' + (params.get('only') ? '&only=' + params.get('only') : ''));
  window.__gibTest = (async () => {
    if (params.get('workers') === '1') {
      // the in-game path: real AudioContext, banks pinned to synth worker 0, lines rendered there
      const sys = new AudioSystem({ offline: true });
      sys.attachContext(new AudioContext(), {});
      const t0 = performance.now();
      const ok = await sys.voice.banks.ensure('m1');
      const line = { th: 'ครับ เดี๋ยวผมไปส่งที่หมู่บ้านนะครับ', voice: { gender: 'm', age: 27, pitch: 0.95 } };
      const d = sys.voice._desc(line);
      const buf = await sys.core.task(sys.voice._key(d, 'murmur'), 'voiceLine', sys.voice._args(d, 'murmur'), 0);
      const wk = sys.core.gen.pool.length;
      return (window.__gibReport = { workers: wk, ok, ms: Math.round(performance.now() - t0), bank: buf?._meta?.bank, dur: buf?.duration, layout: buf?._meta?.layout, path: sys.voice.lastPath, info: sys.voice.banks.info() });
    }
    if (params.get('formant') === '1') {
      // the old formant voice only (for level comparison)
      VoiceBanks.enabled = false;
      const base = await runQA(root, q);
      return (window.__gibReport = { formant: sum(base) });
    }
    const base = null;
    const sys = new AudioSystem({ offline: true });
    sys.attachContext(new OfflineAudioContext(1, 128, 24000), { sync: true });
    const t0 = performance.now();
    const ok = await Promise.all(Object.keys(VOICE_SPEAKERS).map((id) => sys.voice.banks.ensure(id)));
    const loadMs = Math.round(performance.now() - t0);
    root.textContent = '';
    const rep = await runQA(root, q);
    return (window.__gibReport = { loadMs, ok, banks: sys.voice.banks.info(), formant: sum(base), gibberish: sum(rep) });
  })();
}
