// Creature surfaces: tileable procedural detail textures (DataTextures, generated once) and
// `creatureMaterial`, a paintedMaterial patched to sample the detail TRIPLANAR IN REST (bind-pose)
// SPACE, so the hide / fur / skin never swims over a skinned, moving body. The texture's RGB is a
// mean-0.5 colour modulation (x2) on top of the vertex colours; its alpha is a height field used
// for derivative bump mapping (sharp wrinkles, pores, fur streaks without a normal map).
import * as THREE from 'three';
import { paintedMaterial } from '../render/index.js';
import { nextSlice } from './sculpt.js';

const CACHE = new Map();

// ---------------------------------------------------------------- tileable noise helpers
function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise(x, y, P, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a) => ((a % P) + P) % P;
  const a = hash2(m(xi), m(yi), s), b = hash2(m(xi + 1), m(yi), s);
  const c = hash2(m(xi), m(yi + 1), s), d = hash2(m(xi + 1), m(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, P, s, oct = 4) {
  let a = 0, amp = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) {
    a += vnoise(x * f, y * f, P * f, s + o * 17) * amp;
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return a / n;
}
/** Worley F1/F2 on a tileable lattice of period P cells. */
function worley(x, y, P, s, out) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const mx = ((cx % P) + P) % P, my = ((cy % P) + P) % P;
    const px = cx + hash2(mx, my, s), py = cy + hash2(mx, my, s + 7);
    const d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  out[0] = f1;
  out[1] = f2;
  return out;
}

/** rows of a detail texture (a generator: yields after every 16 rows so it can run in slices) */
function* texRows(size, fn, data) {
  const px = [0.5, 0.5, 0.5, 0.5];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fn(x / size, y / size, px);
      const o = (y * size + x) * 4;
      data[o] = Math.max(0, Math.min(255, px[0] * 255));
      data[o + 1] = Math.max(0, Math.min(255, px[1] * 255));
      data[o + 2] = Math.max(0, Math.min(255, px[2] * 255));
      data[o + 3] = Math.max(0, Math.min(255, px[3] * 255));
    }
    if ((y & 15) === 15) yield;
  }
}
let _deferTex = null; // detailTextureAsync(): capture (size, fn) instead of painting synchronously
function makeTex(size, fn) {
  if (_deferTex) {
    _deferTex.size = size;
    _deferTex.fn = fn;
    throw _deferTex;
  }
  const data = new Uint8Array(size * size * 4);
  const it = texRows(size, fn, data);
  while (!it.next().done);
  return texFromData(data, size);
}
function texFromData(data, size) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const W = [0, 0];
/** Detail texture by kind: 'hide' (elephant), 'fur' (dog), 'ghostSkin' (hand, ghosts), 'organ' (krasue). */
export function detailTexture(kind) {
  if (CACHE.has(kind)) return CACHE.get(kind);
  let t;
  if (kind === 'hide') {
    // deep criss-crossed wrinkle grooves (cell edges at two scales) + pores + dried-mud blotches
    t = makeTex(512, (u, v, o) => {
      worley(u * 9, v * 9, 9, 11, W);
      const g1 = Math.min(1, (W[1] - W[0]) * 4.2);
      worley(u * 23 + 0.37, v * 23, 23, 29, W);
      const g2 = Math.min(1, (W[1] - W[0]) * 5.0);
      const n = fbm(u * 8, v * 8, 8, 3, 4);
      const pores = vnoise(u * 160, v * 160, 160, 5);
      const h = 0.25 + 0.45 * g1 * (0.7 + 0.3 * g2) + 0.12 * n + 0.05 * pores;
      const mud = Math.max(0, fbm(u * 4, v * 4, 4, 41, 3) - 0.55) * 2.4;
      const c = 0.36 + 0.22 * h + 0.1 * (n - 0.5);
      o[0] = c + mud * 0.1;
      o[1] = c + mud * 0.05;
      o[2] = c - mud * 0.06;
      o[3] = h;
    });
  } else if (kind === 'fur') {
    // short coarse coat: strands streaked along v, clumps, a few longer guard hairs
    t = makeTex(512, (u, v, o) => {
      const s1 = vnoise(u * 220, v * 26, 220, 3);
      const s2 = vnoise(u * 110 + 3.1, v * 14, 110, 9);
      const clump = fbm(u * 10, v * 10, 10, 15, 3);
      const h = 0.3 + 0.38 * s1 + 0.22 * s2 * clump;
      const c = 0.38 + 0.28 * h + 0.12 * (clump - 0.5);
      o[0] = c; o[1] = c * 0.97; o[2] = c * 0.92; o[3] = h;
    });
  } else if (kind === 'organ') {
    // wet glistening tissue: lobes, branching vessels
    t = makeTex(256, (u, v, o) => {
      worley(u * 7, v * 7, 7, 5, W);
      const lobe = Math.min(1, W[0] * 1.3);
      const vess = 1 - Math.min(1, Math.abs(fbm(u * 6, v * 6, 6, 21, 4) - 0.5) * 18);
      const h = 0.6 - 0.25 * lobe - 0.3 * vess;
      o[0] = 0.5 + 0.12 * (1 - lobe) - 0.18 * vess;
      o[1] = 0.48 - 0.1 * vess;
      o[2] = 0.47 - 0.06 * vess;
      o[3] = h;
    });
  } else {
    // ghostSkin: creased, papery skin with dark veins and mottling
    t = makeTex(512, (u, v, o) => {
      worley(u * 14, v * 14, 14, 13, W);
      const crease = Math.min(1, (W[1] - W[0]) * 6);
      const fine = vnoise(u * 90, v * 30, 90, 4);
      const vein = 1 - Math.min(1, Math.abs(fbm(u * 5, v * 5, 5, 33, 5) - 0.5) * 22);
      const mott = fbm(u * 6, v * 6, 6, 51, 3);
      const h = 0.35 + 0.35 * crease + 0.12 * fine + 0.1 * vein;
      const c = 0.44 + 0.12 * crease + 0.12 * (mott - 0.5);
      o[0] = c - 0.12 * vein;
      o[1] = c - 0.07 * vein;
      o[2] = c - 0.02 * vein;
      o[3] = h;
    });
  }
  CACHE.set(kind, t);
  return t;
}

/** detailTexture(kind) painted in ~4 ms slices between frames (prewarm); same pixels, same cache. */
export async function detailTextureAsync(kind, budget = 4) {
  if (CACHE.has(kind)) return CACHE.get(kind);
  const req = { size: 0, fn: null };
  _deferTex = req;
  try {
    detailTexture(kind);
  } catch (e) {
    if (e !== req) throw e;
  } finally {
    _deferTex = null;
  }
  if (CACHE.has(kind) || !req.fn) return CACHE.get(kind);
  const data = new Uint8Array(req.size * req.size * 4);
  const it = texRows(req.size, req.fn, data);
  let t0 = performance.now();
  while (!it.next().done) {
    if (performance.now() - t0 > budget) {
      await nextSlice();
      t0 = performance.now();
    }
  }
  if (CACHE.has(kind)) return CACHE.get(kind); // somebody needed it synchronously meanwhile
  const t = texFromData(data, req.size);
  CACHE.set(kind, t);
  return t;
}

/**
 * Painted creature material. opts: paintedMaterial opts plus
 *   detail ('hide'|'fur'|'ghostSkin'|'organ'|null), detailScale (repeats per metre of rest space),
 *   detailAmount (0..1 colour modulation), bump (strength), ao (geometry has aAO), vertexColors.
 */
export function creatureMaterial(opts = {}) {
  const detail = opts.detail === undefined ? 'ghostSkin' : opts.detail;
  const tex = detail ? detailTexture(detail) : null;
  const uniforms = {
    crTex: { value: tex },
    crScale: { value: opts.detailScale ?? 2 },
    crAmt: { value: opts.detailAmount ?? 0.8 },
    crBump: { value: opts.bump ?? 1 },
  };
  const useAO = opts.ao !== false;
  const key = `creature|${detail ? 'd' : ''}|${useAO ? 'ao' : ''}`;
  const m = paintedMaterial({
    ...opts,
    vertexColors: opts.vertexColors ?? true,
    _key: key,
    _patch: (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vCrP;\nvarying vec3 vCrN;\n${useAO ? 'attribute float aAO;\nvarying float vCrAO;' : ''}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\nvCrP = position;\nvCrN = normal;\n${useAO ? 'vCrAO = aAO;' : ''}`);
      let frag = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying vec3 vCrP;
varying vec3 vCrN;
${useAO ? 'varying float vCrAO;' : ''}
uniform sampler2D crTex;
uniform float crScale;
uniform float crAmt;
uniform float crBump;
float crH = 0.5;
vec3 crPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 vSigmaX = normalize(dFdx(surf_pos));
  vec3 vSigmaY = normalize(dFdy(surf_pos));
  vec3 R1 = cross(vSigmaY, surf_norm);
  vec3 R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}`,
      );
      if (detail) {
        frag = frag.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
{
  vec3 crW = pow(abs(normalize(vCrN)), vec3(4.0));
  crW /= max(crW.x + crW.y + crW.z, 1e-4);
  vec3 crQ = vCrP * crScale;
  vec4 crT = texture2D(crTex, crQ.zy) * crW.x + texture2D(crTex, crQ.xz) * crW.y + texture2D(crTex, crQ.xy) * crW.z;
  diffuseColor.rgb *= mix(vec3(1.0), crT.rgb * 2.0, crAmt);
  crH = crT.a;
}`,
        );
        frag = frag.replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
normal = crPerturb(-vViewPosition, normal, vec2(dFdx(crH), dFdy(crH)) * crBump, faceDirection);`,
        );
      }
      if (useAO) frag = frag.replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= mix(0.42, 1.0, vCrAO);`);
      shader.fragmentShader = frag;
    },
  });
  m.userData.creature = uniforms;
  return m;
}

/** Emissive, softly pulsing material for glowing things (krasue entrails, ghost light). */
export function glowFleshMaterial(opts = {}) {
  return creatureMaterial({
    detail: 'organ', detailScale: opts.detailScale ?? 9, detailAmount: 0.9, bump: 0.8, ao: false,
    vertexColors: false, color: opts.color ?? 0x8a3a2c, roughness: 0.28, wet: 1, brush: 0.25, sss: 0.9, skin: true,
    emissive: opts.emissive ?? 0x9cff6a, emissiveIntensity: opts.emissiveIntensity ?? 0.6, puddles: 0,
  });
}
