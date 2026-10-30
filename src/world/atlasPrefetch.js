// Paint the forest's leaf atlas + silhouette strips in a Web Worker from module load on (the boot
// spends seconds on other textures meanwhile). Forest.build waits for it briefly; without
// OffscreenCanvas / workers the main thread paints them as before (identical result).
import { adoptAtlasPixels } from './foliageAtlas.js';

let _promise = null;

export function prefetchAtlas(timeoutMs = 60000) {
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
      resolve();
    };
    try {
      if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof window === 'undefined') return finish();
      // the 2D context must exist in workers (Safari < 16.4 has OffscreenCanvas without it)
      if (!new OffscreenCanvas(1, 1).getContext('2d')) return finish();
      worker = new Worker(new URL('./atlasWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const d = e.data || {};
        if (d.kind === 'atlas') adoptAtlasPixels('atlas', { size: d.size, data: d.data });
        else if (d.kind === 'flats') adoptAtlasPixels('flats', { data: d.data });
        if (d.error) console.warn('[world] atlas worker:', d.error);
        if (d.done) finish();
      };
      worker.onerror = (e) => {
        console.warn('[world] atlas worker unavailable, painting on the main thread', e?.message || e);
        finish();
      };
      worker.postMessage({});
      timer = setTimeout(finish, timeoutMs);
    } catch (e) {
      finish();
    }
  });
  return _promise;
}

/** Wait for the prefetch (if started), at most ms. */
export function atlasReady(ms = 20000) {
  if (!_promise) return Promise.resolve();
  return Promise.race([_promise, new Promise((r) => setTimeout(r, ms))]);
}
