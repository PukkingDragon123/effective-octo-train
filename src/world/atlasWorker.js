// Worker: paints the foliage atlas and the tree-line silhouettes (OffscreenCanvas) while the game
// boots, and sends the pixels back (see atlasPrefetch.js). Same painting code as the main thread.
import { atlasPixels, silhouettePixels, ATLAS_SIZE } from './foliageAtlas.js';

self.onmessage = () => {
  try {
    const a = atlasPixels(ATLAS_SIZE);
    self.postMessage({ kind: 'atlas', size: ATLAS_SIZE, data: a }, [a.buffer]);
    const f = silhouettePixels();
    self.postMessage({ kind: 'flats', data: f }, [f.buffer]);
  } catch (err) {
    self.postMessage({ error: String(err?.message || err) });
  }
  self.postMessage({ done: true });
};
