// Sky / time of day (21:00 .. 30 = 06:00) and weather.
//  * sky dome shader: night gradient, twinkling stars + faint milky way, moon disc with
//    phase, halo (reddish in the surreal hours), drifting clouds, horizon haze matched
//    to the fog, blue hour / dawn gradient, sun disc + glow + horizon bloom.
//  * lights: ambient + hemisphere + moon (directional) + sun (directional, shadows
//    only rendered while the sun is up), setShadowFocus() moves the shadow frustum.
//  * fog colour / density keyframes, global uniforms, per-hour grade targets for PostFX.
//  * weather: rain / fog / wind blend over time; wetness lags rain and dries slowly.
// Colour script: docs/GAME_DESIGN.md §9.
import * as THREE from 'three';
import { GLOBAL_UNIFORMS, injectGlobals } from './uniforms.js';
import { LAYERS } from '../core/layers.js';
import { settings } from '../core/Settings.js';
import { clamp, lerp, smoothstep, damp } from '../core/math.js';

const DEG = Math.PI / 180;
const C = (hex) => new THREE.Color(hex); // sRGB hex -> linear (ColorManagement)

// ---------------------------------------------------------------------------
// Keyframes. Colours are sRGB hex (converted to linear). Light intensities are
// three.js physical units (diffuse = albedo/π · E).
// ---------------------------------------------------------------------------
function K(h, o) {
  return { h, ...o };
}
const KEYS = [
  // 21-23 DREAD: near-black teal, desaturated, cold, green-tinted fog
  K(21.0, {
    zenith: 0x0a1113, mid: 0x131f1d, horizon: 0x253837, fog: 0x1f312b, fogDensity: 0.022, fogH: 0.05, fogK: 0.12, fogNoise: 0.7,
    amb: 0x6f9a92, ambI: 0.144, hemiSky: 0x527672, hemiGround: 0x0b0f0a, hemiI: 0.484, moonC: 0x9fbcc0, moonI: 0.324,
    stars: 0.15, clouds: 0.82, cloudC: 0x1f2e2c, skyVis: 0.55, surreal: 0, dawn: 0, moonScatter: 0.6, glow: 0x000000, glowI: 0,
    exposure: 3.5, sat: 0.66, contrast: 1.1, temp: -0.16, tint: 0.05, lift: [0.003, 0.008, 0.008], gain: [0.96, 1.0, 0.98],
    shadowTint: 0x163432, highTint: 0xcfa36a, split: 0.32,
  }),
  K(22.5, {
    zenith: 0x080d0f, mid: 0x111a1a, horizon: 0x20312f, fog: 0x1a2b26, fogDensity: 0.025, fogH: 0.055, fogK: 0.12, fogNoise: 0.75,
    amb: 0x6f9a92, ambI: 0.128, hemiSky: 0x4a6e6a, hemiGround: 0x0a0d09, hemiI: 0.44, moonC: 0x9fbcc0, moonI: 0.288,
    stars: 0.1, clouds: 0.85, cloudC: 0x1c2928, skyVis: 0.5, surreal: 0.05, dawn: 0, moonScatter: 0.55, glow: 0x000000, glowI: 0,
    exposure: 3.5, sat: 0.62, contrast: 1.12, temp: -0.18, tint: 0.06, lift: [0.003, 0.008, 0.008], gain: [0.96, 1.0, 0.98],
    shadowTint: 0x153330, highTint: 0xcfa36a, split: 0.34,
  }),
  // 23-02 SURREAL: sickly green + crimson, reddish moon, purple haze
  K(23.5, {
    zenith: 0x0f0b17, mid: 0x1a1425, horizon: 0x362b44, fog: 0x2b223c, fogDensity: 0.02, fogH: 0.045, fogK: 0.12, fogNoise: 0.7,
    amb: 0x86a052, ambI: 0.128, hemiSky: 0x6c8a46, hemiGround: 0x140a12, hemiI: 0.484, moonC: 0xd07a5a, moonI: 0.306,
    stars: 0.25, clouds: 0.62, cloudC: 0x2b1f36, skyVis: 0.62, surreal: 1, dawn: 0, moonScatter: 0.9, glow: 0x3a0c14, glowI: 0.25,
    exposure: 3.4, sat: 0.84, contrast: 1.1, temp: -0.04, tint: 0.12, lift: [0.006, 0.006, 0.008], gain: [1.02, 0.97, 0.98],
    shadowTint: 0x2a4a1c, highTint: 0xd0303c, split: 0.4,
  }),
  K(25.0, {
    zenith: 0x0d0915, mid: 0x181324, horizon: 0x312748, fog: 0x252037, fogDensity: 0.016, fogH: 0.035, fogK: 0.13, fogNoise: 0.6,
    amb: 0x86a052, ambI: 0.128, hemiSky: 0x627f48, hemiGround: 0x120a10, hemiI: 0.484, moonC: 0xd8705a, moonI: 0.36,
    stars: 0.45, clouds: 0.42, cloudC: 0x271e37, skyVis: 0.72, surreal: 1, dawn: 0, moonScatter: 0.85, glow: 0x30101a, glowI: 0.2,
    exposure: 3.3, sat: 0.86, contrast: 1.08, temp: -0.02, tint: 0.1, lift: [0.006, 0.006, 0.009], gain: [1.02, 0.97, 0.99],
    shadowTint: 0x2a481e, highTint: 0xc82c40, split: 0.38,
  }),
  // 02-04 CALM: warmer amber, stars, fireflies, soft blue moonlight
  K(26.3, {
    zenith: 0x070b14, mid: 0x0f1725, horizon: 0x1f2a3b, fog: 0x18212f, fogDensity: 0.009, fogH: 0.022, fogK: 0.14, fogNoise: 0.5,
    amb: 0x6a7a98, ambI: 0.16, hemiSky: 0x56688a, hemiGround: 0x17140e, hemiI: 0.6, moonC: 0xc4d2ea, moonI: 0.6,
    stars: 1.0, clouds: 0.2, cloudC: 0x141c2a, skyVis: 0.9, surreal: 0, dawn: 0, moonScatter: 0.8, glow: 0x000000, glowI: 0,
    exposure: 3.3, sat: 0.88, contrast: 1.05, temp: 0.07, tint: 0.0, lift: [0.003, 0.005, 0.01], gain: [1.03, 1.0, 0.96],
    shadowTint: 0x2a3858, highTint: 0xe8b070, split: 0.3,
  }),
  K(27.6, {
    zenith: 0x080d18, mid: 0x111a2a, horizon: 0x232f43, fog: 0x1b2535, fogDensity: 0.01, fogH: 0.028, fogK: 0.15, fogNoise: 0.5,
    amb: 0x6a7a98, ambI: 0.17, hemiSky: 0x56688a, hemiGround: 0x17140e, hemiI: 0.62, moonC: 0xc4d2ea, moonI: 0.55,
    stars: 0.9, clouds: 0.22, cloudC: 0x172031, skyVis: 0.9, surreal: 0, dawn: 0.0, moonScatter: 0.7, glow: 0x000000, glowI: 0,
    exposure: 3.2, sat: 0.9, contrast: 1.04, temp: 0.06, tint: 0.0, lift: [0.003, 0.005, 0.01], gain: [1.03, 1.0, 0.97],
    shadowTint: 0x2a3858, highTint: 0xe8b070, split: 0.28,
  }),
  // 04-06 DAWN: indigo -> cyan -> peach, glowing mist, golden sunrise ~05:45
  K(28.5, {
    zenith: 0x0e1226, mid: 0x1c2240, horizon: 0x363d5c, fog: 0x2a3048, fogDensity: 0.01, fogH: 0.035, fogK: 0.18, fogNoise: 0.55,
    amb: 0x70769a, ambI: 0.3, hemiSky: 0x5a6090, hemiGround: 0x1a1a22, hemiI: 0.85, moonC: 0xb0c0f0, moonI: 0.2,
    stars: 0.35, clouds: 0.3, cloudC: 0x2a3050, skyVis: 0.85, surreal: 0, dawn: 0.25, moonScatter: 0.4, glow: 0x3a3070, glowI: 0.3,
    exposure: 2.6, sat: 0.78, contrast: 1.04, temp: -0.06, tint: -0.02, lift: [0.008, 0.008, 0.02], gain: [1.0, 1.0, 1.02],
    shadowTint: 0x34345a, highTint: 0xb0b4e0, split: 0.26,
  }),
  K(29.1, {
    zenith: 0x1e3460, mid: 0x3a6080, horizon: 0x78a2b0, fog: 0x587c88, fogDensity: 0.008, fogH: 0.024, fogK: 0.22, fogNoise: 0.55,
    amb: 0x9ab8cc, ambI: 0.28, hemiSky: 0x86aac8, hemiGround: 0x2a2a26, hemiI: 0.6, moonC: 0xc0d0f0, moonI: 0.05,
    stars: 0.05, clouds: 0.32, cloudC: 0x6a7e98, skyVis: 0.85, surreal: 0, dawn: 0.5, moonScatter: 0.15, glow: 0xd09080, glowI: 0.5,
    exposure: 1.4, sat: 1.0, contrast: 1.05, temp: -0.02, tint: 0.0, lift: [0.006, 0.01, 0.014], gain: [1.0, 1.0, 1.0],
    shadowTint: 0x2a4a6a, highTint: 0xf0c0a0, split: 0.24,
  }),
  K(29.55, {
    zenith: 0x34507e, mid: 0x7c98ae, horizon: 0xe0a487, fog: 0x9a8a8a, fogDensity: 0.005, fogH: 0.02, fogK: 0.25, fogNoise: 0.55,
    amb: 0xd0b0a8, ambI: 0.3, hemiSky: 0xa0b8d0, hemiGround: 0x3a3028, hemiI: 0.6, moonC: 0xc0d0f0, moonI: 0.0,
    stars: 0.0, clouds: 0.3, cloudC: 0xc09890, skyVis: 0.85, surreal: 0, dawn: 0.75, moonScatter: 0.0, glow: 0xffa070, glowI: 0.9,
    exposure: 1.05, sat: 1.04, contrast: 1.06, temp: 0.08, tint: 0.02, lift: [0.008, 0.006, 0.01], gain: [1.02, 1.0, 0.98],
    shadowTint: 0x3a4a7a, highTint: 0xffc890, split: 0.26,
  }),
  K(29.75, {
    zenith: 0x3d64a0, mid: 0x9cb0c0, horizon: 0xf0b078, fog: 0xc09a78, fogDensity: 0.0045, fogH: 0.018, fogK: 0.25, fogNoise: 0.55,
    amb: 0xe0c0a0, ambI: 0.3, hemiSky: 0xb0c4d8, hemiGround: 0x483626, hemiI: 0.6, moonC: 0xc0d0f0, moonI: 0.0,
    stars: 0.0, clouds: 0.28, cloudC: 0xe0a880, skyVis: 0.85, surreal: 0, dawn: 0.9, moonScatter: 0.0, glow: 0xffb060, glowI: 1.2,
    exposure: 0.95, sat: 1.08, contrast: 1.07, temp: 0.14, tint: 0.02, lift: [0.01, 0.006, 0.008], gain: [1.04, 1.0, 0.95],
    shadowTint: 0x3a4a7a, highTint: 0xffc070, split: 0.28,
  }),
  K(30.0, {
    zenith: 0x5480b2, mid: 0xb0c4d0, horizon: 0xf0c490, fog: 0xc8ac8c, fogDensity: 0.0035, fogH: 0.012, fogK: 0.25, fogNoise: 0.5,
    amb: 0xe8d0b0, ambI: 0.35, hemiSky: 0xc0d4e8, hemiGround: 0x4a3a28, hemiI: 0.7, moonC: 0xc0d0f0, moonI: 0.0,
    stars: 0.0, clouds: 0.25, cloudC: 0xf0c8a0, skyVis: 0.9, surreal: 0, dawn: 1.0, moonScatter: 0.0, glow: 0xffc070, glowI: 1.0,
    exposure: 0.95, sat: 1.06, contrast: 1.05, temp: 0.12, tint: 0.01, lift: [0.01, 0.008, 0.008], gain: [1.03, 1.0, 0.96],
    shadowTint: 0x40507a, highTint: 0xffd090, split: 0.24,
  }),
];
// pre-convert colours
const COLOR_KEYS = ['zenith', 'mid', 'horizon', 'fog', 'amb', 'hemiSky', 'hemiGround', 'moonC', 'cloudC', 'glow', 'shadowTint', 'highTint'];
for (const k of KEYS) for (const c of COLOR_KEYS) k[c] = C(k[c]);

const NUM_KEYS = ['fogDensity', 'fogH', 'fogK', 'fogNoise', 'ambI', 'hemiI', 'moonI', 'stars', 'clouds', 'skyVis', 'surreal', 'dawn', 'moonScatter', 'glowI', 'exposure', 'sat', 'contrast', 'temp', 'tint', 'split'];

// ---------------------------------------------------------------------------
// Sky dome shader
// ---------------------------------------------------------------------------
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;
const SKY_FRAG = /* glsl */ `
#include <dlb_common>
#include <dlb_globals>
#include <dlb_fog_common>
varying vec3 vDir;
uniform vec3 uZenith, uMid, uHorizon;
uniform vec3 uMoonDirS, uMoonCol;
uniform float uMoonSize, uMoonPhase, uMoonI, uMoonHalo;
uniform vec3 uSunDirS, uSunCol;
uniform float uSunI;
uniform float uStars, uClouds, uSkyVis, uGlowI;
uniform vec3 uCloudCol, uGlowCol;
uniform vec2 uCloudOffset;
uniform float uSkyAlpha;

float starLayer(vec3 rd, float scale, float thresh, float t) {
  vec3 p = rd * scale;
  vec3 cell = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = dlbHash13(cell);
  if (h < thresh) return 0.0;
  vec3 o = (dlbHash33(cell + 17.0) - 0.5) * 0.6;
  float d = length(f - o);
  float px = 0.5 * (fwidth(p.x) + fwidth(p.y)); // cell units per pixel
  float rad = max(px * 0.7, 0.015);
  float s = exp(-(d * d) / (rad * rad));
  float tw = 0.6 + 0.4 * sin(t * (1.5 + h * 6.0) + h * 91.0);
  float b = (h - thresh) / (1.0 - thresh);
  return s * tw * (0.2 + b * b * 2.4);
}

void main() {
  vec3 rd = normalize(vDir);
  float y = rd.y;
  float yc = max(y, 0.0);
  // gradient
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.28, yc));
  col = mix(col, uZenith, smoothstep(0.22, 0.95, yc));
  // dawn horizon glow / bloom toward the sun azimuth
  vec2 sxz = uSunDirS.xz;
  float sl = length(sxz);
  float az = sl > 1e-3 ? dot(normalize(rd.xz + 1e-5), sxz / sl) : 0.0;
  float band = exp(-yc * 7.0) * (0.35 + 0.65 * pow(max(az, 0.0), 3.0));
  col += uGlowCol * band * uGlowI;
  // stars + faint milky way
  float clearSky = smoothstep(0.02, 0.25, y);
  float st = starLayer(rd, 260.0, 0.986, dlbTime) * 0.7 + starLayer(rd, 120.0, 0.993, dlbTime * 0.7) * 1.6;
  vec3 mwAxis = normalize(vec3(0.35, 0.55, -0.76));
  float mw = exp(-pow(dot(rd, mwAxis) * 3.2, 2.0)) * (0.4 + 0.6 * dlbFbm2(rd.xz / (abs(y) + 0.6) * 3.0));
  vec3 stars = vec3(0.85, 0.9, 1.0) * st * 0.9 + vec3(0.06, 0.07, 0.1) * mw * 0.18;
  // moon disc with phase + halo
  float cm = dot(rd, uMoonDirS);
  vec3 moon = vec3(0.0);
  {
    vec3 up0 = abs(uMoonDirS.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 mr = normalize(cross(up0, uMoonDirS));
    vec3 mu = cross(uMoonDirS, mr);
    vec2 uv = vec2(dot(rd, mr), dot(rd, mu)) / uMoonSize;
    float r = length(uv);
    float aa = fwidth(r) * 1.5;
    float disc = (1.0 - smoothstep(1.0 - aa, 1.0, r)) * step(0.0, cm);
    if (disc > 0.0) {
      vec3 n = vec3(uv, sqrt(max(1.0 - r * r, 0.0)));
      vec3 L = vec3(sin(uMoonPhase), 0.15, cos(uMoonPhase));
      float lit = smoothstep(-0.08, 0.12, dot(n, normalize(L)));
      float maria = 0.72 + 0.28 * smoothstep(0.35, 0.7, dlbFbm2(uv * 2.3 + 4.0));
      float crater = 0.9 + 0.1 * dlbNoise2(uv * 9.0);
      moon = uMoonCol * disc * (lit * maria * crater * 3.2 + 0.035);
    }
    float a = max(1.0 - cm, 0.0);
    float halo = exp(-a * 900.0) * 0.6 + exp(-a * 70.0) * 0.18 + exp(-a * 9.0) * 0.05;
    moon += uMoonCol * halo * uMoonHalo;
    moon *= uMoonI;
  }
  // sun disc + glow
  vec3 sun = vec3(0.0);
  {
    float cs = dot(rd, uSunDirS);
    float a = max(1.0 - cs, 0.0);
    float disc = 1.0 - smoothstep(0.00006, 0.00011, a);
    sun = uSunCol * (disc * 40.0 + exp(-a * 1400.0) * 3.0 + exp(-a * 120.0) * 0.7 + exp(-a * 14.0) * 0.18) * uSunI;
  }
  // clouds: drifting fbm on a plane projection
  float cloudA = 0.0;
  vec3 cloudCol = uCloudCol;
  {
    vec2 cuv = rd.xz / (yc + 0.09) * 0.55 + uCloudOffset;
    float n = dlbFbm2(cuv * 0.9) * 0.7 + dlbFbm2(cuv * 2.7 + 3.0) * 0.3;
    n = clamp((n - 0.5) * 2.6 + 0.5, 0.0, 1.0);
    float cov = uClouds;
    cloudA = smoothstep(1.0 - cov - 0.06, 1.0 - cov + 0.22, n) * smoothstep(0.0, 0.12, y);
    // silver lining near the moon, warm underside near the sun
    float edge = smoothstep(0.18, 0.0, abs(n - (1.0 - cov + 0.04)));
    cloudCol += uMoonCol * uMoonI * (exp(-max(1.0 - cm, 0.0) * 12.0) * (0.25 + edge * 0.9)) * 0.35;
    float csun = dot(rd, uSunDirS);
    cloudCol += uGlowCol * uGlowI * (0.25 + 0.75 * exp(-max(1.0 - csun, 0.0) * 4.0)) * (0.25 + edge * 0.6) * (1.0 - smoothstep(0.0, 0.5, yc));
    cloudCol *= 0.85 + 0.3 * n;
  }
  col += stars * uStars * clearSky * (1.0 - cloudA) + moon * (1.0 - cloudA * 0.85) + sun * (1.0 - cloudA * 0.7);
  col = mix(col, cloudCol, cloudA * 0.92);
  // haze: blend into the fog toward the horizon and when the fog is thick
  vec3 fogC = dlbFogTint(rd);
  float haze = 1.0 - smoothstep(-0.03, 0.42, y);
  haze = max(haze * haze * (3.0 - 2.0 * haze), 1.0 - uSkyVis);
  col = mix(col, fogC, clamp(haze, 0.0, 1.0));
  // keep the moon / sun glowing through the haze a bit
  col += (moon + sun * 0.5) * haze * 0.35 * (1.0 - cloudA);
  // headlight / lamp scattering seen against the sky
  float sigma = dlbFogDensity + dlbFogHeightDensity * 0.5;
  col += dlbInscatter(cameraPosition, rd, 80.0, sigma, gl_FragCoord.xy);
  col += dlbFlash * vec3(0.12, 0.13, 0.16) * (0.5 + 0.5 * yc);
  // alpha 0 marks sky pixels in the main pass (PostFX uses it as the sun-shaft occlusion mask);
  // other passes (mirrors, probes) get alpha 1.
  gl_FragColor = vec4(max(col, vec3(0.0)), uSkyAlpha);
}
`;

const _v = new THREE.Vector3();
const _c = new THREE.Color();

class Sky {
  constructor() {
    this.hour = 21;
    /** current (blended) weather */
    this.weather = { rain: 0, fog: 0, wind: 0.3 };
    this._wFrom = { rain: 0, fog: 0, wind: 0.3 };
    this._wTo = { rain: 0, fog: 0, wind: 0.3 };
    this._wT = 1;
    this._wDur = 0;
    this.wetness = GLOBAL_UNIFORMS.uWetness.value;
    this.surreal = 0;
    this.dawn = 0;
    /** degrees: compass direction of the sunrise (0 = -Z, 90 = +X). */
    this.sunAzimuth = 75;
    this.moonAzimuthOffset = 0;
    /** 0 = new, 0.5 = full, 1 = new again (default: waxing gibbous). */
    this.moonPhase = 0.62;
    /** 0..1 how much the height fog base follows the ground under the camera (vs world y = uFogHeight base). */
    this.fogFollow = 0.65;
    this.fogBaseY = 0;
    this.overrides = {}; // e.g. { fogDensity: 0.05 } forces values (cinematics)
    this.group = new THREE.Group();
    this.group.name = 'sky';

    this.ambient = new THREE.AmbientLight(0x334455, 0.1);
    this.hemi = new THREE.HemisphereLight(0x406080, 0x101010, 0.3);
    this.moon = new THREE.DirectionalLight(0x8899cc, 0.2);
    this.moon.position.set(30, 60, 20);
    this.sun = new THREE.DirectionalLight(0xffd6a0, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(settings.get('shadowMapSize') || 2048, settings.get('shadowMapSize') || 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.sun.shadow.autoUpdate = false;
    this.sun.shadow.needsUpdate = true;
    this.group.add(this.ambient, this.hemi, this.moon, this.sun, this.moon.target, this.sun.target);
    for (const l of [this.ambient, this.hemi, this.moon, this.sun]) l.layers.enable(LAYERS.GLASS);
    this.shadowFocus = new THREE.Vector3();
    this._hasFocus = false;

    // grading targets read by PostFX
    this.grade = {
      exposure: 1.8, saturation: 0.7, contrast: 1.08, temperature: -0.15, tint: 0.04,
      lift: new THREE.Vector3(), gain: new THREE.Vector3(1, 1, 1),
      shadowTint: new THREE.Color(), highlightTint: new THREE.Color(), split: 0.3,
    };
    /** sun state for post (god rays) */
    this.sunVisibility = 0;
    this.sunColor = new THREE.Color();
    this.sunDir = new THREE.Vector3(0, -1, 0);
    this.moonDir = new THREE.Vector3(0, 1, 0);

    this.uniforms = {
      uZenith: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uMoonDirS: { value: new THREE.Vector3(0, 1, 0) }, uMoonCol: { value: new THREE.Color() },
      uMoonSize: { value: 0.022 }, uMoonPhase: { value: 0.9 }, uMoonI: { value: 1 }, uMoonHalo: { value: 1 },
      uSunDirS: { value: new THREE.Vector3(0, -1, 0) }, uSunCol: { value: new THREE.Color() }, uSunI: { value: 0 },
      uStars: { value: 0 }, uClouds: { value: 0.5 }, uSkyVis: { value: 0.6 }, uGlowI: { value: 0 },
      uCloudCol: { value: new THREE.Color() }, uGlowCol: { value: new THREE.Color() }, uCloudOffset: { value: new THREE.Vector2() },
      uSkyAlpha: { value: 1 },
    };
    injectGlobals(this.uniforms);
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
        side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
      }),
    );
    this.dome.name = 'skyDome';
    this.dome.scale.setScalar(500);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10000;
    this.dome.layers.enable(LAYERS.REFLECTION_ONLY);
    this.group.add(this.dome);
    this._cur = {};
    this._cloudOffset = new THREE.Vector2();
    this._windAngle = Math.atan2(GLOBAL_UNIFORMS.uWindDir.value.y, GLOBAL_UNIFORMS.uWindDir.value.x);
    this._lightningT = 12 + Math.random() * 20;
    this._lightning = 0;
    this.lightning = true; // random distant lightning during heavy rain
    settings.onChange(({ key }) => {
      if (key === 'shadowMapSize' || key === 'graphicsPreset' || key === '*') {
        const s = settings.get('shadowMapSize') || 2048;
        this.sun.shadow.mapSize.set(s, s);
        if (this.sun.shadow.map) {
          this.sun.shadow.map.dispose();
          this.sun.shadow.map = null;
        }
        this.sun.shadow.needsUpdate = true;
      }
    });
    this.setHour(21);
  }

  /** Hour 21..30 (30 = 06:00). Continuous. */
  setHour(h) {
    this.hour = clamp(h, 21, 30);
    GLOBAL_UNIFORMS.uHour.value = this.hour;
    this._evaluate();
    this._applyLights();
  }

  /** Blend weather over `seconds`. w = { rain 0..1, fog 0..1 (extra density), wind 0..1 } */
  setWeather(w, seconds = 4) {
    Object.assign(this._wFrom, this.weather);
    Object.assign(this._wTo, this.weather, w);
    this._wDur = Math.max(0, seconds);
    this._wT = 0;
    if (this._wDur === 0) {
      Object.assign(this.weather, this._wTo);
      this._wT = 1;
    }
  }

  /** Force wetness immediately (0..1); otherwise it follows rain with lag. */
  setWetness(v) {
    this.wetness = clamp(v, 0, 1);
    GLOBAL_UNIFORMS.uWetness.value = this.wetness;
  }

  /** Keep shadow camera centred on a point (taxi / player). */
  setShadowFocus(v) {
    if (!v) {
      this._hasFocus = false;
      return;
    }
    this.shadowFocus.copy(v);
    this._hasFocus = true;
  }

  /** Lightning flash (thunder is up to audio). */
  flash(strength = 1) {
    this._lightning = Math.max(this._lightning, strength);
  }

  _evaluate() {
    const h = this.hour;
    let i = 0;
    while (i < KEYS.length - 2 && h > KEYS[i + 1].h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    let t = clamp((h - a.h) / (b.h - a.h), 0, 1);
    t = t * t * (3 - 2 * t);
    const cur = this._cur;
    for (const k of NUM_KEYS) cur[k] = lerp(a[k], b[k], t);
    for (const k of COLOR_KEYS) {
      if (!cur[k]) cur[k] = new THREE.Color();
      cur[k].copy(a[k]).lerp(b[k], t);
    }
    if (!cur.lift) {
      cur.lift = new THREE.Vector3();
      cur.gain = new THREE.Vector3();
    }
    cur.lift.set(lerp(a.lift[0], b.lift[0], t), lerp(a.lift[1], b.lift[1], t), lerp(a.lift[2], b.lift[2], t));
    cur.gain.set(lerp(a.gain[0], b.gain[0], t), lerp(a.gain[1], b.gain[1], t), lerp(a.gain[2], b.gain[2], t));
    for (const k in this.overrides) if (k in cur && typeof this.overrides[k] === 'number') cur[k] = this.overrides[k];
  }

  _applyLights() {
    const cur = this._cur;
    const h = this.hour;
    const w = this.weather;
    const rain = w.rain;
    const U = GLOBAL_UNIFORMS;
    // --- celestial geometry --------------------------------------------------
    // moon: rises in the east around 20:00, highest ~01:30, low in the west by 06:00
    const mt = clamp((h - 19.5) / 11, 0, 1);
    const moonElev = Math.sin(mt * Math.PI) * 58 * DEG + 4 * DEG;
    const moonAz = (this.sunAzimuth + 10 + mt * 160 + this.moonAzimuthOffset) * DEG;
    this.moonDir.set(Math.sin(moonAz) * Math.cos(moonElev), Math.sin(moonElev), -Math.cos(moonAz) * Math.cos(moonElev));
    // sun: below horizon until ~05:35, +7° at 06:00
    const sunElev = (-18 + 25 * smoothstep(27.6, 30.0, h) * 1.0) * DEG - (1 - smoothstep(29.0, 30.0, h)) * 2 * DEG;
    const sunAz = this.sunAzimuth * DEG;
    this.sunDir.set(Math.sin(sunAz) * Math.cos(sunElev), Math.sin(sunElev), -Math.cos(sunAz) * Math.cos(sunElev));
    const sunUp = smoothstep(-2 * DEG, 4 * DEG, sunElev);
    this.sunVisibility = sunUp * (1 - rain * 0.8) * (1 - (w.fog || 0) * 0.5);

    // --- surreal / dawn -----------------------------------------------------
    this.surreal = cur.surreal;
    this.dawn = cur.dawn;
    U.uSurreal.value = cur.surreal;
    U.uDawn.value = cur.dawn;

    // --- fog -----------------------------------------------------------------
    const fogMul = (1 + rain * 0.35) * (1 + (w.fog || 0) * 1.6);
    U.uFogColor.value.copy(cur.fog);
    if (rain > 0) U.uFogColor.value.lerp(_c.copy(cur.fog).multiplyScalar(0.8), rain * 0.5);
    U.uFogDensity.value = (this.overrides.fogDensity ?? cur.fogDensity) * fogMul;
    U.uFogHeightDensity.value = cur.fogH * (1 + (w.fog || 0) * 1.2);
    U.uFogNoise.value = cur.fogNoise;
    U.uFogHeightFalloff.value = cur.fogK;
    U.uMoonDir.value.copy(this.moonDir);
    U.uMoonScatter.value.copy(cur.moonC).multiplyScalar(cur.moonI * cur.moonScatter * 0.09 * (1 - rain * 0.5));
    U.uSunDir.value.copy(this.sunDir);
    this.sunColor.setRGB(1.0, 0.62, 0.3).lerp(_c.setRGB(1.0, 0.78, 0.52), smoothstep(29.6, 30.0, h));
    U.uSunScatter.value.copy(this.sunColor).multiplyScalar(smoothstep(-6 * DEG, 3 * DEG, sunElev) * 0.22 * (1 - rain * 0.6));

    // --- lights ---------------------------------------------------------------
    const lightning = this._lightning;
    this.ambient.color.copy(cur.amb);
    this.ambient.intensity = cur.ambI * (1 - rain * 0.25) + lightning * 0.6;
    this.hemi.color.copy(cur.hemiSky);
    this.hemi.groundColor.copy(cur.hemiGround);
    this.hemi.intensity = cur.hemiI * (1 - rain * 0.25) + lightning * 1.5;
    this.moon.color.copy(cur.moonC);
    const phaseLight = 0.35 + 0.65 * Math.cos((this.moonPhase - 0.5) * Math.PI * 2) * 0.5 + 0.325;
    this.moon.intensity = cur.moonI * (1 - rain * 0.6) * smoothstep(-3 * DEG, 8 * DEG, moonElev) * phaseLight;
    this.sun.color.copy(this.sunColor);
    this.sun.intensity = 4.2 * sunUp * (1 - rain * 0.7);
    const sunCasting = this.sun.intensity > 0.02 && settings.get('shadows');
    this.sun.shadow.autoUpdate = !!sunCasting;
    U.uAmbient.value.copy(cur.amb).multiplyScalar(cur.ambI).add(_c.copy(cur.hemiSky).multiplyScalar(cur.hemiI * 0.6));
    U.uMoonLight.value.copy(cur.moonC).multiplyScalar(this.moon.intensity);
    U.uSunLight.value.copy(this.sunColor).multiplyScalar(this.sun.intensity);
    U.uFlash.value = lightning * 0.6;

    U.uSkyZenith.value.copy(cur.zenith);
    U.uSkyHorizon.value.copy(cur.horizon).lerp(cur.fog, 0.5);
    // --- sky dome uniforms ---------------------------------------------------
    const su = this.uniforms;
    su.uZenith.value.copy(cur.zenith);
    su.uMid.value.copy(cur.mid);
    su.uHorizon.value.copy(cur.horizon);
    su.uMoonDirS.value.copy(this.moonDir);
    su.uMoonCol.value.copy(cur.moonC);
    su.uMoonI.value = (1 - rain * 0.7) * (1 - smoothstep(29.2, 29.8, h));
    su.uMoonPhase.value = (this.moonPhase - 0.5) * Math.PI * 2;
    su.uMoonHalo.value = 1 + cur.surreal * 1.5 + cur.fogDensity * 10;
    su.uSunDirS.value.copy(this.sunDir);
    su.uSunCol.value.copy(this.sunColor);
    su.uSunI.value = smoothstep(-4 * DEG, 2 * DEG, sunElev) * (1 - rain * 0.7);
    su.uStars.value = cur.stars * (1 - rain);
    su.uClouds.value = clamp(cur.clouds + rain * 0.5, 0, 0.97);
    su.uCloudCol.value.copy(cur.cloudC);
    su.uSkyVis.value = cur.skyVis * (1 - rain * 0.35) * (1 - (w.fog || 0) * 0.5);
    su.uGlowCol.value.copy(cur.glow);
    su.uGlowI.value = cur.glowI * (1 - rain * 0.5);

    // --- grade ------------------------------------------------------------------
    const g = this.grade;
    g.exposure = cur.exposure;
    g.saturation = cur.sat * (1 - rain * 0.08);
    g.contrast = cur.contrast;
    g.temperature = cur.temp - rain * 0.04;
    g.tint = cur.tint;
    g.lift.copy(cur.lift);
    g.gain.copy(cur.gain);
    g.shadowTint.copy(cur.shadowTint);
    g.highlightTint.copy(cur.highTint);
    g.split = cur.split;
  }

  update(dt, camera) {
    const U = GLOBAL_UNIFORMS;
    // weather blending
    if (this._wT < 1) {
      this._wT = this._wDur > 0 ? Math.min(1, this._wT + dt / this._wDur) : 1;
      const t = smoothstep(0, 1, this._wT);
      for (const k of ['rain', 'fog', 'wind']) this.weather[k] = lerp(this._wFrom[k] ?? 0, this._wTo[k] ?? 0, t);
    }
    const w = this.weather;
    U.uRain.value = w.rain;
    // wetness lags rain: soaks in ~30 s, dries over several minutes
    const wetTarget = Math.max(w.rain, 0);
    if (wetTarget > this.wetness) this.wetness = Math.min(wetTarget, this.wetness + dt * (0.02 + w.rain * 0.04));
    else this.wetness = Math.max(wetTarget, this.wetness - dt * 0.0025);
    U.uWetness.value = this.wetness;
    // wind: strength + slowly meandering direction
    U.uWindStrength.value = damp(U.uWindStrength.value, w.wind + w.rain * 0.15, 0.8, dt);
    this._windAngle += Math.sin(U.uTime.value * 0.031) * dt * 0.02;
    U.uWindDir.value.set(Math.cos(this._windAngle), Math.sin(this._windAngle));
    this._cloudOffset.x += U.uWindDir.value.x * dt * (0.004 + w.wind * 0.01);
    this._cloudOffset.y += U.uWindDir.value.y * dt * (0.004 + w.wind * 0.01);
    this.uniforms.uCloudOffset.value.copy(this._cloudOffset);
    // lightning during heavy rain in the dread phase
    this._lightning = Math.max(0, this._lightning - dt * 3.5);
    if (this.lightning && w.rain > 0.6 && this.hour < 24.5) {
      this._lightningT -= dt;
      if (this._lightningT <= 0) {
        this._lightningT = 9 + Math.random() * 25;
        if (Math.random() < 0.6) this.flash(0.35 + Math.random() * 0.5);
      }
    }
    this._evaluate();
    this._applyLights();
    // follow the camera
    if (camera) {
      this.dome.position.copy(camera.position);
      // height fog base hugs the ground below the camera (valleys still fill up)
      const groundGuess = camera.position.y - 1.6;
      const target = lerp(this.fogBaseY, groundGuess, this.fogFollow);
      U.uFogHeight.value = damp(U.uFogHeight.value, target, 0.6, dt);
      const focus = this._hasFocus ? this.shadowFocus : camera.position;
      this.sun.target.position.copy(focus);
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 120);
      this.moon.target.position.copy(focus);
      this.moon.position.copy(focus).addScaledVector(this.moonDir, 120);
      // texel snapping to avoid shadow shimmer
      if (this.sun.shadow.autoUpdate) {
        const texel = 76 / this.sun.shadow.mapSize.x;
        _v.copy(focus);
        _v.x = Math.round(_v.x / texel) * texel;
        _v.z = Math.round(_v.z / texel) * texel;
        this.sun.target.position.copy(_v);
        this.sun.position.copy(_v).addScaledVector(this.sunDir, 120);
      }
    }
  }
}

export const sky = new Sky();
