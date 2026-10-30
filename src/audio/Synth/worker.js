// Background synthesis worker: runs the pure-JS generators off the main thread
// and transfers the resulting sample arrays back.
import { runTask } from './registry.js';

self.onmessage = (e) => {
  const { id, type, args } = e.data;
  try {
    const res = runTask(type, args);
    const transfer = [...new Set(res.channels.map((c) => c.buffer))];
    self.postMessage({ id, ok: true, res }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.stack) || err) });
  }
};
