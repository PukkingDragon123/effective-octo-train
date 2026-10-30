// Rendering module public API (contract: docs/ARCHITECTURE.md "render").
//
// Internals:
//   uniforms.js   GLOBAL_UNIFORMS (+ dlb* aliases injected into every material)
//   Fog.js        ShaderChunk overrides (height fog, noise mist, headlight/lamp scattering)
//   Materials.js  paintedMaterial / foliageMaterial / skinMaterial (+ wind shadow helpers)
//   PostFX.js     scene RT -> glass -> painterly -> bloom -> shafts -> grade -> CAS sharpen/output
//                 (Painterly.js, PostShaders.js)
//   caps.js       renderer caps, max-anisotropy helpers (applied to every material at compile)
//   Sky.js        sky dome, time of day, lights, weather, grade targets
//   LightPool.js  pooled real lights + glows + ground pools + flicker; Beams.js volumetric cones
//   Particles.js  GPU instanced particle emitters
//   Silhouette.js silhouetteMaterial: fog-aware painted 2D flats (distant tree lines)
import * as THREE from 'three';
import { GLOBAL_UNIFORMS, SHADER_GLOBALS, injectGlobals } from './uniforms.js';
import { installFogChunks, installMaterialInjection } from './Fog.js';
import { paintedMaterial, foliageMaterial, skinMaterial, glowMaterial, setPaintedParams, getWindDepthMaterial, applyWindShadows, setMaterialDebug } from './Materials.js';
import { postfx } from './PostFX.js';
import { sky } from './Sky.js';
import { lightPool } from './LightPool.js';
import { particles } from './Particles.js';
import { createVolumetricBeam } from './Beams.js';
import { silhouetteMaterial } from './Silhouette.js';
import { brushTexture, canvasTexture, glowTexture } from './noiseTex.js';
import { RENDER_CAPS, captureCaps, crispTexture, crispMaterialTextures } from './caps.js';
import { bus } from '../core/Events.js';
import { settings } from '../core/Settings.js';

export {
  GLOBAL_UNIFORMS, SHADER_GLOBALS, injectGlobals,
  paintedMaterial, foliageMaterial, skinMaterial, glowMaterial, setPaintedParams, getWindDepthMaterial, applyWindShadows, setMaterialDebug,
  postfx, sky, lightPool, particles, createVolumetricBeam, silhouetteMaterial,
  brushTexture, canvasTexture, glowTexture,
  RENDER_CAPS, crispTexture, crispMaterialTextures,
};

const _dir = new THREE.Vector3();

/** Push per-frame values into GLOBAL_UNIFORMS (called by installRendering's update hook). */
export function updateGlobalUniforms(engine) {
  GLOBAL_UNIFORMS.uTime.value = engine.time;
  GLOBAL_UNIFORMS.uCameraPos.value.copy(engine.camera.position);
  // keep three's own fog values in sync (anything reading scene.fog / fogColor)
  const f = engine.scene.fog;
  if (f) {
    f.color.copy(GLOBAL_UNIFORMS.uFogColor.value);
    if (f.isFogExp2) f.density = GLOBAL_UNIFORMS.uFogDensity.value;
  }
  // normalise the headlight direction set by vehicles
  const hd = GLOBAL_UNIFORMS.uHeadlightDir.value;
  if (Math.abs(hd.lengthSq() - 1) > 1e-4 && hd.lengthSq() > 0) hd.normalize();
}

let _installed = false;
/**
 * Install the rendering stack: shader chunk overrides, post pipeline, sky, light pool,
 * particles. Called once at boot by main.js. Returns { postfx, sky, lightPool, particles }.
 */
export function installRendering(engine) {
  if (_installed) return { postfx, sky, lightPool, particles };
  _installed = true;
  installFogChunks();
  installMaterialInjection();
  const { renderer, scene } = engine;
  captureCaps(renderer); // max anisotropy for every material texture (see caps.js)
  // fog defines must be active for every built-in material: values are driven by Sky
  scene.fog = new THREE.FogExp2(GLOBAL_UNIFORMS.uFogColor.value.getHex(), GLOBAL_UNIFORMS.uFogDensity.value);
  scene.background = null; // the sky dome covers everything
  renderer.toneMapping = THREE.NoToneMapping; // PostFX does its own grade
  renderer.setClearColor(0x000000, 1);
  postfx.sky = sky;
  // headlight scattering ray-march steps by quality
  const applyQuality = () => {
    const preset = settings.get('graphicsPreset') || 'high';
    const steps = { low: 4, medium: 6, high: 8, ultra: 10 }[preset] ?? 8;
    GLOBAL_UNIFORMS.uHeadlightCone.value.w = settings.get('volumetrics') === false ? Math.min(steps, 4) : steps;
  };
  applyQuality();
  settings.onChange(applyQuality);
  scene.add(sky.group, lightPool.group, particles.group);
  particles.setViewportHeight(engine.height * engine.pixelRatio);
  bus.on('engine:resize', ({ height, pixelRatio }) => particles.setViewportHeight(height * pixelRatio));
  engine.onUpdate(
    (dt) => {
      updateGlobalUniforms(engine);
      sky.update(dt, engine.camera);
      lightPool.update(dt, engine.camera);
      particles.update(dt, engine.camera);
    },
    80,
  );
  engine.renderPipeline = (r, s, camera, dt) => postfx.render(r, s, camera, dt);
  return { postfx, sky, lightPool, particles };
}
