// Runtime MakeHuman character pack (built by tools/characters/build_mh.py + textures.py):
//   public/assets/characters/mh/mh.json + mh.bin   bodies, morphs, fitted proxies, clothing shells
//   public/assets/characters/mh/tex/               skins, hair cards, parts atlas, eyes (manifest.json)
// Everything is CC0 MakeHuman / community assets (docs/credits/characters.md).
//
// The pack holds a neutral T-posed body (B0) plus one T-posed MakeHuman body per cast member /
// background archetype as int16 deltas, the Quaternius-named joints of every body, sparse morphs
// (ARKit face units, face-detail axes, the ghost "uncanny"), and proxies (eyes, brows, lashes,
// teeth, tongue, hair styles, LOD bodies, clothing shells) bound to base vertices so they refit to
// any blended body (see mhperson.js).
import * as THREE from 'three';

export const MH = { ready: false, meta: null, buf: null, tex: null, error: null };
let _loading = null;

const assetURL = (p) => new URL(p, document.baseURI).href;
const TYPES = { f32: Float32Array, i16: Int16Array, u16: Uint16Array, u32: Uint32Array, u8: Uint8Array, i8: Int8Array };

/** typed view of a bin section {o, n, t} */
export function arr(d) {
  if (!d) return null;
  const T = TYPES[d.t];
  return new T(MH.buf, d.o, d.n);
}

const texCache = new Map();
function loadTex(file, srgb = true) {
  const url = assetURL('assets/characters/mh/tex/' + file);
  if (texCache.has(url)) return texCache.get(url);
  const p = new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = 8;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        resolve(t);
      },
      undefined,
      () => { console.warn('[characters-mh] texture failed', file); resolve(null); },
    );
  });
  texCache.set(url, p);
  return p;
}

/** Load the pack once (json + bin + every texture). Resolves true, or false if the pack is missing. */
export function loadMHPack() {
  if (_loading) return _loading;
  _loading = (async () => {
    try {
      const [mr, br, tr] = await Promise.all([
        fetch(assetURL('assets/characters/mh/mh.json')),
        fetch(assetURL('assets/characters/mh/mh.bin')),
        fetch(assetURL('assets/characters/mh/tex/manifest.json')),
      ]);
      if (!mr.ok || !br.ok || !tr.ok) throw new Error('character pack missing (HTTP ' + [mr.status, br.status, tr.status].join('/') + ')');
      MH.meta = await mr.json();
      MH.buf = await br.arrayBuffer();
      const man = await tr.json();
      const tex = { skins: {}, hair: {}, parts: null, eye: null, rects: man.parts || {}, skinAvg: man.skinAvgLinear || {} };
      const jobs = [];
      for (const [k, f] of Object.entries(man.skins || {})) jobs.push(loadTex(f).then((t) => (tex.skins[k] = t)));
      for (const [k, f] of Object.entries(man.hair || {})) jobs.push(loadTex(f).then((t) => (tex.hair[k] = t)));
      jobs.push(loadTex(man.partsFile || 'parts.webp').then((t) => (tex.parts = t)));
      jobs.push(loadTex(man.eye || 'eye.jpg').then((t) => (tex.eye = t)));
      await Promise.all(jobs);
      MH.tex = tex;
      MH.ready = true;
      return true;
    } catch (e) {
      MH.error = e;
      console.warn('[characters-mh] MakeHuman pack unavailable, using the Quaternius fallback:', e.message || e);
      return false;
    }
  })();
  return _loading;
}

/** body names available in the pack */
export function packBodies() {
  return MH.meta ? Object.keys(MH.meta.bodies) : [];
}
