// World-specific materials: painted asphalt road (patches, cracks, potholes, puddles,
// worn markings, crumbling edges, leaf litter), corridor terrain blend and creek water.
// All start from render's paintedMaterial and chain a world patch on top.
import * as THREE from 'three';
import { paintedMaterial, GLOBAL_UNIFORMS } from '../render/index.js';
import { tex } from '../textures/index.js';
import { chainPatch, inject, worldNoiseTexture, GLSL_HASH } from './shaderUtil.js';
import { W } from './constants.js';

const U = GLOBAL_UNIFORMS;

function texOr(key, fallback = null, opts) {
  try {
    return tex(key, opts) || fallback;
  } catch (e) {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// ROAD
// ---------------------------------------------------------------------------
const ROAD_VERT_DECL = /* glsl */ `
attribute vec4 aRoad;
varying vec2 vRoadUv;
varying vec4 vRoadA;
varying vec3 vRoadGeoN;
`;
const ROAD_FRAG_DECL = /* glsl */ `
uniform sampler2D wNoiseTex;
uniform sampler2D wPuddleTex;
uniform float wTime;
uniform float wWetness;
uniform float wRain;
uniform float wHalfW;
uniform vec3 wFogColor;
varying vec2 vRoadUv;
varying vec4 vRoadA;
varying vec3 vRoadGeoN;
float wRoadPuddle = 0.0;
float wRoadMark = 0.0;
float wRoadPatch = 0.0;
float wRoadPot = 0.0;
float wRoadLeaf = 0.0;
${GLSL_HASH}
`;

const ROAD_ALBEDO = /* glsl */ `
{
  float lat = vRoadUv.x;
  float s = vRoadUv.y;
  float aLat = abs(lat);
  float hw = wHalfW;
  vec4 nA = texture2D(wNoiseTex, vec2(lat * 0.031 + 0.17, s * 0.0071));
  vec4 nB = texture2D(wNoiseTex, vec2(lat * 0.19 + 0.5, s * 0.047));
  vec4 nC = texture2D(wNoiseTex, vec2(lat * 0.83, s * 0.29));
  vec3 col = diffuseColor.rgb;

  // ---- crumbling edge: the slab breaks away irregularly, revealing the shoulder
  float edgeN = nC.g * 0.65 + nB.r * 0.55 + nA.b * 0.3;
  float erode = 0.06 + 0.62 * pow(clamp(edgeN - 0.25, 0.0, 1.0), 1.6);
  if (aLat > hw - erode) discard;

  // ---- tonal variation, worn aggregate, oily centre stripe
  float tone = (nA.r - 0.5) * 0.38 + (nB.g - 0.5) * 0.22 + (nC.a - 0.5) * 0.1;
  col *= 1.0 + tone;
  float rut = exp(-pow((lat + 2.3) / 0.38, 2.0)) + exp(-pow((lat + 0.8) / 0.38, 2.0))
            + exp(-pow((lat - 0.8) / 0.38, 2.0)) + exp(-pow((lat - 2.3) / 0.38, 2.0));
  col *= 1.0 - rut * 0.1;
  col = mix(col, col * 0.78, exp(-pow((lat + 1.55) / 0.3, 2.0)) * 0.6); // oil drip line in the lane
  col = mix(col, col * 0.78, exp(-pow((lat - 1.55) / 0.3, 2.0)) * 0.6);

  // ---- repair patches (darker newer tar or greyer old concrete fills)
  {
    float cs = floor(s / 8.5);
    vec2 h = wHash22(vec2(cs, 17.0));
    if (h.x < 0.42) {
      float l0 = mix(-hw + 0.1, 1.0, wHash12(vec2(cs, 5.3)));
      float l1 = min(hw, l0 + mix(0.9, 3.6, wHash12(vec2(cs, 6.1))));
      float s0 = cs * 8.5 + 0.4 + h.y * 2.5;
      float s1 = s0 + mix(1.2, 5.4, wHash12(vec2(cs, 9.7)));
      float jag = (nC.b - 0.5) * 0.22;
      float dE = min(min(lat + jag - l0, l1 - lat - jag), min(s + jag - s0, s1 - s - jag));
      float inside = smoothstep(-0.02, 0.02, dE);
      float seam = 1.0 - smoothstep(0.0, 0.06, abs(dE));
      bool tar = wHash12(vec2(cs, 2.2)) < 0.65;
      vec3 pc = tar ? col * 0.62 + vec3(0.004) : col * 1.22 + vec3(0.018, 0.017, 0.015);
      col = mix(col, pc, inside);
      col = mix(col, vec3(0.012, 0.011, 0.01), seam * 0.75);
      wRoadPatch = inside * (tar ? 1.0 : 0.4);
    }
  }

  // ---- cracks: meandering contour cracks + alligator cracking in the wheel paths and near edges
  float crackiness = 0.35 + 0.65 * smoothstep(hw - 1.6, hw - 0.3, aLat) + rut * 0.5 + (nA.g - 0.5) * 0.8;
  float c1 = 1.0 - smoothstep(0.0, 0.018, abs(nB.b - 0.5));
  float c2 = 1.0 - smoothstep(0.0, 0.03, abs(nC.a - 0.5));
  float c3 = 1.0 - smoothstep(0.0, 0.012, abs(texture2D(wNoiseTex, vec2(lat * 0.11, s * 0.019)).a - 0.5)); // long cracks
  float crack = max(c1 * step(0.45, crackiness), max(c2 * step(0.85, crackiness), c3));
  crack *= 1.0 - wRoadPatch * 0.7;
  float edgeMoss = smoothstep(hw - 1.2, hw - 0.2, aLat);
  vec3 crackCol = mix(vec3(0.008, 0.008, 0.007), vec3(0.03, 0.045, 0.015), edgeMoss * nB.r);
  col = mix(col, crackCol, crack * 0.85);

  // ---- potholes
  {
    float cs = floor(s / 12.0);
    vec2 h = wHash22(vec2(cs, 41.0));
    if (h.x < 0.36) {
      vec2 c = vec2(mix(-hw + 0.55, hw - 0.55, wHash12(vec2(cs, 43.0))), cs * 12.0 + 1.5 + h.y * 9.0);
      float r = mix(0.2, 0.62, wHash12(vec2(cs, 47.0)));
      vec2 d = vec2(lat, s) - c;
      d.y *= 0.75;
      float ang = atan(d.y, d.x);
      float wob = texture2D(wNoiseTex, vec2(ang * 0.159 + c.y * 0.013, c.x * 0.07)).g - 0.5;
      float rr = r * (1.0 + wob * 0.6);
      float dist = length(d);
      wRoadPot = 1.0 - smoothstep(rr - 0.03, rr + 0.015, dist);
      float rim = smoothstep(rr - 0.12, rr, dist) * (1.0 - smoothstep(rr, rr + 0.22, dist));
      col *= 1.0 - rim * 0.32;
      col = mix(col, vec3(0.02, 0.018, 0.016) + nC.r * 0.025, wRoadPot);
    }
  }

  // ---- worn markings: dashed white centre (solid double yellow on curves), white edge lines
  {
    float k = abs(vRoadA.x) * 0.01;
    float yellow = smoothstep(1.0 / 330.0, 1.0 / 210.0, k);
    float fade = vRoadA.y;
    float wear = smoothstep(0.2, 0.8, nC.r * 0.7 + nB.r * 0.6 - 0.05);
    float dashOn = step(fract(s / 9.0), 0.36);
    float cW = (1.0 - smoothstep(0.05, 0.068, aLat)) * dashOn;
    float cY = 1.0 - smoothstep(0.042, 0.06, abs(aLat - 0.1));
    float eOff = vRoadA.w;
    float leftOn = 1.0 - step(0.5, mod(eOff + 0.01, 2.0));
    float rightOn = 1.0 - step(1.5, eOff + 0.01);
    float edgeL = (1.0 - smoothstep(0.045, 0.065, abs(aLat - (hw - 0.32)))) * (lat < 0.0 ? leftOn : rightOn);
    float markW = cW * (1.0 - yellow) * fade + edgeL * smoothstep(0.0, 0.3, fade + 0.25);
    float markY = cY * yellow * fade;
    wRoadMark = max(markW, markY) * mix(0.18, 0.88, wear) * (1.0 - wRoadPot) * (1.0 - wRoadPatch * 0.85) * (1.0 - crack * 0.8);
    vec3 markCol = markY > markW ? vec3(0.55, 0.38, 0.09) : vec3(0.5, 0.5, 0.46);
    col = mix(col, markCol * (0.8 + nC.b * 0.3), wRoadMark);
  }

  // ---- dirt, mud and moss creeping in from the edges
  float edgeDirt = smoothstep(hw - 0.75 - edgeN * 0.55, hw - 0.05, aLat);
  col = mix(col, vec3(0.045, 0.038, 0.026) * (0.8 + nB.g * 0.5), edgeDirt * 0.62);
  col = mix(col, vec3(0.035, 0.05, 0.02), edgeDirt * edgeMoss * smoothstep(0.55, 0.8, nA.a + nB.r * 0.3) * 0.7);

  // ---- fallen leaves and twigs (two jittered layers), denser near the edges
  {
    float dens0 = mix(0.07, 0.6, smoothstep(hw - 1.8, hw - 0.2, aLat)) * (0.35 + 1.1 * nA.g);
    for (int L = 0; L < 2; L++) {
      float sc = L == 0 ? 2.2 : 3.4;
      vec2 gp = vec2(lat, s) * sc + float(L) * 7.31;
      vec2 cell = floor(gp);
      vec2 f = fract(gp) - 0.5;
      vec2 h = wHash22(cell + 13.0 + float(L) * 3.0);
      if (h.x < dens0 * (L == 0 ? 0.7 : 1.0)) {
        float a = h.y * 6.2832;
        vec2 o = (wHash22(cell + 71.0) - 0.5) * 0.3;
        vec2 q = f - o;
        q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
        float len = mix(0.2, 0.36, wHash12(cell + 5.0));
        vec2 qq = q / vec2(len * 0.36, len);
        float tip = 1.0 - 0.35 * clamp(qq.y, 0.0, 1.0);
        float d = length(vec2(qq.x / tip, qq.y));
        float m = 1.0 - smoothstep(0.82, 1.0, d);
        float hc = wHash12(cell + 29.0);
        vec3 lc = hc < 0.45 ? vec3(0.16, 0.085, 0.03) : hc < 0.75 ? vec3(0.25, 0.17, 0.05) : hc < 0.9 ? vec3(0.06, 0.08, 0.025) : vec3(0.1, 0.05, 0.03);
        lc *= 0.75 + 0.5 * wHash12(cell + 3.0);
        lc *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.05, abs(q.x))); // midrib
        col = mix(col, lc, m * 0.92);
        wRoadLeaf = max(wRoadLeaf, m);
      }
    }
  }

  // ---- puddles: in ruts, at the crowned edges and in potholes
  {
    float pm = texture2D(wPuddleTex, vec2(lat * 0.105 + 0.31, s * 0.043)).r;
    float pm2 = texture2D(wPuddleTex, vec2(lat * 0.071 + 0.62, s * 0.021 + 0.5)).r;
    float prof = 0.42 + 0.5 * smoothstep(hw - 1.5, hw - 0.4, aLat) + 0.28 * rut;
    float pv = max(pm, pm2 * 0.92) * prof + wRoadPot * 0.95;
    float thr = mix(0.86, 0.5, clamp(wWetness, 0.0, 1.0));
    wRoadPuddle = smoothstep(thr, thr + 0.05, pv) * step(0.03, wWetness) * (1.0 - wRoadLeaf * 0.6);
    col = mix(col, col * 0.22 + vec3(0.002, 0.003, 0.004), wRoadPuddle);
  }
  diffuseColor.rgb = col;
}
`;

const ROAD_ROUGH = /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.5, wRoadPatch * 0.6);
roughnessFactor = mix(roughnessFactor, 0.6, wRoadMark);
roughnessFactor = mix(roughnessFactor, 0.85, wRoadLeaf);
roughnessFactor *= 1.0 - clamp(wWetness, 0.0, 1.0) * 0.3;
roughnessFactor = mix(roughnessFactor, 0.03, wRoadPuddle);
`;

const ROAD_NORMAL = /* glsl */ `
normal = normalize(mix(normal, normalize(vRoadGeoN), wRoadPuddle));
`;

const ROAD_EMISSIVE = /* glsl */ `
{
  // wet sheen: puddles mirror the fog / sky glow at grazing angles
  vec3 vdir = normalize(vViewPosition);
  float fres = pow(1.0 - clamp(dot(normal, vdir), 0.0, 1.0), 5.0);
  totalEmissiveRadiance += wFogColor * fres * (wRoadPuddle * 0.55 + 0.08 * clamp(wWetness, 0.0, 1.0));
}
`;

export function createRoadMaterial(priority = 0) {
  const map = texOr('asphalt', null, { repeat: [1 / 3.2, 1 / 3.2] });
  const normalMap = texOr('asphalt_normal', null, { repeat: [1 / 3.2, 1 / 3.2] });
  const m = paintedMaterial({
    name: 'road',
    color: 0xffffff,
    map,
    normalMap,
    roughness: 0.82,
    brush: 0.35,
    wet: 0.8,
    puddles: 0,
    moss: 0,
    dirt: 0,
  });
  if (m.normalScale) m.normalScale.set(0.9, 0.9);
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1 - (3 - priority) * 0.5;
  m.polygonOffsetUnits = -4 - (3 - priority) * 3;
  const puddle = texOr('puddle_mask', worldNoiseTexture());
  chainPatch(m, 'worldRoad', (shader) => {
    shader.uniforms.wNoiseTex = { value: worldNoiseTexture() };
    shader.uniforms.wPuddleTex = { value: puddle };
    shader.uniforms.wTime = U.uTime;
    shader.uniforms.wWetness = U.uWetness;
    shader.uniforms.wRain = U.uRain;
    shader.uniforms.wFogColor = U.uFogColor;
    shader.uniforms.wHalfW = { value: W.halfWidth };
    let v = shader.vertexShader;
    v = inject(v, '#include <common>', ROAD_VERT_DECL);
    v = inject(v, ['#include <uv_vertex>', '#include <begin_vertex>'], 'vRoadUv = uv; vRoadA = aRoad;');
    v = inject(v, '#include <defaultnormal_vertex>', 'vRoadGeoN = normalize(transformedNormal);');
    shader.vertexShader = v;
    let f = shader.fragmentShader;
    f = inject(f, '#include <common>', ROAD_FRAG_DECL);
    f = inject(f, ['#include <map_fragment>', '#include <color_fragment>'], ROAD_ALBEDO);
    f = inject(f, '#include <roughnessmap_fragment>', ROAD_ROUGH);
    f = inject(f, '#include <normal_fragment_maps>', ROAD_NORMAL);
    f = inject(f, '#include <emissivemap_fragment>', ROAD_EMISSIVE);
    shader.fragmentShader = f;
  });
  return m;
}

// ---------------------------------------------------------------------------
// TERRAIN
// ---------------------------------------------------------------------------
const TER_VERT_DECL = /* glsl */ `
attribute vec4 aTerrain;
varying vec4 vTer;
varying vec3 vTerW;
varying vec3 vTerN;
`;
const TER_FRAG_DECL = /* glsl */ `
uniform sampler2D wNoiseTex;
uniform sampler2D tSoil;
uniform sampler2D tLitter;
uniform sampler2D tMoss;
uniform sampler2D tGravel;
uniform sampler2D tRock;
uniform float wWetness;
varying vec4 vTer;
varying vec3 vTerW;
varying vec3 vTerN;
float wTerWet = 0.0;
float wTerRock = 0.0;
float wTerGravel = 0.0;
`;
const TER_ALBEDO = /* glsl */ `
{
  vec3 wp = vTerW;
  vec3 n = normalize(vTerN);
  float e = vTer.x * 30.0;
  float pad = vTer.y;
  float wet = vTer.z;
  vec4 nz = texture2D(wNoiseTex, wp.xz * 0.011);
  vec4 nz2 = texture2D(wNoiseTex, wp.xz * 0.06 + 0.3);
  vec3 soil = texture2D(tSoil, wp.xz * 0.31).rgb;
  vec3 litter = texture2D(tLitter, wp.xz * 0.27 + vec2(0.13, 0.71)).rgb;
  vec3 moss = texture2D(tMoss, wp.xz * 0.19).rgb;
  vec3 gravel = texture2D(tGravel, wp.xz * 0.42).rgb;
  vec3 bw = pow(abs(n), vec3(4.0));
  bw /= (bw.x + bw.y + bw.z);
  vec3 rock = texture2D(tRock, wp.zy * 0.15).rgb * bw.x + texture2D(tRock, wp.xz * 0.15).rgb * bw.y + texture2D(tRock, wp.xy * 0.15).rgb * bw.z;
  float slope = 1.0 - n.y;
  vec3 col = mix(soil, litter, smoothstep(0.3, 0.62, nz.g * 0.8 + nz2.r * 0.35 + smoothstep(1.5, 7.0, e) * 0.25));
  col = mix(col, moss, smoothstep(0.58, 0.82, nz2.b * 0.7 + nz.r * 0.45) * 0.85);
  // shoulder: compacted gravel and mud, ragged boundary into the litter
  float sh = 1.0 - smoothstep(0.7, 1.7, e + (nz2.r - 0.5) * 1.1 + (nz2.a - 0.5) * 0.5);
  wTerGravel = sh;
  vec3 mud = mix(soil * 0.7, vec3(0.05, 0.04, 0.03), 0.4);
  col = mix(col, mix(gravel, mud, smoothstep(0.4, 0.8, nz2.g) * 0.6), sh);
  // rock on cuttings / steep banks
  float rockM = smoothstep(0.42, 0.62, slope + (nz2.g - 0.5) * 0.3);
  wTerRock = rockM;
  col = mix(col, rock * mix(vec3(1.0), vec3(0.82, 0.82, 0.78), smoothstep(0.5, 0.8, nz.b)), rockM);
  // pads under set pieces
  col = mix(col, mix(gravel, soil * 0.8, 0.3), clamp(pad * 1.5, 0.0, 1.0));
  // wet ground near water and in ditches
  wTerWet = wet;
  col *= mix(1.0, 0.5, wet);
  diffuseColor.rgb = col;
}
`;
const TER_ROUGH = /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.96, wTerGravel * 0.6);
roughnessFactor = mix(roughnessFactor, 0.78, wTerRock);
roughnessFactor = mix(roughnessFactor, 0.25, wTerWet * 0.8);
`;

export function createTerrainMaterial() {
  const m = paintedMaterial({ name: 'terrain', color: 0xffffff, roughness: 0.93, brush: 0.55, wet: 0.45, puddles: 0.25, moss: 0 });
  const white = worldNoiseTexture();
  const t = {
    tSoil: texOr('soil', white),
    tLitter: texOr('leaf_litter', texOr('soil', white)),
    tMoss: texOr('moss', white),
    tGravel: texOr('gravel', texOr('soil', white)),
    tRock: texOr('rock', white),
  };
  chainPatch(m, 'worldTerrain', (shader) => {
    shader.uniforms.wNoiseTex = { value: worldNoiseTexture() };
    for (const [k, v] of Object.entries(t)) shader.uniforms[k] = { value: v };
    shader.uniforms.wWetness = U.uWetness;
    let v = shader.vertexShader;
    v = inject(v, '#include <common>', TER_VERT_DECL);
    v = inject(v, '#include <begin_vertex>', 'vTer = aTerrain; vTerW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTerN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.vertexShader = v;
    let f = shader.fragmentShader;
    f = inject(f, '#include <common>', TER_FRAG_DECL);
    f = inject(f, ['#include <map_fragment>', '#include <color_fragment>'], TER_ALBEDO);
    f = inject(f, '#include <roughnessmap_fragment>', TER_ROUGH);
    shader.fragmentShader = f;
  });
  return m;
}

// ---------------------------------------------------------------------------
// WATER (creek / pond): dark, glossy, slowly flowing ripples
// ---------------------------------------------------------------------------
export function createWaterMaterial() {
  const nrm = texOr('water_ripple', null, { repeat: [0.35, 0.18] });
  const m = paintedMaterial({ name: 'water', color: 0x0b0e10, roughness: 0.06, metalness: 0.0, normalMap: nrm, brush: 0.15, wet: 1, puddles: 0 });
  if (m.normalScale) m.normalScale.set(0.35, 0.35);
  chainPatch(m, 'worldWater', (shader) => {
    shader.uniforms.wFogColor = U.uFogColor;
    let f = shader.fragmentShader;
    f = inject(f, '#include <common>', 'uniform vec3 wFogColor;');
    f = inject(
      f,
      '#include <emissivemap_fragment>',
      `{ vec3 vdir = normalize(vViewPosition); float fres = pow(1.0 - clamp(dot(normal, vdir), 0.0, 1.0), 4.0); totalEmissiveRadiance += wFogColor * (0.08 + fres * 0.9); }`,
    );
    shader.fragmentShader = f;
  });
  m.userData.flow = nrm;
  return m;
}
