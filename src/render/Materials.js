// Material factory: MeshStandardMaterial patched (onBeforeCompile) with
//  * world-space brush-stroke modulation of albedo + roughness (internal brush texture)
//  * optional triplanar albedo / detail (opts.triplanar = texture key from src/textures)
//  * wetness (global uWetness * opts.wet): darker albedo, glossier, puddles with rain
//    ripples on up-facing surfaces
//  * moss on up-facing surfaces, dirt creeping up from the bottom
//  * wind vertex animation: trunk | branch | leaf | grass | vine | cloth
//    (Mesh, InstancedMesh (per-instance phase), SkinnedMesh, BatchedMesh)
//  * foliage translucency (back-lit glow), skin wrap lighting / fake SSS, ghost pallor
import * as THREE from 'three';
import { brushTexture, neutralTexture, glowTexture } from './noiseTex.js';

const WIND_MODES = { none: 0, trunk: 1, branch: 2, leaf: 3, grass: 4, vine: 5, cloth: 6 };

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------
const WIND_GLSL = /* glsl */ `
uniform vec4 dlbPaint2; // x windStrength, y translucency, z triplanarScale, w pale
uniform vec4 dlbWindParams; // x height scale (1/m), y flutter, z phase offset, w unused
vec3 dlbWindDisplace(vec3 wp, vec3 origin, vec3 nW, float h) {
  float ws = dlbWindStrength * dlbPaint2.x;
  if (ws <= 0.0) return vec3(0.0);
  vec3 wd = vec3(dlbWindDir.x, 0.0, dlbWindDir.y);
  vec3 side = vec3(-wd.z, 0.0, wd.x);
  float t = dlbTime;
  float ph = dot(origin.xz, vec2(0.371, 0.713)) + dlbWindParams.z;
  // travelling gust field (world space, moves downwind)
  float gx = dot(origin.xz, wd.xz) * 0.045 - t * 0.55;
  float gust = 0.55 + 0.45 * sin(gx * 6.283) * sin(gx * 2.71 + dot(origin.xz, side.xz) * 0.03 + 1.3);
  gust = mix(0.6, gust, 0.85);
  vec3 d = vec3(0.0);
  float hs = h * dlbWindParams.x;
#if DLB_WIND == 1
  // trunk: whole tree sways slowly, quadratic with height
  float k = hs * hs * 0.0011;
  d = wd * (0.55 + 0.45 * sin(t * 0.55 + ph)) * k * gust + side * sin(t * 0.43 + ph * 1.7) * k * 0.35;
#elif DLB_WIND == 2
  float k = hs * hs * 0.0011 + max(hs, 0.0) * 0.004;
  d = wd * (0.5 + 0.5 * sin(t * 0.7 + ph)) * k * gust + side * sin(t * 0.9 + ph * 1.3) * k * 0.4;
  d += nW * sin(t * 2.3 + dot(wp, vec3(0.7, 0.9, 0.6))) * 0.012 * gust;
#elif DLB_WIND == 3
  // leaf: tree sway + per-leaf flutter along the normal
  float k = hs * hs * 0.0009 + max(hs, 0.0) * 0.003;
  d = wd * (0.5 + 0.5 * sin(t * 0.6 + ph)) * k * gust + side * sin(t * 0.8 + ph * 1.3) * k * 0.4;
  float fl = sin(t * (5.5 + 2.0 * gust) + dot(wp, vec3(2.3, 1.9, 2.7))) * sin(t * 3.1 + dot(wp, vec3(-1.1, 2.3, 0.9)));
  d += nW * fl * 0.035 * dlbWindParams.y * (0.35 + gust);
  d.y += sin(t * 1.7 + dot(wp, vec3(1.3, 0.0, 1.7))) * 0.015 * gust;
#elif DLB_WIND == 4
  // grass: bend downwind, travelling waves sweep across fields
  float k = clamp(hs, 0.0, 2.5);
  k = k * k;
  float wave = 0.5 + 0.5 * sin(dot(wp.xz, wd.xz) * 0.55 - t * 2.1 + sin(dot(wp.xz, side.xz) * 0.3));
  vec3 bend = wd * (0.18 + 0.32 * wave * gust) + side * sin(t * 1.9 + ph + wp.x * 0.7) * 0.07;
  d = bend * k * 0.6;
  d.y -= dot(d, d) * 0.6;
#elif DLB_WIND == 5
  // vine: hanging from the pivot, pendulum swing grows downward
  float k = max(-hs, 0.0);
  d = (wd * (0.45 + 0.55 * sin(t * 0.9 + ph)) * gust + side * sin(t * 0.67 + ph * 2.1) * 0.6) * k * k * 0.03;
  d += nW * sin(t * 3.7 + k * 2.0 + ph) * 0.02 * k;
#elif DLB_WIND == 6
  // cloth: hanging + flapping ripples
  float k = clamp(abs(hs), 0.0, 3.0);
  float rip = sin(t * 6.0 + dot(wp, vec3(3.1, 2.3, 2.9)) - k * 4.0) + 0.5 * sin(t * 9.3 + dot(wp, vec3(-2.3, 4.1, 1.7)));
  d = wd * (0.4 + 0.6 * gust) * k * 0.09 + nW * rip * 0.03 * k * (0.3 + gust);
#endif
  return d * ws;
}
`;

const VERT_COMMON = /* glsl */ `
#include <dlb_common>
#include <dlb_globals>
#ifndef DLB_DEPTH
varying vec3 vDlbWP;
varying vec3 vDlbWN;
varying float vDlbH;
#endif
${WIND_GLSL}
`;

const VERT_PROJECT = /* glsl */ `
{
  mat4 dlbM = modelMatrix;
  #ifdef USE_BATCHING
    dlbM = dlbM * batchingMatrix;
  #endif
  #ifdef USE_INSTANCING
    dlbM = dlbM * instanceMatrix;
  #endif
  mat3 dlbM3 = mat3(dlbM);
  vec3 dlbOrigin = dlbM[3].xyz;
  vec3 dlbWP0 = (dlbM * vec4(transformed, 1.0)).xyz;
  #ifdef DLB_DEPTH
    vec3 dlbNObj = vec3(normal);
  #else
    vec3 dlbNObj = objectNormal;
  #endif
  vec3 dlbNW = normalize(dlbM3 * dlbNObj);
  float dlbHeight = dlbWP0.y - dlbOrigin.y;
  #if DLB_WIND > 0
    vec3 dlbDisp = dlbWindDisplace(dlbWP0, dlbOrigin, dlbNW, dlbHeight);
    float dlbS2 = max(dot(dlbM3[0], dlbM3[0]), 1e-8);
    transformed += (dlbDisp * dlbM3) / dlbS2;
    dlbWP0 += dlbDisp;
  #endif
  #ifndef DLB_DEPTH
    vDlbWP = dlbWP0;
    vDlbWN = dlbNW;
    vDlbH = dlbHeight;
  #endif
}
#include <project_vertex>
`;

const FRAG_COMMON = /* glsl */ `
#include <dlb_common>
#include <dlb_globals>
varying vec3 vDlbWP;
varying vec3 vDlbWN;
varying float vDlbH;
uniform sampler2D dlbBrushTex;
uniform vec4 dlbPaint;  // x brush, y wet, z moss, w dirt
uniform vec4 dlbPaint2; // x windStrength, y translucency, z triplanarScale, w pale
uniform vec4 dlbPaint3; // x skin sss, y dirtHeight, z puddles, w emissive rim
uniform vec3 dlbMossColor;
uniform vec3 dlbDirtColor;
#ifdef DLB_TRIPLANAR
uniform sampler2D dlbTriTex;
#endif
vec3 dlbTriW(vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  return w / max(w.x + w.y + w.z, 1e-4);
}
vec4 dlbTri(sampler2D tex, vec3 p, vec3 w) {
  return texture2D(tex, p.zy) * w.x + texture2D(tex, p.xz) * w.y + texture2D(tex, p.xy) * w.z;
}
vec2 dlbRipples(vec2 p, float t) {
  vec2 acc = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    vec2 q = p * 2.6 + float(k) * vec2(0.37, 0.71);
    vec2 ci = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = dlbHash12(ci + float(k) * 17.3);
    vec2 off = (vec2(dlbHash12(ci + 3.1), dlbHash12(ci + 7.7)) - 0.5) * 0.5;
    vec2 dd = f - off;
    float r = length(dd);
    float ph = fract(t * (0.8 + h * 0.6) + h * 7.0);
    float rr = ph * 0.48;
    float ring = exp(-pow((r - rr) * 26.0, 2.0)) * (1.0 - ph) * (1.0 - ph);
    acc += dd / max(r, 1e-3) * ring * sin((r - rr) * 60.0);
  }
  return acc;
}
`;

const FRAG_ALBEDO = /* glsl */ `
  vec3 dlbN = normalize(vDlbWN) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 dlbW = dlbTriW(dlbN);
  float dlbUp = clamp(dlbN.y, 0.0, 1.0);
  // brush strokes (~2.6 m tile) + large painterly blotches (~15 m tile)
  vec4 dlbB = dlbTri(dlbBrushTex, vDlbWP * 0.38, dlbW);
  vec4 dlbB2 = dlbTri(dlbBrushTex, vDlbWP * 0.067 + 0.31, dlbW);
  float dlbBrushAmt = dlbPaint.x;
  #ifdef DLB_TRIPLANAR
  {
    vec4 dlbT = dlbTri(dlbTriTex, vDlbWP * dlbPaint2.z, dlbW);
    #ifdef USE_MAP
      // detail overlay (keeps the UV map's colour, adds world-space detail; mean-normalised)
      vec3 dlbAvg = max(textureLod(dlbTriTex, vec2(0.5), 12.0).rgb, vec3(0.02));
      diffuseColor.rgb *= mix(vec3(1.0), clamp(dlbT.rgb / dlbAvg, 0.0, 3.0), 0.6);
    #else
      diffuseColor.rgb *= dlbT.rgb;
    #endif
  }
  #endif
  {
    float v = (dlbB.r - 0.5) * 0.42 + (dlbB2.g - 0.5) * 0.55 + (dlbB.b - 0.5) * 0.12;
    vec3 c = diffuseColor.rgb;
    c *= 1.0 + v * dlbBrushAmt;
    // painterly hue drift: warm / cool variation in the blotches
    float hue = (dlbB2.r - 0.5) * dlbBrushAmt;
    c *= vec3(1.0 + hue * 0.16, 1.0 + hue * 0.03, 1.0 - hue * 0.14);
    diffuseColor.rgb = max(c, vec3(0.0));
  }
  // dirt creeping up from the bottom of objects
  float dlbDirt = 0.0;
  if (dlbPaint.w > 0.0) {
    float edge = dlbPaint3.y * (0.55 + dlbB2.g * 0.9) + (dlbB.r - 0.5) * 0.15;
    dlbDirt = dlbPaint.w * (1.0 - smoothstep(0.0, max(edge, 0.05), vDlbH)) * (1.0 - dlbUp * 0.4);
    diffuseColor.rgb = mix(diffuseColor.rgb, dlbDirtColor * (0.75 + dlbB.r * 0.5), clamp(dlbDirt, 0.0, 1.0));
  }
  // moss on up-facing surfaces (and in damp blotches)
  float dlbMoss = 0.0;
  if (dlbPaint.z > 0.0) {
    float m = smoothstep(0.25, 0.85, dlbUp + (dlbB2.g - 0.5) * 0.9 + (dlbB.r - 0.5) * 0.35);
    m *= smoothstep(0.25, 0.6, dlbB2.a + dlbPaint.z * 0.35);
    dlbMoss = clamp(m * dlbPaint.z * 1.4, 0.0, 1.0);
    vec3 mc = dlbMossColor * (0.65 + dlbB.r * 0.7) * mix(vec3(1.0), vec3(1.12, 1.05, 0.7), dlbB2.b);
    diffuseColor.rgb = mix(diffuseColor.rgb, mc, dlbMoss);
  }
  // wetness: darker porous albedo, puddles on flat up-facing areas
  float dlbWet = clamp(dlbWetness * dlbPaint.y, 0.0, 1.0);
  float dlbPuddle = 0.0;
  if (dlbWet > 0.0) {
    float porous = 1.0 - metalness * 0.8;
    diffuseColor.rgb *= mix(1.0, 0.58, dlbWet * porous * (0.6 + 0.4 * dlbUp));
    float pm = dlbTri(dlbBrushTex, vDlbWP * 0.11 + 0.73, dlbW).a;
    dlbPuddle = smoothstep(0.62, 0.74, pm + dlbWet * 0.28 - 0.06 + (dlbB.b - 0.5) * 0.05) * smoothstep(0.86, 0.97, dlbUp) * dlbWet * dlbPaint3.z;
    diffuseColor.rgb *= 1.0 - dlbPuddle * 0.55;
  }
  #ifdef DLB_PALE
  {
    float l = dlbLuma(diffuseColor.rgb);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l) * vec3(0.86, 0.95, 1.0) * 1.35 + vec3(0.02, 0.025, 0.03), dlbPaint2.w);
  }
  #endif
`;

const FRAG_ROUGHNESS = /* glsl */ `
  roughnessFactor = clamp(roughnessFactor * (1.0 + (dlbB.r - 0.5) * 0.45 * dlbBrushAmt) , 0.03, 1.0);
  roughnessFactor = mix(roughnessFactor, 1.0, dlbDirt * 0.6);
  roughnessFactor = mix(roughnessFactor, 0.95, dlbMoss * 0.7);
  roughnessFactor = mix(roughnessFactor, max(roughnessFactor * 0.38, 0.12), dlbWet * 0.85);
  roughnessFactor = mix(roughnessFactor, 0.035, dlbPuddle);
`;

const FRAG_NORMAL = /* glsl */ `
  if (dlbPuddle > 0.001) {
    vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    vec3 pn = upV;
    if (dlbRain > 0.01) {
      vec2 rp = dlbRipples(vDlbWP.xz, dlbTime) * dlbRain * 0.35;
      vec3 rpW = normalize(vec3(rp.x, 1.0, rp.y));
      pn = normalize((viewMatrix * vec4(rpW, 0.0)).xyz);
    }
    normal = normalize(mix(normal, pn, smoothstep(0.0, 0.6, dlbPuddle)));
  }
`;

const FRAG_EMISSIVE = /* glsl */ `
  #ifdef DLB_PALE
  {
    float rim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
    totalEmissiveRadiance += dlbPaint2.w * (rim * 0.06 + 0.008) * vec3(0.55, 0.7, 0.75) * (1.0 + dlbPaint3.w);
  }
  #endif
`;

const FRAG_TRANSLUCENT_END = /* glsl */ `
  #ifdef DLB_TRANSLUCENT
    reflectedLight.directDiffuse += dlbTransAcc * diffuseColor.rgb * vec3(1.05, 1.18, 0.5) * dlbPaint2.y * 0.6;
  #endif
`;

const LIGHTS_PHYSICAL = (() => {
  const src = THREE.ShaderChunk.lights_physical_pars_fragment;
  const a = 'vec3 irradiance = dotNL * directLight.color;';
  const b = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';
  if (!src.includes(a) || !src.includes(b)) {
    console.warn('[render] lights_physical_pars_fragment changed; skin/translucency disabled');
    return src;
  }
  return (
    /* glsl */ `
#ifdef DLB_TRANSLUCENT
vec3 dlbTransAcc = vec3(0.0);
#endif
` +
    src
      .replace(
        a,
        /* glsl */ `vec3 irradiance = dotNL * directLight.color;
  vec3 dlbDiffIrr = irradiance;
  #ifdef DLB_SKIN
  {
    float nl = dot( geometryNormal, directLight.direction );
    float wrapL = saturate( ( nl + 0.6 ) / 1.6 );
    vec3 sssCol = vec3( 1.0, 0.38, 0.26 );
    dlbDiffIrr = directLight.color * ( dotNL + sssCol * max( wrapL * wrapL - dotNL, 0.0 ) * dlbPaint3.x );
  }
  #endif
  #ifdef DLB_TRANSLUCENT
  {
    float nl = dot( geometryNormal, directLight.direction );
    float back = saturate( -nl );
    float fwd = pow( saturate( dot( geometryViewDir, -directLight.direction ) ), 5.0 );
    dlbTransAcc += directLight.color * ( back * 0.6 + fwd * 1.4 );
    dlbDiffIrr = directLight.color * saturate( ( nl + 0.25 ) / 1.25 );
  }
  #endif`,
      )
      .replace(b, 'reflectedLight.directDiffuse += dlbDiffIrr * BRDF_Lambert( material.diffuseColor );')
  );
})();

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
let _triTexCache = new Map();
let _texModule = null;
let _texModulePromise = null;
function triplanarTexture(key, uniform) {
  if (_triTexCache.has(key)) {
    uniform.value = _triTexCache.get(key);
    return;
  }
  uniform.value = neutralTexture();
  const apply = (mod) => {
    try {
      const t = mod.tex(key);
      if (t) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        _triTexCache.set(key, t);
        uniform.value = t;
      }
    } catch (e) {
      console.warn('[render] triplanar texture failed', key, e);
    }
  };
  if (_texModule) return apply(_texModule);
  if (!_texModulePromise) _texModulePromise = import('../textures/index.js').then((m) => (_texModule = m));
  _texModulePromise.then(apply).catch((e) => console.warn('[render] textures module unavailable', e));
}

function baseMaterial(opts) {
  const m = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xffffff,
    map: opts.map ?? null,
    normalMap: opts.normalMap ?? null,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    emissiveMap: opts.emissiveMap ?? null,
    roughnessMap: opts.roughnessMap ?? null,
    aoMap: opts.aoMap ?? null,
    vertexColors: !!opts.vertexColors,
    side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    alphaTest: opts.alphaTest ?? 0,
    alphaMap: opts.alphaMap ?? null,
    flatShading: !!opts.flatShading,
  });
  if (opts.normalScale !== undefined) {
    const s = opts.normalScale;
    m.normalScale = typeof s === 'number' ? new THREE.Vector2(s, s) : s;
  }
  if (opts.depthWrite !== undefined) m.depthWrite = opts.depthWrite;
  if (opts.envMapIntensity !== undefined) m.envMapIntensity = opts.envMapIntensity;
  if (opts.name) m.name = opts.name;
  return m;
}

/**
 * Painterly PBR material factory. Returns a THREE.MeshStandardMaterial patched with
 * brush-stroke albedo/roughness variation, global wetness, height fog and wind sway.
 * opts: { color, map, normalMap, roughness, metalness, emissive, emissiveIntensity, emissiveMap,
 *   vertexColors, side, transparent, opacity, alphaTest, alphaMap, depthWrite,
 *   brush=0.6, triplanar=null (texture key), triplanarScale=0.5, wet=0.5, moss=0, dirt=0,
 *   wind='none'|'trunk'|'branch'|'leaf'|'grass'|'vine'|'cloth', windStrength=1, translucency=0,
 *   instanced=false, flatShading=false, name }
 * Extra opts: roughnessMap, aoMap, normalScale, envMapIntensity, puddles=1 (0 disables puddles),
 *   dirtHeight=0.5 (m), mossColor, dirtColor, windHeightScale=1 (1/m multiplier for wind
 *   height response, e.g. 0.5 for 2x taller trees), flutter=1, skin=false, sss=0.6, pale=0.
 */
export function paintedMaterial(opts = {}) {
  const m = baseMaterial(opts);
  m.userData.painted = { ...opts };
  const windMode = WIND_MODES[opts.wind || 'none'] ?? 0;
  const translucency = opts.translucency ?? 0;
  const pale = opts.pale ?? 0;
  const skin = !!opts.skin;
  const triKey = opts.triplanar || null;

  const uniforms = {
    dlbBrushTex: { value: brushTexture() },
    dlbPaint: { value: new THREE.Vector4(opts.brush ?? 0.6, opts.wet ?? 0.5, opts.moss ?? 0, opts.dirt ?? 0) },
    dlbPaint2: { value: new THREE.Vector4(opts.windStrength ?? 1, translucency, opts.triplanarScale ?? 0.5, pale) },
    dlbPaint3: { value: new THREE.Vector4(opts.sss ?? 0.6, opts.dirtHeight ?? 0.5, opts.puddles ?? 1, opts.rim ?? 0) },
    dlbWindParams: { value: new THREE.Vector4(opts.windHeightScale ?? 1, opts.flutter ?? 1, opts.windPhase ?? 0, 0) },
    dlbMossColor: { value: new THREE.Color(opts.mossColor ?? 0x34431f) },
    dlbDirtColor: { value: new THREE.Color(opts.dirtColor ?? 0x3a2f24) },
  };
  if (triKey) {
    uniforms.dlbTriTex = { value: null };
    triplanarTexture(triKey, uniforms.dlbTriTex);
  }
  const defines = [];
  defines.push(`#define DLB_WIND ${windMode}`);
  if (triKey) defines.push('#define DLB_TRIPLANAR');
  if (translucency > 0) defines.push('#define DLB_TRANSLUCENT');
  if (skin) defines.push('#define DLB_SKIN');
  if (pale > 0 || opts.paleCapable) defines.push('#define DLB_PALE');
  const defStr = defines.join('\n') + '\n';
  const cacheKey = 'dlbPainted|' + defines.join('|');

  m.userData.uniforms = uniforms;
  m.userData.dlbWindMode = windMode;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = defStr + shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_COMMON)
      .replace('#include <project_vertex>', VERT_PROJECT);
    shader.fragmentShader = defStr + shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_COMMON)
      .replace('#include <lights_physical_pars_fragment>', LIGHTS_PHYSICAL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_ALBEDO)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGHNESS)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMISSIVE)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + FRAG_TRANSLUCENT_END);
  };
  m.customProgramCacheKey = () => cacheKey;
  return m;
}

/** Alpha-tested, double-sided, translucent, wind-swayed foliage (leaf cards, grass, ferns). */
export function foliageMaterial(opts = {}) {
  return paintedMaterial({
    alphaTest: 0.5, side: THREE.DoubleSide, wind: 'leaf', translucency: 0.5, roughness: 0.8, brush: 0.5, wet: 0.6, puddles: 0,
    ...opts,
  });
}

/** Skin with soft wrap lighting / fake subsurface; opts as paintedMaterial plus { pale=0 (ghost pallor), wetness }. */
export function skinMaterial(opts = {}) {
  const o = { roughness: 0.6, brush: 0.3, skin: true, sss: 0.65, puddles: 0, paleCapable: true, ...opts };
  if (opts.wetness !== undefined) o.wet = opts.wetness;
  else if (o.wet === undefined) o.wet = 0.15;
  return paintedMaterial(o);
}

/** Change painted-material parameters at runtime: {brush, wet, moss, dirt, windStrength, translucency, pale, sss}. */
export function setPaintedParams(material, p = {}) {
  const u = material?.userData?.uniforms;
  if (!u) return;
  if (p.brush !== undefined) u.dlbPaint.value.x = p.brush;
  if (p.wet !== undefined) u.dlbPaint.value.y = p.wet;
  if (p.moss !== undefined) u.dlbPaint.value.z = p.moss;
  if (p.dirt !== undefined) u.dlbPaint.value.w = p.dirt;
  if (p.windStrength !== undefined) u.dlbPaint2.value.x = p.windStrength;
  if (p.translucency !== undefined) u.dlbPaint2.value.y = p.translucency;
  if (p.pale !== undefined) u.dlbPaint2.value.w = p.pale;
  if (p.sss !== undefined) u.dlbPaint3.value.x = p.sss;
  if (p.rim !== undefined) u.dlbPaint3.value.w = p.rim;
}

// ---------------------------------------------------------------------------
// Wind-aware shadow depth materials
// ---------------------------------------------------------------------------
const _depthCache = new WeakMap();
/** A MeshDepthMaterial that applies the same wind displacement (and alpha test) as `material`. */
export function getWindDepthMaterial(material) {
  if (_depthCache.has(material)) return _depthCache.get(material);
  const mode = material.userData?.dlbWindMode || 0;
  const u = material.userData?.uniforms;
  const d = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: material.map,
    alphaMap: material.alphaMap,
    alphaTest: material.alphaTest,
    side: material.side,
  });
  const defStr = `#define DLB_DEPTH\n#define DLB_WIND ${mode}\n`;
  d.onBeforeCompile = (shader) => {
    if (u) {
      shader.uniforms.dlbPaint2 = u.dlbPaint2;
      shader.uniforms.dlbWindParams = u.dlbWindParams;
    }
    shader.vertexShader = defStr + shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_COMMON)
      .replace('#include <project_vertex>', VERT_PROJECT);
  };
  d.customProgramCacheKey = () => 'dlbDepth|' + mode;
  _depthCache.set(material, d);
  return d;
}

/** Give every wind-animated mesh under `root` a matching shadow depth material (call once after building). */
export function applyWindShadows(root) {
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    if (o.material?.userData?.dlbWindMode > 0 && o.castShadow) o.customDepthMaterial = getWindDepthMaterial(o.material);
  });
  return root;
}

/** Unlit additive glow sprite material (lamp halos, fireflies). */
export function glowMaterial(color = 0xffcc88, opacity = 1) {
  return new THREE.SpriteMaterial({
    color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    map: glowTexture(), fog: true,
  });
}
