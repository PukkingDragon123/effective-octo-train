// Shared global uniforms. Every patched material and every custom shader reads these.
// The fog / painted-material shader code uses `dlb*`-prefixed names that point at the
// SAME `{value}` objects, so other modules' ShaderMaterials can freely declare their own
// `uTime` etc. without colliding with the injected fog code.
import * as THREE from 'three';

/** Shared uniforms referenced by every patched material / custom shader. Update via updateGlobalUniforms(). */
export const GLOBAL_UNIFORMS = {
  uTime: { value: 0 },
  uHour: { value: 21 },
  uWetness: { value: 0.6 }, // 0 dry .. 1 soaked (road puddles, darkened albedo)
  uRain: { value: 0 }, // current rain intensity 0..1
  uWindDir: { value: new THREE.Vector2(1, 0.3).normalize() },
  uWindStrength: { value: 0.35 },
  uFogColor: { value: new THREE.Color(0x0b1016) },
  uFogDensity: { value: 0.035 },
  uFogHeight: { value: 0.0 }, // world Y where height fog is densest
  uFogHeightFalloff: { value: 0.12 },
  uCameraPos: { value: new THREE.Vector3() },
  uHeadlightPos: { value: new THREE.Vector3() }, // world-space headlight origin (taxi / bike)
  uHeadlightDir: { value: new THREE.Vector3(0, 0, -1) },
  uHeadlightOn: { value: 0 }, // 0..1
  uSurreal: { value: 0 }, // 0..1 surreal phase tint
  uDawn: { value: 0 }, // 0..1 dawn progress
  // ---- additions (render module) ----------------------------------------------
  /** Extra density of the ground-hugging height fog (per metre at uFogHeight). */
  uFogHeightDensity: { value: 0.06 },
  /** 0..1 how patchy / drifting the fog is (3D noise modulation). */
  uFogNoise: { value: 0.6 },
  /** Dense ground mist hugging the road / pooling in dips: density at uFogHeight and its falloff (1/m). */
  uGroundMist: { value: 0.12 },
  uGroundMistFalloff: { value: 0.9 },
  /** Linear colour * strength of the light the headlights scatter into fog. */
  uHeadlightColor: { value: new THREE.Color(0.88, 0.94, 1.0).multiplyScalar(0.13) },
  /** x = cos(outer half-angle), y = cos(inner half-angle), z = range (m), w = ray-march steps. */
  uHeadlightCone: { value: new THREE.Vector4(Math.cos(0.5), Math.cos(0.2), 46, 8) },
  /** Direction TOWARD the sun / moon (world) and the colour they scatter into fog (forward lobe). */
  uSunDir: { value: new THREE.Vector3(0.3, -0.2, -1).normalize() },
  uSunScatter: { value: new THREE.Color(0, 0, 0) },
  uMoonDir: { value: new THREE.Vector3(0.4, 0.6, -0.5).normalize() },
  uMoonScatter: { value: new THREE.Color(0.02, 0.03, 0.04) },
  /** Nearest lamps for fog in-scattering: xyz = world pos, w = range (m). Driven by lightPool. */
  uLampPos: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  /** rgb = linear colour * intensity for fog in-scatter, a = unused. */
  uLampCol: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  /** Ambient light level (0..1-ish), used by particles / custom unlit shaders to sit in the scene. */
  uAmbient: { value: new THREE.Color(0.02, 0.03, 0.035) },
  /** Moon / sun light colour * intensity, for custom shaders. */
  uMoonLight: { value: new THREE.Color(0.05, 0.07, 0.1) },
  uSunLight: { value: new THREE.Color(0, 0, 0) },
  /** Brief global lightning / flash term (sky + fog), 0..1. */
  uFlash: { value: 0 },
  /** Sky colours (linear) for cheap environment reflections on wet / glossy surfaces. */
  uSkyZenith: { value: new THREE.Color(0.002, 0.004, 0.005) },
  uSkyHorizon: { value: new THREE.Color(0.01, 0.02, 0.02) },
};

/** dlb-prefixed aliases used by the injected shader code (same value objects). */
export const SHADER_GLOBALS = {
  dlbTime: GLOBAL_UNIFORMS.uTime,
  dlbHour: GLOBAL_UNIFORMS.uHour,
  dlbWetness: GLOBAL_UNIFORMS.uWetness,
  dlbRain: GLOBAL_UNIFORMS.uRain,
  dlbWindDir: GLOBAL_UNIFORMS.uWindDir,
  dlbWindStrength: GLOBAL_UNIFORMS.uWindStrength,
  dlbFogColor: GLOBAL_UNIFORMS.uFogColor,
  dlbFogDensity: GLOBAL_UNIFORMS.uFogDensity,
  dlbFogHeight: GLOBAL_UNIFORMS.uFogHeight,
  dlbFogHeightFalloff: GLOBAL_UNIFORMS.uFogHeightFalloff,
  dlbFogHeightDensity: GLOBAL_UNIFORMS.uFogHeightDensity,
  dlbFogNoise: GLOBAL_UNIFORMS.uFogNoise,
  dlbGroundMist: GLOBAL_UNIFORMS.uGroundMist,
  dlbGroundMistFalloff: GLOBAL_UNIFORMS.uGroundMistFalloff,
  dlbHeadlightPos: GLOBAL_UNIFORMS.uHeadlightPos,
  dlbHeadlightDir: GLOBAL_UNIFORMS.uHeadlightDir,
  dlbHeadlightOn: GLOBAL_UNIFORMS.uHeadlightOn,
  dlbHeadlightColor: GLOBAL_UNIFORMS.uHeadlightColor,
  dlbHeadlightCone: GLOBAL_UNIFORMS.uHeadlightCone,
  dlbSunDir: GLOBAL_UNIFORMS.uSunDir,
  dlbSunScatter: GLOBAL_UNIFORMS.uSunScatter,
  dlbMoonDir: GLOBAL_UNIFORMS.uMoonDir,
  dlbMoonScatter: GLOBAL_UNIFORMS.uMoonScatter,
  dlbLampPos: GLOBAL_UNIFORMS.uLampPos,
  dlbLampCol: GLOBAL_UNIFORMS.uLampCol,
  dlbSurreal: GLOBAL_UNIFORMS.uSurreal,
  dlbDawn: GLOBAL_UNIFORMS.uDawn,
  dlbAmbient: GLOBAL_UNIFORMS.uAmbient,
  dlbFlash: GLOBAL_UNIFORMS.uFlash,
  dlbSkyZenith: GLOBAL_UNIFORMS.uSkyZenith,
  dlbSkyHorizon: GLOBAL_UNIFORMS.uSkyHorizon,
};

/** Add the dlb* global uniforms to a uniforms object (never overwrites existing keys). */
export function injectGlobals(uniforms) {
  if (!uniforms) return uniforms;
  for (const k in SHADER_GLOBALS) if (!(k in uniforms)) uniforms[k] = SHADER_GLOBALS[k];
  return uniforms;
}
