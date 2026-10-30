// Mesh the SDF sculpts the world uses in a Web Worker as soon as the props module loads (the
// boot spends seconds painting textures meanwhile), so building the shrine / statues later only
// copies finished geometry. Falls back silently: sculpt() meshes on the main thread when a
// result has not arrived (identical output either way).
import { adoptSculpt } from './sdf.js';

// [figures.js export, args]: the shrine first (the menu shows it), then the rest
const JOBS = [
  ['deityHeadGeo', []],
  ['deityBodyGeo', []],
  ['lionGeo', [false]],
  ['lionGeo', [true]],
  ['zebraGeo', []],
  ['dancerGeo', []],
  ['elderGeo', [false]],
  ['elderGeo', [true]],
  ['buddhaSeatedGeo', [true, 1]],
  ['buddhaSeatedGeo', [false, 0.85]],
  ['nagaGeo', []],
];

let _promise = null;
const _adopted = new Set();
const _waiters = new Set();
const _notify = () => {
  for (const w of _waiters) if (w.keys.every((k) => _adopted.has(k))) w.done();
};

/** Start the worker (once). Resolves when every job has been adopted, failed or timed out. */
export function prefetchSculpts(timeoutMs = 60000) {
  if (_promise) return _promise;
  _promise = new Promise((resolve) => {
    let worker = null;
    let timer = null;
    const finish = () => {
      clearTimeout(timer);
      try {
        worker?.terminate();
      } catch (e) {
        /* ignore */
      }
      for (const w of _waiters) w.done();
      resolve();
    };
    try {
      if (typeof Worker === 'undefined' || typeof window === 'undefined') return finish();
      worker = new Worker(new URL('./sculptWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const d = e.data || {};
        for (const s of d.entries || []) {
          adoptSculpt(s);
          _adopted.add(s.key);
        }
        if (d.entries?.length) _notify();
        if (d.error) console.warn('[props] sculpt worker:', d.error);
        if (d.done) finish();
      };
      worker.onerror = (e) => {
        console.warn('[props] sculpt worker unavailable, meshing on the main thread', e?.message || e);
        finish();
      };
      worker.postMessage({ jobs: JOBS });
      timer = setTimeout(finish, timeoutMs);
    } catch (e) {
      finish();
    }
  });
  return _promise;
}

/**
 * Wait for the prefetch (if one was started) but never longer than ms. keys: only wait for
 * these sculpt cache keys (e.g. ['deityHead', 'deityBody']).
 */
export function sculptsReady(ms = 15000, keys = null) {
  if (!_promise) return Promise.resolve();
  const timeout = new Promise((r) => setTimeout(r, ms));
  if (!keys) return Promise.race([_promise, timeout]);
  if (keys.every((k) => _adopted.has(k))) return Promise.resolve();
  const p = new Promise((r) => {
    const w = { keys, done: () => (_waiters.delete(w), r()) };
    _waiters.add(w);
  });
  return Promise.race([p, _promise, timeout]);
}
