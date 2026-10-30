// claude.ai Artifacts only serve a fixed set of file types and .glb is not one of them.
// The Artifact build (tools/artifact/stage.mjs) therefore ships every model as
// "<name>.glb.txt" (base64 text) and sets window.__DLBIH_GLB_TXT__ = true in the page.
// This shim makes both ways the game loads models (GLTFLoader.load/loadAsync and plain
// fetch + parse) transparently read those text files. Normal builds are untouched.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function decodeBase64(text) {
  const bin = atob(text.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const isGlb = (url) => typeof url === 'string' && /\.glb(\?.*)?$/i.test(url);

export function installArtifactShim() {
  if (typeof window === 'undefined' || !window.__DLBIH_GLB_TXT__) return;
  const nativeFetch = window.fetch.bind(window);
  const fetchGlbText = async (url, init) => {
    const res = await nativeFetch(url.replace(/(\.glb)(\?.*)?$/i, '$1.txt$2'), init);
    if (!res.ok) return res;
    const bytes = decodeBase64(await res.text());
    return new Response(bytes, { status: 200, headers: { 'Content-Type': 'model/gltf-binary' } });
  };
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (isGlb(url)) return fetchGlbText(url, init);
    return nativeFetch(input, init);
  };
  const origLoad = GLTFLoader.prototype.load;
  GLTFLoader.prototype.load = function (url, onLoad, onProgress, onError) {
    if (!isGlb(url)) return origLoad.call(this, url, onLoad, onProgress, onError);
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    fetchGlbText(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
        return res.arrayBuffer();
      })
      .then((buf) => this.parse(buf, base, onLoad, onError))
      .catch((err) => (onError ? onError(err) : console.error(err)));
  };
}
