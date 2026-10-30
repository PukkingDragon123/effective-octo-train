// GLSL snippets shared by the render module's shaders. Registered as ShaderChunks
// (`#include <dlb_common>`, `#include <dlb_fog_common>`) so other modules' custom
// ShaderMaterials can use them too.

/** Hashes + cheap value noise (no samplers, safe anywhere). */
export const DLB_COMMON = /* glsl */ `
#ifndef DLB_COMMON_INCLUDED
#define DLB_COMMON_INCLUDED
float dlbHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float dlbHash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 dlbHash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float dlbNoise2(vec2 x) {
  vec2 i = floor(x); vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = dlbHash12(i), b = dlbHash12(i + vec2(1.0, 0.0));
  float c = dlbHash12(i + vec2(0.0, 1.0)), d = dlbHash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float dlbNoise3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dlbHash13(i), dlbHash13(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(dlbHash13(i + vec3(0.0, 1.0, 0.0)), dlbHash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(dlbHash13(i + vec3(0.0, 0.0, 1.0)), dlbHash13(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(dlbHash13(i + vec3(0.0, 1.0, 1.0)), dlbHash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float dlbFbm2(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * dlbNoise2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s / 0.9375;
}
float dlbLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// Interleaved gradient noise (per-pixel jitter)
float dlbIGN(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
#endif
`;

/** Uniform declarations for the global dlb* uniforms (fog, wind, headlights, lamps). */
export const DLB_GLOBALS_PARS = /* glsl */ `
#ifndef DLB_GLOBALS_INCLUDED
#define DLB_GLOBALS_INCLUDED
uniform float dlbTime;
uniform float dlbHour;
uniform float dlbWetness;
uniform float dlbRain;
uniform vec2 dlbWindDir;
uniform float dlbWindStrength;
uniform vec3 dlbFogColor;
uniform float dlbFogDensity;
uniform float dlbFogHeight;
uniform float dlbFogHeightFalloff;
uniform float dlbFogHeightDensity;
uniform float dlbFogNoise;
uniform vec3 dlbHeadlightPos;
uniform vec3 dlbHeadlightDir;
uniform float dlbHeadlightOn;
uniform vec3 dlbHeadlightColor;
uniform vec4 dlbHeadlightCone;
uniform vec3 dlbSunDir;
uniform vec3 dlbSunScatter;
uniform vec3 dlbMoonDir;
uniform vec3 dlbMoonScatter;
uniform vec4 dlbLampPos[4];
uniform vec4 dlbLampCol[4];
uniform float dlbSurreal;
uniform float dlbDawn;
uniform vec3 dlbAmbient;
uniform float dlbFlash;
uniform vec3 dlbSkyZenith;
uniform vec3 dlbSkyHorizon;
#endif
`;

/**
 * Fog maths: exponential distance fog + analytic exponential height fog + drifting
 * 3D noise + sun/moon forward scattering + headlight cone ray-march + analytic lamp
 * in-scattering. Requires dlb_common + dlb_globals.
 */
export const DLB_FOG_COMMON = /* glsl */ `
#ifndef DLB_FOG_COMMON_INCLUDED
#define DLB_FOG_COMMON_INCLUDED
float dlbFogNoiseAt(vec3 p) {
  vec3 drift = vec3(dlbWindDir.x, 0.0, dlbWindDir.y) * dlbTime * (0.35 + dlbWindStrength * 1.2) + vec3(0.0, dlbTime * 0.05, dlbTime * 0.02);
  vec3 q = (p - drift) * 0.085;
  return dlbNoise3(q) * 0.62 + dlbNoise3(q * 2.37 + vec3(7.1, 3.3, 1.9)) * 0.38;
}
// optical depth along a ray of length d (no noise)
float dlbFogOptical(vec3 ro, vec3 rd, float d) {
  float k = max(dlbFogHeightFalloff, 1e-4);
  float h0 = max(ro.y - dlbFogHeight, -25.0);
  float t = k * rd.y * d;
  float integ = abs(t) > 1e-3 ? (1.0 - exp(-t)) / t : 1.0 - 0.5 * t;
  return dlbFogDensity * d + dlbFogHeightDensity * exp(-k * h0) * d * integ;
}
float dlbPhaseHG(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (12.566 * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}
// colour of the fog medium seen along rd (ambient fog + sun/moon forward glow)
vec3 dlbFogTint(vec3 rd) {
  vec3 c = dlbFogColor;
  float cs = dot(rd, dlbSunDir);
  c += dlbSunScatter * (dlbPhaseHG(cs, 0.78) * 2.5 + 0.35 * max(cs, 0.0) + 0.1);
  float cm = dot(rd, dlbMoonDir);
  c += dlbMoonScatter * (dlbPhaseHG(cm, 0.8) * 2.5 + 0.15);
  c += dlbFlash * vec3(0.05, 0.055, 0.07);
  return c;
}
// light scattered toward the camera by the headlight beam and nearby lamps
vec3 dlbInscatter(vec3 ro, vec3 rd, float d, float sigma, vec2 fragXY) {
  vec3 acc = vec3(0.0);
  if (dlbHeadlightOn > 0.001) {
    float range = dlbHeadlightCone.z;
    float tmax = min(d, range + 4.0);
    int steps = int(dlbHeadlightCone.w);
    float dt = tmax / float(max(steps, 1));
    float jit = dlbIGN(fragXY + fract(dlbTime * 7.0) * 37.0);
    float sum = 0.0;
    for (int i = 0; i < 16; i++) {
      if (i >= steps) break;
      float t = (float(i) + jit) * dt;
      vec3 lv = ro + rd * t - dlbHeadlightPos;
      float ld = length(lv);
      vec3 l = lv / max(ld, 1e-3);
      float cone = smoothstep(dlbHeadlightCone.x, dlbHeadlightCone.y, dot(l, dlbHeadlightDir));
      float att = 1.0 / (1.0 + 0.09 * ld * ld) * (1.0 - smoothstep(range * 0.55, range, ld)) * smoothstep(0.0, 0.6, ld);
      float ph = 0.06 + dlbPhaseHG(dot(l, -rd), 0.55) * 0.6;
      sum += cone * att * ph * exp(-sigma * t);
    }
    acc += dlbHeadlightColor * (sum * dt * dlbHeadlightOn * (sigma * 18.0 + 0.04));
  }
  for (int i = 0; i < 4; i++) {
    vec4 lp = dlbLampPos[i];
    vec3 lc = dlbLampCol[i].rgb;
    if (lc.r + lc.g + lc.b < 1e-4) continue;
    vec3 oc = ro - lp.xyz;
    float b = dot(rd, oc);
    float c = dot(oc, oc);
    float h2 = max(c - b * b, 0.09);
    float h = sqrt(h2);
    float tm = min(d, max(-b, 0.0) + lp.w);
    // windowed 1/r^2 kernel: integral of 1/(h^2+t^2) - 1/(h^2+R^2+t^2), keeps the halo local
    float R = lp.w * 0.32;
    float H = sqrt(h2 + R * R);
    float I = (atan((tm + b) / h) - atan(b / h)) / h - (atan((tm + b) / H) - atan(b / H)) / H;
    float dist = sqrt(c);
    acc += lc * (max(I, 0.0) * 0.0011 * (sigma * 14.0 + 0.012) * exp(-sigma * dist * 0.5));
  }
  return acc;
}
// Cheap environment radiance for reflections (no env map): sky gradient seen through the
// haze, darker below the horizon, plus the nearest lamps as soft reflected glows.
vec3 dlbEnvRadiance(vec3 r, vec3 wp, float rough) {
  float y = r.y;
  vec3 sky = mix(dlbSkyHorizon, dlbSkyZenith, smoothstep(0.0, 0.75, y));
  vec3 c = mix(dlbFogTint(r), sky, smoothstep(0.0, 0.55, y) * 0.65);
  c = mix(c, dlbFogColor * 0.35, smoothstep(0.02, -0.35, y));
  float k = mix(2600.0, 30.0, sqrt(clamp(rough, 0.0, 1.0)));
  for (int i = 0; i < 4; i++) {
    vec3 lc = dlbLampCol[i].rgb;
    if (lc.r + lc.g + lc.b < 1e-4) continue;
    vec3 lv = dlbLampPos[i].xyz - wp;
    float d2 = dot(lv, lv);
    float cs = dot(r, lv * inversesqrt(max(d2, 1e-4)));
    float g = exp(-(1.0 - cs) * k) * (k / 60.0 + 1.0) * 0.012;
    // wide lobe: the lamp's fog halo seen in reflection
    float halo = exp(-(1.0 - cs) * 18.0) * 0.0035 * (dlbFogDensity * 30.0 + 0.3);
    c += lc * (g + halo) / (1.0 + d2 * 0.08);
  }
  return c;
}
// Full fog: returns the fogged colour of a surface at world position wp.
vec3 dlbApplyFog(vec3 col, vec3 wp, vec2 fragXY) {
  vec3 ro = cameraPosition;
  vec3 rv = wp - ro;
  float d = length(rv);
  vec3 rd = rv / max(d, 1e-4);
  float n = 0.5 * dlbFogNoiseAt(ro + rd * min(d * 0.5, 7.0)) + 0.5 * dlbFogNoiseAt(ro + rd * min(d, 32.0));
  float nm = mix(1.0, 0.18 + 1.65 * n * n, dlbFogNoise);
  float od = dlbFogOptical(ro, rd, d) * nm;
  float T = exp(-od);
#ifdef DLB_FOG_ADDITIVE
  return col * T;
#else
  float sigma = od / max(d, 1e-3);
  return col * T + dlbFogTint(rd) * (1.0 - T) + dlbInscatter(ro, rd, d, sigma, fragXY);
#endif
}
// Transmittance only (for additive particles / glows).
float dlbFogTransmittance(vec3 wp) {
  vec3 ro = cameraPosition;
  vec3 rv = wp - ro;
  float d = length(rv);
  return exp(-dlbFogOptical(ro, rv / max(d, 1e-4), d));
}
#endif
`;

/** Headlight cone factor at a world point (for particles lit by the beam). */
export const DLB_HEADLIGHT_FN = /* glsl */ `
#ifndef DLB_HEADLIGHT_FN_INCLUDED
#define DLB_HEADLIGHT_FN_INCLUDED
float dlbHeadlightAt(vec3 p) {
  if (dlbHeadlightOn < 0.001) return 0.0;
  vec3 lv = p - dlbHeadlightPos;
  float ld = length(lv);
  float cone = smoothstep(dlbHeadlightCone.x, dlbHeadlightCone.y, dot(lv / max(ld, 1e-3), dlbHeadlightDir));
  return cone * dlbHeadlightOn / (1.0 + 0.02 * ld * ld) * (1.0 - smoothstep(dlbHeadlightCone.z * 0.6, dlbHeadlightCone.z, ld));
}
vec3 dlbLampLightAt(vec3 p) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec3 lc = dlbLampCol[i].rgb;
    vec3 lv = p - dlbLampPos[i].xyz;
    float r = dlbLampPos[i].w;
    float d2 = dot(lv, lv);
    float fall = max(0.0, 1.0 - d2 / max(r * r, 1e-3));
    acc += lc * fall * fall / (1.0 + d2);
  }
  return acc * 0.012;
}
#endif
`;
