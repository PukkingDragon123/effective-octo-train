// Worker: meshes the organic SDF sculpts (deity, Buddhas, lions, figurines, naga) off the main
// thread while the game boots, and sends the finished geometry arrays back (sculptPrefetch.js).
import * as F from './figures.js';
import { sculptEntries } from './sdf.js';

self.onmessage = (e) => {
  for (const [fn, args] of e.data.jobs || []) {
    try {
      F[fn](...args);
      const out = sculptEntries().filter((s) => !sent.has(s.key));
      for (const s of out) sent.add(s.key);
      if (out.length) self.postMessage({ entries: out }, out.flatMap((s) => [s.position.buffer, s.normal.buffer, s.uv.buffer, s.color.buffer, s.index.buffer]));
    } catch (err) {
      self.postMessage({ error: String(err?.message || err) });
    }
  }
  self.postMessage({ done: true });
};
const sent = new Set();
