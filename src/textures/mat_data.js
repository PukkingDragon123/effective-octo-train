// Data textures (NoColorSpace): rain ripple normals, brush-stroke noise for the painterly
// shaders, blue noise for dithering / stochastic effects.
import { makeRng } from '../core/math.js';
import { fbm, blur, blueNoise } from './noise.js';
import { Img, strokes, normalMap, packBytes, dataOut, field } from './painter.js';

const TAU = Math.PI * 2;

/**
 * WATER RIPPLE — tangent-space normal map of rain rings on standing water + soft wind
 * chop (tileable). Also water_ripple_height (R) for parallax / refraction offsets.
 * Animate by scrolling two copies, or flip through `water_ripple` with time offsets.
 */
export function genWaterRipple(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const rng = makeRng(4000);
  const H = fbm(w, h, { cells: 4, octaves: 4, seed: 4001 });
  for (let i = 0; i < n; i++) H[i] *= 0.15;
  const rings = Math.round(90 * k * k);
  for (let c = 0; c < rings; c++) {
    const cx = rng() * w, cy = rng() * h;
    const R = (8 + rng() * 34) * k;
    const age = rng();
    const amp = 0.5 * (1 - age);
    const wl = (4 + rng() * 3) * k;
    for (let y = Math.floor(cy - R); y <= cy + R; y++) {
      const wy = ((y % h) + h) % h;
      for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d >= R) continue;
        const front = R * (0.4 + age * 0.6);
        const env = Math.exp(-Math.pow((d - front) / (wl * 1.6), 2));
        H[wy * w + (((x % w) + w) % w)] += Math.cos(((d - front) / wl) * TAU) * env * amp * (1 - d / R);
      }
    }
  }
  return {
    water_ripple: dataOut(normalMap(H, w, h, 2.2), w, h),
    water_ripple_height: dataOut(packBytes(w, h, field(n, (i) => H[i] * 0.5 + 0.5), null, null, null), w, h),
  };
}

/**
 * BRUSH NOISE — RGBA data for painterly shaders (all tileable, 0..1):
 *   R: horizontal-ish brush strokes (value variation along stroke direction)
 *   G: vertical-ish strokes      B: blotchy wash (low-frequency)      A: fine canvas grain
 */
export function genBrushNoise(S = 512) {
  const w = S, h = S, n = w * h, k = S / 512;
  const chan = (angle, seed) => {
    const img = new Img(w, h, [0.5, 0.5, 0.5, 1]);
    const r = makeRng(seed);
    const d = img.d;
    for (let i = 0; i < n; i++) {
      const v = 0.5 + (r() - 0.5) * 0.6;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    }
    const bl = blur(field(n, (i) => d[i * 4]), w, h, Math.round(3 * k), 2);
    for (let i = 0; i < n; i++) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 0.5 + (bl[i] - 0.5) * 3;
    strokes(img, { seed, len: [18 * k, 46 * k], width: [5 * k, 11 * k], opacity: 0.85, coverage: 1.4, angle, angleJitter: 0.35, valueJitter: 0.35, warmJitter: 0, bristles: 8, bristleAmt: 0.6, smear: 0.1 });
    return field(n, (i) => d[i * 4]);
  };
  const R = chan(0.15, 4101);
  const G = chan(Math.PI / 2 - 0.15, 4102);
  const B = fbm(w, h, { cells: 4, octaves: 5, seed: 4103, gain: 0.55 });
  const A = fbm(w, h, { cells: 128, octaves: 2, seed: 4104 });
  return { brush_noise: dataOut(packBytes(w, h, R, G, field(n, (i) => B[i] * 0.5 + 0.5), field(n, (i) => A[i] * 0.5 + 0.5)), w, h) };
}

/** BLUE NOISE — 64×64 void-and-cluster ranks in R; G/B/A are toroidally shifted copies. */
export function genBlueNoise() {
  const N = 64;
  const r = blueNoise(N, 7);
  const sh = (dx, dy) => field(N * N, (i) => r[((((i / N) | 0) + dy) % N) * N + (((i % N) + dx) % N)]);
  const raw = dataOut(packBytes(N, N, r, sh(17, 31), sh(41, 9), sh(29, 53)), N, N);
  raw.meta = { nearest: true };
  return { blue_noise: raw };
}
