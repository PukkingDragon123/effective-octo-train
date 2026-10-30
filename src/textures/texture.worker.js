// Texture generation worker: runs pure typed-array generators off the main thread.
// Message in: { id, key (family's first key), size }. Out: { id, ok, raws | error } with
// transferred pixel buffers. Families flagged `dom` (canvas text) never come here.
import { FAMILIES } from './registry.js';

const byKey = new Map(FAMILIES.map((f) => [f.keys[0], f]));

self.onmessage = (e) => {
  const { id, key, size } = e.data;
  const fam = byKey.get(key);
  try {
    const t0 = performance.now();
    const raws = fam.gen(size);
    const out = {};
    const transfer = [];
    for (const [k, r] of Object.entries(raws)) {
      out[k] = r;
      transfer.push(r.data.buffer);
    }
    self.postMessage({ id, ok: true, raws: out, ms: performance.now() - t0 }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.stack ? err.stack : err) });
  }
};
