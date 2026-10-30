// Global fog: replaces three's fog ShaderChunks so EVERY built-in material (and any
// custom ShaderMaterial that includes the fog chunks with `fog: true`) gets:
//   exponential distance fog + analytic height fog (denser in valleys) + drifting 3D
//   noise mist + sun/moon forward scattering + headlight-cone scattering (ray-marched)
//   + analytic in-scattering around the nearest lamps.
//
// The extra uniforms are injected into every material at compile time through a
// Material.prototype `onBeforeCompile` accessor (wrapping any user onBeforeCompile).
import * as THREE from 'three';
import { DLB_COMMON, DLB_GLOBALS_PARS, DLB_FOG_COMMON, DLB_HEADLIGHT_FN } from './glsl.js';
import { injectGlobals } from './uniforms.js';
import { captureCaps, crispMaterialTextures } from './caps.js';
import { installLightingPatches } from './ShaderPatches.js';

let chunksInstalled = false;
let protoInstalled = false;

export function installFogChunks() {
  if (chunksInstalled) return;
  chunksInstalled = true;
  installLightingPatches(); // skip lights / shadow lookups that are dark (no image change)
  const SC = THREE.ShaderChunk;
  SC.dlb_common = DLB_COMMON;
  SC.dlb_globals = DLB_GLOBALS_PARS;
  SC.dlb_fog_common = DLB_FOG_COMMON;
  SC.dlb_headlight = DLB_HEADLIGHT_FN;

  SC.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vDlbFogWP;
#endif
`;
  SC.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vDlbFogWP = ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
#endif
`;
  SC.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vDlbFogWP;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  #include <dlb_common>
  #include <dlb_globals>
  #include <dlb_fog_common>
#endif
`;
  SC.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = dlbApplyFog( gl_FragColor.rgb, vDlbFogWP, gl_FragCoord.xy );
#endif
`;
}

// ---------------------------------------------------------------------------
// Global uniform injection for every material.
// ---------------------------------------------------------------------------
const userObc = new WeakMap();

function defaultObc(shader, renderer) {
  injectGlobals(shader.uniforms);
  // crisp textures: max anisotropic filtering on everything a material samples
  captureCaps(renderer);
  if (this && this.isMaterial) crispMaterialTextures(this);
  // `this` is the material when three calls material.onBeforeCompile(...)
  if (this && this.blending === THREE.AdditiveBlending && this.fog) {
    shader.fragmentShader = '#define DLB_FOG_ADDITIVE\n' + shader.fragmentShader;
  }
}

export function installMaterialInjection() {
  if (protoInstalled) return;
  protoInstalled = true;
  const proto = THREE.Material.prototype;
  Object.defineProperty(proto, 'onBeforeCompile', {
    configurable: true,
    enumerable: false,
    get() {
      return userObc.get(this) || defaultObc;
    },
    set(fn) {
      if (!fn || fn === defaultObc) {
        userObc.delete(this);
        return;
      }
      if (fn.__dlbWrapped) {
        userObc.set(this, fn);
        return;
      }
      const wrapped = function (shader, renderer) {
        defaultObc.call(this, shader, renderer);
        return fn.call(this, shader, renderer);
      };
      wrapped.__dlbWrapped = true;
      wrapped.__dlbInner = fn;
      // keep three's default program cache key meaningful (it uses onBeforeCompile.toString())
      wrapped.toString = () => fn.toString();
      userObc.set(this, wrapped);
    },
  });
  const baseKey = proto.customProgramCacheKey;
  proto.customProgramCacheKey = function () {
    const k = baseKey.call(this);
    return this.blending === THREE.AdditiveBlending && this.fog ? 'dlbAdd|' + k : k;
  };
}

// Install as early as possible (module import) so materials created at import time by
// other modules still get the accessor; installRendering calls these again (no-op).
installFogChunks();
installMaterialInjection();
