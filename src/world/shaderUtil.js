// Helpers to layer world-specific shader code on top of the render module's painted
// materials without fighting its own onBeforeCompile patch (we chain after it and only
// insert next to standard three.js chunk includes, keeping them intact).
import * as THREE from 'three';
import { makeRng } from '../core/math.js';

/** Chain an extra onBeforeCompile patch (runs after the existing one). */
export function chainPatch(material, key, fn) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    if (prev) prev.call(this, shader, renderer);
    fn(shader, renderer);
  };
  const prevKey = material.customProgramCacheKey;
  material.customProgramCacheKey = function () {
    return (prevKey ? prevKey.call(this) : '') + '|' + key;
  };
  material.needsUpdate = true;
  return material;
}

/** Insert code after (or before) the first anchor found among `anchors`. Returns the new source. */
export function inject(src, anchors, code, before = false) {
  for (const a of Array.isArray(anchors) ? anchors : [anchors]) {
    const i = src.indexOf(a);
    if (i >= 0) return before ? src.slice(0, i) + code + '\n' + src.slice(i) : src.slice(0, i + a.length) + '\n' + code + src.slice(i + a.length);
  }
  console.warn('[world] shader anchor not found', anchors);
  return src;
}

// ---------------------------------------------------------------------------
// Tileable value-noise texture (R,G,B,A = 4 octaves at different scales). CPU readable.
// ---------------------------------------------------------------------------
let _noiseTex = null;
export function worldNoiseTexture() {
  if (_noiseTex) return _noiseTex;
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const rng = makeRng(424242);
  const layer = (cells, ch) => {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * cells, fy = (y / N) * cells;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        let tx = fx - ix, ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const a = g[(iy % cells) * cells + (ix % cells)], b = g[(iy % cells) * cells + ((ix + 1) % cells)];
        const c = g[((iy + 1) % cells) * cells + (ix % cells)], d = g[((iy + 1) % cells) * cells + ((ix + 1) % cells)];
        const v = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
        data[(y * N + x) * 4 + ch] = Math.round(v * 255);
      }
    }
  };
  layer(4, 0);
  layer(12, 1);
  layer(32, 2);
  layer(80, 3);
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  t.name = 'worldNoise';
  _noiseTex = t;
  return t;
}

/** CPU bilinear sample of worldNoiseTexture channel ch at uv (repeat wrapping). */
export function sampleWorldNoise(u, v, ch = 0) {
  const t = worldNoiseTexture();
  const N = t.image.width, d = t.image.data;
  const fx = (((u % 1) + 1) % 1) * N - 0.5, fy = (((v % 1) + 1) % 1) * N - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const g = (x, y) => d[((((y % N) + N) % N) * N + (((x % N) + N) % N)) * 4 + ch] / 255;
  return (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty;
}

/** CPU sample of a DataTexture's red channel (repeat wrapping, bilinear). Returns null if no CPU data. */
export function sampleTextureRed(tex, u, v) {
  const img = tex && tex.image;
  if (!img || !img.data || !img.width) return null;
  const N = img.width, M = img.height, d = img.data;
  const stride = d.length / (N * M);
  const fx = (((u % 1) + 1) % 1) * N - 0.5, fy = (((v % 1) + 1) % 1) * M - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const g = (x, y) => d[((((y % M) + M) % M) * N + (((x % N) + N) % N)) * stride] / 255;
  return (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty;
}

/** GLSL helpers shared by world shaders. */
export const GLSL_HASH = /* glsl */ `
float wHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 wHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
`;
