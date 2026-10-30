// Blood & gore: shared gore level, pooled / smeared blood decal material and the GLSL for
// the on-screen splatter used by PostFX (params.blood / bloodSplash()).
// settings.get('gore'): 'full' (default) | 'reduced' (darker, less saturated, sparser).
import * as THREE from 'three';
import { settings } from '../core/Settings.js';
import { paintedMaterial } from './Materials.js';

/** 0 = full gore, 1 = reduced. Shared by decals, the blood particle type and PostFX. */
export const GORE_UNIFORM = { value: 0 };
const readGore = () => {
  GORE_UNIFORM.value = (settings.get('gore') ?? 'full') === 'reduced' ? 1 : 0;
};
readGore();
settings.onChange(({ key }) => {
  if (key === 'gore' || key === '*') readGore();
});
export const goreReduced = () => GORE_UNIFORM.value > 0.5;

// ---------------------------------------------------------------------------
// Blood decal (pool + smear) — a wet, glossy painted MeshStandardMaterial.
// ---------------------------------------------------------------------------
const DECAL_VERT = /* glsl */ `
varying vec2 vBloodUv;
`;
const DECAL_FRAG_PARS = /* glsl */ `
varying vec2 vBloodUv;
uniform vec4 dlbBlood;   // x seed, y smear, z wetness, w coverage
uniform float dlbGore;
float dlbBloodThick = 0.0;
float dlbBloodRim = 0.0;
`;
// shape in uv space: an irregular pool, satellite drops, a smear dragged toward +u
const DECAL_SHAPE = /* glsl */ `
  {
    float sd = dlbBlood.x;
    float smear = dlbBlood.y;
    float cover = dlbBlood.w * (1.0 - dlbGore * 0.3);
    vec2 p = vBloodUv * 2.0 - 1.0;
    // pool: sits toward -u when smeared
    vec2 pc = p - vec2(-0.45 * smear, 0.0);
    pc.x /= 1.0 - 0.45 * smear;
    float ang = atan(pc.y, pc.x);
    float r = length(pc);
    float edge = (0.42 + 0.22 * cover) * (1.0 + 0.22 * (dlbFbm2(vec2(ang * 1.6, sd * 3.1)) - 0.5) + 0.1 * (dlbNoise2(pc * 7.0 + sd) - 0.5));
    float pool = smoothstep(edge, edge - 0.025, r);
    float thick = smoothstep(edge, edge * 0.35, r);
    // smear: streaky drag marks toward +u, thinning out
    float sm = 0.0;
    if (smear > 0.0) {
      float u = clamp((p.x + 0.45 * smear) / 1.4, 0.0, 1.0);
      float band = smoothstep(0.55 - u * 0.25, 0.2 - u * 0.15, abs(p.y + 0.06 * sin(p.x * 3.0 + sd)));
      float streak = smoothstep(0.38, 0.62, dlbNoise2(vec2(p.x * 1.3, p.y * 16.0 + sd * 7.0)));
      float broken = smoothstep(0.25, 0.55, dlbNoise2(vec2(p.x * 4.0 + sd, p.y * 3.0)));
      sm = band * mix(streak, 1.0, 0.25) * (1.0 - smoothstep(0.55, 1.0, u)) * smear * broken * step(-0.6, p.x);
    }
    // satellite drops
    float drops = 0.0;
    {
      vec2 g = p * 7.0 + sd * 3.0;
      vec2 ci = floor(g);
      vec2 f = fract(g) - 0.5;
      float h = dlbHash12(ci + sd);
      vec2 o = (vec2(dlbHash12(ci + 3.7), dlbHash12(ci + 9.1)) - 0.5) * 0.5;
      float rr = 0.08 + 0.16 * dlbHash12(ci + 1.3);
      float near = smoothstep(1.0, 0.45, length(p));
      drops = step(1.0 - 0.28 * near * (1.0 - dlbGore * 0.6), h) * smoothstep(rr, rr * 0.6, length(f - o));
    }
    float a = max(max(pool, sm), drops);
    if (a < 0.02) discard;
    dlbBloodThick = max(thick, max(sm * 0.45, drops * 0.6));
    dlbBloodRim = a * (1.0 - smoothstep(0.0, 0.18, thick)) * pool;
    // fresh dark crimson in the middle, almost black-brown dried rim, darker / greyer when reduced
    vec3 fresh = mix(vec3(0.16, 0.006, 0.01), vec3(0.075, 0.002, 0.006), dlbBloodThick);
    vec3 dried = vec3(0.035, 0.006, 0.005);
    vec3 bc = mix(fresh, dried, dlbBloodRim * 0.8);
    bc = mix(bc, vec3(dot(bc, vec3(0.3, 0.59, 0.11))) * vec3(1.3, 0.8, 0.8), dlbGore * 0.5) * (1.0 - dlbGore * 0.35);
    diffuseColor.rgb = bc * diffuseColor.rgb;
    diffuseColor.a *= a;
  }
`;
const DECAL_ROUGH = /* glsl */ `
  roughnessFactor = mix(0.55, mix(0.16, 0.035, dlbBlood.z), smoothstep(0.0, 0.5, dlbBloodThick));
  roughnessFactor = mix(roughnessFactor, 0.7, dlbBloodRim * 0.6);
`;

/**
 * Pooled / smeared blood for roads and floors: put it on a flat quad (PlaneGeometry rotated
 * flat, a few cm above the surface; uv 0..1 spans the decal). Wet sheen comes from real
 * lights (headlights) and the env term (nearest lamps). Transparent, no depth write,
 * polygon offset. opts: { color=0xffffff (multiplier), seed (0..1 shape variant), smear=0
 * (0..1 drag marks toward +u), wetness=1 (gloss), coverage=1, opacity=1, name }.
 * Live tweak: `mat.userData.uniforms.dlbBlood.value` (x seed, y smear, z wetness, w coverage).
 */
export function bloodDecalMaterial(opts = {}) {
  const blood = new THREE.Vector4(opts.seed ?? Math.random(), opts.smear ?? 0, opts.wetness ?? 1, opts.coverage ?? 1);
  const extra = { dlbBlood: { value: blood }, dlbGore: GORE_UNIFORM };
  const m = paintedMaterial({
    color: opts.color ?? 0xffffff,
    roughness: 0.2,
    metalness: 0,
    brush: 0.25,
    wet: 0,
    puddles: 0,
    envReflect: 1.3,
    transparent: true,
    opacity: opts.opacity ?? 1,
    depthWrite: false,
    name: opts.name ?? 'bloodDecal',
    _key: 'blood',
    _patch: (shader) => {
      Object.assign(shader.uniforms, extra);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + DECAL_VERT)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBloodUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + DECAL_FRAG_PARS)
        .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n' + DECAL_SHAPE)
        .replace('#include <lights_physical_fragment>', DECAL_ROUGH + '\n#include <lights_physical_fragment>');
    },
  });
  Object.assign(m.userData.uniforms, extra);
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -4;
  return m;
}

// ---------------------------------------------------------------------------
// Screen-space splatter (OUTPUT pass). Display-referred colours.
// ---------------------------------------------------------------------------
export const BLOOD_OVERLAY_GLSL = /* glsl */ `
uniform float uBlood;     // 0..1 effective amount
uniform float uBloodSeed;
uniform float uBloodRun;  // 0..1 drip run progress
uniform float uGore;      // 0 full, 1 reduced
// x coverage, y thickness, z dried rim
vec3 bloodField(vec2 uv, float amt) {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float sd = uBloodSeed;
  float e = min(min(uv.x, 1.0 - uv.x) * aspect, min(uv.y, 1.0 - uv.y));
  float n = dlbFbm2(p * 2.3 + sd * 13.1);
  float n2 = dlbNoise2(p * 11.0 + sd * 3.7);
  float F = (1.0 - smoothstep(0.0, 0.42, e)) * 0.95;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 h = vec2(dlbHash12(vec2(fi + 0.5, sd * 17.0 + 1.0)), dlbHash12(vec2(sd * 29.0 + 2.0, fi + 3.0)));
    float side = floor(h.x * 4.0);
    vec2 c = side < 1.0 ? vec2(h.y * aspect, -0.04) : side < 2.0 ? vec2(h.y * aspect, 1.04) : side < 3.0 ? vec2(-0.04, h.y) : vec2(aspect + 0.04, h.y);
    vec2 d = p - c;
    float ang = atan(d.y, d.x);
    float rad = (0.1 + 0.2 * dlbHash12(vec2(fi * 7.1 + 1.0, sd + 4.0))) * (0.55 + amt * 0.75) * (1.0 - uGore * 0.3);
    float spiky = 1.0 + 0.4 * (dlbNoise2(vec2(ang * 3.0, fi * 5.0 + sd)) - 0.5) + 0.3 * (dlbNoise2(vec2(ang * 11.0, fi + sd * 2.0)) - 0.5);
    F += smoothstep(rad * spiky, rad * spiky * 0.35, length(d)) * 0.9;
  }
  F += (n - 0.5) * 0.55 + (n2 - 0.5) * 0.1;
  float T = 1.32 - amt * 0.85;
  float cov = smoothstep(T - 0.015, T + 0.015, F);
  float thick = smoothstep(T, T + 0.5, F);
  float rim = cov * (1.0 - smoothstep(T + 0.015, T + 0.09, F));
  // flung droplets near the edges
  {
    vec2 g = p * 24.0;
    vec2 ci = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = dlbHash12(ci + sd * 31.0);
    float near = 1.0 - smoothstep(0.04, 0.45, e);
    if (h > 1.0 - 0.09 * amt * near * (1.0 - uGore * 0.7)) {
      vec2 o = (vec2(dlbHash12(ci + 7.0), dlbHash12(ci + 13.0)) - 0.5) * 0.45;
      float r = 0.1 + 0.22 * dlbHash12(ci + 5.0);
      float dd = length(f - o);
      float dt = smoothstep(r, r * 0.65, dd);
      cov = max(cov, dt);
      thick = max(thick, dt * 0.55);
      rim = max(rim, dt * smoothstep(r * 0.45, r * 0.9, dd));
    }
  }
  // runs: drips sliding down from the upper splatter
  {
    float colW = 0.022;
    float cx = floor(p.x / colW);
    float h1 = dlbHash12(vec2(cx + 0.5, sd * 11.0 + 1.0));
    if (h1 > 0.42 + uGore * 0.3) {
      float xc = (cx + 0.3 + 0.4 * dlbHash12(vec2(cx, 5.0 + sd))) * colW;
      float y0 = 1.0 - (0.03 + 0.22 * dlbHash12(vec2(cx, 9.0 + sd))) * (0.6 + amt * 0.6);
      float len = uBloodRun * (0.08 + 0.5 * dlbHash12(vec2(cx, 21.0 + sd))) * amt;
      float w = 0.0022 + 0.0045 * dlbHash12(vec2(cx, 33.0 + sd));
      float tip = y0 - len;
      float y = uv.y;
      float wy = w * (0.75 + 0.25 * dlbNoise2(vec2(cx * 3.0, y * 40.0)));
      float dx = abs(p.x - xc);
      float run = step(tip, y) * step(y, y0 + 0.02) * smoothstep(wy, wy * 0.55, dx);
      float bulb = smoothstep(w * 1.9, w * 1.2, length(vec2(dx, (y - tip - w * 0.8) * 0.8)));
      float dr = max(run, bulb * step(0.003, len));
      cov = max(cov, dr);
      thick = max(thick, dr * 0.85);
    }
  }
  return vec3(cov, thick, rim);
}
vec3 applyBlood(vec3 col, vec2 uv) {
  vec3 bf = bloodField(uv, uBlood);
  // derivatives first (uniform control flow)
  vec2 gr = vec2(dFdx(bf.y), dFdy(bf.y)) * 45.0;
  if (bf.x < 0.001) return col;
  vec3 fresh = mix(vec3(0.38, 0.018, 0.026), vec3(0.16, 0.004, 0.01), bf.y);
  vec3 dried = vec3(0.075, 0.008, 0.01);
  if (uGore > 0.5) {
    fresh = mix(fresh, vec3(dot(fresh, vec3(0.3, 0.59, 0.11))) * vec3(1.4, 0.75, 0.75), 0.5) * 0.65;
    dried *= 0.75;
  }
  vec3 bc = mix(fresh, dried, bf.z * 0.85);
  // thin film: the scene shows through, stained; thick: opaque crimson
  vec3 through = col * vec3(0.55, 0.05, 0.05) * (1.0 - uGore * 0.3) + bc * 0.3;
  vec3 c = mix(col, mix(through, bc, smoothstep(0.1, 0.7, bf.y)), bf.x);
  // wet highlight along the thickness gradient (light from the upper left)
  float spec = pow(clamp(dot(gr, vec2(-0.6, 0.8)), 0.0, 1.0), 2.0) * 0.22 * (1.0 - bf.z);
  return c + vec3(1.0, 0.72, 0.68) * spec * bf.x;
}
`;
