// Internal procedural DataTextures used by the render module (independent of src/textures):
//  * brushTexture(): 256² RGBA tileable — R brush strokes, G low-freq blotches,
//    B fine grain, A puddle / patch mask.
//  * canvasTexture(): 256² RGBA tileable — R canvas weave, G paper fibres, B grain, A blue-ish noise.
//  * glowTexture(): soft radial glow (sprites).
import * as THREE from 'three';
import { makeRng } from '../core/math.js';

const SIZE = 256;

// periodic value noise on an integer lattice of `period` cells
function periodicNoise(rng, period) {
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = g[y0 * period + x0], b = g[y0 * period + x1], c = g[y1 * period + x0], d = g[y1 * period + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

function fbmTile(rng, basePeriod, octaves) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(periodicNoise(rng, basePeriod << o));
  return (u, v) => {
    // u, v in [0,1)
    let s = 0, a = 0.5, n = 0;
    for (let o = 0; o < octaves; o++) {
      const p = basePeriod << o;
      s += a * layers[o](u * p, v * p);
      n += a;
      a *= 0.5;
    }
    return s / n;
  };
}

function stampStrokes(buf, rng, count, opts) {
  const { minLen, maxLen, minW, maxW, amp } = opts;
  for (let s = 0; s < count; s++) {
    const cx = rng() * SIZE, cy = rng() * SIZE;
    // strokes loosely aligned in a few dominant directions (painter's hand)
    const ang = (rng() < 0.6 ? (rng() - 0.5) * 0.7 : rng() * Math.PI) + (opts.baseAngle || 0);
    const len = minLen + rng() * (maxLen - minLen);
    const wid = minW + rng() * (maxW - minW);
    const val = (rng() - 0.5) * 2 * amp;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const r = Math.ceil(len + wid + 2);
    const bristleSeed = rng() * 100;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const u = dx * ca + dy * sa; // along stroke
        const v = -dx * sa + dy * ca; // across
        const tu = u / len, tv = v / wid;
        if (tu < -1 || tu > 1 || tv < -1 || tv > 1) continue;
        // tapered ends, soft sides, bristle streaks along the stroke
        const taper = 1 - Math.pow(Math.abs(tu), 3);
        const side = 1 - tv * tv;
        const bristle = 0.65 + 0.35 * Math.sin(v * 3.1 + bristleSeed + Math.sin(u * 0.4) * 0.6);
        const w = Math.max(0, taper * side) * bristle;
        if (w <= 0) continue;
        const x = ((Math.floor(cx + dx) % SIZE) + SIZE) % SIZE;
        const y = ((Math.floor(cy + dy) % SIZE) + SIZE) % SIZE;
        const i = y * SIZE + x;
        buf[i] += (val - buf[i] * 0.35) * w * 0.8;
      }
    }
  }
}

let _brush = null;
export function brushTexture() {
  if (_brush) return _brush;
  const rng = makeRng(424242);
  const strokes = new Float32Array(SIZE * SIZE);
  stampStrokes(strokes, rng, 1500, { minLen: 5, maxLen: 18, minW: 1.6, maxW: 4.5, amp: 0.5 });
  stampStrokes(strokes, rng, 260, { minLen: 14, maxLen: 34, minW: 3, maxW: 7, amp: 0.35, baseAngle: 1.2 });
  const blot = fbmTile(rng, 4, 5);
  const patch = fbmTile(rng, 3, 5);
  const grain = fbmTile(rng, 64, 2);
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const u = x / SIZE, v = y / SIZE;
      const r = 0.5 + strokes[i] * 0.9;
      const g = blot(u, v);
      const b = 0.5 + (grain(u, v) - 0.5) * 1.4 + (rng() - 0.5) * 0.25;
      const p = patch(u, v);
      const a = Math.min(1, Math.max(0, (p - 0.5) * 2.2 + 0.5));
      data[i * 4 + 0] = Math.max(0, Math.min(255, r * 255));
      data[i * 4 + 1] = Math.max(0, Math.min(255, (0.5 + (g - 0.5) * 1.8) * 255));
      data[i * 4 + 2] = Math.max(0, Math.min(255, b * 255));
      data[i * 4 + 3] = a * 255;
    }
  }
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  t.name = 'dlb_brush';
  _brush = t;
  return t;
}

let _canvas = null;
export function canvasTexture() {
  if (_canvas) return _canvas;
  const rng = makeRng(777);
  const fib = fbmTile(rng, 16, 3);
  const blot = fbmTile(rng, 4, 4);
  const strokes = new Float32Array(SIZE * SIZE);
  stampStrokes(strokes, rng, 900, { minLen: 6, maxLen: 22, minW: 1.2, maxW: 3.2, amp: 0.5, baseAngle: 0.5 });
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      // canvas weave: two thread directions with irregular thickness
      const tx = Math.sin((x / SIZE) * Math.PI * 2 * 96) * 0.5 + 0.5;
      const ty = Math.sin((y / SIZE) * Math.PI * 2 * 96) * 0.5 + 0.5;
      const irregular = fib((x / SIZE) * 1.0, (y / SIZE) * 1.0);
      const weave = ((x + y) % 2 === 0 ? tx * 0.6 + ty * 0.4 : ty * 0.6 + tx * 0.4) * (0.7 + irregular * 0.6);
      const paper = fib(x / SIZE, y / SIZE) * 0.6 + blot(x / SIZE, y / SIZE) * 0.4;
      data[i * 4 + 0] = Math.max(0, Math.min(255, weave * 255));
      data[i * 4 + 1] = Math.max(0, Math.min(255, paper * 255));
      data[i * 4 + 2] = Math.max(0, Math.min(255, (0.5 + strokes[i] * 0.9) * 255));
      data[i * 4 + 3] = Math.floor(rng() * 256);
    }
  }
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  t.name = 'dlb_canvas';
  _canvas = t;
  return t;
}

let _glow = null;
export function glowTexture() {
  if (_glow) return _glow;
  const S = 64;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
      const r = Math.sqrt(dx * dx + dy * dy);
      const core = Math.exp(-r * r * 18);
      const halo = Math.pow(Math.max(0, 1 - r), 2.2) * 0.5;
      const a = Math.min(1, core + halo);
      const i = (y * S + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = a * 255;
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  _glow = t;
  return t;
}

let _placeholder = null;
/** 1x1 neutral grey (0.5) texture: placeholder for not-yet-loaded detail maps. */
export function neutralTexture() {
  if (_placeholder) return _placeholder;
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  _placeholder = t;
  return t;
}

let _fogNoise3 = null;
/**
 * 32³ R8 lattice of random values (tileable, RepeatWrapping, linear filtering) for the fog
 * noise: `dlbFogNoise3()` samples it once with the smoothstep-warped coordinate, which is
 * exactly smoothstep-interpolated value noise — one 3D fetch instead of 8 hashes.
 */
export function fogNoiseTexture3D() {
  if (_fogNoise3) return _fogNoise3;
  const N = 32;
  const rng = makeRng(0x5f0d);
  const data = new Uint8Array(N * N * N);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rng() * 256);
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RedFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.name = 'dlbFogNoise3';
  t.needsUpdate = true;
  _fogNoise3 = t;
  return t;
}
