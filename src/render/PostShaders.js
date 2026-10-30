// Bloom, light shafts, copy and final-grade shaders for PostFX.

export const COPY_FRAG = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tSrc, vUv); }
`;

/** 13-tap downsample (Jimenez 2014) with optional Karis average on the first mip. */
export const BLOOM_DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel; // source texel size
uniform float uKaris;
uniform float uClampMax;
varying vec2 vUv;
vec3 T(vec2 o) { return min(texture2D(tSrc, vUv + o * uTexel).rgb, vec3(uClampMax)); }
float kw(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
void main() {
  vec3 a = T(vec2(-2.0, -2.0)), b = T(vec2(0.0, -2.0)), c = T(vec2(2.0, -2.0));
  vec3 d = T(vec2(-1.0, -1.0)), e = T(vec2(1.0, -1.0));
  vec3 f = T(vec2(-2.0, 0.0)), g = T(vec2(0.0, 0.0)), h = T(vec2(2.0, 0.0));
  vec3 i = T(vec2(-1.0, 1.0)), j = T(vec2(1.0, 1.0));
  vec3 k = T(vec2(-2.0, 2.0)), l = T(vec2(0.0, 2.0)), m = T(vec2(2.0, 2.0));
  vec3 res;
  if (uKaris > 0.5) {
    vec3 g0 = (d + e + i + j) * 0.25;
    vec3 g1 = (a + b + f + g) * 0.25;
    vec3 g2 = (b + c + g + h) * 0.25;
    vec3 g3 = (f + g + k + l) * 0.25;
    vec3 g4 = (g + h + l + m) * 0.25;
    float w0 = kw(g0) * 0.5, w1 = kw(g1) * 0.125, w2 = kw(g2) * 0.125, w3 = kw(g3) * 0.125, w4 = kw(g4) * 0.125;
    res = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
  } else {
    res = (d + e + i + j) * 0.125;
    res += (a + b + g + f) * 0.03125;
    res += (b + c + h + g) * 0.03125;
    res += (f + g + l + k) * 0.03125;
    res += (g + h + m + l) * 0.03125;
  }
  gl_FragColor = vec4(max(res, vec3(0.0)), 1.0);
}
`;

/** 3x3 tent upsample of the lower mip blended with the current mip. */
export const BLOOM_UP_FRAG = /* glsl */ `
uniform sampler2D tLow;
uniform sampler2D tHigh;
uniform vec2 uTexel; // low-mip texel size
uniform float uScatter;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tLow, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  s += texture2D(tLow, vUv + vec2(0.0, -1.0) * uTexel).rgb * 2.0;
  s += texture2D(tLow, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  s += texture2D(tLow, vUv + vec2(-1.0, 0.0) * uTexel).rgb * 2.0;
  s += texture2D(tLow, vUv).rgb * 4.0;
  s += texture2D(tLow, vUv + vec2(1.0, 0.0) * uTexel).rgb * 2.0;
  s += texture2D(tLow, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
  s += texture2D(tLow, vUv + vec2(0.0, 1.0) * uTexel).rgb * 2.0;
  s += texture2D(tLow, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  s *= 1.0 / 16.0;
  vec3 hi = texture2D(tHigh, vUv).rgb;
  gl_FragColor = vec4(mix(hi, s, uScatter), 1.0);
}
`;

/** Light-shaft occlusion/brightness mask around the sun. */
export const SHAFT_MASK_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSun;      // sun position in uv
uniform float uAspect;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(tSrc, vUv);
  vec3 c = t.rgb;
  float sky = 1.0 - clamp(t.a, 0.0, 1.0);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec2 d = (vUv - uSun) * vec2(uAspect, 1.0);
  float fall = exp(-dot(d, d) * 3.0);
  float m = sky * (max(l - uThreshold, 0.0) / (1.0 + l) + 0.15) * fall;
  gl_FragColor = vec4(m, m, m, 1.0);
}
`;

/** Radial blur toward the sun (GPU Gems 3 ch. 13 style). */
export const SHAFT_BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSun;
uniform float uLength;
uniform float uJitter;
varying vec2 vUv;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec2 d = (uSun - vUv) * uLength / 24.0;
  vec2 uv = vUv + d * ign(gl_FragCoord.xy) * uJitter;
  vec3 s = vec3(0.0);
  float w = 1.0, ws = 0.0;
  for (int i = 0; i < 24; i++) {
    s += texture2D(tSrc, uv).rgb * w;
    ws += w;
    w *= 0.95;
    uv += d;
  }
  gl_FragColor = vec4(s / ws, 1.0);
}
`;

/**
 * Final composite + grade -> display-referred sRGB (written to a HalfFloat target; the
 * OUTPUT pass then sharpens it and adds canvas / grain / fade / letterbox / dither).
 */
export const FINAL_FRAG = /* glsl */ `
#include <dlb_common>
uniform sampler2D tScene;
uniform sampler2D tPaint;
uniform sampler2D tBloom;
uniform sampler2D tBlur;
uniform sampler2D tShafts;
uniform vec2 uRes;
uniform float uTime;
uniform float uPaint;
uniform float uExposure;
uniform float uSaturation;
uniform float uContrast;
uniform float uTemperature;
uniform float uTint;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uSplit;
uniform vec3 uColorMul;
uniform float uBloom;
uniform float uShafts;
uniform vec3 uShaftCol;
uniform float uVignette;
uniform float uChroma;
uniform float uHorror;
uniform float uAmulet;
uniform float uBlur;
uniform float uDistortion;
uniform vec4 uFlash;
varying vec2 vUv;

#ifdef PAINT
// perceptual (range-compressed) luma, so the edge test works in the dark night frame
float pl(vec3 c) { float l = dlbLuma(c) * uExposure; return sqrt(l / (1.0 + l)); }
// Edge / detail protection: the paint layer is only allowed on flat tonal areas. Local
// contrast in a 1 px cross + 2 px diagonals keeps texture detail, foliage edges, text and
// faces from the original frame; soft masses (fog, sky, shadowed foliage) get the strokes.
float paintWeight(vec2 uv) {
  vec2 px = 1.0 / uRes;
  float c = pl(texture2D(tScene, uv).rgb);
  float n = pl(texture2D(tScene, uv + vec2(0.0, px.y)).rgb);
  float s = pl(texture2D(tScene, uv - vec2(0.0, px.y)).rgb);
  float e = pl(texture2D(tScene, uv + vec2(px.x, 0.0)).rgb);
  float w = pl(texture2D(tScene, uv - vec2(px.x, 0.0)).rgb);
  float d1 = pl(texture2D(tScene, uv + px * vec2(2.0, 2.0)).rgb);
  float d2 = pl(texture2D(tScene, uv + px * vec2(-2.0, -2.0)).rgb);
  float mn = min(min(min(c, n), min(s, e)), min(w, min(d1, d2)));
  float mx = max(max(max(c, n), max(s, e)), max(w, max(d1, d2)));
  float con = (mx - mn) / (0.08 + mx);
  return uPaint * mix(1.0, 0.12, smoothstep(0.03, 0.22, con));
}
#endif

vec3 comp(vec2 uv, float pw) {
  vec3 s = texture2D(tScene, uv).rgb;
#ifdef PAINT
  vec3 p = texture2D(tPaint, uv).rgb;
  // keep tiny bright details (stars, fireflies, sparks, far lamps) that Kuwahara would erase
  vec3 d = max(s - p, vec3(0.0));
  float dl = dlbLuma(d) * uExposure;
  s = mix(s, p, pw) + d * pw * smoothstep(0.015, 0.12, dl) * 0.9;
#endif
  return s;
}
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 acesFitted(vec3 color) {
  const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  color = inM * color;
  color = RRTAndODTFit(color);
  color = outM * color;
  return clamp(color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 hueOf(vec3 c) { return sqrt(c / max((c.r + c.g + c.b) / 3.0, 1e-5)); }

void main() {
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float aspect = uRes.x / uRes.y;
  float r = length(cc * vec2(aspect, 1.0)) / length(vec2(aspect, 1.0) * 0.5);
  // ---- distortion: heat wobble, horror edge warp, amulet ripple -------------------
  vec2 warp = vec2(0.0);
  if (uDistortion > 0.0) {
    warp += (vec2(dlbNoise2(uv * 7.0 + uTime * 0.8), dlbNoise2(uv * 7.0 + 3.1 - uTime * 0.7)) - 0.5) * 0.014 * uDistortion;
  }
  float edge = smoothstep(0.35, 1.0, r);
  if (uHorror > 0.0) {
    warp += (vec2(dlbNoise2(uv * 3.5 + uTime * 1.1), dlbNoise2(uv * 3.5 + 7.0 - uTime * 1.3)) - 0.5) * 0.045 * edge * uHorror;
    warp -= cc * edge * 0.035 * uHorror * (0.6 + 0.4 * sin(uTime * 2.3));
  }
  if (uAmulet > 0.0) {
    float rip = sin(r * 34.0 - uTime * 2.6) * exp(-r * 2.2);
    warp += normalize(cc + 1e-5) * rip * 0.0022 * uAmulet;
  }
  uv += warp;
  // ---- composite + chromatic aberration (lens edges only: the centre stays crisp) ------
  float pw = 0.0;
#ifdef PAINT
  pw = paintWeight(uv);
#endif
  vec3 col;
  float ca = uChroma * smoothstep(0.3, 1.1, r) * 1.2 + uHorror * edge * 0.8;
  if (ca > 0.001) {
    vec2 off = cc * 0.0045 * ca;
    col = vec3(comp(uv + off, pw).r, comp(uv, pw).g, comp(uv - off, pw).b);
  } else {
    col = comp(uv, pw);
  }
  // ---- bloom, shafts, menu blur, flash ---------------------------------------------
  vec3 bloom = texture2D(tBloom, uv).rgb;
  col = mix(col, bloom, uBloom);
  if (uShafts > 0.0) col += texture2D(tShafts, uv).rgb * uShaftCol * uShafts;
  if (uBlur > 0.0) col = mix(col, texture2D(tBlur, uv).rgb, clamp(uBlur, 0.0, 1.0));
  col += uFlash.rgb * uFlash.a;
  // ---- exposure, white balance, tone map ---------------------------------------------
  col *= uExposure;
  vec3 wb = vec3(1.0 + 0.2 * uTemperature - 0.04 * uTint, 1.0 + 0.03 * uTemperature + 0.12 * uTint, 1.0 - 0.24 * uTemperature - 0.04 * uTint);
  col *= wb * uColorMul;
  col = acesFitted(col / 0.6);
  // ---- display-space grade --------------------------------------------------------
  col = uGain * (col + uLift * (1.0 - col));
  col = pow(max(col, vec3(0.0)), 1.0 / uGamma);
  float l = dlbLuma(col);
  // split toning: shadows -> shadowTint, highlights -> highlightTint
  vec3 sh = mix(vec3(1.0), hueOf(uShadowTint), uSplit * (1.0 - smoothstep(0.0, 0.42, l)));
  vec3 hi = mix(vec3(1.0), hueOf(uHighTint), uSplit * 0.8 * smoothstep(0.3, 0.95, l));
  col *= sh * hi;
  // contrast: smooth S-curve around a low pivot (keeps painted shadows from crushing)
  {
    const float pv = 0.32;
    vec3 lo = pv * pow(clamp(col / pv, 0.0, 1.0), vec3(uContrast));
    vec3 hi = 1.0 - (1.0 - pv) * pow(clamp((1.0 - col) / (1.0 - pv), 0.0, 1.0), vec3(uContrast));
    col = mix(lo, hi, step(pv, col));
  }
  l = dlbLuma(col);
  float sat = uSaturation * (1.0 - uHorror * 0.8);
  col = max(mix(vec3(l), col, sat), vec3(0.0));
  // amulet: warm golden aura
  if (uAmulet > 0.0) {
    float aura = smoothstep(0.25, 1.05, r);
    col = mix(col, col * vec3(1.1, 1.0, 0.82) + vec3(0.03, 0.02, 0.0), uAmulet * 0.6);
    col += vec3(1.0, 0.72, 0.32) * aura * 0.22 * uAmulet * (0.85 + 0.15 * sin(uTime * 1.7));
  }
  // horror: desaturated with a subtle red pulse at the edges
  if (uHorror > 0.0) {
    float pulse = 0.5 + 0.5 * sin(uTime * 2.4);
    col = mix(col, col * vec3(1.35, 0.72, 0.7), edge * uHorror * (0.35 + 0.3 * pulse));
  }
  // vignette
  float vig = smoothstep(0.25, 1.15, r);
  col *= 1.0 - vig * vig * (uVignette * 0.85 + uHorror * 0.4);
  gl_FragColor = vec4(toSRGB(col), 1.0);
}
`;

/**
 * Output pass (display space): optional FXAA-lite (only when the scene target has no MSAA),
 * contrast-adaptive sharpening (AMD FidelityFX CAS style), then the canvas / paper texture,
 * fine film grain, fade, letterbox and dither — added AFTER sharpening so they never get
 * amplified.
 */
export const OUTPUT_FRAG = /* glsl */ `
#include <dlb_common>
uniform sampler2D tSrc;
uniform sampler2D tPaint;
uniform sampler2D tCanvas;
uniform vec2 uRes;
uniform float uTime;
uniform float uSharp;     // 0..1 (0 = off)
uniform float uCanvas;
uniform float uPaintDir;
uniform float uGrain;
uniform float uFade;
uniform vec3 uFadeColor;
uniform float uLetterbox;
varying vec2 vUv;
vec3 T(vec2 o) { return texture2D(tSrc, vUv + o / uRes).rgb; }
float L(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 a = T(vec2(-1.0, -1.0)), b = T(vec2(0.0, -1.0)), c = T(vec2(1.0, -1.0));
  vec3 d = T(vec2(-1.0, 0.0)), e = T(vec2(0.0, 0.0)), f = T(vec2(1.0, 0.0));
  vec3 g = T(vec2(-1.0, 1.0)), h = T(vec2(0.0, 1.0)), i = T(vec2(1.0, 1.0));
  vec3 col = e;
#ifdef FXAA
  {
    float lNW = L(a), lNE = L(c), lSW = L(g), lSE = L(i), lM = L(e);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    if (lMax - lMin > max(0.0312, lMax * 0.125)) {
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
      float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
      dir = clamp(dir * rcpMin, -6.0, 6.0) / uRes;
      vec3 rA = 0.5 * (texture2D(tSrc, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSrc, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
      vec3 rB = rA * 0.5 + 0.25 * (texture2D(tSrc, vUv - dir * 0.5).rgb + texture2D(tSrc, vUv + dir * 0.5).rgb);
      float lB = L(rB);
      col = (lB < lMin || lB > lMax) ? rA : rB;
    }
  }
#endif
  // ---- contrast-adaptive sharpening ----------------------------------------------------
  if (uSharp > 0.001) {
    vec3 mn = min(min(min(d, e), min(f, b)), h);
    vec3 mn2 = min(mn, min(min(a, c), min(g, i)));
    mn += mn2;
    vec3 mx = max(max(max(d, e), max(f, b)), h);
    vec3 mx2 = max(mx, max(max(a, c), max(g, i)));
    mx += mx2;
    // amount: high where local contrast is low/medium, backs off on hard edges (no halos)
    vec3 amp = clamp(min(mn, 2.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0);
    amp = sqrt(amp);
    float peak = mix(12.0, 5.0, clamp(uSharp, 0.0, 1.0));
    vec3 w = -amp / peak;
    vec3 win = (b + d) + (f + h);
    vec3 s = (win * w + col) / (1.0 + 4.0 * w);
    col = clamp(s, 0.0, 1.0);
  }
  // ---- canvas / paper texture + directional brush grain (handmade surface) ------------------
  float l = L(col);
  if (uCanvas > 0.0) {
    vec2 fc = gl_FragCoord.xy;
    vec4 cv = texture2D(tCanvas, fc / 340.0);
    float paper = texture2D(tCanvas, fc / 900.0 + 0.37).g;
    float ph = texture2D(tPaint, vUv).a * 3.14159265 * uPaintDir;
    vec2 rd = vec2(cos(ph), sin(ph));
    vec2 q = vec2(dot(fc, rd), dot(fc, vec2(-rd.y, rd.x)));
    float grainDir = texture2D(tCanvas, q / vec2(220.0, 34.0)).b;
    float k = ((cv.r - 0.5) * 0.03 + (paper - 0.5) * 0.04 + (grainDir - 0.5) * 0.05) * uCanvas;
    col *= 1.0 + k * (0.4 + 0.6 * smoothstep(0.0, 0.4, l));
    col += (paper - 0.5) * 0.004 * uCanvas;
  }
  // ---- film grain: fine, luminance-only, strongest in the mids ----------------------------
  float n = dlbHash12(gl_FragCoord.xy + fract(uTime * 13.7) * 311.0) + dlbHash12(gl_FragCoord.xy * 1.37 - fract(uTime * 7.3) * 157.0) - 1.0;
  col += n * uGrain * 0.045 * (0.35 + l) * (1.0 - l);
  // fade to colour
  col = mix(col, uFadeColor, clamp(uFade, 0.0, 1.0));
  // letterbox bars (2.39:1 at letterbox = 1)
  if (uLetterbox > 0.0) {
    float aspect = uRes.x / uRes.y;
    float target = 1.0 - aspect / 2.39;
    float bar = max(target, 0.12) * 0.5 * clamp(uLetterbox, 0.0, 1.0);
    float px = 1.0 / uRes.y;
    float m = smoothstep(bar - px, bar + px, vUv.y) * smoothstep(bar - px, bar + px, 1.0 - vUv.y);
    col *= m;
  }
  // dither (8-bit output)
  col += (dlbHash12(gl_FragCoord.xy + 0.5) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
